// Directionality (HTML 3.2.6.4, "the dir attribute"): an element's
// directionality ('ltr' or 'rtl') from its dir attribute, bdi, the auto
// heuristic (the first character with a strong bidirectional type) and its
// parent, through shadow roots to their hosts. Used by :dir(), the
// computed `direction` and form submission's dirname.
//
// Computed when asked, never stored: insertion, removal, text and
// attribute changes do no work for it, so documents that never ask (and
// never use dir=auto) pay nothing. A query walks the ancestors, and for
// dir=auto and bdi the element's descendants up to the first strong
// character.
import { S, ELEMENT_NODE, TEXT_NODE, CDATA_SECTION_NODE, HTML_NS, rootOf } from './internal.js';
import { assignedNodes } from './slots.js';
import { inputType, controlValue } from './forms.js';
import { BIDI_RUNS } from './bidi-data.js';

// --- bidirectional character types --------------------------------------------------

let runStarts = null;
let runClasses = null;

function decodeRuns() {
  const parts = BIDI_RUNS.match(/[NLR][0-9a-z]+/g);
  runStarts = new Uint32Array(parts.length);
  runClasses = new Uint8Array(parts.length);
  let start = 0;
  for (let i = 0; i < parts.length; i++) {
    start += parseInt(parts[i].slice(1), 36);
    runStarts[i] = start;
    runClasses[i] = parts[i][0] === 'L' ? 1 : parts[i][0] === 'R' ? 2 : 0;
  }
}

// 1: L, 2: R or AL, 0: any other type.
function strongType(cp) {
  if (cp < 0x80) return ((cp | 32) >= 97 && (cp | 32) <= 122) ? 1 : 0;
  if (runStarts === null) decodeRuns();
  let lo = 0, hi = runStarts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (runStarts[mid] <= cp) lo = mid; else hi = mid - 1;
  }
  return runClasses[lo];
}

// The direction of the first code point of type L, AL or R in a string,
// null when there is none (the text node directionality).
export function firstStrongDirection(data) {
  const n = data.length;
  for (let i = 0; i < n; i++) {
    let cp = data.charCodeAt(i);
    if (cp < 0x80) {
      if ((cp | 32) >= 97 && (cp | 32) <= 122) return 'ltr';
      continue;
    }
    if (cp >= 0xd800 && cp <= 0xdbff && i + 1 < n) {
      const low = data.charCodeAt(i + 1);
      if (low >= 0xdc00 && low <= 0xdfff) { cp = ((cp - 0xd800) << 10) + (low - 0xdc00) + 0x10000; i++; }
    }
    const type = strongType(cp);
    if (type === 1) return 'ltr';
    if (type === 2) return 'rtl';
  }
  return null;
}

// --- the directionality --------------------------------------------------------------

// The dir attribute's state on an HTML element: 'ltr', 'rtl', 'auto' or
// undefined (missing or invalid: the Undefined state).
function dirState(s) {
  const v = s.attrs.get('dir');
  if (v === undefined || (v.length !== 3 && v.length !== 4)) return undefined;
  const lower = v.toLowerCase();
  return lower === 'ltr' || lower === 'rtl' || lower === 'auto' ? lower : undefined;
}

const AUTO_DIRECTION_INPUTS = new Set(['hidden', 'text', 'search', 'tel', 'url', 'email', 'password', 'submit', 'reset', 'button']);

const isAutoDirectionFormControl = (el) => {
  const tag = el[S].tag;
  return tag === 'textarea' || (tag === 'input' && AUTO_DIRECTION_INPUTS.has(inputType(el)));
};

const isShadowSlot = (n) => n[S].tag === 'slot' && n[S].ns === HTML_NS && rootOf(n)[S].shadow === true;

export function directionality(element) {
  let el = element;
  for (;;) {
    const s = el[S];
    if (s.ns === HTML_NS) {
      const dir = dirState(s);
      if (dir === 'ltr' || dir === 'rtl') return dir;
      if (dir === 'auto' || s.tag === 'bdi') return autoDirectionality(el) ?? 'ltr';
      if (s.tag === 'input' && inputType(el) === 'tel') return 'ltr';
    }
    // The parent directionality: a shadow root's host, a parent element, or 'ltr'.
    const p = s.parent;
    if (p === null || p === undefined) return 'ltr';
    if (p[S].type === ELEMENT_NODE) el = p;
    else if (p[S].shadow === true) el = p[S].host;
    else return 'ltr';
  }
}

function autoDirectionality(el) {
  if (isAutoDirectionFormControl(el)) {
    const value = controlValue(el);
    return firstStrongDirection(value) === 'rtl' ? 'rtl' : value === '' ? null : 'ltr';
  }
  if (isShadowSlot(el)) {
    const nodes = assignedNodes(el);
    if (nodes.length > 0) {
      for (const child of nodes) {
        const t = child[S].type;
        const dir = t === TEXT_NODE || t === CDATA_SECTION_NODE ? firstStrongDirection(child[S].data) : containedText(child, true);
        if (dir !== null) return dir;
      }
      return null;
    }
  }
  return containedText(el, false);
}

// Subtrees the contained text heuristic skips: bdi, script, style and
// textarea elements, and elements with a dir attribute in a defined state.
function skipped(n) {
  const s = n[S];
  if (s.ns !== HTML_NS) return false;
  const tag = s.tag;
  return tag === 'bdi' || tag === 'script' || tag === 'style' || tag === 'textarea' || dirState(s) !== undefined;
}

// The contained text auto directionality: the first Text descendant with a
// strong character, in tree order, outside skipped subtrees; a slot in a
// shadow tree gives its host's directionality.
function containedText(element, canExcludeRoot) {
  if (canExcludeRoot && skipped(element)) return null;
  let n = element[S].first;
  while (n !== null && n !== undefined) {
    const s = n[S];
    if (s.type === ELEMENT_NODE) {
      if (!skipped(n)) {
        if (isShadowSlot(n)) return directionality(rootOf(n)[S].host);
        if (s.first) { n = s.first; continue; }
      }
    } else if (s.type === TEXT_NODE || s.type === CDATA_SECTION_NODE) {
      const dir = firstStrongDirection(s.data);
      if (dir !== null) return dir;
    }
    while (!n[S].next) {
      n = n[S].parent;
      if (n === element) return null;
    }
    n = n[S].next;
  }
  return null;
}
