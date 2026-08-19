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

Gaps longer than `PAUSE_MS` are excluded from the rhythm statistics entirely.
They are pauses, and the state machine already handles pauses; feeding them to
the statistics would make every return from a pause read as erratic for the
next two dozen keystrokes.

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
