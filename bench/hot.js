// Micro-benchmarks for the hottest DOM operations in real test suites (from
// the dom-api-tracer corpus data), on warpdom, jsdom and happy-dom.
// Prints nanoseconds per operation; lower is better.
//   npm run bench:hot [-- --only warpdom] [-- --json] [-- warpdomDir]
//
// --only <env>: measure one environment (warpdom, jsdom or happy-dom).
// --json: print one JSON object ({ case: { env: ns } }) instead of the
// table; a case that throws is null there (used by bench/ci-compare.mjs).
// warpdomDir: the warpdom checkout to measure (default: this repository);
// jsdom and happy-dom always come from this repository.
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const args = process.argv.slice(2);
const json = args.includes('--json');
const onlyAt = args.indexOf('--only');
const dirArg = args.find((a, i) => !a.startsWith('--') && i !== onlyAt + 1);
const dir = path.resolve(dirArg ?? fileURLToPath(new URL('..', import.meta.url)));

const N = 1000; // children per container

// Each environment: [load its module, create a window from it]. Only the
// measured environments are loaded.
const environments = {
  warpdom: [() => import(pathToFileURL(path.join(dir, 'src', 'index.js')).href), (m) => m.createWindow()],
  jsdom: [() => import('jsdom'), (m) => new m.JSDOM('<!doctype html><html><head></head><body></body></html>').window],
  'happy-dom': [() => import('happy-dom'), (m) => new m.Window()],
};

function container(window) {
  const { document } = window;
  const root = document.body.appendChild(document.createElement('div'));
  for (let i = 0; i < N; i++) {
    const el = root.appendChild(document.createElement('span'));
    el.setAttribute('id', `item-${i}`);
    el.setAttribute('data-index', String(i));
  }
  return root;
}

// Each case returns [operations performed, function]; run repeatedly.
const cases = {
  'appendChild (build 1000)': (w) => {
    const { document } = w;
    return [N, () => { const r = document.createElement('div'); for (let i = 0; i < N; i++) r.appendChild(document.createElement('span')); }];
  },
  'insertBefore first (1000)': (w) => {
    const { document } = w;
    return [N, () => { const r = document.createElement('div'); for (let i = 0; i < N; i++) r.insertBefore(document.createElement('span'), r.firstChild); }];
  },
  'removeChild all (1000)': (w) => {
    const { document } = w;
    return [N, () => {
      const r = document.createElement('div');
      for (let i = 0; i < N; i++) r.appendChild(document.createElement('span'));
      while (r.firstChild) r.removeChild(r.firstChild);
    }];
  },
  'nextSibling walk': (w) => {
    const root = container(w);
    return [N, () => { let n = 0; for (let c = root.firstChild; c; c = c.nextSibling) n += c.nodeType; return n; }];
  },
  'previousSibling walk': (w) => {
    const root = container(w);
    return [N, () => { let n = 0; for (let c = root.lastChild; c; c = c.previousSibling) n += c.nodeType; return n; }];
  },
  'parentNode chain (depth 20)': (w) => {
    let node = w.document.body;
    for (let i = 0; i < 20; i++) node = node.appendChild(w.document.createElement('div'));
    return [20, () => { let n = 0; for (let c = node; c; c = c.parentNode) n++; return n; }];
  },
  'childNodes[i] loop': (w) => {
    const root = container(w);
    return [N, () => { const kids = root.childNodes; let n = 0; for (let i = 0; i < kids.length; i++) n += kids[i].nodeType; return n; }];
  },
  'firstElementChild + nextElementSibling': (w) => {
    const root = container(w);
    return [N, () => { let n = 0; for (let c = root.firstElementChild; c; c = c.nextElementSibling) n++; return n; }];
  },
  'getAttribute': (w) => {
    const root = container(w);
    const el = root.firstChild;
    return [N, () => { let n = 0; for (let i = 0; i < N; i++) n += el.getAttribute('data-index').length; return n; }];
  },
  'setAttribute': (w) => {
    const el = w.document.createElement('div');
    return [N, () => { for (let i = 0; i < N; i++) el.setAttribute('data-x', 'v'); }];
  },
  'getElementById (1000 elements)': (w) => {
    container(w);
    const { document } = w;
    return [N, () => { let n = 0; for (let i = 0; i < N; i++) n += document.getElementById(`item-${i}`) ? 1 : 0; return n; }];
  },
  'dispatchEvent (depth 20, document listener)': (w) => {
    let node = w.document.body;
    for (let i = 0; i < 20; i++) node = node.appendChild(w.document.createElement('div'));
    let n = 0;
    w.document.addEventListener('click', () => { n++; });
    return [1, () => { node.dispatchEvent(new w.MouseEvent('click', { bubbles: true })); return n; }];
  },
  // Selector cases: one query over the 1000-element container per op.
  'querySelector #id': (w) => {
    container(w);
    const { document } = w;
    return [1, () => document.querySelector('#item-500')];
  },
  'querySelectorAll [data-index="999"]': (w) => {
    const root = container(w);
    return [1, () => root.querySelectorAll('[data-index="999"]').length];
  },
  'querySelectorAll * (Testing Library)': (w) => {
    const root = container(w);
    return [1, () => root.querySelectorAll('*').length];
  },
  'querySelectorAll after a change (uncached)': (w) => {
    const root = container(w);
    const el = root.firstChild;
    let i = 0;
    return [1, () => { el.setAttribute('data-n', String(i++)); return root.querySelectorAll('[data-index="999"]').length; }];
  },
  'matches("div > span:nth-child(odd)")': (w) => {
    const el = container(w).lastChild;
    return [N, () => { let n = 0; for (let i = 0; i < N; i++) n += el.matches('div > span:nth-child(odd)') ? 1 : 0; return n; }];
  },
  'closest("[data-index]")': (w) => {
    const root = container(w);
    let el = root.firstChild;
    for (let i = 0; i < 10; i++) el = el.appendChild(w.document.createElement('b'));
    return [N, () => { let n = 0; for (let i = 0; i < N; i++) n += el.closest('[data-index]') ? 1 : 0; return n; }];
  },
};

function measure(env, name) {
  const w = windowOf[env]();
  const [ops, fn] = cases[name](w);
  for (let i = 0; i < 20; i++) fn(); // warm up
  const runs = [];
  for (let r = 0; r < 15; r++) {
    const t = performance.now();
    let reps = 0;
    while (performance.now() - t < 20) { fn(); reps++; }
    runs.push(((performance.now() - t) * 1e6) / (reps * ops));
  }
  runs.sort((a, b) => a - b);
  return runs[runs.length >> 1];
}

const only = onlyAt !== -1 ? [args[onlyAt + 1]] : Object.keys(environments);
const envs = Object.keys(environments).filter((e) => only.includes(e));
const windowOf = {};
for (const e of envs) {
  const [load, create] = environments[e];
  const m = await load();
  windowOf[e] = () => create(m);
}
if (json) {
  const results = {};
  for (const name of Object.keys(cases)) {
    results[name] = {};
    for (const e of envs) {
      try { results[name][e] = measure(e, name); } catch { results[name][e] = null; }
    }
  }
  console.log(JSON.stringify({ unit: 'ns', results }));
} else {
  console.log(['ns per op'.padEnd(40), ...envs.map((e) => e.padStart(11))].join(''));
  for (const name of Object.keys(cases)) {
    console.log([name.padEnd(40), ...envs.map((e) => measure(e, name).toFixed(1).padStart(11))].join(''));
  }
}
