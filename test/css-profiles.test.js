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

// A declaration list with an empty declaration (a leading semicolon, a
// name without a colon, a colon without a value): jsdom 20 to 26
// (cssstyle 2.3.0 to 4.6.0) read the name up to the next colon and the
// value from the first character after the colon, semicolons included, so
// the next declaration is lost with it; from jsdom 27 it is read on its
// own (black box; #129: react-overlays' modals append
// ';overflow: hidden;padding-right: 0px;' to cssText).
const EMPTY_DECLARATIONS = [
  ';overflow: hidden;padding-right: 0px;',
  ';color: red',
  ';;color: red; margin: 0',
  ' ;color: red;margin: 0',
  'color: red;;margin: 0;padding: 1px',
  'color: red; ; margin: 0; padding: 1px',
  'x;color: red;margin: 0',
  ':;color: red;margin: 0',
  'color;margin: 0; padding: 1px',
  'color:;margin: 0;padding: 1px',
  'color: ;;margin: 0;padding: 1px',
  'color: !important;margin: 0',
  '--x:;color: red;margin: 0',
  '--x: ;;color: red;margin: 0',
  '--a: 1;--x:;;--y: 2;--z: 3',
  ';--x: 1;--y: 2',
  "color: red;'a;b';margin: 0;padding: 1px",
  'color: red;;',
  ';',
];
for (const jsdom of [30, 27, 26, 25, 22, 20])
  parity(
    `style: an empty declaration in a declaration list (jsdom ${jsdom})`,
    (w) => {
      const d = w.document;
      const out = EMPTY_DECLARATIONS.map((text) => {
        const s = d.createElement('div').style;
        s.cssText = text;
        return `${text} -> ${s.cssText} (${s.getPropertyValue('--x')})`;
      });
      const el = d.body.appendChild(d.createElement('div'));
      el.style.color = 'blue';
      el.style.cssText += ';overflow: hidden;padding-right: 0px;';
      out.push(el.getAttribute('style'), el.style.overflow);
      el.setAttribute('style', ';margin: 1px;padding: 2px');
      out.push(el.style.cssText, el.style.margin, w.getComputedStyle(el).paddingTop);
      // Style sheets: the cascade drops the same declarations. (jsdom 27 to
      // 29 report this sheet on the console as not parsed.)
      if (jsdom === 27) return out;
      d.head.innerHTML = '<style>.a{;margin: 3px; padding: 4px} .b{margin:;padding: 5px}</style>';
      for (const name of ['a', 'b']) {
        const div = d.body.appendChild(d.createElement('div'));
        div.className = name;
        const cs = w.getComputedStyle(div);
        out.push(`${cs.marginTop} ${cs.paddingTop}`);
      }
      return out;
    },
    { jsdom },
  );

// The background shorthand per generation (black box; #130: Mattermost's
// snapshots have background: 0px from style.background = '0' on jsdom 26):
// cssstyle before 4.4 (jsdom 20 to 25 here) rejects a unitless 0 and keeps
// the last of a repeated component in the order color image repeat
// attachment position; cssstyle 4.4 to 4.6 (jsdom 26) writes 0px and
// rejects repeated components and two-value positions, in the order image
// position repeat attachment color; jsdom 27 and later center a one-value
// position and leave out initial values, jsdom 27 to 29 losing a position
// of two values.
const BACKGROUNDS = [
  '0',
  0,
  '0px',
  '0 0',
  '-0',
  '00',
  'none',
  'Red',
  '#fff',
  'transparent',
  'currentColor',
  'url(a.png)',
  'url("a.png") no-repeat',
  'red url(a.png) no-repeat center',
  'url(a.png) red',
  'fixed red no-repeat url(a.png) top',
  'center',
  'top',
  'Center',
  'top left',
  '10px 20px',
  'none 0',
  '0 red',
  'transparent 0',
  'url(a.png) 0',
  'url(a.png) 0 0',
  'url(a.png) no-repeat 0 0 red',
  'url(a.png) no-repeat left center',
  'url(a.png) 0 0 / cover',
  'url(a.png) center / contain no-repeat',
  'transparent url(a.png) no-repeat 0 0',
  'red blue',
  'none url(a.png)',
  'no-repeat repeat-x',
  'repeat-x no-repeat',
  'repeat-y repeat',
  'url(a.png) center / 5deg',
  'url(a.png) center / cover contain',
  'repeat no-repeat',
  'no-repeat fixed',
  'space',
  'local',
  'red border-box',
  'url(a.png) border-box padding-box',
  'red, blue',
  '1',
  '1px 2px',
  'url(a.png) 0 0 !important',
  // Numbers and units (#132 review): canonical from cssstyle 4.4, units a
  // length or a percentage.
  '10.0px',
  '.5em',
  'red 1.50em',
  '1e1px',
  '010px',
  '10PX',
  '2vmin',
  '5deg',
  'url(a.png) 1s',
  'red 10bogus',
  // A parenthesis inside url(): rejected before jsdom 27.
  'red url("calc(icon)")',
  'url("a(b).png") red',
];
// Where jsdom 27 and later set every longhand to its initial value (cssText
// lists them; not modeled).
const ALL_INITIAL = new Set(['0 0', '-0', '00', 'top left', '10px 20px', '1px 2px']);
for (const jsdom of [30, 29, 28, 27, 26, 25, 22, 20])
  parity(
    `style: the background shorthand (jsdom ${jsdom})`,
    (w) =>
      BACKGROUNDS.filter((value) => !(jsdom >= 27 && jsdom < 30 && ALL_INITIAL.has(value))).flatMap((value) => {
        const set = w.document.createElement('div').style;
        set.background = value;
        const text = w.document.createElement('div').style;
        text.cssText = `background: ${value}`;
        return [`${value} -> ${set.cssText}`, text.cssText];
      }),
    { jsdom },
  );

test('style: the background shorthand with cssstyle 4.4 and 4.5', () => {
  const write = (cssstyle, value) => {
    const s = createWindow({ jsdom: '26.1.0', cssstyle }).document.body.style;
    s.background = value;
    return s.cssText;
  };
  // Measured with jsdom 23.2.0 and 26.1.0.
  for (const cssstyle of ['4.4.0', '4.5.0']) {
    assert.equal(write(cssstyle, '0'), 'background: 0px;');
    assert.equal(write(cssstyle, '00'), '');
    assert.equal(write(cssstyle, 'NONE'), 'background: NONE;');
    assert.equal(write(cssstyle, 'Red url(a.png) Fixed'), 'background: url("a.png") fixed red;');
    assert.equal(write(cssstyle, 'url(a.png) 0px 0px'), '');
  }
  assert.equal(write('4.6.0', 'NONE'), 'background: none;');
  assert.equal(write('4.3.1', '0'), '');
  assert.equal(write('4.3.1', 'url(a.png) 10px 20px'), 'background: url("a.png") 20px;');
});

// An invalid background leaves the declared one in place, and jsdom 27 and
// later compute the position their own serialization wrote (url("a.png")
// center center: lost in 27 to 29, 50% 50% in 30; #132 review).
for (const jsdom of [30, 29, 28, 27, 26, 20])
  parity(
    `style: an invalid background after a valid one; the computed position (jsdom ${jsdom})`,
    (w) => {
      const out = ['5deg', 'url(a.png) 1s', 'url(a.png) center / 5deg', 'url(a.png) center / cover contain'].map(
        (value) => {
          const s = w.document.createElement('div').style;
          s.background = 'red';
          s.background = value;
          return s.cssText;
        },
      );
      if (jsdom >= 27)
        for (const value of ['url(a.png) center', 'url(a.png) 0', 'red top']) {
          const el = w.document.body.appendChild(w.document.createElement('div'));
          el.style.background = value;
          out.push(el.style.cssText, w.getComputedStyle(el).backgroundPosition);
        }
      return out;
    },
    { jsdom },
  );

// !important on a declaration with var() (#141, black box): from jsdom
// 27.0.0 to 29.1.1 the style attribute, cssText and setProperty drop it
// (in the attribute it still keeps a later normal declaration of the
// property out), and so do style sheets from 27.1.0; custom properties
// keep it, but with cssstyle 4.6 (jsdom 26) in the attribute, cssText and
// setProperty. In jsdom 27 and 28 the attribute's border with var()
// declares nothing at all, a side with var() is dropped.
const VAR_IMPORTANT = [
  'padding: var(--p) !important',
  'color: var(--c) !important',
  'margin: 1px var(--m) !important',
  'background: var(--b) !important; color: red !important',
  'width: calc(var(--w) + 1px) !important; height: 1px !important',
  'font: var(--f) !important',
  'border-width: var(--w) !important',
  'color: var(--c) !important; width: 1px !important',
  '--x: 1px !important',
  '--x: var(--y) !important; --z: 2px',
];
const VAR_IMPORTANT_ATTRIBUTE = [
  'color: var(--c) !important; color: red',
  'padding: var(--p) !important; padding-top: 1px',
  'border: var(--b) !important',
  'color: red; border: 1px solid var(--c); width: 1px',
  'color: red; border-top: var(--b); width: 1px',
  'border-left: var(--b) !important; color: red !important',
];
const PRIORITY_NAMES = [
  'padding',
  'color',
  'margin',
  'background',
  'width',
  'height',
  'font',
  'border-width',
  '--x',
  '--z',
];
const readBlock = (style) =>
  `${style.cssText} (${style.length}) ${PRIORITY_NAMES.filter((name) => style.getPropertyPriority(name)).join(' ')}`;
for (const jsdom of [30, 29, 28, 27, 26])
  parity(
    `style: var() with !important (jsdom ${jsdom})`,
    (w) => {
      const d = w.document;
      const out = [];
      // jsdom 26 replaces a shorthand with a later longhand of it (not
      // modeled).
      const attribute = VAR_IMPORTANT_ATTRIBUTE.filter((text) => jsdom >= 27 || !text.includes('padding-top'));
      for (const text of [...VAR_IMPORTANT, ...attribute]) {
        const el = d.createElement('div');
        el.setAttribute('style', text);
        out.push(readBlock(el.style));
        el.style.opacity = '0';
        out.push(el.getAttribute('style'));
        const set = d.createElement('div');
        set.style.cssText = text;
        out.push(readBlock(set.style));
      }
      const sheet = d.head.appendChild(d.createElement('style'));
      sheet.textContent = VAR_IMPORTANT.map((text, i) => `.r${i} { ${text} }`).join('\n');
      for (const rule of sheet.sheet.cssRules) out.push(readBlock(rule.style));
      const rule = sheet.sheet.cssRules[0];
      rule.style.cssText = 'color: var(--c) !important; padding: var(--p) !important';
      out.push(readBlock(rule.style));
      for (const [name, value] of [
        ['padding', 'var(--p)'],
        ['color', 'var(--c)'],
        ['border', 'var(--b)'],
        ['--x', '1px'],
      ]) {
        const el = d.createElement('div');
        el.style.setProperty(name, value, 'important');
        rule.style.setProperty(name, value, 'important');
        out.push(readBlock(el.style), readBlock(rule.style));
      }
      return out;
    },
    { jsdom },
  );

// Where those versions start (#141; 27.0.1 and 27.1.0 measured with a
// single-jsdom install of each release): the style attribute drops the
// !important from 27.0.1, style sheets from 27.1.0; cssstyle 4.1.0 keeps
// a custom property's, 4.6.0 drops it.
test('style: var() with !important by jsdom and cssstyle version', () => {
  const read = (profile) => {
    const w = createWindow(profile);
    const el = w.document.createElement('div');
    el.setAttribute('style', 'padding: var(--p) !important; --x: 1px !important');
    const sheet = w.document.head.appendChild(w.document.createElement('style'));
    sheet.textContent = '.r { padding: var(--p) !important; --x: 1px !important }';
    const border = w.document.createElement('div');
    border.setAttribute('style', 'color: red; border: var(--b)');
    return [el.style.cssText, sheet.sheet.cssRules[0].style.cssText, border.style.cssText];
  };
  const both = 'padding: var(--p) !important; --x: 1px !important;';
  const dropped = 'padding: var(--p); --x: 1px !important;';
  const custom = (cssstyle) => {
    const el = createWindow({ jsdom: '26.1.0', cssstyle }).document.createElement('div');
    el.setAttribute('style', '--x: 1px !important');
    return el.style.cssText;
  };
  assert.equal(custom('4.1.0'), '--x: 1px !important;');
  assert.equal(custom('4.6.0'), '--x: 1px;');
  assert.deepEqual(read({ jsdom: '26.1.0', cssstyle: '4.6.0' }), [
    'padding: var(--p) !important; --x: 1px;',
    both,
    'color: red; border: var(--b);',
  ]);
  assert.deepEqual(read({ jsdom: '27.0.1' }), [dropped, both, '']);
  assert.deepEqual(read({ jsdom: '27.1.0' }), [dropped, dropped, '']);
  assert.deepEqual(read({ jsdom: '28.1.0' }), [dropped, dropped, '']);
  assert.deepEqual(read({ jsdom: '29.1.1' }), [dropped, dropped, 'color: red; border: var(--b);']);
  assert.deepEqual(read({ jsdom: '30.1.3' }), [both, both, 'color: red; border: var(--b);']);
});

// A priority token left over after the declaration's !important (#154
// review, black box, jsdom 27.4.0 to 30.1.3): the style attribute, an
// element's cssText and a rule's cssText drop the declaration (color:
// var(--c) !important !important, var(--c) !, var(--c) !important !foo);
// one in quotes, in a function, in a [] or {} block or escaped (\!) is
// part of the value. setProperty keeps it as written, as before.
const STRAY_PRIORITY = [
  'var(--c) !important !important',
  'var(--c)!important!important',
  'var(--c) ! important ! important',
  'var(--c) !IMPORTANT !important',
  'var(--c) !',
  'var(--c) !important !foo',
  'var(--c, "!important") !important',
  'var(--c, a !important)',
  'f(!important) var(--c)',
  '[!important]',
  '{!important}',
  'a [b !important] c',
  '[!] !important',
  '[!important] !important',
  '{!important} !important',
  'foo\\!important bar',
  'before \\!important after',
  'var(--c) \\!important \\!x',
];
for (const jsdom of [30, 29, 28, 27])
  parity(
    `style: a priority token left over (jsdom ${jsdom})`,
    (w) => {
      const d = w.document;
      const out = [];
      d.head.innerHTML = '<style>.r { top: 0 }</style>';
      const rule = d.styleSheets[0].cssRules[0].style;
      for (const name of ['color', 'margin', '--x'])
        for (const value of STRAY_PRIORITY) {
          const text = `${name}: ${value}; left: 1px`;
          const el = d.createElement('div');
          el.setAttribute('style', text);
          const set = d.createElement('div');
          set.style.cssText = text;
          const prop = d.createElement('div');
          prop.style.setProperty(name, value);
          rule.cssText = text;
          out.push(`${text} | ${el.style.cssText} | ${set.style.cssText} | ${prop.style.cssText} | ${rule.cssText}`);
        }
      return out;
    },
    { jsdom },
  );
// The default profile (the latest jsdom) keeps a ! that is in a block or
// escaped (#154, #155 review; jsdom 30.1.3 black box).
test('style: a ! in a block or escaped is part of the value (default profile)', () => {
  const d = createWindow().document;
  for (const value of ['[!important]', '{!important}', 'foo\\!important bar', 'before \\!important after']) {
    const el = d.createElement('div');
    el.setAttribute('style', `--x: ${value}`);
    assert.equal(el.style.cssText, `--x: ${value};`);
    el.style.cssText = `--x: ${value}; left: 1px`;
    assert.equal(el.style.cssText, `--x: ${value}; left: 1px;`);
  }
});
