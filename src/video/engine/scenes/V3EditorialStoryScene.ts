import { clamp, easeOutCubic, lerp } from '../../timeline';
import type { V3EditorialStoryData } from '../schema';
import {
  FONT,
  MONO,
  drawCroppedCoverImage,
  drawWrappedText,
  easeOutBack,
  roundRect,
  type SceneRenderContext,
} from './primitives';
import {
  V3_COLORS,
  V3_SAFE_ZONE,
  drawV3SafeFooterWatermark,
  drawV3SceneEntrySweep,
  drawV3TopChrome,
  resolveV3ToneColor,
} from './v3BrandChrome';

/**
 * v3 Scene 4/5/6: Cohesive Dark-Obsidian Editorial Story Stage (7.0s / 210f each)
 * - Background: Custom text-free editorial illustration with subtle Ken Burns parallax
 * - Foreground: 100% code-rendered crisp motion graphics (zero baked-in poster text, zero typos)
 * - 3 distinct structural variants:
 *   1. macro_gauge: Animated PCE surprise bar + High-rate-hold circular gauge + affected tech grid
 *   2. vs_split_cards: GPU rent waterfall bar + Risk vs Boom VS split cards + angled caution stamp
 *   3. catalyst_chain: Dual numbered catalyst cards + 5-node sequentially igniting industry chain
 */
export function renderV3EditorialStoryScene(
  rc: SceneRenderContext,
  data: V3EditorialStoryData
): void {
  const { ctx, localFrame: localF, shot, timeline, assets } = rc;
  const { width, height } = timeline;
  const accent = resolveV3ToneColor(data.accentTone);
  const progress = clamp(localF / Math.max(1, shot.durationFrames - 1), 0, 1);

  // Subtle camera shake when VS split stamp lands
  let shakeX = 0;
  let shakeY = 0;
  if (data.variant === 'vs_split_cards') {
    const dt = localF - 122;
    if (dt >= 0 && dt < 12) {
      const mag = (1 - dt / 12) * 7;
      shakeX = Math.sin(dt * 3.1) * mag;
      shakeY = Math.cos(dt * 2.5) * mag;
    }
  }

  ctx.save();
  ctx.translate(shakeX, shakeY);

  // 1. Full-bleed text-free editorial artwork with smooth Ken Burns drift
  const img = assets.imagesBySrc[data.imageSrc];
  const zoom = lerp(1.03, 1.11, easeOutCubic(progress));
  const panY = lerp(-0.02, 0.03, progress);
  drawCroppedCoverImage(
    ctx,
    img,
    0,
    0,
    width,
    height,
    { x: 0, y: 0, w: 1, h: 1 },
    zoom,
    0,
    panY,
    true
  );

  // 2. Sculpted editorial obsidian scrim (high readability at top & bottom, letting illustration shine in middle)
  const scrim = ctx.createLinearGradient(0, 0, 0, height);
  scrim.addColorStop(0, 'rgba(7, 10, 16, 0.92)');
  scrim.addColorStop(0.24, 'rgba(7, 10, 16, 0.72)');
  scrim.addColorStop(0.42, 'rgba(7, 10, 16, 0.42)');
  scrim.addColorStop(0.68, 'rgba(7, 10, 16, 0.74)');
  scrim.addColorStop(0.84, 'rgba(7, 10, 16, 0.94)');
  scrim.addColorStop(1, 'rgba(7, 10, 16, 0.98)');
  ctx.fillStyle = scrim;
  ctx.fillRect(0, 0, width, height);

  // Top segmented progress bar + brand lockup
  drawV3TopChrome(rc, data.headerTag, accent);

  const padX = V3_SAFE_ZONE.left;
  const topFullW = width - padX * 2; // 984px
  const lowerSafeW = 880; // x: 48..928 safely clear of right engagement rail (y > 860)

  // 3. Top Editorial Headline Block (y: 134..374)
  const headP = easeOutCubic(clamp(localF / 14, 0, 1));
  ctx.save();
  ctx.globalAlpha = headP;
  ctx.translate(0, lerp(-18, 0, headP));

  ctx.font = `900 23px ${FONT}`;
  const kickerW = ctx.measureText(data.kicker).width + 32;
  ctx.fillStyle = `${accent}26`;
  roundRect(ctx, padX, 134, kickerW, 40, 10);
  ctx.fill();
  ctx.strokeStyle = `${accent}88`;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = accent;
  ctx.fillText(data.kicker, padX + kickerW / 2, 155);

  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.font = `900 58px ${FONT}`;
  ctx.fillStyle = V3_COLORS.textPrimary;
  const nextY = drawWrappedText(ctx, data.headline, padX, 192, topFullW, 70);

  ctx.font = `700 26px ${FONT}`;
  ctx.fillStyle = V3_COLORS.textSecondary;
  drawWrappedText(ctx, data.subheadline, padX, nextY + 6, topFullW, 36);
  ctx.restore();

  // 4. Variant-specific motion graphics (inside Safe Zone y: 440..1368)
  if (data.variant === 'macro_gauge' && data.macroMeter) {
    renderMacroGaugeVariant(ctx, data.macroMeter, localF, padX, lowerSafeW);
  } else if (data.variant === 'vs_split_cards' && data.vsSplit) {
    renderVsSplitVariant(ctx, data.vsSplit, localF, padX, lowerSafeW);
  } else if (data.variant === 'catalyst_chain' && data.catalystChain) {
    renderCatalystChainVariant(ctx, data.catalystChain, localF, padX, lowerSafeW);
  }

  // 5. Bottom Crisp Takeaway Dock (y: 1388..1536, strictly above y = 1556)
  const takeP = easeOutCubic(clamp((localF - 24) / 14, 0, 1));
  if (takeP > 0) {
    const dockY = 1390;
    const dockH = 144;
    ctx.save();
    ctx.globalAlpha = takeP;
    ctx.translate(0, lerp(28, 0, takeP));

    ctx.fillStyle = 'rgba(13, 19, 31, 0.94)';
    roundRect(ctx, padX, dockY, lowerSafeW, dockH, 16);
    ctx.fill();
    ctx.strokeStyle = `${accent}77`;
    ctx.lineWidth = 1.8;
    ctx.stroke();

    ctx.fillStyle = accent;
    roundRect(ctx, padX, dockY + 18, 8, dockH - 36, 4);
    ctx.fill();

    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.font = `800 21px ${FONT}`;
    ctx.fillStyle = accent;
    ctx.fillText('盘前要点提炼', padX + 24, dockY + 16);

    ctx.font = `800 27px ${FONT}`;
    ctx.fillStyle = V3_COLORS.textPrimary;
    drawWrappedText(ctx, data.bottomTakeaway, padX + 24, dockY + 52, lowerSafeW - 44, 38);
    ctx.restore();
  }

  drawV3SafeFooterWatermark(
    ctx,
    width,
    data.disclaimer || '盘前一档 · 宏观与行业脉络梳理（不构成投资建议）'
  );
  drawV3SceneEntrySweep(ctx, width, height, localF, accent);
  ctx.restore();
}

function renderMacroGaugeVariant(
  ctx: CanvasRenderingContext2D,
  meter: NonNullable<V3EditorialStoryData['macroMeter']>,
  localF: number,
  padX: number,
  safeW: number
): void {
  // Card 1: Animated PCE Surprise Bar (y: 486..814)
  const barEnter = easeOutCubic(clamp((localF - 10) / 16, 0, 1));
  if (barEnter > 0) {
    const cardY = 486;
    const cardH = 318;
    ctx.save();
    ctx.globalAlpha = barEnter;
    ctx.translate(0, lerp(34, 0, barEnter));

    ctx.fillStyle = 'rgba(13, 19, 31, 0.88)';
    roundRect(ctx, padX, cardY, safeW, cardH, 20);
    ctx.fill();
    ctx.strokeStyle = 'rgba(251, 146, 60, 0.45)';
    ctx.lineWidth = 1.8;
    ctx.stroke();

    // Label left + animated giant readout right
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.font = `900 28px ${FONT}`;
    ctx.fillStyle = V3_COLORS.textSecondary;
    ctx.fillText(meter.label, padX + 28, cardY + 26);

    const valProg = easeOutCubic(clamp((localF - 18) / 42, 0, 1));
    const curVal = lerp(meter.startValue, meter.endValue, valProg);
    const exceeded = curVal > meter.expectationValue;

    ctx.textAlign = 'right';
    ctx.font = `900 72px ${MONO}`;
    ctx.fillStyle = exceeded ? V3_COLORS.warnOrange : V3_COLORS.brandGold;
    ctx.fillText(`${curVal.toFixed(1)}${meter.unit}`, padX + safeW - 28, cardY + 18);

    // Horizontal gauge track (scale 2.0% .. 3.6%)
    const trackX = padX + 28;
    const trackY = cardY + 132;
    const trackW = safeW - 56;
    const trackH = 34;
    const minScale = Math.min(2.0, meter.startValue - 0.5);
    const maxScale = Math.max(3.6, meter.endValue + 0.3);
    const toTrackX = (v: number) =>
      trackX + clamp((v - minScale) / (maxScale - minScale), 0, 1) * trackW;

    ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
    roundRect(ctx, trackX, trackY, trackW, trackH, 10);
    ctx.fill();

    const fillW = Math.max(12, toTrackX(curVal) - trackX);
    const fillGrad = ctx.createLinearGradient(trackX, 0, trackX + fillW, 0);
    fillGrad.addColorStop(0, V3_COLORS.brandGold);
    fillGrad.addColorStop(1, exceeded ? V3_COLORS.warnOrange : V3_COLORS.brandGoldLight);
    ctx.fillStyle = fillGrad;
    roundRect(ctx, trackX, trackY, fillW, trackH, 10);
    ctx.fill();

    // Dashed vertical expectation line
    const expX = toTrackX(meter.expectationValue);
    ctx.strokeStyle = V3_COLORS.textPrimary;
    ctx.lineWidth = 3;
    ctx.setLineDash([6, 5]);
    ctx.beginPath();
    ctx.moveTo(expX, trackY - 14);
    ctx.lineTo(expX, trackY + trackH + 14);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.font = `800 20px ${FONT}`;
    ctx.fillStyle = V3_COLORS.brandGoldLight;
    ctx.fillText(meter.expectationLabel, expX, trackY - 18);

    // Status callout strip inside card
    ctx.fillStyle = 'rgba(251, 146, 60, 0.14)';
    roundRect(ctx, padX + 28, cardY + 206, safeW - 56, 86, 12);
    ctx.fill();
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.font = `900 25px ${FONT}`;
    ctx.fillStyle = V3_COLORS.warnOrange;
    ctx.fillText(meter.statusTitle, padX + 46, cardY + 218);
    ctx.font = `600 22px ${FONT}`;
    ctx.fillStyle = V3_COLORS.textSecondary;
    ctx.fillText(meter.statusDetail, padX + 46, cardY + 254);

    ctx.restore();
  }

  // Row 2: Left Circular Arc Gauge + Right Tech Tickers Grid (y: 832..1352)
  const rowStart = 58;
  if (localF >= rowStart) {
    const p = easeOutCubic(clamp((localF - rowStart) / 16, 0, 1));
    const rowY = 834;
    const rowH = 524;
    const leftW = 368;
    const gap = 18;
    const rightW = safeW - leftW - gap;

    ctx.save();
    ctx.globalAlpha = p;

    // Left Circular Gauge Card
    ctx.fillStyle = 'rgba(13, 19, 31, 0.9)';
    roundRect(ctx, padX, rowY, leftW, rowH, 20);
    ctx.fill();
    ctx.strokeStyle = 'rgba(251, 191, 36, 0.35)';
    ctx.lineWidth = 1.6;
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.font = `900 26px ${FONT}`;
    ctx.fillStyle = V3_COLORS.brandGold;
    ctx.fillText(meter.gaugeLabel, padX + leftW / 2, rowY + 28);

    const cx = padX + leftW / 2;
    const cy = rowY + 240;
    const radius = 112;
    const gaugeT = easeOutCubic(clamp((localF - rowStart - 8) / 38, 0, 1));
    const curPct = meter.gaugePct * gaugeT;

    // Track ring
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.lineWidth = 22;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, Math.PI * 0.75, Math.PI * 2.25);
    ctx.stroke();

    // Active arc
    const startAngle = Math.PI * 0.75;
    const endAngle = startAngle + (Math.PI * 1.5) * (curPct / 100);
    const arcGrad = ctx.createLinearGradient(cx - radius, cy, cx + radius, cy);
    arcGrad.addColorStop(0, V3_COLORS.brandGold);
    arcGrad.addColorStop(1, V3_COLORS.warnOrange);
    ctx.strokeStyle = arcGrad;
    ctx.lineWidth = 22;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(cx, cy, radius, startAngle, endAngle);
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `900 62px ${MONO}`;
    ctx.fillStyle = V3_COLORS.textPrimary;
    ctx.fillText(`${Math.round(curPct)}%`, cx, cy - 4);

    ctx.font = `700 20px ${FONT}`;
    ctx.fillStyle = V3_COLORS.textMuted;
    ctx.fillText('利率维持高位预期', cx, cy + 46);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.font = `700 23px ${FONT}`;
    ctx.fillStyle = V3_COLORS.textSecondary;
    drawWrappedText(ctx, meter.gaugeSubtitle, cx, rowY + 402, leftW - 44, 32);

    // Right Tech Tickers Pressure Card
    const rx = padX + leftW + gap;
    ctx.fillStyle = 'rgba(13, 19, 31, 0.9)';
    roundRect(ctx, rx, rowY, rightW, rowH, 20);
    ctx.fill();
    ctx.strokeStyle = 'rgba(52, 211, 153, 0.34)';
    ctx.lineWidth = 1.6;
    ctx.stroke();

    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.font = `900 26px ${FONT}`;
    ctx.fillStyle = V3_COLORS.textPrimary;
    ctx.fillText('高估值科技股盘中承压', rx + 26, rowY + 28);

    ctx.font = `700 20px ${FONT}`;
    ctx.fillStyle = V3_COLORS.textMuted;
    ctx.fillText('A股红涨绿跌色系 · 隔夜波动映射', rx + 26, rowY + 66);

    const tickers = meter.affectedTickers.slice(0, 4);
    const tGap = 14;
    const tH = 88;
    tickers.forEach((tk, idx) => {
      const tkEnter = rowStart + 14 + idx * 8;
      const tp = easeOutCubic(clamp((localF - tkEnter) / 12, 0, 1));
      if (tp <= 0) return;
      const ty = rowY + 112 + idx * (tH + tGap);
      const col = resolveV3ToneColor(tk.tone);

      ctx.save();
      ctx.globalAlpha = tp;
      ctx.translate(lerp(28, 0, tp), 0);

      ctx.fillStyle = `${col}16`;
      roundRect(ctx, rx + 24, ty, rightW - 48, tH, 14);
      ctx.fill();
      ctx.strokeStyle = `${col}55`;
      ctx.lineWidth = 1.4;
      ctx.stroke();

      ctx.fillStyle = col;
      roundRect(ctx, rx + 24, ty + 14, 7, tH - 28, 4);
      ctx.fill();

      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.font = `900 29px ${FONT}`;
      ctx.fillStyle = V3_COLORS.textPrimary;
      ctx.fillText(tk.label, rx + 46, ty + tH / 2);

      ctx.textAlign = 'right';
      ctx.font = `900 36px ${MONO}`;
      ctx.fillStyle = col;
      ctx.fillText(tk.value, rx + rightW - 42, ty + tH / 2 + 1);
      ctx.restore();
    });

    ctx.restore();
  }
}

function renderVsSplitVariant(
  ctx: CanvasRenderingContext2D,
  vs: NonNullable<V3EditorialStoryData['vsSplit']>,
  localF: number,
  padX: number,
  safeW: number
): void {
  // 1. Top GPU Rental Drop Bar (y: 472..744)
  const dropEnter = easeOutCubic(clamp((localF - 8) / 14, 0, 1));
  if (dropEnter > 0) {
    const cardY = 472;
    const cardH = 264;
    ctx.save();
    ctx.globalAlpha = dropEnter;
    ctx.translate(0, lerp(30, 0, dropEnter));

    ctx.fillStyle = 'rgba(13, 19, 31, 0.9)';
    roundRect(ctx, padX, cardY, safeW, cardH, 20);
    ctx.fill();
    ctx.strokeStyle = 'rgba(251, 146, 60, 0.45)';
    ctx.lineWidth = 1.6;
    ctx.stroke();

    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.font = `900 28px ${FONT}`;
    ctx.fillStyle = V3_COLORS.textPrimary;
    ctx.fillText(vs.dropTitle, padX + 26, cardY + 24);

    // Animated drop percentage pill right
    const animT = easeOutCubic(clamp((localF - 16) / 36, 0, 1));
    const curDrop = Math.round(lerp(0, vs.dropPct, animT));
    ctx.textAlign = 'right';
    ctx.font = `900 54px ${MONO}`;
    ctx.fillStyle = V3_COLORS.downGreen;
    ctx.fillText(`${curDrop}%`, padX + safeW - 26, cardY + 18);

    // Shrinking rent bar
    const trackX = padX + 26;
    const trackY = cardY + 104;
    const trackW = safeW - 52;
    const trackH = 42;

    ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
    roundRect(ctx, trackX, trackY, trackW, trackH, 10);
    ctx.fill();

    const shrinkFrac = lerp(1, Math.max(0.25, 1 + vs.dropPct / 100), animT);
    const barGrad = ctx.createLinearGradient(trackX, 0, trackX + trackW * shrinkFrac, 0);
    barGrad.addColorStop(0, V3_COLORS.infoCyan);
    barGrad.addColorStop(1, V3_COLORS.downGreen);
    ctx.fillStyle = barGrad;
    roundRect(ctx, trackX, trackY, trackW * shrinkFrac, trackH, 10);
    ctx.fill();

    // Start & End price labels
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.font = `800 23px ${MONO}, ${FONT}`;
    ctx.fillStyle = V3_COLORS.downGreen;
    ctx.fillText(`现价 ${vs.dropEndLabel}`, trackX, trackY + 56);

    ctx.textAlign = 'right';
    ctx.fillStyle = V3_COLORS.textMuted;
    ctx.fillText(`前期高位 ${vs.dropStartLabel}`, trackX + trackW, trackY + 56);

    ctx.textAlign = 'left';
    ctx.font = `700 23px ${FONT}`;
    ctx.fillStyle = V3_COLORS.textSecondary;
    ctx.fillText(vs.dropDetail, trackX, cardY + 210);

    ctx.restore();
  }

  // 2. Dramatic VS Split Cards (y: 766..1348)
  const splitStart = 52;
  if (localF >= splitStart) {
    const lp = easeOutCubic(clamp((localF - splitStart) / 14, 0, 1));
    const rp = easeOutCubic(clamp((localF - (splitStart + 12)) / 14, 0, 1));
    const cardY = 766;
    const cardH = 582;
    const gap = 22;
    const colW = (safeW - gap) / 2;

    // Left Risk Card
    const leftCol = resolveV3ToneColor(vs.leftCard.tone);
    ctx.save();
    ctx.globalAlpha = lp;
    ctx.translate(lerp(-45, 0, lp), 0);
    ctx.fillStyle = 'rgba(13, 19, 31, 0.92)';
    roundRect(ctx, padX, cardY, colW, cardH, 20);
    ctx.fill();
    ctx.strokeStyle = `${leftCol}88`;
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = `${leftCol}24`;
    roundRect(ctx, padX + 24, cardY + 26, 200, 38, 10);
    ctx.fill();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `900 21px ${FONT}`;
    ctx.fillStyle = leftCol;
    ctx.fillText(vs.leftCard.badge, padX + 124, cardY + 45);

    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.font = `900 34px ${FONT}`;
    ctx.fillStyle = V3_COLORS.textPrimary;
    drawWrappedText(ctx, vs.leftCard.title, padX + 24, cardY + 90, colW - 48, 44);

    ctx.font = `900 68px ${MONO}`;
    ctx.fillStyle = leftCol;
    ctx.fillText(vs.leftCard.metric, padX + 24, cardY + 216);

    ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.fillRect(padX + 24, cardY + 318, colW - 48, 1);

    ctx.font = `700 24px ${FONT}`;
    ctx.fillStyle = V3_COLORS.textSecondary;
    drawWrappedText(ctx, vs.leftCard.detail, padX + 24, cardY + 344, colW - 48, 36);
    ctx.restore();

    // Right Boom Card
    if (rp > 0) {
      const rx = padX + colW + gap;
      const rightCol = resolveV3ToneColor(vs.rightCard.tone);
      ctx.save();
      ctx.globalAlpha = rp;
      ctx.translate(lerp(45, 0, rp), 0);
      ctx.fillStyle = 'rgba(13, 19, 31, 0.92)';
      roundRect(ctx, rx, cardY, colW, cardH, 20);
      ctx.fill();
      ctx.strokeStyle = `${rightCol}88`;
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.fillStyle = `${rightCol}24`;
      roundRect(ctx, rx + 24, cardY + 26, 200, 38, 10);
      ctx.fill();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `900 21px ${FONT}`;
      ctx.fillStyle = rightCol;
      ctx.fillText(vs.rightCard.badge, rx + 124, cardY + 45);

      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.font = `900 34px ${FONT}`;
      ctx.fillStyle = V3_COLORS.textPrimary;
      drawWrappedText(ctx, vs.rightCard.title, rx + 24, cardY + 90, colW - 48, 44);

      ctx.font = `900 68px ${MONO}`;
      ctx.fillStyle = rightCol;
      ctx.fillText(vs.rightCard.metric, rx + 24, cardY + 216);

      ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
      ctx.fillRect(rx + 24, cardY + 318, colW - 48, 1);

      ctx.font = `700 24px ${FONT}`;
      ctx.fillStyle = V3_COLORS.textSecondary;
      drawWrappedText(ctx, vs.rightCard.detail, rx + 24, cardY + 344, colW - 48, 36);
      ctx.restore();
    }

    // Center VS badge
    if (rp > 0.2) {
      const vsp = easeOutBack(clamp((localF - (splitStart + 18)) / 12, 0, 1));
      const vcx = padX + safeW / 2;
      const vcy = cardY + 252;
      ctx.save();
      ctx.translate(vcx, vcy);
      ctx.scale(vsp, vsp);
      ctx.fillStyle = '#070A10';
      ctx.beginPath();
      ctx.arc(0, 0, 42, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = V3_COLORS.brandGold;
      ctx.lineWidth = 3.5;
      ctx.stroke();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `900 32px ${MONO}`;
      ctx.fillStyle = V3_COLORS.brandGold;
      ctx.fillText('VS', 0, 2);
      ctx.restore();
    }

    // Physical angled caution stamp (warning orange, never red/green)
    const stampStart = 120;
    if (localF >= stampStart && vs.stampText) {
      const sp = easeOutBack(clamp((localF - stampStart) / 10, 0, 1));
      const scale = lerp(2.2, 1, clamp(sp, 0, 1));
      ctx.save();
      ctx.globalAlpha = clamp(sp * 1.4, 0, 1);
      ctx.translate(padX + safeW / 2, cardY + cardH - 76);
      ctx.rotate(-0.07);
      ctx.scale(scale, scale);

      ctx.font = `900 40px ${FONT}`;
      const sw = ctx.measureText(vs.stampText).width + 58;
      ctx.fillStyle = 'rgba(234, 88, 12, 0.94)';
      roundRect(ctx, -sw / 2, -38, sw, 76, 14);
      ctx.fill();
      ctx.strokeStyle = '#FED7AA';
      ctx.lineWidth = 3.5;
      ctx.stroke();

      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#FFFFFF';
      ctx.fillText(vs.stampText, 0, 2);
      ctx.restore();
    }
  }
}

function renderCatalystChainVariant(
  ctx: CanvasRenderingContext2D,
  cat: NonNullable<V3EditorialStoryData['catalystChain']>,
  localF: number,
  padX: number,
  safeW: number
): void {
  // 1. Two staggered numbered catalyst cards (y: 472..924)
  const cardH = 208;
  const cardGap = 18;
  cat.events.slice(0, 2).forEach((ev, idx) => {
    const enterF = 10 + idx * 24;
    if (localF < enterF) return;
    const p = easeOutCubic(clamp((localF - enterF) / 14, 0, 1));
    const cardY = 472 + idx * (cardH + cardGap);
    const toneColor = resolveV3ToneColor(ev.tone);

    ctx.save();
    ctx.globalAlpha = p;
    ctx.translate(lerp(idx === 0 ? -44 : 44, 0, p), 0);

    ctx.fillStyle = 'rgba(13, 19, 31, 0.9)';
    roundRect(ctx, padX, cardY, safeW, cardH, 20);
    ctx.fill();
    ctx.strokeStyle = `${toneColor}66`;
    ctx.lineWidth = 1.8;
    ctx.stroke();

    // Index number block
    ctx.fillStyle = toneColor;
    roundRect(ctx, padX + 20, cardY + 22, 66, 66, 14);
    ctx.fill();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `900 32px ${MONO}`;
    ctx.fillStyle = '#070A10';
    ctx.fillText(ev.indexLabel, padX + 53, cardY + 56);

    // Time tag pill
    ctx.font = `800 20px ${FONT}`;
    const tw = ctx.measureText(ev.timeTag).width + 24;
    ctx.fillStyle = `${toneColor}22`;
    roundRect(ctx, padX + 104, cardY + 22, tw, 32, 8);
    ctx.fill();
    ctx.fillStyle = toneColor;
    ctx.fillText(ev.timeTag, padX + 104 + tw / 2, cardY + 38);

    // Title
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.font = `900 32px ${FONT}`;
    ctx.fillStyle = V3_COLORS.textPrimary;
    ctx.fillText(ev.title, padX + 104, cardY + 62);

    // Detail text
    const maxDetailW = ev.highlightMetric ? safeW - 310 : safeW - 130;
    ctx.font = `700 23px ${FONT}`;
    ctx.fillStyle = V3_COLORS.textSecondary;
    drawWrappedText(ctx, ev.detail, padX + 104, cardY + 108, maxDetailW, 34);

    // Live animated counter on right (e.g., 1 -> 100万颗)
    if (ev.highlightMetric) {
      const hm = ev.highlightMetric;
      const cntT = easeOutCubic(clamp((localF - enterF - 8) / 36, 0, 1));
      const val = Math.round(lerp(hm.startValue, hm.endValue, cntT));
      ctx.fillStyle = `${toneColor}1A`;
      roundRect(ctx, padX + safeW - 208, cardY + 36, 186, 136, 14);
      ctx.fill();
      ctx.strokeStyle = `${toneColor}66`;
      ctx.lineWidth = 1.4;
      ctx.stroke();

      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `800 19px ${FONT}`;
      ctx.fillStyle = V3_COLORS.textMuted;
      ctx.fillText(hm.label, padX + safeW - 115, cardY + 68);

      ctx.font = `900 44px ${MONO}, ${FONT}`;
      ctx.fillStyle = toneColor;
      ctx.fillText(`${val}${hm.suffix}`, padX + safeW - 115, cardY + 124);
    }

    ctx.restore();
  });

  // 2. 5-Node Sequentially Igniting Industry Chain Dock (y: 932..1234)
  const chainStart = 68;
  if (localF >= chainStart) {
    const cp = easeOutCubic(clamp((localF - chainStart) / 14, 0, 1));
    const boxY = 932;
    const boxH = 292;
    ctx.save();
    ctx.globalAlpha = cp;

    ctx.fillStyle = 'rgba(13, 19, 31, 0.9)';
    roundRect(ctx, padX, boxY, safeW, boxH, 20);
    ctx.fill();
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.36)';
    ctx.lineWidth = 1.6;
    ctx.stroke();

    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.font = `900 26px ${FONT}`;
    ctx.fillStyle = V3_COLORS.infoCyan;
    ctx.fillText(cat.chainLabel, padX + 26, boxY + 24);

    const nodes = cat.chainNodes.slice(0, 5);
    const nGap = 12;
    const nW = (safeW - 52 - nGap * (nodes.length - 1)) / nodes.length;
    const nY = boxY + 78;
    const nH = 184;

    nodes.forEach((node, idx) => {
      const nodeEnter = chainStart + 8 + idx * 10;
      const np = easeOutBack(clamp((localF - nodeEnter) / 12, 0, 1));
      const nx = padX + 26 + idx * (nW + nGap);
      const toneColor = resolveV3ToneColor(node.tone);
      const isLit = localF >= nodeEnter;

      ctx.save();
      ctx.globalAlpha = isLit ? clamp(np, 0, 1) : 0.25;
      ctx.translate(nx + nW / 2, nY + nH / 2);
      const sc = isLit ? lerp(0.86, 1, clamp(np, 0, 1)) : 0.92;
      ctx.scale(sc, sc);
      ctx.translate(-(nx + nW / 2), -(nY + nH / 2));

      ctx.fillStyle = isLit ? `${toneColor}22` : 'rgba(255, 255, 255, 0.04)';
      roundRect(ctx, nx, nY, nW, nH, 14);
      ctx.fill();
      ctx.strokeStyle = isLit ? toneColor : 'rgba(255, 255, 255, 0.1)';
      ctx.lineWidth = isLit ? 2 : 1;
      ctx.stroke();

      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `900 24px ${MONO}`;
      ctx.fillStyle = toneColor;
      ctx.fillText(node.idx, nx + nW / 2, nY + 42);

      // Vertical dot separator
      ctx.fillStyle = toneColor;
      ctx.beginPath();
      ctx.arc(nx + nW / 2, nY + 76, 4, 0, Math.PI * 2);
      ctx.fill();

      ctx.font = `900 25px ${FONT}`;
      ctx.fillStyle = V3_COLORS.textPrimary;
      drawWrappedText(ctx, node.name, nx + nW / 2, nY + 104, nW - 14, 32);
      ctx.restore();
    });

    ctx.restore();
  }

  // 3. Objective Caution Strip (y: 1244..1366)
  const cautStart = 112;
  if (localF >= cautStart && cat.cautionBanner) {
    const p = easeOutCubic(clamp((localF - cautStart) / 14, 0, 1));
    ctx.save();
    ctx.globalAlpha = p;
    ctx.fillStyle = 'rgba(251, 146, 60, 0.14)';
    roundRect(ctx, padX, 1248, safeW, 114, 14);
    ctx.fill();
    ctx.strokeStyle = 'rgba(251, 146, 60, 0.5)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.font = `800 23px ${FONT}`;
    ctx.fillStyle = V3_COLORS.warnOrange;
    drawWrappedText(ctx, cat.cautionBanner, padX + 24, 1268, safeW - 48, 34);
    ctx.restore();
  }
}
