import { VIDEO_SPEC } from '../theme';
import { HARD_CUT_FRAMES } from '../timeline';

export interface StereoPcm {
  sampleRate: number;
  left: Float32Array;
  right: Float32Array;
}

/**
 * Pure deterministic stereo synthesizer:
 * - 129.2 BPM energetic financial electronic groove (kick, hat, bass, arp, pad)
 * - Exact 1.0s breath pause at 2.0s - 3.0s matching reference structure
 * - 8 transition whooshes aligned to exact hard-cut frames
 */
export function synthesizeTrackPcm(
  sampleRate = 44100,
  durationSec = VIDEO_SPEC.durationSec
): StereoPcm {
  const totalSamples = Math.floor(sampleRate * durationSec);
  const left = new Float32Array(totalSamples);
  const right = new Float32Array(totalSamples);

  const bpm = VIDEO_SPEC.bpm; // 129.2 BPM
  const beatDur = 60 / bpm; // ~0.4644s
  const sixteenthDur = beatDur / 4;

  // Minor pentatonic bass & arp notes (Hz) — energetic, urgent financial pulse
  const bassNotes = [110.0, 110.0, 130.81, 146.83, 98.0, 98.0, 130.81, 164.81];
  const arpNotes = [440, 523.25, 659.25, 783.99, 659.25, 523.25, 587.33, 659.25];

  const cutTimesSec = HARD_CUT_FRAMES.map((f) => f / VIDEO_SPEC.fps);

  // Deterministic noise helper for hi-hat & whoosh
  let lfsr = 0x12345678;
  const nextNoise = () => {
    lfsr ^= lfsr << 13;
    lfsr ^= lfsr >>> 17;
    lfsr ^= lfsr << 5;
    return ((lfsr >>> 0) / 4294967296) * 2 - 1;
  };

  // Precompute simple 1-pole lowpass state for whooshes
  let whooshLP = 0;

  for (let i = 0; i < totalSamples; i++) {
    const t = i / sampleRate;

    // Breath pause envelope: smooth dip during 2.0s..3.0s
    let grooveGain = 1.0;
    if (t >= 1.95 && t <= 3.05) {
      if (t < 2.05) {
        grooveGain = 1.0 - (t - 1.95) / 0.1;
      } else if (t > 2.95) {
        grooveGain = (t - 2.95) / 0.1;
      } else {
        grooveGain = 0.04; // near-silent breath pause with tiny room air
      }
    }

    // Fade in first 40ms, fade out last 350ms
    let masterEnv = 1.0;
    if (t < 0.04) masterEnv = t / 0.04;
    if (t > durationSec - 0.35) {
      masterEnv = Math.max(0, (durationSec - t) / 0.35);
    }

    // Beat phase
    const beatIndex = Math.floor(t / beatDur);
    const beatPhase = t - beatIndex * beatDur;

    // 1. Punchy Kick on every beat
    let kick = 0;
    if (beatPhase < 0.18) {
      const kEnv = Math.exp(-beatPhase * 28);
      const pitch = 48 + 115 * Math.exp(-beatPhase * 42);
      kick = Math.sin(2 * Math.PI * pitch * beatPhase) * kEnv * 0.58;
    }

    // 2. Crisp off-beat Hi-Hat (16th grid)
    const stepIndex = Math.floor(t / sixteenthDur);
    const stepPhase = t - stepIndex * sixteenthDur;
    const n = nextNoise();
    let hat = 0;
    if (stepIndex % 2 === 1 && stepPhase < 0.055) {
      const accent = stepIndex % 4 === 2 ? 0.22 : 0.11;
      hat = n * Math.exp(-stepPhase * 75) * accent;
    }

    // 3. Driving Synth Bass (8th notes)
    const eighthIndex = Math.floor(t / (beatDur / 2));
    const eighthPhase = t - eighthIndex * (beatDur / 2);
    const bassFreq = bassNotes[Math.floor(beatIndex / 2) % bassNotes.length];
    const bassEnv = Math.exp(-eighthPhase * 8.5);
    const bassWave =
      (2 / Math.PI) * Math.atan(Math.sin(2 * Math.PI * bassFreq * t) * 2.2);
    const bass = bassWave * bassEnv * 0.28;

    // 4. Melodic Arpeggio (active strongly after the 3.0s drop!)
    const arpFreq = arpNotes[stepIndex % arpNotes.length];
    const arpBoost = t >= 3.0 ? 1.0 : 0.45;
    const arpEnv = Math.exp(-stepPhase * 18);
    const arp =
      (Math.sin(2 * Math.PI * arpFreq * t) * 0.6 +
        Math.sin(4 * Math.PI * arpFreq * t) * 0.25) *
      arpEnv *
      0.16 *
      arpBoost;

    // 5. Warm Stereo Pad
    const padFreq = bassFreq * 2;
    const padL = Math.sin(2 * Math.PI * padFreq * t) * 0.06;
    const padR = Math.sin(2 * Math.PI * (padFreq * 1.003) * t) * 0.06;

    // 6. Transition Whooshes at hard-cut timestamps (unaffected by breath pause)
    let whoosh = 0;
    for (let c = 0; c < cutTimesSec.length; c++) {
      const dt = t - cutTimesSec[c];
      if (dt >= -0.14 && dt <= 0.18) {
        const wEnv =
          dt < 0 ? (dt + 0.14) / 0.14 : Math.exp(-dt * 16);
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

/**
 * Encodes StereoPcm into a standard 16-bit PCM RIFF WAV Uint8Array.
 * Usable both in browser download and Node.js server FFmpeg muxing.
 */
export function encodeStereoWav(pcm: StereoPcm): Uint8Array {
  const numSamples = pcm.left.length;
  const numChannels = 2;
  const bitsPerSample = 16;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const byteRate = pcm.sampleRate * blockAlign;
  const dataSize = numSamples * blockAlign;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true); // PCM chunk size
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, numChannels, true);
  view.setUint32(24, pcm.sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeStr(36, 'data');
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < numSamples; i++) {
    const l = Math.max(-1, Math.min(1, pcm.left[i]));
    const r = Math.max(-1, Math.min(1, pcm.right[i]));
    view.setInt16(offset, l < 0 ? l * 0x8000 : l * 0x7fff, true);
    view.setInt16(offset + 2, r < 0 ? r * 0x8000 : r * 0x7fff, true);
    offset += 4;
  }

  return new Uint8Array(buffer);
}
