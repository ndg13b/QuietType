import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { MelodicWalk } from '../src/audio/melody.js';

const run = (walk, steps, options) =>
  Array.from({ length: steps }, () => walk.next(options));

describe('MelodicWalk', () => {
  it('starts in the middle of its range', () => {
    assert.equal(new MelodicWalk({ range: [0, 10] }).degree, 5);
  });

  it('never leaves its range', () => {
    const walk = new MelodicWalk({ range: [3, 9], seed: 11 });
    for (const degree of run(walk, 800)) {
      assert.ok(degree >= 3 && degree <= 9, `escaped to ${degree}`);
    }
  });

  it('is deterministic for a given seed', () => {
    const a = run(new MelodicWalk({ range: [0, 13], seed: 5 }), 60);
    const b = run(new MelodicWalk({ range: [0, 13], seed: 5 }), 60);
    assert.deepEqual(a, b);
    assert.notDeepEqual(a, run(new MelodicWalk({ range: [0, 13], seed: 6 }), 60));
  });

  it('always moves', () => {
    const walk = new MelodicWalk({ range: [0, 20], seed: 3 });
    let previous = walk.degree;
    for (const degree of run(walk, 300)) {
      assert.notEqual(degree, previous, 'repeated the same degree twice running');
      previous = degree;
    }
  });

  it('mostly steps, rather than leaping', () => {
    const walk = new MelodicWalk({ range: [0, 20], seed: 9 });
    let previous = walk.degree;
    let small = 0;
    const steps = 600;
    for (const degree of run(walk, steps, { leapChance: 0.08 })) {
      if (Math.abs(degree - previous) <= 2) small += 1;
      previous = degree;
    }
    assert.ok(small / steps > 0.7, `only ${small}/${steps} were small steps`);
  });

  it('stays near the middle on average, rather than pinning to an edge', () => {
    const range = [0, 20];
    const walk = new MelodicWalk({ range, seed: 21 });
    const degrees = run(walk, 2000);
    const mean = degrees.reduce((sum, d) => sum + d, 0) / degrees.length;
    assert.ok(Math.abs(mean - 10) < 2.5, `mean drifted to ${mean.toFixed(2)}`);
  });

  it('leaps more often when asked to', () => {
    const count = (leapChance) => {
      const walk = new MelodicWalk({ range: [0, 20], seed: 4 });
      let previous = walk.degree;
      let leaps = 0;
      for (const degree of run(walk, 600, { leapChance })) {
        if (Math.abs(degree - previous) >= 4) leaps += 1;
        previous = degree;
      }
      return leaps;
    };
    assert.ok(count(0.4) > count(0.02));
  });

  it('settle jumps to a degree, clamped to the range', () => {
    const walk = new MelodicWalk({ range: [2, 8], seed: 1 });
    assert.equal(walk.settle(6), 6);
    assert.equal(walk.settle(100), 8);
    assert.equal(walk.settle(-100), 2);
    assert.equal(walk.settle(), 5);
  });
});
