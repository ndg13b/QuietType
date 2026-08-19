/**
 * QuietType — application entry point.
 *
 * Wires the four pieces together: the analyser watches typing rhythm, the
 * audio engine and the visual field both listen to it, and the UI reports
 * what is happening. The note text is only ever touched by the export code.
 */
import { TypingAnalyser } from './keystroke.js';
import { AudioEngine } from './audio/engine.js';
import { loadTone } from './audio/load-tone.js';
import { DEFAULT_MOOD, MOODS, MOOD_IDS, getMood } from './audio/moods.js';
import { VisualField } from './visuals/field.js';
import { Controls } from './ui/controls.js';
import { StatusBar } from './ui/status.js';
import { applyPalette } from './ui/theme.js';
import { EXPORTERS } from './export/download.js';
import { countWords } from './export/format.js';
import * as storage from './util/storage.js';

/** How often the rhythm is re-evaluated (ms). Independent of the frame rate so
 *  pause and rest transitions still happen in a backgrounded tab. */
const TICK_MS = 120;
/** Quiet period before a draft is written to localStorage. */
const AUTOSAVE_MS = 800;
/** Time in flow before the interface steps back. */
const DEEP_FOCUS_MS = 2600;
/** How long the interface stays visible after the pointer moves. */
const POINTER_REVEAL_MS = 2500;

const note = document.getElementById('note');
const canvas = document.getElementById('field');

const preferences = storage.loadPreferences();
let moodId = MOOD_IDS.includes(preferences.mood) ? preferences.mood : DEFAULT_MOOD;
let mood = getMood(moodId);
let muted = preferences.muted === true;
let volume = typeof preferences.volume === 'number' ? preferences.volume : 0.75;

const reducedMotion = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)');

const analyser = new TypingAnalyser();
const engine = new AudioEngine({ loadTone, mood });
const field = new VisualField(canvas, mood, { reducedMotion: reducedMotion?.matches });
const status = new StatusBar();

let snapshot = analyser.sample();
let words = 0;
let textDirty = true;
let autosaveTimer = 0;
/** Timestamp until which the chrome stays visible because a pointer moved. */
let revealUntil = 0;

/* ------------------------------------------------------------------ setup */

applyPalette(mood);

const controls = new Controls({
  moods: MOOD_IDS.map((id) => MOODS[id]),
  on: {
    begin: startSession,
    mood: selectMood,
    sound: toggleSound,
    volume: setVolume,
    export: runExport,
    clear: clearNote,
  },
});

controls.setMood(moodId);
controls.setVolume(volume);
controls.setSoundState({ enabled: !muted, live: false, label: 'Sound' });

const restored = storage.loadDraft();
if (restored) {
  note.value = restored;
  textDirty = true;
}

/* ------------------------------------------------------------- typing in */

/**
 * Translate a keyboard event into the key the analyser should see.
 * Returns null for presses that are not writing: IME composition, and
 * shortcuts other than undo (which really is a correction).
 */
function analyserKey(event) {
  if (event.isComposing || event.keyCode === 229) return null;
  if (event.ctrlKey || event.metaKey) {
    return event.key === 'z' || event.key === 'Z' ? 'Backspace' : null;
  }
  return event.key;
}

note.addEventListener('keydown', (event) => {
  const key = analyserKey(event);
  if (key) analyser.press({ key });
});

note.addEventListener('input', () => {
  textDirty = true;
  clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(() => storage.saveDraft(note.value), AUTOSAVE_MS);
});

// The engine and the visuals both react to the keystroke itself, not to the
// tick, so a note lands in the same task as the keypress.
analyser.on('keystroke', (event) => {
  engine.onKeystroke(event);
  field.spark(event);
});

/* ------------------------------------------------------------ mood + sound */

function selectMood(id) {
  if (!MOOD_IDS.includes(id) || id === moodId) return;
  moodId = id;
  mood = getMood(id);
  applyPalette(mood);
  engine.setMood(mood);
  field.setMood(mood);
  controls.setMood(id);
  persistPreferences();
}

/** Start audio. Browsers require this to happen inside a user gesture. */
async function startSession(id) {
  selectMood(id);
  controls.dismissWelcome();
  try {
    await engine.start();
    engine.setVolume(volume);
    engine.setMuted(muted);
    controls.setSoundState({ enabled: !muted, live: !muted });
  } catch (error) {
    console.error('[quiettype] audio unavailable', error);
    // Leave the switch in the off position so that pressing it reads as
    // "turn sound on" and comes back through here for another attempt.
    muted = true;
    controls.setSoundState({ enabled: false, live: false, label: 'No sound' });
    controls.toast('Sound could not start — the writing and visuals still work.');
  }
}

async function toggleSound() {
  muted = !muted;
  persistPreferences();

  // The button doubles as a way in when audio never started, or as a retry
  // after it failed.
  if (!muted && !engine.started) {
    await startSession(moodId);
    return;
  }

  engine.setMuted(muted);
  controls.setSoundState({ enabled: !muted, live: engine.started && !muted });
}

function setVolume(value) {
  volume = value;
  engine.setVolume(value);
  persistPreferences();
}

function persistPreferences() {
  storage.savePreferences({ mood: moodId, volume, muted });
}

/* ---------------------------------------------------------------- export */

async function runExport(format) {
  const exporter = EXPORTERS[format];
  if (!exporter) return;
  if (!note.value.trim()) {
    controls.toast('Nothing to export yet.');
    return;
  }

  controls.setExporting(true);
  controls.toast(`Building ${exporter.label}…`, { duration: 30_000 });
  try {
    const result = await exporter.run(note.value, {
      moodName: mood.name,
      durationMs: snapshot.elapsedMs,
      wpm: snapshot.state === 'idle' ? 0 : snapshot.wpm,
      date: new Date(),
    });
    controls.toast(result.warnings[0] ?? `Saved ${result.filename}`, {
      duration: result.warnings.length ? 9000 : 4200,
    });
  } catch (error) {
    console.error('[quiettype] export failed', error);
    controls.toast(`Could not build the ${exporter.label} file.`);
  } finally {
    controls.setExporting(false);
  }
}

function clearNote() {
  if (note.value.trim() && !confirm('Clear this note? It cannot be undone.')) return;
  note.value = '';
  storage.clearDraft();
  analyser.reset();
  textDirty = true;
  note.focus();
  controls.toast('Cleared.');
}

/* ------------------------------------------------------------- the loops */

/** Rhythm and audio: a fixed interval, so it survives a backgrounded tab. */
setInterval(() => {
  snapshot = analyser.sample();
  engine.update(snapshot);

  if (textDirty) {
    words = countWords(note.value);
    textDirty = false;
  }
  status.update(snapshot, words);

  const deep =
    snapshot.state === 'flow' &&
    snapshot.stateAge > DEEP_FOCUS_MS &&
    performance.now() > revealUntil;
  document.body.dataset.flow = deep ? 'deep' : 'shallow';
}, TICK_MS);

/** Drawing: animation frames, paused by the browser when nothing is visible. */
let lastFrame = performance.now();
function frame(time) {
  field.render(time - lastFrame, snapshot);
  lastFrame = time;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

/* ---------------------------------------------------------------- chrome */

let resizeQueued = false;
globalThis.addEventListener('resize', () => {
  if (resizeQueued) return;
  resizeQueued = true;
  requestAnimationFrame(() => {
    field.resize();
    resizeQueued = false;
  });
});

reducedMotion?.addEventListener('change', (event) => field.setReducedMotion(event.matches));

// Moving the pointer means you are reaching for the interface, so bring it
// back and hold it there long enough to actually be used.
globalThis.addEventListener('pointermove', () => {
  revealUntil = performance.now() + POINTER_REVEAL_MS;
}, { passive: true });

// Flush the draft when the page goes away. `visibilitychange` and `pagehide`
// are the reliable pair -- `beforeunload` does not fire on mobile Safari and
// disqualifies the page from the back/forward cache.
function flushDraft() {
  clearTimeout(autosaveTimer);
  storage.saveDraft(note.value);
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') flushDraft();
});
globalThis.addEventListener('pagehide', flushDraft);

if (!storage.storageAvailable) {
  controls.toast('This browser is blocking local storage — your note will not be kept between visits.', {
    duration: 7000,
  });
}
