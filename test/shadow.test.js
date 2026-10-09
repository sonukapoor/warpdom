// Shadow DOM and event dispatch across shadow boundaries, checked against jsdom.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWindow } from '../src/node.js';
import { parity, html } from './parity.js';

const name = (t, w) => (t === w ? 'window' : t?.nodeType === 9 ? 'document' : t?.nodeType === 11 ? (t.host ? `shadow(${t.host.id})` : 'fragment') : t?.id || t?.nodeName || String(t));

parity('attachShadow, shadowRoot, connectedness, ids', (w) => {
  const d = html(w, '<div id="host"></div><span id="closed"></span><input id="bad">');
  const host = d.getElementById('host');
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = '<p id="inner">hi <b id="deep">x</b></p>';
  const deep = root.getElementById('deep');
  const out = [root.constructor.name, root.mode, root.host === host, host.shadowRoot === root, root.innerHTML, root.nodeType,
    deep.isConnected, deep.getRootNode() === root, deep.getRootNode({ composed: true }) === d, d.getElementById('deep'),
    root.querySelector('b').id, d.querySelector('#deep'), host.contains(deep)];
  const closedRoot = d.getElementById('closed').attachShadow({ mode: 'closed' });
  out.push(d.getElementById('closed').shadowRoot, closedRoot.mode);
  for (const f of [() => d.getElementById('bad').attachShadow({ mode: 'open' }), () => host.attachShadow({ mode: 'open' }), () => d.createElement('div').attachShadow({ mode: 'nope' })]) {
    try { f(); out.push('ok'); } catch (e) { out.push(e.name); }
  }
  const detachedHost = d.createElement('div');
  const detachedRoot = detachedHost.attachShadow({ mode: 'open' });
  detachedRoot.innerHTML = '<i>x</i>';
  out.push(detachedRoot.firstChild.isConnected);
  d.body.appendChild(detachedHost);
  out.push(detachedRoot.firstChild.isConnected);
  return out;
});

parity('events cross shadow boundaries with retargeting', (w) => {
  const d = html(w, '<div id="host"></div><div id="chost"></div>');
  const open = d.getElementById('host').attachShadow({ mode: 'open' });
  open.innerHTML = '<button id="btn">b</button>';
  const closed = d.getElementById('chost').attachShadow({ mode: 'closed' });
  closed.innerHTML = '<button id="cbtn">c</button>';
  const log = [];
  const record = (where) => (e) => log.push(`${where}:${e.type}:target=${name(e.target, w)}:path=${e.composedPath().map((t) => name(t, w)).join('>')}:phase=${e.eventPhase}`);
  for (const t of [d, d.getElementById('host'), open, open.getElementById('btn'), closed, closed.getElementById('cbtn')]) t.addEventListener('ping', record(name(t, w)));
  open.getElementById('btn').dispatchEvent(new w.Event('ping', { bubbles: true, composed: true }));
  log.push('--- not composed');
  open.getElementById('btn').dispatchEvent(new w.Event('ping', { bubbles: true }));
  log.push('--- closed tree');
  const event = new w.Event('ping', { bubbles: true, composed: true });
  closed.getElementById('cbtn').dispatchEvent(event);
  log.push(`after dispatch target: ${name(event.target, w)}`);
  return log;
});

parity('focus inside a shadow tree: activeElement and relatedTarget', (w) => {
  const d = html(w, '<input id="outside"><div id="host"></div>');
  const root = d.getElementById('host').attachShadow({ mode: 'open' });
  root.innerHTML = '<input id="a"><input id="b">';
  const log = [];
  d.addEventListener('focusin', (e) => log.push(`doc focusin target=${name(e.target, w)} related=${name(e.relatedTarget, w)}`));
  root.addEventListener('focusin', (e) => log.push(`root focusin target=${name(e.target, w)} related=${name(e.relatedTarget, w)}`));
  d.getElementById('outside').focus();
  root.getElementById('a').focus();
  log.push(`active: ${name(d.activeElement, w)} / root: ${name(root.activeElement, w)}`);
  root.getElementById('b').focus();
  log.push(`active: ${name(d.activeElement, w)} / root: ${name(root.activeElement, w)}`);
  d.getElementById('outside').focus();
  log.push(`active: ${name(d.activeElement, w)} / root: ${name(root.activeElement, w)}`);
  return log;
});

// Standard members jsdom lacks.
test('ShadowRoot exposes delegatesFocus, slotAssignment, clonable', () => {
  const w = createWindow();
  const root = w.document.body.appendChild(w.document.createElement('div')).attachShadow({ mode: 'open', delegatesFocus: true, slotAssignment: 'manual' });
  assert.deepEqual([root.delegatesFocus, root.slotAssignment, root.clonable, root.serializable], [true, 'manual', false, false]);
});
