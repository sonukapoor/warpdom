// Events: EventTarget with the DOM standard's dispatch (capture, target and
// bubble phases; capture/once/passive/signal options), Event and its common
// subclasses with their init dictionaries, and legacy createEvent/initEvent.
// An exception in a listener is reported as an `error` event on the window
// and dispatch continues, as in browsers and jsdom.
import { S, state, domError, DOCUMENT_NODE, hooks } from './internal.js';
import { liveList } from './collections.js';

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

// --- shadow trees -------------------------------------------------------------------

const isNode = (t) => t?.[S]?.type !== undefined;
const rootOf = (node) => { let n = node; while (n[S].parent) n = n[S].parent; return n; };
const isShadowRoot = (node) => node[S].shadow === true;

// A is a shadow-including inclusive ancestor of B.
function shadowIncludingInclusiveAncestor(a, b) {
  for (let n = b; n;) {
    if (n === a) return true;
    const s = n[S];
    n = s.parent ?? (s.shadow ? s.host : null);
  }
  return false;
}

// Retargeting A against B: A, or the host of the shadow tree hiding A from B.
export function retarget(a, b) {
  for (let target = a; ;) {
    if (!isNode(target)) return target;
    const root = rootOf(target);
    if (!isShadowRoot(root)) return target;
    if (isNode(b) && shadowIncludingInclusiveAncestor(root, b)) return target;
    target = root[S].host;
  }
}

// Get the parent: a node's parent, a shadow root's host (unless the event
// is not composed and started in that shadow tree), a document's window.
function getTheParent(target, event) {
  const s = target[S];
  if (!s || s.type === undefined) return null; // windows and plain EventTargets
  if (s.type === DOCUMENT_NODE) return event[S].type === 'load' || s.noView ? null : s.window ?? null;
  if (s.shadow) {
    const first = event[S].path[0].target;
    return !event[S].composed && isNode(first) && rootOf(first) === target ? null : s.host;
  }
  return s.parent;
}

export function reportError(target, error) {
  const window = target[S]?.type === DOCUMENT_NODE ? target[S].window : target[S]?.doc?.[S]?.window ?? target;
  const ErrorEvent = window?.ErrorEvent;
  if (!ErrorEvent) throw error;
  const event = new ErrorEvent('error', { cancelable: true, error, message: String(error?.message ?? error) });
  const handled = !window.dispatchEvent(event);
  if (!handled && window[S]?.onUnhandledError) window[S].onUnhandledError(error);
}

// Invoke the listeners of a path item for a phase ("capturing" or "bubbling").
function invoke(event, index, phase) {
  const es = event[S];
  const item = es.path[index];
  es.target = item.eventTarget;
  es.relatedTarget = item.relatedTarget;
  if (es.stopped) return;
  const node = item.target;
  es.currentTarget = node;
  const list = node[S]?.listeners?.get(es.type);
  if (!list) return;
  // The window's current event (window.event) while these listeners run:
  // the event, or undefined for a target in a shadow tree; restored after.
  const window = windowOf(node);
  let previous;
  if (window !== null) {
    if (item.inShadowTree === undefined) item.inShadowTree = inShadowTree(node);
    previous = window[S].currentEvent;
    window[S].currentEvent = item.inShadowTree ? undefined : event;
  }
  try {
    invokeListeners(node, event, es, list, phase);
  } finally {
    if (window !== null) window[S].currentEvent = previous;
  }
}

// The window of a node's document (null without a browsing context), or the
// window itself.
function windowOf(target) {
  const s = target[S];
  if (s === undefined) return null;
  if (s.isWindow === true) return target;
  const doc = s.type === DOCUMENT_NODE ? target : s.doc;
  if (doc === undefined) return null;
  return doc[S].noView ? null : doc[S].window ?? null;
}

function invokeListeners(node, event, es, list, phase) {
  for (const entry of list.slice()) {
    if (entry.removed) continue;
    if (phase === 'capturing' && !entry.capture) continue;
    if (phase === 'bubbling' && entry.capture) continue;
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

function appendToPath(path, target, shadowTarget, relatedTarget, slotInClosedTree) {
  const s = target[S];
  path.push({
    target,
    shadowTarget,
    eventTarget: null,
    relatedTarget,
    rootOfClosedTree: s?.shadow === true && s.mode === 'closed',
    slotInClosedTree,
    inShadowTree: undefined, // computed when listeners run (invoke)
  });
}

const inShadowTree = (t) => isNode(t) && isShadowRoot(rootOf(t));

// Dispatch (DOM standard 2.9), including activation behavior for clicks.
export function dispatch(target, event) {
  const es = state(event);
  if (es.dispatching) throw domError('The event is already being dispatched.', 'InvalidStateError');
  if (!es.initialized) throw domError('The event provided is uninitialized.', 'InvalidStateError');
  es.dispatching = true;
  es.isTrusted = false;
  const originalRelated = es.relatedTarget ?? null;
  const path = [];
  es.path = path;
  let activation = null;
  let clearTargets = false;
  const isActivationEvent = es.type === 'click' && 'clientX' in es && hooks.activation !== null;
  try {
    let relatedTarget = retarget(originalRelated, target);
    if (target !== relatedTarget || target === originalRelated) {
      appendToPath(path, target, target, relatedTarget, false);
      if (isActivationEvent) activation = hooks.activation(target);
      let current = target;
      // The root of current's tree, while it may be a shadow root (computed
      // only when shadow roots are involved; light-tree paths skip it).
      let currentRoot = isNode(target) ? rootOf(target) : null;
      let parent = getTheParent(target, event);
      while (parent) {
        if (originalRelated !== null) relatedTarget = retarget(originalRelated, parent);
        const inCurrentTree = parent[S]?.isWindow || (isNode(parent) && currentRoot !== null
          && (!isShadowRoot(currentRoot) || shadowIncludingInclusiveAncestor(currentRoot, parent)));
        if (inCurrentTree) {
          if (isActivationEvent && es.bubbles && !activation) activation = hooks.activation(parent);
          appendToPath(path, parent, null, relatedTarget, false);
        } else if (parent === relatedTarget) {
          parent = null;
        } else {
          current = parent;
          currentRoot = isNode(current) ? rootOf(current) : null;
          if (isActivationEvent && !activation) activation = hooks.activation(current);
          appendToPath(path, parent, current, relatedTarget, false);
        }
        if (parent) parent = getTheParent(parent, event);
      }
      // Each item's event target: the shadow-adjusted target of the nearest
      // item at or before it.
      let clearItem = null;
      for (const item of path) {
        if (item.shadowTarget !== null) clearItem = item;
        item.eventTarget = clearItem.shadowTarget;
      }
      clearTargets = inShadowTree(clearItem.shadowTarget) || inShadowTree(clearItem.relatedTarget);
      activation?.pre?.();
      for (let i = path.length - 1; i >= 0; i--) {
        es.eventPhase = path[i].shadowTarget !== null ? 2 : 1;
        invoke(event, i, 'capturing');
      }
      for (let i = 0; i < path.length; i++) {
        if (path[i].shadowTarget !== null) es.eventPhase = 2;
        else {
          if (!es.bubbles) continue;
          es.eventPhase = 3;
        }
        invoke(event, i, 'bubbling');
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
  if (clearTargets) {
    es.target = null;
    es.relatedTarget = null;
  }
  if (activation) {
    if (!es.canceled) activation.run(event);
    else activation.cancel?.();
  }
  return !es.canceled;
}

// composedPath(): the path, without targets in closed shadow trees the
// current target cannot see.
function composedPath(event) {
  const es = event[S];
  const path = es.path;
  if (path.length === 0) return [];
  const currentTarget = es.currentTarget;
  const out = [currentTarget];
  let currentIndex = 0;
  let hiddenLevel = 0;
  for (let i = path.length - 1; i >= 0; i--) {
    if (path[i].rootOfClosedTree) hiddenLevel++;
    if (path[i].target === currentTarget) { currentIndex = i; break; }
    if (path[i].slotInClosedTree) hiddenLevel--;
  }
  let level = hiddenLevel;
  let max = hiddenLevel;
  for (let i = currentIndex - 1; i >= 0; i--) {
    if (path[i].rootOfClosedTree) level++;
    if (level <= max) out.unshift(path[i].target);
    if (path[i].slotInClosedTree) {
      level--;
      if (level < max) max = level;
    }
  }
  level = hiddenLevel;
  max = hiddenLevel;
  for (let i = currentIndex + 1; i < path.length; i++) {
    if (path[i].slotInClosedTree) level++;
    if (level <= max) out.push(path[i].target);
    if (path[i].rootOfClosedTree) {
      level--;
      if (level < max) max = level;
    }
  }
  return out;
}

// Internal listener registration (event handlers use these, not the public
// methods, which tests may replace).
export function addListener(target, type, callback) {
  const map = listenersOf(target);
  const list = map.get(type) ?? [];
  const entry = { callback, capture: false, once: false, passive: false, removed: false };
  list.push(entry);
  map.set(type, list);
  return entry;
}

export const removeListener = (target, type, entry) => removeEntry(target, type, entry);

// Set the canceled flag, as preventDefault() does.
export function cancel(event) {
  const s = event[S];
  if (s.cancelable && !s.inPassiveListener) s.canceled = true;
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
export function eventConstruct(name, fields = {}) {
  const entries = Object.entries(fields);
  return (w, self, [type, init]) => {
    if (type === undefined) throw new TypeError(`Failed to construct '${name}': 1 argument required, but only 0 present.`);
    const dict = init ?? {};
    initEventState(self, type, dict);
    const es = self[S];
    for (let i = 0; i < entries.length; i++) {
      const key = entries[i][0];
      es[key] = dict[key] ?? entries[i][1];
    }
    return self;
  };
}

// Read-only accessors for init fields.
export const fieldGetters = (fields) => Object.fromEntries(Object.keys(fields).map((key) => [key, { get() { return state(this)[key]; } }]));

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

// TouchEvent (Touch Events): modifier keys and three touch lists. The
// lists take any objects, as in jsdom: there is no Touch constructor, so
// tests polyfill Touch with their own class.
const TOUCH_FIELDS = { ...UI_FIELDS, ...MODIFIER_FIELDS };
const TOUCH_LISTS = ['touches', 'targetTouches', 'changedTouches'];
const touchEventFields = eventConstruct('TouchEvent', TOUCH_FIELDS);

function constructTouchEvent(w, self, args) {
  touchEventFields(w, self, args);
  const dict = args[1] ?? {};
  const es = self[S];
  for (const key of TOUCH_LISTS) {
    const value = dict[key];
    if (value !== undefined && (value === null || typeof value[Symbol.iterator] !== 'function')) {
      throw new TypeError(`Failed to construct 'TouchEvent': parameter 2 has member '${key}' that is not an iterable object.`);
    }
    const touches = value === undefined ? [] : Array.from(value);
    es[key] = liveList(w[S].protos.TouchList, () => touches);
  }
  return self;
}

const touchListGetters = Object.fromEntries(TOUCH_LISTS.map((key) => [key, { get() { return state(this)[key]; } }]));

// MessageEvent: source is not checked to be a window or port (as in
// jsdom: tests pass stand-ins); ports is a copy of the given sequence.
const MESSAGE_FIELDS = { data: null, origin: '', lastEventId: '', source: null, ports: null };
const messageEventFields = eventConstruct('MessageEvent', MESSAGE_FIELDS);
function constructMessageEvent(w, self, args) {
  messageEventFields(w, self, args);
  const ports = args[1]?.ports;
  self[S].ports = ports == null ? [] : Array.from(ports);
  return self;
}

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
      composedPath() { state(this); return composedPath(this); },
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
  { name: 'TouchEvent', parent: 'UIEvent', construct: constructTouchEvent, members: {
    ...fieldGetters(own(TOUCH_FIELDS, UI_FIELDS)), ...touchListGetters, ...modifierState,
  } },
  { name: 'FocusEvent', parent: 'UIEvent', construct: eventConstruct('FocusEvent', FOCUS_FIELDS), members: fieldGetters(own(FOCUS_FIELDS, UI_FIELDS)) },
  { name: 'InputEvent', parent: 'UIEvent', construct: eventConstruct('InputEvent', INPUT_FIELDS), members: {
    ...fieldGetters(own(INPUT_FIELDS, UI_FIELDS)),
    getTargetRanges() { return []; },
  } },
  { name: 'MessageEvent', parent: 'Event', construct: constructMessageEvent, members: {
    ...fieldGetters(own(MESSAGE_FIELDS, { ports: null })),
    get ports() { return state(this).ports; },
  } },
  { name: 'ToggleEvent', parent: 'Event', construct: eventConstruct('ToggleEvent', { oldState: '', newState: '' }), members: fieldGetters({ oldState: '', newState: '' }) },
  { name: 'PopStateEvent', parent: 'Event', construct: eventConstruct('PopStateEvent', { state: null }), members: fieldGetters({ state: null }) },
  { name: 'HashChangeEvent', parent: 'Event', construct: eventConstruct('HashChangeEvent', { oldURL: '', newURL: '' }), members: fieldGetters({ oldURL: '', newURL: '' }) },
  { name: 'SubmitEvent', parent: 'Event', construct: eventConstruct('SubmitEvent', { submitter: null }), members: fieldGetters({ submitter: null }) },
  { name: 'ErrorEvent', parent: 'Event', construct: eventConstruct('ErrorEvent', ERROR_FIELDS), members: fieldGetters(ERROR_FIELDS) },
];

// document.createEvent(interface): an uninitialized event of that interface.
const LEGACY_EVENT_NAMES = {
  event: 'Event', events: 'Event', htmlevents: 'Event', customevent: 'CustomEvent', uievent: 'UIEvent', uievents: 'UIEvent',
  mouseevent: 'MouseEvent', mouseevents: 'MouseEvent', keyboardevent: 'KeyboardEvent', focusevent: 'FocusEvent',
  inputevent: 'InputEvent', wheelevent: 'WheelEvent', pointerevent: 'PointerEvent', errorevent: 'ErrorEvent',
  touchevent: 'TouchEvent',
};

export function createEvent(window, name) {
  const iface = LEGACY_EVENT_NAMES[String(name).toLowerCase()];
  if (!iface) throw domError(`The provided event type ("${name}") is invalid.`, 'NotSupportedError');
  const event = new window[iface]('');
  event[S].initialized = false;
  return event;
}
