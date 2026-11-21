// jsdom 31's colors inside values (cascade.js colorValue31's light-dark(),
// componentsValue31, textShadow31, gradientColors31), checked against
// jsdom 31.0.1 in a light and a dark color-scheme.
import { parity } from './parity.js';

const run = (cases) => (w) => {
  const d = w.document;
  d.body.innerHTML = '<div id="x" style="color: rgb(1, 2, 3); font-size: 20px"><p id="p"></p></div>';
  const p = d.getElementById('p');
  const x = d.getElementById('x');
  return cases.map(([name, value, read = name]) => {
    p.setAttribute('style', `${name}: ${value}`);
    x.style.colorScheme = '';
    const light = w.getComputedStyle(p).getPropertyValue(read);
    x.style.colorScheme = 'dark';
    return [`${name}: ${value}`, light, w.getComputedStyle(p).getPropertyValue(read)];
  });
};

parity(
  'jsdom 31: light-dark() in color properties, by the element color-scheme',
  run([
    ['color', 'light-dark(red, blue)'],
    ['background-color', 'light-dark(red, blue)'],
    ['border-top-color', 'light-dark(red, currentcolor)'],
    ['outline-color', 'light-dark(red, blue)'],
    ['caret-color', 'light-dark(red, blue)'],
    ['accent-color', 'light-dark(red, blue)'],
    ['accent-color', 'light-dark(red, currentcolor)'],
    ['text-decoration-color', 'light-dark(red, blue)'],
    ['column-rule-color', 'light-dark(red, blue)'],
    ['fill', 'light-dark(red, blue)'],
    ['fill', 'light-dark(red, currentcolor)'],
    ['color', 'light-dark(red, currentcolor)'],
    ['color', 'light-dark(currentcolor, red)'],
    ['color', 'LIGHT-DARK(red, blue)'],
    ['color', 'light-dark(ButtonText, red)'],
    ['color', 'light-dark(color-mix(in srgb, red, blue), red)'],
    ['background-color', 'light-dark(light-dark(red, green), blue)'],
    ['background-color', 'light-dark(red, var(--z, blue))'],
    ['border', '1px solid light-dark(red, blue)', 'border-top-color'],
    ['outline', 'light-dark(red, blue) solid 2px', 'outline-color'],
    ['background', 'light-dark(red, blue) url(a.png)', 'background-color'],
  ]),
  { jsdom: 31 },
);

parity(
  'jsdom 31: text-shadow computes each shadow as its color, then its lengths in px',
  run([
    ['text-shadow', '1px 1px red'],
    ['text-shadow', 'red 1px 1px 2px, 2px 2px blue'],
    ['text-shadow', '1px 1px hsl(120 50% 50%)'],
    ['text-shadow', '1px 1px light-dark(red, blue)'],
    ['text-shadow', '1px 1px color-mix(in srgb, red, blue)'],
    ['text-shadow', '1px 1px transparent'],
    ['text-shadow', '1em 2px 3px red'],
    ['text-shadow', '1px 1px currentcolor'],
    ['text-shadow', 'currentcolor 1px 1px, red 2px 2px'],
    ['text-shadow', '1px 1px'],
    ['text-shadow', '1em 1rem 0 red'],
    ['text-shadow', '1px 1px 0px red'],
    ['text-shadow', 'calc(1px + 1em) 1px red'],
    ['text-shadow', '1px 1px RED'],
    ['text-shadow', '1px 1px light-dark(red, currentcolor)'],
    ['text-shadow', '1px 1px ButtonText'],
    ['text-shadow', '1px 1px color-mix(in srgb, currentcolor, red)'],
    ['text-shadow', '1px 1px #f00f'],
    ['text-shadow', '0 0 red'],
    ['text-shadow', '-1px .5px red'],
    ['text-shadow', '1px 1px 2px var(--c, red)'],
    ['text-shadow', '1px 1px 2px currentcolor'],
    ['text-shadow', 'none'],
    ['text-shadow', 'inherit'],
  ]),
  { jsdom: 31 },
);

parity(
  'jsdom 31: scrollbar-color, fill and stroke compute every color',
  run([
    ['scrollbar-color', 'red blue'],
    ['scrollbar-color', 'currentcolor blue'],
    ['scrollbar-color', 'light-dark(red, blue) #0f0'],
    ['scrollbar-color', 'RED blue'],
    ['scrollbar-color', 'red currentcolor'],
    ['scrollbar-color', 'color-mix(in srgb, red, blue) transparent'],
    ['scrollbar-color', 'ButtonText red'],
    ['scrollbar-color', 'auto'],
    ['fill', 'url("#x") red'],
    ['stroke', 'url(#x) blue'],
    ['fill', 'url(#x)'],
    ['fill', 'url(#x) none'],
    ['fill', 'url(#x) currentcolor'],
    ['fill', 'url(#x) light-dark(red, blue)'],
    ['fill', 'url(#x) color-mix(in srgb, red, blue)'],
    ['fill', 'url(#x) ButtonText'],
    ['stroke', 'url("http://e.example/a.svg#x") hsl(0 100% 50% / .5)'],
  ]),
  { jsdom: 31 },
);

parity(
  "jsdom 31: a gradient's colors are computed, in any image property",
  run([
    ['background-image', 'linear-gradient(red, blue)'],
    ['background-image', 'linear-gradient(to right, hsl(0 100% 50%), currentcolor 50%, transparent)'],
    ['background-image', 'radial-gradient(circle, red 10%, #00f8)'],
    ['background-image', 'linear-gradient(light-dark(red, blue), green)'],
    ['background-image', 'repeating-linear-gradient(45deg, red 0 10px, blue 10px 20px)'],
    ['background-image', 'conic-gradient(from 90deg, red, color-mix(in srgb, red, blue))'],
    ['background-image', 'url("http://e.example/a.png"), linear-gradient(red, blue)'],
    ['mask-image', 'linear-gradient(red, blue)'],
    ['border-image-source', 'linear-gradient(red, blue)'],
    ['list-style-image', 'linear-gradient(red, blue)'],
    ['background-image', 'linear-gradient(red 10%, 20%, blue)'],
    ['background-image', 'linear-gradient(in oklab, red, blue)'],
    ['background-image', 'linear-gradient(red, ButtonText)'],
    ['background-image', 'linear-gradient(RED, Blue)'],
    ['background-image', 'radial-gradient(red, color-mix(in srgb, currentcolor, blue))'],
    ['background-image', 'Linear-Gradient(red, blue)'],
    ['background-image', 'linear-gradient(to right, light-dark(red, currentcolor), blue)'],
    ['background-image', 'url("http://e.example/gradient(red).png"), linear-gradient(red, blue)'],
    ['background', 'linear-gradient(red, blue)', 'background-image'],
  ]),
  { jsdom: 31 },
);

parity(
  'jsdom 31: light-dark() picking a color it does not compute, or a mix of currentcolor',
  run([
    ['color', 'light-dark(color(srgb 1 0 0), blue)'],
    ['color', 'light-dark(lab(50% 20 30), blue)'],
    ['color', 'light-dark(oklch(0.5 0.1 120), blue)'],
    ['background-color', 'light-dark(color(display-p3 1 0 0), red)'],
    ['fill', 'light-dark(color-mix(in srgb, currentcolor, red), blue)'],
    ['fill', 'light-dark(blue, color-mix(in srgb, currentcolor, red))'],
    ['accent-color', 'light-dark(color-mix(in srgb, currentcolor, red), blue)'],
    ['color', 'light-dark(color-mix(in srgb, currentcolor, red), blue)'],
    ['fill', 'light-dark(light-dark(red, currentcolor), blue)'],
    ['text-shadow', '1px 1px light-dark(lab(50% 20 30), blue)'],
    ['background-image', 'linear-gradient(light-dark(color(srgb 1 0 0), blue), lab(50% 20 30))'],
    ['scrollbar-color', 'lab(50% 20 30) light-dark(color(srgb 1 0 0), blue)'],
    ['color', 'lab(50% 20 30)'],
    ['fill', 'url(#x) lab(50% 20 30)'],
    ['text-shadow', '1px 1px oklch(0.5 0.1 120)'],
  ]),
  { jsdom: 31 },
);

parity(
  'jsdom 31: text-shadow with lab(), color() and other color functions, and a blur that computes to 0px',
  run([
    ['text-shadow', 'lab(50 20 30) 1px 2px calc(1em - 20px)'],
    ['text-shadow', '1px 2px calc(1em - 20px) red'],
    ['text-shadow', 'color(srgb 1 0 0) 1px 2px 0px'],
    ['text-shadow', '1px 2px 0 oklch(0.5 0.1 120)'],
    ['text-shadow', '1px 2px 3px lab(50% 20 30)'],
    ['text-shadow', 'hwb(120 10% 10%) 1px 1px 0'],
    ['text-shadow', 'rgb(1 2 3 / 50%) 1px 1px 0'],
    ['text-shadow', '1px 2px calc(1px - 1px) currentcolor'],
  ]),
  { jsdom: 31 },
);

parity(
  'jsdom 31: contrast-color() is black or white, whichever contrasts more, alone and among other components',
  run([
    ['color', 'contrast-color(red)'],
    ['color', 'contrast-color(black)'],
    ['color', 'contrast-color(white)'],
    ['color', 'contrast-color(navy)'],
    ['color', 'contrast-color(yellow)'],
    ['color', 'contrast-color(#777)'],
    ['color', 'contrast-color(#767676)'],
    ['color', 'contrast-color(#757575)'],
    ['color', 'contrast-color(rgb(0 0 0 / 0))'],
    ['color', 'contrast-color(currentcolor)'],
    ['color', 'contrast-color(light-dark(white, black))'],
    ['color', 'contrast-color(color-mix(in srgb, red, blue))'],
    ['color', 'contrast-color(lab(50% 20 30))'],
    ['color', 'contrast-color(lab(49% 0 0))'],
    ['color', 'contrast-color(lch(60% 30 120))'],
    ['color', 'contrast-color(ButtonText)'],
    ['background-color', 'contrast-color(blue)'],
    ['fill', 'contrast-color(currentcolor)'],
    ['accent-color', 'contrast-color(currentcolor)'],
    ['fill', 'contrast-color(red)'],
    ['scrollbar-color', 'contrast-color(red) blue'],
    ['background-image', 'linear-gradient(contrast-color(black), red)'],
    ['text-shadow', 'contrast-color(currentcolor) 1px 1px'],
    ['text-shadow', 'contrast-color(red) 1px 2px calc(1em - 20px)'],
    ['text-shadow', '1px 2px 0 contrast-color(white)'],
    ['text-shadow', '1px 1px contrast-color(light-dark(red, blue))'],
    ['color', 'contrast-color(oklch(0.5 0.1 120))'],
    ['color', 'contrast-color(color(display-p3 1 1 1))'],
    ['color', 'contrast-color(color(srgb 0.2 0.2 0.2))'],
    ['color', 'contrast-color(hsl(0 0% 46%))'],
  ]),
  { jsdom: 31 },
);

parity(
  'jsdom 31: contrast-color() near the threshold in every color space',
  (w) => {
    const p = w.document.body.appendChild(w.document.createElement('p'));
    return [
      'oklch(0.62 0.1 120)',
      'oklch(0.6 0 0)',
      'oklch(0.58 0 0)',
      'oklab(0.6 0.1 -0.1)',
      'oklab(60% 0 0)',
      'oklch(55% 40% 30)',
      'color(display-p3 0.46 0.46 0.46)',
      'color(display-p3 0.47 0.47 0.47)',
      'color(srgb-linear 0.18 0.18 0.18)',
      'color(srgb-linear 0.19 0.19 0.19)',
      'color(rec2020 0.5 0.5 0.5)',
      'color(a98-rgb 0.47 0.47 0.47)',
      'color(prophoto-rgb 0.4 0.4 0.4)',
      'color(prophoto-rgb 0.45 0.45 0.45)',
      'color(xyz 0.18 0.18 0.18)',
      'color(xyz-d50 0.19 0.19 0.19)',
      'lab(49.5% 0 0)',
      'lab(48% 0 0)',
      'lch(50% 0 0)',
      'lab(none 0 0)',
      'oklch(none 0 0)',
      'color(srgb none 1 1)',
      'color(srgb 0.46 0.46 0.46 / 0.5)',
      'rgb(118 118 118 / 50%)',
    ].map((color) => {
      p.style.color = `contrast-color(${color})`;
      return [color, w.getComputedStyle(p).color];
    });
  },
  { jsdom: 31 },
);
