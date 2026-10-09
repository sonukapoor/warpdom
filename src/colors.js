// CSS colors (CSS Color 4): parsing named, hex, rgb() and hsl() colors and
// serializing them as resolved values are serialized: rgb(r, g, b), or
// rgba(r, g, b, a) when not opaque. Other color syntaxes (lab(), color())
// are kept as written.

// The named colors (CSS Color 4, 6.1), as 0xRRGGBB.
const NAMED = {
  aliceblue: 0xf0f8ff, antiquewhite: 0xfaebd7, aqua: 0x00ffff, aquamarine: 0x7fffd4, azure: 0xf0ffff,
  beige: 0xf5f5dc, bisque: 0xffe4c4, black: 0x000000, blanchedalmond: 0xffebcd, blue: 0x0000ff,
  blueviolet: 0x8a2be2, brown: 0xa52a2a, burlywood: 0xdeb887, cadetblue: 0x5f9ea0, chartreuse: 0x7fff00,
  chocolate: 0xd2691e, coral: 0xff7f50, cornflowerblue: 0x6495ed, cornsilk: 0xfff8dc, crimson: 0xdc143c,
  cyan: 0x00ffff, darkblue: 0x00008b, darkcyan: 0x008b8b, darkgoldenrod: 0xb8860b, darkgray: 0xa9a9a9,
  darkgreen: 0x006400, darkgrey: 0xa9a9a9, darkkhaki: 0xbdb76b, darkmagenta: 0x8b008b, darkolivegreen: 0x556b2f,
  darkorange: 0xff8c00, darkorchid: 0x9932cc, darkred: 0x8b0000, darksalmon: 0xe9967a, darkseagreen: 0x8fbc8f,
  darkslateblue: 0x483d8b, darkslategray: 0x2f4f4f, darkslategrey: 0x2f4f4f, darkturquoise: 0x00ced1,
  darkviolet: 0x9400d3, deeppink: 0xff1493, deepskyblue: 0x00bfff, dimgray: 0x696969, dimgrey: 0x696969,
  dodgerblue: 0x1e90ff, firebrick: 0xb22222, floralwhite: 0xfffaf0, forestgreen: 0x228b22, fuchsia: 0xff00ff,
  gainsboro: 0xdcdcdc, ghostwhite: 0xf8f8ff, gold: 0xffd700, goldenrod: 0xdaa520, gray: 0x808080,
  green: 0x008000, greenyellow: 0xadff2f, grey: 0x808080, honeydew: 0xf0fff0, hotpink: 0xff69b4,
  indianred: 0xcd5c5c, indigo: 0x4b0082, ivory: 0xfffff0, khaki: 0xf0e68c, lavender: 0xe6e6fa,
  lavenderblush: 0xfff0f5, lawngreen: 0x7cfc00, lemonchiffon: 0xfffacd, lightblue: 0xadd8e6, lightcoral: 0xf08080,
  lightcyan: 0xe0ffff, lightgoldenrodyellow: 0xfafad2, lightgray: 0xd3d3d3, lightgreen: 0x90ee90, lightgrey: 0xd3d3d3,
  lightpink: 0xffb6c1, lightsalmon: 0xffa07a, lightseagreen: 0x20b2aa, lightskyblue: 0x87cefa,
  lightslategray: 0x778899, lightslategrey: 0x778899, lightsteelblue: 0xb0c4de, lightyellow: 0xffffe0,
  lime: 0x00ff00, limegreen: 0x32cd32, linen: 0xfaf0e6, magenta: 0xff00ff, maroon: 0x800000,
  mediumaquamarine: 0x66cdaa, mediumblue: 0x0000cd, mediumorchid: 0xba55d3, mediumpurple: 0x9370db,
  mediumseagreen: 0x3cb371, mediumslateblue: 0x7b68ee, mediumspringgreen: 0x00fa9a, mediumturquoise: 0x48d1cc,
  mediumvioletred: 0xc71585, midnightblue: 0x191970, mintcream: 0xf5fffa, mistyrose: 0xffe4e1, moccasin: 0xffe4b5,
  navajowhite: 0xffdead, navy: 0x000080, oldlace: 0xfdf5e6, olive: 0x808000, olivedrab: 0x6b8e23,
  orange: 0xffa500, orangered: 0xff4500, orchid: 0xda70d6, palegoldenrod: 0xeee8aa, palegreen: 0x98fb98,
  paleturquoise: 0xafeeee, palevioletred: 0xdb7093, papayawhip: 0xffefd5, peachpuff: 0xffdab9, peru: 0xcd853f,
  pink: 0xffc0cb, plum: 0xdda0dd, powderblue: 0xb0e0e6, purple: 0x800080, rebeccapurple: 0x663399,
  red: 0xff0000, rosybrown: 0xbc8f8f, royalblue: 0x4169e1, saddlebrown: 0x8b4513, salmon: 0xfa8072,
  sandybrown: 0xf4a460, seagreen: 0x2e8b57, seashell: 0xfff5ee, sienna: 0xa0522d, silver: 0xc0c0c0,
  skyblue: 0x87ceeb, slateblue: 0x6a5acd, slategray: 0x708090, slategrey: 0x708090, snow: 0xfffafa,
  springgreen: 0x00ff7f, steelblue: 0x4682b4, tan: 0xd2b48c, teal: 0x008080, thistle: 0xd8bfd8,
  tomato: 0xff6347, turquoise: 0x40e0d0, violet: 0xee82ee, wheat: 0xf5deb3, white: 0xffffff,
  whitesmoke: 0xf5f5f5, yellow: 0xffff00, yellowgreen: 0x9acd32,
};

// System colors in a light color scheme.
const SYSTEM = { canvas: 0xffffff, canvastext: 0x000000, linktext: 0x0000ee, graytext: 0x808080, buttonface: 0xefefef,
  buttontext: 0x000000, field: 0xffffff, fieldtext: 0x000000, highlight: 0x3399ff, highlighttext: 0xffffff };

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// The alpha with the fewest decimals that maps to the same 8-bit value.
function serializeAlpha(a) {
  const byte = Math.round(clamp(a, 0, 1) * 255);
  const short = Math.round((byte / 255) * 100) / 100;
  return String(Math.round(short * 255) === byte ? short : Math.round((byte / 255) * 1000) / 1000);
}

const serialize = (r, g, b, a = 1) => (a >= 1
  ? `rgb(${r}, ${g}, ${b})`
  : `rgba(${r}, ${g}, ${b}, ${serializeAlpha(a)})`);

const fromHex = (n, a = 1) => serialize((n >> 16) & 255, (n >> 8) & 255, n & 255, a);

function hex(text) {
  const h = text.slice(1);
  if (!/^[0-9a-f]+$/i.test(h)) return null;
  const d = (s) => parseInt(s, 16);
  switch (h.length) {
    case 3: case 4: {
      const [r, g, b, a] = [...h].map((c) => d(c + c));
      return serialize(r, g, b, h.length === 4 ? a / 255 : 1);
    }
    case 6: case 8:
      return serialize(d(h.slice(0, 2)), d(h.slice(2, 4)), d(h.slice(4, 6)), h.length === 8 ? d(h.slice(6, 8)) / 255 : 1);
    default: return null;
  }
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

function alphaValue(s) {
  if (s === null) return 1;
  if (s.endsWith('%')) return clamp(number(s.slice(0, -1)) / 100, 0, 1);
  return clamp(number(s), 0, 1);
}

function rgbFunction(inner) {
  const args = colorArgs(inner);
  if (!args) return null;
  const channel = (s) => Math.round(clamp(s.endsWith('%') ? (number(s.slice(0, -1)) * 255) / 100 : number(s), 0, 255));
  const [r, g, b] = args[0].map(channel);
  const a = alphaValue(args[1]);
  return [r, g, b, a].some(Number.isNaN) ? null : serialize(r, g, b, a);
}

function hslFunction(inner) {
  const args = colorArgs(inner);
  if (!args) return null;
  const [hs, ss, ls] = args[0];
  const h = ((number(hs.replace(/deg$/i, '')) % 360) + 360) % 360;
  const s = clamp(number(ss.replace(/%$/, '')) / 100, 0, 1);
  const l = clamp(number(ls.replace(/%$/, '')) / 100, 0, 1);
  const a = alphaValue(args[1]);
  if ([h, s, l, a].some(Number.isNaN)) return null;
  // CSS Color 4, 7.1: hslToRgb.
  const f = (n) => {
    const k = (n + h / 30) % 12;
    return l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return serialize(Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255), a);
}

// The resolved form of one color token, or null when it is not a color
// this module resolves. currentcolor is left to the caller.
export function resolveColor(token) {
  const lower = token.toLowerCase();
  if (lower[0] === '#') return hex(lower);
  if (lower === 'transparent') return 'rgba(0, 0, 0, 0)';
  const named = NAMED[lower] ?? SYSTEM[lower];
  if (named !== undefined) return fromHex(named);
  const m = /^(rgba?|hsla?)\((.*)\)$/s.exec(lower);
  if (!m) return null;
  return m[1].startsWith('rgb') ? rgbFunction(m[2].trim()) : hslFunction(m[2].trim());
}

export const NAMED_COLORS = Object.keys(NAMED);
