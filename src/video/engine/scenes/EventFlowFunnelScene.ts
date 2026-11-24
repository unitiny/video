import { clamp, easeOutCubic, lerp } from '../../timeline';
import type { EventFlowFunnelData } from '../schema';
import {
  FONT,
  MONO,
  drawCroppedCoverImage,
  drawHeaderProgress,
  easeOutBack,
  roundRect,
  type SceneRenderContext,
} from './primitives';

/**
 * Scene: event_flow_funnel
 * Johnny Harris / Vox Paper Cutout + Dynamic 2..4 Non-Crossing Liquidity Suction Funnel
 */
export function renderEventFlowFunnelScene(
  rc: SceneRenderContext,
  data: EventFlowFunnelData
): void {
  const { ctx, frame, localFrame: localF, timeline, episode, assets } = rc;
  const { width, height, totalFrames } = timeline;
  const img = data.imageSrc ? assets.imagesBySrc[data.imageSrc] : null;

  ctx.fillStyle = '#F2ECE1';
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = 'rgba(24, 24, 27, 0.055)';
  ctx.lineWidth = 1;
  for (let gx = 0; gx <= width; gx += 48) {
    ctx.beginPath();
    ctx.moveTo(gx, 0);
    ctx.lineTo(gx, height);
    ctx.stroke();
  }
  for (let gy = 0; gy <= height; gy += 48) {
    ctx.beginPath();
    ctx.moveTo(0, gy);
    ctx.lineTo(width, gy);
    ctx.stroke();
  }

  drawHeaderProgress(ctx, {
    frame,
    totalFrames,
    width,
    seriesTitle: episode.seriesTitle,
    tag: data.headerTag ?? 'EVENT 01 · 抽血图谱',
    dark: false,
  });

  const enterT = easeOutCubic(clamp(localF / 16, 0, 1));
  ctx.save();
  ctx.globalAlpha = enterT;

  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.font = `800 28px ${FONT}`;
  ctx.fillStyle = '#B91C1C';
  ctx.fillText(data.kicker, 56, 134);

  ctx.font = `900 84px ${FONT}`;
  ctx.fillStyle = '#141417';
  ctx.fillText(data.bigHeadline, 56, 178);

  ctx.font = `700 32px ${FONT}`;
  ctx.fillStyle = '#52525B';
  ctx.fillText(data.subTag, 56, 286);

  // Left tilted paper cutout
  const cutY = 368;
  const cutW = 440;
  const cutH = 660;
  const cutEnter = easeOutCubic(clamp((localF - 4) / 18, 0, 1));
  ctx.save();
  ctx.translate(56 + cutW / 2, cutY + cutH / 2);
  ctx.rotate(lerp(-0.08, -0.025, cutEnter));
  ctx.scale(lerp(0.9, 1.0, cutEnter), lerp(0.9, 1.0, cutEnter));

  ctx.shadowColor = 'rgba(24, 24, 27, 0.22)';
  ctx.shadowBlur = 24;
  ctx.shadowOffsetY = 12;
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(-cutW / 2 - 12, -cutH / 2 - 12, cutW + 24, cutH + 24);
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  const crop = data.imageCrop ?? { x: 0, y: 0, w: 1, h: 1 };
  drawCroppedCoverImage(ctx, img, -cutW / 2, -cutH / 2, cutW, cutH, crop, 1.04, 0, 0, false);

  ctx.fillStyle = 'rgba(251, 191, 36, 0.65)';
  ctx.fillRect(-70, -cutH / 2 - 22, 140, 26);
  ctx.restore();

  // Right Non-Crossing Converging Flow Arrows into Funnel Anchor (supports 1..4 flows)
  const fx = 538;
  const funnelAnchorX = 815;
  const funnelAnchorY = 936;
  const flows = data.flows.slice(0, 4);
  const flowCount = flows.length;

  let startY = 390;
  let stepY = 134;
  if (flowCount === 1) {
    startY = 510;
    stepY = 0;
  } else if (flowCount === 2) {
    startY = 432;
    stepY = 172;
  } else if (flowCount === 4) {
    startY = 374;
    stepY = 104;
  }

  const laneStartX = flowCount <= 3 ? 860 : 846;
  const laneStepX = flowCount <= 3 ? 48 : 40;
  const targetSpan = flowCount <= 1 ? 0 : Math.min(140, (flowCount - 1) * 50);

  flows.forEach((flow, idx) => {
    const sy = startY + idx * stepY;
    const fT = easeOutCubic(clamp((localF - 14 - idx * 10) / 18, 0, 1));
    ctx.save();
    ctx.globalAlpha = enterT * fT;

    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.font = `800 28px ${FONT}`;
    ctx.fillStyle = '#18181B';
    ctx.fillText(flow.from, fx, sy);

    ctx.font = `900 30px ${MONO}, ${FONT}`;
    ctx.fillStyle = '#B91C1C';
    ctx.fillText(flow.pct, fx, sy + 38);

    // Non-crossing vertical-lane cubic Bezier pointing straight down into funnel top
    const flowProg = clamp((localF - 20 - idx * 8) / 28, 0, 1);
    const laneX = Math.min(width - 44, laneStartX + idx * laneStepX);
    const p0x = fx + 244;
    const p0y = sy + 32;
    const c1x = laneX;
    const c1y = sy + 32;
    const c2x = laneX;
    const c2y = funnelAnchorY - 120;
    const p3x =
      flowCount <= 1
        ? funnelAnchorX
        : funnelAnchorX - targetSpan / 2 + (idx / (flowCount - 1)) * targetSpan;
    const p3y = funnelAnchorY - 46;

    ctx.strokeStyle = '#D97706';
    ctx.lineWidth = 3.5;
    ctx.setLineDash([10, 8]);
    ctx.lineDashOffset = -localF * 3.4;
    ctx.beginPath();
    ctx.moveTo(p0x, p0y);
    ctx.bezierCurveTo(c1x, c1y, c2x, c2y, p3x, p3y);
    ctx.stroke();
    ctx.setLineDash([]);

    // Crisp downward arrowhead pointing directly into the funnel box
    ctx.fillStyle = '#D97706';
    ctx.beginPath();
    ctx.moveTo(p3x, p3y + 10);
    ctx.lineTo(p3x - 8, p3y - 6);
    ctx.lineTo(p3x + 8, p3y - 6);
    ctx.closePath();
    ctx.fill();

    // Moving glowing bead strictly following the cubic Bezier equation
    if (flowProg > 0) {
      const bt = (localF * 0.026 + idx * (1 / Math.max(1, flowCount))) % 1;
      const u = 1 - bt;
      const bx =
        u * u * u * p0x +
        3 * u * u * bt * c1x +
        3 * u * bt * bt * c2x +
        bt * bt * bt * p3x;
      const by =
        u * u * u * p0y +
        3 * u * u * bt * c1y +
        3 * u * bt * bt * c2y +
        bt * bt * bt * p3y;
      ctx.fillStyle = 'rgba(185, 28, 28, 0.24)';
      ctx.beginPath();
      ctx.arc(bx, by, 13, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#B91C1C';
      ctx.beginPath();
      ctx.arc(bx, by, 7, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  });

  // Funnel Anchor Box
  const anchorT = easeOutBack(clamp((localF - 40) / 14, 0, 1));
  ctx.save();
  ctx.translate(funnelAnchorX, funnelAnchorY + 24);
  ctx.scale(anchorT, anchorT);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#18181B';
  roundRect(ctx, -184, -54, 368, 108, 12);
  ctx.fill();
  ctx.font = `900 30px ${FONT}`;
  const fLines = data.funnelLabel.split('\n').filter((l) => l.length > 0);
  if (fLines.length >= 2) {
    ctx.fillStyle = '#FACC15';
    ctx.fillText(fLines[0], 0, -18);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(fLines[1], 0, 20);
  } else if (fLines.length === 1) {
    ctx.fillStyle = '#FACC15';
    ctx.fillText(fLines[0], 0, 0);
  }
  ctx.restore();

  // Bottom Reality + Conservative Observation Tip
  ctx.fillStyle = 'rgba(24, 24, 27, 0.16)';
  ctx.fillRect(56, 1138, width - 112, 2);

  const botT = easeOutCubic(clamp((localF - 46) / 16, 0, 1));
  ctx.save();
  ctx.globalAlpha = botT;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.font = `900 108px ${MONO}, ${FONT}`;
  ctx.fillStyle = data.bigStatColor ?? '#059669';
  ctx.fillText(data.bigStatText, 56, 1188);

  ctx.font = `800 34px ${FONT}`;
  ctx.fillStyle = '#3F3F46';
  ctx.fillText(data.ashareContext, 56, 1326);

  const hlT = easeOutCubic(clamp((localF - 66) / 22, 0, 1));
  const hlY = 1424;
  ctx.fillStyle = 'rgba(250, 204, 21, 0.65)';
  ctx.fillRect(56, hlY, (width - 112) * hlT, 162);

  ctx.font = `900 44px ${FONT}`;
  ctx.fillStyle = '#141417';
  ctx.fillText(data.highlightLine1, 80, hlY + 24);
  ctx.fillStyle = '#B91C1C';
  ctx.fillText(data.highlightLine2, 80, hlY + 90);

  ctx.font = `600 26px ${FONT}`;
  ctx.fillStyle = '#52525B';
  ctx.fillText(data.bottomCaption, 56, hlY + 210);
  ctx.restore();

  ctx.restore();
}
