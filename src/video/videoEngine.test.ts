import test from 'node:test';
import assert from 'node:assert/strict';
import { CHART_THEME, VIDEO_SPEC } from './theme';
import {
  SHOTS,
  getClockAndMinuteAtFrame,
  getShotAtFrame,
  minuteIndexToX,
  resolveLabelPositions,
  tradingMinuteToClock,
  valueToY,
} from './timeline';
import { DATA_1117_CLOSE, DATA_MORNING_BRIEF } from './data/fundFlowData';
import { encodeStereoWav, synthesizeTrackPcm } from './audio/synthAudio';
import {
  INTEL_1120_DATA,
  INTEL_VIDEO_SPEC,
  selectMarketAnomalies,
} from './intel/intelData';
import { INTEL_SHOTS, getIntelShotAtFrame } from './intel/intelTimeline';
import { synthesizeIntelTrackPcm } from './intel/synthIntelAudio';
import {
  INTEL_V2_DATA,
  INTEL_V2_SPEC,
  SHOT2_PART_TIMING,
  getCardEnterProgress,
  getShot1ExitState,
  getV2Anomalies,
  interpolateSeriesPct,
  sliceTypewriterText,
} from './intelV2/intelV2Data';
import { INTEL_V2_SHOTS, getIntelV2ShotAtFrame } from './intelV2/intelV2Timeline';
import { synthesizeIntelV2TrackPcm } from './intelV2/synthIntelV2Audio';
import {
  buildTrackWavBlob,
  getExportFileName,
  tryParseJsonObject,
} from './export/clientMp4Export';

test('timeline covers frames 0..667 continuously with exact cut points', () => {
  assert.equal(SHOTS.length, 10);
  assert.equal(SHOTS[0].startFrame, 0);
  assert.equal(SHOTS[SHOTS.length - 1].endFrame, VIDEO_SPEC.totalFrames - 1);

  for (let i = 1; i < SHOTS.length; i++) {
    assert.equal(
      SHOTS[i].startFrame,
      SHOTS[i - 1].endFrame + 1,
      `Shot ${SHOTS[i].id} must immediately follow ${SHOTS[i - 1].id}`
    );
  }

  assert.equal(getShotAtFrame(96).kind, 'open');
  assert.equal(getShotAtFrame(97).kind, 'art_noon_slap');
  assert.equal(getShotAtFrame(166).kind, 'chart');
  assert.equal(getShotAtFrame(213).kind, 'art_two_sheep');
  assert.equal(getShotAtFrame(272).kind, 'chart_etf');
  assert.equal(getShotAtFrame(440).kind, 'attribution_table');
  assert.equal(getShotAtFrame(496).kind, 'chart');
  assert.equal(getShotAtFrame(556).kind, 'art_lithography');
  assert.equal(getShotAtFrame(609).kind, 'closing_freeze');
});

test('11.20 multi-style timeline covers 0..899 and anomaly filter hides flat assets', () => {
  assert.equal(INTEL_SHOTS.length, 6);
  assert.equal(INTEL_SHOTS[0].startFrame, 0);
  assert.equal(INTEL_SHOTS[INTEL_SHOTS.length - 1].endFrame, INTEL_VIDEO_SPEC.totalFrames - 1);

  for (let i = 1; i < INTEL_SHOTS.length; i++) {
    assert.equal(INTEL_SHOTS[i].startFrame, INTEL_SHOTS[i - 1].endFrame + 1);
  }

  assert.equal(getIntelShotAtFrame(0).kind, 'meme_hook');
  assert.equal(getIntelShotAtFrame(100).kind, 'global_markets');
  assert.equal(getIntelShotAtFrame(260).kind, 'event_tabloid');
  assert.equal(getIntelShotAtFrame(410).kind, 'event_blueprint');
  assert.equal(getIntelShotAtFrame(560).kind, 'event_portrait');
  assert.equal(getIntelShotAtFrame(720).kind, 'summary_verdict');

  assert.equal(INTEL_1120_DATA.markets.usIndices.length, 2);
  assert.equal(INTEL_1120_DATA.markets.asiaIndices.length, 2);
  assert.equal(INTEL_1120_DATA.markets.chinaBellwether.id, 'ftse-a50');

  const anomalies = selectMarketAnomalies(INTEL_1120_DATA.markets.commodityWatchlist, 2.5);
  assert.deepEqual(
    anomalies.map((a) => a.id),
    ['gold', 'crude-oil']
  );

  assert.equal(INTEL_1120_DATA.summary.bullishItems.length, 3);
  assert.equal(INTEL_1120_DATA.summary.bearishItems.length, 3);
});

test('chart coordinate and clock mapping match measured specification', () => {
  assert.equal(minuteIndexToX(0), CHART_THEME.xStart);
  assert.equal(minuteIndexToX(240), CHART_THEME.xEnd);
  assert.equal(valueToY(0), CHART_THEME.zeroY);
  assert.ok(Math.abs(valueToY(10) - (1043 - 159.75)) < 0.001);

  assert.equal(tradingMinuteToClock(0), '09:30');
  assert.equal(tradingMinuteToClock(120), '13:00');
  assert.equal(tradingMinuteToClock(240), '15:00');

  assert.equal(getClockAndMinuteAtFrame(166).clockText, '13:09');
  assert.equal(getClockAndMinuteAtFrame(212).clockText, '13:26');
  assert.equal(getClockAndMinuteAtFrame(342).clockText, '14:00');
  assert.equal(getClockAndMinuteAtFrame(439).clockText, '14:19');
  assert.equal(getClockAndMinuteAtFrame(555).clockText, '15:00');
  assert.equal(getClockAndMinuteAtFrame(667).clockText, '15:00');
});

test('resolveLabelPositions prevents overlaps with >= 38px min spacing', () => {
  const crowded = DATA_1117_CLOSE.curves.map((c) => ({
    id: c.id,
    targetY: valueToY(c.endValue),
  }));
  const resolved = resolveLabelPositions(crowded, 38);
  assert.equal(resolved.size, 28);

  const ys = Array.from(resolved.values()).sort((a, b) => a - b);
  for (let i = 1; i < ys.length; i++) {
    assert.ok(
      ys[i] - ys[i - 1] >= 37.99,
      `Labels ${i - 1} and ${i} collapsed: gap=${ys[i] - ys[i - 1]}`
    );
  }
  assert.ok(ys[0] >= CHART_THEME.plotTop);
  assert.ok(ys[ys.length - 1] <= CHART_THEME.plotBottom);
});

test('1117 close and morning brief datasets satisfy spec counts and endpoints', () => {
  assert.equal(DATA_1117_CLOSE.curves.length, 28);
  assert.equal(DATA_1117_CLOSE.curves[0].name, '芯片');
  assert.equal(DATA_1117_CLOSE.curves[0].endValue, 27.3);
  assert.equal(DATA_1117_CLOSE.curves[27].name, '机器人概念');
  assert.equal(DATA_1117_CLOSE.curves[27].endValue, -63.2);
  for (const c of DATA_1117_CLOSE.curves) {
    assert.equal(c.values.length, 242);
    assert.equal(c.values[240], c.endValue);
  }
  assert.equal(DATA_1117_CLOSE.stickers.length, 14);
  assert.equal(DATA_1117_CLOSE.attributionRows.length, 8);
  assert.equal(DATA_1117_CLOSE.etfItems.length, 3);

  assert.ok(DATA_MORNING_BRIEF.curves.length >= 12);
  assert.equal(DATA_MORNING_BRIEF.stickers.length, 14);
});

test('audio synthesizers produce valid stereo PCM and RIFF WAV headers', () => {
  const pcm = synthesizeTrackPcm(22050, 5.0);
  assert.equal(pcm.left.length, Math.floor(22050 * 5.0));

  let activeSum = 0;
  for (let i = Math.floor(0.5 * 22050); i < Math.floor(1.5 * 22050); i++) {
    activeSum += pcm.left[i] * pcm.left[i];
  }
  let pauseSum = 0;
  for (let i = Math.floor(2.2 * 22050); i < Math.floor(2.8 * 22050); i++) {
    pauseSum += pcm.left[i] * pcm.left[i];
  }
  const activeRms = Math.sqrt(activeSum / 22050);
  const pauseRms = Math.sqrt(pauseSum / (0.6 * 22050));
  assert.ok(activeRms > 0.05);
  assert.ok(pauseRms < activeRms * 0.25);

  const intelPcm = synthesizeIntelTrackPcm(22050, 4.0);
  assert.equal(intelPcm.left.length, Math.floor(22050 * 4.0));
  let intelEnergy = 0;
  for (let i = 0; i < intelPcm.left.length; i++) {
    intelEnergy += intelPcm.left[i] * intelPcm.left[i];
  }
  assert.ok(Math.sqrt(intelEnergy / intelPcm.left.length) > 0.04);

  const wav = encodeStereoWav(intelPcm);
  assert.equal(String.fromCharCode(wav[0], wav[1], wav[2], wav[3]), 'RIFF');
  assert.equal(String.fromCharCode(wav[8], wav[9], wav[10], wav[11]), 'WAVE');

  const v2Pcm = synthesizeIntelV2TrackPcm(22050, 4.0);
  assert.equal(v2Pcm.left.length, Math.floor(22050 * 4.0));
  let v2Energy = 0;
  for (let i = 0; i < v2Pcm.left.length; i++) {
    v2Energy += v2Pcm.left[i] * v2Pcm.left[i];
  }
  assert.ok(Math.sqrt(v2Energy / v2Pcm.left.length) > 0.04);
});

test('11.20 v2 6-shot timeline compresses Shot 01+transition to 2.6s (0..77, 1188 total), large concise danmaku, verified Shot 02 (78..497), and +1s A50 dwell', () => {
  assert.equal(INTEL_V2_SHOTS.length, 6);
  assert.equal(INTEL_V2_SHOTS[0].startFrame, 0);
  assert.equal(INTEL_V2_SHOTS[0].endFrame, 77);
  assert.ok(INTEL_V2_SHOTS[0].endSec >= 2.0 && INTEL_V2_SHOTS[0].endSec <= 3.0, 'Shot 01 + transition must fit within 2-3s');
  assert.equal(INTEL_V2_SHOTS[INTEL_V2_SHOTS.length - 1].endFrame, INTEL_V2_SPEC.totalFrames - 1);
  assert.equal(INTEL_V2_SPEC.totalFrames, 1188);
  assert.equal(INTEL_V2_SPEC.durationSec, 39.6);

  for (let i = 1; i < INTEL_V2_SHOTS.length; i++) {
    assert.equal(INTEL_V2_SHOTS[i].startFrame, INTEL_V2_SHOTS[i - 1].endFrame + 1);
  }

  assert.equal(getIntelV2ShotAtFrame(0).kind, 'v2_keyday_video_intro');
  assert.equal(getIntelV2ShotAtFrame(77).kind, 'v2_keyday_video_intro');
  assert.equal(getIntelV2ShotAtFrame(78).kind, 'v2_indices_board');
  assert.equal(getIntelV2ShotAtFrame(497).kind, 'v2_indices_board');
  assert.equal(getIntelV2ShotAtFrame(498).kind, 'v2_liquidity_funnel');
  assert.equal(getIntelV2ShotAtFrame(648).kind, 'v2_dual_spotlight');
  assert.equal(getIntelV2ShotAtFrame(798).kind, 'v2_robot_countdown');
  assert.equal(getIntelV2ShotAtFrame(948).kind, 'v2_forecast_verdict');

  // Shot 01 concise high-impact danmaku lanes (>=52px, <=24 chars) + objective A50 framing + complete clear by f=75
  assert.ok(INTEL_V2_DATA.keyDayVideo.danmakuItems.length >= 5);
  for (const dm of INTEL_V2_DATA.keyDayVideo.danmakuItems) {
    assert.ok(dm.fontSize >= 52, `Danmaku "${dm.text}" must use enlarged font >= 52px`);
    assert.ok(Array.from(dm.text).length <= 26, `Danmaku "${dm.text}" should stay concise for rapid reading`);
    assert.equal(dm.text.includes('唯独'), false, 'Danmaku must describe A50 objectively without "唯独"');
  }

  const earlyExit = getShot1ExitState(57);
  assert.ok(earlyExit.danmakuExit > 0);
  assert.equal(earlyExit.videoClose, 0);
  assert.equal(earlyExit.isCleared, false);
  const fullClear = getShot1ExitState(75);
  assert.equal(fullClear.videoClose, 1);
  assert.equal(fullClear.isCleared, true);

  // Shot 02 (78..497) typewriter pacing + 1.0s US pause + >= 55f (1.83s, +1s extra) dwell after A50 completes
  assert.ok(SHOT2_PART_TIMING.asiaStart - SHOT2_PART_TIMING.usTypeEnd >= 30);
  const shot2 = INTEL_V2_SHOTS[1];
  const a50HoldFrames = shot2.endFrame - (shot2.startFrame + SHOT2_PART_TIMING.a50NoteEnd);
  assert.ok(a50HoldFrames >= 55, `Expected >= 55 frames A50 dwell after note ends, got ${a50HoldFrames}`);

  const sampleText = INTEL_V2_DATA.indicesBoard.usReason;
  assert.equal(sliceTypewriterText(sampleText, 25, 26, 86).visible, '');
  const midType = sliceTypewriterText(sampleText, 56, 26, 86);
  assert.ok(midType.typing);
  assert.ok(midType.visible.length > 0 && midType.visible.length < sampleText.length);
  const doneType = sliceTypewriterText(sampleText, 86, 26, 86);
  assert.equal(doneType.done, true);
  assert.equal(doneType.visible, sampleText);

  // Shot 02 verified indices & commodities: US (Nasdaq+SOX), Asia (KOSPI+Nikkei), Commodities (Gold+NG anomalies), A50 Hero
  assert.equal(INTEL_V2_DATA.indicesBoard.usIndices.length, 2);
  assert.equal(INTEL_V2_DATA.indicesBoard.asiaIndices.length, 2);
  assert.ok(INTEL_V2_DATA.indicesBoard.usIndices[0].points[0] < 0, 'Nasdaq opened gap-down on 11.20');
  const boardItems = [
    ...INTEL_V2_DATA.indicesBoard.usIndices,
    ...INTEL_V2_DATA.indicesBoard.asiaIndices,
    INTEL_V2_DATA.indicesBoard.commodityCharts.gold,
    INTEL_V2_DATA.indicesBoard.commodityCharts['nat-gas'],
    INTEL_V2_DATA.indicesBoard.a50Hero,
  ];
  for (const item of boardItems) {
    assert.equal(item.points.length, 48);
    assert.equal(item.volumes.length, 48);
    assert.ok(item.dailyCandles.length >= 5);
    assert.ok(Math.abs(interpolateSeriesPct(item.points, 1) - item.changePct) < 0.001);
  }

  assert.deepEqual(
    getV2Anomalies().map((a) => a.id),
    ['gold', 'nat-gas']
  );

  assert.equal(INTEL_V2_DATA.summaryFinale.scenarioTimeLabels.length, 5);
  assert.equal(INTEL_V2_DATA.summaryFinale.scenarioSteady.length, 4);
  assert.equal(INTEL_V2_DATA.summaryFinale.scenarioWeak.length, 4);
  assert.equal(getCardEnterProgress(24, 24, 16), 0);
  assert.equal(getCardEnterProgress(32, 24, 16), 0.5);
  assert.equal(getCardEnterProgress(60, 24, 16), 1);
});

test('export helpers guard against <!doctype html> responses and build valid WAV blobs', async () => {
  assert.equal(tryParseJsonObject('<!doctype html><html><body>SPA</body></html>', 'text/html'), null);
  assert.equal(tryParseJsonObject('   <!DOCTYPE html>\n<html></html>'), null);
  assert.equal(tryParseJsonObject('', 'application/json'), null);
  assert.equal(tryParseJsonObject('not json', 'application/json'), null);
  assert.deepEqual(
    tryParseJsonObject<{ sessionId: string }>('{"sessionId":"abc-123"}', 'application/json'),
    { sessionId: 'abc-123' }
  );

  assert.equal(getExportFileName('1120_v2', 'mp4'), '1120_v2_morning_intel_final.mp4');
  assert.equal(getExportFileName('1120', 'wav'), '1120_108bpm_editorial_mix.wav');
  assert.equal(getExportFileName('1117', 'webm'), '1117_close_fund_flow_replica.webm');

  const { blob, filename } = buildTrackWavBlob('1120_v2');
  assert.equal(filename, '1120_v2_112bpm_editorial.wav');
  assert.equal(blob.type, 'audio/wav');
  const bytes = new Uint8Array(await blob.arrayBuffer());
  assert.equal(String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]), 'RIFF');
  assert.ok(bytes.byteLength > 44);
});
