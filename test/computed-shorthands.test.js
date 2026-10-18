// Computed shorthands and CSS-wide keywords per jsdom release (issue #36,
// black box: jsdom 27.0.0 to 30.1.3 installed and run): which shorthands
// set their longhands, what a shorthand declared with var() or a CSS-wide
// keyword computes to, and the longhands of a plain shorthand.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWindow } from '../src/node.js';
import { parity } from './parity.js';

const RELEASES = ['27.0.0', '28.1.0', '29.0.1', '29.0.2', '29.1.1', '30.0.1', '30.1.0', '30.1.2', '30.1.3'];

// [declaration -> property read, the value per release in RELEASES], as
// measured (a style sheet rule; the style attribute gives the same).
const MEASURED = [
  ['border-radius: var(--r) -> border-radius', ['var(--r)', 'var(--r)', 'var(--r)', '', 'var(--r)', 'var(--r)', 'var(--r)', 'var(--r)', 'var(--r)']],
  ['border-radius: 6px -> border-radius', ['6px', '6px', '6px', '', '6px', '6px', '6px', '6px', '6px']],
  ['border-radius: 6px -> border-top-left-radius', ['', '', '', '0', '0', '0', '0', '0', '0']],
  ['border-radius: inherit -> border-radius', ['inherit', 'inherit', 'inherit', '', 'see individual properties', 'see individual properties', 'see individual properties', 'see individual properties', '']],
  ['border-radius: unset -> border-radius', ['', 'unset', 'unset', '', 'see individual properties', 'see individual properties', 'see individual properties', 'see individual properties', '']],
  ['padding: 0px var(--r) -> padding', ['0px var(--r)', '0px var(--r)', '0px var(--r)', '0', '0', '0', '0', '0', '0']],
  ['padding: 0px var(--r) -> padding-top', ['', '', '', '0', '0', '0', '0', '0', '0']],
  ['padding: inherit -> padding-top', ['inherit', 'inherit', 'inherit', '0', '0', '0', '0', '0', '0']],
  ['margin: revert -> margin', ['revert', 'revert', 'revert', 'revert', 'revert', 'revert', 'revert', 'revert', 'revert']],
  ['inset: 0 var(--r) -> inset', ['0 var(--r)', '0 var(--r)', '0 var(--r)', '0 var(--r)', '0 var(--r)', '0 var(--r)', '0 var(--r)', '0 var(--r)', '0 var(--r)']],
  ['inset: 1px -> top', ['', '', '', 'auto', 'auto', 'auto', 'auto', 'auto', 'auto']],
  ['gap: 4px 8px -> gap', ['4px 8px', '4px 8px', '4px 8px', '4px 8px', '4px 8px', '4px 8px', '4px 8px', '4px 8px', '4px 8px']],
  ['gap: 4px 8px -> row-gap', ['', '', '', 'normal', 'normal', 'normal', 'normal', 'normal', 'normal']],
  ['gap: initial -> gap', ['initial', 'initial', 'initial', 'see individual properties', 'see individual properties', 'see individual properties', 'see individual properties', 'see individual properties', '']],
  ['overflow: hidden -> overflow', ['hidden', 'hidden', 'hidden', 'hidden', 'hidden', 'hidden', 'hidden', 'hidden', 'hidden']],
  ['overflow: hidden -> overflow-x', ['', '', '', 'visible', 'visible', 'visible', 'visible', 'visible', 'visible']],
  ['flex: var(--r) -> flex', ['var(--r)', 'var(--r)', 'var(--r)', 'var(--r)', 'var(--r)', 'var(--r)', 'var(--r)', 'var(--r)', '0 1 auto']],
  ['flex: inherit -> flex', ['inherit', 'inherit', 'inherit', '0 1 auto', '0 1 auto', '0 1 auto', '0 1 auto', '0 1 auto', '0 1 auto']],
  ['background: red -> background', ['red', 'red', 'red', 'red', 'red', 'red', 'red', 'red', 'rgb(255, 0, 0) none repeat scroll 0% 0% / auto padding-box border-box']],
  ['background: red -> background-position', ['0% 0%', '0% 0%', '0% 0%', '0% 0%', '0% 0%', '0% 0%', '0% 0%', '0% 0%', '0% 0%']],
  ['background: var(--r) -> background', ['var(--r)', 'var(--r)', 'var(--r)', 'var(--r)', 'var(--r)', 'var(--r)', 'var(--r)', 'var(--r)', 'rgba(0, 0, 0, 0) none repeat scroll 0% 0% / auto padding-box border-box']],
  ['outline: 1px solid red -> outline-width', ['', '', '', 'medium', 'medium', '16px', 'medium', 'medium', 'medium']],
  ['outline: 1px solid red -> outline', ['1px solid red', '1px solid red', '1px solid red', '1px solid red', '1px solid red', '1px solid red', '1px solid red', '1px solid red', '1px solid red']],
  ['border: 1px solid red -> border', ['', '', '', '1px solid rgb(255, 0, 0)', '1px solid rgb(255, 0, 0)', '1px solid rgb(255, 0, 0)', '1px solid rgb(255, 0, 0)', '1px solid rgb(255, 0, 0)', '1px solid rgb(255, 0, 0)']],
  ['border: 1px solid red -> border-top-width', ['1px', '1px', '1px', '1px', '1px', '1px', '1px', '1px', '1px']],
  ['flex-flow: row wrap -> flex-wrap', ['', '', '', 'nowrap', 'nowrap', 'nowrap', 'nowrap', 'nowrap', 'nowrap']],
  ['list-style: inherit -> list-style', ['inherit', 'inherit', 'inherit', 'see individual properties', 'see individual properties', 'see individual properties', 'see individual properties', 'see individual properties', '']],
  ['long padding-top: inherit', ['inherit', 'inherit', 'inherit', '0', '0', '0', '0', '0', '0']],
  ['long padding-top: unset', ['', 'unset', 'unset', '0', '0', '0', '0', '0', '0']],
  ['long padding-top: revert', ['revert', 'revert', 'revert', 'revert', 'revert', 'revert', 'revert', 'revert', 'revert']],
  ['long display: initial', ['inline', 'inline', 'inline', 'inline', 'inline', 'inline', 'inline', 'inline', 'inline']],
  ['long display: unset', ['inline', 'inline', 'inline', 'inline', 'inline', 'inline', 'inline', 'inline', 'inline']],
];

test('getComputedStyle: shorthands and CSS-wide keywords by jsdom release', () => {
  const actual = [];
  const expected = [];
  for (const [i, jsdom] of RELEASES.entries()) {
    const w = createWindow({ jsdom });
    const d = w.document;
    const style = d.head.appendChild(d.createElement('style'));
    const e = d.body.appendChild(d.createElement('div'));
    e.className = 'k';
    for (const [key, values] of MEASURED) {
      const [, declaration, property] = /^(?:long )?(.*?)(?: -> (.*))?$/.exec(key);
      style.textContent = `.k{${declaration}}`;
      actual.push(`${jsdom} ${key}: ${w.getComputedStyle(e).getPropertyValue(property ?? declaration.split(':')[0])}`);
      expected.push(`${jsdom} ${key}: ${values[i]}`);
    }
  }
  assert.deepEqual(actual, expected);
});

// The same reads against the jsdom installed (30.1.2): computed values
// (getPropertyValue and the accessor) of shorthands declared with var(),
// plain values and CSS-wide keywords, with their longhands, from a rule and
// from the style attribute, and the style attribute's own reads.
const SIDES = ['top', 'right', 'bottom', 'left'];
const LONGHANDS = {
  'border-radius': ['border-top-left-radius', 'border-bottom-right-radius'], padding: SIDES.map((s) => `padding-${s}`), margin: ['margin-top', 'margin-left'],
  inset: ['top', 'left'], gap: ['row-gap', 'column-gap'], overflow: ['overflow-x', 'overflow-y'], flex: ['flex-grow', 'flex-shrink', 'flex-basis'],
  background: ['background-color', 'background-image', 'background-position', 'background-repeat'], border: ['border-top-width', 'border-top-style', 'border-top-color', 'border-width', 'border-top'],
  'border-top': ['border-top-width', 'border-top-color'], 'border-width': ['border-top-width', 'border-left-width'], 'border-color': ['border-top-color', 'border-left-color'],
  outline: ['outline-width', 'outline-style', 'outline-color'], 'text-decoration': ['text-decoration-line'], transition: ['transition-property'],
  'flex-flow': ['flex-direction', 'flex-wrap'], 'list-style': ['list-style-type', 'list-style-position'], 'place-items': ['align-items'],
};
const VALUES = {
  'border-radius': ['var(--r)', '6px var(--r)', '6px', '6px 2px', '1px 2px 3px 4px / 5px'], padding: ['var(--r)', '0px var(--r)', '1px 2px', '0'],
  margin: ['var(--r)', '0 var(--r)', 'auto'], inset: ['var(--r)', '0 var(--r)', '1px', '0'], gap: ['var(--r)', 'var(--r) 2px', '4px 8px'],
  overflow: ['var(--r)', 'hidden', 'hidden auto'], flex: ['var(--r)', '1 var(--r)', '1', 'none'], background: ['var(--r)', 'var(--r) url(a.png)', 'red', 'url(a.png) no-repeat'],
  border: ['var(--r)', '1px solid var(--r)', '1px solid red', 'none'], 'border-top': ['var(--r)', '1px solid red'], 'border-width': ['var(--r)', '1px 2px'],
  'border-color': ['red var(--r)', 'red blue'], outline: ['var(--r)', '1px solid red'], 'text-decoration': ['underline var(--r)', 'underline red'],
  transition: ['all var(--r)', 'all 1s'], 'flex-flow': ['row var(--r)', 'row wrap'], 'list-style': ['var(--r)', 'disc inside'], 'place-items': ['center', 'var(--r)'],
};
const KEYWORDS = ['inherit', 'initial', 'unset', 'revert'];
const camel = (name) => name.replace(/-([a-z])/g, (_, c) => c.toUpperCase());

parity('getComputedStyle and style: shorthands with var(), their longhands and CSS-wide keywords', (w) => {
  const d = w.document;
  const sheet = d.head.appendChild(d.createElement('style'));
  const out = [];
  for (const [name, values] of Object.entries(VALUES)) {
    const names = [name, ...LONGHANDS[name]];
    for (const value of [...values, ...KEYWORDS]) {
      const inline = d.body.appendChild(d.createElement('div'));
      inline.setAttribute('style', `${name}: ${value}`);
      const set = d.createElement('div');
      set.style[camel(name)] = value;
      sheet.textContent = `.k{${name}: ${value}}`;
      const ruled = d.body.appendChild(d.createElement('div'));
      ruled.className = 'k';
      const reads = (style) => names.map((n) => `${style.getPropertyValue(n)}|${style[camel(n)]}`).join(' ; ');
      out.push(`${name}: ${value} => ${inline.style.cssText} ${reads(inline.style)} # ${set.style.cssText} ${reads(set.style)}`
        + ` # ${reads(w.getComputedStyle(inline))} # ${reads(w.getComputedStyle(ruled))}`);
      inline.remove();
      ruled.remove();
    }
  }
  for (const name of ['border-top-left-radius', 'padding-top', 'row-gap', 'top', 'overflow-x', 'flex-grow', 'color', 'display']) {
    for (const value of [...KEYWORDS, 'var(--r)']) {
      const e = d.body.appendChild(d.createElement('div'));
      e.setAttribute('style', `${name}: ${value}`);
      out.push(`${name}: ${value} => ${e.style.getPropertyValue(name)} ${w.getComputedStyle(e).getPropertyValue(name)}`);
      e.remove();
    }
  }
  return out;
});

// Ant Design's ConfigProvider cssVar tests (theme.test.tsx): jest-dom's
// toHaveStyle compares getComputedStyle's border-radius with the value a
// style object gives back.
parity('getComputedStyle: a border-radius rule with var(), as jest-dom compares it', (w) => {
  const d = w.document;
  d.head.innerHTML = '<style>.ant-btn{--ant-btn-shadow:var(--ant-button-default-shadow);border-radius:var(--ant-border-radius);padding:0px var(--ant-padding)}</style>';
  const button = d.body.appendChild(d.createElement('button'));
  button.className = 'ant-btn';
  const cs = w.getComputedStyle(button);
  const copy = d.createElement('div').style;
  copy['border-radius'] = 'var(--ant-border-radius)';
  return [cs['border-radius'], cs.getPropertyValue('border-radius'), copy['border-radius'], cs.getPropertyValue('--ant-btn-shadow'), cs.padding, cs.paddingLeft,
    cs.borderTopLeftRadius];
});

// Computed values of PROPS, an element per declaration (jsdom's computed
// style objects are snapshots from jsdom 28).
const reads = (jsdom, declarations, props) => {
  const w = createWindow({ jsdom });
  return declarations.map((declaration) => {
    const e = w.document.body.appendChild(w.document.createElement('div'));
    if (declaration) e.setAttribute('style', declaration);
    const cs = w.getComputedStyle(e);
    return props.map((p) => (p.startsWith('.') ? cs[p.slice(1)] : cs.getPropertyValue(p))).join(' | ');
  });
};

// jsdom 30.1.3: composed flex and background, keyword values for the
// shorthands it does not expand, undeclared too (measured).
test('getComputedStyle: jsdom 30.1.3 composes flex and background and gives shorthands their initial values', () => {
  const none = 'rgba(0, 0, 0, 0) none repeat scroll 0% 0% / auto padding-box border-box';
  const rest = '0% 0% | auto | visible |  |  | 0px none rgb(0, 0, 0) | start';
  assert.deepEqual(reads('30.1.3', ['', 'flex: var(--a)', 'background: var(--b)', 'inset: inherit', 'gap: unset', 'border-radius: initial', 'border: revert', 'flex-grow: 3',
    'background: url(a.png) center / cover no-repeat fixed content-box red', 'top: 3px', 'overflow-x: hidden', 'background: url(a.png), url(b.png) red'],
  ['flex', 'background', 'background-position', 'inset', 'overflow', 'gap', 'border-radius', 'border', 'text-align', '.borderTopLeftRadius']), [
    `0 1 auto | ${none} | ${rest} | 0`,
    `0 1 auto | ${none} | ${rest} | 0`,
    `0 1 auto | ${none} | ${rest} | 0`,
    `0 1 auto | ${none} | ${rest} | 0`,
    `0 1 auto | ${none} | ${rest} | 0`,
    `0 1 auto | ${none} | ${rest} | 0`,
    `0 1 auto | ${none} | 0% 0% | auto | visible |  |  | revert | start | 0`,
    `3 1 auto | ${none} | ${rest} | 0`,
    `0 1 auto | rgb(255, 0, 0) url("a.png") no-repeat fixed 50% 50% / cover content-box content-box | 50% 50% | auto | visible |  |  | 0px none rgb(0, 0, 0) | start | 0`,
    `0 1 auto | ${none} | ${rest} | 0`,
    `0 1 auto | ${none} | ${rest} | 0`,
    '0 1 auto | url("a.png") repeat scroll 0% 0% / auto padding-box border-box, rgb(255, 0, 0) url("b.png") repeat scroll 0% 0% / auto padding-box border-box'
      + ` | 0% 0%, 0% 0% | auto | visible |  |  | 0px none rgb(0, 0, 0) | start | 0`,
  ]);
});

// jsdom 27 to 30.1.2: the computed background accessor composes the
// longhands (background: red gives rgb(255, 0, 0)), from 29.0.2 a CSS-wide
// keyword the computed color; jsdom 30.1.3 composes getPropertyValue too.
test('getComputedStyle: the background accessor from jsdom 27 to 30.1.2', () => {
  assert.deepEqual(reads('27.4.0', ['background: red'], ['.background', 'background']), ['rgb(255, 0, 0) | red']);
  assert.deepEqual(reads('29.1.1', ['background: url(a.png) no-repeat'], ['.background', 'background']), ['url("a.png") no-repeat rgba(0, 0, 0, 0) | url("a.png") no-repeat']);
  assert.deepEqual(reads('30.1.2', ['background: inherit', 'background: var(--x)'], ['.background', 'background']),
    ['rgba(0, 0, 0, 0) | see individual properties', 'var(--x) | var(--x)']);
});

// jsdom 29.0.2 to 30.0.x keep border width keywords (30.0 computes medium
// to 16px), whatever the border style, and font-weight keywords; 30.1
// resolves them.
test('getComputedStyle: border widths from jsdom 29.0.2 to 30.1', () => {
  const declarations = ['', 'border-top: thin solid', 'border-left-width: 2px', 'font-weight: bold'];
  const props = ['border-top-width', 'border-left-width', 'outline-width', 'font-weight'];
  assert.deepEqual(reads('29.1.1', declarations, props), ['medium | medium | medium | normal', 'thin | medium | medium | normal', 'medium | 2px | medium | normal', 'medium | medium | medium | bold']);
  assert.deepEqual(reads('30.0.1', declarations, props), ['16px | 16px | 16px | normal', 'thin | 16px | 16px | normal', '16px | 2px | 16px | normal', '16px | 16px | 16px | bold']);
  assert.deepEqual(reads('30.1.0', declarations, props), ['0px | 0px | medium | 400', '1px | 0px | medium | 400', '0px | 0px | medium | 400', '0px | 0px | medium | 700']);
});
