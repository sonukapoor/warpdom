// Base URLs (HTML standard, 2.4.1 and 4.2.3): a document's base URL is
// the frozen base URL of its first base element with an href attribute,
// else its fallback base URL (the document's URL). URL attributes,
// hyperlinks and Node.baseURI resolve against it.
//
// Documents count their base elements at creation (as for iframes and
// slots), so documents without any skip the search; with some, the result
// is cached until the document's trees or attributes change.
import { S, state, nextInTree, ELEMENT_NODE, DOCUMENT_NODE, HTML_NS, PlatformURL as URL } from './internal.js';
import { writeAttribute } from './attributes.js';

// The document's URL: its own, else its window's; for an iframe's
// about:blank document, its creator's base URL (frames.js: the creator
// document's, or the one kept from the first use).
export const fallbackBaseURL = (doc) => { const ds = doc[S]; return ds.url ?? (ds.aboutBase === undefined ? ds.window[S].url : aboutBaseURL(ds)); };
function aboutBaseURL(ds) {
  if (typeof ds.aboutBase === 'string') return ds.aboutBase;
  const url = toString(documentBaseURL(ds.aboutBase));
  if (ds.aboutBaseKept) ds.aboutBase = url;
  return url;
}

const toString = (url) => (typeof url === 'string' ? url : url.href);

// A base element's frozen base URL: its href resolved against the
// document's fallback base URL; the fallback itself when that fails.
function frozenBaseURL(base) {
  const fallback = toString(fallbackBaseURL(base[S].doc));
  try { return new URL(base[S].attrs.get('href'), fallback).href; } catch { return fallback; }
}

function firstBase(doc) {
  for (let n = doc[S].first; n; n = nextInTree(n, doc)) {
    const s = n[S];
    if (s.type === ELEMENT_NODE && s.tag === 'base' && s.ns === HTML_NS && s.attrs.has('href')) return n;
  }
  return null;
}

// The document's base URL, as a URL or a string (callers compare it for
// their caches and pass it to new URL()).
export function documentBaseURL(doc) {
  const ds = doc[S];
  const fallback = ds.url ?? (ds.aboutBase === undefined ? ds.window[S].url : aboutBaseURL(ds));
  if (!ds.baseCount) return fallback;
  const rev = ds.treeRev ?? 0;
  const cached = ds.baseURL;
  if (cached && cached.rev === rev && cached.fallback === fallback) return cached.url;
  const base = firstBase(doc);
  const url = base ? frozenBaseURL(base) : fallback;
  ds.baseURL = { rev, fallback, url };
  return url;
}

export function nodeBaseURI(node) {
  const s = state(node);
  return toString(documentBaseURL(s.type === DOCUMENT_NODE ? node : s.doc));
}

export const BASE_MEMBERS = {
  // The href resolved against the document's fallback base URL; as
  // written when it does not parse.
  get href() {
    const s = state(this);
    const fallback = toString(fallbackBaseURL(s.doc));
    const raw = s.attrs.get('href');
    if (raw === undefined) return fallback;
    try { return new URL(raw, fallback).href; } catch { return raw; }
  },
  set href(v) { state(this); writeAttribute(this, 'href', String(v)); },
};
