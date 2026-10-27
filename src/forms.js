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
import { documentBaseURL } from './base-url.js';
import { followHyperlink } from './navigation.js';
import {
  S,
  state,
  domError,
  hooks,
  HTML_NS,
  SVG_NS,
  ELEMENT_NODE,
  TEXT_NODE,
  DOCUMENT_NODE,
  rootOf,
  nextInTree,
  contains,
  elementById,
  connected,
  asciiLowercase,
  PlatformURL as URL,
  tooFewArguments,
} from './internal.js';
import { writeAttribute, attributeSteps, addAttributeStep, tokenList } from './attributes.js';
import { liveList, htmlCollectionNames, indexedElement, iterate } from './collections.js';
import { dispatch, eventConstruct, fieldGetters, eventState } from './events.js';
import { parseInteger } from './reflect.js';
import { directionality } from './directionality.js';

// --- helpers -------------------------------------------------------------------

const isTag = (node, tag) => {
  const s = node[S];
  return s.type === ELEMENT_NODE && s.ns === HTML_NS && s.tag === tag;
};
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

// The elements of a tree in tree order: its root too when the root is an
// element (a tree not in a document: a form, label or control on its own).
function* treeElements(root) {
  if (root[S].type === ELEMENT_NODE) yield root;
  yield* descendants(root);
}

function firstWithId(root, id) {
  if (root[S].type === DOCUMENT_NODE) return elementById(root, id);
  for (const el of treeElements(root)) if (attr(el, 'id') === id) return el;
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
const trimASCII = (s) => s.replace(/^[\t\n\f\r ]+|[\t\n\f\r ]+$/g, '');
// Strip and collapse ASCII whitespace (not NBSP or other Unicode spaces).
const stripAndCollapse = (s) => trimASCII(s.replace(asciiWhitespace, ' '));
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
      for (let c = p[S].first; c; c = c[S].next)
        if (isTag(c, 'legend')) {
          legend = c;
          break;
        }
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
  if (s.tag === 'input') return inputType(el) !== 'hidden';
  // Form-associated custom elements, from jsdom 26.0.0 (custom-elements.js
  // reads formAssociated only from that version).
  return s.ceState === 'custom' && s.ceDefinition?.formAssociated === true;
}

function isInteractiveContent(node) {
  const s = node[S];
  if (s.type !== ELEMENT_NODE || s.ns !== HTML_NS) return false;
  if (s.attrs.has('tabindex')) return true;
  switch (s.tag) {
    case 'a':
      return s.attrs.has('href');
    case 'audio':
    case 'video':
      return s.attrs.has('controls');
    case 'img':
    case 'object':
      return s.attrs.has('usemap');
    case 'input':
      return inputType(node) !== 'hidden';
    case 'button':
    case 'details':
    case 'embed':
    case 'iframe':
    case 'label':
    case 'select':
    case 'textarea':
      return true;
    default:
      return false;
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
    for (const el of treeElements(rootOf(form))) {
      if (isListed(el) && !(el[S].tag === 'input' && inputType(el) === 'image') && formOwner(el) === form) out.push(el);
    }
    return out;
  });
}

const isSubmitButton = (el) =>
  (isTag(el, 'input') && (inputType(el) === 'submit' || inputType(el) === 'image')) ||
  (isTag(el, 'button') && buttonType(el) === 'submit');

// --- input type, value and checkedness ------------------------------------------

const INPUT_TYPES = new Set([
  'hidden',
  'text',
  'search',
  'tel',
  'url',
  'email',
  'password',
  'date',
  'month',
  'week',
  'time',
  'datetime-local',
  'number',
  'range',
  'color',
  'checkbox',
  'radio',
  'file',
  'submit',
  'image',
  'reset',
  'button',
]);

export function inputType(el) {
  return typeState(attr(el, 'type'));
}

function typeState(t) {
  if (t === undefined) return 'text';
  if (INPUT_TYPES.has(t)) return t; // already lowercase (the usual case)
  const lower = asciiLowercase(t);
  return INPUT_TYPES.has(lower) ? lower : 'text';
}

function valueMode(type) {
  switch (type) {
    case 'hidden':
    case 'submit':
    case 'image':
    case 'reset':
    case 'button':
      return 'default';
    case 'checkbox':
    case 'radio':
      return 'default/on';
    case 'file':
      return 'filename';
    default:
      return 'value';
  }
}

const SELECTION_TYPES = new Set(['text', 'search', 'url', 'tel', 'password']);
const READONLY_TYPES = new Set([
  'text',
  'search',
  'url',
  'tel',
  'email',
  'password',
  'date',
  'month',
  'week',
  'time',
  'datetime-local',
  'number',
]);
const REQUIRED_TYPES = new Set([...READONLY_TYPES, 'checkbox', 'radio', 'file']);
const PATTERN_TYPES = new Set(['text', 'search', 'url', 'tel', 'email', 'password']);

// Dates and times (HTML "microsyntaxes"), as numbers for range and step checks.
const daysInMonth = (y, m) =>
  m === 2
    ? (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0
      ? 29
      : 28
    : [31, 0, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];

function parseDate(v) {
  const m = /^(\d{4,})-(\d\d)-(\d\d)$/.exec(v);
  if (!m) return null;
  const y = +m[1],
    mo = +m[2],
    d = +m[3];
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
// A week string's year has four or five digits in jsdom (black box, 20.0.3
// to 30.1.2; the standard allows more).
function parseWeek(v) {
  const m = /^(\d{4,5})-W(\d\d)$/.exec(v);
  return m && +m[1] > 0 && +m[2] >= 1 && +m[2] <= weeksInYear(+m[1]) ? { y: +m[1], w: +m[2] } : null;
}
// Before jsdom 30.1.0 (legacy: compat.legacyTimeStrings) a time's
// fraction is read as whole milliseconds (".5" is 5 ms) and a time with
// seconds is serialized with three fraction digits ("10:00:05.000").
function parseTime(v, legacy = false) {
  const m = /^(\d\d):(\d\d)(?::(\d\d)(?:\.(\d{1,3}))?)?$/.exec(v);
  if (!m || +m[1] > 23 || +m[2] > 59 || (m[3] !== undefined && +m[3] > 59)) return null;
  return ((+m[1] * 60 + +m[2]) * 60 + (+m[3] || 0)) * 1000 + (m[4] ? +(legacy ? m[4] : m[4].padEnd(3, '0')) : 0);
}
function parseDateTime(v, legacy = false) {
  const m = /^(.+?)[T ](.+)$/.exec(v);
  if (!m) return null;
  const date = parseDate(m[1]);
  const time = parseTime(m[2], legacy);
  return date && time !== null ? { date, time } : null;
}
const pad = (n, w = 2) => String(n).padStart(w, '0');
const DAY = 86400000;
const WEEK = 7 * DAY;
// Midnight UTC on the Monday of week w of year y (ISO 8601 weeks: week 1
// has the year's first Thursday). Years below 100 are years, not 19xx.
function weekStart(y, w) {
  const jan4 = new Date(0);
  jan4.setUTCFullYear(y, 0, 4);
  return jan4.getTime() - ((jan4.getUTCDay() + 6) % 7) * DAY + (w - 1) * WEEK;
}
// The week string of the week containing time n (ms).
function serializeWeek(n) {
  const date = new Date(n);
  const thursday = new Date(date.getTime() + (3 - ((date.getUTCDay() + 6) % 7)) * DAY);
  const y = thursday.getUTCFullYear();
  const jan1 = new Date(0);
  jan1.setUTCFullYear(y, 0, 1);
  return `${pad(y, 4)}-W${pad(Math.floor((thursday.getTime() - jan1.getTime()) / WEEK) + 1)}`;
}
function serializeTime(ms, legacy = false) {
  const h = Math.floor(ms / 3600000),
    mi = Math.floor(ms / 60000) % 60,
    sec = Math.floor(ms / 1000) % 60,
    frac = ms % 1000;
  let out = `${pad(h)}:${pad(mi)}`;
  if (sec || frac) out += `:${pad(sec)}`;
  if (legacy) {
    if (sec || frac) out += `.${pad(frac, 3)}`;
  } else if (frac) out += `.${pad(frac, 3).replace(/0+$/, '')}`;
  return out;
}
const legacyTime = (el) => windowOf(el)[S].compat.legacyTimeStrings;

const FLOAT = /^-?(?:\d+(?:\.\d+)?|\.\d+)(?:[eE][+-]?\d+)?$/;
const parseFloatValue = (v) => (FLOAT.test(v) && Number.isFinite(Number(v)) ? Number(v) : null);

// Converts a value of the given type to a number (ms for dates and times,
// months for month), or null.
function toNumber(type, v, el) {
  switch (type) {
    case 'number':
    case 'range':
      return parseFloatValue(v);
    case 'date': {
      const d = parseDate(v);
      return d ? Date.UTC(d.y, d.mo - 1, d.d) : null;
    }
    case 'month': {
      const d = parseMonth(v);
      return d ? (d.y - 1970) * 12 + d.mo - 1 : null;
    }
    case 'week': {
      const d = parseWeek(v);
      return d ? weekStart(d.y, d.w) : null;
    }
    case 'time':
      return parseTime(v, legacyTime(el));
    case 'datetime-local': {
      const d = parseDateTime(v, legacyTime(el));
      return d ? Date.UTC(d.date.y, d.date.mo - 1, d.date.d) + d.time : null;
    }
    default:
      return null;
  }
}

function rangeBounds(el) {
  const min = parseFloatValue(attr(el, 'min') ?? '') ?? 0;
  const max = parseFloatValue(attr(el, 'max') ?? '') ?? 100;
  return { min, max };
}

function sanitize(el, type, v) {
  switch (type) {
    case 'text':
    case 'search':
    case 'tel':
    case 'password':
      return stripNewlines(v);
    case 'url':
      return trimASCII(stripNewlines(v));
    case 'email':
      return has(el, 'multiple') ? v.split(',').map(trimASCII).join(',') : trimASCII(stripNewlines(v));
    case 'number':
      return parseFloatValue(v) === null ? '' : v;
    case 'range': {
      const { min, max } = rangeBounds(el);
      const n = parseFloatValue(v);
      if (n === null) return `${max < min ? min : (min + max) / 2}`;
      if (n < min) return `${min}`;
      if (n > max) return `${max}`;
      return v;
    }
    case 'color':
      return /^#[0-9a-fA-F]{6}$/.test(v) ? v.toLowerCase() : '#000000';
    case 'date':
      return parseDate(v) ? v : '';
    case 'month':
      return parseMonth(v) ? v : '';
    case 'week':
      return parseWeek(v) ? v : '';
    case 'time':
      return parseTime(v) === null ? '' : v;
    case 'datetime-local': {
      const legacy = legacyTime(el);
      const d = parseDateTime(v, legacy);
      return d ? `${v.slice(0, v.search(/[T ]/))}T${serializeTime(d.time, legacy)}` : '';
    }
    default:
      return v;
  }
}

function inputValue(el) {
  const s = el[S];
  const type = inputType(el);
  switch (valueMode(type)) {
    case 'value':
      return sanitize(el, type, s.value ?? attr(el, 'value') ?? '');
    case 'default':
      return attr(el, 'value') ?? '';
    case 'default/on':
      return attr(el, 'value') ?? 'on';
    default:
      return '';
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
      if (s.value !== old) {
        s.selStart = s.selEnd = s.value.length;
        s.selDir = 'none';
      }
      break;
    }
    case 'default':
    case 'default/on':
      writeAttribute(el, 'value', value);
      break;
    default:
      if (value !== '')
        throw domError(
          'This input element accepts a filename, which may only be programmatically set to the empty string.',
          'InvalidStateError',
        );
  }
}

const checkedness = (el) => el[S].checked ?? has(el, 'checked');

// An input's value is its value attribute's, sanitized for its type, until
// it is set (the dirty value flag) or a type change keeps it (s.value
// without the dirty flag: the value attribute replaces it).
attributeSteps.set('value', (el) => {
  const s = el[S];
  if (s.value !== undefined && !s.dirtyValue && isTag(el, 'input')) s.value = undefined;
});

// The type attribute's change steps (HTML 4.10.5, "input type change"), as
// jsdom (black box, 20.0.3 to 30.1.2): from the value mode to default or
// default/on, a non-empty value is written to the value attribute (after
// the type attribute's mutation record); from another mode into the value
// mode, the value is the value attribute's again (not dirty); from the
// value mode to the value mode, the value is kept (sanitized for the old
// type, and then the new one). An input type that gains selection puts
// the selection at the start.
attributeSteps.set('type', (el, old, value) => {
  const s = el[S];
  if (s.ns !== HTML_NS || s.tag !== 'input') return undefined;
  const from = typeState(old),
    to = typeState(value);
  if (from === to) return undefined;
  const fromMode = valueMode(from),
    toMode = valueMode(to);
  if (!SELECTION_TYPES.has(from) && SELECTION_TYPES.has(to)) {
    s.selStart = s.selEnd = 0;
    s.selDir = 'none';
  }
  if (to === 'radio' && checkedness(el)) uncheckGroup(el);
  if (fromMode === 'value') {
    const current = sanitize(el, from, s.value ?? attr(el, 'value') ?? '');
    if (toMode === 'value') {
      s.value = current;
      return undefined;
    }
    s.value = undefined;
    s.dirtyValue = false;
    if (current !== '' && (toMode === 'default' || toMode === 'default/on'))
      return () => writeAttribute(el, 'value', current);
  } else if (toMode === 'value') {
    s.value = undefined;
    s.dirtyValue = false;
  }
  return undefined;
});

function radioGroup(el) {
  const name = attr(el, 'name');
  if (!name) return [];
  const form = formOwner(el);
  const out = [];
  for (const other of treeElements(rootOf(el))) {
    if (
      other !== el &&
      isTag(other, 'input') &&
      inputType(other) === 'radio' &&
      attr(other, 'name') === name &&
      formOwner(other) === form
    )
      out.push(other);
  }
  return out;
}

function setCheckedness(el, value) {
  el[S].checked = value;
  if (value && inputType(el) === 'radio') uncheckGroup(el);
}

// The other buttons of a checked radio button's group become unchecked.
function uncheckGroup(el) {
  el[S].doc[S].checkedRadios = true;
  for (const other of radioGroup(el)) other[S].checked = false;
}
const isCheckedRadio = (el) => isTag(el, 'input') && inputType(el) === 'radio' && checkedness(el);

// The radio button group is also updated, as jsdom (black box, 20.0.3 to
// 30.1.2), when a checked radio button's name changes, when an input
// becomes a radio button, and when its form owner changes on insertion
// (into a form, or into a tree where its form attribute finds one). From
// jsdom 30.1.0 (compat.radioConnected), as the standard: also when it
// becomes connected, and when its form attribute changes.
addAttributeStep('name', (el) => {
  if (isCheckedRadio(el)) uncheckGroup(el);
});
attributeSteps.set('form', (el) => {
  if (isCheckedRadio(el) && windowOf(el)[S].compat.radioConnected) uncheckGroup(el);
});
// connected: node's tree is a document's (a shadow tree is checked here).
hooks.radios = (node, connected) => {
  const now = windowOf(node)[S].compat.radioConnected && (connected || isConnected(node));
  for (const el of treeElements(node)) {
    if (!isCheckedRadio(el)) continue;
    if (now) {
      uncheckGroup(el);
      continue;
    }
    const form = formOwner(el);
    if (form !== null && !contains(node, form)) uncheckGroup(el);
  }
};

attributeSteps.set('checked', (el) => {
  const s = el[S];
  if (!isTag(el, 'input') || s.dirtyChecked) return;
  s.checked = undefined;
  if (has(el, 'checked') && inputType(el) === 'radio') setCheckedness(el, true);
});

// The cloning steps of input and textarea (HTML): an input's value, dirty
// value flag, checkedness and dirty checkedness flag, a textarea's raw
// value and dirty value flag; as jsdom (black box, 20.0.3 to 30.1.2). The
// indeterminate state from jsdom 30.1.0 (compat.cloneIndeterminate), as
// the standard says. The selection is not copied.
export function cloneFormState(node, copy) {
  const s = node[S];
  const c = copy[S];
  if (s.value !== undefined) c.value = s.value;
  if (s.dirtyValue) c.dirtyValue = true;
  if (s.tag !== 'input') return;
  if (s.checked !== undefined) c.checked = s.checked;
  if (s.dirtyChecked) c.dirtyChecked = true;
  if (s.indeterminate && windowOf(copy)[S].compat.cloneIndeterminate) c.indeterminate = true;
}

// --- text selection (input and textarea) ------------------------------------------

const selectionApplies = (el) => isTag(el, 'textarea') || SELECTION_TYPES.has(inputType(el));
// Input types select() applies to without a selection: it only fires select.
const SELECT_ONLY_TYPES = new Set([
  'email',
  'number',
  'date',
  'month',
  'week',
  'time',
  'datetime-local',
  'color',
  'file',
]);
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
  if (isTag(el, 'textarea')) s.value = value;
  else s.value = sanitize(el, inputType(el), value);
  s.dirtyValue = true;
}

function setSelectionRange(el, start, end, direction = 'none') {
  if (!selectionApplies(el))
    throw domError("The input element's type does not support selection.", 'InvalidStateError');
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
  get selectionStart() {
    return selectionApplies(this) ? (state(this).selStart ?? 0) : null;
  },
  set selectionStart(v) {
    const s = state(this);
    if (!selectionApplies(this))
      throw domError("The input element's type does not support selection.", 'InvalidStateError');
    setSelectionRange(this, v, Math.max(v >>> 0, s.selEnd ?? 0), s.selDir);
  },
  get selectionEnd() {
    return selectionApplies(this) ? (state(this).selEnd ?? 0) : null;
  },
  set selectionEnd(v) {
    const s = state(this);
    if (!selectionApplies(this))
      throw domError("The input element's type does not support selection.", 'InvalidStateError');
    setSelectionRange(this, s.selStart ?? 0, v, s.selDir);
  },
  get selectionDirection() {
    return selectionApplies(this) ? (state(this).selDir ?? 'none') : null;
  },
  set selectionDirection(v) {
    const s = state(this);
    if (!selectionApplies(this))
      throw domError("The input element's type does not support selection.", 'InvalidStateError');
    setSelectionRange(this, s.selStart ?? 0, s.selEnd ?? 0, v);
  },
  setSelectionRange(start, end, direction = undefined) {
    state(this);
    if (end === undefined && arguments.length < 2)
      tooFewArguments(selectionInterface(this), 'setSelectionRange', 2, arguments.length);
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
    if (!SELECTION_MODES.has(mode))
      throw new TypeError(
        `Failed to execute 'setRangeText' on '${iface}': parameter 4 '${mode}' is not a valid enumeration value for SelectionMode`,
      );
    if (!selectionApplies(this))
      throw domError("The input element's type does not support selection.", 'InvalidStateError');
    const value = controlValue(this);
    let st = s.selStart ?? 0,
      en = s.selEnd ?? 0;
    if (n > 2) {
      st = start >>> 0;
      en = end >>> 0;
      if (st > en) throw domError('The index is not in the allowed range.', 'IndexSizeError');
    }
    st = Math.min(st, value.length);
    en = Math.min(en, value.length);
    let selStart = s.selStart ?? 0,
      selEnd = s.selEnd ?? 0;
    setControlValueRaw(this, value.slice(0, st) + text + value.slice(en));
    // jsdom before 21.1.2: the end of the replaced text is the new value's length.
    const newEnd = windowOf(this)[S].compat.legacyRangeTextEnd ? controlValue(this).length : st + text.length;
    if (mode === 'select') {
      selStart = st;
      selEnd = newEnd;
    } else if (mode === 'start') {
      selStart = selEnd = st;
    } else if (mode === 'end') {
      selStart = selEnd = newEnd;
    } else {
      const delta = text.length - (en - st);
      if (selStart > en) selStart += delta;
      else if (selStart > st) selStart = st;
      if (selEnd > en) selEnd += delta;
      else if (selEnd > st) selEnd = newEnd;
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

// The textarea wrapping transformation (form data): with wrap="hard"
// (exactly, as jsdom), a line feed after every cols UTF-16 code units of
// each line (cols: the attribute's non-zero value, else 20). jsdom 24.0.0
// to 30.0.1 break lines in other places when the cols attribute is set
// (not reproduced: no transformation then; compat.hardWrap).
function wrappedValue(el) {
  const value = textareaValue(el);
  if (attr(el, 'wrap') !== 'hard') return value;
  const colsAttr = attr(el, 'cols');
  if (colsAttr !== undefined && !windowOf(el)[S].compat.hardWrap) return value;
  const n = colsAttr === undefined ? null : parseInteger(colsAttr);
  const cols = n !== null && n > 0 ? n : 20;
  return value
    .split('\n')
    .map((line) => {
      if (line.length <= cols) return line;
      const parts = [];
      for (let i = 0; i < line.length; i += cols) parts.push(line.slice(i, i + cols));
      return parts.join('\n');
    })
    .join('\n');
}

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
      case 'datalist':
      case 'hr':
      case 'option':
        return null;
      case 'optgroup':
        if (optgroup) return null;
        optgroup = true;
        break;
      case 'select':
        return n;
      default:
        break;
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

const askForReset = (select) => {
  select[S].settledOptions = null;
};

// Changing a select's multiple or size attribute reruns the algorithm (the
// display size can change; jsdom also reruns it when the value is the same).
const selectAttributeChanged = (el) => {
  if (isTag(el, 'select')) askForReset(el);
};
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
  if (s.toggleTask) {
    s.toggleTask.newState = newState;
    return;
  }
  const task = (s.toggleTask = { oldState: old === undefined ? 'closed' : 'open', newState });
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
    else if (cs.type === ELEMENT_NODE && !(cs.tag === 'script' && (cs.ns === HTML_NS || cs.ns === SVG_NS)))
      out += textExcludingScript(c);
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
    for (const node of treeElements(root)) {
      if (!isTag(node, 'label')) continue;
      const control = labelControl(node);
      if (!control) continue;
      const list = byControl.get(control);
      if (list) list.push(node);
      else byControl.set(control, [node]);
    }
    return byControl;
  });
  return map.get(el) ?? NO_LABELS;
}

// A labelable element's labels: a live NodeList, the same on every read.
export function labelsList(el) {
  const s = el[S];
  return s.labelsList ?? (s.labelsList = liveList(internalsOf(el).protos.NodeList, () => labelsFor(el)));
}

export const labelsMember = {
  get labels() {
    state(this);
    return isLabelable(this) ? labelsList(this) : null;
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
      return (
        type === 'hidden' || type === 'reset' || type === 'button' || (READONLY_TYPES.has(type) && has(el, 'readonly'))
      );
    }
    case 'button':
      return buttonType(el) !== 'submit';
    case 'select':
    case 'textarea':
      return has(el, 'readonly');
    default:
      return true; // fieldset, output, object
  }
}

const willValidate = (el) => !isDisabled(el) && !closestTag(el, 'datalist') && !barred(el);

const VALIDITY_FLAGS = [
  'valueMissing',
  'typeMismatch',
  'patternMismatch',
  'tooLong',
  'tooShort',
  'rangeUnderflow',
  'rangeOverflow',
  'stepMismatch',
  'badInput',
  'customError',
];

const EMAIL =
  /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

// The compiled pattern regular expression (HTML): null when the pattern
// does not compile on its own (so "a)(b" cannot close the wrapping group),
// else ^(?:pattern)$. With the v flag from jsdom 27.0.0, the u flag before
// (compat.patternFlag; black box, 26.1.0 and 27.0.0-beta.0: u).
function compilePattern(pattern, flag) {
  try {
    new RegExp(pattern, flag);
    return new RegExp(`^(?:${pattern})$`, flag);
  } catch {
    return null;
  }
}

// Per type: default step, step scale factor, default step base.
const DEFAULT_STEP = {
  number: [1, 1, 0],
  range: [1, 1, 0],
  date: [1, DAY, 0],
  month: [1, 1, 0],
  week: [1, WEEK, -259200000],
  time: [60, 1000, 0],
  'datetime-local': [60, 1000, 0],
};

// Exact decimal arithmetic for steps, as jsdom (black box, 20.0.3 to
// 30.1.2): numbers are taken at their shortest decimal form (String(n)),
// so step 3e-15 does not divide 17, step 1/3 does not divide 1, and 0.2
// stepped up by 0.1 is 0.3. A decimal is [BigInt digits, exponent of 10].
function decimal(n) {
  const [mantissa, exp = '0'] = String(n).split('e');
  const dot = mantissa.indexOf('.');
  const digits = dot < 0 ? mantissa : mantissa.slice(0, dot) + mantissa.slice(dot + 1);
  return [BigInt(digits), Number(exp) - (dot < 0 ? 0 : mantissa.length - dot - 1)];
}
const decimalNumber = (digits, e) => Number(`${digits}e${e}`);
const floorDiv = (a, b) => {
  const q = a / b;
  return a % b !== 0n && a < 0n !== b < 0n ? q - 1n : q;
};

// The step of an input: [allowed value step, step base] (numbers), or
// null for step="any" and types without one.
function allowedStep(el, type) {
  const defaults = DEFAULT_STEP[type];
  if (!defaults) return null;
  const stepAttr = attr(el, 'step');
  if (stepAttr !== undefined && asciiLowercase(stepAttr) === 'any') return null;
  let step = stepAttr === undefined ? null : parseFloatValue(stepAttr);
  if (step === null || step <= 0) step = defaults[0];
  const base = toNumber(type, attr(el, 'min') ?? '', el) ?? toNumber(type, attr(el, 'value') ?? '', el) ?? defaults[2];
  return [step, defaults[1], base];
}

// Numbers as BigInt digits at one exponent of 10 (the smallest of theirs).
function scaled(numbers) {
  const decs = numbers.map((x) => (x === null ? null : decimal(x)));
  let e = Infinity;
  for (const d of decs) if (d !== null && d[1] < e) e = d[1];
  return { e, values: decs.map((d) => (d === null ? null : d[0] * 10n ** BigInt(d[1] - e))) };
}

function stepMismatch(el, type, value) {
  const n = toNumber(type, value, el);
  if (n === null) return false;
  const step = allowedStep(el, type);
  if (step === null) return false;
  const [stepValue, scale, base] = step;
  // Integers: exact in floating point.
  if (
    Number.isSafeInteger(n) &&
    Number.isSafeInteger(base) &&
    Number.isSafeInteger(stepValue * scale) &&
    Number.isSafeInteger(n - base)
  )
    return (n - base) % (stepValue * scale) !== 0;
  const {
    values: [v, b, d],
  } = scaled([n, base, stepValue]);
  return (v - b) % (d * BigInt(scale)) !== 0n;
}

function inputValidity(el) {
  const type = inputType(el);
  const value = inputValue(el);
  const flags = {};
  const required = has(el, 'required') && REQUIRED_TYPES.has(type);
  if (required && valueMode(type) === 'value' && !isDisabled(el) && !has(el, 'readonly') && value === '')
    flags.valueMissing = true;
  if (type === 'checkbox' && required && !checkedness(el)) flags.valueMissing = true;
  if (type === 'radio') {
    const group = [el, ...radioGroup(el)];
    if (group.some((r) => has(r, 'required')) && !group.some(checkedness)) flags.valueMissing = true;
  }
  if (type === 'file' && required) flags.valueMissing = true;
  if (value !== '') {
    if (type === 'email')
      flags.typeMismatch = !(has(el, 'multiple') ? value.split(',').every((v) => EMAIL.test(v)) : EMAIL.test(value));
    if (type === 'url') {
      try {
        new URL(value);
      } catch {
        flags.typeMismatch = true;
      }
    }
    const pattern = attr(el, 'pattern');
    if (pattern !== undefined && PATTERN_TYPES.has(type)) {
      const re = compilePattern(pattern, windowOf(el)[S].compat.patternFlag);
      if (re) {
        const values = type === 'email' && has(el, 'multiple') ? value.split(',') : [value];
        flags.patternMismatch = !values.every((v) => re.test(v));
      }
    }
    const n = toNumber(type, value, el);
    if (n !== null && type !== 'range') {
      const min = toNumber(type, attr(el, 'min') ?? '', el);
      const max = toNumber(type, attr(el, 'max') ?? '', el);
      if (type === 'time' && min !== null && (max === null || min > max)) {
        // A reversed time range (min > max) wraps midnight: a value between
        // max and min underflows and overflows. As jsdom (black box, 20.0.3
        // to 30.1.2), a time with min and no valid max is treated as one
        // too (the standard: an underflow only).
        if (n < min && (max === null || n > max)) flags.rangeUnderflow = flags.rangeOverflow = true;
      } else {
        if (min !== null && n < min) flags.rangeUnderflow = true;
        if (max !== null && n > max) flags.rangeOverflow = true;
      }
    }
    flags.stepMismatch = stepMismatch(el, type, value);
  }
  return flags;
}

function validityFlags(el) {
  const s = el[S];
  let flags;
  switch (s.tag) {
    case 'input':
      flags = inputValidity(el);
      break;
    case 'textarea':
      flags = {
        valueMissing: has(el, 'required') && !isDisabled(el) && !has(el, 'readonly') && textareaValue(el) === '',
      };
      break;
    case 'select': {
      const index = selectedIndex(el);
      flags = { valueMissing: has(el, 'required') && (index < 0 || (index === 0 && hasPlaceholderOption(el))) };
      break;
    }
    default:
      flags = {};
  }
  flags.customError = (s.customError ?? '') !== '';
  return flags;
}

const isValid = (el) => {
  const f = validityFlags(el);
  return VALIDITY_FLAGS.every((k) => !f[k]);
};

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
    for (let n = s.first; n; n = nextInTree(n, el))
      if (candidateInvalid(n)) {
        found = true;
        break;
      }
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
  get willValidate() {
    state(this);
    return willValidate(this);
  },
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
  checkValidity() {
    state(this);
    return checkValidity(this);
  },
  reportValidity() {
    state(this);
    return checkValidity(this);
  },
  setCustomValidity(message) {
    state(this).customError = String(message);
  },
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
  const event =
    window[S].compat.jsdom < 21
      ? new window.Event('submit', { bubbles: true, cancelable: true })
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
      for (const o of listOfOptions(el)) {
        o[S].selectedness = has(o, 'selected');
        o[S].dirtySelected = false;
      }
      askForReset(el);
      break;
    case 'output':
      el.textContent = outputDefault(el);
      s.defaultOverride = null;
      break;
    default:
      break;
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
        previouslyChecked = wasChecked ? input : (radioGroup(input).find(checkedness) ?? null);
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
        if (previouslyChecked && (previouslyChecked === input || radioGroup(input).includes(previouslyChecked)))
          setCheckedness(previouslyChecked, true);
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
    case 'input':
      return inputActivation(node);
    // A button submits or resets its form owner.
    case 'button':
      return {
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
    case 'label':
      return {
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
    case 'a':
    case 'area': {
      if (!s.attrs.has('href')) return null;
      return {
        run() {
          const url = urlOf(node);
          if (url) followHyperlink(node, url);
        },
      };
    }
    // The summary for its parent details toggles the details' open attribute.
    case 'summary':
      return {
        run() {
          const details = s.parent;
          if (!details || !isTag(details, 'details')) return;
          let first = null;
          for (let c = details[S].first; c; c = c[S].next)
            if (isTag(c, 'summary')) {
              first = c;
              break;
            }
          if (first !== node) return;
          writeAttribute(details, 'open', has(details, 'open') ? undefined : '');
        },
      };
    default:
      return null;
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
      dispatch(
        this,
        new ClickEvent('click', {
          bubbles: true,
          cancelable: true,
          composed: true,
          pointerId: -1,
          view: window,
        }),
        false,
      );
    } finally {
      s.clickInProgress = false;
    }
  },
};

// --- form data -----------------------------------------------------------------------
// The HTML standard's entry list (4.10.21.4) and the XHR standard's FormData.

const SUBMITTABLE = new Set(['button', 'input', 'object', 'select', 'textarea']);
const isButton = (el) =>
  isTag(el, 'button') || (isTag(el, 'input') && ['submit', 'image', 'reset', 'button'].includes(inputType(el)));

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
    if (filename !== undefined)
      file = hooks.blobs.makeFile(blob.window, blob.bytes, scalar(filename), blob.type, lastModified);
    else if (blob.name === undefined)
      file = hooks.blobs.makeFile(blob.window, blob.bytes, 'blob', blob.type, lastModified);
    return { name: scalar(name), value: file };
  }
  if (filename !== undefined)
    throw new TypeError(`Failed to execute '${method}' on 'FormData': parameter 2 is not of type 'Blob'.`);
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
    for (const field of treeElements(rootOf(form))) {
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
        for (const option of listOfOptions(field))
          if (selectedness(option) && !isOptionDisabled(option))
            entries.push(createEntry(window, name, optionValue(option)));
      } else if (type === 'checkbox' || type === 'radio') {
        entries.push(createEntry(window, name, attr(field, 'value') ?? 'on'));
      } else if (type === 'file') {
        entries.push(
          createEntry(
            window,
            name,
            hooks.blobs.makeFile(window, new Uint8Array(0), '', 'application/octet-stream', Date.now()),
          ),
        );
      } else if (type === 'hidden' && name.toLowerCase() === '_charset_') {
        entries.push(createEntry(window, name, 'UTF-8'));
      } else {
        const value =
          tag === 'textarea' ? wrappedValue(field) : tag === 'input' ? inputValue(field) : (attr(field, 'value') ?? '');
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

// A FormData's entries (XMLHttpRequest's send), or null for other values.
export function formDataEntries(value) {
  const s = value !== null && typeof value === 'object' ? value[S] : undefined;
  return s !== undefined && Array.isArray(s.entries) && Object.prototype.toString.call(value) === '[object FormData]'
    ? s.entries
    : null;
}

const FORM_DATA_INTERFACES = [
  {
    name: 'FormData',
    construct: (w, self, [form, submitter = null]) => {
      self[S] = { window: w, entries: [] };
      if (form === undefined) return self;
      // jsdom 20 ignores the submitter argument (libraries feature-detect it
      // with new FormData(form, 0), which throws from jsdom 22 on).
      if (w[S].compat.jsdom < 21) submitter = null;
      if (!form?.[S] || !isTag(form, 'form'))
        throw new TypeError("Failed to construct 'FormData': parameter 1 is not of type 'HTMLFormElement'.");
      if (submitter !== null) {
        if (!submitter?.[S] || !isSubmitButton(submitter))
          throw new TypeError("Failed to construct 'FormData': The specified element is not a submit button.");
        if (formOwner(submitter) !== form)
          throw domError(
            "Failed to construct 'FormData': The specified element is not owned by this form element.",
            'NotFoundError',
          );
      }
      const list = constructEntryList(form, submitter);
      if (list === null)
        throw domError(
          "Failed to construct 'FormData': The form is already constructing its entry list.",
          'InvalidStateError',
        );
      self[S].entries = list;
      return self;
    },
    members: {
      append(name, value, filename) {
        const s = state(this);
        s.entries.push(createEntry(s.window, name, value, filename, 'append'));
      },
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
        return entriesOf(this)
          .filter((e) => e.name === key)
          .map((e) => e.value);
      },
      has(name) {
        const key = scalar(name);
        return entriesOf(this).some((e) => e.name === key);
      },
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
      *entries() {
        for (const e of entriesOf(this).slice()) yield [e.name, e.value];
      },
      *keys() {
        for (const e of entriesOf(this).slice()) yield e.name;
      },
      *values() {
        for (const e of entriesOf(this).slice()) yield e.value;
      },
      forEach(callback, thisArg) {
        for (const e of entriesOf(this).slice()) callback.call(thisArg, e.value, e.name, this);
      },
      [Symbol.iterator]() {
        return this.entries();
      },
    },
  },
  {
    name: 'FormDataEvent',
    parent: 'Event',
    length: 2,
    construct: (w, self, args) => {
      if (!args[1]?.formData?.[S])
        throw new TypeError("Failed to construct 'FormDataEvent': required member formData is undefined.");
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

const formMember = {
  get form() {
    state(this);
    return formOwner(this);
  },
};

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
  [
    'HTMLInputElement',
    mix(formMember, labelsMember, constraintValidation, selectionMembers, {
      get type() {
        state(this);
        return inputType(this);
      },
      set type(v) {
        writeAttribute(this, 'type', String(v));
      },
      get value() {
        state(this);
        return inputValue(this);
      },
      set value(v) {
        state(this);
        setInputValue(this, str(v));
      },
      get checked() {
        state(this);
        return checkedness(this);
      },
      set checked(v) {
        const s = state(this);
        s.dirtyChecked = true;
        setCheckedness(this, !!v);
      },
      get indeterminate() {
        return !!state(this).indeterminate;
      },
      set indeterminate(v) {
        state(this).indeterminate = !!v;
      },
      // A file input's selected files: none (there is no file picker); the
      // same FileList each time. Null for other types.
      get files() {
        const s = state(this);
        if (inputType(this) !== 'file') return null;
        return s.fileList ?? (s.fileList = liveList(internalsOf(this).protos.FileList, () => NO_FILES));
      },
      // The setter keeps the FileList itself (input.files = other.files:
      // the same object); null and undefined change nothing; on other
      // types it does nothing. jsdom's TypeError for other values.
      set files(v) {
        const s = state(this);
        if (v === null || v === undefined) return;
        if (!(v instanceof windowOf(this).FileList))
          throw new TypeError(
            "Failed to set the 'files' property on 'HTMLInputElement': The provided value is not of type 'FileList'.",
          );
        if (inputType(this) === 'file') s.fileList = v;
      },
      get list() {
        state(this);
        const id = attr(this, 'list');
        const el = id === undefined ? null : firstWithId(rootOf(this), id);
        return el && isTag(el, 'datalist') ? el : null;
      },
      get valueAsNumber() {
        state(this);
        const n = toNumber(inputType(this), inputValue(this), this);
        return n === null ? NaN : n;
      },
      set valueAsNumber(v) {
        state(this);
        const type = inputType(this);
        const n = Number(v);
        // As jsdom: not finite is a TypeError, NaN too before 23.1.0.
        if (!Number.isFinite(n) && (!Number.isNaN(n) || windowOf(this)[S].compat.nanValueAsNumberThrows))
          throw new TypeError('Failed to set infinite value as Number');
        if (!DEFAULT_STEP[type])
          throw domError(
            "Failed to set the 'valueAsNumber' property on 'HTMLInputElement': This input element does not support Number values.",
            'InvalidStateError',
          );
        if (Number.isNaN(n)) {
          setInputValue(this, '');
          return;
        }
        if (type === 'number' || type === 'range') setInputValue(this, String(n));
        else if (type === 'date') {
          const d = new Date(n);
          setInputValue(this, Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10));
        } else if (type === 'time')
          setInputValue(this, serializeTime(Math.floor(((n % DAY) + DAY) % DAY), legacyTime(this)));
        else if (type === 'month') {
          const y = 1970 + Math.floor(n / 12);
          setInputValue(this, `${pad(y, 4)}-${pad((((n % 12) + 12) % 12) + 1)}`);
        } else if (type === 'week') setInputValue(this, serializeWeek(n));
        else {
          // Out of the Date range: the empty string (jsdom; the standard leaves it undefined).
          const d = new Date(n);
          const t = d.getTime();
          setInputValue(
            this,
            Number.isNaN(t)
              ? ''
              : `${d.toISOString().slice(0, 10)}T${serializeTime(t - Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()), legacyTime(this))}`,
          );
        }
      },
      get valueAsDate() {
        state(this);
        const type = inputType(this);
        if (type !== 'date' && type !== 'time' && type !== 'month' && type !== 'week') return null;
        const n = toNumber(type, inputValue(this), this);
        if (n === null) return null;
        return new Date(type === 'month' ? Date.UTC(1970 + Math.floor(n / 12), n % 12) : n);
      },
      set valueAsDate(v) {
        state(this);
        const type = inputType(this);
        if (type !== 'date' && type !== 'time' && type !== 'month' && type !== 'week')
          throw domError('This input element does not support Date values.', 'InvalidStateError');
        if (v === null) {
          setInputValue(this, '');
          return;
        }
        if (!(v instanceof Date))
          throw new TypeError(
            "Failed to set the 'valueAsDate' property on 'HTMLInputElement': The provided value is not a Date.",
          );
        const t = v.getTime();
        if (Number.isNaN(t)) {
          setInputValue(this, '');
          return;
        }
        if (type === 'month') this.valueAsNumber = (v.getUTCFullYear() - 1970) * 12 + v.getUTCMonth();
        else this.valueAsNumber = type === 'time' ? t % 86400000 : t;
      },
      stepUp(n = 1) {
        stepBy(this, Number(n) | 0, true);
      },
      stepDown(n = 1) {
        stepBy(this, Number(n) | 0, false);
      },
    }),
  ],
  [
    'HTMLTextAreaElement',
    mix(formMember, labelsMember, constraintValidation, selectionMembers, {
      get type() {
        state(this);
        return 'textarea';
      },
      get defaultValue() {
        state(this);
        return childText(this);
      },
      set defaultValue(v) {
        state(this);
        this.textContent = str(v);
      },
      get value() {
        state(this);
        return textareaValue(this);
      },
      set value(v) {
        const s = state(this);
        const old = textareaValue(this);
        s.value = normalizeNewlines(str(v));
        s.dirtyValue = true;
        if (s.value !== old) {
          s.selStart = s.selEnd = s.value.length;
          s.selDir = 'none';
        }
      },
      get textLength() {
        state(this);
        return textareaValue(this).length;
      },
    }),
  ],
  [
    'HTMLSelectElement',
    mix(formMember, labelsMember, constraintValidation, {
      get type() {
        state(this);
        return has(this, 'multiple') ? 'select-multiple' : 'select-one';
      },
      get options() {
        const options = collection(
          this,
          'optionsList',
          'HTMLOptionsCollection',
          () => listOfOptions(this),
          undefined,
          (i, v) => setOption(this, i, v),
        );
        options[S].select = this;
        return options;
      },
      get selectedOptions() {
        return collection(this, 'selectedList', 'HTMLCollection', () => {
          settleSelectedness(this);
          return [...descendants(this)].filter((el) => isTag(el, 'option') && selectedness(el));
        });
      },
      get length() {
        state(this);
        return listOfOptions(this).length;
      },
      set length(v) {
        this.options.length = v;
      },
      get selectedIndex() {
        state(this);
        return selectedIndex(this);
      },
      set selectedIndex(v) {
        state(this);
        settleSelectedness(this);
        const options = listOfOptions(this);
        for (const o of options) o[S].selectedness = false;
        const chosen = options[Number(v) | 0];
        if (chosen) {
          chosen[S].selectedness = true;
          chosen[S].dirtySelected = true;
        }
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
          if (optionValue(o) === value) {
            o[S].selectedness = true;
            o[S].dirtySelected = true;
          } else o[S].selectedness = false;
        }
      },
      item(index) {
        return this.options.item(index);
      },
      namedItem(name) {
        return this.options.namedItem(name);
      },
      // Iterable over its options, as an interface with an indexed getter
      // (WebIDL): Array.prototype.values over the live indexed properties,
      // as in jsdom.
      [Symbol.iterator]: Array.prototype.values,
      add(element, before = undefined) {
        this.options.add(element, before);
      },
      remove(...args) {
        if (args.length > 0) this.options.remove(args[0]);
        else internalsOf(this).protos.Element.remove.call(this);
      },
    }),
  ],
  [
    'HTMLOptionElement',
    {
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
      get value() {
        state(this);
        return optionValue(this);
      },
      set value(v) {
        writeAttribute(this, 'value', String(v));
      },
      get text() {
        state(this);
        return optionText(this);
      },
      set text(v) {
        state(this);
        this.textContent = String(v);
      },
      get label() {
        state(this);
        return attr(this, 'label') ?? optionText(this);
      },
      set label(v) {
        writeAttribute(this, 'label', String(v));
      },
      // The number of options before it in its select's list of options.
      get index() {
        state(this);
        const select = nearestAncestorSelect(this);
        const i = select ? listOfOptions(select).indexOf(this) : -1;
        return i < 0 ? 0 : i;
      },
    },
  ],
  [
    'HTMLButtonElement',
    mix(formMember, labelsMember, constraintValidation, {
      get type() {
        state(this);
        return buttonType(this);
      },
      set type(v) {
        writeAttribute(this, 'type', String(v));
      },
    }),
  ],
  [
    'HTMLFormElement',
    {
      get elements() {
        const list = collection(
          this,
          'elementsList',
          'HTMLFormControlsCollection',
          () => formElements(this),
          FORM_CONTROLS_NAMED,
        );
        return list;
      },
      get length() {
        state(this);
        return formElements(this).length;
      },
      // Iterable over its elements from jsdom 26.1.0, with form[i]
      // (compat.formIndexed; interfaces.js leaves it out before): as jsdom's,
      // Array.prototype.values over the indexed properties, which reads the
      // current length and elements at each step.
      [Symbol.iterator]: Array.prototype.values,
      get action() {
        state(this);
        const a = attr(this, 'action');
        // Missing or empty: the document's URL; else resolved against the
        // document's base URL (a <base> element), as jsdom.
        if (a === undefined || a === '') return internalsOf(this).url.href;
        try {
          return new URL(a, documentBaseURL(this[S].doc)).href;
        } catch {
          return a;
        }
      },
      set action(v) {
        writeAttribute(this, 'action', String(v));
      },
      get method() {
        state(this);
        const m = asciiLowercase(attr(this, 'method') ?? '');
        return m === 'post' || m === 'dialog' ? m : 'get';
      },
      set method(v) {
        writeAttribute(this, 'method', String(v));
      },
      get enctype() {
        state(this);
        const e = asciiLowercase(attr(this, 'enctype') ?? '');
        return e === 'multipart/form-data' || e === 'text/plain' ? e : 'application/x-www-form-urlencoded';
      },
      set enctype(v) {
        writeAttribute(this, 'enctype', String(v));
      },
      get encoding() {
        return this.enctype;
      },
      set encoding(v) {
        this.enctype = v;
      },
      submit() {
        state(this);
        notImplemented(this, "HTMLFormElement's submit() method");
      },
      requestSubmit(submitter = null) {
        state(this);
        if (submitter !== null) {
          if (!submitter?.[S] || !isSubmitButton(submitter))
            throw new TypeError('The specified element is not a submit button');
          if (formOwner(submitter) !== this)
            throw domError('The specified element is not owned by this form element', 'NotFoundError');
        }
        submitForm(this, submitter);
      },
      reset() {
        state(this);
        reset(this);
      },
      checkValidity() {
        state(this);
        return formCheckValidity(this);
      },
      reportValidity() {
        state(this);
        return formCheckValidity(this);
      },
    },
  ],
  [
    'HTMLLabelElement',
    {
      get control() {
        state(this);
        return labelControl(this);
      },
      get form() {
        state(this);
        const control = labelControl(this);
        return control && isListed(control) ? formOwner(control) : null;
      },
    },
  ],
  [
    'HTMLFieldSetElement',
    mix(formMember, constraintValidation, {
      get type() {
        state(this);
        return 'fieldset';
      },
      get elements() {
        return collection(this, 'elementsList', 'HTMLCollection', () =>
          cached(this, 'fieldsetElements', () => [...descendants(this)].filter(isListed)),
        );
      },
    }),
  ],
  [
    'HTMLOutputElement',
    mix(formMember, labelsMember, constraintValidation, {
      get type() {
        state(this);
        return 'output';
      },
      get htmlFor() {
        state(this);
        return tokenList(this, 'for', writeAttribute);
      },
      set htmlFor(v) {
        writeAttribute(this, 'for', String(v));
      },
      get value() {
        state(this);
        return this.textContent;
      },
      set value(v) {
        const s = state(this);
        if (s.defaultOverride == null) s.defaultOverride = this.textContent;
        this.textContent = String(v);
      },
      get defaultValue() {
        state(this);
        return outputDefault(this);
      },
      set defaultValue(v) {
        const s = state(this);
        if (s.defaultOverride == null) this.textContent = String(v);
        else s.defaultOverride = String(v);
      },
    }),
  ],
  ['HTMLObjectElement', mix(formMember, constraintValidation)],
  [
    'HTMLLegendElement',
    {
      get form() {
        state(this);
        const p = this[S].parent;
        return p && isTag(p, 'fieldset') ? formOwner(p) : null;
      },
    },
  ],
]);

// stepUp() and stepDown() (HTML 4.10.5.4), as jsdom (black box, 20.0.3 to
// 30.1.2): nothing happens when min > max, when max - min is less than
// the step, or when the result would move against the method's
// direction (stepDown() below min, stepUp() above max, a negative n); a
// value off the step goes to the next one on it in the method's direction
// (n is not used); a result past min or max goes to the nearest value on
// the step inside them. Exact decimal arithmetic (decimal()).
function stepBy(el, n, up) {
  state(el);
  const type = inputType(el);
  const method = `Failed to invoke '${up ? 'stepUp' : 'stepDown'}' method on 'HTMLInputElement'`;
  if (!DEFAULT_STEP[type])
    throw domError(`${method}: This input element does not support Number values.`, 'InvalidStateError');
  const allowed = allowedStep(el, type);
  if (allowed === null)
    throw domError(`${method}: This input element does not support value step.`, 'InvalidStateError');
  const bounds = type === 'range' ? rangeBounds(el) : null;
  const min = bounds ? bounds.min : toNumber(type, attr(el, 'min') ?? '', el);
  const max = bounds ? bounds.max : toNumber(type, attr(el, 'max') ?? '', el);
  if (min !== null && max !== null && min > max) return;
  // Values on the step are base + k * step (BigInt digits at exponent e).
  const {
    e,
    values: [stepDigits, base, before, lo, hi],
  } = scaled([allowed[0], allowed[2], toNumber(type, inputValue(el), el) ?? 0, min, max]);
  const step = stepDigits * BigInt(allowed[1]);
  const ceilK = (x) => -floorDiv(base - x, step);
  // jsdom (black box, every version): nothing when max - min is less than
  // the step (the standard: when no value between them is on the step).
  if (lo !== null && hi !== null && hi - lo < step) return;
  let next;
  if ((before - base) % step !== 0n)
    next = base + (up ? floorDiv(before - base, step) + 1n : ceilK(before) - 1n) * step;
  else next = before + step * BigInt(up ? n : -n);
  if (lo !== null && next < lo) next = base + ceilK(lo) * step;
  if (hi !== null && next > hi) next = base + floorDiv(hi - base, step) * step;
  if (up ? next < before : next > before) return;
  el.valueAsNumber = decimalNumber(next, e);
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
  // Filtered again only when the form's elements are new (any change to the
  // tree or an attribute makes them new, forms.js cached): iterating reads
  // the items at every step.
  let from = null;
  let radios = null;
  return liveList(state(list).protos.RadioNodeList, () => {
    const all = items(list);
    if (all !== from) {
      from = all;
      radios = all.filter((el) => attr(el, 'id') === key || attr(el, 'name') === key);
    }
    return radios;
  });
}

const FORM_CONTROLS_NAMED = { get: formControlsNamedItem, names: htmlCollectionNames, unenumerable: true };

// Indexed properties (WebIDL legacy platform objects): select[i] is
// select.options[i], with its setter, in every measured jsdom version;
// form[i] is form.elements[i] from jsdom 26.1.0 (compat.formIndexed;
// 26.0.0 has none). No named properties: jsdom has none on forms.
hooks.indexedElement = (element, tag, compat) => {
  if (tag === 'select') return indexedElement(element, listOfOptions, setOption);
  return compat.formIndexed ? indexedElement(element, formElements) : element;
};

// HTMLOptionsCollection's indexed setter (select.options[i] = option).
function setOption(select, index, option) {
  if (option == null) {
    listOfOptions(select)[index]?.remove();
    return;
  }
  if (!option?.[S] || !isTag(option, 'option'))
    throw new TypeError(
      "Failed to set an indexed property on 'HTMLOptionsCollection': parameter 2 is not of type 'HTMLOptionElement'.",
    );
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
      get length() {
        return items(this).length;
      },
      set length(v) {
        const select = state(this).select;
        const options = items(this);
        const n = v >>> 0;
        if (n < options.length) for (const o of options.slice(n)) o.remove();
        else for (let i = options.length; i < n; i++) select.appendChild(select.ownerDocument.createElement('option'));
      },
      ...iterate,
      get selectedIndex() {
        return selectedIndex(state(this).select);
      },
      set selectedIndex(v) {
        state(this).select.selectedIndex = v;
      },
      add(element, before = null) {
        const select = state(this).select;
        if (contains(element, select))
          throw domError('The new element is an ancestor of the select.', 'HierarchyRequestError');
        let ref = before;
        if (typeof before === 'number') ref = items(this)[before] ?? null;
        if (ref !== null && !contains(select, ref))
          throw domError('The reference element is not a descendant of the select.', 'NotFoundError');
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
      namedItem(name) {
        return formControlsNamedItem(this, name);
      },
      ...iterate,
    },
  },
  {
    name: 'RadioNodeList',
    parent: 'NodeList',
    members: {
      get value() {
        for (const el of items(this))
          if (isTag(el, 'input') && inputType(el) === 'radio' && checkedness(el)) return inputValue(el);
        return '';
      },
      set value(v) {
        const value = String(v);
        for (const el of items(this)) {
          if (isTag(el, 'input') && inputType(el) === 'radio' && inputValue(el) === value) {
            el.checked = true;
            return;
          }
        }
      },
      ...iterate,
    },
  },
  {
    name: 'ValidityState',
    members: Object.fromEntries(
      [...VALIDITY_FLAGS, 'valid'].map((flag) => [
        flag,
        {
          get() {
            const flags = validityFlags(state(this).element);
            return flag === 'valid' ? VALIDITY_FLAGS.every((k) => !flags[k]) : !!flags[flag];
          },
        },
      ]),
    ),
  },
];
