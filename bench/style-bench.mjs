// ns per inline style write (style.color and style.width on 1,000 elements;
// repeated values, so the declared-value caches are hit). Median of 15
// samples of 20 passes, after 50 warm-up passes.
//
//   node bench/style-bench.mjs [warpdomDir]
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
// The warpdom checkout to measure: argv[2], default this repository.
const dir = path.resolve(process.argv[2] ?? fileURLToPath(new URL('..', import.meta.url)));
const load = (file) => import(pathToFileURL(path.join(dir, 'src', file)).href);
const { createWindow } = await load('index.js');
const w = createWindow(); const d = w.document;
const els = Array.from({ length: 1000 }, () => d.body.appendChild(d.createElement('div')));
const colors = ['#f00', 'red', 'rgb(1,2,3)', 'blue'];
const run = () => { let k = 0; for (const e of els) { e.style.color = colors[k++ & 3]; e.style.width = (k & 7) + 'px'; } };
for (let i = 0; i < 50; i++) run();
const times = [];
for (let r = 0; r < 15; r++) { const t = performance.now(); for (let i = 0; i < 20; i++) run(); times.push((performance.now() - t) / 20 / 2000 * 1e6); }
times.sort((a, b) => a - b); console.log('style write (ns)', times[7].toFixed(1));
