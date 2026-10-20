// Event handlers, from the HTML standard (8.1.8): onclick and friends as
// IDL attributes on elements, documents and windows, and as content
// attributes on elements (compiled on first use). Each event handler owns
// one internal listener, added when it first gets a value, so it keeps its
// place among the target's listeners.
import { S, HTML_NS, SVG_NS, ELEMENT_NODE } from './internal.js';
import { attributeSteps } from './attributes.js';
import { addListener, removeListener, cancel, reportError, exposed, eventState } from './events.js';
import { formOwner } from './forms.js';
import { GLOBAL_EVENT_HANDLERS, WINDOW_EVENT_HANDLERS } from './event-handler-names.js';

// The event handler event type: the name without "on", except four
// prefixed animation and transition handlers.
const EVENT_TYPES = {
  onwebkitanimationend: 'webkitAnimationEnd',
  onwebkitanimationiteration: 'webkitAnimationIteration',
  onwebkitanimationstart: 'webkitAnimationStart',
  onwebkittransitionend: 'webkitTransitionEnd',
};
const eventType = (name) => EVENT_TYPES[name] ?? name.slice(2);

const WINDOW_HANDLERS = new Set(WINDOW_EVENT_HANDLERS);

// The event handlers a jsdom version lacks (black box, every release from
// 20.0.0 to 30.1.3, on HTMLElement, SVGElement, Document and the window):
// before 22.1.0 these 19, and on the window onauxclick too; before 27.0.0
// the pointer event handlers. Neither the IDL attribute nor the content
// attribute exists then (<div oncopy> does nothing). Before 22.1.0
// HTMLElement's, SVGElement's and Document's onauxclick is inert (see
// inertHandler).
const HANDLERS_FROM_22_1 = ['onbeforeinput', 'onbeforematch', 'onbeforetoggle', 'oncontextlost', 'oncontextrestored', 'oncopy',
  'oncut', 'onformdata', 'onpaste', 'onscrollend', 'onslotchange', 'ontouchcancel', 'ontouchend', 'ontouchmove', 'ontouchstart',
  'onwebkitanimationend', 'onwebkitanimationiteration', 'onwebkitanimationstart', 'onwebkittransitionend'];
const POINTER_HANDLERS = ['ongotpointercapture', 'onlostpointercapture', 'onpointercancel', 'onpointerdown', 'onpointerenter',
  'onpointerleave', 'onpointermove', 'onpointerout', 'onpointerover', 'onpointerrawupdate', 'onpointerup'];
const LEGACY_INERT = ['onauxclick'];
const LEGACY_ABSENT = new Set([...HANDLERS_FROM_22_1, ...LEGACY_INERT]);
const POINTER = new Set(POINTER_HANDLERS);
// A content attribute that is no event handler in the profile's jsdom.
const absentHandler = (compat, name) => (compat.legacyHandlers && LEGACY_ABSENT.has(name)) || (compat.jsdom < 27 && POINTER.has(name));

// An inert event handler IDL attribute, as jsdom has some (black box): it
// keeps the value assigned (a function or an object, else null; undefined
// until set), its content attribute is ignored and it is never called.
function inertHandler(name) {
  return Object.getOwnPropertyDescriptor({
    get [name]() {
      const s = this?.[S];
      if (!s) throw new TypeError('Illegal invocation');
      return s.inertHandlers?.get(name);
    },
    set [name](value) {
      const s = this?.[S];
      if (!s) throw new TypeError('Illegal invocation');
      const map = s.inertHandlers ?? (s.inertHandlers = new Map());
      map.set(name, typeof value === 'function' || (typeof value === 'object' && value !== null) ? value : null);
    },
  }, name);
}
const INERT = Object.fromEntries(LEGACY_INERT.map((name) => [name, inertHandler(name)]));

// Puts the event handlers of the profile's jsdom on an interface prototype
// with the GlobalEventHandlers members (HTMLElement, SVGElement, Document;
// the window's: forWindow).
export function handlerCompat(proto, compat, forWindow = false) {
  if (compat.legacyHandlers) {
    for (const name of HANDLERS_FROM_22_1) delete proto[name];
    for (const name of LEGACY_INERT) {
      if (forWindow) delete proto[name];
      else Object.defineProperty(proto, name, { ...INERT[name], enumerable: true, configurable: true });
    }
  }
  if (compat.jsdom < 27) for (const name of POINTER_HANDLERS) delete proto[name];
}

// Handlers body and frameset forward to their window.
const WINDOW_REFLECTING_BODY = new Set(['onblur', 'onerror', 'onfocus', 'onload', 'onresize', 'onscroll']);

// An internal raw uncompiled handler: the content attribute's script body.
const RAW = Symbol('raw handler');

const isWindow = (target) => target[S].isWindow === true;
const isBodyOrFrameset = (s) => s.type === ELEMENT_NODE && s.ns === HTML_NS && (s.tag === 'body' || s.tag === 'frameset');
// Before jsdom 28.1.0 an svg element's window event handlers (and the
// handlers body reflects) are its window's, as body's are (black box).
const isForwardingSvg = (s) => s.tag === 'svg' && s.type === ELEMENT_NODE && s.ns === SVG_NS && s.doc[S].window[S].compat.svgWindowHandlers === true;
const forwardsToWindow = (s) => isBodyOrFrameset(s) || isForwardingSvg(s);

// Determining the target of an event handler.
function handlerTarget(target, name) {
  const s = target[S];
  if (!forwardsToWindow(s) || !(WINDOW_HANDLERS.has(name) || WINDOW_REFLECTING_BODY.has(name))) return target;
  return s.doc[S].noView ? null : s.doc[S].window;
}

function handlerEntry(target, name) {
  const s = target[S];
  const map = s.handlers ?? (s.handlers = new Map());
  let entry = map.get(name);
  if (!entry) map.set(name, entry = { value: null, listener: null });
  return entry;
}

function activate(target, name) {
  const entry = handlerEntry(target, name);
  if (entry.listener) return;
  entry.listener = addListener(target, eventType(name), (event) => processHandler(target, name, event));
}

function deactivate(target, name) {
  const entry = target[S].handlers?.get(name);
  if (!entry) return;
  entry.value = null;
  if (entry.listener) {
    removeListener(target, eventType(name), entry.listener);
    entry.listener = null;
  }
}

function setHandler(target, name, value) {
  handlerEntry(target, name).value = value;
  activate(target, name);
}

// Getting the current value of the event handler, compiling a content
// attribute's body on first use.
function currentValue(target, name) {
  const entry = target[S].handlers?.get(name);
  if (!entry) return null;
  if (entry.value && entry.value[RAW] !== undefined) entry.value = compile(target, name, entry.value[RAW]);
  return entry.value;
}

const FORM_ASSOCIATED = new Set(['button', 'fieldset', 'input', 'object', 'output', 'select', 'textarea', 'img']);

// The handler function: a function of (event), or the five onerror
// arguments on a window, whose scope is the element, then its form owner,
// then its document, then the global scope.
function compile(target, name, body) {
  const element = isWindow(target) ? null : target;
  const doc = element ? element[S].doc : target.document;
  if (!doc || doc[S].noView) return null;
  const params = !element && name === 'onerror' ? 'event, source, lineno, colno, error' : 'event';
  const source = `return function ${name}(${params}) {\n${body}\n};`;
  // The with statements give the standard's scope chain. The window comes
  // first: it stands in for the global scope, since it is not the JS global.
  const window = doc[S].window;
  try {
    if (!element) return new Function('__window', `with (__window) { ${source} }`)(window);
    const s = element[S];
    const form = s.ns === HTML_NS && FORM_ASSOCIATED.has(s.tag) ? formOwner(element) : null;
    return new Function('__window', '__document', '__form', '__element',
      `with (__window) with (__document) with (__form) with (__element) { ${source} }`)(
      window, doc, form ?? Object.create(null), element,
    );
  } catch (error) {
    handlerEntry(target, name).value = null;
    reportError(element ?? target, error);
    return null;
  }
}

// The event handler processing algorithm.
function processHandler(target, name, event) {
  const callback = currentValue(target, name);
  if (typeof callback !== 'function') return; // null, or an object that is not callable
  const es = eventState(event);
  const current = es.currentTarget;
  const special = es.type === 'error' && current !== null && isWindow(current) && es.message !== undefined && 'lineno' in es;
  const result = special
    ? callback.call(exposed(current), es.message, es.filename, es.lineno, es.colno, es.error)
    : callback.call(exposed(current), event);
  if (special ? result === true : result === false) cancel(event);
}

// --- IDL attributes -----------------------------------------------------------------------

function idlAttribute(name) {
  return {
    get() {
      if (!this?.[S]) throw new TypeError('Illegal invocation');
      const target = handlerTarget(this, name);
      return target ? currentValue(target, name) : null;
    },
    set(value) {
      if (!this?.[S]) throw new TypeError('Illegal invocation');
      const target = handlerTarget(this, name);
      if (!target) return;
      // [LegacyTreatNonObjectAsNull]
      if (typeof value === 'function' || (typeof value === 'object' && value !== null)) setHandler(target, name, value);
      else deactivate(target, name);
    },
  };
}

export const handlerMembers = (names) => Object.fromEntries(names.map((name) => [name, idlAttribute(name)]));
const members = handlerMembers;

export const GLOBAL_HANDLER_MEMBERS = members(GLOBAL_EVENT_HANDLERS);
export const WINDOW_HANDLER_MEMBERS = members(WINDOW_EVENT_HANDLERS);

// SVGSVGElement's window event handlers: the window's before jsdom 28.1.0;
// from 28.1.0 jsdom keeps the value given and nothing else (undefined
// until set, no content attribute, never called).
function svgWindowHandler(name) {
  const forwarding = idlAttribute(name);
  const inert = inertHandler(name);
  return {
    get() {
      const s = this?.[S];
      if (!s) throw new TypeError('Illegal invocation');
      return isForwardingSvg(s) ? forwarding.get.call(this) : inert.get.call(this);
    },
    set(value) {
      const s = this?.[S];
      if (!s) throw new TypeError('Illegal invocation');
      if (isForwardingSvg(s)) forwarding.set.call(this, value);
      else inert.set.call(this, value);
    },
  };
}
export const SVG_WINDOW_HANDLER_MEMBERS = Object.fromEntries(WINDOW_EVENT_HANDLERS.map((name) => [name, svgWindowHandler(name)]));

// --- content attributes ---------------------------------------------------------------------

const GLOBAL = new Set(GLOBAL_EVENT_HANDLERS);

// Attribute change steps for event handler content attributes of HTML
// (and SVG) elements; body and frameset (and svg before jsdom 28.1.0) also
// have the window's.
function contentAttributeChanged(element, name, value) {
  const s = element[S];
  const applies = (s.ns === HTML_NS || s.ns === SVG_NS) && (GLOBAL.has(name) || (forwardsToWindow(s) && WINDOW_HANDLERS.has(name)));
  if (!applies || absentHandler(s.doc[S].window[S].compat, name)) return;
  const target = handlerTarget(element, name);
  if (!target) return;
  if (value === undefined) deactivate(target, name);
  else setHandler(target, name, { [RAW]: value });
}

for (const name of new Set([...GLOBAL_EVENT_HANDLERS, ...WINDOW_EVENT_HANDLERS])) {
  attributeSteps.set(name, (element, old, value) => contentAttributeChanged(element, name, value));
}

// For attributes set without the attribute write path (parsing, cloning).
export function eventHandlerAttributesAdded(element) {
  for (const [name, value] of element[S].attrs) {
    if (name.startsWith('on')) contentAttributeChanged(element, name, value);
  }
}
