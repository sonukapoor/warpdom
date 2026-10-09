import { parity } from './parity.js';
import { NAMED_COLORS } from '../src/colors.js';

parity('computed colors: named, hex, rgb() and hsl()', (w) => {
  const e = w.document.body.appendChild(w.document.createElement('div'));
  const colors = [...NAMED_COLORS, '#f00', '#00ff0080', '#abcd', '#123456', 'rgb(1,2,3)', 'rgba(1, 2, 3, 0.5)',
    'rgb(10% 20% 30% / 40%)', 'rgba(0,0,0,0)', 'hsl(120, 100%, 25%)', 'hsla(240,50%,50%,0.3)', 'hsl(0 0% 50%)',
    'transparent', 'RED', 'rgb(300,-5,2.5)', 'rgba(0,0,0,.87)', 'rgba(25,118,210,0.04)'];
  return colors.map((c) => {
    e.style.color = '';
    e.style.color = c;
    return w.getComputedStyle(e).color;
  });
});
