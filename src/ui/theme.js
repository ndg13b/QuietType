/** Pushes a mood's palette onto the document as CSS custom properties. */

export function applyPalette(mood, root = document.documentElement) {
  const { palette } = mood;
  root.style.setProperty('--surface', palette.surface);
  root.style.setProperty('--surface-raised', palette.surfaceRaised);
  root.style.setProperty('--ink', palette.ink);
  root.style.setProperty('--ink-soft', palette.inkSoft);
  root.style.setProperty('--accent', palette.accent);
  root.style.setProperty('--accent-soft', palette.accentSoft);
  root.style.colorScheme = palette.scheme;
  root.dataset.mood = mood.id;
  root.dataset.scheme = palette.scheme;

  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', palette.surface);
}
