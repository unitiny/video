import { clamp, easeOutCubic, lerp } from '../../timeline';
import type {
  CleanIndexChartItem,
  DailyCandle,
  EpisodeManifest,
  LoadedEpisodeAssets,
} from '../schema';
import {
  getCardEnterProgress,
  sliceTypewriterText,
  type CompiledEpisodeTimeline,
  type CompiledShot,
} from '../timeline';

export const FONT =
  '"Noto Sans SC", "Plus Jakarta Sans", "PingFang SC", "Microsoft YaHei", sans-serif';
export const MONO = '"JetBrains Mono", monospace';

export interface SceneRenderContext {
  ctx: CanvasRenderingContext2D;
  frame: number;
  localFrame: number;
  shot: CompiledShot;
  timeline: CompiledEpisodeTimeline;
  episode: EpisodeManifest;
  assets: LoadedEpisodeAssets;
}

export function easeOutBack(t: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  const x = clamp(t, 0, 1);
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
}

export function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  const rad = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.arcTo(x + w, y, x + w, y + h, rad);
  ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad);
  ctx.arcTo(x, y, x + w, y, rad);
  ctx.closePath();
}

export function wrapLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] {
  const tokens = text.match(/[A-Za-z0-9.+%\-–$]+|./g) ?? [];
  const lines: string[] = [];
  let cur = '';
  for (const tok of tokens) {
    const test = cur + tok;
    if (ctx.measureText(test).width > maxWidth && cur.length > 0) {
      lines.push(cur);
      cur = tok === ' ' ? '' : tok;
    } else {
      cur = test;
    }
  }
  if (cur.length > 0) lines.push(cur);
  return lines;
}

export function drawWrappedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number
): number {
  const paragraphs = text.split('\n');
  let curY = y;
  for (const para of paragraphs) {
    const lines = wrapLines(ctx, para, maxWidth);
    for (let i = 0; i < lines.length; i++) {
      ctx.fillText(lines[i], x, curY);
      curY += lineHeight;
    }
  }
  return curY;
}

/**
 * Graceful textured editorial placeholder frame when an image/video asset is absent or still loading.
 */
export function drawStyledPlaceholder(
  ctx: CanvasRenderingContext2D,
  dx: number,
  dy: number,
  dw: number,
  dh: number,
  dark = true
): void {
  ctx.save();
  ctx.beginPath();
  ctx.rect(dx, dy, dw, dh);
  ctx.clip();

  const grad = ctx.createLinearGradient(dx, dy, dx + dw, dy + dh);
  if (dark) {
    grad.addColorStop(0, '#131A26');
    grad.addColorStop(0.5, '#0F1520');
    grad.addColorStop(1, '#1A2233');
  } else {
    grad.addColorStop(0, '#E7E0D3');
    grad.addColorStop(0.5, '#DED6C6');
    grad.addColorStop(1, '#D6CCB9');
  }
  ctx.fillStyle = grad;
  ctx.fillRect(dx, dy, dw, dh);

  // Subtle diagonal hatch texture
  ctx.strokeStyle = dark ? 'rgba(255, 255, 255, 0.045)' : 'rgba(24, 24, 27, 0.06)';
  ctx.lineWidth = 1;
  const step = 24;
  for (let offset = -dh; offset < dw + dh; offset += step) {
    ctx.beginPath();
    ctx.moveTo(dx + offset, dy);
    ctx.lineTo(dx + offset - dh, dy + dh);
    ctx.stroke();
  }

  // Subtle geometric center reticle
  const cx = dx + dw / 2;
  const cy = dy + dh / 2;
  const ringR = Math.min(dw, dh) * 0.14;
  ctx.strokeStyle = dark ? 'rgba(251, 191, 36, 0.24)' : 'rgba(24, 24, 27, 0.18)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, ringR, 0, Math.PI * 2);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(cx - ringR * 1.45, cy);
  ctx.lineTo(cx + ringR * 1.45, cy);
  ctx.moveTo(cx, cy - ringR * 1.45);
  ctx.lineTo(cx, cy + ringR * 1.45);
  ctx.stroke();

  // Inner editorial frame border
  ctx.strokeStyle = dark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(24, 24, 27, 0.14)';
  ctx.lineWidth = 2;
  ctx.strokeRect(dx + 12, dy + 12, Math.max(0, dw - 24), Math.max(0, dh - 24));
  ctx.restore();
}

export function drawCroppedCoverImage(
  ctx: CanvasRenderingContext2D,
  img: CanvasImageSource | null | undefined,
  dx: number,
  dy: number,
  dw: number,
  dh: number,
  cropFrac = { x: 0, y: 0, w: 1, h: 1 },
  zoom = 1,
  panX = 0,
  panY = 0,
  fallbackDark = true
): void {
  let natW = 0;
  let natH = 0;
  if (img instanceof HTMLImageElement) {
    if (!img.complete || img.naturalWidth === 0) {
      drawStyledPlaceholder(ctx, dx, dy, dw, dh, fallbackDark);
      return;
    }
    natW = img.naturalWidth;
    natH = img.naturalHeight;
  } else if (img instanceof HTMLCanvasElement) {
    if (img.width === 0 || img.height === 0) {
      drawStyledPlaceholder(ctx, dx, dy, dw, dh, fallbackDark);
      return;
    }
    natW = img.width;
    natH = img.height;
  } else if (img instanceof HTMLVideoElement) {
    if (img.readyState < 2 || !img.videoWidth) {
      drawStyledPlaceholder(ctx, dx, dy, dw, dh, fallbackDark);
      return;
    }
    natW = img.videoWidth;
    natH = img.videoHeight;
  } else {
    drawStyledPlaceholder(ctx, dx, dy, dw, dh, fallbackDark);
    return;
  }

  const sx = natW * cropFrac.x;
  const sy = natH * cropFrac.y;
  const sw = Math.max(1, natW * cropFrac.w);
  const sh = Math.max(1, natH * cropFrac.h);

  const targetRatio = dw / Math.max(1, dh);
  const srcRatio = sw / sh;
  let drawSrcW = sw;
  let drawSrcH = sh;
  let drawSrcX = sx;
  let drawSrcY = sy;

  if (srcRatio > targetRatio) {
    drawSrcW = sh * targetRatio;
    drawSrcX = sx + (sw - drawSrcW) / 2;
  } else {
    drawSrcH = sw / targetRatio;
    drawSrcY = sy + (sh - drawSrcH) / 2;
  }

  const zoomedW = drawSrcW / zoom;
  const zoomedH = drawSrcH / zoom;
  const finalX = clamp(
    drawSrcX + (drawSrcW - zoomedW) / 2 + panX * (sw - zoomedW),
    sx,
    sx + sw - zoomedW
  );
  const finalY = clamp(
    drawSrcY + (drawSrcH - zoomedH) / 2 + panY * (sh - zoomedH),
    sy,
    sy + sh - zoomedH
  );

  ctx.drawImage(img, finalX, finalY, zoomedW, zoomedH, dx, dy, dw, dh);
}

export interface HeaderProgressOptions {
  frame: number;
  totalFrames: number;
  width: number;
  seriesTitle: string;
  tag: string;
  dark: boolean;
}

export function drawHeaderProgress(
  ctx: CanvasRenderingContext2D,
  opts: HeaderProgressOptions
): void {
  const { frame, totalFrames, width, seriesTitle, tag, dark } = opts;
  const progress = clamp(frame / Math.max(1, totalFrames - 1), 0, 1);

  ctx.save();
  ctx.fillStyle = dark ? 'rgba(255,255,255,0.14)' : 'rgba(24,24,27,0.14)';
  ctx.fillRect(56, 46, width - 112, 4);
  ctx.fillStyle = dark ? '#FBBF24' : '#C8342A';
  ctx.fillRect(56, 46, Math.max(12, (width - 112) * progress), 4);

  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.font = `700 24px ${FONT}`;
  ctx.fillStyle = dark ? 'rgba(248,250,252,0.82)' : 'rgba(24,24,27,0.78)';
  ctx.fillText(seriesTitle, 56, 84);

  ctx.textAlign = 'right';
  ctx.font = `700 22px ${MONO}, ${FONT}`;
  ctx.fillStyle = dark ? '#FBBF24' : '#C8342A';
  ctx.fillText(tag, width - 56, 84);
  ctx.restore();
}

/**
 * 5-day Daily Candlestick chart (`日K`) with today's animated candle
 */
export function drawMiniDailyCandles(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  candles: DailyCandle[],
  todayAnimT: number,
  accentLabel = '#94A3B8',
  heroMode = false,
  light = false
): void {
  ctx.save();
  ctx.fillStyle = light
    ? heroMode
      ? 'rgba(255, 255, 255, 0.88)'
      : '#F8FAFC'
    : 'rgba(7, 11, 18, 0.84)';
  roundRect(ctx, x, y, w, h, 10);
  ctx.fill();
  ctx.strokeStyle = light
    ? heroMode
      ? 'rgba(217, 119, 6, 0.36)'
      : '#E2E8F0'
    : heroMode
      ? 'rgba(251, 191, 36, 0.25)'
      : 'rgba(255, 255, 255, 0.08)';
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.font = `800 ${heroMode ? 22 : 16}px ${FONT}`;
  ctx.fillStyle = light ? (heroMode ? '#92400E' : '#475569') : accentLabel;
  ctx.fillText('日K', x + 10, y + 6);

  ctx.textAlign = 'right';
  ctx.font = `700 ${heroMode ? 17 : 13}px ${FONT}`;
  ctx.fillStyle = light ? '#B45309' : 'rgba(251, 191, 36, 0.86)';
  ctx.fillText('今日', x + w - 9, y + 7);

  if (candles.length === 0) {
    ctx.restore();
    return;
  }

  let minV = Infinity;
  let maxV = -Infinity;
  for (const c of candles) {
    if (c.low < minV) minV = c.low;
    if (c.high > maxV) maxV = c.high;
  }
  const span = Math.max(0.01, maxV - minV);
  const padMin = minV - span * 0.14;
  const padMax = maxV + span * 0.14;

  const plotX = x + 10;
  const plotW = w - 20;
  const plotTop = y + (heroMode ? 38 : 28);
  const plotBot = y + h - 10;
  const mapY = (v: number) =>
    lerp(plotBot, plotTop, clamp((v - padMin) / (padMax - padMin), 0, 1));

  ctx.strokeStyle = light ? 'rgba(15, 23, 42, 0.08)' : 'rgba(255, 255, 255, 0.06)';
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 3]);
  ctx.beginPath();
  ctx.moveTo(plotX, (plotTop + plotBot) / 2);
  ctx.lineTo(plotX + plotW, (plotTop + plotBot) / 2);
  ctx.stroke();
  ctx.setLineDash([]);

  const stepW = plotW / candles.length;
  const bodyW = Math.max(heroMode ? 14 : 8, Math.floor(stepW * 0.56));
  const animEase = easeOutCubic(clamp(todayAnimT, 0, 1));

  candles.forEach((c, idx) => {
    const isToday = idx === candles.length - 1;
    const t = isToday ? animEase : 1;
    const curOpen = c.open;
    const curHigh = lerp(c.open, c.high, t);
    const curLow = lerp(c.open, c.low, t);
    const curClose = lerp(c.open, c.close, t);

    const isUp = curClose >= curOpen;
    const col = light ? (isUp ? '#DC2626' : '#059669') : isUp ? '#F87171' : '#2DD4BF';
    const cx = plotX + stepW * (idx + 0.5);

    const yHigh = mapY(curHigh);
    const yLow = mapY(curLow);
    const yOpen = mapY(curOpen);
    const yClose = mapY(curClose);

    if (isToday) {
      ctx.fillStyle = light
        ? isUp
          ? 'rgba(220, 38, 38, 0.1)'
          : 'rgba(5, 150, 105, 0.1)'
        : isUp
          ? 'rgba(248, 113, 113, 0.14)'
          : 'rgba(45, 212, 191, 0.14)';
      roundRect(ctx, cx - stepW * 0.44, plotTop - 2, stepW * 0.88, plotBot - plotTop + 4, 4);
      ctx.fill();
    }

    ctx.strokeStyle = col;
    ctx.lineWidth = isToday ? (heroMode ? 2.6 : 2) : 1.5;
    ctx.beginPath();
    ctx.moveTo(cx, yHigh);
    ctx.lineTo(cx, yLow);
    ctx.stroke();

    const bodyTop = Math.min(yOpen, yClose);
    const bodyH = Math.max(3.5, Math.abs(yClose - yOpen));
    ctx.fillStyle = isToday
      ? col
      : light
        ? isUp
          ? 'rgba(220, 38, 38, 0.82)'
          : 'rgba(5, 150, 105, 0.82)'
        : isUp
          ? 'rgba(248, 113, 113, 0.78)'
          : 'rgba(45, 212, 191, 0.78)';
    ctx.fillRect(cx - bodyW / 2, bodyTop, bodyW, bodyH);
  });

  ctx.restore();
}

/**
 * Full-Day Intraday Time-Sharing Chart (`分时`):
 * - 48-point session curve + cumulative yellow intraday average line (均价线)
 * - Dashed 0% open baseline + subtle session markers (开盘 / 盘中 / 收盘)
 * - Volume histogram + live draw tip / subtle scanner
 */
export function drawMiniIntradayChart(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  points: number[],
  volumes: number[],
  lineColor: string,
  drawT: number,
  loopPhase: number,
  accentLabel = '#94A3B8',
  heroMode = false,
  light = false
): void {
  ctx.save();
  ctx.fillStyle = light
    ? heroMode
      ? 'rgba(255, 255, 255, 0.88)'
      : '#F8FAFC'
    : 'rgba(7, 11, 18, 0.84)';
  roundRect(ctx, x, y, w, h, 10);
  ctx.fill();
  ctx.strokeStyle = light
    ? heroMode
      ? 'rgba(217, 119, 6, 0.36)'
      : '#E2E8F0'
    : heroMode
      ? 'rgba(251, 191, 36, 0.25)'
      : 'rgba(255, 255, 255, 0.08)';
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.font = `800 ${heroMode ? 22 : 16}px ${FONT}`;
  ctx.fillStyle = light ? (heroMode ? '#92400E' : '#475569') : accentLabel;
  ctx.fillText('分时', x + 10, y + 6);

  ctx.textAlign = 'right';
  ctx.font = `700 ${heroMode ? 17 : 13}px ${FONT}`;
  ctx.fillStyle = light ? '#64748B' : 'rgba(148, 163, 184, 0.84)';
  ctx.fillText(heroMode ? '全天分时走势' : '全天分时', x + w - 9, y + 7);

  if (points.length < 2) {
    ctx.restore();
    return;
  }

  let minV = 0;
  let maxV = 0;
  for (const p of points) {
    if (p < minV) minV = p;
    if (p > maxV) maxV = p;
  }
  const span = Math.max(1.2, maxV - minV);
  const padMin = minV - span * 0.14;
  const padMax = maxV + span * 0.16;

  const plotX = x + 10;
  const plotW = w - 20;
  const plotTop = y + (heroMode ? 38 : 28);
  const axisLabelH = heroMode ? 22 : 17;
  const volHeight = Math.max(14, Math.round(h * 0.17));
  const plotBot = y + h - volHeight - axisLabelH - 6;
  const mapX = (idxFloat: number) => plotX + (idxFloat / (points.length - 1)) * plotW;
  const mapY = (v: number) =>
    lerp(plotBot, plotTop, clamp((v - padMin) / (padMax - padMin), 0, 1));

  // Subtle vertical session grid (midday divider)
  ctx.strokeStyle = light ? 'rgba(15, 23, 42, 0.06)' : 'rgba(255, 255, 255, 0.05)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(plotX + plotW * 0.5, plotTop);
  ctx.lineTo(plotX + plotW * 0.5, plotBot + volHeight);
  ctx.stroke();

  // 0% dashed baseline
  const zeroY = mapY(0);
  ctx.strokeStyle = light ? 'rgba(15, 23, 42, 0.24)' : 'rgba(255, 255, 255, 0.24)';
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(plotX, zeroY);
  ctx.lineTo(plotX + plotW, zeroY);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.textAlign = 'left';
  ctx.textBaseline = 'bottom';
  ctx.font = `700 ${heroMode ? 15 : 12}px ${MONO}`;
  ctx.fillStyle = light ? '#64748B' : 'rgba(148, 163, 184, 0.72)';
  ctx.fillText('0%', plotX + 2, zeroY - 2);

  // Bottom session time ticks
  const tickY = y + h - 3;
  ctx.textBaseline = 'bottom';
  ctx.font = `700 ${heroMode ? 16 : 13}px ${FONT}`;
  ctx.fillStyle = light ? '#64748B' : 'rgba(148, 163, 184, 0.72)';
  ctx.textAlign = 'left';
  ctx.fillText('开盘', plotX, tickY);
  ctx.textAlign = 'center';
  ctx.fillText('盘中', plotX + plotW / 2, tickY);
  ctx.textAlign = 'right';
  ctx.fillText('收盘', plotX + plotW, tickY);

  // Bottom intraday volume bars (progressively revealed)
  const prog = clamp(drawT, 0, 1);
  const maxFloatIdx = prog * (points.length - 1);
  const fullIdx = Math.floor(maxFloatIdx);
  const frac = maxFloatIdx - fullIdx;
  const tipX =
    fullIdx >= points.length - 1 ? mapX(points.length - 1) : mapX(fullIdx + frac);
  const tipVal =
    fullIdx >= points.length - 1
      ? points[points.length - 1]
      : lerp(points[fullIdx], points[fullIdx + 1], frac);
  const tipY = mapY(tipVal);

  const volBaseY = y + h - axisLabelH - 2;
  const barW = Math.max(2, (plotW / Math.max(1, volumes.length)) * 0.62);
  volumes.forEach((v, vi) => {
    if (vi > maxFloatIdx + 0.3) return;
    const barAlpha = vi <= fullIdx ? 0.44 : 0.22;
    const bx = mapX(vi) - barW / 2;
    const bh = Math.max(2, v * volHeight);
    ctx.fillStyle =
      points[vi] >= (points[vi - 1] ?? points[0])
        ? light
          ? `rgba(220, 38, 38, ${barAlpha})`
          : `rgba(248, 113, 113, ${barAlpha})`
        : light
          ? `rgba(5, 150, 105, ${barAlpha})`
          : `rgba(45, 212, 191, ${barAlpha})`;
    ctx.fillRect(bx, volBaseY - bh, barW, bh);
  });

  if (prog > 0.01) {
    const areaGrad = ctx.createLinearGradient(0, plotTop, 0, plotBot);
    areaGrad.addColorStop(0, light ? `${lineColor}33` : `${lineColor}44`);
    areaGrad.addColorStop(1, `${lineColor}05`);

    ctx.fillStyle = areaGrad;
    ctx.beginPath();
    ctx.moveTo(mapX(0), plotBot);
    for (let i = 0; i <= fullIdx; i++) {
      ctx.lineTo(mapX(i), mapY(points[i]));
    }
    ctx.lineTo(tipX, tipY);
    ctx.lineTo(tipX, plotBot);
    ctx.closePath();
    ctx.fill();

    // Cumulative yellow average price line (均价线)
    const maPoints: number[] = [];
    let runningSum = 0;
    for (let i = 0; i < points.length; i++) {
      runningSum += points[i];
      maPoints.push(runningSum / (i + 1));
    }
    const maTipVal =
      fullIdx >= maPoints.length - 1
        ? maPoints[maPoints.length - 1]
        : lerp(maPoints[fullIdx], maPoints[fullIdx + 1], frac);

    ctx.strokeStyle = light ? 'rgba(217, 119, 6, 0.85)' : 'rgba(251, 191, 36, 0.72)';
    ctx.lineWidth = heroMode ? 1.8 : 1.3;
    ctx.beginPath();
    for (let i = 0; i <= fullIdx; i++) {
      const px = mapX(i);
      const py = mapY(maPoints[i]);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.lineTo(tipX, mapY(maTipVal));
    ctx.stroke();

    // Main full-day curve
    ctx.strokeStyle = lineColor;
    ctx.lineWidth = heroMode ? 3.2 : 2.3;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (let i = 0; i <= fullIdx; i++) {
      const px = mapX(i);
      const py = mapY(points[i]);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.lineTo(tipX, tipY);
    ctx.stroke();

    // Active tracer bead
    let dotX = tipX;
    let dotY = tipY;
    if (prog >= 0.999) {
      const scanFloat = loopPhase * (points.length - 1);
      const si = Math.min(points.length - 2, Math.floor(scanFloat));
      const sf = scanFloat - si;
      dotX = mapX(si + sf);
      dotY = mapY(lerp(points[si], points[si + 1], sf));
    }
    ctx.fillStyle = `${lineColor}4D`;
    ctx.beginPath();
    ctx.arc(dotX, dotY, heroMode ? 9 : 6.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = light ? lineColor : '#FFFFFF';
    ctx.beginPath();
    ctx.arc(dotX, dotY, heroMode ? 4 : 3, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

export interface CleanIndexCardOptions {
  accentColorOverride?: string;
  heroShapeNote?: string;
  heroNoteStartFrame?: number;
  heroNoteEndFrame?: number;
  light?: boolean;
}

/**
 * Clean stripped-back index card (ONLY Title + % + 日K + full-day 分时)
 */
export function drawCleanIndexCard(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  item: CleanIndexChartItem,
  localF: number,
  enterFrame: number,
  slideFrom: 'left' | 'right' | 'bottom' | 'up',
  options?: CleanIndexCardOptions
): void {
  if (localF < enterFrame) return;

  const light = Boolean(options?.light);
  const p = getCardEnterProgress(localF, enterFrame, 16);
  const e = easeOutCubic(p);
  const heroShapeNote = options?.heroShapeNote;
  const isHero = Boolean(heroShapeNote);
  const isPos = item.changePct >= 0;
  const pctColor =
    options?.accentColorOverride ??
    (light ? (isPos ? '#DC2626' : '#059669') : isPos ? '#F87171' : item.color);

  ctx.save();
  ctx.globalAlpha = clamp(p * 1.6, 0, 1);
  if (slideFrom === 'left') ctx.translate(lerp(-140, 0, e), 0);
  else if (slideFrom === 'right') ctx.translate(lerp(140, 0, e), 0);
  else if (slideFrom === 'bottom') ctx.translate(0, lerp(90, 0, e));
  else ctx.translate(0, lerp(-50, 0, e));

  if (light) {
    ctx.shadowColor = 'rgba(15, 23, 42, 0.08)';
    ctx.shadowBlur = 18;
    ctx.shadowOffsetY = 6;
    if (isHero) {
      const heroBg = ctx.createLinearGradient(x, y, x + w, y + h);
      heroBg.addColorStop(0, '#FFFBEB');
      heroBg.addColorStop(1, '#FEF3C7');
      ctx.fillStyle = heroBg;
    } else {
      ctx.fillStyle = '#FFFFFF';
    }
  } else if (isHero) {
    const heroBg = ctx.createLinearGradient(x, y, x + w, y + h);
    heroBg.addColorStop(0, 'rgba(251, 191, 36, 0.16)');
    heroBg.addColorStop(1, 'rgba(251, 191, 36, 0.04)');
    ctx.fillStyle = heroBg;
  } else {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.045)';
  }
  roundRect(ctx, x, y, w, h, isHero ? 18 : 14);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  ctx.strokeStyle = light
    ? isHero
      ? 'rgba(217, 119, 6, 0.65)'
      : p < 0.9
        ? pctColor
        : '#CBD5E1'
    : isHero
      ? 'rgba(251, 191, 36, 0.65)'
      : p < 0.9
        ? pctColor
        : 'rgba(255, 255, 255, 0.12)';
  ctx.lineWidth = isHero ? 2.5 : p < 0.9 ? 2.2 : 1.3;
  ctx.stroke();

  // Left accent bar
  ctx.fillStyle = pctColor;
  roundRect(ctx, x, y + 16, isHero ? 8 : 6, h - 32, 4);
  ctx.fill();

  // Clean Top Row: ONLY Enlarged Title + % Change
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.font = `900 ${isHero ? 44 : 31}px ${FONT}`;
  ctx.fillStyle = light ? (isHero ? '#78350F' : '#0F172A') : isHero ? '#FEF3C7' : '#F8FAFC';
  ctx.fillText(item.name, x + (isHero ? 30 : 20), y + (isHero ? 52 : 40));

  const valT = easeOutCubic(clamp((localF - enterFrame) / 18, 0, 1));
  const curVal = lerp(0, item.changePct, valT);
  const valStr = `${curVal >= 0 ? '+' : ''}${curVal.toFixed(2)}%`;
  ctx.textAlign = 'right';
  ctx.font = `900 ${isHero ? 78 : 46}px ${MONO}`;
  ctx.fillStyle = pctColor;
  ctx.fillText(valStr, x + w - (isHero ? 30 : 16), y + (isHero ? 54 : 40));

  // Charts Row: 日K + full-day 分时
  const padX = isHero ? 28 : 16;
  const chartTop = y + (isHero ? 108 : 78);
  const chartH = isHero ? h - 188 : h - 92;
  const kW = isHero ? 300 : Math.min(300, Math.round((w - padX * 2 - 10) * 0.35));
  const intraW = w - padX * 2 - kW - (isHero ? 16 : 10);

  const todayCandleT = clamp((localF - enterFrame - 4) / 22, 0, 1);
  const intraDrawT = clamp((localF - enterFrame - 6) / 34, 0, 1);
  const loopPhase = ((localF + enterFrame) % 90) / 90;

  drawMiniDailyCandles(
    ctx,
    x + padX,
    chartTop,
    kW,
    chartH,
    item.dailyCandles,
    todayCandleT,
    light ? (isHero ? '#92400E' : '#475569') : isHero ? '#FDE68A' : '#94A3B8',
    isHero,
    light
  );

  drawMiniIntradayChart(
    ctx,
    x + padX + kW + (isHero ? 16 : 10),
    chartTop,
    intraW,
    chartH,
    item.points,
    item.volumes,
    pctColor,
    intraDrawT,
    loopPhase,
    light ? (isHero ? '#92400E' : '#475569') : isHero ? '#FDE68A' : '#94A3B8',
    isHero,
    light
  );

  if (heroShapeNote) {
    const noteStart = options?.heroNoteStartFrame ?? enterFrame + 30;
    const noteEnd = options?.heroNoteEndFrame ?? noteStart + 32;
    const noteRes = sliceTypewriterText(heroShapeNote, localF, noteStart, noteEnd);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.font = `800 29px ${FONT}`;
    ctx.fillStyle = light ? '#92400E' : '#FDE68A';
    const caret = noteRes.typing && Math.floor(localF / 7) % 2 === 0 ? ' ▌' : '';
    ctx.fillText(noteRes.visible + caret, x + 28, y + h - 42);
  }

  ctx.restore();
}

/**
 * Typewriter-animated editorial summary strip below each market row
 */
export function drawTypewriterSummaryStrip(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  accentColor: string,
  title: string,
  reasonText: string,
  localF: number,
  titleFrame: number,
  typeStartFrame: number,
  typeEndFrame: number,
  titleSize: number,
  bodySize: number,
  holdPauseUntilFrame?: number,
  light = false
): void {
  if (localF < titleFrame) return;

  const enterT = easeOutCubic(clamp((localF - titleFrame) / 10, 0, 1));
  const typed = sliceTypewriterText(reasonText, localF, typeStartFrame, typeEndFrame);
  const showHoldCursor =
    holdPauseUntilFrame !== undefined &&
    localF >= typeEndFrame &&
    localF < holdPauseUntilFrame &&
    Math.floor(localF / 10) % 2 === 0;
  const caret = (typed.typing && Math.floor(localF / 6) % 2 === 0) || showHoldCursor ? '▌' : '';

  ctx.save();
  ctx.globalAlpha = enterT;
  if (light) {
    ctx.shadowColor = 'rgba(15, 23, 42, 0.06)';
    ctx.shadowBlur = 12;
    ctx.shadowOffsetY = 4;
    ctx.fillStyle = '#F8FAFC';
  } else {
    ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
  }
  roundRect(ctx, x, y, w, h, 12);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
  ctx.strokeStyle = light ? '#CBD5E1' : 'rgba(255, 255, 255, 0.1)';
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.fillStyle = accentColor;
  roundRect(ctx, x, y + 12, 6, h - 24, 3);
  ctx.fill();

  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.font = `900 ${titleSize}px ${FONT}`;
  ctx.fillStyle = accentColor;
  ctx.fillText(title, x + 22, y + 12);

  if (localF >= typeStartFrame) {
    ctx.font = `600 ${bodySize}px ${FONT}`;
    ctx.fillStyle = light ? '#1E293B' : '#E2E8F0';
    drawWrappedText(
      ctx,
      typed.visible + caret,
      x + 22,
      y + 16 + titleSize + 8,
      w - 40,
      bodySize + 9
    );
  }
  ctx.restore();
}
