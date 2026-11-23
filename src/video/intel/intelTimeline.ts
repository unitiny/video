import { INTEL_VIDEO_SPEC } from './intelData';

export type IntelSceneKind =
  | 'meme_hook'
  | 'global_markets'
  | 'event_tabloid'
  | 'event_blueprint'
  | 'event_portrait'
  | 'summary_verdict';

export interface IntelShotSpec {
  id: string;
  index: number;
  startFrame: number;
  endFrame: number;
  startSec: number;
  endSec: number;
  kind: IntelSceneKind;
  title: string;
  subtitle: string;
  creativeHook: string;
  traderValue: string;
}

export const INTEL_CUT_FRAMES = [100, 260, 410, 560, 720] as const;

export const INTEL_SHOTS: IntelShotSpec[] = [
  {
    id: 'intel-01-meme',
    index: 1,
    startFrame: 0,
    endFrame: 99,
    startSec: 0.0,
    endSec: 3.33,
    kind: 'meme_hook',
    title: '开屏爆梗：真人反应定格「今天很关键!!」',
    subtitle: '绿屏瞳孔地震 × 综艺爆字定格 × 反差花字引出全球异动',
    creativeHook: '手持微抖 + 0.6s 瞬间定格放大闪白 + 漫画放射速度线 + 花字弹跳上推转场',
    traderValue: '复刻短视频最火“今天很关键”真人动作鬼畜定格梗，前三秒拉满完播钩子',
  },
  {
    id: 'intel-02-markets',
    index: 2,
    startFrame: 100,
    endFrame: 259,
    startSec: 3.33,
    endSec: 8.67,
    kind: 'global_markets',
    title: '核心开篇：美日韩 + A50 + 异动大宗实盘榜',
    subtitle: '纳指-5.08% / 费半-6.42% × 08:00日韩-5% × A50(-1.92%) × 金跌油涨',
    creativeHook: '深邃实时行情看板 + 涨跌幅数字滚轮翻牌 + 柱状进度条竞速 + 仅异动品种脉冲提示',
    traderValue: '优先交待隔夜美股与今晨 8 点亚太开盘全貌，标明 A50 抗跌点位，自动剔除无异动杂音',
  },
  {
    id: 'intel-03-tabloid',
    index: 3,
    startFrame: 260,
    endFrame: 409,
    startSec: 8.67,
    endSec: 13.67,
    kind: 'event_tabloid',
    title: '事件一·头版报纸风：Anthropic 上市吸金风暴',
    subtitle: '华尔街流动性虹吸版画 × 昨日 A 股 68 跌停余震预警',
    creativeHook: '暖色新闻纸斜切飞入摆正 + 红笔荧光划线动画 + 头版双栏拆解',
    traderValue: '换用怀旧金融头版视觉，一图看懂“抽血源头”与“早盘前 30 分钟看承接”策略',
  },
  {
    id: 'intel-04-blueprint',
    index: 4,
    startFrame: 410,
    endFrame: 559,
    startSec: 13.67,
    endSec: 18.67,
    kind: 'event_blueprint',
    title: '事件二·工程蓝图风：PCB 缺货至 2028 × 排雷京蓝',
    subtitle: '真紧缺(Rubin进驻Azure) vs 假题材(京蓝2T2B未量产)',
    creativeHook: '深蓝工业蓝图分屏拉幕 + 斜向探照灯扫描 + 「尚未量产」重磅印章物理砸落抖屏',
    traderValue: '左右对比一眼分清真实产业订单（3连板前排）与未量产画饼地雷',
  },
  {
    id: 'intel-05-portrait',
    index: 5,
    startFrame: 560,
    endFrame: 719,
    startSec: 18.67,
    endSec: 24.0,
    kind: 'event_portrait',
    title: '事件三·人物肖像风：马斯克洗碗机器人 × 小鹏 IRON',
    subtitle: '幽默厨房肖像画 × 漫画对话气泡弹跳 × 三节点催化时间轴',
    creativeHook: '暖阳生活感人物肖像视差滑入 + 弹性过冲对话气泡 + 进度节点条横向推进',
    traderValue: '告别沉闷文字页，用生动人物漫画+时间轴讲清 1–2 月 Optimus 与 11.25 小鹏接力',
  },
  {
    id: 'intel-06-summary',
    index: 6,
    startFrame: 720,
    endFrame: 899,
    startSec: 24.0,
    endSec: 30.0,
    kind: 'summary_verdict',
    title: '终极汇总：红黑利好利空 × 11.20 大盘走势判断',
    subtitle: '3 利好 vs 3 风险对撞滑入 × 「先抑后探 · 分化筑底」总定调',
    creativeHook: '左右双色榜滑入 + 底部策略仪表指针摆动落定 + 醒目实操行动纲领',
    traderValue: '把所有外围暴跌与内部真逻辑归类打包，给出清晰的早盘应对定调，适合截屏留存',
  },
];

export function getIntelShotAtFrame(frame: number): IntelShotSpec {
  const f = Math.max(0, Math.min(INTEL_VIDEO_SPEC.totalFrames - 1, Math.floor(frame)));
  for (const s of INTEL_SHOTS) {
    if (f >= s.startFrame && f <= s.endFrame) return s;
  }
  return INTEL_SHOTS[INTEL_SHOTS.length - 1];
}
