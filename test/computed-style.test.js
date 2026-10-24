import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWindow } from '../src/index.js';
import { parity } from './parity.js';
import { S } from '../src/internal.js';

test('getComputedStyle returns a read-only declaration with inline values', () => {
  const w = createWindow();
  const el = w.document.body.appendChild(w.document.createElement('div'));
  el.style.width = '10px';
  const cs = w.getComputedStyle(el);
  assert.ok(cs instanceof w.CSSStyleDeclaration);
  assert.equal(cs.width, '10px');
  assert.equal(cs.getPropertyValue('width'), '10px');
  el.style.width = '20px';
  assert.equal(cs.width, '20px', 'live');
  assert.throws(() => cs.setProperty('color', 'red'), { name: 'NoModificationAllowedError' });
});

test('default display follows the HTML rendering rules', () => {
  const w = createWindow();
  const d = (tag) => w.getComputedStyle(w.document.body.appendChild(w.document.createElement(tag))).display;
  assert.equal(d('div'), 'block');
  assert.equal(d('span'), 'inline');
  assert.equal(d('li'), 'list-item');
  assert.equal(d('table'), 'table');
  assert.equal(d('td'), 'table-cell');
  assert.equal(d('button'), 'inline-block');
  assert.equal(d('script'), 'none');
  const hidden = w.document.body.appendChild(w.document.createElement('div'));
  hidden.hidden = true;
  assert.equal(w.getComputedStyle(hidden).display, 'none');
  hidden.style.display = 'flex';
  assert.equal(w.getComputedStyle(hidden).display, 'flex', 'inline style wins over the default');
});

test('inherited properties come from the nearest ancestor that sets them', () => {
  const w = createWindow();
  const outer = w.document.body.appendChild(w.document.createElement('div'));
  const inner = outer.appendChild(w.document.createElement('span'));
  outer.style.visibility = 'hidden';
  outer.style.color = 'red';
  outer.style.width = '5px';
  const cs = w.getComputedStyle(inner);
  assert.equal(cs.visibility, 'hidden');
  assert.equal(cs.color, 'rgb(255, 0, 0)');
  assert.equal(cs.width, 'auto', 'width is not inherited: its initial value');
  assert.equal(w.getComputedStyle(w.document.body).visibility, 'visible');
  assert.equal(w.getComputedStyle(w.document.body).pointerEvents, 'auto');
});

const SHEET = `
.a{color:red;width:10px;padding:8px;margin:1px 2px}
div.a{color:blue}
#x{width:20px}
.b{width:30px !important}
.c{font-size:16px;font-family:Roboto;font-weight:700;cursor:pointer;opacity:.5;visibility:hidden}
@media (min-width: 600px){.m{width:600px}}
@supports (display:grid){.s{width:77px}}
.d{color:rgb(255, 0, 0);background-color:pink;border:1px solid red;flex-wrap:wrap;display:flex}
.e{width:calc(100% - 10px)}
.f > .g{width:5px}
.h{color:inherit}
.q{color:#f00;background:#00ff0080;margin:0 auto}
[data-x="1"]{width:11px} .u:not(.v){width:12px} .w:hover{width:13px}
.bad::-moz-thing{width:1px} .ok{width:14px}
.p1{padding:1px 2px 3px} .p2{padding-top:9px} .p2{padding:4px}
.fx{flex:1}
`;

parity('getComputedStyle: the cascade over style sheets', (w) => {
  const d = w.document;
  const style = d.createElement('style');
  style.textContent = SHEET;
  d.head.appendChild(style);
  const make = (cls, parent = d.body) => {
    const e = d.createElement('div');
    e.className = cls;
    parent.appendChild(e);
    return e;
  };
  const cs = (e, ...props) => props.map((p) => w.getComputedStyle(e).getPropertyValue(p));
  const a = make('a');
  a.id = 'x';
  const b = make('b');
  b.style.width = '1px';
  const c = make('c');
  const span = c.appendChild(d.createElement('span'));
  const f = make('f');
  const g = make('g', f);
  const u = make('');
  u.setAttribute('data-x', '1');
  const late = make('late');
  style.sheet.insertRule('.late{width:9px}', style.sheet.cssRules.length);
  const inline = make('');
  inline.style.color = 'pink';
  return {
    a: cs(a, 'color', 'width', 'padding', 'padding-top', 'margin-left', 'margin'),
    importantBeatsInline: cs(b, 'width'),
    inherited: cs(span, 'font-size', 'font-family', 'font-weight', 'cursor', 'opacity', 'visibility', 'width'),
    conditional: [...cs(make('m'), 'width'), ...cs(make('s'), 'width')],
    d: cs(
      make('d'),
      'color',
      'background-color',
      'border',
      'border-top-color',
      'border-top-width',
      'flex-wrap',
      'display',
    ),
    calc: cs(make('e'), 'width'),
    child: cs(g, 'width'),
    inherit: cs(make('h'), 'color'),
    q: cs(make('q'), 'color', 'background-color', 'background', 'margin-left', 'margin-top'),
    selectors: [...cs(u, 'width'), ...cs(make('u'), 'width'), ...cs(make('w'), 'width'), ...cs(make('ok'), 'width')],
    insertRule: cs(late, 'width'),
    inline: cs(inline, 'color'),
    box: [...cs(make('p1'), 'padding-left', 'padding'), ...cs(make('p2'), 'padding-top')],
    flex: cs(make('fx'), 'flex-grow', 'flex-shrink'),
    defaults: cs(
      make(''),
      'width',
      'height',
      'opacity',
      'position',
      'z-index',
      'font-size',
      'font-weight',
      'background-color',
      'border-top-width',
      'border-top-color',
      'flex-direction',
      'box-sizing',
      'float',
      'max-width',
      'min-width',
      'color',
      'fill',
      'visibility',
    ),
  };
});

parity('getComputedStyle: style changes are seen', (w) => {
  const d = w.document;
  const e = d.body.appendChild(d.createElement('div'));
  e.className = 'x';
  const color = () => w.getComputedStyle(e).color;
  const out = [color()];
  const style = d.createElement('style');
  style.textContent = '.x{color:red}';
  d.head.appendChild(style);
  out.push(color());
  style.firstChild.data = '.x{color:blue}';
  out.push(color());
  style.sheet.cssRules[0].style.color = 'green';
  out.push(color());
  e.className = 'y';
  out.push(color());
  e.className = 'x';
  style.remove();
  out.push(color());
  return out;
});

parity('getComputedStyle: hidden and display', (w) => {
  const d = w.document;
  d.head.innerHTML = '<style>.f{display:flex}</style>';
  d.body.innerHTML =
    '<div hidden id=a style="display:flex"></div><div hidden class=f id=b></div><div class=f id=c></div><span id=d></span>';
  return ['a', 'b', 'c', 'd'].map((id) => w.getComputedStyle(d.getElementById(id)).display);
});

test('getComputedStyle: shadow trees use their own style sheets', () => {
  const w = createWindow();
  const d = w.document;
  d.head.innerHTML = '<style>.z{width:1px;color:red}</style>';
  const host = d.body.appendChild(d.createElement('div'));
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = '<style>.z{width:3px}</style><div class="z"></div>';
  host.style.color = 'blue';
  const inner = root.lastChild;
  assert.equal(w.getComputedStyle(inner).width, '3px');
  assert.equal(w.getComputedStyle(inner).color, 'rgb(0, 0, 255)', 'inherits from the host, not document rules');
});

// jsdom (20 to 30) does not substitute var(): a value with var() computes
// to itself and inherits so (jest-dom's toHaveStyle({ color:
// 'var(--accent-color)' }) passes on it; wire-webapp's tests rely on it).
// Custom properties are inherited from jsdom 29 on; there currentcolor is
// transparent when the color is a var() value.
const varScenario = (w) => {
  const d = w.document;
  d.head.innerHTML =
    '<style>:root{--size:7px} .p{color:var(--c);visibility:var(--v)} .v{width:var(--size);height:var(--missing, 8px);' +
    'font-weight:var(--fw);display:var(--d, block);font-size:calc(var(--size) * 2);border-top-style:solid;--own:1px;--ref:var(--own)}</style>';
  d.body.innerHTML =
    '<div class=p><span class=v id=a style="margin-top:var(--size);color:var(--accent-color)"></span><i id=b></i></div>';
  return ['a', 'b'].map((id) => {
    const cs = w.getComputedStyle(d.getElementById(id));
    return [
      'width',
      'height',
      'font-weight',
      'display',
      'font-size',
      'margin-top',
      'color',
      'visibility',
      'border-top-color',
      '--size',
      '--own',
      '--ref',
    ].map((p) => cs.getPropertyValue(p));
  });
};
parity('getComputedStyle: var() is not substituted', varScenario);
parity('getComputedStyle: var() is not substituted (jsdom 26)', varScenario, { jsdom: 26 });
parity('getComputedStyle: var() is not substituted (jsdom 22)', varScenario, { jsdom: 22 });

test('getComputedStyle: disabled style sheets', () => {
  const w = createWindow();
  const d = w.document;
  d.head.innerHTML = '<style>.v{width:7px}</style>';
  const e = d.body.appendChild(d.createElement('div'));
  e.className = 'v';
  const cs = w.getComputedStyle(e);
  assert.equal(cs.width, '7px');
  // As in jsdom (27 to 30.1.3), flex-flow does not set its longhands; a
  // deliberate deviation: jsdom still applies a disabled style sheet.
  e.style.flexFlow = 'column wrap';
  assert.deepEqual([cs.flexDirection, cs.flexWrap, cs.flexFlow], ['row', 'nowrap', 'column wrap']);
  d.styleSheets[0].disabled = true;
  assert.equal(cs.width, 'auto');
});

parity('getComputedStyle: shorthands', (w) => {
  const d = w.document;
  d.head.innerHTML = '<style>.r{background:red;border:1px solid red;outline:2px solid blue;color:red}</style>';
  d.body.innerHTML =
    '<div class=r id=a></div><div id=b style="background:red;border:1px solid red;outline:2px solid blue;color:red;border-color:green"></div><div id=c></div>';
  const props = [
    'background',
    'border',
    'outline',
    'color',
    'border-color',
    'border-top-color',
    'background-color',
    'border-top',
    'border-width',
    'margin',
  ];
  return ['a', 'b', 'c'].map((id) => {
    const cs = w.getComputedStyle(d.getElementById(id));
    return props.map((p) => cs.getPropertyValue(p));
  });
});

// jsdom 26 (bundled with jest-environment-jsdom in Jest 30): undeclared
// properties compute to '' apart from a few.
const legacyScenario = (w) => {
  const d = w.document;
  d.head.innerHTML =
    '<style>.r{width:10px;transform:scale(2);color:red;font-size:20px}.p{font-size:14px;visibility:hidden;cursor:pointer}</style>';
  d.body.innerHTML =
    '<div class=p id=p><span id=c></span></div><div class=r id=r></div><div id=i style="opacity:.5;margin:0 auto;color:#f00"></div><div id=h hidden></div>' +
    '<div id=par style="color:blue;pointer-events:none;visibility:collapse"><b id=kid>x</b></div>';
  const cs = (el, ...ps) => ps.map((p) => w.getComputedStyle(el).getPropertyValue(p));
  const byId = (id) => d.getElementById(id);
  const tags = [
    'div',
    'span',
    'p',
    'li',
    'table',
    'td',
    'button',
    'input',
    'a',
    'section',
    'script',
    'img',
    'ul',
    'tr',
    'em',
  ];
  return {
    child: cs(byId('c'), 'font-size', 'visibility', 'cursor', 'color', 'display'),
    rule: cs(byId('r'), 'width', 'transform', 'color', 'font-size', 'height', 'opacity'),
    inline: cs(byId('i'), 'opacity', 'margin-top', 'color', 'background-color', 'pointer-events'),
    hidden: cs(byId('h'), 'display'),
    inherited: cs(byId('kid'), 'color', 'pointer-events', 'visibility', 'display'),
    body: cs(
      d.body,
      'display',
      'visibility',
      'color',
      'background-color',
      'pointer-events',
      'font-family',
      'border-top-width',
      'border-top-color',
      'outline-color',
      'z-index',
      'filter',
    ),
    displays: tags.map((t) => cs(d.body.appendChild(d.createElement(t)), 'display')[0]),
  };
};
parity('getComputedStyle: jsdom 26 profile', legacyScenario, { jsdom: 26 });

// The user agent style sheet (src/ua-sheet.js) under the page's: jsdom
// before 27 an older browser's (body margin 8px, classic form controls,
// sectioned h1), from 27 the HTML standard's rendering section, whose
// !important declarations win over the page's from 28.1.0. floating-ui
// subtracts body's inline margins from the viewport width it clips to:
// with jsdom 26's 8px each it got -16 and flipped, which decided whether
// Mantine's popover settled before the test ended (#80).
const uaScenario = (w, skip = []) => {
  const d = w.document;
  d.head.innerHTML = '<style>.z{margin:0}.o{overflow:visible}.b{display:block}.m{margin-left:3px}</style>';
  d.body.innerHTML =
    '<h1 id=h1>a</h1><section><h1 id=sh1>b</h1></section><hr id=hr><pre id=pre></pre><p id=p class=m></p><b id=b></b>' +
    '<ul id=ul><li id=li><ul id=ul2><li><ul id=ul3></ul></li></ul></li></ul><ol id=ol><li><ul id=ol2></ul></li></ol>' +
    '<input id=text><input id=cb type=checkbox><input id=hid type=hidden><input id=hid2 type=hidden class=b><input id=over class=o><input id=sub type=submit>' +
    '<button id=btn></button><select id=sel></select><textarea id=ta></textarea><progress id=prog></progress>' +
    '<dialog id=dlg></dialog><dialog id=dlg2 open></dialog><table><tr id=tr><th id=th>h</th><td id=td>x</td></tr></table>' +
    '<a id=a href=x></a><a id=a2></a><abbr id=abbr title=t></abbr><details><summary id=sum>s</summary></details><embed id=emb hidden><img id=img><span id=span></span>' +
    '<div id=dir dir=rtl></div><bdi id=bdi></bdi><mark id=mark></mark><video id=vid></video><iframe id=ifr></iframe><fieldset id=fs></fieldset><nobr id=nobr></nobr>' +
    '<ruby id=ruby>a<rp id=rp>(</rp><rt id=rt>b</rt><rp>)</rp></ruby><rp id=rp2></rp>';
  const props = [
    'display',
    'margin-top',
    'margin-left',
    'margin-right',
    'padding-top',
    'padding-left',
    'padding-inline-start',
    'border-top-style',
    'border-top-width',
    'box-sizing',
    'font-weight',
    'font-style',
    'font-family',
    'list-style-type',
    'white-space',
    'text-align',
    'vertical-align',
    'text-decoration',
    'cursor',
    'position',
    'overflow',
    'unicode-bidi',
    'direction',
    'object-fit',
    'min-height',
    'width',
    'height',
    'appearance',
    'counter-reset',
    'line-height',
    'letter-spacing',
    'border-radius',
    'border-top-left-radius',
  ].filter((p) => !skip.includes(p));
  const out = {};
  for (const e of d.querySelectorAll('[id]')) {
    const cs = w.getComputedStyle(e);
    out[e.id] = props.map((p) => cs.getPropertyValue(p));
  }
  for (const e of [d.documentElement, d.body]) {
    const cs = w.getComputedStyle(e);
    out[e.localName] = props.map((p) => cs.getPropertyValue(p));
  }
  d.body.className = 'z';
  out.zeroed = w.getComputedStyle(d.body).marginLeft;
  return out;
};
parity('getComputedStyle: the user agent style sheet (jsdom 20)', uaScenario, { jsdom: 20 });
parity('getComputedStyle: the user agent style sheet (jsdom 22)', uaScenario, { jsdom: 22 });
parity('getComputedStyle: the user agent style sheet (jsdom 25)', uaScenario, { jsdom: 25 });
parity('getComputedStyle: the user agent style sheet (jsdom 26)', uaScenario, { jsdom: 26 });
parity('getComputedStyle: the user agent style sheet (jsdom 27)', uaScenario, { jsdom: 27 });
parity('getComputedStyle: the user agent style sheet (jsdom 28)', uaScenario, { jsdom: 28 });
parity('getComputedStyle: the user agent style sheet (jsdom 29)', uaScenario, { jsdom: 29 });
// Not compared from jsdom 30.0, where warpdom differs whatever the sheet
// says: em lengths and bolder resolved (font-weight, the dialog's padding).
parity('getComputedStyle: the user agent style sheet', (w) =>
  uaScenario(w, ['font-weight', 'padding-top', 'padding-left']),
);

// Heading sizes, sectioned h1 included (before 27: 1.5em in one section,
// 1.17em from two). Not jsdom 30, which resolves em to px (#84).
const headingSizes = (w) => {
  const d = w.document;
  d.body.innerHTML =
    '<h1 id=h1></h1><h2 id=h2></h2><h3 id=h3></h3><h4 id=h4></h4><h5 id=h5></h5><h6 id=h6></h6><hgroup><h1 id=hg></h1></hgroup>' +
    '<section><h1 id=s1></h1><h2 id=s2></h2><article><h1 id=s11></h1><nav><h1 id=s111></h1></nav></article></section><aside><div><h1 id=a1></h1></div></aside>' +
    '<small id=sm></small><big id=big></big><sub id=sub></sub>';
  return [...d.querySelectorAll('[id]')].map((e) => [
    e.id,
    w.getComputedStyle(e).fontSize,
    w.getComputedStyle(e).fontWeight,
  ]);
};
for (const jsdom of [20, 22, 25, 26, 27, 28, 29])
  parity(`getComputedStyle: heading sizes (jsdom ${jsdom})`, headingSizes, { jsdom });

test("getComputedStyle: custom properties do not grow the user agent sheet's index", () => {
  const w = createWindow({ jsdom: '26.1.0' });
  const d = w.document;
  const e = d.body.appendChild(d.createElement('div'));
  const cs = w.getComputedStyle(e);
  assert.equal(cs.display, 'block');
  const names = w[S].uaIndex.names;
  const size = names.size;
  for (let i = 0; i < 200; i++) {
    e.style.setProperty(`--gen-${i}`, `${i}px`);
    assert.equal(cs.getPropertyValue(`--gen-${i}`), `${i}px`);
    assert.equal(cs.getPropertyValue(`--unset-${i}`), '');
  }
  assert.equal(names.size, size);
});

test('getComputedStyle: body margins per jsdom generation (#80)', () => {
  const margins = (options) => {
    const w = createWindow(options);
    const cs = w.getComputedStyle(w.document.body);
    return [cs.marginLeft, cs.marginRight, cs.margin];
  };
  assert.deepEqual(margins({ jsdom: '20.0.3' }), ['8px', '8px', '8px']);
  assert.deepEqual(margins({ jsdom: '26.1.0' }), ['8px', '8px', '8px']);
  assert.deepEqual(margins({ jsdom: '27.0.0' }), ['', '', '']);
  assert.deepEqual(margins({ jsdom: '29.0.1' }), ['', '', '']);
  assert.deepEqual(margins({ jsdom: '29.0.2' }), ['0', '0', '0']);
  assert.deepEqual(margins({ jsdom: '30.1.3' }), ['0', '0', '0']);
});

test("getComputedStyle: the user agent sheet's !important declarations win from jsdom 28.1.0", () => {
  const read = (jsdom) => {
    const w = createWindow({ jsdom });
    w.document.body.innerHTML = '<input id=a style="overflow: visible"><input id=b type=hidden style="display: block">';
    return ['a', 'b']
      .map((id) => w.getComputedStyle(w.document.getElementById(id)))
      .map((cs, i) => (i ? cs.display : cs.overflow));
  };
  assert.deepEqual(read('26.1.0'), ['visible', 'block']);
  assert.deepEqual(read('28.0.0'), ['visible', 'block']);
  assert.deepEqual(read('28.1.0'), ['clip', 'none']);
  assert.deepEqual(read('30.1.3'), ['clip', 'none']);
});

// Writes to computed styles (react-aria fakes a layout this way): jsdom
// before 28 lets every write change that object; from 28, setting a
// property changes the element's value until the document changes.
const computedWrites = (w) => {
  const d = w.document;
  d.body.innerHTML = '<div id="a" style="color: red"></div><div id="b"></div>';
  const a = d.getElementById('a');
  const s = w.getComputedStyle(a);
  const t = (f) => {
    try {
      return f();
    } catch (e) {
      return `throws ${e.name}`;
    }
  };
  const out = [
    t(() => {
      s.position = 'relative';
      return [s.position, s.getPropertyValue('position')];
    }),
    t(() => {
      s.setProperty('display', 'flex');
      return s.display;
    }),
    t(() => {
      s.removeProperty('color');
      return s.color;
    }),
    w.getComputedStyle(a).position,
    w.getComputedStyle(d.getElementById('b')).position,
    a.style.position,
  ];
  a.setAttribute('class', 'x');
  out.push(w.getComputedStyle(a).position, s.position);
  return out;
};
parity('getComputedStyle: writes (jsdom 26 profile)', computedWrites, { jsdom: 26 });
parity('getComputedStyle: writes', computedWrites);

// The root's computed color under jsdom 26 and earlier follows cssstyle:
// '' before 4.4 (jsdom 25 as svelte installs it), 'CanvasText' in 4.4 and
// 4.5, 'canvastext' from 4.6; rgb(0, 0, 0) from jsdom 27.
const rootColor = (w) => {
  const d = w.document;
  d.body.innerHTML = '<p id=p>x</p><p id=r style="color: green">y</p><div id=b style="border: 1px solid">z</div>';
  const cs = (id, p) => w.getComputedStyle(d.getElementById(id)).getPropertyValue(p);
  return [
    cs('p', 'color'),
    cs('r', 'color'),
    cs('b', 'border-top-color'),
    w.getComputedStyle(d.body).color,
    w.getComputedStyle(d.documentElement).color,
  ];
};
parity('getComputedStyle: undeclared color (jsdom 25)', rootColor, { jsdom: 25 });
parity('getComputedStyle: undeclared color (jsdom 26)', rootColor, { jsdom: 26 });
parity('getComputedStyle: undeclared color', rootColor);

test('getComputedStyle: undeclared color follows the cssstyle jsdom 26 and earlier load', () => {
  const color = (options) => {
    const w = createWindow(options);
    return w.getComputedStyle(w.document.body.appendChild(w.document.createElement('p'))).color;
  };
  assert.equal(color({ jsdom: '25.0.1', cssstyle: '4.3.1' }), '');
  assert.equal(color({ jsdom: '25.0.1', cssstyle: '4.4.0' }), 'CanvasText');
  assert.equal(color({ jsdom: '26.1.0', cssstyle: '4.5.0' }), 'CanvasText');
  assert.equal(color({ jsdom: '26.1.0', cssstyle: '4.6.0' }), 'canvastext');
  assert.equal(color({ jsdom: 26 }), 'canvastext');
  // jsdom 27 and later use cssstyle 5; an older cssstyle given is ignored.
  assert.equal(color({ jsdom: 28, cssstyle: '4.1.0' }), 'rgb(0, 0, 0)');
});

// jsdom 26 and earlier compute the border shorthands to their declared
// values, colors as written; border declares the sides and border-width,
// -style and -color, and a later longhand does not change them. (Not
// covered for jsdom 25: cssstyle 4.1 keeps currentcolor as the computed
// border color and rejects var() in border.)
const legacyBorders = (w, jsdom25 = false) => {
  const d = w.document;
  d.head.innerHTML =
    '<style>.k{border:4px solid black}.m{border-top:1px solid red}.v{--c:blue;border:1px solid var(--c)}</style>';
  const styles = [
    'border: 100px solid pink',
    'border: 1px solid',
    'border-top-width: 3px',
    ...(jsdom25 ? [] : ['border: 2px solid currentcolor']),
    'border: 1px solid PINK',
    'border: 1px solid transparent',
    'border: 1px solid pink; border-top-color: red',
    'border: 1em solid pink',
    'border: 0 solid pink',
    'border-color: pink',
    'border-top: 2px dashed pink; border-color: pink',
  ];
  const props = [
    'border',
    'border-top',
    'border-left',
    'border-color',
    'border-width',
    'border-style',
    'border-top-width',
    'border-top-color',
  ];
  const read = (e) => props.map((p) => w.getComputedStyle(e).getPropertyValue(p));
  const out = styles.map((s) => {
    const e = d.body.appendChild(d.createElement('div'));
    e.setAttribute('style', s);
    return read(e);
  });
  for (const c of jsdom25 ? ['k', 'm'] : ['k', 'm', 'v']) {
    const e = d.body.appendChild(d.createElement('div'));
    e.className = c;
    out.push(read(e));
  }
  return out;
};
parity('getComputedStyle: border shorthands as declared (jsdom 25)', (w) => legacyBorders(w, true), { jsdom: 25 });
parity('getComputedStyle: border shorthands as declared (jsdom 26)', legacyBorders, { jsdom: 26 });

// jsdom 20 to 26 compute CSS-wide keywords to themselves, as declared,
// longhands and shorthands alike, unset (from jsdom 21) as if nothing
// were declared but '' for display; a shorthand declared with var()
// computes to that value. ant-design's Flex (gap: inherit), Collapse
// (padding: var()) and ConfigProvider (border-radius: var()) tests read
// them with jest-dom's toHaveStyle. (jsdom 20 computes colors as
// written: left out there.)
const legacyKeywords = (w, colors = true) => {
  const d = w.document;
  const props = [
    ['width', '5px'],
    ['visibility', 'hidden'],
    ['display', 'flex'],
    ['row-gap', '5px'],
    ['pointer-events', 'none'],
    ['padding', '1px'],
    ['padding-top', '1px'],
    ['gap', '1px'],
    ['border-radius', '1px'],
    ['margin', '1px'],
    ['border-width', '1px'],
    ...(colors
      ? [
          ['color', 'red'],
          ['background-color', 'red'],
        ]
      : []),
  ];
  return props.map(([p, v]) =>
    ['inherit', 'initial', 'unset', 'revert', 'var(--x)'].map((keyword) => {
      const parent = d.body.appendChild(d.createElement('section'));
      const el = parent.appendChild(d.createElement('div'));
      parent.style.setProperty(p, v);
      el.style.setProperty(p, keyword);
      return w.getComputedStyle(el).getPropertyValue(p);
    }),
  );
};
for (const jsdom of [26, 25, 22])
  parity(`getComputedStyle: CSS-wide keywords as declared (jsdom ${jsdom})`, legacyKeywords, { jsdom });
parity('getComputedStyle: CSS-wide keywords as declared (jsdom 20)', (w) => legacyKeywords(w, false), { jsdom: 20 });

// jsdom 20 to 26 expand only some shorthands into their longhands (margin,
// padding, flex, background, border and its parts, font); gap, overflow,
// border-radius and the others compute to their declared value, their
// longhands to ''.
const unexpanded = (w) => {
  const d = w.document;
  d.head.innerHTML = '<style>.s{gap:1px 2px;overflow:auto hidden;inset:3px}.s.t{row-gap:4px}</style>';
  const props = [
    'gap',
    'row-gap',
    'column-gap',
    'overflow',
    'overflow-x',
    'inset',
    'top',
    'border-radius',
    'border-top-left-radius',
    'flex-flow',
    'flex-direction',
    'place-items',
    'align-items',
    'outline',
    'outline-width',
    'padding',
    'padding-top',
    'flex',
    'flex-grow',
  ];
  const read = (el) => props.map((p) => w.getComputedStyle(el).getPropertyValue(p));
  const inline = d.body.appendChild(d.createElement('div'));
  inline.setAttribute(
    'style',
    'gap: inherit; overflow: hidden; border-radius: var(--r); flex-flow: row wrap; place-items: center; outline: 1px solid; padding: 1px 2px; flex: 1 1 0px',
  );
  const sheet = d.body.appendChild(d.createElement('div'));
  sheet.className = 's t';
  return [read(inline), read(sheet)];
};
for (const jsdom of [26, 25, 22, 20])
  parity(`getComputedStyle: shorthands jsdom does not expand (jsdom ${jsdom})`, unexpanded, { jsdom });

// The computed style's background and border side accessors (not
// getPropertyValue) read their longhands: jsdom 21 to 26 when nothing is
// declared (the computed background-color first); from cssstyle 4.4
// always (image, position, repeat, attachment, then the computed color;
// border sides: width, style, computed color). ant-design's Upload and
// message tests compare background: rgb(...) with toHaveStyle.
// (Before cssstyle 4.3.1, jsdom writes background: none red as red none
// and keeps border-top: 0 as written: left out there.)
const legacyAccessors = (w, old = false) => {
  const d = w.document;
  const styles = [
    '',
    'background: red',
    'background: blue',
    'background: url(a.png) no-repeat',
    'background: none',
    ...(old ? [] : ['background: none red', 'border-top: 0']),
    'background: transparent',
    'background-color: red',
    'background-image: url(a.png); background-repeat: no-repeat',
    'background: red; background-image: url(a.png)',
    'background: var(--b)',
    'border-top: 1px solid red',
    'border: 2px dashed blue',
    'border-top-width: 2px',
    'color: blue; border-left: dashed',
    'border-top: var(--b)',
    'border-top: thin solid',
  ];
  return styles.map((style) => {
    const el = d.body.appendChild(d.createElement('div'));
    el.setAttribute('style', style);
    const cs = w.getComputedStyle(el);
    return [
      cs.background,
      cs['background'],
      cs.getPropertyValue('background'),
      cs.borderTop,
      cs.borderLeft,
      cs['border-left'],
      cs.getPropertyValue('border-top'),
      cs.border,
    ];
  });
};
parity('getComputedStyle: background and border side accessors (jsdom 26)', legacyAccessors, { jsdom: 26 });
for (const jsdom of [25, 22])
  parity(`getComputedStyle: background and border side accessors (jsdom ${jsdom})`, (w) => legacyAccessors(w, true), {
    jsdom,
  });

test('getComputedStyle: background and border side accessors compose from cssstyle 4.4', () => {
  const read = (cssstyle, style) => {
    const w = createWindow({ jsdom: '26.1.0', cssstyle });
    const el = w.document.body.appendChild(w.document.createElement('div'));
    el.setAttribute('style', style);
    const cs = w.getComputedStyle(el);
    return [cs.background, cs.getPropertyValue('background'), cs.borderTop, cs.borderRight];
  };
  assert.deepEqual(read('4.3.1', 'background: red; border-top: 1px solid red'), ['red', 'red', '1px solid red', '']);
  assert.deepEqual(read('4.4.0', 'background: red; border-top: 1px solid red'), [
    'rgb(255, 0, 0)',
    'red',
    '1px solid rgb(255, 0, 0)',
    'CanvasText',
  ]);
  assert.deepEqual(read('4.4.0', 'background: red url(a.png) fixed'), [
    'url("a.png") fixed rgb(255, 0, 0)',
    'url("a.png") fixed red',
    'CanvasText',
    'CanvasText',
  ]);
  assert.deepEqual(read('4.3.1', 'background-image: url(a.png)'), ['rgba(0, 0, 0, 0) url("a.png")', '', '', '']);
});

// jsdom 21 and later keep a disconnected element's computed style until
// the document's connected tree or its style sheets change (black box, 22
// to 30); jsdom 20 computes it each time.
for (const jsdom of [30, 26, 20]) {
  parity(
    `getComputedStyle of a disconnected element: kept until the document changes (jsdom ${jsdom})`,
    (w) => {
      const d = w.document;
      const out = [];
      const host = d.createElement('div');
      const el = host.appendChild(d.createElement('div'));
      // (jsdom 20 computes colors as written: left out there.)
      const g = () =>
        `${w.getComputedStyle(el).getPropertyValue('--a')}/${w.getComputedStyle(el).display}/${jsdom === 20 ? '' : w.getComputedStyle(el).color}`;
      out.push(g());
      el.style.setProperty('--a', '1');
      el.style.color = 'red';
      out.push(g());
      d.body.appendChild(d.createElement('span'));
      out.push(g());
      el.style.setProperty('--a', '2');
      host.appendChild(d.createElement('i'));
      el.setAttribute('class', 'x');
      out.push(g());
      d.body.setAttribute('data-x', '1');
      out.push(g());
      const st = d.createElement('style');
      st.textContent = 'div { display: inline }';
      d.head.append(st);
      el.style.setProperty('--a', '3');
      out.push(g());
      d.body.append(host);
      out.push(g());
      host.remove();
      el.style.setProperty('--a', '5');
      el.style.removeProperty('--a');
      out.push(g());
      return out;
    },
    { jsdom },
  );
}
