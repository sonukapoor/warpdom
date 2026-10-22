// SVG interfaces as jsdom has them (SVG 1.1 and 2): className as an
// SVGAnimatedString, ownerSVGElement and viewportElement, the
// conditional processing lists (requiredExtensions, systemLanguage),
// viewBox and preserveAspectRatio, and SVGSVGElement's factories and
// legacy redraw methods. Behavior measured black box on jsdom 20.0.3 to
// 30.1.3, including where jsdom differs from SVG 2:
// - viewBox and preserveAspectRatio parse only what jsdom accepts (no
//   tabs or newlines, no "defer"); an invalid or missing value reads as
//   0 0 0 0 and xMidYMid meet, never null.
// - preserveAspectRatio's animVal is writable like its baseVal; viewBox's
//   animVal throws a DOMException named NO_MODIFICATION_ALLOWED_ERR.
// - From jsdom 26.1.0 (compat.svgTypes): SVGGElement, SVGDefsElement,
//   SVGDescElement, SVGMetadataElement, SVGSwitchElement and
//   SVGSymbolElement, SVGRect, viewBox, preserveAspectRatio and
//   createSVGRect(). Before, those elements are SVGElements and only svg is
//   an SVGGraphicsElement.
// - From 26.1.0 to 30.0.x (compat.svgSymbolViewport) a symbol is the
//   viewportElement of its descendants.
// - SVGSVGElement's window event handlers forward to the window, as body's
//   do, before jsdom 28.1.0 (event-handlers.js).
import { S, state, domError, tooFewArguments, nextInTree, ELEMENT_NODE, SVG_NS } from './internal.js';
import { writeAttribute, attributeSteps } from './attributes.js';
import { liveList } from './collections.js';
import { SVG_WINDOW_HANDLER_MEMBERS } from './event-handlers.js';
import { NONCE } from './reflect.js';

const protosOf = (element) => element[S].doc[S].window[S].protos;
const compatOf = (element) => element[S].doc[S].window[S].compat;

function make(proto, data) {
  const object = Object.create(proto);
  object[S] = data;
  return object;
}

// An object made once per element and kept in its state.
function cached(element, key, iface, data) {
  const s = state(element);
  return s[key] ?? (s[key] = make(protosOf(element)[iface], data));
}

// WebIDL float: a finite number that fits a single-precision float.
function toFloat(value, iface, name) {
  const x = Number(value);
  if (!Number.isFinite(x))
    throw new TypeError(
      `Failed to set the '${name}' property on '${iface}': The provided value is not a finite floating-point value.`,
    );
  const y = Math.fround(x);
  if (!Number.isFinite(y))
    throw new TypeError(
      `Failed to set the '${name}' property on '${iface}': The provided value is outside the range of a single-precision floating-point value.`,
    );
  return y;
}

// --- viewBox --------------------------------------------------------------------------
// Four numbers separated by spaces or a comma with optional spaces around
// it, spaces before and after; a negative width or height is an error.

const NUMBER = '([+-]?(?:\\d+(?:\\.\\d+)?|\\.\\d+)(?:[eE][+-]?\\d+)?)';
const SEPARATOR = '(?: *, *| +)';
const VIEW_BOX = new RegExp(`^ *${NUMBER}${SEPARATOR}${NUMBER}${SEPARATOR}${NUMBER}${SEPARATOR}${NUMBER} *$`);
const NO_RECT = Object.freeze({ x: 0, y: 0, width: 0, height: 0 });

function parseViewBox(value) {
  if (value === undefined) return NO_RECT;
  const m = VIEW_BOX.exec(value);
  if (m === null) return NO_RECT;
  const rect = { x: Number(m[1]), y: Number(m[2]), width: Number(m[3]), height: Number(m[4]) };
  return rect.width < 0 || rect.height < 0 ? NO_RECT : rect;
}

// The rectangle an SVGRect shows: its own, or its element's viewBox.
function rectOf(object) {
  const s = state(object);
  if (s.element === undefined) return s;
  const value = s.element[S].attrs.get('viewBox');
  if (s.parsedFrom !== value || s.parsed === undefined) {
    s.parsed = parseViewBox(value);
    s.parsedFrom = value;
  }
  return s.parsed;
}

function setRect(object, name, value) {
  const s = state(object);
  const v = toFloat(value, 'SVGRect', name);
  if (s.element === undefined) {
    s[name] = v;
    return;
  }
  if (s.readOnly) throw domError('This SVGRect is read-only', 'NO_MODIFICATION_ALLOWED_ERR');
  const rect = { ...rectOf(object), [name]: v };
  writeAttribute(s.element, 'viewBox', `${rect.x} ${rect.y} ${rect.width} ${rect.height}`);
}

const viewBoxMember = {
  get viewBox() {
    return cached(this, 'svgViewBox', 'SVGAnimatedRect', { element: this });
  },
};

// --- preserveAspectRatio --------------------------------------------------------------

const ALIGNS = [
  'none',
  'xMinYMin',
  'xMidYMin',
  'xMaxYMin',
  'xMinYMid',
  'xMidYMid',
  'xMaxYMid',
  'xMinYMax',
  'xMidYMax',
  'xMaxYMax',
];
const PRESERVE_ASPECT_RATIO = new RegExp(`^(${ALIGNS.join('|')})(?: +(meet|slice))?$`);
const ALIGN_VALUE = new Map(ALIGNS.map((name, i) => [name, i + 1]));
const DEFAULT_RATIO = Object.freeze({ align: 6, meetOrSlice: 1 }); // xMidYMid meet

function parseRatio(value) {
  const m = value === undefined ? null : PRESERVE_ASPECT_RATIO.exec(value);
  if (m === null) return DEFAULT_RATIO;
  return { align: ALIGN_VALUE.get(m[1]), meetOrSlice: m[2] === 'slice' ? 2 : 1 };
}

const ratioOf = (object) => parseRatio(state(object).element[S].attrs.get('preserveAspectRatio'));

function writeRatio(object, { align, meetOrSlice }) {
  writeAttribute(
    state(object).element,
    'preserveAspectRatio',
    `${ALIGNS[align - 1]} ${meetOrSlice === 2 ? 'slice' : 'meet'}`,
  );
}

const ratioMember = {
  get preserveAspectRatio() {
    return cached(this, 'svgRatio', 'SVGAnimatedPreserveAspectRatio', { element: this });
  },
};

const RATIO_CONSTANTS = {
  SVG_PRESERVEASPECTRATIO_UNKNOWN: 0,
  SVG_PRESERVEASPECTRATIO_NONE: 1,
  SVG_PRESERVEASPECTRATIO_XMINYMIN: 2,
  SVG_PRESERVEASPECTRATIO_XMIDYMIN: 3,
  SVG_PRESERVEASPECTRATIO_XMAXYMIN: 4,
  SVG_PRESERVEASPECTRATIO_XMINYMID: 5,
  SVG_PRESERVEASPECTRATIO_XMIDYMID: 6,
  SVG_PRESERVEASPECTRATIO_XMAXYMID: 7,
  SVG_PRESERVEASPECTRATIO_XMINYMAX: 8,
  SVG_PRESERVEASPECTRATIO_XMIDYMAX: 9,
  SVG_PRESERVEASPECTRATIO_XMAXYMAX: 10,
  SVG_MEETORSLICE_UNKNOWN: 0,
  SVG_MEETORSLICE_MEET: 1,
  SVG_MEETORSLICE_SLICE: 2,
};

// --- SVGStringList ----------------------------------------------------------------------
// requiredExtensions: space-separated tokens, written back joined by a
// space; systemLanguage: comma-separated (HTML "split a string on
// commas"), written back joined by ", ". The list keeps its items
// between its own writes and parses the attribute again after any other
// change to it.

const ASCII_WS = /^[\t\n\f\r ]+|[\t\n\f\r ]+$/g;

function splitOnCommas(value) {
  if (value === '') return [];
  const tokens = [];
  let start = 0;
  for (;;) {
    const comma = value.indexOf(',', start);
    tokens.push(value.slice(start, comma === -1 ? value.length : comma).replace(ASCII_WS, ''));
    if (comma === -1) return tokens;
    start = comma + 1;
    if (start === value.length) return tokens;
  }
}

const splitOnSpaces = (value) => value.split(/[\t\n\f\r ]+/).filter(Boolean);

const LISTS = {
  requiredExtensions: { key: 'svgRequiredExtensions', parse: splitOnSpaces, separator: ' ' },
  systemLanguage: { key: 'svgSystemLanguage', parse: splitOnCommas, separator: ', ' },
};

function stringList(element, attribute) {
  const s = state(element);
  const { key, parse, separator } = LISTS[attribute];
  if (s[key]) return s[key];
  const data = { element, attribute, separator, items: [], dirty: true, writing: false };
  const items = () => {
    if (data.dirty) {
      data.items = parse(element[S].attrs.get(attribute) ?? '');
      data.dirty = false;
    }
    return data.items;
  };
  const list = liveList(protosOf(element).SVGStringList, items, null, (index, value) =>
    replaceItem(data, items(), String(value), index),
  );
  list[S].svg = data;
  data.read = items;
  return (s[key] = list);
}

for (const attribute of Object.keys(LISTS)) {
  attributeSteps.set(attribute, (element) => {
    const list = element[S][LISTS[attribute].key];
    if (list !== undefined && !list[S].svg.writing) list[S].svg.dirty = true;
  });
}

const listData = (list) => {
  const data = list?.[S]?.svg;
  if (data === undefined) throw new TypeError('Illegal invocation');
  return data;
};

function writeList(data) {
  data.writing = true;
  try {
    writeAttribute(data.element, data.attribute, data.items.join(data.separator));
  } finally {
    data.writing = false;
  }
}

function checkIndex(index, length) {
  if (index >= length)
    throw domError(
      `The index provided (${index}) is greater than or equal to the maximum bound (${length}).`,
      'IndexSizeError',
    );
}

function replaceItem(data, items, item, index) {
  checkIndex(index, items.length);
  items[index] = item;
  writeList(data);
  return item;
}

// --- ownerSVGElement and viewportElement --------------------------------------------------
// The nearest svg ancestor (viewportElement: or symbol, jsdom 26.1.0 to
// 30.0.x), through SVG elements only.

function nearestViewport(element, symbol) {
  for (let n = state(element).parent; n !== null; n = n[S].parent) {
    const s = n[S];
    if (s.type !== ELEMENT_NODE || s.ns !== SVG_NS) return null;
    if (s.tag === 'svg' || (symbol && s.tag === 'symbol')) return n;
  }
  return null;
}

// --- members --------------------------------------------------------------------------

export const SVG_ELEMENT_MEMBERS = {
  get className() {
    return cached(this, 'svgClassName', 'SVGAnimatedString', { element: this });
  },
  get ownerSVGElement() {
    return nearestViewport(this, false);
  },
  get viewportElement() {
    return nearestViewport(this, compatOf(this).svgSymbolViewport);
  },
  nonce: NONCE,
};

const SVG_GRAPHICS_MEMBERS = {
  get requiredExtensions() {
    return stringList(this, 'requiredExtensions');
  },
  get systemLanguage() {
    return stringList(this, 'systemLanguage');
  },
};

const SVG_SVG_MEMBERS = {
  createSVGNumber() {
    state(this);
    return make(protosOf(this).SVGNumber, { value: 0 });
  },
  createSVGRect() {
    state(this);
    return make(protosOf(this).SVGRect, { x: 0, y: 0, width: 0, height: 0 });
  },
  // The first element with the id in tree order: the svg itself or a
  // descendant.
  getElementById(elementId) {
    state(this);
    if (elementId === undefined && arguments.length < 1)
      tooFewArguments('SVGSVGElement', 'getElementById', 1, arguments.length);
    const id = String(elementId);
    if (id === '') return null;
    for (let n = this; n !== null; n = nextInTree(n, this)) {
      if (n[S].type === ELEMENT_NODE && n[S].attrs.get('id') === id) return n;
    }
    return null;
  },
  // Legacy redraw methods: no effect; suspendRedraw returns 1.
  suspendRedraw(maxWaitMilliseconds) {
    state(this);
    if (maxWaitMilliseconds === undefined && arguments.length < 1)
      tooFewArguments('SVGSVGElement', 'suspendRedraw', 1, arguments.length);
    void (maxWaitMilliseconds >>> 0);
    return 1;
  },
  unsuspendRedraw(suspendHandleID) {
    state(this);
    if (suspendHandleID === undefined && arguments.length < 1)
      tooFewArguments('SVGSVGElement', 'unsuspendRedraw', 1, arguments.length);
    void (suspendHandleID >>> 0);
  },
  unsuspendRedrawAll() {
    state(this);
  },
  forceRedraw() {
    state(this);
  },
};

const asConstants = (table) => Object.fromEntries(Object.entries(table).map(([k, v]) => [k, { constant: v }]));

// Members that arrived with jsdom 26.1.0.
const SVG_TYPES_MEMBERS = ['createSVGRect', 'viewBox', 'preserveAspectRatio'];

export const SVG_INTERFACES = [
  { name: 'SVGGraphicsElement', parent: 'SVGElement', members: SVG_GRAPHICS_MEMBERS },
  {
    name: 'SVGSVGElement',
    parent: 'SVGGraphicsElement',
    members: [SVG_SVG_MEMBERS, viewBoxMember, ratioMember, SVG_WINDOW_HANDLER_MEMBERS],
    compat(proto, compat) {
      if (!compat.svgTypes) for (const name of SVG_TYPES_MEMBERS) delete proto[name];
    },
  },
  { name: 'SVGTitleElement', parent: 'SVGElement', members: {} },
  { name: 'SVGGElement', parent: 'SVGGraphicsElement', members: {} },
  { name: 'SVGDefsElement', parent: 'SVGGraphicsElement', members: {} },
  { name: 'SVGDescElement', parent: 'SVGElement', members: {} },
  { name: 'SVGMetadataElement', parent: 'SVGElement', members: {} },
  { name: 'SVGSymbolElement', parent: 'SVGGraphicsElement', members: [viewBoxMember, ratioMember] },
  { name: 'SVGSwitchElement', parent: 'SVGGraphicsElement', members: {} },
  {
    name: 'SVGAnimatedString',
    members: {
      get baseVal() {
        return state(this).element[S].attrs.get('class') ?? '';
      },
      set baseVal(v) {
        writeAttribute(state(this).element, 'class', String(v));
      },
      get animVal() {
        return state(this).element[S].attrs.get('class') ?? '';
      },
    },
  },
  {
    name: 'SVGNumber',
    members: {
      get value() {
        return state(this).value;
      },
      set value(v) {
        const s = state(this);
        s.value = toFloat(v, 'SVGNumber', 'value');
      },
    },
  },
  {
    name: 'SVGRect',
    members: {
      get x() {
        return rectOf(this).x;
      },
      set x(v) {
        setRect(this, 'x', v);
      },
      get y() {
        return rectOf(this).y;
      },
      set y(v) {
        setRect(this, 'y', v);
      },
      get width() {
        return rectOf(this).width;
      },
      set width(v) {
        setRect(this, 'width', v);
      },
      get height() {
        return rectOf(this).height;
      },
      set height(v) {
        setRect(this, 'height', v);
      },
    },
  },
  {
    name: 'SVGAnimatedRect',
    members: {
      get baseVal() {
        const s = state(this);
        return s.baseVal ?? (s.baseVal = make(protosOf(s.element).SVGRect, { element: s.element, readOnly: false }));
      },
      get animVal() {
        const s = state(this);
        return s.animVal ?? (s.animVal = make(protosOf(s.element).SVGRect, { element: s.element, readOnly: true }));
      },
    },
  },
  {
    name: 'SVGPreserveAspectRatio',
    statics: RATIO_CONSTANTS,
    members: [
      {
        get align() {
          return ratioOf(this).align;
        },
        set align(v) {
          const align = Number(v) & 0xffff; // WebIDL unsigned short
          if (align < 1 || align > ALIGNS.length) throw new TypeError('Invalid alignment');
          writeRatio(this, { align, meetOrSlice: ratioOf(this).meetOrSlice });
        },
        get meetOrSlice() {
          return ratioOf(this).meetOrSlice;
        },
        set meetOrSlice(v) {
          const meetOrSlice = Number(v) & 0xffff;
          if (meetOrSlice < 1 || meetOrSlice > 2) throw new TypeError('Invalid meet-or-slice value');
          writeRatio(this, { align: ratioOf(this).align, meetOrSlice });
        },
      },
      asConstants(RATIO_CONSTANTS),
    ],
  },
  {
    name: 'SVGAnimatedPreserveAspectRatio',
    members: {
      get baseVal() {
        const s = state(this);
        return s.baseVal ?? (s.baseVal = make(protosOf(s.element).SVGPreserveAspectRatio, { element: s.element }));
      },
      get animVal() {
        const s = state(this);
        return s.animVal ?? (s.animVal = make(protosOf(s.element).SVGPreserveAspectRatio, { element: s.element }));
      },
    },
  },
  {
    name: 'SVGStringList',
    members: {
      get length() {
        return listData(this).read().length;
      },
      get numberOfItems() {
        return listData(this).read().length;
      },
      clear() {
        const data = listData(this);
        data.read();
        data.items = [];
        writeList(data);
      },
      initialize(newItem) {
        const data = listData(this);
        if (newItem === undefined && arguments.length < 1)
          tooFewArguments('SVGStringList', 'initialize', 1, arguments.length);
        const item = String(newItem);
        data.read();
        data.items = [item];
        writeList(data);
        // jsdom returns nothing (SVG 2: the new item).
      },
      getItem(index) {
        const data = listData(this);
        if (index === undefined && arguments.length < 1)
          tooFewArguments('SVGStringList', 'getItem', 1, arguments.length);
        const items = data.read();
        const i = index >>> 0;
        checkIndex(i, items.length);
        return items[i];
      },
      insertItemBefore(newItem, index) {
        const data = listData(this);
        if (index === undefined && arguments.length < 2)
          tooFewArguments('SVGStringList', 'insertItemBefore', 2, arguments.length);
        const item = String(newItem);
        const items = data.read();
        items.splice(Math.min(index >>> 0, items.length), 0, item);
        writeList(data);
        return item;
      },
      replaceItem(newItem, index) {
        const data = listData(this);
        if (index === undefined && arguments.length < 2)
          tooFewArguments('SVGStringList', 'replaceItem', 2, arguments.length);
        const item = String(newItem);
        return replaceItem(data, data.read(), item, index >>> 0);
      },
      removeItem(index) {
        const data = listData(this);
        if (index === undefined && arguments.length < 1)
          tooFewArguments('SVGStringList', 'removeItem', 1, arguments.length);
        const items = data.read();
        const i = index >>> 0;
        checkIndex(i, items.length);
        const [item] = items.splice(i, 1);
        writeList(data);
        return item;
      },
      appendItem(newItem) {
        const data = listData(this);
        if (newItem === undefined && arguments.length < 1)
          tooFewArguments('SVGStringList', 'appendItem', 1, arguments.length);
        const item = String(newItem);
        data.read().push(item);
        writeList(data);
        return item;
      },
      [Symbol.iterator]: Array.prototype.values,
    },
  },
];

// SVG elements with an interface of their own; others are SVGElement.
// Before jsdom 26.1.0 only svg and title.
export const SVG_ELEMENTS = new Map([
  ['svg', 'SVGSVGElement'],
  ['title', 'SVGTitleElement'],
  ['g', 'SVGGElement'],
  ['defs', 'SVGDefsElement'],
  ['desc', 'SVGDescElement'],
  ['metadata', 'SVGMetadataElement'],
  ['switch', 'SVGSwitchElement'],
  ['symbol', 'SVGSymbolElement'],
]);
export const LEGACY_SVG_ELEMENTS = new Map([
  ['svg', 'SVGSVGElement'],
  ['title', 'SVGTitleElement'],
]);
// Window properties jsdom added in 26.1.0.
export const SVG_TYPES_INTERFACES = [
  'SVGGElement',
  'SVGDefsElement',
  'SVGDescElement',
  'SVGMetadataElement',
  'SVGSwitchElement',
  'SVGSymbolElement',
  'SVGRect',
  'SVGAnimatedRect',
  'SVGPreserveAspectRatio',
  'SVGAnimatedPreserveAspectRatio',
];
