// The CSS object model, checked against jsdom. Values are compared only
// where jsdom does not normalize them (it serializes 0 as 0px).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWindow } from '../src/node.js';
import { parity } from './parity.js';

const describe = (rule) => {
  const out = [rule.constructor.name, rule.type];
  if ('selectorText' in rule) out.push(rule.selectorText);
  if ('conditionText' in rule) out.push(rule.conditionText);
  if ('media' in rule && rule.media) out.push(rule.media.mediaText);
  if ('name' in rule) out.push(rule.name);
  if ('href' in rule) out.push(rule.href);
  if ('keyText' in rule) out.push(rule.keyText);
  if ('cssRules' in rule && rule.cssRules) out.push([...rule.cssRules].map(describe));
  return out;
};

parity('style sheets from style elements', (w) => {
  const d = w.document;
  const st = d.createElement('style');
  const out = [st.sheet];
  st.textContent = `@import url("a.css") screen;
    /* comment { not a rule } */ div > p, a[title="x{y}"] { color: red; content: "a;b" }
    @media (max-width: 600px) { .x { color: blue } @supports (display: grid) { .g { display: grid } } }
    @font-face { font-family: F } @keyframes spin { from { color: red } 50% { color: blue } to { color: green } }
    @layer base { p { color: blue } } @layer a, b; @charset "utf-8"; @unknown stuff { x { y: z } }`;
  d.head.appendChild(st);
  const s = st.sheet;
  out.push(s.constructor.name, s.type, s.href, s.title, s.media.mediaText, s.ownerNode === st, s.parentStyleSheet, s.ownerRule, s.disabled);
  out.push([...s.cssRules].map(describe), s.cssRules.length, s.cssRules[1].style.color, s.cssRules[1].style.getPropertyValue('content'));
  out.push(s.cssRules[1].parentStyleSheet === s, s.cssRules[2].cssRules[0].parentRule === s.cssRules[2], s.cssRules[1].style.parentRule === s.cssRules[1]);
  out.push(d.styleSheets.length, d.styleSheets[0] === s, d.styleSheets.item(0) === s, st.sheet === s);
  st.textContent = 'b { color: red }';
  out.push('new text, new sheet', st.sheet === s, st.sheet.cssRules.length);
  const printing = d.createElement('style');
  printing.media = 'print';
  printing.title = 'T';
  printing.textContent = '@media screen { a { color: red } }';
  d.head.appendChild(printing);
  out.push(printing.sheet.media.mediaText, printing.sheet.media.length, printing.sheet.title, d.styleSheets.length);
  st.remove();
  out.push('removed', st.sheet, d.styleSheets.length);
  return out;
});

parity('insertRule and deleteRule', (w) => {
  const st = w.document.createElement('style');
  st.textContent = '@import url(a.css); a { color: red }';
  w.document.head.appendChild(st);
  const s = st.sheet;
  const out = [s.insertRule('span { color: blue }', 2), s.cssRules[2].selectorText, s.insertRule('i { color: red }'.replace('i', 'em'), s.cssRules.length)];
  for (const [rule, index] of [['b { color: red }', 0], ['@import url(b.css);', 2], ['', 0], ['a { color: red } b { color: red }', 0], ['x { y: z }', 99]]) {
    try { s.insertRule(rule, index); out.push('ok'); } catch (e) { out.push(e.name); }
  }
  s.deleteRule(1);
  out.push([...s.cssRules].map((r) => r.selectorText ?? r.href));
  try { s.deleteRule(10); } catch (e) { out.push(e.name); }
  const media = s.cssRules[0].type;
  s.insertRule('@media print { a { color: red } }', 1);
  const m = s.cssRules[1];
  out.push(media, m.insertRule('b { color: red }', 1), m.cssRules.length, m.cssRules[1].parentRule === m);
  m.deleteRule(0);
  out.push(m.cssRules.length, m.media.mediaText);
  m.media.appendMedium('screen');
  out.push(m.media.mediaText, m.media.length, m.media.item(1));
  return out;
});

parity('constructed style sheets', (w) => {
  const c = new w.CSSStyleSheet();
  c.replaceSync('i { color: green } b { color: red }');
  const out = [c.cssRules.length, c.cssRules[0].selectorText, c.ownerNode, c.media.mediaText, 'adoptedStyleSheets' in w.document];
  const m = new w.CSSStyleSheet({ media: 'print', disabled: true });
  out.push(m.media.mediaText, m.disabled);
  const st = w.document.createElement('style');
  st.textContent = 'a { color: red }';
  w.document.head.appendChild(st);
  let threw = null;
  try { st.sheet.replaceSync('b {}'); } catch (e) { threw = e.name; }
  out.push(threw);
  return out;
});

test('rule cssText', () => {
  const w = createWindow();
  const st = w.document.createElement('style');
  st.textContent = 'a { color: red } @media print { b { color: blue } } @keyframes k { from { color: red } }';
  w.document.head.appendChild(st);
  const [a, media, keyframes] = st.sheet.cssRules;
  assert.equal(a.cssText, 'a { color: red; }');
  assert.equal(media.cssText, '@media print {\n  b { color: blue; }\n}');
  assert.equal(keyframes.cssText, '@keyframes k { 0% { color: red; } }');
});
