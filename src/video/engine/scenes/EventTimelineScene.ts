import { clamp, easeOutCubic, lerp } from '../../timeline';
import type { EventTimelineData } from '../schema';
import {
  FONT,
  MONO,
  drawCroppedCoverImage,
  drawHeaderProgress,
  roundRect,
  type SceneRenderContext,
} from './primitives';

/**
 * Scene: event_timeline
 * Magazine Portrait + Floating Countdown Milestones + Editorial Rule Banner
 */
export function renderEventTimelineScene(
  rc: SceneRenderContext,
  data: EventTimelineData
): void {
  const { ctx, frame, localFrame: localF, timeline, episode, assets } = rc;
  const { width, height, totalFrames } = timeline;
  const img = data.imageSrc ? assets.imagesBySrc[data.imageSrc] : null;

  ctx.fillStyle = '#FAF6EE';
  ctx.fillRect(0, 0, width, height);

  drawHeaderProgress(ctx, {
    frame,
    totalFrames,
    width,
    seriesTitle: episode.seriesTitle,
    tag: data.headerTag ?? 'EVENT 03 · 催化节奏',
    dark: false,
  });

  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.font = `800 28px ${FONT}`;
  ctx.fillStyle = '#D97706';
  ctx.fillText(data.kicker, 56, 134);

  ctx.font = `900 54px ${FONT}`;
  ctx.fillStyle = '#141417';
  ctx.fillText(data.headline, 56, 178);

  const imgY = 282;
  const imgH = 780;
  const panT = easeOutCubic(clamp(localF / 120, 0, 1));
  ctx.save();
  roundRect(ctx, 56, imgY, width - 112, imgH, 16);
  ctx.clip();
  drawCroppedCoverImage(
    ctx,
    img,
    56,
    imgY,
    width - 112,
    imgH,
    { x: 0.02, y: 0.02, w: 0.96, h: 0.96 },
    lerp(1.0, 1.07, panT),
    lerp(-0.03, 0.03, panT),
    0,
    false
  );
  ctx.restore();

  const milestones = data.milestones;
  const hasExplicitHighlight = milestones.some((m) => m.highlight !== undefined);
  const availableH = Math.max(240, height - 340 - 1104);
  const rowStep =
    milestones.length <= 3 ? 116 : Math.max(82, Math.floor(availableH / milestones.length));
  const numFontSize = milestones.length <= 3 ? 54 : 46;
  const descFontSize = milestones.length <= 3 ? 32 : 28;

  let my = 1104;
  milestones.forEach((m, idx) => {
    const mT = easeOutCubic(clamp((localF - 14 - idx * 22) / 14, 0, 1));
    const isHighlighted = hasExplicitHighlight ? Boolean(m.highlight) : idx === 1;

    ctx.save();
    ctx.globalAlpha = mT;
    ctx.translate(lerp(60, 0, mT), 0);

    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.font = `900 ${numFontSize}px ${MONO}, ${FONT}`;
    ctx.fillStyle = isHighlighted ? '#C8342A' : '#B45309';
    ctx.fillText(m.num, 56, my + rowStep * 0.36);

    ctx.font = `700 ${descFontSize}px ${FONT}`;
    ctx.fillStyle = '#18181B';
    ctx.fillText(m.desc, 298, my + rowStep * 0.36);

    ctx.fillStyle = 'rgba(24, 24, 27, 0.12)';
    ctx.fillRect(56, my + rowStep * 0.81, width - 112, 1.5);
    ctx.restore();
    my += rowStep;
  });

  const ruleT = easeOutCubic(clamp((localF - 76) / 16, 0, 1));
  ctx.save();
  ctx.globalAlpha = ruleT;
  ctx.fillStyle = '#18181B';
  roundRect(ctx, 56, height - 320, width - 112, 168, 16);
  ctx.fill();

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `900 44px ${FONT}`;
  ctx.fillStyle = '#FACC15';
  ctx.fillText(data.bannerHeadline, width / 2, height - 258);

  ctx.font = `600 26px ${FONT}`;
  ctx.fillStyle = '#CBD5E1';
  ctx.fillText(data.bannerSubline, width / 2, height - 194);
  ctx.restore();
}
