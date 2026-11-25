// jsdom 31's registered custom properties (black box, 31.0.1; #269 part
// F2): @property rules (CSSPropertyRule) and CSS.registerProperty(), and
// what the cascade does with a registered property: its initial value,
// whether it inherits, and its value computed by its syntax. jsdom 30 has
// none of them.
import { parity } from './parity.js';

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
    f();
    return 'ok';
  } catch (e) {
    return e.name;
  }
};
const sheet = (w, text, root = w.document.head) => {
  const style = w.document.createElement('style');
  style.textContent = text;
  root.append(style);
  return style;
};
// Each text's first rule as the rule reads it.
const ruleOf = (w, text) => {
  const style = sheet(w, text);
  const r = style.sheet.cssRules[0];
  const out =
    r === undefined
      ? 'none'
      : [r.constructor.name, r.type, r.cssText, r.name, r.names, r.syntax, r.inherits, r.initialValue];
  style.remove();
  return out;
};
// A document with #p holding #c, and the sheet's values of names on both.
const tree = (w) => {
  w.document.body.innerHTML = '<div id="p"><div id="c"></div></div>';
  const d = w.document;
  return (id, name) => w.getComputedStyle(d.getElementById(id)).getPropertyValue(name);
};
const valuesOf = (w, text, names = ['--a']) => {
  const get = tree(w);
  const style = sheet(w, text);
  const out = names.flatMap((name) => [get('p', name), get('c', name)]);
  style.remove();
  return out;
};
const P = (syntax, inherits, initial) =>
  `@property --a { syntax: "${syntax}"; inherits: ${inherits};${initial === undefined ? '' : ` initial-value: ${initial};`} }`;

// (first: before any @property rule is made in this process, sheets made
// only when read still register: a shadow tree's <style>, and one of a
// shadow tree moved in from another document; cascade.js registration31,
// #345 review. test/property31-unread.test.js has a document's own.)
parity(
  "a shadow tree's <style> registers before anything reads its sheet",
  (w) => {
    const get = tree(w);
    const d = w.document;
    const other = d.implementation.createHTMLDocument('');
    const moved = other.createElement('div');
    other.body.append(moved);
    moved.attachShadow({ mode: 'open' }).innerHTML =
      '<style>@property --m { syntax: "<length>"; inherits: false; initial-value: 7px; }</style>';
    d.getElementById('c').append(moved);
    const out = [get('p', '--m'), get('c', '--m')];
    const host = d.getElementById('c');
    host.attachShadow({ mode: 'open' }).innerHTML =
      '<style>@property --a { syntax: "<length>"; inherits: false; initial-value: 2px; }</style><i></i>';
    out.push(get('p', '--a'), get('c', '--a'), [...w.getComputedStyle(d.getElementById('p'))].slice(-2));
    return out;
  },
  { jsdom: 31 },
);

parity(
  'jsdom 30: no CSSPropertyRule or CSS.registerProperty, @property dropped',
  (w) => [
    'CSSPropertyRule' in w,
    'registerProperty' in w.CSS,
    ruleOf(w, '@property --a { syntax: "<length>"; inherits: false; initial-value: 1px; }'),
    valuesOf(w, '@property --a { syntax: "<length>"; inherits: false; initial-value: 1px; } #p { --a: 2em }'),
  ],
  { jsdom: 30 },
);

parity(
  'CSSPropertyRule: the interface and its rules',
  (w) => {
    const proto = w.CSSPropertyRule.prototype;
    const style = sheet(w, '@property --a, --b { syntax: "<length>"; inherits: false; initial-value: 1px; }');
    const rule = style.sheet.cssRules[0];
    return [
      // (warpdom lists constructor last)
      Object.getOwnPropertyNames(proto).sort(),
      Object.getPrototypeOf(proto) === w.CSSRule.prototype,
      w.CSSPropertyRule.length,
      attempt(() => new w.CSSPropertyRule()),
      Object.getOwnPropertyNames(rule),
      rule.names === rule.names,
      Object.isFrozen(rule.names),
      errorName(() => {
        rule.name = '--x';
      }),
      errorName(() => {
        rule.syntax = '*';
      }),
      [rule.name, rule.syntax],
    ];
  },
  { jsdom: 31 },
);

parity(
  'CSSPropertyRule: names, descriptors and defaults',
  (w) =>
    [
      '@property --a { syntax: "<length>"; inherits: false; initial-value: 1px; }',
      '@property --a { syntax: "*"; inherits: true; }',
      '@property --a { syntax: "<length>"; inherits: false; }',
      '@property --a { syntax: "<length>"; initial-value: 1px; }',
      '@property --a { inherits: false; initial-value: 1px; }',
      '@property --a {}',
      '@property a { syntax: "*"; inherits: true; }',
      '@property --a --b {}',
      '@property -- {}',
      '@property{}',
      '@property --a;',
      '@property --a, --b { syntax: "*"; }',
      '@property --a, --a {}',
      '@property --a, b {}',
      '@property --a, {}',
      '@property  --a ,--b  {}',
      '@property --A {}',
      '@property --\\61 {}',
      '@property --a\\:b {}',
      '@property --a/**/ {}',
      '@property/**/--a {}',
      '@PROPERTY --a {}',
      '@media all { @property --a { syntax: "*"; inherits: true; } }',
      '@property --a { syntax: "<length>"; a { color: red } initial-value: 1px; }',
      '@property --a { @media all {} initial-value: 1px; }',
      '@property --a { syntax: "<length>" !important; initial-value: 1px; }',
      '@property --a { SYNTAX: "<length>"; INHERITS: false; Initial-Value: 2px }',
      // inherits: true or false alone, in any case; the last valid one wins
      '@property --a { inherits: false; inherits: 1 }',
      '@property --a { inherits: FALSE }',
      '@property --a { inherits: false x }',
      '@property --a { inherits: "false" }',
      '@property --a { inherits: false !important }',
      '@property --a { inherits:false }',
      '@property --a { inherits: true; inherits: false }',
      '@property --a { inherits: 1 }',
      // syntax: a string, or the syntax as written; the last valid one wins
      '@property --a { syntax: "*"; initial-value: 1px; syntax: "<color>" }',
      '@property --a { syntax: "<color>"; syntax: "<bogus>" }',
      '@property --a { syntax: 5 }',
      '@property --a { syntax: "<length>" x }',
      "@property --a { syntax: '<integer>'; inherits: false; initial-value: 2.5 }",
      '@property --a { syntax: <length> | <color> }',
      '@property --a { syntax: a }',
      '@property --a { syntax: * }',
      '@property --a { syntax: "<length>" "<color>" }',
      '@property --a { syntax: "a\\62 c" }',
      // initial-value: the last one, valid for the syntax and
      // computationally independent, written token by token
      '@property --a { syntax: "<length>"; initial-value: 1px; initial-value: red }',
      '@property --a { syntax: "<length>"; initial-value: red; initial-value: 1px }',
      '@property --a { initial-value: inherit; initial-value: x }',
      '@property --a { initial-value: x; initial-value: inherit }',
      '@property --a { initial-value: ; }',
      '@property --a { initial-value: {a}; }',
      '@property --a { initial-value: 1px; syntax: "<length>"; }',
      '@property --a { syntax: "*"; inherits: true; initial-value:  a   b ; foo: 1; }',
      '@property --a { syntax: "*"; initial-value: inherit; }',
      '@property --a { syntax: "<length>"; initial-value: 1px !important; }',
      '@property --a { syntax: "<length>"; initial-value: var(--b); }',
      '@property --a { syntax: "<length>"; initial-value: 1em; }',
      '@property --a { syntax: "<length>"; initial-value: 1rem; }',
      '@property --a { syntax: "<length>"; initial-value: 1vw; }',
      '@property --a { syntax: "<length>"; initial-value: calc(1px + 1em); }',
      '@property --a { syntax: "<length>"; initial-value: calc( 1px + 2px ); }',
      '@property --a { syntax: "<color>"; initial-value: currentcolor; }',
      '@property --a { syntax: "<color>"; initial-value: RED; }',
      '@property --a { syntax: "<color>"; initial-value: #ABC; }',
      '@property --a { syntax: "<number>"; initial-value: 1e1; }',
      '@property --a { syntax: "<number>"; initial-value: +.5; }',
      '@property --a { syntax: "<length>"; initial-value: 1E1PX; }',
      '@property --a { syntax: "<length>"; initial-value: .5px; }',
      '@property --a { syntax: "<length>+"; initial-value: 1px   2px; }',
      '@property --a { syntax: "<length>#"; initial-value: 1px , 2px; }',
      '@property --a { syntax: "<string>"; initial-value: \'s\'; }',
      '@property --a { syntax: "<url>"; initial-value: url( a.png ); }',
      '@property --a { syntax: "<custom-ident>"; initial-value: Foo; }',
      '@property --a { syntax: "<length> | auto"; inherits: false; initial-value: auto; }',
      '@property --a { syntax: "<bogus>"; inherits: false; initial-value: 1px; }',
      '@property --a { initial-value: 1e1 }',
      '@property --a { initial-value: a,b }',
      '@property --a { initial-value: a , b }',
      '@property --a { initial-value: RED }',
      "@property --a { initial-value: 's' }",
      '@property --a { initial-value: url( a.png ) }',
      '@property --a { initial-value: 1E3px }',
      '@property --a { initial-value: f( a ) }',
      '@property --a { initial-value: #ABC }',
      '@property --a { initial-value: +5 }',
      '@property --a { initial-value: 1px/**/2px }',
      '@property --a { initial-value: a!important }',
      '@property --a { initial-value: [ a ] }',
    ].map((text) => [text, ruleOf(w, text)]),
  { jsdom: 31 },
);

parity(
  'CSSPropertyRule: the syntax descriptor',
  (w) =>
    [
      '"<length>"',
      '"<length> <number>"',
      '"<length>++"',
      '"<length>#+"',
      '"<length>+#"',
      '"<transform-list>+"',
      '"<transform-list>#"',
      '"a | a"',
      '"inherit"',
      '"default"',
      '"INITIAL"',
      '"a b"',
      '"| <length>"',
      '"<length> |"',
      '"* | <length>"',
      '"*"',
      '" * "',
      '"<length>|"',
      '"<length>  |  <color>"',
      '"\\3c length>"',
      '"<length >"',
      '"< length>"',
      '"<custom-ident>+"',
      '"<string>#"',
      '"<url>+"',
      '"foo-bar"',
      '"Foo"',
      '"<length-percentage>+ | <color>#"',
      '""',
      '"   "',
      "'<length>'",
      '"<number> | 1"',
      '"--x"',
      '"<lengTH>"',
      '"<flex>"',
      '"<frequency>"',
      '"<ident>"',
      '"<dashed-ident>"',
      '"<attr>"',
      '"<length>!"',
      '"auto"',
      '"<length>+ |<number>#"',
      '"<angle> | <time> | <resolution> | <integer> | <percentage> | <image> | <transform-function>"',
    ].map((syntax) => [syntax, ruleOf(w, `@property --a { syntax: ${syntax}; }`)[5]]),
  { jsdom: 31 },
);

parity(
  'CSS.registerProperty: its definition, checks and messages',
  (w) => {
    const read = [];
    const spy = new Proxy(
      { name: '--o', syntax: '*', inherits: true, initialValue: 'x' },
      {
        get(target, key) {
          if (typeof key === 'string') read.push(key);
          return target[key];
        },
      },
    );
    const register = (definition) => attempt(() => w.CSS.registerProperty(definition));
    return [
      Object.getOwnPropertyDescriptor(w.CSS, 'registerProperty') !== undefined,
      w.CSS.registerProperty.length,
      w.CSS.registerProperty.name,
      register(spy),
      read,
      attempt(() => w.CSS.registerProperty()),
      ...[5, null, undefined, '--x', () => {}].map(register),
      ...[
        {},
        { name: '--x' },
        { name: 'x', syntax: '*', inherits: true },
        { name: 5, inherits: true },
        { name: '--' },
        { name: '--a b' },
        { name: '--\\61' },
        { name: '---' },
        { name: '--y', syntax: '*' },
        { name: '--z', syntax: '*', inherits: false },
        { name: '--z', syntax: '*', inherits: false },
        { name: '--z', syntax: '<bogus>' },
        { name: 'x', syntax: '<bogus>' },
        { name: '--s', syntax: '<bogus>', inherits: false, initialValue: '1' },
        { name: '--s1', syntax: '<bogus>', initialValue: 'var(--x)' },
        { name: '--l', syntax: '<length>', inherits: false },
        { name: '--d', inherits: false },
        { name: '--e', syntax: '*', inherits: 'no' },
        { name: '--f', syntax: '<length>', inherits: false, initialValue: 'var(--x)' },
        { name: '--g', inherits: true, initialValue: { toString: () => 'q' } },
        { name: '--i1', syntax: '<length>', initialValue: '1em' },
        { name: '--i1', syntax: '*' },
        { name: '--i2', syntax: '<length>', initialValue: '1vw' },
        { name: '--i3', syntax: '<length>', initialValue: '1rem' },
        { name: '--i4', syntax: '<length-percentage>', initialValue: '10%' },
        { name: '--i5', syntax: '<color>', initialValue: 'currentcolor' },
        { name: '--i6', syntax: '*', initialValue: 'inherit' },
        { name: '--i7', syntax: '*', initialValue: 'var(--x)' },
        { name: '--i8', syntax: '*', initialValue: '1em' },
        { name: '--i9', syntax: '*', initialValue: '' },
        { name: '--i10', syntax: '<length>', initialValue: '' },
        { name: '--i11', syntax: '<length>', initialValue: 'calc(1px + 1em)' },
        { name: '--i12', syntax: '<length>', initialValue: '1ex' },
        { name: '--i13', syntax: '*', initialValue: 'a !important' },
        { name: '--i14', syntax: '*', initialValue: 'a;b' },
        { name: '--i15', syntax: '*', initialValue: 'a}' },
        { name: '--i16', syntax: '<length>', initialValue: '1lh' },
        { name: '--i17', syntax: '<color>', initialValue: 'light-dark(red, blue)' },
        { name: '--i18', syntax: ' <length> ', initialValue: '1px' },
        { name: '--i19', syntax: '<length>|<number>', initialValue: '2' },
      ].map(register),
    ];
  },
  { jsdom: 31 },
);

parity(
  'CSS.registerProperty: the registered values',
  (w) => {
    const get = tree(w);
    const reg = (name, syntax, initialValue, inherits = false) =>
      attempt(() => w.CSS.registerProperty({ name, syntax, inherits, initialValue }));
    const results = [
      reg('--a', '<length>', '1px'),
      reg('--b', '*', '  a   b  '),
      reg('--c', '*', 'a/**/b 1e1'),
      reg('--d', '<length>', '1E1PX'),
      reg('--e', '<length>', '1vw'),
      reg('--f', '<length-percentage>', '10%'),
      reg('--g', '<color>', 'currentcolor'),
      reg('--h', '*', ''),
      reg('--i', '<color>', 'light-dark(red, blue)'),
      reg('--j', '<angle>', '1turn', true),
      reg('--k', '<length>', undefined),
      attempt(() => w.CSS.registerProperty({ name: '--l', syntax: '<length>', initialValue: '0px' })),
    ];
    w.document.getElementById('p').style.cssText = 'color: blue; --l: 3px';
    return [
      results,
      ['--a', '--b', '--c', '--d', '--e', '--f', '--g', '--h', '--i', '--j', '--k', '--l'].map((name) => [
        get('p', name),
        get('c', name),
      ]),
    ];
  },
  { jsdom: 31 },
);

// The values set on #p (font-size 20px), as each syntax computes them.
const TYPED = [
  [
    '<length>',
    ['10px', '1in', '1cm', '1mm', '1pt', '1pc', '1q', '1ex', '1ch', '1vw', '1vh', '1vmin', '1lh', '1rlh', '2em'],
    ['-1px', '1e1px', '0', '10%', 'calc(10px)', 'calc(1em + 1px)', 'calc(100% + 1px)', 'min(1px, 2px)'],
    ['max(1em, 1px)', 'clamp(1px, 2px, 3px)', '1PX', '1.23456789px', 'calc(1px * 3)', '1px 2px'],
    ['var(--b, 3px)', 'inherit', 'auto', '1rem', 'calc(1px + 1rem)'],
  ],
  ['<number>', ['1', '1.5', '-0', '1e3', 'calc(1 + 2)', '1px', '10%', '0.1234567', '+5', 'calc(1/3)']],
  ['<integer>', ['1', '1.5', 'calc(1.5)', 'calc(2.5)', '-3', '1e2', 'calc(3 / 2)', 'calc(-1.5)']],
  ['<percentage>', ['10%', '1.5%', 'calc(10% + 5%)', '10px', '0']],
  ['<length-percentage>', ['10%', '10px', 'calc(10% + 1px)', 'calc(10% + 1em)', '0', 'calc(10% - 10%)', '2em']],
  ['<angle>', ['1deg', '1rad', '1grad', '1turn', '0', '0deg', 'calc(1deg + 1rad)', '-90deg', '1DEG']],
  ['<time>', ['1s', '500ms', '0', '0s', 'calc(1s + 100ms)', '-1s']],
  ['<resolution>', ['1dppx', '96dpi', '1x', '2dpcm', '1dpi']],
  [
    '<color>',
    ['red', 'RED', '#abc', '#abcd', '#aabbcc80', 'rgb(1 2 3)', 'rgba(1,2,3,.5)', 'hsl(120 100% 50%)'],
    ['transparent', 'currentcolor', 'canvas', 'rgb(1 2 3 / 50%)', 'color(srgb 1 0 0)', 'oklch(50% 0.1 120)'],
    ['lab(50 1 2)', 'light-dark(red, blue)', 'color-mix(in srgb, red, blue)', 'Red', '1px'],
  ],
  ['<url>', ['url(a.png)', 'url("a b.png")', 'url("http://x/y")', '"a.png"']],
  ['<string>', ['"x"', "'y'", '"a\\62 c"', 'x']],
  ['<custom-ident>', ['foo', 'Foo', 'inherit', 'default', 'none', 'a b', '\\61 b', 'f\\6f o']],
  ['big | small', ['big', 'BIG', 'small', 'medium']],
  ['<image>', ['url(a.png)', 'linear-gradient(red, blue)', 'none']],
  [
    '<transform-function>',
    ['scale(2)', 'translateX(1em)', 'rotate(1turn)', 'matrix(1,0,0,1,0,0)', 'none', 'scale(2) scale(3)'],
  ],
  ['<transform-list>', ['scale(2) rotate(1deg)', 'translate(1em, 2px)', 'none']],
  ['<length>+', ['1px 2px', '1em  2em', '1px, 2px']],
  ['<length>#', ['1px,2px', '1px , 2em', '1px 2px']],
  ['<length> | <percentage>', ['10%', '1px']],
  ['<length> | auto', ['auto', 'AUTO', '1em']],
  ['<number> | <length>', ['0', '1']],
  ['<length> | <number>', ['0', '1']],
  ['<color>#', ['red, blue', 'red,blue']],
  ['*', ['  a  b  ', '1em', 'red', '{a}']],
];

parity(
  'a registered property computes its value by its syntax',
  (w) =>
    TYPED.map(([syntax, ...lists]) => [
      syntax,
      lists.flat().map((value) => {
        const get = tree(w);
        w.document.getElementById('p').style.fontSize = '20px';
        const style = sheet(w, `${P(syntax, false, 'unused')} #p { --a: ${value} }`);
        const out = get('p', '--a');
        style.remove();
        return [value, out];
      }),
    ]),
  { jsdom: 31 },
);

parity(
  'a registered property in the cascade: initial values, inheritance, keywords, var()',
  (w) =>
    [
      P('<length>', false, '1px'),
      P('*', false, ' a  b '),
      P('<color>', false, 'RED'),
      P('<number>', false, '1e1'),
      P('<length>', false, 'calc(1px + 2px)'),
      P('<length>', false, '0'),
      P('<length-percentage>', false, '10%'),
      P('<angle>', false, '1turn'),
      P('<time>', false, '1000ms'),
      P('big | small', false, 'big'),
      P('<length>+', false, '1px  2px'),
      P('<length>#', false, '1px ,2px'),
      P('<url>', false, 'url(a.png)'),
      P('<string>', false, "'x'"),
      P('<integer>', false, '3'),
      P('<transform-function>', false, 'scale(2)'),
      P('<length>', false, '1px') + '#p { --a: 5px }',
      P('<length>', true, '1px') + '#p { --a: 5px }',
      P('<length>', true, '0px') + '#p { font-size: 20px; --a: 2em }',
      P('<length>', true, '0px') + '#p { font-size: 20px; --a: 2em } #c { font-size: 10px }',
      P('<length>', false, '0px') + '#p { --a: 2rem }',
      P('<color>', true, 'red') + '#p { color: blue; --a: currentcolor } #c { color: green }',
      P('<length>', false, '1px') + '#p { --a: red }',
      P('<length>', true, '1px') + '#p { --a: 3px } #c { --a: red }',
      P('<length>', false, '1px') + '#p { --b: 4px; --a: var(--b) }',
      P('<length>', false, '1px') + '#p { --b: red; --a: var(--b) }',
      P('<length>', false, '1px') + '#p { --a: 7px } #c { --a: inherit }',
      P('<length>', true, '1px') + '#p { --a: 7px } #c { --a: initial }',
      P('<length>', false, '1px') + '#p { --a: 7px } #c { --a: unset }',
      P('<length>', true, '1px') + '#p { --a: 7px } #c { --a: unset }',
      P('<length>', true, '1px') + '#p { --a: 4px } #c { --a: revert }',
      P('<length>', false, '1px') + '#p { --a: 4px } #c { --a: revert }',
      P('<length>', true, '1px') + '#p { --a: 4px } #c { --a: revert-layer }',
      P('*', true) + '#p { --a: 4px } #c { --a: initial }',
      P('<length>', false, '1px') + '#p { --a: 4px !important; --a: 5px }',
      P('<length>', false, '1px') + '#p { --a: 4px; --a: red }',
      P('<length>', false) + '#p { --a: 2em; font-size: 10px }',
      P('*', false) + '#p { --a: 2em }',
      P('<bogus>', false, '1px') + '#p { --a: 2em }',
      '@property --a { syntax: "<length>"; initial-value: 1px; } #p { --a: 5px }',
      '@property --a { inherits: false; initial-value: 1px; } #p { --a: 2em }',
      P('<length>', false, 'red') + '#p { --a: 2em }',
      P('<length>', false, '1em') + '#p { --a: blue }',
      P('<length>', false, '1px') + P('<color>', false, 'red'),
      P('<length>', false, '1px') + P('<length>', false),
      P('<length>', false, '1px') + P('<number>', false, '2'),
      P('<length>', false, '3px') + '#p { width: var(--a) }',
      P('<length>', false, '2em') + '#p { font-size: 10px; width: var(--a) }',
      P('<length>', true, '2em') + '#p { font-size: 10px; --b: var(--a) } #c { font-size: 30px }',
      P('<length>', true, '0px') + '#p { font-size: 10px; --b: 2em; --a: var(--b) } #c { font-size: 30px }',
      P('<length>', false, '1px') + '#p { display: none }',
      '@property --a, --b { syntax: "<length>"; inherits: false; initial-value: 1px; }',
      '#p { --a: 1em }',
    ].map((text) => [text, valuesOf(w, text, ['--a', '--b', 'width'])]),
  { jsdom: 31 },
);

parity(
  'which @property rules register: conditions, layers, sheets, shadow trees, registerProperty first',
  (w) => {
    const L = '@property --a { syntax: "<length>"; inherits: false; initial-value: 1px; }';
    const L2 = '@property --a { syntax: "<length>"; inherits: false; initial-value: 2px; }';
    const L3 = '@property --a { syntax: "<length>"; inherits: false; initial-value: 3px; }';
    const L4 = '@property --a { syntax: "<length>"; inherits: false; initial-value: 4px; }';
    const reset = () => {
      w.document.head.innerHTML = '';
      w.document.adoptedStyleSheets = [];
      return tree(w);
    };
    const shadow = (host, text) => {
      const root = host.attachShadow({ mode: 'open' });
      root.innerHTML = `<style>${text}</style><i></i>`;
      return root;
    };
    const out = [];
    for (const text of [
      `@media print { ${L} }`,
      `@media all { ${L} }`,
      `@supports (foo: bar) { ${L} }`,
      `@supports (color: red) { ${L} }`,
      `@layer x { ${L} }`,
      `#q { ${L} }`,
    ]) {
      const get = reset();
      sheet(w, text);
      out.push([text, get('p', '--a')]);
    }
    let get = reset();
    const print = sheet(w, L);
    print.media = 'print';
    out.push(['media=print', get('p', '--a')]);
    get = reset();
    sheet(w, L).sheet.disabled = true;
    out.push(['disabled', get('p', '--a')]);
    get = reset();
    const adopted = new w.CSSStyleSheet();
    adopted.replaceSync(L4);
    w.document.adoptedStyleSheets = [adopted];
    sheet(w, L);
    out.push(['adopted after <style>', get('p', '--a')]);
    get = reset();
    let root = shadow(w.document.getElementById('c'), L2);
    out.push(['a shadow tree', get('p', '--a'), w.getComputedStyle(root.querySelector('i')).getPropertyValue('--a')]);
    sheet(w, L);
    out.push(['the document after a shadow tree', get('p', '--a')]);
    get = reset();
    shadow(w.document.getElementById('p'), L2);
    shadow(w.document.getElementById('c'), L3);
    out.push(['two shadow trees', get('p', '--a')]);
    get = reset();
    shadow(w.document.createElement('div'), L2);
    out.push(['a disconnected host', get('p', '--a')]);
    get = reset();
    const style = sheet(w, '');
    style.sheet.insertRule(L);
    const before = get('p', '--a');
    style.sheet.deleteRule(0);
    out.push(['insertRule, deleteRule', before, get('p', '--a')]);
    style.textContent = L3;
    out.push(['style text', get('p', '--a')]);
    style.remove();
    out.push(['removed', get('p', '--a')]);
    // (a shadow root's adopted sheets register out of the document too;
    // its <style> elements have no sheets there)
    get = reset();
    const host = w.document.getElementById('c');
    host.attachShadow({ mode: 'open' }).innerHTML = `<style>${L2}</style>`;
    const before2 = get('p', '--a');
    host.remove();
    out.push(['a removed host, <style>', before2, get('p', '--a')]);
    get = reset();
    const inner = new w.CSSStyleSheet();
    inner.replaceSync(L4);
    const detached = w.document.createElement('div').attachShadow({ mode: 'open' });
    detached.adoptedStyleSheets = [inner];
    out.push(['adopted by a disconnected shadow root', get('p', '--a')]);
    detached.adoptedStyleSheets = [];
    out.push(['and no longer', get('p', '--a')]);
    root = w.document.getElementById('c').attachShadow({ mode: 'open' });
    root.adoptedStyleSheets = [inner];
    const before4 = get('p', '--a');
    w.document.getElementById('c').remove();
    out.push(['adopted by a shadow root, then removed', before4, get('p', '--a')]);
    get = reset();
    sheet(w, L);
    out.push(['and a <style> of the document', get('p', '--a')]);
    w.CSS.registerProperty({ name: '--a', syntax: '<color>', inherits: true, initialValue: 'red' });
    out.push(['registerProperty over a rule', get('p', '--a'), get('c', '--a')]);
    sheet(w, L2);
    out.push(['and a later rule', get('p', '--a')]);
    return out;
  },
  { jsdom: 31 },
);

parity(
  'registering drops what was computed before; the computed style lists registered names',
  (w) => {
    const get = tree(w);
    const d = w.document;
    sheet(w, '#p { font-size: 20px; --a: 1em; --z: q }');
    const live = w.getComputedStyle(d.getElementById('p'));
    const customs = (id) => [...w.getComputedStyle(d.getElementById(id))].filter((n) => n.startsWith('--'));
    const out = [get('p', '--a'), live.getPropertyValue('--a'), customs('p'), customs('c')];
    w.CSS.registerProperty({ name: '--a', syntax: '<length>', inherits: false, initialValue: '0px' });
    out.push(get('p', '--a'), get('c', '--a'), live.getPropertyValue('--a'), customs('p'), customs('c'));
    w.CSS.registerProperty({ name: '--b', syntax: '*', inherits: false });
    w.CSS.registerProperty({ name: '--m', syntax: '<color>', inherits: false, initialValue: 'red' });
    out.push(customs('p'), customs('c'), live.length);
    const e = d.getElementById('p');
    e.style.setProperty('--a', 'red');
    out.push(e.style.getPropertyValue('--a'), e.style.cssText, get('p', '--a'));
    e.style.setProperty('--a', '2em');
    out.push(e.style.getPropertyValue('--a'), get('p', '--a'));
    out.push(w.getComputedStyle(d.createElement('div')).getPropertyValue('--m'));
    out.push(w.getComputedStyle(d.documentElement).getPropertyValue('--m'));
    return out;
  },
  { jsdom: 31 },
);

parity(
  'registering in a document without sheets drops what was computed (#345 review)',
  (w) => {
    const get = tree(w);
    const e = w.document.getElementById('p');
    e.style.setProperty('--a', 'var(--missing, 2em)');
    e.style.fontSize = '10px';
    const names = () => [...w.getComputedStyle(e)].filter((n) => n.startsWith('--'));
    const before = [get('p', '--a'), names()];
    w.CSS.registerProperty({ name: '--a', syntax: '<length>', inherits: false, initialValue: '0px' });
    w.CSS.registerProperty({ name: '--m', syntax: '<length>', inherits: false, initialValue: '1px' });
    return [before, get('p', '--a'), names()];
  },
  { jsdom: 31 },
);

parity(
  'registered values: cycles through other properties, math functions, comments, integers (#345 review)',
  (w) =>
    [
      P('<length>', false, '1px') + '#p { --a: 2em; font-size: var(--a) }',
      P('<length>', false, '1px') + '#p { --a: 2em; font-size: 10px }',
      P('<color>', false, 'red') + '#p { --a: currentcolor; color: var(--a) }',
      P('<length>', false, '1px') + '#p { --a: 1lh; line-height: var(--a) }',
      P('<length>', false, '1px') + '#p { --a: abs(-1px) }',
      P('<length>', false, '1px') + '#p { --a: round(1.5px, 1px) }',
      P('<length>', false, 'abs(-3px)'),
      P('<length>', false, '1px') + '#p { font-size: 10px; --a: round(1.5em, 1px) }',
      P('<length>', false, '1px') + '#p { --a: abs(-10%) }',
      P('<number>', false, '0') + '#p { --a: sign(-3px) }',
      P('<integer>', false, '0') + '#p { --a: calc(1.499999) }',
      P('<integer>', false, '0') + '#p { --a: calc(infinity) }',
      P('<integer>', false, '0') + '#p { --a: calc(-2.5) }',
      P('<color>', false, '#0000ff'),
      P('<url>', false, 'url(a.png)') + '#p { --a: url("#icon") }',
      P('<url>', false, 'url(a.png)') + '#p { --a: url("") }',
      P('<url>', false, 'url(icons/001.png)'),
    ].map((text) => [
      text,
      (() => {
        const get = tree(w);
        const style = sheet(w, text);
        const out = [
          get('p', '--a'),
          get('c', '--a'),
          ...['font-size', 'color', 'line-height'].map((n) => get('p', n)),
        ];
        style.remove();
        return out;
      })(),
    ]),
  { jsdom: 31 },
);

parity(
  'initial values: hashes, urls, strings, var() and blocks; values with comments (#345 review)',
  (w) => {
    const get = tree(w);
    const rules = [
      P('<color>', false, '#000'),
      P('<color>', false, '#0000ff'),
      P('*', false, '#012'),
      P('<string>', false, '"var(--m)"'),
      P('<url>', false, 'url(icons/001.png)'),
      P('*', false, 'url(icons/001.png)'),
      P('*', false, 'url( a.png )'),
      '@property --a { initial-value: {a}{b}; }',
      '@property --a { initial-value: {a} b; inherits: false }',
      '@property --a { initial-value: a {b}; inherits: false }',
      '@property --a { initial-value: {a} syntax: "<length>"; inherits: false }',
      '@property --a { x: 1 {a} inherits: false; }',
      '@property --a { syntax: {a} inherits: false; }',
      '@property --a { inherits: false {a}; }',
    ].map((text) => [text, ruleOf(w, text)]);
    const reg = (definition) => attempt(() => w.CSS.registerProperty(definition));
    const registered = [
      reg({ name: '--h', syntax: '<color>', inherits: false, initialValue: '#000' }),
      reg({ name: '--h2', syntax: '*', inherits: false, initialValue: '#0001 1e1' }),
      reg({ name: '--c', syntax: '<length>', inherits: false, initialValue: '1px /* note */' }),
      reg({ name: '--s', syntax: '<string>', inherits: false, initialValue: '"var(--m)"' }),
      reg({ name: '--s2', syntax: '*', inherits: false, initialValue: '"var(--m)"' }),
      reg({ name: '--v', syntax: '*', inherits: false, initialValue: '\\76 ar(--b)' }),
      reg({ name: '--v2', syntax: '*', inherits: false, initialValue: 'var(--b)' }),
      reg({ name: '--y', syntax: '*', inherits: false, initialValue: Symbol('x') }),
      reg({ name: '--y', syntax: '*', inherits: false, initialValue: 'x' }),
      reg({ name: Symbol('x') }),
      reg({ name: '--z', syntax: Symbol('x') }),
    ];
    const e = w.document.getElementById('p');
    const values = ['--h', '--h2', '--c', '--s', '--s2', '--y'].map((n) => get('p', n));
    sheet(w, '@property --l { syntax: "<length>+"; inherits: false; initial-value: 1px; }');
    e.style.setProperty('--l', '3px /* n */');
    values.push(get('p', '--l'));
    e.style.setProperty('--l', '3px/**/4px');
    values.push(get('p', '--l'));
    return [rules, registered, values];
  },
  { jsdom: 31 },
);

parity(
  "a typed initial value's urls resolve from the base URL when it is registered (#345 review)",
  (w) => {
    const get = tree(w);
    const d = w.document;
    const base = d.createElement('base');
    base.href = 'https://example.test/a/';
    d.head.append(base);
    w.CSS.registerProperty({ name: '--r', syntax: '<url>', inherits: false, initialValue: 'url(icon.png)' });
    sheet(w, '@property --s { syntax: "<url>"; inherits: false; initial-value: url(icon.png); }');
    const before = get('p', '--s');
    base.href = 'https://example.test/b/';
    return [before, get('p', '--r'), get('p', '--s')];
  },
  { jsdom: 31 },
);
