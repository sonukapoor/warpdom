// Internal state is invisible to reflection on objects other than nodes:
// Jest's and Vitest's deep equality and pretty-format walk own enumerable
// symbol keys (react-router's tests compare loader arguments that hold an
// AbortSignal, and snapshot FormData).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inspect, types } from 'node:util';
import { createWindow } from '../src/node.js';
import { parity } from './parity.js';

const enumerableSymbols = (o) => Object.getOwnPropertySymbols(o).filter((k) => Object.getOwnPropertyDescriptor(o, k).enumerable);

function objects(w) {
  const d = w.document;
  d.body.innerHTML = '<div id=a style="color: red" data-x=1><span>t</span><form><input name=n value=1></form></div><style>a { color: red } @media screen { b { color: blue } }</style>';
  const div = d.getElementById('a');
  const sheet = d.querySelector('style').sheet;
  const mo = new w.MutationObserver(() => {});
  mo.observe(div, { attributes: true });
  div.setAttribute('q', '1');
  class Emitter extends w.EventTarget {}
  return {
    event: new w.Event('x'), mouse: new w.MouseEvent('click', { clientX: 1 }), custom: new w.CustomEvent('c', { detail: 1 }),
    keyboard: new w.KeyboardEvent('keydown', { key: 'a' }), created: d.createEvent('Event'), formData: new w.FormData(d.querySelector('form')),
    controller: new w.AbortController(), signal: new w.AbortController().signal, timeout: w.AbortSignal.timeout(1000), eventTarget: new w.EventTarget(),
    emitter: new Emitter(), style: div.style, computed: w.getComputedStyle(div), range: d.createRange(), selection: w.getSelection(),
    walker: d.createTreeWalker(div), iterator: d.createNodeIterator(div), rect: div.getBoundingClientRect(), domRect: new w.DOMRect(1, 2, 3, 4),
    validity: d.querySelector('input').validity, history: w.history, location: w.location, navigator: w.navigator, plugins: w.navigator.plugins, mimeTypes: w.navigator.mimeTypes, screen: w.screen,
    customElements: w.customElements, implementation: d.implementation, sheet, rule: sheet.cssRules[0], ruleStyle: sheet.cssRules[0].style,
    record: mo.takeRecords()[0], parser: new w.DOMParser(), serializer: new w.XMLSerializer(), reader: new w.FileReader(),
    xpath: d.evaluate('//div', d, null, 0, null), staticRange: new w.StaticRange({ startContainer: div, startOffset: 0, endContainer: div, endOffset: 0 }),
    classList: div.classList, dataset: div.dataset, attributes: div.attributes, childNodes: div.childNodes, children: div.children, localStorage: w.localStorage,
  };
}

test('objects other than nodes have no enumerable own symbol keys', () => {
  const w = createWindow({ url: 'http://localhost/' });
  for (const [name, o] of Object.entries(objects(w))) {
    assert.deepEqual(enumerableSymbols(o), [], name);
    // util.inspect looks through proxies (lists, dataset, storage) at the target.
    if (!types.isProxy(o)) assert.ok(!inspect(o, { depth: 0 }).includes('Symbol(warpdom)'), name);
  }
});

test('hidden state still works: equal objects are deepStrictEqual, as on jsdom', () => {
  const w = createWindow({ url: 'http://localhost/' });
  const a = new w.AbortController().signal;
  const b = new w.AbortController().signal;
  a.addEventListener('abort', () => {});
  assert.deepStrictEqual(a, b);
  const f = new w.FormData();
  f.append('key', 'value');
  assert.deepStrictEqual(f, new w.FormData());
  assert.deepEqual([...f], [['key', 'value']]);
  const c = new w.AbortController();
  let aborted = 0;
  c.signal.addEventListener('abort', () => aborted++);
  c.abort();
  assert.equal(aborted, 1);
  assert.equal(c.signal.aborted, true);
  assert.equal(new w.DOMRect(1, 2, 3, 4).right, 4);
});

test('event and style members still check their this value', () => {
  const w = createWindow();
  const type = Object.getOwnPropertyDescriptor(w.Event.prototype, 'type').get;
  assert.throws(() => type.call({}), TypeError);
  assert.throws(() => type.call(w.document.body), TypeError);
  assert.throws(() => w.CSSStyleDeclaration.prototype.getPropertyValue.call({}, 'color'), TypeError);
  assert.throws(() => Object.getOwnPropertyDescriptor(w.DOMRectReadOnly.prototype, 'x').get.call({}), TypeError);
  assert.throws(() => w.document.body.dispatchEvent({ type: 'x' }), TypeError);
  // A subclass constructed through super() gets the state.
  class MyEvent extends w.Event { constructor() { super('mine', { bubbles: true }); } }
  const e = new MyEvent();
  assert.equal(e.type, 'mine');
  assert.equal(e.bubbles, true);
  let seen = null;
  w.document.body.addEventListener('mine', (ev) => { seen = ev.target; });
  w.document.body.dispatchEvent(e);
  assert.equal(seen, w.document.body);
});

parity('own keys of FormData, AbortSignal, events and DOMRect', (w) => {
  const keys = (o) => Reflect.ownKeys(o).filter((k) => k !== 'isTrusted').map(String);
  const f = new w.FormData();
  f.append('a', 'b');
  const signal = new w.AbortController().signal;
  signal.addEventListener('abort', () => {});
  return [keys(f), keys(signal), keys(new w.MouseEvent('click')), keys(new w.DOMRect(1, 2, 3, 4)), keys(w.history), keys(w.document.createRange())];
});
