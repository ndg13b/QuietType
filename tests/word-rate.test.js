import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { WordRate, sessionWpm } from '../src/util/word-rate.js';

describe('WordRate', () => {
  it('says nothing until there is enough history', () => {
    const r = new WordRate({ minSpanMs: 5000 });
    assert.equal(r.wpm, null);
    r.observe(0, 0);
    assert.equal(r.wpm, null);
    r.observe(10, 2000);
    assert.equal(r.wpm, null, 'two seconds is not a pace');
  });

  it('reports actual words over actual time', () => {
    const r = new WordRate();
    r.observe(0, 0);
    r.observe(20, 60_000);
    assert.equal(r.wpm, 20);
  });

  it('halves when the same words take twice as long', () => {
    const fast = new WordRate();
    fast.observe(0, 0);
    fast.observe(30, 60_000);
    const slow = new WordRate({ windowMs: 200_000 });
    slow.observe(0, 0);
    slow.observe(30, 120_000);
    assert.equal(fast.wpm, 30);
    assert.equal(slow.wpm, 15);
  });

  it('falls toward zero while you sit still, rather than holding the last pace', () => {
    const r = new WordRate({ windowMs: 30_000 });
    let t = 0;
    for (let i = 0; i <= 10; i++) { r.observe(i * 2, t); t += 1000; }
    const typing = r.wpm;
    assert.ok(typing > 100, `expected a high pace, got ${typing}`);

    for (let i = 0; i < 30; i++) { r.observe(20, t); t += 1000; }
    assert.equal(r.wpm, 0, 'a minute of stillness is zero words per minute');
  });

  it('does not report a speed for deleting', () => {
    const r = new WordRate();
    r.observe(100, 0);
    r.observe(40, 30_000);
    assert.equal(r.wpm, 0);
  });

  it('only counts the trailing window, not the whole session', () => {
    const r = new WordRate({ windowMs: 10_000, minSpanMs: 1000 });
    r.observe(0, 0);
    r.observe(500, 60_000);      // a huge burst, long ago
    r.observe(510, 70_000);      // then a gentle trickle
    r.observe(520, 75_000);
    assert.ok(r.wpm < 200, `old burst leaked into the window: ${r.wpm}`);
  });

  it('keeps a sample from just outside the window so the span stays full', () => {
    const r = new WordRate({ windowMs: 10_000, minSpanMs: 1000 });
    for (let t = 0; t <= 60_000; t += 1000) r.observe(t / 1000, t);
    // One word a second is 60 wpm, whatever the session length.
    assert.ok(Math.abs(r.wpm - 60) <= 6, `got ${r.wpm}`);
  });

  it('reset forgets everything', () => {
    const r = new WordRate();
    r.observe(0, 0);
    r.observe(50, 60_000);
    r.reset();
    assert.equal(r.wpm, null);
  });
});

describe('sessionWpm', () => {
  it('averages across the whole session', () => {
    assert.equal(sessionWpm(412, 22 * 60_000), 19);
  });

  it('is zero rather than infinite for a degenerate session', () => {
    assert.equal(sessionWpm(10, 0), 0);
    assert.equal(sessionWpm(0, 60_000), 0);
  });
});
