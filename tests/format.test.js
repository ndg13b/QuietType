import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  UNTITLED,
  buildFilename,
  countWords,
  deriveTitle,
  findUnsupportedPdfCharacters,
  formatDate,
  formatDuration,
  slugify,
  summarise,
  toMarkdown,
  toPlainText,
} from '../src/export/format.js';

const DATE = new Date(2026, 7, 19, 14, 30);
const META = { moodName: 'Calm', durationMs: 750_000, date: DATE, wpm: 48 };

describe('countWords', () => {
  it('counts across any whitespace', () => {
    assert.equal(countWords('one two  three\nfour\tfive'), 5);
  });

  it('is zero for nothing at all', () => {
    assert.equal(countWords(''), 0);
    assert.equal(countWords('   \n\t '), 0);
  });
});

describe('deriveTitle', () => {
  it('uses the first line with something on it', () => {
    assert.equal(deriveTitle('\n\n  First light  \nthen the rest'), 'First light');
  });

  it('strips markdown heading and bullet markers', () => {
    assert.equal(deriveTitle('## First light'), 'First light');
    assert.equal(deriveTitle('- First light'), 'First light');
  });

  it('falls back when there is nothing to go on', () => {
    assert.equal(deriveTitle(''), UNTITLED);
    assert.equal(deriveTitle('   \n  \n'), UNTITLED);
    assert.equal(deriveTitle('###   '), UNTITLED);
  });

  it('truncates a very long first line', () => {
    const title = deriveTitle('x'.repeat(200));
    assert.ok(title.length <= 80);
    assert.ok(title.endsWith('…'));
  });
});

describe('slugify', () => {
  it('folds accents and punctuation into hyphens', () => {
    assert.equal(slugify('Café — Notes on Ïce!!'), 'cafe-notes-on-ice');
  });

  it('never produces leading, trailing or empty slugs', () => {
    assert.equal(slugify('   ...   '), 'note');
    assert.equal(slugify('日本語だけ'), 'note');
    assert.equal(slugify('--hi--'), 'hi');
  });

  it('keeps filenames a sensible length', () => {
    assert.ok(slugify('word '.repeat(60)).length <= 60);
    assert.ok(!slugify('word '.repeat(60)).endsWith('-'));
  });
});

describe('buildFilename', () => {
  it('leads with an ISO-style date', () => {
    assert.equal(buildFilename('First light', 'md', DATE), '2026-08-19-first-light.md');
  });

  it('zero-pads single-digit months and days', () => {
    assert.equal(buildFilename('x', 'txt', new Date(2026, 0, 5)), '2026-01-05-x.txt');
  });
});

describe('formatDuration', () => {
  it('reads naturally at each scale', () => {
    assert.equal(formatDuration(0), '0s');
    assert.equal(formatDuration(47_000), '47s');
    assert.equal(formatDuration(750_000), '12m 30s');
    assert.equal(formatDuration(3_900_000), '1h 05m');
  });

  it('does not go negative', () => {
    assert.equal(formatDuration(-5000), '0s');
  });
});

describe('formatDate', () => {
  it('spells the month out', () => {
    assert.equal(formatDate(DATE), '19 August 2026');
    assert.equal(formatDate(new Date(2026, 0, 1)), '1 January 2026');
  });
});

describe('summarise', () => {
  it('names the mood, the date and the session stats', () => {
    const line = summarise('one two three', META);
    assert.match(line, /QuietType/);
    assert.match(line, /Calm/);
    assert.match(line, /19 August 2026/);
    assert.match(line, /12m 30s/);
    assert.match(line, /3 words/);
    assert.match(line, /48 wpm/);
  });

  it('leaves out stats it does not have', () => {
    const line = summarise('one two', { date: DATE });
    assert.match(line, /2 words/);
    assert.doesNotMatch(line, /wpm/);
    assert.doesNotMatch(line, /0s/);
  });
});

describe('exports', () => {
  const body = 'First light\n\nThe kettle, then the desk.';

  it('keeps plain text verbatim and appends a summary', () => {
    const out = toPlainText(body, META);
    assert.ok(out.startsWith(body), 'body must be untouched');
    assert.match(out, /\n---\nQuietType/);
    assert.ok(out.endsWith('\n'));
  });

  it('keeps markdown verbatim and italicises the summary', () => {
    const out = toMarkdown(body, META);
    assert.ok(out.startsWith(body));
    assert.match(out, /\n---\n\n\*QuietType.*\*\n$/s);
  });

  it('leaves the markdown body alone -- it is already the writer’s markdown', () => {
    const markdown = '# Heading\n\n- a *list* item\n\n> a quote';
    assert.ok(toMarkdown(markdown, META).startsWith(markdown));
  });

  it('can omit the summary entirely', () => {
    assert.equal(toPlainText(body, { includeSummary: false }), `${body}\n`);
    assert.equal(toMarkdown(body, { includeSummary: false }), `${body}\n`);
  });

  it('trims trailing whitespace without eating internal blank lines', () => {
    const out = toPlainText('a\n\n\nb\n\n\n   ', META);
    assert.ok(out.startsWith('a\n\n\nb\n\n'));
  });
});

describe('findUnsupportedPdfCharacters', () => {
  it('passes Latin text and typographic punctuation', () => {
    assert.deepEqual(findUnsupportedPdfCharacters('Café — “naïve” … 100%'), []);
  });

  it('reports characters the built-in fonts cannot draw', () => {
    const found = findUnsupportedPdfCharacters('hello 日本 ✨ hello');
    assert.deepEqual(found, ['日', '本', '✨']);
  });

  it('is empty for empty input', () => {
    assert.deepEqual(findUnsupportedPdfCharacters(''), []);
  });
});
