// XPath 1.0 (W3C Recommendation, 16 November 1999) over warpdom's tree,
// for document.evaluate and XPathEvaluator (DOM standard, "XPath"), with
// the HTML standard's rules for XPath in HTML documents for attribute name
// tests (case-insensitive on HTML elements). Unprefixed element name tests
// follow jsdom instead (any namespace, any case; see matches()).
//
// Loaded the first time an expression is compiled (the XPath interfaces in src/dom-parsing.js), so
// test files that never use XPath do not pay for it. It imports nothing:
// the core passes what it needs to createXPath(), so this module can be
// loaded through require() without a second copy of the core's modules.
//
// Values: numbers, strings, booleans and node-sets (arrays of nodes in
// document order without duplicates). An expression is parsed once per
// string into a tree that is evaluated directly; namespace prefixes are
// resolved when an expression is created.

export function createXPath(deps) {
  const {
    S, HTML_NS, XMLNS_NS, XML_NS, attrNode, elementById, domError,
  } = deps;
  const ELEMENT = 1, ATTRIBUTE = 2, TEXT = 3, CDATA = 4, PI = 7, COMMENT = 8, DOCUMENT = 9, DOCTYPE = 10, FRAGMENT = 11;

  const syntaxError = (expression, detail) => domError(`The string '${expression}' is not a valid XPath expression${detail ? `: ${detail}` : ''}.`, 'SyntaxError');

  // --- lexer -------------------------------------------------------------------

  const NAME_START = 'A-Z_a-z\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02FF\\u0370-\\u037D\\u037F-\\u1FFF\\u200C\\u200D'
    + '\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD\\u{10000}-\\u{EFFFF}';
  const NCNAME = new RegExp(`[${NAME_START}][${NAME_START}\\-.0-9\\u00B7\\u0300-\\u036F\\u203F\\u2040]*`, 'uy');
  const NUMBER = /\d+(?:\.\d*)?|\.\d+/y;
  const WS = /[\x20\x09\x0D\x0A]*/y;
  const OPERATOR_NAMES = new Set(['and', 'or', 'mod', 'div']);
  const NODE_TYPES = new Set(['comment', 'text', 'processing-instruction', 'node']);
  const AXES = new Set(['ancestor', 'ancestor-or-self', 'attribute', 'child', 'descendant', 'descendant-or-self', 'following',
    'following-sibling', 'namespace', 'parent', 'preceding', 'preceding-sibling', 'self']);

  // Tokens: { t: type, v: value }, types: 'num', 'str', 'var', 'op' (operators
  // and punctuation), 'name' (a name test: QName, NCName:* or *), 'fn',
  // 'nodetype', 'axis'.
  function tokenize(expression) {
    const tokens = [];
    const n = expression.length;
    let i = 0;
    const skip = () => { WS.lastIndex = i; WS.test(expression); i = WS.lastIndex; };
    const ncname = () => {
      NCNAME.lastIndex = i;
      const m = NCNAME.exec(expression);
      if (!m) return null;
      i = NCNAME.lastIndex;
      return m[0];
    };
    // The lexical disambiguation rule: after a token that is not @, ::, (,
    // [, , or an operator, * is the multiply operator and a name an
    // operator name.
    const operatorContext = () => {
      const last = tokens[tokens.length - 1];
      if (!last) return false;
      if (last.t === 'op') return last.v === ')' || last.v === ']' || last.v === '.' || last.v === '..';
      return true;
    };
    for (;;) {
      skip();
      if (i >= n) break;
      const c = expression[i];
      const c2 = expression[i + 1];
      if (c === '(' || c === ')' || c === '[' || c === ']' || c === ',' || c === '@' || c === '|' || c === '+' || c === '=') {
        tokens.push({ t: 'op', v: c }); i++; continue;
      }
      if (c === '.') {
        if (c2 === '.') { tokens.push({ t: 'op', v: '..' }); i += 2; continue; }
        if (c2 >= '0' && c2 <= '9') { NUMBER.lastIndex = i; NUMBER.exec(expression); tokens.push({ t: 'num', v: Number(expression.slice(i, NUMBER.lastIndex)) }); i = NUMBER.lastIndex; continue; }
        tokens.push({ t: 'op', v: '.' }); i++; continue;
      }
      if (c === '/') { if (c2 === '/') { tokens.push({ t: 'op', v: '//' }); i += 2; } else { tokens.push({ t: 'op', v: '/' }); i++; } continue; }
      if (c === '!') { if (c2 !== '=') throw syntaxError(expression); tokens.push({ t: 'op', v: '!=' }); i += 2; continue; }
      if (c === '<' || c === '>') { if (c2 === '=') { tokens.push({ t: 'op', v: `${c}=` }); i += 2; } else { tokens.push({ t: 'op', v: c }); i++; } continue; }
      if (c === '-') { tokens.push({ t: 'op', v: '-' }); i++; continue; }
      if (c === ':' && c2 === ':') { tokens.push({ t: 'op', v: '::' }); i += 2; continue; }
      if (c === '"' || c === "'") {
        const end = expression.indexOf(c, i + 1);
        if (end < 0) throw syntaxError(expression, 'unterminated string');
        tokens.push({ t: 'str', v: expression.slice(i + 1, end) });
        i = end + 1;
        continue;
      }
      if (c >= '0' && c <= '9') {
        NUMBER.lastIndex = i;
        NUMBER.exec(expression);
        tokens.push({ t: 'num', v: Number(expression.slice(i, NUMBER.lastIndex)) });
        i = NUMBER.lastIndex;
        continue;
      }
      if (c === '*') {
        tokens.push(operatorContext() ? { t: 'op', v: '*' } : { t: 'name', prefix: null, local: '*' });
        i++;
        continue;
      }
      if (c === '$') {
        i++;
        const name = qname();
        if (name === null) throw syntaxError(expression);
        tokens.push({ t: 'var', v: name });
        continue;
      }
      const first = ncname();
      if (first === null) throw syntaxError(expression, `unexpected character '${c}'`);
      if (operatorContext()) {
        if (!OPERATOR_NAMES.has(first)) throw syntaxError(expression, `'${first}' where an operator was expected`);
        tokens.push({ t: 'op', v: first });
        continue;
      }
      let prefix = null;
      let local = first;
      if (expression[i] === ':' && expression[i + 1] !== ':') {
        if (expression[i + 1] === '*') { prefix = first; local = '*'; i += 2; } else {
          i++;
          const second = ncname();
          if (second === null) throw syntaxError(expression);
          prefix = first;
          local = second;
        }
      }
      // What follows decides: ( makes a function name or node type, :: an
      // axis name.
      const save = i;
      skip();
      const next = expression[i];
      const next2 = expression[i + 1];
      i = save;
      if (next === '(' && local !== '*') {
        if (prefix === null && NODE_TYPES.has(local)) tokens.push({ t: 'nodetype', v: local });
        else tokens.push({ t: 'fn', prefix, v: local });
      } else if (next === ':' && next2 === ':' && prefix === null) {
        if (!AXES.has(local)) throw syntaxError(expression, `unknown axis '${local}'`);
        tokens.push({ t: 'axis', v: local });
      } else tokens.push({ t: 'name', prefix, local });
    }
    return tokens;

    function qname() {
      const a = ncname();
      if (a === null) return null;
      if (expression[i] === ':' && expression[i + 1] !== ':') {
        i++;
        const b = ncname();
        if (b === null) return null;
        return `${a}:${b}`;
      }
      return a;
    }
  }

  // --- parser ------------------------------------------------------------------

  // Functions: name -> [min args, max args (Infinity: any)].
  const ARITY = {
    last: [0, 0], position: [0, 0], count: [1, 1], id: [1, 1], 'local-name': [0, 1], 'namespace-uri': [0, 1], name: [0, 1],
    string: [0, 1], concat: [2, Infinity], 'starts-with': [2, 2], contains: [2, 2], 'substring-before': [2, 2],
    'substring-after': [2, 2], substring: [2, 3], 'string-length': [0, 1], 'normalize-space': [0, 1], translate: [3, 3],
    boolean: [1, 1], not: [1, 1], true: [0, 0], false: [0, 0], lang: [1, 1], number: [0, 1], sum: [1, 1], floor: [1, 1],
    ceiling: [1, 1], round: [1, 1],
  };

  function parse(expression) {
    const tokens = tokenize(expression);
    let p = 0;
    const peek = (k = 0) => tokens[p + k];
    const isOp = (v, k = 0) => { const t = tokens[p + k]; return t !== undefined && t.t === 'op' && t.v === v; };
    const fail = (detail) => { throw syntaxError(expression, detail); };
    const expect = (v) => { if (!isOp(v)) fail(`expected '${v}'`); p++; };

    const binary = (next, ops, kind) => () => {
      let left = next();
      for (;;) {
        const t = peek();
        if (!t || t.t !== 'op' || !ops.includes(t.v)) return left;
        p++;
        left = { k: kind, op: t.v, a: left, b: next() };
      }
    };
    const unary = () => {
      if (isOp('-')) { p++; return { k: 'neg', a: unary() }; }
      return union();
    };
    const multiplicative = binary(unary, ['*', 'div', 'mod'], 'arith');
    const additive = binary(multiplicative, ['+', '-'], 'arith');
    const relational = binary(additive, ['<', '>', '<=', '>='], 'cmp');
    const equality = binary(relational, ['=', '!='], 'cmp');
    const and = binary(equality, ['and'], 'and');
    const or = binary(and, ['or'], 'or');

    function union() {
      let left = path();
      while (isOp('|')) { p++; left = { k: 'union', a: left, b: path() }; }
      return left;
    }

    function startsStep(t) {
      if (!t) return false;
      if (t.t === 'name' || t.t === 'axis' || t.t === 'nodetype') return true;
      return t.t === 'op' && (t.v === '.' || t.v === '..' || t.v === '@');
    }

    function path() {
      const t = peek();
      if (!t) fail('unexpected end');
      if (t.t === 'var' || t.t === 'str' || t.t === 'num' || t.t === 'fn' || (t.t === 'op' && t.v === '(')) {
        const primaryExpr = primary();
        const preds = predicates();
        const filter = preds.length ? { k: 'filter', e: primaryExpr, preds } : primaryExpr;
        if (isOp('/') || isOp('//')) {
          const steps = [];
          if (isOp('//')) steps.push(DESCENDANT_OR_SELF);
          p++;
          relative(steps);
          return { k: 'path', root: false, filter, steps: optimize(steps) };
        }
        return filter;
      }
      if (isOp('/')) {
        p++;
        const steps = [];
        if (startsStep(peek())) relative(steps);
        return { k: 'path', root: true, filter: null, steps: optimize(steps) };
      }
      if (isOp('//')) {
        p++;
        const steps = [DESCENDANT_OR_SELF];
        relative(steps);
        return { k: 'path', root: true, filter: null, steps: optimize(steps) };
      }
      const steps = [];
      relative(steps);
      return { k: 'path', root: false, filter: null, steps: optimize(steps) };
    }

    function relative(steps) {
      steps.push(step());
      for (;;) {
        if (isOp('/')) { p++; steps.push(step()); } else if (isOp('//')) { p++; steps.push(DESCENDANT_OR_SELF); steps.push(step()); } else return;
      }
    }

    function step() {
      const t = peek();
      if (!t) fail('expected a location step');
      if (isOp('.')) { p++; return { axis: 'self', test: { type: 'node' }, preds: [] }; }
      if (isOp('..')) { p++; return { axis: 'parent', test: { type: 'node' }, preds: [] }; }
      let axis = 'child';
      if (t.t === 'axis') { axis = t.v; p++; expect('::'); } else if (isOp('@')) { axis = 'attribute'; p++; }
      const test = nodeTest();
      return { axis, test, preds: predicates() };
    }

    function nodeTest() {
      const t = peek();
      if (!t) fail('expected a node test');
      if (t.t === 'name') {
        p++;
        if (t.local === '*') return t.prefix === null ? { type: 'any' } : { type: 'nsany', prefix: t.prefix };
        return { type: 'name', prefix: t.prefix, local: t.local, lower: asciiLower(t.local), folded: t.local.toLowerCase() };
      }
      if (t.t === 'nodetype') {
        p++;
        expect('(');
        if (t.v === 'processing-instruction' && peek()?.t === 'str') {
          const target = peek().v;
          p++;
          expect(')');
          return { type: 'pi', target };
        }
        expect(')');
        return { type: t.v === 'processing-instruction' ? 'pi' : t.v, target: null };
      }
      return fail('expected a node test');
    }

    function predicates() {
      const preds = [];
      while (isOp('[')) {
        p++;
        preds.push(or());
        expect(']');
      }
      return preds;
    }

    function primary() {
      const t = peek();
      p++;
      switch (t.t) {
        case 'var': return { k: 'var', name: t.v };
        case 'str': return { k: 'str', v: t.v };
        case 'num': return { k: 'num', v: t.v };
        case 'fn': {
          if (t.prefix !== null) fail(`unknown function '${t.prefix}:${t.v}'`);
          const arity = ARITY[t.v];
          if (!arity) fail(`unknown function '${t.v}'`);
          expect('(');
          const args = [];
          if (!isOp(')')) {
            args.push(or());
            while (isOp(',')) { p++; args.push(or()); }
          }
          expect(')');
          if (args.length < arity[0] || args.length > arity[1]) fail(`wrong number of arguments to '${t.v}'`);
          return { k: 'fn', name: t.v, args };
        }
        default: {
          // (
          const e = or();
          expect(')');
          return e;
        }
      }
    }

    const result = or();
    if (p < tokens.length) fail(`unexpected '${tokens[p].v ?? tokens[p].local}'`);
    return result;
  }

  const DESCENDANT_OR_SELF = { axis: 'descendant-or-self', test: { type: 'node' }, preds: [] };

  // An expression's value never depends on the context position or size,
  // and it is never a number (so as a predicate it is not positional).
  function positionFree(e) {
    switch (e.k) {
      case 'num': case 'arith': case 'neg': case 'var': return false;
      case 'fn':
        if (e.name === 'position' || e.name === 'last' || NUMBER_FUNCTIONS.has(e.name)) return false;
        return e.args.every(noPositionUse);
      case 'cmp': case 'and': case 'or': return noPositionUse(e.a) && noPositionUse(e.b);
      default: return noPositionUse(e);
    }
  }
  const NUMBER_FUNCTIONS = new Set(['count', 'string-length', 'number', 'sum', 'floor', 'ceiling', 'round']);
  // No position() or last() outside nested predicates (which have their own context).
  function noPositionUse(e) {
    switch (e.k) {
      case 'fn': return e.name !== 'position' && e.name !== 'last' && e.args.every(noPositionUse);
      case 'cmp': case 'and': case 'or': case 'arith': case 'union': return noPositionUse(e.a) && noPositionUse(e.b);
      case 'neg': return noPositionUse(e.a);
      case 'filter': return noPositionUse(e.e);
      case 'path': return e.filter === null || noPositionUse(e.filter);
      default: return true;
    }
  }

  // descendant-or-self::node()/child::x[p] is descendant::x[p] when the
  // predicates do not depend on positions (the usual //x[@a='b']).
  function optimize(steps) {
    const out = [];
    for (let i = 0; i < steps.length; i++) {
      const s = steps[i];
      const next = steps[i + 1];
      if (s === DESCENDANT_OR_SELF && next && next.axis === 'child' && next.preds.every(positionFree)) {
        out.push({ axis: 'descendant', test: next.test, preds: next.preds });
        i++;
      } else out.push(s);
    }
    return out;
  }

  // Parsed expressions by string (namespace prefixes are resolved per
  // compile, not cached).
  const parsed = new Map();

  function prefixesOf(e, out) {
    if (!e || typeof e !== 'object') return out;
    if (e.k === 'path') {
      if (e.filter) prefixesOf(e.filter, out);
      for (const s of e.steps) {
        if (s.test.prefix != null) out.add(s.test.prefix);
        for (const pr of s.preds) prefixesOf(pr, out);
      }
      return out;
    }
    if (e.k === 'filter') { prefixesOf(e.e, out); for (const pr of e.preds) prefixesOf(pr, out); return out; }
    if (e.k === 'fn') { for (const a of e.args) prefixesOf(a, out); return out; }
    if (e.a) prefixesOf(e.a, out);
    if (e.b) prefixesOf(e.b, out);
    return out;
  }

  // Resolves a prefix through an XPathNSResolver (a callback interface: a
  // function, or an object with lookupNamespaceURI). An exception in the
  // callback is reported (the window's error event) and the prefix stays
  // unresolved, as browsers do.
  function lookup(resolver, prefix, report) {
    try {
      let value;
      if (typeof resolver === 'function') value = resolver.call(undefined, prefix);
      else {
        const fn = resolver.lookupNamespaceURI;
        if (typeof fn !== 'function') throw new TypeError("The provided XPathNSResolver has no callable 'lookupNamespaceURI'.");
        value = fn.call(resolver, prefix);
      }
      if (value == null) return null;
      if (typeof value === 'symbol') throw new TypeError('Cannot convert a Symbol value to a string');
      return String(value);
    } catch (error) {
      report(error);
      return null;
    }
  }

  function compile(expression, resolver, report) {
    const text = String(expression);
    let tree = parsed.get(text);
    if (tree === undefined) {
      tree = parse(text);
      if (parsed.size > 1000) parsed.clear();
      parsed.set(text, tree);
    }
    const namespaces = new Map();
    for (const prefix of prefixesOf(tree, new Set())) {
      const ns = resolver == null ? null : lookup(resolver, prefix, report);
      if (ns === null) throw domError(`The namespace prefix '${prefix}' is not defined.`, 'NamespaceError');
      namespaces.set(prefix, ns === '' ? null : ns);
    }
    return { tree, namespaces, text };
  }

  // --- the data model ------------------------------------------------------------

  const asciiLower = (s) => s.replace(/[A-Z]+/g, (m) => m.toLowerCase());
  const typeOf = (n) => n[S].type;

  // Parent in the XPath tree: an attribute's element; a shadow root or a
  // document fragment is a root node.
  function parentOf(node) {
    const s = node[S];
    if (s.type === ATTRIBUTE) return s.element;
    return s.parent;
  }

  function rootOf(node) {
    let n = node;
    for (let p = parentOf(n); p !== null; p = parentOf(n)) n = p;
    return n;
  }

  function stringValue(node) {
    const s = node[S];
    switch (s.type) {
      case ATTRIBUTE: return s.element ? s.element[S].attrs.get(s.key) ?? '' : s.detachedValue;
      case TEXT: case CDATA: case COMMENT: case PI: return s.data;
      case DOCTYPE: return '';
      default: {
        let out = '';
        for (let n = s.first; n !== null; n = nextIn(n, node)) {
          const t = n[S].type;
          if (t === TEXT || t === CDATA) out += n[S].data;
        }
        return out;
      }
    }
  }

  // Next node in tree order within root.
  function nextIn(node, root) {
    const s = node[S];
    if (s.first !== null) return s.first;
    for (let n = node; n !== null && n !== root; n = n[S].parent) if (n[S].next !== null) return n[S].next;
    return null;
  }
  // Next node after node's subtree within root.
  function nextAfter(node, root) {
    for (let n = node; n !== null && n !== root; n = n[S].parent) if (n[S].next !== null) return n[S].next;
    return null;
  }

  // The attribute nodes of an element (namespace declarations are not
  // attributes in XPath).
  function attributesOf(element, out) {
    const es = element[S];
    const info = es.attrNS;
    for (const key of es.attrs.keys()) {
      if (key.charCodeAt(0) === 0 && info.get(key).ns === XMLNS_NS) continue;
      out.push(attrNode(element, key));
    }
    return out;
  }

  // An attribute's namespace and local name.
  const attrNs = (a) => a[S].info?.ns ?? null;
  const attrLocal = (a) => a[S].info?.local ?? a[S].name;

  // Whether the context's document is an HTML document (HTML's XPath rules).
  const htmlDocument = (node) => node[S].doc[S].xml !== true;

  function matches(node, test, principal, ctx) {
    const t = typeOf(node);
    switch (test.type) {
      case 'node': return true;
      case 'text': return t === TEXT || t === CDATA;
      case 'comment': return t === COMMENT;
      case 'pi': return t === PI && (test.target === null || node[S].target === test.target);
      case 'any': return t === principal;
      case 'nsany': {
        if (t !== principal) return false;
        const ns = ctx.namespaces.get(test.prefix);
        return (t === ELEMENT ? node[S].ns : attrNs(node)) === ns;
      }
      default: {
        if (t !== principal) return false;
        if (t === ELEMENT) {
          const s = node[S];
          if (test.prefix !== null) return s.ns === ctx.namespaces.get(test.prefix) && s.tag === test.local;
          // As jsdom matches (25 to 30): an unprefixed name test matches
          // elements in any namespace, ignoring case (the standards: in no
          // namespace, or HTML elements by their lowercase name in HTML
          // documents). So //svg finds SVG elements and //entry finds the
          // entries of an Atom document, as tests written for jsdom expect.
          return s.tag === test.local || s.tag.toLowerCase() === test.folded;
        }
        if (test.prefix !== null) return attrNs(node) === ctx.namespaces.get(test.prefix) && attrLocal(node) === test.local;
        if (attrNs(node) !== null) return false;
        const el = node[S].element;
        const name = el && el[S].ns === HTML_NS && ctx.html ? test.lower : test.local;
        return attrLocal(node) === name;
      }
    }
  }

  // The nodes on an axis from node, in the axis' direction, that pass the test.
  function axisNodes(node, axis, test, ctx, out) {
    const principal = axis === 'attribute' ? ATTRIBUTE : ELEMENT;
    const add = (n) => { if (matches(n, test, principal, ctx)) out.push(n); };
    const s = node[S];
    switch (axis) {
      case 'child':
        if (s.type !== ATTRIBUTE) for (let c = s.first; c !== null; c = c[S].next) add(c);
        break;
      case 'descendant':
        if (s.type !== ATTRIBUTE) for (let c = s.first; c !== null; c = nextIn(c, node)) add(c);
        break;
      case 'descendant-or-self':
        add(node);
        if (s.type !== ATTRIBUTE) for (let c = s.first; c !== null; c = nextIn(c, node)) add(c);
        break;
      case 'self': add(node); break;
      case 'parent': { const p = parentOf(node); if (p !== null) add(p); break; }
      case 'ancestor': for (let p = parentOf(node); p !== null; p = parentOf(p)) add(p); break;
      case 'ancestor-or-self': for (let p = node; p !== null; p = parentOf(p)) add(p); break;
      case 'following-sibling':
        if (s.type !== ATTRIBUTE) for (let n = s.next; n !== null; n = n[S].next) add(n);
        break;
      case 'preceding-sibling':
        if (s.type !== ATTRIBUTE) for (let n = s.prev; n !== null; n = n[S].prev) add(n);
        break;
      case 'following': {
        const root = rootOf(node);
        // After an attribute come its element's children.
        let n = s.type === ATTRIBUTE ? (s.element !== null ? s.element[S].first ?? nextAfter(s.element, root) : null) : nextAfter(node, root);
        for (; n !== null; n = nextIn(n, root)) add(n);
        break;
      }
      case 'preceding': {
        const root = rootOf(node);
        const start = s.type === ATTRIBUTE ? s.element : node;
        if (start === null) break;
        const ancestors = new Set();
        for (let p = parentOf(start); p !== null; p = parentOf(p)) ancestors.add(p);
        // Reverse document order: walk backwards from start.
        for (let n = previousIn(start); n !== null && n !== root; n = previousIn(n)) {
          if (!ancestors.has(n)) add(n);
        }
        break;
      }
      case 'attribute':
        if (s.type === ELEMENT) {
          const attrs = attributesOf(node, []);
          for (const a of attrs) add(a);
        }
        break;
      case 'namespace': break; // no namespace nodes (as in browsers)
      default: break;
    }
    return out;
  }

  // The previous node in tree order (the last descendant of the previous
  // sibling, else the parent).
  function previousIn(node) {
    const s = node[S];
    if (s.prev !== null) {
      let n = s.prev;
      while (n[S].last !== null) n = n[S].last;
      return n;
    }
    return s.parent;
  }

  const REVERSE = new Set(['ancestor', 'ancestor-or-self', 'preceding', 'preceding-sibling', 'parent']);

  // Sorts nodes into document order and removes duplicates. Nodes of one
  // tree are ordered by one walk of that tree (attributes right after their
  // element); trees keep the order in which they first appear.
  function documentOrder(nodes) {
    if (nodes.length < 2) return nodes;
    const set = new Set(nodes);
    if (set.size === 1) return [nodes[0]];
    const roots = [];
    const byRoot = new Map();
    for (const n of set) {
      const r = rootOf(n);
      let group = byRoot.get(r);
      if (!group) { group = new Set(); byRoot.set(r, group); roots.push(r); }
      group.add(n);
    }
    const out = [];
    for (const root of roots) {
      const group = byRoot.get(root);
      let left = group.size;
      for (let n = root; n !== null && left > 0; n = nextIn(n, root)) {
        if (group.has(n)) { out.push(n); left--; }
        if (n[S].type === ELEMENT && n[S].attrNodes !== undefined && n[S].attrNodes !== null && n[S].attrNodes.size > 0) {
          for (const key of n[S].attrs.keys()) {
            const a = n[S].attrNodes.get(key);
            if (a !== undefined && group.has(a)) { out.push(a); left--; }
          }
        }
      }
    }
    return out;
  }

  // --- evaluation ----------------------------------------------------------------

  const isNodeSet = Array.isArray;

  function toBoolean(v) {
    if (typeof v === 'boolean') return v;
    if (typeof v === 'number') return v !== 0 && !Number.isNaN(v);
    if (typeof v === 'string') return v.length > 0;
    return v.length > 0;
  }

  function stringToNumber(s) {
    return /^[\x20\x09\x0D\x0A]*-?(?:\d+(?:\.\d*)?|\.\d+)[\x20\x09\x0D\x0A]*$/.test(s) ? Number(s) : NaN;
  }

  function toNumber(v) {
    if (typeof v === 'number') return v;
    if (typeof v === 'boolean') return v ? 1 : 0;
    if (typeof v === 'string') return stringToNumber(v);
    return stringToNumber(toString(v));
  }

  // Number to string (XPath 1.0, 4.2): no exponent, -0 is 0.
  function numberToString(n) {
    if (Number.isNaN(n)) return 'NaN';
    if (n === 0) return '0';
    if (!Number.isFinite(n)) return n > 0 ? 'Infinity' : '-Infinity';
    const s = String(n);
    const e = s.indexOf('e');
    if (e < 0) return s;
    const negative = n < 0;
    const m = s.slice(negative ? 1 : 0, e);
    const exponent = Number(s.slice(e + 1));
    const dot = m.indexOf('.');
    const mantissa = dot < 0 ? m : m.slice(0, dot) + m.slice(dot + 1);
    const pointAt = (dot < 0 ? m.length : dot) + exponent;
    let digits;
    if (pointAt <= 0) digits = `0.${'0'.repeat(-pointAt)}${mantissa}`;
    else if (pointAt >= mantissa.length) digits = mantissa + '0'.repeat(pointAt - mantissa.length);
    else digits = `${mantissa.slice(0, pointAt)}.${mantissa.slice(pointAt)}`;
    return (negative ? '-' : '') + digits;
  }

  function toString(v) {
    if (typeof v === 'string') return v;
    if (typeof v === 'number') return numberToString(v);
    if (typeof v === 'boolean') return v ? 'true' : 'false';
    return v.length === 0 ? '' : stringValue(v[0]);
  }

  function nodeSet(v, what) {
    if (!isNodeSet(v)) throw new TypeError(`${what}: the value is not a node-set.`);
    return v;
  }

  // Comparisons (XPath 1.0, 3.4).
  function compareValues(op, a, b) {
    const aSet = isNodeSet(a);
    const bSet = isNodeSet(b);
    if (aSet && bSet) {
      const bs = b.map(stringValue);
      for (const x of a) {
        const xs = stringValue(x);
        for (const ys of bs) if (compareAtoms(op, xs, ys)) return true;
      }
      return false;
    }
    if (aSet || bSet) {
      const set = aSet ? a : b;
      const other = aSet ? b : a;
      if (typeof other === 'boolean') return compareAtoms(op, aSet ? toBoolean(a) : a, aSet ? b : toBoolean(b));
      for (const n of set) {
        const sv = stringValue(n);
        const x = typeof other === 'number' ? stringToNumber(sv) : sv;
        if (aSet ? compareAtoms(op, x, other) : compareAtoms(op, other, x)) return true;
      }
      return false;
    }
    return compareAtoms(op, a, b);
  }

  function compareAtoms(op, a, b) {
    if (op === '=' || op === '!=') {
      let eq;
      if (typeof a === 'boolean' || typeof b === 'boolean') eq = toBoolean(a) === toBoolean(b);
      else if (typeof a === 'number' || typeof b === 'number') eq = toNumber(a) === toNumber(b);
      else eq = a === b;
      return op === '=' ? eq : !eq;
    }
    const x = toNumber(a);
    const y = toNumber(b);
    switch (op) {
      case '<': return x < y;
      case '<=': return x <= y;
      case '>': return x > y;
      default: return x >= y;
    }
  }

  // ctx: { node, pos, size, namespaces, html }
  function evaluate(e, ctx) {
    switch (e.k) {
      case 'num': return e.v;
      case 'str': return e.v;
      case 'var': throw domError(`The variable '$${e.name}' is not defined.`, 'SyntaxError');
      case 'or': return toBoolean(evaluate(e.a, ctx)) || toBoolean(evaluate(e.b, ctx));
      case 'and': return toBoolean(evaluate(e.a, ctx)) && toBoolean(evaluate(e.b, ctx));
      case 'cmp': return compareValues(e.op, evaluate(e.a, ctx), evaluate(e.b, ctx));
      case 'arith': {
        const a = toNumber(evaluate(e.a, ctx));
        const b = toNumber(evaluate(e.b, ctx));
        switch (e.op) {
          case '+': return a + b;
          case '-': return a - b;
          case '*': return a * b;
          case 'div': return a / b;
          default: return a % b;
        }
      }
      case 'neg': return -toNumber(evaluate(e.a, ctx));
      case 'union': {
        const a = nodeSet(evaluate(e.a, ctx), 'union');
        const b = nodeSet(evaluate(e.b, ctx), 'union');
        if (a.length === 0) return b;
        if (b.length === 0) return a;
        return documentOrder(a.concat(b));
      }
      case 'filter': {
        let nodes = nodeSet(evaluate(e.e, ctx), 'predicate');
        for (const pred of e.preds) nodes = applyPredicate(nodes, pred, ctx);
        return nodes;
      }
      case 'path': return evaluatePath(e, ctx);
      case 'fn': return call(e, ctx);
      default: throw new Error(`warpdom XPath: unknown expression ${e.k}`);
    }
  }

  function applyPredicate(nodes, pred, ctx) {
    const out = [];
    const size = nodes.length;
    const inner = { node: null, pos: 0, size, namespaces: ctx.namespaces, html: ctx.html };
    for (let i = 0; i < size; i++) {
      inner.node = nodes[i];
      inner.pos = i + 1;
      const v = evaluate(pred, inner);
      if (typeof v === 'number' ? v === i + 1 : toBoolean(v)) out.push(nodes[i]);
    }
    return out;
  }

  function evaluatePath(e, ctx) {
    let nodes;
    if (e.filter !== null) nodes = nodeSet(evaluate(e.filter, ctx), 'path');
    else if (e.root) nodes = [rootOf(ctx.node)];
    else nodes = [ctx.node];
    for (const step of e.steps) {
      const reverse = REVERSE.has(step.axis);
      let out = [];
      for (const node of nodes) {
        let found = axisNodes(node, step.axis, step.test, ctx, []);
        // Predicates count positions along the axis.
        for (const pred of step.preds) found = applyPredicate(found, pred, ctx);
        if (nodes.length === 1) out = found;
        else for (const n of found) out.push(n);
      }
      if (reverse) out.reverse();
      nodes = nodes.length === 1 ? out : documentOrder(out);
      if (nodes.length === 0) return nodes;
    }
    return nodes;
  }

  function argNodeOrContext(e, ctx) {
    if (e.args.length === 0) return ctx.node;
    const set = nodeSet(evaluate(e.args[0], ctx), e.name);
    return set.length === 0 ? null : set[0];
  }

  const codePoints = (s) => Array.from(s);

  function call(e, ctx) {
    const arg = (i) => evaluate(e.args[i], ctx);
    const str = (i) => (i < e.args.length ? toString(arg(i)) : stringValue(ctx.node));
    switch (e.name) {
      case 'last': return ctx.size;
      case 'position': return ctx.pos;
      case 'count': return nodeSet(arg(0), 'count').length;
      case 'id': return idFunction(arg(0), ctx);
      case 'local-name': {
        const n = argNodeOrContext(e, ctx);
        if (n === null) return '';
        const t = typeOf(n);
        if (t === ELEMENT) return n[S].tag;
        if (t === ATTRIBUTE) return attrLocal(n);
        if (t === PI) return n[S].target;
        return '';
      }
      case 'namespace-uri': {
        const n = argNodeOrContext(e, ctx);
        if (n === null) return '';
        const t = typeOf(n);
        if (t === ELEMENT) return n[S].ns ?? '';
        if (t === ATTRIBUTE) return attrNs(n) ?? '';
        return '';
      }
      case 'name': {
        const n = argNodeOrContext(e, ctx);
        if (n === null) return '';
        const t = typeOf(n);
        if (t === ELEMENT) { const s = n[S]; return s.prefix ? `${s.prefix}:${s.tag}` : s.tag; }
        if (t === ATTRIBUTE) return n[S].name;
        if (t === PI) return n[S].target;
        return '';
      }
      case 'string': return str(0);
      case 'concat': { let out = ''; for (let i = 0; i < e.args.length; i++) out += toString(arg(i)); return out; }
      case 'starts-with': return str(0).startsWith(str(1));
      case 'contains': return str(0).includes(str(1));
      case 'substring-before': { const s = str(0); const i = s.indexOf(str(1)); return i < 0 ? '' : s.slice(0, i); }
      case 'substring-after': { const s = str(0); const t = str(1); const i = s.indexOf(t); return i < 0 ? '' : s.slice(i + t.length); }
      case 'substring': {
        const chars = codePoints(str(0));
        const start = round(toNumber(arg(1)));
        const end = e.args.length > 2 ? start + round(toNumber(arg(2))) : Infinity;
        let out = '';
        // Characters whose position p satisfies start <= p < end (NaN compares false).
        for (let p = 1; p <= chars.length; p++) if (p >= start && p < end) out += chars[p - 1];
        return out;
      }
      case 'string-length': return codePoints(str(0)).length;
      case 'normalize-space': return str(0).replace(/[\x20\x09\x0D\x0A]+/g, ' ').replace(/^ | $/g, '');
      case 'translate': {
        const s = codePoints(str(0));
        const from = codePoints(str(1));
        const to = codePoints(str(2));
        const map = new Map();
        for (let i = 0; i < from.length; i++) if (!map.has(from[i])) map.set(from[i], i < to.length ? to[i] : '');
        let out = '';
        for (const c of s) out += map.has(c) ? map.get(c) : c;
        return out;
      }
      case 'boolean': return toBoolean(arg(0));
      case 'not': return !toBoolean(arg(0));
      case 'true': return true;
      case 'false': return false;
      case 'lang': return langFunction(toString(arg(0)), ctx.node);
      case 'number': return e.args.length ? toNumber(arg(0)) : stringToNumber(stringValue(ctx.node));
      case 'sum': { let total = 0; for (const n of nodeSet(arg(0), 'sum')) total += stringToNumber(stringValue(n)); return total; }
      case 'floor': return Math.floor(toNumber(arg(0)));
      case 'ceiling': return Math.ceil(toNumber(arg(0)));
      case 'round': return round(toNumber(arg(0)));
      default: throw new Error(`warpdom XPath: unknown function ${e.name}`);
    }
  }

  // round(): the closest integer, ties towards positive infinity; -0 for
  // numbers from -0.5 to -0.
  function round(n) {
    if (!Number.isFinite(n) || n === 0) return n;
    if (n < 0 && n >= -0.5) return -0;
    return Math.floor(n + 0.5);
  }

  function idFunction(v, ctx) {
    const tokens = [];
    if (isNodeSet(v)) for (const n of v) tokens.push(...stringValue(n).split(/[\x20\x09\x0D\x0A]+/));
    else tokens.push(...toString(v).split(/[\x20\x09\x0D\x0A]+/));
    const root = rootOf(ctx.node);
    const out = [];
    for (const id of tokens) {
      if (id === '') continue;
      let found = null;
      if (root[S].type === DOCUMENT) found = elementById(root, id);
      else {
        for (let n = root[S].first; n !== null; n = nextIn(n, root)) {
          if (n[S].type === ELEMENT && n[S].attrs.get('id') === id) { found = n; break; }
        }
      }
      if (found !== null) out.push(found);
    }
    return documentOrder(out);
  }

  // lang(): the xml:lang attribute of the context node or its nearest
  // ancestor with one.
  function langFunction(lang, node) {
    for (let n = typeOf(node) === ELEMENT ? node : parentOf(node); n !== null; n = parentOf(n)) {
      if (typeOf(n) !== ELEMENT) continue;
      const value = n[S].attrs.get(`\0${XML_NS}\0lang`);
      if (value === undefined) continue;
      const a = asciiLower(value);
      const b = asciiLower(lang);
      return a === b || (a.startsWith(b) && a[b.length] === '-');
    }
    return false;
  }

  // Evaluates a compiled expression with node as the context node.
  function run(compiled, node) {
    const ctx = { node, pos: 1, size: 1, namespaces: compiled.namespaces, html: htmlDocument(node) };
    return evaluate(compiled.tree, ctx);
  }

  return { compile, run, toNumber, toString, toBoolean, isNodeSet };
}
