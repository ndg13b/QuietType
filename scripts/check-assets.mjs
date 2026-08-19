#!/usr/bin/env node
/**
 * Verifies that everything the site references actually exists.
 *
 * With no build step there is no bundler to catch a mistyped path, and a
 * broken module specifier only shows up as a blank page in production. This
 * walks index.html and every module reachable from it and resolves each local
 * reference against the filesystem.
 */
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve, relative } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const problems = [];
const visited = new Set();

const isLocal = (spec) => spec && !/^(https?:|data:|mailto:|#|\/\/)/.test(spec);

/** Collect src= and href= targets from the HTML. */
function checkHtml(file) {
  const html = readFileSync(join(ROOT, file), 'utf8');
  const refs = [...html.matchAll(/(?:src|href)\s*=\s*"([^"]+)"/g)].map((m) => m[1]);
  const scripts = [];

  for (const ref of refs) {
    if (!isLocal(ref)) continue;
    const target = join(ROOT, ref);
    if (!existsSync(target)) problems.push(`${file} references missing ${ref}`);
    else if (ref.endsWith('.js')) scripts.push(ref);
  }
  return scripts;
}

/** Follow static imports and `new URL(..., import.meta.url)` references. */
function checkModule(file) {
  if (visited.has(file)) return;
  visited.add(file);

  const source = readFileSync(join(ROOT, file), 'utf8');
  const specs = [
    ...[...source.matchAll(/(?:^|\n)\s*(?:import|export)[^'"\n]*from\s*['"]([^'"]+)['"]/g)],
    ...[...source.matchAll(/new URL\(\s*['"]([^'"]+)['"]\s*,\s*import\.meta\.url\s*\)/g)],
  ].map((m) => m[1]);

  for (const spec of specs) {
    if (!isLocal(spec)) continue;
    const target = resolve(ROOT, dirname(file), spec);
    if (!existsSync(target)) {
      problems.push(`${file} imports missing ${spec}`);
      continue;
    }
    const next = relative(ROOT, target);
    if (next.endsWith('.js')) checkModule(next);
  }
}

for (const entry of checkHtml('index.html')) checkModule(entry);

console.log(`checked index.html and ${visited.size} modules`);
if (problems.length) {
  console.error(`\n${problems.length} problem(s):`);
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}
console.log('all references resolve');
