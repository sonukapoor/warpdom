// CSS value validation, checked against jsdom: invalid values and unknown
// properties are ignored by style writes, cssText and style attributes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hasVarFunction, isValidValue } from '../src/css-values.js';
import { parity } from './parity.js';

const writes = (w) => {
  const style = () => w.document.createElement('div').style;
  const cases = [
    ['width', '10px'],
    ['width', 'undefined%'],
    ['width', '-10px'],
    ['width', 'calc(100% - 10px)'],
    ['width', 'var(--a)'],
    ['width', 'inherit'],
    ['height', 'fit-content'],
    ['color', 'red'],
    ['color', 'notacolor'],
    ['color', '#ggg'],
    ['background-color', 'rgb(1 2 3 / 50%)'],
    ['display', 'grid'],
    ['display', 'flexx'],
    ['display', 'inline flex'],
    ['z-index', '2'],
    ['z-index', '2.5'],
    ['opacity', '0.5'],
    ['opacity', 'abc'],
    ['transform', 'translateX(10px)'],
    ['transform', 'translateX(red)'],
    ['margin', '0 auto'],
    ['margin', '1px 2px 3px 4px 5px'],
    ['padding', '-1px'],
    ['font-size', '12px'],
    ['font-size', 'big'],
    ['font-weight', 'bold'],
    ['font-weight', '0'],
    ['position', 'sticky'],
    ['position', 'stickyy'],
    ['border', '1px solid red'],
    ['border', 'bogus'],
    ['flex', 'auto'],
    ['top', 'auto'],
    ['top', 'auto auto'],
    ['view-timeline-inset', '0 100dvh'],
    ['view-timeline-inset', 'bogus thing'],
    ['grid-template-columns', 'repeat(3, 1fr)'],
    ['box-shadow', '0 0 2px rgba(0,0,0,.5)'],
    ['transition', 'opacity 200ms ease-in-out'],
    ['fill', 'red'],
    ['stroke', 'url(#a) none'],
    ['foo', 'bar'],
    ['--custom', ' anything { } '],
  ];
  const out = cases.map(([name, value]) => {
    const s = style();
    s.setProperty(name, value);
    return `${name}: ${s.getPropertyValue(name)}`;
  });
  // An invalid value keeps the previous one.
  const s = style();
  s.width = '10px';
  s.width = 'undefined%';
  out.push(s.width, s.length);
  s.cssText = 'width: nope; height: 5px; color: red; foo: bar';
  out.push(s.cssText);
  const el = w.document.createElement('div');
  el.setAttribute('style', 'width: bogus; height: 3px');
  out.push(el.style.cssText, el.style.width);
  return out;
};
parity('style writes ignore invalid values', writes);
parity('style writes ignore invalid values (jsdom 26)', writes, { jsdom: 26 });

// display's short forms (jsdom 26 kept multi-keyword values as written).
const displays = (w) =>
  [
    'inline flex',
    'inline grid',
    'block flow',
    'inline flow-root',
    'block flex',
    'block list-item',
    'inline list-item',
    'flex inline',
    'run-in flow',
    'flex',
    'block',
  ].map((v) => {
    const s = w.document.createElement('div').style;
    s.display = v;
    return s.display;
  });
parity('display: short forms', displays);
parity('display: as written (jsdom 26)', displays, { jsdom: 26 });

// The cascade drops invalid declarations too.
parity('getComputedStyle ignores invalid declarations', (w) => {
  const d = w.document;
  d.head.insertAdjacentHTML('beforeend', '<style>.a { width: 10px; } .a { width: bogus; color: nope; }</style>');
  d.body.innerHTML = '<div class="a" style="height: nope; opacity: 0.5"></div>';
  const cs = w.getComputedStyle(d.querySelector('.a'));
  return [cs.width, cs.opacity, d.styleSheets[0].cssRules[1].cssText];
});

test('isValidValue: grammars, var(), math functions and CSS-wide keywords', () => {
  const ok = [
    ['width', '10px'],
    ['width', 'calc(1px + )'],
    ['width', 'var(--x)'],
    ['width', 'INHERIT'],
    ['font-family', '"A B", serif'],
    ['background', 'url(a.png), url(b.png) red'],
    ['grid-template-areas', '"a b" "c d"'],
    ['animation', 'spin 1s linear infinite'],
    ['-webkit-transform', 'rotate(1deg)'],
    ['grid-gap', '1px 2px'],
    ['cursor', 'url(x.cur), auto'],
  ];
  const bad = [
    ['width', '10'],
    ['width', 'auto auto'],
    ['display', 'blockk'],
    ['color', 'linear-gradient(red, blue)'],
    ['-webkit-transform', 'nope'],
  ];
  for (const [name, value] of ok) assert.equal(isValidValue(name, value), true, `${name}: ${value}`);
  for (const [name, value] of bad) assert.equal(isValidValue(name, value), false, `${name}: ${value}`);
});

// flex serializes as its longhands.
const flexes = (w) =>
  [
    'auto',
    'none',
    '1',
    '0',
    '2 3',
    '1 1 0%',
    '10px',
    '1 10px',
    '1 2 10px',
    '0 0 0',
    'content',
    'var(--a)',
    '50%',
    '-1',
    '1 -2',
  ].map((v) => {
    const s = w.document.createElement('div').style;
    s.flex = v;
    return s.flex;
  });
parity('flex: longhand serialization', flexes);
parity('flex: longhand serialization (jsdom 26)', flexes, { jsdom: 26 });

// Minified style sheets pack calc() and var() together; these crashed the
// tokenizer once (handsontable's theme CSS). Validation never throws.
test('isValidValue: minified calc() and var(), and broken input', () => {
  for (const [name, value] of [
    ['margin-inline-start', 'calc(-1*var(--ht-checkbox-size))'],
    ['padding', 'var(--ht-gap-size)calc(2*var(--ht-gap-size))'],
    ['border-radius', 'calc(.5*var(--ht-radio-size))'],
    ['margin-inline-end', 'calc(2*var(--ht-gap-size,4px) + var(--ht-icon-size))'],
    ['width', 'calc(100%/3)'],
  ]) {
    assert.equal(isValidValue(name, value), true, `${name}: ${value}`);
  }
  for (const value of ['a\\', '\\', '-\\', 'url(', 'calc(', '"unterminated'])
    assert.equal(typeof isValidValue('width', value), 'boolean');
});

// var( as a function token (#222): quotes in a comment or an unquoted url()
// start no string, and var( in a comment counts, closed or not (jsdom 30.1.2
// keeps url(a b.png) /* var( and url(a b.png) /* var( */). Values with
// comments are not modeled yet (#162), so this is checked directly.
test('hasVarFunction: comments, strings and unquoted url()s', () => {
  for (const value of [
    '/* " */ var(--a) url(a b.png)',
    "/* ' */ var(--a)",
    'url(a b.png) /* var( */',
    'url(a b.png) /* var(',
    'url(a b.png) /* " */ var(--a)',
    'url(a"b c.png) var(--a)',
    "url(a'b c.png) var(--a)",
    'url( a"b.png) var(--a)',
    'url(a"b.png) url(c d.png) var(--a)',
    '"/*" var(--a)',
    'url(var(--a).png)',
  ])
    assert.equal(hasVarFunction(value), true, value);
  for (const value of [
    'url("var(x).png")',
    "url('var(x).png')",
    'url( "var(x).png" )',
    '/* x */ notvar(x)',
    'url(a/*b.png) xvar(x)',
    '"/* var(x)"',
    'url(x-var(--a).png)',
    // A backslash escapes nothing in a comment: \*/ ends it.
    '/* \\*/ url("var(x).png")',
  ])
    assert.equal(hasVarFunction(value), false, value);
  // Linear: an unclosed comment, an unclosed url() and many url( openings.
  const n = 200000;
  for (const value of ['/*'.repeat(n), 'url('.repeat(n), 'url( '.repeat(n), '/* "'.repeat(n)])
    assert.equal(hasVarFunction(value + 'var('), true);
});

// CSS.supports validates values (jsdom 30); before jsdom 30 there is no CSS
// namespace, and libraries fall back when they detect that.
parity('CSS.supports validates values', (w) => {
  const cases = [
    ['height', 'abc'],
    ['height', '-100'],
    ['height', '100px'],
    ['height', 'min-content'],
    ['height', 'true'],
    ['display', 'flexx'],
    ['display', 'grid'],
    ['foo', 'bar'],
    ['--x', '1'],
    ['width', 'calc(100% - 1px)'],
    ['color', 'nope'],
    ['height', 'var(--a)'],
  ];
  return [
    cases.map(([p, v]) => w.CSS.supports(p, v)),
    w.CSS.supports('(height: abc)'),
    w.CSS.supports('(height: 10px)'),
    w.CSS.supports('(display: flexx) or (display: grid)'),
  ];
});
parity('no CSS namespace before jsdom 30', (w) => [typeof w.CSS, 'CSS' in w], { jsdom: 26 });
