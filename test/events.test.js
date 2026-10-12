import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWindow } from '../src/index.js';
import { parity } from './parity.js';

function tree() {
  const w = createWindow();
  const outer = w.document.body.appendChild(w.document.createElement('div'));
  const inner = outer.appendChild(w.document.createElement('button'));
  return { w, outer, inner };
}

test('capture, target and bubble phases, from the window down and back up', () => {
  const { w, outer, inner } = tree();
  const log = [];
  const on = (target, name, capture) => target.addEventListener('click', (e) => log.push(`${name}:${capture ? 'capture' : 'bubble'}:${e.eventPhase}`), capture);
  for (const [t, n] of [[w, 'window'], [w.document, 'document'], [outer, 'outer'], [inner, 'inner']]) {
    on(t, n, true);
    on(t, n, false);
  }
  inner.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  assert.deepEqual(log, [
    'window:capture:1', 'document:capture:1', 'outer:capture:1',
    'inner:capture:2', 'inner:bubble:2',
    'outer:bubble:3', 'document:bubble:3', 'window:bubble:3',
  ]);
});

test('non-bubbling events still run capture listeners on ancestors', () => {
  const { w, outer, inner } = tree();
  const log = [];
  outer.addEventListener('focus', () => log.push('capture'), true);
  outer.addEventListener('focus', () => log.push('bubble'));
  inner.dispatchEvent(new w.FocusEvent('focus'));
  assert.deepEqual(log, ['capture']);
});

test('listener options: once, passive, capture identity, signal', () => {
  const { w, inner } = tree();
  let count = 0;
  const fn = () => count++;
  inner.addEventListener('x', fn, { once: true });
  inner.dispatchEvent(new w.Event('x'));
  inner.dispatchEvent(new w.Event('x'));
  assert.equal(count, 1);

  inner.addEventListener('y', fn, true);
  inner.addEventListener('y', fn, false); // different capture: a second listener
  inner.removeEventListener('y', fn); // removes the non-capture one only
  inner.dispatchEvent(new w.Event('y'));
  assert.equal(count, 2);

  const passive = new w.Event('z', { cancelable: true });
  inner.addEventListener('z', (e) => e.preventDefault(), { passive: true });
  inner.dispatchEvent(passive);
  assert.equal(passive.defaultPrevented, false);

  const controller = new AbortController();
  inner.addEventListener('s', fn, { signal: controller.signal });
  controller.abort();
  inner.dispatchEvent(new w.Event('s'));
  assert.equal(count, 2);
});

test('stopPropagation and stopImmediatePropagation', () => {
  const { w, outer, inner } = tree();
  const log = [];
  inner.addEventListener('a', (e) => { log.push(1); e.stopImmediatePropagation(); });
  inner.addEventListener('a', () => log.push(2));
  outer.addEventListener('a', () => log.push(3));
  inner.dispatchEvent(new w.Event('a', { bubbles: true }));
  assert.deepEqual(log, [1]);
  inner.addEventListener('b', (e) => { log.push(4); e.stopPropagation(); });
  inner.addEventListener('b', () => log.push(5));
  outer.addEventListener('b', () => log.push(6));
  inner.dispatchEvent(new w.Event('b', { bubbles: true }));
  assert.deepEqual(log, [1, 4, 5]);
});

test('event state during and after dispatch', () => {
  const { w, outer, inner } = tree();
  const e = new w.Event('t', { bubbles: true, cancelable: true });
  assert.equal(e.isTrusted, false);
  assert.equal(e.eventPhase, 0);
  assert.equal(typeof e.timeStamp, 'number');
  let path;
  outer.addEventListener('t', function (ev) {
    assert.equal(this, outer);
    assert.equal(ev.target, inner);
    assert.equal(ev.currentTarget, outer);
    path = ev.composedPath();
  });
  inner.dispatchEvent(e);
  assert.deepEqual(path, [inner, outer, w.document.body, w.document.documentElement, w.document, w]);
  assert.equal(e.currentTarget, null);
  assert.equal(e.eventPhase, 0);
  assert.equal(e.target, inner);
  assert.deepEqual(e.composedPath(), []);
});

test('listener objects with handleEvent', () => {
  const { w, inner } = tree();
  const listener = { calls: 0, handleEvent(e) { this.calls++; assert.equal(e.type, 'h'); } };
  inner.addEventListener('h', listener);
  inner.dispatchEvent(new w.Event('h'));
  assert.equal(listener.calls, 1);
});

test('an error in a listener is reported on the window and dispatch continues', () => {
  const { w, inner } = tree();
  const reported = [];
  w.addEventListener('error', (e) => { reported.push(e.error.message); e.preventDefault(); });
  let after = false;
  inner.addEventListener('boom', () => { throw new Error('listener failed'); });
  inner.addEventListener('boom', () => { after = true; });
  inner.dispatchEvent(new w.Event('boom'));
  assert.deepEqual(reported, ['listener failed']);
  assert.ok(after);
});

test('event subclasses and their init dictionaries', () => {
  const w = createWindow();
  const target = w.document.createElement('div');
  const mouse = new w.MouseEvent('click', { clientX: 5, clientY: 7, button: 1, buttons: 4, ctrlKey: true, relatedTarget: target, detail: 2 });
  assert.ok(mouse instanceof w.MouseEvent && mouse instanceof w.UIEvent && mouse instanceof w.Event);
  assert.deepEqual([mouse.clientX, mouse.clientY, mouse.button, mouse.buttons, mouse.ctrlKey, mouse.shiftKey, mouse.detail], [5, 7, 1, 4, true, false, 2]);
  assert.equal(mouse.relatedTarget, target);
  assert.ok(mouse.getModifierState('Control'));
  const pointer = new w.PointerEvent('pointerdown', { pointerId: 3, pointerType: 'mouse', isPrimary: true, clientX: 1 });
  assert.ok(pointer instanceof w.MouseEvent);
  assert.deepEqual([pointer.pointerId, pointer.pointerType, pointer.isPrimary, pointer.clientX, pointer.width], [3, 'mouse', true, 1, 1]);
  const key = new w.KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', shiftKey: true, repeat: true });
  assert.deepEqual([key.key, key.code, key.shiftKey, key.repeat, key.location], ['Enter', 'Enter', true, true, 0]);
  assert.equal(new w.FocusEvent('focus', { relatedTarget: target }).relatedTarget, target);
  assert.equal(new w.InputEvent('input', { data: 'a', inputType: 'insertText' }).inputType, 'insertText');
  assert.equal(new w.WheelEvent('wheel', { deltaY: 3 }).deltaY, 3);
  assert.deepEqual(new w.CustomEvent('c', { detail: { a: 1 } }).detail, { a: 1 });
});

test('legacy createEvent and initEvent', () => {
  const w = createWindow();
  const e = w.document.createEvent('Event');
  e.initEvent('legacy', true, true);
  let seen = false;
  w.document.body.addEventListener('legacy', () => { seen = true; });
  w.document.body.appendChild(w.document.createElement('p')).dispatchEvent(e);
  assert.ok(seen);
  assert.ok(w.document.createEvent('MouseEvents') instanceof w.MouseEvent);
  assert.ok(w.document.createEvent('CustomEvent') instanceof w.CustomEvent);
});

test('the window is an EventTarget', () => {
  const w = createWindow();
  assert.ok(w instanceof w.Window && w instanceof w.EventTarget);
  let fired = 0;
  w.addEventListener('resize', () => fired++);
  w.dispatchEvent(new w.Event('resize'));
  assert.equal(fired, 1);
});

test('re-dispatching an event that is being dispatched throws', () => {
  const { w, inner } = tree();
  inner.addEventListener('r', (e) => {
    assert.throws(() => inner.dispatchEvent(e), { name: 'InvalidStateError' });
  });
  inner.dispatchEvent(new w.Event('r'));
});

parity('TouchEvent: touch lists from the init dictionary', (w) => {
  const touch = { identifier: 1, clientX: 5 };
  const e = new w.TouchEvent('touchstart', { changedTouches: [touch], bubbles: true, altKey: true, detail: 2 });
  let error = null;
  try { new w.TouchEvent('touchstart', { changedTouches: 5 }); } catch (err) { error = [err.constructor.name, err.message]; }
  const seen = [];
  w.document.body.addEventListener('touchstart', (event) => seen.push(event.changedTouches[0].clientX));
  w.document.body.dispatchEvent(e);
  return {
    lists: [e.changedTouches.length, e.changedTouches[0] === touch, e.changedTouches === e.changedTouches,
      [...e.changedTouches].length, e.touches.length, e.targetTouches.length],
    fields: [e.altKey, e.ctrlKey, e.detail, e.bubbles, e instanceof w.UIEvent, Object.prototype.toString.call(e)],
    error,
    seen,
  };
});

test('TouchEvent: lists are TouchLists (jsdom uses arrays)', () => {
  const w = createWindow();
  const touch = { identifier: 1 };
  const e = new w.TouchEvent('touchend', { changedTouches: [touch] });
  assert.ok(e.changedTouches instanceof w.TouchList);
  assert.equal(e.changedTouches.item(0), touch);
  assert.equal(e.changedTouches.item(1), null);
  assert.equal(w.document.createEvent('TouchEvent') instanceof w.TouchEvent, true);
});

parity('window.event: the current event while listeners run', (w) => {
  const d = w.document;
  d.body.innerHTML = '<button id=a></button><button id=b></button>';
  const seen = [];
  d.getElementById('a').addEventListener('click', () => {
    seen.push(w.event?.type);
    d.getElementById('b').dispatchEvent(new w.MouseEvent('mousedown'));
    seen.push(w.event?.type);
  });
  d.getElementById('b').addEventListener('mousedown', () => seen.push(w.event?.type));
  const before = w.event;
  d.getElementById('a').click();
  const host = d.body.appendChild(d.createElement('div'));
  const inner = host.attachShadow({ mode: 'open' }).appendChild(d.createElement('span'));
  inner.addEventListener('click', () => seen.push(['shadow', w.event]));
  host.addEventListener('click', () => seen.push(['host', w.event?.type]));
  inner.dispatchEvent(new w.MouseEvent('click', { bubbles: true, composed: true }));
  w.addEventListener('custom', () => seen.push(['window', w.event?.type]));
  w.dispatchEvent(new w.Event('custom'));
  return { before, seen, after: w.event, own: 'event' in w };
});

parity('animation frames: a callback canceled earlier in the same frame does not run', async (w) => {
  const ran = [];
  await new Promise((resolve) => {
    let b = 0;
    w.requestAnimationFrame(() => {
      ran.push('a');
      w.cancelAnimationFrame(b);
      w.requestAnimationFrame(() => resolve());
    });
    b = w.requestAnimationFrame(() => ran.push('b'));
  });
  return ran;
});

parity('MessageEvent and window.postMessage', async (w) => {
  const e = new w.MessageEvent('message', { data: { a: 1 }, origin: 'http://x', lastEventId: '7', source: w, ports: [] });
  const d = new w.MessageEvent('m');
  const out = {
    event: [e.data, e.origin, e.lastEventId, e.source === w, e.ports, e.bubbles, e instanceof w.Event],
    defaults: [d.data, d.origin, d.lastEventId, d.source, d.ports],
    stand_in_source: new w.MessageEvent('m', { source: { postMessage() {} } }).source !== null,
  };
  const log = [];
  const obj = { k: 1 };
  w.addEventListener('message', (ev) => log.push([ev.data, ev.origin, ev.source, ev.constructor.name, ev.data === obj, ev.bubbles]));
  w.postMessage(obj, '*');
  w.postMessage('to own origin', 'http://localhost:3000');
  w.postMessage('dropped', 'http://other.org');
  log.push('sync');
  try { w.postMessage('x'); } catch (err) { log.push([err.constructor.name, err.message]); }
  await new Promise((r) => setTimeout(r, 20));
  out.log = log;
  return out;
});

// Deliberate deviation: jsdom drops a message posted with targetOrigin '/';
// the standard delivers it ('/' means the window's own origin).
test('postMessage: targetOrigin / is the window\'s own origin', async () => {
  const w = createWindow({ url: 'http://localhost:3000/' });
  const got = [];
  w.addEventListener('message', (e) => got.push(e.data));
  w.postMessage('self', '/');
  await new Promise((r) => setTimeout(r, 10));
  assert.deepEqual(got, ['self']);
});

test('report an exception: an error listener that throws is not re-entered', () => {
  const w = createWindow();
  const logged = [];
  const original = console.error;
  console.error = (...args) => logged.push(String(args[0]));
  let calls = 0;
  try {
    w.addEventListener('error', () => { calls++; throw new Error('in handler'); });
    w.document.body.addEventListener('click', () => { throw new Error('first'); });
    w.document.body.click();
  } finally {
    console.error = original;
  }
  assert.equal(calls, 1);
  assert.deepEqual(logged.map((l) => l.split('\n')[0]), ['Error: in handler', 'Error: first']);
});

parity('CompositionEvent', (w) => {
  const e = new w.CompositionEvent('compositionend', { data: 'á', bubbles: true, detail: 1 });
  const d = new w.CompositionEvent('compositionstart');
  const legacy = w.document.createEvent('CompositionEvent');
  return [e.data, e.bubbles, e.detail, e instanceof w.UIEvent, Object.prototype.toString.call(e), d.data, legacy instanceof w.CompositionEvent];
});

// jsdom before 27 had no PointerEvent or pointer handlers; libraries test
// for them (react-aria picks pointer or mouse events).
parity('jsdom 26 profile: no PointerEvent', (w) => {
  const d = w.document;
  return [typeof w.PointerEvent, 'onpointerdown' in d.body, 'onpointerenter' in d, 'onpointermove' in w, 'ongotpointercapture' in d.body,
    typeof w.MouseEvent, 'onmouseenter' in d.body, typeof w.TouchEvent];
}, { jsdom: 26 });

// click() fires a MouseEvent there.
parity('jsdom 26 profile: click() event', (w) => {
  const b = w.document.createElement('button');
  let seen;
  b.addEventListener('click', (e) => { seen = [Object.prototype.toString.call(e), e instanceof w.MouseEvent, e.bubbles, e.cancelable, e.composed, e.detail]; });
  b.click();
  return seen;
}, { jsdom: 26 });

// Events the platform fires are trusted; dispatchEvent() and click() are not.
parity('isTrusted', async (w) => {
  const d = w.document;
  d.body.innerHTML = '<input type="checkbox" id="c"><input id="t"><details id="d"><summary>s</summary></details><form id="f"><input name="a" required></form>';
  const seen = [];
  const on = (target, types) => { for (const type of types) target.addEventListener(type, (e) => seen.push(`${type}:${e.isTrusted}`)); };
  on(d.getElementById('c'), ['click', 'input', 'change']);
  d.getElementById('c').click();
  on(d.getElementById('t'), ['focus', 'focusin', 'blur', 'custom']);
  d.getElementById('t').focus();
  d.getElementById('t').blur();
  d.getElementById('t').dispatchEvent(new w.Event('custom'));
  on(d.getElementById('f').elements.a, ['invalid']);
  d.getElementById('f').checkValidity();
  on(w, ['hashchange', 'popstate']);
  w.location.hash = '#x';
  on(d.getElementById('d'), ['toggle']);
  d.getElementById('d').open = true;
  const c = new w.AbortController();
  on(c.signal, ['abort']);
  c.abort();
  await new Promise((resolve) => setTimeout(resolve, 20));
  return seen.sort();
});

// EventModifierInit's other modifier keys: read by getModifierState on mouse,
// pointer, wheel and keyboard events (not touch events), never exposed as
// attributes. ariakit's shims test relies on modifierCapsLock and
// modifierSuper.
for (const jsdom of [30, 26, 25]) {
  parity(`getModifierState: modifier* init members (jsdom ${jsdom})`, (w) => {
    const keys = ['Control', 'Shift', 'Alt', 'Meta', 'AltGraph', 'CapsLock', 'Fn', 'FnLock', 'Hyper', 'NumLock', 'ScrollLock',
      'Super', 'Symbol', 'SymbolLock', 'Accel', 'OS', 'alt', 'capslock', 'toString'];
    const all = Object.fromEntries(keys.slice(4, 14).map((k) => [`modifier${k}`, true]));
    const out = [];
    for (const name of ['KeyboardEvent', 'MouseEvent', 'WheelEvent', 'PointerEvent', 'TouchEvent']) {
      if (!w[name]) { out.push([name, 'absent']); continue; }
      const on = new w[name]('x', { ...all, altKey: true });
      const one = new w[name]('x', { modifierSuper: 1, modifierCapsLock: 0 });
      const none = new w[name]('x');
      out.push([name, typeof on.getModifierState, keys.filter((k) => on.getModifierState?.(k)), keys.filter((k) => one.getModifierState?.(k)),
        keys.filter((k) => none.getModifierState?.(k)), 'modifierCapsLock' in on]);
    }
    return out;
  }, { jsdom });
}
