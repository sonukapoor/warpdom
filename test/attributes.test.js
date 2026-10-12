import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWindow } from '../src/node.js';
import { parity } from './parity.js';

test('attributes is a live NamedNodeMap of Attr nodes', () => {
  const w = createWindow();
  const el = w.document.createElement('div');
  el.setAttribute('id', 'a');
  el.setAttribute('title', 't');
  const attrs = el.attributes;
  assert.ok(attrs instanceof w.NamedNodeMap);
  assert.equal(el.attributes, attrs, 'same object');
  assert.equal(attrs.length, 2);
  assert.ok(attrs[0] instanceof w.Attr && attrs[0] instanceof w.Node);
  assert.deepEqual(Array.from(attrs).map((a) => [a.name, a.value]), [['id', 'a'], ['title', 't']]);
  assert.equal(attrs.getNamedItem('title').value, 't');
  assert.equal(attrs.item(5), null);
  el.setAttribute('role', 'button');
  assert.equal(attrs.length, 3, 'live');
  el.removeAttribute('id');
  assert.deepEqual([...attrs].map((a) => a.name), ['title', 'role']);
});

test('Attr nodes: identity, ownerElement, value write-through', () => {
  const w = createWindow();
  const el = w.document.createElement('div');
  el.setAttribute('id', 'a');
  const attr = el.getAttributeNode('id');
  assert.equal(attr, el.getAttributeNode('id'));
  assert.equal(attr, el.attributes[0]);
  assert.deepEqual([attr.name, attr.localName, attr.nodeName, attr.nodeType, attr.ownerElement, attr.specified], ['id', 'id', 'id', 2, el, true]);
  attr.value = 'b';
  assert.equal(el.getAttribute('id'), 'b');
  assert.equal(el.getAttributeNode('missing'), null);
  const removed = el.removeAttributeNode(attr);
  assert.equal(removed, attr);
  assert.equal(attr.ownerElement, null);
  assert.equal(attr.value, 'b');
  assert.equal(el.hasAttribute('id'), false);
  const created = w.document.createAttribute('data-x');
  created.value = '1';
  el.setAttributeNode(created);
  assert.equal(el.getAttribute('data-x'), '1');
  assert.equal(created.ownerElement, el);
});

test('classList is a live DOMTokenList over the class attribute', () => {
  const w = createWindow();
  const el = w.document.createElement('div');
  const list = el.classList;
  assert.ok(list instanceof w.DOMTokenList);
  assert.equal(el.classList, list);
  list.add('a', 'b');
  assert.equal(el.className, 'a b');
  list.add('a');
  assert.equal(list.length, 2);
  assert.ok(list.contains('b'));
  assert.equal(list[1], 'b');
  assert.equal(list.item(0), 'a');
  list.remove('a');
  assert.equal(el.getAttribute('class'), 'b');
  assert.equal(list.toggle('c'), true);
  assert.equal(list.toggle('c'), false);
  assert.equal(list.toggle('d', true), true);
  assert.equal(list.toggle('d', true), true);
  assert.equal(list.replace('b', 'e'), true);
  assert.equal(list.value, 'e d');
  el.setAttribute('class', '  x   y x ');
  assert.deepEqual([...list], ['x', 'y'], 'parsed from the attribute, duplicates removed');
  assert.equal(list.toString(), '  x   y x ');
  assert.throws(() => list.add(''), { name: 'SyntaxError' });
  assert.throws(() => list.add('a b'), { name: 'InvalidCharacterError' });
  list.value = 'p q';
  assert.equal(el.className, 'p q');
});

test('dataset maps data-* attributes to camelCase properties', () => {
  const w = createWindow();
  const el = w.document.createElement('div');
  el.setAttribute('data-foo-bar', '1');
  const ds = el.dataset;
  assert.ok(ds instanceof w.DOMStringMap);
  assert.equal(ds.fooBar, '1');
  assert.equal(ds.missing, undefined);
  ds.helloWorld = 'x';
  assert.equal(el.getAttribute('data-hello-world'), 'x');
  assert.ok('helloWorld' in ds);
  assert.deepEqual(Object.keys(ds), ['fooBar', 'helloWorld']);
  delete ds.fooBar;
  assert.equal(el.hasAttribute('data-foo-bar'), false);
  assert.deepEqual({ ...ds }, { helloWorld: 'x' });
});

parity('NamedNodeMap named properties', (w) => {
  const d = w.document;
  const el = d.createElement('button');
  el.setAttribute('tabindex', '0');
  el.setAttribute('data-x', '1');
  el.setAttribute('length', 'shadowed');
  const svg = d.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 1 1');
  const xml = d.implementation.createDocument(null, 'root');
  xml.documentElement.setAttribute('Mixed', 'y');
  const a = el.attributes;
  return {
    tabindex: a.tabindex?.value, dataX: a['data-x']?.value, camel: a.tabIndex?.value, upper: a.TABINDEX?.value, missing: a.nope,
    inCamel: 'tabIndex' in a,
    inTab: 'tabindex' in a, inMissing: 'nope' in a, length: a.length,
    afterRemove: (el.removeAttribute('tabindex'), a.tabindex),
    svgViewBox: svg.attributes.viewBox?.value, svgLower: svg.attributes.viewbox,
    xmlMixed: xml.documentElement.attributes.Mixed?.value,
    keys: Object.keys(a),
  };
});


const XLINK = 'http://www.w3.org/1999/xlink';

parity('namespaced attributes', (w) => {
  const d = w.document;
  const svg = d.createElementNS('http://www.w3.org/2000/svg', 'use');
  svg.setAttributeNS(XLINK, 'xlink:href', '#a');
  svg.setAttributeNS(null, 'viewBox', '0 0 1 1');
  svg.setAttributeNS(XLINK, 'other:href', '#b');
  const attr = svg.getAttributeNodeNS(XLINK, 'href');
  const out = {
    get: [svg.getAttributeNS(XLINK, 'href'), svg.getAttribute('xlink:href'), svg.getAttributeNS(null, 'viewBox'), svg.getAttributeNS('', 'viewBox'), svg.getAttributeNS(XLINK, 'nope')],
    has: [svg.hasAttributeNS(XLINK, 'href'), svg.hasAttributeNS(null, 'href'), svg.hasAttribute('xlink:href')],
    attr: [attr.name, attr.localName, attr.prefix, attr.namespaceURI, attr.value],
    plain: [svg.getAttributeNode('viewBox').namespaceURI, svg.getAttributeNode('viewBox').prefix, svg.getAttributeNode('viewBox').localName],
    names: svg.getAttributeNames(),
    map: [svg.attributes.getNamedItemNS(XLINK, 'href')?.value, svg.attributes.getNamedItemNS(null, 'viewBox')?.value],
    html: svg.outerHTML,
  };
  svg.removeAttributeNS(XLINK, 'href');
  out.removed = [svg.hasAttributeNS(XLINK, 'href'), svg.getAttributeNames()];
  const div = d.createElement('div');
  div.setAttributeNS(null, 'Data-X', '1');
  out.htmlElement = [div.getAttributeNames(), div.getAttribute('data-x'), div.getAttributeNS(null, 'Data-X')];
  const errors = [];
  for (const [ns, qn] of [[null, 'a:b'], [XLINK, 'xml:x'], [XLINK, 'xmlns'], ['http://www.w3.org/2000/xmlns/', 'x'], [XLINK, ':x'], [XLINK, 'a b']]) {
    try { div.setAttributeNS(ns, qn, ''); errors.push('ok'); } catch (e) { errors.push(e.name); }
  }
  out.errors = errors;
  return out;
});

// Attributes are identified by namespace and local name: several with one
// qualified name coexist, lookups by name find the first, and the change
// steps of HTML attributes (id, style, event handlers, slot, form controls)
// apply to attributes in no namespace only.
for (const jsdom of [30, 26, 25]) {
  parity(`attributes with one qualified name in different namespaces (jsdom ${jsdom})`, (w) => {
    const d = w.document;
    const el = d.createElement('div');
    el.setAttributeNS('urn:a', 'x', '1');
    el.setAttribute('x', '2');
    el.setAttributeNS('urn:b', 'x', '3');
    el.setAttributeNS('urn:c', 'p:x', '4');
    el.setAttributeNS('urn:d', 'p:x', '5');
    const list = () => [...el.attributes].map((a) => [a.name, a.prefix, a.localName, a.namespaceURI, a.value]);
    const out = {
      first: [el.getAttribute('x'), el.getAttribute('p:x'), el.hasAttribute('p:x'), el.getAttributeNode('x').namespaceURI],
      byNs: [el.getAttributeNS(null, 'x'), el.getAttributeNS('urn:b', 'x'), el.getAttributeNS('urn:d', 'x'), el.attributes.getNamedItemNS('urn:c', 'x').value],
      names: el.getAttributeNames(),
      own: Object.getOwnPropertyNames(el.attributes),
      named: [el.attributes.x.namespaceURI, el.attributes['p:x'].value, el.attributes.getNamedItem('x').value],
      html: el.outerHTML,
      list: list(),
    };
    el.setAttribute('x', 'changed');
    el.toggleAttribute('p:x');
    out.afterSet = list();
    el.removeAttribute('x');
    out.afterRemove = [list(), el.getAttribute('x')];
    el.attributes.removeNamedItem('x');
    out.afterRemoveNamed = list();
    el.removeAttributeNS('urn:d', 'x');
    out.afterRemoveNS = list();
    out.equal = [el.isEqualNode(el.cloneNode()), el.cloneNode().outerHTML];
    const other = d.createElement('div');
    other.setAttributeNS('urn:x', 'x', '1');
    const same = d.createElement('div');
    same.setAttribute('x', '1');
    out.notEqual = other.isEqualNode(same);
    return out;
  }, { jsdom });

  parity(`setAttributeNode replaces in place and keeps order (jsdom ${jsdom})`, (w) => {
    const d = w.document;
    const el = d.createElement('div');
    el.setAttribute('a', '1');
    el.setAttributeNS('urn:x', 'p:b', '2');
    el.setAttribute('c', '3');
    const replacement = d.createAttributeNS('urn:x', 'q:b');
    replacement.value = 'new';
    const old = el.setAttributeNodeNS(replacement);
    const plain = d.createAttribute('A');
    plain.value = 'x';
    const oldA = el.setAttributeNode(plain);
    return {
      old: [old.name, old.value, old.ownerElement, old.namespaceURI],
      oldA: [oldA.name, oldA.value, oldA.ownerElement],
      list: [...el.attributes].map((a) => [a.name, a.value]),
      // (jsdom 25 and 26 still find the replaced attribute by its old
      // qualified name, p:b; jsdom 30 does not.)
      getB: [el.getAttribute('q:b'), jsdom === 30 ? el.getAttribute('p:b') : null],
      same: el.setAttributeNode(plain) === null,
      inUse: (() => { try { d.createElement('p').setAttributeNode(plain); return 'ok'; } catch (e) { return e.name; } })(),
      detached: (() => { el.removeAttributeNode(replacement); return [replacement.ownerElement, replacement.value, replacement.prefix, replacement.name]; })(),
    };
  }, { jsdom });
}

parity('namespaced attributes do not run the change steps of HTML attributes', async (w) => {
  const d = w.document;
  const div = d.createElement('div');
  d.body.append(div);
  div.setAttributeNS('urn:x', 'id', 'nsid');
  div.setAttributeNS('urn:x', 'style', 'color: red');
  div.setAttributeNS('urn:x', 'class', 'c');
  div.setAttributeNS('urn:x', 'onclick', 'window.clicked = true');
  div.setAttributeNS('urn:x', 'data-foo', 'bar');
  div.click();
  const input = d.createElement('input');
  input.setAttributeNS('urn:x', 'type', 'checkbox');
  input.setAttributeNS('urn:x', 'value', 'v');
  const out = {
    // (jsdom's selectors match #nsid and .c against the namespaced id and
    // class attributes; warpdom's, as the standard says, do not.)
    id: [div.id, d.getElementById('nsid') === div],
    style: [div.style.color, div.getAttribute('style'), div.style.cssText],
    cls: [div.className, div.classList.length, div.matches('[class]')],
    clicked: w.clicked ?? false,
    input: [input.type, input.value],
    html: div.outerHTML,
  };
  div.setAttribute('style', 'color: blue');
  div.removeAttributeNS('urn:x', 'style');
  out.after = [div.style.color, div.getAttribute('style'), div.outerHTML];
  return out;
});

parity('namespaced attribute mutation records and custom element callbacks', async (w) => {
  const d = w.document;
  const calls = [];
  w.customElements.define('ns-attr-el', class extends w.HTMLElement {
    static get observedAttributes() { return ['x']; }
    attributeChangedCallback(...args) { calls.push(args); }
  });
  const el = d.createElement('ns-attr-el');
  const records = [];
  const mo = new w.MutationObserver((r) => records.push(...r.map((m) => [m.attributeName, m.attributeNamespace, m.oldValue])));
  mo.observe(el, { attributes: true, attributeOldValue: true });
  el.setAttributeNS('urn:a', 'p:x', '1');
  el.setAttribute('x', '2');
  el.setAttributeNS('urn:a', 'q:x', '3');
  el.removeAttributeNS('urn:a', 'x');
  el.setAttributeNS('urn:a', 'y', '4');
  await Promise.resolve();
  return { calls, records };
});

parity('parsed foreign attributes and serialization by qualified name', (w) => {
  const d = w.document;
  d.body.innerHTML = '<svg><use xlink:href="#a" xml:lang="en" xmlns:foo="urn:foo" foo:bar="1" xmlns="http://www.w3.org/2000/svg"></use></svg><div xlink:href="x"></div>';
  const use = d.querySelector('use');
  const div = d.querySelector('div');
  const info = (el) => [...el.attributes].map((a) => [a.name, a.prefix, a.localName, a.namespaceURI]);
  const el = d.createElement('span');
  el.setAttributeNS('http://www.w3.org/1999/xlink', 'foo:href', 'v');
  el.setAttributeNS('http://www.w3.org/2000/xmlns/', 'xmlns:q', 'urn:q');
  el.setAttributeNS('http://www.w3.org/XML/1998/namespace', 'xml:space', 'preserve');
  const x = new w.XMLSerializer();
  return {
    use: info(use),
    div: info(div),
    html: [use.outerHTML, div.outerHTML, el.outerHTML, x.serializeToString(el)],
    get: [use.getAttribute('xlink:href'), use.getAttributeNS('http://www.w3.org/1999/xlink', 'href'), use.getAttributeNS(null, 'href'), div.getAttributeNS(null, 'xlink:href')],
    selectors: ['[xlink\\:href]', '[foo\\:bar]', '[xml\\:lang]', '[*|lang]'].map((s) => d.querySelectorAll(s).length),
    clone: use.cloneNode().outerHTML,
  };
});

parity('attribute names keep their case on HTML elements in XML documents', (w) => {
  const x = w.document.implementation.createDocument(null, 'r');
  const e = x.createElementNS('http://www.w3.org/1999/xhtml', 'div');
  e.setAttribute('FOO', '1');
  const h = w.document.createElement('div');
  h.setAttribute('FOO', '1');
  return [e.getAttributeNames(), e.getAttribute('foo'), e.getAttribute('FOO'), e.hasAttribute('foo'), Object.getOwnPropertyNames(e.attributes), h.getAttributeNames()];
});
