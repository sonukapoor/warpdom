// jsdom 31's computed values (black box, 31.0.1; #269 part F3c): every
// length absolute (px), angle in deg and time in s, in any value; a math
// function that resolves to one value unwrapped.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createWindow } from '../src/node.js';
import { parity } from './parity.js';

const DECLARATIONS = [
  'rotate: 1turn',
  'rotate: 0.5rad',
  'rotate: 100grad',
  'rotate: x 1turn',
  'rotate: 1 0 0 1turn',
  'rotate: 45deg',
  'rotate: calc(1turn / 2)',
  'transform: rotate(1rad)',
  'transform: skew(10grad, 0.1turn)',
  'transform: rotate3d(1, 0, 0, 1turn)',
  'transform: rotateX(1turn) translateY(1em)',
  'transform: perspective(1em)',
  'transform: translate(10%, 1em)',
  'transform: translate3d(1em, 2rem, 3px)',
  'transform: translateX(calc(1em + 10%))',
  'transform: scale(1.5) translateZ(1vw)',
  'transform: matrix(1, 0, 0, 1, 0, 0)',
  'translate: 1em 10% 2rem',
  'translate: calc(1em + 2px)',
  'filter: hue-rotate(1rad)',
  'filter: drop-shadow(1em 1em 1em red)',
  'filter: blur(1em)',
  'background-image: linear-gradient(0.5turn, red, blue)',
  'background-image: conic-gradient(from 1turn, red, blue)',
  'background-image: url("a1em.png")',
  'font-style: oblique 10grad',
  'image-orientation: 1turn',
  'offset-rotate: auto 1turn',
  'offset-path: ray(1turn)',
  'transition-duration: 100ms',
  'transition-duration: 0.0001ms',
  'transition-delay: -100ms, 1.5s',
  'transition: color 100ms 200ms',
  'animation: x 100ms',
  'animation-delay: 1234567ms',
  'animation-duration: calc(100ms + 1s)',
  'box-shadow: 1em 1em red',
  'text-shadow: 1em 1em red',
  'grid-template-columns: 1em 2em',
  'grid-template-columns: repeat(2, 1em)',
  'transform-origin: 1em 2em',
  'background-size: 1em 2em',
  'background-size: calc(1em + 1px)',
  'border-spacing: 1em 2em',
  'border-top-left-radius: 1em 2em',
  'border-image-width: 1em 2em',
  'stroke-dasharray: 1em 2em',
  'line-height: 1em',
  'font-size: 2em',
  'width: calc(1em + 2px)',
  'content: "1em"',
  '--x: 1em 1turn 100ms',
  // (#349 review: names with escapes as written; math functions
  // simplified after their lengths are px; image-set read by token; jsdom
  // 31 reads +( as an operator with whitespace before it)
  'animation-name: \\31 1em',
  'animation-name: a\\+1turn',
  'animation-name: a\\ 1em',
  'transform: translateX(1em)',
  'width: calc(10% + 1em + 2px)',
  'width: calc(10% - 1em - 20px)',
  'margin-left: calc(1em + 10% + 1px)',
  'width: round(1em, 1px)',
  'margin-left: round(1em, 3px)',
  'width: mod(25px, 1em)',
  'transform: translateX(round(1em, 1px))',
  'filter: drop-shadow(round(1em, 1px) 2px 3px)',
  'filter: drop-shadow(calc(1em + 1px) 2px)',
  'background-image: image-set(url("a, ") 1x, "b.png" 2x)',
  'background-image: image-set("a, \\" " 1x, "b.png" 2x)',
  'width: calc(1px +(2px))',
  'width: calc(1px + (2px))',
  'background-image: image-set("a.png" calc(1x))',
  'background-image: image-set("a.png" calc(2x + 96dpi))',
  'transform: rotate(abs(-10deg)) translateX(1em)',
  'width: min(1em)',
];

parity(
  "jsdom 31's computed lengths, angles and times",
  (w) => {
    const d = w.document;
    d.documentElement.style.fontSize = '20px';
    const parent = d.createElement('div');
    parent.style.fontSize = '10px';
    d.body.append(parent);
    return DECLARATIONS.map((declaration) => {
      const at = declaration.indexOf(':');
      const name = declaration.slice(0, at);
      const el = d.createElement('div');
      parent.append(el);
      el.style.setProperty(name, declaration.slice(at + 1).trim());
      return `${declaration} => ${w.getComputedStyle(el).getPropertyValue(name)}`;
    });
  },
  { jsdom: 31 },
);

parity(
  "jsdom 31's math functions: + and - need whitespace before them too",
  (w) => {
    const el = w.document.createElement('div');
    return [
      ['width', 'calc(2px+ 1px)'],
      ['width', 'calc(2px +1px)'],
      ['width', 'calc(2px - 1px)'],
      ['width', 'calc(2px- 1px)'],
      ['width', 'calc(2px*2)'],
      ['width', 'calc( 2px + 1px )'],
      ['width', 'calc(2px\t+\n1px)'],
      ['transform', 'translate(calc(1px+ 2px))'],
    ].map(([name, value]) => {
      el.removeAttribute('style');
      el.style.setProperty(name, value);
      return el.style.getPropertyValue(name);
    });
  },
  { jsdom: 31 },
);

const SPECIFIED = [
  'filter: drop-shadow(1px 1px red) drop-shadow(2px 2px 3px currentcolor)',
  'filter: drop-shadow(1px 1px)',
  'filter: drop-shadow(currentcolor 1px 1px 0px)',
  'background-image: image-set("a.png" 1x, "b.png" 2x)',
  'background-image: image-set(url(a.png) 1x)',
  'background-image: image-set("a.png" 96dpi, "b.png" 2dppx, "c.png" 1dpcm)',
  'background-image: image-set("a.png" type("image/png"))',
  'image-orientation: 1turn',
  'image-orientation: 90deg flip',
  'image-orientation: from-image',
];
parity(
  "jsdom 31's drop-shadow(), image-set() and image-orientation, specified and computed",
  (w) => {
    const d = w.document;
    return SPECIFIED.map((declaration) => {
      const at = declaration.indexOf(':');
      const name = declaration.slice(0, at);
      const el = d.createElement('div');
      d.body.append(el);
      el.style.setProperty(name, declaration.slice(at + 1).trim());
      return [el.style.getPropertyValue(name), w.getComputedStyle(el).getPropertyValue(name)];
    });
  },
  { jsdom: 31 },
);

parity(
  "jsdom 31's line widths in whole px, and positions as percentages",
  (w) => {
    const d = w.document;
    return [
      'outline-width: 10.24px',
      'outline-width: 10.9px',
      'outline-width: 0.5px',
      'outline-width: 0px',
      'outline-width: calc(1px + 0.7px)',
      'column-rule-width: 2.6px',
      'outline: 1vw solid red',
      'border-top-width: 10.24px',
      'perspective-origin: 1em',
      'perspective-origin: left',
      'perspective-origin: right bottom',
      'perspective-origin: 10% 1em',
      'object-position: left top',
      'object-position: right 10px bottom 20px',
      'object-position: 1em',
    ].map((declaration) => {
      const at = declaration.indexOf(':');
      const name = declaration.slice(0, at);
      const el = d.createElement('div');
      d.body.append(el);
      el.style.setProperty(name, declaration.slice(at + 1).trim());
      return [el.style.getPropertyValue(name), w.getComputedStyle(el).getPropertyValue(name)];
    });
  },
  { jsdom: 31 },
);

parity(
  "jsdom 31 keeps a custom property's value as written: CR, CR LF, FF and NUL too",
  (w) => {
    const d = w.document;
    const out = [];
    for (const value of ['a\r\nb', 'a\rb', 'a\fb', 'a\u0000b', '"a\\\r\nb"']) {
      const el = d.createElement('div');
      el.style.setProperty('--x', value);
      out.push(el.style.getPropertyValue('--x'));
      el.removeAttribute('style');
      el.style.cssText = `--y: ${value}; color: red`;
      out.push(el.style.getPropertyValue('--y'), el.style.color);
      el.setAttribute('style', `--z: ${value}`);
      out.push(el.style.getPropertyValue('--z'));
      const style = d.createElement('style');
      style.textContent = `p { --s: ${value}; font-family: a,\r\nb }`;
      d.head.append(style);
      out.push(style.sheet.cssRules[0].cssText);
      style.remove();
    }
    return out.map((v) => JSON.stringify(v));
  },
  { jsdom: 31 },
);

parity(
  "jsdom 31's url() resolution reads a quoted URL whole",
  (w) => {
    const el = w.document.createElement('div');
    w.document.body.append(el);
    el.style.backgroundImage = 'url("a(b).png"), url(\'c d.png\'), url(e.png)';
    return w.getComputedStyle(el).backgroundImage;
  },
  { jsdom: 31 },
);

parity(
  "jsdom 31 (#349 review): drop-shadow's currentcolor is the element's, only real drop-shadow()s, names kept, escapes in url() decoded",
  (w) => {
    const d = w.document;
    const parent = d.createElement('div');
    parent.style.color = 'blue';
    d.body.append(parent);
    return [
      ['filter', 'color: red; filter: drop-shadow(1px 1px)'],
      ['filter', 'color: red; filter: drop-shadow(currentcolor 1px 1px)'],
      ['filter', 'color: red; filter: drop-shadow(color-mix(in srgb, currentcolor, blue) 1px 1px)'],
      ['filter', 'filter: url("#drop-shadow(red)") drop-shadow(1px 1px red)'],
      ['filter', 'filter: drop-shadow(color-mix(in srgb, rgb(255, 0, 0), blue) 1px 1px)'],
      ['animation-name', 'animation-name: é1turn'],
      ['font-family', 'font-family: é1em'],
      ['background-image', 'background-image: url("a\\1f b.png")'],
      ['background-image', 'background-image: url("a\\"b.png")'],
    ].map(([name, text]) => {
      const el = d.createElement('div');
      parent.append(el);
      el.setAttribute('style', text);
      return w.getComputedStyle(el).getPropertyValue(name);
    });
  },
  { jsdom: 31 },
);

parity(
  "jsdom 31 keeps a custom property's CR where its value ends with a backslash (#349 review)",
  (w) => {
    const d = w.document;
    const out = [];
    for (const value of ['a\rb\\', 'a\r\nb\\', 'a\fb(\\']) {
      const el = d.createElement('div');
      el.setAttribute('style', `--x: ${value}`);
      out.push(el.style.getPropertyValue('--x'));
      el.style.cssText = `--y: ${value}`;
      out.push(el.style.getPropertyValue('--y'));
      el.style.setProperty('--z', value);
      out.push(el.style.getPropertyValue('--z'));
    }
    return out.map((v) => JSON.stringify(v));
  },
  { jsdom: 31 },
);

parity(
  "jsdom 31 reads a custom property's value as a sheet does, through setProperty too, and keeps it as written (#349 review)",
  (w) => {
    const d = w.document;
    const out = [];
    for (const value of ['"a\u0000b\\', '"a\rb\\', '"a\\\r\nb\\', 'url(a\u0000b)', '"a\rb"', '"a\fb', 'a\u0000b\\']) {
      const el = d.createElement('div');
      el.style.setProperty('--x', value);
      const set = el.style.getPropertyValue('--x');
      el.style.cssText = `--x: ${value}`;
      const text = el.style.getPropertyValue('--x');
      el.setAttribute('style', `--x: ${value}`);
      out.push(JSON.stringify([set, text, el.style.getPropertyValue('--x')]));
    }
    return out;
  },
  { jsdom: 31 },
);

// (not a parity case: jsdom 31 also declares cos(0deg) as calc(1), which
// this does not yet; #349 review)
test('jsdom 31: only calc(), min(), max() and clamp() of one value are that value when computed', () => {
  const w = createWindow({ jsdom: '31.0.1' });
  const el = w.document.createElement('div');
  w.document.body.append(el);
  el.style.transform = 'scale(cos(0deg))';
  el.style.rotate = 'calc(1turn)';
  const computed = w.getComputedStyle(el);
  assert.notEqual(computed.transform, 'scale(0deg)');
  assert.equal(computed.rotate, '360deg');
});
