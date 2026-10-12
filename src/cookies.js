// document.cookie (HTML standard, 3.1.4; cookies per RFC 6265bis): one
// in-memory cookie store per top-level window, shared with its frames,
// emptied by reset. Documents without a browsing context, or whose URL is
// not http(s), are cookie-averse: reading gives '' and writing does
// nothing.
//
// Without the public suffix list, a Domain attribute without a dot is
// accepted only when it is the host itself (domain=com is rejected,
// domain=localhost on localhost is not). HttpOnly cookies cannot be set
// from script. Secure cookies need a secure origin: https, or localhost.
import { S } from './internal.js';

// The cookie store: the top-level window's.
function store(doc) {
  let w = doc[S].window;
  while (w[S].parentWindow) w = w[S].parentWindow;
  const ws = w[S];
  return ws.cookies ?? (ws.cookies = { list: [], created: 0 });
}

// The document's URL, or null when it is cookie-averse.
function cookieURL(doc) {
  const ds = doc[S];
  if (ds.noView) return null;
  const url = ds.url !== undefined ? new URL(ds.url) : ds.window[S].url;
  return url.protocol === 'http:' || url.protocol === 'https:' ? url : null;
}

const isLocalhost = (host) => host === 'localhost' || host.endsWith('.localhost') || host === '127.0.0.1' || host === '[::1]';
const isSecure = (url) => url.protocol === 'https:' || isLocalhost(url.hostname);

// The default path: the URL's path up to (not including) its last '/'.
function defaultPath(url) {
  const path = url.pathname;
  const last = path.lastIndexOf('/');
  return last <= 0 ? '/' : path.slice(0, last);
}

const domainMatch = (host, domain) => host === domain || (host.endsWith('.' + domain) && !/^[\d.]+$|^\[/.test(host));

function pathMatch(requestPath, cookiePath) {
  if (requestPath === cookiePath) return true;
  if (!requestPath.startsWith(cookiePath)) return false;
  return cookiePath.endsWith('/') || requestPath[cookiePath.length] === '/';
}

// Controls other than CR and LF (which end the string) reject the cookie.
// NUL rejects it too (RFC 6265bis: a set-cookie-string with a NUL is
// ignored; jsdom truncates there as at CR and LF).
// eslint-disable-next-line no-control-regex
const CONTROL = /[\x01-\x1f\x7f]/;
// eslint-disable-next-line no-control-regex
const TRUNCATE = /[\r\n]/;

const expired = (cookie, now) => cookie.expires !== null && cookie.expires <= now;

function setCookie(doc, url, input) {
  if (input.includes('\0')) return;
  const end = input.search(TRUNCATE);
  const string = end === -1 ? input : input.slice(0, end);
  const [pair, ...attributes] = string.split(';');
  const eq = pair.indexOf('=');
  const name = eq === -1 ? '' : pair.slice(0, eq).trim();
  const value = (eq === -1 ? pair : pair.slice(eq + 1)).trim();
  if ((!name && !value) || CONTROL.test(name) || CONTROL.test(value)) return;

  const now = Date.now();
  let expires = null, maxAge = null, domain = '', path = null, secure = false;
  for (const attribute of attributes) {
    const at = attribute.indexOf('=');
    const key = (at === -1 ? attribute : attribute.slice(0, at)).trim().toLowerCase();
    const v = at === -1 ? '' : attribute.slice(at + 1).trim();
    if (key === 'expires') { const t = Date.parse(v); if (!Number.isNaN(t)) expires = t; }
    else if (key === 'max-age') { if (/^-?\d+$/.test(v)) maxAge = Number(v); }
    else if (key === 'domain') { if (v) domain = (v.startsWith('.') ? v.slice(1) : v).toLowerCase(); }
    else if (key === 'path') path = v.startsWith('/') ? v : null;
    else if (key === 'secure') secure = true;
    else if (key === 'httponly') return;
  }
  if (maxAge !== null) expires = maxAge <= 0 ? -Infinity : now + maxAge * 1000;

  const host = url.hostname;
  if (domain && (!domainMatch(host, domain) || (!domain.includes('.') && domain !== host))) return;
  const secureOrigin = isSecure(url);
  if (secure && !secureOrigin) return;
  if ((name.startsWith('__Secure-') || name.startsWith('__Host-')) && !secure) return;
  if (name.startsWith('__Host-') && (domain || path !== '/')) return;

  const cookie = { name, value, domain: domain || host, hostOnly: !domain, path: path ?? defaultPath(url), secure, expires, created: 0 };
  const jar = store(doc);
  const i = jar.list.findIndex((c) => c.name === cookie.name && c.domain === cookie.domain && c.path === cookie.path);
  if (i !== -1) {
    // A non-secure origin cannot replace a secure cookie.
    if (jar.list[i].secure && !secureOrigin) return;
    cookie.created = jar.list[i].created;
    if (expired(cookie, now)) jar.list.splice(i, 1);
    else jar.list[i] = cookie;
  } else if (!expired(cookie, now)) {
    cookie.created = jar.created++;
    jar.list.push(cookie);
  }
}

function getCookies(doc, url) {
  const now = Date.now();
  const jar = store(doc);
  const host = url.hostname;
  const secure = isSecure(url);
  jar.list = jar.list.filter((c) => !expired(c, now));
  return jar.list
    .filter((c) => (c.hostOnly ? host === c.domain : domainMatch(host, c.domain)) && pathMatch(url.pathname, c.path) && (!c.secure || secure))
    .sort((a, b) => b.path.length - a.path.length || a.created - b.created)
    .map((c) => (c.name ? `${c.name}=${c.value}` : c.value))
    .join('; ');
}

// The document's cookie-string, as document.cookie gives it.
export function documentCookie(doc) {
  const url = cookieURL(doc);
  return url ? getCookies(doc, url) : '';
}

// Sets a cookie from a document.cookie assignment.
export function setDocumentCookie(doc, value) {
  const url = cookieURL(doc);
  if (url) setCookie(doc, url, String(value));
}

export function clearCookies(window) {
  window[S].cookies = undefined;
}
