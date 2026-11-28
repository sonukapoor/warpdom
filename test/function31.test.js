// jsdom 31's @function rules (black box, 31.0.1; #269 part G1b):
// CSSFunctionRule's prelude (name, parameters, return type), its block
// (CSSFunctionDeclarations of custom properties and result, @media,
// @supports and @container rules), CSSFunctionDescriptors, and
// insertRule() into the rule and the rules in its block.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parity } from './parity.js';
import { createWindow } from '../src/node.js';
import { functionPrelude31 } from '../src/rules31.js';

const attempt = (f) => {
  try {
    return f();
  } catch (e) {
    return `${e.name}: ${e.message}`;
  }
};
const sheetOf = (d, text) => {
  const style = d.createElement('style');
  style.textContent = text;
  d.head.append(style);
  return style.sheet;
};
const describe = (rule) =>
  rule.constructor.name === 'CSSFunctionRule'
    ? [
        rule.cssText,
        rule.name,
        rule.returnType,
        rule.getParameters(),
        [...rule.cssRules].map((r) => [r.constructor.name, r.type, r.cssText, r.parentRule === rule]),
      ]
    : [rule.constructor.name, rule.cssText];

const PRELUDES = [
  '@function --f() {}',
  '@function --f {}',
  '@function f() {}',
  '@function  --f ( )  returns  <length>  { }',
  '@function --F() {}',
  '@function --\\66 () {}',
  '@FUNCTION --f() {}',
  '@function /*x*/ --f() {}',
  '@function --() {}',
  '@function --f(--) {}',
  '@function --f(a) {}',
  '@function --f( --a , --b <number> ) {}',
  '@function --f(--a, --a) {}',
  '@function --f(--a <length>, ) {}',
  '@function --f(, --a) {}',
  '@function --f(--b, --a <length>: 1px, --c) {}',
  '@function --f(/*c*/--a/*d*/:/*e*/1px/*f*/) returns/**/<length> {}',
];
const TYPES = [
  '@function --f(--a <bogus>) {}',
  '@function --f(--a <LENGTH>) {}',
  '@function --f(--a *) {}',
  '@function --f(--a bogus) {}',
  '@function --f(--a <length>+) returns <length># {}',
  '@function --f(--a <length> | <number>) {}',
  '@function --f(--a <length> <number>) {}',
  '@function --f(--a <transform-list>) returns <transform-list>+ {}',
  '@function --f(--a type(<length>)) {}',
  '@function --f(--a type( <length> )) {}',
  '@function --f(--a type(<length>|<number>)) {}',
  '@function --f(--a type(auto | none)) returns type(auto) {}',
  '@function --f(--a type(*)) returns type(*) {}',
  '@function --f(--a type()) {}',
  '@function --f(--a type(<length>) extra) {}',
  '@function --f() returns bogus {}',
  '@function --f() returns initial {}',
  '@function --f() returns * {}',
  '@function --f() RETURNS <LENGTH> {}',
  '@function --f()returns <length>{}',
  '@function --f() returns {}',
  '@function --f() returns <length> extra {}',
  '@function --f() bogus {}',
  '@function --f(--a type(<length>)) returns type(<a> | <b>) {}',
];
const DEFAULTS = [
  '@function --f(--a: 1px) {}',
  '@function --f(--a: ) {}',
  '@function --f(--a: {}) {}',
  '@function --f(--a: [1, 2]) {}',
  '@function --f(--a: f(1, 2)) {}',
  '@function --f(--a: var(--b)) {}',
  '@function --f(--a: initial) {}',
  '@function --f(--a: 1px !important) {}',
  '@function --f(--a: 1E1 /*x*/  2) {}',
  "@function --f(--a: 'x') {}",
  '@function --f(--a <length>#: 1px, 2px) {}',
  '@function --f(--a <length>+: 1px 2px) {}',
  '@function --f(--a <length>: red) {}',
  '@function --f(--a <length>: var(--x)) {}',
  '@function --f(--a <length>: 0) {}',
  '@function --f(--a <length>: 1em) {}',
  '@function --f(--a <length>: calc(1em + 1px)) {}',
  '@function --f(--a <number>: calc(1em / 1px)) {}',
  '@function --f(--a <number>: 1E1) {}',
  '@function --f(--a <integer>: 1.5) {}',
  '@function --f(--a <color>: RED) {}',
  '@function --f(--a <custom-ident>: initial) {}',
  '@function --f(--a type(none | <length>): none) {}',
];
const BLOCKS = [
  '@function --f(){result:1}',
  '@function --f() { result: 1px; color: red; --y: 2 }',
  '@function --f() { result: 1 !important }',
  '@function --f() { result: ; }',
  '@function --f() { result: {a} }',
  '@function --f() { RESULT: 1; result: 2 }',
  '@function --f() { --a: 1 !important; --b: 2 }',
  "@function --f() { --a: 'x'  1E1PX /*c*/ {a: 1}; --b: ; result: 'x'  1E1PX /*c*/ {a: 1} }",
  '@function --f() { /*a*/ result /*b*/ : /*c*/ 1px /*d*/ ; }',
  '@function --f() { --a: 1; @media print { --b: 2 } --c: 3; }',
  '@function --f() { --a: 1; p {} --b: 2 }',
  '@function --f() { --a: 1; @layer x {} --b: 2 }',
  '@function --f() { --a: 1; @import "x"; --b: 2 }',
  '@function --f() { --a: 1; width: 1px; --b: 2 }',
  '@function --f() { @media print {} width: 1px }',
  '@function --f() { a:hover { color: red } result: 1 }',
  '@function --f() { @supports (color: red) { result: 1 } @container (width > 0) { result: 2 } @layer x { } p { } }',
  '@function --f() { @media print { p { } result: 1 } }',
  '@function --f() { @starting-style { result: 1 } @scope (p) { result: 1 } @font-face { } }',
  '@media print { @function --f() {} }',
  '@supports (color: red) { @function --f() { result: 1 } }',
  '@layer x { @function --f() {} }',
  '@function --f() {} @function --f() {} p { color: red }',
];
// (#353 review: escaped at-keywords, comments in defaults and results,
// escapes before a /*, escapes in unquoted urls; @property's initial-value
// is written the same way)
const ESCAPES = [
  '@f\\75nction --f() {} p {}',
  '@\\66unction --f() {}',
  '@FUNC\\54ION --f() {}',
  '@function\\41 --f() {} p {}',
  '@functionä --f() {} p {}',
  '@prop\\65rty --x { syntax: "*"; inherits: false }',
  '@\\73 cope (.a) { p {} }',
  '@scope\\41 (.a) {} p {}',
  '@st\\61rting-style { p {} }',
  '@\\6d edia print { p {} } @m\\65dia print { p {} }',
  '@supp\\6frts (color: red) { p {} } @l\\61yer x; @k\\65yframes k { from {} }',
  '@\\69mport "x.css"; @p\\61ge { margin: 1px } @-webkit-k\\65yframes k { from {} }',
  '@position-tr\\79 --p { top: 1px } @font-palette-v\\61lues --p { font-family: a }',
  '@\\00006dedia print { p {} } @\\000066\\000075nction --f(--a: url(\\000061bc.png)) { result: url(\\000062c) }',
  '@property --x { syntax: "*"; inherits: false; initial-value: url(\\0000611) }',
  '@supports (color: red)  { p {} } @supp\\6f rts (color: red)  { p {} }',
  '@container (width > 0)  { p {} } @supports (color: red) { q {} }',
  '@function --f(--a: a/*b*/c) {}',
  '@function --f(--a: 1/*b*/2) {}',
  '@function --f(--a: a /*b*/c) {}',
  '@function --f(--a: a\\\\/*b*/c) {}',
  '@function --f(--a: \\/* x */ 1) {}',
  '@function --f(--a: a\\/*b*/c) {}',
  '@function --f(--a /**/ <length> /**/ : /**/ 1px /**/) {}',
  '@function --f() { result: a/*b*/c; --y: a/*b*/c }',
  '@function --f(--a: url(\\61) url( \\62 )) {}',
  '@function --f(--a type(<url>): url(\\61)) {}',
  '@function --f(--a: url(\\/*x*/)) {}',
  '@function --f() { --y: url(\\61); result: url(\\62 c) }',
  '@function --f(--a: URL(a\\)b) url(a\\ b) url(\\28) url(\\5c) url(\\9 ) url(\\7f) url(\\20) url(\\0)) {}',
  '@property --x { syntax: "*"; inherits: false; initial-value: url(\\61) url(\\/x) url(a\\"b) url(\\61  ) }',
];

for (const [name, texts] of [
  ['preludes', PRELUDES],
  ['parameter and return types', TYPES],
  ['parameter defaults', DEFAULTS],
  ['blocks', BLOCKS],
  ['escapes and comments', ESCAPES],
])
  parity(
    `jsdom 31's @function ${name}`,
    (w) => texts.map((text) => [text, [...sheetOf(w.document, text).cssRules].map(describe)]),
    { jsdom: 31 },
  );

parity(
  "jsdom 31's CSSFunctionDeclarations and CSSFunctionDescriptors",
  (w) => {
    const sheet = sheetOf(w.document, '@function --f(--a <length>: 1px) { result: 1px; --x: 2 }');
    const rule = sheet.cssRules[0];
    const decl = rule.cssRules[0];
    const style = decl.style;
    const out = [
      [decl.type, rule.type, decl.parentStyleSheet === sheet, style.parentRule === decl],
      Object.prototype.toString.call(style),
      [style.length, style.item(0), style.item(1), style.result, 'result' in style, 'color' in style],
    ];
    decl.cssText = 'result: 9';
    out.push(decl.cssText);
    for (const write of [
      () => style.setProperty('--y', '3', 'important'),
      () => style.setProperty('result', 'calc(1px + 1px)'),
      () => style.setProperty('result', ''),
      () => (style.cssText = 'result: 4; width: 1px; --z: 5 !important; --w: 6'),
      () => (style.result = null),
      () => (style.result = '  a   b  '),
      () => style.removeProperty('result'),
      () => style.setProperty('float', 'left'),
      () => style.setProperty('result', '}'),
      () => style.setProperty('result', '1 !important'),
      () => style.setProperty('result', '1; --x: 2'),
      () => style.setProperty('result', '{a} b'),
      () => (style.result = 'var(--a, 1px)'),
    ])
      out.push([attempt(write) ?? null, style.cssText]);
    out.push(rule.cssText);
    const parameters = rule.getParameters();
    parameters.push(1);
    out.push(rule.getParameters().length, rule.getParameters() !== rule.getParameters());
    // (V8 names the object in that message by its constructor: the type only)
    out.push(String(attempt(() => (rule.name = 'x'))).split(':')[0], rule.name);
    return out;
  },
  { jsdom: 31 },
);

parity(
  "jsdom 31's insertRule() into an @function and the rules in its block",
  (w) => {
    const d = w.document;
    const rule = sheetOf(d, '@function --f() { result: 1 }').cssRules[0];
    const inserted = (owner, text) =>
      attempt(() => {
        owner.insertRule(text, 0);
        return [owner.cssRules.length, owner.cssRules[0].constructor.name, owner.cssRules[0].cssText];
      });
    const out = [
      'result: 2',
      'width: 1px',
      '--x: 1',
      'result: 2; --y: 3',
      '  result: 3  ',
      'result: 1 !important',
      '',
      'p',
      'p {}',
      'a{} b{}',
      '@bogus {}',
      '@font-face {}',
      '@layer x {}',
      '@function --g() {}',
      '@media print { p {} }',
      '@media print {} @media print {}',
      '@supports (color: red) { --q: 1 }',
    ].map((text) => [text, inserted(rule, text)]);
    out.push(attempt(() => rule.insertRule('result: 1', 99)));
    const media = sheetOf(d, '@function --f() { @media print { result: 1 } }').cssRules[0].cssRules[0];
    for (const text of ['--q: 1', 'p {}', '@supports (color: red) {}', '@layer x {}'])
      out.push([text, inserted(media, text)]);
    out.push(
      attempt(() => rule.deleteRule(0)),
      rule.cssRules.length,
      rule.cssText,
    );
    const sheet = sheetOf(d, '');
    out.push(
      attempt(() => sheet.insertRule('@function --f(--a) returns <length> { result: 1px }')),
      attempt(() => sheet.insertRule('@function --f {}')),
      sheet.cssRules[0].cssText,
    );
    return out;
  },
  { jsdom: 31 },
);

parity(
  "jsdom 31's cascade reads no @function rule",
  (w) => {
    const d = w.document;
    sheetOf(
      d,
      '@function --f() { result: red; --c: 1 } @function --g() { @media all { result: red } } p { color: blue }',
    );
    const p = d.createElement('p');
    d.body.append(p);
    return [w.getComputedStyle(p).color, w.getComputedStyle(p).getPropertyValue('--c')];
  },
  { jsdom: 31 },
);

// (#353 review: reproduced on 31.0.1)
parity(
  "jsdom 31's @function: a result set with a ;, comments in the prelude",
  (w) => {
    const d = w.document;
    const out = [];
    for (const value of ['1;', '1; p {}', '1 ;', '{a};', '1;;']) {
      const style = sheetOf(d, '@function --f() { result: 0 }').cssRules[0].cssRules[0].style;
      style.setProperty('result', value);
      const other = sheetOf(d, '@function --f() { result: 0 }').cssRules[0].cssRules[0].style;
      other.result = value;
      out.push([value, style.cssText, other.cssText]);
    }
    for (const text of [
      '@function --f(--a type(item1em): item1em) {}',
      '@function --f(--a type(x1em | <length>): x1em) {}',
      '@function --f(/* , */ --a) {}',
      '@function --f(--a /* ) */) {}',
      '@function --f(/* ( */ --a) {}',
      '@function --f(--a: 1 /* , */ 2) {}',
      '@function --f(--a /*,*/ , --b) {}',
      // (an unquoted url is one token; names with their escapes read)
      '@function --f(--a: url(a[b.png)) {}',
      '@function --f(--a: url(a/*b.png)) {}',
      '@function --f(--a: url(a;v.png)) {}',
      '@function --f(--a: url(a/*x*/b)) {}',
      '@function --f(--a <url>: url(a[b.png)) {}',
      '@function --f(--a: url(a)b) {}',
      '@function --f\\:x() {}',
      '@function --f(--a\\:b) {}',
      '@function --f(--a\\:b, --a\\3a b) {}',
    ])
      out.push([text, [...sheetOf(d, text).cssRules].map(describe)]);
    for (const text of ['p {} --x: 1', '--x: 1; p {}', '--x: 1 p {}', 'a:hover{} --x: 1']) {
      const rule = sheetOf(d, '@function --f() { result: 1 }').cssRules[0];
      try {
        rule.insertRule(text, 0);
        out.push([text, rule.cssText]);
      } catch (e) {
        out.push([text, `${e.name}: ${e.message}`]);
      }
    }
    return out;
  },
  { jsdom: 31 },
);

// (#353 review round 3: reproduced on 31.0.1) Quoted urls with spaces
// after url(, a ; in brackets in a default, NUL (U+FFFD in names and
// defaults, kept as written in custom properties).
parity(
  "jsdom 31's @function: quoted urls, nested semicolons, NUL",
  (w) => {
    const d = w.document;
    const nul = String.fromCharCode(0);
    return [
      '@function --f(--a: url( "a)b")) {}',
      '@function --f(--a: url( "a)b")) { result: 1 }',
      '@function --f(--a: url( "x/*y*/z") /* c */) {}',
      '@function --f(--a: f(1; 2)) {}',
      '@function --f(--a: [1; 2]) {}',
      '@function --f(--a <length>: f(1; 2)) {}',
      '@function --f(--a: {1; 2}) {}',
      `@function --f() { --x: url(a${nul}b); result: 2 }`,
      `@function --f() { result: url(a${nul}b) }`,
      `@function --f() { --a${nul}b: 1 }`,
      `@function --f(--a: url(a${nul}b)) {}`,
      `@function --f(--a${nul}b) {}`,
      `@function --f${nul}() {}`,
      '@function --\\70() {}',
      '@function --f\\6f o() {}',
    ].map((text) => [text, [...sheetOf(d, text).cssRules].map(describe)]);
  },
  { jsdom: 31 },
);

// A name of many hex escapes and no ( is rejected in linear time (#353
// review: each escape takes all its hex digits, one way to read it).
test("jsdom 31's @function prelude with many escapes", () => {
  const d = createWindow({ jsdom: '31.0.1' }).document;
  const started = performance.now();
  const sheet = sheetOf(d, `@function --${'\\616161'.repeat(40)} x {} p {}`);
  assert.equal(sheet.cssRules.length, 1);
  assert.ok(performance.now() - started < 500);
});

// (an escaped url name read as url, its brackets no brackets: jsdom 31
// writes url(a[b.png); the sheet's splitter does not read the name yet,
// #358; #353 review)
test("jsdom 31's @function prelude with an escaped url name", () => {
  for (const name of ['u\\72l', 'U\\52L', '\\75rl'])
    assert.equal(functionPrelude31(`--f(--a: ${name}( a[b.png ))`).params[0].defaultValue, 'url(a[b.png)');
  assert.equal(functionPrelude31('--f(--a: u\\72lx(a[b.png))'), null);
});

test("jsdom 31's @function defaults with many urls and escapes", () => {
  const d = createWindow({ jsdom: '31.0.1' }).document;
  const started = performance.now();
  const sheet = sheetOf(
    d,
    `@function --f(--a: ${'url(x) '.repeat(80000)}) {} @function --g(--a: ${'u\\72 '.repeat(20000)}) {}`,
  );
  assert.equal(sheet.cssRules.length, 2);
  assert.ok(performance.now() - started < 1000);
});

test("jsdom 31's @function prelude with many comments", () => {
  const d = createWindow({ jsdom: '31.0.1' }).document;
  const started = performance.now();
  const sheet = sheetOf(d, `@function ${'/**/'.repeat(40)}{} p {} @function /**//*a*/--f() {}`);
  assert.deepEqual(
    [...sheet.cssRules].map((rule) => rule.name ?? rule.selectorText),
    ['p', '--f'],
  );
  assert.ok(performance.now() - started < 500);
});

// A block's end at the end of the sheet, closed as parsed (#353 review;
// jsdom 31 also reports "Could not parse CSS stylesheet" for these, which
// warpdom does not: values measured on 31.0.1).
test("jsdom 31's @function block at the end of a sheet", () => {
  const d = createWindow({ jsdom: '31.0.1' }).document;
  assert.deepEqual(
    [
      '@function --f() { --x: [a',
      '@function --f() { --x: "a',
      '@function --f() { result: (1',
      '@function --f() { --x: url(a',
      '@function --f() { --x: 1; @media print { --y: 2 } --z: [a',
    ].map((text) => sheetOf(d, text).cssRules[0].cssText),
    [
      '@function --f() { --x: [a]; }',
      '@function --f() { --x: "a"; }',
      '@function --f() { result: (1); }',
      '@function --f() { --x: url(a); }',
      '@function --f() { --x: 1; @media print {\n  --y: 2;\n} --z: [a]; }',
    ],
  );
});

// A default that is no value, a bad url, drops the rule (#353 review;
// measured on 31.0.1, which reports "Could not parse CSS stylesheet").
test("jsdom 31's @function with a bad url default", () => {
  const d = createWindow({ jsdom: '31.0.1' }).document;
  assert.equal(sheetOf(d, '@function --f(--a: url(a b)) {} p {}').cssRules.length, 1);
});

parity('jsdom 30 has no @function rules', (w) => [
  'CSSFunctionRule' in w,
  'CSSFunctionDeclarations' in w,
  'CSSFunctionDescriptors' in w,
  [...sheetOf(w.document, '@function --f() { result: 1 } p {}').cssRules].map((r) => r.constructor.name),
]);
