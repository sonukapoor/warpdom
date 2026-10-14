// Vitest setup file for the melt-ui timing investigation (passed with the harness's
// --first-setup; runs before melt-ui's own setup, with Vitest globals on).
// Acts during the "Toggles checked to true for default unchecked checkbox items"
// tests (Context Menu and Dropdown Menu (forceVisible)). Uses only the public DOM API
// and the timer globals; nothing of the DOM implementations is modified.
//
// Environment:
//   MELT_LOG=<file>         append one JSON line per test (events with timestamps in ms
//                           from the test's start)
//   MELT_DELAY_MS=<ms>      busy-wait this long before each dispatch of an ArrowDown
//                           keyboard event (keydown and keyup) in the target tests: slows
//                           the steps between opening the menu and the toggling Enter, as
//                           a slower DOM would
//   MELT_RAF_MS=<ms>        the specs stub requestAnimationFrame as setTimeout(fn, 16);
//                           every 16 ms timer gets this delay instead (as an edit of the
//                           stub would)
//   MELT_LOG_ALL=1          (version 2) log every test of the Context Menu and Dropdown
//                           Menu (forceVisible) blocks, not only the target tests, and at
//                           the start of each logged test the 16 ms timers still pending
//                           with their origin, to follow Svelte's transition loop across
//                           tests. Without it this file behaves as version 1
//                           (timing-setup.v1.mjs), used for the delay, delay-fine and raf
//                           experiments.
import fs from 'node:fs';

const LOG = process.env.MELT_LOG || '';
const DELAY = Number(process.env.MELT_DELAY_MS || 0);
const RAF = process.env.MELT_RAF_MS ? Number(process.env.MELT_RAF_MS) : null;
const LOG_ALL = !!process.env.MELT_LOG_ALL;
const TARGET = /Toggles checked to true for default unchecked checkbox items/;
const LOGGED = /Context Menu|\(forceVisible\)/;
const clock = () => Number(process.hrtime.bigint()) / 1e6;

let active = false;
let target = false;
let t0 = 0;
let test = '';
let events = [];
// e may be a function, so that nothing is computed when not logging
const rec = (e) => { if (active && LOG) { const t = +(clock() - t0).toFixed(3); events.push({ t, ...(typeof e === 'function' ? e() : e) }); } };

function busy(ms) { const end = clock() + ms; while (clock() < end); }

function menuState() {
  try { return { menu: !!document.querySelector('[data-testid="menu"]'), check2: !!document.querySelector('[data-testid="check2"]') }; }
  catch { return {}; }
}

const stackFrom = (skip) => (new Error().stack || '').split('\n').slice(skip, skip + 6)
  .map((l) => l.trim().replace(/^at /, '').replace(/\(.*\//, '(').replace(/\?[^:)]*/, '')).join(' < ');

// 16 ms timers not yet fired (MELT_LOG_ALL): id -> { at (clock), from }
const pendingTimers = new Map();

// Timers: the specs' requestAnimationFrame stub calls window.setTimeout(fn, 16).
let timerId = 0;
function wrapTimers(owner, label) {
  if (!owner || typeof owner.setTimeout !== 'function' || owner.setTimeout.__meltTiming) return;
  const orig = owner.setTimeout;
  const wrapped = function (fn, ms, ...args) {
    if (typeof fn !== 'function') return orig.call(this, fn, ms, ...args);
    if (ms !== 16) {
      if (!active) return orig.call(this, fn, ms, ...args);
      // user-event waits setTimeout(0) after each key; the test continues in the last one
      if (!ms) return orig.call(this, function (...a) { rec({ ev: 'timer0-fire' }); return fn.apply(this, a); }, ms, ...args);
      return orig.call(this, fn, ms, ...args);
    }
    const id = ++timerId;
    const delay = RAF ?? ms;
    const from = LOG_ALL && LOG ? stackFrom(2) : undefined;
    if (from) pendingTimers.set(id, { at: clock(), from });
    rec(() => ({ ev: 'timer16-set', id, delay, via: label, ...menuState(), from: from ?? stackFrom(2) }));
    return orig.call(this, function (...a) {
      pendingTimers.delete(id);
      rec(() => ({ ev: 'timer16-fire', id, ...menuState() }));
      const r = fn.apply(this, a);
      rec(() => ({ ev: 'timer16-done', id, ...menuState() }));
      return r;
    }, delay, ...args);
  };
  wrapped.__meltTiming = true;
  owner.setTimeout = wrapped;
}
wrapTimers(globalThis, 'global');
if (globalThis.window && globalThis.window !== globalThis) wrapTimers(globalThis.window, 'window');

// Keyboard and pointer events (the open() steps and the key presses).
const ET = globalThis.EventTarget && globalThis.EventTarget.prototype;
const origDispatch = ET.dispatchEvent;
ET.dispatchEvent = function (event) {
  if (!active || !event || !/^(key|contextmenu|pointerdown|mousedown|click)/.test(event.type)) return origDispatch.call(this, event);
  if (DELAY && target && event.key === 'ArrowDown') busy(DELAY);
  rec({ ev: event.type, key: event.key });
  const r = origDispatch.call(this, event);
  rec(() => ({ ev: event.type + '-done', key: event.key, ...menuState() }));
  return r;
};

beforeEach(() => {
  test = expect.getState().currentTestName || '';
  target = TARGET.test(test);
  active = target || (LOG_ALL && LOGGED.test(test));
  if (!active) return;
  events = [];
  t0 = clock();
  rec({ ev: 'start' });
  for (const [id, p] of pendingTimers) rec({ ev: 'timer16-pending', id, setAt: +(p.at - t0).toFixed(3), from: p.from });
});

afterEach(() => {
  if (!active) return;
  rec(() => ({ ev: 'end', ...menuState() }));
  active = false;
  target = false;
  if (LOG) fs.appendFileSync(LOG, JSON.stringify({ test, delay: DELAY, raf: RAF, events }) + '\n');
});
