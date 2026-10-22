// ns per createElement + appendChild + createTextNode + new Event, over a
// 1,000-node build (median of 15 samples of 10 builds, after 50 warm-up builds).
//
//   node bench/create-bench.mjs [warpdomDir]
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
// The warpdom checkout to measure: argv[2], default this repository.
const dir = path.resolve(process.argv[2] ?? fileURLToPath(new URL('..', import.meta.url)));
const load = (file) => import(pathToFileURL(path.join(dir, 'src', file)).href);
const { createWindow } = await load('index.js');
const w = createWindow();
const d = w.document;
const run = () => {
  const root = d.createElement('div');
  for (let i = 0; i < 1000; i++) {
    const e = d.createElement('span');
    e.appendChild(d.createTextNode('x'));
    root.appendChild(e);
    new w.Event('x');
  }
};
for (let i = 0; i < 50; i++) run();
const t = [];
for (let r = 0; r < 15; r++) {
  const s = performance.now();
  for (let i = 0; i < 10; i++) run();
  t.push(((performance.now() - s) / 10 / 1000) * 1e6);
}
t.sort((a, b) => a - b);
console.log(t[7].toFixed(1));
