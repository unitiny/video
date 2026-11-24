/// <reference types="node" />

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import type {
  CleanIndexChartItem,
  DailyCandle,
  MarketCommodityWatchItem,
} from '../src/video/engine/schema.ts';

export interface RolloverAnomalyResult {
  isAnomaly: boolean;
  diffPct: number;
  yahooChangePct: number;
  sinaChangePct: number;
  preferredSource: 'sina' | 'yahoo';
  preferredChangePct: number;
  warning?: string;
}

export interface SinaRealtimeQuote {
  code: string;
  name: string;
  price: number;
  prevSettle: number;
  open: number;
  high: number;
  low: number;
  changePct: number;
  date: string;
  time: string;
}

export interface MarketAuditRecord {
  id: string;
  group: 'us' | 'asia' | 'commodity' | 'a50';
  name: string;
  symbol: string;
  source: string;
  verificationStatus: 'verified' | 'cross_checked' | 'rollover_adjusted' | 'fallback' | 'degraded';
  closePrice: number;
  prevClose: number;
  changePct: number;
  openGapPct: number;
  range5dLow: number;
  range5dHigh: number;
  volumeMode: 'real_p95' | 'volatility_u_fallback';
  sinaCrossCheck?: {
    code: string;
    sinaChangePct: number;
    diffPct: number;
    rolloverTriggered: boolean;
  };
  notes: string[];
}

export interface VerifiedMarketBundle {
  schemaVersion: number;
  date: string;
  fetchedAt: string;
  thresholdPct: number;
  dataSources: string[];
  usIndices: [CleanIndexChartItem, CleanIndexChartItem];
  asiaIndices: [CleanIndexChartItem, CleanIndexChartItem];
  commodityWatchlist: MarketCommodityWatchItem[];
  commodityCharts: Record<string, CleanIndexChartItem>;
  a50Hero: CleanIndexChartItem & { intradayShapeNote: string };
  anomalies: MarketCommodityWatchItem[];
  filteredOut: MarketCommodityWatchItem[];
  auditWarnings: string[];
  auditRecords: MarketAuditRecord[];
}

interface YahooDailyRow {
  dateStr: string;
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface YahooIntradayRow {
  dateStr: string;
  timestamp: number;
  close: number;
  volume: number;
}

interface YahooChartPayload {
  symbol: string;
  exchangeTimezoneName: string;
  regularMarketPrice?: number;
  chartPreviousClose?: number;
  previousClose?: number;
  dailyRows: YahooDailyRow[];
  intradayRows: YahooIntradayRow[];
}

interface InstrumentSpec {
  id: string;
  group: 'us' | 'asia' | 'commodity';
  name: string;
  chartName: string;
  yahooSymbol: string;
  color: string;
  unit?: string;
  priceDecimals?: number;
  sinaCode?: string;
  sinaFutureSymbol?: string;
}

const FETCH_TIMEOUT_MS = 12_000;
const ROLLOVER_DIFF_THRESHOLD_PCT = 2.0;

const DEFAULT_HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  Accept: 'application/json,text/plain,*/*',
};

const SINA_HEADERS: Record<string, string> = {
  ...DEFAULT_HEADERS,
  Referer: 'https://finance.sina.com.cn',
};

const US_SPECS: [InstrumentSpec, InstrumentSpec] = [
  {
    id: 'nasdaq',
    group: 'us',
    name: '纳斯达克 IXIC',
    chartName: '纳斯达克 IXIC',
    yahooSymbol: '^IXIC',
    color: '#38BDF8',
    priceDecimals: 2,
  },
  {
    id: 'sox',
    group: 'us',
    name: '费城半导体 SOX',
    chartName: '费城半导体 SOX',
    yahooSymbol: '^SOX',
    color: '#2DD4BF',
    priceDecimals: 2,
  },
];

const ASIA_SPECS: [InstrumentSpec, InstrumentSpec] = [
  {
    id: 'kospi',
    group: 'asia',
    name: '韩国 KOSPI',
    chartName: '韩国 KOSPI',
    yahooSymbol: '^KS11',
    color: '#34D399',
    priceDecimals: 2,
  },
  {
    id: 'nikkei',
    group: 'asia',
    name: '日经 225',
    chartName: '日经 225',
    yahooSymbol: '^N225',
    color: '#A78BFA',
    priceDecimals: 2,
  },
];

const COMMODITY_SPECS: InstrumentSpec[] = [
  {
    id: 'gold',
    group: 'commodity',
    name: 'COMEX 黄金',
    chartName: 'COMEX 黄金 GOLD',
    yahooSymbol: 'GC=F',
    color: '#34D399',
    unit: '/oz',
    priceDecimals: 1,
    sinaCode: 'hf_GC',
    sinaFutureSymbol: 'GC',
  },
  {
    id: 'nat-gas',
    group: 'commodity',
    name: '纽约天然气 NG',
    chartName: '纽约天然气 NG',
    yahooSymbol: 'NG=F',
    color: '#F87171',
    unit: '/MMBtu',
    priceDecimals: 3,
    sinaCode: 'hf_NG',
    sinaFutureSymbol: 'NG',
  },
  {
    id: 'crude-oil',
    group: 'commodity',
    name: 'WTI 原油',
    chartName: 'WTI 原油 WTI',
    yahooSymbol: 'CL=F',
    color: '#FBBF24',
    unit: '/bbl',
    priceDecimals: 2,
    sinaCode: 'hf_CL',
    sinaFutureSymbol: 'CL',
  },
  {
    id: 'copper',
    group: 'commodity',
    name: 'COMEX 铜',
    chartName: 'COMEX 铜 HG',
    yahooSymbol: 'HG=F',
    color: '#FB923C',
    unit: '/lb',
    priceDecimals: 3,
    sinaCode: 'hf_HG',
    sinaFutureSymbol: 'HG',
  },
];

function roundTo(value: number, decimals = 2): number {
  if (!Number.isFinite(value)) return 0;
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function formatLocalDate(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatDateInTimeZone(epochSec: number, timeZone?: string): string {
  try {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: timeZone || 'UTC',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    return formatter.format(new Date(epochSec * 1000));
  } catch {
    return new Date(epochSec * 1000).toISOString().slice(0, 10);
  }
}

function formatSignedPct(value: number): string {
  const rounded = roundTo(value, 2);
  return `${rounded >= 0 ? '+' : ''}${rounded.toFixed(2)}%`;
}

function formatCommodityPrice(price: number, decimals = 2): { priceText: string; rawText: string } {
  if (!Number.isFinite(price) || price <= 0) {
    return { priceText: '$--', rawText: '$--' };
  }
  const abs = Math.abs(price);
  if (abs >= 1000) {
    const rounded = Math.round(price).toLocaleString('en-US');
    return { priceText: `$${rounded}`, rawText: `$${rounded}` };
  }
  return {
    priceText: `$${price.toFixed(Math.min(2, decimals))}`,
    rawText: `$${price.toFixed(decimals)}`,
  };
}

/**
 * Resample an arbitrary intraday percentage series into exact 48 points.
 * When `targetFinalChangePct` is provided, index 47 is strictly anchored to it.
 */
export function resampleTo48Points(
  rawPoints: number[],
  targetFinalChangePct?: number
): number[] {
  const TARGET_LEN = 48;
  const cleaned = rawPoints.filter((v) => typeof v === 'number' && Number.isFinite(v));

  if (cleaned.length === 0) {
    const endVal =
      typeof targetFinalChangePct === 'number' && Number.isFinite(targetFinalChangePct)
        ? roundTo(targetFinalChangePct, 2)
        : 0;
    return Array.from({ length: TARGET_LEN }, (_, idx) =>
      roundTo((endVal * idx) / (TARGET_LEN - 1), 2)
    );
  }

  if (cleaned.length === 1) {
    const base = roundTo(cleaned[0], 2);
    const out = Array.from({ length: TARGET_LEN }, () => base);
    if (typeof targetFinalChangePct === 'number' && Number.isFinite(targetFinalChangePct)) {
      out[TARGET_LEN - 1] = roundTo(targetFinalChangePct, 2);
    }
    return out;
  }

  const out: number[] = [];
  const lastRawIndex = cleaned.length - 1;
  for (let i = 0; i < TARGET_LEN; i++) {
    const pos = (i / (TARGET_LEN - 1)) * lastRawIndex;
    const lo = Math.floor(pos);
    const hi = Math.min(lastRawIndex, Math.ceil(pos));
    const frac = pos - lo;
    const interpolated = cleaned[lo] + (cleaned[hi] - cleaned[lo]) * frac;
    out.push(roundTo(interpolated, 2));
  }

  if (typeof targetFinalChangePct === 'number' && Number.isFinite(targetFinalChangePct)) {
    out[TARGET_LEN - 1] = roundTo(targetFinalChangePct, 2);
  }

  return out;
}

export function hasRealVolume(rawVolumes: number[]): boolean {
  let positiveCount = 0;
  for (const v of rawVolumes) {
    if (typeof v === 'number' && Number.isFinite(v) && v > 0) {
      positiveCount++;
    }
  }
  return positiveCount >= 4;
}

/**
 * Fallback volume profile (0.12..1.0) combining intraday volatility and U-shaped auction distribution.
 */
export function buildFallbackVolumes(points: number[], targetCount = 48): number[] {
  const safePoints = points.length >= 2 ? resampleTo48Points(points) : Array(targetCount).fill(0);
  const rawScores: number[] = [];
  for (let i = 0; i < targetCount; i++) {
    const u = i / Math.max(1, targetCount - 1);
    const uShape = 0.35 + 0.65 * Math.pow(2 * u - 1, 2);
    const prev = safePoints[Math.max(0, i - 1)] ?? 0;
    const curr = safePoints[Math.min(safePoints.length - 1, i)] ?? 0;
    const delta = Math.abs(curr - prev);
    rawScores.push(uShape + delta * 1.4);
  }

  const maxScore = Math.max(...rawScores, 1e-6);
  const minScore = Math.min(...rawScores);
  const span = Math.max(1e-6, maxScore - minScore);

  return rawScores.map((score) =>
    roundTo(clamp(0.12 + ((score - minScore) / span) * 0.88, 0.12, 1.0), 2)
  );
}

/**
 * Bucket/resample raw intraday volumes to `targetCount` (default 48),
 * clip outliers at the P95 percentile (preventing closing auction spikes from crushing intraday bars),
 * and normalize linearly into [0.12, 1.0].
 */
export function normalizeVolumesP95(rawVolumes: number[], targetCount = 48): number[] {
  const cleaned = rawVolumes.map((v) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0));
  if (!hasRealVolume(cleaned)) {
    return buildFallbackVolumes([], targetCount);
  }

  // Bucket / resample to targetCount
  const bucketed: number[] = [];
  if (cleaned.length === targetCount) {
    bucketed.push(...cleaned);
  } else if (cleaned.length > targetCount) {
    for (let i = 0; i < targetCount; i++) {
      const start = Math.floor((i * cleaned.length) / targetCount);
      const end = Math.max(start + 1, Math.floor(((i + 1) * cleaned.length) / targetCount));
      let sum = 0;
      for (let j = start; j < end && j < cleaned.length; j++) {
        sum += cleaned[j];
      }
      bucketed.push(sum / Math.max(1, end - start));
    }
  } else {
    const lastIdx = cleaned.length - 1;
    for (let i = 0; i < targetCount; i++) {
      const pos = (i / Math.max(1, targetCount - 1)) * lastIdx;
      const lo = Math.floor(pos);
      const hi = Math.min(lastIdx, Math.ceil(pos));
      const frac = pos - lo;
      bucketed.push(cleaned[lo] + (cleaned[hi] - cleaned[lo]) * frac);
    }
  }

  const positiveSorted = bucketed.filter((v) => v > 0).sort((a, b) => a - b);
  if (positiveSorted.length === 0) {
    return buildFallbackVolumes([], targetCount);
  }

  const p95Index = Math.min(
    positiveSorted.length - 1,
    Math.max(0, Math.floor(0.95 * (positiveSorted.length - 1)))
  );
  const p95 = positiveSorted[p95Index];
  if (!Number.isFinite(p95) || p95 <= 0) {
    return buildFallbackVolumes([], targetCount);
  }

  return bucketed.map((v) => {
    const clipped = Math.min(v, p95);
    const normalized = 0.12 + (clipped / p95) * 0.88;
    return roundTo(clamp(normalized, 0.12, 1.0), 2);
  });
}

/**
 * Compare Yahoo front-month futures change% against Sina continuous futures change%.
 * A divergence strictly greater than `diffThresholdPct` (default 2.0%) flags a suspected rollover gap.
 */
export function detectRolloverAnomaly(
  yahooChangePct: number,
  sinaChangePct: number,
  diffThresholdPct = ROLLOVER_DIFF_THRESHOLD_PCT
): RolloverAnomalyResult {
  const yPct = roundTo(yahooChangePct, 2);
  const sPct = roundTo(sinaChangePct, 2);
  const diffPct = roundTo(Math.abs(yPct - sPct), 2);

  if (diffPct > diffThresholdPct) {
    return {
      isAnomaly: true,
      diffPct,
      yahooChangePct: yPct,
      sinaChangePct: sPct,
      preferredSource: 'sina',
      preferredChangePct: sPct,
      warning: `疑似期货换月跳空，已优先采用连续合约口径（Yahoo ${formatSignedPct(yPct)} vs 新浪连续 ${formatSignedPct(sPct)}，偏差 ${diffPct.toFixed(2)}%）`,
    };
  }

  return {
    isAnomaly: false,
    diffPct,
    yahooChangePct: yPct,
    sinaChangePct: sPct,
    preferredSource: 'yahoo',
    preferredChangePct: yPct,
  };
}

export function filterCommoditiesByThreshold(
  items: MarketCommodityWatchItem[],
  thresholdPct = 2.5
): {
  anomalies: MarketCommodityWatchItem[];
  filteredOut: MarketCommodityWatchItem[];
} {
  const anomalies: MarketCommodityWatchItem[] = [];
  const filteredOut: MarketCommodityWatchItem[] = [];
  for (const item of items) {
    if (Math.abs(item.changePct) >= thresholdPct) {
      anomalies.push(item);
    } else {
      filteredOut.push(item);
    }
  }
  return { anomalies, filteredOut };
}

export function sanitizeDailyCandles(rawCandles: DailyCandle[], decimals = 2): DailyCandle[] {
  const valid = rawCandles
    .filter(
      (c) =>
        Number.isFinite(c.open) &&
        Number.isFinite(c.high) &&
        Number.isFinite(c.low) &&
        Number.isFinite(c.close) &&
        c.open > 0 &&
        c.close > 0
    )
    .map((c) => {
      const open = roundTo(c.open, decimals);
      const close = roundTo(c.close, decimals);
      const high = roundTo(Math.max(c.high, open, close), decimals);
      const low = roundTo(Math.min(c.low, open, close), decimals);
      return { open, high, low, close };
    });

  if (valid.length >= 5) {
    return valid.slice(-5);
  }
  if (valid.length === 0) {
    return Array.from({ length: 5 }, () => ({ open: 100, high: 101, low: 99, close: 100 }));
  }
  const padded = [...valid];
  while (padded.length < 5) {
    padded.unshift({ ...padded[0] });
  }
  return padded;
}

async function fetchTextWithTimeout(
  url: string,
  headers: Record<string, string> = DEFAULT_HEADERS,
  timeoutMs = FETCH_TIMEOUT_MS
): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers,
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ${res.statusText}`);
    }
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

async function fetchJsonWithTimeout<T>(
  url: string,
  headers: Record<string, string> = DEFAULT_HEADERS,
  timeoutMs = FETCH_TIMEOUT_MS
): Promise<T> {
  const text = await fetchTextWithTimeout(url, headers, timeoutMs);
  return JSON.parse(text) as T;
}

interface RawYahooChartResponse {
  chart?: {
    result?: Array<{
      meta?: {
        symbol?: string;
        exchangeTimezoneName?: string;
        regularMarketPrice?: number;
        chartPreviousClose?: number;
        previousClose?: number;
      };
      timestamp?: number[];
      indicators?: {
        quote?: Array<{
          open?: Array<number | null>;
          high?: Array<number | null>;
          low?: Array<number | null>;
          close?: Array<number | null>;
          volume?: Array<number | null>;
        }>;
      };
    }>;
    error?: { code?: string; description?: string } | null;
  };
}

async function fetchYahooChart(symbol: string): Promise<YahooChartPayload> {
  const encoded = encodeURIComponent(symbol);
  const dailyUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encoded}?interval=1d&range=1mo`;
  const intradayUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encoded}?interval=5m&range=5d`;

  const [dailyRes, intradayRes] = await Promise.all([
    fetchJsonWithTimeout<RawYahooChartResponse>(dailyUrl),
    fetchJsonWithTimeout<RawYahooChartResponse>(intradayUrl),
  ]);

  const dailyChart = dailyRes.chart?.result?.[0];
  if (!dailyChart) {
    const errMsg = dailyRes.chart?.error?.description || 'missing chart result';
    throw new Error(`Yahoo 1d ${symbol} failed: ${errMsg}`);
  }

  const tz = dailyChart.meta?.exchangeTimezoneName || 'UTC';
  const dailyTimestamps = dailyChart.timestamp ?? [];
  const dailyQuote = dailyChart.indicators?.quote?.[0] ?? {};
  const dailyRows: YahooDailyRow[] = [];

  for (let i = 0; i < dailyTimestamps.length; i++) {
    const o = dailyQuote.open?.[i];
    const h = dailyQuote.high?.[i];
    const l = dailyQuote.low?.[i];
    const c = dailyQuote.close?.[i];
    const v = dailyQuote.volume?.[i];
    if (
      typeof o === 'number' &&
      typeof h === 'number' &&
      typeof l === 'number' &&
      typeof c === 'number' &&
      Number.isFinite(o) &&
      Number.isFinite(h) &&
      Number.isFinite(l) &&
      Number.isFinite(c) &&
      o > 0 &&
      c > 0
    ) {
      const ts = dailyTimestamps[i];
      dailyRows.push({
        dateStr: formatDateInTimeZone(ts, tz),
        timestamp: ts,
        open: o,
        high: Math.max(h, o, c),
        low: Math.min(l, o, c),
        close: c,
        volume: typeof v === 'number' && Number.isFinite(v) ? v : 0,
      });
    }
  }

  const intradayChart = intradayRes.chart?.result?.[0];
  const intradayTimestamps = intradayChart?.timestamp ?? [];
  const intradayQuote = intradayChart?.indicators?.quote?.[0] ?? {};
  const intradayTz = intradayChart?.meta?.exchangeTimezoneName || tz;
  const intradayRows: YahooIntradayRow[] = [];

  for (let i = 0; i < intradayTimestamps.length; i++) {
    const c = intradayQuote.close?.[i];
    const v = intradayQuote.volume?.[i];
    if (typeof c === 'number' && Number.isFinite(c) && c > 0) {
      const ts = intradayTimestamps[i];
      intradayRows.push({
        dateStr: formatDateInTimeZone(ts, intradayTz),
        timestamp: ts,
        close: c,
        volume: typeof v === 'number' && Number.isFinite(v) ? v : 0,
      });
    }
  }

  return {
    symbol,
    exchangeTimezoneName: tz,
    regularMarketPrice: dailyChart.meta?.regularMarketPrice,
    chartPreviousClose: dailyChart.meta?.chartPreviousClose,
    previousClose: dailyChart.meta?.previousClose,
    dailyRows,
    intradayRows,
  };
}

/**
 * Parse Sina `hq.sinajs.cn/list=hf_...` response text into structured quotes.
 */
export function parseSinaHqResponse(rawText: string): Record<string, SinaRealtimeQuote> {
  const result: Record<string, SinaRealtimeQuote> = {};
  const regex = /var\s+hq_str_([A-Za-z0-9_]+)\s*=\s*"([^"]*)"/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(rawText)) !== null) {
    const code = match[1];
    const body = match[2].trim();
    if (!body) continue;
    const parts = body.split(',');
    const price = Number.parseFloat(parts[0] ?? '');
    const rawPct = Number.parseFloat(parts[1] ?? '');
    const high = Number.parseFloat(parts[4] ?? '');
    const low = Number.parseFloat(parts[5] ?? '');
    const time = (parts[6] ?? '').trim();
    const prevSettle = Number.parseFloat(parts[7] ?? '');
    const open = Number.parseFloat(parts[8] ?? '');
    const date = (parts[12] ?? '').trim();
    const name = (parts[13] ?? code).trim();

    if (!Number.isFinite(price) || price <= 0) continue;

    let changePct = 0;
    if (Number.isFinite(prevSettle) && prevSettle > 0) {
      changePct = ((price - prevSettle) / prevSettle) * 100;
    } else if (Number.isFinite(rawPct)) {
      changePct = rawPct;
    }

    result[code] = {
      code,
      name,
      price,
      prevSettle: Number.isFinite(prevSettle) && prevSettle > 0 ? prevSettle : price,
      open: Number.isFinite(open) && open > 0 ? open : price,
      high: Number.isFinite(high) && high > 0 ? Math.max(high, price) : price,
      low: Number.isFinite(low) && low > 0 ? Math.min(low, price) : price,
      changePct: roundTo(changePct, 2),
      date,
      time,
    };
  }

  return result;
}

/**
 * Extract the JSON array payload from a Sina JSONP response string.
 */
export function parseSinaJsonpArray(jsonpText: string): unknown[] {
  const trimmed = jsonpText.trim();
  const startBracket = trimmed.indexOf('[');
  const endBracket = trimmed.lastIndexOf(']');
  if (startBracket === -1 || endBracket === -1 || endBracket <= startBracket) {
    throw new Error('Sina JSONP payload does not contain a JSON array');
  }
  const slice = trimmed.slice(startBracket, endBracket + 1);
  const parsed = JSON.parse(slice);
  if (!Array.isArray(parsed)) {
    throw new Error('Sina JSONP parsed value is not an array');
  }
  return parsed;
}

async function fetchSinaRealtimeQuotes(codes: string[]): Promise<Record<string, SinaRealtimeQuote>> {
  const url = `https://hq.sinajs.cn/list=${codes.join(',')}`;
  const text = await fetchTextWithTimeout(url, SINA_HEADERS);
  return parseSinaHqResponse(text);
}

interface SinaDailyRow {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

async function fetchSinaGlobalFuturesDaily(symbol: string): Promise<SinaDailyRow[]> {
  const url = `https://stock2.finance.sina.com.cn/futures/api/jsonp.php/var%20_cb=/GlobalFuturesService.getGlobalFuturesDailyKLine?symbol=${encodeURIComponent(symbol)}`;
  const text = await fetchTextWithTimeout(url, SINA_HEADERS);
  const arr = parseSinaJsonpArray(text);
  const rows: SinaDailyRow[] = [];

  for (const entry of arr) {
    if (!entry || typeof entry !== 'object') continue;
    const obj = entry as Record<string, unknown>;
    const date = String(obj.date ?? obj.d ?? '').slice(0, 10);
    const open = Number(obj.open ?? obj.o);
    const high = Number(obj.high ?? obj.h);
    const low = Number(obj.low ?? obj.l);
    const close = Number(obj.close ?? obj.c);
    const volume = Number(obj.volume ?? obj.v ?? 0);
    if (
      date &&
      Number.isFinite(open) &&
      Number.isFinite(high) &&
      Number.isFinite(low) &&
      Number.isFinite(close) &&
      open > 0 &&
      close > 0
    ) {
      rows.push({
        date,
        open,
        high: Math.max(high, open, close),
        low: Math.min(low, open, close),
        close,
        volume: Number.isFinite(volume) ? volume : 0,
      });
    }
  }

  return rows;
}

interface SinaMinRow {
  time: string;
  price: number;
  volume: number;
}

async function fetchSinaGlobalFuturesMinLine(symbol: string): Promise<SinaMinRow[]> {
  const url = `https://stock2.finance.sina.com.cn/futures/api/jsonp.php/var%20_cb=/GlobalFuturesService.getGlobalFuturesMinLine?symbol=${encodeURIComponent(symbol)}`;
  const text = await fetchTextWithTimeout(url, SINA_HEADERS);
  const arr = parseSinaJsonpArray(text);
  const rows: SinaMinRow[] = [];

  // Sina GlobalFuturesService.getGlobalFuturesMinLine may return nested arrays (sessions) or objects
  const flatItems: unknown[] = [];
  for (const item of arr) {
    if (Array.isArray(item) && item.length > 0 && (Array.isArray(item[0]) || typeof item[0] === 'object')) {
      flatItems.push(...item);
    } else {
      flatItems.push(item);
    }
  }

  for (const entry of flatItems) {
    if (Array.isArray(entry)) {
      // [time, price, avg, volume, ...]
      const time = String(entry[0] ?? '');
      const price = Number(entry[1]);
      const volume = Number(entry[3] ?? entry[2] ?? 0);
      if (Number.isFinite(price) && price > 0) {
        rows.push({ time, price, volume: Number.isFinite(volume) ? volume : 0 });
      }
    } else if (entry && typeof entry === 'object') {
      const obj = entry as Record<string, unknown>;
      const time = String(obj.time ?? obj.t ?? obj.date ?? '');
      const price = Number(obj.price ?? obj.p ?? obj.close ?? obj.c);
      const volume = Number(obj.volume ?? obj.v ?? 0);
      if (Number.isFinite(price) && price > 0) {
        rows.push({ time, price, volume: Number.isFinite(volume) ? volume : 0 });
      }
    }
  }

  return rows;
}

function selectDailyWindow(rows: YahooDailyRow[], targetDate: string): YahooDailyRow[] {
  const filtered = rows.filter((r) => r.dateStr <= targetDate);
  if (filtered.length >= 6) return filtered.slice(-6);
  if (filtered.length >= 2) return filtered;
  return rows.slice(-6);
}

function selectLatestCompleteIntradayDay(
  intradayRows: YahooIntradayRow[],
  preferredDate?: string
): YahooIntradayRow[] {
  if (intradayRows.length === 0) return [];
  const byDate = new Map<string, YahooIntradayRow[]>();
  for (const row of intradayRows) {
    const bucket = byDate.get(row.dateStr) ?? [];
    bucket.push(row);
    byDate.set(row.dateStr, bucket);
  }

  const dates = Array.from(byDate.keys()).sort();
  if (preferredDate && byDate.has(preferredDate)) {
    const pref = byDate.get(preferredDate)!;
    if (pref.length >= 6) return pref;
  }

  // Pick the most recent day with at least 6 valid 5m bars
  for (let i = dates.length - 1; i >= 0; i--) {
    const candidate = byDate.get(dates[i])!;
    if (candidate.length >= 6) return candidate;
  }

  return byDate.get(dates[dates.length - 1]) ?? intradayRows;
}

function buildItemFromYahooPayload(
  spec: InstrumentSpec,
  payload: YahooChartPayload,
  targetDate: string
): {
  chartItem: CleanIndexChartItem;
  audit: MarketAuditRecord;
  closePrice: number;
  prevClose: number;
} {
  const decimals = spec.priceDecimals ?? 2;
  const dailyWindow = selectDailyWindow(payload.dailyRows, targetDate);
  if (dailyWindow.length === 0) {
    throw new Error(`${spec.yahooSymbol} returned no valid daily OHLC rows`);
  }

  const latestDay = dailyWindow[dailyWindow.length - 1];
  const prevDay = dailyWindow.length >= 2 ? dailyWindow[dailyWindow.length - 2] : undefined;
  const prevClose =
    prevDay?.close ??
    payload.previousClose ??
    payload.chartPreviousClose ??
    latestDay.open;

  const changePct = roundTo(((latestDay.close - prevClose) / prevClose) * 100, 2);
  const openGapPct = roundTo(((latestDay.open - prevClose) / prevClose) * 100, 2);
  const dailyCandles = sanitizeDailyCandles(
    dailyWindow.slice(-5).map((r) => ({
      open: r.open,
      high: r.high,
      low: r.low,
      close: r.close,
    })),
    decimals
  );

  const sessionRows = selectLatestCompleteIntradayDay(payload.intradayRows, latestDay.dateStr);
  const rawPctSeries = sessionRows.map((r) => ((r.close - prevClose) / prevClose) * 100);
  const points =
    rawPctSeries.length >= 2
      ? resampleTo48Points(rawPctSeries, changePct)
      : resampleTo48Points([openGapPct, changePct], changePct);

  const rawVolumes = sessionRows.map((r) => r.volume);
  const realVol = hasRealVolume(rawVolumes);
  const volumes = realVol ? normalizeVolumesP95(rawVolumes, 48) : buildFallbackVolumes(points, 48);

  const range5dLow = Math.min(...dailyCandles.map((c) => c.low));
  const range5dHigh = Math.max(...dailyCandles.map((c) => c.high));

  const notes: string[] = [];
  if (!realVol) {
    notes.push('Yahoo 5m 序列无真实量能，已采用波动率 + U 型分布回退估算');
  }
  if (rawPctSeries.length < 6) {
    notes.push(`5m 样本点较少(${rawPctSeries.length})，已做线性补点并锚定收盘涨跌幅`);
  }

  return {
    chartItem: {
      id: spec.id,
      name: spec.chartName,
      changePct,
      color: spec.color,
      dailyCandles,
      points,
      volumes,
    },
    audit: {
      id: spec.id,
      group: spec.group,
      name: spec.name,
      symbol: spec.yahooSymbol,
      source: `Yahoo Finance (${spec.yahooSymbol})`,
      verificationStatus: 'verified',
      closePrice: roundTo(latestDay.close, decimals),
      prevClose: roundTo(prevClose, decimals),
      changePct,
      openGapPct,
      range5dLow: roundTo(range5dLow, decimals),
      range5dHigh: roundTo(range5dHigh, decimals),
      volumeMode: realVol ? 'real_p95' : 'volatility_u_fallback',
      notes,
    },
    closePrice: roundTo(latestDay.close, decimals),
    prevClose: roundTo(prevClose, decimals),
  };
}

function buildDegradedChartItem(
  spec: InstrumentSpec,
  reason: string
): {
  chartItem: CleanIndexChartItem;
  audit: MarketAuditRecord;
  closePrice: number;
  prevClose: number;
} {
  const dailyCandles = sanitizeDailyCandles([]);
  const points = resampleTo48Points([0, 0], 0);
  const volumes = buildFallbackVolumes(points, 48);
  return {
    chartItem: {
      id: spec.id,
      name: spec.chartName,
      changePct: 0,
      color: spec.color,
      dailyCandles,
      points,
      volumes,
    },
    audit: {
      id: spec.id,
      group: spec.group,
      name: spec.name,
      symbol: spec.yahooSymbol,
      source: `Yahoo Finance (${spec.yahooSymbol}) [抓取失败]`,
      verificationStatus: 'degraded',
      closePrice: 0,
      prevClose: 0,
      changePct: 0,
      openGapPct: 0,
      range5dLow: 0,
      range5dHigh: 0,
      volumeMode: 'volatility_u_fallback',
      notes: [`抓取失败：${reason}`],
    },
    closePrice: 0,
    prevClose: 0,
  };
}

function describeA50IntradayShape(points: number[], finalChangePct: number): string {
  const minVal = Math.min(...points);
  const maxVal = Math.max(...points);
  const earlySlice = points.slice(0, 16);
  const earlyMin = Math.min(...earlySlice);
  const earlyMax = Math.max(...earlySlice);

  if (earlyMin <= -1.2 && finalChangePct > earlyMin + 0.4) {
    return `分时状态：早盘急探 ${earlyMin.toFixed(2)}% 触底，随后窄幅震荡回升至 ${formatSignedPct(finalChangePct)}`;
  }
  if (earlyMax >= 1.0 && finalChangePct < earlyMax - 0.4) {
    return `分时状态：早盘冲高 ${formatSignedPct(earlyMax)} 后震荡回落，收于 ${formatSignedPct(finalChangePct)}`;
  }
  if (Math.abs(maxVal - minVal) < 0.8) {
    return `分时状态：全天窄幅横盘整理（区间 ${minVal.toFixed(2)}% ~ ${formatSignedPct(maxVal)}），收于 ${formatSignedPct(finalChangePct)}`;
  }
  return `分时状态：盘中波动区间 ${minVal.toFixed(2)}% ~ ${formatSignedPct(maxVal)}，尾盘收于 ${formatSignedPct(finalChangePct)}`;
}

async function fetchA50Hero(
  targetDate: string,
  sinaRealtime: Record<string, SinaRealtimeQuote>,
  auditWarnings: string[]
): Promise<{
  a50Hero: CleanIndexChartItem & { intradayShapeNote: string };
  audit: MarketAuditRecord;
}> {
  const rt = sinaRealtime['hf_CHA50CFD'];
  try {
    const [dailyRows, minRows] = await Promise.all([
      fetchSinaGlobalFuturesDaily('CHA50CFD'),
      fetchSinaGlobalFuturesMinLine('CHA50CFD').catch(() => [] as SinaMinRow[]),
    ]);

    const filteredDaily = dailyRows.filter((r) => r.date <= targetDate);
    const windowDaily = filteredDaily.length >= 2 ? filteredDaily.slice(-6) : dailyRows.slice(-6);

    if (windowDaily.length >= 2) {
      const latest = windowDaily[windowDaily.length - 1];
      const prev = windowDaily[windowDaily.length - 2];
      const latestClose = rt && rt.date === latest.date ? rt.price : latest.close;
      const prevClose = rt && rt.date === latest.date && rt.prevSettle > 0 ? rt.prevSettle : prev.close;
      const changePct = roundTo(((latestClose - prevClose) / prevClose) * 100, 2);
      const openGapPct = roundTo(((latest.open - prevClose) / prevClose) * 100, 2);

      const dailyCandles = sanitizeDailyCandles(
        windowDaily.slice(-5).map((r, idx, arr) =>
          idx === arr.length - 1
            ? {
                open: r.open,
                high: Math.max(r.high, latestClose),
                low: Math.min(r.low, latestClose),
                close: latestClose,
              }
            : { open: r.open, high: r.high, low: r.low, close: r.close }
        ),
        1
      );

      const rawPctSeries = minRows.map((m) => ((m.price - prevClose) / prevClose) * 100);
      const points =
        rawPctSeries.length >= 4
          ? resampleTo48Points(rawPctSeries, changePct)
          : resampleTo48Points([openGapPct, changePct], changePct);

      const rawVolumes = minRows.map((m) => m.volume);
      const realVol = hasRealVolume(rawVolumes);
      const volumes = realVol ? normalizeVolumesP95(rawVolumes, 48) : buildFallbackVolumes(points, 48);
      const intradayShapeNote = describeA50IntradayShape(points, changePct);

      const notes: string[] = [];
      if (!realVol) {
        notes.push('新浪 CHA50CFD 分时无有效成交量，采用波动率 + U 型回退估算');
      }
      if (rawPctSeries.length < 4) {
        notes.push('新浪 CHA50CFD 分时点不足，已按开盘/收盘锚点平滑生成');
      }

      return {
        a50Hero: {
          id: 'a50',
          name: '富时中国 A50',
          changePct,
          color: '#FBBF24',
          intradayShapeNote,
          dailyCandles,
          points,
          volumes,
        },
        audit: {
          id: 'a50',
          group: 'a50',
          name: '富时中国 A50',
          symbol: 'CHA50CFD',
          source: '新浪财经 SGX (CHA50CFD)',
          verificationStatus: rt ? 'cross_checked' : 'verified',
          closePrice: roundTo(latestClose, 1),
          prevClose: roundTo(prevClose, 1),
          changePct,
          openGapPct,
          range5dLow: roundTo(Math.min(...dailyCandles.map((c) => c.low)), 1),
          range5dHigh: roundTo(Math.max(...dailyCandles.map((c) => c.high)), 1),
          volumeMode: realVol ? 'real_p95' : 'volatility_u_fallback',
          notes,
        },
      };
    }
    throw new Error('Sina CHA50CFD daily K-line returned fewer than 2 rows');
  } catch (sinaErr) {
    const errText = sinaErr instanceof Error ? sinaErr.message : String(sinaErr);
    auditWarnings.push(
      `⚠️ 新浪富时中国 A50 (CHA50CFD) 接口受限或超时（${errText}），尝试回退 Yahoo 参考标的（XIN9.F / 2823.HK）。`
    );

    const fallbackSymbols = ['XIN9.F', '2823.HK'];
    for (const sym of fallbackSymbols) {
      try {
        const payload = await fetchYahooChart(sym);
        const built = buildItemFromYahooPayload(
          {
            id: 'a50',
            group: 'asia',
            name: '富时中国 A50',
            chartName: '富时中国 A50',
            yahooSymbol: sym,
            color: '#FBBF24',
            priceDecimals: sym === '2823.HK' ? 2 : 1,
          },
          payload,
          targetDate
        );
        const intradayShapeNote = describeA50IntradayShape(
          built.chartItem.points,
          built.chartItem.changePct
        );
        built.audit.group = 'a50';
        built.audit.source = `Yahoo Finance 回退参考 (${sym})`;
        built.audit.verificationStatus = 'fallback';
        built.audit.notes.push(`主源新浪 CHA50CFD 失败，已自动回退至 Yahoo ${sym}，请人工二次核对`);

        return {
          a50Hero: {
            ...built.chartItem,
            intradayShapeNote,
          },
          audit: built.audit,
        };
      } catch {
        // try next fallback symbol
      }
    }

    // Last resort: use Sina realtime quote if present
    if (rt) {
      const openGapPct =
        rt.prevSettle > 0 ? roundTo(((rt.open - rt.prevSettle) / rt.prevSettle) * 100, 2) : 0;
      const points = resampleTo48Points([openGapPct, rt.changePct], rt.changePct);
      const volumes = buildFallbackVolumes(points, 48);
      const dailyCandles = sanitizeDailyCandles(
        Array.from({ length: 5 }, () => ({
          open: rt.open,
          high: rt.high,
          low: rt.low,
          close: rt.price,
        })),
        1
      );
      return {
        a50Hero: {
          id: 'a50',
          name: '富时中国 A50',
          changePct: rt.changePct,
          color: '#FBBF24',
          intradayShapeNote: describeA50IntradayShape(points, rt.changePct),
          dailyCandles,
          points,
          volumes,
        },
        audit: {
          id: 'a50',
          group: 'a50',
          name: '富时中国 A50',
          symbol: 'hf_CHA50CFD',
          source: '新浪实时快照回退 (hf_CHA50CFD)',
          verificationStatus: 'fallback',
          closePrice: roundTo(rt.price, 1),
          prevClose: roundTo(rt.prevSettle, 1),
          changePct: rt.changePct,
          openGapPct,
          range5dLow: roundTo(rt.low, 1),
          range5dHigh: roundTo(rt.high, 1),
          volumeMode: 'volatility_u_fallback',
          notes: ['仅获取到实时快照，5日K与分时曲线需人工核验补充'],
        },
      };
    }

    auditWarnings.push('🔴 富时中国 A50 全部数据源（新浪 CHA50CFD + Yahoo XIN9.F / 2823.HK）均不可用，已写入占位数据。');
    const degraded = buildDegradedChartItem(
      {
        id: 'a50',
        group: 'asia',
        name: '富时中国 A50',
        chartName: '富时中国 A50',
        yahooSymbol: 'CHA50CFD',
        color: '#FBBF24',
      },
      '所有主备数据源均不可用'
    );
    degraded.audit.group = 'a50';
    return {
      a50Hero: {
        ...degraded.chartItem,
        intradayShapeNote: '分时状态：数据源暂不可用，请人工补录 A50 实盘分时走势',
      },
      audit: degraded.audit,
    };
  }
}

export function renderMarketAuditMarkdown(bundle: VerifiedMarketBundle): string {
  const lines: string[] = [];
  lines.push(`# ${bundle.date} 全球盘前实盘数据多源核验单`);
  lines.push('');
  lines.push(`- **核验日期**：\`${bundle.date}\``);
  lines.push(`- **抓取时间**：\`${bundle.fetchedAt}\``);
  lines.push(`- **大宗商品异动阈值**：\`|涨跌幅| >= ${bundle.thresholdPct.toFixed(2)}%\``);
  lines.push(`- **数据源**：${bundle.dataSources.join(' / ')}`);
  lines.push('');

  if (bundle.auditWarnings.length > 0) {
    lines.push('## ⚠️ 核验告警与风控提示');
    lines.push('');
    for (const w of bundle.auditWarnings) {
      lines.push(`- ${w}`);
    }
    lines.push('');
  } else {
    lines.push('## ✅ 核验结论');
    lines.push('');
    lines.push('- 多源实盘数据拉取与交叉比对均未发现换月跳空或数据源降级异常。');
    lines.push('');
  }

  lines.push('## 一、全市场核心标的实盘核验总表');
  lines.push('');
  lines.push(
    '| 分组 | 标的 | 代码 | 收盘价 | 涨跌幅 | 开盘跳空 | 5日K区间 (Low ~ High) | 量能模式 | 数据源 | 校验状态 |'
  );
  lines.push('| --- | --- | --- | ---: | ---: | ---: | --- | --- | --- | --- |');

  const groupLabel: Record<MarketAuditRecord['group'], string> = {
    us: '美股',
    asia: '亚太',
    commodity: '大宗',
    a50: 'A50',
  };
  const statusLabel: Record<MarketAuditRecord['verificationStatus'], string> = {
    verified: '✅ 实盘已核',
    cross_checked: '✅ 双源交叉一致',
    rollover_adjusted: '🔴 换月已纠偏(新浪连续)',
    fallback: '⚠️ 备用源回退',
    degraded: '❌ 降级占位',
  };

  for (const r of bundle.auditRecords) {
    const volLabel = r.volumeMode === 'real_p95' ? '实盘 P95' : '波动率+U型回退';
    lines.push(
      `| ${groupLabel[r.group]} | ${r.name} | \`${r.symbol}\` | ${r.closePrice} | **${formatSignedPct(r.changePct)}** | ${formatSignedPct(r.openGapPct)} | ${r.range5dLow} ~ ${r.range5dHigh} | ${volLabel} | ${r.source} | ${statusLabel[r.verificationStatus]} |`
    );
  }
  lines.push('');

  const crossRecords = bundle.auditRecords.filter((r) => r.sinaCrossCheck);
  lines.push('## 二、大宗期货跨源交叉校验（防换月跳空）');
  lines.push('');
  if (crossRecords.length === 0) {
    lines.push('- 本次未获取到新浪连续合约实时快照（可能受网络/限流影响），请人工复核主力合约是否处于换月窗口。');
  } else {
    lines.push('| 品种 | Yahoo 代码 | 新浪连续代码 | 最终口径涨跌幅 | 新浪连续涨跌幅 | 跨源偏差 | 换月判定 |');
    lines.push('| --- | --- | --- | ---: | ---: | ---: | --- |');
    for (const r of crossRecords) {
      const sc = r.sinaCrossCheck!;
      const flag = sc.rolloverTriggered
        ? '🔴 **疑似期货换月跳空，已优先采用连续合约口径**'
        : '✅ 偏差 ≤ 2.0%，口径一致';
      lines.push(
        `| ${r.name} | \`${r.symbol}\` | \`${sc.code}\` | ${formatSignedPct(r.changePct)} | ${formatSignedPct(sc.sinaChangePct)} | ${sc.diffPct.toFixed(2)}% | ${flag} |`
      );
    }
  }
  lines.push('');

  lines.push(`## 三、大宗商品异动筛选清单（阈值 ±${bundle.thresholdPct.toFixed(2)}%）`);
  lines.push('');
  lines.push('### 入选异动品种');
  if (bundle.anomalies.length === 0) {
    lines.push('- 今日候选大宗商品均未达到异动阈值，建议第 2 幕简化大宗卡片或调整说明。');
  } else {
    for (const item of bundle.anomalies) {
      lines.push(
        `- **${item.name}**（\`${item.code}\`）：**${formatSignedPct(item.changePct)}** — ${item.note}`
      );
    }
  }
  lines.push('');

  lines.push('### 已自动过滤的平盘品种');
  if (bundle.filteredOut.length === 0) {
    lines.push('- 无平盘过滤品种。');
  } else {
    for (const item of bundle.filteredOut) {
      lines.push(
        `- ${item.name}（\`${item.code}\`）：${formatSignedPct(item.changePct)} — ${item.note}`
      );
    }
  }
  lines.push('');

  lines.push('## 四、富时中国 A50 分时形态简述');
  lines.push('');
  lines.push(`- **最新涨跌幅**：**${formatSignedPct(bundle.a50Hero.changePct)}**`);
  lines.push(`- **客观分时描述**：${bundle.a50Hero.intradayShapeNote}`);
  lines.push('');

  const noteItems = bundle.auditRecords.filter((r) => r.notes.length > 0);
  if (noteItems.length > 0) {
    lines.push('## 五、字段级补充说明');
    lines.push('');
    for (const r of noteItems) {
      for (const note of r.notes) {
        lines.push(`- **${r.name}**：${note}`);
      }
    }
    lines.push('');
  }

  return lines.join('\n');
}

export interface FetchMarketDataOptions {
  date: string;
  thresholdPct: number;
}

export async function fetchVerifiedMarketData(
  options: FetchMarketDataOptions
): Promise<VerifiedMarketBundle> {
  const { date, thresholdPct } = options;
  const fetchedAt = new Date().toISOString();
  const auditWarnings: string[] = [];
  const auditRecords: MarketAuditRecord[] = [];
  const dataSourceSet = new Set<string>(['Yahoo Finance']);

  // 1. Fetch Sina realtime quotes in parallel with Yahoo charts
  const sinaCodes = ['hf_CHA50CFD', 'hf_GC', 'hf_NG', 'hf_CL', 'hf_HG'];
  const sinaRealtimePromise = fetchSinaRealtimeQuotes(sinaCodes).catch((err) => {
    const msg = err instanceof Error ? err.message : String(err);
    auditWarnings.push(`⚠️ 新浪财经实时交叉校验接口超时或受限（${msg}），期货换月对比将受限。`);
    return {} as Record<string, SinaRealtimeQuote>;
  });

  const allYahooSpecs = [...US_SPECS, ...ASIA_SPECS, ...COMMODITY_SPECS];
  const yahooResults = await Promise.all(
    allYahooSpecs.map(async (spec) => {
      try {
        const payload = await fetchYahooChart(spec.yahooSymbol);
        return { spec, ok: true as const, payload };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        auditWarnings.push(`⚠️ Yahoo Finance 拉取 ${spec.name} (${spec.yahooSymbol}) 失败：${msg}`);
        return { spec, ok: false as const, error: msg };
      }
    })
  );

  const sinaRealtime = await sinaRealtimePromise;
  if (Object.keys(sinaRealtime).length > 0) {
    dataSourceSet.add('新浪财经 SGX/NYMEX');
  }

  const builtById = new Map<
    string,
    {
      chartItem: CleanIndexChartItem;
      audit: MarketAuditRecord;
      closePrice: number;
      prevClose: number;
    }
  >();

  for (const res of yahooResults) {
    if (res.ok) {
      try {
        const built = buildItemFromYahooPayload(res.spec, res.payload, date);
        builtById.set(res.spec.id, built);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        auditWarnings.push(`⚠️ 解析 ${res.spec.name} 数据失败：${msg}`);
        builtById.set(res.spec.id, buildDegradedChartItem(res.spec, msg));
      }
    } else {
      builtById.set(res.spec.id, buildDegradedChartItem(res.spec, res.error));
    }
  }

  // 2. Cross-check commodities against Sina continuous futures & detect rollover anomalies
  const commodityWatchlist: MarketCommodityWatchItem[] = [];
  const allCommodityCharts: Record<string, CleanIndexChartItem> = {};

  for (const spec of COMMODITY_SPECS) {
    const entry = builtById.get(spec.id)!;
    const decimals = spec.priceDecimals ?? 2;
    const sinaQuote = spec.sinaCode ? sinaRealtime[spec.sinaCode] : undefined;

    if (sinaQuote) {
      const rollover = detectRolloverAnomaly(
        entry.chartItem.changePct,
        sinaQuote.changePct,
        ROLLOVER_DIFF_THRESHOLD_PCT
      );

      entry.audit.sinaCrossCheck = {
        code: spec.sinaCode!,
        sinaChangePct: sinaQuote.changePct,
        diffPct: rollover.diffPct,
        rolloverTriggered: rollover.isAnomaly,
      };

      if (rollover.isAnomaly) {
        auditWarnings.push(`🔴 【${spec.name}】${rollover.warning}`);
        entry.audit.verificationStatus = 'rollover_adjusted';
        entry.audit.source = `新浪连续合约 (${spec.sinaCode}) [替换 Yahoo ${spec.yahooSymbol}]`;
        entry.audit.notes.push(rollover.warning!);

        // Try fetching Sina continuous daily K-line & intraday min-line to replace Yahoo rollover-distorted curve
        try {
          const [sDaily, sMin] = await Promise.all([
            fetchSinaGlobalFuturesDaily(spec.sinaFutureSymbol!),
            fetchSinaGlobalFuturesMinLine(spec.sinaFutureSymbol!).catch(() => [] as SinaMinRow[]),
          ]);
          const filtered = sDaily.filter((r) => r.date <= date);
          const win = filtered.length >= 2 ? filtered.slice(-6) : sDaily.slice(-6);
          if (win.length >= 2) {
            const latest = win[win.length - 1];
            const prev = win[win.length - 2];
            const latestClose = sinaQuote.price > 0 ? sinaQuote.price : latest.close;
            const prevClose = sinaQuote.prevSettle > 0 ? sinaQuote.prevSettle : prev.close;
            const adjChangePct = roundTo(((latestClose - prevClose) / prevClose) * 100, 2);
            const adjOpenGap = roundTo(((latest.open - prevClose) / prevClose) * 100, 2);

            const dailyCandles = sanitizeDailyCandles(
              win.slice(-5).map((r, idx, arr) =>
                idx === arr.length - 1
                  ? {
                      open: r.open,
                      high: Math.max(r.high, latestClose),
                      low: Math.min(r.low, latestClose),
                      close: latestClose,
                    }
                  : { open: r.open, high: r.high, low: r.low, close: r.close }
              ),
              decimals
            );

            const minPct = sMin.map((m) => ((m.price - prevClose) / prevClose) * 100);
            const points =
              minPct.length >= 4
                ? resampleTo48Points(minPct, adjChangePct)
                : resampleTo48Points([adjOpenGap, adjChangePct], adjChangePct);
            const rawVols = sMin.map((m) => m.volume);
            const realVol = hasRealVolume(rawVols);
            const volumes = realVol ? normalizeVolumesP95(rawVols, 48) : buildFallbackVolumes(points, 48);

            entry.chartItem = {
              ...entry.chartItem,
              changePct: adjChangePct,
              dailyCandles,
              points,
              volumes,
            };
            entry.closePrice = roundTo(latestClose, decimals);
            entry.prevClose = roundTo(prevClose, decimals);
            entry.audit.closePrice = entry.closePrice;
            entry.audit.prevClose = entry.prevClose;
            entry.audit.changePct = adjChangePct;
            entry.audit.openGapPct = adjOpenGap;
            entry.audit.range5dLow = roundTo(Math.min(...dailyCandles.map((c) => c.low)), decimals);
            entry.audit.range5dHigh = roundTo(Math.max(...dailyCandles.map((c) => c.high)), decimals);
            entry.audit.volumeMode = realVol ? 'real_p95' : 'volatility_u_fallback';
          } else {
            throw new Error('新浪连续日K不足 2 根');
          }
        } catch (sinaFallbackErr) {
          // Shift Yahoo curve so final changePct matches Sina continuous quote
          const shift = sinaQuote.changePct - entry.chartItem.changePct;
          const shiftedPoints = resampleTo48Points(
            entry.chartItem.points.map((p) => p + shift),
            sinaQuote.changePct
          );
          entry.chartItem.changePct = sinaQuote.changePct;
          entry.chartItem.points = shiftedPoints;
          entry.closePrice = roundTo(sinaQuote.price, decimals);
          entry.prevClose = roundTo(sinaQuote.prevSettle, decimals);
          entry.audit.closePrice = entry.closePrice;
          entry.audit.prevClose = entry.prevClose;
          entry.audit.changePct = sinaQuote.changePct;
          entry.audit.notes.push(
            `新浪连续K线拉取受限（${sinaFallbackErr instanceof Error ? sinaFallbackErr.message : String(sinaFallbackErr)}），已按新浪实时连续涨跌幅 ${formatSignedPct(sinaQuote.changePct)} 平移校准分时曲线`
          );
        }
      } else {
        entry.audit.verificationStatus = 'cross_checked';
      }
    }

    const formatted = formatCommodityPrice(entry.closePrice, decimals);
    const isAnomaly = Math.abs(entry.chartItem.changePct) >= thresholdPct;
    commodityWatchlist.push({
      id: spec.id,
      name: spec.name,
      code: `${formatted.rawText}${spec.unit ?? ''}`,
      priceText: formatted.priceText,
      changePct: entry.chartItem.changePct,
      note: isAnomaly
        ? entry.chartItem.changePct > 0
          ? '异动走强 · 盘面波动放大'
          : '异动承压 · 盘面抛压集中'
        : '平盘无异动（已过滤）',
    });
    allCommodityCharts[spec.id] = entry.chartItem;
  }

  const { anomalies, filteredOut } = filterCommoditiesByThreshold(commodityWatchlist, thresholdPct);
  const commodityCharts: Record<string, CleanIndexChartItem> = {};
  for (const item of anomalies) {
    if (allCommodityCharts[item.id]) {
      commodityCharts[item.id] = allCommodityCharts[item.id];
    }
  }
  // Ensure at least 1 chart exists when all commodities are flat so UI never breaks
  if (Object.keys(commodityCharts).length === 0 && commodityWatchlist.length > 0) {
    const sorted = [...commodityWatchlist].sort(
      (a, b) => Math.abs(b.changePct) - Math.abs(a.changePct)
    );
    const top = sorted[0];
    if (top && allCommodityCharts[top.id]) {
      commodityCharts[top.id] = allCommodityCharts[top.id];
    }
  }

  // 3. Fetch FTSE China A50
  const a50Result = await fetchA50Hero(date, sinaRealtime, auditWarnings);

  // Assemble ordered audit records
  for (const spec of [...US_SPECS, ...ASIA_SPECS, ...COMMODITY_SPECS]) {
    auditRecords.push(builtById.get(spec.id)!.audit);
  }
  auditRecords.push(a50Result.audit);

  const usIndices: [CleanIndexChartItem, CleanIndexChartItem] = [
    builtById.get('nasdaq')!.chartItem,
    builtById.get('sox')!.chartItem,
  ];
  const asiaIndices: [CleanIndexChartItem, CleanIndexChartItem] = [
    builtById.get('kospi')!.chartItem,
    builtById.get('nikkei')!.chartItem,
  ];

  return {
    schemaVersion: 1,
    date,
    fetchedAt,
    thresholdPct,
    dataSources: Array.from(dataSourceSet),
    usIndices,
    asiaIndices,
    commodityWatchlist,
    commodityCharts,
    a50Hero: a50Result.a50Hero,
    anomalies,
    filteredOut,
    auditWarnings,
    auditRecords,
  };
}

interface FetchCliArgs {
  date: string;
  outPath: string;
  auditPath: string;
  thresholdPct: number;
}

function parseCliArgs(argv: string[]): FetchCliArgs {
  let date = formatLocalDate();
  let outPath: string | undefined;
  let auditPath: string | undefined;
  let thresholdPct = 2.5;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--date' && argv[i + 1]) {
      date = argv[++i];
    } else if (arg === '--out' && argv[i + 1]) {
      outPath = argv[++i];
    } else if (arg === '--audit' && argv[i + 1]) {
      auditPath = argv[++i];
    } else if (arg === '--threshold' && argv[i + 1]) {
      const parsed = Number.parseFloat(argv[++i]);
      if (!Number.isFinite(parsed) || parsed < 0) {
        throw new Error(`Invalid --threshold value: ${argv[i]}`);
      }
      thresholdPct = parsed;
    } else if (arg === '--help' || arg === '-h') {
      console.log(
        [
          '用法: bun scripts/fetch-market-data.ts [选项]',
          '',
          '选项:',
          '  --date YYYY-MM-DD   目标交易日（默认今天）',
          '  --out <path>        核验 JSON 输出路径（默认 episodes/<date>/market_verified.json）',
          '  --audit <path>      核验单 Markdown 路径（默认 episodes/<date>/market_audit.md）',
          '  --threshold <num>   大宗商品异动阈值 %（默认 2.5）',
        ].join('\n')
      );
      process.exit(0);
    }
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error(`--date 必须为 YYYY-MM-DD 格式，收到: "${date}"`);
  }

  return {
    date,
    outPath: outPath ?? path.join('episodes', date, 'market_verified.json'),
    auditPath: auditPath ?? path.join('episodes', date, 'market_audit.md'),
    thresholdPct,
  };
}

async function runCli(): Promise<void> {
  const args = parseCliArgs(process.argv.slice(2));
  console.log(
    `[fetch-market-data] 开始抓取 ${args.date} 全球实盘数据（异动阈值 ±${args.thresholdPct}%）...`
  );

  const bundle = await fetchVerifiedMarketData({
    date: args.date,
    thresholdPct: args.thresholdPct,
  });

  const outAbs = path.resolve(process.cwd(), args.outPath);
  const auditAbs = path.resolve(process.cwd(), args.auditPath);
  fs.mkdirSync(path.dirname(outAbs), { recursive: true });
  fs.mkdirSync(path.dirname(auditAbs), { recursive: true });

  fs.writeFileSync(outAbs, `${JSON.stringify(bundle, null, 2)}\n`, 'utf-8');
  const auditMd = renderMarketAuditMarkdown(bundle);
  fs.writeFileSync(auditAbs, `${auditMd}\n`, 'utf-8');

  console.log(`[fetch-market-data] 已写入核验数据: ${outAbs}`);
  console.log(`[fetch-market-data] 已写入核验报告: ${auditAbs}`);
  console.log(
    `[fetch-market-data] 异动大宗(${bundle.anomalies.length}): ${
      bundle.anomalies.map((a) => `${a.name} ${formatSignedPct(a.changePct)}`).join(', ') || '无'
    } | 已过滤平盘(${bundle.filteredOut.length}): ${
      bundle.filteredOut.map((f) => `${f.name} ${formatSignedPct(f.changePct)}`).join(', ') || '无'
    }`
  );
  if (bundle.auditWarnings.length > 0) {
    console.log('[fetch-market-data] 告警摘要:');
    for (const w of bundle.auditWarnings) {
      console.log(`  - ${w}`);
    }
  }
}

const isDirectRun =
  typeof process !== 'undefined' &&
  Array.isArray(process.argv) &&
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isDirectRun) {
  runCli().catch((err) => {
    console.error('[fetch-market-data] 执行失败:', err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
