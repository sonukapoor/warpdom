import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parity } from './parity.js';
import { NAMED_COLORS } from '../src/colors.js';
import { createWindow } from '../src/node.js';

parity('computed colors: named, hex, rgb() and hsl()', (w) => {
  const e = w.document.body.appendChild(w.document.createElement('div'));
  const colors = [
    ...NAMED_COLORS,
    '#f00',
    '#00ff0080',
    '#abcd',
    '#123456',
    'rgb(1,2,3)',
    'rgba(1, 2, 3, 0.5)',
    'rgb(10% 20% 30% / 40%)',
    'rgba(0,0,0,0)',
    'hsl(120, 100%, 25%)',
    'hsla(240,50%,50%,0.3)',
    'hsl(0 0% 50%)',
    'transparent',
    'RED',
    'rgb(300,-5,2.5)',
    'rgba(0,0,0,.87)',
    'rgba(25,118,210,0.04)',
  ];
  return colors.map((c) => {
    e.style.color = '';
    e.style.color = c;
    return w.getComputedStyle(e).color;
  });
});

// jsdom rounds each channel to 4 significant digits, then to an integer
// (hsl(102, 53%, 61%) has a red of 134.4666: rgb(135, 208, 103)), and
// resolves hwb() (jsdom 26 with cssstyle 4.2 and later, 27 to 30;
// ant-design's Badge demo). cssstyle 4.1 (jsdom 25) rounds once; it drops
// hwb() and some of the other forms here, not reproduced (hsl() only
// there).
const roundedColors = (w, modern = true) => {
  const e = w.document.body.appendChild(w.document.createElement('div'));
  const colors = [
    'hsl(102, 53%, 61%)',
    'hsl(0, 16%, 68%)',
    'hsl(0, 42%, 24%)',
    'hsl(0, 81%, 68%)',
    'hsl(0, 0%, 79%)',
    'hsl(0, 0%, 39%)',
    ...(modern
      ? [
          'hsla(102, 53%, 61%, 0.5)',
          'hsl(102 53% 61%)',
          'rgb(113.45, 0, 0)',
          'rgb(113.44, 0, 0)',
          'rgb(44.5%, 64.5%, 4.5%)',
          'rgb(79%, 0%, 0%)',
          'hwb(205 6% 9%)',
          'hwb(205 6% 9% / 0.5)',
          'hwb(0 0% 0%)',
          'hwb(120 50% 60%)',
          'hwb(0 39% 21%)',
          'HWB(205 6% 9%)',
        ]
      : []),
  ];
  return colors.map((c) => {
    e.style.color = '';
    e.style.color = c;
    return [e.style.color, w.getComputedStyle(e).color];
  });
};
parity('colors: channels rounded as jsdom rounds them', roundedColors);
parity('colors: channels rounded as jsdom rounds them (jsdom 26)', roundedColors, { jsdom: 26 });
parity('colors: channels rounded once (jsdom 25)', (w) => roundedColors(w, false), { jsdom: 25 });

test('colors: cssstyle 4.2 rounds as jsdom 26 does', () => {
  const s = createWindow({ jsdom: '26.1.0', cssstyle: '4.2.1' }).document.body.style;
  s.color = 'hsl(102, 53%, 61%)';
  s.backgroundColor = 'hwb(205 6% 9%)';
  assert.equal(s.cssText, 'color: rgb(135, 208, 103); background-color: rgb(15, 142, 232);');
});
