// Inline style serialization by jsdom version (black box): border and its
// sides, clip, outline, properties an old cssstyle does not know, values it
// drops; and getComputedStyle with a pseudo-element.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWindow } from '../src/node.js';
import { parity } from './parity.js';

const read = (w, cases) => cases.map(([name, value]) => {
  const s = w.document.createElement('div').style;
  s.setProperty(name, value);
  return `${name}: ${value} -> ${s.getPropertyValue(name)} | ${s.cssText}`;
});

const BORDERS = ['0', '0px', 'none', '0 none', 'none 0', '1px', '1px solid', 'solid 1px', 'solid 1px red', 'red solid 1px', 'medium solid', '0 solid',
  '1px none', 'hidden', 'inherit', '1px solid #ccc', '1px solid currentColor', '2px dashed rgba(0,0,0,.5)', '1px solid var(--c)', '0 none transparent',
  'none transparent', '1.0px solid', '1px solid PINK'];
const CLIPS = ['rect(0 0 0 0)', 'rect(0, 0, 0, 0)', 'rect(1px 2px 3px 4px)', 'rect(1px,2px,3px,4px)', 'rect(auto, 0, 1px, auto)', 'rect(1px, 2px, 3px)', 'auto', 'inherit'];
const COMMON = [['outline', '0'], ['outline', 'none'], ['outline', '1px solid #ccc'], ['aspect-ratio', '1'], ['aspect-ratio', '16 / 9'], ['translate', '10px'],
  ['transform-style', 'preserve-3d'], ['touch-action', 'none'], ['-webkit-appearance', 'none'], ['backdrop-filter', 'blur(4px)'], ['color', 'inherit'],
  ['color', 'currentColor'], ['top', 'auto'], ['right', 'var(--x)'], ['width', 'initial'], ['font', 'inherit'], ['flex', 'unset'], ['border-spacing', '0'],
  ['border-style', 'none'], ['padding-left', 'calc(100% - 1px)'], ['font-size', 'revert'], ['opacity', '0.5']];

for (const jsdom of [20, 22, 25, 26, 30]) {
  parity(`style: border and its sides (jsdom ${jsdom})`, (w) => [...read(w, BORDERS.map((v) => ['border', v])), ...read(w, BORDERS.map((v) => ['border-top', v]))], { jsdom });
  parity(`style: clip (jsdom ${jsdom})`, (w) => read(w, CLIPS.map((v) => ['clip', v])), { jsdom });
  parity(`style: common declarations (jsdom ${jsdom})`, (w) => read(w, COMMON), { jsdom });
  // downshift's status region and the usual visually hidden styles.
  parity(`style: visually hidden (jsdom ${jsdom})`, (w) => {
    const d = w.document.createElement('div');
    Object.assign(d.style, { border: '0', clip: 'rect(0 0 0 0)', height: '1px', margin: '-1px', overflow: 'hidden', padding: '0', position: 'absolute', width: '1px', whiteSpace: 'nowrap' });
    return [d.getAttribute('style'), d.style.border, d.style.clip];
  }, { jsdom });
}

test('getComputedStyle with a pseudo-element reports it as not implemented, in the profile\'s words', () => {
  const messages = [];
  const original = console.error;
  console.error = (m) => messages.push(m);
  try {
    for (const jsdom of [20, 23, 24, 26, 27, 30]) {
      const w = createWindow({ jsdom });
      const p = w.document.body.appendChild(w.document.createElement('p'));
      assert.equal(w.getComputedStyle(p, '::before').display, 'block');
      w.getComputedStyle(p, null);
      w.getComputedStyle(p, '');
      w.getComputedStyle(p);
    }
  } finally {
    console.error = original;
  }
  assert.deepEqual(messages, [
    'Not implemented: window.computedStyle(elt, pseudoElt)', 'Not implemented: window.computedStyle(elt, pseudoElt)',
    'Not implemented: window.getComputedStyle(elt, pseudoElt)', 'Not implemented: window.getComputedStyle(elt, pseudoElt)',
    "Not implemented: Window's getComputedStyle() method: with pseudo-elements", "Not implemented: Window's getComputedStyle() method: with pseudo-elements",
  ]);
});

parity('getComputedStyle with a pseudo-element: the element\'s style, reported (jsdom 30)', (w) => {
  const p = w.document.body.appendChild(w.document.createElement('p'));
  return [w.getComputedStyle(p, '::after').display, w.getComputedStyle(p, ' ').display];
});
