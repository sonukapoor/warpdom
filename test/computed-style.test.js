import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWindow } from '../src/index.js';
import { parity } from './parity.js';

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
  const make = (cls, parent = d.body) => { const e = d.createElement('div'); e.className = cls; parent.appendChild(e); return e; };
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
    d: cs(make('d'), 'color', 'background-color', 'border', 'border-top-color', 'border-top-width', 'flex-wrap', 'display'),
    calc: cs(make('e'), 'width'),
    child: cs(g, 'width'),
    inherit: cs(make('h'), 'color'),
    q: cs(make('q'), 'color', 'background-color', 'background', 'margin-left', 'margin-top'),
    selectors: [...cs(u, 'width'), ...cs(make('u'), 'width'), ...cs(make('w'), 'width'), ...cs(make('ok'), 'width')],
    insertRule: cs(late, 'width'),
    inline: cs(inline, 'color'),
    box: [...cs(make('p1'), 'padding-left', 'padding'), ...cs(make('p2'), 'padding-top')],
    flex: cs(make('fx'), 'flex-grow', 'flex-shrink'),
    defaults: cs(make(''), 'width', 'height', 'opacity', 'position', 'z-index', 'font-size', 'font-weight', 'background-color',
      'border-top-width', 'border-top-color', 'flex-direction', 'box-sizing', 'float', 'max-width', 'min-width', 'color', 'fill', 'visibility'),
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
  d.body.innerHTML = '<div hidden id=a style="display:flex"></div><div hidden class=f id=b></div><div class=f id=c></div><span id=d></span>';
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

test('getComputedStyle: var() and disabled style sheets', () => {
  const w = createWindow();
  const d = w.document;
  d.head.innerHTML = '<style>:root{--size:7px} .v{width:var(--size);height:var(--missing, 8px);color:var(--nope)}</style>';
  const e = d.body.appendChild(d.createElement('div'));
  e.className = 'v';
  const cs = w.getComputedStyle(e);
  assert.deepEqual([cs.width, cs.height, cs.color, cs.getPropertyValue('--size')], ['7px', '8px', 'rgb(0, 0, 0)', '7px']);
  // Deliberate deviations: jsdom ignores flex-flow, and still applies a
  // disabled style sheet.
  e.style.flexFlow = 'column wrap';
  assert.deepEqual([cs.flexDirection, cs.flexWrap], ['column', 'wrap']);
  d.styleSheets[0].disabled = true;
  assert.equal(cs.width, 'auto');
});

parity('getComputedStyle: shorthands', (w) => {
  const d = w.document;
  d.head.innerHTML = '<style>.r{background:red;border:1px solid red;outline:2px solid blue;color:red}</style>';
  d.body.innerHTML = '<div class=r id=a></div><div id=b style="background:red;border:1px solid red;outline:2px solid blue;color:red;border-color:green"></div><div id=c></div>';
  const props = ['background', 'border', 'outline', 'color', 'border-color', 'border-top-color', 'background-color', 'border-top', 'border-width', 'margin'];
  return ['a', 'b', 'c'].map((id) => { const cs = w.getComputedStyle(d.getElementById(id)); return props.map((p) => cs.getPropertyValue(p)); });
});

// jsdom 26 (bundled with jest-environment-jsdom in Jest 30): undeclared
// properties compute to '' apart from a few.
const legacyScenario = (w) => {
  const d = w.document;
  d.head.innerHTML = '<style>.r{width:10px;transform:scale(2);color:red;font-size:20px}.p{font-size:14px;visibility:hidden;cursor:pointer}</style>';
  d.body.innerHTML = '<div class=p id=p><span id=c></span></div><div class=r id=r></div><div id=i style="opacity:.5;margin:0 auto;color:#f00"></div><div id=h hidden></div>'
    + '<div id=par style="color:blue;pointer-events:none;visibility:collapse"><b id=kid>x</b></div>';
  const cs = (el, ...ps) => ps.map((p) => w.getComputedStyle(el).getPropertyValue(p));
  const byId = (id) => d.getElementById(id);
  const tags = ['div', 'span', 'p', 'li', 'table', 'td', 'button', 'input', 'a', 'section', 'script', 'img', 'ul', 'tr', 'em'];
  return {
    child: cs(byId('c'), 'font-size', 'visibility', 'cursor', 'color', 'display'),
    rule: cs(byId('r'), 'width', 'transform', 'color', 'font-size', 'height', 'opacity'),
    inline: cs(byId('i'), 'opacity', 'margin-top', 'color', 'background-color', 'pointer-events'),
    hidden: cs(byId('h'), 'display'),
    inherited: cs(byId('kid'), 'color', 'pointer-events', 'visibility', 'display'),
    body: cs(d.body, 'display', 'visibility', 'color', 'background-color', 'pointer-events', 'font-family', 'border-top-width', 'border-top-color', 'outline-color', 'z-index', 'filter'),
    displays: tags.map((t) => cs(d.body.appendChild(d.createElement(t)), 'display')[0]),
  };
};
parity('getComputedStyle: jsdom 26 profile', legacyScenario, { jsdom: 26 });

// Writes to computed styles (react-aria fakes a layout this way): jsdom
// before 28 lets every write change that object; from 28, setting a
// property changes the element's value until the document changes.
const computedWrites = (w) => {
  const d = w.document;
  d.body.innerHTML = '<div id="a" style="color: red"></div><div id="b"></div>';
  const a = d.getElementById('a');
  const s = w.getComputedStyle(a);
  const t = (f) => { try { return f(); } catch (e) { return `throws ${e.name}`; } };
  const out = [
    t(() => { s.position = 'relative'; return [s.position, s.getPropertyValue('position')]; }),
    t(() => { s.setProperty('display', 'flex'); return s.display; }),
    t(() => { s.removeProperty('color'); return s.color; }),
    w.getComputedStyle(a).position, w.getComputedStyle(d.getElementById('b')).position, a.style.position,
  ];
  a.setAttribute('class', 'x');
  out.push(w.getComputedStyle(a).position, s.position);
  return out;
};
parity('getComputedStyle: writes (jsdom 26 profile)', computedWrites, { jsdom: 26 });
parity('getComputedStyle: writes', computedWrites);
