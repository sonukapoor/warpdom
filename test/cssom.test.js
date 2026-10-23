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
  out.push(
    s.constructor.name,
    s.type,
    s.href,
    s.title,
    s.media.mediaText,
    s.ownerNode === st,
    s.parentStyleSheet,
    s.ownerRule,
    s.disabled,
  );
  out.push(
    [...s.cssRules].map(describe),
    s.cssRules.length,
    s.cssRules[1].style.color,
    s.cssRules[1].style.getPropertyValue('content'),
  );
  out.push(
    s.cssRules[1].parentStyleSheet === s,
    s.cssRules[2].cssRules[0].parentRule === s.cssRules[2],
    s.cssRules[1].style.parentRule === s.cssRules[1],
  );
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
  const out = [
    s.insertRule('span { color: blue }', 2),
    s.cssRules[2].selectorText,
    s.insertRule('i { color: red }'.replace('i', 'em'), s.cssRules.length),
  ];
  for (const [rule, index] of [
    ['b { color: red }', 0],
    ['@import url(b.css);', 2],
    ['', 0],
    ['a { color: red } b { color: red }', 0],
    ['x { y: z }', 99],
  ]) {
    try {
      s.insertRule(rule, index);
      out.push('ok');
    } catch (e) {
      out.push(e.name);
    }
  }
  s.deleteRule(1);
  out.push([...s.cssRules].map((r) => r.selectorText ?? r.href));
  try {
    s.deleteRule(10);
  } catch (e) {
    out.push(e.name);
  }
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
  const out = [
    c.cssRules.length,
    c.cssRules[0].selectorText,
    c.ownerNode,
    c.media.mediaText,
    'adoptedStyleSheets' in w.document,
  ];
  const st = w.document.createElement('style');
  st.textContent = 'a { color: red }';
  w.document.head.appendChild(st);
  let threw = null;
  try {
    st.sheet.replaceSync('b {}');
  } catch (e) {
    threw = e.name;
  }
  out.push(threw);
  return out;
});

// jsdom ignores the options (a deliberate deviation, PLAN.md).
test('constructed style sheets take the media and disabled options', () => {
  const w = createWindow();
  const m = new w.CSSStyleSheet({ media: 'print', disabled: true });
  assert.equal(m.media.mediaText, 'print');
  assert.equal(m.disabled, true);
  assert.equal(new w.CSSStyleSheet({ media: m.media }).media.mediaText, 'print');
  assert.throws(() => new w.CSSStyleSheet({ baseURL: 'https://test:test/' }), { name: 'NotAllowedError' });
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

const sheetOf = (w, text) => {
  const st = w.document.createElement('style');
  st.textContent = text;
  w.document.head.appendChild(st);
  return st.sheet;
};
const errorName = (fn) => {
  try {
    fn();
    return 'ok';
  } catch (e) {
    return e.name;
  }
};

parity('selectorText ignores invalid selectors', (w) => {
  const rule = sheetOf(w, 'div { color: green }').cssRules[0];
  const out = [];
  for (const v of ['span', 'p, .foo', '123invalid', '', '[', 'p:hover', 'p::before', ':is(a', '#id']) {
    rule.selectorText = v;
    out.push(rule.selectorText);
  }
  out.push(rule.cssText);
  return out;
});

parity('insertRule and deleteRule check their arguments and the rule', (w) => {
  const sheet = sheetOf(w, '@import url("a.css"); @media all { a { color: red } } b { color: blue }');
  const media = sheet.cssRules[1];
  return [
    w.CSSStyleSheet.prototype.insertRule.length,
    w.CSSGroupingRule.prototype.insertRule.length,
    errorName(() => sheet.insertRule()),
    errorName(() => sheet.deleteRule()),
    errorName(() => media.deleteRule()),
    errorName(() => sheet.insertRule('p { color: red; } garbage', 1)),
    errorName(() => media.insertRule('@import url("foo.css");', 0)),
    errorName(() => sheet.cssRules.item()),
    errorName(() => sheet.media.appendMedium()),
    sheet.cssRules.length,
    media.cssRules.length,
  ];
});

parity('@import and @namespace only at the start of a sheet', (w) => {
  const sheet = sheetOf(
    w,
    '@import url("a.css"); @namespace svg url("http://www.w3.org/2000/svg"); @media all { @import url("b.css"); a { color: red } } b { color: blue }',
  );
  return [sheet.cssRules.length, sheet.cssRules[1].cssText, sheet.cssRules[2].cssRules.length];
});

// jsdom keeps them (a deliberate deviation, PLAN.md).
test('@import and @namespace rules after other rules are dropped', () => {
  const w = createWindow();
  const sheet = sheetOf(w, 'b { color: blue } @import url("c.css"); @namespace x url("y");');
  assert.equal(sheet.cssRules.length, 1);
});

parity('an @import rule has an empty style sheet', (w) => {
  const sheet = sheetOf(w, '@import url("x.css") print; a { color: red }');
  const rule = sheet.cssRules[0];
  const imported = rule.styleSheet;
  return [
    rule.styleSheet === imported,
    imported.cssRules.length,
    imported.href,
    imported.ownerRule === rule,
    imported.parentStyleSheet === sheet,
    imported.media === rule.media,
    imported.media.mediaText,
    imported.ownerNode,
    imported.title,
    errorName(() => imported.replaceSync('b {}')),
    errorName(() => sheet.replaceSync('b {}')),
  ];
});

parity('keyframes rules', (w) => {
  const rule = sheetOf(w, '@keyframes k { from { top: 0px } 50% { top: 1px } 80% { top: 2px } to { top: 3px } }')
    .cssRules[0];
  const out = [rule.cssRules.length, rule[0].keyText, rule[1].keyText, rule[2].keyText];
  rule.appendRule('0% { top: 1px } 100% { top: 2px }');
  rule.appendRule('10% { top: 1px } garbage');
  out.push(rule.cssRules.length);
  rule.appendRule('.5% { top: 4px }');
  out.push(rule.cssRules.length, rule.cssRules[3].keyText);
  out.push(
    errorName(() => {
      rule.cssRules[0].keyText = 'invalid';
    }),
  );
  rule.cssRules[0].keyText = '1e1%';
  out.push(rule.cssRules[0].keyText);
  const removed = rule.cssRules[1];
  rule.deleteRule('50%');
  out.push(removed.parentRule, removed.parentStyleSheet, rule.cssRules.length);
  rule.name = 'none';
  out.push(rule.cssText.replace(/\s/g, ''));
  return out;
});

// jsdom keeps keyframes outside 0%-100% (a deliberate deviation, PLAN.md).
test('keyframes outside 0% to 100% are dropped', () => {
  const w = createWindow();
  const rule = sheetOf(w, '@keyframes k { 120% { top: 2px } -5% { top: 0 } 100% { top: 1px } }').cssRules[0];
  assert.deepEqual(
    [...rule.cssRules].map((r) => r.keyText),
    ['100%'],
  );
  assert.throws(
    () => {
      rule.cssRules[0].keyText = '150%';
    },
    { name: 'SyntaxError' },
  );
});

parity('rules serialize URLs as strings', (w) => {
  const sheet = sheetOf(w, '@import url(\'quote"quote\'); @namespace x "y";');
  return [...sheet.cssRules].map((r) => r.cssText);
});

parity('media lists are normalized', (w) => {
  const media = sheetOf(w, '@media SCREEN {}').cssRules[0].media;
  const out = [media.mediaText];
  for (const text of [
    'NOT  PRINT',
    'screen, bad$, print',
    'screen and (min-width:480px)',
    '(MIN-WIDTH: 10PX)',
    'all and (color)',
    'screen,',
  ]) {
    media.mediaText = text;
    out.push(media.mediaText);
  }
  media.mediaText = 'screen';
  media.appendMedium('SCREEN');
  media.appendMedium('bad$');
  out.push(media.mediaText);
  media.deleteMedium('NOT ALL');
  out.push(
    media.mediaText,
    errorName(() => media.deleteMedium('print')),
  );
  return out;
});

parity('replaceSync detaches the old rules', (w) => {
  const sheet = new w.CSSStyleSheet();
  sheet.replaceSync('a { color: red } @media all { b { color: blue } }');
  const [a, media] = sheet.cssRules;
  const inner = media.cssRules[0];
  sheet.replaceSync('c { color: green }');
  return [a.parentStyleSheet, media.parentStyleSheet, inner.parentStyleSheet, sheet.cssRules.length];
});

parity("a removed style element's sheet has no owner node", (w) => {
  const st = w.document.createElement('style');
  st.textContent = 'div { color: green }';
  w.document.head.appendChild(st);
  const sheet = st.sheet;
  st.remove();
  return [sheet.ownerNode, st.sheet];
});

for (const jsdom of [30, 26]) {
  parity(
    `rules in @media apply as in jsdom ${jsdom}`,
    (w) => {
      // Not 'Screen': jsdom 26 compares as written, warpdom lowercases media lists.
      const queries = [
        'all',
        'screen',
        'screen, print',
        'print',
        'only screen',
        'all and (color)',
        'all, print',
        '',
        '(min-width: 1px)',
      ];
      const st = w.document.createElement('style');
      st.textContent = `${queries.map((q, i) => `@media ${q} { #m${i} { color: red } }`).join('\n')} @media all { @media screen { #n { color: red } } }`;
      w.document.head.appendChild(st);
      w.document.body.innerHTML = `${queries.map((q, i) => `<p id="m${i}"></p>`).join('')}<p id="n"></p>`;
      return [...w.document.querySelectorAll('p')].map((p) => w.getComputedStyle(p).color);
    },
    { jsdom },
  );
}

parity("a style element's sheet is replaced when its children change", (w) => {
  const st = w.document.createElement('style');
  st.textContent = 'a {}';
  w.document.head.appendChild(st);
  const first = st.sheet;
  const out = [first === st.sheet];
  st.appendChild(w.document.createTextNode(''));
  out.push(st.sheet === first, first.ownerNode);
  return out;
});

// jsdom 30 has no CSSPageDescriptors or CSSMarginRule, drops descriptors
// that are not properties (size) and keeps invalid page selectors.
test('@page rules: selectors, descriptors and margin rules (CSSOM)', () => {
  const w = createWindow();
  const sheet = sheetOf(
    w,
    '@page :FIRST { margin: 1in 2in; size: a4 landscape; float: left; @top-left { color: red } } @page foo :left {}',
  );
  assert.equal(sheet.cssRules.length, 1);
  const page = sheet.cssRules[0];
  assert.ok(page instanceof w.CSSGroupingRule);
  assert.equal(page.selectorText, ':first');
  assert.equal(page.style.constructor, w.CSSPageDescriptors);
  assert.equal(page.style.size, 'a4 landscape');
  assert.equal(page.style.marginLeft, '2in');
  assert.equal(page.style.cssFloat, undefined);
  assert.equal(page.cssText, '@page :first { margin: 1in 2in; size: a4 landscape; @top-left { color: red; } }');
  const margin = page.cssRules[0];
  assert.ok(margin instanceof w.CSSMarginRule);
  assert.deepEqual([margin.name, margin.type, margin.parentRule, margin.style.color], ['top-left', 9, page, 'red']);
  page.style.pageOrientation = 'rotate-left';
  page.style.size = 'notasize';
  assert.equal(page.style.getPropertyValue('page-orientation'), 'rotate-left');
  assert.equal(page.style.size, 'a4 landscape');
  page.selectorText = 'named :first';
  assert.equal(page.selectorText, ':first');
  page.selectorText = 'named:First';
  assert.equal(page.selectorText, 'named:first');
});

test('CSSOM attributes with [PutForwards]', () => {
  const w = createWindow();
  const sheet = sheetOf(w, '@import url("a.css") screen; @keyframes k { from { top: 0px } }');
  sheet.cssRules[0].media = 'print';
  sheet.media = 'screen';
  sheet.cssRules[1].cssRules[0].style = 'left: 1px';
  assert.deepEqual(
    [sheet.cssRules[0].media.mediaText, sheet.media.mediaText, sheet.cssRules[1].cssRules[0].style.cssText],
    ['print', 'screen', 'left: 1px;'],
  );
});

parity("HTMLStyleElement.disabled is its sheet's disabled flag", (w) => {
  const st = w.document.createElement('style');
  const out = [];
  st.disabled = true;
  out.push(st.disabled, st.hasAttribute('disabled'));
  w.document.head.append(st);
  const sheet = st.sheet;
  out.push(st.disabled, sheet.disabled);
  st.disabled = true;
  out.push(st.disabled, sheet.disabled, st.hasAttribute('disabled'));
  sheet.disabled = false;
  out.push(st.disabled);
  return out;
});

test('MediaList queries compare without whitespace around parentheses and colons', () => {
  const w = createWindow();
  const media = sheetOf(w, '@media screen and (min-width: 480px), print {}').cssRules[0].media;
  media.appendMedium('screen and (min-width:480px)');
  assert.equal(media.length, 2);
  media.deleteMedium('screen and (min-width:480px)');
  assert.equal(media.mediaText, 'print');
});

parity('@container, @scope and @counter-style rules; other at-rules dropped', (w) => {
  const sheet = sheetOf(
    w,
    '@container card (min-width: 400px) { a { color: red } } @container (width > 1px) {} @scope (.a) to (.b) { b { color: red } } @scope { c {} } ' +
      '@counter-style foo { system: cyclic; symbols: a b; suffix: " "; } @property --x { syntax: "<length>"; inherits: false; initial-value: 0px; } ' +
      '@starting-style { c { opacity: 0 } } @font-feature-values Font One { @styleset { nice-style: 12; } } @unknown foo { f {} } @media print { g {} }',
  );
  const [c1, c2, s1, s2, cs] = sheet.cssRules;
  return [
    [...sheet.cssRules].map((r) => `${r.constructor.name}:${r.type}`),
    c1.cssText,
    c1.containerName,
    c1.containerQuery,
    c1.conditionText,
    c1.cssRules.length,
    c2.cssText,
    c2.containerName,
    s1.cssText,
    s1.start,
    s1.end,
    s1.cssRules.length,
    s2.cssText,
    s2.start,
    s2.end,
    cs.cssText,
    cs.name,
    cs.system,
    cs.symbols,
    cs.suffix,
    cs.pad,
  ];
});

for (const jsdom of [30, 26]) {
  parity(
    `insertRule with text after the rule (jsdom ${jsdom})`,
    (w) => {
      const sheet = sheetOf(w, '');
      const out = [
        'a{color:red;}',
        'a{};',
        ' a{} ',
        'a{} b{}',
        '/* c */ a{}',
        '@media (min-width:600px){.css-xyz{color:red}}',
        'a:hover{}',
      ].map((text) => {
        try {
          sheet.insertRule(text, sheet.cssRules.length);
          return 'ok';
        } catch (e) {
          return e.name;
        }
      });
      return [out, sheet.cssRules.length];
    },
    { jsdom },
  );
}

// jsdom 20 to 26: style sheets have no ownerNode, href, title or type;
// jsdom 30 gives the element (27 to 29 an internal object: warpdom gives
// the element there too, a deliberate deviation).
for (const jsdom of [20, 26, 30]) {
  parity(
    `style sheets: ownerNode, href, title and type (jsdom ${jsdom})`,
    (w) => {
      w.document.head.innerHTML = '<style id=s title=t>a { color: red }</style>';
      const sheet = w.document.styleSheets[0];
      const node = sheet.ownerNode;
      return [
        ['ownerNode', 'href', 'title', 'type'].map((k) => k in sheet),
        node === w.document.getElementById('s'),
        node && 'id' in node ? node.id : null,
        sheet.title ?? null,
        sheet.type ?? null,
        sheet.cssRules.length,
      ];
    },
    { jsdom },
  );
}

test('style sheets: ownerNode is the element in the jsdom 27 profile (jsdom 27 gives an internal object)', () => {
  const w = createWindow({ jsdom: 27 });
  w.document.head.innerHTML = '<style id=s>a { color: red }</style>';
  assert.equal(w.document.styleSheets[0].ownerNode, w.document.getElementById('s'));
});

// CSSMediaRule.matches (#65): from jsdom 29.0.0, true for a media list that
// is empty or has an "all" or "screen" query (jsdom evaluates no features).
for (const jsdom of [26, 30]) {
  parity(
    `CSSMediaRule.matches (jsdom ${jsdom})`,
    (w) => {
      const style = w.document.head.appendChild(w.document.createElement('style'));
      const sheet = style.sheet;
      const out = ['matches' in w.CSSMediaRule.prototype];
      if (!out[0]) return out;
      const d = Object.getOwnPropertyDescriptor(w.CSSMediaRule.prototype, 'matches');
      out.push([typeof d.get, d.set, d.enumerable, d.configurable]);
      for (const query of [
        'screen',
        'print',
        'all',
        '',
        '(min-width: 100px)',
        'not print',
        'screen and (min-width: 500px)',
        'only screen',
        'screen, print',
        'print, all',
        'SCREEN',
        'not all',
        'foo',
      ]) {
        sheet.insertRule(`@media ${query} { a { color: red } }`, 0);
        const rule = sheet.cssRules[0];
        out.push(`${rule.media.mediaText}: ${rule.matches}`);
        rule.media.mediaText = 'print';
        out.push(rule.matches);
        rule.media.appendMedium('screen');
        out.push(rule.matches);
      }
      return out;
    },
    { jsdom },
  );
}

// CSSNestedDeclarations (#66): the interface, from jsdom 27.2.0. warpdom's
// style sheets do not nest rules yet, so none is made.
parity('CSSNestedDeclarations: the interface (jsdom 30)', (w) => {
  const C = w.CSSNestedDeclarations;
  const d = Object.getOwnPropertyDescriptor(C.prototype, 'style');
  let constructed;
  try {
    constructed = new C();
  } catch (err) {
    constructed = err.constructor.name;
  }
  return [
    C.length,
    Object.getPrototypeOf(C).name,
    typeof d.get,
    typeof d.set,
    d.enumerable,
    Object.prototype.toString.call(C.prototype),
    constructed,
  ];
});

test('CSSNestedDeclarations from jsdom 27.2.0, CSSMediaRule.matches from 29.0.0', () => {
  for (const [jsdom, nested, matches] of [
    ['26.1.0', false, false],
    ['27.1.0', false, false],
    ['27.2.0', true, false],
    ['28.1.0', true, false],
    ['29.0.0', true, true],
    ['30.1.3', true, true],
  ]) {
    const w = createWindow({ jsdom });
    assert.equal('CSSNestedDeclarations' in w, nested, `CSSNestedDeclarations in jsdom ${jsdom}`);
    assert.equal('matches' in w.CSSMediaRule.prototype, matches, `CSSMediaRule.matches in jsdom ${jsdom}`);
  }
});
