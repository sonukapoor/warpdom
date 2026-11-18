// jsdom 31's declaration lists (parse31.js), checked against jsdom 31.0.1:
// CSS Syntax 3's tokens and "parse a list of declarations" for the style
// attribute, cssText, setProperty() and a style sheet's rules.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parity } from './parity.js';
import { createWindow } from '../src/node.js';

// Each text as a style attribute, then as cssText: the block's cssText and
// its property names.
const attribute = (texts) => (w) => {
  const e = w.document.createElement('div');
  return texts.map((text) => {
    e.setAttribute('style', text);
    const fromAttribute = [e.style.cssText, Array.from(e.style).join(' ')];
    e.removeAttribute('style');
    e.style.cssText = text;
    return [text, ...fromAttribute, e.style.cssText];
  });
};

// Each [name, value] set through setProperty(): the block's cssText and the
// value read back.
const set = (pairs) => (w) => {
  const e = w.document.createElement('div');
  return pairs.map(([name, value]) => {
    e.removeAttribute('style');
    e.style.setProperty(name, value);
    return [name, value, e.style.cssText, e.style.getPropertyValue(name)];
  });
};

parity(
  'jsdom 31: bad strings and bad urls in a declaration list',
  attribute([
    '--x: url("c\nx.png"); width: 1px',
    'width: 1px; content: "a\nb"; color: red',
    'width: 1px; background-image: url(a b.png); color: red',
    'width: 1px; --x: url(a b.png); color: red',
    'width: 1px; background-image: url(a"b.png); color: red',
    'width: 1px; background-image: url(a(b.png); color: red',
    'background-image: u\\72l(a b.png); left: 1px',
    'background: URL(a.png); left: 1px',
    'font-family: "a\\"b"; left: 1px',
  ]),
  { jsdom: 31 },
);

parity(
  'jsdom 31: priorities and a ! in a declaration list',
  attribute([
    'color: red !b; left: 1px',
    'color: red !important!important; left: 1px',
    'color: var(--c) !important !important; left: 1px',
    'color: red ! IMPORTANT; left: 1px',
    'color: red !important x; left: 1px',
    'color: var(--c) !foo; left: 1px',
    '--x: a !b; left: 1px',
    '--x: a ! b; left: 1px',
    '--x: [a !b]; left: 1px',
    '--x: {a !b}; left: 1px',
    'color: var(--c, (a !b)); left: 1px',
    'color: var(--c, a !b); left: 1px',
    '--x: var(--c, a !b); left: 1px',
    'color: var(--c) [a !b]; left: 1px',
    'color: var(--c, a !important); left: 1px',
    'margin: 1px; margin-top: 2px !important',
  ]),
  { jsdom: 31 },
);

parity(
  'jsdom 31: comments, empty values and names in a declaration list',
  attribute([
    'color: /*a*/red/*b*/; left: 1px',
    'margin: 1px/**/2px',
    'font-family: a/**/b',
    '--x: /*a*/ a  b /*b*/; left: 1px',
    '--x: a/**/b',
    '--x:;color:red',
    '--x:   ;color:red',
    'color: red; /* left: 1px',
    '--\\61 b: 1; width: 1px',
    'COLOR: red',
    'color : red',
    'col or: red; left: 1px',
    'color: red;;; left: 1px',
    '@media x { color: red }; left: 1px',
    '{ a } left: 1px; color: red',
  ]),
  { jsdom: 31 },
);

parity(
  'jsdom 31: blocks in a declaration list',
  attribute([
    'color: red; --v: (a; b]; c); left: 1px',
    'color: red; --v: [a; left: 1px',
    '--v: [a; !important',
    '--v: (a !important',
    '--v: "a  b',
    '--v: a  "b',
    'background-image: var(--a',
    'background-image: var(--a) (',
    'background-image: var(--a))',
    'background-image: var(--a) ]',
    'background-image: VAR(--a); top: 1px',
    'background-image: vAr(--a) red',
  ]),
  { jsdom: 31 },
);

parity(
  'jsdom 31: escapes in names of a value',
  attribute([
    'color: \\72 ed',
    'color: r\\65 d',
    'width: 1p\\78',
    'width: 1\\65 m',
    'width: 1\\45 M',
    'width: 2px; width: 1\\65+3px',
    'width: 2px; width: 1\\65 +3px',
    'margin: 1\\65 m +3px',
    'display: \\62 lock',
    'font-family: \\61 b',
    'content: "\\61 b"',
    'background-image: url(\\61 .png)',
    '--x: \\61 b',
    'width: \\31 0px',
    'width: c\\61lc(1px + 2px)',
    'width: 1\\65 3px',
    'margin: -\\31 px',
    'color: \\#fff',
    'color: #\\66 ff',
    'width: 1.5e3px; height: -.5em; opacity: +1',
  ]),
  { jsdom: 31 },
);

parity(
  'jsdom 31: values given to setProperty()',
  set([
    ['color', '"bad\n/**/; color: blue'],
    ['color', 'red; color: blue'],
    ['color', 'red /* c */'],
    ['color', 'red !important'],
    ['color', '\\72 ed'],
    ['width', '1\\65+3px'],
    ['margin', '1px/**/2px'],
    ['content', '"a;b"'],
    ['background', 'NONE /**/'],
    ['background-image', 'var(--a) )'],
    ['background-image', 'var(--a'],
    ['background-image', 'var(--a) ('],
    ['background-image', 'var(--a, url(v-a b.png))'],
    ['background-image', 'url(var(--a)n-.png)'],
    ['background-image', 'VAR(--a)'],
    ['font-family', 'a\\31\r\nb'],
    ['--x', '/*a*/ a  b /*b*/'],
    ['--x', 'a; b'],
    ['--x', '(a; b)'],
    ['--x', ' '],
    ['--x', '(a'],
    ['--x', '"a'],
    ['--x', 'a /*b'],
    ['--x', 'a /*/'],
    ['--x', '(a /*b'],
    ['--v', '[a; !important'],
  ]),
  { jsdom: 31 },
);

parity(
  'jsdom 31: an empty custom property read and written',
  (w) => {
    const s = w.document.createElement('div').style;
    const out = [];
    s.cssText = '--x:;';
    out.push(s.cssText, JSON.stringify(s.getPropertyValue('--x')));
    s.cssText = s.cssText;
    out.push(s.cssText);
    s.setProperty('--x', ' ');
    out.push(s.cssText);
    s.cssText = s.cssText;
    out.push(s.cssText);
    return out;
  },
  { jsdom: 31 },
);

parity(
  'jsdom 31: declaration lists in a style sheet',
  (w) => {
    const sheet = w.document.createElement('style');
    // (a bad string, a bad url, a closer of nothing or a block left open
    // in a rule: the rule as here, but jsdom 31 also logs that it could
    // not parse the sheet, which warpdom does not; PLAN.md)
    sheet.textContent = [
      '.b { color: red !b; left: 1px }',
      '.e { color: \\72 ed; --\\61 b: 1 }',
      '.f { margin: 1px/**/2px; --x: /*a*/ a  b /*b*/ }',
    ].join('\n');
    w.document.head.append(sheet);
    return Array.from(sheet.sheet.cssRules, (rule) => rule.cssText);
  },
  { jsdom: 31 },
);

// Many tokens (more than the arrays start with) and deep blocks parse in
// linear time.
test('jsdom 31: long and deeply nested declaration lists', () => {
  const w = createWindow({ jsdom: '31.0.1' });
  const e = w.document.createElement('div');
  const many = Array.from({ length: 3000 }, (_, i) => `--v${i}: a b c`).join('; ');
  const deep = `--d: ${'('.repeat(5000)}a${')'.repeat(5000)}; width: 1px`;
  const start = performance.now();
  e.setAttribute('style', many);
  assert.equal(e.style.length, 3000);
  assert.equal(e.style.getPropertyValue('--v2999'), 'a b c');
  e.setAttribute('style', deep);
  assert.equal(e.style.width, '1px');
  assert.equal(e.style.getPropertyValue('--d').length, 10001);
  e.setAttribute('style', `--o: ${'['.repeat(5000)}`);
  assert.equal(e.style.getPropertyValue('--o').length, 10000);
  assert.ok(performance.now() - start < 2000);
});

// #327 review: an unknown property with VAR(), an empty custom property
// after an important one, an at-rule ending at its block, a run of
// comments.
parity(
  'jsdom 31: review cases of declaration lists',
  attribute([
    'not-a-property: VAR(--x); left: 1px',
    'background-image: VAR(--a); top: 1px',
    '--x: red !important; --x:;',
    '--x:; --x: red',
    '@unknown {} color: red; width: 1px',
    '@media x { color: red } left: 1px; color: blue',
    '@unknown; color: red',
    '@x (a; b) { c } color: red',
    '@x [a { b } ] color: red; left: 1px',
    'margin: 1px/**//**/2px',
    'margin: 1px/**/ /**/2px',
    'color: /**//**/red',
  ]),
  { jsdom: 31 },
);

parity(
  'jsdom 31: review cases of setProperty() values',
  set([
    ['not-a-property', 'VAR(--x)'],
    ['margin', '1px/**//**/2px'],
  ]),
  { jsdom: 31 },
);

// Many short declarations parse in linear time (no search to the end of
// the text per name).
test('jsdom 31: many short declarations', () => {
  const w = createWindow({ jsdom: '31.0.1' });
  const e = w.document.createElement('div');
  const text = Array.from({ length: 20000 }, (_, i) => `--v${i}: a`).join(';');
  const start = performance.now();
  e.setAttribute('style', text);
  assert.equal(e.style.length, 20000);
  assert.ok(performance.now() - start < 2000);
});

// #327 review, second round: custom property names serialized as
// identifiers, an unquoted url(), a string ending in a backslash and a
// comment closed at the end, non-printables in url(), an escaped CRLF in
// a string, \- in a value.
parity(
  'jsdom 31: names, closing and escapes read again',
  (w) => {
    const s = w.document.createElement('div').style;
    const again = (text) => {
      s.cssText = text;
      const first = s.cssText;
      s.cssText = s.cssText;
      return [text, first, s.cssText];
    };
    const out = [
      again('--a\\3a b: red; left: 1px'),
      again('--\\31 a: 1'),
      again('--\\-: 1'),
      again('--a\\ b: 1'),
      again('--x: url(a.png'),
      again('background-image: url(a.png'),
      again('--x: "a\\'),
      again('--x: "a\\\\'),
      again('--x: url(a\u0001b); left: 1px'),
      again('background-image: url(a\u0001b); left: 1px'),
      again('font-family: \\-'),
      again('font-family: \\-a'),
    ];
    s.cssText = '';
    s.setProperty('--x', 'url(a.png');
    s.setProperty('color', 'red');
    s.setProperty('--y', '"a\\');
    s.setProperty('font-family', '\\-');
    out.push(s.cssText);
    s.cssText = '';
    s.content = '"a\\\r\nb"';
    out.push(s.cssText);
    return out;
  },
  { jsdom: 31 },
);

// #327 review, closer look: whitespace and comments at the end of a block
// left open are the block's, a backslash at the very end is an escape for
// U+FFFD.
parity(
  'jsdom 31: the end of a value left open',
  attribute([
    '--x: (a ',
    '--x: (a  /*c*/  ',
    '--x: (a /* b',
    '--x: [a /**/',
    '--x: (a\\',
    '--x: a\\',
    '--x: a \\',
    '--x: "a" \\',
    '--x: url(a\\',
    'font-family: a\\',
    'font-family: a \\',
    'font-family: \\e9 t\\e9',
    'background-image: var(--a ',
  ]),
  { jsdom: 31 },
);

parity(
  'jsdom 31: a custom property set with a block left open',
  set([
    ['--x', '(a '],
    ['--x', '(a /* b'],
    ['--x', 'a\\'],
    ['--x', '"a  '],
    ['--x', 'a /* b  '],
    ['--x', '  a  '],
  ]),
  { jsdom: 31 },
);
