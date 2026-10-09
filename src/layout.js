// Layout stubs. There is no layout engine, so, as in jsdom, every box is
// empty: rects and sizes are 0 and offsetParent is null. Scroll positions
// keep whatever a test assigns. Tests that need sizes redefine these members
// on the prototypes, so they live on the same interfaces as in jsdom.
import { state } from './internal.js';

// Plain objects, as jsdom returns, so toEqual against literals works.
export const ELEMENT_LAYOUT = {
  getBoundingClientRect() {
    state(this);
    return { x: 0, y: 0, bottom: 0, height: 0, left: 0, right: 0, top: 0, width: 0 };
  },
  getClientRects() { state(this); return []; },
  get clientWidth() { state(this); return 0; },
  get clientHeight() { state(this); return 0; },
  get clientTop() { state(this); return 0; },
  get clientLeft() { state(this); return 0; },
  get scrollWidth() { state(this); return 0; },
  get scrollHeight() { state(this); return 0; },
  get scrollTop() { return state(this).scrollTop ?? 0; },
  set scrollTop(v) { state(this).scrollTop = toDouble(v); },
  get scrollLeft() { return state(this).scrollLeft ?? 0; },
  set scrollLeft(v) { state(this).scrollLeft = toDouble(v); },
};

export const HTML_ELEMENT_LAYOUT = {
  get offsetParent() { state(this); return null; },
  get offsetWidth() { state(this); return 0; },
  get offsetHeight() { state(this); return 0; },
  get offsetTop() { state(this); return 0; },
  get offsetLeft() { state(this); return 0; },
};

function toDouble(v) {
  const n = Number(v);
  return Number.isNaN(n) ? 0 : n;
}

// --- DOMRect ---------------------------------------------------------------------

const rect = (self, x, y, width, height) => {
  self[RECT] = { x: toNumber(x), y: toNumber(y), width: toNumber(width), height: toNumber(height) };
  return self;
};
const RECT = Symbol('rect');
const toNumber = (v) => (v === undefined ? 0 : Number(v));
const r = (self) => {
  const s = self?.[RECT];
  if (!s) throw new TypeError('Illegal invocation');
  return s;
};

function fromRect(other = {}) {
  return new this(other.x, other.y, other.width, other.height);
}

export const GEOMETRY_INTERFACES = [
  {
    name: 'DOMRectReadOnly',
    construct: (w, self, [x, y, width, height]) => rect(self, x, y, width, height),
    statics: { fromRect },
    members: {
      get x() { return r(this).x; },
      get y() { return r(this).y; },
      get width() { return r(this).width; },
      get height() { return r(this).height; },
      // Math.min/max propagate NaN, as the spec intends.
      get top() { const s = r(this); return Math.min(s.y, s.y + s.height); },
      get right() { const s = r(this); return Math.max(s.x, s.x + s.width); },
      get bottom() { const s = r(this); return Math.max(s.y, s.y + s.height); },
      get left() { const s = r(this); return Math.min(s.x, s.x + s.width); },
      toJSON() {
        const { x, y, width, height, top, right, bottom, left } = this;
        return { x, y, width, height, top, right, bottom, left };
      },
    },
  },
  {
    name: 'DOMRect',
    parent: 'DOMRectReadOnly',
    construct: (w, self, [x, y, width, height]) => rect(self, x, y, width, height),
    statics: { fromRect },
    members: {
      get x() { return r(this).x; },
      set x(v) { r(this).x = Number(v); },
      get y() { return r(this).y; },
      set y(v) { r(this).y = Number(v); },
      get width() { return r(this).width; },
      set width(v) { r(this).width = Number(v); },
      get height() { return r(this).height; },
      set height(v) { r(this).height = Number(v); },
    },
  },
];
