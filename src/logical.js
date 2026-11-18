// Logical properties and their physical ones (CSS Logical Properties 1,
// 4: logical property groups). A logical property and the physical one it
// maps to for an element's writing-mode and direction share one cascade:
// the declaration that wins over both sets both (margin-top: 7px, then
// margin-block-start: 3px, gives margin-top 3px). jsdom 31 cascades them
// so (black box, 31.0.1: margins, paddings, inset, border widths, styles
// and colors, sizes, overflow, corner radii, scroll margins and paddings,
// overflow-clip-margin, contain-intrinsic sizes, overscroll-behavior, in
// every writing mode).
//
// A flow is a number: writing mode * 2 + (direction rtl ? 1 : 0), the
// writing modes being horizontal-tb (0), vertical-rl (1), vertical-lr
// (2), sideways-rl (3) and sideways-lr (4).

const WRITING_MODES = ['horizontal-tb', 'vertical-rl', 'vertical-lr', 'sideways-rl', 'sideways-lr'];

// (text-orientation: upright makes vertical-rl and vertical-lr ltr, as
// CSS Writing Modes 4 has it and jsdom 31 maps them)
export function flowOf(writingMode, direction, orientation) {
  const mode = WRITING_MODES.indexOf(writingMode);
  const upright = (mode === 1 || mode === 2) && orientation === 'upright';
  return (mode < 0 ? 0 : mode) * 2 + (direction === 'rtl' && !upright ? 1 : 0);
}

// The physical sides of block-start, block-end, inline-start and
// inline-end in each flow.
const SIDES = [];
for (let mode = 0; mode < WRITING_MODES.length; mode++) {
  for (let rtl = 0; rtl < 2; rtl++) {
    let block, inline;
    if (mode === 0) {
      block = ['top', 'bottom'];
      inline = rtl ? ['right', 'left'] : ['left', 'right'];
    } else {
      block = mode === 1 || mode === 3 ? ['right', 'left'] : ['left', 'right'];
      inline = (mode === 4) !== (rtl === 1) ? ['bottom', 'top'] : ['top', 'bottom'];
    }
    SIDES.push([...block, ...inline]);
  }
}
const LOGICAL_SIDES = ['block-start', 'block-end', 'inline-start', 'inline-end'];
const PHYSICAL_SIDES = ['top', 'right', 'bottom', 'left'];

// [logical prefix, physical prefix, suffix] of the groups by side.
const SIDE_GROUPS = [
  ['margin-', 'margin-', ''],
  ['padding-', 'padding-', ''],
  ['inset-', '', ''],
  ['border-', 'border-', '-width'],
  ['border-', 'border-', '-style'],
  ['border-', 'border-', '-color'],
  ['scroll-margin-', 'scroll-margin-', ''],
  ['scroll-padding-', 'scroll-padding-', ''],
  ['overflow-clip-margin-', 'overflow-clip-margin-', ''],
];
// [inline, block] and [horizontal, vertical] of the groups by axis.
const AXIS_GROUPS = [
  [
    ['inline-size', 'block-size'],
    ['width', 'height'],
  ],
  [
    ['min-inline-size', 'min-block-size'],
    ['min-width', 'min-height'],
  ],
  [
    ['max-inline-size', 'max-block-size'],
    ['max-width', 'max-height'],
  ],
  [
    ['contain-intrinsic-inline-size', 'contain-intrinsic-block-size'],
    ['contain-intrinsic-width', 'contain-intrinsic-height'],
  ],
  [
    ['overflow-inline', 'overflow-block'],
    ['overflow-x', 'overflow-y'],
  ],
  [
    ['overscroll-behavior-inline', 'overscroll-behavior-block'],
    ['overscroll-behavior-x', 'overscroll-behavior-y'],
  ],
];

// name -> { kind: 'side' | 'axis' | 'corner', logical, group, index,
// partners (its partner in each flow, filled on first use) }
let table = null;
function build() {
  table = new Map();
  for (const group of SIDE_GROUPS) {
    const [lp, pp, suffix] = group;
    for (let i = 0; i < 4; i++) {
      table.set(lp + LOGICAL_SIDES[i] + suffix, { kind: 'side', logical: true, group, index: i, partners: null });
      table.set(pp + PHYSICAL_SIDES[i] + suffix, { kind: 'side', logical: false, group, index: i, partners: null });
    }
  }
  for (const group of AXIS_GROUPS)
    for (let i = 0; i < 2; i++) {
      table.set(group[0][i], { kind: 'axis', logical: true, group, index: i, partners: null });
      table.set(group[1][i], { kind: 'axis', logical: false, group, index: i, partners: null });
    }
  // border-<block side>-<inline side>-radius, border-<top|bottom>-<left|right>-radius
  for (let b = 0; b < 2; b++)
    for (let i = 0; i < 2; i++) {
      const ends = ['start', 'end'];
      table.set(`border-${ends[b]}-${ends[i]}-radius`, {
        kind: 'corner',
        logical: true,
        group: null,
        index: b * 2 + i,
        partners: null,
      });
      const vertical = ['top', 'bottom'][b],
        horizontal = ['left', 'right'][i];
      table.set(`border-${vertical}-${horizontal}-radius`, {
        kind: 'corner',
        logical: false,
        group: null,
        index: b * 2 + i,
        partners: null,
      });
    }
}

// Whether a property is in a logical property group.
export function isLogicalGroup(name) {
  if (table === null) build();
  return table.has(name);
}

// Whether a property is a logical one of a group.
export function isLogical(name) {
  if (table === null) build();
  return table.get(name)?.logical === true;
}

// The property that shares a cascade with name in flow (the physical one
// a logical property maps to, the logical one that maps to a physical
// one), or null.
export function partnerOf(name, flow) {
  if (table === null) build();
  const entry = table.get(name);
  if (entry === undefined) return null;
  const partners = (entry.partners ??= new Array(SIDES.length).fill(null));
  return (partners[flow] ??= partner(entry, flow));
}

function partner(entry, flow) {
  const sides = SIDES[flow];
  const vertical = flow >= 2;
  if (entry.kind === 'side') {
    const [lp, pp, suffix] = entry.group;
    if (entry.logical) return pp + sides[entry.index] + suffix;
    return lp + LOGICAL_SIDES[sides.indexOf(PHYSICAL_SIDES[entry.index])] + suffix;
  }
  if (entry.kind === 'axis') {
    const other = entry.logical ? entry.group[1] : entry.group[0];
    return other[vertical ? 1 - entry.index : entry.index];
  }
  // A corner: two sides, one of each axis.
  if (entry.logical) {
    const a = sides[entry.index >> 1],
      b = sides[2 + (entry.index & 1)];
    const top = a === 'top' || a === 'bottom' ? a : b;
    return `border-${top}-${top === a ? b : a}-radius`;
  }
  const v = entry.index >> 1 ? 'bottom' : 'top',
    h = entry.index & 1 ? 'right' : 'left';
  const block = sides[0] === v || sides[0] === h ? 'start' : 'end';
  const inline = sides[2] === v || sides[2] === h ? 'start' : 'end';
  return `border-${block}-${inline}-radius`;
}
