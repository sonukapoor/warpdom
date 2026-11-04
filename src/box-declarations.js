// An inline style's margin and padding declarations as jsdom's
// CSSStyleDeclaration keeps them (#104, #147; black box 20.0.3 to 30.1.3,
// and its cssstyle sources): a longhand set after its shorthand is merged
// into it (style={{ margin: 0, marginTop: 4 }} is margin: 4px 0px 0px 0px
// before jsdom 27, margin: 4px 0px 0px from 27), not kept beside it.
//
// The declarations are css.js's Map (name -> { value, important }), in
// item order. Each variant replays its cssstyle's setters on it:
//
// - 'A' (cssstyle 2 and 3: jsdom 20 to 23) and 'B' (cssstyle 4.1, jsdom
//   25) and 'B6' (cssstyle 4.6, jsdom 26): a shorthand is one item. Its
//   longhands hold their values unlisted (decls.hidden: getPropertyValue
//   reads them, cssText and length do not); a longhand set beside them is
//   listed until all four are set, when they are merged into the shorthand
//   (all four values as written). 'B' and 'B6' merge only when the four
//   and the shorthand have the same priority, else list the four.
// - 'C' (jsdom 27 to 29) and 'D' (jsdom 30): every longhand is an item,
//   and the shorthand too when the four have one priority (padding: 2px
//   has length 5). A longhand set moves to the end, and the shorthand
//   after it. cssText leaves out the longhands a later shorthand covers.
//   'D' keeps the given priority where 'C' drops it (setProperty of a
//   longhand under an !important shorthand, the merged shorthand) and the
//   accessors set a normal declaration ('C' keeps the one there was).
import { hasVarFunction } from './css-values.js';
import { segments, serializeBox } from './shorthands.js';

const SIDES = ['top', 'right', 'bottom', 'left'];
// shorthand -> its longhands; longhand -> its shorthand.
export const BOX_LONGHANDS = Object.assign(Object.create(null), { margin: [], padding: [] });
export const BOX_SHORTHAND = Object.create(null);
for (const shorthand of Object.keys(BOX_LONGHANDS))
  for (const side of SIDES) {
    BOX_LONGHANDS[shorthand].push(`${shorthand}-${side}`);
    BOX_SHORTHAND[`${shorthand}-${side}`] = shorthand;
  }
// (Called for every inline style write: the first letter first.)
export const isBoxName = (name) => {
  const c = name.charCodeAt(0);
  return (c === 109 || c === 112) && (name === 'margin' || name === 'padding' || BOX_SHORTHAND[name] !== undefined);
};

// The variant of a validation mode (css.js cssMode).
const VARIANTS = { jsdom20: 'A', jsdom22: 'A', jsdom25: 'B', jsdom26: 'B6', jsdom27: 'C', spec: 'D' };
export const boxVariant = (mode) => VARIANTS[mode];
const isLegacy = (variant) => variant === 'A' || variant === 'B' || variant === 'B6';

const hasVar = (value) => value.includes('(') && hasVarFunction(value);

// A value's space-separated components (calc(1px + 2px) is one).
function parts(value) {
  if (!value.includes('(')) return value.split(' ');
  const list = segments(value);
  return list.filter((_, i) => i % 2 === 0);
}
const EMPTY_SIDES = ['', '', '', ''];
// The four sides of a shorthand's 1 to 4 components (cached: a style
// write is hot).
const sideCache = new Map();
function sides(value) {
  let out = sideCache.get(value);
  if (out === undefined) {
    const [a, b = a, c = a, d = b] = parts(value);
    out = [a, b, c, d];
    if (sideCache.size > 1000) sideCache.clear();
    sideCache.set(value, out);
  }
  return out;
}

// Declaration records, shared: they are never changed (a write sets a new
// one), and a write of a shorthand sets five (cached: a style write is hot).
const recordCache = [new Map(), new Map()];
function recordFor(value, important) {
  const cache = recordCache[important ? 1 : 0];
  let out = cache.get(value);
  if (out === undefined) {
    if (cache.size > 1000) cache.clear();
    cache.set(value, (out = Object.freeze({ value, important })));
  }
  return out;
}

// The declaration record of a name, listed or (legacy) unlisted.
const recordOf = (decls, name) => decls.get(name) ?? decls.hidden?.get(name);
const valueIn = (decls, name) => recordOf(decls, name)?.value;
const priorityIn = (decls, name) => recordOf(decls, name)?.important === true;
// decls.rev counts the changes to the listed declarations, decls.order
// those to their names (writeBox's caller updates the style attribute and
// the indices only then).
const changed = (decls) => (decls.rev = (decls.rev ?? 0) + 1);
const reordered = (decls) => (decls.order = (decls.order ?? 0) + 1);
function remove(decls, name) {
  if (decls.delete(name)) {
    changed(decls);
    reordered(decls);
  } else decls.hidden?.delete(name);
}
// cssstyle's _setProperty: '' removes; a listed one keeps its place, any
// other is listed at the end.
function put(decls, name, value, important) {
  if (value === undefined) return;
  if (value === '') {
    remove(decls, name);
    return;
  }
  const old = decls.get(name);
  if (old !== undefined && old.value === value && old.important === important) return;
  if (old === undefined) {
    decls.hidden?.delete(name);
    reordered(decls);
  }
  decls.set(name, recordFor(value, important));
  changed(decls);
}
// Unlisted (cssstyle's this._values[name] = value): after remove().
function hide(decls, name, value) {
  (decls.hidden ??= new Map()).set(name, recordFor(value, false));
}
function setPriority(decls, name, important) {
  const old = recordOf(decls, name);
  if (old === undefined || old.important === important) return;
  if (decls.has(name)) {
    decls.set(name, recordFor(old.value, important));
    changed(decls);
  } else decls.hidden.set(name, recordFor(old.value, important));
}

// cssstyle 2 to 4.6's implicitSetter (the shorthand): '' removes it and
// its longhands.
function legacyShorthand(decls, shorthand, value) {
  const longhands = BOX_LONGHANDS[shorthand];
  if (value === '') {
    remove(decls, shorthand);
    for (const longhand of longhands) remove(decls, longhand);
    return;
  }
  put(decls, shorthand, value, false);
  const values = sides(value);
  for (let i = 0; i < 4; i++) {
    remove(decls, longhands[i]);
    hide(decls, longhands[i], values[i]);
  }
}

// cssstyle 2 to 4.6's subImplicitSetter (a longhand).
function legacyLonghand(decls, variant, name, value) {
  const shorthand = BOX_SHORTHAND[name];
  const longhands = BOX_LONGHANDS[shorthand];
  if (variant === 'B6' && hasVar(value)) {
    remove(decls, shorthand);
    put(decls, name, value, false);
    return;
  }
  put(decls, name, value, false);
  const combined = priorityIn(decls, shorthand);
  // All four set, and ('B', 'B6') with the shorthand's priority: merged.
  let all = true;
  let same = true;
  for (const longhand of longhands) {
    const record = recordOf(decls, longhand);
    if (record === undefined || !record.value) all = false;
    else if (record.important !== combined) same = false;
  }
  if (all && (same || variant === 'A')) {
    const values = longhands.map((longhand) => valueIn(decls, longhand));
    for (let i = 0; i < 4; i++) {
      remove(decls, longhands[i]);
      hide(decls, longhands[i], values[i]);
    }
    put(decls, shorthand, values.join(' '), variant !== 'A' && combined);
    return;
  }
  if (variant === 'A') return;
  const records = longhands.map((longhand) => recordOf(decls, longhand));
  remove(decls, shorthand);
  for (let i = 0; i < 4; i++)
    put(decls, longhands[i], records[i]?.value, longhands[i] === name ? false : records[i]?.important || combined);
}

// jsdom 27 and later: _positionShorthandSetter, and the var() branch.
// priority: the shorthand's.
function positionShorthand(decls, variant, shorthand, value, priority) {
  const longhands = BOX_LONGHANDS[shorthand];
  if (hasVar(value)) {
    for (const longhand of longhands) remove(decls, longhand);
    put(decls, shorthand, value, variant === 'D' && priority);
    return;
  }
  const values = value === '' ? EMPTY_SIDES : sides(value);
  let kept = false;
  for (let i = 0; i < 4; i++) {
    const longhand = longhands[i];
    const old = decls.get(longhand);
    if (old === undefined) put(decls, longhand, values[i], priority);
    else if (!priority && old.important) kept = true;
    else if (old.value !== values[i] || old.important !== priority) put(decls, longhand, values[i], priority);
  }
  if (kept) remove(decls, shorthand);
  else put(decls, shorthand, value, priority);
}

// jsdom 27 and later: _positionLonghandSetter, and the var() branch.
function positionLonghand(decls, variant, name, value, priority) {
  const shorthand = BOX_SHORTHAND[name];
  remove(decls, shorthand);
  if (hasVar(value)) {
    put(decls, name, value, variant === 'D' && priority);
    return;
  }
  remove(decls, name);
  put(decls, name, value, priority);
  if (value === '') return;
  const values = [];
  for (const longhand of BOX_LONGHANDS[shorthand]) {
    const record = decls.get(longhand);
    if (record === undefined || record.important !== priority) return;
    values.push(record.value);
  }
  put(decls, shorthand, serializeBox(values), variant === 'D' && priority);
}

// A write of one of these names: via 'accessor' (style.marginTop = v),
// 'set' (setProperty) or 'remove' (removeProperty); value: its declared
// value, or '' (setProperty with '' or null, or an accessor given '').
export function writeBox(decls, variant, name, value, important, via) {
  // (Once one of these names was written, cssText looks for the longhands
  // a shorthand leaves out.)
  decls.boxed = true;
  if (via === 'remove') {
    remove(decls, name);
    return;
  }
  const shorthand = BOX_LONGHANDS[name] !== undefined;
  if (isLegacy(variant)) {
    // setProperty with '': cssstyle 4.6 also gives '' to the accessor.
    if (via === 'set' && value === '') {
      if (variant === 'B6') writeBox(decls, variant, name, '', false, 'accessor');
      remove(decls, name);
      return;
    }
    if (shorthand) {
      // (B6: var() as it is, after the longhands are removed)
      if (variant === 'B6' && hasVar(value)) {
        legacyShorthand(decls, name, '');
        put(decls, name, value, false);
      } else legacyShorthand(decls, name, value);
    } else if (value === '' && variant === 'A') return;
    else legacyLonghand(decls, variant, name, value);
    // setProperty gives the priority after the accessor ran.
    if (via === 'set') setPriority(decls, name, important);
    return;
  }
  if (via === 'set' && value === '') {
    writeBox(decls, variant, name, '', false, 'accessor');
    remove(decls, name);
    return;
  }
  if (shorthand) {
    const priority = via === 'set' ? important : variant === 'C' && decls.get(name)?.important === true;
    positionShorthand(decls, variant, name, value, priority);
    return;
  }
  const own = via === 'set' ? important : variant === 'C' && decls.get(name)?.important === true;
  // 'C': a longhand under an !important shorthand is normal.
  const priority = variant === 'C' && decls.get(BOX_SHORTHAND[name])?.important ? false : own;
  positionLonghand(decls, variant, name, value, priority);
}

// A declaration list parsed (a style attribute or cssText), as cssstyle
// sets it: each declaration given to setProperty in order. From jsdom 27
// the list is prepared first (normalize.js prepareProperties): a
// shorthand gives each longhand its first component, but for an
// !important longhand of a normal one, which keeps the shorthand out; a
// longhand with another priority than the first of its group keeps the
// shorthand out; the four longhands of a group are merged into the
// shorthand, in the order they came, at the end.
export function replayBox(decls, variant) {
  decls.hidden = undefined;
  let found = false;
  let longhand = false;
  for (const name of decls.keys())
    if (BOX_SHORTHAND[name] !== undefined) found = longhand = true;
    else if (BOX_LONGHANDS[name] !== undefined) found = true;
  if (!found) return false;
  // (No longhand given: each shorthand as set alone, which is what the
  // prepared list comes to.)
  if (longhand && !isLegacy(variant)) {
    const entries = prepare([...decls]);
    decls.clear();
    for (const [name, record] of entries) replay(decls, variant, name, record);
    return true;
  }
  let n = 0;
  for (const [name, record] of decls) {
    names[n] = name;
    records[n++] = record;
  }
  decls.clear();
  for (let i = 0; i < n; i++) replay(decls, variant, names[i], records[i]);
  names.length = records.length = 0;
  return true;
}
// (Scratch lists: a style attribute is parsed often.)
const names = [];
const records = [];
// Each declaration as setProperty gives it; others as they are (their
// records keep what parseInto noted, as masked).
function replay(decls, variant, name, record) {
  if (isBoxName(name)) writeBox(decls, variant, name, record.value, record.important, 'set');
  else decls.set(name, record);
}

function prepare(entries) {
  const given = new Map(entries);
  const out = new Map();
  const groups = new Map();
  for (const [name, record] of entries) {
    const shorthand = BOX_SHORTHAND[name];
    if (shorthand !== undefined) {
      let group = groups.get(shorthand);
      if (group === undefined) groups.set(shorthand, (group = new Map()));
      if (group.size === 0 || group.values().next().value.important === record.important) group.set(name, record);
      else out.delete(shorthand);
      out.set(name, record);
    } else if (BOX_LONGHANDS[name] !== undefined) {
      let omit = false;
      const [first] = parts(record.value);
      for (const longhand of BOX_LONGHANDS[name]) {
        if (!record.important && given.get(longhand)?.important) {
          omit = true;
          continue;
        }
        out.set(longhand, { value: first, important: record.important });
      }
      if (!omit) out.set(name, record);
    } else out.set(name, record);
  }
  for (const [shorthand, group] of groups) {
    if (group.size !== 4) continue;
    let important = false;
    const values = [];
    for (const record of group.values()) {
      values.push(record.value);
      if (record.important) important = true;
    }
    out.set(shorthand, { value: serializeBox(values), important });
  }
  return out;
}

// getPropertyValue: the declared value, listed or not; a shorthand's only
// as set (jsdom does not compose it from its longhands).
export const boxValue = (decls, name) => valueIn(decls, name) ?? '';
export const boxPriority = (decls, name) => priorityIn(decls, name);

// The margin and padding accessors of cssstyle 4.4 to 4.6: the shortest
// form of the four longhands when all are set without var(), else the
// shorthand as set.
export function boxAccessorValue(decls, name) {
  const values = [];
  for (const longhand of BOX_LONGHANDS[name]) {
    const value = valueIn(decls, longhand);
    if (!value || hasVar(value)) return boxValue(decls, name);
    values.push(value);
  }
  const [top, right, bottom, left] = values;
  if (top === right && top === bottom && right === left) return top;
  if (top !== right && top === bottom && right === left) return `${top} ${right}`;
  if (top !== right && top !== bottom && right === left) return `${top} ${right} ${bottom}`;
  return `${top} ${right} ${bottom} ${left}`;
}

// jsdom 27 and later's cssText: a shorthand leaves out the longhands
// listed before it, but for an !important one under a normal shorthand.
// The shorthands' places and priorities (coveredBy), or null when there is
// neither.
export function boxCover(decls) {
  const margin = decls.get('margin'),
    padding = decls.get('padding');
  if (margin === undefined && padding === undefined) return null;
  const cover = { margin: -1, padding: -1, marginImportant: margin?.important, paddingImportant: padding?.important };
  let i = 0;
  for (const name of decls.keys()) {
    if (name === 'margin') cover.margin = i;
    else if (name === 'padding') cover.padding = i;
    i++;
  }
  return cover;
}
// Whether the declaration at index i is a longhand left out.
export function coveredBy(cover, name, i, important) {
  const shorthand = BOX_SHORTHAND[name];
  if (shorthand === undefined) return false;
  return shorthand === 'margin'
    ? cover.margin > i && (cover.marginImportant || !important)
    : cover.padding > i && (cover.paddingImportant || !important);
}
