import type { StereoPcm } from '../audio/synthAudio';
import { INTEL_CUT_FRAMES } from './intelTimeline';
import { INTEL_VIDEO_SPEC } from './intelData';

/**
 * 108 BPM Multi-Style Editorial Soundtrack:
 * - Shot 1 (0.0-3.33s): Tense meme build + 0.6s freeze-frame impact slam + whip whoosh
 * - Shot 2 (3.33-8.67s): Crisp ticker-pulse marimba & rhythmic sub-bass for global markets
 * - Shots 3-5 (8.67-24.0s): Groove-driven editorial keys with custom SFX (paper snap, stamp thud, bubble pop)
 * - Shot 6 (24.0-30.0s): Confident resolving chord cadence
 */
export function synthesizeIntelTrackPcm(
  sampleRate = 44100,
  durationSec: number = INTEL_VIDEO_SPEC.durationSec
): StereoPcm {
  const totalSamples = Math.floor(sampleRate * durationSec);
  const left = new Float32Array(totalSamples);
  const right = new Float32Array(totalSamples);

  const bpm = INTEL_VIDEO_SPEC.bpm; // 108 BPM energetic editorial pulse
  const beatDur = 60 / bpm;

  // Dynamic editorial chord progression: Am9 -> Fmaj7 -> Cmaj7 -> Em7
  const chords = [
    [220.0, 261.63, 329.63, 493.88],
    [174.61, 220.0, 261.63, 329.63],
    [261.63, 329.63, 392.0, 493.88],
    [196.0, 246.94, 293.66, 392.0],
  ];
  const bassRoots = [55.0, 43.65, 65.41, 49.0];

  const cutTimes = INTEL_CUT_FRAMES.map((f) => f / INTEL_VIDEO_SPEC.fps);

  // Special timed SFX markers (seconds)
  const freezeSlamSec = 18 / 30; // 0.60s: "今天很关键!!" freeze-frame slam
  const stampImpactSec = (410 + 68) / 30; // 15.93s: "尚未量产 · 警惕" rubber stamp thud
  const bubblePopTimes = [(560 + 26) / 30, (560 + 66) / 30]; // Comic bubbles popping

  let lfsr = 0x51a79d33;
  const nextNoise = () => {
    lfsr ^= lfsr << 13;
    lfsr ^= lfsr >>> 17;
    lfsr ^= lfsr << 5;
    return ((lfsr >>> 0) / 4294967296) * 2 - 1;
  };

  let lpState = 0;

  for (let i = 0; i < totalSamples; i++) {
    const t = i / sampleRate;

    let masterEnv = 1.0;
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

    // 1. Punchy Editorial Kick & Tight Hi-Hat Groove (pauses briefly right before 0.6s freeze slam)
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

    // 2. Pluck / Marimba Syncopation (extra crisp during Market Telemetry Shot 2)
    const chord = chords[barIndex % chords.length];
    let keysL = 0;
    let keysR = 0;
    const note = chord[eighthIndex % chord.length];
    const pluckEnv = Math.exp(-eighthPhase * (t < 8.67 ? 9.5 : 5.5));
    const pluckWave =
      Math.sin(2 * Math.PI * note * t) * 0.68 + Math.sin(4 * Math.PI * note * t) * 0.18;
    const pan = ((eighthIndex % 4) - 1.5) * 0.22;
    const pluckGain = t < 3.33 ? 0.14 : 0.2;
    keysL += pluckWave * pluckEnv * pluckGain * (1 - pan);
    keysR += pluckWave * pluckEnv * pluckGain * (1 + pan);

    // Warm pad layer from Shot 3 onward
    if (t >= 8.67) {
      for (let c = 0; c < chord.length; c++) {
        const padEnv = Math.exp(-barPhase * 0.45) * 0.065;
        const padSig = Math.sin(2 * Math.PI * chord[c] * 0.5 * t) * padEnv;
        keysL += padSig;
        keysR += padSig;
      }
    }

    // 3. Sub-Bass Pulse
    const bassFreq = bassRoots[barIndex % bassRoots.length];
    const bassEnv = Math.exp(-beatPhase * 4.5);
    const bass = Math.sin(2 * Math.PI * bassFreq * t) * bassEnv * (inMemeTensionGap ? 0.05 : 0.28);

    // 4. Custom Scene SFX: Freeze-frame slam, Stamp impact, Bubble pops, Whip cuts
    let sfx = 0;

    // 0.60s Meme Freeze-Frame Slam ("今天很关键!!")
    const df = t - freezeSlamSec;
    if (df >= 0 && df < 0.28) {
      const slamEnv = Math.exp(-df * 18);
      const dropFreq = 160 * Math.exp(-df * 10) + 42;
      sfx += (Math.sin(2 * Math.PI * dropFreq * df) * 0.6 + lpState * 0.35) * slamEnv;
    }

    // Stamp Impact at 15.93s ("尚未量产 · 警惕")
    const ds = t - stampImpactSec;
    if (ds >= 0 && ds < 0.22) {
      const stEnv = Math.exp(-ds * 24);
      sfx += (Math.sin(2 * Math.PI * 82 * ds) * 0.55 + lpState * 0.4) * stEnv;
    }

    // Comic Bubble Pops
    for (let b = 0; b < bubblePopTimes.length; b++) {
      const db = t - bubblePopTimes[b];
      if (db >= 0 && db < 0.11) {
        const popFreq = 460 + db * 2800;
        sfx += Math.sin(2 * Math.PI * popFreq * db) * Math.exp(-db * 32) * 0.24;
      }
    }

    // Whip-Whoosh on Scene Cuts
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
