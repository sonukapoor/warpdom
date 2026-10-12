// Live collections as WebIDL legacy platform objects: indexed and named
// properties as own properties, read-only, undeletable.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parity, html } from './parity.js';
import { createWindow } from '../src/node.js';
import { installWindow } from '../src/vitest.js';

const attempt = (fn) => {
  try { return ['ok', fn()]; } catch (e) { return ['threw', e.name]; }
};
// Test modules are strict; these run sloppy-mode code.
const looseSet = new Function('o', 'k', 'v', 'o[k] = v;');
const looseDelete = new Function('o', 'k', 'return delete o[k];');
const id = (el) => (el == null ? el : el.id || el.getAttribute?.('name') || el.name || el.tagName);

parity('HTMLCollection own property names: indices, then names, then expandos', (w) => {
  const doc = html(w, `<span></span><span id=""></span><span id="a"></span><span id="a"></span>
    <span name="n"></span><span id="b" name="c"></span><svg><g id="g" name="svgname"></g></svg>`);
  const spans = doc.getElementsByTagName('span');
  spans.expando = 1;
  const all = doc.body.getElementsByTagName('*');
  return [Object.getOwnPropertyNames(spans), Object.keys(spans), Object.getOwnPropertyNames(all)];
});

parity('HTMLCollection property descriptors and the in operator', (w) => {
  const doc = html(w, '<p id="x"></p><p name="item"></p><p id="0"></p>');
  const c = doc.getElementsByTagName('p');
  const desc = (k) => { const d = Object.getOwnPropertyDescriptor(c, k); return d && { ...d, value: id(d.value) }; };
  return [desc('0'), desc('x'), desc('3'), desc('item'), desc('length'), '0' in c, 'x' in c, '' in c, 'y' in c, '3' in c,
    id(c.x), id(c[0]), typeof c.item, id(c.namedItem('item')), c.namedItem(''), id(c.namedItem(0)), c[''], id(c.item(4294967296)), c.item(-1)];
});

parity('HTMLCollection indices and names are read-only and undeletable', (w) => {
  const doc = html(w, '<i id="foo"></i>');
  const c = doc.getElementsByTagName('i');
  const results = [];
  looseSet(c, 0, 5); results.push(id(c[0]));
  looseSet(c, 'foo', 5); results.push(id(c.foo));
  results.push(attempt(() => { 'use strict'; c[0] = 5; }));
  results.push(attempt(() => { 'use strict'; c[1] = 5; }));
  results.push(attempt(() => { 'use strict'; c.foo = 5; }));
  results.push(attempt(() => { 'use strict'; delete c[0]; }));
  results.push(attempt(() => { 'use strict'; delete c.foo; }));
  results.push(attempt(() => { 'use strict'; return delete c[1]; }));
  results.push(attempt(() => Object.defineProperty(c, '0', { value: 1 })));
  results.push(attempt(() => Object.defineProperty(c, 'foo', { value: 1 }) && 'defined'));
  results.push(looseDelete(c, 0), looseDelete(c, 'foo'), id(c[0]), id(c.foo), c[1]);
  c.bar = 1; results.push(c.bar, delete c.bar, c.bar);
  return results;
});

parity('HTMLCollection expandos hide names added later', (w) => {
  const doc = html(w, '');
  const c = doc.getElementsByTagName('b');
  c.later = 5;
  const b = doc.body.appendChild(doc.createElement('b'));
  b.id = 'later';
  const before = [c.later, id(c.namedItem('later'))];
  delete c.later;
  return [before, id(c.later), Object.getOwnPropertyNames(c)];
});

parity('HTMLCollection as a prototype', (w) => {
  const doc = html(w, '<p id="named"></p>');
  const c = doc.getElementsByTagName('p');
  const obj = Object.create(c);
  const results = [attempt(() => obj.length), id(obj.named)];
  obj.named = 'foo';
  results.push(obj.named, id(c.named));
  return results;
});

parity('HTMLCollection is live in its own properties', (w) => {
  const doc = html(w, '<div id="root"></div>');
  const root = doc.getElementById('root');
  const list = root.getElementsByTagName('div');
  const a = doc.createElement('div'); a.id = 'div1';
  const b = doc.createElement('div'); b.id = 'div2';
  const out = [Object.getOwnPropertyNames(list)];
  root.append(a, doc.createElement('p'), b);
  out.push(Object.getOwnPropertyNames(list), 'div1' in list);
  a.remove();
  out.push(Object.getOwnPropertyNames(list), 'div1' in list, id(list.div2), id(root.children[1]));
  return out;
});

parity('NamedNodeMap own property names and descriptors', (w) => {
  const doc = html(w, '<input id="r" type="text" value="" width="200px">');
  const input = doc.getElementById('r');
  input.setAttributeNS('urn:x', 'x:Foo', 'v');
  const attrs = input.attributes;
  const names = Object.getOwnPropertyNames(attrs);
  const d = Object.getOwnPropertyDescriptor(attrs, 'type');
  input.removeAttribute('width');
  return [names, Object.keys(attrs), d.enumerable, d.writable, d.value.name, Object.getOwnPropertyNames(attrs),
    attrs.type.value, attrs.tabIndex, attempt(() => { 'use strict'; attrs.type = 1; }), attempt(() => { 'use strict'; delete attrs[0]; })];
});

parity('HTMLOptionsCollection indexed setter', (w) => {
  const doc = html(w, '<select id="s"><option>a</option><option>b</option></select>');
  const select = doc.getElementById('s');
  const text = () => [...select.options].map((o) => o.text || '-');
  const make = (t) => { const o = doc.createElement('option'); o.text = t; return o; };
  select.options[0] = make('A');
  const r = [text()];
  select.options[4] = make('E');
  r.push(text());
  select.options[1] = null;
  r.push(text());
  r.push(attempt(() => { select.options[0] = doc.createElement('div'); }));
  r.push(Object.getOwnPropertyDescriptor(select.options, '0').writable);
  return r;
});

parity('HTMLFormControlsCollection named properties', (w) => {
  const doc = html(w, '<form id="f"><input name="a"><input name="r" type="radio"><input name="r" type="radio"><input id="b"></form>');
  const elements = doc.getElementById('f').elements;
  return [Object.getOwnPropertyNames(elements), elements.a.name, elements.r.length, elements.r.constructor.name, id(elements.b)];
});

// Named access on the Window object (HTML 7.2.2.3).
parity('window named properties: ids, names of embed/form/img/object, iframes', (w) => {
  const doc = html(w, `<div id="foo"></div><div id="foo"></div><form name="f"></form><img name="i"><a name="a"></a>
    <div name="dn"></div><iframe name="fr"></iframe><div id="addEventListener"></div><div id="document"></div>
    <embed name="e"><object name="o"></object><svg><g id="svgid"/></svg><p id="host"></p>`);
  doc.getElementById('host').attachShadow({ mode: 'open' }).innerHTML = '<span id="shadowed"></span>';
  const WindowProperties = Object.getPrototypeOf(Object.getPrototypeOf(w));
  return [
    w.foo.constructor.name, w.foo.length, w.f.tagName, w.i.tagName, w.a, w.dn, w.fr === w.frames[0],
    typeof w.addEventListener, w.document.nodeName, w.e.tagName, w.o.tagName, w.svgid, w.shadowed,
    'foo' in w, 'nothere' in w, Object.getOwnPropertyDescriptor(w, 'f'), Object.keys(w).includes('f'),
    String(WindowProperties), Object.getPrototypeOf(WindowProperties) === w.EventTarget.prototype,
  ];
});

parity('window named properties are live and yield to expandos', (w) => {
  const doc = html(w, '<span id="later"></span>');
  const out = [w.later.tagName];
  doc.getElementById('later').remove();
  out.push(w.later);
  const p = doc.body.appendChild(doc.createElement('p'));
  p.id = 'later';
  out.push(w.later.tagName);
  w.later = 5;
  out.push(w.later);
  delete w.later;
  out.push(w.later.tagName);
  p.id = 'renamed';
  out.push(w.later, w.renamed.tagName);
  return out;
});

test('test environment globals have no named access, as under Vitest with jsdom', () => {
  // Vitest's jsdom environment copies window members onto Node's global, so
  // window.foo for an id is undefined there; warpdom's environments do the
  // same. The window object itself (iframes, createWindow) has it.
  const window = createWindow();
  const global = {};
  const restore = installWindow(global, window);
  window.document.body.innerHTML = '<div id="foo"></div>';
  assert.equal(global.foo, undefined);
  assert.equal(global.window.foo, undefined);
  assert.equal(window.foo.id, 'foo');
  restore();
});

parity('iterating a live NodeList or HTMLCollection sees changes made meanwhile', (w) => {
  const d = w.document;
  const parent = d.createElement('div');
  const { childNodes, children } = parent;
  const early = children[Symbol.iterator]();
  parent.innerHTML = '<b>1</b><b>2</b>';
  const seen = [];
  for (const n of childNodes) {
    seen.push(n.textContent);
    if (seen.length < 3) parent.append(d.createElement('i'));
  }
  return [seen.length, early.next().value === parent.firstChild, [...childNodes.keys()], [...childNodes.entries()].length,
    String(childNodes.values()), [...d.querySelectorAll('i')].length];
});
