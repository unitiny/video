export const INTEL_VIDEO_SPEC = {
  width: 1080,
  height: 1920,
  fps: 30,
  totalFrames: 900,
  durationSec: 30.0,
  bpm: 108.0,
} as const;

export interface MarketTickerItem {
  id: string;
  region: 'us' | 'asia' | 'china' | 'commodity';
  name: string;
  code: string;
  priceText: string;
  changePct: number;
  note: string;
  isPrimaryBellwether?: boolean;
}

/**
 * Pure filter rule: For commodities / watchlist assets, ONLY display significant anomalies
 * (e.g. |changePct| >= thresholdPct, default 2.5%). Calm assets like Bitcoin (+0.38%) are hidden.
 */
export function selectMarketAnomalies(
  items: MarketTickerItem[],
  thresholdPct = 2.5
): MarketTickerItem[] {
  return items.filter((item) => Math.abs(item.changePct) >= thresholdPct);
}

export const INTEL_1120_DATA = {
  seriesTitle: '11.20 盘前风向 · 全景拆解',

  memeOpening: {
    topCaption: '财经大V每日口头禅',
    slamHeadline: '今天很关键!!',
    subLine1: '家人们，昨晚外围绿成一片…',
    subLine2: '到底是吃红烧肉，还是去天桥？先看全球实盘！',
  },

  markets: {
    headerTitle: '全球隔夜至今早 8 点实盘异动',
    headerSubtitle: '重要指数全覆盖 · 大宗商品仅展示明显异动品种',
    usIndices: [
      {
        id: 'nasdaq',
        region: 'us',
        name: '纳斯达克指数',
        code: 'IXIC · 昨夜收盘',
        priceText: '20,842',
        changePct: -5.08,
        note: '单日暴跌超5%，AI高估值承压与鹰派预期共振',
      },
      {
        id: 'sox',
        region: 'us',
        name: '费城半导体指数',
        code: 'SOX · 昨夜收盘',
        priceText: '4,812',
        changePct: -6.42,
        note: '芯片算力重挫领跌，高开低走剧烈抛售',
      },
    ] as MarketTickerItem[],
    asiaIndices: [
      {
        id: 'nikkei',
        region: 'asia',
        name: '日经 225 指数',
        code: 'N225 · 08:00至今',
        priceText: '56,436',
        changePct: -5.06,
        note: '暴跌逾 3000 点，创 7 个月新低',
      },
      {
        id: 'kospi',
        region: 'asia',
        name: '韩国 KOSPI 指数',
        code: 'KS11 · 08:00至今',
        priceText: '4,869',
        changePct: -5.21,
        note: '失守 5000 关口，存储半导体双雄拖累',
      },
    ] as MarketTickerItem[],
    chinaBellwether: {
      id: 'ftse-a50',
      region: 'china',
      name: '富时中国 A50 期货',
      code: 'CN · A股早盘风向标',
      priceText: '12,553',
      changePct: -1.92,
      note: '受外围情绪压制低开，但显着抗跌于美日韩市场',
      isPrimaryBellwether: true,
    } as MarketTickerItem,
    commodityWatchlist: [
      {
        id: 'gold',
        region: 'commodity',
        name: '国际现货黄金',
        code: 'XAU/USD · 重大异动',
        priceText: '$3,514',
        changePct: -4.85,
        note: '连破 3800/3700/3600 关口！股市大跌引发补保证金踩踏',
      },
      {
        id: 'crude-oil',
        region: 'commodity',
        name: 'WTI / 布伦特原油',
        code: 'CL / BRN · 逆势异动',
        priceText: '$83.4 / $92.1',
        changePct: 3.4,
        note: '地缘风险溢价支撑，与股金走出独立拉升分化',
      },
      {
        id: 'btc',
        region: 'commodity',
        name: '比特币 BTC',
        code: 'BTC/USD',
        priceText: '$89,420',
        changePct: 0.38,
        note: '无显著异动',
      },
      {
        id: 'copper',
        region: 'commodity',
        name: 'LME 伦铜',
        code: 'CA',
        priceText: '$9,110',
        changePct: -0.55,
        note: '无显著异动',
      },
    ] as MarketTickerItem[],
    calmSkippedNote: '已自动过滤比特币(+0.38%)、伦铜等无显著异动品种，只看真异动',
  },

  eventTabloid: {
    kicker: '金融头版 · EVENT 01',
    editionText: '2026.11.20 早报特刊',
    headline: '独角兽抽血，A股早盘怎么扛？',
    causeTitle: '前因 · 全球水龙头拧紧',
    causeBody:
      '超级独角兽 Anthropic 今日上市强力虹吸百亿流动性，叠加美联储鹰派放风与高位获利兑现，引发美日韩股市与黄金同步踩踏。',
    causeHighlight: 'Anthropic 上市吸金 × 全球流动性挤兑',
    impactTitle: '传导 · 昨日 68 跌停余震',
    impactBody:
      '昨日 A 股缩量至 1.31 万亿（23 涨停 / 68 跌停），早盘难免受外围情绪拖累低开测试。前 30 分钟量能与核心承接力度决定全天强弱，切忌盲目接飞刀！',
    impactHighlight: '开盘前 30 分钟先看承接 · 严控仓位',
  },

  eventBlueprint: {
    kicker: '硬核拆解 · EVENT 02',
    headline: 'PCB 缺货到 2028，谁是真硬件？',
    bullColumnTitle: '真紧缺 · 硬产业逻辑',
    bullPoints: [
      '全球电子协会预警：PCB 严重短缺将延至 2028 年中',
      '英伟达 Vera Rubin 正式进驻微软 Azure，算力硬件需求实锤',
      '昨日 AI 硬件 3 连板抱团（康盛股份 / 中京电子）',
    ],
    trapColumnTitle: '排雷区 · 概念警示',
    trapTarget: '京蓝科技（2T2B）',
    trapDetail: '公司明确公告靶材尚未量产、良率存疑，谨防资金去伪存真砸盘！',
    stampText: '尚未量产 · 警惕',
    bottomVerdict: '策略：盯紧有真实订单的 PCB 前排承接，坚决避开未量产画饼题材',
  },

  eventPortrait: {
    kicker: '人物漫谈 · EVENT 03',
    headline: '洗碗机器人真来了？双催化接力节奏',
    speakerName: '马斯克 · Optimus 最新预告',
    bubble1: '“1–2 个月内推出足够真实的演示，我还会亲自来上海！”',
    bubble2: '“12–18 个月内学会倒垃圾、洗碗、收碗碟，真正走进家庭！”',
    timelineSteps: [
      { time: '1–2 个月内', label: 'Optimus 真实演示' },
      { time: '11.25 科技日', label: '小鹏 IRON 亮相' },
      { time: '12–18 个月', label: '家务落地 + 访沪' },
    ],
    tacticalNote:
      '昨日机器人 2 板（毅昌科技 / 襄阳轴承）。两大事件接力有望带来支线轮动，但缩量期只宜低吸埋伏，不追一致高点！',
  },

  summary: {
    headerTitle: '11.20 盘前总汇总',
    headerSubtitle: '外围重挫与内部催化并存 · 清晰站队再出手',
    bullishItems: [
      {
        title: 'AI 硬件长周期紧缺',
        detail: 'PCB 缺货至 2028 年中 + 英伟达 Vera Rubin 进驻 Azure',
      },
      {
        title: '机器人双节点接力',
        detail: 'Optimus 1–2 月真实演示预期 + 11.25 小鹏 IRON 科技日',
      },
      {
        title: '产业回购与局部抱团',
        detail: '长鑫 25–50 亿 / 海光 5–8 亿回购 + 光刻胶 8 板 + A50 显着抗跌',
      },
    ],
    bearishItems: [
      {
        title: '美日韩同步暴跌 5%+',
        detail: '纳指 -5.08% / 费半 -6.42% / 日经 -5.06% / 韩国 -5.21%',
      },
      {
        title: '流动性挤兑与黄金踩踏',
        detail: 'Anthropic 抽血叠加现货黄金暴跌 -4.85%（原油逆势 +3.40%）',
      },
      {
        title: '昨日 68 跌停与雷区预警',
        detail: '1.31 万亿缩量余震；警惕京蓝未量产、盛剑 4.41% 营收澄清',
      },
    ],
    outlookBadge: '11.20 大盘走势判断',
    outlookHeadline: '低开释放恐慌 · 先抑后探看承接',
    outlookDetail:
      'A50(-1.92%) 韧性强于美日韩，早盘低开后前 30 分钟量能定强弱；轻指数重结构，守住本金不追伪题材！',
    footerText: '公开盘前信息梳理 · 仅供早盘参考，不构成投资建议',
  },
};
