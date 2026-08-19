/**
 * Just enough music theory to keep every note in key.
 *
 * Scales are expressed as semitone offsets from a root, which is all the
 * mood presets need to swap tonality without touching the sound engine.
 */

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

/** Semitone offsets, one entry per scale degree. */
export const SCALES = {
  majorPentatonic: [0, 2, 4, 7, 9],
  minorPentatonic: [0, 3, 5, 7, 10],
  major: [0, 2, 4, 5, 7, 9, 11],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  aeolian: [0, 2, 3, 5, 7, 8, 10],
};

/** MIDI note number -> scientific pitch name, e.g. 60 -> "C4". */
export function midiToNote(midi) {
  const rounded = Math.round(midi);
  const name = NOTE_NAMES[((rounded % 12) + 12) % 12];
  return `${name}${Math.floor(rounded / 12) - 1}`;
}

/** "C4" / "F#3" / "Bb2" -> MIDI note number. */
export function noteToMidi(note) {
  const match = /^([A-Ga-g])([#b]?)(-?\d+)$/.exec(note.trim());
  if (!match) throw new Error(`Unrecognised note name: ${note}`);
  const [, letter, accidental, octave] = match;
  const base = NOTE_NAMES.indexOf(letter.toUpperCase());
  const shift = accidental === '#' ? 1 : accidental === 'b' ? -1 : 0;
  return (Number(octave) + 1) * 12 + base + shift;
}

/**
 * Resolve a scale degree to a MIDI note. Degrees run past the end of the
 * scale in both directions, wrapping into higher and lower octaves, so a
 * melodic walk can just add and subtract integers.
 *
 * @param {number} rootMidi
 * @param {number[]} intervals
 * @param {number} degree
 */
export function degreeToMidi(rootMidi, intervals, degree) {
  const size = intervals.length;
  const octave = Math.floor(degree / size);
  const index = ((degree % size) + size) % size;
  return rootMidi + octave * 12 + intervals[index];
}

/** Convenience wrapper returning a note name instead of a number. */
export const degreeToNote = (rootMidi, intervals, degree) =>
  midiToNote(degreeToMidi(rootMidi, intervals, degree));

/**
 * Stack scale degrees into a chord, e.g. `[0, 2, 4]` is the triad built on
 * `base`. Returns note names ready for a Tone.js synth.
 */
export function chordNotes(rootMidi, intervals, base, shape = [0, 2, 4]) {
  return shape.map((offset) => degreeToNote(rootMidi, intervals, base + offset));
}
