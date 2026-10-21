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

// navigator.plugins and navigator.mimeTypes, Plugin, MimeType, PluginArray
// and MimeTypeArray (#58, #31, #33, #34, #54): empty legacy collections in
// every jsdom version measured (20.0.3 to 30.1.3).
for (const jsdom of [20, 26, 30]) {
  parity(`navigator.plugins and mimeTypes: empty collections (jsdom ${jsdom})`, (w) => {
    const caught = (f) => { try { return f(); } catch (err) { return err.constructor.name; } };
    const n = w.navigator;
    const shapes = ['Plugin', 'MimeType', 'PluginArray', 'MimeTypeArray'].map((name) => {
      const C = w[name];
      return [name, C.length, Object.getOwnPropertyNames(C.prototype).sort(), caught(() => new C()), Object.prototype.toString.call(C.prototype),
        C.prototype[Symbol.iterator]?.name, typeof C.prototype.item === 'function' ? C.prototype.item.length : null];
    });
    const lists = [['plugins', 'PluginArray'], ['mimeTypes', 'MimeTypeArray']].map(([key, name]) => {
      const list = n[key];
      const strictSet = caught(() => { 'use strict'; list[0] = 'a'; });
      list.expando = 1;
      return [list === n[key], list instanceof w[name], list.length, list.item(0), list.item(-1), list.namedItem('application/pdf'), list[0], 0 in list,
        [...list], Object.keys(list), String(list), JSON.stringify(list), strictSet, caught(() => list.item()), caught(() => list.namedItem())];
    });
    return [shapes, lists, n.plugins.refresh(), 'pdfViewerEnabled' in n, n.javaEnabled(), Object.getOwnPropertyNames(w.Navigator.prototype).includes('plugins'),
      caught(() => { n.plugins = 5; }), n.plugins instanceof w.PluginArray];
  }, { jsdom });
}

// Window member kinds and the prototype chain (#68; black box, every jsdom
// release from 20.0.0 to 30.1.3): document, window and self are own
// accessors (configurable in jsdom 20 only, self replaceable from 21), name
// an own data property, webkitURL an own data property that is not
// enumerable, status and the viewport members own data properties before
// 27 and own accessors from 27 (viewport setters replace them); before
// 24.1.2 Window.prototype inherits from EventTarget.prototype directly.
const VIEWPORT_KEYS = ['innerWidth', 'innerHeight', 'outerWidth', 'outerHeight', 'devicePixelRatio', 'scrollX', 'scrollY', 'pageXOffset',
  'pageYOffset', 'screenX', 'screenY', 'screenLeft', 'screenTop'];
const descriptorOf = (o, key) => {
  const d = Object.getOwnPropertyDescriptor(o, key);
  if (!d) return 'none';
  const flags = `${d.writable ? 'w' : ''}${d.enumerable ? 'e' : ''}${d.configurable ? 'c' : ''}`;
  if ('value' in d) return `data ${typeof d.value === 'object' ? 'object' : typeof d.value === 'function' ? d.value.name : JSON.stringify(d.value)} ${flags}`;
  return `accessor ${d.get?.name ?? '-'}/${d.set?.name ?? '-'} ${flags}`;
};
const windowKindsScenario = (w) => {
  void w.webkitURL; // warpdom makes it on first read, as its interface objects
  const out = ['document', 'window', 'self', 'name', 'status', 'webkitURL', ...VIEWPORT_KEYS].map((key) => `${key}: ${descriptorOf(w, key)}`);
  const get = (key) => Object.getOwnPropertyDescriptor(w, key).get;
  out.push(get('document').call({}) === w.document, get('window').call(undefined) === w, get('self').call({}) === w, w.webkitURL === w.URL);
  if (get('innerWidth')) out.push(get('innerWidth').call({}), get('scrollY').call(undefined));
  return out;
};
const windowAssignmentScenario = (w) => {
  const attempt = (f) => { try { return f(); } catch (e) { return e.constructor.name; } };
  const out = [];
  w.innerWidth = 500;
  out.push(w.innerWidth, descriptorOf(w, 'innerWidth'));
  w.scrollY = '20';
  out.push(w.scrollY);
  // A test's Object.defineProperty with a value only: writable stays as it was.
  Object.defineProperty(w, 'innerHeight', { value: 300 });
  out.push(descriptorOf(w, 'innerHeight'), attempt(() => { w.innerHeight = 400; return w.innerHeight; }));
  // vi.spyOn(window, 'devicePixelRatio', 'get') needs an accessor.
  const ratio = Object.getOwnPropertyDescriptor(w, 'devicePixelRatio');
  out.push(typeof ratio.get);
  if (ratio.get) {
    Object.defineProperty(w, 'devicePixelRatio', { ...ratio, get: () => 2 });
    out.push(w.devicePixelRatio);
    Object.defineProperty(w, 'devicePixelRatio', ratio);
    out.push(w.devicePixelRatio);
  }
  w.name = 5;
  w.status = 6;
  out.push(typeof w.name, typeof w.status, descriptorOf(w, 'name'));
  w.webkitURL = 7;
  out.push(descriptorOf(w, 'webkitURL'));
  out.push(attempt(() => { delete w.outerWidth; return String(w.outerWidth); }));
  return out;
};
const windowChainScenario = (w) => {
  const d = w.document;
  d.body.innerHTML = '<div id="named"></div><form name="f"></form><div id="addEventListener"></div><div id="location"></div><div id="toString"></div>';
  const parent = Object.getPrototypeOf(w.Window.prototype);
  const out = [parent === w.EventTarget.prototype, Object.prototype.toString.call(parent), Object.prototype.toString.call(w.Window.prototype),
    Object.getPrototypeOf(w.EventTarget.prototype) === Object.prototype || Object.getPrototypeOf(w.EventTarget.prototype) === w.Object?.prototype,
    w.Window.prototype.constructor === w.Window, Reflect.ownKeys(w.Window.prototype).includes('constructor')];
  out.push(String(w.named), 'named' in w, String(w.f), typeof w.addEventListener, String(w.location) === w.location.href, typeof w.toString, w.missing, 'missing' in w);
  d.getElementById('named').remove();
  out.push(String(w.named), 'named' in w);
  return out;
};
// Assignments through an object that inherits from the window (#90; black
// box with jsdom 20.0.3, 21.1.2, 22.1.0, 26.1.0, 27.4.0 and 30.1.3, windows
// made with runScripts as the test environments make them). Before 27.0.0
// the derived object gets its own property and the window keeps its
// member, also self (21+); from 27.0.0 the window's own accessors (self,
// status, the viewport members) act on their window whatever this is: the
// derived object gets no property and the window's member is replaced
// (status keeps a string). Data properties (name; status and the viewport
// members before 27; interface objects, Image, console, webkitURL,
// HTMLDocument, WebSocket, which warpdom makes on first read) give the
// derived object its own property in every version. The setters called on
// an object that does not inherit from the window replace the window's
// member, and status's getter reads its window's whatever this is.
// jsdom 20's self has a getter only, and its window (a VM context's global)
// still lets the derived object have its own; warpdom's throws there (not
// covered: jsdom 20 runs without self).
const INHERITED_KEYS = ['self', 'name', 'status', 'innerWidth', 'scrollY', 'devicePixelRatio'];
const LAZY_KEYS = ['console', 'Image', 'Option', 'Audio', 'HTMLCanvasElement', 'MutationObserver', 'webkitURL', 'HTMLDocument', 'WebSocket'];
const sameDescriptor = (a, b) => b !== undefined && ('value' in a ? a.value === b.value : a.get === b.get && a.set === b.set);
const inheritedAssignmentScenario = (keys) => (w) => {
  const attempt = (f) => { try { return f(); } catch (e) { return e.constructor.name; } };
  const out = [];
  const setters = ['self', 'outerHeight', 'status'].map((key) => [key, Object.getOwnPropertyDescriptor(w, key).set]);
  const statusGetter = Object.getOwnPropertyDescriptor(w, 'status').get;
  for (const key of keys) {
    // The descriptor, not w[key]: warpdom makes the lazy members on first
    // read (an accessor until then), and the assignment must reach that
    // accessor's setter. Nothing reads them before this loop.
    const before = Object.getOwnPropertyDescriptor(w, key);
    const derived = Object.create(w);
    const result = attempt(() => { derived[key] = 7; return 'ok'; });
    const own = Object.hasOwn(derived, key) ? descriptorOf(derived, key) : 'none';
    const window = LAZY_KEYS.includes(key) ? (sameDescriptor(before, Object.getOwnPropertyDescriptor(w, key)) ? 'kept' : 'replaced') : descriptorOf(w, key);
    const reads = w[key] === 7 ? '7' : typeof w[key];
    out.push(`${key}: ${result}, own ${own}, window ${window} (reads ${reads}), derived reads ${String(derived[key])}`);
  }
  for (const [key, set] of setters) {
    if (!set) { out.push(`${key}: no setter`); continue; }
    const other = {};
    out.push(`${key} setter on another object: ${attempt(() => { set.call(other, 8); return 'ok'; })} ${Object.hasOwn(other, key)} ${descriptorOf(w, key)}`);
  }
  if (statusGetter) out.push(`status getter: ${JSON.stringify(statusGetter.call({}))}`);
  return out;
};
for (const jsdom of [20, 22, 26, 27, 30]) {
  const keys = [...INHERITED_KEYS, ...LAZY_KEYS].filter((key) => jsdom > 20 || key !== 'self');
  parity(`assignments through an object inheriting from the window (jsdom ${jsdom})`, inheritedAssignmentScenario(keys), { jsdom });
}

test('window: assignments through an object inheriting from the window, per jsdom version', () => {
  // self: getter only before 21; status and innerWidth: data properties before 27.
  const results = {};
  for (const jsdom of ['20.0.3', '21.0.0', '26.1.0', '27.0.0', '30.1.3']) {
    const w = createWindow({ jsdom });
    const out = [];
    for (const key of ['self', 'status', 'innerWidth', 'Image']) {
      const derived = Object.create(w);
      let result = 'ok';
      try { derived[key] = 7; } catch (e) { result = e.constructor.name; }
      out.push(`${key} ${result} ${Object.hasOwn(derived, key) ? 'own' : 'none'} ${w[key] === 7 || w[key] === '7' ? 'replaced' : 'kept'}`);
    }
    results[jsdom] = out.join(', ');
  }
  assert.deepEqual(results, {
    '20.0.3': 'self TypeError none kept, status ok own kept, innerWidth ok own kept, Image ok own kept',
    '21.0.0': 'self ok own kept, status ok own kept, innerWidth ok own kept, Image ok own kept',
    '26.1.0': 'self ok own kept, status ok own kept, innerWidth ok own kept, Image ok own kept',
    '27.0.0': 'self ok none replaced, status ok none replaced, innerWidth ok none replaced, Image ok own kept',
    '30.1.3': 'self ok none replaced, status ok none replaced, innerWidth ok none replaced, Image ok own kept',
  });
});

for (const jsdom of [20, 22, 25, 26, 30]) {
  parity(`window member kinds (jsdom ${jsdom})`, windowKindsScenario, { jsdom });
  parity(`window member assignments (jsdom ${jsdom})`, windowAssignmentScenario, { jsdom });
  parity(`Window prototype chain and named access (jsdom ${jsdom})`, windowChainScenario, { jsdom });
}

test('window member kinds per jsdom version: boundaries 21.0.0, 24.1.2 and 27.0.0', () => {
  const kinds = (jsdom) => {
    const w = createWindow({ jsdom });
    const parent = Object.getPrototypeOf(w.Window.prototype);
    return [descriptorOf(w, 'document'), descriptorOf(w, 'self'), descriptorOf(w, 'innerWidth'), descriptorOf(w, 'status'),
      parent === w.EventTarget.prototype ? 'EventTarget' : Object.prototype.toString.call(parent)];
  };
  const legacy = ['accessor get document/- ec', 'accessor get self/- ec', 'data 1024 wec', 'data "" wec'];
  const data = ['accessor get document/- e', 'accessor get self/set self ec', 'data 1024 wec', 'data "" wec'];
  const accessors = ['accessor get document/- e', 'accessor get self/set self ec', 'accessor get innerWidth/set innerWidth ec', 'accessor get status/set status ec'];
  assert.deepEqual(kinds('20.0.3'), [...legacy, 'EventTarget']);
  assert.deepEqual(kinds('21.0.0'), [...data, 'EventTarget']);
  assert.deepEqual(kinds('24.1.1'), [...data, 'EventTarget']);
  assert.deepEqual(kinds('24.1.2'), [...data, '[object WindowProperties]']);
  assert.deepEqual(kinds('26.1.0'), [...data, '[object WindowProperties]']);
  assert.deepEqual(kinds('27.0.0'), [...accessors, '[object WindowProperties]']);
  assert.deepEqual(kinds('30.1.3'), [...accessors, '[object WindowProperties]']);
});

test('window: self is replaceable from jsdom 21, document and window are not, in strict code', () => {
  for (const jsdom of ['21.0.0', '30.1.3']) {
    const w = createWindow({ jsdom });
    const document = w.document;
    assert.throws(() => { w.document = {}; }, TypeError);
    assert.throws(() => { w.window = {}; }, TypeError);
    assert.throws(() => { delete w.document; }, TypeError);
    assert.equal(w.document, document);
    w.self = 7;
    assert.equal(descriptorOf(w, 'self'), 'data 7 wec');
  }
  const w = createWindow({ jsdom: '20.0.3' });
  assert.throws(() => { w.self = 7; }, TypeError);
  delete w.document;
  assert.equal(w.document, undefined);
});

test('window: the per-file reset puts back the viewport, name and status', async () => {
  const { snapshotWindow, resetWindow } = await import('../src/reset.js');
  for (const jsdom of ['26.1.0', '30.1.3']) {
    const w = createWindow({ jsdom });
    snapshotWindow(w);
    w.innerWidth = 500;
    w.name = 'x';
    w.status = 'y';
    Object.defineProperty(w, 'innerHeight', { value: 1, configurable: true });
    resetWindow(w);
    assert.deepEqual([w.innerWidth, w.innerHeight, w.name, w.status], [1024, 768, '', ''], jsdom);
  }
});
