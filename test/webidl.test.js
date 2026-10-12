// WebIDL details tests and WPT's idlharness observe: required argument
// counts, constructor and operation lengths, accessor names, brand checks,
// and [LegacyUnforgeable] isTrusted.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWindow } from '../src/index.js';
import { parity } from './parity.js';

// Calls each case and records the error name, or 'ok'.
const outcomes = (cases) => cases.map((f) => { try { f(); return 'ok'; } catch (e) { return e.name; } });

parity('operations called with too few arguments throw a TypeError', (w) => {
  const d = w.document;
  const el = d.createElement('div');
  const text = d.createTextNode('abc');
  const range = d.createRange();
  const xml = d.implementation.createDocument(null, null);
  return outcomes([
    () => el.getAttribute(), () => el.setAttribute('a'), () => el.hasAttribute(), () => el.removeAttribute(),
    () => el.toggleAttribute(), () => el.getAttributeNS(null), () => el.setAttributeNS(null, 'a'),
    () => el.matches(), () => el.closest(), () => el.querySelector(), () => el.querySelectorAll(),
    () => el.getElementsByTagName(), () => el.getElementsByClassName(), () => el.insertAdjacentText('beforeend'),
    () => el.addEventListener('x'), () => el.removeEventListener('x'), () => el.contains(), () => el.isSameNode(),
    () => el.isEqualNode(), () => el.lookupPrefix(), () => el.classList.contains(), () => el.classList.toggle(),
    () => el.classList.replace('a'), () => el.children.item(), () => el.childNodes.item(),
    () => d.createElement(), () => d.createElementNS(null), () => d.createTextNode(), () => d.createComment(),
    () => d.createEvent(), () => d.getElementById(), () => d.createAttribute(), () => d.createExpression(),
    () => xml.createProcessingInstruction('a'), () => xml.createCDATASection(),
    () => d.implementation.createDocumentType('a', ''),
    () => text.insertData(0), () => text.deleteData(0), () => text.replaceData(0, 0), () => text.splitText(),
    () => range.setStart(d.body), () => range.setEnd(d.body), () => range.comparePoint(d.body), () => range.isPointInRange(d.body),
    () => new w.Event('x').initEvent(), () => new w.CustomEvent('x').initCustomEvent(),
    // Explicit undefined is an argument.
    () => el.setAttribute('a', undefined), () => el.getAttribute(undefined), () => el.contains(undefined),
    () => el.addEventListener('x', undefined),
  ]);
});

parity('constructor and operation lengths', (w) => [
  w.Event.length, w.CustomEvent.length, w.MouseEvent.length, w.KeyboardEvent.length, w.MutationObserver.length,
  w.StaticRange.length, w.EventTarget.length, w.Range.length, w.Text.length,
  w.EventTarget.prototype.addEventListener.length, w.EventTarget.prototype.removeEventListener.length,
  w.Document.prototype.createElement.length, w.Document.prototype.createElementNS.length,
]);

// Deliberate deviation (PLAN.md): isTrusted is an accessor on
// Event.prototype, not an own accessor of every event as [LegacyUnforgeable]
// requires (and jsdom has): defining it per event made new Event 2.3x
// slower (42 -> 96 ns). Only interface-shape checks can tell.
test('isTrusted is a prototype accessor (deliberate deviation)', () => {
  const w = createWindow();
  const e = new w.Event('x');
  assert.equal(Object.getOwnPropertyDescriptor(e, 'isTrusted'), undefined);
  assert.equal(Object.getOwnPropertyDescriptor(new w.MouseEvent('y'), 'isTrusted'), undefined);
  assert.equal(typeof Object.getOwnPropertyDescriptor(w.Event.prototype, 'isTrusted').get, 'function');
  assert.equal(e.isTrusted, false);
});

test('@@iterator is not enumerable', () => {
  const w = createWindow();
  const getter = (proto, key) => Object.getOwnPropertyDescriptor(proto, key);
  assert.equal(getter(w.NodeList.prototype, Symbol.iterator).enumerable, false);
  assert.equal(getter(w.DOMTokenList.prototype, Symbol.iterator).enumerable, false);
});

parity('brand checks on members that ignored this', (w) => {
  const d = w.document;
  return outcomes([
    () => w.Node.prototype.contains.call(null, null),
    () => w.Node.prototype.isSameNode.call({}, null),
    () => w.DOMImplementation.prototype.hasFeature.call(null),
    () => Object.getOwnPropertyDescriptor(w.Event.prototype, 'cancelBubble').set.call({}, true),
    () => Object.getOwnPropertyDescriptor(w.Document.prototype, 'documentURI').get.call({}),
    () => w.DOMTokenList.prototype.toString.call({}),
    () => w.EventTarget.prototype.addEventListener.call({}, 'x', () => {}),
    () => d.body.contains(null),
  ]);
});
