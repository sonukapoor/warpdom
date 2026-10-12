import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWindow } from '../src/node.js';
import { resetWindow, snapshotWindow } from '../src/reset.js';

test('resetWindow returns a window to a fresh state, keeping its objects', () => {
  const w = createWindow({ url: 'http://localhost:3000/' });
  snapshotWindow(w);
  const d = w.document;
  const HTMLElementBefore = w.HTMLElement;
  class XKept extends w.HTMLElement {}
  w.customElements.define('x-kept', XKept);

  d.body.innerHTML = '<input id="i"><x-kept id="k"></x-kept>';
  d.getElementById('i').focus();
  d.title = 'old';
  const log = [];
  w.addEventListener('resize', () => log.push('window listener'));
  d.addEventListener('click', () => log.push('document listener'));
  d.onclick = () => log.push('document handler');
  w.onresize = () => log.push('window handler');
  w.history.pushState({}, '', '/elsewhere');
  w.innerWidth = 500;
  w.myGlobal = 1;
  w.scrollTo = () => 'mocked';
  const observed = [];
  new w.MutationObserver((records) => observed.push(records.length)).observe(d, { childList: true, subtree: true });
  w.getSelection().collapse(d.body, 0);
  const oldBody = d.body;
  d.body.setAttribute('style', 'pointer-events: none');
  d.body.addEventListener('click', () => log.push('body listener'));
  const MARK = Symbol('set up');
  d[MARK] = true;
  d.__reactListening = true;

  d.cookie = 'kept=no; path=/';
  resetWindow(w);
  assert.equal(d.cookie, '', 'cookies cleared');

  assert.equal(w.document, d, 'same document object');
  assert.equal(w.HTMLElement, HTMLElementBefore, 'same interface objects');
  assert.equal(w.customElements.get('x-kept'), XKept, 'definitions kept');
  assert.equal(d.documentElement.outerHTML, '<html><head></head><body></body></html>');
  assert.equal(d.doctype.name, 'html');
  assert.equal(d.body, oldBody, 'the same body element, emptied');
  assert.equal(d.body.attributes.length, 0);
  assert.equal(d.getElementById('i'), null);
  assert.equal(d.activeElement, d.body);
  assert.equal(d.title, '');
  assert.equal(w.location.href, 'http://localhost:3000/');
  assert.equal(w.history.length, 1);
  assert.equal(w.innerWidth, 1024);
  assert.equal('myGlobal' in w, false);
  assert.equal(d[MARK], undefined, 'marks on the document are gone');
  assert.equal(d.__reactListening, undefined);
  assert.equal(typeof w.scrollTo, 'function');
  assert.notEqual(w.scrollTo(), 'mocked');
  assert.equal(w.getSelection().rangeCount, 0);
  w.dispatchEvent(new w.Event('resize'));
  d.dispatchEvent(new w.Event('click'));
  d.body.dispatchEvent(new w.Event('click'));
  assert.deepEqual(log, [], 'listeners and handlers are gone');
  assert.equal(w.onresize, null);

  d.body.innerHTML = '<x-kept></x-kept>';
  assert.ok(d.body.firstChild instanceof XKept, 'defined elements still upgrade');
  d.body.appendChild(d.createElement('p'));
  return Promise.resolve().then(() => assert.deepEqual(observed, [], 'observers of the old document are gone'));
});

test('resetWindow forgets document named properties', () => {
  const w = createWindow();
  snapshotWindow(w);
  const d = w.document;
  d.body.innerHTML = '<form name="login"></form><img name="logo">';
  assert.equal(d.login.tagName, 'FORM');
  resetWindow(w);
  assert.equal('login' in d, false);
  assert.equal('logo' in d, false);
  d.body.innerHTML = '<form name="login"></form>';
  assert.equal(d.login.tagName, 'FORM');
  d.body.innerHTML = '';
  assert.equal('login' in d, false);
});
