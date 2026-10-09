import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWindow } from '../src/index.js';

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
