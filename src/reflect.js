// IDL attributes that reflect content attributes, per the HTML standard
// (2.6.1 Reflecting content attributes in IDL attributes). Which attributes
// reflect, and how, comes from the standard's IDL (html-reflect.js,
// generated) plus the enumerated and other attributes whose reflection the
// standard describes in prose (PROSE_REFLECTIONS below).
import { S, state, domError } from './internal.js';
import { writeAttribute, tokenList } from './attributes.js';
import { REFLECTIONS } from './html-reflect.js';

// The rules for parsing integers: optional leading ASCII whitespace and sign,
// then digits; anything after them is ignored.
const LEADING_INT = /^[\t\n\f\r ]*([+-]?\d+)/;

export function parseInteger(value) {
  const m = LEADING_INT.exec(value);
  return m ? parseInt(m[1], 10) : null;
}

const parseNonNegativeInteger = (value) => {
  const n = parseInteger(value);
  return n !== null && n >= 0 ? n : null;
};

// The rules for parsing floating-point number values.
const LEADING_FLOAT = /^[\t\n\f\r ]*([+-]?(?:\d+(?:\.\d+)?|\.\d+)(?:[eE][+-]?\d+)?)/;
export const parseFloatingPoint = (value) => {
  const m = LEADING_FLOAT.exec(value);
  const n = m ? Number(m[1]) : NaN;
  return Number.isFinite(n) ? n : null;
};

const LONG_MIN = -2147483648;
const LONG_MAX = 2147483647;
const toLong = (v) => Number(v) | 0; // WebIDL long conversion (no [EnforceRange])
const toUnsignedLong = (v) => Number(v) >>> 0;

// A URL attribute's value resolved against the document's URL; values that
// do not parse are returned as written. Cached per element and attribute.
export function resolveURL(element, attr) {
  const es = state(element);
  const raw = es.attrs.get(attr);
  if (raw === undefined) return '';
  const ds = es.doc[S];
  const base = ds.url ?? ds.window[S].url;
  const cache = es.urls ?? (es.urls = new Map());
  const hit = cache.get(attr);
  if (hit && hit.raw === raw && hit.base === base) return hit.href;
  let href;
  try { href = new URL(raw, base).href; } catch { href = raw; }
  cache.set(attr, { raw, base, href });
  return href;
}

const get = (el, attr) => state(el).attrs.get(attr);
const set = (el, attr, value) => writeAttribute(el, attr, value);

function accessor([, attr, kind, options = {}]) {
  switch (kind) {
    case 'string': return {
      get() { return get(this, attr) ?? ''; },
      set(v) { set(this, attr, String(v)); },
    };
    case 'nullable': return {
      get() { return get(this, attr) ?? null; },
      set(v) { state(this); set(this, attr, v === null ? undefined : String(v)); },
    };
    case 'url': return {
      get() { return resolveURL(this, attr); },
      set(v) { set(this, attr, String(v)); },
    };
    case 'boolean': return {
      get() { return state(this).attrs.has(attr); },
      set(v) { state(this); set(this, attr, v ? '' : undefined); },
    };
    case 'tokens': return {
      get() { state(this); return tokenList(this, attr, writeAttribute); },
      set(v) { state(this); set(this, attr, String(v)); },
    };
    case 'long': return {
      get() {
        const value = get(this, attr);
        if (value !== undefined) {
          const n = options.nonNegative ? parseNonNegativeInteger(value) : parseInteger(value);
          if (n !== null && n >= LONG_MIN && n <= LONG_MAX) return n;
        }
        return options.default ?? (options.nonNegative ? -1 : 0);
      },
      set(v) {
        state(this);
        const n = toLong(v);
        if (options.nonNegative && n < 0) throw domError(`The value provided (${n}) is not non-negative.`, 'IndexSizeError');
        set(this, attr, String(n));
      },
    };
    case 'unsigned': {
      const positive = options.positive || options.positiveWithFallback;
      const minimum = options.range ? options.range[0] : positive ? 1 : 0;
      const maximum = options.range ? options.range[1] : LONG_MAX;
      return {
        get() {
          const value = get(this, attr);
          if (value !== undefined) {
            const n = parseNonNegativeInteger(value);
            if (n !== null && n >= minimum && n <= maximum) return n;
            if (n !== null && options.range) return n < minimum ? minimum : maximum;
          }
          return options.default ?? minimum;
        },
        set(v) {
          state(this);
          const n = toUnsignedLong(v);
          if (options.positive && n === 0) throw domError('The value provided is 0, which is an invalid size.', 'IndexSizeError');
          const low = positive ? 1 : 0;
          const value = n >= low && n <= LONG_MAX ? n : options.default ?? low;
          set(this, attr, String(value));
        },
      };
    }
    case 'double': return {
      get() {
        const value = get(this, attr);
        if (value !== undefined) {
          const n = parseFloatingPoint(value);
          if (n !== null && (n > 0 || !options.positive)) return n;
        }
        return options.default ?? 0;
      },
      set(v) {
        state(this);
        const n = Number(v);
        if (!Number.isFinite(n)) throw new TypeError(`Failed to set the '${attr}' property: The provided double value is non-finite.`);
        if (options.positive && !(n > 0)) return;
        set(this, attr, String(n));
      },
    };
    // Enumerated attributes limited to only known values: the canonical
    // keyword, or the missing/invalid value defaults.
    case 'enumerated': return {
      get() {
        const value = get(this, attr);
        if (value === undefined) return options.missing;
        const keyword = value.toLowerCase();
        if (options.keywords.includes(keyword)) return keyword;
        if (keyword === '' && options.empty !== undefined) return options.empty;
        return options.invalid;
      },
      set(v) { state(this); set(this, attr, v === null && options.missing === null ? undefined : String(v)); },
    };
    default: throw new Error(`unknown reflection kind ${kind}`);
  }
}

// CORS settings attributes: "" and invalid values are anonymous; missing
// is No CORS (null).
const CORS = { keywords: ['anonymous', 'use-credentials'], empty: 'anonymous', missing: null, invalid: 'anonymous' };

// Reflections the standard gives in prose rather than in its IDL.
const PROSE_REFLECTIONS = [
  ['HTMLElement', [
    ['inputMode', 'inputmode', 'enumerated', { keywords: ['none', 'text', 'tel', 'url', 'email', 'numeric', 'decimal', 'search'], missing: '', invalid: '' }],
  ]],
  ['HTMLImageElement', [['crossOrigin', 'crossorigin', 'enumerated', CORS]]],
  ['HTMLLinkElement', [['crossOrigin', 'crossorigin', 'enumerated', CORS]]],
  ['HTMLScriptElement', [['crossOrigin', 'crossorigin', 'enumerated', CORS]]],
  ['HTMLMediaElement', [
    ['crossOrigin', 'crossorigin', 'enumerated', CORS],
    // Missing and invalid defaults are implementation-defined; the standard suggests metadata.
    ['preload', 'preload', 'enumerated', { keywords: ['none', 'metadata', 'auto'], empty: 'auto', missing: 'metadata', invalid: 'metadata' }],
  ]],
  ['HTMLTrackElement', [
    ['kind', 'kind', 'enumerated', { keywords: ['subtitles', 'captions', 'descriptions', 'chapters', 'metadata'], missing: 'subtitles', invalid: 'metadata' }],
  ]],
  ['HTMLCanvasElement', [
    ['width', 'width', 'unsigned', { default: 300 }],
    ['height', 'height', 'unsigned', { default: 150 }],
  ]],
  ['HTMLInputElement', [['size', 'size', 'unsigned', { positive: true, default: 20 }]]],
  ['HTMLFormElement', [['autocomplete', 'autocomplete', 'enumerated', { keywords: ['on', 'off'], missing: 'on', invalid: 'on' }]]],
  ['HTMLIFrameElement', [['srcdoc', 'srcdoc', 'string']]],
];

// The autocomplete getter of form controls returns the IDL-exposed autofill
// value; approximated as the attribute's tokens, lowercased (section,
// shipping/billing and field names), or '' for anything else.
const autofill = {
  get() {
    const tokens = (get(this, 'autocomplete') ?? '').trim().toLowerCase().split(/[\t\n\f\r ]+/).filter(Boolean);
    return tokens.length > 0 && tokens.every((t) => /^[a-z0-9-]+$/.test(t)) ? tokens.join(' ') : '';
  },
  set(v) { set(this, 'autocomplete', String(v)); },
};

// nonce: an internal slot, initialized from the attribute; setting the IDL
// attribute does not change the content attribute.
const nonce = {
  get() { const s = state(this); return s.nonce ?? s.attrs.get('nonce') ?? ''; },
  set(v) { state(this).nonce = String(v); },
};

const OTHER = [
  ['HTMLElement', { nonce }],
  ['HTMLInputElement', { autocomplete: autofill }],
  ['HTMLTextAreaElement', { autocomplete: autofill }],
  ['HTMLSelectElement', { autocomplete: autofill }],
];

// Interface name -> member object of accessors (as {get,set} value objects,
// the form DESCRIPTORS accepts).
export const REFLECTED = new Map();
for (const [iface, entries] of [...REFLECTIONS, ...PROSE_REFLECTIONS]) {
  const members = REFLECTED.get(iface) ?? {};
  for (const entry of entries) members[entry[0]] = accessor(entry);
  REFLECTED.set(iface, members);
}
for (const [iface, extra] of OTHER) REFLECTED.set(iface, { ...REFLECTED.get(iface), ...extra });
