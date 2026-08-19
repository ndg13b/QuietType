/**
 * The living backdrop.
 *
 * Driven by the same keystroke events as the audio, so what you see and what
 * you hear are two readings of one rhythm. Everything is drawn from the active
 * mood's palette; nothing here knows what was typed.
 */
import { clamp, createRandom, lerp, smoothTowards } from '../util/math.js';

const MAX_RIPPLES = 48;
const MAX_MOTES = 40;

/** '#rrggbb' -> 'r, g, b' for use inside rgba(). */
function toRgbParts(hex) {
  const value = hex.replace('#', '');
  const full = value.length === 3 ? [...value].map((c) => c + c).join('') : value;
  const int = Number.parseInt(full, 16);
  return `${(int >> 16) & 255}, ${(int >> 8) & 255}, ${int & 255}`;
}

export class VisualField {
  #canvas;
  #ctx;
  #palette;
  #glow = [];
  #ripples = [];
  #motes = [];
  #random = createRandom(0x5eed);
  #width = 0;
  #height = 0;
  #dpr = 1;
  /** Smoothed rhythm values, so the picture eases rather than snaps. */
  #energy = 0;
  #unrest = 0;
  #calm = 0;
  #time = 0;
  #reducedMotion = false;

  /**
   * @param {HTMLCanvasElement} canvas
   * @param {object} mood
   * @param {{ reducedMotion?: boolean }} [options]
   */
  constructor(canvas, mood, { reducedMotion = false } = {}) {
    this.#canvas = canvas;
    this.#ctx = canvas.getContext('2d');
    this.#reducedMotion = reducedMotion;
    this.setMood(mood);
    this.resize();
  }

  setMood(mood) {
    this.#palette = mood.palette;
    this.#glow = mood.palette.glow.map(toRgbParts);
  }

  setReducedMotion(reduced) {
    this.#reducedMotion = Boolean(reduced);
    if (reduced) this.#motes = [];
  }

  resize() {
    const dpr = Math.min(globalThis.devicePixelRatio || 1, 2);
    const { clientWidth, clientHeight } = this.#canvas;
    const width = clientWidth || this.#canvas.width;
    const height = clientHeight || this.#canvas.height;
    this.#dpr = dpr;
    this.#width = width;
    this.#height = height;
    this.#canvas.width = Math.round(width * dpr);
    this.#canvas.height = Math.round(height * dpr);
    this.#ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.#seedMotes();
  }

  #seedMotes() {
    if (this.#reducedMotion) {
      this.#motes = [];
      return;
    }
    const target = Math.round(clamp((this.#width * this.#height) / 42000, 10, MAX_MOTES));
    this.#motes = Array.from({ length: target }, () => ({
      x: this.#random() * this.#width,
      y: this.#random() * this.#height,
      r: 0.6 + this.#random() * 1.8,
      drift: 0.1 + this.#random() * 0.35,
      phase: this.#random() * Math.PI * 2,
      tint: Math.floor(this.#random() * this.#glow.length),
    }));
  }

  /**
   * The point new ripples gather around: a slow Lissajous wander so the
   * activity has somewhere to be without ever sitting still.
   */
  #focus() {
    const t = this.#time / 1000;
    return {
      x: this.#width * (0.5 + 0.26 * Math.sin(t * 0.11) * Math.cos(t * 0.037)),
      y: this.#height * (0.5 + 0.22 * Math.sin(t * 0.083 + 1.7)),
    };
  }

  /** Spawn a ripple for one keypress. */
  spark({ kind = 'regular', snapshot } = {}) {
    if (this.#ripples.length >= MAX_RIPPLES) this.#ripples.shift();
    const intensity = clamp(snapshot?.intensity ?? 0.4, 0, 1);
    const focus = this.#focus();
    const spread = lerp(150, 60, intensity);
    const scale = Math.min(this.#width, this.#height);

    /* Growth is a fraction of the smaller viewport edge per second, so a
     * ripple covers the same proportion of any screen. Kept deliberately
     * modest: large slow rings read as background structure rather than as
     * an answer to the key you just pressed. */
    const shape = {
      // Enter leaves a wider, longer-lived mark than an ordinary letter.
      accent: { radius: scale * 0.04, growth: 0.16, decay: 0.6, weight: 2.4 },
      // Corrections contract instead of expanding: a visible small retreat.
      correction: { radius: scale * 0.03, growth: -0.06, decay: 1.4, weight: 1.2 },
      regular: {
        radius: scale * 0.012,
        growth: lerp(0.1, 0.22, intensity),
        decay: lerp(0.75, 1.15, intensity),
        weight: lerp(1, 1.8, intensity),
      },
    }[kind] ?? {};

    this.#ripples.push({
      x: focus.x + (this.#random() - 0.5) * spread,
      y: focus.y + (this.#random() - 0.5) * spread,
      life: 1,
      tint: Math.floor(this.#random() * this.#glow.length),
      ...shape,
    });
  }

  /**
   * Advance and draw one frame.
   * @param {number} deltaMs
   * @param {object} snapshot rhythm snapshot from the analyser
   */
  render(deltaMs, snapshot) {
    const dt = clamp(deltaMs, 0, 64);
    this.#time += dt;

    const state = snapshot?.state ?? 'idle';
    this.#energy = smoothTowards(this.#energy, state === 'flow' || state === 'erratic'
      ? clamp(snapshot?.intensity ?? 0, 0, 1) : 0, dt, 400);
    this.#unrest = smoothTowards(this.#unrest, state === 'erratic' ? 1 : 0, dt, 700);
    this.#calm = smoothTowards(this.#calm, state === 'rest' ? 1 : 0, dt, 1400);

    const ctx = this.#ctx;
    ctx.clearRect(0, 0, this.#width, this.#height);
    this.#drawBackdrop(ctx);
    if (!this.#reducedMotion) this.#drawMotes(ctx, dt);
    this.#drawBreath(ctx);
    this.#drawRipples(ctx, dt);
  }

  #drawBackdrop(ctx) {
    const t = this.#time / 1000;
    const { surface, accent } = this.#palette;
    ctx.fillStyle = surface;
    ctx.fillRect(0, 0, this.#width, this.#height);

    const blobs = [
      { cx: 0.32 + 0.1 * Math.sin(t * 0.05), cy: 0.3 + 0.09 * Math.cos(t * 0.041), tint: this.#glow[0] },
      { cx: 0.74 + 0.09 * Math.cos(t * 0.037), cy: 0.68 + 0.08 * Math.sin(t * 0.053), tint: this.#glow[1] ?? this.#glow[0] },
      { cx: 0.5 + 0.16 * Math.sin(t * 0.023 + 2.1), cy: 0.5 + 0.13 * Math.cos(t * 0.031), tint: toRgbParts(accent) },
    ];

    // The wash brightens as typing picks up and dims almost away at rest.
    const strength = lerp(0.06, 0.2, this.#energy) * lerp(1, 0.45, this.#calm);
    const radius = Math.max(this.#width, this.#height) * lerp(0.45, 0.62, this.#calm);

    ctx.globalCompositeOperation = this.#palette.scheme === 'light' ? 'multiply' : 'lighter';
    for (const blob of blobs) {
      const x = blob.cx * this.#width;
      const y = blob.cy * this.#height;
      const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
      gradient.addColorStop(0, `rgba(${blob.tint}, ${strength})`);
      gradient.addColorStop(1, `rgba(${blob.tint}, 0)`);
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, this.#width, this.#height);
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  #drawMotes(ctx, dt) {
    const speed = lerp(0.006, 0.05, this.#energy);
    const jitter = this.#unrest * 0.35;
    ctx.globalCompositeOperation = this.#palette.scheme === 'light' ? 'source-over' : 'lighter';
    for (const mote of this.#motes) {
      mote.phase += dt * 0.0004;
      mote.y -= dt * speed * mote.drift;
      mote.x += Math.sin(mote.phase) * dt * (0.004 + jitter * 0.02);
      if (mote.y < -8) {
        mote.y = this.#height + 8;
        mote.x = this.#random() * this.#width;
      }
      if (mote.x < -8) mote.x = this.#width + 8;
      if (mote.x > this.#width + 8) mote.x = -8;

      const alpha = lerp(0.08, 0.3, this.#energy) * lerp(1, 0.4, this.#calm);
      ctx.fillStyle = `rgba(${this.#glow[mote.tint] ?? this.#glow[0]}, ${alpha})`;
      ctx.beginPath();
      ctx.arc(mote.x, mote.y, mote.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  /** The slow pulse that takes over once the page has been left alone. */
  #drawBreath(ctx) {
    if (this.#calm < 0.01) return;
    const period = this.#reducedMotion ? 12000 : 7200;
    const swell = (Math.sin((this.#time / period) * Math.PI * 2) + 1) / 2;
    const radius = Math.min(this.#width, this.#height) * lerp(0.16, 0.3, swell);
    const x = this.#width / 2;
    const y = this.#height / 2;

    const gradient = ctx.createRadialGradient(x, y, radius * 0.2, x, y, radius);
    const tint = toRgbParts(this.#palette.accent);
    gradient.addColorStop(0, `rgba(${tint}, ${0.1 * this.#calm})`);
    gradient.addColorStop(1, `rgba(${tint}, 0)`);
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  #drawRipples(ctx, dt) {
    const seconds = dt / 1000;
    ctx.globalCompositeOperation = this.#palette.scheme === 'light' ? 'source-over' : 'lighter';

    for (let i = this.#ripples.length - 1; i >= 0; i -= 1) {
      const ripple = this.#ripples[i];
      ripple.life -= seconds * ripple.decay;
      if (ripple.life <= 0) {
        this.#ripples.splice(i, 1);
        continue;
      }
      ripple.radius += seconds * ripple.growth * Math.min(this.#width, this.#height);
      if (ripple.radius <= 0) {
        this.#ripples.splice(i, 1);
        continue;
      }

      // Fade fastest at the very end so rings dissolve instead of blinking out.
      const alpha = Math.pow(clamp(ripple.life, 0, 1), 1.6) * lerp(0.28, 0.5, this.#energy);
      ctx.strokeStyle = `rgba(${this.#glow[ripple.tint] ?? this.#glow[0]}, ${alpha})`;
      ctx.lineWidth = ripple.weight * lerp(1, 0.5, 1 - ripple.life);
      ctx.beginPath();
      ctx.arc(ripple.x, ripple.y, ripple.radius, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';
  }
}

export { toRgbParts };
