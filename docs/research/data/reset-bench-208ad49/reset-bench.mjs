// Reset micro-benchmark for warpdom's in-place window reset (src/reset.js).
//
// Usage: node reset-bench.mjs <warpdom-dir> [--json results.json]
//    or: WARPDOM_DIR=<warpdom-dir> node reset-bench.mjs
//
// The window is created and installed as warpdom's Vitest environment
// (src/vitest.js setup()) does for the default (non-VM) pools, with
// environmentOptions { warpdom: { jsdom } }: createWindow({ url:
// 'http://localhost:3000', ...jsdomProfile(options), fastFrames: false }),
// installWindow(globalThis, ...) with Vitest's host/always keys, then
// snapshotWindow(window).
// The timed operation is the function the environment registers under
// Symbol.for('warpdom.vitest.reset'), which warpdom/vitest/reset calls before
// each test file: restore.resetOverrides() followed by resetWindow(window).
// resetWindow(window) alone is timed as well. Only the reset is timed; the
// dirtying before each reset is not.
import { pathToFileURL } from 'node:url';
import { resolve, join } from 'node:path';
import { writeFileSync } from 'node:fs';

const dir = resolve(process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : process.env.WARPDOM_DIR ?? '.');
const jsonIndex = process.argv.indexOf('--json');
const jsonPath = jsonIndex > 0 ? process.argv[jsonIndex + 1] : null;
const JSDOM = process.env.BENCH_JSDOM ?? '30.1.2';
const REPS = Number(process.env.BENCH_REPS ?? 200);
const WARMUP = Number(process.env.BENCH_WARMUP ?? 50);

const vitestEnv = await import(pathToFileURL(join(dir, 'src/vitest.js')).href);
const { createWindow } = await import(pathToFileURL(join(dir, 'src/node.js')).href);
const { snapshotWindow, resetWindow } = await import(pathToFileURL(join(dir, 'src/reset.js')).href);
const { installWindow, VITEST_HOST_KEYS, VITEST_ALWAYS_KEYS, jsdomProfile } = vitestEnv;

// As src/vitest.js setup(global, options) does (createTestWindow, then
// installWindow on the global, then snapshotWindow); the environment's
// error/console hooks are left out.
const options = { warpdom: { jsdom: JSDOM } };
const profile = jsdomProfile(options);
const window = createWindow({ url: 'http://localhost:3000', ...profile, fastFrames: false });
const restore = installWindow(globalThis, window, { hostKeys: VITEST_HOST_KEYS, alwaysKeys: VITEST_ALWAYS_KEYS });
snapshotWindow(window);
// The function src/vitest.js registers under Symbol.for('warpdom.vitest.reset').
const envReset = () => { restore.resetOverrides(); resetWindow(window); };

const flush = () => new Promise((r) => setImmediate(r));
const nowNs = () => process.hrtime.bigint();

// --- States -----------------------------------------------------------------

function dirtyNone() { /* untouched window */ }

let counter = 0;
// A typical component-test file's DOM work (~600 elements).
function dirtyTypical() {
  const doc = globalThis.document;
  const rows = [];
  for (let i = 0; i < 60; i++) {
    rows.push(`<li class="item item-${i}" data-id="${i}"><span class="label">Item ${i}</span><button type="button" aria-label="remove ${i}">x</button></li>`);
  }
  const form = [];
  for (let i = 0; i < 20; i++) {
    form.push(`<div class="field"><label for="f${i}">Field ${i}</label><input id="f${i}" name="f${i}" value="v${i}"><small class="hint">hint</small></div>`);
  }
  doc.body.innerHTML = `<div id="app"><header><nav><a href="/a">A</a><a href="/b">B</a></nav></header>`
    + `<main><ul id="list">${rows.join('')}</ul><form id="form">${form.join('')}<select name="s"><option>1</option><option>2</option></select><button type="submit">Save</button></form></main>`
    + `<footer><p>footer <b>bold</b> <i>it</i></p></footer></div>`;
  // appendChild of more elements (a table rendered by a component).
  const table = doc.createElement('table');
  const tbody = doc.createElement('tbody');
  for (let r = 0; r < 40; r++) {
    const tr = doc.createElement('tr');
    for (let c = 0; c < 4; c++) {
      const td = doc.createElement('td');
      td.textContent = `${r},${c}`;
      td.className = 'cell';
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  doc.getElementById('app').appendChild(table);
  // A portal / overlay container appended to body, and one to head.
  const portal = doc.createElement('div');
  portal.id = 'portal';
  portal.setAttribute('role', 'dialog');
  portal.style.position = 'fixed';
  portal.style.zIndex = '1000';
  doc.body.appendChild(portal);
  const style = doc.createElement('style');
  style.textContent = '.item { color: red } .cell { padding: 2px }';
  doc.head.appendChild(style);
  doc.body.setAttribute('class', 'modal-open');
  doc.body.style.overflow = 'hidden';
  doc.documentElement.setAttribute('lang', 'en');
  // Listeners: document, window, elements.
  const noop = () => {};
  doc.addEventListener('click', noop);
  doc.addEventListener('keydown', noop, true);
  doc.addEventListener('focusin', noop);
  globalThis.addEventListener('resize', noop);
  globalThis.addEventListener('scroll', noop, { passive: true });
  globalThis.addEventListener('error', noop);
  doc.body.addEventListener('mousedown', noop);
  for (const button of doc.querySelectorAll('button')) button.addEventListener('click', noop);
  for (const input of doc.querySelectorAll('input')) { input.addEventListener('input', noop); input.addEventListener('blur', noop); }
  doc.onvisibilitychange = noop;
  globalThis.onbeforeunload = noop;
  // Focus.
  doc.getElementById('f3').focus();
  // Mutation observers on the body and the document.
  const mo1 = new globalThis.MutationObserver(noop);
  mo1.observe(doc.body, { childList: true, subtree: true, attributes: true });
  const mo2 = new globalThis.MutationObserver(noop);
  mo2.observe(doc, { childList: true, subtree: true });
  doc.getElementById('list').appendChild(doc.createElement('li')); // pending records
  // Storage and cookies.
  for (let i = 0; i < 10; i++) globalThis.localStorage.setItem(`key${i}`, JSON.stringify({ i, counter }));
  globalThis.sessionStorage.setItem('session', 'x');
  doc.cookie = `token=abc${counter}; path=/`;
  // Window timers (the window's own; the global's are Node's under Vitest)
  // and an animation frame.
  const win = doc.defaultView;
  for (let i = 0; i < 5; i++) win.setTimeout(noop, 60_000);
  win.setInterval(noop, 60_000);
  globalThis.requestAnimationFrame(noop);
  // History and URL.
  globalThis.history.pushState({ page: 2 }, '', '/page/2?q=1#h');
  // Globals a test or library sets on the window and document.
  // (on the window object: a property set on Node's global under Vitest's
  // non-VM pools is not a window property and is not reset by warpdom)
  window.__APP_STATE__ = { counter: counter++ };
  globalThis.matchMedia = () => ({ matches: false, addListener: noop, removeListener: noop });
  globalThis.scrollTo = noop;
  doc.__reactListening = true;
  doc.body.__vue_app__ = {};
  // Selection.
  globalThis.getSelection().selectAllChildren(doc.getElementById('list'));
}

// A large tree: 2,000 table rows of 4 cells (10,001 elements incl. table).
let bigHTML = null;
function dirtyLarge() {
  const doc = globalThis.document;
  if (!bigHTML) {
    const rows = [];
    for (let r = 0; r < 2000; r++) rows.push(`<tr><td>${r}</td><td class="b">b${r}</td><td><span>s</span></td><td></td></tr>`);
    bigHTML = `<table id="big"><tbody>${rows.join('')}</tbody></table>`;
  }
  doc.body.innerHTML = bigHTML;
  const noop = () => {};
  doc.addEventListener('click', noop);
  const mo = new globalThis.MutationObserver(noop);
  mo.observe(doc.body, { childList: true, subtree: true });
  doc.querySelector('td').focus?.();
}

// --- Sanity checks after a reset ---------------------------------------------

function checkFresh() {
  const doc = globalThis.document;
  const problems = [];
  if (doc.body.childNodes.length !== 0) problems.push('body not empty');
  if (doc.head.childNodes.length !== 0) problems.push('head not empty');
  if (doc.body.attributes.length !== 0) problems.push('body has attributes');
  if (doc.activeElement !== doc.body) problems.push('focus not reset');
  if (globalThis.localStorage.length !== 0) problems.push('localStorage not empty');
  if ('__APP_STATE__' in window) problems.push('__APP_STATE__ kept');
  if (globalThis.location.href !== 'http://localhost:3000/') problems.push(`url ${globalThis.location.href}`);
  if (doc.cookie !== '') problems.push('cookie kept');
  return problems;
}

// --- Measurement -------------------------------------------------------------

const quantile = (sorted, q) => {
  const i = (sorted.length - 1) * q;
  const lo = Math.floor(i), hi = Math.ceil(i);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
};

async function measure(name, dirty, resetFn) {
  const times = [];
  const problems = new Set();
  let nodes = 0, elements = 0;
  for (let i = 0; i < WARMUP + REPS; i++) {
    dirty();
    if (i === 0) {
      elements = globalThis.document.getElementsByTagName('*').length;
      const it = globalThis.document.createNodeIterator(globalThis.document);
      while (it.nextNode()) nodes++;
    }
    await flush(); // let observer callbacks and microtasks run, as at the end of a test file
    const t0 = nowNs();
    resetFn();
    const t1 = nowNs();
    if (i >= WARMUP) times.push(Number(t1 - t0) / 1e6);
    for (const p of checkFresh()) problems.add(p);
  }
  const sorted = [...times].sort((a, b) => a - b);
  const r = (x) => Math.round(x * 10000) / 10000;
  return {
    state: name,
    nodesBeforeReset: nodes,
    elementsBeforeReset: elements,
    reps: REPS,
    warmup: WARMUP,
    medianMs: r(quantile(sorted, 0.5)),
    p10Ms: r(quantile(sorted, 0.1)),
    p90Ms: r(quantile(sorted, 0.9)),
    maxMs: r(sorted[sorted.length - 1]),
    minMs: r(sorted[0]),
    meanMs: r(times.reduce((a, b) => a + b, 0) / times.length),
    postResetProblems: [...problems],
  };
}

const results = [];
const states = [
  ['a-untouched', dirtyNone],
  ['b-typical-test-file', dirtyTypical],
  ['c-large-tree-10k', dirtyLarge],
];
for (const [name, dirty] of states) {
  results.push({ ...(await measure(name, dirty, envReset)), timed: 'environment reset (resetOverrides + resetWindow)' });
}
{
  for (const [name, dirty] of states) {
    results.push({ ...(await measure(name, dirty, () => resetWindow(window))), timed: 'resetWindow(window) only' });
  }
}

restore();

const meta = {
  warpdomDir: dir,
  jsdomProfile: JSDOM,
  createWindowOptions: { url: 'http://localhost:3000', ...profile, fastFrames: false },
  node: process.version,
  platform: `${process.platform} ${process.arch}`,
  date: new Date().toISOString(),
};
const lines = [];
lines.push(`warpdom reset micro-benchmark  node ${meta.node}  ${meta.platform}  jsdom profile ${JSDOM}  reps ${REPS} warmup ${WARMUP}`);
lines.push('timed | state | nodes | elements | median ms | p10 ms | p90 ms | max ms | min ms | mean ms | post-reset problems');
for (const r of results) {
  lines.push([r.timed, r.state, r.nodesBeforeReset, r.elementsBeforeReset, r.medianMs, r.p10Ms, r.p90Ms, r.maxMs, r.minMs, r.meanMs, r.postResetProblems.join(';') || 'none'].join(' | '));
}
console.log(lines.join('\n'));
if (jsonPath) writeFileSync(jsonPath, JSON.stringify({ meta, results }, null, 2) + '\n');
// Node's own timers or handles left by the window would keep the process alive.
process.exit(0);
