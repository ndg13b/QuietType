/**
 * A melodic random walk over scale degrees.
 *
 * Picking a uniformly random note per keystroke sounds like a wind chime in a
 * hurricane. A walk that mostly steps by one or two degrees, occasionally
 * leaps, and is pulled gently back toward the middle of its range reads as a
 * line someone is playing -- which is what makes the typing feel accompanied
 * rather than sonified.
 */
import { clamp, createRandom } from '../util/math.js';

/** Relative weights for a step of -3..+3 degrees, before gravity. */
const STEP_WEIGHTS = [
  { step: -3, weight: 0.5 },
  { step: -2, weight: 1.4 },
  { step: -1, weight: 3.2 },
  { step: 1, weight: 3.2 },
  { step: 2, weight: 1.4 },
  { step: 3, weight: 0.5 },
];

export class MelodicWalk {
  /**
   * @param {object} options
   * @param {[number, number]} [options.range] inclusive degree bounds
   * @param {number} [options.seed]
   */
  constructor({ range = [0, 11], seed = 1 } = {}) {
    this.range = range;
    this.random = createRandom(seed);
    this.degree = Math.round((range[0] + range[1]) / 2);
  }

  get center() {
    return (this.range[0] + this.range[1]) / 2;
  }

  /**
   * Advance the walk and return the new degree.
   *
   * @param {object} [options]
   * @param {number} [options.leapChance] 0..1 probability of a wider jump
   * @param {number} [options.pull] 0..1 strength of the pull back to centre
   */
  next({ leapChance = 0.08, pull = 0.35 } = {}) {
    const span = this.range[1] - this.range[0] || 1;
    // Positive when we are sitting above the middle of the range.
    const drift = ((this.degree - this.center) / (span / 2)) * clamp(pull, 0, 1);

    let step;
    if (this.random() < leapChance) {
      const size = 4 + Math.floor(this.random() * 3);
      step = (this.random() < 0.5 - drift / 2 ? 1 : -1) * size;
    } else {
      step = this.#weightedStep(drift);
    }

    this.degree = this.#place(this.degree, step);
    return this.degree;
  }

  /**
   * Apply a step, bouncing off the ends of the range rather than clamping.
   * Clamping makes the walk pile up against its edges and repeat the same
   * note, which reads as a stall; reflecting turns the edge around and keeps
   * the line moving.
   */
  #place(from, step) {
    const [low, high] = this.range;
    if (high <= low) return low;

    const forward = this.#reflect(from + step);
    if (forward !== from) return forward;
    // A reflection can land exactly back where it started; try the other way.
    const backward = this.#reflect(from - step);
    if (backward !== from) return backward;
    return from === high ? from - 1 : from + 1;
  }

  /** Fold a degree back inside the range, mirroring at each end. */
  #reflect(degree) {
    const [low, high] = this.range;
    let value = degree;
    while (value < low || value > high) {
      if (value < low) value = low + (low - value);
      if (value > high) value = high - (value - high);
    }
    return value;
  }

  /** Bias the step distribution downward when we have drifted high, and up when low. */
  #weightedStep(drift) {
    let total = 0;
    const weights = STEP_WEIGHTS.map(({ step, weight }) => {
      // `drift` > 0 means "too high", so downward steps get the boost.
      const biased = weight * (1 - Math.sign(step) * drift * 0.8);
      const value = Math.max(biased, 0.01);
      total += value;
      return { step, value };
    });

    let roll = this.random() * total;
    for (const { step, value } of weights) {
      roll -= value;
      if (roll <= 0) return step;
    }
    return weights[weights.length - 1].step;
  }

  /** Jump straight to a degree, e.g. when resetting after a long pause. */
  settle(degree = Math.round(this.center)) {
    this.degree = clamp(Math.round(degree), this.range[0], this.range[1]);
    return this.degree;
  }
}
