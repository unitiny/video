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
  /** 5-day Daily OHLC K-lines */
  dailyCandles: DailyCandle[];
  /** 48-point normalized intraday percentage curve (%) */
  points: number[];
  /** 48-bar P95-normalized intraday volume profile (0..1) */
  volumes: number[];
}

export interface MarketCommodityWatchItem {
  id: string;
  name: string;
  code: string;
  priceText: string;
  changePct: number;
  note: string;
}

export interface DanmakuItem {
  text: string;
  color: string;
  y: number;
  fontSize: number;
  speed: number;
  offset: number;
  delay: number;
}

export interface HookForbiddenZone {
  label: string;
  yMin: number;
  yMax: number;
}

export interface HookDanmakuSlot {
  y: number;
  fontSize: number;
  defaultColor: string;
  offset: number;
  speed: number;
}

export interface HookVideoSampleConfig {
  sampleCount: number;
  minSec: number;
  maxSec: number;
  outW: number;
  outH: number;
  cropCenterRatio: number;
}

export interface HookLibraryEntry {
  id: string;
  label: string;
  description: string;
  moods: string[];
  videoSrc: string;
  posterSrc: string;
  sample: HookVideoSampleConfig;
  forbiddenZones: HookForbiddenZone[];
  danmakuSlots: HookDanmakuSlot[];
}

export interface HookLibraryManifest {
  version: number;
  defaultHookId: string;
  hooks: HookLibraryEntry[];
}

export interface HookPopWordmark {
  badgeText: string;
  /** Left crisp white part, e.g. "今天" */
  leftText: string;
  /** Center red-stamp emphasis char, e.g. "很" */
  stampText: string;
  /** Right oversized gold hero word, e.g. "关键" */
  heroText: string;
  /** Trailing punctuation, e.g. "!!" */
  exclaimText?: string;
}

export interface HookSceneData {
  hookId?: string;
  videoSrc: string;
  posterSrc: string;
  sample: HookVideoSampleConfig;
  memeTitle: string;
  wordmark: HookPopWordmark;
  danmakuItems: DanmakuItem[];
  forbiddenZones?: HookForbiddenZone[];
}

export interface MarketBoardTiming {
  usStart: number;
  usHeadlineFrame: number;
  usTypeStart: number;
  usTypeEnd: number;
  /** Must leave >= 30 frames (1.0s) reading pause after usTypeEnd */
  asiaStart: number;
  asiaTypeStart: number;
  asiaTypeEnd: number;
  commodityStart: number;
  commodityTypeStart: number;
  commodityTypeEnd: number;
  a50Start: number;
  a50NoteStart: number;
  a50NoteEnd: number;
}

export interface MarketBoardSceneData {
  headerTag?: string;
  sectionLabel: string;
  usHeadline: string;
  usReason: string;
  usIndices: [CleanIndexChartItem, CleanIndexChartItem];
  asiaHeadline: string;
  asiaReason: string;
  asiaIndices: [CleanIndexChartItem, CleanIndexChartItem];
  commodityHeadline: string;
  commodityReason: string;
  /** Threshold (%) for filtering out flat commodities; defaults to 2.5 */
  anomalyThresholdPct?: number;
  commodityWatchlist: MarketCommodityWatchItem[];
  commodityCharts: Record<string, CleanIndexChartItem>;
  a50Hero: CleanIndexChartItem & {
    intradayShapeNote: string;
  };
  timing?: Partial<MarketBoardTiming>;
}

export interface EventFlowItem {
  from: string;
  pct: string;
}

export interface EventFlowFunnelData {
  headerTag?: string;
  kicker: string;
  bigHeadline: string;
  subTag: string;
  imageSrc?: string;
  imageCrop?: { x: number; y: number; w: number; h: number };
  flows: EventFlowItem[];
  funnelLabel: string;
  bigStatText: string;
  bigStatColor?: string;
  ashareContext: string;
  highlightLine1: string;
  highlightLine2: string;
  bottomCaption: string;
  actionRule?: string;
}

export interface EventDualSpotlightData {
  headerTag?: string;
  kicker: string;
  headline: string;
  imageSrc?: string;
  switchFrame?: number;
  stampFrame?: number;
  leftFocus: {
    bigNumber: string;
    title: string;
    bullets: string[];
  };
  rightFocus: {
    target: string;
    warning: string;
    stamp: string;
  };
  footerLine1: string;
  footerLine2: string;
  objectiveTakeaway?: string;
}

export interface TimelineMilestone {
  num: string;
  desc: string;
  highlight?: boolean;
}

export interface EventTimelineData {
  headerTag?: string;
  kicker: string;
  headline: string;
  imageSrc?: string;
  milestones: TimelineMilestone[];
  bannerHeadline: string;
  bannerSubline: string;
  tacticalWord?: string;
}

export interface VerdictScenarioData {
  headerTag?: string;
  title: string;
  bullsHeading?: string;
  bearsHeading?: string;
  bulls: string[];
  bears: string[];
  scenarioHeading: string;
  openingLabel: string;
  pivotLabel: string;
  steadyBranchLabel: string;
  weakBranchLabel: string;
  scenarioTimeLabels: string[];
  scenarioBase: [number, number];
  scenarioSteady: number[];
  scenarioWeak: number[];
  verdictHeadline: string;
  verdictAction: string;
  disclaimer?: string;
}

export type EpisodeSceneKind =
  | 'hook_live_video'
  | 'market_chrono_board'
  | 'event_flow_funnel'
  | 'event_dual_spotlight'
  | 'event_timeline'
  | 'verdict_scenario';

export interface EpisodeSceneBase {
  id: string;
  kind: EpisodeSceneKind;
  durationFrames: number;
  title: string;
  subtitle: string;
  editorialCraft: string;
  focusGoal: string;
}

export type EpisodeScene =
  | (EpisodeSceneBase & { kind: 'hook_live_video'; data: HookSceneData })
  | (EpisodeSceneBase & { kind: 'market_chrono_board'; data: MarketBoardSceneData })
  | (EpisodeSceneBase & { kind: 'event_flow_funnel'; data: EventFlowFunnelData })
  | (EpisodeSceneBase & { kind: 'event_dual_spotlight'; data: EventDualSpotlightData })
  | (EpisodeSceneBase & { kind: 'event_timeline'; data: EventTimelineData })
  | (EpisodeSceneBase & { kind: 'verdict_scenario'; data: VerdictScenarioData });

export interface EpisodeSpec {
  width: number;
  height: number;
  fps: number;
  bpm: number;
}

export interface EpisodeManifest {
  schemaVersion: number;
  id: string;
  date: string;
  title: string;
  seriesTitle: string;
  description: string;
  spec: EpisodeSpec;
  scenes: EpisodeScene[];
  metadata?: {
    sourceSummary?: string;
    createdAt?: string;
    verifiedAt?: string;
    dataSources?: string[];
  };
}

export interface EpisodeListItem {
  id: string;
  date: string;
  title: string;
  seriesTitle: string;
  description: string;
  totalFrames: number;
  durationSec: number;
  fps: number;
  bpm: number;
  width: number;
  height: number;
  shotCount: number;
  hookId?: string;
  posterSrc?: string;
}

export interface LoadedEpisodeAssets {
  imagesBySrc: Record<string, HTMLImageElement | null>;
  videoFramesBySrc: Record<string, HTMLCanvasElement[]>;
  videosBySrc: Record<string, HTMLVideoElement | null>;
}
