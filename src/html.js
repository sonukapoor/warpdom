// HTML serialization (our own single pass over the tree, per the HTML
// standard's fragment serialization algorithm) and parsing (parse5, loaded
// lazily the first time something is parsed, so test files that never
// parse HTML do not pay for loading it).
import {
  S, state, insert, remove, domError, hooks, reactionScope, HTML_NS,
  ELEMENT_NODE, TEXT_NODE, COMMENT_NODE, DOCUMENT_NODE, DOCUMENT_FRAGMENT_NODE,
} from './internal.js';
import { eventHandlerAttributesAdded } from './event-handlers.js';
import { attributeSteps } from './attributes.js';

// --- parser loading -------------------------------------------------------------

let loadParser = null;
let parser = null;

// Registers how to load parse5 synchronously (the Node entry uses require).
export function setParserLoader(loader) {
  loadParser = loader;
  parser = null;
}

function getParser() {
  if (!parser) {
    if (!loadParser) throw new Error('warpdom: no HTML parser available. Import warpdom from Node, or call setParserLoader().');
    parser = loadParser();
  }
  return parser;
}

// --- serialization -------------------------------------------------------------

const VOID = new Set(['area', 'base', 'basefont', 'bgsound', 'br', 'col', 'embed', 'frame', 'hr', 'img', 'input',
  'keygen', 'link', 'meta', 'param', 'source', 'track', 'wbr']);
const RAW_TEXT = new Set(['style', 'script', 'xmp', 'iframe', 'noembed', 'noframes', 'plaintext']);

const escapeText = (s) => (/[&<> ]/.test(s)
  ? s.replace(/&/g, '&amp;').replace(/ /g, '&nbsp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  : s);
const escapeAttribute = (s) => (/[&" ]/.test(s)
  ? s.replace(/&/g, '&amp;').replace(/ /g, '&nbsp;').replace(/"/g, '&quot;')
  : s);

function serializeElement(el) {
  const s = el[S];
  let out = `<${s.tag}`;
  // An is value is serialized as an attribute if there is none.
  if (s.ceIs && !s.attrs.has('is')) out += ` is="${escapeAttribute(s.ceIs)}"`;
  for (const [name, value] of s.attrs) out += ` ${name}="${escapeAttribute(value)}"`;
  out += '>';
  if (s.ns === HTML_NS && VOID.has(s.tag)) return out;
  const contentRoot = s.ns === HTML_NS && s.tag === 'template' && s.content ? s.content : el;
  return `${out}${serializeChildren(contentRoot)}</${s.tag}>`;
}

export function serializeChildren(node) {
  const s = node[S];
  const raw = s.type === ELEMENT_NODE && s.ns === HTML_NS && RAW_TEXT.has(s.tag);
  let out = '';
  for (let c = s.first; c; c = c[S].next) {
    const cs = c[S];
    switch (cs.type) {
      case ELEMENT_NODE: out += serializeElement(c); break;
      case TEXT_NODE: out += raw ? cs.data : escapeText(cs.data); break;
      case COMMENT_NODE: out += `<!--${cs.data}-->`; break;
      default: break;
    }
  }
  return out;
}

export const serializeOuter = (el) => serializeElement(el);

// --- parsing ---------------------------------------------------------------------

// Parses html in the context of contextElement and returns a warpdom
// DocumentFragment of the result, owned by doc.
export function parseFragment(doc, contextElement, html) {
  const p5 = getParser();
  const cs = contextElement[S];
  const context = p5.defaultTreeAdapter.createElement(cs.tag, cs.ns ?? HTML_NS, []);
  const ast = p5.parseFragment(context, String(html));
  const internals = doc[S].window[S];
  const fragment = internals.createFragment(doc);
  // Content parsed for a template goes into its inert contents: no upgrades.
  appendAst(internals, fragment, ast.childNodes, doc, isTemplate(contextElement));
  return fragment;
}

// Parses a whole HTML document into doc (an empty document).
export function parseDocument(doc, html) {
  const ast = getParser().parse(String(html));
  appendAst(doc[S].window[S], doc, ast.childNodes, doc);
  return doc;
}

// Parsed elements are created plainly, get their attributes, then queue an
// upgrade if they are defined custom elements (not inside templates).
function appendAst(internals, parent, astNodes, doc, inTemplate = false) {
  for (const n of astNodes) {
    let node;
    if (n.nodeName === '#text') node = internals.createText(n.value, doc);
    else if (n.nodeName === '#comment') node = internals.createComment(n.data, doc);
    else if (n.nodeName === '#documentType') node = internals.createDoctype(n.name ?? '', n.publicId ?? '', n.systemId ?? '', doc);
    else if (n.tagName) {
      let is = null;
      for (const a of n.attrs) if (a.name === 'is' && !a.prefix) is = a.value;
      node = internals.createElementNS(n.namespaceURI, n.tagName, doc, true, null, false, n.namespaceURI === HTML_NS ? is : null);
      const attrs = node[S].attrs;
      let handlers = false;
      for (const a of n.attrs) {
        const name = a.prefix ? `${a.prefix}:${a.name}` : a.name;
        attrs.set(name, a.value);
        // Foreign attributes (xlink:href, xml:lang) keep their namespace.
        if (a.namespace) {
          const ns = node[S].attrNS ?? (node[S].attrNS = new Map());
          ns.set(name, { ns: a.namespace, prefix: a.prefix || null, local: a.name });
        }
        if (a.name.startsWith('on')) handlers = true;
      }
      if (handlers) eventHandlerAttributesAdded(node);
      // A parsed <details open> queues its toggle event, as adding the
      // attribute would.
      if (n.tagName === 'details' && n.namespaceURI === HTML_NS && attrs.has('open')) attributeSteps.get('open')?.(node, undefined, attrs.get('open'));
      if (!inTemplate && hooks.ce !== null) hooks.ce.created(node);
      if (n.content) appendAst(internals, templateContent(node), n.content.childNodes, doc, true);
      else appendAst(internals, node, n.childNodes, doc, inTemplate);
    } else continue;
    insert(parent, node, null);
  }
}

// A template's contents live in a separate fragment, not its children.
export function templateContent(template) {
  const s = state(template);
  return s.content ?? (s.content = s.doc[S].window[S].createFragment(s.doc));
}

const isTemplate = (el) => el[S].ns === HTML_NS && el[S].tag === 'template';

export const setInnerHTML = (element, html) => reactionScope(innerHTML, element, html);

function innerHTML(element, html) {
  const s = state(element);
  const target = isTemplate(element) ? templateContent(element) : element;
  const doc = s.type === DOCUMENT_NODE ? element : s.doc;
  const fragment = parseFragment(doc, element, html);
  const ts = target[S];
  while (ts.first) remove(target, ts.first);
  insert(target, fragment, null);
}

export const setOuterHTML = (element, html) => reactionScope(outerHTML, element, html);

function outerHTML(element, html) {
  const s = state(element);
  const parent = s.parent;
  if (!parent) return;
  if (parent[S].type === DOCUMENT_NODE) throw domError('Failed to set the \'outerHTML\' property on \'Element\': This element\'s parent is of type \'#document\'.', 'NoModificationAllowedError');
  const context = parent[S].type === DOCUMENT_FRAGMENT_NODE ? s.doc.createElement('body') : parent;
  const fragment = parseFragment(s.doc, context, html);
  const next = s.next;
  remove(parent, element);
  insert(parent, fragment, next);
}

export const insertAdjacentHTML = (element, position, html) => reactionScope(adjacentHTML, element, position, html);

function adjacentHTML(element, position, html) {
  const s = state(element);
  const where = String(position).toLowerCase();
  let context;
  if (where === 'beforebegin' || where === 'afterend') {
    context = s.parent;
    if (!context || context[S].type === DOCUMENT_NODE) throw domError('The element has no parent.', 'NoModificationAllowedError');
    if (context[S].type === DOCUMENT_FRAGMENT_NODE) context = s.doc.createElement('body');
  } else if (where === 'afterbegin' || where === 'beforeend') {
    context = element;
  } else {
    throw domError(`The value provided ('${position}') is not one of 'beforeBegin', 'afterBegin', 'beforeEnd', or 'afterEnd'.`, 'SyntaxError');
  }
  const fragment = parseFragment(s.doc, context, html);
  if (where === 'beforebegin') insert(s.parent, fragment, element);
  else if (where === 'afterbegin') insert(element, fragment, s.first);
  else if (where === 'beforeend') insert(element, fragment, null);
  else insert(s.parent, fragment, s.next);
}
