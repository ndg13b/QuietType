import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  MIN_SAMPLES,
  PAUSE_MS,
  REST_MS,
  RHYTHM_GAP_MS,
  TypingAnalyser,
  classifyKey,
} from '../src/keystroke.js';

/** Drives an analyser against a fake clock. */
function harness() {
  let clock = 0;
  const analyser = new TypingAnalyser({ now: () => clock });
  return {
    analyser,
    get clock() { return clock; },
    /** Advance time, then press a key. */
    type(key, gap) {
      clock += gap;
      analyser.press({ key });
    },
    wait(ms) { clock += ms; },
    sample() { return analyser.sample(clock); },
  };
}

const burst = (h, count, gap, key = 'a') => {
  for (let i = 0; i < count; i += 1) h.type(key, gap);
};

describe('classifyKey', () => {
  it('treats printable characters and Tab as writing', () => {
    for (const key of ['a', 'Z', ' ', '7', '.', 'é', 'Tab']) {
      assert.equal(classifyKey(key), 'regular', key);
    }
  });

  it('treats Backspace and Delete as corrections', () => {
    assert.equal(classifyKey('Backspace'), 'correction');
    assert.equal(classifyKey('Delete'), 'correction');
  });

  it('treats Enter as an accent', () => {
    assert.equal(classifyKey('Enter'), 'accent');
  });

  it('ignores keys that do not move the writing forward', () => {
    for (const key of ['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'F5', 'ArrowLeft']) {
      assert.equal(classifyKey(key), 'ignored', key);
    }
  });
});

describe('TypingAnalyser state machine', () => {
  it('starts idle and stays idle while only modifiers are pressed', () => {
    const h = harness();
    assert.equal(h.sample().state, 'idle');
    h.type('Shift', 50);
    h.type('Control', 50);
    assert.equal(h.sample().state, 'idle');
    assert.equal(h.sample().keyCount, 0);
  });

  it('reports flow for fast, steady typing', () => {
    const h = harness();
    burst(h, 14, 110);
    const s = h.sample();
    assert.equal(s.state, 'flow');
    assert.ok(s.intensity > 0.8, `intensity ${s.intensity}`);
    assert.ok(s.steadiness > 0.9, `steadiness ${s.steadiness}`);
    assert.ok(s.keysPerMinute > 300, `keysPerMinute ${s.keysPerMinute}`);
  });

  it('reports flow for slow but even typing, at a lower intensity', () => {
    const h = harness();
    burst(h, 14, 420);
    const s = h.sample();
    assert.equal(s.state, 'flow');
    assert.ok(s.intensity < 0.35, `intensity ${s.intensity}`);
  });

  it('moves to pause after a short gap and rest after a long one', () => {
    const h = harness();
    burst(h, 10, 120);
    assert.equal(h.sample().state, 'flow');

    h.wait(PAUSE_MS + 50);
    assert.equal(h.sample().state, 'pause');

    h.wait(REST_MS);
    assert.equal(h.sample().state, 'rest');
  });

  it('returns to flow when typing resumes after a rest', () => {
    const h = harness();
    burst(h, 10, 120);
    h.wait(REST_MS + 500);
    assert.equal(h.sample().state, 'rest');
    burst(h, 6, 130);
    assert.equal(h.sample().state, 'flow');
  });

  it('reports erratic when corrections dominate', () => {
    const h = harness();
    for (let i = 0; i < 12; i += 1) h.type(i % 3 === 0 ? 'Backspace' : 'x', 130);
    const s = h.sample();
    assert.equal(s.state, 'erratic');
    assert.ok(s.correctionRate > 0.3, `correctionRate ${s.correctionRate}`);
  });

  it('reports erratic when the rhythm is lurching', () => {
    const h = harness();
    for (const gap of [70, 500, 60, 700, 90, 620, 65, 540, 100, 660]) h.type('x', gap);
    const s = h.sample();
    assert.equal(s.state, 'erratic');
    assert.ok(s.steadiness < 0.35, `steadiness ${s.steadiness}`);
  });

  it('holds erratic until corrections clearly subside (hysteresis)', () => {
    const h = harness();
    // 20 evenly-spaced keys, every fourth a correction: a 0.25 correction rate
    // with a perfectly steady pulse, so only the correction rule is in play.
    for (let i = 0; i < 20; i += 1) h.type(i % 4 === 3 ? 'Backspace' : 'x', 110);
    assert.equal(h.sample().state, 'erratic');

    // Now 5/24 = 0.21, under the threshold that got us here but over the one
    // that lets us out. Without hysteresis this would flip straight to flow.
    burst(h, 4, 110, 'x');
    assert.equal(h.sample().state, 'erratic');

    // Enough clean typing to push the corrections out of the window entirely.
    burst(h, 24, 110, 'x');
    assert.equal(h.sample().state, 'flow');
  });

  it('does not let a pause poison the rhythm statistics', () => {
    const h = harness();
    burst(h, 12, 110);
    const before = h.sample().steadiness;

    h.wait(REST_MS - 1000);
    burst(h, 4, 110);
    const after = h.sample();

    assert.equal(after.state, 'flow');
    assert.ok(
      Math.abs(after.steadiness - before) < 0.05,
      `steadiness moved from ${before} to ${after.steadiness}`,
    );
  });

  it('needs a minimum number of samples before judging steadiness', () => {
    const h = harness();
    burst(h, MIN_SAMPLES - 1, 110);
    const s = h.sample();
    assert.equal(s.intensity, 0);
    assert.equal(s.steadiness, 0.5);
  });

  it('tracks burst length and resets it across a hesitation', () => {
    const h = harness();
    burst(h, 5, 100);
    assert.equal(h.sample().burst, 5);
    h.wait(RHYTHM_GAP_MS + 10);
    assert.equal(h.sample().burst, 0);
    h.type('a', 0);
    assert.equal(h.sample().burst, 1);
  });

  it('keeps a brief think inside flow, rather than calling it a pause', () => {
    const h = harness();
    burst(h, 10, 120);
    // Long enough to break the rhythm, far short of having stopped writing.
    h.wait(RHYTHM_GAP_MS + 800);
    assert.equal(h.sample().state, 'flow');
    burst(h, 4, 120);
    assert.equal(h.sample().state, 'flow');
  });

  it('separates the pause threshold from the rhythm-gap threshold', () => {
    // They answer different questions and must be free to differ.
    assert.ok(PAUSE_MS > RHYTHM_GAP_MS);

    const h = harness();
    burst(h, 12, 110);
    const steady = h.sample().steadiness;
    // A gap between the two thresholds: still flow, and it must not be fed to
    // the rhythm statistics.
    h.wait((PAUSE_MS + RHYTHM_GAP_MS) / 2);
    burst(h, 4, 110);
    const after = h.sample();
    assert.equal(after.state, 'flow');
    assert.ok(Math.abs(after.steadiness - steady) < 0.05,
      `steadiness moved from ${steady} to ${after.steadiness}`);
  });

  it('emits keystroke and state events', () => {
    const h = harness();
    const keystrokes = [];
    const states = [];
    h.analyser.on('keystroke', (event) => keystrokes.push(event.kind));
    h.analyser.on('state', (event) => states.push(event.state));

    h.type('a', 100);
    h.type('Backspace', 100);
    h.type('Enter', 100);
    h.type('Shift', 100);

    assert.deepEqual(keystrokes, ['regular', 'correction', 'accent']);
    assert.ok(states.includes('flow') || states.includes('erratic'));
  });

  it('reset returns it to a fresh session', () => {
    const h = harness();
    burst(h, 10, 110);
    h.analyser.reset();
    const s = h.sample();
    assert.equal(s.state, 'idle');
    assert.equal(s.keyCount, 0);
    assert.equal(s.elapsedMs, 0);
  });
});
