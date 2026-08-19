/**
 * Turning a session into a file.
 *
 * Pure string work, no DOM: the note body is passed through untouched and only
 * ever wrapped with metadata the user can see. This is the one place the text
 * content is handled at all, and it exists solely so the writer can take their
 * words with them.
 */

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export const UNTITLED = 'Untitled note';

/** Words, counted the way a word processor would. */
export function countWords(text) {
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

/**
 * Use the first line with something on it as the note's title, so exports get
 * a sensible name without asking the writer for one.
 */
export function deriveTitle(text, { maxLength = 80 } = {}) {
  const line = text.split('\n').find((candidate) => candidate.trim().length > 0);
  if (!line) return UNTITLED;
  // Strip markdown heading markers and list bullets people naturally type.
  const cleaned = line.trim().replace(/^#{1,6}\s+/, '').replace(/^[-*+]\s+/, '').trim();
  // A line of bare punctuation ("###", "---") is formatting, not a title.
  if (!/[\p{L}\p{N}]/u.test(cleaned)) return UNTITLED;
  return cleaned.length > maxLength ? `${cleaned.slice(0, maxLength - 1).trimEnd()}…` : cleaned;
}

/** Filesystem-safe, lowercase, hyphenated. */
export function slugify(title) {
  const slug = title
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '') // drop combining marks left by NFKD
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/, '');
  return slug || 'note';
}

/** `2026-08-19-first-light.md` */
export function buildFilename(title, extension, date = new Date()) {
  const stamp = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
  return `${stamp}-${slugify(title)}.${extension}`;
}

export const formatDate = (date) =>
  `${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;

/** `0s`, `47s`, `12m 30s`, `1h 04m`. */
export function formatDuration(ms) {
  const total = Math.max(0, Math.round(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  if (hours) return `${hours}h ${String(minutes).padStart(2, '0')}m`;
  if (minutes) return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
  return `${seconds}s`;
}

/**
 * @typedef {object} SessionMeta
 * @property {string} [moodName]
 * @property {number} [durationMs]
 * @property {Date} [date]
 * @property {number} [wpm]
 */

/** The one-line session summary appended to exports. */
export function summarise(text, meta = {}) {
  const { moodName, durationMs = 0, date = new Date(), wpm } = meta;
  const parts = ['QuietType'];
  if (moodName) parts.push(moodName);
  parts.push(formatDate(date));

  const stats = [`${countWords(text)} words`];
  if (durationMs > 0) stats.unshift(formatDuration(durationMs));
  if (wpm) stats.push(`${wpm} wpm`);

  return `${parts.join(' · ')} — ${stats.join(', ')}`;
}

/** Body verbatim, with the session summary under a plain rule. */
export function toPlainText(text, meta = {}) {
  const body = text.replace(/\s+$/, '');
  if (meta.includeSummary === false) return `${body}\n`;
  return `${body}\n\n---\n${summarise(text, meta)}\n`;
}

/** Body verbatim -- it is already the writer's markdown -- plus a footer. */
export function toMarkdown(text, meta = {}) {
  const body = text.replace(/\s+$/, '');
  if (meta.includeSummary === false) return `${body}\n`;
  return `${body}\n\n---\n\n*${summarise(text, meta)}*\n`;
}

/** Characters jsPDF's built-in fonts cannot draw (anything beyond Latin-1). */
export function findUnsupportedPdfCharacters(text) {
  const found = new Set();
  for (const char of text) {
    const code = char.codePointAt(0);
    // Latin-1 plus the cp1252 punctuation block jsPDF maps for us.
    if (code > 0xff && !(code >= 0x2013 && code <= 0x2122)) found.add(char);
  }
  return [...found];
}
