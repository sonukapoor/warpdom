// jsdom 31's descriptor interfaces (black box, 31.0.1; #269 part G2):
// CSSFontFaceDescriptors (@font-face, each descriptor by its grammar),
// CSSPageDescriptors (@page: the page context's properties and the page
// descriptors) and CSSMarginDescriptors (the margin boxes). jsdom 30 has
// none of them as globals; warpdom's older profiles keep their @page (the
// margins, size, page-orientation, marks and bleed).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parity } from './parity.js';
import { createWindow } from '../src/node.js';

const sheetOf = (d, text) => {
  const style = d.createElement('style');
  style.textContent = text;
  d.head.append(style);
  return style.sheet;
};
const items = (style) => [...Array(style.length).keys()].map((i) => style.item(i)).join(',');
const read = (style) => [Object.prototype.toString.call(style), style.cssText, items(style)];
const fontFace = (d, body) => sheetOf(d, `@font-face { ${body} }`).cssRules[0].style;
const page = (d, body) => sheetOf(d, `@page { ${body} }`).cssRules[0].style;
const margin = (d, body) => sheetOf(d, `@page { @top-left { ${body} } }`).cssRules[0].cssRules[0].style;
const attempt = (f) => {
  try {
    return f();
  } catch (e) {
    return e.name;
  }
};

const FONT_FACE = [
  'font-family: X',
  'font-family: "A B", serif',
  'font-family: a b',
  'font-family: serif',
  'font-family: "serif"',
  'font-family: 1',
  'font-family: "X"',
  "font-family: 'X Y'",
  'font-family: \\58',
  'font-family: default',
  'src: url(a.woff) format("woff"), local(X)',
  'src: local("A B")',
  'src: bogus',
  'src: url(a) format(woff2) tech(variations)',
  "src: url('a') format('woff')",
  'src: local(serif)',
  'src: url(a), ',
  'src: url(a), bogus',
  'src: bogus, url(a)',
  'src: url(a),,url(b)',
  'src: url(a) format(bogus), url(b)',
  'src: url(a) format("x", "y")',
  'src: url(a) tech(color-COLRv1)',
  'src: URL(a)',
  'src: url(a) bogus',
  'src: local(1)',
  'src: url(a) tech(variations) format(woff)',
  'src: local( X )',
  'src: url(a) FORMAT(woff)',
  'src: src("a")',
  'src: src(a)',
  'src: url()',
  'font-weight: bold',
  'font-weight: 100 400',
  'font-weight: 400 100',
  'font-weight: bolder',
  'font-weight: 0',
  'font-weight: 1000',
  'font-weight: 1001',
  'font-weight: 1.5',
  'font-weight: calc(100 + 100)',
  'font-weight: BOLD',
  'font-weight: 100 100',
  'font-weight: 100 400 700',
  'font-style: oblique 10deg 20deg',
  'font-style: oblique 100deg',
  'font-style: OBLIQUE 10DEG',
  'font-style: oblique 0.5turn',
  'font-style: oblique 100grad',
  'font-style: oblique 10deg 10deg',
  'font-style: normal italic',
  'font-style: left',
  'font-stretch: 50%',
  'font-stretch: condensed',
  'font-width: 50% 100%',
  'font-width: -1%',
  'font-width: 50% 50%',
  'unicode-range: U+0-7F',
  'unicode-range: u+0-7f, U+4??',
  'unicode-range: U+110000',
  'unicode-range: U+1',
  'unicode-range: U+0',
  'unicode-range: U+0-0',
  'unicode-range: U+0, U+1',
  'unicode-range: U+?',
  'unicode-range: U+FF-00',
  'unicode-range: U+00000041',
  'unicode-range: U+41-42',
  'unicode-range: U+9-10',
  'unicode-range: U+10-11',
  'unicode-range: U+41-4A',
  'unicode-range: U+1A-12',
  'unicode-range: U+1-FFFFFF',
  'unicode-range: U+ABCDEF',
  'unicode-range: x',
  'font-display: SWAP',
  'font-display: bogus',
  'size-adjust: 90%',
  'size-adjust: -1%',
  'size-adjust: calc(10% + 10%)',
  'ascent-override: 80% 90%',
  'ascent-override: normal normal',
  'ascent-override: -1%',
  'line-gap-override: normal normal',
  'superscript-position-override: FROM-FONT 1%',
  'superscript-size-override: -1%',
  'font-feature-settings: "liga" 1',
  'font-feature-settings: "liga" on',
  'font-feature-settings: "liga" off',
  'font-feature-settings: "smcp", "liga" 2',
  'font-feature-settings: "toolong"',
  'font-feature-settings: "lig" 1',
  'font-feature-settings: liga',
  "font-variation-settings: 'wght' 1E2",
  'font-variation-settings: "toolong" 1',
  'font-variation-settings: "wght"',
  "font-language-override: 'TRK'",
  'font-language-override: TRK',
  'font-named-instance: AUTO',
  'font-size: 12px',
  'font-size: 10 20',
  'font-size: 10 10',
  'font-size: 0',
  'font-size: 0 0',
  'font-family: "var(--face)"',
  'src: url("fonts/var(x).woff2"), url("ok.woff2")',
  'src: local("var(x)")',
  'src: var(--x), url(a)',
  'src: url(a), var(--x)',
  'font-feature-settings: "var(" 1',
  'color: red',
  'font: 12px serif',
  '--x: 1',
  'FONT-FAMILY: X',
  'font-family: X !important',
  'font-family: X; font-family: 1',
  'font-family: var(--x)',
  'font-display: inherit',
  'font-weight: initial',
];
const PAGE = [
  'margin: 1cm 2cm',
  'margin: bogus',
  'background: url(a) no-repeat',
  'background-clip: text',
  'border: 1px solid red',
  'border-width: 1px',
  'border-style: solid',
  'border-radius: 1px',
  'color: red',
  'content: "x"',
  'z-index: 1',
  'display: none',
  'font: 12px serif',
  'font-stretch: 50%',
  'padding-inline: 1px',
  'outline-offset: 1px',
  'counter-increment: a',
  'text-align: center',
  'text-decoration-color: red',
  'white-space: nowrap',
  'max-height: none',
  'size: a4',
  'size: A4',
  'size: 0',
  'size: 1px 2px',
  'size: -1px',
  'size: a4 landscape',
  'size: auto auto',
  'size: bogus',
  'size: inherit',
  'size: var(--x)',
  'page-orientation: upright',
  'bleed: 0',
  'bleed: -1px',
  'bleed: AUTO',
  'marks: cross crop',
  'marks: none crop',
  'page-margin-safety: auto',
  'page-margin-safety: add',
  'page-margin-safety: clamp add',
  '--x: 1',
  'color: red !important',
  'color: var(--x)',
  'margin: 1px !important; margin-top: 2px',
  'border: 1px solid red; border-top-color: blue',
  'background: blue; background-color: red',
  // (an @ in a string or url starts no rule; #354 review)
  'background-image: url("/img/@2x.png"); size: A4',
  'background-image: url(/img/@2x.png); size: A4',
  'quotes: "@a" "b"; size: A4',
  'background-image: url("/a@b.png"); @top-left { content: "x" } size: A4',
  // (width and height are properties here, not size's longhands; #354
  // review)
  'width: inherit; height: inherit; size: a4',
  'width: inherit; height: inherit',
  'size: a4; width: inherit; height: inherit',
  'width: initial; height: initial; size: a4',
  'width: 1px; height: 2px',
  // (an @ inside a value's brackets starts no rule)
  '--x: { @top-left { content: "x" } }',
  '--x: { @top-left { content: "x" } }; @top-right { content: "y" }',
  '--x: [ @top-left{} ]',
  '--x: ( @top-left{} ); margin: 1px',
];
const MARGIN = [
  'content: counter(page)',
  'content: bogus',
  'overflow: hidden auto',
  'unicode-bidi: embed',
  'vertical-align: 1px',
  'z-index: auto',
  'size: a4',
  'bleed: 1px',
  'page-margin-safety: auto',
  'margin: 1px',
  'display: none',
  'border: 1px solid',
  '--x: 1',
  'color: red !important',
];

parity("jsdom 31's @font-face descriptors", (w) => FONT_FACE.map((body) => [body, read(fontFace(w.document, body))]), {
  jsdom: 31,
});
parity("jsdom 31's @page descriptors", (w) => PAGE.map((body) => [body, read(page(w.document, body))]), { jsdom: 31 });
parity(
  "jsdom 31's @page margin rules, at its top level only",
  (w) =>
    [
      '--x: { @top-left { content: "x" } }',
      '--x: { @top-left { content: "x" } }; @top-right { content: "y" }',
      '--x: [ @top-left{} ]',
      '--x: ( @top-left{} ); margin: 1px',
      'color: red; @top-left { --y: { @bottom-left {} } }',
    ].map((body) => {
      const rule = sheetOf(w.document, `@page { ${body} }`).cssRules[0];
      return [body, rule.cssText, [...rule.cssRules].map((r) => r.cssText)];
    }),
  { jsdom: 31 },
);
parity("jsdom 31's margin box descriptors", (w) => MARGIN.map((body) => [body, read(margin(w.document, body))]), {
  jsdom: 31,
});

parity(
  "jsdom 31's descriptors set, and their interfaces",
  (w) => {
    const d = w.document;
    const set = (style, f) =>
      attempt(() => {
        f(style);
        return style.cssText;
      });
    const font = fontFace(d, 'font-family: X');
    const pageStyle = page(d, 'margin: 1px');
    const marginStyle = margin(d, 'color: red');
    return [
      set(font, (s) => {
        s.fontDisplay = 'swap';
        s.setProperty('font-weight', 'bold', 'important');
        s.setProperty('color', 'red');
        s.fontStretch = '50%';
        s.src = 'bogus';
        s.unicodeRange = 'U+0';
        s.setProperty('--y', '1');
      }),
      [font.fontStretch, font.fontWidth, font.getPropertyValue('font-stretch')],
      set(fontFace(d, 'font-family: X'), (s) => {
        s.cssText = 'src: url(a); color: red; font-family: Y !important; font-weight: 1 2';
        s.removeProperty('src');
        s.fontFamily = '';
      }),
      set(pageStyle, (s) => {
        s.color = 'red';
        s.zIndex = '1';
        s.setProperty('content', '"x"');
        s.setProperty('background', 'blue', 'important');
        s.size = 'a4';
        s.marginTop = '2px';
        s.display = 'none';
      }),
      [pageStyle.size, pageStyle.getPropertyValue('size'), pageStyle.getPropertyPriority('background')],
      set(page(d, 'margin: 1px'), (s) => {
        s.cssText = 'color: red; z-index: 1; border: 1px solid; size: a4';
        s.removeProperty('border');
        s.removeProperty('size');
      }),
      set(marginStyle, (s) => {
        s.content = '"y"';
        s.size = 'a4';
        s.zIndex = '3';
        s.setProperty('overflow', 'clip', 'important');
        s.setProperty('display', 'none');
        s.bleed = '1px';
      }),
      [
        'zIndex' in font,
        'color' in font,
        'fontStretch' in font,
        'zIndex' in pageStyle,
        'content' in pageStyle,
        'size' in marginStyle,
        'zIndex' in marginStyle,
      ],
      ['CSSFontFaceDescriptors', 'CSSPageDescriptors', 'CSSMarginDescriptors'].map((name) => [
        Object.getPrototypeOf(w[name].prototype) === w.CSSStyleDeclaration.prototype,
        Object.getOwnPropertyNames(w[name].prototype).length,
        attempt(() => new w[name]()),
      ]),
      [
        ...sheetOf(
          d,
          '@font-face { font-family: X; color: red } @page :first { color: red; z-index: 1; @top-left { size: a4; content: "a" } @bottom-center { } }',
        ).cssRules,
      ].map((r) => r.cssText),
    ];
  },
  { jsdom: 31 },
);

// src drops each source with a bad url or a closer of nothing, and keeps
// the others (#354 review; measured on 31.0.1, which also reports "Could
// not parse CSS stylesheet" for these).
test("jsdom 31's @font-face src with bad sources", () => {
  const d = createWindow({ jsdom: '31.0.1' }).document;
  assert.deepEqual(
    [
      'src: url(a(b)), url(c)',
      'src: url(fonts/var(x).woff2), url("ok.woff2")',
      'src: url(a b) x, url(c)',
      'src: url(c) ), url(d)',
      'src: url(c), ]',
      'src: url(a b)',
      'font-family: x ) ; src: url(c)',
    ].map((body) => fontFace(d, body).cssText),
    [
      'src: url("c");',
      'src: url("ok.woff2");',
      'src: url("c");',
      'src: url("d");',
      'src: url("c");',
      '',
      'src: url("c");',
    ],
  );
});

// The properties' rules the descriptors share: font-feature-settings'
// values and tags, an angle's bounds in degrees, src() as a url().
parity(
  "jsdom 31's font-feature-settings, oblique angles and src()",
  (w) => {
    const style = w.document.createElement('p').style;
    return [
      ['font-feature-settings', '"liga" 1'],
      ['font-feature-settings', '"liga" on'],
      ['font-feature-settings', '"liga" off'],
      ['font-feature-settings', '"smcp", "liga" 1'],
      ['font-feature-settings', '"toolong"'],
      ['font-feature-settings', '"lig" 1'],
      ['font-style', 'oblique 0.5turn'],
      ['font-style', 'oblique 100grad'],
      ['font-style', 'oblique 1.5rad'],
      ['font-style', 'oblique 91deg'],
      ['background-image', 'src("a")'],
      ['background-image', 'src(a)'],
    ].map(([name, value]) => {
      style.cssText = '';
      style.setProperty(name, value);
      return [name, value, style.getPropertyValue(name)];
    });
  },
  { jsdom: 31 },
);

// (jsdom 30's @page itself differs by design: PLAN.md, "@page rules are
// grouping rules with CSSMarginRule children")
parity('jsdom 30 has no @font-face or margin box descriptors', (w) => [
  'CSSFontFaceDescriptors' in w,
  'CSSMarginDescriptors' in w,
  'CSSPageDescriptors' in w,
]);
