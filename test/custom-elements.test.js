// Custom elements, checked against jsdom (parity.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWindow } from '../src/node.js';
import { parity, html } from './parity.js';

const tag = (el) => (el?.id ? `${el.localName}#${el.id}` : el?.localName ?? String(el));

function defineLogger(w, name, log, extra = {}) {
  class Logger extends w.HTMLElement {
    static get observedAttributes() { return ['data-x', 'title']; }
    constructor() { super(); log.push(`constructor ${name} attrs=${this.attributes.length} connected=${this.isConnected}`); }
    connectedCallback() { log.push(`connected ${tag(this)}`); }
    disconnectedCallback() { log.push(`disconnected ${tag(this)}`); }
    adoptedCallback(oldDoc, newDoc) { log.push(`adopted ${tag(this)} ${oldDoc === newDoc}`); }
    attributeChangedCallback(attr, oldValue, value) { log.push(`attr ${tag(this)} ${attr} ${oldValue} -> ${value}`); }
  }
  Object.assign(Logger.prototype, extra);
  w.customElements.define(name, Logger);
  return Logger;
}

parity('define, construct, callbacks in order', (w) => {
  const d = w.document;
  const log = [];
  const before = html(w, '<x-log id="early" data-x="1"></x-log>').getElementById('early');
  log.push(`before define: defined=${before.matches(':defined')} proto=${Object.getPrototypeOf(before) === w.HTMLElement.prototype}`);
  const X = defineLogger(w, 'x-log', log);
  log.push(`after define: upgraded=${before instanceof X} defined=${before.matches(':defined')}`);
  const made = d.createElement('x-log');
  made.id = 'made';
  log.push(`created: ${made instanceof X}`);
  d.body.appendChild(made);
  made.setAttribute('data-x', '2');
  made.setAttribute('ignored', '1');
  made.title = 't';
  made.removeAttribute('data-x');
  d.body.removeChild(made);
  const direct = new X();
  direct.id = 'direct';
  log.push(`new X: ${direct.localName} ${direct instanceof w.HTMLElement}`);
  d.body.append(direct);
  const other = d.implementation.createHTMLDocument();
  other.body.appendChild(direct);
  d.body.innerHTML = '<div><x-log id="parsed" title="p"></x-log></div>';
  log.push(`parsed upgraded: ${d.getElementById('parsed') instanceof X}`);
  const frag = d.createElement('template');
  frag.innerHTML = '<x-log id="intemplate"></x-log>';
  log.push(`in template: ${frag.content.firstChild instanceof X}`);
  const clone = d.getElementById('parsed').cloneNode(true);
  log.push(`clone: ${clone instanceof X}`);
  return log;
});

parity('registry API and errors', async (w) => {
  const reg = w.customElements;
  const out = [reg instanceof w.CustomElementRegistry, reg.get('y-one'), reg.getName(class {})];
  const pending = reg.whenDefined('y-one');
  class One extends w.HTMLElement {}
  reg.define('y-one', One);
  out.push(reg.get('y-one') === One, reg.getName(One), (await pending) === One, (await reg.whenDefined('y-one')) === One);
  for (const f of [() => reg.define('nodash', class extends w.HTMLElement {}), () => reg.define('y-one', class extends w.HTMLElement {}),
    () => reg.define('y-two', One), () => reg.define('y-three', () => {}), () => reg.define('font-face', class extends w.HTMLElement {}),
    () => new w.HTMLElement(), () => w.HTMLElement(), () => new (class extends w.HTMLElement {})()]) {
    try { f(); out.push('ok'); } catch (e) { out.push(e.name); }
  }
  try { await reg.whenDefined('bad'); } catch (e) { out.push(`whenDefined: ${e.name}`); }
  const el = w.document.createElement('y-four');
  out.push(el.matches(':defined'), el.matches(':not(:defined)'), w.document.createElement('div').matches(':defined'));
  class Four extends w.HTMLElement {}
  reg.define('y-four', Four);
  out.push(el instanceof Four, 'upgrade only when connected or asked');
  reg.upgrade(el);
  out.push(el instanceof Four);
  return out;
});

parity('constructor errors and customized built-ins', (w) => {
  const d = w.document;
  const errors = [];
  w.addEventListener('error', (e) => { errors.push(e.error?.name ?? e.message); e.preventDefault(); });
  w.customElements.define('z-throws', class extends w.HTMLElement { constructor() { super(); throw new RangeError('nope'); } });
  const el = d.createElement('z-throws');
  const out = [Object.getPrototypeOf(el) === w.HTMLUnknownElement.prototype, errors.splice(0)];
  w.customElements.define('z-button', class extends w.HTMLButtonElement { constructor() { super(); this.dataset.made = 'yes'; } }, { extends: 'button' });
  const b = d.createElement('button', { is: 'z-button' });
  out.push(b.localName, b.dataset.made, b instanceof w.HTMLButtonElement, b.outerHTML);
  d.body.innerHTML = '<button is="z-button" id="pb"></button>';
  out.push(d.getElementById('pb').dataset.made ?? 'not upgraded');
  return out;
});

// Following the standard where jsdom differs: an element whose constructor
// threw is "failed", which :defined does not match (jsdom matches it).
test('a failed custom element is not :defined', () => {
  const w = createWindow();
  w.addEventListener('error', (e) => e.preventDefault());
  w.customElements.define('z-fails', class extends w.HTMLElement { constructor() { super(); throw new Error('x'); } });
  assert.equal(w.document.createElement('z-fails').matches(':defined'), false);
});

test('without custom element definitions, tree operations skip reactions', () => {
  const w = createWindow();
  const S = Object.getOwnPropertySymbols(w.document)[0];
  w.document.body.appendChild(w.document.createElement('x-undefined'));
  assert.equal(w.document.body.firstChild[S].ceState, 'undefined');
});

// Documents without a browsing context look up no custom element
// definitions (before, warpdom ran the constructor there, which failed).
parity('documents without a browsing context do not create custom elements', (w) => {
  const errors = [];
  w.addEventListener('error', (e) => errors.push(e.message));
  class Z extends w.HTMLElement { constructor() { super(); this.made = true; } }
  w.customElements.define('x-z', Z);
  const docs = [w.document.implementation.createHTMLDocument(), new w.DOMParser().parseFromString('<x-z></x-z>', 'text/html'),
    w.document.implementation.createDocument('http://www.w3.org/1999/xhtml', 'html')];
  const out = docs.map((d) => {
    const e = d.createElement('x-z');
    const parsed = d.querySelector('x-z');
    return [e.constructor.name, !!e.made, parsed && [parsed.constructor.name, !!parsed.made]];
  });
  const e = docs[0].createElement('x-z');
  w.document.body.append(e);
  out.push([e instanceof Z, !!e.made], w.document.importNode(docs[1].querySelector('x-z')) instanceof Z, errors);
  return out;
});
