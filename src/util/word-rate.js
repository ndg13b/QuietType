/**
 * Words per minute, from words.
 *
 * The obvious way to get a pace out of a rhythm analyser is to divide the
 * typing interval by the old "five characters to a word" convention. That is
 * how this used to work, and it is not words per minute: it counts backspaces
 * and retyped characters as progress, it reports a speed while you delete a
 * paragraph, and it answers "how fast are your fingers moving right now"
 * rather than "how much writing are you getting done".
 *
 * This counts actual words instead, over a trailing window, so deleting text
 * lowers the number the way it should. Only the *count* is ever passed in --
 * the words themselves stay in the textarea.
 */

export class WordRate {
  /** @type {Array<[number, number]>} [timestamp, wordCount] */
  #samples = [];
  #windowMs;
  #minSpanMs;

  /**
   * @param {object} [options]
   * @param {number} [options.windowMs] how far back the rate looks
   * @param {number} [options.minSpanMs] refuse to report before this much time
   */
  constructor({ windowMs = 30_000, minSpanMs = 5_000 } = {}) {
    this.#windowMs = windowMs;
    this.#minSpanMs = minSpanMs;
  }

  /** Record the current word count. Safe to call every tick. */
  observe(words, at = Date.now()) {
    const samples = this.#samples;
    const last = samples[samples.length - 1];
    // Nothing has changed and no time has passed worth recording.
    if (last && last[0] === at) {
      last[1] = words;
      return;
    }
    samples.push([at, words]);

    // Keep one sample from beyond the window so the span still covers it.
    let firstInside = 0;
    while (
      firstInside + 1 < samples.length &&
      at - samples[firstInside + 1][0] >= this.#windowMs
    ) {
      firstInside += 1;
    }
    if (firstInside > 0) samples.splice(0, firstInside);
  }

  /**
   * Words per minute over the trailing window.
   * @returns {number | null} null until there is enough history to mean anything
   */
  get wpm() {
    const samples = this.#samples;
    if (samples.length < 2) return null;
    const [startAt, startWords] = samples[0];
    const [endAt, endWords] = samples[samples.length - 1];
    const span = endAt - startAt;
    if (span < this.#minSpanMs) return null;
    // Deleting is not negative writing speed, it is zero.
    return Math.max(0, Math.round(((endWords - startWords) / span) * 60_000));
  }

  reset() {
    this.#samples = [];
  }
}

/** Whole-session average, for the summary appended to an export. */
export function sessionWpm(words, elapsedMs) {
  if (!(elapsedMs > 0) || !(words > 0)) return 0;
  return Math.max(0, Math.round(words / (elapsedMs / 60_000)));
}
