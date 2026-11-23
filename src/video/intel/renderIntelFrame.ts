import { clamp, easeOutCubic, lerp } from '../timeline';
import {
  INTEL_1120_DATA,
  INTEL_VIDEO_SPEC,
  selectMarketAnomalies,
  type MarketTickerItem,
} from './intelData';
import { getIntelShotAtFrame } from './intelTimeline';

export interface LoadedIntelImages {
  memeKeyDay?: HTMLImageElement | null;
  eventAnthropic?: HTMLImageElement | null;
  eventPcb?: HTMLImageElement | null;
  eventRobot?: HTMLImageElement | null;
  realNyseClap?: HTMLImageElement | null;
  realTraderGesturing?: HTMLImageElement | null;
  realTraderShocked?: HTMLImageElement | null;
  eventMuskRealKitchen?: HTMLImageElement | null;
  realKeyDayVideo?: HTMLVideoElement | null;
  realKeyDayFrames?: HTMLCanvasElement[] | null;
  realKeyDayPoster?: HTMLImageElement | null;
}

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
  const lines = wrapLines(ctx, text, maxWidth);
  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], x, y + i * lineHeight);
  }
  return y + lines.length * lineHeight;
}

function drawCroppedCoverImage(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement | null | undefined,
  dx: number,
  dy: number,
  dw: number,
  dh: number,
  cropFrac = { x: 0, y: 0, w: 1, h: 1 },
  zoom = 1,
  panX = 0,
  panY = 0
) {
  if (!img || !img.complete || img.naturalWidth === 0) {
    ctx.fillStyle = '#181C24';
    ctx.fillRect(dx, dy, dw, dh);
    return;
  }
  const sx = img.naturalWidth * cropFrac.x;
  const sy = img.naturalHeight * cropFrac.y;
  const sw = img.naturalWidth * cropFrac.w;
  const sh = img.naturalHeight * cropFrac.h;

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

function drawTopProgressBar(
  ctx: CanvasRenderingContext2D,
  frame: number,
  label: string,
  darkTheme: boolean
) {
  const { width } = INTEL_VIDEO_SPEC;
  const progress = clamp(frame / (INTEL_VIDEO_SPEC.totalFrames - 1), 0, 1);
  ctx.save();
  ctx.fillStyle = darkTheme ? 'rgba(255,255,255,0.16)' : 'rgba(24,24,27,0.14)';
  ctx.fillRect(56, 48, width - 112, 4);
  ctx.fillStyle = darkTheme ? '#FBBF24' : '#C8342A';
  ctx.fillRect(56, 48, Math.max(14, (width - 112) * progress), 4);

  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.font = `700 25px ${FONT}`;
  ctx.fillStyle = darkTheme ? 'rgba(248,250,252,0.85)' : 'rgba(24,24,27,0.78)';
  ctx.fillText(INTEL_1120_DATA.seriesTitle, 56, 86);

  ctx.textAlign = 'right';
  ctx.font = `700 23px ${MONO}, ${FONT}`;
  ctx.fillStyle = darkTheme ? '#FBBF24' : '#C8342A';
  ctx.fillText(label, width - 56, 86);
  ctx.restore();
}

/**
 * SHOT 1 (0..99): Viral "今天很关键!!" Meme Opening
 * Handheld jitter -> 0.6s Freeze-frame Slam + Flash + Comic Speed Rays + Variety Captions -> Whip Wipe
 */
function renderMemeHookScene(
  ctx: CanvasRenderingContext2D,
  frame: number,
  img: HTMLImageElement | null | undefined
) {
  const { width, height } = INTEL_VIDEO_SPEC;
  const localF = frame;
  const d = INTEL_1120_DATA.memeOpening;

  ctx.fillStyle = '#070A0D';
  ctx.fillRect(0, 0, width, height);

  // Camera motion: pre-slam micro shake (0..17), freeze punch (18..99)
  const isSlam = localF >= 18;
  const slamT = isSlam ? clamp((localF - 18) / 10, 0, 1) : 0;
  const zoom = !isSlam
    ? 1.02 + Math.sin(localF * 0.45) * 0.015
    : lerp(1.22, 1.13, easeOutCubic(slamT));

  const jitterX = !isSlam
    ? Math.sin(localF * 1.9) * 9
    : localF < 26
      ? Math.sin(localF * 3.1) * (26 - localF) * 1.6
      : 0;
  const jitterY = !isSlam
    ? Math.cos(localF * 2.3) * 7
    : localF < 26
      ? Math.cos(localF * 2.7) * (26 - localF) * 1.4
      : 0;

  // Crop inner 76% vertically so top/bottom black frame margins in raw 9:16 photo disappear
  ctx.save();
  ctx.translate(jitterX, jitterY);
  drawCroppedCoverImage(
    ctx,
    img,
    -20,
    -20,
    width + 40,
    height + 40,
    { x: 0.02, y: 0.13, w: 0.96, h: 0.74 },
    zoom
  );

  // Pulsing eerie green stock-screen glow from bottom
  const greenPulse = 0.22 + 0.12 * Math.sin(localF * 0.35);
  const gGlow = ctx.createRadialGradient(width * 0.52, height * 0.62, 40, width * 0.52, height * 0.52, 720);
  gGlow.addColorStop(0, `rgba(16, 185, 129, ${greenPulse.toFixed(3)})`);
  gGlow.addColorStop(1, 'rgba(7, 10, 13, 0)');
  ctx.fillStyle = gGlow;
  ctx.fillRect(0, 0, width, height);
  ctx.restore();

  // Top & Bottom Scrims
  const topGrad = ctx.createLinearGradient(0, 0, 0, 420);
  topGrad.addColorStop(0, 'rgba(7, 10, 13, 0.88)');
  topGrad.addColorStop(1, 'rgba(7, 10, 13, 0)');
  ctx.fillStyle = topGrad;
  ctx.fillRect(0, 0, width, 420);

  const botGrad = ctx.createLinearGradient(0, height - 620, 0, height);
  botGrad.addColorStop(0, 'rgba(7, 10, 13, 0)');
  botGrad.addColorStop(0.45, 'rgba(7, 10, 13, 0.78)');
  botGrad.addColorStop(1, 'rgba(7, 10, 13, 0.96)');
  ctx.fillStyle = botGrad;
  ctx.fillRect(0, height - 620, width, 620);

  // Radial comic speed lines after freeze-frame slam
  if (isSlam) {
    ctx.save();
    ctx.translate(width / 2, height * 0.44);
    const rayAlpha = clamp(1 - (localF - 18) / 70, 0.18, 0.55);
    ctx.strokeStyle = `rgba(251, 191, 36, ${rayAlpha.toFixed(3)})`;
    for (let i = 0; i < 28; i++) {
      const ang = (i / 28) * Math.PI * 2 + localF * 0.015;
      const rIn = 340 + (i % 3) * 45;
      const rOut = 920;
      ctx.lineWidth = i % 2 === 0 ? 5 : 2.5;
      ctx.beginPath();
      ctx.moveTo(Math.cos(ang) * rIn, Math.sin(ang) * rIn);
      ctx.lineTo(Math.cos(ang) * rOut, Math.sin(ang) * rOut);
      ctx.stroke();
    }
    ctx.restore();
  }

  // Top caption & giant slam title ("今天很关键!!")
  drawTopProgressBar(ctx, frame, 'OPENING · 梗现场', true);

  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `700 34px ${FONT}`;
  ctx.fillStyle = '#34D399';
  ctx.fillText(d.topCaption, width / 2, 182);

  // Slam scale overshoot at frame 18 (also shown gently at frame 0..17 as pre-build so frame 0 reads clearly!)
  const slamScale = isSlam ? easeOutBack(clamp((localF - 18) / 10, 0, 1)) : 0.88 + 0.04 * Math.sin(localF * 0.5);
  const rot = isSlam ? lerp(-0.08, -0.025, clamp((localF - 18) / 10, 0, 1)) : 0;
  ctx.translate(width / 2, 290);
  ctx.rotate(rot);
  ctx.scale(slamScale, slamScale);

  // Comic double outline headline
  ctx.font = `900 124px ${FONT}`;
  ctx.lineWidth = 18;
  ctx.strokeStyle = '#111827';
  ctx.strokeText(d.slamHeadline, 0, 0);
  ctx.fillStyle = isSlam ? '#FACC15' : '#FFFFFF';
  ctx.fillText(d.slamHeadline, 0, 0);
  ctx.restore();

  // Bottom viral variety-show subtitles
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  if (localF >= 24 && localF < 60) {
    const p1 = easeOutBack(clamp((localF - 24) / 8, 0, 1));
    ctx.translate(width / 2, height - 340);
    ctx.scale(p1, p1);
    ctx.font = `900 54px ${FONT}`;
    ctx.lineWidth = 10;
    ctx.strokeStyle = '#070A0D';
    ctx.strokeText(d.subLine1, 0, 0);
    ctx.fillStyle = '#34D399';
    ctx.fillText(d.subLine1, 0, 0);
  } else if (localF >= 60) {
    const p2 = easeOutBack(clamp((localF - 60) / 8, 0, 1));
    ctx.translate(width / 2, height - 360);
    ctx.scale(p2, p2);
    ctx.font = `900 46px ${FONT}`;
    ctx.lineWidth = 10;
    ctx.strokeStyle = '#070A0D';
    const lines = wrapLines(ctx, d.subLine2, width - 140);
    lines.forEach((ln, idx) => {
      ctx.strokeText(ln, 0, idx * 66);
      ctx.fillStyle = idx === 1 ? '#FACC15' : '#FFFFFF';
      ctx.fillText(ln, 0, idx * 66);
    });
  }
  ctx.restore();

  // Freeze-frame camera flash (frames 18..21)
  if (localF >= 18 && localF <= 22) {
    const flashAlpha = (1 - (localF - 18) / 4) * 0.72;
    ctx.fillStyle = `rgba(255, 255, 255, ${flashAlpha.toFixed(3)})`;
    ctx.fillRect(0, 0, width, height);
  }

  // Upward whip-wipe transition at end of Shot 1 (frames 90..99)
  if (localF >= 90) {
    const wipeT = easeOutCubic((localF - 90) / 9);
    ctx.fillStyle = '#0C1017';
    ctx.fillRect(0, height * (1 - wipeT), width, height * wipeT + 8);
  }
}

/**
 * Helper to draw one Market Row with animated count-up percentage & expanding bar
 */
function drawMarketRow(
  ctx: CanvasRenderingContext2D,
  item: MarketTickerItem,
  x: number,
  y: number,
  w: number,
  animT: number,
  highlightA50 = false
) {
  const isUp = item.changePct >= 0;
  // China convention: Red for up, Emerald green for down
  const color = isUp ? '#F87171' : '#34D399';
  const currentPct = item.changePct * animT;
  const pctStr = `${currentPct >= 0 ? '+' : ''}${currentPct.toFixed(2)}%`;

  ctx.save();
  if (highlightA50) {
    roundRect(ctx, x - 20, y - 16, w + 40, 156, 16);
    ctx.fillStyle = 'rgba(251, 191, 36, 0.08)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(251, 191, 36, 0.5)';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  // Name & sub-code
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.font = `800 36px ${FONT}`;
  ctx.fillStyle = '#F8FAFC';
  ctx.fillText(item.name, x, y);

  ctx.font = `500 24px ${MONO}, ${FONT}`;
  ctx.fillStyle = highlightA50 ? '#FBBF24' : '#94A3B8';
  ctx.fillText(`${item.code}  ·  现价 ${item.priceText}`, x, y + 48);

  // Right-aligned big animated percentage
  ctx.textAlign = 'right';
  ctx.font = `900 48px ${MONO}, ${FONT}`;
  ctx.fillStyle = color;
  ctx.fillText(pctStr, x + w, y + 2);

  // Animated progress bar under row
  const barY = y + 86;
  const barW = w;
  ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
  ctx.fillRect(x, barY, barW, 8);
  const fillRatio = clamp((Math.abs(currentPct) / 7.5) * 1.0, 0.06, 1);
  ctx.fillStyle = color;
  ctx.fillRect(x, barY, barW * fillRatio, 8);

  ctx.textAlign = 'left';
  ctx.font = `500 23px ${FONT}`;
  ctx.fillStyle = '#CBD5E1';
  ctx.fillText(item.note, x, barY + 18);
  ctx.restore();
}

/**
 * SHOT 2 (100..259): Global Overnight + 08:00 Asia Open + FTSE A50 + Commodity Anomaly Radar
 */
function renderGlobalMarketsScene(ctx: CanvasRenderingContext2D, frame: number) {
  const { width, height } = INTEL_VIDEO_SPEC;
  const localF = frame - 100;
  const m = INTEL_1120_DATA.markets;

  ctx.fillStyle = '#0C1017';
  ctx.fillRect(0, 0, width, height);

  // Faint radar scan vertical shimmer
  const scanY = ((localF * 18) % (height + 240)) - 120;
  const scanGrad = ctx.createLinearGradient(0, scanY - 80, 0, scanY + 80);
  scanGrad.addColorStop(0, 'rgba(56, 189, 248, 0)');
  scanGrad.addColorStop(0.5, 'rgba(56, 189, 248, 0.05)');
  scanGrad.addColorStop(1, 'rgba(56, 189, 248, 0)');
  ctx.fillStyle = scanGrad;
  ctx.fillRect(0, 0, width, height);

  drawTopProgressBar(ctx, frame, 'GLOBAL · 实盘异动榜', true);

  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.font = `900 54px ${FONT}`;
  ctx.fillStyle = '#FFFFFF';
  ctx.fillText(m.headerTitle, 56, 136);

  ctx.font = `500 27px ${FONT}`;
  ctx.fillStyle = '#94A3B8';
  ctx.fillText(m.headerSubtitle, 56, 206);

  // Section 1: 美股昨夜 (frames 4..34 animate)
  const usT = easeOutCubic(clamp((localF - 4) / 30, 0, 1));
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.fillRect(56, 260, width - 112, 1.5);
  ctx.font = `800 26px ${FONT}`;
  ctx.fillStyle = '#38BDF8';
  ctx.fillText('01 / 隔夜美股收盘（科技重挫）', 56, 278);

  m.usIndices.forEach((item, idx) => {
    const itemT = easeOutCubic(clamp((localF - 6 - idx * 8) / 26, 0, 1));
    ctx.save();
    ctx.globalAlpha = easeOutCubic(clamp((localF - idx * 5) / 12, 0, 1));
    drawMarketRow(ctx, item, 56, 326 + idx * 142, width - 112, itemT);
    ctx.restore();
  });

  // Section 2: 今晨 08:00 亚太开盘至今 (日经 + 韩国 + 富时A50)
  const asiaAlpha = easeOutCubic(clamp((localF - 22) / 14, 0, 1));
  ctx.save();
  ctx.globalAlpha = asiaAlpha;
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.fillRect(56, 616, width - 112, 1.5);
  ctx.font = `800 26px ${FONT}`;
  ctx.fillStyle = '#38BDF8';
  ctx.fillText('02 / 今晨 08:00 开盘至今（日韩 & A50）', 56, 634);

  m.asiaIndices.forEach((item, idx) => {
    const itemT = easeOutCubic(clamp((localF - 26 - idx * 8) / 26, 0, 1));
    drawMarketRow(ctx, item, 56, 682 + idx * 142, width - 112, itemT);
  });

  const a50T = easeOutCubic(clamp((localF - 44) / 26, 0, 1));
  drawMarketRow(ctx, m.chinaBellwether, 56, 982, width - 112, a50T, true);
  ctx.restore();

  // Section 3: 大宗商品【仅异动展示】（Gold -4.85% / Oil +3.40%, Bitcoin skipped!)
  const anomalies = selectMarketAnomalies(m.commodityWatchlist, 2.5);
  const anomAlpha = easeOutCubic(clamp((localF - 58) / 16, 0, 1));
  ctx.save();
  ctx.globalAlpha = anomAlpha;
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.fillRect(56, 1156, width - 112, 1.5);

  ctx.font = `800 28px ${FONT}`;
  ctx.fillStyle = '#FBBF24';
  ctx.fillText('03 / 大宗商品重大异动追踪（±3% 以上）', 56, 1174);

  anomalies.forEach((item, idx) => {
    const itemT = easeOutCubic(clamp((localF - 66 - idx * 10) / 24, 0, 1));
    const pulse = 0.5 + 0.5 * Math.sin(localF * 0.25 + idx);
    const rowY = 1232 + idx * 164;

    roundRect(ctx, 56, rowY, width - 112, 144, 16);
    ctx.fillStyle = item.changePct < 0 ? 'rgba(52, 211, 153, 0.08)' : 'rgba(248, 113, 113, 0.09)';
    ctx.fill();
    ctx.strokeStyle =
      item.changePct < 0
        ? `rgba(52, 211, 153, ${(0.35 + pulse * 0.35).toFixed(2)})`
        : `rgba(248, 113, 113, ${(0.35 + pulse * 0.35).toFixed(2)})`;
    ctx.lineWidth = 2;
    ctx.stroke();

    const pctNow = item.changePct * itemT;
    const pctStr = `${pctNow >= 0 ? '+' : ''}${pctNow.toFixed(2)}%`;
    const color = item.changePct >= 0 ? '#F87171' : '#34D399';

    ctx.textAlign = 'left';
    ctx.font = `900 38px ${FONT}`;
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(`${item.name}`, 84, rowY + 22);

    ctx.font = `600 25px ${MONO}, ${FONT}`;
    ctx.fillStyle = '#CBD5E1';
    ctx.fillText(`${item.code}  ·  ${item.priceText}`, 84, rowY + 70);

    ctx.textAlign = 'right';
    ctx.font = `900 50px ${MONO}, ${FONT}`;
    ctx.fillStyle = color;
    ctx.fillText(pctStr, width - 84, rowY + 24);

    ctx.textAlign = 'left';
    ctx.font = `500 24px ${FONT}`;
    ctx.fillStyle = '#E2E8F0';
    ctx.fillText(item.note, 84, rowY + 104);
  });

  // Footer note explicitly confirming calm assets (Bitcoin) are intentionally omitted
  ctx.textAlign = 'center';
  ctx.font = `500 24px ${FONT}`;
  ctx.fillStyle = '#64748B';
  ctx.fillText(m.calmSkippedNote, width / 2, height - 112);
  ctx.restore();

  // Keep Section 1 visible inside usT guard
  void usT;
}

/**
 * SHOT 3 (260..409): Warm Newsprint Tabloid Frontpage — Event 01 (Anthropic Liquidity Storm)
 * Motion: Newspaper tilt-slide entrance -> Red-pen highlighter underline sweeps
 */
function renderEventTabloidScene(
  ctx: CanvasRenderingContext2D,
  frame: number,
  img: HTMLImageElement | null | undefined
) {
  const { width, height } = INTEL_VIDEO_SPEC;
  const localF = frame - 260;
  const d = INTEL_1120_DATA.eventTabloid;

  // Warm archival newsprint backdrop
  ctx.fillStyle = '#F4EFE6';
  ctx.fillRect(0, 0, width, height);

  // Subtle paper grain rules
  ctx.fillStyle = 'rgba(24, 24, 27, 0.03)';
  for (let y = 140; y < height; y += 36) {
    ctx.fillRect(0, y, width, 1);
  }

  // Newspaper sheet slide & tilt settle from right
  const enterT = easeOutCubic(clamp(localF / 18, 0, 1));
  const slideX = lerp(420, 0, enterT);
  const tilt = lerp(0.055, 0, enterT);

  ctx.save();
  ctx.translate(width / 2 + slideX, height / 2);
  ctx.rotate(tilt);
  ctx.translate(-width / 2, -height / 2);

  drawTopProgressBar(ctx, frame, 'EVENT 01 · 头版观察', false);

  // Newspaper Double Masthead Rule
  ctx.fillStyle = '#18181B';
  ctx.fillRect(56, 134, width - 112, 5);
  ctx.fillRect(56, 144, width - 112, 1.5);

  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.font = `800 26px ${FONT}`;
  ctx.fillStyle = '#B91C1C';
  ctx.fillText(d.kicker, 56, 174);

  ctx.textAlign = 'right';
  ctx.font = `600 24px ${MONO}, ${FONT}`;
  ctx.fillStyle = '#52525B';
  ctx.fillText(d.editionText, width - 56, 174);

  ctx.fillStyle = '#18181B';
  ctx.fillRect(56, 200, width - 112, 2);

  // Giant Editorial Newspaper Headline (fits cleanly on 1 line)
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.font = `900 62px ${FONT}`;
  ctx.fillStyle = '#141417';
  const headEndY = drawWrappedText(ctx, d.headline, 56, 224, width - 112, 82);

  // Editorial Print Illustration (inward crop removes outer dark matte completely)
  const artY = headEndY + 26;
  const artH = 710;
  ctx.save();
  roundRect(ctx, 56, artY, width - 112, artH, 10);
  ctx.clip();
  const imgReveal = easeOutCubic(clamp((localF - 6) / 24, 0, 1));
  drawCroppedCoverImage(
    ctx,
    img,
    56,
    artY,
    width - 112,
    artH,
    { x: 0.305, y: 0.085, w: 0.39, h: 0.83 },
    lerp(1.08, 1.0, imgReveal)
  );
  ctx.restore();
  ctx.strokeStyle = '#18181B';
  ctx.lineWidth = 2.5;
  ctx.strokeRect(56, artY, width - 112, artH);

  // Cause & Impact News Columns below artwork
  const colY = artY + artH + 42;

  // Block 1: 前因
  const b1T = easeOutCubic(clamp((localF - 24) / 14, 0, 1));
  ctx.save();
  ctx.globalAlpha = b1T;
  ctx.font = `900 34px ${FONT}`;
  ctx.fillStyle = '#B91C1C';
  ctx.fillText(d.causeTitle, 56, colY);

  ctx.font = `600 33px ${FONT}`;
  ctx.fillStyle = '#27272A';
  const b1EndY = drawWrappedText(ctx, d.causeBody, 56, colY + 50, width - 112, 48);

  // Animated red-pen highlighter sweep under key takeaway
  const hl1T = easeOutCubic(clamp((localF - 42) / 18, 0, 1));
  const hl1Y = b1EndY + 12;
  ctx.fillStyle = 'rgba(185, 28, 28, 0.14)';
  ctx.fillRect(56, hl1Y, (width - 112) * hl1T, 48);
  ctx.font = `800 30px ${FONT}`;
  ctx.fillStyle = '#991B1B';
  ctx.fillText(`★ ${d.causeHighlight}`, 70, hl1Y + 8);
  ctx.restore();

  // Hairline divider
  const div2Y = b1EndY + 88;
  ctx.fillStyle = 'rgba(24, 24, 27, 0.2)';
  ctx.fillRect(56, div2Y, width - 112, 2);

  // Block 2: 对大盘传导
  const b2T = easeOutCubic(clamp((localF - 56) / 14, 0, 1));
  ctx.save();
  ctx.globalAlpha = b2T;
  ctx.font = `900 34px ${FONT}`;
  ctx.fillStyle = '#141417';
  ctx.fillText(d.impactTitle, 56, div2Y + 26);

  ctx.font = `600 33px ${FONT}`;
  ctx.fillStyle = '#27272A';
  const b2EndY = drawWrappedText(ctx, d.impactBody, 56, div2Y + 76, width - 112, 48);

  const hl2T = easeOutCubic(clamp((localF - 76) / 18, 0, 1));
  const hl2Y = b2EndY + 12;
  ctx.fillStyle = 'rgba(217, 119, 6, 0.22)';
  ctx.fillRect(56, hl2Y, (width - 112) * hl2T, 50);
  ctx.font = `900 31px ${FONT}`;
  ctx.fillStyle = '#92400E';
  ctx.fillText(`▶ ${d.impactHighlight}`, 70, hl2Y + 9);
  ctx.restore();

  ctx.restore();
}

/**
 * SHOT 4 (410..559): Cobalt Engineering Blueprint — Event 02 (PCB Shortage vs Unmass-produced Trap)
 * Motion: Center split curtain wipe + Diagonal spotlight sweep + Physics Stamp Slam at frame 68
 */
function renderEventBlueprintScene(
  ctx: CanvasRenderingContext2D,
  frame: number,
  img: HTMLImageElement | null | undefined
) {
  const { width, height } = INTEL_VIDEO_SPEC;
  const localF = frame - 410;
  const d = INTEL_1120_DATA.eventBlueprint;

  // Screen-shake impulse when rubber stamp slams down at localF = 68..78
  let shakeX = 0;
  let shakeY = 0;
  if (localF >= 68 && localF <= 78) {
    const decay = 1 - (localF - 68) / 10;
    shakeX = Math.sin(localF * 3.8) * 14 * decay;
    shakeY = Math.cos(localF * 4.4) * 12 * decay;
  }

  ctx.save();
  ctx.translate(shakeX, shakeY);

  // Deep Cobalt Blueprint Background
  ctx.fillStyle = '#0B172A';
  ctx.fillRect(-20, -20, width + 40, height + 40);

  // Blueprint Engineering Grid
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.08)';
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

  drawTopProgressBar(ctx, frame, 'EVENT 02 · 真假蓝图鉴', true);

  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.font = `800 28px ${FONT}`;
  ctx.fillStyle = '#38BDF8';
  ctx.fillText(d.kicker, 56, 134);

  ctx.font = `900 54px ${FONT}`;
  ctx.fillStyle = '#FFFFFF';
  const headEndY = drawWrappedText(ctx, d.headline, 56, 178, width - 112, 72);

  // Split-Curtain Reveal of macro PCB vs Empty Crate image
  const imgY = headEndY + 24;
  const imgH = 560;
  const imgW = width - 112;
  const wipeW = imgW * easeOutCubic(clamp(localF / 22, 0, 1));

  ctx.save();
  roundRect(ctx, 56 + (imgW - wipeW) / 2, imgY, wipeW, imgH, 14);
  ctx.clip();
  drawCroppedCoverImage(ctx, img, 56, imgY, imgW, imgH, { x: 0, y: 0, w: 1, h: 1 }, 1.0);

  // Diagonal warm amber searchlight sweeping across the artwork
  const beamX = lerp(-260, width + 200, clamp((localF - 18) / 48, 0, 1));
  const beamGrad = ctx.createLinearGradient(beamX - 180, imgY, beamX + 180, imgY + imgH);
  beamGrad.addColorStop(0, 'rgba(251, 191, 36, 0)');
  beamGrad.addColorStop(0.5, 'rgba(251, 191, 36, 0.22)');
  beamGrad.addColorStop(1, 'rgba(251, 191, 36, 0)');
  ctx.fillStyle = beamGrad;
  ctx.fillRect(56, imgY, imgW, imgH);
  ctx.restore();

  // Crisp labels over split image halves
  ctx.font = `800 26px ${FONT}`;
  ctx.fillStyle = '#FBBF24';
  ctx.fillText('◀ 实打实紧缺 · 黄金 PCB', 78, imgY + imgH - 44);
  ctx.textAlign = 'right';
  ctx.fillStyle = '#F87171';
  ctx.fillText('空箱画饼 · 未量产排雷 ▶', width - 78, imgY + imgH - 44);
  ctx.textAlign = 'left';

  // Asymmetric Contrast Blocks below artwork
  const bodyY = imgY + imgH + 40;

  // Block A: 真紧缺逻辑
  const bullT = easeOutCubic(clamp((localF - 20) / 14, 0, 1));
  ctx.save();
  ctx.globalAlpha = bullT;
  roundRect(ctx, 56, bodyY, width - 112, 340, 16);
  ctx.fillStyle = 'rgba(251, 191, 36, 0.08)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(251, 191, 36, 0.4)';
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.font = `900 34px ${FONT}`;
  ctx.fillStyle = '#FBBF24';
  ctx.fillText(`▲ ${d.bullColumnTitle}`, 84, bodyY + 28);

  let py = bodyY + 86;
  d.bullPoints.forEach((pt, idx) => {
    const ptAlpha = easeOutCubic(clamp((localF - 28 - idx * 8) / 10, 0, 1));
    ctx.save();
    ctx.globalAlpha = bullT * ptAlpha;
    ctx.font = `600 31px ${FONT}`;
    ctx.fillStyle = '#F8FAFC';
    py = drawWrappedText(ctx, `· ${pt}`, 84, py, width - 168, 44) + 12;
    ctx.restore();
  });
  ctx.restore();

  // Block B: 排雷警告区 + 物理印章砸落
  const trapY = bodyY + 372;
  const trapT = easeOutCubic(clamp((localF - 46) / 14, 0, 1));
  ctx.save();
  ctx.globalAlpha = trapT;
  roundRect(ctx, 56, trapY, width - 112, 276, 16);
  ctx.fillStyle = 'rgba(239, 68, 68, 0.1)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(239, 68, 68, 0.45)';
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.font = `900 34px ${FONT}`;
  ctx.fillStyle = '#F87171';
  ctx.fillText(`▼ ${d.trapColumnTitle}`, 84, trapY + 28);

  ctx.font = `900 40px ${FONT}`;
  ctx.fillStyle = '#FFFFFF';
  ctx.fillText(d.trapTarget, 84, trapY + 86);

  ctx.font = `600 30px ${FONT}`;
  ctx.fillStyle = '#FECACA';
  drawWrappedText(ctx, d.trapDetail, 84, trapY + 146, width - 465, 44);

  // Rubber Stamp Slam at localF = 68 (clear right-hand space with zero text overlap)
  if (localF >= 68) {
    const stT = clamp((localF - 68) / 9, 0, 1);
    const stScale = lerp(2.5, 1.0, easeOutBack(stT));
    ctx.save();
    ctx.translate(width - 205, trapY + 146);
    ctx.rotate(-0.16);
    ctx.scale(stScale, stScale);
    ctx.globalAlpha = clamp(stT * 1.4, 0, 1);

    roundRect(ctx, -126, -42, 252, 84, 12);
    ctx.fillStyle = 'rgba(185, 28, 28, 0.22)';
    ctx.fill();
    ctx.strokeStyle = '#EF4444';
    ctx.lineWidth = 6;
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `900 29px ${FONT}`;
    ctx.fillStyle = '#FCA5A5';
    ctx.fillText(d.stampText, 0, 0);
    ctx.restore();
  }
  ctx.restore();

  // Bottom strategy ribbon
  ctx.textAlign = 'center';
  ctx.font = `700 28px ${FONT}`;
  ctx.fillStyle = '#38BDF8';
  ctx.fillText(d.bottomVerdict, width / 2, height - 104);

  ctx.restore();
}

/**
 * SHOT 5 (560..719): Warm Daylight Character Portrait + Comic Speech Bubbles + Timeline — Event 03
 * Motion: Vertical parallax portrait glide + Overshoot spring bubbles + Kinetic timeline stepper
 */
function renderEventPortraitScene(
  ctx: CanvasRenderingContext2D,
  frame: number,
  img: HTMLImageElement | null | undefined
) {
  const { width, height } = INTEL_VIDEO_SPEC;
  const localF = frame - 560;
  const d = INTEL_1120_DATA.eventPortrait;

  // Warm sunlit daylight editorial background
  ctx.fillStyle = '#FFFBF2';
  ctx.fillRect(0, 0, width, height);

  drawTopProgressBar(ctx, frame, 'EVENT 03 · 人物漫谈', false);

  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.font = `800 28px ${FONT}`;
  ctx.fillStyle = '#D97706';
  ctx.fillText(d.kicker, 56, 132);

  ctx.font = `900 58px ${FONT}`;
  ctx.fillStyle = '#18181B';
  const headEndY = drawWrappedText(ctx, d.headline, 56, 176, width - 112, 74);

  // Character Portrait (vertical smooth pan, NOT Ken Burns breathing)
  const artY = headEndY + 20;
  const artH = 770;
  const panP = easeOutCubic(clamp(localF / 120, 0, 1));
  ctx.save();
  roundRect(ctx, 56, artY, width - 112, artH, 20);
  ctx.clip();
  drawCroppedCoverImage(
    ctx,
    img,
    56,
    artY,
    width - 112,
    artH,
    { x: 0.03, y: 0.03, w: 0.94, h: 0.94 },
    1.12,
    0,
    lerp(-0.35, 0.35, panP)
  );

  // Subtle dark scrim on lower-right corner for comic bubble pop readability
  const cornerScrim = ctx.createLinearGradient(0, artY + artH - 220, 0, artY + artH);
  cornerScrim.addColorStop(0, 'rgba(24, 24, 27, 0)');
  cornerScrim.addColorStop(1, 'rgba(24, 24, 27, 0.72)');
  ctx.fillStyle = cornerScrim;
  ctx.fillRect(56, artY + artH - 220, width - 112, 220);

  ctx.font = `800 28px ${FONT}`;
  ctx.fillStyle = '#FDE68A';
  ctx.fillText(d.speakerName, 84, artY + artH - 54);
  ctx.restore();

  ctx.strokeStyle = 'rgba(24, 24, 27, 0.16)';
  ctx.lineWidth = 2;
  roundRect(ctx, 56, artY, width - 112, artH, 20);
  ctx.stroke();

  // Animated Comic Speech Bubble 1 (pops at localF = 18, positioned over kitchen window so robot face stays unobstructed)
  if (localF >= 18) {
    const b1S = easeOutBack(clamp((localF - 18) / 12, 0, 1));
    ctx.save();
    ctx.translate(width - 82, artY + 114);
    ctx.scale(b1S, b1S);
    roundRect(ctx, -500, -72, 488, 134, 22);
    ctx.fillStyle = '#FFFFFF';
    ctx.shadowColor = 'rgba(0,0,0,0.18)';
    ctx.shadowBlur = 18;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = '#18181B';
    ctx.lineWidth = 3;
    ctx.stroke();

    // Pointer tail toward Musk
    ctx.beginPath();
    ctx.moveTo(-500, -10);
    ctx.lineTo(-528, 12);
    ctx.lineTo(-500, 22);
    ctx.closePath();
    ctx.fillStyle = '#FFFFFF';
    ctx.fill();
    ctx.stroke();

    ctx.textAlign = 'left';
    ctx.font = `800 26px ${FONT}`;
    ctx.fillStyle = '#B45309';
    drawWrappedText(ctx, d.bubble1, -474, -48, 438, 40);
    ctx.restore();
  }

  // Animated Comic Speech Bubble 2 (pops at localF = 58)
  if (localF >= 58) {
    const b2S = easeOutBack(clamp((localF - 58) / 12, 0, 1));
    ctx.save();
    ctx.translate(width - 82, artY + 284);
    ctx.scale(b2S, b2S);
    roundRect(ctx, -500, -72, 488, 134, 22);
    ctx.fillStyle = '#FEF3C7';
    ctx.shadowColor = 'rgba(0,0,0,0.18)';
    ctx.shadowBlur = 18;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = '#18181B';
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(-500, -14);
    ctx.lineTo(-528, -2);
    ctx.lineTo(-500, 14);
    ctx.closePath();
    ctx.fillStyle = '#FEF3C7';
    ctx.fill();
    ctx.stroke();

    ctx.textAlign = 'left';
    ctx.font = `800 26px ${FONT}`;
    ctx.fillStyle = '#18181B';
    drawWrappedText(ctx, d.bubble2, -474, -48, 438, 40);
    ctx.restore();
  }

  // Kinetic 3-Node Timeline Stepper below Portrait
  const tlY = artY + artH + 46;
  ctx.font = `800 30px ${FONT}`;
  ctx.fillStyle = '#B45309';
  ctx.fillText('双线催化节点推进节奏', 56, tlY);

  const lineY = tlY + 76;
  const lineStartX = 150;
  const lineEndX = width - 150;
  const trackProg = easeOutCubic(clamp((localF - 30) / 70, 0, 1));

  ctx.fillStyle = 'rgba(24, 24, 27, 0.14)';
  ctx.fillRect(lineStartX, lineY, lineEndX - lineStartX, 6);
  ctx.fillStyle = '#D97706';
  ctx.fillRect(lineStartX, lineY, (lineEndX - lineStartX) * trackProg, 6);

  d.timelineSteps.forEach((step, idx) => {
    const cx = lerp(lineStartX, lineEndX, idx / 2);
    const active = trackProg >= idx * 0.45;
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, lineY + 3, 18, 0, Math.PI * 2);
    ctx.fillStyle = active ? '#D97706' : '#E5E7EB';
    ctx.fill();
    ctx.strokeStyle = '#FFFBF2';
    ctx.lineWidth = 4;
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.font = `900 28px ${FONT}`;
    ctx.fillStyle = active ? '#B45309' : '#71717A';
    ctx.fillText(step.time, cx, lineY + 38);

    ctx.font = `700 26px ${FONT}`;
    ctx.fillStyle = '#18181B';
    drawWrappedText(ctx, step.label, cx, lineY + 78, 250, 36);
    ctx.restore();
  });

  // Tactical bottom strip
  const tactY = lineY + 186;
  roundRect(ctx, 56, tactY, width - 112, 168, 16);
  ctx.fillStyle = '#F4EFE6';
  ctx.fill();
  ctx.strokeStyle = 'rgba(24, 24, 27, 0.16)';
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.textAlign = 'left';
  ctx.font = `700 31px ${FONT}`;
  ctx.fillStyle = '#18181B';
  drawWrappedText(ctx, d.tacticalNote, 84, tactY + 28, width - 168, 48);
}

/**
 * SHOT 6 (720..899): Grand Bullish vs Bearish Summary + Market Outlook Gauge Finale
 */
function renderSummaryVerdictScene(ctx: CanvasRenderingContext2D, frame: number) {
  const { width, height } = INTEL_VIDEO_SPEC;
  const localF = frame - 720;
  const d = INTEL_1120_DATA.summary;

  ctx.fillStyle = '#101216';
  ctx.fillRect(0, 0, width, height);

  drawTopProgressBar(ctx, frame, 'SUMMARY · 终极定调', true);

  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.font = `900 60px ${FONT}`;
  ctx.fillStyle = '#FFFFFF';
  ctx.fillText(d.headerTitle, 56, 134);

  ctx.font = `500 28px ${FONT}`;
  ctx.fillStyle = '#94A3B8';
  ctx.fillText(d.headerSubtitle, 56, 210);

  // Left-slide Bullish list
  const bullSlideX = lerp(-120, 0, easeOutCubic(clamp(localF / 16, 0, 1)));
  ctx.save();
  ctx.translate(bullSlideX, 0);
  ctx.globalAlpha = easeOutCubic(clamp(localF / 16, 0, 1));
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.fillRect(56, 268, width - 112, 2);

  ctx.font = `800 32px ${FONT}`;
  ctx.fillStyle = '#F87171';
  ctx.fillText('▲ 今日核心利好催化', 56, 290);

  d.bullishItems.forEach((item, idx) => {
    const iy = 348 + idx * 114;
    ctx.font = `800 33px ${FONT}`;
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(`${String(idx + 1).padStart(2, '0')}  ${item.title}`, 56, iy);

    ctx.font = `500 26px ${FONT}`;
    ctx.fillStyle = '#CBD5E1';
    ctx.fillText(item.detail, 114, iy + 46);
  });
  ctx.restore();

  // Right-slide Bearish list
  const bearSlideX = lerp(120, 0, easeOutCubic(clamp((localF - 14) / 16, 0, 1)));
  ctx.save();
  ctx.translate(bearSlideX, 0);
  ctx.globalAlpha = easeOutCubic(clamp((localF - 14) / 16, 0, 1));
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.fillRect(56, 706, width - 112, 2);

  ctx.font = `800 32px ${FONT}`;
  ctx.fillStyle = '#34D399';
  ctx.fillText('▼ 今日主要利空与风险提示', 56, 728);

  d.bearishItems.forEach((item, idx) => {
    const iy = 786 + idx * 124;
    ctx.font = `800 33px ${FONT}`;
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(`${String(idx + 1).padStart(2, '0')}  ${item.title}`, 56, iy);

    ctx.font = `500 26px ${FONT}`;
    ctx.fillStyle = '#CBD5E1';
    drawWrappedText(ctx, item.detail, 114, iy + 46, width - 170, 36);
  });
  ctx.restore();

  // Final Outlook Callout Box + Animated Sentiment Needle
  const outT = easeOutCubic(clamp((localF - 32) / 18, 0, 1));
  ctx.save();
  ctx.globalAlpha = outT;
  const boxY = 1200;
  const boxH = 510;
  roundRect(ctx, 56, boxY, width - 112, boxH, 20);
  ctx.fillStyle = 'rgba(251, 191, 36, 0.08)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(251, 191, 36, 0.5)';
  ctx.lineWidth = 2.5;
  ctx.stroke();

  ctx.font = `800 28px ${FONT}`;
  ctx.fillStyle = '#FBBF24';
  ctx.fillText(d.outlookBadge, 92, boxY + 34);

  // Small dynamic gauge bar on top-right of outlook box
  const gx = width - 350;
  const gy = boxY + 46;
  const gw = 246;
  const gaugeGrad = ctx.createLinearGradient(gx, 0, gx + gw, 0);
  gaugeGrad.addColorStop(0, '#34D399');
  gaugeGrad.addColorStop(0.5, '#FBBF24');
  gaugeGrad.addColorStop(1, '#F87171');
  ctx.fillStyle = gaugeGrad;
  ctx.fillRect(gx, gy, gw, 10);
  const needlePos = lerp(0.18, 0.44, easeOutCubic(clamp((localF - 38) / 36, 0, 1)));
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(gx + gw * needlePos - 3, gy - 8, 6, 26);

  ctx.font = `900 48px ${FONT}`;
  ctx.fillStyle = '#FFFFFF';
  ctx.fillText(d.outlookHeadline, 92, boxY + 92);

  ctx.font = `600 31px ${FONT}`;
  ctx.fillStyle = '#E2E8F0';
  drawWrappedText(ctx, d.outlookDetail, 92, boxY + 186, width - 184, 52);

  ctx.fillStyle = 'rgba(255, 255, 255, 0.14)';
  ctx.fillRect(92, boxY + 394, width - 184, 1.5);
  ctx.font = `800 30px ${FONT}`;
  ctx.fillStyle = '#FBBF24';
  ctx.fillText('点赞收藏留存 · 祝老师们今天稳稳守住主线！', 92, boxY + 426);
  ctx.restore();

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `400 24px ${FONT}`;
  ctx.fillStyle = '#64748B';
  ctx.fillText(d.footerText, width / 2, height - 74);
}

export function renderIntelVideoFrame(
  ctx: CanvasRenderingContext2D,
  frame: number,
  images: LoadedIntelImages
) {
  const f = clamp(Math.floor(frame), 0, INTEL_VIDEO_SPEC.totalFrames - 1);
  const shot = getIntelShotAtFrame(f);

  switch (shot.kind) {
    case 'meme_hook':
      renderMemeHookScene(ctx, f, images.memeKeyDay);
      break;
    case 'global_markets':
      renderGlobalMarketsScene(ctx, f);
      break;
    case 'event_tabloid':
      renderEventTabloidScene(ctx, f, images.eventAnthropic);
      break;
    case 'event_blueprint':
      renderEventBlueprintScene(ctx, f, images.eventPcb);
      break;
    case 'event_portrait':
      renderEventPortraitScene(ctx, f, images.eventRobot);
      break;
    case 'summary_verdict':
    default:
      renderSummaryVerdictScene(ctx, f);
      break;
  }
}
