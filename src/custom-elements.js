// Custom elements, from the HTML standard (4.13): CustomElementRegistry,
// the HTML element constructor behind `class X extends HTMLElement`,
// creating and upgrading custom elements, and the lifecycle callbacks.
//
// Element state on the node: ceState ("undefined", "failed",
// "precustomized" or "custom"; absent means "uncustomized"), ceDefinition,
// ceIs and ceReactions (its reaction queue).
//
// Reactions: the standard runs them when the [CEReactions] API that queued
// them returns. Here the tree primitives (insert, remove, attribute writes,
// adoption) and compound operations open a scope; reactions queued inside
// run when the outermost scope ends. Nothing of this runs until something
// is defined: until then hooks.ce is null and the primitives skip it.
import {
  S, state, domError, hooks, ELEMENT_NODE, HTML_NS, nextInTree, connected,
} from './internal.js';
import { reportError } from './events.js';

// --- valid custom element names ---------------------------------------------------

const PCEN = /^[a-z][-.0-9_a-z·À-ÖØ-öø-ͽͿ-῿‌‍‿⁀⁰-↏Ⰰ-⿯、-퟿豈-﷏ﷰ-�\u{10000}-\u{effff}]*$/u;
const RESERVED = new Set(['annotation-xml', 'color-profile', 'font-face', 'font-face-src', 'font-face-uri',
  'font-face-format', 'font-face-name', 'missing-glyph']);

export const isValidCustomElementName = (name) => name.includes('-') && PCEN.test(name) && !RESERVED.has(name);

// --- reactions --------------------------------------------------------------------

const ALREADY_CONSTRUCTED = Symbol('already constructed');

// The element queue of the current scope, and how deep scopes are nested.
const reactions = { depth: 0, queue: [] };

function enqueueElement(element) {
  reactions.queue.push(element);
  // A reaction queued outside any scope (by a define() upgrading, or a
  // callback's own DOM changes) runs right away, as its own scope.
  if (reactions.depth === 0) flush();
}

// Processes queued elements until none are left. Processing counts as a
// scope: reactions queued meanwhile (an upgrade queues its element's
// attributeChanged and connected callbacks) join this loop.
function flush() {
  reactions.depth++;
  try {
    while (reactions.queue.length > 0) {
      const element = reactions.queue.shift();
      const items = element[S].ceReactions;
      while (items && items.length > 0) {
        const reaction = items.shift();
        if (reaction.definition) {
          try { upgrade(element, reaction.definition); } catch (error) { reportError(element, error); }
        } else {
          try { reaction.callback.apply(element, reaction.args); } catch (error) { reportError(element, error); }
        }
      }
    }
  } finally {
    reactions.depth--;
  }
}

// Runs fn inside a reactions scope (hooks.ce.scope).
function scope(fn, a, b, c, d) {
  reactions.depth++;
  try {
    return fn(a, b, c, d);
  } finally {
    if (--reactions.depth === 0 && reactions.queue.length > 0) flush();
  }
}

function enqueueCallback(element, name, args) {
  const es = element[S];
  const definition = es.ceDefinition;
  const callback = definition.callbacks[name];
  if (!callback) return;
  if (name === 'attributeChangedCallback' && !definition.observed.has(args[0])) return;
  (es.ceReactions ?? (es.ceReactions = [])).push({ callback, args });
  enqueueElement(element);
}

function enqueueUpgrade(element, definition) {
  const es = element[S];
  (es.ceReactions ?? (es.ceReactions = [])).push({ definition });
  enqueueElement(element);
}

// --- definitions -------------------------------------------------------------------

// Inert template documents have no browsing context: no definitions apply.
const registryOf = (doc) => (doc[S].inertTemplate === true ? null : doc[S].window?.[S].customElements?.[S] ?? null);

// Look up a custom element definition (HTML namespace only).
export function lookUp(doc, ns, localName, is) {
  if (ns !== HTML_NS) return null;
  const registry = registryOf(doc);
  if (!registry) return null;
  const byName = registry.byName.get(localName);
  if (byName && byName.localName === localName) return byName;
  if (is !== null && is !== undefined) {
    const byIs = registry.byName.get(is);
    if (byIs && byIs.localName === localName) return byIs;
  }
  return null;
}

// --- upgrading -----------------------------------------------------------------------

function upgrade(element, definition) {
  const es = element[S];
  if (es.ceState !== 'undefined' && es.ceState !== undefined) return;
  es.ceDefinition = definition;
  es.ceState = 'failed';
  for (const [name, value] of es.attrs) enqueueCallback(element, 'attributeChangedCallback', [name, null, value, null]);
  if (connected(element)) enqueueCallback(element, 'connectedCallback', []);
  definition.constructionStack.push(element);
  try {
    es.ceState = 'precustomized';
    const result = Reflect.construct(definition.constructor, []);
    if (result !== element) throw new TypeError('The custom element constructor did not produce the element being upgraded.');
  } catch (error) {
    es.ceDefinition = null;
    es.ceReactions = [];
    throw error;
  } finally {
    definition.constructionStack.pop();
  }
  es.ceState = 'custom';
}

function tryUpgrade(element) {
  const es = element[S];
  const definition = lookUp(es.doc, es.ns, es.tag, es.ceIs);
  if (definition) enqueueUpgrade(element, definition);
}

// --- the HTML element constructor -------------------------------------------------------

// [HTMLConstructor]: `new X()` or `super()` inside a custom element class.
export function htmlConstruct(window, activeFunction, newTarget) {
  if (newTarget === undefined || newTarget === activeFunction) throw new TypeError('Illegal constructor');
  const registry = window[S].customElements?.[S];
  const definition = registry?.byConstructor.get(newTarget);
  if (!definition) throw new TypeError('Illegal constructor');
  let isValue = null;
  if (definition.localName === definition.name) {
    if (activeFunction !== window.HTMLElement) throw new TypeError('Illegal constructor: autonomous custom elements must extend HTMLElement.');
  } else {
    isValue = definition.name;
  }
  const stack = definition.constructionStack;
  let prototype = newTarget.prototype;
  if (typeof prototype !== 'object' || prototype === null) prototype = activeFunction.prototype;
  if (stack.length === 0) {
    const internals = window[S];
    const element = internals.createElementNS(HTML_NS, definition.localName, window.document, true);
    Object.setPrototypeOf(element, prototype);
    const es = element[S];
    es.ceState = 'custom';
    es.ceDefinition = definition;
    es.ceIs = isValue;
    return element;
  }
  const element = stack[stack.length - 1];
  if (element === ALREADY_CONSTRUCTED) throw new TypeError('This custom element is already constructed.');
  Object.setPrototypeOf(element, prototype);
  stack[stack.length - 1] = ALREADY_CONSTRUCTED;
  return element;
}

// --- creating elements -----------------------------------------------------------------

// Called for every element created in the HTML namespace: a valid custom
// element name (or an is value) starts "undefined"; with a definition and
// synchronous construction (createElement) the constructor runs now,
// otherwise (parsing, cloning) an upgrade is queued.
export function createCustomElement(doc, localName, is, sync) {
  const definition = lookUp(doc, HTML_NS, localName, is);
  if (!definition) return null;
  const internals = doc[S].window[S];
  if (definition.name !== definition.localName) {
    // A customized built-in element.
    const element = internals.createElementNS(HTML_NS, localName, doc, true);
    element[S].ceState = 'undefined';
    element[S].ceIs = is;
    if (sync) {
      try { upgrade(element, definition); } catch (error) { reportError(element, error); element[S].ceState = 'failed'; }
    } else {
      enqueueUpgrade(element, definition);
    }
    return element;
  }
  if (!sync) {
    const element = internals.createElementNS(HTML_NS, localName, doc, true, internals.protos.HTMLElement);
    element[S].ceState = 'undefined';
    enqueueUpgrade(element, definition);
    return element;
  }
  try {
    const result = Reflect.construct(definition.constructor, []);
    const rs = result?.[S];
    if (!rs || rs.type !== ELEMENT_NODE || rs.ns !== HTML_NS) throw new TypeError('The custom element constructor did not return an HTML element.');
    if (rs.attrs.size > 0 || rs.first || rs.parent || rs.doc !== doc || rs.tag !== localName) {
      throw domError('The custom element constructor returned an element that cannot be used.', 'NotSupportedError');
    }
    return result;
  } catch (error) {
    reportError(doc, error);
    const element = internals.createElementNS(HTML_NS, localName, doc, true, internals.protos.HTMLUnknownElement);
    element[S].ceState = 'failed';
    return element;
  }
}

// --- tree hooks ------------------------------------------------------------------------------

// Elements of a subtree in shadow-including tree order.
function forEachShadowIncluding(root, fn) {
  for (let n = root; n; n = nextInTree(n, root)) {
    const s = n[S];
    if (s.type !== ELEMENT_NODE) continue;
    fn(n);
    if (s.shadowRoot) forEachShadowIncluding(s.shadowRoot, fn);
  }
}

const ceHooks = {
  scope,
  // An element the parser or cloning created (not synchronously
  // constructed): queue its upgrade if it has a definition.
  created(element) {
    const es = element[S];
    if (es.ceState !== 'undefined') return;
    const definition = lookUp(es.doc, es.ns, es.tag, es.ceIs);
    if (definition) enqueueUpgrade(element, definition);
  },
  inserted(node) {
    if (!connected(node)) return;
    forEachShadowIncluding(node, (el) => {
      const s = el[S];
      if (s.ceState === 'custom') enqueueCallback(el, 'connectedCallback', []);
      else if (s.ceState === 'undefined' || s.ceState === undefined) tryUpgrade(el);
    });
  },
  removed(node, wasConnected) {
    if (!wasConnected) return;
    forEachShadowIncluding(node, (el) => {
      if (el[S].ceState === 'custom') enqueueCallback(el, 'disconnectedCallback', []);
    });
  },
  attributeChanged(element, name, oldValue, value) {
    if (element[S].ceState === 'custom') enqueueCallback(element, 'attributeChangedCallback', [name, oldValue ?? null, value ?? null, null]);
  },
  adopted(node, oldDoc, newDoc) {
    forEachShadowIncluding(node, (el) => {
      if (el[S].ceState === 'custom') enqueueCallback(el, 'adoptedCallback', [oldDoc, newDoc]);
    });
  },
};

// --- CustomElementRegistry ---------------------------------------------------------------

const CALLBACKS = ['connectedCallback', 'disconnectedCallback', 'adoptedCallback', 'attributeChangedCallback'];
const FORM_CALLBACKS = ['formAssociatedCallback', 'formResetCallback', 'formDisabledCallback', 'formStateRestoreCallback'];

const isConstructor = (f) => {
  if (typeof f !== 'function') return false;
  try { Reflect.construct(String, [], f); return true; } catch { return false; }
};

export function createRegistry(window) {
  const registry = Object.create(window[S].protos.CustomElementRegistry);
  registry[S] = { window, byName: new Map(), byConstructor: new Map(), whenDefined: new Map(), running: false };
  return registry;
}

const registryState = (self) => {
  const s = state(self);
  if (!s.byName) throw new TypeError('Illegal invocation');
  return s;
};

export const CUSTOM_ELEMENT_INTERFACES = [
  {
    name: 'CustomElementRegistry',
    members: {
      define(name, constructor, options = undefined) {
        const rs = registryState(this);
        if (!isConstructor(constructor)) throw new TypeError("Failed to execute 'define' on 'CustomElementRegistry': The provided callback is not a constructor.");
        const n = String(name);
        if (!isValidCustomElementName(n)) throw domError(`Failed to execute 'define' on 'CustomElementRegistry': "${n}" is not a valid custom element name`, 'SyntaxError');
        if (rs.byName.has(n)) throw domError(`Failed to execute 'define' on 'CustomElementRegistry': the name "${n}" has already been used with this registry`, 'NotSupportedError');
        if (rs.byConstructor.has(constructor)) throw domError("Failed to execute 'define' on 'CustomElementRegistry': this constructor has already been used with this registry", 'NotSupportedError');
        let localName = n;
        const ext = options?.extends ?? null;
        if (ext !== null) {
          const e = String(ext);
          if (isValidCustomElementName(e)) throw domError(`"${e}" is a custom element name and cannot be extended.`, 'NotSupportedError');
          const probe = rs.window[S].createElementNS(HTML_NS, e, rs.window.document, true);
          if (Object.getPrototypeOf(probe) === rs.window[S].protos.HTMLUnknownElement) throw domError(`"${e}" is not an element that can be extended.`, 'NotSupportedError');
          localName = e;
        }
        if (rs.running) throw domError('A custom element is already being defined.', 'NotSupportedError');
        rs.running = true;
        const callbacks = {};
        let observed = new Set();
        let formAssociated = false;
        try {
          const prototype = constructor.prototype;
          if (typeof prototype !== 'object' || prototype === null) throw new TypeError("Failed to execute 'define' on 'CustomElementRegistry': The prototype is not an object.");
          for (const cb of CALLBACKS) {
            const value = prototype[cb];
            if (value !== undefined) {
              if (typeof value !== 'function') throw new TypeError(`Failed to execute 'define' on 'CustomElementRegistry': The '${cb}' property is not a function.`);
              callbacks[cb] = value;
            }
          }
          if (callbacks.attributeChangedCallback) {
            const list = constructor.observedAttributes;
            if (list !== undefined) observed = new Set(Array.from(list, String));
          }
          formAssociated = !!constructor.formAssociated;
          if (formAssociated) {
            for (const cb of FORM_CALLBACKS) if (typeof prototype[cb] === 'function') callbacks[cb] = prototype[cb];
          }
        } finally {
          rs.running = false;
        }
        const definition = { name: n, localName, constructor, observed, callbacks, formAssociated, constructionStack: [] };
        rs.byName.set(n, definition);
        rs.byConstructor.set(constructor, definition);
        hooks.ce = ceHooks;
        // Upgrade matching elements in the document, in shadow-including tree order.
        scope(() => {
          forEachShadowIncluding(rs.window.document, (el) => {
            const s = el[S];
            if (s.ns === HTML_NS && s.tag === localName && (s.ceState === 'undefined') && (n === localName || s.ceIs === n)) enqueueUpgrade(el, definition);
          });
        });
        const pending = rs.whenDefined.get(n);
        if (pending) {
          pending.resolve(constructor);
          rs.whenDefined.delete(n);
        }
      },
      get(name) { return registryState(this).byName.get(String(name))?.constructor; },
      getName(constructor) { return registryState(this).byConstructor.get(constructor)?.name ?? null; },
      whenDefined(name) {
        const rs = registryState(this);
        const n = String(name);
        if (!isValidCustomElementName(n)) return Promise.reject(domError(`"${n}" is not a valid custom element name`, 'SyntaxError'));
        const definition = rs.byName.get(n);
        if (definition) return Promise.resolve(definition.constructor);
        let pending = rs.whenDefined.get(n);
        if (!pending) {
          let resolve;
          const promise = new Promise((r) => { resolve = r; });
          pending = { promise, resolve };
          rs.whenDefined.set(n, pending);
        }
        return pending.promise;
      },
      upgrade(root) {
        registryState(this);
        scope(() => forEachShadowIncluding(state(root) && root, (el) => {
          const s = el[S];
          if (s.ceState === 'undefined' || s.ceState === undefined) {
            const definition = lookUp(s.doc, s.ns, s.tag, s.ceIs);
            if (definition) {
              try { upgrade(el, definition); } catch (error) { reportError(el, error); }
            }
          }
        }));
      },
    },
  },
];
