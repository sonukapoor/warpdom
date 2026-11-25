// jsdom 31's registered custom properties: warpdom's own state for them
// (#269 part F2, #345 review). resetWindow drops CSS.registerProperty's
// registrations, and the shadow roots the last file left out of the
// document register nothing until connected again; a shadow root a host
// brings back to a document is tracked once.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWindow } from '../src/node.js';
import { resetWindow, snapshotWindow } from '../src/reset.js';
import { S } from '../src/internal.js';

test('resetWindow drops the registrations CSS.registerProperty made', () => {
  const w = createWindow({ jsdom: '31.0.1' });
  snapshotWindow(w);
  w.CSS.registerProperty({ name: '--a', syntax: '<length>', inherits: false, initialValue: '1px' });
  const read = () => w.getComputedStyle(w.document.body).getPropertyValue('--a');
  assert.equal(read(), '1px');
  resetWindow(w);
  assert.equal(read(), '');
  w.CSS.registerProperty({ name: '--a', syntax: '<length>', inherits: false, initialValue: '2px' });
  assert.equal(read(), '2px');
});

test('a shadow root moved between documents again and again is tracked once in each', () => {
  const w = createWindow({ jsdom: '31.0.1' });
  const d = w.document;
  const other = d.implementation.createHTMLDocument('');
  const host = d.createElement('div');
  host.attachShadow({ mode: 'open' });
  d.body.append(host);
  for (let i = 0; i < 40; i++) {
    other.body.append(host);
    d.body.append(host);
  }
  assert.equal(d[S].shadowRoots31.length, 1);
  assert.equal(other[S].shadowRoots31.length, 1);
});

test('resetWindow drops the shadow roots whose sheets registered: a root the last file left registers nothing', () => {
  const w = createWindow({ jsdom: '31.0.1' });
  snapshotWindow(w);
  const d = w.document;
  const host = d.createElement('div');
  const root = host.attachShadow({ mode: 'open' });
  const sheet = new w.CSSStyleSheet();
  sheet.replaceSync('@property --a { syntax: "<length>"; inherits: false; initial-value: 1px; }');
  root.adoptedStyleSheets = [sheet];
  d.body.append(host);
  const read = () => w.getComputedStyle(d.body).getPropertyValue('--a');
  assert.equal(read(), '1px');
  resetWindow(w);
  assert.equal(read(), '');
  assert.equal(root.adoptedStyleSheets.length, 1);
  // (put back, its host connected, it registers again; out again, its
  // adopted sheets count as any detached root's do)
  d.body.append(host);
  assert.equal(read(), '1px');
  host.remove();
  assert.equal(read(), '1px');
});

test("resetWindow keeps a shadow root still connected registering: the kept body's", () => {
  const w = createWindow({ jsdom: '31.0.1' });
  snapshotWindow(w);
  const d = w.document;
  const root = d.body.attachShadow({ mode: 'open' });
  const sheet = new w.CSSStyleSheet();
  sheet.replaceSync('@property --a { syntax: "<length>"; inherits: false; initial-value: 1px; }');
  root.adoptedStyleSheets = [sheet];
  const style = d.createElement('style');
  style.textContent = '@property --b { syntax: "<length>"; inherits: false; initial-value: 2px; }';
  root.append(style);
  const read = (name) => w.getComputedStyle(d.body).getPropertyValue(name);
  assert.deepEqual([read('--a'), read('--b')], ['1px', '2px']);
  resetWindow(w);
  assert.equal(d.body.shadowRoot, root);
  assert.deepEqual([read('--a'), read('--b')], ['1px', '2px']);
});
