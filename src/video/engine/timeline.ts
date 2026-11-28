import type {
  EpisodeManifest,
  EpisodeScene,
  MarketBoardTiming,
  MarketCommodityWatchItem,
} from './schema';

export interface CompiledShot {
  id: string;
  index: number;
  kind: EpisodeScene['kind'];
  startFrame: number;
  endFrame: number;
  durationFrames: number;
  startSec: number;
  endSec: number;
  title: string;
  subtitle: string;
  editorialCraft: string;
  focusGoal: string;
  scene: EpisodeScene;
}

export interface CompiledEpisodeTimeline {
  episodeId: string;
  fps: number;
  width: number;
  height: number;
  bpm: number;
  totalFrames: number;
  durationSec: number;
  cutFrames: number[];
  shots: CompiledShot[];
}

export const DEFAULT_MARKET_BOARD_TIMING: MarketBoardTiming = {
  usStart: 0,
  usHeadlineFrame: 16,
  usTypeStart: 26,
  usTypeEnd: 86,
  asiaStart: 116,
  asiaTypeStart: 134,
  asiaTypeEnd: 188,
  commodityStart: 214,
  commodityTypeStart: 232,
  commodityTypeEnd: 284,
  a50Start: 302,
  a50NoteStart: 332,
  a50NoteEnd: 364,
};

export function resolveMarketBoardTiming(
  partial?: Partial<MarketBoardTiming>
): MarketBoardTiming {
  return {
    ...DEFAULT_MARKET_BOARD_TIMING,
    ...(partial ?? {}),
  };
}

export function compileEpisodeTimeline(episode: EpisodeManifest): CompiledEpisodeTimeline {
  const fps = episode.spec.fps || 30;
  let cursor = 0;
  const shots: CompiledShot[] = [];
  const cutFrames: number[] = [];

  episode.scenes.forEach((scene, idx) => {
    const dur = Math.max(1, Math.round(scene.durationFrames));
    const startFrame = cursor;
    const endFrame = cursor + dur - 1;
    if (idx > 0) {
      cutFrames.push(startFrame);
    }
    shots.push({
      id: scene.id,
      index: idx + 1,
      kind: scene.kind,
      startFrame,
      endFrame,
      durationFrames: dur,
      startSec: Number((startFrame / fps).toFixed(3)),
      endSec: Number(((endFrame + 1) / fps).toFixed(3)),
      title: scene.title,
      subtitle: scene.subtitle,
      editorialCraft: scene.editorialCraft,
      focusGoal: scene.focusGoal,
      scene,
    });
    cursor += dur;
  });

  const totalFrames = Math.max(1, cursor);
  return {
    episodeId: episode.id,
    fps,
    width: episode.spec.width,
    height: episode.spec.height,
    bpm: episode.spec.bpm,
    totalFrames,
    durationSec: Number((totalFrames / fps).toFixed(3)),
    cutFrames,
    shots,
  };
}

export function getCompiledShotAtFrame(
  timeline: CompiledEpisodeTimeline,
  frame: number
): CompiledShot {
  const f = Math.max(0, Math.min(timeline.totalFrames - 1, Math.floor(frame)));
  for (const shot of timeline.shots) {
    if (f >= shot.startFrame && f <= shot.endFrame) {
      return shot;
    }
  }
  return timeline.shots[timeline.shots.length - 1];
}

export interface HookExitState {
  danmakuExit: number;
  badgeExit: number;
  headlineExit: number;
  videoClose: number;
  isCleared: boolean;
}

/**
 * Scales exit timing cleanly to any hook duration (default 78 frames = 2.6s).
 * For 78 frames: danmaku 55..62, badge 58..64, headline 60..67, videoClose 64..74, cleared >= 75.
 */
export function getHookExitState(localF: number, durationFrames = 78): HookExitState {
  const shift = Math.max(0, durationFrames - 78);
  const step = (start: number, dur: number) => {
    const s = start + shift;
    if (localF <= s) return 0;
    return Math.max(0, Math.min(1, (localF - s) / dur));
  };
  return {
    danmakuExit: step(55, 7),
    badgeExit: step(58, 6),
    headlineExit: step(60, 7),
    videoClose: step(64, 10),
    isCleared: localF >= durationFrames - 3,
  };
}

export function selectAnomalousCommodities(
  items: MarketCommodityWatchItem[],
  thresholdPct = 2.5
): MarketCommodityWatchItem[] {
  return items.filter((item) => Math.abs(item.changePct) >= thresholdPct);
}

export function sliceTypewriterText(
  text: string,
  localF: number,
  startF: number,
  endF: number
): { visible: string; done: boolean; typing: boolean } {
  const chars = Array.from(text);
  if (localF < startF) {
    return { visible: '', done: false, typing: false };
  }
  if (localF >= endF) {
    return { visible: text, done: true, typing: false };
  }
  const t = Math.max(0, Math.min(1, (localF - startF) / Math.max(1, endF - startF)));
  const count = Math.max(1, Math.floor(t * chars.length));
  return {
    visible: chars.slice(0, count).join(''),
    done: count >= chars.length,
    typing: count < chars.length,
  };
}

export function getCardEnterProgress(
  localFrame: number,
  enterFrame: number,
  durationFrames = 16
): number {
  if (durationFrames <= 0) return localFrame >= enterFrame ? 1 : 0;
  return Math.max(0, Math.min(1, (localFrame - enterFrame) / durationFrames));
}

export function collectEpisodeAssetSources(episode: EpisodeManifest): {
  imageSrcs: string[];
  hookVideos: Array<{ videoSrc: string; posterSrc: string; sample: NonNullable<Extract<EpisodeScene, { kind: 'hook_live_video' }>['data']['sample']> }>;
} {
  const imageSet = new Set<string>();
  const hookVideos: Array<{
    videoSrc: string;
    posterSrc: string;
    sample: NonNullable<Extract<EpisodeScene, { kind: 'hook_live_video' }>['data']['sample']>;
  }> = [];

  for (const scene of episode.scenes) {
    if (scene.kind === 'hook_live_video') {
      if (scene.data.posterSrc) imageSet.add(scene.data.posterSrc);
      if (scene.data.memeCard?.imageSrc) imageSet.add(scene.data.memeCard.imageSrc);
      if (scene.data.videoSrc) {
        hookVideos.push({
          videoSrc: scene.data.videoSrc,
          posterSrc: scene.data.posterSrc,
          sample: scene.data.sample,
        });
      }
    } else if (
      scene.kind === 'event_flow_funnel' ||
      scene.kind === 'event_dual_spotlight' ||
      scene.kind === 'event_timeline' ||
      scene.kind === 'animated_poster_stage' ||
      scene.kind === 'v3_editorial_story'
    ) {
      if (scene.data.imageSrc) {
        imageSet.add(scene.data.imageSrc);
      }
    }
  }

  return {
    imageSrcs: Array.from(imageSet),
    hookVideos,
  };
}
