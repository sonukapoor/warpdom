// jsdom 31's media queries and @supports conditions (conditions31.js),
// checked against jsdom 31.0.1: how a query or condition
// is written, whether it matches, and the rules the cascade applies.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parity } from './parity.js';
import { createWindow } from '../src/node.js';
import { serializeMedium31, mediumMatches31 } from '../src/conditions31.js';

// Media queries: written and evaluated (a 1024 x 768 screen at 1dppx).
const QUERIES = [
  'SCREEN',
  'Screen AND (MIN-WIDTH: 100PX)',
  '(min-width:100px)',
  '(  min-width :  100px  )',
  '(min-width: calc(100px + 1px))',
  '(min-width: calc(1em + 2px))',
  '(aspect-ratio: 4/3)',
  '(aspect-ratio: 16 / 9)',
  '(aspect-ratio: 2)',
  '(min-width: 0)',
  '(min-width: 0.5em)',
  '(min-width: .5em)',
  '(min-width: 1E2px)',
  '(min-width: +10px)',
  '(width > 500px)',
  '(500px<width<=800px)',
  '(color)',
  '(COLOR)',
  '(min-resolution: 2DPPX)',
  '(min-resolution: 96dpi)',
  '(orientation: LANDSCAPE)',
  'not screen and (color)',
  'only screen',
  'not (color)',
  '(not (color))',
  '((color) and (hover))',
  '(color) and (hover)',
  '(color) or (hover)',
  'screen and (color) and (hover)',
  'foo',
  'foo and (color)',
  '(foo: bar)',
  '(min-width: foo)',
  'all',
  'and',
  'not',
  'only',
  '@x',
  '(min-width: 100px) and',
  'screen and',
  '(prefers-color-scheme: DARK)',
  '(min-width: 10px) AND (max-width: 20px)',
  '(min-width: var(--x))',
  'tv',
  '(grid: 1)',
  '(width >= calc(2 * 10px))',
  '(-webkit-min-device-pixel-ratio: 2)',
  '(width: 100.0px)',
  '(width: 1.50px)',
  'not all and (monochrome)',
  '(400px <= width)',
  '(min-width:foo)',
  '(foo:bar)',
  '( foo : bar )',
  '(  min-width :  foo  )',
  '(foo:  1px   2px)',
  '(width:1024)',
  '(hover:BOGUS)',
  '(width>500px)',
  '(width   >=   500px)',
  '(500px<=width)',
  '(foo > 1px)',
  '(1px < foo)',
  '(width > foo)',
  '(Width: 100PX)',
  'SCREEN   and   (COLOR)',
  'not   screen',
  '(color)and(hover)',
  '(color) and(hover)',
  'not(color)',
  '(color) AND (HOVER)',
  '((width: 1024px))',
  '(( width : 1024px ))',
  'foo(bar)',
  'foo( Bar )',
  '(foo(bar))',
  '[x]',
  '(width: 1024px) and [x]',
  '(width: 1024px) and foo(x)',
  '(width: 1024px) or foo(x)',
  'not foo(x)',
  '(aspect-ratio: 4/ 3)',
  '(aspect-ratio:4 /3)',
  '(aspect-ratio: 4/3.0)',
  '(aspect-ratio: calc(8/2))',
  '(color: calc(4 + 4))',
  '(min-resolution: calc(1dppx + 1x))',
  '(width: 1024px )',
  'not (min-width: calc(100% + 1px))',
  'not (color: 8.0)',
  'not (color: 8.5)',
  'not (width: 1024)',
  'not (device-aspect-ratio: 4/3)',
  'not (grid: 2)',
  '(grid: 2)',
  'not (min-width: 1e3px)',
  '(color: 1e1)',
  '(min-color: 7.9)',
  'not (aspect-ratio: 4 / 0)',
  '(aspect-ratio: 0/0)',
  '(min-aspect-ratio: 4/0)',
  'not (min-width: -1px)',
  '(width: -0px)',
  '(min-width: calc(-1px))',
  '(max-device-width: 1px)',
  '(device-width: 0)',
  '(max-device-height: 0px)',
  '(device-aspect-ratio: 0/0)',
  'not (hover: bogus)',
  '(width: 1024px) or (hover: bogus)',
  '(width: 64vw)',
  '(height: 100vh)',
  '(width: 100vmax)',
  '(height: 100vmin)',
  '(width: 128ch)',
  '(width: 128ex)',
  '(width: 1024q)',
  '(width: 27.0933cm)',
  '(width: 64pc)',
  '(width: calc(1in))',
  '(width: calc(512px * 2))',
  '(width: calc(64em))',
  '(width: calc(1024px / 1))',
  '(width: min(1024px, 2000px))',
  '(width: max(1px, 1024px))',
  '(width: 1024.0000001px)',
  '(width: 1234567px)',
  '(width: 0.0000001px)',
  '(resolution: 2.54dpcm)',
  '(resolution: 37.7953dpcm)',
  '(min-resolution: 1.5x)',
  '(aspect-ratio: 8/6)',
  '(aspect-ratio: 1.33333)',
  '(aspect-ratio: 0/1)',
  '(min-aspect-ratio: 1.5)',
  '(min-color: -1)',
  '(width: 1024px!)',
  '(width:)',
  '()',
  '(1024px = width)',
  '(width = 1024px)',
  '(1023px < width < 1025px)',
  '(1025px > width >= 1024px)',
  '(1023px < width > 1px)',
  '(width <= 1024PX)',
  '(height >= 768px) and (orientation: landscape) and (hover)',
  '(width: 1024px) and (foo: bar)',
  '(min-width: 64ch)',
  '(min-width: 1ch)',
  '(width: 64ch)',
  '(width: 55.6522lh)',
  '(device-aspect-ratio)',
  '(device-width)',
  '(grid)',
  '(scan)',
  '(nav-controls)',
  '(environment-blending)',
  '(display-mode)',
  '(prefers-contrast)',
  '(prefers-reduced-motion)',
  '(forced-colors)',
  'not print and (foo: bar)',
  'screen and (foo)',
  'not tv',
  'not foo',
  'only foo',
  '(width) and (height)',
  'print and (color)',
  '(min-hover: hover)',
  '(hover > 1)',
  '(min-width: 1px 2px)',
  '(aspect-ratio: -1/2)',
  '(width: calc(1px + 1%))',
  'all and (color)',
  'ALL and (color)',
  'only all and (color)',
  'all',
  'all and (foo: bar)',
  'not all and (monochrome)',
];

parity(
  'jsdom 31: media queries written and evaluated',
  (w) => {
    const d = w.document;
    return QUERIES.map((q) => {
      d.head.innerHTML = `<style>@media ${q} {}</style>`;
      const rule = d.styleSheets[0]?.cssRules[0];
      return [q, rule ? `${rule.matches} ${rule.media.mediaText} ${rule.media.length}` : null];
    });
  },
  { jsdom: 31 },
);

parity(
  'jsdom 31: media lists edited and the cascade following them',
  (w) => {
    const d = w.document;
    d.head.innerHTML = '<style>@media print { #t { color: red } }</style>';
    d.body.innerHTML = '<div id="t"></div>';
    const t = d.getElementById('t');
    const rule = d.styleSheets[0].cssRules[0];
    const out = [w.getComputedStyle(t).color, rule.matches];
    rule.media.mediaText = '(min-width: 100px)';
    out.push(w.getComputedStyle(t).color, rule.matches, rule.media.mediaText);
    rule.media.appendMedium('(MIN-WIDTH:1PX)');
    out.push(rule.media.mediaText);
    rule.media.deleteMedium('(min-width: 100px)');
    out.push(rule.media.mediaText, rule.matches);
    rule.media.appendMedium('all and (color)');
    out.push(rule.media.mediaText);
    rule.media.mediaText = '(width: 1024.0000001px)';
    out.push(rule.media.mediaText, rule.matches, w.getComputedStyle(t).color);
    return out;
  },
  { jsdom: 31 },
);

parity(
  "jsdom 31: rules in @media and @supports apply as they match, at any depth; a style element's media",
  (w) => {
    const d = w.document;
    d.body.innerHTML = '<div id="t"></div>';
    const t = d.getElementById('t');
    const sheets = [
      '@media (min-width: 1000px) { #t { color: red } }',
      '@media (max-width: 600px) { #t { color: red } }',
      '@media screen and (orientation: landscape) and (hover) { #t { color: red } }',
      '@media (prefers-color-scheme: dark) { #t { color: red } }',
      '@media not print { #t { color: red } }',
      '@media screen { @supports (display: grid) { #t { color: red } } }',
      '@media print { @media screen { #t { color: red } } }',
      '@supports (display: grid) { #t { color: red } }',
      '@supports (display: foo) { #t { color: red } }',
      '@supports selector(div) { #t { color: red } }',
      '@supports (--x: ) { #t { color: red } }',
      '@supports foo(bar) or (display: grid) { #t { color: red } }',
      '@supports (width: calc(1px + ")")) { #t { color: red } }',
      '@supports (display: grid) and (color: red) or (x: y) { #t { color: red } }',
    ];
    const out = sheets.map((css) => {
      d.head.innerHTML = `<style>${css}</style>`;
      return [css, w.getComputedStyle(t).color];
    });
    d.head.innerHTML = '<style>#t { color: red }</style>';
    const style = d.querySelector('style');
    const sheet = d.styleSheets[0];
    out.push(w.getComputedStyle(t).color);
    style.media = 'print';
    out.push(w.getComputedStyle(t).color, d.styleSheets[0].media.mediaText, d.styleSheets[0] === sheet);
    style.media = '(min-width: 2000px), screen';
    out.push(w.getComputedStyle(t).color, sheet.media.mediaText);
    d.head.innerHTML = '<style media="(max-width: 100px)">#t { color: red }</style>';
    out.push(w.getComputedStyle(t).color);
    return out;
  },
  { jsdom: 31 },
);

const CONDITIONS = [
  '(display: grid)',
  '(display: foo)',
  'not (display: foo)',
  'selector(div)',
  'not selector(div)',
  'selector(:has(a))',
  'selector(::before)',
  'selector(div:foo)',
  'selector(a b)',
  'selector(a, b)',
  'selector(:hover)',
  'selector( div )',
  'selector(DIV)',
  '(--x: 1)',
  '(--x: )',
  '(--x:)',
  '(--x: ;)',
  '(--x: {})',
  '(display: grid) and selector(a)',
  'font-tech(color-COLRv1)',
  'font-tech( Variations )',
  'font-tech(foo)',
  'font-format(woff2)',
  'font-format("woff2")',
  'at-rule(@layer)',
  'at-rule(@foo)',
  'at-rule(media)',
  'foo(bar)',
  'foo(bar) or (display: grid)',
  'not foo(bar)',
  'NOT foo(x)',
  '(display: grid !important)',
  '(DISPLAY: GRID)',
  '(display: grid) AND (color: red)',
  '(display: grid)and (color: red)',
  '(display: grid)  OR  (x: y)',
  '(display: var(--x))',
  '(color: red; color: blue)',
  '((display: grid) or (foo: bar))',
  '(not (display: foo))',
  'not   (display:foo)',
  '(  display : grid  )',
  '(width: calc(1px + ")"))',
  '(display: grid) and',
  'foo',
  '(display: grid) and (color: red) or (x: y)',
  'not not (x: y)',
  // review round (#329)
  '(selector(div))',
  '(font-tech(variations))',
  'env(safe-area-inset-top)',
  'env(SAFE-AREA-MAX-INSET-LEFT)',
  'env(viewport-segment-width)',
  'env(foo)',
  'env(safe-area-inset-top, 1px)',
  'selector(div::not-a-real-pseudo)',
  'selector(div::-webkit-scrollbar)',
  'selector(div::part(x))',
  'selector(.a\\,b)',
  '(--x: "a;b")',
  '(--x: a;b)',
  '(cue-before: none)',
];

parity(
  'jsdom 31: @supports conditions written and evaluated; a condition that does not parse drops its rule',
  (w) => {
    const d = w.document;
    return CONDITIONS.map((c) => {
      d.head.innerHTML = `<style>@supports ${c} {}</style>`;
      const rule = d.styleSheets[0].cssRules[0];
      return [c, rule ? `${rule.matches} ${rule.conditionText}` : null];
    });
  },
  { jsdom: 31 },
);

parity(
  'jsdom 31: CSS.supports',
  (w) =>
    [
      ['--x', ''],
      ['--x', '  '],
      ['--x', ';'],
      ['--x', '{}'],
      ['color', 'red !important'],
      ['color', 'var(--x)'],
      ['COLOR', 'RED'],
      ['width', 'calc(1px + ")")'],
      ...CONDITIONS.map((c) => [c]),
      ['display: grid'],
      ['--y: 1'],
      ['--y:'],
      ['color: red !important'],
      ['display: grid; color: red'],
    ].map((args) => [args, w.CSS.supports(...args)]),
  { jsdom: 31 },
);

test('jsdom 31: a query is evaluated as written, not as its 6 digits', () => {
  assert.equal(serializeMedium31('(width: 1024.0000001px)'), '(width: 1024px)');
  assert.equal(mediumMatches31('(width: 1024.0000001px)'), false);
  assert.equal(mediumMatches31('(width: 1024px)'), true);
});

test('jsdom 30 keeps media features unevaluated and @supports rules unapplied', () => {
  const w = createWindow({ jsdom: '30.1.3' });
  const d = w.document;
  d.head.innerHTML =
    '<style>@media (min-width: 100px) { #t { color: red } } @supports (display: grid) { #t { background-color: red } }</style>';
  d.body.innerHTML = '<div id="t"></div>';
  const cs = w.getComputedStyle(d.getElementById('t'));
  assert.equal(cs.color, 'rgb(0, 0, 0)');
  assert.equal(cs.backgroundColor, 'rgba(0, 0, 0, 0)');
  assert.equal(d.styleSheets[0].cssRules[0].matches, false);
  assert.equal(d.styleSheets[0].cssRules[0].media.mediaText, '(min-width: 100px)');
});

// Review round (#329).
parity(
  "jsdom 31: prefers-color-scheme reads the document's meta color-scheme, live",
  (w) => {
    const d = w.document;
    const out = [];
    for (const content of ['dark', 'light', 'light dark', 'dark light', 'only dark', 'DARK', 'dark foo', '']) {
      d.head.innerHTML = `<meta name="color-scheme" content="${content}"><style>@media (prefers-color-scheme: dark) { #t { color: red } } @media (prefers-color-scheme: light) { #t { background-color: red } }</style>`;
      d.body.innerHTML = '<div id="t"></div>';
      const cs = w.getComputedStyle(d.getElementById('t'));
      out.push([content, d.styleSheets[0].cssRules[0].matches, cs.color, cs.backgroundColor]);
    }
    d.head.innerHTML = '<style>@media (prefers-color-scheme: dark) { #t { color: red } }</style>';
    const rule = d.styleSheets[0].cssRules[0];
    out.push([rule.matches, w.getComputedStyle(d.getElementById('t')).color]);
    const meta = d.createElement('meta');
    meta.name = 'color-scheme';
    meta.content = 'dark';
    d.head.append(meta);
    out.push([rule.matches, w.getComputedStyle(d.getElementById('t')).color]);
    d.head.innerHTML =
      '<meta name="color-scheme" content="light"><meta name="color-scheme" content="dark"><style>@media (prefers-color-scheme: dark) {}</style>';
    out.push(d.styleSheets[0].cssRules[0].matches);
    return out;
  },
  { jsdom: 31 },
);

parity(
  "jsdom 31: a style element's media attribute and its sheet's media list",
  (w) => {
    const d = w.document;
    d.head.innerHTML = '<style media="screen">#t { color: red }</style>';
    d.body.innerHTML = '<div id="t"></div>';
    const style = d.querySelector('style');
    const media = style.sheet.media;
    style.media = 'print';
    const out = [media.mediaText];
    media.mediaText = 'print';
    style.media = 'screen';
    out.push(media.mediaText, w.getComputedStyle(d.getElementById('t')).color);
    return out;
  },
  { jsdom: 31 },
);

parity(
  'jsdom 31: MediaList edits: queries compared as written, two queries deleted as none, a throwing value',
  (w) => {
    const d = w.document;
    d.head.innerHTML = '<style>@media foo("a( b") {} @media not all {} @media print {}</style>';
    const [a, b, c] = [...d.styleSheets[0].cssRules].map((r) => r.media);
    a.appendMedium('foo("a(b")');
    b.deleteMedium('screen, print');
    try {
      c.mediaText = {
        toString() {
          throw new Error('x');
        },
      };
    } catch {
      // (the list stays)
    }
    return [a.mediaText, b.mediaText, c.mediaText];
  },
  { jsdom: 31 },
);

// (jsdom 31 also reports "Could not parse CSS stylesheet" for these, which
// warpdom does not: values measured on 31.0.1)
test('jsdom 31: a style sheet nested more than 128 deep has no rules', () => {
  const w = createWindow({ jsdom: '31.0.1' });
  const d = w.document;
  const nest = (n) => `${'('.repeat(n)}a${')'.repeat(n)}`;
  const counts = [127, 128, 129, 5000].map((n) => {
    d.head.innerHTML = `<style>x { --v: ${nest(n)}; } @media ${nest(n)} { b { color: red } } c {}</style>`;
    return d.styleSheets[0].cssRules.length;
  });
  assert.deepEqual(counts, [3, 0, 0, 0]);
  const e = d.createElement('div');
  e.setAttribute('style', `--v: ${nest(200)}; color: red`);
  assert.equal(e.style.length, 2);
});

test('jsdom 31: a ] or } closing nothing in a @supports condition drops the rule', () => {
  const w = createWindow({ jsdom: '31.0.1' });
  const d = w.document;
  d.head.innerHTML =
    '<style>@supports not (]) { #t { color: red } } @supports not (}) {} @supports not (x: y) {}</style>';
  d.body.innerHTML = '<div id="t"></div>';
  assert.equal(d.styleSheets[0].cssRules.length, 1);
  assert.equal(w.getComputedStyle(d.getElementById('t')).color, 'rgb(0, 0, 0)');
});

test('jsdom 31: a query nested thousands deep does not throw', () => {
  const deep = `${'('.repeat(20000)}color${')'.repeat(20000)}`;
  assert.equal(typeof serializeMedium31(deep), 'string');
  assert.equal(mediumMatches31(deep), false);
});

// Second review round (#329).
parity(
  'jsdom 31: comments, escaped quotes and strings in media lists and CSS.supports; deleteMedium converts once',
  (w) => {
    const d = w.document;
    d.head.innerHTML = '<style>@media print {} @media screen, print {}</style>';
    const [a, b] = [...d.styleSheets[0].cssRules].map((r) => r.media);
    const out = [];
    for (const text of ['foo("a\\"b")', 'screen /* comment */ and (color)', '/* c */ (color)']) {
      a.mediaText = text;
      out.push([text, a.mediaText, d.styleSheets[0].cssRules[0].matches]);
    }
    let calls = 0;
    b.deleteMedium({
      toString() {
        return calls++ ? 'print' : 'screen';
      },
    });
    out.push([b.mediaText, calls]);
    for (const c of [
      '(display: grid) /* comment */ and (color: red)',
      '/* a */ (display: grid)',
      'selector([data-label="::made-up"])',
      'selector([data-label="::before"])',
      'not (x: "a\\"b")',
    ])
      out.push([c, w.CSS.supports(c)]);
    return out;
  },
  { jsdom: 31 },
);

// (jsdom 31 reports "Could not parse CSS stylesheet" for the sheets here:
// values measured on 31.0.1)
test('jsdom 31: a ] or } closing nothing in a function invalidates a query or a @supports prelude', () => {
  const w = createWindow({ jsdom: '31.0.1' });
  const d = w.document;
  d.head.innerHTML =
    '<style>@media foo(]) {} @media (color) and foo(}x) {} @supports not foo(]) {} @supports not foo(}) {}</style>';
  const rules = [...d.styleSheets[0].cssRules];
  assert.deepEqual(
    rules.map((r) => r.media?.mediaText),
    ['not all', 'not all'],
  );
  assert.equal(w.CSS.supports('not foo(])'), false);
});

// Third review round (#329).
parity(
  'jsdom 31: CSS.supports with a block left open, comments in a value, escaped pseudo-element names',
  (w) =>
    [
      ['not foo([)'],
      ['not ([)'],
      ['not ({)'],
      ['--x', '/* ; */'],
      ['--x', '/* ( */ ;'],
      ['selector(div::b\\65 fore)'],
      ['selector(div::\\6d ade-up)'],
    ].map((args) => [args, w.CSS.supports(...args)]),
  { jsdom: 31 },
);

// Escaped identifiers are read decoded (#329, a closer look).
parity(
  'jsdom 31: escapes in media queries and @supports conditions',
  (w) => {
    const d = w.document;
    const out = [];
    for (const q of [
      '(m\\in-width: 100px)',
      '\\73 creen',
      '(\\77 idth: 1024px)',
      '(hover: \\68 over)',
      'sc\\72 een and (color)',
    ])
      out.push([
        q,
        ...(() => {
          d.head.innerHTML = `<style>@media ${q} {}</style>`;
          const rule = d.styleSheets[0].cssRules[0];
          return [rule.matches, rule.media.mediaText];
        })(),
      ]);
    for (const c of [
      'n\\6f t (x: y)',
      '(display: grid) \\61 nd (color: red)',
      'sel\\65 ctor(div)',
      '(\\64 isplay: grid)',
    ]) {
      d.head.innerHTML = `<style>@supports ${c} {}</style>`;
      const rule = d.styleSheets[0].cssRules[0];
      out.push([c, rule?.matches, rule?.conditionText, w.CSS.supports(c)]);
    }
    return out;
  },
  { jsdom: 31 },
);

// Fourth review round (#329).
parity(
  'jsdom 31: CSS.supports with -- alone as the name',
  (w) => [w.CSS.supports('--', '1'), w.CSS.supports('(--: 1)'), w.CSS.supports('--x', '1')],
  { jsdom: 31 },
);

test('jsdom 31: a long run of hex escapes in a condition is read in linear time', () => {
  const w = createWindow({ jsdom: '31.0.1' });
  const condition = `(${'\\aaaaaa'.repeat(5000)}!: 1)`;
  const start = performance.now();
  assert.equal(w.CSS.supports(condition), false);
  assert.ok(performance.now() - start < 500);
});

// Custom properties in CSS.supports, and input left open (#329, a closer look).
parity(
  'jsdom 31: CSS.supports with custom property values and conditions left open',
  (w) =>
    [
      ['--x', ')'],
      ['--x', 'a)b'],
      ['--x', '}'],
      ['--x', '('],
      ['--x', '"a'],
      ['--x', '!important'],
      ['--x', 'a !important'],
      ['--x', 'a!b'],
      ['--x', '(!)'],
      ['--x', '{;}'],
      ['(--x: !important)'],
      ['(--x: a !important)'],
      ['(--x: a!b)'],
      ['(--x: "a)'],
      ['(display: grid'],
      ['not (display: foo'],
      ['(display: grid) and (color: red'],
      ['selector(div'],
      ['((display: grid)'],
      ['(--x: (a'],
      ['not ([)'],
    ].map((args) => [args, w.CSS.supports(...args)]),
  { jsdom: 31 },
);

// The depth limit counts blocks only (#329, a closer look). (jsdom 31
// reports "Could not parse CSS stylesheet" for the url() one, which warpdom
// does not: values measured on 31.0.1)
test('jsdom 31: parentheses in comments, strings, escapes and unquoted url() do not count toward the depth limit', () => {
  const w = createWindow({ jsdom: '31.0.1' });
  const open = '('.repeat(200);
  const counts = [
    `/* ${open} */ a {} b {}`,
    `a { content: "${open}" } b {}`,
    `a { --v: ${'\\('.repeat(200)} } b {}`,
    `a { background: url(${open}) } b {}`,
    `a { background: url("${open}") } b {}`,
    `a[title="${open}"] {} b {}`,
    // (a name ending in url is no url(): myurl( and #url( nest)
    `a { --v: URL(${open}) } b {}`,
    `a { --v: url(a\\)${open}) } b {}`,
    `a { --v: myurl(${open}${')'.repeat(200)}) } b {}`,
    `a { --v: #url(${open}${')'.repeat(200)}) } b {}`,
  ].map((css) => {
    w.document.head.innerHTML = `<style>${css}</style>`;
    return w.document.styleSheets[0].cssRules.length;
  });
  assert.deepEqual(counts, [2, 2, 2, 2, 2, 2, 2, 2, 0, 0]);
});
