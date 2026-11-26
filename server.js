// server.ts
import express from "express";
import fs from "fs";
import path from "path";
import os from "os";
import crypto from "crypto";
import { execFile, spawnSync } from "child_process";
import { promisify } from "util";
import { createServer as createViteServer } from "vite";

// src/video/theme.ts
var VIDEO_SPEC = {
  width: 1080,
  height: 2352,
  fps: 30,
  totalFrames: 668,
  durationSec: 668 / 30,
  // 22.267s
  bpm: 129.2,
  breathPauseStartSec: 2,
  breathPauseEndSec: 3
};

// src/video/timeline.ts
var HARD_CUT_FRAMES = [97, 166, 213, 272, 342, 440, 496, 556, 609];

// src/video/audio/synthAudio.ts
function synthesizeTrackPcm(sampleRate = 44100, durationSec = VIDEO_SPEC.durationSec) {
  const totalSamples = Math.floor(sampleRate * durationSec);
  const left = new Float32Array(totalSamples);
  const right = new Float32Array(totalSamples);
  const bpm = VIDEO_SPEC.bpm;
  const beatDur = 60 / bpm;
  const sixteenthDur = beatDur / 4;
  const bassNotes = [110, 110, 130.81, 146.83, 98, 98, 130.81, 164.81];
  const arpNotes = [440, 523.25, 659.25, 783.99, 659.25, 523.25, 587.33, 659.25];
  const cutTimesSec = HARD_CUT_FRAMES.map((f) => f / VIDEO_SPEC.fps);
  let lfsr = 305419896;
  const nextNoise = () => {
    lfsr ^= lfsr << 13;
    lfsr ^= lfsr >>> 17;
    lfsr ^= lfsr << 5;
    return (lfsr >>> 0) / 4294967296 * 2 - 1;
  };
  let whooshLP = 0;
  for (let i = 0; i < totalSamples; i++) {
    const t = i / sampleRate;
    let grooveGain = 1;
    if (t >= 1.95 && t <= 3.05) {
      if (t < 2.05) {
        grooveGain = 1 - (t - 1.95) / 0.1;
      } else if (t > 2.95) {
        grooveGain = (t - 2.95) / 0.1;
      } else {
        grooveGain = 0.04;
      }
    }
    let masterEnv = 1;
    if (t < 0.04) masterEnv = t / 0.04;
    if (t > durationSec - 0.35) {
      masterEnv = Math.max(0, (durationSec - t) / 0.35);
    }
    const beatIndex = Math.floor(t / beatDur);
    const beatPhase = t - beatIndex * beatDur;
    let kick = 0;
    if (beatPhase < 0.18) {
      const kEnv = Math.exp(-beatPhase * 28);
      const pitch = 48 + 115 * Math.exp(-beatPhase * 42);
      kick = Math.sin(2 * Math.PI * pitch * beatPhase) * kEnv * 0.58;
    }
    const stepIndex = Math.floor(t / sixteenthDur);
    const stepPhase = t - stepIndex * sixteenthDur;
    const n = nextNoise();
    let hat = 0;
    if (stepIndex % 2 === 1 && stepPhase < 0.055) {
      const accent = stepIndex % 4 === 2 ? 0.22 : 0.11;
      hat = n * Math.exp(-stepPhase * 75) * accent;
    }
    const eighthIndex = Math.floor(t / (beatDur / 2));
    const eighthPhase = t - eighthIndex * (beatDur / 2);
    const bassFreq = bassNotes[Math.floor(beatIndex / 2) % bassNotes.length];
    const bassEnv = Math.exp(-eighthPhase * 8.5);
    const bassWave = 2 / Math.PI * Math.atan(Math.sin(2 * Math.PI * bassFreq * t) * 2.2);
    const bass = bassWave * bassEnv * 0.28;
    const arpFreq = arpNotes[stepIndex % arpNotes.length];
    const arpBoost = t >= 3 ? 1 : 0.45;
    const arpEnv = Math.exp(-stepPhase * 18);
    const arp = (Math.sin(2 * Math.PI * arpFreq * t) * 0.6 + Math.sin(4 * Math.PI * arpFreq * t) * 0.25) * arpEnv * 0.16 * arpBoost;
    const padFreq = bassFreq * 2;
    const padL = Math.sin(2 * Math.PI * padFreq * t) * 0.06;
    const padR = Math.sin(2 * Math.PI * (padFreq * 1.003) * t) * 0.06;
    let whoosh = 0;
    for (let c = 0; c < cutTimesSec.length; c++) {
      const dt = t - cutTimesSec[c];
      if (dt >= -0.14 && dt <= 0.18) {
        const wEnv = dt < 0 ? (dt + 0.14) / 0.14 : Math.exp(-dt * 16);
        whooshLP = whooshLP * 0.65 + n * 0.35;
        whoosh += (n - whooshLP) * wEnv * 0.38;
      }
    }
    const dryL = (kick + bass + hat * 0.8 + arp * 0.85 + padL) * grooveGain + whoosh * 0.9;
    const dryR = (kick + bass + hat * 1.1 + arp * 1.15 + padR) * grooveGain + whoosh * 1.1;
    left[i] = Math.tanh(dryL * masterEnv * 0.92);
    right[i] = Math.tanh(dryR * masterEnv * 0.92);
  }
  return { sampleRate, left, right };
}
function encodeStereoWav(pcm) {
  const numSamples = pcm.left.length;
  const numChannels = 2;
  const bitsPerSample = 16;
  const blockAlign = numChannels * bitsPerSample / 8;
  const byteRate = pcm.sampleRate * blockAlign;
  const dataSize = numSamples * blockAlign;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  const writeStr = (offset2, str) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset2 + i, str.charCodeAt(i));
    }
  };
  writeStr(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, pcm.sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeStr(36, "data");
  view.setUint32(40, dataSize, true);
  let offset = 44;
  for (let i = 0; i < numSamples; i++) {
    const l = Math.max(-1, Math.min(1, pcm.left[i]));
    const r = Math.max(-1, Math.min(1, pcm.right[i]));
    view.setInt16(offset, l < 0 ? l * 32768 : l * 32767, true);
    view.setInt16(offset + 2, r < 0 ? r * 32768 : r * 32767, true);
    offset += 4;
  }
  return new Uint8Array(buffer);
}

// src/video/intel/intelData.ts
var INTEL_VIDEO_SPEC = {
  width: 1080,
  height: 1920,
  fps: 30,
  totalFrames: 900,
  durationSec: 30,
  bpm: 108
};

// src/video/intel/intelTimeline.ts
var INTEL_CUT_FRAMES = [100, 260, 410, 560, 720];

// src/video/intel/synthIntelAudio.ts
function synthesizeIntelTrackPcm(sampleRate = 44100, durationSec = INTEL_VIDEO_SPEC.durationSec) {
  const totalSamples = Math.floor(sampleRate * durationSec);
  const left = new Float32Array(totalSamples);
  const right = new Float32Array(totalSamples);
  const bpm = INTEL_VIDEO_SPEC.bpm;
  const beatDur = 60 / bpm;
  const chords = [
    [220, 261.63, 329.63, 493.88],
    [174.61, 220, 261.63, 329.63],
    [261.63, 329.63, 392, 493.88],
    [196, 246.94, 293.66, 392]
  ];
  const bassRoots = [55, 43.65, 65.41, 49];
  const cutTimes = INTEL_CUT_FRAMES.map((f) => f / INTEL_VIDEO_SPEC.fps);
  const freezeSlamSec = 18 / 30;
  const stampImpactSec = (410 + 68) / 30;
  const bubblePopTimes = [(560 + 26) / 30, (560 + 66) / 30];
  let lfsr = 1369939251;
  const nextNoise = () => {
    lfsr ^= lfsr << 13;
    lfsr ^= lfsr >>> 17;
    lfsr ^= lfsr << 5;
    return (lfsr >>> 0) / 4294967296 * 2 - 1;
  };
  let lpState = 0;
  for (let i = 0; i < totalSamples; i++) {
    const t = i / sampleRate;
    let masterEnv = 1;
    if (t < 0.05) masterEnv = t / 0.05;
    if (t > durationSec - 0.65) masterEnv = Math.max(0, (durationSec - t) / 0.65);
    const beatFloat = t / beatDur;
    const beatIndex = Math.floor(beatFloat);
    const beatPhase = (beatFloat - beatIndex) * beatDur;
    const barIndex = Math.floor(beatIndex / 4);
    const barPhase = (beatFloat / 4 - barIndex) * (beatDur * 4);
    const eighthFloat = beatFloat * 2;
    const eighthIndex = Math.floor(eighthFloat);
    const eighthPhase = (eighthFloat - eighthIndex) * (beatDur * 0.5);
    const n = nextNoise();
    lpState = lpState * 0.72 + n * 0.28;
    const inMemeTensionGap = t >= 0.45 && t < freezeSlamSec;
    let kick = 0;
    if (!inMemeTensionGap && beatPhase < 0.14) {
      const kEnv = Math.exp(-beatPhase * 26);
      const kFreq = 52 + 88 * Math.exp(-beatPhase * 40);
      kick = Math.sin(2 * Math.PI * kFreq * beatPhase) * kEnv * 0.4;
    }
    let hat = 0;
    if (!inMemeTensionGap && t >= 3.33 && eighthIndex % 2 === 1 && eighthPhase < 0.045) {
      hat = (n - lpState) * Math.exp(-eighthPhase * 90) * 0.085;
    }
    const chord = chords[barIndex % chords.length];
    let keysL = 0;
    let keysR = 0;
    const note = chord[eighthIndex % chord.length];
    const pluckEnv = Math.exp(-eighthPhase * (t < 8.67 ? 9.5 : 5.5));
    const pluckWave = Math.sin(2 * Math.PI * note * t) * 0.68 + Math.sin(4 * Math.PI * note * t) * 0.18;
    const pan = (eighthIndex % 4 - 1.5) * 0.22;
    const pluckGain = t < 3.33 ? 0.14 : 0.2;
    keysL += pluckWave * pluckEnv * pluckGain * (1 - pan);
    keysR += pluckWave * pluckEnv * pluckGain * (1 + pan);
    if (t >= 8.67) {
      for (let c = 0; c < chord.length; c++) {
        const padEnv = Math.exp(-barPhase * 0.45) * 0.065;
        const padSig = Math.sin(2 * Math.PI * chord[c] * 0.5 * t) * padEnv;
        keysL += padSig;
        keysR += padSig;
      }
    }
    const bassFreq = bassRoots[barIndex % bassRoots.length];
    const bassEnv = Math.exp(-beatPhase * 4.5);
    const bass = Math.sin(2 * Math.PI * bassFreq * t) * bassEnv * (inMemeTensionGap ? 0.05 : 0.28);
    let sfx = 0;
    const df = t - freezeSlamSec;
    if (df >= 0 && df < 0.28) {
      const slamEnv = Math.exp(-df * 18);
      const dropFreq = 160 * Math.exp(-df * 10) + 42;
      sfx += (Math.sin(2 * Math.PI * dropFreq * df) * 0.6 + lpState * 0.35) * slamEnv;
    }
    const ds = t - stampImpactSec;
    if (ds >= 0 && ds < 0.22) {
      const stEnv = Math.exp(-ds * 24);
      sfx += (Math.sin(2 * Math.PI * 82 * ds) * 0.55 + lpState * 0.4) * stEnv;
    }
    for (let b = 0; b < bubblePopTimes.length; b++) {
      const db = t - bubblePopTimes[b];
      if (db >= 0 && db < 0.11) {
        const popFreq = 460 + db * 2800;
        sfx += Math.sin(2 * Math.PI * popFreq * db) * Math.exp(-db * 32) * 0.24;
      }
    }
    for (let c = 0; c < cutTimes.length; c++) {
      const dt = t - cutTimes[c];
      if (dt >= -0.05 && dt <= 0.26) {
        const env = dt < 0 ? (dt + 0.05) / 0.05 : Math.exp(-dt * 11);
        sfx += (lpState * 0.22 + Math.sin(2 * Math.PI * (340 - dt * 500) * Math.max(0, dt)) * 0.06) * env;
      }
    }
    const mixL = (kick + hat + keysL + bass + sfx) * masterEnv;
    const mixR = (kick + hat + keysR + bass + sfx) * masterEnv;
    left[i] = Math.tanh(mixL * 0.9);
    right[i] = Math.tanh(mixR * 0.9);
  }
  return { sampleRate, left, right };
}

// src/video/intelV2/intelV2Data.ts
var INTEL_V2_SPEC = {
  width: 1080,
  height: 1920,
  fps: 30,
  totalFrames: 1188,
  durationSec: 39.6,
  bpm: 112
};
var SHOT2_PART_TIMING = {
  usStart: 0,
  usHeadlineFrame: 16,
  usTypeStart: 26,
  usTypeEnd: 86,
  /** Full 1.0s (30 frames) reading pause after US typewriter finishes before Asia enters */
  asiaStart: 116,
  asiaTypeStart: 134,
  asiaTypeEnd: 188,
  commodityStart: 214,
  commodityTypeStart: 232,
  commodityTypeEnd: 284,
  a50Start: 302,
  a50NoteStart: 332,
  a50NoteEnd: 364
};
var NASDAQ_FULL_DAY_48 = [
  -1.44,
  -1.29,
  -0.82,
  -0.44,
  -0.74,
  -1.35,
  -1.96,
  -1.97,
  -2.04,
  -2.13,
  -2.27,
  -2.64,
  -2.16,
  -2.54,
  -2.77,
  -2.97,
  -3.2,
  -3.16,
  -3.5,
  -3.36,
  -3.51,
  -3.53,
  -3.5,
  -3.64,
  -3.68,
  -3.56,
  -3.62,
  -3.45,
  -3.46,
  -3.36,
  -3.59,
  -3.43,
  -3.38,
  -3.62,
  -4.03,
  -4.2,
  -4.63,
  -4.18,
  -4.33,
  -4.39,
  -4.63,
  -4.78,
  -4.71,
  -5.01,
  -5.01,
  -4.8,
  -5.16,
  -5.28
];
var NASDAQ_REAL_VOLUMES_48 = [
  0.12,
  0.86,
  0.7,
  0.63,
  0.61,
  0.57,
  0.63,
  0.61,
  0.64,
  0.62,
  0.51,
  0.44,
  0.47,
  0.4,
  0.39,
  0.41,
  0.42,
  0.38,
  0.43,
  0.43,
  0.36,
  0.33,
  0.33,
  0.34,
  0.33,
  0.33,
  0.3,
  0.3,
  0.35,
  0.3,
  0.3,
  0.29,
  0.34,
  0.29,
  0.33,
  0.35,
  0.45,
  0.48,
  0.35,
  0.42,
  0.36,
  0.43,
  0.47,
  0.46,
  0.62,
  0.63,
  0.85,
  0.5
];
var SOX_FULL_DAY_48 = [
  -4.14,
  -4.23,
  -3.17,
  -2.71,
  -3.66,
  -4.84,
  -6.21,
  -6.28,
  -6.63,
  -6.71,
  -6.73,
  -7.3,
  -6.5,
  -7.22,
  -7.58,
  -7.95,
  -8.29,
  -8.28,
  -9.08,
  -8.69,
  -8.82,
  -8.87,
  -8.64,
  -8.71,
  -8.97,
  -8.8,
  -8.87,
  -8.44,
  -8.39,
  -8.31,
  -8.47,
  -8.14,
  -7.98,
  -8.41,
  -9.01,
  -9.15,
  -9.89,
  -9.34,
  -9.46,
  -9.45,
  -9.91,
  -10.3,
  -10.12,
  -10.42,
  -10.3,
  -10.12,
  -10.56,
  -10.73
];
var KOSPI_FULL_DAY_48 = [
  -3.55,
  -3.61,
  -3.46,
  -3.54,
  -3.76,
  -4.09,
  -4.71,
  -4.36,
  -3.87,
  -3.71,
  -3.54,
  -3.84,
  -4.15,
  -4.37,
  -4.45,
  -4.43,
  -4.34,
  -4.1,
  -4.32,
  -4.58,
  -4.48,
  -4.62,
  -4.76,
  -4.83,
  -5.12,
  -4.97,
  -4.79,
  -4.83,
  -4.88,
  -4.47,
  -4.36,
  -4.45,
  -4.78,
  -4.91,
  -5.02,
  -5.18,
  -5.17,
  -5.15,
  -5.18,
  -5.35,
  -5.47,
  -5.61,
  -5.74,
  -5.92,
  -5.81,
  -5.72,
  -5.54,
  -5.21
];
var KOSPI_REAL_VOLUMES_48 = [
  1,
  0.56,
  0.36,
  0.34,
  0.41,
  0.41,
  0.45,
  0.35,
  0.27,
  0.3,
  0.23,
  0.2,
  0.23,
  0.21,
  0.21,
  0.18,
  0.16,
  0.22,
  0.18,
  0.2,
  0.16,
  0.17,
  0.16,
  0.17,
  0.2,
  0.16,
  0.14,
  0.13,
  0.13,
  0.12,
  0.14,
  0.16,
  0.15,
  0.15,
  0.17,
  0.21,
  0.21,
  0.16,
  0.18,
  0.18,
  0.25,
  0.26,
  0.27,
  0.24,
  0.27,
  0.27,
  0.27,
  0.12
];
var NIKKEI_FULL_DAY_48 = [
  -2.14,
  -2.94,
  -3.07,
  -3.34,
  -3.81,
  -4.37,
  -4.66,
  -4.66,
  -4.04,
  -3.7,
  -3.84,
  -3.94,
  -3.96,
  -4.24,
  -4.29,
  -4.43,
  -4.42,
  -4.34,
  -4.14,
  -4.3,
  -4.47,
  -4.49,
  -4.58,
  -4.28,
  -4.09,
  -4.12,
  -4.27,
  -4.55,
  -4.64,
  -4.73,
  -4.76,
  -4.83,
  -4.74,
  -4.75,
  -4.89,
  -4.9,
  -4.83,
  -4.88,
  -4.81,
  -4.88,
  -4.97,
  -4.81,
  -4.71,
  -4.71,
  -4.77,
  -4.84,
  -4.83,
  -5.06
];
var GOLD_FULL_DAY_48 = [
  -1.39,
  -1.67,
  -2.01,
  -1.98,
  -2.42,
  -2.94,
  -3.4,
  -4.14,
  -3.72,
  -4.37,
  -3.63,
  -4.16,
  -4.12,
  -4.4,
  -3.59,
  -3.44,
  -3.41,
  -3.62,
  -3.12,
  -2.92,
  -2.74,
  -2.8,
  -3.04,
  -2.88,
  -2.52,
  -2.65,
  -2.78,
  -2.99,
  -3.1,
  -3.1,
  -3.46,
  -2.83,
  -3.16,
  -3.37,
  -3.49,
  -3.58,
  -3.74,
  -3.99,
  -4.26,
  -4.3,
  -4.6,
  -4.37,
  -4.39,
  -4.55,
  -4.78,
  -4.36,
  -4.36,
  -4.62
];
var GOLD_REAL_VOLUMES_48 = [
  0.23,
  0.49,
  0.26,
  0.43,
  0.77,
  0.62,
  1,
  0.78,
  0.51,
  0.5,
  0.27,
  0.32,
  0.3,
  0.49,
  0.67,
  0.44,
  0.25,
  0.26,
  0.51,
  0.37,
  0.24,
  0.45,
  0.19,
  0.21,
  0.29,
  0.14,
  0.15,
  0.32,
  0.28,
  0.56,
  0.73,
  0.76,
  0.64,
  1,
  1,
  0.72,
  0.45,
  0.45,
  0.41,
  0.42,
  0.88,
  0.55,
  0.31,
  0.37,
  0.25,
  0.42,
  0.15,
  0.14
];
var NG_FULL_DAY_48 = [
  0.14,
  0.14,
  0.1,
  0.08,
  0.02,
  -0.07,
  -0.16,
  -0.16,
  0.02,
  -0.03,
  0.31,
  -0.12,
  -0.25,
  -0.22,
  -0.33,
  -0.46,
  -1.13,
  -1.61,
  -1.6,
  -2.04,
  -2.46,
  -2.27,
  -2.44,
  -2.16,
  -2.16,
  -2.59,
  -2.62,
  -2.7,
  -2.27,
  -1.77,
  0.26,
  -0.5,
  -1.25,
  -0.99,
  -0.91,
  -0.76,
  0.23,
  0.05,
  -0.24,
  -0.34,
  -0.34,
  1.48,
  2.16,
  2.35,
  2.78,
  2.94,
  3.18,
  3.44
];
var A50_FULL_DAY_48 = [
  -1.51,
  -1.53,
  -1.41,
  -1.59,
  -1.9,
  -2.22,
  -2,
  -1.8,
  -1.9,
  -1.99,
  -1.81,
  -1.74,
  -1.68,
  -1.33,
  -0.49,
  -0.47,
  -0.41,
  -0.35,
  -0.37,
  -0.56,
  -0.67,
  -0.59,
  -0.33,
  -0.53,
  -0.59,
  -0.62,
  -0.61,
  -0.59,
  -0.63,
  -0.63,
  -0.43,
  -0.39,
  -0.25,
  -0.72,
  -0.69,
  -0.66,
  -0.84,
  -0.97,
  -1,
  -1.01,
  -1,
  -1.05,
  -1.07,
  -1.25,
  -1.19,
  -1.29,
  -1.36,
  -1.35
];
var A50_REAL_VOLUMES_48 = [
  0.25,
  1,
  0.49,
  0.47,
  0.4,
  0.61,
  0.14,
  0.14,
  0.14,
  0.19,
  0.51,
  0.32,
  0.39,
  0.65,
  1,
  0.23,
  0.22,
  0.17,
  0.14,
  0.14,
  0.14,
  0.14,
  0.14,
  0.14,
  0.14,
  0.14,
  0.14,
  0.14,
  0.14,
  0.14,
  0.14,
  0.14,
  0.16,
  0.14,
  0.14,
  0.14,
  0.14,
  0.14,
  0.14,
  0.14,
  0.14,
  0.14,
  0.14,
  0.14,
  0.14,
  0.14,
  0.14,
  1
];
function buildRealisticVolumes(points, seedOffset, flatMidStart = -1, flatMidEnd = -1) {
  return points.map((p, i) => {
    const u = i / Math.max(1, points.length - 1);
    const uShape = 0.34 + 0.56 * Math.pow(2 * u - 1, 2);
    const prev = points[i - 1] ?? p;
    const shockBoost = Math.min(0.45, Math.abs(p - prev) * 0.55);
    const wave = 0.08 * Math.sin(i * 1.37 + seedOffset);
    let val = Math.max(0.12, Math.min(1, uShape * 0.68 + shockBoost + wave));
    if (flatMidStart >= 0 && i >= flatMidStart && i <= flatMidEnd) {
      val *= 0.22;
    }
    return Number(val.toFixed(2));
  });
}
var INTEL_V2_DATA = {
  seriesTitle: "11.20 \u76D8\u524D\u98CE\u5411 \xB7 \u52A8\u6001\u7814\u5224\u7248",
  keyDayVideo: {
    memeTitle: "\u4ECA\u5929\u5F88\u5173\u952E",
    danmakuItems: [
      {
        text: "\u5468\u4E00\u558A\u5173\u952E \xB7 \u4ECA\u5929\u771F\u51B3\u6218!",
        color: "#FBBF24",
        y: 128,
        fontSize: 52,
        speed: 4.8,
        offset: 120,
        delay: 0
      },
      {
        text: "\u26A0\uFE0F \u7EB3\u6307 -5.28% \xB7 \u8D39\u534A -10.73%",
        color: "#F87171",
        y: 806,
        fontSize: 52,
        speed: 5.2,
        offset: 160,
        delay: 2
      },
      {
        text: "\u{1F4A5} \u9EC4\u91D1 -4.62% \xB7 \u5929\u7136\u6C14 +3.44%",
        color: "#38BDF8",
        y: 892,
        fontSize: 52,
        speed: 5,
        offset: 95,
        delay: 3
      },
      {
        text: "\u{1F30F} \u65E5\u7ECF -5.06% \xB7 \u97E9\u80A1 -5.21%",
        color: "#34D399",
        y: 978,
        fontSize: 52,
        speed: 4.6,
        offset: 195,
        delay: 4
      },
      {
        text: "\u{1F4CA} A50 \u6025\u63A2 -2.3% \u540E\u9707\u7A33 -1.35%",
        color: "#FEF3C7",
        y: 1802,
        fontSize: 54,
        speed: 5.1,
        offset: 88,
        delay: 5
      }
    ]
  },
  indicesBoard: {
    sectionLabel: "GLOBAL MARKETS \xB7 \u5B9E\u76D8\u65E5K\u4E0E\u5168\u5929\u771F\u5B9E\u5206\u65F6\u6838\u5BF9",
    usHeadline: "\u9694\u591C\u7EB3\u65AF\u8FBE\u514B\u4E0E\u8D39\u534A\u96C6\u4F53\u91CD\u632B",
    usReason: "\u65B0\u4E0A\u5E02 AI \u6982\u5FF5\u75B2\u8F6F\u53E0\u52A0\u9E70\u6D3E\u52A0\u606F\u9884\u671F\u5347\u6E29\uFF0C\u9AD8\u4F4D\u7B97\u529B\u82AF\u7247\u629B\u538B\u96C6\u4E2D\u91CA\u653E\u3002",
    usIndices: [
      {
        id: "nasdaq",
        name: "\u7EB3\u65AF\u8FBE\u514B IXIC",
        changePct: -5.28,
        color: "#38BDF8",
        dailyCandles: [
          { open: 24853.35, high: 24882.04, low: 24460.28, close: 24509.76 },
          { open: 24528.06, high: 24547.66, low: 23989.09, close: 24328.38 },
          { open: 24486.18, high: 24538.78, low: 24225.3, close: 24429.88 },
          { open: 24809.05, high: 24939.62, low: 23870.7, close: 23879.2 },
          { open: 23592.67, high: 23837.76, low: 22513.01, close: 22617.73 }
        ],
        points: NASDAQ_FULL_DAY_48,
        volumes: NASDAQ_REAL_VOLUMES_48
      },
      {
        id: "sox",
        name: "\u8D39\u57CE\u534A\u5BFC\u4F53 SOX",
        changePct: -10.73,
        color: "#2DD4BF",
        dailyCandles: [
          { open: 9685.03, high: 9818.76, low: 9587.11, close: 9610.65 },
          { open: 9698.26, high: 9745.95, low: 9295.02, close: 9642.88 },
          { open: 9788.63, high: 9828.19, low: 9493.93, close: 9652.8 },
          { open: 9938.33, high: 10109.88, low: 9412.19, close: 9419.72 },
          { open: 9160.8, high: 9204.42, low: 8342.21, close: 8408.59 }
        ],
        points: SOX_FULL_DAY_48,
        volumes: buildRealisticVolumes(SOX_FULL_DAY_48, 2.3)
      }
    ],
    asiaHeadline: "\u4E9A\u592A\u79D1\u6280\u6743\u91CD\u540C\u6B65\u4F4E\u5F00\u5355\u8FB9\u4E0B\u63A2",
    asiaReason: "\u53D7\u9694\u591C\u7F8E\u80A1\u534A\u5BFC\u4F53\u91CD\u632B\u4F20\u5BFC\uFF0C\u4E09\u661F\u3001SK\u6D77\u529B\u58EB\u53CA\u65E5\u672C\u79D1\u6280\u6743\u91CD\u4F4E\u5F00\u8D70\u4F4E\u3002",
    asiaIndices: [
      {
        id: "kospi",
        name: "\u97E9\u56FD KOSPI",
        changePct: -5.21,
        color: "#34D399",
        dailyCandles: [
          { open: 5305.4, high: 5327.99, low: 5069.83, close: 5100.5 },
          { open: 5008.09, high: 5084.06, low: 4957, close: 4968.48 },
          { open: 5098.82, high: 5133.14, low: 4943.17, close: 5067.44 },
          { open: 5090.04, high: 5137.89, low: 4963.61, close: 5137.89 },
          { open: 4928.51, high: 4971.31, low: 4831.69, close: 4869.96 }
        ],
        points: KOSPI_FULL_DAY_48,
        volumes: KOSPI_REAL_VOLUMES_48
      },
      {
        id: "nikkei",
        name: "\u65E5\u7ECF 225",
        changePct: -5.06,
        color: "#A78BFA",
        dailyCandles: [
          { open: 61348.21, high: 61389.35, low: 59630.51, close: 59662.02 },
          { open: 59295.8, high: 59369.14, low: 58691.11, close: 58860.43 },
          { open: 59007.4, high: 59630.95, low: 58279.26, close: 59024.28 },
          { open: 59025.19, high: 59660.61, low: 58750.53, close: 59444.21 },
          { open: 58551.56, high: 58707.48, low: 56436.65, close: 56436.65 }
        ],
        points: NIKKEI_FULL_DAY_48,
        volumes: buildRealisticVolumes(NIKKEI_FULL_DAY_48, 4.9, 19, 25)
      }
    ],
    commodityHeadline: "\u5927\u5B97\u5546\u54C1\u663E\u8457\u5F02\u52A8\uFF08WTI\u539F\u6CB9\u5E73\u76D8\u5DF2\u8FC7\u6EE4\uFF09",
    commodityReason: "\u7F8E\u80A1\u66B4\u8DCC\u5F15\u53D1\u9EC4\u91D1\u4FDD\u8BC1\u91D1\u629B\u538B\u6025\u8DCC -4.62%\uFF0C\u7EBD\u7EA6\u5929\u7136\u6C14\u5C3E\u76D8\u62C9\u5347 +3.44%\u3002",
    commodityCharts: {
      gold: {
        id: "gold",
        name: "COMEX \u9EC4\u91D1 GOLD",
        changePct: -4.62,
        color: "#34D399",
        dailyCandles: [
          { open: 3869.7, high: 3904.3, low: 3835.2, close: 3853 },
          { open: 3859.5, high: 3894, low: 3839.2, close: 3864.2 },
          { open: 3855.2, high: 3859.3, low: 3721.8, close: 3741.9 },
          { open: 3730.3, high: 3759.5, low: 3620.6, close: 3685.5 },
          { open: 3633.8, high: 3638.1, low: 3502.9, close: 3515.4 }
        ],
        points: GOLD_FULL_DAY_48,
        volumes: GOLD_REAL_VOLUMES_48
      },
      "nat-gas": {
        id: "nat-gas",
        name: "\u7EBD\u7EA6\u5929\u7136\u6C14 NG",
        changePct: 3.44,
        color: "#F87171",
        dailyCandles: [
          { open: 3.572, high: 3.572, low: 3.484, close: 3.498 },
          { open: 3.498, high: 3.636, low: 3.452, close: 3.579 },
          { open: 3.579, high: 3.803, low: 3.531, close: 3.776 },
          { open: 3.776, high: 3.808, low: 3.659, close: 3.664 },
          { open: 3.664, high: 3.793, low: 3.559, close: 3.79 }
        ],
        points: NG_FULL_DAY_48,
        volumes: buildRealisticVolumes(NG_FULL_DAY_48, 6.8)
      }
    },
    a50Hero: {
      id: "a50",
      name: "\u5BCC\u65F6\u4E2D\u56FD A50",
      changePct: -1.35,
      color: "#FBBF24",
      intradayShapeNote: "\u5206\u65F6\u72B6\u6001\uFF1A\u65E9\u76D8\u6025\u63A2 -2.30% \u89E6\u5E95\uFF0C\u968F\u540E\u7A84\u5E45\u9707\u8361\u56DE\u5347\u4F01\u7A33",
      dailyCandles: [
        { open: 12829, high: 12871, low: 12696, close: 12742 },
        { open: 12746, high: 12785, low: 12611, close: 12662 },
        { open: 12668, high: 12747, low: 12605, close: 12717 },
        { open: 12723, high: 12741, low: 12523, close: 12686 },
        { open: 12697, high: 12710, low: 12394, close: 12515.3 }
      ],
      points: A50_FULL_DAY_48,
      volumes: A50_REAL_VOLUMES_48
    }
  },
  markets: {
    headline: "\u5168\u7403\u5B9E\u76D8\u300C\u65E5K\u4E0E\u771F\u5B9E\u5206\u65F6\u5BF9\u7167\u300D",
    subline: "\u7F8E\u65E5\u97E9\u540C\u6B65\u8DCC\u8D85 5% \xB7 \u5BCC\u65F6 A50 \u6025\u63A2 -2.3% \u540E\u9707\u8361\u6536 -1.35%",
    sparklines: [
      {
        id: "sox",
        name: "\u8D39\u57CE\u534A\u5BFC\u4F53 SOX",
        shortCode: "\u9694\u591C\u6536\u76D8",
        priceText: "8,408",
        changePct: -10.73,
        color: "#2DD4BF",
        points: SOX_FULL_DAY_48,
        tag: "\u82AF\u7247\u91CD\u632B"
      },
      {
        id: "nasdaq",
        name: "\u7EB3\u65AF\u8FBE\u514B IXIC",
        shortCode: "\u9694\u591C\u6536\u76D8",
        priceText: "22,617",
        changePct: -5.28,
        color: "#38BDF8",
        points: NASDAQ_FULL_DAY_48,
        tag: "\u79D1\u6280\u629B\u552E"
      },
      {
        id: "kospi",
        name: "\u97E9\u56FD KOSPI",
        shortCode: "\u6536\u76D8",
        priceText: "4,869",
        changePct: -5.21,
        color: "#34D399",
        points: KOSPI_FULL_DAY_48,
        tag: "\u82AF\u7247\u62D6\u7D2F"
      },
      {
        id: "nikkei",
        name: "\u65E5\u7ECF 225",
        shortCode: "\u6536\u76D8",
        priceText: "56,436",
        changePct: -5.06,
        color: "#A78BFA",
        points: NIKKEI_FULL_DAY_48,
        tag: "\u8DCC\u903E3000\u70B9"
      },
      {
        id: "a50",
        name: "\u5BCC\u65F6\u4E2D\u56FD A50",
        shortCode: "\u671F\u8D27\u5168\u5929",
        priceText: "12,515",
        changePct: -1.35,
        color: "#FBBF24",
        highlight: true,
        points: A50_FULL_DAY_48,
        tag: "\u6025\u63A2\u540E\u4F01\u7A33"
      }
    ],
    a50Callout: "\u65E9\u76D8\u6025\u63A2 -2.30% \u540E\u7A84\u5E45\u9707\u8361\u56DE\u5347 \xB7 \u6536\u4E8E -1.35%",
    commodityWatchlist: [
      {
        id: "gold",
        region: "commodity",
        name: "COMEX \u9EC4\u91D1",
        code: "$3,515/oz",
        priceText: "$3,515",
        changePct: -4.62,
        note: "\u4FDD\u8BC1\u91D1\u6D41\u52A8\u6027\u53D8\u73B0\u629B\u538B \xB7 \u8DCC\u7834 $3,600"
      },
      {
        id: "nat-gas",
        region: "commodity",
        name: "\u7EBD\u7EA6\u5929\u7136\u6C14 NG",
        code: "$3.790/MMBtu",
        priceText: "$3.79",
        changePct: 3.44,
        note: "\u5148\u6291\u540E\u626C \xB7 \u5C3E\u76D8\u9006\u52BF\u62C9\u5347\u8D70\u5F3A"
      },
      {
        id: "crude-oil",
        region: "commodity",
        name: "WTI \u539F\u6CB9",
        code: "$83.41/bbl",
        priceText: "$83.41",
        changePct: 0.24,
        note: "\u5E73\u76D8\u65E0\u5F02\u52A8"
      }
    ]
  },
  event1Flow: {
    kicker: "01 \xB7 \u8D44\u91D1\u4E3A\u4EC0\u4E48\u7A81\u7136\u96C6\u4F53\u627F\u538B\uFF1F",
    bigHeadline: "\u72EC\u89D2\u517D\u62BD\u5E72\u6D41\u52A8\u6027",
    subTag: "Anthropic \u4E0A\u5E02\u8679\u5438 \xD7 \u9AD8\u4F30\u503C\u91CD\u5B9A\u4EF7\u538B\u529B",
    flows: [
      { from: "\u7F8E\u80A1\u9AD8\u4F4D\u79D1\u6280", pct: "-5.28% ~ -10.73%" },
      { from: "\u9AD8\u6D41\u52A8\u9EC4\u91D1\u76D8", pct: "-4.62% \u53D8\u73B0" },
      { from: "A \u80A1\u573A\u5916\u8D44\u91D1", pct: "1.31 \u4E07\u4EBF\u7F29\u91CF" }
    ],
    funnelLabel: "Anthropic IPO\n\u8D85\u7EA7\u5438\u91D1\u6F0F\u6597",
    ashareContext: "\u53E0\u52A0\u6628\u65E5 A \u80A1 68 \u5BB6\u8DCC\u505C\u4F59\u9707\uFF08\u4EC5 23 \u5BB6\u6DA8\u505C\uFF09",
    actionRule: "\u6D41\u52A8\u6027\u8679\u5438\u9636\u6BB5\u5B9C\u5148\u89C2\u5BDF\u524D 30 \u5206\u949F\u8D44\u91D1\u627F\u63A5 \xB7 \u504F\u9632\u5B88\u3001\u5FCC\u76F2\u76EE\u6284\u5E95"
  },
  event2Split: {
    kicker: "02 \xB7 \u79D1\u6280\u786C\u4EF6\u677F\u5757\u5982\u4F55\u5BA2\u89C2\u533A\u5206\uFF1F",
    headline: "\u4E2D\u671F\u7D27\u7F3A\u903B\u8F91 vs \u672A\u91CF\u4EA7\u6982\u5FF5\u98CE\u9669",
    leftFocus: {
      bigNumber: "2028 \u5E74\u4E2D",
      title: "\u5168\u7403 PCB \u786C\u77ED\u7F3A\u9884\u8B66",
      bullets: ["\u82F1\u4F1F\u8FBE Vera Rubin \u8FDB\u9A7B Azure", "\u524D\u671F AI \u786C\u4EF6\u83B7\u8D44\u91D1\u5173\u6CE8\uFF08\u5EB7\u76DB / \u4E2D\u4EAC\uFF09"]
    },
    rightFocus: {
      target: "\u4EAC\u84DD\u79D1\u6280\uFF082T2B\uFF09",
      warning: "\u516C\u544A\u9776\u6750\u5C1A\u672A\u91CF\u4EA7\n\u826F\u7387\u4E0E\u5151\u73B0\u5C1A\u5B58\u4E0D\u786E\u5B9A\u6027",
      stamp: "\u672A\u91CF\u4EA7 \xB7 \u9700\u5BA1\u614E"
    },
    objectiveTakeaway: "\u89C4\u5F8B\u603B\u7ED3\uFF1APCB \u7D27\u7F3A\u5177\u5907\u4E2D\u671F\u666F\u6C14\u652F\u6491\u53EF\u4FDD\u6301\u5173\u6CE8\uFF0C\u4F46\u5728\u5927\u76D8\u79D1\u6280\u627F\u538B\u73AF\u5883\u4E0B\u4E0D\u5B9C\u8FFD\u9AD8"
  },
  event3Portrait: {
    kicker: "03 \xB7 \u673A\u5668\u4EBA\u4EA7\u4E1A\u50AC\u5316\u65F6\u95F4\u8F74\u68B3\u7406",
    headline: "\u884C\u4E1A\u8282\u70B9\u5BC6\u96C6\uFF0C\u4F46\u7F29\u91CF\u671F\u5FCC\u8FFD\u4E00\u81F4",
    milestones: [
      { num: "1\u20132\u6708", desc: "Optimus\u300C\u8DB3\u591F\u771F\u5B9E\u300D\u6F14\u793A + \u8BBF\u6CAA\u9884\u671F" },
      { num: "11.25", desc: "\u5C0F\u9E4F\u79D1\u6280\u65E5 IRON \u4EBA\u5F62\u673A\u5668\u4EAE\u76F8" },
      { num: "12\u201318\u6708", desc: "\u805A\u7126\u5BB6\u52A1\u573A\u666F\uFF08\u5012\u5783\u573E / \u6D17\u7897 / \u6536\u7897\u789F\uFF09" }
    ],
    tacticalWord: "\u4EA7\u4E1A\u50AC\u5316\u8282\u70B9\u5BC6\u96C6\u53EF\u8DDF\u8E2A\uFF0C\u4F46\u7F29\u91CF\u535A\u5F08\u4E0B\u9AD8\u5F00\u4E00\u81F4\u6613\u5206\u6B67\uFF0C\u64CD\u4F5C\u5B9C\u504F\u4FDD\u5B88\u89C2\u5BDF\u3001\u4E0D\u5B9C\u8FFD\u9AD8"
  },
  summaryFinale: {
    title: "11.20 \u76D8\u524D\u5BA2\u89C2\u89C4\u5F8B\u68B3\u7406",
    bulls: [
      "PCB \u7D27\u7F3A\u5EF6\u81F3 2028\uFF08\u666F\u6C14\u5EA6\u53EF\u8DDF\u8E2A\uFF09",
      "11.25 \u5C0F\u9E4F + Optimus \u8282\u70B9\u50AC\u5316\u5BC6\u96C6",
      "\u957F\u946B 50 \u4EBF\u56DE\u8D2D + A50 \u6025\u63A2\u540E\u9707\u8361\u4F01\u7A33"
    ],
    bears: [
      "\u7F8E\u65E5\u97E9\u8DCC\u8D85 5%\uFF08\u7EB3\u6307 -5.28% / \u8D39\u534A -10.73%\uFF09",
      "\u6D41\u52A8\u6027\u6324\u5151 + COMEX \u9EC4\u91D1 -4.62%",
      "68 \u8DCC\u505C\u4F59\u9707 + \u672A\u91CF\u4EA7\u6982\u5FF5\u516C\u544A\u6F84\u6E05\u98CE\u9669"
    ],
    verdictHeadline: "\u5916\u56F4\u91CD\u632B\u53E0\u52A0\u7F29\u91CF \xB7 \u76D8\u524D\u5B9C\u504F\u8C28\u614E\u9632\u5B88",
    verdictAction: "PCB \u7B49\u7D27\u7F3A\u4E3B\u7EBF\u53EF\u8DDF\u8E2A\u89C2\u5BDF\uFF0C\u79D1\u6280\u627F\u538B\u4E0B\u4E0D\u5B9C\u8FFD\u9AD8",
    scenarioTimeLabels: ["09:30", "10:00", "11:30", "14:00", "15:00"],
    scenarioBase: [-1.35, -1.75],
    scenarioSteady: [-1.75, -0.95, -0.82, -0.75],
    scenarioWeak: [-1.75, -2.05, -2.25, -2.18]
  }
};

// src/video/intelV2/intelV2Timeline.ts
var INTEL_V2_CUT_FRAMES = [78, 498, 648, 798, 948];
var INTEL_V2_SHOTS = [
  {
    id: "v2-01-keyday-video",
    index: 1,
    startFrame: 0,
    endFrame: 77,
    startSec: 0,
    endSec: 2.6,
    kind: "v2_keyday_video_intro",
    title: "2.6\u79D2\u6781\u901F\u5F00\u5C4F\uFF1A\u300C\u4ECA\u5929\u5F88\u5173\u952E\u300D\u6CE2\u666E\u52A8\u6548 + \u7CBE\u70BC\u5927\u5B57\u5F39\u5E55 \u2192 \u5149\u5203\u6E05\u5C4F",
    subtitle: "\u5546\u52A1\u6025\u7535\u62AC\u8155\u770B\u8868\u5B9E\u62CD + 5\u9053 52\u201354px \u7CBE\u70BC\u6838\u5FC3\u6570\u636E\u5F39\u5E55 + \u62FC\u8D34\u70B8\u88C2\u300C\u4ECA\u5929\u5F88\u5173\u952E\u300D\u5E76\u6781\u901F\u6E05\u5C4F",
    editorialCraft: "\u96F6\u5E9F\u8BDD\u6781\u901F\u8FDB\u573A + \u5F39\u5E55\u77AC\u65F6\u9F50\u89C8\u5FEB\u6ED1 + \u7ACB\u4F53\u6CE2\u666E\u6807\u9898\u626B\u5149 + \u5149\u5203\u95ED\u5E55\u8F6C\u573A",
    focusGoal: "2.6 \u79D2\u5185\u5B8C\u6210\u5F3A\u7D27\u8FEB\u611F\u5438\u775B\u3001\u6838\u5FC3\u884C\u60C5\u901F\u89C8\u4E0E\u5E72\u51C0\u6E05\u5C4F\u8F6C\u573A\uFF0C\u4E0D\u8017\u8D39\u89C2\u4F17\u8010\u5FC3"
  },
  {
    id: "v2-02-indices-board",
    index: 2,
    startFrame: 78,
    endFrame: 497,
    startSec: 2.6,
    endSec: 16.6,
    kind: "v2_indices_board",
    title: "\u6309\u5F00\u76D8\u65F6\u5E8F\u62C6\u89E3\u5168\u7403\u5B9E\u76D8\u65E5 K \u4E0E\u5168\u5929\u771F\u5B9E\u5206\u65F6\uFF08+1\u79D2\u505C\u987F\u7248\uFF09",
    subtitle: "\u7F8E\u80A1(\u7EB3\u6307-5.28%/\u8D39\u534A-10.73%)\u21921\u79D2\u505C\u987F\u2192\u4E9A\u592A(\u65E5\u97E9)\u2192\u9EC4\u91D1\u5929\u7136\u6C14\u2192\u5BCC\u65F6A50\u6536\u5C3E\u591A\u505C1\u79D2",
    editorialCraft: "\u5B9E\u76D8\u9A8C\u8BC1\u65E5K\u4E0E5m\u5206\u65F6\u66F2\u7EBF + \u9010\u5B57\u6D88\u606F\u9762\u5F52\u56E0\u6253\u5B57\u673A + A50 \u5C55\u6BD5\u5145\u8DB3\u505C\u7559\u7A97",
    focusGoal: "100% \u5BF9\u9F50\u4EA4\u6613\u6240\u771F\u5B9E\u65E5K\u4E0E\u5206\u65F6\u8D70\u5411\uFF0C\u5BA2\u89C2\u5448\u73B0 A50 \u65E9\u76D8\u6025\u63A2 -2.30% \u540E\u9707\u8361\u4F01\u7A33\u72B6\u6001"
  },
  {
    id: "v2-03-funnel",
    index: 3,
    startFrame: 498,
    endFrame: 647,
    startSec: 16.6,
    endSec: 21.6,
    kind: "v2_liquidity_funnel",
    title: "Vox \u526A\u7EB8\u6D41\u5411\u56FE\uFF1AAnthropic \u767E\u4EBF\u62BD\u8840\u6F0F\u6597",
    subtitle: "\u65E0\u4EA4\u53C9\u591A\u8DEF\u7BAD\u5934\u6E05\u6670\u6307\u5411\u6F0F\u6597 \xD7 68\u5BB6\u8DCC\u505C\u4F59\u9707 \xD7 \u4FDD\u5B88\u89C2\u5BDF\u7A97\u53E3\u63D0\u793A",
    editorialCraft: "\u5206\u9053\u4E0D\u4EA4\u53C9\u8D1D\u585E\u5C14\u7BAD\u5934 + \u8367\u5149\u7B14\u91CD\u70B9\u63D0\u793A",
    focusGoal: "\u6E05\u6670\u5448\u73B0\u8D44\u91D1\u62BD\u8840\u65B9\u5411\uFF0C\u63D0\u793A\u76D8\u524D\u5148\u89C2\u671B\u524D 30 \u5206\u949F\u627F\u63A5\u3001\u5FCC\u76F2\u76EE\u6284\u5E95"
  },
  {
    id: "v2-04-spotlight",
    index: 4,
    startFrame: 648,
    endFrame: 797,
    startSec: 21.6,
    endSec: 26.6,
    kind: "v2_dual_spotlight",
    title: "\u53CC\u7126\u805A\u5149\u5207\u5206\uFF1A2028 PCB \u7D27\u7F3A vs \u4EAC\u84DD\u672A\u91CF\u4EA7",
    subtitle: "\u5148\u805A\u7126\u5DE6\u4FA7\u957F\u5468\u671F\u786C\u7F3A\u53E3 \u2192 \u518D\u5207\u53F3\u4FA7\u672A\u91CF\u4EA7\u5BA1\u614E\u6807\u8BC6",
    editorialCraft: "Focus-and-Dim \u5C40\u90E8\u538B\u6697\u5207\u5206 + \u7269\u7406\u5BA1\u614E\u5370\u7AE0",
    focusGoal: "\u5BA2\u89C2\u89C4\u5F8B\uFF1APCB \u7D27\u7F3A\u903B\u8F91\u53EF\u8DDF\u8E2A\uFF0C\u4F46\u5728\u79D1\u6280\u627F\u538B\u73AF\u5883\u4E0B\u4E0D\u5B9C\u76F2\u76EE\u8FFD\u9AD8"
  },
  {
    id: "v2-05-robot",
    index: 5,
    startFrame: 798,
    endFrame: 947,
    startSec: 26.6,
    endSec: 31.6,
    kind: "v2_robot_countdown",
    title: "\u771F\u9A6C\u65AF\u514B\u8096\u50CF\u65F6\u95F4\u8F74\uFF1A1\u20132\u6708 / 11.25 / 12\u201318\u6708",
    subtitle: "\u771F\u4EBA\u8096\u50CF\u53C2\u7167\u751F\u6210\u53A8\u623F\u540C\u6846 \xD7 \u60AC\u6D6E\u65F6\u95F4\u8282\u70B9 \xD7 \u7F29\u91CF\u9AD8\u5F00\u4E00\u81F4\u8C28\u9632\u5206\u6B67",
    editorialCraft: "\u771F\u4EBA\u8096\u50CF\u53C2\u8003\u7EA7\u89C6\u89C9 + \u53BB\u6846\u5316\u60AC\u6D6E\u65F6\u95F4\u6761 + \u4FDD\u5B88\u8282\u594F\u63D0\u793A\u6A2A\u5E45",
    focusGoal: "\u7406\u6E05\u4EA7\u4E1A\u50AC\u5316\u5148\u540E\u987A\u5E8F\uFF0C\u5F3A\u8C03\u7F29\u91CF\u73AF\u5883\u5B9C\u504F\u89C2\u5BDF\u3001\u4E0D\u5B9C\u76F2\u4ECE\u4E00\u81F4\u9AD8\u70B9"
  },
  {
    id: "v2-06-verdict",
    index: 6,
    startFrame: 948,
    endFrame: 1187,
    startSec: 31.6,
    endSec: 39.6,
    kind: "v2_forecast_verdict",
    title: "\u5BA2\u89C2\u89C4\u5F8B\u603B\u89C8 \xD7 10:00 \u5206\u5316\u53CC\u60C5\u666F\u63A8\u6F14",
    subtitle: "\u5229\u597D\u4E0E\u627F\u538B\u5BA2\u89C2\u5BF9\u7167 \xD7 \u5F3A\u627F\u63A5/\u5F31\u9707\u8361\u53CC\u60C5\u666F\u5206\u652F\uFF08\u4E0D\u4F5C\u4E3B\u89C2\u6DA8\u8DCC\u65AD\u8A00\uFF09",
    editorialCraft: "10:00 \u91CF\u80FD\u89C2\u5BDF\u7A97\u53CC\u8DEF\u5F84\u5206\u53C9\u56FE + \u96F6\u906E\u6321\u6807\u6CE8",
    focusGoal: "\u5BA2\u89C2\u603B\u7ED3\u5E02\u573A\u591A\u7A7A\u56E0\u7D20\u4E0E\u4E24\u79CD\u6F14\u5316\u60C5\u666F\uFF0C\u5B88\u4F4F\u5BA1\u614E\u4FDD\u5B88\u7684\u7814\u5224\u8FB9\u754C"
  }
];

// src/video/intelV2/synthIntelV2Audio.ts
function synthesizeIntelV2TrackPcm(sampleRate = 44100, durationSec = INTEL_V2_SPEC.durationSec) {
  const totalSamples = Math.floor(sampleRate * durationSec);
  const left = new Float32Array(totalSamples);
  const right = new Float32Array(totalSamples);
  const bpm = INTEL_V2_SPEC.bpm;
  const beatDur = 60 / bpm;
  const chords = [
    [220, 261.63, 329.63, 440],
    // Am
    [174.61, 220, 261.63, 349.23],
    // Fmaj7
    [196, 246.94, 293.66, 392],
    // G
    [261.63, 329.63, 392, 493.88]
    // Cmaj7
  ];
  const bassRoots = [55, 43.65, 49, 65.41];
  const fps = INTEL_V2_SPEC.fps;
  const shot1 = INTEL_V2_SHOTS[0];
  const shot2 = INTEL_V2_SHOTS[1];
  const shot4 = INTEL_V2_SHOTS[3];
  const cutTimes = INTEL_V2_CUT_FRAMES.map((f) => f / fps);
  const memeImpactSec = (shot1.startFrame + 8) / fps;
  const s2Base = shot2.startFrame;
  const typeWindows = [
    [(s2Base + SHOT2_PART_TIMING.usTypeStart) / fps, (s2Base + SHOT2_PART_TIMING.usTypeEnd) / fps],
    [(s2Base + SHOT2_PART_TIMING.asiaTypeStart) / fps, (s2Base + SHOT2_PART_TIMING.asiaTypeEnd) / fps],
    [(s2Base + SHOT2_PART_TIMING.commodityTypeStart) / fps, (s2Base + SHOT2_PART_TIMING.commodityTypeEnd) / fps],
    [(s2Base + SHOT2_PART_TIMING.a50NoteStart) / fps, (s2Base + SHOT2_PART_TIMING.a50NoteEnd) / fps]
  ];
  const cardPopTimes = [
    (s2Base + SHOT2_PART_TIMING.usStart + 4) / fps,
    (s2Base + SHOT2_PART_TIMING.asiaStart + 2) / fps,
    (s2Base + SHOT2_PART_TIMING.commodityStart + 2) / fps,
    (s2Base + SHOT2_PART_TIMING.a50Start + 4) / fps
  ];
  const spotlightSnapSec = (shot4.startFrame + 70) / fps;
  const stampThudSec = (shot4.startFrame + 90) / fps;
  let lfsr = 1821285621;
  const nextNoise = () => {
    lfsr ^= lfsr << 13;
    lfsr ^= lfsr >>> 17;
    lfsr ^= lfsr << 5;
    return (lfsr >>> 0) / 4294967296 * 2 - 1;
  };
  let lp = 0;
  for (let i = 0; i < totalSamples; i++) {
    const t = i / sampleRate;
    let masterEnv = 1;
    if (t < 0.04) masterEnv = t / 0.04;
    if (t > durationSec - 0.7) masterEnv = Math.max(0, (durationSec - t) / 0.7);
    const beatFloat = t / beatDur;
    const beatIndex = Math.floor(beatFloat);
    const beatPhase = (beatFloat - beatIndex) * beatDur;
    const barIndex = Math.floor(beatIndex / 4);
    const sixteenthFloat = beatFloat * 4;
    const sixteenthIdx = Math.floor(sixteenthFloat);
    const sixteenthPhase = (sixteenthFloat - sixteenthIdx) * (beatDur * 0.25);
    const n = nextNoise();
    lp = lp * 0.75 + n * 0.25;
    let kick = 0;
    if (beatPhase < 0.13) {
      const kEnv = Math.exp(-beatPhase * 28);
      const kFreq = 50 + 95 * Math.exp(-beatPhase * 42);
      kick = Math.sin(2 * Math.PI * kFreq * beatPhase) * kEnv * 0.35;
    }
    let dataTick = 0;
    const inTypeWindow = typeWindows.some(([ws, we]) => t >= ws && t <= we);
    if (inTypeWindow && sixteenthPhase < 0.015) {
      dataTick = Math.sin(2 * Math.PI * (1280 + sixteenthIdx % 4 * 210) * sixteenthPhase) * Math.exp(-sixteenthPhase * 190) * 0.075;
    }
    const chord = chords[barIndex % chords.length];
    const eighthFloat = beatFloat * 2;
    const eighthIdx = Math.floor(eighthFloat);
    const eighthPhase = (eighthFloat - eighthIdx) * (beatDur * 0.5);
    const note = chord[eighthIdx % chord.length];
    const pluck = (Math.sin(2 * Math.PI * note * t) * 0.7 + Math.sin(4 * Math.PI * note * t) * 0.16) * Math.exp(-eighthPhase * 6.5) * 0.17;
    const pan = (eighthIdx % 4 - 1.5) * 0.22;
    const bassFreq = bassRoots[barIndex % bassRoots.length];
    const bass = Math.sin(2 * Math.PI * bassFreq * t) * Math.exp(-beatPhase * 4.2) * 0.24;
    let sfx = 0;
    const dMeme = t - memeImpactSec;
    if (dMeme >= 0 && dMeme < 0.34) {
      sfx += Math.sin(2 * Math.PI * (165 * Math.exp(-dMeme * 14) + 48) * dMeme) * Math.exp(-dMeme * 12) * 0.48;
      sfx += lp * Math.exp(-dMeme * 18) * 0.14;
    }
    for (let p = 0; p < cardPopTimes.length; p++) {
      const dp = t - cardPopTimes[p];
      if (dp >= 0 && dp < 0.18) {
        sfx += Math.sin(2 * Math.PI * (440 + p * 85) * dp) * Math.exp(-dp * 22) * 0.14;
      }
    }
    const dl = t - spotlightSnapSec;
    if (dl >= 0 && dl < 0.09) {
      sfx += ((n - lp) * 0.25 + Math.sin(2 * Math.PI * 980 * dl) * 0.2) * Math.exp(-dl * 45);
    }
    const dt = t - stampThudSec;
    if (dt >= 0 && dt < 0.22) {
      sfx += (Math.sin(2 * Math.PI * 76 * dt) * 0.6 + lp * 0.35) * Math.exp(-dt * 22);
    }
    for (let c = 0; c < cutTimes.length; c++) {
      const dc = t - cutTimes[c];
      if (dc >= -0.04 && dc <= 0.22) {
        const env = dc < 0 ? (dc + 0.04) / 0.04 : Math.exp(-dc * 12);
        sfx += lp * env * 0.2;
      }
    }
    const mixL = (kick + dataTick + pluck * (1 - pan) + bass + sfx) * masterEnv;
    const mixR = (kick + dataTick + pluck * (1 + pan) + bass + sfx) * masterEnv;
    left[i] = Math.tanh(mixL * 0.92);
    right[i] = Math.tanh(mixR * 0.92);
  }
  return { sampleRate, left, right };
}

// src/video/engine/timeline.ts
var DEFAULT_MARKET_BOARD_TIMING = {
  usStart: 0,
  usHeadlineFrame: 16,
  usTypeStart: 26,
  usTypeEnd: 86,
  asiaStart: 116,
  asiaTypeStart: 134,
  asiaTypeEnd: 188,
  commodityStart: 214,
  commodityTypeStart: 232,
  commodityTypeEnd: 284,
  a50Start: 302,
  a50NoteStart: 332,
  a50NoteEnd: 364
};
function resolveMarketBoardTiming(partial) {
  return {
    ...DEFAULT_MARKET_BOARD_TIMING,
    ...partial ?? {}
  };
}
function compileEpisodeTimeline(episode) {
  const fps = episode.spec.fps || 30;
  let cursor = 0;
  const shots = [];
  const cutFrames = [];
  episode.scenes.forEach((scene, idx) => {
    const dur = Math.max(1, Math.round(scene.durationFrames));
    const startFrame = cursor;
    const endFrame = cursor + dur - 1;
    if (idx > 0) {
      cutFrames.push(startFrame);
    }
    shots.push({
      id: scene.id,
      index: idx + 1,
      kind: scene.kind,
      startFrame,
      endFrame,
      durationFrames: dur,
      startSec: Number((startFrame / fps).toFixed(3)),
      endSec: Number(((endFrame + 1) / fps).toFixed(3)),
      title: scene.title,
      subtitle: scene.subtitle,
      editorialCraft: scene.editorialCraft,
      focusGoal: scene.focusGoal,
      scene
    });
    cursor += dur;
  });
  const totalFrames = Math.max(1, cursor);
  return {
    episodeId: episode.id,
    fps,
    width: episode.spec.width,
    height: episode.spec.height,
    bpm: episode.spec.bpm,
    totalFrames,
    durationSec: Number((totalFrames / fps).toFixed(3)),
    cutFrames,
    shots
  };
}

// src/video/engine/audioSynth.ts
function synthesizeEpisodeAudioPcm(episode, sampleRate = 44100) {
  const tl = compileEpisodeTimeline(episode);
  const durationSec = tl.durationSec;
  const totalSamples = Math.floor(sampleRate * durationSec);
  const left = new Float32Array(totalSamples);
  const right = new Float32Array(totalSamples);
  const bpm = tl.bpm || 112;
  const beatDur = 60 / bpm;
  const fps = tl.fps || 30;
  const chords = [
    [220, 261.63, 329.63, 440],
    // Am
    [174.61, 220, 261.63, 349.23],
    // Fmaj7
    [196, 246.94, 293.66, 392],
    // G
    [261.63, 329.63, 392, 493.88]
    // Cmaj7
  ];
  const bassRoots = [55, 43.65, 49, 65.41];
  const cutTimes = tl.cutFrames.map((f) => f / fps);
  const memeImpactSecs = [];
  const typeWindows = [];
  const cardPopTimes = [];
  const spotlightSnapSecs = [];
  const stampThudSecs = [];
  for (const shot of tl.shots) {
    if (shot.scene.kind === "hook_live_video") {
      memeImpactSecs.push((shot.startFrame + 8) / fps);
    } else if (shot.scene.kind === "market_chrono_board") {
      const timing = resolveMarketBoardTiming(shot.scene.data.timing);
      const base = shot.startFrame;
      typeWindows.push(
        [(base + timing.usTypeStart) / fps, (base + timing.usTypeEnd) / fps],
        [(base + timing.asiaTypeStart) / fps, (base + timing.asiaTypeEnd) / fps],
        [(base + timing.commodityTypeStart) / fps, (base + timing.commodityTypeEnd) / fps],
        [(base + timing.a50NoteStart) / fps, (base + timing.a50NoteEnd) / fps]
      );
      cardPopTimes.push(
        { t: (base + timing.usStart + 4) / fps, pitchIdx: 0 },
        { t: (base + timing.asiaStart + 2) / fps, pitchIdx: 1 },
        { t: (base + timing.commodityStart + 2) / fps, pitchIdx: 2 },
        { t: (base + timing.a50Start + 4) / fps, pitchIdx: 3 }
      );
    } else if (shot.scene.kind === "event_dual_spotlight") {
      const switchF = shot.scene.data.switchFrame ?? 70;
      const stampF = shot.scene.data.stampFrame ?? 90;
      spotlightSnapSecs.push((shot.startFrame + switchF) / fps);
      stampThudSecs.push((shot.startFrame + stampF) / fps);
    } else if (shot.scene.kind === "animated_poster_stage") {
      shot.scene.data.beats.forEach((beat, bIdx) => {
        const beatAbsSec = (shot.startFrame + beat.enterFrame) / fps;
        if (beat.sfx === "snap") {
          spotlightSnapSecs.push(beatAbsSec);
        } else if (beat.sfx === "stamp") {
          spotlightSnapSecs.push(beatAbsSec);
          stampThudSecs.push((shot.startFrame + beat.enterFrame + 6) / fps);
        } else {
          cardPopTimes.push({ t: beatAbsSec, pitchIdx: bIdx % 4 });
        }
        if (beat.stampText && beat.sfx !== "stamp") {
          stampThudSecs.push((shot.startFrame + beat.enterFrame + 6) / fps);
        }
      });
    }
  }
  let lfsr = 1821285621;
  const nextNoise = () => {
    lfsr ^= lfsr << 13;
    lfsr ^= lfsr >>> 17;
    lfsr ^= lfsr << 5;
    return (lfsr >>> 0) / 4294967296 * 2 - 1;
  };
  let lp = 0;
  for (let i = 0; i < totalSamples; i++) {
    const t = i / sampleRate;
    let masterEnv = 1;
    if (t < 0.04) masterEnv = t / 0.04;
    if (t > durationSec - 0.7) masterEnv = Math.max(0, (durationSec - t) / 0.7);
    const beatFloat = t / beatDur;
    const beatIndex = Math.floor(beatFloat);
    const beatPhase = (beatFloat - beatIndex) * beatDur;
    const barIndex = Math.floor(beatIndex / 4);
    const sixteenthFloat = beatFloat * 4;
    const sixteenthIdx = Math.floor(sixteenthFloat);
    const sixteenthPhase = (sixteenthFloat - sixteenthIdx) * (beatDur * 0.25);
    const n = nextNoise();
    lp = lp * 0.75 + n * 0.25;
    let kick = 0;
    if (beatPhase < 0.13) {
      const kEnv = Math.exp(-beatPhase * 28);
      const kFreq = 50 + 95 * Math.exp(-beatPhase * 42);
      kick = Math.sin(2 * Math.PI * kFreq * beatPhase) * kEnv * 0.35;
    }
    let dataTick = 0;
    const inTypeWindow = typeWindows.some(([ws, we]) => t >= ws && t <= we);
    if (inTypeWindow && sixteenthPhase < 0.015) {
      dataTick = Math.sin(2 * Math.PI * (1280 + sixteenthIdx % 4 * 210) * sixteenthPhase) * Math.exp(-sixteenthPhase * 190) * 0.075;
    }
    const chord = chords[barIndex % chords.length];
    const eighthFloat = beatFloat * 2;
    const eighthIdx = Math.floor(eighthFloat);
    const eighthPhase = (eighthFloat - eighthIdx) * (beatDur * 0.5);
    const note = chord[eighthIdx % chord.length];
    const pluck = (Math.sin(2 * Math.PI * note * t) * 0.7 + Math.sin(4 * Math.PI * note * t) * 0.16) * Math.exp(-eighthPhase * 6.5) * 0.17;
    const pan = (eighthIdx % 4 - 1.5) * 0.22;
    const bassFreq = bassRoots[barIndex % bassRoots.length];
    const bass = Math.sin(2 * Math.PI * bassFreq * t) * Math.exp(-beatPhase * 4.2) * 0.24;
    let sfx = 0;
    for (let m = 0; m < memeImpactSecs.length; m++) {
      const dMeme = t - memeImpactSecs[m];
      if (dMeme >= 0 && dMeme < 0.34) {
        sfx += Math.sin(2 * Math.PI * (165 * Math.exp(-dMeme * 14) + 48) * dMeme) * Math.exp(-dMeme * 12) * 0.48;
        sfx += lp * Math.exp(-dMeme * 18) * 0.14;
      }
    }
    for (let p = 0; p < cardPopTimes.length; p++) {
      const dp = t - cardPopTimes[p].t;
      if (dp >= 0 && dp < 0.18) {
        sfx += Math.sin(2 * Math.PI * (440 + cardPopTimes[p].pitchIdx * 85) * dp) * Math.exp(-dp * 22) * 0.14;
      }
    }
    for (let s = 0; s < spotlightSnapSecs.length; s++) {
      const dl = t - spotlightSnapSecs[s];
      if (dl >= 0 && dl < 0.09) {
        sfx += ((n - lp) * 0.25 + Math.sin(2 * Math.PI * 980 * dl) * 0.2) * Math.exp(-dl * 45);
      }
    }
    for (let s = 0; s < stampThudSecs.length; s++) {
      const dt = t - stampThudSecs[s];
      if (dt >= 0 && dt < 0.22) {
        sfx += (Math.sin(2 * Math.PI * 76 * dt) * 0.6 + lp * 0.35) * Math.exp(-dt * 22);
      }
    }
    for (let c = 0; c < cutTimes.length; c++) {
      const dc = t - cutTimes[c];
      if (dc >= -0.04 && dc <= 0.22) {
        const env = dc < 0 ? (dc + 0.04) / 0.04 : Math.exp(-dc * 12);
        sfx += lp * env * 0.2;
      }
    }
    const mixL = (kick + dataTick + pluck * (1 - pan) + bass + sfx) * masterEnv;
    const mixR = (kick + dataTick + pluck * (1 + pan) + bass + sfx) * masterEnv;
    left[i] = Math.tanh(mixL * 0.92);
    right[i] = Math.tanh(mixR * 0.92);
  }
  return { sampleRate, left, right };
}

// server.ts
var execFileAsync = promisify(execFile);
var PORT = Number(process.env.PORT || 3e3);
var EPISODE_ID_RE = /^[A-Za-z0-9_-]+$/;
var episodesRootDir = path.resolve(process.cwd(), "episodes");
var assetsRootDir = path.resolve(process.cwd(), "assets");
var cachedFfmpegBinary;
function probeFfmpegBinary(candidate) {
  try {
    const res = spawnSync(candidate, ["-version"], {
      stdio: "ignore",
      timeout: 5e3,
      windowsHide: true
    });
    return !res.error && res.status === 0;
  } catch {
    return false;
  }
}
function resolveFfmpegBinary() {
  if (cachedFfmpegBinary !== void 0) {
    return cachedFfmpegBinary;
  }
  const candidates = [];
  const envPath = process.env.FFMPEG_PATH?.trim();
  if (envPath) {
    candidates.push(envPath);
  }
  candidates.push("ffmpeg");
  if (process.platform === "win32") {
    candidates.push("ffmpeg.exe");
  }
  if (fs.existsSync("/usr/bin/ffmpeg")) {
    candidates.push("/usr/bin/ffmpeg");
  }
  for (const candidate of candidates) {
    if (probeFfmpegBinary(candidate)) {
      cachedFfmpegBinary = candidate;
      return cachedFfmpegBinary;
    }
  }
  cachedFfmpegBinary = null;
  return null;
}
function isValidEpisodeId(id) {
  return EPISODE_ID_RE.test(id);
}
function getEpisodeManifestPath(id) {
  return path.join(episodesRootDir, id, "episode.json");
}
function loadEpisodeManifest(id) {
  if (!isValidEpisodeId(id)) return null;
  const manifestPath = getEpisodeManifestPath(id);
  if (!fs.existsSync(manifestPath)) return null;
  const raw = fs.readFileSync(manifestPath, "utf-8");
  return JSON.parse(raw);
}
function isValidEpisodeManifestBody(body) {
  if (!body || typeof body !== "object") return false;
  const obj = body;
  const spec = obj.spec;
  if (!spec || typeof spec !== "object") return false;
  if (typeof spec.width !== "number" || !Number.isFinite(spec.width) || spec.width <= 0 || typeof spec.height !== "number" || !Number.isFinite(spec.height) || spec.height <= 0 || typeof spec.fps !== "number" || !Number.isFinite(spec.fps) || spec.fps <= 0) {
    return false;
  }
  if (!Array.isArray(obj.scenes) || obj.scenes.length === 0) return false;
  for (const scene of obj.scenes) {
    if (!scene || typeof scene !== "object") return false;
    const s = scene;
    if (typeof s.id !== "string" || !s.id.trim() || typeof s.kind !== "string" || typeof s.durationFrames !== "number" || !Number.isFinite(s.durationFrames) || s.durationFrames <= 0) {
      return false;
    }
  }
  return true;
}
var sessions = /* @__PURE__ */ new Map();
setInterval(() => {
  const now = Date.now();
  for (const [id, sess] of sessions.entries()) {
    if (now - sess.createdAt > 20 * 60 * 1e3) {
      fs.rmSync(sess.dir, { recursive: true, force: true });
      sessions.delete(id);
    }
  }
}, 5 * 60 * 1e3).unref();
async function startServer() {
  const app = express();
  app.use(express.json({ limit: "80mb" }));
  app.use("/episodes", express.static(episodesRootDir));
  app.use("/assets", express.static(assetsRootDir));
  app.get("/api/health", (_req, res) => {
    const ffmpegBin = resolveFfmpegBinary();
    res.json({ ok: true, ffmpeg: Boolean(ffmpegBin), ffmpegPath: ffmpegBin ?? null });
  });
  app.get("/api/episodes", (_req, res) => {
    try {
      if (!fs.existsSync(episodesRootDir)) {
        res.json({ episodes: [] });
        return;
      }
      const entries = fs.readdirSync(episodesRootDir, { withFileTypes: true });
      const episodes = [];
      for (const entry of entries) {
        if (!entry.isDirectory() || !isValidEpisodeId(entry.name)) continue;
        const manifestPath = getEpisodeManifestPath(entry.name);
        if (!fs.existsSync(manifestPath)) continue;
        try {
          const raw = fs.readFileSync(manifestPath, "utf-8");
          const episode = JSON.parse(raw);
          if (!isValidEpisodeManifestBody(episode)) continue;
          const tl = compileEpisodeTimeline(episode);
          const hookScene = episode.scenes.find((s) => s.kind === "hook_live_video");
          const firstPosterScene = episode.scenes.find(
            (s) => s.kind === "animated_poster_stage"
          );
          episodes.push({
            id: episode.id || entry.name,
            date: episode.date || entry.name,
            title: episode.title || entry.name,
            seriesTitle: episode.seriesTitle || "",
            description: episode.description || "",
            totalFrames: tl.totalFrames,
            durationSec: tl.durationSec,
            fps: tl.fps,
            bpm: tl.bpm,
            width: tl.width,
            height: tl.height,
            shotCount: tl.shots.length,
            hookId: hookScene?.kind === "hook_live_video" ? hookScene.data.hookId : void 0,
            posterSrc: hookScene?.kind === "hook_live_video" ? hookScene.data.posterSrc : firstPosterScene?.kind === "animated_poster_stage" ? firstPosterScene.data.imageSrc : void 0
          });
        } catch {
        }
      }
      episodes.sort((a, b) => {
        const byDate = b.date.localeCompare(a.date);
        return byDate !== 0 ? byDate : b.id.localeCompare(a.id);
      });
      res.json({ episodes });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to list episodes";
      res.status(500).json({ error: message });
    }
  });
  app.get("/api/episodes/:id", (req, res) => {
    const id = String(req.params.id || "");
    if (!isValidEpisodeId(id)) {
      res.status(400).json({ error: "Invalid episode id" });
      return;
    }
    try {
      const episode = loadEpisodeManifest(id);
      if (!episode) {
        res.status(404).json({ error: `Episode "${id}" not found` });
        return;
      }
      res.json(episode);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to read episode";
      res.status(500).json({ error: message });
    }
  });
  app.post("/api/episodes/:id", (req, res) => {
    const id = String(req.params.id || "");
    if (!isValidEpisodeId(id)) {
      res.status(400).json({ error: "Invalid episode id" });
      return;
    }
    if (!isValidEpisodeManifestBody(req.body)) {
      res.status(400).json({ error: "Invalid EpisodeManifest payload" });
      return;
    }
    try {
      const targetDir = path.join(episodesRootDir, id);
      fs.mkdirSync(targetDir, { recursive: true });
      const manifest = {
        ...req.body,
        id
      };
      fs.writeFileSync(
        path.join(targetDir, "episode.json"),
        `${JSON.stringify(manifest, null, 2)}
`,
        "utf-8"
      );
      res.json({ ok: true, id });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to save episode";
      res.status(500).json({ error: message });
    }
  });
  app.get("/api/hooks", (_req, res) => {
    try {
      const hooksManifestPath = path.join(assetsRootDir, "hooks", "manifest.json");
      if (!fs.existsSync(hooksManifestPath)) {
        res.status(404).json({ error: "Hooks manifest not found" });
        return;
      }
      const raw = fs.readFileSync(hooksManifestPath, "utf-8");
      res.json(JSON.parse(raw));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load hooks manifest";
      res.status(500).json({ error: message });
    }
  });
  app.get("/api/audio/bgm.wav", (req, res) => {
    const episodeId = typeof req.query.episodeId === "string" ? req.query.episodeId.trim() : "";
    if (episodeId) {
      if (!isValidEpisodeId(episodeId)) {
        res.status(400).json({ error: "Invalid episodeId" });
        return;
      }
      try {
        const episode = loadEpisodeManifest(episodeId);
        if (!episode) {
          res.status(404).json({ error: `Episode "${episodeId}" not found` });
          return;
        }
        const pcm2 = synthesizeEpisodeAudioPcm(episode, 44100);
        const wav2 = encodeStereoWav(pcm2);
        res.setHeader("Content-Type", "audio/wav");
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="${episodeId}_editorial_bgm.wav"`
        );
        res.send(Buffer.from(wav2));
        return;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to synthesize episode audio";
        res.status(500).json({ error: message });
        return;
      }
    }
    const track = String(req.query.track || "1120_v2");
    const pcm = track === "1120_v2" ? synthesizeIntelV2TrackPcm(44100) : track === "1120" ? synthesizeIntelTrackPcm(44100) : synthesizeTrackPcm(44100);
    const wav = encodeStereoWav(pcm);
    const filename = track === "1120_v2" ? "1120_v2_112bpm_editorial.wav" : track === "1120" ? "1120_108bpm_editorial_mix.wav" : "1117_129.2bpm_bgm.wav";
    res.setHeader("Content-Type", "audio/wav");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(Buffer.from(wav));
  });
  app.post("/api/export/init", (req, res) => {
    const {
      totalFrames = 900,
      width = 1080,
      height = 1920,
      fps = 30,
      track = "1120",
      episodeId
    } = req.body ?? {};
    let validatedEpisodeId;
    let resolvedFps = Number(fps) > 0 ? Number(fps) : 30;
    if (typeof episodeId === "string" && episodeId.trim()) {
      const cleanId = episodeId.trim();
      if (!isValidEpisodeId(cleanId)) {
        res.status(400).json({ error: "Invalid episodeId" });
        return;
      }
      const episode = loadEpisodeManifest(cleanId);
      if (!episode) {
        res.status(404).json({ error: `Episode "${cleanId}" not found` });
        return;
      }
      validatedEpisodeId = cleanId;
      if (!req.body?.fps && episode.spec?.fps > 0) {
        resolvedFps = episode.spec.fps;
      }
    }
    const sessionId = crypto.randomUUID();
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), `quantreel-${sessionId}-`));
    sessions.set(sessionId, {
      dir,
      totalFrames: Number(totalFrames),
      width: Number(width),
      height: Number(height),
      fps: resolvedFps,
      track: String(track),
      episodeId: validatedEpisodeId,
      receivedFrames: 0,
      createdAt: Date.now()
    });
    res.json({ sessionId });
  });
  app.post("/api/export/:sessionId/frames", (req, res) => {
    const sess = sessions.get(req.params.sessionId);
    if (!sess) {
      res.status(404).json({ error: "Export session not found" });
      return;
    }
    const frames = req.body?.frames ?? [];
    for (const item of frames) {
      const base64 = item.dataUrl.replace(/^data:image\/\w+;base64,/, "");
      const buf = Buffer.from(base64, "base64");
      const fileName = `frame_${String(item.index).padStart(4, "0")}.jpg`;
      fs.writeFileSync(path.join(sess.dir, fileName), buf);
      sess.receivedFrames++;
    }
    res.json({ receivedFrames: sess.receivedFrames });
  });
  app.post("/api/export/:sessionId/finalize", async (req, res) => {
    const sess = sessions.get(req.params.sessionId);
    if (!sess) {
      res.status(404).json({ error: "Export session not found" });
      return;
    }
    const ffmpegBin = resolveFfmpegBinary();
    if (!ffmpegBin) {
      res.status(503).json({
        error: "FFmpeg binary not available on server; please use browser WebCodecs fallback."
      });
      return;
    }
    try {
      const wavPath = path.join(sess.dir, "bgm.wav");
      const mp4Path = path.join(sess.dir, "output.mp4");
      let pcm;
      if (sess.episodeId) {
        const episode = loadEpisodeManifest(sess.episodeId);
        if (!episode) {
          res.status(404).json({ error: `Episode "${sess.episodeId}" not found` });
          return;
        }
        pcm = synthesizeEpisodeAudioPcm(episode, 44100);
      } else {
        pcm = sess.track === "1120_v2" ? synthesizeIntelV2TrackPcm(44100) : sess.track === "1120" ? synthesizeIntelTrackPcm(44100) : synthesizeTrackPcm(44100);
      }
      const wav = encodeStereoWav(pcm);
      fs.writeFileSync(wavPath, Buffer.from(wav));
      await execFileAsync(ffmpegBin, [
        "-y",
        "-framerate",
        String(sess.fps || 30),
        "-i",
        path.join(sess.dir, "frame_%04d.jpg"),
        "-i",
        wavPath,
        "-vf",
        "scale=trunc(iw/2)*2:trunc(ih/2)*2",
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        "-crf",
        "18",
        "-preset",
        "veryfast",
        "-c:a",
        "aac",
        "-b:a",
        "192k",
        "-movflags",
        "+faststart",
        "-shortest",
        mp4Path
      ]);
      const stat = fs.statSync(mp4Path);
      sess.mp4Path = mp4Path;
      res.json({
        ok: true,
        sizeBytes: stat.size,
        downloadUrl: `/api/export/${req.params.sessionId}/download`
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "FFmpeg render failed";
      res.status(500).json({ error: message });
    }
  });
  app.get("/api/export/:sessionId/download", (req, res) => {
    const sess = sessions.get(req.params.sessionId);
    if (!sess?.mp4Path || !fs.existsSync(sess.mp4Path)) {
      res.status(404).json({ error: "Rendered MP4 not found" });
      return;
    }
    const downloadName = sess.episodeId ? `${sess.episodeId}_morning_intel_final.mp4` : sess.track === "1120_v2" ? "1120_v2_morning_intel_final.mp4" : sess.track === "1120" ? "1120_morning_intel_final.mp4" : "1117_close_fund_flow_replica.mp4";
    res.download(sess.mp4Path, downloadName);
  });
  app.use("/api", (_req, res) => {
    res.status(404).json({ error: "API route not found" });
  });
  app.use(
    "/api",
    (err, _req, res, _next) => {
      const message = err instanceof Error ? err.message : "Server API error";
      res.status(500).json({ error: message });
    }
  );
  if (process.env.NODE_ENV === "production") {
    const distDir = path.resolve(process.cwd(), "dist");
    app.use(express.static(distDir));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distDir, "index.html"));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  }
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`QuantReel Studio listening on http://0.0.0.0:${PORT}`);
  });
}
startServer();
export {
  resolveFfmpegBinary
};
