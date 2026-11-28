import { clamp, easeOutCubic, lerp } from '../../timeline';
import type { HookSceneData } from '../schema';
import { getHookExitState } from '../timeline';
import {
  FONT,
  MONO,
  drawCroppedCoverImage,
  easeOutBack,
  roundRect,
  type SceneRenderContext,
} from './primitives';

/**
 * Brand-new V4 2-Act Emotional Reversal Hook:
 * Act 1 (midnight panic staring at crashing US markets) -> whip-flash cut ->
 * Act 2 (morning deep-V bounce relief dance) + live real Nasdaq deep-V curve.
 * Strictly framed inside 4-side Douyin safe margins with zero legacy danmaku/comic boilerplate.
 */
function renderV4ReversalCutHook(rc: SceneRenderContext, data: HookSceneData): void {
  const { ctx, frame, localFrame: localF, shot, timeline, assets } = rc;
  const { width, height, totalFrames } = timeline;
  const exit = getHookExitState(localF, shot.durationFrames);

  // Full-bleed edge-to-edge 1080×1920 Douyin fullscreen video (zero outer black borders!)
  const stageX = 0;
  const stageY = 0;
  const stageW = width;
  const stageH = height;
  const hudX = 40;
  const hudW = width - hudX * 2;
  const hudTop = 112; // below Douyin top status/tabs bar
  const hudBottom = height - 256; // above Douyin bottom caption/progress zone

  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, width, height);

  if (exit.isCleared) {
    return;
  }

  const cfg = data.reversalConfig ?? {
    cutFrame: 37,
    act1TimeBadge: '03:00 · 熬夜盯美股',
    act1MetricBadge: '纳指 -4.33%',
    act1Headline: '半夜看美股：心凉半截',
    act1Subline: '纳指盘中跌超 4.3% · 费半一度砸穿 -7.7%',
    act2TimeBadge: '08:30 · 早上醒来',
    act2MetricBadge: '深V -0.62%',
    act2Headline: '尾盘深V拉回 · 虚惊一场?!',
    act2Subline: '40秒看清今早3条硬核主线 ↓',
    deepVCurve: [-3.78, -4.33, -4.08, -3.52, -4.07, -3.96, -4.13, -4.02, -4.08, -3.21, -2.29, -2.0, -1.79, -1.27, -0.77, -0.59, -0.66, -0.84, -0.96, -0.62],
  };

  const cutF = clamp(cfg.cutFrame, 20, shot.durationFrames - 18);
  const isAct2 = localF >= cutF;
  const actAge = isAct2 ? localF - cutF : localF;

  // Map localF directly 1:1 across the pre-stitched 2-cut vertical video
  const videoFrames = data.videoSrc ? assets.videoFramesBySrc[data.videoSrc] : undefined;
  const liveVideo = data.videoSrc ? assets.videosBySrc[data.videoSrc] : undefined;
  const posterImg = data.posterSrc ? assets.imagesBySrc[data.posterSrc] : undefined;

  const vidProg = clamp(localF / Math.max(1, shot.durationFrames - 4), 0, 0.999);
  let mediaSrc: CanvasImageSource | null | undefined = null;
  if (videoFrames && videoFrames.length > 0) {
    const idx = Math.min(videoFrames.length - 1, Math.floor(vidProg * videoFrames.length));
    mediaSrc = videoFrames[idx];
  } else if (liveVideo && liveVideo.readyState >= 2) {
    mediaSrc = liveVideo;
  } else if (posterImg) {
    mediaSrc = posterImg;
  }

  // Subtle camera punch shake on Act 1 entry (0..7) and Act 2 whip-cut (cutF..cutF+7)
  let shakeMag = 0;
  if (localF < 8) {
    shakeMag = (1 - localF / 8) * 7;
  } else if (localF >= cutF && localF < cutF + 8) {
    shakeMag = (1 - (localF - cutF) / 8) * 11;
  }
  const shakeX = shakeMag ? Math.sin(localF * 3.2) * shakeMag : 0;
  const shakeY = shakeMag ? Math.cos(localF * 2.9) * shakeMag * 0.7 : 0;

  // Shutter exit geometry
  const closeE = easeOutCubic(exit.videoClose);
  const clipH = Math.max(0, stageH * (1 - closeE));
  const clipY = stageY + (stageH - clipH) / 2;

  const accentColor = isAct2 ? '#FBBF24' : '#F87171';
  const secondaryColor = isAct2 ? '#34D399' : '#EF4444';

  // Subtle colored outer ambient glow behind safe stage
  const outerGlow = ctx.createRadialGradient(
    width / 2,
    stageY + stageH * 0.45,
    80,
    width / 2,
    stageY + stageH * 0.45,
    620
  );
  outerGlow.addColorStop(0, isAct2 ? 'rgba(251, 191, 36, 0.24)' : 'rgba(239, 68, 68, 0.22)');
  outerGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = outerGlow;
  ctx.fillRect(0, 0, width, height);

  if (clipH > 2) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(stageX, clipY, stageW, clipH);
    ctx.clip();
    ctx.globalAlpha = 1 - closeE * 0.48;

    // 1. Live-action 2-cut real human video with per-act kinetic push-in
    const actZoom = isAct2
      ? lerp(1.12, 1.03, easeOutCubic(clamp(actAge / 14, 0, 1)))
      : lerp(1.01, 1.09, easeOutCubic(clamp(actAge / Math.max(1, cutF), 0, 1)));

    drawCroppedCoverImage(
      ctx,
      mediaSrc,
      stageX + shakeX,
      stageY + shakeY,
      stageW,
      stageH,
      { x: 0, y: 0, w: 1, h: 1 },
      actZoom,
      0,
      0,
      true
    );

    // 2. Mood grading vignette (Act 1: pulsing midnight crimson alarm; Act 2: warm golden relief)
    const pulse = 0.55 + 0.45 * Math.sin(localF * 0.45);
    const vig = ctx.createRadialGradient(
      stageX + stageW * 0.5,
      stageY + stageH * 0.42,
      stageW * 0.22,
      stageX + stageW * 0.5,
      stageY + stageH * 0.48,
      stageH * 0.72
    );
    if (!isAct2) {
      vig.addColorStop(0, 'rgba(15, 23, 42, 0)');
      vig.addColorStop(0.65, `rgba(127, 29, 29, ${0.18 + pulse * 0.14})`);
      vig.addColorStop(1, 'rgba(3, 7, 15, 0.78)');
    } else {
      vig.addColorStop(0, 'rgba(251, 191, 36, 0.05)');
      vig.addColorStop(0.68, 'rgba(15, 23, 42, 0.16)');
      vig.addColorStop(1, 'rgba(4, 9, 18, 0.72)');
    }
    ctx.fillStyle = vig;
    ctx.fillRect(stageX, stageY, stageW, stageH);

    // Top & bottom subtle cinematic scrims so badges & deep-V HUD pop cleanly on full-bleed 1080×1920
    const topScrim = ctx.createLinearGradient(0, 0, 0, 280);
    topScrim.addColorStop(0, 'rgba(4, 7, 14, 0.84)');
    topScrim.addColorStop(1, 'rgba(4, 7, 14, 0)');
    ctx.fillStyle = topScrim;
    ctx.fillRect(0, 0, width, 280);

    const botScrim = ctx.createLinearGradient(0, height - 760, 0, height);
    botScrim.addColorStop(0, 'rgba(4, 7, 14, 0)');
    botScrim.addColorStop(0.36, 'rgba(4, 7, 14, 0.72)');
    botScrim.addColorStop(0.75, 'rgba(4, 7, 14, 0.92)');
    botScrim.addColorStop(1, 'rgba(4, 7, 14, 0.98)');
    ctx.fillStyle = botScrim;
    ctx.fillRect(0, height - 760, width, 760);

    // 3. Whip-flash reversal burst across the exact cut frame (cutF - 2 .. cutF + 6)
    const cutDist = Math.abs(localF - cutF);
    if (cutDist <= 5) {
      const flashAlpha = Math.pow(1 - cutDist / 5.5, 1.5);
      ctx.fillStyle = `rgba(254, 249, 195, ${flashAlpha * 0.78})`;
      ctx.fillRect(stageX, stageY, stageW, stageH);

      // Horizontal kinetic speed streaks on whip transition
      ctx.save();
      ctx.globalAlpha = flashAlpha * 0.85;
      for (let s = 0; s < 10; s++) {
        const sy = stageY + 140 + ((s * 149) % (stageH - 280));
        const sw = 240 + (s % 3) * 180;
        const sx = stageX + ((s * 231 + localF * 90) % Math.max(100, stageW - sw));
        ctx.fillStyle = s % 2 === 0 ? '#FEF08A' : '#FFFFFF';
        ctx.fillRect(sx, sy, sw, 4);
      }
      ctx.restore();
    }

    // 4. Top-row Time & Live Metric Badges (strictly inside Douyin safe top zone)
    const badgeExitE = easeOutCubic(exit.badgeExit);
    if (badgeExitE < 0.99) {
      const bPop = easeOutBack(clamp(actAge / 8, 0, 1));
      const bY = hudTop - badgeExitE * 60;

      ctx.save();
      ctx.globalAlpha = 1 - badgeExitE;

      // Left timestamp pill
      const timeText = isAct2 ? cfg.act2TimeBadge : cfg.act1TimeBadge;
      ctx.font = `900 28px ${MONO}, ${FONT}`;
      const timeW = ctx.measureText(timeText).width + 64;
      const leftX = hudX;
      ctx.save();
      ctx.translate(leftX + timeW / 2, bY + 28);
      ctx.scale(lerp(0.86, 1, bPop), lerp(0.86, 1, bPop));
      ctx.fillStyle = 'rgba(7, 11, 20, 0.9)';
      roundRect(ctx, -timeW / 2, -28, timeW, 56, 14);
      ctx.fill();
      ctx.strokeStyle = `${accentColor}AA`;
      ctx.lineWidth = 2.2;
      ctx.stroke();

      // Pulsing status dot
      ctx.fillStyle = accentColor;
      ctx.beginPath();
      ctx.arc(-timeW / 2 + 24, 0, 7.5 * (0.85 + 0.2 * pulse), 0, Math.PI * 2);
      ctx.fill();

      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#F8FAFC';
      ctx.fillText(timeText, -timeW / 2 + 44, 1);
      ctx.restore();

      // Right live metric badge
      const metricText = isAct2 ? cfg.act2MetricBadge : cfg.act1MetricBadge;
      ctx.font = `900 30px ${MONO}, ${FONT}`;
      const metricW = ctx.measureText(metricText).width + 44;
      const rightX = hudX + hudW - metricW;
      ctx.save();
      ctx.translate(rightX + metricW / 2, bY + 28);
      ctx.scale(lerp(0.82, 1, bPop), lerp(0.82, 1, bPop));
      ctx.fillStyle = isAct2 ? 'rgba(251, 191, 36, 0.2)' : 'rgba(220, 38, 38, 0.28)';
      roundRect(ctx, -metricW / 2, -28, metricW, 56, 14);
      ctx.fill();
      ctx.strokeStyle = accentColor;
      ctx.lineWidth = 2.5;
      ctx.stroke();

      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = isAct2 ? '#FEF08A' : '#FCA5A5';
      ctx.fillText(metricText, 0, 1);
      ctx.restore();

      ctx.restore();
    }

    // 5. Lower-Third Live Deep-V Intraday Curve + Crisp Douyin-Native Reversal Caption (above bottom 256px Douyin UI)
    const headExitE = easeOutCubic(exit.headlineExit);
    if (headExitE < 0.99) {
      const cardX = hudX;
      const cardW = hudW;
      const cardH = 356;
      const cardY = hudBottom - cardH + headExitE * 280;
      const capPop = easeOutBack(clamp(actAge / 9, 0, 1));

      ctx.save();
      ctx.globalAlpha = 1 - headExitE;

      // Obsidian frosted HUD card
      ctx.shadowColor = 'rgba(0, 0, 0, 0.82)';
      ctx.shadowBlur = 32;
      ctx.fillStyle = 'rgba(7, 11, 19, 0.92)';
      roundRect(ctx, cardX, cardY, cardW, cardH, 24);
      ctx.fill();
      ctx.shadowBlur = 0;

      const borderGrad = ctx.createLinearGradient(cardX, cardY, cardX + cardW, cardY + cardH);
      borderGrad.addColorStop(0, accentColor);
      borderGrad.addColorStop(0.5, 'rgba(255, 255, 255, 0.22)');
      borderGrad.addColorStop(1, secondaryColor);
      ctx.strokeStyle = borderGrad;
      ctx.lineWidth = 2.8;
      ctx.stroke();

      // Live real Nasdaq Deep-V curve window inside upper half of card
      const pts = cfg.deepVCurve.length >= 4 ? cfg.deepVCurve : [-3.8, -4.3, -2.5, -0.62];
      const plotX = cardX + 32;
      const plotY = cardY + 26;
      const plotW = cardW - 64;
      const plotH = 128;

      // Zero baseline dashed reference
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.28)';
      ctx.lineWidth = 1.6;
      ctx.setLineDash([7, 7]);
      ctx.beginPath();
      ctx.moveTo(plotX, plotY + 14);
      ctx.lineTo(plotX + plotW, plotY + 14);
      ctx.stroke();
      ctx.setLineDash([]);

      // Map curve progress: Act 1 draws plunging left trough (0..42%), Act 2 rockets up the deep-V bounce (42%..100%)
      const troughRatio = 0.42;
      const drawRatio = !isAct2
        ? lerp(0.06, troughRatio, easeOutCubic(clamp(localF / Math.max(1, cutF - 2), 0, 1)))
        : lerp(troughRatio, 1.0, easeOutCubic(clamp(actAge / 22, 0, 1)));

      const minV = Math.min(...pts) - 0.35;
      const maxV = Math.max(0.2, ...pts);
      const valToY = (v: number) => plotY + 14 + ((maxV - v) / Math.max(0.5, maxV - minV)) * (plotH - 22);
      const totalSegs = pts.length - 1;
      const curF = drawRatio * totalSegs;
      const fullIdx = Math.min(totalSegs, Math.floor(curF));
      const frac = curF - fullIdx;

      const coords: Array<{ x: number; y: number }> = [];
      for (let i = 0; i <= fullIdx; i++) {
        coords.push({
          x: plotX + (i / totalSegs) * plotW,
          y: valToY(pts[i]),
        });
      }
      if (fullIdx < totalSegs && frac > 0.001) {
        coords.push({
          x: plotX + ((fullIdx + frac) / totalSegs) * plotW,
          y: valToY(lerp(pts[fullIdx], pts[fullIdx + 1], frac)),
        });
      }

      if (coords.length >= 2) {
        // Subtle gradient area fill under curve
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(coords[0].x, plotY + plotH);
        for (const p of coords) ctx.lineTo(p.x, p.y);
        ctx.lineTo(coords[coords.length - 1].x, plotY + plotH);
        ctx.closePath();
        const areaG = ctx.createLinearGradient(0, plotY, 0, plotY + plotH);
        areaG.addColorStop(0, isAct2 ? 'rgba(251, 191, 36, 0.34)' : 'rgba(239, 68, 68, 0.36)');
        areaG.addColorStop(1, 'rgba(7, 11, 19, 0)');
        ctx.fillStyle = areaG;
        ctx.fill();
        ctx.restore();

        // Crisp luminous curve stroke
        ctx.save();
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        ctx.shadowColor = accentColor;
        ctx.shadowBlur = 16;
        ctx.strokeStyle = isAct2 ? '#FDE047' : '#F87171';
        ctx.lineWidth = 6.5;
        ctx.beginPath();
        ctx.moveTo(coords[0].x, coords[0].y);
        for (let i = 1; i < coords.length; i++) ctx.lineTo(coords[i].x, coords[i].y);
        ctx.stroke();
        ctx.shadowBlur = 0;

        // Live glowing endpoint beacon
        const tip = coords[coords.length - 1];
        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath();
        ctx.arc(tip.x, tip.y, 10, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = accentColor;
        ctx.beginPath();
        ctx.arc(tip.x, tip.y, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      // Curve anchor labels
      ctx.textBaseline = 'top';
      ctx.font = `800 21px ${MONO}, ${FONT}`;
      ctx.textAlign = 'left';
      ctx.fillStyle = 'rgba(203, 213, 225, 0.85)';
      ctx.fillText('NASDAQ 隔夜真实分时', plotX, plotY);

      ctx.textAlign = 'right';
      ctx.fillStyle = isAct2 ? '#FDE047' : '#FCA5A5';
      ctx.fillText(isAct2 ? '深V收复 +3.7% 失地' : '盘中急杀探底 -4.33%', plotX + plotW, plotY);

      // Divider hairline
      ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
      ctx.fillRect(cardX + 32, cardY + 170, cardW - 64, 1.5);

      // Bold punchy Douyin-native headline (Act 1 vs Act 2 flip!)
      const headline = isAct2 ? cfg.act2Headline : cfg.act1Headline;
      const subline = isAct2 ? cfg.act2Subline : cfg.act1Subline;

      ctx.save();
      ctx.translate(cardX + cardW / 2, cardY + 232);
      ctx.scale(lerp(0.84, 1, capPop), lerp(0.84, 1, capPop));
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `900 64px ${FONT}`;
      ctx.lineWidth = 10;
      ctx.strokeStyle = 'rgba(4, 7, 14, 0.96)';
      ctx.strokeText(headline, 0, 0, cardW - 56);
      ctx.fillStyle = isAct2 ? '#FEF08A' : '#FFFFFF';
      ctx.fillText(headline, 0, 0, cardW - 56);
      ctx.restore();

      // Clean subline / transition cue
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `800 30px ${FONT}`;
      ctx.fillStyle = isAct2 ? '#34D399' : '#FCA5A5';
      ctx.fillText(subline, cardX + cardW / 2, cardY + 306, cardW - 56);

      ctx.restore();
    }

    ctx.restore();

    // Luminous razor seam as shutter snaps closed into MarketChronoBoard
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

  // Clean slim top progress hairline across full-bleed top edge
  const topExitE = easeOutCubic(exit.badgeExit);
  if (topExitE < 0.99) {
    const progress = clamp(frame / Math.max(1, totalFrames - 1), 0, 1);
    ctx.save();
    ctx.globalAlpha = 1 - topExitE;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.16)';
    ctx.fillRect(0, 10, width, 5);
    ctx.fillStyle = accentColor;
    ctx.fillRect(0, 10, Math.max(14, width * progress), 5);
    ctx.restore();
  }
}

/**
 * Scene: hook_live_video
 * Snappy Live-Action Hook + Whip-In Scannable Danmaku + Pop-Art Kinetic Stamp -> Razor Curtain Clear
 * Also supports `hookStyle: 'v4_reversal_cut'` for modern 2-act real-human emotional reversal hooks.
 */
export function renderHookLiveVideoScene(rc: SceneRenderContext, data: HookSceneData): void {
  if (data.hookStyle === 'v4_reversal_cut') {
    renderV4ReversalCutHook(rc, data);
    return;
  }

  const { ctx, frame, localFrame: localF, shot, timeline, assets } = rc;
  const { width, height, totalFrames } = timeline;
  const exit = getHookExitState(localF, shot.durationFrames);

  const safeInset = Boolean(data.safeInset);
  const stageX = safeInset ? 48 : 0;
  const stageY = safeInset ? 96 : 0;
  const stageW = safeInset ? width - 96 : width;
  const stageH = safeInset ? height - 96 - 252 : height; // bottom 252px pure black safe zone for Douyin
  const stageR = safeInset ? 28 : 0;

  // Clean slate base (pure black in safeInset mode to match v4 pure-black aesthetic)
  ctx.fillStyle = safeInset ? '#000000' : '#090D14';
  ctx.fillRect(0, 0, width, height);

  if (exit.isCleared) {
    return;
  }

  // Pick continuous live-action frame with fallback: pre-sampled frames -> HTMLVideoElement -> poster image
  const videoFrames = data.videoSrc ? assets.videoFramesBySrc[data.videoSrc] : undefined;
  const liveVideo = data.videoSrc ? assets.videosBySrc[data.videoSrc] : undefined;
  const posterImg = data.posterSrc ? assets.imagesBySrc[data.posterSrc] : undefined;

  const activeEndF = Math.max(20, shot.durationFrames - 22);
  let vidProg = clamp(localF / activeEndF, 0, 1);
  if (localF > activeEndF) {
    const tailWave = 0.5 - 0.5 * Math.cos(((localF - activeEndF) / 14) * Math.PI * 2);
    vidProg = clamp(0.84 + 0.16 * tailWave, 0, 1);
  }

  let mediaSrc: CanvasImageSource | null | undefined = null;
  if (videoFrames && videoFrames.length > 0) {
    const idx = Math.min(videoFrames.length - 1, Math.floor(vidProg * (videoFrames.length - 1)));
    mediaSrc = videoFrames[idx];
  } else if (liveVideo && liveVideo.readyState >= 2) {
    mediaSrc = liveVideo;
  } else if (posterImg) {
    mediaSrc = posterImg;
  }

  // Micro camera impact shake on slam peak (f=7..15) in safeInset mode
  const shakeMag = safeInset && localF >= 7 && localF <= 16 ? (1 - (localF - 7) / 9) * 10 : 0;
  const shakeX = shakeMag ? Math.sin(localF * 2.9) * shakeMag : 0;
  const shakeY = shakeMag ? Math.cos(localF * 3.4) * shakeMag * 0.7 : 0;

  // 1. Live-Action Video Layer (shutter close with luminous razor seam)
  const closeE = easeOutCubic(exit.videoClose);
  const clipH = Math.max(0, stageH * (1 - closeE));
  const clipY = stageY + (stageH - clipH) / 2;

  if (clipH > 2) {
    ctx.save();
    if (safeInset) {
      roundRect(ctx, stageX, clipY, stageW, clipH, Math.min(stageR, clipH / 2));
      ctx.clip();
    } else {
      ctx.beginPath();
      ctx.rect(stageX, clipY, stageW, clipH);
      ctx.clip();
    }
    ctx.globalAlpha = 1 - closeE * 0.52;

    const zoomSpanF = Math.max(24, shot.durationFrames - 14);
    const liveZoom = lerp(1.02, 1.15, easeOutCubic(clamp(localF / zoomSpanF, 0, 1)));
    drawCroppedCoverImage(
      ctx,
      mediaSrc,
      stageX + shakeX,
      stageY + shakeY,
      stageW,
      stageH,
      { x: 0, y: 0, w: 1, h: 1 },
      liveZoom,
      0,
      0,
      true
    );

    // Warm impact flash synced to f=9 slam
    const flashT = clamp(1 - Math.abs(localF - 9) / 8, 0, 1);
    if (flashT > 0) {
      const flashCY = safeInset ? stageY + stageH - 180 : 1580;
      const flashG = ctx.createRadialGradient(width / 2, flashCY, 70, width / 2, flashCY, 860);
      flashG.addColorStop(0, `rgba(251, 191, 36, ${0.42 * flashT})`);
      flashG.addColorStop(0.55, `rgba(239, 68, 68, ${0.28 * flashT})`);
      flashG.addColorStop(1, 'rgba(9, 13, 20, 0)');
      ctx.fillStyle = flashG;
      ctx.fillRect(stageX, stageY, stageW, stageH);
    }

    const topScrim = ctx.createLinearGradient(0, stageY, 0, stageY + 340);
    topScrim.addColorStop(0, 'rgba(5, 8, 15, 0.9)');
    topScrim.addColorStop(0.5, 'rgba(5, 8, 15, 0.45)');
    topScrim.addColorStop(1, 'rgba(5, 8, 15, 0)');
    ctx.fillStyle = topScrim;
    ctx.fillRect(stageX, stageY, stageW, 340);

    const botScrimH = safeInset ? 720 : 920;
    const botScrim = ctx.createLinearGradient(
      0,
      stageY + stageH - botScrimH,
      0,
      stageY + stageH
    );
    botScrim.addColorStop(0, 'rgba(5, 8, 15, 0)');
    botScrim.addColorStop(0.45, 'rgba(5, 8, 15, 0.72)');
    botScrim.addColorStop(1, 'rgba(5, 8, 15, 0.96)');
    ctx.fillStyle = botScrim;
    ctx.fillRect(stageX, stageY + stageH - botScrimH, stageW, botScrimH);
    ctx.restore();

    // Sleek ambient bezel frame in safeInset mode
    if (safeInset && closeE < 0.85) {
      ctx.save();
      ctx.globalAlpha = (1 - closeE) * 0.85;
      roundRect(ctx, stageX, clipY, stageW, clipH, Math.min(stageR, clipH / 2));
      const rimGrad = ctx.createLinearGradient(stageX, clipY, stageX + stageW, clipY + clipH);
      rimGrad.addColorStop(0, 'rgba(251, 191, 36, 0.45)');
      rimGrad.addColorStop(0.5, 'rgba(255, 255, 255, 0.14)');
      rimGrad.addColorStop(1, 'rgba(239, 68, 68, 0.45)');
      ctx.strokeStyle = rimGrad;
      ctx.lineWidth = 2.5;
      ctx.stroke();
      ctx.restore();
    }

    // Luminous razor seam accent as shutter snaps closed
    if (closeE > 0.08 && closeE < 0.98) {
      const seamAlpha = Math.sin(closeE * Math.PI) * 0.95;
      ctx.save();
      ctx.globalAlpha = seamAlpha;
      const seamGrad = ctx.createLinearGradient(stageX, 0, stageX + stageW, 0);
      seamGrad.addColorStop(0, 'rgba(56, 189, 248, 0)');
      seamGrad.addColorStop(0.25, '#38BDF8');
      seamGrad.addColorStop(0.5, '#FEF08A');
      seamGrad.addColorStop(0.75, '#F87171');
      seamGrad.addColorStop(1, 'rgba(248, 113, 113, 0)');
      ctx.fillStyle = seamGrad;
      ctx.fillRect(stageX, clipY - 2, stageW, 4);
      ctx.fillRect(stageX, clipY + clipH - 2, stageW, 4);
      ctx.restore();
    }
  }

  // 2. Clean Slim Top Progress Line ONLY
  const topExitE = easeOutCubic(exit.badgeExit);
  if (topExitE < 0.99) {
    const progress = clamp(frame / Math.max(1, totalFrames - 1), 0, 1);
    const barY = safeInset ? 74 : 46;
    const barX = safeInset ? 56 : 56;
    const barW = width - barX * 2;
    ctx.save();
    ctx.globalAlpha = 1 - topExitE;
    ctx.fillStyle = 'rgba(255,255,255,0.16)';
    ctx.fillRect(barX, barY, barW, 5);
    ctx.fillStyle = '#FBBF24';
    ctx.fillRect(barX, barY, Math.max(14, barW * progress), 5);
    ctx.restore();
  }

  // 2B. Optional Top Overnight Live Ticker Strip (inside safe bezel)
  if (data.tickerStrip && topExitE < 0.99) {
    const stripIn = easeOutCubic(clamp(localF / 8, 0, 1));
    const stripX = stageX + 24;
    const stripY = stageY + 24;
    const stripW = stageW - 48;
    const stripH = 52;
    ctx.save();
    ctx.globalAlpha = stripIn * (1 - topExitE);
    ctx.translate(0, lerp(-18, 0, stripIn));
    ctx.fillStyle = 'rgba(7, 11, 20, 0.88)';
    roundRect(ctx, stripX, stripY, stripW, stripH, 14);
    ctx.fill();
    ctx.strokeStyle = 'rgba(248, 113, 113, 0.55)';
    ctx.lineWidth = 1.8;
    ctx.stroke();

    // Blinking crimson alert dot
    const pulse = 0.55 + 0.45 * Math.sin(localF * 0.42);
    ctx.fillStyle = `rgba(239, 68, 68, ${pulse})`;
    ctx.beginPath();
    ctx.arc(stripX + 26, stripY + stripH / 2, 7.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.font = `800 24px ${MONO}, ${FONT}`;
    ctx.fillStyle = '#F8FAFC';
    ctx.fillText(data.tickerStrip, stripX + 46, stripY + stripH / 2 + 1, stripW - 64);
    ctx.restore();
  }

  // 2C. Optional Real-Photo Polaroid Meme Sticker Card popping in on Beat 2
  const memeExitE = easeOutCubic(exit.danmakuExit);
  if (data.memeCard && localF >= data.memeCard.enterFrame && memeExitE < 0.99) {
    const mc = data.memeCard;
    const memeImg = assets.imagesBySrc[mc.imageSrc];
    const age = localF - mc.enterFrame;
    const popP = clamp(age / 10, 0, 1);
    const popS = lerp(0.25, 1.0, easeOutBack(popP));
    const cardW = 312;
    const cardH = 330;
    const anchorX = stageX + stageW - cardW / 2 - 26 + memeExitE * 420;
    const anchorY = stageY + stageH - 538;
    const wobble = Math.sin(age * 0.25) * 0.02;

    ctx.save();
    ctx.globalAlpha = clamp(age / 5, 0, 1) * (1 - memeExitE);
    ctx.translate(anchorX, anchorY);
    ctx.rotate(0.075 + wobble);
    ctx.scale(popS, popS);

    // Hard comic drop shadow
    ctx.shadowColor = 'rgba(0, 0, 0, 0.78)';
    ctx.shadowBlur = 32;
    ctx.shadowOffsetY = 14;
    ctx.fillStyle = '#F8FAFC';
    roundRect(ctx, -cardW / 2, -cardH / 2, cardW, cardH, 16);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;

    // Photo window inside Polaroid
    const photoX = -cardW / 2 + 14;
    const photoY = -cardH / 2 + 14;
    const photoW = cardW - 28;
    const photoH = 236;
    ctx.save();
    roundRect(ctx, photoX, photoY, photoW, photoH, 10);
    ctx.clip();
    drawCroppedCoverImage(
      ctx,
      memeImg,
      photoX,
      photoY,
      photoW,
      photoH,
      { x: 0.05, y: 0.02, w: 0.9, h: 0.92 },
      lerp(1.06, 1.14, clamp(age / 36, 0, 1)),
      0,
      0,
      true
    );
    ctx.restore();

    // Top crimson tape sticker
    ctx.fillStyle = '#DC2626';
    roundRect(ctx, -84, -cardH / 2 - 16, 168, 36, 8);
    ctx.fill();
    ctx.strokeStyle = '#FEF08A';
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `900 20px ${FONT}`;
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(mc.topCaption, 0, -cardH / 2 + 3, 152);

    // Handwritten-feel bold bottom meme punchline
    ctx.font = `900 31px ${FONT}`;
    ctx.fillStyle = '#0F172A';
    ctx.fillText(mc.bottomCaption, 0, cardH / 2 - 38, cardW - 24);
    ctx.restore();
  }

  // 3. Concise Whip-In Danmaku Lanes (clipped cleanly inside bezel when safeInset)
  const dmExitE = easeOutCubic(exit.danmakuExit);
  if (dmExitE < 0.99 && data.danmakuItems.length > 0) {
    ctx.save();
    if (safeInset) {
      roundRect(ctx, stageX, stageY, stageW, stageH, stageR);
      ctx.clip();
    }
    ctx.globalAlpha = 1 - dmExitE;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';

    data.danmakuItems.forEach((dm, idx) => {
      if (localF < dm.delay) return;
      const df = localF - dm.delay;
      ctx.font = `900 ${dm.fontSize}px ${FONT}`;
      const textW = ctx.measureText(dm.text).width;

      const whipIn = easeOutCubic(clamp(df / 10, 0, 1));
      const holdDrift = Math.max(0, df - 10) * dm.speed * 0.52;
      const minLeft = safeInset ? stageX + 26 : 48;
      const maxRight = safeInset ? stageX + stageW - 26 : width - 68;
      const targetAnchorX = Math.min(dm.offset, maxRight - textW);
      const posX =
        lerp(width + 48, Math.max(minLeft, targetAnchorX), whipIn) -
        holdDrift -
        dmExitE * (1120 + idx * 140);

      ctx.fillStyle = 'rgba(7, 10, 18, 0.84)';
      roundRect(ctx, posX - 20, dm.y - dm.fontSize * 0.68, textW + 40, dm.fontSize * 1.36, 16);
      ctx.fill();

      ctx.strokeStyle = `${dm.color}55`;
      ctx.lineWidth = 2.2;
      ctx.stroke();

      ctx.lineWidth = 9;
      ctx.strokeStyle = 'rgba(9, 13, 20, 0.98)';
      ctx.strokeText(dm.text, posX, dm.y);
      ctx.fillStyle = dm.color;
      ctx.fillText(dm.text, posX, dm.y);
    });

    ctx.restore();
  }

  // 4. Snappy Pop-Art Kinetic Stamp Composition driven by data.wordmark
  const headExitE = easeOutCubic(exit.headlineExit);
  const wm = data.wordmark;
  if (localF >= 3 && headExitE < 0.99) {
    const baseHeroY = safeInset ? stageY + stageH - 178 : 1565;
    const heroY = baseHeroY + lerp(0, 380, headExitE);
    const enterP = clamp((localF - 4) / 10, 0, 1);
    const springScale =
      (enterP < 1 ? lerp(2.15, 1.0, easeOutBack(enterP)) : 1 + 0.02 * Math.sin(localF * 0.24)) *
      lerp(1.0, 0.86, headExitE);

    // A) Dynamic rotating radial comic speed rays + concentric twin shockwave rings
    if (localF >= 5 && headExitE < 0.35) {
      const rayAlpha = clamp((localF - 5) / 7, 0, 1) * (1 - headExitE) * 0.26;
      ctx.save();
      if (safeInset) {
        roundRect(ctx, stageX, stageY, stageW, stageH, stageR);
        ctx.clip();
      }
      ctx.translate(width / 2, heroY);
      ctx.rotate(localF * 0.018);
      const rayCount = 16;
      for (let r = 0; r < rayCount; r++) {
        const a0 = (r / rayCount) * Math.PI * 2;
        const a1 = a0 + Math.PI / (rayCount * 1.7);
        ctx.fillStyle =
          r % 2 === 0
            ? `rgba(251, 191, 36, ${rayAlpha})`
            : `rgba(239, 68, 68, ${rayAlpha * 0.8})`;
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
      if (safeInset) {
        roundRect(ctx, stageX, stageY, stageW, stageH, stageR);
        ctx.clip();
      }
      ctx.strokeStyle = `rgba(253, 224, 71, ${waveAlpha})`;
      ctx.lineWidth = lerp(9, 2, waveT);
      ctx.beginPath();
      ctx.ellipse(
        width / 2,
        heroY,
        lerp(95, 520, easeOutCubic(waveT)),
        lerp(34, 185, easeOutCubic(waveT)),
        0,
        0,
        Math.PI * 2
      );
      ctx.stroke();

      const wave2T = clamp((localF - 10) / 22, 0, 1);
      if (wave2T > 0) {
        ctx.strokeStyle = `rgba(56, 189, 248, ${(1 - wave2T) * 0.68})`;
        ctx.lineWidth = lerp(6, 1.5, wave2T);
        ctx.beginPath();
        ctx.ellipse(
          width / 2,
          heroY,
          lerp(70, 440, easeOutCubic(wave2T)),
          lerp(22, 145, easeOutCubic(wave2T)),
          0,
          0,
          Math.PI * 2
        );
        ctx.stroke();
      }
      ctx.restore();
    }

    // B) Tilted Pop-Art Sticker Tag above main wordmark (adaptive width)
    if (wm.badgeText) {
      const tagP = clamp((localF - 3) / 7, 0, 1);
      const tagScale = lerp(0.4, 1.0, easeOutBack(tagP));
      const tagWobble = Math.sin(localF * 0.26) * 0.024;
      ctx.save();
      ctx.font = `900 30px ${FONT}`;
      const badgeTextW = ctx.measureText(wm.badgeText).width;
      const stickerW = clamp(Math.max(392, badgeTextW + 64), 260, stageW - 88);
      const stickerAnchorX = clamp(
        width / 2 - (safeInset ? 110 : 140),
        stageX + 36 + stickerW / 2,
        stageX + stageW - 36 - stickerW / 2
      );

      ctx.globalAlpha = clamp(tagP * 2.2, 0, 1) * (1 - headExitE);
      ctx.translate(stickerAnchorX, heroY - (safeInset ? 140 : 154));
      ctx.rotate(-0.055 + tagWobble);
      ctx.scale(tagScale, tagScale);

      ctx.fillStyle = '#EF4444';
      roundRect(ctx, -stickerW / 2 + 8, -28, stickerW, 62, 16);
      ctx.fill();

      ctx.fillStyle = '#FDE047';
      roundRect(ctx, -stickerW / 2, -34, stickerW, 62, 16);
      ctx.fill();
      ctx.strokeStyle = '#090D14';
      ctx.lineWidth = 5;
      ctx.stroke();

      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#090D14';
      ctx.fillText(wm.badgeText, 0, -2);
      ctx.restore();
    }

    // C) Split Kinetic 3D Comic Wordmark with dynamic width-aware layout
    if (localF >= 4) {
      const leftText = wm.leftText ?? '';
      const stampText = wm.stampText ?? '';
      const heroText = wm.heroText ?? '';
      const exclaimText = wm.exclaimText ?? '';

      ctx.save();
      ctx.font = `900 116px ${FONT}`;
      const leftW = leftText ? ctx.measureText(leftText).width : 0;

      ctx.font = `900 94px ${FONT}`;
      const stampTextW = stampText ? ctx.measureText(stampText).width : 0;
      const stampBoxW = stampText ? Math.max(122, stampTextW + 30) : 0;

      ctx.font = `900 172px ${FONT}`;
      const heroW = heroText ? ctx.measureText(heroText).width : 0;

      ctx.font = `900 124px ${MONO}, ${FONT}`;
      const exW = exclaimText ? ctx.measureText(exclaimText).width : 0;

      // Compute balanced horizontal slots (matches classic -305 / -92 / 182 / 418 for 2+1+2+2 chars)
      interface Slot {
        kind: 'left' | 'stamp' | 'hero' | 'exclaim';
        width: number;
        gapAfter: number;
      }
      const slots: Slot[] = [];
      if (leftText) slots.push({ kind: 'left', width: leftW, gapAfter: 26 });
      if (stampText) slots.push({ kind: 'stamp', width: stampBoxW, gapAfter: 28 });
      if (heroText) slots.push({ kind: 'hero', width: heroW, gapAfter: 16 });
      if (exclaimText) slots.push({ kind: 'exclaim', width: exW, gapAfter: 0 });

      let totalW = 0;
      slots.forEach((s, i) => {
        totalW += s.width + (i < slots.length - 1 ? s.gapAfter : 0);
      });

      const centers: Record<Slot['kind'], number> = {
        left: -305,
        stamp: -92,
        hero: 182,
        exclaim: 418,
      };
      let cursorX = -totalW / 2;
      slots.forEach((s, i) => {
        centers[s.kind] = cursorX + s.width / 2;
        cursorX += s.width + (i < slots.length - 1 ? s.gapAfter : 0);
      });

      const fitMaxW = safeInset ? stageW - 68 : width - 108;
      const fitScale = totalW > 0 ? Math.min(1, fitMaxW / totalW) : 1;

      ctx.globalAlpha = clamp(enterP * 2.1, 0, 1) * (1 - headExitE);
      ctx.translate(width / 2, heroY);
      ctx.scale(springScale * fitScale, springScale * fitScale);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      const sway1 = Math.sin(localF * 0.22) * 5;

      // Part 1: leftText (crisp white with 3D cyan comic shadow, tilted -4deg)
      if (leftText) {
        ctx.save();
        ctx.translate(centers.left, sway1);
        ctx.rotate(-0.07);
        ctx.font = `900 116px ${FONT}`;
        ctx.fillStyle = '#38BDF8';
        ctx.fillText(leftText, 8, 9);
        ctx.lineWidth = 16;
        ctx.strokeStyle = '#090D14';
        ctx.strokeText(leftText, 0, 0);
        ctx.fillStyle = '#FFFFFF';
        ctx.fillText(leftText, 0, 0);
        ctx.restore();
      }

      // Part 2: stampText (center tilted coral-red comic stamp badge with yellow border)
      if (stampText) {
        const henP = clamp((localF - 6) / 8, 0, 1);
        const henS = lerp(0.3, 1.0, easeOutBack(henP));
        ctx.save();
        ctx.translate(centers.stamp, -8 - sway1 * 0.7);
        ctx.rotate(0.11 + Math.sin(localF * 0.28) * 0.025);
        ctx.scale(henS, henS);

        ctx.fillStyle = '#090D14';
        roundRect(ctx, -stampBoxW / 2 + 5, -62, stampBoxW, 128, 24);
        ctx.fill();

        ctx.fillStyle = '#EF4444';
        roundRect(ctx, -stampBoxW / 2 - 1, -68, stampBoxW, 128, 24);
        ctx.fill();
        ctx.strokeStyle = '#FDE047';
        ctx.lineWidth = 6;
        ctx.stroke();

        ctx.font = `900 94px ${FONT}`;
        ctx.lineWidth = 10;
        ctx.strokeStyle = '#090D14';
        ctx.strokeText(stampText, -1, -2);
        ctx.fillStyle = '#FFFFFF';
        ctx.fillText(stampText, -1, -2);
        ctx.restore();
      }

      // Part 3: heroText (oversized 172px 3D crimson-extruded gold hero with specular sheen)
      if (heroText) {
        const keyP = clamp((localF - 7) / 9, 0, 1);
        const keyS = keyP < 1 ? lerp(2.2, 1.0, easeOutBack(keyP)) : 1.0;
        const gradHalfW = Math.max(150, heroW / 2);
        ctx.save();
        ctx.translate(centers.hero, sway1 * 0.6);
        ctx.rotate(-0.025);
        ctx.scale(keyS, keyS);
        ctx.font = `900 172px ${FONT}`;

        ctx.fillStyle = '#B91C1C';
        ctx.fillText(heroText, 10, 12);

        ctx.lineWidth = 20;
        ctx.strokeStyle = '#090D14';
        ctx.strokeText(heroText, 0, 0);

        const titleGrad = ctx.createLinearGradient(-gradHalfW, -85, gradHalfW, 85);
        const sheenPos = clamp(((localF - 14) % 24) / 22, 0, 1);
        titleGrad.addColorStop(0, '#FEF08A');
        titleGrad.addColorStop(Math.max(0.05, sheenPos - 0.14), '#FBBF24');
        if (localF >= 14 && sheenPos > 0.05 && sheenPos < 0.95) {
          titleGrad.addColorStop(sheenPos, '#FFFFFF');
        }
        titleGrad.addColorStop(Math.min(0.95, sheenPos + 0.16), '#F59E0B');
        titleGrad.addColorStop(1, '#FB923C');
        ctx.fillStyle = titleGrad;
        ctx.fillText(heroText, 0, 0);
        ctx.restore();
      }

      // Part 4: exclaimText popping on the right
      if (exclaimText) {
        const exP = clamp((localF - 10) / 8, 0, 1);
        const exS = lerp(0.2, 1.0, easeOutBack(exP));
        ctx.save();
        ctx.translate(centers.exclaim, -22 + Math.sin(localF * 0.34) * 6);
        ctx.rotate(0.18);
        ctx.scale(exS, exS);
        ctx.font = `900 124px ${MONO}, ${FONT}`;
        ctx.lineWidth = 14;
        ctx.strokeStyle = '#090D14';
        ctx.strokeText(exclaimText, 0, 0);
        ctx.fillStyle = '#FDE047';
        ctx.fillText(exclaimText, 0, 0);
        ctx.restore();
      }

      // Floating comic lightning sparks anchored proportionally around the wordmark
      const edgeHalf = Math.max(360, totalW / 2 + 24);
      const sparkOffsets = [
        { x: -edgeHalf, y: -92, sym: '⚡', size: 46, phase: 0 },
        { x: edgeHalf - 12, y: 74, sym: '✦', size: 38, phase: 1.7 },
        { x: Math.min(edgeHalf - 60, centers.hero + 116), y: -124, sym: '⚡', size: 40, phase: 3.1 },
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
