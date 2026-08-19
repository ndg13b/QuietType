/** Tone.js, loaded from the vendored bundle on the first user gesture. */
import { loadScript } from '../util/load-script.js';

const SRC = new URL('../../vendor/tone/tone.js', import.meta.url).href;

export const loadTone = () => loadScript(SRC, 'Tone');
