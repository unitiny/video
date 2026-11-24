import { clamp, easeOutCubic, lerp } from '../../timeline';
import type { VerdictScenarioData } from '../schema';
import {
  FONT,
  MONO,
  drawHeaderProgress,
  drawWrappedText,
  roundRect,
  type SceneRenderContext,
} from './primitives';

/**
 * Scene: verdict_scenario
 * Objective Bull/Bear Matrix + Adaptive-Scale Dual-Scenario Intraday Divergence + Verdict Footer
 */
export function renderVerdictScenarioScene(
  rc: SceneRenderContext,
  data: VerdictScenarioData
): void {
  const { ctx, frame, localFrame: localF, timeline, episode } = rc;
  const { width, height, totalFrames } = timeline;

  ctx.fillStyle = '#0D1016';
  ctx.fillRect(0, 0, width, height);

  drawHeaderProgress(ctx, {
    frame,
    totalFrames,
    width,
    seriesTitle: episode.seriesTitle,
    tag: data.headerTag ?? 'SUMMARY · 客观规律',
    dark: true,
  });

  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.font = `900 58px ${FONT}`;
  ctx.fillStyle = '#FFFFFF';
  ctx.fillText(data.title, 56, 134);

  // Upper Half: Concise Bull vs Bear Objective Matrix
  const colT = easeOutCubic(clamp(localF / 18, 0, 1));
  ctx.save();
  ctx.globalAlpha = colT;
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.fillRect(56, 228, width - 112, 1.5);

  ctx.font = `900 30px ${FONT}`;
  ctx.fillStyle = '#F87171';
  ctx.fillText(data.bullsHeading ?? '▲ 客观支撑线索', 56, 254);
  data.bulls.forEach((b, idx) => {
    ctx.font = `700 28px ${FONT}`;
    ctx.fillStyle = '#F8FAFC';
    drawWrappedText(ctx, `0${idx + 1}  ${b}`, 56, 314 + idx * 96, 446, 38);
  });

  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.fillRect(width / 2, 250, 1.5, 368);

  ctx.font = `900 30px ${FONT}`;
  ctx.fillStyle = '#34D399';
  ctx.fillText(data.bearsHeading ?? '▼ 客观承压风险', width / 2 + 28, 254);
  data.bears.forEach((b, idx) => {
    ctx.font = `700 28px ${FONT}`;
    ctx.fillStyle = '#E2E8F0';
    drawWrappedText(ctx, `0${idx + 1}  ${b}`, width / 2 + 28, 314 + idx * 96, 446, 38);
  });
  ctx.restore();

  // Lower Half: Dual-Scenario Objective Divergence Graph with Dynamic Adaptive Y-Axis
  const fx = 86;
  const fw = 908;
  const fTop = 758;
  const fBot = 1272;

  const allVals = [0, ...data.scenarioBase, ...data.scenarioSteady, ...data.scenarioWeak];
  const rawMin = Math.min(...allVals);
  const rawMax = Math.max(...allVals);
  const rawSpan = Math.max(1.6, rawMax - rawMin);
  const yMin = rawMin - rawSpan * 0.24;
  const yMax = rawMax + rawSpan * 0.26;
  const ySpan = Math.max(0.1, yMax - yMin);

  const pctToY = (pct: number) => lerp(fBot, fTop, clamp((pct - yMin) / ySpan, 0, 1));

  ctx.save();
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.fillRect(56, 646, width - 112, 1.5);

  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.font = `800 28px ${FONT}`;
  ctx.fillStyle = '#FBBF24';
  ctx.fillText(data.scenarioHeading, 56, 676);

  // Zero reference line (always inside [fTop, fBot])
  const zeroY = pctToY(0);
  ctx.strokeStyle = 'rgba(255,255,255,0.22)';
  ctx.setLineDash([8, 6]);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(fx, zeroY);
  ctx.lineTo(fx + fw, zeroY);
  ctx.stroke();
  ctx.setLineDash([]);

  const zeroLabelBelow = zeroY < fTop + 34;
  ctx.textAlign = 'left';
  ctx.textBaseline = zeroLabelBelow ? 'top' : 'bottom';
  ctx.font = `600 22px ${MONO}`;
  ctx.fillStyle = '#94A3B8';
  ctx.fillText('平盘 0%', fx, zeroLabelBelow ? zeroY + 8 : zeroY - 10);

  // Animate curve progress (localF 20..108)
  const pathProg = easeOutCubic(clamp((localF - 20) / 88, 0.05, 1));
  const timeLabels = data.scenarioTimeLabels;
  const labelDenom = Math.max(1, timeLabels.length - 1);
  const xAt = (idx: number) => fx + (clamp(idx, 0, labelDenom) / labelDenom) * fw;

  // Phase 1: Shared Opening Base (idx 0 -> idx 1, progress 0..0.28)
  const baseFrac = clamp(pathProg / 0.28, 0, 1);
  const x0 = xAt(0);
  const y0 = pctToY(data.scenarioBase[0]);
  const x1 = xAt(1);
  const y1 = pctToY(data.scenarioBase[1]);

  ctx.strokeStyle = '#E2E8F0';
  ctx.lineWidth = 6;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(lerp(x0, x1, baseFrac), lerp(y0, y1, baseFrac));
  ctx.stroke();

  // Opening point label
  ctx.fillStyle = '#E2E8F0';
  ctx.beginPath();
  ctx.arc(x0, y0, 7, 0, Math.PI * 2);
  ctx.fill();
  const openLabelBelow = y0 < fTop + 44;
  ctx.textAlign = 'left';
  ctx.textBaseline = openLabelBelow ? 'top' : 'bottom';
  ctx.font = `700 23px ${FONT}`;
  ctx.fillStyle = '#E2E8F0';
  ctx.fillText(data.openingLabel, x0, openLabelBelow ? y0 + 18 : y0 - 18);

  // Phase 2: Branching at pivot (progress 0.28..1.0)
  if (pathProg > 0.28) {
    const branchProg = clamp((pathProg - 0.28) / 0.72, 0, 1);

    const drawBranch = (
      vals: number[],
      color: string,
      dashed: boolean
    ): { endX: number; endY: number } => {
      if (vals.length === 0) {
        return { endX: x1, endY: y1 };
      }
      const exactIdx = branchProg * Math.max(0, vals.length - 1);
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

    const steadyTip = drawBranch(data.scenarioSteady, '#FBBF24', false);
    const weakTip = drawBranch(data.scenarioWeak, '#34D399', true);

    if (branchProg > 0.7) {
      const lAlpha = clamp((branchProg - 0.7) / 0.3, 0, 1);
      const steadyAbove = steadyTip.endY <= weakTip.endY;
      const steadyLabelY = clamp(
        steadyAbove ? steadyTip.endY - 18 : steadyTip.endY + 18,
        fTop + 26,
        fBot - 26
      );
      const weakLabelY = clamp(
        steadyAbove ? weakTip.endY + 18 : weakTip.endY - 18,
        fTop + 26,
        fBot - 26
      );

      ctx.save();
      ctx.globalAlpha = lAlpha;
      ctx.textAlign = 'right';
      ctx.font = `800 24px ${FONT}`;

      ctx.textBaseline = steadyAbove ? 'bottom' : 'top';
      ctx.fillStyle = '#FBBF24';
      ctx.fillText(data.steadyBranchLabel, steadyTip.endX, steadyLabelY);

      ctx.textBaseline = steadyAbove ? 'top' : 'bottom';
      ctx.fillStyle = '#34D399';
      ctx.fillText(data.weakBranchLabel, weakTip.endX, weakLabelY);
      ctx.restore();
    }

    // Observation Window Pivot Marker
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

    const pivotAbove = y1 > fBot - 52;
    ctx.textAlign = x1 - fx < 170 ? 'left' : 'right';
    ctx.textBaseline = pivotAbove ? 'bottom' : 'top';
    ctx.font = `800 23px ${FONT}`;
    ctx.fillStyle = '#FCA5A5';
    ctx.fillText(
      data.pivotLabel,
      x1 - fx < 170 ? x1 + 14 : x1 - 12,
      pivotAbove ? y1 - 24 : y1 + 26
    );
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
  ctx.fillText(data.verdictHeadline, width / 2, 1492);

  ctx.font = `800 34px ${FONT}`;
  ctx.fillStyle = '#FBBF24';
  ctx.fillText(data.verdictAction, width / 2, 1580);

  ctx.font = `600 26px ${FONT}`;
  ctx.fillStyle = '#94A3B8';
  ctx.fillText(
    data.disclaimer ?? '客观市场规律梳理 · 仅供信息参考，不构成任何投资建议',
    width / 2,
    1672
  );
  ctx.restore();
}
