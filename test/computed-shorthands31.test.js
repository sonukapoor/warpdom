// jsdom 31's computed shorthands: getComputedStyle(element) reads a
// shorthand composed from its computed longhands (black box, 31.0.1),
// with the longhands themselves; checked against jsdom 31.0.1.
import { parity } from './parity.js';

const CASES = {
  margin: ['1px 2px', 'auto', '0'],
  padding: ['0', '1px 2px 3px'],
  inset: ['0', '1px 2px', 'auto'],
  gap: ['10px 20px', 'normal'],
  overflow: ['hidden auto', 'hidden', 'clip'],
  'place-items': ['center', 'start end'],
  'border-radius': ['4px', '1px 2px', '1px / 2px'],
  border: ['1px solid red', 'none', 'thick double'],
  'border-top': ['2px dashed blue', 'none', 'currentcolor'],
  'border-block-start': ['1px solid red'],
  background: [
    'red linear-gradient(red, blue) no-repeat',
    'none',
    'linear-gradient(red, blue), none red',
    'center / cover',
    'right 10px top / 50% fixed',
  ],
  font: [
    'bold 12px/1.5 serif',
    'italic small-caps 14px Arial',
    '400 10px a',
    'condensed 10px a',
    '12px/normal "Times New Roman", serif',
  ],
  flex: ['1', 'none', 'auto', '2 3 10px'],
  'flex-flow': ['row wrap', 'column', 'column-reverse wrap-reverse'],
  outline: ['auto', '1px solid', 'red dotted', 'none', '2px auto blue', 'thin solid', 'currentcolor'],
  'column-rule': ['1px solid red', 'none', 'thick', 'thick solid', 'currentcolor'],
  'text-decoration': [
    'underline',
    'none',
    'underline red',
    'underline dotted 2px blue',
    'underline currentcolor',
    'underline rgb(1, 2, 3)',
    'currentcolor',
  ],
  'box-shadow': [
    'none',
    '1px 2px 3px red',
    'inset 1px 2px 3px 4px blue',
    '1px 1px, 2px 2px red',
    'none red',
    'none currentcolor',
  ],
  '-webkit-text-stroke': ['1px red', '1px currentcolor'],
  'list-style': ['none', 'square inside', 'disc outside'],
  'white-space': ['nowrap', 'pre', 'pre-wrap', 'pre-line', 'break-spaces'],
  'text-align': ['center', 'justify', 'match-parent'],
  'vertical-align': ['middle', 'top', '10px', 'sub'],
  'text-wrap': ['nowrap', 'balance'],
  'text-emphasis': ['dot red', 'none', '"x"'],
  caret: ['red', 'auto', 'block'],
  columns: ['2', '10px', '10px 3'],
  transition: ['opacity 1s', 'all 0s', 'color 1s ease-in 2s, opacity 2s'],
  animation: ['spin 2s infinite', 'none', 'a 1s ease-in 2s 3 reverse both paused'],
  'grid-area': ['1 / 2', 'a', 'span 2'],
};

for (const [name, values] of Object.entries(CASES)) {
  parity(
    `jsdom 31: getComputedStyle composes ${name} from its computed longhands`,
    (w) => {
      const div = w.document.body.appendChild(w.document.createElement('div'));
      div.setAttribute('style', 'color: rgb(1, 2, 3); font-size: 20px');
      const p = div.appendChild(w.document.createElement('p'));
      // (not declared, initial, inherit from a parent that declares it, then each value)
      return [null, 'initial', 'inherit', ...values].map((value) => {
        div.style.setProperty(name, values[0]);
        if (value === null) p.removeAttribute('style');
        else p.setAttribute('style', `${name}: ${value}`);
        return [value, w.getComputedStyle(p).getPropertyValue(name)];
      });
    },
    { jsdom: 31 },
  );
}

parity(
  'jsdom 31: computed line widths, font-width, outline-color auto, box-shadow colors and positions',
  (w) => {
    const p = w.document.body.appendChild(w.document.createElement('p'));
    p.style.color = 'rgb(1, 2, 3)';
    const read = (style, names) => {
      p.setAttribute('style', `color: rgb(1, 2, 3); ${style}`);
      const cs = w.getComputedStyle(p);
      return [style, names.map((n) => cs.getPropertyValue(n))];
    };
    return [
      read('', ['outline-width', 'column-rule-width', 'row-rule-width', 'font-width', 'box-shadow-color']),
      read('outline: thin solid; column-rule: thick; row-rule-width: medium', [
        'outline-width',
        'column-rule-width',
        'row-rule-width',
      ]),
      read('outline: auto', ['outline-color', 'outline-style']),
      read('font-width: condensed', ['font-width']),
      read('font-width: 80%', ['font-width']),
      read('box-shadow: none', ['box-shadow-color']),
      read('box-shadow: none red', ['box-shadow-color']),
      read('box-shadow: 1px 1px, 2px 2px red', ['box-shadow-color']),
      read('background: center / cover', ['background-position-x', 'background-position-y']),
      read('background-position: right 10px top 5px', ['background-position-x', 'background-position-y']),
      read('background-position-x: right 10%, left 1em, right 0, right -5px, center', ['background-position-x']),
      read('background-position-y: bottom calc(1px + 1em)', ['background-position-y']),
      read('offset-position: center', ['offset-position']),
      read('offset-position: left top', ['offset-position']),
      read('offset-position: Center LEFT', ['offset-position']),
      read('offset-position: 10px', ['offset-position']),
      read('offset-position: calc(10px + 1em) top', ['offset-position']),
      read('offset-position: left 10px top 5px', ['offset-position']),
      read('offset-position: normal', ['offset-position']),
      read('outline: 1px solid', ['outline-color']),
      read('outline: none', ['outline-color']),
    ];
  },
  { jsdom: 31 },
);

parity(
  'jsdom 31: outline-color auto and text-decoration colors inherit as specified',
  (w) => {
    const div = w.document.body.appendChild(w.document.createElement('div'));
    const p = div.appendChild(w.document.createElement('p'));
    const read = (parent, child, name) => {
      div.setAttribute('style', parent);
      p.setAttribute('style', child);
      return [parent, child, w.getComputedStyle(p).getPropertyValue(name)];
    };
    return [
      read('color: red; outline: auto', 'color: blue; outline: inherit', 'outline'),
      read('color: red; outline: auto', 'color: blue; outline-color: inherit; outline-style: solid', 'outline-color'),
      read('color: red; outline: 1px solid', 'color: blue; outline: inherit', 'outline'),
      read('color: red; text-decoration: underline', 'color: blue; text-decoration: inherit', 'text-decoration'),
      read('color: red; text-decoration: underline red', 'color: blue; text-decoration: inherit', 'text-decoration'),
      read('color: red; text-decoration: underline currentcolor', 'text-decoration: inherit', 'text-decoration'),
      read('color: red', 'text-decoration: underline initial', 'text-decoration'),
    ];
  },
  { jsdom: 31 },
);

parity(
  'jsdom 31: computed shorthands with var(), and background-repeat read as a shorthand (#336 review)',
  (w) => {
    const div = w.document.body.appendChild(w.document.createElement('div'));
    const p = div.appendChild(w.document.createElement('p'));
    const read = (parent, child, name) => {
      div.setAttribute('style', parent);
      p.setAttribute('style', child);
      return [parent, child, name, w.getComputedStyle(p).getPropertyValue(name)];
    };
    return [
      read('', '--td: underline; text-decoration: var(--td)', 'text-decoration'),
      read('', '--c: currentcolor; text-decoration: underline var(--c)', 'text-decoration'),
      read('', '--c: red; text-decoration: underline var(--c)', 'text-decoration'),
      read('', '--x: oops; text-decoration-line: underline; text-decoration-color: var(--x)', 'text-decoration'),
      read(
        '--c: currentcolor; text-decoration-line: underline; text-decoration-color: var(--c)',
        'text-decoration: inherit',
        'text-decoration',
      ),
      read('', 'background-repeat: repeat-x', 'background-repeat'),
      read('', 'background-repeat: repeat-x', 'BACKGROUND-REPEAT'),
      read('', 'background-repeat: space round, no-repeat', 'background-repeat'),
      read('', '', 'background-repeat'),
      read(
        'color: red; outline-color: auto; outline-style: solid',
        'outline-color: inherit; outline-style: auto',
        'outline',
      ),
    ];
  },
  { jsdom: 31 },
);

parity(
  'jsdom 31: text-decoration inherit at the root is the initial value (#336 review)',
  (w) => {
    const d = w.document;
    d.documentElement.setAttribute('style', 'color: rgb(1, 2, 3); text-decoration: inherit');
    const p = d.body.appendChild(d.createElement('p'));
    p.setAttribute('style', 'text-decoration: inherit');
    return [d.documentElement, d.body, p].map((e) => w.getComputedStyle(e).getPropertyValue('text-decoration'));
  },
  { jsdom: 31 },
);
