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
