// CSS value validation, checked against jsdom: invalid values and unknown
// properties are ignored by style writes, cssText and style attributes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hasVarFunction, isValidValue } from '../src/css-values.js';
import { createWindow } from '../src/node.js';
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

// var( as jsdom 23 to 30 read it (#222, #234): in lowercase, at the start or
// after whitespace (JavaScript's \s), "(", "/" or "*", in a string or a
// comment too (jsdom 30.1.2 keeps url(a b.png) /* var( and width: "a
// var(--a)"). Values with comments are not modeled yet (#162), so this is
// checked directly.
test('hasVarFunction: what comes before var(', () => {
  for (const value of [
    'var(--a)',
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
    '"/* var(x)"',
    'url(var(--a).png)',
    'url(a\\ var(--a).png)',
    'url(a/var(--a).png)',
    'calc(1px*var(--a))',
    '1px\tvar(--a)',
    '1px\u00a0var(--a)',
    '1px\u3000var(--a)',
    '1px\ufeffvar(--a)',
    'var(--a,var(--b))',
    'red,var(--a) var(--b)',
  ])
    assert.equal(hasVarFunction(value), true, value);
  for (const value of [
    'VAR(--a)',
    'Var(--a) red',
    'url("var(x).png")',
    "url('var(x).png')",
    'url( "var(x).png" )',
    '/* x */ notvar(x)',
    'url(a/*b.png) xvar(x)',
    'url(x-var(--a).png)',
    '/* \\*/ url("var(x).png")',
    'url(a.png)var(--a)',
    'url(a.png),var(--a)',
    'url(a.png) ,var(--a)',
    'red,var(--a)',
    'rgb(1,var(--a),3)',
    '1px+var(--a)',
    '[var(--a)]',
    "'x'var(--a)",
    'x\\+var(--a)',
    'url(x\\!var(--a).png)',
  ])
    assert.equal(hasVarFunction(value), false, value);
  // Linear: many var( openings, none after a character that opens var().
  const n = 200000;
  for (const value of ['xvar('.repeat(n), ',var('.repeat(n), 'url('.repeat(n), '/* "'.repeat(n)])
    assert.equal(hasVarFunction(value + ' var('), true);
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

// #239: in jsdom 20 to 26 a declaration whose value cssstyle rejects, or
// that has none, removes the one before it for the same name in a style
// attribute and an element's cssText (not setProperty or a style sheet's
// rule). Fallbacks too: cssstyle before 4.2 rejects 100dvh and before 4.4
// fit-content, so jsdom 20 to 25 drop both declarations, and a style sheet
// computes them to nothing.
const FALLBACKS = [
  'height: 100vh; height: 100dvh',
  'width: 100px; width: fit-content',
  'background: red; background: linear-gradient(red, blue)',
  'color: blue; color: foo',
  'color: blue; color: 1px',
  'width: 100px; width: bogus',
  'margin: 1px; margin: foo',
  'margin-top: 1px; margin-top: foo',
  'margin-top: 1px; margin: foo',
  'margin: 1px; margin-top: foo',
  'color: blue !important; color: foo',
  'color: blue; color: foo !important',
  'color: blue; color: inherit',
  'color: blue; color: var(--x)',
  'color: blue; color: foo; color: red',
  'color:blue;color:foo;width:1px',
  'color: blue; Color: foo',
  'color: blue; color: ;width: 1px',
  'font: 12px Arial; font: foo',
  'flex: 1; flex: foo',
  'display: block; display: foo',
  'color: blue; foo: bar',
];
for (const jsdom of [20, 22, 25, 26, 27, 28, 29, 30]) {
  parity(
    `jsdom ${jsdom}: an invalid later declaration and the earlier one (#239)`,
    (w) => {
      const out = [];
      for (const text of FALLBACKS) {
        const a = w.document.createElement('div');
        a.setAttribute('style', text);
        const b = w.document.createElement('div');
        b.style.cssText = text;
        // (A style sheet with an empty declaration is read otherwise: not here.)
        w.document.head.innerHTML = text.includes(': ;') ? '' : `<style>.a{${text}}</style>`;
        w.document.body.innerHTML = '<div class="a"></div>';
        const name = text.slice(0, text.indexOf(':'));
        const computed = w.getComputedStyle(w.document.body.firstChild).getPropertyValue(name);
        out.push(`${text} -> ${a.style.cssText} | ${b.style.cssText} | ${b.getAttribute('style')} | ${computed}`);
      }
      // A name without a value at the end, in a style attribute (cssText
      // and a style sheet read it otherwise, not modeled).
      for (const text of ['color: blue; color:', 'color: blue; Color:']) {
        const a = w.document.createElement('div');
        a.setAttribute('style', text);
        out.push(`${text} -> ${a.style.cssText}`);
      }
      const s = w.document.createElement('div').style;
      s.setProperty('height', '10px');
      s.setProperty('height', '100dvh');
      out.push(`setProperty: ${s.cssText}`);
      return out;
    },
    { jsdom },
  );
}

// jsdom 20 to 26 read a style attribute or an element's cssText as cssom
// reads the block first, a name given again as written taking the earlier
// one's place, and then set it declaration by declaration (#261 review):
// an invalid later value under another case keeps the one before it, and
// a property keeps the place of its first declaration. A name left without
// a value at the end leaves the block empty.
const REPEATED = [
  'color: blue; Color: red; color: foo',
  'color: blue; COLOR: red; width: 1px; color: foo',
  'Color: blue; color: foo',
  'Color: blue; color: inherit',
  'color: blue; Color: red; color: green',
  'color: foo; width: 1px; color: blue',
  'color: foo; width: 1px; color: blue !important',
  'width: 1px; color: blue; height: 2px; Color: red; top: 1px; color: foo',
  'color: red !important; Color: blue; color: foo',
  'color : blue; color: foo',
  'color: blue; Color:; width: 1px',
  'width: 1px; color:',
  'color: blue; width: 1px; Color:',
];
for (const jsdom of [20, 22, 25, 26]) {
  parity(
    `jsdom ${jsdom}: a name declared again in a style attribute and cssText (#261 review)`,
    (w) =>
      REPEATED.map((text) => {
        const a = w.document.createElement('div');
        a.setAttribute('style', text);
        const b = w.document.createElement('div');
        b.style.cssText = text;
        const names = Array.from({ length: b.style.length }, (_, i) => b.style.item(i));
        return `${text} -> ${a.style.cssText} | ${b.style.cssText} | ${names.join(',')} | ${b.style.color}`;
      }),
    { jsdom },
  );
}

// The lengths and sizing keywords cssstyle reads before 4.4 (#239):
// before 4.2 px, cm, mm, in, pt, pc, em, ex, ch, rem, vh and vw only.
const LENGTH_NAMES = ['width', 'height', 'flex-basis', 'top', 'font-size', 'margin', 'margin-top', 'padding'];
const LENGTH_VALUES = ['10px', '10vh', '10dvh', '10vmin', '10svw', '1lh', '1rlh', '10vmax', '.5vh', '1e1px'];
const LENGTH_VALUES_ALL = [...LENGTH_VALUES, 'fit-content', 'max-content', 'min-content', 'auto', 'calc(10dvh)'];
for (const jsdom of [20, 22, 25, 26, 27, 28, 29, 30]) {
  parity(
    `jsdom ${jsdom}: lengths and sizing keywords by cssstyle version (#239)`,
    (w) => {
      const out = [];
      for (const name of LENGTH_NAMES)
        for (const value of LENGTH_VALUES_ALL) {
          const a = w.document.createElement('div').style;
          a.setProperty(name, value);
          const b = w.document.createElement('div').style;
          b.cssText = `${name}: 1px ${name === 'margin' || name === 'padding' ? '2px' : ''}; ${name}: ${value}`;
          out.push(`${name}: ${value} -> ${a.cssText} | ${b.cssText}`);
        }
      for (const value of ['10dvh', '1px 10dvh', 'center 10vmin'])
        out.push(`background-position ${value}: ${attempt(w, 'background-position', value)}`);
      for (const value of ['linear-gradient(red, blue)', 'red radial-gradient(red, blue)'])
        out.push(`background ${value}: ${attempt(w, 'background', value)}`);
      out.push(`background-image: ${attempt(w, 'background-image', 'linear-gradient(red, blue)')}`);
      out.push(`flex: ${attempt(w, 'flex', '1 1 10dvh')} ${attempt(w, 'flex', 'max-content')}`);
      out.push(`border: ${attempt(w, 'border', '10dvh solid red')}`);
      // Not read with cssstyle's length parser: kept as written.
      out.push(`min-width: ${attempt(w, 'min-width', '10dvh')} ${attempt(w, 'max-height', 'fit-content')}`);
      return out;
    },
    { jsdom },
  );
}
// jsdom 25 (cssstyle 4.1) rejects a gradient in any case (#261 review).
parity(
  'jsdom 25: gradients in mixed case',
  (w) =>
    ['background', 'background-image'].flatMap((name) =>
      [
        'LINEAR-GRADIENT(red, blue)',
        'Linear-Gradient(red, blue)',
        'RADIAL-GRADIENT(red, blue)',
        'Repeating-Linear-Gradient(red, blue)',
        'CONIC-GRADIENT(red, blue)',
        '-WEBKIT-LINEAR-GRADIENT(red, blue)',
        'url(a.png), LINEAR-GRADIENT(red, blue)',
        'red LINEAR-GRADIENT(red, blue)',
        'url(a.png)',
      ].map((value) => {
        const b = w.document.createElement('div');
        b.style.cssText = `${name}: red; ${name}: ${value}`;
        return `${name}: ${value} -> ${attempt(w, name, value)} | ${b.style.cssText}`;
      }),
    ),
  { jsdom: 25 },
);
function attempt(w, name, value) {
  const s = w.document.createElement('div').style;
  s.setProperty(name, value);
  return s.cssText;
}

// cssstyle 4.2 and 4.3, not installed with a jsdom alias here: measured on
// their own (black box, #239). 4.2 reads the newer units in lowercase
// only; fit-content waits for 4.4, gradients for 4.3.
test('lengths and sizing keywords with cssstyle 4.2 and 4.3 (#239)', () => {
  const css = (cssstyle, name, value) => {
    const s = createWindow({ jsdom: '26.1.0', cssstyle }).document.createElement('div').style;
    s.cssText = `${name}: 1px; ${name}: ${value}`;
    return s.cssText;
  };
  for (const cssstyle of ['4.2.0', '4.3.0']) {
    assert.equal(css(cssstyle, 'height', '100dvh'), 'height: 100dvh;');
    assert.equal(css(cssstyle, 'width', '1cap'), 'width: 1cap;');
    assert.equal(css(cssstyle, 'width', '10DVH'), '');
    assert.equal(css(cssstyle, 'width', '10cqw'), '');
    assert.equal(css(cssstyle, 'width', 'fit-content'), '');
    assert.equal(css(cssstyle, 'margin', '1px 10dvh'), 'margin: 1px 10dvh;');
    // An exponent with a leading zero is not a number there (#261 review).
    assert.equal(css(cssstyle, 'width', '1e01px'), '');
    assert.equal(css(cssstyle, 'width', '1e-01px'), '');
    assert.equal(css(cssstyle, 'margin', '1px 1e01px'), '');
    assert.equal(css(cssstyle, 'width', '1e1px'), 'width: 1e1px;');
    assert.equal(css(cssstyle, 'font', '1e01px serif'), 'font: serif;');
    assert.equal(css(cssstyle, 'font', 'bold 1e-01px serif'), 'font: serif bold;');
    assert.equal(css(cssstyle, 'font', '1e1px serif'), 'font: serif 1e1px 1e1px;');
    // A number without a unit: an exponent in flex only, and no leading
    // zero (#261 review).
    assert.equal(css(cssstyle, 'flex', '1 1e-1 10px'), 'flex: 1 0.1 10px;');
    const flex = (value) => {
      const s = createWindow({ jsdom: '26.1.0', cssstyle }).document.createElement('div').style;
      s.cssText = `flex: 1; flex: ${value}`;
      return s.flexGrow;
    };
    assert.equal(flex('1e1'), '10');
    assert.equal(flex('1.5e1 2'), '15');
    assert.equal(flex('0e1 1 0'), '0');
    assert.equal(flex('1e01'), '');
    assert.equal(flex('01'), '');
    assert.equal(flex('1 01'), '');
    assert.equal(css(cssstyle, 'width', '00'), '');
    assert.equal(css(cssstyle, 'width', '0e1'), '');
    assert.equal(css(cssstyle, 'margin', '0 00'), '');
  }
  assert.equal(css('4.3.0', 'background', 'linear-gradient(red, blue)'), 'background: linear-gradient(red, blue);');
  assert.equal(css('4.4.0', 'width', 'fit-content'), 'width: fit-content;');
  assert.equal(css('4.4.0', 'flex-basis', 'fit-content'), '');
});

// A long whitespace run in a declaration's value is read in linear time
// (#224: the !important check took 191 ms on 20,000 spaces, about 1.2 s
// on 50,000).
test('declarations: a long whitespace run before the end is read quickly', () => {
  const spaces = ' \t'.repeat(25000);
  for (const jsdom of ['20.0.3', '26.1.0', undefined]) {
    const w = createWindow(jsdom ? { jsdom } : {});
    const cases = [
      [`color: red${spaces}x`, ''],
      [`color: red${spaces}!${spaces}important`, 'color: red !important;'],
      [`color: red${spaces}!${spaces}importantx`, ''],
    ];
    for (const [text, expected] of cases) {
      const e = w.document.createElement('div');
      const start = performance.now();
      e.style.cssText = text;
      e.setAttribute('style', text);
      w.document.head.innerHTML = `<style>.a{${text}}</style>`;
      w.getComputedStyle(w.document.body).color;
      const elapsed = performance.now() - start;
      assert.equal(e.style.cssText, expected);
      assert.ok(elapsed < 200, `${jsdom ?? 'latest'} ${JSON.stringify(text.slice(-12))}: ${elapsed} ms`);
    }
  }
});

// Legacy display keywords (#257, found in the 1.0 triage): jsdom 27 and
// later keep css-tree's non-standard ones (-webkit-box, the line-clamp
// idiom), lowercased, and drop others (-ms-flexbox, -webkit-grid); jsdom
// 20 to 26 keep any display value as written. Inline, in a style sheet
// and computed.
const LEGACY_DISPLAYS = [
  '-webkit-box',
  '-webkit-inline-box',
  '-webkit-flex',
  '-webkit-inline-flex',
  '-moz-box',
  '-moz-inline-box',
  '-moz-inline-stack',
  '-ms-flexbox',
  '-ms-inline-flexbox',
  '-ms-grid',
  '-ms-inline-grid',
  '-webkit-grid',
  '-webkit-inline-grid',
  '-moz-flex',
  '-webkit-flexbox',
  '-WEBKIT-BOX',
  '-Webkit-Flex',
];
for (const jsdom of [20, 22, 25, 26, 27, 28, 29, 30]) {
  parity(
    `jsdom ${jsdom}: legacy display keywords (#257)`,
    (w) => {
      const d = w.document;
      return LEGACY_DISPLAYS.map((value) => {
        const a = d.createElement('div');
        a.style.display = value;
        const b = d.createElement('div');
        b.style.cssText = `display: flex; display: ${value}`;
        const c = d.createElement('div');
        c.setAttribute('style', `display: ${value} !important`);
        d.head.innerHTML = `<style>.a{display: ${value}; -webkit-line-clamp: 2}</style>`;
        d.body.innerHTML = '<div class="a"></div>';
        const rule = d.styleSheets[0].cssRules[0].style.display;
        return `${value} -> ${a.style.display} | ${b.style.display} | ${c.style.cssText} | ${rule} | ${w.getComputedStyle(d.body.firstChild).display}`;
      });
    },
    { jsdom },
  );
}
