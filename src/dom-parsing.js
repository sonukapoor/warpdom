// DOMParser and XMLSerializer (DOM Parsing and Serialization).
// parseFromString parses HTML with parse5 into a new document; XML parsing
// is not implemented yet. serializeToString follows the standard's XML
// serialization algorithm, without the well-formedness checks (as
// serializeToString requires).
import { S, state, HTML_NS, ELEMENT_NODE, TEXT_NODE, COMMENT_NODE, DOCUMENT_NODE, DOCUMENT_FRAGMENT_NODE, DOCUMENT_TYPE_NODE } from './internal.js';
import { XML_NS, XMLNS_NS } from './attributes.js';
import { parseDocument, templateContent } from './html.js';

const PROCESSING_INSTRUCTION_NODE = 7;
const CDATA_SECTION_NODE = 4;

const SUPPORTED_TYPES = new Set(['text/html', 'text/xml', 'application/xml', 'application/xhtml+xml', 'image/svg+xml']);
const PARSER_ERROR_NS = 'http://www.mozilla.org/newlayout/xml/parsererror.xml';

function parseFromString(parser, string, type) {
  const window = state(parser).window;
  const t = String(type);
  if (!SUPPORTED_TYPES.has(t)) {
    throw new TypeError(`Failed to execute 'parseFromString' on 'DOMParser': parameter 2 '${t}' is not a valid enumeration value for SupportedType`);
  }
  const ws = window[S];
  if (t === 'text/html') {
    const doc = ws.createDocument({ contentType: 'text/html' });
    doc[S].url = ws.url.href;
    return parseDocument(doc, string);
  }
  // XML: not parsed yet. The result is what a failed parse gives: a
  // document whose element is a parsererror.
  ws.notImplemented("DOMParser's parseFromString() for XML documents");
  const doc = ws.createDocument({ contentType: t, xml: true });
  doc.appendChild(doc.createElementNS(PARSER_ERROR_NS, 'parsererror'));
  return doc;
}

// --- XML serialization --------------------------------------------------------------

const VOID = new Set(['area', 'base', 'basefont', 'bgsound', 'br', 'col', 'embed', 'frame', 'hr', 'img', 'input',
  'keygen', 'link', 'menuitem', 'meta', 'param', 'source', 'track', 'wbr']);

const escapeText = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escapeAttribute = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

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

function serializeAttributes(element, map, index, localPrefixes, ignoreDefaultNsAttribute) {
  let out = '';
  for (const attr of element.attributes) {
    const ns = attr.namespaceURI;
    let prefix = null;
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
  if (ns === HTML_NS && VOID.has(local)) return markup;
  for (let c = contentRoot[S].first; c; c = c[S].next) markup += serializeNode(c, inheritedNs, map, index);
  return `${markup}</${qualifiedName}>`;
}

function serializeDoctype(node) {
  const { name, publicId, systemId } = node;
  let out = `<!DOCTYPE ${name}`;
  if (publicId !== '') out += ` PUBLIC "${publicId}"`;
  else if (systemId !== '') out += ' SYSTEM';
  if (systemId !== '') out += ` "${systemId}"`;
  return `${out}>`;
}

function serializeNode(node, contextNs, map, index) {
  const s = node[S];
  switch (s.type) {
    case ELEMENT_NODE: return serializeElement(node, contextNs, map, index);
    case TEXT_NODE: return escapeText(s.data);
    case CDATA_SECTION_NODE: return `<![CDATA[${s.data}]]>`;
    case COMMENT_NODE: return `<!--${s.data}-->`;
    case PROCESSING_INSTRUCTION_NODE: return `<?${node.target} ${s.data}?>`;
    case DOCUMENT_TYPE_NODE: return serializeDoctype(node);
    case DOCUMENT_NODE: case DOCUMENT_FRAGMENT_NODE: {
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
