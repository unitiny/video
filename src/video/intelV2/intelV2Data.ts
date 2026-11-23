import { selectMarketAnomalies, type MarketTickerItem } from '../intel/intelData';

export const INTEL_V2_SPEC = {
  width: 1080,
  height: 1920,
  fps: 30,
  totalFrames: 1188,
  durationSec: 39.6,
  bpm: 112.0,
} as const;

export interface SparklineSeries {
  id: string;
  name: string;
  shortCode: string;
  priceText: string;
  changePct: number;
  color: string;
  highlight?: boolean;
  /** Complete full-day normalized intraday percentage curve from open to close */
  points: number[];
  tag: string;
}

export function interpolateSeriesPct(points: number[], progress: number): number {
  if (points.length === 0) return 0;
  const clamped = Math.max(0, Math.min(1, progress));
  const exact = clamped * (points.length - 1);
  const idx = Math.floor(exact);
  const frac = exact - idx;
  if (idx >= points.length - 1) return points[points.length - 1];
  return points[idx] + (points[idx + 1] - points[idx]) * frac;
}

export function getCardEnterProgress(
  localFrame: number,
  enterFrame: number,
  durationFrames = 16
): number {
  if (durationFrames <= 0) return localFrame >= enterFrame ? 1 : 0;
  return Math.max(0, Math.min(1, (localFrame - enterFrame) / durationFrames));
}

export interface DailyCandle {
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface CleanIndexChartItem {
  id: string;
  name: string;
  changePct: number;
  color: string;
  /** Real 5-day Daily OHLC K-lines ending 2026-11-20 (Yahoo Finance / Sina Finance) */
  dailyCandles: DailyCandle[];
  /** Verified 48-point full-session intraday curve (%) */
  points: number[];
  /** Verified or U-shaped 48-bar intraday trading volume profile */
  volumes: number[];
}

export interface Shot1ExitState {
  danmakuExit: number;
  badgeExit: number;
  headlineExit: number;
  videoClose: number;
  isCleared: boolean;
}

export function getShot1ExitState(localF: number): Shot1ExitState {
  const step = (start: number, dur: number) => {
    if (localF <= start) return 0;
    return Math.max(0, Math.min(1, (localF - start) / dur));
  };
  const danmakuExit = step(55, 7);
  const badgeExit = step(58, 6);
  const headlineExit = step(60, 7);
  const videoClose = step(64, 10);
  return {
    danmakuExit,
    badgeExit,
    headlineExit,
    videoClose,
    isCleared: localF >= 75,
  };
}

export const SHOT2_PART_TIMING = {
  usStart: 0,
  usHeadlineFrame: 16,
  usTypeStart: 26,
  usTypeEnd: 86,
  /** Full 1.0s (30 frames) reading pause after US typewriter finishes before Asia enters */
  asiaStart: 116,
  asiaTypeStart: 134,
  asiaTypeEnd: 188,
  commodityStart: 214,
  commodityTypeStart: 232,
  commodityTypeEnd: 284,
  a50Start: 302,
  a50NoteStart: 332,
  a50NoteEnd: 364,
} as const;

export function sliceTypewriterText(
  text: string,
  localF: number,
  startF: number,
  endF: number
): { visible: string; done: boolean; typing: boolean } {
  const chars = Array.from(text);
  if (localF < startF) {
    return { visible: '', done: false, typing: false };
  }
  if (localF >= endF) {
    return { visible: text, done: true, typing: false };
  }
  const t = Math.max(0, Math.min(1, (localF - startF) / Math.max(1, endF - startF)));
  const count = Math.max(1, Math.floor(t * chars.length));
  return {
    visible: chars.slice(0, count).join(''),
    done: count >= chars.length,
    typing: count < chars.length,
  };
}

// Verified 2026-11-20 Yahoo Finance 5m intraday curve: ^IXIC (-5.28%, prevClose 23,879.20 -> 22,617.73)
const NASDAQ_FULL_DAY_48 = [
  -1.44, -1.29, -0.82, -0.44, -0.74, -1.35, -1.96, -1.97, -2.04, -2.13, -2.27, -2.64,
  -2.16, -2.54, -2.77, -2.97, -3.2, -3.16, -3.5, -3.36, -3.51, -3.53, -3.5, -3.64,
  -3.68, -3.56, -3.62, -3.45, -3.46, -3.36, -3.59, -3.43, -3.38, -3.62, -4.03, -4.2,
  -4.63, -4.18, -4.33, -4.39, -4.63, -4.78, -4.71, -5.01, -5.01, -4.8, -5.16, -5.28,
];

const NASDAQ_REAL_VOLUMES_48 = [
  0.12, 0.86, 0.7, 0.63, 0.61, 0.57, 0.63, 0.61, 0.64, 0.62, 0.51, 0.44,
  0.47, 0.4, 0.39, 0.41, 0.42, 0.38, 0.43, 0.43, 0.36, 0.33, 0.33, 0.34,
  0.33, 0.33, 0.3, 0.3, 0.35, 0.3, 0.3, 0.29, 0.34, 0.29, 0.33, 0.35,
  0.45, 0.48, 0.35, 0.42, 0.36, 0.43, 0.47, 0.46, 0.62, 0.63, 0.85, 0.5,
];

// Verified 2026-11-20 Yahoo Finance 5m intraday curve: ^SOX (-10.73%, prevClose 9,419.72 -> 8,408.59)
const SOX_FULL_DAY_48 = [
  -4.14, -4.23, -3.17, -2.71, -3.66, -4.84, -6.21, -6.28, -6.63, -6.71, -6.73, -7.3,
  -6.5, -7.22, -7.58, -7.95, -8.29, -8.28, -9.08, -8.69, -8.82, -8.87, -8.64, -8.71,
  -8.97, -8.8, -8.87, -8.44, -8.39, -8.31, -8.47, -8.14, -7.98, -8.41, -9.01, -9.15,
  -9.89, -9.34, -9.46, -9.45, -9.91, -10.3, -10.12, -10.42, -10.3, -10.12, -10.56, -10.73,
];

// Verified 2026-11-20 Yahoo Finance 5m intraday curve: ^KS11 (-5.21%, prevClose 5,137.89 -> 4,869.96)
const KOSPI_FULL_DAY_48 = [
  -3.55, -3.61, -3.46, -3.54, -3.76, -4.09, -4.71, -4.36, -3.87, -3.71, -3.54, -3.84,
  -4.15, -4.37, -4.45, -4.43, -4.34, -4.1, -4.32, -4.58, -4.48, -4.62, -4.76, -4.83,
  -5.12, -4.97, -4.79, -4.83, -4.88, -4.47, -4.36, -4.45, -4.78, -4.91, -5.02, -5.18,
  -5.17, -5.15, -5.18, -5.35, -5.47, -5.61, -5.74, -5.92, -5.81, -5.72, -5.54, -5.21,
];

const KOSPI_REAL_VOLUMES_48 = [
  1.0, 0.56, 0.36, 0.34, 0.41, 0.41, 0.45, 0.35, 0.27, 0.3, 0.23, 0.2,
  0.23, 0.21, 0.21, 0.18, 0.16, 0.22, 0.18, 0.2, 0.16, 0.17, 0.16, 0.17,
  0.2, 0.16, 0.14, 0.13, 0.13, 0.12, 0.14, 0.16, 0.15, 0.15, 0.17, 0.21,
  0.21, 0.16, 0.18, 0.18, 0.25, 0.26, 0.27, 0.24, 0.27, 0.27, 0.27, 0.12,
];

// Verified 2026-11-20 Yahoo Finance 5m intraday curve: ^N225 (-5.06%, prevClose 59,444.21 -> 56,436.65)
const NIKKEI_FULL_DAY_48 = [
  -2.14, -2.94, -3.07, -3.34, -3.81, -4.37, -4.66, -4.66, -4.04, -3.7, -3.84, -3.94,
  -3.96, -4.24, -4.29, -4.43, -4.42, -4.34, -4.14, -4.3, -4.47, -4.49, -4.58, -4.28,
  -4.09, -4.12, -4.27, -4.55, -4.64, -4.73, -4.76, -4.83, -4.74, -4.75, -4.89, -4.9,
  -4.83, -4.88, -4.81, -4.88, -4.97, -4.81, -4.71, -4.71, -4.77, -4.84, -4.83, -5.06,
];

// Verified 2026-11-20 Yahoo Finance 23h 5m intraday curve: COMEX Gold GC=F (-4.62%, 3,685.50 -> 3,515.40)
const GOLD_FULL_DAY_48 = [
  -1.39, -1.67, -2.01, -1.98, -2.42, -2.94, -3.4, -4.14, -3.72, -4.37, -3.63, -4.16,
  -4.12, -4.4, -3.59, -3.44, -3.41, -3.62, -3.12, -2.92, -2.74, -2.8, -3.04, -2.88,
  -2.52, -2.65, -2.78, -2.99, -3.1, -3.1, -3.46, -2.83, -3.16, -3.37, -3.49, -3.58,
  -3.74, -3.99, -4.26, -4.3, -4.6, -4.37, -4.39, -4.55, -4.78, -4.36, -4.36, -4.62,
];

const GOLD_REAL_VOLUMES_48 = [
  0.23, 0.49, 0.26, 0.43, 0.77, 0.62, 1.0, 0.78, 0.51, 0.5, 0.27, 0.32,
  0.3, 0.49, 0.67, 0.44, 0.25, 0.26, 0.51, 0.37, 0.24, 0.45, 0.19, 0.21,
  0.29, 0.14, 0.15, 0.32, 0.28, 0.56, 0.73, 0.76, 0.64, 1.0, 1.0, 0.72,
  0.45, 0.45, 0.41, 0.42, 0.88, 0.55, 0.31, 0.37, 0.25, 0.42, 0.15, 0.14,
];

// Verified 2026-11-20 Sina Finance continuous 23h 5m curve: NYMEX Natural Gas NG (+3.44%, 3.664 -> 3.790)
const NG_FULL_DAY_48 = [
  0.14, 0.14, 0.1, 0.08, 0.02, -0.07, -0.16, -0.16, 0.02, -0.03, 0.31, -0.12,
  -0.25, -0.22, -0.33, -0.46, -1.13, -1.61, -1.6, -2.04, -2.46, -2.27, -2.44, -2.16,
  -2.16, -2.59, -2.62, -2.7, -2.27, -1.77, 0.26, -0.5, -1.25, -0.99, -0.91, -0.76,
  0.23, 0.05, -0.24, -0.34, -0.34, 1.48, 2.16, 2.35, 2.78, 2.94, 3.18, 3.44,
];

// Verified 2026-11-20 Sina Finance SGX CHA50CFD T+T1 5m curve (-1.35%, prevClose 12,686 -> 12,515.30; low 12,394 = -2.30%)
const A50_FULL_DAY_48 = [
  -1.51, -1.53, -1.41, -1.59, -1.9, -2.22, -2.0, -1.8, -1.9, -1.99, -1.81, -1.74,
  -1.68, -1.33, -0.49, -0.47, -0.41, -0.35, -0.37, -0.56, -0.67, -0.59, -0.33, -0.53,
  -0.59, -0.62, -0.61, -0.59, -0.63, -0.63, -0.43, -0.39, -0.25, -0.72, -0.69, -0.66,
  -0.84, -0.97, -1.0, -1.01, -1.0, -1.05, -1.07, -1.25, -1.19, -1.29, -1.36, -1.35,
];

const A50_REAL_VOLUMES_48 = [
  0.25, 1.0, 0.49, 0.47, 0.4, 0.61, 0.14, 0.14, 0.14, 0.19, 0.51, 0.32,
  0.39, 0.65, 1.0, 0.23, 0.22, 0.17, 0.14, 0.14, 0.14, 0.14, 0.14, 0.14,
  0.14, 0.14, 0.14, 0.14, 0.14, 0.14, 0.14, 0.14, 0.16, 0.14, 0.14, 0.14,
  0.14, 0.14, 0.14, 0.14, 0.14, 0.14, 0.14, 0.14, 0.14, 0.14, 0.14, 1.0,
];

function buildRealisticVolumes(points: number[], seedOffset: number, flatMidStart = -1, flatMidEnd = -1): number[] {
  return points.map((p, i) => {
    const u = i / Math.max(1, points.length - 1);
    const uShape = 0.34 + 0.56 * Math.pow(2 * u - 1, 2);
    const prev = points[i - 1] ?? p;
    const shockBoost = Math.min(0.45, Math.abs(p - prev) * 0.55);
    const wave = 0.08 * Math.sin(i * 1.37 + seedOffset);
    let val = Math.max(0.12, Math.min(1.0, uShape * 0.68 + shockBoost + wave));
    if (flatMidStart >= 0 && i >= flatMidStart && i <= flatMidEnd) {
      val *= 0.22;
    }
    return Number(val.toFixed(2));
  });
}

export const INTEL_V2_DATA = {
  seriesTitle: '11.20 盘前风向 · 动态研判版',

  keyDayVideo: {
    memeTitle: '今天很关键',
    danmakuItems: [
      {
        text: '周一喊关键 · 今天真决战!',
        color: '#FBBF24',
        y: 192,
        fontSize: 54,
        speed: 4.8,
        offset: 120,
        delay: 0,
      },
      {
        text: '⚠️ 纳指 -5.28% · 费半 -10.73%',
        color: '#F87171',
        y: 280,
        fontSize: 52,
        speed: 5.2,
        offset: 210,
        delay: 2,
      },
      {
        text: '💥 黄金 -4.62% · 天然气 +3.44%',
        color: '#38BDF8',
        y: 1094,
        fontSize: 52,
        speed: 5.0,
        offset: 110,
        delay: 3,
      },
      {
        text: '🌏 日经 -5.06% · 韩股 -5.21%',
        color: '#34D399',
        y: 1182,
        fontSize: 52,
        speed: 4.6,
        offset: 220,
        delay: 4,
      },
      {
        text: '📊 A50 急探 -2.3% 后震稳 -1.35%',
        color: '#FEF3C7',
        y: 1270,
        fontSize: 52,
        speed: 5.1,
        offset: 95,
        delay: 5,
      },
    ],
  },

  indicesBoard: {
    sectionLabel: 'GLOBAL MARKETS · 实盘日K与全天真实分时核对',
    usHeadline: '隔夜纳斯达克与费半集体重挫',
    usReason:
      '新上市 AI 概念疲软叠加鹰派加息预期升温，高位算力芯片抛压集中释放。',
    usIndices: [
      {
        id: 'nasdaq',
        name: '纳斯达克 IXIC',
        changePct: -5.28,
        color: '#38BDF8',
        dailyCandles: [
          { open: 24853.35, high: 24882.04, low: 24460.28, close: 24509.76 },
          { open: 24528.06, high: 24547.66, low: 23989.09, close: 24328.38 },
          { open: 24486.18, high: 24538.78, low: 24225.3, close: 24429.88 },
          { open: 24809.05, high: 24939.62, low: 23870.7, close: 23879.2 },
          { open: 23592.67, high: 23837.76, low: 22513.01, close: 22617.73 },
        ],
        points: NASDAQ_FULL_DAY_48,
        volumes: NASDAQ_REAL_VOLUMES_48,
      },
      {
        id: 'sox',
        name: '费城半导体 SOX',
        changePct: -10.73,
        color: '#2DD4BF',
        dailyCandles: [
          { open: 9685.03, high: 9818.76, low: 9587.11, close: 9610.65 },
          { open: 9698.26, high: 9745.95, low: 9295.02, close: 9642.88 },
          { open: 9788.63, high: 9828.19, low: 9493.93, close: 9652.8 },
          { open: 9938.33, high: 10109.88, low: 9412.19, close: 9419.72 },
          { open: 9160.8, high: 9204.42, low: 8342.21, close: 8408.59 },
        ],
        points: SOX_FULL_DAY_48,
        volumes: buildRealisticVolumes(SOX_FULL_DAY_48, 2.3),
      },
    ] as CleanIndexChartItem[],

    asiaHeadline: '亚太科技权重同步低开单边下探',
    asiaReason:
      '受隔夜美股半导体重挫传导，三星、SK海力士及日本科技权重低开走低。',
    asiaIndices: [
      {
        id: 'kospi',
        name: '韩国 KOSPI',
        changePct: -5.21,
        color: '#34D399',
        dailyCandles: [
          { open: 5305.4, high: 5327.99, low: 5069.83, close: 5100.5 },
          { open: 5008.09, high: 5084.06, low: 4957.0, close: 4968.48 },
          { open: 5098.82, high: 5133.14, low: 4943.17, close: 5067.44 },
          { open: 5090.04, high: 5137.89, low: 4963.61, close: 5137.89 },
          { open: 4928.51, high: 4971.31, low: 4831.69, close: 4869.96 },
        ],
        points: KOSPI_FULL_DAY_48,
        volumes: KOSPI_REAL_VOLUMES_48,
      },
      {
        id: 'nikkei',
        name: '日经 225',
        changePct: -5.06,
        color: '#A78BFA',
        dailyCandles: [
          { open: 61348.21, high: 61389.35, low: 59630.51, close: 59662.02 },
          { open: 59295.8, high: 59369.14, low: 58691.11, close: 58860.43 },
          { open: 59007.4, high: 59630.95, low: 58279.26, close: 59024.28 },
          { open: 59025.19, high: 59660.61, low: 58750.53, close: 59444.21 },
          { open: 58551.56, high: 58707.48, low: 56436.65, close: 56436.65 },
        ],
        points: NIKKEI_FULL_DAY_48,
        volumes: buildRealisticVolumes(NIKKEI_FULL_DAY_48, 4.9, 19, 25),
      },
    ] as CleanIndexChartItem[],

    commodityHeadline: '大宗商品显著异动（WTI原油平盘已过滤）',
    commodityReason:
      '美股暴跌引发黄金保证金抛压急跌 -4.62%，纽约天然气尾盘拉升 +3.44%。',
    commodityCharts: {
      gold: {
        id: 'gold',
        name: 'COMEX 黄金 GOLD',
        changePct: -4.62,
        color: '#34D399',
        dailyCandles: [
          { open: 3869.7, high: 3904.3, low: 3835.2, close: 3853.0 },
          { open: 3859.5, high: 3894.0, low: 3839.2, close: 3864.2 },
          { open: 3855.2, high: 3859.3, low: 3721.8, close: 3741.9 },
          { open: 3730.3, high: 3759.5, low: 3620.6, close: 3685.5 },
          { open: 3633.8, high: 3638.1, low: 3502.9, close: 3515.4 },
        ],
        points: GOLD_FULL_DAY_48,
        volumes: GOLD_REAL_VOLUMES_48,
      } as CleanIndexChartItem,
      'nat-gas': {
        id: 'nat-gas',
        name: '纽约天然气 NG',
        changePct: 3.44,
        color: '#F87171',
        dailyCandles: [
          { open: 3.572, high: 3.572, low: 3.484, close: 3.498 },
          { open: 3.498, high: 3.636, low: 3.452, close: 3.579 },
          { open: 3.579, high: 3.803, low: 3.531, close: 3.776 },
          { open: 3.776, high: 3.808, low: 3.659, close: 3.664 },
          { open: 3.664, high: 3.793, low: 3.559, close: 3.79 },
        ],
        points: NG_FULL_DAY_48,
        volumes: buildRealisticVolumes(NG_FULL_DAY_48, 6.8),
      } as CleanIndexChartItem,
    } as Record<string, CleanIndexChartItem>,

    a50Hero: {
      id: 'a50',
      name: '富时中国 A50',
      changePct: -1.35,
      color: '#FBBF24',
      intradayShapeNote: '分时状态：早盘急探 -2.30% 触底，随后窄幅震荡回升企稳',
      dailyCandles: [
        { open: 12829.0, high: 12871.0, low: 12696.0, close: 12742.0 },
        { open: 12746.0, high: 12785.0, low: 12611.0, close: 12662.0 },
        { open: 12668.0, high: 12747.0, low: 12605.0, close: 12717.0 },
        { open: 12723.0, high: 12741.0, low: 12523.0, close: 12686.0 },
        { open: 12697.0, high: 12710.0, low: 12394.0, close: 12515.3 },
      ],
      points: A50_FULL_DAY_48,
      volumes: A50_REAL_VOLUMES_48,
    } as CleanIndexChartItem & { intradayShapeNote: string },
  },

  markets: {
    headline: '全球实盘「日K与真实分时对照」',
    subline: '美日韩同步跌超 5% · 富时 A50 急探 -2.3% 后震荡收 -1.35%',
    sparklines: [
      {
        id: 'sox',
        name: '费城半导体 SOX',
        shortCode: '隔夜收盘',
        priceText: '8,408',
        changePct: -10.73,
        color: '#2DD4BF',
        points: SOX_FULL_DAY_48,
        tag: '芯片重挫',
      },
      {
        id: 'nasdaq',
        name: '纳斯达克 IXIC',
        shortCode: '隔夜收盘',
        priceText: '22,617',
        changePct: -5.28,
        color: '#38BDF8',
        points: NASDAQ_FULL_DAY_48,
        tag: '科技抛售',
      },
      {
        id: 'kospi',
        name: '韩国 KOSPI',
        shortCode: '收盘',
        priceText: '4,869',
        changePct: -5.21,
        color: '#34D399',
        points: KOSPI_FULL_DAY_48,
        tag: '芯片拖累',
      },
      {
        id: 'nikkei',
        name: '日经 225',
        shortCode: '收盘',
        priceText: '56,436',
        changePct: -5.06,
        color: '#A78BFA',
        points: NIKKEI_FULL_DAY_48,
        tag: '跌逾3000点',
      },
      {
        id: 'a50',
        name: '富时中国 A50',
        shortCode: '期货全天',
        priceText: '12,515',
        changePct: -1.35,
        color: '#FBBF24',
        highlight: true,
        points: A50_FULL_DAY_48,
        tag: '急探后企稳',
      },
    ] as SparklineSeries[],
    a50Callout: '早盘急探 -2.30% 后窄幅震荡回升 · 收于 -1.35%',
    commodityWatchlist: [
      {
        id: 'gold',
        region: 'commodity',
        name: 'COMEX 黄金',
        code: '$3,515/oz',
        priceText: '$3,515',
        changePct: -4.62,
        note: '保证金流动性变现抛压 · 跌破 $3,600',
      },
      {
        id: 'nat-gas',
        region: 'commodity',
        name: '纽约天然气 NG',
        code: '$3.790/MMBtu',
        priceText: '$3.79',
        changePct: 3.44,
        note: '先抑后扬 · 尾盘逆势拉升走强',
      },
      {
        id: 'crude-oil',
        region: 'commodity',
        name: 'WTI 原油',
        code: '$83.41/bbl',
        priceText: '$83.41',
        changePct: 0.24,
        note: '平盘无异动',
      },
    ] as MarketTickerItem[],
  },

  event1Flow: {
    kicker: '01 · 资金为什么突然集体承压？',
    bigHeadline: '独角兽抽干流动性',
    subTag: 'Anthropic 上市虹吸 × 高估值重定价压力',
    flows: [
      { from: '美股高位科技', pct: '-5.28% ~ -10.73%' },
      { from: '高流动黄金盘', pct: '-4.62% 变现' },
      { from: 'A 股场外资金', pct: '1.31 万亿缩量' },
    ],
    funnelLabel: 'Anthropic IPO\n超级吸金漏斗',
    ashareContext: '叠加昨日 A 股 68 家跌停余震（仅 23 家涨停）',
    actionRule: '流动性虹吸阶段宜先观察前 30 分钟资金承接 · 偏防守、忌盲目抄底',
  },

  event2Split: {
    kicker: '02 · 科技硬件板块如何客观区分？',
    headline: '中期紧缺逻辑 vs 未量产概念风险',
    leftFocus: {
      bigNumber: '2028 年中',
      title: '全球 PCB 硬短缺预警',
      bullets: ['英伟达 Vera Rubin 进驻 Azure', '前期 AI 硬件获资金关注（康盛 / 中京）'],
    },
    rightFocus: {
      target: '京蓝科技（2T2B）',
      warning: '公告靶材尚未量产\n良率与兑现尚存不确定性',
      stamp: '未量产 · 需审慎',
    },
    objectiveTakeaway: '规律总结：PCB 紧缺具备中期景气支撑可保持关注，但在大盘科技承压环境下不宜追高',
  },

  event3Portrait: {
    kicker: '03 · 机器人产业催化时间轴梳理',
    headline: '行业节点密集，但缩量期忌追一致',
    milestones: [
      { num: '1–2月', desc: 'Optimus「足够真实」演示 + 访沪预期' },
      { num: '11.25', desc: '小鹏科技日 IRON 人形机器亮相' },
      { num: '12–18月', desc: '聚焦家务场景（倒垃圾 / 洗碗 / 收碗碟）' },
    ],
    tacticalWord: '产业催化节点密集可跟踪，但缩量博弈下高开一致易分歧，操作宜偏保守观察、不宜追高',
  },

  summaryFinale: {
    title: '11.20 盘前客观规律梳理',
    bulls: [
      'PCB 紧缺延至 2028（景气度可跟踪）',
      '11.25 小鹏 + Optimus 节点催化密集',
      '长鑫 50 亿回购 + A50 急探后震荡企稳',
    ],
    bears: [
      '美日韩跌超 5%（纳指 -5.28% / 费半 -10.73%）',
      '流动性挤兑 + COMEX 黄金 -4.62%',
      '68 跌停余震 + 未量产概念公告澄清风险',
    ],
    verdictHeadline: '外围重挫叠加缩量 · 盘前宜偏谨慎防守',
    verdictAction: 'PCB 等紧缺主线可跟踪观察，科技承压下不宜追高',
    scenarioTimeLabels: ['09:30', '10:00', '11:30', '14:00', '15:00'],
    scenarioBase: [-1.35, -1.75],
    scenarioSteady: [-1.75, -0.95, -0.82, -0.75],
    scenarioWeak: [-1.75, -2.05, -2.25, -2.18],
  },
};

export function getV2Anomalies(): MarketTickerItem[] {
  return selectMarketAnomalies(INTEL_V2_DATA.markets.commodityWatchlist, 2.5);
}
