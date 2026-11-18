// jsdom 31's computed style objects (cascade.js names31, rendered31; css.js
// computedLength31), checked against jsdom 31.0.1: empty outside the
// rendered tree, live, its items, and read-only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parity } from './parity.js';
import { createWindow } from '../src/node.js';

const items = (cs) => Array.from({ length: cs.length }, (_, i) => cs.item(i));

parity(
  'jsdom 31: a computed style is empty outside the rendered tree, and live',
  (w) => {
    const d = w.document;
    const out = [];
    const lone = d.createElement('div');
    lone.style.color = 'red';
    const cs = w.getComputedStyle(lone);
    out.push([cs.color, cs.display, cs.length, cs.cssText, cs.item(0)]);
    d.body.append(lone);
    out.push([cs.color, cs.display, cs.length]);
    lone.remove();
    out.push([cs.color, cs.display, cs.length]);
    const other = d.implementation.createHTMLDocument('');
    const inOther = other.body.appendChild(other.createElement('div'));
    out.push([w.getComputedStyle(inOther).display, w.getComputedStyle(inOther).length]);
    const host = d.body.appendChild(d.createElement('div'));
    host.attachShadow({ mode: 'open' }).innerHTML = '<slot name="x"></slot><b></b>';
    const unslotted = host.appendChild(d.createElement('span'));
    const slotted = host.appendChild(d.createElement('i'));
    slotted.slot = 'x';
    out.push(
      [unslotted, slotted, host.shadowRoot.querySelector('b')].map((e) => [
        w.getComputedStyle(e).display,
        w.getComputedStyle(e).length,
      ]),
    );
    d.head.innerHTML = '<style>#t { margin-top: 3px }</style>';
    const t = d.body.appendChild(d.createElement('div'));
    t.id = 't';
    const live = w.getComputedStyle(t);
    out.push(live.marginTop);
    d.styleSheets[0].cssRules[0].style.marginTop = '7px';
    out.push(live.marginTop);
    return out;
  },
  { jsdom: 31 },
);

parity(
  "jsdom 31: a computed style's items: its longhands, then its custom properties",
  (w) => {
    const d = w.document;
    d.head.innerHTML = '<style>:root { --root: 1 } #t { --z: 1; --b: 2 } #t { --a: 3 !important }</style>';
    d.body.innerHTML =
      '<div style="--parent: 1; --zz: 2"><div id="t" style="--c: 1; --B: 2; --a: 9"></div></div><span id="s"></span>';
    const cs = w.getComputedStyle(d.getElementById('t'));
    const plain = w.getComputedStyle(d.getElementById('s'));
    return [cs.length, items(cs), cs[0], cs[551], cs[552], [...plain].length, plain[543], plain.cssText];
  },
  { jsdom: 31 },
);

parity(
  'jsdom 31: every write to a computed style throws',
  (w) => {
    const d = w.document;
    d.body.innerHTML = '<div id="t" style="color: red"></div>';
    const cs = w.getComputedStyle(d.getElementById('t'));
    return [
      () => cs.setProperty('color', 'blue'),
      () => cs.removeProperty('color'),
      () => {
        cs.color = 'blue';
      },
      () => {
        cs.cssText = 'color: blue';
      },
      () => {
        cs.cssFloat = 'left';
      },
      () => {
        cs.margin = '1px';
      },
      () => cs.setProperty('--x', '1'),
      () => cs.setProperty('color', ''),
    ].map((write) => {
      try {
        write();
        return `ok ${cs.color}`;
      } catch (error) {
        return error.name;
      }
    });
  },
  { jsdom: 31 },
);

test('jsdom 30 keeps its computed style writes and items', () => {
  const w = createWindow({ jsdom: '30.1.3' });
  const e = w.document.body.appendChild(w.document.createElement('div'));
  const cs = w.getComputedStyle(e);
  cs.position = 'relative';
  assert.equal(cs.position, 'relative');
  assert.equal(cs.length, 0);
});
