// XML: CDATASection and ProcessingInstruction nodes (DOM), and XML parsing
// for DOMParser and for innerHTML in XML documents (HTML's XML parser and
// XML fragment parsing algorithm). Well-formedness (XML 1.0) is checked by
// @rgrove/parse-xml, loaded the first time XML is parsed, like parse5 for
// HTML; namespaces (Namespaces in XML 1.0) are resolved here, on its tree.
import {
  S, state, insert, remove, domError, hooks, HTML_NS, ELEMENT_NODE,
} from './internal.js';
import { XML_NS, XMLNS_NS } from './attributes.js';
import { eventHandlerAttributesAdded } from './event-handlers.js';

// --- parser loading -------------------------------------------------------------

let loadXmlParser = null;
let xmlParser = null;

// Registers how to load @rgrove/parse-xml synchronously (the Node entry
// uses require).
export function setXmlParserLoader(loader) {
  loadXmlParser = loader;
  xmlParser = null;
}

function getXmlParser() {
  if (!xmlParser) {
    if (!loadXmlParser) throw new Error('warpdom: no XML parser available. Import warpdom from Node, or call setXmlParserLoader().');
    xmlParser = loadXmlParser();
  }
  return xmlParser;
}

// --- names (XML 1.0 Name production) --------------------------------------------

const NAME_START = ':A-Z_a-z\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02FF\\u0370-\\u037D\\u037F-\\u1FFF\\u200C\\u200D'
  + '\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD\\u{10000}-\\u{EFFFF}';
const NAME_CHAR = `${NAME_START}\\-.0-9\\u00B7\\u0300-\\u036F\\u203F\\u2040`;
const NAME = new RegExp(`^[${NAME_START}][${NAME_CHAR}]*$`, 'u');
const NCNAME = new RegExp(`^[${NAME_START.slice(1)}][${NAME_CHAR.slice(1)}]*$`, 'u');

export const isXmlName = (name) => NAME.test(name);

// --- interfaces -----------------------------------------------------------------

export const XML_INTERFACES = [
  { name: 'CDATASection', parent: 'Text', members: {} },
  {
    name: 'ProcessingInstruction',
    parent: 'CharacterData',
    members: { get target() { return state(this).target; } },
  },
];

const internals = (doc) => doc[S].window[S];

export const XML_DOCUMENT_MEMBERS = {
  createCDATASection(data) {
    const s = state(this);
    if (!s.xml) throw domError('Failed to execute \'createCDATASection\' on \'Document\': This operation is not supported for HTML documents.', 'NotSupportedError');
    const text = String(data);
    if (text.includes(']]>')) throw domError('Failed to execute \'createCDATASection\' on \'Document\': String cannot contain \']]>\' since that is the end delimiter of a CData section.', 'InvalidCharacterError');
    return internals(this).createCDATA(text, this);
  },
  createProcessingInstruction(target, data) {
    state(this);
    const t = String(target);
    const d = String(data);
    if (!NAME.test(t)) throw domError(`Failed to execute 'createProcessingInstruction' on 'Document': The target provided ('${t}') is not a valid name.`, 'InvalidCharacterError');
    if (d.includes('?>')) throw domError(`Failed to execute 'createProcessingInstruction' on 'Document': The data provided ('${d}') contains '?>'.`, 'InvalidCharacterError');
    return internals(this).createPI(t, d, this);
  },
};

// --- parsing --------------------------------------------------------------------

const OPTIONS_BASE = { preserveCdata: true, preserveComments: true, preserveDocumentType: true, includeOffsets: true };

// A well-formedness or namespace error, with the position it was found at.
class XmlSyntaxError extends Error {
  constructor(message, pos) { super(message); this.pos = pos; }
}

// General entities declared in a doctype's internal subset (internal
// entities only: <!ENTITY name "value">), with references to predefined
// entities, characters and earlier entities in their values replaced.
// Markup in an entity's value is kept as text.
const PREDEFINED = { lt: '<', gt: '>', amp: '&', apos: "'", quot: '"' };
function declaredEntities(subset) {
  const entities = new Map();
  if (!subset) return entities;
  const declaration = /<!ENTITY\s+([^\s%"'>]+)\s+(?:"([^"]*)"|'([^']*)')\s*>/g;
  let size = 0;
  for (let m = declaration.exec(subset); m; m = declaration.exec(subset)) {
    if (entities.has(m[1])) continue; // the first declaration binds (XML 1.0 4.2)
    const value = (m[2] ?? m[3]).replace(/&(#x[0-9a-fA-F]+|#[0-9]+|[^\s&;]+);/g, (all, ref) => {
      if (ref[0] === '#') return String.fromCodePoint(ref[1] === 'x' ? parseInt(ref.slice(2), 16) : Number(ref.slice(1)));
      return PREDEFINED[ref] ?? entities.get(ref) ?? all;
    });
    // Bound expansion (entities made of entities grow exponentially).
    size += value.length;
    if (size > 1e6) break;
    entities.set(m[1], value);
  }
  return entities;
}

function parseXml(text, entities) {
  const options = entities.size
    ? { ...OPTIONS_BASE, resolveUndefinedEntity: (ref) => entities.get(ref.slice(1, -1)) }
    : OPTIONS_BASE;
  return getXmlParser().parseXml(text, options);
}

// The doctype's internal subset, found without a full parse (the entities
// must be known before parsing the content).
function internalSubset(text) {
  const start = text.indexOf('<!DOCTYPE');
  if (start < 0) return null;
  const open = text.indexOf('[', start);
  const end = text.indexOf('>', start);
  if (open < 0 || (end >= 0 && end < open)) return null;
  const close = text.indexOf(']', open);
  return close < 0 ? null : text.slice(open + 1, close);
}

// Builds the children of an XML tree node under parent, resolving
// namespaces. scope: prefix -> namespace ('' for the default namespace).
function build(w, doc, parent, xmlNodes, scope, inTemplate) {
  for (const n of xmlNodes) {
    let node;
    switch (n.type) {
      case 'element': node = buildElement(w, doc, n, scope, inTemplate); break;
      case 'text': node = w.createText(n.text, doc); break;
      case 'cdata': node = w.createCDATA(n.text, doc); break;
      case 'comment': node = w.createComment(n.content, doc); break;
      case 'pi':
        if (n.name.includes(':')) throw new XmlSyntaxError('colons are forbidden in processing instruction targets', n.start);
        node = w.createPI(n.name, n.content, doc);
        break;
      case 'doctype': node = w.createDoctype(n.name, n.publicId ?? '', n.systemId ?? '', doc); break;
      default: continue;
    }
    if (node) insert(parent, node, null);
  }
}

function splitQName(name, pos) {
  const colon = name.indexOf(':');
  if (colon < 0) {
    if (!NCNAME.test(name)) throw new XmlSyntaxError(`invalid name: ${name}`, pos);
    return [null, name];
  }
  const prefix = name.slice(0, colon);
  const local = name.slice(colon + 1);
  if (!NCNAME.test(prefix) || !NCNAME.test(local)) throw new XmlSyntaxError(`invalid qualified name: ${name}`, pos);
  return [prefix, local];
}

function buildElement(w, doc, n, parentScope, inTemplate) {
  const pos = n.start;
  // Namespace declarations first: they apply to the element's own name and
  // attributes.
  let scope = parentScope;
  for (const name in n.attributes) {
    if (name !== 'xmlns' && !name.startsWith('xmlns:')) continue;
    const value = n.attributes[name];
    if (scope === parentScope) scope = new Map(parentScope);
    if (name === 'xmlns') {
      if (value === XML_NS || value === XMLNS_NS) throw new XmlSyntaxError(`reserved namespace as the default namespace: ${value}`, pos);
      scope.set('', value);
      continue;
    }
    const prefix = name.slice(6);
    if (!NCNAME.test(prefix)) throw new XmlSyntaxError(`invalid namespace prefix: ${prefix}`, pos);
    if (prefix === 'xmlns') throw new XmlSyntaxError('the xmlns prefix cannot be declared', pos);
    if ((prefix === 'xml') !== (value === XML_NS)) throw new XmlSyntaxError(`the xml prefix and namespace bind only to each other: ${name}`, pos);
    if (value === XMLNS_NS) throw new XmlSyntaxError('the xmlns namespace cannot be bound to a prefix', pos);
    if (value === '') throw new XmlSyntaxError(`a prefix cannot be undeclared: ${name}`, pos);
    scope.set(prefix, value);
  }
  const [prefix, local] = splitQName(n.name, pos);
  let ns;
  if (prefix === null) ns = scope.get('') || null;
  else {
    if (prefix === 'xmlns') throw new XmlSyntaxError(`an element cannot have the xmlns prefix: ${n.name}`, pos);
    ns = scope.get(prefix);
    if (ns === undefined) throw new XmlSyntaxError(`unbound namespace prefix: ${prefix}`, pos);
  }
  const html = ns === HTML_NS;
  let is = null;
  if (html) for (const name in n.attributes) if (name === 'is') is = n.attributes[name];
  const element = w.createElementNS(ns, n.name, doc, true, null, false, html ? is : null);
  const es = element[S];
  const attrs = es.attrs;
  const seen = new Set();
  let handlers = false;
  for (const name in n.attributes) {
    const value = n.attributes[name];
    let attrNs = null;
    let attrPrefix = null;
    let attrLocal = name;
    if (name === 'xmlns') attrNs = XMLNS_NS;
    else {
      [attrPrefix, attrLocal] = splitQName(name, pos);
      if (attrPrefix === 'xmlns') attrNs = XMLNS_NS;
      else if (attrPrefix !== null) {
        attrNs = scope.get(attrPrefix);
        if (attrNs === undefined) throw new XmlSyntaxError(`unbound namespace prefix: ${attrPrefix}`, pos);
      }
    }
    const key = `${attrNs ?? ''} ${attrLocal}`;
    if (seen.has(key)) throw new XmlSyntaxError(`duplicate attribute: ${name}`, pos);
    seen.add(key);
    attrs.set(name, value);
    if (attrNs !== null) (es.attrNS ?? (es.attrNS = new Map())).set(name, { ns: attrNs, prefix: attrPrefix, local: attrLocal });
    if (name.startsWith('on')) handlers = true;
  }
  if (handlers) eventHandlerAttributesAdded(element);
  if (!inTemplate && hooks.ce !== null) hooks.ce.created(element);
  // A template's children go into its contents (HTML, the XML parser).
  if (html && local === 'template') build(w, doc, templateContentOf(element), n.children, scope, true);
  else build(w, doc, element, n.children, scope, inTemplate);
  return element;
}

// The template contents fragment (as html.js's templateContent; kept here
// so this module does not import html.js).
function templateContentOf(template) {
  const s = template[S];
  return s.content ?? (s.content = s.doc[S].window[S].createFragment(s.doc));
}

function position(text, pos) {
  let line = 1;
  let column = 0;
  for (let i = 0; i < pos && i < text.length; i++) {
    if (text[i] === '\n') { line++; column = 0; } else column++;
  }
  return `${line}:${column}`;
}

// The first line of a parse error's message, without its position.
const errorMessage = (error) => error.message.split('\n')[0].replace(/ \(line \d+, column \d+\)$/, '');

// The input is decoded from UTF-8 bytes in a browser, so lone surrogates
// (which UTF-8 cannot encode) arrive as U+FFFD.
const scalarValues = (text) => (typeof text.toWellFormed === 'function' ? text.toWellFormed()
  : text.replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '\uFFFD'));

const PARSER_ERROR_NS = 'http://www.mozilla.org/newlayout/xml/parsererror.xml';

// Parses an XML document into doc (an empty XML document). A document that
// is not well-formed becomes an error document: a parsererror element (in
// Firefox's namespace, as the DOM Parsing tests and jsdom have it) with
// the message.
export function parseXMLDocument(doc, text) {
  const w = internals(doc);
  const source = scalarValues(String(text));
  try {
    const tree = parseXml(source, declaredEntities(internalSubset(source)));
    build(w, doc, doc, tree.children, new Map([['xml', XML_NS]]), false);
  } catch (error) {
    if (!(error instanceof XmlSyntaxError) && typeof error?.pos !== 'number') throw error;
    const ds = doc[S];
    while (ds.first) remove(doc, ds.first);
    const message = errorMessage(error);
    const root = w.createElementNS(PARSER_ERROR_NS, 'parsererror', doc, true);
    insert(root, w.createText(`${position(source, error.pos)}: ${message}`, doc), null);
    insert(doc, root, null);
  }
  return doc;
}

// The namespace bindings in scope at an element: prefix -> namespace,
// '' for the default namespace (the element's own namespace, as the XML
// fragment parsing algorithm says).
function inScopeNamespaces(context) {
  const scope = new Map();
  for (let el = context; el && el[S].type === ELEMENT_NODE; el = el[S].parent) {
    const s = el[S];
    if (s.prefix && s.ns !== null && !scope.has(s.prefix)) scope.set(s.prefix, s.ns);
    if (s.attrNS) {
      for (const info of s.attrNS.values()) {
        if (info.ns === XMLNS_NS && info.prefix === 'xmlns' && !scope.has(info.local)) scope.set(info.local, s.attrs.get(`xmlns:${info.local}`) ?? '');
      }
    }
  }
  scope.delete('xml');
  scope.delete('xmlns');
  return scope;
}

const escapeAttr = (v) => v.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

// The XML fragment parsing algorithm (HTML): markup parsed as the content
// of an element with the context element's namespace bindings. Returns a
// DocumentFragment owned by doc; markup that is not well-formed throws a
// SyntaxError.
export function parseXMLFragment(doc, context, markup) {
  const w = internals(doc);
  const cs = context[S];
  const scope = cs.type === ELEMENT_NODE ? inScopeNamespaces(context) : new Map();
  const defaultNs = cs.type === ELEMENT_NODE ? cs.ns ?? '' : '';
  let start = `<w xmlns="${escapeAttr(defaultNs)}"`;
  for (const [prefix, ns] of scope) if (ns !== '') start += ` xmlns:${prefix}="${escapeAttr(ns)}"`;
  const fragment = w.createFragment(doc);
  try {
    const tree = parseXml(`${start}>${scalarValues(String(markup))}</w>`, new Map());
    const root = tree.children.find((n) => n.type === 'element');
    const rootScope = new Map([['xml', XML_NS], ['', defaultNs], ...[...scope].filter(([, ns]) => ns !== '')]);
    build(w, doc, fragment, root.children, rootScope, false);
  } catch (error) {
    if (!(error instanceof XmlSyntaxError) && typeof error?.pos !== 'number') throw error;
    throw domError(`Failed to parse the markup as XML: ${errorMessage(error)}`, 'SyntaxError');
  }
  return fragment;
}
