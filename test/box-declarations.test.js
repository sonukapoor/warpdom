// An inline style's margin and padding declarations (#104, #147 item 2),
// against jsdom 20 to 30: a longhand set after its shorthand is merged into
// it (React's style={{ margin: 0, marginTop: 4 }}), from jsdom 27 every
// longhand is an item (padding: 2px has length 5), and cssText, the style
// attribute, the items and the values follow each jsdom's cssstyle.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWindow } from '../src/node.js';
import { parity } from './parity.js';

const VERSIONS = [20, 22, 25, 26, 27, 28, 29, 30];
const PROFILES = {
  20: { jsdom: '20.0.3', cssstyle: '2.3.0' },
  26: { jsdom: '26.1.0' },
  27: { jsdom: '27.4.0' },
  30: {},
};

const camel = (name) => name.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
const box = (family) => [family, ...['top', 'right', 'bottom', 'left'].map((side) => `${family}-${side}`)];
// What a style shows: cssText, the items, and each name's value, priority
// and accessor.
function shown(style, family = 'margin') {
  return [
    style.cssText,
    Array.from(style).join(),
    ...box(family).map(
      (name) =>
        `${name}=${style.getPropertyValue(name)}${style.getPropertyPriority(name) ? '!' : ''}/${style[camel(name)]}`,
    ),
  ];
}
const div = (w) => w.document.createElement('div');

test('margin: 0 then marginTop: 4px merges into the shorthand (React)', () => {
  const expected = {
    20: ['margin: 4px 0px 0px 0px;', 'margin'],
    26: ['margin: 4px 0px 0px 0px;', 'margin'],
    27: ['margin: 4px 0px 0px;', 'margin-right,margin-bottom,margin-left,margin-top,margin'],
    30: ['margin: 4px 0px 0px;', 'margin-right,margin-bottom,margin-left,margin-top,margin'],
  };
  for (const [version, [text, items]] of Object.entries(expected)) {
    const e = div(createWindow(PROFILES[version]));
    e.style.margin = 0;
    e.style.marginTop = '4px';
    assert.equal(e.style.cssText, text, `jsdom ${version}`);
    assert.equal(e.getAttribute('style'), text, `jsdom ${version}`);
    assert.equal(Array.from(e.style).join(), items, `jsdom ${version}`);
  }
});

test('padding: 2px has length 5 from jsdom 27 (#147)', () => {
  for (const [version, length] of [
    [20, 1],
    [26, 1],
    [27, 5],
    [30, 5],
  ]) {
    const e = div(createWindow(PROFILES[version]));
    e.setAttribute('style', 'padding: 2px');
    assert.equal(e.style.length, length, `jsdom ${version}`);
    assert.equal(e.style.cssText, 'padding: 2px;', `jsdom ${version}`);
  }
});

for (const jsdom of VERSIONS) {
  const opts = { jsdom };
  parity(
    `React margin then marginTop, outerHTML and attribute (jsdom ${jsdom})`,
    (w) => {
      w.document.body.innerHTML = '<div></div>';
      const e = w.document.body.firstChild;
      e.style.margin = 0;
      e.style.marginTop = '4px';
      e.style.marginTop = '8px';
      return [...shown(e.style), e.getAttribute('style'), e.outerHTML];
    },
    opts,
  );
  parity(
    `shorthand then longhand by setProperty, padding (jsdom ${jsdom})`,
    (w) => {
      const e = div(w);
      e.style.setProperty('padding', '1px 2px 3px 4px');
      e.style.setProperty('padding-top', '5px');
      return [...shown(e.style, 'padding'), e.getAttribute('style')];
    },
    opts,
  );
  parity(
    `longhand then shorthand, a declaration between (jsdom ${jsdom})`,
    (w) => {
      const e = div(w);
      e.style.marginTop = '0';
      e.style.color = 'red';
      e.style.margin = '1px';
      const a = shown(e.style);
      e.style.marginLeft = '5px';
      return [...a, ...shown(e.style), e.getAttribute('style')];
    },
    opts,
  );
  parity(
    `a shorthand alone, and four longhands (jsdom ${jsdom})`,
    (w) => {
      const a = div(w);
      a.setAttribute('style', 'padding: 2px');
      const b = div(w);
      b.style.paddingLeft = '4px';
      b.style.paddingTop = '1px';
      b.style.paddingBottom = '3px';
      b.style.paddingRight = '2px';
      return [...shown(a.style, 'padding'), ...shown(b.style, 'padding'), b.getAttribute('style')];
    },
    opts,
  );
  parity(
    `removeProperty and '' after a shorthand (jsdom ${jsdom})`,
    (w) => {
      const out = [];
      for (const step of [
        (s) => s.removeProperty('margin-top'),
        (s) => s.removeProperty('margin'),
        (s) => (s.marginTop = ''),
        (s) => s.setProperty('margin-top', ''),
        (s) => (s.margin = ''),
      ]) {
        const e = div(w);
        e.style.margin = '1px 2px';
        e.style.marginTop = '3px';
        out.push(String(step(e.style)), ...shown(e.style), e.getAttribute('style'));
      }
      return out;
    },
    opts,
  );
  parity(
    `priorities (jsdom ${jsdom})`,
    (w) => {
      const out = [];
      for (const steps of [
        [
          ['margin', '1px', 'important'],
          ['margin-top', '3px', ''],
        ],
        [
          ['margin', '1px', ''],
          ['margin-top', '3px', 'important'],
        ],
        [
          ['margin', '1px', 'important'],
          ['margin-top', '3px', 'important'],
        ],
        [
          ['margin-top', '3px', 'important'],
          ['margin', '1px', ''],
        ],
        [
          ['margin-top', '1px', 'important'],
          ['margin-right', '1px', 'important'],
          ['margin-bottom', '1px', 'important'],
          ['margin-left', '1px', 'important'],
        ],
        [
          ['margin-top', '1px', 'important'],
          ['margin-right', '1px', 'important'],
          ['margin-bottom', '1px', 'important'],
          ['margin-left', '1px', ''],
        ],
      ]) {
        const e = div(w);
        for (const [name, value, priority] of steps) e.style.setProperty(name, value, priority);
        out.push(...shown(e.style));
      }
      const e = div(w);
      e.style.setProperty('margin', '1px', 'important');
      e.style.marginTop = '3px';
      out.push(...shown(e.style));
      return out;
    },
    opts,
  );
  parity(
    `cssText and the style attribute (jsdom ${jsdom})`,
    (w) => {
      const out = [];
      for (const text of [
        'margin: 0; margin-top: 4px',
        'margin-top: 4px; margin: 0',
        'margin: 0; color: red; margin-top: 4px',
        'margin-left: 4px; margin-top: 1px; margin-right: 2px; margin-bottom: 3px',
        'margin-top: 5px !important; margin: 1px 2px',
        'margin: 1px !important; margin-top: 2px',
        'padding: 1px; padding-top: 2px !important',
      ]) {
        const a = div(w);
        a.style.cssText = text;
        const b = div(w);
        b.setAttribute('style', text);
        out.push(...shown(a.style, text.includes('padding') ? 'padding' : 'margin'), a.getAttribute('style'));
        out.push(...shown(b.style, text.includes('padding') ? 'padding' : 'margin'), b.getAttribute('style'));
      }
      return out;
    },
    opts,
  );
  parity(
    `var(), auto and CSS-wide keywords (jsdom ${jsdom})`,
    (w) => {
      const out = [];
      for (const [shorthand, longhand] of [
        ['var(--m)', '4px'],
        ['1px', 'var(--m)'],
        ['0 auto', '4px'],
        ['inherit', '4px'],
        ['1px', 'inherit'],
      ]) {
        const e = div(w);
        e.style.margin = shorthand;
        e.style.marginTop = longhand;
        out.push(...shown(e.style), e.getAttribute('style'));
      }
      return out;
    },
    opts,
  );
  parity(
    `computed values after a longhand (jsdom ${jsdom})`,
    (w) => {
      const e = div(w);
      w.document.body.append(e);
      e.style.margin = '1px 2px';
      e.style.marginTop = '3px';
      const cs = w.getComputedStyle(e);
      return [cs.marginTop, cs.marginRight, cs.marginBottom, cs.marginLeft];
    },
    opts,
  );
  parity(
    `inset keeps its longhands apart (jsdom ${jsdom})`,
    (w) => {
      const e = div(w);
      e.style.inset = '0';
      e.style.top = '4px';
      return [e.style.cssText, e.style.length, e.style.top, e.getAttribute('style')];
    },
    opts,
  );
}

// Sequences of writes, from a seeded generator (the differential fuzz that
// checked this model against each jsdom, a few hundred sequences per
// version): no priority on a value the property rejects (jsdom keeps it;
// not modeled), and no priority before jsdom 27 where the style attribute
// is compared (jsdom 20 to 26 write it before setProperty sets the
// priority; not modeled).
const NAMES = box('margin');
const VALUES = ['0', '1px', '2px', '1px 2px', '1px 2px 3px', '1px 2px 3px 4px', 'auto', '5%', ''];
const SIDE_VALUES = ['0', '1px', '2px', 'auto', '5%', ''];
function sequences(count, seed) {
  const random = (n) => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed % n;
  };
  const pick = (list) => list[random(list.length)];
  const out = [];
  for (let i = 0; i < count; i++) {
    const ops = [];
    for (let j = 1 + random(6); j > 0; j--) {
      const r = random(10);
      const name = pick(NAMES);
      if (r < 4) ops.push(['accessor', name, pick(VALUES)]);
      else if (r < 8)
        ops.push([
          'set',
          name,
          name === 'margin' ? pick(VALUES) : pick(SIDE_VALUES),
          random(3) === 0 ? 'important' : '',
        ]);
      else if (r < 9) ops.push(['remove', name]);
      else ops.push(['color']);
    }
    out.push(ops);
  }
  return out;
}
const SEQUENCES = sequences(12, 104);
for (const jsdom of VERSIONS)
  parity(
    `write sequences (jsdom ${jsdom})`,
    (w) =>
      SEQUENCES.map((ops) => {
        const e = div(w);
        const log = [];
        for (const [op, name, value, priority] of ops) {
          if (op === 'accessor') e.style[camel(name)] = value;
          else if (op === 'set') e.style.setProperty(name, value, priority);
          else if (op === 'remove') log.push(e.style.removeProperty(name));
          else e.style.color = 'red';
        }
        return [...shown(e.style), ...log];
      }),
    { jsdom },
  );
