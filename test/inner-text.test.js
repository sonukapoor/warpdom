// innerText and outerText (HTML 3.2.7). jsdom has none (an expando there),
// so these are unit tests against the HTML standard and browsers' results.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { JSDOM as JSDOM26 } from 'jsdom26';
import { JSDOM as JSDOM25 } from 'jsdom25';
import { createWindow } from '../src/node.js';

const text = (markup, id = 'target') => {
  const w = createWindow();
  w.document.body.innerHTML = markup;
  const el = w.document.getElementById(id) ?? w.document.body.firstElementChild;
  return el.innerText;
};

test('jsdom 25, 26 and 30 have no innerText or outerText (canary for this deviation)', () => {
  for (const Dom of [JSDOM, JSDOM26, JSDOM25]) {
    const { window } = new Dom('<div>a</div>');
    assert.equal('innerText' in window.HTMLElement.prototype, false);
    assert.equal('outerText' in window.HTMLElement.prototype, false);
  }
});

test('innerText is an HTMLElement accessor; SVG elements have none', () => {
  const w = createWindow();
  const desc = Object.getOwnPropertyDescriptor(w.HTMLElement.prototype, 'innerText');
  assert.equal(typeof desc.get, 'function');
  assert.equal(typeof desc.set, 'function');
  assert.equal(w.document.createElementNS('http://www.w3.org/2000/svg', 'svg').innerText, undefined);
});

test('white-space collapsing, line starts and ends, across element boundaries', () => {
  assert.equal(text('<div> abc  def\n</div>'), 'abc def');
  assert.equal(text('<div><span>abc </span> def</div>'), 'abc def');
  assert.equal(text('<div>abc <br> def</div>'), 'abc\ndef');
  assert.equal(text('<div>abc <b></b> def</div>'), 'abc def');
  assert.equal(text('<div>abc <input> def</div>'), 'abc  def');
  assert.equal(text("<div>abc <span style='display:inline-block'> def </span> ghi</div>"), 'abc def ghi');
  assert.equal(text('<div>&nbsp;</div>'), '\xa0');
  assert.equal(text('<div>abc<br></div>'), 'abc\n');
});

test('pre, pre-line and white-space styles', () => {
  assert.equal(text('<pre> a  b\n c </pre>'), ' a  b\n c ');
  assert.equal(text("<div style='white-space:pre'> a\tb</div>"), ' a\tb');
  assert.equal(text("<div style='white-space:pre-line'> a  b \n c</div>"), 'a b\nc');
  assert.equal(text('<div><pre>abc</pre><pre>def</pre></div>'), 'abc\ndef');
});

test('blocks, paragraphs, tables, lists and replaced elements', () => {
  assert.equal(text('<div>123<div>abc</div>def</div>'), '123\nabc\ndef');
  assert.equal(text('<div><p>abc</p> <p>def</p></div>'), 'abc\n\ndef');
  assert.equal(text('<div><p>abc</p></div>'), 'abc');
  assert.equal(text('<div><table><tr><td>a<td>b</tr><tr><td>c<td></table></div>'), 'a\tb\nc\t');
  assert.equal(text('<div>abc<table><td>def</table>ghi</div>'), 'abc\ndef\nghi');
  assert.equal(text('<div><ul><li>a</li><li>b</li></ul></div>'), 'a\nb');
  assert.equal(text('<div>a<textarea>x</textarea><img alt=y>b</div>'), 'ab');
  assert.equal(text('<div><select><option>one<option>two</select></div>'), 'one\ntwo');
  assert.equal(text('<div><details><summary>s</summary>body</details></div>'), 's');
  assert.equal(text('<div><details open><summary>s</summary>body</details></div>'), 's\nbody');
  assert.equal(text("<div style='display:flex'><span>1</span><span>2</span></div>"), '1\n2');
});

test('display: none, visibility and text-transform', () => {
  assert.equal(text("<div>123<span style='display:none'>abc</span></div>"), '123');
  assert.equal(text("<div style='display:none'> abc  def </div>"), ' abc  def ');
  assert.equal(text('<div>a<span hidden>b</span><script>c</script><style>d</style></div>'), 'a');
  assert.equal(text("<div style='visibility:hidden'>123<span style='visibility:visible'>abc</span></div>"), 'abc');
  assert.equal(text("<div><div style='text-transform:uppercase'>Ma\xdf</div></div>"), 'MASS');
});

test('elements not being rendered return their text content', () => {
  const w = createWindow();
  const d = w.document;
  const detached = d.createElement('div');
  detached.innerHTML = '<p> a </p><p>b</p>';
  assert.equal(detached.innerText, ' a b');
  const doc = d.implementation.createHTMLDocument('');
  doc.body.innerHTML = '<div id=x><p>a</p><p>b</p></div>';
  assert.equal(doc.getElementById('x').innerText, 'ab');
  d.body.innerHTML = '<canvas><div id=fallback><p>a</p><p>b</p></div></canvas>';
  assert.equal(d.getElementById('fallback').innerText, 'ab');
});

test('the innerText setter: text and br elements, one mutation record', async () => {
  const w = createWindow();
  const d = w.document;
  d.body.innerHTML = '<div id=t><b>old</b></div>';
  const t = d.getElementById('t');
  const records = [];
  new w.MutationObserver((r) => records.push(...r)).observe(t, { childList: true });
  t.innerText = 'a\r\nb\rc\nd';
  assert.equal(t.innerHTML, 'a<br>b<br>c<br>d');
  t.innerText = '';
  assert.equal(t.childNodes.length, 0);
  t.innerText = null;
  assert.equal(t.innerHTML, '');
  t.innerText = undefined;
  assert.equal(t.innerHTML, 'undefined');
  await Promise.resolve();
  assert.equal(records.length, 3); // setting '' on an empty element records nothing
  t.innerText = '\n';
  assert.equal(t.innerHTML, '<br>');
});

test('the outerText setter replaces the element and merges adjacent text', () => {
  const w = createWindow();
  const d = w.document;
  d.body.innerHTML = '<div id=p>a<span id=t>x</span>b</div>';
  const p = d.getElementById('p');
  d.getElementById('t').outerText = 'X';
  assert.equal(p.childNodes.length, 1);
  assert.equal(p.firstChild.data, 'aXb');
  p.innerHTML = 'a<span id=t>x</span>b';
  d.getElementById('t').outerText = '1\n2';
  assert.equal(p.innerHTML, 'a1<br>2b');
  assert.equal(p.childNodes.length, 3);
  assert.equal(d.createElement('span').outerText, '');
  assert.throws(
    () => {
      d.createElement('span').outerText = 'x';
    },
    { name: 'NoModificationAllowedError' },
  );
});
