/**
 * Loads a vendored UMD bundle on demand and hands back the global it defines.
 *
 * Both libraries QuietType vendors ship as UMD rather than browser-ready ESM,
 * and both are large enough that loading them eagerly would delay the one
 * thing that must be instant: the textarea. So they are fetched at the moment
 * they are first needed -- Tone on the opening gesture, jsPDF only if someone
 * exports a PDF -- and cached here.
 */

/** @type {Map<string, Promise<any>>} */
const cache = new Map();

/**
 * @param {string} src script URL
 * @param {string} globalName the global the script defines, e.g. 'Tone'
 * @returns {Promise<any>}
 */
export function loadScript(src, globalName) {
  if (globalThis[globalName]) return Promise.resolve(globalThis[globalName]);

  const existing = cache.get(src);
  if (existing) return existing;

  const pending = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.addEventListener('load', () => {
      const value = globalThis[globalName];
      if (value) resolve(value);
      else reject(new Error(`${src} loaded but did not define ${globalName}`));
    });
    script.addEventListener('error', () => {
      // Drop the cache entry so a later attempt can retry.
      cache.delete(src);
      script.remove();
      reject(new Error(`Could not load ${src}`));
    });
    document.head.append(script);
  });

  cache.set(src, pending);
  return pending;
}
