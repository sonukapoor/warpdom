// jsdom 31's colors (colors.js, cascade.js), checked against jsdom 31.0.1:
// channels rounded once, alpha in 8 bits, the default color from the
// root's color-scheme, initial values and currentcolor per property,
// color-mix() as CSS Color 5 mixes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parity } from './parity.js';
import { mixColor } from '../src/colors.js';

const read = (w, el, props) => {
  const cs = w.getComputedStyle(el);
  return props.map((p) => cs.getPropertyValue(p));
};

// Declared (unless computedOnly) and computed, per color.
const colorValues =
  (colors, prop = 'color', computedOnly = false) =>
  (w) => {
    const e = w.document.body.appendChild(w.document.createElement('div'));
    return colors.map((c) => {
      e.style.setProperty(prop, '');
      e.style.setProperty(prop, c);
      const computed = w.getComputedStyle(e).getPropertyValue(prop);
      return computedOnly ? [c, computed] : [c, e.style.getPropertyValue(prop), computed];
    });
  };

parity(
  'jsdom 31: color channels rounded once, alpha in 8 bits',
  colorValues([
    'hsl(102, 53%, 61%)',
    'hsl(0, 16%, 68%)',
    'hsl(0, 42%, 24%)',
    'hsl(0, 81%, 68%)',
    'hsl(0, 0%, 79%)',
    'hsla(102, 53%, 61%, 0.5)',
    'hsl(102 53% 61%)',
    'rgb(113.45, 0, 0)',
    'rgb(113.5 0 0)',
    'rgb(44.5%, 64.5%, 4.5%)',
    'rgb(79%, 0%, 0%)',
    'hwb(205 6% 9%)',
    'hwb(0 39% 21%)',
    'hwb(120 50% 60% / 0.5)',
    'rgba(0, 0, 0, .1234)',
    'rgba(0, 0, 0, 0.002)',
    'rgba(0, 0, 0, 0.998)',
    'rgba(0, 0, 0, 0.996)',
    'rgb(0 0 0 / 0.333)',
    'rgb(0 0 0 / 33.3%)',
    'rgba(1, 2, 3, 0.49)',
    'hsl(0 50% 50% / .1234)',
    '#abc8',
    '#0000ff80',
    '#0000',
  ]),
  { jsdom: 31 },
);

parity(
  'jsdom 31: colors in other color properties rounded so too',
  colorValues(['hsl(102, 53%, 61%)', 'rgba(0, 0, 0, .1234)', 'hwb(0 39% 21% / 0.002)'], 'border-top-color'),
  { jsdom: 31 },
);

// The default color is CanvasText under the root's color-scheme, which the
// root's descendants inherit as computed; a system color, or color:
// initial, takes the element's own color-scheme, dark where it holds dark
// and not light (only dark, dark foo).
const SCHEME_PROPS = ['color', 'border-top-color', 'outline-color', 'text-decoration-color', 'background-color'];
function schemeChains(w) {
  const d = w.document;
  const out = {};
  const chain = (name, parent, styles) => {
    let p = parent;
    const els = styles.map((style) => {
      const el = d.createElement('div');
      el.setAttribute('style', style);
      p.appendChild(el);
      return (p = el);
    });
    out[name] = els.map((el) => read(w, el, SCHEME_PROPS));
  };
  chain('connected', d.body, ['color-scheme: dark', '', 'color-scheme: light', '']);
  chain('initial', d.body, ['color-scheme: dark; color: initial', 'color-scheme: light', 'color: initial']);
  chain('keywords', d.body, ['color-scheme: dark; color: inherit', 'color: unset; border-top-color: initial']);
  chain('currentcolor', d.body, ['color-scheme: dark; color: currentcolor', 'color-scheme: light']);
  chain('declared', d.body, [
    'color: CanvasText',
    'color-scheme: dark',
    'color: red; color-scheme: light',
    'color-scheme: dark; background-color: Canvas',
  ]);
  for (const scheme of [
    'only dark',
    'dark only',
    'dark foo',
    'foo dark',
    'dark dark',
    'DARK',
    'light dark',
    'dark light',
  ])
    chain(scheme, d.body, [`color-scheme: ${scheme}; color: CanvasText; background-color: Canvas`, '']);
  // (A shadow tree's top inherits from its host in jsdom 31, not modeled
  // yet: PLAN.md, shadow scoping.)
  return out;
}
parity('jsdom 31: the default color under color-scheme: dark', schemeChains, { jsdom: 31 });

// The root's color-scheme, from a style sheet or its style attribute.
function rootSchemes(w) {
  const d = w.document;
  d.head.innerHTML = '<style>:root { color-scheme: dark }</style>';
  const div = d.body.appendChild(d.createElement('div'));
  const dark = d.body.appendChild(d.createElement('div'));
  d.body.style.colorScheme = 'light';
  dark.style.colorScheme = 'dark';
  const colors = () => [d.documentElement, d.body, div, dark].map((el) => w.getComputedStyle(el).color);
  const out = [colors()];
  d.head.innerHTML = '';
  out.push(colors());
  d.documentElement.style.colorScheme = 'only dark';
  out.push(colors());
  d.documentElement.style.cssText = 'color-scheme: dark; color: red';
  out.push(colors());
  return out;
}
parity("jsdom 31: the root's color-scheme gives the default color", rootSchemes, { jsdom: 31 });

// Every system color under color-scheme: dark (ButtonText white, not
// jsdom 27 to 30's rgb(255, 255, 155)).
const SYSTEM_COLORS = `AccentColor AccentColorText ActiveText ButtonBorder ButtonFace ButtonText Canvas CanvasText Field FieldText GrayText Highlight HighlightText LinkText Mark MarkText SelectedItem SelectedItemText VisitedText ActiveBorder ActiveCaption AppWorkspace Background ButtonHighlight ButtonShadow CaptionText InactiveBorder InactiveCaption InactiveCaptionText InfoBackground InfoText Menu MenuText Scrollbar ThreeDDarkShadow ThreeDFace ThreeDHighlight ThreeDLightShadow ThreeDShadow Window WindowFrame WindowText`;
parity(
  'jsdom 31: system colors under color-scheme: dark',
  (w) => {
    const el = w.document.body.appendChild(w.document.createElement('div'));
    el.style.colorScheme = 'dark';
    return SYSTEM_COLORS.split(' ').map((c) => {
      el.style.color = c;
      return [c, w.getComputedStyle(el).color];
    });
  },
  { jsdom: 31 },
);

// The color properties' initial values (outline-color and caret-color
// currentcolor, accent-color and scrollbar-color auto, stroke and
// text-shadow none, stop-color black), under a color and a dark root.
const COLOR_PROPS = [
  '-webkit-text-fill-color',
  '-webkit-text-stroke-color',
  'accent-color',
  'background-color',
  'border-top-color',
  'border-block-start-color',
  'box-shadow-color',
  'caret-color',
  'column-rule-color',
  'fill',
  'flood-color',
  'lighting-color',
  'outline-color',
  'row-rule-color',
  'scrollbar-color',
  'stop-color',
  'stroke',
  'text-decoration-color',
  'text-emphasis-color',
  'text-shadow',
];
parity(
  'jsdom 31: initial values of the color properties',
  (w) => {
    const d = w.document;
    const plain = d.body.appendChild(d.createElement('div'));
    const green = d.body.appendChild(d.createElement('div'));
    green.style.color = 'green';
    const out = [read(w, d.documentElement, COLOR_PROPS), read(w, plain, COLOR_PROPS), read(w, green, COLOR_PROPS)];
    d.documentElement.style.colorScheme = 'dark';
    out.push(read(w, plain, COLOR_PROPS));
    return out;
  },
  { jsdom: 31 },
);

// currentcolor, a mix of it, a system color, auto and CSS-wide keywords
// per property: accent-color, box-shadow-color, fill and stroke keep
// currentcolor (and a mix of it) as declared; caret-color: auto is the
// color.
const perProperty = (values) => (w) => {
  const d = w.document;
  const parent = d.body.appendChild(d.createElement('section'));
  parent.style.cssText = 'color: blue; outline-color: green; caret-color: auto; accent-color: currentcolor';
  return values.map((v) => {
    const el = parent.appendChild(d.createElement('div'));
    el.setAttribute('style', `color: red; color-scheme: dark; ${COLOR_PROPS.map((p) => `${p}: ${v}`).join('; ')}`);
    return [v, ...read(w, el, COLOR_PROPS)];
  });
};
parity(
  'jsdom 31: currentcolor and keywords per color property',
  perProperty([
    'currentcolor',
    'currentColor',
    'color-mix(in srgb, currentcolor, blue)',
    'CanvasText',
    'auto',
    'none',
    'inherit',
    'initial',
    'unset',
    'red',
  ]),
  { jsdom: 31 },
);

// color-mix() in sRGB as CSS Color 5 mixes it: of the colors as given
// (hsl() and alpha not rounded first), any number of them, the missing
// percentages sharing what is left, 0% each an even mix at alpha 0, system
// colors under the element's color-scheme. (Declared mixes serialize as
// jsdom 31 writes them in part B: blue 25%, red 75%.)
parity(
  'jsdom 31: color-mix()',
  colorValues(
    [
      'color-mix(in srgb, blue, red)',
      'color-mix(in srgb, blue 25%, red)',
      'color-mix(in srgb, blue 33.3333%, red)',
      'color-mix(in srgb, blue, transparent 66.6667%)',
      'color-mix(in srgb, rgb(0 0 255 / 0.333333), red)',
      'color-mix(in srgb, rgb(0 0 255 / 0.1234), red)',
      'color-mix(in srgb, #0000ff80, red)',
      'color-mix(in srgb, rgb(1 2 3 / .5), rgb(200 100 50 / .25))',
      'color-mix(in srgb, hsl(120 50% 50%), red)',
      'color-mix(in srgb, hwb(0 39% 21%), blue)',
      'color-mix(in srgb, rgb(113.45 0 0), blue)',
      'color-mix(in srgb, blue, red, green)',
      'color-mix(in srgb, blue 50%, red, green)',
      'color-mix(in srgb, blue 20%, red 20%, green)',
      'color-mix(in srgb, blue)',
      'color-mix(in srgb, blue 40%)',
      'color-mix(in srgb, blue 0%, red 0%)',
      'color-mix(in srgb, blue 20%, red 20%)',
      'color-mix(in srgb, blue 60%, red 60%)',
      'color-mix(in srgb, color-mix(in srgb, blue, red), white)',
      'color-mix(in srgb, color(srgb 1 0 0 / 0.5), blue)',
      'color-mix(in srgb, canvastext, red)',
      'color-mix(in srgb, currentcolor, red)',
    ],
    'background-color',
    true,
  ),
  { jsdom: 31 },
);
parity(
  'jsdom 31: color-mix() of system colors under color-scheme: dark',
  (w) => {
    const el = w.document.body.appendChild(w.document.createElement('div'));
    el.style.cssText =
      'color-scheme: dark; background-color: color-mix(in srgb, canvastext, red); border-top-color: color-mix(in srgb, buttontext 25%, color-mix(in srgb, canvas, blue))';
    return read(w, el, ['background-color', 'border-top-color']);
  },
  { jsdom: 31 },
);

test('jsdom 31: color-mix() of many colors stays linear', () => {
  const value = `color-mix(in srgb, ${Array(2000).fill('red').join(', ')})`;
  const start = performance.now();
  assert.equal(
    mixColor(value, () => 'rgb(0, 0, 0)', 31),
    'color(srgb 1 0 0)',
  );
  assert.ok(performance.now() - start < 200);
});

// caret-color and outline-color: auto (declared or initial) is
// currentcolor, inherited as the keyword: inherit gives the element's own
// color, not its parent's.
parity(
  'jsdom 31: caret-color and outline-color auto inherited as currentcolor',
  (w) => {
    const d = w.document;
    return ['', 'outline-color: auto; caret-color: auto', 'outline-color: green; caret-color: green'].map(
      (parentStyle) => {
        const parent = d.body.appendChild(d.createElement('section'));
        parent.setAttribute('style', `color: blue; ${parentStyle}`);
        const el = parent.appendChild(d.createElement('div'));
        el.style.cssText = 'color: red; outline-color: inherit; caret-color: inherit';
        const plain = parent.appendChild(d.createElement('div'));
        plain.style.color = 'red';
        return [
          parentStyle,
          ...read(w, el, ['outline-color', 'caret-color']),
          ...read(w, plain, ['outline-color', 'caret-color']),
        ];
      },
    );
  },
  { jsdom: 31 },
);
