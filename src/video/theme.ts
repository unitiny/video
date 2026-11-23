export const VIDEO_SPEC = {
  width: 1080,
  height: 2352,
  fps: 30,
  totalFrames: 668,
  durationSec: 668 / 30, // 22.267s
  bpm: 129.2,
  breathPauseStartSec: 2.0,
  breathPauseEndSec: 3.0,
} as const;

export const CHART_THEME = {
  bg: '#ffffff',
  titleLeft: 29,
  titleTop: 248,
  titleSubSize: 40,
  titleSubColor: '#3f3f3f',
  titleMainSize: 62,
  titleMainColor: '#1a1a1a',

  clockRight: 1048,
  clockSize: 62,
  clockColor: '#a9b0c3',

  barX1: 29,
  barX2: 1068,
  barY1: 333,
  barY2: 352, // height = 19px

  breadthFontSize: 34,
  red: '#c8342a',
  gray: '#4a4a4a',
  green: '#2e8b64',

  unitX: 29,
  unitY: 424,
  unitSize: 26,
  unitColor: '#9aa0a6',

  plotTop: 460,
  plotBottom: 2071,
  zeroY: 1043,
  pxPerBillion: 15.975,

  xStart: 109.5,
  xEnd: 701,
  // 240 trading minutes -> (701 - 109.5) / 240 * 60 = 147.875 px per 60 min
  pxPer60Min: 147.875,

  curveWidth: 4.2,
  dotRadius: 4.6,
  labelOffsetX: 26,
  labelFontSize: 38,
  labelMinGap: 38,

  footerText: '公开数据整理，不作为投资依据；投资有风险，理财需谨慎。',
  footerSize: 26,
  footerColor: '#b9bdc4',
  footerY: 2248,

  heroYellow: '#ffd43b',
  heroYellowGlow: '#ffb703',
  cardBg: '#ffffff',
  cardBorder: '#e5e7eb',
} as const;

export const ART_ASSETS = {
  openArcher: '/src/assets/images/art_open_archer_1795161937695.jpg',
  noonSlap: '/src/assets/images/art_noon_slap_1795161938095.jpg',
  twoSheep: '/src/assets/images/art_two_sheep_1795161937879.jpg',
  lithographyHero: '/src/assets/images/art_lithography_hero_1795161938393.jpg',
  morningBrief: '/src/assets/images/art_morning_brief_gta_ai_1795161937494.jpg',
} as const;

export const INTEL_ASSETS = {
  memeKeyDay: '/src/assets/images/meme_trader_keyday_1795244619886.jpg',
  eventAnthropic: '/src/assets/images/event_anthropic_vortex_1795244619085.jpg',
  eventPcb: '/src/assets/images/event_pcb_blueprint_1795244619808.jpg',
  eventRobot: '/src/assets/images/event_musk_dishwasher_1795244620230.jpg',
} as const;

export const INTEL_V2_ASSETS = {
  realKeyDayVideo: '/src/assets/videos/real_keyday_shock_4508.mp4',
  realKeyDayPoster: '/src/assets/images/real_keyday_4508_poster.jpg',
  realNyseClap: '/src/assets/images/real_nyse_0047.jpg',
  realTraderGesturing: '/src/assets/images/real_peter_cube.jpg',
  realTraderShocked: '/src/assets/images/real_peter_tuchman.jpg',
  eventMuskRealKitchen: '/src/assets/images/event_musk_real_kitchen_1795248294473.jpg',
} as const;
