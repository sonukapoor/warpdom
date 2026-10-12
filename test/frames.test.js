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
    tree: [cw.parent === w, cw.top === w, cw.frameElement === f, w.frames[0] === cw, w.length, w[0] === cw, w.frameElement, w.parent === w, w.top === w],
    realm: [cw.PointerEvent === w.PointerEvent, cd.createElement('div') instanceof w.HTMLElement, cd.createElement('div') instanceof cw.HTMLElement, cw.location.href],
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
    getComputedStyle(div).display, typeof getSelection(), typeof frameSetTimeout(() => {}, 0),
    ['getComputedStyle', 'getSelection', 'postMessage', 'scrollTo', 'close'].map((n) => !!Object.getOwnPropertyDescriptor(fw, n)),
    w.getComputedStyle.length,
  ];
});

parity('a frame window\'s timers', async (w) => {
  const iframe = w.document.createElement('iframe');
  w.document.body.append(iframe);
  const fw = iframe.contentWindow;
  const log = [];
  const a = fw.setTimeout((x) => log.push(['timeout', x]), 0, 'arg');
  const b = fw.setTimeout(() => log.push('cleared'), 0);
  fw.clearTimeout(b);
  const c = fw.setInterval(() => { log.push('interval'); fw.clearInterval(c); }, 1);
  fw.queueMicrotask(() => log.push('microtask'));
  await new Promise((resolve) => setTimeout(resolve, 30));
  return [typeof a, a > 0, b > a, log, fw.atob(fw.btoa('hi'))];
});

// A removed iframe's window is discarded: its timers, intervals and
// AbortSignal.timeout() never fire.
parity('a removed frame\'s timers and AbortSignal.timeout stop', async (w) => {
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
