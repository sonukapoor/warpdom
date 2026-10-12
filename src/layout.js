// Layout stubs. There is no layout engine, so, as in jsdom, every box is
// empty: rects and sizes are 0 and offsetParent is null. Scroll positions
// keep whatever a test assigns. Tests that need sizes redefine these members
// on the prototypes, so they live on the same interfaces as in jsdom.
// Also innerText and outerText, which depend on rendering (below; kept in
// this module rather than their own, as each module file adds load time).
import {
  S, state, ELEMENT_NODE, TEXT_NODE, CDATA_SECTION_NODE, HTML_NS, SVG_NS,
  connected, textOf, insert, replaceAll, replace, replaceData, remove, domError,
} from './internal.js';
import { computedValue } from './cascade.js';
import { findSlot } from './slots.js';

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

// --- innerText and outerText ------------------------------------------------------
// innerText and outerText (HTML 3.2.7, "the innerText and outerText
// properties"). The getter follows the "rendered text collection steps"
// without layout: whether an element is rendered, its display, visibility,
// white-space and text-transform come from the computed style; boxes are
// approximated by the display types (block-level, atomic inline, table
// parts). CSS white-space processing (collapsing, removal at line starts
// and ends) runs in one pass over the collected text.
//
// jsdom has no innerText (jsdom 25 to 30): there the property is an
// ordinary expando. warpdom implements it as browsers do; see PLAN.md.

// Elements whose contents are not rendered as text (replaced elements and
// embedded content): they are atomic inlines with no text.
const REPLACED = new Set(['img', 'input', 'textarea', 'iframe', 'video', 'audio', 'canvas', 'object', 'embed', 'meter', 'progress']);
const TABLE_INTERNAL = new Set(['table', 'inline-table', 'table-row-group', 'table-header-group', 'table-footer-group', 'table-row',
  'table-column-group', 'table-column']);
const BLOCK_LEVEL = new Set(['block', 'list-item', 'table', 'flex', 'grid', 'flow-root', 'table-caption', 'ruby-base-container']);
const ATOMIC = new Set(['inline-block', 'inline-flex', 'inline-grid', 'inline-table', 'inline flow-root']);
// SVG elements that render no text.
const SVG_TEXT = new Set(['text', 'tspan', 'textPath']);
// White-space of elements whose user agent style sets it (HTML 15.3.3).
const UA_WHITE_SPACE = new Map([['pre', 'pre'], ['listing', 'pre'], ['xmp', 'pre'], ['plaintext', 'pre'], ['textarea', 'pre-wrap'], ['nobr', 'nowrap']]);

const isHTML = (el) => el[S].ns === HTML_NS;
const isElement = (n) => n[S].type === ELEMENT_NODE;

function display(el) {
  const d = computedValue(el, 'display');
  if (d === '' || d === undefined) return 'inline';
  return d;
}

// The flat-tree parent: through a shadow root to its host.
const flatParent = (n) => {
  const p = n[S].parent;
  if (p === null) return null;
  return p[S].shadow === true ? p[S].host : p;
};

// Whether a child of parent can be rendered at all: replaced elements show
// no children, closed details only their summary, shadow hosts only
// slotted children, SVG only foreignObject's HTML and text in text
// elements.
function childRendered(parent, child) {
  const ps = parent[S];
  if (ps.type !== ELEMENT_NODE) return true;
  if (ps.shadowRoot && child[S].parent === parent && findSlot(child) === null) return false;
  if (ps.ns === HTML_NS) {
    if (REPLACED.has(ps.tag)) return false;
    if (ps.tag === 'details' && !ps.attrs.has('open')) {
      return isElement(child) && isHTML(child) && child[S].tag === 'summary' && firstSummary(parent) === child;
    }
    // noscript content is not rendered when scripting is enabled.
    if (ps.tag === 'noscript') return false;
    if (ps.tag === 'select' || (ps.tag === 'optgroup' && inSelect(parent))) return isElement(child) && isHTML(child) && (child[S].tag === 'option' || (child[S].tag === 'optgroup' && ps.tag === 'select'));
    return true;
  }
  if (ps.ns === SVG_NS) {
    if (ps.tag === 'foreignObject') return true;
    if (!isElement(child)) return SVG_TEXT.has(ps.tag) || ps.tag === 'a';
    return child[S].ns === SVG_NS && !SVG_HIDDEN.has(child[S].tag);
  }
  return true;
}
const SVG_HIDDEN = new Set(['defs', 'clipPath', 'mask', 'pattern', 'linearGradient', 'radialGradient', 'stop', 'symbol', 'marker',
  'title', 'desc', 'metadata', 'filter', 'style', 'script']);

const inSelect = (el) => {
  const p = el[S].parent;
  return p !== null && p[S].type === ELEMENT_NODE && p[S].ns === HTML_NS && p[S].tag === 'select';
};

function firstSummary(details) {
  for (let c = details[S].first; c; c = c[S].next) if (isElement(c) && isHTML(c) && c[S].tag === 'summary') return c;
  return null;
}

// "Being rendered", without layout: connected, in a document with a
// browsing context, and neither it nor a flat-tree ancestor is
// display: none or content that is not rendered.
function beingRendered(el) {
  if (el[S].doc[S].noView || !connected(el)) return false;
  for (let n = el; n; ) {
    if (isElement(n) && display(n) === 'none') return false;
    const p = flatParent(n);
    if (p === null) return true;
    if (!childRendered(p, n)) return false;
    n = p;
  }
  return true;
}

// The collected text: strings and required line break counts (numbers),
// with CSS white-space processing applied as it is built.
class Builder {
  constructor() {
    this.out = [];
    this.pending = false; // a collapsible space, kept until content follows on the line
    this.lineStart = true;
  }

  content(text) {
    if (text === '') return;
    if (this.pending) { this.out.push(' '); this.pending = false; }
    this.out.push(text);
    this.lineStart = false;
  }

  space() { if (!this.lineStart) this.pending = true; }

  // A forced line break (br, a preserved newline): spaces before it go.
  hard(text) {
    this.pending = false;
    this.out.push(text);
    this.lineStart = true;
  }

  // A required line break count (0: a block boundary without a break).
  count(n) {
    this.pending = false;
    this.out.push(n);
    this.lineStart = true;
  }

  // An atomic inline: content outside, its own lines inside.
  open() {
    if (this.pending) { this.out.push(' '); this.pending = false; }
    this.lineStart = true;
  }

  close() {
    this.pending = false;
    this.lineStart = false;
  }

  result() {
    const out = this.out;
    let start = 0;
    let end = out.length;
    while (start < end && typeof out[start] === 'number') start++;
    while (end > start && typeof out[end - 1] === 'number') end--;
    let text = '';
    for (let i = start; i < end; i++) {
      const item = out[i];
      if (typeof item !== 'number') { text += item; continue; }
      let max = item;
      while (i + 1 < end && typeof out[i + 1] === 'number') max = Math.max(max, out[++i]);
      text += '\n'.repeat(max);
    }
    return text;
  }
}

function transform(text, mode, el) {
  switch (mode) {
    case 'uppercase': {
      const lang = el ? languageOf(el) : '';
      return lang ? text.toLocaleUpperCase(lang) : text.toUpperCase();
    }
    case 'lowercase': {
      const lang = el ? languageOf(el) : '';
      return lang ? text.toLocaleLowerCase(lang) : text.toLowerCase();
    }
    case 'capitalize': return text.replace(/(^|[^\p{L}\p{N}'’])(\p{L})/gu, (m, before, letter) => before + letter.toUpperCase());
    default: return text;
  }
}

function languageOf(el) {
  for (let n = el; n && isElement(n); n = n[S].parent) {
    const lang = n[S].attrs.get('lang');
    if (lang !== undefined) {
      try { return Intl.getCanonicalLocales(lang)[0] ?? ''; } catch { return ''; }
    }
  }
  return '';
}

function inheritedOr(el, property, inherited) {
  const v = computedValue(el, property);
  return v === '' || v === undefined ? inherited : v;
}

// One text node's text, white-space processed.
function collectText(b, data, ws, tt, el) {
  if (tt !== 'none' && tt !== '') data = transform(data, tt, el);
  if (ws === 'pre' || ws === 'pre-wrap' || ws === 'break-spaces') {
    const parts = data.split(/\r\n|\r|\n/);
    for (let i = 0; i < parts.length; i++) {
      if (i > 0) b.hard('\n');
      b.content(parts[i]);
    }
    return;
  }
  const preLine = ws === 'pre-line';
  let i = 0;
  const n = data.length;
  while (i < n) {
    const c = data.charCodeAt(i);
    if (c === 32 || c === 9 || c === 10 || c === 13 || c === 12) {
      let j = i;
      let newline = false;
      while (j < n) {
        const d = data.charCodeAt(j);
        if (d === 10 || d === 13) newline = true;
        else if (d !== 32 && d !== 9 && d !== 12) break;
        j++;
      }
      if (preLine && newline) {
        // Spaces around a preserved segment break are removed.
        let k = i;
        b.pending = false;
        for (; k < j; k++) {
          const d = data.charCodeAt(k);
          if (d === 13 && data.charCodeAt(k + 1) === 10) continue;
          if (d === 10 || d === 13) b.hard('\n');
        }
      } else b.space();
      i = j;
    } else {
      let j = i + 1;
      while (j < n) {
        const d = data.charCodeAt(j);
        if (d === 32 || d === 9 || d === 10 || d === 13 || d === 12) break;
        j++;
      }
      b.content(data.slice(i, j));
      i = j;
    }
  }
}

function isLastOf(el, test) {
  for (let n = el[S].next; n; n = n[S].next) if (isElement(n) && test(n)) return false;
  return true;
}

// The nearest table ancestor's rows after this one, in tree order.
function isLastRow(row) {
  let table = row[S].parent;
  while (table && isElement(table)) {
    const d = display(table);
    if (d === 'table' || d === 'inline-table') break;
    table = table[S].parent;
  }
  if (!table || !isElement(table)) return isLastOf(row, (n) => display(n) === 'table-row');
  // Next node in tree order after row's subtree, within table, skipping nested tables.
  const next = (node, skipChildren) => {
    if (!skipChildren && node[S].first) return node[S].first;
    for (let x = node; x && x !== table; x = x[S].parent) if (x[S].next) return x[S].next;
    return null;
  };
  let n = next(row, true);
  while (n) {
    if (isElement(n)) {
      const d = display(n);
      if (d === 'table-row') return false;
      if (d === 'table' || d === 'inline-table' || d === 'none') { n = next(n, true); continue; }
    }
    n = next(n, false);
  }
  return true;
}

// The rendered text collection steps for node's children (and node).
function collect(b, node, ctx) {
  const s = node[S];
  if (s.type === TEXT_NODE || s.type === CDATA_SECTION_NODE) {
    if (ctx.visible) {
      if (ctx.tableInternal && /^[ \t\n\f\r]*$/.test(s.data)) return;
      collectText(b, s.data, ctx.ws, ctx.tt, ctx.el);
    }
    return;
  }
  if (s.type !== ELEMENT_NODE) return;
  const d = display(node);
  if (d === 'none') return;
  const html = s.ns === HTML_NS;
  const visibility = inheritedOr(node, 'visibility', ctx.visible ? 'visible' : 'hidden');
  const visible = visibility === 'visible';
  const child = {
    visible,
    ws: html && UA_WHITE_SPACE.has(s.tag) && computedValue(node, 'white-space') === '' ? UA_WHITE_SPACE.get(s.tag) : inheritedOr(node, 'white-space', ctx.ws),
    tt: inheritedOr(node, 'text-transform', ctx.tt),
    el: node,
    tableInternal: TABLE_INTERNAL.has(d),
  };
  if (d === 'contents') { children(b, node, child); return; }
  if (html && s.tag === 'br') { if (visible) b.hard('\n'); return; }
  const replaced = html && REPLACED.has(s.tag);
  let kind = ctx.blockify ? 'block' : 'inline';
  if (BLOCK_LEVEL.has(d) || (html && (s.tag === 'option' || s.tag === 'optgroup'))) kind = 'block';
  else if (ATOMIC.has(d) || replaced || (html && s.tag === 'select')) kind = 'atomic';
  else if (d === 'table-cell') kind = 'cell';
  else if (d === 'table-row') kind = 'row';
  else if (TABLE_INTERNAL.has(d)) kind = 'block0';
  if (kind === 'inline' || kind === 'atomic') {
    const float = computedValue(node, 'float');
    const position = computedValue(node, 'position');
    if ((float && float !== 'none') || position === 'absolute' || position === 'fixed') kind = 'block';
  }
  const flex = d === 'flex' || d === 'grid' || d === 'inline-flex' || d === 'inline-grid';
  child.blockify = flex;
  // A p gets two required line breaks, other block-level boxes one.
  const p = html && s.tag === 'p' ? 2 : null;
  const before = !visible ? null : p ?? (kind === 'block' ? 1 : kind === 'atomic' || kind === 'inline' ? null : 0);
  if (kind === 'atomic') {
    if (p !== null && visible) b.count(2);
    b.open();
    if (!replaced) children(b, node, child);
    b.close();
    if (p !== null && visible) b.count(2);
    return;
  }
  if (before !== null) b.count(before);
  else if (kind === 'block' || kind === 'cell' || kind === 'row' || kind === 'block0') b.count(0);
  children(b, node, child);
  if (before !== null) b.count(before);
  else if (kind !== 'inline') b.count(0);
  if (visible && kind === 'cell' && !isLastOf(node, (n) => display(n) === 'table-cell')) b.content('\t');
  if (visible && kind === 'row' && !isLastRow(node)) b.hard('\n');
}

function children(b, node, ctx) {
  for (let c = node[S].first; c; c = c[S].next) {
    if (childRendered(node, c)) collect(b, c, ctx);
  }
}

// The get the text steps.
export function getInnerText(el) {
  if (!beingRendered(el)) return textOf(el);
  const s = el[S];
  if (s.ns === HTML_NS && REPLACED.has(s.tag)) return '';
  const b = new Builder();
  const d = display(el);
  const visible = inheritedOr(el, 'visibility', 'visible') === 'visible';
  const ctx = {
    visible,
    ws: s.ns === HTML_NS && UA_WHITE_SPACE.has(s.tag) && computedValue(el, 'white-space') === '' ? UA_WHITE_SPACE.get(s.tag) : ancestorWhiteSpace(el),
    tt: ancestorValue(el, 'text-transform', 'none'),
    el,
    tableInternal: TABLE_INTERNAL.has(d),
    blockify: d === 'flex' || d === 'grid' || d === 'inline-flex' || d === 'inline-grid',
  };
  children(b, el, ctx);
  return b.result();
}

// An inherited property's value: the first ancestor (or the element) whose
// computed value is set; warpdom's computed style leaves some inherited
// properties empty below the element that sets them.
function ancestorValue(el, property, initial) {
  for (let n = el; n && isElement(n); n = flatParent(n)) {
    const v = computedValue(n, property);
    if (v !== '' && v !== undefined) return v;
  }
  return initial;
}

function ancestorWhiteSpace(el) {
  for (let n = el; n && isElement(n); n = flatParent(n)) {
    const v = computedValue(n, 'white-space');
    if (v !== '' && v !== undefined) return v;
    if (n[S].ns === HTML_NS && UA_WHITE_SPACE.has(n[S].tag)) return UA_WHITE_SPACE.get(n[S].tag);
  }
  return 'normal';
}

// The rendered text fragment: text, with each line break (CR LF, CR or LF)
// a br element.
function renderedTextFragment(el, input, w) {
  const doc = el[S].doc;
  const fragment = w.createFragment(doc);
  const lines = input.split(/\r\n|\r|\n/);
  for (let i = 0; i < lines.length; i++) {
    if (i > 0) insert(fragment, w.createElementNS(HTML_NS, 'br', doc), null);
    if (lines[i] !== '') insert(fragment, w.createText(lines[i], doc), null);
  }
  return fragment;
}

// The set the inner text steps.
export function setInnerText(el, value, w) {
  const fragment = renderedTextFragment(el, value, w);
  replaceAll(el, fragment[S].first === null ? null : fragment);
}

// "Merge with the next text node".
function mergeNext(node) {
  const next = node[S].next;
  if (next === null || next[S].type !== TEXT_NODE) return;
  replaceData(node, node[S].data.length, 0, next[S].data);
  remove(next[S].parent, next);
}

// The outerText setter.
export function setOuterText(el, value, w) {
  const parent = el[S].parent;
  if (parent === null) throw domError('The element has no parent.', 'NoModificationAllowedError');
  const next = el[S].next;
  const previous = el[S].prev;
  const fragment = renderedTextFragment(el, value, w);
  if (fragment[S].first === null) insert(fragment, w.createText('', el[S].doc), null);
  replace(parent, fragment, el);
  if (next !== null && next[S].prev !== null && next[S].prev[S].type === TEXT_NODE) mergeNext(next[S].prev);
  if (previous !== null && previous[S].type === TEXT_NODE) mergeNext(previous);
}
