#!/usr/bin/env node
/**
 * A static file server for local development.
 *
 * ES modules cannot be loaded over file://, so `open index.html` will not do.
 * This has no dependencies on purpose: the app itself ships no build step, and
 * neither should running it.
 *
 *   npm run dev -- --port 4000
 */
import { createReadStream, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const portFlag = process.argv.indexOf('--port');
const PORT = Number(portFlag > -1 ? process.argv[portFlag + 1] : process.env.PORT || 5173);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.md': 'text/markdown; charset=utf-8',
};

/** Resolve a URL path to a file inside ROOT, or null if it escapes. */
function resolveTarget(urlPath) {
  const decoded = decodeURIComponent(urlPath.split('?')[0]);
  const candidate = resolve(ROOT, `.${normalize(decoded)}`);
  if (candidate !== ROOT && !candidate.startsWith(ROOT + sep)) return null;
  try {
    return statSync(candidate).isDirectory() ? join(candidate, 'index.html') : candidate;
  } catch {
    return null;
  }
}

createServer((request, response) => {
  const target = resolveTarget(request.url || '/');
  if (!target) {
    response.writeHead(404, { 'content-type': 'text/plain' });
    response.end('Not found\n');
    return;
  }

  response.writeHead(200, {
    'content-type': TYPES[extname(target)] ?? 'application/octet-stream',
    'cache-control': 'no-store',
  });
  createReadStream(target)
    .on('error', () => {
      response.writeHead(404, { 'content-type': 'text/plain' });
      response.end('Not found\n');
    })
    .pipe(response);
}).listen(PORT, () => {
  console.log(`QuietType → http://localhost:${PORT}`);
});
