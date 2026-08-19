import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BASE_MIX, LAYERS, rampFor, resolveMix } from '../src/audio/mix.js';

const mixFor = (state, extra = {}) =>
  resolveMix({ state, intensity: 0.6, steadiness: 0.8, correctionRate: 0.05, ...extra });

describe('resolveMix', () => {
  it('covers every state with every layer, in range', () => {
    for (const state of Object.keys(BASE_MIX)) {
      const mix = mixFor(state);
      for (const layer of LAYERS) {
        assert.ok(
          typeof mix[layer] === 'number' && mix[layer] >= 0 && mix[layer] <= 1,
          `${state}/${layer} was ${mix[layer]}`,
        );
      }
    }
  });

  it('falls back to the idle mix for an unknown state', () => {
    assert.deepEqual(resolveMix({ state: 'nonsense' }), resolveMix({ state: 'idle' }));
  });

  /* The four behaviours the brief describes, asserted directly. */

  it('flow: plucks lead, everything else stays back', () => {
    const mix = mixFor('flow');
    assert.ok(mix.pluck > 0.6);
    assert.ok(mix.pad < 0.4);
    assert.equal(mix.texture, 0);
    assert.equal(mix.breath, 0);
  });

  it('a short pause brings the pad in over the plucks', () => {
    const flow = mixFor('flow');
    const pause = mixFor('pause');
    assert.ok(pause.pad > flow.pad * 2, 'pad should swell during a pause');
    assert.ok(pause.pad > pause.pluck, 'pad should lead during a pause');
  });

  it('erratic typing layers texture on top', () => {
    const mix = mixFor('erratic', { correctionRate: 0.4 });
    assert.ok(mix.texture > 0.5);
    assert.ok(mix.pluck > 0.4, 'plucks keep going while the texture layers on');
  });

  it('a long rest leaves the slow tone in front of everything else', () => {
    const mix = mixFor('rest');
    assert.ok(mix.breath > 0.9, 'the drone should dominate');
    assert.ok(mix.texture < 0.1);
    assert.ok(mix.pad < 0.2);
    assert.ok(mix.pluck < mix.breath / 2, 'plucks stay well under the drone');
  });

  it('leaves the pluck layer open enough at rest to be heard returning', () => {
    // The once-a-breath chime and the first keystroke back both arrive through
    // this layer, so it cannot be shut all the way.
    assert.ok(mixFor('rest').pluck > 0.2);
  });

  /* Continuous modulation on top of the state. */

  it('scales the plucks with typing intensity', () => {
    assert.ok(mixFor('flow', { intensity: 1 }).pluck > mixFor('flow', { intensity: 0 }).pluck);
  });

  it('ignores intensity once typing has stopped', () => {
    // Otherwise the resting chime is loud or quiet depending on how fast the
    // writer was going before they stopped, which is not a thing it should
    // depend on.
    for (const state of ['rest', 'pause', 'idle']) {
      assert.equal(
        mixFor(state, { intensity: 1 }).pluck,
        mixFor(state, { intensity: 0 }).pluck,
        state,
      );
    }
  });

  it('lets more pad through when the rhythm is unsteady', () => {
    assert.ok(mixFor('flow', { steadiness: 0 }).pad > mixFor('flow', { steadiness: 1 }).pad);
  });

  it('scales the texture with how much correcting is going on', () => {
    const light = mixFor('erratic', { correctionRate: 0 });
    const heavy = mixFor('erratic', { correctionRate: 1 });
    assert.ok(heavy.texture > light.texture);
  });

  it('tolerates a snapshot with only a state', () => {
    const mix = resolveMix({ state: 'flow' });
    for (const layer of LAYERS) assert.ok(Number.isFinite(mix[layer]));
  });
});

describe('rampFor', () => {
  it('fades pads in and out slowly, and plucks quickly', () => {
    assert.ok(rampFor('pad', 0, 1) > rampFor('pluck', 0, 1));
    assert.ok(rampFor('pad', 0, 1) > 1, 'a pad arriving should take seconds');
  });

  it('uses different times going up and coming down', () => {
    assert.notEqual(rampFor('breath', 0, 1), rampFor('breath', 1, 0));
  });

  it('falls back to a sane default for an unknown layer', () => {
    assert.ok(rampFor('nope', 0, 1) > 0);
  });
});
