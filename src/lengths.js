// Absolute lengths for computed values, as jsdom 30 computes them (black
// box, 30.0.0 to 30.1.3): a value that is one length or one math function
// (calc(), min(), max(), clamp()) computes to px, font-relative units from
// the element's font size (font-size itself from its parent's), viewport
// units from jsdom's 1024 x 768 window, physical units at 96px to the inch;
// numbers to 6 significant digits (13.3333px). Percentages, the dynamic
// viewport units (svw, dvh) and lists (1em 2em) stay as declared, as does
// a math function mixing percentages with lengths.
//
// ctx: { em, rem, lh, rlh } in px, read lazily (ctx.em() and so on): only a
// value with such a unit asks for its element's font size.

const VIEWPORT_WIDTH = 1024, VIEWPORT_HEIGHT = 768;
const ABSOLUTE = { px: 1, cm: 96 / 2.54, mm: 96 / 25.4, q: 96 / 101.6, in: 96, pt: 4 / 3, pc: 16 };
const VIEWPORT = { vw: VIEWPORT_WIDTH / 100, vi: VIEWPORT_WIDTH / 100, vh: VIEWPORT_HEIGHT / 100, vb: VIEWPORT_HEIGHT / 100,
  vmin: Math.min(VIEWPORT_WIDTH, VIEWPORT_HEIGHT) / 100, vmax: Math.max(VIEWPORT_WIDTH, VIEWPORT_HEIGHT) / 100 };
// Font-relative units: [context length, factor] (ex and ch half an em,
// cap and ic one).
const RELATIVE = { em: ['em', 1], ex: ['em', 0.5], ch: ['em', 0.5], cap: ['em', 1], ic: ['em', 1], lh: ['lh', 1],
  rem: ['rem', 1], rex: ['rem', 0.5], rch: ['rem', 0.5], rcap: ['rem', 1], ric: ['rem', 1], rlh: ['rlh', 1] };

export const sixDigits = (n) => String(Number(n.toPrecision(6)));

// The px value of a number with a unit, NaN for a unit left as declared.
function unitPx(n, unit, ctx) {
  const u = unit.toLowerCase();
  const abs = ABSOLUTE[u];
  if (abs !== undefined) return n * abs;
  const rel = RELATIVE[u];
  if (rel !== undefined) return n * rel[1] * ctx[rel[0]]();
  const vp = VIEWPORT[u];
  return vp !== undefined ? n * vp : NaN;
}

// --- math functions ----------------------------------------------------------------

// Tokens: numbers with their unit, operators, parentheses, commas and
// function names (calc, min, max, clamp).
const TOKEN = /\s*(?:([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)(%|[a-z]+)?|(calc|min|max|clamp)\(|([-+*/(),]))/iy;
function tokenize(text) {
  const tokens = [];
  TOKEN.lastIndex = 0;
  while (TOKEN.lastIndex < text.length) {
    const start = TOKEN.lastIndex;
    const m = TOKEN.exec(text);
    if (m === null) return /^\s*$/.test(text.slice(start)) ? tokens : null;
    if (m[1] !== undefined) tokens.push({ n: Number(m[1]), unit: m[2] ?? '' });
    else if (m[3] !== undefined) tokens.push({ fn: m[3].toLowerCase() });
    else tokens.push({ op: m[4] });
  }
  return tokens;
}

// A recursive descent over the tokens: { px } for a length, { n } for a
// number, null when the value has a percentage or an unknown unit.
function evaluate(tokens, ctx) {
  let i = 0;
  const peek = () => tokens[i];
  const expect = (op) => (tokens[i]?.op === op ? (i++, true) : false);
  function primary() {
    const t = tokens[i++];
    if (t === undefined) return null;
    if (t.fn !== undefined) return call(t.fn);
    if (t.op === '(') { const v = sum(); return v !== null && expect(')') ? v : null; }
    if (t.n === undefined) return null;
    if (t.unit === '') return { n: t.n };
    if (t.unit === '%') return null;
    const px = unitPx(t.n, t.unit, ctx);
    return Number.isNaN(px) ? null : { px };
  }
  function call(fn) {
    const args = [sum()];
    while (expect(',')) args.push(sum());
    if (!expect(')') || args.some((a) => a === null)) return null;
    if (fn === 'calc') return args.length === 1 ? args[0] : null;
    // Lengths or numbers (calc(1em * min(2, 3)) is 32px), not both.
    const key = args[0].px !== undefined ? 'px' : 'n';
    if (args.some((a) => a[key] === undefined)) return null;
    const v = args.map((a) => a[key]);
    if (fn === 'min') return { [key]: Math.min(...v) };
    if (fn === 'max') return { [key]: Math.max(...v) };
    return v.length === 3 ? { [key]: Math.max(v[0], Math.min(v[1], v[2])) } : null;
  }
  function product() {
    let left = primary();
    while (left !== null && (peek()?.op === '*' || peek()?.op === '/')) {
      const op = tokens[i++].op;
      const right = primary();
      if (right === null) return null;
      if (op === '*') {
        if (left.px !== undefined && right.px !== undefined) return null;
        left = left.px !== undefined ? { px: left.px * right.n } : right.px !== undefined ? { px: right.px * left.n } : { n: left.n * right.n };
      } else {
        if (right.px !== undefined || right.n === 0) return null;
        left = left.px !== undefined ? { px: left.px / right.n } : { n: left.n / right.n };
      }
    }
    return left;
  }
  function sum() {
    let left = product();
    while (left !== null && (peek()?.op === '+' || peek()?.op === '-')) {
      const op = tokens[i++].op;
      const right = product();
      if (right === null || (left.px === undefined) !== (right.px === undefined)) return null;
      const sign = op === '+' ? 1 : -1;
      left = left.px !== undefined ? { px: left.px + sign * right.px } : { n: left.n + sign * right.n };
    }
    return left;
  }
  const value = sum();
  return i === tokens.length ? value : null;
}

const SINGLE = /^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?([a-z]+)$/i;
const MATH = /^(calc|min|max|clamp)\(/i;

// The px a declared value computes to, or null to keep it as declared.
export function absoluteLength(value, ctx) {
  const single = SINGLE.exec(value);
  if (single !== null) {
    const px = unitPx(Number(value.slice(0, value.length - single[3].length)), single[3], ctx);
    return Number.isNaN(px) ? null : px;
  }
  if (!MATH.test(value) || !value.endsWith(')')) return null;
  const tokens = tokenize(value);
  if (tokens === null) return null;
  const result = evaluate(tokens, ctx);
  return result === null || result.px === undefined || !Number.isFinite(result.px) ? null : result.px;
}

// Whether a value may be a length jsdom 30 resolves: one token (no space
// outside a function) with a letter unit, or a math function.
export function mayResolve(value) {
  if (value.length < 2) return false;
  const c = value.charCodeAt(0);
  // A digit, '.', '+' or '-' first; c or m for calc(), clamp(), min(), max().
  if ((c >= 48 && c <= 57) || c === 46 || c === 43 || c === 45) return SINGLE.test(value);
  return (c === 99 || c === 109 || c === 67 || c === 77) && MATH.test(value);
}

// font-size keywords (CSS Fonts 4 at medium 16px, as jsdom 30 gives them)
// and larger and smaller (a ratio of 1.2).
export const FONT_SIZE_KEYWORDS = { 'xx-small': 9, 'x-small': 10, small: 13, medium: 16, large: 18, 'x-large': 24, 'xx-large': 32, 'xxx-large': 48 };

// font-weight bolder and lighter (CSS Fonts 4, 2.2) from the parent's
// (bolder keeps 900 to 1000).
export function relativeWeight(keyword, parent) {
  if (keyword === 'bolder') return parent < 350 ? 400 : parent < 550 ? 700 : parent < 900 ? 900 : parent;
  return parent < 100 ? parent : parent < 550 ? 100 : parent < 750 ? 400 : 700;
}
