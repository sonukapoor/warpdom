// url() by jsdom version (black box, #144): malformed url()s, escapes and
// control characters in background-image, list-style-image,
// border-image-source and the background shorthand, through the style
// object, setProperty, cssText, the style attribute, style sheets and
// getComputedStyle. cssstyle 4.3.1 to 4.6 cache url()s per process (#163),
// so each test has url()s of its own (a prefix).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWindow } from '../src/node.js';
import { parity } from './parity.js';

const B = '\\';
const PROPERTIES = ['background-image', 'list-style-image', 'border-image-source', 'background'];
const camel = (name) => name.replace(/-([a-z])/g, (m, c) => c.toUpperCase());
// p: the test's prefix.
const VALUES = (p) => [
  // malformed
  `url("${p}a.png)`,
  `url('${p}a.png)`,
  `url(${p}a.png`,
  `url("${p}a.png`,
  `url(${p}a b.png)`,
  `url(${p}a.png )`,
  `url( ${p}a.png )`,
  `url("${p}a.png" )`,
  `url(${p}a.png)junk`,
  `url("${p}a.png"x)`,
  `url(${p}a"b.png)`,
  `url(${p}a(b.png)`,
  `url("${p}a(b).png")`,
  `url("${p}a b.png")`,
  `URL(${p}a.png)`,
  // escapes
  `url(${p}a${B}62.png)`,
  `url(${p}a${B}62 .png)`,
  `url("${p}a${B}62 .png")`,
  `url(${p}a${B}(b.png)`,
  `url(${p}a${B}.png)`,
  `url("${p}a${B}${B}b.png")`,
  `url(${p}a${B}"b.png)`,
  `url("${p}a${B}"b.png")`,
  `url(${p}a${B}${B}b.png)`,
  `url(${p}a${B}\nb.png)`,
  // control characters
  `url(${p}a\rb.png)`,
  `url(${p}a\x01b.png)`,
  `url(${p}a\x7fb.png)`,
  `url("${p}a\x01b.png")`,
  `url(${p}a\vb.png)`,
  `url(${p}a\fb.png)`,
  `url("${p}a\nb.png")`,
  `url(${p}a b.png)`,
  `url(\x01${p}a.png)`,
  `url(${p}a\tb.png)`,
  `url("${p}a\x00b.png")`,
  `url("${p}a\x7fb.png")`,
];
// Escaped spaces and parentheses: cached by cssstyle 4.3.1 to 4.6 (below).
const ESCAPED = (p) => [`url(${p}a${B} b.png)`, `url("${p}a${B} b.png")`];

// Each value through each way of setting it; sheets and computed values
// where the profile models them.
function urlScenario(w, p, { sheets = false, computed = false, trailing = true, values = VALUES(p) } = {}) {
  const d = w.document;
  const out = [];
  const after = trailing ? '; width: 1px' : '';
  for (const value of values)
    for (const name of PROPERTIES) {
      const style = (text = '') => {
        const s = d.createElement('div').style;
        s.cssText = text;
        return s;
      };
      const set = style(`color: blue; ${name}: ${name === 'background' ? 'red' : 'url(x.png)'}`);
      set[camel(name)] = value;
      const property = style(`color: blue; ${name}: ${name === 'background' ? 'red' : 'url(x.png)'}`);
      property.setProperty(name, value);
      const text = style(`color: blue; ${name}: ${value}${after}`);
      const e = d.createElement('div');
      e.setAttribute('style', `color: blue; ${name}: ${value}`);
      const row = [set.cssText, property.cssText, text.cssText, e.style.cssText];
      if (computed) {
        d.body.append(e);
        row.push(w.getComputedStyle(e).getPropertyValue(name));
        e.remove();
      }
      if (sheets) {
        const sheet = d.createElement('style');
        sheet.textContent = `#t { color: blue; ${name}: ${value}${after} }`;
        d.head.append(sheet);
        row.push(sheet.sheet.cssRules[0]?.style.cssText ?? 'no rule');
        sheet.remove();
      }
      out.push(`${name}: ${JSON.stringify(value)} -> ${row.join(' | ')}`);
    }
  return out;
}

// jsdom 27 and later read url() as CSS Syntax 3 does: the end of the value
// closes it (url("a.png is url("a.png")), escapes are read, whitespace
// inside an unquoted one, a quote, a parenthesis or a control character make
// it invalid. jsdom 29 and later escape control characters when they write
// it; jsdom 27 writes it as written outside background and background-image.
// Not modeled: style sheets in jsdom 27 and 28 (their own parser), the
// computed value of url("a\\b.png") in jsdom 27 and 28 (read again: \b is an
// escape), cssText with background then another declaration in jsdom 27
// (empty), and a NUL in an unquoted url() in jsdom 30 (setProperty takes it,
// the style object does not).
const SPEC = (p) => VALUES(p).filter((v) => !v.includes('\x00') || v.includes('"'));
for (const jsdom of [30, 29])
  parity(
    `style: malformed url(), escapes and control characters (jsdom ${jsdom}, #144)`,
    (w) => urlScenario(w, `s${jsdom}-`, { sheets: true, computed: true, values: SPEC(`s${jsdom}-`) }),
    { jsdom },
  );
for (const jsdom of [28, 27])
  parity(
    `style: malformed url(), escapes and control characters (jsdom ${jsdom}, #144)`,
    (w) =>
      urlScenario(w, `s${jsdom}-`, {
        trailing: false,
        computed: true,
        values: SPEC(`s${jsdom}-`).filter((v) => !v.includes(`${B}${B}`)),
      }),
    { jsdom },
  );

// jsdom 20 to 26 (cssstyle 2.3 to 4.6): background-image takes a url() whose
// insides have no unescaped quote, parenthesis, space, tab or line feed
// (escapes and control characters are kept), written as is before cssstyle
// 4.3.1, from 4.3.1 in quotes with its escapes read; the shorthand reads
// the escapes before 4.3.1 too (url(a62.png)). list-style-image and
// border-image-source keep any value. A style attribute or cssText with an
// unclosed string or parenthesis declares nothing (a backslash outside a
// string escapes nothing there). Not modeled: style sheets (rules keep their
// values as written) and computed values of url()s with an escape, a
// carriage return or a form feed (read again).
for (const jsdom of [26, 25, 22, 20])
  parity(
    `style: malformed url(), escapes and control characters (jsdom ${jsdom}, #144)`,
    (w) => urlScenario(w, `l${jsdom}-`),
    { jsdom },
  );
parity(
  'style: computed url()s with escapes and control characters (jsdom 26, #144)',
  (w) =>
    urlScenario(w, 'c26-', {
      computed: true,
      values: VALUES('c26-').filter((v) => !/[\\\r\f]/.test(v)),
    }),
  { jsdom: 26 },
);

// cssstyle 4.3.1 to 4.6 (jsdom 23.2, 24.1 and 26.1): background-image takes a
// url() with an escaped space or parenthesis the first time the process
// meets it, with its escapes read; later it is invalid (cached, #163).
for (const jsdom of [26])
  parity(
    `style: background-image with an escaped space, cached (jsdom ${jsdom}, #144)`,
    (w) =>
      ESCAPED(`e${jsdom}-`).flatMap((value) => {
        const write = () => {
          const s = w.document.createElement('div').style;
          s.cssText = 'background-image: url(x.png)';
          s.backgroundImage = value;
          return s.cssText;
        };
        return [write(), write()];
      }),
    { jsdom },
  );

test('style: url() with escapes and control characters by cssstyle version (#144)', () => {
  // Measured with jsdom 26.1.0 and each cssstyle, and jsdom 23.2.0 and 24.1.3 (cssstyle 4.6.0).
  const write = (options, name, value, text = '') => {
    const s = createWindow(options).document.createElement('div').style;
    s.cssText = text;
    s.setProperty(name, value);
    return s.cssText;
  };
  const prefix = (o) => `v${o.jsdom}-${o.cssstyle}-`;
  // Before 4.3.1: background-image as written, the shorthand's escapes read.
  for (const options of [
    { jsdom: '26.1.0', cssstyle: '4.2.0' },
    { jsdom: '25.0.1', cssstyle: '4.1.0' },
  ]) {
    const p = prefix(options);
    assert.equal(write(options, 'background-image', `url(${p}a${B}62.png)`), `background-image: url(${p}a${B}62.png);`);
    assert.equal(write(options, 'background', `url(${p}a${B}62.png)`), `background: url(${p}a62.png);`);
    assert.equal(write(options, 'background', `url("${p}a${B}${B}b.png")`), `background: url(${p}a${B}b.png);`);
    assert.equal(write(options, 'background-image', `url(${p}a${B} b.png)`), `background-image: url(${p}a${B} b.png);`);
    assert.equal(write(options, 'background-image', `url(${p}a${B} b.png)`), `background-image: url(${p}a${B} b.png);`);
    assert.equal(write(options, 'background-image', `url(${p}a\rb.png)`), `background-image: url(${p}a\rb.png);`);
    assert.equal(write(options, 'background-image', `url( ${p}a.png)`), `background-image: url(${p}a.png);`);
    assert.equal(write(options, 'background-image', `URL(${p}a.png)`), '');
  }
  // 4.3.1: in quotes, escapes read (twice in the shorthand); a carriage
  // return kept in the shorthand too.
  const o431 = { jsdom: '26.1.0', cssstyle: '4.3.1' };
  let p = prefix(o431);
  assert.equal(write(o431, 'background-image', `url(${p}a${B}62.png)`), `background-image: url("${p}a62.png");`);
  assert.equal(
    write(o431, 'background-image', `url("${p}a${B}${B}b.png")`),
    `background-image: url("${p}a${B}${B}b.png");`,
  );
  assert.equal(write(o431, 'background', `url("${p}a${B}${B}b.png")`), `background: url("${p}ab.png");`);
  assert.equal(write(o431, 'background', `url(${p}a\rb.png)`), `background: url("${p}a\rb.png");`);
  assert.equal(write(o431, 'background-image', `url(${p}a\fb.png)`), `background-image: url("${p}a\fb.png");`);
  // An escaped space: the first time read, later invalid; the shorthand rejects it.
  assert.equal(write(o431, 'background-image', `url(${p}a${B} b.png)`), `background-image: url("${p}a b.png");`);
  assert.equal(write(o431, 'background-image', `url(${p}a${B} b.png)`, 'color: red'), 'color: red;');
  assert.equal(write(o431, 'background', `url(${p}x${B} b.png)`, 'background: red'), 'background: red;');
  // 4.4 to 4.6: the same in background-image; in the shorthand a carriage
  // return or form feed sets no image, every time (#163: escaped ones too).
  for (const options of [
    { jsdom: '26.1.0', cssstyle: '4.4.0' },
    { jsdom: '26.1.0', cssstyle: '4.5.0' },
    { jsdom: '24.1.3', cssstyle: '4.6.0' },
  ]) {
    p = prefix(options);
    assert.equal(write(options, 'background-image', `url(${p}a${B}62.png)`), `background-image: url("${p}a62.png");`);
    assert.equal(write(options, 'background', `url("${p}a${B}${B}b.png")`), `background: url("${p}a${B}${B}b.png");`);
    assert.equal(write(options, 'background-image', `url(${p}a${B}(b.png)`), `background-image: url("${p}a(b.png");`);
    assert.equal(write(options, 'background-image', `url(${p}a${B}(b.png)`, 'color: red'), 'color: red;');
    assert.equal(write(options, 'background-image', `url(${p}a\rb.png)`), `background-image: url("${p}a\rb.png");`);
    assert.equal(write(options, 'background-image', `url(${p}a\rb.png)`), `background-image: url("${p}a\rb.png");`);
    for (const value of [`url(${p}a\rb.png)`, `url(${p}a\fb.png)`])
      for (let i = 0; i < 2; i++) {
        assert.equal(write(options, 'background', value, 'color: blue; background: red'), 'color: blue;');
        assert.equal(
          write(options, 'background', `red ${value} no-repeat`, 'color: blue; background: green'),
          'color: blue; background: no-repeat red;',
        );
      }
    assert.equal(write(options, 'background', `url(${p}a b.png)`), `background: url("${p}a b.png");`);
  }
});

// jsdom 27 and 28 escape only a double quote in the url() they write, and
// jsdom 27 writes url()s as written elsewhere than in background and
// background-image; jsdom 28 and later write a value that is one url() in
// any property but cursor (fill: url(#a)), not one with more (fill:
// url(#a) none).
for (const jsdom of [30, 28, 27])
  parity(
    `style: url() written by property (jsdom ${jsdom}, #144)`,
    (w) =>
      [
        ['fill', 'url(#a)'],
        ['fill', 'url(#a) none'],
        ['marker-start', `url(a${B}62.png)`],
        ['mask-image', 'url(a.png), url(b.png)'],
        ['mask-image', `url('a"b.png')`],
        ['content', 'url(a.png)'],
        ['list-style', 'url(a.png) inside'],
        ['clip-path', `url("a${B}\nb.png")`],
        ['cursor', 'url(a.png), auto'],
        ['background-image', `url(a.png), url("b${B}${B}c.png")`],
        ['background-image', `url("a${B}9 b.png")`],
        ['background-image', 'url(var(--image).png)'],
        ['filter', 'url(a.png) blur(2px)'],
      ].map(([name, value]) => {
        const s = w.document.createElement('div').style;
        s.setProperty(name, value);
        return `${name}: ${JSON.stringify(value)} -> ${s.cssText}`;
      }),
    { jsdom },
  );

// url( in any case opens a url token in a declaration block (jsdom 27 and
// later): URL(a"b.png) opens no string, URL(a(b.png) no block, and a line
// break in URL("a\nb.png") is a bad string. Sheets in jsdom 27 not modeled.
for (const jsdom of [30, 29, 27])
  parity(
    `style: URL() in any case in a declaration block (jsdom ${jsdom}, #144)`,
    (w) => {
      const d = w.document;
      const p = `u${jsdom}-`;
      return [
        `background: URL(${p}a"b.png); color: red`,
        `marker-start: URL(${p}a(b.png); color: red`,
        `marker-start: Url(${p}a${B}(b.png); color: red`,
        `color: red; background-image: URL("${p}a\nb.png"); width: 1px`,
        `color: red; marker-start: uRl("${p}a\nb.png"); width: 1px`,
      ].flatMap((text) => {
        const s = d.createElement('div').style;
        s.cssText = text;
        const e = d.createElement('div');
        e.setAttribute('style', text);
        const row = [s.cssText, e.style.cssText];
        if (jsdom !== 27) {
          const sheet = d.createElement('style');
          sheet.textContent = `#t { ${text} }`;
          d.head.append(sheet);
          row.push(sheet.sheet.cssRules[0]?.style.cssText ?? 'no rule');
          sheet.remove();
        }
        return `${JSON.stringify(text)} -> ${row.join(' | ')}`;
      });
    },
    { jsdom },
  );

// A control character in a url() is not a number's placeholder in the
// validity cache (shapeOf): url(/1.png) and url(/\x01.png) differ, in
// either order, in properties whose validity is cached by shape.
for (const jsdom of [30, 27])
  parity(
    `style: url() with a control character after one with a digit (jsdom ${jsdom}, #144)`,
    (w) =>
      ['marker-start', 'clip-path', 'offset-path'].flatMap((name) =>
        [
          [`url(/k${jsdom}${name}/1.png)`, `url(/k${jsdom}${name}/\x01.png)`],
          [`url(/m${jsdom}${name}/\x01.png)`, `url(/m${jsdom}${name}/3.png)`],
        ].flatMap((pair) =>
          pair.map((value) => {
            const s = w.document.createElement('div').style;
            s.setProperty(name, value);
            return `${name}: ${JSON.stringify(value)} -> ${s.cssText}`;
          }),
        ),
      ),
    { jsdom },
  );

// A comment's quotes and parentheses open no string or block (jsdom 20 to
// 26 declare nothing for an unclosed one); an unclosed comment is unclosed
// there too. The comments are after the last declaration: warpdom does not
// read comments between declarations or in values (#162).
for (const jsdom of [30, 27, 26, 25, 22, 20])
  parity(
    `style: quotes and parentheses in a comment (jsdom ${jsdom}, #144)`,
    (w) => {
      const d = w.document;
      return [
        ['color: red; width: 1px; /* " */', true],
        ["color: red; width: 1px; /* ' */", true],
        ['color: red; width: 1px; /* ( */', true],
        ['color: red; width: 1px; /* x', false],
      ].map(([text, sheets]) => {
        const s = d.createElement('div').style;
        s.cssText = text;
        const e = d.createElement('div');
        e.setAttribute('style', text);
        const row = [s.cssText, e.style.cssText];
        if (sheets) {
          const sheet = d.createElement('style');
          sheet.textContent = `#t { ${text} }`;
          d.head.append(sheet);
          row.push(sheet.sheet.cssRules[0]?.style.cssText ?? 'no rule');
          sheet.remove();
        }
        return `${JSON.stringify(text)} -> ${row.join(' | ')}`;
      });
    },
    { jsdom },
  );

// A value with var() is kept as written, its url()s too, malformed ones
// included (url(a b.png) after var(), not only url(var(--i).png)); jsdom 26
// does not collapse its whitespace either (var(--a,  myurl(x   y))). jsdom
// 20 to 25 drop var() in these properties.
for (const jsdom of [30, 29, 28, 27, 26, 25, 20])
  parity(
    `style: url() in a value with var() (jsdom ${jsdom}, #144)`,
    (w) => {
      const p = `v${jsdom}-`;
      return ['background-image', 'background', 'list-style-image', 'marker-start'].flatMap((name) =>
        [
          `var(--a, url(${p}a b.png))`,
          `var(--a) url(${p}b c.png)`,
          `var(--a, url(${p}c(d.png)))`,
          `var(--a) url(${p}d${B}(e.png)`,
          `var(--a) url(${p}e.png)`,
          `var(--a, url('${p}f.png'))`,
          `var(--a) url(${p}g${B}62.png)`,
          `var(--a,  myurl(${p}h   i))`,
          'var(--a)  red',
        ].map((value) => {
          const s = w.document.createElement('div').style;
          s.setProperty(name, value);
          const t = w.document.createElement('div').style;
          t.cssText = `${name}: ${value}`;
          return `${name}: ${JSON.stringify(value)} -> ${s.cssText} | ${t.cssText}`;
        }),
      );
    },
    { jsdom },
  );

// Each value set with setProperty, cssText and the style attribute (and a
// style sheet where the profile models it).
function setEachWay(w, names, values, { sheets = false } = {}) {
  const d = w.document;
  return names.flatMap((name) =>
    values.map((value) => {
      const s = d.createElement('div').style;
      s.setProperty(name, value);
      const t = d.createElement('div').style;
      t.cssText = `color: blue; ${name}: ${value}`;
      const e = d.createElement('div');
      e.setAttribute('style', `color: blue; ${name}: ${value}`);
      const row = [s.cssText, t.cssText, e.style.cssText];
      if (sheets) {
        const sheet = d.createElement('style');
        sheet.textContent = `#t { color: blue; ${name}: ${value} }`;
        d.head.append(sheet);
        row.push(sheet.sheet.cssRules[0]?.style.cssText ?? 'no rule');
        sheet.remove();
      }
      return `${name}: ${JSON.stringify(value)} -> ${row.join(' | ')}`;
    }),
  );
}

// A malformed url() in a value with var() is kept to its ")" with escaped
// parentheses skipped, in a string or not, and an unquoted url() has no
// strings, before var() or after it (black box, jsdom 20.0.3 to 30.1.2,
// #222). jsdom 20 to 26 declare
// nothing for a style attribute or cssText where an escaped "(" leaves a
// parenthesis open. Not modeled: url(a\\(b c.png) and url(a(b c.png),
// whose "(" opens nothing in jsdom (kept); style sheets in jsdom 27 and 28.
for (const jsdom of [30, 29, 28, 27, 26, 25, 22, 20])
  parity(
    `style: escapes in a url() in a value with var() (jsdom ${jsdom}, #222)`,
    (w) => {
      const p = `e${jsdom}-`;
      return setEachWay(
        w,
        ['background-image', 'background', 'list-style-image'],
        [
          `var(--a) url(${p}a${B}(b c.png)`,
          `var(--a) url(${p}a${B})b c.png)`,
          `var(--a) url(${p}a${B}(${B}(b c.png)`,
          `url(${p}a${B}(b c.png) var(--a)`,
          `var(--a, url(${p}a${B}(b c.png))`,
          `var(--a, url(${p}a${B})b c.png))`,
          `var(--a) url(${p}a b${B}).png)`,
          `var(--a) url("${p}a${B}"(b.png" c)`,
          `var(--a) url(${p}a"b c.png)`,
          `var(--a) url(${p}a'b c.png)`,
          `url(${p}a"b c.png) var(--a)`,
          `url(${p}a'b c.png) var(--a)`,
          `url(${p}a"b.png) url(${p}c d.png) var(--a)`,
        ],
        { sheets: jsdom >= 29 },
      );
    },
    { jsdom },
  );

// var( in a url() string, or after a name character, is no var(): the
// value's url()s are read as without it (cssstyle 4.3.1 to 4.6 drop
// url("notvar(x).png") in background and background-image, as they drop
// url("a(x).png"); jsdom 28 and later write url('notvar(x).png') in double
// quotes). var( outside a string and not after a name character counts,
// in an unquoted url() too: url(var(--a).png) is kept as written, and in
// jsdom 27 and later url(n-var(--a).png) is a bad url() (black box, jsdom
// 20.0.3 to 30.1.2, #222). Not modeled: VAR( in capitals, which jsdom does
// not read as var(), and url(a.png)var(--a), which it drops.
for (const jsdom of [30, 29, 28, 27, 26, 25, 22, 20])
  parity(
    `style: var( in a url() string (jsdom ${jsdom}, #222)`,
    (w) => {
      const p = `n${jsdom}-`;
      return setEachWay(
        w,
        ['background-image', 'background', 'list-style-image'],
        [
          `url("${p}notvar(x).png")`,
          `url('${p}notvar(x).png')`,
          `url("${p}xvar(x).png")`,
          `url("${p}-var(x).png")`,
          `url("${p}var(x).png")`,
          `url("${p}var(x).png") var(--a)`,
          `url("var(x)${p}.png")`,
          `url('var(x)${p}.png')`,
          `url('var(x)${p}a.png') url(${p}b.png)`,
          `url(var(--a)${p}.png)`,
          `url(${p}var(--a).png)`,
          `url(x${p}-var(--a).png)`,
          `url(${p}a${B} var(--a).png)`,
          `url(${p}a/var(--a).png)`,
        ],
        { sheets: jsdom >= 29 },
      );
    },
    { jsdom },
  );
