// µs per createWindow (median of 15 samples of 50, after 100 warm-up windows).
// Cold module load and the first window: bench/load.js.
//
//   node bench/window-bench.mjs [warpdomDir]
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
// The warpdom checkout to measure: argv[2], default this repository.
const dir = path.resolve(process.argv[2] ?? fileURLToPath(new URL('..', import.meta.url)));
const load = (file) => import(pathToFileURL(path.join(dir, 'src', file)).href);
const { createWindow } = await load('node.js');
for (let i = 0; i < 100; i++) createWindow();
const t = []; for (let r = 0; r < 15; r++) { const s = performance.now(); for (let i = 0; i < 50; i++) createWindow(); t.push((performance.now() - s) / 50 * 1000); }
t.sort((a, b) => a - b); console.log(t[7].toFixed(1));
