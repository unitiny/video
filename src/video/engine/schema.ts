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
  /** Optional intraday extreme callout pin drawn on the 분시/分时 chart (e.g. "盘中低 -4.33%") */
  extremeLowTag?: string;
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

export interface HookMemeCard {
  imageSrc: string;
  topCaption: string;
  bottomCaption: string;
  enterFrame: number;
}

export interface HookReversalConfig {
  cutFrame: number;
  act1TimeBadge: string;
  act1MetricBadge: string;
  act1Headline: string;
  act1Subline: string;
  act2TimeBadge: string;
  act2MetricBadge: string;
  act2Headline: string;
  act2Subline: string;
  /** Real normalized intraday percentage curve for the live deep-V kinetic graph */
  deepVCurve: number[];
}

export interface HookSceneData {
  hookId?: string;
  hookStyle?: 'classic' | 'v4_reversal_cut';
  videoSrc: string;
  posterSrc: string;
  sample: HookVideoSampleConfig;
  memeTitle: string;
  wordmark: HookPopWordmark;
  danmakuItems: DanmakuItem[];
  forbiddenZones?: HookForbiddenZone[];
  /** Enables 4-side Douyin safe-zone framing bezel */
  safeInset?: boolean;
  /** Optional top live ticker strip inside safe area */
  tickerStrip?: string;
  /** Optional real-photo meme sticker card popping in on Beat 2 */
  memeCard?: HookMemeCard;
  /** Optional 2-act emotional reversal overlay config used when hookStyle === 'v4_reversal_cut' */
  reversalConfig?: HookReversalConfig;
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
  theme?: 'dark' | 'light';
  centeredHeroTitle?: string;
  minimalHeader?: boolean;
  /** Enables 4-side Douyin safe-zone margins (left/right/top/bottom breathing space) */
  safeInset?: boolean;
  /** Enables refined obsidian glass card craft + sequential spotlight visual guidance */
  polished?: boolean;
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

export type PosterThemeFx = 'inflation_alert' | 'cyber_compute' | 'aerospace_launch';

export type PosterPresentationStyle =
  | 'spotlight_popout'
  | 'camera_crash_tour'
  | 'split_prism_compare'
  | 'parallax_orbital_flight'
  | 'v4_slice_inflation'
  | 'v4_slice_compute'
  | 'v4_slice_aerospace';

export interface PosterHudCounter {
  label: string;
  startValue: number;
  endValue: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
}

export interface PosterSpotlightBeat {
  id: string;
  enterFrame: number;
  exitFrame: number;
  crop: { x: number; y: number; w: number; h: number };
  badge: string;
  calloutTitle: string;
  calloutDetail?: string;
  accentColor: string;
  stampText?: string;
  counter?: PosterHudCounter;
  gaugePct?: number;
  chips?: Array<{ label: string; value: string; color?: string }>;
  hudPosition?: 'top' | 'bottom';
  sfx?: 'pop' | 'snap' | 'stamp';
}

export interface AnimatedPosterStageData {
  theme?: 'dark' | 'light';
  presentationStyle?: PosterPresentationStyle;
  safeInset?: boolean;
  headerTag?: string;
  kicker: string;
  headline: string;
  imageSrc: string;
  themeFx: PosterThemeFx;
  accentColor: string;
  revealHoldStartFrame?: number;
  beats: PosterSpotlightBeat[];
  bottomTicker: string;
  disclaimer?: string;
}

export interface V3HookMetric {
  label: string;
  value: string;
  sublabel?: string;
  /** Strictly enforced color semantics: up=red, down=green, gold=highlight, cyan=neutral, warn=orange */
  tone: 'up' | 'down' | 'gold' | 'cyan' | 'warn';
}

export interface V3ConflictHookData {
  seriesBadge: string;
  dateLabel: string;
  headlineLine1: string;
  headlineLine2: string;
  accentWord?: string;
  moodLabel: string;
  /** Real intraday curve (e.g. NASDAQ deep-V) rendered as kinetic glowing backdrop */
  backdropCurve: number[];
  backdropLowLabel?: string;
  backdropCloseLabel?: string;
  metrics: [V3HookMetric, V3HookMetric, V3HookMetric];
}

export interface V3MarketPulseData {
  headerTag: string;
  usHeadline: string;
  usReason: string;
  usIndices: [CleanIndexChartItem, CleanIndexChartItem];
  /** Optional intraday extreme callout badges inside US cards (e.g. "盘中低 -4.33%") */
  usExtremeBadges?: [string?, string?];
  asiaHeadline: string;
  asiaReason: string;
  asiaIndices: [CleanIndexChartItem, CleanIndexChartItem];
  commodityCollapsedLabel: string;
  commodityWatchlist: MarketCommodityWatchItem[];
  anomalyThresholdPct?: number;
}

export interface V3WindvaneItem {
  name: string;
  code: string;
  valueText: string;
  changePct?: number;
  statusNote: string;
  tone: 'up' | 'down' | 'gold' | 'cyan' | 'warn';
}

export interface V3AShareAnchorData {
  headerTag: string;
  a50Hero: CleanIndexChartItem & {
    intradayShapeNote: string;
    rangeBadge: string;
  };
  windvanesHeading: string;
  windvanes: [V3WindvaneItem, V3WindvaneItem, V3WindvaneItem];
  yesterdayHeading: string;
  yesterdayStats: Array<{
    label: string;
    value: string;
    tone: 'up' | 'down' | 'gold' | 'cyan' | 'warn';
  }>;
  clockHeading: string;
  clockNodes: Array<{
    time: string;
    label: string;
  }>;
}

export type V3EditorialVariant = 'macro_gauge' | 'vs_split_cards' | 'catalyst_chain';

export interface V3EditorialStoryData {
  variant: V3EditorialVariant;
  headerTag: string;
  kicker: string;
  headline: string;
  subheadline: string;
  /** Text-free editorial background illustration */
  imageSrc: string;
  accentTone: 'gold' | 'cyan' | 'warn' | 'up';
  /** Variant: macro_gauge */
  macroMeter?: {
    label: string;
    startValue: number;
    endValue: number;
    expectationValue: number;
    unit: string;
    expectationLabel: string;
    statusTitle: string;
    statusDetail: string;
    gaugeLabel: string;
    gaugePct: number;
    gaugeSubtitle: string;
    affectedTickers: Array<{ label: string; value: string; tone: 'up' | 'down' }>;
  };
  /** Variant: vs_split_cards */
  vsSplit?: {
    dropTitle: string;
    dropStartLabel: string;
    dropEndLabel: string;
    dropPct: number;
    dropDetail: string;
    leftCard: {
      badge: string;
      title: string;
      metric: string;
      detail: string;
      tone: 'warn' | 'down';
    };
    rightCard: {
      badge: string;
      title: string;
      metric: string;
      detail: string;
      tone: 'gold' | 'up' | 'cyan';
    };
    stampText: string;
  };
  /** Variant: catalyst_chain */
  catalystChain?: {
    events: Array<{
      indexLabel: string;
      timeTag: string;
      title: string;
      detail: string;
      highlightMetric?: { label: string; startValue: number; endValue: number; suffix: string };
      tone: 'gold' | 'cyan' | 'up';
    }>;
    chainLabel: string;
    chainNodes: Array<{ idx: string; name: string; tone: 'gold' | 'cyan' | 'up' | 'warn' }>;
    cautionBanner: string;
  };
  bottomTakeaway: string;
  disclaimer?: string;
}

export interface V3ActionCheatsheetData {
  headerTag: string;
  scenarioTitle: string;
  openingLabel: string;
  pivotLabel: string;
  steadyBranchLabel: string;
  weakBranchLabel: string;
  scenarioTimeLabels: string[];
  scenarioBase: [number, number];
  scenarioSteady: number[];
  scenarioWeak: number[];
  cheatsheetTitle: string;
  saveCue: string;
  checklist: Array<{
    num: string;
    tag: string;
    text: string;
    tone: 'gold' | 'up' | 'warn' | 'cyan';
  }>;
  closingLine: string;
  disclaimer?: string;
}

export type EpisodeAudioMood =
  | 'tense_pulse'
  | 'editorial_lofi'
  | 'catalyst_drive'
  | 'cinema_impact';

export interface EpisodeAudioConfig {
  mood?: EpisodeAudioMood;
  audioLogo?: boolean;
  voiceoverSrc?: string;
  duckingDb?: number;
}

export type EpisodeSceneKind =
  | 'hook_live_video'
  | 'market_chrono_board'
  | 'event_flow_funnel'
  | 'event_dual_spotlight'
  | 'event_timeline'
  | 'verdict_scenario'
  | 'animated_poster_stage'
  | 'v3_conflict_hook'
  | 'v3_market_pulse'
  | 'v3_ashare_anchor'
  | 'v3_editorial_story'
  | 'v3_action_cheatsheet';

export interface EpisodeSceneBase {
  id: string;
  kind: EpisodeSceneKind;
  durationFrames: number;
  title: string;
  subtitle: string;
  editorialCraft: string;
  focusGoal: string;
  /** Optional concise Chinese anchor narration script for TTS voiceover */
  narration?: string;
}

export type EpisodeScene =
  | (EpisodeSceneBase & { kind: 'hook_live_video'; data: HookSceneData })
  | (EpisodeSceneBase & { kind: 'market_chrono_board'; data: MarketBoardSceneData })
  | (EpisodeSceneBase & { kind: 'event_flow_funnel'; data: EventFlowFunnelData })
  | (EpisodeSceneBase & { kind: 'event_dual_spotlight'; data: EventDualSpotlightData })
  | (EpisodeSceneBase & { kind: 'event_timeline'; data: EventTimelineData })
  | (EpisodeSceneBase & { kind: 'verdict_scenario'; data: VerdictScenarioData })
  | (EpisodeSceneBase & { kind: 'animated_poster_stage'; data: AnimatedPosterStageData })
  | (EpisodeSceneBase & { kind: 'v3_conflict_hook'; data: V3ConflictHookData })
  | (EpisodeSceneBase & { kind: 'v3_market_pulse'; data: V3MarketPulseData })
  | (EpisodeSceneBase & { kind: 'v3_ashare_anchor'; data: V3AShareAnchorData })
  | (EpisodeSceneBase & { kind: 'v3_editorial_story'; data: V3EditorialStoryData })
  | (EpisodeSceneBase & { kind: 'v3_action_cheatsheet'; data: V3ActionCheatsheetData });

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
  audio?: EpisodeAudioConfig;
  metadata?: {
    sourceSummary?: string;
    createdAt?: string;
    verifiedAt?: string;
    dataSources?: string[];
    allowNoHook?: boolean;
    theme?: 'dark' | 'light';
    versionTag?: string;
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
  hasNarration?: boolean;
  hasVoiceover?: boolean;
  versionTag?: string;
}

export interface LoadedEpisodeAssets {
  imagesBySrc: Record<string, HTMLImageElement | null>;
  videoFramesBySrc: Record<string, HTMLCanvasElement[]>;
  videosBySrc: Record<string, HTMLVideoElement | null>;
}
