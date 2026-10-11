// ns per dispatchEvent of a bubbling event through a 10-deep tree with a
// listener at each level (median of 15 samples of 10,000 dispatches).
//
//   node bench/dispatch-bench.mjs [warpdomDir]
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
// The warpdom checkout to measure: argv[2], default this repository.
const dir = path.resolve(process.argv[2] ?? fileURLToPath(new URL('..', import.meta.url)));
const load = (file) => import(pathToFileURL(path.join(dir, 'src', file)).href);
const { createWindow } = await load('node.js');
const w = createWindow(); const d = w.document;
let el = d.body; for (let i = 0; i < 10; i++) { const c = d.createElement('div'); el.append(c); el.addEventListener('x', () => {}); el = c; }
const ev = () => new w.Event('x', { bubbles: true });
const run = () => { for (let i = 0; i < 1000; i++) el.dispatchEvent(ev()); };
for (let i = 0; i < 50; i++) run();
const t = []; for (let r = 0; r < 15; r++) { const s = performance.now(); for (let i = 0; i < 10; i++) run(); t.push((performance.now() - s) / 10 / 1000 * 1e6); }
t.sort((a, b) => a - b); console.log(t[7].toFixed(1));
