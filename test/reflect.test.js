// Reflection and element interfaces, from the HTML standard's IDL.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWindow } from '../src/node.js';

test('element interfaces follow the current standard', () => {
  const { document: d, ...w } = createWindow();
  const iface = (tag) => Object.getPrototypeOf(d.createElement(tag)).constructor.name;
  // search (HTMLElement) and selectedcontent (HTMLSelectedContentElement)
  // in the standard: HTMLUnknownElement in jsdom 20 to 30, which warpdom
  // follows (#69). menuitem: HTMLElement in @webref's element data,
  // HTMLUnknownElement in jsdom 20 to 30 and in WPT
  // (contextmenu-historical.html); warpdom follows jsdom (#51).
  assert.equal(iface('search'), 'HTMLUnknownElement');
  assert.equal(iface('menuitem'), 'HTMLUnknownElement');
  assert.equal(iface('selectedcontent'), 'HTMLUnknownElement');
  assert.equal(typeof w.HTMLSelectedContentElement, 'undefined');
  assert.equal(iface('marquee'), 'HTMLMarqueeElement');
  assert.equal(iface('blink'), 'HTMLUnknownElement');
  assert.equal(iface('x-foo'), 'HTMLElement');
});

test('reflection kinds', () => {
  const { document: d } = createWindow();
  const a = d.createElement('a');
  a.rel = 'noopener noreferrer';
  assert.deepEqual([...a.relList], ['noopener', 'noreferrer']);
  assert.equal(a.relList, a.relList);
  const td = d.createElement('td');
  td.setAttribute('colspan', '5000');
  assert.equal(td.colSpan, 1000, 'clamped to the range');
  td.setAttribute('colspan', '0');
  assert.equal(td.colSpan, 1);
  td.colSpan = 0;
  assert.equal(td.getAttribute('colspan'), '0', 'clamping does not apply to the setter');
  td.colSpan = -1;
  assert.equal(td.getAttribute('colspan'), '1', 'out of range: the default');
  const div = d.createElement('div');
  div.hidden = true;
  assert.equal(div.getAttribute('hidden'), '');
  // Left out on purpose: libraries feature-detect it (see reflect.js).
  assert.equal('inert' in d.defaultView.HTMLElement.prototype, false);
  const img = d.createElement('img');
  assert.equal(img.crossOrigin, null);
  img.setAttribute('crossorigin', '');
  assert.equal(img.crossOrigin, 'anonymous');
  img.setAttribute('crossorigin', 'USE-CREDENTIALS');
  assert.equal(img.crossOrigin, 'use-credentials');
  img.crossOrigin = null;
  assert.equal(img.hasAttribute('crossorigin'), false);
  const video = d.createElement('video');
  assert.equal(video.preload, 'metadata');
  const track = d.createElement('track');
  track.setAttribute('kind', 'bogus');
  assert.equal(track.kind, 'metadata');
  const input = d.createElement('input');
  assert.equal(input.size, 20);
  assert.throws(
    () => {
      input.size = 0;
    },
    { name: 'IndexSizeError' },
  );
  assert.throws(
    () => {
      input.maxLength = -1;
    },
    { name: 'IndexSizeError' },
  );
  const progress = d.createElement('progress');
  assert.equal(progress.max, 1);
  progress.setAttribute('max', '-3');
  assert.equal(progress.max, 1, 'double limited to only positive numbers');
});

import { parity } from './parity.js';

parity('ARIA reflection (ARIAMixin)', (w) => {
  const div = w.document.createElement('div');
  const out = ['ariaLabel' in div, div.ariaLabel, div.role, 'ariaHidden' in div];
  div.ariaLabel = 'Close';
  div.role = 'button';
  div.ariaExpanded = 'true';
  out.push(div.getAttribute('aria-label'), div.getAttribute('role'), div.getAttribute('aria-expanded'));
  div.ariaLabel = null;
  out.push(div.hasAttribute('aria-label'));
  return out;
});

// Before jsdom 23.1.0 Element has no role or ARIA accessors: an assignment
// is an expando, and Vue sets ariaLabel as an attribute named arialabel
// (Element Plus's table-v2 tests read it).
const noAriaScenario = (w) => {
  const div = w.document.createElement('div');
  const members = Object.getOwnPropertyNames(w.Element.prototype).filter((k) => /^(role|aria[A-Z])/.test(k));
  div.ariaLabel = 'Close';
  div.role = 'button';
  return [members, 'ariaExpanded' in div, div.hasAttribute('aria-label'), div.hasAttribute('role'), div.ariaLabel];
};
for (const jsdom of [20, 22]) parity(`no ARIA reflection (jsdom ${jsdom})`, noAriaScenario, { jsdom });

test('ARIA reflection per jsdom version: boundary 23.1.0', () => {
  const has = (jsdom) => 'ariaLabel' in createWindow({ jsdom }).document.body;
  assert.deepEqual(['16.4.0', '22.1.0', '23.0.1', '23.1.0', '26.1.0', 16, 23, 30].map(has), [
    false,
    false,
    false,
    true,
    true,
    false,
    true,
    true,
  ]);
});

// WebIDL: undefined converts to null for a nullable DOMString, so it removes
// the attribute (jsdom 26 and 30 alike).
for (const jsdom of [26, 30]) {
  parity(
    `ARIA reflection: undefined removes the attribute (jsdom ${jsdom})`,
    (w) => {
      const div = w.document.createElement('div');
      div.setAttribute('aria-label', 'x');
      div.setAttribute('role', 'button');
      div.ariaLabel = undefined;
      div.role = undefined;
      return [div.ariaLabel, div.role, div.hasAttribute('aria-label'), div.hasAttribute('role')];
    },
    { jsdom },
  );
}

// "-0" parses to 0 (an IDL long has no -0), and a nullable enumerated
// attribute (crossOrigin) set to undefined is removed.
parity('reflection: "-0" is 0, crossOrigin = undefined removes the attribute', (w) => {
  const d = w.document;
  const link = d.createElement('link');
  link.setAttribute('tabindex', '-0');
  const input = d.createElement('input');
  input.setAttribute('maxlength', '-0');
  const ol = d.createElement('ol');
  ol.setAttribute('start', '-0');
  const video = d.createElement('video');
  video.crossOrigin = 'anonymous';
  video.crossOrigin = undefined;
  const img = d.createElement('img');
  img.crossOrigin = 'anonymous';
  img.crossOrigin = null;
  return [
    Object.is(link.tabIndex, 0),
    Object.is(input.maxLength, 0),
    Object.is(ol.start, 0),
    video.getAttribute('crossorigin'),
    video.crossOrigin,
    img.hasAttribute('crossorigin'),
  ];
});

// Keywords compare ASCII case-insensitively (the Kelvin sign is not "k"),
// "1.e2" is 100, and [LegacyNullToEmptyString] attributes set null as "".
parity('reflection: ASCII case-insensitive keywords, "1.e2", null as ""', (w) => {
  const d = w.document;
  const input = d.createElement('input');
  input.setAttribute('type', 'checKbox');
  const button = d.createElement('button');
  button.setAttribute('type', 'RESET');
  const form = d.createElement('form');
  form.setAttribute('method', 'poſt');
  const progress = d.createElement('progress');
  progress.setAttribute('max', '1.e2');
  const meter = d.createElement('meter');
  meter.setAttribute('max', '1.');
  const img = d.createElement('img');
  img.border = null;
  const iframe = d.createElement('iframe');
  iframe.marginHeight = null;
  const body = d.createElement('body');
  body.bgColor = null;
  return [
    input.type,
    button.type,
    form.method,
    progress.max,
    meter.max,
    img.getAttribute('border'),
    iframe.getAttribute('marginheight'),
    body.getAttribute('bgcolor'),
  ];
});

// Submit buttons' formAction, formMethod and formEnctype (jsdom lacks them;
// the standard's reflection).
test('formAction, formMethod, formEnctype', () => {
  const w = createWindow({ url: 'http://localhost:3000/dir/page' });
  const d = w.document;
  for (const tag of ['button', 'input']) {
    const el = d.createElement(tag);
    assert.deepEqual([el.formAction, el.formMethod, el.formEnctype], ['http://localhost:3000/dir/page', '', '']);
    el.setAttribute('formaction', 'go?x=1');
    el.setAttribute('formmethod', 'POST');
    el.setAttribute('formenctype', 'Text/Plain');
    assert.deepEqual(
      [el.formAction, el.formMethod, el.formEnctype],
      ['http://localhost:3000/dir/go?x=1', 'post', 'text/plain'],
    );
    el.formMethod = 'put';
    el.formEnctype = '';
    el.formAction = '';
    assert.deepEqual(
      [el.getAttribute('formmethod'), el.formMethod, el.formEnctype, el.formAction],
      ['put', 'get', 'application/x-www-form-urlencoded', 'http://localhost:3000/dir/page'],
    );
  }
});

// USVString reflections (ping, srcset, imageSrcset) replace lone surrogates
// with U+FFFD (WebIDL); jsdom does it for srcset and keeps them in ping.
test('USVString reflections replace lone surrogates', () => {
  const d = createWindow().document;
  const a = d.createElement('a');
  a.ping = 'x\uD989';
  const source = d.createElement('source');
  source.srcset = '\uD800a.png';
  const link = d.createElement('link');
  link.imageSrcset = '\uDC00';
  assert.deepEqual([a.ping, source.srcset, link.imageSrcset], ['x�', '�a.png', '�']);
});

// <search>, <selectedcontent> and <menuitem> are HTMLUnknownElement in jsdom
// 20 to 30 (#69; black box, every release); <search> is display: block
// from jsdom 27 ('' before, as other elements without a user agent display
// there).
const unknownElementsScenario = (w) => {
  const d = w.document;
  d.body.innerHTML =
    '<search id="s">x</search><select><button><selectedcontent></selectedcontent></button><option>a</option></select><menuitem id="m"></menuitem>';
  const out = [d.body.innerHTML, 'HTMLSelectedContentElement' in w];
  for (const tag of ['search', 'selectedcontent', 'menuitem']) {
    const e = d.createElement(tag);
    d.body.append(e);
    out.push(
      e.constructor.name,
      e instanceof w.HTMLUnknownElement,
      Object.getPrototypeOf(e) === w.HTMLUnknownElement.prototype,
      w.getComputedStyle(e).display,
      Object.prototype.toString.call(e),
    );
  }
  return out;
};
for (const jsdom of [20, 26, 30])
  parity(`search, selectedcontent and menuitem (jsdom ${jsdom})`, unknownElementsScenario, { jsdom });

test('<search> display per jsdom version: boundary 27.0.0', () => {
  const display = (jsdom) => {
    const w = createWindow({ jsdom });
    return w.getComputedStyle(w.document.body.appendChild(w.document.createElement('search'))).display;
  };
  assert.equal(display('26.1.0'), '');
  assert.equal(display('27.0.0'), 'block');
});
