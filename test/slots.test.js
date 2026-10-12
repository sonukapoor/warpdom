import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWindow } from '../src/node.js';
import { parity } from './parity.js';

const names = (list) => list.map((n) => n.nodeName + (n.nodeType === 3 ? `:${n.data}` : ''));

parity('slots: assignment, flattening and assignedSlot', async (w) => {
  const d = w.document;
  const host = d.body.appendChild(d.createElement('div'));
  host.innerHTML = '<span slot="a">A</span>text<b>B</b><i slot="zz">Z</i>';
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = '<slot name="a"></slot><slot id=def>fallback<em>f</em></slot><slot name="a" id=dup></slot>';
  const [sa, sdef, sdup] = root.querySelectorAll('slot');
  const log = [];
  for (const s of [sa, sdef, sdup]) s.addEventListener('slotchange', (e) => log.push(['slotchange', s.id || s.name, e.bubbles, e.composed, names(s.assignedNodes())]));
  const out = {
    assigned: [names(sa.assignedNodes()), names(sa.assignedElements()), names(sdef.assignedNodes()), names(sdup.assignedNodes())],
    flatten: [names(sdup.assignedNodes({ flatten: true })), names(sdef.assignedNodes({ flatten: true }))],
    assignedSlot: [host.firstChild.assignedSlot === sa, host.childNodes[1].assignedSlot === sdef, host.lastChild.assignedSlot, sa.name, host.firstChild.slot],
  };
  host.querySelector('b').slot = 'a';
  log.push('sync');
  await new Promise((r) => setTimeout(r, 0));
  out.moved = names(sa.assignedNodes());
  host.appendChild(d.createTextNode('more'));
  sdef.remove();
  await new Promise((r) => setTimeout(r, 0));
  out.log = log;
  const closed = d.body.appendChild(d.createElement('div'));
  const cr = closed.attachShadow({ mode: 'closed' });
  cr.innerHTML = '<slot></slot>';
  closed.innerHTML = '<p>x</p>';
  out.closed = [closed.firstChild.assignedSlot, cr.firstChild.assignedNodes().length];
  return out;
});

parity('slots: what fires slotchange', async (w) => {
  const d = w.document;
  const log = [];
  const host = d.body.appendChild(d.createElement('div'));
  host.innerHTML = '<span>x</span>';
  const slot = d.createElement('slot');
  slot.addEventListener('slotchange', () => log.push('initial insert'));
  host.attachShadow({ mode: 'open' }).appendChild(slot);
  const host2 = d.body.appendChild(d.createElement('div'));
  host2.attachShadow({ mode: 'open' }).appendChild(d.createElement('slot')).addEventListener('slotchange', () => log.push('child added to host'));
  host2.appendChild(d.createElement('p'));
  const s3 = d.createElement('slot');
  s3.addEventListener('slotchange', () => log.push('fallback child added'));
  d.body.appendChild(d.createElement('div')).attachShadow({ mode: 'open' }).appendChild(s3);
  s3.appendChild(d.createElement('i'));
  const host4 = d.body.appendChild(d.createElement('div'));
  const s4 = host4.attachShadow({ mode: 'open' }).appendChild(d.createElement('slot'));
  s4.name = 'n';
  s4.addEventListener('slotchange', () => log.push('name change'));
  host4.innerHTML = '<p slot=m></p>';
  await Promise.resolve();
  s4.name = 'm';
  const host5 = d.body.appendChild(d.createElement('div'));
  host5.innerHTML = '<b>1</b>';
  const r5 = host5.attachShadow({ mode: 'open' });
  r5.innerHTML = '<slot></slot>';
  r5.firstChild.addEventListener('slotchange', () => log.push('innerHTML slot'));
  await new Promise((r) => setTimeout(r, 0));
  return log;
});

test('slots: no slot bookkeeping in documents without slots', () => {
  const w = createWindow();
  const host = w.document.body.appendChild(w.document.createElement('div'));
  host.attachShadow({ mode: 'open' }).appendChild(w.document.createElement('span'));
  host.appendChild(w.document.createElement('p'));
  const S = Object.getOwnPropertySymbols(w.document)[0];
  assert.equal(w.document[S].slotCount, undefined);
});

// jsdom (25 to 30) computes a slotted element's inherited properties from
// its node-tree parent (the host), not from its slot in the flat tree as
// browsers do; tests written for jsdom see the host's values, so warpdom
// keeps them.
for (const jsdom of [30, 26, 25]) {
  parity(`slotted elements inherit from the host, as in jsdom (jsdom ${jsdom})`, (w) => {
    const d = w.document;
    d.body.innerHTML = '<div id=host style="color: blue; font-size: 20px; visibility: hidden"><span id=s>x</span><em id=u slot=none>y</em></div>';
    const host = d.getElementById('host');
    const shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML = '<div style="color: red; font-size: 30px; visibility: visible; cursor: text"><slot></slot></div>';
    const style = (el) => { const c = w.getComputedStyle(el); return [c.color, c.fontSize, c.visibility, c.cursor]; };
    return { slotted: style(d.getElementById('s')), unslotted: style(d.getElementById('u')), slot: style(shadow.querySelector('slot')) };
  }, { jsdom });
}
