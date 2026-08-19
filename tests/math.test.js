import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  clamp,
  createRandom,
  lerp,
  mapRange,
  median,
  medianSuccessiveDelta,
  smoothTowards,
} from '../src/util/math.js';

describe('mapRange', () => {
  it('maps and clamps to the output range', () => {
    assert.equal(mapRange(5, 0, 10, 0, 100), 50);
    assert.equal(mapRange(-5, 0, 10, 0, 100), 0);
    assert.equal(mapRange(50, 0, 10, 0, 100), 100);
  });

  it('handles an inverted input range, as typing speed needs', () => {
    // Small gaps mean fast typing means high intensity.
    assert.equal(mapRange(520, 520, 90, 0, 1), 0);
    assert.equal(mapRange(90, 520, 90, 0, 1), 1);
    assert.ok(mapRange(305, 520, 90, 0, 1) > 0.49);
  });

  it('does not divide by zero on a degenerate range', () => {
    assert.equal(mapRange(3, 5, 5, 0, 1), 0);
  });
});

describe('smoothTowards', () => {
  it('closes half the distance in one half-life, whatever the frame rate', () => {
    assert.ok(Math.abs(smoothTowards(0, 1, 100, 100) - 0.5) < 1e-9);

    // Ten small steps must land in the same place as one big one.
    let stepped = 0;
    for (let i = 0; i < 10; i += 1) stepped = smoothTowards(stepped, 1, 10, 100);
    assert.ok(Math.abs(stepped - smoothTowards(0, 1, 100, 100)) < 1e-9);
  });

  it('snaps when the half-life is zero', () => {
    assert.equal(smoothTowards(0, 1, 16, 0), 1);
  });
});

describe('median and dispersion', () => {
  it('takes the midpoint of an even-length set', () => {
    assert.equal(median([1, 3, 5, 9]), 4);
    assert.equal(median([5, 1, 9, 3]), 4);
    assert.equal(median([]), 0);
  });

  it('reads a steady pulse as zero jitter', () => {
    assert.equal(medianSuccessiveDelta([110, 110, 110, 110]), 0);
  });

  it('shrugs off a single long gap', () => {
    const steadyWithOneHesitation = [110, 110, 110, 110, 900, 110, 110, 110, 110];
    assert.equal(medianSuccessiveDelta(steadyWithOneHesitation), 0);
  });

  it('catches an alternating fast-slow lurch', () => {
    const lurching = [70, 500, 60, 700, 90, 620, 65, 540];
    assert.ok(medianSuccessiveDelta(lurching) > 400);
  });

  it('needs at least two values', () => {
    assert.equal(medianSuccessiveDelta([110]), 0);
    assert.equal(medianSuccessiveDelta([]), 0);
  });
});

describe('helpers', () => {
  it('clamps and interpolates', () => {
    assert.equal(clamp(5, 0, 1), 1);
    assert.equal(clamp(-5, 0, 1), 0);
    assert.equal(lerp(0, 10, 0.25), 2.5);
  });

  it('produces a repeatable sequence in [0, 1) for a given seed', () => {
    const first = Array.from({ length: 200 }, createRandom(42));
    const second = Array.from({ length: 200 }, createRandom(42));
    assert.deepEqual(first, second);
    assert.notDeepEqual(first, Array.from({ length: 200 }, createRandom(43)));
    assert.ok(first.every((value) => value >= 0 && value < 1));
  });
});
