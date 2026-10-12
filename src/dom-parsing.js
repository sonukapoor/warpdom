// DOMParser and XMLSerializer (DOM Parsing and Serialization).
// parseFromString parses HTML with parse5 and XML with the XML parser
// (xml.js) into a new document. serializeToString follows the standard's
// XML serialization algorithm, without the well-formedness checks (as
// serializeToString requires); innerHTML and outerHTML of nodes in XML
// documents use it with them.
import {
  S, state, domError, HTML_NS, ELEMENT_NODE, TEXT_NODE, COMMENT_NODE, DOCUMENT_NODE, DOCUMENT_FRAGMENT_NODE, DOCUMENT_TYPE_NODE,
  CDATA_SECTION_NODE, PROCESSING_INSTRUCTION_NODE, elementById,
} from './internal.js';
import { XML_NS, XMLNS_NS, attrNode } from './attributes.js';
import { reportError } from './events.js';
import { parseDocument, templateContent, serializeChildren, serializeOuter } from './html.js';
import { parseXMLDocument, isXmlName } from './xml.js';

const SUPPORTED_TYPES = new Set(['text/html', 'text/xml', 'application/xml', 'application/xhtml+xml', 'image/svg+xml']);

function parseFromString(parser, string, type) {
  const window = state(parser).window;
  const t = String(type);
  if (!SUPPORTED_TYPES.has(t)) {
    throw new TypeError(`Failed to execute 'parseFromString' on 'DOMParser': parameter 2 '${t}' is not a valid enumeration value for SupportedType`);
  }
  const ws = window[S];
  if (t === 'text/html') {
    const doc = ws.createDocument({ contentType: 'text/html' });
    // The URL of the parser's window's document (DOM Parsing); scripting is
    // disabled in the new document, so noscript content is parsed as markup.
    doc[S].url = window.document.URL;
    return parseDocument(doc, string, false);
  }
  // An XML document, though not an XMLDocument object (as browsers and
  // the DOM Parsing tests have it).
  const doc = ws.createDocument({ contentType: t, xml: true, plain: true });
  doc[S].url = ws.url.href;
  return parseXMLDocument(doc, string);
}

// The fragment serializing algorithm: HTML for nodes in HTML documents,
// XML (requiring well-formed markup) in XML documents.
export function innerMarkup(node) {
  const s = node[S];
  const root = s.type === ELEMENT_NODE && s.ns === HTML_NS && s.tag === 'template' ? templateContent(node) : node;
  if (!(s.type === DOCUMENT_NODE ? s : s.doc[S]).xml) return serializeChildren(root);
  const ctx = { n: 1, wellFormed: true };
  const map = new Map([[XML_NS, ['xml']]]);
  let out = '';
  for (let c = root[S].first; c; c = c[S].next) out += serializeNode(c, null, map, ctx);
  return out;
}

export function outerMarkup(element) {
  if (!element[S].doc[S].xml) return serializeOuter(element);
  return serializeNode(element, null, new Map([[XML_NS, ['xml']]]), { n: 1, wellFormed: true });
}

// --- XML serialization --------------------------------------------------------------

const VOID = new Set(['area', 'base', 'basefont', 'bgsound', 'br', 'col', 'embed', 'frame', 'hr', 'img', 'input',
  'keygen', 'link', 'menuitem', 'meta', 'param', 'source', 'track', 'wbr']);

const escapeText = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
// Tabs and line breaks in attribute values are written as character
// references, so they survive attribute value normalization when parsed.
const ATTRIBUTE_ESCAPES = { '&': '&amp;', '"': '&quot;', '<': '&lt;', '>': '&gt;', '\t': '&#x9;', '\n': '&#xA;', '\r': '&#xD;' };
const escapeAttribute = (s) => (/[&"<>\t\n\r]/.test(s) ? s.replace(/[&"<>\t\n\r]/g, (c) => ATTRIBUTE_ESCAPES[c]) : s);

// The namespace prefix map: namespace -> prefixes, copied per element.
const copyMap = (map) => new Map([...map].map(([ns, prefixes]) => [ns, prefixes.slice()]));
const addPrefix = (map, ns, prefix) => { const list = map.get(ns); if (list) list.push(prefix); else map.set(ns, [prefix]); };

function preferredPrefix(map, ns, preferred) {
  const candidates = map.get(ns);
  if (!candidates) return null;
  return candidates.includes(preferred) ? preferred : candidates[candidates.length - 1];
}

function generatePrefix(map, ns, index) {
  const prefix = `ns${index.n++}`;
  addPrefix(map, ns, prefix);
  return prefix;
}

// Records xmlns and xmlns:* attributes in the map; returns the element's
// local default namespace (from an xmlns attribute), or null.
function recordNamespaces(element, map, localPrefixes) {
  let defaultNs = null;
  for (const attr of element.attributes) {
    if (attr.namespaceURI !== XMLNS_NS) continue;
    if (attr.prefix === null) { defaultNs = attr.value; continue; }
    if (attr.prefix !== 'xmlns') continue;
    const prefix = attr.localName;
    const ns = attr.value === '' ? null : attr.value;
    if (ns === XML_NS || map.get(ns)?.includes(prefix)) continue;
    addPrefix(map, ns, prefix);
    localPrefixes.set(prefix, ns ?? '');
  }
  return defaultNs;
}

// XML 1.0 Char production (no lone surrogates, no C0 controls but tab, LF, CR).
const NOT_CHAR = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;
const notWellFormed = (what) => domError(`Failed to serialize: ${what} is not well-formed.`, 'InvalidStateError');

function serializeAttributes(element, map, index, localPrefixes, ignoreDefaultNsAttribute) {
  let out = '';
  const seen = index.wellFormed ? new Set() : null;
  for (const attr of element.attributes) {
    const ns = attr.namespaceURI;
    let prefix = null;
    if (seen !== null) {
      const key = `${ns} ${attr.localName}`;
      if (seen.has(key)) throw notWellFormed('an element with duplicate attributes');
      seen.add(key);
      if (attr.localName.includes(':') || !isXmlName(attr.localName) || (attr.localName === 'xmlns' && ns === null)) throw notWellFormed(`the attribute name ${attr.localName}`);
      if (NOT_CHAR.test(attr.value)) throw notWellFormed('an attribute value');
      if (ns === XMLNS_NS && (attr.value === XMLNS_NS || (attr.prefix !== null && attr.value === ''))) throw notWellFormed('a namespace declaration');
    }
    if (ns !== null) {
      prefix = preferredPrefix(map, ns, attr.prefix);
      if (ns === XMLNS_NS) {
        if (attr.value === XML_NS) continue;
        if (attr.prefix === null && ignoreDefaultNsAttribute) continue;
        if (attr.prefix !== null && localPrefixes.get(attr.localName) !== attr.value) continue;
        if (attr.prefix === null) prefix = null;
        else prefix = 'xmlns';
      } else if (prefix === null) {
        prefix = generatePrefix(map, ns, index);
        out += ` xmlns:${prefix}="${escapeAttribute(ns)}"`;
      }
    }
    out += ` ${prefix !== null ? `${prefix}:` : ''}${attr.localName}="${escapeAttribute(attr.value)}"`;
  }
  return out;
}

function serializeElement(element, contextNs, parentMap, index) {
  if (index.wellFormed && (element.localName.includes(':') || !isXmlName(element.localName))) throw notWellFormed(`the element name ${element.localName}`);
  const map = copyMap(parentMap);
  const localPrefixes = new Map();
  const localDefaultNs = recordNamespaces(element, map, localPrefixes);
  const ns = element.namespaceURI;
  const local = element.localName;
  let inheritedNs = contextNs;
  let ignoreDefaultNsAttribute = false;
  let qualifiedName;
  let markup = '<';
  if (inheritedNs === ns) {
    if (localDefaultNs !== null) ignoreDefaultNsAttribute = true;
    qualifiedName = ns === XML_NS ? `xml:${local}` : local;
    markup += qualifiedName;
  } else {
    let prefix = element.prefix;
    const candidate = ns === null ? null : preferredPrefix(map, ns, prefix);
    if (prefix === 'xmlns') prefix = candidate ?? prefix;
    if (candidate !== null) {
      qualifiedName = `${candidate}:${local}`;
      if (localDefaultNs !== null && localDefaultNs !== XML_NS) inheritedNs = localDefaultNs === '' ? null : localDefaultNs;
      markup += qualifiedName;
    } else if (prefix !== null) {
      if (localPrefixes.has(prefix)) prefix = generatePrefix(map, ns, index);
      else addPrefix(map, ns, prefix);
      qualifiedName = `${prefix}:${local}`;
      markup += `${qualifiedName} xmlns:${prefix}="${escapeAttribute(ns)}"`;
      if (localDefaultNs !== null) inheritedNs = localDefaultNs === '' ? null : localDefaultNs;
    } else if (localDefaultNs === null || localDefaultNs !== (ns ?? '')) {
      ignoreDefaultNsAttribute = true;
      qualifiedName = local;
      inheritedNs = ns;
      markup += `${qualifiedName} xmlns="${escapeAttribute(ns ?? '')}"`;
    } else {
      qualifiedName = local;
      inheritedNs = ns;
      markup += qualifiedName;
    }
  }
  markup += serializeAttributes(element, map, index, localPrefixes, ignoreDefaultNsAttribute);
  const contentRoot = ns === HTML_NS && local === 'template' ? templateContent(element) : element;
  const empty = contentRoot[S].first === null;
  if (ns === HTML_NS && empty && VOID.has(local)) return `${markup} />`;
  if (ns !== HTML_NS && empty) return `${markup}/>`;
  markup += '>';
  for (let c = contentRoot[S].first; c; c = c[S].next) markup += serializeNode(c, inheritedNs, map, index);
  return `${markup}</${qualifiedName}>`;
}

function serializeDoctype(node, wellFormed) {
  const { name, publicId, systemId } = node;
  if (wellFormed && (/[^\x20\x0D\x0Aa-zA-Z0-9\-'()+,./:=?;!*#@$_%]/.test(publicId) || NOT_CHAR.test(systemId)
    || (systemId.includes('"') && systemId.includes("'")))) throw notWellFormed('the doctype');
  let out = `<!DOCTYPE ${name}`;
  if (publicId !== '') out += ` PUBLIC "${publicId}"`;
  else if (systemId !== '') out += ' SYSTEM';
  if (systemId !== '') out += ` "${systemId}"`;
  return `${out}>`;
}

function serializeNode(node, contextNs, map, index) {
  const s = node[S];
  const wellFormed = index.wellFormed === true;
  switch (s.type) {
    case ELEMENT_NODE: return serializeElement(node, contextNs, map, index);
    case TEXT_NODE:
      if (wellFormed && NOT_CHAR.test(s.data)) throw notWellFormed('a text node');
      return escapeText(s.data);
    case CDATA_SECTION_NODE: return `<![CDATA[${s.data}]]>`;
    case COMMENT_NODE:
      if (wellFormed && (NOT_CHAR.test(s.data) || s.data.includes('--') || s.data.endsWith('-'))) throw notWellFormed('a comment');
      return `<!--${s.data}-->`;
    case PROCESSING_INSTRUCTION_NODE:
      if (wellFormed && (s.target.includes(':') || s.target.toLowerCase() === 'xml' || NOT_CHAR.test(s.data) || s.data.includes('?>'))) throw notWellFormed('a processing instruction');
      return `<?${s.target} ${s.data}?>`;
    case DOCUMENT_TYPE_NODE: return serializeDoctype(node, wellFormed);
    case DOCUMENT_NODE: case DOCUMENT_FRAGMENT_NODE: {
      if (wellFormed && s.type === DOCUMENT_NODE && node.documentElement === null) throw notWellFormed('a document without an element');
      let out = '';
      for (let c = s.first; c; c = c[S].next) out += serializeNode(c, contextNs, map, index);
      return out;
    }
    default: return '';
  }
}

export function serializeXML(node) {
  return serializeNode(node, null, new Map([[XML_NS, ['xml']]]), { n: 1 });
}

export const DOM_PARSING_INTERFACES = [
  {
    name: 'DOMParser',
    construct: (window, self) => { self[S] = { window }; return self; },
    members: {
      parseFromString(string, type) { return parseFromString(this, string, type); },
    },
  },
  {
    name: 'XMLSerializer',
    construct: (window, self) => { self[S] = { window }; return self; },
    members: {
      serializeToString(node) {
        state(this);
        if (!node?.[S] || node[S].type === undefined) throw new TypeError("Failed to execute 'serializeToString' on 'XMLSerializer': parameter 1 is not of type 'Node'.");
        return serializeXML(node);
      },
    },
  },
];

// --- XPath ----------------------------------------------------------------------------
// The DOM standard's XPath interfaces: XPathResult, XPathExpression,
// XPathEvaluator and the XPathEvaluatorBase members of Document
// (evaluate, createExpression, createNSResolver). The XPath 1.0 engine
// (src/xpath.js) is loaded the first time an expression is compiled, like
// parse5 for HTML, through a loader the Node entry registers
// (setXPathLoader), so these interfaces cost a few small functions until
// then.

let loadXPath = null;
let engine = null;

// Registers how to load src/xpath.js synchronously (the Node entry uses
// require).
export function setXPathLoader(loader) {
  loadXPath = loader;
  engine = null;
}

function getEngine() {
  if (engine === null) {
    if (!loadXPath) throw new Error('warpdom: no XPath engine available. Import warpdom from Node, or call setXPathLoader().');
    engine = loadXPath().createXPath({ S, HTML_NS, XML_NS, XMLNS_NS, attrNode, elementById, domError });
  }
  return engine;
}

const RESULT_TYPES = {
  ANY_TYPE: 0, NUMBER_TYPE: 1, STRING_TYPE: 2, BOOLEAN_TYPE: 3, UNORDERED_NODE_ITERATOR_TYPE: 4, ORDERED_NODE_ITERATOR_TYPE: 5,
  UNORDERED_NODE_SNAPSHOT_TYPE: 6, ORDERED_NODE_SNAPSHOT_TYPE: 7, ANY_UNORDERED_NODE_TYPE: 8, FIRST_ORDERED_NODE_TYPE: 9,
};

const isNode = (v) => v != null && typeof v === 'object' && typeof v[S]?.type === 'number';

function checkNode(node, method, interfaceName) {
  if (!isNode(node)) throw new TypeError(`Failed to execute '${method}' on '${interfaceName}': parameter is not of type 'Node'.`);
}

function checkResolver(resolver, method, interfaceName) {
  if (resolver == null) return null;
  if (typeof resolver !== 'object' && typeof resolver !== 'function') {
    throw new TypeError(`Failed to execute '${method}' on '${interfaceName}': The provided value is not of type 'XPathNSResolver'.`);
  }
  return resolver;
}

// WebIDL unsigned short.
const unsignedShort = (v) => { const n = Number(v); return Number.isFinite(n) ? ((Math.trunc(n) % 65536) + 65536) % 65536 : 0; };

// Evaluates a compiled expression and makes its XPathResult (DOM,
// "evaluate"): node-sets for the node-set types, a type error otherwise.
function makeResult(window, compiled, contextNode, typeArg) {
  const type = unsignedShort(typeArg);
  if (type > 9) throw domError('The result type is not one of the XPathResult types.', 'NotSupportedError');
  const xp = getEngine();
  const value = xp.run(compiled, contextNode);
  const nodes = xp.isNodeSet(value);
  let resultType = type;
  let stored = value;
  switch (type) {
    case 0: resultType = nodes ? 4 : typeof value === 'number' ? 1 : typeof value === 'string' ? 2 : 3; break;
    case 1: stored = xp.toNumber(value); break;
    case 2: stored = xp.toString(value); break;
    case 3: stored = xp.toBoolean(value); break;
    default:
      if (!nodes) throw new TypeError(`The expression '${compiled.text}' does not evaluate to a node-set, so it cannot be converted to the result type ${type}.`);
  }
  const doc = contextNode[S].doc;
  const result = Object.create(window[S].protos.XPathResult);
  result[S] = {
    xpathResult: true, type: resultType, value: stored, index: 0, doc,
    // jsdom 30 invalidates iterators on tree and attribute changes, as the
    // standard says; earlier jsdom versions did not.
    rev: window[S].compat?.jsdom >= 30 ? doc[S].treeRev ?? 0 : -1,
  };
  return result;
}

function compileWith(window, expression, resolver) {
  return getEngine().compile(typeof expression === 'string' ? expression : String(expression), resolver, (error) => reportError(window, error));
}

function resultState(result) {
  const s = state(result);
  if (s.xpathResult !== true) throw new TypeError('Illegal invocation');
  return s;
}

function expectType(s, types, member) {
  if (!types.includes(s.type)) throw new TypeError(`Failed to read the '${member}' property from 'XPathResult': The result type is not ${types.length > 1 ? 'one of the types' : 'the type'} for which it is defined.`);
}

const iteratorInvalid = (s) => (s.type === 4 || s.type === 5) && s.rev !== -1 && (s.doc[S].treeRev ?? 0) !== s.rev;

// The XPathEvaluatorBase members, for Document and XPathEvaluator (whose
// state has the window).
export const XPATH_EVALUATOR_MEMBERS = {
  createExpression(expression, resolver = null) {
    const { window } = state(this);
    const r = checkResolver(resolver, 'createExpression', 'Document');
    const compiled = compileWith(window, expression, r);
    const expr = Object.create(window[S].protos.XPathExpression);
    expr[S] = { xpathExpression: true, compiled, window };
    return expr;
  },
  createNSResolver(nodeResolver) {
    state(this);
    checkNode(nodeResolver, 'createNSResolver', 'Document');
    return nodeResolver;
  },
  evaluate(expression, contextNode, resolver = null, type = 0, result = null) {
    const { window } = state(this);
    const text = typeof expression === 'string' ? expression : String(expression);
    checkNode(contextNode, 'evaluate', 'Document');
    const r = checkResolver(resolver, 'evaluate', 'Document');
    if (result != null && result[S]?.xpathResult !== true) throw new TypeError("Failed to execute 'evaluate' on 'Document': parameter 5 is not of type 'XPathResult'.");
    return makeResult(window, compileWith(window, text, r), contextNode, type);
  },
};

const constants = Object.fromEntries(Object.entries(RESULT_TYPES).map(([k, v]) => [k, { constant: v }]));

export const XPATH_INTERFACES = [
  {
    name: 'XPathResult',
    statics: RESULT_TYPES,
    members: {
      ...constants,
      get resultType() { return resultState(this).type; },
      get numberValue() { const s = resultState(this); expectType(s, [1], 'numberValue'); return s.value; },
      get stringValue() { const s = resultState(this); expectType(s, [2], 'stringValue'); return s.value; },
      get booleanValue() { const s = resultState(this); expectType(s, [3], 'booleanValue'); return s.value; },
      get singleNodeValue() { const s = resultState(this); expectType(s, [8, 9], 'singleNodeValue'); return s.value[0] ?? null; },
      get invalidIteratorState() { return iteratorInvalid(resultState(this)); },
      get snapshotLength() { const s = resultState(this); expectType(s, [6, 7], 'snapshotLength'); return s.value.length; },
      iterateNext() {
        const s = resultState(this);
        if (s.type !== 4 && s.type !== 5) throw new TypeError("Failed to execute 'iterateNext' on 'XPathResult': The result type is not an iterator type.");
        if (iteratorInvalid(s)) throw domError('The document has mutated since the result was returned.', 'InvalidStateError');
        return s.index < s.value.length ? s.value[s.index++] : null;
      },
      snapshotItem(index) {
        const s = resultState(this);
        if (s.type !== 6 && s.type !== 7) throw new TypeError("Failed to execute 'snapshotItem' on 'XPathResult': The result type is not a snapshot type.");
        return s.value[Number(index) >>> 0] ?? null;
      },
    },
  },
  {
    name: 'XPathExpression',
    members: {
      evaluate(contextNode, type = 0, result = null) {
        const s = state(this);
        if (s.xpathExpression !== true) throw new TypeError('Illegal invocation');
        checkNode(contextNode, 'evaluate', 'XPathExpression');
        if (result != null && result[S]?.xpathResult !== true) throw new TypeError("Failed to execute 'evaluate' on 'XPathExpression': parameter 3 is not of type 'XPathResult'.");
        return makeResult(s.window, s.compiled, contextNode, type);
      },
    },
  },
  {
    name: 'XPathEvaluator',
    members: XPATH_EVALUATOR_MEMBERS,
    construct: (w, self) => { self[S] = { window: w }; return self; },
  },
];
