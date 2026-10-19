// Form controls: values, checkedness and selectedness with their dirty
// flags, form owners, labels, constraint validation, form submission and
// reset, and click() with activation behavior. Follows the HTML standard as
// jsdom implements it, since tests are written against jsdom's results.
//
// Defaults are read lazily from the attributes; script and user changes set
// explicit state on the element (value, checked, selectedness). Results
// that need a tree scan (form.elements, labels, select options) are cached
// until the document changes (treeRev).
import { urlOf } from './hyperlinks.js';
import { followHyperlink } from './navigation.js';
import {
  S, state, domError, hooks, HTML_NS, ELEMENT_NODE, TEXT_NODE, DOCUMENT_NODE,
  rootOf, nextInTree, contains, elementById, connected, asciiLowercase, PlatformURL as URL, tooFewArguments,
} from './internal.js';
import { writeAttribute, attributeSteps, tokenList } from './attributes.js';
import { liveList, htmlCollectionNames } from './collections.js';
import { dispatch, eventConstruct, fieldGetters, eventState } from './events.js';
import { parseInteger } from './reflect.js';
import { directionality } from './directionality.js';

// --- helpers -------------------------------------------------------------------

const isTag = (node, tag) => { const s = node[S]; return s.type === ELEMENT_NODE && s.ns === HTML_NS && s.tag === tag; };
const attr = (el, name) => el[S].attrs.get(name);
const has = (el, name) => el[S].attrs.has(name);
const windowOf = (el) => el[S].doc[S].window;
const internalsOf = (el) => windowOf(el)[S];
const NO_FILES = Object.freeze([]);
const isConnected = connected;
const str = (v) => (v === null ? '' : String(v)); // [LegacyNullToEmptyString]

function docOf(node) {
  const s = node[S];
  return s.type === DOCUMENT_NODE ? node : s.doc;
}

// A value computed from the tree, cached on holder until the document's
// tree or attributes change.
function cached(holder, key, compute) {
  const doc = docOf(holder);
  const rev = doc[S].treeRev ?? 0;
  const hs = holder[S];
  const c = hs[key];
  if (c !== undefined && c.rev === rev && c.doc === doc) return c.value;
  const value = compute();
  hs[key] = { rev, doc, value };
  return value;
}

function* descendants(root) {
  for (let n = root[S].first; n; n = nextInTree(n, root)) if (n[S].type === ELEMENT_NODE) yield n;
}

function firstWithId(root, id) {
  if (root[S].type === DOCUMENT_NODE) return elementById(root, id);
  for (const el of descendants(root)) if (attr(el, 'id') === id) return el;
  return null;
}

// The nearest ancestor of el with this HTML tag, below stop (if given).
function closestTag(el, tag, stop = null) {
  for (let n = el[S].parent; n && n !== stop; n = n[S].parent) if (isTag(n, tag)) return n;
  return null;
}

function fire(target, type, init) {
  const event = new (windowOf(target).Event)(type, init);
  return dispatch(target, event);
}

const notImplemented = (el, message) => internalsOf(el).notImplemented(message);

const asciiWhitespace = /[\t\n\f\r ]+/g;
const stripAndCollapse = (s) => s.replace(asciiWhitespace, ' ').trim();
const trimASCII = (s) => s.replace(/^[\t\n\f\r ]+|[\t\n\f\r ]+$/g, '');
const stripNewlines = (s) => (/[\r\n]/.test(s) ? s.replace(/[\r\n]/g, '') : s);

// --- disabled, listed, labelable --------------------------------------------------

const DISABLEABLE = new Set(['button', 'input', 'select', 'textarea']);

// jsdom's "actually disabled": a disabled form control, or any element in a
// disabled fieldset outside its first legend.
export function isDisabled(el) {
  const s = el[S];
  if (s.ns === HTML_NS && DISABLEABLE.has(s.tag) && s.attrs.has('disabled')) return true;
  for (let p = s.parent; p; p = p[S].parent) {
    if (isTag(p, 'fieldset') && has(p, 'disabled')) {
      let legend = null;
      for (let c = p[S].first; c; c = c[S].next) if (isTag(c, 'legend')) { legend = c; break; }
      if (!legend || !contains(legend, el)) return true;
    }
  }
  return false;
}

const LISTED = new Set(['button', 'fieldset', 'input', 'object', 'output', 'select', 'textarea']);
const isListed = (el) => el[S].ns === HTML_NS && LISTED.has(el[S].tag);

const LABELABLE = new Set(['button', 'meter', 'output', 'progress', 'select', 'textarea']);
export function isLabelable(el) {
  const s = el[S];
  if (s.type !== ELEMENT_NODE || s.ns !== HTML_NS) return false;
  if (LABELABLE.has(s.tag)) return true;
  return s.tag === 'input' && inputType(el) !== 'hidden';
}

function isInteractiveContent(node) {
  const s = node[S];
  if (s.type !== ELEMENT_NODE || s.ns !== HTML_NS) return false;
  if (s.attrs.has('tabindex')) return true;
  switch (s.tag) {
    case 'a': return s.attrs.has('href');
    case 'audio': case 'video': return s.attrs.has('controls');
    case 'img': case 'object': return s.attrs.has('usemap');
    case 'input': return inputType(node) !== 'hidden';
    case 'button': case 'details': case 'embed': case 'iframe': case 'label': case 'select': case 'textarea': return true;
    default: return false;
  }
}

// --- form owner -------------------------------------------------------------------

export function formOwner(el) {
  const id = attr(el, 'form');
  if (id === '') return null;
  if (id === undefined) return closestTag(el, 'form');
  const found = firstWithId(rootOf(el), id);
  return found && isTag(found, 'form') ? found : null;
}

function formElements(form) {
  return cached(form, 'formElements', () => {
    const out = [];
    for (const el of descendants(rootOf(form))) {
      if (isListed(el) && !(el[S].tag === 'input' && inputType(el) === 'image') && formOwner(el) === form) out.push(el);
    }
    return out;
  });
}

const isSubmitButton = (el) => (isTag(el, 'input') && (inputType(el) === 'submit' || inputType(el) === 'image'))
  || (isTag(el, 'button') && buttonType(el) === 'submit');

// --- input type, value and checkedness ------------------------------------------

const INPUT_TYPES = new Set(['hidden', 'text', 'search', 'tel', 'url', 'email', 'password', 'date', 'month', 'week',
  'time', 'datetime-local', 'number', 'range', 'color', 'checkbox', 'radio', 'file', 'submit', 'image', 'reset', 'button']);

export function inputType(el) {
  const t = attr(el, 'type');
  if (t === undefined) return 'text';
  if (INPUT_TYPES.has(t)) return t; // already lowercase (the usual case)
  const lower = asciiLowercase(t);
  return INPUT_TYPES.has(lower) ? lower : 'text';
}

function valueMode(type) {
  switch (type) {
    case 'hidden': case 'submit': case 'image': case 'reset': case 'button': return 'default';
    case 'checkbox': case 'radio': return 'default/on';
    case 'file': return 'filename';
    default: return 'value';
  }
}

const SELECTION_TYPES = new Set(['text', 'search', 'url', 'tel', 'password']);
const READONLY_TYPES = new Set(['text', 'search', 'url', 'tel', 'email', 'password', 'date', 'month', 'week', 'time', 'datetime-local', 'number']);
const REQUIRED_TYPES = new Set([...READONLY_TYPES, 'checkbox', 'radio', 'file']);
const PATTERN_TYPES = new Set(['text', 'search', 'url', 'tel', 'email', 'password']);

// Dates and times (HTML "microsyntaxes"), as numbers for range and step checks.
const daysInMonth = (y, m) => (m === 2 ? ((y % 4 === 0 && y % 100 !== 0) || y % 400 === 0 ? 29 : 28) : [31, 0, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1]);

function parseDate(v) {
  const m = /^(\d{4,})-(\d\d)-(\d\d)$/.exec(v);
  if (!m) return null;
  const y = +m[1], mo = +m[2], d = +m[3];
  return y > 0 && mo >= 1 && mo <= 12 && d >= 1 && d <= daysInMonth(y, mo) ? { y, mo, d } : null;
}
function parseMonth(v) {
  const m = /^(\d{4,})-(\d\d)$/.exec(v);
  return m && +m[1] > 0 && +m[2] >= 1 && +m[2] <= 12 ? { y: +m[1], mo: +m[2] } : null;
}
function weeksInYear(y) {
  const jan1 = new Date(Date.UTC(y, 0, 1)).getUTCDay();
  const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  return jan1 === 4 || (leap && jan1 === 3) ? 53 : 52;
}
function parseWeek(v) {
  const m = /^(\d{4,})-W(\d\d)$/.exec(v);
  return m && +m[1] > 0 && +m[2] >= 1 && +m[2] <= weeksInYear(+m[1]) ? { y: +m[1], w: +m[2] } : null;
}
function parseTime(v) {
  const m = /^(\d\d):(\d\d)(?::(\d\d)(?:\.(\d{1,3}))?)?$/.exec(v);
  if (!m || +m[1] > 23 || +m[2] > 59 || (m[3] !== undefined && +m[3] > 59)) return null;
  return ((+m[1] * 60 + +m[2]) * 60 + (+m[3] || 0)) * 1000 + (m[4] ? +m[4].padEnd(3, '0') : 0);
}
function parseDateTime(v) {
  const m = /^(.+?)[T ](.+)$/.exec(v);
  if (!m) return null;
  const date = parseDate(m[1]);
  const time = parseTime(m[2]);
  return date && time !== null ? { date, time } : null;
}
const pad = (n, w = 2) => String(n).padStart(w, '0');
function serializeTime(ms) {
  const h = Math.floor(ms / 3600000), mi = Math.floor(ms / 60000) % 60, sec = Math.floor(ms / 1000) % 60, frac = ms % 1000;
  let out = `${pad(h)}:${pad(mi)}`;
  if (sec || frac) out += `:${pad(sec)}`;
  if (frac) out += `.${pad(frac, 3).replace(/0+$/, '')}`;
  return out;
}

const FLOAT = /^-?(?:\d+(?:\.\d+)?|\.\d+)(?:[eE][+-]?\d+)?$/;
const parseFloatValue = (v) => (FLOAT.test(v) && Number.isFinite(Number(v)) ? Number(v) : null);

// Converts a value of the given type to a number (ms for dates and times,
// months for month), or null.
function toNumber(type, v) {
  switch (type) {
    case 'number': case 'range': return parseFloatValue(v);
    case 'date': { const d = parseDate(v); return d ? Date.UTC(d.y, d.mo - 1, d.d) : null; }
    case 'month': { const d = parseMonth(v); return d ? (d.y - 1970) * 12 + d.mo - 1 : null; }
    case 'time': return parseTime(v);
    case 'datetime-local': { const d = parseDateTime(v); return d ? Date.UTC(d.date.y, d.date.mo - 1, d.date.d) + d.time : null; }
    default: return null;
  }
}

function rangeBounds(el) {
  const min = parseFloatValue(attr(el, 'min') ?? '') ?? 0;
  const max = parseFloatValue(attr(el, 'max') ?? '') ?? 100;
  return { min, max };
}

function sanitize(el, type, v) {
  switch (type) {
    case 'text': case 'search': case 'tel': case 'password': return stripNewlines(v);
    case 'url': return trimASCII(stripNewlines(v));
    case 'email': return has(el, 'multiple') ? v.split(',').map(trimASCII).join(',') : trimASCII(stripNewlines(v));
    case 'number': return parseFloatValue(v) === null ? '' : v;
    case 'range': {
      const { min, max } = rangeBounds(el);
      const n = parseFloatValue(v);
      if (n === null) return `${max < min ? min : (min + max) / 2}`;
      if (n < min) return `${min}`;
      if (n > max) return `${max}`;
      return v;
    }
    case 'color': return /^#[0-9a-fA-F]{6}$/.test(v) ? v.toLowerCase() : '#000000';
    case 'date': return parseDate(v) ? v : '';
    case 'month': return parseMonth(v) ? v : '';
    case 'week': return parseWeek(v) ? v : '';
    case 'time': return parseTime(v) === null ? '' : v;
    case 'datetime-local': { const d = parseDateTime(v); return d ? `${v.slice(0, v.search(/[T ]/))}T${serializeTime(d.time)}` : ''; }
    default: return v;
  }
}

function inputValue(el) {
  const s = el[S];
  const type = inputType(el);
  switch (valueMode(type)) {
    case 'value': return sanitize(el, type, s.dirtyValue ? s.value : attr(el, 'value') ?? '');
    case 'default': return attr(el, 'value') ?? '';
    case 'default/on': return attr(el, 'value') ?? 'on';
    default: return '';
  }
}

function setInputValue(el, value) {
  const s = el[S];
  const type = inputType(el);
  switch (valueMode(type)) {
    case 'value': {
      const old = inputValue(el);
      s.value = sanitize(el, type, value);
      s.dirtyValue = true;
      if (s.value !== old) { s.selStart = s.selEnd = s.value.length; s.selDir = 'none'; }
      break;
    }
    case 'default': case 'default/on': writeAttribute(el, 'value', value); break;
    default:
      if (value !== '') throw domError('This input element accepts a filename, which may only be programmatically set to the empty string.', 'InvalidStateError');
  }
}

const checkedness = (el) => el[S].checked ?? has(el, 'checked');

function radioGroup(el) {
  const name = attr(el, 'name');
  if (!name) return [];
  const form = formOwner(el);
  const out = [];
  for (const other of descendants(rootOf(el))) {
    if (other !== el && isTag(other, 'input') && inputType(other) === 'radio' && attr(other, 'name') === name && formOwner(other) === form) out.push(other);
  }
  return out;
}

function setCheckedness(el, value) {
  el[S].checked = value;
  if (value && inputType(el) === 'radio') for (const other of radioGroup(el)) other[S].checked = false;
}

attributeSteps.set('checked', (el) => {
  const s = el[S];
  if (!isTag(el, 'input') || s.dirtyChecked) return;
  s.checked = undefined;
  if (has(el, 'checked') && inputType(el) === 'radio') setCheckedness(el, true);
});

// --- text selection (input and textarea) ------------------------------------------

const selectionApplies = (el) => isTag(el, 'textarea') || SELECTION_TYPES.has(inputType(el));
// Input types select() applies to without a selection: it only fires select.
const SELECT_ONLY_TYPES = new Set(['email', 'number', 'date', 'month', 'week', 'time', 'datetime-local', 'color', 'file']);
const SELECTION_MODES = new Set(['select', 'start', 'end', 'preserve']);
const selectionInterface = (el) => (isTag(el, 'textarea') ? 'HTMLTextAreaElement' : 'HTMLInputElement');

// The select event (HTML 4.10.21.2): select(), setSelectionRange(), the
// selection setters and setRangeText() fire it at the element, bubbling and
// not cancelable, in a queued task. As jsdom (black box, 20.0.3 to
// 30.1.2), every call fires one, also when the selection did not change
// and when one is already queued (the standard skips both), and for
// elements not in a document. Before jsdom 21.1.2 it is dispatched
// synchronously and is cancelable (compat.syncSelectEvent).
function fireSelect(el) {
  const ws = windowOf(el)[S];
  if (ws.compat.syncSelectEvent) fire(el, 'select', { bubbles: true, cancelable: true });
  else ws.setTimeout(() => fire(el, 'select', { bubbles: true }), 0);
}
export const controlValue = (el) => (isTag(el, 'textarea') ? textareaValue(el) : inputValue(el));

function setControlValueRaw(el, value) {
  const s = el[S];
  if (isTag(el, 'textarea')) s.value = value; else s.value = sanitize(el, inputType(el), value);
  s.dirtyValue = true;
}

function setSelectionRange(el, start, end, direction = 'none') {
  if (!selectionApplies(el)) throw domError("The input element's type does not support selection.", 'InvalidStateError');
  const s = el[S];
  const length = controlValue(el).length;
  let e = Math.min(end >>> 0, length);
  let st = Math.min(start >>> 0, length);
  if (st > e) st = e;
  s.selStart = st;
  s.selEnd = e;
  s.selDir = direction === 'forward' || direction === 'backward' ? direction : 'none';
  fireSelect(el);
}

const selectionMembers = {
  get selectionStart() { return selectionApplies(this) ? state(this).selStart ?? 0 : null; },
  set selectionStart(v) {
    const s = state(this);
    if (!selectionApplies(this)) throw domError("The input element's type does not support selection.", 'InvalidStateError');
    setSelectionRange(this, v, Math.max(v >>> 0, s.selEnd ?? 0), s.selDir);
  },
  get selectionEnd() { return selectionApplies(this) ? state(this).selEnd ?? 0 : null; },
  set selectionEnd(v) {
    const s = state(this);
    if (!selectionApplies(this)) throw domError("The input element's type does not support selection.", 'InvalidStateError');
    setSelectionRange(this, s.selStart ?? 0, v, s.selDir);
  },
  get selectionDirection() { return selectionApplies(this) ? state(this).selDir ?? 'none' : null; },
  set selectionDirection(v) {
    const s = state(this);
    if (!selectionApplies(this)) throw domError("The input element's type does not support selection.", 'InvalidStateError');
    setSelectionRange(this, s.selStart ?? 0, s.selEnd ?? 0, v);
  },
  setSelectionRange(start, end, direction = undefined) {
    state(this);
    if (end === undefined && arguments.length < 2) tooFewArguments(selectionInterface(this), 'setSelectionRange', 2, arguments.length);
    setSelectionRange(this, start, end, direction);
  },
  select() {
    state(this);
    if (selectionApplies(this)) setSelectionRange(this, 0, controlValue(this).length);
    else if (isTag(this, 'input') && SELECT_ONLY_TYPES.has(inputType(this))) fireSelect(this);
  },
  setRangeText(replacement, start = undefined, end = undefined, selectMode = undefined) {
    const s = state(this);
    // WebIDL overload resolution: (replacement) or (replacement, start,
    // end, selectMode); two arguments match neither.
    const n = arguments.length;
    const iface = selectionInterface(this);
    if (n < 1) tooFewArguments(iface, 'setRangeText', 1, 0);
    if (n === 2) throw new TypeError(`Failed to execute 'setRangeText' on '${iface}': only 2 arguments present.`);
    const text = String(replacement);
    const mode = selectMode === undefined ? 'preserve' : String(selectMode);
    if (!SELECTION_MODES.has(mode)) throw new TypeError(`Failed to execute 'setRangeText' on '${iface}': parameter 4 '${mode}' is not a valid enumeration value for SelectionMode`);
    if (!selectionApplies(this)) throw domError("The input element's type does not support selection.", 'InvalidStateError');
    const value = controlValue(this);
    let st = s.selStart ?? 0, en = s.selEnd ?? 0;
    if (n > 2) {
      st = start >>> 0;
      en = end >>> 0;
      if (st > en) throw domError('The index is not in the allowed range.', 'IndexSizeError');
    }
    st = Math.min(st, value.length);
    en = Math.min(en, value.length);
    let selStart = s.selStart ?? 0, selEnd = s.selEnd ?? 0;
    setControlValueRaw(this, value.slice(0, st) + text + value.slice(en));
    // jsdom before 21.1.2: the end of the replaced text is the new value's length.
    const newEnd = windowOf(this)[S].compat.legacyRangeTextEnd ? controlValue(this).length : st + text.length;
    if (mode === 'select') { selStart = st; selEnd = newEnd; } else if (mode === 'start') { selStart = selEnd = st; } else if (mode === 'end') { selStart = selEnd = newEnd; } else {
      const delta = text.length - (en - st);
      if (selStart > en) selStart += delta; else if (selStart > st) selStart = st;
      if (selEnd > en) selEnd += delta; else if (selEnd > st) selEnd = newEnd;
    }
    s.selStart = selStart;
    s.selEnd = selEnd;
    s.selDir = 'none';
    fireSelect(this);
  },
};

// --- textarea ---------------------------------------------------------------------

function childText(el) {
  let out = '';
  for (let c = el[S].first; c; c = c[S].next) if (c[S].type === TEXT_NODE) out += c[S].data;
  return out;
}
const normalizeNewlines = (v) => (v.includes('\r') ? v.replace(/\r\n?/g, '\n') : v);
const textareaValue = (el) => (el[S].dirtyValue ? el[S].value : normalizeNewlines(childText(el)));

// --- select and option ------------------------------------------------------------
// From the HTML standard (4.10.7 select, 4.10.10 option). An option's
// selectedness is explicit state once set (s.selectedness), else its
// selected attribute. The selectedness setting algorithm runs lazily: when
// the select is read after its document changed (treeRev), or when an
// option asks for a reset. Its results are written back, so reruns change
// nothing until the tree or an option changes again.

const SKIP_SUBTREE = new Set(['select', 'hr', 'option', 'datalist']);

// The list of options: option descendants, not inside another select, hr,
// option, datalist or a nested optgroup. Cached until the document changes.
function listOfOptions(select) {
  return cached(select, 'optionsCache', () => {
    const out = [];
    let node = select[S].first;
    while (node) {
      const ns = node[S];
      let skip = false;
      if (ns.type === ELEMENT_NODE && ns.ns === HTML_NS) {
        if (ns.tag === 'option') out.push(node);
        skip = SKIP_SUBTREE.has(ns.tag) || (ns.tag === 'optgroup' && closestTag(node, 'optgroup', select) !== null);
      }
      node = skip ? nextOutside(node, select) : nextInTree(node, select);
    }
    return out;
  });
}

// The next node in tree order within root, after node's subtree.
function nextOutside(node, root) {
  for (let n = node; n && n !== root; n = n[S].parent) if (n[S].next) return n[S].next;
  return null;
}

// The nearest ancestor select: through at most one optgroup, and not out of
// a datalist, hr or option.
function nearestAncestorSelect(option) {
  let optgroup = false;
  for (let n = option[S].parent; n && n[S].type === ELEMENT_NODE; n = n[S].parent) {
    if (n[S].ns !== HTML_NS) continue;
    switch (n[S].tag) {
      case 'datalist': case 'hr': case 'option': return null;
      case 'optgroup': if (optgroup) return null; optgroup = true; break;
      case 'select': return n;
      default: break;
    }
  }
  return null;
}

const selectedness = (option) => option[S].selectedness ?? has(option, 'selected');

// The display size: the size attribute (non-negative integer), else 4 for
// multiple selects and 1 otherwise.
function displaySize(select) {
  const size = attr(select, 'size');
  const n = size === undefined ? null : parseInteger(size);
  if (n !== null && n >= 0) return n;
  return has(select, 'multiple') ? 4 : 1;
}

// An option is disabled by its own attribute or its nearest optgroup's.
function isOptionDisabled(option) {
  if (has(option, 'disabled')) return true;
  for (let n = option[S].parent; n && n[S].type === ELEMENT_NODE; n = n[S].parent) {
    if (n[S].ns !== HTML_NS) continue;
    if (SKIP_SUBTREE.has(n[S].tag)) return false;
    if (n[S].tag === 'optgroup') return has(n, 'disabled');
  }
  return false;
}

// The selectedness setting algorithm (single selects only): keep the last
// selected option; with none and a display size of 1, select the first
// enabled one. It runs when the select's list of options gained or lost
// options since it last ran (checked lazily: the list is rebuilt after
// tree changes and compared with the settled one), or after an option or
// the select asked for a reset. Other tree changes in the document leave a
// select with no selected option alone, as in jsdom.
function settleSelectedness(select) {
  const ss = select[S];
  const options = listOfOptions(select);
  const settled = ss.settledOptions;
  if (settled === options) return;
  ss.settledOptions = options;
  if (settled !== undefined && settled !== null && sameOptions(settled, options)) return;
  if (has(select, 'multiple')) return;
  let lastSelected = null;
  let firstEnabled = null;
  for (const option of options) {
    if (selectedness(option)) {
      if (lastSelected) lastSelected[S].selectedness = false;
      lastSelected = option;
    }
    if (!firstEnabled && !isOptionDisabled(option)) firstEnabled = option;
  }
  if (!lastSelected && firstEnabled && displaySize(select) === 1) firstEnabled[S].selectedness = true;
}

function sameOptions(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

const askForReset = (select) => { select[S].settledOptions = null; };

// Changing a select's multiple or size attribute reruns the algorithm (the
// display size can change; jsdom also reruns it when the value is the same).
const selectAttributeChanged = (el) => { if (isTag(el, 'select')) askForReset(el); };
attributeSteps.set('multiple', selectAttributeChanged);
attributeSteps.set('size', selectAttributeChanged);

// In a single select, an option becoming selected deselects the others.
function deselectOthers(option, select) {
  if (has(select, 'multiple')) return;
  for (const other of listOfOptions(select)) if (other !== option) other[S].selectedness = false;
}

// The selected attribute sets selectedness while the option is not dirty.
// The details element's open attribute (HTML 4.11.1): adding or removing it
// queues one toggle event task; changes made before the task runs fold
// into it (the details toggle task tracker).
attributeSteps.set('open', (el, old, value) => {
  const s = el[S];
  if (s.ns !== HTML_NS || s.tag !== 'details' || (old === undefined) === (value === undefined)) return;
  const newState = value === undefined ? 'closed' : 'open';
  if (s.toggleTask) { s.toggleTask.newState = newState; return; }
  const task = s.toggleTask = { oldState: old === undefined ? 'closed' : 'open', newState };
  const window = s.doc[S].window;
  window[S].setTimeout(() => {
    s.toggleTask = null;
    dispatch(el, new window.ToggleEvent('toggle', { oldState: task.oldState, newState: task.newState }));
  }, 0);
});

attributeSteps.set('selected', (el) => {
  const s = el[S];
  if (!isTag(el, 'option') || s.dirtySelected) return;
  const select = nearestAncestorSelect(el);
  if (select) settleSelectedness(select);
  s.selectedness = has(el, 'selected');
  if (select) {
    if (s.selectedness) deselectOthers(el, select);
    askForReset(select);
  }
});

// The selected index: the first option in the list with selectedness.
function selectedIndex(select) {
  settleSelectedness(select);
  const options = listOfOptions(select);
  for (let i = 0; i < options.length; i++) if (selectedness(options[i])) return i;
  return -1;
}

function textExcludingScript(node) {
  let out = '';
  for (let c = node[S].first; c; c = c[S].next) {
    const cs = c[S];
    if (cs.type === TEXT_NODE) out += cs.data;
    else if (cs.type === ELEMENT_NODE && cs.tag !== 'script') out += textExcludingScript(c);
  }
  return out;
}

const optionText = (option) => stripAndCollapse(textExcludingScript(option));

const optionValue = (option) => attr(option, 'value') ?? optionText(option);

// The placeholder label option of a required single select with display
// size 1: a first option with an empty value and no optgroup above it.
function hasPlaceholderOption(select) {
  if (!has(select, 'required') || has(select, 'multiple') || displaySize(select) !== 1) return false;
  const first = listOfOptions(select)[0];
  return !!first && optionValue(first) === '' && closestTag(first, 'optgroup', select) === null;
}

// :checked: checked checkboxes and radio buttons, and selected options.
export function matchesChecked(el) {
  const s = el[S];
  if (s.ns !== HTML_NS) return false;
  if (s.tag === 'input') {
    const type = inputType(el);
    return (type === 'checkbox' || type === 'radio') && checkedness(el);
  }
  if (s.tag === 'option') {
    const select = nearestAncestorSelect(el);
    if (select) settleSelectedness(select);
    return selectedness(el);
  }
  return false;
}

// --- labels -------------------------------------------------------------------------

export function labelControl(label) {
  const id = attr(label, 'for');
  if (id !== undefined) {
    const el = firstWithId(rootOf(label), id);
    return el && isLabelable(el) ? el : null;
  }
  for (const el of descendants(label)) if (isLabelable(el)) return el;
  return null;
}

const NO_LABELS = Object.freeze([]);

function labelsFor(el) {
  const root = rootOf(el);
  const map = cached(root, 'labelMap', () => {
    const byControl = new Map();
    for (const node of descendants(root)) {
      if (!isTag(node, 'label')) continue;
      const control = labelControl(node);
      if (!control) continue;
      const list = byControl.get(control);
      if (list) list.push(node); else byControl.set(control, [node]);
    }
    return byControl;
  });
  return map.get(el) ?? NO_LABELS;
}

export const labelsMember = {
  get labels() {
    const s = state(this);
    if (!isLabelable(this)) return null;
    return s.labelsList ?? (s.labelsList = liveList(internalsOf(this).protos.NodeList, () => labelsFor(this)));
  },
};

// --- constraint validation ---------------------------------------------------------

function buttonType(el) {
  const t = asciiLowercase(attr(el, 'type') ?? '');
  return t === 'reset' || t === 'button' ? t : 'submit';
}

function barred(el) {
  const s = el[S];
  switch (s.tag) {
    case 'input': {
      const type = inputType(el);
      return type === 'hidden' || type === 'reset' || type === 'button' || (READONLY_TYPES.has(type) && has(el, 'readonly'));
    }
    case 'button': return buttonType(el) !== 'submit';
    case 'select': case 'textarea': return has(el, 'readonly');
    default: return true; // fieldset, output, object
  }
}

const willValidate = (el) => !isDisabled(el) && !closestTag(el, 'datalist') && !barred(el);

const VALIDITY_FLAGS = ['valueMissing', 'typeMismatch', 'patternMismatch', 'tooLong', 'tooShort', 'rangeUnderflow',
  'rangeOverflow', 'stepMismatch', 'badInput', 'customError'];

const EMAIL = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

function compilePattern(pattern) {
  try { return new RegExp(`^(?:${pattern})$`, 'v'); } catch {
    try { return new RegExp(`^(?:${pattern})$`, 'u'); } catch { return null; }
  }
}

const DEFAULT_STEP = { number: [1, 1], range: [1, 1], date: [1, 86400000], month: [1, 1], time: [60, 1000], 'datetime-local': [60, 1000] };

function stepMismatch(el, type, value) {
  const defaults = DEFAULT_STEP[type];
  if (!defaults) return false;
  const stepAttr = attr(el, 'step');
  if (stepAttr !== undefined && stepAttr.toLowerCase() === 'any') return false;
  let step = stepAttr === undefined ? null : parseFloatValue(stepAttr);
  if (step === null || step <= 0) step = defaults[0];
  const allowed = step * defaults[1];
  const n = toNumber(type, value);
  if (n === null) return false;
  const base = toNumber(type, attr(el, 'min') ?? '') ?? toNumber(type, attr(el, 'value') ?? '') ?? 0;
  const q = (n - base) / allowed;
  return Math.abs(q - Math.round(q)) > 1e-9;
}

function inputValidity(el) {
  const type = inputType(el);
  const value = inputValue(el);
  const flags = {};
  const required = has(el, 'required') && REQUIRED_TYPES.has(type);
  if (required && valueMode(type) === 'value' && !isDisabled(el) && !has(el, 'readonly') && value === '') flags.valueMissing = true;
  if (type === 'checkbox' && required && !checkedness(el)) flags.valueMissing = true;
  if (type === 'radio') {
    const group = [el, ...radioGroup(el)];
    if (group.some((r) => has(r, 'required')) && !group.some(checkedness)) flags.valueMissing = true;
  }
  if (type === 'file' && required) flags.valueMissing = true;
  if (value !== '') {
    if (type === 'email') flags.typeMismatch = !(has(el, 'multiple') ? value.split(',').every((v) => EMAIL.test(v)) : EMAIL.test(value));
    if (type === 'url') { try { new URL(value); } catch { flags.typeMismatch = true; } }
    const pattern = attr(el, 'pattern');
    if (pattern !== undefined && PATTERN_TYPES.has(type)) {
      const re = compilePattern(pattern);
      if (re) {
        const values = type === 'email' && has(el, 'multiple') ? value.split(',') : [value];
        flags.patternMismatch = !values.every((v) => re.test(v));
      }
    }
    const n = toNumber(type, value);
    if (n !== null && type !== 'range') {
      const min = toNumber(type, attr(el, 'min') ?? '');
      const max = toNumber(type, attr(el, 'max') ?? '');
      if (min !== null && n < min) flags.rangeUnderflow = true;
      if (max !== null && n > max) flags.rangeOverflow = true;
    }
    flags.stepMismatch = stepMismatch(el, type, value);
  }
  return flags;
}

function validityFlags(el) {
  const s = el[S];
  let flags;
  switch (s.tag) {
    case 'input': flags = inputValidity(el); break;
    case 'textarea': flags = { valueMissing: has(el, 'required') && !isDisabled(el) && !has(el, 'readonly') && textareaValue(el) === '' }; break;
    case 'select': {
      const index = selectedIndex(el);
      flags = { valueMissing: has(el, 'required') && (index < 0 || (index === 0 && hasPlaceholderOption(el))) };
      break;
    }
    default: flags = {};
  }
  flags.customError = (s.customError ?? '') !== '';
  return flags;
}

const isValid = (el) => { const f = validityFlags(el); return VALIDITY_FLAGS.every((k) => !f[k]); };

const isCandidate = (el) => el[S].type === 1 && el[S].ns === HTML_NS && SUBMITTABLE.has(el[S].tag) && willValidate(el);
const candidateInvalid = (el) => isCandidate(el) && !isValid(el);

// :valid and :invalid (HTML selectors): candidates for constraint validation
// by their validity; a form by the candidates it owns, a fieldset by those it
// contains. Other elements match neither.
export function matchesValidity(el, invalid) {
  const s = el[S];
  if (s.ns !== HTML_NS) return false;
  let found;
  if (s.tag === 'form') found = formElements(el).some(candidateInvalid);
  else if (s.tag === 'fieldset') {
    found = false;
    for (let n = s.first; n; n = nextInTree(n, el)) if (candidateInvalid(n)) { found = true; break; }
  } else if (isCandidate(el)) found = !isValid(el);
  else return false;
  return found === invalid;
}

function checkValidity(el) {
  if (!willValidate(el) || isValid(el)) return true;
  fire(el, 'invalid', { cancelable: true });
  return false;
}

const constraintValidation = {
  get willValidate() { state(this); return willValidate(this); },
  get validity() {
    const s = state(this);
    if (!s.validity) {
      s.validity = Object.create(internalsOf(this).protos.ValidityState);
      s.validity[S] = { element: this };
    }
    return s.validity;
  },
  get validationMessage() {
    state(this);
    if (!willValidate(this) || isValid(this)) return '';
    return validityFlags(this).customError ? this[S].customError : 'Constraints not satisfied';
  },
  checkValidity() { state(this); return checkValidity(this); },
  reportValidity() { state(this); return checkValidity(this); },
  setCustomValidity(message) { state(this).customError = String(message); },
};

// --- submission and reset ------------------------------------------------------------

// Submitting a form from a submitter (form submission algorithm, up to
// navigation): validate unless the form or the submitter opts out, fire
// submit, then navigate, which is not implemented.
function submitForm(form, submitter) {
  const noValidate = has(form, 'novalidate') || (submitter !== null && has(submitter, 'formnovalidate'));
  if (!noValidate && !formCheckValidity(form)) return;
  const window = windowOf(form);
  // jsdom 20 has no SubmitEvent: submit is a plain Event.
  const event = window[S].compat.jsdom < 21 ? new window.Event('submit', { bubbles: true, cancelable: true })
    : new window.SubmitEvent('submit', { bubbles: true, cancelable: true, submitter });
  if (!dispatch(form, event)) return;
  notImplemented(form, "HTMLFormElement's requestSubmit() method");
}

function formCheckValidity(form) {
  let valid = true;
  for (const el of formElements(form)) if (!checkValidity(el)) valid = false;
  return valid;
}

function resetControl(el) {
  const s = el[S];
  switch (s.tag) {
    case 'input':
      s.dirtyValue = false;
      s.value = undefined;
      s.dirtyChecked = false;
      s.checked = undefined;
      if (inputType(el) === 'radio' && has(el, 'checked')) setCheckedness(el, true);
      break;
    case 'textarea':
      s.dirtyValue = false;
      s.value = undefined;
      break;
    case 'select':
      for (const o of listOfOptions(el)) { o[S].selectedness = has(o, 'selected'); o[S].dirtySelected = false; }
      askForReset(el);
      break;
    case 'output':
      el.textContent = outputDefault(el);
      s.defaultOverride = null;
      break;
    default: break;
  }
}

function reset(form) {
  if (!fire(form, 'reset', { bubbles: true, cancelable: true })) return;
  for (const el of formElements(form)) resetControl(el);
}

const outputDefault = (el) => el[S].defaultOverride ?? el.textContent;

// --- activation behavior ---------------------------------------------------------------
// From the HTML standard; dispatch() (events.js) runs these for clicks as
// the DOM standard's activation steps.

function sendClick(target, init) {
  const MouseEvent = windowOf(target).MouseEvent;
  return dispatch(target, new MouseEvent('click', init), false);
}

function inputActivation(input) {
  const type = inputType(input);
  // Saved by the legacy-pre-activation behavior for the canceled steps.
  let wasChecked = false;
  let wasIndeterminate = false;
  let previouslyChecked = null;
  return {
    // Legacy-pre-activation behavior: a checkbox toggles (no longer
    // indeterminate); a radio button becomes checked, remembering which
    // button of its group was.
    pre() {
      const s = input[S];
      wasChecked = checkedness(input);
      if (type === 'checkbox') {
        wasIndeterminate = !!s.indeterminate;
        s.dirtyChecked = true;
        s.checked = !wasChecked;
        s.indeterminate = false;
      } else if (type === 'radio') {
        previouslyChecked = wasChecked ? input : radioGroup(input).find(checkedness) ?? null;
        s.dirtyChecked = true;
        setCheckedness(input, true);
      }
    },
    // Legacy-canceled-activation behavior: undo it.
    cancel() {
      const s = input[S];
      if (type === 'checkbox') {
        s.checked = wasChecked;
        s.indeterminate = wasIndeterminate;
      } else if (type === 'radio') {
        if (previouslyChecked && (previouslyChecked === input || radioGroup(input).includes(previouslyChecked))) setCheckedness(previouslyChecked, true);
        else s.checked = false;
      }
    },
    run(event) {
      const mutable = !isDisabled(input) && !(READONLY_TYPES.has(type) && has(input, 'readonly'));
      // An image button's selected coordinate: the click's, as jsdom takes
      // it (clientX and clientY, its offsetX and offsetY without layout).
      if (type === 'image' && event !== undefined) {
        const es = eventState(event);
        input[S].selectedCoordinate = [es.clientX ?? 0, es.clientY ?? 0];
      }
      if (!mutable && type !== 'checkbox' && type !== 'radio') return;
      // Browsers (and jsdom) fire nothing for a radio button that was
      // already checked, though the standard's text fires input and change.
      if (type === 'checkbox' || (type === 'radio' && !wasChecked)) {
        // jsdom before 16.5.2 fired them for an input outside a document too
        // (Vue Test Utils mounts components detached by default).
        if (isConnected(input) || windowOf(input)[S].compat.detachedCheckableEvents) {
          fire(input, 'input', { bubbles: true, composed: true });
          fire(input, 'change', { bubbles: true });
        }
        return;
      }
      const form = formOwner(input);
      if (!form || !isConnected(form)) return;
      // jsdom 20: an image button does not submit its form.
      if (type === 'submit' || (type === 'image' && windowOf(form)[S].compat.jsdom >= 21)) submitForm(form, input);
      else if (type === 'reset') reset(form);
    },
  };
}

function activationBehavior(node) {
  const s = node[S];
  if (s.type !== ELEMENT_NODE || s.ns !== HTML_NS) return null;
  switch (s.tag) {
    case 'input': return inputActivation(node);
    // A button submits or resets its form owner.
    case 'button': return {
      run() {
        if (isDisabled(node)) return;
        const form = formOwner(node);
        if (!form || !isConnected(form)) return;
        const type = buttonType(node);
        if (type === 'submit') submitForm(form, node);
        else if (type === 'reset') reset(form);
      },
    };
    // The standard leaves label activation to the platform: clicking the
    // label, or non-interactive content in it, clicks its labeled control.
    // Clicks on interactive content inside the label do nothing, and a click
    // from inside the control itself is not sent back to it (it bubbles here
    // when the control, like <meter>, has no activation behavior of its own).
    case 'label': return {
      run(event) {
        const target = event.target;
        for (let n = target; n && n !== node; n = n[S].parent) if (isInteractiveContent(n)) return;
        const control = labelControl(node);
        if (!control || isDisabled(control) || (target && contains(control, target))) return;
        sendClick(control, { bubbles: true, cancelable: true, view: windowOf(node), detail: 1 });
      },
    };
    // Links follow their url (hyperlinks.js, navigation.js); an <a> or
    // <area> without one is not a link.
    case 'a': case 'area': {
      if (!s.attrs.has('href')) return null;
      return {
        run() {
          const url = urlOf(node);
          if (url) followHyperlink(node, url);
        },
      };
    }
    // The summary for its parent details toggles the details' open attribute.
    case 'summary': return {
      run() {
        const details = s.parent;
        if (!details || !isTag(details, 'details')) return;
        let first = null;
        for (let c = details[S].first; c; c = c[S].next) if (isTag(c, 'summary')) { first = c; break; }
        if (first !== node) return;
        writeAttribute(details, 'open', has(details, 'open') ? undefined : '');
      },
    };
    default: return null;
  }
}

hooks.activation = activationBehavior;

export const clickMember = {
  click() {
    const s = state(this);
    if (isDisabled(this) || s.clickInProgress) return;
    s.clickInProgress = true;
    try {
      const window = windowOf(this);
      // jsdom before 27 (the profile without PointerEvent) fires a MouseEvent.
      const ClickEvent = window[S].compat.jsdom < 27 ? window.MouseEvent : window.PointerEvent;
      dispatch(this, new ClickEvent('click', {
        bubbles: true, cancelable: true, composed: true, pointerId: -1, view: window,
      }), false);
    } finally {
      s.clickInProgress = false;
    }
  },
};

// --- form data -----------------------------------------------------------------------
// The HTML standard's entry list (4.10.21.4) and the XHR standard's FormData.

const SUBMITTABLE = new Set(['button', 'input', 'object', 'select', 'textarea']);
const isButton = (el) => isTag(el, 'button')
  || (isTag(el, 'input') && ['submit', 'image', 'reset', 'button'].includes(inputType(el)));

// Converting to a scalar value string: lone surrogates become U+FFFD.
const scalar = (v) => {
  const s = String(v);
  return typeof s.toWellFormed === 'function' ? s.toWellFormed() : s;
};

// Create an entry: strings as scalar value strings; Blobs (file-reader.js) as
// Files of the blob's window, as in jsdom (named "blob" unless they are Files),
// renamed when a filename is given. Other objects are strings, as in jsdom
// (the platform's Blob gives "[object Blob]"); with a filename the value
// must be a Blob (method: append or set, for the error).
function createEntry(window, name, value, filename, method) {
  const blob = hooks.blobs.blobData(value);
  if (blob !== undefined) {
    const lastModified = blob.name === undefined ? Date.now() : blob.lastModified;
    let file = value;
    if (filename !== undefined) file = hooks.blobs.makeFile(blob.window, blob.bytes, scalar(filename), blob.type, lastModified);
    else if (blob.name === undefined) file = hooks.blobs.makeFile(blob.window, blob.bytes, 'blob', blob.type, lastModified);
    return { name: scalar(name), value: file };
  }
  if (filename !== undefined) throw new TypeError(`Failed to execute '${method}' on 'FormData': parameter 2 is not of type 'Blob'.`);
  return { name: scalar(name), value: scalar(value) };
}

// Constructing the entry list of a form (null while already constructing).
function constructEntryList(form, submitter = null) {
  const fs = form[S];
  if (fs.constructingEntryList) return null;
  fs.constructingEntryList = true;
  const window = windowOf(form);
  const entries = [];
  try {
    for (const field of descendants(rootOf(form))) {
      if (!(field[S].ns === HTML_NS && SUBMITTABLE.has(field[S].tag)) || formOwner(field) !== form) continue;
      const tag = field[S].tag;
      const type = tag === 'input' ? inputType(field) : null;
      if (closestTag(field, 'datalist') || isDisabled(field) || (isButton(field) && field !== submitter)) continue;
      if ((type === 'checkbox' || type === 'radio') && !checkedness(field)) continue;
      if (type === 'image') {
        const prefix = attr(field, 'name') ? `${attr(field, 'name')}.` : '';
        const [x, y] = field[S].selectedCoordinate ?? [0, 0];
        entries.push(createEntry(window, `${prefix}x`, String(x)), createEntry(window, `${prefix}y`, String(y)));
        continue;
      }
      const name = attr(field, 'name');
      if (!name) continue;
      if (tag === 'select') {
        settleSelectedness(field);
        for (const option of listOfOptions(field)) if (selectedness(option) && !isOptionDisabled(option)) entries.push(createEntry(window, name, optionValue(option)));
      } else if (type === 'checkbox' || type === 'radio') {
        entries.push(createEntry(window, name, attr(field, 'value') ?? 'on'));
      } else if (type === 'file') {
        entries.push(createEntry(window, name, hooks.blobs.makeFile(window, new Uint8Array(0), '', 'application/octet-stream', Date.now())));
      } else if (type === 'hidden' && name.toLowerCase() === '_charset_') {
        entries.push(createEntry(window, name, 'UTF-8'));
      } else {
        const value = tag === 'textarea' ? textareaValue(field) : tag === 'input' ? inputValue(field) : attr(field, 'value') ?? '';
        entries.push(createEntry(window, name, value));
      }
      const dirname = attr(field, 'dirname');
      if (dirname && (tag === 'textarea' || (tag === 'input' && SELECTION_TYPES.has(type)))) {
        entries.push(createEntry(window, dirname, directionality(field)));
      }
    }
    const formData = Object.create(internalsOf(form).protos.FormData);
    formData[S] = { window, entries };
    const event = new window.FormDataEvent('formdata', { bubbles: true, formData });
    dispatch(form, event);
  } finally {
    fs.constructingEntryList = false;
  }
  return entries.slice();
}

const entriesOf = (self) => state(self).entries;

const FORM_DATA_INTERFACES = [
  {
    name: 'FormData',
    construct: (w, self, [form, submitter = null]) => {
      self[S] = { window: w, entries: [] };
      if (form === undefined) return self;
      // jsdom 20 ignores the submitter argument (libraries feature-detect it
      // with new FormData(form, 0), which throws from jsdom 22 on).
      if (w[S].compat.jsdom < 21) submitter = null;
      if (!form?.[S] || !isTag(form, 'form')) throw new TypeError("Failed to construct 'FormData': parameter 1 is not of type 'HTMLFormElement'.");
      if (submitter !== null) {
        if (!submitter?.[S] || !isSubmitButton(submitter)) throw new TypeError("Failed to construct 'FormData': The specified element is not a submit button.");
        if (formOwner(submitter) !== form) throw domError("Failed to construct 'FormData': The specified element is not owned by this form element.", 'NotFoundError');
      }
      const list = constructEntryList(form, submitter);
      if (list === null) throw domError("Failed to construct 'FormData': The form is already constructing its entry list.", 'InvalidStateError');
      self[S].entries = list;
      return self;
    },
    members: {
      append(name, value, filename) { const s = state(this); s.entries.push(createEntry(s.window, name, value, filename, 'append')); },
      delete(name) {
        const s = state(this);
        const key = scalar(name);
        s.entries = s.entries.filter((e) => e.name !== key);
      },
      get(name) {
        const key = scalar(name);
        return entriesOf(this).find((e) => e.name === key)?.value ?? null;
      },
      getAll(name) {
        const key = scalar(name);
        return entriesOf(this).filter((e) => e.name === key).map((e) => e.value);
      },
      has(name) { const key = scalar(name); return entriesOf(this).some((e) => e.name === key); },
      // Replace the first entry with this name and remove the others, or append.
      set(name, value, filename) {
        const s = state(this);
        const entry = createEntry(s.window, name, value, filename, 'set');
        let replaced = false;
        s.entries = s.entries.flatMap((e) => {
          if (e.name !== entry.name) return [e];
          if (replaced) return [];
          replaced = true;
          return [entry];
        });
        if (!replaced) s.entries.push(entry);
      },
      *entries() { for (const e of entriesOf(this).slice()) yield [e.name, e.value]; },
      *keys() { for (const e of entriesOf(this).slice()) yield e.name; },
      *values() { for (const e of entriesOf(this).slice()) yield e.value; },
      forEach(callback, thisArg) { for (const e of entriesOf(this).slice()) callback.call(thisArg, e.value, e.name, this); },
      [Symbol.iterator]() { return this.entries(); },
    },
  },
  {
    name: 'FormDataEvent',
    parent: 'Event',
    length: 2,
    construct: (w, self, args) => {
      if (!args[1]?.formData?.[S]) throw new TypeError("Failed to construct 'FormDataEvent': required member formData is undefined.");
      return eventConstruct('FormDataEvent', { formData: null })(w, self, args);
    },
    members: fieldGetters({ formData: null }),
  },
];

// --- interfaces ---------------------------------------------------------------------

// Merge member objects by descriptor (spread would call getters).
const mix = (...objects) => {
  const out = {};
  for (const o of objects) Object.defineProperties(out, Object.getOwnPropertyDescriptors(o));
  return out;
};

const formMember = { get form() { state(this); return formOwner(this); } };

const collection = (el, key, protoName, items, named = undefined, setIndex = null) => {
  const s = state(el);
  if (!s[key]) {
    const protos = internalsOf(el).protos;
    s[key] = liveList(protos[protoName], items, named, setIndex);
    s[key][S].protos = protos;
  }
  return s[key];
};

// Members by interface, merged over the reflected attributes.
export const FORM_MEMBERS = new Map([
  ['HTMLInputElement', mix(
    formMember,
    labelsMember,
    constraintValidation,
    selectionMembers,
    {
      get type() { state(this); return inputType(this); },
      set type(v) { writeAttribute(this, 'type', String(v)); },
      get value() { state(this); return inputValue(this); },
      set value(v) { state(this); setInputValue(this, str(v)); },
      get checked() { state(this); return checkedness(this); },
      set checked(v) { const s = state(this); s.dirtyChecked = true; setCheckedness(this, !!v); },
      get indeterminate() { return !!state(this).indeterminate; },
      set indeterminate(v) { state(this).indeterminate = !!v; },
      // A file input's selected files: none (there is no file picker); the
      // same FileList each time. Null for other types.
      get files() {
        const s = state(this);
        if (inputType(this) !== 'file') return null;
        return s.fileList ?? (s.fileList = liveList(internalsOf(this).protos.FileList, () => NO_FILES));
      },
      get list() {
        state(this);
        const id = attr(this, 'list');
        const el = id === undefined ? null : firstWithId(rootOf(this), id);
        return el && isTag(el, 'datalist') ? el : null;
      },
      get valueAsNumber() {
        state(this);
        const n = toNumber(inputType(this), inputValue(this));
        return n === null ? NaN : n;
      },
      set valueAsNumber(v) {
        state(this);
        const type = inputType(this);
        const n = Number(v);
        if (!Number.isFinite(n) && !Number.isNaN(n)) throw new TypeError("Failed to set the 'valueAsNumber' property on 'HTMLInputElement': The provided double value is non-finite.");
        if (!DEFAULT_STEP[type]) throw domError("This input element does not support Number values.", 'InvalidStateError');
        if (Number.isNaN(n)) { setInputValue(this, ''); return; }
        if (type === 'number' || type === 'range') setInputValue(this, String(n));
        else if (type === 'date') setInputValue(this, new Date(n).toISOString().slice(0, 10));
        else if (type === 'time') setInputValue(this, serializeTime(((n % 86400000) + 86400000) % 86400000));
        else if (type === 'month') { const y = 1970 + Math.floor(n / 12); setInputValue(this, `${pad(y, 4)}-${pad((((n % 12) + 12) % 12) + 1)}`); }
        else { const d = new Date(n); setInputValue(this, `${d.toISOString().slice(0, 10)}T${serializeTime(n - Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))}`); }
      },
      get valueAsDate() {
        state(this);
        const type = inputType(this);
        if (type !== 'date' && type !== 'time' && type !== 'month') return null;
        const n = toNumber(type, inputValue(this));
        if (n === null) return null;
        return new Date(type === 'month' ? Date.UTC(1970 + Math.floor(n / 12), n % 12) : n);
      },
      set valueAsDate(v) {
        state(this);
        const type = inputType(this);
        if (type !== 'date' && type !== 'time' && type !== 'month') throw domError("This input element does not support Date values.", 'InvalidStateError');
        if (v === null) { setInputValue(this, ''); return; }
        if (!(v instanceof Date)) throw new TypeError("Failed to set the 'valueAsDate' property on 'HTMLInputElement': The provided value is not a Date.");
        const t = v.getTime();
        if (Number.isNaN(t)) { setInputValue(this, ''); return; }
        if (type === 'month') this.valueAsNumber = (v.getUTCFullYear() - 1970) * 12 + v.getUTCMonth();
        else this.valueAsNumber = type === 'time' ? t % 86400000 : t;
      },
      stepUp(n = 1) { stepBy(this, n); },
      stepDown(n = 1) { stepBy(this, -n); },
    },
  )],
  ['HTMLTextAreaElement', mix(
    formMember,
    labelsMember,
    constraintValidation,
    selectionMembers,
    {
      get type() { state(this); return 'textarea'; },
      get defaultValue() { state(this); return childText(this); },
      set defaultValue(v) { state(this); this.textContent = str(v); },
      get value() { state(this); return textareaValue(this); },
      set value(v) {
        const s = state(this);
        const old = textareaValue(this);
        s.value = normalizeNewlines(str(v));
        s.dirtyValue = true;
        if (s.value !== old) { s.selStart = s.selEnd = s.value.length; s.selDir = 'none'; }
      },
      get textLength() { state(this); return textareaValue(this).length; },
    },
  )],
  ['HTMLSelectElement', mix(
    formMember,
    labelsMember,
    constraintValidation,
    {
      get type() { state(this); return has(this, 'multiple') ? 'select-multiple' : 'select-one'; },
      get options() {
        const options = collection(this, 'optionsList', 'HTMLOptionsCollection', () => listOfOptions(this), undefined, (i, v) => setOption(this, i, v));
        options[S].select = this;
        return options;
      },
      get selectedOptions() {
        return collection(this, 'selectedList', 'HTMLCollection', () => {
          settleSelectedness(this);
          return [...descendants(this)].filter((el) => isTag(el, 'option') && selectedness(el));
        });
      },
      get length() { state(this); return listOfOptions(this).length; },
      set length(v) { this.options.length = v; },
      get selectedIndex() { state(this); return selectedIndex(this); },
      set selectedIndex(v) {
        state(this);
        settleSelectedness(this);
        const options = listOfOptions(this);
        for (const o of options) o[S].selectedness = false;
        const chosen = options[Number(v) | 0];
        if (chosen) { chosen[S].selectedness = true; chosen[S].dirtySelected = true; }
      },
      get value() {
        state(this);
        settleSelectedness(this);
        for (const o of listOfOptions(this)) if (selectedness(o)) return optionValue(o);
        return '';
      },
      set value(v) {
        state(this);
        settleSelectedness(this);
        const value = str(v);
        for (const o of listOfOptions(this)) {
          if (optionValue(o) === value) { o[S].selectedness = true; o[S].dirtySelected = true; } else o[S].selectedness = false;
        }
      },
      item(index) { return this.options.item(index); },
      namedItem(name) { return this.options.namedItem(name); },
      // Iterable over its options, as an interface with an indexed getter
      // (WebIDL). jsdom's is Array.prototype.values over indexed properties;
      // warpdom has no indexed properties on elements (select[0]), so it
      // iterates the list of options directly.
      [Symbol.iterator]() { state(this); return listOfOptions(this).slice()[Symbol.iterator](); },
      add(element, before = undefined) { this.options.add(element, before); },
      remove(...args) {
        if (args.length > 0) this.options.remove(args[0]);
        else internalsOf(this).protos.Element.remove.call(this);
      },
    },
  )],
  ['HTMLOptionElement', {
    // The nearest ancestor select's form owner.
    get form() {
      state(this);
      const select = nearestAncestorSelect(this);
      return select ? formOwner(select) : null;
    },
    get selected() {
      state(this);
      const select = nearestAncestorSelect(this);
      if (select) settleSelectedness(select);
      return selectedness(this);
    },
    set selected(v) {
      const s = state(this);
      const select = nearestAncestorSelect(this);
      if (select) settleSelectedness(select);
      s.dirtySelected = true;
      s.selectedness = !!v;
      if (select) {
        if (s.selectedness) deselectOthers(this, select);
        askForReset(select);
      }
    },
    get value() { state(this); return optionValue(this); },
    set value(v) { writeAttribute(this, 'value', String(v)); },
    get text() { state(this); return optionText(this); },
    set text(v) { state(this); this.textContent = String(v); },
    get label() { state(this); return attr(this, 'label') ?? optionText(this); },
    set label(v) { writeAttribute(this, 'label', String(v)); },
    // The number of options before it in its select's list of options.
    get index() {
      state(this);
      const select = nearestAncestorSelect(this);
      const i = select ? listOfOptions(select).indexOf(this) : -1;
      return i < 0 ? 0 : i;
    },
  }],
  ['HTMLButtonElement', mix(
    formMember,
    labelsMember,
    constraintValidation,
    {
      get type() { state(this); return buttonType(this); },
      set type(v) { writeAttribute(this, 'type', String(v)); },
    },
  )],
  ['HTMLFormElement', {
    get elements() {
      const list = collection(this, 'elementsList', 'HTMLFormControlsCollection', () => formElements(this), FORM_CONTROLS_NAMED);
      return list;
    },
    get length() { state(this); return formElements(this).length; },
    get action() {
      state(this);
      const a = attr(this, 'action');
      const base = internalsOf(this).url;
      if (a === undefined || a === '') return base.href;
      try { return new URL(a, base).href; } catch { return a; }
    },
    set action(v) { writeAttribute(this, 'action', String(v)); },
    get method() {
      state(this);
      const m = asciiLowercase(attr(this, 'method') ?? '');
      return m === 'post' || m === 'dialog' ? m : 'get';
    },
    set method(v) { writeAttribute(this, 'method', String(v)); },
    get enctype() {
      state(this);
      const e = asciiLowercase(attr(this, 'enctype') ?? '');
      return e === 'multipart/form-data' || e === 'text/plain' ? e : 'application/x-www-form-urlencoded';
    },
    set enctype(v) { writeAttribute(this, 'enctype', String(v)); },
    get encoding() { return this.enctype; },
    set encoding(v) { this.enctype = v; },
    submit() { state(this); notImplemented(this, "HTMLFormElement's submit() method"); },
    requestSubmit(submitter = null) {
      state(this);
      if (submitter !== null) {
        if (!submitter?.[S] || !isSubmitButton(submitter)) throw new TypeError('The specified element is not a submit button');
        if (formOwner(submitter) !== this) throw domError('The specified element is not owned by this form element', 'NotFoundError');
      }
      submitForm(this, submitter);
    },
    reset() { state(this); reset(this); },
    checkValidity() { state(this); return formCheckValidity(this); },
    reportValidity() { state(this); return formCheckValidity(this); },
  }],
  ['HTMLLabelElement', {
    get control() { state(this); return labelControl(this); },
    get form() {
      state(this);
      const control = labelControl(this);
      return control && isListed(control) ? formOwner(control) : null;
    },
  }],
  ['HTMLFieldSetElement', mix(
    formMember,
    constraintValidation,
    {
      get type() { state(this); return 'fieldset'; },
      get elements() { return collection(this, 'elementsList', 'HTMLCollection', () => cached(this, 'fieldsetElements', () => [...descendants(this)].filter(isListed))); },
    },
  )],
  ['HTMLOutputElement', mix(
    formMember,
    labelsMember,
    constraintValidation,
    {
      get type() { state(this); return 'output'; },
      get htmlFor() { state(this); return tokenList(this, 'for', writeAttribute); },
      set htmlFor(v) { writeAttribute(this, 'for', String(v)); },
      get value() { state(this); return this.textContent; },
      set value(v) {
        const s = state(this);
        if (s.defaultOverride == null) s.defaultOverride = this.textContent;
        this.textContent = String(v);
      },
      get defaultValue() { state(this); return outputDefault(this); },
      set defaultValue(v) {
        const s = state(this);
        if (s.defaultOverride == null) this.textContent = String(v);
        else s.defaultOverride = String(v);
      },
    },
  )],
  ['HTMLObjectElement', mix(formMember, constraintValidation)],
  ['HTMLLegendElement', {
    get form() {
      state(this);
      const p = this[S].parent;
      return p && isTag(p, 'fieldset') ? formOwner(p) : null;
    },
  }],
]);

function stepBy(el, n) {
  state(el);
  const type = inputType(el);
  const defaults = DEFAULT_STEP[type];
  if (!defaults) throw domError('This form element is not steppable.', 'InvalidStateError');
  const stepAttr = attr(el, 'step');
  if (stepAttr !== undefined && stepAttr.toLowerCase() === 'any') throw domError("This form element does not have an allowed value step.", 'InvalidStateError');
  let step = stepAttr === undefined ? null : parseFloatValue(stepAttr);
  if (step === null || step <= 0) step = defaults[0];
  const value = toNumber(type, inputValue(el)) ?? 0;
  const delta = step * defaults[1];
  const base = toNumber(type, attr(el, 'min') ?? '') ?? toNumber(type, attr(el, 'value') ?? '') ?? 0;
  const count = Number(n) | 0;
  const q = (value - base) / delta;
  // Off the step grid: snap to the nearest step in the direction of travel.
  let next = Math.abs(q - Math.round(q)) > 1e-9
    ? base + (count > 0 ? Math.ceil(q) : Math.floor(q)) * delta
    : value + delta * count;
  const min = toNumber(type, attr(el, 'min') ?? '');
  const max = toNumber(type, attr(el, 'max') ?? '');
  if (min !== null && next < min) next = min;
  if (max !== null && next > max) next = max;
  el.valueAsNumber = Number(next.toPrecision(15));
}

// --- collections and ValidityState -----------------------------------------------

const items = (list) => state(list).items();

// HTMLFormControlsCollection's named getter: one element, or a RadioNodeList
// when several have the name.
function formControlsNamedItem(list, name) {
  const key = String(name);
  if (key === '') return null;
  const found = items(list).filter((el) => attr(el, 'id') === key || attr(el, 'name') === key);
  if (found.length === 0) return null;
  if (found.length === 1) return found[0];
  return liveList(state(list).protos.RadioNodeList, () => items(list).filter((el) => attr(el, 'id') === key || attr(el, 'name') === key));
}

const FORM_CONTROLS_NAMED = { get: formControlsNamedItem, names: htmlCollectionNames, unenumerable: true };

// HTMLOptionsCollection's indexed setter (select.options[i] = option).
function setOption(select, index, option) {
  if (option == null) { listOfOptions(select)[index]?.remove(); return; }
  if (!option?.[S] || !isTag(option, 'option')) throw new TypeError("Failed to set an indexed property on 'HTMLOptionsCollection': parameter 2 is not of type 'HTMLOptionElement'.");
  const options = listOfOptions(select);
  const n = index - options.length;
  if (n > 0) {
    const doc = select.ownerDocument;
    const frag = doc.createDocumentFragment();
    for (let i = 0; i < n; i++) frag.appendChild(doc.createElement('option'));
    select.appendChild(frag);
  }
  if (n >= 0) select.appendChild(option);
  else options[index].replaceWith(option);
}

export const FORM_INTERFACES = [
  ...FORM_DATA_INTERFACES,
  {
    name: 'HTMLOptionsCollection',
    parent: 'HTMLCollection',
    members: {
      get length() { return items(this).length; },
      set length(v) {
        const select = state(this).select;
        const options = items(this);
        const n = v >>> 0;
        if (n < options.length) for (const o of options.slice(n)) o.remove();
        else for (let i = options.length; i < n; i++) select.appendChild(select.ownerDocument.createElement('option'));
      },
      get selectedIndex() { return selectedIndex(state(this).select); },
      set selectedIndex(v) { state(this).select.selectedIndex = v; },
      add(element, before = null) {
        const select = state(this).select;
        if (contains(element, select)) throw domError('The new element is an ancestor of the select.', 'HierarchyRequestError');
        let ref = before;
        if (typeof before === 'number') ref = items(this)[before] ?? null;
        if (ref !== null && !contains(select, ref)) throw domError('The reference element is not a descendant of the select.', 'NotFoundError');
        if (element === ref) return;
        const parent = ref === null ? select : ref.parentNode;
        parent.insertBefore(element, ref);
      },
      remove(index) {
        const option = items(this)[index | 0];
        if (option) option.remove();
      },
    },
  },
  {
    name: 'HTMLFormControlsCollection',
    parent: 'HTMLCollection',
    members: {
      namedItem(name) { return formControlsNamedItem(this, name); },
    },
  },
  {
    name: 'RadioNodeList',
    parent: 'NodeList',
    members: {
      get value() {
        for (const el of items(this)) if (isTag(el, 'input') && inputType(el) === 'radio' && checkedness(el)) return inputValue(el);
        return '';
      },
      set value(v) {
        const value = String(v);
        for (const el of items(this)) {
          if (isTag(el, 'input') && inputType(el) === 'radio' && inputValue(el) === value) { el.checked = true; return; }
        }
      },
    },
  },
  {
    name: 'ValidityState',
    members: Object.fromEntries([...VALIDITY_FLAGS, 'valid'].map((flag) => [flag, {
      get() {
        const flags = validityFlags(state(this).element);
        return flag === 'valid' ? VALIDITY_FLAGS.every((k) => !flags[k]) : !!flags[flag];
      },
    }])),
  },
];
