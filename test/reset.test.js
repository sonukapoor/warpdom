import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWindow } from '../src/node.js';
import { resetWindow, snapshotWindow } from '../src/reset.js';
import { S } from '../src/internal.js';

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

test('resetWindow: observers of the kept body and html forget them, and disconnect() still works', () => {
  const w = createWindow();
  snapshotWindow(w);
  const d = w.document;
  const seen = [];
  const onBody = new w.MutationObserver((records) => seen.push(records.length));
  onBody.observe(d.body, { childList: true, subtree: true, attributes: true });
  const onHtml = new w.MutationObserver(() => {});
  onHtml.observe(d.documentElement, { attributes: true });
  d.body.appendChild(d.createElement('p'));
  resetWindow(w);
  // The next file's code disconnects observers a module still holds
  // (naive-ui: @juggle/resize-observer's on the body threw here).
  assert.doesNotThrow(() => {
    onBody.disconnect();
    onHtml.disconnect();
  });
  assert.deepEqual(onBody.takeRecords(), [], 'pending records went with the reset');
  // Observing again works, and the old registration is gone (one record batch, not two).
  onBody.observe(d.body, { childList: true });
  d.body.appendChild(d.createElement('p'));
  assert.equal(onBody.takeRecords().length, 1);
  onBody.disconnect();
  assert.equal(d[S].observerCount, 0, 'the document counts no registrations left');
});

// user-event's setup() puts a clipboard stub on navigator as an own
// accessor (and its cleanup an own undefined value); in a shared worker it
// outlived the reset, and a later file found a navigator.clipboard that a
// fresh window (warpdom's, jsdom's) does not have.
test('resetWindow: own properties added to navigator are gone, the navigator kept', () => {
  const w = createWindow({ url: 'http://localhost:3000/' });
  snapshotWindow(w);
  const navigator = w.navigator;
  const userAgent = navigator.userAgent;
  Object.defineProperty(navigator, 'clipboard', { get: () => ({ writeText() {} }), configurable: true });
  Object.defineProperty(navigator, 'userAgent', { value: 'mocked', configurable: true });
  navigator.custom = 1;
  navigator[Symbol.for('mark')] = true;
  resetWindow(w);
  assert.equal(w.navigator, navigator, 'the same navigator');
  assert.equal(navigator.clipboard, undefined);
  assert.equal('clipboard' in navigator, false);
  assert.equal(navigator.userAgent, userAgent);
  assert.deepEqual(Reflect.ownKeys(navigator), []);

  // A data property (user-event's detach: { value: undefined }), across a
  // second reset.
  Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
  resetWindow(w);
  assert.equal('clipboard' in navigator, false);
});

test('resetWindow: a navigator first used after the snapshot, and one used before it', () => {
  const before = createWindow();
  before.navigator.early = 'kept';
  snapshotWindow(before);
  before.navigator.late = 1;
  resetWindow(before);
  assert.equal(before.navigator.early, 'kept', 'own properties at the snapshot stay');
  assert.equal('late' in before.navigator, false);

  const after = createWindow();
  snapshotWindow(after);
  assert.equal(
    Object.getOwnPropertyDescriptor(after[S].protos, 'Navigator').get !== undefined,
    true,
    'Navigator not created yet',
  );
  Object.defineProperty(after.navigator, 'clipboard', { get: () => ({}), configurable: true });
  resetWindow(after);
  assert.equal('clipboard' in after.navigator, false);
});

test('resetWindow: prototypes of the kept objects are restored, also those created after the snapshot', () => {
  const w = createWindow({ url: 'http://localhost:3000/' });
  snapshotWindow(w);
  const { Navigator, Screen, History, Location } = w;
  const javaEnabled = Navigator.prototype.javaEnabled;
  const width = Object.getOwnPropertyDescriptor(Screen.prototype, 'width');
  Object.defineProperty(Navigator.prototype, 'clipboard', { get: () => ({}), configurable: true });
  Navigator.prototype.javaEnabled = () => true;
  Object.defineProperty(Screen.prototype, 'width', { get: () => 1920, configurable: true });
  History.prototype.pushState = () => 'mocked';
  Location.prototype.extra = 1;
  resetWindow(w);
  assert.equal('clipboard' in w.navigator, false);
  assert.equal(Navigator.prototype.javaEnabled, javaEnabled);
  assert.equal(w.navigator.javaEnabled(), false);
  assert.deepEqual(Object.getOwnPropertyDescriptor(Screen.prototype, 'width'), width);
  assert.equal(w.screen.width, 0);
  assert.notEqual(w.history.pushState({}, ''), 'mocked');
  assert.equal('extra' in w.location, false);
});

test('resetWindow: own properties on location, history, screen, customElements, external and the bars are gone', () => {
  const w = createWindow({ url: 'http://localhost:3000/' });
  snapshotWindow(w);
  const objects = [w.location, w.history, w.screen, w.customElements, w.external, w.menubar, w.toolbar];
  for (const object of objects) {
    object.added = 1;
    Object.defineProperty(object, 'accessor', { get: () => 2, configurable: true });
  }
  Object.defineProperty(w.location, 'href', { value: 'http://mocked/', configurable: true });
  Object.defineProperty(w.screen, 'width', { value: 1920, configurable: true });
  resetWindow(w);
  for (const object of objects) assert.deepEqual(Reflect.ownKeys(object), [], Object.prototype.toString.call(object));
  assert.equal(w.location.href, 'http://localhost:3000/');
  assert.equal(w.screen.width, 0);
  assert.equal(w.location, objects[0], 'the same objects');
  assert.equal(w.history, objects[1]);
  assert.equal(w.screen, objects[2]);
  assert.equal(w.customElements, objects[3]);
});

test('resetWindow: a non-configurable property on a kept object stays without failing the reset', () => {
  const w = createWindow();
  snapshotWindow(w);
  Object.defineProperty(w.navigator, 'frozen', { value: 1, configurable: false });
  w.navigator.other = 2;
  resetWindow(w);
  assert.equal(w.navigator.frozen, 1);
  assert.equal('other' in w.navigator, false);
});

// Before jsdom 22.1.0 onauxclick and onloadend are inert on elements and
// the document (event-handlers.js): undefined until set, and so again after
// the per-file reset.
test('resetWindow forgets inert event handlers (jsdom 20 profile)', () => {
  const w = createWindow({ jsdom: '20.0.3' });
  snapshotWindow(w);
  const d = w.document;
  const f = () => {};
  d.onloadend = f;
  d.onauxclick = f;
  d.documentElement.onloadend = f;
  d.head.onauxclick = f;
  d.body.onauxclick = f;
  resetWindow(w);
  assert.deepEqual(
    [d.onloadend, d.onauxclick, d.documentElement.onloadend, d.head.onauxclick, d.body.onauxclick],
    [undefined, undefined, undefined, undefined, undefined],
  );
});

// A property whose value stays but whose flags change is restored too.
test('resetWindow restores descriptor flags changed without the value', () => {
  for (const jsdom of ['26.1.0', '30.1.3']) {
    const w = createWindow({ jsdom });
    snapshotWindow(w);
    const before = ['innerWidth', 'name', 'status'].map((key) => Object.getOwnPropertyDescriptor(w, key));
    if (jsdom === '26.1.0') Object.defineProperty(w, 'innerWidth', { writable: false });
    else Object.defineProperty(w, 'innerWidth', { enumerable: false });
    Object.defineProperty(w, 'name', { enumerable: false });
    Object.defineProperty(w, 'status', { configurable: true, enumerable: false });
    resetWindow(w);
    assert.deepEqual(
      ['innerWidth', 'name', 'status'].map((key) => Object.getOwnPropertyDescriptor(w, key)),
      before,
      jsdom,
    );
    w.innerWidth = 640;
    assert.equal(w.innerWidth, 640, jsdom);
    // A property made non-configurable stays, without an error.
    Object.defineProperty(w, 'name', { value: '', configurable: false });
    resetWindow(w);
    assert.equal(Object.getOwnPropertyDescriptor(w, 'name').configurable, false);
  }
});

// Before jsdom 27 the viewport members are data properties: a signed zero
// assigned by a test (scrollY = -0, seen through Object.is or 1 / scrollY)
// is a change the reset undoes.
test('resetWindow restores viewport values assigned as -0', () => {
  for (const jsdom of ['20.0.3', '26.1.0', '30.1.3']) {
    const w = createWindow({ jsdom });
    snapshotWindow(w);
    w.scrollY = -0;
    w.pageXOffset = -0;
    assert.equal(Object.is(w.scrollY, -0), true, jsdom);
    resetWindow(w);
    assert.deepEqual([Object.is(w.scrollY, 0), Object.is(w.pageXOffset, 0)], [true, true], jsdom);
  }
});

// The style attribute a style write serialized is not parsed again when
// set to that text (css.js styleAttributeChanged); a reset forgets it.
test('resetWindow: the body style a style write left is forgotten', () => {
  const w = createWindow({ url: 'http://localhost:3000/', jsdom: '28.1.0' });
  snapshotWindow(w);
  const body = w.document.body;
  body.style.color = 'red';
  body.style.setProperty('border', 'var(--b)');
  const written = body.getAttribute('style');
  resetWindow(w);
  body.setAttribute('style', written);
  assert.equal(body.style.cssText, '');
  assert.equal(w.getComputedStyle(body).color, 'rgb(0, 0, 0)');
});

// The frame windows of the iframes a reset discards go with them (#173):
// the window is as fresh as a new one (length 0), the frames' timers stop,
// and the next iframe is frame 0. One in a nested element, and one moved
// out after the reset (its removal from a detached tree runs no hooks).
test('resetWindow discards the frame windows of the document iframes', async () => {
  const w = createWindow({ url: 'http://localhost:3000/' });
  snapshotWindow(w);
  const d = w.document;
  const top = d.body.appendChild(d.createElement('iframe'));
  const nested = d.body.appendChild(d.createElement('div')).appendChild(d.createElement('iframe'));
  const child = top.contentWindow;
  const fired = [];
  child.setTimeout(() => fired.push('timeout'), 5);
  assert.equal(w.length, 2);
  resetWindow(w);
  assert.deepEqual(
    [w.length, w.frames.length, w[0], w[1], top.contentWindow, nested.contentDocument],
    [0, 0, undefined, undefined, null, null],
  );
  const div = d.createElement('div');
  div.append(top);
  top.remove();
  assert.equal(w.length, 0);
  const next = d.body.appendChild(d.createElement('iframe'));
  assert.deepEqual([w.length, w[0] === next.contentWindow, next.contentWindow !== child], [1, true, true]);
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.deepEqual(fired, []);
});

// A frame of an iframe still in the document after the reset stays: one in
// a shadow root of the kept body (the reset keeps the body's shadow root).
test('resetWindow keeps the frame windows of iframes still connected', () => {
  const w = createWindow();
  snapshotWindow(w);
  const d = w.document;
  const body = d.body;
  body.remove();
  const kept = body.attachShadow({ mode: 'open' }).appendChild(d.createElement('iframe'));
  d.documentElement.append(body);
  const gone = body.appendChild(d.createElement('iframe'));
  assert.equal(w.length, 2);
  resetWindow(w);
  assert.deepEqual(
    [kept.isConnected, w.length, w[0] === kept.contentWindow, gone.contentWindow],
    [true, 1, true, null],
  );
  // No frame discarded: the index property stays all the same.
  resetWindow(w);
  assert.deepEqual([w.length, w[0] === kept.contentWindow, w[1]], [1, true, undefined]);
});

// A frame in a discarded frame stops too: its timers never run (jsdom 20
// to 30, black box: an interval in a nested iframe stops when the outer
// iframe is removed). Review on #176. The interval is cleared in any case:
// left running when the reset does not stop it, it kept node --test from
// exiting instead of reporting the failure.
test('resetWindow stops the timers of frames nested in a discarded frame', async () => {
  const w = createWindow();
  snapshotWindow(w);
  const outer = w.document.body.appendChild(w.document.createElement('iframe'));
  const od = outer.contentDocument;
  const inner = od.body.appendChild(od.createElement('iframe')).contentWindow;
  let ticks = 0;
  const interval = inner.setInterval(() => ticks++, 2);
  try {
    resetWindow(w);
    await new Promise((resolve) => setTimeout(resolve, 30));
  } finally {
    inner.clearInterval(interval);
  }
  assert.equal(ticks, 0);
});

// A frame index property the snapshot had (an iframe in the document when
// it was taken) does not outlive its frame (CodeRabbit review on #176).
test('resetWindow drops a frame index property the snapshot had', () => {
  const w = createWindow();
  const iframe = w.document.body.appendChild(w.document.createElement('iframe'));
  snapshotWindow(w);
  iframe.remove();
  resetWindow(w);
  assert.deepEqual([w.length, w[0], '0' in w], [0, undefined, false]);
});

// A test that made a frame index non-configurable does not make the reset
// throw: the property stays, the rest of the reset runs (Copilot review on
// #176).
test('resetWindow with a non-configurable frame index property', () => {
  const w = createWindow();
  snapshotWindow(w);
  w.document.body.appendChild(w.document.createElement('iframe'));
  Object.defineProperty(w, '0', { configurable: false });
  w.document.title = 'changed';
  resetWindow(w);
  assert.deepEqual([w.length, w.document.title], [0, '']);
});
