import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWindow } from '../src/index.js';
import { parity } from './parity.js';

test('requestAnimationFrame runs callbacks with a timestamp; cancelAnimationFrame stops them', async () => {
  const w = createWindow();
  const stamps = [];
  w.requestAnimationFrame((t) => stamps.push(t));
  const cancelled = w.requestAnimationFrame(() => stamps.push('cancelled'));
  w.cancelAnimationFrame(cancelled);
  await new Promise((r) => setTimeout(r, 40));
  assert.equal(stamps.length, 1);
  assert.equal(typeof stamps[0], 'number');
});

test('viewport and scrolling, as in jsdom', () => {
  const w = createWindow();
  assert.deepEqual([w.innerWidth, w.innerHeight, w.outerWidth, w.outerHeight], [1024, 768, 1024, 768]);
  assert.equal(w.devicePixelRatio, 1);
  assert.deepEqual([w.scrollX, w.scrollY, w.pageXOffset, w.pageYOffset], [0, 0, 0, 0]);
  w.scrollTo(0, 100);
  w.scroll(0, 100);
  w.scrollBy(0, 10);
  w.document.createElement('div').scrollIntoView;
});

test('navigator', () => {
  const w = createWindow();
  assert.ok(w.navigator instanceof w.Navigator);
  assert.match(w.navigator.userAgent, /warpdom/);
  // Libraries detect a DOM without layout by this token, with or without
  // the slash (MUI: "jsdom"; floating-ui: "jsdom/").
  assert.match(w.navigator.userAgent, /jsdom\//);
  assert.equal(w.navigator.language, 'en-US');
  assert.deepEqual([...w.navigator.languages], ['en-US', 'en']);
  assert.equal(w.navigator.onLine, true);
  assert.equal(w.navigator.cookieEnabled, true);
});

test('location and history', () => {
  const blank = createWindow();
  assert.equal(blank.location.href, 'about:blank');
  const w = createWindow({ url: 'http://localhost:3000/app?q=1#top' });
  const { location, history } = w;
  assert.ok(location instanceof w.Location && history instanceof w.History);
  assert.deepEqual(
    [location.protocol, location.host, location.hostname, location.port, location.pathname, location.search, location.hash, location.origin],
    ['http:', 'localhost:3000', 'localhost', '3000', '/app', '?q=1', '#top', 'http://localhost:3000'],
  );
  assert.equal(w.document.location, location);
  assert.equal(w.document.URL, 'http://localhost:3000/app?q=1#top');
  history.pushState({ step: 1 }, '', '/next?x=2');
  assert.equal(location.href, 'http://localhost:3000/next?x=2');
  assert.deepEqual(history.state, { step: 1 });
  assert.equal(history.length, 2);
  history.replaceState(null, '', '#hash');
  assert.equal(location.href, 'http://localhost:3000/next?x=2#hash');
  location.hash = 'other';
  assert.equal(location.hash, '#other');
  assert.equal(String(location), location.href);
});

test('Image, Audio and Option constructors', () => {
  const w = createWindow();
  const img = new w.Image(10, 20);
  assert.ok(img instanceof w.HTMLImageElement);
  assert.deepEqual([img.getAttribute('width'), img.getAttribute('height')], ['10', '20']);
  assert.ok(new w.Audio() instanceof w.HTMLAudioElement);
  const option = new w.Option('Label', 'value');
  assert.ok(option instanceof w.HTMLOptionElement);
  assert.equal(option.textContent, 'Label');
  assert.equal(option.getAttribute('value'), 'value');
});

test('insertAdjacentElement and insertAdjacentText', () => {
  const { document } = createWindow();
  const parent = document.body.appendChild(document.createElement('div'));
  const el = parent.appendChild(document.createElement('p'));
  const make = (tag) => document.createElement(tag);
  const before = el.insertAdjacentElement('beforebegin', make('a'));
  el.insertAdjacentElement('afterbegin', make('b'));
  el.insertAdjacentElement('beforeend', make('i'));
  el.insertAdjacentElement('afterend', make('u'));
  assert.equal(before.tagName, 'A');
  assert.deepEqual([...parent.children].map((c) => c.tagName), ['A', 'P', 'U']);
  assert.deepEqual([...el.children].map((c) => c.tagName), ['B', 'I']);
  el.insertAdjacentText('beforeend', '!');
  assert.equal(el.lastChild.nodeValue, '!');
  assert.throws(() => el.insertAdjacentElement('nowhere', make('s')), { name: 'SyntaxError' });
});

// Page visibility: as jsdom with pretendToBeVisual (test environments).
parity('document visibility', (w) => {
  const d = w.document;
  const iframe = d.createElement('iframe');
  d.body.append(iframe);
  return [d.visibilityState, d.hidden, iframe.contentDocument.visibilityState, iframe.contentDocument.hidden, 'onvisibilitychange' in d, 'onvisibilitychange' in d.body];
});

// Deviations: jsdom gives documents without a browsing context the old
// 'prerender' state (the standard's states are 'visible' and 'hidden'),
// and does not run document.onvisibilitychange.
test('document visibility without a browsing context; onvisibilitychange', () => {
  const w = createWindow({ url: 'http://localhost:3000/' });
  const created = w.document.implementation.createHTMLDocument('');
  let calls = 0;
  w.document.onvisibilitychange = () => calls++;
  w.document.dispatchEvent(new w.Event('visibilitychange'));
  assert.deepEqual([created.visibilityState, created.hidden, calls], ['hidden', true, 1]);
});

// Small Window members jsdom has (react-aria's tests read the global close).
parity('window: close, stop, bars, name, status, origin, external, webkitURL', (w) => {
  const bars = ['locationbar', 'menubar', 'personalbar', 'scrollbars', 'statusbar', 'toolbar'].map((b) => [Object.prototype.toString.call(w[b]), w[b].visible, w[b] === w[b]]);
  const before = [w.name, w.status, w.origin, typeof w.close, w.close(), w.stop(), w.captureEvents(), w.releaseEvents(), w.closed];
  w.name = 'n';
  w.status = 's';
  const external = [Object.prototype.toString.call(w.external), w.external.AddSearchProvider(), w.external.IsSearchProviderInstalled(), w.external === w.external];
  w.origin = 'replaced';
  return [bars, before, w.name, w.status, external, w.origin, w.webkitURL === w.URL || w.webkitURL === URL, w.document.body.innerHTML === ''];
});

parity('legacy and document-only event handlers', (w) => {
  const d = w.document;
  const el = d.createElement('div');
  const names = ['onwebkitanimationend', 'onwebkitanimationiteration', 'onwebkitanimationstart', 'onwebkittransitionend', 'onanimationend', 'ontransitionend'];
  return [names.map((n) => [n in w, n in d, n in el]), 'onreadystatechange' in d, 'onreadystatechange' in el, typeof w.InputEvent.prototype.getTargetRanges];
});

// An exception in a queueMicrotask callback becomes an error event.
parity('queueMicrotask reports exceptions', async (w) => {
  const seen = [];
  w.addEventListener('error', (e) => { seen.push([e.constructor.name, e.message, e.error?.message, e.cancelable]); e.preventDefault(); });
  w.queueMicrotask(() => { throw new Error('boom'); });
  let typeError;
  try { w.queueMicrotask(42); } catch (e) { typeError = e.name; }
  await new Promise((resolve) => setTimeout(resolve, 10));
  return [seen, typeError];
});

// jsdom 25 and 26 print the error's stack: compared on jsdom 30, and the
// words of jsdom 20 to 26 checked below.
for (const jsdom of [30]) {
  parity(`"Not implemented" reports in the version's words (jsdom ${jsdom})`, (w) => {
    w.document.body.innerHTML = '<form></form><canvas></canvas><video></video>';
    w.alert('x');
    w.scrollTo(0, 0);
    try { w.document.querySelector('form').submit(); } catch { /* reported */ }
    w.document.querySelector('canvas').getContext('2d');
    w.document.querySelector('video').pause();
    return null;
  }, { jsdom });
}

test('"Not implemented" reports in jsdom 20 to 26\'s words', () => {
  const messages = [];
  const original = console.error;
  console.error = (m) => messages.push(m);
  try {
    const w = createWindow({ jsdom: 26 });
    w.document.body.innerHTML = '<form></form><canvas></canvas><video></video>';
    w.alert('x');
    w.document.querySelector('form').submit();
    w.document.querySelector('canvas').getContext('2d');
    w.document.querySelector('video').pause();
  } finally {
    console.error = original;
  }
  assert.deepEqual(messages, ['Not implemented: window.alert', 'Not implemented: HTMLFormElement.prototype.submit',
    'Not implemented: HTMLCanvasElement.prototype.getContext (without installing the canvas npm package)', 'Not implemented: HTMLMediaElement.prototype.pause']);
});
