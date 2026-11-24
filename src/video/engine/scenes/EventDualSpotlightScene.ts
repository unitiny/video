import { clamp, easeOutCubic, lerp } from '../../timeline';
import type { EventDualSpotlightData } from '../schema';
import {
  FONT,
  MONO,
  drawCroppedCoverImage,
  drawHeaderProgress,
  drawWrappedText,
  easeOutBack,
  roundRect,
  type SceneRenderContext,
} from './primitives';

/**
 * Scene: event_dual_spotlight
 * Dual-Focus Split Spotlight + Target Reticle + Physical Stamp + Objective Takeaway
 */
export function renderEventDualSpotlightScene(
  rc: SceneRenderContext,
  data: EventDualSpotlightData
): void {
  const { ctx, frame, localFrame: localF, timeline, episode, assets } = rc;
  const { width, height, totalFrames } = timeline;
  const img = data.imageSrc ? assets.imagesBySrc[data.imageSrc] : null;

  const switchFrame = data.switchFrame ?? 70;
  const stampFrame = data.stampFrame ?? 90;

  const switchT = easeOutCubic(clamp((localF - switchFrame) / 14, 0, 1));
  const leftFocusAlpha = lerp(1.0, 0.24, switchT);
  const rightFocusAlpha = lerp(0.24, 1.0, switchT);

  ctx.save();

  ctx.fillStyle = '#0A111D';
  ctx.fillRect(-20, -20, width + 40, height + 40);

  drawHeaderProgress(ctx, {
    frame,
    totalFrames,
    width,
    seriesTitle: episode.seriesTitle,
    tag: data.headerTag ?? 'EVENT 02 · 聚光切分',
    dark: true,
  });

  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.font = `800 28px ${FONT}`;
  ctx.fillStyle = '#38BDF8';
  ctx.fillText(data.kicker, 56, 134);

  ctx.font = `900 54px ${FONT}`;
  ctx.fillStyle = '#FFFFFF';
  ctx.fillText(data.headline, 56, 178);

  const imgY = 286;
  const imgH = 590;
  const halfW = (width - 112) / 2;

  ctx.save();
  ctx.beginPath();
  ctx.rect(56, imgY, halfW, imgH);
  ctx.clip();
  ctx.globalAlpha = leftFocusAlpha;
  drawCroppedCoverImage(
    ctx,
    img,
    56,
    imgY,
    halfW,
    imgH,
    { x: 0, y: 0, w: 0.5, h: 1 },
    lerp(1.1, 1.0, switchT),
    0,
    0,
    true
  );
  ctx.restore();

  ctx.save();
  ctx.beginPath();
  ctx.rect(56 + halfW, imgY, halfW, imgH);
  ctx.clip();
  ctx.globalAlpha = rightFocusAlpha;
  drawCroppedCoverImage(
    ctx,
    img,
    56 + halfW,
    imgY,
    halfW,
    imgH,
    { x: 0.5, y: 0, w: 0.5, h: 1 },
    lerp(1.0, 1.14, switchT),
    0,
    0,
    true
  );
  ctx.restore();

  if (switchT > 0.1) {
    const cx = 56 + halfW + halfW * 0.52;
    const cy = imgY + imgH * 0.52;
    ctx.save();
    ctx.globalAlpha = switchT;
    ctx.strokeStyle = '#EF4444';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(cx, cy, lerp(180, 110, switchT), 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  // Left focus stats & bullets
  ctx.save();
  ctx.globalAlpha = leftFocusAlpha;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.font = `900 84px ${MONO}, ${FONT}`;
  ctx.fillStyle = '#FBBF24';
  ctx.fillText(data.leftFocus.bigNumber, 56, 946);

  ctx.font = `900 40px ${FONT}`;
  ctx.fillStyle = '#FFFFFF';
  ctx.fillText(data.leftFocus.title, 56, 1056);

  data.leftFocus.bullets.forEach((b, idx) => {
    ctx.font = `600 30px ${FONT}`;
    ctx.fillStyle = '#E2E8F0';
    ctx.fillText(`▲ ${b}`, 56, 1130 + idx * 52);
  });
  ctx.restore();

  ctx.fillStyle = 'rgba(255,255,255,0.14)';
  ctx.fillRect(56, 1280, width - 112, 2);

  // Right focus warning & physical stamp
  ctx.save();
  ctx.globalAlpha = rightFocusAlpha;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.font = `900 60px ${FONT}`;
  ctx.fillStyle = '#F87171';
  ctx.fillText(data.rightFocus.target, 56, 1336);

  ctx.font = `700 34px ${FONT}`;
  ctx.fillStyle = '#FECACA';
  drawWrappedText(ctx, data.rightFocus.warning, 56, 1430, width - 400, 50);

  if (localF >= stampFrame) {
    const stT = clamp((localF - stampFrame) / 8, 0, 1);
    const stScale = lerp(2.5, 1.0, easeOutBack(stT));
    ctx.save();
    ctx.translate(width - 210, 1466);
    ctx.rotate(-0.15);
    ctx.scale(stScale, stScale);
    roundRect(ctx, -148, -48, 296, 96, 12);
    ctx.fillStyle = 'rgba(185, 28, 28, 0.25)';
    ctx.fill();
    ctx.strokeStyle = '#EF4444';
    ctx.lineWidth = 6;
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `900 32px ${FONT}`;
    ctx.fillStyle = '#FCA5A5';
    ctx.fillText(data.rightFocus.stamp, 0, 0);
    ctx.restore();
  }
  ctx.restore();

  // Objective conservative takeaway footer
  ctx.save();
  ctx.globalAlpha = lerp(0.6, 1, switchT);
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  roundRect(ctx, 56, height - 230, width - 112, 122, 14);
  ctx.fill();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `800 32px ${FONT}`;
  ctx.fillStyle = '#FBBF24';
  ctx.fillText(data.footerLine1, width / 2, height - 190);
  ctx.font = `700 29px ${FONT}`;
  ctx.fillStyle = '#E2E8F0';
  ctx.fillText(data.footerLine2, width / 2, height - 140);
  ctx.restore();

  ctx.restore();
}
