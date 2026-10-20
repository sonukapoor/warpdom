// SVG interfaces (src/svg.js), checked against jsdom: every parity scenario
// runs on a jsdom window and a warpdom window and must give the same
// result. Version boundaries measured black box on jsdom 20.0.3 to 30.1.3
// are asserted on warpdom's profiles directly.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWindow } from '../src/node.js';
import { parity, html } from './parity.js';

const NS = 'http://www.w3.org/2000/svg';
const ALL = [20, 22, 25, 26, 30];
const svg = (d, tag = 'svg') => d.createElementNS(NS, tag);
const outcome = (f) => { try { return f(); } catch (e) { return `${e.constructor.name} ${e.name} ${e.code} ${e.message}`; } };
const rect = (r) => [r.x, r.y, r.width, r.height, Object.prototype.toString.call(r)];
// The error's name only: V8 words a failed assignment to a getter after the
// object's class string, which jsdom 20 and 22 give differently.
const errorName = (f) => { try { f(); return 'ok'; } catch (e) { return e.name; } };
const items = (list) => { const out = []; for (let i = 0; i < list.length; i++) out.push(list.getItem(i)); return out; };

const TAGS = ['svg', 'g', 'defs', 'desc', 'metadata', 'switch', 'symbol', 'title', 'rect', 'circle', 'path', 'use', 'text', 'a',
  'foreignObject', 'linearGradient', 'clipPath', 'marker', 'pattern', 'image', 'Symbol', 'unknown'];

const interfacesScenario = (w) => {
  const d = w.document;
  html(w, `<svg>${TAGS.filter((t) => t !== 'svg').map((t) => `<${t}></${t}>`).join('')}</svg>`);
  return [
    Object.getOwnPropertyNames(w).filter((n) => n.startsWith('SVG')).sort(),
    TAGS.map((t) => svg(d, t).constructor.name),
    [...d.querySelectorAll('svg, svg *')].map((e) => `${e.localName}:${e.constructor.name}`),
    ['SVGNumber', 'SVGStringList', 'SVGAnimatedString', 'SVGRect', 'SVGSymbolElement'].map((n) => (w[n] ? outcome(() => new w[n]()) : 'absent')),
    'viewBox' in svg(d), 'createSVGRect' in svg(d), 'systemLanguage' in svg(d, 'g'), 'systemLanguage' in svg(d, 'rect'),
  ];
};
for (const jsdom of ALL) parity(`SVG interfaces and the elements that create them (jsdom ${jsdom})`, interfacesScenario, { jsdom });

const classNameScenario = (w) => {
  const d = w.document;
  const s = svg(d);
  s.setAttribute('class', 'a b');
  const c = s.className;
  const out = [Object.prototype.toString.call(c), c.baseVal, c.animVal, c === s.className, c instanceof w.SVGAnimatedString, Object.keys(c)];
  const r = svg(d, 'rect');
  out.push(r.className.baseVal, r.getAttribute('class'));
  r.className.baseVal = 'x y';
  out.push(r.getAttribute('class'), r.className.animVal, r.classList.length);
  r.className.baseVal = null;
  out.push(r.getAttribute('class'));
  r.setAttribute('class', 'q');
  out.push(r.className.baseVal, r.className.animVal);
  out.push(errorName(() => { r.className.animVal = 'z'; }), errorName(() => { r.className = 'z'; }), r.getAttribute('class'));
  out.push(Object.getOwnPropertyDescriptor(w.SVGElement.prototype, 'className').set, typeof d.createElement('div').className);
  out.push(typeof d.createElementNS('urn:x', 'x').className);
  return out;
};
for (const jsdom of [20, 30]) parity(`SVGElement className is an SVGAnimatedString (jsdom ${jsdom})`, classNameScenario, { jsdom });

parity('viewBox: parsing what jsdom accepts', (w) => {
  const d = w.document;
  const values = ['0 0 100 50', '0,0,100,50', ' 1 , 2 3,4 ', '1  2   3    4', '1 2 3 4 ', '1e1 .5 3 2', '+1 -2 3 4', '+.5 0 1 1', '1E2 0 1 1',
    '0 0 1e39 1', '0 0 1e400 1', '1e-50 0 1 1', '0 0 10 -0', '0 0 0 0',
    '1 2 3', '1 2 3 4 5', '0 0 -1 10', '0 0 1 -1', 'a b c d', '1px 2 3 4', '', '1 2 3 4,', ',1 2 3 4', '1, ,2 3 4', '1. 2 3 4', '1e 0 1 1',
    '0x1 0 1 1', 'NaN 0 1 1', 'Infinity 0 1 1', '1.5.5 0 1 1', '-1-2 3 4', '\t1 2 3 4', '1 2 3 4\n', '1\t2 3 4'];
  const out = values.map((v) => { const s = svg(d); s.setAttribute('viewBox', v); return [v, rect(s.viewBox.baseVal), rect(s.viewBox.animVal)]; });
  const negativeZero = svg(d);
  negativeZero.setAttribute('viewBox', '-0 0 10 -0');
  out.push(Object.is(negativeZero.viewBox.baseVal.x, -0), Object.is(negativeZero.viewBox.baseVal.height, -0));
  html(w, '<svg viewbox="0 0 3 3" preserveaspectratio="none"></svg>');
  const parsed = d.querySelector('svg');
  out.push(parsed.getAttributeNames(), rect(parsed.viewBox.baseVal), parsed.preserveAspectRatio.baseVal.align);
  const ns = svg(d);
  ns.setAttributeNS('urn:x', 'viewBox', '0 0 9 9');
  out.push(rect(ns.viewBox.baseVal));
  return out;
});

const viewBoxScenario = (w) => {
  const d = w.document;
  const s = svg(d);
  const vb = s.viewBox;
  const out = [Object.prototype.toString.call(vb), vb === s.viewBox, rect(vb.baseVal), rect(vb.animVal), vb.baseVal === vb.baseVal, vb.baseVal === vb.animVal];
  vb.baseVal.width = 3;
  out.push(s.getAttribute('viewBox'));
  s.setAttribute('viewBox', '0 0 100 50');
  const base = vb.baseVal;
  base.x = 5;
  base.width = 7.5;
  out.push(s.getAttribute('viewBox'), rect(vb.animVal));
  base.x = '3';
  base.y = 1e21;
  base.width = 0.1 + 0.2;
  base.height = -0;
  out.push(s.getAttribute('viewBox'), rect(base));
  s.setAttribute('viewBox', '1 1 2 2');
  out.push(rect(base));
  s.setAttribute('viewBox', 'bad');
  out.push(rect(base));
  base.x = 4;
  out.push(s.getAttribute('viewBox'));
  s.removeAttribute('viewBox');
  out.push(rect(base));
  for (const value of [NaN, Infinity, 'abc', 1e39, -1e39, undefined, null]) out.push(outcome(() => { base.y = value; return s.getAttribute('viewBox'); }));
  out.push(outcome(() => { vb.animVal.width = 1; }), outcome(() => { vb.animVal.width = NaN; }), s.getAttribute('viewBox'));
  const records = [];
  const observer = new w.MutationObserver(() => {});
  observer.observe(s, { attributes: true, attributeOldValue: true });
  s.setAttribute('viewBox', '0 0 1 1');
  base.x = 0;
  base.x = 0;
  for (const r of observer.takeRecords()) records.push([r.attributeName, r.oldValue]);
  out.push(records);
  const symbol = svg(d, 'symbol');
  symbol.setAttribute('viewBox', '1 2 3 4');
  symbol.viewBox.baseVal.x = 9;
  out.push(symbol.getAttribute('viewBox'), rect(symbol.viewBox.animVal), 'viewBox' in svg(d, 'g'));
  return out;
};
for (const jsdom of [26, 30]) parity(`viewBox: SVGAnimatedRect and SVGRect (jsdom ${jsdom})`, viewBoxScenario, { jsdom });

parity('createSVGRect and createSVGNumber', (w) => {
  const s = svg(w.document);
  const r = s.createSVGRect();
  const out = [rect(r), r instanceof w.SVGRect, r instanceof w.DOMRect, typeof r.toJSON, JSON.stringify(r), s.createSVGRect() === r];
  r.x = 1;
  r.y = '2';
  r.width = -3;
  r.height = 4.5;
  out.push(rect(r));
  for (const value of [NaN, Infinity, 1e39, -1e39, '1e38', 'abc', -1e-50]) out.push(outcome(() => { r.width = value; return [r.width, Object.is(r.width, -0)]; }));
  const n = s.createSVGNumber();
  out.push(n.value, Object.prototype.toString.call(n), n instanceof w.SVGNumber, Object.keys(n), JSON.stringify(n), s.createSVGNumber() === n);
  for (const value of ['3.5', 0.1, 1e38, 1e39, -1e39, 3.4028235e38, 3.4028236e38, NaN, Infinity, 'abc', null, undefined, {}, '', 1e-50, -0]) {
    out.push(outcome(() => { n.value = value; return [n.value, Object.is(n.value, -0)]; }));
  }
  out.push(s.createSVGNumber.length, s.createSVGRect.length, s.createSVGNumber(1, 2).value);
  return out;
});

const preserveAspectRatioScenario = (w) => {
  const d = w.document;
  const values = ['none', 'xMinYMin', 'xMidYMin', 'xMaxYMin', 'xMinYMid', 'xMidYMid', 'xMaxYMid', 'xMinYMax', 'xMidYMax', 'xMaxYMax',
    'xMidYMid slice', 'xMidYMid meet', 'none slice', 'none meet', 'xMinYMin  slice', 'xMinYMin    meet', 'XMIDYMID', 'xminymin',
    'defer xMinYMin slice', 'defer', ' xMinYMin', 'xMinYMin ', 'xMinYMin slice ', 'xMinYMin,slice', 'xMinYMin\tslice', 'xMinYMin\nslice',
    'bogus', '', 'slice', 'xMinYMin bogus', 'xMinYMin slice extra', 'xMinYMinslice'];
  const out = values.map((v) => {
    const s = svg(d);
    s.setAttribute('preserveAspectRatio', v);
    const { baseVal, animVal } = s.preserveAspectRatio;
    return [v, baseVal.align, baseVal.meetOrSlice, animVal.align, animVal.meetOrSlice];
  });
  const s = svg(d);
  const par = s.preserveAspectRatio;
  out.push(Object.prototype.toString.call(par), par === s.preserveAspectRatio, par.baseVal === par.baseVal, par.baseVal === par.animVal,
    Object.prototype.toString.call(par.baseVal), par.baseVal.align, par.baseVal.meetOrSlice);
  const b = par.baseVal;
  for (const [key, value] of [['align', 1], ['align', 6], ['meetOrSlice', 2], ['align', 0], ['align', 11], ['meetOrSlice', 0], ['meetOrSlice', 3],
    ['align', '2'], ['meetOrSlice', 1], ['align', -1], ['align', 65537], ['align', NaN], ['meetOrSlice', undefined]]) {
    out.push(outcome(() => { b[key] = value; return [s.getAttribute('preserveAspectRatio'), b.align, b.meetOrSlice]; }));
  }
  out.push(outcome(() => { par.animVal.align = 2; return s.getAttribute('preserveAspectRatio'); }));
  s.setAttribute('preserveAspectRatio', 'defer xMinYMin slice');
  b.align = 5;
  out.push(s.getAttribute('preserveAspectRatio'));
  s.setAttribute('preserveAspectRatio', 'xMaxYMax slice');
  out.push(b.align, b.meetOrSlice);
  b.meetOrSlice = 1;
  out.push(s.getAttribute('preserveAspectRatio'));
  s.removeAttribute('preserveAspectRatio');
  out.push(b.align, b.meetOrSlice);
  const fresh = svg(d);
  fresh.preserveAspectRatio.baseVal.meetOrSlice = 2;
  out.push(fresh.getAttribute('preserveAspectRatio'));
  const P = w.SVGPreserveAspectRatio;
  out.push(P.SVG_PRESERVEASPECTRATIO_XMAXYMAX, P.SVG_MEETORSLICE_SLICE, P.prototype.SVG_MEETORSLICE_MEET, Object.getOwnPropertyDescriptor(P, 'SVG_MEETORSLICE_MEET'),
    Object.getOwnPropertyDescriptor(P.prototype, 'SVG_PRESERVEASPECTRATIO_NONE'));
  const symbol = svg(d, 'symbol');
  symbol.setAttribute('preserveAspectRatio', 'none');
  out.push(symbol.preserveAspectRatio.baseVal.align);
  return out;
};
for (const jsdom of [26, 30]) parity(`preserveAspectRatio (jsdom ${jsdom})`, preserveAspectRatioScenario, { jsdom });

const stringListScenario = (w) => {
  const d = w.document;
  const out = [];
  for (const v of ['a b c', 'a,b,c', ' a  b ', 'a, b', 'a\tb\nc', '', '  ', 'a,,b', ',a', 'a,', 'a,a, a ,', 'a a  b', '\ta\f,\r b \n']) {
    const s = svg(d);
    s.setAttribute('systemLanguage', v);
    s.setAttribute('requiredExtensions', v);
    out.push([v, items(s.systemLanguage), items(s.requiredExtensions)]);
  }
  const s = svg(d);
  s.setAttribute('systemLanguage', 'en, fr-CA,  de');
  const l = s.systemLanguage;
  out.push(Object.prototype.toString.call(l), l === s.systemLanguage, l.length, l.numberOfItems, l[0], l[1], l[3], Object.keys(l), 0 in l, 5 in l,
    [...l], Object.getOwnPropertyDescriptor(l, 0), l instanceof w.SVGStringList, s.requiredExtensions === l);
  out.push(l.insertItemBefore('x', 1), items(l), s.getAttribute('systemLanguage'));
  out.push(l.insertItemBefore('y', 99), l.insertItemBefore('z', -1), l.insertItemBefore('w', 0), items(l));
  out.push(l.replaceItem('R', 0), l.removeItem(1), items(l), s.getAttribute('systemLanguage'));
  out.push(l.initialize('only'), items(l), s.getAttribute('systemLanguage'));
  out.push(l.clear(), l.length, s.getAttribute('systemLanguage'), s.hasAttribute('systemLanguage'));
  out.push(l.appendItem('a'), l.appendItem('a'), l.appendItem(''), l.appendItem(null), l.appendItem(5), items(l), s.getAttribute('systemLanguage'));
  for (const f of [() => l.getItem(5), () => l.getItem(-1), () => l.getItem('1'), () => l.getItem(4294967297), () => l.replaceItem('x', 5),
    () => l.removeItem(9), () => l.getItem(), () => l.appendItem(), () => l.insertItemBefore('x'), () => l.replaceItem('x'), () => l.removeItem(),
    () => l.initialize()]) out.push(outcome(f));
  // Indexed properties: a setter that replaces items.
  out.push(outcome(() => { l[0] = 'z'; return items(l); }), outcome(() => { l[9] = 'q'; }), outcome(() => { 'use strict'; delete l[0]; }));
  out.push(outcome(() => { Object.defineProperty(l, 1, { value: 'd' }); return items(l); }), outcome(() => { Object.defineProperty(l, 7, { value: 'q' }); }));
  l[-1] = 'neg';
  l.foo = 1;
  out.push(l[-1], l.foo, Object.keys(l));
  // Attribute changes made elsewhere: parsed again.
  const g = svg(d);
  const req = g.requiredExtensions;
  req.appendItem('x y');
  out.push(req.length, items(req), g.getAttribute('requiredExtensions'));
  req.appendItem('z');
  out.push(req.length, g.getAttribute('requiredExtensions'));
  g.setAttribute('requiredExtensions', 'x y z');
  out.push(req.length, items(req));
  g.removeAttribute('requiredExtensions');
  out.push(req.length);
  req.appendItem('n');
  out.push(g.getAttribute('requiredExtensions'));
  const clear = svg(d);
  const observer = new w.MutationObserver(() => {});
  observer.observe(clear, { attributes: true, attributeOldValue: true });
  clear.systemLanguage.clear();
  out.push(clear.hasAttribute('systemLanguage'));
  clear.systemLanguage.clear();
  out.push(observer.takeRecords().map((r) => [r.attributeName, r.oldValue]));
  out.push(typeof w.SVGStringList.prototype[Symbol.iterator], typeof w.SVGStringList.prototype.forEach);
  return out;
};
for (const jsdom of [20, 30]) parity(`SVGStringList: requiredExtensions and systemLanguage (jsdom ${jsdom})`, stringListScenario, { jsdom });

parity('SVGSVGElement: getElementById and the legacy redraw methods', (w) => {
  const d = html(w, '<div id="a">o</div><svg id="r"><g id="a"><rect id="b"/></g><rect id="b"/><foreignObject><div id="c"></div></foreignObject></svg>');
  const s = d.querySelector('svg');
  const name = (e) => (e === null ? null : `${e.localName}#${e.id}<${e.parentNode.localName}`);
  const out = [name(s.getElementById('a')), name(s.getElementById('b')), name(s.getElementById('c')), s.getElementById('r') === s,
    s.getElementById('zz'), s.getElementById(''), s.getElementById(null), outcome(() => s.getElementById())];
  s.insertBefore(s.lastChild.previousSibling, s.firstChild);
  out.push(name(s.getElementById('b')));
  const detached = svg(d);
  const g = svg(d, 'g');
  g.id = 'x';
  detached.appendChild(g);
  out.push(detached.getElementById('x') === g);
  out.push(s.suspendRedraw(5), s.suspendRedraw(0), s.suspendRedraw('x'), s.suspendRedraw(-1), s.suspendRedraw(undefined), s.unsuspendRedraw(1),
    s.unsuspendRedraw('x'), s.unsuspendRedrawAll(), s.forceRedraw(), s.unsuspendRedrawAll(1, 2));
  out.push(outcome(() => s.suspendRedraw()), outcome(() => s.unsuspendRedraw()), s.suspendRedraw.length, s.unsuspendRedraw.length,
    s.unsuspendRedrawAll.length, s.forceRedraw.length, s.getElementById.length);
  return out;
});

const viewportScenario = (w) => {
  const d = html(w, '<svg id="outer"><g id="g1"><svg id="inner"><rect id="r"/><symbol id="sym"><circle id="c"/><g id="sg"><svg id="ss"><rect id="sr"/></svg></g></symbol></svg></g>'
    + '<foreignObject id="fo"><div id="hd"><svg id="fsvg"><rect id="fr"/></svg></div></foreignObject><use id="u"/><marker id="m"><path id="p"/></marker></svg>');
  const id = (e) => (e === null ? null : e.id || e.localName);
  const out = ['outer', 'g1', 'inner', 'r', 'sym', 'c', 'sg', 'ss', 'sr', 'fo', 'fsvg', 'fr', 'u', 'p']
    .map((x) => [x, id(d.getElementById(x).ownerSVGElement), id(d.getElementById(x).viewportElement)]);
  const s = svg(d);
  const g = svg(d, 'g');
  s.appendChild(g);
  const lone = svg(d, 'rect');
  const div = d.createElement('div');
  const inDiv = svg(d, 'rect');
  div.appendChild(inDiv);
  const x = d.createElementNS('urn:x', 'x');
  s.appendChild(x);
  const inX = svg(d, 'rect');
  x.appendChild(inX);
  const symbol = svg(d, 'symbol');
  const inSymbol = svg(d, 'g');
  symbol.appendChild(inSymbol);
  out.push([id(g.ownerSVGElement), id(g.viewportElement), lone.ownerSVGElement, lone.viewportElement, inDiv.ownerSVGElement, inX.ownerSVGElement,
    s.ownerSVGElement, inSymbol.ownerSVGElement, id(inSymbol.viewportElement)]);
  const host = d.createElement('div');
  d.body.appendChild(host);
  const shadow = host.attachShadow({ mode: 'open' });
  const shadowSvg = svg(d);
  shadow.appendChild(shadowSvg);
  const shadowRect = svg(d, 'rect');
  shadowSvg.appendChild(shadowRect);
  out.push([id(shadowRect.ownerSVGElement), shadowSvg.ownerSVGElement]);
  return out;
};
for (const jsdom of ALL) parity(`ownerSVGElement and viewportElement (jsdom ${jsdom})`, viewportScenario, { jsdom });

const NAMES = ['onafterprint', 'onunload', 'onmessage', 'onstorage', 'onload', 'onerror', 'onresize', 'onscroll', 'onfocus', 'onblur', 'onclick'];
const windowHandlersScenario = (w) => {
  const d = w.document;
  const type = (v) => (v === null ? 'null' : typeof v);
  const out = [];
  for (const name of NAMES) {
    const s = svg(d);
    const initial = type(s[name]);
    const f = () => {};
    s[name] = f;
    out.push([name, initial, s[name] === f, w[name] === f]);
    s[name] = 5;
    out.push(type(s[name]));
    w[name] = null;
    const g = f;
    w[name] = g;
    out.push(svg(d)[name] === g, svg(d, 'g')[name] === g);
    w[name] = null;
  }
  html(w, '<svg onunload="window.hits.push(\'unload\')" onload="window.hits.push(\'load\')" onclick="window.hits.push(\'click\')"><svg id="inner"></svg></svg>');
  w.hits = [];
  const s = d.querySelector('svg');
  out.push(type(s.onunload), type(w.onunload), type(s.onload), type(w.onload), type(s.onclick));
  for (const target of [s, w]) for (const t of ['unload', 'load', 'click']) target.dispatchEvent(new w.Event(t));
  out.push(w.hits);
  s.removeAttribute('onunload');
  out.push(type(s.onunload), type(w.onunload));
  const inner = d.getElementById('inner');
  const f = () => {};
  inner.onmessage = f;
  out.push(w.onmessage === f, inner.onmessage === f);
  const other = d.implementation.createHTMLDocument('').createElementNS(NS, 'svg');
  other.setAttribute('onunload', 'x');
  const before = type(other.onunload);
  other.onunload = f;
  out.push(before, other.onunload === f);
  const body = f;
  d.body.onpopstate = body;
  out.push(w.onpopstate === body);
  return out;
};
for (const jsdom of ALL) parity(`SVGSVGElement window event handlers (jsdom ${jsdom})`, windowHandlersScenario, { jsdom });

parity('nonce reflects the content attribute on HTML and SVG elements', (w) => {
  const d = html(w, '<svg nonce="n1"><rect nonce="n2"/></svg><div nonce="n3"></div>');
  const out = [d.querySelector('svg').nonce, d.querySelector('rect').nonce, d.querySelector('svg').getAttribute('nonce'), d.querySelector('div').nonce];
  for (const el of [svg(d, 'rect'), d.createElement('div')]) {
    out.push(el.nonce);
    el.setAttribute('nonce', 'abc');
    out.push(el.nonce);
    el.nonce = 'xyz';
    out.push(el.nonce, el.getAttribute('nonce'));
    el.nonce = null;
    out.push(el.getAttribute('nonce'));
    el.removeAttribute('nonce');
    out.push(el.nonce);
    el.nonce = 'k';
    const clone = el.cloneNode();
    out.push(clone.nonce, clone.getAttribute('nonce'));
  }
  return out;
});

parity('SVG elements: tabIndex and focus', (w) => {
  const d = html(w, '<svg><rect id="r" tabindex="0"/><a id="a" href="#x"><text>x</text></a></svg>');
  const out = [svg(d, 'rect').tabIndex, svg(d, 'a').tabIndex, svg(d).tabIndex];
  const r = svg(d, 'rect');
  r.tabIndex = 3;
  out.push(r.tabIndex, r.getAttribute('tabindex'));
  d.getElementById('r').focus();
  out.push(d.activeElement.id);
  d.getElementById('a').focus();
  out.push(d.activeElement.id);
  return out;
});

// Version boundaries (black box), on warpdom's profiles.
test('jsdom 26.1.0 added the SVG element interfaces, SVGRect, viewBox and preserveAspectRatio', () => {
  const shape = (jsdom) => {
    const w = createWindow({ jsdom });
    const d = w.document;
    return [Object.getOwnPropertyNames(w).filter((n) => n.startsWith('SVG')).length, svg(d, 'g').constructor.name, svg(d, 'symbol').constructor.name,
      'viewBox' in svg(d), 'preserveAspectRatio' in svg(d), 'createSVGRect' in svg(d), 'systemLanguage' in svg(d, 'g')];
  };
  assert.deepEqual(shape('26.0.0'), [7, 'SVGElement', 'SVGElement', false, false, false, false]);
  assert.deepEqual(shape('26.1.0'), [17, 'SVGGElement', 'SVGSymbolElement', true, true, true, true]);
});

test('a symbol is a viewport element from jsdom 26.1.0 to 30.0.x', () => {
  const viewport = (jsdom) => {
    const d = createWindow({ jsdom }).document;
    d.body.innerHTML = '<svg><symbol id="s"><g id="g"></g></symbol></svg>';
    return d.getElementById('g').viewportElement.localName;
  };
  assert.deepEqual(['26.0.0', '26.1.0', '28.1.0', '30.0.1', '30.1.0'].map(viewport), ['svg', 'symbol', 'symbol', 'symbol', 'svg']);
});

test('svg forwards window event handlers to the window before jsdom 28.1.0', () => {
  const forwards = (jsdom) => {
    const w = createWindow({ jsdom });
    const s = svg(w.document);
    const initial = s.onunload;
    const f = () => {};
    s.onunload = f;
    s.setAttribute('onafterprint', 'void 0');
    return [initial === null ? 'null' : typeof initial, w.onunload === f, typeof w.onafterprint, typeof s.onafterprint];
  };
  assert.deepEqual(forwards('28.0.0'), ['null', true, 'function', 'function']);
  assert.deepEqual(forwards('28.1.0'), ['undefined', false, 'object', 'undefined']);
});
