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
  light: boolean
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
  const centerY = 82;

  ctx.save();
  ctx.translate(centerX, centerY);

  // 1) Crimson & black jagged brush-splash backing ribbon (slashes in left->right)
  const ribbonW = 910 * ribbonT;
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

  const fontSize = 92;
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

  ctx.fillStyle = isLight ? '#FFFFFF' : minimalHeader ? '#000000' : '#090D14';
  ctx.fillRect(0, 0, width, height);

  // Subtle grid background
  ctx.strokeStyle = isLight ? 'rgba(15, 23, 42, 0.035)' : 'rgba(255, 255, 255, 0.03)';
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
      tag: data.headerTag ?? 'MARKETS · 全天分时与日K',
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
    { light: isLight }
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
    { light: isLight }
  );

  drawTypewriterSummaryStrip(
    ctx,
    xLeft,
    418 + (minimalHeader ? 6 : 0),
    fullW,
    minimalHeader ? 160 : 166,
    usStripAccent,
    data.usHeadline,
    data.usReason,
    localF,
    timing.usHeadlineFrame,
    timing.usTypeStart,
    timing.usTypeEnd,
    36,
    27,
    timing.asiaStart,
    isLight
  );

  // PART 2: Asia Open (Row 2, y=598..846) + Typewriter Summary (y=856..994)
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
    { light: isLight }
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
    { light: isLight }
  );

  drawTypewriterSummaryStrip(
    ctx,
    xLeft,
    856,
    fullW,
    138,
    asiaStripAccent,
    data.asiaHeadline,
    data.asiaReason,
    localF,
    timing.asiaStart + 10,
    timing.asiaTypeStart,
    timing.asiaTypeEnd,
    31,
    26,
    undefined,
    isLight
  );

  // PART 3: Anomalous Commodities Only (Row 3, y=1008..1256)
  const thresholdPct = data.anomalyThresholdPct ?? 2.5;
  const anomalies = selectAnomalousCommodities(data.commodityWatchlist, thresholdPct);
  const anomCharts = anomalies
    .map((a) => data.commodityCharts[a.id])
    .filter((c): c is CleanIndexChartItem => Boolean(c));

  if (anomCharts.length >= 2) {
    drawCleanIndexCard(
      ctx,
      xLeft,
      1008,
      colW,
      248,
      anomCharts[0],
      localF,
      timing.commodityStart,
      'left',
      { light: isLight }
    );
    drawCleanIndexCard(
      ctx,
      xRight,
      1008,
      colW,
      248,
      anomCharts[1],
      localF,
      timing.commodityStart + 4,
      'right',
      { light: isLight }
    );
  } else if (anomCharts.length === 1) {
    drawCleanIndexCard(
      ctx,
      xLeft,
      1008,
      fullW,
      248,
      anomCharts[0],
      localF,
      timing.commodityStart,
      'up',
      { light: isLight }
    );
  } else {
    drawCalmCommoditiesCard(
      ctx,
      xLeft,
      1008,
      fullW,
      248,
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
    1266,
    fullW,
    138,
    comStripAccent,
    data.commodityHeadline,
    data.commodityReason,
    localF,
    timing.commodityStart + 10,
    timing.commodityTypeStart,
    timing.commodityTypeEnd,
    31,
    26,
    undefined,
    isLight
  );

  // PART 4: A50 Full-Width Oversized Hero Row (y=1420..1882, height=462)
  drawCleanIndexCard(ctx, xLeft, 1420, fullW, 462, data.a50Hero, localF, timing.a50Start, 'bottom', {
    accentColorOverride: a50Accent,
    heroShapeNote: data.a50Hero.intradayShapeNote,
    heroNoteStartFrame: timing.a50NoteStart,
    heroNoteEndFrame: timing.a50NoteEnd,
    light: isLight,
  });
}
