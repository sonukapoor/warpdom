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
