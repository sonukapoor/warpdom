import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWindow } from '../src/node.js';
import { parity } from './parity.js';

function page(html) {
  const w = createWindow();
  w.document.body.innerHTML = html;
  return w;
}
const ids = (nodes) => [...nodes].map((n) => n.id || n.tagName.toLowerCase());

test('type, universal, id, class and compound selectors', () => {
  const { document } = page('<div id="a" class="x y"><p id="b" class="y">t</p><span id="c"></span></div>');
  assert.deepEqual(ids(document.querySelectorAll('p')), ['b']);
  assert.deepEqual(ids(document.body.querySelectorAll('*')), ['a', 'b', 'c']);
  assert.equal(document.querySelector('#c').id, 'c');
  assert.deepEqual(ids(document.querySelectorAll('.y')), ['a', 'b']);
  assert.deepEqual(ids(document.querySelectorAll('div.x.y')), ['a']);
  assert.deepEqual(ids(document.querySelectorAll('P')), ['b'], 'type selectors are case-insensitive for HTML');
});

test('attribute selectors with every operator and the i flag', () => {
  const { document } = page(`
    <a id="1" data-testid="content" lang="en-US" class="btn primary" href="https://x.test/page.pdf"></a>
    <a id="2" data-testid="CONTENT" lang="en" href="/home"></a>`);
  const q = (sel) => ids(document.querySelectorAll(sel));
  assert.deepEqual(q('[data-testid]'), ['1', '2']);
  assert.deepEqual(q('[data-testid="content"]'), ['1']);
  assert.deepEqual(q("[data-testid='content' i]"), ['1', '2']);
  assert.deepEqual(q('[data-testid=content]'), ['1']);
  assert.deepEqual(q('[class~="primary"]'), ['1']);
  assert.deepEqual(q('[lang|="en"]'), ['1', '2']);
  assert.deepEqual(q('[href^="https"]'), ['1']);
  assert.deepEqual(q('[href$=".pdf"]'), ['1']);
  assert.deepEqual(q('[href*="home"]'), ['2']);
  assert.deepEqual(q('[DATA-TESTID="content"]'), ['1'], 'attribute names are case-insensitive on HTML elements');
});

test('combinators', () => {
  const { document } = page(
    '<section id="s"><div id="d"><p id="p1"></p></div><p id="p2"></p><span id="sp"></span><p id="p3"></p></section>',
  );
  const q = (sel) => ids(document.querySelectorAll(sel));
  assert.deepEqual(q('section p'), ['p1', 'p2', 'p3']);
  assert.deepEqual(q('section > p'), ['p2', 'p3']);
  assert.deepEqual(q('#d + p'), ['p2']);
  assert.deepEqual(q('#d ~ p'), ['p2', 'p3']);
  assert.deepEqual(q('div p, span'), ['p1', 'sp'], 'selector lists return tree order without duplicates');
  assert.deepEqual(q('section>div>p'), ['p1']);
});

test('structural pseudo-classes', () => {
  const { document } = page(
    '<ul id="u"><li id="l1"></li><li id="l2"></li><li id="l3"></li><li id="l4"></li><li id="l5"></li></ul><div id="e"></div>',
  );
  const q = (sel) => ids(document.querySelectorAll(sel));
  assert.deepEqual(q('li:first-child'), ['l1']);
  assert.deepEqual(q('li:last-child'), ['l5']);
  assert.deepEqual(q('li:nth-child(2)'), ['l2']);
  assert.deepEqual(q('li:nth-child(odd)'), ['l1', 'l3', 'l5']);
  assert.deepEqual(q('li:nth-child(even)'), ['l2', 'l4']);
  assert.deepEqual(q('li:nth-child(2n+1)'), ['l1', 'l3', 'l5']);
  assert.deepEqual(q('li:nth-child(-n+2)'), ['l1', 'l2']);
  assert.deepEqual(q('li:nth-last-child(1)'), ['l5']);
  assert.deepEqual(q('li:nth-child(odd of #l2, #l3, #l4)'), ['l2', 'l4']);
  assert.deepEqual(q('#e:empty'), ['e']);
  assert.deepEqual(q('li:first-of-type'), ['l1']);
  assert.deepEqual(q('div:only-of-type'), ['e']);
  assert.equal(document.querySelector(':root'), document.documentElement);
});

test('logical pseudo-classes: :not, :is, :where, :has', () => {
  const { document } = page('<div id="a"><p id="p"></p></div><div id="b"></div><span id="s"></span>');
  const q = (sel) => ids(document.body.querySelectorAll(sel));
  assert.deepEqual(q(':not(div)'), ['p', 's']);
  assert.deepEqual(q('div:not(#a, #c)'), ['b']);
  assert.deepEqual(q(':is(span, p)'), ['p', 's']);
  assert.deepEqual(q(':where(#b)'), ['b']);
  assert.deepEqual(q('div:has(p)'), ['a']);
  assert.deepEqual(q('div:has(> p)'), ['a']);
  assert.deepEqual(q('div:has(+ div)'), ['a']);
});

test('state pseudo-classes', () => {
  const { document } = page(`
    <input id="c1" type="checkbox" checked><input id="c2" type="checkbox">
    <button id="b1" disabled></button><button id="b2"></button>
    <fieldset disabled><input id="f1"></fieldset>
    <input id="r" required><input id="o"><select id="sel"><option id="op" selected>x</option></select>
    <input id="ro" readonly>`);
  const q = (sel) => ids(document.querySelectorAll(sel));
  assert.deepEqual(q(':checked'), ['c1', 'op']);
  assert.deepEqual(q('button:disabled'), ['b1']);
  assert.deepEqual(q('button:enabled'), ['b2']);
  assert.deepEqual(q('#f1:disabled'), ['f1'], 'disabled by its fieldset');
  assert.deepEqual(q('input:required'), ['r']);
  assert.ok(q('input:optional').includes('o'));
  assert.ok(q('input:read-only').includes('ro'));
  assert.deepEqual(q('a:hover, a:active'), []);
});

test('matches, closest and :scope', () => {
  const { document } = page('<div id="outer" data-x="1"><div id="inner"><span id="s"></span></div></div>');
  const s = document.getElementById('s');
  assert.ok(s.matches('div > div > span'));
  assert.ok(s.matches('#outer span'));
  assert.equal(s.closest('[data-x]').id, 'outer');
  assert.equal(s.closest('div').id, 'inner');
  const inner = document.getElementById('inner');
  assert.deepEqual(ids(inner.querySelectorAll(':scope > span')), ['s']);
  assert.deepEqual(ids(inner.querySelectorAll('div span')), ['s'], 'ancestors outside the root still count');
});

test('escapes in identifiers and strings', () => {
  const w = page('');
  const { document } = w;
  const el = document.body.appendChild(document.createElement('div'));
  el.id = ':r1:';
  el.className = 'a.b';
  assert.equal(document.querySelector('#\\:r1\\:'), el);
  assert.equal(document.querySelector('.a\\.b'), el);
  assert.equal(document.querySelector('[id=":r1:"]'), el);
  assert.equal(document.querySelector('#\\3A r1\\3A'), el, 'hex escapes');
});

test('invalid selectors throw SyntaxError; pseudo-elements match nothing', () => {
  const { document } = page('<p></p>');
  for (const bad of ['', 'p[', '>', 'p >', '#', 'p..x', ':nth-child(x)', 'p,', ':unknown-pseudo']) {
    assert.throws(() => document.querySelector(bad), { name: 'SyntaxError' }, `"${bad}"`);
  }
  assert.equal(document.querySelector('p::before'), null);
});

test('selectors in SVG are case-sensitive', () => {
  const { document } = page('<svg><linearGradient id="g"></linearGradient></svg>');
  assert.equal(document.querySelector('linearGradient').id, 'g');
  assert.equal(document.querySelector('lineargradient'), null);
});

test('cached query results and positions follow tree, attribute and text changes', () => {
  const { document } = page('<ul id="u"><li id="a"></li><li id="b"></li></ul>');
  const u = document.getElementById('u');
  const q = (sel, root = document) => ids(root.querySelectorAll(sel));
  assert.deepEqual(q('li:nth-child(2)'), ['b']);
  const first = u.insertBefore(document.createElement('li'), u.firstChild);
  first.id = 'z';
  assert.deepEqual(q('li:nth-child(2)'), ['a'], 'positions recomputed after insert');
  assert.deepEqual(q('li:last-of-type'), ['b']);
  u.removeChild(document.getElementById('b'));
  assert.deepEqual(q('li:last-child'), ['a']);
  assert.deepEqual(q('[data-x]'), []);
  document.getElementById('a').setAttribute('data-x', '1');
  assert.deepEqual(q('[data-x]'), ['a'], 'attribute change');
  assert.deepEqual(q('li', u), ['z', 'a']);
  const detached = document.createElement('div');
  detached.appendChild(u);
  assert.deepEqual(q('li'), [], 'removed from the document');
  assert.deepEqual(q('li', detached), ['z', 'a']);
  const e = document.body.appendChild(document.createElement('p'));
  e.id = 'e';
  assert.deepEqual(q('p:empty'), ['e']);
  const t = e.appendChild(document.createTextNode(''));
  assert.deepEqual(q('p:empty'), [], 'any text child, as in jsdom');
  t.data = 'x';
  assert.deepEqual(q('p:empty'), [], 'text data change');
  e.appendChild(document.createComment('c'));
  e.removeChild(t);
  assert.deepEqual(q('p:empty'), ['e'], 'a comment alone');
  assert.notEqual(document.querySelectorAll('li'), document.querySelectorAll('li'), 'a new NodeList per call');
});

test('querySelector with duplicate ids returns the first in tree order', () => {
  const { document } = page('<div id="r"><i id="d" class="one"></i><i id="d" class="two"></i></div>');
  assert.equal(document.querySelector('#d').className, 'one');
  assert.equal(document.querySelectorAll('#d').length, 2);
  assert.equal(document.getElementById('r').querySelectorAll('#d').length, 2);
});

// Namespaces in type selectors, forgiving :is/:where, CSS input
// preprocessing in escapes, and :host from a shadow root (as jsdom 30).
parity('selectors: *| and | namespaces, forgiving :is, preprocessing, :host', (w) => {
  const d = w.document;
  const section = d.body.appendChild(d.createElement('section'));
  section.className = 'x';
  const shadow = section.attachShadow({ mode: 'open' });
  shadow.appendChild(d.createElement('article')).appendChild(d.createElement('b'));
  d.body.appendChild(d.createElementNS(null, 'h'));
  const span = d.body.appendChild(d.createElement('span'));
  span.id = 'sp�aces';
  const spaces = d.body.appendChild(d.createElement('span'));
  spaces.id = 'spaces';
  const count = (root, selector) => {
    try {
      return root.querySelectorAll(selector).length;
    } catch (e) {
      return e.name;
    }
  };
  return [
    ...[
      ':host > article',
      ':host article',
      ':host b',
      ':host(.x) b',
      ':host(.y) b',
      ':host',
      'section > article',
      '*|article',
      '|article',
      '*|*',
      'x|article',
      ':is(x|a, article)',
      ':where()',
      ':is(:foo, b)',
      ':not(x|a)',
      ':where(:is(x|y), b)',
      'b:is()',
    ].map((s) => count(shadow, s)),
    ...['|h', '*|h', 'h', '|b', '#sp\0aces', '#sp\\0 aces', '#spac\\65\r\ns', '#spac\\65\fs'].map((s) => count(d, s)),
  ];
});

// :empty and text (#202, black box, jsdom 20.0.3 to 30.1.3, the same in
// all): an element with a text child does not match, whatever its data
// (empty, whitespace); comments, processing instructions and CDATA
// sections do not count. Text data changes refresh what depends on text:
// :dir(auto) (querySelectorAll too) and a textarea's validity, in
// getComputedStyle as well; from 21 to 30.1.1 too, where computed values
// are kept until the document's tree changes.
const emptyTextScenario = (w) => {
  const d = w.document;
  d.head.innerHTML =
    '<style>div { color: green } div:empty { color: blue } textarea { color: green } textarea:invalid { color: blue }' +
    ' p:dir(rtl) { color: red }</style>';
  const color = (el) => w.getComputedStyle(el).color;
  const div = (...kids) => {
    const el = d.body.appendChild(d.createElement('div'));
    for (const k of kids) el.appendChild(k);
    return el;
  };
  const els = [
    div(),
    div(d.createTextNode('')),
    div(d.createTextNode(' ')),
    div(d.createComment('')),
    div(d.createProcessingInstruction('x', 'y')),
    div(d.createTextNode(''), d.createTextNode('')),
  ];
  const sel = (el) => [d.querySelector('div:empty') === el, el.matches(':empty'), el.closest(':empty') === el];
  const out = els.map((el) => [color(el), ...sel(el)]);
  out.push(d.querySelectorAll('div:empty').length);
  // Text data changes.
  const [, a, b] = els;
  a.firstChild.data = 'x';
  b.firstChild.data = '';
  out.push(color(a), color(b), a.matches(':empty'), b.matches(':empty'));
  a.firstChild.appendData('y');
  a.removeChild(a.firstChild);
  b.textContent = '';
  out.push(color(a), color(b), d.querySelectorAll('div:empty').length);
  const ta = d.body.appendChild(d.createElement('textarea'));
  ta.required = true;
  ta.appendChild(d.createTextNode(''));
  out.push(color(ta), ta.matches(':invalid'));
  ta.firstChild.data = 'x';
  out.push(color(ta), ta.matches(':invalid'));
  const p = d.body.appendChild(d.createElement('p'));
  p.dir = 'auto';
  p.textContent = 'x';
  out.push(color(p), d.querySelectorAll('p:dir(rtl)').length);
  p.firstChild.data = '\u05d0';
  out.push(color(p), d.querySelectorAll('p:dir(rtl)').length, p.matches(':dir(rtl)'));
  // An XML document: CDATA sections do not count, empty or not.
  const x = new w.DOMParser().parseFromString('<r><a/><b/><c/></r>', 'application/xml');
  const [xa, xb, xc] = x.documentElement.children;
  xa.appendChild(x.createCDATASection(''));
  xb.appendChild(x.createTextNode(''));
  xc.appendChild(x.createCDATASection('z'));
  out.push(
    [xa, xb, xc].map((e) => e.matches(':empty')),
    x.querySelectorAll(':empty').length,
  );
  // From 21 to 30.1.1 text set in a disconnected tree or a shadow tree
  // keeps kept values (a rule edit shows only after a tree change).
  d.head.innerHTML = '<style>div { color: blue }</style>';
  d.body.innerHTML = '<div></div><section></section>';
  const kept = d.body.firstChild;
  const rule = d.styleSheets[0].cssRules[0];
  out.push(color(kept));
  rule.style.color = 'green';
  d.createElement('p').appendChild(d.createTextNode('x')).data = 'y';
  out.push(color(kept));
  const shadow = d.body.lastChild.attachShadow({ mode: 'open' });
  shadow.innerHTML = '<i>q</i>';
  out.push(color(kept));
  rule.style.color = 'red';
  shadow.firstChild.firstChild.data = 'r';
  out.push(color(kept));
  return out;
};
for (const jsdom of [20, 22, 25, 27, 28, 29, 30])
  parity(`selectors: :empty with text children, text changes (jsdom ${jsdom})`, emptyTextScenario, { jsdom });
