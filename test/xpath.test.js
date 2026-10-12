// XPath (DOM standard's XPathEvaluator, XPath 1.0): parity with jsdom for
// what tests use, unit tests where jsdom's XPath is broken or differs from
// the standard (warpdom follows the standard there; see PLAN.md).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWindow } from '../src/node.js';
import { parity, html } from './parity.js';

const MARKUP = `
  <div id="app" class="main">
    <h1>Title</h1>
    <ul><li class="item">One</li><li class="item active">Two <b>bold</b></li><li>Three</li></ul>
    <button type="button">Save</button><button disabled>Cancel</button>
    <p lang="en">Some <em>text</em> here</p>
    <!-- a comment -->
    <form><input name="email" value="a@b.c"><label for="x">Email</label></form>
    <svg viewBox="0 0 1 1"><path d="M0"></path></svg>
  </div>`;

const nodeNames = (r) => {
  const out = [];
  for (let n = r.iterateNext(); n; n = r.iterateNext()) out.push(n.nodeName + (n.nodeType === 1 && n.id ? `#${n.id}` : ''));
  return out;
};

for (const jsdom of [30, 26, 25]) {
  parity(`XPath queries tests use (jsdom ${jsdom})`, (w) => {
    const d = html(w, MARKUP);
    const R = w.XPathResult;
    const snapshot = (expr, ctx = d) => {
      const r = d.evaluate(expr, ctx, null, R.ORDERED_NODE_SNAPSHOT_TYPE, null);
      const out = [];
      for (let i = 0; i < r.snapshotLength; i++) out.push(r.snapshotItem(i).nodeName);
      return out;
    };
    const first = (expr) => d.evaluate(expr, d, null, R.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue?.textContent ?? null;
    return {
      byText: first("//button[text()='Save']"),
      contains: first("//li[contains(text(), 'Tw')]"),
      containsClass: snapshot("//li[contains(@class, 'item')]"),
      normalize: first("//p[normalize-space()='Some text here']"),
      dot: first("//li[contains(., 'bold')]"),
      attr: snapshot('//button[@disabled]'),
      attrValue: first("//input[@name='email']/@value"),
      position: [first('//li[2]'), first('(//li)[last()]'), first('//ul/li[position() > 2]')],
      axes: [snapshot('//b/ancestor::*'), snapshot('//h1/following-sibling::*'), snapshot('//li[3]/preceding-sibling::li'), first('//label/../input/@name')],
      unions: snapshot('//h1 | //button | //h1'),
      text: snapshot('//li/text()'),
      comments: snapshot('//comment()'),
      svg: snapshot('//svg/*'),
      caseInsensitive: [snapshot('//LI'), snapshot('//Button[@TYPE]')],
      counts: ['count(//li)', 'count(//*)', 'sum(//nothing)', 'string-length(//h1)', '1 + 2 * 3', '7 mod 3', '10 div 4', 'floor(2.7)', 'ceiling(2.1)', 'round(1.5)']
        .map((e) => d.evaluate(e, d, null, R.NUMBER_TYPE, null).numberValue),
      strings: ['string(//h1)', 'concat(//h1, "-", count(//li))', 'translate("abc", "ab", "AB")', 'substring-before("a-b", "-")', 'substring-after("a-b", "-")', 'substring("12345", 2, 3)', 'normalize-space("  a   b  ")', 'string(//li[2])']
        .map((e) => d.evaluate(e, d, null, R.STRING_TYPE, null).stringValue),
      booleans: ['//li = "One"', 'count(//li) > 2', 'not(//table)', 'boolean(//h1)', 'starts-with("abc", "ab")', '"1" = 1']
        .map((e) => d.evaluate(e, d, null, R.BOOLEAN_TYPE, null).booleanValue),
      any: ['count(//li)', 'string(//h1)', '//h1 = "Title"', '//li'].map((e) => d.evaluate(e, d, null, R.ANY_TYPE, null).resultType),
      iterate: nodeNames(d.evaluate('//li', d, null, R.ORDERED_NODE_ITERATOR_TYPE, null)),
      relative: snapshot('li', d.querySelector('ul')),
      contextElement: d.evaluate('string(./h1)', d.getElementById('app'), null, R.STRING_TYPE, null).stringValue,
      id: snapshot('id("app")'),
      expression: d.createExpression('count(//li)', null).evaluate(d, R.NUMBER_TYPE, null).numberValue,
      evaluator: new w.XPathEvaluator().evaluate('count(//button)', d, null, R.NUMBER_TYPE, null).numberValue,
      constants: Object.keys(R).filter((k) => /^[A-Z_]+$/.test(k)).map((k) => [k, R[k], R.prototype[k]]),
      instance: d.evaluate('1', d, null, 0, null) instanceof R,
      // (A TypeError in jsdom 30 and warpdom; jsdom 25 and 26 throw an Error named XPathException.)
      nodeSetType: (() => { try { d.evaluate('1 + 1', d, null, R.ORDERED_NODE_SNAPSHOT_TYPE, null); return 'ok'; } catch { return 'threw'; } })(),
      emptyFirst: d.evaluate('//table', d, null, R.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue,
    };
  }, { jsdom });
}

// jsdom 30 invalidates iterators on tree and attribute changes (not text
// changes), as the standard says; jsdom 25 and 26 do not.
for (const jsdom of [30, 26]) {
  parity(`XPath iterator invalidation (jsdom ${jsdom})`, (w) => {
    const d = html(w, '<ul><li>a</li><li>b</li></ul>');
    const R = w.XPathResult;
    const out = {};
    const attempt = (r) => { try { return r.iterateNext()?.textContent ?? null; } catch (e) { return e.name; } };
    let r = d.evaluate('//li', d, null, R.ORDERED_NODE_ITERATOR_TYPE, null);
    attempt(r);
    d.querySelector('li').firstChild.data = 'x';
    out.text = [r.invalidIteratorState, attempt(r)];
    r = d.evaluate('//li', d, null, R.ORDERED_NODE_ITERATOR_TYPE, null);
    attempt(r);
    d.querySelector('li').setAttribute('a', '1');
    out.attribute = [r.invalidIteratorState, attempt(r)];
    r = d.evaluate('//li', d, null, R.UNORDERED_NODE_ITERATOR_TYPE, null);
    d.querySelector('ul').append(d.createElement('li'));
    out.tree = [r.invalidIteratorState, attempt(r)];
    const snapshot = d.evaluate('//li', d, null, R.ORDERED_NODE_SNAPSHOT_TYPE, null);
    d.querySelector('ul').append(d.createElement('li'));
    out.snapshot = [snapshot.invalidIteratorState, snapshot.snapshotLength];
    return out;
  }, { jsdom });
}

parity('XPath in an XML document from DOMParser', (w) => {
  const x = new w.DOMParser().parseFromString('<feed xmlns="http://www.w3.org/2005/Atom" xmlns:m="urn:m"><entry><title>A</title><m:x>1</m:x></entry><entry><title>B</title></entry></feed>', 'application/xml');
  const R = w.XPathResult;
  const resolver = (p) => ({ a: 'http://www.w3.org/2005/Atom', m: 'urn:m' }[p] ?? null);
  const strings = (e, r = null) => {
    const res = x.evaluate(e, x, r, R.ORDERED_NODE_SNAPSHOT_TYPE, null);
    const out = [];
    for (let i = 0; i < res.snapshotLength; i++) out.push(res.snapshotItem(i).textContent);
    return out;
  };
  return {
    // As in jsdom: an unprefixed name test finds elements in any namespace.
    unprefixed: strings('//entry/title'),
    count: x.evaluate('count(//entry)', x, null, R.NUMBER_TYPE, null).numberValue,
    attribute: strings('//entry[1]/*[2]', resolver),
  };
});

test('XPath follows the standard where jsdom is broken: functions, prefixes, numbers, errors', () => {
  const w = createWindow();
  const d = html(w, '<div id="a"><p>one</p><p xml:lang="x">two</p></div><svg><circle r="1"></circle></svg>');
  const R = w.XPathResult;
  const str = (e, ctx = d, r = null) => d.evaluate(e, ctx, r, R.STRING_TYPE, null).stringValue;
  const num = (e) => d.evaluate(e, d, null, R.NUMBER_TYPE, null).numberValue;
  assert.equal(str('name(//p)'), 'p');
  assert.equal(str('local-name(//circle)'), 'circle');
  assert.equal(str('namespace-uri(//circle)'), 'http://www.w3.org/2000/svg');
  assert.equal(str('substring("12345", 0, 3)'), '12');
  assert.equal(str('substring("12345", 1.5, 2.6)'), '234');
  assert.equal(str('string(1000000000000000000000)'), '1000000000000000000000');
  assert.equal(str('string(0.0000001)'), '0.0000001');
  assert.equal(str('string(-0)'), '0');
  assert.equal(str('string(1 div 0)'), 'Infinity');
  assert.ok(Number.isNaN(num('number("1e3")')));
  assert.equal(num('round(-2.5)'), -2);
  assert.equal(str('local-name(//@*)', d), 'id');
  const html5 = (p) => (p === 'h' ? 'http://www.w3.org/1999/xhtml' : p === 's' ? 'http://www.w3.org/2000/svg' : null);
  assert.equal(d.evaluate('count(//h:p)', d, html5, R.NUMBER_TYPE, null).numberValue, 2);
  assert.equal(d.evaluate('count(//s:circle)', d, { lookupNamespaceURI: html5 }, R.NUMBER_TYPE, null).numberValue, 1);
  assert.throws(() => d.evaluate('//x:p', d, null, 0, null), { name: 'NamespaceError' });
  assert.throws(() => d.evaluate('//p[', d, null, 0, null), { name: 'SyntaxError' });
  assert.throws(() => d.evaluate('foo()', d, null, 0, null), { name: 'SyntaxError' });
  assert.throws(() => d.evaluate('count()', d, null, 0, null), { name: 'SyntaxError' });
  assert.throws(() => d.evaluate('1', d, null, 42, null), { name: 'NotSupportedError' });
  assert.throws(() => d.evaluate('1', null, null, 0, null), TypeError);
  assert.throws(() => d.evaluate('1', d, null, R.NUMBER_TYPE, null).stringValue, TypeError);
  assert.equal(d.createNSResolver(d.body), d.body);
  // An attribute's parent is its element.
  assert.equal(str('name(..)', d.querySelector('p').parentNode.getAttributeNode('id')), 'div');
  // A detached tree's root is its top node; a fragment is a root.
  const detached = d.createElement('section');
  detached.innerHTML = '<i></i><i></i>';
  assert.equal(d.evaluate('count(//i)', detached, null, R.NUMBER_TYPE, null).numberValue, 2);
  assert.equal(Object.prototype.toString.call(d.evaluate('1', d, null, 0, null)), '[object XPathResult]');
});

test('XPath reports resolver exceptions and treats the prefix as undefined', () => {
  const w = createWindow();
  const errors = [];
  w.addEventListener('error', (e) => { e.preventDefault(); errors.push(e.error.message); });
  assert.throws(() => w.document.evaluate('//x:p', w.document, () => { throw new Error('boom'); }, 0, null), { name: 'NamespaceError' });
  assert.deepEqual(errors, ['boom']);
});

test('the XPath engine loads on first use only', async () => {
  const { createWindow: create, setXPathLoader } = await import('../src/index.js');
  let loads = 0;
  setXPathLoader(() => { loads++; return XPATH; });
  const w = create();
  void w.XPathResult;
  void new w.XPathEvaluator();
  assert.equal(loads, 0);
  w.document.evaluate('1', w.document, null, 1, null);
  w.document.evaluate('2', w.document, null, 1, null);
  assert.equal(loads, 1);
});

const XPATH = await import('../src/xpath.cjs');
