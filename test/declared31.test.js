// jsdom 31's declared values (declared31.js, calc31.js), checked against
// jsdom 31.0.1: each component in canonical form as the grammar reads it,
// per-property component order and defaults, math functions simplified.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parity } from './parity.js';
import { createWindow } from '../src/node.js';
import { canonical31 } from '../src/declared31.js';

// Each 'property: value' set through setProperty, then read back, and the
// block's cssText.
const declared = (lines) => (w) => {
  const e = w.document.createElement('div');
  return lines.map((line) => {
    const i = line.indexOf(':');
    const name = line.slice(0, i).trim();
    e.removeAttribute('style');
    e.style.setProperty(name, line.slice(i + 1).trim());
    return [line, e.style.getPropertyValue(name), e.style.cssText];
  });
};

parity(
  'jsdom 31: numbers, units and zeros in declared values',
  declared([
    'opacity: .5',
    'opacity: 123456.7',
    'opacity: 1234567',
    'opacity: 0.00001234567',
    'opacity: 1e21',
    'width: .5PX',
    'width: 1E3Px',
    'width: 10Q',
    'width: 1.123456789px',
    'width: 99999999999px',
    'transform: translateX(0)',
    'transform: TRANSLATEX(0)',
    'transform: rotate(0)',
    'transform: rotate(90DEG)',
    'transform: matrix(1,0,0,1,0,0)',
    'transform: translate(1px , 2px) scale(.5)',
    'transform-origin: 50% 50% 0',
    'filter: blur(0) brightness(.5)',
    'transition-timing-function: cubic-bezier(.25,.1,.25,1)',
    'stroke-dasharray: 0.0, 1px, 0e0, 2',
    'border-image-width: 0',
    'flex: 0 0',
    'flex: 1 0.0 0',
    'line-height: 0',
    'grid-template-columns: repeat(2,1fr)',
  ]),
  { jsdom: 31 },
);

parity(
  'jsdom 31: keywords, names, strings and url() in declared values',
  declared([
    'animation-name: F\\4FO',
    'animation-name: NONE',
    'list-style-type: Hebrew',
    'list-style-type: Disclosure-Open',
    'list-style-type: Foo',
    'counter-reset: NONE',
    "content: 'a\"b'",
    'content: "ab\\"',
    'content: "a\nb"',
    'content: "tab\tx"',
    'cursor: url(a.png) 2 3, auto',
    'background-image: url( "a.png" ), URL(b.png)',
  ]),
  { jsdom: 31 },
);

parity(
  'jsdom 31: family names as identifiers where they can be',
  declared([
    'font-family: "Helvetica Neue", Arial',
    'font-family: "serif"',
    'font-family: "emoji"',
    'font-family: "a1b"',
    'font-family: "1a"',
    'font-family: "a,b"',
    'font-family: "inherit"',
    'font-family: "-a", "--a"',
    'font-family: "a  b"',
    'font-family: A   B',
    'font-family: "x serif", "serif x"',
    'font-family: serif x',
    'font-family: fangsong x',
    'font-family: Foo\\,Bar',
    'font-family: a\\31 b c',
    'font: 12px/1.5 "Helvetica Neue"',
    'font: 12px A, B, A',
    'font: 12px SERIF',
  ]),
  { jsdom: 31 },
);

parity(
  'jsdom 31: shadows, transitions, animations and background sizes',
  declared([
    'box-shadow: 0 0 2px #000',
    'box-shadow: inset 1px 1px',
    'box-shadow: 1px 1px 0 0 currentcolor inset, red 0 0',
    'box-shadow: 1px 1px 0 2px red',
    'box-shadow: NONE',
    'text-shadow: 1px 1px 0 red',
    'text-shadow: 1px 1px 2px CurrentColor',
    'filter: drop-shadow(0 0 2px red)',
    'transition: all 0s ease 0s',
    'transition: opacity 0s 1s',
    'transition: all 1s',
    'transition: 1s 2s linear opacity',
    'transition: opacity 1s normal, color 2s allow-discrete',
    'transition: ease',
    'transition: opacity calc(1s + 1s) calc(0s)',
    'animation: spin calc(2s)',
    'animation: spin 1s infinite linear',
    'animation: spin 0s ease 0s 1 normal none running',
    'animation: Ease',
    'animation: spin 1s 2s',
    'background-size: 01px, auto auto',
    'background-size: 1px 1px',
  ]),
  { jsdom: 31 },
);

parity(
  'jsdom 31: positions, transforms, counters, grid lines, clip and ratios',
  declared([
    'translate: 1px 0 0',
    'translate: 0 1px 0',
    'translate: 0 0 1px',
    'scale: 2 2 1',
    'scale: 50% 50%',
    'scale: 1 2',
    'transform-origin: top left',
    'transform-origin: center right',
    'transform-origin: bottom right 5px',
    'object-position: top',
    'object-position: 10px',
    'object-position: top left',
    'counter-reset: a 2 b',
    'counter-increment: a b 2',
    'counter-set: reversed(a)',
    'grid-area: a 3',
    'grid-area: a / b / a',
    'grid-area: a / a / a / a',
    'grid-column: auto / auto',
    'grid-row: 1 / auto',
    'clip: rect(0 0 0 0)',
    'clip: RECT(1PX 2px 3px 4px)',
    'clip: rect(0,0,0,0)',
    'clip: rect(1px 2px 3px)',
    'clip: rect(0 min(1px, 2px) 0 0)',
    'clip: rect(0 calc(foo) 0 0)',
    'aspect-ratio: 2 auto',
    'aspect-ratio: 16/9 auto',
  ]),
  { jsdom: 31 },
);

parity(
  'jsdom 31: math functions simplified',
  declared([
    'width: calc(1in + 1px)',
    'width: calc(1cm)',
    'width: calc(1px + 1em + 1px)',
    'width: calc(-1px + 1em)',
    'width: calc((100% - 10px) / 2)',
    'width: calc(100% / 3 - 10px)',
    'width: calc(2 * (1px + 1em))',
    'width: calc(1px - 1px)',
    'width: calc(calc(1px) + calc(2px + 1em))',
    'width: calc(1vw + 1vh + 1px + 1rem + 1ex + 1ch)',
    'width: CALC(1PX + 2PX)',
    'width: min(10px, 5px, 1em)',
    'width: min(1em, 10px, 2em, 5px)',
    'width: min(10%, 5%)',
    'width: max(1em + 2px, 5px)',
    'width: clamp(1px, 2px, 3px)',
    'width: clamp(1px, 2em, 3px)',
    'width: calc(min(1px, 2px) + 1em)',
    'width: round(1.5px, 1px)',
    'width: abs(-1px)',
    'width: calc(sign(1px) * 1px)',
    'width: calc(e * 1px)',
    'width: calc(1px / 0)',
    'width: calc(var(--a) + 1px)',
    'width: calc(0)',
    'width: calc(1px +2px)',
    'opacity: calc(1 / 2)',
    'z-index: calc(1 + 2)',
    'line-height: calc(1 + 0.5)',
    'line-height: calc(1em + 1lh)',
    'line-height: calc(1px + 1)',
    'rotate: calc(90deg + 1turn)',
    'transition-duration: calc(1s + 500ms)',
    'margin: calc(1px + 1px) 0',
    'transform: translate(min(1px,5%),2px)',
    'background-image: linear-gradient(red calc(10% + 5%), blue)',
  ]),
  { jsdom: 31 },
);

// A long family list and a long comma list trace in linear time.
test('jsdom 31: long lists trace in linear time', () => {
  const w = createWindow({ jsdom: '31.0.1' });
  const e = w.document.createElement('div');
  const families = Array.from({ length: 2000 }, (_, i) => `a${i} b`).join(', ');
  const start = performance.now();
  e.style.setProperty('font-family', families);
  e.style.setProperty('transition', Array(2000).fill('opacity 1s').join(', '));
  assert.equal(e.style.getPropertyValue('font-family'), families);
  assert.ok(performance.now() - start < 2000);
});

// #325 review: math functions in scale, counters and an iteration count,
// min(), max() and clamp() of two types, number functions' argument
// counts, a keyword of another part as the name or the property, clip's
// CSS-wide keywords, backslashes in a family name.
parity(
  'jsdom 31: review cases of declared values',
  declared([
    'scale: calc(2)',
    'scale: calc(50%) 2',
    'animation: spin 1s calc(2)',
    'animation: calc(2) 1s spin',
    'animation: 1s ease ease',
    'transition: 1s ease ease',
    'transition: linear 1s ease-in',
    'width: min(1px, 1s)',
    'width: calc(min(1px, 1em) + 1s)',
    'width: min(10%, 1px)',
    'width: calc(10px / 2px * 1px)',
    'width: calc(1px * 1px / 1px)',
    'z-index: calc(4px / 2px)',
    'line-height: calc(2em / 1em)',
    'width: calc(1px * 1px)',
    'rotate: calc(1turn / 1deg * 1deg)',
    'width: calc(1px + 2px',
    'rotate: calc(10% + 1deg)',
    'transition-duration: calc(10% + 1s)',
    'transform: rotate(calc(10% + 1deg))',
    'opacity: calc(10% + 1)',
    'width: min(10%, 1px)',
    'width: min(10%, 1deg)',
    'clip: rect(calc(10%) 2px 3px 4px)',
    'clip: rect(1deg 2px 3px 4px)',
    'clip: rect(calc(1px + 1em) 2px 3px 4px)',
    'width: calc(1foo)',
    'width: calc(1foo + 1px)',
    'width: min(NaN * 1px, 1px)',
    'width: max(1px, NaN * 1px)',
    'width: min(1px, NaN * 1px, 2px)',
    'clip: rect(calc(1px + var(--a)) 2px 3px 4px)',
    'clip: rect(env(x) 2px 3px 4px)',
    'opacity: sqrt(4, 9)',
    'opacity: pow(2)',
    'opacity: sqrt(4)',
    'clip: inherit',
    'clip: INITIAL',
    'clip: var(--c)',
    'width: clamp(1px, 1s, 2px)',
    'width: calc(clamp(1px, 1em, 2px) + 1s)',
    'width: clamp(1em, 2em, 3em)',
    'transition: 1s normal normal',
    'transition: 1s allow-discrete allow-discrete',
    'transition: 1s ease',
    'counter-reset: a calc(2)',
    'counter-increment: a calc(2) b',
    'animation: 1s infinite infinite',
    'animation: 1s 1 infinite',
    'animation: 1s normal normal',
    'animation: 1s running running',
    'animation: 1s none none',
    'animation: spin auto',
    'animation: auto 1s spin',
    'animation: auto',
    'animation: auto auto',
    'animation: spin 1s auto',
    'animation: 1s none forwards',
    'animation: 1s forwards none',
    'font-family: "a\\\\b c"',
    'content: "a\\\\b"',
  ]),
  { jsdom: 31 },
);

// A value that fails a numeric bound does not decide how a value of its
// shape is read (#325 review).
parity(
  'jsdom 31: a value out of range, then one of its shape',
  (w) => {
    const e = w.document.createElement('div');
    e.style.setProperty('font-weight', '1001.1');
    e.style.setProperty('font-weight', '123.4567');
    const first = e.style.fontWeight;
    e.style.setProperty('font-weight', '999.9999');
    e.style.setProperty('font-weight', '500');
    e.style.setProperty('font-weight', '1000.0001');
    return [first, e.style.fontWeight];
  },
  { jsdom: 31 },
);

// An escaped CR LF in a string is one line continuation; a raw line break
// makes a bad string (CSS Syntax 3; #325 review). setProperty reads CR LF
// as LF before this, so the module is checked directly.
test('jsdom 31: an escaped CR LF in a string', () => {
  assert.equal(canonical31('content', '"a\\\r\nb"'), '"ab"');
  assert.equal(canonical31('content', '"a\\\nb"'), '"ab"');
  assert.equal(canonical31('content', '"a\r\nb"'), null);
});

// A clip that does not read leaves the one before it; the end closes
// rect() (#325 review).
parity(
  'jsdom 31: malformed clip after a valid one',
  (w) =>
    [
      'clip: rect(1px 2px 3px 4px); clip: rect(1px',
      'clip: auto; clip: rect(1px, 2px, 3px, 4px',
      'clip: auto; clip: rect(1px 2px 3px 4px))',
      'clip: auto; clip: "x',
      'clip: auto; clip: rect(1px 2px 3px [)',
    ].map((text) => {
      const e = w.document.createElement('div');
      e.setAttribute('style', text);
      return e.style.cssText;
    }),
  { jsdom: 31 },
);

// Part B2: gradients, color functions, color-scheme and the background
// shorthand's boxes and sizes, as jsdom 31 declares them.
parity(
  'jsdom 31: gradients without their initial values, in canonical order',
  declared([
    'background-image: linear-gradient(to bottom, red, blue)',
    'background-image: linear-gradient(to bottom right, red, blue)',
    'background-image: linear-gradient(in oklab to right, red, blue)',
    'background-image: linear-gradient(in srgb to right, red, blue)',
    'background-image: linear-gradient(in oklch shorter hue, red, blue)',
    'background-image: linear-gradient(in hsl longer hue, red, blue)',
    'background-image: LINEAR-GRADIENT(TO RIGHT, RED, Blue)',
    'background-image: linear-gradient(red 10% 20%, blue 30% 40%)',
    'background-image: linear-gradient(red 0 20%, blue)',
    'background-image: radial-gradient(farthest-corner ellipse at center center, red, blue)',
    'background-image: radial-gradient(circle farthest-corner, red, blue)',
    'background-image: radial-gradient(circle 10px, red, blue)',
    'background-image: radial-gradient(farthest-side circle, red, blue)',
    'background-image: radial-gradient(ellipse 10px 20px, red, blue)',
    'background-image: radial-gradient(at top, red, blue)',
    'background-image: radial-gradient(at 10px, red, blue)',
    'background-image: radial-gradient(at 50% 50%, red, blue)',
    'background-image: radial-gradient(circle at top in oklab, red, blue)',
    'background-image: conic-gradient(from 0deg at center center, red, blue)',
    'background-image: conic-gradient(from 0turn, red, blue)',
    'background-image: conic-gradient(at top left, red, blue)',
    'background-image: conic-gradient(red 0deg 90deg, blue)',
    'background-image: radial-gradient(in srgb circle, red, blue)',
    'background-image: linear-gradient(in oklab 90deg, red, blue)',
    'background-image: radial-gradient(in oklab circle at top, red, blue)',
    'background-image: radial-gradient(in hsl longer hue circle, red, blue)',
    'background-image: radial-gradient(at top 10px left 20px, red, blue)',
    'background-image: conic-gradient(at bottom 5% right 10px, red, blue)',
    'object-position: top 10px left 20px',
    'background: linear-gradient(to bottom right, red, blue) no-repeat',
  ]),
  { jsdom: 31 },
);

parity(
  'jsdom 31: declared color functions and color-scheme',
  declared([
    'color: color-mix(in srgb, blue 25%, red)',
    'color: color-mix(in srgb, blue 50%, red 50%)',
    'color: color-mix(in oklab, blue, red)',
    'color: color-mix(in hsl shorter hue, blue, red)',
    'color: color-mix(IN SRGB, BLUE, #f00)',
    'color: color-mix(in srgb, rgba(0,0,255,.5), red)',
    'color: color-mix(in srgb, blue 10%, red 20%, green)',
    'color: color-mix(in xyz, blue, red)',
    'color: color-mix(in srgb, blue calc(25%), red)',
    'color: lab(50% 20 30 / 50%)',
    'color: lab(150 20 30)',
    'color: lch(50% 100% 120)',
    'color: lch(50 30 -90)',
    'color: lch(50 30 1rad)',
    'color: oklab(50% 100% -100%)',
    'color: oklch(50% 0.1 120deg / .5)',
    'color: color(srgb 100% 0% 0% / 1)',
    'color: color(SRGB 1 0 0)',
    'color: color(xyz 0.5 0.5 0.5)',
    'color: rgb(255 none 0 / 0.5)',
    'color: light-dark(RED, #00f)',
    'color: contrast-color(RED)',
    'color: rgb(from red r g b)',
    'color: device-cmyk(0 0 0 1)',
    'border-color: color-mix(in srgb, red, blue) lab(50% 1 1)',
    'color: light-dark(device-cmyk(0 0 0 1), red)',
    'color: color-mix(in srgb, device-cmyk(0 0 0 1), red)',
    'color: color-mix(in srgb, red 80%, blue 80%, green)',
    'color: color-mix(in srgb, red -10%, blue)',
    'color: color-mix(in srgb, red 150%, blue)',
    'color: color-mix(in srgb, red 80%, blue 80%)',
    'color: color-mix(in srgb, red 60%, blue 60%, green 60%)',
    'color: color-mix(in srgb, red 30%, blue 30%)',
    'color: rgb(255 0 0 / none)',
    'color: rgb(300 -20 0 / none)',
    'color: rgb(120% -5% 0% / none)',
    'color: color-mix(in srgb, red abs(-25%), blue)',
    'color: color-mix(in srgb, red round(25.4%, 1%), blue)',
    'background: linear-gradient(color-mix(in srgb, red 80%, blue 80%, green), black) repeat',
    'color: hsl(0 100% 50% / none)',
    'color-scheme: only light dark',
    'color-scheme: only dark',
  ]),
  { jsdom: 31 },
);

parity(
  'jsdom 31: the background shorthand: boxes, sizes and initial values',
  (w) =>
    [
      'background: REPEAT',
      'background: SCROLL',
      'background: url(a.png) text',
      'background: text border-box',
      'background: text padding-box',
      'background: url(a.png) border-area',
      'background: url(a.png) text, url(b.png)',
      'background: url(a.png) 0 0 / 20px no-repeat, red',
      'background: url(a.png) 0 0 / calc(10px + 1em)',
      'background: url(a.png); background-origin: padding-box; background-clip: padding-box',
      'background: url(a.png); background-origin: border-box; background-clip: text',
    ].map((text) => {
      const e = w.document.createElement('div');
      e.setAttribute('style', text);
      return [text, e.style.cssText, e.style.backgroundOrigin, e.style.backgroundClip, e.style.backgroundSize];
    }),
  { jsdom: 31 },
);

// The negative remainder color-mix() writes is invalid when read again,
// as in jsdom 31, but the style object computes from what it holds (#326
// review).
parity(
  'jsdom 31: a color-mix() remainder read again, and computed',
  (w) => {
    const e = w.document.body.appendChild(w.document.createElement('div'));
    const out = [];
    for (const mix of [
      'color-mix(in srgb, red 80%, blue 80%, green)',
      'color-mix(in srgb, red 80%, blue 90%, green, white, black)',
      'color-mix(in srgb, red 10%, blue, green, white)',
    ]) {
      e.removeAttribute('style');
      e.style.backgroundColor = mix;
      out.push(e.style.cssText, w.getComputedStyle(e).backgroundColor);
      e.style.cssText = e.style.cssText;
      out.push(e.style.cssText, w.getComputedStyle(e).backgroundColor);
    }
    return out;
  },
  { jsdom: 31 },
);
