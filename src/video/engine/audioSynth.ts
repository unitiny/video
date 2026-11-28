import type { StereoPcm } from '../audio/synthAudio';
import type { EpisodeAudioMood, EpisodeManifest } from './schema';
import { compileEpisodeTimeline, resolveMarketBoardTiming } from './timeline';

/**
 * Studio-grade BPM-synced editorial stereo audio synthesizer driven by EpisodeManifest.
 * - Preserves legacy synthesis behavior for older episodes without `episode.audio`
 * - When `episode.audio` is configured (v3 episodes):
 *   * 3 mood harmonic/rhythmic profiles (`tense_pulse`, `editorial_lofi`, `catalyst_drive`)
 *   * 0.5s Brand Audio Logo (crisp warm fifth + octave chime at t = 0..0.5s)
 *   * Per-scene dynamic energy envelope (hook surge -> data groove -> story focus -> cheatsheet resolve)
 *   * Pre-impact micro-breaths before scene cuts & physical stamp slams
 *   * Richer Foley SFX synced to v3 hooks, market pulses, gauges, VS split drops, and chain ignitions
 */
export function synthesizeEpisodeAudioPcm(
  episode: EpisodeManifest,
  sampleRate = 44100
): StereoPcm {
  if (episode.audio?.mood === 'cinema_impact') {
    return synthesizeCinemaImpactAudioPcm(episode, sampleRate);
  }
  if (episode.audio) {
    return synthesizeStudioV3AudioPcm(episode, sampleRate);
  }
  return synthesizeLegacyEpisodeAudioPcm(episode, sampleRate);
}

function synthesizeLegacyEpisodeAudioPcm(
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
    } else if (shot.scene.kind === 'animated_poster_stage') {
      shot.scene.data.beats.forEach((beat, bIdx) => {
        const beatAbsSec = (shot.startFrame + beat.enterFrame) / fps;
        if (beat.sfx === 'snap') {
          spotlightSnapSecs.push(beatAbsSec);
        } else if (beat.sfx === 'stamp') {
          spotlightSnapSecs.push(beatAbsSec);
          stampThudSecs.push((shot.startFrame + beat.enterFrame + 6) / fps);
        } else {
          cardPopTimes.push({ t: beatAbsSec, pitchIdx: bIdx % 4 });
        }
        if (beat.stampText && beat.sfx !== 'stamp') {
          stampThudSecs.push((shot.startFrame + beat.enterFrame + 6) / fps);
        }
      });
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

    let kick = 0;
    if (beatPhase < 0.13) {
      const kEnv = Math.exp(-beatPhase * 28);
      const kFreq = 50 + 95 * Math.exp(-beatPhase * 42);
      kick = Math.sin(2 * Math.PI * kFreq * beatPhase) * kEnv * 0.35;
    }

    let dataTick = 0;
    const inTypeWindow = typeWindows.some(([ws, we]) => t >= ws && t <= we);
    if (inTypeWindow && sixteenthPhase < 0.015) {
      dataTick =
        Math.sin(2 * Math.PI * (1280 + (sixteenthIdx % 4) * 210) * sixteenthPhase) *
        Math.exp(-sixteenthPhase * 190) *
        0.075;
    }

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

    const bassFreq = bassRoots[barIndex % bassRoots.length];
    const bass = Math.sin(2 * Math.PI * bassFreq * t) * Math.exp(-beatPhase * 4.2) * 0.24;

    let sfx = 0;
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

    for (let p = 0; p < cardPopTimes.length; p++) {
      const dp = t - cardPopTimes[p].t;
      if (dp >= 0 && dp < 0.18) {
        sfx +=
          Math.sin(2 * Math.PI * (440 + cardPopTimes[p].pitchIdx * 85) * dp) *
          Math.exp(-dp * 22) *
          0.14;
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

interface StudioMoodProfile {
  chords: number[][];
  bassRoots: number[];
  padGain: number;
  hatGain: number;
  kickGain: number;
}

const STUDIO_MOODS: Record<EpisodeAudioMood, StudioMoodProfile> = {
  editorial_lofi: {
    // Warm Bloomberg/Financial-Times Rhodes jazz-electronic progression (Dm9 - Bbmaj7 - Gm9 - A7sus4)
    chords: [
      [293.66, 349.23, 440.0, 523.25],
      [233.08, 293.66, 349.23, 440.0],
      [196.0, 233.08, 293.66, 349.23],
      [220.0, 293.66, 329.63, 392.0],
    ],
    bassRoots: [73.42, 58.27, 49.0, 55.0],
    padGain: 0.14,
    hatGain: 0.055,
    kickGain: 0.28,
  },
  tense_pulse: {
    // Minor urgent pulse (Cm9 - Abmaj7 - Fm9 - Gsus4)
    chords: [
      [261.63, 311.13, 392.0, 466.16],
      [207.65, 261.63, 311.13, 392.0],
      [174.61, 207.65, 261.63, 311.13],
      [196.0, 261.63, 293.66, 349.23],
    ],
    bassRoots: [65.41, 51.91, 43.65, 49.0],
    padGain: 0.12,
    hatGain: 0.07,
    kickGain: 0.34,
  },
  catalyst_drive: {
    // Uplifting futuristic tech progression (Em9 - Cmaj7 - Dadd9 - Bm7)
    chords: [
      [329.63, 392.0, 493.88, 587.33],
      [261.63, 329.63, 392.0, 493.88],
      [293.66, 369.99, 440.0, 587.33],
      [246.94, 293.66, 369.99, 440.0],
    ],
    bassRoots: [82.41, 65.41, 73.42, 61.74],
    padGain: 0.15,
    hatGain: 0.065,
    kickGain: 0.31,
  },
  cinema_impact: {
    // High-energy cinematic broadcast progression (Dm - Bb - C - A)
    chords: [
      [293.66, 349.23, 440.0, 587.33],
      [233.08, 293.66, 349.23, 466.16],
      [261.63, 329.63, 392.0, 523.25],
      [220.0, 277.18, 329.63, 440.0],
    ],
    bassRoots: [73.42, 58.27, 65.41, 55.0],
    padGain: 0.2,
    hatGain: 0.1,
    kickGain: 0.44,
  },
};

/**
 * High-impact, wide-stereo, louder 122 BPM cinematic electronic soundtrack for v4 episodes:
 * - Fat layered sub-kick + stereo clap/snare + driving 16th-note hi-hat groove
 * - Sidechain-pumped octave bassline + wide detuned synth-brass power stabs + sparkling stereo arp
 * - Frame-accurate synced SFX for real-meme hook, market board reveals, and all 3 v4 slice posters
 */
function synthesizeCinemaImpactAudioPcm(
  episode: EpisodeManifest,
  sampleRate = 44100
): StereoPcm {
  const tl = compileEpisodeTimeline(episode);
  const durationSec = tl.durationSec;
  const totalSamples = Math.floor(sampleRate * durationSec);
  const left = new Float32Array(totalSamples);
  const right = new Float32Array(totalSamples);

  const bpm = tl.bpm || 122;
  const beatDur = 60 / bpm;
  const fps = tl.fps || 30;
  const enableAudioLogo = episode.audio?.audioLogo !== false;

  // Driving epic cinematic progression (Dm -> Bb -> C -> A)
  const chords = [
    [293.66, 349.23, 440.0, 587.33],
    [233.08, 293.66, 349.23, 466.16],
    [261.63, 329.63, 392.0, 523.25],
    [220.0, 277.18, 329.63, 440.0],
  ];
  const bassRoots = [73.42, 58.27, 65.41, 55.0];

  const cutTimes = tl.cutFrames.map((f) => f / fps);
  const impactSlams: Array<{ t: number; gain: number }> = [];
  const whooshEvents: Array<{ t: number; pitch: number }> = [];
  const chimeEvents: Array<{ t: number; freq: number; gain: number }> = [];
  const typeWindows: Array<[number, number]> = [];
  const rocketRumbles: Array<[number, number]> = [];
  const shotRanges: Array<{ start: number; end: number; energy: number; fullDrums: boolean }> = [];

  for (const shot of tl.shots) {
    const base = shot.startFrame;
    const sStart = shot.startSec;
    const sEnd = shot.endSec;

    if (shot.scene.kind === 'hook_live_video') {
      shotRanges.push({ start: sStart, end: sEnd, energy: 1.2, fullDrums: true });
      if (shot.scene.data.hookStyle === 'v4_reversal_cut') {
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
    } else if (shot.scene.kind === 'market_chrono_board') {
      shotRanges.push({ start: sStart, end: sEnd, energy: 0.96, fullDrums: true });
      const timing = resolveMarketBoardTiming(shot.scene.data.timing);
      typeWindows.push(
        [(base + timing.usTypeStart) / fps, (base + timing.usTypeEnd) / fps],
        [(base + timing.asiaTypeStart) / fps, (base + timing.asiaTypeEnd) / fps],
        [(base + timing.commodityTypeStart) / fps, (base + timing.commodityTypeEnd) / fps],
        [(base + timing.a50NoteStart) / fps, (base + timing.a50NoteEnd) / fps]
      );
      chimeEvents.push(
        { t: (base + timing.usStart + 3) / fps, freq: 523.25, gain: 0.16 },
        { t: (base + timing.asiaStart + 2) / fps, freq: 587.33, gain: 0.16 },
        { t: (base + timing.commodityStart + 2) / fps, freq: 659.25, gain: 0.15 },
        { t: (base + timing.a50Start + 3) / fps, freq: 783.99, gain: 0.2 }
      );
      impactSlams.push({ t: (base + timing.a50Start) / fps, gain: 0.42 });
    } else if (shot.scene.kind === 'animated_poster_stage') {
      const style = shot.scene.data.presentationStyle;
      shotRanges.push({ start: sStart, end: sEnd, energy: 1.14, fullDrums: true });

      if (style === 'v4_slice_inflation') {
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
          { t: (base + 134) / fps, freq: 440.0, gain: 0.19 },
          { t: (base + 142) / fps, freq: 392.0, gain: 0.22 }
        );
      } else if (style === 'v4_slice_compute') {
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
          { t: (base + 126) / fps, freq: 880.0, gain: 0.22 }
        );
      } else if (style === 'v4_slice_aerospace') {
        rocketRumbles.push([sStart, (base + 34) / fps]);
        whooshEvents.push(
          { t: (base + 46) / fps, pitch: 880 },
          { t: (base + 120) / fps, pitch: 980 }
        );
        impactSlams.push(
          { t: (base + 6) / fps, gain: 0.48 },
          { t: (base + 54) / fps, gain: 0.44 }
        );
        const relayNotes = [587.33, 659.25, 783.99, 880.0, 1174.66];
        relayNotes.forEach((f, idx) => {
          chimeEvents.push({ t: (base + 124 + idx * 9) / fps, freq: f, gain: 0.23 });
        });
      } else {
        shot.scene.data.beats.forEach((b, idx) => {
          chimeEvents.push({ t: (base + b.enterFrame) / fps, freq: 523.25 + idx * 80, gain: 0.16 });
        });
      }
    } else {
      shotRanges.push({ start: sStart, end: sEnd, energy: 1.0, fullDrums: true });
    }
  }

  let lfsr = 0x73b9d41f;
  const nextNoise = () => {
    lfsr ^= lfsr << 13;
    lfsr ^= lfsr >>> 17;
    lfsr ^= lfsr << 5;
    return ((lfsr >>> 0) / 4294967296) * 2 - 1;
  };
  let lp = 0;
  let hpPrev = 0;

  for (let i = 0; i < totalSamples; i++) {
    const t = i / sampleRate;

    let masterEnv = 1.0;
    if (t < 0.025) masterEnv = t / 0.025;
    if (t > durationSec - 0.75) masterEnv = Math.max(0, (durationSec - t) / 0.75);

    let sceneEnergy = 1.0;
    for (let s = 0; s < shotRanges.length; s++) {
      if (t >= shotRanges[s].start && t < shotRanges[s].end) {
        sceneEnergy = shotRanges[s].energy;
        break;
      }
    }

    // Tight 42ms pre-impact breath duck before major cuts for massive drop punch
    let breathDuck = 1.0;
    for (let c = 0; c < cutTimes.length; c++) {
      const dc = cutTimes[c] - t;
      if (dc > 0 && dc < 0.045) {
        breathDuck = Math.min(breathDuck, 0.28 + (dc / 0.045) * 0.72);
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

    // Sidechain ducking curve synced to every kick beat
    const sidechain = 0.42 + 0.58 * Math.min(1, beatPhase / 0.14);

    // 1. Fat Modern Punch Kick (4-on-the-floor drive)
    let kick = 0;
    if (beatPhase < 0.16) {
      const kEnv = Math.exp(-beatPhase * 22);
      const kFreq = 48 + 145 * Math.exp(-beatPhase * 48);
      const click = beatPhase < 0.008 ? (1 - beatPhase / 0.008) * 0.26 : 0;
      kick = (Math.sin(2 * Math.PI * kFreq * beatPhase) * kEnv * 0.46 + click) * sceneEnergy;
    }

    // 2. Crisp Stereo Snare / Clap on beats 2 & 4
    let snareL = 0;
    let snareR = 0;
    if ((beatInBar === 1 || beatInBar === 3) && beatPhase < 0.13) {
      const sEnv = Math.exp(-beatPhase * 26);
      const body = Math.sin(2 * Math.PI * 195 * beatPhase) * Math.exp(-beatPhase * 38) * 0.22;
      const snap = hp * sEnv * 0.24;
      snareL = (body + snap * 1.06) * sceneEnergy;
      snareR = (body + snap * 0.94) * sceneEnergy;
    }

    // 3. Driving 16th-Note Hi-Hat Groove
    let hat = 0;
    const isOffEighth = sixteenthIdx % 4 === 2;
    const hatAccent = isOffEighth ? 1.0 : sixteenthIdx % 2 === 1 ? 0.48 : 0.25;
    if (sixteenthPhase < 0.042) {
      hat = hp * Math.exp(-sixteenthPhase * (isOffEighth ? 55 : 95)) * 0.11 * hatAccent * sceneEnergy;
    }

    // 4. Rolling Octave Electronic Sub-Bass (sidechained)
    const rootFreq = bassRoots[barIndex % bassRoots.length];
    const bassFreq = eighthIdx % 2 === 1 ? rootFreq * 2 : rootFreq;
    const bassEnv = Math.exp(-eighthPhase * 5.2);
    const bassWave =
      Math.sin(2 * Math.PI * bassFreq * t) * 0.72 +
      Math.sin(4 * Math.PI * bassFreq * t) * 0.22 +
      Math.sin(6 * Math.PI * bassFreq * t) * 0.08;
    const bass = bassWave * bassEnv * sidechain * 0.34 * sceneEnergy;

    // 5. Wide Detuned Synth-Brass / Supersaw Power Stabs on bar hits & beat 2.5 push
    const chord = chords[barIndex % chords.length];
    const stab1Env = Math.min(1, barPhase / 0.015) * Math.exp(-barPhase * 1.55);
    const pushPhase = barPhase - beatDur * 2.5;
    const stab2Env =
      pushPhase >= 0 ? Math.min(1, pushPhase / 0.012) * Math.exp(-pushPhase * 3.8) * 0.65 : 0;
    const stabEnv = (stab1Env + stab2Env) * sidechain;

    let synthL = 0;
    let synthR = 0;
    if (stabEnv > 0.005) {
      for (let c = 0; c < chord.length; c++) {
        const f = chord[c];
        const vL =
          Math.sin(2 * Math.PI * (f * 0.996) * t) * 0.65 +
          Math.sin(4 * Math.PI * (f * 0.996) * t) * 0.22 +
          Math.sin(6 * Math.PI * (f * 0.996) * t) * 0.1;
        const vR =
          Math.sin(2 * Math.PI * (f * 1.004) * t) * 0.65 +
          Math.sin(4 * Math.PI * (f * 1.004) * t) * 0.22 +
          Math.sin(6 * Math.PI * (f * 1.004) * t) * 0.1;
        synthL += vL;
        synthR += vR;
      }
      synthL *= 0.068 * stabEnv * sceneEnergy;
      synthR *= 0.068 * stabEnv * sceneEnergy;
    }

    // 6. Energetic Stereo 16th-Note Kinetic Arp Pluck
    const arpFreq = chord[(sixteenthIdx * 3) % chord.length] * (sixteenthIdx % 8 === 7 ? 2 : 1);
    const arpTone =
      (Math.sin(2 * Math.PI * arpFreq * t) * 0.72 + Math.sin(4 * Math.PI * arpFreq * t) * 0.24) *
      Math.exp(-sixteenthPhase * 15) *
      0.085 *
      sidechain *
      sceneEnergy;
    const arpPan = ((sixteenthIdx % 4) - 1.5) * 0.34;

    // 7. Brand Audio Logo (crisp bright broadcast flourish at t = 0..0.48s)
    let logoL = 0;
    let logoR = 0;
    if (enableAudioLogo && t < 0.55) {
      const notes = [
        { onset: 0.01, freq: 587.33, pan: -0.3 },
        { onset: 0.11, freq: 880.0, pan: 0.0 },
        { onset: 0.21, freq: 1174.66, pan: 0.3 },
      ];
      for (const ln of notes) {
        const dt = t - ln.onset;
        if (dt >= 0 && dt < 0.34) {
          const env = Math.min(1, dt / 0.006) * Math.exp(-dt * 10);
          const tone =
            (Math.sin(2 * Math.PI * ln.freq * dt) * 0.75 +
              Math.sin(2 * Math.PI * ln.freq * 2 * dt) * 0.25) *
            env *
            0.2;
          logoL += tone * (1 - ln.pan);
          logoR += tone * (1 + ln.pan);
        }
      }
    }

    // 8. Tactile Ticker Micro-Ticks during typewriter spans
    let dataTick = 0;
    const inTypeWindow = typeWindows.some(([ws, we]) => t >= ws && t <= we);
    if (inTypeWindow && sixteenthPhase < 0.012) {
      dataTick =
        Math.sin(2 * Math.PI * (1520 + (sixteenthIdx % 4) * 200) * sixteenthPhase) *
        Math.exp(-sixteenthPhase * 210) *
        0.058;
    }

    // 9. Cinematic Impacts, Whooshes, Chimes, Rocket Rumble
    let sfxL = 0;
    let sfxR = 0;

    for (let m = 0; m < impactSlams.length; m++) {
      const dm = t - impactSlams[m].t;
      if (dm >= 0 && dm < 0.42) {
        const subBoom =
          Math.sin(2 * Math.PI * (185 * Math.exp(-dm * 16) + 42) * dm) *
          Math.exp(-dm * 9.5) *
          impactSlams[m].gain;
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
        const tone =
          (Math.sin(2 * Math.PI * chimeEvents[c].freq * dc) * 0.72 +
            Math.sin(2 * Math.PI * chimeEvents[c].freq * 2 * dc) * 0.24) *
          Math.exp(-dc * 14) *
          chimeEvents[c].gain;
        const pan = ((c % 3) - 1) * 0.25;
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

    // Controlled hot mastering saturation for big, punchy mobile speaker loudness
    left[i] = Math.tanh(mixL * 1.15);
    right[i] = Math.tanh(mixR * 1.15);
  }

  return { sampleRate, left, right };
}

function synthesizeStudioV3AudioPcm(
  episode: EpisodeManifest,
  sampleRate = 44100
): StereoPcm {
  const tl = compileEpisodeTimeline(episode);
  const durationSec = tl.durationSec;
  const totalSamples = Math.floor(sampleRate * durationSec);
  const left = new Float32Array(totalSamples);
  const right = new Float32Array(totalSamples);

  const mood: EpisodeAudioMood = episode.audio?.mood ?? 'editorial_lofi';
  const profile = STUDIO_MOODS[mood] ?? STUDIO_MOODS.editorial_lofi;
  const enableAudioLogo = episode.audio?.audioLogo !== false;

  const bpm = tl.bpm || 108;
  const beatDur = 60 / bpm;
  const fps = tl.fps || 30;

  const cutTimes = tl.cutFrames.map((f) => f / fps);
  const impactTimes: number[] = [];
  const chimeEvents: Array<{ t: number; freq: number }> = [];
  const stampThudTimes: number[] = [];
  const typeWindows: Array<[number, number]> = [];
  const shotRanges: Array<{ start: number; end: number; energy: number }> = [];

  for (const shot of tl.shots) {
    const sStart = shot.startSec;
    const sEnd = shot.endSec;
    const base = shot.startFrame;

    if (shot.scene.kind === 'v3_conflict_hook') {
      shotRanges.push({ start: sStart, end: sEnd, energy: 1.05 });
      impactTimes.push((base + 10) / fps);
      chimeEvents.push(
        { t: (base + 18) / fps, freq: 587.33 },
        { t: (base + 26) / fps, freq: 659.25 },
        { t: (base + 34) / fps, freq: 783.99 }
      );
    } else if (shot.scene.kind === 'v3_market_pulse') {
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
    } else if (shot.scene.kind === 'v3_ashare_anchor') {
      shotRanges.push({ start: sStart, end: sEnd, energy: 0.95 });
      chimeEvents.push(
        { t: (base + 4) / fps, freq: 523.25 },
        { t: (base + 50) / fps, freq: 587.33 },
        { t: (base + 60) / fps, freq: 659.25 },
        { t: (base + 70) / fps, freq: 783.99 },
        { t: (base + 114) / fps, freq: 880.0 }
      );
      typeWindows.push([(base + 26) / fps, (base + 66) / fps]);
    } else if (shot.scene.kind === 'v3_editorial_story') {
      const variant = shot.scene.data.variant;
      shotRanges.push({
        start: sStart,
        end: sEnd,
        energy: variant === 'catalyst_chain' ? 1.0 : 0.88,
      });
      chimeEvents.push({ t: (base + 10) / fps, freq: 523.25 });
      if (variant === 'macro_gauge') {
        chimeEvents.push({ t: (base + 58) / fps, freq: 659.25 });
      } else if (variant === 'vs_split_cards') {
        impactTimes.push((base + 52) / fps);
        stampThudTimes.push((base + 120) / fps);
      } else if (variant === 'catalyst_chain') {
        const scale = [523.25, 587.33, 659.25, 783.99, 880.0];
        scale.forEach((f, idx) => {
          chimeEvents.push({ t: (base + 76 + idx * 10) / fps, freq: f });
        });
      }
    } else if (shot.scene.kind === 'v3_action_cheatsheet') {
      shotRanges.push({ start: sStart, end: sEnd, energy: 0.86 });
      chimeEvents.push(
        { t: (base + 32) / fps, freq: 587.33 },
        { t: (base + 76) / fps, freq: 659.25 },
        { t: (base + 86) / fps, freq: 783.99 },
        { t: (base + 100) / fps, freq: 880.0 },
        { t: (base + 114) / fps, freq: 1046.5 }
      );
    } else {
      shotRanges.push({ start: sStart, end: sEnd, energy: 0.9 });
    }
  }

  let lfsr = 0x51a7f39b;
  const nextNoise = () => {
    lfsr ^= lfsr << 13;
    lfsr ^= lfsr >>> 17;
    lfsr ^= lfsr << 5;
    return ((lfsr >>> 0) / 4294967296) * 2 - 1;
  };
  let lp = 0;
  let hpPrev = 0;

  for (let i = 0; i < totalSamples; i++) {
    const t = i / sampleRate;

    let masterEnv = 1.0;
    if (t < 0.03) masterEnv = t / 0.03;
    if (t > durationSec - 0.85) masterEnv = Math.max(0, (durationSec - t) / 0.85);

    // Dynamic scene energy curve
    let sceneEnergy = 0.9;
    for (let s = 0; s < shotRanges.length; s++) {
      if (t >= shotRanges[s].start && t < shotRanges[s].end) {
        sceneEnergy = shotRanges[s].energy;
        break;
      }
    }

    // Pre-impact 48ms micro-breath before major cuts & stamps for professional broadcast punch
    let breathDuck = 1.0;
    for (let c = 0; c < cutTimes.length; c++) {
      const dc = cutTimes[c] - t;
      if (dc > 0 && dc < 0.05) {
        breathDuck = Math.min(breathDuck, 0.35 + (dc / 0.05) * 0.65);
      }
    }
    for (let s = 0; s < stampThudTimes.length; s++) {
      const ds = stampThudTimes[s] - t;
      if (ds > 0 && ds < 0.06) {
        breathDuck = Math.min(breathDuck, 0.25 + (ds / 0.06) * 0.75);
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

    // 1. Warm Rhodes Electric Piano Pad Chord
    const chord = profile.chords[barIndex % profile.chords.length];
    const barPhase = (beatFloat - barIndex * 4) * beatDur;
    const padEnv = Math.min(1, barPhase / 0.04) * Math.exp(-barPhase * 0.72);
    let padL = 0;
    let padR = 0;
    for (let c = 0; c < chord.length; c++) {
      const f = chord[c];
      const v =
        (Math.sin(2 * Math.PI * f * t) * 0.76 +
          Math.sin(2 * Math.PI * f * 2 * t) * 0.16 * Math.exp(-barPhase * 2.2)) *
        padEnv;
      const spread = (c / (chord.length - 1) - 0.5) * 0.45;
      padL += v * (0.5 - spread);
      padR += v * (0.5 + spread);
    }
    padL *= profile.padGain * sceneEnergy;
    padR *= profile.padGain * sceneEnergy;

    // 2. Subtle Syncopated Editorial Marimba / Pluck Pulse
    const pluckFreq = chord[(eighthIdx * 3) % chord.length];
    const pluck =
      (Math.sin(2 * Math.PI * pluckFreq * t) * 0.75 +
        Math.sin(2 * Math.PI * pluckFreq * 2 * t) * 0.14) *
      Math.exp(-eighthPhase * 8.5) *
      0.085 *
      sceneEnergy;
    const pluckPan = ((eighthIdx % 4) - 1.5) * 0.24;

    // 3. Punchy Sub Kick (beats 0, 2 + subtle syncopation) + Crisp Closed Hi-Hat
    let kick = 0;
    const isKickBeat = beatInBar === 0 || beatInBar === 2;
    if (isKickBeat && beatPhase < 0.15) {
      const kEnv = Math.exp(-beatPhase * 26);
      const kFreq = 46 + 108 * Math.exp(-beatPhase * 45);
      kick = Math.sin(2 * Math.PI * kFreq * beatPhase) * kEnv * profile.kickGain * sceneEnergy;
    }

    // Soft rim/snare ghost on beats 1 and 3
    let rim = 0;
    if ((beatInBar === 1 || beatInBar === 3) && beatPhase < 0.08) {
      rim = (hp * 0.45 + Math.sin(2 * Math.PI * 340 * beatPhase) * 0.35) * Math.exp(-beatPhase * 46) * 0.11;
    }

    // Crisp off-beat hi-hat tick
    let hat = 0;
    if (eighthIdx % 2 === 1 && eighthPhase < 0.045) {
      hat = hp * Math.exp(-eighthPhase * 75) * profile.hatGain * sceneEnergy;
    }

    // 4. Warm Sub-Bass Anchor
    const bassFreq = profile.bassRoots[barIndex % profile.bassRoots.length];
    const bass =
      (Math.sin(2 * Math.PI * bassFreq * t) * 0.8 + Math.sin(2 * Math.PI * bassFreq * 2 * t) * 0.15) *
      Math.exp(-beatPhase * 3.4) *
      0.22 *
      sceneEnergy;

    // 5. Subtle Typewriter Micro-Ticks
    let dataTick = 0;
    const inTypeWindow = typeWindows.some(([ws, we]) => t >= ws && t <= we);
    if (inTypeWindow && sixteenthPhase < 0.012) {
      dataTick =
        Math.sin(2 * Math.PI * (1420 + (sixteenthIdx % 4) * 180) * sixteenthPhase) *
        Math.exp(-sixteenthPhase * 220) *
        0.042;
    }

    // 6. 0.5s Brand Audio Logo at t = 0..0.55s (Warm D5 -> A5 -> D6 crystalline signature)
    let logoL = 0;
    let logoR = 0;
    if (enableAudioLogo && t < 0.65) {
      const notes = [
        { onset: 0.02, freq: 587.33, pan: -0.25 },
        { onset: 0.14, freq: 880.0, pan: 0.0 },
        { onset: 0.26, freq: 1174.66, pan: 0.25 },
      ];
      for (const ln of notes) {
        const dt = t - ln.onset;
        if (dt >= 0 && dt < 0.38) {
          const env = Math.min(1, dt / 0.008) * Math.exp(-dt * 9.5);
          const tone =
            (Math.sin(2 * Math.PI * ln.freq * dt) * 0.78 +
              Math.sin(2 * Math.PI * ln.freq * 2 * dt) * 0.22) *
            env *
            0.18;
          logoL += tone * (1 - ln.pan);
          logoR += tone * (1 + ln.pan);
        }
      }
    }

    // 7. Foley & Transition SFX
    let sfx = 0;
    for (let m = 0; m < impactTimes.length; m++) {
      const dm = t - impactTimes[m];
      if (dm >= 0 && dm < 0.36) {
        sfx +=
          Math.sin(2 * Math.PI * (150 * Math.exp(-dm * 14) + 46) * dm) *
          Math.exp(-dm * 11) *
          0.42;
        sfx += lp * Math.exp(-dm * 18) * 0.12;
      }
    }

    for (let c = 0; c < chimeEvents.length; c++) {
      const dc = t - chimeEvents[c].t;
      if (dc >= 0 && dc < 0.2) {
        sfx +=
          (Math.sin(2 * Math.PI * chimeEvents[c].freq * dc) * 0.8 +
            Math.sin(2 * Math.PI * chimeEvents[c].freq * 2 * dc) * 0.2) *
          Math.exp(-dc * 18) *
          0.11;
      }
    }

    for (let s = 0; s < stampThudTimes.length; s++) {
      const ds = t - stampThudTimes[s];
      if (ds >= 0 && ds < 0.25) {
        sfx +=
          (Math.sin(2 * Math.PI * (110 * Math.exp(-ds * 18) + 52) * ds) * 0.56 + lp * 0.32) *
          Math.exp(-ds * 18);
      }
    }

    // Airy sweep whoosh across scene cuts
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

/**
 * Decodes a standard PCM 16-bit WAV file (mono or stereo) into mono Float32 samples + sampleRate.
 */
export function decodeWavToMonoFloat32(wavBytes: Uint8Array): {
  sampleRate: number;
  samples: Float32Array;
} {
  const view = new DataView(wavBytes.buffer, wavBytes.byteOffset, wavBytes.byteLength);
  if (wavBytes.byteLength < 44) {
    throw new Error('Invalid WAV buffer: too short');
  }

  let offset = 12;
  let sampleRate = 24000;
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

    if (chunkId === 'fmt ' && chunkSize >= 16) {
      numChannels = view.getUint16(bodyStart + 2, true);
      sampleRate = view.getUint32(bodyStart + 4, true);
      bitsPerSample = view.getUint16(bodyStart + 14, true);
    } else if (chunkId === 'data') {
      dataOffset = bodyStart;
      dataSize = Math.min(chunkSize, wavBytes.byteLength - bodyStart);
      break;
    }

    offset = bodyStart + chunkSize + (chunkSize % 2);
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

/**
 * Encodes mono Float32 samples into a standard 16-bit PCM WAV byte buffer.
 */
export function encodeMonoWav(samples: Float32Array, sampleRate: number): Uint8Array {
  const numSamples = samples.length;
  const dataBytes = numSamples * 2;
  const buf = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(buf);

  const writeStr = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i));
  };

  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + dataBytes, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, dataBytes, true);

  let off = 44;
  for (let i = 0; i < numSamples; i++) {
    const v = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(off, v < 0 ? v * 0x8000 : v * 0x7fff, true);
    off += 2;
  }

  return new Uint8Array(buf);
}

/**
 * Mixes a mono voiceover track into stereo BGM with broadcast-style RMS sidechain ducking.
 * Smoothly ducks the BGM by `duckingDb` (default -13dB) whenever anchor speech is active.
 */
export function mixVoiceoverIntoStereoPcm(
  bgm: StereoPcm,
  voiceMono: Float32Array,
  voiceSampleRate: number,
  duckingDb = -13
): StereoPcm {
  const outLen = bgm.left.length;
  const outL = new Float32Array(outLen);
  const outR = new Float32Array(outLen);

  // Resample voiceover cleanly to BGM sample rate using linear interpolation
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

  // Compute smooth broadcast sidechain ducking gain envelope
  const minGain = Math.pow(10, Math.min(-3, duckingDb) / 20);
  const attackCoeff = Math.exp(-1 / (bgm.sampleRate * 0.035)); // 35ms fast duck
  const releaseCoeff = Math.exp(-1 / (bgm.sampleRate * 0.24)); // 240ms smooth recovery
  let env = 0;
  let duckGain = 1.0;

  for (let i = 0; i < outLen; i++) {
    const absV = Math.abs(resampledVoice[i]);
    env = absV > env ? env * 0.92 + absV * 0.08 : env * 0.996 + absV * 0.004;

    const speaking = env > 0.015;
    const targetGain = speaking ? minGain : 1.0;
    const coeff = targetGain < duckGain ? attackCoeff : releaseCoeff;
    duckGain = targetGain + (duckGain - targetGain) * coeff;

    const voiceBoost = resampledVoice[i] * 1.08;
    outL[i] = Math.tanh(bgm.left[i] * duckGain + voiceBoost);
    outR[i] = Math.tanh(bgm.right[i] * duckGain + voiceBoost);
  }

  return {
    sampleRate: bgm.sampleRate,
    left: outL,
    right: outR,
  };
}
