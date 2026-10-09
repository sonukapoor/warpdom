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
