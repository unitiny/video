import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Pause,
  Play,
  RefreshCw,
  RotateCcw,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { ART_ASSETS, CHART_THEME, INTEL_ASSETS, INTEL_V2_ASSETS, VIDEO_SPEC } from '../video/theme';
import {
  HARD_CUT_FRAMES,
  SHOTS,
  getClockAndMinuteAtFrame,
  getShotAtFrame,
} from '../video/timeline';
import { PROJECT_TEMPLATES } from '../video/data/fundFlowData';
import { renderVideoFrame, type LoadedVideoImages } from '../video/renderer/renderFrame';
import { synthesizeTrackPcm } from '../video/audio/synthAudio';
import { INTEL_VIDEO_SPEC } from '../video/intel/intelData';
import {
  INTEL_CUT_FRAMES,
  INTEL_SHOTS,
  getIntelShotAtFrame,
} from '../video/intel/intelTimeline';
import {
  renderIntelVideoFrame,
  type LoadedIntelImages,
} from '../video/intel/renderIntelFrame';
import { synthesizeIntelTrackPcm } from '../video/intel/synthIntelAudio';
import { INTEL_V2_SPEC } from '../video/intelV2/intelV2Data';
import {
  INTEL_V2_CUT_FRAMES,
  INTEL_V2_SHOTS,
  getIntelV2ShotAtFrame,
} from '../video/intelV2/intelV2Timeline';
import { renderIntelV2VideoFrame } from '../video/intelV2/renderIntelV2Frame';
import { synthesizeIntelV2TrackPcm } from '../video/intelV2/synthIntelV2Audio';
import type {
  EpisodeListItem,
  EpisodeManifest,
  LoadedEpisodeAssets,
} from '../video/engine/schema';
import {
  compileEpisodeTimeline,
  getCompiledShotAtFrame,
  type CompiledShot,
} from '../video/engine/timeline';
import { synthesizeEpisodeAudioPcm } from '../video/engine/audioSynth';
import { renderEpisodeFrame } from '../video/engine/scenes';

export type StudioProjectMode =
  | 'episode'
  | '1120_v2'
  | '1120_intel'
  | '1117_close'
  | 'morning_brief';

const EMPTY_EPISODE_ASSETS: LoadedEpisodeAssets = {
  imagesBySrc: {},
  videoFramesBySrc: {},
  videosBySrc: {},
};

function getShotPreviewAsset(shot: CompiledShot): string | null {
  const { scene } = shot;
  if (scene.kind === 'hook_live_video') {
    return scene.data.posterSrc || null;
  }
  if (
    scene.kind === 'event_flow_funnel' ||
    scene.kind === 'event_dual_spotlight' ||
    scene.kind === 'event_timeline' ||
    scene.kind === 'animated_poster_stage'
  ) {
    return scene.data.imageSrc || null;
  }
  return null;
}

interface VideoPlayerWorkspaceProps {
  projectMode: StudioProjectMode;
  onProjectModeChange: (mode: StudioProjectMode) => void;
  currentFrame: number;
  onFrameChange: (frame: number) => void;
  images: LoadedVideoImages;
  intelImages: LoadedIntelImages;
  episodes?: EpisodeListItem[];
  episodesLoading?: boolean;
  selectedEpisodeId?: string;
  onSelectEpisode?: (episodeId: string) => void;
  onRefreshEpisodes?: () => void;
  activeEpisode?: EpisodeManifest | null;
  episodeAssets?: LoadedEpisodeAssets;
}

export const VideoPlayerWorkspace: React.FC<VideoPlayerWorkspaceProps> = ({
  projectMode,
  onProjectModeChange,
  currentFrame,
  onFrameChange,
  images,
  intelImages,
  episodes = [],
  episodesLoading = false,
  selectedEpisodeId = '',
  onSelectEpisode,
  onRefreshEpisodes,
  activeEpisode = null,
  episodeAssets = EMPTY_EPISODE_ASSETS,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const audioBufferCacheRef = useRef<Record<string, AudioBuffer>>({});
  const audioSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);

  const frameRef = useRef(currentFrame);
  frameRef.current = currentFrame;

  const compiledTimeline = useMemo(
    () => (activeEpisode ? compileEpisodeTimeline(activeEpisode) : null),
    [activeEpisode]
  );

  const isEpisodeMode = projectMode === 'episode' && Boolean(activeEpisode && compiledTimeline);
  const isV2Mode = projectMode === '1120_v2';
  const isV1IntelMode = projectMode === '1120_intel';
  const isPortrait916 = projectMode === 'episode' || isV2Mode || isV1IntelMode;

  const spec =
    isEpisodeMode && compiledTimeline
      ? {
          width: compiledTimeline.width,
          height: compiledTimeline.height,
          fps: compiledTimeline.fps,
          totalFrames: compiledTimeline.totalFrames,
          durationSec: compiledTimeline.durationSec,
          bpm: compiledTimeline.bpm,
        }
      : projectMode === 'episode' || isV2Mode
        ? INTEL_V2_SPEC
        : isV1IntelMode
          ? INTEL_VIDEO_SPEC
          : VIDEO_SPEC;

  const totalFrames = spec.totalFrames;
  const durationSec = spec.durationSec;
  const bpm = spec.bpm;

  const safeFrame = Math.max(0, Math.min(totalFrames - 1, currentFrame));
  const currentTimeSec = (safeFrame / spec.fps).toFixed(2);
  const isBreathPause =
    !isPortrait916 && Number(currentTimeSec) >= 2.0 && Number(currentTimeSec) <= 3.0;

  const cutMarkers =
    isEpisodeMode && compiledTimeline
      ? compiledTimeline.cutFrames
      : isV2Mode
        ? INTEL_V2_CUT_FRAMES
        : isV1IntelMode
          ? INTEL_CUT_FRAMES
          : HARD_CUT_FRAMES;

  const activeCompiledShot =
    isEpisodeMode && compiledTimeline ? getCompiledShotAtFrame(compiledTimeline, safeFrame) : null;
  const activeV2Shot = isV2Mode ? getIntelV2ShotAtFrame(safeFrame) : null;
  const activeIntelShot = isV1IntelMode ? getIntelShotAtFrame(safeFrame) : null;
  const activeLegacyShot = !isPortrait916 ? getShotAtFrame(safeFrame) : null;
  const { clockText } = getClockAndMinuteAtFrame(safeFrame);

  const episodeVisualCards = useMemo(() => {
    if (!compiledTimeline) return [];
    const cards: Array<{ id: string; label: string; src: string; jump: number }> = [];
    for (const shot of compiledTimeline.shots) {
      const src = getShotPreviewAsset(shot);
      if (src) {
        cards.push({
          id: shot.id,
          label: `${String(shot.index).padStart(2, '0')} ${shot.title}`,
          src,
          jump: shot.startFrame + Math.min(24, Math.floor(shot.durationFrames / 3)),
        });
      }
    }
    return cards;
  }, [compiledTimeline]);

  // Clear cached dynamic episode audio whenever the activeEpisode manifest object updates
  useEffect(() => {
    for (const key of Object.keys(audioBufferCacheRef.current)) {
      if (key.startsWith('episode:')) {
        delete audioBufferCacheRef.current[key];
      }
    }
    setIsPlaying(false);
  }, [activeEpisode]);

  // Render deterministic Canvas2D frame
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (isEpisodeMode && activeEpisode) {
      renderEpisodeFrame(ctx, safeFrame, activeEpisode, episodeAssets);
    } else if (projectMode === 'episode') {
      ctx.fillStyle = '#101216';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#9CA3AF';
      ctx.font = '600 32px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(
        episodesLoading ? '正在加载每日剧集...' : '暂无可用动态剧集',
        canvas.width / 2,
        canvas.height / 2
      );
    } else if (isV2Mode) {
      renderIntelV2VideoFrame(ctx, safeFrame, intelImages);
    } else if (isV1IntelMode) {
      renderIntelVideoFrame(ctx, safeFrame, intelImages);
    } else {
      const legacyId = projectMode === 'morning_brief' ? 'morning_brief' : '1117_close';
      renderVideoFrame(ctx, safeFrame, PROJECT_TEMPLATES[legacyId], images);
    }
  }, [
    safeFrame,
    projectMode,
    isEpisodeMode,
    activeEpisode,
    episodeAssets,
    episodesLoading,
    isV2Mode,
    isV1IntelMode,
    images,
    intelImages,
  ]);

  const ensureAudioBuffer = async (): Promise<{ ctx: AudioContext; buf: AudioBuffer } | null> => {
    try {
      if (!audioCtxRef.current) {
        const AudioCtx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (!AudioCtx) return null;
        audioCtxRef.current = new AudioCtx();
      }
      const ctx = audioCtxRef.current;
      if (ctx.state === 'suspended') {
        await ctx.resume();
      }
      const cacheKey =
        isEpisodeMode && activeEpisode && compiledTimeline
          ? `episode:${activeEpisode.id}:${compiledTimeline.totalFrames}`
          : isV2Mode
            ? '1120_v2'
            : isV1IntelMode
              ? '1120_intel'
              : '1117_legacy';
      if (!audioBufferCacheRef.current[cacheKey]) {
        const pcm =
          isEpisodeMode && activeEpisode
            ? synthesizeEpisodeAudioPcm(activeEpisode, ctx.sampleRate)
            : isV2Mode
              ? synthesizeIntelV2TrackPcm(ctx.sampleRate, INTEL_V2_SPEC.durationSec)
              : isV1IntelMode
                ? synthesizeIntelTrackPcm(ctx.sampleRate, INTEL_VIDEO_SPEC.durationSec)
                : synthesizeTrackPcm(ctx.sampleRate, VIDEO_SPEC.durationSec);
        const buf = ctx.createBuffer(2, pcm.left.length, ctx.sampleRate);
        buf.getChannelData(0).set(pcm.left);
        buf.getChannelData(1).set(pcm.right);
        audioBufferCacheRef.current[cacheKey] = buf;
      }
      return { ctx, buf: audioBufferCacheRef.current[cacheKey] };
    } catch {
      return null;
    }
  };

  const stopAudio = () => {
    if (audioSourceRef.current) {
      try {
        audioSourceRef.current.stop();
        audioSourceRef.current.disconnect();
      } catch {
        // Ignore stopped node
      }
      audioSourceRef.current = null;
    }
  };

  const startAudioAtFrame = async (startFrame: number) => {
    stopAudio();
    if (isMuted) return;
    const loaded = await ensureAudioBuffer();
    if (!loaded) return;

    const gain = loaded.ctx.createGain();
    gain.gain.value = isMuted ? 0 : 0.72;
    gain.connect(loaded.ctx.destination);
    gainNodeRef.current = gain;

    const source = loaded.ctx.createBufferSource();
    source.buffer = loaded.buf;
    source.connect(gain);
    source.start(0, Math.max(0, startFrame / spec.fps));
    audioSourceRef.current = source;
  };

  useEffect(() => {
    if (gainNodeRef.current) {
      gainNodeRef.current.gain.value = isMuted ? 0 : 0.72;
    }
    if (!isMuted && isPlaying && !audioSourceRef.current) {
      void startAudioAtFrame(frameRef.current);
    }
  }, [isMuted]);

  useEffect(() => {
    if (!isPlaying) {
      stopAudio();
      return;
    }

    const startFrame = frameRef.current >= totalFrames - 1 ? 0 : frameRef.current;
    if (startFrame !== frameRef.current) {
      onFrameChange(0);
    }
    void startAudioAtFrame(startFrame);

    const startWall = performance.now();
    let rafId = 0;

    const tick = () => {
      const elapsedSec = (performance.now() - startWall) / 1000;
      const nextFrame = Math.min(totalFrames - 1, Math.floor(startFrame + elapsedSec * spec.fps));
      onFrameChange(nextFrame);
      if (nextFrame >= totalFrames - 1) {
        setIsPlaying(false);
        stopAudio();
        return;
      }
      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(rafId);
      stopAudio();
    };
  }, [isPlaying, totalFrames, spec.fps]);

  const handleTogglePlay = () => {
    if (!isPlaying && safeFrame >= totalFrames - 1) {
      onFrameChange(0);
    }
    setIsPlaying((prev) => !prev);
  };

  const handleSeek = (targetFrame: number) => {
    const clamped = Math.max(0, Math.min(totalFrames - 1, Math.round(targetFrame)));
    setIsPlaying(false);
    onFrameChange(clamped);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      {/* Left / Center Stage */}
      <section className="lg:col-span-7 bg-white border border-neutral-200 rounded-xl p-6 flex flex-col items-center">
        {/* Mode Switcher + Video Spec Metadata */}
        <div className="w-full space-y-3 pb-4 border-b border-neutral-200">
          <div className="w-full flex flex-wrap items-center justify-between gap-4">
            <div
              className="flex flex-wrap items-center gap-1 p-1 bg-neutral-100 rounded-lg"
              role="group"
              aria-label="选择视频作品"
            >
              <button
                type="button"
                onClick={() => {
                  setIsPlaying(false);
                  onProjectModeChange('episode');
                }}
                className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  projectMode === 'episode'
                    ? 'bg-white text-neutral-900 shadow-sm'
                    : 'text-neutral-600 hover:text-neutral-900'
                }`}
              >
                每日剧集
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsPlaying(false);
                  onProjectModeChange('1120_v2');
                }}
                className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  projectMode === '1120_v2'
                    ? 'bg-white text-neutral-900 shadow-sm'
                    : 'text-neutral-600 hover:text-neutral-900'
                }`}
              >
                11.20 v2 精修爆款
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsPlaying(false);
                  onProjectModeChange('1120_intel');
                }}
                className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  projectMode === '1120_intel'
                    ? 'bg-white text-neutral-900 shadow-sm'
                    : 'text-neutral-600 hover:text-neutral-900'
                }`}
              >
                11.20 v1 存档
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsPlaying(false);
                  onProjectModeChange('1117_close');
                }}
                className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  projectMode === '1117_close'
                    ? 'bg-white text-neutral-900 shadow-sm'
                    : 'text-neutral-600 hover:text-neutral-900'
                }`}
              >
                1117收盘复刻
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsPlaying(false);
                  onProjectModeChange('morning_brief');
                }}
                className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  projectMode === 'morning_brief'
                    ? 'bg-white text-neutral-900 shadow-sm'
                    : 'text-neutral-600 hover:text-neutral-900'
                }`}
              >
                1119早报
              </button>
            </div>

            <div className="flex items-center gap-2 text-xs text-neutral-500 font-mono-num">
              <span>
                {spec.width} × {spec.height}
              </span>
              <span aria-hidden="true">·</span>
              <span>{spec.fps} fps</span>
              <span aria-hidden="true">·</span>
              <span>{totalFrames} 帧</span>
              <span aria-hidden="true">·</span>
              <span>{bpm} BPM</span>
            </div>
          </div>

          {projectMode === 'episode' && (
            <div className="w-full flex flex-wrap items-center gap-2 pt-1">
              <label htmlFor="episode-selector" className="text-xs font-medium text-neutral-500 shrink-0">
                当前剧集
              </label>
              <select
                id="episode-selector"
                aria-label="选择每日剧集"
                value={selectedEpisodeId}
                disabled={episodesLoading || episodes.length === 0}
                onChange={(e) => {
                  setIsPlaying(false);
                  onSelectEpisode?.(e.target.value);
                }}
                className="flex-1 min-w-[200px] px-2.5 py-1.5 text-xs font-medium text-neutral-900 bg-neutral-50 border border-neutral-200 rounded-lg focus:outline-none focus:border-[#C8342A]"
              >
                {episodes.length === 0 ? (
                  <option value="">
                    {episodesLoading ? '正在加载剧集列表...' : '暂无可用剧集（可切回旧版）'}
                  </option>
                ) : (
                  episodes.map((ep) => (
                    <option key={ep.id} value={ep.id}>
                      {ep.date} · {ep.title} ({ep.durationSec.toFixed(1)}s)
                    </option>
                  ))
                )}
              </select>
              <button
                type="button"
                onClick={() => {
                  setIsPlaying(false);
                  onRefreshEpisodes?.();
                }}
                disabled={episodesLoading}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-neutral-200 text-neutral-700 hover:bg-neutral-50 disabled:opacity-60 text-xs font-medium whitespace-nowrap shrink-0"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${episodesLoading ? 'animate-spin' : ''}`} />
                <span>刷新列表</span>
              </button>
            </div>
          )}
        </div>

        {/* Phone Frame Canvas Viewport */}
        <div className="my-4 flex flex-col items-center justify-center w-full">
          <div
            className={`relative rounded-[26px] p-2 shadow-lg border ${
              isEpisodeMode && activeEpisode?.metadata?.theme === 'light'
                ? 'bg-neutral-100 border-neutral-300'
                : 'bg-neutral-950 border-neutral-800'
            }`}
            style={{ width: isPortrait916 ? 'min(100%, 300px)' : 'min(100%, 256px)' }}
          >
            <div
              className={`relative w-full overflow-hidden rounded-[18px] ${
                isEpisodeMode && activeEpisode?.metadata?.theme === 'light'
                  ? 'bg-white'
                  : 'bg-black'
              }`}
              style={{ aspectRatio: `${spec.width} / ${spec.height}` }}
            >
              <canvas
                ref={canvasRef}
                data-testid="video-canvas"
                width={spec.width}
                height={spec.height}
                className="w-full h-full block"
              />
            </div>
          </div>
        </div>

        {/* Transport & Scrubber Bar */}
        <div className="w-full pt-4 border-t border-neutral-200 space-y-4">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs text-neutral-600 font-mono-num">
              <span>
                第 <strong className="text-neutral-900">{safeFrame}</strong> / {totalFrames - 1} 帧
              </span>
              <span>
                {currentTimeSec}s / {durationSec.toFixed(2)}s
                {isBreathPause ? ' · 2.0-3.0s 音轨气口' : ''}
              </span>
            </div>

            <div className="relative pt-1">
              <input
                type="range"
                aria-label="帧时间轴滑块"
                min={0}
                max={totalFrames - 1}
                value={safeFrame}
                onChange={(e) => handleSeek(Number(e.target.value))}
                className="studio-scrubber w-full bg-neutral-200 h-1.5 rounded-full"
              />
              <div className="relative h-4 mt-1">
                {cutMarkers.map((cutFrame) => {
                  const pct = (cutFrame / Math.max(1, totalFrames - 1)) * 100;
                  return (
                    <button
                      key={cutFrame}
                      type="button"
                      title={`切换点：第 ${cutFrame} 帧`}
                      aria-label={`跳至第 ${cutFrame} 帧`}
                      onClick={() => handleSeek(cutFrame)}
                      style={{ left: `${pct}%` }}
                      className="absolute -translate-x-1/2 top-0 text-[10px] font-mono-num text-neutral-400 hover:text-[#C8342A] transition-colors px-0.5"
                    >
                      {cutFrame}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleTogglePlay}
                disabled={projectMode === 'episode' && !isEpisodeMode}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#C8342A] hover:bg-[#b02a21] disabled:opacity-60 text-white text-sm font-medium transition-colors whitespace-nowrap shrink-0"
              >
                {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                <span>
                  {isPlaying
                    ? '暂停播放'
                    : isEpisodeMode
                      ? '播放当前剧集'
                      : isV2Mode
                        ? '播放 v2 精修版'
                        : isV1IntelMode
                          ? '播放 v1 存档版'
                          : '播放复刻成品'}
                </span>
              </button>

              <button
                type="button"
                onClick={() => handleSeek(safeFrame - 1)}
                aria-label="上一帧"
                className="inline-flex items-center gap-1 px-3 py-2 rounded-lg border border-neutral-200 text-neutral-700 hover:bg-neutral-50 text-xs font-medium whitespace-nowrap shrink-0"
              >
                <ChevronLeft className="w-4 h-4" />
                <span>-1帧</span>
              </button>

              <button
                type="button"
                onClick={() => handleSeek(safeFrame + 1)}
                aria-label="下一帧"
                className="inline-flex items-center gap-1 px-3 py-2 rounded-lg border border-neutral-200 text-neutral-700 hover:bg-neutral-50 text-xs font-medium whitespace-nowrap shrink-0"
              >
                <span>+1帧</span>
                <ChevronRight className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={() => handleSeek(0)}
                aria-label="回到第0帧"
                className="p-2 rounded-lg border border-neutral-200 text-neutral-600 hover:bg-neutral-50"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
            </div>

            <button
              type="button"
              onClick={() => setIsMuted((m) => !m)}
              aria-label={isMuted ? '取消静音' : '静音'}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-neutral-200 text-neutral-700 hover:bg-neutral-50 text-xs font-medium whitespace-nowrap shrink-0"
            >
              {isMuted ? (
                <VolumeX className="w-4 h-4 text-neutral-400" />
              ) : (
                <Volume2 className="w-4 h-4 text-[#C8342A]" />
              )}
              <span>
                {isMuted
                  ? '已静音'
                  : isEpisodeMode
                    ? `${bpm} BPM 动态音效`
                    : isV2Mode
                      ? '112 BPM 动感音效'
                      : isV1IntelMode
                        ? '108 BPM 动感剪辑'
                        : '129.2 BPM 音轨'}
              </span>
            </button>
          </div>
        </div>
      </section>

      {/* Right Column: Active Scene Inspector & Quick Jump */}
      <aside className="lg:col-span-5 space-y-6">
        {isEpisodeMode && activeEpisode && compiledTimeline && activeCompiledShot ? (
          <>
            <section className="bg-white border border-neutral-200 rounded-xl p-6 space-y-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-xs text-neutral-500 font-mono-num">
                    动态剧集段落 {activeCompiledShot.index} / {compiledTimeline.shots.length} · 帧{' '}
                    {activeCompiledShot.startFrame}–{activeCompiledShot.endFrame}
                  </div>
                  <h2 className="text-lg font-bold text-neutral-900 mt-1">
                    {activeCompiledShot.title}
                  </h2>
                  <p className="text-sm text-neutral-600 mt-0.5">{activeCompiledShot.subtitle}</p>
                </div>
                <div className="text-right font-mono-num shrink-0">
                  <div className="text-xs text-neutral-500">{activeEpisode.date}</div>
                  <div className="text-base font-bold text-neutral-900">
                    {compiledTimeline.width}×{compiledTimeline.height}
                  </div>
                </div>
              </div>

              <div className="border-t border-neutral-100 pt-4 space-y-2.5 text-sm">
                <div className="flex justify-between gap-4">
                  <span className="text-neutral-500 shrink-0">财经级动效</span>
                  <span className="text-neutral-900 font-medium text-right">
                    {activeCompiledShot.editorialCraft}
                  </span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-neutral-500 shrink-0">重点提炼</span>
                  <span className="text-[#C8342A] font-medium text-right">
                    {activeCompiledShot.focusGoal}
                  </span>
                </div>
              </div>
            </section>

            <section className="bg-white border border-neutral-200 rounded-xl p-6">
              <div className="flex items-center justify-between gap-2 mb-3">
                <h3 className="text-sm font-bold text-neutral-900 min-w-0 truncate">
                  {activeEpisode.seriesTitle || activeEpisode.title}
                </h3>
                <span className="text-xs text-neutral-500 font-mono-num whitespace-nowrap shrink-0">
                  共 {compiledTimeline.durationSec.toFixed(1)} 秒节奏
                </span>
              </div>
              <div className="divide-y divide-neutral-100 max-h-[380px] overflow-y-auto pr-1">
                {compiledTimeline.shots.map((shot) => {
                  const isCurrent = shot.id === activeCompiledShot.id;
                  return (
                    <button
                      key={shot.id}
                      type="button"
                      onClick={() => handleSeek(shot.startFrame)}
                      className={`w-full text-left py-2.5 px-3 rounded-lg transition-colors flex items-center justify-between gap-3 ${
                        isCurrent
                          ? 'bg-red-50/70 text-[#C8342A]'
                          : 'hover:bg-neutral-50 text-neutral-800'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="text-xs font-semibold truncate">
                          {String(shot.index).padStart(2, '0')}. {shot.title}
                        </div>
                        <div className="text-[11px] text-neutral-500 truncate mt-0.5">
                          {shot.subtitle}
                        </div>
                      </div>
                      <div className="text-right font-mono-num shrink-0">
                        <div className="text-xs font-semibold">
                          {shot.startFrame}–{shot.endFrame}
                        </div>
                        <div className="text-[11px] text-neutral-400">
                          {shot.startSec.toFixed(1)}s
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>

            <section className="bg-white border border-neutral-200 rounded-xl p-6">
              <h3 className="text-sm font-bold text-neutral-900 mb-1">{activeEpisode.title}</h3>
              <p className="text-xs text-neutral-500 mb-3">
                {activeEpisode.description}
                {activeEpisode.metadata?.sourceSummary
                  ? `（数据来源：${activeEpisode.metadata.sourceSummary}）`
                  : ''}
              </p>
              {episodeVisualCards.length > 0 && (
                <div className="grid grid-cols-4 gap-2.5">
                  {episodeVisualCards.map((asset) => (
                    <button
                      key={asset.id}
                      type="button"
                      onClick={() => handleSeek(asset.jump)}
                      className="group text-left"
                    >
                      <div className="aspect-[3/4] rounded-lg overflow-hidden border border-neutral-200 bg-neutral-900">
                        <img
                          src={asset.src}
                          alt={asset.label}
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                        />
                      </div>
                      <div className="text-[11px] text-neutral-700 font-medium mt-1.5 truncate text-center">
                        {asset.label}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </section>
          </>
        ) : projectMode === 'episode' ? (
          <section className="bg-white border border-neutral-200 rounded-xl p-6 space-y-2">
            <h2 className="text-base font-bold text-neutral-900">
              {episodesLoading ? '正在加载每日剧集...' : '尚未加载动态剧集'}
            </h2>
            <p className="text-xs text-neutral-500">
              请点击「刷新列表」重新读取 episodes/*/episode.json，或切换顶部旧版模板预览。
            </p>
          </section>
        ) : isV2Mode && activeV2Shot ? (
          <>
            <section className="bg-white border border-neutral-200 rounded-xl p-6 space-y-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-xs text-neutral-500 font-mono-num">
                    v2 精修段落 {activeV2Shot.index} / {INTEL_V2_SHOTS.length} · 帧 {activeV2Shot.startFrame}–{activeV2Shot.endFrame}
                  </div>
                  <h2 className="text-lg font-bold text-neutral-900 mt-1">{activeV2Shot.title}</h2>
                  <p className="text-sm text-neutral-600 mt-0.5">{activeV2Shot.subtitle}</p>
                </div>
                <div className="text-right font-mono-num shrink-0">
                  <div className="text-xs text-neutral-500">画幅比例</div>
                  <div className="text-base font-bold text-neutral-900">9:16 竖屏</div>
                </div>
              </div>

              <div className="border-t border-neutral-100 pt-4 space-y-2.5 text-sm">
                <div className="flex justify-between gap-4">
                  <span className="text-neutral-500 shrink-0">财经级动效</span>
                  <span className="text-neutral-900 font-medium text-right">{activeV2Shot.editorialCraft}</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-neutral-500 shrink-0">重点提炼</span>
                  <span className="text-[#C8342A] font-medium text-right">{activeV2Shot.focusGoal}</span>
                </div>
              </div>
            </section>

            <section className="bg-white border border-neutral-200 rounded-xl p-6">
              <div className="flex items-center justify-between gap-2 mb-3">
                <h3 className="text-sm font-bold text-neutral-900 min-w-0 truncate">
                  v2 精修分镜跳转（急电看表 · 实盘日K分时 · 聚光推演）
                </h3>
                <span className="text-xs text-neutral-500 font-mono-num whitespace-nowrap shrink-0">
                  共 {Math.round(INTEL_V2_SPEC.durationSec)} 秒节奏
                </span>
              </div>
              <div className="divide-y divide-neutral-100 max-h-[380px] overflow-y-auto pr-1">
                {INTEL_V2_SHOTS.map((shot) => {
                  const isCurrent = shot.id === activeV2Shot.id;
                  return (
                    <button
                      key={shot.id}
                      type="button"
                      onClick={() => handleSeek(shot.startFrame)}
                      className={`w-full text-left py-2.5 px-3 rounded-lg transition-colors flex items-center justify-between gap-3 ${
                        isCurrent ? 'bg-red-50/70 text-[#C8342A]' : 'hover:bg-neutral-50 text-neutral-800'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="text-xs font-semibold truncate">
                          {String(shot.index).padStart(2, '0')}. {shot.title}
                        </div>
                        <div className="text-[11px] text-neutral-500 truncate mt-0.5">{shot.subtitle}</div>
                      </div>
                      <div className="text-right font-mono-num shrink-0">
                        <div className="text-xs font-semibold">
                          {shot.startFrame}–{shot.endFrame}
                        </div>
                        <div className="text-[11px] text-neutral-400">{shot.startSec.toFixed(1)}s</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>

            <section className="bg-white border border-neutral-200 rounded-xl p-6">
              <h3 className="text-sm font-bold text-neutral-900 mb-1">v2 极速开屏 + 实盘核对日K分时 + 真人肖像</h3>
              <p className="text-xs text-neutral-500 mb-3">
                01 段压缩至 2.6s 极速抓眼球：商务急电抬腕看表连续实拍 + 52–54px 精炼核心数据弹幕 + 光刃清屏转场；02 段全部核对真实交易所日K分时并在 A50 展毕多停 1 秒；05 段真人马斯克肖像。
              </p>
              <div className="grid grid-cols-4 gap-2.5">
                {[
                  { label: '01 2.6秒极速开屏', src: INTEL_V2_ASSETS.realKeyDayPoster, jump: 28 },
                  { label: '02 全球日K分时', src: INTEL_V2_ASSETS.realNyseClap, jump: 478 },
                  { label: '03 抽血漏斗', src: INTEL_ASSETS.eventAnthropic, jump: 573 },
                  { label: '05 真人马斯克', src: INTEL_V2_ASSETS.eventMuskRealKitchen, jump: 873 },
                ].map((asset) => (
                  <button
                    key={asset.label}
                    type="button"
                    onClick={() => handleSeek(asset.jump)}
                    className="group text-left"
                  >
                    <div className="aspect-[3/4] rounded-lg overflow-hidden border border-neutral-200 bg-neutral-900">
                      <img
                        src={asset.src}
                        alt={asset.label}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                      />
                    </div>
                    <div className="text-[11px] text-neutral-700 font-medium mt-1.5 truncate text-center">
                      {asset.label}
                    </div>
                  </button>
                ))}
              </div>
            </section>
          </>
        ) : isV1IntelMode && activeIntelShot ? (
          <>
            <section className="bg-white border border-neutral-200 rounded-xl p-6 space-y-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-xs text-neutral-500 font-mono-num">
                    段落 {activeIntelShot.index} / 6 · 帧 {activeIntelShot.startFrame}–{activeIntelShot.endFrame}
                  </div>
                  <h2 className="text-lg font-bold text-neutral-900 mt-1">{activeIntelShot.title}</h2>
                  <p className="text-sm text-neutral-600 mt-0.5">{activeIntelShot.subtitle}</p>
                </div>
                <div className="text-right font-mono-num shrink-0">
                  <div className="text-xs text-neutral-500">画幅比例</div>
                  <div className="text-base font-bold text-neutral-900">9:16 竖屏</div>
                </div>
              </div>

              <div className="border-t border-neutral-100 pt-4 space-y-2.5 text-sm">
                <div className="flex justify-between gap-4">
                  <span className="text-neutral-500 shrink-0">风格动效</span>
                  <span className="text-neutral-900 font-medium text-right">{activeIntelShot.creativeHook}</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-neutral-500 shrink-0">股民价值</span>
                  <span className="text-[#C8342A] font-medium text-right">{activeIntelShot.traderValue}</span>
                </div>
              </div>
            </section>

            <section className="bg-white border border-neutral-200 rounded-xl p-6">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold text-neutral-900">6段式「爆梗开屏 → 全球异动 → 多维拆解」跳转</h3>
                <span className="text-xs text-neutral-500 font-mono-num">共 30 秒节奏</span>
              </div>
              <div className="divide-y divide-neutral-100 max-h-[380px] overflow-y-auto pr-1">
                {INTEL_SHOTS.map((shot) => {
                  const isCurrent = shot.id === activeIntelShot.id;
                  return (
                    <button
                      key={shot.id}
                      type="button"
                      onClick={() => handleSeek(shot.startFrame)}
                      className={`w-full text-left py-2.5 px-3 rounded-lg transition-colors flex items-center justify-between gap-3 ${
                        isCurrent ? 'bg-red-50/70 text-[#C8342A]' : 'hover:bg-neutral-50 text-neutral-800'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="text-xs font-semibold truncate">
                          {String(shot.index).padStart(2, '0')}. {shot.title}
                        </div>
                        <div className="text-[11px] text-neutral-500 truncate mt-0.5">{shot.subtitle}</div>
                      </div>
                      <div className="text-right font-mono-num shrink-0">
                        <div className="text-xs font-semibold">
                          {shot.startFrame}–{shot.endFrame}
                        </div>
                        <div className="text-[11px] text-neutral-400">{shot.startSec.toFixed(1)}s</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>

            <section className="bg-white border border-neutral-200 rounded-xl p-6">
              <h3 className="text-sm font-bold text-neutral-900 mb-1">多风格定制原画（4 张主视觉）</h3>
              <p className="text-xs text-neutral-500 mb-3">
                告别千篇一律模版：真人反应定格、版画报纸头版、工程蓝图对比、人物厨房肖像各具一格。
              </p>
              <div className="grid grid-cols-4 gap-2.5">
                {[
                  { label: '01 很关键梗', src: INTEL_ASSETS.memeKeyDay, jump: 18 },
                  { label: '03 报纸头版', src: INTEL_ASSETS.eventAnthropic, jump: 280 },
                  { label: '04 蓝图排雷', src: INTEL_ASSETS.eventPcb, jump: 450 },
                  { label: '05 人物肖像', src: INTEL_ASSETS.eventRobot, jump: 600 },
                ].map((asset) => (
                  <button
                    key={asset.label}
                    type="button"
                    onClick={() => handleSeek(asset.jump)}
                    className="group text-left"
                  >
                    <div className="aspect-[3/4] rounded-lg overflow-hidden border border-neutral-200 bg-neutral-900">
                      <img
                        src={asset.src}
                        alt={asset.label}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                      />
                    </div>
                    <div className="text-[11px] text-neutral-700 font-medium mt-1.5 truncate text-center">
                      {asset.label}
                    </div>
                  </button>
                ))}
              </div>
            </section>
          </>
        ) : (
          activeLegacyShot && (
            <>
              <section className="bg-white border border-neutral-200 rounded-xl p-6 space-y-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-xs text-neutral-500 font-mono-num">
                      镜头 {activeLegacyShot.index} / 10 · 帧 {activeLegacyShot.startFrame}–{activeLegacyShot.endFrame}
                    </div>
                    <h2 className="text-lg font-bold text-neutral-900 mt-1">{activeLegacyShot.title}</h2>
                    <p className="text-sm text-neutral-600 mt-0.5">{activeLegacyShot.subtitle}</p>
                  </div>
                  <div className="text-right font-mono-num">
                    <div className="text-xs text-neutral-500">盘面时钟</div>
                    <div className="text-xl font-bold text-neutral-900">{clockText}</div>
                  </div>
                </div>

                <div className="border-t border-neutral-100 pt-4 space-y-2.5 text-sm">
                  <div className="flex justify-between gap-4">
                    <span className="text-neutral-500 shrink-0">渲染方式</span>
                    <span className="text-neutral-900 font-medium text-right">{activeLegacyShot.implementation}</span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span className="text-neutral-500 shrink-0">动效与缓动</span>
                    <span className="text-neutral-700 text-right">{activeLegacyShot.motionNotes}</span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span className="text-neutral-500 shrink-0">音频同步</span>
                    <span className="text-neutral-700 text-right">{activeLegacyShot.audioCue}</span>
                  </div>
                </div>

                <div className="border-t border-neutral-100 pt-4">
                  <h3 className="text-xs font-semibold text-neutral-500 mb-2.5">实测像素规格锚点（1080×2352）</h3>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs font-mono-num">
                    <div className="flex justify-between py-1 border-b border-neutral-100">
                      <span className="text-neutral-500">标题左/顶</span>
                      <span className="text-neutral-900">x={CHART_THEME.titleLeft}, y={CHART_THEME.titleTop}</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-neutral-100">
                      <span className="text-neutral-500">时钟右对齐</span>
                      <span className="text-neutral-900">x={CHART_THEME.clockRight}</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-neutral-100">
                      <span className="text-neutral-500">零轴与比例</span>
                      <span className="text-neutral-900">y0={CHART_THEME.zeroY} · 15.975px/亿</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-neutral-100">
                      <span className="text-neutral-500">标签最小间距</span>
                      <span className="text-neutral-900">{CHART_THEME.labelMinGap}px 防碰撞</span>
                    </div>
                  </div>
                </div>
              </section>

              <section className="bg-white border border-neutral-200 rounded-xl p-6">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-bold text-neutral-900">10段硬切分镜跳转表</h3>
                  <span className="text-xs text-neutral-500 font-mono-num">点击任意分镜跳转对应帧</span>
                </div>
                <div className="divide-y divide-neutral-100 max-h-[360px] overflow-y-auto pr-1">
                  {SHOTS.map((shot) => {
                    const isCurrent = shot.id === activeLegacyShot.id;
                    return (
                      <button
                        key={shot.id}
                        type="button"
                        onClick={() => handleSeek(shot.startFrame)}
                        className={`w-full text-left py-2.5 px-3 rounded-lg transition-colors flex items-center justify-between gap-3 ${
                          isCurrent ? 'bg-red-50/70 text-[#C8342A]' : 'hover:bg-neutral-50 text-neutral-800'
                        }`}
                      >
                        <div className="min-w-0">
                          <div className="text-xs font-semibold truncate">
                            {String(shot.index).padStart(2, '0')}. {shot.title}
                          </div>
                          <div className="text-[11px] text-neutral-500 truncate mt-0.5">{shot.subtitle}</div>
                        </div>
                        <div className="text-right font-mono-num shrink-0">
                          <div className="text-xs font-semibold">
                            {shot.startFrame}–{shot.endFrame}
                          </div>
                          <div className="text-[11px] text-neutral-400">{shot.startSec.toFixed(2)}s</div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </section>

              <section className="bg-white border border-neutral-200 rounded-xl p-6">
                <h3 className="text-sm font-bold text-neutral-900 mb-1">1117 复刻素材槽</h3>
                <div className="grid grid-cols-5 gap-2 mt-2">
                  {[
                    { label: '01 拉弓', src: ART_ASSETS.openArcher, jump: 0 },
                    { label: '02 打脸', src: ART_ASSETS.noonSlap, jump: 97 },
                    { label: '04 双羊', src: ART_ASSETS.twoSheep, jump: 213 },
                    { label: '09 光刻机', src: ART_ASSETS.lithographyHero, jump: 556 },
                    { label: '早报封面', src: ART_ASSETS.morningBrief, jump: 0 },
                  ].map((asset) => (
                    <button
                      key={asset.label}
                      type="button"
                      onClick={() => handleSeek(asset.jump)}
                      className="group text-left"
                    >
                      <div className="aspect-[3/4] rounded-lg overflow-hidden border border-neutral-200 bg-neutral-100">
                        <img
                          src={asset.src}
                          alt={asset.label}
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                        />
                      </div>
                      <div className="text-[11px] text-neutral-600 font-medium mt-1 truncate text-center">
                        {asset.label}
                      </div>
                    </button>
                  ))}
                </div>
              </section>
            </>
          )
        )}
      </aside>
    </div>
  );
};
