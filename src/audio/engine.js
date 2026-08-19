/**
 * The generative sound engine.
 *
 * Four layers run continuously; typing state only ever changes their gains
 * (see ./mix.js) and the notes the pluck layer fires. Nothing here inspects
 * the text -- `onKeystroke` receives a category and a rhythm snapshot, never
 * a character.
 *
 * Tone.js is injected rather than imported so the engine can be constructed
 * (and its non-audio bookkeeping exercised) without a Web Audio context.
 */
import { clamp, createRandom, mapRange } from '../util/math.js';
import { chordNotes, degreeToNote, midiToNote } from './scales.js';
import { LAYERS, rampFor, resolveMix } from './mix.js';
import { MelodicWalk } from './melody.js';

/** Never fire two plucks closer together than this (seconds). */
const MIN_NOTE_GAP = 0.055;
/** How long a pad chord is held before the next one is chosen (seconds). */
const PAD_PERIOD = 9;
/** Scale degrees the pad progression walks through, relative to `padBase`. */
const PAD_PROGRESSION = [0, 3, -2, 4, 1, -3];

export class AudioEngine {
  #Tone = null;
  #nodes = null;
  #mood = null;
  #started = false;
  #muted = false;
  #volume = 0.75;
  #gains = { pluck: 0, pad: 0, texture: 0, breath: 0 };
  #lastNoteAt = -Infinity;
  #nextPadAt = 0;
  #padStep = 0;
  #walk;
  #random;

  /**
   * @param {object} options
   * @param {() => Promise<any>} options.loadTone
   * @param {object} options.mood initial mood preset
   * @param {number} [options.seed]
   */
  constructor({ loadTone, mood, seed = Date.now() }) {
    this.loadTone = loadTone;
    this.#mood = mood;
    this.#random = createRandom(seed);
    this.#walk = new MelodicWalk({ range: mood.music.range, seed });
  }

  get started() {
    return this.#started;
  }

  get muted() {
    return this.#muted;
  }

  get mood() {
    return this.#mood;
  }

  /**
   * Build the audio graph. Must be called from a user gesture -- browsers
   * refuse to start an AudioContext otherwise.
   */
  async start() {
    if (this.#started) return;
    const Tone = (this.#Tone ??= await this.loadTone());
    await Tone.start();

    const master = new Tone.Gain(this.#muted ? 0 : this.#volume).toDestination();
    const limiter = new Tone.Limiter(-3).connect(master);
    const reverb = new Tone.Reverb(this.#mood.reverb).connect(limiter);
    const delay = new Tone.FeedbackDelay(this.#mood.delay).connect(reverb);
    const bus = new Tone.Gain(1).connect(delay);

    // Each layer gets its own gain so the mix can crossfade them independently.
    const gain = Object.fromEntries(
      LAYERS.map((layer) => [layer, new Tone.Gain(0).connect(bus)]),
    );

    this.#nodes = { Tone, master, limiter, reverb, delay, bus, gain };
    this.#buildVoices(this.#mood);

    // Reverb renders its impulse response off-thread; awaiting keeps the first
    // few notes from arriving dry. A failure here just means less space.
    try {
      await reverb.generate?.();
    } catch (err) {
      console.warn('[quiettype] reverb impulse unavailable', err);
    }

    this.#started = true;
    this.#nextPadAt = Tone.now() + 0.4;
  }

  /** Tear down and rebuild the voices for a new mood, keeping the effects bus. */
  setMood(mood) {
    this.#mood = mood;
    this.#walk = new MelodicWalk({ range: mood.music.range, seed: Math.floor(this.#random() * 1e9) });
    if (!this.#started) return;

    const { Tone, reverb, delay } = this.#nodes;
    reverb.set(mood.reverb);
    delay.set(mood.delay);
    this.#disposeVoices();
    this.#buildVoices(mood);
    this.#padStep = 0;
    this.#nextPadAt = Tone.now() + 0.2;
  }

  setVolume(value) {
    this.#volume = clamp(value, 0, 1);
    this.#nodes?.master.gain.rampTo(this.#muted ? 0 : this.#volume, 0.12);
  }

  setMuted(muted) {
    this.#muted = Boolean(muted);
    this.#nodes?.master.gain.rampTo(this.#muted ? 0 : this.#volume, 0.25);
  }

  /**
   * Fire a note for a single keypress. Called straight from the keydown
   * handler, so it must be cheap and must never throw into typing.
   *
   * @param {{ kind: 'regular'|'correction'|'accent', snapshot: object }} event
   */
  onKeystroke({ kind, snapshot }) {
    if (!this.#started || this.#muted) return;
    const { Tone, voices } = this.#nodes;
    const now = Tone.now();
    if (now - this.#lastNoteAt < MIN_NOTE_GAP) return;
    this.#lastNoteAt = now;

    const { music } = this.#mood;
    const intensity = clamp(snapshot?.intensity ?? 0.4, 0, 1);
    const velocity = clamp(0.24 + intensity * 0.45 + this.#random() * 0.12, 0.05, 0.95);
    const decay = music.pluckDecay;

    try {
      if (kind === 'correction') {
        // A correction pulls the line back down rather than moving it on:
        // an audible small retreat, quieter than a real note.
        const degree = this.#walk.settle(this.#walk.degree - 1);
        voices.pluck.triggerAttackRelease(
          degreeToNote(music.root, music.scale, degree),
          decay * 0.45,
          now,
          velocity * 0.5,
        );
        return;
      }

      if (kind === 'accent') {
        // Enter ends a thought; answer it with a low root and fifth.
        this.#walk.settle();
        voices.pluck.triggerAttackRelease(
          [midiToNote(music.root - 12), midiToNote(music.root - 5)],
          decay * 1.4,
          now,
          velocity * 0.7,
        );
        return;
      }

      // Steadier typing wanders less; hesitant typing leaps more.
      const leapChance = mapRange(snapshot?.steadiness ?? 0.5, 1, 0, 0.05, 0.22);
      const degree = this.#walk.next({ leapChance });
      const note = degreeToNote(music.root, music.scale, degree);
      const length = decay * (0.55 + this.#random() * 0.55);
      voices.pluck.triggerAttackRelease(note, length, now, velocity);

      // Deep in a fast burst, let the occasional note ring as a pair.
      if (intensity > 0.72 && this.#random() < 0.12) {
        const partner = degreeToNote(music.root, music.scale, degree + 2);
        voices.pluck.triggerAttackRelease(partner, length * 0.7, now + 0.09, velocity * 0.6);
      }
    } catch (err) {
      console.error('[quiettype] note failed', err);
    }
  }

  /**
   * Follow the rhythm snapshot: ramp the layer gains toward their targets and
   * keep the pad progression turning over.
   */
  update(snapshot) {
    if (!this.#started) return;
    const { Tone, gain } = this.#nodes;
    const targets = resolveMix(snapshot);

    for (const layer of LAYERS) {
      const target = targets[layer];
      const current = this.#gains[layer];
      if (Math.abs(target - current) < 0.005) continue;
      gain[layer].gain.rampTo(target, rampFor(layer, current, target));
      this.#gains[layer] = target;
    }

    const now = Tone.now();
    if (now >= this.#nextPadAt) this.#advancePad(now);
  }

  /** Choose and hold the next pad chord. */
  #advancePad(now) {
    const { voices } = this.#nodes;
    const { music } = this.#mood;
    const base = music.padBase + PAD_PROGRESSION[this.#padStep % PAD_PROGRESSION.length];
    this.#padStep += 1;

    try {
      voices.pad.triggerAttackRelease(
        chordNotes(music.root, music.scale, base, music.padShape),
        PAD_PERIOD * 1.5,
        now,
        0.5,
      );
    } catch (err) {
      console.error('[quiettype] pad failed', err);
    }
    this.#nextPadAt = now + PAD_PERIOD;
  }

  #buildVoices(mood) {
    const { Tone, gain } = this.#nodes;

    const { type: pluckType, filter: pluckFilter, ...pluckOptions } = mood.pluck;
    const pluckVoice = pluckType === 'fm' ? Tone.FMSynth : Tone.Synth;
    const pluck = new Tone.PolySynth(pluckVoice, pluckOptions);
    const pluckTone = new Tone.Filter(pluckFilter).connect(gain.pluck);
    pluck.connect(pluckTone);

    const { filter: padFilter, ...padOptions } = mood.pad;
    const pad = new Tone.PolySynth(Tone.Synth, padOptions);
    const padTone = new Tone.Filter(padFilter).connect(gain.pad);
    pad.connect(padTone);

    // Texture: filtered noise with a slow sweep, the "hesitation" layer.
    const texture = new Tone.Noise({ type: mood.texture.noise, volume: mood.texture.volume }).start();
    const textureTone = new Tone.Filter(mood.texture.filter).connect(gain.texture);
    texture.connect(textureTone);
    const textureSweep = new Tone.LFO({
      frequency: mood.texture.sweep.rate,
      min: mood.texture.sweep.min,
      max: mood.texture.sweep.max,
    }).start();
    textureSweep.connect(textureTone.frequency);

    // Breath: two barely-detuned oscillators so the long-pause tone drifts
    // instead of sitting dead still.
    const { music } = mood;
    const droneNote = midiToNote(music.root + mood.breath.semitones);
    const breathA = new Tone.Oscillator({
      frequency: droneNote,
      type: mood.breath.oscillator.type,
      volume: mood.breath.volume,
    }).start();
    const breathB = new Tone.Oscillator({
      frequency: droneNote,
      type: mood.breath.oscillator.type,
      detune: 7,
      volume: mood.breath.volume - 3,
    }).start();
    const breathTone = new Tone.Filter({ type: 'lowpass', frequency: 500, Q: 1.2 }).connect(gain.breath);
    breathA.connect(breathTone);
    breathB.connect(breathTone);
    const breathSweep = new Tone.LFO({
      frequency: mood.breath.sweep.rate,
      min: mood.breath.sweep.min,
      max: mood.breath.sweep.max,
    }).start();
    breathSweep.connect(breathTone.frequency);

    this.#nodes.voices = { pluck, pad, texture, breathA, breathB };
    this.#nodes.shapers = { pluckTone, padTone, textureTone, breathTone, textureSweep, breathSweep };
  }

  #disposeVoices() {
    const { voices, shapers } = this.#nodes;
    for (const node of [...Object.values(voices ?? {}), ...Object.values(shapers ?? {})]) {
      node?.dispose?.();
    }
    this.#nodes.voices = null;
    this.#nodes.shapers = null;
  }

  dispose() {
    if (!this.#nodes) return;
    this.#disposeVoices();
    for (const node of [
      ...Object.values(this.#nodes.gain ?? {}),
      this.#nodes.bus,
      this.#nodes.delay,
      this.#nodes.reverb,
      this.#nodes.limiter,
      this.#nodes.master,
    ]) {
      node?.dispose?.();
    }
    this.#nodes = null;
    this.#started = false;
  }
}
