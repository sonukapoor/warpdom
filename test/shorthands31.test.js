// jsdom 31's shorthands that jsdom 30's expansion does not know
// (shorthands31.js): the longhands a declared value sets and the
// shorthand read back, checked against jsdom 31.0.1.
import { parity } from './parity.js';

const CASES = {
  'text-decoration': [
    'underline',
    'underline overline',
    'underline dotted red',
    'red underline wavy 3px',
    'line-through 2px',
    'from-font underline',
    'none',
    'blink',
    'underline 10%',
    'currentcolor overline',
    'spelling-error',
    'grammar-error',
    'spelling-error red',
  ],
  'text-align': ['center', 'justify', 'start', 'end', 'left', 'right', 'match-parent', 'justify-all'],
  'white-space': [
    'normal',
    'nowrap',
    'pre',
    'pre-wrap',
    'pre-line',
    'break-spaces',
    'preserve nowrap',
    'collapse',
    'wrap',
    'preserve-breaks wrap',
  ],
  'text-wrap': ['balance', 'nowrap', 'wrap', 'pretty', 'stable', 'auto', 'nowrap balance', 'wrap pretty'],
  caret: ['red', 'auto', 'bar', 'block red', 'underscore manual blue', 'manual'],
  'text-emphasis': ['dot red', 'open circle', 'filled sesame blue', '"x"', 'none', 'red'],
  'list-style': [
    'none',
    'square inside',
    'url(a.png) disc',
    'decimal',
    'inside',
    'none inside',
    'none none',
    'url(a.png) none',
    '"-" outside',
    'outside none url(a.png)',
    'disc outside none',
  ],
  'overflow-clip-margin': ['10px', 'content-box 5px', 'padding-box', '5px border-box'],
  'overflow-clip-margin-block': ['1px'],
  'border-block-start': ['1px solid red', 'solid', 'red 2px'],
  'border-block': ['2px dashed green'],
  'border-inline-color': ['red blue', 'red'],
  'border-inline-width': ['1px', 'thin 3px'],
  'border-inline-style': ['solid dotted'],
  'border-inline-end': ['3px double'],
  'vertical-align': [
    'top',
    'middle',
    'bottom',
    'sub',
    'super',
    'text-top',
    'text-bottom',
    'baseline',
    '10px',
    '-5%',
    'center',
    'first top',
    'last middle',
    'first',
    'calc(1px + 2px)',
  ],
  columns: [
    '2 100px',
    '2',
    '100px',
    'auto',
    'auto 3',
    '3 auto',
    'calc(2)',
    '100px 2 / 300px',
    '2 / 300px',
    'auto / auto',
    '100px / 50px',
    'calc(2) 100px',
  ],
  'grid-area': [
    '1 / 2',
    '1',
    'a',
    'a / b',
    '1 / 2 / 3 / 4',
    'span 2 / 3',
    'auto',
    '--hero',
    '名',
    '--hero / b',
    '名 / 2',
  ],
  'grid-row': ['1', '1 / 3', 'a', 'span 2', '--a', '名'],
  'grid-column': ['2 / span 3', 'b / c', '--x / 3'],
  'box-shadow': [
    '1px 2px 3px 4px red inset, 5px 6px blue',
    'none',
    '1px 1px',
    'inset 0 0 0 1px currentcolor',
    '2px 3px 4px rgba(0,0,0,.5)',
    '1em 2px',
    'red 1px 1px 0',
    // (none is the offset: a color, a blur and spread, inset with it)
    'none red',
    'red none',
    'NONE Red',
    'none currentcolor',
    'none inset',
    'none 1px 1px',
    'none 1px',
    'none, 1px 1px',
    'none 1px 2px 3px',
    'inset none red 2px',
    'none none',
    '1px 2px inset 3px',
  ],
  '-webkit-text-stroke': ['1px red', 'red 2px', '0 red', '1px', '1px currentcolor', 'currentcolor', '0px'],
  container: [
    'none',
    'a',
    'a / size',
    'a b / inline-size',
    'inline-size',
    'none / size',
    'scroll-state',
    'a / scroll-state size',
    'A / SIZE',
  ],
  'text-box': ['normal', 'none', 'trim-both', 'cap alphabetic', 'trim-start text', 'trim-end', 'text alphabetic'],
  'font-synthesis': ['none', 'weight', 'style small-caps', 'weight style small-caps position', 'position'],
  'line-clamp': ['none', '3', '3 "…"', '1 no-ellipsis'],
  offset: [
    'none',
    'auto',
    '10px 20px',
    'left top',
    'ray(45deg) 10px auto 30deg',
    'url(#p)',
    'ray(45deg) 10px reverse 30deg / left top',
    'auto ray(45deg)',
    '10px 20px url(#p) 50%',
    'url(#p) 30deg',
    'none 10px',
    'none / left top',
    'auto / 10px 20px',
    'url(#p) 10px 30deg reverse',
    'LEFT TOP',
  ],
  'column-rule': ['1px solid red', 'currentcolor', 'none', 'thick', 'medium none currentcolor'],
  transition: [
    'opacity 1s',
    'all 0.3s ease-in-out',
    'opacity 1s, transform 2s linear 0.5s',
    '1s',
    'none',
    'color 200ms ease 100ms allow-discrete',
    'transform 1s cubic-bezier(.1,.2,.3,.4)',
    'opacity 1s steps(4, end)',
    'all 0s ease 0s',
    'opacity 0s 1s',
    'all 1s',
    '1s 2s linear opacity',
    'ease',
    'opacity calc(1s + 1s) calc(0s)',
    '1s ease ease',
    'linear 1s ease-in',
    '1s normal normal',
    '1s allow-discrete allow-discrete',
    'none 1s',
    'all',
  ],
  animation: [
    'spin 2s infinite',
    'fade 1s ease-in 0.5s 3 alternate forwards',
    'none',
    '2s',
    'a 1s, b 2s linear',
    'slide 300ms paused',
    'x 1s infinite reverse both running',
    'spin calc(2s)',
    'spin 1s infinite linear',
    'spin 0s ease 0s 1 normal none running',
    'Ease',
    'spin 1s 2s',
    'spin 1s calc(2)',
    'calc(2) 1s spin',
    '1s ease ease',
    '1s infinite infinite',
    '1s 1 infinite',
    '1s normal normal',
    '1s running running',
    '1s none none',
    'spin auto',
    'auto 1s spin',
    'auto',
    'auto auto',
    'spin 1s auto',
    '1s none forwards',
    '1s forwards none',
    'normal',
  ],
  'flex-flow': ['row wrap', 'column', 'row', 'wrap-reverse column-reverse'],
};

for (const [name, values] of Object.entries(CASES)) {
  parity(
    `jsdom 31: ${name} sets its longhands and reads back canonically`,
    (w) => {
      const p = w.document.body.appendChild(w.document.createElement('p'));
      return values.map((value) => {
        p.removeAttribute('style');
        p.style.setProperty(name, value);
        const longhands = [];
        for (let i = 0; i < p.style.length; i++)
          longhands.push([p.style.item(i), p.style.getPropertyValue(p.style.item(i))]);
        return [value, p.style.getPropertyValue(name), p.style.cssText, longhands];
      });
    },
    { jsdom: 31 },
  );
}

parity(
  'jsdom 31: box-shadow none is written with a color set after it, other than transparent',
  (w) => {
    const p = w.document.body.appendChild(w.document.createElement('p'));
    return [
      [
        ['box-shadow', 'none'],
        ['box-shadow-color', 'red'],
      ],
      [
        ['box-shadow', 'none'],
        ['box-shadow-position', 'inset'],
      ],
      [
        ['box-shadow', '1px 1px'],
        ['box-shadow-color', 'transparent'],
      ],
      [
        ['box-shadow', 'none'],
        ['box-shadow-blur', '2px'],
      ],
    ].map((writes) => {
      p.removeAttribute('style');
      for (const [name, value] of writes) p.style.setProperty(name, value);
      return [writes, p.style.cssText, p.style.boxShadow];
    });
  },
  { jsdom: 31 },
);

parity(
  'jsdom 31: escaped names stay whole in transition, animation, list-style and grid shorthands',
  (w) => {
    const p = w.document.body.appendChild(w.document.createElement('p'));
    const out = [];
    for (const [name, value] of [
      ['animation', '\\31 slide 1s'],
      ['animation', 'a\\,b 1s'],
      ['animation', 'a\\ b 2s'],
      ['animation', 'x 1s, y\\,z 2s'],
      ['transition', 'a\\,b 1s'],
      ['transition', '\\31 x 1s'],
      ['grid-area', 'a\\/b'],
      ['grid-area', '\\31 foo'],
      ['grid-area', '\\31 foo / b'],
      ['grid-row', 'a\\/b'],
      ['grid-row', '\\31 foo'],
      ['grid-column', '\\31 foo / 3'],
      ['list-style', '\\31 x inside'],
    ]) {
      p.removeAttribute('style');
      p.style.setProperty(name, value);
      out.push([name, value, p.style.getPropertyValue(name), p.style.cssText]);
    }
    // (composed from list longhands set one by one)
    p.removeAttribute('style');
    p.style.animation = 'x 1s';
    p.style.setProperty('animation-name', 'a\\,b');
    out.push(['animation-name', p.style.animation, p.style.cssText]);
    p.style.setProperty('animation-name', 'a, b');
    out.push(['animation-name', p.style.animation, p.style.cssText]);
    return out;
  },
  { jsdom: 31 },
);

parity(
  'jsdom 31: animation-range sets its start and end, and is written from them',
  (w) => {
    const p = w.document.body.appendChild(w.document.createElement('p'));
    const out = [];
    for (const [start, end] of [
      ['normal', 'normal'],
      ['entry 10%', 'normal'],
      ['normal', 'exit 90%'],
      ['entry 0%', 'entry 100%'],
      ['20%', '80%'],
      ['cover 0%', 'cover 100%'],
      ['entry 10%', 'entry'],
    ]) {
      p.removeAttribute('style');
      p.style.setProperty('animation-range-start', start);
      p.style.setProperty('animation-range-end', end);
      out.push([start, end, p.style.cssText]);
    }
    for (const value of [
      'normal',
      'entry 10%',
      'entry 10% exit 90%',
      'cover',
      'contain 0% contain 100%',
      'normal exit',
      '20% 80%',
      'entry',
      'entry entry',
      'normal normal',
      'exit 50px',
      'cover 10% 90%',
      '10%',
    ]) {
      p.removeAttribute('style');
      p.style.setProperty('animation-range', value);
      out.push([
        value,
        p.style.cssText,
        p.style.getPropertyValue('animation-range-start'),
        p.style.getPropertyValue('animation-range-end'),
      ]);
    }
    return out;
  },
  { jsdom: 31 },
);

parity(
  'jsdom 31: animation-range layers, normal without an offset, equal offsets, and transition property case',
  (w) => {
    const p = w.document.body.appendChild(w.document.createElement('p'));
    const out = [];
    for (const [start, end] of [
      ['20%', '20%'],
      ['entry 10%, cover', 'exit, contain'],
      ['10%', 'normal'],
      ['normal', 'normal'],
    ]) {
      p.removeAttribute('style');
      p.style.setProperty('animation-range-start', start);
      p.style.setProperty('animation-range-end', end);
      out.push([start, end, p.style.cssText]);
    }
    for (const value of [
      'entry 10% exit 90%, cover 20% contain 80%',
      'normal 80%',
      'normal, entry',
      'entry, 10% 20%',
    ]) {
      p.removeAttribute('style');
      p.style.setProperty('animation-range', value);
      out.push([
        value,
        p.style.cssText,
        p.style.getPropertyValue('animation-range-start'),
        p.style.getPropertyValue('animation-range-end'),
      ]);
    }
    for (const value of ['--Accent 1s', '--Accent 1s, Opacity 2s', 'OPACITY 1s']) {
      p.removeAttribute('style');
      p.style.setProperty('transition', value);
      out.push([value, p.style.cssText, p.style.getPropertyValue('transition-property')]);
    }
    return out;
  },
  { jsdom: 31 },
);

parity(
  'jsdom 31: a transition property or animation name that clashes with a keyword keeps its spelling, and cssText reads back',
  (w) => {
    const p = w.document.body.appendChild(w.document.createElement('p'));
    const out = [];
    for (const property of ['NORMAL', 'ALLOW-DISCRETE', 'Ease', 'LINEAR', 'normal']) {
      p.removeAttribute('style');
      p.style.transition = 'opacity 1s';
      p.style.transitionProperty = property;
      const copy = w.document.createElement('p');
      copy.style.cssText = p.style.cssText;
      out.push([property, p.style.cssText, copy.style.transitionProperty]);
    }
    for (const value of [
      '1s Ease Ease',
      '1s ease EASE',
      '1s Infinite INFINITE',
      'x 1s',
      'X 1s',
      '1s NORMAL normal',
      '1s none NONE',
      'Spin 1s, Fade 2s',
    ]) {
      p.removeAttribute('style');
      p.style.animation = value;
      out.push(['animation', value, p.style.animation, p.style.animationName]);
    }
    for (const value of ['1s EASE EASE', '1s Normal NORMAL', 'Opacity 1s, Color 2s']) {
      p.removeAttribute('style');
      p.style.transition = value;
      out.push(['transition', value, p.style.transition, p.style.transitionProperty]);
    }
    return out;
  },
  { jsdom: 31 },
);
