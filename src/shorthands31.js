// jsdom 31's shorthands that jsdom 30's expansion (shorthands.js) does not
// know: how a declared value sets their longhands (EXPANDERS31: the
// longhands' values in css31-data.js order, or null for a value not read
// here) and how the longhands are written back as the shorthand
// (COMPOSERS31: '' when they cannot be). Written from CSS Text, Text
// Decoration, Lists, Overflow, Logical Properties, Inline Layout, Grid,
// Multicol, Transitions, Animations and Borders 4, checked black box
// against jsdom 31.0.1 (#269 part D4).
// A value's parts at a separator outside strings, parentheses, brackets
// ([b c], grid line names) and escapes
// (\, in a name, the whitespace ending \31 , and \/ are part of it),
// trimmed; whitespace runs are one separator.
const isSpace = (c) => c === ' ' || c === '\t' || c === '\n' || c === '\r' || c === '\f';
const isHex = (c) => /^[0-9a-f]$/i.test(c);
function split(value, isSeparator) {
  const parts = [];
  let start = 0;
  let depth = 0;
  for (let i = 0; i < value.length; i++) {
    const c = value[i];
    if (c === '\\') {
      // (an escape: up to six hex digits and one whitespace after them, or one character)
      let j = i + 1;
      while (j < value.length && j - i <= 6 && isHex(value[j])) j++;
      if (j === i + 1) i = j;
      else {
        if (value[j] === '\r' && value[j + 1] === '\n') j++;
        i = j < value.length && isSpace(value[j]) ? j : j - 1;
      }
    } else if (c === '"' || c === "'") {
      for (i++; i < value.length && value[i] !== c; i++) if (value[i] === '\\') i++;
    } else if (c === '(' || c === '[') depth++;
    else if (c === ')' || c === ']') depth--;
    else if (depth === 0 && isSeparator(c)) {
      parts.push(value.slice(start, i).trim());
      start = i + 1;
    }
  }
  parts.push(value.slice(start).trim());
  return parts;
}
const words = (value) => split(value, isSpace).filter((part) => part !== '');
const layersOf = (value) => split(value, (c) => c === ',');
const slashed = (value) => split(value, (c) => c === '/');
const lower = (s) => s.toLowerCase();
const isLength = (t) => /^[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?(?:[a-z]+|%)$/i.test(t) || /^0+(?:\.0*)?$/.test(t);
const isNumber = (t) => /^[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?$/i.test(t);
const isMath = (t) => /^(?:calc|min|max|clamp|abs|sign|round|mod|rem)\(/i.test(t);
const isTime = (t) => /^[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?m?s$/i.test(t) || (isMath(t) && /\d(?:m?s)\b/i.test(t));

export const EXPANDERS31 = { __proto__: null };
export const COMPOSERS31 = { __proto__: null };

// --- text-decoration: line, thickness, style, color -----------------------------------

const DECORATION_LINES = new Set(['underline', 'overline', 'line-through', 'blink', 'spelling-error', 'grammar-error']);
const DECORATION_STYLES = new Set(['solid', 'double', 'dotted', 'dashed', 'wavy']);
EXPANDERS31['text-decoration'] = (value) => {
  const lines = [];
  let thickness = 'auto';
  let style = 'solid';
  let color = 'currentcolor';
  for (const token of words(value)) {
    const t = lower(token);
    if (DECORATION_LINES.has(t)) lines.push(t);
    else if (t === 'none') lines.length = 0;
    else if (DECORATION_STYLES.has(t)) style = t;
    else if (t === 'auto' || t === 'from-font' || isLength(token) || isMath(token)) thickness = token;
    else color = token;
  }
  return [lines.length === 0 ? 'none' : lines.join(' '), thickness, style, color];
};
COMPOSERS31['text-decoration'] = ([line, thickness, style, color]) => {
  const parts = [line];
  if (thickness !== 'auto') parts.push(thickness);
  if (style !== 'solid') parts.push(style);
  if (color !== 'currentcolor') parts.push(color);
  return parts.length > 1 && line === 'none' ? parts.slice(1).join(' ') : parts.join(' ');
};

// --- text-align: all, last ---------------------------------------------------------

EXPANDERS31['text-align'] = (value) => {
  const t = lower(value.trim());
  if (t === 'justify-all') return ['justify', 'justify'];
  if (t === 'match-parent') return ['match-parent', 'match-parent'];
  return [t, 'auto'];
};
COMPOSERS31['text-align'] = ([all, last]) => {
  if (last === 'auto') return all;
  if (all === last && all === 'justify') return 'justify-all';
  if (all === last && all === 'match-parent') return 'match-parent';
  return '';
};

// --- white-space: collapse, wrap mode, trim ----------------------------------------

const WHITE_SPACE = {
  __proto__: null,
  normal: ['collapse', 'wrap'],
  nowrap: ['collapse', 'nowrap'],
  pre: ['preserve', 'nowrap'],
  'pre-wrap': ['preserve', 'wrap'],
  'pre-line': ['preserve-breaks', 'wrap'],
  'break-spaces': ['break-spaces', 'wrap'],
};
const COLLAPSE = new Set(['collapse', 'discard', 'preserve', 'preserve-breaks', 'preserve-spaces', 'break-spaces']);
EXPANDERS31['white-space'] = (value) => {
  const tokens = words(lower(value));
  if (tokens.length === 1 && WHITE_SPACE[tokens[0]] !== undefined) return [...WHITE_SPACE[tokens[0]], 'none'];
  let collapse = 'collapse';
  let mode = 'wrap';
  const trim = [];
  for (const t of tokens) {
    if (COLLAPSE.has(t)) collapse = t;
    else if (t === 'wrap' || t === 'nowrap') mode = t;
    else trim.push(t);
  }
  return [collapse, mode, trim.length === 0 ? 'none' : trim.join(' ')];
};
COMPOSERS31['white-space'] = ([collapse, mode, trim]) => {
  if (trim === 'none')
    for (const name in WHITE_SPACE) if (WHITE_SPACE[name][0] === collapse && WHITE_SPACE[name][1] === mode) return name;
  const parts = [];
  if (collapse !== 'collapse') parts.push(collapse);
  if (mode !== 'wrap') parts.push(mode);
  if (trim !== 'none') parts.push(trim);
  return parts.length === 0 ? 'normal' : parts.join(' ');
};

// --- text-wrap: mode, style --------------------------------------------------------

EXPANDERS31['text-wrap'] = (value) => {
  let mode = 'wrap';
  let style = 'auto';
  for (const t of words(lower(value))) {
    if (t === 'wrap' || t === 'nowrap') mode = t;
    else style = t;
  }
  return [mode, style];
};
COMPOSERS31['text-wrap'] = ([mode, style]) => {
  if (style === 'auto') return mode;
  return mode === 'wrap' ? style : `${mode} ${style}`;
};

// --- caret: color, animation, shape ------------------------------------------------

const CARET_SHAPES = new Set(['bar', 'block', 'underscore']);
EXPANDERS31.caret = (value) => {
  let color = 'auto';
  let animation = 'auto';
  let shape = 'auto';
  for (const token of words(value)) {
    const t = lower(token);
    if (CARET_SHAPES.has(t)) shape = t;
    else if (t === 'manual') animation = t;
    else if (t !== 'auto') color = token;
  }
  return [color, animation, shape];
};
COMPOSERS31.caret = (values) => {
  const parts = values.filter((v) => v !== 'auto');
  return parts.length === 0 ? 'auto' : parts.join(' ');
};

// --- text-emphasis: style, color ---------------------------------------------------

const EMPHASIS_FILL = new Set(['filled', 'open']);
const EMPHASIS_SHAPES = new Set(['dot', 'circle', 'double-circle', 'triangle', 'sesame']);
EXPANDERS31['text-emphasis'] = (value) => {
  const style = [];
  let color = 'currentcolor';
  for (const token of words(value)) {
    const t = lower(token);
    if (EMPHASIS_FILL.has(t) || EMPHASIS_SHAPES.has(t)) style.push(t);
    else if (t === 'none' || token.startsWith('"') || token.startsWith("'")) style.push(t === 'none' ? t : token);
    else color = token;
  }
  return [style.length === 0 ? 'none' : style.join(' '), color];
};
COMPOSERS31['text-emphasis'] = ([style, color]) => {
  if (color === 'currentcolor') return style;
  return style === 'none' ? color : `${style} ${color}`;
};

// --- list-style: position, image, type ---------------------------------------------

const IMAGE = /^(?:url\(|(?:repeating-)?(?:linear|radial|conic)-gradient\(|image-set\()/i;
EXPANDERS31['list-style'] = (value) => {
  let position = 'outside';
  let image = null;
  let type = null;
  let nones = 0;
  for (const token of words(value)) {
    const t = lower(token);
    if (t === 'inside' || t === 'outside') position = t;
    else if (t === 'none') nones++;
    else if (IMAGE.test(token)) image = token;
    else type = token;
  }
  // (none sets what the others leave: the type first, then the image)
  if (nones > 0 && type === null) {
    type = 'none';
    nones--;
  }
  if (nones > 0 && image === null) image = 'none';
  return [position, image ?? 'none', type ?? 'disc'];
};
COMPOSERS31['list-style'] = (values) => {
  const parts = values.filter((v, i) => v !== ['outside', 'none', 'disc'][i]);
  return parts.length === 0 ? values[0] : parts.join(' ');
};

// --- overflow-clip-margin: a visual box and a length, the same on every side -------

const VISUAL_BOX = new Set(['content-box', 'padding-box', 'border-box']);
function clipMargin(value) {
  let box = null;
  const rest = [];
  for (const token of words(value)) VISUAL_BOX.has(lower(token)) ? (box = lower(token)) : rest.push(token);
  return [box, ...rest].filter((v) => v !== null).join(' ');
}
const same = (values) => (values.every((v) => v === values[0]) ? values[0] : '');
for (const [name, n] of [
  ['overflow-clip-margin', 4],
  ['overflow-clip-margin-block', 2],
  ['overflow-clip-margin-inline', 2],
]) {
  EXPANDERS31[name] = (value) => Array(n).fill(clipMargin(value));
  COMPOSERS31[name] = same;
}

// --- the logical borders ------------------------------------------------------------

const BORDER_STYLES = new Set([
  'none',
  'hidden',
  'dotted',
  'dashed',
  'solid',
  'double',
  'groove',
  'ridge',
  'inset',
  'outset',
]);
const BORDER_WIDTHS = new Set(['thin', 'medium', 'thick']);
function border(value) {
  let width = 'medium';
  let style = 'none';
  let color = 'currentcolor';
  for (const token of words(value)) {
    const t = lower(token);
    if (BORDER_STYLES.has(t)) style = t;
    else if (BORDER_WIDTHS.has(t) || isLength(token) || isMath(token)) width = token;
    else color = token;
  }
  return [width, style, color];
}
const BORDER_INITIALS = ['medium', 'none', 'currentcolor'];
const omitting = (initials) => (values) => {
  const parts = values.filter((v, i) => v !== initials[i]);
  return parts.length === 0 ? values[0] : parts.join(' ');
};
for (const axis of ['block', 'inline']) {
  for (const side of ['start', 'end']) {
    EXPANDERS31[`border-${axis}-${side}`] = border;
    COMPOSERS31[`border-${axis}-${side}`] = omitting(BORDER_INITIALS);
  }
  // (both sides: start and end of each of width, style, color)
  EXPANDERS31[`border-${axis}`] = (value) => border(value).flatMap((v) => [v, v]);
  COMPOSERS31[`border-${axis}`] = ([w1, w2, s1, s2, c1, c2]) =>
    w1 === w2 && s1 === s2 && c1 === c2 ? omitting(BORDER_INITIALS)([w1, s1, c1]) : '';
  for (const part of ['width', 'style', 'color']) {
    EXPANDERS31[`border-${axis}-${part}`] = (value) => {
      const [a, b = a] = words(value);
      return [part === 'style' ? lower(a) : a, part === 'style' ? lower(b) : b];
    };
    COMPOSERS31[`border-${axis}-${part}`] = ([a, b]) => (a === b ? a : `${a} ${b}`);
  }
}

// --- box-shadow: color, offset, blur, spread, position (lists) ---------------------

// (a layer: a color, the offset (none, or two lengths) with a blur and a
// spread after it, and inset, in any order; the color is transparent
// when the offset is none, else currentcolor, black box 31.0.1)
EXPANDERS31['box-shadow'] = (value) => {
  const out = [[], [], [], [], []];
  for (const layer of layersOf(value)) {
    const shadow = shadowLayer(words(layer));
    if (shadow === null) return null;
    shadow.forEach((v, i) => out[i].push(v));
  }
  return out.map((list) => list.join(', '));
};
function shadowLayer(tokens) {
  let color = null;
  let position = 'outset';
  let offset = null;
  const extra = [];
  // (whether blur and spread may still follow the offset)
  let open = false;
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    const t = lower(token);
    const length = isLength(token) || isMath(token);
    if (t === 'inset' && position === 'outset') {
      position = t;
      open = false;
    } else if (t === 'none' && offset === null) {
      offset = t;
      open = true;
    } else if (length && offset === null) {
      const next = tokens[i + 1];
      if (next === undefined || !(isLength(next) || isMath(next))) return null;
      offset = `${zero(token)} ${zero(next)}`;
      i++;
      open = true;
    } else if (length && open && extra.length < 2) extra.push(zero(token));
    else if (!length && t !== 'none' && t !== 'inset' && color === null) {
      color = token;
      open = false;
    } else return null;
  }
  if (offset === null) return null;
  color ??= offset === 'none' ? 'transparent' : 'currentcolor';
  return [color, offset, extra[0] ?? '0px', extra[1] ?? '0px', position];
}
const zero = (token) => (token === '0' ? '0px' : token);
// (none is written with its color, other than transparent: box-shadow:
// none then box-shadow-color: red is red none, black box 31.0.1)
COMPOSERS31['box-shadow'] = ([color, offset, blur, spread, position]) => {
  const lists = [color, offset, blur, spread, position].map(layersOf);
  if (lists.some((list) => list.length !== lists[1].length)) return '';
  return lists[1]
    .map((o, i) => {
      const parts = [];
      const c = lists[0][i];
      // (currentcolor is left out but before none; transparent before none)
      if (o === 'none' ? c !== 'transparent' : c !== 'currentcolor') parts.push(c);
      parts.push(o);
      if (lists[3][i] !== '0px') parts.push(lists[2][i], lists[3][i]);
      else if (lists[2][i] !== '0px') parts.push(lists[2][i]);
      if (lists[4][i] !== 'outset') parts.push(lists[4][i]);
      return parts.join(' ');
    })
    .join(', ');
};

// --- -webkit-text-stroke: width, color --------------------------------------------

EXPANDERS31['-webkit-text-stroke'] = (value) => {
  let width = '0px';
  let color = 'currentcolor';
  for (const token of words(value)) {
    if (isLength(token) || isMath(token)) width = zero(token);
    else color = token;
  }
  return [width, color];
};

// --- vertical-align: baseline source, alignment, shift ------------------------------

// (top, center, bottom, sub and super are shifts; middle, text-top,
// text-bottom and the baselines alignments)
const SHIFTS = new Set(['top', 'center', 'bottom', 'sub', 'super']);
EXPANDERS31['vertical-align'] = (value) => {
  let source = 'auto';
  let alignment = 'baseline';
  let shift = '0px';
  for (const token of words(value)) {
    const t = lower(token);
    if (t === 'first' || t === 'last') source = t;
    else if (SHIFTS.has(t)) shift = t;
    else if (isLength(token) || isMath(token)) shift = token === '0' ? '0px' : token;
    else alignment = t;
  }
  return [source, alignment, shift];
};

// --- columns: width, count, height ---------------------------------------------------

// (width and count, then / and the height; a number or a math function
// of numbers is the count)
EXPANDERS31.columns = (value) => {
  const [main, height = 'auto'] = slashed(value);
  let width = 'auto';
  let count = 'auto';
  for (const token of words(main)) {
    if (lower(token) === 'auto') continue;
    if (isNumber(token) || isMathNumber(token)) count = token;
    else width = token;
  }
  return [width, count, height || 'auto'];
};
COMPOSERS31.columns = ([width, count, height]) => {
  const parts = [width, count].filter((v) => v !== 'auto');
  const main = parts.length === 0 ? 'auto' : parts.join(' ');
  return height === 'auto' ? main : `${main} / ${height}`;
};

// --- grid-area, grid-row, grid-column: start and end lines ---------------------------

// (a custom ident: -- or a letter, _, non-ASCII or an escape first; not
// auto or span. An escape's hex digits are read one way only.)
const ESCAPE = String.raw`\\(?:(?:[0-9a-f]{6}|[0-9a-f]{1,5}(?![0-9a-f]))(?:\r\n|[ \t\n\r\f])?|[^\n\r\f0-9a-f])`;
const IDENT = new RegExp(
  String.raw`^(?:--|-?(?:[a-z_]|[^\x00-\x7f]|${ESCAPE}))(?:[\w-]|[^\x00-\x7f]|${ESCAPE})*$`,
  'i',
);
const isIdent = (line) => IDENT.test(line) && !/^(?:auto|span)$/i.test(line);
const gridLines = slashed;
// (a line left out: the line before it when that is a custom ident, else auto)
const otherwise = (line) => (isIdent(line) ? line : 'auto');
EXPANDERS31['grid-area'] = (value) => {
  const [rowStart, colStart = otherwise(rowStart), rowEnd = otherwise(rowStart), colEnd = otherwise(colStart)] =
    gridLines(value);
  return [rowStart, colStart, rowEnd, colEnd];
};
COMPOSERS31['grid-area'] = ([rowStart, colStart, rowEnd, colEnd]) => {
  const parts = [rowStart, colStart, rowEnd, colEnd];
  if (colEnd === otherwise(colStart)) {
    parts.pop();
    if (rowEnd === otherwise(rowStart)) {
      parts.pop();
      if (colStart === otherwise(rowStart)) parts.pop();
    }
  }
  return parts.join(' / ');
};
for (const name of ['grid-row', 'grid-column']) {
  EXPANDERS31[name] = (value) => {
    const [start, end = otherwise(start)] = gridLines(value);
    return [start, end];
  };
  COMPOSERS31[name] = ([start, end]) => (end === otherwise(start) ? start : `${start} / ${end}`);
}

// --- transition and animation (lists) -------------------------------------------------

const EASINGS = /^(?:ease|ease-in|ease-out|ease-in-out|linear|step-start|step-end)$|^(?:cubic-bezier|steps|linear)\(/i;
// (steps(n, end) and steps(n, jump-end) are written steps(n))
const easing = (token) =>
  (/^(?:cubic-bezier|steps|linear)\(/i.test(token) ? token : lower(token)).replace(
    /^steps\(\s*([^,()]+?)\s*,\s*(?:jump-)?end\s*\)$/i,
    'steps($1)',
  );
const isMathNumber = (t) => isMath(t) && !/\d\s*(?:m?s|%|[a-z]+)\b/i.test(t.replace(/^[a-z-]+\(/i, ''));

// A layer read token by token: each fills the first slot that takes it
// and is still empty (slots: [name, accepts(token, lower), value(token,
// lower)]); a token no free slot takes is the name (or property), or the
// layer is invalid (null). Black box, jsdom 31.0.1: in 1s ease ease the
// second ease is the name.
// after: a slot tried once the name is taken (animation's timeline: auto
// is the duration, then the name, then the timeline).
// rawLayer: the layer as written, whose token a name or property keeps
// (canonical31 has lowercased keywords: in 1s normal NORMAL the property
// is NORMAL).
function readLayer(layer, slots, nameSlot, after = null, rawLayer = null) {
  const values = new Map();
  const tokens = words(layer);
  // (canonical31 may reorder: each token takes the first unused written
  // token equal to it but for case, or stays as it is)
  const pool = rawLayer === null ? [] : words(rawLayer);
  const raws = tokens.map((token) => {
    const at = pool.findIndex((r) => r !== null && lower(r) === lower(token));
    if (at < 0) return token;
    const raw = pool[at];
    pool[at] = null;
    return raw;
  });
  for (const [i, token] of tokens.entries()) {
    const t = lower(token);
    const slot = slots.find(([name, accepts]) => !values.has(name) && accepts(token, t));
    if (slot !== undefined) values.set(slot[0], slot[2](token, t, raws[i]));
    else if (!values.has(nameSlot)) values.set(nameSlot, t === 'none' ? 'none' : raws[i]);
    else if (after !== null && !values.has(after[0]) && after[1](token, t)) values.set(after[0], after[2](token, t));
    else return null;
  }
  return values;
}

// transition: duration, timing function, delay, behavior, property.
const TRANSITION_SLOTS = [
  ['duration', (token) => isTime(token), (token) => token],
  ['delay', (token) => isTime(token), (token) => token],
  ['timing', (token) => EASINGS.test(token), easing],
  ['behavior', (token, t) => t === 'normal' || t === 'allow-discrete', (token, t) => t],
  // (the name as written: jsdom 31 keeps its case, --Accent and OPACITY alike)
  ['property', (token, t) => isIdent(token) && t !== 'initial', (token, t, raw) => raw],
];
const TRANSITION_DEFAULTS = { duration: '0s', timing: 'ease', delay: '0s', behavior: 'normal', property: 'all' };
// (the layers as written, matched to value's by position: canonical31
// keeps the layers' order)
const rawLayers = (value, raw) => {
  const layers = layersOf(raw);
  return layers.length === layersOf(value).length ? layers : null;
};
EXPANDERS31.transition = (value, raw = value) => {
  const out = [[], [], [], [], []];
  const written = rawLayers(value, raw);
  for (const [i, layer] of layersOf(value).entries()) {
    // (the property slot last: a keyword of another slot takes that slot first)
    const values = readLayer(layer, TRANSITION_SLOTS, 'property', null, written?.[i] ?? null);
    if (values === null) return null;
    const get = (k) => values.get(k) ?? TRANSITION_DEFAULTS[k];
    ['duration', 'timing', 'delay', 'behavior', 'property'].forEach((k, i) => out[i].push(get(k)));
  }
  return out.map((list) => list.join(', '));
};
// (a property named like another slot's keyword goes last, after that slot written out)
function transitionClash(property) {
  if (EASINGS.test(property)) return 'timing';
  // (in any case: NORMAL clashes too, and keeps its spelling)
  return lower(property) === 'normal' || lower(property) === 'allow-discrete' ? 'behavior' : null;
}
COMPOSERS31.transition = ([duration, timing, delay, behavior, property]) => {
  const lists = [duration, timing, delay, behavior, property].map(layersOf);
  if (lists.some((list) => list.length !== lists[0].length)) return '';
  return lists[0]
    .map((d, i) => {
      const [, t, dl, b, p] = lists.map((list) => list[i]);
      const clash = transitionClash(p);
      const parts = [];
      if (p !== 'all' && clash === null) parts.push(p);
      if (d !== '0s' || dl !== '0s') parts.push(d);
      if (t !== 'ease' || clash === 'timing') parts.push(t);
      if (dl !== '0s') parts.push(dl);
      if (b !== 'normal' || clash === 'behavior') parts.push(b);
      if (clash !== null) parts.push(p);
      return parts.length === 0 ? 'all' : parts.join(' ');
    })
    .join(', ');
};

// animation: duration, timing function, delay, iteration count, direction,
// fill mode, play state, name, timeline (lists), then composition and the
// range and trigger (reset to their initial values, one each).
const DIRECTIONS = new Set(['normal', 'reverse', 'alternate', 'alternate-reverse']);
const FILLS = new Set(['none', 'forwards', 'backwards', 'both']);
const PLAY_STATES = new Set(['running', 'paused']);
const ANIMATION_SLOTS = [
  ['duration', (token, t) => isTime(token) || t === 'auto', (token, t) => (t === 'auto' ? t : token)],
  ['delay', (token) => isTime(token), (token) => token],
  ['timing', (token) => EASINGS.test(token), easing],
  [
    'count',
    (token, t) => t === 'infinite' || isNumber(token) || isMathNumber(token),
    (token, t) => (t === 'infinite' ? t : token),
  ],
  ['direction', (token, t) => DIRECTIONS.has(t), (token, t) => t],
  ['fill', (token, t) => FILLS.has(t), (token, t) => t],
  ['state', (token, t) => PLAY_STATES.has(t), (token, t) => t],
];
const ANIMATION_ORDER = ['duration', 'timing', 'delay', 'count', 'direction', 'fill', 'state', 'name'];
const ANIMATION_DEFAULTS = {
  duration: 'auto',
  timing: 'ease',
  delay: '0s',
  count: '1',
  direction: 'normal',
  fill: 'none',
  state: 'running',
  name: 'none',
  timeline: 'auto',
};
const TIMELINE_SLOT = ['timeline', (token, t) => t === 'auto', (token, t) => t];
EXPANDERS31.animation = (value, raw = value) => {
  const out = [...ANIMATION_ORDER, 'timeline'].map(() => []);
  const written = rawLayers(value, raw);
  for (const [i, layer] of layersOf(value).entries()) {
    const values = readLayer(layer, ANIMATION_SLOTS, 'name', TIMELINE_SLOT, written?.[i] ?? null);
    if (values === null) return null;
    [...ANIMATION_ORDER, 'timeline'].forEach((k, i) => out[i].push(values.get(k) ?? ANIMATION_DEFAULTS[k]));
  }
  return [...out.map((list) => list.join(', ')), 'replace', 'normal', 'normal', 'none'];
};
// (a name that is another slot's keyword keeps that slot written out)
function animationClash(name) {
  const t = lower(name);
  if (EASINGS.test(name)) return 'timing';
  if (t === 'infinite') return 'count';
  if (DIRECTIONS.has(t)) return 'direction';
  if (FILLS.has(t) && t !== 'none') return 'fill';
  if (PLAY_STATES.has(t)) return 'state';
  if (t === 'auto') return 'duration';
  return null;
}
COMPOSERS31.animation = (values) => {
  if (values[9] !== 'replace' || values[10] !== 'normal' || values[11] !== 'normal' || values[12] !== 'none') return '';
  const lists = values.slice(0, 9).map(layersOf);
  if (lists.some((list) => list.length !== lists[0].length)) return '';
  const layers = [];
  for (let i = 0; i < lists[0].length; i++) {
    if (lists[8][i] !== 'auto') return '';
    const v = Object.fromEntries(ANIMATION_ORDER.map((k, n) => [k, lists[n][i]]));
    const clash = animationClash(v.name);
    const parts = [];
    for (const k of ANIMATION_ORDER.slice(0, 7)) {
      // (a delay keeps the duration before it)
      if (v[k] !== ANIMATION_DEFAULTS[k] || clash === k || (k === 'duration' && v.delay !== '0s')) parts.push(v[k]);
    }
    if (v.name !== 'none' || parts.length === 0) parts.push(v.name);
    layers.push(parts.join(' '));
  }
  return layers.join(', ');
};

// --- flex-flow: direction, wrap (each left out at its initial value) ----------------

COMPOSERS31['flex-flow'] = ([direction, wrap]) => {
  const parts = [direction, wrap].filter((v, i) => v !== ['row', 'nowrap'][i]);
  return parts.length === 0 ? direction : parts.join(' ');
};

// --- animation-range: start, end ---------------------------------------------------

// Each a range name (normal, cover, contain, entry, exit, ...) and an
// offset, either left out; the start's 0% and the end's 100% are left
// out (entry 0% is entry); an end left out is the start's name, or normal
// (black box, 31.0.1: entry 10% is entry 10% and entry).
const rangePart = (name, offset, drop) => {
  if (name === null) return offset ?? 'normal';
  return offset === null || offset === drop ? name : `${name} ${offset}`;
};
// (one layer: offsets attach to a range name before them, never to
// normal, which is a whole range: normal 80% is normal and 80%)
function rangeLayer(layer) {
  const groups = [];
  for (const token of words(layer)) {
    const isOffset = isLength(token) || isMath(token);
    const last = groups[groups.length - 1];
    if (isOffset && last !== undefined && last.offset === null && last.name !== null && last.name !== 'normal')
      last.offset = token;
    else groups.push(isOffset ? { name: null, offset: token } : { name: lower(token), offset: null });
  }
  if (groups.length === 0 || groups.length > 2) return null;
  const [start, end] = groups;
  const part = (group, drop) => (group.name === 'normal' ? 'normal' : rangePart(group.name, group.offset, drop));
  const startName = start.name === 'normal' ? null : start.name;
  return [part(start, '0%'), end === undefined ? (startName ?? 'normal') : part(end, '100%')];
}
EXPANDERS31['animation-range'] = (value) => {
  const starts = [];
  const ends = [];
  for (const layer of layersOf(value)) {
    const range = rangeLayer(layer);
    if (range === null) return null;
    starts.push(range[0]);
    ends.push(range[1]);
  }
  return [starts.join(', '), ends.join(', ')];
};
// (the end left out when it is the start's range name alone)
// (layer by layer; lists of different lengths are left as longhands. The
// end left out when it is the start's range name alone, or normal after
// a start without one; 20% 20% stays.)
COMPOSERS31['animation-range'] = ([start, end]) => {
  const starts = layersOf(start);
  const ends = layersOf(end);
  if (starts.length !== ends.length) return '';
  const strip = (part, drop) => (part.endsWith(` ${drop}`) ? part.slice(0, -drop.length - 1) : part);
  return starts
    .map((startPart, i) => {
      const s = strip(startPart, '0%');
      const e = strip(ends[i], '100%');
      const first = words(s)[0];
      const named = !isLength(first) && !isMath(first);
      return (named && e === first) || (!named && e === 'normal') ? s : `${s} ${e}`;
    })
    .join(', ');
};

// --- container: name, type ---------------------------------------------------------

// (names, then / and the type; a type left out is normal)
// (scroll-state after size or inline-size: a / scroll-state size is
// a / size scroll-state)
EXPANDERS31.container = (value) => {
  const [names, type = 'normal'] = slashed(value);
  const types = words(type);
  const scroll = types.findIndex((t) => lower(t) === 'scroll-state');
  if (scroll !== -1 && types.length === 2) types.push(types.splice(scroll, 1)[0]);
  return [names || 'none', types.join(' ') || 'normal'];
};
COMPOSERS31.container = ([name, type]) => (lower(type) === 'normal' ? name : `${name} / ${type}`);

// --- text-box: trim, edge ------------------------------------------------------------

// (normal and none alone: none and auto; an edge alone trims both sides;
// a trim alone, none too, has the auto edge)
const TRIMS = new Set(['none', 'trim-start', 'trim-end', 'trim-both']);
EXPANDERS31['text-box'] = (value) => {
  let trim = null;
  const edge = [];
  for (const token of words(value)) {
    const t = lower(token);
    if (t === 'normal') return ['none', 'auto'];
    if (TRIMS.has(t)) trim = t;
    else edge.push(t);
  }
  return [trim ?? 'trim-both', edge.length === 0 ? 'auto' : edge.join(' ')];
};
COMPOSERS31['text-box'] = ([trim, edge]) => {
  // (none keeps an edge given with it: none cap alphabetic)
  if (trim === 'none') return edge === 'auto' ? 'normal' : `none ${edge}`;
  if (edge === 'auto') return trim;
  return trim === 'trim-both' ? edge : `${trim} ${edge}`;
};

// --- font-synthesis: weight, style, small-caps, position --------------------------

// (the keywords given are auto, the others none)
const SYNTHESES = ['weight', 'style', 'small-caps', 'position'];
EXPANDERS31['font-synthesis'] = (value) => {
  const given = new Set(words(value).map(lower));
  return SYNTHESES.map((name) => (given.has(name) ? 'auto' : 'none'));
};
COMPOSERS31['font-synthesis'] = (values) => {
  let out = '';
  for (let i = 0; i < SYNTHESES.length; i++) {
    if (values[i] === 'auto') out = out === '' ? SYNTHESES[i] : `${out} ${SYNTHESES[i]}`;
    else if (values[i] !== 'none') return '';
  }
  return out === '' ? 'none' : out;
};

// --- line-clamp: max-lines, block-ellipsis, continue -------------------------------

// (none: auto, no-ellipsis, normal; a count clamps with an ellipsis, or
// the string or no-ellipsis after it)
EXPANDERS31['line-clamp'] = (value) => {
  const tokens = words(value);
  if (tokens.length === 1 && lower(tokens[0]) === 'none') return ['auto', 'no-ellipsis', 'normal'];
  // (the count and the ellipsis in either order: "more" 3 is 3 "more")
  const at = tokens.findIndex((t) => isNumber(t) || isMath(t));
  if (at === -1 || tokens.length > 2) return null;
  const ellipsis = tokens.length === 2 ? tokens[1 - at] : 'ellipsis';
  const keyword = lower(ellipsis);
  return [tokens[at], keyword === 'no-ellipsis' || keyword === 'ellipsis' ? keyword : ellipsis, 'collapse'];
};
COMPOSERS31['line-clamp'] = ([count, ellipsis, mode]) => {
  if (count === 'auto' && ellipsis === 'no-ellipsis' && mode === 'normal') return 'none';
  if (mode !== 'collapse' || count === 'auto') return '';
  return ellipsis === 'ellipsis' ? count : `${count} ${ellipsis}`;
};

// --- offset: position, path, distance, rotate, anchor ------------------------------

// (a position, a path with a distance and a rotation after it, then / and
// the anchor; none alone is the path, normal the position)
const PATH_FUNCTION = /^(?:path|ray|url|inset|circle|ellipse|polygon|rect|xywh|shape)\(/i;
const BOXES = new Set(['content-box', 'padding-box', 'border-box', 'fill-box', 'stroke-box', 'view-box', 'margin-box']);
const isAngle = (t) =>
  /^[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?(?:deg|grad|rad|turn)$/i.test(t) ||
  (isMath(t) && /\d(?:deg|grad|rad|turn)\b/i.test(t));
// (a shape or url() and a box in either order: the box after the shape,
// border-box left out with one, black box 31.0.1)
EXPANDERS31.offset = (value) => {
  const [main, anchor = 'auto'] = slashed(value);
  const position = [];
  let shape = null;
  let box = null;
  let distance = '0px';
  const rotate = [];
  for (const token of words(main)) {
    const t = lower(token);
    const started = shape !== null || box !== null;
    const open = rotate.length === 0 && distance === '0px';
    if (open && shape === null && (t === 'none' || PATH_FUNCTION.test(token))) shape = t === 'none' ? t : token;
    else if (open && box === null && shape !== 'none' && BOXES.has(t)) box = t;
    else if (started && (t === 'auto' || t === 'reverse' || isAngle(token)))
      rotate.push(t === 'auto' || t === 'reverse' ? t : token);
    else if (started && (isLength(token) || isMath(token))) distance = token === '0' ? '0px' : token;
    else if (!started) position.push(t === 'auto' || t === 'normal' || POSITION_WORDS.has(t) ? t : token);
    else return null;
  }
  return [
    position.length === 0 ? 'normal' : position.join(' '),
    pathOf(shape, box),
    distance,
    rotateOrder(rotate),
    anchor || 'auto',
  ];
};
function pathOf(shape, box) {
  if (shape === null) return box ?? 'none';
  return box === null || box === 'border-box' ? shape : `${shape} ${box}`;
}
const POSITION_WORDS = new Set(['left', 'right', 'top', 'bottom', 'center']);
// (offset-rotate: auto or reverse first, then the angle)
function rotateOrder(parts) {
  if (parts.length === 0) return 'auto';
  const keyword = parts.find((p) => p === 'auto' || p === 'reverse');
  const angle = parts.find((p) => p !== 'auto' && p !== 'reverse');
  if (keyword === undefined) return angle;
  return angle === undefined ? keyword : `${keyword} ${angle}`;
}
COMPOSERS31.offset = ([position, path, distance, rotate, anchor]) => {
  let head = position === 'normal' ? '' : position;
  // (none is written when a distance or rotation follows it: none 10px)
  if (path !== 'none' || distance !== '0px' || rotate !== 'auto') {
    head = head === '' ? path : `${head} ${path}`;
    if (distance !== '0px') head = `${head} ${distance}`;
    if (rotate !== 'auto') head = `${head} ${rotate}`;
  }
  // (nothing but the anchor: normal)
  if (head === '') head = 'normal';
  return anchor === 'auto' ? head : `${head} / ${anchor}`;
};

// --- grid-template: rows, columns, areas; grid: those and the auto flow ----------

// (none; rows / columns; or rows of an area string each, a size and line
// names around it, then / and the columns: the areas are the strings, the
// rows the sizes, auto when left out, with their names)
const isString = (t) => t[0] === '"' || t[0] === "'";
const isNames = (t) => t[0] === '[';
function gridTemplate(value) {
  const [rowsPart, columns = 'none', ...rest] = slashed(value);
  if (rest.length > 0) return null;
  if (lower(rowsPart) === 'none' && columns === 'none') return ['none', 'none', 'none'];
  const tokens = words(rowsPart);
  if (!tokens.some(isString)) return [rowsPart || 'none', columns || 'none', 'none'];
  const areas = [];
  const rows = [];
  let row = null;
  for (const token of tokens) {
    if (isString(token)) {
      if (row !== null) rows.push(row);
      row = { before: pendingNames, size: 'auto', after: '' };
      pendingNames = '';
      areas.push(token);
    } else if (isNames(token)) {
      if (row === null || (row.size !== 'auto' && row.after !== '') || row.after !== '') pendingNames = token;
      else row.after = token;
    } else if (row !== null && row.size === 'auto' && row.after === '') row.size = token;
    else return null;
  }
  rows.push(row);
  // (names next to each other are one set: [b] [c] is [b c])
  const rowList = rows
    .map((r) => [r.before, r.size, r.after].filter((p) => p !== '').join(' '))
    .join(' ')
    .replace(/\]\s+\[/g, ' ');
  return [rowList, columns || 'none', areas.join(' ')];
}
let pendingNames = '';
EXPANDERS31['grid-template'] = (value) => {
  pendingNames = '';
  const out = gridTemplate(value);
  return out !== null && pendingNames === '' ? out : null;
};
// (the area form back: each area string with its row's size, auto left
// out, and names; '' when the rows are not one size per string)
function composeTemplate(rows, columns, areas) {
  if (areas === 'none') {
    if (rows === 'none' && columns === 'none') return 'none';
    return `${rows} / ${columns}`;
  }
  // (rows none cannot go with areas: '' for grid-template-areas: "a" alone)
  if (lower(rows) === 'none') return '';
  const strings = words(areas);
  const parts = [];
  let i = 0;
  let names = [];
  for (const token of words(rows)) {
    if (isNames(token)) {
      names.push(token);
      continue;
    }
    if (i >= strings.length || /^(?:repeat|subgrid|masonry)\b/i.test(token)) return '';
    // (between two rows: the previous one's names after it, then this
    // one's before its string)
    if (i > 0 && names.length > 0) parts.push(names.shift());
    parts.push(...names, strings[i++]);
    names = [];
    if (lower(token) !== 'auto') parts.push(token);
  }
  parts.push(...names);
  if (i !== strings.length) return '';
  const head = parts.join(' ');
  return columns === 'none' ? head : `${head} / ${columns}`;
}
COMPOSERS31['grid-template'] = ([rows, columns, areas]) => composeTemplate(rows, columns, areas);

// grid: a template (the auto flow at row, auto, auto), or auto-flow on one
// side: auto-flow [dense] [rows] / columns, rows / auto-flow [dense]
// [columns]. (row dense is dense)
EXPANDERS31.grid = (value) => {
  const [first, second, ...rest] = slashed(value);
  if (rest.length > 0) return null;
  const flowSide = (part) => words(part ?? '').some((t) => lower(t) === 'auto-flow');
  const flow = (part) => {
    let dense = false;
    const sizes = [];
    for (const token of words(part)) {
      const t = lower(token);
      if (t === 'dense') dense = true;
      else if (t !== 'auto-flow') sizes.push(token);
    }
    return { dense, size: sizes.length === 0 ? 'auto' : sizes.join(' ') };
  };
  if (flowSide(first)) {
    const f = flow(first);
    return ['none', second || 'none', 'none', f.dense ? 'dense' : 'row', f.size, 'auto'];
  }
  if (second !== undefined && flowSide(second)) {
    const f = flow(second);
    return [first || 'none', 'none', 'none', f.dense ? 'column dense' : 'column', 'auto', f.size];
  }
  pendingNames = '';
  const template = gridTemplate(value);
  if (template === null || pendingNames !== '') return null;
  return [...template, 'row', 'auto', 'auto'];
};
COMPOSERS31.grid = ([rows, columns, areas, flow, autoRows, autoColumns]) => {
  const f = lower(flow);
  if (f === 'row' && autoRows === 'auto' && autoColumns === 'auto') return composeTemplate(rows, columns, areas);
  if (areas !== 'none') return '';
  if ((f === 'row' || f === 'dense' || f === 'row dense') && rows === 'none' && autoColumns === 'auto') {
    let side = f === 'row' ? 'auto-flow' : 'auto-flow dense';
    if (autoRows !== 'auto') side = `${side} ${autoRows}`;
    return `${side} / ${columns}`;
  }
  if ((f === 'column' || f === 'column dense') && columns === 'none' && autoRows === 'auto') {
    let side = f === 'column' ? 'auto-flow' : 'auto-flow dense';
    if (autoColumns !== 'auto') side = `${side} ${autoColumns}`;
    return `${rows} / ${side}`;
  }
  return '';
};

// --- mask: its layers (image, position / size, repeat, origin, clip,
// composite, mode), mask-border reset -------------------------------------------------

// (one box is the origin and the clip, two are origin then clip; a
// position of one keyword or length is paired with center)
const MASK_REPEATS = new Set(['repeat-x', 'repeat-y', 'repeat', 'space', 'round', 'no-repeat']);
const MASK_BOXES = new Set(['content-box', 'padding-box', 'border-box', 'fill-box', 'stroke-box', 'view-box']);
const COMPOSITES = new Set(['add', 'subtract', 'intersect', 'exclude']);
const MASK_MODES = new Set(['alpha', 'luminance', 'match-source']);
const MASK_BORDER = ['none', '0', 'auto', '0', 'stretch', 'alpha'];
const POSITION_KEYWORDS = new Set(['left', 'right', 'top', 'bottom', 'center']);
const isSizeWord = (t) => lower(t) === 'auto' || isLength(t) || isMath(t);
function maskLayer(layer) {
  const [main, ...after] = slashed(layer);
  if (after.length > 1) return null;
  let image = 'none';
  const position = [];
  let size = 'auto';
  const repeat = [];
  const boxes = [];
  let composite = 'add';
  let mode = 'match-source';
  const tokens = words(main);
  // (the size: the words after the slash that are sizes; the rest of the layer follows)
  let rest = [];
  if (after.length === 1) {
    const sizeWords = words(after[0]);
    // (cover or contain alone, or one or two lengths or auto)
    const cover = sizeWords.length > 0 && /^(?:cover|contain)$/i.test(sizeWords[0]);
    let n = cover ? 1 : 0;
    while (!cover && n < 2 && n < sizeWords.length && isSizeWord(sizeWords[n])) n++;
    if (n === 0) return null;
    // (one length is that width and an auto height)
    size =
      n === 1 && !cover && lower(sizeWords[0]) !== 'auto' ? `${sizeWords[0]} auto` : sizeWords.slice(0, n).join(' ');
    rest = sizeWords.slice(n);
  }
  for (const token of [...tokens, ...rest]) {
    const t = lower(token);
    if (MASK_REPEATS.has(t)) repeat.push(t);
    else if (MASK_BOXES.has(t) || t === 'no-clip') boxes.push(t);
    else if (COMPOSITES.has(t)) composite = t;
    else if (MASK_MODES.has(t)) mode = t;
    else if (POSITION_KEYWORDS.has(t) || isLength(token) || isMath(token))
      position.push(POSITION_KEYWORDS.has(t) ? t : token);
    else if (image === 'none') image = t === 'none' ? t : token;
    else return null;
  }
  let pos = '0% 0%';
  if (position.length === 1)
    pos = /^(?:top|bottom)$/.test(position[0]) ? `center ${position[0]}` : `${position[0]} center`;
  else if (position.length > 1) pos = position.join(' ');
  // (no-clip is a clip only, before or after the origin: the origin
  // stays border-box without one)
  const noClip = boxes.indexOf('no-clip');
  if (noClip !== -1) boxes.splice(noClip, 1);
  if (boxes.length > (noClip === -1 ? 2 : 1) || boxes.includes('no-clip')) return null;
  const origin = boxes[0] ?? 'border-box';
  const clip = noClip !== -1 ? 'no-clip' : (boxes[1] ?? origin);
  return [image, pos, size, repeat.join(' ') || 'repeat', origin, clip, composite, mode];
}
EXPANDERS31.mask = (value) => {
  const out = [[], [], [], [], [], [], [], []];
  for (const layer of layersOf(value)) {
    const parts = maskLayer(layer);
    if (parts === null || parts.includes(null)) return null;
    parts.forEach((p, i) => out[i].push(p));
  }
  return [...out.map((list) => list.join(', ')), ...MASK_BORDER];
};
COMPOSERS31.mask = (values) => {
  for (let i = 0; i < MASK_BORDER.length; i++) if (values[8 + i] !== MASK_BORDER[i]) return '';
  const lists = values.slice(0, 8).map(layersOf);
  const count = lists[0].length;
  if (lists.some((list) => list.length !== count)) return '';
  const layers = [];
  for (let i = 0; i < count; i++) {
    const [image, position, size, repeat, origin, clip, composite, mode] = lists.map((list) => list[i]);
    let out = image === 'none' ? '' : image;
    const add = (part) => (out = out === '' ? part : `${out} ${part}`);
    if (size !== 'auto') add(`${position} / ${size}`);
    else if (position !== '0% 0%') add(position);
    if (repeat !== 'repeat') add(repeat);
    if (origin === 'border-box' && clip === 'no-clip') add(clip);
    else if (origin !== 'border-box' || clip !== 'border-box') add(origin === clip ? origin : `${origin} ${clip}`);
    if (composite !== 'add') add(composite);
    if (mode !== 'match-source') add(mode);
    layers.push(out === '' ? 'none' : out);
  }
  return layers.join(', ');
};
