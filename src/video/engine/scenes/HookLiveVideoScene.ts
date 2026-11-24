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
 * Scene: hook_live_video
 * Snappy Live-Action Hook + Whip-In Scannable Danmaku + Pop-Art Kinetic Stamp -> Razor Curtain Clear
 */
export function renderHookLiveVideoScene(rc: SceneRenderContext, data: HookSceneData): void {
  const { ctx, frame, localFrame: localF, shot, timeline, assets } = rc;
  const { width, height, totalFrames } = timeline;
  const exit = getHookExitState(localF, shot.durationFrames);

  // Clean slate base
  ctx.fillStyle = '#090D14';
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

  // 1. Full-Screen Real Live-Action Video Layer (shutter close with luminous razor seam)
  const closeE = easeOutCubic(exit.videoClose);
  const clipH = Math.max(0, height * (1 - closeE));
  const clipY = (height - clipH) / 2;

  if (clipH > 2) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, clipY, width, clipH);
    ctx.clip();
    ctx.globalAlpha = 1 - closeE * 0.52;

    const zoomSpanF = Math.max(24, shot.durationFrames - 14);
    const liveZoom = lerp(1.0, 1.13, easeOutCubic(clamp(localF / zoomSpanF, 0, 1)));
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
      0,
      true
    );

    // Warm impact flash synced to f=9 slam
    const flashT = clamp(1 - Math.abs(localF - 9) / 8, 0, 1);
    if (flashT > 0) {
      const flashG = ctx.createRadialGradient(width / 2, 1580, 70, width / 2, 1580, 920);
      flashG.addColorStop(0, `rgba(251, 191, 36, ${0.38 * flashT})`);
      flashG.addColorStop(0.55, `rgba(239, 68, 68, ${0.26 * flashT})`);
      flashG.addColorStop(1, 'rgba(9, 13, 20, 0)');
      ctx.fillStyle = flashG;
      ctx.fillRect(0, 0, width, height);
    }

    const topScrim = ctx.createLinearGradient(0, 0, 0, 420);
    topScrim.addColorStop(0, 'rgba(9, 13, 20, 0.9)');
    topScrim.addColorStop(0.45, 'rgba(9, 13, 20, 0.52)');
    topScrim.addColorStop(1, 'rgba(9, 13, 20, 0)');
    ctx.fillStyle = topScrim;
    ctx.fillRect(0, 0, width, 420);

    const botScrim = ctx.createLinearGradient(0, height - 920, 0, height);
    botScrim.addColorStop(0, 'rgba(9, 13, 20, 0)');
    botScrim.addColorStop(0.42, 'rgba(9, 13, 20, 0.74)');
    botScrim.addColorStop(1, 'rgba(9, 13, 20, 0.96)');
    ctx.fillStyle = botScrim;
    ctx.fillRect(0, height - 920, width, 920);
    ctx.restore();

    // Luminous razor seam accent as shutter snaps closed
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

  // 2. Clean Slim Top Progress Line ONLY
  const topExitE = easeOutCubic(exit.badgeExit);
  if (topExitE < 0.99) {
    const progress = clamp(frame / Math.max(1, totalFrames - 1), 0, 1);
    ctx.save();
    ctx.globalAlpha = 1 - topExitE;
    ctx.fillStyle = 'rgba(255,255,255,0.16)';
    ctx.fillRect(56, 46, width - 112, 5);
    ctx.fillStyle = '#FBBF24';
    ctx.fillRect(56, 46, Math.max(14, (width - 112) * progress), 5);
    ctx.restore();
  }

  // 3. Concise Whip-In Danmaku Lanes
  const dmExitE = easeOutCubic(exit.danmakuExit);
  if (dmExitE < 0.99 && data.danmakuItems.length > 0) {
    ctx.save();
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

  // 4. Snappy Pop-Art Kinetic Stamp Composition driven by data.wordmark
  const headExitE = easeOutCubic(exit.headlineExit);
  const wm = data.wordmark;
  if (localF >= 3 && headExitE < 0.99) {
    const heroY = 1565 + lerp(0, 380, headExitE);
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
      ctx.strokeStyle = `rgba(253, 224, 71, ${waveAlpha})`;
      ctx.lineWidth = lerp(9, 2, waveT);
      ctx.beginPath();
      ctx.ellipse(
        width / 2,
        heroY,
        lerp(95, 590, easeOutCubic(waveT)),
        lerp(34, 205, easeOutCubic(waveT)),
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
          lerp(70, 480, easeOutCubic(wave2T)),
          lerp(22, 155, easeOutCubic(wave2T)),
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
      const stickerW = clamp(Math.max(392, badgeTextW + 64), 260, width - 140);
      const stickerAnchorX = clamp(
        width / 2 - 140,
        56 + stickerW / 2,
        width - 56 - stickerW / 2
      );

      ctx.globalAlpha = clamp(tagP * 2.2, 0, 1) * (1 - headExitE);
      ctx.translate(stickerAnchorX, heroY - 154);
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

      const fitScale = totalW > 0 ? Math.min(1, (width - 108) / totalW) : 1;

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
