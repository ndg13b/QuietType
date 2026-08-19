/**
 * Client-side export. Nothing is uploaded; every format is produced in the
 * browser and handed straight to the download shelf.
 */
import {
  buildFilename,
  deriveTitle,
  findUnsupportedPdfCharacters,
  summarise,
  toMarkdown,
  toPlainText,
} from './format.js';
import { loadScript } from '../util/load-script.js';

const JSPDF_URL = new URL('../../vendor/jspdf/jspdf.umd.min.js', import.meta.url).href;

/**
 * jsPDF is only fetched if someone actually asks for a PDF. The UMD build is
 * the one to use: the package's "esm" build still carries bare
 * `@babel/runtime` imports, which no browser can resolve without a bundler.
 */
const loadJsPdf = () => loadScript(JSPDF_URL, 'jspdf').then((ns) => ns.jsPDF);

function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = 'noopener';
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  // Give the browser a beat to start the download before dropping the blob.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/**
 * @typedef {object} ExportResult
 * @property {string} filename
 * @property {string[]} warnings
 */

/** @returns {ExportResult} */
export function exportPlainText(text, meta = {}) {
  const filename = buildFilename(deriveTitle(text), 'txt', meta.date);
  saveBlob(new Blob([toPlainText(text, meta)], { type: 'text/plain;charset=utf-8' }), filename);
  return { filename, warnings: [] };
}

/** @returns {ExportResult} */
export function exportMarkdown(text, meta = {}) {
  const filename = buildFilename(deriveTitle(text), 'md', meta.date);
  saveBlob(new Blob([toMarkdown(text, meta)], { type: 'text/markdown;charset=utf-8' }), filename);
  return { filename, warnings: [] };
}

/* A4 in points, with margins wide enough that a page of notes still breathes. */
const PAGE = { width: 595.28, height: 841.89, margin: 64 };
const BODY_SIZE = 11;
const LINE_HEIGHT = 16.5;

/** @returns {Promise<ExportResult>} */
export async function exportPdf(text, meta = {}) {
  const JsPDF = await loadJsPdf();
  const title = deriveTitle(text);
  const doc = new JsPDF({ unit: 'pt', format: 'a4', compress: true });

  doc.setProperties({ title, creator: 'QuietType', subject: 'Notes' });

  const maxWidth = PAGE.width - PAGE.margin * 2;
  const bottom = PAGE.height - PAGE.margin;
  let y = PAGE.margin;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(17);
  for (const line of doc.splitTextToSize(title, maxWidth)) {
    doc.text(line, PAGE.margin, y);
    y += 22;
  }

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(120);
  doc.text(summarise(text, meta), PAGE.margin, y);
  y += 26;

  doc.setFontSize(BODY_SIZE);
  doc.setTextColor(30);

  for (const paragraph of text.replace(/\r\n/g, '\n').split('\n')) {
    // An empty source line is a deliberate blank line, not a paragraph to wrap.
    const lines = paragraph.trim() ? doc.splitTextToSize(paragraph, maxWidth) : [''];
    for (const line of lines) {
      if (y > bottom) {
        doc.addPage();
        y = PAGE.margin;
      }
      if (line) doc.text(line, PAGE.margin, y);
      y += LINE_HEIGHT;
    }
  }

  // Page numbers last, once the total is known.
  const pages = doc.getNumberOfPages();
  if (pages > 1) {
    doc.setFontSize(9);
    doc.setTextColor(150);
    for (let page = 1; page <= pages; page += 1) {
      doc.setPage(page);
      doc.text(`${page} / ${pages}`, PAGE.width / 2, PAGE.height - 34, { align: 'center' });
    }
  }

  const filename = buildFilename(title, 'pdf', meta.date);
  saveBlob(doc.output('blob'), filename);

  const unsupported = findUnsupportedPdfCharacters(text);
  return {
    filename,
    warnings: unsupported.length
      ? [`PDF fonts could not draw ${unsupported.length} character type(s): ${unsupported.slice(0, 6).join(' ')}. Markdown and plain text keep them.`]
      : [],
  };
}

export const EXPORTERS = {
  txt: { label: 'Plain text', run: exportPlainText },
  md: { label: 'Markdown', run: exportMarkdown },
  pdf: { label: 'PDF', run: exportPdf },
};
