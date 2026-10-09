import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWindow } from '../src/node.js';

test('outerHTML and innerHTML serialize the tree', () => {
  const { document } = createWindow();
  const div = document.createElement('div');
  div.setAttribute('id', 'main');
  div.setAttribute('title', 'a "quote" & more ');
  div.appendChild(document.createTextNode('1 < 2 & 3 > 2 '));
  div.appendChild(document.createElement('br'));
  div.appendChild(document.createComment(' note '));
  const span = div.appendChild(document.createElement('span'));
  span.textContent = 'x';
  assert.equal(div.outerHTML,
    '<div id="main" title="a &quot;quote&quot; &amp; more&nbsp;">1 &lt; 2 &amp; 3 &gt; 2&nbsp;<br><!-- note --><span>x</span></div>');
  assert.equal(div.innerHTML, '1 &lt; 2 &amp; 3 &gt; 2&nbsp;<br><!-- note --><span>x</span>');
  assert.ok('outerHTML' in div); // Testing Library's prettyDOM checks this
});

test('raw text elements, void elements and SVG keep their form', () => {
  const { document } = createWindow();
  const script = document.createElement('script');
  script.textContent = 'if (a < b && c) {}';
  assert.equal(script.outerHTML, '<script>if (a < b && c) {}</script>');
  const input = document.createElement('input');
  input.setAttribute('type', 'text');
  assert.equal(input.outerHTML, '<input type="text">');
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.appendChild(document.createElementNS('http://www.w3.org/2000/svg', 'linearGradient'));
  assert.equal(svg.outerHTML, '<svg><linearGradient></linearGradient></svg>');
});

test('setting innerHTML parses HTML into real nodes', () => {
  const w = createWindow();
  const { document } = w;
  const host = document.body.appendChild(document.createElement('div'));
  host.innerHTML = '<ul class="list"><li id="first">One &amp; <b>two</b></li><li>Three</li></ul><!--c-->text';
  const ul = host.firstChild;
  assert.ok(ul instanceof w.HTMLUListElement);
  assert.equal(ul.getAttribute('class'), 'list');
  assert.equal(ul.children.length, 2);
  assert.equal(document.getElementById('first').textContent, 'One & two', 'parsed ids are indexed');
  assert.equal(host.childNodes[1].nodeType, 8);
  assert.equal(host.lastChild.nodeValue, 'text');
  assert.equal(host.innerHTML, '<ul class="list"><li id="first">One &amp; <b>two</b></li><li>Three</li></ul><!--c-->text');
  host.innerHTML = '';
  assert.equal(host.childNodes.length, 0);
});

test('parsing uses the element as context (table rows, select options)', () => {
  const { document } = createWindow();
  const row = document.createElement('tr');
  row.innerHTML = '<td>a</td><td>b</td>';
  assert.equal(row.children.length, 2);
  assert.equal(row.firstChild.tagName, 'TD');
  const select = document.createElement('select');
  select.innerHTML = '<option value="1">One</option>';
  assert.equal(select.firstChild.tagName, 'OPTION');
});

test('SVG inside HTML is parsed into the SVG namespace', () => {
  const w = createWindow();
  const div = w.document.createElement('div');
  div.innerHTML = '<svg viewBox="0 0 10 10"><path d="M0 0"></path></svg>';
  const svg = div.firstChild;
  assert.equal(svg.namespaceURI, 'http://www.w3.org/2000/svg');
  assert.ok(svg instanceof w.SVGSVGElement);
  assert.equal(svg.firstChild.namespaceURI, 'http://www.w3.org/2000/svg');
  assert.equal(svg.getAttribute('viewBox'), '0 0 10 10');
});

test('outerHTML setter and insertAdjacentHTML', () => {
  const { document } = createWindow();
  const parent = document.body.appendChild(document.createElement('div'));
  const target = parent.appendChild(document.createElement('p'));
  target.insertAdjacentHTML('beforebegin', '<i>1</i>');
  target.insertAdjacentHTML('afterbegin', '<b>2</b>');
  target.insertAdjacentHTML('beforeend', '<u>3</u>');
  target.insertAdjacentHTML('afterend', '<s>4</s>');
  assert.equal(parent.innerHTML, '<i>1</i><p><b>2</b><u>3</u></p><s>4</s>');
  target.outerHTML = '<em>new</em><strong>!</strong>';
  assert.equal(parent.innerHTML, '<i>1</i><em>new</em><strong>!</strong><s>4</s>');
  assert.equal(target.parentNode, null);
});

test('template content is a separate fragment', () => {
  const w = createWindow();
  const template = w.document.createElement('template');
  template.innerHTML = '<p>inside</p>';
  assert.ok(template.content instanceof w.DocumentFragment);
  assert.equal(template.childNodes.length, 0);
  assert.equal(template.content.firstChild.tagName, 'P');
  assert.equal(template.innerHTML, '<p>inside</p>');
  assert.equal(template.outerHTML, '<template><p>inside</p></template>');
  const host = w.document.createElement('div');
  host.innerHTML = '<template><b>x</b></template>';
  assert.equal(host.firstChild.content.firstChild.tagName, 'B');
});

import { parity as htmlParity } from './parity.js';

htmlParity('cloning a template copies its contents when deep', (w) => {
  const t = w.document.createElement('template');
  t.innerHTML = '<p id="a">x</p><b>y</b>';
  const deep = t.cloneNode(true);
  const shallow = t.cloneNode(false);
  return [deep.content.childNodes.length, deep.content.firstElementChild.id, deep.content.firstChild !== t.content.firstChild, shallow.content.childNodes.length, deep.innerHTML];
});
