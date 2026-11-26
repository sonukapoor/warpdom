// jsdom 31's computed values (black box, 31.0.1; #269 part F3c): every
// length absolute (px), angle in deg and time in s, in any value; a math
// function that resolves to one value unwrapped.
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
