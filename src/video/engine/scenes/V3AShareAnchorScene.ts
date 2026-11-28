import { clamp, easeOutCubic, lerp } from '../../timeline';
import type { V3AShareAnchorData } from '../schema';
import {
  FONT,
  MONO,
  drawCleanIndexCard,
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
  resolveV3ToneColor,
} from './v3BrandChrome';

/**
 * v3 Scene 3: A-Share Pre-Market Anchor (Screen 2 of split market board, 6.5s / 195f)
 * - Dedicated A50 Hero card with micro-range badge & clean activity bars (no brick wall)
 * - 3 real verified China asset windvane cards (Golden Dragon PGJ, CNY/USD, Hang Seng)
 * - Yesterday A-share backdrop + Today's 3-node trading rhythm clock (09:25 / 10:00 / 14:30)
 */
export function renderV3AShareAnchorScene(
  rc: SceneRenderContext,
  data: V3AShareAnchorData
): void {
  const { ctx, localFrame: localF, timeline } = rc;
  const { width, height } = timeline;

  drawV3ObsidianBackdrop(ctx, width, height, V3_COLORS.brandGold);
  drawV3TopChrome(rc, data.headerTag, V3_COLORS.brandGold);

  const padX = V3_SAFE_ZONE.left;
  const topFullW = width - padX * 2; // 984px
  const lowerSafeW = 880; // x: 48..928 safely clear of Douyin right icon rail (y > 860)

  // ===================== 1. A50 HERO CARD (y: 132..696) =====================
  const a50Col = resolvePriceColor(data.a50Hero.changePct);
  const heroY = 132;
  const heroH = 564;

  drawCleanIndexCard(ctx, padX, heroY, topFullW, heroH, data.a50Hero, localF, 2, 'up', {
    accentColorOverride: a50Col,
    heroShapeNote: data.a50Hero.intradayShapeNote,
    heroNoteStartFrame: 26,
    heroNoteEndFrame: 66,
    light: false,
  });

  // Explicit micro-range badge so narrow-amplitude A50 intraday scale is crystal clear
  if (localF >= 14 && data.a50Hero.rangeBadge) {
    const bp = easeOutCubic(clamp((localF - 14) / 12, 0, 1));
    ctx.save();
    ctx.globalAlpha = bp;
    ctx.font = `800 20px ${MONO}, ${FONT}`;
    const bw = ctx.measureText(data.a50Hero.rangeBadge).width + 28;
    const bx = padX + topFullW - bw - 36;
    const by = heroY + 114;
    ctx.fillStyle = 'rgba(251, 191, 36, 0.18)';
    roundRect(ctx, bx, by, bw, 34, 8);
    ctx.fill();
    ctx.strokeStyle = 'rgba(251, 191, 36, 0.55)';
    ctx.lineWidth = 1.4;
    ctx.stroke();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = V3_COLORS.brandGoldLight;
    ctx.fillText(data.a50Hero.rangeBadge, bx + bw / 2, by + 18);
    ctx.restore();
  }

  // ===================== 2. VERIFIED CHINA WINDVANES (y: 724..1084) =====================
  const windStart = 44;
  if (localF >= windStart) {
    const headP = easeOutCubic(clamp((localF - windStart) / 12, 0, 1));
    ctx.save();
    ctx.globalAlpha = headP;
    ctx.fillStyle = V3_COLORS.brandGold;
    roundRect(ctx, padX, 728, 8, 30, 4);
    ctx.fill();
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.font = `900 29px ${FONT}`;
    ctx.fillStyle = V3_COLORS.textPrimary;
    ctx.fillText(data.windvanesHeading, padX + 20, 743);
    ctx.restore();

    const wGap = 16;
    const wCardW = (lowerSafeW - wGap * 2) / 3;
    const wCardY = 774;
    const wCardH = 296;

    data.windvanes.forEach((item, idx) => {
      const enterF = windStart + 6 + idx * 10;
      if (localF < enterF) return;
      const p = easeOutCubic(clamp((localF - enterF) / 14, 0, 1));
      const cx = padX + idx * (wCardW + wGap);
      const toneColor = resolveV3ToneColor(item.tone);

      ctx.save();
      ctx.globalAlpha = p;
      ctx.translate(0, lerp(36, 0, p));

      ctx.fillStyle = 'rgba(13, 19, 31, 0.9)';
      roundRect(ctx, cx, wCardY, wCardW, wCardH, 16);
      ctx.fill();
      ctx.strokeStyle = `${toneColor}55`;
      ctx.lineWidth = 1.6;
      ctx.stroke();

      // Top colored accent bar
      ctx.fillStyle = toneColor;
      roundRect(ctx, cx + 18, wCardY, wCardW - 36, 6, 3);
      ctx.fill();

      // Ticker code pill
      ctx.font = `700 18px ${MONO}`;
      const codeW = ctx.measureText(item.code).width + 18;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.07)';
      roundRect(ctx, cx + 18, wCardY + 24, codeW, 28, 6);
      ctx.fill();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = V3_COLORS.textMuted;
      ctx.fillText(item.code, cx + 18 + codeW / 2, wCardY + 38);

      // Asset name
      ctx.textAlign = 'left';
      ctx.font = `900 28px ${FONT}`;
      ctx.fillStyle = V3_COLORS.textPrimary;
      ctx.fillText(item.name, cx + 18, wCardY + 84);

      // Value readout
      ctx.font = `900 46px ${MONO}`;
      ctx.fillStyle = toneColor;
      ctx.fillText(item.valueText, cx + 18, wCardY + 156);

      // Status divider & note
      ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
      ctx.fillRect(cx + 18, wCardY + 206, wCardW - 36, 1);

      ctx.font = `700 21px ${FONT}`;
      ctx.fillStyle = V3_COLORS.textSecondary;
      ctx.fillText(item.statusNote, cx + 18, wCardY + 246);

      ctx.restore();
    });
  }

  // ===================== 3. YESTERDAY A-SHARE BASELINE (y: 1094..1254) =====================
  const yestStart = 88;
  if (localF >= yestStart) {
    const p = easeOutCubic(clamp((localF - yestStart) / 14, 0, 1));
    const boxY = 1096;
    const boxH = 148;

    ctx.save();
    ctx.globalAlpha = p;
    ctx.translate(lerp(-40, 0, p), 0);

    ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
    roundRect(ctx, padX, boxY, lowerSafeW, boxH, 16);
    ctx.fill();
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.22)';
    ctx.lineWidth = 1.4;
    ctx.stroke();

    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.font = `800 22px ${FONT}`;
    ctx.fillStyle = V3_COLORS.textMuted;
    ctx.fillText(data.yesterdayHeading, padX + 24, boxY + 34);

    const stats = data.yesterdayStats;
    const statGap = 16;
    const statW = (lowerSafeW - 48 - statGap * Math.max(0, stats.length - 1)) / Math.max(1, stats.length);
    stats.forEach((st, idx) => {
      const sx = padX + 24 + idx * (statW + statGap);
      const sy = boxY + 58;
      const sh = 70;
      const toneColor = resolveV3ToneColor(st.tone);

      ctx.fillStyle = `${toneColor}16`;
      roundRect(ctx, sx, sy, statW, sh, 12);
      ctx.fill();
      ctx.strokeStyle = `${toneColor}44`;
      ctx.lineWidth = 1.2;
      ctx.stroke();

      ctx.textAlign = 'left';
      ctx.font = `800 24px ${FONT}`;
      ctx.fillStyle = V3_COLORS.textPrimary;
      ctx.fillText(st.label, sx + 18, sy + sh / 2);

      ctx.textAlign = 'right';
      ctx.font = `900 32px ${MONO}`;
      ctx.fillStyle = toneColor;
      ctx.fillText(st.value, sx + statW - 18, sy + sh / 2 + 1);
    });
    ctx.restore();
  }

  // ===================== 4. TODAY'S TRADING CLOCK (y: 1268..1536) =====================
  const clockStart = 114;
  if (localF >= clockStart) {
    const p = easeOutCubic(clamp((localF - clockStart) / 16, 0, 1));
    const boxY = 1268;
    const boxH = 266;

    ctx.save();
    ctx.globalAlpha = p;
    ctx.translate(0, lerp(36, 0, p));

    ctx.fillStyle = 'rgba(13, 19, 31, 0.92)';
    roundRect(ctx, padX, boxY, lowerSafeW, boxH, 18);
    ctx.fill();
    ctx.strokeStyle = 'rgba(251, 191, 36, 0.36)';
    ctx.lineWidth = 1.6;
    ctx.stroke();

    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.font = `900 26px ${FONT}`;
    ctx.fillStyle = V3_COLORS.brandGold;
    ctx.fillText(data.clockHeading, padX + 24, boxY + 38);

    // Connecting glowing rail
    const nodes = data.clockNodes;
    const railY = boxY + 112;
    const firstX = padX + 130;
    const lastX = padX + lowerSafeW - 130;

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.14)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(firstX, railY);
    ctx.lineTo(lastX, railY);
    ctx.stroke();

    const beamT = easeOutCubic(clamp((localF - clockStart - 6) / 36, 0, 1));
    const beamGrad = ctx.createLinearGradient(firstX, 0, lastX, 0);
    beamGrad.addColorStop(0, V3_COLORS.infoCyan);
    beamGrad.addColorStop(0.5, V3_COLORS.brandGold);
    beamGrad.addColorStop(1, V3_COLORS.upRed);
    ctx.strokeStyle = beamGrad;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(firstX, railY);
    ctx.lineTo(lerp(firstX, lastX, beamT), railY);
    ctx.stroke();

    nodes.forEach((node, idx) => {
      const frac = nodes.length <= 1 ? 0.5 : idx / (nodes.length - 1);
      const nx = lerp(firstX, lastX, frac);
      const lit = beamT >= frac - 0.04;
      const pulse = lit ? 0.5 + 0.5 * Math.sin((localF - idx * 8) * 0.18) : 0;

      if (lit) {
        ctx.fillStyle = `rgba(251, 191, 36, ${0.18 + pulse * 0.2})`;
        ctx.beginPath();
        ctx.arc(nx, railY, 22 + pulse * 6, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.fillStyle = lit ? V3_COLORS.brandGold : '#334155';
      ctx.beginPath();
      ctx.arc(nx, railY, 12, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#070A10';
      ctx.beginPath();
      ctx.arc(nx, railY, 5, 0, Math.PI * 2);
      ctx.fill();

      // Time badge
      ctx.textAlign = 'center';
      ctx.font = `900 30px ${MONO}`;
      ctx.fillStyle = lit ? V3_COLORS.brandGoldLight : V3_COLORS.textMuted;
      ctx.fillText(node.time, nx, railY + 48);

      // Action label
      ctx.font = `700 22px ${FONT}`;
      ctx.fillStyle = lit ? V3_COLORS.textPrimary : V3_COLORS.textMuted;
      ctx.fillText(node.label, nx, railY + 90);
    });

    ctx.restore();
  }

  drawV3SafeFooterWatermark(ctx, width);
  drawV3SceneEntrySweep(ctx, width, height, localF, V3_COLORS.brandGold);
}
