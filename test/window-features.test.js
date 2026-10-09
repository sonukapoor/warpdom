import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWindow } from '../src/index.js';

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
