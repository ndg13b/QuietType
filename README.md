# QuietType

A browser notes app where the **rhythm of your typing** plays a generative
soundscape underneath you. Write as you normally would; the gaps between your
keystrokes, the length of your pauses and how often you reach for backspace
become the input to a small synthesiser and a living backdrop.

The text itself is never analysed. Only its timing is.

- **No backend.** Everything runs in the browser. Nothing is uploaded.
- **No build step.** Plain HTML, CSS and ES modules, served as-is.
- **No runtime dependencies to install.** Tone.js and jsPDF are vendored.

## Running it

```sh
npm run dev          # http://localhost:5173
npm run check        # asset references + unit tests
npm test             # unit tests only
```

There is nothing to compile. `npm run dev` only exists because ES modules
cannot be loaded over `file://` — any static server will do.

## How it works

```
keydown ─▶ TypingAnalyser ─┬─▶ AudioEngine  ─▶ Tone.js ─▶ speakers
           (rhythm only)   └─▶ VisualField  ─▶ canvas
```

`TypingAnalyser` records *when* each key was pressed and which category it fell
into — regular, correction (backspace/delete) or accent (enter) — and never the
character. From the recent gaps it derives:

| Metric | Meaning |
| --- | --- |
| `intensity` | How fast the current burst is, 0–1 |
| `steadiness` | How even the pulse is, 0–1 |
| `correctionRate` | Share of recent keys that were corrections |
| `state` | `idle` · `flow` · `erratic` · `pause` · `rest` |

The state drives the mix of four continuously-running sound layers:

| State | What you hear |
| --- | --- |
| **flow** — typing along | Short plucked notes, one per keystroke, snapped to the scale |
| **pause** — quiet for ~1.2 s | A soft pad swells in underneath |
| **erratic** — backspacing, lurching rhythm | A detuned, filtered texture layers on top |
| **rest** — quiet for 10 s | Everything falls away but one slow, breathing tone |

Notes come from a melodic random walk over the active scale rather than from
random pitches, so the accompaniment sounds played rather than triggered. Each
keystroke also feeds a ripple send -- a feedback delay running into the room
reverb -- so a single key blooms into a decaying series of echoes rather than a
single short note.

### Moods

A mood is pure data — scale, synth voicing, reverb, and a colour palette that
the page and the canvas both read. Adding one means adding an entry to
[`src/audio/moods.js`](src/audio/moods.js); no CSS or engine changes are needed.

| Mood | Scale | Character |
| --- | --- | --- |
| **Calm** | D major pentatonic | Glassy plucks, long reverb, cool dark palette |
| **Bright** | G major | FM bell plucks, warm light palette |
| **Moody** | A aeolian | Detuned saws under a low filter, dark violet palette |

### Export

Notes export to plain text, Markdown or PDF, all generated in the browser.
Markdown and text keep the body byte-for-byte and append a session summary.
PDF uses jsPDF's built-in fonts, which cover Latin-1 and common typographic
punctuation; anything outside that (CJK, emoji) is reported in a warning so you
can use one of the text formats instead.

## Layout

```
index.html              markup and the module entry point
styles/main.css         all styling; colour comes from CSS variables the mood sets
src/
  keystroke.js          rhythm analysis and the typing state machine
  main.js               wiring, the tick loop and the render loop
  audio/
    engine.js           the four-layer Tone.js graph
    mix.js              state → layer gains (pure, tested)
    moods.js            mood presets
    melody.js           melodic random walk
    scales.js           scale and note-name maths
    load-tone.js        lazy loader for the vendored Tone.js
  visuals/field.js      canvas backdrop, ripples and motes
  export/
    format.js           titles, filenames, text and markdown (pure, tested)
    download.js         blob saving and PDF generation
  ui/                   controls, status readouts, palette application
  util/                 emitter, maths, storage, script loading
tests/                  node:test unit tests for the pure modules
scripts/                dev server and the asset-reference check
vendor/                 Tone.js and jsPDF, vendored (both MIT)
```

## Privacy

There is no server component, no analytics and no network request after the
page loads. Your draft is kept in this browser's `localStorage` so it survives a
refresh, and the *Clear this note* button removes it. If storage is
unavailable the editor still works; it just will not remember.

## Browser support

Any current browser with Web Audio and ES modules. Audio cannot start until you
interact with the page — that is what the opening mood picker is for. If audio
fails to start for any reason, the editor, visuals and export keep working.

## Contributing

`main` is what GitHub Pages deploys. `dev` is the integration branch for work in
progress; branch from it, and open pull requests back into it.

Run `npm run check` before pushing — it verifies every asset reference resolves
(there is no bundler to catch a typo'd path) and runs the unit tests.

## Licence

MIT — see [LICENSE](LICENSE). Vendored libraries keep their own MIT licences in
[`vendor/`](vendor).
