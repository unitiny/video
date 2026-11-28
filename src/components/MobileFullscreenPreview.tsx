import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Maximize2,
  Minimize2,
  Pause,
  Play,
  RotateCcw,
  ShieldCheck,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
} from 'lucide-react';
import {
  ART_ASSETS,
  INTEL_ASSETS,
  INTEL_V2_ASSETS,
  INTEL_V2_VIDEO_SAMPLE,
  VIDEO_SPEC,
} from '../video/theme';
import { PROJECT_TEMPLATES } from '../video/data/fundFlowData';
import { SHOTS } from '../video/timeline';
import { renderVideoFrame, type LoadedVideoImages } from '../video/renderer/renderFrame';
import { INTEL_VIDEO_SPEC } from '../video/intel/intelData';
import { INTEL_SHOTS } from '../video/intel/intelTimeline';
import { renderIntelVideoFrame, type LoadedIntelImages } from '../video/intel/renderIntelFrame';
import { INTEL_V2_SPEC } from '../video/intelV2/intelV2Data';
import { INTEL_V2_SHOTS } from '../video/intelV2/intelV2Timeline';
import { renderIntelV2VideoFrame } from '../video/intelV2/renderIntelV2Frame';
import { loadRealVideoFrameCache } from '../video/intelV2/videoFrameCache';
import type { EpisodeManifest, LoadedEpisodeAssets } from '../video/engine/schema';
import { collectEpisodeAssetSources, compileEpisodeTimeline } from '../video/engine/timeline';
import { drawPlatformSafeZoneOverlay, renderEpisodeFrame } from '../video/engine/scenes';
import { parseJsonResponseSafe } from '../video/export/clientMp4Export';
import type { StudioProjectMode } from './VideoPlayerWorkspace';

export function buildMobilePreviewKey(
  projectMode: StudioProjectMode,
  episodeId?: string
): string {
  if (projectMode === 'episode' && episodeId) {
    return `ep_${episodeId}`;
  }
  return `mode_${projectMode}`;
}

function loadImageElement(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function isTouchMobileDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iPhone|iPad|iPod|Android|Mobile|MicroMessenger|BytedanceWebview|aweme/i.test(
    navigator.userAgent
  );
}

interface PreviewShotMarker {
  index: number;
  title: string;
  startFrame: number;
  endFrame: number;
}

interface MobileFullscreenPreviewProps {
  episodeId?: string;
  mode?: StudioProjectMode;
}

const SPEED_OPTIONS = [0.5, 1, 1.5] as const;

export const MobileFullscreenPreview: React.FC<MobileFullscreenPreviewProps> = ({
  episodeId,
  mode = 'episode',
}) => {
  const resolvedMode: StudioProjectMode = episodeId ? 'episode' : mode;
  const previewKey = buildMobilePreviewKey(resolvedMode, episodeId);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string>('');
  const [episode, setEpisode] = useState<EpisodeManifest | null>(null);
  const [episodeAssets, setEpisodeAssets] = useState<LoadedEpisodeAssets>({
    imagesBySrc: {},
    videoFramesBySrc: {},
    videosBySrc: {},
  });
  const [legacyImages, setLegacyImages] = useState<LoadedVideoImages>({});
  const [intelImages, setIntelImages] = useState<LoadedIntelImages>({});

  // Native MP4 fast-path if pre-rendered on server
  const [nativeVideoUrl, setNativeVideoUrl] = useState<string | null>(null);
  const [nativeDownloadUrl, setNativeDownloadUrl] = useState<string | null>(null);
  const isMobileDevice = useMemo(() => isTouchMobileDevice(), []);
  // Render at crisp 0.5× backing resolution (e.g. 540×960) on mobile to cut iOS WebKit GPU memory by 75%
  const canvasScale = isMobileDevice ? 0.5 : 1;

  // Playback state
  const [hasStarted, setHasStarted] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [playbackRate, setPlaybackRate] = useState<number>(1);
  const [currentFrame, setCurrentFrame] = useState(0);
  const [showHud, setShowHud] = useState(true);
  const [fitMode, setFitMode] = useState<'cover' | 'contain'>(() =>
    typeof window !== 'undefined' && window.innerWidth > window.innerHeight ? 'contain' : 'cover'
  );
  const [showSafeZone, setShowSafeZone] = useState(false);
  const [audioHint, setAudioHint] = useState<string>('');
  const [feedbackBadge, setFeedbackBadge] = useState<{
    id: number;
    kind: 'play' | 'pause' | 'step' | 'speed' | 'replay';
    label: string;
  } | null>(null);

  // Native MP4 time sync
  const [nativeTime, setNativeTime] = useState(0);
  const [nativeDuration, setNativeDuration] = useState(0);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hudTimerRef = useRef<number | null>(null);
  const feedbackTimerRef = useRef<number | null>(null);
  const hoverHudRef = useRef(false);

  // Monotonic session id prevents async audio/video.play() races when user pauses or steps rapidly
  const playSessionRef = useRef(0);
  const isPlayingRef = useRef(false);
  const frameRef = useRef(0);
  const wasPlayingBeforeScrubRef = useRef(false);
  const isScrubbingRef = useRef(false);

  isPlayingRef.current = isPlaying;
  frameRef.current = currentFrame;

  const compiledTimeline = useMemo(
    () => (episode ? compileEpisodeTimeline(episode) : null),
    [episode]
  );

  const spec = useMemo(() => {
    if (resolvedMode === 'episode' && compiledTimeline) {
      return {
        width: compiledTimeline.width,
        height: compiledTimeline.height,
        fps: compiledTimeline.fps,
        totalFrames: compiledTimeline.totalFrames,
        durationSec: compiledTimeline.durationSec,
      };
    }
    if (resolvedMode === '1120_v2' || resolvedMode === 'episode') {
      return INTEL_V2_SPEC;
    }
    if (resolvedMode === '1120_intel') {
      return INTEL_VIDEO_SPEC;
    }
    return VIDEO_SPEC;
  }, [resolvedMode, compiledTimeline]);

  const shotMarkers: PreviewShotMarker[] = useMemo(() => {
    if (resolvedMode === 'episode' && compiledTimeline) {
      return compiledTimeline.shots.map((s) => ({
        index: s.index,
        title: s.title,
        startFrame: s.startFrame,
        endFrame: s.endFrame,
      }));
    }
    if (resolvedMode === '1120_v2') {
      return INTEL_V2_SHOTS.map((s) => ({
        index: s.index,
        title: s.title,
        startFrame: s.startFrame,
        endFrame: s.endFrame,
      }));
    }
    if (resolvedMode === '1120_intel') {
      return INTEL_SHOTS.map((s) => ({
        index: s.index,
        title: s.title,
        startFrame: s.startFrame,
        endFrame: s.endFrame,
      }));
    }
    return SHOTS.map((s) => ({
      index: s.index,
      title: s.title,
      startFrame: s.startFrame,
      endFrame: s.endFrame,
    }));
  }, [resolvedMode, compiledTimeline]);

  const audioUrl = useMemo(() => {
    if (resolvedMode === 'episode' && episodeId) {
      return `/api/audio/bgm.wav?episodeId=${encodeURIComponent(episodeId)}`;
    }
    const track =
      resolvedMode === '1120_v2'
        ? '1120_v2'
        : resolvedMode === '1120_intel'
          ? '1120'
          : '1117';
    return `/api/audio/bgm.wav?track=${encodeURIComponent(track)}`;
  }, [resolvedMode, episodeId]);

  const displayTitle = useMemo(() => {
    if (resolvedMode === 'episode' && episode) return episode.title;
    if (resolvedMode === '1120_v2') return '11.20 盘前风向（v2 精修爆款版）';
    if (resolvedMode === '1120_intel') return '11.20 盘前风向（v1 存档版）';
    if (resolvedMode === 'morning_brief') return '11.19 盘前早报';
    return '11.17 收盘资金流向复刻';
  }, [resolvedMode, episode]);

  const flashFeedback = useCallback(
    (kind: 'play' | 'pause' | 'step' | 'speed' | 'replay', label: string) => {
      if (feedbackTimerRef.current) window.clearTimeout(feedbackTimerRef.current);
      setFeedbackBadge({ id: Date.now(), kind, label });
      feedbackTimerRef.current = window.setTimeout(() => {
        setFeedbackBadge(null);
      }, 650);
    },
    []
  );

  const clearHudHideTimer = useCallback(() => {
    if (hudTimerRef.current) {
      window.clearTimeout(hudTimerRef.current);
      hudTimerRef.current = null;
    }
  }, []);

  const scheduleHudHide = useCallback(
    (delayMs = 2600) => {
      clearHudHideTimer();
      hudTimerRef.current = window.setTimeout(() => {
        if (isPlayingRef.current && !hoverHudRef.current && !isScrubbingRef.current) {
          setShowHud(false);
        }
      }, delayMs);
    },
    [clearHudHideTimer]
  );

  useEffect(() => {
    return () => {
      clearHudHideTimer();
      if (feedbackTimerRef.current) window.clearTimeout(feedbackTimerRef.current);
    };
  }, [clearHudHideTimer]);

  // 1) Probe native MP4 cache + load episode manifest & visual assets
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError('');
    setNativeVideoUrl(null);
    setNativeDownloadUrl(null);
    setHasStarted(false);
    setIsPlaying(false);
    setCurrentFrame(0);
    setNativeTime(0);

    async function bootstrap() {
      try {
        try {
          const statusRes = await fetch(
            `/api/mobile-preview/${encodeURIComponent(previewKey)}/status`,
            { cache: 'no-store' }
          );
          const statusJson = statusRes.ok
            ? await parseJsonResponseSafe<{
                ready?: boolean;
                videoUrl?: string;
                downloadUrl?: string;
              }>(statusRes)
            : null;
          if (!cancelled && statusJson?.ready && statusJson.videoUrl) {
            setNativeVideoUrl(statusJson.videoUrl);
            setNativeDownloadUrl(statusJson.downloadUrl ?? statusJson.videoUrl);
            if (resolvedMode === 'episode' && episodeId) {
              const epRes = await fetch(`/api/episodes/${encodeURIComponent(episodeId)}`, {
                cache: 'no-store',
              });
              const manifest = epRes.ok
                ? await parseJsonResponseSafe<EpisodeManifest>(epRes)
                : null;
              if (!cancelled && manifest) setEpisode(manifest);
            }
            if (!cancelled) setLoading(false);
            return;
          }
        } catch {
          // Continue with live Canvas + server WAV playback
        }

        if (resolvedMode === 'episode') {
          let targetId = episodeId;
          if (!targetId) {
            const listRes = await fetch('/api/episodes', { cache: 'no-store' });
            const listJson = listRes.ok
              ? await parseJsonResponseSafe<{ episodes?: Array<{ id: string }> }>(listRes)
              : null;
            targetId = listJson?.episodes?.[0]?.id;
          }
          if (!targetId) {
            throw new Error('未找到可预览的剧集');
          }
          const res = await fetch(`/api/episodes/${encodeURIComponent(targetId)}`, {
            cache: 'no-store',
          });
          const manifest = res.ok ? await parseJsonResponseSafe<EpisodeManifest>(res) : null;
          if (!manifest || !Array.isArray(manifest.scenes) || manifest.scenes.length === 0) {
            throw new Error(`剧集 "${targetId}" 不存在或内容为空`);
          }
          if (cancelled) return;
          setEpisode(manifest);

          const { imageSrcs, hookVideos } = collectEpisodeAssetSources(manifest);
          const imgEntries = await Promise.all(
            imageSrcs.map(async (src) => [src, await loadImageElement(src)] as const)
          );
          const imagesBySrc: Record<string, HTMLImageElement | null> = {};
          for (const [src, img] of imgEntries) imagesBySrc[src] = img;

          const videoFramesBySrc: Record<string, HTMLCanvasElement[]> = {};
          const videosBySrc: Record<string, HTMLVideoElement | null> = {};

          if (isMobileDevice) {
            // Mobile fast-start: show poster & ready player immediately (<1s) without blocking on iOS video seeks
            if (!cancelled) {
              setEpisodeAssets({ imagesBySrc, videoFramesBySrc, videosBySrc });
              setLoading(false);
            }
            // Lightweight background warm-up (capped at 16 small frames to prevent iOS WebKit OOM reload)
            void Promise.all(
              hookVideos.map(async (hv) => {
                const mobileCount = Math.min(16, hv.sample.sampleCount);
                const mobileW = Math.min(360, hv.sample.outW);
                const mobileH = Math.min(640, hv.sample.outH);
                const cache = await loadRealVideoFrameCache(
                  hv.videoSrc,
                  mobileCount,
                  hv.sample.maxSec,
                  mobileW,
                  mobileH,
                  (partial) => {
                    if (!cancelled) {
                      setEpisodeAssets((prev) => ({
                        ...prev,
                        videoFramesBySrc: {
                          ...prev.videoFramesBySrc,
                          [hv.videoSrc]: partial.frames,
                        },
                        videosBySrc: {
                          ...prev.videosBySrc,
                          [hv.videoSrc]: partial.video,
                        },
                      }));
                    }
                  },
                  hv.sample.minSec,
                  hv.sample.cropCenterRatio,
                  6000
                );
                if (!cancelled) {
                  setEpisodeAssets((prev) => ({
                    ...prev,
                    videoFramesBySrc: {
                      ...prev.videoFramesBySrc,
                      [hv.videoSrc]: cache.frames,
                    },
                    videosBySrc: {
                      ...prev.videosBySrc,
                      [hv.videoSrc]: cache.video,
                    },
                  }));
                }
              })
            );
          } else {
            await Promise.all(
              hookVideos.map(async (hv) => {
                const cache = await loadRealVideoFrameCache(
                  hv.videoSrc,
                  hv.sample.sampleCount,
                  hv.sample.maxSec,
                  hv.sample.outW,
                  hv.sample.outH,
                  undefined,
                  hv.sample.minSec,
                  hv.sample.cropCenterRatio
                );
                videoFramesBySrc[hv.videoSrc] = cache.frames;
                videosBySrc[hv.videoSrc] = cache.video;
              })
            );

            if (!cancelled) {
              setEpisodeAssets({ imagesBySrc, videoFramesBySrc, videosBySrc });
              setLoading(false);
            }
          }
        } else if (resolvedMode === '1120_v2' || resolvedMode === '1120_intel') {
          const [
            memeKeyDay,
            eventAnthropic,
            eventPcb,
            eventRobot,
            realNyseClap,
            realTraderGesturing,
            realTraderShocked,
            eventMuskRealKitchen,
            realKeyDayPoster,
          ] = await Promise.all([
            loadImageElement(INTEL_ASSETS.memeKeyDay),
            loadImageElement(INTEL_ASSETS.eventAnthropic),
            loadImageElement(INTEL_ASSETS.eventPcb),
            loadImageElement(INTEL_ASSETS.eventRobot),
            loadImageElement(INTEL_V2_ASSETS.realNyseClap),
            loadImageElement(INTEL_V2_ASSETS.realTraderGesturing),
            loadImageElement(INTEL_V2_ASSETS.realTraderShocked),
            loadImageElement(INTEL_V2_ASSETS.eventMuskRealKitchen),
            loadImageElement(INTEL_V2_ASSETS.realKeyDayPoster),
          ]);
          const baseIntel: LoadedIntelImages = {
            memeKeyDay,
            eventAnthropic,
            eventPcb,
            eventRobot,
            realNyseClap,
            realTraderGesturing,
            realTraderShocked,
            eventMuskRealKitchen,
            realKeyDayPoster,
            realKeyDayVideo: null,
            realKeyDayFrames: [],
          };
          if (resolvedMode === '1120_v2' && isMobileDevice) {
            if (!cancelled) {
              setIntelImages(baseIntel);
              setLoading(false);
            }
            void loadRealVideoFrameCache(
              INTEL_V2_ASSETS.realKeyDayVideo,
              16,
              INTEL_V2_VIDEO_SAMPLE.maxSec,
              360,
              640,
              undefined,
              INTEL_V2_VIDEO_SAMPLE.minSec,
              INTEL_V2_VIDEO_SAMPLE.cropCenterRatio,
              6000
            ).then((cache) => {
              if (!cancelled) {
                setIntelImages((prev) => ({
                  ...prev,
                  realKeyDayVideo: cache.video,
                  realKeyDayFrames: cache.frames,
                }));
              }
            });
          } else {
            let realKeyDayVideo: HTMLVideoElement | null = null;
            let realKeyDayFrames: HTMLCanvasElement[] = [];
            if (resolvedMode === '1120_v2') {
              const cache = await loadRealVideoFrameCache(
                INTEL_V2_ASSETS.realKeyDayVideo,
                INTEL_V2_VIDEO_SAMPLE.sampleCount,
                INTEL_V2_VIDEO_SAMPLE.maxSec,
                INTEL_V2_VIDEO_SAMPLE.outW,
                INTEL_V2_VIDEO_SAMPLE.outH,
                undefined,
                INTEL_V2_VIDEO_SAMPLE.minSec,
                INTEL_V2_VIDEO_SAMPLE.cropCenterRatio
              );
              realKeyDayVideo = cache.video;
              realKeyDayFrames = cache.frames;
            }
            if (!cancelled) {
              setIntelImages({
                ...baseIntel,
                realKeyDayVideo,
                realKeyDayFrames,
              });
              setLoading(false);
            }
          }
        } else {
          const [openArcher, noonSlap, twoSheep, lithographyHero, morningBrief] =
            await Promise.all([
              loadImageElement(ART_ASSETS.openArcher),
              loadImageElement(ART_ASSETS.noonSlap),
              loadImageElement(ART_ASSETS.twoSheep),
              loadImageElement(ART_ASSETS.lithographyHero),
              loadImageElement(ART_ASSETS.morningBrief),
            ]);
          if (!cancelled) {
            setLegacyImages({ openArcher, noonSlap, twoSheep, lithographyHero, morningBrief });
            setLoading(false);
          }
        }
      } catch (err) {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : '加载预览失败');
          setLoading(false);
        }
      }
    }

    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, [previewKey, resolvedMode, episodeId]);

  // Keep playbackRate synced to underlying media elements
  useEffect(() => {
    if (audioRef.current) audioRef.current.playbackRate = playbackRate;
    if (videoRef.current) videoRef.current.playbackRate = playbackRate;
  }, [playbackRate, nativeVideoUrl]);

  // 2) Render Canvas2D frame (live mode)
  useEffect(() => {
    if (nativeVideoUrl || loading) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const safeFrame = Math.max(0, Math.min(spec.totalFrames - 1, currentFrame));
    ctx.save();
    ctx.setTransform(canvasScale, 0, 0, canvasScale, 0, 0);
    if (resolvedMode === 'episode' && episode) {
      renderEpisodeFrame(ctx, safeFrame, episode, episodeAssets);
    } else if (resolvedMode === '1120_v2') {
      renderIntelV2VideoFrame(ctx, safeFrame, intelImages);
    } else if (resolvedMode === '1120_intel') {
      renderIntelVideoFrame(ctx, safeFrame, intelImages);
    } else {
      const legacyId = resolvedMode === 'morning_brief' ? 'morning_brief' : '1117_close';
      renderVideoFrame(ctx, safeFrame, PROJECT_TEMPLATES[legacyId], legacyImages);
    }

    if (showSafeZone) {
      drawPlatformSafeZoneOverlay(ctx, spec.width, spec.height);
    }
    ctx.restore();
  }, [
    nativeVideoUrl,
    loading,
    currentFrame,
    spec.totalFrames,
    spec.width,
    spec.height,
    canvasScale,
    resolvedMode,
    episode,
    episodeAssets,
    intelImages,
    legacyImages,
    showSafeZone,
  ]);

  // 3) Live Canvas + <audio> playback loop (smooth & jump-free on pause/resume/speed change)
  useEffect(() => {
    if (nativeVideoUrl || !isPlaying) return;

    const audio = audioRef.current;
    const anchorFrame = frameRef.current >= spec.totalFrames - 1 ? 0 : frameRef.current;
    const anchorWall = performance.now();
    let rafId = 0;

    const tick = () => {
      if (!isPlayingRef.current || isScrubbingRef.current) return;

      const elapsedSec = ((performance.now() - anchorWall) / 1000) * playbackRate;
      const wallExpectedSec = anchorFrame / spec.fps + elapsedSec;

      let nextFrame: number;
      if (
        audio &&
        !audio.paused &&
        audio.readyState >= 2 &&
        Number.isFinite(audio.currentTime) &&
        Math.abs(audio.currentTime - wallExpectedSec) < 0.45
      ) {
        nextFrame = Math.min(spec.totalFrames - 1, Math.floor(audio.currentTime * spec.fps));
      } else {
        nextFrame = Math.min(spec.totalFrames - 1, Math.floor(wallExpectedSec * spec.fps));
      }

      if (nextFrame !== frameRef.current) {
        setCurrentFrame(nextFrame);
      }

      if (nextFrame >= spec.totalFrames - 1) {
        playSessionRef.current += 1;
        if (audio) {
          audio.pause();
        }
        setCurrentFrame(spec.totalFrames - 1);
        setIsPlaying(false);
        setShowHud(true);
        clearHudHideTimer();
        return;
      }

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [nativeVideoUrl, isPlaying, spec.totalFrames, spec.fps, playbackRate, clearHudHideTimer]);

  // Native MP4 smooth time sync while playing
  useEffect(() => {
    if (!nativeVideoUrl || !isPlaying) return;
    let rafId = 0;
    const tick = () => {
      const video = videoRef.current;
      if (video && !video.paused) {
        setNativeTime(video.currentTime);
        rafId = requestAnimationFrame(tick);
      }
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [nativeVideoUrl, isPlaying]);

  // Unified Pause (race-safe)
  const pausePlayback = useCallback(
    (showBadge = false) => {
      playSessionRef.current += 1;
      clearHudHideTimer();
      setHasStarted(true);
      setIsPlaying(false);
      setShowHud(true);

      if (nativeVideoUrl) {
        const video = videoRef.current;
        if (video) {
          video.pause();
          setNativeTime(video.currentTime);
        }
      } else {
        const audio = audioRef.current;
        if (audio) {
          audio.pause();
          try {
            audio.currentTime = frameRef.current / spec.fps;
          } catch {
            // Ignore seek before metadata
          }
        }
      }

      if (showBadge) {
        flashFeedback('pause', '已暂停');
      }
    },
    [nativeVideoUrl, spec.fps, clearHudHideTimer, flashFeedback]
  );

  // Unified Play (race-safe, auto-rewinds if at final frame)
  const startPlayback = useCallback(
    async (showBadge = false, fromFrameOverride?: number) => {
      const session = ++playSessionRef.current;
      setHasStarted(true);
      setAudioHint('');

      if (nativeVideoUrl) {
        const video = videoRef.current;
        if (!video) return;
        const dur =
          Number.isFinite(video.duration) && video.duration > 0 ? video.duration : spec.durationSec;
        if (typeof fromFrameOverride === 'number') {
          video.currentTime = Math.max(0, Math.min(dur, fromFrameOverride / spec.fps));
          setNativeTime(video.currentTime);
        } else if (dur > 0 && video.currentTime >= dur - 0.06) {
          video.currentTime = 0;
          setNativeTime(0);
        }
        video.muted = isMuted;
        video.playbackRate = playbackRate;
        setIsPlaying(true);
        scheduleHudHide();
        if (showBadge) flashFeedback('play', '继续播放');

        try {
          await video.play();
          if (session !== playSessionRef.current) {
            video.pause();
          }
        } catch {
          if (session !== playSessionRef.current) return;
          video.muted = true;
          setIsMuted(true);
          setAudioHint('浏览器拦截了自动发声，已静音播放，点左下角喇叭可恢复声音');
          await video.play().catch(() => {});
          if (session !== playSessionRef.current) {
            video.pause();
          }
        }
        return;
      }

      // Live Canvas + <audio> mode
      const targetFrame =
        typeof fromFrameOverride === 'number'
          ? Math.max(0, Math.min(spec.totalFrames - 1, fromFrameOverride))
          : frameRef.current >= spec.totalFrames - 1
            ? 0
            : frameRef.current;

      frameRef.current = targetFrame;
      setCurrentFrame(targetFrame);
      setIsPlaying(true);
      scheduleHudHide();
      if (showBadge) flashFeedback('play', targetFrame === 0 ? '从头播放' : '继续播放');

      const audio = audioRef.current;
      if (audio) {
        audio.muted = isMuted;
        audio.playbackRate = playbackRate;
        try {
          audio.currentTime = targetFrame / spec.fps;
        } catch {
          // Ignore seek before metadata loaded
        }
        audio
          .play()
          .then(() => {
            if (session !== playSessionRef.current) {
              audio.pause();
            }
          })
          .catch(() => {
            if (session !== playSessionRef.current) return;
            setAudioHint('如未听见声音，请检查设备静音或轻点左下角喇叭图标');
          });
      }
    },
    [
      nativeVideoUrl,
      spec.totalFrames,
      spec.fps,
      spec.durationSec,
      isMuted,
      playbackRate,
      scheduleHudHide,
      flashFeedback,
    ]
  );

  const togglePlayPause = useCallback(
    (showBadge = true) => {
      if (loading || loadError) return;
      if (isPlayingRef.current) {
        pausePlayback(showBadge);
      } else {
        void startPlayback(showBadge);
      }
    },
    [loading, loadError, pausePlayback, startPlayback]
  );

  // Seek to an exact frame number (0 .. totalFrames - 1)
  const seekToFrame = useCallback(
    (rawFrame: number) => {
      const clamped = Math.max(0, Math.min(spec.totalFrames - 1, Math.round(rawFrame)));
      setHasStarted(true);
      frameRef.current = clamped;
      setCurrentFrame(clamped);

      if (nativeVideoUrl && videoRef.current) {
        const dur =
          Number.isFinite(videoRef.current.duration) && videoRef.current.duration > 0
            ? videoRef.current.duration
            : spec.durationSec;
        const nextSec = Math.max(0, Math.min(dur, clamped / spec.fps));
        try {
          videoRef.current.currentTime = nextSec;
        } catch {
          // Ignore
        }
        setNativeTime(nextSec);
        return;
      }

      if (audioRef.current) {
        try {
          audioRef.current.currentTime = clamped / spec.fps;
        } catch {
          // Ignore
        }
      }
    },
    [nativeVideoUrl, spec.totalFrames, spec.fps, spec.durationSec]
  );

  // Step exactly ±N frames (always pauses cleanly so user can inspect the target frame)
  const stepFrames = useCallback(
    (delta: number) => {
      if (loading || loadError) return;
      if (isPlayingRef.current) {
        pausePlayback(false);
      } else {
        clearHudHideTimer();
        setHasStarted(true);
        setShowHud(true);
      }

      const baseFrame = nativeVideoUrl
        ? Math.round((videoRef.current?.currentTime ?? nativeTime) * spec.fps)
        : frameRef.current;
      const targetFrame = Math.max(0, Math.min(spec.totalFrames - 1, baseFrame + delta));
      seekToFrame(targetFrame);
      flashFeedback('step', `${delta > 0 ? `+${delta}` : delta} 帧 · #${targetFrame}`);
    },
    [
      loading,
      loadError,
      pausePlayback,
      clearHudHideTimer,
      nativeVideoUrl,
      nativeTime,
      spec.fps,
      spec.totalFrames,
      seekToFrame,
      flashFeedback,
    ]
  );

  // Jump to previous or next shot boundary
  const jumpShot = useCallback(
    (direction: -1 | 1) => {
      if (loading || loadError || shotMarkers.length === 0) return;
      const wasPlaying = isPlayingRef.current;
      if (wasPlaying) pausePlayback(false);

      const curFrameNow = nativeVideoUrl
        ? Math.round((videoRef.current?.currentTime ?? nativeTime) * spec.fps)
        : frameRef.current;

      let targetShot = shotMarkers[0];
      if (direction === 1) {
        targetShot =
          shotMarkers.find((s) => s.startFrame > curFrameNow + 2) ??
          shotMarkers[shotMarkers.length - 1];
      } else {
        const prevCandidates = shotMarkers.filter((s) => s.startFrame < curFrameNow - 6);
        targetShot = prevCandidates[prevCandidates.length - 1] ?? shotMarkers[0];
      }

      seekToFrame(targetShot.startFrame);
      flashFeedback('step', `镜头 ${String(targetShot.index).padStart(2, '0')} · ${targetShot.title}`);
      if (wasPlaying) {
        void startPlayback(false, targetShot.startFrame);
      }
    },
    [
      loading,
      loadError,
      shotMarkers,
      pausePlayback,
      nativeVideoUrl,
      nativeTime,
      spec.fps,
      seekToFrame,
      flashFeedback,
      startPlayback,
    ]
  );

  const handleReplay = useCallback(() => {
    if (loading || loadError) return;
    flashFeedback('replay', '从头重播');
    void startPlayback(false, 0);
  }, [loading, loadError, startPlayback, flashFeedback]);

  const handleToggleMute = useCallback(() => {
    setIsMuted((prev) => {
      const next = !prev;
      if (videoRef.current) videoRef.current.muted = next;
      if (audioRef.current) audioRef.current.muted = next;
      return next;
    });
  }, []);

  const handleCycleSpeed = useCallback(() => {
    setPlaybackRate((prev) => {
      const idx = SPEED_OPTIONS.indexOf(prev as (typeof SPEED_OPTIONS)[number]);
      const next = SPEED_OPTIONS[(idx + 1) % SPEED_OPTIONS.length];
      flashFeedback('speed', `${next}× 倍速`);
      return next;
    });
  }, [flashFeedback]);

  // Desktop keyboard shortcuts (Space, Left/Right, Shift+Left/Right, [/], R, M, S, F)
  useEffect(() => {
    if (loading || loadError) return;
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' && (e.target as HTMLInputElement).type !== 'range') return;
      if (tag === 'TEXTAREA') return;

      if (e.code === 'Space' || e.key === 'k' || e.key === 'K') {
        e.preventDefault();
        togglePlayPause(true);
      } else if (e.key === 'ArrowLeft' || e.key === ',') {
        e.preventDefault();
        stepFrames(e.shiftKey ? -10 : -1);
      } else if (e.key === 'ArrowRight' || e.key === '.') {
        e.preventDefault();
        stepFrames(e.shiftKey ? 10 : 1);
      } else if (e.key === '[') {
        e.preventDefault();
        jumpShot(-1);
      } else if (e.key === ']') {
        e.preventDefault();
        jumpShot(1);
      } else if (e.key === 'Home' || e.key === 'r' || e.key === 'R') {
        e.preventDefault();
        handleReplay();
      } else if (e.key === 'm' || e.key === 'M') {
        e.preventDefault();
        handleToggleMute();
      } else if (e.key === 's' || e.key === 'S') {
        e.preventDefault();
        setShowSafeZone((v) => !v);
      } else if (e.key === 'f' || e.key === 'F') {
        e.preventDefault();
        setFitMode((m) => (m === 'cover' ? 'contain' : 'cover'));
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [loading, loadError, togglePlayPause, stepFrames, jumpShot, handleReplay, handleToggleMute]);

  // Stage pointer handler: Desktop click toggles play/pause cleanly; Touch toggles HUD
  const handleStageClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (loading || loadError) return;
    if (!hasStarted) {
      void startPlayback(false);
      return;
    }

    const isCoarseTouch =
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(pointer: coarse)').matches;

    if (!isCoarseTouch) {
      // Desktop: clicking video directly plays/pauses (standard player UX)
      togglePlayPause(true);
      setShowHud(true);
      if (!isPlayingRef.current) {
        clearHudHideTimer();
      } else {
        scheduleHudHide();
      }
      return;
    }

    // Touch / Mobile: tap toggles HUD when playing, or resumes when paused & HUD already visible
    e.stopPropagation();
    if (!isPlayingRef.current) {
      void startPlayback(true);
      return;
    }
    if (showHud) {
      clearHudHideTimer();
      setShowHud(false);
    } else {
      setShowHud(true);
      scheduleHudHide(3200);
    }
  };

  const handleStageMouseMove = () => {
    if (!hasStarted) return;
    if (!showHud) setShowHud(true);
    if (isPlayingRef.current) {
      scheduleHudHide(2600);
    }
  };

  // Smooth scrub start / change / end (never fights rAF loop)
  const handleScrubStart = () => {
    isScrubbingRef.current = true;
    wasPlayingBeforeScrubRef.current = isPlayingRef.current;
    if (isPlayingRef.current) {
      pausePlayback(false);
    }
  };

  const handleScrubEnd = () => {
    if (!isScrubbingRef.current) return;
    isScrubbingRef.current = false;
    if (wasPlayingBeforeScrubRef.current) {
      wasPlayingBeforeScrubRef.current = false;
      void startPlayback(false, frameRef.current);
    }
  };

  const effectiveFrame = nativeVideoUrl
    ? Math.max(0, Math.min(spec.totalFrames - 1, Math.round(nativeTime * spec.fps)))
    : currentFrame;
  const curSec = nativeVideoUrl ? nativeTime : currentFrame / spec.fps;
  const totalSec = nativeVideoUrl && nativeDuration > 0 ? nativeDuration : spec.durationSec;

  const activeShot = useMemo(() => {
    return (
      shotMarkers.find((s) => effectiveFrame >= s.startFrame && effectiveFrame <= s.endFrame) ??
      shotMarkers[0] ??
      null
    );
  }, [shotMarkers, effectiveFrame]);

  const hudVisible = !loading && !loadError && hasStarted && (showHud || !isPlaying);

  return (
    <div
      className="fixed inset-0 w-screen h-[100dvh] bg-black overflow-hidden select-none touch-manipulation"
      onClick={handleStageClick}
      onMouseMove={handleStageMouseMove}
    >
      {/* Hidden native stereo audio stream for live Canvas2D mode */}
      {!nativeVideoUrl && (
        <audio
          ref={audioRef}
          src={audioUrl}
          preload="auto"
          playsInline
          muted={isMuted}
          onEnded={() => {
            playSessionRef.current += 1;
            setCurrentFrame(spec.totalFrames - 1);
            setIsPlaying(false);
            setShowHud(true);
            clearHudHideTimer();
          }}
        />
      )}

      {/* Fullscreen Video Viewport (100% edge-to-edge coverage on mobile, crisp 9:16 contain on desktop) */}
      {nativeVideoUrl ? (
        <video
          ref={videoRef}
          src={nativeVideoUrl}
          playsInline
          webkit-playsinline="true"
          preload="auto"
          muted={isMuted}
          onTimeUpdate={(e) => {
            if (!isScrubbingRef.current) setNativeTime(e.currentTarget.currentTime);
          }}
          onLoadedMetadata={(e) => setNativeDuration(e.currentTarget.duration)}
          onEnded={() => {
            playSessionRef.current += 1;
            setIsPlaying(false);
            setShowHud(true);
            clearHudHideTimer();
          }}
          className={`w-full h-full block ${
            fitMode === 'cover' ? 'object-cover' : 'object-contain'
          }`}
        />
      ) : (
        <canvas
          ref={canvasRef}
          width={Math.round(spec.width * canvasScale)}
          height={Math.round(spec.height * canvasScale)}
          className={`w-full h-full block ${
            fitMode === 'cover' ? 'object-cover' : 'object-contain'
          }`}
        />
      )}

      {/* Optional Douyin Safe-Zone overlay in Native MP4 mode */}
      {nativeVideoUrl && showSafeZone && (
        <div className="pointer-events-none fixed inset-0 z-10">
          <div className="absolute top-0 inset-x-0 h-[5.6%] bg-red-500/25 border-b border-dashed border-red-400 flex items-center justify-center">
            <span className="text-[11px] font-bold text-red-100">顶部状态栏禁区</span>
          </div>
          <div className="absolute bottom-0 inset-x-0 h-[17.7%] bg-red-500/25 border-t border-dashed border-red-400 flex items-center justify-center">
            <span className="text-[11px] font-bold text-red-100">抖音底部文案与进度条遮挡区</span>
          </div>
          <div className="absolute right-0 top-[44.8%] bottom-[17.7%] w-[13.3%] bg-orange-500/25 border-l border-dashed border-orange-400 flex flex-col items-center justify-around py-4">
            {['赞', '评', '藏', '转'].map((lbl) => (
              <span
                key={lbl}
                className="w-8 h-8 rounded-full bg-black/60 border border-orange-300 text-orange-100 text-[11px] font-bold flex items-center justify-center"
              >
                {lbl}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Transient Center Feedback Indicator (Play / Pause / Frame Step / Speed) */}
      {feedbackBadge && (
        <div
          key={feedbackBadge.id}
          className="pointer-events-none fixed inset-0 z-[25] flex items-center justify-center"
        >
          <div className="px-4 py-2.5 rounded-2xl bg-black/70 backdrop-blur-md border border-white/15 text-white flex items-center gap-2 shadow-2xl">
            {feedbackBadge.kind === 'play' && <Play className="w-4 h-4 fill-current" />}
            {feedbackBadge.kind === 'pause' && <Pause className="w-4 h-4 fill-current" />}
            {feedbackBadge.kind === 'replay' && <RotateCcw className="w-4 h-4" />}
            <span className="text-xs font-semibold font-mono-num">{feedbackBadge.label}</span>
          </div>
        </div>
      )}

      {/* Loading / Error State */}
      {loading && (
        <div className="fixed inset-0 z-30 bg-black/85 flex flex-col items-center justify-center gap-3 px-6 text-center">
          <div className="w-9 h-9 rounded-full border-2 border-white/20 border-t-amber-400 animate-spin" />
          <div className="text-sm font-semibold text-white">正在加载全屏预览与音轨...</div>
        </div>
      )}

      {!loading && loadError && (
        <div className="fixed inset-0 z-30 bg-black/90 flex flex-col items-center justify-center gap-3 px-6 text-center">
          <div className="text-base font-bold text-red-400">预览加载失败</div>
          <p className="text-xs text-neutral-300 max-w-xs">{loadError}</p>
        </div>
      )}

      {/* First-Tap Start Overlay (Unlocks Full Audio cleanly) */}
      {!loading && !loadError && !hasStarted && (
        <div className="fixed inset-0 z-20 bg-black/35 backdrop-blur-[2px] flex flex-col items-center justify-center gap-5 px-6 text-center">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              void startPlayback(false);
            }}
            className="w-20 h-20 rounded-full bg-white/95 hover:bg-white text-neutral-950 shadow-2xl flex items-center justify-center active:scale-95 transition-transform cursor-pointer"
            aria-label="点击全屏播放（含完整声音）"
          >
            <Play className="w-9 h-9 fill-current ml-1" />
          </button>
          <div className="space-y-1.5">
            <div className="text-base font-bold text-white drop-shadow">{displayTitle}</div>
            <div className="text-xs text-amber-200/95 font-medium">
              点击开始全屏播放（含完整声音）· {totalSec.toFixed(1)} 秒 · {spec.totalFrames} 帧
            </div>
            <div className="text-[11px] text-white/70">
              {nativeVideoUrl
                ? '原生高清 MP4 硬件解码模式 · 支持逐帧审片'
                : '实时全屏预览 · 支持空格暂停、方向键逐帧检查'}
            </div>
          </div>
        </div>
      )}

      {/* Top Subtle Status Header (only when HUD is visible) */}
      {hudVisible && (
        <div
          className="fixed inset-x-0 top-0 z-20 bg-gradient-to-b from-black/80 via-black/40 to-transparent px-4 pt-[max(0.85rem,env(safe-area-inset-top))] pb-8 pointer-events-none"
        >
          <div className="max-w-3xl mx-auto flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-xs font-bold text-white/95 truncate">{displayTitle}</div>
              {activeShot && (
                <div className="text-[11px] text-amber-300/95 font-medium truncate mt-0.5">
                  镜头 {String(activeShot.index).padStart(2, '0')} / {String(shotMarkers.length).padStart(2, '0')} · {activeShot.title}
                </div>
              )}
            </div>
            <div className="shrink-0 text-right font-mono-num text-[11px] text-white/85 bg-black/50 border border-white/15 rounded-lg px-2.5 py-1 backdrop-blur-xs">
              帧 {String(effectiveFrame).padStart(4, '0')} / {spec.totalFrames - 1}
            </div>
          </div>
        </div>
      )}

      {/* Precision Floating Bottom Control HUD */}
      {hudVisible && (
        <div
          className="fixed inset-x-0 bottom-0 z-20 bg-gradient-to-t from-black/92 via-black/75 to-transparent pt-10 px-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
          onClick={(e) => e.stopPropagation()}
          onMouseEnter={() => {
            hoverHudRef.current = true;
            clearHudHideTimer();
          }}
          onMouseLeave={() => {
            hoverHudRef.current = false;
            if (isPlayingRef.current) scheduleHudHide(2000);
          }}
        >
          <div className="max-w-3xl mx-auto space-y-2.5">
            {audioHint && (
              <div className="text-[11px] text-amber-300 text-center">{audioHint}</div>
            )}

            {/* Exact Frame-Level Scrubber with Shot Boundary Ticks */}
            <div className="space-y-1">
              <div className="relative flex items-center gap-2.5">
                <span className="text-[11px] font-mono-num text-white/90 w-11 shrink-0">
                  {curSec.toFixed(2)}s
                </span>

                <div className="relative flex-1 flex items-center h-6">
                  {/* Shot boundary markers */}
                  {shotMarkers.slice(1).map((shot) => {
                    const leftPct = (shot.startFrame / Math.max(1, spec.totalFrames - 1)) * 100;
                    return (
                      <span
                        key={shot.index}
                        style={{ left: `${leftPct}%` }}
                        title={`镜头 ${shot.index}: ${shot.title}`}
                        className="pointer-events-none absolute top-1/2 -translate-y-1/2 w-[2px] h-3 bg-white/45 rounded-full z-10"
                      />
                    );
                  })}

                  <input
                    type="range"
                    aria-label="逐帧进度条"
                    min={0}
                    max={Math.max(1, spec.totalFrames - 1)}
                    step={1}
                    value={effectiveFrame}
                    onPointerDown={handleScrubStart}
                    onPointerUp={handleScrubEnd}
                    onPointerCancel={handleScrubEnd}
                    onBlur={handleScrubEnd}
                    onChange={(e) => seekToFrame(Number(e.target.value))}
                    className="relative z-20 w-full accent-amber-400 h-1.5 bg-white/25 rounded-full cursor-pointer"
                  />
                </div>

                <span className="text-[11px] font-mono-num text-white/70 w-11 text-right shrink-0">
                  {totalSec.toFixed(1)}s
                </span>
              </div>
            </div>

            {/* Primary Control Bar: Play/Pause + Frame Step (-1/+1) + Shot Jump + Utilities */}
            <div className="flex flex-wrap items-center justify-between gap-2">
              {/* Left: Transport & Frame-Step Controls */}
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={(e) => {
                    e.currentTarget.blur();
                    togglePlayPause(true);
                  }}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-white hover:bg-neutral-100 text-neutral-950 text-xs font-bold cursor-pointer active:scale-95 transition-transform"
                  aria-label={isPlaying ? '暂停 (Space)' : '继续播放 (Space)'}
                  title="播放 / 暂停 (Space)"
                >
                  {isPlaying ? (
                    <Pause className="w-3.5 h-3.5 fill-current" />
                  ) : (
                    <Play className="w-3.5 h-3.5 fill-current" />
                  )}
                  <span>
                    {isPlaying
                      ? '暂停'
                      : effectiveFrame >= spec.totalFrames - 1
                        ? '重播'
                        : '继续'}
                  </span>
                </button>

                {/* Exact Frame Stepping Group */}
                <div className="inline-flex items-center bg-white/12 border border-white/15 rounded-full p-0.5">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.currentTarget.blur();
                      stepFrames(-1);
                    }}
                    className="inline-flex items-center gap-0.5 px-2.5 py-1.5 rounded-full text-white hover:bg-white/15 active:bg-white/25 text-xs font-semibold cursor-pointer"
                    aria-label="上一帧 (左方向键)"
                    title="上一帧 (← / Shift+← 后退10帧)"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">上一帧</span>
                  </button>
                  <span className="w-px h-3.5 bg-white/20" />
                  <button
                    type="button"
                    onClick={(e) => {
                      e.currentTarget.blur();
                      stepFrames(1);
                    }}
                    className="inline-flex items-center gap-0.5 px-2.5 py-1.5 rounded-full text-white hover:bg-white/15 active:bg-white/25 text-xs font-semibold cursor-pointer"
                    aria-label="下一帧 (右方向键)"
                    title="下一帧 (→ / Shift+→ 前进10帧)"
                  >
                    <span className="hidden sm:inline">下一帧</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Prev / Next Shot Jump */}
                <div className="hidden sm:inline-flex items-center bg-white/10 border border-white/15 rounded-full p-0.5">
                  <button
                    type="button"
                    onClick={() => jumpShot(-1)}
                    className="p-1.5 rounded-full text-white/90 hover:bg-white/15 cursor-pointer"
                    aria-label="上一镜头 ([)"
                    title="上一镜头 ([)"
                  >
                    <SkipBack className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => jumpShot(1)}
                    className="p-1.5 rounded-full text-white/90 hover:bg-white/15 cursor-pointer"
                    aria-label="下一镜头 (])"
                    title="下一镜头 (])"
                  >
                    <SkipForward className="w-3.5 h-3.5" />
                  </button>
                </div>

                <button
                  type="button"
                  onClick={handleReplay}
                  className="p-2 rounded-full bg-white/12 hover:bg-white/20 text-white active:bg-white/25 cursor-pointer"
                  aria-label="从头重播 (R)"
                  title="从头重播 (R)"
                >
                  <RotateCcw className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  onClick={handleToggleMute}
                  className="p-2 rounded-full bg-white/12 hover:bg-white/20 text-white active:bg-white/25 cursor-pointer"
                  aria-label={isMuted ? '取消静音 (M)' : '静音 (M)'}
                  title="静音开关 (M)"
                >
                  {isMuted ? (
                    <VolumeX className="w-4 h-4 text-red-400" />
                  ) : (
                    <Volume2 className="w-4 h-4 text-amber-300" />
                  )}
                </button>
              </div>

              {/* Right: Speed + Safe-Zone + Fit Mode */}
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={handleCycleSpeed}
                  className="px-2.5 py-1.5 rounded-full text-[11px] font-mono-num font-bold bg-white/10 hover:bg-white/20 border border-white/20 text-white/90 cursor-pointer"
                  title="切换播放倍速 (0.5× / 1× / 1.5×)"
                >
                  {playbackRate}×
                </button>

                <button
                  type="button"
                  onClick={() => setShowSafeZone((s) => !s)}
                  className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[11px] font-semibold border cursor-pointer ${
                    showSafeZone
                      ? 'bg-emerald-500/30 border-emerald-400 text-emerald-100'
                      : 'bg-white/10 hover:bg-white/20 border-white/20 text-white/85'
                  }`}
                  title="抖音安全区遮挡线 (S)"
                >
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>抖音遮挡</span>
                </button>

                <button
                  type="button"
                  onClick={() => setFitMode((m) => (m === 'cover' ? 'contain' : 'cover'))}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[11px] font-semibold bg-white/10 hover:bg-white/20 border border-white/20 text-white/85 cursor-pointer"
                  title="切换铺满 / 完整帧 (F)"
                >
                  {fitMode === 'cover' ? (
                    <>
                      <Minimize2 className="w-3.5 h-3.5" />
                      <span>铺满中</span>
                    </>
                  ) : (
                    <>
                      <Maximize2 className="w-3.5 h-3.5" />
                      <span>完整帧</span>
                    </>
                  )}
                </button>
                {nativeDownloadUrl && (
                  <a
                    href={nativeDownloadUrl}
                    download
                    onClick={(e) => e.stopPropagation()}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[11px] font-semibold bg-amber-400 hover:bg-amber-300 text-neutral-950 cursor-pointer"
                    title="保存 MP4 成片到手机相册用于发抖音"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>存MP4</span>
                  </a>
                )}
              </div>
            </div>

            {/* Subtle Desktop Keyboard Shortcut Strip */}
            <div className="hidden sm:flex items-center justify-between text-[10px] text-white/50 pt-0.5 font-mono-num">
              <span>点击画面 / Space 暂停继续 · ←/→ 逐帧（Shift±10帧）· [/] 切镜头</span>
              <span>R 重播 · M 静音 · S 遮挡线 · F 铺满/完整帧</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
