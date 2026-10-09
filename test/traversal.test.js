import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWindow } from '../src/index.js';

// <div id=root><a/>text<b><c/><d/></b><e/></div>
function fixture() {
  const w = createWindow();
  const { document } = w;
  const root = document.createElement('div');
  const el = (tag) => document.createElement(tag);
  const a = root.appendChild(el('a'));
  root.appendChild(document.createTextNode('text'));
  const b = root.appendChild(el('b'));
  const c = b.appendChild(el('c'));
  const d = b.appendChild(el('d'));
  const e = root.appendChild(el('e'));
  return { w, document, root, a, b, c, d, e };
}

const names = (nodes) => nodes.map((n) => n.nodeName.toLowerCase());

test('NodeFilter constants', () => {
  const { w } = fixture();
  assert.equal(w.NodeFilter.SHOW_ELEMENT, 1);
  assert.equal(w.NodeFilter.SHOW_TEXT, 4);
  assert.equal(w.NodeFilter.SHOW_ALL, 0xFFFFFFFF);
  assert.deepEqual([w.NodeFilter.FILTER_ACCEPT, w.NodeFilter.FILTER_REJECT, w.NodeFilter.FILTER_SKIP], [1, 2, 3]);
});

test('TreeWalker nextNode and previousNode in document order', () => {
  const { w, document, root } = fixture();
  const walker = document.createTreeWalker(root, w.NodeFilter.SHOW_ELEMENT);
  assert.ok(walker instanceof w.TreeWalker);
  assert.equal(walker.root, root);
  const seen = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) seen.push(n);
  assert.deepEqual(names(seen), ['a', 'b', 'c', 'd', 'e']);
  const back = [];
  for (let n = walker.previousNode(); n; n = walker.previousNode()) back.push(n);
  assert.deepEqual(names(back), ['d', 'c', 'b', 'a', 'div']);
});

test('TreeWalker filters: SKIP visits children, REJECT skips the subtree', () => {
  const { w, document, root } = fixture();
  const skipB = document.createTreeWalker(root, w.NodeFilter.SHOW_ELEMENT, (n) => (n.nodeName === 'B' ? w.NodeFilter.FILTER_SKIP : w.NodeFilter.FILTER_ACCEPT));
  const seen = [];
  for (let n = skipB.nextNode(); n; n = skipB.nextNode()) seen.push(n);
  assert.deepEqual(names(seen), ['a', 'c', 'd', 'e']);
  const rejectB = document.createTreeWalker(root, w.NodeFilter.SHOW_ELEMENT, { acceptNode: (n) => (n.nodeName === 'B' ? 2 : 1) });
  const seen2 = [];
  for (let n = rejectB.nextNode(); n; n = rejectB.nextNode()) seen2.push(n);
  assert.deepEqual(names(seen2), ['a', 'e']);
});

test('TreeWalker structural moves and currentNode', () => {
  const { w, document, root, b, c, d } = fixture();
  const walker = document.createTreeWalker(root, w.NodeFilter.SHOW_ELEMENT);
  assert.equal(walker.firstChild().nodeName, 'A');
  assert.equal(walker.nextSibling(), b);
  assert.equal(walker.lastChild(), d);
  assert.equal(walker.previousSibling(), c);
  assert.equal(walker.parentNode(), b);
  walker.currentNode = d;
  assert.equal(walker.nextSibling(), null);
  assert.equal(walker.currentNode, d);
  const all = document.createTreeWalker(root);
  assert.equal(all.whatToShow, 0xFFFFFFFF);
  all.firstChild();
  assert.equal(all.nextSibling().nodeType, 3, 'text nodes with SHOW_ALL');
});

test('NodeIterator nextNode and previousNode', () => {
  const { w, document, root } = fixture();
  const it = document.createNodeIterator(root, w.NodeFilter.SHOW_ELEMENT);
  assert.ok(it instanceof w.NodeIterator);
  const seen = [];
  for (let n = it.nextNode(); n; n = it.nextNode()) seen.push(n);
  assert.deepEqual(names(seen), ['div', 'a', 'b', 'c', 'd', 'e']);
  assert.equal(it.previousNode().nodeName, 'E');
  assert.equal(it.previousNode().nodeName, 'D');
});
