import { clamp, easeOutCubic, lerp } from '../../timeline';
import type { V3ActionCheatsheetData } from '../schema';
import {
  FONT,
  MONO,
  drawWrappedText,
  roundRect,
  type SceneRenderContext,
} from './primitives';
import {
  V3_COLORS,
  V3_SAFE_ZONE,
  drawV3ObsidianBackdrop,
  drawV3SafeFooterWatermark,
  drawV3SceneEntrySweep,
  drawV3TopChrome,
  resolveV3ToneColor,
} from './v3BrandChrome';

/**
 * v3 Scene 7: Dual-Scenario 10:00 Pivot Chart + Screenshot-Ready Pre-Market Cheatsheet (8.0s / 240f)
 * - Upper Half: Strictly color-coded Red-Up (放量承接修复) vs Green-Down (缩量回落确认)
 * - Lower Half: Golden viewfinder-bracketed 《盘前30秒可截图备忘卡》 with screenshot cue
 * - All critical info strictly inside Safe Zone (y: 114..1556, lower-right x <= 930)
 */
export function renderV3ActionCheatsheetScene(
  rc: SceneRenderContext,
  data: V3ActionCheatsheetData
): void {
  const { ctx, localFrame: localF, timeline } = rc;
  const { width, height } = timeline;

  drawV3ObsidianBackdrop(ctx, width, height, V3_COLORS.brandGold);
  drawV3TopChrome(rc, data.headerTag, V3_COLORS.brandGold);

  const padX = V3_SAFE_ZONE.left;
  const topFullW = width - padX * 2; // 984px
  const lowerSafeW = 880; // x: 48..928 safely clear of Douyin right icon rail (y > 860)

  // ===================== UPPER HALF: 10:00 PIVOT SCENARIO CHART (y: 130..786) =====================
  const chartBoxY = 130;
  const chartBoxH = 656;

  ctx.save();
  ctx.fillStyle = 'rgba(13, 19, 31, 0.9)';
  roundRect(ctx, padX, chartBoxY, topFullW, chartBoxH, 22);
  ctx.fill();
  ctx.strokeStyle = 'rgba(251, 191, 36, 0.34)';
  ctx.lineWidth = 1.8;
  ctx.stroke();

  // Header row inside chart card
  ctx.fillStyle = V3_COLORS.brandGold;
  roundRect(ctx, padX + 24, chartBoxY + 26, 8, 34, 4);
  ctx.fill();

  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.font = `900 32px ${FONT}`;
  ctx.fillStyle = V3_COLORS.textPrimary;
  ctx.fillText(data.scenarioTitle, padX + 44, chartBoxY + 43);

  ctx.textAlign = 'right';
  ctx.font = `700 20px ${FONT}`;
  ctx.fillStyle = V3_COLORS.textMuted;
  ctx.fillText('红线=放量修复 · 绿线=缩量回落', padX + topFullW - 26, chartBoxY + 44);

  // Plot coordinates
  const plotX = padX + 46;
  const plotW = topFullW - 92;
  const plotTop = chartBoxY + 114;
  const plotBot = chartBoxY + chartBoxH - 76;

  const allVals = [...data.scenarioBase, ...data.scenarioSteady, ...data.scenarioWeak, 0];
  const minVal = Math.min(...allVals) - 0.35;
  const maxVal = Math.max(...allVals) + 0.4;

  const timeLabels = data.scenarioTimeLabels;
  const pivotIdx = 1; // 10:00 pivot is index 1
  const totalCols = Math.max(2, timeLabels.length - 1);
  const mapX = (idx: number) => plotX + (idx / totalCols) * plotW;
  const mapY = (v: number) =>
    lerp(plotBot, plotTop, clamp((v - minVal) / Math.max(0.5, maxVal - minVal), 0, 1));

  // Subtle horizontal guides + 0% baseline
  const zeroY = mapY(0);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([7, 6]);
  ctx.beginPath();
  ctx.moveTo(plotX, zeroY);
  ctx.lineTo(plotX + plotW, zeroY);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.textAlign = 'left';
  ctx.textBaseline = 'bottom';
  ctx.font = `700 18px ${MONO}`;
  ctx.fillStyle = 'rgba(148, 163, 184, 0.78)';
  ctx.fillText('0.0% 昨收平盘线', plotX + 4, zeroY - 6);

  // 10:00 Vertical Pivot Divider
  const pivotX = mapX(pivotIdx);
  ctx.strokeStyle = 'rgba(251, 191, 36, 0.55)';
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 6]);
  ctx.beginPath();
  ctx.moveTo(pivotX, plotTop - 16);
  ctx.lineTo(pivotX, plotBot + 10);
  ctx.stroke();
  ctx.setLineDash([]);

  // Pivot header pill
  ctx.font = `900 22px ${FONT}`;
  const pivW = ctx.measureText(data.pivotLabel).width + 28;
  ctx.fillStyle = 'rgba(251, 191, 36, 0.22)';
  roundRect(ctx, pivotX - pivW / 2, plotTop - 44, pivW, 36, 10);
  ctx.fill();
  ctx.strokeStyle = V3_COLORS.brandGold;
  ctx.lineWidth = 1.4;
  ctx.stroke();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = V3_COLORS.brandGoldLight;
  ctx.fillText(data.pivotLabel, pivotX, plotTop - 26);

  // Bottom time labels
  ctx.font = `800 21px ${MONO}`;
  ctx.textBaseline = 'top';
  timeLabels.forEach((lbl, idx) => {
    ctx.textAlign = idx === 0 ? 'left' : idx === timeLabels.length - 1 ? 'right' : 'center';
    ctx.fillStyle = idx === pivotIdx ? V3_COLORS.brandGold : V3_COLORS.textMuted;
    ctx.fillText(lbl, mapX(idx), plotBot + 22);
  });

  // Step 1: Opening base curve (09:25 -> 10:00)
  const baseT = easeOutCubic(clamp((localF - 6) / 26, 0, 1));
  const b0x = mapX(0);
  const b0y = mapY(data.scenarioBase[0]);
  const b1x = mapX(pivotIdx);
  const b1y = mapY(data.scenarioBase[1]);

  if (baseT > 0.01) {
    ctx.strokeStyle = V3_COLORS.infoCyan;
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(b0x, b0y);
    ctx.lineTo(lerp(b0x, b1x, baseT), lerp(b0y, b1y, baseT));
    ctx.stroke();

    // Opening label pill
    ctx.font = `800 21px ${FONT}`;
    const openW = ctx.measureText(data.openingLabel).width + 24;
    ctx.fillStyle = 'rgba(56, 189, 248, 0.2)';
    roundRect(ctx, b0x, b0y + 18, openW, 34, 8);
    ctx.fill();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#BAE6FD';
    ctx.fillText(data.openingLabel, b0x + openW / 2, b0y + 35);
  }

  // Pulsing 10:00 pivot node
  if (localF >= 26) {
    const pulse = 0.5 + 0.5 * Math.sin((localF - 26) * 0.22);
    ctx.fillStyle = `rgba(251, 191, 36, ${0.22 + pulse * 0.2})`;
    ctx.beginPath();
    ctx.arc(b1x, b1y, 18 + pulse * 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = V3_COLORS.brandGold;
    ctx.beginPath();
    ctx.arc(b1x, b1y, 9, 0, Math.PI * 2);
    ctx.fill();
  }

  // Helper to draw a progressive branch after 10:00 pivot
  const drawBranch = (
    points: number[],
    color: string,
    label: string,
    t: number,
    labelOffsetY: number
  ) => {
    if (t <= 0.01 || points.length < 2) return;
    const coords = points.map((v, i) => ({
      x: mapX(pivotIdx + i),
      y: mapY(v),
    }));
    const segs = coords.length - 1;
    const maxFloat = t * segs;
    const full = Math.floor(maxFloat);
    const frac = maxFloat - full;
    const tip =
      full >= segs
        ? coords[segs]
        : {
            x: lerp(coords[full].x, coords[full + 1].x, frac),
            y: lerp(coords[full].y, coords[full + 1].y, frac),
          };

    ctx.save();
    ctx.shadowColor = `${color}88`;
    ctx.shadowBlur = 14;
    ctx.strokeStyle = color;
    ctx.lineWidth = 6;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(coords[0].x, coords[0].y);
    for (let i = 1; i <= full; i++) {
      ctx.lineTo(coords[i].x, coords[i].y);
    }
    ctx.lineTo(tip.x, tip.y);
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Endpoint dot
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(tip.x, tip.y, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.stroke();

    // Branch pill label near right side once >= 70% drawn
    if (t >= 0.65) {
      const lp = easeOutCubic(clamp((t - 0.65) / 0.35, 0, 1));
      ctx.globalAlpha = lp;
      ctx.font = `900 23px ${FONT}`;
      const lw = ctx.measureText(label).width + 28;
      const lx = Math.min(plotX + plotW - lw, coords[coords.length - 1].x - lw + 4);
      const ly = clamp(coords[coords.length - 1].y + labelOffsetY, plotTop + 8, plotBot - 44);
      ctx.fillStyle = `${color}28`;
      roundRect(ctx, lx, ly, lw, 40, 10);
      ctx.fill();
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.8;
      ctx.stroke();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#FFFFFF';
      ctx.fillText(label, lx + lw / 2, ly + 20);
    }
    ctx.restore();
  };

  // Branch 1: UP / Steady Rebound -> STRICT UP RED (#F87171)
  const steadyT = easeOutCubic(clamp((localF - 32) / 36, 0, 1));
  drawBranch(data.scenarioSteady, V3_COLORS.upRed, data.steadyBranchLabel, steadyT, -52);

  // Branch 2: DOWN / Weak Pullback -> STRICT DOWN GREEN (#34D399)
  const weakT = easeOutCubic(clamp((localF - 46) / 36, 0, 1));
  drawBranch(data.scenarioWeak, V3_COLORS.downGreen, data.weakBranchLabel, weakT, 14);
  ctx.restore();

  // ===================== LOWER HALF: SCREENSHOT-READY CHEATSHEET (y: 814..1544) =====================
  const sheetStart = 76;
  if (localF >= sheetStart) {
    const sp = easeOutCubic(clamp((localF - sheetStart) / 16, 0, 1));
    const cardY = 816;
    const cardH = 724;

    ctx.save();
    ctx.globalAlpha = sp;
    ctx.translate(0, lerp(42, 0, sp));

    // Obsidian-gold framed cheatsheet card
    const cardGrad = ctx.createLinearGradient(padX, cardY, padX + lowerSafeW, cardY + cardH);
    cardGrad.addColorStop(0, 'rgba(18, 25, 40, 0.96)');
    cardGrad.addColorStop(1, 'rgba(11, 16, 28, 0.98)');
    ctx.fillStyle = cardGrad;
    roundRect(ctx, padX, cardY, lowerSafeW, cardH, 22);
    ctx.fill();
    ctx.strokeStyle = 'rgba(251, 191, 36, 0.58)';
    ctx.lineWidth = 2.2;
    ctx.stroke();

    // Subtle viewfinder corner brackets reinforcing "screenshot-ready" utility
    const bLen = 22;
    ctx.strokeStyle = V3_COLORS.brandGold;
    ctx.lineWidth = 4;
    const corners: Array<[number, number, number, number]> = [
      [padX + 12, cardY + 12, 1, 1],
      [padX + lowerSafeW - 12, cardY + 12, -1, 1],
      [padX + 12, cardY + cardH - 12, 1, -1],
      [padX + lowerSafeW - 12, cardY + cardH - 12, -1, -1],
    ];
    for (const [cx, cy, dx, dy] of corners) {
      ctx.beginPath();
      ctx.moveTo(cx, cy + dy * bLen);
      ctx.lineTo(cx, cy);
      ctx.lineTo(cx + dx * bLen, cy);
      ctx.stroke();
    }

    // Header row: Title left + Screenshot Cue pill right
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.font = `900 32px ${FONT}`;
    ctx.fillStyle = V3_COLORS.brandGoldLight;
    ctx.fillText(data.cheatsheetTitle, padX + 30, cardY + 52);

    const cuePulse = localF >= 136 ? 0.5 + 0.5 * Math.sin((localF - 136) * 0.2) : 0;
    ctx.font = `900 21px ${FONT}`;
    const cueW = ctx.measureText(data.saveCue).width + 30;
    const cueX = padX + lowerSafeW - cueW - 28;
    ctx.fillStyle = `rgba(251, 191, 36, ${0.22 + cuePulse * 0.16})`;
    roundRect(ctx, cueX, cardY + 32, cueW, 40, 10);
    ctx.fill();
    ctx.strokeStyle = V3_COLORS.brandGold;
    ctx.lineWidth = 1.6;
    ctx.stroke();
    ctx.textAlign = 'center';
    ctx.fillStyle = V3_COLORS.brandGoldLight;
    ctx.fillText(data.saveCue, cueX + cueW / 2, cardY + 53);

    // Subtle divider
    ctx.fillStyle = 'rgba(251, 191, 36, 0.22)';
    ctx.fillRect(padX + 28, cardY + 90, lowerSafeW - 56, 1.5);

    // 3 Staggered Checklist Rows
    const rowH = 148;
    const rowGap = 16;
    data.checklist.slice(0, 3).forEach((item, idx) => {
      const rEnter = sheetStart + 10 + idx * 14;
      const rp = easeOutCubic(clamp((localF - rEnter) / 14, 0, 1));
      if (rp <= 0) return;
      const ry = cardY + 112 + idx * (rowH + rowGap);
      const toneColor = resolveV3ToneColor(item.tone);

      ctx.save();
      ctx.globalAlpha = rp;
      ctx.translate(lerp(-32, 0, rp), 0);

      ctx.fillStyle = 'rgba(255, 255, 255, 0.045)';
      roundRect(ctx, padX + 26, ry, lowerSafeW - 52, rowH, 16);
      ctx.fill();
      ctx.strokeStyle = `${toneColor}55`;
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Number badge
      ctx.fillStyle = toneColor;
      roundRect(ctx, padX + 42, ry + 22, 54, 46, 10);
      ctx.fill();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `900 26px ${MONO}`;
      ctx.fillStyle = '#070A10';
      ctx.fillText(item.num, padX + 69, ry + 46);

      // Action Tag pill
      ctx.font = `900 24px ${FONT}`;
      const tagW = ctx.measureText(item.tag).width + 26;
      ctx.fillStyle = `${toneColor}22`;
      roundRect(ctx, padX + 108, ry + 24, tagW, 42, 9);
      ctx.fill();
      ctx.fillStyle = toneColor;
      ctx.fillText(item.tag, padX + 108 + tagW / 2, ry + 45);

      // Body copy
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.font = `700 25px ${FONT}`;
      ctx.fillStyle = V3_COLORS.textPrimary;
      drawWrappedText(ctx, item.text, padX + 42, ry + 80, lowerSafeW - 108, 34);
      ctx.restore();
    });

    // Closing rhythm anchor inside bottom of cheatsheet card
    const closeEnter = sheetStart + 54;
    const cp = easeOutCubic(clamp((localF - closeEnter) / 14, 0, 1));
    if (cp > 0) {
      ctx.save();
      ctx.globalAlpha = cp;
      ctx.fillStyle = 'rgba(251, 191, 36, 0.14)';
      roundRect(ctx, padX + 26, cardY + cardH - 110, lowerSafeW - 52, 82, 14);
      ctx.fill();

      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `900 27px ${FONT}`;
      ctx.fillStyle = V3_COLORS.brandGoldLight;
      ctx.fillText(data.closingLine, padX + lowerSafeW / 2, cardY + cardH - 78);

      ctx.font = `600 18px ${FONT}`;
      ctx.fillStyle = V3_COLORS.textMuted;
      ctx.fillText(
        data.disclaimer || '以上为隔夜数据与历史节奏客观推演，不构成具体买卖建议',
        padX + lowerSafeW / 2,
        cardY + cardH - 44
      );
      ctx.restore();
    }

    ctx.restore();
  }

  drawV3SafeFooterWatermark(ctx, width);
  drawV3SceneEntrySweep(ctx, width, height, localF, V3_COLORS.brandGold);
}
