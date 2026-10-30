import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWindow } from '../src/node.js';
import { parity } from './parity.js';

const tick = () => new Promise((resolve) => setTimeout(resolve, 20));

parity('iframes: nested windows and documents', async (w) => {
  const d = w.document;
  const f = d.createElement('iframe');
  const log = [];
  f.addEventListener('load', () => log.push('load'));
  const before = [f.contentWindow, f.contentDocument];
  d.body.append(f);
  const cw = f.contentWindow;
  const cd = f.contentDocument;
  const out = {
    before,
    doc: [cd.URL, cd.doctype, cd.documentElement.outerHTML, cd.contentType, cd.defaultView === cw, cw.document === cd],
    tree: [
      cw.parent === w,
      cw.top === w,
      cw.frameElement === f,
      w.frames[0] === cw,
      w.length,
      w[0] === cw,
      w.frameElement,
      w.parent === w,
      w.top === w,
    ],
    realm: [
      cw.PointerEvent === w.PointerEvent,
      cd.createElement('div') instanceof w.HTMLElement,
      cd.createElement('div') instanceof cw.HTMLElement,
      cw.location.href,
    ],
  };
  const button = cd.body.appendChild(cd.createElement('button'));
  button.focus();
  out.focus = [cd.activeElement === button, d.activeElement === f, d.hasFocus(), cd.hasFocus()];
  const withSrc = d.createElement('iframe');
  withSrc.src = '/other';
  d.body.append(withSrc);
  out.src = [withSrc.contentDocument.URL, withSrc.contentWindow.location.href, w.length];
  await tick();
  out.load = log;
  return out;
});

// Deliberate deviation: jsdom keeps contentWindow and contentDocument after
// the iframe is removed; the standard's are null once its window is gone.
test('iframes: removal discards the nested window', () => {
  const w = createWindow();
  const f = w.document.body.appendChild(w.document.createElement('iframe'));
  const first = f.contentWindow;
  f.remove();
  assert.equal(f.contentWindow, null);
  assert.equal(f.contentDocument, null);
  assert.equal(w.length, 0);
  assert.equal(w[0], undefined);
  w.document.body.appendChild(f);
  assert.ok(f.contentWindow && f.contentWindow !== first, 'a new window when inserted again');
});

test('iframes: no work for documents without iframes', () => {
  const w = createWindow();
  w.document.body.appendChild(w.document.createElement('div'));
  assert.equal(w.document[Object.getOwnPropertySymbols(w.document)[0]].frameCount, undefined);
});

// Window operations are own properties of the window and work unbound,
// also on a frame's window (react-aria: const { getComputedStyle } = win).
parity('window operations called without this', (w) => {
  const iframe = w.document.createElement('iframe');
  w.document.body.append(iframe);
  const fw = iframe.contentWindow;
  const div = fw.document.createElement('div');
  fw.document.body.append(div);
  const { getComputedStyle, getSelection, setTimeout: frameSetTimeout } = fw;
  return [
    getComputedStyle(div).display,
    typeof getSelection(),
    typeof frameSetTimeout(() => {}, 0),
    ['getComputedStyle', 'getSelection', 'postMessage', 'scrollTo', 'close'].map(
      (n) => !!Object.getOwnPropertyDescriptor(fw, n),
    ),
    w.getComputedStyle.length,
  ];
});

parity("a frame window's timers", async (w) => {
  const iframe = w.document.createElement('iframe');
  w.document.body.append(iframe);
  const fw = iframe.contentWindow;
  const log = [];
  const a = fw.setTimeout((x) => log.push(['timeout', x]), 0, 'arg');
  const b = fw.setTimeout(() => log.push('cleared'), 0);
  fw.clearTimeout(b);
  const c = fw.setInterval(() => {
    log.push('interval');
    fw.clearInterval(c);
  }, 1);
  fw.queueMicrotask(() => log.push('microtask'));
  await new Promise((resolve) => setTimeout(resolve, 30));
  return [typeof a, a > 0, b > a, log, fw.atob(fw.btoa('hi'))];
});

// A removed iframe's window is discarded: its timers, intervals and
// AbortSignal.timeout() never fire.
parity("a removed frame's timers and AbortSignal.timeout stop", async (w) => {
  w.document.body.innerHTML = '<iframe></iframe>';
  const iframe = w.document.querySelector('iframe');
  const child = iframe.contentWindow;
  const fired = [];
  child.setTimeout(() => fired.push('timeout'), 5);
  const interval = child.setInterval(() => fired.push('interval'), 3);
  const signal = child.AbortSignal.timeout(5);
  signal.onabort = () => fired.push('abort');
  iframe.remove();
  await new Promise((resolve) => setTimeout(resolve, 40));
  child.clearInterval(interval); // so that a regression does not keep the process alive
  return [fired, signal.aborted];
});

// jsdom 30 also gives frame elements a window (WPT frame-post-connection-
// steps); a parity scenario is not used because jsdom hangs on it.
test('frame elements get a nested window like iframes', () => {
  const w = createWindow();
  const d = w.document;
  const host = d.createElement('div');
  const frame = d.createElement('frame');
  const iframe = d.createElement('iframe');
  host.append(frame, iframe);
  assert.deepEqual([frame.contentWindow, iframe.contentWindow], [null, null]);
  d.body.append(host);
  assert.notEqual(frame.contentWindow, null);
  assert.notEqual(iframe.contentWindow, null);
  assert.equal(w.length, 2);
  assert.equal(frame.contentDocument.nodeName, '#document');
  const other = d.implementation.createHTMLDocument('');
  assert.equal(other.body.appendChild(other.createElement('frame')).contentWindow, null);
  host.remove();
  assert.equal(frame.contentWindow, null);
  assert.equal(w.length, 0);
});

// getSVGDocument() (#67): an iframe's content document when it is an SVG
// document, else null (HTML). jsdom 20 to 30 have the method (iframe only)
// but every call throws a TypeError from inside jsdom; warpdom follows the
// standard: its frames never hold SVG documents, so it returns null.
const svgDocumentShapeScenario = (w) => {
  const d = w.document;
  const m = Object.getOwnPropertyDescriptor(w.HTMLIFrameElement.prototype, 'getSVGDocument');
  return [
    typeof m.value,
    m.writable,
    m.enumerable,
    m.configurable,
    m.value.name,
    m.value.length,
    ...['HTMLFrameElement', 'HTMLEmbedElement', 'HTMLObjectElement'].map(
      (name) => 'getSVGDocument' in w[name].prototype,
    ),
    'getSVGDocument' in d.createElement('iframe'),
  ];
};
for (const jsdom of [20, 25, 30])
  parity(`iframe getSVGDocument(): the method (jsdom ${jsdom})`, svgDocumentShapeScenario, { jsdom });

test('iframe getSVGDocument(): null unless the content document is an SVG document', async () => {
  for (const jsdom of ['20.0.0', '30.1.3']) {
    const w = createWindow({ jsdom });
    const d = w.document;
    const connected = d.body.appendChild(d.createElement('iframe'));
    const srcdoc = d.createElement('iframe');
    srcdoc.srcdoc = '<svg></svg>';
    d.body.append(srcdoc);
    await tick();
    assert.ok(connected.contentDocument);
    assert.equal(connected.getSVGDocument(), null);
    assert.equal(srcdoc.getSVGDocument(), null);
    assert.equal(d.createElement('iframe').getSVGDocument(), null);
    assert.throws(() => w.HTMLIFrameElement.prototype.getSVGDocument.call(d.createElement('div')), TypeError);
    assert.throws(() => w.HTMLIFrameElement.prototype.getSVGDocument.call({}), TypeError);
  }
});

// The parent window's frames after an iframe is removed (#173): connected,
// in a removed subtree, moved into a detached element and removed from it,
// and replaced by innerHTML. contentWindow is left out (a deliberate
// deviation, above).
parity('iframes: window.length, indexes and frames after removal', (w) => {
  const d = w.document;
  const frames = () => [w.length, w.frames.length, w[0] === undefined, w.frames === w, '0' in w];
  const out = {};
  const a = d.body.appendChild(d.createElement('iframe'));
  out.inserted = frames();
  a.remove();
  out.removed = frames();
  d.body.appendChild(a);
  out.reinserted = [...frames(), w[0] === a.contentWindow];
  const div = d.createElement('div');
  div.append(a);
  out.movedToDetached = frames();
  a.remove();
  out.removedFromDetached = frames();
  const host = d.body.appendChild(d.createElement('div'));
  host.innerHTML = '<iframe></iframe><p><iframe></iframe></p>';
  out.subtree = frames();
  host.remove();
  out.subtreeRemoved = frames();
  d.body.innerHTML = '<iframe></iframe><iframe></iframe>';
  out.innerHTML = [...frames(), w[1] === d.body.lastChild.contentWindow];
  d.body.innerHTML = '';
  out.cleared = frames();
  return out;
});

// An index a test deleted or redefined comes back at the next insertion or
// removal of a frame, as in jsdom (20 to 30, black box), also while each
// insertion defines only its own index (#184). The scenario runs in strict
// mode: the assignment to an index throws (a getter without a setter).
parity('iframes: deleted and redefined indexes come back with the next frame change', (w) => {
  const d = w.document;
  const out = {};
  const a = d.body.appendChild(d.createElement('iframe'));
  out.deleted = [delete w[0], '0' in w];
  const b = d.body.appendChild(d.createElement('iframe'));
  out.afterInsert = ['0' in w, w[0] === a.contentWindow, w[1] === b.contentWindow];
  try {
    w[0] = 'x';
  } catch (error) {
    out.assign = error.constructor === TypeError;
  }
  Object.defineProperty(w, 1, { value: 'v', configurable: true, writable: true });
  delete w[0];
  const c = d.body.appendChild(d.createElement('iframe'));
  c.remove();
  out.afterRemove = ['0' in w, w[0] === a.contentWindow, w[1] === b.contentWindow, '2' in w, w.length];
  Object.defineProperty(w, 0, { value: 'v', configurable: true, writable: true });
  d.body.appendChild(d.createElement('div'));
  out.otherInsert = typeof w[0];
  a.remove();
  out.shifted = [w[0] === b.contentWindow, '1' in w, Object.keys(w).filter((key) => /^\d+$/.test(key))];
  return out;
});

// Inserting a frame defines only its own index property, and removing one
// defines none: inserting 50 sibling frames made 1,275 definitions (#184).
test('iframes: an insertion defines only the new index property', () => {
  const w = createWindow();
  const d = w.document;
  const define = Reflect.defineProperty;
  let definitions = 0;
  Reflect.defineProperty = (target, key, descriptor) => {
    if (target === w && /^\d+$/.test(String(key))) definitions++;
    return define(target, key, descriptor);
  };
  let afterInsertions;
  try {
    for (let i = 0; i < 50; i++) d.body.appendChild(d.createElement('iframe'));
    afterInsertions = definitions;
    d.body.firstChild.remove();
    d.body.lastChild.remove();
  } finally {
    Reflect.defineProperty = define;
  }
  assert.deepEqual(
    [afterInsertions, definitions, w.length, w[0] === d.body.firstChild.contentWindow],
    [50, 50, 48, true],
  );
});

// Iframes in shadow trees (#205): from jsdom 30.1.0 (black box, 20.0.3 to
// 30.1.3; 30.0.0 and 30.0.1 have none) one that becomes connected gets a
// window, whether its shadow root is connected already or its host is
// inserted later, also in nested shadow trees; before, none does. In no
// version do they count in window.length, frames or the index properties.
// A light iframe moved into a shadow root loses its frame there before
// 30.1.0 (jsdom keeps contentWindow, a deliberate deviation above, so it is
// left out). The window of a removed one is left out too.
const shadowFramesScenario = async (w) => {
  const d = w.document;
  const frames = () => [w.length, w.frames.length, '0' in w, w[0] === undefined, '1' in w];
  const view = (f) => {
    const cw = f.contentWindow;
    if (cw === null) return [null, f.contentDocument];
    return [cw.parent === w, cw.top === w, cw.frameElement === f, cw.document === f.contentDocument, cw.length];
  };
  const log = [];
  const iframe = (name) => {
    const f = d.createElement('iframe');
    f.addEventListener('load', () => log.push(name));
    return f;
  };
  const out = {};
  const a = d.body.appendChild(d.createElement('div'));
  const shadow = a.attachShadow({ mode: 'open' });
  const connectedFrame = shadow.appendChild(iframe('connected'));
  out.connected = [...view(connectedFrame), ...frames()];
  shadow.appendChild(iframe('removed')).remove();
  out.removed = frames();
  const b = d.createElement('div');
  const beforeFrame = b.attachShadow({ mode: 'open' }).appendChild(iframe('before'));
  out.detached = view(beforeFrame);
  d.body.append(b);
  out.hostInserted = [...view(beforeFrame), ...frames()];
  const c = d.body.appendChild(d.createElement('div'));
  const inner = c.attachShadow({ mode: 'open' }).appendChild(d.createElement('span'));
  const nested = inner.attachShadow({ mode: 'open' }).appendChild(d.createElement('p')).appendChild(iframe('nested'));
  out.nested = [...view(nested), ...frames()];
  const light = d.body.appendChild(iframe('light'));
  out.light = [w[0] === light.contentWindow, ...frames()];
  await tick();
  out.loaded = [...log];
  b.remove();
  out.hostRemoved = frames();
  d.body.append(b);
  out.hostReinserted = [...view(beforeFrame), ...frames()];
  const moved = d.body.appendChild(iframe('moved'));
  shadow.append(moved);
  out.moved = [w[1] === undefined, ...frames()];
  await tick();
  out.reloaded = log.slice(out.loaded.length);
  return out;
};
for (const jsdom of [20, 22, 25, 26, 27, 28, 29, 30])
  parity(`iframes in shadow trees: windows and frames (jsdom ${jsdom})`, shadowFramesScenario, { jsdom });

// A shadow-tree iframe's window is discarded with it (the deliberate
// deviation above), and the index properties stay those of the document's
// frames.
test('iframes in shadow trees: removal discards the window, the indexes stay', async () => {
  for (const [jsdom, windows] of [
    ['30.1.0', true],
    ['30.0.1', false],
  ]) {
    const w = createWindow({ jsdom });
    const d = w.document;
    const light = d.body.appendChild(d.createElement('iframe'));
    const host = d.body.appendChild(d.createElement('div'));
    const shadow = host.attachShadow({ mode: 'open' });
    const f = shadow.appendChild(d.createElement('iframe'));
    const child = f.contentWindow;
    assert.equal(child !== null, windows, jsdom);
    let fired = false;
    child?.setTimeout(() => (fired = true), 0);
    assert.deepEqual([w.length, w[0] === light.contentWindow, '1' in w], [1, true, false]);
    f.remove();
    assert.deepEqual([f.contentWindow, w.length, w[0] === light.contentWindow], [null, 1, true]);
    shadow.append(f);
    host.remove();
    assert.deepEqual([f.contentWindow, w.length, w[0] === light.contentWindow], [null, 1, true]);
    await tick();
    assert.equal(fired, false, "the discarded window's timers stop");
  }
});
