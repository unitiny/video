import { clamp, easeOutCubic, lerp } from '../../timeline';
import type { V3ConflictHookData } from '../schema';
import {
  FONT,
  MONO,
  easeOutBack,
  roundRect,
  type SceneRenderContext,
} from './primitives';
import {
  V3_COLORS,
  V3_SAFE_ZONE,
  drawV3ObsidianBackdrop,
  drawV3SafeFooterWatermark,
  drawV3TopChrome,
  resolveV3ToneColor,
} from './v3BrandChrome';

/**
 * v3 Scene 1: Kinetic Deep-V Conflict Hook (2.8s / 84f)
 * - Replaces mismatched stock B-roll with live animated NASDAQ deep-V curve backdrop
 * - 0.5s headline conflict slam + 3 high-contrast mobile-first KPI strips inside platform Safe Zone
 */
export function renderV3ConflictHookScene(
  rc: SceneRenderContext,
  data: V3ConflictHookData
): void {
  const { ctx, localFrame: localF, shot, timeline } = rc;
  const { width, height } = timeline;

  drawV3ObsidianBackdrop(ctx, width, height, V3_COLORS.brandGold);

  // Subtle ambient dramatic split glow (emerald deep drop left -> amber rebound right)
  const leftGlow = ctx.createRadialGradient(240, 760, 20, 240, 760, 520);
  leftGlow.addColorStop(0, 'rgba(52, 211, 153, 0.16)');
  leftGlow.addColorStop(1, 'rgba(7, 10, 16, 0)');
  ctx.fillStyle = leftGlow;
  ctx.fillRect(0, 320, width, 860);

  const rightGlow = ctx.createRadialGradient(840, 620, 20, 840, 620, 480);
  rightGlow.addColorStop(0, 'rgba(251, 191, 36, 0.18)');
  rightGlow.addColorStop(1, 'rgba(7, 10, 16, 0)');
  ctx.fillStyle = rightGlow;
  ctx.fillRect(0, 260, width, 860);

  // Live animated deep-V market curve sweeping across the middle stage (y: 470..1010)
  const curve = data.backdropCurve;
  if (curve && curve.length >= 2) {
    const plotX = V3_SAFE_ZONE.left;
    const plotW = width - V3_SAFE_ZONE.left * 2;
    const plotTop = 490;
    const plotBot = 980;

    let minV = 0;
    let maxV = 0.5;
    let minIdx = 0;
    for (let i = 0; i < curve.length; i++) {
      if (curve[i] < minV) {
        minV = curve[i];
        minIdx = i;
      }
      if (curve[i] > maxV) maxV = curve[i];
    }
    const span = Math.max(1.5, maxV - minV);
    const padMin = minV - span * 0.18;
    const padMax = maxV + span * 0.22;

    const mapX = (idx: number) => plotX + (idx / (curve.length - 1)) * plotW;
    const mapY = (v: number) =>
      lerp(plotBot, plotTop, clamp((v - padMin) / (padMax - padMin), 0, 1));

    // Chart container subtle frame
    ctx.save();
    ctx.fillStyle = 'rgba(13, 19, 31, 0.62)';
    roundRect(ctx, plotX, plotTop - 20, plotW, plotBot - plotTop + 44, 22);
    ctx.fill();
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.14)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // 0% dashed baseline
    const zeroY = mapY(0);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([8, 8]);
    ctx.beginPath();
    ctx.moveTo(plotX + 20, zeroY);
    ctx.lineTo(plotX + plotW - 20, zeroY);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.font = `700 20px ${MONO}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillStyle = 'rgba(148, 163, 184, 0.72)';
    ctx.fillText('0.00% 平盘线', plotX + 24, zeroY - 8);

    // Progressive curve trace (finishes around frame 44)
    const drawProg = easeOutCubic(clamp((localF - 2) / 42, 0, 1));
    const maxFloat = drawProg * (curve.length - 1);
    const fullIdx = Math.floor(maxFloat);
    const frac = maxFloat - fullIdx;
    const tipX =
      fullIdx >= curve.length - 1 ? mapX(curve.length - 1) : mapX(fullIdx + frac);
    const tipVal =
      fullIdx >= curve.length - 1
        ? curve[curve.length - 1]
        : lerp(curve[fullIdx], curve[fullIdx + 1], frac);
    const tipY = mapY(tipVal);

    if (drawProg > 0.01) {
      // Gradient area fill beneath deep-V curve
      const areaGrad = ctx.createLinearGradient(0, plotTop, 0, plotBot);
      areaGrad.addColorStop(0, 'rgba(251, 191, 36, 0.18)');
      areaGrad.addColorStop(0.55, 'rgba(52, 211, 153, 0.22)');
      areaGrad.addColorStop(1, 'rgba(52, 211, 153, 0.02)');

      ctx.fillStyle = areaGrad;
      ctx.beginPath();
      ctx.moveTo(mapX(0), plotBot + 8);
      for (let i = 0; i <= fullIdx; i++) {
        ctx.lineTo(mapX(i), mapY(curve[i]));
      }
      ctx.lineTo(tipX, tipY);
      ctx.lineTo(tipX, plotBot + 8);
      ctx.closePath();
      ctx.fill();

      // Main glowing stroke transitioning from drop green to rebound gold
      const strokeGrad = ctx.createLinearGradient(plotX, 0, plotX + plotW, 0);
      strokeGrad.addColorStop(0, V3_COLORS.downGreen);
      strokeGrad.addColorStop(0.45, V3_COLORS.downGreen);
      strokeGrad.addColorStop(0.78, V3_COLORS.brandGold);
      strokeGrad.addColorStop(1, V3_COLORS.brandGoldLight);

      ctx.shadowColor = 'rgba(251, 191, 36, 0.45)';
      ctx.shadowBlur = 18;
      ctx.strokeStyle = strokeGrad;
      ctx.lineWidth = 6;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.beginPath();
      for (let i = 0; i <= fullIdx; i++) {
        const px = mapX(i);
        const py = mapY(curve[i]);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.lineTo(tipX, tipY);
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Active tracer bead
      ctx.fillStyle = 'rgba(251, 191, 36, 0.35)';
      ctx.beginPath();
      ctx.arc(tipX, tipY, 16, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.arc(tipX, tipY, 7, 0, Math.PI * 2);
      ctx.fill();
    }

    // Intraday Low callout badge once trace crosses minimum
    if (data.backdropLowLabel && maxFloat >= minIdx) {
      const lowP = easeOutBack(clamp((maxFloat - minIdx) / 6, 0, 1));
      const lx = clamp(mapX(minIdx), plotX + 165, plotX + plotW - 180);
      const ly = Math.min(plotBot - 38, mapY(minV) + 12);
      ctx.save();
      ctx.globalAlpha = clamp(lowP, 0, 1);
      ctx.translate(lx, ly);
      ctx.scale(lerp(0.85, 1, clamp(lowP, 0, 1)), lerp(0.85, 1, clamp(lowP, 0, 1)));
      ctx.font = `900 25px ${FONT}`;
      const lw = ctx.measureText(data.backdropLowLabel).width + 34;
      ctx.fillStyle = 'rgba(5, 150, 105, 0.92)';
      roundRect(ctx, -lw / 2, -24, lw, 48, 12);
      ctx.fill();
      ctx.strokeStyle = '#6EE7B7';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#FFFFFF';
      ctx.fillText(data.backdropLowLabel, 0, 1);
      ctx.restore();
    }

    // Close rebound callout badge once trace completes
    if (data.backdropCloseLabel && drawProg >= 0.88) {
      const closeP = easeOutBack(clamp((drawProg - 0.88) / 0.12, 0, 1));
      const cx = plotX + plotW - 160;
      const cy = Math.max(plotTop + 34, mapY(curve[curve.length - 1]) - 54);
      ctx.save();
      ctx.globalAlpha = clamp(closeP, 0, 1);
      ctx.translate(cx, cy);
      ctx.font = `900 26px ${FONT}`;
      const cw = ctx.measureText(data.backdropCloseLabel).width + 34;
      ctx.fillStyle = 'rgba(251, 191, 36, 0.96)';
      roundRect(ctx, -cw / 2, -24, cw, 48, 12);
      ctx.fill();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#090D14';
      ctx.fillText(data.backdropCloseLabel, 0, 1);
      ctx.restore();
    }
    ctx.restore();
  }

  // Top chrome (segmented progress bar + brand lockup)
  drawV3TopChrome(rc, data.dateLabel, V3_COLORS.brandGold);

  // Series & Mood badge row (y: 138..194)
  const badgeT = easeOutCubic(clamp(localF / 10, 0, 1));
  ctx.save();
  ctx.globalAlpha = badgeT;
  ctx.font = `900 24px ${FONT}`;
  const sbW = ctx.measureText(data.seriesBadge).width + 32;
  ctx.fillStyle = V3_COLORS.brandGold;
  roundRect(ctx, V3_SAFE_ZONE.left, 138, sbW, 44, 10);
  ctx.fill();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#090D14';
  ctx.fillText(data.seriesBadge, V3_SAFE_ZONE.left + sbW / 2, 161);

  const moodX = V3_SAFE_ZONE.left + sbW + 14;
  ctx.font = `800 23px ${FONT}`;
  const moodW = ctx.measureText(data.moodLabel).width + 30;
  ctx.fillStyle = 'rgba(251, 146, 60, 0.16)';
  roundRect(ctx, moodX, 138, moodW, 44, 10);
  ctx.fill();
  ctx.strokeStyle = 'rgba(251, 146, 60, 0.55)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.fillStyle = V3_COLORS.warnOrange;
  ctx.fillText(data.moodLabel, moodX + moodW / 2, 161);
  ctx.restore();

  // Giant kinetic 2-line conflict headline (y: 214..438)
  const line1T = easeOutBack(clamp((localF - 4) / 14, 0, 1));
  ctx.save();
  ctx.globalAlpha = clamp(line1T, 0, 1);
  ctx.translate(V3_SAFE_ZONE.left, 256);
  ctx.scale(lerp(1.12, 1, clamp(line1T, 0, 1)), lerp(1.12, 1, clamp(line1T, 0, 1)));
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.font = `900 76px ${FONT}`;
  ctx.fillStyle = V3_COLORS.textPrimary;
  ctx.fillText(data.headlineLine1, 0, 0);
  ctx.restore();

  const line2T = easeOutBack(clamp((localF - 10) / 14, 0, 1));
  ctx.save();
  ctx.globalAlpha = clamp(line2T, 0, 1);
  ctx.translate(V3_SAFE_ZONE.left, 356);
  ctx.scale(lerp(1.18, 1, clamp(line2T, 0, 1)), lerp(1.18, 1, clamp(line2T, 0, 1)));
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.font = `900 84px ${FONT}`;

  if (data.accentWord && data.headlineLine2.includes(data.accentWord)) {
    const [prefix, suffix] = data.headlineLine2.split(data.accentWord);
    let curX = 0;
    if (prefix) {
      ctx.fillStyle = V3_COLORS.textPrimary;
      ctx.fillText(prefix, curX, 0);
      curX += ctx.measureText(prefix).width;
    }
    const accentW = ctx.measureText(data.accentWord).width;
    ctx.fillStyle = 'rgba(251, 191, 36, 0.22)';
    roundRect(ctx, curX - 8, -48, accentW + 16, 96, 14);
    ctx.fill();
    ctx.fillStyle = V3_COLORS.brandGold;
    ctx.fillText(data.accentWord, curX, 0);
    curX += accentW;
    if (suffix) {
      ctx.fillStyle = V3_COLORS.textPrimary;
      ctx.fillText(suffix, curX, 0);
    }
  } else {
    ctx.fillStyle = V3_COLORS.brandGold;
    ctx.fillText(data.headlineLine2, 0, 0);
  }
  ctx.restore();

  // 3 Giant KPI horizontal strips strictly inside safe zone (x: 48..928, y: 1054..1524)
  // Keeping right edge <= 928 avoids Douyin/WeChat right engagement rail (x > 936, y > 860)
  const kpiX = V3_SAFE_ZONE.left;
  const kpiW = 876;
  const kpiH = 136;
  const kpiGap = 20;
  const kpiStartY = 1068;

  data.metrics.forEach((m, idx) => {
    const enterF = 18 + idx * 8;
    if (localF < enterF) return;
    const p = easeOutCubic(clamp((localF - enterF) / 14, 0, 1));
    const cardY = kpiStartY + idx * (kpiH + kpiGap);
    const toneColor = resolveV3ToneColor(m.tone);

    ctx.save();
    ctx.globalAlpha = p;
    ctx.translate(lerp(-70, 0, p), 0);

    ctx.fillStyle = 'rgba(13, 19, 31, 0.9)';
    roundRect(ctx, kpiX, cardY, kpiW, kpiH, 18);
    ctx.fill();
    ctx.strokeStyle = `${toneColor}66`;
    ctx.lineWidth = 2;
    ctx.stroke();

    // Left tone bar
    ctx.fillStyle = toneColor;
    roundRect(ctx, kpiX, cardY + 18, 9, kpiH - 36, 4);
    ctx.fill();

    // Left label & sublabel
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.font = `900 32px ${FONT}`;
    ctx.fillStyle = V3_COLORS.textPrimary;
    ctx.fillText(m.label, kpiX + 30, cardY + (m.sublabel ? 48 : kpiH / 2));

    if (m.sublabel) {
      ctx.font = `600 23px ${FONT}`;
      ctx.fillStyle = V3_COLORS.textMuted;
      ctx.fillText(m.sublabel, kpiX + 30, cardY + 94);
    }

    // Right giant tabular value
    ctx.textAlign = 'right';
    ctx.font = `900 56px ${MONO}, ${FONT}`;
    ctx.fillStyle = toneColor;
    ctx.fillText(m.value, kpiX + kpiW - 28, cardY + kpiH / 2 + 2);
    ctx.restore();
  });

  drawV3SafeFooterWatermark(ctx, width);

  // Crisp exit shutter transition on final 6 frames
  const remaining = shot.durationFrames - 1 - localF;
  if (remaining < 6) {
    const wipeT = easeOutCubic(clamp((6 - remaining) / 6, 0, 1));
    ctx.fillStyle = `rgba(7, 10, 16, ${wipeT * 0.72})`;
    ctx.fillRect(0, 0, width, height);
  }
}
