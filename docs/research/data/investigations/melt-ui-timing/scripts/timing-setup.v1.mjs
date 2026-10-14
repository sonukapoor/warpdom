// Vitest setup file for the melt-ui timing investigation (passed with the harness's
// --first-setup; runs before melt-ui's own setup, with Vitest globals on).
// Acts only during the "Toggles checked to true for default unchecked checkbox items"
// tests (Context Menu and Dropdown Menu (forceVisible)). Uses only the public DOM API
// and the timer globals; nothing of the DOM implementations is modified.
//
// Environment:
//   MELT_LOG=<file>         append one JSON line per event (timestamps in ms from test start)
//   MELT_DELAY_MS=<ms>      busy-wait this long before each dispatch of an ArrowDown
//                           keyboard event (keydown and keyup): slows the steps between
//                           opening the menu and the first Enter, as a slower DOM would
//   MELT_RAF_MS=<ms>        the specs stub requestAnimationFrame as setTimeout(fn, 16);
//                           16 ms timers created during the test get this delay instead
import fs from 'node:fs';

const LOG = process.env.MELT_LOG || '';
const DELAY = Number(process.env.MELT_DELAY_MS || 0);
const RAF = process.env.MELT_RAF_MS ? Number(process.env.MELT_RAF_MS) : null;
const TARGET = /Toggles checked to true for default unchecked checkbox items/;
const clock = () => Number(process.hrtime.bigint()) / 1e6;

let active = false;
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
    // Every 16 ms timer is tracked (one set in the previous test can fire in this one);
    // MELT_RAF_MS applies to all of them, as an edit of the specs' stub would.
    const delay = RAF ?? ms;
    rec(() => ({ ev: 'timer16-set', id, delay, via: label, ...menuState(),
      from: (new Error().stack || '').split('\n').slice(2, 8).map((l) => l.trim().replace(/^at /, '').replace(/\(.*\//, '(').replace(/\?[^:)]*/, '')).join(' < ') }));
    return orig.call(this, function (...a) {
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
  if (DELAY && event.key === 'ArrowDown') busy(DELAY);
  rec({ ev: event.type, key: event.key });
  const r = origDispatch.call(this, event);
  rec(() => ({ ev: event.type + '-done', key: event.key, ...menuState() }));
  return r;
};

beforeEach(() => {
  test = expect.getState().currentTestName || '';
  active = TARGET.test(test);
  if (!active) return;
  events = [];
  t0 = clock();
  rec({ ev: 'start' });
});

afterEach((ctx) => {
  if (!active) return;
  rec(() => ({ ev: 'end', ...menuState() }));
  active = false;
  if (LOG) fs.appendFileSync(LOG, JSON.stringify({ test, delay: DELAY, raf: RAF, events }) + '\n');
});
