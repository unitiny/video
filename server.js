// server.ts
import express from "express";
import fs3 from "fs";
import path3 from "path";
import os2 from "os";
import crypto from "crypto";
import { execFile, spawnSync as spawnSync2 } from "child_process";
import { promisify } from "util";
import { GoogleGenAI } from "@google/genai";

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
  if (episode.audio?.mood === "cinema_impact") {
    return synthesizeCinemaImpactAudioPcm(episode, sampleRate);
  }
  if (episode.audio) {
    return synthesizeStudioV3AudioPcm(episode, sampleRate);
  }
  return synthesizeLegacyEpisodeAudioPcm(episode, sampleRate);
}
function synthesizeLegacyEpisodeAudioPcm(episode, sampleRate = 44100) {
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
var STUDIO_MOODS = {
  editorial_lofi: {
    // Warm Bloomberg/Financial-Times Rhodes jazz-electronic progression (Dm9 - Bbmaj7 - Gm9 - A7sus4)
    chords: [
      [293.66, 349.23, 440, 523.25],
      [233.08, 293.66, 349.23, 440],
      [196, 233.08, 293.66, 349.23],
      [220, 293.66, 329.63, 392]
    ],
    bassRoots: [73.42, 58.27, 49, 55],
    padGain: 0.14,
    hatGain: 0.055,
    kickGain: 0.28
  },
  tense_pulse: {
    // Minor urgent pulse (Cm9 - Abmaj7 - Fm9 - Gsus4)
    chords: [
      [261.63, 311.13, 392, 466.16],
      [207.65, 261.63, 311.13, 392],
      [174.61, 207.65, 261.63, 311.13],
      [196, 261.63, 293.66, 349.23]
    ],
    bassRoots: [65.41, 51.91, 43.65, 49],
    padGain: 0.12,
    hatGain: 0.07,
    kickGain: 0.34
  },
  catalyst_drive: {
    // Uplifting futuristic tech progression (Em9 - Cmaj7 - Dadd9 - Bm7)
    chords: [
      [329.63, 392, 493.88, 587.33],
      [261.63, 329.63, 392, 493.88],
      [293.66, 369.99, 440, 587.33],
      [246.94, 293.66, 369.99, 440]
    ],
    bassRoots: [82.41, 65.41, 73.42, 61.74],
    padGain: 0.15,
    hatGain: 0.065,
    kickGain: 0.31
  },
  cinema_impact: {
    // High-energy cinematic broadcast progression (Dm - Bb - C - A)
    chords: [
      [293.66, 349.23, 440, 587.33],
      [233.08, 293.66, 349.23, 466.16],
      [261.63, 329.63, 392, 523.25],
      [220, 277.18, 329.63, 440]
    ],
    bassRoots: [73.42, 58.27, 65.41, 55],
    padGain: 0.2,
    hatGain: 0.1,
    kickGain: 0.44
  }
};
function synthesizeCinemaImpactAudioPcm(episode, sampleRate = 44100) {
  const tl = compileEpisodeTimeline(episode);
  const durationSec = tl.durationSec;
  const totalSamples = Math.floor(sampleRate * durationSec);
  const left = new Float32Array(totalSamples);
  const right = new Float32Array(totalSamples);
  const bpm = tl.bpm || 122;
  const beatDur = 60 / bpm;
  const fps = tl.fps || 30;
  const enableAudioLogo = episode.audio?.audioLogo !== false;
  const chords = [
    [293.66, 349.23, 440, 587.33],
    [233.08, 293.66, 349.23, 466.16],
    [261.63, 329.63, 392, 523.25],
    [220, 277.18, 329.63, 440]
  ];
  const bassRoots = [73.42, 58.27, 65.41, 55];
  const cutTimes = tl.cutFrames.map((f) => f / fps);
  const impactSlams = [];
  const whooshEvents = [];
  const chimeEvents = [];
  const typeWindows = [];
  const rocketRumbles = [];
  const shotRanges = [];
  for (const shot of tl.shots) {
    const base = shot.startFrame;
    const sStart = shot.startSec;
    const sEnd = shot.endSec;
    if (shot.scene.kind === "hook_live_video") {
      shotRanges.push({ start: sStart, end: sEnd, energy: 1.2, fullDrums: true });
      if (shot.scene.data.hookStyle === "v4_reversal_cut") {
        const cutF = shot.scene.data.reversalConfig?.cutFrame ?? 37;
        impactSlams.push(
          { t: (base + 2) / fps, gain: 0.46 },
          { t: (base + cutF) / fps, gain: 0.68 }
        );
        whooshEvents.push(
          { t: (base + cutF - 2) / fps, pitch: 1180 },
          { t: (base + shot.durationFrames - 8) / fps, pitch: 920 }
        );
        chimeEvents.push(
          { t: (base + cutF + 2) / fps, freq: 783.99, gain: 0.24 },
          { t: (base + cutF + 6) / fps, freq: 1046.5, gain: 0.24 }
        );
      } else {
        impactSlams.push({ t: (base + 7) / fps, gain: 0.62 });
        if (shot.scene.data.memeCard) {
          const mf = base + shot.scene.data.memeCard.enterFrame;
          chimeEvents.push(
            { t: mf / fps, freq: 783.99, gain: 0.22 },
            { t: (mf + 3) / fps, freq: 1046.5, gain: 0.2 }
          );
        }
        whooshEvents.push({ t: (base + shot.durationFrames - 10) / fps, pitch: 900 });
      }
    } else if (shot.scene.kind === "market_chrono_board") {
      shotRanges.push({ start: sStart, end: sEnd, energy: 0.96, fullDrums: true });
      const timing = resolveMarketBoardTiming(shot.scene.data.timing);
      if (!shot.scene.data.safeInset) {
        typeWindows.push(
          [(base + timing.usTypeStart) / fps, (base + timing.usTypeEnd) / fps],
          [(base + timing.asiaTypeStart) / fps, (base + timing.asiaTypeEnd) / fps],
          [(base + timing.commodityTypeStart) / fps, (base + timing.commodityTypeEnd) / fps],
          [(base + timing.a50NoteStart) / fps, (base + timing.a50NoteEnd) / fps]
        );
      }
      chimeEvents.push(
        { t: (base + timing.usStart + 3) / fps, freq: 523.25, gain: 0.16 },
        { t: (base + timing.asiaStart + 2) / fps, freq: 587.33, gain: 0.16 },
        { t: (base + timing.commodityStart + 2) / fps, freq: 659.25, gain: 0.15 },
        { t: (base + timing.a50Start + 3) / fps, freq: 783.99, gain: 0.2 }
      );
      impactSlams.push({ t: (base + timing.a50Start) / fps, gain: 0.42 });
    } else if (shot.scene.kind === "animated_poster_stage") {
      const style = shot.scene.data.presentationStyle;
      shotRanges.push({ start: sStart, end: sEnd, energy: 1.14, fullDrums: true });
      if (style === "v4_slice_inflation") {
        whooshEvents.push(
          { t: (base + 40) / fps, pitch: 760 },
          { t: (base + 108) / fps, pitch: 640 }
        );
        impactSlams.push(
          { t: (base + 8) / fps, gain: 0.52 },
          { t: (base + 126) / fps, gain: 0.56 }
        );
        chimeEvents.push(
          { t: (base + 48) / fps, freq: 698.46, gain: 0.2 },
          { t: (base + 118) / fps, freq: 523.25, gain: 0.18 },
          { t: (base + 126) / fps, freq: 466.16, gain: 0.19 },
          { t: (base + 134) / fps, freq: 440, gain: 0.19 },
          { t: (base + 142) / fps, freq: 392, gain: 0.22 }
        );
      } else if (style === "v4_slice_compute") {
        whooshEvents.push(
          { t: (base + 4) / fps, pitch: 1180 },
          { t: (base + 46) / fps, pitch: 1420 }
        );
        impactSlams.push(
          { t: (base + 48) / fps, gain: 0.54 },
          { t: (base + 116) / fps, gain: 0.66 }
        );
        chimeEvents.push(
          { t: (base + 120) / fps, freq: 587.33, gain: 0.2 },
          { t: (base + 126) / fps, freq: 880, gain: 0.22 }
        );
      } else if (style === "v4_slice_aerospace") {
        rocketRumbles.push([sStart, (base + 34) / fps]);
        whooshEvents.push(
          { t: (base + 46) / fps, pitch: 880 },
          { t: (base + 120) / fps, pitch: 980 }
        );
        impactSlams.push(
          { t: (base + 6) / fps, gain: 0.48 },
          { t: (base + 54) / fps, gain: 0.44 }
        );
        const relayNotes = [587.33, 659.25, 783.99, 880, 1174.66];
        relayNotes.forEach((f, idx) => {
          chimeEvents.push({ t: (base + 124 + idx * 9) / fps, freq: f, gain: 0.23 });
        });
      } else {
        shot.scene.data.beats.forEach((b, idx) => {
          chimeEvents.push({ t: (base + b.enterFrame) / fps, freq: 523.25 + idx * 80, gain: 0.16 });
        });
      }
    } else if (shot.scene.kind === "text_summary_board") {
      shotRanges.push({ start: sStart, end: sEnd, energy: 0.85, fullDrums: true });
      whooshEvents.push({ t: (base + 1) / fps, pitch: 820 });
      chimeEvents.push(
        { t: (base + 4) / fps, freq: 587.33, gain: 0.18 },
        { t: (base + 9) / fps, freq: 880, gain: 0.2 }
      );
    } else {
      shotRanges.push({ start: sStart, end: sEnd, energy: 1, fullDrums: true });
    }
  }
  let lfsr = 1941558303;
  const nextNoise = () => {
    lfsr ^= lfsr << 13;
    lfsr ^= lfsr >>> 17;
    lfsr ^= lfsr << 5;
    return (lfsr >>> 0) / 4294967296 * 2 - 1;
  };
  let lp = 0;
  let hpPrev = 0;
  for (let i = 0; i < totalSamples; i++) {
    const t = i / sampleRate;
    let masterEnv = 1;
    if (t < 0.025) masterEnv = t / 0.025;
    if (t > durationSec - 0.75) masterEnv = Math.max(0, (durationSec - t) / 0.75);
    let sceneEnergy = 1;
    for (let s = 0; s < shotRanges.length; s++) {
      if (t >= shotRanges[s].start && t < shotRanges[s].end) {
        sceneEnergy = shotRanges[s].energy;
        break;
      }
    }
    let breathDuck = 1;
    for (let c = 0; c < cutTimes.length; c++) {
      const dc = cutTimes[c] - t;
      if (dc > 0 && dc < 0.045) {
        breathDuck = Math.min(breathDuck, 0.28 + dc / 0.045 * 0.72);
      }
    }
    const beatFloat = t / beatDur;
    const beatIndex = Math.floor(beatFloat);
    const beatPhase = (beatFloat - beatIndex) * beatDur;
    const barIndex = Math.floor(beatIndex / 4);
    const beatInBar = beatIndex % 4;
    const barPhase = (beatFloat - barIndex * 4) * beatDur;
    const eighthFloat = beatFloat * 2;
    const eighthIdx = Math.floor(eighthFloat);
    const eighthPhase = (eighthFloat - eighthIdx) * (beatDur * 0.5);
    const sixteenthFloat = beatFloat * 4;
    const sixteenthIdx = Math.floor(sixteenthFloat);
    const sixteenthPhase = (sixteenthFloat - sixteenthIdx) * (beatDur * 0.25);
    const n = nextNoise();
    lp = lp * 0.8 + n * 0.2;
    const hp = n - hpPrev * 0.9;
    hpPrev = n;
    const sidechain = 0.42 + 0.58 * Math.min(1, beatPhase / 0.14);
    let kick = 0;
    if (beatPhase < 0.16) {
      const kEnv = Math.exp(-beatPhase * 22);
      const kFreq = 48 + 145 * Math.exp(-beatPhase * 48);
      const click = beatPhase < 8e-3 ? (1 - beatPhase / 8e-3) * 0.26 : 0;
      kick = (Math.sin(2 * Math.PI * kFreq * beatPhase) * kEnv * 0.46 + click) * sceneEnergy;
    }
    let snareL = 0;
    let snareR = 0;
    if ((beatInBar === 1 || beatInBar === 3) && beatPhase < 0.13) {
      const sEnv = Math.exp(-beatPhase * 26);
      const body = Math.sin(2 * Math.PI * 195 * beatPhase) * Math.exp(-beatPhase * 38) * 0.22;
      const snap = hp * sEnv * 0.24;
      snareL = (body + snap * 1.06) * sceneEnergy;
      snareR = (body + snap * 0.94) * sceneEnergy;
    }
    let hat = 0;
    const isOffEighth = sixteenthIdx % 4 === 2;
    const hatAccent = isOffEighth ? 1 : sixteenthIdx % 2 === 1 ? 0.48 : 0.25;
    if (sixteenthPhase < 0.042) {
      hat = hp * Math.exp(-sixteenthPhase * (isOffEighth ? 55 : 95)) * 0.11 * hatAccent * sceneEnergy;
    }
    const rootFreq = bassRoots[barIndex % bassRoots.length];
    const bassFreq = eighthIdx % 2 === 1 ? rootFreq * 2 : rootFreq;
    const bassEnv = Math.exp(-eighthPhase * 5.2);
    const bassWave = Math.sin(2 * Math.PI * bassFreq * t) * 0.72 + Math.sin(4 * Math.PI * bassFreq * t) * 0.22 + Math.sin(6 * Math.PI * bassFreq * t) * 0.08;
    const bass = bassWave * bassEnv * sidechain * 0.34 * sceneEnergy;
    const chord = chords[barIndex % chords.length];
    const stab1Env = Math.min(1, barPhase / 0.015) * Math.exp(-barPhase * 1.55);
    const pushPhase = barPhase - beatDur * 2.5;
    const stab2Env = pushPhase >= 0 ? Math.min(1, pushPhase / 0.012) * Math.exp(-pushPhase * 3.8) * 0.65 : 0;
    const stabEnv = (stab1Env + stab2Env) * sidechain;
    let synthL = 0;
    let synthR = 0;
    if (stabEnv > 5e-3) {
      for (let c = 0; c < chord.length; c++) {
        const f = chord[c];
        const vL = Math.sin(2 * Math.PI * (f * 0.996) * t) * 0.65 + Math.sin(4 * Math.PI * (f * 0.996) * t) * 0.22 + Math.sin(6 * Math.PI * (f * 0.996) * t) * 0.1;
        const vR = Math.sin(2 * Math.PI * (f * 1.004) * t) * 0.65 + Math.sin(4 * Math.PI * (f * 1.004) * t) * 0.22 + Math.sin(6 * Math.PI * (f * 1.004) * t) * 0.1;
        synthL += vL;
        synthR += vR;
      }
      synthL *= 0.068 * stabEnv * sceneEnergy;
      synthR *= 0.068 * stabEnv * sceneEnergy;
    }
    const arpFreq = chord[sixteenthIdx * 3 % chord.length] * (sixteenthIdx % 8 === 7 ? 2 : 1);
    const arpTone = (Math.sin(2 * Math.PI * arpFreq * t) * 0.72 + Math.sin(4 * Math.PI * arpFreq * t) * 0.24) * Math.exp(-sixteenthPhase * 15) * 0.085 * sidechain * sceneEnergy;
    const arpPan = (sixteenthIdx % 4 - 1.5) * 0.34;
    let logoL = 0;
    let logoR = 0;
    if (enableAudioLogo && t < 0.55) {
      const notes = [
        { onset: 0.01, freq: 587.33, pan: -0.3 },
        { onset: 0.11, freq: 880, pan: 0 },
        { onset: 0.21, freq: 1174.66, pan: 0.3 }
      ];
      for (const ln of notes) {
        const dt = t - ln.onset;
        if (dt >= 0 && dt < 0.34) {
          const env = Math.min(1, dt / 6e-3) * Math.exp(-dt * 10);
          const tone = (Math.sin(2 * Math.PI * ln.freq * dt) * 0.75 + Math.sin(2 * Math.PI * ln.freq * 2 * dt) * 0.25) * env * 0.2;
          logoL += tone * (1 - ln.pan);
          logoR += tone * (1 + ln.pan);
        }
      }
    }
    let dataTick = 0;
    const inTypeWindow = typeWindows.some(([ws, we]) => t >= ws && t <= we);
    if (inTypeWindow && sixteenthPhase < 0.012) {
      dataTick = Math.sin(2 * Math.PI * (1520 + sixteenthIdx % 4 * 200) * sixteenthPhase) * Math.exp(-sixteenthPhase * 210) * 0.058;
    }
    let sfxL = 0;
    let sfxR = 0;
    for (let m = 0; m < impactSlams.length; m++) {
      const dm = t - impactSlams[m].t;
      if (dm >= 0 && dm < 0.42) {
        const subBoom = Math.sin(2 * Math.PI * (185 * Math.exp(-dm * 16) + 42) * dm) * Math.exp(-dm * 9.5) * impactSlams[m].gain;
        const crunch = (lp * 0.4 + hp * 0.2) * Math.exp(-dm * 18) * impactSlams[m].gain;
        sfxL += subBoom + crunch;
        sfxR += subBoom + crunch * 0.92;
      }
    }
    for (let w = 0; w < whooshEvents.length; w++) {
      const dw = t - whooshEvents[w].t;
      if (dw >= -0.06 && dw <= 0.24) {
        const env = dw < 0 ? (dw + 0.06) / 0.06 : Math.exp(-dw * 12);
        const sweep = Math.sin(2 * Math.PI * (whooshEvents[w].pitch * Math.exp(-Math.max(0, dw) * 7)) * dw);
        const val = (lp * 0.55 + hp * 0.3 + sweep * 0.14) * env * 0.26;
        sfxL += val * 1.08;
        sfxR += val * 0.92;
      }
    }
    for (let c = 0; c < chimeEvents.length; c++) {
      const dc = t - chimeEvents[c].t;
      if (dc >= 0 && dc < 0.24) {
        const tone = (Math.sin(2 * Math.PI * chimeEvents[c].freq * dc) * 0.72 + Math.sin(2 * Math.PI * chimeEvents[c].freq * 2 * dc) * 0.24) * Math.exp(-dc * 14) * chimeEvents[c].gain;
        const pan = (c % 3 - 1) * 0.25;
        sfxL += tone * (1 - pan);
        sfxR += tone * (1 + pan);
      }
    }
    for (let r = 0; r < rocketRumbles.length; r++) {
      const [rs, re] = rocketRumbles[r];
      if (t >= rs && t <= re) {
        const rp = (t - rs) / Math.max(0.05, re - rs);
        const rumble = (lp * 0.7 + Math.sin(2 * Math.PI * (54 + rp * 26) * t) * 0.35) * Math.sin(rp * Math.PI) * 0.26;
        sfxL += rumble;
        sfxR += rumble;
      }
    }
    for (let c = 0; c < cutTimes.length; c++) {
      const dc = t - cutTimes[c];
      if (dc >= -0.04 && dc <= 0.22) {
        const env = dc < 0 ? (dc + 0.04) / 0.04 : Math.exp(-dc * 12);
        const wsh = (lp * 0.65 + hp * 0.35) * env * 0.24;
        sfxL += wsh;
        sfxR += wsh;
      }
    }
    const bedL = (kick + snareL + hat + bass + synthL + arpTone * (1 - arpPan)) * breathDuck;
    const bedR = (kick + snareR + hat + bass + synthR + arpTone * (1 + arpPan)) * breathDuck;
    const mixL = (bedL + dataTick + logoL + sfxL) * masterEnv;
    const mixR = (bedR + dataTick + logoR + sfxR) * masterEnv;
    left[i] = Math.tanh(mixL * 1.15);
    right[i] = Math.tanh(mixR * 1.15);
  }
  return { sampleRate, left, right };
}
function synthesizeStudioV3AudioPcm(episode, sampleRate = 44100) {
  const tl = compileEpisodeTimeline(episode);
  const durationSec = tl.durationSec;
  const totalSamples = Math.floor(sampleRate * durationSec);
  const left = new Float32Array(totalSamples);
  const right = new Float32Array(totalSamples);
  const mood = episode.audio?.mood ?? "editorial_lofi";
  const profile = STUDIO_MOODS[mood] ?? STUDIO_MOODS.editorial_lofi;
  const enableAudioLogo = episode.audio?.audioLogo !== false;
  const bpm = tl.bpm || 108;
  const beatDur = 60 / bpm;
  const fps = tl.fps || 30;
  const cutTimes = tl.cutFrames.map((f) => f / fps);
  const impactTimes = [];
  const chimeEvents = [];
  const stampThudTimes = [];
  const typeWindows = [];
  const shotRanges = [];
  for (const shot of tl.shots) {
    const sStart = shot.startSec;
    const sEnd = shot.endSec;
    const base = shot.startFrame;
    if (shot.scene.kind === "v3_conflict_hook") {
      shotRanges.push({ start: sStart, end: sEnd, energy: 1.05 });
      impactTimes.push((base + 10) / fps);
      chimeEvents.push(
        { t: (base + 18) / fps, freq: 587.33 },
        { t: (base + 26) / fps, freq: 659.25 },
        { t: (base + 34) / fps, freq: 783.99 }
      );
    } else if (shot.scene.kind === "v3_market_pulse") {
      shotRanges.push({ start: sStart, end: sEnd, energy: 0.92 });
      chimeEvents.push(
        { t: (base + 4) / fps, freq: 440 },
        { t: (base + 12) / fps, freq: 523.25 },
        { t: (base + 76) / fps, freq: 493.88 },
        { t: (base + 132) / fps, freq: 587.33 }
      );
      typeWindows.push(
        [(base + 22) / fps, (base + 62) / fps],
        [(base + 92) / fps, (base + 130) / fps]
      );
    } else if (shot.scene.kind === "v3_ashare_anchor") {
      shotRanges.push({ start: sStart, end: sEnd, energy: 0.95 });
      chimeEvents.push(
        { t: (base + 4) / fps, freq: 523.25 },
        { t: (base + 50) / fps, freq: 587.33 },
        { t: (base + 60) / fps, freq: 659.25 },
        { t: (base + 70) / fps, freq: 783.99 },
        { t: (base + 114) / fps, freq: 880 }
      );
      typeWindows.push([(base + 26) / fps, (base + 66) / fps]);
    } else if (shot.scene.kind === "v3_editorial_story") {
      const variant = shot.scene.data.variant;
      shotRanges.push({
        start: sStart,
        end: sEnd,
        energy: variant === "catalyst_chain" ? 1 : 0.88
      });
      chimeEvents.push({ t: (base + 10) / fps, freq: 523.25 });
      if (variant === "macro_gauge") {
        chimeEvents.push({ t: (base + 58) / fps, freq: 659.25 });
      } else if (variant === "vs_split_cards") {
        impactTimes.push((base + 52) / fps);
        stampThudTimes.push((base + 120) / fps);
      } else if (variant === "catalyst_chain") {
        const scale = [523.25, 587.33, 659.25, 783.99, 880];
        scale.forEach((f, idx) => {
          chimeEvents.push({ t: (base + 76 + idx * 10) / fps, freq: f });
        });
      }
    } else if (shot.scene.kind === "v3_action_cheatsheet") {
      shotRanges.push({ start: sStart, end: sEnd, energy: 0.86 });
      chimeEvents.push(
        { t: (base + 32) / fps, freq: 587.33 },
        { t: (base + 76) / fps, freq: 659.25 },
        { t: (base + 86) / fps, freq: 783.99 },
        { t: (base + 100) / fps, freq: 880 },
        { t: (base + 114) / fps, freq: 1046.5 }
      );
    } else {
      shotRanges.push({ start: sStart, end: sEnd, energy: 0.9 });
    }
  }
  let lfsr = 1369961371;
  const nextNoise = () => {
    lfsr ^= lfsr << 13;
    lfsr ^= lfsr >>> 17;
    lfsr ^= lfsr << 5;
    return (lfsr >>> 0) / 4294967296 * 2 - 1;
  };
  let lp = 0;
  let hpPrev = 0;
  for (let i = 0; i < totalSamples; i++) {
    const t = i / sampleRate;
    let masterEnv = 1;
    if (t < 0.03) masterEnv = t / 0.03;
    if (t > durationSec - 0.85) masterEnv = Math.max(0, (durationSec - t) / 0.85);
    let sceneEnergy = 0.9;
    for (let s = 0; s < shotRanges.length; s++) {
      if (t >= shotRanges[s].start && t < shotRanges[s].end) {
        sceneEnergy = shotRanges[s].energy;
        break;
      }
    }
    let breathDuck = 1;
    for (let c = 0; c < cutTimes.length; c++) {
      const dc = cutTimes[c] - t;
      if (dc > 0 && dc < 0.05) {
        breathDuck = Math.min(breathDuck, 0.35 + dc / 0.05 * 0.65);
      }
    }
    for (let s = 0; s < stampThudTimes.length; s++) {
      const ds = stampThudTimes[s] - t;
      if (ds > 0 && ds < 0.06) {
        breathDuck = Math.min(breathDuck, 0.25 + ds / 0.06 * 0.75);
      }
    }
    const beatFloat = t / beatDur;
    const beatIndex = Math.floor(beatFloat);
    const beatPhase = (beatFloat - beatIndex) * beatDur;
    const barIndex = Math.floor(beatIndex / 4);
    const beatInBar = beatIndex % 4;
    const sixteenthFloat = beatFloat * 4;
    const sixteenthIdx = Math.floor(sixteenthFloat);
    const sixteenthPhase = (sixteenthFloat - sixteenthIdx) * (beatDur * 0.25);
    const eighthFloat = beatFloat * 2;
    const eighthIdx = Math.floor(eighthFloat);
    const eighthPhase = (eighthFloat - eighthIdx) * (beatDur * 0.5);
    const n = nextNoise();
    lp = lp * 0.82 + n * 0.18;
    const hp = n - hpPrev * 0.88;
    hpPrev = n;
    const chord = profile.chords[barIndex % profile.chords.length];
    const barPhase = (beatFloat - barIndex * 4) * beatDur;
    const padEnv = Math.min(1, barPhase / 0.04) * Math.exp(-barPhase * 0.72);
    let padL = 0;
    let padR = 0;
    for (let c = 0; c < chord.length; c++) {
      const f = chord[c];
      const v = (Math.sin(2 * Math.PI * f * t) * 0.76 + Math.sin(2 * Math.PI * f * 2 * t) * 0.16 * Math.exp(-barPhase * 2.2)) * padEnv;
      const spread = (c / (chord.length - 1) - 0.5) * 0.45;
      padL += v * (0.5 - spread);
      padR += v * (0.5 + spread);
    }
    padL *= profile.padGain * sceneEnergy;
    padR *= profile.padGain * sceneEnergy;
    const pluckFreq = chord[eighthIdx * 3 % chord.length];
    const pluck = (Math.sin(2 * Math.PI * pluckFreq * t) * 0.75 + Math.sin(2 * Math.PI * pluckFreq * 2 * t) * 0.14) * Math.exp(-eighthPhase * 8.5) * 0.085 * sceneEnergy;
    const pluckPan = (eighthIdx % 4 - 1.5) * 0.24;
    let kick = 0;
    const isKickBeat = beatInBar === 0 || beatInBar === 2;
    if (isKickBeat && beatPhase < 0.15) {
      const kEnv = Math.exp(-beatPhase * 26);
      const kFreq = 46 + 108 * Math.exp(-beatPhase * 45);
      kick = Math.sin(2 * Math.PI * kFreq * beatPhase) * kEnv * profile.kickGain * sceneEnergy;
    }
    let rim = 0;
    if ((beatInBar === 1 || beatInBar === 3) && beatPhase < 0.08) {
      rim = (hp * 0.45 + Math.sin(2 * Math.PI * 340 * beatPhase) * 0.35) * Math.exp(-beatPhase * 46) * 0.11;
    }
    let hat = 0;
    if (eighthIdx % 2 === 1 && eighthPhase < 0.045) {
      hat = hp * Math.exp(-eighthPhase * 75) * profile.hatGain * sceneEnergy;
    }
    const bassFreq = profile.bassRoots[barIndex % profile.bassRoots.length];
    const bass = (Math.sin(2 * Math.PI * bassFreq * t) * 0.8 + Math.sin(2 * Math.PI * bassFreq * 2 * t) * 0.15) * Math.exp(-beatPhase * 3.4) * 0.22 * sceneEnergy;
    let dataTick = 0;
    const inTypeWindow = typeWindows.some(([ws, we]) => t >= ws && t <= we);
    if (inTypeWindow && sixteenthPhase < 0.012) {
      dataTick = Math.sin(2 * Math.PI * (1420 + sixteenthIdx % 4 * 180) * sixteenthPhase) * Math.exp(-sixteenthPhase * 220) * 0.042;
    }
    let logoL = 0;
    let logoR = 0;
    if (enableAudioLogo && t < 0.65) {
      const notes = [
        { onset: 0.02, freq: 587.33, pan: -0.25 },
        { onset: 0.14, freq: 880, pan: 0 },
        { onset: 0.26, freq: 1174.66, pan: 0.25 }
      ];
      for (const ln of notes) {
        const dt = t - ln.onset;
        if (dt >= 0 && dt < 0.38) {
          const env = Math.min(1, dt / 8e-3) * Math.exp(-dt * 9.5);
          const tone = (Math.sin(2 * Math.PI * ln.freq * dt) * 0.78 + Math.sin(2 * Math.PI * ln.freq * 2 * dt) * 0.22) * env * 0.18;
          logoL += tone * (1 - ln.pan);
          logoR += tone * (1 + ln.pan);
        }
      }
    }
    let sfx = 0;
    for (let m = 0; m < impactTimes.length; m++) {
      const dm = t - impactTimes[m];
      if (dm >= 0 && dm < 0.36) {
        sfx += Math.sin(2 * Math.PI * (150 * Math.exp(-dm * 14) + 46) * dm) * Math.exp(-dm * 11) * 0.42;
        sfx += lp * Math.exp(-dm * 18) * 0.12;
      }
    }
    for (let c = 0; c < chimeEvents.length; c++) {
      const dc = t - chimeEvents[c].t;
      if (dc >= 0 && dc < 0.2) {
        sfx += (Math.sin(2 * Math.PI * chimeEvents[c].freq * dc) * 0.8 + Math.sin(2 * Math.PI * chimeEvents[c].freq * 2 * dc) * 0.2) * Math.exp(-dc * 18) * 0.11;
      }
    }
    for (let s = 0; s < stampThudTimes.length; s++) {
      const ds = t - stampThudTimes[s];
      if (ds >= 0 && ds < 0.25) {
        sfx += (Math.sin(2 * Math.PI * (110 * Math.exp(-ds * 18) + 52) * ds) * 0.56 + lp * 0.32) * Math.exp(-ds * 18);
      }
    }
    for (let c = 0; c < cutTimes.length; c++) {
      const dc = t - cutTimes[c];
      if (dc >= -0.05 && dc <= 0.2) {
        const env = dc < 0 ? (dc + 0.05) / 0.05 : Math.exp(-dc * 13);
        sfx += (lp * 0.7 + hp * 0.25) * env * 0.16;
      }
    }
    const bedL = (padL + kick + rim + hat + bass + pluck * (1 - pluckPan)) * breathDuck;
    const bedR = (padR + kick + rim + hat + bass + pluck * (1 + pluckPan)) * breathDuck;
    const mixL = (bedL + dataTick + logoL + sfx) * masterEnv;
    const mixR = (bedR + dataTick + logoR + sfx) * masterEnv;
    left[i] = Math.tanh(mixL * 0.92);
    right[i] = Math.tanh(mixR * 0.92);
  }
  return { sampleRate, left, right };
}
function decodeWavToMonoFloat32(wavBytes) {
  const view = new DataView(wavBytes.buffer, wavBytes.byteOffset, wavBytes.byteLength);
  if (wavBytes.byteLength < 44) {
    throw new Error("Invalid WAV buffer: too short");
  }
  let offset = 12;
  let sampleRate = 24e3;
  let numChannels = 1;
  let bitsPerSample = 16;
  let dataOffset = -1;
  let dataSize = 0;
  while (offset + 8 <= wavBytes.byteLength) {
    const chunkId = String.fromCharCode(
      wavBytes[offset],
      wavBytes[offset + 1],
      wavBytes[offset + 2],
      wavBytes[offset + 3]
    );
    const chunkSize = view.getUint32(offset + 4, true);
    const bodyStart = offset + 8;
    if (chunkId === "fmt " && chunkSize >= 16) {
      numChannels = view.getUint16(bodyStart + 2, true);
      sampleRate = view.getUint32(bodyStart + 4, true);
      bitsPerSample = view.getUint16(bodyStart + 14, true);
    } else if (chunkId === "data") {
      dataOffset = bodyStart;
      dataSize = Math.min(chunkSize, wavBytes.byteLength - bodyStart);
      break;
    }
    offset = bodyStart + chunkSize + chunkSize % 2;
  }
  if (dataOffset < 0 || bitsPerSample !== 16) {
    throw new Error(`Unsupported WAV format (bits=${bitsPerSample}, dataOffset=${dataOffset})`);
  }
  const bytesPerFrame = numChannels * 2;
  const frameCount = Math.floor(dataSize / bytesPerFrame);
  const samples = new Float32Array(frameCount);
  for (let i = 0; i < frameCount; i++) {
    let sum = 0;
    for (let ch = 0; ch < numChannels; ch++) {
      const sampleIdx = dataOffset + i * bytesPerFrame + ch * 2;
      sum += view.getInt16(sampleIdx, true) / 32768;
    }
    samples[i] = sum / numChannels;
  }
  return { sampleRate, samples };
}
function encodeMonoWav(samples, sampleRate) {
  const numSamples = samples.length;
  const dataBytes = numSamples * 2;
  const buf = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(buf);
  const writeStr = (off2, s) => {
    for (let i = 0; i < s.length; i++) view.setUint8(off2 + i, s.charCodeAt(i));
  };
  writeStr(0, "RIFF");
  view.setUint32(4, 36 + dataBytes, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, "data");
  view.setUint32(40, dataBytes, true);
  let off = 44;
  for (let i = 0; i < numSamples; i++) {
    const v = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(off, v < 0 ? v * 32768 : v * 32767, true);
    off += 2;
  }
  return new Uint8Array(buf);
}
function mixVoiceoverIntoStereoPcm(bgm, voiceMono, voiceSampleRate, duckingDb = -13) {
  const outLen = bgm.left.length;
  const outL = new Float32Array(outLen);
  const outR = new Float32Array(outLen);
  const ratio = voiceSampleRate / bgm.sampleRate;
  const resampledVoice = new Float32Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const srcPos = i * ratio;
    const idx = Math.floor(srcPos);
    if (idx >= voiceMono.length) break;
    const frac = srcPos - idx;
    const s0 = voiceMono[idx];
    const s1 = idx + 1 < voiceMono.length ? voiceMono[idx + 1] : s0;
    resampledVoice[i] = s0 + (s1 - s0) * frac;
  }
  const minGain = Math.pow(10, Math.min(-3, duckingDb) / 20);
  const attackCoeff = Math.exp(-1 / (bgm.sampleRate * 0.035));
  const releaseCoeff = Math.exp(-1 / (bgm.sampleRate * 0.24));
  let env = 0;
  let duckGain = 1;
  for (let i = 0; i < outLen; i++) {
    const absV = Math.abs(resampledVoice[i]);
    env = absV > env ? env * 0.92 + absV * 0.08 : env * 0.996 + absV * 4e-3;
    const speaking = env > 0.015;
    const targetGain = speaking ? minGain : 1;
    const coeff = targetGain < duckGain ? attackCoeff : releaseCoeff;
    duckGain = targetGain + (duckGain - targetGain) * coeff;
    const voiceBoost = resampledVoice[i] * 1.08;
    outL[i] = Math.tanh(bgm.left[i] * duckGain + voiceBoost);
    outR[i] = Math.tanh(bgm.right[i] * duckGain + voiceBoost);
  }
  return {
    sampleRate: bgm.sampleRate,
    left: outL,
    right: outR
  };
}

// src/server/mobileTunnel.ts
import fs from "fs";
import os from "os";
import path from "path";
import { spawn, spawnSync } from "child_process";
var CLOUDFLARED_RELEASE_URL = "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64";
var TRYCLOUDFLARE_RE = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/i;
var MobileTunnelManager = class {
  constructor() {
    this.proc = null;
    this.status = "idle";
    this.url = null;
    this.verified = false;
    this.statusCode = 0;
    this.error = null;
    this.startedAt = null;
    this.startPromise = null;
    this.registered = false;
    this.port = 3e3;
    this.exitHookInstalled = false;
  }
  getSnapshot() {
    return {
      status: this.status,
      url: this.url,
      verified: this.verified,
      statusCode: this.statusCode,
      error: this.error,
      startedAt: this.startedAt,
      provider: "cloudflare_quick_tunnel"
    };
  }
  installExitHooks() {
    if (this.exitHookInstalled) return;
    this.exitHookInstalled = true;
    const cleanup = () => {
      this.killProcessOnly();
    };
    process.once("exit", cleanup);
    process.once("SIGINT", () => {
      cleanup();
      process.exit(0);
    });
    process.once("SIGTERM", () => {
      cleanup();
      process.exit(0);
    });
  }
  killProcessOnly() {
    if (this.proc) {
      try {
        this.proc.kill("SIGTERM");
      } catch {
      }
      this.proc = null;
    }
  }
  stop() {
    this.killProcessOnly();
    this.status = "idle";
    this.url = null;
    this.verified = false;
    this.statusCode = 0;
    this.error = null;
    this.startedAt = null;
    this.registered = false;
    this.startPromise = null;
    return this.getSnapshot();
  }
  probeBinary(candidate) {
    try {
      const res = spawnSync(candidate, ["--version"], {
        stdio: "ignore",
        timeout: 4e3
      });
      return !res.error && res.status === 0;
    } catch {
      return false;
    }
  }
  async ensureCloudflaredBinary() {
    const cachedBin = path.join(os.tmpdir(), "quantreel-cloudflared");
    const preDownloaded = "/tmp/cf_bin/cloudflared";
    const candidates = [
      process.env.CLOUDFLARED_PATH?.trim(),
      cachedBin,
      preDownloaded,
      "cloudflared",
      "/usr/local/bin/cloudflared",
      "/usr/bin/cloudflared"
    ].filter((c) => Boolean(c));
    for (const candidate of candidates) {
      if (this.probeBinary(candidate)) {
        return candidate;
      }
    }
    if (process.platform !== "linux" || process.arch !== "x64") {
      throw new Error(
        `\u5F53\u524D\u7CFB\u7EDF (${process.platform}/${process.arch}) \u672A\u9884\u88C5 cloudflared\uFF0C\u8BF7\u624B\u52A8\u5B89\u88C5\u6216\u586B\u5199\u81EA\u5B9A\u4E49\u516C\u7F51\u57DF\u540D\u3002`
      );
    }
    const tmpDownload = `${cachedBin}.${Date.now()}.tmp`;
    const res = await fetch(CLOUDFLARED_RELEASE_URL, { redirect: "follow" });
    if (!res.ok) {
      throw new Error(`\u4E0B\u8F7D cloudflared \u5931\u8D25 (HTTP ${res.status})`);
    }
    const buf = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(tmpDownload, buf, { mode: 493 });
    fs.renameSync(tmpDownload, cachedBin);
    fs.chmodSync(cachedBin, 493);
    if (!this.probeBinary(cachedBin)) {
      throw new Error("\u4E0B\u8F7D\u7684 cloudflared \u53EF\u6267\u884C\u6587\u4EF6\u6821\u9A8C\u5931\u8D25");
    }
    return cachedBin;
  }
  async verifyPublicUrl(targetUrl) {
    await new Promise((r) => setTimeout(r, 2500));
    for (let attempt = 0; attempt < 10; attempt++) {
      if (!this.proc || this.url !== targetUrl) {
        return { ok: false, statusCode: 0 };
      }
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5e3);
      try {
        const res = await fetch(`${targetUrl}/api/health`, {
          method: "GET",
          redirect: "manual",
          signal: controller.signal
        });
        if (res.status === 200) {
          return { ok: true, statusCode: 200 };
        }
        if (attempt === 9) {
          return { ok: false, statusCode: res.status };
        }
      } catch {
      } finally {
        clearTimeout(timer);
      }
      await new Promise((r) => setTimeout(r, 1500));
    }
    return { ok: false, statusCode: 0 };
  }
  async start(port, force = false) {
    this.port = port;
    this.installExitHooks();
    if (!force) {
      if (this.status === "ready" && this.proc && this.url) {
        return this.getSnapshot();
      }
      if (this.startPromise) {
        return this.startPromise;
      }
    } else {
      this.stop();
    }
    this.status = "starting";
    this.error = null;
    this.verified = false;
    this.statusCode = 0;
    this.registered = false;
    const run = (async () => {
      try {
        const binary = await this.ensureCloudflaredBinary();
        const child = spawn(
          binary,
          [
            "tunnel",
            "--no-autoupdate",
            "--protocol",
            "http2",
            "--url",
            `http://127.0.0.1:${port}`
          ],
          {
            stdio: ["ignore", "pipe", "pipe"]
          }
        );
        this.proc = child;
        this.startedAt = Date.now();
        let issuedUrl = null;
        await new Promise((resolve, reject) => {
          let settled = false;
          const finishOk = () => {
            if (settled) return;
            settled = true;
            clearTimeout(timeout);
            resolve();
          };
          const finishErr = (msg) => {
            if (settled) return;
            settled = true;
            clearTimeout(timeout);
            reject(new Error(msg));
          };
          const timeout = setTimeout(() => {
            if (issuedUrl) {
              finishOk();
            } else {
              finishErr("\u5EFA\u7ACB\u514D\u8D39\u516C\u7F51\u901A\u9053\u8D85\u65F6\uFF0825\u79D2\uFF09\uFF0C\u8BF7\u70B9\u51FB\u5237\u65B0\u91CD\u8BD5");
            }
          }, 25e3);
          const handleLogChunk = (chunk) => {
            const text = chunk.toString("utf8");
            if (!issuedUrl) {
              const m = TRYCLOUDFLARE_RE.exec(text);
              if (m) {
                issuedUrl = m[0];
                this.url = issuedUrl;
              }
            }
            if (text.includes("Registered tunnel connection")) {
              this.registered = true;
              if (issuedUrl) {
                finishOk();
              }
            }
          };
          child.stdout?.on("data", handleLogChunk);
          child.stderr?.on("data", handleLogChunk);
          child.once("error", (err) => {
            finishErr(`\u542F\u52A8\u516C\u7F51\u901A\u9053\u5931\u8D25: ${err.message}`);
          });
          child.once("exit", (code, signal) => {
            if (this.proc === child) {
              this.proc = null;
              if (!settled) {
                finishErr(
                  `\u516C\u7F51\u901A\u9053\u8FDB\u7A0B\u63D0\u524D\u9000\u51FA (code=${code ?? "null"}, signal=${signal ?? "null"})`
                );
              } else if (this.status === "ready") {
                this.status = "error";
                this.verified = false;
                this.error = "\u516C\u7F51\u901A\u9053\u5DF2\u65AD\u5F00\uFF0C\u70B9\u51FB\u300C\u5237\u65B0\u901A\u9053\u300D\u53EF\u7ACB\u523B\u91CD\u8FDE";
              }
            }
          });
        });
        if (!issuedUrl || this.proc !== child) {
          throw new Error("\u672A\u80FD\u83B7\u53D6\u514D\u8D39\u516C\u7F51\u9884\u89C8\u57DF\u540D");
        }
        const verify = await this.verifyPublicUrl(issuedUrl);
        if (this.proc !== child) {
          return this.getSnapshot();
        }
        this.statusCode = verify.statusCode;
        this.verified = verify.ok;
        this.status = "ready";
        if (!verify.ok) {
          this.error = "\u516C\u7F51\u57DF\u540D\u5DF2\u5206\u914D\uFF0CDNS \u4ECD\u5728\u540C\u6B65\u4E2D\uFF0C\u51E0\u79D2\u540E\u53EF\u81EA\u52A8\u751F\u6548";
        }
        console.log(
          `[MobileTunnel] Free public preview ready: ${issuedUrl} (verified=${verify.ok}, http=${verify.statusCode})`
        );
        return this.getSnapshot();
      } catch (err) {
        this.killProcessOnly();
        this.status = "error";
        this.url = null;
        this.verified = false;
        this.statusCode = 0;
        this.error = err instanceof Error ? err.message : "\u514D\u8D39\u516C\u7F51\u901A\u9053\u542F\u52A8\u5931\u8D25";
        return this.getSnapshot();
      } finally {
        this.startPromise = null;
      }
    })();
    this.startPromise = run;
    return run;
  }
};
var mobileTunnel = new MobileTunnelManager();

// src/server/cloudVideoShare.ts
import fs2 from "fs";
import path2 from "path";
var CHANNEL_ORDER = {
  droptocdn_mp4: 0,
  uguu_mp4: 1,
  x0_mp4: 2
};
var bundleCache = /* @__PURE__ */ new Map();
var inFlightPublishes = /* @__PURE__ */ new Map();
function getSidecarPath(mp4Path) {
  const dir = path2.dirname(mp4Path);
  const base = path2.basename(mp4Path, path2.extname(mp4Path));
  return path2.join(dir, `${base}.cloud.json`);
}
function isSupportedChannelId(id) {
  return id === "droptocdn_mp4" || id === "uguu_mp4" || id === "x0_mp4";
}
function filterFreshChannels(channels) {
  const now = Date.now();
  const seen = /* @__PURE__ */ new Set();
  const fresh = [];
  for (const ch of channels) {
    if (!ch || !ch.url || !isSupportedChannelId(ch.id) || seen.has(ch.id)) continue;
    if (typeof ch.expiresAtMs === "number" && ch.expiresAtMs <= now) continue;
    seen.add(ch.id);
    fresh.push(ch);
  }
  fresh.sort((a, b) => (CHANNEL_ORDER[a.id] ?? 9) - (CHANNEL_ORDER[b.id] ?? 9));
  return fresh;
}
function saveSidecarBundle(mp4Path, bundle) {
  try {
    const sidecar = getSidecarPath(mp4Path);
    fs2.writeFileSync(sidecar, JSON.stringify(bundle, null, 2), "utf-8");
  } catch {
  }
}
function loadSidecarBundle(mp4Path, expectedMtimeMs) {
  try {
    const sidecar = getSidecarPath(mp4Path);
    if (!fs2.existsSync(sidecar)) return null;
    const parsed = JSON.parse(fs2.readFileSync(sidecar, "utf-8"));
    if (!parsed || Math.floor(parsed.mtimeMs) !== Math.floor(expectedMtimeMs)) {
      return null;
    }
    const fresh = filterFreshChannels(Array.isArray(parsed.channels) ? parsed.channels : []);
    if (fresh.length === 0) return null;
    return {
      ...parsed,
      channels: fresh
    };
  } catch {
    return null;
  }
}
var MOBILE_VERIFY_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
var droptocdnCooldownUntilMs = 0;
async function verifyDirectMp4Stream(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3500);
  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      headers: {
        "User-Agent": MOBILE_VERIFY_UA,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        Range: "bytes=0-65535"
      },
      signal: controller.signal
    });
    const ct = (res.headers.get("content-type") || "").toLowerCase();
    const cd = (res.headers.get("content-disposition") || "").toLowerCase();
    if (cd.includes("attachment")) {
      return false;
    }
    await res.arrayBuffer();
    return (res.status === 206 || res.status === 200) && ct.includes("video/");
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}
async function uploadToDropToCdn(fileBuf, filename) {
  if (Date.now() < droptocdnCooldownUntilMs) {
    throw new Error("Cloudflare \u533F\u540D\u76F4\u94FE\u4ECA\u65E5\u914D\u989D\u51B7\u5374\u4E2D\uFF0C\u79D2\u5207\u5907\u7528\u76F4\u94FE");
  }
  if (fileBuf.length > 15.8 * 1024 * 1024) {
    throw new Error("\u6587\u4EF6\u8D85\u8FC7 16MB \u533F\u540D\u76F4\u94FE\u4E0A\u9650\uFF0C\u81EA\u52A8\u5207\u6362\u5907\u7528\u76F4\u94FE");
  }
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(fileBuf)], { type: "video/mp4" }), filename);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 9e3);
  try {
    const res = await fetch("https://api.droptocdn.com/v1/files", {
      method: "POST",
      body: form,
      signal: controller.signal
    });
    if (res.status === 429) {
      droptocdnCooldownUntilMs = Date.now() + 30 * 60 * 1e3;
      throw new Error("Cloudflare \u533F\u540D\u8282\u70B9\u4ECA\u65E5\u8BBF\u5BA2\u989D\u5EA6\u5DF2\u6EE1\uFF0C\u81EA\u52A8\u79D2\u5207\u5907\u7528\u76F4\u94FE");
    }
    const json = await res.json();
    const url = json?.url?.trim();
    if (!res.ok || !url || !url.startsWith("https://")) {
      throw new Error(`Cloudflare \u76F4\u94FE\u4E0A\u4F20\u5F02\u5E38 (${res.status})`);
    }
    const verified = await verifyDirectMp4Stream(url);
    if (!verified) {
      throw new Error("Cloudflare \u76F4\u94FE MP4 206 \u6D41\u6821\u9A8C\u672A\u901A\u8FC7");
    }
    const parsedExp = json.expires_at ? Date.parse(json.expires_at) : NaN;
    const expiresAtMs = Number.isFinite(parsedExp) && parsedExp > Date.now() ? parsedExp - 3600 * 1e3 : Date.now() + 6 * 24 * 3600 * 1e3;
    return {
      id: "droptocdn_mp4",
      label: "\u7EBF\u8DEF 1\uFF1ACloudflare \u6781\u901F\u7EAF MP4 \u76F4\u94FE\uFF08\u63A8\u8350 \xB7 \u79D2\u5F00\u4E0D\u5361\u987F\uFF09",
      shortLabel: "\u7EBF\u8DEF1 \xB7 \u6781\u901F\u76F4\u94FE",
      url,
      description: "\u76F4\u8FDE Cloudflare \u4E9A\u592A\u8FB9\u7F18\u8282\u70B9\u7684\u7EAF MP4 \u89C6\u9891\u6D41\uFF08\u65E0\u4EFB\u4F55\u8DF3\u8F6C\u7F51\u9875\u4E0E\u5E73\u53F0\u754C\u9762\uFF09\uFF0C\u626B\u7801\u76F4\u63A5\u62C9\u8D77\u624B\u673A\u539F\u751F\u5168\u5C4F\u64AD\u653E\u5668\u5E76\u9AD8\u901F\u9884\u7F13\u51B2\u3002",
      verified: true,
      expiresHint: "7 \u5929\u6709\u6548 \xB7 \u7EAFMP4\u76F4\u64AD",
      providerName: "cdn.droptocdn.com",
      expiresAtMs
    };
  } finally {
    clearTimeout(timer);
  }
}
async function uploadToUguu(fileBuf, filename) {
  const form = new FormData();
  form.append("files[]", new Blob([new Uint8Array(fileBuf)], { type: "video/mp4" }), filename);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 14e3);
  try {
    const res = await fetch("https://uguu.se/upload", {
      method: "POST",
      body: form,
      signal: controller.signal
    });
    const json = await res.json();
    const url = json?.files?.[0]?.url?.trim();
    if (!res.ok || !json?.success || !url || !url.startsWith("https://")) {
      throw new Error(`uguu.se \u4E0A\u4F20\u5931\u8D25 (${res.status})`);
    }
    const verified = await verifyDirectMp4Stream(url);
    if (!verified) {
      throw new Error("uguu.se \u76F4\u94FE MP4 206 \u6D41\u6821\u9A8C\u672A\u901A\u8FC7");
    }
    return {
      id: "uguu_mp4",
      label: "\u7EBF\u8DEF 2\uFF1A\u5907\u7528\u7EAF MP4 \u76F4\u94FE\uFF08uguu.se\uFF09",
      shortLabel: "\u7EBF\u8DEF2 \xB7 \u5907\u7528\u76F4\u94FE",
      url,
      description: "\u72EC\u7ACB\u7EAF MP4 \u89C6\u9891\u6D41\u76F4\u94FE\uFF08HTTP 206\uFF09\uFF0C\u4E0D\u8DF3\u8F6C\u4EFB\u4F55\u7B2C\u4E09\u65B9\u7F51\u9875\uFF0C\u9002\u5408\u4F5C\u4E3A\u7EBF\u8DEF 1 \u7684\u5907\u7528\u626B\u7801\u901A\u9053\u3002",
      verified: true,
      expiresHint: "3 \u5C0F\u65F6\u6709\u6548 \xB7 \u7EAFMP4\u76F4\u64AD",
      providerName: "uguu.se",
      expiresAtMs: Date.now() + 2.5 * 3600 * 1e3
    };
  } finally {
    clearTimeout(timer);
  }
}
async function uploadToX0(fileBuf, filename) {
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(fileBuf)], { type: "video/mp4" }), filename);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 16e3);
  try {
    const res = await fetch("https://x0.at/", {
      method: "POST",
      body: form,
      signal: controller.signal
    });
    const url = (await res.text()).trim();
    if (!res.ok || !url.startsWith("https://x0.at/")) {
      throw new Error(`x0.at \u4E0A\u4F20\u8FD4\u56DE\u5F02\u5E38 (${res.status}): ${url.slice(0, 80)}`);
    }
    const verified = await verifyDirectMp4Stream(url);
    if (!verified) {
      throw new Error("x0.at \u76F4\u94FE MP4 206 \u6D41\u6821\u9A8C\u672A\u901A\u8FC7");
    }
    return {
      id: "x0_mp4",
      label: "\u7EBF\u8DEF 3\uFF1A\u6781\u77ED\u7801\u7EAF MP4 \u76F4\u94FE\uFF08x0.at\uFF09",
      shortLabel: "\u7EBF\u8DEF3 \xB7 \u6781\u77ED\u76F4\u94FE",
      url,
      description: "\u6781\u77ED\u94FE\u63A5\u7EAF MP4 \u89C6\u9891\u6D41\uFF08HTTP 206 inline\uFF09\uFF0C\u4E0D\u8DF3\u8F6C\u4EFB\u4F55\u5E73\u53F0\u9875\u9762\uFF0C\u9002\u5408\u4F5C\u4E3A\u7B2C\u4E8C\u5907\u7528\u76F4\u94FE\u3002",
      verified: true,
      expiresHint: "3~30 \u5929\u6709\u6548 \xB7 \u7EAFMP4\u76F4\u64AD",
      providerName: "x0.at",
      expiresAtMs: Date.now() + 48 * 3600 * 1e3
    };
  } finally {
    clearTimeout(timer);
  }
}
async function warmCloudUploaders() {
}
function getCachedCloudShareBundle(key, mtimeMs, mp4Path) {
  const cached = bundleCache.get(key);
  if (cached && Math.floor(cached.mtimeMs) === Math.floor(mtimeMs)) {
    const fresh = filterFreshChannels(cached.channels);
    if (fresh.length > 0) {
      return { ...cached, channels: fresh };
    }
  }
  if (mp4Path) {
    const fromDisk = loadSidecarBundle(mp4Path, mtimeMs);
    if (fromDisk) {
      bundleCache.set(key, fromDisk);
      return fromDisk;
    }
  }
  return null;
}
async function publishMp4ToCloudChannels(key, mp4Path, force = false, fastFirst = true) {
  const stat = fs2.statSync(mp4Path);
  if (!force) {
    const cached = getCachedCloudShareBundle(key, stat.mtimeMs, mp4Path);
    if (cached && cached.channels.length > 0) {
      return cached;
    }
  }
  const inflightKey = `${key}:${Math.floor(stat.mtimeMs)}`;
  if (!force) {
    const existing = inFlightPublishes.get(inflightKey);
    if (existing) return existing;
  }
  const runPromise = (async () => {
    const fileBuf = fs2.readFileSync(mp4Path);
    const filename = `${key}_1080p.mp4`;
    const uploadedAt = (/* @__PURE__ */ new Date()).toISOString();
    const collectedChannels = [];
    const collectedErrors = {};
    const orderedProviders = [
      { id: "droptocdn_mp4", upload: () => uploadToDropToCdn(fileBuf, filename) },
      { id: "uguu_mp4", upload: () => uploadToUguu(fileBuf, filename) },
      { id: "x0_mp4", upload: () => uploadToX0(fileBuf, filename) }
    ];
    const syncCache = (pendingBackups) => {
      const snapshot = {
        key,
        mtimeMs: stat.mtimeMs,
        uploadedAt,
        channels: filterFreshChannels(collectedChannels),
        errors: { ...collectedErrors },
        pendingBackups
      };
      if (snapshot.channels.length > 0) {
        bundleCache.set(key, snapshot);
        saveSidecarBundle(mp4Path, snapshot);
      }
      return snapshot;
    };
    let nextIdx = 0;
    while (nextIdx < orderedProviders.length) {
      const prov = orderedProviders[nextIdx++];
      try {
        const ch = await prov.upload();
        collectedChannels.push(ch);
        if (fastFirst) {
          const hasRemaining = nextIdx < orderedProviders.length;
          const firstSnap = syncCache(hasRemaining);
          if (hasRemaining) {
            void (async () => {
              for (let i = nextIdx; i < orderedProviders.length; i++) {
                const backup = orderedProviders[i];
                try {
                  const bch = await backup.upload();
                  collectedChannels.push(bch);
                } catch (err) {
                  collectedErrors[backup.id] = err instanceof Error ? err.message : String(err);
                }
                syncCache(i + 1 < orderedProviders.length);
              }
              inFlightPublishes.delete(inflightKey);
              syncCache(false);
            })();
          } else {
            inFlightPublishes.delete(inflightKey);
          }
          return firstSnap;
        }
      } catch (err) {
        collectedErrors[prov.id] = err instanceof Error ? err.message : String(err);
      }
    }
    inFlightPublishes.delete(inflightKey);
    const finalBundle = syncCache(false);
    if (finalBundle.channels.length === 0) {
      throw new Error(
        `\u76F4\u94FE MP4 \u53D1\u5E03\u5931\u8D25\uFF1A${Object.entries(finalBundle.errors).map(([k, v]) => `${k}: ${v}`).join("\uFF1B")}`
      );
    }
    return finalBundle;
  })();
  inFlightPublishes.set(inflightKey, runPromise);
  return runPromise;
}

// src/server/mobilePlayerHtml.ts
function escapeHtml(input) {
  return input.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
function renderStandaloneMobilePlayerHtml(opts) {
  const safeTitle = escapeHtml(opts.title);
  const safeVideoUrl = escapeHtml(opts.videoUrl);
  const safeDownloadUrl = escapeHtml(opts.downloadUrl);
  const fps = Math.max(1, Math.round(opts.fps || 30));
  const sizeMb = (opts.sizeBytes / (1024 * 1024)).toFixed(2);
  const resTag = opts.width && opts.height ? `${opts.width}\xD7${opts.height} \xB7 ` : "";
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover" />
  <meta name="apple-mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
  <meta name="theme-color" content="#000000" />
  <title>${safeTitle} \u2014 \u5168\u5C4F\u5BA1\u7247</title>
  <style>
    *{box-sizing:border-box;-webkit-tap-highlight-color:transparent;margin:0;padding:0}
    html,body{width:100%;height:100%;background:#000;color:#fff;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Helvetica Neue",sans-serif;user-select:none}
    .stage{position:fixed;inset:0;width:100vw;height:100dvh;background:#000;overflow:hidden}
    video{width:100%;height:100%;display:block;object-fit:cover;background:#000}
    video.contain{object-fit:contain}
    .overlay{position:fixed;inset:0;z-index:20;background:rgba(0,0,0,.45);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:24px;text-align:center}
    .overlay.hide{display:none}
    .play-big{width:80px;height:80px;border-radius:999px;border:none;background:#fff;color:#0a0a0a;font-size:30px;display:flex;align-items:center;justify-content:center;cursor:pointer;box-shadow:0 12px 32px rgba(0,0,0,.55);padding-left:5px}
    .play-big:active{transform:scale(.94)}
    .ov-title{font-size:16px;font-weight:700;text-shadow:0 2px 10px rgba(0,0,0,.8)}
    .ov-sub{font-size:12px;color:#fcd34d}
    .ov-note{font-size:11px;color:rgba(255,255,255,.7)}
    .top-bar{position:fixed;left:0;right:0;top:0;z-index:15;padding:max(12px,env(safe-area-inset-top)) 14px 26px;background:linear-gradient(to bottom,rgba(0,0,0,.78),rgba(0,0,0,0));display:flex;align-items:center;justify-content:space-between;gap:10px;pointer-events:none;transition:opacity .2s}
    .top-title{font-size:12px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .frame-pill{font-size:11px;font-variant-numeric:tabular-nums;background:rgba(0,0,0,.55);border:1px solid rgba(255,255,255,.18);padding:4px 8px;border-radius:8px;white-space:nowrap}
    .hud{position:fixed;left:0;right:0;bottom:0;z-index:15;padding:28px 14px max(14px,env(safe-area-inset-bottom));background:linear-gradient(to top,rgba(0,0,0,.92),rgba(0,0,0,.7) 65%,rgba(0,0,0,0));display:flex;flex-direction:column;gap:10px;transition:opacity .2s}
    .hud.hide,.top-bar.hide{opacity:0;pointer-events:none}
    .scrub-row{display:flex;align-items:center;gap:8px}
    .time-txt{font-size:11px;font-variant-numeric:tabular-nums;color:rgba(255,255,255,.9);width:44px;flex-shrink:0}
    .time-txt.r{text-align:right;color:rgba(255,255,255,.65)}
    input[type=range]{flex:1;accent-color:#fbbf24;height:6px;cursor:pointer}
    .btn-row{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:6px}
    .grp{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
    .btn{border:1px solid rgba(255,255,255,.2);background:rgba(255,255,255,.12);color:#fff;border-radius:999px;padding:7px 11px;font-size:12px;font-weight:600;cursor:pointer;text-decoration:none;display:inline-flex;align-items:center;gap:4px}
    .btn:active{background:rgba(255,255,255,.25)}
    .btn.primary{background:#fff;color:#0a0a0a;border-color:#fff;padding:7px 14px;font-weight:700}
    .btn.gold{background:#fbbf24;color:#0a0a0a;border-color:#fbbf24;font-weight:700}
    .btn.on{background:rgba(16,185,129,.35);border-color:#34d399;color:#d1fae5}
    .safe-zone{position:fixed;inset:0;z-index:10;pointer-events:none;display:none}
    .safe-zone.show{display:block}
    .sz-top{position:absolute;top:0;left:0;right:0;height:5.6%;background:rgba(239,68,68,.24);border-bottom:1px dashed #f87171;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:#fee2e2}
    .sz-bot{position:absolute;bottom:0;left:0;right:0;height:17.7%;background:rgba(239,68,68,.24);border-top:1px dashed #f87171;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:#fee2e2}
    .sz-right{position:absolute;right:0;top:44.8%;bottom:17.7%;width:13.3%;background:rgba(249,115,22,.24);border-left:1px dashed #fb923c;display:flex;flex-direction:column;align-items:center;justify-content:space-around;padding:12px 0}
    .sz-dot{width:28px;height:28px;border-radius:999px;background:rgba(0,0,0,.6);border:1px solid #fdba74;color:#ffedd5;font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center}
    .hint{font-size:11px;color:#fcd34d;text-align:center;display:none}
    .hint.show{display:block}
  </style>
</head>
<body>
  <div class="stage" id="stage">
    <video id="vid" src="${safeVideoUrl}" playsinline webkit-playsinline="true" x5-playsinline="true" x5-video-player-type="h5-page" preload="auto"></video>

    <div class="safe-zone" id="safeZone">
      <div class="sz-top">\u9876\u90E8\u72B6\u6001\u680F\u7981\u533A</div>
      <div class="sz-bot">\u6296\u97F3\u5E95\u90E8\u6587\u6848\u4E0E\u8FDB\u5EA6\u6761\u906E\u6321\u533A</div>
      <div class="sz-right">
        <span class="sz-dot">\u8D5E</span><span class="sz-dot">\u8BC4</span><span class="sz-dot">\u85CF</span><span class="sz-dot">\u8F6C</span>
      </div>
    </div>

    <div class="overlay" id="startOverlay">
      <button class="play-big" id="startBtn" aria-label="\u5F00\u59CB\u5168\u5C4F\u64AD\u653E">\u25B6</button>
      <div class="ov-title">${safeTitle}</div>
      <div class="ov-sub">\u8F7B\u70B9\u64AD\u653E\u6296\u97F3\u5168\u5C4F\u539F\u753B\uFF08${resTag}\u542B\u5B8C\u6574\u7ACB\u4F53\u58F0 \xB7 ${sizeMb} MB\uFF09</div>
      <div class="ov-note">\u539F\u751F H.264 1080P \u786C\u4EF6\u89E3\u7801 \xB7 \u652F\u6301\u9010\u5E27\u68C0\u67E5\u4E0E\u4E00\u952E\u5B58\u76F8\u518C</div>
    </div>

    <div class="top-bar hide" id="topBar">
      <div class="top-title">${safeTitle}</div>
      <div class="frame-pill" id="framePill">\u5E27 0000</div>
    </div>

    <div class="hud hide" id="hud">
      <div class="hint" id="hint"></div>
      <div class="scrub-row">
        <span class="time-txt" id="curTime">0.00s</span>
        <input type="range" id="scrubber" min="0" max="1000" step="1" value="0" />
        <span class="time-txt r" id="durTime">0.0s</span>
      </div>
      <div class="btn-row">
        <div class="grp">
          <button class="btn primary" id="playBtn">\u6682\u505C</button>
          <button class="btn" id="prevFrameBtn">-1\u5E27</button>
          <button class="btn" id="nextFrameBtn">+1\u5E27</button>
          <button class="btn" id="replayBtn">\u91CD\u64AD</button>
          <button class="btn" id="muteBtn">\u6709\u58F0</button>
        </div>
        <div class="grp">
          <button class="btn" id="speedBtn">1\xD7</button>
          <button class="btn" id="safeBtn">\u6296\u97F3\u906E\u6321</button>
          <button class="btn" id="fitBtn">\u94FA\u6EE1</button>
          <a class="btn gold" href="${safeDownloadUrl}" download>\u5B58MP4</a>
        </div>
      </div>
    </div>
  </div>
  <script>
    (function(){
      var FPS = ${fps};
      var vid = document.getElementById('vid');
      var stage = document.getElementById('stage');
      var overlay = document.getElementById('startOverlay');
      var startBtn = document.getElementById('startBtn');
      var topBar = document.getElementById('topBar');
      var hud = document.getElementById('hud');
      var framePill = document.getElementById('framePill');
      var curTime = document.getElementById('curTime');
      var durTime = document.getElementById('durTime');
      var scrubber = document.getElementById('scrubber');
      var playBtn = document.getElementById('playBtn');
      var prevFrameBtn = document.getElementById('prevFrameBtn');
      var nextFrameBtn = document.getElementById('nextFrameBtn');
      var replayBtn = document.getElementById('replayBtn');
      var muteBtn = document.getElementById('muteBtn');
      var speedBtn = document.getElementById('speedBtn');
      var safeBtn = document.getElementById('safeBtn');
      var safeZone = document.getElementById('safeZone');
      var fitBtn = document.getElementById('fitBtn');
      var hint = document.getElementById('hint');
      var started = false, hudVisible = false, hideTimer = null, speeds = [0.5, 1, 1.5], spIdx = 1;

      if (window.innerWidth > window.innerHeight) {
        vid.classList.add('contain');
        fitBtn.textContent = '\u5B8C\u6574\u5E27';
      }

      function showHud(autoHide) {
        hudVisible = true;
        topBar.classList.remove('hide');
        hud.classList.remove('hide');
        if (hideTimer) clearTimeout(hideTimer);
        if (autoHide && !vid.paused) {
          hideTimer = setTimeout(function(){
            if (!vid.paused) {
              hudVisible = false;
              topBar.classList.add('hide');
              hud.classList.add('hide');
            }
          }, 2600);
        }
      }

      function syncUi() {
        var t = vid.currentTime || 0;
        var d = isFinite(vid.duration) && vid.duration > 0 ? vid.duration : 0;
        curTime.textContent = t.toFixed(2) + 's';
        durTime.textContent = d.toFixed(1) + 's';
        var f = Math.round(t * FPS);
        var tf = Math.max(1, Math.round(d * FPS));
        framePill.textContent = '\u5E27 ' + String(f).padStart(4,'0') + ' / ' + tf;
        if (d > 0) {
          scrubber.max = String(tf);
          scrubber.value = String(Math.min(tf, f));
        }
        playBtn.textContent = vid.paused ? (d > 0 && t >= d - 0.08 ? '\u91CD\u64AD' : '\u7EE7\u7EED') : '\u6682\u505C';
        muteBtn.textContent = vid.muted ? '\u5DF2\u9759\u97F3' : '\u6709\u58F0';
      }

      function startPlay(fromZero) {
        started = true;
        overlay.classList.add('hide');
        if (fromZero) vid.currentTime = 0;
        var p = vid.play();
        if (p && p.then) {
          p.then(function(){
            hint.classList.remove('show');
            syncUi();
            showHud(true);
          }).catch(function(){
            vid.muted = true;
            hint.textContent = '\u7CFB\u7EDF\u62E6\u622A\u81EA\u52A8\u53D1\u58F0\uFF0C\u5DF2\u9759\u97F3\u64AD\u653E\uFF0C\u70B9\u4E0B\u65B9\u300C\u5DF2\u9759\u97F3\u300D\u6062\u590D\u58F0\u97F3';
            hint.classList.add('show');
            vid.play().catch(function(){});
            syncUi();
            showHud(false);
          });
        } else {
          syncUi();
          showHud(true);
        }
      }

      startBtn.addEventListener('click', function(e){ e.stopPropagation(); startPlay(false); });
      overlay.addEventListener('click', function(){ startPlay(false); });
      hud.addEventListener('click', function(e){ e.stopPropagation(); });

      stage.addEventListener('click', function(){
        if (!started) { startPlay(false); return; }
        if (vid.paused) { startPlay(false); return; }
        if (hudVisible) {
          hudVisible = false;
          topBar.classList.add('hide');
          hud.classList.add('hide');
        } else {
          showHud(true);
        }
      });

      playBtn.addEventListener('click', function(){
        if (vid.paused) {
          var d = vid.duration || 0;
          startPlay(d > 0 && vid.currentTime >= d - 0.08);
        } else {
          vid.pause();
          syncUi();
          showHud(false);
        }
      });

      prevFrameBtn.addEventListener('click', function(){
        vid.pause();
        vid.currentTime = Math.max(0, (vid.currentTime || 0) - 1 / FPS);
        syncUi();
        showHud(false);
      });

      nextFrameBtn.addEventListener('click', function(){
        vid.pause();
        var d = vid.duration || 9999;
        vid.currentTime = Math.min(d, (vid.currentTime || 0) + 1 / FPS);
        syncUi();
        showHud(false);
      });

      replayBtn.addEventListener('click', function(){ startPlay(true); });
      muteBtn.addEventListener('click', function(){ vid.muted = !vid.muted; syncUi(); });
      speedBtn.addEventListener('click', function(){
        spIdx = (spIdx + 1) % speeds.length;
        vid.playbackRate = speeds[spIdx];
        speedBtn.textContent = speeds[spIdx] + '\xD7';
      });
      safeBtn.addEventListener('click', function(){
        var on = safeZone.classList.toggle('show');
        safeBtn.classList.toggle('on', on);
      });
      fitBtn.addEventListener('click', function(){
        var isContain = vid.classList.toggle('contain');
        fitBtn.textContent = isContain ? '\u5B8C\u6574\u5E27' : '\u94FA\u6EE1';
      });

      scrubber.addEventListener('input', function(){
        vid.pause();
        vid.currentTime = Number(scrubber.value) / FPS;
        syncUi();
        showHud(false);
      });

      vid.addEventListener('loadedmetadata', syncUi);
      vid.addEventListener('timeupdate', syncUi);
      vid.addEventListener('pause', function(){ syncUi(); showHud(false); });
      vid.addEventListener('ended', function(){ syncUi(); showHud(false); });
    })();
  </script>
</body>
</html>`;
}

// server.ts
var execFileAsync = promisify(execFile);
var PORT = Number(process.env.PORT || 3e3);
var EPISODE_ID_RE = /^[A-Za-z0-9_-]+$/;
var episodesRootDir = path3.resolve(process.cwd(), "episodes");
var previewsRootDir = path3.join(episodesRootDir, "_previews");
var assetsRootDir = path3.resolve(process.cwd(), "assets");
var ALLOWED_TTS_VOICES = /* @__PURE__ */ new Set(["Charon", "Kore", "Puck", "Fenrir", "Aoede", "Zephyr"]);
function sendBufferWithRange(req, res, buf, contentType, filename) {
  const total = buf.length;
  res.setHeader("Content-Type", contentType);
  res.setHeader("Accept-Ranges", "bytes");
  res.setHeader("Cache-Control", "no-store");
  if (filename) {
    res.setHeader("Content-Disposition", `inline; filename="${filename}"`);
  }
  const rangeHeader = req.headers.range;
  if (rangeHeader && rangeHeader.startsWith("bytes=")) {
    const parts = rangeHeader.replace(/^bytes=/, "").split("-");
    const start = parts[0] ? parseInt(parts[0], 10) : 0;
    const end = parts[1] ? Math.min(total - 1, parseInt(parts[1], 10)) : total - 1;
    if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || start > end || start >= total) {
      res.status(416).setHeader("Content-Range", `bytes */${total}`).end();
      return;
    }
    const chunk = buf.subarray(start, end + 1);
    res.status(206);
    res.setHeader("Content-Range", `bytes ${start}-${end}/${total}`);
    res.setHeader("Content-Length", String(chunk.length));
    res.send(chunk);
    return;
  }
  res.setHeader("Content-Length", String(total));
  res.send(buf);
}
function getMobilePreviewPath(previewKey) {
  return path3.join(previewsRootDir, `${previewKey}.mp4`);
}
var videoDimCache = /* @__PURE__ */ new Map();
function probeVideoDimensions(filePath, mtimeMs) {
  const cached = videoDimCache.get(filePath);
  if (cached && Math.floor(cached.mtimeMs) === Math.floor(mtimeMs)) {
    return { width: cached.width, height: cached.height };
  }
  try {
    const out = spawnSync2(
      "ffprobe",
      [
        "-v",
        "error",
        "-select_streams",
        "v:0",
        "-show_entries",
        "stream=width,height",
        "-of",
        "csv=p=0:s=x",
        filePath
      ],
      { encoding: "utf-8", timeout: 4e3, windowsHide: true }
    );
    const match = (out.stdout || "").trim().match(/^(\d+)x(\d+)$/);
    if (match) {
      const width = Number(match[1]);
      const height = Number(match[2]);
      if (width > 0 && height > 0) {
        videoDimCache.set(filePath, { mtimeMs, width, height });
        return { width, height };
      }
    }
  } catch {
  }
  return null;
}
var cachedFfmpegBinary;
function probeFfmpegBinary(candidate) {
  try {
    const res = spawnSync2(candidate, ["-version"], {
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
  if (fs3.existsSync("/usr/bin/ffmpeg")) {
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
  return path3.join(episodesRootDir, id, "episode.json");
}
function getEpisodeVoiceoverPath(id) {
  return path3.join(episodesRootDir, id, "voiceover.wav");
}
function loadEpisodeManifest(id) {
  if (!isValidEpisodeId(id)) return null;
  const manifestPath = getEpisodeManifestPath(id);
  if (!fs3.existsSync(manifestPath)) return null;
  const raw = fs3.readFileSync(manifestPath, "utf-8");
  return JSON.parse(raw);
}
function buildEpisodeAudioPcmWithOptionalVoice(episodeId, episode, includeVoice = true, sampleRate = 44100) {
  const bgm = synthesizeEpisodeAudioPcm(episode, sampleRate);
  if (!includeVoice) return bgm;
  const voPath = getEpisodeVoiceoverPath(episodeId);
  if (!fs3.existsSync(voPath)) return bgm;
  try {
    const wavBytes = new Uint8Array(fs3.readFileSync(voPath));
    const decoded = decodeWavToMonoFloat32(wavBytes);
    const duckingDb = episode.audio?.duckingDb ?? -13;
    return mixVoiceoverIntoStereoPcm(bgm, decoded.samples, decoded.sampleRate, duckingDb);
  } catch (err) {
    console.warn(`Failed to mix voiceover for ${episodeId}, falling back to pure BGM:`, err);
    return bgm;
  }
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
      fs3.rmSync(sess.dir, { recursive: true, force: true });
      sessions.delete(id);
    }
  }
}, 5 * 60 * 1e3).unref();
async function startServer() {
  const app = express();
  app.use(express.json({ limit: "80mb" }));
  void warmCloudUploaders();
  app.use("/episodes", express.static(episodesRootDir));
  app.use("/assets", express.static(assetsRootDir));
  app.get("/api/health", (_req, res) => {
    const ffmpegBin = resolveFfmpegBinary();
    res.json({
      ok: true,
      ffmpeg: Boolean(ffmpegBin),
      ffmpegPath: ffmpegBin ?? null,
      ttsConfigured: Boolean(process.env.GEMINI_API_KEY?.trim())
    });
  });
  app.get("/api/runtime-info", (req, res) => {
    const envAppUrl = (process.env.APP_URL || "").trim().replace(/\/+$/, "");
    const proto = req.headers["x-forwarded-proto"]?.split(",")[0]?.trim() || req.protocol;
    const host = req.headers["x-forwarded-host"]?.split(",")[0]?.trim() || req.get("host") || "";
    const requestOrigin = host ? `${proto}://${host}` : "";
    const baseUrl = envAppUrl || requestOrigin;
    const sharedAppUrl = baseUrl.includes("://ais-dev-") ? baseUrl.replace("://ais-dev-", "://ais-pre-") : baseUrl;
    const tunnel = mobileTunnel.getSnapshot();
    res.json({
      appUrl: baseUrl,
      sharedAppUrl,
      requestOrigin,
      tunnelUrl: tunnel.url,
      tunnel,
      ffmpegAvailable: Boolean(resolveFfmpegBinary())
    });
  });
  app.get("/api/mobile-tunnel/status", (_req, res) => {
    res.json(mobileTunnel.getSnapshot());
  });
  app.post("/api/mobile-tunnel/start", async (req, res) => {
    const force = req.query.force === "1" || req.body?.force === true;
    const snapshot = await mobileTunnel.start(PORT, force);
    res.json(snapshot);
  });
  app.post("/api/mobile-tunnel/stop", (_req, res) => {
    res.json(mobileTunnel.stop());
  });
  app.get("/api/runtime-info/check-share", async (req, res) => {
    const envAppUrl = (process.env.APP_URL || "").trim().replace(/\/+$/, "");
    const proto = req.headers["x-forwarded-proto"]?.split(",")[0]?.trim() || req.protocol;
    const host = req.headers["x-forwarded-host"]?.split(",")[0]?.trim() || req.get("host") || "";
    const requestOrigin = host ? `${proto}://${host}` : "";
    const baseUrl = envAppUrl || requestOrigin;
    const defaultSharedUrl = baseUrl.includes("://ais-dev-") ? baseUrl.replace("://ais-dev-", "://ais-pre-") : baseUrl;
    let targetOrigin = defaultSharedUrl;
    const requestedOrigin = typeof req.query.origin === "string" ? req.query.origin.trim().replace(/\/+$/, "") : "";
    if (requestedOrigin) {
      try {
        const parsed = new URL(requestedOrigin);
        const h = parsed.hostname.toLowerCase();
        const isPrivate = parsed.protocol !== "https:" || h === "localhost" || h.endsWith(".local") || h.endsWith(".internal") || /^(\d{1,3}\.){3}\d{1,3}$/.test(h) || h.includes(":");
        if (!isPrivate) {
          targetOrigin = parsed.origin;
        }
      } catch {
      }
    }
    if (!targetOrigin || !targetOrigin.startsWith("http")) {
      res.json({ sharedAppUrl: targetOrigin, reachable: false, mode: "unreachable", statusCode: 0 });
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4500);
    try {
      const probeRes = await fetch(`${targetOrigin}/api/health`, {
        method: "GET",
        redirect: "manual",
        signal: controller.signal
      });
      const location = probeRes.headers.get("location") || "";
      if (probeRes.status === 200) {
        res.json({
          sharedAppUrl: targetOrigin,
          reachable: true,
          mode: "public_open",
          statusCode: 200
        });
        return;
      }
      if ((probeRes.status === 301 || probeRes.status === 302 || probeRes.status === 307) && (location.includes("__cookie_check") || location.includes("applet-auth-bridge") || location.includes("accounts.google.com"))) {
        res.json({
          sharedAppUrl: targetOrigin,
          reachable: false,
          mode: "auth_gated",
          statusCode: probeRes.status
        });
        return;
      }
      res.json({
        sharedAppUrl: targetOrigin,
        reachable: false,
        mode: probeRes.status === 404 ? "not_published" : "unreachable",
        statusCode: probeRes.status
      });
    } catch {
      res.json({
        sharedAppUrl: targetOrigin,
        reachable: false,
        mode: "unreachable",
        statusCode: 0
      });
    } finally {
      clearTimeout(timer);
    }
  });
  app.get("/api/mobile-preview/:key/status", (req, res) => {
    const key = String(req.params.key || "").trim();
    if (!isValidEpisodeId(key)) {
      res.status(400).json({ error: "Invalid preview key" });
      return;
    }
    const filePath = getMobilePreviewPath(key);
    if (!fs3.existsSync(filePath)) {
      res.json({ ready: false, key, cloudChannels: [] });
      return;
    }
    const stat = fs3.statSync(filePath);
    const dims = probeVideoDimensions(filePath, stat.mtimeMs);
    const cachedBundle = getCachedCloudShareBundle(key, stat.mtimeMs, filePath);
    res.json({
      ready: true,
      key,
      sizeBytes: stat.size,
      width: dims?.width ?? null,
      height: dims?.height ?? null,
      updatedAt: stat.mtime.toISOString(),
      playerPath: `/m/${encodeURIComponent(key)}`,
      videoUrl: `/api/mobile-preview/${encodeURIComponent(key)}/video.mp4?v=${Math.floor(stat.mtimeMs)}`,
      downloadUrl: `/api/mobile-preview/${encodeURIComponent(key)}/download`,
      cloudChannels: cachedBundle?.channels ?? [],
      cloudErrors: cachedBundle?.errors ?? {},
      pendingBackups: Boolean(cachedBundle?.pendingBackups)
    });
  });
  app.get("/m/:key", (req, res) => {
    const key = String(req.params.key || "").trim();
    if (!isValidEpisodeId(key)) {
      res.status(400).send("Invalid preview key");
      return;
    }
    const filePath = getMobilePreviewPath(key);
    if (!fs3.existsSync(filePath)) {
      if (key.startsWith("ep_")) {
        res.redirect(302, `/?mobile=1&episode=${encodeURIComponent(key.slice(3))}`);
      } else if (key.startsWith("mode_")) {
        res.redirect(302, `/?mobile=1&mode=${encodeURIComponent(key.slice(5))}`);
      } else {
        res.redirect(302, "/?mobile=1");
      }
      return;
    }
    const stat = fs3.statSync(filePath);
    let title = "QuantReel \u5168\u5C4F\u5BA1\u7247";
    let fps = 30;
    if (key.startsWith("ep_")) {
      const ep = loadEpisodeManifest(key.slice(3));
      if (ep) {
        title = ep.title || ep.id;
        fps = ep.spec?.fps || 30;
      }
    } else if (key === "mode_1120_v2") {
      title = "11.20 \u76D8\u524D\u98CE\u5411\uFF08v2 \u7CBE\u4FEE\u7206\u6B3E\u7248\uFF09";
    } else if (key === "mode_1120_intel") {
      title = "11.20 \u76D8\u524D\u98CE\u5411\uFF08v1 \u5B58\u6863\u7248\uFF09";
    } else if (key === "mode_morning_brief") {
      title = "11.19 \u76D8\u524D\u65E9\u62A5";
    } else if (key === "mode_1117_close") {
      title = "11.17 \u6536\u76D8\u8D44\u91D1\u6D41\u5411\u590D\u523B";
    }
    const dims = probeVideoDimensions(filePath, stat.mtimeMs);
    const html = renderStandaloneMobilePlayerHtml({
      title,
      videoUrl: `/api/mobile-preview/${encodeURIComponent(key)}/video.mp4?v=${Math.floor(stat.mtimeMs)}`,
      downloadUrl: `/api/mobile-preview/${encodeURIComponent(key)}/download`,
      fps,
      sizeBytes: stat.size,
      width: dims?.width,
      height: dims?.height
    });
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.send(html);
  });
  app.get("/api/mobile-preview/:key/video.mp4", (req, res) => {
    const key = String(req.params.key || "").trim();
    if (!isValidEpisodeId(key)) {
      res.status(400).json({ error: "Invalid preview key" });
      return;
    }
    const filePath = getMobilePreviewPath(key);
    if (!fs3.existsSync(filePath)) {
      res.status(404).json({ error: "Mobile preview MP4 not yet rendered" });
      return;
    }
    res.setHeader("Content-Type", "video/mp4");
    res.setHeader("Content-Disposition", `inline; filename="${key}_preview.mp4"`);
    res.setHeader("Cache-Control", "no-cache");
    res.sendFile(filePath);
  });
  app.get("/api/mobile-preview/:key/download", (req, res) => {
    const key = String(req.params.key || "").trim();
    if (!isValidEpisodeId(key)) {
      res.status(400).json({ error: "Invalid preview key" });
      return;
    }
    const filePath = getMobilePreviewPath(key);
    if (!fs3.existsSync(filePath)) {
      res.status(404).json({ error: "Mobile preview MP4 not yet rendered" });
      return;
    }
    res.download(filePath, `${key}_mobile_preview.mp4`);
  });
  app.post("/api/mobile-preview/:key/publish-cloud", async (req, res) => {
    const key = String(req.params.key || "").trim();
    if (!isValidEpisodeId(key)) {
      res.status(400).json({ error: "Invalid preview key" });
      return;
    }
    const filePath = getMobilePreviewPath(key);
    if (!fs3.existsSync(filePath)) {
      res.status(404).json({ error: "\u8BF7\u5148\u751F\u6210\u624B\u673A\u9AD8\u6E05 MP4 \u7F13\u5B58\u540E\u518D\u53D1\u5E03\u4E91\u7AEF\u626B\u7801\u94FE\u63A5" });
      return;
    }
    const force = req.body?.force === true;
    try {
      const bundle = await publishMp4ToCloudChannels(key, filePath, force, true);
      res.json({
        ok: true,
        ...bundle
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "\u4E91\u7AEF\u76F4\u8FDE\u901A\u9053\u53D1\u5E03\u5931\u8D25";
      res.status(502).json({ error: message });
    }
  });
  app.post(
    "/api/mobile-preview/:key/upload-mp4",
    express.raw({ type: ["application/octet-stream", "video/mp4"], limit: "80mb" }),
    async (req, res) => {
      const key = String(req.params.key || "").trim();
      if (!isValidEpisodeId(key)) {
        res.status(400).json({ error: "Invalid preview key" });
        return;
      }
      const bodyBuf = Buffer.isBuffer(req.body) ? req.body : null;
      if (!bodyBuf || bodyBuf.length < 1024) {
        res.status(400).json({ error: "Uploaded MP4 payload is empty or invalid" });
        return;
      }
      const muxAudio = req.query.muxAudio === "1";
      const shouldPublish = req.query.publish !== "0";
      const episodeId = typeof req.query.episodeId === "string" ? req.query.episodeId.trim() : "";
      const track = typeof req.query.track === "string" ? req.query.track.trim() : "1120_v2";
      try {
        fs3.mkdirSync(previewsRootDir, { recursive: true });
        const destPath = getMobilePreviewPath(key);
        if (!muxAudio) {
          const tmpPath = `${destPath}.${crypto.randomBytes(4).toString("hex")}.tmp`;
          fs3.writeFileSync(tmpPath, bodyBuf);
          fs3.renameSync(tmpPath, destPath);
        } else {
          const ffmpegBin = resolveFfmpegBinary();
          if (!ffmpegBin) {
            res.status(503).json({ error: "FFmpeg binary not available for audio mux" });
            return;
          }
          const tmpDir = fs3.mkdtempSync(path3.join(os2.tmpdir(), "quantreel-fastmux-"));
          try {
            const rawMp4 = path3.join(tmpDir, "video.mp4");
            const wavPath = path3.join(tmpDir, "audio.wav");
            const outMp4 = path3.join(tmpDir, "out.mp4");
            fs3.writeFileSync(rawMp4, bodyBuf);
            let pcm;
            if (episodeId && isValidEpisodeId(episodeId)) {
              const ep = loadEpisodeManifest(episodeId);
              if (ep) {
                pcm = buildEpisodeAudioPcmWithOptionalVoice(episodeId, ep, true, 44100);
              }
            }
            if (!pcm) {
              pcm = track === "1120_v2" ? synthesizeIntelV2TrackPcm(44100) : track === "1120" ? synthesizeIntelTrackPcm(44100) : synthesizeTrackPcm(44100);
            }
            fs3.writeFileSync(wavPath, Buffer.from(encodeStereoWav(pcm)));
            await execFileAsync(ffmpegBin, [
              "-y",
              "-i",
              rawMp4,
              "-i",
              wavPath,
              "-map",
              "0:v:0",
              "-map",
              "1:a:0",
              "-c:v",
              "copy",
              "-c:a",
              "aac",
              "-b:a",
              "96k",
              "-movflags",
              "+faststart",
              "-shortest",
              outMp4
            ]);
            fs3.copyFileSync(outMp4, destPath);
          } finally {
            fs3.rmSync(tmpDir, { recursive: true, force: true });
          }
        }
        const stat = fs3.statSync(destPath);
        const dims = probeVideoDimensions(destPath, stat.mtimeMs);
        let bundle = null;
        if (shouldPublish) {
          bundle = await publishMp4ToCloudChannels(key, destPath, true, true);
        }
        res.json({
          ok: true,
          key,
          sizeBytes: stat.size,
          width: dims?.width ?? null,
          height: dims?.height ?? null,
          downloadUrl: `/api/mobile-preview/${encodeURIComponent(key)}/download`,
          channels: bundle?.channels ?? [],
          errors: bundle?.errors ?? {},
          pendingBackups: Boolean(bundle?.pendingBackups)
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : "\u9AD8\u901F MP4 \u4E0A\u4F20\u4E0E\u53D1\u5E03\u5931\u8D25";
        res.status(500).json({ error: message });
      }
    }
  );
  app.get("/api/episodes", (_req, res) => {
    try {
      if (!fs3.existsSync(episodesRootDir)) {
        res.json({ episodes: [] });
        return;
      }
      const entries = fs3.readdirSync(episodesRootDir, { withFileTypes: true });
      const episodes = [];
      for (const entry of entries) {
        if (!entry.isDirectory() || entry.name.startsWith("_") || !isValidEpisodeId(entry.name)) {
          continue;
        }
        const manifestPath = getEpisodeManifestPath(entry.name);
        if (!fs3.existsSync(manifestPath)) continue;
        try {
          const raw = fs3.readFileSync(manifestPath, "utf-8");
          const episode = JSON.parse(raw);
          if (!isValidEpisodeManifestBody(episode)) continue;
          const tl = compileEpisodeTimeline(episode);
          const episodeId = episode.id || entry.name;
          const hookScene = episode.scenes.find((s) => s.kind === "hook_live_video");
          const firstPosterScene = episode.scenes.find(
            (s) => s.kind === "animated_poster_stage" || s.kind === "v3_editorial_story"
          );
          const hasNarration = episode.scenes.some(
            (s) => typeof s.narration === "string" && s.narration.trim().length > 0
          );
          const hasVoiceover = fs3.existsSync(getEpisodeVoiceoverPath(episodeId));
          episodes.push({
            id: episodeId,
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
            posterSrc: hookScene?.kind === "hook_live_video" ? hookScene.data.posterSrc : firstPosterScene && (firstPosterScene.kind === "animated_poster_stage" || firstPosterScene.kind === "v3_editorial_story") ? firstPosterScene.data.imageSrc : void 0,
            hasNarration,
            hasVoiceover,
            versionTag: episode.metadata?.versionTag
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
      const targetDir = path3.join(episodesRootDir, id);
      fs3.mkdirSync(targetDir, { recursive: true });
      const manifest = {
        ...req.body,
        id
      };
      fs3.writeFileSync(
        path3.join(targetDir, "episode.json"),
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
  app.post("/api/episodes/:id/voiceover", async (req, res) => {
    const id = String(req.params.id || "");
    if (!isValidEpisodeId(id)) {
      res.status(400).json({ error: "Invalid episode id" });
      return;
    }
    const apiKey = process.env.GEMINI_API_KEY?.trim();
    if (!apiKey) {
      res.status(503).json({
        error: "\u670D\u52A1\u7AEF\u672A\u914D\u7F6E GEMINI_API_KEY\uFF0C\u6682\u65E0\u6CD5\u5408\u6210 AI \u4E3B\u64AD\u914D\u97F3\uFF08\u8BF7\u5728 AI Studio Secrets \u4E2D\u914D\u7F6E\u540E\u91CD\u8BD5\uFF09\u3002"
      });
      return;
    }
    const episode = loadEpisodeManifest(id);
    if (!episode) {
      res.status(404).json({ error: `Episode "${id}" not found` });
      return;
    }
    const tl = compileEpisodeTimeline(episode);
    const narratedShots = tl.shots.filter(
      (s) => typeof s.scene.narration === "string" && s.scene.narration.trim().length > 0
    );
    if (narratedShots.length === 0) {
      res.status(400).json({ error: "\u5F53\u524D\u5267\u96C6\u6CA1\u6709\u914D\u7F6E\u5206\u955C\u53E3\u64AD\u7A3F\uFF08narration\uFF09" });
      return;
    }
    const requestedVoice = typeof req.body?.voiceName === "string" ? req.body.voiceName.trim() : "Charon";
    const voiceName = ALLOWED_TTS_VOICES.has(requestedVoice) ? requestedVoice : "Charon";
    try {
      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: { headers: { "User-Agent": "aistudio-build" } }
      });
      const masterRate = 24e3;
      const masterSamples = new Float32Array(Math.ceil(tl.durationSec * masterRate));
      for (const shot of narratedShots) {
        const script = shot.scene.narration.trim();
        const response = await ai.models.generateContent({
          model: "gemini-3.8-flash-lite-tts",
          contents: [{ parts: [{ text: script }] }],
          config: {
            responseModalities: ["AUDIO"],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: { voiceName }
              }
            },
            speechMetadata: {
              style: "\u5E72\u7EC3\u4E13\u4E1A\u3001\u8282\u594F\u660E\u5FEB\u7684\u4E2D\u6587\u8D22\u7ECF\u76D8\u524D\u65E9\u62A5\u4E3B\u64AD\uFF0C\u5410\u5B57\u6E05\u6670\u5229\u843D\uFF0C\u8BED\u901F\u7D27\u51D1\u81EA\u7136"
            }
          }
        });
        const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
        if (!base64Audio) {
          throw new Error(`\u573A\u666F ${shot.id} \u914D\u97F3\u8FD4\u56DE\u7A7A\u97F3\u9891`);
        }
        const wavBuf = new Uint8Array(Buffer.from(base64Audio, "base64"));
        const decoded = decodeWavToMonoFloat32(wavBuf);
        const startOffsetSec = shot.startSec + 0.14;
        const shotDurationSec = Math.max(0.5, shot.endSec - shot.startSec);
        const maxClipDurSec = Math.max(0.5, shotDurationSec - 0.18);
        const startSample = Math.floor(startOffsetSec * masterRate);
        const maxWriteSamples = Math.min(
          Math.floor(maxClipDurSec * masterRate),
          masterSamples.length - startSample
        );
        const resampleRatio = decoded.sampleRate / masterRate;
        const srcFrames = Math.floor(decoded.samples.length / resampleRatio);
        const writeLen = Math.min(srcFrames, maxWriteSamples);
        const fadeSamples = Math.min(Math.floor(masterRate * 0.04), Math.floor(writeLen * 0.15));
        for (let i = 0; i < writeLen; i++) {
          const srcPos = i * resampleRatio;
          const idx = Math.floor(srcPos);
          const frac = srcPos - idx;
          const s0 = decoded.samples[idx] ?? 0;
          const s1 = decoded.samples[idx + 1] ?? s0;
          let sample = s0 + (s1 - s0) * frac;
          if (i >= writeLen - fadeSamples && fadeSamples > 0) {
            sample *= (writeLen - i) / fadeSamples;
          }
          const destIdx = startSample + i;
          if (destIdx >= 0 && destIdx < masterSamples.length) {
            masterSamples[destIdx] = Math.max(-1, Math.min(1, masterSamples[destIdx] + sample));
          }
        }
      }
      const masterWav = encodeMonoWav(masterSamples, masterRate);
      const outPath = getEpisodeVoiceoverPath(id);
      fs3.writeFileSync(outPath, Buffer.from(masterWav));
      res.json({
        ok: true,
        id,
        voiceName,
        clipCount: narratedShots.length,
        sizeBytes: masterWav.byteLength,
        mixedAudioUrl: `/api/audio/bgm.wav?episodeId=${encodeURIComponent(id)}&t=${Date.now()}`
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "AI \u4E3B\u64AD\u914D\u97F3\u5408\u6210\u5931\u8D25";
      res.status(500).json({ error: message });
    }
  });
  app.get("/api/hooks", (_req, res) => {
    try {
      const hooksManifestPath = path3.join(assetsRootDir, "hooks", "manifest.json");
      if (!fs3.existsSync(hooksManifestPath)) {
        res.status(404).json({ error: "Hooks manifest not found" });
        return;
      }
      const raw = fs3.readFileSync(hooksManifestPath, "utf-8");
      res.json(JSON.parse(raw));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load hooks manifest";
      res.status(500).json({ error: message });
    }
  });
  const wavBufferCache = /* @__PURE__ */ new Map();
  const setWavCache = (key, buf, filename) => {
    if (wavBufferCache.has(key)) wavBufferCache.delete(key);
    wavBufferCache.set(key, { buf, filename });
    if (wavBufferCache.size > 6) {
      const oldestKey = wavBufferCache.keys().next().value;
      if (oldestKey) wavBufferCache.delete(oldestKey);
    }
  };
  app.get("/api/audio/bgm.wav", (req, res) => {
    const episodeId = typeof req.query.episodeId === "string" ? req.query.episodeId.trim() : "";
    const includeVoice = req.query.includeVoice !== "0";
    if (episodeId) {
      if (!isValidEpisodeId(episodeId)) {
        res.status(400).json({ error: "Invalid episodeId" });
        return;
      }
      try {
        const epPath = getEpisodeManifestPath(episodeId);
        if (!fs3.existsSync(epPath)) {
          res.status(404).json({ error: `Episode "${episodeId}" not found` });
          return;
        }
        const voPath = getEpisodeVoiceoverPath(episodeId);
        const epMtime = fs3.statSync(epPath).mtimeMs;
        const voMtime = includeVoice && fs3.existsSync(voPath) ? fs3.statSync(voPath).mtimeMs : 0;
        const cacheKey2 = `ep:${episodeId}:${includeVoice ? 1 : 0}:${epMtime}:${voMtime}`;
        const cached2 = wavBufferCache.get(cacheKey2);
        if (cached2) {
          sendBufferWithRange(req, res, cached2.buf, "audio/wav", cached2.filename);
          return;
        }
        const episode = loadEpisodeManifest(episodeId);
        if (!episode) {
          res.status(404).json({ error: `Episode "${episodeId}" not found` });
          return;
        }
        const pcm2 = buildEpisodeAudioPcmWithOptionalVoice(episodeId, episode, includeVoice, 44100);
        const wavBuf2 = Buffer.from(encodeStereoWav(pcm2));
        const filename2 = `${episodeId}_editorial_mix.wav`;
        setWavCache(cacheKey2, wavBuf2, filename2);
        sendBufferWithRange(req, res, wavBuf2, "audio/wav", filename2);
        return;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to synthesize episode audio";
        res.status(500).json({ error: message });
        return;
      }
    }
    const track = String(req.query.track || "1120_v2");
    const cacheKey = `track:${track}`;
    const cached = wavBufferCache.get(cacheKey);
    if (cached) {
      sendBufferWithRange(req, res, cached.buf, "audio/wav", cached.filename);
      return;
    }
    const pcm = track === "1120_v2" ? synthesizeIntelV2TrackPcm(44100) : track === "1120" ? synthesizeIntelTrackPcm(44100) : synthesizeTrackPcm(44100);
    const wavBuf = Buffer.from(encodeStereoWav(pcm));
    const filename = track === "1120_v2" ? "1120_v2_112bpm_editorial.wav" : track === "1120" ? "1120_108bpm_editorial_mix.wav" : "1117_129.2bpm_bgm.wav";
    setWavCache(cacheKey, wavBuf, filename);
    sendBufferWithRange(req, res, wavBuf, "audio/wav", filename);
  });
  app.post("/api/export/init", (req, res) => {
    const {
      totalFrames = 900,
      width = 1080,
      height = 1920,
      fps = 30,
      track = "1120",
      episodeId,
      includeVoice = true,
      persistPreviewKey
    } = req.body ?? {};
    let validatedPreviewKey;
    if (typeof persistPreviewKey === "string" && persistPreviewKey.trim()) {
      const cleanKey = persistPreviewKey.trim();
      if (!isValidEpisodeId(cleanKey)) {
        res.status(400).json({ error: "Invalid persistPreviewKey" });
        return;
      }
      validatedPreviewKey = cleanKey;
    }
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
    const dir = fs3.mkdtempSync(path3.join(os2.tmpdir(), `quantreel-${sessionId}-`));
    sessions.set(sessionId, {
      dir,
      totalFrames: Number(totalFrames),
      width: Number(width),
      height: Number(height),
      fps: resolvedFps,
      track: String(track),
      episodeId: validatedEpisodeId,
      includeVoice: includeVoice !== false,
      persistPreviewKey: validatedPreviewKey,
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
      fs3.writeFileSync(path3.join(sess.dir, fileName), buf);
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
      const wavPath = path3.join(sess.dir, "bgm.wav");
      const mp4Path = path3.join(sess.dir, "output.mp4");
      let pcm;
      if (sess.episodeId) {
        const episode = loadEpisodeManifest(sess.episodeId);
        if (!episode) {
          res.status(404).json({ error: `Episode "${sess.episodeId}" not found` });
          return;
        }
        pcm = buildEpisodeAudioPcmWithOptionalVoice(
          sess.episodeId,
          episode,
          sess.includeVoice !== false,
          44100
        );
      } else {
        pcm = sess.track === "1120_v2" ? synthesizeIntelV2TrackPcm(44100) : sess.track === "1120" ? synthesizeIntelTrackPcm(44100) : synthesizeTrackPcm(44100);
      }
      const wav = encodeStereoWav(pcm);
      fs3.writeFileSync(wavPath, Buffer.from(wav));
      const isMobileBake = Boolean(sess.persistPreviewKey);
      await execFileAsync(ffmpegBin, [
        "-y",
        "-framerate",
        String(sess.fps || 30),
        "-i",
        path3.join(sess.dir, "frame_%04d.jpg"),
        "-i",
        wavPath,
        "-vf",
        "scale=trunc(iw/2)*2:trunc(ih/2)*2",
        "-c:v",
        "libx264",
        "-profile:v",
        "main",
        "-level",
        "4.1",
        "-pix_fmt",
        "yuv420p",
        "-crf",
        isMobileBake ? "21" : "18",
        "-preset",
        isMobileBake ? "ultrafast" : "veryfast",
        "-c:a",
        "aac",
        "-b:a",
        isMobileBake ? "128k" : "192k",
        "-movflags",
        "+faststart",
        "-shortest",
        mp4Path
      ]);
      const stat = fs3.statSync(mp4Path);
      sess.mp4Path = mp4Path;
      let previewVideoUrl;
      if (sess.persistPreviewKey) {
        fs3.mkdirSync(previewsRootDir, { recursive: true });
        const destPath = getMobilePreviewPath(sess.persistPreviewKey);
        fs3.copyFileSync(mp4Path, destPath);
        previewVideoUrl = `/api/mobile-preview/${encodeURIComponent(sess.persistPreviewKey)}/video.mp4?v=${Date.now()}`;
      }
      res.json({
        ok: true,
        sizeBytes: stat.size,
        downloadUrl: `/api/export/${req.params.sessionId}/download`,
        ...previewVideoUrl ? { previewVideoUrl } : {}
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "FFmpeg render failed";
      res.status(500).json({ error: message });
    }
  });
  app.get("/api/export/:sessionId/download", (req, res) => {
    const sess = sessions.get(req.params.sessionId);
    if (!sess?.mp4Path || !fs3.existsSync(sess.mp4Path)) {
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
    const distDir = path3.resolve(process.cwd(), "dist");
    app.use(express.static(distDir));
    app.get("*", (_req, res) => {
      res.sendFile(path3.join(distDir, "index.html"));
    });
  } else {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true, allowedHosts: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  }
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`QuantReel Studio listening on http://0.0.0.0:${PORT}`);
    if (process.env.DISABLE_AUTO_TUNNEL !== "true" && process.env.NODE_ENV !== "production") {
      void mobileTunnel.start(PORT);
    }
  });
}
startServer();
export {
  resolveFfmpegBinary
};
