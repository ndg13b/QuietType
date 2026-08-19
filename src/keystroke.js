/**
 * Keystroke rhythm analysis.
 *
 * This module is the only thing that watches the keyboard, and it is
 * deliberately blind to *what* is typed: it records the key's category
 * (regular / correction / accent) and the millisecond it arrived, never the
 * character. Everything downstream -- audio, visuals -- reads the rhythm
 * described here, so the note text never leaves the textarea.
 *
 * No DOM access lives in here; `now` is injected so the state machine can be
 * unit-tested against a fake clock.
 */
import { Emitter } from './util/emitter.js';
import { clamp, mapRange, median, medianSuccessiveDelta } from './util/math.js';

/**
 * How long the quiet has to last before the sound acknowledges it.
 *
 * Deliberately generous. Reaching for a comma, glancing at a note, or simply
 * thinking mid-sentence is still writing, and having the music change
 * character every time you draw breath is worse than having it wait.
 */
export const PAUSE_MS = 5000;

/**
 * The longest gap that still counts as part of a rhythm.
 *
 * Kept separate from PAUSE_MS, which it used to share a value with. They
 * answer different questions -- "has the writer stopped?" versus "is this gap
 * part of a pulse?" -- and tying them together means raising the pause
 * threshold would quietly let five-second gaps into the statistics and wreck
 * every steadiness reading.
 */
export const RHYTHM_GAP_MS = 1200;
/** A gap longer than this reads as "walked away from the page". */
export const REST_MS = 10000;
/** How many recent in-burst intervals feed the rhythm statistics. */
export const HISTORY = 24;
/** Below this many intervals we cannot say anything about steadiness. */
export const MIN_SAMPLES = 4;

/** Millisecond gap that reads as full intensity / as barely moving. */
const INTENSITY_FLOOR_MS = 520;
const INTENSITY_CEIL_MS = 90;

/**
 * Steadiness compares the jitter between neighbouring gaps to the gap length
 * itself. A metronomic typist scores 0 jitter; this much relative jitter is
 * treated as "no discernible pulse left".
 */
const DISPERSION_FULL = 1.1;

/* Hysteresis bands: entering "erratic" is easier than leaving it, so the
 * texture layer does not flicker on and off around a single threshold. */
const ERRATIC_ENTER = { corrections: 0.22, steadiness: 0.34 };
const ERRATIC_EXIT = { corrections: 0.12, steadiness: 0.5 };

/** @typedef {'idle'|'flow'|'erratic'|'pause'|'rest'} TypingState */

/**
 * Classify a `KeyboardEvent.key` value.
 * @returns {'regular'|'correction'|'accent'|'ignored'}
 */
export function classifyKey(key) {
  if (key === 'Backspace' || key === 'Delete') return 'correction';
  if (key === 'Enter') return 'accent';
  if (key.length === 1 || key === 'Tab') return 'regular';
  // Modifiers, function keys, navigation: real presses, but they do not move
  // the writing forward, so they stay out of the rhythm entirely.
  return 'ignored';
}

export class TypingAnalyser extends Emitter {
  /** In-burst gaps in ms, oldest first. */
  #intervals = [];
  /** `true` for each of the last HISTORY keys that was a correction. */
  #corrections = [];
  #lastKeyAt = null;
  #startedAt = null;
  #keyCount = 0;
  #correctionCount = 0;
  /** Consecutive keys typed without crossing PAUSE_MS. */
  #burst = 0;
  /** @type {TypingState} */
  #state = 'idle';
  #stateSince = 0;

  /** @param {{ now?: () => number }} [options] */
  constructor({ now = () => Date.now() } = {}) {
    super();
    this.now = now;
  }

  /** @returns {TypingState} */
  get state() {
    return this.#state;
  }

  /**
   * Record a keypress. Emits `keystroke` synchronously so the audio engine can
   * fire a note in the same task as the keydown -- routing it through the
   * animation tick instead would add audible latency.
   *
   * @param {{ key: string, at?: number }} event
   * @returns {boolean} whether the key counted toward the rhythm
   */
  press({ key, at = this.now() }) {
    const kind = classifyKey(key);
    if (kind === 'ignored') return false;

    const gap = this.#lastKeyAt === null ? null : at - this.#lastKeyAt;
    if (this.#startedAt === null) this.#startedAt = at;

    // Gaps beyond RHYTHM_GAP_MS are hesitations, not rhythm. Feeding them to
    // the statistics would make every return from a pause look erratic for the
    // next two dozen keys.
    if (gap !== null && gap < RHYTHM_GAP_MS) {
      this.#intervals.push(gap);
      if (this.#intervals.length > HISTORY) this.#intervals.shift();
      this.#burst += 1;
    } else {
      this.#burst = 1;
    }

    this.#corrections.push(kind === 'correction');
    if (this.#corrections.length > HISTORY) this.#corrections.shift();

    this.#lastKeyAt = at;
    this.#keyCount += 1;
    if (kind === 'correction') this.#correctionCount += 1;

    const snapshot = this.sample(at);
    this.emit('keystroke', { kind, gap, burst: this.#burst, snapshot });
    return true;
  }

  /**
   * Recompute derived metrics and the current state.
   * Safe to call as often as you like; call it from an animation frame to keep
   * pause/rest transitions timely even while the keyboard is quiet.
   *
   * @param {number} [at]
   * @returns {ReturnType<TypingAnalyser['sample']>}
   */
  sample(at = this.now()) {
    const sinceLast = this.#lastKeyAt === null ? Infinity : at - this.#lastKeyAt;
    const samples = this.#intervals;
    const med = median(samples);
    const dispersion = med > 0 ? medianSuccessiveDelta(samples) / med : 1;

    const enough = samples.length >= MIN_SAMPLES;
    const steadiness = enough ? clamp(1 - dispersion / DISPERSION_FULL, 0, 1) : 0.5;
    const intensity = enough
      ? mapRange(med, INTENSITY_FLOOR_MS, INTENSITY_CEIL_MS, 0, 1)
      : 0;

    const window = this.#corrections;
    const correctionRate = window.length
      ? window.filter(Boolean).length / window.length
      : 0;

    const state = this.#nextState({ sinceLast, enough, steadiness, correctionRate });
    if (state !== this.#state) {
      const previous = this.#state;
      this.#state = state;
      this.#stateSince = at;
      this.emit('state', { state, previous, at });
    }

    return {
      state,
      stateAge: at - this.#stateSince,
      sinceLast,
      intensity,
      steadiness,
      correctionRate,
      medianInterval: med,
      burst: sinceLast > RHYTHM_GAP_MS ? 0 : this.#burst,
      keyCount: this.#keyCount,
      correctionCount: this.#correctionCount,
      elapsedMs: this.#startedAt === null ? 0 : at - this.#startedAt,
      /**
       * Keystrokes per minute from the in-burst pulse. Deliberately NOT
       * called words per minute: this counts every key including the ones
       * that delete what you just wrote. Real pace comes from
       * util/word-rate.js, which counts words.
       */
      keysPerMinute: med > 0 ? Math.round(60000 / med) : 0,
    };
  }

  /** @returns {TypingState} */
  #nextState({ sinceLast, enough, steadiness, correctionRate }) {
    if (this.#keyCount === 0) return 'idle';
    if (sinceLast >= REST_MS) return 'rest';
    if (sinceLast >= PAUSE_MS) return 'pause';

    const wasErratic = this.#state === 'erratic';
    const bounds = wasErratic ? ERRATIC_EXIT : ERRATIC_ENTER;
    const unsteady = enough && steadiness <= bounds.steadiness;
    if (correctionRate >= bounds.corrections || unsteady) return 'erratic';

    return 'flow';
  }

  /** Forget the session. Listeners stay attached. */
  reset() {
    this.#intervals = [];
    this.#corrections = [];
    this.#lastKeyAt = null;
    this.#startedAt = null;
    this.#keyCount = 0;
    this.#correctionCount = 0;
    this.#burst = 0;
    this.#state = 'idle';
    this.#stateSince = 0;
  }
}
