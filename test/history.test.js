// Session history traversal: history.back(), forward() and go() between the
// entries of one document (pushState, replaceState, fragment navigations),
// against jsdom as a black box.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWindow } from '../src/node.js';
import { parity } from './parity.js';

const tick = async () => {
  for (let i = 0; i < 5; i++) {
    await new Promise((resolve) => setTimeout(resolve, 2));
    await new Promise((resolve) => setImmediate(resolve));
  }
};

// Fragment navigations leave history.state undefined on jsdom and null on
// warpdom (a deliberate deviation): states are logged with ?? null.
function logger(w) {
  const log = [];
  w.addEventListener('popstate', (e) => log.push(['popstate', e.state ?? null, w.location.href, w.history.state ?? null, w.history.length,
    e.constructor.name, e.bubbles, e.cancelable, e.isTrusted]));
  w.addEventListener('hashchange', (e) => log.push(['hashchange', e.oldURL, e.newURL, w.location.href]));
  return log;
}

for (const jsdom of [30, 26, 25]) {
  parity(`history: back, forward and go between pushState entries (jsdom ${jsdom})`, async (w) => {
    const log = logger(w);
    w.history.pushState({ n: 1 }, '', '/b');
    w.history.pushState({ n: 2 }, '', '/c');
    w.location.hash = 'x';
    await tick();
    log.push(['before', w.history.length, w.location.href]);
    w.history.back();
    log.push(['sync after back', w.location.href, w.history.state ?? null]);
    Promise.resolve().then(() => log.push(['microtask']));
    await tick();
    w.history.back();
    w.history.back(); // the same target: one move
    await tick();
    w.history.forward();
    await tick();
    w.history.go(2); // out of range
    w.history.go(-3); // out of range
    await tick();
    w.history.go(-2);
    w.history.forward(); // relative to the index when called
    await tick();
    log.push(['end', w.location.href, w.history.state ?? null, w.history.length]);
    return log;
  }, { jsdom });

  parity(`history: pushState and fragment navigations cancel a pending traversal, replaceState does not (jsdom ${jsdom})`, async (w) => {
    const log = logger(w);
    const push = () => ['/b', '/c', '/d'].forEach((p, i) => w.history.pushState({ n: i + 1 }, '', p));
    push();
    w.history.back();
    w.history.go(-2); // both run: /c, then /b
    await tick();
    log.push(['A', w.location.href]);
    w.history.back();
    w.history.pushState({ n: 9 }, '', '/z');
    await tick();
    log.push(['B', w.location.href, w.history.length]);
    w.history.back();
    w.history.replaceState({ r: 1 }, '', '/r');
    await tick();
    log.push(['C', w.location.href, w.history.state, w.history.length]);
    w.history.back();
    w.location.hash = 'h';
    await tick();
    log.push(['D', w.location.href, w.history.length]);
    w.history.back();
    w.location.replace('#r');
    await tick();
    log.push(['E', w.location.href, w.history.length]);
    return log;
  }, { jsdom });

  parity(`history: traversal across fragments fires hashchange; same state object (jsdom ${jsdom})`, async (w) => {
    const log = logger(w);
    const state = { s: 1 };
    w.history.pushState(state, '', '#frag');
    w.history.pushState({ s: 2 }, '', '/other');
    w.history.back();
    await tick();
    log.push(['same object', w.history.state === state]);
    w.history.back();
    await tick();
    w.location.hash = 'one';
    await tick();
    w.location.hash = 'two';
    await tick();
    w.history.back();
    await tick();
    w.history.forward();
    await tick();
    // A traversal from a popstate listener.
    let first = true;
    w.addEventListener('popstate', () => { if (first) { first = false; w.history.go(-1); } });
    w.history.back();
    await tick();
    log.push(['end', w.location.href]);
    return log;
  }, { jsdom });

  parity(`history: pushState and replaceState keep the object given (jsdom ${jsdom})`, (w) => {
    const state = { f() {}, node: w.document.body };
    w.history.pushState(state, '', '/x');
    const pushed = w.history.state === state;
    w.history.replaceState(undefined, '');
    return [pushed, w.history.state, w.history.length];
  }, { jsdom });

  // jsdom 25 and 26 print the error's stack: compared on jsdom 30 only.
  if (jsdom === 30) {
    parity(`history: go(0) and go() report a reload as not implemented (jsdom ${jsdom})`, async (w) => {
      const log = logger(w);
      w.history.go(0);
      w.history.go();
      w.history.go('x');
      await tick();
      log.push(['end', w.location.href, w.history.length]);
      return log;
    }, { jsdom });
  }
}

test('history: a traversal uses the timers of the global the window is installed on', async () => {
  const w = createWindow({ url: 'http://localhost/a' });
  const queued = [];
  // A stand-in for a test environment's global with fake timers.
  const fakeGlobal = { setTimeout: (fn, ms) => queued.push([fn, ms]) };
  Object.defineProperty(w.document, 'defaultView', { value: fakeGlobal, configurable: true });
  const log = logger(w);
  w.history.pushState({ n: 1 }, '', '/b');
  w.history.back();
  await tick();
  assert.equal(w.location.pathname, '/b');
  assert.deepEqual(queued.map(([, ms]) => ms), [1]);
  queued.shift()[0]();
  assert.equal(w.location.pathname, '/a');
  assert.equal(log[0][0], 'popstate');
  w.location.hash = 'h';
  assert.deepEqual(queued.map(([, ms]) => ms), [0]);
});

test('history: go(0) reports a reload with the profile\'s message', () => {
  const messages = [];
  const original = console.error;
  console.error = (m) => messages.push(m);
  try {
    for (const jsdom of [20, 26, 27, 30]) createWindow({ jsdom }).history.go(0);
  } finally {
    console.error = original;
  }
  assert.deepEqual(messages, [
    'Not implemented: navigation (except hash changes)', 'Not implemented: navigation (except hash changes)',
    'Not implemented: navigation to another Document', 'Not implemented: navigation to another Document',
  ]);
});

parity('window.location = url navigates ([PutForwards=href])', async (w) => {
  (function () { 'use strict'; w.location = '#put'; }());
  await tick();
  return [w.location.href, w.history.length];
});

test('animation frames are scheduled on the timers of the global the window is installed on', () => {
  const w = createWindow();
  const queued = [];
  Object.defineProperty(w.document, 'defaultView', { value: { setTimeout: (fn, ms) => queued.push([fn, ms]) }, configurable: true });
  let ran = 0;
  w.requestAnimationFrame(() => ran++);
  w.requestAnimationFrame(() => ran++);
  assert.equal(queued.length, 1);
  assert.ok(Math.abs(queued[0][1] - 1000 / 60) < 0.01);
  queued[0][0]();
  assert.equal(ran, 2);
});
