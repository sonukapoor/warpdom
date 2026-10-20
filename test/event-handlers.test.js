// Event handler IDL and content attributes, checked against jsdom.
import { parity, html } from './parity.js';

parity('IDL attributes: values, order among listeners, return false', (w) => {
  const d = html(w, '<button id="b">b</button><a id="a" href="#x">a</a>');
  const b = d.getElementById('b');
  const log = [];
  const out = [b.onclick, 'onclick' in b, 'oninput' in d, 'oninput' in w, 'onload' in w, 'onhashchange' in d.body, 'onhashchange' in b];
  b.addEventListener('click', () => log.push('one'));
  b.onclick = () => log.push('two (handler)');
  b.addEventListener('click', () => log.push('three'));
  b.onclick = function () { log.push(`replaced, this is button: ${this === b}`); };
  b.click();
  out.push(log.splice(0), typeof b.onclick);
  b.onclick = 'not a function';
  out.push(b.onclick);
  b.onclick = () => false;
  const event = new w.MouseEvent('click', { cancelable: true });
  b.dispatchEvent(event);
  out.push(event.defaultPrevented);
  b.onclick = () => true;
  const event2 = new w.MouseEvent('click', { cancelable: true });
  b.dispatchEvent(event2);
  out.push(event2.defaultPrevented);
  return out;
});

parity('content attributes compile with element, form and document scope', (w) => {
  const d = html(w, '<form id="f" name="theForm"><input id="i" name="field" onclick="window.__log.push([this.id, id, name, form.id, event.type, typeof getElementById])"></form><div id="x" onclick="return false"></div>');
  w.__log = [];
  d.getElementById('i').click();
  const div = d.getElementById('x');
  // (JSON: jsdom compiles handlers in another realm, whose arrays differ in prototype)
  const out = [JSON.stringify(w.__log), typeof div.onclick, div.onclick.name];
  const event = new w.MouseEvent('click', { cancelable: true });
  div.dispatchEvent(event);
  out.push(event.defaultPrevented);
  div.setAttribute('onclick', 'window.__log.push("updated")');
  div.click();
  div.removeAttribute('onclick');
  div.click();
  out.push(JSON.stringify(w.__log.slice(1)), div.onclick);
  const made = d.createElement('span');
  made.setAttribute('onmouseover', 'window.__log.push("made")');
  made.dispatchEvent(new w.MouseEvent('mouseover'));
  const copy = made.cloneNode();
  copy.dispatchEvent(new w.MouseEvent('mouseover'));
  out.push(JSON.stringify(w.__log.slice(-2)));
  return out;
});

parity('body forwards window handlers; window onerror', (w) => {
  const d = w.document;
  const log = [];
  d.body.onresize = () => log.push('resize on window');
  w.dispatchEvent(new w.Event('resize'));
  const out = [w.onresize === d.body.onresize, log.splice(0)];
  w.onerror = (message, source, lineno, colno, error) => { log.push([message, source, lineno, colno, error?.message]); return true; };
  const event = new w.ErrorEvent('error', { message: 'boom', filename: 'f.js', lineno: 3, colno: 4, error: new Error('e'), cancelable: true });
  w.dispatchEvent(event);
  out.push(log.splice(0), event.defaultPrevented);
  w.onerror = null;
  return out;
});

parity('React-style feature detection', (w) => {
  const d = w.document;
  const div = d.createElement('div');
  div.setAttribute('oninput', 'return;');
  return ['oninput' in d, typeof div.oninput, 'onfocusin' in d, 'onpointerdown' in d, 'onanimationend' in d, 'ontouchstart' in d];
});

// Following the standard where jsdom differs: a handler set again after
// being set to null is registered anew, after the listeners added since.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWindow } from '../src/node.js';

test('a re-activated event handler runs after later listeners', () => {
  const w = createWindow();
  const b = w.document.body.appendChild(w.document.createElement('button'));
  const log = [];
  b.addEventListener('click', () => log.push('ONE'));
  b.setAttribute('onclick', 'this.log.push("NOT CALLED")');
  b.addEventListener('click', () => log.push('TWO'));
  b.onclick = null;
  b.addEventListener('click', () => log.push('THREE'));
  b.onclick = () => log.push('FOUR');
  b.addEventListener('click', () => log.push('FIVE'));
  b.click();
  assert.deepEqual(log, ['ONE', 'TWO', 'THREE', 'FOUR', 'FIVE']);
});

// The event handlers each jsdom version has (#77; black box, every release
// from 20.0.0 to 30.1.3): before 22.1.0, 19 fewer on HTMLElement,
// SVGElement and Document (oncopy, ontouchstart, ...), and on the window
// onauxclick too; before 27.0.0 no pointer event handlers. Their content
// attributes do nothing then either.
const handlerNames = (o) => {
  const names = new Set();
  for (let p = o; p && p !== Object.prototype; p = Object.getPrototypeOf(p)) {
    for (const key of Object.getOwnPropertyNames(p)) if (key.startsWith('on')) names.add(key);
  }
  return [...names].sort();
};
// Handlers of #67 (onloadend before 22.1.0; the window's onautocomplete,
// onautocompleteerror and onsort before 27.0.0) are checked with that issue.
const LATER = new Set(['onloadend', 'onautocomplete', 'onautocompleteerror', 'onsort']);
const handlerSetsScenario = (w) => {
  const d = w.document;
  const names = (o) => handlerNames(o).filter((name) => !LATER.has(name));
  return [names(d.createElement('div')), names(d.body), names(d.createElementNS('http://www.w3.org/2000/svg', 'rect')), names(d), names(w)];
};
const handlerAttributesScenario = (w) => {
  const d = w.document;
  const ran = [];
  w.ran = ran;
  d.body.innerHTML = '<div id="a" onclick="ran.push(\'click\')" oncopy="ran.push(\'copy\')" ontouchstart="ran.push(\'touchstart\')" '
    + 'onpointerdown="ran.push(\'pointerdown\')" onauxclick="ran.push(\'auxclick\')"></div>';
  const a = d.getElementById('a');
  const b = d.createElement('p');
  b.setAttribute('onpaste', 'ran.push("paste")');
  for (const type of ['click', 'copy', 'touchstart', 'pointerdown', 'auxclick']) a.dispatchEvent(new w.Event(type));
  b.dispatchEvent(new w.Event('paste'));
  const out = [ran.splice(0), typeof b.onpaste, String(a.oncopy), String(a.onauxclick)];
  // jsdom before 22.1.0: onauxclick keeps what is assigned and is never called.
  const values = [];
  for (const value of [() => ran.push('auxclick handler'), 'text', null, { handleEvent() {} }, 5]) {
    a.onauxclick = value;
    values.push(a.onauxclick === value ? 'same' : String(a.onauxclick));
  }
  a.onauxclick = () => ran.push('auxclick handler');
  a.dispatchEvent(new w.Event('auxclick'));
  out.push(values, ran, typeof a.onauxclick, 'onauxclick' in w);
  return out;
};
for (const jsdom of [20, 22, 26, 30]) {
  parity(`event handlers of jsdom ${jsdom}: names`, handlerSetsScenario, { jsdom });
  parity(`event handlers of jsdom ${jsdom}: content attributes`, handlerAttributesScenario, { jsdom });
}

test('event handlers per jsdom version: boundaries 22.1.0 and 27.0.0', () => {
  const count = (version) => {
    const w = createWindow({ jsdom: version });
    const d = w.document;
    const names = (o) => handlerNames(o).filter((name) => !LATER.has(name));
    const div = d.createElement('div');
    return [names(div).length, names(d.createElementNS('http://www.w3.org/2000/svg', 'g')).length, names(d).length, names(w).length,
      'oncopy' in div, 'onauxclick' in div, 'onauxclick' in w, 'onpointerdown' in div];
  };
  assert.deepEqual(count('20.0.0'), [60, 60, 62, 75, false, true, false, false]);
  assert.deepEqual(count('22.0.0'), [60, 60, 62, 75, false, true, false, false]);
  assert.deepEqual(count('22.1.0'), [79, 79, 81, 95, true, true, true, false]);
  assert.deepEqual(count('26.1.0'), [79, 79, 81, 95, true, true, true, false]);
  assert.deepEqual(count('27.0.0'), [90, 90, 92, 106, true, true, true, true]);
  assert.deepEqual(count('30.1.3'), [90, 90, 92, 106, true, true, true, true]);
});
