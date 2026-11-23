import { clamp, easeOutCubic, lerp } from '../timeline';
import type { LoadedIntelImages } from '../intel/renderIntelFrame';
import {
  INTEL_V2_DATA,
  INTEL_V2_SPEC,
  SHOT2_PART_TIMING,
  getCardEnterProgress,
  getShot1ExitState,
  getV2Anomalies,
  sliceTypewriterText,
  type CleanIndexChartItem,
  type DailyCandle,
} from './intelV2Data';
import { getIntelV2ShotAtFrame } from './intelV2Timeline';

const FONT = '"Noto Sans SC", "Plus Jakarta Sans", "PingFang SC", "Microsoft YaHei", sans-serif';
const MONO = '"JetBrains Mono", monospace';

function easeOutBack(t: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  const x = clamp(t, 0, 1);
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  const rad = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.arcTo(x + w, y, x + w, y + h, rad);
  ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad);
  ctx.arcTo(x, y, x + w, y, rad);
  ctx.closePath();
}

function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
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

function drawWrappedText(
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

function drawCroppedCoverImage(
  ctx: CanvasRenderingContext2D,
  img: CanvasImageSource | null | undefined,
  dx: number,
  dy: number,
  dw: number,
  dh: number,
  cropFrac = { x: 0, y: 0, w: 1, h: 1 },
  zoom = 1,
  panX = 0,
  panY = 0
) {
  let natW = 0;
  let natH = 0;
  if (img instanceof HTMLImageElement) {
    if (!img.complete || img.naturalWidth === 0) {
      ctx.fillStyle = '#141922';
      ctx.fillRect(dx, dy, dw, dh);
      return;
    }
    natW = img.naturalWidth;
    natH = img.naturalHeight;
  } else if (img instanceof HTMLCanvasElement) {
    natW = img.width;
    natH = img.height;
  } else if (img instanceof HTMLVideoElement) {
    if (img.readyState < 2 || !img.videoWidth) {
      ctx.fillStyle = '#141922';
      ctx.fillRect(dx, dy, dw, dh);
      return;
    }
    natW = img.videoWidth;
    natH = img.videoHeight;
  } else {
    ctx.fillStyle = '#141922';
    ctx.fillRect(dx, dy, dw, dh);
    return;
  }

  const sx = natW * cropFrac.x;
  const sy = natH * cropFrac.y;
  const sw = natW * cropFrac.w;
  const sh = natH * cropFrac.h;

  const targetRatio = dw / dh;
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

function drawHeaderProgress(
  ctx: CanvasRenderingContext2D,
  frame: number,
  tag: string,
  dark: boolean
) {
  const { width } = INTEL_V2_SPEC;
  const progress = clamp(frame / (INTEL_V2_SPEC.totalFrames - 1), 0, 1);

  ctx.save();
  ctx.fillStyle = dark ? 'rgba(255,255,255,0.14)' : 'rgba(24,24,27,0.14)';
  ctx.fillRect(56, 46, width - 112, 4);
  ctx.fillStyle = dark ? '#FBBF24' : '#C8342A';
  ctx.fillRect(56, 46, Math.max(12, (width - 112) * progress), 4);

  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.font = `700 24px ${FONT}`;
  ctx.fillStyle = dark ? 'rgba(248,250,252,0.82)' : 'rgba(24,24,27,0.78)';
  ctx.fillText(INTEL_V2_DATA.seriesTitle, 56, 84);

  ctx.textAlign = 'right';
  ctx.font = `700 22px ${MONO}, ${FONT}`;
  ctx.fillStyle = dark ? '#FBBF24' : '#C8342A';
  ctx.fillText(tag, width - 56, 84);
  ctx.restore();
}

/**
 * 5-day Daily Candlestick chart (`日K`) with today's animated candle
 */
function drawMiniDailyCandles(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  candles: DailyCandle[],
  todayAnimT: number,
  accentLabel = '#94A3B8',
  heroMode = false
) {
  ctx.save();
  ctx.fillStyle = 'rgba(7, 11, 18, 0.84)';
  roundRect(ctx, x, y, w, h, 10);
  ctx.fill();
  ctx.strokeStyle = heroMode ? 'rgba(251, 191, 36, 0.25)' : 'rgba(255, 255, 255, 0.08)';
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.font = `800 ${heroMode ? 22 : 16}px ${FONT}`;
  ctx.fillStyle = accentLabel;
  ctx.fillText('日K', x + 10, y + 6);

  ctx.textAlign = 'right';
  ctx.font = `700 ${heroMode ? 17 : 13}px ${FONT}`;
  ctx.fillStyle = 'rgba(251, 191, 36, 0.86)';
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
  const mapY = (v: number) => lerp(plotBot, plotTop, clamp((v - padMin) / (padMax - padMin), 0, 1));

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
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
    const col = isUp ? '#F87171' : '#2DD4BF';
    const cx = plotX + stepW * (idx + 0.5);

    const yHigh = mapY(curHigh);
    const yLow = mapY(curLow);
    const yOpen = mapY(curOpen);
    const yClose = mapY(curClose);

    if (isToday) {
      ctx.fillStyle = isUp ? 'rgba(248, 113, 113, 0.14)' : 'rgba(45, 212, 191, 0.14)';
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
    ctx.fillStyle = isToday ? col : isUp ? 'rgba(248, 113, 113, 0.78)' : 'rgba(45, 212, 191, 0.78)';
    ctx.fillRect(cx - bodyW / 2, bodyTop, bodyW, bodyH);
  });

  ctx.restore();
}

/**
 * Full-Day Intraday Time-Sharing Chart (`分时`):
 * - Realistic 48-point session curve + cumulative yellow intraday average line (均价线)
 * - Dashed 0% open baseline + subtle session markers (开盘 / 盘中 / 收盘)
 * - U-shaped volume histogram + live draw tip / subtle scanner
 */
function drawMiniIntradayChart(
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
  heroMode = false
) {
  ctx.save();
  ctx.fillStyle = 'rgba(7, 11, 18, 0.84)';
  roundRect(ctx, x, y, w, h, 10);
  ctx.fill();
  ctx.strokeStyle = heroMode ? 'rgba(251, 191, 36, 0.25)' : 'rgba(255, 255, 255, 0.08)';
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.font = `800 ${heroMode ? 22 : 16}px ${FONT}`;
  ctx.fillStyle = accentLabel;
  ctx.fillText('分时', x + 10, y + 6);

  ctx.textAlign = 'right';
  ctx.font = `700 ${heroMode ? 17 : 13}px ${FONT}`;
  ctx.fillStyle = 'rgba(148, 163, 184, 0.84)';
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
  const mapY = (v: number) => lerp(plotBot, plotTop, clamp((v - padMin) / (padMax - padMin), 0, 1));

  // Subtle vertical session grid (midday divider)
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(plotX + plotW * 0.5, plotTop);
  ctx.lineTo(plotX + plotW * 0.5, plotBot + volHeight);
  ctx.stroke();

  // 0% dashed baseline
  const zeroY = mapY(0);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.24)';
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
  ctx.fillStyle = 'rgba(148, 163, 184, 0.72)';
  ctx.fillText('0%', plotX + 2, zeroY - 2);

  // Bottom session time ticks
  const tickY = y + h - 3;
  ctx.textBaseline = 'bottom';
  ctx.font = `700 ${heroMode ? 16 : 13}px ${FONT}`;
  ctx.fillStyle = 'rgba(148, 163, 184, 0.72)';
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
        ? `rgba(248, 113, 113, ${barAlpha})`
        : `rgba(45, 212, 191, ${barAlpha})`;
    ctx.fillRect(bx, volBaseY - bh, barW, bh);
  });

  if (prog > 0.01) {
    const areaGrad = ctx.createLinearGradient(0, plotTop, 0, plotBot);
    areaGrad.addColorStop(0, `${lineColor}44`);
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

    ctx.strokeStyle = 'rgba(251, 191, 36, 0.72)';
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
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(dotX, dotY, heroMode ? 4 : 3, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

/**
 * SHOT 01 (0..77, 2.6s): Snappy Live-Action "今天很关键" Hook + Whip-In Scannable Danmaku -> Razor Curtain Clear
 */
function renderV2KeyDayVideoScene(
  ctx: CanvasRenderingContext2D,
  frame: number,
  shotStart: number,
  images: LoadedIntelImages
) {
  const { width, height } = INTEL_V2_SPEC;
  const localF = frame - shotStart;
  const d = INTEL_V2_DATA.keyDayVideo;
  const exit = getShot1ExitState(localF);

  // Clean slate base
  ctx.fillStyle = '#090D14';
  ctx.fillRect(0, 0, width, height);

  if (exit.isCleared) {
    return;
  }

  // Pick continuous live-action shock reaction frame (accelerated 0..56 expressive reaction + subtle micro-pulse 56..66)
  const videoFrames = images.realKeyDayFrames;
  let mediaSrc: CanvasImageSource | null | undefined = null;
  let vidProg = clamp(localF / 56, 0, 1);
  if (localF > 56) {
    const tailWave = 0.5 - 0.5 * Math.cos(((localF - 56) / 14) * Math.PI * 2);
    vidProg = clamp(0.84 + 0.16 * tailWave, 0, 1);
  }
  if (videoFrames && videoFrames.length > 0) {
    const idx = Math.min(videoFrames.length - 1, Math.floor(vidProg * (videoFrames.length - 1)));
    mediaSrc = videoFrames[idx];
  } else if (images.realKeyDayVideo && images.realKeyDayVideo.readyState >= 2) {
    mediaSrc = images.realKeyDayVideo;
  } else {
    mediaSrc = images.realTraderShocked;
  }

  // 1. Full-Screen Real Live-Action Video Layer (shutter close at f=64..74 with razor light seam)
  const closeE = easeOutCubic(exit.videoClose);
  const clipH = Math.max(0, height * (1 - closeE));
  const clipY = (height - clipH) / 2;

  if (clipH > 2) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, clipY, width, clipH);
    ctx.clip();
    ctx.globalAlpha = 1 - closeE * 0.52;

    const liveZoom = lerp(1.0, 1.13, easeOutCubic(clamp(localF / 64, 0, 1)));
    drawCroppedCoverImage(
      ctx,
      mediaSrc,
      0,
      0,
      width,
      height,
      { x: 0, y: 0, w: 1, h: 1 },
      liveZoom,
      0,
      0
    );

    // Warm impact flash synced to faster f=9 slam
    const flashT = clamp(1 - Math.abs(localF - 9) / 8, 0, 1);
    if (flashT > 0) {
      const flashG = ctx.createRadialGradient(width / 2, 1580, 70, width / 2, 1580, 920);
      flashG.addColorStop(0, `rgba(251, 191, 36, ${0.38 * flashT})`);
      flashG.addColorStop(0.55, `rgba(239, 68, 68, ${0.26 * flashT})`);
      flashG.addColorStop(1, 'rgba(9, 13, 20, 0)');
      ctx.fillStyle = flashG;
      ctx.fillRect(0, 0, width, height);
    }

    const topScrim = ctx.createLinearGradient(0, 0, 0, 390);
    topScrim.addColorStop(0, 'rgba(9, 13, 20, 0.8)');
    topScrim.addColorStop(1, 'rgba(9, 13, 20, 0)');
    ctx.fillStyle = topScrim;
    ctx.fillRect(0, 0, width, 390);

    const botScrim = ctx.createLinearGradient(0, height - 920, 0, height);
    botScrim.addColorStop(0, 'rgba(9, 13, 20, 0)');
    botScrim.addColorStop(0.42, 'rgba(9, 13, 20, 0.74)');
    botScrim.addColorStop(1, 'rgba(9, 13, 20, 0.96)');
    ctx.fillStyle = botScrim;
    ctx.fillRect(0, height - 920, width, 920);
    ctx.restore();

    // Luminous razor seam accent as shutter snaps closed (f=65..74)
    if (closeE > 0.08 && closeE < 0.98) {
      const seamAlpha = Math.sin(closeE * Math.PI) * 0.95;
      ctx.save();
      ctx.globalAlpha = seamAlpha;
      const seamGrad = ctx.createLinearGradient(0, 0, width, 0);
      seamGrad.addColorStop(0, 'rgba(56, 189, 248, 0)');
      seamGrad.addColorStop(0.25, '#38BDF8');
      seamGrad.addColorStop(0.5, '#FEF08A');
      seamGrad.addColorStop(0.75, '#F87171');
      seamGrad.addColorStop(1, 'rgba(248, 113, 113, 0)');
      ctx.fillStyle = seamGrad;
      ctx.fillRect(0, clipY - 2, width, 4);
      ctx.fillRect(0, clipY + clipH - 2, width, 4);
      ctx.restore();
    }
  }

  // 2. Clean Slim Top Progress Line ONLY (zero tiny cramped header text or small badge)
  const topExitE = easeOutCubic(exit.badgeExit);
  if (topExitE < 0.99) {
    const progress = clamp(frame / (INTEL_V2_SPEC.totalFrames - 1), 0, 1);
    ctx.save();
    ctx.globalAlpha = 1 - topExitE;
    ctx.fillStyle = 'rgba(255,255,255,0.16)';
    ctx.fillRect(56, 46, width - 112, 5);
    ctx.fillStyle = '#FBBF24';
    ctx.fillRect(56, 46, Math.max(14, (width - 112) * progress), 5);
    ctx.restore();
  }

  // 3. Five Concise Whip-In Danmaku Lanes (52–54px, readable immediately at f=12..54, whip out left at f=55..62)
  const dmExitE = easeOutCubic(exit.danmakuExit);
  if (dmExitE < 0.99) {
    ctx.save();
    ctx.globalAlpha = 1 - dmExitE;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';

    d.danmakuItems.forEach((dm, idx) => {
      if (localF < dm.delay) return;
      const df = localF - dm.delay;
      ctx.font = `900 ${dm.fontSize}px ${FONT}`;
      const textW = ctx.measureText(dm.text).width;

      // Rapid whip-in into readable canvas zone [56..width-56], gentle glide during reading hold, fast exit whip left
      const whipIn = easeOutCubic(clamp(df / 10, 0, 1));
      const holdDrift = Math.max(0, df - 10) * dm.speed * 0.52;
      const targetAnchorX = Math.min(dm.offset, width - textW - 68);
      const posX =
        lerp(width + 48, Math.max(48, targetAnchorX), whipIn) -
        holdDrift -
        dmExitE * (1120 + idx * 140);

      ctx.fillStyle = 'rgba(9, 13, 20, 0.78)';
      roundRect(ctx, posX - 20, dm.y - dm.fontSize * 0.68, textW + 40, dm.fontSize * 1.36, 16);
      ctx.fill();

      ctx.strokeStyle = `${dm.color}44`;
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.lineWidth = 9;
      ctx.strokeStyle = 'rgba(9, 13, 20, 0.98)';
      ctx.strokeText(dm.text, posX, dm.y);
      ctx.fillStyle = dm.color;
      ctx.fillText(dm.text, posX, dm.y);
    });

    ctx.restore();
  }

  // 4. Snappy Pop-Art Kinetic Stamp Composition: "今天很关键" (enters f=3..16, clears f=60..67)
  const headExitE = easeOutCubic(exit.headlineExit);
  if (localF >= 3 && headExitE < 0.99) {
    const heroY = 1585 + lerp(0, 380, headExitE);
    const enterP = clamp((localF - 4) / 10, 0, 1);
    const springScale =
      (enterP < 1 ? lerp(2.15, 1.0, easeOutBack(enterP)) : 1 + 0.02 * Math.sin(localF * 0.24)) *
      lerp(1.0, 0.86, headExitE);

    // A) Dynamic rotating radial comic speed rays + concentric twin shockwave rings
    if (localF >= 5 && headExitE < 0.35) {
      const rayAlpha = clamp((localF - 5) / 7, 0, 1) * (1 - headExitE) * 0.26;
      ctx.save();
      ctx.translate(width / 2, heroY);
      ctx.rotate(localF * 0.018);
      const rayCount = 16;
      for (let r = 0; r < rayCount; r++) {
        const a0 = (r / rayCount) * Math.PI * 2;
        const a1 = a0 + Math.PI / (rayCount * 1.7);
        ctx.fillStyle = r % 2 === 0 ? `rgba(251, 191, 36, ${rayAlpha})` : `rgba(239, 68, 68, ${rayAlpha * 0.8})`;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(a0) * 620, Math.sin(a0) * 260);
        ctx.lineTo(Math.cos(a1) * 620, Math.sin(a1) * 260);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    }

    if (localF >= 7 && localF <= 34 && headExitE < 0.25) {
      const waveT = (localF - 7) / 26;
      const waveAlpha = (1 - waveT) * 0.82 * (1 - headExitE);
      ctx.save();
      ctx.strokeStyle = `rgba(253, 224, 71, ${waveAlpha})`;
      ctx.lineWidth = lerp(9, 2, waveT);
      ctx.beginPath();
      ctx.ellipse(width / 2, heroY, lerp(95, 590, easeOutCubic(waveT)), lerp(34, 205, easeOutCubic(waveT)), 0, 0, Math.PI * 2);
      ctx.stroke();

      const wave2T = clamp((localF - 10) / 22, 0, 1);
      if (wave2T > 0) {
        ctx.strokeStyle = `rgba(56, 189, 248, ${(1 - wave2T) * 0.68})`;
        ctx.lineWidth = lerp(6, 1.5, wave2T);
        ctx.beginPath();
        ctx.ellipse(width / 2, heroY, lerp(70, 480, easeOutCubic(wave2T)), lerp(22, 155, easeOutCubic(wave2T)), 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    }

    // B) Tilted Pop-Art Sticker Tag above main wordmark
    const tagP = clamp((localF - 3) / 7, 0, 1);
    const tagScale = lerp(0.4, 1.0, easeOutBack(tagP));
    const tagWobble = Math.sin(localF * 0.26) * 0.024;
    ctx.save();
    ctx.globalAlpha = clamp(tagP * 2.2, 0, 1) * (1 - headExitE);
    ctx.translate(width / 2 - 140, heroY - 154);
    ctx.rotate(-0.055 + tagWobble);
    ctx.scale(tagScale, tagScale);

    ctx.fillStyle = '#EF4444';
    roundRect(ctx, -188, -28, 392, 62, 16);
    ctx.fill();

    ctx.fillStyle = '#FDE047';
    roundRect(ctx, -196, -34, 392, 62, 16);
    ctx.fill();
    ctx.strokeStyle = '#090D14';
    ctx.lineWidth = 5;
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `900 30px ${FONT}`;
    ctx.fillStyle = '#090D14';
    ctx.fillText('⚡ 今日盘前第一信号', 0, -2);
    ctx.restore();

    // C) Split Kinetic 3D Comic Wordmark: "今天" · "[很]" · "关键!!"
    if (localF >= 4) {
      ctx.save();
      ctx.globalAlpha = clamp(enterP * 2.1, 0, 1) * (1 - headExitE);
      ctx.translate(width / 2, heroY);
      ctx.scale(springScale, springScale);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      // Part 1: "今天" (left, crisp white with 3D cyan comic shadow, tilted -4deg)
      const sway1 = Math.sin(localF * 0.22) * 5;
      ctx.save();
      ctx.translate(-305, sway1);
      ctx.rotate(-0.07);
      ctx.font = `900 116px ${FONT}`;
      ctx.fillStyle = '#38BDF8';
      ctx.fillText('今天', 8, 9);
      ctx.lineWidth = 16;
      ctx.strokeStyle = '#090D14';
      ctx.strokeText('今天', 0, 0);
      ctx.fillStyle = '#FFFFFF';
      ctx.fillText('今天', 0, 0);
      ctx.restore();

      // Part 2: "很" (center tilted coral-red comic stamp badge with yellow border)
      const henP = clamp((localF - 6) / 8, 0, 1);
      const henS = lerp(0.3, 1.0, easeOutBack(henP));
      ctx.save();
      ctx.translate(-92, -8 - sway1 * 0.7);
      ctx.rotate(0.11 + Math.sin(localF * 0.28) * 0.025);
      ctx.scale(henS, henS);

      ctx.fillStyle = '#090D14';
      roundRect(ctx, -56, -62, 122, 128, 24);
      ctx.fill();

      ctx.fillStyle = '#EF4444';
      roundRect(ctx, -62, -68, 122, 128, 24);
      ctx.fill();
      ctx.strokeStyle = '#FDE047';
      ctx.lineWidth = 6;
      ctx.stroke();

      ctx.font = `900 94px ${FONT}`;
      ctx.lineWidth = 10;
      ctx.strokeStyle = '#090D14';
      ctx.strokeText('很', -1, -2);
      ctx.fillStyle = '#FFFFFF';
      ctx.fillText('很', -1, -2);
      ctx.restore();

      // Part 3: "关键" (oversized 172px 3D crimson-extruded gold hero with fast dual-pass specular sheen)
      const keyP = clamp((localF - 7) / 9, 0, 1);
      const keyS = keyP < 1 ? lerp(2.2, 1.0, easeOutBack(keyP)) : 1.0;
      ctx.save();
      ctx.translate(182, sway1 * 0.6);
      ctx.rotate(-0.025);
      ctx.scale(keyS, keyS);
      ctx.font = `900 172px ${FONT}`;

      ctx.fillStyle = '#B91C1C';
      ctx.fillText('关键', 10, 12);

      ctx.lineWidth = 20;
      ctx.strokeStyle = '#090D14';
      ctx.strokeText('关键', 0, 0);

      const titleGrad = ctx.createLinearGradient(-150, -85, 160, 85);
      const sheenPos = clamp(((localF - 14) % 24) / 22, 0, 1);
      titleGrad.addColorStop(0, '#FEF08A');
      titleGrad.addColorStop(Math.max(0.05, sheenPos - 0.14), '#FBBF24');
      if (localF >= 14 && sheenPos > 0.05 && sheenPos < 0.95) {
        titleGrad.addColorStop(sheenPos, '#FFFFFF');
      }
      titleGrad.addColorStop(Math.min(0.95, sheenPos + 0.16), '#F59E0B');
      titleGrad.addColorStop(1, '#FB923C');
      ctx.fillStyle = titleGrad;
      ctx.fillText('关键', 0, 0);
      ctx.restore();

      // Part 4: Twin comic exclamation marks "!!" popping on the right
      const exP = clamp((localF - 10) / 8, 0, 1);
      const exS = lerp(0.2, 1.0, easeOutBack(exP));
      ctx.save();
      ctx.translate(418, -22 + Math.sin(localF * 0.34) * 6);
      ctx.rotate(0.18);
      ctx.scale(exS, exS);
      ctx.font = `900 124px ${MONO}, ${FONT}`;
      ctx.lineWidth = 14;
      ctx.strokeStyle = '#090D14';
      ctx.strokeText('!!', 0, 0);
      ctx.fillStyle = '#FDE047';
      ctx.fillText('!!', 0, 0);
      ctx.restore();

      // Floating comic lightning sparks
      const sparkOffsets = [
        { x: -458, y: -92, sym: '⚡', size: 46, phase: 0 },
        { x: 446, y: 74, sym: '✦', size: 38, phase: 1.7 },
        { x: 298, y: -124, sym: '⚡', size: 40, phase: 3.1 },
      ];
      sparkOffsets.forEach((sp) => {
        const popT = clamp((localF - 9) / 10, 0, 1);
        const bob = Math.sin(localF * 0.32 + sp.phase) * 8;
        ctx.save();
        ctx.globalAlpha = popT * (1 - headExitE);
        ctx.translate(sp.x, sp.y + bob);
        ctx.rotate(Math.sin(localF * 0.18 + sp.phase) * 0.15);
        ctx.font = `900 ${sp.size}px ${FONT}`;
        ctx.fillStyle = '#FDE047';
        ctx.fillText(sp.sym, 0, 0);
        ctx.restore();
      });

      ctx.restore();
    }
  }
}

/**
 * Helper to draw a clean stripped-back index card (ONLY Title + % + 日K + full-day 分时)
 */
function drawCleanIndexCard(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  item: CleanIndexChartItem,
  localF: number,
  enterFrame: number,
  slideFrom: 'left' | 'right' | 'bottom' | 'up',
  accentColorOverride?: string,
  heroShapeNote?: string
) {
  if (localF < enterFrame) return;

  const p = getCardEnterProgress(localF, enterFrame, 16);
  const e = easeOutCubic(p);
  const isHero = Boolean(heroShapeNote);
  const isPos = item.changePct >= 0;
  const pctColor = accentColorOverride ?? (isPos ? '#F87171' : item.color);

  ctx.save();
  ctx.globalAlpha = clamp(p * 1.6, 0, 1);
  if (slideFrom === 'left') ctx.translate(lerp(-140, 0, e), 0);
  else if (slideFrom === 'right') ctx.translate(lerp(140, 0, e), 0);
  else if (slideFrom === 'bottom') ctx.translate(0, lerp(90, 0, e));
  else ctx.translate(0, lerp(-50, 0, e));

  if (isHero) {
    const heroBg = ctx.createLinearGradient(x, y, x + w, y + h);
    heroBg.addColorStop(0, 'rgba(251, 191, 36, 0.16)');
    heroBg.addColorStop(1, 'rgba(251, 191, 36, 0.04)');
    ctx.fillStyle = heroBg;
  } else {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.045)';
  }
  roundRect(ctx, x, y, w, h, isHero ? 18 : 14);
  ctx.fill();

  ctx.strokeStyle = isHero
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
  ctx.fillStyle = isHero ? '#FEF3C7' : '#F8FAFC';
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
  const kW = isHero ? 300 : Math.round((w - padX * 2 - 10) * 0.35);
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
    isHero ? '#FDE68A' : '#94A3B8',
    isHero
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
    isHero ? '#FDE68A' : '#94A3B8',
    isHero
  );

  if (heroShapeNote) {
    const noteRes = sliceTypewriterText(
      heroShapeNote,
      localF,
      SHOT2_PART_TIMING.a50NoteStart,
      SHOT2_PART_TIMING.a50NoteEnd
    );
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.font = `800 29px ${FONT}`;
    ctx.fillStyle = '#FDE68A';
    const caret = noteRes.typing && Math.floor(localF / 7) % 2 === 0 ? ' ▌' : '';
    ctx.fillText(noteRes.visible + caret, x + 28, y + h - 42);
  }

  ctx.restore();
}

/**
 * Helper to draw typewriter-animated news/policy summary strip below each market row
 */
function drawTypewriterSummaryStrip(
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
  holdPauseUntilFrame?: number
) {
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
  ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
  roundRect(ctx, x, y, w, h, 12);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
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
    ctx.fillStyle = '#E2E8F0';
    drawWrappedText(ctx, typed.visible + caret, x + 22, y + 16 + titleSize + 8, w - 40, bodySize + 9);
  }
  ctx.restore();
}

/**
 * SHOT 02 (120..539, 14.0s): Ordered Progressive Global Market Board (100% Real-Market Verified Edition)
 * - Row 1: US [Nasdaq IXIC | SOX] + highlighted 36px headline + 27px typewriter reason + 1.0s pause
 * - Row 2: Asia [KOSPI | Nikkei 225] + 26px typewriter reason
 * - Row 3: Abnormal Commodities Only [COMEX Gold | Natural Gas] + 26px typewriter reason
 * - Row 4: Full-Width Oversized FTSE China A50 Hero + 29px intraday open annotation (+1.0s extra dwell)
 */
function renderV2IndicesBoardScene(ctx: CanvasRenderingContext2D, frame: number, shotStart: number) {
  const { width, height } = INTEL_V2_SPEC;
  const localF = frame - shotStart;
  const d = INTEL_V2_DATA.indicesBoard;

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

  drawHeaderProgress(ctx, frame, 'MARKETS · 全天分时与日K', true);

  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.font = `700 24px ${MONO}, ${FONT}`;
  ctx.fillStyle = '#94A3B8';
  ctx.fillText(d.sectionLabel, 40, 112);

  const colW = 488;
  const gap = 24;
  const xLeft = 40;
  const xRight = 40 + colW + gap;
  const fullW = width - 80;

  // PART 1: US Markets (Row 1: Nasdaq + SOX, y=148..408) + Highlighted Typewriter Summary (y=418..584)
  drawCleanIndexCard(ctx, xLeft, 148, colW, 260, d.usIndices[0], localF, SHOT2_PART_TIMING.usStart, 'left');
  drawCleanIndexCard(ctx, xRight, 148, colW, 260, d.usIndices[1], localF, SHOT2_PART_TIMING.usStart + 4, 'right');

  drawTypewriterSummaryStrip(
    ctx,
    xLeft,
    418,
    fullW,
    166,
    '#FBBF24',
    d.usHeadline,
    d.usReason,
    localF,
    SHOT2_PART_TIMING.usHeadlineFrame,
    SHOT2_PART_TIMING.usTypeStart,
    SHOT2_PART_TIMING.usTypeEnd,
    36,
    27,
    SHOT2_PART_TIMING.asiaStart
  );

  // PART 2: Asia Open (Row 2: KOSPI + Nikkei 225, y=598..846) + Typewriter Summary (y=856..994)
  drawCleanIndexCard(ctx, xLeft, 598, colW, 248, d.asiaIndices[0], localF, SHOT2_PART_TIMING.asiaStart, 'left');
  drawCleanIndexCard(ctx, xRight, 598, colW, 248, d.asiaIndices[1], localF, SHOT2_PART_TIMING.asiaStart + 4, 'right');

  drawTypewriterSummaryStrip(
    ctx,
    xLeft,
    856,
    fullW,
    138,
    '#34D399',
    d.asiaHeadline,
    d.asiaReason,
    localF,
    SHOT2_PART_TIMING.asiaStart + 10,
    SHOT2_PART_TIMING.asiaTypeStart,
    SHOT2_PART_TIMING.asiaTypeEnd,
    31,
    26
  );

  // PART 3: Abnormal Commodities Only via getV2Anomalies() (Row 3: Spot Gold + Crude Oil, y=1008..1256)
  const anomalies = getV2Anomalies();
  const anomCharts = anomalies
    .map((a) => d.commodityCharts[a.id])
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
      SHOT2_PART_TIMING.commodityStart,
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
      SHOT2_PART_TIMING.commodityStart + 4,
      'right'
    );
  }

  drawTypewriterSummaryStrip(
    ctx,
    xLeft,
    1266,
    fullW,
    138,
    '#F59E0B',
    d.commodityHeadline,
    d.commodityReason,
    localF,
    SHOT2_PART_TIMING.commodityStart + 10,
    SHOT2_PART_TIMING.commodityTypeStart,
    SHOT2_PART_TIMING.commodityTypeEnd,
    31,
    26
  );

  // PART 4: FTSE China A50 Full-Width Oversized Hero Row (y=1420..1882, height=462)
  drawCleanIndexCard(
    ctx,
    xLeft,
    1420,
    fullW,
    462,
    d.a50Hero,
    localF,
    SHOT2_PART_TIMING.a50Start,
    'bottom',
    '#FBBF24',
    d.a50Hero.intradayShapeNote
  );
}

/**
 * SHOT 02 (120..329): Enlarged High-Legibility Synchronized Curve Race + A50 Shield + Gold/Oil Seesaw
 */
function renderV2SparklineRadarScene(
  ctx: CanvasRenderingContext2D,
  frame: number,
  shotStart: number
) {
  const { width, height } = INTEL_V2_SPEC;
  const localF = frame - shotStart;
  const m = INTEL_V2_DATA.markets;

  ctx.fillStyle = '#090D14';
  ctx.fillRect(0, 0, width, height);

  drawHeaderProgress(ctx, frame, 'GLOBAL · 大字实时研判', true);

  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.font = `900 58px ${FONT}`;
  ctx.fillStyle = '#FFFFFF';
  ctx.fillText(m.headline, 56, 124);

  ctx.font = `700 31px ${FONT}`;
  ctx.fillStyle = '#CBD5E1';
  ctx.fillText(m.subline, 56, 198);

  // Chart Region: y = 262..760, x = 104..838 (leaves 186px on right for bold 31px endpoint percentages)
  const chartX = 104;
  const chartW = 734;
  const chartTop = 262;
  const chartBot = 760;
  const minPct = -7.0;
  const maxPct = 2.6;
  const pctToY = (pct: number) =>
    lerp(chartBot, chartTop, clamp((pct - minPct) / (maxPct - minPct), 0, 1));

  const zeroY = pctToY(0);
  ctx.save();
  for (const tick of [2, 0, -2, -4, -6]) {
    const ty = pctToY(tick);
    ctx.strokeStyle = tick === 0 ? 'rgba(255,255,255,0.32)' : 'rgba(255,255,255,0.07)';
    ctx.lineWidth = tick === 0 ? 2.2 : 1;
    if (tick === 0) ctx.setLineDash([8, 6]);
    else ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(chartX, ty);
    ctx.lineTo(chartX + chartW, ty);
    ctx.stroke();

    ctx.setLineDash([]);
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.font = `700 26px ${MONO}`;
    ctx.fillStyle = tick === 0 ? '#F8FAFC' : '#94A3B8';
    ctx.fillText(`${tick > 0 ? '+' : ''}${tick}%`, chartX - 12, ty);
  }
  ctx.restore();

  // Animate path-trim progress (localF 6..74) — 100% synced with all displayed live figures!
  const drawProg = easeOutCubic(clamp((localF - 6) / 68, 0.04, 1));
  const focusShift = easeOutCubic(clamp((localF - 80) / 22, 0, 1));

  const endpoints: Array<{
    id: string;
    color: string;
    highlight: boolean;
    alpha: number;
    tipX: number;
    tipY: number;
    pct: number;
    labelY: number;
  }> = [];

  const livePctById: Record<string, number> = {};

  m.sparklines.forEach((series) => {
    const isHighlight = Boolean(series.highlight);
    const alpha = isHighlight ? 1 : lerp(0.95, 0.38, focusShift);
    const lineW = isHighlight ? lerp(5.5, 8.5, focusShift) : 4.2;

    const pts = series.points;
    const exactIndex = drawProg * (pts.length - 1);
    const maxIdx = Math.floor(exactIndex);
    const frac = exactIndex - maxIdx;

    const coords: Array<{ x: number; y: number; pct: number }> = [];
    for (let i = 0; i <= maxIdx; i++) {
      const px = chartX + (i / (pts.length - 1)) * chartW;
      coords.push({ x: px, y: pctToY(pts[i]), pct: pts[i] });
    }
    if (maxIdx < pts.length - 1) {
      const p0 = pts[maxIdx];
      const p1 = pts[maxIdx + 1];
      const interpPct = lerp(p0, p1, frac);
      const px = chartX + ((maxIdx + frac) / (pts.length - 1)) * chartW;
      coords.push({ x: px, y: pctToY(interpPct), pct: interpPct });
    }

    if (coords.length < 2) return;
    const tip = coords[coords.length - 1];
    livePctById[series.id] = tip.pct;

    ctx.save();
    ctx.globalAlpha = alpha;

    if (isHighlight) {
      const areaG = ctx.createLinearGradient(0, zeroY, 0, chartBot);
      areaG.addColorStop(0, 'rgba(251, 191, 36, 0.24)');
      areaG.addColorStop(1, 'rgba(251, 191, 36, 0)');
      ctx.beginPath();
      ctx.moveTo(coords[0].x, zeroY);
      coords.forEach((c) => ctx.lineTo(c.x, c.y));
      ctx.lineTo(tip.x, zeroY);
      ctx.closePath();
      ctx.fillStyle = areaG;
      ctx.fill();
    }

    ctx.strokeStyle = series.color;
    ctx.lineWidth = lineW;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    coords.forEach((c, idx) => {
      if (idx === 0) ctx.moveTo(c.x, c.y);
      else ctx.lineTo(c.x, c.y);
    });
    ctx.stroke();

    ctx.fillStyle = series.color;
    ctx.beginPath();
    ctx.arc(tip.x, tip.y, isHighlight ? 10 : 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    endpoints.push({
      id: series.id,
      color: series.color,
      highlight: isHighlight,
      alpha,
      tipX: tip.x,
      tipY: tip.y,
      pct: tip.pct,
      labelY: tip.y,
    });
  });

  // Resolve right-edge enlarged 31px endpoint labels with strict minGap = 44px + bottom clamp
  endpoints.sort((a, b) => a.tipY - b.tipY);
  for (let i = 1; i < endpoints.length; i++) {
    if (endpoints[i].labelY - endpoints[i - 1].labelY < 44) {
      endpoints[i].labelY = endpoints[i - 1].labelY + 44;
    }
  }
  const maxLabelY = chartBot + 10;
  if (endpoints.length > 0 && endpoints[endpoints.length - 1].labelY > maxLabelY) {
    endpoints[endpoints.length - 1].labelY = maxLabelY;
    for (let i = endpoints.length - 2; i >= 0; i--) {
      if (endpoints[i + 1].labelY - endpoints[i].labelY < 44) {
        endpoints[i].labelY = endpoints[i + 1].labelY - 44;
      }
    }
  }
  endpoints.forEach((ep) => {
    ctx.save();
    ctx.globalAlpha = ep.alpha;
    if (Math.abs(ep.labelY - ep.tipY) > 3) {
      ctx.strokeStyle = ep.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(ep.tipX + 8, ep.tipY);
      ctx.lineTo(ep.tipX + 24, ep.labelY);
      ctx.stroke();
    }
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.font = `900 ${ep.highlight ? 34 : 30}px ${MONO}, ${FONT}`;
    ctx.fillStyle = ep.color;
    const tipPctStr = `${ep.pct >= 0 ? '+' : ''}${ep.pct.toFixed(2)}%`;
    ctx.fillText(tipPctStr, ep.tipX + 28, ep.labelY);
    ctx.restore();
  });

  // A50 Callout strictly inside open upper-right region above 0% (zero curve collision)
  if (focusShift > 0.05) {
    const a50TipX = chartX + chartW;
    const a50TipY = pctToY(-1.92);
    const pulseR = 18 + 7 * Math.sin(localF * 0.24);
    const lineY = 382;

    ctx.save();
    ctx.globalAlpha = focusShift;
    ctx.strokeStyle = 'rgba(251, 191, 36, 0.78)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(a50TipX, a50TipY, pulseR, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = '#FBBF24';
    ctx.lineWidth = 2.8;
    ctx.beginPath();
    ctx.moveTo(a50TipX - 8, a50TipY - 12);
    ctx.lineTo(796, lineY);
    ctx.lineTo(360, lineY);
    ctx.stroke();

    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    ctx.font = `900 36px ${FONT}`;
    ctx.fillStyle = '#FBBF24';
    ctx.fillText('富时中国 A50 · 12,553 (-1.92%)', 1020, lineY - 46);
    ctx.font = `700 27px ${FONT}`;
    ctx.fillStyle = '#FEF3C7';
    ctx.fillText('唯一守在 -2% 内 · 较美日韩少跌 3%+ 显抗跌韧性', 1020, lineY - 10);
    ctx.restore();
  }

  // Middle Stage (y = 796..1176): Enlarged Asymmetric "4大外盘重挫阵营 vs A50 韧性盾牌"
  ctx.fillStyle = 'rgba(255,255,255,0.14)';
  ctx.fillRect(56, 794, width - 112, 1.5);

  const overseas = m.sparklines.filter((s) => !s.highlight);
  overseas.forEach((s, idx) => {
    const ry = 820 + idx * 88;
    const livePct = livePctById[s.id] ?? s.changePct;
    const barFrac = clamp(Math.abs(livePct) / 7.0, 0.04, 1);

    ctx.save();
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.font = `900 32px ${FONT}`;
    ctx.fillStyle = '#F8FAFC';
    ctx.fillText(s.name, 56, ry + 18);

    ctx.font = `600 24px ${MONO}, ${FONT}`;
    ctx.fillStyle = '#94A3B8';
    ctx.fillText(s.priceText, 56, ry + 54);

    // Wider progress gauge + big 38px % readout
    const gaugeX = 336;
    const gaugeW = 132;
    ctx.fillStyle = 'rgba(255,255,255,0.1)';
    roundRect(ctx, gaugeX, ry + 12, gaugeW, 13, 6);
    ctx.fill();
    ctx.fillStyle = livePct >= 0 ? '#F87171' : s.color;
    roundRect(ctx, gaugeX, ry + 12, Math.max(10, gaugeW * barFrac), 13, 6);
    ctx.fill();

    ctx.textAlign = 'right';
    ctx.font = `900 38px ${MONO}`;
    ctx.fillStyle = livePct >= 0 ? '#F87171' : s.color;
    ctx.fillText(`${livePct >= 0 ? '+' : ''}${livePct.toFixed(2)}%`, 620, ry + 22);
    ctx.restore();
  });

  // Right Highlight Panel: Enlarged A50 Golden Shield Comparison
  const a50Series = m.sparklines.find((s) => s.highlight)!;
  const a50LivePct = livePctById[a50Series.id] ?? a50Series.changePct;
  ctx.save();
  ctx.fillStyle = 'rgba(251, 191, 36, 0.1)';
  roundRect(ctx, 642, 814, 382, 342, 18);
  ctx.fill();
  ctx.strokeStyle = 'rgba(251, 191, 36, 0.58)';
  ctx.lineWidth = 2.5;
  ctx.stroke();

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `900 32px ${FONT}`;
  ctx.fillStyle = '#FEF3C7';
  ctx.fillText('富时中国 A50（相对锚）', 833, 868);

  const shieldScale = 1 + 0.025 * Math.sin(localF * 0.2);
  ctx.save();
  ctx.translate(833, 968);
  ctx.scale(shieldScale, shieldScale);
  ctx.font = `900 86px ${MONO}`;
  ctx.fillStyle = '#FBBF24';
  ctx.fillText(`${a50LivePct.toFixed(2)}%`, 0, 0);
  ctx.restore();

  ctx.font = `700 28px ${MONO}, ${FONT}`;
  ctx.fillStyle = '#F8FAFC';
  ctx.fillText(`报 ${a50Series.priceText} 点`, 833, 1052);

  ctx.fillStyle = 'rgba(251, 191, 36, 0.22)';
  roundRect(ctx, 666, 1088, 334, 48, 12);
  ctx.fill();
  ctx.font = `900 25px ${FONT}`;
  ctx.fillStyle = '#FDE68A';
  ctx.fillText('少跌 +3.1% ~ +4.5% 韧性锚', 833, 1112);
  ctx.restore();

  // Bottom Stage (y = 1196..1870): Enlarged Kinetic Gold-vs-Oil Seesaw Balance Scale
  const anomT = easeOutBack(clamp((localF - 86) / 30, 0, 1));
  const fadeT = easeOutCubic(clamp((localF - 78) / 16, 0, 1));
  const anomalies = getV2Anomalies();
  const gold = anomalies[0];
  const oil = anomalies[1];

  ctx.save();
  ctx.globalAlpha = fadeT;
  ctx.fillStyle = 'rgba(255,255,255,0.14)';
  ctx.fillRect(56, 1194, width - 112, 1.5);

  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.font = `900 34px ${FONT}`;
  ctx.fillStyle = '#FBBF24';
  ctx.fillText('大宗商品显著异动 · 金油冰火天平', 56, 1216);

  const pivotX = width / 2;
  const pivotY = 1574;
  const tiltAngle = -0.23 * anomT;

  ctx.fillStyle = '#334155';
  ctx.beginPath();
  ctx.moveTo(pivotX, pivotY + 4);
  ctx.lineTo(pivotX - 38, pivotY + 66);
  ctx.lineTo(pivotX + 38, pivotY + 66);
  ctx.closePath();
  ctx.fill();

  ctx.save();
  ctx.translate(pivotX, pivotY);
  ctx.rotate(tiltAngle);

  const beamG = ctx.createLinearGradient(-320, 0, 320, 0);
  beamG.addColorStop(0, '#34D399');
  beamG.addColorStop(0.5, '#94A3B8');
  beamG.addColorStop(1, '#F87171');
  ctx.fillStyle = beamG;
  roundRect(ctx, -320, -8, 640, 16, 8);
  ctx.fill();

  ctx.fillStyle = '#34D399';
  ctx.beginPath();
  ctx.arc(-280, -34, 28, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#F87171';
  ctx.beginPath();
  ctx.arc(280, -34, 28, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.fillStyle = '#FBBF24';
  ctx.beginPath();
  ctx.arc(pivotX, pivotY, 15, 0, Math.PI * 2);
  ctx.fill();

  if (gold) {
    const gPct = gold.changePct * clamp(anomT, 0, 1);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `900 72px ${MONO}`;
    ctx.fillStyle = '#34D399';
    ctx.fillText(`${gPct.toFixed(2)}%`, 264, 1694);

    ctx.font = `900 36px ${FONT}`;
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(`${gold.name} · ${gold.priceText}`, 264, 1758);

    ctx.font = `600 28px ${FONT}`;
    ctx.fillStyle = '#E2E8F0';
    ctx.fillText(gold.note, 264, 1804);
  }

  if (oil) {
    const oPct = oil.changePct * clamp(anomT, 0, 1);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `600 28px ${FONT}`;
    ctx.fillStyle = '#E2E8F0';
    ctx.fillText(oil.note, 816, 1290);

    ctx.font = `900 36px ${FONT}`;
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(`${oil.name} · ${oil.priceText}`, 816, 1338);

    ctx.font = `900 72px ${MONO}`;
    ctx.fillStyle = '#F87171';
    ctx.fillText(`+${oPct.toFixed(2)}%`, 816, 1404);
  }

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `600 26px ${FONT}`;
  ctx.fillStyle = '#94A3B8';
  ctx.fillText('仅展示 ±3% 以上显著异动（比特币 +0.38%、伦铜 -0.55% 已自动略去）', width / 2, height - 52);
  ctx.restore();
}

/**
 * SHOT 3 (270..419): Johnny Harris / Vox Paper Cutout + Non-Crossing Liquidity Suction Funnel
 */
function renderV2LiquidityFunnelScene(
  ctx: CanvasRenderingContext2D,
  frame: number,
  shotStart: number,
  img: HTMLImageElement | null | undefined
) {
  const { width, height } = INTEL_V2_SPEC;
  const localF = frame - shotStart;
  const d = INTEL_V2_DATA.event1Flow;

  ctx.fillStyle = '#F2ECE1';
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = 'rgba(24, 24, 27, 0.055)';
  ctx.lineWidth = 1;
  for (let gx = 0; gx <= width; gx += 48) {
    ctx.beginPath();
    ctx.moveTo(gx, 0);
    ctx.lineTo(gx, height);
    ctx.stroke();
  }
  for (let gy = 0; gy <= height; gy += 48) {
    ctx.beginPath();
    ctx.moveTo(0, gy);
    ctx.lineTo(width, gy);
    ctx.stroke();
  }

  drawHeaderProgress(ctx, frame, 'EVENT 01 · 抽血图谱', false);

  const enterT = easeOutCubic(clamp(localF / 16, 0, 1));
  ctx.save();
  ctx.globalAlpha = enterT;

  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.font = `800 28px ${FONT}`;
  ctx.fillStyle = '#B91C1C';
  ctx.fillText(d.kicker, 56, 134);

  ctx.font = `900 84px ${FONT}`;
  ctx.fillStyle = '#141417';
  ctx.fillText(d.bigHeadline, 56, 178);

  ctx.font = `700 32px ${FONT}`;
  ctx.fillStyle = '#52525B';
  ctx.fillText(d.subTag, 56, 286);

  // Left tilted paper cutout
  const cutY = 368;
  const cutW = 440;
  const cutH = 660;
  const cutEnter = easeOutCubic(clamp((localF - 4) / 18, 0, 1));
  ctx.save();
  ctx.translate(56 + cutW / 2, cutY + cutH / 2);
  ctx.rotate(lerp(-0.08, -0.025, cutEnter));
  ctx.scale(lerp(0.9, 1.0, cutEnter), lerp(0.9, 1.0, cutEnter));

  ctx.shadowColor = 'rgba(24, 24, 27, 0.22)';
  ctx.shadowBlur = 24;
  ctx.shadowOffsetY = 12;
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(-cutW / 2 - 12, -cutH / 2 - 12, cutW + 24, cutH + 24);
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  drawCroppedCoverImage(
    ctx,
    img,
    -cutW / 2,
    -cutH / 2,
    cutW,
    cutH,
    { x: 0.305, y: 0.085, w: 0.39, h: 0.83 },
    1.04
  );

  ctx.fillStyle = 'rgba(251, 191, 36, 0.65)';
  ctx.fillRect(-70, -cutH / 2 - 22, 140, 26);
  ctx.restore();

  // Right Non-Crossing 3-Lane Converging Flow Arrows into Anthropic Funnel
  const fx = 538;
  const funnelAnchorX = 815;
  const funnelAnchorY = 936;

  d.flows.forEach((flow, idx) => {
    const sy = 390 + idx * 134;
    const fT = easeOutCubic(clamp((localF - 14 - idx * 10) / 18, 0, 1));
    ctx.save();
    ctx.globalAlpha = enterT * fT;

    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.font = `800 28px ${FONT}`;
    ctx.fillStyle = '#18181B';
    ctx.fillText(flow.from, fx, sy);

    ctx.font = `900 30px ${MONO}, ${FONT}`;
    ctx.fillStyle = '#B91C1C';
    ctx.fillText(flow.pct, fx, sy + 38);

    // Non-crossing vertical-lane cubic Bezier pointing straight down into funnel top
    const flowProg = clamp((localF - 20 - idx * 8) / 28, 0, 1);
    const laneX = 860 + idx * 48; // 860, 908, 956 (separated lanes — never cross!)
    const p0x = fx + 244;
    const p0y = sy + 32;
    const c1x = laneX;
    const c1y = sy + 32;
    const c2x = laneX;
    const c2y = funnelAnchorY - 120;
    const p3x = funnelAnchorX - 50 + idx * 50; // 765, 815, 865
    const p3y = funnelAnchorY - 46;

    ctx.strokeStyle = '#D97706';
    ctx.lineWidth = 3.5;
    ctx.setLineDash([10, 8]);
    ctx.lineDashOffset = -localF * 3.4;
    ctx.beginPath();
    ctx.moveTo(p0x, p0y);
    ctx.bezierCurveTo(c1x, c1y, c2x, c2y, p3x, p3y);
    ctx.stroke();
    ctx.setLineDash([]);

    // Crisp downward arrowhead pointing directly into the funnel box
    ctx.fillStyle = '#D97706';
    ctx.beginPath();
    ctx.moveTo(p3x, p3y + 10);
    ctx.lineTo(p3x - 8, p3y - 6);
    ctx.lineTo(p3x + 8, p3y - 6);
    ctx.closePath();
    ctx.fill();

    // Moving glowing bead strictly following the cubic Bezier equation
    if (flowProg > 0) {
      const bt = (localF * 0.026 + idx * 0.33) % 1;
      const u = 1 - bt;
      const bx =
        u * u * u * p0x +
        3 * u * u * bt * c1x +
        3 * u * bt * bt * c2x +
        bt * bt * bt * p3x;
      const by =
        u * u * u * p0y +
        3 * u * u * bt * c1y +
        3 * u * bt * bt * c2y +
        bt * bt * bt * p3y;
      ctx.fillStyle = 'rgba(185, 28, 28, 0.24)';
      ctx.beginPath();
      ctx.arc(bx, by, 13, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#B91C1C';
      ctx.beginPath();
      ctx.arc(bx, by, 7, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  });

  // Anthropic Anchor Box
  const anchorT = easeOutBack(clamp((localF - 40) / 14, 0, 1));
  ctx.save();
  ctx.translate(funnelAnchorX, funnelAnchorY + 24);
  ctx.scale(anchorT, anchorT);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#18181B';
  roundRect(ctx, -184, -54, 368, 108, 12);
  ctx.fill();
  ctx.font = `900 30px ${FONT}`;
  ctx.fillStyle = '#FACC15';
  const fLines = d.funnelLabel.split('\n');
  ctx.fillText(fLines[0], 0, -18);
  ctx.fillStyle = '#FFFFFF';
  ctx.fillText(fLines[1], 0, 20);
  ctx.restore();

  // Bottom Reality + Conservative Observation Tip
  ctx.fillStyle = 'rgba(24, 24, 27, 0.16)';
  ctx.fillRect(56, 1138, width - 112, 2);

  const botT = easeOutCubic(clamp((localF - 46) / 16, 0, 1));
  ctx.save();
  ctx.globalAlpha = botT;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.font = `900 108px ${MONO}, ${FONT}`;
  ctx.fillStyle = '#059669';
  ctx.fillText('68 家跌停', 56, 1188);

  ctx.font = `800 34px ${FONT}`;
  ctx.fillStyle = '#3F3F46';
  ctx.fillText(d.ashareContext, 56, 1326);

  const hlT = easeOutCubic(clamp((localF - 66) / 22, 0, 1));
  const hlY = 1424;
  ctx.fillStyle = 'rgba(250, 204, 21, 0.65)';
  ctx.fillRect(56, hlY, (width - 112) * hlT, 162);

  ctx.font = `900 44px ${FONT}`;
  ctx.fillStyle = '#141417';
  ctx.fillText('流动性虹吸期 · 先观察前30分钟承接', 80, hlY + 24);
  ctx.fillStyle = '#B91C1C';
  ctx.fillText('操作宜偏防守，忌盲目接飞刀', 80, hlY + 90);

  ctx.font = `600 26px ${FONT}`;
  ctx.fillStyle = '#52525B';
  ctx.fillText('外盘抽血叠加缩量环境，控制仓位节奏更为稳妥', 56, hlY + 210);
  ctx.restore();

  ctx.restore();
}

/**
 * SHOT 4 (420..569): Dual-Focus Split Spotlight + Objective Takeaway
 */
function renderV2DualSpotlightScene(
  ctx: CanvasRenderingContext2D,
  frame: number,
  shotStart: number,
  img: HTMLImageElement | null | undefined
) {
  const { width, height } = INTEL_V2_SPEC;
  const localF = frame - shotStart;
  const d = INTEL_V2_DATA.event2Split;

  const switchT = easeOutCubic(clamp((localF - 70) / 14, 0, 1));
  const leftFocus = lerp(1.0, 0.24, switchT);
  const rightFocus = lerp(0.24, 1.0, switchT);

  ctx.save();

  ctx.fillStyle = '#0A111D';
  ctx.fillRect(-20, -20, width + 40, height + 40);

  drawHeaderProgress(ctx, frame, 'EVENT 02 · 聚光切分', true);

  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.font = `800 28px ${FONT}`;
  ctx.fillStyle = '#38BDF8';
  ctx.fillText(d.kicker, 56, 134);

  ctx.font = `900 54px ${FONT}`;
  ctx.fillStyle = '#FFFFFF';
  ctx.fillText(d.headline, 56, 178);

  const imgY = 286;
  const imgH = 590;
  const halfW = (width - 112) / 2;

  ctx.save();
  ctx.beginPath();
  ctx.rect(56, imgY, halfW, imgH);
  ctx.clip();
  ctx.globalAlpha = leftFocus;
  drawCroppedCoverImage(
    ctx,
    img,
    56,
    imgY,
    halfW,
    imgH,
    { x: 0, y: 0, w: 0.5, h: 1 },
    lerp(1.1, 1.0, switchT)
  );
  ctx.restore();

  ctx.save();
  ctx.beginPath();
  ctx.rect(56 + halfW, imgY, halfW, imgH);
  ctx.clip();
  ctx.globalAlpha = rightFocus;
  drawCroppedCoverImage(
    ctx,
    img,
    56 + halfW,
    imgY,
    halfW,
    imgH,
    { x: 0.5, y: 0, w: 0.5, h: 1 },
    lerp(1.0, 1.14, switchT)
  );
  ctx.restore();

  if (switchT > 0.1) {
    const cx = 56 + halfW + halfW * 0.52;
    const cy = imgY + imgH * 0.52;
    ctx.save();
    ctx.globalAlpha = switchT;
    ctx.strokeStyle = '#EF4444';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(cx, cy, lerp(180, 110, switchT), 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  ctx.save();
  ctx.globalAlpha = leftFocus;
  ctx.textAlign = 'left';
  ctx.font = `900 84px ${MONO}, ${FONT}`;
  ctx.fillStyle = '#FBBF24';
  ctx.fillText(d.leftFocus.bigNumber, 56, 946);

  ctx.font = `900 40px ${FONT}`;
  ctx.fillStyle = '#FFFFFF';
  ctx.fillText(d.leftFocus.title, 56, 1056);

  d.leftFocus.bullets.forEach((b, idx) => {
    ctx.font = `600 30px ${FONT}`;
    ctx.fillStyle = '#E2E8F0';
    ctx.fillText(`▲ ${b}`, 56, 1130 + idx * 52);
  });
  ctx.restore();

  ctx.fillStyle = 'rgba(255,255,255,0.14)';
  ctx.fillRect(56, 1280, width - 112, 2);

  ctx.save();
  ctx.globalAlpha = rightFocus;
  ctx.textAlign = 'left';
  ctx.font = `900 60px ${FONT}`;
  ctx.fillStyle = '#F87171';
  ctx.fillText(d.rightFocus.target, 56, 1336);

  ctx.font = `700 34px ${FONT}`;
  ctx.fillStyle = '#FECACA';
  drawWrappedText(ctx, d.rightFocus.warning, 56, 1430, width - 400, 50);

  if (localF >= 90) {
    const stT = clamp((localF - 90) / 8, 0, 1);
    const stScale = lerp(2.5, 1.0, easeOutBack(stT));
    ctx.save();
    ctx.translate(width - 210, 1466);
    ctx.rotate(-0.15);
    ctx.scale(stScale, stScale);
    roundRect(ctx, -148, -48, 296, 96, 12);
    ctx.fillStyle = 'rgba(185, 28, 28, 0.25)';
    ctx.fill();
    ctx.strokeStyle = '#EF4444';
    ctx.lineWidth = 6;
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `900 32px ${FONT}`;
    ctx.fillStyle = '#FCA5A5';
    ctx.fillText(d.rightFocus.stamp, 0, 0);
    ctx.restore();
  }
  ctx.restore();

  // Objective conservative takeaway footer
  ctx.save();
  ctx.globalAlpha = lerp(0.6, 1, switchT);
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  roundRect(ctx, 56, height - 230, width - 112, 122, 14);
  ctx.fill();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `800 32px ${FONT}`;
  ctx.fillStyle = '#FBBF24';
  ctx.fillText('规律总结：PCB 紧缺逻辑可保持跟踪', width / 2, height - 190);
  ctx.font = `700 29px ${FONT}`;
  ctx.fillStyle = '#E2E8F0';
  ctx.fillText('但在大盘科技承压环境下不宜盲目追高', width / 2, height - 140);
  ctx.restore();

  ctx.restore();
}

/**
 * SHOT 5 (570..719): Magazine Portrait + Floating Countdown Milestones + Conservative Note
 */
function renderV2RobotCountdownScene(
  ctx: CanvasRenderingContext2D,
  frame: number,
  shotStart: number,
  img: HTMLImageElement | null | undefined
) {
  const { width, height } = INTEL_V2_SPEC;
  const localF = frame - shotStart;
  const d = INTEL_V2_DATA.event3Portrait;

  ctx.fillStyle = '#FAF6EE';
  ctx.fillRect(0, 0, width, height);

  drawHeaderProgress(ctx, frame, 'EVENT 03 · 催化节奏', false);

  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.font = `800 28px ${FONT}`;
  ctx.fillStyle = '#D97706';
  ctx.fillText(d.kicker, 56, 134);

  ctx.font = `900 54px ${FONT}`;
  ctx.fillStyle = '#141417';
  ctx.fillText(d.headline, 56, 178);

  const imgY = 282;
  const imgH = 780;
  const panT = easeOutCubic(clamp(localF / 120, 0, 1));
  ctx.save();
  roundRect(ctx, 56, imgY, width - 112, imgH, 16);
  ctx.clip();
  drawCroppedCoverImage(
    ctx,
    img,
    56,
    imgY,
    width - 112,
    imgH,
    { x: 0.02, y: 0.02, w: 0.96, h: 0.96 },
    lerp(1.0, 1.07, panT),
    lerp(-0.03, 0.03, panT),
    0
  );
  ctx.restore();

  let my = 1104;
  d.milestones.forEach((m, idx) => {
    const mT = easeOutCubic(clamp((localF - 14 - idx * 22) / 14, 0, 1));
    ctx.save();
    ctx.globalAlpha = mT;
    ctx.translate(lerp(60, 0, mT), 0);

    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.font = `900 54px ${MONO}, ${FONT}`;
    ctx.fillStyle = idx === 1 ? '#C8342A' : '#B45309';
    ctx.fillText(m.num, 56, my + 42);

    ctx.font = `700 32px ${FONT}`;
    ctx.fillStyle = '#18181B';
    ctx.fillText(m.desc, 298, my + 42);

    ctx.fillStyle = 'rgba(24, 24, 27, 0.12)';
    ctx.fillRect(56, my + 94, width - 112, 1.5);
    ctx.restore();
    my += 116;
  });

  const ruleT = easeOutCubic(clamp((localF - 76) / 16, 0, 1));
  ctx.save();
  ctx.globalAlpha = ruleT;
  ctx.fillStyle = '#18181B';
  roundRect(ctx, 56, height - 320, width - 112, 168, 16);
  ctx.fill();

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `900 44px ${FONT}`;
  ctx.fillStyle = '#FACC15';
  ctx.fillText('催化节点可跟踪 · 缩量忌追高开一致', width / 2, height - 258);

  ctx.font = `600 26px ${FONT}`;
  ctx.fillStyle = '#CBD5E1';
  ctx.fillText('昨日机器人 2 板参考：毅昌科技 / 襄阳轴承（注意分歧风险）', width / 2, height - 194);
  ctx.restore();
}

/**
 * SHOT 6 (720..959): Objective Summary Matrix + Dual-Scenario Intraday Divergence (No Subjective Prediction)
 */
function renderV2ForecastVerdictScene(
  ctx: CanvasRenderingContext2D,
  frame: number,
  shotStart: number
) {
  const { width, height } = INTEL_V2_SPEC;
  const localF = frame - shotStart;
  const d = INTEL_V2_DATA.summaryFinale;

  ctx.fillStyle = '#0D1016';
  ctx.fillRect(0, 0, width, height);

  drawHeaderProgress(ctx, frame, 'SUMMARY · 客观规律', true);

  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.font = `900 58px ${FONT}`;
  ctx.fillStyle = '#FFFFFF';
  ctx.fillText(d.title, 56, 134);

  // Upper Half: Concise Bull vs Bear Objective Matrix
  const colT = easeOutCubic(clamp(localF / 18, 0, 1));
  ctx.save();
  ctx.globalAlpha = colT;
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.fillRect(56, 228, width - 112, 1.5);

  ctx.font = `900 30px ${FONT}`;
  ctx.fillStyle = '#F87171';
  ctx.fillText('▲ 客观支撑线索', 56, 254);
  d.bulls.forEach((b, idx) => {
    ctx.font = `700 28px ${FONT}`;
    ctx.fillStyle = '#F8FAFC';
    drawWrappedText(ctx, `0${idx + 1}  ${b}`, 56, 314 + idx * 96, 446, 38);
  });

  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.fillRect(width / 2, 250, 1.5, 368);

  ctx.font = `900 30px ${FONT}`;
  ctx.fillStyle = '#34D399';
  ctx.fillText('▼ 客观承压风险', width / 2 + 28, 254);
  d.bears.forEach((b, idx) => {
    ctx.font = `700 28px ${FONT}`;
    ctx.fillStyle = '#E2E8F0';
    drawWrappedText(ctx, `0${idx + 1}  ${b}`, width / 2 + 28, 314 + idx * 96, 446, 38);
  });
  ctx.restore();

  // Lower Half: Dual-Scenario Objective Divergence Graph (10:00 Observation Window)
  const fx = 86;
  const fw = 908;
  const fTop = 758;
  const fBot = 1272;
  const pctToY = (pct: number) => lerp(fBot, fTop, clamp((pct - -2.8) / 3.4, 0, 1));

  ctx.save();
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.fillRect(56, 646, width - 112, 1.5);

  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.font = `800 28px ${FONT}`;
  ctx.fillStyle = '#FBBF24';
  ctx.fillText('11.20 早盘双情景演化对照（10:00 前30分钟量能为分水岭）', 56, 676);

  // Zero reference line (y = 850)
  const zeroY = pctToY(0);
  ctx.strokeStyle = 'rgba(255,255,255,0.22)';
  ctx.setLineDash([8, 6]);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(fx, zeroY);
  ctx.lineTo(fx + fw, zeroY);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.textBaseline = 'bottom';
  ctx.font = `600 22px ${MONO}`;
  ctx.fillStyle = '#94A3B8';
  ctx.fillText('平盘 0%', fx, zeroY - 10);

  // Animate curve progress (localF 20..108)
  const pathProg = easeOutCubic(clamp((localF - 20) / 88, 0.05, 1));
  const timeLabels = d.scenarioTimeLabels;
  const xAt = (idx: number) => fx + (idx / (timeLabels.length - 1)) * fw;

  // Phase 1: Shared Opening Base (09:30 -> 10:00, progress 0..0.28)
  const baseFrac = clamp(pathProg / 0.28, 0, 1);
  const x0 = xAt(0);
  const y0 = pctToY(d.scenarioBase[0]);
  const x1 = xAt(1);
  const y1 = pctToY(d.scenarioBase[1]);

  ctx.strokeStyle = '#E2E8F0';
  ctx.lineWidth = 6;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(lerp(x0, x1, baseFrac), lerp(y0, y1, baseFrac));
  ctx.stroke();

  // Opening point label (09:30)
  ctx.fillStyle = '#E2E8F0';
  ctx.beginPath();
  ctx.arc(x0, y0, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.textAlign = 'left';
  ctx.textBaseline = 'bottom';
  ctx.font = `700 23px ${FONT}`;
  ctx.fillStyle = '#E2E8F0';
  ctx.fillText('低开消化外盘抛压', x0, y0 - 18);

  // Phase 2: Branching at 10:00 (progress 0.28..1.0)
  if (pathProg > 0.28) {
    const branchProg = clamp((pathProg - 0.28) / 0.72, 0, 1);

    const drawBranch = (
      vals: number[],
      color: string,
      dashed: boolean
    ): { endX: number; endY: number } => {
      const exactIdx = branchProg * (vals.length - 1);
      const maxI = Math.floor(exactIdx);
      const frac = exactIdx - maxI;
      const pts: Array<{ x: number; y: number }> = [];
      for (let i = 0; i <= maxI; i++) {
        pts.push({ x: xAt(i + 1), y: pctToY(vals[i]) });
      }
      if (maxI < vals.length - 1) {
        const nx = lerp(xAt(maxI + 1), xAt(maxI + 2), frac);
        const ny = pctToY(lerp(vals[maxI], vals[maxI + 1], frac));
        pts.push({ x: nx, y: ny });
      }

      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = dashed ? 4.5 : 5.5;
      if (dashed) ctx.setLineDash([10, 8]);
      ctx.lineJoin = 'round';
      ctx.beginPath();
      pts.forEach((p, idx) => {
        if (idx === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      });
      ctx.stroke();
      ctx.setLineDash([]);

      const tip = pts[pts.length - 1];
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(tip.x, tip.y, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      return { endX: tip.x, endY: tip.y };
    };

    const steadyTip = drawBranch(d.scenarioSteady, '#FBBF24', false);
    const weakTip = drawBranch(d.scenarioWeak, '#34D399', true);

    if (branchProg > 0.7) {
      const lAlpha = clamp((branchProg - 0.7) / 0.3, 0, 1);
      ctx.save();
      ctx.globalAlpha = lAlpha;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'bottom';
      ctx.font = `800 24px ${FONT}`;
      ctx.fillStyle = '#FBBF24';
      ctx.fillText('情景 A：承接稳住 → 局部结构轮动', steadyTip.endX, steadyTip.endY - 18);

      ctx.textBaseline = 'top';
      ctx.fillStyle = '#34D399';
      ctx.fillText('情景 B：缩量延续 → 偏防守弱震荡', weakTip.endX, weakTip.endY + 18);
      ctx.restore();
    }

    // 10:00 Observation Window Pivot Marker
    ctx.fillStyle = '#F87171';
    ctx.beginPath();
    ctx.arc(x1, y1, 10, 0, Math.PI * 2);
    ctx.fill();
    const pRing = 18 + 6 * Math.sin(localF * 0.24);
    ctx.strokeStyle = 'rgba(248, 113, 113, 0.72)';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(x1, y1, pRing, 0, Math.PI * 2);
    ctx.stroke();

    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    ctx.font = `800 23px ${FONT}`;
    ctx.fillStyle = '#FCA5A5';
    ctx.fillText('10:00 量能观察窗', x1 - 12, y1 + 26);
  }

  // Bottom Time Axis Ticks
  timeLabels.forEach((lbl, idx) => {
    const px = xAt(idx);
    ctx.textAlign = idx === 0 ? 'left' : idx === timeLabels.length - 1 ? 'right' : 'center';
    ctx.textBaseline = 'top';
    ctx.font = `700 22px ${MONO}`;
    ctx.fillStyle = '#94A3B8';
    ctx.fillText(lbl, px, fBot + 16);
  });
  ctx.restore();

  // Final Conservative Verdict Footer
  const vT = easeOutCubic(clamp((localF - 74) / 18, 0, 1));
  ctx.save();
  ctx.globalAlpha = vT;
  ctx.fillStyle = 'rgba(251, 191, 36, 0.09)';
  roundRect(ctx, 56, 1408, width - 112, 330, 18);
  ctx.fill();
  ctx.strokeStyle = 'rgba(251, 191, 36, 0.5)';
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `900 48px ${FONT}`;
  ctx.fillStyle = '#FFFFFF';
  ctx.fillText(d.verdictHeadline, width / 2, 1492);

  ctx.font = `800 34px ${FONT}`;
  ctx.fillStyle = '#FBBF24';
  ctx.fillText(d.verdictAction, width / 2, 1580);

  ctx.font = `600 26px ${FONT}`;
  ctx.fillStyle = '#94A3B8';
  ctx.fillText('客观市场规律梳理 · 仅供信息参考，不构成任何投资建议', width / 2, 1672);
  ctx.restore();
}

export function renderIntelV2VideoFrame(
  ctx: CanvasRenderingContext2D,
  frame: number,
  images: LoadedIntelImages
) {
  const f = clamp(Math.floor(frame), 0, INTEL_V2_SPEC.totalFrames - 1);
  const shot = getIntelV2ShotAtFrame(f);

  switch (shot.kind) {
    case 'v2_keyday_video_intro':
      renderV2KeyDayVideoScene(ctx, f, shot.startFrame, images);
      break;
    case 'v2_indices_board':
      renderV2IndicesBoardScene(ctx, f, shot.startFrame);
      break;
    case 'v2_liquidity_funnel':
      renderV2LiquidityFunnelScene(ctx, f, shot.startFrame, images.eventAnthropic);
      break;
    case 'v2_dual_spotlight':
      renderV2DualSpotlightScene(ctx, f, shot.startFrame, images.eventPcb);
      break;
    case 'v2_robot_countdown':
      renderV2RobotCountdownScene(
        ctx,
        f,
        shot.startFrame,
        images.eventMuskRealKitchen ?? images.eventRobot
      );
      break;
    case 'v2_forecast_verdict':
    default:
      renderV2ForecastVerdictScene(ctx, f, shot.startFrame);
      break;
  }
}
