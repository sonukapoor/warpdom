// jsdom 31's newer CSSOM rules (black box, 31.0.1; #269 part F1):
// @starting-style, @font-feature-values, @font-palette-values,
// @position-try and @view-transition, as rules of their own interfaces.
// jsdom 30 drops them.
import { parity } from './parity.js';

const INTERFACES = [
  'CSSStartingStyleRule',
  'CSSFontFeatureValuesRule',
  'CSSFontPaletteValuesRule',
  'CSSPositionTryRule',
  'CSSPositionTryDescriptors',
  'CSSViewTransitionRule',
];

const attempt = (f) => {
  try {
    const value = f();
    return value === undefined ? 'ok' : value;
  } catch (e) {
    return `${e.name}: ${e.message}`;
  }
};
// (insertRule's messages differ in jsdom 31 for every rule: part F3)
const errorName = (f) => {
  try {
    return f();
  } catch (e) {
    return e.name;
  }
};
// Each text's rules: interface, type and cssText, and what read(rule) gives.
const rulesOf = (w, text, read) => {
  const style = w.document.createElement('style');
  style.textContent = text;
  w.document.head.append(style);
  const out = [...style.sheet.cssRules].map((r) => [
    r.constructor.name,
    r.type,
    r.cssText,
    ...(read ? [attempt(() => read(r))] : []),
  ]);
  style.remove();
  return out;
};
const each = (w, texts, read) => texts.map((text) => [text, rulesOf(w, text, read)]);

parity(
  'jsdom 30: none of the newer rule interfaces, their rules dropped',
  (w) => [
    INTERFACES.map((name) => name in w),
    rulesOf(
      w,
      '@starting-style { a {} } @font-feature-values A {} @font-palette-values --p { font-family: A } @position-try --t {} @view-transition {}',
    ),
  ],
  { jsdom: 30 },
);

parity(
  'jsdom 31: the newer rule interfaces and their members',
  (w) =>
    INTERFACES.map((name) => {
      const proto = w[name].prototype;
      const members = Object.getOwnPropertyNames(proto).filter((k) => k !== 'constructor');
      const kinds = members.sort().map((k) => {
        const d = Object.getOwnPropertyDescriptor(proto, k);
        if (!d.get) return k;
        return `${k}${d.set ? ':gs' : ':g'}`;
      });
      return [name, Object.getPrototypeOf(proto).constructor.name, kinds.join(' '), attempt(() => new w[name]())];
    }),
  { jsdom: 31 },
);

parity(
  'jsdom 31: @starting-style is a grouping rule whose rules the cascade does not apply',
  (w) => {
    const d = w.document;
    d.body.innerHTML = '<p>p</p>';
    const style = d.createElement('style');
    style.textContent = '@starting-style { p { color: red } }';
    d.head.append(style);
    const rule = style.sheet.cssRules[0];
    const out = [
      w.getComputedStyle(d.body.firstChild).color,
      rule instanceof w.CSSGroupingRule,
      rule.cssRules.length,
      errorName(() => rule.insertRule('q { color: blue }', 1)),
      errorName(() => rule.insertRule('@import url("a.css");', 0)),
      errorName(() => rule.insertRule('@media all { b {} }', 0)),
      rule.cssText,
      attempt(() => rule.deleteRule(0)),
      rule.cssRules[0].parentRule === rule,
      rule.parentStyleSheet === style.sheet,
    ];
    style.remove();
    return [
      out,
      each(w, [
        '@starting-style {}',
        '@starting-style { color: red }',
        '@starting-style x { p {} }',
        '@starting-style { @starting-style { p {} } }',
        '@media all { @starting-style { p {} } }',
        '@starting-style { @media all { p {} } @layer x { q {} } @font-face { font-family: a } @import "a.css"; @namespace x "y"; }',
      ]),
    ];
  },
  { jsdom: 31 },
);

parity(
  'jsdom 31: @font-feature-values: family names, font-display and the feature blocks',
  (w) =>
    each(
      w,
      [
        '@font-feature-values Font One { font-display: swap; @styleset { nice-style: 12; other: 1 2 } @swash { s: 1 } @annotation{a:1}@ornaments{o:2}@stylistic{st:3}@character-variant{cv:1 2}@historical-forms{h:1} }',
        '@font-feature-values "Font One" { @styleset { nice-style: 12; } }',
        '@font-feature-values { @styleset { a: 1 } }',
        '@font-feature-values A, "B C", d e { }',
        '@font-feature-values A { @styleset { a: 1; b: x; c: -1; d: 1.5; e: 1 2 3 } }',
        '@font-feature-values A { @swash { a: 1 2 } @swash { b: 3 } @unknown { c: 1 } }',
        '@font-feature-values A { @swash { a: 1 } @swash { b: 2 } }',
        '@font-feature-values A { @swash { b: 1; a: 2; b: 3 } }',
        '@font-feature-values A { @swash { b: 1; a: 2 } }',
        '@font-feature-values A { @STYLESET { A: 1 } }',
        '@font-feature-values A { font-display: block; font-display: swap; color: red }',
        '@font-feature-values A { font-display: SWAP } @font-feature-values B { font-display: foo }',
        '@font-feature-values A { font-display: block !important }',
        '@font-feature-values A { @styleset { a: 01 +2 0 } @stylistic { b: 0 } }',
        '@font-feature-values A { @styleset { a: 1, 2 } @styleset { c: 1 !important } }',
        '@font-feature-values A { @styleset { a: 1e1; b: 1.0; c: 21; d: 20 0 } }',
        '@font-feature-values A { @character-variant { a: 1; b: 1 2; c: 1 2 3; d: 99 1; e: 100 1; f: 0 65536 } }',
        '@font-feature-values A { @swash { a: 0; b: -0; c: 2147483648 } @ornaments { d: 99999 } }',
        '@font-feature-values A { @styleset { a: 1 /* x */ 2 } }',
        '@font-feature-values A { @styleset { 1a: 1; -b: 2; --c: 3; "d": 4 } }',
        '@font-feature-values A { @styleset { a: 1 } a { color: red } @media all {} }',
        '@font-feature-values A{@styleset{a:1}}',
        '@font-feature-values A { @styleset {} @character-variant { a: 1 2 3 } }',
        '@font-feature-values A { @styleset { a: 1 } font-display: swap }',
        '@media all { @font-feature-values A { } }',
      ],
      (r) => r.fontFamily,
    ),
  { jsdom: 31 },
);

parity(
  'jsdom 31: font family names of @font-feature-values and @font-palette-values',
  (w) => {
    const families = [
      'A serif',
      'serif A',
      'inherit A',
      'A inherit',
      'default',
      'Default',
      'SERIF',
      'Serif',
      '"A"',
      '"A" B',
      'A "B"',
      '"a b"',
      '"a b c"',
      'a  b',
      'a/**/b',
      '"1a"',
      '"a  b"',
      '" a"',
      '"a-b"',
      '"-a"',
      '"--a"',
      '"-"',
      '"-1a"',
      '-',
      '"a\\"b"',
      '"a\\\\b"',
      '"\\31 a"',
      'a\\,b',
      '"a.b"',
      '"system-ui"',
      '"inherit"',
      '"default"',
      '"emoji"',
      'system-ui',
      'math',
      'emoji',
      'fangsong',
      'ui-serif',
      'ui-sans-serif',
      'ui-monospace',
      'ui-rounded',
      'cursive',
      'fantasy',
      'monospace',
      'sans-serif',
      'initial',
      'unset',
      'revert',
      'revert-layer',
      '"Ä"',
      'Ä \\31 x',
      '"日本"',
      '"a_b"',
      '"_a"',
      '""',
      '"serif", A',
      'A,, B',
      'A B , C',
    ];
    return families.map((family) => [
      family,
      rulesOf(w, `@font-feature-values ${family} { }`, (r) => r.fontFamily),
      rulesOf(w, `@font-palette-values --p { font-family: ${family} }`, (r) => r.fontFamily),
    ]);
  },
  { jsdom: 31 },
);

parity(
  'jsdom 31: CSSFontFeatureValuesRule.fontFamily takes a valid family list only',
  (w) => {
    const style = w.document.createElement('style');
    style.textContent = '@font-feature-values A, B { @styleset { x: 1 } }';
    w.document.head.append(style);
    const r = style.sheet.cssRules[0];
    const out = [];
    for (const value of ['Z, "Q r"', '', '1x', 'serif', '"x y"', 'a  b', null, 'inherit'])
      out.push(
        attempt(() => {
          r.fontFamily = value;
        }),
        r.fontFamily,
        r.cssText,
      );
    style.remove();
    return out;
  },
  { jsdom: 31 },
);

parity(
  'jsdom 31: @font-palette-values: name, font-family, base-palette and override-colors',
  (w) =>
    each(
      w,
      [
        '@font-palette-values --p { font-family: X, "Y z"; base-palette: light; override-colors: 0 red, 1 blue }',
        '@font-palette-values p { font-family: X }',
        '@font-palette-values --p { }',
        '@font-palette-values --p { base-palette: 1 }',
        '@font-palette-values --p { color: red; font-family: A; font-family: B; base-palette: 3 }',
        '@font-palette-values --p { font-family: A !important; base-palette: 1 }',
        '@font-palette-values --P { font-family: A } @font-palette-values -- { font-family: A } @font-palette-values --a --b { font-family: A }',
        '@font-palette-values --p { font-family: A; base-palette: -1 } @font-palette-values --q { font-family: A; base-palette: foo }',
        '@font-palette-values --p { font-family: A; base-palette: 0 } @font-palette-values --q { font-family: A; base-palette: -0 } @font-palette-values --r { font-family: A; base-palette: +3 } @font-palette-values --s { font-family: A; base-palette: Dark }',
        '@font-palette-values --p { font-family: A; base-palette: 1; base-palette: foo; override-colors: 01 red, 0 blue }',
        '@font-palette-values --p { font-family: A; override-colors: 0 red, 0 blue; base-palette: 2147483648 }',
        '@font-palette-values --p { font-family: A; override-colors: 0 red !important; base-palette: dark !important }',
        '@font-palette-values --p { font-family: A; override-colors: red 0 } @font-palette-values --q { font-family: A; override-colors: -1 red } @font-palette-values --r { font-family: A; override-colors: 1.5 red } @font-palette-values --s { font-family: A; override-colors: 0 red 1 blue }',
        ...[
          'RED',
          'transparent',
          'currentColor',
          '#f00',
          '#f008',
          '#ff000080',
          'rgb(1 2 3 / 50%)',
          'rgba(0,0,0,.5)',
          'hsl(0,100%,50%)',
          'hwb(0 0% 0%)',
          'lab(50 0 0)',
          'color(srgb 1 0 0)',
          'Canvas',
          'color-mix(in srgb, red, blue)',
          'light-dark(red, blue)',
          'rebeccapurple',
          'RGB(1,2,3)',
          'rgb(300,0,0)',
        ].map((c) => `@font-palette-values --p { font-family: A; override-colors: 0 ${c} }`),
        '@font-palette-values --p { font-family: A; override-colors: 0 red, 1 Canvas }',
      ],
      (r) => [r.name, r.fontFamily, r.basePalette, r.overrideColors],
    ),
  { jsdom: 31 },
);

parity(
  'jsdom 31: @position-try: its name and descriptors (CSSPositionTryDescriptors)',
  (w) => {
    const out = each(
      w,
      [
        '@position-try --t { top: 1px; left: anchor(--a right); color: red; margin: 1px 2px }',
        '@position-try t { top: 1px }',
        '@position-try --t { }',
        '@position-try --t { top: 1px !important }',
        '@position-try --t { top: 1px; top: 2px } @position-try --T {} @position-try -- {} @position-try --a --b {}',
        '@position-try --t { inset: 1px; margin: 1px 2px; position-area: top; width: anchor-size(width); align-self: center; -webkit-align-self: end; place-self: start; color: red; top: foo }',
        '@position-try --t { min-width: 1px; max-inline-size: 2px; inset-block: 1px 2px; margin-inline-start: 1PX; position-anchor: --a }',
        '@position-try --t { -webkit-align-self: end } @position-try --u { align-self: end; -webkit-align-self: start }',
        '@position-try --t { inset: 1px; top: 2px }',
        '@position-try --t { top: anchor(--a bottom, 10px); width: anchor-size(--a width); justify-self: anchor-center }',
      ],
      (r) => [r.name, r.style.cssText, [...r.style], r.style.length],
    );
    const style = w.document.createElement('style');
    style.textContent = '@position-try --t { top: 1px; margin: 2px }';
    w.document.head.append(style);
    const r = style.sheet.cssRules[0];
    const s = r.style;
    out.push([
      s instanceof w.CSSPositionTryDescriptors,
      s instanceof w.CSSStyleDeclaration,
      s.parentRule === r,
      r.style === s,
      s.top,
      s.marginTop,
      s['margin-top'],
      attempt(() => {
        r.style = 'left: 3px; color: red';
        return s.cssText;
      }),
      r.cssText,
      attempt(() => {
        s.setProperty('color', 'red');
        return s.cssText;
      }),
      attempt(() => {
        s.width = '1px';
        s.setProperty('top', '2px', 'important');
        return r.cssText;
      }),
      attempt(() => {
        s.cssText = 'bottom: 1px; color: blue; inset-inline: 2px';
        return [s.cssText, s.length];
      }),
      'color' in s,
      'positionArea' in s,
      'webkitAlignSelf' in s,
    ]);
    style.remove();
    return out;
  },
  { jsdom: 31 },
);

parity(
  'jsdom 31: @view-transition: navigation and types',
  (w) => {
    const out = each(
      w,
      [
        '@view-transition { navigation: auto; types: a b }',
        '@view-transition { navigation: none }',
        '@view-transition { navigation: foo }',
        '@view-transition { }',
        '@view-transition x { navigation: auto }',
        '@view-transition { types: none }',
        '@view-transition { types: b a; navigation: AUTO }',
        '@view-transition { types: none } @view-transition { types: a none } @view-transition { types: auto } @view-transition { types: a, b } @view-transition { types: -a --b } @view-transition { types: A }',
        '@view-transition { types: initial } @view-transition { types: inherit a } @view-transition { types: default } @view-transition { types: NONE } @view-transition { types: a a }',
        '@view-transition { navigation: auto; navigation: none } @view-transition { navigation: auto; navigation: foo } @view-transition { navigation: auto !important } @view-transition { color: red }',
        '@view-transition { navigation: none; types: a; navigation: auto }',
        '@view-transition {} @view-transition {}',
        '@media all { @view-transition { navigation: auto } }',
      ],
      (r) => [r.navigation, r.types],
    );
    const style = w.document.createElement('style');
    style.textContent = '@view-transition { types: a b }';
    w.document.head.append(style);
    const r = style.sheet.cssRules[0];
    out.push([r.types === r.types, Object.isFrozen(r.types), Array.isArray(r.types)]);
    style.remove();
    return out;
  },
  { jsdom: 31 },
);

parity(
  'jsdom 31: the newer rules through insertRule, at the top and in a grouping rule',
  (w) => {
    const style = w.document.createElement('style');
    style.textContent = '@media all { a {} }';
    w.document.head.append(style);
    const sheet = style.sheet;
    const media = sheet.cssRules[0];
    const texts = [
      '@starting-style { a {} }',
      '@font-feature-values A { }',
      '@font-palette-values --q { font-family: A }',
      '@position-try --u { }',
      '@view-transition { }',
      '@font-palette-values --q { }',
      '@view-transition x { }',
    ];
    const out = texts.map((text) => [
      text,
      errorName(() => sheet.insertRule(text, sheet.cssRules.length)),
      errorName(() => media.insertRule(text, 0)),
    ]);
    out.push(
      [...sheet.cssRules].map((r) => r.cssText),
      [...media.cssRules].map((r) => r.parentRule === media),
    );
    style.remove();
    return out;
  },
  { jsdom: 31 },
);

parity(
  'jsdom 31: comments, escapes and other rules in the newer rules (#344 review)',
  (w) => {
    const out = each(
      w,
      [
        '@font-feature-values A { /* @swash { ghost: 1 } */ }',
        '@font-feature-values A { /* @styleset { fake: 2 } */ @swash { x: 1 } }',
        '@font-feature-values A { /* @ignored */ @styleset { x: 1 } }',
        '@font-feature-values A { @styleset /* c */ { x: 1 } @swash/**/{y:2} }',
        '@font-feature-values A { font-display: swap /* @swash { a: 1 } */; @swash { b: 2 } }',
        '@font-feature-values A { @styleset { x: 1; } font-display: "@swash{"; }',
        '@font-feature-values A { @swash { /* } */ b: 2 } @styleset { c: 3 } }',
        '@font-feature-values A { @styleset foo { x: 1 } @swash; @sty\\6c eset { y: 2 } }',
        '@font-feature-values A { @styleset { \\31 a: 1; a\\ b: 2; \\61 c: 3 } }',
        '@font-feature-values A { @swash { b: 2; a: 1 } @swash { b: 3 } }',
        '@font-feature-values A { @swash { b: 2 } @swash { a: 1; b: 3 } }',
        '@font-feature-values A { foo { a: 1 } @styleset { d: 1 } }',
        '@font-feature-values A { foo: 1 { a: 1 } @styleset { d: 1 } }',
        '@font-feature-values A { @"x" { c: 3 } @ swash { b: 2 } @styleset { d: 1 } }',
        '@font-feature-values A { 1 (;) @styleset { d: 1 } }',
        '@font-feature-values A { font-display: swap { } ; @styleset { d: 1 } }',
        '@font-feature-values  A { }',
        '@position-try --\\70 { top: 1px } @position-try --f\\6f o { top: 1px }',
        '@position-try --a\\ b { top: 1px } @position-try --\\31 { top: 1px }',
        '@position-try -- { top: 1px } @position-try --a b { top: 1px } @position-try a { top: 1px }',
        '@font-palette-values --\\70 { font-family: A } @font-palette-values --a\\ b { font-family: A }',
        '@font-palette-values --p { font-family:  A }',
        '@font-palette-values --p { font-family: A; override-colors: 0 red; override-colors: 0 inherit }',
        '@font-palette-values --p { font-family: A; override-colors: 0 red; override-colors: 0 initial }',
        '@font-palette-values --p { font-family: A; override-colors: 0 red; override-colors: 0 unset, 1 blue }',
        '@font-palette-values --p { font-family: A; override-colors: 0 red; override-colors: 0 revert-layer }',
        '@view-transition { types: \\31 a }',
        '@view-transition { types: a\\ b c }',
        '@view-transition { types: \\61 b }',
      ],
      (r) => r.name ?? r.fontFamily ?? r.types,
    );
    const style = w.document.createElement('style');
    style.textContent = '@font-feature-values A { }';
    w.document.head.append(style);
    const rule = style.sheet.cssRules[0];
    for (const family of [' A', 'A B', 'A　B,  C']) {
      rule.fontFamily = family;
      out.push([family, rule.fontFamily, rule.cssText]);
    }
    style.remove();
    return out;
  },
  { jsdom: 31 },
);

parity(
  'jsdom 31: the newer rules read their names and preludes as tokens (#344 review)',
  (w) =>
    each(
      w,
      [
        '@font-feature-values/**/A {} @font-feature-values /**/B {}',
        '@position-try --a/**/b { top: 1px } @font-palette-values --a/**/b { font-family: A }',
        '@position-try --a  { top: 1px } @font-palette-values --a  { font-family: A }',
        '@position-try --a\\  { top: 1px } @font-palette-values --a\\  { font-family: A }',
        '@position-try /**/--a { top: 1px }',
        '@view-transition   { navigation: auto } @view-transition /**/ { navigation: none }',
        '@view-transition/**/{ navigation: auto } @VIEW-TRANSITION { navigation: none }',
        '@starting-style   { a {} } @starting-style /**/ { b {} } @starting-style{c{}}',
        '@font-feature-values A\\  { } @font-feature-values B  { }',
      ],
      (r) => r.name ?? r.fontFamily ?? r.navigation,
    ),
  { jsdom: 31 },
);
