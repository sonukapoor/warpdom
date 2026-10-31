// CSS colors (CSS Color 4): parsing named, hex, rgb(), hsl() and hwb()
// colors and serializing them as resolved values are serialized: rgb(r, g,
// b), or rgba(r, g, b, a) when not opaque. Other color syntaxes (lab(),
// color()) are kept as written.
//
// Channels as jsdom computes them (black box, jsdom 26 with cssstyle 4.2
// to 4.6, 27 to 30): rounded to 4 significant digits, then to an integer
// (hsl(102, 53%, 61%) has a red of 134.4666, 134.5, 135; rgb(113.45, 0,
// 0) is rgb(114, 0, 0)); an alpha given as a number to 3 decimals (0.1234
// is 0.123), one from a hex color to the fewest decimals that keep its 8-bit
// value (#ff000080 is 0.5). legacy (cssstyle before 4.2, black box 2.3.0 to
// 4.1.0): the older parser: function names in lowercase, the comma syntax
// only, integer or percentage (rounded down) channels of one kind, an alpha
// as written (0.123456; a percentage is read as its number, so 50% is
// opaque), a hex alpha to 3 decimals (#ff000080 is 0.502, #ff0000ff
// rgba(255, 0, 0, 1)), channels rounded once, and no hwb().

// The named colors (CSS Color 4, 6.1), as 0xRRGGBB.
const NAMED = {
  aliceblue: 0xf0f8ff,
  antiquewhite: 0xfaebd7,
  aqua: 0x00ffff,
  aquamarine: 0x7fffd4,
  azure: 0xf0ffff,
  beige: 0xf5f5dc,
  bisque: 0xffe4c4,
  black: 0x000000,
  blanchedalmond: 0xffebcd,
  blue: 0x0000ff,
  blueviolet: 0x8a2be2,
  brown: 0xa52a2a,
  burlywood: 0xdeb887,
  cadetblue: 0x5f9ea0,
  chartreuse: 0x7fff00,
  chocolate: 0xd2691e,
  coral: 0xff7f50,
  cornflowerblue: 0x6495ed,
  cornsilk: 0xfff8dc,
  crimson: 0xdc143c,
  cyan: 0x00ffff,
  darkblue: 0x00008b,
  darkcyan: 0x008b8b,
  darkgoldenrod: 0xb8860b,
  darkgray: 0xa9a9a9,
  darkgreen: 0x006400,
  darkgrey: 0xa9a9a9,
  darkkhaki: 0xbdb76b,
  darkmagenta: 0x8b008b,
  darkolivegreen: 0x556b2f,
  darkorange: 0xff8c00,
  darkorchid: 0x9932cc,
  darkred: 0x8b0000,
  darksalmon: 0xe9967a,
  darkseagreen: 0x8fbc8f,
  darkslateblue: 0x483d8b,
  darkslategray: 0x2f4f4f,
  darkslategrey: 0x2f4f4f,
  darkturquoise: 0x00ced1,
  darkviolet: 0x9400d3,
  deeppink: 0xff1493,
  deepskyblue: 0x00bfff,
  dimgray: 0x696969,
  dimgrey: 0x696969,
  dodgerblue: 0x1e90ff,
  firebrick: 0xb22222,
  floralwhite: 0xfffaf0,
  forestgreen: 0x228b22,
  fuchsia: 0xff00ff,
  gainsboro: 0xdcdcdc,
  ghostwhite: 0xf8f8ff,
  gold: 0xffd700,
  goldenrod: 0xdaa520,
  gray: 0x808080,
  green: 0x008000,
  greenyellow: 0xadff2f,
  grey: 0x808080,
  honeydew: 0xf0fff0,
  hotpink: 0xff69b4,
  indianred: 0xcd5c5c,
  indigo: 0x4b0082,
  ivory: 0xfffff0,
  khaki: 0xf0e68c,
  lavender: 0xe6e6fa,
  lavenderblush: 0xfff0f5,
  lawngreen: 0x7cfc00,
  lemonchiffon: 0xfffacd,
  lightblue: 0xadd8e6,
  lightcoral: 0xf08080,
  lightcyan: 0xe0ffff,
  lightgoldenrodyellow: 0xfafad2,
  lightgray: 0xd3d3d3,
  lightgreen: 0x90ee90,
  lightgrey: 0xd3d3d3,
  lightpink: 0xffb6c1,
  lightsalmon: 0xffa07a,
  lightseagreen: 0x20b2aa,
  lightskyblue: 0x87cefa,
  lightslategray: 0x778899,
  lightslategrey: 0x778899,
  lightsteelblue: 0xb0c4de,
  lightyellow: 0xffffe0,
  lime: 0x00ff00,
  limegreen: 0x32cd32,
  linen: 0xfaf0e6,
  magenta: 0xff00ff,
  maroon: 0x800000,
  mediumaquamarine: 0x66cdaa,
  mediumblue: 0x0000cd,
  mediumorchid: 0xba55d3,
  mediumpurple: 0x9370db,
  mediumseagreen: 0x3cb371,
  mediumslateblue: 0x7b68ee,
  mediumspringgreen: 0x00fa9a,
  mediumturquoise: 0x48d1cc,
  mediumvioletred: 0xc71585,
  midnightblue: 0x191970,
  mintcream: 0xf5fffa,
  mistyrose: 0xffe4e1,
  moccasin: 0xffe4b5,
  navajowhite: 0xffdead,
  navy: 0x000080,
  oldlace: 0xfdf5e6,
  olive: 0x808000,
  olivedrab: 0x6b8e23,
  orange: 0xffa500,
  orangered: 0xff4500,
  orchid: 0xda70d6,
  palegoldenrod: 0xeee8aa,
  palegreen: 0x98fb98,
  paleturquoise: 0xafeeee,
  palevioletred: 0xdb7093,
  papayawhip: 0xffefd5,
  peachpuff: 0xffdab9,
  peru: 0xcd853f,
  pink: 0xffc0cb,
  plum: 0xdda0dd,
  powderblue: 0xb0e0e6,
  purple: 0x800080,
  rebeccapurple: 0x663399,
  red: 0xff0000,
  rosybrown: 0xbc8f8f,
  royalblue: 0x4169e1,
  saddlebrown: 0x8b4513,
  salmon: 0xfa8072,
  sandybrown: 0xf4a460,
  seagreen: 0x2e8b57,
  seashell: 0xfff5ee,
  sienna: 0xa0522d,
  silver: 0xc0c0c0,
  skyblue: 0x87ceeb,
  slateblue: 0x6a5acd,
  slategray: 0x708090,
  slategrey: 0x708090,
  snow: 0xfffafa,
  springgreen: 0x00ff7f,
  steelblue: 0x4682b4,
  tan: 0xd2b48c,
  teal: 0x008080,
  thistle: 0xd8bfd8,
  tomato: 0xff6347,
  turquoise: 0x40e0d0,
  violet: 0xee82ee,
  wheat: 0xf5deb3,
  white: 0xffffff,
  whitesmoke: 0xf5f5f5,
  yellow: 0xffff00,
  yellowgreen: 0x9acd32,
};

// The system colors (CSS Color 4, 6.2, and the deprecated ones of 6.2.1)
// as jsdom 27 and later compute them (black box, 27.0.0 to 30.1.3).
const SYSTEM = {
  accentcolor: 0x0099ff,
  accentcolortext: 0x000000,
  activetext: 0xff0000,
  buttonborder: 0x333333,
  buttonface: 0xcccccc,
  buttontext: 0x000000,
  canvas: 0xffffff,
  canvastext: 0x000000,
  field: 0xffffff,
  fieldtext: 0x000000,
  graytext: 0x666666,
  highlight: 0x0099ff,
  highlighttext: 0xffffff,
  linktext: 0x0000ff,
  mark: 0xffff00,
  marktext: 0x000000,
  selecteditem: 0x0099ff,
  selecteditemtext: 0xffffff,
  visitedtext: 0x800080,
  activeborder: 0x333333,
  activecaption: 0xffffff,
  appworkspace: 0xffffff,
  background: 0xffffff,
  buttonhighlight: 0xcccccc,
  buttonshadow: 0xcccccc,
  captiontext: 0x000000,
  inactiveborder: 0x333333,
  inactivecaption: 0xffffff,
  inactivecaptiontext: 0x666666,
  infobackground: 0xffffff,
  infotext: 0x000000,
  menu: 0xffffff,
  menutext: 0x000000,
  scrollbar: 0xffffff,
  threeddarkshadow: 0x333333,
  threedface: 0xcccccc,
  threedhighlight: 0x333333,
  threedlightshadow: 0x333333,
  threedshadow: 0x333333,
  window: 0xffffff,
  windowframe: 0x333333,
  windowtext: 0x000000,
};
// The same under a computed color-scheme of 'dark' (black box, 27.4.0 to
// 30.1.3; ButtonText's rgb(255, 255, 155) as jsdom gives it).
const DARK_SYSTEM = {
  accentcolor: 0x0033ff,
  accentcolortext: 0xffffff,
  activetext: 0xff6666,
  buttonborder: 0xcccccc,
  buttonface: 0x333333,
  buttontext: 0xffff9b,
  canvas: 0x000000,
  canvastext: 0xffffff,
  field: 0x000000,
  fieldtext: 0xffffff,
  graytext: 0x999999,
  highlight: 0x0033ff,
  highlighttext: 0x000000,
  linktext: 0x00ccff,
  mark: 0xcc0099,
  marktext: 0xffffff,
  selecteditem: 0x0033ff,
  selecteditemtext: 0x000000,
  visitedtext: 0xff33ff,
  activeborder: 0xcccccc,
  activecaption: 0x000000,
  appworkspace: 0x000000,
  background: 0x000000,
  buttonhighlight: 0x333333,
  buttonshadow: 0x333333,
  captiontext: 0xffffff,
  inactiveborder: 0xcccccc,
  inactivecaption: 0x000000,
  inactivecaptiontext: 0x999999,
  infobackground: 0x000000,
  infotext: 0xffffff,
  menu: 0x000000,
  menutext: 0xffffff,
  scrollbar: 0x000000,
  threeddarkshadow: 0xcccccc,
  threedface: 0x333333,
  threedhighlight: 0xcccccc,
  threedlightshadow: 0xcccccc,
  threedshadow: 0xcccccc,
  window: 0x000000,
  windowframe: 0xcccccc,
  windowtext: 0xffffff,
};
// CSS 2's system colors, the only ones cssstyle before 4.4 knows (black
// box, 2.3.0 to 4.3.1): with ButtonText, GrayText, Highlight and
// HighlightText the deprecated ones.
const CSS2_SYSTEM = new Set([
  'activeborder',
  'activecaption',
  'appworkspace',
  'background',
  'buttonface',
  'buttonhighlight',
  'buttonshadow',
  'buttontext',
  'captiontext',
  'graytext',
  'highlight',
  'highlighttext',
  'inactiveborder',
  'inactivecaption',
  'inactivecaptiontext',
  'infobackground',
  'infotext',
  'menu',
  'menutext',
  'scrollbar',
  'threeddarkshadow',
  'threedface',
  'threedhighlight',
  'threedlightshadow',
  'threedshadow',
  'window',
  'windowframe',
  'windowtext',
]);
// A lowercased keyword's kind: 2 a CSS 2 system color, 1 another system
// color, 0 not a system color.
export const systemColorKind = (lower) => (SYSTEM[lower] === undefined ? 0 : CSS2_SYSTEM.has(lower) ? 2 : 1);

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// The alpha with the fewest decimals that maps to the same 8-bit value.
function serializeAlpha(a) {
  const byte = Math.round(clamp(a, 0, 1) * 255);
  const short = Math.round((byte / 255) * 100) / 100;
  return String(Math.round(short * 255) === byte ? short : Math.round((byte / 255) * 1000) / 1000);
}

const serialize = (r, g, b, a = 1) =>
  a >= 1 ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${serializeAlpha(a)})`;

// An alpha given as a number (rgba(), hsla(), / a): to 3 decimals; legacy
// as written.
function serializeNumeric(r, g, b, a, legacy) {
  const alpha = legacy ? a : Math.round(a * 1000) / 1000;
  return alpha >= 1 ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

const fromHex = (n, a = 1) => serialize((n >> 16) & 255, (n >> 8) & 255, n & 255, a);

function hex(text, legacy) {
  const h = text.slice(1);
  if (!/^[0-9a-f]+$/i.test(h)) return null;
  const d = (s) => parseInt(s, 16);
  let r,
    g,
    b,
    a = -1;
  switch (h.length) {
    case 3:
    case 4:
      [r, g, b, a = -1] = [...h].map((c) => d(c + c));
      break;
    case 6:
    case 8:
      r = d(h.slice(0, 2));
      g = d(h.slice(2, 4));
      b = d(h.slice(4, 6));
      if (h.length === 8) a = d(h.slice(6, 8));
      break;
    default:
      return null;
  }
  if (a < 0) return serialize(r, g, b);
  // 'floor': jsdom 22.1 to 26's computed value of one cssstyle kept as
  // written (a border side's).
  if (legacy === 'floor')
    return a === 255 ? serialize(r, g, b) : `rgba(${r}, ${g}, ${b}, ${Math.floor((a / 255) * 1000) / 1000})`;
  return legacy ? `rgba(${r}, ${g}, ${b}, ${Math.round((a / 255) * 1000) / 1000})` : serialize(r, g, b, a / 255);
}

// Arguments of a color function, in the legacy (commas) or modern
// (spaces, `/ alpha`) syntax: [values, alpha] as strings.
function colorArgs(inner) {
  let parts;
  let alpha = null;
  if (inner.includes(',')) {
    parts = inner.split(',').map((s) => s.trim());
    if (parts.length === 4) alpha = parts.pop();
  } else {
    const [main, a] = inner.split('/');
    parts = main.trim().split(/\s+/);
    if (a !== undefined) alpha = a.trim();
  }
  return parts.length === 3 && parts.every(Boolean) ? [parts, alpha] : null;
}

const number = (s) => (/^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(s) ? Number(s) : NaN);

function alphaValue(s, legacy) {
  if (s === null) return 1;
  if (legacy) return clamp(parseFloat(s), 0, 1);
  if (s.endsWith('%')) return clamp(number(s.slice(0, -1)) / 100, 0, 1);
  return clamp(number(s), 0, 1);
}

const fourDigits = (v) => Math.round(Number(v.toPrecision(4)));

const LEGACY_INTEGER = /^[+-]?\d+$/;
const LEGACY_PERCENT = /^[+-]?(\d+\.?\d*|\.\d+)%$/;
function rgbFunction(inner, round, legacy) {
  const args = colorArgs(inner);
  if (!args) return null;
  // The comma syntax takes numbers or percentages, not both (CSS Color 4,
  // 5.1); the older parser integers only.
  if (inner.includes(',') && args[0].some((s) => s.endsWith('%')) && !args[0].every((s) => s.endsWith('%')))
    return null;
  if (legacy && !args[0].every((s) => LEGACY_INTEGER.test(s)) && !args[0].every((s) => LEGACY_PERCENT.test(s)))
    return null;
  const channel = legacy
    ? (s) => clamp(s.endsWith('%') ? Math.floor((number(s.slice(0, -1)) * 255) / 100) : number(s), 0, 255)
    : (s) => round(clamp(s.endsWith('%') ? (number(s.slice(0, -1)) * 255) / 100 : number(s), 0, 255));
  const [r, g, b] = args[0].map(channel);
  const a = alphaValue(args[1], legacy);
  return [r, g, b, a].some(Number.isNaN) ? null : serializeNumeric(r, g, b, a, legacy);
}

// CSS Color 4, 7.1: hslToRgb, channels from 0 to 1.
function hslToRgb(h, s, l) {
  const f = (n) => {
    const k = (n + h / 30) % 12;
    return l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return [f(0), f(8), f(4)];
}

// cssstyle 2 and 3 read the hue in turns, once wrapped into [0, 1] per
// channel (turns: true).
function hueToChannel(p, q, t) {
  if (t < 0) t += 1;
  if (t > 1) t -= 1;
  if (t < 1 / 6) return p + (q - p) * 6 * t;
  if (t < 1 / 2) return q;
  if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
  return p;
}

// A hue in degrees, wrapped into [0, 360): a number or deg, from cssstyle
// 4.2 also grad, rad and turn (hsl(0.5turn 100% 50%) is rgb(0, 255, 255));
// the older parser deg only.
const HUE_UNITS = { deg: 1, grad: 0.9, rad: 180 / Math.PI, turn: 360 };
const HUE = /^([\s\S]*?)(deg|grad|rad|turn)?$/i;
function hueDegrees(s, legacy) {
  const [, n, unit] = HUE.exec(s);
  if (unit !== undefined && legacy && unit.toLowerCase() !== 'deg') return NaN;
  const deg = number(n) * (unit === undefined ? 1 : HUE_UNITS[unit.toLowerCase()]);
  return ((deg % 360) + 360) % 360;
}

function hslFunction(inner, round, legacy, turns = false) {
  const args = colorArgs(inner);
  if (!args) return null;
  const [hs, ss, ls] = args[0];
  if (turns) {
    const h = number(hs),
      s = clamp(number(ss.replace(/%$/, '')) / 100, 0, 1),
      l = clamp(number(ls.replace(/%$/, '')) / 100, 0, 1);
    const a = alphaValue(args[1], legacy);
    if ([h, s, l, a].some(Number.isNaN)) return null;
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s,
      p = 2 * l - q;
    return serializeNumeric(
      round(hueToChannel(p, q, h + 1 / 3) * 255),
      round(hueToChannel(p, q, h) * 255),
      round(hueToChannel(p, q, h - 1 / 3) * 255),
      a,
      legacy,
    );
  }
  const h = hueDegrees(hs, legacy);
  const s = clamp(number(ss.replace(/%$/, '')) / 100, 0, 1);
  const l = clamp(number(ls.replace(/%$/, '')) / 100, 0, 1);
  const a = alphaValue(args[1], legacy);
  if ([h, s, l, a].some(Number.isNaN)) return null;
  const [r, g, b] = hslToRgb(h, s, l);
  return serializeNumeric(round(r * 255), round(g * 255), round(b * 255), a, legacy);
}

// hwb(), modern syntax only (CSS Color 4, 8.1: hwbToRgb).
function hwbFunction(inner, round) {
  if (inner.includes(',')) return null;
  const args = colorArgs(inner);
  if (!args) return null;
  const [hs, ws, bs] = args[0];
  if (!ws.endsWith('%') || !bs.endsWith('%')) return null;
  const h = hueDegrees(hs, false);
  let w = clamp(number(ws.slice(0, -1)) / 100, 0, 1);
  let bl = clamp(number(bs.slice(0, -1)) / 100, 0, 1);
  const a = alphaValue(args[1], false);
  if ([h, w, bl, a].some(Number.isNaN)) return null;
  if (w + bl >= 1) {
    w /= w + bl;
    bl = 1 - w;
  }
  const rgb = hslToRgb(h, 1, 0.5).map((c) => (c * (1 - w - bl) + w) * 255);
  return serializeNumeric(round(rgb[0]), round(rgb[1]), round(rgb[2]), a, false);
}

// The resolved form of one color token, or null when it is not a color
// this module resolves. currentcolor is left to the caller.
// legacy: false (the current parser), true (the older parser, cssstyle
// before 4.2), 'cssstyle3' (the older parser with cssstyle 2 and 3's hsl(),
// whose hue is read in turns: hsl(120, 50%, 50%) is rgb(64, 64, 64)),
// 'floor' (jsdom 22.1 to 26's
// computed value of a hex color cssstyle kept as written: its alpha
// rounded down to 3 decimals).
export function resolveColor(token, legacy = false) {
  const lower = token.toLowerCase();
  if (lower[0] === '#') return hex(lower, legacy);
  if (lower === 'transparent') return 'rgba(0, 0, 0, 0)';
  const named = NAMED[lower] ?? SYSTEM[lower];
  if (named !== undefined) return fromHex(named);
  const old = legacy === true || legacy === 'cssstyle3';
  // The older parser: lowercase names, comma syntax, no space inside the
  // parentheses' ends.
  const m = old ? /^(rgba?|hsla?)\((\S(?:.*\S)?)\)$/s.exec(token) : /^(rgba?|hsla?|hwb)\((.*)\)$/s.exec(lower);
  if (!m) return null;
  if (old && (!m[2].includes(',') || /\s,/.test(m[2]))) return null;
  const round = old ? Math.round : fourDigits;
  if (m[1] === 'hwb') return hwbFunction(m[2].trim(), round);
  if (m[1].startsWith('rgb')) return rgbFunction(m[2].trim(), round, old);
  return hslFunction(m[2].trim(), round, old, legacy === 'cssstyle3');
}

export const NAMED_COLORS = Object.keys(NAMED);

// A lowercased system color's computed value under a color-scheme of
// 'dark' (rgb()), by name; no entry for any other color.
export const DARK_SYSTEM_COLORS = Object.assign(
  Object.create(null),
  Object.fromEntries(Object.entries(DARK_SYSTEM).map(([name, n]) => [name, fromHex(n)])),
);

// --- color-mix() (jsdom 29.0.2 and later) -----------------------------------------

// Splits a function's arguments at top-level commas.
function topLevelArgs(inner) {
  const out = [];
  let depth = 0,
    start = 0;
  for (let i = 0; i < inner.length; i++) {
    const c = inner[i];
    if (c === '(') depth++;
    else if (c === ')') depth--;
    else if (c === ',' && depth === 0) {
      out.push(inner.slice(start, i).trim());
      start = i + 1;
    }
  }
  out.push(inner.slice(start).trim());
  return out;
}

const RGB_SERIALIZED = /^rgba?\(([^,]+), ([^,]+), ([^,)]+)(?:, ([^)]+))?\)$/;
// color(srgb r g b / alpha) as jsdom reads it inside color-mix() (black
// box, 29.1.1, 30.1.2, 30.1.3): numbers or percentages (100% is 1), the
// slash with or without spaces, channels kept outside 0 to 1, the alpha
// clamped to 0 to 1. none and calc() are not modeled (left as declared).
// A number's digit groups cannot overlap (\d+(?:\.\d*)? or \.\d+), so a
// long malformed one is rejected in linear time.
const NUMBER = '[+-]?(?:\\d+(?:\\.\\d*)?|\\.\\d+)(?:e[+-]?\\d+)?';
const SRGB_COMPONENT = `(${NUMBER}%?)`;
const COLOR_FUNCTION = new RegExp(
  `^color\\(\\s*srgb\\s+${SRGB_COMPONENT}\\s+${SRGB_COMPONENT}\\s+${SRGB_COMPONENT}(?:\\s*\\/\\s*${SRGB_COMPONENT})?\\s*\\)$`,
  'i',
);
const srgbComponent = (text) => (text.endsWith('%') ? Number(text.slice(0, -1)) / 100 : Number(text));

// A computed color as [r, g, b, alpha] in sRGB (channels 0 to 1 but
// color()'s, which may fall outside), or null. depth: the number of
// color-mix() it is nested in.
function colorChannels(text, current, rawAlpha, depth) {
  const lower = text.toLowerCase();
  let resolved;
  if (lower === 'currentcolor') resolved = current();
  else if (lower.startsWith('color-mix(')) resolved = mixColor(text, current, rawAlpha, depth);
  else resolved = lower.startsWith('color(') ? text : resolveColor(text);
  if (resolved == null || resolved === false) return null;
  let channels;
  const rgb = RGB_SERIALIZED.exec(resolved);
  if (rgb !== null) {
    channels = [rgb[1], rgb[2], rgb[3]].map((c) => Number(c) / 255);
    channels.push(rgb[4] === undefined ? 1 : Number(rgb[4]));
  } else {
    const fn = COLOR_FUNCTION.exec(resolved);
    if (fn === null) return null;
    channels = [fn[1], fn[2], fn[3], fn[4] ?? '1'].map(srgbComponent);
    channels[3] = Math.min(1, Math.max(0, channels[3]));
  }
  // Not finite (NaN, or an overflowing 1e999): left as declared.
  return channels.every(Number.isFinite) ? channels : null;
}

// A color-mix() argument: a color and an optional percentage, in either
// order. Split at the last (or first) whitespace rather than by a regular
// expression around the color, which backtracks quadratically on a long
// run of whitespace.
const PERCENTAGE = new RegExp(`^(${NUMBER})%$`, 'i');
const isSpace = (c) => c === ' ' || c === '\t' || c === '\n' || c === '\r' || c === '\f';
function mixArgument(text) {
  let i = text.length - 1;
  while (i >= 0 && !isSpace(text[i])) i--;
  if (i > 0) {
    const m = PERCENTAGE.exec(text.slice(i + 1));
    if (m !== null) return [text.slice(0, i).trimEnd(), Number(m[1])];
  }
  i = 0;
  while (i < text.length && !isSpace(text[i])) i++;
  if (i < text.length) {
    const n = PERCENTAGE.exec(text.slice(0, i));
    if (n !== null) return [text.slice(i).trimStart(), Number(n[1])];
  }
  return [text, null];
}

const sixDigits = (v) => String(Number(v.toPrecision(6)));

// The computed value of color-mix(in srgb, ...) as jsdom gives it (black
// box, 29.1.1, 30.1.2, 30.1.3): color(srgb r g b),
// channels to 6 significant digits, mixed premultiplied by alpha, with
// / alpha when not opaque. The weights are the percentages over their sum
// (a missing one 100% less the other, both missing 50%); when they add up
// to less than 100% the alpha is multiplied by their sum. jsdom 29 rounds
// the mixed alpha to 3 decimals (toFixed: 0.6665 is 0.666) before that
// multiplier, jsdom 30 does not (color-mix(in srgb, blue 33.3333%, red)
// has the alpha 0.9999999999999999 there). null for other color spaces
// (srgb-linear, oklab, hsl, ...: jsdom's conversions are not modeled),
// left as declared, and anything not understood; false for a mix jsdom
// cannot compute either (not two colors, a percentage out of 0 to 100,
// both 0%), which it computes to transparent where it keeps the
// declaration (text-shadow: color-mix(in srgb, blue 0%, red 0%) 1px 1px).
// current: the currentcolor's computed value. A mix nested in 39 others
// is left as declared (null), so a deeply nested value cannot overflow
// the stack; jsdom 30 rejects a declaration nested 40 deep (black box,
// 30.1.2, 30.1.3).
const MIX_DEPTH = 39;
export function mixColor(token, current, rawAlpha, depth = 0) {
  const open = token.indexOf('(');
  if (!token.endsWith(')') || depth >= MIX_DEPTH) return null;
  const args = topLevelArgs(token.slice(open + 1, -1));
  if (args.length !== 3) return false;
  if (!/^in\s+srgb$/i.test(args[0])) return null;
  const [text1, given1] = mixArgument(args[1]);
  const [text2, given2] = mixArgument(args[2]);
  let p1 = given1,
    p2 = given2;
  if (p1 === null && p2 === null) p1 = p2 = 50;
  else if (p1 === null) p1 = 100 - p2;
  else if (p2 === null) p2 = 100 - p1;
  if (p1 < 0 || p2 < 0 || p1 > 100 || p2 > 100) return false;
  const sum = p1 + p2;
  if (sum === 0) return false;
  const c1 = colorChannels(text1, current, rawAlpha, depth + 1);
  const c2 = colorChannels(text2, current, rawAlpha, depth + 1);
  if (c1 === null || c2 === null) return null;
  const w1 = p1 / sum,
    w2 = p2 / sum;
  const alpha = c1[3] * w1 + c2[3] * w2;
  const channels = [0, 1, 2].map((i) =>
    alpha === 0 ? c1[i] * w1 + c2[i] * w2 : (c1[i] * c1[3] * w1 + c2[i] * c2[3] * w2) / alpha,
  );
  let a = rawAlpha ? alpha : Number(alpha.toFixed(3));
  if (sum < 100) a *= p1 / 100 + p2 / 100;
  const body = `srgb ${channels.map(sixDigits).join(' ')}`;
  return a === 1 ? `color(${body})` : `color(${body} / ${a})`;
}
