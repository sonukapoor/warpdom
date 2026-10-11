#!/usr/bin/env node
// Harness self-test: runs the pages in selftest/cases with both engines and
// checks the harness behaviors they exercise (script order, deferred and
// module scripts, load events, variants, .any.js pages, errors, timeouts).
// A failure here is a harness problem, not an engine bug.
//
//   node wpt/selftest/run.mjs [--wpt ~/Projects/wpt]
import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const i = process.argv.indexOf('--wpt');
const wpt = resolve(i > 0 ? process.argv[i + 1] : process.env.WPT_DIR ?? join(homedir(), 'Projects/wpt'));

// Expected harness status and subtest statuses, per test id.
const EXPECTED = {
  'selftest/order.html': ['OK', { 'a script sees the elements before it, not those after it': 'PASS', 'deferred scripts, then DOMContentLoaded, then load': 'PASS' }],
  'selftest/error.html': ['ERROR', { passes: 'PASS' }],
  'selftest/timeout.html': ['TIMEOUT', { 'never done': 'TIMEOUT' }],
  'selftest/variants.html?a': ['OK', { 'location.search is the variant': 'PASS' }],
  'selftest/variants.html?b': ['OK', { 'location.search is the variant': 'PASS' }],
  'selftest/generated.any.html': ['OK', { 'META script and title': 'PASS' }],
  'selftest/module.html': ['OK', { 'module script imports': 'PASS', 'fetch serves files of the checkout': 'PASS' }],
  'selftest/realm.html': ['OK', { "assert_throws_js sees the DOM's TypeError as the page's": 'PASS' }],
};

const root = mkdtempSync(join(tmpdir(), 'wpt-selftest-'));
let failures = 0;
try {
  symlinkSync(join(wpt, 'resources'), join(root, 'resources'));
  cpSync(join(here, 'cases'), join(root, 'selftest'), { recursive: true });
  const out = join(root, 'out');
  // Not a git checkout: the run records no WPT commit.
  execFileSync(process.execPath, [join(here, '..', 'run.mjs'), 'selftest', '--wpt', root, '--engine', 'warpdom,jsdom',
    '--timeout-multiplier', '0.1', '--no-skip', '--quiet', '--out', out], { stdio: ['ignore', 'ignore', 'ignore'] });
  for (const engine of ['warpdom', 'jsdom']) {
    const run = JSON.parse(readFileSync(join(out, `${engine}.json`), 'utf8'));
    for (const [id, [harness, subtests]] of Object.entries(EXPECTED)) {
      const r = run.results[id];
      const got = r ? [r.harness, Object.fromEntries(r.subtests.map((s) => [s.name, s.status]))] : ['MISSING', {}];
      const ok = got[0] === harness && JSON.stringify(got[1]) === JSON.stringify(subtests);
      if (!ok) failures++;
      console.log(`${ok ? 'ok  ' : 'FAIL'} ${engine} ${id}${ok ? '' : `: expected ${JSON.stringify([harness, subtests])}, got ${JSON.stringify(got)}${r?.message ? ` (${r.message})` : ''} ${(r?.subtests ?? []).filter((s) => s.message).map((s) => s.message).join('; ')}`}`);
    }
    for (const id of Object.keys(run.results)) if (!EXPECTED[id]) { failures++; console.log(`FAIL ${engine} unexpected test ${id}`); }
  }
} finally {
  rmSync(root, { recursive: true, force: true });
}
console.log(failures ? `${failures} failure(s)` : 'all harness checks pass');
process.exit(failures ? 1 : 0);
