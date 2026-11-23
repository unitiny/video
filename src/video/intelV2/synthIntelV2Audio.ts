import type { StereoPcm } from '../audio/synthAudio';
import { INTEL_V2_SPEC, SHOT2_PART_TIMING } from './intelV2Data';
import { INTEL_V2_CUT_FRAMES, INTEL_V2_SHOTS } from './intelV2Timeline';

/**
 * 112 BPM Precision Financial Motion Sound Design synced dynamically to 6-shot INTEL_V2_SHOTS:
 * - Shot 01: Fast punchy meme slam impact at frame 8 + curtain close whoosh
 * - Shot 02: Typewriter clicks & card pop ticks synchronized to SHOT2_PART_TIMING (78..497)
 * - Shot 04: Spotlight switch snap + stamp thud
 * - Cut whooshes at every scene boundary
 */
export function synthesizeIntelV2TrackPcm(
  sampleRate = 44100,
  durationSec: number = INTEL_V2_SPEC.durationSec
): StereoPcm {
  const totalSamples = Math.floor(sampleRate * durationSec);
  const left = new Float32Array(totalSamples);
  const right = new Float32Array(totalSamples);

  const bpm = INTEL_V2_SPEC.bpm;
  const beatDur = 60 / bpm;

  const chords = [
    [220.0, 261.63, 329.63, 440.0], // Am
    [174.61, 220.0, 261.63, 349.23], // Fmaj7
    [196.0, 246.94, 293.66, 392.0], // G
    [261.63, 329.63, 392.0, 493.88], // Cmaj7
  ];
  const bassRoots = [55.0, 43.65, 49.0, 65.41];

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
    [(s2Base + SHOT2_PART_TIMING.a50NoteStart) / fps, (s2Base + SHOT2_PART_TIMING.a50NoteEnd) / fps],
  ];
  const cardPopTimes = [
    (s2Base + SHOT2_PART_TIMING.usStart + 4) / fps,
    (s2Base + SHOT2_PART_TIMING.asiaStart + 2) / fps,
    (s2Base + SHOT2_PART_TIMING.commodityStart + 2) / fps,
    (s2Base + SHOT2_PART_TIMING.a50Start + 4) / fps,
  ];

  const spotlightSnapSec = (shot4.startFrame + 70) / fps;
  const stampThudSec = (shot4.startFrame + 90) / fps;

  let lfsr = 0x6c8e9cf5;
  const nextNoise = () => {
    lfsr ^= lfsr << 13;
    lfsr ^= lfsr >>> 17;
    lfsr ^= lfsr << 5;
    return ((lfsr >>> 0) / 4294967296) * 2 - 1;
  };
  let lp = 0;

  for (let i = 0; i < totalSamples; i++) {
    const t = i / sampleRate;

    let masterEnv = 1.0;
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

    // Tight electronic pulse kick
    let kick = 0;
    if (beatPhase < 0.13) {
      const kEnv = Math.exp(-beatPhase * 28);
      const kFreq = 50 + 95 * Math.exp(-beatPhase * 42);
      kick = Math.sin(2 * Math.PI * kFreq * beatPhase) * kEnv * 0.35;
    }

    // Subtle typewriter key-ticks during Shot 02 explanation typing windows
    let dataTick = 0;
    const inTypeWindow = typeWindows.some(([ws, we]) => t >= ws && t <= we);
    if (inTypeWindow && sixteenthPhase < 0.015) {
      dataTick =
        Math.sin(2 * Math.PI * (1280 + (sixteenthIdx % 4) * 210) * sixteenthPhase) *
        Math.exp(-sixteenthPhase * 190) *
        0.075;
    }

    // Harmonic arpeggio keys
    const chord = chords[barIndex % chords.length];
    const eighthFloat = beatFloat * 2;
    const eighthIdx = Math.floor(eighthFloat);
    const eighthPhase = (eighthFloat - eighthIdx) * (beatDur * 0.5);
    const note = chord[eighthIdx % chord.length];
    const pluck =
      (Math.sin(2 * Math.PI * note * t) * 0.7 + Math.sin(4 * Math.PI * note * t) * 0.16) *
      Math.exp(-eighthPhase * 6.5) *
      0.17;
    const pan = ((eighthIdx % 4) - 1.5) * 0.22;

    // Bass anchor
    const bassFreq = bassRoots[barIndex % bassRoots.length];
    const bass =
      Math.sin(2 * Math.PI * bassFreq * t) *
      Math.exp(-beatPhase * 4.2) *
      0.24;

    let sfx = 0;

    // Shot 01 "今天很关键" meme shockwave slam
    const dMeme = t - memeImpactSec;
    if (dMeme >= 0 && dMeme < 0.34) {
      sfx += Math.sin(2 * Math.PI * (165 * Math.exp(-dMeme * 14) + 48) * dMeme) * Math.exp(-dMeme * 12) * 0.48;
      sfx += lp * Math.exp(-dMeme * 18) * 0.14;
    }

    // Shot 02 row entrance pop chimes
    for (let p = 0; p < cardPopTimes.length; p++) {
      const dp = t - cardPopTimes[p];
      if (dp >= 0 && dp < 0.18) {
        sfx += Math.sin(2 * Math.PI * (440 + p * 85) * dp) * Math.exp(-dp * 22) * 0.14;
      }
    }

    // Shot 04 Spotlight switch click & stamp thud
    const dl = t - spotlightSnapSec;
    if (dl >= 0 && dl < 0.09) {
      sfx += ((n - lp) * 0.25 + Math.sin(2 * Math.PI * 980 * dl) * 0.2) * Math.exp(-dl * 45);
    }
    const dt = t - stampThudSec;
    if (dt >= 0 && dt < 0.22) {
      sfx += (Math.sin(2 * Math.PI * 76 * dt) * 0.6 + lp * 0.35) * Math.exp(-dt * 22);
    }

    // Whoosh on scene cuts
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
