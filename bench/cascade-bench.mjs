// getComputedStyle with style sheets, warpdom vs jsdom: 300 <style>
// elements, 500 elements; ms per pass reading display and visibility of
// every element, and per pass after changing one element's class (cache
// invalidation). jsdom is resolved from this repository's devDependencies.
//
//   node bench/cascade-bench.mjs [warpdomDir]
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
// The warpdom checkout to measure: argv[2], default this repository.
const dir = path.resolve(process.argv[2] ?? fileURLToPath(new URL('..', import.meta.url)));
const load = (file) => import(pathToFileURL(path.join(dir, 'src', file)).href);
const { JSDOM } = createRequire(import.meta.url)('jsdom');
const { createWindow } = await load('index.js');
function setup(w) {
  const d = w.document;
  for (let i = 0; i < 300; i++) {
    const s = d.createElement('style');
    s.appendChild(d.createTextNode(`.c${i}{display:flex;padding:${i}px;color:#123456;margin:0 auto}`));
    d.head.appendChild(s);
  }
  const els = [];
  let parent = d.body;
  for (let i = 0; i < 500; i++) {
    const e = d.createElement('div');
    e.className = `c${i % 300} x`;
    (i % 10 ? parent : d.body).appendChild(e);
    if (i % 10 === 0) parent = e;
    els.push(e);
  }
  return els;
}
function run(name, w) {
  const els = setup(w);
  const read = () => {
    let n = 0;
    for (const e of els) {
      const cs = w.getComputedStyle(e);
      if (cs.display !== 'none' && cs.visibility !== 'hidden') n++;
    }
    return n;
  };
  read();
  let t = performance.now();
  for (let k = 0; k < 20; k++) read();
  const reads = (performance.now() - t) / 20;
  // after each mutation
  t = performance.now();
  for (let k = 0; k < 20; k++) {
    els[k].className = `c${k} y`;
    read();
  }
  const mutate = (performance.now() - t) / 20;
  console.log(name.padEnd(8), 'read pass', reads.toFixed(2), 'ms; mutate+read pass', mutate.toFixed(2), 'ms');
}
run('warpdom', createWindow());
run('jsdom', new JSDOM('<!doctype html><html><head></head><body></body></html>', { pretendToBeVisual: true }).window);
