import { ArrayBufferTarget, Muxer } from 'mp4-muxer';
import { encodeStereoWav, synthesizeTrackPcm, type StereoPcm } from '../audio/synthAudio';
import { synthesizeIntelTrackPcm } from '../intel/synthIntelAudio';
import { synthesizeIntelV2TrackPcm } from '../intelV2/synthIntelV2Audio';
import type { EpisodeManifest } from '../engine/schema';
import { synthesizeEpisodeAudioPcm } from '../engine/audioSynth';

export type ExportTrackKey = '1120_v2' | '1120' | '1117';

export function getExportFileName(
  trackKey: ExportTrackKey,
  ext: 'mp4' | 'webm' | 'wav' = 'mp4',
  episodeId?: string
): string {
  if (episodeId) {
    if (ext === 'wav') return `${episodeId}_editorial_bgm.wav`;
    return `${episodeId}_morning_intel_final.${ext}`;
  }
  if (ext === 'wav') {
    if (trackKey === '1120_v2') return '1120_v2_112bpm_editorial.wav';
    if (trackKey === '1120') return '1120_108bpm_editorial_mix.wav';
    return '1117_129.2bpm_bgm.wav';
  }
  if (trackKey === '1120_v2') return `1120_v2_morning_intel_final.${ext}`;
  if (trackKey === '1120') return `1120_morning_intel_final.${ext}`;
  return `1117_close_fund_flow_replica.${ext}`;
}

export function synthesizeTrackForRate(
  trackKey: ExportTrackKey,
  sampleRate: number,
  episode?: EpisodeManifest
): StereoPcm {
  if (episode) return synthesizeEpisodeAudioPcm(episode, sampleRate);
  if (trackKey === '1120_v2') return synthesizeIntelV2TrackPcm(sampleRate);
  if (trackKey === '1120') return synthesizeIntelTrackPcm(sampleRate);
  return synthesizeTrackPcm(sampleRate);
}

export function buildTrackWavBlob(
  trackKey: ExportTrackKey,
  episode?: EpisodeManifest
): { blob: Blob; filename: string } {
  const pcm = synthesizeTrackForRate(trackKey, 44100, episode);
  const wav = encodeStereoWav(pcm);
  return {
    blob: new Blob([wav.buffer as ArrayBuffer], { type: 'audio/wav' }),
    filename: getExportFileName(trackKey, 'wav', episode?.id),
  };
}

/**
 * Safely parses a JSON response body without throwing cryptic HTML SyntaxErrors
 * when static SPA hosts or reverse proxies return `<!doctype html>`.
 */
export function tryParseJsonObject<T>(rawText: string, contentType?: string | null): T | null {
  const trimmed = rawText.trim();
  if (!trimmed || trimmed.startsWith('<')) return null;
  if (contentType && contentType.toLowerCase().includes('text/html')) return null;
  try {
    return JSON.parse(trimmed) as T;
  } catch {
    return null;
  }
}

export async function parseJsonResponseSafe<T>(res: Response): Promise<T | null> {
  const ct = res.headers.get('content-type');
  const raw = await res.text();
  return tryParseJsonObject<T>(raw, ct);
}

export interface ClientMp4ExportParams {
  totalFrames: number;
  fps: number;
  width: number;
  height: number;
  trackKey: ExportTrackKey;
  episode?: EpisodeManifest;
  renderFrame: (frameIndex: number, outCanvas: HTMLCanvasElement, outCtx: CanvasRenderingContext2D) => void;
  onProgress: (renderedFrames: number) => void;
  onPhaseChange?: (phaseLabel: string) => void;
}

export interface ClientMp4ExportResult {
  blob: Blob;
  sizeBytes: number;
  filename: string;
  engineLabel: string;
}

async function pickSupportedVideoConfig(
  width: number,
  height: number,
  fps: number
): Promise<VideoEncoderConfig | null> {
  if (typeof VideoEncoder === 'undefined' || typeof VideoFrame === 'undefined') {
    return null;
  }
  const bitrate = width >= 1000 ? 6_500_000 : 2_600_000;
  const codecs = [
    'avc1.64002a',
    'avc1.4d002a',
    'avc1.4d001f',
    'avc1.42001f',
    'avc1.42E01E',
  ];
  for (const codec of codecs) {
    try {
      const support = await VideoEncoder.isConfigSupported({
        codec,
        width,
        height,
        bitrate,
        framerate: fps,
      });
      if (support.supported && support.config) {
        return support.config;
      }
    } catch {
      // Try next H.264 profile
    }
  }
  return null;
}

async function pickSupportedAudioConfig(): Promise<{
  muxerCodec: 'aac' | 'opus';
  encoderConfig: AudioEncoderConfig;
} | null> {
  if (typeof AudioEncoder === 'undefined' || typeof AudioData === 'undefined') {
    return null;
  }
  const candidates: Array<{ muxerCodec: 'aac' | 'opus'; config: AudioEncoderConfig }> = [
    {
      muxerCodec: 'aac',
      config: {
        codec: 'mp4a.40.2',
        numberOfChannels: 2,
        sampleRate: 44100,
        bitrate: 192_000,
      },
    },
    {
      muxerCodec: 'opus',
      config: {
        codec: 'opus',
        numberOfChannels: 2,
        sampleRate: 48000,
        bitrate: 160_000,
      },
    },
  ];
  for (const c of candidates) {
    try {
      const res = await AudioEncoder.isConfigSupported(c.config);
      if (res.supported && res.config) {
        return { muxerCodec: c.muxerCodec, encoderConfig: res.config };
      }
    } catch {
      // Try next audio codec
    }
  }
  return null;
}

async function exportWithMediaRecorderFallback(
  params: ClientMp4ExportParams
): Promise<ClientMp4ExportResult> {
  const { totalFrames, fps, width, height, trackKey, episode, renderFrame, onProgress, onPhaseChange } =
    params;

  const outCanvas = document.createElement('canvas');
  outCanvas.width = width;
  outCanvas.height = height;
  const outCtx = outCanvas.getContext('2d');
  if (!outCtx) throw new Error('输出画布上下文不可用');

  if (typeof MediaRecorder === 'undefined' || typeof outCanvas.captureStream !== 'function') {
    throw new Error('当前浏览器不支持离线视频编码，请在桌面 Chrome/Edge 中打开导出');
  }

  const mimeCandidates = [
    'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
    'video/mp4',
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
  ];
  const mimeType = mimeCandidates.find((m) => MediaRecorder.isTypeSupported(m)) ?? '';
  const ext: 'mp4' | 'webm' = mimeType.includes('mp4') ? 'mp4' : 'webm';

  onPhaseChange?.(`正在使用浏览器录制通道导出 (${ext.toUpperCase()})...`);

  const canvasStream = outCanvas.captureStream(fps);
  const tracks = [...canvasStream.getVideoTracks()];

  let audioCtx: AudioContext | null = null;
  let audioSrc: AudioBufferSourceNode | null = null;
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (AudioCtx) {
      audioCtx = new AudioCtx();
      if (audioCtx.state === 'suspended') {
        await audioCtx.resume();
      }
      const pcm = synthesizeTrackForRate(trackKey, audioCtx.sampleRate, episode);
      const buf = audioCtx.createBuffer(2, pcm.left.length, audioCtx.sampleRate);
      buf.getChannelData(0).set(pcm.left);
      buf.getChannelData(1).set(pcm.right);
      const dest = audioCtx.createMediaStreamDestination();
      audioSrc = audioCtx.createBufferSource();
      audioSrc.buffer = buf;
      audioSrc.connect(dest);
      tracks.push(...dest.stream.getAudioTracks());
    }
  } catch {
    // Proceed with video-only stream if AudioContext blocked
  }

  const combinedStream = new MediaStream(tracks);
  const chunks: BlobPart[] = [];
  const recorder = new MediaRecorder(
    combinedStream,
    mimeType ? { mimeType, videoBitsPerSecond: 4_500_000 } : { videoBitsPerSecond: 4_500_000 }
  );

  const stopped = new Promise<void>((resolve, reject) => {
    recorder.ondataavailable = (ev) => {
      if (ev.data && ev.data.size > 0) chunks.push(ev.data);
    };
    recorder.onstop = () => resolve();
    recorder.onerror = () => reject(new Error('浏览器录制编码失败'));
  });

  renderFrame(0, outCanvas, outCtx);
  recorder.start(250);
  audioSrc?.start(0);

  const frameMs = 1000 / fps;
  for (let f = 0; f < totalFrames; f++) {
    renderFrame(f, outCanvas, outCtx);
    onProgress(f + 1);
    await new Promise((r) => setTimeout(r, frameMs));
  }

  recorder.stop();
  await stopped;

  try {
    audioSrc?.stop();
    await audioCtx?.close();
  } catch {
    // Ignore cleanup errors
  }

  const blob = new Blob(chunks, { type: mimeType || `video/${ext}` });
  return {
    blob,
    sizeBytes: blob.size,
    filename: getExportFileName(trackKey, ext, episode?.id),
    engineLabel: `浏览器实时编码 (${ext.toUpperCase()})`,
  };
}

export async function exportClientMp4(
  params: ClientMp4ExportParams
): Promise<ClientMp4ExportResult> {
  const { totalFrames, fps, width, height, trackKey, episode, renderFrame, onProgress, onPhaseChange } =
    params;

  const videoConfig = await pickSupportedVideoConfig(width, height, fps);
  if (!videoConfig) {
    return exportWithMediaRecorderFallback(params);
  }

  const audioChoice = await pickSupportedAudioConfig();
  onPhaseChange?.(
    audioChoice
      ? `正在通过浏览器 WebCodecs 合成 H.264 + ${audioChoice.muxerCodec.toUpperCase()} MP4...`
      : '正在通过浏览器 WebCodecs 合成 H.264 MP4...'
  );

  const target = new ArrayBufferTarget();
  const muxer = new Muxer({
    target,
    video: {
      codec: 'avc',
      width,
      height,
      frameRate: fps,
    },
    ...(audioChoice
      ? {
          audio: {
            codec: audioChoice.muxerCodec,
            numberOfChannels: 2,
            sampleRate: audioChoice.encoderConfig.sampleRate,
          },
        }
      : {}),
    fastStart: 'in-memory',
  });

  let encodeError: Error | null = null;
  const videoEncoder = new VideoEncoder({
    output: (chunk, meta) => {
      muxer.addVideoChunk(chunk, meta);
    },
    error: (err) => {
      encodeError = err instanceof Error ? err : new Error(String(err));
    },
  });
  videoEncoder.configure(videoConfig);

  let audioEncoder: AudioEncoder | null = null;
  if (audioChoice) {
    audioEncoder = new AudioEncoder({
      output: (chunk, meta) => {
        muxer.addAudioChunk(chunk, meta);
      },
      error: (err) => {
        encodeError = err instanceof Error ? err : new Error(String(err));
      },
    });
    audioEncoder.configure(audioChoice.encoderConfig);
  }

  const outCanvas = document.createElement('canvas');
  outCanvas.width = width;
  outCanvas.height = height;
  const outCtx = outCanvas.getContext('2d', { willReadFrequently: true });
  if (!outCtx) throw new Error('输出画布上下文不可用');

  const frameDurationUs = Math.round(1_000_000 / fps);
  for (let f = 0; f < totalFrames; f++) {
    if (encodeError) throw encodeError;

    renderFrame(f, outCanvas, outCtx);
    const vf = new VideoFrame(outCanvas, {
      timestamp: Math.round((f * 1_000_000) / fps),
      duration: frameDurationUs,
    });
    videoEncoder.encode(vf, { keyFrame: f % 60 === 0 });
    vf.close();

    // Flush every 180 frames so in-flight queue memory stays bounded without per-frame polling stalls,
    // and progress % tracks actual H.264 encoding speed smoothly from 0% to 100%.
    if ((f + 1) % 180 === 0 && f < totalFrames - 1) {
      await videoEncoder.flush();
    }

    if ((f + 1) % 10 === 0 || f === totalFrames - 1) {
      onProgress(f + 1);
      await new Promise((r) => setTimeout(r, 0));
    }
  }

  // Feed audio track in 2048-sample planar blocks
  if (audioEncoder && audioChoice) {
    onPhaseChange?.('正在混流立体声音轨并封装 MP4...');
    const sampleRate = audioChoice.encoderConfig.sampleRate;
    const pcm = synthesizeTrackForRate(trackKey, sampleRate, episode);
    const totalSamples = Math.min(pcm.left.length, Math.round((totalFrames / fps) * sampleRate));
    const chunkSamples = 2048;

    for (let offset = 0; offset < totalSamples; offset += chunkSamples) {
      if (encodeError) throw encodeError;
      const len = Math.min(chunkSamples, totalSamples - offset);
      const planar = new Float32Array(len * 2);
      planar.set(pcm.left.subarray(offset, offset + len), 0);
      planar.set(pcm.right.subarray(offset, offset + len), len);

      const ad = new AudioData({
        format: 'f32-planar',
        sampleRate,
        numberOfFrames: len,
        numberOfChannels: 2,
        timestamp: Math.round((offset / sampleRate) * 1_000_000),
        data: planar,
      });
      audioEncoder.encode(ad);
      ad.close();
    }
  }

  await videoEncoder.flush();
  if (audioEncoder) {
    await audioEncoder.flush();
    audioEncoder.close();
  }
  videoEncoder.close();

  if (encodeError) throw encodeError;

  muxer.finalize();
  const blob = new Blob([target.buffer], { type: 'video/mp4' });
  return {
    blob,
    sizeBytes: blob.size,
    filename: getExportFileName(trackKey, 'mp4', episode?.id),
    engineLabel: audioChoice
      ? `浏览器 WebCodecs (H.264 + ${audioChoice.muxerCodec.toUpperCase()})`
      : '浏览器 WebCodecs (H.264)',
  };
}
