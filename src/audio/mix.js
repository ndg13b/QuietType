/**
 * How the four sound layers respond to typing state.
 *
 * The engine never decides what to fade; it asks this module for target gains
 * and ramps toward them. Keeping the mapping pure means the behaviour
 * described in the brief -- pad on a short pause, texture when hesitant, one
 * slow tone left breathing after ten seconds -- is directly testable.
 */
import { clamp, lerp } from '../util/math.js';

export const LAYERS = /** @type {const} */ (['pluck', 'pad', 'texture', 'breath']);

/**
 * Base target gain (0..1) per layer for each typing state.
 *
 * `rest` keeps the pluck layer open further than "near silence" suggests,
 * because two things come through it while the page waits: the once-a-breath
 * chime, and the first keystroke when you come back. At 0.06 both were
 * inaudible -- returning to the page felt dead for the third of a second the
 * layer took to ramp up.
 */
export const BASE_MIX = {
  idle: { pluck: 0, pad: 0.1, texture: 0, breath: 0.3 },
  flow: { pluck: 1, pad: 0.22, texture: 0, breath: 0 },
  erratic: { pluck: 0.8, pad: 0.28, texture: 0.75, breath: 0 },
  pause: { pluck: 0.45, pad: 0.85, texture: 0.12, breath: 0.1 },
  rest: { pluck: 0.3, pad: 0.1, texture: 0, breath: 0.95 },
};

/**
 * Ramp times in seconds. Layers fade in and out at different rates on
 * purpose: plucks should answer immediately, pads should arrive like weather.
 */
export const RAMP_SECONDS = {
  pluck: { up: 0.35, down: 1.2 },
  pad: { up: 2.6, down: 3.4 },
  texture: { up: 1.6, down: 2.4 },
  breath: { up: 4, down: 2.8 },
};

/**
 * Blend the base mix with the continuous metrics, so two people both "in
 * flow" do not get an identical wall of sound.
 *
 * @param {{ state: keyof BASE_MIX, intensity?: number, steadiness?: number, correctionRate?: number }} snapshot
 * @returns {Record<typeof LAYERS[number], number>}
 */
export function resolveMix(snapshot) {
  const base = BASE_MIX[snapshot.state] ?? BASE_MIX.idle;
  const intensity = clamp(snapshot.intensity ?? 0, 0, 1);
  const steadiness = clamp(snapshot.steadiness ?? 0.5, 0, 1);
  const corrections = clamp(snapshot.correctionRate ?? 0, 0, 1);

  // "How hard are you typing" only means something while keys are arriving.
  // Applied at rest it made the chime's level depend on how fast the writer
  // happened to be going before they walked away.
  const typing = snapshot.state === 'flow' || snapshot.state === 'erratic';

  return {
    // Racing along lifts the plucks; a slow steady trickle stays quiet.
    pluck: base.pluck * (typing ? lerp(0.55, 1, intensity) : 1),
    // Unsteady rhythm lets a little more pad through to hold the gaps open.
    pad: clamp(base.pad + (1 - steadiness) * 0.14, 0, 1),
    // Texture tracks how much correcting is going on, not just the state flag.
    texture: clamp(base.texture * lerp(0.6, 1.25, corrections), 0, 1),
    breath: base.breath,
  };
}

/**
 * Pick the ramp time for a gain change.
 * @param {typeof LAYERS[number]} layer
 * @param {number} from current gain
 * @param {number} to target gain
 */
export function rampFor(layer, from, to) {
  const ramp = RAMP_SECONDS[layer] ?? { up: 1, down: 1 };
  return to >= from ? ramp.up : ramp.down;
}
