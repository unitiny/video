import { clamp, easeOutCubic } from '../../timeline';
import { FONT, MONO, roundRect, type SceneRenderContext } from './primitives';

/**
 * Strict v3 Unified Color Semantics (Zero Red/Green Ambiguity):
 * - UP_RED: Price increase ONLY (A-share convention)
 * - DOWN_GREEN: Price decrease ONLY (A-share convention)
 * - BRAND_GOLD: Editorial highlights, brand anchors, key callouts
 * - INFO_CYAN: Neutral data, tech context, secondary metadata
 * - WARN_ORANGE: Risk / caution badges (never confused with price up/down)
 */
export const V3_COLORS = {
  bg: '#070A10',
  bgSurface: '#0D131F',
  bgCard: 'rgba(15, 22, 36, 0.86)',
  border: 'rgba(148, 163, 184, 0.18)',
  borderStrong: 'rgba(255, 255, 255, 0.24)',
  textPrimary: '#F8FAFC',
  textSecondary: '#CBD5E1',
  textMuted: '#94A3B8',
  upRed: '#F87171',
  upRedDeep: '#DC2626',
  downGreen: '#34D399',
  downGreenDeep: '#059669',
  brandGold: '#FBBF24',
  brandGoldLight: '#FEF08A',
  infoCyan: '#38BDF8',
  warnOrange: '#FB923C',
  warnOrangeDeep: '#EA580C',
} as const;

export type V3SemanticTone = 'up' | 'down' | 'gold' | 'cyan' | 'warn';

export function resolveV3ToneColor(tone: V3SemanticTone): string {
  switch (tone) {
    case 'up':
      return V3_COLORS.upRed;
    case 'down':
      return V3_COLORS.downGreen;
    case 'gold':
      return V3_COLORS.brandGold;
    case 'cyan':
      return V3_COLORS.infoCyan;
    case 'warn':
      return V3_COLORS.warnOrange;
  }
}

export function resolvePriceColor(changePct: number): string {
  return changePct >= 0 ? V3_COLORS.upRed : V3_COLORS.downGreen;
}

/**
 * Platform Safe-Zone constants for 1080×1920 vertical video (Douyin / WeChat Channels / Xiaohongshu):
 * - Top status / tabs bar: y < 108
 * - Bottom title / caption / audio bar: y > 1580
 * - Right engagement rail (like/comment/bookmark): x > 936 when y > 860
 */
export const V3_SAFE_ZONE = {
  left: 48,
  rightFull: 1032,
  /** Width keeping critical content cleanly away from bottom-right engagement icons */
  safeRight: 968,
  top: 114,
  bottom: 1556,
  bottomPlatformCurtainY: 1580,
  rightRailX: 936,
  rightRailStartY: 860,
} as const;

/**
 * Draws obsidian terminal backdrop with refined architectural hairline grid & radial glow.
 */
export function drawV3ObsidianBackdrop(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  accentColor: string = V3_COLORS.brandGold
): void {
  ctx.fillStyle = V3_COLORS.bg;
  ctx.fillRect(0, 0, width, height);

  // Subtle top ambient bloom
  const topGlow = ctx.createRadialGradient(width * 0.5, 140, 20, width * 0.5, 220, 760);
  topGlow.addColorStop(0, `${accentColor}16`);
  topGlow.addColorStop(0.55, `${accentColor}05`);
  topGlow.addColorStop(1, 'rgba(7, 10, 16, 0)');
  ctx.fillStyle = topGlow;
  ctx.fillRect(0, 0, width, 960);

  // Subtle architectural grid
  ctx.save();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.028)';
  ctx.lineWidth = 1;
  for (let gx = 48; gx < width; gx += 72) {
    ctx.beginPath();
    ctx.moveTo(gx, 0);
    ctx.lineTo(gx, height);
    ctx.stroke();
  }
  for (let gy = 108; gy < height; gy += 72) {
    ctx.beginPath();
    ctx.moveTo(0, gy);
    ctx.lineTo(width, gy);
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * Draws Instagram-Stories / Bloomberg-Reels style segmented chapter progress bar + unified brand header.
 */
export function drawV3TopChrome(
  rc: SceneRenderContext,
  chapterTag: string,
  accentColor: string = V3_COLORS.brandGold
): void {
  const { ctx, frame, shot, timeline, episode } = rc;
  const { width, shots } = timeline;
  const padX = V3_SAFE_ZONE.left;
  const barY = 44;
  const barH = 5;
  const gap = 8;
  const segCount = Math.max(1, shots.length);
  const segW = (width - padX * 2 - gap * (segCount - 1)) / segCount;

  ctx.save();
  for (let i = 0; i < segCount; i++) {
    const s = shots[i];
    const sx = padX + i * (segW + gap);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.16)';
    roundRect(ctx, sx, barY, segW, barH, 3);
    ctx.fill();

    let fillFrac = 0;
    if (frame > s.endFrame) {
      fillFrac = 1;
    } else if (frame >= s.startFrame) {
      fillFrac = clamp((frame - s.startFrame + 1) / Math.max(1, s.durationFrames), 0, 1);
    }

    if (fillFrac > 0) {
      ctx.fillStyle = s.id === shot.id ? accentColor : 'rgba(248, 250, 252, 0.72)';
      roundRect(ctx, sx, barY, Math.max(4, segW * fillFrac), barH, 3);
      ctx.fill();
    }
  }

  // Brand lockup left
  const rowY = 82;
  ctx.fillStyle = V3_COLORS.brandGold;
  roundRect(ctx, padX, rowY - 12, 8, 24, 3);
  ctx.fill();

  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.font = `900 24px ${FONT}`;
  ctx.fillStyle = V3_COLORS.textPrimary;
  ctx.fillText(episode.seriesTitle || '盘前一档', padX + 18, rowY);

  // Chapter badge right
  ctx.font = `800 20px ${MONO}, ${FONT}`;
  const tagW = ctx.measureText(chapterTag).width + 26;
  const tagX = width - padX - tagW;
  ctx.fillStyle = `${accentColor}22`;
  roundRect(ctx, tagX, rowY - 17, tagW, 34, 8);
  ctx.fill();
  ctx.strokeStyle = `${accentColor}66`;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.textAlign = 'center';
  ctx.fillStyle = accentColor;
  ctx.fillText(chapterTag, tagX + tagW / 2, rowY + 1);
  ctx.restore();
}

/**
 * Subtle decorative footer watermark safely resting inside the lower platform zone (never critical info).
 */
export function drawV3SafeFooterWatermark(
  ctx: CanvasRenderingContext2D,
  width: number,
  text = '盘前一档 · 实盘核验 · 客观规律梳理（不构成投资建议）'
): void {
  ctx.save();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
  ctx.fillRect(V3_SAFE_ZONE.left, 1584, width - V3_SAFE_ZONE.left * 2, 1);

  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.font = `600 19px ${FONT}`;
  ctx.fillStyle = 'rgba(148, 163, 184, 0.48)';
  ctx.fillText(text, V3_SAFE_ZONE.left, 1600);
  ctx.restore();
}

/**
 * Snappy dark editorial transition curtain on scene entry (frames 0..8)
 */
export function drawV3SceneEntrySweep(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  localF: number,
  accentColor: string
): void {
  if (localF >= 8) return;
  const t = easeOutCubic(clamp(localF / 8, 0, 1));
  ctx.save();
  ctx.fillStyle = `rgba(7, 10, 16, ${(1 - t) * 0.65})`;
  ctx.fillRect(0, 0, width, height);

  const lineY = t * height;
  const grad = ctx.createLinearGradient(0, lineY - 24, 0, lineY + 24);
  grad.addColorStop(0, `${accentColor}00`);
  grad.addColorStop(0.5, `${accentColor}88`);
  grad.addColorStop(1, `${accentColor}00`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, lineY - 24, width, 48);
  ctx.restore();
}

/**
 * Preview-only Douyin / WeChat Channels / Xiaohongshu UI Safe-Zone overlay.
 * Drawn only inside VideoPlayerWorkspace when user enables Safe-Zone Preview (never baked into MP4!).
 */
export function drawPlatformSafeZoneOverlay(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number
): void {
  ctx.save();
  const topH = Math.round(height * (108 / 1920));
  const botY = Math.round(height * (V3_SAFE_ZONE.bottomPlatformCurtainY / 1920));
  const rightX = Math.round(width * (V3_SAFE_ZONE.rightRailX / 1080));
  const rightY = Math.round(height * (V3_SAFE_ZONE.rightRailStartY / 1920));

  // Top status / tabs bar danger zone
  ctx.fillStyle = 'rgba(239, 68, 68, 0.22)';
  ctx.fillRect(0, 0, width, topH);

  // Bottom caption / audio bar danger zone
  ctx.fillRect(0, botY, width, height - botY);

  // Right like/comment/bookmark icon column
  ctx.fillStyle = 'rgba(251, 146, 60, 0.24)';
  ctx.fillRect(rightX, rightY, width - rightX, botY - rightY);

  // Dashed green safe frame
  ctx.strokeStyle = '#34D399';
  ctx.lineWidth = 3;
  ctx.setLineDash([12, 8]);
  ctx.strokeRect(
    Math.round(width * (V3_SAFE_ZONE.left / 1080)),
    topH + 4,
    width - Math.round(width * (V3_SAFE_ZONE.left / 1080)) * 2,
    botY - topH - 8
  );
  ctx.setLineDash([]);

  // Labels
  ctx.font = `800 24px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#FECACA';
  ctx.fillText('▲ 顶部状态栏 / 导航禁区（勿放关键信息）', width / 2, topH / 2);
  ctx.fillText('▼ 抖音 / 视频号底部文案与进度条遮挡区（y > 1580）', width / 2, botY + (height - botY) / 2);

  // Simulated right action buttons
  const iconYs = [rightY + 95, rightY + 235, rightY + 375, rightY + 515];
  const icons = ['赞', '评', '藏', '转'];
  iconYs.forEach((iy, idx) => {
    if (iy + 40 > botY) return;
    ctx.fillStyle = 'rgba(15, 23, 42, 0.72)';
    ctx.beginPath();
    ctx.arc(rightX + (width - rightX) / 2, iy, 34, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(251, 146, 60, 0.8)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = '#FED7AA';
    ctx.font = `800 22px ${FONT}`;
    ctx.fillText(icons[idx], rightX + (width - rightX) / 2, iy + 1);
  });

  ctx.restore();
}
