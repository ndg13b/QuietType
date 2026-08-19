/** Small numeric helpers shared by the analyser, audio engine and visuals. */

export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

/** Linear interpolation. */
export const lerp = (a, b, t) => a + (b - a) * t;

/**
 * Map `value` from one range to another, clamped to the output range.
 * Handles inverted input ranges (inMin > inMax), which we use a lot: fast
 * typing means *small* millisecond gaps but a *large* intensity.
 */
export function mapRange(value, inMin, inMax, outMin, outMax) {
  if (inMin === inMax) return outMin;
  const t = clamp((value - inMin) / (inMax - inMin), 0, 1);
  return lerp(outMin, outMax, t);
}

/**
 * Frame-rate independent exponential smoothing.
 *
 * `halfLife` is the time in ms for `current` to close half the distance to
 * `target`, so behaviour stays identical whether we tick at 30 or 144 fps.
 */
export function smoothTowards(current, target, deltaMs, halfLife) {
  if (halfLife <= 0) return target;
  const t = 1 - Math.pow(0.5, deltaMs / halfLife);
  return lerp(current, target, clamp(t, 0, 1));
}

export function median(values) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/**
 * Median of the absolute differences between neighbouring values.
 *
 * This is the right dispersion measure for typing. A deviation-from-centre
 * statistic (standard deviation, or median absolute deviation) misreads the
 * two cases that matter most: a single long "thinking" gap wrecks the former,
 * while an alternating fast-slow-fast lurch fools the latter, because the
 * median settles inside one of the two clusters and every point looks close
 * to it. Comparing each gap to the one before it catches the lurch and shrugs
 * off the lone outlier.
 */
export function medianSuccessiveDelta(values) {
  if (values.length < 2) return 0;
  const deltas = [];
  for (let i = 1; i < values.length; i += 1) {
    deltas.push(Math.abs(values[i] - values[i - 1]));
  }
  return median(deltas);
}

/**
 * Deterministic 32-bit PRNG (mulberry32). Seeded so musical decisions are
 * reproducible in tests; the app seeds it from the clock.
 */
export function createRandom(seed = 1) {
  let a = seed >>> 0;
  return function random() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
