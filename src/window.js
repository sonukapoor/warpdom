// createWindow(): a fresh window with its own prototypes and constructors for
// every interface (so patches made in one window cannot leak into another),
// built from property descriptors that are prepared once per module load,
// each interface's the first time any window creates it.
import {
  S,
  HIDDEN_STATE,
  hooks,
  initNode,
  insert,
  ELEMENT_NODE,
  TEXT_NODE,
  COMMENT_NODE,
  DOCUMENT_NODE,
  DOCUMENT_FRAGMENT_NODE,
  DOCUMENT_TYPE_NODE,
  CDATA_SECTION_NODE,
  PROCESSING_INSTRUCTION_NODE,
  lazyDataSetter,
  assignThrough,
  lockedRead,
  lockedWrite,
} from './internal.js';
import { INTERFACES, SVG_ELEMENTS, LEGACY_SVG_ELEMENTS, SVG_TYPES_INTERFACES, HTML_NS, SVG_NS } from './interfaces.js';
import { HTML_ELEMENTS, PLAIN_TAGS } from './html-elements.js';
import { setupWindow, profileCompat, setupWindowData } from './window-features.js';
import { setValidationMode } from './css.js';
import { namedPropertiesObject, namedAccessPrototype } from './named-access.js';
import './document-named.js';
import { xpathException } from './dom-parsing.js';
import { iterate, listLengthGetter } from './collections.js';
import { createCustomElement, createRegistry, htmlConstruct, isValidCustomElementName } from './custom-elements.js';

// Once per module load: the interfaces in order, parents before children.
const ORDER = [];
const BY_NAME = new Map(); // interface name -> definition
{
  const byName = new Map(INTERFACES.map((i) => [i.name, i]));
  const visit = (iface) => {
    if (BY_NAME.has(iface.name)) return;
    if (iface.parent) visit(byName.get(iface.parent));
    ORDER.push(iface);
    BY_NAME.set(iface.name, iface);
  };
  for (const iface of INTERFACES) visit(iface);
}

// An interface's property descriptors, built the first time a window
// creates it (a test touches a few dozen of about 300 interfaces) and then
// shared by every window. Members are an object, or a list of objects
// merged in order (mixins; a later member replaces an earlier one in its
// place), where a function stands for the object it builds (reflected
// attributes). An interface may also build its descriptors itself
// (CSSStyleProperties' accessors). Kept as parallel lists of keys and
// descriptors: defining them one by one is faster than
// Object.defineProperties (about 30% for CSSStyleProperties).
const DESCRIPTORS = new Map(); // interface name (and variant) -> { keys, descriptors }
// variant: a key for interfaces whose members depend on the profile
// (iface.variant: CSSStyleProperties' accessors, the event handlers of a
// jsdom version), else null. An interface built from members changes its
// descriptors for a variant with iface.adjust(descriptors, variant), once
// per module load, rather than each window deleting members (or returns
// other descriptors to use).
function descriptorsOf(iface, variant = null) {
  const cacheKey = variant === null ? iface.name : `${iface.name} ${variant}`;
  let table = DESCRIPTORS.get(cacheKey);
  if (table) return table;
  let descriptors;
  if (iface.descriptors) {
    descriptors = iface.descriptors(variant);
  } else {
    // Without a prototype: V8 keeps it as a dictionary rather than building
    // a hidden class per key.
    descriptors = Object.create(null);
    const { members } = iface;
    if (Array.isArray(members)) for (const m of members) addDescriptors(descriptors, typeof m === 'function' ? m() : m);
    else addDescriptors(descriptors, members);
    if (variant !== null && iface.adjust) descriptors = iface.adjust(descriptors, variant) ?? descriptors;
  }
  // A list interface's length getter: its iteration functions use their
  // cached items while it is the length they find (collections.js).
  if (descriptors[Symbol.iterator]?.value === iterate[Symbol.iterator] && descriptors.length?.get)
    listLengthGetter(descriptors.length.get);
  const keys = Reflect.ownKeys(descriptors);
  table = { keys, descriptors: keys.map((key) => descriptors[key]), unscopables: null };
  // The @@unscopables descriptor is left out of the shared list: each
  // window gets its own object.
  const i = keys.indexOf(Symbol.unscopables);
  if (i !== -1 && descriptors[Symbol.unscopables].unscopables) {
    table.unscopables = descriptors[Symbol.unscopables].value;
    keys.splice(i, 1);
    table.descriptors.splice(i, 1);
  }
  DESCRIPTORS.set(cacheKey, table);
  return table;
}

function addDescriptors(descriptors, members) {
  for (const key of Reflect.ownKeys(members)) {
    const d = Object.getOwnPropertyDescriptor(members, key);
    const v = d.value;
    if (v && typeof v === 'object' && 'unscopables' in v) {
      // @@unscopables (WebIDL): a null-prototype object whose properties are
      // writable; made per window (see unscopablesOf).
      descriptors[key] = {
        value: v.unscopables,
        enumerable: false,
        writable: false,
        configurable: true,
        unscopables: true,
      };
    } else if (v && typeof v === 'object' && 'constant' in v) {
      // Constants such as Node.ELEMENT_NODE: read-only, as in WebIDL.
      descriptors[key] = { value: v.constant, enumerable: true, writable: false, configurable: false };
    } else if (v && typeof v === 'object' && (v.get || v.set)) {
      // Accessors given as { get, set } objects (from helpers).
      descriptors[key] = { get: v.get, set: v.set, enumerable: true, configurable: true };
    } else if (d.get || d.set) {
      descriptors[key] = { get: d.get, set: d.set, enumerable: true, configurable: true };
    } else {
      // Symbol-keyed operations (@@iterator) are not enumerable (WebIDL).
      descriptors[key] = { value: v, writable: true, enumerable: typeof key !== 'symbol', configurable: true };
    }
  }
}

// Interfaces whose objects keep their state in a private field (see
// hiddenSlot in internal.js): every root interface and every direct
// EventTarget subclass, except nodes and the window (own property), and the
// interfaces whose objects are proxies (their traps get the state from the
// target and hide the key; a private field is not reachable through a proxy).
// An interface may bring its own slot (Event, DOMRectReadOnly).
const STATE_ON_OBJECT = new Set([
  'EventTarget',
  'Node',
  'Window',
  'Storage',
  'DOMStringMap',
  'NodeList',
  'HTMLCollection',
  'NamedNodeMap',
  'DOMTokenList',
  'CSSRuleList',
  'MediaList',
  'StyleSheetList',
  'FileList',
  'SVGStringList',
  'Plugin',
  'MimeType',
  'PluginArray',
  'MimeTypeArray',
]);
const hidesState = (iface) => (!iface.parent || iface.parent === 'EventTarget') && !STATE_ON_OBJECT.has(iface.name);

// Interfaces with the HTML element constructor: HTMLElement and its element interfaces.
const HTML_CONSTRUCTOR = new Set(['HTMLElement', ...HTML_ELEMENTS.map(([name]) => name)]);

const TAG_INTERFACE = new Map();
for (const [name, , tags] of HTML_ELEMENTS) for (const tag of tags) TAG_INTERFACE.set(tag, name);
for (const tag of PLAIN_TAGS) TAG_INTERFACE.set(tag, 'HTMLElement');

function interfaceFor(ns, tag, compat) {
  if (ns === HTML_NS) {
    // Local names are compared case-sensitively (createElementNS(HTML_NS,
    // 'SPAN') is an HTMLUnknownElement); createElement lowercases first.
    // Valid custom element names (contain a hyphen) create HTMLElement.
    return TAG_INTERFACE.get(tag) ?? (tag.includes('-') ? 'HTMLElement' : 'HTMLUnknownElement');
  }
  if (ns === SVG_NS) return (compat.svgTypes ? SVG_ELEMENTS : LEGACY_SVG_ELEMENTS).get(tag) ?? 'SVGElement';
  return 'Element';
}

// Window is a [Global] interface (WebIDL 3.7.6): its operations are own
// properties of the window, and called without a this value (const
// { getComputedStyle } = iframe.contentWindow) they act on that window.
function installGlobalOperations(window, proto) {
  for (const name of Object.getOwnPropertyNames(proto)) {
    if (name === 'constructor') continue;
    const { value } = Object.getOwnPropertyDescriptor(proto, name);
    if (typeof value !== 'function') continue;
    const operation = {
      [name](...args) {
        return value.apply(this ?? window, args);
      },
    }[name];
    Object.defineProperty(operation, 'length', { value: value.length });
    Object.defineProperty(window, name, { value: operation, writable: true, enumerable: true, configurable: true });
  }
}

const DEVICE_AND_MEDIA_EVENTS = [
  'PromiseRejectionEvent',
  'BlobEvent',
  'DeviceMotionEvent',
  'DeviceOrientationEvent',
  'DeviceMotionEventAcceleration',
  'DeviceMotionEventRotationRate',
];

// Interfaces and members a jsdom generation did not have yet, removed from
// this window (its prototypes are its own). Libraries feature-detect them:
// react-aria listens for pointer events only when PointerEvent exists, so
// tests written for jsdom before 27 fire mouse events only.
function applyCompat(window, protos) {
  const { jsdom } = window[S].compat;
  // The CSS namespace (CSS.supports, CSS.escape) arrived in jsdom 30;
  // libraries feature-detect it (handsontable validates sizes with it).
  if (jsdom < 30) delete window.CSS;
  // Before jsdom 29 style objects are CSSStyleDeclarations (css.js
  // legacyDeclaration).
  if (jsdom < 29) delete window.CSSStyleProperties;
  // Nor is CSSRuleList a global before jsdom 29 (black box 20.0.3 to
  // 28.1.0; the rule lists are arrays there, from 27.1.0 of a class
  // extending Array).
  if (jsdom < 29) delete window.CSSRuleList;
  if (!window[S].compat.nestedDeclarations) delete window.CSSNestedDeclarations;
  if (!window[S].compat.elementInternals) delete window.ElementInternals;
  // Option xhr: false (createWindow): no XMLHttpRequest, as before warpdom
  // had it (HTTP libraries then take the host's HTTP client).
  if (!window[S].xhr) {
    delete window.XMLHttpRequest;
    delete window.XMLHttpRequestEventTarget;
    delete window.XMLHttpRequestUpload;
  }
  if (!window[S].compat.textCodec) {
    delete window.TextEncoder;
    delete window.TextDecoder;
  }
  // jsdom 20's MouseEvent has none of CSSOM View's coordinates (22 has).
  // jsdom 20 has no SubmitEvent (submit events are Events).
  if (jsdom < 21) {
    for (const name of ['pageX', 'pageY', 'x', 'y', 'offsetX', 'offsetY']) delete protos.MouseEvent[name];
    delete window.SubmitEvent;
  }
  // jsdom 26.1.0 added the SVG interfaces of svg.js (SVG_TYPES_INTERFACES).
  if (!window[S].compat.svgTypes) for (const name of SVG_TYPES_INTERFACES) delete window[name];
  if (jsdom < 27) {
    delete window.PointerEvent;
    delete window.TransitionEvent;
    // Also from jsdom 27: PromiseRejectionEvent, BlobEvent and the device
    // events (createEvent makes no device events before, events.js).
    for (const name of DEVICE_AND_MEDIA_EVENTS) delete window[name];
  }
}

// jsdom 20 to 26 name unimplemented methods "window.alert" and
// "HTMLFormElement.prototype.submit" (details in parentheses), where jsdom
// 27 and later write "Window's alert() method" (black box).
function legacyWords(message) {
  const window = /^Window's (\w+)\(\) method$/.exec(message);
  if (window) return `window.${window[1]}`;
  const method = /^(\w+)'s (\w+)\(\) method(?:: (.*))?$/.exec(message);
  return method ? `${method[1]}.prototype.${method[2]}${method[3] ? ` (${method[3]})` : ''}` : message;
}

// The CSS mode of a jsdom profile (css.js): jsdom 30 'spec', 27 to 29
// 'jsdom27'; before, by the cssstyle jsdom loads: 2 'jsdom20', 3 'jsdom22',
// 4 before 4.3.1 'jsdom25', later 'jsdom26'.
function cssMode(compat) {
  if (compat.jsdom >= 30) return 'spec';
  if (compat.jsdom >= 27) return 'jsdom27';
  if (compat.cssstyleMajor === 2) return 'jsdom20';
  if (compat.cssstyleMajor === 3) return 'jsdom22';
  return compat.unquotedUrls ? 'jsdom25' : 'jsdom26';
}

// document, window and self: own accessors of the window ([LegacyUnforgeable]
// document and window; self [Replaceable]), as in jsdom (black box, 20.0.0
// to 30.1.3); their getters give this window's whatever this is. jsdom 20:
// all configurable, self without a setter; from 21.0.0 document and window
// are not configurable and assigning self replaces it with a data property.
// The setter acts on this window whatever this is, as jsdom's (another
// window, any object; called as Object.getOwnPropertyDescriptor(window,
// 'self').set.call(Object.create(window), 7) too), so an assignment through
// an object that inherits from the window (Object.create(window).self = 7)
// replaces the window's self, as with jsdom's windows made without
// runScripts. With runScripts, jsdom 21 to 26 give that object its own
// property instead; that is their VM context's global, not the setter
// (black box, 21.1.2 and 26.1.0), and a setter cannot tell such an
// assignment from a call. warpdom's global in Jest and Vitest's VM pools is
// such a global (vitest.js defineSelfKey) (#90).
function defineSelfMembers(window, document) {
  const legacy = window[S].compat.jsdom < 21;
  const own = {
    get document() {
      return document;
    },
    get window() {
      return window;
    },
    get self() {
      return window;
    },
    set self(value) {
      Object.defineProperty(window, 'self', { value, writable: true, enumerable: true, configurable: true });
    },
  };
  const define = (key, configurable, withSetter = false) => {
    const { get, set } = Object.getOwnPropertyDescriptor(own, key);
    Object.defineProperty(window, key, { get, set: withSetter ? set : undefined, enumerable: true, configurable });
  };
  define('document', legacy);
  define('window', legacy);
  define('self', true, !legacy);
}

export function createWindow(options = {}) {
  // Starts as a plain object; becomes a Window once the interfaces exist.
  const window = {};
  const protos = Object.create(null);

  // Interfaces are created on first use (a test touches a few dozen of
  // about 300): the window's constructor property and the internal protos
  // entry start as accessors that create the interface (its parent first)
  // and then become plain data properties. Each interface is created once
  // per window. A constructor property the page deleted or replaced stays
  // so (window.PointerEvent removed by the jsdom profile, mocks).
  const ctors = Object.create(null);
  const lazyGetters = Object.create(null);
  // False when the constructor property was locked before its first read
  // (internal.js lockedRead).
  const defineInterface = (value, name) =>
    Reflect.defineProperty(window, name, { value, writable: true, configurable: true });
  // Whether a constructor property was locked so: until then, the getters
  // skip that lookup.
  let locked = false;
  const lock = () => {
    locked = true;
  };
  function materialize(name) {
    const existing = ctors[name];
    if (existing) return existing;
    const iface = BY_NAME.get(name);
    // An interface the profile's jsdom does not have, whose objects are
    // another's (CSSStyleProperties before jsdom 29: CSSStyleDeclaration);
    // its global is removed (applyCompat).
    const alias = iface.alias?.(window[S].compat);
    if (alias) {
      const ctor = materialize(alias);
      ctors[name] = ctor;
      if (name === 'CSSStyleProperties') setValidationMode(ctor.prototype, cssMode(window[S].compat), window[S].compat);
      Object.defineProperty(protos, name, {
        value: ctor.prototype,
        writable: true,
        enumerable: true,
        configurable: true,
      });
      return ctor;
    }
    // An interface whose parent depends on the profile (CSSStyleRule)
    // names it with parentFor(compat).
    const parentName = iface.parentFor?.(window[S].compat) ?? iface.parent;
    const parent = parentName ? materialize(parentName) : null;
    // Members are defined on an object without a prototype, which V8 keeps
    // as a dictionary: defining them on an object with a prototype walks
    // through a new hidden class per member, rebuilt for every window
    // (CSSStyleProperties' 1,600 accessors took ~1.5 ms). The prototype is
    // set afterwards; own keys, their order and descriptors are the same.
    let proto = Object.create(null);
    const { keys, descriptors, unscopables } = descriptorsOf(
      iface,
      iface.variant ? (iface.variant(window[S].compat) ?? null) : null,
    );
    for (let i = 0; i < keys.length; i++) Object.defineProperty(proto, keys[i], descriptors[i]);
    if (unscopables) {
      const value = Object.create(null);
      for (const member of unscopables) value[member] = true;
      Object.defineProperty(proto, Symbol.unscopables, {
        value,
        enumerable: false,
        writable: false,
        configurable: true,
      });
    }
    if (iface.slot) Object.defineProperty(proto, iface.slot[0], iface.slot[1]);
    // Members a jsdom generation did not have (see applyCompat).
    if (iface.compat) iface.compat(proto, window[S].compat);
    // Members made for this window (EventTarget's operations act on it
    // when called without a this value).
    if (iface.perWindow) iface.perWindow(proto, window);
    if (hidesState(iface) && iface.slot?.[0] !== S) Object.defineProperty(proto, S, HIDDEN_STATE);
    Object.setPrototypeOf(proto, parent ? parent.prototype : Object.prototype);
    // Named access before jsdom 24.1.2 (named-access.js).
    if (name === 'Window' && !window[S].compat.windowProperties) proto = namedAccessPrototype(window, proto);
    // A callback interface with constants (NodeFilter) has a legacy callback
    // interface object: a function that is not a constructor and has no
    // prototype property (a method has neither).
    const ctor = iface.callback
      ? {
          [name]() {
            throw new TypeError(`${name} is not a constructor`);
          },
        }[name]
      : iface.construct
        ? function (...args) {
            if (!new.target) throw new TypeError(`Failed to construct '${name}': Please use the 'new' operator.`);
            return iface.construct(window, this, args);
          }
        : HTML_CONSTRUCTOR.has(name)
          ? // [HTMLConstructor]: custom element classes construct through super().
            function () {
              return htmlConstruct(window, ctor, new.target);
            }
          : function () {
              throw new TypeError('Illegal constructor');
            };
    Object.defineProperty(ctor, 'name', { value: name });
    // The constructor's required argument count (WebIDL); 0 when not given.
    if (iface.length) Object.defineProperty(ctor, 'length', { value: iface.length });
    if (!iface.callback) {
      Object.defineProperty(ctor, 'prototype', { value: proto, writable: false });
      Object.defineProperty(proto, 'constructor', { value: ctor, writable: true, configurable: true });
    }
    // The class string (WebIDL): Object.prototype.toString gives [object Name].
    // (Not before jsdom 29 for CSSStyleDeclaration: [object Object].)
    if (!Object.hasOwn(proto, Symbol.toStringTag) && !iface.untagged?.(window[S].compat))
      Object.defineProperty(proto, Symbol.toStringTag, { value: name, configurable: true });
    if (parent) Object.setPrototypeOf(ctor, parent);
    // Constants; a function of the compat object when they depend on the profile.
    const statics = typeof iface.statics === 'function' ? iface.statics(window[S].compat) : iface.statics;
    for (const [key, value] of Object.entries(statics ?? {})) {
      Object.defineProperty(ctor, key, { value, enumerable: true, writable: false, configurable: false });
    }
    // Static operations that need the window (AbortSignal.timeout).
    for (const [key, value] of Object.entries(iface.staticMethods?.(window) ?? {})) {
      Object.defineProperty(ctor, key, { value, enumerable: true, writable: true, configurable: true });
    }
    ctors[name] = ctor;
    // CSS value validation: every property's grammar from jsdom 27; before,
    // jsdom checked a few dozen properties ('jsdom25': the same, with
    // url() serialized without quotes, as cssstyle before 4.3.1 did).
    if (name === 'CSSStyleProperties') setValidationMode(proto, cssMode(window[S].compat), window[S].compat);
    Object.defineProperty(protos, name, { value: proto, writable: true, enumerable: true, configurable: true });
    // A constructor property locked before its first read stays the accessor
    // (lockedRead, in its getter).
    if (Object.getOwnPropertyDescriptor(window, name)?.get === lazyGetters[name] && !defineInterface(ctor, name)) {
      locked = true;
    }
    // The reset (reset.js) snapshots the prototypes it restores that are
    // created after its snapshot.
    window[S]?.onMaterialize?.(name, proto);
    return ctor;
  }
  // Assigning replaces the constructor property (a mock), as for a
  // writable data property (another receiver gets its own property,
  // internal.js lazyDataSetter, inlined: one closure per interface).
  for (const iface of ORDER) {
    const { name } = iface;
    const get = (lazyGetters[name] = () => {
      const ctor = materialize(name);
      // Only a member still the locked accessor (materialize could not
      // replace it) keeps a value.
      return locked && Reflect.getOwnPropertyDescriptor(window, name)?.get === get
        ? lockedRead(window, name, ctor)
        : ctor;
    });
    const set = function (value) {
      if (this !== window) assignThrough(window, this, name, value, set, defineInterface, lock);
      else if (!defineInterface(value, name)) lockedWrite(window, name, value, set, lock);
    };
    Object.defineProperty(window, name, { get, set, configurable: true });
    Object.defineProperty(protos, name, {
      get() {
        return materialize(name).prototype;
      },
      enumerable: true,
      configurable: true,
    });
  }
  // webkitURL: the window's URL interface under another name, an own data
  // property, not enumerable (jsdom 20 to 30, black box); made on first
  // read, as the interface objects are.
  const setWebkitURL = (value) =>
    Reflect.defineProperty(window, 'webkitURL', { value, writable: true, configurable: true });
  Object.defineProperty(window, 'webkitURL', {
    get() {
      const ctor = materialize('URL');
      return setWebkitURL(ctor) ? ctor : lockedRead(window, 'webkitURL', ctor);
    },
    set: lazyDataSetter(window, 'webkitURL', setWebkitURL),
    configurable: true,
  });
  // HTMLDocument (HTML, legacy): the Document interface object under
  // another name, as in jsdom.
  const setHTMLDocument = (value) =>
    Reflect.defineProperty(window, 'HTMLDocument', { value, writable: true, configurable: true });
  Object.defineProperty(window, 'HTMLDocument', {
    get() {
      const ctor = materialize('Document');
      return setHTMLDocument(ctor) ? ctor : lockedRead(window, 'HTMLDocument', ctor);
    },
    set: lazyDataSetter(window, 'HTMLDocument', setHTMLDocument),
    configurable: true,
  });

  let document;
  const create = (proto, type, extra, doc) => initNode(Object.create(proto), type, doc, extra);
  const internals = {
    protos,
    isWindow: true,
    // Node factories; doc is the owner document (the window's by default).
    // raw: skip custom element handling; proto: the interface to use;
    // sync: run a custom element's constructor now (createElement).
    // prefixed: split a prefix off the name at its colon (createElement
    // and the HTML parser keep the whole name as the local name).
    createElementNS(
      ns,
      qualifiedName,
      doc = document,
      raw = false,
      proto = null,
      sync = false,
      is = null,
      prefixed = true,
    ) {
      const colon = prefixed ? qualifiedName.indexOf(':') : -1;
      const tag = colon >= 0 ? qualifiedName.slice(colon + 1) : qualifiedName;
      if (!raw && ns === HTML_NS && hooks.ce !== null) {
        const custom = createCustomElement(doc, tag, is, sync);
        if (custom) return custom;
      }
      const element = create(
        proto ?? protos[interfaceFor(ns, tag, internals.compat)],
        ELEMENT_NODE,
        { tag, ns, attrs: new Map() },
        doc,
      );
      // The namespace prefix (createElementNS('...', 'svg:rect'), XML parsing).
      if (colon >= 0) element[S].prefix = qualifiedName.slice(0, colon);
      if ((tag === 'iframe' || tag === 'frame') && ns === HTML_NS) doc[S].frameCount = (doc[S].frameCount ?? 0) + 1;
      if (tag === 'slot' && ns === HTML_NS) doc[S].slotCount = (doc[S].slotCount ?? 0) + 1;
      if (tag === 'base' && ns === HTML_NS) doc[S].baseCount = (doc[S].baseCount ?? 0) + 1;
      // A script made by script may run when connected (scripts.js).
      if (tag === 'script' && ns === HTML_NS && !raw) {
        element[S].script = 'ready';
        doc[S].scriptCount = (doc[S].scriptCount ?? 0) + 1;
      }
      if (ns === HTML_NS && ((tag.includes('-') && isValidCustomElementName(tag)) || is !== null)) {
        element[S].ceState = 'undefined';
        element[S].ceIs = is;
      }
      // form[i] and select[i] (forms.js).
      if ((tag === 'form' || tag === 'select') && ns === HTML_NS)
        return hooks.indexedElement(element, tag, internals.compat);
      return element;
    },
    createText: (data, doc = document) => create(protos.Text, TEXT_NODE, { data }, doc),
    createComment: (data, doc = document) => create(protos.Comment, COMMENT_NODE, { data }, doc),
    createFragment: (doc = document) => create(protos.DocumentFragment, DOCUMENT_FRAGMENT_NODE, undefined, doc),
    createDoctype: (name, publicId, systemId, doc = document) =>
      create(protos.DocumentType, DOCUMENT_TYPE_NODE, { name, publicId, systemId }, doc),
    createCDATA: (data, doc = document) => create(protos.CDATASection, CDATA_SECTION_NODE, { data }, doc),
    createPI: (target, data, doc = document) =>
      create(protos.ProcessingInstruction, PROCESSING_INSTRUCTION_NODE, { data, target }, doc),
    initDocument: (doc, extra) => initNode(doc, DOCUMENT_NODE, doc, { window, contentType: 'text/html', ...extra }),
    // A document without a browsing context (defaultView null), as made by
    // DOMImplementation and new Document(); XML documents keep names as given.
    // DOMParser's XML documents are XML documents but not XMLDocument
    // objects (plain: true).
    createDocument: ({ contentType = 'text/html', xml = false, plain = false } = {}) =>
      internals.initDocument(Object.create(xml && !plain ? protos.XMLDocument : protos.Document), {
        noView: true,
        url: 'about:blank',
        contentType,
        xml,
      }),
    // Errors from event listeners that no 'error' listener handled. Logged
    // like jsdom does; test environments replace this to fail the test.
    // A frame's are reported where its top window reports jsdom's virtual
    // console errors (reportError): with jsdom under Jest and Vitest they
    // are logged and do not fail the test (only the top window's 'error'
    // event is watched).
    onUnhandledError: options.nested
      ? (error) => options.nested.parent[S].reportError(error)
      : (error) => console.error(error),
    // jsdom's virtual console errors ("jsdomError"): test environments send
    // them where jsdom's environments do.
    reportError: options.nested
      ? (error) => options.nested.parent[S].reportError(error)
      : (error) => console.error(error),
    // As jsdom reports unimplemented features (form submission, navigation)
    // through its virtual console, in its version's words; the test
    // environments send the text where jsdom's environments send it
    // (reportNotImplemented).
    notImplemented: (message) =>
      internals.reportNotImplemented(
        `Not implemented: ${internals.compat.jsdom < 27 ? legacyWords(message) : message}`,
      ),
    // A frame reports where its top window does (jsdom: one virtual console).
    reportNotImplemented: options.nested
      ? (...args) => options.nested.parent[S].reportNotImplemented(...args)
      : (text) => console.error(text),
    // An iframe's nested window (frames.js).
    // A frame's window behaves like the same jsdom generation as its parent.
    createNestedWindow: ({ url, parent, frameElement }) =>
      createWindow({
        url,
        jsdom: parent[S].compat.version,
        cssstyle: parent[S].compat.cssstyle,
        fastFrames: parent[S].fastFrames,
        xhr: parent[S].xhr,
        nested: { parent, frameElement },
      }),
    parentWindow: options.nested?.parent ?? null,
    frameElement: options.nested?.frameElement ?? null,
  };
  // The profile first: interfaces' members can depend on it (variants).
  internals.compat = profileCompat(options);
  Object.defineProperty(window, S, { value: internals });
  Object.setPrototypeOf(window, protos.Window);
  // Named access (window[id]): the named properties object between
  // Window.prototype and EventTarget.prototype (from jsdom 24.1.2; before,
  // Window.prototype does it, see materialize).
  if (internals.compat.windowProperties)
    Object.setPrototypeOf(protos.Window, namedPropertiesObject(window, window, Object.getPrototypeOf(protos.Window)));
  setupWindow(window, options);
  applyCompat(window, protos);
  installGlobalOperations(window, protos.Window);
  Object.defineProperty(window, 'XPathException', {
    value: xpathException(),
    writable: true,
    enumerable: true,
    configurable: true,
  });
  internals.customElements = createRegistry(window);

  document = internals.initDocument(Object.create(protos.Document));
  // A nested window's about:blank document has no doctype.
  if (!options.nested) insert(document, internals.createDoctype('html', '', ''), null);
  const html = insert(document, internals.createElementNS(HTML_NS, 'html'), null);
  insert(html, internals.createElementNS(HTML_NS, 'head'), null);
  insert(html, internals.createElementNS(HTML_NS, 'body'), null);

  defineSelfMembers(window, document);
  setupWindowData(window);
  return window;
}
