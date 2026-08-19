/**
 * Mood presets.
 *
 * A mood is pure data: which notes are available, how each of the four sound
 * layers is voiced, and the colours the page and canvas borrow. The engine
 * and the visual field read these; swapping a mood never changes the
 * keystroke-to-sound logic, only its palette in both senses of the word.
 *
 * `synth` blocks are passed straight to Tone.js constructors.
 */
import { SCALES, noteToMidi } from './scales.js';

/** @type {Record<string, object>} */
export const MOODS = {
  calm: {
    id: 'calm',
    name: 'Calm',
    tagline: 'Ambient',
    description: 'Pentatonic, soft pads and glassy plucks over a cool palette.',
    music: {
      root: noteToMidi('D3'),
      scale: SCALES.majorPentatonic,
      /** Degree bounds for the melodic walk, relative to the root. */
      range: [5, 17],
      padShape: [0, 2, 4, 6],
      padBase: -5,
      /** Rough note length in seconds for a single pluck. */
      pluckDecay: 1.4,
    },
    pluck: {
      oscillator: { type: 'triangle' },
      envelope: { attack: 0.004, decay: 0.42, sustain: 0.015, release: 1.5 },
      filter: { type: 'lowpass', frequency: 4200, Q: 0.7 },
      volume: -13,
    },
    pad: {
      oscillator: { type: 'fatsine', count: 3, spread: 18 },
      envelope: { attack: 3.4, decay: 2, sustain: 0.85, release: 7 },
      filter: { type: 'lowpass', frequency: 1200, Q: 0.4 },
      volume: -21,
    },
    texture: {
      noise: 'pink',
      filter: { type: 'bandpass', frequency: 900, Q: 2.2 },
      sweep: { min: 420, max: 2400, rate: 0.07 },
      volume: -26,
    },
    breath: {
      oscillator: { type: 'sine' },
      /** Semitones from the root; the slow tone that waits for you. */
      semitones: -12,
      sweep: { min: 220, max: 760, rate: 0.035 },
      volume: -20,
    },
    reverb: { decay: 8, wet: 0.44 },
    delay: { delayTime: 0.36, feedback: 0.28, wet: 0.18 },
    palette: {
      scheme: 'dark',
      surface: '#08141b',
      surfaceRaised: '#0e222d',
      ink: '#dcefef',
      inkSoft: '#7fa3a8',
      accent: '#6fd6c4',
      accentSoft: '#2a6b68',
      glow: ['#6fd6c4', '#4fa8c8', '#9be7d8', '#3d7f96'],
    },
  },

  bright: {
    id: 'bright',
    name: 'Bright',
    tagline: 'Playful',
    description: 'Major scale, bell-like plucks and warm daylight colours.',
    music: {
      root: noteToMidi('G3'),
      scale: SCALES.major,
      range: [7, 21],
      padShape: [0, 2, 4],
      padBase: -7,
      pluckDecay: 1.1,
    },
    pluck: {
      type: 'fm',
      harmonicity: 3.01,
      modulationIndex: 7.5,
      oscillator: { type: 'sine' },
      envelope: { attack: 0.002, decay: 0.55, sustain: 0, release: 0.9 },
      modulation: { type: 'sine' },
      modulationEnvelope: { attack: 0.002, decay: 0.22, sustain: 0, release: 0.2 },
      filter: { type: 'lowpass', frequency: 6500, Q: 0.5 },
      volume: -17,
    },
    pad: {
      oscillator: { type: 'fattriangle', count: 3, spread: 24 },
      envelope: { attack: 2.4, decay: 1.6, sustain: 0.8, release: 5 },
      filter: { type: 'lowpass', frequency: 1900, Q: 0.5 },
      volume: -23,
    },
    texture: {
      noise: 'white',
      filter: { type: 'bandpass', frequency: 1600, Q: 3 },
      sweep: { min: 800, max: 4200, rate: 0.11 },
      volume: -30,
    },
    breath: {
      oscillator: { type: 'triangle' },
      semitones: -12,
      sweep: { min: 300, max: 1100, rate: 0.045 },
      volume: -22,
    },
    reverb: { decay: 4.2, wet: 0.3 },
    delay: { delayTime: 0.28, feedback: 0.22, wet: 0.14 },
    palette: {
      scheme: 'light',
      surface: '#f7f0e2',
      surfaceRaised: '#fffaf0',
      ink: '#3a2f21',
      inkSoft: '#8a7a63',
      accent: '#d98b2b',
      accentSoft: '#f0cf9c',
      glow: ['#e8a13c', '#f2c66b', '#d97b4f', '#c9a227'],
    },
  },

  moody: {
    id: 'moody',
    name: 'Moody',
    tagline: 'Introspective',
    description: 'Minor scale, filtered and slightly detuned, in low light.',
    music: {
      root: noteToMidi('A2'),
      scale: SCALES.aeolian,
      range: [7, 20],
      padShape: [0, 2, 4, 6],
      padBase: 0,
      pluckDecay: 1.8,
    },
    pluck: {
      oscillator: { type: 'fatsawtooth', count: 2, spread: 16 },
      envelope: { attack: 0.008, decay: 0.75, sustain: 0.03, release: 2.1 },
      filter: { type: 'lowpass', frequency: 1500, Q: 1.6 },
      detune: -6,
      volume: -18,
    },
    pad: {
      oscillator: { type: 'fatsine', count: 4, spread: 32 },
      envelope: { attack: 4.2, decay: 2.5, sustain: 0.9, release: 9 },
      filter: { type: 'lowpass', frequency: 780, Q: 0.8 },
      detune: -8,
      volume: -19,
    },
    texture: {
      noise: 'brown',
      filter: { type: 'bandpass', frequency: 520, Q: 1.8 },
      sweep: { min: 180, max: 1500, rate: 0.05 },
      volume: -22,
    },
    breath: {
      oscillator: { type: 'sine' },
      semitones: 0,
      sweep: { min: 140, max: 520, rate: 0.028 },
      volume: -17,
    },
    reverb: { decay: 11, wet: 0.5 },
    delay: { delayTime: 0.48, feedback: 0.34, wet: 0.22 },
    palette: {
      scheme: 'dark',
      surface: '#0b0912',
      surfaceRaised: '#171226',
      ink: '#ded7f0',
      inkSoft: '#8c81a8',
      accent: '#a98cd8',
      accentSoft: '#4a3a6e',
      glow: ['#a98cd8', '#7c6bb5', '#c9a7e8', '#5a4a86'],
    },
  },
};

export const MOOD_IDS = Object.keys(MOODS);
export const DEFAULT_MOOD = 'calm';

/** Look up a mood, falling back to the default for unknown ids. */
export function getMood(id) {
  return MOODS[id] ?? MOODS[DEFAULT_MOOD];
}
