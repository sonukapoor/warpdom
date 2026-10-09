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
