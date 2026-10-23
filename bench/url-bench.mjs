// ns per a.href read: each link is re-appended (a tree change, so the base
// URL lookup misses its cache) and its href read twice (the second read is
// cached). Median of 15 samples.
//
//   node bench/url-bench.mjs [warpdomDir]
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
// The warpdom checkout to measure: argv[2], default this repository.
const dir = path.resolve(process.argv[2] ?? fileURLToPath(new URL('..', import.meta.url)));
const load = (file) => import(pathToFileURL(path.join(dir, 'src', file)).href);
const { createWindow } = await load('node.js');
const w = createWindow({ url: 'http://localhost:3000/app/' });
const d = w.document;
const links = [];
for (let i = 0; i < 200; i++) {
  const a = d.createElement('a');
  a.setAttribute('href', 'p' + i);
  d.body.append(a);
  links.push(a);
}
let sink = 0;
const run = () => {
  for (const a of links) {
    d.body.append(a);
    sink += a.href.length;
    sink += a.href.length;
  }
};
for (let i = 0; i < 200; i++) run();
const t = [];
for (let r = 0; r < 15; r++) {
  const s = performance.now();
  for (let i = 0; i < 50; i++) run();
  t.push(((performance.now() - s) / 50 / 400) * 1e6);
}
t.sort((a, b) => a - b);
console.log(t[7].toFixed(1));
