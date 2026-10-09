// Events: EventTarget with the DOM standard's dispatch (capture, target and
// bubble phases; capture/once/passive/signal options), Event and its common
// subclasses with their init dictionaries, and legacy createEvent/initEvent.
// An exception in a listener is reported as an `error` event on the window
// and dispatch continues, as in browsers and jsdom.
import { S, state, domError, DOCUMENT_NODE } from './internal.js';

// --- EventTarget -------------------------------------------------------------

const listenersOf = (target) => {
  const s = target[S];
  return s.listeners ?? (s.listeners = new Map());
};

function flatten(options) {
  if (typeof options === 'boolean') return { capture: options, once: false, passive: false, signal: undefined };
  const o = options ?? {};
  return { capture: !!o.capture, once: !!o.once, passive: !!o.passive, signal: o.signal };
}

// The parent used for event paths: nodes -> parent node, document -> window.
function eventParent(target) {
  const s = target[S];
  if (!s) return null;
  if (s.type === DOCUMENT_NODE) return s.window ?? null;
  return s.parent ?? null;
}

function reportError(target, error) {
  const window = target[S]?.type === DOCUMENT_NODE ? target[S].window : target[S]?.doc?.[S]?.window ?? target;
  const ErrorEvent = window?.ErrorEvent;
  if (!ErrorEvent) throw error;
  const event = new ErrorEvent('error', { cancelable: true, error, message: String(error?.message ?? error) });
  const handled = !window.dispatchEvent(event);
  if (!handled && window[S]?.onUnhandledError) window[S].onUnhandledError(error);
}

function invoke(event, node, phase) {
  const es = event[S];
  const list = node[S]?.listeners?.get(es.type);
  if (!list) return;
  es.currentTarget = node;
  for (const entry of list.slice()) {
    if (entry.removed) continue;
    if (phase === 'capture' && !entry.capture) continue;
    if (phase === 'bubble' && entry.capture) continue;
    if (entry.once) removeEntry(node, es.type, entry);
    es.inPassiveListener = entry.passive;
    try {
      const cb = entry.callback;
      if (typeof cb === 'function') cb.call(node, event);
      else cb.handleEvent(event);
    } catch (error) {
      reportError(node, error);
    }
    es.inPassiveListener = false;
    if (es.stopImmediate) return;
  }
}

function removeEntry(target, type, entry) {
  const list = target[S]?.listeners?.get(type);
  if (!list) return;
  const i = list.indexOf(entry);
  if (i >= 0) list.splice(i, 1);
  entry.removed = true;
}

export function dispatch(target, event) {
  const es = state(event);
  if (es.dispatching) throw domError('The event is already being dispatched.', 'InvalidStateError');
  if (!es.initialized) throw domError('The event provided is uninitialized.', 'InvalidStateError');
  es.dispatching = true;
  es.target = target;
  es.isTrusted = false;
  const path = [];
  for (let t = target; t; t = eventParent(t)) path.push(t);
  es.path = path;
  try {
    for (let i = path.length - 1; i > 0 && !es.stopped; i--) {
      es.eventPhase = 1;
      invoke(event, path[i], 'capture');
    }
    if (!es.stopped) {
      es.eventPhase = 2;
      invoke(event, target, 'capture');
      if (!es.stopped) invoke(event, target, 'bubble');
    }
    if (es.bubbles) {
      for (let i = 1; i < path.length && !es.stopped; i++) {
        es.eventPhase = 3;
        invoke(event, path[i], 'bubble');
      }
    }
  } finally {
    es.dispatching = false;
    es.eventPhase = 0;
    es.currentTarget = null;
    es.path = [];
    es.stopped = false;
    es.stopImmediate = false;
  }
  return !es.canceled;
}

const eventTarget = {
  addEventListener(type, callback, options) {
    if (callback == null) return;
    const { capture, once, passive, signal } = flatten(options);
    if (signal?.aborted) return;
    const map = listenersOf(this);
    const key = String(type);
    const list = map.get(key) ?? [];
    if (list.some((e) => e.callback === callback && e.capture === capture)) return;
    const entry = { callback, capture, once, passive, removed: false };
    list.push(entry);
    map.set(key, list);
    signal?.addEventListener?.('abort', () => removeEntry(this, key, entry), { once: true });
  },
  removeEventListener(type, callback, options) {
    const { capture } = flatten(options);
    const list = this[S]?.listeners?.get(String(type));
    const entry = list?.find((e) => e.callback === callback && e.capture === capture);
    if (entry) removeEntry(this, String(type), entry);
  },
  dispatchEvent(event) { return dispatch(this, event); },
};

// --- Event and subclasses -----------------------------------------------------

const PHASES = { NONE: 0, CAPTURING_PHASE: 1, AT_TARGET: 2, BUBBLING_PHASE: 3 };
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

function initEventState(self, type, init, initialized = true) {
  self[S] = {
    type: String(type), bubbles: !!init.bubbles, cancelable: !!init.cancelable, composed: !!init.composed,
    target: null, currentTarget: null, eventPhase: 0, canceled: false, stopped: false, stopImmediate: false,
    dispatching: false, initialized, isTrusted: false, inPassiveListener: false, timeStamp: now(), path: [],
  };
}

// Builds a constructor body for an event interface: validates the type
// argument, sets the base state, then copies the subclass's init fields.
function eventConstruct(name, fields = {}) {
  return (w, self, [type, init]) => {
    if (type === undefined) throw new TypeError(`Failed to construct '${name}': 1 argument required, but only 0 present.`);
    const dict = init ?? {};
    initEventState(self, type, dict);
    for (const [key, fallback] of Object.entries(fields)) self[S][key] = dict[key] ?? fallback;
    return self;
  };
}

// Read-only accessors for init fields.
const fieldGetters = (fields) => Object.fromEntries(Object.keys(fields).map((key) => [key, { get() { return state(this)[key]; } }]));

const MODIFIERS = { Control: 'ctrlKey', Shift: 'shiftKey', Alt: 'altKey', Meta: 'metaKey' };
const modifierState = { getModifierState(key) { const field = MODIFIERS[key]; return field ? !!state(this)[field] : false; } };

const UI_FIELDS = { view: null, detail: 0, which: 0 };
const MODIFIER_FIELDS = { ctrlKey: false, shiftKey: false, altKey: false, metaKey: false };
const MOUSE_FIELDS = {
  ...UI_FIELDS, ...MODIFIER_FIELDS, screenX: 0, screenY: 0, clientX: 0, clientY: 0,
  button: 0, buttons: 0, relatedTarget: null, movementX: 0, movementY: 0,
};
const POINTER_FIELDS = {
  ...MOUSE_FIELDS, pointerId: 0, width: 1, height: 1, pressure: 0, tangentialPressure: 0,
  tiltX: 0, tiltY: 0, twist: 0, altitudeAngle: Math.PI / 2, azimuthAngle: 0, pointerType: '', isPrimary: false,
};
const KEYBOARD_FIELDS = {
  ...UI_FIELDS, ...MODIFIER_FIELDS, key: '', code: '', location: 0, repeat: false, isComposing: false,
  charCode: 0, keyCode: 0,
};
const FOCUS_FIELDS = { ...UI_FIELDS, relatedTarget: null };
const INPUT_FIELDS = { ...UI_FIELDS, data: null, inputType: '', isComposing: false, dataTransfer: null };
const WHEEL_FIELDS = { ...MOUSE_FIELDS, deltaX: 0, deltaY: 0, deltaZ: 0, deltaMode: 0 };
const ERROR_FIELDS = { message: '', filename: '', lineno: 0, colno: 0, error: undefined };

const own = (fields, parentFields) => Object.fromEntries(Object.entries(fields).filter(([k]) => !(k in parentFields)));
const MOUSE_OWN = own(MOUSE_FIELDS, UI_FIELDS);

export const EVENT_INTERFACES = [
  { name: 'EventTarget', members: eventTarget, construct: (w, self) => { self[S] = {}; return self; } },
  {
    name: 'Event',
    statics: PHASES,
    construct: eventConstruct('Event'),
    members: {
      ...Object.fromEntries(Object.entries(PHASES).map(([k, v]) => [k, { constant: v }])),
      get type() { return state(this).type; },
      get target() { return state(this).target; },
      get srcElement() { return state(this).target; },
      get currentTarget() { return state(this).currentTarget; },
      get eventPhase() { return state(this).eventPhase; },
      get bubbles() { return state(this).bubbles; },
      get cancelable() { return state(this).cancelable; },
      get composed() { return state(this).composed; },
      get defaultPrevented() { return state(this).canceled; },
      get returnValue() { return !state(this).canceled; },
      set returnValue(v) { if (!v) this.preventDefault(); },
      get cancelBubble() { return state(this).stopped; },
      set cancelBubble(v) { if (v) state(this).stopped = true; },
      get isTrusted() { return state(this).isTrusted; },
      get timeStamp() { return state(this).timeStamp; },
      composedPath() { return state(this).path.slice(); },
      preventDefault() { const s = state(this); if (s.cancelable && !s.inPassiveListener) s.canceled = true; },
      stopPropagation() { state(this).stopped = true; },
      stopImmediatePropagation() { const s = state(this); s.stopped = true; s.stopImmediate = true; },
      initEvent(type, bubbles = false, cancelable = false) {
        const s = state(this);
        if (s.dispatching) return;
        Object.assign(s, { type: String(type), bubbles: !!bubbles, cancelable: !!cancelable, initialized: true, canceled: false, stopped: false, stopImmediate: false, target: null });
      },
    },
  },
  { name: 'CustomEvent', parent: 'Event', construct: eventConstruct('CustomEvent', { detail: null }), members: {
    get detail() { return state(this).detail; },
    initCustomEvent(type, bubbles, cancelable, detail) { this.initEvent(type, bubbles, cancelable); state(this).detail = detail ?? null; },
  } },
  { name: 'UIEvent', parent: 'Event', construct: eventConstruct('UIEvent', UI_FIELDS), members: fieldGetters(UI_FIELDS) },
  { name: 'MouseEvent', parent: 'UIEvent', construct: eventConstruct('MouseEvent', MOUSE_FIELDS), members: {
    ...fieldGetters(MOUSE_OWN), ...modifierState,
    get pageX() { return state(this).clientX; },
    get pageY() { return state(this).clientY; },
    get x() { return state(this).clientX; },
    get y() { return state(this).clientY; },
    get offsetX() { state(this); return 0; },
    get offsetY() { state(this); return 0; },
  } },
  { name: 'PointerEvent', parent: 'MouseEvent', construct: eventConstruct('PointerEvent', POINTER_FIELDS), members: {
    ...fieldGetters(own(POINTER_FIELDS, MOUSE_FIELDS)),
    getCoalescedEvents() { return []; },
    getPredictedEvents() { return []; },
  } },
  { name: 'WheelEvent', parent: 'MouseEvent', statics: { DOM_DELTA_PIXEL: 0, DOM_DELTA_LINE: 1, DOM_DELTA_PAGE: 2 },
    construct: eventConstruct('WheelEvent', WHEEL_FIELDS), members: fieldGetters(own(WHEEL_FIELDS, MOUSE_FIELDS)) },
  { name: 'KeyboardEvent', parent: 'UIEvent', statics: { DOM_KEY_LOCATION_STANDARD: 0, DOM_KEY_LOCATION_LEFT: 1, DOM_KEY_LOCATION_RIGHT: 2, DOM_KEY_LOCATION_NUMPAD: 3 },
    construct: eventConstruct('KeyboardEvent', KEYBOARD_FIELDS), members: { ...fieldGetters(own(KEYBOARD_FIELDS, UI_FIELDS)), ...modifierState } },
  { name: 'FocusEvent', parent: 'UIEvent', construct: eventConstruct('FocusEvent', FOCUS_FIELDS), members: fieldGetters(own(FOCUS_FIELDS, UI_FIELDS)) },
  { name: 'InputEvent', parent: 'UIEvent', construct: eventConstruct('InputEvent', INPUT_FIELDS), members: {
    ...fieldGetters(own(INPUT_FIELDS, UI_FIELDS)),
    getTargetRanges() { return []; },
  } },
  { name: 'ErrorEvent', parent: 'Event', construct: eventConstruct('ErrorEvent', ERROR_FIELDS), members: fieldGetters(ERROR_FIELDS) },
];

// document.createEvent(interface): an uninitialized event of that interface.
const LEGACY_EVENT_NAMES = {
  event: 'Event', events: 'Event', htmlevents: 'Event', customevent: 'CustomEvent', uievent: 'UIEvent', uievents: 'UIEvent',
  mouseevent: 'MouseEvent', mouseevents: 'MouseEvent', keyboardevent: 'KeyboardEvent', focusevent: 'FocusEvent',
  inputevent: 'InputEvent', wheelevent: 'WheelEvent', pointerevent: 'PointerEvent', errorevent: 'ErrorEvent',
};

export function createEvent(window, name) {
  const iface = LEGACY_EVENT_NAMES[String(name).toLowerCase()];
  if (!iface) throw domError(`The provided event type ("${name}") is invalid.`, 'NotSupportedError');
  const event = new window[iface]('');
  event[S].initialized = false;
  return event;
}
