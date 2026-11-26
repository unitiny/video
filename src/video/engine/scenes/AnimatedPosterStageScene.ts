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

/**
 * Scene: animated_poster_stage
 * Fullscreen 1080×1920 poster animator with distinct motion styles:
 * - `camera_crash_tour`: Cinematic camera glide + radar shockwaves + laser crash polyline + scrolling ticker
 * - `split_prism_compare`: 3-column shutter reveal + GPU price waterfall + Top vs Bottom split-screen VS duel
 * - `spotlight_popout`: Fullscreen Focus-and-Dim Pop-Out with elastic zoomed cutouts, outer-bezel stamp & sequential chips
 * - `parallax_orbital_flight`: Fullscreen orbital pan + 5-tile ignition
 */
export function renderAnimatedPosterStageScene(
  rc: SceneRenderContext,
  data: AnimatedPosterStageData
): void {
  const img = data.imageSrc ? rc.assets.imagesBySrc[data.imageSrc] : null;
  const nat = getPosterNaturalSize(img);
  const style = data.presentationStyle ?? 'camera_crash_tour';

  if (style === 'split_prism_compare') {
    renderSplitPrismCompare(rc, data, img, nat);
  } else if (style === 'parallax_orbital_flight') {
    renderParallaxOrbitalFlight(rc, data, img, nat);
  } else if (style === 'spotlight_popout') {
    renderSpotlightPopout(rc, data, img, nat);
  } else {
    renderCameraCrashTour(rc, data, img, nat);
  }
}
