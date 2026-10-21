// Cold load time in fresh processes and window creation time.
// Budget (docs/design.md): cold load <= 30-40 ms with the milestone scope;
// jsdom 30 loads in ~176 ms, happy-dom 20 in ~85 ms on the same machine.
//
//   node bench/load.js [--json] [warpdomDir]
//
// warpdomDir: the warpdom checkout to measure (default: this repository).
// --json: print one JSON object (ms per measure) instead of the text lines;
// used by bench/ci-compare.mjs.
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const args = process.argv.slice(2);
const json = args.includes('--json');
const dirArg = args.find((a) => !a.startsWith('--'));
const dir = path.resolve(dirArg ?? fileURLToPath(new URL('..', import.meta.url)));
const entry = pathToFileURL(path.join(dir, 'src', 'index.js')).href;
const probe = `const t = performance.now(); const { createWindow } = await import(${JSON.stringify(entry)});
const t2 = performance.now(); createWindow(); const t3 = performance.now(); console.log(t2 - t, t3 - t2);`;

const runs = [];
for (let i = 0; i < 7; i++) {
  const [load, first] = String(execFileSync(process.execPath, ['--input-type=module', '-e', probe])).trim().split(' ').map(Number);
  runs.push({ load, first });
}
const median = (xs) => xs.sort((a, b) => a - b)[xs.length >> 1];
const coldLoad = median(runs.map((r) => r.load));
const firstWindow = median(runs.map((r) => r.first));
if (!json) {
  console.log(`cold load      ${coldLoad.toFixed(1)} ms (median of ${runs.length} fresh processes)`);
  console.log(`first window   ${firstWindow.toFixed(2)} ms`);
}

const { createWindow } = await import(entry);
for (let i = 0; i < 20; i++) createWindow();
const times = [];
for (let i = 0; i < 200; i++) { const t = performance.now(); createWindow(); times.push(performance.now() - t); }
const nextWindows = median(times);
if (json) console.log(JSON.stringify({ unit: 'ms', results: { 'cold load': coldLoad, 'first window': firstWindow, 'next windows': nextWindows } }));
else console.log(`next windows   ${nextWindows.toFixed(3)} ms (median of 200)`);
