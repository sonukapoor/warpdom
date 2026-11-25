// CSS selector engine. Each selector string is parsed once into a tree of
// small matching functions (compound selectors checked right to left through
// the combinators) and cached, so querySelector, matches and closest never
// re-parse. Walks use the linked tree directly.
import { matchesChecked, matchesValidity } from './forms.js';
import { directionality } from './directionality.js';
import {
  S,
  domError,
  ELEMENT_NODE,
  DOCUMENT_NODE,
  HTML_NS,
  SVG_NS,
  nextInTree,
  rootOf,
  preprocessCss as preprocess,
} from './internal.js';
import { XML_NS, valueByName } from './attributes.js';
import { urlOf } from './hyperlinks.js';
import { serializeName31, serializeString31 } from './parse31.js';

// --- tokens and parsing --------------------------------------------------------

const WS = /[ \t\n\r\f]/;
// (by code unit: a letter, _, or anything from U+0080; a name also takes
// digits and -; '' past the end is neither)
const isNameStart = (c) => {
  const k = c.charCodeAt(0);
  return (k >= 97 && k <= 122) || (k >= 65 && k <= 90) || k === 95 || k >= 0x80;
};
const isName = (c) => {
  const k = c.charCodeAt(0);
  return isNameStart(c) || (k >= 48 && k <= 57) || k === 45;
};

function invalid(selector) {
  return domError(`'${selector}' is not a valid selector.`, 'SyntaxError');
}

// jsdom 31's cascade (compileRuleSelector's scoping, black box, 31.0.1;
// CSS Scoping 3): :host-context(), a host compound of :host, :host() and
// :host-context() alone (any other selector in it matches nothing), their
// argument's specificity. Elsewhere (the DOM API, and the cascade of jsdom
// 30 and before, which applies every sheet everywhere) :host( ) is a test
// of the element itself and :host-context() is invalid.
let hostScoping = false;
// jsdom 31's grammar (black box, 31.0.1; #269 part F3a): set while a
// selector is parsed for a jsdom 31 window (compile's spec31, and the
// cascade's rule selectors, compileRuleSelector's scoping). Its own names
// (SIMPLE31, FUNCTIONAL31, ELEMENTS31), a pseudo-element only at the end
// of its compound, the column combinator and & (nesting's, the scope).
let grammar31 = false;
// jsdom 31's selector() in @supports and CSS.supports: :is() and :where()
// read unforgivingly, without pseudo-elements (supportsSelector31).
let unforgiving31 = false;

class Parser {
  constructor(text) {
    this.text = preprocess(text);
    this.i = 0;
    this.depth = 0; // selector lists open: 1 at the top level
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
    this.depth++;
    try {
      do {
        this.skipWs();
        items.push(this.complex(relative));
        this.skipWs();
      } while (this.peek() === ',' && ++this.i);
    } finally {
      this.depth--;
    }
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
      const column = grammar31 && c === '|' && this.peek(1) === '|';
      // (jsdom 31: nothing after a pseudo-element's compound: a::before b)
      const next = column || c === '>' || c === '+' || c === '~' || (ws && c && c !== ',' && c !== ')');
      if (next && grammar31 && parts[parts.length - 1].element !== null) this.fail();
      if (column) {
        // (the column combinator: no element is a table cell's column here)
        this.i += 2;
        this.skipWs();
        combinators.push('||');
        parts.push(this.compound());
      } else if (c === '>' || c === '+' || c === '~') {
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
    // (jsdom 31: *||td is * and a column combinator)
    const column = grammar31 && this.peek(2) === '|';
    if (this.peek() === '*' && this.peek(1) === '|' && this.peek(2) !== '=' && !column) {
      this.i += 2;
      ns = '*';
    } else if (this.peek() === '|' && this.peek(1) !== '=') {
      this.i++;
      ns = '';
    }
    // (named: jsdom 31's \*, a type named *, not the universal selector)
    let named = false;
    if (this.peek() === '*') {
      this.i++;
      type = '*';
    } else {
      const name = this.ident();
      if (name !== null) type = name;
      named = grammar31 && name === '*';
    }
    if (ns !== undefined && type === null) this.fail();
    if (ns === undefined && type !== null && this.peek() === '|' && this.peek(1) !== '=' && this.peek(1) !== '|')
      this.fail();
    if (ns === '') {
      type = type ?? '*';
      tests.push({ kind: 'noNamespace' });
    }
    // (jsdom 31: the compound's last pseudo-element, which only some
    // pseudo-classes and pseudo-elements may follow)
    let element = null;
    for (;;) {
      const c = this.peek();
      if (grammar31 && element !== null && (c === '#' || c === '.' || c === '[' || c === '&')) this.fail();
      if (grammar31 && c === '&') {
        this.i++;
        tests.push({ kind: 'pseudo', name: 'scope', nesting: true });
      } else if (grammar31 && c === ':') {
        this.i++;
        const element31 = this.peek() === ':';
        if (element31) this.i++;
        const test = element31 ? this.pseudoElement31() : this.pseudo31();
        if (test.kind === 'never' || test.kind === 'slotted') {
          if (element !== null && !followsElement31(element, test.element)) this.fail();
          element = test.element;
        } else if (element !== null && !afterElement31(element, test)) this.fail();
        tests.push(test);
      } else if (c === '#') {
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
          const name = this.ident();
          if (name === null) this.fail();
          // (::slotted(<compound>): jsdom 31's cascade's, in a shadow
          // tree's rules, shadowRule; no element matches it here either.
          // In a pseudo-class's argument, and before jsdom 31, it is a
          // pseudo-element like the others: no specificity, #342 review.)
          const slotted =
            hostScoping && this.depth === 1 && name.toLowerCase() === 'slotted' && this.peek() === '('
              ? this.slotted()
              : null;
          if (slotted !== null) tests.push(slotted);
          else {
            if (this.peek() === '(') this.skipBalanced();
            tests.push({ kind: 'never' }); // pseudo-elements match no element
          }
        } else tests.push(this.pseudo());
      } else break;
    }
    if (type === null && tests.length === 0) this.fail();
    return { type, tests, element, named };
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
    const quoted = this.peek() === '"' || this.peek() === "'";
    if (quoted) value = this.string();
    else {
      value = this.ident();
      if (value === null) this.fail();
    }
    this.skipWs();
    let flag = this.peek().toLowerCase();
    if (flag === 'i' || flag === 's') {
      insensitive = flag === 'i';
      this.i++;
      this.skipWs();
    } else flag = null;
    if (this.peek() !== ']') this.fail();
    this.i++;
    return { kind: 'attr', name, op, value, insensitive, ns, quoted, flag };
  }

  // A forgiving selector list (:is, :where): an invalid item is dropped.
  forgivingList() {
    if (unforgiving31) {
      const items = this.list();
      if (items.some((c) => c.parts.some((part) => part.element !== null))) this.fail();
      return items;
    }
    const items = [];
    this.depth++;
    try {
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
    } finally {
      this.depth--;
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

  // ::slotted('s argument, a compound (null: something else, skipped
  // as the argument of any other pseudo-element)
  slotted() {
    const open = this.i;
    try {
      this.i++;
      this.skipWs();
      const list = this.list();
      this.skipWs();
      if (this.peek() === ')' && list.length === 1 && list[0].parts.length === 1) {
        this.i++;
        return { kind: 'slotted', arg: list[0].parts[0] };
      }
    } catch {
      // (an argument that is no selector)
    }
    this.i = open;
    return null;
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
    else if (['not', 'matches', '-webkit-any', 'host'].includes(lower) || (lower === 'host-context' && hostScoping))
      arg = this.list();
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

  // jsdom 31's pseudo-classes (after the colon): the legacy pseudo-elements
  // (:before), -webkit-autofill as autofill, its functional ones.
  pseudo31() {
    const name = this.ident();
    if (name === null) this.fail();
    const lower = name.toLowerCase();
    if (this.peek() !== '(') {
      if (LEGACY_ELEMENTS.has(lower)) return { kind: 'never', element: lower, arg: null };
      if (lower === '-webkit-autofill') return { kind: 'pseudo', name: 'autofill' };
      if (!SIMPLE31.has(lower)) this.fail();
      return { kind: 'pseudo', name: lower };
    }
    if (!FUNCTIONAL31.has(lower)) this.fail();
    this.i++;
    this.skipWs();
    let arg;
    if (lower === 'is' || lower === 'where') arg = this.forgivingList();
    else if (lower === 'not' || lower === 'current') {
      arg = this.list();
      // (no pseudo-element in :not(): :not(::before))
      if (lower === 'not' && arg.some((c) => c.parts.some((part) => part.element !== null))) this.fail();
    } else if (lower === 'has') arg = this.list(true);
    else if (lower === 'host' || lower === 'host-context') {
      arg = this.list();
      if (arg.some((c) => c.parts.length !== 1)) this.fail();
    } else if (lower.startsWith('nth-')) arg = this.nth(lower.endsWith('child'));
    else if (lower === 'heading') arg = this.items31(() => this.integer31());
    else if (lower === 'lang') arg = this.items31(() => this.langRange31());
    else if (lower === 'active-view-transition-type') arg = this.items31(() => this.ident() ?? this.fail());
    else arg = this.ident() ?? this.fail(); // dir, state
    this.skipWs();
    if (this.peek() !== ')') this.fail();
    this.i++;
    return { kind: 'pseudo', name: lower, arg };
  }

  // A comma-separated list of one or more items.
  items31(item) {
    const items = [];
    for (;;) {
      items.push(item());
      this.skipWs();
      if (this.peek() !== ',') return items;
      this.i++;
      this.skipWs();
    }
  }

  integer31() {
    const m = /^[+-]?\d+(?![\d.eE\w])/.exec(this.text.slice(this.i));
    if (!m) this.fail();
    this.i += m[0].length;
    return Number(m[0]);
  }

  // (an identifier or a string; written back as it was)
  langRange31() {
    if (this.peek() === '"' || this.peek() === "'") return { string: this.string() };
    const ident = this.ident();
    if (ident === null) this.fail();
    return { ident };
  }

  // jsdom 31's pseudo-elements (after the two colons): its names,
  // ::-webkit- and any name, part(), slotted(), highlight() and the other
  // functional ones; each matches no element.
  pseudoElement31() {
    const name = this.ident();
    if (name === null) this.fail();
    const lower = name.toLowerCase();
    if (this.peek() !== '(') {
      if (!ELEMENTS31.has(lower) && !lower.startsWith('-webkit-')) this.fail();
      return { kind: 'never', element: lower, arg: null };
    }
    if (lower === 'slotted') {
      // (::slotted(<compound>): jsdom 31's cascade's, in a shadow tree's
      // rules; elsewhere it matches nothing)
      const slotted = hostScoping && this.depth === 1 ? this.slotted() : null;
      if (slotted !== null) return { ...slotted, element: 'slotted' };
      this.i++;
      this.skipWs();
      const arg = this.compound();
      this.skipWs();
      if (this.peek() !== ')') this.fail();
      this.i++;
      return { kind: 'never', element: 'slotted', arg };
    }
    if (!ELEMENT_FUNCTIONS31.has(lower)) this.fail();
    this.i++;
    this.skipWs();
    const arg = [];
    // (part(): names separated by whitespace; the others one name, or *
    // for the view transition ones)
    do {
      if (this.peek() === '*' && lower.startsWith('view-transition-')) {
        this.i++;
        arg.push(null); // (the wildcard; an escaped \* is a name)
      } else arg.push(this.ident() ?? this.fail());
    } while (lower === 'part' && this.skipWs() && this.peek() !== ')');
    this.skipWs();
    if (this.peek() !== ')') this.fail();
    this.i++;
    return { kind: 'never', element: lower, arg };
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

// jsdom 31's names (black box, 31.0.1): the pseudo-classes, the
// functional ones, the pseudo-elements (and ::-webkit-<any name>), and
// the four written with one colon too.
const SIMPLE31 = new Set([
  'active',
  'active-view-transition',
  'any-link',
  'autofill',
  'blank',
  'buffering',
  'checked',
  'current',
  'default',
  'defined',
  'disabled',
  'empty',
  'enabled',
  'first-child',
  'first-of-type',
  'focus',
  'focus-visible',
  'focus-within',
  'fullscreen',
  'future',
  'has-slotted',
  'heading',
  'host',
  'hover',
  'in-range',
  'indeterminate',
  'interest-source',
  'interest-target',
  'invalid',
  'last-child',
  'last-of-type',
  'link',
  'local-link',
  'modal',
  'muted',
  'only-child',
  'only-of-type',
  'open',
  'optional',
  'out-of-range',
  'past',
  'paused',
  'picture-in-picture',
  'placeholder-shown',
  'playing',
  'popover-open',
  'read-only',
  'read-write',
  'required',
  'root',
  'scope',
  'seeking',
  'stalled',
  'target',
  'target-current',
  'user-invalid',
  'user-valid',
  'valid',
  'visited',
  'volume-locked',
  'xr-overlay',
]);
const FUNCTIONAL31 = new Set([
  'active-view-transition-type',
  'current',
  'dir',
  'has',
  'heading',
  'host',
  'host-context',
  'is',
  'lang',
  'not',
  'nth-child',
  'nth-col',
  'nth-last-child',
  'nth-last-col',
  'nth-last-of-type',
  'nth-of-type',
  'state',
  'where',
]);
const ELEMENTS31 = new Set([
  'after',
  'backdrop',
  'before',
  'checkmark',
  'column',
  'details-content',
  'file-selector-button',
  'first-letter',
  'first-line',
  'grammar-error',
  'marker',
  'picker-icon',
  'placeholder',
  'scroll-marker',
  'scroll-marker-group',
  'search-text',
  'selection',
  'spelling-error',
  'target-text',
  'view-transition',
]);
const ELEMENT_FUNCTIONS31 = new Set([
  'highlight',
  'part',
  'picker',
  'scroll-button',
  'view-transition-group',
  'view-transition-image-pair',
  'view-transition-new',
  'view-transition-old',
]);
const LEGACY_ELEMENTS = new Set(['before', 'after', 'first-line', 'first-letter']);
// What may follow a pseudo-element in its compound: after ::part() any
// pseudo-class, after the others the user action ones; :is() and :where()
// (forgiving) always, :not() of such pseudo-classes only (::before:not(.a)
// is invalid); after ::before and ::after ::marker, after ::part() and
// ::slotted() any pseudo-element.
const USER_ACTION = new Set(['hover', 'active', 'focus', 'focus-visible', 'focus-within']);
const afterElement31 = (element, test) => {
  if (test.name === 'is' || test.name === 'where') return true;
  const allowed = (t) =>
    t.kind === 'pseudo' && (element === 'part' ? t.name !== 'not' || notOf(t) : USER_ACTION.has(t.name));
  const notOf = (t) =>
    t.arg.every((c) => c.parts.length === 1 && c.parts[0].type === null && c.parts[0].tests.every(allowed));
  return test.name === 'not' ? notOf(test) : allowed(test);
};
const followsElement31 = (element, next) =>
  element === 'part' || element === 'slotted' || ((element === 'before' || element === 'after') && next === 'marker');

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
const shadowIncludingParent = (el) => {
  const p = el[S].parent;
  if (p === null) return null;
  if (p[S].type === ELEMENT_NODE) return p;
  return p[S].shadow === true ? p[S].host : null;
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

// jsdom 31's selector engine follows the standard where jsdom 30's did
// not (compat.specSelectors; black box, 30.1.3 and 31.0.1): an attribute
// selector without a namespace takes only an attribute in no namespace, an
// empty text child is not content to :empty, and an SVG a with an
// xlink:href is a link. Read when matching: compiled selectors are shared
// by every window.
const specSelectors = (el) => el[S].doc[S].window[S].compat.specSelectors === true;
// xlink:href's attribute key (attributes.js attrKey).
const XLINK_HREF = '\0http://www.w3.org/1999/xlink\0href';

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
    case 'slotted':
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
  // By qualified name, as jsdom matches before 31 (an element with
  // namespaced attributes looks for the first attribute with the name);
  // from 31 in no namespace, as [|name].
  return (el) => {
    const s = el[S];
    const key = isHTML(el) ? lower : name;
    const a = s.attrNS == null || specSelectors(el) ? s.attrs.get(key) : valueByName(s, key);
    return a !== undefined && check(insensitive ? a.toLowerCase() : a);
  };
}

// Pseudo-classes whose result can change without a tree or attribute change
// (form state, focus, text data): selectors using them are never result-cached.
// :empty is one from jsdom 31, where an empty text child is not content;
// compiled selectors are shared by every profile, so it is one in all.
const DYNAMIC = new Set([
  'dir',
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
  'empty',
  'blank',
  'local-link',
]);
let compilingDynamic = false;
// Pseudo-classes whose result can change with text data alone (a dir=auto
// element's text, a textarea's or an option's text as their value): rule
// selectors using them make computed styles follow text changes
// (cascade.js buildIndex, textDependent). :empty from jsdom 31, where an
// empty text child is not content.
const TEXT_DEPENDENT = new Set(['dir', 'valid', 'invalid', 'placeholder-shown', 'empty', 'blank']);
let compilingText = false;

function compilePseudo({ name, arg }) {
  if (DYNAMIC.has(name)) {
    compilingDynamic = true;
    if (TEXT_DEPENDENT.has(name)) compilingText = true;
  }
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
      // (one compound: :host(.a, .b) matches nothing, black box, jsdom 31.0.1)
      if (hostScoping && (arg.length !== 1 || arg[0].parts.length !== 1)) return () => false;
      const m = compileList(arg);
      return (el, ctx) => m(el, ctx);
    }
    // The host, or an element above it (shadow-including), matching it.
    case 'host-context': {
      // (the DOM API's, jsdom 31's: no element is a host there)
      if (!hostScoping || arg.length !== 1 || arg[0].parts.length !== 1) return () => false;
      const m = compileList(arg);
      return (el, ctx) => {
        for (let n = el; n !== null; n = shadowIncludingParent(n)) if (m(n, ctx)) return true;
        return false;
      };
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
    // As jsdom (black box, 20.0.3 to 30.1.3): a text child, even an empty
    // one, is content; comments, processing instructions and CDATA
    // sections are not. From 31 (specSelectors) a text child or CDATA
    // section is content when it has data, so text data changes can change
    // :empty there.
    case 'empty':
      return (el) => {
        let spec = null;
        for (let c = el[S].first; c; c = c[S].next) {
          const t = c[S].type;
          if (t === ELEMENT_NODE) return false;
          if (t === 3) {
            if (c[S].data !== '' || !(spec ??= specSelectors(el))) return false;
          } else if (t === 4 && c[S].data !== '' && (spec ??= specSelectors(el))) return false;
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
    // xlink:href); from 31 with an xlink:href too (specSelectors).
    case 'link':
    case 'any-link':
      return (el) => {
        const s = el[S];
        if (isHTML(el)) return (s.tag === 'a' || s.tag === 'area') && s.attrs.has('href');
        if (s.ns !== SVG_NS || s.tag !== 'a') return false;
        return s.attrs.has('href') || (s.attrNS != null && s.attrs.has(XLINK_HREF) && specSelectors(el));
      };
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
    // jsdom 31's (black box, 31.0.1): :blank an input (but a button, submit,
    // reset or image one) or a textarea with an empty value (a checkbox's
    // and a radio button's own, not "on"); :paused any media element, as
    // none plays; :local-link a link to the document's URL (its fragment
    // aside); :heading h1 to h6, :heading() those of the levels given.
    case 'blank':
      return isBlank;
    case 'paused':
    case 'playing':
      return grammar31 && name === 'paused' ? (el) => isHTML(el) && MEDIA.has(el[S].tag) : () => false;
    case 'local-link':
      return isLocalLink;
    case 'heading': {
      const levels = arg ?? [1, 2, 3, 4, 5, 6];
      return (el) => isHTML(el) && HEADINGS.has(el[S].tag) && levels.includes(HEADINGS.get(el[S].tag));
    }
    case 'lang': {
      // (jsdom 31: a list of ranges)
      if (Array.isArray(arg)) {
        const tests = arg.map(({ ident, string }) => compilePseudo({ name: 'lang', arg: ident ?? string }));
        return (el) => {
          for (let i = 0; i < tests.length; i++) if (tests[i](el)) return true;
          return false;
        };
      }
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

const MEDIA = new Set(['video', 'audio']);
const HEADINGS = new Map([
  ['h1', 1],
  ['h2', 2],
  ['h3', 3],
  ['h4', 4],
  ['h5', 5],
  ['h6', 6],
]);
const NOT_BLANK = new Set(['button', 'submit', 'reset', 'image']);
function isBlank(el) {
  const s = el[S];
  if (!isHTML(el)) return false;
  if (s.tag === 'textarea') return el.value === '';
  if (s.tag !== 'input') return false;
  const type = (s.attrs.get('type') ?? '').toLowerCase();
  if (NOT_BLANK.has(type)) return false;
  const own = type === 'checkbox' || type === 'radio';
  return (own ? (s.value ?? s.attrs.get('value') ?? '') : el.value) === '';
}
const withoutFragment = (href) => {
  const hash = href.indexOf('#');
  return hash < 0 ? href : href.slice(0, hash);
};
function isLocalLink(el) {
  const s = el[S];
  if (!isHTML(el) || (s.tag !== 'a' && s.tag !== 'area')) return false;
  const url = urlOf(el);
  if (url === null) return false;
  // (the document's own URL: an about:blank iframe's is about:blank, not
  // the base it takes from its creator)
  const ds = s.doc[S];
  const doc = ds.url ?? ds.window[S].url.href;
  return withoutFragment(url.href) === withoutFragment(typeof doc === 'string' ? doc : doc.href);
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
// (made of :host, :host() and :host-context() only: the host is
// featureless, any other selector in the compound matches nothing; black
// box, jsdom 31.0.1: b:host, :host.a, :host:not(.z) match nothing)
const isHostTest = (t) => t.kind === 'pseudo' && (t.name === 'host' || t.name === 'host-context');
const isHostCompound = ({ type, tests }) =>
  type === null &&
  (hostScoping
    ? tests.length > 0 && tests.every(isHostTest)
    : tests.length === 1 && tests[0].kind === 'pseudo' && tests[0].name === 'host');
const shadowHostOfParent = (el) => {
  const p = el[S].parent;
  return p !== null && p[S].shadow === true ? p[S].host : null;
};
const shadowHostAbove = (el) => {
  let n = el;
  while (n[S].parent) n = n[S].parent;
  return n[S].shadow === true ? n[S].host : null;
};

function compileCompound(compound) {
  const { type, tests, named } = compound;
  if (hostScoping && tests.some(isHostTest) && !isHostCompound(compound)) return () => false;
  const checks = tests.map(compileTest);
  const lower = type && (type !== '*' || named) ? type.toLowerCase() : null;
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
// (jsdom 31's grammar: its own compiled selectors)
const cache31 = new Map();

// spec31: a jsdom 31 window's (compat.specSelectors).
export function compile(selector, spec31 = false) {
  const text = String(selector);
  const entries = spec31 ? cache31 : cache;
  return entries.get(text) ?? compileEntry(text, spec31, entries);
}

function compileEntry(text, spec31, entries) {
  grammar31 = spec31;
  let list, match;
  try {
    const parser = new Parser(text);
    list = parser.list();
    if (parser.i < parser.text.length) throw invalid(text);
    compilingDynamic = false;
    match = compileList(list);
  } finally {
    grammar31 = false;
  }
  const simpleId =
    list.length === 1 &&
    list[0].parts.length === 1 &&
    list[0].parts[0].type === null &&
    list[0].parts[0].tests.length === 1 &&
    list[0].parts[0].tests[0].kind === 'id'
      ? list[0].parts[0].tests[0].value
      : null;
  const entry = { match, simpleId, dynamic: compilingDynamic };
  if (entries.size >= CACHE_LIMIT) entries.clear();
  entries.set(text, entry);
  return entry;
}

// --- specificity (Selectors 4, 17) -----------------------------------------------------
// As one number: ids * 1e6 + classes, attributes and pseudo-classes * 1e3 + types.

const listSpecificity = (list) => Math.max(0, ...list.map(complexSpecificity));

function complexSpecificity({ parts }) {
  let total = 0;
  for (const { type, tests, named } of parts) {
    if (type !== null && (type !== '*' || named)) total += 1;
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
        case 'slotted':
          total += 1 + complexSpecificity({ parts: [t.arg] });
          break;
        case 'pseudo':
          if (t.name === 'where') break;
          // (:host() and :host-context(): their argument's too)
          if (hostScoping && (t.name === 'host' || t.name === 'host-context')) {
            total += 1e3 + (t.arg ? listSpecificity(t.arg) : 0);
            break;
          }
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

// (scoping: jsdom 31's cascade, hostScoping; spec31: jsdom 31's grammar,
// without scoping for @scope's selectors)
export function compileRuleSelector(selector, scoping = false, spec31 = scoping) {
  const text = String(selector);
  let key = text;
  if (scoping) key = `\0${text}`;
  else if (spec31) key = `\u0001${text}`;
  let entries = ruleCache.get(key);
  if (!entries) {
    hostScoping = scoping;
    grammar31 = spec31;
    try {
      const parser = new Parser(text);
      const list = parser.list();
      if (parser.i < parser.text.length) throw invalid(text);
      entries = list.map((complex) => {
        compilingText = false;
        const match = compileComplex(complex);
        return { match, specificity: complexSpecificity(complex), text: compilingText };
      });
    } finally {
      hostScoping = false;
      grammar31 = false;
    }
    if (ruleCache.size >= CACHE_LIMIT) ruleCache.clear();
    ruleCache.set(key, entries);
  }
  return entries;
}

// A style rule's selector in jsdom 31 (#269 part F3a): its selectorText
// (serializeList31, below), or null when jsdom 31 refuses it, which drops
// the rule.
const textCache31 = new Map();
export function ruleSelector31(selector) {
  let text = textCache31.get(selector);
  if (text === undefined) {
    hostScoping = true;
    grammar31 = true;
    try {
      const parser = new Parser(selector);
      const list = parser.list();
      text = parser.i < parser.text.length ? null : serializeList31(list);
    } catch {
      text = null;
    } finally {
      hostScoping = false;
      grammar31 = false;
    }
    if (textCache31.size >= CACHE_LIMIT) textCache31.clear();
    textCache31.set(selector, text);
  }
  return text;
}

// Whether jsdom 31's selector() takes a selector (black box, 31.0.1):
// valid as its cascade reads a shadow tree's rules (:host-context() too),
// with :is() and :where() unforgiving: an invalid or empty list, or a
// pseudo-element in it, makes it false (:is(::before), :is(a, b:foo)).
const supportsCache31 = new Map();
export function supportsSelector31(selector) {
  const text = String(selector);
  let known = supportsCache31.get(text);
  if (known === undefined) {
    hostScoping = true;
    grammar31 = true;
    unforgiving31 = true;
    try {
      const parser = new Parser(text);
      parser.list();
      known = parser.i >= parser.text.length;
    } catch {
      known = false;
    } finally {
      hostScoping = false;
      grammar31 = false;
      unforgiving31 = false;
    }
    if (supportsCache31.size >= CACHE_LIMIT) supportsCache31.clear();
    supportsCache31.set(text, known);
  }
  return known;
}

// A shadow tree's rule whose subject is outside it (CSS Scoping 3): its
// host (a compound of :host, :host() and :host-context() alone) or an
// element assigned to one of its slots (...::slotted(<compound>) at the
// end: the compound before it, and the combinators, for the slot). null
// for any other selector; throws on an invalid one.
// host: { kind, match(host), specificity }; slotted: { kind, match(element),
// slot(slot), specificity }.
const shadowRuleCache = new Map();
export function shadowRule(selector) {
  const text = String(selector);
  let rule = shadowRuleCache.get(text);
  if (rule === undefined) {
    hostScoping = true;
    grammar31 = true;
    try {
      rule = shadowRuleOf(text);
    } finally {
      hostScoping = false;
      grammar31 = false;
    }
    if (shadowRuleCache.size >= CACHE_LIMIT) shadowRuleCache.clear();
    shadowRuleCache.set(text, rule);
  }
  return rule;
}
function shadowRuleOf(text) {
  const parser = new Parser(text);
  const list = parser.list();
  if (parser.i < parser.text.length || list.length !== 1) throw invalid(text);
  const complex = list[0];
  const { parts } = complex;
  const last = parts[parts.length - 1];
  const specificity = complexSpecificity(complex);
  if (parts.length === 1 && isHostCompound(last))
    return { kind: 'host', match: compileCompound(last), slot: null, specificity };
  const at = last.tests.findIndex((t) => t.kind === 'slotted');
  if (at < 0 || at !== last.tests.length - 1) return null;
  const slotPart = { type: last.type, tests: last.tests.slice(0, at) };
  // (an argument of :host or :host-context() alone: no element is
  // featureless, #342 review)
  const arg = last.tests[at].arg;
  return {
    kind: 'slotted',
    match: arg.tests.some(isHostTest) ? () => false : compileCompound(arg),
    slot: compileComplex({ ...complex, parts: [...parts.slice(0, -1), slotPart] }),
    specificity,
  };
}

// Whether a jsdom 31 window was made in this process: until then the
// queries read no profile (a 31 window's costs them about 5 ns a call).
let windows31 = false;
export function noteWindow31() {
  windows31 = true;
}

export function matches(el, selector) {
  return compile(selector, windows31 && specSelectors(el)).match(el, { scope: el });
}

export function closest(el, selector) {
  const { match } = compile(selector, windows31 && specSelectors(el));
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
  const rs = root[S];
  const doc = rs.type === DOCUMENT_NODE ? root : rs.doc;
  return query(root, compile(typeof selector === 'string' ? selector : String(selector), spec31Doc(doc)), first);
}
const spec31Doc = (doc) => windows31 && doc[S].window[S].compat.specSelectors === true;

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
  const entry = compile(text, spec31Doc(doc));
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

// --- jsdom 31's selectorText -----------------------------------------------------
// (black box, 31.0.1; #269 part F3a): a style rule's selector serialized
// from its parse, as CSSOM's serialize a selector: names as identifiers (escaped where needed: .\31 a,
// #\#), strings in double quotes, pseudo names in lowercase and the
// legacy pseudo-elements with two colons (:before is ::before), a default
// * left out (*.a is .a, *|a is a), an+b in its short form (odd is 2n+1,
// 1n+0 is n), combinators between spaces and list items after ", ".

const serializeList31 = (list) => list.map(serializeComplex).join(', ');

function serializeComplex({ parts, combinators, relative }) {
  let out = '';
  for (let i = 0; i < parts.length; i++) {
    // (a relative selector's leading combinator: none for a descendant)
    const c = relative ? combinators[i] : combinators[i - 1];
    if (c === ' ') out += i > 0 ? ' ' : '';
    else if (c !== undefined) out += i > 0 ? ` ${c} ` : `${c} `;
    out += serializeCompound(parts[i]);
  }
  return out;
}

function serializeCompound({ type, tests, named }) {
  const noNamespace = tests.length > 0 && tests[0].kind === 'noNamespace';
  const rest = noNamespace ? tests.slice(1) : tests;
  const universal = type === '*' && !named;
  const name = universal ? '*' : type !== null && serializeName31(type);
  let out = '';
  if (noNamespace) out = `|${name}`;
  else if (type !== null && (!universal || rest.length === 0)) out = name;
  for (const t of rest) out += serializeTest(t);
  return out;
}

function serializeTest(t) {
  switch (t.kind) {
    case 'id':
      return `#${serializeName31(t.value)}`;
    case 'class':
      return `.${serializeName31(t.value)}`;
    case 'attr': {
      const ns = t.ns === '*' ? '*|' : '';
      if (t.op === null) return `[${ns}${serializeName31(t.name)}]`;
      const value = t.quoted ? serializeString31(t.value) : serializeName31(t.value);
      return `[${ns}${serializeName31(t.name)}${t.op}${value}${t.flag === null ? '' : ` ${t.flag}`}]`;
    }
    case 'never':
    case 'slotted':
      return `::${serializeName31(t.element)}${elementArgument(t)}`;
    default:
      return t.nesting ? '&' : `:${t.name}${pseudoArgument(t)}`;
  }
}

function elementArgument(t) {
  if (t.arg === null || t.arg === undefined) return '';
  if (t.element === 'slotted') return `(${serializeCompound(t.arg)})`;
  return `(${t.arg.map((name) => (name === null ? '*' : serializeName31(name))).join(' ')})`;
}

function pseudoArgument({ name, arg }) {
  if (arg === undefined) return '';
  if (name.startsWith('nth-')) {
    const of = arg.of ? ` of ${serializeList31(arg.of)}` : '';
    return `(${anPlusB(arg.a, arg.b)}${of})`;
  }
  switch (name) {
    case 'lang':
      return `(${arg.map(langRange).join(', ')})`;
    case 'heading':
      return `(${arg.join(', ')})`;
    case 'active-view-transition-type':
      return `(${arg.map(serializeName31).join(', ')})`;
    case 'dir':
    case 'state':
      return `(${serializeName31(arg)})`;
    default:
      return `(${serializeList31(arg)})`;
  }
}

const langRange = ({ ident, string }) => (ident === undefined ? serializeString31(string) : serializeName31(ident));

// (CSS Syntax 3's serialize <an+b>)
function anPlusB(a, b) {
  if (a === 0) return String(b);
  let n = `${a}n`;
  if (a === 1) n = 'n';
  else if (a === -1) n = '-n';
  if (b === 0) return n;
  return b > 0 ? `${n}+${b}` : `${n}${b}`;
}
