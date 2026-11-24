import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import type { EpisodeManifest, HookLibraryManifest } from './schema';
import {
  collectEpisodeAssetSources,
  compileEpisodeTimeline,
  getCompiledShotAtFrame,
  getHookExitState,
  selectAnomalousCommodities,
} from './timeline';
import { synthesizeEpisodeAudioPcm } from './audioSynth';
import { encodeStereoWav } from '../audio/synthAudio';
import { validateEpisodeManifest } from '../../../scripts/validate-episode';
import {
  detectRolloverAnomaly,
  filterCommoditiesByThreshold,
  normalizeVolumesP95,
  resampleTo48Points,
} from '../../../scripts/fetch-market-data';
import { buildEpisodeManifest } from '../../../scripts/create-episode';

const PROJECT_ROOT = path.resolve(import.meta.dirname, '..', '..', '..');
const EPISODE_1120_PATH = path.join(PROJECT_ROOT, 'episodes', '2026-11-20', 'episode.json');
const HOOKS_MANIFEST_PATH = path.join(PROJECT_ROOT, 'assets', 'hooks', 'manifest.json');

const episode1120 = JSON.parse(fs.readFileSync(EPISODE_1120_PATH, 'utf8')) as EpisodeManifest;
const hooksManifest = JSON.parse(fs.readFileSync(HOOKS_MANIFEST_PATH, 'utf8')) as HookLibraryManifest;

test('compileEpisodeTimeline matches 2026-11-20 exact 1188 frames and 5 cut points', () => {
  const tl = compileEpisodeTimeline(episode1120);
  assert.equal(tl.totalFrames, 1188);
  assert.equal(tl.durationSec, 39.6);
  assert.deepEqual(tl.cutFrames, [78, 498, 648, 798, 948]);
  assert.equal(tl.shots.length, 6);
  assert.equal(getCompiledShotAtFrame(tl, 0).kind, 'hook_live_video');
  assert.equal(getCompiledShotAtFrame(tl, 77).kind, 'hook_live_video');
  assert.equal(getCompiledShotAtFrame(tl, 78).kind, 'market_chrono_board');
  assert.equal(getCompiledShotAtFrame(tl, 1187).kind, 'verdict_scenario');

  const exit74 = getHookExitState(74, 78);
  assert.equal(exit74.videoClose, 1);
  assert.equal(exit74.isCleared, false);
  assert.equal(getHookExitState(75, 78).isCleared, true);
});

test('compileEpisodeTimeline adapts dynamically to episodes with fewer or more event scenes', () => {
  const shortEpisode: EpisodeManifest = {
    ...episode1120,
    id: '2026-11-24-short',
    scenes: [
      episode1120.scenes[0],
      episode1120.scenes[1],
      episode1120.scenes[2],
      episode1120.scenes[5],
    ],
  };
  const tl = compileEpisodeTimeline(shortEpisode);
  assert.equal(tl.shots.length, 4);
  assert.equal(tl.totalFrames, 78 + 420 + 150 + 240);
  assert.deepEqual(tl.cutFrames, [78, 498, 648]);
});

test('synthesizeEpisodeAudioPcm produces valid stereo PCM and RIFF WAV header for dynamic episodes', () => {
  const pcm = synthesizeEpisodeAudioPcm(episode1120, 22050);
  assert.equal(pcm.left.length, Math.floor(22050 * 39.6));
  assert.equal(pcm.right.length, pcm.left.length);

  let peak = 0;
  for (let i = 0; i < pcm.left.length; i += 97) {
    peak = Math.max(peak, Math.abs(pcm.left[i]), Math.abs(pcm.right[i]));
  }
  assert.ok(peak > 0.1 && peak <= 1.0, `Expected non-silent bounded PCM, got peak=${peak}`);

  const wav = encodeStereoWav(pcm);
  assert.equal(String.fromCharCode(wav[0], wav[1], wav[2], wav[3]), 'RIFF');
  assert.equal(String.fromCharCode(wav[8], wav[9], wav[10], wav[11]), 'WAVE');
});

test('collectEpisodeAssetSources extracts all hook videos and event images', () => {
  const assets = collectEpisodeAssetSources(episode1120);
  assert.equal(assets.hookVideos.length, 1);
  assert.equal(assets.hookVideos[0].videoSrc, '/src/assets/videos/real_keyday_watch_45749.mp4');
  assert.ok(assets.imageSrcs.includes('/src/assets/images/real_keyday_watch_poster.jpg'));
  assert.ok(assets.imageSrcs.includes('/src/assets/images/event_musk_real_kitchen_1795248294473.jpg'));
});

test('validateEpisodeManifest passes 2026-11-20 with 0 errors and 0 warnings', () => {
  const report = validateEpisodeManifest(episode1120, {
    strictAssetCheck: true,
    projectRoot: PROJECT_ROOT,
  });
  assert.equal(report.ok, true, `Unexpected validation errors: ${JSON.stringify(report.errors)}`);
  assert.equal(report.errors.length, 0);
  assert.equal(report.warnings.length, 0);
});

test('validateEpisodeManifest catches fake curves, forbidden hype words, forbidden zones, and short pauses', () => {
  const broken: EpisodeManifest = JSON.parse(JSON.stringify(episode1120));

  // 1) Hook too long + danmaku overlapping face forbidden zone (190..720)
  const hook = broken.scenes[0];
  assert.equal(hook.kind, 'hook_live_video');
  hook.durationFrames = 120;
  hook.data.danmakuItems[0].y = 400;

  // 2) Fake curve mismatch + short US reading pause
  const market = broken.scenes[1];
  assert.equal(market.kind, 'market_chrono_board');
  market.data.usIndices[0].points[47] = 4.5; // opposite sign vs -5.28%
  market.data.timing = { ...market.data.timing, usTypeEnd: 86, asiaStart: 95 };

  // 3) Forbidden subjective hype word
  const verdict = broken.scenes[5];
  assert.equal(verdict.kind, 'verdict_scenario');
  verdict.data.verdictHeadline = 'A50 唯独抗跌，明天必涨闭眼买';
  // 4) Broken scenario split point
  verdict.data.scenarioSteady[0] = 0.5;

  const report = validateEpisodeManifest(broken, { strictAssetCheck: false });
  assert.equal(report.ok, false);
  const codes = new Set(report.errors.map((e) => e.code));
  assert.ok(codes.has('HOOK_DURATION_OUT_OF_RANGE'), 'Should catch >3s hook');
  assert.ok(codes.has('HOOK_DANMAKU_FORBIDDEN_ZONE'), 'Should catch danmaku in face zone');
  assert.ok(codes.has('MARKET_DIRECTION_MISMATCH'), 'Should catch fake curve endpoint');
  assert.ok(codes.has('MARKET_US_PAUSE_TOO_SHORT'), 'Should catch <1s US pause');
  assert.ok(codes.has('COMPLIANCE_FORBIDDEN_WORD'), 'Should catch subjective hype words');
  assert.ok(
    codes.has('VERDICT_STEADY_FORK_MISMATCH') || codes.has('VERDICT_WEAK_FORK_MISMATCH'),
    'Should catch broken scenario pivot'
  );
});

test('fetch-market-data pure helpers resample 48 points, P95 clip volumes, detect rollover, and filter flat assets', () => {
  const resampled = resampleTo48Points([-1.2, -2.5, -3.1, -4.0], -5.28);
  assert.equal(resampled.length, 48);
  assert.equal(resampled[47], -5.28);

  const vols = Array.from({ length: 48 }, (_, i) => (i === 47 ? 100000 : 100 + i * 5));
  const clipped = normalizeVolumesP95(vols);
  assert.equal(clipped.length, 48);
  assert.equal(clipped[47], 1);
  assert.ok(clipped[24] > 0.4, `P95 clipping should preserve midday volume visibility, got ${clipped[24]}`);

  const rollover = detectRolloverAnomaly(14.69, 3.44);
  assert.equal(rollover.isAnomaly, true);
  assert.ok(rollover.diffPct > 10);
  assert.equal(rollover.preferredSource, 'sina');

  const { anomalies, filteredOut } = filterCommoditiesByThreshold(
    [
      { id: 'gold', name: 'COMEX 黄金', code: '$3515', priceText: '$3515', changePct: -4.62, note: '' },
      { id: 'crude-oil', name: 'WTI 原油', code: '$83', priceText: '$83', changePct: 0.24, note: '' },
      { id: 'nat-gas', name: '纽约天然气', code: '$3.79', priceText: '$3.79', changePct: 3.44, note: '' },
    ],
    2.5
  );
  assert.deepEqual(
    anomalies.map((a) => a.id),
    ['gold', 'nat-gas']
  );
  assert.deepEqual(
    filteredOut.map((f) => f.id),
    ['crude-oil']
  );
  assert.equal(selectAnomalousCommodities(anomalies, 2.5).length, 2);
});

test('create-episode buildEpisodeManifest generates a clean manifest passing strict validation', () => {
  const hookEntry = hooksManifest.hooks[0];
  const created = buildEpisodeManifest({
    date: '2026-11-24',
    hook: hookEntry,
  });
  const report = validateEpisodeManifest(created, {
    strictAssetCheck: true,
    projectRoot: PROJECT_ROOT,
  });
  assert.equal(report.ok, true, `Scaffold manifest failed validation: ${JSON.stringify(report.errors)}`);
});
