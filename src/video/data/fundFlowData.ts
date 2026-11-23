export type TemplateId = '1117_close' | 'morning_brief';

export interface SectorCurve {
  id: string;
  name: string;
  color: string;
  endValue: number; // in 亿 (or % for morning brief mapping)
  values: number[]; // length 242 (minute 0..241)
}

export interface StockSticker {
  name: string;
  code: string;
  changePct: string;
  tag: string;
  positive: boolean;
}

export interface AttributionRow {
  sector: string;
  limitCount: string;
  leaders: string;
  reason: string;
  sentiment: 'up' | 'down' | 'mixed';
}

export interface EtfSurgeItem {
  name: string;
  code: string;
  window: string;
  volumeBoost: string;
  flow: string;
}

export interface VideoProjectData {
  id: TemplateId;
  name: string;
  subHeader: string;
  mainHeader: string;
  unitLabel: string;
  openBadges: [string, string, string, string];
  art1Headline: string;
  art1Subline: string;
  art2Headline: string;
  art2Subline: string;
  art3Headline: string;
  art3Subline: string;
  etfBannerTitle: string;
  etfBannerHighlight: string;
  attributionTitle: string;
  attributionSubtitle: string;
  breadth: {
    up: number;
    flat: number;
    down: number;
  };
  curves: SectorCurve[];
  stickers: StockSticker[];
  etfItems: EtfSurgeItem[];
  attributionRows: AttributionRow[];
}

// Deterministic pseudo-random generator so every frame/run is 100% reproducible
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function generateSmoothCurve(
  seed: number,
  noonPeak: number,
  dip1330: number,
  endValue: number,
  volatility: number
): number[] {
  const rand = mulberry32(seed);
  const pts: number[] = new Array(242);
  let noise = 0;

  for (let m = 0; m < 242; m++) {
    const t = m / 241;
    let base: number;
    if (m <= 120) {
      // Morning 09:30 -> 11:30 ("午盘拉满" push)
      const u = m / 120;
      base = noonPeak * Math.sin((u * Math.PI) / 2);
    } else if (m <= 160) {
      // 13:00 -> 13:40 sharp divergence ("午后打脸")
      const u = (m - 120) / 40;
      base = noonPeak + (dip1330 - noonPeak) * (1 - Math.cos(u * Math.PI)) * 0.5;
    } else {
      // 13:40 -> 15:00 closing trajectory
      const u = (m - 160) / 81;
      base = dip1330 + (endValue - dip1330) * Math.pow(u, 0.85);
    }

    noise = noise * 0.72 + (rand() - 0.5) * volatility;
    // Fade noise at start (0) and end (240..241) so endpoints match exact label readings
    const edgeWeight = Math.min(1, m / 10) * Math.min(1, (241 - m) / 14);
    const val = base + noise * edgeWeight;
    pts[m] = Number(val.toFixed(2));
  }
  pts[0] = 0;
  pts[240] = endValue;
  pts[241] = endValue;
  return pts;
}

const SECTOR_SPECS_1117: Array<{
  id: string;
  name: string;
  color: string;
  noonPeak: number;
  dip1330: number;
  endValue: number;
  vol: number;
}> = [
  { id: 'chip', name: '芯片', color: '#D62828', noonPeak: 22.4, dip1330: 15.8, endValue: 27.3, vol: 2.4 },
  { id: 'lithography', name: '光刻机', color: '#E03E36', noonPeak: 19.6, dip1330: 14.2, endValue: 22.8, vol: 2.1 },
  { id: 'semiequip', name: '半导体设备', color: '#C8342A', noonPeak: 18.2, dip1330: 11.5, endValue: 18.4, vol: 1.9 },
  { id: 'hisilicon', name: '华为海思', color: '#EA580C', noonPeak: 16.5, dip1330: 9.4, endValue: 13.9, vol: 2.2 },
  { id: 'memory', name: '存储芯片', color: '#D97706', noonPeak: 14.1, dip1330: 7.8, endValue: 10.6, vol: 1.7 },
  { id: 'bank', name: '银行', color: '#B45309', noonPeak: 4.5, dip1330: 5.9, endValue: 8.2, vol: 0.9 },
  { id: 'coal', name: '煤炭', color: '#7C3AED', noonPeak: 3.8, dip1330: 4.4, endValue: 6.1, vol: 1.0 },
  { id: 'quantum', name: '量子科技', color: '#9333EA', noonPeak: 11.2, dip1330: 2.1, endValue: 3.4, vol: 1.8 },
  { id: 'cpo', name: 'CPO概念', color: '#C026D3', noonPeak: 15.8, dip1330: -1.4, endValue: 0.8, vol: 2.6 },
  { id: 'military', name: '国防军工', color: '#64748B', noonPeak: 8.9, dip1330: -3.5, endValue: -2.6, vol: 1.6 },
  { id: 'oil', name: '石油石化', color: '#475569', noonPeak: 2.2, dip1330: -2.8, endValue: -4.9, vol: 1.1 },
  { id: 'pharma', name: '医药商业', color: '#0284C7', noonPeak: 6.4, dip1330: -5.2, endValue: -7.8, vol: 1.5 },
  { id: 'broker', name: '证券', color: '#2563EB', noonPeak: 14.5, dip1330: -6.5, endValue: -10.4, vol: 2.3 },
  { id: 'liquor', name: '白酒', color: '#0891B2', noonPeak: 1.9, dip1330: -8.9, endValue: -12.7, vol: 1.4 },
  { id: 'pv', name: '光伏设备', color: '#0D9488', noonPeak: 9.2, dip1330: -11.4, endValue: -15.6, vol: 1.9 },
  { id: 'realestate', name: '房地产', color: '#059669', noonPeak: 7.4, dip1330: -14.2, endValue: -18.3, vol: 1.7 },
  { id: 'metals', name: '有色金属', color: '#10B981', noonPeak: 5.3, dip1330: -16.8, endValue: -21.5, vol: 1.8 },
  { id: 'ev', name: '新能源车', color: '#16A34A', noonPeak: 10.6, dip1330: -19.2, endValue: -24.1, vol: 2.0 },
  { id: 'battery', name: '锂电池', color: '#15803D', noonPeak: 11.4, dip1330: -21.6, endValue: -27.4, vol: 2.1 },
  { id: 'lowalt', name: '低空经济', color: '#2E8B64', noonPeak: 13.7, dip1330: -23.5, endValue: -30.8, vol: 2.5 },
  { id: 'media', name: '文化传媒', color: '#047857', noonPeak: 12.1, dip1330: -26.4, endValue: -33.9, vol: 2.2 },
  { id: 'gaming', name: '游戏', color: '#065F46', noonPeak: 10.8, dip1330: -28.9, endValue: -36.5, vol: 2.1 },
  { id: 'data', name: '数据要素', color: '#1D4ED8', noonPeak: 13.2, dip1330: -31.8, endValue: -39.4, vol: 2.3 },
  { id: 'autoparts', name: '汽车零部件', color: '#0F766E', noonPeak: 8.6, dip1330: -34.2, endValue: -43.1, vol: 2.0 },
  { id: 'software', name: '软件开发', color: '#1E40AF', noonPeak: 14.9, dip1330: -38.7, endValue: -47.6, vol: 2.4 },
  { id: 'consumerelec', name: '消费电子', color: '#334155', noonPeak: 16.2, dip1330: -41.5, endValue: -51.8, vol: 2.6 },
  { id: 'ai', name: '人工智能', color: '#166534', noonPeak: 18.4, dip1330: -45.2, endValue: -56.9, vol: 2.8 },
  { id: 'robot', name: '机器人概念', color: '#14532D', noonPeak: 17.5, dip1330: -49.8, endValue: -63.2, vol: 3.0 },
];

export const DATA_1117_CLOSE: VideoProjectData = {
  id: '1117_close',
  name: '1117收盘｜收盘资金流向',
  subHeader: '11月17日收盘',
  mainHeader: '主力资金流向',
  unitLabel: '单位：亿',
  openBadges: ['11.17', '天天看主力', '收盘资金流向', '大A'],
  art1Headline: '午盘拉满 午后打脸',
  art1Subline: '14只人气核心标的分时剧震',
  art2Headline: '热门股票全线跌停',
  art2Subline: '只有两只羊撑住了！',
  art3Headline: '午后翻绿',
  art3Subline: '光刻机撑住！',
  etfBannerTitle: 'ETF 今日放量时段',
  etfBannerHighlight: '13:38–13:45 宽基与半导体ETF同步脉冲放量',
  attributionTitle: '11.17 收盘涨跌停归因',
  attributionSubtitle: '高标分歧与硬科技回流全览 · 数据整理',
  breadth: {
    up: 1428,
    flat: 164,
    down: 3782,
  },
  curves: SECTOR_SPECS_1117.map((s, idx) => ({
    id: s.id,
    name: s.name,
    color: s.color,
    endValue: s.endValue,
    values: generateSmoothCurve(1117 + idx * 97, s.noonPeak, s.dip1330, s.endValue, s.vol),
  })),
  stickers: [
    { name: '中芯国际', code: '688981', changePct: '+4.82%', tag: '光刻机撑住', positive: true },
    { name: '张江高科', code: '600895', changePct: '+6.15%', tag: '芯片回流', positive: true },
    { name: '上海贝岭', code: '600171', changePct: '+3.40%', tag: '逆势翻红', positive: true },
    { name: '双成药业', code: '002693', changePct: '-10.01%', tag: '午后核按钮', positive: false },
    { name: '海能达', code: '002583', changePct: '-9.98%', tag: '高位跳水', positive: false },
    { name: '常山北明', code: '000158', changePct: '-8.45%', tag: '鸿蒙分歧', positive: false },
    { name: '欧菲光', code: '002456', changePct: '-7.62%', tag: '消费电子砸盘', positive: false },
    { name: '拓维信息', code: '002261', changePct: '-9.12%', tag: '算力退潮', positive: false },
    { name: '宗申动力', code: '001696', changePct: '-10.00%', tag: '低空跌停', positive: false },
    { name: '四川长虹', code: '600839', changePct: '-8.91%', tag: '午后打脸', positive: false },
    { name: '赛力斯', code: '601127', changePct: '-5.34%', tag: '高位抛压', positive: false },
    { name: '东方财富', code: '300059', changePct: '-3.85%', tag: '券商回落', positive: false },
    { name: '阳谷华泰', code: '300121', changePct: '+11.40%', tag: '光刻胶活跃', positive: true },
    { name: '茂莱光学', code: '688502', changePct: '+7.28%', tag: '光学组件', positive: true },
  ],
  etfItems: [
    { name: '科创芯片ETF', code: '588200', window: '13:38–13:45', volumeBoost: '放量 2.4x', flow: '+8.6 亿' },
    { name: '半导体ETF', code: '512480', window: '13:39–13:44', volumeBoost: '放量 1.9x', flow: '+6.2 亿' },
    { name: '沪深300ETF', code: '510300', window: '13:40–13:45', volumeBoost: '放量 1.6x', flow: '+12.4 亿' },
  ],
  attributionRows: [
    { sector: '光刻机 / 国产芯片', limitCount: '9家涨停', leaders: '张江高科 · 阳谷华泰 · 茂莱光学', reason: '午后全市场回落之际资金逆势回流自主可控主线', sentiment: 'up' },
    { sector: '银行 / 煤炭高股息', limitCount: '防御飘红', leaders: '成都银行 · 中国神华 · 工商银行', reason: '避险情绪升温，低估值红利资产承接流出资金', sentiment: 'up' },
    { sector: '前期高标抱团', limitCount: '18家跌停', leaders: '双成药业 · 海能达 · 宗申动力', reason: '午盘拉满后筹码松动，尾盘出现流动性踩踏', sentiment: 'down' },
    { sector: '机器人 / 减速器', limitCount: '11家跌停', leaders: '柯力传感 · 兆威机电 · 埃斯顿', reason: '主力净流出超63亿，高位获利盘集中兑现', sentiment: 'down' },
    { sector: '人工智能 / 算力', limitCount: '7家跌停', leaders: '拓维信息 · 常山北明 · 四川长虹', reason: '外围算力映射分歧，短线情绪退潮拖累板块', sentiment: 'down' },
    { sector: '消费电子 / 华为链', limitCount: '6家跌停', leaders: '欧菲光 · 光弘科技 · 银邦股份', reason: '前期涨幅过大，午后跟随大盘放量回吐', sentiment: 'down' },
    { sector: '低空经济 / 飞行汽车', limitCount: '5家跌停', leaders: '宗申动力 · 中信海直 · 万丰奥威', reason: '题材催化进入空窗期，短线资金撤离', sentiment: 'down' },
    { sector: '并购重组概念', limitCount: '分化震荡', leaders: '松发股份 · 光智科技 · 浩欧博', reason: '部分连板标的出现开板分歧，资金高低切换', sentiment: 'mixed' },
  ],
};

// Template 2: Built directly from the user's pasted 盘前早报 (Pre-Market Brief)
const SECTOR_SPECS_MORNING: Array<{
  id: string;
  name: string;
  color: string;
  noonPeak: number;
  dip1330: number;
  endValue: number;
  vol: number;
}> = [
  { id: 'cybersec', name: '网络安全', color: '#D62828', noonPeak: 14.2, dip1330: 19.5, endValue: 26.8, vol: 1.8 },
  { id: 'tencent_ai', name: '国产算力', color: '#E03E36', noonPeak: 16.5, dip1330: 14.0, endValue: 21.4, vol: 2.3 },
  { id: 'semiequip_mb', name: '半导体设备', color: '#C8342A', noonPeak: 11.2, dip1330: 12.8, endValue: 16.9, vol: 1.6 },
  { id: 'gta_game', name: '云游戏/引擎', color: '#EA580C', noonPeak: 13.8, dip1330: 9.6, endValue: 14.2, vol: 2.0 },
  { id: 'hydro', name: '流域水风光', color: '#D97706', noonPeak: 8.4, dip1330: 10.2, endValue: 11.7, vol: 1.3 },
  { id: 'retail', name: '折扣消费', color: '#B45309', noonPeak: 5.5, dip1330: 7.4, endValue: 9.5, vol: 1.2 },
  { id: 'grid', name: '智能电网/EPC', color: '#7C3AED', noonPeak: 6.1, dip1330: 5.8, endValue: 7.2, vol: 1.4 },
  { id: 'dram', name: 'HBM4存储', color: '#9333EA', noonPeak: 7.2, dip1330: 3.1, endValue: 4.5, vol: 1.7 },
  { id: 'aerospace', name: '商业航天', color: '#64748B', noonPeak: 4.8, dip1330: 0.9, endValue: 1.8, vol: 1.5 },
  { id: 'cpo_mb', name: '光模块CPO', color: '#0284C7', noonPeak: 3.5, dip1330: -4.2, endValue: -3.6, vol: 2.1 },
  { id: 'nvda_chain', name: '海外算力链', color: '#0D9488', noonPeak: 2.1, dip1330: -11.8, endValue: -14.5, vol: 1.9 },
  { id: 'copper', name: '有色/铜银', color: '#16A34A', noonPeak: -6.4, dip1330: -19.2, endValue: -23.8, vol: 1.7 },
  { id: 'gold', name: '贵金属/黄金', color: '#15803D', noonPeak: -9.5, dip1330: -24.6, endValue: -29.4, vol: 1.6 },
  { id: 'cro', name: '创新药/CRO', color: '#14532D', noonPeak: -11.2, dip1330: -29.8, endValue: -35.2, vol: 2.0 },
];

export const DATA_MORNING_BRIEF: VideoProjectData = {
  id: 'morning_brief',
  name: '盘前早报｜产业与美股映射',
  subHeader: '11月19日盘前早报',
  mainHeader: '海外映射与资金预期',
  unitLabel: '映射强度',
  openBadges: ['盘前早报', '天天看主力', '产业映射', '全拆解'],
  art1Headline: '腾讯814亿砸算力',
  art1Subline: '老美加息预期再掀波澜',
  art2Headline: 'AI补丁修出大宕机',
  art2Subline: '网络安全夜盘集体暴涨！',
  art3Headline: 'GTA6预售破15亿',
  art3Subline: '水风光一体化同步定调！',
  etfBannerTitle: '隔夜美股核心映射窗口',
  etfBannerHighlight: 'PANW +9.90% · CRWD +7.95% · 黄金跌 -3.23%',
  attributionTitle: '盘前六大事件与人气Mapping',
  attributionSubtitle: '来源：韭研公社APP · 产业事件与美股映照',
  breadth: {
    up: 2680,
    flat: 410,
    down: 1820,
  },
  curves: SECTOR_SPECS_MORNING.map((s, idx) => ({
    id: s.id,
    name: s.name,
    color: s.color,
    endValue: s.endValue,
    values: generateSmoothCurve(2026 + idx * 71, s.noonPeak, s.dip1330, s.endValue, s.vol),
  })),
  stickers: [
    { name: 'PANW 派拓', code: '美股安防', changePct: '+9.90%', tag: '业绩上调', positive: true },
    { name: 'AKAM 阿卡迈', code: 'AI推理云', changePct: '+8.34%', tag: '116亿长约', positive: true },
    { name: 'TJX 折扣零售', code: '消费降级', changePct: '+8.04%', tag: '上调展望', positive: true },
    { name: 'CRWD', code: '网安龙头', changePct: '+7.95%', tag: '大摩转乐观', positive: true },
    { name: 'AMD 超威', code: 'AI芯片', changePct: '+5.31%', tag: '6GW大单', positive: true },
    { name: '腾讯控股', code: 'Q3资本开支', changePct: '+527%', tag: '814亿算力', positive: true },
    { name: 'GTA6 预售', code: '11.19解锁', changePct: '15亿美元', tag: '游戏引擎', positive: true },
    { name: '华胜天成', code: 'A股热榜', changePct: '人气TOP1', tag: '国产算力', positive: true },
    { name: '现货黄金', code: '鹰派压制', changePct: '-3.23%', tag: '创一年新低', positive: false },
    { name: '现货白银', code: '有色承压', changePct: '-4.95%', tag: '沃勒50bp预期', positive: false },
    { name: '爱奇艺 IQ', code: '长视频', changePct: '-16.00%', tag: '退市警告', positive: false },
    { name: '联合健康 UNH', code: '医保审计', changePct: '-10.21%', tag: '道指拖累', positive: false },
    { name: '应用光电 AAOI', code: '光模块', changePct: '-9.80%', tag: '高位回吐', positive: false },
    { name: 'BILI 哔哩', code: '中概承压', changePct: '-4.69%', tag: '情绪回落', positive: false },
  ],
  etfItems: [
    { name: '网络安全板块', code: 'PANW/CRWD', window: '隔夜收涨', volumeBoost: '大摩转积极', flow: '+9.90%' },
    { name: '腾讯资本开支', code: 'Hy4/WorkBuddy', window: 'Q3财报', volumeBoost: '超预估554亿', flow: '814 亿' },
    { name: '费城半导体', code: 'AMAT/ASML', window: '尾盘翻红', volumeBoost: '自主可控映射', flow: '+0.88%' },
  ],
  attributionRows: [
    { sector: '腾讯资本开支暴增', limitCount: '814亿 (+527%)', leaders: '国产算力 · AI供应链 · 华胜天成', reason: '重仓混元Hy4与WorkBuddy推理算力，日活破千万', sentiment: 'up' },
    { sector: 'AI补丁诱发系统宕机', limitCount: 'PANW +9.9%', leaders: 'CrowdStrike +7.95% · Okta +12%', reason: 'AI批量扫洞仓促发补丁致故障，网安估值重估', sentiment: 'up' },
    { sector: 'GTA6全球正式解锁', limitCount: '预售15亿美元', leaders: '云游戏 · 3A游戏引擎 · 物联网', reason: '时隔13年续作拉高3A定价中枢至79.99美元', sentiment: 'up' },
    { sector: '流域水风光一体化', limitCount: '2030/2035节点', leaders: '西南水电 · 光伏风电 · 电网EPC', reason: '能源局明确六个一体化，水电调节打通风光消纳', sentiment: 'up' },
    { sector: '美联储沃勒偏鹰讲话', limitCount: '金-3.23% 铜-4.5%', leaders: '高估值成长 · 贵金属 · 有色板块', reason: '提出12月25bp+1月指引或直接加息50bp震慑通胀', sentiment: 'down' },
    { sector: '光模块与英伟达链', limitCount: 'AAOI -9.8%', leaders: '中际旭创回购20-40亿 · 新易盛8亿', reason: '海外供给预期波动，A股龙头高额回购托底分歧', sentiment: 'mixed' },
    { sector: '存储与先进封装', limitCount: 'DRAM +13~18%', leaders: 'HBM4良率破70% · 微软EMIB封装', reason: '上游HBM与先进封装景气，NAND现货走弱分化', sentiment: 'mixed' },
    { sector: '医疗医药与中概', limitCount: 'UNH -10.2%', leaders: 'IQ -16% · Moderna -4.8% · BILI -4.7%', reason: 'Medicare审计及中概情绪压制，CRO维持偏弱映射', sentiment: 'down' },
  ],
};

export const PROJECT_TEMPLATES: Record<TemplateId, VideoProjectData> = {
  '1117_close': DATA_1117_CLOSE,
  morning_brief: DATA_MORNING_BRIEF,
};
