import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  SCALES,
  chordNotes,
  degreeToMidi,
  degreeToNote,
  midiToNote,
  noteToMidi,
} from '../src/audio/scales.js';

describe('note names', () => {
  it('round-trips through MIDI numbers', () => {
    for (const note of ['C4', 'A0', 'G9', 'F#3', 'D#2']) {
      assert.equal(midiToNote(noteToMidi(note)), note);
    }
  });

  it('anchors on the usual reference points', () => {
    assert.equal(noteToMidi('C4'), 60);
    assert.equal(noteToMidi('A4'), 69);
    assert.equal(midiToNote(69), 'A4');
  });

  it('accepts flats, normalising to sharps', () => {
    assert.equal(noteToMidi('Bb3'), noteToMidi('A#3'));
  });

  it('rejects nonsense', () => {
    assert.throws(() => noteToMidi('H4'), /Unrecognised note/);
    assert.throws(() => noteToMidi(''), /Unrecognised note/);
  });
});

describe('degreeToMidi', () => {
  const root = noteToMidi('C4');

  it('walks up the scale', () => {
    const major = [0, 1, 2, 3, 4, 5, 6].map((d) => degreeToNote(root, SCALES.major, d));
    assert.deepEqual(major, ['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4']);
  });

  it('wraps into the octave above', () => {
    assert.equal(degreeToMidi(root, SCALES.major, 7), root + 12);
    assert.equal(degreeToMidi(root, SCALES.majorPentatonic, 5), root + 12);
  });

  it('wraps into the octave below for negative degrees', () => {
    assert.equal(degreeToMidi(root, SCALES.major, -7), root - 12);
    assert.equal(degreeToNote(root, SCALES.major, -1), 'B3');
    assert.equal(degreeToNote(root, SCALES.majorPentatonic, -1), 'A3');
  });

  it('never leaves the scale, however far it walks', () => {
    for (const intervals of Object.values(SCALES)) {
      for (let degree = -30; degree <= 30; degree += 1) {
        const semitone = ((degreeToMidi(60, intervals, degree) % 12) + 12) % 12;
        assert.ok(intervals.includes(semitone), `degree ${degree} left the scale`);
      }
    }
  });
});

describe('chordNotes', () => {
  it('stacks scale degrees into a triad', () => {
    assert.deepEqual(chordNotes(noteToMidi('C4'), SCALES.major, 0), ['C4', 'E4', 'G4']);
  });

  it('follows the shape it is given', () => {
    assert.deepEqual(
      chordNotes(noteToMidi('A3'), SCALES.aeolian, 0, [0, 2, 4, 6]),
      ['A3', 'C4', 'E4', 'G4'],
    );
  });
});
