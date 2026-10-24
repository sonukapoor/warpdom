// IDL attributes that reflect content attributes, per the HTML standard
// (2.6.1 Reflecting content attributes in IDL attributes). Which attributes
// reflect, and how, comes from the standard's IDL (html-reflect.js,
// generated) plus the enumerated and other attributes whose reflection the
// standard describes in prose (PROSE_REFLECTIONS below).
import { S, state, domError, asciiLowercase, PlatformURL as URL } from './internal.js';
import { documentBaseURL } from './base-url.js';
import { writeAttribute, tokenList } from './attributes.js';
import { REFLECTIONS } from './html-reflect.js';

// The rules for parsing integers: optional leading ASCII whitespace and sign,
// then digits; anything after them is ignored.
const LEADING_INT = /^[\t\n\f\r ]*([+-]?\d+)/;

export function parseInteger(value) {
  const m = LEADING_INT.exec(value);
  return m ? parseInt(m[1], 10) + 0 : null; // + 0: "-0" is 0 (an IDL long has no -0)
}

const parseNonNegativeInteger = (value) => {
  const n = parseInteger(value);
  return n !== null && n >= 0 ? n : null;
};

// The rules for parsing floating-point number values (a "." after the
// integer part may be followed directly by the exponent: "1.e2" is 100).
const LEADING_FLOAT = /^[\t\n\f\r ]*([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?)/;
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
  const base = documentBaseURL(es.doc);
  const cache = es.urls ?? (es.urls = new Map());
  const hit = cache.get(attr);
  if (hit && hit.raw === raw && hit.base === base) return hit.href;
  let href;
  try {
    href = new URL(raw, base).href;
  } catch {
    href = raw;
  }
  cache.set(attr, { raw, base, href });
  return href;
}

// WebIDL USVString conversion: lone surrogates become U+FFFD.
const toUSVString = (v) => {
  const s = String(v);
  return typeof s.toWellFormed === 'function' ? s.toWellFormed() : s;
};

const get = (el, attr) => state(el).attrs.get(attr);
const set = (el, attr, value) => writeAttribute(el, attr, value);

function accessor([, attr, kind, options = {}]) {
  switch (kind) {
    case 'string':
      if (options.usv)
        return {
          get() {
            return get(this, attr) ?? '';
          },
          set(v) {
            set(this, attr, toUSVString(v));
          },
        };
      return options.nullToEmpty
        ? {
            get() {
              return get(this, attr) ?? '';
            },
            set(v) {
              set(this, attr, v === null ? '' : String(v));
            },
          }
        : {
            get() {
              return get(this, attr) ?? '';
            },
            set(v) {
              set(this, attr, String(v));
            },
          };
    case 'nullable':
      return {
        get() {
          return get(this, attr) ?? null;
        },
        set(v) {
          state(this);
          set(this, attr, v == null ? undefined : String(v));
        }, // WebIDL: undefined converts to null for a nullable type
      };
    case 'url':
      return {
        get() {
          return resolveURL(this, attr);
        },
        set(v) {
          set(this, attr, String(v));
        },
      };
    case 'boolean':
      return {
        get() {
          return state(this).attrs.has(attr);
        },
        set(v) {
          state(this);
          set(this, attr, v ? '' : undefined);
        },
      };
    case 'tokens':
      return {
        get() {
          state(this);
          return tokenList(this, attr, writeAttribute);
        },
        set(v) {
          state(this);
          set(this, attr, String(v));
        },
      };
    case 'long':
      return {
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
          if (options.nonNegative && n < 0)
            throw domError(`The value provided (${n}) is not non-negative.`, 'IndexSizeError');
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
          if (options.positive && n === 0)
            throw domError('The value provided is 0, which is an invalid size.', 'IndexSizeError');
          const low = positive ? 1 : 0;
          const value = n >= low && n <= LONG_MAX ? n : (options.default ?? low);
          set(this, attr, String(value));
        },
      };
    }
    case 'double':
      return {
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
          if (!Number.isFinite(n))
            throw new TypeError(`Failed to set the '${attr}' property: The provided double value is non-finite.`);
          if (options.positive && !(n > 0)) return;
          set(this, attr, String(n));
        },
      };
    // Enumerated attributes limited to only known values: the canonical
    // keyword, or the missing/invalid value defaults.
    case 'enumerated':
      return {
        get() {
          const value = get(this, attr);
          if (value === undefined) return options.missing;
          const keyword = asciiLowercase(value);
          if (options.keywords.includes(keyword)) return keyword;
          if (keyword === '' && options.empty !== undefined) return options.empty;
          return options.invalid;
        },
        set(v) {
          state(this);
          set(this, attr, v == null && options.missing === null ? undefined : String(v));
        }, // nullable: undefined is null
      };
    default:
      throw new Error(`unknown reflection kind ${kind}`);
  }
}

// CORS settings attributes: "" and invalid values are anonymous; missing
// is No CORS (null).
const CORS = { keywords: ['anonymous', 'use-credentials'], empty: 'anonymous', missing: null, invalid: 'anonymous' };

// A submit button's form method and enctype overrides: limited to only
// known values, with no missing value default.
const SUBMITTER = [
  ['formMethod', 'formmethod', 'enumerated', { keywords: ['get', 'post', 'dialog'], missing: '', invalid: 'get' }],
  [
    'formEnctype',
    'formenctype',
    'enumerated',
    {
      keywords: ['application/x-www-form-urlencoded', 'multipart/form-data', 'text/plain'],
      missing: '',
      invalid: 'application/x-www-form-urlencoded',
    },
  ],
];

// Reflections the standard gives in prose rather than in its IDL.
const PROSE_REFLECTIONS = [
  [
    'HTMLElement',
    [
      [
        'inputMode',
        'inputmode',
        'enumerated',
        { keywords: ['none', 'text', 'tel', 'url', 'email', 'numeric', 'decimal', 'search'], missing: '', invalid: '' },
      ],
    ],
  ],
  ['HTMLImageElement', [['crossOrigin', 'crossorigin', 'enumerated', CORS]]],
  ['HTMLLinkElement', [['crossOrigin', 'crossorigin', 'enumerated', CORS]]],
  ['HTMLScriptElement', [['crossOrigin', 'crossorigin', 'enumerated', CORS]]],
  [
    'HTMLMediaElement',
    [
      ['crossOrigin', 'crossorigin', 'enumerated', CORS],
      // Missing and invalid defaults are implementation-defined; the standard suggests metadata.
      [
        'preload',
        'preload',
        'enumerated',
        { keywords: ['none', 'metadata', 'auto'], empty: 'auto', missing: 'metadata', invalid: 'metadata' },
      ],
    ],
  ],
  [
    'HTMLTrackElement',
    [
      [
        'kind',
        'kind',
        'enumerated',
        {
          keywords: ['subtitles', 'captions', 'descriptions', 'chapters', 'metadata'],
          missing: 'subtitles',
          invalid: 'metadata',
        },
      ],
    ],
  ],
  [
    'HTMLCanvasElement',
    [
      ['width', 'width', 'unsigned', { default: 300 }],
      ['height', 'height', 'unsigned', { default: 150 }],
    ],
  ],
  ['HTMLInputElement', [['size', 'size', 'unsigned', { positive: true, default: 20 }]]],
  // jsdom has autofocus on these four element interfaces and inputMode
  // (reflected as written, not enumerated) on input and textarea, as their
  // own members (black box 20.0.3 to 30.1.3); HTMLElement's stay for other
  // elements.
  ['HTMLButtonElement', [['autofocus', 'autofocus', 'boolean']]],
  [
    'HTMLInputElement',
    [
      ['autofocus', 'autofocus', 'boolean'],
      ['inputMode', 'inputmode', 'string'],
    ],
  ],
  ['HTMLSelectElement', [['autofocus', 'autofocus', 'boolean']]],
  [
    'HTMLTextAreaElement',
    [
      ['autofocus', 'autofocus', 'boolean'],
      ['inputMode', 'inputmode', 'string'],
    ],
  ],
  ['HTMLButtonElement', SUBMITTER],
  ['HTMLInputElement', SUBMITTER],
  [
    'HTMLFormElement',
    [['autocomplete', 'autocomplete', 'enumerated', { keywords: ['on', 'off'], missing: 'on', invalid: 'on' }]],
  ],
  ['HTMLIFrameElement', [['srcdoc', 'srcdoc', 'string']]],
];

// The autocomplete getter of form controls returns the IDL-exposed autofill
// value; approximated as the attribute's tokens, lowercased (section,
// shipping/billing and field names), or '' for anything else.
const autofill = {
  get() {
    const tokens = (get(this, 'autocomplete') ?? '')
      .trim()
      .toLowerCase()
      .split(/[\t\n\f\r ]+/)
      .filter(Boolean);
    return tokens.length > 0 && tokens.every((t) => /^[a-z0-9-]+$/.test(t)) ? tokens.join(' ') : '';
  },
  set(v) {
    set(this, 'autocomplete', String(v));
  },
};

// nonce (HTMLElement and SVGElement): jsdom reflects the content attribute
// (black box, jsdom 20 to 30), where the standard keeps an internal slot
// that setting the IDL attribute does not write back.
export const NONCE = {
  get() {
    return state(this).attrs.get('nonce') ?? '';
  },
  set(v) {
    state(this);
    set(this, 'nonce', String(v));
  },
};

// formAction reflects a URL, except that a missing or empty attribute gives
// the document's URL.
const formAction = {
  get() {
    const value = get(this, 'formaction');
    return value === undefined || value === '' ? state(this).doc.URL : resolveURL(this, 'formaction');
  },
  set(v) {
    set(this, 'formaction', String(v));
  },
};

const OTHER = [
  ['HTMLElement', { nonce: NONCE }],
  ['HTMLButtonElement', { formAction }],
  ['HTMLInputElement', { autocomplete: autofill, formAction }],
  ['HTMLTextAreaElement', { autocomplete: autofill }],
  ['HTMLSelectElement', { autocomplete: autofill }],
];

// Members left out although the standard has them: libraries test for them
// to pick a code path, and warpdom does not implement what they mean.
// inert: react-aria hides content outside a dialog or drag with the inert
// attribute when HTMLElement.prototype has inert, else with aria-hidden,
// which Testing Library's role queries honour (jsdom has no inert).
const FEATURE_DETECTED = [['HTMLElement', 'inert']];

// Interface name -> its reflection entries and other members; the accessors
// are made when the interface is first created (reflectedMembers).
const SOURCES = new Map();
for (const [iface, entries] of [...REFLECTIONS, ...PROSE_REFLECTIONS]) {
  const source = SOURCES.get(iface);
  if (source) source.entries.push(entries);
  else SOURCES.set(iface, { entries: [entries], extra: null });
}
for (const [iface, extra] of OTHER) {
  const source = SOURCES.get(iface);
  if (source) source.extra = extra;
  else SOURCES.set(iface, { entries: [], extra });
}

// Does the interface have reflected attributes (or the members above)?
export const hasReflections = (iface) => SOURCES.has(iface);

// The interface's member object of accessors (as {get,set} value objects,
// the form window.js accepts), or undefined.
export function reflectedMembers(iface) {
  const source = SOURCES.get(iface);
  if (!source) return undefined;
  const members = {};
  for (const entries of source.entries) for (const entry of entries) members[entry[0]] = accessor(entry);
  if (source.extra) Object.assign(members, source.extra);
  for (const [name, member] of FEATURE_DETECTED) if (name === iface) delete members[member];
  return members;
}
