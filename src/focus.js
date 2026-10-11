// Focus, from the HTML standard (6.6 Focus): focus()/blur(), the focused
// area of the document, document.activeElement and hasFocus(), focus
// events and tabIndex.
//
// A window has one document and no nested navigables, so a focus chain is
// [element, document] or [document]: the focused area is an element, the
// document's viewport, or nothing yet. That makes the focus update steps a
// single blur and a single focus.
import { S, state, ELEMENT_NODE, DOCUMENT_NODE, HTML_NS, SVG_NS, rootOf, connected } from './internal.js';
import { isDisabled, inputType } from './forms.js';
import { isDisplayNone } from './cascade.js';
import { dispatch, retarget } from './events.js';
import { writeAttribute } from './attributes.js';
import { parseInteger } from './reflect.js';
import { selectionFocused } from './ranges.js';

const isHTML = (el, tag) => el[S].ns === HTML_NS && el[S].tag === tag;
const docOf = (node) => (node[S].type === DOCUMENT_NODE ? node : node[S].doc);

// The tabindex value: the attribute parsed with the rules for parsing
// integers, or null when absent or not an integer.
function tabindexValue(el) {
  const v = el[S].attrs.get('tabindex');
  if (v === undefined) return null;
  const n = parseInteger(v);
  return n !== null && n >= -2147483648 && n <= 2147483647 ? n : null;
}

// "A summary for its parent details": the details element's first summary child.
function isDetailsSummary(el) {
  const details = el[S].parent;
  if (!details || details[S].type !== ELEMENT_NODE || !isHTML(details, 'details')) return false;
  for (let c = details[S].first; c; c = c[S].next) if (c[S].type === ELEMENT_NODE && isHTML(c, 'summary')) return c === el;
  return false;
}

// Elements the standard suggests are focusable areas without a tabindex.
function isSuggestedFocusable(el) {
  const s = el[S];
  if (s.ns === SVG_NS) return s.tag === 'a' && s.attrs.has('href');
  if (s.ns !== HTML_NS) return false;
  switch (s.tag) {
    case 'a': return s.attrs.has('href');
    case 'button': case 'select': case 'textarea': case 'iframe': return true;
    case 'input': return inputType(el) !== 'hidden';
    case 'summary': return isDetailsSummary(el);
    default: return s.attrs.has('contenteditable'); // editing hosts
  }
}

function isActuallyDisabled(el) {
  const s = el[S];
  if (s.ns !== HTML_NS) return false;
  switch (s.tag) {
    case 'button': case 'input': case 'select': case 'textarea': return isDisabled(el);
    case 'fieldset': case 'optgroup': case 'option': return s.attrs.has('disabled');
    default: return false;
  }
}

// "Being rendered", without layout: in a document with a browsing context,
// with no display: none on the element or an ancestor. Hidden inputs are
// not rendered. jsdom before 30.1.2 ignored display (tests rely on focusing
// a [hidden] input), so its profile does too.
function isRendered(el) {
  const doc = el[S].doc;
  if (doc[S].noView || !connected(el)) return false;
  if (isHTML(el, 'input') && inputType(el) === 'hidden') return false;
  if (doc[S].window[S].compat.focusIgnoresRendering) return true;
  // Flat-tree ancestors: through shadow roots to their hosts.
  for (let n = el; n; n = n[S].parent ?? (n[S].shadow ? n[S].host : null)) {
    if (n[S].type === ELEMENT_NODE && isDisplayNone(n)) return false;
  }
  return true;
}

export function isFocusableElement(el) {
  return isRendered(el) && !isActuallyDisabled(el) && (tabindexValue(el) !== null || isSuggestedFocusable(el));
}

// The document's viewport is a focusable area when it has a browsing context.
const isFocusableArea = (target) => (target[S].type === DOCUMENT_NODE ? !target[S].noView : isFocusableElement(target));

// The currently focused area: an element, or the viewport (the document).
const currentFocus = (doc) => doc[S].focused || doc;

function fireFocusEvent(type, target, relatedTarget, bubbles) {
  const window = target[S].doc[S].window;
  dispatch(target, new window.FocusEvent(type, { bubbles, composed: true, relatedTarget, view: window }));
}

// The focus update steps for a move from the current focused area to
// target. Old and new chains share the document, so only element entries
// remain: blur (and UI Events' focusout) on the old element, focus (and
// focusin) on the new one, each naming the other as relatedTarget.
function updateFocus(doc, target) {
  const oldElement = doc[S].focused && doc[S].focused !== doc ? doc[S].focused : null;
  const newElement = target === doc ? null : target;
  if (oldElement) {
    // Cleared first, so activeElement is the body inside blur listeners; a
    // listener that moves focus decides where it ends up.
    doc[S].focused = null;
    fireFocusEvent('blur', oldElement, newElement, false);
    fireFocusEvent('focusout', oldElement, newElement, true);
    if (doc[S].focused) return;
  }
  doc[S].focused = target;
  // Focus inside a frame: the frame element is its parent document's focused
  // area, up to the top window.
  if (newElement) {
    for (let w = doc[S].window; w && w[S].frameElement; w = w[S].parentWindow) {
      const frame = w[S].frameElement;
      frame[S].doc[S].focused = frame;
    }
  }
  // Platform convention at focus: the selection collapses to the element.
  if (newElement) selectionFocused(doc, newElement);
  if (newElement) {
    fireFocusEvent('focus', newElement, oldElement, false);
    fireFocusEvent('focusin', newElement, oldElement, true);
  }
}

// The focusing steps.
function focus(target) {
  let area = target;
  // Getting the focusable area: the document element's is the viewport.
  if (!isFocusableArea(area)) {
    const doc = docOf(area);
    area = area === doc.documentElement && !doc[S].noView ? doc : null;
  }
  if (area === null) return;
  const doc = docOf(area);
  if (currentFocus(doc) === area) return;
  updateFocus(doc, area);
}

// The unfocusing steps: only the focused element (or its document) can be
// unfocused, which focuses the viewport.
function unfocus(target) {
  const doc = docOf(target);
  const current = currentFocus(doc);
  if (target !== current && target !== doc) return;
  if (!isFocusableArea(target)) return;
  focus(doc);
}

const TABINDEX_ZERO = new Set(['a', 'area', 'button', 'frame', 'iframe', 'input', 'object', 'select', 'textarea']);

// HTMLElement and SVGElement (the HTMLOrSVGElement mixin).
export const FOCUS_MEMBERS = {
  focus() { state(this); focus(this); },
  blur() { state(this); unfocus(this); },
  get tabIndex() {
    const s = state(this);
    const value = tabindexValue(this);
    if (value !== null) return value;
    if (s.ns === HTML_NS && (TABINDEX_ZERO.has(s.tag) || (s.tag === 'summary' && isDetailsSummary(this)))) return 0;
    return s.ns === SVG_NS && s.tag === 'a' ? 0 : -1;
  },
  set tabIndex(v) { state(this); writeAttribute(this, 'tabindex', String(Number(v) | 0)); },
};

export const DOCUMENT_FOCUS_MEMBERS = {
  // The focused element, else the body (or document element) when this
  // document's viewport is focused or nothing is.
  get activeElement() {
    const s = state(this);
    const focused = s.focused;
    if (focused && focused !== this) {
      // Retargeted against the document: a focused element in a shadow tree shows as its host.
      const candidate = retarget(focused, this);
      return rootOf(candidate) === this ? candidate : null;
    }
    return this.body ?? this.documentElement;
  },
  hasFocus() { return !!state(this).focused; },
};
