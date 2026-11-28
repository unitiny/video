/// <reference types="node" />

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import type {
  AnimatedPosterStageData,
  CleanIndexChartItem,
  EpisodeManifest,
  EpisodeScene,
  HookSceneData,
  MarketBoardSceneData,
  TextSummaryBoardData,
  VerdictScenarioData,
} from '../src/video/engine/schema.ts';
import {
  collectEpisodeAssetSources,
  compileEpisodeTimeline,
  resolveMarketBoardTiming,
  selectAnomalousCommodities,
} from '../src/video/engine/timeline.ts';

export type ValidationSeverity = 'error' | 'warning';

export interface ValidationIssue {
  severity: ValidationSeverity;
  code: string;
  sceneId?: string;
  field?: string;
  message: string;
}

export interface ValidationSummary {
  episodeId: string;
  date: string;
  sceneCount: number;
  totalFrames: number;
  durationSec: number;
  errorCount: number;
  warningCount: number;
  checkedAssetsCount: number;
}

export interface ValidationReport {
  ok: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
  summary: ValidationSummary;
}

export interface ValidateEpisodeOptions {
  strictAssetCheck?: boolean;
  projectRoot?: string;
}

export const FORBIDDEN_HYPE_WORDS: readonly string[] = [
  '唯独抗跌',
  '必涨',
  '必跌',
  '闭眼买',
  '无脑买',
  '满仓梭哈',
  '强烈推荐买入',
  '保底翻倍',
  '抄底冲',
  '一定大涨',
  '必然涨停',
];

export const WARNING_HYPE_WORDS: readonly string[] = [
  '建议买入',
  '建议卖出',
  '全仓',
  '稳赚',
  '绝佳买点',
];

const NEGATION_CONTEXT_RE =
  /(?:不构成|非|并非|切勿|忌|勿|严禁|杜绝|禁止|不要|不宜|拒绝|避免|反对|警示|防)[^，。；！？\n]{0,6}$/;

const EMOJI_STRIP_RE =
  /(?:[\p{Extended_Pictographic}\uFE0E\uFE0F\u200D\u20E3]|\p{Regional_Indicator}{2})/gu;

/**
 * Strip emoji glyphs and variation selectors from a string before measuring visible copy length.
 */
export function stripEmoji(text: string): string {
  return text.replace(EMOJI_STRIP_RE, '').replace(/\s+/g, ' ').trim();
}

function isNegatedComplianceContext(text: string, matchIndex: number, fieldPath: string): boolean {
  const before = text.slice(Math.max(0, matchIndex - 12), matchIndex);
  if (NEGATION_CONTEXT_RE.test(before)) {
    return true;
  }
  if (
    fieldPath.endsWith('.disclaimer') &&
    (text.includes('不构成') || text.includes('仅供参考') || text.includes('风险自担'))
  ) {
    return true;
  }
  return false;
}

function pushIssue(
  errors: ValidationIssue[],
  warnings: ValidationIssue[],
  issue: ValidationIssue
): void {
  if (issue.severity === 'error') {
    errors.push(issue);
  } else {
    warnings.push(issue);
  }
}

function validateHookScene(
  scene: Extract<EpisodeScene, { kind: 'hook_live_video' }>,
  errors: ValidationIssue[],
  warnings: ValidationIssue[]
): void {
  const data: HookSceneData = scene.data;
  const dur = scene.durationFrames;

  if (!Number.isFinite(dur) || dur < 60 || dur > 90) {
    pushIssue(errors, warnings, {
      severity: 'error',
      code: 'HOOK_DURATION_OUT_OF_RANGE',
      sceneId: scene.id,
      field: 'durationFrames',
      message: `首屏 hook_live_video 时长 ${dur} 帧超出 60..90 帧（2.0s–3.0s）极速规范范围`,
    });
  } else if (dur !== 78) {
    pushIssue(errors, warnings, {
      severity: 'warning',
      code: 'HOOK_DURATION_NON_OPTIMAL',
      sceneId: scene.id,
      field: 'durationFrames',
      message: `首屏时长为 ${dur} 帧（${(dur / 30).toFixed(2)}s），推荐严格使用 78 帧（2.60s）黄金节奏`,
    });
  }

  const items = Array.isArray(data?.danmakuItems) ? data.danmakuItems : [];
  if (items.length < 1 || items.length > 5) {
    pushIssue(errors, warnings, {
      severity: 'error',
      code: 'HOOK_DANMAKU_COUNT',
      sceneId: scene.id,
      field: 'data.danmakuItems',
      message: `首屏弹幕条数为 ${items.length}，须严格控制在 1..5 条之间`,
    });
  }

  const zones = Array.isArray(data?.forbiddenZones) ? data.forbiddenZones : [];

  items.forEach((item, idx) => {
    const fieldBase = `data.danmakuItems[${idx}]`;
    const cleanLen = Array.from(stripEmoji(String(item.text ?? ''))).length;

    if (cleanLen === 0) {
      pushIssue(errors, warnings, {
        severity: 'error',
        code: 'HOOK_DANMAKU_EMPTY',
        sceneId: scene.id,
        field: `${fieldBase}.text`,
        message: `第 ${idx + 1} 条弹幕去除 emoji 后为空文本`,
      });
    } else if (cleanLen > 30) {
      pushIssue(errors, warnings, {
        severity: 'error',
        code: 'HOOK_DANMAKU_TOO_LONG',
        sceneId: scene.id,
        field: `${fieldBase}.text`,
        message: `第 ${idx + 1} 条弹幕去 emoji 后共 ${cleanLen} 字（超过硬上限 30 字）："${item.text}"`,
      });
    } else if (cleanLen > 24) {
      pushIssue(errors, warnings, {
        severity: 'warning',
        code: 'HOOK_DANMAKU_LENGTH_WARNING',
        sceneId: scene.id,
        field: `${fieldBase}.text`,
        message: `第 ${idx + 1} 条弹幕去 emoji 后共 ${cleanLen} 字（建议 ≤ 24 字以确保 2.6 秒内一眼读完）："${item.text}"`,
      });
    }

    if (!Number.isFinite(item.fontSize) || item.fontSize < 48) {
      pushIssue(errors, warnings, {
        severity: 'error',
        code: 'HOOK_DANMAKU_FONT_TOO_SMALL',
        sceneId: scene.id,
        field: `${fieldBase}.fontSize`,
        message: `第 ${idx + 1} 条弹幕字号 ${item.fontSize}px 小于最低规范 48px`,
      });
    }

    if (Number.isFinite(item.y)) {
      for (const zone of zones) {
        if (item.y >= zone.yMin && item.y <= zone.yMax) {
          pushIssue(errors, warnings, {
            severity: 'error',
            code: 'HOOK_DANMAKU_FORBIDDEN_ZONE',
            sceneId: scene.id,
            field: `${fieldBase}.y`,
            message: `第 ${idx + 1} 条弹幕 y=${item.y} 落入禁区「${zone.label}」[${zone.yMin}, ${zone.yMax}]，会遮挡主体/人脸/手部动作`,
          });
        }
      }
    } else {
      pushIssue(errors, warnings, {
        severity: 'error',
        code: 'HOOK_DANMAKU_INVALID_Y',
        sceneId: scene.id,
        field: `${fieldBase}.y`,
        message: `第 ${idx + 1} 条弹幕缺少合法的纵向坐标 y`,
      });
    }
  });
}

function validateChartItem(
  item: CleanIndexChartItem | undefined,
  sceneId: string,
  fieldPath: string,
  label: string,
  errors: ValidationIssue[],
  warnings: ValidationIssue[]
): void {
  if (!item) {
    pushIssue(errors, warnings, {
      severity: 'error',
      code: 'MARKET_CHART_MISSING',
      sceneId,
      field: fieldPath,
      message: `缺少行情图表对象：${label}`,
    });
    return;
  }

  // 1. Daily candles length === 5 and OHLC validity
  const candles = Array.isArray(item.dailyCandles) ? item.dailyCandles : [];
  if (candles.length !== 5) {
    pushIssue(errors, warnings, {
      severity: 'error',
      code: 'MARKET_DAILY_CANDLES_COUNT',
      sceneId,
      field: `${fieldPath}.dailyCandles`,
      message: `${label}（${item.name}）日K数量为 ${candles.length}，必须严格等于 5 根`,
    });
  }

  candles.forEach((c, idx) => {
    const validNumbers =
      Number.isFinite(c?.open) &&
      Number.isFinite(c?.high) &&
      Number.isFinite(c?.low) &&
      Number.isFinite(c?.close);
    if (!validNumbers) {
      pushIssue(errors, warnings, {
        severity: 'error',
        code: 'MARKET_CANDLE_NAN',
        sceneId,
        field: `${fieldPath}.dailyCandles[${idx}]`,
        message: `${label} 第 ${idx + 1} 根日K包含非法数值`,
      });
      return;
    }

    const maxOC = Math.max(c.open, c.close);
    const minOC = Math.min(c.open, c.close);
    if (c.high < maxOC - 1e-9) {
      pushIssue(errors, warnings, {
        severity: 'error',
        code: 'MARKET_CANDLE_INVALID_HIGH',
        sceneId,
        field: `${fieldPath}.dailyCandles[${idx}].high`,
        message: `${label} 第 ${idx + 1} 根日K high(${c.high}) < max(open=${c.open}, close=${c.close})`,
      });
    }
    if (c.low > minOC + 1e-9) {
      pushIssue(errors, warnings, {
        severity: 'error',
        code: 'MARKET_CANDLE_INVALID_LOW',
        sceneId,
        field: `${fieldPath}.dailyCandles[${idx}].low`,
        message: `${label} 第 ${idx + 1} 根日K low(${c.low}) > min(open=${c.open}, close=${c.close})`,
      });
    }
  });

  // 2. Intraday 48 points
  const points = Array.isArray(item.points) ? item.points : [];
  if (points.length !== 48) {
    pushIssue(errors, warnings, {
      severity: 'error',
      code: 'MARKET_POINTS_COUNT',
      sceneId,
      field: `${fieldPath}.points`,
      message: `${label}（${item.name}）分时点数为 ${points.length}，必须严格等于 48 个点`,
    });
  } else {
    const hasInvalidPoint = points.some((p) => typeof p !== 'number' || !Number.isFinite(p));
    if (hasInvalidPoint) {
      pushIssue(errors, warnings, {
        severity: 'error',
        code: 'MARKET_POINTS_INVALID',
        sceneId,
        field: `${fieldPath}.points`,
        message: `${label}（${item.name}）分时曲线包含非法数值`,
      });
    } else if (Number.isFinite(item.changePct)) {
      const lastPoint = points[47];
      const diff = Math.abs(lastPoint - item.changePct);
      const oppositeSign =
        (lastPoint > 0 && item.changePct < 0) || (lastPoint < 0 && item.changePct > 0);
      if (diff > 0.35 || oppositeSign) {
        pushIssue(errors, warnings, {
          severity: 'error',
          code: 'MARKET_DIRECTION_MISMATCH',
          sceneId,
          field: `${fieldPath}.points[47]`,
          message: `${label}（${item.name}）分时末点(${lastPoint}%)与标称涨跌幅(${item.changePct}%)不一致（差值 ${diff.toFixed(2)}%${oppositeSign ? '，且正负方向相反' : ''}），疑似假曲线`,
        });
      }
    }
  }

  // 3. Intraday 48 volumes
  const volumes = Array.isArray(item.volumes) ? item.volumes : [];
  if (volumes.length !== 48) {
    pushIssue(errors, warnings, {
      severity: 'error',
      code: 'MARKET_VOLUMES_COUNT',
      sceneId,
      field: `${fieldPath}.volumes`,
      message: `${label}（${item.name}）量能柱数量为 ${volumes.length}，必须严格等于 48 根`,
    });
  } else {
    const badVol = volumes.find(
      (v) => typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 1.0001
    );
    if (badVol !== undefined) {
      pushIssue(errors, warnings, {
        severity: 'error',
        code: 'MARKET_VOLUMES_RANGE',
        sceneId,
        field: `${fieldPath}.volumes`,
        message: `${label}（${item.name}）存在超出 [0, 1] 归一化范围的量能值：${badVol}`,
      });
    }
  }
}

function validateMarketBoardScene(
  scene: Extract<EpisodeScene, { kind: 'market_chrono_board' }>,
  errors: ValidationIssue[],
  warnings: ValidationIssue[]
): void {
  const data: MarketBoardSceneData = scene.data;

  // US indices
  if (!Array.isArray(data?.usIndices) || data.usIndices.length !== 2) {
    pushIssue(errors, warnings, {
      severity: 'error',
      code: 'MARKET_US_INDICES_COUNT',
      sceneId: scene.id,
      field: 'data.usIndices',
      message: `美股指数卡片须为 2 个（当前 ${data?.usIndices?.length ?? 0} 个）`,
    });
  } else {
    data.usIndices.forEach((item, idx) =>
      validateChartItem(item, scene.id, `data.usIndices[${idx}]`, `美股[${idx + 1}]`, errors, warnings)
    );
  }

  // Asia indices
  if (!Array.isArray(data?.asiaIndices) || data.asiaIndices.length !== 2) {
    pushIssue(errors, warnings, {
      severity: 'error',
      code: 'MARKET_ASIA_INDICES_COUNT',
      sceneId: scene.id,
      field: 'data.asiaIndices',
      message: `亚太指数卡片须为 2 个（当前 ${data?.asiaIndices?.length ?? 0} 个）`,
    });
  } else {
    data.asiaIndices.forEach((item, idx) =>
      validateChartItem(item, scene.id, `data.asiaIndices[${idx}]`, `亚太[${idx + 1}]`, errors, warnings)
    );
  }

  // Commodity charts
  const chartsMap = data?.commodityCharts ?? {};
  const chartEntries = Object.entries(chartsMap);
  if (chartEntries.length === 0) {
    pushIssue(errors, warnings, {
      severity: 'error',
      code: 'MARKET_COMMODITY_CHARTS_EMPTY',
      sceneId: scene.id,
      field: 'data.commodityCharts',
      message: 'commodityCharts 不能为空，至少须包含 1 个大宗商品实盘图表',
    });
  } else {
    for (const [key, chart] of chartEntries) {
      validateChartItem(
        chart,
        scene.id,
        `data.commodityCharts.${key}`,
        `大宗[${key}]`,
        errors,
        warnings
      );
    }
  }

  // Ensure anomalous watchlist items have matching charts
  const watchlist = Array.isArray(data?.commodityWatchlist) ? data.commodityWatchlist : [];
  const threshold = data?.anomalyThresholdPct ?? 2.5;
  const anomalies = selectAnomalousCommodities(watchlist, threshold);
  for (const item of anomalies) {
    if (!chartsMap[item.id]) {
      pushIssue(errors, warnings, {
        severity: 'error',
        code: 'MARKET_ANOMALY_CHART_MISSING',
        sceneId: scene.id,
        field: `data.commodityCharts.${item.id}`,
        message: `异动商品 ${item.name}（${item.changePct}%，阈值 ±${threshold}%）在 commodityCharts 中缺少对应日K/分时数据`,
      });
    }
  }

  // A50 hero
  validateChartItem(data?.a50Hero, scene.id, 'data.a50Hero', '富时中国 A50', errors, warnings);

  // Reading pause timing checks
  const timing = resolveMarketBoardTiming(data?.timing);
  const usPauseFrames = timing.asiaStart - timing.usTypeEnd;
  if (usPauseFrames < 30) {
    pushIssue(errors, warnings, {
      severity: 'error',
      code: 'MARKET_US_PAUSE_TOO_SHORT',
      sceneId: scene.id,
      field: 'data.timing',
      message: `美股归因打字机结束后的阅读停顿仅 ${usPauseFrames} 帧（asiaStart=${timing.asiaStart} - usTypeEnd=${timing.usTypeEnd}），必须 ≥ 30 帧（1.0 秒）`,
    });
  }

  const a50HoldFrames = scene.durationFrames - timing.a50NoteEnd;
  if (a50HoldFrames < 50) {
    pushIssue(errors, warnings, {
      severity: 'error',
      code: 'MARKET_A50_HOLD_TOO_SHORT',
      sceneId: scene.id,
      field: 'data.timing',
      message: `A50 展毕收尾停留仅 ${a50HoldFrames} 帧（durationFrames=${scene.durationFrames} - a50NoteEnd=${timing.a50NoteEnd}），必须 ≥ 50 帧（≥1.67 秒）`,
    });
  }
}

function validateVerdictScene(
  scene: Extract<EpisodeScene, { kind: 'verdict_scenario' }>,
  errors: ValidationIssue[],
  warnings: ValidationIssue[]
): void {
  const data: VerdictScenarioData = scene.data;
  const labels = Array.isArray(data?.scenarioTimeLabels) ? data.scenarioTimeLabels : [];
  const base = Array.isArray(data?.scenarioBase) ? data.scenarioBase : [];
  const steady = Array.isArray(data?.scenarioSteady) ? data.scenarioSteady : [];
  const weak = Array.isArray(data?.scenarioWeak) ? data.scenarioWeak : [];

  if (labels.length < 4) {
    pushIssue(errors, warnings, {
      severity: 'error',
      code: 'VERDICT_TIME_LABELS_SHORT',
      sceneId: scene.id,
      field: 'data.scenarioTimeLabels',
      message: `双情景时间轴标签数量为 ${labels.length}，必须 ≥ 4 个节点`,
    });
  }

  if (base.length !== 2) {
    pushIssue(errors, warnings, {
      severity: 'error',
      code: 'VERDICT_BASE_LENGTH',
      sceneId: scene.id,
      field: 'data.scenarioBase',
      message: `scenarioBase 长度必须严格等于 2（开盘点 + 观察窗分水岭点），当前为 ${base.length}`,
    });
  }

  if (steady.length < 2) {
    pushIssue(errors, warnings, {
      severity: 'error',
      code: 'VERDICT_STEADY_SHORT',
      sceneId: scene.id,
      field: 'data.scenarioSteady',
      message: `scenarioSteady 至少需要 2 个点，当前为 ${steady.length}`,
    });
  }

  if (weak.length < 2) {
    pushIssue(errors, warnings, {
      severity: 'error',
      code: 'VERDICT_WEAK_SHORT',
      sceneId: scene.id,
      field: 'data.scenarioWeak',
      message: `scenarioWeak 至少需要 2 个点，当前为 ${weak.length}`,
    });
  }

  if (base.length === 2 && steady.length >= 1) {
    if (Math.abs(steady[0] - base[1]) > 1e-9) {
      pushIssue(errors, warnings, {
        severity: 'error',
        code: 'VERDICT_STEADY_FORK_MISMATCH',
        sceneId: scene.id,
        field: 'data.scenarioSteady[0]',
        message: `情景 A 起点 scenarioSteady[0](${steady[0]}) 必须等于观察窗分水岭 scenarioBase[1](${base[1]})，否则路径断裂`,
      });
    }
  }

  if (base.length === 2 && weak.length >= 1) {
    if (Math.abs(weak[0] - base[1]) > 1e-9) {
      pushIssue(errors, warnings, {
        severity: 'error',
        code: 'VERDICT_WEAK_FORK_MISMATCH',
        sceneId: scene.id,
        field: 'data.scenarioWeak[0]',
        message: `情景 B 起点 scenarioWeak[0](${weak[0]}) 必须等于观察窗分水岭 scenarioBase[1](${base[1]})，否则路径断裂`,
      });
    }
  }

  if (base.length === 2 && labels.length >= 4) {
    const expectedBranchLen = labels.length - 1;
    if (steady.length !== expectedBranchLen || weak.length !== expectedBranchLen) {
      pushIssue(errors, warnings, {
        severity: 'warning',
        code: 'VERDICT_BRANCH_TIME_ALIGNMENT',
        sceneId: scene.id,
        field: 'data.scenarioTimeLabels',
        message: `分叉曲线点数（steady=${steady.length}, weak=${weak.length}）与时间轴剩余节点数（${expectedBranchLen}）未精确对齐`,
      });
    }
  }
}

function validateAnimatedPosterScene(
  scene: Extract<EpisodeScene, { kind: 'animated_poster_stage' }>,
  errors: ValidationIssue[],
  warnings: ValidationIssue[]
): void {
  const data: AnimatedPosterStageData = scene.data;
  if (!data?.imageSrc || typeof data.imageSrc !== 'string') {
    pushIssue(errors, warnings, {
      severity: 'error',
      code: 'POSTER_IMAGE_MISSING',
      sceneId: scene.id,
      field: 'data.imageSrc',
      message: '动态海报分镜缺少有效的 imageSrc 图片路径',
    });
  }

  const beats = Array.isArray(data?.beats) ? data.beats : [];
  if (beats.length === 0) {
    pushIssue(errors, warnings, {
      severity: 'warning',
      code: 'POSTER_BEATS_EMPTY',
      sceneId: scene.id,
      field: 'data.beats',
      message: '动态海报分镜尚未配置局部聚光节拍 beats，将仅展示整图出入画',
    });
    return;
  }

  beats.forEach((beat, idx) => {
    const fieldBase = `data.beats[${idx}]`;
    if (
      !Number.isFinite(beat.enterFrame) ||
      !Number.isFinite(beat.exitFrame) ||
      beat.enterFrame < 0 ||
      beat.enterFrame >= beat.exitFrame ||
      beat.exitFrame > scene.durationFrames
    ) {
      pushIssue(errors, warnings, {
        severity: 'error',
        code: 'POSTER_BEAT_FRAME_INVALID',
        sceneId: scene.id,
        field: fieldBase,
        message: `海报节拍 ${beat.id || idx} 帧区间 [${beat.enterFrame}, ${beat.exitFrame}] 越界或倒挂（场景总帧数 ${scene.durationFrames}）`,
      });
    }

    const c = beat.crop;
    if (
      !c ||
      !Number.isFinite(c.x) ||
      !Number.isFinite(c.y) ||
      !Number.isFinite(c.w) ||
      !Number.isFinite(c.h) ||
      c.x < 0 ||
      c.y < 0 ||
      c.w <= 0 ||
      c.h <= 0 ||
      c.x + c.w > 1.001 ||
      c.y + c.h > 1.001
    ) {
      pushIssue(errors, warnings, {
        severity: 'error',
        code: 'POSTER_BEAT_CROP_INVALID',
        sceneId: scene.id,
        field: `${fieldBase}.crop`,
        message: `海报节拍 ${beat.id || idx} 的归一化裁剪框越界或宽高非正`,
      });
    }
  });
}

function validateTextSummaryScene(
  scene: Extract<EpisodeScene, { kind: 'text_summary_board' }>,
  errors: ValidationIssue[],
  warnings: ValidationIssue[]
): void {
  const data: TextSummaryBoardData = scene.data;
  const sections = Array.isArray(data?.sections) ? data.sections : [];
  if (sections.length === 0) {
    pushIssue(errors, warnings, {
      severity: 'error',
      code: 'TEXT_SUMMARY_SECTIONS_EMPTY',
      sceneId: scene.id,
      field: 'data.sections',
      message: '纯文字汇总分页缺少至少一个板块 sections',
    });
    return;
  }

  sections.forEach((sec, idx) => {
    const hasContent =
      (Array.isArray(sec.rows) && sec.rows.length > 0) ||
      (Array.isArray(sec.bullets) && sec.bullets.length > 0) ||
      Boolean(sec.analysis);
    if (!hasContent) {
      pushIssue(errors, warnings, {
        severity: 'error',
        code: 'TEXT_SUMMARY_SECTION_EMPTY',
        sceneId: scene.id,
        field: `data.sections[${idx}]`,
        message: `汇总板块「${sec.title || sec.id}」缺少 rows / bullets / analysis 文案内容`,
      });
    }
  });
}

function scanObjectForCompliance(
  value: unknown,
  fieldPath: string,
  sceneId: string | undefined,
  errors: ValidationIssue[],
  warnings: ValidationIssue[]
): void {
  if (typeof value === 'string') {
    for (const word of FORBIDDEN_HYPE_WORDS) {
      let searchFrom = 0;
      while (searchFrom < value.length) {
        const idx = value.indexOf(word, searchFrom);
        if (idx === -1) break;
        if (!isNegatedComplianceContext(value, idx, fieldPath)) {
          pushIssue(errors, warnings, {
            severity: 'error',
            code: 'COMPLIANCE_FORBIDDEN_WORD',
            sceneId,
            field: fieldPath,
            message: `命中客观纪律禁用词「${word}」，原句："${value}"`,
          });
          break;
        }
        searchFrom = idx + word.length;
      }
    }

    for (const word of WARNING_HYPE_WORDS) {
      let searchFrom = 0;
      while (searchFrom < value.length) {
        const idx = value.indexOf(word, searchFrom);
        if (idx === -1) break;
        if (!isNegatedComplianceContext(value, idx, fieldPath)) {
          pushIssue(errors, warnings, {
            severity: 'warning',
            code: 'COMPLIANCE_WARNING_WORD',
            sceneId,
            field: fieldPath,
            message: `命中审慎提醒词「${word}」，建议改为客观条件表述，原句："${value}"`,
          });
          break;
        }
        searchFrom = idx + word.length;
      }
    }
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((entry, idx) => {
      const nextSceneId =
        fieldPath === 'scenes' && entry && typeof entry === 'object' && 'id' in entry
          ? String((entry as { id?: unknown }).id ?? '')
          : sceneId;
      scanObjectForCompliance(entry, `${fieldPath}[${idx}]`, nextSceneId, errors, warnings);
    });
    return;
  }

  if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      const nextPath = fieldPath ? `${fieldPath}.${key}` : key;
      scanObjectForCompliance(child, nextPath, sceneId, errors, warnings);
    }
  }
}

function isLocalAssetPath(src: string): boolean {
  if (!src) return false;
  if (/^(?:https?:|data:|blob:)/i.test(src)) return false;
  return (
    src.startsWith('/src/assets/') ||
    src.startsWith('/episodes/') ||
    src.startsWith('/assets/') ||
    src.startsWith('src/assets/') ||
    src.startsWith('episodes/') ||
    src.startsWith('assets/')
  );
}

function checkReferencedAssets(
  episode: EpisodeManifest,
  projectRoot: string,
  errors: ValidationIssue[],
  warnings: ValidationIssue[]
): number {
  const { imageSrcs, hookVideos } = collectEpisodeAssetSources(episode);
  const allPaths = new Set<string>(imageSrcs);
  for (const hv of hookVideos) {
    if (hv.videoSrc) allPaths.add(hv.videoSrc);
    if (hv.posterSrc) allPaths.add(hv.posterSrc);
  }

  let checkedCount = 0;
  for (const rawSrc of allPaths) {
    if (!isLocalAssetPath(rawSrc)) continue;
    checkedCount++;
    const rel = rawSrc.replace(/^\/+/, '');
    const absPath = path.resolve(projectRoot, rel);
    const exists = fs.existsSync(absPath) && fs.statSync(absPath).isFile();
    if (!exists) {
      pushIssue(errors, warnings, {
        severity: 'error',
        code: 'ASSET_FILE_MISSING',
        field: rawSrc,
        message: `引用的本地素材文件不存在：${rawSrc}（解析路径：${absPath}）`,
      });
    }
  }
  return checkedCount;
}

export function validateEpisodeManifest(
  episode: EpisodeManifest,
  options?: ValidateEpisodeOptions
): ValidationReport {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];

  if (!episode || typeof episode !== 'object') {
    errors.push({
      severity: 'error',
      code: 'MANIFEST_INVALID_ROOT',
      message: 'episode.json 根节点必须为合法对象',
    });
    return {
      ok: false,
      errors,
      warnings,
      summary: {
        episodeId: 'unknown',
        date: 'unknown',
        sceneCount: 0,
        totalFrames: 0,
        durationSec: 0,
        errorCount: errors.length,
        warningCount: 0,
        checkedAssetsCount: 0,
      },
    };
  }

  const scenes = Array.isArray(episode.scenes) ? episode.scenes : [];
  if (scenes.length < 3) {
    pushIssue(errors, warnings, {
      severity: 'error',
      code: 'STRUCTURE_MIN_SCENES',
      field: 'scenes',
      message: `分镜数量为 ${scenes.length}，必须至少包含 3 幕（首屏钩子 + 全球实盘看板 + 双情景推演）`,
    });
  }

  // Validate positive durationFrames for every scene
  const seenIds = new Set<string>();
  for (let i = 0; i < scenes.length; i++) {
    const s = scenes[i];
    if (!s.id || typeof s.id !== 'string') {
      pushIssue(errors, warnings, {
        severity: 'error',
        code: 'SCENE_MISSING_ID',
        field: `scenes[${i}].id`,
        message: `第 ${i + 1} 幕缺少有效的字符串 id`,
      });
    } else if (seenIds.has(s.id)) {
      pushIssue(errors, warnings, {
        severity: 'error',
        code: 'SCENE_DUPLICATE_ID',
        sceneId: s.id,
        field: `scenes[${i}].id`,
        message: `分镜 id 重复：${s.id}`,
      });
    } else {
      seenIds.add(s.id);
    }

    if (typeof s.durationFrames !== 'number' || !Number.isFinite(s.durationFrames) || s.durationFrames <= 0) {
      pushIssue(errors, warnings, {
        severity: 'error',
        code: 'SCENE_INVALID_DURATION',
        sceneId: s.id,
        field: `scenes[${i}].durationFrames`,
        message: `分镜 ${s.id || `#${i + 1}`} 的 durationFrames(${s.durationFrames}) 必须 > 0`,
      });
    }
  }

  // Required scene kinds
  const isPosterFlow =
    Boolean(episode.metadata?.allowNoHook) ||
    scenes.some((s) => s.kind === 'animated_poster_stage');
  const requiredKinds: EpisodeScene['kind'][] = isPosterFlow
    ? ['market_chrono_board']
    : ['hook_live_video', 'market_chrono_board', 'verdict_scenario'];
  const presentKinds = new Set(scenes.map((s) => s.kind));
  for (const kind of requiredKinds) {
    if (!presentKinds.has(kind)) {
      pushIssue(errors, warnings, {
        severity: 'error',
        code: 'STRUCTURE_REQUIRED_KIND_MISSING',
        field: 'scenes',
        message: `缺少必需分镜类型：${kind}`,
      });
    }
  }

  // Compile timeline & check continuity
  let totalFrames = 0;
  let durationSec = 0;
  if (scenes.length > 0 && episode.spec) {
    const timeline = compileEpisodeTimeline(episode);
    totalFrames = timeline.totalFrames;
    durationSec = timeline.durationSec;

    if (timeline.shots.length !== scenes.length) {
      pushIssue(errors, warnings, {
        severity: 'error',
        code: 'TIMELINE_SHOT_COUNT_MISMATCH',
        message: `时间轴编译镜头数(${timeline.shots.length})与 scenes 数(${scenes.length})不一致`,
      });
    } else {
      for (let i = 0; i < timeline.shots.length; i++) {
        const shot = timeline.shots[i];
        if (i === 0 && shot.startFrame !== 0) {
          pushIssue(errors, warnings, {
            severity: 'error',
            code: 'TIMELINE_NON_ZERO_START',
            sceneId: shot.id,
            message: `首镜头起始帧为 ${shot.startFrame}，必须从 0 开始`,
          });
        }
        if (i > 0) {
          const prev = timeline.shots[i - 1];
          if (shot.startFrame !== prev.endFrame + 1) {
            pushIssue(errors, warnings, {
              severity: 'error',
              code: 'TIMELINE_GAP_OR_OVERLAP',
              sceneId: shot.id,
              message: `镜头 ${prev.id}(end=${prev.endFrame}) 与 ${shot.id}(start=${shot.startFrame}) 之间存在时间轴断层或重叠`,
            });
          }
        }
      }
      const lastShot = timeline.shots[timeline.shots.length - 1];
      if (lastShot && lastShot.endFrame + 1 !== timeline.totalFrames) {
        pushIssue(errors, warnings, {
          severity: 'error',
          code: 'TIMELINE_TOTAL_FRAMES_MISMATCH',
          message: `末镜头结束帧+1(${lastShot.endFrame + 1})与总帧数(${timeline.totalFrames})不一致`,
        });
      }
    }
  }

  // Per-scene domain checks
  for (const scene of scenes) {
    if (scene.kind === 'hook_live_video') {
      validateHookScene(scene, errors, warnings);
    } else if (scene.kind === 'market_chrono_board') {
      validateMarketBoardScene(scene, errors, warnings);
    } else if (scene.kind === 'verdict_scenario') {
      validateVerdictScene(scene, errors, warnings);
    } else if (scene.kind === 'animated_poster_stage') {
      validateAnimatedPosterScene(scene, errors, warnings);
    } else if (scene.kind === 'text_summary_board') {
      validateTextSummaryScene(scene, errors, warnings);
    }
  }

  // Global compliance scan (all strings recursively)
  scanObjectForCompliance(episode, '', undefined, errors, warnings);

  // Asset file existence check
  let checkedAssetsCount = 0;
  if (options?.projectRoot && options.strictAssetCheck !== false) {
    checkedAssetsCount = checkReferencedAssets(episode, options.projectRoot, errors, warnings);
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    summary: {
      episodeId: String(episode.id ?? 'unknown'),
      date: String(episode.date ?? 'unknown'),
      sceneCount: scenes.length,
      totalFrames,
      durationSec,
      errorCount: errors.length,
      warningCount: warnings.length,
      checkedAssetsCount,
    },
  };
}

function printHumanReport(episodePath: string, report: ValidationReport): void {
  const { summary, errors, warnings, ok } = report;
  const statusBanner = ok ? '✅ 质检通过（0 Error）' : `❌ 质检未通过（${errors.length} 项红线错误）`;

  console.log('============================================================');
  console.log(`QuantReel Studio 节目质检报告  ${statusBanner}`);
  console.log('============================================================');
  console.log(`文件: ${episodePath}`);
  console.log(
    `节目: ${summary.episodeId} (${summary.date}) | 分镜: ${summary.sceneCount} 幕 | 总时长: ${summary.totalFrames} 帧 (${summary.durationSec.toFixed(2)}s)`
  );
  console.log(
    `资产核验: ${summary.checkedAssetsCount} 个本地文件 | 错误: ${summary.errorCount} | 警告: ${summary.warningCount}`
  );
  console.log('------------------------------------------------------------');

  if (errors.length > 0) {
    console.log('\n[红线错误 ERRORS]');
    errors.forEach((err, idx) => {
      const loc = [err.sceneId, err.field].filter(Boolean).join(' @ ');
      console.log(`  ${idx + 1}. [${err.code}]${loc ? ` (${loc})` : ''} ${err.message}`);
    });
  }

  if (warnings.length > 0) {
    console.log('\n[优化建议 WARNINGS]');
    warnings.forEach((warn, idx) => {
      const loc = [warn.sceneId, warn.field].filter(Boolean).join(' @ ');
      console.log(`  ${idx + 1}. [${warn.code}]${loc ? ` (${loc})` : ''} ${warn.message}`);
    });
  }

  if (errors.length === 0 && warnings.length === 0) {
    console.log('\n全部红线与建议项均已达标（2.6s首屏 / 实盘曲线 / 停留窗 / 客观无喊单 / 双情景分叉 / 本地素材）。');
  }
  console.log('============================================================');
}

function runCli(): void {
  const rawArgs = process.argv.slice(2);
  let targetFile: string | undefined;
  let strictAssetCheck = true;
  let jsonMode = false;

  for (let i = 0; i < rawArgs.length; i++) {
    const arg = rawArgs[i];
    if (arg === '--no-assets') {
      strictAssetCheck = false;
    } else if (arg === '--json') {
      jsonMode = true;
    } else if (arg === '--help' || arg === '-h') {
      console.log(
        [
          '用法: bun scripts/validate-episode.ts <episode.json> [选项]',
          '',
          '选项:',
          '  --no-assets   跳过本地素材文件存在性检查',
          '  --json        以 JSON 格式输出结构化报告',
        ].join('\n')
      );
      process.exit(0);
    } else if (!arg.startsWith('-') && !targetFile) {
      targetFile = arg;
    }
  }

  if (!targetFile) {
    console.error('用法错误：请传入 episode.json 路径，例如：bun scripts/validate-episode.ts episodes/2026-11-20/episode.json');
    process.exit(1);
  }

  const absTarget = path.resolve(process.cwd(), targetFile);
  if (!fs.existsSync(absTarget)) {
    console.error(`[validate-episode] 文件不存在：${absTarget}`);
    process.exit(1);
  }

  let parsed: EpisodeManifest;
  try {
    parsed = JSON.parse(fs.readFileSync(absTarget, 'utf-8')) as EpisodeManifest;
  } catch (err) {
    console.error(
      `[validate-episode] JSON 解析失败：${err instanceof Error ? err.message : String(err)}`
    );
    process.exit(1);
  }

  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const projectRoot = path.resolve(scriptDir, '..');

  const report = validateEpisodeManifest(parsed, {
    strictAssetCheck,
    projectRoot,
  });

  if (jsonMode) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    printHumanReport(absTarget, report);
  }

  process.exit(report.ok ? 0 : 1);
}

const isDirectRun =
  typeof process !== 'undefined' &&
  Array.isArray(process.argv) &&
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isDirectRun) {
  runCli();
}
