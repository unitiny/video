import { CHART_THEME, VIDEO_SPEC } from '../theme';
import {
  clamp,
  easeOutBack,
  easeOutCubic,
  getClockAndMinuteAtFrame,
  getShotAtFrame,
  lerp,
  minuteIndexToX,
  resolveLabelPositions,
  springPop,
  valueToY,
} from '../timeline';
import type { VideoProjectData } from '../data/fundFlowData';

export interface LoadedVideoImages {
  openArcher?: HTMLImageElement | null;
  noonSlap?: HTMLImageElement | null;
  twoSheep?: HTMLImageElement | null;
  lithographyHero?: HTMLImageElement | null;
  morningBrief?: HTMLImageElement | null;
}

const FONT_STACK = '"Noto Sans SC", "Plus Jakarta Sans", "PingFang SC", "Microsoft YaHei", sans-serif';

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function drawCoverImage(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement | null | undefined,
  x: number,
  y: number,
  w: number,
  h: number,
  zoom = 1
) {
  if (!img || !img.complete || img.naturalWidth === 0) {
    const grad = ctx.createLinearGradient(x, y, x + w, y + h);
    grad.addColorStop(0, '#1e293b');
    grad.addColorStop(1, '#0f172a');
    ctx.fillStyle = grad;
    ctx.fillRect(x, y, w, h);
    return;
  }

  const iw = img.naturalWidth;
  const ih = img.naturalHeight;
  const scale = Math.max(w / iw, h / ih) * zoom;
  const dw = iw * scale;
  const dh = ih * scale;
  const dx = x + (w - dw) / 2;
  const dy = y + (h - dh) / 2;

  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.drawImage(img, dx, dy, dw, dh);
  ctx.restore();
}

function drawYellowImpactText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  fontSize: number,
  align: CanvasTextAlign = 'center',
  scale = 1
) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.font = `900 ${fontSize}px ${FONT_STACK}`;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';

  // Crisp comic outline + subtle drop shadow for maximum short-video readability
  ctx.shadowColor = 'rgba(0, 0, 0, 0.55)';
  ctx.shadowBlur = 18;
  ctx.shadowOffsetY = 6;

  ctx.lineWidth = Math.max(10, fontSize * 0.16);
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#141518';
  ctx.strokeText(text, 0, 0);

  ctx.shadowColor = 'transparent';
  ctx.fillStyle = CHART_THEME.heroYellow;
  ctx.fillText(text, 0, 0);
  ctx.restore();
}

/**
 * Shot 1 (Frames 0..96):
 * AI Builder Archer Illustration + Animated SVG-style Bowstring Draw & Flying Golden Arrow + Yellow Typography
 */
function renderOpenScene(
  ctx: CanvasRenderingContext2D,
  frame: number,
  data: VideoProjectData,
  images: LoadedVideoImages
) {
  const { width, height } = VIDEO_SPEC;
  const p = frame / 96;
  const artImg = data.id === 'morning_brief' ? images.morningBrief : images.openArcher;

  // Dynamic subtle zoom-in on illustration
  const zoom = lerp(1.02, 1.1, easeOutCubic(p));
  drawCoverImage(ctx, artImg, 0, 0, width, height, zoom);

  // Scrim for top/bottom text legibility
  const topScrim = ctx.createLinearGradient(0, 0, 0, 760);
  topScrim.addColorStop(0, 'rgba(10, 14, 22, 0.78)');
  topScrim.addColorStop(1, 'rgba(10, 14, 22, 0)');
  ctx.fillStyle = topScrim;
  ctx.fillRect(0, 0, width, 760);

  const botScrim = ctx.createLinearGradient(0, height - 720, 0, height);
  botScrim.addColorStop(0, 'rgba(10, 14, 22, 0)');
  botScrim.addColorStop(1, 'rgba(10, 14, 22, 0.88)');
  ctx.fillStyle = botScrim;
  ctx.fillRect(0, height - 720, width, 720);

  // Animated SVG-style golden trajectory & flying arrow aimed at upper-right candlesticks
  const drawPull = clamp(frame / 28, 0, 1);
  const releaseT = frame > 28 ? clamp((frame - 28) / 26, 0, 1) : 0;
  const bowAnchorX = 560;
  const bowAnchorY = 1090;
  const stringPullBack =
    releaseT > 0
      ? lerp(72, 0, easeOutBack(Math.min(1, releaseT * 3)))
      : lerp(18, 72, easeOutCubic(drawPull));

  ctx.save();
  ctx.translate(bowAnchorX, bowAnchorY);
  ctx.rotate(-0.62);

  // Dashed golden trajectory arc showing shot energy
  ctx.strokeStyle = 'rgba(255, 212, 59, 0.45)';
  ctx.lineWidth = 4;
  ctx.setLineDash([12, 12]);
  ctx.beginPath();
  ctx.moveTo(60, 0);
  ctx.lineTo(540, 0);
  ctx.stroke();
  ctx.setLineDash([]);

  // Bowstring flexing with tension
  const topTipX = 20;
  const topTipY = -165;
  const botTipY = 165;
  ctx.strokeStyle = '#fff3bf';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(topTipX, topTipY);
  ctx.lineTo(topTipX - stringPullBack, 0);
  ctx.lineTo(topTipX, botTipY);
  ctx.stroke();

  // Flying golden arrow
  const arrowFlyX =
    releaseT > 0 ? lerp(topTipX, 620, easeOutCubic(releaseT)) : topTipX - stringPullBack;
  ctx.shadowColor = 'rgba(255, 212, 59, 0.85)';
  ctx.shadowBlur = 16;
  ctx.strokeStyle = '#ffd43b';
  ctx.lineWidth = 9;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(arrowFlyX - 110, 0);
  ctx.lineTo(arrowFlyX + 95, 0);
  ctx.stroke();

  ctx.fillStyle = '#fff3bf';
  ctx.beginPath();
  ctx.moveTo(arrowFlyX + 130, 0);
  ctx.lineTo(arrowFlyX + 82, -22);
  ctx.lineTo(arrowFlyX + 82, 22);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // Staggered yellow headline typography visible from Frame 0 (popping smoothly):
  // "11.17 / 天天看主力 / 收盘资金流向 / 大A"
  const [b1, b2, b3, b4] = data.openBadges;
  drawYellowImpactText(ctx, b1, width / 2, 250, 108, 'center', springPop(frame + 10, 14));
  drawYellowImpactText(ctx, b2, width / 2, 400, 118, 'center', springPop(frame + 6, 14));
  drawYellowImpactText(ctx, b3, width / 2, height - 450, 112, 'center', springPop(frame + 3, 14));
  drawYellowImpactText(ctx, b4, width / 2, height - 280, 142, 'center', springPop(frame + 1, 14));
}

/**
 * Shot 2 (Frames 97..165):
 * "午盘拉满 午后打脸" + 14 animated stock stickers
 */
function renderNoonSlapScene(
  ctx: CanvasRenderingContext2D,
  frame: number,
  data: VideoProjectData,
  images: LoadedVideoImages
) {
  const { width, height } = VIDEO_SPEC;
  const localF = frame - 97;

  // Background illustration with quick comic shake in first 12 frames
  const shakeX = localF < 12 ? Math.sin(localF * 2.2) * (12 - localF) * 1.4 : 0;
  const shakeY = localF < 12 ? Math.cos(localF * 2.8) * (12 - localF) * 1.1 : 0;

  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(0, 0, width, height);

  ctx.save();
  ctx.translate(shakeX, shakeY);
  drawCoverImage(ctx, images.noonSlap, 0, 180, width, 1280, lerp(1.04, 1.0, easeOutCubic(localF / 40)));
  ctx.restore();

  // Top bold comic banner
  const bannerScrim = ctx.createLinearGradient(0, 0, 0, 340);
  bannerScrim.addColorStop(0, 'rgba(20, 21, 24, 0.88)');
  bannerScrim.addColorStop(1, 'rgba(20, 21, 24, 0)');
  ctx.fillStyle = bannerScrim;
  ctx.fillRect(0, 0, width, 340);

  drawYellowImpactText(ctx, data.art1Headline, width / 2, 165, 92, 'center', springPop(localF, 12));

  // Subtitle chip
  ctx.font = `700 34px ${FONT_STACK}`;
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.fillText(data.art1Subline, width / 2, 255);

  // Lower sticker board holding 14 stock stickers in 2 columns × 7 rows
  const boardTop = 1360;
  ctx.fillStyle = '#ffffff';
  drawRoundedRect(ctx, 28, boardTop, width - 56, height - boardTop - 44, 28);
  ctx.fill();
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 2;
  ctx.stroke();

  const cols = 2;
  const cardW = (width - 112) / cols;
  const cardH = 112;
  const gapX = 16;
  const gapY = 14;
  const startX = 48;
  const startY = boardTop + 28;

  data.stickers.slice(0, 14).forEach((s, idx) => {
    const col = idx % cols;
    const row = Math.floor(idx / cols);
    const delay = idx * 3;
    const pop = springPop(localF - delay, 10);
    if (pop <= 0.02) return;

    const cx = startX + col * (cardW + gapX) + cardW / 2;
    const cy = startY + row * (cardH + gapY) + cardH / 2;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(pop, pop);

    drawRoundedRect(ctx, -cardW / 2, -cardH / 2, cardW, cardH, 16);
    ctx.fillStyle = s.positive ? '#fef2f2' : '#f0fdf4';
    ctx.fill();
    ctx.strokeStyle = s.positive ? '#fecaca' : '#bbf7d0';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Left: stock name + code
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.font = `800 32px ${FONT_STACK}`;
    ctx.fillStyle = '#111827';
    ctx.fillText(s.name, -cardW / 2 + 20, -14);

    ctx.font = `600 22px ${FONT_STACK}`;
    ctx.fillStyle = '#64748b';
    ctx.fillText(`${s.code} · ${s.tag}`, -cardW / 2 + 20, 24);

    // Right: change %
    ctx.textAlign = 'right';
    ctx.font = `900 34px "JetBrains Mono", ${FONT_STACK}`;
    ctx.fillStyle = s.positive ? CHART_THEME.red : CHART_THEME.green;
    ctx.fillText(s.changePct, cardW / 2 - 20, 0);

    ctx.restore();
  });
}

/**
 * Shot 4 (Frames 213..271):
 * "热门股票全线跌停 只有两只羊撑住了！"
 */
function renderTwoSheepScene(
  ctx: CanvasRenderingContext2D,
  frame: number,
  data: VideoProjectData,
  images: LoadedVideoImages
) {
  const { width, height } = VIDEO_SPEC;
  const localF = frame - 213;

  drawCoverImage(ctx, images.twoSheep, 0, 0, width, height, lerp(1.0, 1.07, localF / 58));

  // Falling green limit-down snow particles
  ctx.save();
  for (let i = 0; i < 28; i++) {
    const px = ((i * 197 + localF * (i % 3 === 0 ? 4 : 7)) % (width + 60)) - 30;
    const py = ((i * 251 + localF * (14 + (i % 5) * 4)) % (height + 80)) - 40;
    ctx.fillStyle = i % 4 === 0 ? 'rgba(200, 52, 42, 0.7)' : 'rgba(46, 139, 100, 0.85)';
    ctx.font = `700 ${24 + (i % 3) * 6}px ${FONT_STACK}`;
    ctx.fillText(i % 4 === 0 ? '+10%' : '-10%', px, py);
  }
  ctx.restore();

  const scrim = ctx.createLinearGradient(0, 0, 0, 600);
  scrim.addColorStop(0, 'rgba(10, 14, 22, 0.85)');
  scrim.addColorStop(1, 'rgba(10, 14, 22, 0)');
  ctx.fillStyle = scrim;
  ctx.fillRect(0, 0, width, 600);

  drawYellowImpactText(ctx, data.art2Headline, width / 2, 230, 88, 'center', springPop(localF, 12));
  drawYellowImpactText(ctx, data.art2Subline, width / 2, 365, 96, 'center', springPop(localF - 8, 12));
}

/**
 * Shot 9 (Frames 556..608):
 * "午后翻绿 光刻机撑住！"
 */
function renderLithographyScene(
  ctx: CanvasRenderingContext2D,
  frame: number,
  data: VideoProjectData,
  images: LoadedVideoImages
) {
  const { width, height } = VIDEO_SPEC;
  const localF = frame - 556;

  drawCoverImage(ctx, images.lithographyHero, 0, 0, width, height, lerp(1.05, 1.0, easeOutCubic(localF / 52)));

  // Glowing golden wafer pulse around center
  const pulse = 0.5 + 0.5 * Math.sin(localF * 0.35);
  const radial = ctx.createRadialGradient(width / 2, height * 0.48, 30, width / 2, height * 0.48, 420);
  radial.addColorStop(0, `rgba(255, 212, 59, ${0.28 * pulse})`);
  radial.addColorStop(1, 'rgba(255, 212, 59, 0)');
  ctx.fillStyle = radial;
  ctx.fillRect(0, 0, width, height);

  const botScrim = ctx.createLinearGradient(0, height - 620, 0, height);
  botScrim.addColorStop(0, 'rgba(10, 14, 22, 0)');
  botScrim.addColorStop(1, 'rgba(10, 14, 22, 0.88)');
  ctx.fillStyle = botScrim;
  ctx.fillRect(0, height - 620, width, 620);

  drawYellowImpactText(ctx, data.art3Headline, width / 2, height - 420, 108, 'center', springPop(localF, 11));
  drawYellowImpactText(ctx, data.art3Subline, width / 2, height - 270, 116, 'center', springPop(localF - 7, 11));
}

/**
 * Shot 7 (Frames 440..495):
 * "收盘涨跌停归因" full structured long table
 */
function renderAttributionTableScene(
  ctx: CanvasRenderingContext2D,
  frame: number,
  data: VideoProjectData
) {
  const { width, height } = VIDEO_SPEC;
  const localF = frame - 440;

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);

  // Header band matching chart typography alignment (x=29, y=140)
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.font = `700 62px ${FONT_STACK}`;
  ctx.fillStyle = CHART_THEME.titleMainColor;
  ctx.fillText(data.attributionTitle, 36, 150);

  ctx.font = `500 32px ${FONT_STACK}`;
  ctx.fillStyle = CHART_THEME.unitColor;
  ctx.fillText(data.attributionSubtitle, 36, 232);

  // Hairline divider
  ctx.fillStyle = '#e5e7eb';
  ctx.fillRect(36, 294, width - 72, 2);

  // Table header
  const tableTop = 324;
  ctx.fillStyle = '#f8fafc';
  drawRoundedRect(ctx, 36, tableTop, width - 72, 72, 12);
  ctx.fill();

  ctx.font = `700 28px ${FONT_STACK}`;
  ctx.fillStyle = '#475569';
  ctx.textBaseline = 'middle';
  ctx.fillText('主线板块与强度', 58, tableTop + 36);
  ctx.fillText('核心标的与催化归因', 420, tableTop + 36);

  // Rows with staggered slide-up reveal
  const rowStartY = tableTop + 92;
  const rowH = 205;
  data.attributionRows.forEach((row, idx) => {
    const enter = clamp((localF - idx * 3) / 10, 0, 1);
    if (enter <= 0) return;

    const y = rowStartY + idx * (rowH + 14) + (1 - easeOutCubic(enter)) * 28;
    ctx.save();
    ctx.globalAlpha = enter;

    drawRoundedRect(ctx, 36, y, width - 72, rowH, 16);
    ctx.fillStyle =
      row.sentiment === 'up' ? '#fff5f5' : row.sentiment === 'down' ? '#f3faf6' : '#f8fafc';
    ctx.fill();
    ctx.strokeStyle =
      row.sentiment === 'up' ? '#fecaca' : row.sentiment === 'down' ? '#bbf7d0' : '#e2e8f0';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Column 1: Sector
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.font = `800 34px ${FONT_STACK}`;
    ctx.fillStyle = '#111827';
    ctx.fillText(row.sector, 58, y + 28);

    // Column 2: Count badge text (unboxed bold metric)
    ctx.font = `800 32px ${FONT_STACK}`;
    ctx.fillStyle =
      row.sentiment === 'up'
        ? CHART_THEME.red
        : row.sentiment === 'down'
          ? CHART_THEME.green
          : '#475569';
    ctx.fillText(row.limitCount, 58, y + 86);

    // Column 3: Leaders & Reason
    ctx.font = `700 28px ${FONT_STACK}`;
    ctx.fillStyle = '#1e293b';
    ctx.fillText(row.leaders, 420, y + 28);

    // Wrap reason text nicely across 2 lines inside right column
    ctx.font = `500 26px ${FONT_STACK}`;
    ctx.fillStyle = '#475569';
    const maxChars = 22;
    const line1 = row.reason.slice(0, maxChars);
    const line2 = row.reason.slice(maxChars);
    ctx.fillText(line1, 420, y + 82);
    if (line2) {
      ctx.fillText(line2, 420, y + 122);
    }

    ctx.restore();
  });

  // Footer
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `400 ${CHART_THEME.footerSize}px ${FONT_STACK}`;
  ctx.fillStyle = CHART_THEME.footerColor;
  ctx.fillText(CHART_THEME.footerText, width / 2, CHART_THEME.footerY);
}

/**
 * Pixel-measured ChartScene (Shots 3, 5, 6, 8, 10)
 * Follows exact measured specifications on 1080×2352 canvas:
 * - Title: left x=29, top y=248 (sub 40px #3f3f3f, main 62px 700 #1a1a1a)
 * - Clock: right x=1048, 62px 700 #a9b0c3
 * - Breadth bar: x 29..1068, y 333..352 (h=19)
 * - Breadth row: 34px (#c8342a / #4a4a4a / #2e8b64)
 * - Unit: (29, 424) 26px #9aa0a6
 * - Plot: y 460..2071, zeroY=1043, 15.975 px/亿, x 109.5..701
 * - 28 curves, 4.2px rounded, dot r=4.6, labels at cursor+26, 38px with white stroke & 38px minGap
 */
function renderChartScene(
  ctx: CanvasRenderingContext2D,
  frame: number,
  data: VideoProjectData,
  showEtfOverlay: boolean,
  images: LoadedVideoImages
) {
  const { width, height } = VIDEO_SPEC;
  ctx.fillStyle = CHART_THEME.bg;
  ctx.fillRect(0, 0, width, height);

  const { minuteIndex, clockText } = getClockAndMinuteAtFrame(frame);
  const cursorX = minuteIndexToX(minuteIndex);

  // 1. Title & Clock Header Band
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.font = `500 ${CHART_THEME.titleSubSize}px ${FONT_STACK}`;
  ctx.fillStyle = CHART_THEME.titleSubColor;
  ctx.fillText(data.subHeader, CHART_THEME.titleLeft, CHART_THEME.titleTop - 54);

  ctx.font = `700 ${CHART_THEME.titleMainSize}px ${FONT_STACK}`;
  ctx.fillStyle = CHART_THEME.titleMainColor;
  ctx.fillText(data.mainHeader, CHART_THEME.titleLeft, CHART_THEME.titleTop);

  ctx.textAlign = 'right';
  ctx.font = `700 ${CHART_THEME.clockSize}px "JetBrains Mono", ${FONT_STACK}`;
  ctx.fillStyle = CHART_THEME.clockColor;
  ctx.fillText(clockText, CHART_THEME.clockRight, CHART_THEME.titleTop);

  // 2. Advance / Decline Ratio Bar (x 29..1068, y 333..352, h 19)
  const barX = CHART_THEME.barX1;
  const barW = CHART_THEME.barX2 - CHART_THEME.barX1;
  const barY = CHART_THEME.barY1;
  const barH = CHART_THEME.barY2 - CHART_THEME.barY1;

  // Dynamic slight shift across trading day
  const dayProgress = clamp(minuteIndex / 240, 0, 1);
  const upCount = Math.round(lerp(data.breadth.up + 920, data.breadth.up, dayProgress));
  const flatCount = data.breadth.flat;
  const downCount = Math.round(lerp(data.breadth.down - 920, data.breadth.down, dayProgress));
  const totalBreadth = upCount + flatCount + downCount;

  const wUp = (upCount / totalBreadth) * barW;
  const wFlat = (flatCount / totalBreadth) * barW;
  const wDown = barW - wUp - wFlat;

  ctx.save();
  drawRoundedRect(ctx, barX, barY, barW, barH, 6);
  ctx.clip();
  ctx.fillStyle = CHART_THEME.red;
  ctx.fillRect(barX, barY, wUp, barH);
  ctx.fillStyle = CHART_THEME.gray;
  ctx.fillRect(barX + wUp, barY, wFlat, barH);
  ctx.fillStyle = CHART_THEME.green;
  ctx.fillRect(barX + wUp + wFlat, barY, wDown, barH);
  ctx.restore();

  // End scale ticks on bar
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(barX + 12, barY, 2, barH);
  ctx.fillRect(CHART_THEME.barX2 - 14, barY, 2, barH);

  // 3. Breadth Labels Row (34px)
  ctx.textBaseline = 'top';
  ctx.font = `600 ${CHART_THEME.breadthFontSize}px ${FONT_STACK}`;

  ctx.textAlign = 'left';
  ctx.fillStyle = CHART_THEME.red;
  ctx.fillText(`涨 ${upCount}`, CHART_THEME.barX1, 366);

  ctx.textAlign = 'center';
  ctx.fillStyle = CHART_THEME.gray;
  ctx.fillText(`平 ${flatCount}`, width / 2, 366);

  ctx.textAlign = 'right';
  ctx.fillStyle = CHART_THEME.green;
  ctx.fillText(`跌 ${downCount}`, CHART_THEME.barX2, 366);

  // 4. Unit Label "(29, 424) 26px #9aa0a6"
  ctx.textAlign = 'left';
  ctx.font = `500 ${CHART_THEME.unitSize}px ${FONT_STACK}`;
  ctx.fillStyle = CHART_THEME.unitColor;
  ctx.fillText(data.unitLabel, CHART_THEME.unitX, CHART_THEME.unitY);

  // 5. Plot Grid, Y-axis Ticks & Zero Baseline (y 460..2071, zeroY=1043)
  const yTicks = [30, 20, 10, 0, -10, -20, -30, -40, -50, -60];
  ctx.font = `500 24px "JetBrains Mono", ${FONT_STACK}`;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';

  for (const val of yTicks) {
    const yy = valueToY(val);
    if (yy < CHART_THEME.plotTop || yy > CHART_THEME.plotBottom) continue;

    ctx.strokeStyle = val === 0 ? '#cbd5e1' : '#f1f5f9';
    ctx.lineWidth = val === 0 ? 2.4 : 1.5;
    ctx.beginPath();
    ctx.moveTo(CHART_THEME.xStart - 10, yy);
    ctx.lineTo(CHART_THEME.barX2, yy);
    ctx.stroke();

    ctx.fillStyle = val === 0 ? '#64748b' : '#9aa0a6';
    ctx.fillText(`${val}`, CHART_THEME.xStart - 18, yy);
  }

  // X-axis time markers (09:30, 10:30, 11:30/13:00, 14:00, 15:00)
  const xMarkers: Array<{ min: number; label: string }> = [
    { min: 0, label: '09:30' },
    { min: 60, label: '10:30' },
    { min: 120, label: '11:30/13:00' },
    { min: 180, label: '14:00' },
    { min: 240, label: '15:00' },
  ];
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.font = `500 22px "JetBrains Mono", ${FONT_STACK}`;
  for (const xm of xMarkers) {
    const xx = minuteIndexToX(xm.min);
    ctx.strokeStyle = '#f1f5f9';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(xx, CHART_THEME.plotTop);
    ctx.lineTo(xx, CHART_THEME.plotBottom);
    ctx.stroke();

    ctx.fillStyle = '#9aa0a6';
    ctx.fillText(xm.label, xx, CHART_THEME.plotBottom + 14);
  }

  // 6. Vertical Dashed Cursor Line (x = current minute, y 460..2071)
  ctx.save();
  ctx.strokeStyle = '#94a3b8';
  ctx.lineWidth = 2.2;
  ctx.setLineDash([8, 8]);
  ctx.beginPath();
  ctx.moveTo(cursorX, CHART_THEME.plotTop);
  ctx.lineTo(cursorX, CHART_THEME.plotBottom);
  ctx.stroke();
  ctx.restore();

  // 7. 28 Curves (4.2px rounded) + End Dots (r=4.6)
  const floorMin = Math.floor(minuteIndex);
  const fracMin = minuteIndex - floorMin;
  const endTargets: Array<{ id: string; targetY: number; val: number }> = [];

  for (const curve of data.curves) {
    ctx.save();
    ctx.strokeStyle = curve.color;
    ctx.lineWidth = CHART_THEME.curveWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();

    for (let m = 0; m <= floorMin; m++) {
      const xx = minuteIndexToX(m);
      const yy = clamp(valueToY(curve.values[m]), CHART_THEME.plotTop, CHART_THEME.plotBottom);
      if (m === 0) ctx.moveTo(xx, yy);
      else ctx.lineTo(xx, yy);
    }

    const v0 = curve.values[clamp(floorMin, 0, 240)];
    const v1 = curve.values[clamp(floorMin + 1, 0, 241)];
    const currentVal = lerp(v0, v1, fracMin);
    const endY = clamp(valueToY(currentVal), CHART_THEME.plotTop, CHART_THEME.plotBottom);

    if (fracMin > 0) {
      ctx.lineTo(cursorX, endY);
    }
    ctx.stroke();

    // Solid end circle dot (r = 4.6)
    ctx.fillStyle = curve.color;
    ctx.beginPath();
    ctx.arc(cursorX, endY, CHART_THEME.dotRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    endTargets.push({ id: curve.id, targetY: endY, val: currentVal });
  }

  // 8. End Labels (x = cursor + 26, 38px, white stroke, >=38px anti-overlap spacing)
  const resolvedYMap = resolveLabelPositions(endTargets, CHART_THEME.labelMinGap);
  const labelX = cursorX + CHART_THEME.labelOffsetX;

  ctx.save();
  ctx.font = `700 ${CHART_THEME.labelFontSize}px ${FONT_STACK}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 6;
  ctx.lineJoin = 'round';

  for (const curve of data.curves) {
    const item = endTargets.find((t) => t.id === curve.id);
    const ly = resolvedYMap.get(curve.id) ?? item?.targetY ?? CHART_THEME.zeroY;
    const currentVal = item?.val ?? curve.endValue;
    const formattedVal =
      data.id === 'morning_brief'
        ? `${currentVal >= 0 ? '+' : ''}${currentVal.toFixed(1)}`
        : `${currentVal.toFixed(1)}亿`;
    const labelStr = `${curve.name} ${formattedVal}`;

    // Subtle leader tick if collision solver shifted the label
    if (item && Math.abs(ly - item.targetY) > 6) {
      ctx.strokeStyle = curve.color;
      ctx.globalAlpha = 0.35;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(cursorX + 6, item.targetY);
      ctx.lineTo(labelX - 4, ly);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    ctx.lineWidth = 6;
    ctx.strokeStyle = '#ffffff';
    ctx.strokeText(labelStr, labelX, ly);
    ctx.fillStyle = curve.color;
    ctx.fillText(labelStr, labelX, ly);
  }
  ctx.restore();

  // 9. ETF Volume Surge Overlay Card (Frame >= 300 in Shot 5)
  if (showEtfOverlay && frame >= 300) {
    const enter = springPop(frame - 300, 14);
    const cardW = width - 88;
    const cardH = 590;
    const cardX = 44;
    const cardY = lerp(height, 1410, enter);

    ctx.save();
    ctx.shadowColor = 'rgba(15, 23, 42, 0.24)';
    ctx.shadowBlur = 36;
    ctx.shadowOffsetY = 14;
    drawRoundedRect(ctx, cardX, cardY, cardW, cardH, 28);
    ctx.fillStyle = '#0f172a';
    ctx.fill();
    ctx.restore();

    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.font = `900 48px ${FONT_STACK}`;
    ctx.fillStyle = '#ffd43b';
    ctx.fillText(data.etfBannerTitle, cardX + 36, cardY + 32);

    ctx.font = `600 28px ${FONT_STACK}`;
    ctx.fillStyle = '#e2e8f0';
    ctx.fillText(data.etfBannerHighlight, cardX + 36, cardY + 96);

    // Small corner mascot thumbnail
    const thumbSize = 110;
    ctx.save();
    drawRoundedRect(ctx, cardX + cardW - thumbSize - 28, cardY + 28, thumbSize, thumbSize, 18);
    ctx.clip();
    drawCoverImage(ctx, images.openArcher, cardX + cardW - thumbSize - 28, cardY + 28, thumbSize, thumbSize, 1.15);
    ctx.restore();

    // 3 ETF Rows
    data.etfItems.forEach((etf, idx) => {
      const ry = cardY + 178 + idx * 124;
      drawRoundedRect(ctx, cardX + 32, ry, cardW - 64, 106, 16);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
      ctx.fill();

      ctx.textAlign = 'left';
      ctx.font = `800 34px ${FONT_STACK}`;
      ctx.fillStyle = '#ffffff';
      ctx.fillText(etf.name, cardX + 56, ry + 20);

      ctx.font = `500 24px "JetBrains Mono", ${FONT_STACK}`;
      ctx.fillStyle = '#94a3b8';
      ctx.fillText(`${etf.code} · ${etf.window}`, cardX + 56, ry + 64);

      ctx.textAlign = 'right';
      ctx.font = `800 36px "JetBrains Mono", ${FONT_STACK}`;
      ctx.fillStyle = '#ff6b6b';
      ctx.fillText(etf.flow, cardX + cardW - 56, ry + 18);

      ctx.font = `600 24px ${FONT_STACK}`;
      ctx.fillStyle = '#ffd43b';
      ctx.fillText(etf.volumeBoost, cardX + cardW - 56, ry + 64);
    });
  }

  // 10. Footer Disclaimer (26px #b9bdc4)
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `400 ${CHART_THEME.footerSize}px ${FONT_STACK}`;
  ctx.fillStyle = CHART_THEME.footerColor;
  ctx.fillText(CHART_THEME.footerText, width / 2, CHART_THEME.footerY);
}

/**
 * Main deterministic entry point: renders exact frame [0..667] at 1080×2352.
 */
export function renderVideoFrame(
  ctx: CanvasRenderingContext2D,
  frame: number,
  data: VideoProjectData,
  images: LoadedVideoImages
) {
  const f = clamp(Math.floor(frame), 0, VIDEO_SPEC.totalFrames - 1);
  const shot = getShotAtFrame(f);

  ctx.save();
  switch (shot.kind) {
    case 'open':
      renderOpenScene(ctx, f, data, images);
      break;
    case 'art_noon_slap':
      renderNoonSlapScene(ctx, f, data, images);
      break;
    case 'art_two_sheep':
      renderTwoSheepScene(ctx, f, data, images);
      break;
    case 'chart_etf':
      renderChartScene(ctx, f, data, true, images);
      break;
    case 'attribution_table':
      renderAttributionTableScene(ctx, f, data);
      break;
    case 'art_lithography':
      renderLithographyScene(ctx, f, data, images);
      break;
    case 'chart':
    case 'closing_freeze':
    default:
      renderChartScene(ctx, f, data, false, images);
      break;
  }
  ctx.restore();
}
