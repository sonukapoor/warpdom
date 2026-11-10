// Inline style serialization by jsdom version (black box): border and its
// sides, clip, outline, properties an old cssstyle does not know, values it
// drops; and getComputedStyle with a pseudo-element.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWindow } from '../src/node.js';
import { reserializeCustom } from '../src/custom-value.js';
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
      // Without a this value: reported from jsdom 24.
      const { getComputedStyle } = w;
      getComputedStyle(p, '::before');
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
    ...Array(4).fill('Not implemented: window.getComputedStyle(elt, pseudoElt)'),
    ...Array(4).fill("Not implemented: Window's getComputedStyle() method: with pseudo-elements"),
  ]);
});

parity("getComputedStyle with a pseudo-element: the element's style, reported (jsdom 30)", (w) => {
  const p = w.document.body.appendChild(w.document.createElement('p'));
  return [w.getComputedStyle(p, '::after').display, w.getComputedStyle(p, ' ').display];
});

// jsdom 20 to 23 report the pseudo-element on the method's this value:
// called without one (as a bare getComputedStyle() is where the global is
// jsdom's window, in Jest) nothing is reported; jsdom 24 to 30 report it
// on their window (black box; 24 to 26 print the report's stack on the
// default virtual console, so the test above covers them). Grafana's
// drawers measure document.body's ::-webkit-scrollbar (@rc-component/util
// getScrollBarSize) and its tests fail on any console output.
for (const jsdom of [20, 22, 30]) {
  parity(
    `getComputedStyle with a pseudo-element, called without a this value (jsdom ${jsdom})`,
    (w) => {
      const p = w.document.body.appendChild(w.document.createElement('p'));
      const { getComputedStyle } = w;
      return [
        getComputedStyle(p, '::-webkit-scrollbar').display,
        getComputedStyle.call(null, p, '::before').display,
        getComputedStyle.call(undefined, p, null).display,
      ];
    },
    { jsdom },
  );
}

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
  // Separators (#134): any JavaScript whitespace before jsdom 27 (a vertical
  // tab, a no-break space too), CSS whitespace from 27 (CR and form feed).
  'fixed\r\nno-repeat',
  'fixed\rno-repeat',
  'fixed\fno-repeat',
  'red\furl(a.png)',
  'url(a.png)\rred',
  'url(a.png)\f0\f0',
  'url(a.png) center\f/\fcover',
  '\fred\r',
  'red\vblue',
  'red\u00a0blue',
  // url() components (#134) that each generation reads alike.
  'url(a.png)junk',
  'url(a.png) junk',
  'url( a.png )',
  'url( "a.png")',
  'url("a b.png")',
  "url('a\"b.png')",
  'url("")',
  'URL(a.png)',
];
// A zero written otherwise, where jsdom 27 to 29 set every longhand to its
// initial value (cssText lists them; not modeled; 0 0, top left and the
// other lost positions are, #264 item 47).
const ALL_INITIAL = new Set(['-0', '00']);
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

// Keywords, boxes and sizes in the background shorthand, jsdom 27 and later
// (black box, 27.4.0 to 30.1.3, #264 item 47): a value of initial values only
// sets them as the longhands (none and transparent as written); text and
// border-area are clip boxes only (padding-box text); one box is both, two
// equal boxes one; the boxes come before the attachment; a size of auto, and
// a second auto, are left out; jsdom 27 and 28 read background as the color
// when there is no image, and reject two boxes.
const BACKGROUND_KEYWORDS = [
  'REPEAT',
  'repeat',
  'SCROLL',
  'TEXT',
  'BORDER-AREA',
  'REPEAT-X',
  'FIXED',
  'LEFT',
  'None',
  'TRANSPARENT',
  '0% 0%',
  'content-box',
  'border-box',
  'padding-box border-box',
  'border-box border-box',
  'content-box padding-box',
  'text border-box',
  'content-box text',
  'border-area',
  'fixed content-box',
  'local text',
  'fixed border-box padding-box',
  'left / auto',
  'left / AUTO',
  'left / auto auto',
  'left / 10px auto',
  'left / auto 10px',
  'left / auto fixed',
  'left top / auto',
  'red left top / auto',
  '0% 0% / auto',
  'red',
  'red fixed',
  'url(a.png) red',
  'repeat-x red',
  'red, blue',
  // A comma in a color function is no layer separator (#288 review).
  'fixed #ff0000',
  'fixed hsl(0, 100%, 50%)',
  'repeat rgb(1,2,3)',
  'fixed rgb(1, 2, 3), blue',
];
for (const jsdom of [27, 28, 29, 30, '30.1.3'])
  parity(
    `style: keywords, boxes and sizes in the background shorthand (jsdom ${jsdom})`,
    (w) =>
      BACKGROUND_KEYWORDS.flatMap((value) => {
        const set = w.document.createElement('div').style;
        set.background = value;
        const text = w.document.createElement('div').style;
        text.cssText = `background: ${value}`;
        return [
          value,
          set.background,
          set.backgroundOrigin,
          set.backgroundClip,
          set.backgroundSize,
          set.cssText,
          text.cssText,
        ];
      }),
    { jsdom },
  );

// A computed style's background of initial values alone (repeat, scroll,
// 0% 0%) after another: jsdom 27 and 28.0.0 leave what a fresh computed
// style reads, 28.1.0 and later throw (#288 review).
for (const jsdom of [27, 28, 29, 30])
  parity(
    `style: a computed background of initial values alone (jsdom ${jsdom})`,
    (w) =>
      ['repeat', 'scroll', '0% 0%'].map((value) => {
        const el = w.document.body.appendChild(w.document.createElement('div'));
        const fresh = w.getComputedStyle(w.document.body.appendChild(w.document.createElement('div'))).background;
        const cs = w.getComputedStyle(el);
        cs.background = 'red';
        try {
          cs.background = value;
        } catch (error) {
          return `${value}: ${error.name}`;
        }
        return `${value}: ${cs.background === fresh ? 'as a fresh one' : cs.background}`;
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

// A malformed url() component is invalid before jsdom 27 and leaves the
// declared background in place (#134): an unclosed quote or url(, text after
// the closing parenthesis, whitespace inside (not after url(), a quote or,
// before cssstyle 4.4, an escaped quote. jsdom 27 and later read these as CSS
// tokens (url("a.png) is url("a.png)")): not modeled.
const MALFORMED_URLS = [
  'url("a.png)',
  "url('a.png)",
  'red url("a.png)',
  'url(a.png',
  'url(a.png)red',
  'url(a.png)0',
  'url(a.png)/x',
  'url("a.png")junk',
  'url("a.png"x)',
  'url("a.png" )',
  'url(a.png )',
  'url(a.png\t)',
  'url(a.png\r\n)',
  'url(a b.png)',
  'url(a.png x)',
  'url(a"b.png)',
  "url(a'b.png)",
  'url("a.png""b")',
  'url("a.png\'")',
  'url(a\\ b.png) red',
  'url("a\\"b.png")',
  'url(\fa.png)',
  'url(a.png)\fjunk',
];
for (const jsdom of [26, 25, 22, 20])
  parity(
    `style: a malformed url() in the background shorthand (jsdom ${jsdom})`,
    (w) =>
      MALFORMED_URLS.flatMap((value) => {
        const s = w.document.createElement('div').style;
        s.background = 'red';
        s.background = value;
        const text = w.document.createElement('div').style;
        text.cssText = `background: ${value}`;
        return [`${value} -> ${s.cssText}`, text.cssText];
      }),
    { jsdom },
  );

test('style: separators and malformed url() in the background shorthand with cssstyle 4.2 to 4.5 (#134)', () => {
  const write = (cssstyle, value) => {
    const s = createWindow({ jsdom: '26.1.0', cssstyle }).document.body.style;
    s.background = 'red';
    s.background = value;
    return s.cssText;
  };
  // Measured with jsdom 26.1.0 and each cssstyle.
  const withImage = {
    '4.2.0': 'background: red url(a.png);',
    '4.3.1': 'background: red url("a.png");',
    '4.4.0': 'background: url("a.png") red;',
    '4.5.0': 'background: url("a.png") red;',
  };
  for (const cssstyle of Object.keys(withImage)) {
    const old = cssstyle < '4.4';
    assert.equal(write(cssstyle, 'fixed\r\nno-repeat'), 'background: no-repeat fixed;');
    assert.equal(write(cssstyle, 'fixed\fno-repeat'), 'background: no-repeat fixed;');
    assert.equal(write(cssstyle, 'red\vblue'), old ? 'background: blue;' : 'background: red;');
    assert.equal(write(cssstyle, 'url(a.png)\fred'), withImage[cssstyle]);
    for (const value of ['url("a.png)', 'url(a.png)junk', 'url(a.png', 'url(a b.png)', 'url("a.png" )', 'url(a.png)/x'])
      assert.equal(write(cssstyle, value), 'background: red;', `${cssstyle} ${value}`);
    assert.equal(write(cssstyle, 'url("a\\"b.png")'), old ? 'background: red;' : 'background: url("a\\"b.png");');
  }
});

// A url() component rejected only for an escaped ', (, ), space, tab, line
// feed, carriage return or form feed (#163, black box): with cssstyle 4.4
// to 4.6 (jsdom 23.2, 24.1 and 26.1 alike), the first time a process meets
// it, it sets no image; the other longhands are removed, the background
// image kept (url("a\'b.png") after background: red declares nothing; red
// url("a\'b.png") is background: red). Later it is invalid, unless it has
// an escaped carriage return or form feed. Before cssstyle 4.4 invalid.
// Each test has its own url()s: jsdom's cache and warpdom's are per process.
const escapedUrls = (p) => [
  `url("${p}\\'b.png")`,
  `url('${p}\\'b.png')`,
  `url(${p}\\'b.png)`,
  `url(\\'${p}.png)`,
  `url("${p}\\(b.png")`,
  `url(${p}\\(b.png)`,
  `url("${p}\\)b.png")`,
  `url(${p}\\)b.png)`,
  `url('${p}\\)b.png')`,
  `url("${p}\\ b.png")`,
  `url(${p}\\ b.png)`,
  `url("${p}\\\tb.png")`,
  `url(${p}\\\tb.png)`,
  `url("${p}\\\nb.png")`,
  `url("${p}\\\rb.png")`,
  `url("${p}\\\fb.png")`,
  `url( "${p}\\'c.png")`,
];
const ESCAPED_PRELUDE = 'color: blue; background: red; background-repeat: no-repeat';
// all: with the other components, setProperty, cssText and background-image
// (jsdom 26); older versions have quirks of their own there (#163: not modeled).
function escapedUrlScenario(w, p, all = true) {
  const style = (text = ESCAPED_PRELUDE) => {
    const s = w.document.createElement('div').style;
    s.cssText = text;
    return s;
  };
  const out = [];
  const write = (s, value, how = 'set') => {
    if (how === 'set') s.background = value;
    else s.setProperty('background', value, how);
    return s.cssText;
  };
  // Each one twice: first, then cached (a carriage return or form feed: never cached).
  for (const value of escapedUrls(p))
    if (all || !/\\[\r\f]/.test(value))
      out.push(`${JSON.stringify(value)} -> ${write(style(), value)} | ${write(style(), value)}`);
  if (!all) return out;
  // With other components, or through setProperty and cssText (quoted).
  const u = (id, escaped = "'") => `url("${p}-${id}\\${escaped}b.png")`;
  out.push(write(style(), `red ${u(1)}`), write(style(), `red ${u(1)}`));
  out.push(write(style(), `${u(2, ' ')} no-repeat`), write(style('color: blue'), `${u(3, '(')} fixed 10px Red`));
  out.push(write(style(), `green ${u(4)}`, 'important'), write(style(), u(4), ''));
  // (An invalid declaration in cssText removes an earlier one of its property: not modeled.)
  for (const value of [u(5), `red ${u(6, ')')}`])
    out.push(
      style(`color: blue; background: green; background: ${value}; width: 1px`).cssText,
      style(`color: blue; background: ${value}; width: 1px`).cssText,
    );
  // Combined with a component that is invalid or given twice: invalid, and the url() is met.
  out.push(write(style(), `${u(7)} none`), write(style(), `${u(7)} url(b.png)`), write(style(), u(7)));
  out.push(write(style(), `${u(8)} bogus`), write(style(), u(8)));
  // The background image the declaration had stays.
  out.push(
    write(style('background-color: red; background-image: url(x.png) !important; color: blue'), `${u(9)} no-repeat`),
    write(style('background: url(x.png) fixed'), u(10)),
    write(style('background-image: none'), `red ${u(11)}`),
  );
  // background-image meets it too (its own value is not modeled).
  style().backgroundImage = u(12);
  style().setProperty('background-image', u(13, '('));
  out.push(write(style(), u(12)), write(style(), u(13, '(')));
  // Unquoted, an escaped quote or parenthesis is in the url() (#191 review).
  out.push(write(style(), `url(${p}-14\\(b.png) no-repeat`), write(style(), `url(${p}-14\\(b.png) no-repeat`));
  out.push(write(style(), `url(${p}-15\\'b.png) fixed`), write(style(), `no-repeat url(${p}-16\\'b.png) fixed`));
  // A style attribute is parsed when set, before the style is read (its
  // url()s are met then); set to the value it has, it is not parsed again.
  const element = (text) => {
    const e = w.document.createElement('div');
    e.setAttribute('style', text);
    return e;
  };
  const lazy = element(`color: blue; background: ${u(17)}`);
  out.push(write(style(), u(17)), lazy.style.cssText);
  const again = element(`color: blue; background: red ${u(18, '(')} no-repeat`);
  out.push(again.style.cssText);
  again.setAttribute('style', again.getAttribute('style'));
  out.push(again.style.cssText);
  again.setAttribute('style', `${again.getAttribute('style')} `);
  out.push(again.style.cssText);
  const read = w.document.createElement('div');
  void read.style;
  read.setAttribute('style', `background: ${u(19, ' ')} fixed`);
  out.push(read.style.cssText, element(`background: ${u(19, ' ')} fixed`).style.cssText);
  const twice = element(`background: ${u(20)} fixed`);
  twice.setAttribute('style', `background: ${u(20)} fixed`);
  out.push(twice.style.cssText);
  // Parsed markup is parsed as set; an element without an inline style
  // (not HTML or SVG) does not meet its url() (#191 review).
  const host = w.document.createElement('div');
  host.innerHTML = `<div style='color: blue; background: ${u(22, '(')} no-repeat'></div>`;
  out.push(write(style(), `${u(22, '(')} no-repeat`), host.firstChild.style.cssText);
  w.document.createElementNS('urn:x', 'x').setAttribute('style', `background: ${u(23, '(')}`);
  out.push(write(style(), u(23, '(')));
  // The same through the XML parser (an SVG document from DOMParser).
  const svg = new w.DOMParser().parseFromString(
    `<svg xmlns="http://www.w3.org/2000/svg"><rect style='color: blue; background: ${u(24, '(')} fixed'/></svg>`,
    'image/svg+xml',
  );
  out.push(write(style(), `${u(24, '(')} fixed`), svg.documentElement.firstChild.style.cssText);
  // An earlier !important background-color is removed (#191 review).
  out.push(element(`background-color: red !important; background: ${u(21)}`).style.cssText);
  // A hex escape and an unescaped quote or space are invalid; escaped
  // double quotes are kept (#134).
  for (const value of [`url("${p}\\62 .png")`, `url("${p}'b.png")`, `url("${p} b.png")`, `url("${p}\\"b.png")`])
    out.push(write(style(), value));
  return out;
}
for (const jsdom of [26, 25, 22, 20])
  parity(
    `style: a url() with an escaped quote, parenthesis or space in the background shorthand (jsdom ${jsdom}, #163)`,
    (w) => escapedUrlScenario(w, `e${jsdom}`, jsdom === 26),
    { jsdom },
  );

test('style: a url() with an escaped quote in the background shorthand with cssstyle 4.4 to 4.6 (#163)', () => {
  // Measured with jsdom 23.2.0 and 24.1.3 (cssstyle 4.6.0), and 26.1.0 with 4.4.0 and 4.5.0.
  for (const options of [
    { jsdom: '23.2.0', cssstyle: '4.6.0' },
    { jsdom: '24.1.3', cssstyle: '4.6.0' },
    { jsdom: '26.1.0', cssstyle: '4.4.0' },
    { jsdom: '26.1.0', cssstyle: '4.5.0' },
  ]) {
    const w = createWindow(options);
    const p = `${options.jsdom}-${options.cssstyle}`;
    const write = (value, text = ESCAPED_PRELUDE) => {
      const s = w.document.createElement('div').style;
      s.cssText = text;
      s.background = value;
      return s.cssText;
    };
    const unchanged = `${ESCAPED_PRELUDE};`;
    for (const value of escapedUrls(p)) {
      assert.equal(write(value), 'color: blue;', `${p} ${value}`);
      assert.equal(write(value), /\\[\r\f]/.test(value) ? 'color: blue;' : unchanged, `${p} ${value} again`);
    }
    const [quote, , , , paren, , , , , space] = escapedUrls(`${p}-2`);
    assert.equal(write(`red ${quote}`), 'color: blue; background: red;');
    assert.equal(write(`red ${quote}`), unchanged);
    assert.equal(write(`${space} no-repeat`), 'color: blue; background: no-repeat;');
    assert.equal(
      write(`${paren} 10px`, 'background-image: url(x.png); color: blue'),
      'color: blue; background: url("x.png") 10px;',
    );
    assert.equal(write(`url("${p}\\62 .png")`), unchanged);
    // Unquoted (#191 review).
    assert.equal(write(`url(${p}-3\\(b.png) no-repeat`), 'color: blue; background: no-repeat;');
    assert.equal(write(`url(${p}-3\\'b.png) fixed`), 'color: blue; background: fixed;');
    // A style attribute is parsed when set, not again when set to the value it has.
    const [fresh] = escapedUrls(`${p}-4`);
    const e = w.document.createElement('div');
    e.setAttribute('style', `color: blue; background: red ${fresh}`);
    assert.equal(write(fresh), unchanged);
    e.setAttribute('style', e.getAttribute('style'));
    assert.equal(e.style.cssText, 'color: blue; background: red;');
  }
  // Before cssstyle 4.4: invalid.
  const w = createWindow({ jsdom: '26.1.0', cssstyle: '4.3.1' });
  const s = w.document.createElement('div').style;
  s.cssText = ESCAPED_PRELUDE;
  s.background = `url("old\\'b.png")`;
  assert.equal(s.cssText, `${ESCAPED_PRELUDE};`);
});

// Whitespace after url( that the unquoted body also accepts (CR, form feed,
// vertical tab, no-break space) is read in linear time (#150 review: 32768
// carriage returns took about 0.8 s per assignment).
test('style: a malformed url() after long whitespace in the background shorthand is rejected quickly', () => {
  const values = ['\r', '\f', '\v', ' '].flatMap((ws) => [
    `url(${ws.repeat(32768)}a.png)junk`,
    `url(${ws.repeat(32768)}"a.png")junk`,
  ]);
  for (const options of [
    { jsdom: '20.0.3', cssstyle: '2.3.0' },
    { jsdom: '26.1.0', cssstyle: '4.3.1' },
    { jsdom: '26.1.0' },
  ]) {
    const window = createWindow(options);
    for (const value of values) {
      const s = window.document.createElement('div').style;
      s.background = 'red';
      const start = performance.now();
      s.background = value;
      const elapsed = performance.now() - start;
      assert.equal(s.cssText, 'background: red;');
      assert.ok(elapsed < 200, `${JSON.stringify(options)} ${JSON.stringify(value.slice(0, 5))}: ${elapsed} ms`);
    }
  }
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
// A ! and one ident at the end of a value is !important, any other ! left
// at the top level drops the declaration (black box, jsdom 27.4.0 to
// 30.1.3, #264 item 65): in the style attribute, cssText and a rule's
// cssText from 27, in a style sheet from 29 (27 and 28's sheets keep a
// custom property's as written and drop another's). setProperty keeps it
// as written; var() loses the priority in 27 to 29, as with !important.
const IDENT_BANGS = [
  'a !b',
  'a ! b',
  'a!b',
  'a !-b',
  'a !--b',
  'a !_b',
  'a !é',
  'a !\\62',
  'a ! /**/ b',
  'a !b/**/',
  'a !b ',
  'a !B',
  'var(--c) !foo',
  'a !',
  'a !b c',
  'a !b!c',
  'a !b !important',
  'a !1',
  'a !-',
  'a !b(c)',
  'a !"s"',
  '!b',
  '(a !b)',
  '"!b"',
  // A comment ends at its first */; a hex escape takes one whitespace
  // after it (#293 review).
  'a !b/**/ c',
  'a !b /* x */ /* y */',
  'a !\\62 c',
  'a !\\62  c',
  'a !b\\62 c',
  'a !\\62\tc',
  'a !\\000062c',
  'a !\\0000062 c',
  'a !\\,b',
  // A no-break space is a name character, but jsdom trims it before the !
  // too (#293 review).
  'a\u00a0 !b',
  'a !\u00a0b',
  'a !b\u00a0',
  // A block closes at its own closer only, and an unquoted url() is one
  // token; an escaped ! is part of an ident (#293 review).
  'a [) !b]',
  'a (] !b)',
  'url(a]!b)',
  'url(a[b) !foo',
  'a !b\\!important',
  'a !b\\\\!important',
];
for (const jsdom of [27, 28, 29, 30])
  parity(
    `style: a ! and an ident at the end of a value (jsdom ${jsdom}, #264 item 65)`,
    (w) => {
      const d = w.document;
      const out = [];
      d.head.innerHTML = '<style>.r { top: 0 }</style>';
      const rule = d.styleSheets[0].cssRules[0].style;
      for (const name of ['color', '--x'])
        for (const raw of IDENT_BANGS) {
          const value = name === 'color' ? raw.replace(/^a\b/, 'red') : raw;
          const text = `${name}: ${value}; left: 1px`;
          const el = d.createElement('div');
          el.setAttribute('style', text);
          const set = d.createElement('div');
          set.style.cssText = text;
          const prop = d.createElement('div');
          prop.style.setProperty(name, value);
          rule.cssText = text;
          // (jsdom 29 and later log "Could not parse CSS stylesheet" for
          // some of these sheets, which warpdom does not: #264 item 67)
          const log = console.error;
          console.error = () => {};
          const sheet = d.createElement('style');
          sheet.textContent = `p { ${text} } q { color: red }`;
          d.head.appendChild(sheet);
          console.error = log;
          const rules = [...sheet.sheet.cssRules].map((r) => r.cssText).join(' ');
          sheet.remove();
          out.push(
            `${text} | ${el.style.cssText} | ${set.style.cssText} | ${prop.style.cssText} | ${rule.cssText} | ${rules}`,
          );
        }
      return out;
    },
    { jsdom },
  );
// At the end of the text (nothing after it to escape or close): an
// !important inside a comment that runs to the end is no priority, a !b
// before it is the stray one (black box, 27.4.0 to 30.1.3; #293 review).
for (const jsdom of [27, 28, 29, 30])
  parity(
    `style: an !important inside an unclosed comment (jsdom ${jsdom}, #264 item 65)`,
    (w) =>
      ['--x', 'color'].flatMap((name) =>
        [
          'a !b /* !important',
          'a /* !important',
          'a !b /* !important */',
          'a !b /* x',
          // A backslash at the end escapes U+FFFD (jsdom 30), a line break
          // ends a string, a quote in an unquoted url() opens none (#293
          // review).
          'a !b\\',
          'url("a\n) !foo',
          'url("a\n) !foo bar',
          'url(a"b) ")!x" !foo',
          'url("a\n) !b /* !important',
          '"a\n !b /* !important',
          // (#url(, @url( and an escape before url( start no url(: #293
          // review)
          '#url(a") !b")',
          '@url(a") !b")',
          'a\\ url(a")!b")',
          '\\61 url(a") !b")',
          // (CR LF ends a hex escape as one; a backslash before a line break
          // escapes nothing: #293 review)
          '\\61\r\nurl(a") !b")',
          'a\\\nurl(a"b) !foo',
          // (only a backslash at the very end: one before a line break,
          // trimmed or not, escapes nothing; #293 review)
          'a !important\\\n',
          'a !important\\\r\n',
          'a !important\\\f',
          'a\\\n!important\\\n',
          'a !important\\',
          // (an escaped space or tab the trim takes stays escaped, except at
          // the end of the text in jsdom 27 and 28; #293 review)
          'a !b\\ ',
          'a !b\\\t',
          'a !important\\ ',
          'a !b\\  ',
          'a !b\\ ; left: 1px',
          'a !b\\ ;',
          // (what JavaScript trims and CSS doesn't: an escaped or non-ASCII
          // one is part of the ident, a vertical tab ends it; #293 review)
          'a !b\\\u00a0',
          'a !b\\\u2003; left: 1px',
          'a !b\\\ufeff',
          'a !b\\\v',
          'a !b\v',
          'a !b\v; left: 1px',
          'a !b\u00a0',
        ].map((raw) => {
          const value = name === 'color' ? raw.replace(/^a\b/, 'red') : raw;
          const el = w.document.createElement('div');
          el.setAttribute('style', `${name}: ${value}`);
          const set = w.document.createElement('div');
          set.style.cssText = `${name}: ${value}`;
          return [name, value, el.style.cssText, set.style.cssText];
        }),
      ),
    { jsdom },
  );
// Comments after a ! are read in linear time (#293 review: a regular
// expression backtracked exponentially, 108 ms on 24 comments).
test('style: many comments after a ! are read quickly', () => {
  // (24: V8 leaves a long backtracking run to its linear engine, so a
  // count in the thousands would not show it)
  const d = createWindow().document;
  const e = d.createElement('div');
  const start = performance.now();
  e.style.cssText = `--x: a !${'/**/'.repeat(24)}1; color: red`;
  const elapsed = performance.now() - start;
  assert.equal(e.style.cssText, 'color: red;');
  assert.ok(elapsed < 50, `${elapsed} ms`);
});
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
// A comment is not a priority token, and var() in a string is not a
// var() function (#154 review, black box, jsdom 27.4.0 to 30.1.3): --x:
// red /*!important*/ is kept; border: "var(--b)" is an invalid border,
// not one with var() that empties the block (27, 28), and font-family:
// "var(--face)" !important keeps its !important from 28 (27 drops it for
// content: "var(--x)" !important, but not for font-family or
// background-image, which is not modeled).
const COMMENTS_AND_STRINGS = [
  '--x: red /*!important*/',
  '--x: 1 /* !important */ !important',
  'color: var(--c) /*!important*/',
  'color: var(--c) /* !important */ !important',
  'color: red; border: "var(--b)"; width: 1px',
  'content: "var(--x)" !important',
  'background-image: url(var(--image).png) !important',
];
const STRINGS_FROM_28 = [
  'font-family: "var(--face)" !important',
  'font-family: a, "var(--face)" !important',
  'background-image: url("var(--image).png") !important',
];
for (const jsdom of [30, 29, 28, 27])
  parity(
    `style: comments and strings are not priority tokens or var() (jsdom ${jsdom})`,
    (w) => {
      const d = w.document;
      const out = [];
      for (const text of jsdom >= 28 ? [...COMMENTS_AND_STRINGS, ...STRINGS_FROM_28] : COMMENTS_AND_STRINGS) {
        const el = d.createElement('div');
        el.setAttribute('style', `${text}; margin: 0px`);
        const set = d.createElement('div');
        set.style.cssText = text;
        out.push(`${text} | ${el.style.cssText} | ${set.style.cssText}`);
      }
      const prop = d.createElement('div');
      prop.style.setProperty('font-family', '"var(--face)"', 'important');
      if (jsdom >= 28) out.push(prop.style.cssText);
      return out;
    },
    { jsdom },
  );

// A unitless zero with an exponent in the border shorthands is a 0px
// width in jsdom 26 and 30, as 0 is (black box, 26.1.0 and 30.1.3, #264
// item 73). 0e+1 and 00 stay invalid.
const ZERO_EXPONENT_BORDERS = [
  ['border', '0e0 solid'],
  ['border', '0e1'],
  ['border', '0e-1 solid red'],
  ['border', '+0e0 solid'],
  ['border', '-0e0 solid'],
  ['border', '0.0e0 solid'],
  ['border', 'solid 0E0'],
  ['border-top', '0e0'],
  ['border-left', '0E0 solid'],
  ['border-bottom', '0e0 dashed blue'],
  ['border', '0e0px solid'],
  ['border', '1e0px solid'],
  ['border', '0e+1 solid'],
  ['border', '00 solid'],
];
for (const jsdom of [26, 30])
  parity(
    `style: a zero with an exponent in the border shorthands is 0px (jsdom ${jsdom}, #264 item 73)`,
    (w) =>
      ZERO_EXPONENT_BORDERS.map(([name, value]) => {
        const d = w.document;
        const attribute = d.createElement('div');
        attribute.setAttribute('style', `${name}: ${value}`);
        const set = d.createElement('div');
        set.style.setProperty(name, value);
        return [name, value, attribute.style.cssText, set.style.cssText];
      }),
    { jsdom },
  );

// jsdom 27 to 29 reject 0e0 as a length (#264 item 91): until that is
// modeled, their profiles keep main's reading, not 26 and 30's 0px (#297
// review).
test('style: a zero with an exponent in border is left alone in jsdom 27 to 29 (#264 item 91)', () => {
  for (const jsdom of ['27.4.0', '28.1.0', '29.1.1']) {
    const e = createWindow({ jsdom }).document.createElement('div');
    e.style.setProperty('border', '0e0 solid');
    assert.equal(e.style.getPropertyValue('border'), '0 solid', jsdom);
  }
});

// jsdom 26 takes a font of a size and no family, as the size and what
// comes before it (black box, 26.1.0, #264 item 63); not with a line
// height or without a size. (0 is 0px there and 01 1px is 1px: #264 item
// 83; its longhands in cssText and length: item 78.)
parity(
  'style: a font of a size alone (jsdom 26, #264 item 63)',
  (w) =>
    [
      '1px',
      '10%',
      '1.5em',
      '1e39px',
      '1e400px',
      'BOLD 1px',
      'italic 1px',
      'LARGE',
      'calc(1px)',
      '1px ',
      '1px/2',
      'bold',
      '-1px',
      '12px Arial',
      '1e400px Arial',
    ].map((v) => {
      const out = [v];
      for (const set of ['property', 'attribute']) {
        const e = w.document.createElement('div');
        if (set === 'property') e.style.setProperty('font', v);
        else e.setAttribute('style', `font: ${v}`);
        const s = e.style;
        out.push([s.getPropertyValue('font'), s.fontStyle, s.fontWeight, s.fontSize, s.lineHeight, s.fontFamily]);
      }
      return out;
    }),
  { jsdom: 26 },
);

// jsdom 26 reads a unitless zero size after keywords alone as 0px, and
// sets the longhands from it (black box, 26.1.0, #264 item 83). A number
// before it, or a line height after it, is left (item 83); font-variant
// and small-caps are item 97.
parity(
  'style: a unitless zero font size after keywords is 0px (jsdom 26, #264 item 83)',
  (w) =>
    [
      '0 Arial',
      '0',
      'BOLD 0 SERIF',
      'italic 0 Arial',
      'normal 0 Arial',
      'condensed 0 Arial',
      'italic bold 0 Arial',
      'bold 0',
      '0 bold',
      '0 serif',
      '0 "A B", serif',
      '0.0 Arial',
      '-0 Arial',
      '+0 Arial',
      '0e0 Arial',
      '.0 Arial',
      '0. Arial',
      '0e1 Arial',
      // (an exponent with a + or a leading zero is invalid, and a value
      // with var() is kept as written; #306 review)
      '0e+1 Arial',
      '0e01 Arial',
      '0e-01 Arial',
      '0 Arial, var(--f)',
      // (leading zeros are invalid; a family named Large is no size)
      '00 Arial',
      '000 serif',
      '0 Arial, Large',
    ].map((v) => {
      const out = [v];
      for (const set of ['property', 'attribute']) {
        const e = w.document.createElement('div');
        if (set === 'property') e.style.setProperty('font', v);
        else e.setAttribute('style', `font: ${v}`);
        const s = e.style;
        out.push([s.getPropertyValue('font'), s.fontStyle, s.fontWeight, s.fontSize, s.lineHeight, s.fontFamily]);
      }
      return out;
    }),
  { jsdom: 26 },
);

// A family given twice in font is left out after its first (as written:
// "A" and A, a and A differ; Open Sans and Open  Sans do not); font-family
// keeps it. Black box, 27.4.0 to 30.1.3 (#264 item 86).
for (const jsdom of [27, 28, 29, 30])
  parity(
    `style: a family given twice in font (jsdom ${jsdom}, #264 item 86)`,
    (w) =>
      [
        ['font', '12px A,B,A'],
        ['font', '12px A,A,SERIF'],
        ['font', '12px a,A'],
        ['font', '12px "A",A'],
        ['font', '12px serif,SERIF'],
        ['font', '12px Open Sans, Open  Sans'],
        ['font', '12px A, B, a'],
        ['font', '12px var(--a),A,A'],
        ['font-family', 'A, B, A'],
      ].map(([name, value]) => {
        const e = w.document.createElement('div');
        e.style.setProperty(name, value);
        return [name, value, e.style.getPropertyValue(name), e.style.fontFamily, e.style.cssText];
      }),
    { jsdom },
  );

// Keywords jsdom 26 takes in some properties, fewer than the grammar
// (black box, 26.1.0, #264 item 77): a side's border style is no none or
// hidden; float, font-style, background-attachment and background-repeat
// one keyword of an older list; width, height, flex-basis and flex not the
// newer sizes (contain, stretch, fit-content()).
const JSDOM26_KEYWORDS = {
  'border-top-style': ['none', 'hidden', 'dotted', 'solid', 'outset', 'SOLID', 'inherit', 'solid dashed'],
  'border-left-style': ['none', 'hidden', 'groove'],
  'border-style': ['none', 'hidden', 'solid none'],
  width: [
    'contain',
    'stretch',
    'fit-content',
    'min-content',
    'max-content',
    'fit-content(10px)',
    'auto',
    '10px',
    '-webkit-fill-available',
    'inherit',
  ],
  height: ['contain', 'stretch', 'fit-content', 'auto', 'fit-content(\n10px)'],
  'flex-basis': ['contain', 'content', 'auto', 'fit-content', 'min-content', '10px'],
  flex: ['contain', 'content', 'auto', 'none', '1 1 contain', '1 1 content'],
  float: ['top', 'bottom', 'left', 'right', 'none', 'inline-start', 'inline-end', 'snap-block', 'LEFT'],
  'font-style': ['left', 'right', 'oblique 10deg', 'oblique', 'italic', 'normal', 'oblique -10deg', 'ITALIC'],
  'background-attachment': ['fixed, scroll', 'fixed', 'scroll', 'local', 'fixed,scroll'],
  'background-repeat': [
    'no-repeat repeat',
    'repeat no-repeat',
    'repeat-x',
    'space',
    'round',
    'repeat repeat',
    'no-repeat, repeat',
  ],
};
parity(
  'style: keywords jsdom 26 takes in some properties (jsdom 26, #264 item 77)',
  (w) =>
    Object.entries(JSDOM26_KEYWORDS).flatMap(([name, values]) =>
      values.map((value) => {
        const set = w.document.createElement('div');
        set.style.setProperty(name, value);
        const attribute = w.document.createElement('div');
        attribute.setAttribute('style', `${name}: ${value}`);
        return [name, value, set.style.getPropertyValue(name), attribute.style.getPropertyValue(name)];
      }),
    ),
  { jsdom: 26 },
);

// jsdom 26 keeps a font or font-family value with var() as written, its
// spacing around commas too (black box, 26.1.0, #264 item 62). (,var( is
// no var() to jsdom; such a list it reads with a parser of its own: #264
// item 95.)
parity(
  'style: a family list with var() kept as written (jsdom 26, #264 item 62)',
  (w) =>
    [
      ['font-family', 'var(--f),x'],
      ['font-family', 'x , var(--f)'],
      ['font-family', 'x,  var(--f)'],
      ['font-family', 'x,\tvar(--f)'],
      ['font-family', 'var(--f) ,x'],
      ['font-family', 'x,(var(--f))'],
      ['font-family', 'Arial, var(--f) , serif'],
      ['font-family', 'x, var(--f)'],
      ['font', '12px x , var(--f)'],
      ['font', '12px var(--f),x'],
      ['font', 'var(--a) x,y'],
    ].map(([name, value]) => {
      const set = w.document.createElement('div');
      set.style.setProperty(name, value);
      const attribute = w.document.createElement('div');
      attribute.setAttribute('style', `${name}: ${value}`);
      return [name, value, set.style.getPropertyValue(name), attribute.style.cssText];
    }),
  { jsdom: 26 },
);

// jsdom 26 reads a family list with a parser of its own (black box,
// 26.1.0, #264 items 74 and 95): an unquoted name of one word starts with
// two letters or hyphens (ab, -ab, Font01; not x, a1, --x, ab_c, aé), one
// of more words has each start with a capital and one more character
// (Open Sans, Ab9 Cd; not ab cd, Ab C, x Sans), whitespace in it one
// space. A first family that fails drops the declaration; a later one is
// left out, an empty one too.
const JSDOM26_FAMILIES = [
  'ab cd',
  'Ab Cd',
  'Open Sans',
  'Open  Sans',
  'Open\tSans',
  'helvetica neue',
  'HELVETICA NEUE',
  'Times New Roman',
  'Open Sans1',
  'Ab Cd-ef',
  'A1 Cd',
  'Ab C',
  'x Sans',
  'Ab_Cd Ef',
  'Café Sans',
  'Ab 12',
  'x',
  'ab',
  '-ab',
  'a1',
  '--x',
  'ab_c',
  'aé',
  'Font01',
  'ab,x',
  'ab,x,cd',
  'x,ab',
  'ab,,cd',
  ',ab',
  'ab,',
  'ab, x y',
  'Ab Cd, ab cd',
  'serif,x',
  'ab,SERIF',
  'ab, "x" y',
  '"ab cd", Ab Cd',
  'Arial,y',
  // An escaped quote in a string: jsdom 26 rejects it (#302 review).
  '"a\\"b"',
  "'a\\'b'",
  'ab, "a\\"b"',
  // var( in a string, with a family that fails (#302 review): measured,
  // x, "var(a)" is dropped and x, "a var(b) c" kept as written.
  'x, "var(a)"',
  'Arial, "var(a)", x',
  'x, "a var(b) c"',
];
// font's families start after the size as jsdom 26 finds it: a zero size
// (0 x), a size keyword after a family as the size (.0 Arial Large); a
// keyword in a string or a later family is a family (#302 review).
const JSDOM26_FONT_FAMILIES = [
  '0 x',
  '0.0 x',
  'bold 0 x',
  '0 Ab',
  '12px x, "A small Font"',
  '12px Arial, x, Large',
  '12px Arial, Large',
  '.0 Arial Large',
];
parity(
  'style: font family names as jsdom 26 reads them (jsdom 26, #264 items 74 and 95)',
  (w) =>
    JSDOM26_FAMILIES.map((v) => {
      const family = w.document.createElement('div');
      family.style.setProperty('font-family', v);
      // (an empty family in font: #264 item 95)
      if (/(^|,)\s*(,|$)/.test(v)) return [v, family.style.fontFamily];
      const font = w.document.createElement('div');
      font.style.setProperty('font', `12px ${v}`);
      return [v, family.style.fontFamily, font.style.font, font.style.fontFamily];
    }).concat(
      JSDOM26_FONT_FAMILIES.map((v) => {
        const font = w.document.createElement('div');
        font.style.setProperty('font', v);
        // (validity and capitals: 0 is 0px and .0 Arial is dropped in jsdom
        // 26, #264 item 83)
        const read = font.style.font;
        return [v, read !== '', read.replace(/[^A-Z]/g, '')];
      }),
    ),
  { jsdom: 26 },
);

// border: none and border-style: none (#179, black box, 27.4.0 to 30.1.3):
// from jsdom 27 kept everywhere, a none style left out of border and its
// sides (border: none is border: medium, border-top: 0 none is
// border-top: 0px); CSS-wide keywords on border and its sides kept, but in
// jsdom 27 and 28 they leave a style attribute's or a cssText's block
// empty (setProperty and style sheets keep them).
const BORDER_NONE = [
  'border: none',
  'border: NONE',
  'border: 1px none',
  'border: none red',
  'border-top: none',
  'border-right: 0 none',
  'border-bottom: 1px none',
  'border-left: none 0',
  'border-top: 1px hidden',
  'border-style: none',
  'border-style: none solid',
  'border-top-style: none',
  'border: inherit',
  'border-top: unset',
  'color: red; border: initial',
  'color: red; border-left: inherit',
  'color: red; border-top: var(--b)',
];
for (const jsdom of [30, 29, 28, 27])
  parity(
    `style: border: none and border-style: none (jsdom ${jsdom})`,
    (w) => {
      const d = w.document;
      const sheet = d.head.appendChild(d.createElement('style'));
      sheet.textContent = BORDER_NONE.map((text, i) => `.r${i} { ${text} }`).join('\n');
      const rules = [...sheet.sheet.cssRules];
      const out = rules.map((rule) => rule.style.cssText);
      BORDER_NONE.forEach((text, i) => {
        const rule = rules[i];
        rule.style.cssText = text;
        const el = d.createElement('div');
        el.setAttribute('style', text);
        const set = d.createElement('div');
        set.style.cssText = text;
        const prop = d.createElement('div');
        const ruleProp = rules[(i + 1) % rules.length].style;
        ruleProp.cssText = '';
        for (const part of text.split('; ')) {
          const [name, value] = part.split(': ');
          prop.style.setProperty(name, value);
          ruleProp.setProperty(name, value);
        }
        out.push([text, rule.style.cssText, el.style.cssText, set.style.cssText, prop.style.cssText].join(' | '));
        out.push(`${ruleProp.cssText} | ${prop.getAttribute('style')}`);
      });
      return out;
    },
    { jsdom },
  );
// The computed longhands they give (the #136 diff harness's case among
// them: in jsdom 28.1 the user agent sheet's iframe { border: 2px inset }
// meets the page's by specificity).
const BORDER_NONE_COMPUTED = [
  ':is(iframe, .z) { border: none } * { border: 0 }',
  '* { border: 0 } :is(iframe, .z) { border: none }',
  'iframe, hr { border: none }',
  'iframe, hr { border-style: none }',
  'iframe, hr { border-top: none }',
  'hr, div { border: 1px none }',
  'div { border: solid }',
];
const BORDER_LONGHANDS = ['border-top-style', 'border-top-width', 'border-left-style', 'border-bottom-width'];
// And on a div, border-width and border-style: before jsdom 29 the parts
// border declares or their initial values.
const BORDER_BOX = ['border-width', 'border-style'];
for (const jsdom of [30, 29, 28, 27])
  parity(
    `getComputedStyle: border: none and border-style: none (jsdom ${jsdom})`,
    (w) => {
      const d = w.document;
      const out = [];
      const read = (el, names = BORDER_LONGHANDS) =>
        names.map((name) => w.getComputedStyle(el).getPropertyValue(name)).join(' ');
      const all = (el) => `${read(el)} ${el.localName === 'div' ? read(el, BORDER_BOX) : ''}`;
      for (const css of BORDER_NONE_COMPUTED) {
        d.head.innerHTML = `<style>${css}</style>`;
        d.body.innerHTML = '<iframe class="z"></iframe><hr><div></div>';
        out.push(`${css} | ${[...d.body.children].map(all).join(' | ')}`);
      }
      d.head.innerHTML = '';
      for (const text of ['border: none', 'border: 0', 'border: solid', 'border-style: none', 'border: 1px none']) {
        d.body.innerHTML = `<hr style="${text}"><div style="${text}"></div>`;
        out.push(`${text} | ${[...d.body.children].map(all).join(' | ')}`);
      }
      return out;
    },
    { jsdom },
  );

// clip as each jsdom serializes and computes it (black box, 20.0.3 to
// 30.1.3, #264): a rect() of four lengths or auto, with commas or (from
// jsdom 27) spaces; its components' numbers and units in each version's
// reading. Through setProperty, the style attribute and getComputedStyle.
const CLIP_VALUES = [
  'rect(0 0 0 0)',
  'rect(0, 0, 0, 0)',
  'rect(0px 0px 0px 0px)',
  'rect(1px 2px 3px 4px)',
  'rect(1px, 2px, 3px, 4px)',
  'rect(1px,2px,3px,4px)',
  'rect( 0 0 0 0 )',
  'rect(1px ,2px , 3px,4px)',
  'RECT(1px, 2px, 3px, 4px)',
  'Rect(0 0 0 0)',
  'rect(auto, auto, auto, auto)',
  'rect(auto 2px 3px 4px)',
  'rect(1px, 2px, 3px, AUTO)',
  'rect(1px 2px 3px AUTO)',
  'AUTO',
  // numbers and units in a component
  'rect(00, 1px, 1px, 1px)',
  'rect(0.0, 1px, 1px, 1px)',
  'rect(-0, 1px, 1px, 1px)',
  'rect(0.0px, 1px, 1px, 1px)',
  'rect(0em, 1px, 1px, 1px)',
  'rect(1PX, 1px, 1px, 1px)',
  'rect(1.50px, +2px, .5px, -1px)',
  'rect(1e1px, 1E1px, 1e-1px, 1.5e1px)',
  'rect(1q, 1vmin, 1dvh, 1cap)',
  'rect(1ex, 1ch, 1rem, 1vw)',
  'rect(1pt, 1pc, 1in, 1mm)',
  'rect(00 1px 1px 1px)',
  'rect(0.0 1px 1px 1px)',
  'rect(1.50px 2px 3px 4px)',
  'rect(.5PX 2px 3px 4px)',
  'rect(1E1px 2px 3px 4px)',
  'rect(1px 1px 1px 00)',
  'rect(1px 1px 1px -0)',
  'rect(0e0 0 0 0)',
  'rect(0 0e0 0 0)',
  'rect(0e0, 1px, 1px, 1px)',
  'rect(1px 1px 1px 0E1)',
  'rect(0 0e-1 0 0)',
  'rect(+0e0, 1px, 1px, 1px)',
  'rect(.0e0 1px 1px 1px)',
  'rect(0 1e0 0 0)',
  // not lengths
  'rect(0%, 1px, 1px, 1px)',
  'rect(1px 2px 3px 1%)',
  'rect(calc(1px), 1px, 1px, 1px)',
  'rect(calc(1px) 1px 1px 1px)',
  'rect(1px 1px 1px calc(1px))',
  // a math function after the first component with spaces: its insides
  // unchecked but for a var( not in lowercase and (jsdom 30) a percentage
  // (#274 review)
  'rect(0 calc(VAR(--a) + 1px) 0 0)',
  'rect(0 calc(1px + Var(--a)) 0 0)',
  'rect(0 calc(1px + 2%) 0 0)',
  'rect(0 calc(foo) 0 0)',
  'rect(0 min(1px, 2px) 0 0)',
  'rect(0 CLAMP(1px, 2px, 3px) 0 0)',
  'rect(0 abs(1px) 0 0)',
  'rect(0 foo(1px) 0 0)',
  'rect(0 calc(1px)junk 0 0)',
  'rect(0 calc(1px)calc(2px) 0 0)',
  'rect(0 junk calc(1px) 0)',
  'rect(0 calc(")") 0 0)',
  "rect(0 calc('(') 0 0)",
  'rect(0 calc("\\"(") 0 0)',
  'rect(0 calc(1px) 0 0)junk',
  'rect(0 calc("VAR(") 0 0)',
  "rect(0 calc('a%b') 0 0)",
  'rect(0 calc("x) VAR(") 0 0)',
  'rect(1, 1px, 1px, 1px)',
  'rect(1px 1px 1px 1)',
  'rect(1foo, 1px, 1px, 1px)',
  'rect(1px 1px 1px 1foo)',
  // malformed
  'rect(1px, 2px 3px, 4px)',
  'rect(1px, 2px, 3px, )',
  'rect(,1px, 2px, 3px, 4px)',
  'rect(1px, 2px, 3px)',
  'rect(1px 2px)',
  'rect(1px 2px 3px 4px 5px)',
  'rect(1px,2px,3px,4px)junk',
  'rect (1px, 2px, 3px, 4px)',
  'rect(1px 2px 3px 4px) !important',
  // var()
  'rect(var(--a), 1px, 1px, 1px)',
  'rect(1px 2px 3px var(--a))',
];
for (const jsdom of [20, 22, 25, 26, 27, 28, 29, 30, '30.1.3'])
  parity(
    `style: clip through setProperty, the attribute and getComputedStyle (jsdom ${jsdom}, #264)`,
    (w) => {
      const d = w.document;
      return CLIP_VALUES.map((value) => {
        const a = d.createElement('div');
        a.style.setProperty('clip', value);
        const b = d.createElement('div');
        b.setAttribute('style', `clip: ${value}`);
        d.body.replaceChildren(b);
        return `${value} | ${a.style.clip} | ${b.style.clip} | ${w.getComputedStyle(b).clip}`;
      });
    },
    { jsdom },
  );
for (const jsdom of [27, 28, 29])
  parity(
    `style: visually hidden (jsdom ${jsdom}, #264)`,
    (w) => {
      const d = w.document.createElement('div');
      Object.assign(d.style, { border: '0', clip: 'rect(0 0 0 0)', height: '1px', overflow: 'hidden' });
      w.document.body.append(d);
      return [d.getAttribute('style'), d.style.clip, w.getComputedStyle(d).clip];
    },
    { jsdom },
  );
// An invalid clip leaves the one set before (#274 review).
for (const jsdom of [27, 29, 30, '30.1.3'])
  parity(
    `style: an invalid clip keeps the previous value (jsdom ${jsdom}, #264)`,
    (w) => {
      const s = w.document.createElement('div').style;
      s.setProperty('clip', 'rect(1px, 2px, 3px, 4px)');
      s.setProperty('clip', 'rect(0 calc(VAR(--a) + 1px) 0 0)');
      const first = s.clip;
      s.clip = 'rect(0 calc(1px + 2%) 0 0)';
      return [first, s.clip];
    },
    { jsdom },
  );
// A math function with an unbalanced bracket in it (calc([)) is invalid
// (#274 review), and so is a curly brace outside a string (calc({1px})):
// jsdom 30.1.3 leaves the clip set before, 27 to 30.1.2
// throw a SyntaxError (docs/differences.md), warpdom leaves it too.
const CLIP_BRACKETS = [
  'rect(0 calc(1px]) 0 0)',
  'rect(0 calc([) 0 0)',
  'rect(0 calc({) 0 0)',
  'rect(0 calc(}) 0 0)',
  'rect(0 calc(1px)) 0 0)',
  'rect(0 calc("[") 0 0)',
  'rect(0 calc([1px]) 0 0)',
  'rect(0 calc({1px}) 0 0)',
  'rect(0 calc("{") 0 0)',
  'rect(0 calc([{}]) 0 0)',
  'rect(0 min([1px], 2px) 0 0)',
];
const clipBrackets = (w) => {
  const s = w.document.createElement('div').style;
  return CLIP_BRACKETS.map((value) => {
    s.setProperty('clip', 'rect(1px, 2px, 3px, 4px)');
    s.setProperty('clip', value);
    return s.clip;
  });
};
parity('style: an unbalanced bracket in a clip math function (jsdom 30.1.3, #264)', clipBrackets, {
  jsdom: '30.1.3',
});
test('style: an unbalanced bracket in a clip math function leaves the previous clip (jsdom 27 to 30, #264)', () => {
  for (const jsdom of [27, 28, 29, 30])
    assert.deepEqual(
      clipBrackets(createWindow({ jsdom })),
      clipBrackets(createWindow({ jsdom: '30.1.3' })),
      `jsdom ${jsdom}`,
    );
});
// A rect() written with one component (rect(0 0 0 0) is rect(0px)) in the
// cascade (#274 review): jsdom 27 to 30.1.2 read it again, find it invalid
// and let a rule's clip win, from a style attribute, setProperty or a rule;
// 30.1.3 computes it as declared, after setProperty too.
for (const jsdom of [27, 28, 29, 30, '30.1.3'])
  parity(
    `style: a one-component clip against other declarations (jsdom ${jsdom}, #264)`,
    (w) => {
      const d = w.document;
      d.head.innerHTML = '<style>.r { clip: rect(1px, 2px, 3px, 4px) } .s { clip: rect(0 0 0 0) }</style>';
      const attribute = d.createElement('div');
      attribute.className = 'r';
      attribute.setAttribute('style', 'clip: rect(0 0 0 0)');
      const written = d.createElement('div');
      written.style.setProperty('clip', 'rect(0 0 0 0)');
      const writtenOverRule = d.createElement('div');
      writtenOverRule.className = 'r';
      writtenOverRule.style.setProperty('clip', 'rect(0 0 0 0)');
      const rule = d.createElement('div');
      rule.className = 's';
      const laterRule = d.createElement('div');
      laterRule.className = 'r s';
      const all = [attribute, written, writtenOverRule, rule, laterRule];
      d.body.replaceChildren(...all);
      return all.map((e) => w.getComputedStyle(e).clip);
    },
    { jsdom },
  );

// A value that is one identifier, jsdom 27 and later (black box, 27.0.1 to
// 30.1.3, #187, #264 item 42): jsdom 27.0.1 to 28.0.0 write it in ASCII
// lowercase in every property but font-family (animation-name: FOO is foo,
// FÖO is fÖo); from 28.1.0 only in a property whose grammar takes no name
// or string of its own (display: BLOCK is block, animation-name: FOO and
// text-align: CENTER stay as written). A value of more than one token
// keeps its case (overflow: HIDDEN AUTO).
const ONE_IDENT = [
  ['display', 'BLOCK'],
  ['display', 'Inline-Block'],
  ['position', 'ABSOLUTE'],
  ['visibility', 'HIDDEN'],
  ['overflow', 'HIDDEN'],
  ['overflow', 'HIDDEN AUTO'],
  ['width', 'AUTO'],
  ['float', 'LEFT'],
  ['cursor', 'POINTER'],
  ['font-weight', 'BOLD'],
  ['line-height', 'NORMAL'],
  ['vertical-align', 'MIDDLE'],
  ['white-space', 'NOWRAP'],
  ['pointer-events', 'NONE'],
  ['box-sizing', 'BORDER-BOX'],
  ['flex-direction', 'COLUMN'],
  ['transform', 'NONE'],
  ['background-image', 'NONE'],
  ['background-image', 'NONE /**/'],
  ['list-style-image', 'NONE'],
  ['margin', 'AUTO'],
  ['border', 'NONE'],
  ['border-top', 'NONE'],
  ['outline', 'NONE'],
  ['text-align', 'CENTER'],
  ['text-overflow', 'ELLIPSIS'],
  ['animation-name', 'FOO'],
  ['animation-name', 'NONE'],
  ['animation-name', 'FÖO'],
  ['animation-name', 'F\\4FO'],
  ['grid-area', 'AUTO'],
  ['will-change', 'TRANSFORM'],
  ['list-style-type', 'DISC'],
  ['content', 'NONE'],
  ['quotes', 'NONE'],
  ['color-scheme', 'DARK'],
  ['anchor-name', '--FOO'],
  ['anchor-name', '---FOO'],
  ['animation-name', '--1FOO'],
  ['--theme', 'MyName'],
  ['--theme', 'FOO'],
  ['font-family', 'SERIF'],
  ['font', '12px SERIF'],
];
const oneIdent = (w) => {
  const d = w.document;
  d.head.innerHTML = `<style>${ONE_IDENT.map(([p, v], i) => `.k${i} { ${p}: ${v} }`).join('\n')}</style>`;
  return ONE_IDENT.map(([p, v], i) => {
    const attribute = d.createElement('div');
    attribute.setAttribute('style', `${p}: ${v}`);
    const written = d.createElement('div').style;
    written.setProperty(p, v);
    const ruled = d.createElement('div');
    ruled.className = `k${i}`;
    d.body.replaceChildren(attribute, ruled);
    const rule = d.styleSheets[0].cssRules[i].style.getPropertyValue(p);
    const computed =
      {
        margin: 'margin-left',
        border: 'border-left-style',
        'border-top': 'border-top-style',
        outline: 'outline-style',
      }[p] ?? p;
    return [
      `${p}: ${v}`,
      attribute.style.getPropertyValue(p),
      written.getPropertyValue(p),
      rule,
      w.getComputedStyle(attribute).getPropertyValue(computed),
      w.getComputedStyle(ruled).getPropertyValue(computed),
    ].join(' | ');
  });
};
for (const jsdom of [27, 28, 29, 30, '30.1.3'])
  parity(`style: a value of one identifier in uppercase (jsdom ${jsdom}, #187)`, oneIdent, { jsdom });
// jsdom 28.0.0 (cssstyle 5.3) as jsdom 27: every property but font-family.
test('style: a value of one identifier in uppercase (jsdom 28.0.0, #187)', () => {
  const s = createWindow({ jsdom: '28.0.0' }).document.createElement('div').style;
  const read = (p, v) => (s.setProperty(p, v), s.getPropertyValue(p));
  assert.deepEqual(
    [
      read('display', 'BLOCK'),
      read('animation-name', 'FOO'),
      read('text-align', 'CENTER'),
      read('font-family', 'SERIF'),
    ],
    ['block', 'foo', 'center', 'SERIF'],
  );
});

// !important on most properties, jsdom 27.0.0 to 28.0.0 (black box,
// 27.0.1, 27.4.0 and 28.0.0, every property: #264 item 44). Only about 77
// properties keep it (color, display, width, margin, padding, font, flex,
// background, border and the like); every other one, custom properties
// aside, is written without it in a style attribute, cssText and
// setProperty, and from 27.1.0 in style sheets too (as var() drops it).
// In the attribute it still keeps a later normal declaration of the
// property out. jsdom 28.1.0 and later keep it everywhere.
const IMPORTANT_KEPT = [
  ['color', 'red'],
  ['display', 'block'],
  ['width', '1px'],
  ['flex', '1'],
  ['-webkit-text-fill-color', 'red'],
  ['-webkit-tap-highlight-color', 'red'],
  ['--x', '"a"'],
];
const IMPORTANT_DROPPED = [
  ['position', 'absolute'],
  ['z-index', '1'],
  ['visibility', 'hidden'],
  ['overflow', 'hidden'],
  ['transform', 'rotate(1deg)'],
  ['content', '"a b"'],
  ['quotes', '"a" "b"'],
  ['outline', '1px solid red'],
  ['transition', 'opacity 1s'],
  ['-webkit-transform', 'rotate(1deg)'],
  ['word-wrap', 'break-word'],
];
const importantKept = (w) => {
  const d = w.document;
  const all = [...IMPORTANT_KEPT, ...IMPORTANT_DROPPED];
  const read = (style) =>
    `${style.cssText} | ${all
      .filter(([name]) => style.getPropertyPriority(name))
      .map(([name]) => name)
      .join(' ')}`;
  const text = all.map(([name, value]) => `${name}: ${value} !important`).join('; ');
  const attribute = d.createElement('div');
  attribute.setAttribute('style', text);
  const css = d.createElement('div');
  css.style.cssText = text;
  const set = d.createElement('div');
  const sheet = d.head.appendChild(d.createElement('style'));
  sheet.textContent = `.a { ${text} } .b { position: absolute !important; position: static } .c { position: absolute !important; position: static !important } .d {}`;
  const [, b, c, rule] = sheet.sheet.cssRules;
  for (const [name, value] of all) {
    set.style.setProperty(name, value, 'important');
    rule.style.setProperty(name, value, 'important');
  }
  const later = d.createElement('div');
  later.setAttribute('style', 'position: absolute !important; position: static; z-index: 1 !important; z-index: 2');
  return [attribute, css, set, sheet.sheet.cssRules[0], b, c, rule, later].map((x) => read(x.style));
};
for (const jsdom of [27, 28, 29, 30])
  parity(`style: !important on most properties (jsdom ${jsdom}, #264)`, importantKept, { jsdom });
// Where it starts and ends, on every path (black box, single-jsdom installs
// of 27.0.1 and 28.0.0; #276 review): 27.0.1's style sheets and rule
// styles (cssText, setProperty, insertRule) keep it, 28.0.0 drops it there
// as 27.4.0 does, and 28.1.0 keeps it everywhere.
test('style: !important on most properties by jsdom version', () => {
  const text = 'position: absolute !important; color: red !important; z-index: 1 !important; --x: 1 !important';
  const read = (jsdom) => {
    const d = createWindow({ jsdom }).document;
    const out = [];
    const attribute = d.createElement('div');
    attribute.setAttribute('style', text);
    const css = d.createElement('div');
    css.style.cssText = text;
    const later = d.createElement('div');
    later.setAttribute('style', 'position: absolute !important; position: static; color: red !important; color: blue');
    const set = d.createElement('div');
    const sheet = d.head.appendChild(d.createElement('style'));
    sheet.textContent = `.a { ${text} } .b {} .c {}`;
    const [ruled, ruleSet, ruleCss] = sheet.sheet.cssRules;
    for (const [name, value] of [
      ['position', 'absolute'],
      ['color', 'red'],
    ]) {
      set.style.setProperty(name, value, 'important');
      ruleSet.style.setProperty(name, value, 'important');
    }
    ruleCss.style.cssText = text;
    sheet.sheet.insertRule(`.d { ${text} }`, 3);
    for (const x of [attribute, css, later, set, ruled, ruleSet, ruleCss, sheet.sheet.cssRules[3]])
      out.push(x.style.cssText);
    return out;
  };
  const all = 'position: absolute !important; color: red !important; z-index: 1 !important; --x: 1 !important;';
  const most = 'position: absolute; color: red !important; z-index: 1; --x: 1 !important;';
  const later = 'position: absolute; color: red !important;';
  const pair = 'position: absolute; color: red !important;';
  const pairAll = 'position: absolute !important; color: red !important;';
  assert.deepEqual(read('27.0.1'), [most, most, later, pair, all, pairAll, all, all]);
  assert.deepEqual(read('28.0.0'), [most, most, later, pair, most, pair, most, most]);
  assert.deepEqual(read('28.1.0'), [
    all,
    all,
    'position: absolute !important; color: red !important;',
    pairAll,
    all,
    pairAll,
    all,
    all,
  ]);
});

// A style accessor's write to a declaration that is !important, jsdom 27
// to 29 (black box, 26.1.0, 27.0.1, 27.4.0, 28.0.0, 28.1.0, 29.1.1, 30.1.2
// and 30.1.3; #264 item 49): it keeps the !important (style.color =
// 'blue' after setProperty('color', 'red', 'important') is color: blue
// !important), on an element's style and a rule's, but for a value that
// loses it (var(), and from 27.0.0 to 28.0.0 most properties); an invalid
// value changes nothing, and setProperty without a priority drops it.
// jsdom 26 and 30 drop it.
const accessorImportant = (w) => {
  const d = w.document;
  const out = [];
  for (const [name, accessor, value, next] of [
    ['color', 'color', 'red', 'blue'],
    ['width', 'width', '1px', '2px'],
    ['display', 'display', 'block', 'none'],
    ['opacity', 'opacity', '1', '0.5'],
    ['font-size', 'fontSize', '1px', '2px'],
    ['font-size', 'font-size', '1px', '2px'],
    ['position', 'position', 'absolute', 'static'],
    ['z-index', 'zIndex', '1', '2'],
    ['float', 'cssFloat', 'left', 'right'],
    ['float', 'float', 'left', 'right'],
    ['color', 'color', 'red', 'var(--c)'],
    ['color', 'color', 'red', 'bogus'],
    ['color', 'color', 'red', ''],
    ['margin', 'margin', '1px', '2px'],
  ]) {
    const el = d.createElement('div');
    el.style.setProperty(name, value, 'important');
    el.style[accessor] = next;
    out.push(el.style.cssText);
  }
  const attribute = d.createElement('div');
  attribute.setAttribute('style', 'color: red !important; width: 1px');
  attribute.style.color = 'blue';
  attribute.style.width = '2px';
  out.push(attribute.style.cssText);
  const set = d.createElement('div');
  set.style.setProperty('color', 'red', 'important');
  set.style.setProperty('color', 'blue');
  out.push(set.style.cssText);
  const sheet = d.head.appendChild(d.createElement('style'));
  sheet.textContent =
    '.a { color: red !important; width: 1px !important } .b { float: left !important } .c { float: left !important }';
  const rule = sheet.sheet.cssRules[0].style;
  rule.color = 'blue';
  rule.width = 'var(--w)';
  out.push(rule.cssText);
  sheet.sheet.cssRules[1].style.cssFloat = 'right';
  out.push(sheet.sheet.cssRules[1].style.cssText);
  sheet.sheet.cssRules[2].style.float = 'right';
  out.push(sheet.sheet.cssRules[2].style.cssText);
  return out;
};
for (const jsdom of [26, 27, 28, 29, 30, '30.1.3'])
  parity(`style: an accessor's write to an !important declaration (jsdom ${jsdom}, #264)`, accessorImportant, {
    jsdom,
  });
// 27.0.1 and 28.0.0 as 27.4.0 (single-jsdom installs of each).
test("style: an accessor's write to an !important declaration (jsdom 27.0.1, 28.0.0)", () => {
  for (const jsdom of ['27.0.1', '28.0.0']) {
    const d = createWindow({ jsdom }).document;
    const el = d.createElement('div');
    el.style.setProperty('color', 'red', 'important');
    el.style.setProperty('position', 'absolute', 'important');
    el.style.color = 'blue';
    el.style.position = 'static';
    assert.equal(el.style.cssText, 'color: blue !important; position: static;', jsdom);
    // A rule's cssFloat: 27.0.1 ignores the write, 28.0.0 drops the priority.
    const sheet = d.head.appendChild(d.createElement('style'));
    sheet.textContent = '.b { float: left !important }';
    sheet.sheet.cssRules[0].style.cssFloat = 'right';
    assert.equal(
      sheet.sheet.cssRules[0].style.cssText,
      jsdom === '27.0.1' ? 'float: left !important;' : 'float: right;',
      jsdom,
    );
  }
});
// aspect-ratio with a single number and scrollbar-color with a single
// system color (black box, 26.1.0 to 30.1.3, #264 item 52). One number:
// jsdom 26 to 28.0.0 keep it as written (02, 1e1), 28.1.0 rejects it,
// 29 and later write it as a ratio (02 is 2 / 1). A system color alone
// is valid in scrollbar-color in 27.0.1 to 28.0.0 only, in lowercase.
const ASPECT_RATIOS = ['2', '02', '2.50', '1e1', '0', '.5', '+2', '-1', '2 / 1', '4/2', 'auto 2', '2 auto'];
const SCROLLBAR_COLORS = [
  'canvas',
  'AccentColorText',
  'buttonface',
  'ActiveBorder',
  'red',
  'transparent',
  'canvas red',
];
const surveyValues = (w) => {
  const d = w.document;
  const out = [];
  for (const [name, values] of [
    ['aspect-ratio', ASPECT_RATIOS],
    ['scrollbar-color', SCROLLBAR_COLORS],
  ])
    for (const v of values) {
      const a = d.createElement('div');
      a.style.setProperty(name, v);
      const b = d.createElement('div');
      b.setAttribute('style', `${name}: ${v}`);
      d.head.innerHTML = `<style>.x { ${name}: ${v} }</style>`;
      const rule = d.styleSheets[0].cssRules[0].style.getPropertyValue(name);
      d.body.innerHTML = '<div class="x"></div>';
      const computed = w.getComputedStyle(d.body.firstChild).getPropertyValue(name);
      out.push(`${name}: ${v} | ${a.style.getPropertyValue(name)} | ${b.style.cssText} | ${rule} | ${computed}`);
    }
  return out;
};
for (const jsdom of [26, 27, 28, 29, 30, '30.1.3'])
  parity(
    `style: a single-number aspect-ratio, a system color in scrollbar-color (jsdom ${jsdom}, #264)`,
    surveyValues,
    {
      jsdom,
    },
  );
// 27.0.1 and 28.0.0 (single-jsdom installs) as 27.4.0.
test('style: a single-number aspect-ratio, a system color in scrollbar-color (jsdom 27.0.1, 28.0.0, #264)', () => {
  for (const jsdom of ['27.0.1', '28.0.0']) {
    const el = createWindow({ jsdom }).document.createElement('div');
    el.style.aspectRatio = '02';
    assert.equal(el.style.aspectRatio, '02', jsdom);
    el.style.aspectRatio = '1e1';
    assert.equal(el.style.aspectRatio, '1e1', jsdom);
    el.style.scrollbarColor = 'AccentColorText';
    assert.equal(el.style.scrollbarColor, 'accentcolortext', jsdom);
    el.style.scrollbarColor = 'red';
    assert.equal(el.style.scrollbarColor, 'accentcolortext', jsdom);
    // Object.prototype's names are not colors (#280 review).
    for (const name of ['constructor', '__proto__', 'hasOwnProperty']) {
      el.style.scrollbarColor = name;
      assert.equal(el.style.scrollbarColor, 'accentcolortext', `${jsdom} ${name}`);
    }
  }
});
// Object.prototype's names are not color keywords (#280 review): every
// jsdom rejects color: constructor; warpdom's color tables had them.
for (const jsdom of [20, 26, 27, 29, 30])
  parity(
    `style: Object.prototype names are not colors (jsdom ${jsdom}, #280)`,
    (w) =>
      ['constructor', '__proto__', 'hasOwnProperty', 'valueOf', 'toString'].map((v) => {
        const el = w.document.createElement('div');
        for (const name of ['color', 'background-color', 'border-color', 'scrollbar-color'])
          el.style.setProperty(name, v);
        return `${v}: ${el.style.cssText}`;
      }),
    { jsdom },
  );

// A family name of several identifiers (CSS Fonts 4: <custom-ident>+) is
// one string, its identifiers joined by single spaces: jsdom 27 and later
// write it in double quotes (Times New Roman is "Times New Roman"), with
// backslashes removed, on every path. A name that starts with a generic
// family keyword (serif x, UI-ROUNDED x; not emoji or fangsong) is invalid
// there. jsdom 26 has a rule of its own (Times New Roman kept, a b
// dropped), not modeled; these values are the ones it keeps.
const FAMILIES = ['Times New Roman', 'Open Sans', 'Segoe UI, Helvetica Neue, sans-serif', 'Noto Sans JP'];
const MORE_FAMILIES = [
  'a b',
  'A  B',
  'a\tb c',
  'times new roman',
  'x, Times New Roman ,y',
  'a, b c, d',
  'Ünï cödé',
  'a-b c_d',
  'x serif',
  'x sans-serif y',
  'emoji x',
  'fangsong x',
  'serif x',
  'SERIF x',
  'sans-serif x',
  'monospace x',
  'system-ui x',
  'math x',
  'ui-serif x',
  'ui-rounded x',
  'x default',
  '"a b" c d',
  String.raw`a\"b c`,
  String.raw`a\62 c d`,
  String.raw`foo\ bar baz`,
  // Escapes and non-breaking spaces (#279 review): an escaped ( or , is
  // part of the name, U+00A0 is a name character, not whitespace.
  String.raw`a\(b c`,
  String.raw`Foo\, Bar Baz`,
  String.raw`a\"b c, Arial`,
  String.raw`"a\"b", c d`,
  'Foo\u00a0Bar',
  'Foo\u00a0Bar Baz',
];
const familyNames = (values) => (w) => {
  const d = w.document;
  const out = [];
  for (const v of values) {
    const a = d.createElement('div');
    a.style.fontFamily = v;
    const b = d.createElement('div');
    b.setAttribute('style', `font-family: ${v}`);
    const c = d.createElement('div');
    c.style.font = `12px ${v}`;
    // Written again: the serialized value reads back the same (#279 review).
    const again = d.createElement('div');
    again.style.fontFamily = a.style.fontFamily;
    // jsdom's font shorthand reads U+00A0 in its first family as a space
    // and quotes the name (12px "Foo Bar"); not modeled.
    const font = v.includes('\u00a0') ? '-' : `${c.style.font} / ${c.style.fontFamily}`;
    const inline = `${v} | ${a.style.fontFamily} | ${again.style.fontFamily} | ${b.style.cssText} | ${font}`;
    // An escaped quote in a sheet is #264 item 2.
    if (v.includes('\\"')) {
      out.push(inline);
      continue;
    }
    d.head.innerHTML = `<style>.x { font-family: ${v} }</style>`;
    const rule = d.styleSheets[0].cssRules[0].style.fontFamily;
    d.body.innerHTML = '<div class="x"></div>';
    const computed = w.getComputedStyle(d.body.firstChild).fontFamily;
    out.push(`${inline} | ${rule} | ${computed}`);
  }
  return out;
};
for (const jsdom of [26, 27, 28, 29, 30, '30.1.3'])
  parity(`style: a family name of several words (jsdom ${jsdom}, #264)`, familyNames(FAMILIES), { jsdom });
for (const jsdom of [27, 28, 29, 30, '30.1.3'])
  parity(`style: a family name of several words, more values (jsdom ${jsdom}, #264)`, familyNames(MORE_FAMILIES), {
    jsdom,
  });
// An escaped comma is part of a name in the font shorthand too, not a
// separator (#279 review).
for (const jsdom of [27, 28, 29, 30, '30.1.3'])
  parity(
    `style: an escaped comma in the font shorthand's family (jsdom ${jsdom}, #264)`,
    (w) =>
      [String.raw`12px Foo\,Bar`, String.raw`12px a\,b, c`, String.raw`12px Foo\, Bar Baz`].map((v) => {
        const el = w.document.createElement('div');
        el.style.font = v;
        return `${v} -> ${el.style.font} / ${el.style.fontFamily}`;
      }),
    { jsdom },
  );
// The whitespace that ends an escape (a\31<TAB>b, foo\<TAB>bar) is part
// of the name and stays, unless it is a space: then it joins the
// whitespace after it, which becomes one space. a\31<TAB>b is one
// identifier, kept; a\31<TAB><TAB>b is two, "a31<TAB> b" (#279 rebased
// on #278).
for (const jsdom of [27, 28, 29, 30, '30.1.3'])
  parity(
    `style: a family name with whitespace after an escape (jsdom ${jsdom}, #264)`,
    (w) =>
      [
        'a\\31\tb',
        'a\\31\r\nb',
        'a\\31\rb',
        'a\\31\fb c',
        'a\\31\t\tb',
        'a\\31\n b',
        'a\\31\r\n\r\nb',
        'a\\31  b',
        'a\\31 \tb',
        '\\31\tb c',
        'foo\\\tbar',
        'foo\\\t bar',
        'foo\\ \tbar',
        'a\\\\\tb',
        'x, a\\31\tb',
      ].map((v) => {
        const a = w.document.createElement('div');
        a.style.fontFamily = v;
        const b = w.document.createElement('div');
        b.setAttribute('style', `font-family: ${v}`);
        return JSON.stringify([v, a.style.fontFamily, b.style.cssText]);
      }),
    { jsdom },
  );
// A family list with a comma right before var() (x,var(--f)): jsdom 27
// and later read var() there as a family of its own, so the list is
// written as one without var() (", " between families, names of several
// words quoted, a generic keyword first invalid), through setProperty,
// the accessor and a sheet; the style attribute, cssText and font drop
// it (black box, #264 item 57). jsdom 26 has rules of its own (#264).
const FAMILY_VAR_COMMAS = [
  'x,var(--f)',
  'x ,var(--f)',
  'x,var(--f),y',
  'x,  y,var(--f)',
  'x,var(--a),var(--b)',
  'x,var(--f) y',
  '"a b",var(--f)',
  'Times New Roman,var(--f)',
  'x,var(--f),Times  New Roman',
  'serif x,var(--f)',
  'SERIF,var(--f)',
  'x,var(--f, a,b)',
  'x,var(--f)var(--g)',
  'x,var(--f)  ,  y',
  'x,VAR(--f)',
  'x,(var(--f))',
  'var(--f),x,var(--g)',
  'x/**/,var(--f)',
  // (#283 review)
  'x/*(*/,var(--f)',
  'x,var(--f)/**/',
  'x,var(--f)/*a*/,y',
  'x,var(--f);color:red',
];
for (const jsdom of [27, 28, 29, 30, '30.1.3'])
  parity(
    `style: a family list with a comma before var() (jsdom ${jsdom}, #264)`,
    (w) => {
      const d = w.document;
      return FAMILY_VAR_COMMAS.map((v) => {
        const a = d.createElement('div');
        a.style.setProperty('font-family', v);
        const b = d.createElement('div');
        b.style.fontFamily = v;
        const c = d.createElement('div');
        c.setAttribute('style', `font-family: ${v}`);
        const e = d.createElement('div');
        e.style.cssText = `font-family: ${v}`;
        const f = d.createElement('div');
        f.style.font = `12px ${v}`;
        d.head.innerHTML = `<style>.n { font-family: ${v} }</style>`;
        const rule = d.styleSheets[0].cssRules[0].style.fontFamily;
        return JSON.stringify([
          v,
          a.style.fontFamily,
          b.style.fontFamily,
          c.style.cssText,
          e.style.cssText,
          f.style.font,
          rule,
        ]);
      });
    },
    { jsdom },
  );
// An escape outside a string is no comment's or string's start (#283
// review). Not in a sheet: warpdom's sheet parser reads a\" as a
// string's start (#264 item 70).
const FAMILY_VAR_ESCAPES = [
  String.raw`a\/*literal*/b,var(--f)`,
  String.raw`a\"/**/b,var(--f)`,
  String.raw`"a\"/**/",var(--f)`,
  String.raw`a\'x/**/,var(--f)`,
];
for (const jsdom of [27, 28, 29, 30, '30.1.3'])
  parity(
    `style: a family list with a comma before var() and an escape (jsdom ${jsdom}, #283 review)`,
    (w) =>
      FAMILY_VAR_ESCAPES.map((v) => {
        const a = w.document.createElement('div');
        a.style.setProperty('font-family', v);
        const b = w.document.createElement('div');
        b.style.fontFamily = v;
        const c = w.document.createElement('div');
        c.setAttribute('style', `font-family: ${v}`);
        return JSON.stringify([v, a.style.fontFamily, b.style.fontFamily, c.style.cssText]);
      }),
    { jsdom },
  );
// With var() jsdom 27 and later keep the family list as written: no
// quotes, and a name that starts with a generic keyword stays (#279
// review).
for (const jsdom of [27, 28, 29, 30, '30.1.3'])
  parity(
    `style: a family list with var() (jsdom ${jsdom}, #264)`,
    (w) =>
      ['serif x, var(--face)', 'Times New Roman, var(--f)', 'A  B,  var(--f)', 'var(--a) serif x']
        .map((v) => {
          const a = w.document.createElement('div');
          a.style.fontFamily = v;
          const b = w.document.createElement('div');
          b.setAttribute('style', `font-family: ${v}`);
          const c = w.document.createElement('div');
          c.style.font = `12px ${v}`;
          return `${v} | ${a.style.fontFamily} | ${b.style.cssText} | ${c.style.font}`;
        })
        .concat(
          // Numbers in the shorthand stay as written too.
          ['1.50em Foo, var(--f)', '12px/1.50 Foo, var(--f)'].map((v) => {
            const el = w.document.createElement('div');
            el.style.font = v;
            return `${v} -> ${el.style.font}`;
          }),
        ),
    { jsdom },
  );
// Strings in a value (black box, 27.4.0 to 30.1.3, #264 item 60): a value
// that is one string is written as a CSS string from jsdom 28 (in double
// quotes, escapes read; 28 escapes only the quote, 29 and later as CSSOM
// does), and font-family's and font's names from 27 (quotes escaped,
// backslashes dropped). An escaped NUL or a backslash at the end is
// removed before 30 and U+FFFD from 30. Two strings, quotes and var()
// stay as written.
const ONE_STRING = [
  "'x'",
  "''",
  '"a\\62 c"',
  '"abc',
  "'a\"b'",
  '"a\\\\b"',
  '"a\\5c b"',
  '"a\\A b"',
  '"a\\0 b"',
  '"\\41"',
  '"a\\E9b"',
  '"a\\-b"',
  '"a\\ b"',
  '"a\\\nb"',
  '"a\u0001b"',
  '"a\u007fb"',
  '"ab\\"',
  '"a\r\nb"',
  '"x" "y"',
  // A backslash at the end of the text, or before a quote (#291 review).
  '"a\\5c"',
  '"a\\5c\\"b"',
  // var() in a string keeps the value as written, a raw newline too
  // (#291 review).
  "'a var(--x)'",
  "'a\nvar(--x)'",
  "'a\\A var(--x)'",
  "'avar(--x)'",
];
// NUL and a backslash at the end, through setProperty (jsdom 30's
// accessors read them as 29 does, #264 item 81).
const STRING_EDGES = ['"a\0b"', '"a\\\0b"', '"a\\'];
const STRING_PROPERTIES = [
  'content',
  'animation-name',
  'list-style',
  'list-style-type',
  'text-overflow',
  'grid-template-areas',
  'font-feature-settings',
  'hyphenate-character',
  'text-emphasis-style',
  'quotes',
];
const FAMILY_STRINGS = [
  "'x', serif",
  "serif, 'a\\62 c'",
  "'x' , serif",
  '"a\\\\b", serif',
  "'a\"b'",
  '"a\\A b"',
  '"ab\\"',
  "'x', var(--a)",
  "''",
  // (an escaped quote is part of a name)
  "a\\\"b, 'x'",
  // A slash in a family string is no line height's (#291 review).
  "'a\\2f b'",
  '"a/b"',
  "'a/b', serif",
  "'a\\2f  b'",
  '"a / b"',
  // Only the first family turns a newline, CR or form feed into a space;
  // notvar( is no var() (#291 review).
  "Arial, 'a\\A b'",
  "'x', 'a\\A b'",
  "'a\\A b', 'c\\A d'",
  "'a\\D b'",
  "'a\\C b'",
  "'a\\9 b'",
  "'a\\62 cnotvar(x)'",
  "'a var(--x)'",
  "'a\\62 c',var(--a)",
];
// A function before the families with a newline, CR or form feed in a
// family string drops font (#291 review).
const FONT_FUNCTIONS = [
  'calc(12px) "a\\A b"',
  'calc(12px / 2) "a\\A b"',
  'bold calc(12px) Arial, "a\\D b"',
  '12px/calc(2) "a\\C b"',
  'calc(12px)/1.5 "a\\A b"',
  'calc(12px) "a\\9 b"',
  'calc(12px) "a b"',
];
for (const jsdom of [27, 28, 29, 30, '30.1.3'])
  parity(
    `style: a value of one string, and strings in a family list (jsdom ${jsdom}, #264 item 60)`,
    (w) => {
      const sheet = w.document.head.appendChild(w.document.createElement('style')).sheet;
      const read = (name, value) => {
        const set = w.document.createElement('div').style;
        set.setProperty(name, value);
        const attr = w.document.createElement('div');
        attr.setAttribute('style', `${name}: ${value}`);
        const accessor = w.document.createElement('div').style;
        accessor[name.replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = value;
        const row = [name, value, set.getPropertyValue(name), attr.style.cssText, accessor.cssText];
        // (an unclosed string in a rule takes the rule's end; the sheet
        // parser drops an escaped quote outside a string, #264 item 80)
        // (nor a raw newline, whose bad string takes the rule's } with
        // var(): #264 item 90)
        if (/["']$/.test(value) && !/\\["']$/.test(value) && !value.includes('a\\"') && !value.includes('\n')) {
          sheet.insertRule(`div { ${name}: ${value} }`, 0);
          row.push(sheet.cssRules[0].style.getPropertyValue(name));
        }
        return JSON.stringify(row);
      };
      return [
        ...STRING_PROPERTIES.flatMap((name) => ONE_STRING.map((value) => read(name, value))),
        ...FAMILY_STRINGS.flatMap((value) => [
          read('font-family', value),
          read('font', `12px ${value}`),
          read('font', `12px/1.5 ${value}`),
        ]),
        ...FONT_FUNCTIONS.map((value) => read('font', value)),
        read('content', "'x' counter(a)"),
        read('animation', "'x' 1s"),
        ...['content', 'animation-name', 'font-family'].flatMap((name) =>
          STRING_EDGES.map((value) => {
            const set = w.document.createElement('div').style;
            set.setProperty(name, value);
            return JSON.stringify([name, value, set.getPropertyValue(name), set.cssText]);
          }),
        ),
      ];
    },
    { jsdom },
  );
// jsdom 20 to 26 keep a name that starts with a generic family keyword
// (Serif Extra; 26 needs capitals); only 27 and later reject it (#279
// review). An escaped comma stays as written there too.
for (const jsdom of [20, 22, 25, 26])
  parity(
    `style: a family name that starts with a generic keyword (jsdom ${jsdom}, #264)`,
    (w) => {
      const values = ['Serif Extra', 'Fantasy Display', 'Monospace Foo, Arial', 'System-ui Bar'];
      if (jsdom !== 26) values.push('serif extra', String.raw`Foo\,Bar`);
      return values.map((v) => {
        const a = w.document.createElement('div');
        a.style.fontFamily = v;
        const b = w.document.createElement('div');
        b.setAttribute('style', `font-family: ${v}`);
        const c = w.document.createElement('div');
        c.style.font = `12px ${v}`;
        // cssstyle's own font shorthand writes Foo\\,Bar as Foo,Bar 12px
        // 12px (jsdom 20 to 25); not modeled.
        const font = v.includes('\\') ? '-' : c.style.font;
        return `${v} | ${a.style.fontFamily} | ${b.style.cssText} | ${font}`;
      });
    },
    { jsdom },
  );
// 27.0.1 and 28.0.0 (single-jsdom installs) as 27.4.0.
test('style: a family name of several words (jsdom 27.0.1, 28.0.0, #264)', () => {
  for (const jsdom of ['27.0.1', '28.0.0']) {
    const d = createWindow({ jsdom }).document;
    const el = d.createElement('div');
    el.style.font = '12px Times New Roman';
    assert.equal(el.style.font, '12px "Times New Roman"', jsdom);
    el.style.fontFamily = 'x, Open  Sans ,y';
    assert.equal(el.style.fontFamily, 'x, "Open Sans", y', jsdom);
    el.style.fontFamily = 'serif x';
    assert.equal(el.style.fontFamily, 'x, "Open Sans", y', jsdom);
  }
});
// Many hex escapes in a name of several words: one reading of each escape,
// so no exponential backtracking (8 escapes took 52 ms, each one more
// ~6x). Black box: jsdom 29 removes the backslashes and quotes it.
test('style: a family name of several words with many escapes (#264)', () => {
  const el = createWindow({ jsdom: '29.1.1' }).document.createElement('div');
  const start = performance.now();
  el.style.fontFamily = `a${'\\AAAAAA'.repeat(12)} b c`;
  assert.ok(performance.now() - start < 500);
  assert.equal(el.style.fontFamily, `"a${'AAAAAA'.repeat(12)} b c"`);
});

// Numbers as written (black box, #264 item 54): jsdom 27.0.1 to 28.0.0
// (cssstyle 5) keep a number as written (01s, 1.50, +1px, 1e1) except in
// the properties cssstyle 5 parses (width, margin, border widths, flex,
// font-size, line-height, opacity and the like), which write it
// canonically; 28.1.0 and later write it canonically.
const NUMBERS = [
  ['animation-duration', '01s'],
  ['animation-iteration-count', '1.50'],
  ['border-radius', '01px 1.50%'],
  ['transition', 'opacity 1.50s ease 01s'],
  ['grid-template-columns', '01fr 1.50fr'],
  ['z-index', '+1'],
  ['transform-origin', '01px 1.50px'],
  ['letter-spacing', '1.50px'],
  ['column-count', '01'],
  ['outline-width', '1.50px'],
  ['min-width', '01px'],
  ['max-height', '1.50em'],
  ['text-indent', '+1px'],
  ['order', '1e1'],
  ['width', '1.50px'],
  ['margin', '01px +1px'],
  ['opacity', '.50'],
  ['line-height', '1.50'],
  ['flex-grow', '01'],
  ['font-size', '1E1px'],
  ['flex', '01'],
  ['flex', '1.50 +1 01px'],
  ['background-size', '01px, 1.50px'],
  ['background-size', '01px 1.50px'],
  ['outline', '1.50px'],
  ['outline', '01px solid'],
];
const numbersAsWritten = (w) => {
  const d = w.document;
  return NUMBERS.map(([name, v]) => {
    const a = d.createElement('div');
    a.style.setProperty(name, v);
    const b = d.createElement('div');
    b.setAttribute('style', `${name}: ${v}`);
    d.head.innerHTML = `<style>.n { ${name}: ${v} }</style>`;
    const rule = d.styleSheets[0].cssRules[0].style.getPropertyValue(name);
    return `${name}: ${v} | ${a.style.getPropertyValue(name)} | ${b.style.cssText} | ${rule}`;
  });
};
for (const jsdom of [26, 27, 28, 29, 30, '30.1.3'])
  parity(`style: numbers as written or canonical (jsdom ${jsdom}, #264)`, numbersAsWritten, { jsdom });
// flex keeps exponent numbers as written and still sets its longhands
// (#281 review): flex: 1e1 is flex-grow 1e1, flex-shrink 1, flex-basis 0%.
const flexExponents = (w) => {
  const d = w.document;
  return ['1e1', '1 1e-1 10px', '1E1 2', '.5e1 0 auto', '1e1 1e1 1e1px'].map((v) => {
    const a = d.createElement('div');
    d.body.append(a);
    a.style.setProperty('flex', v);
    const { flexGrow, flexShrink, flexBasis } = a.style;
    const c = w.getComputedStyle(a);
    a.remove();
    return `flex: ${v} | ${a.style.flex} | ${flexGrow} ${flexShrink} ${flexBasis} | ${c.flexGrow} ${c.flexShrink} ${c.flexBasis}`;
  });
};
for (const jsdom of [26, 27, 28, 29, 30, '30.1.3'])
  parity(`style: flex with exponent numbers sets its longhands (jsdom ${jsdom}, #264)`, flexExponents, { jsdom });
// 27.0.1 and 28.0.0 (single-jsdom installs) as 27.4.0 inline (27.0.1's
// style sheets keep every value as written).
test('style: numbers as written or canonical (jsdom 27.0.1, 28.0.0, #264)', () => {
  const inline = (w) => numbersAsWritten(w).map((row) => row.split(' | ').slice(0, 3).join(' | '));
  const expected = inline(createWindow({ jsdom: '27.4.0' }));
  for (const jsdom of ['27.0.1', '28.0.0']) assert.deepEqual(inline(createWindow({ jsdom })), expected, jsdom);
});

// A property name that is an Object.prototype member (constructor,
// __proto__, toString) is no property: setProperty and the style
// attribute drop it, getComputedStyle reads '' (warpdom threw or declared
// it: its tables were plain objects). jsdom 20 to 26 keep it in a sheet
// (their CSSOM keeps any name), 27 and later drop it. jsdom 20 to 25
// give getPropertyPriority null for these names (left out).
const PROTOTYPE_NAMES = ['constructor', '__proto__', 'toString', 'hasOwnProperty', 'valueOf', '__defineGetter__'];
for (const jsdom of [20, 22, 25, 26, 27, 28, 29, 30, '30.1.3'])
  parity(
    `style: a property named like an Object.prototype member (jsdom ${jsdom})`,
    (w) => {
      const d = w.document;
      return PROTOTYPE_NAMES.map((name) => {
        const out = [name];
        const a = d.createElement('div');
        a.style.setProperty(name, '1');
        a.style.setProperty(name, '1', 'important');
        out.push(a.style.cssText, a.style.getPropertyValue(name), a.style.removeProperty(name));
        if (jsdom >= 26 || typeof jsdom === 'string') out.push(a.style.getPropertyPriority(name));
        const b = d.createElement('div');
        b.setAttribute('style', `${name}: 1; color: red`);
        out.push(b.style.cssText);
        const c = d.createElement('div');
        c.style.cssText = `${name}: 1; margin: 0`;
        out.push(c.style.cssText);
        d.head.innerHTML = `<style>.n { ${name}: 1; color: red }</style>`;
        out.push(d.styleSheets[0].cssRules[0].style.cssText);
        const e = d.createElement('div');
        d.body.append(e);
        out.push(w.getComputedStyle(e).getPropertyValue(name));
        e.remove();
        return JSON.stringify(out);
      });
    },
    { jsdom },
  );

// CSS Syntax 3 input preprocessing (black box, #264 item 55): jsdom 30
// reads CR LF, CR and FF in a declaration's value as LF, and NUL as
// U+FFFD, on setProperty, the style attribute, cssText, insertRule and
// computed values; the accessors (style.containerName) keep them, as
// jsdom 26 to 29 do everywhere. A custom property in a sheet (29 and
// later collapse its whitespace) is left out.
const PREPROCESSED = [
  ['container-name', 'a\r\nb'],
  ['container-name', 'a\rb'],
  ['container-name', 'a\fb'],
  ['container-name', 'b\\31\r\n001'],
  ['container-name', 'a\0b'],
  ['grid-template-areas', '"a"\r\n"b"'],
  ['transition', 'opacity\r1s'],
  ['will-change', 'a,\rb'],
  ['content', '"a"\r"b"'],
  ['mask', 'url(a)\rno-repeat'],
  ['--x', 'a\r\nb\fc\rd'],
  ['--x', 'a\0b'],
];
const preprocessed = (w) => {
  const d = w.document;
  d.head.innerHTML = '<style></style>';
  const sheet = d.styleSheets[0];
  return PREPROCESSED.map(([name, v]) => {
    const a = d.createElement('div');
    d.body.append(a);
    a.style.setProperty(name, v);
    const computed = w.getComputedStyle(a).getPropertyValue(name);
    a.remove();
    const b = d.createElement('div');
    b.setAttribute('style', `${name}: ${v}`);
    const c = d.createElement('div');
    c.style.cssText = `${name}: ${v}`;
    let accessor = '-';
    let rule = '-';
    if (!name.startsWith('--')) {
      const e = d.createElement('div');
      e.style[name.replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = v;
      accessor = e.style.cssText;
      sheet.insertRule(`.n { ${name}: ${v} }`, 0);
      rule = sheet.cssRules[0].style.getPropertyValue(name);
      sheet.deleteRule(0);
    }
    return JSON.stringify([
      name,
      v,
      a.style.getPropertyValue(name),
      b.style.cssText,
      c.style.cssText,
      accessor,
      rule,
      computed,
    ]);
  });
};
for (const jsdom of [26, 27, 28, 29, 30, '30.1.3'])
  parity(`style: CR, FF and NUL in a value (jsdom ${jsdom}, #264)`, preprocessed, { jsdom });
// A rule's accessor keeps CR as written in jsdom 30 too, but the cascade
// reads the value as CSS input (#282 review).
for (const jsdom of [26, 29, 30, '30.1.3'])
  parity(
    `style: CR in a rule's value and the computed style (jsdom ${jsdom}, #264)`,
    (w) => {
      const d = w.document;
      d.head.innerHTML = '<style>.n { color: red }</style>';
      const e = d.createElement('div');
      e.className = 'n';
      d.body.append(e);
      const rule = d.styleSheets[0].cssRules[0];
      rule.style.containerName = 'a\rb';
      const out = [rule.style.containerName, w.getComputedStyle(e).containerName];
      rule.style.transition = 'opacity\f1s';
      out.push(rule.style.transition, w.getComputedStyle(e).transition);
      return out;
    },
    { jsdom },
  );

// A custom property read from a style sheet (black box, #264 item 59):
// jsdom 29 and later re-serialize its value token by token (whitespace
// collapsed or dropped by the tokens around it, strings in double
// quotes, urls unquoted; custom-value.js), on a <style> element,
// insertRule, an @media rule's and replaceSync, and so in computed
// values; a rule's cssText and setProperty and inline styles keep it as
// written. jsdom 26 to 28 keep it as written everywhere.
const SHEET_CUSTOM = [
  'a  b',
  'a\tb',
  'a\nb',
  'f(a\n b)',
  '"a  b"',
  '"a\\\nb"',
  "'a'",
  'a /* c */ b',
  'a/**/(b)',
  'a , b',
  '[ a ]',
  'url( a.png )',
  'url("a b")',
  "url('a)')",
  'URL( a )',
  'F( a )',
  'url(a b)',
  'x  url(a b)',
  '1px  solid',
  'a ( b )',
  'f( a , b )',
  'a / b',
  'a + b',
  '1px +2px',
  '1px -2px',
  '1 -2',
  '1% a',
  '1% -1',
  'a "s" b',
  '"s" a',
  'f(x) 1',
  'f(x) a',
  '(p) 1',
  '#h 1',
  '1 #h',
  '1% #h',
  'a #h',
  '/ *',
  '* /',
  '+ +',
  '- +',
  'a : b',
  '@k ,',
  'U+26 #h',
  '{ a }',
  'a  {b}  c',
  '"{"  a',
  "\"\\41\" 'a\\'b'",
  String.raw`"a\9 b" "a\9 g" "\7f" "\0"`,
  String.raw`url("a\9 g") url("a\9 1") url("a b") url("\\")`,
  String.raw`\61  b`,
  String.raw`a\  b`,
  '1.0  01  1E3px  +.5',
  'calc( 1px  +  2px )',
  'rgba( 0 , 0 , 0 , .1 )',
  '0 1px 2px rgba(0,0,0,.1) ,\n  0 2px 4px red',
  '"Inter" , sans-serif',
  'var( --y , 1px )',
  'A  B',
  // An escaped url name is an ordinary function, as in jsdom (#286
  // review).
  String.raw`u\72l( a\20 b )`,
  String.raw`a  u\72l(a b)  c`,
  String.raw`\75rl( "a" )`,
  // Deep nesting (#286 review).
  `${'('.repeat(40)}a  b${')'.repeat(40)}`,
];
// Read otherwise by jsdom 26 to 28 (#264): / * as a comment's start, a
// {} block, the escaped backslash in a url and \61  b (one space).
// jsdom 26 has no replaceSync (warpdom's 26 has: left out there).
const SHEET_CUSTOM_LATER = new Set([
  '/ *',
  '{ a }',
  'a  {b}  c',
  '"{"  a',
  String.raw`url("a\9 g") url("a\9 1") url("a b") url("\\")`,
  String.raw`\61  b`,
]);
const sheetCustom = (w, values, constructed = true) => {
  const d = w.document;
  const e = d.createElement('div');
  e.className = 'n';
  d.body.append(e);
  // (a value with a {} block can end the rule early: a read that throws
  // is written as such)
  const read = (f) => {
    try {
      return f();
    } catch {
      return 'throws';
    }
  };
  return values.map((v) => {
    d.head.innerHTML = '';
    const style = d.createElement('style');
    style.textContent = `.n { --x: ${v}; } @media all { .m { --x: ${v} } }`;
    d.head.append(style);
    const sheet = d.styleSheets[0];
    const rule = sheet.cssRules[0];
    const out = [v, rule.style.getPropertyValue('--x'), rule.style.cssText];
    out.push(read(() => sheet.cssRules[1].cssRules[0].style.getPropertyValue('--x')));
    out.push(w.getComputedStyle(e).getPropertyValue('--x'));
    out.push(
      read(() => {
        sheet.insertRule(`.k { --x: ${v} }`, 0);
        return sheet.cssRules[0].style.getPropertyValue('--x');
      }),
    );
    if (constructed)
      out.push(
        read(() => {
          const other = new w.CSSStyleSheet();
          other.replaceSync(`.n { --x: ${v} }`);
          return other.cssRules[0].style.getPropertyValue('--x');
        }),
      );
    rule.style.cssText = `--x: ${v}`;
    out.push(rule.style.getPropertyValue('--x'));
    rule.style.setProperty('--y', v);
    out.push(rule.style.getPropertyValue('--y'));
    const inline = d.createElement('div');
    inline.setAttribute('style', `--x: ${v}`);
    out.push(inline.style.getPropertyValue('--x'));
    return JSON.stringify(out);
  });
};
// jsdom 29 and later also report these sheets as not parsed (a console
// error warpdom does not give), so they are checked on their own below.
// A colon or an at-keyword anywhere keeps the value as written, spacing
// included (#286 review).
const SHEET_CUSTOM_ERRORS = new Set([
  'url(a b)',
  'x  url(a b)',
  'a : b',
  'a  :  b',
  'x  a:b',
  '(a  :  b)',
  '@k ,',
  '@k  ,',
  'f(@k  x)',
  // A quoted url with more than its string (#286 review).
  'a  url( "a" b )  c',
  "x  URL( 'a' 1px )",
  '{ a }',
  'a  {b}  c',
]);
for (const jsdom of [26, 27, 28, 29, 30, '30.1.3']) {
  const later = jsdom >= 29 || jsdom === '30.1.3';
  const values = SHEET_CUSTOM.filter((v) => (later ? !SHEET_CUSTOM_ERRORS.has(v) : !SHEET_CUSTOM_LATER.has(v)));
  parity(
    `style: a custom property in a style sheet (jsdom ${jsdom}, #264)`,
    (w) => sheetCustom(w, values, jsdom !== 26),
    {
      jsdom,
    },
  );
}
// An escaped CR LF, CR or form feed continues a string (#286 review).
// jsdom 30 turns CR and FF into LF first (#282), so these run on 26 to 29.
const SHEET_CUSTOM_CONTINUED = ['"a\\\r\nb"  "a\\\rb"  "a\\\fb"', "url('a\\\rb')  url('a\\\fb')"];
for (const jsdom of [26, 27, 28, 29])
  parity(
    `style: a string continued over a newline in a custom property (jsdom ${jsdom}, #286 review)`,
    (w) => sheetCustom(w, SHEET_CUSTOM_CONTINUED, jsdom !== 26),
    { jsdom },
  );
// An escaped CR LF in a string is one escaped newline: the string goes on
// after it, and a ; later in the block ends the declaration (jsdom 27 to
// 29 keep CR LF as written; 30 makes it LF first, #282). Black box,
// 27.4.0 to 29.1.1 (#264 item 69).
const ESCAPED_CRLF = [
  "--x: url('a\\\r\nb'); color: red",
  '--x: url("a\\\r\nb"); color: red',
  "--x: 'a\\\r\nb'; color: red",
  "color: blue; background-image: url('a\\\r\nb'); color: red",
  // (a string value written as a CSS string from 28: #264 item 60)
  "content: 'a\\\r\nb'; color: red",
];
for (const jsdom of [27, 28, 29])
  parity(
    `style: an escaped CR LF in a string, then more declarations (jsdom ${jsdom}, #264 item 69)`,
    (w) =>
      ESCAPED_CRLF.map((text) => {
        const d = w.document;
        const attribute = d.createElement('div');
        attribute.setAttribute('style', text);
        const set = d.createElement('div');
        set.style.cssText = text;
        const style = d.createElement('style');
        style.textContent = `p { ${text} }`;
        d.head.appendChild(style);
        const rule = style.sheet.cssRules[0].cssText;
        style.remove();
        return [text, attribute.style.cssText, set.style.cssText, set.style.length, rule];
      }),
    { jsdom },
  );
// Kept as written by jsdom 29.1.1 to 30.1.3 (black box): a bad url, a
// colon, an at-keyword's comma and a {} block.
test('style: a custom property in a style sheet kept as written (jsdom 29 and later, #264)', () => {
  for (const jsdom of [29, 30, '30.1.3']) {
    const d = createWindow({ jsdom }).document;
    for (const v of SHEET_CUSTOM_ERRORS) {
      d.head.innerHTML = `<style>.n { --x: ${v}; }</style>`;
      assert.equal(d.styleSheets[0].cssRules[0].style.getPropertyValue('--x'), v, `${jsdom} ${v}`);
    }
  }
  // A backslash before CR or form feed is no escape in a url (#286
  // review); jsdom 30.1.2 and later turn CR and FF into LF first (#282).
  // (textContent: the HTML parser would turn CR into LF.)
  for (const jsdom of [29, '30.1.3']) {
    const d = createWindow({ jsdom }).document;
    for (const v of ['url(a\\\rb)', 'url(a\\\fb)']) {
      d.head.textContent = '';
      const style = d.createElement('style');
      style.textContent = `.n { --x: ${v}; }`;
      d.head.append(style);
      const expected = jsdom === 29 ? v : v.replace(/[\r\f]/, '\n');
      assert.equal(
        d.styleSheets[0].cssRules[0].style.getPropertyValue('--x'),
        expected,
        `${jsdom} ${JSON.stringify(v)}`,
      );
    }
  }
});

// An unclosed (, [ or function in a declaration's value is a block only
// its closer or the end of the sheet ends (CSS Syntax 3): the rule's } and
// the rules after it are part of the value. A custom property keeps that
// text as written (a } in it keeps it so); one that reaches the end with a
// block or string still open has them closed ((a  b is (a b)); another
// property is dropped, with the rules after it. jsdom 29 and later, black
// box 29.1.1 to 30.1.3 (#264 item 68).
const UNCLOSED_SHEETS = [
  '.x { --v: (a  b } .y { color: red }',
  '.x { color: red; --v: (a } .y { color: red }',
  '@media all { .x { --v: (a } } .y { color: red }',
  '.x { --v: (a; } .y { color: blue }',
  '.x { --v: [a } .y { color: red }',
  '.x { --v: calc(1px } .y { color: red }',
  '.x { color: (a } .y { color: red }',
  '.x { --v: (a ) } .y { color: red }',
  '.x { --v: (a  b  }  ',
  '.x { --v: (a  b',
  '.x { --v: [a  b',
  '.x { --v: a(b  c',
  '.x { --v: (a  [b',
  '.x { --v: f(a,  b',
  '.x { --v: "a  b',
  '.x { --v: a  "b',
  '.x { --v: (a  "b',
  '.x { --v: "a }',
  '.x { --v: url(a  b',
  '.x { --v: (a  b ]',
  // Blocks matched by kind, and a ; inside any of them (#294 review).
  '.x { --v: ({a}) } .y { color: red }',
  '.x { --v: (a ] } .y { color: red }',
  '.x { --v: [a } .y { color: red; width: 1px; }',
  '.x { --v: [a; b] } .y { color: red }',
  '.x { --v: [a; b]; color: red }',
  '.x { --v: (a; b]; c) } .y { color: red }',
  '.x { --v: {a; b}; color: red }',
  '.x { --v: [a /* ; */ b; c]; color: red }',
  // A priority inside an unclosed block is part of the value, and one with
  // comments after or inside it is the priority; a ! in a block keeps the
  // value as written; an escaped ) closes nothing (#294 review).
  '.x { --v: [a; !important',
  '.x { --v: {a; !important',
  '.x { --v: (a  !important',
  '.x { --v: (a  b) !important',
  '.x { --v: a !important /* c */; } .y { color: red }',
  '.x { --v: a !/**/important; } .y { color: red }',
  '.x { --v: a/**/!important; } .y { color: red }',
  '.x { --v: (a \\); color: red',
  '.x { --v: (a  !b) } .y { color: red }',
  '.x { --v: (a  !b) (c  d',
  '.x { --v: a /* !important',
  '.x { --v: a !important /* !important',
];
for (const jsdom of [29, 30, '30.1.3'])
  parity(
    `style: an unclosed block in a value runs to the end of the sheet (jsdom ${jsdom}, #264 item 68)`,
    (w) => {
      // (jsdom logs "Could not parse CSS stylesheet" for some: #264 item 67)
      const log = console.error;
      console.error = () => {};
      try {
        return UNCLOSED_SHEETS.map((text) => {
          const d = w.document;
          const style = d.createElement('style');
          style.textContent = text;
          d.head.appendChild(style);
          // (with each declaration's priority: cssText alone does not tell
          // a priority from an !important kept in the value)
          const read = (r) => [r.cssText, ...[...(r.style ?? [])].map((n) => r.style.getPropertyPriority(n))];
          const rules = [...style.sheet.cssRules].map(read);
          style.remove();
          const sheet = new w.CSSStyleSheet();
          sheet.replaceSync(text);
          return [text, rules, [...sheet.cssRules].map(read)];
        });
      } finally {
        console.error = log;
      }
    },
    { jsdom },
  );

// A ; inside a [] or {} block is part of the value in a declaration
// block too (the style attribute, cssText; jsdom 27 and later, black box
// 27.4.0 to 30.1.3; #294 review). 27 and 28's style sheets read these
// otherwise (#264 items 66, 85).
const BLOCK_SEMICOLONS = [
  '--v: [a; b]; color: red',
  '--v: {a; b}; color: red',
  '--v: (a; b]; c); color: red',
  '--v: [a /* ; */ b; c]; color: red',
  '--v: [a; color: red',
  // (#294 review: a priority in an unclosed block, comments around one)
  '--v: [a; !important',
  '--v: {a; !important',
  '--v: (a  !important',
  '--v: a !/**/important; color: red',
  '--v: a !important /* c */; color: red',
  // (the comments before the ! stay in the value; one around the
  // !important is no priority: #294 review)
  '--v: a/**/!/**/important; color: red',
  '--v: a/**/!important /* tail */; color: red',
  '--v: a /**/ !important; color: red',
  '--v: a /* !important',
  '--v: a !important /* !important',
  '--v: a /* x */ !important /* !important',
  // (a line break ends a string: what follows is outside it; #294 review)
  '--v: url("a\nb) !important; color: red',
  '--v: [a "b\n] !important; color: red',
];
for (const jsdom of [27, 28, 29, 30])
  parity(
    `style: a ; inside a block in a declaration block (jsdom ${jsdom}, #294 review)`,
    (w) =>
      BLOCK_SEMICOLONS.map((text) => {
        const d = w.document;
        const attribute = d.createElement('div');
        attribute.setAttribute('style', text);
        const set = d.createElement('div');
        set.style.cssText = text;
        // (27 and 28's declarations are not iterable)
        const priorities = (style) =>
          Array.from({ length: style.length }, (_, i) => style.getPropertyPriority(style[i]));
        return [
          text,
          attribute.style.cssText,
          set.style.cssText,
          set.style.length,
          priorities(attribute.style),
          priorities(set.style),
        ];
      }),
    { jsdom },
  );

test('style: a custom property nested past the stack is kept as written (#286 review)', () => {
  const v = `${'('.repeat(20000)}a`;
  assert.equal(reserializeCustom(v), v);
});

// jsdom 26's own value rules (black box, 26.1.0; #264 items 46, 56, 58):
// flex-grow, flex-shrink, flex-basis, font-weight, font-variant and
// border-spacing are checked (font-weight 0 to 1000, no calc(); a negative
// flex-basis or border-spacing; font-variant normal, small-caps or none,
// keywords in lowercase); a number with a leading zero (01, 00.5) or an
// exponent with a plus (1e+1) outside calc() is invalid in the properties
// it parses; opacity is clamped to 0 to 1 (0% to 100%); a length past
// 1e21 in border, background and flex is invalid.
const JSDOM26_VALUES = {
  'font-weight': [
    '1001',
    '0',
    '1000',
    'bolder',
    'BOLD',
    '1.5',
    'calc(100)',
    'var(--a)',
    'inherit',
    '-0',
    '+100',
    '1e3',
    '01',
    '-1',
    '1px',
    'x',
    'normal 1',
  ],
  'flex-basis': [
    '-1px',
    '0',
    '10%',
    'content',
    'fit-content',
    'max-content',
    'calc(1px + 2px)',
    '1',
    'AUTO',
    '01px',
    '00',
    'x',
    '1px 2px',
    '1000000000000000000000px',
  ],
  'flex-grow': [
    '0',
    '1.5',
    '-0',
    '+2',
    '.5',
    'calc(1)',
    '1e2',
    'inherit',
    '-1',
    '1px',
    '01',
    'x',
    '1 2',
    '1.',
    '1e+1',
    '1e-1',
  ],
  'flex-shrink': ['1', '-0.5', 'calc(2)', '01'],
  'border-spacing': ['-1px', '1px 2px', '1px -2px', '0', '1px 2px 3px', '1%', 'calc(1px)', '2', '01px', 'x'],
  'font-variant': [
    'normal',
    'small-caps',
    'none',
    'SMALL-CAPS',
    'all-small-caps',
    'common-ligatures',
    'small-caps slashed-zero',
    'x',
    '1',
  ],
  // (an integer of 22 digits or more is written with an exponent; #285
  // review)
  width: [
    '00px',
    '01px',
    '0.5px',
    '00.5px',
    '1.px',
    '0.px',
    '1e+1px',
    '1e-1px',
    '010px',
    'calc(01px + 1px)',
    '1e39px',
    '1000000000000000000000px',
    '1234567890123456789012px',
    '100000000000000000000px',
    '0000000000000000000001px',
    '01000000000000000000000px',
    // (Number() rounds an integer past 2 ** 53, and 21 nines to 1e+21;
    // #285 review)
    '999999999999999999999px',
    '999999999999999999949px',
    '123456789012345678901px',
    '99999999999999999999px',
    '1234567890123456789px',
    '9007199254740993px',
    '9007199254740992px',
    '-9007199254740993px',
    // (no leading zero in an exponent either; #285 review)
    '1e01px',
    '1E01px',
    '1e-021px',
    '1e0px',
    '1e-0px',
  ],
  margin: ['1px 01px', '-.5px', '01px', '1e400px', '9007199254740993px 1px'],
  'line-height': ['01', '1.', '001.5', '9007199254740993', '1e01'],
  'font-size': ['01px'],
  color: ['rgb(01, 2, 3)', 'rgb(1, 2, 3)'],
  'background-position': ['01px 2px'],
  'border-width': ['1e+1px', '1000000000000000000000px'],
  // (a big integer stays as written where jsdom 26 does not parse, in
  // strings, url()s and with var(); one with a leading zero is invalid;
  // #285 review)
  'z-index': ['01', '1e+1', '1000000000000000000000'],
  transform: ['scale(01)', 'scale(1000000000000000000000)'],
  '--id': ['1234567890123456789012'],
  content: ['"id 1000000000000000000000 end"'],
  opacity: [
    '2',
    '-1',
    '150%',
    '-1%',
    '1e39',
    '1e400',
    '-1e400',
    '0.5',
    '01',
    '.5',
    '1e1',
    '50%',
    '1e-01',
    // (an integer past Number is clamped too; #285 review)
    '1'.padEnd(401, '0'),
    `-${'1'.padEnd(401, '0')}`,
    `${'1'.padEnd(401, '0')}%`,
  ],
  // (a width that overflows is dropped, the rest kept; #285 review)
  border: [
    '1e39px',
    '1e400px',
    '1e20px solid',
    '1e21px solid red',
    '1000000000000000000000px solid red',
    '1e400px solid',
    'var(--Infinity)',
    '1000000000000000000000px solid var(--c)',
    // (only a width is dropped, not another word or a number without a
    // unit; #285 review)
    'solid notInfinity',
    'solid Infinityx red',
    'Infinitypx solid red',
    '1e21 solid red',
    'solid red 1e21em',
    '-1e21px solid red',
    // (any whitespace separates; only a length is a width, and it still
    // takes the width's place, so a second width is invalid; #285 review)
    '1e21px\tsolid red',
    '1e21px\nsolid red',
    'solid\t1e21px red',
    '1e21px  solid  red',
    '1e21zz solid red',
    '1e21deg solid',
    '1e21% solid',
    '1e21vmin solid',
    '1e21q solid',
    '1e21PX solid red',
    '+1e21px solid red',
    '1e21px 1e21px solid red',
    '1e21px 1px solid red',
    '1px 1e21px solid red',
    '1e21px thin solid',
    '999999999999999999999px solid red',
    '9007199254740993px solid red',
    // (a dropped width is spelled as a number jsdom 26 reads; #285 review)
    '01e21px solid red',
    '1e+21px solid red',
    '1e021px solid red',
    '1.e21px solid red',
    '1e01px solid red',
    '1e00px solid',
    // (every length unit, and calc() as the second width; #285 review)
    '1e21dvh solid',
    '1e21svw solid',
    '1e21lvh solid',
    '1e21cap solid',
    '1e21px solid calc(1px)',
    '1e21px 1dvh solid',
    '1e21px solid 1Q',
    '1e21px solid 0',
    '1e21px solid MEDIUM',
    // (min and max viewport units, a zero spelled otherwise; #285 review)
    '1e21dvmin solid',
    '1e21svmax solid',
    '1e21px solid 1dvmin',
    '1e21px solid 0.0',
    '1e21px solid .0',
    '1e21px solid +0',
    '1e21px solid -0',
    '1e21px solid 0.',
    '1e21px solid 00',
    // (a decimal written out; #285 review)
    '1000000000000000000000.5px solid red',
    '1000000000000000000000.px solid red',
    '999999999999999999999.9px solid',
    '100000000000000000000.5px solid',
  ],
  'border-top': [
    '1e39px',
    '1e39px solid red',
    '1px solid var(--Infinity)',
    'solid Infinity',
    '1e21em\tsolid',
    '01e21px solid',
  ],
  'border-bottom': ['1.e400px solid', '01e400px solid'],
  background: [
    '1e39px',
    'url(sprite+hover.png)',
    'url("e+1.png")',
    'url("Infinity.png")',
    // (an escaped parenthesis in a url; #285 review)
    'url("a\\)01.png") red',
    // (jsdom 26 rejects a quoted url with a parenthesis in it, with or
    // without a number; #285 review)
    'url("a)1e+1.png")',
    'url("a)b.png")',
    'url(a\\)Infinity.png)',
  ],
  'background-image': [
    'url("icon\\)01.png")',
    'url(icon\\)01.png)',
    'url("a\\(01.png")',
    'url("icons/1000000000000000000000/a.png")',
    'url(a/1000000000000000000000)',
    'url(a\\)/1000000000000000000000)',
    'url(a\\)/1000000000000000000000.png)',
  ],
  // (a quoted number; a string with an escaped quote is #264 item 62)
  'font-family': [
    'Font-01 Sans',
    'Font-1 Sans',
    '"01", serif',
    '"Build 1000000000000000000000 Sans"',
    // (jsdom 26 rejects these too; #285 review)
    'Café01 Sans',
    'Café-01 Sans',
    'A\\30 01 Sans',
  ],
  flex: [
    '1e39',
    '1e400',
    '1e400 1',
    '1 1e400',
    '1e21',
    '1e20',
    '1 1 1e39px',
    '01',
    '01 1',
    '1000000000000000000000',
    '1 1000000000000000000000',
    '1 1 1000000000000000000000px',
    '999999999999999999999',
    '1 9007199254740993',
  ],
};
parity(
  "style: jsdom 26's own value rules (jsdom 26, #264)",
  (w) => {
    const d = w.document;
    const out = [];
    for (const [name, values] of Object.entries(JSDOM26_VALUES))
      for (const v of values) {
        const a = d.createElement('div');
        a.style.setProperty(name, v);
        const b = d.createElement('div');
        b.setAttribute('style', `${name}: ${v}`);
        out.push(JSON.stringify([name, v, a.style.getPropertyValue(name), b.style.cssText]));
      }
    return out;
  },
  { jsdom: 26 },
);
// An integer past Number reads as a number, as 1e400 does: Infinity,
// Infinitypx, a border width dropped (black box, 26.1.0; #285 review).
const HUGE = '1'.padEnd(401, '0');
// (2 and 308 zeros is past Number too, though 1e308 is not)
const JUST_PAST = '2'.padEnd(309, '0');
parity(
  'style: an integer past Number is a number, jsdom 26 (#264)',
  (w) => {
    const d = w.document;
    const out = [];
    for (const [name, v] of [
      ['flex-grow', HUGE],
      ['flex-shrink', HUGE],
      ['line-height', HUGE],
      ['margin', `${HUGE}px`],
      ['width', `${HUGE}px`],
      ['flex-basis', `${HUGE}px`],
      ['border-spacing', `${HUGE}px`],
      ['border', `${HUGE}px solid red`],
      ['border-top', `${HUGE}px solid red`],
      ['border', `-${HUGE}px solid red`],
      ['flex', HUGE],
      ['font-weight', HUGE],
      ['flex-grow', JUST_PAST],
      ['width', `${JUST_PAST}px`],
      ['margin', `-${JUST_PAST}px`],
      ['border', `${JUST_PAST}px solid red`],
    ]) {
      const a = d.createElement('div');
      a.style.setProperty(name, v);
      const b = d.createElement('div');
      b.setAttribute('style', `${name}: ${v}`);
      out.push(JSON.stringify([name, v.length, a.style.getPropertyValue(name), b.style.cssText]));
    }
    return out;
  },
  { jsdom: 26 },
);
// Every combination of a few number spellings, and of border parts (a
// smaller copy of the probes that found the #285 review cases).
parity(
  'style: number spellings and border parts in combination, jsdom 26 (#264)',
  (w) => {
    const d = w.document;
    const out = [];
    const read = (name, v) => {
      const a = d.createElement('div');
      a.style.setProperty(name, v);
      const b = d.createElement('div');
      b.setAttribute('style', `${name}: ${v}`);
      out.push(JSON.stringify([name, v.length > 40 ? v.length : v, a.style.getPropertyValue(name), b.style.cssText]));
    };
    const numbers = ['1', '01', '1.', '.5', '9007199254740993', '999999999999999999999', '0000000000000000000001'];
    for (const [name, unit] of [
      ['width', 'px'],
      ['flex-grow', ''],
      ['opacity', '%'],
      ['border-spacing', 'px'],
    ])
      for (const sign of ['', '-'])
        for (const n of numbers)
          for (const e of ['', 'e0', 'e01', 'e-1', 'e+1', 'e21']) read(name, `${sign}${n}${e}${unit}`);
    const parts = [
      '1e21px',
      '1000000000000000000000.5px',
      '1e21lvmax',
      '0.0',
      '1.e21px',
      '01e21px',
      '-1e21px',
      '1e21dvh',
      '1e21',
      '1px',
      'thin',
      'calc(1px)',
      'solid',
      'red',
    ];
    for (const a of parts) for (const b of parts) read('border', `${a} ${b}`);
    return out;
  },
  { jsdom: 26 },
);
// Case in jsdom 26 (black box, 26.1.0; #264 item 46): an element's style
// (setProperty, the attribute) writes keywords and units in the properties
// jsdom 26 parses in lowercase (width: AUTO is auto, 10PX 10px), generic
// families too (Arial, SANS-SERIF is Arial, sans-serif; other names, and
// strings, as written); calc(), url() or a gradient not in lowercase is
// invalid. A style sheet rule keeps the case. (Read with getPropertyValue:
// jsdom 26 lists font's longhands in an element's cssText, #264 item 77.)
const JSDOM26_CASE = {
  width: [
    'AUTO',
    'Auto',
    '10PX',
    '1Em',
    'CALC(1px + 2px)',
    'Calc(1px)',
    'calc(1PX + 2PX)',
    'Initial',
    'VAR(--x)',
    'var(--X)',
  ],
  height: ['AUTO', '2VMIN'],
  top: ['AUTO'],
  left: ['Auto'],
  margin: ['AUTO', 'AUTO 1px AUTO', '1PX 2Px'],
  'margin-top': ['AUTO'],
  padding: ['10PX'],
  'padding-left': ['1EM'],
  float: ['LEFT', 'NONE', 'INLINE-START'],
  clear: ['BOTH', 'NONE'],
  'font-weight': ['BOLD', 'BOLDER'],
  'font-style': ['ITALIC', 'OBLIQUE', 'NORMAL'],
  'font-size': ['MEDIUM', 'X-LARGE', 'SMALLER', '12PX'],
  'line-height': ['NORMAL', '1.5EM'],
  'font-family': [
    'SERIF',
    'Arial, SANS-SERIF',
    'FOO',
    '"SERIF"',
    'SERIF, MONOSPACE',
    'Foo, Serif',
    'EMOJI',
    'MATH',
    'UI-ROUNDED',
    'Foo SERIF',
    // Function-like text and var( in a string is a name (#289 review).
    '"var(--face)", SERIF',
    '"URL(Font)", SERIF',
    // var( after whitespace in a string is a var() to jsdom (#289 review).
    '"a var(--face)", SERIF',
    '"x  var(--a)", SERIF',
  ],
  font: [
    'BOLD 12px Arial',
    '12px SERIF',
    '12px Arial, SANS-SERIF',
    'ITALIC 1PX/1.5 ARIAL',
    'LARGER SERIF',
    '12px FOO',
    '12px "SERIF"',
    '1px "A b", Arial, SERIF',
    'Bold Italic 1px Bold',
    '1px Url(x)',
    // Any whitespace, and a line height with spaces (#289 review).
    'BOLD\t12px\tArial',
    'BOLD\n12px Arial',
    '12px / 1EM SERIF',
    '12px /1EM SERIF',
    '12px/ 1EM SERIF',
    // A function as the size or line height (#289 review).
    'calc(12px) Arial',
    'BOLD calc(12PX) Arial',
    'calc(12px)/1.5 Arial, SERIF',
    'calc(12px) / 1.5 Arial',
    '12px/calc(1EM) SERIF',
    '12px/calc(1EM+2EM) ARIAL',
    '12px "a var(--x)", SERIF',
    // Nested functions, and a slash inside the size (#289 review).
    'BOLD calc(1PX + calc(1EM + calc(1VW + 1VH))) Arial',
    'calc(1PX + 1EM * calc(1VW / 1VH)) / 1EM SERIF',
  ],
  'background-image': ['NONE', 'URL(a.png)', 'url(A.PNG)', 'LINEAR-GRADIENT(red, blue)'],
  'background-position': ['LEFT TOP', 'CENTER 10PX'],
  'background-repeat': ['REPEAT-X', 'NO-REPEAT'],
  'background-attachment': ['FIXED', 'SCROLL'],
  border: ['1px SOLID RED', 'THIN DASHED', '1PX solid RGB(1, 2, 3)'],
  'border-top': ['MEDIUM SOLID CurrentColor'],
  'border-width': ['THIN MEDIUM', '1PX'],
  'border-left-width': ['THICK'],
  'border-style': ['SOLID', 'SOLID DOTTED'],
  'border-right-style': ['DASHED'],
  'border-collapse': ['COLLAPSE'],
  'border-spacing': ['1PX', '1PX 2PX'],
  'flex-basis': ['AUTO', '10PX'],
  flex: ['1 1 AUTO', '1 1 10PX'],
  'flex-grow': ['CALC(1 + 1)'],
  opacity: ['CALC(1)'],
  color: ['RED', 'RGB(1, 2, 3)'],
  display: ['BLOCK'],
  'text-align': ['CENTER'],
  cursor: ['POINTER'],
};
parity(
  "style: keywords and units in jsdom 26's parsed properties in lowercase (jsdom 26, #264 item 46)",
  (w) => {
    const sheet = w.document.head.appendChild(w.document.createElement('style')).sheet;
    return Object.entries(JSDOM26_CASE).flatMap(([name, values]) =>
      values.flatMap((v) => {
        const set = w.document.createElement('div');
        set.style.setProperty(name, v);
        const attr = w.document.createElement('div');
        attr.setAttribute('style', `${name}: ${v}`);
        sheet.insertRule(`div { ${name}: ${v} }`, 0);
        return [
          `${name}: ${v}`,
          set.style.getPropertyValue(name),
          attr.style.getPropertyValue(name),
          sheet.cssRules[0].style.getPropertyValue(name),
        ];
      }),
    );
  },
  { jsdom: 26 },
);
// A unitless zero size keeps a named family's case (jsdom 26 reads 0 as 0px,
// #264 item 83, so only the family is compared; #289 review).
parity(
  'style: a family after a unitless zero font size keeps its case (jsdom 26, #264 item 46)',
  (w) =>
    [
      '0 Arial',
      '.0 Arial',
      '+0 Arial',
      '-0 Arial',
      '0.0 Arial',
      'BOLD 0 Arial',
      'ITALIC 0 SERIF, Arial',
      '0 / 1EM Arial',
      '0/1EM Arial',
    ].map((v) => {
      const e = w.document.createElement('div');
      e.style.setProperty('font', v);
      const read = e.style.getPropertyValue('font');
      return [v, read !== '', read.slice(read.lastIndexOf(' ') + 1)];
    }),
  { jsdom: 26 },
);
// An escaped line break continues a family string, so function-like text
// after it is still in the string: the family is kept, its case too (jsdom
// 26, #289 review). (jsdom 26 then drops the backslash: #264 item 92.)
parity(
  'style: function-like text after an escaped line break in a family string (jsdom 26, #264 item 46)',
  (w) =>
    ['"A\\\nURL(Font)", SERIF', '"A\\\r\nURL(Font)", SERIF', '"A\\\nb", Serif'].map((v) => {
      const e = w.document.createElement('div');
      e.style.setProperty('font-family', v);
      const read = e.style.getPropertyValue('font-family');
      return [v, read !== '', read.replace(/[^A-Z]/g, '')];
    }),
  { jsdom: 26 },
);
// jsdom 26's lowercasing reads a long malformed value in one pass: a
// regular expression retried from every url( without a ) and every quote
// that does not close took 558 ms on 20,000 url( (#289 review).
test('style: jsdom 26 lowercases a long malformed value quickly (#264 item 46)', () => {
  const d = createWindow({ jsdom: '26.1.0' }).document;
  for (const [name, value] of [
    ['width', `A${'url('.repeat(20000)}`],
    ['font', `12px A ${'"\\'.repeat(20000)}`],
    ['font-family', `A, ${"'\\".repeat(20000)}`],
  ]) {
    const e = d.createElement('div');
    const start = performance.now();
    e.style.setProperty(name, value);
    const elapsed = performance.now() - start;
    assert.ok(elapsed < 100, `${name}: ${elapsed} ms`);
  }
});
// A family named like a size keyword after a unitless zero size is a
// family, not the size: the size comes before the first comma (#289 review).
parity(
  'style: a family named Large after a unitless zero font size keeps its case (jsdom 26, #264 item 46)',
  (w) =>
    [
      '.0 Arial, Large',
      '0 Arial, Medium',
      '0 Arial, X-Large',
      'BOLD 0 Arial, Larger',
      '0/1EM Arial, Large',
      '0 Arial, Large, SERIF',
      '0 Large, Arial',
      '0 Medium, Arial',
      '0 Large',
      // A zero with an exponent is a zero size; a size keyword after a
      // family is the size, as jsdom 26 reads it (#289 review).
      '0e0 Arial',
      'BOLD 0e-1 Arial',
      '0E0 Arial, SERIF',
      '.0 Arial Large',
      '.0 Arial Large, SERIF',
      '0 Arial Medium',
      // (no space after the comma: #289 review)
      '0 Large,Arial',
      '0 Arial,Large',
      '12px Arial,SERIF',
    ].map((v) => {
      const e = w.document.createElement('div');
      e.style.setProperty('font', v);
      const read = e.style.getPropertyValue('font');
      // (the capitals: which names kept their case)
      return [v, read !== '', read.replace(/[^A-Z]/g, '')];
    }),
  { jsdom: 26 },
);
// cssstyle 4.3.1 (jsdom 26 with an older cssstyle) has none of these
// rules: border-spacing: 0 stays 0, font-weight: x and opacity: 2 are kept
// (black box, cssstyle 4.3.1 on its own; #285 review).
test("style: jsdom 26's own value rules leave cssstyle 4.3.1 alone", () => {
  const d = createWindow({ jsdom: '26.1.0', cssstyle: '4.3.1' }).document;
  const set = (name, v) => {
    const e = d.createElement('div');
    e.style.setProperty(name, v);
    return e.style.getPropertyValue(name);
  };
  assert.deepEqual(
    [
      ['border-spacing', '0'],
      ['border-spacing', '0.0'],
      ['border-spacing', '00'],
      ['font-weight', 'x'],
      ['opacity', '2'],
      ['flex-grow', '-1'],
    ].map(([name, v]) => set(name, v)),
    ['0', '0.0', '00', 'x', '2', '-1'],
  );
});

// jsdom 26 writes a family string again in double quotes: each escape's
// backslash dropped and the character after it kept (a line break too),
// a quote or backslash in the name escaped (black box, 26.1.0, #264 item
// 92): 'Open Sans' is "Open Sans", "A\<LF>B" is "A<LF>B", "A\41 B" is
// "A41 B". (A line break that is not escaped: item 92.)
parity(
  'style: family strings in double quotes, escapes dropped (jsdom 26, #264 item 92)',
  (w) => {
    const out = [];
    for (const [name, prefix] of [
      ['font-family', ''],
      ['font', '12px '],
    ])
      for (const v of [
        "'Open Sans', serif",
        "'Helvetica Neue', Arial, sans-serif",
        "Arial, 'Segoe UI'",
        "'A'",
        '"A\\\nB", serif',
        "'A\\\nB', serif",
        '"A\\\r\nB", serif',
        '"A\\\fB", serif',
        '"A\\\n\\\nB", serif',
        '"\\\nB"',
        '"A\\41 B", serif',
        '"A\\ B", serif',
        '"A\\b\\c", serif',
        '"A\\-B", serif',
        '"A\\\\B", serif',
        '"A\\\\\\\nB", serif',
        "'A\"B', serif",
        "'A\\\"B', serif",
        '"A\\\nURL(Font)", SERIF',
        // (still dropped: a quote that ends it)
        '"A\\"B", serif',
      ]) {
        const a = w.document.createElement('div');
        a.style.setProperty(name, prefix + v);
        const b = w.document.createElement('div');
        b.setAttribute('style', `${name}: ${prefix}${v}`);
        out.push([name, v, a.style.getPropertyValue(name), a.style.fontFamily, b.style.getPropertyValue(name)]);
      }
    return out;
  },
  { jsdom: 26 },
);

// A shorthand read after one of its longhands is written (phase 2 of #264
// item 78; black box, 26.1.0 to 30.1.3). jsdom 27 and later read flex and
// border-width, -style and -color from the current longhands, in the
// accessor and getPropertyValue (flex: 1 1 0% then flexGrow = 2 is 2 1 0%;
// border-width: 1px then borderTopWidth = 2px is 2px 1px 1px), a border
// or a border side as '' once a side's longhand follows, and font from
// them in the accessor only (getPropertyValue stays as written). jsdom 26
// recomposes flex, font, a border side and border (from border-width,
// -style or -color) in the accessor only. border after border-color or
// border-width in 27 and later, and background, are not modeled.
for (const jsdom of [26, 27, 28, 29, 30])
  parity(
    `style: a shorthand read after one of its longhands is written (jsdom ${jsdom}, #264 item 78)`,
    (w) => {
      const camel = (n) => n.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      const cases = [
        ['flex', '1 1 0%', 'flex-grow', '2'],
        ['flex', '1', 'flex-basis', '10px'],
        ['flex', '1 1 0%', 'flex-shrink', '3'],
        ['border-top', '1px solid red', 'border-top-color', 'blue'],
        ['border-left', '1px solid red', 'border-left-width', '3px'],
        ['border', '1px solid red', 'border-top-color', 'blue'],
        ['border-width', '1px', 'border-top-width', '2px'],
        ['border-width', '1px 2px', 'border-left-width', '3px'],
        ['border-color', 'red', 'border-left-color', 'blue'],
        ['border-style', 'solid', 'border-top-style', 'dashed'],
        ['font', '12px Arial', 'font-size', '14px'],
        ['font', '12px Arial', 'font-family', 'Times'],
        ['font', 'bold 12px/1.5 Arial', 'font-style', 'italic'],
        ['margin', '1px', 'margin-top', '2px'],
        ['flex', '1 1 0%', 'width', '2px'],
      ];
      if (jsdom === 26)
        cases.push(
          ['border', '1px solid red', 'border-color', 'blue'],
          ['border', '1px solid red', 'border-width', '2px'],
        );
      return cases.map(([shorthand, value, longhand, longValue]) => {
        const e = w.document.createElement('div');
        e.style[camel(shorthand)] = value;
        e.style[camel(longhand)] = longValue;
        const a = w.document.createElement('div');
        a.style.setProperty(shorthand, value);
        a.style.setProperty(longhand, longValue);
        return [
          shorthand,
          value,
          longhand,
          e.style[camel(shorthand)],
          e.style.getPropertyValue(shorthand),
          a.style[camel(shorthand)],
          a.style.getPropertyValue(shorthand),
        ];
      });
    },
    { jsdom },
  );

// Shorthand reads after writes in other orders (#313 review): a border
// side read through border is '' once its own longhand follows (jsdom 27
// and later; the other sides keep their value), font-variant is part of
// font, a cached read sees a later write, jsdom 26's border accessor reads
// border-width, -style and -color over its own parts and not a side's
// longhand, and a part before the shorthand that is written again keeps
// the shorthand as written (jsdom 27 and later: the shorthand removed it).
for (const jsdom of [26, 27, 28, 29, 30])
  parity(
    `style: shorthand reads after writes in other orders (jsdom ${jsdom}, #264 item 78)`,
    (w) => {
      const scenarios = {
        fontVariant: (s) => {
          s.font = '12px Arial';
          s.fontVariant = 'small-caps';
          const first = s.font;
          s.fontSize = '14px';
          return [first, s.font];
        },
        flexAgain: (s) => {
          s.flexGrow = '3';
          s.flex = '1 1 0%';
          s.flexGrow = '2';
          const first = s.flex;
          s.flexShrink = '4';
          return [first, s.flex, s.getPropertyValue('flex')];
        },
      };
      if (jsdom > 26) {
        scenarios.sideThroughBorder = (s) => {
          s.border = '1px solid red';
          s.borderTopColor = 'blue';
          return [s.borderTop, s.getPropertyValue('border-top'), s.borderBottom, s.borderColor, s.border];
        };
        scenarios.fontStyleAgain = (s) => {
          s.fontStyle = 'italic';
          s.font = '12px Arial';
          s.fontSize = '14px';
          const first = s.font;
          s.fontStyle = 'oblique';
          return [first, s.font];
        };
        scenarios.widthAgain = (s) => {
          s.borderWidth = '1px';
          s.borderTopWidth = '2px';
          const first = s.borderWidth;
          s.borderTopWidth = '3px';
          return [first, s.borderWidth];
        };
      } else
        scenarios.borderParts = (s) => {
          s.borderTopWidth = '2px';
          s.border = '1px solid red';
          s.borderColor = 'blue';
          const first = s.border;
          s.borderTopWidth = '3px';
          s.borderStyle = 'dashed';
          return [first, s.border];
        };
      return Object.entries(scenarios).map(([name, f]) => [name, f(w.document.createElement('div').style)]);
    },
    { jsdom },
  );
