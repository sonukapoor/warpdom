import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWindow } from '../src/index.js';

const SVG = 'http://www.w3.org/2000/svg';
const HTML = 'http://www.w3.org/1999/xhtml';

test('node names, values and constants', () => {
  const w = createWindow();
  const { document } = w;
  assert.equal(document.createElement('div').nodeName, 'DIV');
  assert.equal(document.createTextNode('x').nodeName, '#text');
  assert.equal(document.createComment('x').nodeName, '#comment');
  assert.equal(document.nodeName, '#document');
  assert.equal(document.createDocumentFragment().nodeName, '#document-fragment');
  assert.equal(document.createTextNode('x').nodeValue, 'x');
  assert.equal(document.createElement('div').nodeValue, null);
  assert.equal(w.Node.ELEMENT_NODE, 1);
  assert.equal(w.Node.prototype.TEXT_NODE, 3);
  assert.equal(document.createElement('div').DOCUMENT_POSITION_CONTAINED_BY, 16);
});

test('childNodes and children are live NodeList and HTMLCollection', () => {
  const w = createWindow();
  const { document } = w;
  const ul = document.createElement('ul');
  const kids = ul.childNodes;
  const elements = ul.children;
  assert.ok(kids instanceof w.NodeList && elements instanceof w.HTMLCollection);
  assert.equal(kids.constructor.name, 'NodeList');
  assert.equal(ul.childNodes, kids, 'same object every time');
  ul.appendChild(document.createElement('li'));
  ul.appendChild(document.createTextNode(' '));
  ul.appendChild(document.createElement('li'));
  assert.equal(kids.length, 3);
  assert.equal(elements.length, 2);
  assert.equal(kids[0], ul.firstChild);
  assert.equal(kids.item(2), ul.lastChild);
  assert.equal(kids[5], undefined);
  assert.deepEqual([...elements].map((e) => e.tagName), ['LI', 'LI']);
  let n = 0;
  kids.forEach(() => n++);
  assert.equal(n, 3);
  while (ul.childNodes.length) ul.removeChild(ul.childNodes[0]);
  assert.equal(kids.length, 0);
  assert.deepEqual(Object.keys(kids), []);
});

test('ParentNode and ChildNode methods', () => {
  const { document } = createWindow();
  const div = document.createElement('div');
  const a = document.createElement('a');
  const b = document.createElement('b');
  div.append(a, 'text', b);
  assert.equal(div.childNodes.length, 3);
  assert.equal(div.textContent, 'text');
  div.prepend('start');
  assert.equal(div.firstChild.nodeValue, 'start');
  assert.equal(div.firstElementChild, a);
  assert.equal(div.lastElementChild, b);
  assert.equal(div.childElementCount, 2);
  assert.equal(a.nextElementSibling, b);
  assert.equal(b.previousElementSibling, a);
  const i = document.createElement('i');
  a.after(i);
  assert.equal(a.nextSibling, i);
  i.before('x');
  assert.equal(a.nextSibling.nodeValue, 'x');
  const u = document.createElement('u');
  b.replaceWith(u);
  assert.equal(div.lastChild, u);
  assert.equal(b.parentNode, null);
  div.replaceChildren(b);
  assert.equal(div.childNodes.length, 1);
  assert.equal(div.replaceChild(a, b), b);
  assert.equal(div.firstChild, a);
});

test('document fragments move their children on insertion', () => {
  const w = createWindow();
  const { document } = w;
  const frag = document.createDocumentFragment();
  assert.ok(frag instanceof w.DocumentFragment);
  frag.append(document.createElement('p'), document.createElement('p'));
  document.body.appendChild(frag);
  assert.equal(document.body.children.length, 2);
  assert.equal(frag.childNodes.length, 0);
  assert.equal(new w.DocumentFragment().nodeType, 11);
});

test('cloneNode copies attributes, and descendants when deep', () => {
  const { document } = createWindow();
  const div = document.createElement('div');
  div.setAttribute('id', 'a');
  div.style.color = 'red';
  div.append(document.createElement('span'), 'text');
  const shallow = div.cloneNode();
  assert.equal(shallow.getAttribute('id'), 'a');
  assert.equal(shallow.style.color, 'red');
  assert.equal(shallow.childNodes.length, 0);
  const deep = div.cloneNode(true);
  assert.equal(deep.childNodes.length, 2);
  assert.notEqual(deep.firstChild, div.firstChild);
  assert.equal(deep.textContent, 'text');
  assert.equal(deep.parentNode, null);
});

test('connection, root node and document position', () => {
  const { document } = createWindow();
  const outer = document.createElement('div');
  const inner = outer.appendChild(document.createElement('span'));
  assert.equal(inner.isConnected, false);
  assert.equal(inner.getRootNode(), outer);
  document.body.appendChild(outer);
  assert.equal(inner.isConnected, true);
  assert.equal(inner.getRootNode(), document);
  assert.equal(outer.compareDocumentPosition(inner), 16 | 4); // contained by, following
  assert.equal(inner.compareDocumentPosition(outer), 8 | 2); // contains, preceding
  const sibling = document.body.appendChild(document.createElement('p'));
  assert.equal(inner.compareDocumentPosition(sibling), 4);
  assert.equal(sibling.compareDocumentPosition(inner), 2);
  assert.equal(outer.compareDocumentPosition(outer), 0);
  assert.ok(document.createElement('x').compareDocumentPosition(outer) & 1); // disconnected
});

test('inserting a node into its own descendant throws', () => {
  const { document } = createWindow();
  const outer = document.createElement('div');
  const inner = outer.appendChild(document.createElement('div'));
  assert.throws(() => inner.appendChild(outer), { name: 'HierarchyRequestError' });
});

test('namespaces: HTML elements and SVG through createElementNS', () => {
  const w = createWindow();
  const { document } = w;
  assert.equal(document.createElement('div').namespaceURI, HTML);
  const svg = document.createElementNS(SVG, 'svg');
  const path = document.createElementNS(SVG, 'path');
  assert.equal(svg.namespaceURI, SVG);
  assert.ok(svg instanceof w.SVGSVGElement && svg instanceof w.SVGElement && !(svg instanceof w.HTMLElement));
  assert.ok(path instanceof w.SVGElement);
  assert.equal(path.tagName, 'path');
  assert.equal(path.nodeName, 'path');
  const htmlNs = document.createElementNS(HTML, 'div');
  assert.ok(htmlNs instanceof w.HTMLDivElement);
});

test('closest, attribute helpers and getElementsBy*', () => {
  const { document } = createWindow();
  const list = document.body.appendChild(document.createElement('ul'));
  list.className = 'menu';
  const item = list.appendChild(document.createElement('li'));
  const link = item.appendChild(document.createElement('a'));
  assert.equal(link.closest('ul'), list);
  assert.equal(link.closest('.menu'), list);
  assert.equal(link.closest('a'), link);
  assert.equal(link.closest('table'), null);
  assert.equal(link.toggleAttribute('disabled'), true);
  assert.equal(link.getAttribute('disabled'), '');
  assert.equal(link.toggleAttribute('disabled'), false);
  link.setAttribute('href', '#');
  assert.deepEqual(link.getAttributeNames(), ['href']);
  assert.ok(link.hasAttributes());
  const items = document.getElementsByTagName('li');
  assert.equal(items.length, 1);
  list.appendChild(document.createElement('li'));
  assert.equal(items.length, 2, 'live');
  assert.equal(document.getElementsByClassName('menu')[0], list);
});

test('getElementById follows id changes, attach and detach, and tree order', () => {
  const { document } = createWindow();
  const a = document.createElement('div');
  a.id = 'x';
  assert.equal(document.getElementById('x'), null, 'not connected yet');
  const wrapper = document.createElement('section');
  wrapper.appendChild(a);
  document.body.appendChild(wrapper);
  assert.equal(document.getElementById('x'), a, 'connected with its parent');
  a.setAttribute('id', 'y');
  assert.equal(document.getElementById('x'), null);
  assert.equal(document.getElementById('y'), a);
  const b = document.createElement('p');
  b.id = 'y';
  document.body.insertBefore(b, wrapper); // b precedes a in tree order
  assert.equal(document.getElementById('y'), b);
  b.remove();
  assert.equal(document.getElementById('y'), a);
  a.removeAttribute('id');
  assert.equal(document.getElementById('y'), null);
  wrapper.remove();
  a.id = 'z';
  assert.equal(document.getElementById('z'), null, 'detached elements are not found');
});

test('live collections follow attribute changes', () => {
  const { document } = createWindow();
  const el = document.body.appendChild(document.createElement('div'));
  const active = document.getElementsByClassName('active');
  assert.equal(active.length, 0);
  el.className = 'active';
  assert.equal(active.length, 1);
  el.removeAttribute('class');
  assert.equal(active.length, 0);
});
