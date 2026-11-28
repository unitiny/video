import { clamp, easeOutCubic, lerp } from '../../timeline';
import type { V3MarketPulseData } from '../schema';
import {
  FONT,
  MONO,
  drawCleanIndexCard,
  drawTypewriterSummaryStrip,
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
  resolvePriceColor,
} from './v3BrandChrome';

/**
 * v3 Scene 2: Global Market Pulse (Screen 1 of split market board, 7.0s / 210f)
 * - US deep-V index cards (with intraday low badges) + concise reason strip
 * - Asia index cards + concise reason strip
 * - Smart Collapsed Commodity Bar when all commodities stay below anomaly threshold (±2.5%)
 * - All critical elements strictly inside Safe Zone (y: 114..1556, lower-right x <= 930)
 */
export function renderV3MarketPulseScene(
  rc: SceneRenderContext,
  data: V3MarketPulseData
): void {
  const { ctx, localFrame: localF, timeline } = rc;
  const { width, height } = timeline;

  drawV3ObsidianBackdrop(ctx, width, height, V3_COLORS.infoCyan);
  drawV3TopChrome(rc, data.headerTag, V3_COLORS.infoCyan);

  const padX = V3_SAFE_ZONE.left;
  const topFullW = width - padX * 2; // 984px (y < 860 is above right rail)
  const lowerSafeW = 880; // x: 48..928 avoids Douyin right icon rail (x > 936, y > 860)

  // ===================== 1. US MARKET BLOCK (y: 126..666) =====================
  const usTagP = easeOutCubic(clamp(localF / 12, 0, 1));
  ctx.save();
  ctx.globalAlpha = usTagP;
  ctx.fillStyle = V3_COLORS.infoCyan;
  roundRect(ctx, padX, 130, 8, 32, 4);
  ctx.fill();
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.font = `900 30px ${FONT}`;
  ctx.fillStyle = V3_COLORS.textPrimary;
  ctx.fillText('隔夜美股 · 盘中剧烈震荡', padX + 20, 146);

  ctx.textAlign = 'right';
  ctx.font = `700 21px ${FONT}`;
  ctx.fillStyle = V3_COLORS.textMuted;
  ctx.fillText('红涨绿跌 · 涨跌幅 + 实盘分时', padX + topFullW, 147);
  ctx.restore();

  const usGap = 18;
  const usCardW = (topFullW - usGap) / 2;
  const usCardY = 178;
  const usCardH = 336;

  data.usIndices.forEach((item, idx) => {
    const cx = padX + idx * (usCardW + usGap);
    const enterF = 4 + idx * 8;
    const priceCol = resolvePriceColor(item.changePct);
    drawCleanIndexCard(ctx, cx, usCardY, usCardW, usCardH, item, localF, enterF, idx === 0 ? 'left' : 'right', {
      accentColorOverride: priceCol,
      light: false,
    });

    // Intraday extreme badge (e.g., "盘中低 -4.33%") overlays cleanly once intraday draws
    const extremeBadge = data.usExtremeBadges?.[idx];
    if (extremeBadge && localF >= enterF + 22) {
      const bp = easeOutCubic(clamp((localF - (enterF + 22)) / 10, 0, 1));
      ctx.save();
      ctx.globalAlpha = bp;
      ctx.font = `800 20px ${MONO}, ${FONT}`;
      const bw = ctx.measureText(extremeBadge).width + 22;
      const bx = cx + usCardW - bw - 18;
      const by = usCardY + usCardH - 68;
      ctx.fillStyle = 'rgba(5, 150, 105, 0.92)';
      roundRect(ctx, bx, by, bw, 32, 8);
      ctx.fill();
      ctx.strokeStyle = 'rgba(110, 231, 183, 0.85)';
      ctx.lineWidth = 1.2;
      ctx.stroke();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#FFFFFF';
      ctx.fillText(extremeBadge, bx + bw / 2, by + 16);
      ctx.restore();
    }
  });

  // US concise editorial reason strip (y: 528..654)
  drawTypewriterSummaryStrip(
    ctx,
    padX,
    528,
    topFullW,
    126,
    V3_COLORS.brandGold,
    data.usHeadline,
    data.usReason,
    localF,
    16,
    22,
    62,
    25,
    23,
    82,
    false
  );

  // ===================== 2. ASIA MARKET BLOCK (y: 678..1228) =====================
  const asiaStart = 72;
  if (localF >= asiaStart) {
    const asiaTagP = easeOutCubic(clamp((localF - asiaStart) / 12, 0, 1));
    ctx.save();
    ctx.globalAlpha = asiaTagP;
    ctx.fillStyle = V3_COLORS.brandGold;
    roundRect(ctx, padX, 682, 8, 32, 4);
    ctx.fill();
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.font = `900 30px ${FONT}`;
    ctx.fillStyle = V3_COLORS.textPrimary;
    ctx.fillText('今晨亚太 · 开盘分化承压', padX + 20, 698);
    ctx.restore();

    const asiaGap = 16;
    const asiaCardW = (lowerSafeW - asiaGap) / 2;
    const asiaCardY = 730;
    const asiaCardH = 326;

    data.asiaIndices.forEach((item, idx) => {
      const cx = padX + idx * (asiaCardW + asiaGap);
      const enterF = asiaStart + 4 + idx * 8;
      const priceCol = resolvePriceColor(item.changePct);
      drawCleanIndexCard(
        ctx,
        cx,
        asiaCardY,
        asiaCardW,
        asiaCardH,
        item,
        localF,
        enterF,
        idx === 0 ? 'left' : 'right',
        {
          accentColorOverride: priceCol,
          light: false,
        }
      );
    });

    drawTypewriterSummaryStrip(
      ctx,
      padX,
      1070,
      lowerSafeW,
      126,
      V3_COLORS.infoCyan,
      data.asiaHeadline,
      data.asiaReason,
      localF,
      asiaStart + 14,
      asiaStart + 20,
      asiaStart + 58,
      25,
      23,
      asiaStart + 76,
      false
    );
  }

  // ===================== 3. SMART COLLAPSED COMMODITY BAR (y: 1220..1536) =====================
  const comStart = 132;
  if (localF >= comStart) {
    const p = easeOutCubic(clamp((localF - comStart) / 16, 0, 1));
    const threshold = data.anomalyThresholdPct ?? 2.5;
    const anomalous = data.commodityWatchlist.filter((c) => Math.abs(c.changePct) >= threshold);

    const boxY = 1222;
    const boxH = 310;

    ctx.save();
    ctx.globalAlpha = p;
    ctx.translate(0, lerp(44, 0, p));

    ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
    roundRect(ctx, padX, boxY, lowerSafeW, boxH, 18);
    ctx.fill();
    ctx.strokeStyle =
      anomalous.length > 0 ? 'rgba(251, 146, 60, 0.55)' : 'rgba(148, 163, 184, 0.24)';
    ctx.lineWidth = 1.6;
    ctx.stroke();

    // Header row inside commodity box
    const badgeColor = anomalous.length > 0 ? V3_COLORS.warnOrange : V3_COLORS.textMuted;
    ctx.fillStyle = anomalous.length > 0 ? 'rgba(251, 146, 60, 0.18)' : 'rgba(148, 163, 184, 0.14)';
    roundRect(ctx, padX + 20, boxY + 18, 224, 34, 8);
    ctx.fill();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `800 20px ${FONT}`;
    ctx.fillStyle = anomalous.length > 0 ? V3_COLORS.warnOrange : V3_COLORS.textSecondary;
    ctx.fillText(
      anomalous.length > 0 ? `大宗异动 ≥ ±${threshold}%` : `大宗无异动 · 智能折叠`,
      padX + 20 + 112,
      boxY + 35
    );

    ctx.textAlign = 'left';
    ctx.font = `700 22px ${FONT}`;
    ctx.fillStyle = V3_COLORS.textSecondary;
    ctx.fillText(data.commodityCollapsedLabel, padX + 258, boxY + 35);

    // 2×2 compact clean commodity tiles (all 4 visible at a glance without wasting a full screen)
    const items = data.commodityWatchlist.slice(0, 4);
    const cols = 2;
    const cellGapX = 16;
    const cellGapY = 14;
    const cellW = (lowerSafeW - 40 - cellGapX) / cols;
    const cellH = 104;

    items.forEach((c, idx) => {
      const colIdx = idx % cols;
      const rowIdx = Math.floor(idx / cols);
      const cellX = padX + 20 + colIdx * (cellW + cellGapX);
      const cellY = boxY + 68 + rowIdx * (cellH + cellGapY);
      const isAnom = Math.abs(c.changePct) >= threshold;
      const priceCol = resolvePriceColor(c.changePct);

      ctx.fillStyle = isAnom ? 'rgba(251, 146, 60, 0.12)' : 'rgba(255, 255, 255, 0.035)';
      roundRect(ctx, cellX, cellY, cellW, cellH, 12);
      ctx.fill();
      ctx.strokeStyle = isAnom ? `${V3_COLORS.warnOrange}88` : 'rgba(255, 255, 255, 0.08)';
      ctx.lineWidth = 1.2;
      ctx.stroke();

      // Left slim indicator
      ctx.fillStyle = priceCol;
      roundRect(ctx, cellX, cellY + 14, 5, cellH - 28, 3);
      ctx.fill();

      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.font = `900 26px ${FONT}`;
      ctx.fillStyle = V3_COLORS.textPrimary;
      ctx.fillText(c.name, cellX + 18, cellY + 34);

      ctx.font = `600 18px ${MONO}`;
      ctx.fillStyle = badgeColor;
      ctx.fillText(c.priceText, cellX + 18, cellY + 72);

      // Right changePct + note
      ctx.textAlign = 'right';
      ctx.font = `900 32px ${MONO}`;
      ctx.fillStyle = priceCol;
      const sign = c.changePct >= 0 ? '+' : '';
      ctx.fillText(`${sign}${c.changePct.toFixed(2)}%`, cellX + cellW - 18, cellY + 36);

      ctx.font = `600 19px ${FONT}`;
      ctx.fillStyle = V3_COLORS.textMuted;
      ctx.fillText(c.note, cellX + cellW - 18, cellY + 74);
    });

    ctx.restore();
  }

  drawV3SafeFooterWatermark(ctx, width);
  drawV3SceneEntrySweep(ctx, width, height, localF, V3_COLORS.infoCyan);
}
