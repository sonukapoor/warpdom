// The style objects' interfaces per jsdom version (#72), against jsdom:
// before jsdom 29 (cssstyle) el.style and getComputedStyle() are
// CSSStyleDeclarations whose one prototype has the accessors and the
// methods, so tests spy on CSSStyleDeclaration.prototype; from 29 the
// accessors are CSSStyleProperties'. Also cssstyle's legacy methods and
// azimuth, and missing arguments.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWindow } from '../src/node.js';
import { parity } from './parity.js';

// jsdom 20 (cssstyle 2.3.0), 22 (3.0.0), 25 (4.1.0), 26 (4.6.0), 27.4
// (5.3.7), 28.1 (6.2.0), 29.1.1, 30.
const VERSIONS = [20, 22, 25, 26, 27, 28, 29, 30];

const KEYS = ['width', 'cssFloat', 'float', 'azimuth', 'webkitUserSelect', 'cssText', 'length', 'parentRule', 'item', 'setProperty', 'getPropertyValue',
  'getPropertyPriority', 'removeProperty', 'getPropertyCSSValue', 'getPropertyShorthand', 'isPropertyImplicit', Symbol.iterator, Symbol.toStringTag];

const chain = (object) => {
  const names = [];
  for (let p = Object.getPrototypeOf(object); p !== null; p = Object.getPrototypeOf(p)) names.push(Object.hasOwn(p, 'constructor') ? p.constructor.name : '?');
  return names;
};
// Where a member is on the chain: the interface, the kind (a method's
// length), enumerable.
const where = (object, key) => {
  for (let p = Object.getPrototypeOf(object); p !== null; p = Object.getPrototypeOf(p)) {
    const d = Object.getOwnPropertyDescriptor(p, key);
    if (d) return `${p.constructor.name} ${'value' in d ? (typeof d.value === 'function' ? `method/${d.value.length}` : typeof d.value) : `${d.get ? 'get' : ''}${d.set ? 'set' : ''}`}${d.enumerable ? ' enumerable' : ''}`;
  }
  return null;
};
const attempt = (f) => {
  try {
    const value = f();
    return value === undefined ? 'undefined' : JSON.stringify(value);
  } catch (error) {
    return error.constructor.name;
  }
};

for (const jsdom of VERSIONS) {
  parity(`jsdom ${jsdom}: the style objects' interfaces, members and legacy methods`, (w) => {
    const el = w.document.body.appendChild(w.document.createElement('div'));
    const style = el.style;
    style.width = '1px';
    const computed = w.getComputedStyle(el);
    const P = Object.getPrototypeOf(style);
    return {
      style: chain(style),
      computed: chain(computed),
      same: P === Object.getPrototypeOf(computed),
      tag: Object.prototype.toString.call(style),
      CSSStyleProperties: typeof w.CSSStyleProperties,
      // cssstyle 5.3 and earlier also have a length setter, not modeled
      // (it leaves cssstyle's state inconsistent).
      members: KEYS.map((key) => `${String(key)}: ${where(style, key)}`.replace(/^(length: \w+ get)set/, '$1')),
      stubs: ['getPropertyCSSValue', 'getPropertyShorthand', 'isPropertyImplicit'].map((key) => typeof P[key] === 'function' && [P[key].call(null, 'width'), style[key]('width')]),
      iterate: attempt(() => [...style]),
      missing: [() => style.item(), () => style.item(0), () => style.item(5), () => style.setProperty(), () => (style.setProperty('height'), style.cssText),
        () => style.getPropertyValue(), () => style.getPropertyPriority(), () => style.removeProperty()].map(attempt),
    };
  }, { jsdom });

  // As vi.spyOn and jest.spyOn replace an accessor: el.style and computed
  // reads and writes go through the prototype's accessor.
  parity(`jsdom ${jsdom}: a spied width accessor sees el.style and computed reads and writes`, (w) => {
    const el = w.document.body.appendChild(w.document.createElement('div'));
    const proto = Object.hasOwn(w.CSSStyleDeclaration.prototype, 'width') ? w.CSSStyleDeclaration.prototype : w.CSSStyleProperties.prototype;
    const original = Object.getOwnPropertyDescriptor(proto, 'width');
    const calls = [];
    Object.defineProperty(proto, 'width', {
      get() { calls.push('get'); return original.get.call(this); },
      set(value) { calls.push(`set ${value}`); original.set.call(this, value); },
      enumerable: true,
      configurable: true,
    });
    try {
      const out = [proto.constructor.name];
      el.style.width = '5px';
      out.push(calls.splice(0).join());
      out.push(el.style.width, calls.splice(0).join());
      // jsdom 20 to 27 call the setter while computing the style.
      const computed = w.getComputedStyle(el);
      calls.length = 0;
      out.push(computed.width, calls.splice(0).join());
      out.push(el.style.getPropertyValue('width'), calls.splice(0).join());
      return out;
    } finally {
      Object.defineProperty(proto, 'width', original);
    }
  }, { jsdom });
}

// azimuth (CSS 2 aural style sheets): cssstyle 2 to 4.1 convert it to an
// angle, 4.4 to 5.2 keep any value, 5.3 only CSS-wide keywords; cssstyle 6
// and jsdom 29 have none (an own data property).
const AZIMUTHS = ['left', 'right', 'center', 'far-left', 'left-side', 'center-left', 'center-right', 'far-right', 'right-side', 'leftwards', 'LeftWards',
  'rightwards', 'behind', 'Behind', 'left behind', 'behind far-right', 'behind behind', 'left right', 'left-side behind', 'rightwards behind',
  '30deg', '-30deg', '+30deg', '.5deg', '30.50deg', '1.deg', '1e1deg', '30DEG', '360deg', '361deg', '400deg', '720deg', '1000deg', '-0deg', '-360deg',
  '-400deg', '-1000deg', '10grad', '1.1grad', '-10grad', '1rad', '0.3rad', '1turn', '0', '20', 'calc(10deg)', 'foo', 'toString', 'behind constructor',
  ' left ', 'inherit', 'INHERIT', 'initial', 'unset', 'revert', 'revert-layer'];
for (const jsdom of [20, 22, 25, 26, 27, 28, 29]) {
  parity(`jsdom ${jsdom}: azimuth`, (w) => {
    const make = () => w.document.createElement('div').style;
    const out = [`has ${'azimuth' in make()}`];
    for (const value of AZIMUTHS) {
      const a = make();
      a.azimuth = value;
      const b = make();
      b.setProperty('azimuth', value);
      const c = make();
      c.cssText = `azimuth: ${value}`;
      out.push(`${value} -> ${a.azimuth} | ${a.cssText} | ${b.cssText} | ${c.cssText}`);
    }
    for (const [first, then] of [['left', ''], ['left', null], ['left', undefined], ['inherit', ''], ['inherit', null], ['inherit', undefined],
      ['left', 'inherit'], ['left', 'foo'], ['x', ''], ['x', null], ['left', 5]]) {
      const s = make();
      s.azimuth = first;
      s.azimuth = then;
      out.push(`${first} then ${then}: ${s.cssText}`);
    }
    let s = make();
    s.azimuth = 'left';
    s.setProperty('azimuth', '');
    out.push(`setProperty '': ${s.cssText}`);
    s = make();
    s.azimuth = 'left';
    out.push(`removeProperty: ${s.removeProperty('azimuth')} ${s.cssText}`);
    s = make();
    s.setProperty('azimuth', 'right', 'important');
    out.push(`important: ${s.cssText}`);
    for (const value of ['left', 'inherit']) {
      const el = w.document.body.appendChild(w.document.createElement('div'));
      el.style.azimuth = value;
      out.push(`computed ${value}: ${w.getComputedStyle(el).azimuth} ${w.getComputedStyle(el).getPropertyValue('azimuth')} ${el.getAttribute('style')}`);
    }
    return out;
  }, { jsdom });
}

// Writes to the computed object before jsdom 28 go through the same
// setters as el.style (black box, jsdom 20 to 27.4): azimuth is converted
// or ignored as there, invalid values are ignored, an empty value removes
// the property; from 28 the setters still validate and the methods throw.
for (const jsdom of [20, 22, 25, 26, 27, 28]) {
  parity(`jsdom ${jsdom}: writes to the computed style`, (w) => {
    const t = (f) => { try { return JSON.stringify(f()); } catch (e) { return `throws ${e.name}`; } };
    const fresh = () => w.getComputedStyle(w.document.body.appendChild(w.document.createElement('div')));
    const out = [];
    for (const [name, values] of [['azimuth', ['left', 'foo', '30Deg', '1turn', 'inherit', '', 'behind']], ['width', ['10px', 'foo', '']],
      ['color', ['red', 'foo', 'rgb(1,2,3)', '']], ['display', ['flex', 'foo']]]) {
      for (const how of ['set', 'setProperty']) {
        const s = fresh();
        const css = name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
        out.push(`${name} ${how}: ${values.map((v) => `${v} ${t(() => { if (how === 'set') s[name] = v; else s.setProperty(css, v); })} ${t(() => s[name])}`).join(' | ')}`);
      }
    }
    return out;
  }, { jsdom });
}

// cssstyle 4.2 to 4.3 (black box, jsdom 26.1.0 with cssstyle 4.2.0 to
// 4.3.1): an angle written becomes NaNdeg; keywords convert as before.
test('cssstyle 4.2 to 4.3: azimuth angles are NaNdeg', () => {
  for (const cssstyle of ['4.2.0', '4.3.1']) {
    const w = createWindow({ jsdom: '26.1.0', cssstyle });
    const read = (value) => { const s = w.document.createElement('div').style; s.azimuth = value; return s.azimuth; };
    assert.deepEqual(['30deg', '-30deg', '1.deg', '1e1deg', '1turn', '10grad', '30Deg', '0', 'left', 'behind left', 'leftwards'].map(read),
      ['NaNdeg', 'NaNdeg', 'NaNdeg', 'NaNdeg', 'NaNdeg', 'NaNdeg', '', '', '320deg', '220deg', 'leftwards'], cssstyle);
  }
  // 4.1 converts them.
  const w = createWindow({ jsdom: '26.1.0', cssstyle: '4.1.0' });
  const s = w.document.createElement('div').style;
  s.azimuth = '-30deg';
  assert.equal(s.azimuth, '330deg');
});

// Each profile group builds CSSStyleDeclaration's members once: windows of
// one profile share the descriptors, not the prototypes (patches stay per
// window).
test('before jsdom 29, each window has its own CSSStyleDeclaration prototype with the accessors', () => {
  const a = createWindow({ jsdom: '26.1.0' });
  const b = createWindow({ jsdom: '26.1.0' });
  assert.notEqual(a.CSSStyleDeclaration.prototype, b.CSSStyleDeclaration.prototype);
  Object.defineProperty(a.CSSStyleDeclaration.prototype, 'width', { get: () => 'spied', configurable: true });
  assert.equal(a.document.body.style.width, 'spied');
  assert.equal(b.document.body.style.width, '');
  // A rule's style too (jsdom 27.1 to 28: cssstyle's).
  const c = createWindow({ jsdom: '28.1.0' });
  c.document.head.innerHTML = '<style>p { color: red }</style>';
  assert.equal(Object.getPrototypeOf(c.document.styleSheets[0].cssRules[0].style), c.CSSStyleDeclaration.prototype);
  assert.equal(c.document.styleSheets[0].cssRules[0].style.color, 'red');
});
