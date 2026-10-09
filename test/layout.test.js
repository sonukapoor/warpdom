import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWindow } from '../src/node.js';

test('getBoundingClientRect and getClientRects return zeros, as in jsdom', () => {
  const w = createWindow();
  const el = w.document.body.appendChild(w.document.createElement('div'));
  const rect = el.getBoundingClientRect();
  assert.deepEqual(rect, { x: 0, y: 0, bottom: 0, height: 0, left: 0, right: 0, top: 0, width: 0 });
  assert.notEqual(el.getBoundingClientRect(), rect, 'a fresh object per call');
  assert.deepEqual(el.getClientRects(), []);
  const svg = w.document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  assert.equal(svg.getBoundingClientRect().width, 0, 'on every element');
  assert.equal(typeof w.Element.prototype.getBoundingClientRect, 'function', 'spyable on the prototype');
});

test('sizes are 0, offsetParent is null, scroll positions store what is set', () => {
  const w = createWindow();
  const el = w.document.body.appendChild(w.document.createElement('div'));
  for (const name of ['clientWidth', 'clientHeight', 'clientTop', 'clientLeft', 'scrollWidth', 'scrollHeight',
    'offsetWidth', 'offsetHeight', 'offsetTop', 'offsetLeft']) {
    assert.equal(el[name], 0, name);
  }
  assert.equal(el.offsetParent, null);
  assert.equal(el.scrollTop, 0);
  el.scrollTop = 50;
  el.scrollLeft = '7';
  assert.equal(el.scrollTop, 50);
  assert.equal(el.scrollLeft, 7);
  assert.ok(Object.getOwnPropertyDescriptor(w.HTMLElement.prototype, 'offsetWidth').get, 'tests redefine these on the prototype');
  assert.ok(Object.getOwnPropertyDescriptor(w.Element.prototype, 'clientWidth').get);
  assert.equal(el.scrollIntoView, undefined, 'jsdom has no scrollIntoView; tests stub it');
});

test('DOMRect and DOMRectReadOnly', () => {
  const w = createWindow();
  const r = new w.DOMRect(1, 2, 3, 4);
  assert.ok(r instanceof w.DOMRectReadOnly);
  assert.deepEqual([r.x, r.y, r.width, r.height, r.top, r.right, r.bottom, r.left], [1, 2, 3, 4, 2, 4, 6, 1]);
  r.width = -5;
  assert.equal(r.left, -4, 'negative sizes');
  assert.deepEqual(r.toJSON(), { x: 1, y: 2, width: -5, height: 4, top: 2, right: 1, bottom: 6, left: -4 });
  const ro = new w.DOMRectReadOnly();
  assert.throws(() => { ro.x = 9; }, TypeError, 'read-only (strict mode)');
  assert.equal(ro.x, 0);
  const from = w.DOMRect.fromRect({ x: 1, width: 5 });
  assert.ok(from instanceof w.DOMRect);
  assert.equal(from.right, 6);
  assert.ok(w.DOMRectReadOnly.fromRect() instanceof w.DOMRectReadOnly);
  assert.throws(() => w.DOMRect(), TypeError);
});
