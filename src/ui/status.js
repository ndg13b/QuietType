/** The footer readouts. Purely a view over the rhythm snapshot. */
import { formatDuration } from '../export/format.js';

/** Plain-language names for the internal states. */
const STATE_LABELS = {
  idle: 'waiting',
  flow: 'in flow',
  erratic: 'second thoughts',
  pause: 'pausing',
  rest: 'resting',
};

export class StatusBar {
  #fields;
  #last = {};

  constructor(root = document) {
    this.#fields = {
      state: root.getElementById('stat-state'),
      words: root.getElementById('stat-words'),
      wpm: root.getElementById('stat-wpm'),
      time: root.getElementById('stat-time'),
    };
  }

  /**
   * @param {{ state: string, elapsedMs: number }} snapshot
   * @param {number} wordCount
   * @param {number | null} wpm words per minute, or null before it means anything
   */
  update(snapshot, wordCount, wpm) {
    this.#set('state', STATE_LABELS[snapshot.state] ?? snapshot.state);
    this.#set('words', String(wordCount));
    this.#set('wpm', wpm === null ? '—' : `${wpm} wpm`);
    this.#set('time', formatDuration(snapshot.elapsedMs));
  }

  /** Writing to the DOM only on change keeps this off the layout hot path. */
  #set(field, value) {
    if (this.#last[field] === value) return;
    this.#last[field] = value;
    const node = this.#fields[field];
    if (node) node.textContent = value;
  }
}
