// ns per inline style write: repeated values (cache hits) and unique values
// (each a cache miss: CSS value validation and serialization run).
// Median of 15 samples of 5 passes over 1,000 elements x 4 writes.
//
//   node bench/style-miss-bench.mjs [warpdomDir]
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
// The warpdom checkout to measure: argv[2], default this repository.
const dir = path.resolve(process.argv[2] ?? fileURLToPath(new URL('..', import.meta.url)));
const load = (file) => import(pathToFileURL(path.join(dir, 'src', file)).href);
const { createWindow } = await load('node.js');
const w = createWindow();
const d = w.document;
const els = Array.from({ length: 1000 }, () => d.body.appendChild(d.createElement('div')));
let n = 0;
const repeated = () => {
  for (const el of els) {
    el.style.width = '10px';
    el.style.transform = 'translateX(4px)';
    el.style.color = 'red';
    el.style.width = '20px';
  }
};
const unique = () => {
  for (const el of els) {
    n++;
    el.style.top = `${n * 0.37}px`;
    el.style.transform = `translate(${n}px, ${n % 97}px) rotate(${n % 360}deg)`;
    el.style.opacity = String((n % 100) / 100);
    el.style.width = `calc(100% - ${n % 500}px)`;
  }
};
const time = (fn) => {
  for (let i = 0; i < 20; i++) fn();
  const t = [];
  for (let r = 0; r < 15; r++) {
    const s = performance.now();
    for (let i = 0; i < 5; i++) fn();
    t.push(((performance.now() - s) / 5 / 4000) * 1e6);
  }
  t.sort((a, b) => a - b);
  return t[7].toFixed(1);
};
console.log(`repeated ${time(repeated)} unique ${time(unique)}`);
