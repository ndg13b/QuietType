/**
 * Mood presets.
 *
 * Levels here were set by measuring the rendered output, not by arithmetic --
 * see docs/architecture.md. Two things make the nominal numbers misleading:
 * an envelope's shape decides how much of a voice's nominal level survives as
 * heard loudness, and a *continuous* source (the drone) collects far more
 * reverb energy than a transient one (a pluck). That is why the drones sit so
 * much lower than everything else: without it, resting on the page is louder
 * than working on it.
 *
 * A mood is pure data: which notes are available, how each of the four sound
 * layers is voiced, how its ripples decay, and the colours the page and canvas
 * borrow. The engine and the visual field read these; swapping a mood never
 * changes the keystroke-to-sound logic, only its palette in both senses of the
 * word.
 *
 * `oscillator`/`envelope`/`filter` blocks are passed straight to Tone.js.
 *
 * On levels: every voice is quiet on purpose. Fast typing can leave two dozen
 * plucks ringing at once on top of a sustaining pad, a drone and a noise bed,
 * and it is their *sum* that has to stay clear of the limiter. Anything much
 * hotter than these numbers and the master chain starts audibly working, which
 * is heard as gritty pumping rather than as loudness. `trim` is the one knob
 * for balancing a whole mood against the others.
 */
import { SCALES, noteToMidi } from './scales.js';

/** @type {Record<string, object>} */
export const MOODS = {
  calm: {
    id: 'calm',
    name: 'Calm',
    tagline: 'Ambient',
    description: 'Pentatonic, soft pads and glassy plucks over a cool palette.',
    trim: 5,
    music: {
      root: noteToMidi('D3'),
      scale: SCALES.majorPentatonic,
      /** Degree bounds for the melodic walk, relative to the root. */
      range: [5, 17],
      padShape: [0, 2, 4, 6],
      padBase: -5,
      /** Base note length in seconds before the release takes over. */
      pluckDecay: 1.5,
    },
    pluck: {
      oscillator: { type: 'triangle' },
      // A gentle attack lets each note bloom instead of clicking, and the long
      // release is what carries it into the ripple send.
      envelope: { attack: 0.015, decay: 0.9, sustain: 0.12, release: 1.8 },
      filter: { type: 'lowpass', frequency: 3600, Q: 0.7 },
      volume: -21,
    },
    /** An octave-up partner note, for glitter in the tail. */
    shimmer: { chance: 0.4, delay: 0.13, level: 0.34 },
    pad: {
      oscillator: { type: 'fatsine', count: 3, spread: 18 },
      envelope: { attack: 3.4, decay: 2, sustain: 0.8, release: 5 },
      filter: { type: 'lowpass', frequency: 1200, Q: 0.4 },
      volume: -25,
    },
    texture: {
      noise: 'pink',
      filter: { type: 'bandpass', frequency: 900, Q: 2.2 },
      sweep: { min: 420, max: 2400, rate: 0.07 },
      volume: -30,
    },
    breath: {
      oscillator: { type: 'sine' },
      /** Semitones from the root; the slow tone that waits for you. */
      semitones: -12,
      sweep: { min: 220, max: 760, rate: 0.035 },
      volume: -43,
    },
    /** Echoes thrown off by each keystroke: the audible ripple. */
    /**
     * What resting sounds like. `period` is one breath.
     *
     * Six per minute is not an arbitrary number and not a "healing frequency".
     * Tuning claims of that kind -- 432 Hz being calmer than 440 Hz, the
     * Solfeggio set -- have no support; the pitch is arbitrary. What does have
     * replicated support is *pacing*: breathing at roughly five to six breaths
     * a minute sits at the baroreflex resonance frequency, raises heart-rate
     * variability, and is what paced-breathing relaxation protocols actually
     * use. So the rhythm is the part worth borrowing, not a magic pitch, and
     * the page breathes at six a minute for you to fall in with if you like.
     */
    rest: { period: 10, swell: [0.45, 1], chime: 0.34 },
    ripple: { delayTime: 0.34, feedback: 0.48, send: 0.52 },
    reverb: { decay: 7, wet: 0.52 },
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
    trim: 2,
    music: {
      root: noteToMidi('G3'),
      scale: SCALES.major,
      range: [7, 21],
      padShape: [0, 2, 4],
      padBase: -7,
      pluckDecay: 1.3,
    },
    pluck: {
      // AM rather than FM: see engine.js. 2.5 is deliberately not a whole
      // number -- the inharmonic partials that come out of a non-integer
      // ratio are what make this read as a bell rather than an organ.
      type: 'am',
      harmonicity: 2.5,
      oscillator: { type: 'sine' },
      modulation: { type: 'sawtooth' },
      envelope: { attack: 0.006, decay: 1, sustain: 0.06, release: 1.6 },
      modulationEnvelope: { attack: 0.004, decay: 0.35, sustain: 0.15, release: 0.6 },
      filter: { type: 'lowpass', frequency: 5200, Q: 0.5 },
      volume: -2,
    },
    shimmer: { chance: 0.45, delay: 0.11, level: 0.32 },
    pad: {
      oscillator: { type: 'fattriangle', count: 3, spread: 24 },
      envelope: { attack: 2.4, decay: 1.6, sustain: 0.72, release: 4 },
      filter: { type: 'lowpass', frequency: 1900, Q: 0.5 },
      volume: -23,
    },
    texture: {
      noise: 'pink',
      filter: { type: 'bandpass', frequency: 1400, Q: 1.6 },
      sweep: { min: 700, max: 3400, rate: 0.11 },
      volume: -33,
    },
    breath: {
      oscillator: { type: 'triangle' },
      semitones: -12,
      sweep: { min: 300, max: 1100, rate: 0.045 },
      volume: -36,
    },
    rest: { period: 10, swell: [0.55, 1], chime: 0.22 },
    ripple: { delayTime: 0.27, feedback: 0.44, send: 0.48 },
    reverb: { decay: 5, wet: 0.46 },
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
    // Sawtooths and a low register carry far more energy than the other two
    // moods for the same nominal level, so the whole mood sits lower.
    trim: -1,
    music: {
      root: noteToMidi('A2'),
      scale: SCALES.aeolian,
      range: [9, 21],
      // A plain triad rather than a seventh: stacked sevenths in a low
      // register, overlapping as chords change, turn to mud.
      padShape: [0, 2, 4],
      padBase: 0,
      pluckDecay: 1.6,
    },
    pluck: {
      // One detuned pair, not two: `count: 2` already gives the beating that
      // makes this mood feel unsettled, and every extra oscillator is another
      // voice summing into the master chain.
      oscillator: { type: 'fatsawtooth', count: 2, spread: 14 },
      envelope: { attack: 0.02, decay: 1, sustain: 0.05, release: 1.9 },
      filter: { type: 'lowpass', frequency: 1300, Q: 1.1 },
      detune: -5,
      volume: -9,
    },
    shimmer: { chance: 0.35, delay: 0.16, level: 0.3 },
    pad: {
      oscillator: { type: 'fatsine', count: 2, spread: 26 },
      envelope: { attack: 4.2, decay: 2.5, sustain: 0.78, release: 6 },
      filter: { type: 'lowpass', frequency: 780, Q: 0.8 },
      detune: -6,
      volume: -22,
    },
    texture: {
      noise: 'brown',
      filter: { type: 'bandpass', frequency: 520, Q: 1.8 },
      sweep: { min: 180, max: 1500, rate: 0.05 },
      volume: -29,
    },
    breath: {
      oscillator: { type: 'sine' },
      // Was the root itself, which put the drone right in the middle of the
      // filter's passband and made resting on this mood far louder than the
      // others. An octave down sits under the music instead of on top of it.
      semitones: -12,
      sweep: { min: 140, max: 520, rate: 0.028 },
      volume: -35,
    },
    rest: { period: 10, swell: [0.4, 1], chime: 0.18 },
    ripple: { delayTime: 0.44, feedback: 0.46, send: 0.52 },
    reverb: { decay: 7.5, wet: 0.5 },
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
