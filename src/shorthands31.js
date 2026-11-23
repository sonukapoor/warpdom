// jsdom 31's shorthands that jsdom 30's expansion (shorthands.js) does not
// know: how a declared value sets their longhands (EXPANDERS31: the
// longhands' values in css31-data.js order, or null for a value not read
// here) and how the longhands are written back as the shorthand
// (COMPOSERS31: '' when they cannot be). Written from CSS Text, Text
// Decoration, Lists, Overflow, Logical Properties, Inline Layout, Grid,
// Multicol, Transitions, Animations and Borders 4, checked black box
// against jsdom 31.0.1 (#269 part D4).
import { segments, topLevelCommaSplit } from './shorthands.js';

const words = (value) => segments(value.trim(), /\s/).filter((part, i) => i % 2 === 0 && part !== '');
const layersOf = (value) => topLevelCommaSplit(value).map((layer) => layer.trim());
const lower = (s) => s.toLowerCase();
const isLength = (t) => /^[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?(?:[a-z]+|%)$/i.test(t) || /^0+(?:\.0*)?$/.test(t);
const isNumber = (t) => /^[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?$/i.test(t);
const isMath = (t) => /^(?:calc|min|max|clamp|abs|sign|round|mod|rem)\(/i.test(t);
const isTime = (t) => /^[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?m?s$/i.test(t) || (isMath(t) && /\d(?:m?s)\b/i.test(t));

export const EXPANDERS31 = { __proto__: null };
export const COMPOSERS31 = { __proto__: null };

// --- text-decoration: line, thickness, style, color -----------------------------------

const DECORATION_LINES = new Set(['underline', 'overline', 'line-through', 'blink']);
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

EXPANDERS31['box-shadow'] = (value) => {
  if (lower(value.trim()) === 'none') return ['transparent', 'none', '0px', '0px', 'outset'];
  const out = [[], [], [], [], []];
  for (const layer of layersOf(value)) {
    let color = 'currentcolor';
    let position = 'outset';
    const lengths = [];
    for (const token of words(layer)) {
      const t = lower(token);
      if (t === 'inset') position = t;
      else if (isLength(token) || isMath(token)) lengths.push(token === '0' ? '0px' : token);
      else color = token;
    }
    if (lengths.length < 2) return null;
    out[0].push(color);
    out[1].push(`${lengths[0]} ${lengths[1]}`);
    out[2].push(lengths[2] ?? '0px');
    out[3].push(lengths[3] ?? '0px');
    out[4].push(position);
  }
  return out.map((list) => list.join(', '));
};
COMPOSERS31['box-shadow'] = ([color, offset, blur, spread, position]) => {
  if (offset === 'none') return 'none';
  const lists = [color, offset, blur, spread, position].map(layersOf);
  if (lists.some((list) => list.length !== lists[1].length)) return '';
  return lists[1]
    .map((o, i) => {
      const parts = [];
      if (lists[0][i] !== 'currentcolor') parts.push(lists[0][i]);
      parts.push(o);
      if (lists[3][i] !== '0px') parts.push(lists[2][i], lists[3][i]);
      else if (lists[2][i] !== '0px') parts.push(lists[2][i]);
      if (lists[4][i] !== 'outset') parts.push(lists[4][i]);
      return parts.join(' ');
    })
    .join(', ');
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

EXPANDERS31.columns = (value) => {
  let width = 'auto';
  let count = 'auto';
  for (const token of words(value)) {
    if (lower(token) === 'auto') continue;
    if (isNumber(token)) count = token;
    else width = token;
  }
  return [width, count, 'auto'];
};
COMPOSERS31.columns = ([width, count, height]) => {
  if (height !== 'auto') return '';
  const parts = [width, count].filter((v) => v !== 'auto');
  return parts.length === 0 ? 'auto' : parts.join(' ');
};

// --- grid-area, grid-row, grid-column: start and end lines ---------------------------

const isIdent = (line) => /^-?[a-z_][\w-]*$/i.test(line) && !/^(?:auto|span)$/i.test(line);
const gridLines = (value) =>
  segments(value.trim(), /\//)
    .filter((part, i) => i % 2 === 0)
    .map((part) => part.trim());
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
function readLayer(layer, slots, nameSlot, after = null) {
  const values = new Map();
  for (const token of words(layer)) {
    const t = lower(token);
    const slot = slots.find(([name, accepts]) => !values.has(name) && accepts(token, t));
    if (slot !== undefined) values.set(slot[0], slot[2](token, t));
    else if (!values.has(nameSlot)) values.set(nameSlot, t === 'none' ? 'none' : token);
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
  ['property', (token, t) => /^-?[a-z_][\w-]*$/i.test(token) && t !== 'initial', (token, t) => t],
];
const TRANSITION_DEFAULTS = { duration: '0s', timing: 'ease', delay: '0s', behavior: 'normal', property: 'all' };
EXPANDERS31.transition = (value) => {
  const out = [[], [], [], [], []];
  for (const layer of layersOf(value)) {
    // (the property slot last: a keyword of another slot takes that slot first)
    const values = readLayer(layer, TRANSITION_SLOTS, 'property');
    if (values === null) return null;
    const get = (k) => values.get(k) ?? TRANSITION_DEFAULTS[k];
    ['duration', 'timing', 'delay', 'behavior', 'property'].forEach((k, i) => out[i].push(get(k)));
  }
  return out.map((list) => list.join(', '));
};
// (a property named like another slot's keyword goes last, after that slot written out)
function transitionClash(property) {
  if (EASINGS.test(property)) return 'timing';
  return property === 'normal' || property === 'allow-discrete' ? 'behavior' : null;
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
EXPANDERS31.animation = (value) => {
  const out = [...ANIMATION_ORDER, 'timeline'].map(() => []);
  for (const layer of layersOf(value)) {
    const values = readLayer(layer, ANIMATION_SLOTS, 'name', TIMELINE_SLOT);
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
