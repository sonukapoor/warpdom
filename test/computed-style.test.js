import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWindow } from '../src/index.js';

test('getComputedStyle returns a read-only declaration with inline values', () => {
  const w = createWindow();
  const el = w.document.body.appendChild(w.document.createElement('div'));
  el.style.width = '10px';
  const cs = w.getComputedStyle(el);
  assert.ok(cs instanceof w.CSSStyleDeclaration);
  assert.equal(cs.width, '10px');
  assert.equal(cs.getPropertyValue('width'), '10px');
  el.style.width = '20px';
  assert.equal(cs.width, '20px', 'live');
  assert.throws(() => cs.setProperty('color', 'red'), { name: 'NoModificationAllowedError' });
});

test('default display follows the HTML rendering rules', () => {
  const w = createWindow();
  const d = (tag) => w.getComputedStyle(w.document.body.appendChild(w.document.createElement(tag))).display;
  assert.equal(d('div'), 'block');
  assert.equal(d('span'), 'inline');
  assert.equal(d('li'), 'list-item');
  assert.equal(d('table'), 'table');
  assert.equal(d('td'), 'table-cell');
  assert.equal(d('button'), 'inline-block');
  assert.equal(d('script'), 'none');
  const hidden = w.document.body.appendChild(w.document.createElement('div'));
  hidden.hidden = true;
  assert.equal(w.getComputedStyle(hidden).display, 'none');
  hidden.style.display = 'flex';
  assert.equal(w.getComputedStyle(hidden).display, 'flex', 'inline style wins over the default');
});

test('inherited properties come from the nearest ancestor that sets them', () => {
  const w = createWindow();
  const outer = w.document.body.appendChild(w.document.createElement('div'));
  const inner = outer.appendChild(w.document.createElement('span'));
  outer.style.visibility = 'hidden';
  outer.style.color = 'red';
  outer.style.width = '5px';
  const cs = w.getComputedStyle(inner);
  assert.equal(cs.visibility, 'hidden');
  assert.equal(cs.color, 'red');
  assert.equal(cs.width, '', 'width is not inherited');
  assert.equal(w.getComputedStyle(w.document.body).visibility, 'visible');
  assert.equal(w.getComputedStyle(w.document.body).pointerEvents, 'auto');
});
