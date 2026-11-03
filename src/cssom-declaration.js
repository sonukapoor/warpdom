// A CSSStyleRule's style before jsdom 27.1.0: cssom's own declaration
// object (cssom 0.5, rrweb-cssom 0.6 to 0.8, whose CSSStyleDeclaration.js
// and declaration parsing are the same), not the window's
// CSSStyleDeclaration (#244; black box 20.0.3 to 27.0.1). Values stay as
// written, without validation (#34363a, RGB(1, 2, 3), var(--x), bogus);
// names keep their case and are matched exactly; shorthands are not
// expanded; no item() and no camelCase accessors. Its state is in plain
// own properties, as there: length, parentRule, _importants, the indices
// and one property per name holding its value.
//
// cssom.js keeps the rule's parsed declarations (css.js) for the cascade
// and re-parses them from this object when it changes (the change hook),
// as jsdom's cascade reads it: through its methods, or by a write of its
// properties (rule.style.color = 'green' where color is declared, #137).
// So the object is a Proxy of cssom's, which sees the writes; its keys,
// descriptors and prototype are the object's.

const indexOf = Array.prototype.indexOf;
const splice = Array.prototype.splice;

// The function told of a change, per declaration object (the Proxy).
const hooks = new WeakMap();
// While a method of an object runs (per object: a value's toString may
// change another rule's style): its writes are one change, reported at
// the end.
const running = new WeakMap();
const quiet = (style) => running.get(style) > 0;
function mutate(style, change) {
  running.set(style, (running.get(style) ?? 0) + 1);
  try {
    return change();
  } finally {
    const depth = running.get(style) - 1;
    running.set(style, depth);
    if (depth === 0) hooks.get(style)?.(style);
  }
}

// cssom's setProperty, without the change report.
function put(style, name, value, priority) {
  if (style[name]) {
    // Property already exist. Overwrite it.
    const index = indexOf.call(style, name);
    if (index < 0) {
      style[style.length] = name;
      style.length++;
    }
  } else {
    // A new property, or one whose value is '' (appended again, as in cssom).
    style[style.length] = name;
    style.length++;
  }
  style[name] = value + '';
  style._importants[name] = priority;
}

// cssom's parse errors, with the line and character in token.
function fail(token, message, i) {
  const lines = token.substring(0, i).split('\n');
  const line = lines.length;
  const char = lines.pop().length + 1;
  const error = new Error(`${message} (line ${line}, char ${char})`);
  error.line = line;
  error.char = char;
  throw error;
}
// The end of the string or comment at i (a quote or '/*'), or i.
function skip(token, i) {
  const c = token[i];
  if (c === '"' || c === "'") {
    let index = i + 1;
    do {
      index = token.indexOf(c, index) + 1;
      if (!index) fail(token, `Unmatched ${c}`, i);
    } while (token[index - 2] === '\\');
    return index - 1;
  }
  if (c === '/' && token[i + 1] === '*') {
    const end = token.indexOf('*/', i + 2);
    if (end === -1) fail(token, 'Missing */', i + 2);
    return end + 1;
  }
  return i;
}

// cssom's parser, from a declaration block's first character (start) to
// the '}' that ends it: [name, value, priority] triples in out, and the
// index of that '}' (or the text's length). Not modeled: expression()
// values (IE).
function parseBlock(token, start, out) {
  let state = 'before-name';
  let buffer = '';
  let name = '';
  let priority = '';
  let depth = 0;
  for (let i = start; i < token.length; i++) {
    const c = token[i];
    switch (c) {
      case ' ':
      case '\t':
      case '\r':
      case '\n':
      case '\f':
        if (state === 'value' || state === 'value-parenthesis') buffer += c;
        break;
      case '"':
      case "'": {
        const end = skip(token, i);
        buffer += token.slice(i, end + 1);
        i = end;
        if (state === 'before-value') state = 'value';
        break;
      }
      case '/':
        if (token[i + 1] === '*') i = skip(token, i);
        else buffer += c;
        break;
      case ':':
        if (state === 'name') {
          name = buffer.trim();
          buffer = '';
          state = 'before-value';
        } else buffer += c;
        break;
      case '(':
        if (state === 'value') {
          state = 'value-parenthesis';
          depth = 1;
        } else if (state === 'value-parenthesis') depth++;
        buffer += c;
        break;
      case ')':
        if (state === 'value-parenthesis' && --depth === 0) state = 'value';
        buffer += c;
        break;
      case '!':
        if (state === 'value' && token.startsWith('!important', i)) {
          priority = 'important';
          i += 'important'.length;
        } else buffer += c;
        break;
      case ';':
        if (state === 'value') {
          out.push([name, buffer.trim(), priority]);
          priority = '';
          buffer = '';
          state = 'before-name';
        } else buffer += c;
        break;
      case '}':
        if (state === 'value') out.push([name, buffer.trim(), priority]);
        if (state === 'value' || state === 'before-name' || state === 'name') return i;
        break;
      // Neither starts anything inside a block, and '{' is dropped.
      case '{':
        break;
      case '@':
        buffer += c;
        break;
      default:
        if (state === 'before-name') state = 'name';
        else if (state === 'before-value') state = 'value';
        buffer += c;
    }
  }
  return token.length;
}

// The text after the block, which cssom parses as more rules: only its
// errors are modeled (a '}' outside a block: 'color: red; } x' throws
// Unexpected }), not its rules or at-rules.
function parseRest(token, start) {
  let selector = false;
  for (let i = start; i < token.length; i++) {
    const c = token[i];
    if (c === '"' || c === "'" || (c === '/' && token[i + 1] === '*')) i = skip(token, i);
    else if (c === '{') {
      if (selector) i = parseBlock(token, i + 1, []);
      selector = false;
    } else if (c === '}') fail(token, 'Unexpected }', i);
    else if (!selector && !/[\s;]/.test(c)) selector = true;
  }
}

function CSSStyleDeclaration() {
  this.length = 0;
  this.parentRule = null;
  this._importants = {};
}

// A plain object, as cssom's prototype is (function expressions: they are
// constructors there, with a prototype property).
CSSStyleDeclaration.prototype = {
  constructor: CSSStyleDeclaration,
  getPropertyValue: function getPropertyValue(name) {
    return this[name] || '';
  },
  setProperty: function setProperty(name, value, priority) {
    mutate(this, () => put(this, name, value, priority));
  },
  removeProperty: function removeProperty(name) {
    if (!(name in this)) return '';
    const index = indexOf.call(this, name);
    if (index < 0) return '';
    return mutate(this, () => {
      const prevValue = this[name];
      this[name] = '';
      splice.call(this, index, 1);
      return prevValue;
    });
  },
  getPropertyCSSValue: function getPropertyCSSValue() {},
  getPropertyPriority: function getPropertyPriority(name) {
    return this._importants[name] || '';
  },
  getPropertyShorthand: function getPropertyShorthand() {},
  isPropertyImplicit: function isPropertyImplicit() {},
  get cssText() {
    const properties = [];
    for (let i = 0, length = this.length; i < length; ++i) {
      const name = this[i];
      const value = this.getPropertyValue(name);
      let priority = this.getPropertyPriority(name);
      if (priority) priority = ` !${priority}`;
      properties[i] = `${name}: ${value}${priority};`;
    }
    return properties.join(' ');
  },
  set cssText(text) {
    mutate(this, () => {
      for (let i = this.length; i--;) this[this[i]] = '';
      splice.call(this, 0, this.length);
      this._importants = {};
      // As cssom: the text parsed as the block of '#bogus{' + text + '}'.
      const token = `#bogus{${text}}`;
      const declarations = [];
      parseRest(token, parseBlock(token, 7, declarations) + 1);
      for (const [name, value, priority] of declarations) this.setProperty(name, value, priority);
    });
  },
};

// A rule's declaration object from its block's text (the text between
// its braces), reporting changes to onChange. Text cssom could not have
// parsed (an unclosed string) keeps the declarations before it.
export function cssomDeclaration(text, parentRule, onChange) {
  const style = new CSSStyleDeclaration();
  style.parentRule = parentRule;
  const declarations = [];
  try {
    parseBlock(`${text}}`, 0, declarations);
  } catch {
    // (an unclosed string or comment: the declarations before it)
  }
  for (const [name, value, priority] of declarations) put(style, name, value, priority);
  // A write outside the methods (a set, defineProperty or delete) is a
  // change of its own.
  const write = (result) => {
    if (!quiet(proxy)) onChange(proxy);
    return result;
  };
  const proxy = new Proxy(style, {
    defineProperty: (target, key, descriptor) => write(Reflect.defineProperty(target, key, descriptor)),
    deleteProperty: (target, key) => write(Reflect.deleteProperty(target, key)),
  });
  hooks.set(proxy, onChange);
  return proxy;
}

// The declarations the cascade reads from it, as jsdom's cascade (its
// style-rules.js): [name, value, important] in index order. Left out:
// those with an empty value, which set nothing there, and those whose
// value ends in a priority cssom did not take (red ! important), which
// cssstyle rejects.
export function cssomEntries(style) {
  const out = [];
  for (let i = 0; i < style.length; i++) {
    const name = style[i];
    const value = style.getPropertyValue(name);
    if (typeof value !== 'string' || value.trim() === '' || /!\s*important\s*$/i.test(value)) continue;
    out.push([String(name), value, style.getPropertyPriority(name) === 'important']);
  }
  return out;
}
