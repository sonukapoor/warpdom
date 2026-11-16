// jsdom 31's computed values (cascade.js, lengths.js, var-substitution.js),
// checked against jsdom 31.0.1: var() substituted, 0 lengths as 0px, more
// units resolved, line-height numbers to px.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parity } from './parity.js';
import { createWindow } from '../src/node.js';

// Each case: the element's style attribute, under a parent (section) with
// its own; the computed values of names.
const computed =
  (cases, names, { parent = '', sheet = '', root = '' } = {}) =>
  (w) => {
    const d = w.document;
    if (sheet) d.head.append(Object.assign(d.createElement('style'), { textContent: sheet }));
    if (root) d.documentElement.setAttribute('style', root);
    return cases.map((text) => {
      const p = d.body.appendChild(d.createElement('section'));
      p.setAttribute('style', parent);
      const el = p.appendChild(d.createElement('div'));
      el.className = 'x';
      el.setAttribute('style', text);
      const cs = w.getComputedStyle(el);
      return [text, ...names.map((n) => `${n}=${cs.getPropertyValue(n)}`)];
    });
  };

parity(
  'jsdom 31: var() is substituted in computed values',
  computed(
    [
      'width: var(--p)',
      'width: var(--a); --a: var(--p)',
      'width: calc(var(--p) * 2)',
      'width: var(--nope)',
      'width: var(--nope, 3em)',
      'width: var(--a, var(--p))',
      'width: var(--a); --a: red',
      'color: var(--nope)',
      'color: var(--a); --a: blue',
      'display: var(--d, block)',
      'margin-top: var(--A); --A: 3px',
      'font-size: var(--f); --f: 2em',
      '--a: var(--b); --b: var(--a); width: var(--a)',
      '--a: 1px  2px ; --b: var(--a)',
    ],
    ['width', 'color', 'display', 'margin-top', 'font-size', '--a', '--b'],
    { parent: '--p: 7px; color: red' },
  ),
  { jsdom: 31 },
);

parity(
  'jsdom 31: a shorthand with var() computes its longhands from the substituted value',
  computed(
    [
      'margin: var(--m); --m: 1px 2px',
      'margin: var(--m); --m: red',
      'padding: var(--nope)',
      'border: var(--b); --b: 1px solid red',
      'background: var(--bg); --bg: red',
      '',
    ],
    ['margin-top', 'margin-left', 'padding-top', 'border-top-width', 'border-top-color', 'background-color'],
    { sheet: '.x:empty { margin: var(--r) } section { --r: 4px }' },
  ),
  { jsdom: 31 },
);

parity(
  'jsdom 31: lengths, zeros, viewport and container units',
  computed(
    [
      '',
      'margin-top: 0; width: 0',
      'width: 10svw; height: 10dvh; margin-top: 10lvmax',
      'width: 10cqw; height: 10cqh; margin-top: 10cqmin',
      'width: 1cqi; height: 1cqb; margin-top: 10cqmax',
      'width: 10svi; height: 10dvb',
      'width: 1cap; height: 1rcap; margin-top: 1ic',
    ],
    ['margin-top', 'width', 'height', 'padding-left', 'text-indent', 'outline-offset', 'font-family'],
    { parent: 'font-size: 20px', root: 'font-size: 10px' },
  ),
  { jsdom: 31 },
);

parity(
  'jsdom 31: line-height numbers to px, lh and rlh from line-heights',
  computed(
    [
      'line-height: 2',
      'line-height: calc(2 * 1)',
      'line-height: 0',
      'line-height: 150%',
      'line-height: normal',
      'line-height: var(--l); --l: 3',
      'font-size: 10px',
      'width: 1lh',
      'width: 1lh; line-height: 2',
      'width: 1lh; line-height: normal',
      'line-height: 1lh',
      'font-size: 1lh',
      'width: 2lh; font-size: 10px',
      'width: 1rlh',
      'width: calc(1em + 1lh); line-height: calc(1em + 1lh); font-size: calc(1em + 1lh)',
      'font-size: math',
    ],
    ['width', 'line-height', 'font-size'],
    { parent: 'font-size: 20px; line-height: 30px', root: 'line-height: 3; font-size: 10px' },
  ),
  { jsdom: 31 },
);

parity(
  'jsdom 31: line-height normal is 1.15 times the font size in lh',
  computed(['width: 1lh', 'width: 1rlh', 'font-size: 1lh', 'line-height: 1lh'], ['width', 'font-size', 'line-height'], {
    parent: 'font-size: 20px',
    root: 'font-size: 10px',
  }),
  { jsdom: 31 },
);

// #323 review: a cycle invalidates each of its properties whatever their
// fallbacks; var( in a string, a quoted url(), after an escape or in a
// comment is text; comments at a substituted value's ends go.
parity(
  'jsdom 31: var() cycles with fallbacks, and var( as text',
  computed(
    [
      '--a: var(--b, 1px); --b: var(--a); width: var(--a, 5px)',
      '--a: var(--b); --b: var(--c); --c: var(--b)',
      '--a: var(--b, 2px); --b: var(--b)',
      '--a: "var(--missing)"',
      '--a: var(--missing, "var(--x)")',
      "--a: url('var(--b)'); --b: 1px",
      '--a: var(--b) /* var(--c) */; --b: 1px',
      '--a: x\\var(--b); --b: 1px',
      '--a: var(--b)/**/; --b: 1px',
      '--a: /* c */ var(--b); --b: 1px',
      '--a: var(--b)  /* c */  x; --b: 1px',
    ],
    ['width', '--a', '--b', '--c'],
  ),
  { jsdom: 31 },
);

// #323 review, second round: a quoted url() is a function whose string
// may hold ")"; comments in var()'s arguments are no part of the name or
// the separator; var( in a string in content is text.
parity(
  'jsdom 31: quoted url() and comments in var() arguments',
  computed(
    [
      '--a: url("a)var(--missing)")',
      "--a: url('a)var(--b)'); --b: 1px",
      '--c: 1px; --b: var(--c/**/, 5px)',
      '--c: 1px; --b: var(--c/*,*/, 5px)',
      '--b: var(/**/--c, 5px); --c: 1px',
      '--b: var( --c /* x */ , 5px); --c: 1px',
      'content: "var(--missing)"',
      "content: 'var(--a)'; --a: 'y'",
      'content: "a" var(--a); --a: "b"',
    ],
    ['--a', '--b', 'content'],
  ),
  { jsdom: 31 },
);

// #323 review, third round: CSS comments do not nest; only CSS whitespace
// is trimmed (U+00A0 is a name code point); a custom property that
// substitutes to nothing is a space, set, so no fallback is taken for it.
parity(
  'jsdom 31: comment and whitespace ends, and custom properties substituted to nothing',
  computed(
    [
      '--b: 1px; --a: var(--b) /* outer /* inner */',
      '--b: 1px; --a: var(--b) /* x */ y /* z */',
      '--a: var(b, 5px)',
      '--b: 1px; --a: var(\u00a0--b, 3px)',
      '--a: var(--n,\u00a05px)',
      '--c: var(--missing,); width: var(--c, 5px)',
      '--c: var(--missing, /**/); --a: var(--c, 5px)',
    ],
    ['width', '--a', '--c'],
  ),
  { jsdom: 31 },
);

// Substitution keeps token boundaries: where two tokens would run into
// one, an empty comment goes between them (CSS Syntax 3, 9; #323 review).
parity(
  'jsdom 31: substituted tokens stay apart',
  (w) => {
    const toks = [
      'a',
      'f(1)',
      'url(x)',
      '-',
      '1',
      '1%',
      '1px',
      '(1)',
      '#a',
      '@a',
      '#',
      '@',
      '.',
      '+',
      '/',
      '*',
      '%',
      '-->',
      '"s"',
      ',',
    ];
    const out = [];
    for (const l of toks) {
      const el = w.document.body.appendChild(w.document.createElement('div'));
      el.setAttribute(
        'style',
        `--l: ${l}; ${toks.map((r, i) => `--r${i}: ${r}; --b${i}: var(--l)var(--r${i})`).join('; ')}`,
      );
      const cs = w.getComputedStyle(el);
      out.push(toks.map((_, i) => cs.getPropertyValue(`--b${i}`)).join(' | '));
    }
    return out;
  },
  { jsdom: 31 },
);

parity(
  'jsdom 31: token boundaries around var() in values',
  computed(
    [
      '--a: 1; width: var(--a)px',
      '--a: 1; --b: x var(--a)0 y',
      '--a: 1; --b: var(--a)var(--n, px)',
      '--a: 1; --b: var(--n,)px',
      '--a: 1; width: calc(var(--a) * 1px)',
      '--a: a; --b: -var(--a)',
      '--a: 1; --b: #var(--a)',
      '--a: 1; --b: @var(--a)',
      '--b: x#var(--a, 2)',
      '--a: 1; --b: # var(--a)',
      '--a: 1; --b: #-var(--a) @-var(--a)',
    ],
    ['width', '--b'],
  ),
  { jsdom: 31 },
);

// Escapes: a function or custom property name is read with its escapes
// decoded (\76 ar( is var(), var(--\62) is --b); an escaped space
// continues a name (x\ var( is a function named "x var") (#323 review).
parity(
  'jsdom 31: escapes in var() and custom property names',
  computed(
    [
      '--b: 1; --a: \\76 ar(--b)',
      '--b: 1; --a: v\\61r(--b)',
      '--b: 1; --a: VA\\52(--b)',
      '--b: 1; --a: var(\\2d-b)',
      '--b: 1; --a: var(--\\62)',
      '--b: 1; --a: x\\ var(--b)',
      '--b: 1; --a: "a\\"var(--b)"',
      '--b: 1; --a: var(--b)\\,x',
      '--b: 1; --a: #\\76 ar(--b)',
    ],
    ['--a'],
  ),
  { jsdom: 31 },
);

// A custom property used twice by the next one, 40 deep: each is
// substituted once per element, not once per use (#323 review). Each one
// is invalid (var(--missing)), so the values stay short; substituted per
// use, this would take 2^40 lookups.
test('jsdom 31: a custom property is substituted once per element', { timeout: 10000 }, () => {
  const w = createWindow({ jsdom: '31.0.1' });
  let text = '--a0: x;';
  for (let i = 1; i <= 40; i++) text += `--a${i}: var(--a${i - 1}, y) var(--a${i - 1}, y) var(--missing);`;
  const el = w.document.body.appendChild(w.document.createElement('div'));
  el.setAttribute('style', `${text} --top: var(--a40, ok)`);
  const cs = w.getComputedStyle(el);
  assert.equal(cs.getPropertyValue('--top'), 'ok');
  assert.equal(cs.getPropertyValue('--a40'), '');
});
