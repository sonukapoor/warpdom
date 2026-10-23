// Named properties of Document (HTML 3.1.6, "dom-document-nameditem"):
// document[name] gives the embed, form, iframe, img and object elements
// with that name, object elements by id, and img elements by id when they
// also have a name. Document is [LegacyOverrideBuiltIns]: a named property
// hides members of the prototype chain (<form name="body"> clobbers
// document.body, as in browsers and jsdom), but not own properties.
//
// A Proxy around the document would put every document read (body,
// createElement, ...) behind a trap. Instead the supported property names
// are kept as own accessor properties of the document, defined when a name
// appears and deleted when it goes. Only the five element types with a
// name (an object also with an id) can contribute, so insertions are
// reported here only in documents that have owned such an element
// (namedCandidates, internal.js), removals only while the document has
// named elements, both from the walk the tree already makes for the id
// index; name and id changes come through the attribute change steps.
// Reads of other document members are unchanged.
//
// Differences from a legacy platform object, accepted: the properties are
// accessors (WebIDL describes data properties) that can be deleted or
// redefined, and Object.getOwnPropertyNames lists them in the order they
// appeared (integer names first) rather than in tree order.
//
// Exposure of nested embed and object elements depends on whether objects
// show their fallback content; nothing is loaded here, so every embed and
// object counts, as in jsdom.
import { S, HTML_NS, ELEMENT_NODE, hooks, nextInTree, rootOf, isNamedTag, namedAttributesSet } from './internal.js';
import { liveList } from './collections.js';
import { addAttributeStep } from './attributes.js';

const NONE = [];

// The names element contributes when it is in a document tree, id first.
function contributions(s) {
  const name = s.attrs.get('name');
  const hasName = name !== undefined && name !== '';
  if (s.tag !== 'object' && s.tag !== 'img') return hasName ? [name] : NONE;
  const id = s.attrs.get('id');
  // An img is named by its id only when it also has a name.
  const hasId = id !== undefined && id !== '' && (hasName || s.tag === 'object');
  if (hasId && hasName && id !== name) return [id, name];
  if (hasId) return [id];
  return hasName ? [name] : NONE;
}

// V8 keeps an object whose property was deleted in dictionary mode, which
// made every later document member read about twice as slow (8 -> 18 ns).
// Using it as a constructor's prototype makes its properties fast again.
function fastProperties(object) {
  function F() {}
  F.prototype = object;
  // eslint-disable-next-line no-new
  new F();
}

// The named getter's value: an iframe's window, the only element, or a
// live HTMLCollection of the named elements in tree order (one per name,
// kept while the name stays).
function namedValue(doc, name) {
  const ds = doc[S];
  const list = ds.namedElements?.get(name);
  if (list === undefined) return undefined;
  if (list.length === 1) {
    const s = list[0][S];
    return s.tag === 'iframe' && s.frameWindow ? s.frameWindow : list[0];
  }
  const collections = ds.namedCollections ?? (ds.namedCollections = new Map());
  let collection = collections.get(name);
  if (collection === undefined) {
    let cache = null;
    let rev = -1;
    collection = liveList(ds.window[S].protos.HTMLCollection, () => {
      const current = ds.treeRev ?? 0;
      if (rev === current) return cache;
      const out = [];
      const by = ds.namedBy;
      if (by !== undefined && by.size !== 0) {
        for (let n = ds.first; n; n = nextInTree(n, doc)) {
          if (n[S].type === ELEMENT_NODE && by.get(n)?.includes(name)) out.push(n);
        }
      }
      cache = out;
      rev = current;
      return out;
    });
    collections.set(name, collection);
  }
  return collection;
}

function define(doc, name) {
  // location is an unforgeable own property of documents in browsers, so a
  // named element never hides it; an expando (own property) is not hidden.
  if (name === 'location' || Object.hasOwn(doc, name)) return;
  const ds = doc[S];
  const get = () => namedValue(doc, name);
  (ds.namedDefined ?? (ds.namedDefined = new Map())).set(name, get);
  Object.defineProperty(doc, name, { get, enumerable: true, configurable: true });
}

function undefine(doc, name) {
  const ds = doc[S];
  ds.namedCollections?.delete(name);
  const get = ds.namedDefined?.get(name);
  if (get === undefined) return;
  ds.namedDefined.delete(name);
  // Only our own property: a test may have redefined it since.
  if (Object.getOwnPropertyDescriptor(doc, name)?.get !== get) return;
  delete doc[name];
  fastProperties(doc);
}

// Brings element's contributions up to date: inTree is whether it is in
// doc's document tree now.
function update(doc, element, inTree) {
  const ds = doc[S];
  const now = inTree ? contributions(element[S]) : NONE;
  const before = ds.namedBy?.get(element) ?? NONE;
  if (now.length === before.length && now.every((n, i) => n === before[i])) return;
  const map = ds.namedElements ?? (ds.namedElements = new Map());
  for (const name of before) {
    if (now.includes(name)) continue;
    const list = map.get(name);
    const i = list.indexOf(element);
    list.splice(i, 1);
    if (list.length === 0) {
      map.delete(name);
      undefine(doc, name);
    }
  }
  for (const name of now) {
    if (before.includes(name)) continue;
    const list = map.get(name);
    if (list === undefined) {
      map.set(name, [element]);
      define(doc, name);
    } else list.push(element);
  }
  const by = ds.namedBy ?? (ds.namedBy = new Map());
  if (now === NONE) by.delete(element);
  else by.set(element, now);
}

hooks.named = {
  // element was inserted in doc's document tree (inTree), or removed.
  update,
  // Forget everything (reset.js; the document's own properties are reset
  // there).
  reset(ds) {
    ds.namedElements = ds.namedBy = ds.namedCollections = ds.namedDefined = undefined;
  },
};

// A name or id attribute changed (attribute change steps, so writes of
// other attributes do not pay for this check).
function attributeChanged(element) {
  const s = element[S];
  if (s.ns !== HTML_NS || !isNamedTag(s.tag)) return;
  const doc = s.doc;
  namedAttributesSet(s, doc);
  if (doc[S].namedCandidates) update(doc, element, rootOf(element) === doc);
}
addAttributeStep('name', attributeChanged);
addAttributeStep('id', attributeChanged);
