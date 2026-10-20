// XMLHttpRequest (XHR standard): XMLHttpRequestEventTarget,
// XMLHttpRequestUpload and XMLHttpRequest, on top of the host's fetch
// (looked up on the platform's global object when a request starts, so
// request mocking that replaces fetch, as msw and nock do, sees it). The
// core imports no Node built-ins.
//
// Behavior follows jsdom where tests can observe it (black box, jsdom 20
// to 30, PLAN.md 2026-10-20): the event sequence (readystatechange per
// received chunk, progress at HEADERS_RECEIVED for an empty body, upload
// events completed when the response's headers arrive), the CORS checks
// (preflight only for other methods, author headers other than Accept,
// Accept-Language, Content-Language and Content-Type, or upload listeners;
// allowed methods are not checked), the timeout steps and the state left
// after a timeout or abort, and the error messages. jsdom 20 to 27 made
// requests with Node's http module, jsdom 28 and later with undici; where
// the two generations differ, the profile decides (compat.xhrUndici).
//
// Differences that come from fetch (README): getAllResponseHeaders() lists
// the headers sorted by name with repeated headers combined (jsdom: as
// received); upload progress is not measured (the upload events report
// the whole body when the response's headers arrive, as jsdom's do);
// synchronous requests throw at send(); file: URLs fail; cookies are not
// sent or stored (jsdom shares its cookie jar with document.cookie).
import { S, state, domError, tooFewArguments, PLATFORM_GLOBAL, PlatformURL as URL, DOCUMENT_NODE } from './internal.js';
import { dispatch } from './events.js';
import { handlerMembers } from './event-handlers.js';
import { decodeText, encodingOf, bufferBytes, realmOf, utf8Encode } from './encoding.js';
import { blobData, makeBlob } from './file-reader.js';
import { documentBaseURL } from './base-url.js';
import { innerMarkup } from './dom-parsing.js';
import { parseDocument } from './html.js';
import { parseXMLDocument, PARSER_ERROR_NS } from './xml.js';
import { formDataEntries } from './forms.js';
import { userAgentOf } from './window-features.js';

// Timers of the host, taken when warpdom loads: a test's fake timers do
// not stop requests from completing or timing out (as with jsdom, whose
// requests run on Node's I/O).
const hostSetTimeout = globalThis.setTimeout;
const hostClearTimeout = globalThis.clearTimeout;

const UNSENT = 0, OPENED = 1, HEADERS_RECEIVED = 2, LOADING = 3, DONE = 4;
const STATES = { UNSENT, OPENED, HEADERS_RECEIVED, LOADING, DONE };

const TOKEN = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;
const INVALID_STATE = 'The object is in an invalid state.';
const RESPONSE_TYPES = new Set(['', 'arraybuffer', 'blob', 'document', 'json', 'text']);
const NORMALIZED_METHODS = new Set(['DELETE', 'GET', 'HEAD', 'OPTIONS', 'POST', 'PUT']);

// Forbidden request header names (Fetch, without Set-Cookie, which jsdom
// sends): setting one silently does nothing.
const FORBIDDEN_HEADERS = new Set(['accept-charset', 'accept-encoding', 'access-control-request-headers', 'access-control-request-method',
  'connection', 'content-length', 'cookie', 'cookie2', 'date', 'dnt', 'expect', 'host', 'keep-alive', 'origin', 'referer',
  'te', 'trailer', 'transfer-encoding', 'upgrade', 'via']);
const METHOD_OVERRIDE_HEADERS = new Set(['x-http-method', 'x-http-method-override', 'x-method-override']);
// Author headers that need no CORS preflight (jsdom: Content-Type with any value).
const SIMPLE_HEADERS = new Set(['accept', 'accept-language', 'content-language', 'content-type']);
// Response headers a cross-origin response exposes without
// Access-Control-Expose-Headers (CORS-safelisted response header names).
const SAFELISTED_RESPONSE = new Set(['cache-control', 'content-language', 'content-length', 'content-type', 'expires', 'last-modified', 'pragma']);

// --- MIME types (MIME Sniffing 4.4 and 4.5) ---------------------------------------------------

const HTTP_WS = /^[\t\n\r ]+|[\t\n\r ]+$/g;
const QUOTED_OK = /^[\t\u0020-\u007e\u0080-\u00ff]*$/;

function parseMime(input) {
  const s = String(input).replace(HTTP_WS, '');
  const slash = s.indexOf('/');
  if (slash <= 0) return null;
  const type = s.slice(0, slash);
  if (!TOKEN.test(type)) return null;
  let i = s.indexOf(';', slash);
  const subtype = (i === -1 ? s.slice(slash + 1) : s.slice(slash + 1, i)).replace(/[\t\n\r ]+$/, '');
  if (!TOKEN.test(subtype)) return null;
  const mime = { type: type.toLowerCase(), subtype: subtype.toLowerCase(), params: new Map() };
  while (i !== -1 && i < s.length) {
    i++;
    while (i < s.length && /[\t\n\r ]/.test(s[i])) i++;
    let end = i;
    while (end < s.length && s[end] !== ';' && s[end] !== '=') end++;
    const name = s.slice(i, end).toLowerCase();
    i = end;
    if (i >= s.length) break;
    if (s[i] === ';') continue;
    i++;
    let value;
    if (s[i] === '"') {
      value = '';
      i++;
      while (i < s.length && s[i] !== '"') {
        if (s[i] === '\\' && i + 1 < s.length) i++;
        value += s[i++];
      }
      i = s.indexOf(';', i);
    } else {
      end = s.indexOf(';', i);
      value = (end === -1 ? s.slice(i) : s.slice(i, end)).replace(/[\t\n\r ]+$/, '');
      i = end;
      if (value === '') continue;
    }
    if (name !== '' && TOKEN.test(name) && QUOTED_OK.test(value) && !mime.params.has(name)) mime.params.set(name, value);
  }
  return mime;
}

const essence = (mime) => `${mime.type}/${mime.subtype}`;

function serializeMime(mime) {
  let out = essence(mime);
  for (const [name, value] of mime.params) {
    out += `;${name}=${value === '' || !TOKEN.test(value) ? `"${value.replace(/["\\]/g, '\\$&')}"` : value}`;
  }
  return out;
}

const isXmlMime = (mime) => {
  const e = essence(mime);
  return e === 'text/xml' || e === 'application/xml' || mime.subtype.endsWith('+xml');
};

// --- events -----------------------------------------------------------------------------------

function fireProgress(target, window, type, loaded = 0, total = 0, computable = false) {
  const ProgressEvent = window[S].protos.ProgressEvent.constructor;
  dispatch(target, new ProgressEvent(type, { lengthComputable: computable, loaded, total }));
}

function fireStateChange(xhr, window) {
  const Event = window[S].protos.Event.constructor;
  dispatch(xhr, new Event('readystatechange'));
}

// --- state ------------------------------------------------------------------------------------

const xhrState = (self) => {
  const s = state(self);
  if (s.xhr !== true) throw new TypeError('Illegal invocation');
  return s;
};

// A response: status, statusText, url, headers (a fetch Headers, or null
// for a network error), exposed (for a cross-origin response: the header
// names it exposes, or null for all) and the body received so far.
const networkError = () => ({ status: 0, statusText: '', url: '', headers: null, exposed: null, chunks: [], length: 0, bytes: null, total: 0, computable: false });

function responseBytes(r) {
  if (r.bytes !== null && r.bytes.length === r.length) return r.bytes;
  const bytes = new Uint8Array(r.length);
  let at = 0;
  for (const c of r.chunks) { bytes.set(c, at); at += c.length; }
  r.chunks = r.length ? [bytes] : [];
  r.bytes = bytes;
  return bytes;
}

// The final MIME type: the override, else the response's Content-Type
// (null when there is none or it does not parse).
function finalMime(s) {
  if (s.overrideMime !== null) return s.overrideMime;
  const header = s.response.headers?.get('content-type');
  return header == null ? null : parseMime(header);
}

// Decodes the response body as text: a byte order mark, else the final
// MIME type's charset, else UTF-8.
function decodeBody(s, bytes) {
  return decodeText(bytes, finalMime(s)?.params.get('charset'));
}

function encodingName(s, bytes) {
  let name = null;
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) name = 'utf-8';
  else if (bytes[0] === 0xfe && bytes[1] === 0xff) name = 'utf-16be';
  else if (bytes[0] === 0xff && bytes[1] === 0xfe) name = 'utf-16le';
  else {
    const label = finalMime(s)?.params.get('charset');
    const e = label === undefined ? null : encodingOf(label);
    name = e === null || e === 'replacement' ? 'utf-8' : e;
  }
  return name === 'utf-8' ? 'UTF-8' : name.startsWith('utf-16') ? name.toUpperCase() : name;
}

function responseText(s) {
  if (s.state !== LOADING && s.state !== DONE) return '';
  const r = s.response;
  if (s.text !== null && s.text.length === r.length) return s.text.value;
  const value = decodeBody(s, responseBytes(r));
  s.text = { length: r.length, value };
  return value;
}

// The document response (XHR 3.6.7): HTML only for responseType
// 'document'; XML for XML MIME types (or none); null for a parse error.
function documentResponse(s) {
  const r = s.response;
  const mime = finalMime(s) ?? { type: 'text', subtype: 'xml', params: new Map() };
  const html = essence(mime) === 'text/html';
  if (!html && !isXmlMime(mime)) return null;
  if (html && s.responseType === '') return null;
  const bytes = responseBytes(r);
  const text = decodeBody(s, bytes);
  const ws = s.window[S];
  const url = r.url;
  if (html) {
    const doc = ws.createDocument({ contentType: 'text/html' });
    doc[S].url = url;
    doc[S].charset = encodingName(s, bytes);
    return parseDocument(doc, text, false);
  }
  const doc = ws.createDocument({ contentType: 'application/xml', xml: true, plain: true });
  doc[S].url = url;
  doc[S].charset = encodingName(s, bytes);
  parseXMLDocument(doc, text);
  const root = doc[S].first;
  if (root !== null && root[S].ns === PARSER_ERROR_NS && root[S].tag === 'parsererror' && root[S].next === null) return null;
  return doc;
}

// --- request bodies ---------------------------------------------------------------------------

// A multipart/form-data boundary in the form jsdom's has: 24 digits, hex
// digits before jsdom 26.
function boundary(legacy) {
  let digits = '';
  for (let i = 0; i < 24; i++) digits += Math.floor(Math.random() * (legacy ? 16 : 10)).toString(16);
  return `--------------------------${digits}`;
}

// Line breaks in names and string values are normalized to CRLF (from
// jsdom 26; filenames never); names and filenames have line breaks and
// quotes percent-encoded.
const crlf = (s, legacy) => (legacy ? s : s.replace(/\r\n|\r|\n/g, '\r\n'));
const escapeName = (name) => name.replace(/\n/g, '%0A').replace(/\r/g, '%0D').replace(/"/g, '%22');

function multipart(entries, legacy) {
  const b = boundary(legacy);
  const parts = [];
  for (const { name, value } of entries) {
    let head = `--${b}\r\nContent-Disposition: form-data; name="${escapeName(crlf(name, legacy))}"`;
    if (typeof value === 'string') {
      parts.push(utf8Encode(`${head}\r\n\r\n${crlf(value, legacy)}\r\n`));
      continue;
    }
    const file = blobData(value);
    head += `; filename="${escapeName(file.name ?? 'blob')}"\r\nContent-Type: ${file.type || 'application/octet-stream'}\r\n\r\n`;
    parts.push(utf8Encode(head), file.bytes, utf8Encode('\r\n'));
  }
  parts.push(utf8Encode(`--${b}--\r\n`));
  return { bytes: concat(parts), type: `multipart/form-data; boundary=${b}` };
}

function concat(parts) {
  let size = 0;
  for (const p of parts) size += p.length;
  const out = new Uint8Array(size);
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
}

const PlatformBlob = PLATFORM_GLOBAL.Blob;

// Extracts a body (Fetch's "extract", with XHR's document and string
// cases): { body (bytes or a platform Blob), length, type, text (string or
// document: the Content-Type charset is set to UTF-8) }. jsdom before 28
// sends text/plain;charset=UTF-8 for buffers and type-less blobs.
// Bytes go to fetch as a platform Blob where there is one: undici detaches
// a typed array body, and cannot send it again after a 307 or 308 redirect.
const bodyOf = (bytes) => (typeof PlatformBlob === 'function' ? new PlatformBlob([bytes]) : bytes);

function extractBody(body, legacy, legacyMultipart) {
  const fallback = legacy ? 'text/plain;charset=UTF-8' : null;
  if (body?.[S]?.type === DOCUMENT_NODE) {
    const bytes = utf8Encode(innerMarkup(body));
    return { body: bodyOf(bytes), length: bytes.length, type: body[S].xml ? 'application/xml;charset=UTF-8' : 'text/html;charset=UTF-8', text: true };
  }
  const blob = blobData(body);
  if (blob !== undefined) return { body: bodyOf(blob.bytes), length: blob.bytes.length, type: blob.type || fallback, text: false };
  if (typeof PlatformBlob === 'function' && body instanceof PlatformBlob) return { body, length: body.size, type: body.type || fallback, text: false };
  const view = bufferBytes(body);
  if (view !== null) { const bytes = view.slice(); return { body: bodyOf(bytes), length: bytes.length, type: fallback, text: false }; }
  const entries = formDataEntries(body);
  if (entries !== null) { const { bytes, type } = multipart(entries, legacyMultipart); return { body: bodyOf(bytes), length: bytes.length, type, text: false }; }
  // Strings, and everything else (URLSearchParams too, as in jsdom) as a string.
  const bytes = utf8Encode(String(body).toWellFormed?.() ?? String(body));
  return { body: bodyOf(bytes), length: bytes.length, type: 'text/plain;charset=UTF-8', text: true };
}

// --- CORS (Fetch 3.2, as jsdom checks it) -------------------------------------------------------

// Why a response fails the CORS check, in jsdom's words, or null.
function corsError(response, origin, credentials) {
  const allow = response.headers.get('access-control-allow-origin');
  if (allow === '*' && !credentials) return null;
  if (allow === '*' || (allow === origin && credentials && response.headers.get('access-control-allow-credentials') !== 'true')) return 'Credentials forbidden';
  return allow === origin ? null : `Cross origin ${origin} forbidden`;
}

const headerList = (value) => (value ?? '').split(',').map((v) => v.trim().toLowerCase()).filter((v) => v !== '');

// --- the request ------------------------------------------------------------------------------

// Request error steps (XHR 3.6.6): error, abort (the response is already a
// network error) or timeout (jsdom's sequence, with a progress event first).
function requestError(xhr, s, type) {
  const window = s.window;
  const upload = s.upload;
  const uploadPending = !s.uploadComplete;
  s.uploadComplete = true;
  const uploadEvents = uploadPending && s.uploadListener && upload !== null;
  if (type === 'timeout') {
    if (uploadPending) { if (uploadEvents) fireProgress(upload, window, 'progress'); } else fireProgress(xhr, window, 'progress');
  }
  s.state = DONE;
  s.send = false;
  fireStateChange(xhr, window);
  if (uploadEvents) {
    fireProgress(upload, window, type);
    fireProgress(upload, window, 'loadend');
  }
  if (type === 'timeout' && uploadPending) fireProgress(xhr, window, 'progress');
  fireProgress(xhr, window, type);
  fireProgress(xhr, window, 'loadend');
}

function stop(s) {
  const req = s.req;
  if (req === null) return;
  s.req = null;
  if (req.timer !== null) hostClearTimeout(req.timer);
  req.timer = null;
  s.window[S].pendingRequests?.delete(req);
  try { req.controller?.abort(); } catch { /* the host's abort */ }
}

// A network error from fetch, a CORS check or the body stream. jsdom 20
// to 26 also report the reason on the virtual console.
function fail(xhr, s, req, message) {
  if (s.req !== req) return;
  stop(s);
  s.response = networkError();
  s.responseObject = undefined;
  s.text = null;
  if (s.window[S].compat.jsdom < 27 && message) s.window[S].reportNotImplemented(message, 'XMLHttpRequest');
  requestError(xhr, s, 'error');
}

function timedOut(xhr, s, req) {
  if (s.req !== req) return;
  stop(s);
  requestError(xhr, s, 'timeout');
  // As jsdom: the request ends UNSENT, without its headers and body (its
  // status, status text and URL stay).
  if (s.state === DONE) {
    s.state = UNSENT;
    s.response = { ...s.response, headers: null, exposed: null, chunks: [], length: 0, bytes: null };
    s.responseObject = undefined;
    s.text = null;
  }
}

function armTimeout(xhr, s, req) {
  if (req.timer !== null) hostClearTimeout(req.timer);
  req.timer = null;
  if (s.timeout === 0) return;
  const remaining = Math.max(0, s.timeout - (Date.now() - req.start));
  req.timer = hostSetTimeout(() => { req.timer = null; timedOut(xhr, s, req); }, remaining);
}

function completeUpload(s, req, cross) {
  if (s.uploadComplete) return true;
  s.uploadComplete = true;
  const upload = s.upload;
  // jsdom before 28 completes no upload to a data: URL.
  if (!s.uploadListener || upload === null || (req.data && !s.window[S].compat.xhrUndici)) return true;
  const window = s.window;
  // jsdom before 28: cross-origin requests' upload events carry no lengths.
  const [loaded, computable] = cross && !s.window[S].compat.xhrUndici ? [0, false] : [req.length, true];
  fireProgress(upload, window, 'progress', loaded, loaded, computable);
  if (s.req !== req) return false;
  fireProgress(upload, window, 'load', loaded, loaded, computable);
  if (s.req !== req) return false;
  fireProgress(upload, window, 'loadend', loaded, loaded, computable);
  return s.req === req;
}

async function run(xhr, s, req) {
  const window = s.window;
  const compat = window[S].compat;
  const fetch = PLATFORM_GLOBAL.fetch;
  if (typeof fetch !== 'function') { fail(xhr, s, req, 'fetch is not available'); return; }
  const { url, method, origin, cross, credentials } = req;
  let response;
  try {
    if (req.preflight) {
      const headers = { Origin: origin, 'Access-Control-Request-Method': method, 'User-Agent': req.userAgent, Accept: '*/*', 'Accept-Language': 'en' };
      if (req.unsafe.length) headers['Access-Control-Request-Headers'] = req.unsafe.join(', ');
      const preflight = await fetch(req.fetchURL, { method: 'OPTIONS', headers, redirect: 'manual', signal: req.controller.signal });
      if (s.req !== req) return;
      preflight.body?.cancel().catch(() => {});
      if (preflight.status < 200 || preflight.status > 299) { fail(xhr, s, req, `Error: Response for preflight has invalid HTTP status code ${preflight.status}`); return; }
      const denied = corsError(preflight, origin, credentials);
      if (denied !== null) { fail(xhr, s, req, denied); return; }
      const allowed = headerList(preflight.headers.get('access-control-allow-headers'));
      const missing = allowed.includes('*') ? [] : req.unsafe.filter((name) => !allowed.includes(name.toLowerCase()));
      if (missing.length) { fail(xhr, s, req, `Headers ${missing.join(', ')} forbidden`); return; }
    }
    response = await fetch(req.fetchURL, { method, headers: req.headers, body: req.body, redirect: 'follow', signal: req.controller.signal });
  } catch (error) {
    const reason = error?.cause?.message || error?.cause?.name || error?.message;
    fail(xhr, s, req, reason === 'redirect count exceeded' ? 'Error: Maximum number of redirects exceeded' : reason);
    return;
  }
  if (s.req !== req) { response.body?.cancel().catch(() => {}); return; }
  const finalURL = response.redirected ? response.url : url;
  const finalOrigin = response.redirected ? new URL(response.url).origin : null;
  const finalCross = cross || (response.redirected && finalOrigin !== origin);
  // jsdom before 28: a cross-origin request redirected to another origin
  // has the origin null (a tainted origin), even back to the document's.
  const tainted = cross && response.redirected && !compat.xhrUndici && finalOrigin !== new URL(url).origin;
  const denied = finalCross || tainted ? corsError(response, tainted ? 'null' : origin, credentials) : null;
  if (denied !== null && !/^(data|blob):/.test(finalURL)) {
    response.body?.cancel().catch(() => {});
    fail(xhr, s, req, denied);
    return;
  }
  let exposed = null;
  if (finalCross) {
    const list = headerList(response.headers.get('access-control-expose-headers'));
    exposed = list.includes('*') && !credentials && compat.xhrUndici ? null : new Set([...SAFELISTED_RESPONSE, ...list]);
  }
  const length = response.headers.get('content-length');
  const total = length !== null && /^\d+$/.test(length) && !response.headers.has('content-encoding') ? Number(length) : 0;
  // As jsdom, the URL keeps its fragment when there was no redirect.
  s.response = { status: response.status, statusText: response.statusText, url: finalURL, headers: response.headers, exposed,
    chunks: [], length: 0, bytes: null, total, computable: total !== 0 };
  s.responseObject = undefined;
  s.text = null;

  // jsdom 28 and later complete the upload before HEADERS_RECEIVED, earlier
  // ones after it.
  if (compat.xhrUndici && !completeUpload(s, req, cross)) return;
  s.state = HEADERS_RECEIVED;
  fireStateChange(xhr, window);
  if (s.req !== req) { response.body?.cancel().catch(() => {}); return; }
  if (!compat.xhrUndici && !completeUpload(s, req, cross)) { response.body?.cancel().catch(() => {}); return; }

  const r = s.response;
  if (response.body !== null) {
    const reader = response.body.getReader();
    for (;;) {
      let chunk;
      try {
        chunk = await reader.read();
      } catch (error) {
        fail(xhr, s, req, error?.message);
        return;
      }
      if (s.req !== req) { reader.cancel().catch(() => {}); return; }
      if (chunk.done) break;
      if (chunk.value.length === 0) continue;
      r.chunks.push(chunk.value);
      r.length += chunk.value.length;
      s.state = LOADING;
      fireStateChange(xhr, window);
      if (s.req !== req) { reader.cancel().catch(() => {}); return; }
      fireProgress(xhr, window, 'progress', r.length, r.total, r.computable);
      if (s.req !== req) { reader.cancel().catch(() => {}); return; }
    }
  }
  // An empty body: jsdom 28 and later fire one progress event, in HEADERS_RECEIVED.
  if (r.length === 0 && compat.xhrUndici) {
    fireProgress(xhr, window, 'progress', 0, r.total, r.computable);
    if (s.req !== req) return;
  }
  stop(s);
  s.state = DONE;
  s.send = false;
  fireStateChange(xhr, window);
  fireProgress(xhr, window, 'load', r.length, r.total, r.computable);
  fireProgress(xhr, window, 'loadend', r.length, r.total, r.computable);
}

// --- the interface ----------------------------------------------------------------------------

function send(xhr, s, body) {
  if (s.state !== OPENED || s.send) throw domError(INVALID_STATE, 'InvalidStateError');
  if (s.sync) {
    throw domError('warpdom does not support synchronous XMLHttpRequest (open() with async set to false): its core cannot block on a request. '
      + 'Make the request asynchronous, or run this test with jsdom.', 'NotSupportedError');
  }
  const window = s.window;
  const compat = window[S].compat;
  const legacy = !compat.xhrUndici;
  const method = s.method;
  const extracted = body === undefined || body === null || method === 'GET' || method === 'HEAD' ? null : extractBody(body, legacy, compat.jsdom < 26);

  const headers = {};
  const names = new Map(); // lowercase -> name as sent
  for (const [name, value] of s.headers) { headers[name] = value; names.set(name.toLowerCase(), name); }
  if (extracted !== null) {
    const contentType = names.get('content-type');
    if (contentType !== undefined) {
      if (extracted.text) {
        const mime = parseMime(headers[contentType]);
        const charset = mime?.params.get('charset');
        if (mime !== null && charset !== undefined && charset.toLowerCase() !== 'utf-8') {
          mime.params.set('charset', 'UTF-8');
          headers[contentType] = serializeMime(mime);
        }
      }
    } else if (extracted.type !== null) {
      headers['Content-Type'] = extracted.type;
    }
  }

  const doc = window.document;
  const docURL = new URL(doc[S].url ?? window[S].url);
  const origin = docURL.origin;
  const url = s.url;
  const httpLike = url.protocol === 'http:' || url.protocol === 'https:';
  const cross = httpLike && url.origin !== origin;
  if (!names.has('accept')) headers.Accept = '*/*';
  if (!names.has('accept-language')) headers['Accept-Language'] = 'en';
  // The author may set User-Agent (no longer a forbidden header).
  const userAgent = names.has('user-agent') ? headers[names.get('user-agent')] : (headers['User-Agent'] = userAgentOf(window));
  headers['Accept-Encoding'] = 'gzip, deflate';
  if (docURL.protocol === 'http:' || docURL.protocol === 'https:') { docURL.hash = ''; headers.Referer = docURL.href; }
  if (cross) headers.Origin = origin;
  // The fetch URL has no credentials (fetch rejects them); jsdom 20 sends
  // them as Basic authorization.
  let fetchURL = url.href;
  if (url.username !== '' || url.password !== '') {
    const plain = new URL(url.href);
    plain.username = '';
    plain.password = '';
    fetchURL = plain.href;
    if (compat.jsdom < 21 && !names.has('authorization')) headers.Authorization = `Basic ${btoa(`${decodeURIComponent(url.username)}:${decodeURIComponent(url.password)}`)}`;
  }

  // An empty body has no upload events, as in jsdom.
  s.uploadComplete = extracted === null || extracted.length === 0;
  s.uploadListener = s.upload !== null && s.upload[S].listeners !== undefined;
  s.send = true;
  const unsafe = [...names.entries()].filter(([lower]) => !SIMPLE_HEADERS.has(lower)).map(([, name]) => name);
  const req = {
    url: url.href, fetchURL, method: legacy && method.toUpperCase() === 'PATCH' ? 'PATCH' : method, headers, body: extracted?.body ?? null, length: extracted?.length ?? 0,
    origin, cross, credentials: s.withCredentials, unsafe, userAgent, data: url.protocol === 'data:',
    preflight: cross && (!['GET', 'HEAD', 'POST'].includes(method) || unsafe.length > 0 || s.uploadListener),
    controller: typeof AbortController === 'function' ? new AbortController() : null, timer: null, start: Date.now(),
  };
  s.req = req;
  const pending = window[S].pendingRequests ?? (window[S].pendingRequests = new Set());
  pending.add(req);
  req.abort = () => stop(s);

  fireProgress(xhr, window, 'loadstart', 0, 0, false);
  if (s.state !== OPENED || !s.send || s.req !== req) return;
  if (!s.uploadComplete && s.uploadListener) {
    const [total, computable] = (cross || req.data) && legacy ? [0, false] : [req.length, true];
    fireProgress(s.upload, window, 'loadstart', 0, total, computable);
    if (s.state !== OPENED || !s.send || s.req !== req) return;
  }
  armTimeout(xhr, s, req);
  run(xhr, s, req);
}

function open(xhr, s, method, url, rest) {
  const window = s.window;
  const legacy = !window[S].compat.xhrUndici;
  const m = String(method);
  if (!TOKEN.test(m)) throw domError('The string did not match the expected pattern.', 'SyntaxError');
  const upper = m.toUpperCase();
  if (upper === 'CONNECT' || upper === 'TRACE' || upper === 'TRACK') throw domError('The operation is insecure.', 'SecurityError');
  let parsed;
  try {
    parsed = new URL(String(url), documentBaseURL(window.document));
  } catch {
    throw domError('The string did not match the expected pattern.', 'SyntaxError');
  }
  // open(method, url) is asynchronous; with a third argument, its boolean
  // value decides (undefined is false).
  const sync = rest.length > 0 && !rest[0];
  if (sync && (s.timeout !== 0 || s.responseType !== '')) throw domError('The object does not support the operation or argument.', 'InvalidAccessError');
  stop(s);
  s.send = false;
  s.uploadListener = false;
  s.method = NORMALIZED_METHODS.has(upper) ? upper : m;
  s.url = parsed;
  s.sync = sync;
  s.headers = [];
  // jsdom before 28 keeps the previous response's status and status text.
  const previous = s.response;
  s.response = networkError();
  if (legacy) { s.response.status = previous.status; s.response.statusText = previous.statusText; }
  s.responseObject = undefined;
  s.text = null;
  if (s.state !== OPENED) {
    s.state = OPENED;
    fireStateChange(xhr, window);
  }
}

function setRequestHeader(s, name, value) {
  const legacy = !s.window[S].compat.xhrUndici;
  if (s.state !== OPENED) throw domError(legacy ? INVALID_STATE : 'setRequestHeader() can only be called in the OPENED state.', 'InvalidStateError');
  if (s.send) throw domError(legacy ? INVALID_STATE : 'setRequestHeader() cannot be called after send()', 'InvalidStateError');
  const n = byteString(name, 1);
  const v = byteString(value, 2).replace(/^[\t\n\r ]+|[\t\n\r ]+$/g, '');
  if (!TOKEN.test(n)) throw domError(legacy ? 'The string did not match the expected pattern.' : 'Invalid header name', 'SyntaxError');
  if (/[\0\r\n]/.test(v)) throw domError(legacy ? 'The string did not match the expected pattern.' : 'Invalid header value', 'SyntaxError');
  const lower = n.toLowerCase();
  if (FORBIDDEN_HEADERS.has(lower) || lower.startsWith('proxy-') || lower.startsWith('sec-')) return;
  if (!legacy && METHOD_OVERRIDE_HEADERS.has(lower) && v.split(',').some((part) => /^(CONNECT|TRACE|TRACK)$/i.test(part.trim()))) return;
  const existing = s.headers.find((h) => h[0].toLowerCase() === lower);
  if (existing) existing[1] = `${existing[1]}, ${v}`;
  else s.headers.push([n, v]);
}

function byteString(value, index) {
  const s = String(value);
  // eslint-disable-next-line no-control-regex
  if (/[^\u0000-\u00ff]/.test(s)) throw new TypeError(`Failed to execute 'setRequestHeader' on 'XMLHttpRequest': parameter ${index} is not a valid ByteString.`);
  return s;
}

// Whether a response header is visible to the page.
const visible = (r, name) => name !== 'set-cookie' && name !== 'set-cookie2' && (r.exposed === null || r.exposed.has(name));

function response(s) {
  const type = s.responseType;
  if (type === '' || type === 'text') return responseText(s);
  const r = s.response;
  // jsdom gives the bytes received so far for arraybuffer and blob before DONE.
  if (s.state !== DONE) {
    if ((type === 'arraybuffer' || type === 'blob') && (s.state === HEADERS_RECEIVED || s.state === LOADING)) return binaryResponse(s, type, responseBytes(r).slice());
    return null;
  }
  if (s.responseObject !== undefined) return s.responseObject;
  let value;
  if (type === 'arraybuffer' || type === 'blob') {
    value = binaryResponse(s, type, responseBytes(r).slice());
  } else if (type === 'json') {
    value = null;
    if (r.length !== 0) {
      try { value = realmOf(s.window).JSON.parse(decodeText(responseBytes(r), 'utf-8')); } catch { value = null; }
    }
  } else {
    value = documentResponse(s);
  }
  s.responseObject = value;
  return value;
}

function binaryResponse(s, type, bytes) {
  if (type === 'arraybuffer') {
    const AB = realmOf(s.window).Uint8Array;
    return (AB === Uint8Array ? bytes : new AB(bytes)).buffer;
  }
  const mime = s.overrideMime;
  const blobType = mime !== null ? essence(mime) : s.response.headers?.get('content-type') ?? '';
  return makeBlob(s.window, bytes, /[^\x20-\x7e]/.test(blobType) ? '' : blobType.toLowerCase());
}

const HANDLERS = ['onloadstart', 'onprogress', 'onabort', 'onerror', 'onload', 'ontimeout', 'onloadend'];

function uploadOf(s) {
  if (s.upload === null) {
    const upload = Object.create(s.window[S].protos.XMLHttpRequestUpload);
    upload[S] = { window: s.window };
    s.upload = upload;
  }
  return s.upload;
}

export const XHR_INTERFACES = [
  // Not constructible (illegal constructor), as in jsdom.
  { name: 'XMLHttpRequestEventTarget', parent: 'EventTarget', members: handlerMembers(HANDLERS) },
  { name: 'XMLHttpRequestUpload', parent: 'XMLHttpRequestEventTarget', members: {} },
  {
    name: 'XMLHttpRequest',
    parent: 'XMLHttpRequestEventTarget',
    statics: STATES,
    construct: (window, self) => {
      self[S] = {
        xhr: true, window, state: UNSENT, send: false, sync: false, method: 'GET', url: null, headers: [], timeout: 0, withCredentials: false,
        responseType: '', overrideMime: null, upload: null, uploadComplete: true, uploadListener: false, req: null,
        response: networkError(), responseObject: undefined, text: null,
      };
      return self;
    },
    members: {
      ...handlerMembers(['onreadystatechange']),
      ...Object.fromEntries(Object.entries(STATES).map(([k, v]) => [k, { constant: v }])),
      get readyState() { return xhrState(this).state; },
      open(method, url, ...rest) {
        const s = xhrState(this);
        if (url === undefined && arguments.length < 2) tooFewArguments('XMLHttpRequest', 'open', 2, arguments.length);
        open(this, s, method, url, rest);
      },
      setRequestHeader(name, value) {
        const s = xhrState(this);
        if (value === undefined && arguments.length < 2) tooFewArguments('XMLHttpRequest', 'setRequestHeader', 2, arguments.length);
        setRequestHeader(s, name, value);
      },
      get timeout() { return xhrState(this).timeout; },
      set timeout(value) {
        const s = xhrState(this);
        if (s.sync) throw domError('The object does not support the operation or argument.', 'InvalidAccessError');
        const n = Number(value);
        s.timeout = Number.isFinite(n) ? ((Math.trunc(n) % 2 ** 32) + 2 ** 32) % 2 ** 32 : 0;
        // As jsdom: a request started with a timeout measures the new one
        // from its start (0 cancels it); one started without keeps none.
        const req = s.req;
        if (req !== null && req.timer !== null) armTimeout(this, s, req);
      },
      get withCredentials() { return xhrState(this).withCredentials; },
      set withCredentials(value) {
        const s = xhrState(this);
        if ((s.state !== UNSENT && s.state !== OPENED) || s.send) throw domError(INVALID_STATE, 'InvalidStateError');
        s.withCredentials = !!value;
      },
      get upload() { return uploadOf(xhrState(this)); },
      send(body = null) { send(this, xhrState(this), body); },
      abort() {
        const s = xhrState(this);
        stop(s);
        if ((s.state === OPENED && s.send) || s.state === HEADERS_RECEIVED || s.state === LOADING) {
          const url = s.response.url;
          s.response = networkError();
          s.response.url = url;
          s.responseObject = undefined;
          s.text = null;
          requestError(this, s, 'abort');
        }
        if (s.state === DONE) {
          // As jsdom: the response URL stays.
          const url = s.response.url;
          s.state = UNSENT;
          s.response = networkError();
          s.response.url = url;
          s.responseObject = undefined;
          s.text = null;
        }
      },
      get responseURL() { return xhrState(this).response.url; },
      get status() { return xhrState(this).response.status; },
      get statusText() { return xhrState(this).response.statusText; },
      getResponseHeader(name) {
        const s = xhrState(this);
        if (name === undefined && arguments.length < 1) tooFewArguments('XMLHttpRequest', 'getResponseHeader', 1, 0);
        const r = s.response;
        if (r.headers === null) return null;
        const lower = String(name).toLowerCase();
        return visible(r, lower) ? r.headers.get(lower) : null;
      },
      getAllResponseHeaders() {
        const r = xhrState(this).response;
        if (r.headers === null) return '';
        const lines = [];
        for (const [name, value] of r.headers) if (visible(r, name)) lines.push(`${name}: ${value}`);
        return lines.join('\r\n');
      },
      overrideMimeType(mime) {
        const s = xhrState(this);
        if (mime === undefined && arguments.length < 1) tooFewArguments('XMLHttpRequest', 'overrideMimeType', 1, 0);
        if (s.state === LOADING || s.state === DONE) throw domError(INVALID_STATE, 'InvalidStateError');
        s.overrideMime = parseMime(mime) ?? { type: 'application', subtype: 'octet-stream', params: new Map() };
      },
      get responseType() { return xhrState(this).responseType; },
      set responseType(value) {
        const s = xhrState(this);
        if (s.state === LOADING || s.state === DONE) throw domError(INVALID_STATE, 'InvalidStateError');
        if (s.sync) throw domError('The object does not support the operation or argument.', 'InvalidAccessError');
        const type = String(value);
        if (RESPONSE_TYPES.has(type)) s.responseType = type;
      },
      get response() { return response(xhrState(this)); },
      get responseText() {
        const s = xhrState(this);
        if (s.responseType !== '' && s.responseType !== 'text') throw domError(INVALID_STATE, 'InvalidStateError');
        return responseText(s);
      },
      get responseXML() {
        const s = xhrState(this);
        if (s.responseType !== '' && s.responseType !== 'document') throw domError(INVALID_STATE, 'InvalidStateError');
        if (s.state !== DONE) return null;
        if (s.responseObject === undefined) s.responseObject = documentResponse(s);
        return s.responseObject;
      },
    },
  },
];

// Stops a window's requests without events (a test environment's
// teardown and per-file reset, a discarded frame), as closing jsdom's
// window does.
export function abortWindowRequests(window) {
  const pending = window[S].pendingRequests;
  if (!pending) return;
  for (const req of [...pending]) req.abort();
  pending.clear();
}
