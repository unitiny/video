/// <reference types="node" />

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import type {
  CleanIndexChartItem,
  DailyCandle,
  DanmakuItem,
  EpisodeManifest,
  HookLibraryEntry,
  HookLibraryManifest,
  MarketBoardSceneData,
  MarketCommodityWatchItem,
} from '../src/video/engine/schema.ts';
import { DEFAULT_MARKET_BOARD_TIMING } from '../src/video/engine/timeline.ts';
import type { VerifiedMarketBundle } from './fetch-market-data.ts';
import { validateEpisodeManifest } from './validate-episode.ts';

export interface CreateEpisodeInput {
  date: string;
  hook: HookLibraryEntry;
  market?: VerifiedMarketBundle;
}

function formatLocalDate(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function shortDateLabel(dateStr: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (!match) return dateStr;
  return `${Number(match[2])}.${Number(match[3])}`;
}

function fmtPct(pct: number): string {
  const rounded = Math.round(pct * 100) / 100;
  return `${rounded >= 0 ? '+' : ''}${rounded.toFixed(2)}%`;
}

function makeSafePlaceholderChart(
  id: string,
  name: string,
  basePrice: number,
  changePct: number,
  color: string
): CleanIndexChartItem {
  const decimals = basePrice < 20 ? 3 : basePrice < 200 ? 2 : 1;
  const round = (v: number) => {
    const f = 10 ** decimals;
    return Math.round(v * f) / f;
  };

  const dailyCandles: DailyCandle[] = [];
  let cursor = basePrice;
  for (let i = 0; i < 4; i++) {
    const open = round(cursor);
    const close = round(cursor * (1 + (i % 2 === 0 ? -0.004 : 0.003)));
    const high = round(Math.max(open, close) * 1.006);
    const low = round(Math.min(open, close) * 0.994);
    dailyCandles.push({ open, high, low, close });
    cursor = close;
  }

  const lastOpen = round(cursor * (1 + (changePct * 0.35) / 100));
  const lastClose = round(cursor * (1 + changePct / 100));
  const lastHigh = round(Math.max(lastOpen, lastClose) * 1.005);
  const lastLow = round(Math.min(lastOpen, lastClose) * 0.995);
  dailyCandles.push({ open: lastOpen, high: lastHigh, low: lastLow, close: lastClose });

  const points: number[] = Array.from({ length: 48 }, (_, idx) => {
    const t = idx / 47;
    const wave = Math.sin(t * Math.PI * 2.5) * 0.12 * (1 - t);
    const val = changePct * (0.35 + 0.65 * t) + wave;
    return Math.round(val * 100) / 100;
  });
  points[47] = Math.round(changePct * 100) / 100;

  const volumes: number[] = Array.from({ length: 48 }, (_, idx) => {
    const u = idx / 47;
    const uCurve = 0.25 + 0.65 * Math.pow(2 * u - 1, 2);
    return Math.round(Math.max(0.12, Math.min(1.0, uCurve)) * 100) / 100;
  });

  return {
    id,
    name,
    changePct: Math.round(changePct * 100) / 100,
    color,
    dailyCandles,
    points,
    volumes,
  };
}

function buildPlaceholderMarketBoard(dateLabel: string): MarketBoardSceneData {
  const nasdaq = makeSafePlaceholderChart('nasdaq', '纳斯达克 IXIC', 22600, -1.25, '#38BDF8');
  const sox = makeSafePlaceholderChart('sox', '费城半导体 SOX', 8400, -1.85, '#2DD4BF');
  const kospi = makeSafePlaceholderChart('kospi', '韩国 KOSPI', 4870, -0.95, '#34D399');
  const nikkei = makeSafePlaceholderChart('nikkei', '日经 225', 56400, -1.1, '#A78BFA');
  const gold = makeSafePlaceholderChart('gold', 'COMEX 黄金 GOLD', 3520, -2.85, '#34D399');
  const crude: MarketCommodityWatchItem = {
    id: 'crude-oil',
    name: 'WTI 原油',
    code: '$83.00/bbl',
    priceText: '$83.00',
    changePct: 0.32,
    note: '平盘无异动（占位示例，待替换实盘）',
  };
  const a50Base = makeSafePlaceholderChart('a50', '富时中国 A50', 12520, -0.68, '#FBBF24');

  return {
    headerTag: 'MARKETS · 全天分时与日K',
    sectionLabel: `GLOBAL MARKETS · ${dateLabel} 实盘待灌入占位模板`,
    usHeadline: '隔夜美股科技与半导体走弱（待填充实盘归因）',
    usReason: '【待填充】请运行 fetch-market-data.ts 后依据隔夜消息面补齐客观归因。',
    usIndices: [nasdaq, sox],
    asiaHeadline: '亚太主要股指早盘联动消化（待填充实盘归因）',
    asiaReason: '【待填充】请根据日韩权重与汇率变化补充客观传导说明。',
    asiaIndices: [kospi, nikkei],
    commodityHeadline: '大宗商品异动筛选（WTI原油平盘已过滤 · 占位）',
    commodityReason: '【待填充】请依据 market_audit.md 核验后的异动大宗品种填写客观驱动。',
    anomalyThresholdPct: 2.5,
    commodityWatchlist: [
      {
        id: 'gold',
        name: 'COMEX 黄金',
        code: '$3,520/oz',
        priceText: '$3,520',
        changePct: -2.85,
        note: '占位示例 · 请替换为实盘核验数据',
      },
      crude,
    ],
    commodityCharts: {
      gold,
    },
    a50Hero: {
      ...a50Base,
      intradayShapeNote: '分时状态：占位示例曲线，请运行 fetch-market-data.ts 注入实盘 A50 分时',
    },
    timing: { ...DEFAULT_MARKET_BOARD_TIMING },
  };
}

function buildMarketBoardFromVerified(
  dateLabel: string,
  market: VerifiedMarketBundle
): MarketBoardSceneData {
  const [nasdaq, sox] = market.usIndices;
  const [kospi, nikkei] = market.asiaIndices;

  const usDirection =
    nasdaq.changePct <= -1.5 || sox.changePct <= -2.0
      ? '承压走低'
      : nasdaq.changePct >= 1.5 || sox.changePct >= 2.0
        ? '共振走强'
        : '震荡分化';

  const asiaDirection =
    kospi.changePct <= -1.0 && nikkei.changePct <= -1.0
      ? '同步低开承压'
      : kospi.changePct >= 1.0 && nikkei.changePct >= 1.0
        ? '携手温和走高'
        : '盘面结构分化';

  const filteredNames = market.filteredOut.map((f) => f.name).slice(0, 2).join('/');
  const commodityHeadline =
    market.anomalies.length > 0
      ? filteredNames
        ? `大宗商品显著异动（${filteredNames}平盘已过滤）`
        : '大宗商品盘面波动放大'
      : '大宗商品整体平盘震荡（无超阈值异动）';

  const commoditySummary =
    market.anomalies.length > 0
      ? market.anomalies
          .slice(0, 2)
          .map((item) => `${item.name} ${fmtPct(item.changePct)}`)
          .join('，') + '，【待补充】请结合隔夜宏观与库存消息完善客观归因。'
      : '【待补充】主流大宗均未触发异动阈值，可简要交代美元与避险情绪变化。';

  return {
    headerTag: 'MARKETS · 全天分时与日K',
    sectionLabel: `GLOBAL MARKETS · ${dateLabel} 实盘日K与全天真实分时核对`,
    usHeadline: `隔夜纳斯达克与费半${usDirection}`,
    usReason: `纳指 ${fmtPct(nasdaq.changePct)}、费半 ${fmtPct(sox.changePct)}，【待补充】请结合隔夜财报/宏观预期完善客观归因。`,
    usIndices: market.usIndices,
    asiaHeadline: `亚太科技权重早盘${asiaDirection}`,
    asiaReason: `韩国 KOSPI ${fmtPct(kospi.changePct)}、日经225 ${fmtPct(nikkei.changePct)}，【待补充】请补充日韩权重传导细节。`,
    asiaIndices: market.asiaIndices,
    commodityHeadline,
    commodityReason: commoditySummary,
    anomalyThresholdPct: market.thresholdPct,
    commodityWatchlist: market.commodityWatchlist,
    commodityCharts: market.commodityCharts,
    a50Hero: market.a50Hero,
    timing: { ...DEFAULT_MARKET_BOARD_TIMING },
  };
}

function buildHookDanmakuItems(
  hook: HookLibraryEntry,
  dateLabel: string,
  market?: VerifiedMarketBundle
): DanmakuItem[] {
  const slots = hook.danmakuSlots.slice(0, 5);

  let texts: string[];
  if (market) {
    const [nasdaq, sox] = market.usIndices;
    const [kospi, nikkei] = market.asiaIndices;
    const topAnomalies = market.anomalies.slice(0, 2);
    const commodityLine =
      topAnomalies.length >= 2
        ? `💥 ${topAnomalies[0].name.replace(/COMEX |纽约/, '')} ${fmtPct(topAnomalies[0].changePct)} · ${topAnomalies[1].name.replace(/COMEX |纽约/, '')} ${fmtPct(topAnomalies[1].changePct)}`
        : topAnomalies.length === 1
          ? `💥 ${topAnomalies[0].name} ${fmtPct(topAnomalies[0].changePct)}`
          : '💥 大宗商品平盘窄幅震荡';

    texts = [
      `${dateLabel} 盘前第一信号 · 重点观察`,
      `⚠️ 纳指 ${fmtPct(nasdaq.changePct)} · 费半 ${fmtPct(sox.changePct)}`,
      commodityLine,
      `🌏 日经 ${fmtPct(nikkei.changePct)} · 韩股 ${fmtPct(kospi.changePct)}`,
      `📊 A50 最新 ${fmtPct(market.a50Hero.changePct)} · 看早盘承接`,
    ];
  } else {
    texts = [
      `${dateLabel} 盘前第一信号 · 待填实盘`,
      '⚠️ 纳指 / 费半隔夜行情待更新',
      '💥 大宗异动品种核验后填入',
      '🌏 日经 / 韩股早盘动向待更新',
      '📊 A50 盘前锚点 · 观察开盘量能',
    ];
  }

  return slots.map((slot, idx) => ({
    text: texts[idx] ?? `${dateLabel} 核心风向信号`,
    color: slot.defaultColor,
    y: slot.y,
    fontSize: Math.max(48, slot.fontSize),
    speed: slot.speed,
    offset: slot.offset,
    delay: idx === 0 ? 0 : idx + 1,
  }));
}

export function buildEpisodeManifest(input: CreateEpisodeInput): EpisodeManifest {
  const { date, hook, market } = input;
  const dateLabel = shortDateLabel(date);
  const marketBoard = market
    ? buildMarketBoardFromVerified(dateLabel, market)
    : buildPlaceholderMarketBoard(dateLabel);
  const danmakuItems = buildHookDanmakuItems(hook, dateLabel, market);

  const a50Open = market ? Math.round(market.a50Hero.changePct * 100) / 100 : -0.68;
  const pivotVal = Math.round((a50Open - 0.35) * 100) / 100;
  const steadyPath = [
    pivotVal,
    Math.round((pivotVal + 0.55) * 100) / 100,
    Math.round((pivotVal + 0.72) * 100) / 100,
    Math.round((pivotVal + 0.85) * 100) / 100,
  ];
  const weakPath = [
    pivotVal,
    Math.round((pivotVal - 0.3) * 100) / 100,
    Math.round((pivotVal - 0.48) * 100) / 100,
    Math.round((pivotVal - 0.42) * 100) / 100,
  ];

  const nowIso = new Date().toISOString();

  return {
    schemaVersion: 1,
    id: date,
    date,
    title: `${dateLabel} 盘前风向（动态研判版）`,
    seriesTitle: `${dateLabel} 盘前风向 · 动态研判版`,
    description: `${dateLabel} 盘前 2.6 秒极速开屏 + 按开盘时序拆解全球实盘日K分时 + 三大核心事件拆解 + 10:00 量能观察窗双情景推演。`,
    spec: {
      width: 1080,
      height: 1920,
      fps: 30,
      bpm: 112,
    },
    metadata: {
      sourceSummary: market
        ? `${market.dataSources.join(' + ')} 交叉核验 ${date} 全球实盘日K与48点全天分时`
        : `${date} 初始脚手架（尚未注入实盘核验数据，请先运行 fetch-market-data.ts）`,
      createdAt: nowIso,
      verifiedAt: market?.fetchedAt,
      dataSources: market ? market.dataSources : ['待采集（Yahoo Finance + 新浪财经）'],
    },
    scenes: [
      {
        id: 'v2-01-keyday-video',
        kind: 'hook_live_video',
        durationFrames: 78,
        title: '2.6秒极速开屏：波普动效 + 精炼大字弹幕 → 光刃清屏',
        subtitle: `${hook.label} + ${danmakuItems.length}道大字核心弹幕 + 极速清屏转场`,
        editorialCraft: '零废话极速进场 + 弹幕避让禁区停泊 + 立体波普标题扫光 + 光刃闭幕转场',
        focusGoal: '2.6 秒内完成强紧迫感吸睛、核心行情速览与干净清屏转场，不耗费观众耐心',
        data: {
          hookId: hook.id,
          videoSrc: hook.videoSrc,
          posterSrc: hook.posterSrc,
          sample: { ...hook.sample },
          memeTitle: '今天很关键',
          wordmark: {
            badgeText: `● ${dateLabel} 盘前第一信号`,
            leftText: '今天',
            stampText: '很',
            heroText: '关键',
            exclaimText: '!!',
          },
          forbiddenZones: hook.forbiddenZones.map((z) => ({ ...z })),
          danmakuItems,
        },
      },
      {
        id: 'v2-02-indices-board',
        kind: 'market_chrono_board',
        durationFrames: 420,
        title: '按开盘时序拆解全球实盘日 K 与全天真实分时（+1秒停顿版）',
        subtitle: '美股→1秒停顿→亚太→异动大宗（过滤平盘）→富时A50收尾多停1秒',
        editorialCraft: '多源交叉核验日K与5m分时曲线 + 逐字消息面归因打字机 + A50 展毕充足停留窗',
        focusGoal: '100% 对齐交易所真实日K与分时走向，客观呈现外盘传导与 A50 盘前定位',
        data: marketBoard,
      },
      {
        id: 'v2-03-funnel',
        kind: 'event_flow_funnel',
        durationFrames: 150,
        title: '事件 01 资金流向图：【待填充核心宏观/流动性主线】',
        subtitle: '无交叉多路箭头指向核心资金变量 × 客观承接观察窗提示',
        editorialCraft: '分道不交叉贝塞尔箭头 + 荧光笔重点提示',
        focusGoal: '清晰呈现资金流向与情绪传导路径，保持客观审慎',
        data: {
          headerTag: 'EVENT 01 · 资金图谱',
          kicker: '01 · 今日盘面核心资金变量是什么？',
          bigHeadline: '【待填】核心流动性事件标题',
          subTag: '【待填】隔夜资金动向 × 市场成交额背景',
          flows: [
            { from: '外围科技/权重', pct: fmtPct(marketBoard.usIndices[0].changePct) },
            { from: '亚太/大宗联动', pct: fmtPct(marketBoard.asiaIndices[0].changePct) },
            { from: 'A 股场内量能', pct: '待填昨日成交额' },
          ],
          funnelLabel: '核心资金焦点\n【待填充】',
          bigStatText: '待填关键指标',
          bigStatColor: '#059669',
          ashareContext: '【待填充】结合昨日涨跌停家数与成交额变化客观交代情绪背景',
          highlightLine1: '先观察开盘前 30 分钟资金承接力度',
          highlightLine2: '量能未确认前宜偏谨慎观察，忌盲目抄底',
          bottomCaption: '【待填充】一句客观纪律总结（不含主观涨跌断言）',
          actionRule: '开盘前 30 分钟先观察量能与承接变化 · 控制节奏、忌盲目追高',
        },
      },
      {
        id: 'v2-04-spotlight',
        kind: 'event_dual_spotlight',
        durationFrames: 150,
        title: '事件 02 双焦聚光切分：【待填景气逻辑 vs 风险对照】',
        subtitle: '先聚焦左侧中期景气线索 → 再切右侧兑现风险提示',
        editorialCraft: 'Focus-and-Dim 局部压暗切分 + 物理审慎印章',
        focusGoal: '客观区分基本面景气主线与短期情绪炒作风险，守住审慎边界',
        data: {
          headerTag: 'EVENT 02 · 聚光切分',
          kicker: '02 · 热门板块如何客观区分？',
          headline: '中期景气线索 vs 短期兑现风险',
          switchFrame: 70,
          stampFrame: 90,
          leftFocus: {
            bigNumber: '【待填指标】',
            title: '【待填】左侧景气支撑逻辑',
            bullets: [
              '【待填】产业供需或订单客观事实 1',
              '【待填】相关细分环节观察线索 2',
            ],
          },
          rightFocus: {
            target: '【待填】风险对照标的/题材',
            warning: '【待填】公告澄清或业绩尚未兑现\n短期波动存在较大不确定性',
            stamp: '需审慎核验',
          },
          footerLine1: '规律总结：具备景气支撑的方向可保持跟踪',
          footerLine2: '但情绪承压阶段不宜盲目追高',
          objectiveTakeaway: '规律总结：景气逻辑可跟踪观察，但在市场承压环境下不宜盲目追高',
        },
      },
      {
        id: 'v2-05-robot',
        kind: 'event_timeline',
        durationFrames: 150,
        title: '事件 03 产业催化时间轴：【待填充近期关键节点】',
        subtitle: '按时间顺序列出产业催化节点 × 提示缩量一致分歧风险',
        editorialCraft: '去框化悬浮时间条 + 保守节奏提示横幅',
        focusGoal: '理清产业催化先后顺序，提示一致预期下的分歧风险',
        data: {
          headerTag: 'EVENT 03 · 催化节奏',
          kicker: '03 · 产业催化时间轴梳理',
          headline: '催化节点明确，缩量期忌追一致',
          milestones: [
            { num: '节点 1', desc: '【待填】近期产业发布/政策观察窗口' },
            { num: '节点 2', desc: '【待填】核心重点催化事件日期', highlight: true },
            { num: '节点 3', desc: '【待填】中长期落地验证周期' },
          ],
          bannerHeadline: '催化节点可跟踪 · 缩量忌追高开一致',
          bannerSubline: '【待填】板块前排情绪参考（注意兑现分歧风险）',
          tacticalWord: '产业催化节点密集可跟踪，但缩量博弈下高开一致易分歧，操作宜偏保守观察',
        },
      },
      {
        id: 'v2-06-verdict',
        kind: 'verdict_scenario',
        durationFrames: 240,
        title: '客观规律总览 × 10:00 分化双情景推演',
        subtitle: '支撑线索与承压风险客观对照 × 强承接/弱震荡双情景分支（不作主观涨跌断言）',
        editorialCraft: '10:00 量能观察窗双路径分叉图 + 零遮挡标注',
        focusGoal: '客观总结市场多空因素与两种演化情景，守住审慎保守的研判边界',
        data: {
          headerTag: 'SUMMARY · 客观规律',
          title: `${dateLabel} 盘前客观规律梳理`,
          bullsHeading: '▲ 客观支撑线索',
          bearsHeading: '▼ 客观承压风险',
          bulls: [
            '【待填】核心产业景气度与中期逻辑线索',
            '【待填】近期密集催化节点与资金关注点',
            `A50 盘前定位 ${fmtPct(marketBoard.a50Hero.changePct)}，观察早盘承接强度`,
          ],
          bears: [
            `隔夜美股：纳指 ${fmtPct(marketBoard.usIndices[0].changePct)} / 费半 ${fmtPct(marketBoard.usIndices[1].changePct)}`,
            `亚太联动：日经 ${fmtPct(marketBoard.asiaIndices[1].changePct)} / 韩股 ${fmtPct(marketBoard.asiaIndices[0].changePct)}`,
            '【待填】场内缩量/跌停余震/公告澄清等风险因素',
          ],
          scenarioHeading: `${dateLabel} 早盘双情景演化对照（10:00 前30分钟量能为分水岭）`,
          openingLabel: '开盘消化外盘波动',
          pivotLabel: '10:00 量能观察窗',
          steadyBranchLabel: '情景 A：放量承接稳住 → 局部结构轮动',
          weakBranchLabel: '情景 B：缩量延续 → 偏防守弱震荡',
          scenarioTimeLabels: ['09:30', '10:00', '11:30', '14:00', '15:00'],
          scenarioBase: [a50Open, pivotVal],
          scenarioSteady: steadyPath,
          scenarioWeak: weakPath,
          verdictHeadline: '多空信号交织 · 盘前宜偏谨慎观察',
          verdictAction: '以 10:00 量能承接为锚点，景气主线可跟踪但不宜盲目追高',
          disclaimer: '客观市场规律梳理 · 仅供信息参考，不构成任何投资建议',
        },
      },
    ],
  };
}

interface CreateCliArgs {
  date: string;
  marketPath?: string;
  hookId?: string;
  outPath?: string;
  force: boolean;
}

function parseCliArgs(argv: string[]): CreateCliArgs {
  let date = formatLocalDate();
  let marketPath: string | undefined;
  let hookId: string | undefined;
  let outPath: string | undefined;
  let force = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--date' && argv[i + 1]) {
      date = argv[++i];
    } else if (arg === '--market' && argv[i + 1]) {
      marketPath = argv[++i];
    } else if (arg === '--hook' && argv[i + 1]) {
      hookId = argv[++i];
    } else if (arg === '--out' && argv[i + 1]) {
      outPath = argv[++i];
    } else if (arg === '--force') {
      force = true;
    } else if (arg === '--help' || arg === '-h') {
      console.log(
        [
          '用法: bun scripts/create-episode.ts --date YYYY-MM-DD [选项]',
          '',
          '选项:',
          '  --date YYYY-MM-DD   节目日期（默认今天）',
          '  --market <path>     已核验的 market_verified.json 路径（自动灌入第 2 幕实盘数据）',
          '  --hook <hookId>     首屏钩子 ID（来自 assets/hooks/manifest.json，默认 defaultHookId）',
          '  --out <path>        输出路径（默认 episodes/<date>/episode.json）',
          '  --force             若目标 episode.json 已存在则强制覆盖',
        ].join('\n')
      );
      process.exit(0);
    }
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error(`--date 必须为 YYYY-MM-DD 格式，收到: "${date}"`);
  }

  return { date, marketPath, hookId, outPath, force };
}

function runCli(): void {
  const args = parseCliArgs(process.argv.slice(2));
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const projectRoot = path.resolve(scriptDir, '..');

  // 1. Load hook manifest
  const hookManifestPath = path.join(projectRoot, 'assets', 'hooks', 'manifest.json');
  if (!fs.existsSync(hookManifestPath)) {
    throw new Error(`找不到钩子清单文件：${hookManifestPath}`);
  }
  const hookManifest = JSON.parse(
    fs.readFileSync(hookManifestPath, 'utf-8')
  ) as HookLibraryManifest;

  const selectedHookId = args.hookId ?? hookManifest.defaultHookId;
  const selectedHook = hookManifest.hooks.find((h) => h.id === selectedHookId);
  if (!selectedHook) {
    const available = hookManifest.hooks.map((h) => h.id).join(', ');
    throw new Error(`未找到 hookId="${selectedHookId}"，可用钩子：[${available}]`);
  }

  // 2. Optionally load market_verified.json
  let verifiedMarket: VerifiedMarketBundle | undefined;
  if (args.marketPath) {
    const marketAbs = path.resolve(process.cwd(), args.marketPath);
    if (!fs.existsSync(marketAbs)) {
      throw new Error(`指定的市场数据文件不存在：${marketAbs}`);
    }
    verifiedMarket = JSON.parse(fs.readFileSync(marketAbs, 'utf-8')) as VerifiedMarketBundle;
  }

  // 3. Check output target
  const outRel = args.outPath ?? path.join('episodes', args.date, 'episode.json');
  const outAbs = path.resolve(process.cwd(), outRel);
  if (fs.existsSync(outAbs) && !args.force) {
    throw new Error(`目标文件已存在：${outAbs}（如需覆盖请显式添加 --force）`);
  }

  // 4. Build manifest & write
  const episode = buildEpisodeManifest({
    date: args.date,
    hook: selectedHook,
    market: verifiedMarket,
  });

  fs.mkdirSync(path.dirname(outAbs), { recursive: true });
  fs.writeFileSync(outAbs, `${JSON.stringify(episode, null, 2)}\n`, 'utf-8');

  // 5. Self-validate immediately
  const report = validateEpisodeManifest(episode, {
    strictAssetCheck: true,
    projectRoot,
  });

  console.log('============================================================');
  console.log(`✅ 已生成节目脚手架: ${outAbs}`);
  console.log(`   - 首屏钩子: ${selectedHook.id} (${selectedHook.label})`);
  console.log(
    `   - 市场数据: ${verifiedMarket ? `已灌入实盘核验数据 (${args.marketPath})` : '安全占位模板（待替换实盘）'}`
  );
  console.log(
    `   - 初始质检: ${report.ok ? '✅ 通过（0 Error）' : `❌ 发现 ${report.errors.length} 项错误`} | 警告: ${report.warnings.length}`
  );
  console.log('------------------------------------------------------------');
  console.log('下一步操作建议：');
  if (!verifiedMarket) {
    console.log(`  1. 拉取并核验实盘数据: bun scripts/fetch-market-data.ts --date ${args.date}`);
    console.log(
      `  2. 核对 episodes/${args.date}/market_audit.md 后重新注入: bun scripts/create-episode.ts --date ${args.date} --market episodes/${args.date}/market_verified.json --force`
    );
    console.log('  3. 填充第 3~5 幕事件文案与配图，更新第 6 幕客观支撑/承压要点');
    console.log(`  4. 运行上线前红线质检: bun scripts/validate-episode.ts ${outRel}`);
  } else {
    console.log(`  1. 核对 episodes/${args.date}/market_audit.md 中的跨源校验与异动过滤结果`);
    console.log('  2. 填充第 2 幕消息面归因与第 3~5 幕事件文案/配图，完善第 6 幕多空要点');
    console.log(`  3. 运行上线前红线质检: bun scripts/validate-episode.ts ${outRel}`);
  }
  console.log('============================================================');
}

const isDirectRun =
  typeof process !== 'undefined' &&
  Array.isArray(process.argv) &&
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isDirectRun) {
  try {
    runCli();
  } catch (err) {
    console.error('[create-episode] 执行失败:', err instanceof Error ? err.message : err);
    process.exit(1);
  }
}
