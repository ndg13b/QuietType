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
 *
 * Signal flow:
 *
 *   pluck ─► filter ─► pluckGain ─┬──────────────────────────┐
 *                                 └─► rippleSend ─► delay ─► │
 *   pad   ─► filter ─► padGain ─────────────────────────────►│
 *   texture ─► filter ─► textureGain ───────────────────────►├─► trim ─► reverb
 *   breath ─► filter ─► breathGain ─────────────────────────►┘             │
 *                                                                          ▼
 *                       destination ◄─ master ◄─ limiter ◄─ glue compressor
 *
 * Two things about that chain are load-bearing:
 *
 * - The ripple send is tapped *after* the pluck layer gain, so the typing
 *   state controls how much new energy enters the echoes while tails already
 *   in flight are left to decay naturally.
 * - The glue compressor exists so the limiter never has to do real work. A
 *   brick wall catching two dozen overlapping voices is heard as gritty
 *   pumping, not as loudness.
 */
import { clamp, createRandom, mapRange } from '../util/math.js';
import { chordNotes, degreeToMidi, degreeToNote, midiToNote } from './scales.js';
import { LAYERS, rampFor, resolveMix } from './mix.js';
import { MelodicWalk } from './melody.js';

/**
 * Never fire two plucks closer together than this (seconds).
 *
 * This is a polyphony budget as much as a musical choice. A voice occupies a
 * slot for its note length plus its release -- around 3.5 s with these presets
 * -- so ~7.7 notes a second is what keeps the worst case under MAX_VOICES.
 * Typing faster than this groups into bursts, which is what the brief asks for
 * anyway; the perceived length of each note comes from the ripple send and the
 * reverb, neither of which costs a voice.
 */
const MIN_NOTE_GAP = 0.13;

/** Voice ceiling for the pluck layer. Above this Tone starts stealing notes. */
const MAX_VOICES = 32;

/** Beyond this typing intensity the shimmer partner is skipped, to stay inside
 *  the voice budget exactly when the budget is tightest. */
const SHIMMER_INTENSITY_CEILING = 0.75;

/** Seconds between pad chord changes, and how much of that the chord is held.
 *  Holding for less than the full period is what stops chords from stacking. */
const PAD_PERIOD = 11;
const PAD_HOLD = 0.7;

/** Scale degrees the pad progression walks through, relative to `padBase`. */
const PAD_PROGRESSION = [0, 3, -2, 4, 1, -3];

/** Silent window used when swapping a mood's voices, so the cut is inaudible. */
const SWAP_FADE = 0.25;

const dbToGain = (db) => 10 ** (db / 20);

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
  /** Guards against overlapping mood swaps. */
  #swapToken = 0;
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
    // -1 dBFS, and it should almost never engage: the compressor below has
    // already taken the peaks off by the time anything reaches it.
    const limiter = new Tone.Limiter(-1).connect(master);
    const glue = new Tone.Compressor({
      threshold: -20,
      ratio: 2.5,
      attack: 0.02,
      // Slow enough not to pump on the low drone, which a limiter's 10 ms
      // release very much does.
      release: 0.28,
      knee: 12,
    }).connect(limiter);
    const reverb = new Tone.Reverb(this.#mood.reverb).connect(glue);
    const trim = new Tone.Gain(dbToGain(this.#mood.trim ?? 0)).connect(reverb);
    const bus = new Tone.Gain(1).connect(trim);

    // Each layer gets its own gain so the mix can crossfade them independently.
    const gain = Object.fromEntries(
      LAYERS.map((layer) => [layer, new Tone.Gain(0).connect(bus)]),
    );

    // The ripple: every pluck throws off a decaying series of echoes, which
    // then wash into the reverb. This is where "longer and more ethereal"
    // comes from -- lengthening the notes themselves would just burn voices.
    const rippleDelay = new Tone.FeedbackDelay({
      delayTime: this.#mood.ripple.delayTime,
      feedback: this.#mood.ripple.feedback,
      wet: 1,
      maxDelay: 2,
    }).connect(bus);
    const rippleSend = new Tone.Gain(this.#mood.ripple.send).connect(rippleDelay);
    gain.pluck.connect(rippleSend);

    this.#nodes = { Tone, master, limiter, glue, reverb, trim, bus, gain, rippleDelay, rippleSend };
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

  /**
   * Swap in another mood's voices and effect settings.
   *
   * Disposing a synth mid-note cuts its output dead, which clicks, so the bus
   * is faded out first and everything is rebuilt inside that silent window.
   */
  setMood(mood) {
    this.#mood = mood;
    this.#walk = new MelodicWalk({
      range: mood.music.range,
      seed: Math.floor(this.#random() * 1e9),
    });
    if (!this.#started) return;

    const { Tone, bus } = this.#nodes;
    const token = ++this.#swapToken;
    const retired = { voices: this.#nodes.voices, shapers: this.#nodes.shapers };

    bus.gain.rampTo(0, SWAP_FADE);
    setTimeout(() => {
      // A newer swap started while this one was fading; it owns the graph now.
      if (token !== this.#swapToken || !this.#nodes) return;

      for (const node of [
        ...Object.values(retired.voices ?? {}),
        ...Object.values(retired.shapers ?? {}),
      ]) {
        node?.dispose?.();
      }

      this.#nodes.reverb.set(mood.reverb);
      this.#nodes.trim.gain.value = dbToGain(mood.trim ?? 0);
      this.#nodes.rippleDelay.set({
        delayTime: mood.ripple.delayTime,
        feedback: mood.ripple.feedback,
      });
      this.#nodes.rippleSend.gain.value = mood.ripple.send;

      this.#buildVoices(mood);
      this.#padStep = 0;
      this.#nextPadAt = Tone.now() + 0.3;
      bus.gain.rampTo(1, SWAP_FADE);
    }, SWAP_FADE * 1000 + 40);
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
    if (!voices) return; // mid mood-swap
    const now = Tone.now();
    if (now - this.#lastNoteAt < MIN_NOTE_GAP) return;
    this.#lastNoteAt = now;

    const { music } = this.#mood;
    const intensity = clamp(snapshot?.intensity ?? 0.4, 0, 1);
    const velocity = clamp(0.2 + intensity * 0.4 + this.#random() * 0.1, 0.05, 0.8);
    const decay = music.pluckDecay;

    try {
      if (kind === 'correction') {
        // A correction pulls the line back down rather than moving it on:
        // an audible small retreat, quieter than a real note.
        const degree = this.#walk.settle(this.#walk.degree - 1);
        voices.pluck.triggerAttackRelease(
          degreeToNote(music.root, music.scale, degree),
          decay * 0.4,
          now,
          velocity * 0.45,
        );
        return;
      }

      if (kind === 'accent') {
        // Enter ends a thought; answer it with a low root and fifth. Seven
        // semitones is in every scale we ship, so this stays consonant.
        this.#walk.settle();
        voices.pluck.triggerAttackRelease(
          [midiToNote(music.root - 12), midiToNote(music.root - 5)],
          decay * 1.2,
          now,
          velocity * 0.6,
        );
        return;
      }

      // Steadier typing wanders less; hesitant typing leaps more.
      const leapChance = mapRange(snapshot?.steadiness ?? 0.5, 1, 0, 0.05, 0.22);
      const degree = this.#walk.next({ leapChance });
      const note = degreeToNote(music.root, music.scale, degree);
      const length = decay * (0.45 + this.#random() * 0.45);
      voices.pluck.triggerAttackRelease(note, length, now, velocity);

      // An octave up, quietly, so the tail glitters. Skipped in a fast burst:
      // that is exactly when there is no voice budget to spare, and no room in
      // the music for it either.
      const shimmer = this.#mood.shimmer;
      if (
        shimmer &&
        intensity < SHIMMER_INTENSITY_CEILING &&
        this.#random() < shimmer.chance
      ) {
        voices.pluck.triggerAttackRelease(
          midiToNote(degreeToMidi(music.root, music.scale, degree) + 12),
          length * 0.7,
          now + shimmer.delay,
          velocity * shimmer.level,
        );
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
    if (!voices) return; // mid mood-swap
    const { music } = this.#mood;
    const base = music.padBase + PAD_PROGRESSION[this.#padStep % PAD_PROGRESSION.length];
    this.#padStep += 1;

    try {
      voices.pad.triggerAttackRelease(
        chordNotes(music.root, music.scale, base, music.padShape),
        PAD_PERIOD * PAD_HOLD,
        now,
        0.45,
      );
    } catch (err) {
      console.error('[quiettype] pad failed', err);
    }
    this.#nextPadAt = now + PAD_PERIOD;
  }

  #buildVoices(mood) {
    const { Tone, gain } = this.#nodes;

    const { type: pluckType, filter: pluckFilter, ...pluckOptions } = mood.pluck;
    // No FM here on purpose. Frequency-modulating an oscillator at audio rate
    // defeats Web Audio's bandlimiting, so an FM voice aliases -- measured at
    // +8 dB of folded-back junk across a whole pluck range, heard as an
    // intermittent gritty edge on high notes. AM multiplies two bandlimited
    // signals instead, which stays bandlimited, and a non-integer harmonicity
    // gives the inharmonic partials that make a bell sound like a bell.
    const VOICES = { am: Tone.AMSynth, synth: Tone.Synth };
    const pluck = new Tone.PolySynth({
      voice: VOICES[pluckType] ?? Tone.Synth,
      // The object form is the one that actually accepts maxPolyphony; passing
      // it alongside the voice options lands it in the voice defaults instead.
      maxPolyphony: MAX_VOICES,
      options: pluckOptions,
    });
    const pluckTone = new Tone.Filter(pluckFilter).connect(gain.pluck);
    pluck.connect(pluckTone);

    const { filter: padFilter, ...padOptions } = mood.pad;
    const pad = new Tone.PolySynth({
      voice: Tone.Synth,
      maxPolyphony: 12,
      options: padOptions,
    });
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

  dispose() {
    if (!this.#nodes) return;
    this.#swapToken += 1; // cancel any pending mood swap
    for (const node of [
      ...Object.values(this.#nodes.voices ?? {}),
      ...Object.values(this.#nodes.shapers ?? {}),
      ...Object.values(this.#nodes.gain ?? {}),
      this.#nodes.rippleSend,
      this.#nodes.rippleDelay,
      this.#nodes.bus,
      this.#nodes.trim,
      this.#nodes.reverb,
      this.#nodes.glue,
      this.#nodes.limiter,
      this.#nodes.master,
    ]) {
      node?.dispose?.();
    }
    this.#nodes = null;
    this.#started = false;
  }
}
