// CSS selector engine. Each selector string is parsed once into a tree of
// small matching functions (compound selectors checked right to left through
// the combinators) and cached, so querySelector, matches and closest never
// re-parse. Walks use the linked tree directly.
import { matchesChecked, matchesValidity } from './forms.js';
import { directionality } from './directionality.js';
import { S, domError, ELEMENT_NODE, DOCUMENT_NODE, HTML_NS, SVG_NS, nextInTree, rootOf } from './internal.js';
import { XML_NS, valueByName } from './attributes.js';

// --- tokens and parsing --------------------------------------------------------

const WS = /[ \t\n\r\f]/;
const isNameStart = (c) => /[A-Za-z_\u0080-￿]/.test(c);
const isName = (c) => /[A-Za-z0-9_\-\u0080-￿]/.test(c);

function invalid(selector) {
  return domError(`'${selector}' is not a valid selector.`, 'SyntaxError');
}

// CSS input preprocessing (CSS Syntax 3.3): CR LF, CR and FF become LF,
// NUL becomes U+FFFD.
const preprocess = (text) => (/[\r\f\0]/.test(text) ? text.replace(/\r\n?|\f/g, '\n').replace(/\0/g, '\uFFFD') : text);

class Parser {
  constructor(text) {
    this.text = preprocess(text);
    this.i = 0;
  }

  peek(offset = 0) {
    return this.text[this.i + offset] ?? '';
  }

  fail() {
    throw invalid(this.text);
  }

  skipWs() {
    let skipped = false;
    while (WS.test(this.peek())) {
      this.i++;
      skipped = true;
    }
    return skipped;
  }

  escape() {
    // After a backslash: hex escape (up to 6 digits, optional whitespace) or literal.
    const hex = /^[0-9a-fA-F]{1,6}/.exec(this.text.slice(this.i));
    if (hex) {
      this.i += hex[0].length;
      if (WS.test(this.peek())) this.i++;
      const code = parseInt(hex[0], 16);
      return code === 0 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff) ? '�' : String.fromCodePoint(code);
    }
    if (this.i >= this.text.length) return '�';
    return this.text[this.i++];
  }

  ident() {
    let out = '';
    const start = this.i;
    if (this.peek() === '-') {
      out += '-';
      this.i++;
    }
    if (this.peek() === '-') {
      out += '-';
      this.i++;
    } else if (this.peek() === '\\') {
      this.i++;
      out += this.escape();
    } else if (isNameStart(this.peek())) out += this.text[this.i++];
    else if (out !== '--') {
      this.i = start;
      return null;
    }
    for (;;) {
      const c = this.peek();
      if (c === '\\') {
        this.i++;
        out += this.escape();
      } else if (c && isName(c)) {
        out += c;
        this.i++;
      } else break;
    }
    return out;
  }

  string() {
    const quote = this.text[this.i++];
    let out = '';
    for (;;) {
      const c = this.text[this.i++];
      if (c === undefined) return out; // unterminated: accepted at end, as in CSS
      if (c === quote) return out;
      if (c === '\\') {
        if (this.peek() === '\n') {
          this.i++;
          continue;
        }
        out += this.escape();
      } else out += c;
    }
  }

  // selector-list := complex ( ',' complex )*
  list(relative = false) {
    const items = [];
    do {
      this.skipWs();
      items.push(this.complex(relative));
      this.skipWs();
    } while (this.peek() === ',' && ++this.i);
    return items;
  }

  // complex := [combinator] compound ( combinator compound )*
  complex(relative) {
    const parts = [];
    const combinators = [];
    this.skipWs();
    if (relative && /[>+~]/.test(this.peek())) {
      combinators.push(this.text[this.i++]);
      this.skipWs();
    } else if (relative) combinators.push(' ');
    parts.push(this.compound());
    for (;;) {
      const ws = this.skipWs();
      const c = this.peek();
      if (c === '>' || c === '+' || c === '~') {
        this.i++;
        this.skipWs();
        combinators.push(c);
        parts.push(this.compound());
      } else if (ws && c && c !== ',' && c !== ')') {
        combinators.push(' ');
        parts.push(this.compound());
      } else break;
    }
    return { parts, combinators, relative };
  }

  compound() {
    const tests = [];
    let type = null;
    // A type selector's namespace: *| (any, as without one) or | (none).
    // Declared prefixes need @namespace, which the DOM API cannot have.
    let ns;
    if (this.peek() === '*' && this.peek(1) === '|' && this.peek(2) !== '=') {
      this.i += 2;
      ns = '*';
    } else if (this.peek() === '|' && this.peek(1) !== '=') {
      this.i++;
      ns = '';
    }
    if (this.peek() === '*') {
      this.i++;
      type = '*';
    } else {
      const name = this.ident();
      if (name !== null) type = name;
    }
    if (ns !== undefined && type === null) this.fail();
    if (ns === undefined && type !== null && this.peek() === '|' && this.peek(1) !== '=') this.fail();
    if (ns === '') {
      type = type ?? '*';
      tests.push({ kind: 'noNamespace' });
    }
    for (;;) {
      const c = this.peek();
      if (c === '#') {
        this.i++;
        const name = this.ident();
        if (name === null) this.fail();
        tests.push({ kind: 'id', value: name });
      } else if (c === '.') {
        this.i++;
        const name = this.ident();
        if (name === null) this.fail();
        tests.push({ kind: 'class', value: name });
      } else if (c === '[') {
        this.i++;
        tests.push(this.attribute());
      } else if (c === ':') {
        this.i++;
        if (this.peek() === ':') {
          this.i++;
          if (this.ident() === null) this.fail();
          if (this.peek() === '(') this.skipBalanced();
          tests.push({ kind: 'never' }); // pseudo-elements match no element
        } else tests.push(this.pseudo());
      } else break;
    }
    if (type === null && tests.length === 0) this.fail();
    return { type, tests };
  }

  attribute() {
    this.skipWs();
    // A namespace: *| (any) or | (none); declared prefixes need @namespace,
    // which selectors in the DOM API cannot have.
    let ns;
    if (this.peek() === '*' && this.peek(1) === '|' && this.peek(2) !== '=') {
      ns = '*';
      this.i += 2;
    } else if (this.peek() === '|' && this.peek(1) !== '=') {
      ns = '';
      this.i++;
    }
    const name = this.ident();
    if (name === null) this.fail();
    this.skipWs();
    let op = null;
    let value = null;
    let insensitive = false;
    const c = this.peek();
    if (c === ']') {
      this.i++;
      return { kind: 'attr', name, op, value, insensitive, ns };
    }
    if (c === '=') {
      op = '=';
      this.i++;
    } else if (/[~|^$*]/.test(c) && this.peek(1) === '=') {
      op = c + '=';
      this.i += 2;
    } else this.fail();
    this.skipWs();
    if (this.peek() === '"' || this.peek() === "'") value = this.string();
    else {
      value = this.ident();
      if (value === null) this.fail();
    }
    this.skipWs();
    const flag = this.peek().toLowerCase();
    if (flag === 'i' || flag === 's') {
      insensitive = flag === 'i';
      this.i++;
      this.skipWs();
    }
    if (this.peek() !== ']') this.fail();
    this.i++;
    return { kind: 'attr', name, op, value, insensitive, ns };
  }

  // A forgiving selector list (:is, :where): an invalid item is dropped.
  forgivingList() {
    const items = [];
    for (;;) {
      this.skipWs();
      const start = this.i;
      try {
        const item = this.complex(false);
        this.skipWs();
        if (this.peek() !== ',' && this.peek() !== ')') this.fail();
        items.push(item);
      } catch {
        this.i = start;
        this.skipItem();
      }
      if (this.peek() !== ',') return items;
      this.i++;
    }
  }

  // Skips to the next top-level comma or the closing parenthesis.
  skipItem() {
    let depth = 0;
    for (;;) {
      const c = this.peek();
      if (c === '') this.fail();
      if (depth === 0 && (c === ',' || c === ')')) return;
      if (c === '(' || c === '[') depth++;
      else if (c === ')' || c === ']') depth--;
      if (c === '"' || c === "'") this.string();
      else if (c === '\\') this.i += 2;
      else this.i++;
    }
  }

  skipBalanced() {
    let depth = 0;
    do {
      const c = this.text[this.i++];
      if (c === undefined) this.fail();
      if (c === '(') depth++;
      else if (c === ')') depth--;
    } while (depth > 0);
  }

  pseudo() {
    const name = this.ident();
    if (name === null) this.fail();
    const lower = name.toLowerCase();
    if (this.peek() !== '(') {
      if (!SIMPLE_PSEUDOS.has(lower)) this.fail();
      return { kind: 'pseudo', name: lower };
    }
    this.i++;
    this.skipWs();
    let arg;
    if (lower === 'is' || lower === 'where') arg = this.forgivingList();
    else if (['not', 'matches', '-webkit-any', 'host'].includes(lower)) arg = this.list();
    else if (lower === 'has') arg = this.list(true);
    else if (['nth-child', 'nth-last-child', 'nth-of-type', 'nth-last-of-type'].includes(lower))
      arg = this.nth(lower.endsWith('child'));
    else if (lower === 'lang' || lower === 'dir') {
      arg = this.ident() ?? (this.peek() === '"' || this.peek() === "'" ? this.string() : null);
      if (arg === null) this.fail();
    } else this.fail();
    this.skipWs();
    if (this.peek() !== ')') this.fail();
    this.i++;
    return { kind: 'pseudo', name: lower === 'matches' || lower === '-webkit-any' ? 'is' : lower, arg };
  }

  // an+b [of S]
  nth(allowOf) {
    const rest = this.text.slice(this.i);
    const m = /^(?:([+-]?\d*)n\s*(?:([+-])\s*(\d+))?|([+-]?\d+)|(odd)|(even))/i.exec(rest);
    if (!m || m[0] === '') this.fail();
    this.i += m[0].length;
    let a = 0,
      b = 0;
    if (m[5]) {
      a = 2;
      b = 1;
    } else if (m[6]) {
      a = 2;
      b = 0;
    } else if (m[4] !== undefined) {
      b = parseInt(m[4], 10);
    } else {
      a = m[1] === '' || m[1] === '+' ? 1 : m[1] === '-' ? -1 : parseInt(m[1], 10);
      b = m[3] ? parseInt(m[3], 10) * (m[2] === '-' ? -1 : 1) : 0;
    }
    this.skipWs();
    let of = null;
    if (allowOf && /^of\s/i.test(this.text.slice(this.i))) {
      this.i += 2;
      of = this.list();
    }
    return { a, b, of };
  }
}

const SIMPLE_PSEUDOS = new Set([
  'first-child',
  'last-child',
  'only-child',
  'first-of-type',
  'last-of-type',
  'only-of-type',
  'empty',
  'root',
  'scope',
  'checked',
  'disabled',
  'enabled',
  'focus',
  'focus-within',
  'focus-visible',
  'hover',
  'active',
  'visited',
  'link',
  'any-link',
  'target',
  'required',
  'optional',
  'read-only',
  'read-write',
  'placeholder-shown',
  'defined',
  'indeterminate',
  'default',
  'valid',
  'invalid',
  'in-range',
  'out-of-range',
  'autofill',
  'modal',
  'open',
  'closed',
  'popover-open',
  'fullscreen',
  'playing',
  'paused',
  'user-invalid',
  'user-valid',
  'host',
]);

// --- compiling ---------------------------------------------------------------------

const parentElement = (el) => {
  const p = el[S].parent;
  return p && p[S].type === ELEMENT_NODE ? p : null;
};
const prevElement = (el) => {
  for (let n = el[S].prev; n; n = n[S].prev) if (n[S].type === ELEMENT_NODE) return n;
  return null;
};
const nextElement = (el) => {
  for (let n = el[S].next; n; n = n[S].next) if (n[S].type === ELEMENT_NODE) return n;
  return null;
};
const isHTML = (el) => el[S].ns === HTML_NS;

const FORM_DISABLE = new Set(['button', 'input', 'select', 'textarea', 'optgroup', 'option', 'fieldset']);
const FORM_REQUIRED = new Set(['input', 'select', 'textarea']);

// Form-associated custom elements take :disabled and :enabled from jsdom
// 27.0.0 (custom-elements.js sets disableable from that version).
const disableableCustom = (s) => s.ceState === 'custom' && s.ceDefinition?.disableable === true;

function isDisabled(el) {
  const s = el[S];
  if (!isHTML(el) || (!FORM_DISABLE.has(s.tag) && !disableableCustom(s))) return false;
  if (s.attrs.has('disabled')) return true;
  if (s.tag === 'option') {
    const p = parentElement(el);
    return !!p && p[S].tag === 'optgroup' && p[S].attrs.has('disabled');
  }
  // Inside a disabled fieldset, except within its first legend.
  for (let p = parentElement(el), child = el; p; child = p, p = parentElement(p)) {
    if (p[S].tag === 'fieldset' && p[S].attrs.has('disabled')) {
      let legend = null;
      for (let c = p[S].first; c; c = c[S].next)
        if (c[S].type === ELEMENT_NODE && c[S].tag === 'legend') {
          legend = c;
          break;
        }
      return child !== legend;
    }
  }
  return false;
}

// Element positions among siblings, computed for all children at once and
// cached on the parent until its child list changes (rev), so :nth-* and
// *-of-type checks are O(1) amortized.
const typeKey = (cs) => (cs.ns === HTML_NS ? cs.tag : `${cs.ns} ${cs.tag}`);

function positions(parent) {
  const ps = parent[S];
  if (ps.posRev === ps.rev) return;
  const counts = new Map();
  let i = 0;
  for (let c = ps.first; c; c = c[S].next) {
    const cs = c[S];
    if (cs.type !== ELEMENT_NODE) continue;
    cs.pos = ++i;
    const key = typeKey(cs);
    const n = (counts.get(key) ?? 0) + 1;
    counts.set(key, n);
    cs.typePos = n;
  }
  for (let c = ps.first; c; c = c[S].next) if (c[S].type === ELEMENT_NODE) c[S].typeTotal = counts.get(typeKey(c[S]));
  ps.elementTotal = i;
  ps.posRev = ps.rev;
}

function nthIndex(el, fromEnd, ofType, ofTest) {
  const s = el[S];
  if (!ofTest) {
    if (!s.parent) return 1;
    positions(s.parent);
    if (ofType) return fromEnd ? s.typeTotal - s.typePos + 1 : s.typePos;
    return fromEnd ? s.parent[S].elementTotal - s.pos + 1 : s.pos;
  }
  let i = 1;
  const step = fromEnd ? (n) => n[S].next : (n) => n[S].prev;
  for (let n = step(el); n; n = step(n)) {
    if (n[S].type !== ELEMENT_NODE) continue;
    if (ofType && (n[S].tag !== s.tag || n[S].ns !== s.ns)) continue;
    if (!ofTest(n)) continue;
    i++;
  }
  return i;
}

const nthMatches = (index, a, b) => (a === 0 ? index === b : (index - b) / a >= 0 && (index - b) % a === 0);

function compileTest(t) {
  switch (t.kind) {
    case 'noNamespace':
      return (el) => el[S].ns === null;
    case 'id':
      return (el) => el[S].attrs.get('id') === t.value;
    case 'class': {
      const v = t.value;
      return (el) => {
        const cls = el[S].attrs.get('class');
        if (cls === undefined) return false;
        if (cls === v) return true;
        const i = cls.indexOf(v);
        if (i < 0) return false;
        return ` ${cls} `.replace(/[\t\n\f\r]/g, ' ').includes(` ${v} `);
      };
    }
    case 'never':
      return () => false;
    case 'attr':
      return compileAttribute(t);
    case 'pseudo':
      return compilePseudo(t);
    default:
      throw new Error(`unknown selector test ${t.kind}`);
  }
}

function compileAttribute({ name, op, value, insensitive, ns }) {
  const norm = insensitive ? (s) => s.toLowerCase() : (s) => s;
  const v = value === null ? null : norm(value);
  const check = {
    null: () => true,
    '=': (a) => a === v,
    '~=': (a) => v !== '' && !/\s/.test(v) && a.split(/[\t\n\f\r ]+/).includes(v),
    '|=': (a) => a === v || a.startsWith(`${v}-`),
    '^=': (a) => v !== '' && a.startsWith(v),
    '$=': (a) => v !== '' && a.endsWith(v),
    '*=': (a) => v !== '' && a.includes(v),
  }[op];
  const lower = name.toLowerCase();
  // [|name]: the attribute in no namespace; [*|name]: an attribute with
  // that local name in any namespace.
  if (ns === '') {
    return (el) => {
      const a = el[S].attrs.get(isHTML(el) ? lower : name);
      return a !== undefined && check(insensitive ? a.toLowerCase() : a);
    };
  }
  if (ns === '*') {
    return (el) => {
      const s = el[S];
      const local = isHTML(el) ? lower : name;
      for (const [key, a] of s.attrs) {
        const k = key.charCodeAt(0) === 0 ? s.attrNS.get(key).local : key;
        if (k === local && check(insensitive ? a.toLowerCase() : a)) return true;
      }
      return false;
    };
  }
  // By qualified name, as jsdom matches (an element with namespaced
  // attributes looks for the first attribute with the name).
  return (el) => {
    const s = el[S];
    const key = isHTML(el) ? lower : name;
    const a = s.attrNS == null ? s.attrs.get(key) : valueByName(s, key);
    return a !== undefined && check(insensitive ? a.toLowerCase() : a);
  };
}

// Pseudo-classes whose result can change without a tree or attribute change
// (form state, focus, text data): selectors using them are never result-cached.
const DYNAMIC = new Set([
  'empty',
  'checked',
  'focus',
  'focus-visible',
  'focus-within',
  'indeterminate',
  'placeholder-shown',
  'defined',
  'read-only',
  'read-write',
  'valid',
  'invalid',
]);
let compilingDynamic = false;

function compilePseudo({ name, arg }) {
  if (DYNAMIC.has(name)) compilingDynamic = true;
  switch (name) {
    case 'not': {
      const m = compileList(arg);
      return (el, ctx) => !m(el, ctx);
    }
    case 'is':
    case 'where': {
      if (arg.length === 0) return () => false;
      const m = compileList(arg);
      return (el, ctx) => m(el, ctx);
    }
    // :host and :host(<compound>): reached only from the shadow tree's
    // top-level elements through a combinator (compileComplex).
    case 'host': {
      if (!arg) return () => true;
      const m = compileList(arg);
      return (el, ctx) => m(el, ctx);
    }
    case 'has': {
      const rel = arg.map(compileRelative);
      return (el, ctx) => rel.some((r) => r(el, ctx));
    }
    case 'first-child':
      return (el) => !prevElement(el);
    case 'last-child':
      return (el) => !nextElement(el);
    case 'only-child':
      return (el) => !prevElement(el) && !nextElement(el);
    case 'first-of-type':
      return (el) => nthIndex(el, false, true) === 1;
    case 'last-of-type':
      return (el) => nthIndex(el, true, true) === 1;
    case 'only-of-type':
      return (el) => nthIndex(el, false, true) === 1 && nthIndex(el, true, true) === 1;
    case 'nth-child':
    case 'nth-last-child':
    case 'nth-of-type':
    case 'nth-last-of-type': {
      const { a, b, of } = arg;
      const ofTest = of ? compileList(of) : null;
      const fromEnd = name.includes('last');
      const ofType = name.endsWith('of-type');
      return (el, ctx) => {
        if (ofTest && !ofTest(el, ctx)) return false;
        return nthMatches(nthIndex(el, fromEnd, ofType, ofTest && ((n) => ofTest(n, ctx))), a, b);
      };
    }
    case 'empty':
      return (el) => {
        for (let c = el[S].first; c; c = c[S].next) {
          const t = c[S].type;
          if (t === ELEMENT_NODE || (t === 3 && c[S].data !== '')) return false;
        }
        return true;
      };
    case 'root':
      return (el) => {
        const p = el[S].parent;
        return !!p && p[S].type === DOCUMENT_NODE;
      };
    case 'scope':
      return (el, ctx) => (ctx?.scope ? el === ctx.scope : !!el[S].parent && el[S].parent[S].type === DOCUMENT_NODE);
    case 'checked':
      return matchesChecked;
    case 'valid':
      return (el) => matchesValidity(el, false);
    case 'invalid':
      return (el) => matchesValidity(el, true);
    case 'disabled':
      return isDisabled;
    case 'enabled':
      return (el) => isHTML(el) && (FORM_DISABLE.has(el[S].tag) || disableableCustom(el[S])) && !isDisabled(el);
    case 'required':
      return (el) => isHTML(el) && FORM_REQUIRED.has(el[S].tag) && el[S].attrs.has('required');
    case 'optional':
      return (el) => isHTML(el) && FORM_REQUIRED.has(el[S].tag) && !el[S].attrs.has('required');
    case 'read-only':
      return (el) => !isReadWrite(el);
    case 'read-write':
      return isReadWrite;
    case 'placeholder-shown':
      return (el) =>
        isHTML(el) &&
        (el[S].tag === 'input' || el[S].tag === 'textarea') &&
        el[S].attrs.has('placeholder') &&
        (el[S].value ?? el[S].attrs.get('value') ?? '') === '';
    case 'focus':
      return (el) => el[S].doc[S].focused === el;
    case 'focus-visible':
      return (el) => el[S].doc[S].focused === el;
    case 'focus-within':
      return (el) => {
        const f = el[S].doc[S].focused;
        for (let n = f; n; n = n[S].parent) if (n === el) return true;
        return false;
      };
    // As in jsdom (black box, 20 to 30.1.3): an SVG a with an href too (not
    // xlink:href).
    case 'link':
    case 'any-link':
      return (el) =>
        el[S].attrs.has('href') &&
        (isHTML(el) ? el[S].tag === 'a' || el[S].tag === 'area' : el[S].ns === SVG_NS && el[S].tag === 'a');
    // Defined: uncustomized (no state) or custom.
    case 'defined':
      return (el) => {
        const st = el[S].ceState;
        return st === undefined || st === 'custom';
      };
    case 'indeterminate':
      return (el) => !!el[S].indeterminate;
    case 'open':
      return (el) => isHTML(el) && (el[S].tag === 'details' || el[S].tag === 'dialog') && el[S].attrs.has('open');
    case 'lang': {
      const lang = String(arg).toLowerCase();
      return (el) => {
        const l = languageOf(el)?.toLowerCase();
        return l !== undefined && (l === lang || l.startsWith(`${lang}-`));
      };
    }
    case 'dir': {
      const dir = String(arg).toLowerCase();
      return dir === 'ltr' || dir === 'rtl' ? (el) => directionality(el) === dir : () => false;
    }
    default:
      return () => false; // hover, active, visited, target, ...
  }
}

// The language of an element (HTML 3.2.6.2): its lang attribute in the XML
// namespace, else (HTML and SVG elements) its lang attribute in no
// namespace, else its parent element's, through a shadow root to its host;
// undefined when unknown.
function languageOf(element) {
  for (let n = element; ;) {
    const s = n[S];
    if (s.attrNS)
      for (const [name, info] of s.attrNS) if (info.ns === XML_NS && info.local === 'lang') return s.attrs.get(name);
    if (s.ns === HTML_NS || s.ns === SVG_NS) {
      const lang = s.attrs.get('lang');
      if (lang !== undefined) return lang;
    }
    const p = s.parent;
    if (!p) return undefined;
    if (p[S].type === ELEMENT_NODE) n = p;
    else if (p[S].shadow === true) n = p[S].host;
    else return undefined;
  }
}

function isReadWrite(el) {
  const s = el[S];
  if (!isHTML(el)) return false;
  if (s.tag === 'textarea') return !s.attrs.has('readonly') && !isDisabled(el);
  if (s.tag === 'input') {
    const type = (s.attrs.get('type') ?? 'text').toLowerCase();
    const textual = [
      'text',
      'search',
      'url',
      'tel',
      'email',
      'password',
      'date',
      'month',
      'week',
      'time',
      'datetime-local',
      'number',
    ].includes(type);
    return textual && !s.attrs.has('readonly') && !isDisabled(el);
  }
  const ce = s.attrs.get('contenteditable');
  return ce !== undefined && ce.toLowerCase() !== 'false';
}

// A compound made of :host alone: matches the shadow host, as the parent of
// its shadow tree's top-level elements (CSS Scoping 3.1.1).
const isHostCompound = ({ type, tests }) =>
  type === null && tests.length === 1 && tests[0].kind === 'pseudo' && tests[0].name === 'host';
const shadowHostOfParent = (el) => {
  const p = el[S].parent;
  return p !== null && p[S].shadow === true ? p[S].host : null;
};
const shadowHostAbove = (el) => {
  let n = el;
  while (n[S].parent) n = n[S].parent;
  return n[S].shadow === true ? n[S].host : null;
};

function compileCompound({ type, tests }) {
  const checks = tests.map(compileTest);
  const lower = type && type !== '*' ? type.toLowerCase() : null;
  const typeCheck = lower === null ? null : (el) => (isHTML(el) ? el[S].tag === lower : el[S].tag === type);
  const all = typeCheck ? [typeCheck, ...checks] : checks;
  if (all.length === 1) return all[0];
  return (el, ctx) => {
    for (let i = 0; i < all.length; i++) if (!all[i](el, ctx)) return false;
    return true;
  };
}

// Right to left: the last compound must match el, then each combinator
// leads to the candidates for the compound before it. A relative selector
// (inside :has) ends at the anchor, related by its leading combinator.
function compileComplex({ parts, combinators, relative }) {
  const compounds = parts.map(compileCompound);
  const host = parts.map(isHostCompound);
  // The host is featureless outside its shadow tree: :host as the subject
  // matches nothing.
  if (host[host.length - 1]) return () => false;
  // One compound (div, .a, [x]): its test alone.
  if (compounds.length === 1 && !relative) return compounds[0];
  const anyHost = host.includes(true);
  const combs = relative ? combinators.slice(1) : combinators;
  const lead = relative ? combinators[0] : null;
  const atAnchor = (el, anchor) => {
    switch (lead) {
      case '>':
        return parentElement(el) === anchor;
      case ' ':
        for (let p = parentElement(el); p; p = parentElement(p)) if (p === anchor) return true;
        return false;
      case '+':
        return prevElement(el) === anchor;
      case '~':
        for (let p = prevElement(el); p; p = prevElement(p)) if (p === anchor) return true;
        return false;
      default:
        return false;
    }
  };
  const matchFrom = (el, i, ctx) => {
    if (i === 0) return !relative || atAnchor(el, ctx.anchor);
    const prev = compounds[i - 1];
    if (anyHost && host[i - 1]) {
      const h = combs[i - 1] === '>' ? shadowHostOfParent(el) : combs[i - 1] === ' ' ? shadowHostAbove(el) : null;
      return h !== null && prev(h, ctx) && matchFrom(h, i - 1, ctx);
    }
    switch (combs[i - 1]) {
      case '>': {
        const p = parentElement(el);
        return !!p && prev(p, ctx) && matchFrom(p, i - 1, ctx);
      }
      case ' ':
        for (let p = parentElement(el); p; p = parentElement(p))
          if (prev(p, ctx) && matchFrom(p, i - 1, ctx)) return true;
        return false;
      case '+': {
        const p = prevElement(el);
        return !!p && prev(p, ctx) && matchFrom(p, i - 1, ctx);
      }
      case '~':
        for (let p = prevElement(el); p; p = prevElement(p)) if (prev(p, ctx) && matchFrom(p, i - 1, ctx)) return true;
        return false;
      default:
        return false;
    }
  };
  const last = compounds.length - 1;
  return (el, ctx) => compounds[last](el, ctx) && matchFrom(el, last, ctx);
}

// :has(<relative>): some element in the anchor's subtree (or, for sibling
// combinators, after it under the same parent) matches, related to the anchor.
function compileRelative(complex) {
  const match = compileComplex(complex);
  const siblings = complex.combinators[0] === '+' || complex.combinators[0] === '~';
  return (anchor, ctx) => {
    const inner = { scope: ctx?.scope ?? null, anchor };
    const root = siblings ? anchor[S].parent : anchor;
    if (!root) return false;
    const start = siblings ? anchor[S].next : anchor[S].first;
    if (!start) return false;
    for (let n = start; n; n = nextInTree(n, root)) {
      if (n[S].type === ELEMENT_NODE && match(n, inner)) return true;
    }
    return false;
  };
}

function compileList(list) {
  const matchers = list.map(compileComplex);
  if (matchers.length === 1) return matchers[0];
  return (el, ctx) => matchers.some((m) => m(el, ctx));
}

// --- cache and queries ----------------------------------------------------------

const CACHE_LIMIT = 2000;
const cache = new Map();

export function compile(selector) {
  const text = String(selector);
  let entry = cache.get(text);
  if (!entry) {
    const parser = new Parser(text);
    const list = parser.list();
    if (parser.i < parser.text.length) throw invalid(text);
    compilingDynamic = false;
    const match = compileList(list);
    const simpleId =
      list.length === 1 &&
      list[0].parts.length === 1 &&
      list[0].parts[0].type === null &&
      list[0].parts[0].tests.length === 1 &&
      list[0].parts[0].tests[0].kind === 'id'
        ? list[0].parts[0].tests[0].value
        : null;
    entry = { match, simpleId, dynamic: compilingDynamic };
    if (cache.size >= CACHE_LIMIT) cache.clear();
    cache.set(text, entry);
  }
  return entry;
}

// --- specificity (Selectors 4, 17) -----------------------------------------------------
// As one number: ids * 1e6 + classes, attributes and pseudo-classes * 1e3 + types.

const listSpecificity = (list) => Math.max(0, ...list.map(complexSpecificity));

function complexSpecificity({ parts }) {
  let total = 0;
  for (const { type, tests } of parts) {
    if (type !== null && type !== '*') total += 1;
    for (const t of tests) {
      switch (t.kind) {
        case 'id':
          total += 1e6;
          break;
        case 'class':
        case 'attr':
          total += 1e3;
          break;
        case 'never':
          total += 1;
          break; // a pseudo-element
        case 'pseudo':
          if (t.name === 'where') break;
          if (t.name === 'is' || t.name === 'not' || t.name === 'has') total += listSpecificity(t.arg);
          else total += 1e3 + (t.arg?.of ? listSpecificity(t.arg.of) : 0);
          break;
        default:
          total += 1e3;
      }
    }
  }
  return total;
}

// A selector list as the cascade uses it: each complex selector compiled on
// its own, with its specificity. Throws on an invalid selector.
const ruleCache = new Map();

export function compileRuleSelector(selector) {
  const text = String(selector);
  let entries = ruleCache.get(text);
  if (!entries) {
    const parser = new Parser(text);
    const list = parser.list();
    if (parser.i < parser.text.length) throw invalid(text);
    entries = list.map((complex) => ({ match: compileComplex(complex), specificity: complexSpecificity(complex) }));
    if (ruleCache.size >= CACHE_LIMIT) ruleCache.clear();
    ruleCache.set(text, entries);
  }
  return entries;
}

export function matches(el, selector) {
  return compile(selector).match(el, { scope: el });
}

export function closest(el, selector) {
  const { match } = compile(selector);
  const ctx = { scope: el };
  for (let n = el; n; n = parentElement(n)) if (match(n, ctx)) return n;
  return null;
}

// Query results are cached per root and selector until the document's tree
// or attributes change (treeRev). Callers must not mutate the returned array.
const QUERY_CACHE_LIMIT = 64;
// Off only for the ablation measurement (src/ablate.js, set by the
// adapters): the exported binding is replaced, so the cached path has no
// check for it (importers see the live binding).
export function setQueryCache(on) {
  querySelectorAll = on ? cachedQuerySelectorAll : uncachedQuerySelectorAll;
}
function uncachedQuerySelectorAll(root, selector, first = false) {
  return query(root, compile(typeof selector === 'string' ? selector : String(selector)), first);
}

// eslint-disable-next-line import/no-mutable-exports
export let querySelectorAll = cachedQuerySelectorAll;
function cachedQuerySelectorAll(root, selector, first = false) {
  const text = typeof selector === 'string' ? selector : String(selector);
  const rs = root[S];
  const doc = rs.type === DOCUMENT_NODE ? root : rs.doc;
  const rev = doc[S].treeRev ?? 0;
  let cache = rs.queryCache;
  // A hit needs no compile: only selectors without dynamic parts are cached.
  if (cache && rs.queryCacheRev === rev && rs.queryCacheDoc === doc) {
    const all = cache.get(text);
    if (all !== undefined) return all;
  }
  const entry = compile(text);
  if (entry.dynamic) return query(root, entry, first);
  if (!cache || rs.queryCacheRev !== rev || rs.queryCacheDoc !== doc || cache.size >= QUERY_CACHE_LIMIT) {
    cache = rs.queryCache = new Map();
    rs.queryCacheRev = rev;
    rs.queryCacheDoc = doc;
  }
  if (first) {
    // The first match alone, keyed by the compiled entry (a selector string
    // cannot collide with it).
    let one = cache.get(entry);
    if (!one) cache.set(entry, (one = query(root, entry, true)));
    return one;
  }
  const found = query(root, entry, false);
  cache.set(text, found);
  return found;
}

function query(root, { match, simpleId }, first) {
  const rs = root[S];
  const ctx = { scope: rs.type === DOCUMENT_NODE ? null : root };
  // #id: the id index when the id is unique and root is connected.
  if (simpleId !== null) {
    const doc = rs.type === DOCUMENT_NODE ? root : rs.doc;
    const list = doc[S].ids?.get(simpleId);
    if (rs.type === DOCUMENT_NODE || rootOf(root) === doc) {
      if (!list) return [];
      if (list.length === 1) {
        const el = list[0];
        for (let n = el[S].parent; n; n = n[S].parent) if (n === root) return [el];
        return [];
      }
    }
  }
  const out = [];
  for (let n = rs.first; n; n = nextInTree(n, root)) {
    if (n[S].type === ELEMENT_NODE && match(n, ctx)) {
      out.push(n);
      if (first) break;
    }
  }
  return out;
}
