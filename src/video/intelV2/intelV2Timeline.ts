import { INTEL_V2_SPEC } from './intelV2Data';

export type IntelV2SceneKind =
  | 'v2_keyday_video_intro'
  | 'v2_indices_board'
  | 'v2_liquidity_funnel'
  | 'v2_dual_spotlight'
  | 'v2_robot_countdown'
  | 'v2_forecast_verdict';

export interface IntelV2ShotSpec {
  id: string;
  index: number;
  startFrame: number;
  endFrame: number;
  startSec: number;
  endSec: number;
  kind: IntelV2SceneKind;
  title: string;
  subtitle: string;
  editorialCraft: string;
  focusGoal: string;
}

export const INTEL_V2_CUT_FRAMES = [78, 498, 648, 798, 948] as const;

export const INTEL_V2_SHOTS: IntelV2ShotSpec[] = [
  {
    id: 'v2-01-keyday-video',
    index: 1,
    startFrame: 0,
    endFrame: 77,
    startSec: 0.0,
    endSec: 2.6,
    kind: 'v2_keyday_video_intro',
    title: '2.6秒极速开屏：「今天很关键」波普动效 + 精炼大字弹幕 → 光刃清屏',
    subtitle: '连续抱头震惊实拍 + 5道 52–54px 精炼核心数据弹幕 + 拼贴炸裂「今天很关键」并极速清屏',
    editorialCraft: '零废话极速进场 + 弹幕瞬时齐览快滑 + 立体波普标题扫光 + 光刃闭幕转场',
    focusGoal: '2.6 秒内完成强情绪吸睛、核心行情速览与干净清屏转场，不耗费观众耐心',
  },
  {
    id: 'v2-02-indices-board',
    index: 2,
    startFrame: 78,
    endFrame: 497,
    startSec: 2.6,
    endSec: 16.6,
    kind: 'v2_indices_board',
    title: '按开盘时序拆解全球实盘日 K 与全天真实分时（+1秒停顿版）',
    subtitle: '美股(纳指-5.28%/费半-10.73%)→1秒停顿→亚太(日韩)→黄金天然气→富时A50收尾多停1秒',
    editorialCraft: '实盘验证日K与5m分时曲线 + 逐字消息面归因打字机 + A50 展毕充足停留窗',
    focusGoal: '100% 对齐交易所真实日K与分时走向，客观呈现 A50 早盘急探 -2.30% 后震荡企稳状态',
  },
  {
    id: 'v2-03-funnel',
    index: 3,
    startFrame: 498,
    endFrame: 647,
    startSec: 16.6,
    endSec: 21.6,
    kind: 'v2_liquidity_funnel',
    title: 'Vox 剪纸流向图：Anthropic 百亿抽血漏斗',
    subtitle: '无交叉多路箭头清晰指向漏斗 × 68家跌停余震 × 保守观察窗口提示',
    editorialCraft: '分道不交叉贝塞尔箭头 + 荧光笔重点提示',
    focusGoal: '清晰呈现资金抽血方向，提示盘前先观望前 30 分钟承接、忌盲目抄底',
  },
  {
    id: 'v2-04-spotlight',
    index: 4,
    startFrame: 648,
    endFrame: 797,
    startSec: 21.6,
    endSec: 26.6,
    kind: 'v2_dual_spotlight',
    title: '双焦聚光切分：2028 PCB 紧缺 vs 京蓝未量产',
    subtitle: '先聚焦左侧长周期硬缺口 → 再切右侧未量产审慎标识',
    editorialCraft: 'Focus-and-Dim 局部压暗切分 + 物理审慎印章',
    focusGoal: '客观规律：PCB 紧缺逻辑可跟踪，但在科技承压环境下不宜盲目追高',
  },
  {
    id: 'v2-05-robot',
    index: 5,
    startFrame: 798,
    endFrame: 947,
    startSec: 26.6,
    endSec: 31.6,
    kind: 'v2_robot_countdown',
    title: '真马斯克肖像时间轴：1–2月 / 11.25 / 12–18月',
    subtitle: '真人肖像参照生成厨房同框 × 悬浮时间节点 × 缩量高开一致谨防分歧',
    editorialCraft: '真人肖像参考级视觉 + 去框化悬浮时间条 + 保守节奏提示横幅',
    focusGoal: '理清产业催化先后顺序，强调缩量环境宜偏观察、不宜盲从一致高点',
  },
  {
    id: 'v2-06-verdict',
    index: 6,
    startFrame: 948,
    endFrame: 1187,
    startSec: 31.6,
    endSec: 39.6,
    kind: 'v2_forecast_verdict',
    title: '客观规律总览 × 10:00 分化双情景推演',
    subtitle: '利好与承压客观对照 × 强承接/弱震荡双情景分支（不作主观涨跌断言）',
    editorialCraft: '10:00 量能观察窗双路径分叉图 + 零遮挡标注',
    focusGoal: '客观总结市场多空因素与两种演化情景，守住审慎保守的研判边界',
  },
];

export function getIntelV2ShotAtFrame(frame: number): IntelV2ShotSpec {
  const f = Math.max(0, Math.min(INTEL_V2_SPEC.totalFrames - 1, Math.floor(frame)));
  for (const s of INTEL_V2_SHOTS) {
    if (f >= s.startFrame && f <= s.endFrame) return s;
  }
  return INTEL_V2_SHOTS[INTEL_V2_SHOTS.length - 1];
}
