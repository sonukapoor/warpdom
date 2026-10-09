// Reflection and element interfaces, from the HTML standard's IDL.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWindow } from '../src/node.js';

test('element interfaces follow the current standard', () => {
  const { document: d, ...w } = createWindow();
  const iface = (tag) => Object.getPrototypeOf(d.createElement(tag)).constructor.name;
  assert.equal(iface('search'), 'HTMLElement');
  assert.equal(iface('menuitem'), 'HTMLElement');
  assert.equal(iface('selectedcontent'), 'HTMLSelectedContentElement');
  assert.equal(iface('marquee'), 'HTMLMarqueeElement');
  assert.equal(iface('blink'), 'HTMLUnknownElement');
  assert.equal(iface('x-foo'), 'HTMLElement');
});

test('reflection kinds', () => {
  const { document: d } = createWindow();
  const a = d.createElement('a');
  a.rel = 'noopener noreferrer';
  assert.deepEqual([...a.relList], ['noopener', 'noreferrer']);
  assert.equal(a.relList, a.relList);
  const td = d.createElement('td');
  td.setAttribute('colspan', '5000');
  assert.equal(td.colSpan, 1000, 'clamped to the range');
  td.setAttribute('colspan', '0');
  assert.equal(td.colSpan, 1);
  td.colSpan = 0;
  assert.equal(td.getAttribute('colspan'), '0', 'clamping does not apply to the setter');
  td.colSpan = -1;
  assert.equal(td.getAttribute('colspan'), '1', 'out of range: the default');
  const div = d.createElement('div');
  div.inert = true;
  assert.equal(div.getAttribute('inert'), '');
  const img = d.createElement('img');
  assert.equal(img.crossOrigin, null);
  img.setAttribute('crossorigin', '');
  assert.equal(img.crossOrigin, 'anonymous');
  img.setAttribute('crossorigin', 'USE-CREDENTIALS');
  assert.equal(img.crossOrigin, 'use-credentials');
  img.crossOrigin = null;
  assert.equal(img.hasAttribute('crossorigin'), false);
  const video = d.createElement('video');
  assert.equal(video.preload, 'metadata');
  const track = d.createElement('track');
  track.setAttribute('kind', 'bogus');
  assert.equal(track.kind, 'metadata');
  const input = d.createElement('input');
  assert.equal(input.size, 20);
  assert.throws(() => { input.size = 0; }, { name: 'IndexSizeError' });
  assert.throws(() => { input.maxLength = -1; }, { name: 'IndexSizeError' });
  const progress = d.createElement('progress');
  assert.equal(progress.max, 1);
  progress.setAttribute('max', '-3');
  assert.equal(progress.max, 1, 'double limited to only positive numbers');
});
