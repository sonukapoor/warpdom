import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWindow } from '../src/index.js';
import { parity } from './parity.js';

const own = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);

test('style has jsdom\'s shape: methods on CSSStyleDeclaration, properties on CSSStyleProperties', () => {
  const w = createWindow();
  const style = w.document.createElement('div').style;
  assert.ok(style instanceof w.CSSStyleDeclaration && style instanceof w.CSSStyleProperties);
  for (const key of ['cssText', 'length', 'item', 'getPropertyValue', 'getPropertyPriority', 'setProperty', 'removeProperty']) {
    assert.ok(own(w.CSSStyleDeclaration.prototype, key), key);
  }
  for (const key of ['backgroundColor', 'background-color', 'webkitAnimation', 'WebkitAnimation', 'cssFloat']) {
    assert.ok(own(w.CSSStyleProperties.prototype, key), key);
  }
  assert.ok('WebkitAnimation' in style); // React's vendor-prefix detection
  assert.equal(style.WebkitAnimation, '');
  assert.equal(w.document.createElement('div').style === w.document.createElement('div').style, false);
});

test('setting properties serializes like jsdom', () => {
  const el = createWindow().document.createElement('div');
  el.style.backgroundColor = 'red';
  el.style.setProperty('margin-top', '4px', 'important');
  assert.equal(el.style.cssText, 'background-color: red; margin-top: 4px !important;');
  assert.equal(el.style.length, 2);
  assert.equal(el.style.item(0), 'background-color');
  assert.equal(el.style.getPropertyValue('margin-top'), '4px');
  assert.equal(el.style.getPropertyPriority('margin-top'), 'important');
  assert.equal(el.style['background-color'], 'red');
  assert.equal(el.style.cssFloat, '');
  el.style.cssFloat = 'left';
  assert.equal(el.style.getPropertyValue('float'), 'left');
  el.style.webkitTransform = 'none';
  assert.equal(el.style.getPropertyValue('-webkit-transform'), 'none');
});

test('removing properties', () => {
  const el = createWindow().document.createElement('div');
  el.style.color = 'blue';
  el.style.width = '10px';
  el.style.color = '';
  assert.equal(el.style.cssText, 'width: 10px;');
  assert.equal(el.style.removeProperty('width'), '10px');
  assert.equal(el.style.cssText, '');
  el.style.height = '1px';
  el.style.height = null;
  assert.equal(el.style.length, 0);
});

test('the style attribute and the style object stay in sync', () => {
  const el = createWindow().document.createElement('div');
  el.setAttribute('style', 'color: blue; width:10px');
  assert.equal(el.style.color, 'blue');
  assert.equal(el.style.width, '10px');
  assert.equal(el.style.length, 2);
  el.style.color = '';
  assert.equal(el.getAttribute('style'), 'width: 10px;');
  el.setAttribute('style', 'height: 2px');
  assert.equal(el.style.cssText, 'height: 2px;');
  el.removeAttribute('style');
  assert.equal(el.style.length, 0);
});

test('cssText parsing handles semicolons inside url() and quotes', () => {
  const el = createWindow().document.createElement('div');
  el.style.cssText = 'background-image: url(data:image/png;base64,AAA); content: "a;b"; color: red !important';
  assert.equal(el.style.backgroundImage, 'url("data:image/png;base64,AAA")');
  assert.equal(el.style.content, '"a;b"');
  assert.equal(el.style.getPropertyPriority('color'), 'important');
  assert.equal(el.style.length, 3);
});

import { parity as cssParity } from './parity.js';

cssParity('CSS.escape and CSS.supports', (w) => [
  w.CSS.escape('#a.b:c'), w.CSS.escape('1x'), w.CSS.escape('-'), w.CSS.escape('-1a'), w.CSS.escape('\0'), w.CSS.escape('a\x7fb'),
  w.CSS.supports('display', 'grid'), w.CSS.supports('(display: grid)'), w.CSS.supports('foo', 'bar'), w.CSS.supports('display: grid'),
  w.CSS.supports('(display: grid) and (color: red)'), w.CSS.supports('(foo: x) or (color: red)'), w.CSS.supports('--x', '1'), String(w.CSS),
]);

cssParity('removing an absent style property does not add a style attribute', (w) => {
  const div = w.document.createElement('div');
  div.style.color = '';
  div.style.removeProperty('margin');
  const out = [div.outerHTML];
  div.style.color = 'red';
  div.style.color = '';
  out.push(div.outerHTML);
  const other = w.document.createElement('div');
  other.style.cssText = '';
  out.push(other.outerHTML);
  return out;
});

cssParity('style property writes are seen by cached queries', (w) => {
  const d = w.document;
  const e = d.body.appendChild(d.createElement('div'));
  const before = d.querySelectorAll('[style*="red"]').length;
  e.style.color = 'red';
  return [before, d.querySelectorAll('[style*="red"]').length];
});

cssParity('declared zero lengths serialize as 0px', (w) => {
  const d = w.document;
  d.body.innerHTML = '<div id=a style="width:0;margin:0;opacity:0;line-height:0;z-index:0;flex-grow:0;padding:0 0"></div>';
  const a = d.getElementById('a');
  const b = d.createElement('div');
  b.style.width = '0';
  b.style.right = 0;
  b.style.margin = '0 auto';
  b.style.top = '00';
  b.style.left = '-0';
  b.style.flexBasis = '0';
  b.style.setProperty('height', '0');
  b.style.opacity = '0';
  return [
    [a.style.width, a.style.margin, a.style.marginTop, a.style.opacity, a.style.lineHeight, a.style.zIndex, a.style.flexGrow, a.style.padding, a.getAttribute('style')],
    [b.style.width, b.style.right, b.style.margin, b.style.top, b.style.left, b.style.flexBasis, b.style.height, b.style.opacity, b.style.cssText],
  ];
});

cssParity('declared colors serialize as rgb()', (w) => {
  const e = w.document.createElement('div');
  const cases = [['color', '#f00'], ['color', '#ff000080'], ['color', 'rgb(1,2,3)'], ['color', 'rgba(1,2,3,1)'], ['color', 'hsl(120,100%,25%)'],
    ['color', 'red'], ['color', 'Red'], ['color', 'transparent'], ['color', 'currentcolor'], ['border', '1px solid #0f0'],
    ['box-shadow', '0 0 2px #000'], ['background-color', 'RGB(1 2 3)'], ['outline-color', '#abc'], ['fill', '#f00'], ['width', '10px']];
  return cases.map(([p, v]) => { e.removeAttribute('style'); e.style.setProperty(p, v); return e.style.getPropertyValue(p); });
});

cssParity('declared numbers serialize canonically', (w) => {
  const e = w.document.createElement('div');
  const cases = [['opacity', '.5'], ['opacity', '0.50'], ['opacity', '1.0'], ['opacity', '+1'], ['width', '.5px'], ['width', '10.0px'],
    ['line-height', '1.50'], ['margin', '.5em 0'], ['flex-grow', '2.0'], ['transform', 'scale(.5)']];
  return cases.map(([p, v]) => { e.removeAttribute('style'); e.style.setProperty(p, v); return e.style.getPropertyValue(p); });
});

// Zeros in lists of values: 0px in margin, padding, border-width (shortest
// form) and border-spacing; as written elsewhere (react-aria sets
// view-timeline-inset: 0 100dvh).
parity('style: zeros in lists of values', (w) => {
  const cases = [
    ['margin', '0 auto'], ['margin', '0 0'], ['margin', '1px 1px'], ['padding', '0 1px 0 1px'], ['border-width', '1px 2px 1px'],
    ['border-spacing', '0 1px'], ['inset', '0 auto'], ['inset', '0 0'], ['view-timeline-inset', '0 100dvh'], ['scroll-padding', '0 1px'],
    ['border-radius', '0 0'], ['gap', '0 1px'], ['transform-origin', '0 0'], ['translate', '0 1px'], ['inset', '0'], ['width', '0'], ['margin', '0'],
  ];
  return cases.map(([name, value]) => { const s = w.document.createElement('div').style; s.setProperty(name, value); return `${name}: ${s.getPropertyValue(name)}`; });
});

// Shorthands and longhands in a declaration block, as jsdom: longhands are
// read through the shorthands its CSS layer expands (not overflow, outline,
// inset, gap, ...), and margin, padding, flex and background-position are
// composed from their longhands.
const shorthandReads = (w) => {
  const st = () => w.document.createElement('div').style;
  const out = [];
  for (const [sh, v, lh] of [['overflow', 'hidden', 'overflow-x'], ['outline', '1px solid red', 'outline-style'], ['inset', '1px', 'top'], ['gap', '1px 2px', 'column-gap'],
    ['border-radius', '3px', 'border-top-left-radius'], ['place-items', 'center', 'align-items'], ['margin', '1px 2px', 'margin-left'], ['border', '1px solid red', 'border-top-color'],
    ['background', 'red', 'background-color'], ['flex', '2', 'flex-basis'], ['font', 'italic bold 12px/2 Arial', 'line-height'], ['font', '12px Arial', 'font-style']]) {
    const s = st();
    s.setProperty(sh, v);
    out.push(`${sh}: ${v} -> ${lh}=${s.getPropertyValue(lh)}`);
  }
  const m = st();
  m.marginTop = '1px'; m.marginRight = '2px'; m.marginBottom = '1px';
  out.push(m.margin);
  m.marginLeft = '2px';
  out.push(m.margin, m.cssText);
  const f = st();
  f.flexGrow = '2'; f.flexShrink = '0'; f.flexBasis = '10px';
  out.push(f.flex);
  const bg = st();
  bg.backgroundColor = 'red';
  out.push(bg.background);
  for (const v of ['12px Arial', 'italic bold 12px/2 Arial', 'oblique condensed 10px serif', 'bold 14px / 20px Georgia, serif']) {
    const s = st();
    s.font = v;
    out.push(s.font);
  }
  return out;
};
parity('style: shorthand expansion and composition', shorthandReads);
parity('style: shorthand expansion and composition (jsdom 26)', shorthandReads, { jsdom: 26 });

parity('style declarations are indexed and iterable', (w) => {
  const style = w.document.createElement('div').style;
  style.cssText = 'color: red; margin-top: 1px';
  const out = [Object.keys(style), style[0], style[1], style[2], 0 in style, 2 in style, [...style]];
  style.removeProperty('color');
  style.setProperty('width', '1px');
  out.push(Object.keys(style), [...style]);
  style.cssText = '';
  out.push(Object.keys(style), style[0], typeof w.CSSStyleDeclaration.prototype[Symbol.iterator]);
  return out;
});

for (const jsdom of [30, 26]) {
  parity(`function arguments, lists and url() serialize as in jsdom ${jsdom}`, (w) => {
    const style = w.document.createElement('div').style;
    const cases = [['width', 'clamp(10px,20%,3em)'], ['width', 'min(50%,  100px)'], ['top', 'max(1px , 10vh)'],
      ['background-image', 'linear-gradient(to right,#FFF,rgb(0,0,0))'], ['background-image', 'linear-gradient(red,blue),url(a.png)'],
      ['background', 'url(a.png) no-repeat'], ['background-image', "url('a.png') , url(\"b.png\")"], ['border-image', 'linear-gradient(red,blue) 1'],
      ['border-image-source', 'linear-gradient(red,blue)'], ['transform', 'translate(min(1px,5%),2px)'], ['transform', 'translate(1px,2px)'],
      ['font-family', 'Arial ,"Helvetica Neue",  sans-serif'], ['font', 'bold 12px/1.5 Arial,sans-serif'], ['content', 'url(a.png)'],
      ['cursor', 'url(a.png),auto'], ['filter', 'url(#f)'], ['mask-image', 'url(a.png)'], ['list-style-image', 'url(a.png)'],
      ['box-shadow', '0 0 1px rgba(0,0,0,.5),0 1px red'], ['--x', 'url(a.png)'], ['transition', 'opacity 1s,transform 2s']];
    return cases.map(([name, value]) => { style.cssText = ''; style.setProperty(name, value); return style.getPropertyValue(name); });
  }, { jsdom });
}

parity('custom properties keep their value as written; integers keep their digits', (w) => {
  const style = w.document.createElement('div').style;
  const out = [];
  for (const [name, value] of [['--one', '1'.repeat(25)], ['--x', '1.50'], ['--y', ' .5  px '], ['--z', '#FFF'], ['--w', '0'], ['z-index', '+007'], ['opacity', '1.0'], ['flex-grow', '+2']]) {
    style.setProperty(name, value);
    out.push(style.getPropertyValue(name));
  }
  return out;
});

parity('null, undefined and custom property names in style declarations', (w) => {
  const style = w.document.createElement('div').style;
  const out = [];
  style.color = 'red';
  style.setProperty('color', undefined);
  out.push(style.color);
  style.color = undefined;
  out.push(style.color);
  style.setProperty('color', 'blue', null);
  out.push(style.color, style.getPropertyPriority('color'));
  style.setProperty('color', null);
  out.push(style.color);
  style.setProperty('--Foo', '1');
  out.push(style.getPropertyValue('--Foo'), style.getPropertyValue('--foo'), style.cssText, style[0]);
  style.cssText = '--Bar: 2';
  out.push(style.getPropertyValue('--Bar'), style.getPropertyValue('--bar'), w.CSSStyleDeclaration.prototype.setProperty.length);
  return out;
});

parity('background-position and its longhands', (w) => {
  const style = w.document.createElement('div').style;
  const out = [];
  for (const value of ['left 10px top 20px', '10px 20px', 'center', 'top', 'top left', 'right 5% bottom', 'top 10px left', 'top 10px left 20px', 'left, top, 10px', '0 0', '50% 0', '10px left']) {
    style.cssText = '';
    style.backgroundPosition = value;
    out.push([style.backgroundPosition, style.backgroundPositionX, style.backgroundPositionY, style.cssText]);
  }
  style.cssText = '';
  style.backgroundPositionX = 'right 10px';
  style.backgroundPositionY = 'bottom 20px';
  out.push(style.backgroundPosition, style.cssText);
  return out;
});

parity('the background shorthand sets its longhands per layer', (w) => {
  const style = w.document.createElement('div').style;
  const names = ['image', 'position', 'position-x', 'position-y', 'size', 'repeat', 'attachment', 'origin', 'clip', 'color'];
  return ['url(a.png) 10px 20px / 30px 40px no-repeat red', 'red', 'url(a.png)', 'url(a.png) center / cover, blue', 'none',
    'linear-gradient(red,blue) fixed', 'url(a.png) repeat-x content-box padding-box', 'url(a.png) 10px/20px'].map((value) => {
    style.cssText = '';
    style.background = value;
    return names.map((n) => style.getPropertyValue(`background-${n}`));
  });
});

parity('computed styles: removing a value throws; CSS.supports edge cases', (w) => {
  const cs = w.getComputedStyle(w.document.body);
  const t = (f) => { try { return f(); } catch (e) { return e.name; } };
  return [
    t(() => { cs.color = ''; return cs.color; }), t(() => { cs.webkitTransition = ''; return 1; }), t(() => { cs.width = null; return 1; }),
    t(() => { cs.width = '10px'; return cs.width; }),
    w.CSS.supports(' color', 'red'), w.CSS.supports('color ', 'red'), w.CSS.supports('(color: red) AND (display: block)'),
    w.CSS.supports('(color: red) OR (display: x)'), w.CSS.supports('NOT (color: x)'), w.CSS.supports('COLOR', 'red'),
  ];
});

for (const jsdom of [30, 26]) {
  parity(`cssText: a normal declaration after an important one (jsdom ${jsdom})`, (w) => {
    const style = w.document.createElement('div').style;
    style.cssText = 'color: red !important; color: blue';
    const out = [style.color, style.getPropertyPriority('color')];
    style.cssText = 'padding: 10px !important; padding-left: 20px;';
    out.push(style.getPropertyValue('padding-left'));
    return out;
  }, { jsdom });
}

parity('CSS-wide keywords serialize lowercased', (w) => {
  const style = w.document.createElement('div').style;
  return [['color', 'INHERIT'], ['margin', 'Initial'], ['display', 'UNSET'], ['flex', 'INITIAL'], ['--x', 'INHERIT']].map(([name, value]) => {
    style.cssText = '';
    style.setProperty(name, value);
    return style.getPropertyValue(name);
  });
});

parity('background-repeat serializes in its shortest form', (w) => {
  const style = w.document.createElement('div').style;
  return ['repeat repeat', 'repeat no-repeat', 'no-repeat repeat', 'space round', 'no-repeat no-repeat', 'repeat-x', 'round round, repeat no-repeat'].map((value) => {
    style.cssText = '';
    style.backgroundRepeat = value;
    return style.backgroundRepeat;
  });
});

// jsdom 26 and earlier (cssstyle 4) parse a few dozen properties and keep
// the others' values as written: min-height: 0 stays 0 (svelte's slide
// transition writes it), 0.0 and +.5 are not shortened.
const unparsed = (w) => {
  const out = [];
  for (const name of ['min-height', 'max-width', 'gap', 'letter-spacing', 'border-radius', 'inset', 'translate', 'outline-width', 'vertical-align', 'display', 'transform']) {
    for (const value of ['0', '0.0', '+.5', '1px  2px', 'translateX(45PX)']) {
      const e = w.document.createElement('div');
      e.style.setProperty(name, value);
      out.push(e.style.getPropertyValue(name));
    }
  }
  const e = w.document.createElement('p');
  e.style.cssText = 'overflow: hidden;opacity: 0;border-top-width: 0.5px;min-height: 0';
  out.push(e.getAttribute('style'), e.style.minHeight);
  return out;
};
parity('style: properties jsdom does not parse keep their values (jsdom 25)', unparsed, { jsdom: 25 });
parity('style: properties jsdom does not parse keep their values (jsdom 26)', unparsed, { jsdom: 26 });

// url() in background and background-image: without quotes before
// cssstyle 4.3.1 (jsdom 25 as svelte installs it), quoted after.
const urls = (w) => {
  const d = w.document;
  const out = [];
  for (const value of ['url(a.png)', 'url("a.png")', "url('https://example.com/foo.jpg')", 'url(data:image/png;base64,AAA=)', 'url("")']) {
    for (const name of ['background-image', 'background', 'list-style-image']) {
      const e = d.createElement('div');
      e.style.setProperty(name, value);
      out.push(e.style.getPropertyValue(name));
    }
  }
  const div = d.body.appendChild(d.createElement('div'));
  div.setAttribute('style', "background-image: url('x.png'); color: red;");
  out.push(div.style.backgroundImage, w.getComputedStyle(div).backgroundImage);
  div.style.setProperty('--v', 'rgba(0, 0, 0, 1)');
  out.push(div.getAttribute('style'), div.outerHTML);
  return out;
};
parity('style: url() serialization (jsdom 25)', urls, { jsdom: 25 });
parity('style: url() serialization (jsdom 26)', urls, { jsdom: 26 });

test('style: url() quotes follow the cssstyle jsdom 26 and earlier load', () => {
  const image = (options) => {
    const e = createWindow(options).document.createElement('div');
    e.style.backgroundImage = 'url("a.png")';
    return e.style.backgroundImage;
  };
  assert.equal(image({ jsdom: '25.0.1', cssstyle: '4.3.0' }), 'url(a.png)');
  assert.equal(image({ jsdom: '25.0.1', cssstyle: '4.3.1' }), 'url("a.png")');
  assert.equal(image({ jsdom: 25 }), 'url("a.png")');
  assert.equal(image({ jsdom: 30, cssstyle: '4.1.0' }), 'url("a.png")');
});

// The font shorthand of cssstyle before 4.4 (jsdom 20 to 25): each word
// goes to every font longhand that accepts it, and font reads as those
// longhands in a fixed order (20px Arial is "Arial 20px 20px"); setting
// font drops the longhands set before and moves it to the end.
// Excalidraw's text editor snapshot (jsdom 22) records it.
const legacyFonts = (w) => {
  const d = w.document;
  const out = [];
  const read = (s) => [s.cssText, s.font, s.fontFamily, s.fontSize, s.fontStyle, s.fontVariant, s.fontWeight, s.lineHeight];
  for (const value of ['20px Excalifont, Xiaolai, sans-serif, Segoe UI Emoji', 'bold 12px Arial', 'italic bold 12px/30px Georgia, serif',
    '12px / 1.5 "A B"', 'normal normal 400 16px/normal system-ui', 'small-caps 1.2em serif', 'LARGE Arial', 'xxx-large a', '12px red',
    '1 x', '0 x', '450 x', '1.5 x', 'calc(1px + 2px) x', '12px var(--a)', 'inherit', 'initial', 'caption', '12PX ARIAL']) {
    const s = d.createElement('div').style;
    s.font = value;
    out.push(read(s));
  }
  // Excalidraw's text editor: font, then line height, set again on each update.
  const s = d.createElement('div').style;
  Object.assign(s, { margin: 0, zIndex: 'var(--z)' });
  for (let i = 0; i < 2; i++) Object.assign(s, { font: '20px Excalifont, Xiaolai, sans-serif, Segoe UI Emoji', lineHeight: 1.25, width: '10px', opacity: 1 });
  s.fontFamily = 'Excalifont, Xiaolai, sans-serif, Segoe UI Emoji';
  out.push(read(s));
  for (const steps of [[['fontWeight', 'bold'], ['font', '20px Arial']], [['font', '20px Arial'], ['font', '1']], [['font', '20px Arial'], ['fontWeight', 'bold'], ['font', '']],
    [['font', '20px Arial'], ['font', 'inherit']], [['font', 'bold 20px Arial'], ['fontFamily', 'Foo']]]) {
    const t = d.createElement('div').style;
    for (const [k, v] of steps) t[k] = v;
    out.push(read(t));
  }
  for (const text of ['font-weight: bold; font: 20px Arial; color: red', 'font: 20px Arial; color: red; font: 12px b', 'font: 20px Arial !important', 'font-weight: bold; font: inherit']) {
    const e = d.createElement('div');
    e.setAttribute('style', text);
    out.push(read(e.style));
  }
  return out;
};
parity('style: the font shorthand (jsdom 22)', legacyFonts, { jsdom: 22 });
parity('style: the font shorthand (jsdom 25)', legacyFonts, { jsdom: 25 });
parity('style: the font shorthand (jsdom 20)', legacyFonts, { jsdom: 20 });

// cssstyle 4.2.0 to 4.3.1 (black box): numbers with exponents, more units,
// and var() is not a font family.
test('style: the font shorthand of cssstyle 4.2 and 4.3', () => {
  const font = (options, value) => {
    const s = createWindow(options).document.createElement('div').style;
    s.font = value;
    return [s.cssText, s.fontFamily, s.lineHeight];
  };
  assert.deepEqual(font({ jsdom: '25.0.1', cssstyle: '4.1.0' }, '1.5e1 Arial'), ['font: Arial;', 'Arial', '']);
  assert.deepEqual(font({ jsdom: '25.0.1', cssstyle: '4.3.0' }, '1.5e1 Arial'), ['font: Arial 1.5e1;', 'Arial', '1.5e1']);
  assert.deepEqual(font({ jsdom: '25.0.1', cssstyle: '4.1.0' }, '12px var(--a)'), ['font: var(--a) 12px 12px;', 'var(--a)', '12px']);
  assert.deepEqual(font({ jsdom: '26.1.0', cssstyle: '4.3.1' }, '12px var(--a)'), ['', '', '']);
  assert.deepEqual(font({ jsdom: '25.0.1', cssstyle: '4.3.0' }, '20px 1turn'), ['', '', '']);
});

// jsdom 20 to 26 (cssstyle 2 to 4): setting flex, background, border or a
// border side removes it and its longhands and adds it at the end, so a
// re-set (React updating a changed style) moves it; other properties stay
// in place. ant-design's Layout.Sider and Progress snapshots show it.
const resets = (w) => {
  const d = w.document;
  const run = (f) => { const s = d.createElement('div').style; f(s); return [s.cssText, s.length, s[0]]; };
  const props = { flex: ['0 0 200px', '0 0 80px'], background: ['red', 'blue'], border: ['1px solid red', '2px solid red'], borderTop: ['1px solid red', '1px solid red'],
    borderLeft: ['1px solid red', '2px dashed red'], margin: ['1px', '2px'], padding: ['1px', '1px'], color: ['red', 'blue'], borderColor: ['red', 'blue'], outline: ['1px solid red', '2px solid red'] };
  const out = Object.entries(props).map(([p, [a, b]]) => run((s) => { s[p] = a; s.maxWidth = '1px'; s.setProperty('--x', '1'); s[p] = b; }));
  out.push(run((s) => { s.flex = '1 1 0px'; s.width = '1px'; s.setProperty('flex', '1 1 0px', 'important'); }));
  out.push(run((s) => { s.flexGrow = '2'; s.flexBasis = '1px'; s.width = '1px'; s.flex = '1 1 0px'; }));
  out.push(run((s) => { s.backgroundColor = 'red'; s.backgroundImage = 'none'; s.backgroundSize = 'auto'; s.width = '1px'; s.background = 'blue'; }));
  out.push(run((s) => { s.borderTop = '1px solid red'; s.borderLeftColor = 'red'; s.borderWidth = '1px'; s.width = '1px'; s.border = '2px solid blue'; }));
  out.push(run((s) => { s.borderTopWidth = '1px'; s.borderLeftWidth = '1px'; s.width = '1px'; s.borderTop = '2px solid blue'; }));
  out.push(run((s) => { s.cssText = 'flex: 1 1 0px; width: 1px; flex: 2 2 0px'; }));
  out.push(run((s) => { s.flex = '1 1 0px'; s.width = '1px'; s.flex = 'foo'; }));
  return out;
};
for (const jsdom of [26, 25, 22, 20]) parity(`style: re-setting flex, background and border moves them to the end (jsdom ${jsdom})`, resets, { jsdom });

// A var() value is set in place, except flex's from cssstyle 4.4 (jsdom 26).
parity('style: a var() value of background and border is set in place (jsdom 26)', (w) => {
  const run = (p, a, b) => { const s = w.document.createElement('div').style; s.setProperty(p, a); s.width = '1px'; s.setProperty(p, b); return s.cssText; };
  return [run('background', 'red', 'var(--a)'), run('border', '1px solid red', 'var(--a)'), run('border-top', '1px solid red', 'var(--a)'), run('flex', '1 1 0px', 'var(--a)'),
    run('background', 'var(--a)', 'red'), run('flex', 'var(--a)', '1 1 0px')];
}, { jsdom: 26 });

test('style: a re-set flex is a style attribute change (jsdom 26)', () => {
  const w = createWindow({ jsdom: 26 });
  const el = w.document.createElement('div');
  el.style.flex = '1 1 0px';
  el.style.width = '1px';
  const observer = new w.MutationObserver(() => {});
  observer.observe(el, { attributes: true });
  el.style.flex = '1 1 0px';
  assert.equal(el.getAttribute('style'), 'width: 1px; flex: 1 1 0px;');
  assert.ok(observer.takeRecords().length > 0);
});

// jsdom 26 (cssstyle 4.3.1 and later) simplifies calc() of two terms in
// lengths: same units added, products computed, terms sorted (numbers,
// percentages, units alphabetically), whitespace normalized; ant-design's
// Table sets width: calc(700px + 50%) and snapshots calc(50% + 700px).
// Earlier cssstyle (jsdom 25) keeps calc() as written.
const calcs = (w) => {
  const values = ['calc(700px + 50%)', 'calc(50% + 700px)', 'calc(100% - 10px)', 'calc(10px - 100%)', 'calc(-10px + 100%)', 'calc(100% + -10px)', 'calc(1px + 2px)',
    'calc(0.1px + 0.2px)', 'calc(2em - 1em)', 'calc(1PX + 1px)', 'calc(10px - 10px)', 'calc(2 * 10px)', 'calc(10px*2)', 'calc(100% / 3)', 'calc(1.5 * 100%)', 'calc(10px / 2 + 50%)',
    'calc( 100%  -  10px )', 'calc(10px + 2em)', 'calc(5vw + 10px)', 'calc(1px - 2em)', 'calc(100vh - 64px)', 'calc(5vw - 10px)', 'calc(1em - 50%)', 'calc(10px - 5)', 'calc(-50% - -10px)',
    'calc(-0px + 50%)', 'calc(100% - 0px)', 'calc(+10px + 50%)', 'calc(100% - +10px)', 'calc(.5px + 50%)', 'calc(1.0000001px + 1em)', 'calc(100% - 1e1px)', 'calc(1px)', 'calc(1)',
    'calc(1px+1px)', 'calc(var(--a) + 10px)', 'calc(1234567px + 1px)'];
  const props = ['width', 'margin-left', 'padding', 'top', 'font-size', 'flex-basis', 'min-width', 'gap'];
  const s = w.document.createElement('div').style;
  return values.map((v) => props.map((p) => { s.setProperty(p, v); const r = s.getPropertyValue(p); s.removeProperty(p); return r; }));
};
parity('style: calc() simplified in lengths (jsdom 26)', calcs, { jsdom: 26 });
parity('style: calc() as written (jsdom 25)', calcs, { jsdom: 25 });

// jsdom 26 (cssstyle 4.3.1 and later) writes whitespace runs in background
// and background-image as one space (ant-design's Progress demo writes a
// gradient over several lines).
parity('style: whitespace in background values (jsdom 26)', (w) => {
  const s = w.document.createElement('div').style;
  const gradient = 'linear-gradient(\n  to right,\n  hsla(180, 85%, 65%, 1),\n  hsla(210, 90%, 55%, 0.95)\n)';
  const out = [];
  for (const [p, v] of [['background-image', gradient], ['background', `${gradient} no-repeat`], ['background-image', 'linear-gradient(  to right,   red,\tblue )'],
    ['transition', 'opacity 1s,\n  color 2s'], ['box-shadow', '0 0 1px red,\n  0 0 2px blue'], ['border-image', gradient]]) {
    s.setProperty(p, v);
    out.push(s.getPropertyValue(p));
    s.removeProperty(p);
  }
  return out;
}, { jsdom: 26 });
