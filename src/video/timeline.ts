import { CHART_THEME, VIDEO_SPEC } from './theme';

export type SceneKind =
  | 'open'
  | 'art_noon_slap'
  | 'chart'
  | 'art_two_sheep'
  | 'chart_etf'
  | 'attribution_table'
  | 'art_lithography'
  | 'closing_freeze';

export interface ShotSpec {
  id: string;
  index: number;
  startFrame: number;
  endFrame: number;
  startSec: number;
  endSec: number;
  kind: SceneKind;
  title: string;
  subtitle: string;
  implementation: string;
  motionNotes: string;
  audioCue: string;
  aiPrompt: string;
}

export const HARD_CUT_FRAMES = [97, 166, 213, 272, 342, 440, 496, 556, 609] as const;

export const SHOTS: ShotSpec[] = [
  {
    id: 'shot-01',
    index: 1,
    startFrame: 0,
    endFrame: 96,
    startSec: 0.0,
    endSec: 3.23,
    kind: 'open',
    title: '开场：拉弓射箭标题卡',
    subtitle: '11.17 / 天天看主力 / 收盘资金流向 / 大A',
    implementation: 'AI关键帧插画 + 代码SVG弹性弓弦与飞箭动效 + 冲击黄字排版',
    motionNotes: '前30帧拉弓蓄力(easeOutCubic)，35帧放箭破空，60帧2.0–3.0s气口留白并定格冲击波。',
    audioCue: '129.2 BPM 强拍进场 → 2.0–3.0s 1秒气口留白 → 97帧前Whoosh预备',
    aiPrompt: '建筑工地散户戴黄色安全帽拉满金色大弓射向红色K线天空，3D漫画质感，无文字',
  },
  {
    id: 'shot-02',
    index: 2,
    startFrame: 97,
    endFrame: 165,
    startSec: 3.23,
    endSec: 5.53,
    kind: 'art_noon_slap',
    title: '插画1：午盘拉满 午后打脸',
    subtitle: '午盘拉满 午后打脸 + 14只个股贴纸',
    implementation: 'AI幽默漫画底图 + 14枚弹性Pop贴纸矩阵(springPop交错弹出)',
    motionNotes: '每4帧依次弹入2枚个股涨跌贴纸，伴随轻微屏幕震动反馈。',
    audioCue: '97帧硬切Whoosh + 高频Arp重返主节拍',
    aiPrompt: '夸张漫画风格：中午端着满碗红筹码兴奋的股民被上方绿色大阴线巴掌打脸，洁白浅灰背景',
  },
  {
    id: 'shot-03',
    index: 3,
    startFrame: 166,
    endFrame: 212,
    startSec: 5.53,
    endSec: 7.07,
    kind: 'chart',
    title: '资金流向图：13:09 → 13:26',
    subtitle: '午后初期资金分歧走势',
    implementation: '逐像素Canvas2D重建（28条曲线、4.2px圆角、38px防重叠标签）',
    motionNotes: '游标从13:09匀速推进至13:26，时钟a9b0c3右对齐x=1048实时跳动，标签动态避让。',
    audioCue: '166帧转场Whoosh + 稳定Synth Bass推进',
    aiPrompt: '纯代码确定性渲染（0 AI视频Token）',
  },
  {
    id: 'shot-04',
    index: 4,
    startFrame: 213,
    endFrame: 271,
    startSec: 7.07,
    endSec: 9.07,
    kind: 'art_two_sheep',
    title: '插画2：只有两只羊撑住了！',
    subtitle: '热门股票全线跌停 只有两只羊撑住了！',
    implementation: 'AI双羊撑盘漫画 + 代码飞雪粒子与震动字幕卡',
    motionNotes: '双羊居中微微呼吸缩放，飘落的绿色跌停雪花由代码粒子绘制，标题逐字砸入。',
    audioCue: '213帧硬切Whoosh + 幽默节奏切分重音',
    aiPrompt: '暴风雪中两只戴墨镜得意洋洋的白羊合力扛起红色大柱子撑住市场，谐音梗漫画风',
  },
  {
    id: 'shot-05',
    index: 5,
    startFrame: 272,
    endFrame: 341,
    startSec: 9.07,
    endSec: 11.4,
    kind: 'chart_etf',
    title: '资金流向 + ETF放量卡片',
    subtitle: '13:40 放量异动（300帧浮层切入）',
    implementation: '28线资金图表底座 + 第300帧起弹出ETF今日放量时段浮层卡片与黄色大字',
    motionNotes: '272-299帧走图至13:40，第300帧起ETF卡片从底部弹性上滑(easeOutBack)并高亮放量柱。',
    audioCue: '272帧Whoosh切图 + 300帧清脆提示音强调ETF放量',
    aiPrompt: '纯代码图表 + 高对比数据卡片浮层',
  },
  {
    id: 'shot-06',
    index: 6,
    startFrame: 342,
    endFrame: 439,
    startSec: 11.4,
    endSec: 14.67,
    kind: 'chart',
    title: '资金流向图：14:00 → 14:19',
    subtitle: '尾盘资金加速分化',
    implementation: '逐像素Canvas2D重建（游标x=109.5→701线性映射）',
    motionNotes: '游标推进至14:19，机器人概念等题材下穿基线，芯片/光刻机逆势维持在零轴上方。',
    audioCue: '342帧转场Whoosh + 旋律琶音推进张力',
    aiPrompt: '纯代码确定性渲染（0 AI视频Token）',
  },
  {
    id: 'shot-07',
    index: 7,
    startFrame: 440,
    endFrame: 495,
    startSec: 14.67,
    endSec: 16.53,
    kind: 'attribution_table',
    title: '收盘涨跌停归因长图',
    subtitle: '全表逐条录入 · 结构化复盘矩阵',
    implementation: '纯代码矢量数据长表（多板块涨停家数、核心标的、催化归因逐行交错进场）',
    motionNotes: '表头0ms就位，10行归因条目每3帧逐行渐入并带微弱纵向平移。',
    audioCue: '440帧硬切 + 节奏紧奏Percussion铺垫',
    aiPrompt: '纯代码确定性排版（0 AI视频Token）',
  },
  {
    id: 'shot-08',
    index: 8,
    startFrame: 496,
    endFrame: 555,
    startSec: 16.53,
    endSec: 18.53,
    kind: 'chart',
    title: '资金流向图：冲刺 15:00 收盘',
    subtitle: '14:35 → 15:00 尾盘抢筹/出逃全貌',
    implementation: '逐像素Canvas2D重建（242分钟完整轨迹展开）',
    motionNotes: '游标加速抵达终点x=701(15:00)，所有28条曲线与涨跌家数比收官定型。',
    audioCue: '496帧Whoosh切回图表 + 贝斯线走高',
    aiPrompt: '纯代码确定性渲染（0 AI视频Token）',
  },
  {
    id: 'shot-09',
    index: 9,
    startFrame: 556,
    endFrame: 608,
    startSec: 18.53,
    endSec: 20.27,
    kind: 'art_lithography',
    title: '插画3：午后翻绿 光刻机撑住',
    subtitle: '午后翻绿 光刻机撑住 + 半导体能量特效',
    implementation: 'AI光刻机机甲英雄插画 + 代码光束粒子与高亮警示黄字',
    motionNotes: '光刻机机甲核心金光脉冲缩放，绿盘碎块从上方滑落，营造反差爽感。',
    audioCue: '556帧Whoosh + 强鼓点冲击',
    aiPrompt: '蓝银色EUV光刻机机甲英雄双臂托住崩塌绿色K线柱，胸口金色晶圆发光，漫画风',
  },
  {
    id: 'shot-10',
    index: 10,
    startFrame: 609,
    endFrame: 667,
    startSec: 20.27,
    endSec: 22.27,
    kind: 'closing_freeze',
    title: '收盘定格：15:00 全景',
    subtitle: '28条资金流最终排名与免责声明定格',
    implementation: '逐像素Canvas2D定格（芯片+27.3亿 … 机器人概念-63.2亿）',
    motionNotes: '15:00游标终点圆点轻微呼吸提示，页脚免责声明稳定呈现至22.27s结束。',
    audioCue: '609帧最终Whoosh定格 + 尾奏Fade-out',
    aiPrompt: '纯代码确定性渲染（0 AI视频Token）',
  },
];

export function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * clamp(t, 0, 1);
}

export function easeOutCubic(t: number): number {
  const x = clamp(t, 0, 1);
  return 1 - Math.pow(1 - x, 3);
}

export function easeOutBack(t: number): number {
  const x = clamp(t, 0, 1);
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
}

export function springPop(frameOffset: number, duration = 12): number {
  if (frameOffset <= 0) return 0;
  if (frameOffset >= duration) return 1;
  return easeOutBack(frameOffset / duration);
}

export function getShotAtFrame(frame: number): ShotSpec {
  const f = clamp(Math.floor(frame), 0, VIDEO_SPEC.totalFrames - 1);
  for (const shot of SHOTS) {
    if (f >= shot.startFrame && f <= shot.endFrame) {
      return shot;
    }
  }
  return SHOTS[SHOTS.length - 1];
}

/**
 * Trading minutes range: 0..240
 * 0 = 09:30, 120 = 11:30 / 13:00 (lunch compressed), 240 = 15:00
 */
export function tradingMinuteToClock(minuteIndex: number): string {
  const m = clamp(Math.round(minuteIndex), 0, 240);
  if (m < 120) {
    const totalMin = 9 * 60 + 30 + m;
    const hh = Math.floor(totalMin / 60);
    const mm = totalMin % 60;
    return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  }
  if (m === 120) return '13:00';
  const totalMin = 13 * 60 + (m - 120);
  const hh = Math.floor(totalMin / 60);
  const mm = totalMin % 60;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

/**
 * Exact clock trajectory mapped from the specification's chart segments:
 * - 166..212 -> 13:09 (min 129) to 13:26 (min 146)
 * - 272..341 -> 13:34 (min 154) to 13:44 (min 164)
 * - 342..439 -> 14:00 (min 180) to 14:19 (min 199)
 * - 496..555 -> 14:35 (min 215) to 15:00 (min 240)
 * - 609..667 -> 15:00 (min 240) frozen
 */
export function getClockAndMinuteAtFrame(frame: number): {
  minuteIndex: number;
  clockText: string;
} {
  const f = clamp(frame, 0, VIDEO_SPEC.totalFrames - 1);
  let minuteIndex = 240;

  if (f < 166) {
    minuteIndex = 120; // noon / morning close
  } else if (f <= 212) {
    minuteIndex = lerp(129, 146, (f - 166) / (212 - 166));
  } else if (f < 272) {
    minuteIndex = 150;
  } else if (f <= 341) {
    minuteIndex = lerp(154, 164, (f - 272) / (341 - 272));
  } else if (f <= 439) {
    minuteIndex = lerp(180, 199, (f - 342) / (439 - 342));
  } else if (f < 496) {
    minuteIndex = 210;
  } else if (f <= 555) {
    minuteIndex = lerp(215, 240, (f - 496) / (555 - 496));
  } else {
    minuteIndex = 240;
  }

  return {
    minuteIndex,
    clockText: tradingMinuteToClock(minuteIndex),
  };
}

export function minuteIndexToX(minuteIndex: number): number {
  const t = clamp(minuteIndex, 0, 240) / 240;
  return CHART_THEME.xStart + t * (CHART_THEME.xEnd - CHART_THEME.xStart);
}

export function valueToY(billionVal: number): number {
  return CHART_THEME.zeroY - billionVal * CHART_THEME.pxPerBillion;
}

/**
 * Deterministic vertical label collision solver:
 * Guarantees every adjacent label has >= minGap (38px) vertical separation
 * while staying within [minY, maxY] (plotTop..plotBottom).
 */
export function resolveLabelPositions(
  items: Array<{ id: string; targetY: number }>,
  minGap = CHART_THEME.labelMinGap,
  minY = CHART_THEME.plotTop + 20,
  maxY = CHART_THEME.plotBottom - 16
): Map<string, number> {
  const sorted = [...items]
    .map((item) => ({
      id: item.id,
      y: clamp(item.targetY, minY, maxY),
    }))
    .sort((a, b) => a.y - b.y);

  // Forward pass: push overlapping labels downward
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].y - sorted[i - 1].y < minGap) {
      sorted[i].y = sorted[i - 1].y + minGap;
    }
  }

  // Clamp bottom and backward pass: push upward if exceeding maxY
  if (sorted.length > 0 && sorted[sorted.length - 1].y > maxY) {
    sorted[sorted.length - 1].y = maxY;
    for (let i = sorted.length - 2; i >= 0; i--) {
      if (sorted[i + 1].y - sorted[i].y < minGap) {
        sorted[i].y = sorted[i + 1].y - minGap;
      }
    }
  }

  // Final clamp top safeguard
  if (sorted.length > 0 && sorted[0].y < minY) {
    sorted[0].y = minY;
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i].y - sorted[i - 1].y < minGap) {
        sorted[i].y = Math.min(maxY, sorted[i - 1].y + minGap);
      }
    }
  }

  const result = new Map<string, number>();
  for (const item of sorted) {
    result.set(item.id, item.y);
  }
  return result;
}
