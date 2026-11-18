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

// Review round (#331).
parity(
  "jsdom 31: a computed style's indexed items, read directly and after its element is removed; element styles beside them",
  (w) => {
    const d = w.document;
    d.body.innerHTML = '<div id="t" style="color: red; --a: 1"></div>';
    const e = d.getElementById('t');
    const cs = w.getComputedStyle(e);
    const out = [cs[0], cs[543], cs[544], cs[545]];
    e.style.marginTop = '1px';
    out.push(e.style[0], e.style[1], e.style[2], e.style[3], e.style.length);
    e.remove();
    out.push(cs[0], cs.length, cs.item(0));
    return out;
  },
  { jsdom: 31 },
);

test('jsdom 31: iterating a computed style reads its items once per step, not all of them again', () => {
  const w = createWindow({ jsdom: '31.0.1' });
  const e = w.document.body.appendChild(w.document.createElement('div'));
  e.style.setProperty('--a', '1');
  const cs = w.getComputedStyle(e);
  const start = performance.now();
  for (let i = 0; i < 20; i++) assert.equal([...cs].length, 545);
  assert.ok(performance.now() - start < 500);
});

// A child assigned to a slot that is not rendered itself (#331 review).
parity(
  'jsdom 31: a host child assigned to a slot in a nested host, rendered or not',
  (w) => {
    const d = w.document;
    const read = (innerShadow) => {
      const outer = d.body.appendChild(d.createElement('div'));
      const inner = outer.attachShadow({ mode: 'open' }).appendChild(d.createElement('section'));
      inner.attachShadow({ mode: 'open' }).innerHTML = innerShadow;
      const slot = inner.appendChild(d.createElement('slot'));
      const child = outer.appendChild(d.createElement('span'));
      return [w.getComputedStyle(child).display, w.getComputedStyle(slot).display];
    };
    return [read('<p></p>'), read('<slot></slot>')];
  },
  { jsdom: 31 },
);
