import type { StereoPcm } from '../audio/synthAudio';
import type { EpisodeManifest } from './schema';
import { compileEpisodeTimeline, resolveMarketBoardTiming } from './timeline';

/**
 * Dynamic BPM-synced editorial stereo audio synthesizer driven purely by EpisodeManifest.
 * Automatically aligns:
 * - Hook impact slam (frame +8 of every hook_live_video scene)
 * - Market board card pops & typewriter key ticks (from scene timing)
 * - Dual-spotlight switch click & physical stamp thud
 * - Whooshes at every compiled scene cut boundary
 */
export function synthesizeEpisodeAudioPcm(
  episode: EpisodeManifest,
  sampleRate = 44100
): StereoPcm {
  const tl = compileEpisodeTimeline(episode);
  const durationSec = tl.durationSec;
  const totalSamples = Math.floor(sampleRate * durationSec);
  const left = new Float32Array(totalSamples);
  const right = new Float32Array(totalSamples);

  const bpm = tl.bpm || 112;
  const beatDur = 60 / bpm;
  const fps = tl.fps || 30;

  const chords = [
    [220.0, 261.63, 329.63, 440.0], // Am
    [174.61, 220.0, 261.63, 349.23], // Fmaj7
    [196.0, 246.94, 293.66, 392.0], // G
    [261.63, 329.63, 392.0, 493.88], // Cmaj7
  ];
  const bassRoots = [55.0, 43.65, 49.0, 65.41];

  const cutTimes = tl.cutFrames.map((f) => f / fps);
  const memeImpactSecs: number[] = [];
  const typeWindows: Array<[number, number]> = [];
  const cardPopTimes: Array<{ t: number; pitchIdx: number }> = [];
  const spotlightSnapSecs: number[] = [];
  const stampThudSecs: number[] = [];

  for (const shot of tl.shots) {
    if (shot.scene.kind === 'hook_live_video') {
      memeImpactSecs.push((shot.startFrame + 8) / fps);
    } else if (shot.scene.kind === 'market_chrono_board') {
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
    } else if (shot.scene.kind === 'event_dual_spotlight') {
      const switchF = shot.scene.data.switchFrame ?? 70;
      const stampF = shot.scene.data.stampFrame ?? 90;
      spotlightSnapSecs.push((shot.startFrame + switchF) / fps);
      stampThudSecs.push((shot.startFrame + stampF) / fps);
    }
  }

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

    // Subtle typewriter key-ticks during typing windows
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
    const bass = Math.sin(2 * Math.PI * bassFreq * t) * Math.exp(-beatPhase * 4.2) * 0.24;

    let sfx = 0;

    // Hook shockwave slam
    for (let m = 0; m < memeImpactSecs.length; m++) {
      const dMeme = t - memeImpactSecs[m];
      if (dMeme >= 0 && dMeme < 0.34) {
        sfx +=
          Math.sin(2 * Math.PI * (165 * Math.exp(-dMeme * 14) + 48) * dMeme) *
          Math.exp(-dMeme * 12) *
          0.48;
        sfx += lp * Math.exp(-dMeme * 18) * 0.14;
      }
    }

    // Card entrance pop chimes
    for (let p = 0; p < cardPopTimes.length; p++) {
      const dp = t - cardPopTimes[p].t;
      if (dp >= 0 && dp < 0.18) {
        sfx +=
          Math.sin(2 * Math.PI * (440 + cardPopTimes[p].pitchIdx * 85) * dp) *
          Math.exp(-dp * 22) *
          0.14;
      }
    }

    // Dual-spotlight switch click & physical stamp thud
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
