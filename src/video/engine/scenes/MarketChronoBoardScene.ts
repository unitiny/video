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
  enterFrame: number
): void {
  if (localF < enterFrame) return;

  const p = getCardEnterProgress(localF, enterFrame, 16);
  const e = easeOutCubic(p);

  ctx.save();
  ctx.globalAlpha = clamp(p * 1.6, 0, 1);
  ctx.translate(0, lerp(36, 0, e));

  ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
  roundRect(ctx, x, y, w, h, 14);
  ctx.fill();
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.24)';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.fillStyle = '#64748B';
  roundRect(ctx, x, y + 18, 6, h - 36, 3);
  ctx.fill();

  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.font = `900 32px ${FONT}`;
  ctx.fillStyle = '#E2E8F0';
  ctx.fillText('大宗商品平稳运行 · 无显著异动', x + 28, y + 66);

  ctx.font = `700 22px ${MONO}, ${FONT}`;
  ctx.fillStyle = '#94A3B8';
  ctx.fillText(
    `全监测池涨跌幅均处于 ±${thresholdPct.toFixed(1)}% 阈值以内`,
    x + 28,
    y + 114
  );

  // Render compact horizontal summary pills of watchlist items (up to 4)
  const previewItems = data.commodityWatchlist.slice(0, 4);
  if (previewItems.length > 0) {
    const pillGap = 14;
    const pillW = Math.floor((w - 56 - pillGap * (previewItems.length - 1)) / previewItems.length);
    const pillY = y + 154;
    const pillH = 66;

    previewItems.forEach((item, idx) => {
      const px = x + 28 + idx * (pillW + pillGap);
      ctx.fillStyle = 'rgba(7, 11, 18, 0.78)';
      roundRect(ctx, px, pillY, pillW, pillH, 10);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.font = `700 21px ${FONT}`;
      ctx.fillStyle = '#CBD5E1';
      ctx.fillText(item.name, px + 14, pillY + pillH / 2);

      const sign = item.changePct >= 0 ? '+' : '';
      ctx.textAlign = 'right';
      ctx.font = `800 22px ${MONO}`;
      ctx.fillStyle = item.changePct >= 0 ? '#F87171' : '#34D399';
      ctx.fillText(`${sign}${item.changePct.toFixed(2)}%`, px + pillW - 14, pillY + pillH / 2);
    });
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

  ctx.fillStyle = '#090D14';
  ctx.fillRect(0, 0, width, height);

  // Subtle terminal grid background
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.025)';
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

  drawHeaderProgress(ctx, {
    frame,
    totalFrames,
    width,
    seriesTitle: episode.seriesTitle,
    tag: data.headerTag ?? 'MARKETS · 全天分时与日K',
    dark: true,
  });

  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.font = `700 24px ${MONO}, ${FONT}`;
  ctx.fillStyle = '#94A3B8';
  ctx.fillText(data.sectionLabel, 40, 112);

  const colW = 488;
  const gap = 24;
  const xLeft = 40;
  const xRight = 40 + colW + gap;
  const fullW = width - 80;

  // PART 1: US Markets (Row 1, y=148..408) + Highlighted Typewriter Summary (y=418..584)
  drawCleanIndexCard(ctx, xLeft, 148, colW, 260, data.usIndices[0], localF, timing.usStart, 'left');
  drawCleanIndexCard(
    ctx,
    xRight,
    148,
    colW,
    260,
    data.usIndices[1],
    localF,
    timing.usStart + 4,
    'right'
  );

  drawTypewriterSummaryStrip(
    ctx,
    xLeft,
    418,
    fullW,
    166,
    '#FBBF24',
    data.usHeadline,
    data.usReason,
    localF,
    timing.usHeadlineFrame,
    timing.usTypeStart,
    timing.usTypeEnd,
    36,
    27,
    timing.asiaStart
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
    'left'
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
    'right'
  );

  drawTypewriterSummaryStrip(
    ctx,
    xLeft,
    856,
    fullW,
    138,
    '#34D399',
    data.asiaHeadline,
    data.asiaReason,
    localF,
    timing.asiaStart + 10,
    timing.asiaTypeStart,
    timing.asiaTypeEnd,
    31,
    26
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
      'left'
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
      'right'
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
      'up'
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
      timing.commodityStart
    );
  }

  drawTypewriterSummaryStrip(
    ctx,
    xLeft,
    1266,
    fullW,
    138,
    '#F59E0B',
    data.commodityHeadline,
    data.commodityReason,
    localF,
    timing.commodityStart + 10,
    timing.commodityTypeStart,
    timing.commodityTypeEnd,
    31,
    26
  );

  // PART 4: A50 Full-Width Oversized Hero Row (y=1420..1882, height=462)
  drawCleanIndexCard(ctx, xLeft, 1420, fullW, 462, data.a50Hero, localF, timing.a50Start, 'bottom', {
    accentColorOverride: '#FBBF24',
    heroShapeNote: data.a50Hero.intradayShapeNote,
    heroNoteStartFrame: timing.a50NoteStart,
    heroNoteEndFrame: timing.a50NoteEnd,
  });
}
