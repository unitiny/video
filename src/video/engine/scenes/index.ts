import { clamp } from '../../timeline';
import type { EpisodeManifest, LoadedEpisodeAssets } from '../schema';
import {
  compileEpisodeTimeline,
  getCompiledShotAtFrame,
  type CompiledEpisodeTimeline,
} from '../timeline';
import { renderAnimatedPosterStageScene } from './AnimatedPosterStageScene';
import { renderEventDualSpotlightScene } from './EventDualSpotlightScene';
import { renderEventFlowFunnelScene } from './EventFlowFunnelScene';
import { renderEventTimelineScene } from './EventTimelineScene';
import { renderHookLiveVideoScene } from './HookLiveVideoScene';
import { renderMarketChronoBoardScene } from './MarketChronoBoardScene';
import { renderTextSummaryBoardScene } from './TextSummaryBoardScene';
import { renderV3AShareAnchorScene } from './V3AShareAnchorScene';
import { renderV3ActionCheatsheetScene } from './V3ActionCheatsheetScene';
import { renderV3ConflictHookScene } from './V3ConflictHookScene';
import { renderV3EditorialStoryScene } from './V3EditorialStoryScene';
import { renderV3MarketPulseScene } from './V3MarketPulseScene';
import { renderVerdictScenarioScene } from './VerdictScenarioScene';
import type { SceneRenderContext } from './primitives';

export * from './primitives';
export * from './v3BrandChrome';
export { renderAnimatedPosterStageScene } from './AnimatedPosterStageScene';
export { renderHookLiveVideoScene } from './HookLiveVideoScene';
export { renderMarketChronoBoardScene } from './MarketChronoBoardScene';
export { renderTextSummaryBoardScene } from './TextSummaryBoardScene';
export { renderEventFlowFunnelScene } from './EventFlowFunnelScene';
export { renderEventDualSpotlightScene } from './EventDualSpotlightScene';
export { renderEventTimelineScene } from './EventTimelineScene';
export { renderVerdictScenarioScene } from './VerdictScenarioScene';
export { renderV3ConflictHookScene } from './V3ConflictHookScene';
export { renderV3MarketPulseScene } from './V3MarketPulseScene';
export { renderV3AShareAnchorScene } from './V3AShareAnchorScene';
export { renderV3EditorialStoryScene } from './V3EditorialStoryScene';
export { renderV3ActionCheatsheetScene } from './V3ActionCheatsheetScene';

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
    case 'animated_poster_stage':
      renderAnimatedPosterStageScene(rc, scene.data);
      break;
    case 'v3_conflict_hook':
      renderV3ConflictHookScene(rc, scene.data);
      break;
    case 'v3_market_pulse':
      renderV3MarketPulseScene(rc, scene.data);
      break;
    case 'v3_ashare_anchor':
      renderV3AShareAnchorScene(rc, scene.data);
      break;
    case 'v3_editorial_story':
      renderV3EditorialStoryScene(rc, scene.data);
      break;
    case 'v3_action_cheatsheet':
      renderV3ActionCheatsheetScene(rc, scene.data);
      break;
    case 'text_summary_board':
      renderTextSummaryBoardScene(rc, scene.data);
      break;
  }
}
