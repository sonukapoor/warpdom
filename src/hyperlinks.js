// Hyperlinks (HTML standard, 4.6): the HTMLHyperlinkElementUtils mixin of
// <a> and <area>, the URL members href, origin, protocol, username,
// password, host, hostname, port, pathname, search and hash, each reading
// the element's url (the href attribute parsed against the document's
// URL) and writing changes back to the href attribute.
import { S, state } from './internal.js';
import { writeAttribute } from './attributes.js';

// The element's url: its href attribute parsed against the document's URL,
// or null (no attribute, or a parse failure). Cached per attribute value
// and base.
export function urlOf(element) {
  const es = element[S];
  const raw = es.attrs.get('href');
  if (raw === undefined) return null;
  const ds = es.doc[S];
  const base = ds.url ?? ds.window[S].url;
  const cached = es.hyperlink;
  if (cached && cached.raw === raw && cached.base === base) return cached.url;
  let url;
  try { url = new URL(raw, base); } catch { url = null; }
  es.hyperlink = { raw, base, url };
  return url;
}

// A copy to modify: the cached URL object is shared.
const copyOf = (element) => { const url = urlOf(element); return url && new URL(url.href); };

// "Update href": write the serialized url back to the attribute.
const updateHref = (element, url) => writeAttribute(element, 'href', url.href);

const hasOpaquePath = (url) => !url.pathname.startsWith('/');
const cannotHaveCredentialsOrPort = (url) => url.hostname === '' || url.protocol === 'file:';

// A setter that changes one URL component, unless `skip` says the url
// cannot have it.
const setter = (component, skip) => function (value) {
  state(this);
  const url = copyOf(this);
  if (!url || skip(url)) return;
  url[component] = String(value);
  updateHref(this, url);
};

export const HYPERLINK_MEMBERS = {
  get href() {
    state(this);
    const url = urlOf(this);
    return url ? url.href : this[S].attrs.get('href') ?? '';
  },
  set href(value) { state(this); writeAttribute(this, 'href', String(value)); },
  toString() { return this.href; },
  get origin() { state(this); const url = urlOf(this); return url ? url.origin : ''; },
  get protocol() { state(this); const url = urlOf(this); return url ? url.protocol : ':'; },
  set protocol(value) { setter('protocol', () => false).call(this, value); },
  get username() { state(this); return urlOf(this)?.username ?? ''; },
  set username(value) { setter('username', cannotHaveCredentialsOrPort).call(this, value); },
  get password() { state(this); return urlOf(this)?.password ?? ''; },
  set password(value) { setter('password', cannotHaveCredentialsOrPort).call(this, value); },
  get host() { state(this); return urlOf(this)?.host ?? ''; },
  set host(value) { setter('host', hasOpaquePath).call(this, value); },
  get hostname() { state(this); return urlOf(this)?.hostname ?? ''; },
  set hostname(value) { setter('hostname', hasOpaquePath).call(this, value); },
  get port() { state(this); return urlOf(this)?.port ?? ''; },
  set port(value) { setter('port', cannotHaveCredentialsOrPort).call(this, value); },
  get pathname() { state(this); return urlOf(this)?.pathname ?? ''; },
  set pathname(value) { setter('pathname', hasOpaquePath).call(this, value); },
  get search() { state(this); return urlOf(this)?.search ?? ''; },
  set search(value) { setter('search', () => false).call(this, value); },
  get hash() { state(this); return urlOf(this)?.hash ?? ''; },
  set hash(value) { setter('hash', () => false).call(this, value); },
};
