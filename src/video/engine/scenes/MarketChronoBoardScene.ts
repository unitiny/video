import { clamp, easeOutCubic, lerp } from '../../timeline';
import type { CleanIndexChartItem, MarketBoardSceneData } from '../schema';
import {
  getCardEnterProgress,
  resolveMarketBoardTiming,
  selectAnomalousCommodities,
} from '../timeline';
import {
  FONT,
  MONO,
  drawCleanIndexCard,
  drawHeaderProgress,
  drawTypewriterSummaryStrip,
  drawWrappedText,
  easeOutBack,
  roundRect,
  type SceneRenderContext,
} from './primitives';

/**
 * Fallback calm-market banner card when 0 commodities breach the anomaly threshold.
 */
function drawCalmCommoditiesCard(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  data: MarketBoardSceneData,
  thresholdPct: number,
  localF: number,
  enterFrame: number,
  light = false,
  minimal = false
): void {
  if (localF < enterFrame) return;

  const p = getCardEnterProgress(localF, enterFrame, 16);
  const e = easeOutCubic(p);

  ctx.save();
  ctx.globalAlpha = clamp(p * 1.6, 0, 1);
  ctx.translate(0, lerp(36, 0, e));

  if (light) {
    ctx.shadowColor = 'rgba(15, 23, 42, 0.08)';
    ctx.shadowBlur = 18;
    ctx.shadowOffsetY = 6;
    ctx.fillStyle = '#FFFFFF';
  } else {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
  }
  roundRect(ctx, x, y, w, h, 14);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
  ctx.strokeStyle = light ? '#CBD5E1' : 'rgba(148, 163, 184, 0.24)';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.fillStyle = light ? '#64748B' : '#64748B';
  roundRect(ctx, x, y + 18, 6, h - 36, 3);
  ctx.fill();

  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.font = `900 34px ${FONT}`;
  ctx.fillStyle = light ? '#0F172A' : '#E2E8F0';
  ctx.fillText('大宗商品平稳运行 · 无显著异动', x + 28, minimal ? y + 64 : y + 66);

  if (!minimal) {
    ctx.font = `700 22px ${MONO}, ${FONT}`;
    ctx.fillStyle = light ? '#475569' : '#94A3B8';
    ctx.fillText(
      `全监测池涨跌幅均处于 ±${thresholdPct.toFixed(1)}% 阈值以内`,
      x + 28,
      y + 114
    );
  }

  // Render compact horizontal summary pills of watchlist items (up to 4)
  const previewItems = data.commodityWatchlist.slice(0, 4);
  if (previewItems.length > 0) {
    const pillGap = 14;
    const pillW = Math.floor((w - 56 - pillGap * (previewItems.length - 1)) / previewItems.length);
    const pillY = minimal ? y + 118 : y + 154;
    const pillH = minimal ? 88 : 66;

    previewItems.forEach((item, idx) => {
      const px = x + 28 + idx * (pillW + pillGap);
      ctx.fillStyle = light ? '#F8FAFC' : 'rgba(7, 11, 18, 0.78)';
      roundRect(ctx, px, pillY, pillW, pillH, 10);
      ctx.fill();
      ctx.strokeStyle = light ? '#E2E8F0' : 'rgba(255, 255, 255, 0.08)';
      ctx.lineWidth = 1;
      ctx.stroke();

      if (minimal) {
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.font = `700 19px ${FONT}`;
        ctx.fillStyle = light ? '#334155' : '#CBD5E1';
        ctx.fillText(item.name, px + pillW / 2, pillY + 15, pillW - 14);

        const sign = item.changePct >= 0 ? '+' : '';
        ctx.font = `900 26px ${MONO}`;
        ctx.fillStyle = light
          ? item.changePct >= 0
            ? '#DC2626'
            : '#059669'
          : item.changePct >= 0
            ? '#F87171'
            : '#34D399';
        ctx.fillText(`${sign}${item.changePct.toFixed(2)}%`, px + pillW / 2, pillY + 46, pillW - 14);
      } else {
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.font = `700 21px ${FONT}`;
        ctx.fillStyle = light ? '#1E293B' : '#CBD5E1';
        ctx.fillText(item.name, px + 14, pillY + pillH / 2);

        const sign = item.changePct >= 0 ? '+' : '';
        ctx.textAlign = 'right';
        ctx.font = `800 22px ${MONO}`;
        ctx.fillStyle = light
          ? item.changePct >= 0
            ? '#DC2626'
            : '#059669'
          : item.changePct >= 0
            ? '#F87171'
            : '#34D399';
        ctx.fillText(`${sign}${item.changePct.toFixed(2)}%`, px + pillW - 14, pillY + pillH / 2);
      }
    });
  }

  ctx.restore();
}

const BRUSH_FONT =
  '"Ma Shan Zheng", "ZCOOL QingKe HuangYou", "Noto Sans SC", "PingFang SC", sans-serif';

function drawCompactPolishedCommodityCard(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  data: MarketBoardSceneData,
  thresholdPct: number,
  localF: number,
  enterFrame: number,
  typeStartFrame: number,
  typeEndFrame: number,
  activeGlow: boolean
): void {
  if (localF < enterFrame) return;

  const p = getCardEnterProgress(localF, enterFrame, 16);
  const e = easeOutCubic(p);

  ctx.save();
  ctx.globalAlpha = clamp(p * 1.6, 0, 1);
  ctx.translate(0, lerp(30, 0, e));

  if (activeGlow) {
    ctx.shadowColor = 'rgba(245, 158, 11, 0.25)';
    ctx.shadowBlur = 22;
  }
  const bg = ctx.createLinearGradient(x, y, x, y + h);
  bg.addColorStop(0, activeGlow ? '#12192A' : '#0B111E');
  bg.addColorStop(1, '#050810');
  ctx.fillStyle = bg;
  roundRect(ctx, x, y, w, h, 14);
  ctx.fill();
  ctx.shadowBlur = 0;

  ctx.strokeStyle = activeGlow ? '#F59E0B' : 'rgba(255, 255, 255, 0.14)';
  ctx.lineWidth = activeGlow ? 2 : 1.2;
  ctx.stroke();

  // Top specular rim
  const rim = ctx.createLinearGradient(x + 18, y, x + w - 18, y);
  rim.addColorStop(0, 'rgba(255,255,255,0)');
  rim.addColorStop(0.5, activeGlow ? 'rgba(251, 191, 36, 0.38)' : 'rgba(255,255,255,0.16)');
  rim.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = rim;
  ctx.fillRect(x + 18, y + 1, w - 36, 1.5);

  ctx.fillStyle = '#F59E0B';
  roundRect(ctx, x, y + 12, 6, h - 24, 3);
  ctx.fill();

  // Header row (enlarged headline + clear threshold tag)
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.font = `900 37px ${FONT}`;
  ctx.fillStyle = '#FBBF24';
  ctx.fillText(data.commodityHeadline, x + 22, y + 30, w - 236);

  ctx.textAlign = 'right';
  ctx.font = `700 22px ${MONO}, ${FONT}`;
  ctx.fillStyle = '#94A3B8';
  ctx.fillText(`±${thresholdPct.toFixed(1)}% 平稳过滤`, x + w - 20, y + 30);

  // 4 compact glass commodity tiles with larger legible labels & percentages
  const previewItems = data.commodityWatchlist.slice(0, 4);
  if (previewItems.length > 0) {
    const tileGap = 12;
    const tileW = Math.floor((w - 44 - tileGap * (previewItems.length - 1)) / previewItems.length);
    const tileY = y + 54;
    const tileH = 82;

    previewItems.forEach((item, idx) => {
      const tx = x + 22 + idx * (tileW + tileGap);
      ctx.fillStyle = 'rgba(7, 11, 20, 0.9)';
      roundRect(ctx, tx, tileY, tileW, tileH, 10);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.font = `700 23px ${FONT}`;
      ctx.fillStyle = '#E2E8F0';
      ctx.fillText(item.name, tx + tileW / 2, tileY + 10, tileW - 12);

      const sign = item.changePct >= 0 ? '+' : '';
      ctx.font = `900 30px ${MONO}`;
      ctx.fillStyle = item.changePct >= 0 ? '#F87171' : '#34D399';
      ctx.fillText(`${sign}${item.changePct.toFixed(2)}%`, tx + tileW / 2, tileY + 44, tileW - 12);
    });
  }

  // Bottom 2-line wrapped typewriter explanation (enlarged 31px, crisp readability!)
  const chars = Array.from(data.commodityReason);
  const typeT =
    localF < typeStartFrame
      ? 0
      : clamp((localF - typeStartFrame) / Math.max(1, typeEndFrame - typeStartFrame), 0, 1);
  const visible = typeT <= 0 ? '' : chars.slice(0, Math.max(1, Math.floor(typeT * chars.length))).join('');
  const typing = typeT > 0 && typeT < 1;
  const caret = typing && Math.floor(localF / 6) % 2 === 0 ? '▌' : '';

  if (visible) {
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.font = `600 31px ${FONT}`;
    ctx.fillStyle = '#F1F5F9';
    drawWrappedText(ctx, visible + caret, x + 22, y + 148, w - 44, 38);
  }

  ctx.restore();
}

/**
 * Animated brush-calligraphy two-tone hero title styled after the poster headlines:
 * jagged black/crimson paint splash ribbon + slanted white/gold extruded characters +
 * sweeping metallic sheen + rising golden embers.
 */
function drawAnimatedBrushHeroTitle(
  ctx: CanvasRenderingContext2D,
  width: number,
  heroTitle: string,
  localF: number,
  light: boolean,
  customCenterY = 82,
  customFontSize = 92,
  customRibbonW = 910
): void {
  const enterT = clamp(localF / 18, 0, 1);
  const slamScale = lerp(1.26, 1.0, easeOutBack(enterT));
  const breatheScale = 1 + 0.012 * Math.sin(localF * 0.075);
  const scale = slamScale * breatheScale;
  const ribbonT = easeOutCubic(clamp(localF / 12, 0, 1));

  // Split title cleanly like the poster lockups ("11月26号" + "盘前一览")
  const match = heroTitle.match(/^(\d+月\d+[号日]?)(.+)$/);
  const leftPart = match ? match[1] : heroTitle;
  const rightPart = match ? match[2] : '';

  const centerX = width / 2;
  const centerY = customCenterY;

  ctx.save();
  ctx.translate(centerX, centerY);

  // 1) Crimson & black jagged brush-splash backing ribbon (slashes in left->right)
  const ribbonW = customRibbonW * ribbonT;
  const ribbonHalfW = ribbonW / 2;
  ctx.save();
  ctx.globalAlpha = clamp(localF / 8, 0, 1);
  ctx.transform(1, -0.024, -0.14, 1, 0, 0);

  // Crimson under-splash offset
  ctx.fillStyle = light ? '#DC2626' : '#B91C1C';
  ctx.beginPath();
  ctx.moveTo(-ribbonHalfW - 24, -44);
  ctx.lineTo(ribbonHalfW + 16, -50);
  ctx.lineTo(ribbonHalfW + 32, -16);
  ctx.lineTo(ribbonHalfW + 10, 14);
  ctx.lineTo(ribbonHalfW + 26, 50);
  ctx.lineTo(-ribbonHalfW + 10, 52);
  ctx.lineTo(-ribbonHalfW - 34, 18);
  ctx.lineTo(-ribbonHalfW - 14, -12);
  ctx.closePath();
  ctx.fill();

  // Jagged pure ink brush splash inside
  ctx.fillStyle = light ? '#0F172A' : '#090D16';
  ctx.beginPath();
  ctx.moveTo(-ribbonHalfW - 10, -48);
  ctx.lineTo(ribbonHalfW + 22, -44);
  ctx.lineTo(ribbonHalfW + 10, -4);
  ctx.lineTo(ribbonHalfW + 24, 38);
  ctx.lineTo(-ribbonHalfW - 18, 42);
  ctx.lineTo(-ribbonHalfW - 4, 2);
  ctx.closePath();
  ctx.fill();

  // Paint splatter dots at ribbon tips
  if (ribbonT > 0.6) {
    const splatAlpha = clamp((ribbonT - 0.6) / 0.4, 0, 1);
    ctx.globalAlpha *= splatAlpha;
    ctx.fillStyle = '#EF4444';
    ctx.beginPath();
    ctx.arc(-ribbonHalfW - 38, -28, 5, 0, Math.PI * 2);
    ctx.arc(ribbonHalfW + 40, 26, 5.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#FACC15';
    ctx.beginPath();
    ctx.arc(ribbonHalfW + 34, -36, 4, 0, Math.PI * 2);
    ctx.arc(-ribbonHalfW - 28, 36, 3.8, 0, Math.PI * 2);
    ctx.fill();
  }

  // Sharp neon/crimson bottom highlight underline stroke
  const lineGrad = ctx.createLinearGradient(-ribbonHalfW, 0, ribbonHalfW, 0);
  lineGrad.addColorStop(0, 'rgba(239, 68, 68, 0)');
  lineGrad.addColorStop(0.2, '#EF4444');
  lineGrad.addColorStop(0.55, '#FACC15');
  lineGrad.addColorStop(0.85, '#EF4444');
  lineGrad.addColorStop(1, 'rgba(239, 68, 68, 0)');
  ctx.fillStyle = lineGrad;
  ctx.fillRect(-ribbonHalfW, 42, ribbonW, 5);
  ctx.restore();

  // 2) Subtle orbiting spark particles around the brush title
  if (!light) {
    for (let i = 0; i < 14; i++) {
      const pPhase = (localF * 0.028 + i * 0.071) % 1;
      const px = lerp(-420, 420, ((i * 73) % 100) / 100) + Math.sin(localF * 0.1 + i) * 14;
      const py = lerp(38, -50, pPhase);
      const pAlpha = Math.sin(pPhase * Math.PI) * 0.88;
      ctx.fillStyle =
        i % 3 === 0
          ? `rgba(250, 204, 21, ${pAlpha})`
          : i % 3 === 1
            ? `rgba(248, 113, 113, ${pAlpha})`
            : `rgba(255, 255, 255, ${pAlpha * 0.72})`;
      ctx.beginPath();
      ctx.arc(px, py, lerp(4.4, 1.5, pPhase), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // 3) Slanted oversized brush typography (white metallic left + fiery gold right)
  ctx.scale(scale, scale);
  ctx.transform(1, -0.02, -0.14, 1, 0, 0);
  ctx.globalAlpha = clamp(localF / 7, 0, 1);

  const fontSize = customFontSize;
  ctx.font = `900 ${fontSize}px ${BRUSH_FONT}`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';

  const gapW = rightPart ? 14 : 0;
  const leftW = ctx.measureText(leftPart).width;
  const rightW = rightPart ? ctx.measureText(rightPart).width : 0;
  const totalW = leftW + gapW + rightW;
  const startX = -totalW / 2;

  const drawStyledBrushText = (
    txt: string,
    tx: number,
    topCol: string,
    midCol: string,
    botCol: string,
    glowCol: string
  ) => {
    // 3D hard extrusion shadow
    ctx.lineJoin = 'round';
    ctx.miterLimit = 2;
    ctx.fillStyle = '#000000';
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 13;
    ctx.strokeText(txt, tx + 4, 6);
    ctx.fillText(txt, tx + 4, 6);

    // Outer glow + thick dark crisp border
    ctx.shadowColor = glowCol;
    ctx.shadowBlur = 22;
    ctx.lineWidth = 10;
    ctx.strokeStyle = '#05070B';
    ctx.strokeText(txt, tx, 0);
    ctx.shadowBlur = 0;

    // Rich vertical gradient fill
    const grad = ctx.createLinearGradient(0, -fontSize * 0.48, 0, fontSize * 0.48);
    grad.addColorStop(0, topCol);
    grad.addColorStop(0.52, midCol);
    grad.addColorStop(1, botCol);
    ctx.fillStyle = grad;
    ctx.fillText(txt, tx, 0);

    // Sweeping metallic light sheen highlight across characters
    const sweepCycle = (localF % 84) / 84;
    if (sweepCycle < 0.45) {
      const sheenX = lerp(-totalW * 0.65, totalW * 0.65, sweepCycle / 0.45);
      const sheenGrad = ctx.createLinearGradient(sheenX - 42, -35, sheenX + 42, 35);
      sheenGrad.addColorStop(0, 'rgba(255, 255, 255, 0)');
      sheenGrad.addColorStop(0.5, 'rgba(255, 255, 255, 0.72)');
      sheenGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
      ctx.fillStyle = sheenGrad;
      ctx.fillText(txt, tx, 0);
    }
  };

  drawStyledBrushText(
    leftPart,
    startX,
    '#FFFFFF',
    '#F8FAFC',
    '#CBD5E1',
    'rgba(255, 255, 255, 0.35)'
  );
  if (rightPart) {
    drawStyledBrushText(
      rightPart,
      startX + leftW + gapW,
      '#FEF9C3',
      '#FACC15',
      '#EA580C',
      'rgba(250, 204, 21, 0.48)'
    );
  }

  // Impact flash on slam peak
  if (localF >= 6 && localF < 16) {
    ctx.globalAlpha = lerp(0.42, 0, (localF - 6) / 10);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(leftPart, startX, 0);
    if (rightPart) ctx.fillText(rightPart, startX + leftW + gapW, 0);
  }

  ctx.restore();
}

/**
 * Scene: market_chrono_board
 * Ordered Progressive Global Market Board:
 * - Row 1: US [2 cards] + highlighted 36px headline + 27px typewriter reason + reading pause
 * - Row 2: Asia [2 cards] + 26px typewriter reason
 * - Row 3: Anomalous Commodities Only (2-col, 1-col full-width, or 0-anomaly calm card) + reason
 * - Row 4: Full-Width Oversized A50 Hero + typewriter intraday shape note
 */
export function renderMarketChronoBoardScene(
  rc: SceneRenderContext,
  data: MarketBoardSceneData
): void {
  const { ctx, frame, localFrame: localF, timeline, episode } = rc;
  const { width, height, totalFrames } = timeline;
  const timing = resolveMarketBoardTiming(data.timing);
  const isLight = data.theme === 'light';
  const minimalHeader = Boolean(data.minimalHeader || data.centeredHeroTitle);

  const safeInset = Boolean(data.safeInset);
  const polished = Boolean(data.polished || safeInset);

  ctx.fillStyle = isLight ? '#FFFFFF' : minimalHeader || safeInset ? '#000000' : '#090D14';
  ctx.fillRect(0, 0, width, height);

  // Subtle grid background
  ctx.strokeStyle = isLight ? 'rgba(15, 23, 42, 0.035)' : 'rgba(255, 255, 255, 0.026)';
  ctx.lineWidth = 1;
  for (let gx = 0; gx <= width; gx += 60) {
    ctx.beginPath();
    ctx.moveTo(gx, 0);
    ctx.lineTo(gx, height);
    ctx.stroke();
  }
  for (let gy = 0; gy <= height; gy += 60) {
    ctx.beginPath();
    ctx.moveTo(0, gy);
    ctx.lineTo(width, gy);
    ctx.stroke();
  }

  // Dedicated 4-side Douyin-safe & polished obsidian layout branch
  if (safeInset) {
    const activeStage =
      localF >= timing.a50Start
        ? 3
        : localF >= timing.commodityStart
          ? 2
          : localF >= timing.asiaStart
            ? 1
            : 0;

    // Soft visual-guidance ambient spotlight following active row
    const spotYTargets = [367, 750, 1073, 1455];
    const spotColors = [
      'rgba(56, 189, 248, 0.12)',
      'rgba(52, 211, 153, 0.12)',
      'rgba(245, 158, 11, 0.12)',
      'rgba(251, 191, 36, 0.16)',
    ];
    const spotY = spotYTargets[activeStage];
    const aura = ctx.createRadialGradient(width / 2, spotY, 40, width / 2, spotY, 560);
    aura.addColorStop(0, spotColors[activeStage]);
    aura.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = aura;
    ctx.fillRect(0, 0, width, height);

    // Full-bleed top hairline progress + generous safe-margin card grid
    const padX = 44;
    const fullW = width - padX * 2; // 992px
    const gap = 16;
    const colW = (fullW - gap) / 2; // 488px
    const xLeft = padX;
    const xRight = padX + colW + gap;

    const progress = clamp(frame / Math.max(1, totalFrames - 1), 0, 1);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.16)';
    ctx.fillRect(0, 8, width, 5);
    ctx.fillStyle = '#FACC15';
    ctx.fillRect(0, 8, Math.max(12, width * progress), 5);

    // Refined Brush Hero Title inside safe top lane
    const heroTitle = data.centeredHeroTitle ?? episode.title;
    drawAnimatedBrushHeroTitle(ctx, width, heroTitle, localF, false, 122, 80, 890);

    // Left-edge subtle visual guidance progress rail (4 glowing step nodes)
    const railX = 22;
    const railNodesY = [288, 672, 1073, 1455];
    const railColors = ['#38BDF8', '#34D399', '#F59E0B', '#FACC15'];
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(railX, railNodesY[0]);
    ctx.lineTo(railX, railNodesY[3]);
    ctx.stroke();

    const beamY = railNodesY[activeStage];
    const beamGrad = ctx.createLinearGradient(0, railNodesY[0], 0, beamY);
    beamGrad.addColorStop(0, '#38BDF8');
    beamGrad.addColorStop(1, railColors[activeStage]);
    ctx.strokeStyle = beamGrad;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(railX, railNodesY[0]);
    ctx.lineTo(railX, beamY);
    ctx.stroke();

    railNodesY.forEach((ny, idx) => {
      const reached = idx <= activeStage;
      const isCur = idx === activeStage;
      if (isCur) {
        ctx.fillStyle = `${railColors[idx]}44`;
        ctx.beginPath();
        ctx.arc(railX, ny, 12, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = reached ? railColors[idx] : 'rgba(255, 255, 255, 0.22)';
      ctx.beginPath();
      ctx.arc(railX, ny, isCur ? 6 : 4, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.restore();

    // PART 1: US Markets (y = 180..392, summary y = 400..558 with enlarged 39px/32px typography!)
    const usActive = activeStage === 0;
    drawCleanIndexCard(ctx, xLeft, 180, colW, 212, data.usIndices[0], localF, timing.usStart, 'left', {
      light: false,
      polished: true,
      activeGlow: usActive,
    });
    drawCleanIndexCard(ctx, xRight, 180, colW, 212, data.usIndices[1], localF, timing.usStart + 4, 'right', {
      light: false,
      polished: true,
      activeGlow: usActive,
    });
    drawTypewriterSummaryStrip(
      ctx,
      xLeft,
      400,
      fullW,
      158,
      '#FBBF24',
      data.usHeadline,
      data.usReason,
      localF,
      timing.usHeadlineFrame,
      timing.usTypeStart,
      timing.usTypeEnd,
      39,
      32,
      timing.asiaStart,
      false,
      true,
      usActive
    );

    // PART 2: Asia Open (y = 570..778, summary y = 786..942 with enlarged 38px/32px typography!)
    const asiaActive = activeStage === 1;
    drawCleanIndexCard(ctx, xLeft, 570, colW, 208, data.asiaIndices[0], localF, timing.asiaStart, 'left', {
      light: false,
      polished: true,
      activeGlow: asiaActive,
    });
    drawCleanIndexCard(ctx, xRight, 570, colW, 208, data.asiaIndices[1], localF, timing.asiaStart + 4, 'right', {
      light: false,
      polished: true,
      activeGlow: asiaActive,
    });
    drawTypewriterSummaryStrip(
      ctx,
      xLeft,
      786,
      fullW,
      156,
      '#34D399',
      data.asiaHeadline,
      data.asiaReason,
      localF,
      timing.asiaStart + 10,
      timing.asiaTypeStart,
      timing.asiaTypeEnd,
      38,
      32,
      undefined,
      false,
      true,
      asiaActive
    );

    // PART 3: Commodities (y = 954..1206, height = 252 with enlarged 37px title + 31px 2-line explanation!)
    const comActive = activeStage === 2;
    const thresholdPct = data.anomalyThresholdPct ?? 2.5;
    const anomalies = selectAnomalousCommodities(data.commodityWatchlist, thresholdPct);
    const anomCharts = anomalies
      .map((a) => data.commodityCharts[a.id])
      .filter((c): c is CleanIndexChartItem => Boolean(c));

    if (anomCharts.length >= 2) {
      drawCleanIndexCard(ctx, xLeft, 954, colW, 252, anomCharts[0], localF, timing.commodityStart, 'left', {
        light: false,
        polished: true,
        activeGlow: comActive,
      });
      drawCleanIndexCard(ctx, xRight, 954, colW, 252, anomCharts[1], localF, timing.commodityStart + 4, 'right', {
        light: false,
        polished: true,
        activeGlow: comActive,
      });
    } else if (anomCharts.length === 1) {
      drawCleanIndexCard(ctx, xLeft, 954, fullW, 252, anomCharts[0], localF, timing.commodityStart, 'up', {
        light: false,
        polished: true,
        activeGlow: comActive,
      });
    } else {
      drawCompactPolishedCommodityCard(
        ctx,
        xLeft,
        954,
        fullW,
        252,
        data,
        thresholdPct,
        localF,
        timing.commodityStart,
        timing.commodityTypeStart,
        timing.commodityTypeEnd,
        comActive
      );
    }

    // PART 4: A50 Oversized Hero Card (y = 1218..1694, height = 476, leaving 226px Douyin bottom safe zone!)
    drawCleanIndexCard(ctx, xLeft, 1218, fullW, 476, data.a50Hero, localF, timing.a50Start, 'bottom', {
      accentColorOverride: '#FBBF24',
      heroShapeNote: data.a50Hero.intradayShapeNote,
      heroNoteStartFrame: timing.a50NoteStart,
      heroNoteEndFrame: timing.a50NoteEnd,
      light: false,
      polished: true,
      activeGlow: activeStage === 3,
    });
    return;
  }

  if (minimalHeader) {
    // Slim hairline progress at very top + ONLY the large animated brush hero title
    const progress = clamp(frame / Math.max(1, totalFrames - 1), 0, 1);
    ctx.fillStyle = isLight ? 'rgba(15, 23, 42, 0.08)' : 'rgba(255, 255, 255, 0.14)';
    ctx.fillRect(56, 18, width - 112, 4);
    ctx.fillStyle = isLight ? '#C8342A' : '#FACC15';
    ctx.fillRect(56, 18, Math.max(12, (width - 112) * progress), 4);

    const heroTitle = data.centeredHeroTitle ?? episode.title;
    drawAnimatedBrushHeroTitle(ctx, width, heroTitle, localF, isLight);
  } else {
    drawHeaderProgress(ctx, {
      frame,
      totalFrames,
      width,
      seriesTitle: episode.seriesTitle,
      tag: data.headerTag ?? 'MARKETS · 涨跌幅与全天分时',
      dark: !isLight,
    });

    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.font = `700 24px ${MONO}, ${FONT}`;
    ctx.fillStyle = isLight ? '#475569' : '#94A3B8';
    ctx.fillText(data.sectionLabel, 40, 112);
  }

  const colW = 488;
  const gap = 24;
  const xLeft = 40;
  const xRight = 40 + colW + gap;
  const fullW = width - 80;
  const yShift = minimalHeader ? 12 : 0;

  // High-contrast strip accent colors
  const usStripAccent = isLight ? '#B45309' : '#FBBF24';
  const asiaStripAccent = isLight ? '#047857' : '#34D399';
  const comStripAccent = isLight ? '#C2410C' : '#F59E0B';
  const a50Accent = isLight ? '#B45309' : '#FBBF24';

  // PART 1: US Markets (Row 1) + Highlighted Typewriter Summary
  drawCleanIndexCard(
    ctx,
    xLeft,
    148 + yShift,
    colW,
    260 - (minimalHeader ? 6 : 0),
    data.usIndices[0],
    localF,
    timing.usStart,
    'left',
    { light: isLight, polished }
  );
  drawCleanIndexCard(
    ctx,
    xRight,
    148 + yShift,
    colW,
    260 - (minimalHeader ? 6 : 0),
    data.usIndices[1],
    localF,
    timing.usStart + 4,
    'right',
    { light: isLight, polished }
  );

  drawTypewriterSummaryStrip(
    ctx,
    xLeft,
    418 + (minimalHeader ? 6 : 0),
    fullW,
    minimalHeader ? 162 : 168,
    usStripAccent,
    data.usHeadline,
    data.usReason,
    localF,
    timing.usHeadlineFrame,
    timing.usTypeStart,
    timing.usTypeEnd,
    41,
    33,
    timing.asiaStart,
    isLight,
    polished
  );

  // PART 2: Asia Open (Row 2, y=598..846) + Typewriter Summary (y=856..1002)
  drawCleanIndexCard(
    ctx,
    xLeft,
    598,
    colW,
    248,
    data.asiaIndices[0],
    localF,
    timing.asiaStart,
    'left',
    { light: isLight, polished }
  );
  drawCleanIndexCard(
    ctx,
    xRight,
    598,
    colW,
    248,
    data.asiaIndices[1],
    localF,
    timing.asiaStart + 4,
    'right',
    { light: isLight, polished }
  );

  drawTypewriterSummaryStrip(
    ctx,
    xLeft,
    856,
    fullW,
    148,
    asiaStripAccent,
    data.asiaHeadline,
    data.asiaReason,
    localF,
    timing.asiaStart + 10,
    timing.asiaTypeStart,
    timing.asiaTypeEnd,
    39,
    32,
    undefined,
    isLight,
    polished
  );

  // PART 3: Anomalous Commodities Only (Row 3, y=1014..1254)
  const thresholdPct = data.anomalyThresholdPct ?? 2.5;
  const anomalies = selectAnomalousCommodities(data.commodityWatchlist, thresholdPct);
  const anomCharts = anomalies
    .map((a) => data.commodityCharts[a.id])
    .filter((c): c is CleanIndexChartItem => Boolean(c));

  if (anomCharts.length >= 2) {
    drawCleanIndexCard(
      ctx,
      xLeft,
      1014,
      colW,
      240,
      anomCharts[0],
      localF,
      timing.commodityStart,
      'left',
      { light: isLight, polished }
    );
    drawCleanIndexCard(
      ctx,
      xRight,
      1014,
      colW,
      240,
      anomCharts[1],
      localF,
      timing.commodityStart + 4,
      'right',
      { light: isLight, polished }
    );
  } else if (anomCharts.length === 1) {
    drawCleanIndexCard(
      ctx,
      xLeft,
      1014,
      fullW,
      240,
      anomCharts[0],
      localF,
      timing.commodityStart,
      'up',
      { light: isLight, polished }
    );
  } else {
    drawCalmCommoditiesCard(
      ctx,
      xLeft,
      1014,
      fullW,
      240,
      data,
      thresholdPct,
      localF,
      timing.commodityStart,
      isLight,
      minimalHeader
    );
  }

  drawTypewriterSummaryStrip(
    ctx,
    xLeft,
    1264,
    fullW,
    148,
    comStripAccent,
    data.commodityHeadline,
    data.commodityReason,
    localF,
    timing.commodityStart + 10,
    timing.commodityTypeStart,
    timing.commodityTypeEnd,
    39,
    32,
    undefined,
    isLight,
    polished
  );

  // PART 4: A50 Full-Width Oversized Hero Row (y=1420..1882, height=462)
  drawCleanIndexCard(ctx, xLeft, 1420, fullW, 462, data.a50Hero, localF, timing.a50Start, 'bottom', {
    accentColorOverride: a50Accent,
    heroShapeNote: data.a50Hero.intradayShapeNote,
    heroNoteStartFrame: timing.a50NoteStart,
    heroNoteEndFrame: timing.a50NoteEnd,
    light: isLight,
    polished,
  });
}
