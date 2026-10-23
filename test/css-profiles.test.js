// Inline style serialization by jsdom version (black box): border and its
// sides, clip, outline, properties an old cssstyle does not know, values it
// drops; and getComputedStyle with a pseudo-element.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWindow } from '../src/node.js';
import { parity } from './parity.js';

const read = (w, cases) =>
  cases.map(([name, value]) => {
    const s = w.document.createElement('div').style;
    s.setProperty(name, value);
    return `${name}: ${value} -> ${s.getPropertyValue(name)} | ${s.cssText}`;
  });

const BORDERS = [
  '0',
  '0px',
  'none',
  '0 none',
  'none 0',
  '1px',
  '1px solid',
  'solid 1px',
  'solid 1px red',
  'red solid 1px',
  'medium solid',
  '0 solid',
  '1px none',
  'hidden',
  'inherit',
  '1px solid #ccc',
  '1px solid currentColor',
  '2px dashed rgba(0,0,0,.5)',
  '1px solid var(--c)',
  '0 none transparent',
  'none transparent',
  '1.0px solid',
  '1px solid PINK',
];
const CLIPS = [
  'rect(0 0 0 0)',
  'rect(0, 0, 0, 0)',
  'rect(1px 2px 3px 4px)',
  'rect(1px,2px,3px,4px)',
  'rect(auto, 0, 1px, auto)',
  'rect(1px, 2px, 3px)',
  'auto',
  'inherit',
];
const COMMON = [
  ['outline', '0'],
  ['outline', 'none'],
  ['outline', '1px solid #ccc'],
  ['aspect-ratio', '1'],
  ['aspect-ratio', '16 / 9'],
  ['translate', '10px'],
  ['transform-style', 'preserve-3d'],
  ['touch-action', 'none'],
  ['-webkit-appearance', 'none'],
  ['backdrop-filter', 'blur(4px)'],
  ['color', 'inherit'],
  ['color', 'currentColor'],
  ['top', 'auto'],
  ['right', 'var(--x)'],
  ['width', 'initial'],
  ['font', 'inherit'],
  ['flex', 'unset'],
  ['border-spacing', '0'],
  ['border-style', 'none'],
  ['padding-left', 'calc(100% - 1px)'],
  ['font-size', 'revert'],
  ['opacity', '0.5'],
];

const SURFACE_SAMPLE = [
  ['webkitUserSelect', 'contain'],
  ['webkitUserSelect', 'none'],
  ['webkitUserSelect', 'Contain'],
  ['WebkitUserSelect', 'none'],
  ['-webkit-user-select', 'none'],
  ['webkit-user-select', 'text'],
  ['userSelect', 'contain'],
  ['backdropFilter', 'blur(2px)'],
  ['touchAction', 'none'],
  ['webkitBoxAlign', 'center'],
  ['WebkitBoxFlex', 'inherit'],
  ['-webkit-box-orient', 'vertical'],
  ['webkitBoxOrdinalGroup', 'inherit'],
  ['webkitBoxPack', 'end'],
  ['webkitTextFillColor', 'red'],
  ['webkit-text-fill-color', 'red'],
  ['webkitTextStrokeWidth', '1px'],
  ['cssFloat', 'left'],
  ['css-float', 'left'],
  ['webkitAnimation', 'none'],
  ['webkitTransform', 'translateX(0)'],
  ['WebkitTransform', 'none'],
  ['webkitAppearance', 'none'],
  ['webkitLineClamp', '2'],
  ['aspectRatio', '1 / 1'],
  ['accentColor', 'red'],
  ['containerType', 'size'],
  ['translate', '10px'],
  ['animationComposition', 'add'],
  ['textWrapMode', 'nowrap'],
  ['anchorName', '--a'],
  ['transitionBehavior', 'normal'],
  ['overscrollBehavior', 'contain'],
  ['positionArea', 'top'],
  ['fieldSizing', 'content'],
  ['zoom', '2'],
  ['paintOrder', 'stroke'],
  ['gridGap', '1px'],
  ['imageAnimation', 'running'],
  ['frameSizing', 'auto'],
  ['animationDelayStart', '1s'],
  ['maxSize', 'none'],
  ['scrollAxisLock', 'none'],
  ['color', 'red'],
];
const SURFACE_NAMES = [
  '-webkit-user-select',
  'webkit-user-select',
  'backdrop-filter',
  'touch-action',
  '-webkit-box-align',
  '-webkit-box-pack',
  '-webkit-text-fill-color',
  'webkit-text-fill-color',
  'webkit-animation',
  '-webkit-transform',
  'webkit-transform',
  'aspect-ratio',
  'container-type',
  'animation-composition',
  'transition-behavior',
  'field-sizing',
  'frame-sizing',
  'size',
  'float',
];

for (const jsdom of [20, 22, 25, 26, 30]) {
  parity(
    `style: border and its sides (jsdom ${jsdom})`,
    (w) => [
      ...read(
        w,
        BORDERS.map((v) => ['border', v]),
      ),
      ...read(
        w,
        BORDERS.map((v) => ['border-top', v]),
      ),
    ],
    { jsdom },
  );
  parity(
    `style: clip (jsdom ${jsdom})`,
    (w) =>
      read(
        w,
        CLIPS.map((v) => ['clip', v]),
      ),
    { jsdom },
  );
  parity(`style: common declarations (jsdom ${jsdom})`, (w) => read(w, COMMON), { jsdom });
  // downshift's status region and the usual visually hidden styles.
  parity(
    `style: visually hidden (jsdom ${jsdom})`,
    (w) => {
      const d = w.document.createElement('div');
      Object.assign(d.style, {
        border: '0',
        clip: 'rect(0 0 0 0)',
        height: '1px',
        margin: '-1px',
        overflow: 'hidden',
        padding: '0',
        position: 'absolute',
        width: '1px',
        whiteSpace: 'nowrap',
      });
      return [d.getAttribute('style'), d.style.border, d.style.clip];
    },
    { jsdom },
  );
  // react-spectrum's usePress/useMove tests save, set and restore
  // style.webkitUserSelect; before jsdom 27 it is an expando, not a property.
  parity(
    `style: properties the profile has no accessor for (jsdom ${jsdom})`,
    (w) => {
      const s = w.document.documentElement.style;
      const before = [
        typeof s.webkitUserSelect,
        'webkitUserSelect' in s,
        'WebkitUserSelect' in s,
        'backdropFilter' in s,
        'userSelect' in s,
      ];
      s.webkitUserSelect = 'contain';
      s.backdropFilter = 'blur(2px)';
      return [
        ...before,
        s.webkitUserSelect,
        s.backdropFilter,
        s.cssText,
        typeof w.document.body.style.webkitUserSelect,
      ];
    },
    { jsdom },
  );
  // The style surface (src/style-surface.js): which accessors exist, which
  // names setProperty keeps, and the name an accessor writes. Names from
  // each profile's difference lists.
  parity(
    `style: accessors and known properties (jsdom ${jsdom})`,
    (w) =>
      SURFACE_SAMPLE.map(([name, value]) => {
        const s = w.document.createElement('div').style;
        const before = [name in s, typeof s[name]];
        s[name] = value;
        return [name, ...before, s[name], s.cssText, Object.hasOwn(s, name)].join(' | ');
      }),
    { jsdom },
  );
  parity(
    `style: setProperty and cssText with the profile's names (jsdom ${jsdom})`,
    (w) =>
      SURFACE_NAMES.map((name) => {
        const s = w.document.createElement('div').style;
        s.setProperty(name, 'inherit');
        const kept = s.getPropertyValue(name);
        s.cssText = `${name}: none; color: red`;
        return [name, kept, s.getPropertyValue(name), s.cssText].join(' | ');
      }),
    { jsdom },
  );
}

test("getComputedStyle with a pseudo-element reports it as not implemented, in the profile's words", () => {
  const messages = [];
  const original = console.error;
  console.error = (m) => messages.push(m);
  try {
    for (const jsdom of [20, 23, 24, 26, 27, 30]) {
      const w = createWindow({ jsdom });
      const p = w.document.body.appendChild(w.document.createElement('p'));
      assert.equal(w.getComputedStyle(p, '::before').display, 'block');
      w.getComputedStyle(p, null);
      w.getComputedStyle(p, '');
      w.getComputedStyle(p);
    }
  } finally {
    console.error = original;
  }
  assert.deepEqual(messages, [
    'Not implemented: window.computedStyle(elt, pseudoElt)',
    'Not implemented: window.computedStyle(elt, pseudoElt)',
    'Not implemented: window.getComputedStyle(elt, pseudoElt)',
    'Not implemented: window.getComputedStyle(elt, pseudoElt)',
    "Not implemented: Window's getComputedStyle() method: with pseudo-elements",
    "Not implemented: Window's getComputedStyle() method: with pseudo-elements",
  ]);
});

parity("getComputedStyle with a pseudo-element: the element's style, reported (jsdom 30)", (w) => {
  const p = w.document.body.appendChild(w.document.createElement('p'));
  return [w.getComputedStyle(p, '::after').display, w.getComputedStyle(p, ' ').display];
});

// Profiles test/parity.js does not load: the accessors a few names have
// there (black box, jsdom installed with that cssstyle; the full lists are
// checked by scripts/gen-style-surface.mjs).
test('style accessors by jsdom and cssstyle version (jsdom 27 to 30.0)', () => {
  const names = [
    'webkitUserSelect',
    'touchAction',
    'backdropFilter',
    'aspectRatio',
    'fieldSizing',
    'frameSizing',
    'imageAnimation',
    'maxSize',
    'animationDelayStart',
    'timelineTriggerName',
  ];
  const present = (options) => {
    const style = createWindow(options).document.body.style;
    return names.filter((name) => name in style).join(' ');
  };
  const cases = [
    [{ jsdom: '27.4.0', cssstyle: '5.1.0' }, 'aspectRatio'],
    [{ jsdom: '27.4.0', cssstyle: '5.3.7' }, 'aspectRatio'],
    [{ jsdom: '27.2.0' }, 'aspectRatio'],
    [
      { jsdom: '28.1.0', cssstyle: '6.0.1' },
      'webkitUserSelect touchAction backdropFilter aspectRatio fieldSizing timelineTriggerName',
    ],
    [{ jsdom: 28 }, 'webkitUserSelect touchAction backdropFilter aspectRatio fieldSizing timelineTriggerName'],
    [
      { jsdom: '29.0.0' },
      'webkitUserSelect touchAction backdropFilter aspectRatio fieldSizing imageAnimation timelineTriggerName',
    ],
    [
      { jsdom: '29.1.1' },
      'webkitUserSelect touchAction backdropFilter aspectRatio fieldSizing frameSizing imageAnimation timelineTriggerName',
    ],
    [
      { jsdom: '30.0.0' },
      'webkitUserSelect touchAction backdropFilter aspectRatio fieldSizing frameSizing imageAnimation timelineTriggerName',
    ],
    [
      { jsdom: '30.0.1' },
      'webkitUserSelect touchAction backdropFilter aspectRatio fieldSizing frameSizing imageAnimation animationDelayStart timelineTriggerName',
    ],
    [{ jsdom: '30.1.2' }, names.join(' ')],
  ];
  for (const [options, expected] of cases) assert.equal(present(options), expected, JSON.stringify(options));
  // cssstyle 2 to 4.3: webkitUserSelect writes webkit-user-select.
  const s = createWindow({ jsdom: '24.1.3', cssstyle: '4.0.1' }).document.body.style;
  s.webkitUserSelect = 'none';
  assert.equal(s.cssText, 'webkit-user-select: none;');
});

// Properties warpdom's CSS data lacks that a profile keeps, as written,
// with their accessors (ant-design's List demo: react-infinite-scroll-
// component sets WebkitOverflowScrolling: touch, kept from cssstyle 4.4).
const extraNames = (w) => {
  const s = w.document.createElement('div').style;
  const out = ['WebkitOverflowScrolling' in s, 'webkitOverflowScrolling' in s];
  s.WebkitOverflowScrolling = 'touch';
  out.push(s.cssText, s.webkitOverflowScrolling, s.getPropertyValue('-webkit-overflow-scrolling'));
  s.cssText = '';
  s.setProperty('-webkit-overflow-scrolling', 'auto');
  out.push(s.cssText);
  return out;
};
for (const jsdom of [30, 26, 25, 22, 20])
  parity(`style: names warpdom's data lacks (jsdom ${jsdom})`, extraNames, { jsdom });

test('style: -webkit-overflow-scrolling is kept from cssstyle 4.4', () => {
  const write = (options) => {
    const s = createWindow(options).document.body.style;
    s.WebkitOverflowScrolling = 'touch';
    return s.cssText;
  };
  assert.equal(write({ jsdom: '26.1.0', cssstyle: '4.3.1' }), '');
  assert.equal(write({ jsdom: '26.1.0', cssstyle: '4.4.0' }), '-webkit-overflow-scrolling: touch;');
  assert.equal(write({ jsdom: '27.4.0', cssstyle: '5.3.7' }), '-webkit-overflow-scrolling: touch;');
});
