import { clamp, easeOutCubic, lerp } from '../../timeline';
import type {
  AnimatedPosterStageData,
  PosterSpotlightBeat,
} from '../schema';
import {
  FONT,
  MONO,
  drawStyledPlaceholder,
  easeOutBack,
  roundRect,
  type SceneRenderContext,
} from './primitives';

function getPosterNaturalSize(
  img: HTMLImageElement | null | undefined
): { natW: number; natH: number } | null {
  if (!img || !img.complete || img.naturalWidth === 0 || img.naturalHeight === 0) {
    return null;
  }
  return { natW: img.naturalWidth, natH: img.naturalHeight };
}

function easeInOutCubic(t: number): number {
  const x = clamp(t, 0, 1);
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

/**
 * Draws an aspect-preserving fullscreen (or panel) camera view of the poster,
 * filling 100% of (dx, dy, dw, dh) edge-to-edge with zero distortion.
 */
function drawPosterCameraView(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement | null | undefined,
  nat: { natW: number; natH: number } | null,
  dx: number,
  dy: number,
  dw: number,
  dh: number,
  cx: number,
  cy: number,
  spanW: number,
  light = true
): { sx: number; sy: number; sw: number; sh: number } {
  if (!img || !nat) {
    drawStyledPlaceholder(ctx, dx, dy, dw, dh, !light);
    return { sx: 0, sy: 0, sw: 1, sh: 1 };
  }

  const targetAspect = dw / Math.max(1, dh);
  let sw = clamp(spanW, 0.18, 1.0) * nat.natW;
  let sh = sw / targetAspect;
  if (sh > nat.natH) {
    sh = nat.natH;
    sw = sh * targetAspect;
  }
  if (sw > nat.natW) {
    sw = nat.natW;
    sh = sw / targetAspect;
  }

  const sx = clamp(cx * nat.natW - sw / 2, 0, Math.max(0, nat.natW - sw));
  const sy = clamp(cy * nat.natH - sh / 2, 0, Math.max(0, nat.natH - sh));

  ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh);
  return { sx, sy, sw, sh };
}

/** Map normalized poster coords (nx, ny) -> current screen pixel coords inside camera view */
function mapPosterToScreen(
  nx: number,
  ny: number,
  nat: { natW: number; natH: number },
  cam: { sx: number; sy: number; sw: number; sh: number },
  dx: number,
  dy: number,
  dw: number,
  dh: number
): { x: number; y: number } {
  const px = nx * nat.natW;
  const py = ny * nat.natH;
  return {
    x: dx + ((px - cam.sx) / Math.max(1, cam.sw)) * dw,
    y: dy + ((py - cam.sy) / Math.max(1, cam.sh)) * dh,
  };
}

/** Slim clean top progress hairline */
function drawTopProgressHairline(
  ctx: CanvasRenderingContext2D,
  frame: number,
  totalFrames: number,
  width: number,
  accentColor: string,
  light: boolean
): void {
  const progress = clamp(frame / Math.max(1, totalFrames - 1), 0, 1);
  ctx.save();
  ctx.fillStyle = light ? 'rgba(255, 255, 255, 0.72)' : 'rgba(0, 0, 0, 0.78)';
  ctx.fillRect(0, 0, width, 10);
  ctx.fillStyle = light ? 'rgba(15, 23, 42, 0.14)' : 'rgba(255, 255, 255, 0.16)';
  ctx.fillRect(0, 0, width, 6);
  ctx.fillStyle = accentColor;
  ctx.fillRect(0, 0, Math.max(12, width * progress), 6);
  ctx.restore();
}

/** Frosted floating pill banner (supports pure dark #000000 and daylight modes) */
function drawDaylightPillCard(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  accentColor: string,
  title: string,
  alpha = 1,
  metricRight?: string,
  light = true
): void {
  if (alpha <= 0.01) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.shadowColor = light ? 'rgba(15, 23, 42, 0.18)' : 'rgba(0, 0, 0, 0.72)';
  ctx.shadowBlur = 26;
  ctx.shadowOffsetY = 8;
  ctx.fillStyle = light ? 'rgba(255, 255, 255, 0.95)' : 'rgba(7, 10, 18, 0.94)';
  roundRect(ctx, x, y, w, h, 20);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  ctx.strokeStyle = accentColor;
  ctx.lineWidth = 3;
  ctx.stroke();

  // Left accent bar
  ctx.fillStyle = accentColor;
  roundRect(ctx, x + 12, y + 16, 8, h - 32, 4);
  ctx.fill();

  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.font = `900 32px ${FONT}`;
  ctx.fillStyle = light ? '#0F172A' : '#F8FAFC';
  const maxTitleW = metricRight ? w - 260 : w - 56;
  ctx.fillText(title, x + 34, y + h / 2, maxTitleW);

  if (metricRight) {
    ctx.textAlign = 'right';
    ctx.font = `900 44px ${MONO}, ${FONT}`;
    ctx.fillStyle = accentColor;
    ctx.fillText(metricRight, x + w - 28, y + h / 2);
  }
  ctx.restore();
}

function drawReticleBrackets(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  len: number,
  color: string,
  lineWidth = 4
): void {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.lineCap = 'square';
  ctx.beginPath();
  ctx.moveTo(x, y + len);
  ctx.lineTo(x, y);
  ctx.lineTo(x + len, y);
  ctx.moveTo(x + w - len, y);
  ctx.lineTo(x + w, y);
  ctx.lineTo(x + w, y + len);
  ctx.moveTo(x, y + h - len);
  ctx.lineTo(x, y + h);
  ctx.lineTo(x + len, y + h);
  ctx.moveTo(x + w - len, y + h);
  ctx.lineTo(x + w, y + h);
  ctx.lineTo(x + w, y + h - len);
  ctx.stroke();
  ctx.restore();
}

/* ============================================================================
 * STYLE 1: `camera_crash_tour` (核心PCE 3.3% 通胀冲击)
 * Cinematic Fullscreen Camera Glide + Shockwave Sonar Rings + Laser Crash Line + Live Ticker Tape
 * ========================================================================== */
function renderCameraCrashTour(
  rc: SceneRenderContext,
  data: AnimatedPosterStageData,
  img: HTMLImageElement | null | undefined,
  nat: { natW: number; natH: number } | null
): void {
  const { ctx, frame, localFrame: localF, timeline } = rc;
  const { width, height, totalFrames } = timeline;
  const isLight = data.theme === 'light';
  const alertCol = isLight ? '#DC2626' : '#F87171';

  ctx.fillStyle = isLight ? '#FFFFFF' : '#000000';
  ctx.fillRect(0, 0, width, height);

  // Camera keyframes across the 240f scene (cx, cy, spanW)
  let cx = 0.5;
  let cy = 0.24;
  let spanW = 0.844;

  if (localF < 32) {
    // Establishing top slam onto 核心PCE 3.3%
    const t = easeOutCubic(localF / 24);
    cx = 0.5;
    cy = lerp(0.18, 0.23, t);
    spanW = lerp(0.74, 0.844, t);
  } else if (localF < 92) {
    // Smooth glide left to 10月核心PCE 3.3% sign
    const t = easeInOutCubic((localF - 32) / 20);
    cx = lerp(0.5, 0.23, t);
    cy = lerp(0.23, 0.34, t);
    spanW = lerp(0.844, 0.53, t);
  } else if (localF < 152) {
    // Diagonal sweep right onto Federal Reserve + 加息概率接近100%
    const t = easeInOutCubic((localF - 92) / 22);
    cx = lerp(0.23, 0.62, t);
    cy = lerp(0.34, 0.48, t);
    spanW = lerp(0.53, 0.6, t);
  } else if (localF < 208) {
    // Tilt down onto 4 Tech Giants (-3.8%, -2.9%, -3.1%, -3.2%)
    const t = easeInOutCubic((localF - 152) / 20);
    cx = lerp(0.62, 0.43, t);
    cy = lerp(0.48, 0.72, t);
    spanW = lerp(0.6, 0.844, t);
  } else {
    // Pullback to full-bleed lower/mid conclusion
    const t = easeOutCubic((localF - 208) / 20);
    cx = lerp(0.43, 0.5, t);
    cy = lerp(0.72, 0.56, t);
    spanW = 0.844;
  }

  const cam = drawPosterCameraView(ctx, img, nat, 0, 0, width, height, cx, cy, spanW, isLight);

  // Beat 0 (0..34): Expanding crimson sonar shockwave rings around 3.3%
  if (localF < 42 && nat) {
    const p33 = mapPosterToScreen(0.73, 0.11, nat, cam, 0, 0, width, height);
    for (let r = 0; r < 3; r++) {
      const rp = clamp((localF - r * 7) / 28, 0, 1);
      if (rp <= 0 || rp >= 1) continue;
      ctx.save();
      ctx.strokeStyle = `rgba(239, 68, 68, ${(1 - rp) * 0.84})`;
      ctx.lineWidth = lerp(8, 2, rp);
      ctx.beginPath();
      ctx.arc(p33.x, p33.y, lerp(36, 420, easeOutCubic(rp)), 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  // Beat 1 (32..92): Live floating counter pill (2.8% -> 3.3%)
  if (localF >= 34 && localF < 92) {
    const inT = easeOutBack(clamp((localF - 34) / 12, 0, 1));
    const outT = localF > 84 ? clamp((92 - localF) / 8, 0, 1) : 1;
    const valT = easeOutCubic(clamp((localF - 38) / 22, 0, 1));
    const pceVal = lerp(2.8, 3.3, valT).toFixed(1);

    ctx.save();
    ctx.globalAlpha = inT * outT;
    const cardW = 470;
    const cardH = 148;
    const cardX = width - cardW - 44;
    const cardY = 82;
    ctx.shadowColor = isLight ? 'rgba(15, 23, 42, 0.2)' : 'rgba(0, 0, 0, 0.72)';
    ctx.shadowBlur = 24;
    ctx.fillStyle = isLight ? 'rgba(255, 255, 255, 0.95)' : 'rgba(7, 10, 18, 0.94)';
    roundRect(ctx, cardX, cardY, cardW, cardH, 22);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = alertCol;
    ctx.lineWidth = 3.5;
    ctx.stroke();

    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.font = `800 24px ${FONT}`;
    ctx.fillStyle = isLight ? '#475569' : '#94A3B8';
    ctx.fillText('10月核心PCE · 超预期', cardX + 26, cardY + 20);

    ctx.font = `900 58px ${MONO}, ${FONT}`;
    ctx.fillStyle = alertCol;
    ctx.fillText(`${pceVal}%`, cardX + 26, cardY + 60);

    ctx.textAlign = 'right';
    ctx.font = `800 24px ${FONT}`;
    ctx.fillStyle = isLight ? '#0F172A' : '#F8FAFC';
    ctx.fillText('2023.11以来高位', cardX - 24 + cardW, cardY + 86);
    ctx.restore();
  }

  // Beat 2 (92..152): Circular Rate Hike Probability Arc Gauge (45% -> 99%)
  if (localF >= 94 && localF < 152) {
    const inT = easeOutCubic(clamp((localF - 94) / 10, 0, 1));
    const outT = localF > 144 ? clamp((152 - localF) / 8, 0, 1) : 1;
    const pctT = easeOutCubic(clamp((localF - 98) / 26, 0, 1));
    const pctVal = Math.round(lerp(45, 99, pctT));

    ctx.save();
    ctx.globalAlpha = inT * outT;
    const gx = 220;
    const gy = 250;
    ctx.shadowColor = isLight ? 'rgba(15, 23, 42, 0.22)' : 'rgba(0, 0, 0, 0.78)';
    ctx.shadowBlur = 28;
    ctx.fillStyle = isLight ? 'rgba(255, 255, 255, 0.95)' : 'rgba(7, 10, 18, 0.94)';
    ctx.beginPath();
    ctx.arc(gx, gy, 134, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    // Gauge track & active arc
    ctx.lineWidth = 14;
    ctx.strokeStyle = isLight ? '#E2E8F0' : 'rgba(255, 255, 255, 0.14)';
    ctx.beginPath();
    ctx.arc(gx, gy, 108, -Math.PI * 0.5, Math.PI * 1.5);
    ctx.stroke();

    ctx.strokeStyle = alertCol;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(gx, gy, 108, -Math.PI * 0.5, -Math.PI * 0.5 + (Math.PI * 2 * pctVal) / 100);
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `900 54px ${MONO}, ${FONT}`;
    ctx.fillStyle = alertCol;
    ctx.fillText(`${pctVal}%`, gx, gy - 10);
    ctx.font = `800 22px ${FONT}`;
    ctx.fillStyle = isLight ? '#0F172A' : '#F8FAFC';
    ctx.fillText('加息概率飙升', gx, gy + 42);
    ctx.restore();
  }

  // Beat 3 (152..208): Glowing crash laser polyline + smooth scrolling stock ticker tape
  if (localF >= 152 && localF < 212) {
    const inT = easeOutCubic(clamp((localF - 152) / 10, 0, 1));
    const outT = localF > 202 ? clamp((212 - localF) / 10, 0, 1) : 1;

    if (nat) {
      // Trace zigzag across top of 4 tech towers
      const pts = [
        [0.06, 0.64],
        [0.24, 0.69],
        [0.37, 0.63],
        [0.54, 0.72],
        [0.64, 0.67],
        [0.77, 0.78],
      ].map(([nx, ny]) => mapPosterToScreen(nx, ny, nat, cam, 0, 0, width, height));

      const traceT = clamp((localF - 156) / 26, 0, 1);
      const segs = pts.length - 1;
      const curF = traceT * segs;
      const fullS = Math.floor(curF);
      const frac = curF - fullS;

      ctx.save();
      ctx.globalAlpha = inT * outT;
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 10;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i <= fullS; i++) ctx.lineTo(pts[i].x, pts[i].y);
      if (fullS < segs) {
        ctx.lineTo(
          lerp(pts[fullS].x, pts[fullS + 1].x, frac),
          lerp(pts[fullS].y, pts[fullS + 1].y, frac)
        );
      }
      ctx.stroke();

      ctx.strokeStyle = '#EF4444';
      ctx.lineWidth = 5;
      ctx.stroke();

      const tipX =
        fullS >= segs ? pts[segs].x : lerp(pts[fullS].x, pts[fullS + 1].x, frac);
      const tipY =
        fullS >= segs ? pts[segs].y : lerp(pts[fullS].y, pts[fullS + 1].y, frac);
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.arc(tipX, tipY, 12, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#EF4444';
      ctx.beginPath();
      ctx.arc(tipX, tipY, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Smooth scrolling bottom stock ticker tape
    ctx.save();
    ctx.globalAlpha = inT * outT;
    const tapeY = height - 96;
    ctx.shadowColor = isLight ? 'rgba(15, 23, 42, 0.18)' : 'rgba(0, 0, 0, 0.72)';
    ctx.shadowBlur = 18;
    ctx.fillStyle = isLight ? 'rgba(255, 255, 255, 0.96)' : 'rgba(4, 7, 13, 0.96)';
    ctx.fillRect(0, tapeY, width, 96);
    ctx.shadowBlur = 0;
    ctx.fillStyle = alertCol;
    ctx.fillRect(0, tapeY, width, 5);

    const tickerText =
      'NVDA -3.8%   ▼   MSFT -2.9%   ▼   AAPL -3.1%   ▼   META -3.2%   ▼   通胀不肯降 · 科技权重短期承压   ▼   ';
    ctx.font = `900 32px ${MONO}, ${FONT}`;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    const textW = ctx.measureText(tickerText).width;
    const scrollX = -((localF - 152) * 8) % textW;
    ctx.fillStyle = isLight ? '#0F172A' : '#F8FAFC';
    ctx.fillText(tickerText, scrollX, tapeY + 50);
    ctx.fillText(tickerText, scrollX + textW, tapeY + 50);
    ctx.restore();
  }

  // Final pullback bottom summary bar
  if (localF >= 208) {
    const finT = easeOutCubic(clamp((localF - 208) / 14, 0, 1));
    drawDaylightPillCard(
      ctx,
      44,
      height - 136,
      width - 88,
      92,
      alertCol,
      data.bottomTicker,
      finT,
      undefined,
      isLight
    );
  }

  // Snappy camera flash on arrival
  if (localF < 6) {
    ctx.save();
    ctx.fillStyle = isLight
      ? `rgba(255, 255, 255, ${lerp(0.85, 0, localF / 6)})`
      : `rgba(248, 113, 113, ${lerp(0.35, 0, localF / 6)})`;
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
  }

  drawTopProgressHairline(ctx, frame, totalFrames, width, alertCol, isLight);
}

/* ============================================================================
 * STYLE 2: `split_prism_compare` (AI算力风险警报：租金松动 × 信用承压 × PCB扩产)
 * 3-Column Shutter Reveal + GPU Waterfall -35% + Top vs Bottom Split-Screen VS Duel
 * ========================================================================== */
function renderSplitPrismCompare(
  rc: SceneRenderContext,
  data: AnimatedPosterStageData,
  img: HTMLImageElement | null | undefined,
  nat: { natW: number; natH: number } | null
): void {
  const { ctx, frame, localFrame: localF, timeline } = rc;
  const { width, height, totalFrames } = timeline;
  const isLight = data.theme === 'light';
  const cyanCol = isLight ? '#0284C7' : '#38BDF8';
  const riskCol = isLight ? '#DC2626' : '#F87171';
  const bullCol = isLight ? '#059669' : '#34D399';

  ctx.fillStyle = isLight ? '#FFFFFF' : '#000000';
  ctx.fillRect(0, 0, width, height);

  if (localF >= 136 && localF < 208) {
    // DRAMATIC FULL-WIDTH TOP vs BOTTOM SPLIT-SCREEN DUEL:
    // Top half: Card 4 (CoreWeave 5Y CDS 15.34%) vs Bottom half: Card 5 (高端PCB排单延至2028)
    const splitAge = localF - 136;
    const inT = easeOutCubic(clamp(splitAge / 14, 0, 1));
    const outT = localF > 196 ? easeInOutCubic((localF - 196) / 12) : 0;
    const gutter = lerp(18, 0, outT);
    const halfH = (height - gutter) / 2;

    // Top panel slides in from left -> Card 4 (CoreWeave CDS 15.34%)
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, width, halfH);
    ctx.clip();
    ctx.translate(lerp(-180, 0, inT), 0);
    drawPosterCameraView(ctx, img, nat, 0, 0, width, halfH, 0.255, 0.665, 0.49, isLight);
    ctx.restore();

    // Bottom panel slides in from right -> Card 5 (2028 PCB backlog)
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, halfH + gutter, width, halfH);
    ctx.clip();
    ctx.translate(lerp(180, 0, inT), 0);
    drawPosterCameraView(
      ctx,
      img,
      nat,
      0,
      halfH + gutter,
      width,
      halfH,
      0.745,
      0.665,
      0.49,
      isLight
    );
    ctx.restore();

    // Pure black/white horizontal divider & VS badge + crisp non-overlapping pills
    const badgeAlpha = inT * (1 - outT);
    if (badgeAlpha > 0.02) {
      ctx.save();
      ctx.globalAlpha = badgeAlpha;
      ctx.fillStyle = isLight ? '#FFFFFF' : '#000000';
      ctx.fillRect(0, halfH, width, gutter);

      drawDaylightPillCard(
        ctx,
        44,
        46,
        width - 88,
        92,
        riskCol,
        '风险端 · CoreWeave 5Y CDS',
        1,
        '15.34%',
        isLight
      );

      drawDaylightPillCard(
        ctx,
        44,
        height - 134,
        width - 88,
        92,
        bullCol,
        '景气端 · 高端PCB订单排至',
        1,
        '2028年',
        isLight
      );

      // Center floating circular VS emblem
      ctx.shadowColor = isLight ? 'rgba(15, 23, 42, 0.28)' : 'rgba(0, 0, 0, 0.85)';
      ctx.shadowBlur = 24;
      ctx.fillStyle = isLight ? '#FFFFFF' : '#000000';
      ctx.beginPath();
      ctx.arc(width / 2, height * 0.5, 58, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = isLight ? '#0F172A' : '#F8FAFC';
      ctx.lineWidth = 5;
      ctx.stroke();

      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `900 40px ${MONO}, ${FONT}`;
      ctx.fillStyle = isLight ? '#0F172A' : '#F8FAFC';
      ctx.fillText('VS', width / 2, height * 0.5 + 2);
      ctx.restore();
    }
  } else {
    // Fullscreen camera framing for Phases 0..2 and Finale
    let cx = 0.5;
    let cy = 0.34;
    let spanW = 0.844;

    if (localF < 84) {
      const t = easeInOutCubic(clamp((localF - 24) / 30, 0, 1));
      cx = 0.5;
      cy = lerp(0.28, 0.35, t);
      spanW = 0.844;
    } else if (localF < 136) {
      const t = easeInOutCubic(clamp((localF - 84) / 18, 0, 1));
      cx = 0.5;
      cy = lerp(0.35, 0.49, t);
      spanW = lerp(0.844, 0.78, t);
    } else {
      const t = easeOutCubic(clamp((localF - 208) / 16, 0, 1));
      cx = 0.5;
      cy = lerp(0.68, 0.72, t);
      spanW = 0.844;
    }

    const cam = drawPosterCameraView(ctx, img, nat, 0, 0, width, height, cx, cy, spanW, isLight);

    // Phase 0 (0..28): 3 staggered shutter panels opening + cyan laser scan
    if (localF < 28) {
      const colW = width / 3;
      for (let c = 0; c < 3; c++) {
        const sT = easeInOutCubic(clamp((localF - c * 4) / 14, 0, 1));
        const wipeH = height * (1 - sT);
        if (wipeH > 1) {
          ctx.fillStyle = isLight ? '#FFFFFF' : '#000000';
          ctx.fillRect(c * colW, 0, colW + 2, wipeH);
        }
      }

      // Crisp cyan laser sweep down the header
      const scanY = lerp(80, 620, clamp(localF / 24, 0, 1));
      const scanGrad = ctx.createLinearGradient(0, scanY - 40, 0, scanY + 40);
      scanGrad.addColorStop(0, 'rgba(56, 189, 248, 0)');
      scanGrad.addColorStop(0.5, isLight ? 'rgba(2, 132, 199, 0.55)' : 'rgba(56, 189, 248, 0.72)');
      scanGrad.addColorStop(1, 'rgba(56, 189, 248, 0)');
      ctx.fillStyle = scanGrad;
      ctx.fillRect(0, scanY - 40, width, 80);
    }

    // Phase 1 (30..84): Crisp highlight bracket gliding Card 1 -> Card 2
    if (localF >= 30 && localF < 84 && nat) {
      const cardFocus = localF < 57 ? 0 : 1;
      const targetCrop = cardFocus === 0
        ? { x: 0.04, y: 0.24, w: 0.45, h: 0.16 }
        : { x: 0.51, y: 0.24, w: 0.45, h: 0.16 };
      const tl = mapPosterToScreen(targetCrop.x, targetCrop.y, nat, cam, 0, 0, width, height);
      const br = mapPosterToScreen(
        targetCrop.x + targetCrop.w,
        targetCrop.y + targetCrop.h,
        nat,
        cam,
        0,
        0,
        width,
        height
      );
      drawReticleBrackets(
        ctx,
        tl.x - 8,
        tl.y - 8,
        br.x - tl.x + 16,
        br.y - tl.y + 16,
        28,
        cyanCol,
        5
      );
      drawDaylightPillCard(
        ctx,
        44,
        height - 144,
        width - 88,
        96,
        cyanCol,
        cardFocus === 0 ? '二手算力卖家急寻接盘方' : 'AI芯片潜在过剩重估需求',
        easeOutCubic(clamp((localF - 30) / 10, 0, 1)),
        undefined,
        isLight
      );
    }

    // Phase 2 (84..136): Animated Waterfall GPU Rent Drop Bar ($15.5 -> $10.0, -35%)
    if (localF >= 84 && localF < 136) {
      const inT = easeOutCubic(clamp((localF - 84) / 10, 0, 1));
      const dropT = easeOutCubic(clamp((localF - 90) / 22, 0, 1));
      const curPrice = lerp(15.5, 10.0, dropT);
      const pctDrop = Math.round(lerp(0, -35, dropT));

      ctx.save();
      ctx.globalAlpha = inT;
      const boxX = 48;
      const boxY = height - 228;
      const boxW = width - 96;
      const boxH = 180;
      ctx.shadowColor = isLight ? 'rgba(15, 23, 42, 0.22)' : 'rgba(0, 0, 0, 0.78)';
      ctx.shadowBlur = 24;
      ctx.fillStyle = isLight ? 'rgba(255, 255, 255, 0.96)' : 'rgba(7, 10, 18, 0.95)';
      roundRect(ctx, boxX, boxY, boxW, boxH, 22);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = cyanCol;
      ctx.lineWidth = 3.5;
      ctx.stroke();

      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.font = `900 30px ${FONT}`;
      ctx.fillStyle = isLight ? '#0F172A' : '#F8FAFC';
      ctx.fillText('SpaceX 下调 Blackwell GPU 租金', boxX + 28, boxY + 22);

      ctx.textAlign = 'right';
      ctx.font = `900 44px ${MONO}, ${FONT}`;
      ctx.fillStyle = cyanCol;
      ctx.fillText(`${pctDrop}%`, boxX + boxW - 28, boxY + 16);

      // Animated shrink bar
      const barX = boxX + 28;
      const barY = boxY + 84;
      const barMaxW = boxW - 56;
      ctx.fillStyle = isLight ? '#E2E8F0' : 'rgba(255, 255, 255, 0.14)';
      roundRect(ctx, barX, barY, barMaxW, 34, 10);
      ctx.fill();

      const activeW = barMaxW * (curPrice / 15.5);
      const bGrad = ctx.createLinearGradient(barX, 0, barX + activeW, 0);
      bGrad.addColorStop(0, '#0284C7');
      bGrad.addColorStop(1, '#38BDF8');
      ctx.fillStyle = bGrad;
      roundRect(ctx, barX, barY, activeW, 34, 10);
      ctx.fill();

      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.font = `800 26px ${MONO}, ${FONT}`;
      ctx.fillStyle = isLight ? '#334155' : '#CBD5E1';
      ctx.fillText(`$15.5/h  →  $${curPrice.toFixed(1)}/h`, barX, barY + 46);
      ctx.restore();
    }

    // Finale (208..240): Clean bottom takeaway pill
    if (localF >= 208) {
      const finT = easeOutCubic(clamp((localF - 208) / 14, 0, 1));
      drawDaylightPillCard(
        ctx,
        44,
        height - 136,
        width - 88,
        92,
        cyanCol,
        data.bottomTicker,
        finT,
        undefined,
        isLight
      );
    }
  }

  drawTopProgressHairline(ctx, frame, totalFrames, width, cyanCol, isLight);
}

/* ============================================================================
 * STYLE 3: `parallax_orbital_flight` (商业航天盘前情报)
 * ========================================================================== */
function renderParallaxOrbitalFlight(
  rc: SceneRenderContext,
  data: AnimatedPosterStageData,
  img: HTMLImageElement | null | undefined,
  nat: { natW: number; natH: number } | null
): void {
  const { ctx, frame, localFrame: localF, timeline } = rc;
  const { width, height, totalFrames } = timeline;
  const isLight = data.theme === 'light';

  ctx.fillStyle = isLight ? '#FFFFFF' : '#000000';
  ctx.fillRect(0, 0, width, height);

  let cx = 0.5;
  let cy = 0.5;
  let spanW = 1.0;

  if (localF < 38) {
    const t = easeOutCubic(localF / 28);
    cx = lerp(0.36, 0.5, t);
    cy = lerp(0.24, 0.34, t);
    spanW = lerp(0.76, 0.94, t);
  } else if (localF < 98) {
    const t = easeInOutCubic((localF - 38) / 20);
    cx = 0.5;
    cy = lerp(0.34, 0.41, t);
    spanW = lerp(0.94, 0.96, t);
  } else if (localF < 158) {
    const t = easeInOutCubic((localF - 98) / 22);
    cx = 0.5;
    cy = lerp(0.41, 0.59, t);
    spanW = lerp(0.96, 0.9, t);
  } else {
    const t = easeOutCubic((localF - 158) / 18);
    cx = 0.5;
    cy = lerp(0.59, 0.5, t);
    spanW = lerp(0.9, 1.0, t);
  }

  const cam = drawPosterCameraView(ctx, img, nat, 0, 0, width, height, cx, cy, spanW, isLight);

  if (localF >= 158 && nat) {
    const tileColors = ['#F87171', '#FBBF24', '#38BDF8', '#34D399', '#C084FC'];
    const tileCentersX = [0.122, 0.311, 0.5, 0.689, 0.878];
    tileCentersX.forEach((tcx, idx) => {
      const startF = 164 + idx * 7;
      if (localF < startF) return;
      const tl = mapPosterToScreen(tcx - 0.087, 0.733, nat, cam, 0, 0, width, height);
      const br = mapPosterToScreen(tcx + 0.087, 0.821, nat, cam, 0, 0, width, height);
      drawReticleBrackets(ctx, tl.x, tl.y, br.x - tl.x, br.y - tl.y, 20, tileColors[idx], 5);
    });
  }

  drawTopProgressHairline(ctx, frame, totalFrames, width, data.accentColor, isLight);
}

/* ============================================================================
 * STYLE 4: `spotlight_popout` (注意聚焦 · Focus-and-Dim 全屏聚光弹出风格)
 * 100% Fullscreen Base Poster + 0.84 Uniform Focus-and-Dim Scrim + Magnified Elastic Popout +
 * Outer-Bezel Stamp + Non-Overlapping Spotlight HUD Card (Counter + Sequential Chips) + Dark Ticker
 * ========================================================================== */
function drawSpotlightHudCallout(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  beat: PosterSpotlightBeat,
  localF: number,
  isLight: boolean
): number {
  const age = localF - beat.enterFrame;
  const hudIn = easeOutCubic(clamp(age / 10, 0, 1));
  const hasDetail = Boolean(beat.calloutDetail);
  const chipList = beat.chips ?? [];
  const hasChips = chipList.length > 0;
  const chipRows = hasChips ? (chipList.length > 3 ? 2 : 1) : 0;
  const hudH = 124 + (hasDetail ? 42 : 0) + (hasChips ? chipRows * 58 + 16 : 0);

  ctx.save();
  ctx.globalAlpha = hudIn;
  ctx.translate(0, lerp(beat.hudPosition === 'top' ? -24 : 24, 0, hudIn));

  ctx.shadowColor = isLight ? 'rgba(15, 23, 42, 0.2)' : 'rgba(0, 0, 0, 0.82)';
  ctx.shadowBlur = 28;
  ctx.fillStyle = isLight ? 'rgba(255, 255, 255, 0.96)' : 'rgba(7, 10, 18, 0.95)';
  roundRect(ctx, x, y, w, hudH, 20);
  ctx.fill();
  ctx.shadowBlur = 0;

  ctx.strokeStyle = beat.accentColor;
  ctx.lineWidth = 3;
  ctx.stroke();

  // Left accent bar
  ctx.fillStyle = beat.accentColor;
  roundRect(ctx, x + 12, y + 16, 8, hudH - 32, 4);
  ctx.fill();

  const rightMetricW = beat.counter ? 240 : 0;
  const contentX = x + 36;
  const contentMaxW = w - 64 - rightMetricW;

  // Badge pill
  ctx.font = `800 20px ${MONO}, ${FONT}`;
  const badgeW = Math.min(contentMaxW, ctx.measureText(beat.badge).width + 26);
  ctx.fillStyle = `${beat.accentColor}26`;
  roundRect(ctx, contentX, y + 18, badgeW, 32, 8);
  ctx.fill();
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = beat.accentColor;
  ctx.fillText(beat.badge, contentX + 13, y + 34, badgeW - 20);

  // Main callout title
  ctx.font = `900 34px ${FONT}`;
  ctx.fillStyle = isLight ? '#0F172A' : '#F8FAFC';
  ctx.fillText(beat.calloutTitle, contentX, y + 84, contentMaxW);

  // Optional detail line
  if (beat.calloutDetail) {
    ctx.font = `700 23px ${FONT}`;
    ctx.fillStyle = isLight ? '#475569' : '#CBD5E1';
    ctx.fillText(beat.calloutDetail, contentX, y + 126, contentMaxW);
  }

  // Right-side animated counter (stacked cleanly: label on top, giant number below)
  if (beat.counter) {
    const cT = easeOutCubic(clamp((age - 4) / 24, 0, 1));
    const curVal = lerp(beat.counter.startValue, beat.counter.endValue, cT);
    const valStr = `${beat.counter.prefix ?? ''}${curVal.toFixed(beat.counter.decimals ?? 0)}${beat.counter.suffix ?? ''}`;

    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    ctx.font = `700 21px ${FONT}`;
    ctx.fillStyle = isLight ? '#64748B' : '#94A3B8';
    ctx.fillText(beat.counter.label, x + w - 28, y + 20, rightMetricW - 12);

    ctx.font = `900 54px ${MONO}, ${FONT}`;
    ctx.fillStyle = beat.accentColor;
    ctx.fillText(valStr, x + w - 28, y + 48, rightMetricW - 12);
  }

  // Sequential spring-animated industry chips
  if (hasChips) {
    const chipsStartY = y + (hasDetail ? 158 : 120);
    const perRow = chipList.length > 3 ? 3 : chipList.length;
    const chipGap = 14;
    const chipW = Math.floor((w - 64 - chipGap * (perRow - 1)) / perRow);
    const chipH = 46;

    chipList.forEach((chip, idx) => {
      const chipAge = age - (5 + idx * 5);
      if (chipAge < 0) return;
      const cPop = easeOutBack(clamp(chipAge / 10, 0, 1));
      const row = Math.floor(idx / perRow);
      const col = idx % perRow;
      const rowCount = row === 0 ? Math.min(perRow, chipList.length) : chipList.length - perRow;
      const rowTotalW = rowCount * chipW + (rowCount - 1) * chipGap;
      const rowStartX = contentX + ((w - 64) - rowTotalW) / 2;

      const cx = rowStartX + col * (chipW + chipGap);
      const cy = chipsStartY + row * (chipH + 12);
      const chipColor = chip.color ?? beat.accentColor;

      ctx.save();
      ctx.globalAlpha = hudIn * clamp(chipAge / 5, 0, 1);
      ctx.translate(cx + chipW / 2, cy + chipH / 2);
      ctx.scale(lerp(0.75, 1, cPop), lerp(0.75, 1, cPop));

      ctx.fillStyle = isLight ? '#F8FAFC' : 'rgba(255, 255, 255, 0.06)';
      roundRect(ctx, -chipW / 2, -chipH / 2, chipW, chipH, 10);
      ctx.fill();
      ctx.strokeStyle = chipColor;
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `800 22px ${FONT}`;
      ctx.fillStyle = chipColor;
      ctx.fillText(`${chip.label} ${chip.value}`, 0, 1, chipW - 16);
      ctx.restore();
    });
  }

  ctx.restore();
  return hudH;
}

function renderSpotlightPopout(
  rc: SceneRenderContext,
  data: AnimatedPosterStageData,
  img: HTMLImageElement | null | undefined,
  nat: { natW: number; natH: number } | null
): void {
  const { ctx, frame, localFrame: localF, shot, timeline } = rc;
  const { width, height, totalFrames } = timeline;
  const isLight = data.theme === 'light';
  const duration = shot.durationFrames;

  ctx.fillStyle = isLight ? '#FFFFFF' : '#000000';
  ctx.fillRect(0, 0, width, height);

  // Subtle breathing scale over 100% fullscreen poster
  const breath = 1 - 0.025 * Math.sin((localF / Math.max(1, duration)) * Math.PI);
  const cam = drawPosterCameraView(ctx, img, nat, 0, 0, width, height, 0.5, 0.5, breath, isLight);

  // Establish & Finale subtle sheen sweep across the fullscreen poster
  if (localF < 18 || localF >= (data.revealHoldStartFrame ?? 204)) {
    const sheenT = localF < 18 ? localF / 18 : (localF - (data.revealHoldStartFrame ?? 204)) / 36;
    const sweepX = lerp(-240, width + 240, clamp(sheenT, 0, 1));
    ctx.save();
    const sGrad = ctx.createLinearGradient(sweepX - 160, 0, sweepX + 160, height * 0.4);
    sGrad.addColorStop(0, 'rgba(255, 255, 255, 0)');
    sGrad.addColorStop(0.5, 'rgba(255, 255, 255, 0.16)');
    sGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = sGrad;
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
  }

  const activeBeat: PosterSpotlightBeat | undefined = data.beats.find(
    (b) => localF >= b.enterFrame && localF < b.exitFrame
  );

  if (activeBeat) {
    const age = localF - activeBeat.enterFrame;
    const remain = activeBeat.exitFrame - localF;
    const inOutAlpha = clamp(age / 7, 0, 1) * clamp(remain / 7, 0, 1);

    // 1) Uniform Focus-and-Dim scrim so popped region commands full viewer attention
    ctx.save();
    ctx.fillStyle = isLight
      ? `rgba(15, 23, 42, ${0.74 * inOutAlpha})`
      : `rgba(0, 0, 0, ${0.84 * inOutAlpha})`;
    ctx.fillRect(0, 0, width, height);
    ctx.restore();

    // 2) Subtle glowing crop origin locator on the dimmed background poster
    if (nat) {
      const srcTL = mapPosterToScreen(
        activeBeat.crop.x,
        activeBeat.crop.y,
        nat,
        cam,
        0,
        0,
        width,
        height
      );
      const srcBR = mapPosterToScreen(
        activeBeat.crop.x + activeBeat.crop.w,
        activeBeat.crop.y + activeBeat.crop.h,
        nat,
        cam,
        0,
        0,
        width,
        height
      );
      ctx.save();
      ctx.globalAlpha = 0.55 * inOutAlpha;
      ctx.strokeStyle = activeBeat.accentColor;
      ctx.lineWidth = 2.5;
      ctx.setLineDash([10, 8]);
      ctx.strokeRect(srcTL.x, srcTL.y, srcBR.x - srcTL.x, srcBR.y - srcTL.y);
      ctx.setLineDash([]);
      ctx.restore();
    }

    // 3) Aspect-preserved magnified elastic pop-out frame + HUD layout without overlap
    const popScale = lerp(0.84, 1.0, easeOutBack(clamp(age / 12, 0, 1)));
    const hudW = width - 88;
    const hudX = 44;
    const estHudH =
      124 +
      (activeBeat.calloutDetail ? 42 : 0) +
      ((activeBeat.chips?.length ?? 0) > 0
        ? ((activeBeat.chips?.length ?? 0) > 3 ? 2 : 1) * 58 + 16
        : 0);

    let popW = width - 88;
    let popH = 440;
    let sx = 0;
    let sy = 0;
    let sw = 1;
    let sh = 1;
    if (nat) {
      sx = activeBeat.crop.x * nat.natW;
      sy = activeBeat.crop.y * nat.natH;
      sw = Math.max(1, activeBeat.crop.w * nat.natW);
      sh = Math.max(1, activeBeat.crop.h * nat.natH);
      const maxPopH = 660;
      const ratio = sw / sh;
      popH = Math.round(popW / ratio);
      if (popH > maxPopH) {
        popH = maxPopH;
        popW = Math.round(popH * ratio);
      }
    }
    const popX = Math.round((width - popW) / 2);

    const isHudTop = activeBeat.hudPosition === 'top';
    const safeTop = 58;
    const safeBottom = height - 134;
    let hudY = isHudTop ? safeTop : safeBottom - estHudH;
    let popY = isHudTop
      ? Math.round((hudY + estHudH + safeBottom - popH) / 2)
      : Math.round((safeTop + hudY - popH) / 2);

    if (isHudTop && popY < hudY + estHudH + 28) {
      popY = hudY + estHudH + 28;
    } else if (!isHudTop && popY + popH > hudY - 28) {
      popY = Math.max(safeTop, hudY - 28 - popH);
    }

    // Draw HUD card cleanly in reserved top or bottom lane
    drawSpotlightHudCallout(ctx, hudX, hudY, hudW, activeBeat, localF, isLight);

    // Draw magnified elastic popout
    ctx.save();
    ctx.globalAlpha = inOutAlpha;
    ctx.translate(popX + popW / 2, popY + popH / 2);
    ctx.scale(popScale, popScale);
    ctx.translate(-(popX + popW / 2), -(popY + popH / 2));

    ctx.shadowColor = 'rgba(0, 0, 0, 0.88)';
    ctx.shadowBlur = 42;
    ctx.shadowOffsetY = 16;
    ctx.fillStyle = '#05070B';
    roundRect(ctx, popX, popY, popW, popH, 20);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;

    ctx.save();
    roundRect(ctx, popX, popY, popW, popH, 20);
    ctx.clip();
    if (img && nat) {
      ctx.drawImage(img, sx, sy, sw, sh, popX, popY, popW, popH);
    } else {
      drawStyledPlaceholder(ctx, popX, popY, popW, popH, true);
    }

    // Subtle glass scan highlight on entrance
    if (age < 26) {
      const gX = lerp(popX - 180, popX + popW + 180, age / 26);
      const glassGrad = ctx.createLinearGradient(gX - 80, popY, gX + 80, popY + popH);
      glassGrad.addColorStop(0, 'rgba(255,255,255,0)');
      glassGrad.addColorStop(0.5, 'rgba(255,255,255,0.22)');
      glassGrad.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = glassGrad;
      ctx.fillRect(popX, popY, popW, popH);
    }
    ctx.restore();

    // Glowing border + crisp white targeting reticles
    ctx.strokeStyle = activeBeat.accentColor;
    ctx.lineWidth = 3.5;
    roundRect(ctx, popX, popY, popW, popH, 20);
    ctx.stroke();
    drawReticleBrackets(ctx, popX - 8, popY - 8, popW + 16, popH + 16, 30, '#FFFFFF', 4.5);

    // Outer-bezel stamp anchor (never covers inner poster text)
    if (activeBeat.stampText && age >= 6) {
      const sPop = easeOutBack(clamp((age - 6) / 10, 0, 1));
      ctx.save();
      ctx.translate(popX + popW - 92, popY - 8);
      ctx.rotate(-0.14);
      ctx.scale(lerp(1.45, 1.0, sPop), lerp(1.45, 1.0, sPop));
      ctx.fillStyle = '#B91C1C';
      roundRect(ctx, -96, -28, 192, 56, 10);
      ctx.fill();
      ctx.strokeStyle = '#FEF08A';
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `900 30px ${FONT}`;
      ctx.fillStyle = '#FFFFFF';
      ctx.fillText(activeBeat.stampText, 0, 2);
      ctx.restore();
    }

    ctx.restore();
  }

  // Clean bottom dark ticker bar
  drawDaylightPillCard(
    ctx,
    44,
    height - 114,
    width - 88,
    78,
    data.accentColor,
    data.bottomTicker,
    easeOutCubic(clamp(localF / 12, 0, 1)),
    undefined,
    isLight
  );

  drawTopProgressHairline(ctx, frame, totalFrames, width, data.accentColor, isLight);
}

/* ============================================================================
 * V4 SAFE-ZONE KINETIC SLICE HELPERS (4-side Douyin breathing margins)
 * Stage box: x=52..1028 (w=976), y=104..1650 (h=1546), bottom 270px pure black
 * ========================================================================== */
interface SafeStageRect {
  x: number;
  y: number;
  w: number;
  h: number;
  r: number;
  hudX: number;
  hudW: number;
  hudTop: number;
  hudBottom: number;
}

function getV4SafeStageRect(width: number, height: number): SafeStageRect {
  // 100% full-bleed 1080×1920 Douyin fullscreen poster stage (zero outer black borders!)
  // while keeping all floating badges, HUD pills, and tickers safely clear of Douyin UI zones.
  const hudPadX = 40;
  return {
    x: 0,
    y: 0,
    w: width,
    h: height,
    r: 0,
    hudX: hudPadX,
    hudW: width - hudPadX * 2,
    hudTop: 108,
    hudBottom: height - 256,
  };
}

function drawV4OuterFrameAndProgress(
  ctx: CanvasRenderingContext2D,
  frame: number,
  totalFrames: number,
  width: number,
  height: number,
  stage: SafeStageRect,
  accentColor: string,
  chapterBadge: string
): void {
  // Subtle bottom gradient vignette so Douyin's bottom overlay stays legible without black bars
  const botGrad = ctx.createLinearGradient(0, height - 320, 0, height);
  botGrad.addColorStop(0, 'rgba(0, 0, 0, 0)');
  botGrad.addColorStop(1, 'rgba(0, 0, 0, 0.58)');
  ctx.fillStyle = botGrad;
  ctx.fillRect(0, height - 320, width, 320);

  // Full-bleed razor top progress bar
  const progress = clamp(frame / Math.max(1, totalFrames - 1), 0, 1);
  ctx.save();
  ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
  ctx.fillRect(0, 0, width, 16);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.18)';
  ctx.fillRect(0, 8, width, 5);
  ctx.fillStyle = accentColor;
  ctx.fillRect(0, 8, Math.max(14, width * progress), 5);
  ctx.restore();

  // Compact top-left chapter tag perched cleanly inside Douyin safe top zone
  if (chapterBadge) {
    ctx.save();
    ctx.font = `800 22px ${MONO}, ${FONT}`;
    const tw = ctx.measureText(chapterBadge).width;
    const bw = tw + 30;
    const bh = 38;
    const bx = stage.hudX;
    const by = stage.hudTop;
    ctx.fillStyle = 'rgba(6, 10, 18, 0.9)';
    roundRect(ctx, bx, by, bw, bh, 10);
    ctx.fill();
    ctx.strokeStyle = `${accentColor}99`;
    ctx.lineWidth = 1.8;
    ctx.stroke();

    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = accentColor;
    ctx.fillText(chapterBadge, bx + 15, by + bh / 2 + 0.5);
    ctx.restore();
  }
}

/**
 * Draws an in-place 3D levitated artwork region directly over the current camera view
 * (no dark background dim-box!) so the actual poster graphic pops off the page organically.
 */
function drawPosterInPlaceLiftTile(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement | null | undefined,
  nat: { natW: number; natH: number } | null,
  cam: { sx: number; sy: number; sw: number; sh: number },
  stage: SafeStageRect,
  crop: { x: number; y: number; w: number; h: number },
  liftPx: number,
  scaleBoost: number,
  accentColor: string,
  alpha: number,
  radius = 14
): { x: number; y: number; w: number; h: number } | null {
  if (!img || !nat || alpha <= 0.01) return null;
  const tl = mapPosterToScreen(crop.x, crop.y, nat, cam, stage.x, stage.y, stage.w, stage.h);
  const br = mapPosterToScreen(
    crop.x + crop.w,
    crop.y + crop.h,
    nat,
    cam,
    stage.x,
    stage.y,
    stage.w,
    stage.h
  );
  const baseW = Math.max(8, br.x - tl.x);
  const baseH = Math.max(8, br.y - tl.y);
  const dstW = baseW * scaleBoost;
  const dstH = baseH * scaleBoost;
  const cx = (tl.x + br.x) / 2;
  const cy = (tl.y + br.y) / 2 - liftPx;
  const dstX = cx - dstW / 2;
  const dstY = cy - dstH / 2;

  ctx.save();
  ctx.globalAlpha = alpha;

  // Ambient pedestal shadow on poster surface
  ctx.fillStyle = 'rgba(0, 0, 0, 0.56)';
  roundRect(ctx, tl.x + 4, tl.y + 8, baseW - 8, baseH, radius);
  ctx.fill();

  // Elevated glowing artwork slice
  ctx.shadowColor = accentColor;
  ctx.shadowBlur = 24;
  ctx.fillStyle = '#050810';
  roundRect(ctx, dstX, dstY, dstW, dstH, radius);
  ctx.fill();
  ctx.shadowBlur = 0;

  ctx.save();
  roundRect(ctx, dstX, dstY, dstW, dstH, radius);
  ctx.clip();
  ctx.drawImage(
    img,
    crop.x * nat.natW,
    crop.y * nat.natH,
    Math.max(1, crop.w * nat.natW),
    Math.max(1, crop.h * nat.natH),
    dstX,
    dstY,
    dstW,
    dstH
  );
  ctx.restore();

  ctx.strokeStyle = accentColor;
  ctx.lineWidth = 3;
  roundRect(ctx, dstX, dstY, dstW, dstH, radius);
  ctx.stroke();

  ctx.restore();
  return { x: dstX, y: dstY, w: dstW, h: dstH };
}

/**
 * Draws a crisp optical circular magnifying glass lens over a specific poster landmark,
 * re-rendering the actual poster pixels at `magnify` zoom inside a glowing glass ring.
 */
function drawOpticalPosterLoupe(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement | null | undefined,
  nat: { natW: number; natH: number } | null,
  cam: { sx: number; sy: number; sw: number; sh: number },
  stage: SafeStageRect,
  nx: number,
  ny: number,
  radius: number,
  magnify: number,
  accentColor: string,
  alpha: number,
  age: number
): void {
  if (!img || !nat || alpha <= 0.01) return;
  const center = mapPosterToScreen(nx, ny, nat, cam, stage.x, stage.y, stage.w, stage.h);
  const cx = clamp(center.x, stage.x + radius + 18, stage.x + stage.w - radius - 18);
  const cy = clamp(center.y, stage.y + radius + 18, stage.y + stage.h - radius - 18);

  const srcHalfW = ((radius / stage.w) * cam.sw) / magnify;
  const srcHalfH = ((radius / stage.h) * cam.sh) / magnify;
  const srcX = clamp(nx * nat.natW - srcHalfW, 0, Math.max(0, nat.natW - srcHalfW * 2));
  const srcY = clamp(ny * nat.natH - srcHalfH, 0, Math.max(0, nat.natH - srcHalfH * 2));

  ctx.save();
  ctx.globalAlpha = alpha;

  // Drop shadow behind optical glass lens
  ctx.shadowColor = 'rgba(0, 0, 0, 0.85)';
  ctx.shadowBlur = 32;
  ctx.shadowOffsetY = 12;
  ctx.fillStyle = '#070B14';
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  // Magnified poster pixels clipped inside circular lens
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, radius - 3, 0, Math.PI * 2);
  ctx.clip();
  ctx.drawImage(
    img,
    srcX,
    srcY,
    Math.max(1, srcHalfW * 2),
    Math.max(1, srcHalfH * 2),
    cx - radius,
    cy - radius,
    radius * 2,
    radius * 2
  );

  // Subtle curved specular glass reflection
  const glassG = ctx.createLinearGradient(cx - radius, cy - radius, cx + radius * 0.6, cy + radius * 0.6);
  glassG.addColorStop(0, 'rgba(255, 255, 255, 0.28)');
  glassG.addColorStop(0.35, 'rgba(255, 255, 255, 0.05)');
  glassG.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = glassG;
  ctx.beginPath();
  ctx.arc(cx, cy, radius - 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Outer rotating precision telemetry ring
  ctx.strokeStyle = accentColor;
  ctx.lineWidth = 4.5;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.stroke();

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(age * 0.035);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.72)';
  ctx.lineWidth = 2.2;
  ctx.setLineDash([18, 22]);
  ctx.beginPath();
  ctx.arc(0, 0, radius + 11, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();

  ctx.restore();
}

/* ============================================================================
 * V4 STYLE A: `v4_slice_inflation` (核心PCE 3.3% · 虚拟摇臂推轨 + 光学放大镜 + 科技大楼闪电弹起)
 * Zero boring dim-boxes; skips low-value right wooden signs; focuses strictly on 3.3% -> Fed -> 4 Giants!
 * Timeline: 240 frames (8.0s)
 * ========================================================================== */
function renderV4SliceInflation(
  rc: SceneRenderContext,
  data: AnimatedPosterStageData,
  img: HTMLImageElement | null | undefined,
  nat: { natW: number; natH: number } | null
): void {
  const { ctx, frame, localFrame: localF, timeline } = rc;
  const { width, height, totalFrames } = timeline;
  const stage = getV4SafeStageRect(width, height);
  const alertCol = '#F87171';
  const warmGold = '#FBBF24';

  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, width, height);

  // Continuous cinematic crane camera path directly across high-signal artwork landmarks
  let cx = 0.5;
  let cy = 0.5;
  let spanW = 0.96;

  if (localF < 40) {
    // Act 1 (0..40f): Punch-in establishing onto 核心PCE 3.3% + left PCE sign
    const t = easeOutCubic(clamp(localF / 22, 0, 1));
    cx = lerp(0.5, 0.44, t);
    cy = lerp(0.28, 0.24, t);
    spanW = lerp(0.96, 0.84, t);
  } else if (localF < 108) {
    // Act 2 (40..108f): Smooth crane glide onto Federal Reserve + 加息概率接近100% + red upward arrow
    const t = easeInOutCubic(clamp((localF - 40) / 18, 0, 1));
    cx = lerp(0.44, 0.57, t);
    cy = lerp(0.24, 0.48, t);
    spanW = lerp(0.84, 0.72, t);
  } else if (localF < 190) {
    // Act 3 (108..190f): Dive cleanly onto 4 Tech Giant skyscrapers (skips right wooden filler!)
    const t = easeInOutCubic(clamp((localF - 108) / 18, 0, 1));
    cx = lerp(0.57, 0.37, t);
    cy = lerp(0.48, 0.74, t);
    spanW = lerp(0.72, 0.76, t);
  } else {
    // Finale (190..240f): Crane pullback to full crisp poster
    const t = easeOutCubic(clamp((localF - 190) / 20, 0, 1));
    cx = lerp(0.37, 0.5, t);
    cy = lerp(0.74, 0.5, t);
    spanW = lerp(0.76, 0.96, t);
  }

  // Subtle impact micro-jolt on lightning peak (f=126..134)
  const jolt = localF >= 126 && localF <= 134 ? (1 - (localF - 126) / 8) * 6 : 0;
  const jx = jolt ? Math.sin(localF * 3.5) * jolt : 0;
  const jy = jolt ? Math.cos(localF * 3.1) * jolt : 0;

  ctx.save();
  roundRect(ctx, stage.x, stage.y, stage.w, stage.h, stage.r);
  ctx.clip();

  ctx.save();
  ctx.translate(jx, jy);
  const cam = drawPosterCameraView(ctx, img, nat, stage.x, stage.y, stage.w, stage.h, cx, cy, spanW, false);
  ctx.restore();

  // ACT 1 (0..44f): Crimson sonar rings out of `3.3%` + Optical Glass Loupe over `10月核心PCE 3.3%`
  if (localF < 46 && nat) {
    const outAlpha = localF > 36 ? clamp((46 - localF) / 10, 0, 1) : 1;

    // Expanding sonar shockwave rings radiating directly out of `3.3%`
    const p33 = mapPosterToScreen(0.74, 0.09, nat, cam, stage.x, stage.y, stage.w, stage.h);
    for (let r = 0; r < 3; r++) {
      const rp = clamp((localF - r * 7) / 28, 0, 1);
      if (rp <= 0 || rp >= 1) continue;
      ctx.save();
      ctx.strokeStyle = `rgba(248, 113, 113, ${(1 - rp) * 0.88 * outAlpha})`;
      ctx.lineWidth = lerp(8, 2, rp);
      ctx.beginPath();
      ctx.arc(p33.x, p33.y, lerp(28, 320, easeOutCubic(rp)), 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // Optical Circular Magnifying Loupe gliding onto the left PCE sign (10月核心PCE 3.3% > 预期3.2%)
    if (localF >= 8) {
      const lAge = localF - 8;
      const lPop = easeOutBack(clamp(lAge / 10, 0, 1));
      const loupeR = 162 * lerp(0.55, 1.0, lPop);
      drawOpticalPosterLoupe(
        ctx,
        img,
        nat,
        cam,
        stage,
        0.195,
        0.315,
        loupeR,
        1.42,
        alertCol,
        clamp(lAge / 5, 0, 1) * outAlpha,
        lAge
      );
    }

    // Compact bottom-right live counter pill (never blocks poster headline!)
    const valT = easeOutCubic(clamp((localF - 6) / 22, 0, 1));
    const pceStr = `${lerp(2.8, 3.3, valT).toFixed(1)}%`;
    drawDaylightPillCard(
      ctx,
      stage.hudX,
      stage.hudBottom - 92,
      stage.hudW,
      88,
      alertCol,
      '10月核心PCE超预期 · 2023.11以来高位',
      clamp(localF / 7, 0, 1) * outAlpha,
      pceStr,
      false
    );
  }

  // ACT 2 (40..110f): Neon energy trace racing UP the poster's red Fed arrow + Compact Corner Arc Gauge (45%->99%)
  if (localF >= 40 && localF < 112 && nat) {
    const age = localF - 40;
    const alpha = clamp(age / 8, 0, 1) * clamp((112 - localF) / 10, 0, 1);

    // Neon energy stream pulsing up the poster's red arrow beside the Fed building
    const arrowStart = mapPosterToScreen(0.75, 0.58, nat, cam, stage.x, stage.y, stage.w, stage.h);
    const arrowEnd = mapPosterToScreen(0.76, 0.41, nat, cam, stage.x, stage.y, stage.w, stage.h);
    const traceP = easeOutCubic(clamp((age - 8) / 22, 0, 1));
    const curX = lerp(arrowStart.x, arrowEnd.x, traceP);
    const curY = lerp(arrowStart.y, arrowEnd.y, traceP);

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.shadowColor = '#EF4444';
    ctx.shadowBlur = 22;
    ctx.strokeStyle = '#FEF08A';
    ctx.lineWidth = 8;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(arrowStart.x, arrowStart.y);
    ctx.lineTo(curX, curY);
    ctx.stroke();

    ctx.strokeStyle = '#EF4444';
    ctx.lineWidth = 4;
    ctx.stroke();

    // Glowing tip flare
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(curX, curY, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Compact Circular Rate-Hike Tension Arc Gauge perched neatly in safe top-left dark zone
    const pctT = easeOutCubic(clamp((age - 6) / 28, 0, 1));
    const pctVal = Math.round(lerp(45, 99, pctT));
    const gx = stage.hudX + 126;
    const gy = stage.hudTop + 190;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.shadowColor = 'rgba(0, 0, 0, 0.85)';
    ctx.shadowBlur = 26;
    ctx.fillStyle = 'rgba(7, 11, 19, 0.92)';
    ctx.beginPath();
    ctx.arc(gx, gy, 116, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    ctx.lineWidth = 12;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.14)';
    ctx.beginPath();
    ctx.arc(gx, gy, 92, -Math.PI * 0.5, Math.PI * 1.5);
    ctx.stroke();

    ctx.strokeStyle = alertCol;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(gx, gy, 92, -Math.PI * 0.5, -Math.PI * 0.5 + (Math.PI * 2 * pctVal) / 100);
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `900 46px ${MONO}, ${FONT}`;
    ctx.fillStyle = alertCol;
    ctx.fillText(`${pctVal}%`, gx, gy - 8);
    ctx.font = `800 20px ${FONT}`;
    ctx.fillStyle = '#F8FAFC';
    ctx.fillText('加息概率飙升', gx, gy + 36);
    ctx.restore();

    drawDaylightPillCard(
      ctx,
      stage.hudX,
      stage.hudBottom - 92,
      stage.hudW,
      88,
      warmGold,
      '降息幻想消退 · 高利率压制高估值资产',
      alpha,
      '逼近100%',
      false
    );
  }

  // ACT 3 (108..192f): Electric Lightning Strike along poster crash arrow + In-Place 3D Skyscraper Lift!
  if (localF >= 108 && localF < 194 && nat) {
    const age = localF - 108;
    const alpha = clamp(age / 8, 0, 1) * clamp((194 - localF) / 10, 0, 1);

    // 4 Tech Giant skyscrapers lifted sequentially IN-PLACE off the poster artwork
    const towers = [
      { label: 'NVDA', pct: '-3.8%', triggerAge: 10, crop: { x: 0.005, y: 0.64, w: 0.23, h: 0.21 } },
      { label: 'MSFT', pct: '-2.9%', triggerAge: 18, crop: { x: 0.235, y: 0.675, w: 0.185, h: 0.175 } },
      { label: 'AAPL', pct: '-3.1%', triggerAge: 26, crop: { x: 0.42, y: 0.705, w: 0.16, h: 0.145 } },
      { label: 'META', pct: '-3.2%', triggerAge: 34, crop: { x: 0.58, y: 0.735, w: 0.155, h: 0.115 } },
    ];

    towers.forEach((tw) => {
      const tAge = age - tw.triggerAge;
      if (tAge < 0) return;
      const pop = easeOutBack(clamp(tAge / 10, 0, 1));
      const lift = lerp(0, 26, pop);
      const scale = lerp(1.0, 1.07, pop);
      const rect = drawPosterInPlaceLiftTile(
        ctx,
        img,
        nat,
        cam,
        stage,
        tw.crop,
        lift,
        scale,
        alertCol,
        alpha * clamp(tAge / 5, 0, 1),
        12
      );

      // Sleek glowing rooftop ticker pill perched right on top of each lifted skyscraper
      if (rect) {
        const pillW = Math.max(138, rect.w - 8);
        const pillH = 44;
        const px = rect.x + (rect.w - pillW) / 2;
        const py = rect.y - pillH - 10;
        ctx.save();
        ctx.globalAlpha = alpha * clamp(tAge / 6, 0, 1);
        ctx.fillStyle = 'rgba(220, 38, 38, 0.94)';
        roundRect(ctx, px, py, pillW, pillH, 10);
        ctx.fill();
        ctx.strokeStyle = '#FEF08A';
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = `900 22px ${MONO}, ${FONT}`;
        ctx.fillStyle = '#FFFFFF';
        ctx.fillText(`${tw.label} ${tw.pct}`, px + pillW / 2, py + pillH / 2 + 1, pillW - 14);
        ctx.restore();
      }
    });

    // Live crackling electric lightning bolt tracing the poster's actual zigzag crash arrow!
    const rawPts = [
      [0.24, 0.65],
      [0.41, 0.63],
      [0.48, 0.67],
      [0.58, 0.64],
      [0.72, 0.75],
    ].map(([nx, ny]) => mapPosterToScreen(nx, ny, nat, cam, stage.x, stage.y, stage.w, stage.h));

    const boltT = clamp((age - 4) / 34, 0, 1);
    if (boltT > 0) {
      const segs = rawPts.length - 1;
      const curF = boltT * segs;
      const fullS = Math.floor(curF);
      const frac = curF - fullS;

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.shadowColor = '#EF4444';
      ctx.shadowBlur = 24;
      ctx.strokeStyle = '#FEF08A';
      ctx.lineWidth = 9;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(rawPts[0].x, rawPts[0].y);
      for (let i = 1; i <= fullS; i++) ctx.lineTo(rawPts[i].x, rawPts[i].y);
      const tipX = fullS >= segs ? rawPts[segs].x : lerp(rawPts[fullS].x, rawPts[fullS + 1].x, frac);
      const tipY = fullS >= segs ? rawPts[segs].y : lerp(rawPts[fullS].y, rawPts[fullS + 1].y, frac);
      if (fullS < segs) ctx.lineTo(tipX, tipY);
      ctx.stroke();

      ctx.strokeStyle = '#EF4444';
      ctx.lineWidth = 4;
      ctx.stroke();

      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.arc(tipX, tipY, 11, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Bottom crisp marquee tape inside Douyin safe bottom zone
    const tapeY = stage.hudBottom - 76;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = 'rgba(6, 10, 18, 0.94)';
    ctx.fillRect(0, tapeY, width, 72);
    ctx.fillStyle = alertCol;
    ctx.fillRect(0, tapeY, width, 3.5);
    const tickerText = 'NVDA -3.8%   ▼   MSFT -2.9%   ▼   AAPL -3.1%   ▼   META -3.2%   ▼   通胀反弹压制科技估值   ▼   ';
    ctx.font = `900 28px ${MONO}, ${FONT}`;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    const textW = ctx.measureText(tickerText).width;
    const scrollX = -((age * 7.5) % textW);
    ctx.fillStyle = '#F8FAFC';
    ctx.fillText(tickerText, scrollX, tapeY + 38);
    ctx.fillText(tickerText, scrollX + textW, tapeY + 38);
    ctx.restore();
  }

  // FINALE (192..240f): Full poster specular sheen + clean bottom takeaway bar
  if (localF >= 192) {
    const finT = easeOutCubic(clamp((localF - 192) / 14, 0, 1));
    const sheenX = lerp(stage.x - 180, stage.x + stage.w + 180, clamp((localF - 192) / 30, 0, 1));
    const sGrad = ctx.createLinearGradient(sheenX - 110, stage.y, sheenX + 110, stage.y + stage.h * 0.45);
    sGrad.addColorStop(0, 'rgba(255,255,255,0)');
    sGrad.addColorStop(0.5, 'rgba(255,255,255,0.22)');
    sGrad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = sGrad;
    ctx.fillRect(stage.x, stage.y, stage.w, stage.h);

    drawDaylightPillCard(
      ctx,
      stage.hudX,
      stage.hudBottom - 88,
      stage.hudW,
      84,
      alertCol,
      data.bottomTicker,
      finT,
      undefined,
      false
    );
  }

  ctx.restore();
  drawV4OuterFrameAndProgress(ctx, frame, totalFrames, width, height, stage, alertCol, data.kicker);
}

/* ============================================================================
 * V4 STYLE B: `v4_slice_compute` (AI算力风险 · 赛博X光芯片透视 + -35%激光斩断 + 冰火斜向闪电撕裂VS)
 * Explicitly SKIPS low-value Cards 1 & 2 to concentrate 100% impact on Bombshell #1 (-35%) & #2 (CDS vs PCB)!
 * Timeline: 240 frames (8.0s)
 * ========================================================================== */
function renderV4SliceCompute(
  rc: SceneRenderContext,
  data: AnimatedPosterStageData,
  img: HTMLImageElement | null | undefined,
  nat: { natW: number; natH: number } | null
): void {
  const { ctx, frame, localFrame: localF, timeline } = rc;
  const { width, height, totalFrames } = timeline;
  const stage = getV4SafeStageRect(width, height);
  const cyanCol = '#38BDF8';
  const riskCol = '#F87171';
  const bullCol = '#34D399';
  const goldCol = '#FBBF24';

  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, width, height);

  ctx.save();
  roundRect(ctx, stage.x, stage.y, stage.w, stage.h, stage.r);
  ctx.clip();

  if (localF >= 116 && localF < 198) {
    // =========================================================================
    // ACT 3 (116..198f): INNOVATIVE DIAGONAL LIGHTNING RIFT DUEL!
    // Left Crimson Fire (Card 4 CoreWeave CDS 15.34%) ⚡ Right Ice Emerald (Card 5 高端PCB 2028年)
    // =========================================================================
    const age = localF - 116;
    const inT = easeOutCubic(clamp(age / 12, 0, 1));
    const outT = localF > 186 ? easeInOutCubic((localF - 186) / 12) : 0;
    const activeAlpha = inT * (1 - outT);

    // Diagonal split geometry: top vertex x = 57%, bottom vertex x = 43%
    const topSplitX = stage.x + stage.w * 0.56;
    const botSplitX = stage.x + stage.w * 0.44;
    const slideOff = lerp(160, 0, inT);

    // Left Diagonal Polygon -> Card 4 (CoreWeave 5Y CDS 15.34个百分点)
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(stage.x, stage.y);
    ctx.lineTo(topSplitX, stage.y);
    ctx.lineTo(botSplitX, stage.y + stage.h);
    ctx.lineTo(stage.x, stage.y + stage.h);
    ctx.closePath();
    ctx.clip();
    ctx.translate(-slideOff, 0);
    drawPosterCameraView(
      ctx,
      img,
      nat,
      stage.x,
      stage.y,
      stage.w * 0.62,
      stage.h,
      0.26,
      0.665,
      0.5,
      false
    );
    // Warm crimson heat edge glow
    const redTint = ctx.createLinearGradient(stage.x, stage.y, topSplitX, stage.y);
    redTint.addColorStop(0, 'rgba(220, 38, 38, 0.24)');
    redTint.addColorStop(0.75, 'rgba(220, 38, 38, 0.04)');
    redTint.addColorStop(1, 'rgba(239, 68, 68, 0.34)');
    ctx.fillStyle = redTint;
    ctx.fillRect(stage.x, stage.y, stage.w, stage.h);
    ctx.restore();

    // Right Diagonal Polygon -> Card 5 (高端PCB排单延至2028年)
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(topSplitX, stage.y);
    ctx.lineTo(stage.x + stage.w, stage.y);
    ctx.lineTo(stage.x + stage.w, stage.y + stage.h);
    ctx.lineTo(botSplitX, stage.y + stage.h);
    ctx.closePath();
    ctx.clip();
    ctx.translate(slideOff, 0);
    drawPosterCameraView(
      ctx,
      img,
      nat,
      stage.x + stage.w * 0.38,
      stage.y,
      stage.w * 0.62,
      stage.h,
      0.74,
      0.665,
      0.5,
      false
    );
    // Cool ice-emerald edge glow
    const iceTint = ctx.createLinearGradient(botSplitX, stage.y, stage.x + stage.w, stage.y);
    iceTint.addColorStop(0, 'rgba(52, 211, 153, 0.34)');
    iceTint.addColorStop(0.28, 'rgba(56, 189, 248, 0.04)');
    iceTint.addColorStop(1, 'rgba(56, 189, 248, 0.22)');
    ctx.fillStyle = iceTint;
    ctx.fillRect(stage.x, stage.y, stage.w, stage.h);
    ctx.restore();

    // Live crackling jagged golden plasma lightning rift down the diagonal seam!
    if (activeAlpha > 0.02) {
      ctx.save();
      ctx.globalAlpha = activeAlpha;
      const segCount = 16;
      const riftPts: Array<{ x: number; y: number }> = [];
      for (let s = 0; s <= segCount; s++) {
        const frac = s / segCount;
        const baseX = lerp(topSplitX, botSplitX, frac);
        const baseY = lerp(stage.y, stage.y + stage.h, frac);
        const jitter =
          s === 0 || s === segCount
            ? 0
            : Math.sin(localF * 1.9 + s * 2.7) * 14 + Math.cos(localF * 2.3 + s * 1.9) * 8;
        riftPts.push({ x: baseX + jitter, y: baseY });
      }

      ctx.shadowColor = '#FEF08A';
      ctx.shadowBlur = 24;
      ctx.strokeStyle = '#FDE047';
      ctx.lineWidth = 8;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(riftPts[0].x, riftPts[0].y);
      for (let i = 1; i < riftPts.length; i++) ctx.lineTo(riftPts[i].x, riftPts[i].y);
      ctx.stroke();

      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Top-left Crimson Risk Pill + Bottom-right Emerald Hardware Pill (inside Douyin safe zone)
      drawDaylightPillCard(
        ctx,
        stage.hudX,
        stage.hudTop + 56,
        520,
        88,
        riskCol,
        '信用警报 · CoreWeave CDS',
        1,
        '15.34%',
        false
      );

      drawDaylightPillCard(
        ctx,
        stage.hudX + stage.hudW - 520,
        stage.hudBottom - 186,
        520,
        88,
        bullCol,
        '硬件景气 · 高端PCB排单',
        1,
        '2028年',
        false
      );

      // Center snapping `冰火分化` VS Emblem
      const vsX = stage.x + stage.w * 0.5;
      const vsY = stage.y + stage.h * 0.48;
      const vsPop = easeOutBack(clamp((age - 4) / 10, 0, 1));
      ctx.save();
      ctx.translate(vsX, vsY);
      ctx.scale(lerp(0.25, 1, vsPop), lerp(0.25, 1, vsPop));
      ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
      ctx.shadowBlur = 28;
      ctx.fillStyle = '#050810';
      ctx.beginPath();
      ctx.arc(0, 0, 62, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = '#FEF08A';
      ctx.lineWidth = 5;
      ctx.stroke();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `900 40px ${MONO}, ${FONT}`;
      ctx.fillStyle = '#FEF08A';
      ctx.fillText('VS', 0, 2);
      ctx.restore();

      // Bottom Live Tug-of-War Balance Meter (`信用承压 ◀⚡▶ 硬件景气`) inside Douyin safe zone
      const barW = stage.hudW;
      const barX = stage.hudX;
      const barY = stage.hudBottom - 70;
      ctx.fillStyle = 'rgba(7, 11, 19, 0.94)';
      roundRect(ctx, barX, barY, barW, 66, 16);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
      ctx.lineWidth = 2;
      ctx.stroke();

      const trackX = barX + 188;
      const trackW = barW - 376;
      const trackY = barY + 26;
      const needleFrac = 0.5 + Math.sin(age * 0.2) * 0.24;
      const needleX = trackX + trackW * needleFrac;

      ctx.fillStyle = riskCol;
      roundRect(ctx, trackX, trackY, Math.max(8, needleX - trackX), 14, 7);
      ctx.fill();
      ctx.fillStyle = bullCol;
      roundRect(ctx, needleX, trackY, Math.max(8, trackX + trackW - needleX), 14, 7);
      ctx.fill();

      ctx.fillStyle = '#FEF08A';
      ctx.beginPath();
      ctx.arc(needleX, trackY + 7, 12, 0, Math.PI * 2);
      ctx.fill();

      ctx.textBaseline = 'middle';
      ctx.font = `900 24px ${FONT}`;
      ctx.textAlign = 'left';
      ctx.fillStyle = riskCol;
      ctx.fillText('信用承压', barX + 24, barY + 34);
      ctx.textAlign = 'right';
      ctx.fillStyle = bullCol;
      ctx.fillText('硬件景气', barX + barW - 24, barY + 34);

      ctx.restore();
    }
  } else {
    // Camera path for Act 1 (X-Ray Scan), Act 2 (Bombshell #1 -35% Laser Cut), Finale
    let cx = 0.5;
    let cy = 0.5;
    let spanW = 0.96;

    if (localF < 38) {
      // Act 1 (0..38f): Full establishing poster with cyber X-ray scan across NVIDIA GPU chip
      cx = 0.5;
      cy = lerp(0.42, 0.48, easeOutCubic(localF / 34));
      spanW = 0.96;
    } else if (localF < 116) {
      // Act 2 (38..116f): Punch STRAIGHT onto Bombshell #1 (Card 3 SpaceX Blackwell -35%), skipping Cards 1 & 2!
      const t = easeInOutCubic(clamp((localF - 38) / 16, 0, 1));
      cx = 0.5;
      cy = lerp(0.48, 0.5, t);
      spanW = lerp(0.96, 0.88, t);
    } else {
      // Finale (198..240f): Snap back to full poster
      const t = easeOutCubic(clamp((localF - 198) / 16, 0, 1));
      cx = 0.5;
      cy = lerp(0.62, 0.5, t);
      spanW = lerp(0.88, 0.96, t);
    }

    const cam = drawPosterCameraView(ctx, img, nat, stage.x, stage.y, stage.w, stage.h, cx, cy, spanW, false);

    // ACT 1 (0..38f): Holographic Cyber X-Ray Scanline + Pulsing Circuit Halo on NVIDIA GPU Chip
    if (localF < 38) {
      const scanP = clamp(localF / 30, 0, 1);
      const scanY = lerp(stage.y, stage.y + stage.h, easeInOutCubic(scanP));

      // Glowing cyber scanline beam
      const beamG = ctx.createLinearGradient(0, scanY - 70, 0, scanY + 70);
      beamG.addColorStop(0, 'rgba(56, 189, 248, 0)');
      beamG.addColorStop(0.45, 'rgba(56, 189, 248, 0.25)');
      beamG.addColorStop(0.5, 'rgba(186, 230, 253, 0.95)');
      beamG.addColorStop(0.55, 'rgba(56, 189, 248, 0.25)');
      beamG.addColorStop(1, 'rgba(56, 189, 248, 0)');
      ctx.fillStyle = beamG;
      ctx.fillRect(stage.x, scanY - 70, stage.w, 140);

      // Pulsing cyan circuit target rings directly on poster's NVIDIA GPU chip (0.83, 0.16)
      if (nat) {
        const chip = mapPosterToScreen(0.83, 0.16, nat, cam, stage.x, stage.y, stage.w, stage.h);
        for (let r = 0; r < 2; r++) {
          const rp = clamp((localF - 4 - r * 8) / 22, 0, 1);
          if (rp <= 0 || rp >= 1) continue;
          ctx.save();
          ctx.strokeStyle = `rgba(56, 189, 248, ${(1 - rp) * 0.9})`;
          ctx.lineWidth = lerp(5, 1.5, rp);
          ctx.beginPath();
          ctx.arc(chip.x, chip.y, lerp(24, 190, easeOutCubic(rp)), 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
        }
      }
    }

    // ACT 2 (38..116f): SpaceX Blackwell GPU -35% Laser Blade Slash + Rocket Exhaust Sparks + Live Price Collapse
    if (localF >= 38 && localF < 116 && nat) {
      const age = localF - 38;
      const alpha = clamp(age / 7, 0, 1) * clamp((116 - localF) / 8, 0, 1);

      // Subtle top/bottom vignette outside Card 3 so eyes lock immediately onto Card 3 WITHOUT hiding artwork
      const cardTop = mapPosterToScreen(0, 0.415, nat, cam, stage.x, stage.y, stage.w, stage.h).y;
      const cardBot = mapPosterToScreen(0, 0.575, nat, cam, stage.x, stage.y, stage.w, stage.h).y;
      ctx.save();
      ctx.fillStyle = `rgba(3, 6, 12, ${0.62 * alpha})`;
      ctx.fillRect(stage.x, stage.y, stage.w, Math.max(0, cardTop - stage.y));
      ctx.fillRect(stage.x, cardBot, stage.w, Math.max(0, stage.y + stage.h - cardBot));
      ctx.restore();

      // In-place subtle 3D lift of Card 3 itself
      const lifted = drawPosterInPlaceLiftTile(
        ctx,
        img,
        nat,
        cam,
        stage,
        { x: 0.02, y: 0.42, w: 0.96, h: 0.155 },
        lerp(0, 12, easeOutCubic(clamp(age / 12, 0, 1))),
        1.03,
        goldCol,
        alpha,
        16
      );

      // Volumetric orange rocket exhaust sparks shooting down from poster's SpaceX rocket (0.12, 0.52)
      const rocketPos = mapPosterToScreen(0.12, 0.52, nat, cam, stage.x, stage.y, stage.w, stage.h);
      ctx.save();
      ctx.globalAlpha = alpha;
      for (let p = 0; p < 16; p++) {
        const life = (age * 0.065 + p * 0.063) % 1;
        const px = rocketPos.x + Math.sin(p * 3.1 + age * 0.3) * lerp(4, 28, life);
        const py = rocketPos.y + life * 115;
        ctx.fillStyle =
          p % 2 === 0
            ? `rgba(251, 146, 60, ${(1 - life) * 0.95})`
            : `rgba(254, 240, 138, ${(1 - life) * 0.9})`;
        ctx.beginPath();
        ctx.arc(px, py, lerp(5.5, 1.5, life), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();

      // Blazing Diagonal Neon Laser Blade Slashing across the price zone (age 8..22)
      if (age >= 8 && age <= 34 && lifted) {
        const slashP = easeOutCubic(clamp((age - 8) / 10, 0, 1));
        const slashFade = age > 20 ? clamp((34 - age) / 14, 0, 1) : 1;
        const sX0 = lifted.x + lifted.w * 0.24;
        const sY0 = lifted.y + lifted.h * 0.85;
        const sX1 = lerp(sX0, lifted.x + lifted.w * 0.62, slashP);
        const sY1 = lerp(sY0, lifted.y + lifted.h * 0.14, slashP);

        ctx.save();
        ctx.globalAlpha = alpha * slashFade;
        ctx.shadowColor = '#38BDF8';
        ctx.shadowBlur = 24;
        ctx.strokeStyle = '#38BDF8';
        ctx.lineWidth = 10;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(sX0, sY0);
        ctx.lineTo(sX1, sY1);
        ctx.stroke();

        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 4;
        ctx.stroke();
        ctx.restore();
      }

      // Slim Live Hydraulic Price Collapse Bar perched cleanly below Card 3
      const dropT = easeOutCubic(clamp((age - 10) / 24, 0, 1));
      const curPrice = lerp(15.5, 10.0, dropT);
      const pctDrop = Math.round(lerp(0, -35, dropT));
      const hudX = stage.hudX;
      const hudY = Math.min(stage.hudBottom - 204, (lifted ? lifted.y + lifted.h : cardBot) + 46);
      const hudW = stage.hudW;
      const hudH = 196;

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = 'rgba(7, 11, 20, 0.95)';
      roundRect(ctx, hudX, hudY, hudW, hudH, 22);
      ctx.fill();
      ctx.strokeStyle = cyanCol;
      ctx.lineWidth = 2.8;
      ctx.stroke();

      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.font = `900 30px ${FONT}`;
      ctx.fillStyle = '#F8FAFC';
      ctx.fillText('SpaceX 下调 Blackwell GPU 租金', hudX + 28, hudY + 24);

      ctx.textAlign = 'right';
      ctx.font = `900 50px ${MONO}, ${FONT}`;
      ctx.fillStyle = riskCol;
      ctx.fillText(`${pctDrop}%`, hudX + hudW - 28, hudY + 14);

      const barX = hudX + 28;
      const barY = hudY + 90;
      const barMaxW = hudW - 56;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.14)';
      roundRect(ctx, barX, barY, barMaxW, 34, 10);
      ctx.fill();

      const activeW = barMaxW * (curPrice / 15.5);
      const bGrad = ctx.createLinearGradient(barX, 0, barX + activeW, 0);
      bGrad.addColorStop(0, '#0284C7');
      bGrad.addColorStop(1, '#38BDF8');
      ctx.fillStyle = bGrad;
      roundRect(ctx, barX, barY, activeW, 34, 10);
      ctx.fill();

      ctx.textAlign = 'left';
      ctx.font = `800 26px ${MONO}, ${FONT}`;
      ctx.fillStyle = '#CBD5E1';
      ctx.fillText(`$15.5/h  →  $${curPrice.toFixed(1)}/h · 5万块H200不续租`, barX, barY + 48, barMaxW);
      ctx.restore();
    }

    // FINALE (198..240f): Full poster cyan sheen + bottom takeaway bar
    if (localF >= 198) {
      const finT = easeOutCubic(clamp((localF - 198) / 14, 0, 1));
      const sheenX = lerp(stage.x - 180, stage.x + stage.w + 180, clamp((localF - 198) / 28, 0, 1));
      const sGrad = ctx.createLinearGradient(sheenX - 110, stage.y, sheenX + 110, stage.y + stage.h * 0.45);
      sGrad.addColorStop(0, 'rgba(255,255,255,0)');
      sGrad.addColorStop(0.5, 'rgba(56, 189, 248, 0.22)');
      sGrad.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = sGrad;
      ctx.fillRect(stage.x, stage.y, stage.w, stage.h);

      drawDaylightPillCard(
        ctx,
        stage.hudX,
        stage.hudBottom - 88,
        stage.hudW,
        84,
        cyanCol,
        data.bottomTicker,
        finT,
        undefined,
        false
      );
    }
  }

  ctx.restore();
  drawV4OuterFrameAndProgress(ctx, frame, totalFrames, width, height, stage, cyanCol, data.kicker);
}

/* ============================================================================
 * V4 STYLE C: `v4_slice_aerospace` (商业航天 · 火箭点火震颤 + 3D地球卫星环绕 + 5大产业链原位激光接力)
 * Skips small-print right paragraph; uses EXACT poster 5-chain labels:
 * 火箭发射 -> 卫星制造 -> 卫星通信 -> 地面设备 -> 太空算力!
 * Timeline: 240 frames (8.0s)
 * ========================================================================== */
function renderV4SliceAerospace(
  rc: SceneRenderContext,
  data: AnimatedPosterStageData,
  img: HTMLImageElement | null | undefined,
  nat: { natW: number; natH: number } | null
): void {
  const { ctx, frame, localFrame: localF, timeline } = rc;
  const { width, height, totalFrames } = timeline;
  const stage = getV4SafeStageRect(width, height);
  const goldCol = '#FBBF24';
  const cyanCol = '#38BDF8';

  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, width, height);

  // Continuous cinematic orbital camera choreography across actual poster landmarks
  let cx = 0.5;
  let cy = 0.5;
  let spanW = 0.96;

  if (localF < 46) {
    // Act 1 (0..46f): Start tight on firing rocket booster -> sweep up & right across Shenzhou + Space Station!
    const t = easeInOutCubic(clamp(localF / 36, 0, 1));
    cx = lerp(0.24, 0.52, t);
    cy = lerp(0.27, 0.34, t);
    spanW = lerp(0.62, 0.88, t);
  } else if (localF < 120) {
    // Act 2 (46..120f): Glide smoothly onto Card 2 (SpaceX 100万颗卫星 · 太空AI数据中心)
    const t = easeInOutCubic(clamp((localF - 46) / 18, 0, 1));
    cx = lerp(0.52, 0.5, t);
    cy = lerp(0.34, 0.62, t);
    spanW = lerp(0.88, 0.92, t);
  } else if (localF < 194) {
    // Act 3 (120..194f): Dive onto the bottom 5-node `产业映射` belt for live laser relay!
    const t = easeInOutCubic(clamp((localF - 120) / 16, 0, 1));
    cx = 0.5;
    cy = lerp(0.62, 0.78, t);
    spanW = lerp(0.92, 0.96, t);
  } else {
    // Finale (194..240f): Starlight pullback to full poster
    const t = easeOutCubic(clamp((localF - 194) / 20, 0, 1));
    cx = 0.5;
    cy = lerp(0.78, 0.5, t);
    spanW = 0.96;
  }

  // Subtle rocket ignition rumble vibration during Act 1 ignition (f=0..24)
  const vib = localF < 24 ? (1 - localF / 24) * 5.5 : 0;
  const vx = vib ? Math.sin(localF * 4.3) * vib : 0;
  const vy = vib ? Math.cos(localF * 3.7) * vib : 0;

  ctx.save();
  roundRect(ctx, stage.x, stage.y, stage.w, stage.h, stage.r);
  ctx.clip();

  ctx.save();
  ctx.translate(vx, vy);
  const cam = drawPosterCameraView(ctx, img, nat, stage.x, stage.y, stage.w, stage.h, cx, cy, spanW, false);
  ctx.restore();

  // Ambient cosmic starfield drift inside safe bezel
  for (let i = 0; i < 16; i++) {
    const phase = (localF * 0.018 + i * 0.067) % 1;
    const px = stage.x + 36 + ((i * 211) % (stage.w - 72));
    const py = lerp(stage.y + stage.h - 30, stage.y + 30, phase);
    const pAlpha = Math.sin(phase * Math.PI) * 0.55;
    ctx.fillStyle = i % 3 === 0 ? `rgba(251, 191, 36, ${pAlpha})` : `rgba(248, 250, 252, ${pAlpha * 0.7})`;
    ctx.beginPath();
    ctx.arc(px, py, i % 3 === 0 ? 3 : 1.8, 0, Math.PI * 2);
    ctx.fill();
  }

  // ACT 1 (0..48f): Fiery rocket launch particles at booster + luminous trajectory arc to Shenzhou station
  if (localF < 50 && nat) {
    const outAlpha = localF > 40 ? clamp((50 - localF) / 10, 0, 1) : 1;
    const plumePos = mapPosterToScreen(0.15, 0.31, nat, cam, stage.x, stage.y, stage.w, stage.h);

    // Live roaring orange-gold exhaust flames bursting from the poster's rocket!
    ctx.save();
    ctx.globalAlpha = outAlpha;
    for (let p = 0; p < 22; p++) {
      const life = (localF * 0.08 + p * 0.047) % 1;
      const spread = lerp(6, 44, life);
      const px = plumePos.x + Math.sin(p * 2.9 + localF * 0.4) * spread;
      const py = plumePos.y + life * 160;
      const rad = lerp(9, 2, life);
      ctx.fillStyle =
        p % 3 === 0
          ? `rgba(254, 240, 138, ${(1 - life) * 0.95})`
          : `rgba(249, 115, 22, ${(1 - life) * 0.85})`;
      ctx.beginPath();
      ctx.arc(px, py, rad, 0, Math.PI * 2);
      ctx.fill();
    }

    // Glowing orbital arc connecting Rocket -> Shenzhou Spacecraft -> Space Station
    const pRocket = mapPosterToScreen(0.16, 0.21, nat, cam, stage.x, stage.y, stage.w, stage.h);
    const pCtrl = mapPosterToScreen(0.45, 0.14, nat, cam, stage.x, stage.y, stage.w, stage.h);
    const pStation = mapPosterToScreen(0.76, 0.25, nat, cam, stage.x, stage.y, stage.w, stage.h);
    const arcT = easeOutCubic(clamp((localF - 6) / 26, 0, 1));
    ctx.strokeStyle = 'rgba(251, 191, 36, 0.85)';
    ctx.lineWidth = 4;
    ctx.setLineDash([12, 8]);
    ctx.beginPath();
    ctx.moveTo(pRocket.x, pRocket.y);
    ctx.quadraticCurveTo(pCtrl.x, pCtrl.y, pStation.x, pStation.y);
    ctx.stroke();
    ctx.setLineDash([]);

    // Moving spacecraft light bead along curve
    const bx = (1 - arcT) * (1 - arcT) * pRocket.x + 2 * (1 - arcT) * arcT * pCtrl.x + arcT * arcT * pStation.x;
    const by = (1 - arcT) * (1 - arcT) * pRocket.y + 2 * (1 - arcT) * arcT * pCtrl.y + arcT * arcT * pStation.y;
    ctx.fillStyle = '#FFFFFF';
    ctx.shadowColor = goldCol;
    ctx.shadowBlur = 18;
    ctx.beginPath();
    ctx.arc(bx, by, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.restore();

    drawDaylightPillCard(
      ctx,
      stage.hudX,
      stage.hudBottom - 92,
      stage.hudW,
      88,
      '#FB923C',
      '神舟二十四号发射成功 · 中外首次联合飞行',
      clamp(localF / 7, 0, 1) * outAlpha,
      '入轨成功',
      false
    );
  }

  // ACT 2 (46..122f): 3D-Tilted Live Satellite Orbits around Poster's Earth + 1万->100万颗 Counter!
  if (localF >= 46 && localF < 124 && nat) {
    const age = localF - 46;
    const alpha = clamp(age / 8, 0, 1) * clamp((124 - localF) / 10, 0, 1);

    // Subtle highlight rim around Card 2 without dimming out the poster
    const c2TL = mapPosterToScreen(0.025, 0.54, nat, cam, stage.x, stage.y, stage.w, stage.h);
    const c2BR = mapPosterToScreen(0.975, 0.72, nat, cam, stage.x, stage.y, stage.w, stage.h);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = cyanCol;
    ctx.lineWidth = 3;
    roundRect(ctx, c2TL.x, c2TL.y, c2BR.x - c2TL.x, c2BR.y - c2TL.y, 16);
    ctx.stroke();

    // Two counter-rotating 3D-tilted glowing orbital rings right over the poster's Earth & satellite graphic (0.76, 0.63)
    const earthC = mapPosterToScreen(0.76, 0.63, nat, cam, stage.x, stage.y, stage.w, stage.h);
    const orbits = [
      { rx: 175, ry: 52, rot: -0.26, speed: 0.085, color: cyanCol, count: 5 },
      { rx: 145, ry: 44, rot: 0.34, speed: -0.068, color: goldCol, count: 5 },
    ];

    orbits.forEach((orb) => {
      ctx.save();
      ctx.translate(earthC.x, earthC.y);
      ctx.rotate(orb.rot);

      ctx.strokeStyle = `${orb.color}88`;
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.ellipse(0, 0, orb.rx, orb.ry, 0, 0, Math.PI * 2);
      ctx.stroke();

      for (let s = 0; s < orb.count; s++) {
        const ang = age * orb.speed + (s / orb.count) * Math.PI * 2;
        const sx = Math.cos(ang) * orb.rx;
        const sy = Math.sin(ang) * orb.ry;
        const depthScale = 0.7 + 0.45 * ((Math.sin(ang) + 1) / 2);
        ctx.fillStyle = '#FFFFFF';
        ctx.shadowColor = orb.color;
        ctx.shadowBlur = 12;
        ctx.beginPath();
        ctx.arc(sx, sy, 5.5 * depthScale, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      }
      ctx.restore();
    });
    ctx.restore();

    // Clean live holographic counter surging 1万 -> 100万颗 tucked cleanly below Card 2
    const satVal = Math.round(lerp(1, 100, easeOutCubic(clamp((age - 6) / 28, 0, 1))));
    drawDaylightPillCard(
      ctx,
      stage.hudX,
      stage.hudBottom - 92,
      stage.hudW,
      88,
      cyanCol,
      'FCC 批准 SpaceX 太空AI数据中心计划',
      alpha,
      `${satVal}万颗`,
      false
    );
  }

  // ACT 3 (120..196f): High-Speed Cyan-Gold Laser Relay across EXACT 5 Poster Industry Icons!
  if (localF >= 120 && localF < 198 && nat) {
    const age = localF - 120;
    const alpha = clamp(age / 8, 0, 1) * clamp((198 - localF) / 10, 0, 1);

    // Exact 5 industry chain nodes matching commercial_aerospace.png pixel-for-pixel
    const chainNodes = [
      { idx: '01', name: '火箭发射', col: '#F87171', crop: { x: 0.025, y: 0.745, w: 0.185, h: 0.095 } },
      { idx: '02', name: '卫星制造', col: '#FBBF24', crop: { x: 0.215, y: 0.745, w: 0.185, h: 0.095 } },
      { idx: '03', name: '卫星通信', col: '#38BDF8', crop: { x: 0.405, y: 0.745, w: 0.185, h: 0.095 } },
      { idx: '04', name: '地面设备', col: '#34D399', crop: { x: 0.595, y: 0.745, w: 0.185, h: 0.095 } },
      { idx: '05', name: '太空算力', col: '#C084FC', crop: { x: 0.785, y: 0.745, w: 0.185, h: 0.095 } },
    ];

    // High-speed glowing laser relay beam firing horizontally across the 5 nodes (age 4..46)
    const beamStart = mapPosterToScreen(0.115, 0.79, nat, cam, stage.x, stage.y, stage.w, stage.h);
    const beamEnd = mapPosterToScreen(0.88, 0.79, nat, cam, stage.x, stage.y, stage.w, stage.h);
    const beamT = clamp((age - 4) / 42, 0, 1);
    const curBeamX = lerp(beamStart.x, beamEnd.x, beamT);

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.shadowColor = goldCol;
    ctx.shadowBlur = 22;
    const beamG = ctx.createLinearGradient(beamStart.x, 0, beamEnd.x, 0);
    beamG.addColorStop(0, '#F87171');
    beamG.addColorStop(0.5, '#38BDF8');
    beamG.addColorStop(1, '#C084FC');
    ctx.strokeStyle = beamG;
    ctx.lineWidth = 7;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(beamStart.x, beamStart.y);
    ctx.lineTo(curBeamX, beamStart.y);
    ctx.stroke();

    if (beamT > 0 && beamT < 0.99) {
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.arc(curBeamX, beamStart.y, 11, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // Pop each exact poster icon UPWARD IN-PLACE as the laser relay beam reaches it!
    chainNodes.forEach((node, idx) => {
      const triggerAge = 4 + idx * 9;
      const nAge = age - triggerAge;
      if (nAge < 0) return;

      const pop = easeOutBack(clamp(nAge / 10, 0, 1));
      const hover = Math.sin(nAge * 0.22 + idx) * 4;
      const lift = lerp(0, 32, pop) + hover;
      const rect = drawPosterInPlaceLiftTile(
        ctx,
        img,
        nat,
        cam,
        stage,
        node.crop,
        lift,
        lerp(1.0, 1.14, pop),
        node.col,
        alpha * clamp(nAge / 4, 0, 1),
        14
      );

      // Crisp matching label pill perched directly above the levitated poster icon
      if (rect) {
        const tagW = Math.max(150, rect.w);
        const tagH = 40;
        const tx = clamp(rect.x + (rect.w - tagW) / 2, stage.x + 12, stage.x + stage.w - tagW - 12);
        const ty = rect.y - tagH - 12;
        ctx.save();
        ctx.globalAlpha = alpha * clamp(nAge / 5, 0, 1);
        ctx.fillStyle = 'rgba(7, 11, 20, 0.94)';
        roundRect(ctx, tx, ty, tagW, tagH, 10);
        ctx.fill();
        ctx.strokeStyle = node.col;
        ctx.lineWidth = 2.2;
        ctx.stroke();

        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = `900 22px ${FONT}`;
        ctx.fillStyle = node.col;
        ctx.fillText(`${node.idx} ${node.name}`, tx + tagW / 2, ty + tagH / 2 + 1, tagW - 12);
        ctx.restore();
      }
    });

    drawDaylightPillCard(
      ctx,
      stage.hudX,
      stage.hudTop + 56,
      stage.hudW,
      84,
      goldCol,
      '商业航天 5 大核心产业链 · 全线激光点亮',
      alpha,
      '5/5',
      false
    );
  }

  // FINALE (196..240f): Full poster golden starlight sheen + bottom takeaway bar
  if (localF >= 196) {
    const finT = easeOutCubic(clamp((localF - 196) / 14, 0, 1));
    const sheenX = lerp(stage.x - 180, stage.x + stage.w + 180, clamp((localF - 196) / 28, 0, 1));
    const sGrad = ctx.createLinearGradient(sheenX - 120, stage.y, sheenX + 120, stage.y + stage.h * 0.45);
    sGrad.addColorStop(0, 'rgba(255,255,255,0)');
    sGrad.addColorStop(0.5, 'rgba(251, 191, 36, 0.24)');
    sGrad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = sGrad;
    ctx.fillRect(stage.x, stage.y, stage.w, stage.h);

    drawDaylightPillCard(
      ctx,
      stage.hudX,
      stage.hudBottom - 88,
      stage.hudW,
      84,
      goldCol,
      data.bottomTicker,
      finT,
      undefined,
      false
    );
  }

  ctx.restore();
  drawV4OuterFrameAndProgress(ctx, frame, totalFrames, width, height, stage, goldCol, data.kicker);
}

/**
 * Scene: animated_poster_stage
 * Poster animator supporting both original fullscreen styles and v4 4-side-safe kinetic slice styles:
 * - `camera_crash_tour` / `split_prism_compare` / `spotlight_popout` / `parallax_orbital_flight`
 * - `v4_slice_inflation` / `v4_slice_compute` / `v4_slice_aerospace`
 */
export function renderAnimatedPosterStageScene(
  rc: SceneRenderContext,
  data: AnimatedPosterStageData
): void {
  const img = data.imageSrc ? rc.assets.imagesBySrc[data.imageSrc] : null;
  const nat = getPosterNaturalSize(img);
  const style = data.presentationStyle ?? 'camera_crash_tour';

  if (style === 'v4_slice_inflation') {
    renderV4SliceInflation(rc, data, img, nat);
  } else if (style === 'v4_slice_compute') {
    renderV4SliceCompute(rc, data, img, nat);
  } else if (style === 'v4_slice_aerospace') {
    renderV4SliceAerospace(rc, data, img, nat);
  } else if (style === 'split_prism_compare') {
    renderSplitPrismCompare(rc, data, img, nat);
  } else if (style === 'parallax_orbital_flight') {
    renderParallaxOrbitalFlight(rc, data, img, nat);
  } else if (style === 'spotlight_popout') {
    renderSpotlightPopout(rc, data, img, nat);
  } else {
    renderCameraCrashTour(rc, data, img, nat);
  }
}
