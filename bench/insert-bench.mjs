// ns per insertion + removal: appendChild, insertBefore and removeChild of
// elements and text into a connected element, and append/remove() through
// the ChildNode/ParentNode mixins (median of 15 samples of 10 rounds, after
// 50 warm-up rounds; a round inserts and removes 1,000 nodes).
//
//   node bench/insert-bench.mjs [warpdomDir]
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
// The warpdom checkout to measure: argv[2], default this repository.
const dir = path.resolve(process.argv[2] ?? fileURLToPath(new URL('..', import.meta.url)));
const load = (file) => import(pathToFileURL(path.join(dir, 'src', file)).href);
const { createWindow } = await load('index.js');
const w = createWindow();
const d = w.document;
const N = 1000;
const root = d.body.appendChild(d.createElement('div'));
const nodes = [];
for (let i = 0; i < N; i++) nodes.push(i % 4 === 3 ? d.createTextNode('x') : d.createElement('span'));
const run = () => {
  for (let i = 0; i < N; i++) root.appendChild(nodes[i]);
  for (let i = 0; i < N; i++) root.removeChild(nodes[i]);
  for (let i = 0; i < N; i++) root.insertBefore(nodes[i], root.firstChild);
  for (let i = 0; i < N; i++) nodes[i].remove();
  for (let i = 0; i < N; i++) root.append(nodes[i]);
  root.replaceChildren();
};
for (let i = 0; i < 50; i++) run();
const t = [];
for (let r = 0; r < 15; r++) {
  const s = performance.now();
  for (let i = 0; i < 10; i++) run();
  t.push(((performance.now() - s) / 10 / (3 * N)) * 1e6);
}
t.sort((a, b) => a - b);
console.log(t[7].toFixed(1));
