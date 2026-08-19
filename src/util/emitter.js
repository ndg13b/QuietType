/**
 * Minimal synchronous event emitter.
 *
 * The whole app is wired together with this: the keystroke analyser emits,
 * the audio engine and the visual field listen. Keeping the transport this
 * small means every module can be unit-tested without a DOM.
 */
export class Emitter {
  #handlers = new Map();

  /**
   * @param {string} type
   * @param {(payload: any) => void} handler
   * @returns {() => void} unsubscribe
   */
  on(type, handler) {
    if (!this.#handlers.has(type)) this.#handlers.set(type, new Set());
    this.#handlers.get(type).add(handler);
    return () => this.off(type, handler);
  }

  off(type, handler) {
    this.#handlers.get(type)?.delete(handler);
  }

  emit(type, payload) {
    const set = this.#handlers.get(type);
    if (!set) return;
    // Copy first: a handler is allowed to unsubscribe itself mid-dispatch.
    for (const handler of [...set]) {
      try {
        handler(payload);
      } catch (err) {
        // One misbehaving listener must not stop the others, and must never
        // interrupt typing. Report and carry on.
        console.error(`[quiettype] listener for "${type}" threw`, err);
      }
    }
  }

  clear() {
    this.#handlers.clear();
  }
}
