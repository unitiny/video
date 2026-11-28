import { clamp, easeOutCubic, lerp } from '../../timeline';
import type { TextSummaryBoardData } from '../schema';
import {
  FONT,
  roundRect,
  wrapLines,
  type SceneRenderContext,
} from './primitives';

interface LayoutLineSegment {
  text: string;
  color: string;
  bold: boolean;
  extraBold?: boolean;
}

interface MeasuredSection {
  title: string;
  titleColor: string;
  items: Array<{
    kind: 'row' | 'bullet' | 'analysis';
    lines: LayoutLineSegment[][];
    yOffset: number;
    height: number;
  }>;
  totalH: number;
}

interface SingleSheetLayout {
  bodyFS: number;
  titleFS: number;
  lineH: number;
  padX: number;
  startY: number;
  sectionGap: number;
  sections: Array<MeasuredSection & { y: number }>;
}

/** Cache the pre-rendered static pure-black summary sheet per data object for fast, zero-jitter slide-in */
const sheetCanvasCache = new WeakMap<TextSummaryBoardData, HTMLCanvasElement>();

function splitPrefixedWrappedLines(
  wrappedLines: string[],
  prefixLen: number,
  prefixColor: string,
  bodyColor: string,
  bodyBold = false,
  highlightAnomalies = false,
  anomalyThresholdPct = 2.5
): LayoutLineSegment[][] {
  let consumed = 0;
  return wrappedLines.map((line) => {
    const lineLen = line.length;
    const rawSegs: LayoutLineSegment[] = [];
    if (consumed < prefixLen) {
      const prefixRemaining = prefixLen - consumed;
      const takePrefix = Math.min(prefixRemaining, lineLen);
      if (takePrefix > 0) {
        rawSegs.push({
          text: line.slice(0, takePrefix),
          color: prefixColor,
          bold: true,
        });
      }
      if (takePrefix < lineLen) {
        rawSegs.push({
          text: line.slice(takePrefix),
          color: bodyColor,
          bold: bodyBold,
        });
      }
    } else {
      rawSegs.push({
        text: line,
        color: bodyColor,
        bold: bodyBold,
      });
    }
    consumed += lineLen;

    if (!highlightAnomalies) {
      return rawSegs;
    }

    // Highlight & extra-bold any abnormal index percentage move (|pct| >= threshold)
    const out: LayoutLineSegment[] = [];
    const pctRe = /([+-]?\d+(?:\.\d+)?%)/g;
    for (const seg of rawSegs) {
      if (seg.color === prefixColor && seg.bold && seg.text.endsWith('：')) {
        out.push(seg);
        continue;
      }
      let last = 0;
      let m: RegExpExecArray | null;
      pctRe.lastIndex = 0;
      while ((m = pctRe.exec(seg.text)) !== null) {
        const numVal = parseFloat(m[1].replace('%', ''));
        if (Number.isFinite(numVal) && Math.abs(numVal) >= anomalyThresholdPct) {
          if (m.index > last) {
            out.push({ ...seg, text: seg.text.slice(last, m.index) });
          }
          out.push({
            text: m[1],
            color: numVal >= 0 ? '#F87171' : '#34D399',
            bold: true,
            extraBold: true,
          });
          last = m.index + m[1].length;
        }
      }
      if (last < seg.text.length) {
        out.push({ ...seg, text: seg.text.slice(last) });
      }
    }
    return out;
  });
}

function measureSingleSheetLayout(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  data: TextSummaryBoardData
): SingleSheetLayout {
  const padX = 34;
  const fullW = width - padX * 2; // 1012px
  const safeTop = 58;
  // Utilize generous lower viewport down to y = 1808 while still keeping bottom breathing margin
  const safeBottom = height - 112;
  const availableH = safeBottom - safeTop;
  const threshold = data.anomalyThresholdPct ?? 2.5;

  // Maximize legible font size (39px -> 24px) & generous line spacing (1.46x)
  for (let bodyFS = 39; bodyFS >= 24; bodyFS--) {
    const lineH = Math.round(bodyFS * 1.46);
    const titleFS = bodyFS + 6;
    const titleH = titleFS + 16;
    const baseItemGap = 13;
    const baseSectionGap = 28;

    const measuredRaw: Array<{
      title: string;
      titleColor: string;
      items: Array<{
        kind: 'row' | 'bullet' | 'analysis';
        lines: LayoutLineSegment[][];
        height: number;
      }>;
      gapCount: number;
      extraPad: number;
      baseContentH: number;
    }> = [];

    let minRequiredH = 0;

    data.sections.forEach((sec, secIdx) => {
      const rightReserve = secIdx === 0 ? 0 : 28;
      const maxTextW = fullW - rightReserve;
      let contentOnlyH = titleH;
      let gapCount = 0;
      let extraPad = 0;
      const items: Array<{
        kind: 'row' | 'bullet' | 'analysis';
        lines: LayoutLineSegment[][];
        height: number;
      }> = [];

      if (sec.rows && sec.rows.length > 0) {
        ctx.font = `700 ${bodyFS}px ${FONT}`;
        for (const r of sec.rows) {
          const prefix = `${r.label}：`;
          const fullText = `${prefix}${r.text}`;
          const lines = wrapLines(ctx, fullText, maxTextW);
          const isFocus = r.tone === 'gold' || r.tone === 'warn';
          const prefixCol = isFocus ? '#FDE047' : '#CBD5E1';
          const bodyCol = isFocus ? '#FEF9C3' : '#FFFFFF';
          const segLines = splitPrefixedWrappedLines(
            lines,
            prefix.length,
            prefixCol,
            bodyCol,
            isFocus,
            Boolean(r.highlightAnomalies),
            threshold
          );
          const h = Math.max(1, lines.length) * lineH;
          items.push({ kind: 'row', lines: segLines, height: h });
          contentOnlyH += h;
          gapCount++;
        }
      }

      if (sec.bullets && sec.bullets.length > 0) {
        const bulletIndent = 26;
        ctx.font = `700 ${bodyFS}px ${FONT}`;
        for (const b of sec.bullets) {
          const lines = wrapLines(ctx, b.text, maxTextW - bulletIndent);
          const segLines = lines.map((l) => [{ text: l, color: '#FFFFFF', bold: false }]);
          const h = Math.max(1, lines.length) * lineH;
          items.push({ kind: 'bullet', lines: segLines, height: h });
          contentOnlyH += h;
          gapCount++;
        }
      }

      if (sec.analysis) {
        const prefix = `${sec.analysis.label}：`;
        const fullText = `${prefix}${sec.analysis.text}`;
        ctx.font = `800 ${bodyFS}px ${FONT}`;
        const lines = wrapLines(ctx, fullText, maxTextW - 18);
        const segLines = splitPrefixedWrappedLines(
          lines,
          prefix.length,
          '#FACC15',
          '#FEF08A',
          true
        );
        const h = Math.max(1, lines.length) * lineH;
        items.push({ kind: 'analysis', lines: segLines, height: h });
        contentOnlyH += h;
        extraPad += 6;
        gapCount++;
      }

      const effectiveGaps = Math.max(0, gapCount - 1);
      const secBaseH = contentOnlyH + extraPad + effectiveGaps * baseItemGap;
      measuredRaw.push({
        title: `${sec.title}：`,
        titleColor: '#FACC15',
        items,
        gapCount: effectiveGaps,
        extraPad,
        baseContentH: secBaseH,
      });
      minRequiredH += secBaseH + (secIdx < data.sections.length - 1 ? baseSectionGap : 0);
    });

    if (minRequiredH <= availableH || bodyFS === 24) {
      // Generously distribute remaining vertical room across itemGap and sectionGap so bottom space is utilized cleanly
      const spare = Math.max(0, availableH - minRequiredH);
      const totalItemGaps = measuredRaw.reduce((acc, s) => acc + s.gapCount, 0);
      const numSecGaps = Math.max(1, measuredRaw.length - 1);

      const bonusPerItem =
        totalItemGaps > 0 ? Math.min(8, Math.floor((spare * 0.55) / totalItemGaps)) : 0;
      const usedByItems = bonusPerItem * totalItemGaps;
      const remainingForSections = Math.max(0, spare - usedByItems);
      const bonusPerSec = Math.min(34, Math.floor((remainingForSections * 0.72) / numSecGaps));
      const usedBySecs = bonusPerSec * numSecGaps;
      const topOffset = Math.min(36, Math.floor((spare - usedByItems - usedBySecs) * 0.45));

      const finalItemGap = baseItemGap + bonusPerItem;
      const finalSecGap = baseSectionGap + bonusPerSec;

      let cursorY = safeTop + topOffset;
      const positioned: Array<MeasuredSection & { y: number }> = measuredRaw.map((raw) => {
        let itemY = titleH;
        const laidOutItems = raw.items.map((it) => {
          const yOffset = it.kind === 'analysis' ? itemY + 6 : itemY;
          itemY += it.height + (it.kind === 'analysis' ? 6 : 0) + finalItemGap;
          return {
            kind: it.kind,
            lines: it.lines,
            yOffset,
            height: it.height,
          };
        });
        const totalH = Math.max(titleH, itemY - finalItemGap);
        const outSec = {
          title: raw.title,
          titleColor: raw.titleColor,
          items: laidOutItems,
          totalH,
          y: cursorY,
        };
        cursorY += totalH + finalSecGap;
        return outSec;
      });

      return {
        bodyFS,
        titleFS,
        lineH,
        padX,
        startY: safeTop + topOffset,
        sectionGap: finalSecGap,
        sections: positioned,
      };
    }
  }

  return {
    bodyFS: 30,
    titleFS: 36,
    lineH: 44,
    padX: 34,
    startY: 58,
    sectionGap: 28,
    sections: [],
  };
}

function drawStaticSummarySheet(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  data: TextSummaryBoardData
): void {
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, width, height);

  const plan = measureSingleSheetLayout(ctx, width, height, data);
  const fullW = width - plan.padX * 2;

  plan.sections.forEach((sec, secIdx) => {
    // Minimal crisp section heading: slim gold indicator + bold warm-gold title
    ctx.fillStyle = '#FACC15';
    roundRect(ctx, plan.padX, sec.y + 4, 6, plan.titleFS - 2, 3);
    ctx.fill();

    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.font = `900 ${plan.titleFS}px ${FONT}`;
    ctx.fillStyle = sec.titleColor;
    ctx.fillText(sec.title, plan.padX + 18, sec.y);

    for (const item of sec.items) {
      const itemY = sec.y + item.yOffset;

      if (item.kind === 'bullet') {
        ctx.fillStyle = '#FACC15';
        ctx.beginPath();
        ctx.arc(plan.padX + 10, itemY + plan.lineH * 0.44, 5.5, 0, Math.PI * 2);
        ctx.fill();

        item.lines.forEach((segs, lIdx) => {
          let curX = plan.padX + 26;
          const ly = itemY + lIdx * plan.lineH;
          for (const seg of segs) {
            ctx.font = `${seg.extraBold ? 900 : seg.bold ? 800 : 700} ${plan.bodyFS}px ${FONT}`;
            ctx.fillStyle = seg.color;
            ctx.fillText(seg.text, curX, ly);
            curX += ctx.measureText(seg.text).width;
          }
        });
      } else if (item.kind === 'analysis') {
        ctx.fillStyle = 'rgba(250, 204, 21, 0.09)';
        roundRect(ctx, plan.padX, itemY - 6, fullW - (secIdx === 0 ? 0 : 28), item.height + 12, 8);
        ctx.fill();
        ctx.fillStyle = '#FACC15';
        roundRect(ctx, plan.padX, itemY - 6, 4, item.height + 12, 2);
        ctx.fill();

        item.lines.forEach((segs, lIdx) => {
          let curX = plan.padX + 16;
          const ly = itemY + lIdx * plan.lineH;
          for (const seg of segs) {
            ctx.font = `${seg.extraBold ? 900 : seg.bold ? 800 : 700} ${plan.bodyFS}px ${FONT}`;
            ctx.fillStyle = seg.color;
            ctx.fillText(seg.text, curX, ly);
            curX += ctx.measureText(seg.text).width;
          }
        });
      } else {
        item.lines.forEach((segs, lIdx) => {
          let curX = plan.padX;
          const ly = itemY + lIdx * plan.lineH;
          for (const seg of segs) {
            ctx.font = `${seg.extraBold ? 900 : seg.bold ? 800 : 700} ${plan.bodyFS}px ${FONT}`;
            ctx.fillStyle = seg.color;
            ctx.fillText(seg.text, curX, ly);
            const segW = ctx.measureText(seg.text).width;
            if (seg.extraBold) {
              ctx.fillStyle = seg.color;
              ctx.fillRect(curX, ly + plan.bodyFS + 4, segW, 3);
            }
            curX += segW;
          }
        });
      }
    }

    if (secIdx < plan.sections.length - 1) {
      const divY = sec.y + sec.totalH + Math.floor(plan.sectionGap * 0.5);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.14)';
      ctx.fillRect(plan.padX, divY, fullW, 1);
    }
  });
}

function getOrBuildSummarySheet(
  width: number,
  height: number,
  data: TextSummaryBoardData
): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;
  const cached = sheetCanvasCache.get(data);
  if (cached && cached.width === width && cached.height === height) {
    return cached;
  }
  const off = document.createElement('canvas');
  off.width = width;
  off.height = height;
  const offCtx = off.getContext('2d');
  if (!offCtx) return null;
  drawStaticSummarySheet(offCtx, width, height, data);
  sheetCanvasCache.set(data, off);
  return off;
}

/**
 * Scene: text_summary_board
 * Minimal, pure-black, oversized single-page text summary that slides smoothly
 * into the viewport as ONE complete image (no staggered multi-step reveals).
 */
export function renderTextSummaryBoardScene(
  rc: SceneRenderContext,
  data: TextSummaryBoardData
): void {
  const { ctx, frame, localFrame: localF, timeline } = rc;
  const { width, height, totalFrames } = timeline;

  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, width, height);

  // Entire summary sheet slides smoothly into screen as ONE single image (frames 0..16)
  const enterT = easeOutCubic(clamp(localF / 16, 0, 1));
  const slideX = Math.round(lerp(width * 0.85, 0, enterT));
  const sheetAlpha = clamp(localF / 7, 0.15, 1);

  const sheet = getOrBuildSummarySheet(width, height, data);

  ctx.save();
  ctx.globalAlpha = sheetAlpha;
  ctx.translate(slideX, 0);
  if (sheet) {
    ctx.drawImage(sheet, 0, 0);
  } else {
    drawStaticSummarySheet(ctx, width, height, data);
  }
  ctx.restore();

  // Consistent razor-thin top progress bar
  const progress = clamp(frame / Math.max(1, totalFrames - 1), 0, 1);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.16)';
  ctx.fillRect(0, 8, width, 5);
  ctx.fillStyle = '#FACC15';
  ctx.fillRect(0, 8, Math.max(14, width * progress), 5);
}
