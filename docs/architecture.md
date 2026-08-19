# Architecture notes

Written down mainly so the next change does not have to re-derive the reasoning.

## The one rule

`TypingAnalyser` receives a key *category* and a timestamp. It never receives
the character, and nothing downstream of it has access to the note text. The
only module that touches the writing is `src/export/`, and only when the user
asks for a file.

If you add a feature, keep the text on that side of the line.

## Signal flow

```
                    ┌──────────────────┐
   keydown ────────▶│  TypingAnalyser  │
                    └────────┬─────────┘
                             │ emits 'keystroke' synchronously
              ┌──────────────┴───────────────┐
              ▼                              ▼
      AudioEngine.onKeystroke        VisualField.spark
      (fires a note now)             (spawns a ripple)

   every 120 ms:  analyser.sample() ──▶ engine.update() ──▶ layer gains
                                    └─▶ status.update()
   every frame:   field.render(dt, snapshot)
```

Two loops, deliberately:

- **A 120 ms interval** drives the rhythm sampling and the audio mix. It is an
  interval rather than an animation frame because a backgrounded tab stops
  getting frames, and the pause → rest fade has to keep happening when you walk
  away from the page — that fade *is* the feature.
- **Animation frames** drive only the canvas, which is exactly the work that
  should stop when nothing is visible.

Notes fire from the keystroke event itself, not from the tick. Routing them
through a 120 ms tick would put an audible and variable delay between the key
and its note, which is the one thing that would break the illusion.

## Why these statistics

`steadiness` comes from the **median of successive differences** between
neighbouring gaps, divided by the median gap.

The obvious alternatives both fail on real typing:

- *Standard deviation* is destroyed by a single long "thinking" gap. One
  hesitation should not make a metronomic typist read as erratic.
- *Median absolute deviation* survives that, but is fooled by the case that
  matters most here — an alternating fast-slow-fast lurch. The median lands
  inside one of the two clusters, so every point looks close to it.

Comparing each gap to the one before it catches the lurch and shrugs off the
lone outlier. `tests/math.test.js` pins both behaviours down.

`PAUSE_MS` (has the writer stopped?) and `RHYTHM_GAP_MS` (is this gap part of a
pulse?) are separate constants that used to share one value. They answer
different questions, and tying them together means raising the pause threshold
silently lets multi-second gaps into the statistics and wrecks every steadiness
reading. Gaps beyond `RHYTHM_GAP_MS` are excluded from the statistics entirely:
feeding them in would make every return from a hesitation read as erratic for
the next two dozen keystrokes.

`PAUSE_MS` is deliberately generous. Reaching for a comma or thinking
mid-sentence is still writing, and having the music change character every time
the writer draws breath is worse than having it wait.

The `erratic` state uses separate enter and exit thresholds. With a single
threshold the texture layer flickers on and off around the boundary, which is
far more distracting than either state on its own.

## Why a melodic walk

A uniformly random note per keystroke sounds like a wind chime in a hurricane.
`MelodicWalk` mostly steps by one or two scale degrees, occasionally leaps, and
is pulled gently back toward the middle of its range, which reads as a line
somebody is playing.

It reflects off the ends of its range rather than clamping. Clamping makes the
walk pile up against an edge and repeat the same note, which sounds like a
stall.

## Layer mixing

`src/audio/mix.js` is a pure function from a rhythm snapshot to four gains, so
the behaviours in the brief are directly testable — see `tests/mix.test.js`,
which asserts each one. The engine only ramps toward whatever it returns.

Layers fade at different rates in each direction (`RAMP_SECONDS`): plucks answer
in a third of a second, pads arrive over two and a half. Same targets, very
different feel.

## Audio levels are measured, not calculated

The numbers in `moods.js` were set by rendering the app in a headless browser
and measuring the output, because reasoning about them from first principles
gets two things wrong:

- **Envelope shape decides heard loudness, not the volume field.** An FM bell
  with `sustain: 0.06` and a filtered sawtooth with a fast decay measured about
  11 and 12 dB below a triangle at the *same* nominal volume. That is why the
  three moods' pluck volumes look wildly inconsistent: they are the numbers
  that make the three sound alike.
- **A continuous source collects far more reverb energy than a transient one.**
  The drone is the only layer that never stops, so it accumulates in a 9-12 s
  reverb in a way a pluck never does. Before this was measured, resting on the
  page was ~9 dB *louder* than typing on it, which is exactly backwards. The
  drones now sit 10-11 dB below the typing level, and their volume fields look
  absurdly low (-36 to -43 dB) for that reason.

`trim` is the one knob for moving a whole mood against the others; per-layer
volumes balance the layers within a mood.

## Keeping the master chain out of the way

Three things that used to make fast typing sound like it was breaking up:

1. **Voice stealing.** Plucks were fired every 55 ms and rang for nearly three
   seconds, which needs ~52 voices; Tone's default ceiling is 32, so it dropped
   and stole notes, cutting them off mid-ring. `MIN_NOTE_GAP` is now derived
   from the note's lifetime and the voice ceiling, so the worst case fits.
   Typing faster than that groups into bursts, which is what the brief asks for
   anyway.
2. **The pad stacking on itself.** Chords were held for 13.5 s and released
   over 5-9 s but retriggered every 9 s, so two or three were always sounding
   at once -- up to 40 oscillators of sustained low end. The hold is now
   shorter than the period.
3. **DSP load, which is the one that is invisible in the signal.** The moods
   are not equally expensive: Calm runs one oscillator per voice, the other two
   run two, and Moody carried a 12-second convolution reverb. Sustained
   hammering pinned every mood at maximum polyphony indefinitely, so the
   expensive moods sat at roughly twice Calm's oscillator count with the
   longest impulse response in the graph. Nothing about this shows up in a
   level or spectrum measurement of a machine that is keeping up -- it shows up
   as dropouts on one that is not. The note gap now widens as typing gets
   denser, the voice ceiling is lower, releases are shorter and the reverbs are
   shorter, which roughly halves the worst-case oscillator count on the two
   expensive moods.
4. **A brick wall doing the level control.** `Limiter(-3)` is a 20:1 compressor
   with a 10 ms release; on bass-heavy material that is heard as gritty
   pumping. A gentle glue compressor now takes the peaks off, and the limiter
   sits at -1 dBFS as a safety catch that should never engage.

## No FM synthesis

Bright's plucks were an `FMSynth`, and it aliased. Frequency-modulating an
oscillator at audio rate defeats Web Audio's bandlimiting: the oscillator's
harmonic content is computed for its nominal frequency, not for a frequency
being swept thousands of times a second. Carson's rule puts the sidebands of
Bright's top notes at 37 kHz against a 22.05 kHz Nyquist, and everything above
Nyquist folds back as inharmonic junk.

It is measurable. Render the same note twice, once at 44.1 kHz and once at
176.4 kHz, and compare the spectra below 20 kHz: nothing can alias at 4x
oversampling, so any excess in the 44.1 kHz render folded down. FM measured
+8 dB of excess across a whole pluck range. Detuning it did not help -- the
problem is audio-rate FM itself, not the settings.

`AMSynth` measures perfectly clean, because multiplying two bandlimited signals
stays bandlimited. It is also the better voice for the job: a non-integer
harmonicity gives inharmonic partials, which is exactly what makes a real bell
sound like a bell.

Two traps in measuring this, both of which produced confident nonsense before
being caught: the two renders must analyse the same *duration* (a fixed sample
count covers different amounts of a decaying note at different rates), and the
FFT must be normalised by window length (an unnormalised one scales with N, and
the two rates need different N). Both showed up as a suspiciously uniform dB
offset across every band. A correct comparison reads 0.0 dB in the fundamental
band; anything else means the method is still wrong.

The same test flags Tone's `fat*` oscillators at ~3 dB, which is not aliasing --
a plain sawtooth measures 0.0 dB, and the reading only appears with detuning,
whose oscillators start in different phase relationships at different sample
rates. Web Audio's sawtooth is bandlimited.

## Where "long and ethereal" comes from

Not from longer notes. Doubling a note's length doubles how long it occupies a
voice, which walks straight back into the problem above. The length comes from
a **ripple send** instead: the pluck layer's gain feeds a feedback delay whose
output rejoins the bus ahead of the reverb, so every keystroke throws off a
decaying series of echoes that wash into the room. Echoes cost no polyphony.

The send is tapped *after* the pluck layer gain, so the typing state controls
how much new energy enters the echoes while tails already in flight decay
naturally -- which is why the sound keeps blooming for a few seconds after you
stop typing.

## Pace is words, not keystrokes

It used to be `60000 / (medianInterval * 5)` -- the interval between keys, run
through the old "five characters to a word" convention. That is not words per
minute. It counts backspaces as progress, reports a speed while you delete a
paragraph, and answers "how fast are your fingers moving" rather than "how much
writing is getting done".

`util/word-rate.js` counts actual words over a trailing window instead. Only
the *count* crosses the line -- the analyser still never sees text, and the
count is already on screen. Two details that matter: the window opens on the
first keystroke rather than on page load (or the first reading is diluted by
however long the page sat blank), and the rate genuinely decays toward zero
while you sit still, which is what words per minute means.

Exports use a whole-session average instead, which is the more useful number
for a summary: 412 words in 22 minutes.

## What resting sounds like, and the frequency question

The brief asks for near-silence at rest, which a bare drone delivers a little
too literally -- nothing changes, so there is nothing to settle into. The page
now breathes: the drone swells and fades, and one chime sounds per breath,
rotating through a four-note figure. Predictability is the point here, rather
than something to apologise for.

The breath is six per minute. That number is not decoration and it is not a
"healing frequency". Claims about specific *pitches* being calming -- 432 Hz
over 440 Hz, the Solfeggio set -- have no credible support and are not worth
building on. What does have replicated support is *pacing*: breathing at around
five to six breaths a minute sits near the baroreflex resonance frequency,
raises heart-rate variability, and is the rate paced-breathing relaxation
protocols actually use. So the rhythm is the part worth borrowing. Whether
anyone falls in with it is up to them; the page just offers the tempo.

The visual pulse reads the same `rest.period`, so what you see and what you
hear breathe together.

## No build step

The site is plain ES modules, so it can be opened from any static server and
deployed by copying files. The cost is that a mistyped import path fails at
runtime rather than at build time, which is what `scripts/check-assets.mjs`
exists to catch — it walks `index.html` and every module reachable from it and
resolves each local reference against the filesystem.

Tone.js and jsPDF are vendored rather than loaded from a CDN so the deployed
site has no third-party runtime dependency and works offline. Both are loaded
lazily via `src/util/load-script.js`: Tone on the opening gesture (browsers will
not start an AudioContext before one anyway), jsPDF only if someone exports a
PDF. Both ship as UMD; jsPDF's ESM build still carries bare `@babel/runtime`
imports that no browser can resolve without a bundler.

## Testing

`npm test` runs `node:test` against the pure modules — rhythm analysis, mixing,
scales, the melodic walk and export formatting. They need no DOM and no audio
context, which is why `TypingAnalyser` takes an injected clock and `AudioEngine`
takes an injected Tone namespace.

Not yet covered, and the obvious next step: a headless-browser smoke test that
loads the page, types, and asserts the state transitions and that an export
downloads. The DOM wiring in `src/ui/` and `src/main.js` has no automated
coverage at all today.
