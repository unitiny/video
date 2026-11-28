export interface RealVideoCacheResult {
  video: HTMLVideoElement | null;
  frames: HTMLCanvasElement[];
}

const cacheBySrc = new Map<string, Promise<RealVideoCacheResult>>();

/**
 * Loads a same-origin live-action MP4 via Blob URL for instant local seeking
 * and extracts a portrait-cropped frame buffer for smooth Canvas2D scrubbing & MP4 export.
 */
export function loadRealVideoFrameCache(
  src: string,
  sampleCount = 42,
  maxSec = 2.65,
  outW = 480,
  outH = 854,
  onPartialReady?: (partial: RealVideoCacheResult) => void,
  minSec = 0.05,
  cropCenterRatio = 0.5,
  timeoutMs = 20000
): Promise<RealVideoCacheResult> {
  const cacheKey = `${src}|${sampleCount}|${outW}x${outH}|${minSec}|${maxSec}|${cropCenterRatio}`;
  const existing = cacheBySrc.get(cacheKey);
  if (existing) return existing;

  const promise = (async (): Promise<RealVideoCacheResult> => {
    if (typeof document === 'undefined') {
      return { video: null, frames: [] };
    }

    let objectUrl: string | null = null;
    try {
      const resp = await fetch(src);
      if (resp.ok) {
        const blob = await resp.blob();
        objectUrl = URL.createObjectURL(blob);
      }
    } catch {
      // Fallback to direct URL if fetch fails
    }

    return new Promise<RealVideoCacheResult>((resolve) => {
      const video = document.createElement('video');
      video.muted = true;
      video.playsInline = true;
      video.setAttribute('webkit-playsinline', 'true');
      video.preload = 'auto';
      video.crossOrigin = 'anonymous';
      video.src = objectUrl ?? src;

      const frames: HTMLCanvasElement[] = [];
      let finished = false;
      const cleanup = () => {
        if (objectUrl) {
          URL.revokeObjectURL(objectUrl);
          objectUrl = null;
        }
      };
      const finish = (res: RealVideoCacheResult) => {
        if (finished) return;
        finished = true;
        cleanup();
        resolve(res);
      };

      const timeoutId = setTimeout(() => {
        finish({ video, frames: [...frames] });
      }, timeoutMs);

      const captureCurrentFrame = (): HTMLCanvasElement | null => {
        if (!video.videoWidth || !video.videoHeight) return null;
        const c = document.createElement('canvas');
        c.width = outW;
        c.height = outH;
        const cx = c.getContext('2d');
        if (!cx) return null;

        const targetRatio = outW / outH;
        const srcRatio = video.videoWidth / video.videoHeight;
        let sw = video.videoWidth;
        let sh = video.videoHeight;
        let sx = 0;
        let sy = 0;
        if (srcRatio > targetRatio) {
          sw = sh * targetRatio;
          sx = (video.videoWidth - sw) * cropCenterRatio;
        } else {
          sh = sw / targetRatio;
          sy = (video.videoHeight - sh) * 0.5;
        }
        cx.drawImage(video, sx, sy, sw, sh, 0, 0, outW, outH);
        return c;
      };

      const seekToTime = (timeSec: number): Promise<void> =>
        new Promise((resSeek) => {
          let done = false;
          const onSeeked = () => {
            if (done) return;
            done = true;
            video.removeEventListener('seeked', onSeeked);
            resSeek();
          };
          video.addEventListener('seeked', onSeeked);
          try {
            video.currentTime = Math.min(
              Math.max(0, timeSec),
              Math.max(0.05, (video.duration || 5) - 0.05)
            );
          } catch {
            onSeeked();
          }
          setTimeout(onSeeked, 250);
        });

      video.addEventListener(
        'loadeddata',
        async () => {
          const dur = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 5;
          const safeStart = Math.min(minSec, Math.max(0, dur - 0.6));
          const safeEnd = Math.max(safeStart + 0.4, Math.min(maxSec, dur - 0.08));

          if (safeStart > 0.02) {
            await seekToTime(safeStart);
          }
          const first = captureCurrentFrame();
          if (first) {
            frames.push(first);
            onPartialReady?.({ video, frames: [...frames] });
          }

          for (let i = 1; i < sampleCount; i++) {
            if (finished) break;
            const targetT = safeStart + (i / Math.max(1, sampleCount - 1)) * (safeEnd - safeStart);
            await seekToTime(targetT);
            const snap = captureCurrentFrame();
            if (snap) {
              frames.push(snap);
              if (i % 2 === 0) {
                onPartialReady?.({ video, frames: [...frames] });
              }
            }
          }
          clearTimeout(timeoutId);
          finish({ video, frames: [...frames] });
        },
        { once: true }
      );

      video.addEventListener(
        'error',
        () => {
          clearTimeout(timeoutId);
          finish({ video: null, frames: [...frames] });
        },
        { once: true }
      );

      video.load();
    });
  })();

  cacheBySrc.set(cacheKey, promise);
  return promise;
}
