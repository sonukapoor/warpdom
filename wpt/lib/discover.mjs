// Test discovery: which files under a WPT directory are testharness.js tests
// that run in a window, and the test URLs they produce (variants included).
//
// Follows WPT's documented conventions (web-platform-tests.org, "Test
// Types" and "testharness.js tests"):
// - foo.html / foo.htm that load /resources/testharness.js;
// - foo.any.js (run as foo.any.html when its META global includes window,
//   the default) and foo.window.js (run as foo.window.html);
// - variants: <meta name="variant" content="?..."> in HTML files,
//   `// META: variant=?...` in .js files; each variant is a separate test;
// - files in resources/ and support/ directories, references (-ref,
//   reference/), manual tests (-manual) and crash tests are not tests.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const NOT_TEST_DIRS = new Set(['resources', 'support', 'tools', 'crashtests', 'reference', 'references', '.git']);
const WORKER_ONLY = /\.(worker|serviceworker|sharedworker)\.js$/;

// `// META: key=value` lines at the top of a .js test.
export function parseJsMeta(source) {
  const meta = [];
  for (const line of source.split('\n')) {
    const m = /^\/\/\s*META:\s*(\w+)=(.*)$/.exec(line.trim());
    if (m) meta.push([m[1], m[2].trim()]);
    else if (line.trim() && !line.trim().startsWith('//')) break;
  }
  return meta;
}

// The scopes a .any.js test runs in (META: global=...): default is window
// and dedicated worker.
function anyRunsInWindow(meta) {
  const globals = meta.filter(([k]) => k === 'global').flatMap(([, v]) => v.split(',').map((s) => s.trim()));
  if (!globals.length) return true;
  return globals.some((g) => g === 'window' || g === 'default');
}

const HTML_VARIANT = /<meta\s+name=["']?variant["']?\s+content=["']([^"']*)["']\s*\/?>/gi;
const HTML_TIMEOUT_LONG = /<meta\s+name=["']?timeout["']?\s+content=["']?long["']?/i;
const USES_TESTHARNESS = /\/resources\/testharness\.js/;
// testdriver.js automates user input through the browser's WebDriver
// connection, which no DOM-only runner has.
const USES_TESTDRIVER = /\/resources\/testdriver\.js/;
// Tentative tests cover proposals not yet in a standard (WPT: ".tentative."
// in the name or a "tentative" directory).
const TENTATIVE = /\.tentative\.|(^|\/)tentative\//;

function walk(dir, out) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!NOT_TEST_DIRS.has(entry.name)) walk(join(dir, entry.name), out);
    } else out.push(join(dir, entry.name));
  }
}

// Tests for the given paths (directories or files, relative to the WPT root).
// Returns { tests, notRunnable } where notRunnable lists files that are tests
// but cannot run in a window here (XML documents, worker-only scopes).
export function discover(wptRoot, paths) {
  const files = [];
  for (const p of paths) {
    const abs = join(wptRoot, p);
    if (statSync(abs).isDirectory()) walk(abs, files);
    else files.push(abs);
  }
  const tests = [];
  const notRunnable = [];
  for (const abs of [...new Set(files)].sort()) {
    const path = relative(wptRoot, abs).split(sep).join('/');
    const name = path.split('/').pop();
    if (/-(ref|manual|notref)\.|^ref-|-manual$/.test(name)) continue;
    if (/\.(html?)$/.test(name)) {
      const source = readFileSync(abs, 'utf8');
      if (!USES_TESTHARNESS.test(source)) continue; // reftest, support page
      const variants = [...source.matchAll(HTML_VARIANT)].map((m) => m[1]);
      const long = HTML_TIMEOUT_LONG.test(source);
      for (const variant of variants.length ? variants : ['']) {
        tests.push({
          id: path + variant,
          file: path,
          kind: 'html',
          url: '/' + path + variant,
          long,
          testdriver: USES_TESTDRIVER.test(source),
          tentative: TENTATIVE.test(path),
        });
      }
    } else if (/\.(xhtml|xht|svg|xml)$/.test(name)) {
      const source = readFileSync(abs, 'utf8');
      if (USES_TESTHARNESS.test(source))
        notRunnable.push({ id: path, reason: 'XML document (not loaded by this harness)' });
    } else if (/\.(any|window)\.js$/.test(name)) {
      const source = readFileSync(abs, 'utf8');
      const meta = parseJsMeta(source);
      const kind = name.endsWith('.any.js') ? 'any' : 'window';
      if (kind === 'any' && !anyRunsInWindow(meta)) {
        notRunnable.push({ id: path, reason: 'META global excludes window' });
        continue;
      }
      const htmlPath = path.replace(/\.js$/, '.html');
      const variants = meta.filter(([k]) => k === 'variant').map(([, v]) => v);
      const long = meta.some(([k, v]) => k === 'timeout' && v === 'long');
      const scripts = meta.filter(([k]) => k === 'script').map(([, v]) => v);
      const title = meta.find(([k]) => k === 'title')?.[1];
      for (const variant of variants.length ? variants : ['']) {
        tests.push({
          id: htmlPath + variant,
          file: path,
          kind,
          url: '/' + htmlPath + variant,
          long,
          scripts,
          title,
          testdriver: scripts.some((s) => USES_TESTDRIVER.test(s)),
          tentative: TENTATIVE.test(path),
        });
      }
    } else if (WORKER_ONLY.test(name)) {
      notRunnable.push({ id: path, reason: 'worker scope' });
    }
  }
  return { tests, notRunnable };
}

// A deterministic sample of n tests (by a hash of the id and a seed), so a
// sample is the same on every machine and over time for the same checkout.
export function sample(tests, n, seed = 1) {
  if (!n || n >= tests.length) return tests;
  const hash = (s) => {
    let h = 2166136261 ^ seed;
    for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
    return h >>> 0;
  };
  // Sample by file so variants of one file stay together.
  const byFile = new Map();
  for (const t of tests) (byFile.get(t.file) ?? byFile.set(t.file, []).get(t.file)).push(t);
  const files = [...byFile.keys()].sort((a, b) => hash(a) - hash(b) || (a < b ? -1 : 1));
  const picked = [];
  for (const f of files) {
    if (picked.length >= n) break;
    picked.push(...byFile.get(f));
  }
  return picked.sort((a, b) => (a.id < b.id ? -1 : 1));
}
