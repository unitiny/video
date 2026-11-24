import { clamp } from '../../timeline';
import type { EpisodeManifest, LoadedEpisodeAssets } from '../schema';
import {
  compileEpisodeTimeline,
  getCompiledShotAtFrame,
  type CompiledEpisodeTimeline,
} from '../timeline';
import { renderEventDualSpotlightScene } from './EventDualSpotlightScene';
import { renderEventFlowFunnelScene } from './EventFlowFunnelScene';
import { renderEventTimelineScene } from './EventTimelineScene';
import { renderHookLiveVideoScene } from './HookLiveVideoScene';
import { renderMarketChronoBoardScene } from './MarketChronoBoardScene';
import { renderVerdictScenarioScene } from './VerdictScenarioScene';
import type { SceneRenderContext } from './primitives';

export * from './primitives';
export { renderHookLiveVideoScene } from './HookLiveVideoScene';
export { renderMarketChronoBoardScene } from './MarketChronoBoardScene';
export { renderEventFlowFunnelScene } from './EventFlowFunnelScene';
export { renderEventDualSpotlightScene } from './EventDualSpotlightScene';
export { renderEventTimelineScene } from './EventTimelineScene';
export { renderVerdictScenarioScene } from './VerdictScenarioScene';

interface CachedTimelineEntry {
  signature: string;
  timeline: CompiledEpisodeTimeline;
}

const timelineCache = new WeakMap<EpisodeManifest, CachedTimelineEntry>();

function buildEpisodeSignature(episode: EpisodeManifest): string {
  const durations = episode.scenes.map((s) => `${s.id}:${s.kind}:${s.durationFrames}`).join('|');
  return `${episode.id}#${episode.spec.width}x${episode.spec.height}@${episode.spec.fps}/${episode.spec.bpm}#${durations}`;
}

function getOrCompileTimeline(episode: EpisodeManifest): CompiledEpisodeTimeline {
  const signature = buildEpisodeSignature(episode);
  const cached = timelineCache.get(episode);
  if (cached && cached.signature === signature) {
    return cached.timeline;
  }
  const timeline = compileEpisodeTimeline(episode);
  timelineCache.set(episode, { signature, timeline });
  return timeline;
}

/**
 * Pure data-driven episode frame renderer.
 * Dispatches any EpisodeManifest frame to the matching modular Canvas2D scene renderer.
 */
export function renderEpisodeFrame(
  ctx: CanvasRenderingContext2D,
  frame: number,
  episode: EpisodeManifest,
  assets: LoadedEpisodeAssets
): void {
  if (!episode.scenes || episode.scenes.length === 0) {
    ctx.fillStyle = '#090D14';
    ctx.fillRect(0, 0, episode.spec.width || 1080, episode.spec.height || 1920);
    return;
  }

  const timeline = getOrCompileTimeline(episode);
  const clampedFrame = clamp(Math.floor(frame), 0, timeline.totalFrames - 1);
  const shot = getCompiledShotAtFrame(timeline, clampedFrame);
  const localFrame = clampedFrame - shot.startFrame;

  const rc: SceneRenderContext = {
    ctx,
    frame: clampedFrame,
    localFrame,
    shot,
    timeline,
    episode,
    assets,
  };

  const scene = shot.scene;
  switch (scene.kind) {
    case 'hook_live_video':
      renderHookLiveVideoScene(rc, scene.data);
      break;
    case 'market_chrono_board':
      renderMarketChronoBoardScene(rc, scene.data);
      break;
    case 'event_flow_funnel':
      renderEventFlowFunnelScene(rc, scene.data);
      break;
    case 'event_dual_spotlight':
      renderEventDualSpotlightScene(rc, scene.data);
      break;
    case 'event_timeline':
      renderEventTimelineScene(rc, scene.data);
      break;
    case 'verdict_scenario':
      renderVerdictScenarioScene(rc, scene.data);
      break;
  }
}
