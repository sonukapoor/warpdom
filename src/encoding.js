// TextEncoder and TextDecoder (Encoding standard, 8), as the window's own
// interfaces: per-window prototypes, results in the window's realm,
// jsdom's error messages. Encoding to UTF-8 and decoding UTF-8 are the
// platform's (TextEncoder and TextDecoder are web standard globals in
// browsers, Node, Deno and edge runtimes), as in jsdom (its UTF-8 errors
// are Node's). warpdom decodes UTF-16, x-user-defined and the legacy
// single-byte encodings itself, from the standard's indexes (at the
// end of this file): Node's decoders for these follow ICU's tables, not
// the standard's (Node 22.17 drops windows-1252's 0x80 to 0x9F; koi8-u,
// windows-874 and windows-1253 differ), where jsdom follows the standard.
// The legacy multi-byte encodings (Big5, EUC-JP, EUC-KR, GBK, gb18030,
// ISO-2022-JP, Shift_JIS) are the platform's; jsdom's differ from it for
// a few code points (Big5's combining pairs).
import { S, state, asciiLowercase, tooFewArguments, PLATFORM_GLOBAL } from './internal.js';

// --- bytes and strings (also for Blob and Crypto) ------------------------------------------------
// WebIDL's buffer source checks, which work for arrays and buffers of any
// realm, and the window's realm, where results are created.

// The class of a typed array of any realm ('Uint8Array', ...), undefined
// for other values (%TypedArray%.prototype[@@toStringTag]).
const typedArrayTag = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(Uint8Array.prototype), Symbol.toStringTag).get;
export const typedArrayName = (value) => typedArrayTag.call(value);

const arrayBufferLength = Object.getOwnPropertyDescriptor(ArrayBuffer.prototype, 'byteLength').get;
const sharedBufferLength = typeof SharedArrayBuffer === 'function'
  ? Object.getOwnPropertyDescriptor(SharedArrayBuffer.prototype, 'byteLength').get : null;

// An ArrayBuffer of any realm.
export function isArrayBuffer(value) {
  if (value === null || typeof value !== 'object') return false;
  try { arrayBufferLength.call(value); return true; } catch { return false; }
}

export function isSharedArrayBuffer(value) {
  if (sharedBufferLength === null || value === null || typeof value !== 'object') return false;
  try { sharedBufferLength.call(value); return true; } catch { return false; }
}

// The bytes of a BufferSource as a Uint8Array over the same memory, or
// null for other values (shared: SharedArrayBuffers too).
export function bufferBytes(value, shared = false) {
  if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  if (isArrayBuffer(value) || (shared && isSharedArrayBuffer(value))) return new Uint8Array(value);
  return null;
}

// WebIDL's DOMString conversion (USVString: then toWellFormed): a symbol
// throws, in jsdom's words; what names the value ("parameter 1",
// "parameter 1's element").
export function webidlString(value, what, context) {
  if (typeof value === 'symbol') throw new TypeError(`${context}: ${what} is a symbol, which cannot be converted to a string.`);
  return String(value);
}

// The global object of the window's realm: the VM context's global where a
// test environment runs the window as one (Jest, Vitest's VM pools), else
// this realm's. Arrays, buffers and promises given to the page are made
// there, so instanceof Uint8Array holds in the test.
export const realmOf = (window) => window[S].globalProxy ?? globalThis;

// bytes as a Uint8Array of the window's realm (copied only when the realm
// is another).
export function realmBytes(window, bytes) {
  const U8 = realmOf(window).Uint8Array;
  return U8 === Uint8Array ? bytes : new U8(bytes);
}

// --- encoding and decoding -------------------------------------------------------------------------

// The platform's TextEncoder and TextDecoder, taken when warpdom loads: a
// test setup (or a runner) may later put a window's on the global object.
const PlatformTextEncoder = PLATFORM_GLOBAL.TextEncoder;
export const PlatformTextDecoder = PLATFORM_GLOBAL.TextDecoder;
let platformEncoder = null;

// UTF-8 encode (lone surrogates become U+FFFD), as a Uint8Array of this realm
// (copied when the platform's is another: the CommonJS build in a Jest test
// file, see PLATFORM_GLOBAL).
export function utf8Encode(string) {
  platformEncoder ??= new PlatformTextEncoder();
  const bytes = platformEncoder.encode(string);
  return bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
}

// label -> encoding name, built on first use.
let labelTable = null;
function encodingOf(label) {
  if (labelTable === null) {
    labelTable = new Map();
    for (const [name, labels] of Object.entries(ENCODING_LABELS)) for (const l of labels) labelTable.set(l, name);
  }
  return labelTable.get(asciiLowercase(label.replace(/^[\t\n\f\r ]+|[\t\n\f\r ]+$/g, ''))) ?? null;
}

// --- warpdom's decoders --------------------------------------------------------------------------
// Each has decode(bytes, flush) -> string; stream state lives in the decoder.

const NOT_WELL_FORMED = 'Input is not well-formed for this encoding';

// Code units to a string, in chunks (apply's argument limit).
function fromCodes(codes, length) {
  if (length <= 0x2000) return String.fromCharCode.apply(null, length === codes.length ? codes : codes.slice(0, length));
  let out = '';
  for (let i = 0; i < length; i += 0x2000) out += String.fromCharCode.apply(null, codes.slice(i, Math.min(i + 0x2000, length)));
  return out;
}

// A single-byte encoding: bytes below 0x80 are ASCII, the others come
// from the index (a 128-character string). No state between calls.
function singleByteDecoder(table, fatal) {
  return {
    decode(bytes) {
      const codes = new Array(bytes.length);
      for (let i = 0; i < bytes.length; i++) {
        const b = bytes[i];
        if (b < 0x80) { codes[i] = b; continue; }
        const c = table.charCodeAt(b - 0x80);
        if (c === 0xfffd && fatal) throw new TypeError(NOT_WELL_FORMED);
        codes[i] = c;
      }
      return fromCodes(codes, codes.length);
    },
  };
}

// x-user-defined: bytes 0x80 to 0xFF are U+F780 to U+F7FF.
const userDefinedDecoder = () => ({
  decode(bytes) {
    const codes = new Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) codes[i] = bytes[i] < 0x80 ? bytes[i] : 0xf780 + bytes[i] - 0x80;
    return fromCodes(codes, codes.length);
  },
});

// UTF-16BE and UTF-16LE (Encoding standard, 14.2.1): a pending byte and a
// pending lead surrogate carry over between streamed calls.
function utf16Decoder(bigEndian, fatal) {
  let leadByte = -1;
  let leadSurrogate = -1;
  const error = (message) => { leadByte = -1; leadSurrogate = -1; throw new TypeError(message); };
  return {
    decode(bytes, flush) {
      const codes = [];
      for (let i = 0; i < bytes.length; i++) {
        if (leadByte === -1) { leadByte = bytes[i]; continue; }
        const unit = bigEndian ? (leadByte << 8) | bytes[i] : (bytes[i] << 8) | leadByte;
        leadByte = -1;
        if (leadSurrogate !== -1) {
          const lead = leadSurrogate;
          leadSurrogate = -1;
          if (unit >= 0xdc00 && unit <= 0xdfff) { codes.push(lead, unit); continue; }
          if (fatal) error('Input is not well-formed utf16');
          codes.push(0xfffd);
          // The unit is processed again (prepended to the stream).
        }
        if (unit >= 0xd800 && unit <= 0xdbff) { leadSurrogate = unit; continue; }
        if (unit >= 0xdc00 && unit <= 0xdfff) {
          if (fatal) error('Input is not well-formed utf16');
          codes.push(0xfffd);
          continue;
        }
        codes.push(unit);
      }
      if (flush && (leadByte !== -1 || leadSurrogate !== -1)) {
        const oddByte = leadByte !== -1;
        leadByte = -1;
        leadSurrogate = -1;
        if (fatal) throw new TypeError(oddByte ? 'Expected even number of bytes' : 'Input is not well-formed utf16');
        codes.push(0xfffd);
      }
      return fromCodes(codes, codes.length);
    },
  };
}

// The platform's decoder, BOM handling left to the TextDecoder below (so
// it works the same for every encoding); its errors in jsdom's words but
// for UTF-8, whose errors jsdom passes on from Node.
function platformDecoder(name, fatal) {
  let decoder;
  try { decoder = new PlatformTextDecoder(name, { fatal, ignoreBOM: true }); } catch { return null; }
  return {
    decode(bytes, flush) {
      if (name === 'utf-8') return decoder.decode(bytes, { stream: !flush });
      try {
        return decoder.decode(bytes, { stream: !flush });
      } catch {
        decoder = new PlatformTextDecoder(name, { fatal, ignoreBOM: true });
        throw new TypeError(NOT_WELL_FORMED);
      }
    },
  };
}

function createDecoder(encoding, fatal) {
  if (encoding === 'utf-16le' || encoding === 'utf-16be') return utf16Decoder(encoding === 'utf-16be', fatal);
  if (encoding === 'x-user-defined') return userDefinedDecoder();
  const table = SINGLE_BYTE[encoding];
  if (table !== undefined) return singleByteDecoder(table, fatal);
  return platformDecoder(encoding, fatal);
}

const BOM_ENCODINGS = new Set(['utf-8', 'utf-16le', 'utf-16be']);

// The standard's "decode" (FileReader's readAsText): a byte order mark
// decides the encoding and is dropped; else the first of the labels that
// names an encoding (not replacement), else UTF-8. Errors become U+FFFD.
export function decodeText(bytes, ...labels) {
  let encoding = null;
  let start = 0;
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) { encoding = 'utf-8'; start = 3; }
  else if (bytes[0] === 0xfe && bytes[1] === 0xff) { encoding = 'utf-16be'; start = 2; }
  else if (bytes[0] === 0xff && bytes[1] === 0xfe) { encoding = 'utf-16le'; start = 2; }
  for (const label of labels) {
    if (encoding !== null) break;
    if (label == null) continue;
    const e = encodingOf(String(label));
    if (e !== null && e !== 'replacement') encoding = e;
  }
  const decoder = createDecoder(encoding ?? 'utf-8', false) ?? createDecoder('utf-8', false);
  return decoder.decode(start ? bytes.subarray(start) : bytes, true);
}

// --- the interfaces --------------------------------------------------------------------------------

function dictionary(value, iface, method, index) {
  if (value === undefined || value === null) return {};
  if (typeof value !== 'object' && typeof value !== 'function') {
    throw new TypeError(method ? `Failed to execute '${method}' on '${iface}': parameter ${index} is not an object.` : `Failed to construct '${iface}': parameter ${index} is not an object.`);
  }
  return value;
}

export const ENCODING_INTERFACES = [
  {
    name: 'TextEncoder',
    construct: (window, self) => { self[S] = { window }; return self; },
    members: {
      get encoding() { state(this); return 'utf-8'; },
      encode(input = '') {
        const s = state(this);
        return realmBytes(s.window, utf8Encode(webidlString(input, 'parameter 1', "Failed to execute 'encode' on 'TextEncoder'")));
      },
      encodeInto(source, destination) {
        state(this);
        if (destination === undefined && arguments.length < 2) tooFewArguments('TextEncoder', 'encodeInto', 2, arguments.length);
        const string = webidlString(source, 'parameter 1', "Failed to execute 'encodeInto' on 'TextEncoder'");
        if (typedArrayName(destination) !== 'Uint8Array') throw new TypeError("Failed to execute 'encodeInto' on 'TextEncoder': parameter 2 is not an Uint8Array object.");
        platformEncoder ??= new PlatformTextEncoder();
        const { read, written } = platformEncoder.encodeInto(string, destination);
        return { read, written };
      },
    },
  },
  {
    name: 'TextDecoder',
    construct: (window, self, [label = 'utf-8', options]) => {
      const text = webidlString(label, 'parameter 1', "Failed to construct 'TextDecoder'");
      const dict = dictionary(options, 'TextDecoder', null, 2);
      const fatal = !!dict.fatal;
      const ignoreBOM = !!dict.ignoreBOM;
      const encoding = encodingOf(text);
      const impl = encoding === null || encoding === 'replacement' ? null : createDecoder(encoding, fatal);
      if (impl === null) throw new RangeError('Unknown encoding');
      // bomSeen: the stream's first code point has been looked at (BOM
      // stripping, for UTF-8 and UTF-16 unless ignoreBOM).
      self[S] = { window, encoding, fatal, ignoreBOM, impl, bomSeen: ignoreBOM || !BOM_ENCODINGS.has(encoding) };
      return self;
    },
    members: {
      get encoding() { return state(this).encoding; },
      get fatal() { return state(this).fatal; },
      get ignoreBOM() { return state(this).ignoreBOM; },
      decode(input = undefined, options = undefined) {
        const s = state(this);
        let bytes = EMPTY;
        if (input !== undefined) {
          bytes = bufferBytes(input, true);
          if (bytes === null) throw new TypeError("Failed to execute 'decode' on 'TextDecoder': parameter 1 is not of any supported type.");
        }
        const stream = !!dictionary(options, 'TextDecoder', 'decode', 2).stream;
        let out;
        try {
          out = s.impl.decode(bytes, !stream);
        } catch (error) {
          s.bomSeen = s.ignoreBOM || !BOM_ENCODINGS.has(s.encoding);
          throw error;
        }
        if (!s.bomSeen && out.length > 0) {
          s.bomSeen = true;
          if (out.charCodeAt(0) === 0xfeff) out = out.slice(1);
        }
        // A new stream starts after a call without stream.
        if (!stream) s.bomSeen = s.ignoreBOM || !BOM_ENCODINGS.has(s.encoding);
        return out;
      },
    },
  },
];

const EMPTY = new Uint8Array(0);

// --- Generated by scripts/generate-encoding-data.mjs from the Encoding standard. Do not edit. ---
// ENCODING_LABELS: encoding name -> its labels (encodings.json).
const ENCODING_LABELS = {"utf-8":["unicode-1-1-utf-8","unicode11utf8","unicode20utf8","utf-8","utf8","x-unicode20utf8"],"ibm866":["866","cp866","csibm866","ibm866"],"iso-8859-2":["csisolatin2","iso-8859-2","iso-ir-101","iso8859-2","iso88592","iso_8859-2","iso_8859-2:1987","l2","latin2"],"iso-8859-3":["csisolatin3","iso-8859-3","iso-ir-109","iso8859-3","iso88593","iso_8859-3","iso_8859-3:1988","l3","latin3"],"iso-8859-4":["csisolatin4","iso-8859-4","iso-ir-110","iso8859-4","iso88594","iso_8859-4","iso_8859-4:1988","l4","latin4"],"iso-8859-5":["csisolatincyrillic","cyrillic","iso-8859-5","iso-ir-144","iso8859-5","iso88595","iso_8859-5","iso_8859-5:1988"],"iso-8859-6":["arabic","asmo-708","csiso88596e","csiso88596i","csisolatinarabic","ecma-114","iso-8859-6","iso-8859-6-e","iso-8859-6-i","iso-ir-127","iso8859-6","iso88596","iso_8859-6","iso_8859-6:1987"],"iso-8859-7":["csisolatingreek","ecma-118","elot_928","greek","greek8","iso-8859-7","iso-ir-126","iso8859-7","iso88597","iso_8859-7","iso_8859-7:1987","sun_eu_greek"],"iso-8859-8":["csiso88598e","csisolatinhebrew","hebrew","iso-8859-8","iso-8859-8-e","iso-ir-138","iso8859-8","iso88598","iso_8859-8","iso_8859-8:1988","visual"],"iso-8859-8-i":["csiso88598i","iso-8859-8-i","logical"],"iso-8859-10":["csisolatin6","iso-8859-10","iso-ir-157","iso8859-10","iso885910","l6","latin6"],"iso-8859-13":["iso-8859-13","iso8859-13","iso885913"],"iso-8859-14":["iso-8859-14","iso8859-14","iso885914"],"iso-8859-15":["csisolatin9","iso-8859-15","iso8859-15","iso885915","iso_8859-15","l9"],"iso-8859-16":["iso-8859-16"],"koi8-r":["cskoi8r","koi","koi8","koi8-r","koi8_r"],"koi8-u":["koi8-ru","koi8-u"],"macintosh":["csmacintosh","mac","macintosh","x-mac-roman"],"windows-874":["dos-874","iso-8859-11","iso8859-11","iso885911","tis-620","windows-874"],"windows-1250":["cp1250","windows-1250","x-cp1250"],"windows-1251":["cp1251","windows-1251","x-cp1251"],"windows-1252":["ansi_x3.4-1968","ascii","cp1252","cp819","csisolatin1","ibm819","iso-8859-1","iso-ir-100","iso8859-1","iso88591","iso_8859-1","iso_8859-1:1987","l1","latin1","us-ascii","windows-1252","x-cp1252"],"windows-1253":["cp1253","windows-1253","x-cp1253"],"windows-1254":["cp1254","csisolatin5","iso-8859-9","iso-ir-148","iso8859-9","iso88599","iso_8859-9","iso_8859-9:1989","l5","latin5","windows-1254","x-cp1254"],"windows-1255":["cp1255","windows-1255","x-cp1255"],"windows-1256":["cp1256","windows-1256","x-cp1256"],"windows-1257":["cp1257","windows-1257","x-cp1257"],"windows-1258":["cp1258","windows-1258","x-cp1258"],"x-mac-cyrillic":["x-mac-cyrillic","x-mac-ukrainian"],"gbk":["chinese","csgb2312","csiso58gb231280","gb2312","gb_2312","gb_2312-80","gbk","iso-ir-58","x-gbk"],"gb18030":["gb18030"],"big5":["big5","big5-hkscs","cn-big5","csbig5","x-x-big5"],"euc-jp":["cseucpkdfmtjapanese","euc-jp","x-euc-jp"],"iso-2022-jp":["csiso2022jp","iso-2022-jp"],"shift_jis":["csshiftjis","ms932","ms_kanji","shift-jis","shift_jis","sjis","windows-31j","x-sjis"],"euc-kr":["cseuckr","csksc56011987","euc-kr","iso-ir-149","korean","ks_c_5601-1987","ks_c_5601-1989","ksc5601","ksc_5601","windows-949"],"replacement":["csiso2022kr","hz-gb-2312","iso-2022-cn","iso-2022-cn-ext","iso-2022-kr","replacement"],"utf-16be":["unicodefffe","utf-16be"],"utf-16le":["csunicode","iso-10646-ucs-2","ucs-2","unicode","unicodefeff","utf-16","utf-16le"],"x-user-defined":["x-user-defined"]};
// SINGLE_BYTE: the code points of bytes 0x80 to 0xFF (index-<name>.txt);
// U+FFFD for unmapped bytes.
const SINGLE_BYTE = {
  'ibm866': '\u0410\u0411\u0412\u0413\u0414\u0415\u0416\u0417\u0418\u0419\u041a\u041b\u041c\u041d\u041e\u041f\u0420\u0421\u0422\u0423\u0424\u0425\u0426\u0427\u0428\u0429\u042a\u042b\u042c\u042d\u042e\u042f\u0430\u0431\u0432\u0433\u0434\u0435\u0436\u0437\u0438\u0439\u043a\u043b\u043c\u043d\u043e\u043f\u2591\u2592\u2593\u2502\u2524\u2561\u2562\u2556\u2555\u2563\u2551\u2557\u255d\u255c\u255b\u2510\u2514\u2534\u252c\u251c\u2500\u253c\u255e\u255f\u255a\u2554\u2569\u2566\u2560\u2550\u256c\u2567\u2568\u2564\u2565\u2559\u2558\u2552\u2553\u256b\u256a\u2518\u250c\u2588\u2584\u258c\u2590\u2580\u0440\u0441\u0442\u0443\u0444\u0445\u0446\u0447\u0448\u0449\u044a\u044b\u044c\u044d\u044e\u044f\u0401\u0451\u0404\u0454\u0407\u0457\u040e\u045e\u00b0\u2219\u00b7\u221a\u2116\u00a4\u25a0\u00a0',
  'iso-8859-2': '\u0080\u0081\u0082\u0083\u0084\u0085\u0086\u0087\u0088\u0089\u008a\u008b\u008c\u008d\u008e\u008f\u0090\u0091\u0092\u0093\u0094\u0095\u0096\u0097\u0098\u0099\u009a\u009b\u009c\u009d\u009e\u009f\u00a0\u0104\u02d8\u0141\u00a4\u013d\u015a\u00a7\u00a8\u0160\u015e\u0164\u0179\u00ad\u017d\u017b\u00b0\u0105\u02db\u0142\u00b4\u013e\u015b\u02c7\u00b8\u0161\u015f\u0165\u017a\u02dd\u017e\u017c\u0154\u00c1\u00c2\u0102\u00c4\u0139\u0106\u00c7\u010c\u00c9\u0118\u00cb\u011a\u00cd\u00ce\u010e\u0110\u0143\u0147\u00d3\u00d4\u0150\u00d6\u00d7\u0158\u016e\u00da\u0170\u00dc\u00dd\u0162\u00df\u0155\u00e1\u00e2\u0103\u00e4\u013a\u0107\u00e7\u010d\u00e9\u0119\u00eb\u011b\u00ed\u00ee\u010f\u0111\u0144\u0148\u00f3\u00f4\u0151\u00f6\u00f7\u0159\u016f\u00fa\u0171\u00fc\u00fd\u0163\u02d9',
  'iso-8859-3': '\u0080\u0081\u0082\u0083\u0084\u0085\u0086\u0087\u0088\u0089\u008a\u008b\u008c\u008d\u008e\u008f\u0090\u0091\u0092\u0093\u0094\u0095\u0096\u0097\u0098\u0099\u009a\u009b\u009c\u009d\u009e\u009f\u00a0\u0126\u02d8\u00a3\u00a4\ufffd\u0124\u00a7\u00a8\u0130\u015e\u011e\u0134\u00ad\ufffd\u017b\u00b0\u0127\u00b2\u00b3\u00b4\u00b5\u0125\u00b7\u00b8\u0131\u015f\u011f\u0135\u00bd\ufffd\u017c\u00c0\u00c1\u00c2\ufffd\u00c4\u010a\u0108\u00c7\u00c8\u00c9\u00ca\u00cb\u00cc\u00cd\u00ce\u00cf\ufffd\u00d1\u00d2\u00d3\u00d4\u0120\u00d6\u00d7\u011c\u00d9\u00da\u00db\u00dc\u016c\u015c\u00df\u00e0\u00e1\u00e2\ufffd\u00e4\u010b\u0109\u00e7\u00e8\u00e9\u00ea\u00eb\u00ec\u00ed\u00ee\u00ef\ufffd\u00f1\u00f2\u00f3\u00f4\u0121\u00f6\u00f7\u011d\u00f9\u00fa\u00fb\u00fc\u016d\u015d\u02d9',
  'iso-8859-4': '\u0080\u0081\u0082\u0083\u0084\u0085\u0086\u0087\u0088\u0089\u008a\u008b\u008c\u008d\u008e\u008f\u0090\u0091\u0092\u0093\u0094\u0095\u0096\u0097\u0098\u0099\u009a\u009b\u009c\u009d\u009e\u009f\u00a0\u0104\u0138\u0156\u00a4\u0128\u013b\u00a7\u00a8\u0160\u0112\u0122\u0166\u00ad\u017d\u00af\u00b0\u0105\u02db\u0157\u00b4\u0129\u013c\u02c7\u00b8\u0161\u0113\u0123\u0167\u014a\u017e\u014b\u0100\u00c1\u00c2\u00c3\u00c4\u00c5\u00c6\u012e\u010c\u00c9\u0118\u00cb\u0116\u00cd\u00ce\u012a\u0110\u0145\u014c\u0136\u00d4\u00d5\u00d6\u00d7\u00d8\u0172\u00da\u00db\u00dc\u0168\u016a\u00df\u0101\u00e1\u00e2\u00e3\u00e4\u00e5\u00e6\u012f\u010d\u00e9\u0119\u00eb\u0117\u00ed\u00ee\u012b\u0111\u0146\u014d\u0137\u00f4\u00f5\u00f6\u00f7\u00f8\u0173\u00fa\u00fb\u00fc\u0169\u016b\u02d9',
  'iso-8859-5': '\u0080\u0081\u0082\u0083\u0084\u0085\u0086\u0087\u0088\u0089\u008a\u008b\u008c\u008d\u008e\u008f\u0090\u0091\u0092\u0093\u0094\u0095\u0096\u0097\u0098\u0099\u009a\u009b\u009c\u009d\u009e\u009f\u00a0\u0401\u0402\u0403\u0404\u0405\u0406\u0407\u0408\u0409\u040a\u040b\u040c\u00ad\u040e\u040f\u0410\u0411\u0412\u0413\u0414\u0415\u0416\u0417\u0418\u0419\u041a\u041b\u041c\u041d\u041e\u041f\u0420\u0421\u0422\u0423\u0424\u0425\u0426\u0427\u0428\u0429\u042a\u042b\u042c\u042d\u042e\u042f\u0430\u0431\u0432\u0433\u0434\u0435\u0436\u0437\u0438\u0439\u043a\u043b\u043c\u043d\u043e\u043f\u0440\u0441\u0442\u0443\u0444\u0445\u0446\u0447\u0448\u0449\u044a\u044b\u044c\u044d\u044e\u044f\u2116\u0451\u0452\u0453\u0454\u0455\u0456\u0457\u0458\u0459\u045a\u045b\u045c\u00a7\u045e\u045f',
  'iso-8859-6': '\u0080\u0081\u0082\u0083\u0084\u0085\u0086\u0087\u0088\u0089\u008a\u008b\u008c\u008d\u008e\u008f\u0090\u0091\u0092\u0093\u0094\u0095\u0096\u0097\u0098\u0099\u009a\u009b\u009c\u009d\u009e\u009f\u00a0\ufffd\ufffd\ufffd\u00a4\ufffd\ufffd\ufffd\ufffd\ufffd\ufffd\ufffd\u060c\u00ad\ufffd\ufffd\ufffd\ufffd\ufffd\ufffd\ufffd\ufffd\ufffd\ufffd\ufffd\ufffd\ufffd\u061b\ufffd\ufffd\ufffd\u061f\ufffd\u0621\u0622\u0623\u0624\u0625\u0626\u0627\u0628\u0629\u062a\u062b\u062c\u062d\u062e\u062f\u0630\u0631\u0632\u0633\u0634\u0635\u0636\u0637\u0638\u0639\u063a\ufffd\ufffd\ufffd\ufffd\ufffd\u0640\u0641\u0642\u0643\u0644\u0645\u0646\u0647\u0648\u0649\u064a\u064b\u064c\u064d\u064e\u064f\u0650\u0651\u0652\ufffd\ufffd\ufffd\ufffd\ufffd\ufffd\ufffd\ufffd\ufffd\ufffd\ufffd\ufffd\ufffd',
  'iso-8859-7': '\u0080\u0081\u0082\u0083\u0084\u0085\u0086\u0087\u0088\u0089\u008a\u008b\u008c\u008d\u008e\u008f\u0090\u0091\u0092\u0093\u0094\u0095\u0096\u0097\u0098\u0099\u009a\u009b\u009c\u009d\u009e\u009f\u00a0\u2018\u2019\u00a3\u20ac\u20af\u00a6\u00a7\u00a8\u00a9\u037a\u00ab\u00ac\u00ad\ufffd\u2015\u00b0\u00b1\u00b2\u00b3\u0384\u0385\u0386\u00b7\u0388\u0389\u038a\u00bb\u038c\u00bd\u038e\u038f\u0390\u0391\u0392\u0393\u0394\u0395\u0396\u0397\u0398\u0399\u039a\u039b\u039c\u039d\u039e\u039f\u03a0\u03a1\ufffd\u03a3\u03a4\u03a5\u03a6\u03a7\u03a8\u03a9\u03aa\u03ab\u03ac\u03ad\u03ae\u03af\u03b0\u03b1\u03b2\u03b3\u03b4\u03b5\u03b6\u03b7\u03b8\u03b9\u03ba\u03bb\u03bc\u03bd\u03be\u03bf\u03c0\u03c1\u03c2\u03c3\u03c4\u03c5\u03c6\u03c7\u03c8\u03c9\u03ca\u03cb\u03cc\u03cd\u03ce\ufffd',
  'iso-8859-8': '\u0080\u0081\u0082\u0083\u0084\u0085\u0086\u0087\u0088\u0089\u008a\u008b\u008c\u008d\u008e\u008f\u0090\u0091\u0092\u0093\u0094\u0095\u0096\u0097\u0098\u0099\u009a\u009b\u009c\u009d\u009e\u009f\u00a0\ufffd\u00a2\u00a3\u00a4\u00a5\u00a6\u00a7\u00a8\u00a9\u00d7\u00ab\u00ac\u00ad\u00ae\u00af\u00b0\u00b1\u00b2\u00b3\u00b4\u00b5\u00b6\u00b7\u00b8\u00b9\u00f7\u00bb\u00bc\u00bd\u00be\ufffd\ufffd\ufffd\ufffd\ufffd\ufffd\ufffd\ufffd\ufffd\ufffd\ufffd\ufffd\ufffd\ufffd\ufffd\ufffd\ufffd\ufffd\ufffd\ufffd\ufffd\ufffd\ufffd\ufffd\ufffd\ufffd\ufffd\ufffd\ufffd\ufffd\ufffd\ufffd\u2017\u05d0\u05d1\u05d2\u05d3\u05d4\u05d5\u05d6\u05d7\u05d8\u05d9\u05da\u05db\u05dc\u05dd\u05de\u05df\u05e0\u05e1\u05e2\u05e3\u05e4\u05e5\u05e6\u05e7\u05e8\u05e9\u05ea\ufffd\ufffd\u200e\u200f\ufffd',
  'iso-8859-8-i': '\u0080\u0081\u0082\u0083\u0084\u0085\u0086\u0087\u0088\u0089\u008a\u008b\u008c\u008d\u008e\u008f\u0090\u0091\u0092\u0093\u0094\u0095\u0096\u0097\u0098\u0099\u009a\u009b\u009c\u009d\u009e\u009f\u00a0\ufffd\u00a2\u00a3\u00a4\u00a5\u00a6\u00a7\u00a8\u00a9\u00d7\u00ab\u00ac\u00ad\u00ae\u00af\u00b0\u00b1\u00b2\u00b3\u00b4\u00b5\u00b6\u00b7\u00b8\u00b9\u00f7\u00bb\u00bc\u00bd\u00be\ufffd\ufffd\ufffd\ufffd\ufffd\ufffd\ufffd\ufffd\ufffd\ufffd\ufffd\ufffd\ufffd\ufffd\ufffd\ufffd\ufffd\ufffd\ufffd\ufffd\ufffd\ufffd\ufffd\ufffd\ufffd\ufffd\ufffd\ufffd\ufffd\ufffd\ufffd\ufffd\u2017\u05d0\u05d1\u05d2\u05d3\u05d4\u05d5\u05d6\u05d7\u05d8\u05d9\u05da\u05db\u05dc\u05dd\u05de\u05df\u05e0\u05e1\u05e2\u05e3\u05e4\u05e5\u05e6\u05e7\u05e8\u05e9\u05ea\ufffd\ufffd\u200e\u200f\ufffd',
  'iso-8859-10': '\u0080\u0081\u0082\u0083\u0084\u0085\u0086\u0087\u0088\u0089\u008a\u008b\u008c\u008d\u008e\u008f\u0090\u0091\u0092\u0093\u0094\u0095\u0096\u0097\u0098\u0099\u009a\u009b\u009c\u009d\u009e\u009f\u00a0\u0104\u0112\u0122\u012a\u0128\u0136\u00a7\u013b\u0110\u0160\u0166\u017d\u00ad\u016a\u014a\u00b0\u0105\u0113\u0123\u012b\u0129\u0137\u00b7\u013c\u0111\u0161\u0167\u017e\u2015\u016b\u014b\u0100\u00c1\u00c2\u00c3\u00c4\u00c5\u00c6\u012e\u010c\u00c9\u0118\u00cb\u0116\u00cd\u00ce\u00cf\u00d0\u0145\u014c\u00d3\u00d4\u00d5\u00d6\u0168\u00d8\u0172\u00da\u00db\u00dc\u00dd\u00de\u00df\u0101\u00e1\u00e2\u00e3\u00e4\u00e5\u00e6\u012f\u010d\u00e9\u0119\u00eb\u0117\u00ed\u00ee\u00ef\u00f0\u0146\u014d\u00f3\u00f4\u00f5\u00f6\u0169\u00f8\u0173\u00fa\u00fb\u00fc\u00fd\u00fe\u0138',
  'iso-8859-13': '\u0080\u0081\u0082\u0083\u0084\u0085\u0086\u0087\u0088\u0089\u008a\u008b\u008c\u008d\u008e\u008f\u0090\u0091\u0092\u0093\u0094\u0095\u0096\u0097\u0098\u0099\u009a\u009b\u009c\u009d\u009e\u009f\u00a0\u201d\u00a2\u00a3\u00a4\u201e\u00a6\u00a7\u00d8\u00a9\u0156\u00ab\u00ac\u00ad\u00ae\u00c6\u00b0\u00b1\u00b2\u00b3\u201c\u00b5\u00b6\u00b7\u00f8\u00b9\u0157\u00bb\u00bc\u00bd\u00be\u00e6\u0104\u012e\u0100\u0106\u00c4\u00c5\u0118\u0112\u010c\u00c9\u0179\u0116\u0122\u0136\u012a\u013b\u0160\u0143\u0145\u00d3\u014c\u00d5\u00d6\u00d7\u0172\u0141\u015a\u016a\u00dc\u017b\u017d\u00df\u0105\u012f\u0101\u0107\u00e4\u00e5\u0119\u0113\u010d\u00e9\u017a\u0117\u0123\u0137\u012b\u013c\u0161\u0144\u0146\u00f3\u014d\u00f5\u00f6\u00f7\u0173\u0142\u015b\u016b\u00fc\u017c\u017e\u2019',
  'iso-8859-14': '\u0080\u0081\u0082\u0083\u0084\u0085\u0086\u0087\u0088\u0089\u008a\u008b\u008c\u008d\u008e\u008f\u0090\u0091\u0092\u0093\u0094\u0095\u0096\u0097\u0098\u0099\u009a\u009b\u009c\u009d\u009e\u009f\u00a0\u1e02\u1e03\u00a3\u010a\u010b\u1e0a\u00a7\u1e80\u00a9\u1e82\u1e0b\u1ef2\u00ad\u00ae\u0178\u1e1e\u1e1f\u0120\u0121\u1e40\u1e41\u00b6\u1e56\u1e81\u1e57\u1e83\u1e60\u1ef3\u1e84\u1e85\u1e61\u00c0\u00c1\u00c2\u00c3\u00c4\u00c5\u00c6\u00c7\u00c8\u00c9\u00ca\u00cb\u00cc\u00cd\u00ce\u00cf\u0174\u00d1\u00d2\u00d3\u00d4\u00d5\u00d6\u1e6a\u00d8\u00d9\u00da\u00db\u00dc\u00dd\u0176\u00df\u00e0\u00e1\u00e2\u00e3\u00e4\u00e5\u00e6\u00e7\u00e8\u00e9\u00ea\u00eb\u00ec\u00ed\u00ee\u00ef\u0175\u00f1\u00f2\u00f3\u00f4\u00f5\u00f6\u1e6b\u00f8\u00f9\u00fa\u00fb\u00fc\u00fd\u0177\u00ff',
  'iso-8859-15': '\u0080\u0081\u0082\u0083\u0084\u0085\u0086\u0087\u0088\u0089\u008a\u008b\u008c\u008d\u008e\u008f\u0090\u0091\u0092\u0093\u0094\u0095\u0096\u0097\u0098\u0099\u009a\u009b\u009c\u009d\u009e\u009f\u00a0\u00a1\u00a2\u00a3\u20ac\u00a5\u0160\u00a7\u0161\u00a9\u00aa\u00ab\u00ac\u00ad\u00ae\u00af\u00b0\u00b1\u00b2\u00b3\u017d\u00b5\u00b6\u00b7\u017e\u00b9\u00ba\u00bb\u0152\u0153\u0178\u00bf\u00c0\u00c1\u00c2\u00c3\u00c4\u00c5\u00c6\u00c7\u00c8\u00c9\u00ca\u00cb\u00cc\u00cd\u00ce\u00cf\u00d0\u00d1\u00d2\u00d3\u00d4\u00d5\u00d6\u00d7\u00d8\u00d9\u00da\u00db\u00dc\u00dd\u00de\u00df\u00e0\u00e1\u00e2\u00e3\u00e4\u00e5\u00e6\u00e7\u00e8\u00e9\u00ea\u00eb\u00ec\u00ed\u00ee\u00ef\u00f0\u00f1\u00f2\u00f3\u00f4\u00f5\u00f6\u00f7\u00f8\u00f9\u00fa\u00fb\u00fc\u00fd\u00fe\u00ff',
  'iso-8859-16': '\u0080\u0081\u0082\u0083\u0084\u0085\u0086\u0087\u0088\u0089\u008a\u008b\u008c\u008d\u008e\u008f\u0090\u0091\u0092\u0093\u0094\u0095\u0096\u0097\u0098\u0099\u009a\u009b\u009c\u009d\u009e\u009f\u00a0\u0104\u0105\u0141\u20ac\u201e\u0160\u00a7\u0161\u00a9\u0218\u00ab\u0179\u00ad\u017a\u017b\u00b0\u00b1\u010c\u0142\u017d\u201d\u00b6\u00b7\u017e\u010d\u0219\u00bb\u0152\u0153\u0178\u017c\u00c0\u00c1\u00c2\u0102\u00c4\u0106\u00c6\u00c7\u00c8\u00c9\u00ca\u00cb\u00cc\u00cd\u00ce\u00cf\u0110\u0143\u00d2\u00d3\u00d4\u0150\u00d6\u015a\u0170\u00d9\u00da\u00db\u00dc\u0118\u021a\u00df\u00e0\u00e1\u00e2\u0103\u00e4\u0107\u00e6\u00e7\u00e8\u00e9\u00ea\u00eb\u00ec\u00ed\u00ee\u00ef\u0111\u0144\u00f2\u00f3\u00f4\u0151\u00f6\u015b\u0171\u00f9\u00fa\u00fb\u00fc\u0119\u021b\u00ff',
  'koi8-r': '\u2500\u2502\u250c\u2510\u2514\u2518\u251c\u2524\u252c\u2534\u253c\u2580\u2584\u2588\u258c\u2590\u2591\u2592\u2593\u2320\u25a0\u2219\u221a\u2248\u2264\u2265\u00a0\u2321\u00b0\u00b2\u00b7\u00f7\u2550\u2551\u2552\u0451\u2553\u2554\u2555\u2556\u2557\u2558\u2559\u255a\u255b\u255c\u255d\u255e\u255f\u2560\u2561\u0401\u2562\u2563\u2564\u2565\u2566\u2567\u2568\u2569\u256a\u256b\u256c\u00a9\u044e\u0430\u0431\u0446\u0434\u0435\u0444\u0433\u0445\u0438\u0439\u043a\u043b\u043c\u043d\u043e\u043f\u044f\u0440\u0441\u0442\u0443\u0436\u0432\u044c\u044b\u0437\u0448\u044d\u0449\u0447\u044a\u042e\u0410\u0411\u0426\u0414\u0415\u0424\u0413\u0425\u0418\u0419\u041a\u041b\u041c\u041d\u041e\u041f\u042f\u0420\u0421\u0422\u0423\u0416\u0412\u042c\u042b\u0417\u0428\u042d\u0429\u0427\u042a',
  'koi8-u': '\u2500\u2502\u250c\u2510\u2514\u2518\u251c\u2524\u252c\u2534\u253c\u2580\u2584\u2588\u258c\u2590\u2591\u2592\u2593\u2320\u25a0\u2219\u221a\u2248\u2264\u2265\u00a0\u2321\u00b0\u00b2\u00b7\u00f7\u2550\u2551\u2552\u0451\u0454\u2554\u0456\u0457\u2557\u2558\u2559\u255a\u255b\u0491\u045e\u255e\u255f\u2560\u2561\u0401\u0404\u2563\u0406\u0407\u2566\u2567\u2568\u2569\u256a\u0490\u040e\u00a9\u044e\u0430\u0431\u0446\u0434\u0435\u0444\u0433\u0445\u0438\u0439\u043a\u043b\u043c\u043d\u043e\u043f\u044f\u0440\u0441\u0442\u0443\u0436\u0432\u044c\u044b\u0437\u0448\u044d\u0449\u0447\u044a\u042e\u0410\u0411\u0426\u0414\u0415\u0424\u0413\u0425\u0418\u0419\u041a\u041b\u041c\u041d\u041e\u041f\u042f\u0420\u0421\u0422\u0423\u0416\u0412\u042c\u042b\u0417\u0428\u042d\u0429\u0427\u042a',
  'macintosh': '\u00c4\u00c5\u00c7\u00c9\u00d1\u00d6\u00dc\u00e1\u00e0\u00e2\u00e4\u00e3\u00e5\u00e7\u00e9\u00e8\u00ea\u00eb\u00ed\u00ec\u00ee\u00ef\u00f1\u00f3\u00f2\u00f4\u00f6\u00f5\u00fa\u00f9\u00fb\u00fc\u2020\u00b0\u00a2\u00a3\u00a7\u2022\u00b6\u00df\u00ae\u00a9\u2122\u00b4\u00a8\u2260\u00c6\u00d8\u221e\u00b1\u2264\u2265\u00a5\u00b5\u2202\u2211\u220f\u03c0\u222b\u00aa\u00ba\u03a9\u00e6\u00f8\u00bf\u00a1\u00ac\u221a\u0192\u2248\u2206\u00ab\u00bb\u2026\u00a0\u00c0\u00c3\u00d5\u0152\u0153\u2013\u2014\u201c\u201d\u2018\u2019\u00f7\u25ca\u00ff\u0178\u2044\u20ac\u2039\u203a\ufb01\ufb02\u2021\u00b7\u201a\u201e\u2030\u00c2\u00ca\u00c1\u00cb\u00c8\u00cd\u00ce\u00cf\u00cc\u00d3\u00d4\uf8ff\u00d2\u00da\u00db\u00d9\u0131\u02c6\u02dc\u00af\u02d8\u02d9\u02da\u00b8\u02dd\u02db\u02c7',
  'windows-874': '\u20ac\u0081\u0082\u0083\u0084\u2026\u0086\u0087\u0088\u0089\u008a\u008b\u008c\u008d\u008e\u008f\u0090\u2018\u2019\u201c\u201d\u2022\u2013\u2014\u0098\u0099\u009a\u009b\u009c\u009d\u009e\u009f\u00a0\u0e01\u0e02\u0e03\u0e04\u0e05\u0e06\u0e07\u0e08\u0e09\u0e0a\u0e0b\u0e0c\u0e0d\u0e0e\u0e0f\u0e10\u0e11\u0e12\u0e13\u0e14\u0e15\u0e16\u0e17\u0e18\u0e19\u0e1a\u0e1b\u0e1c\u0e1d\u0e1e\u0e1f\u0e20\u0e21\u0e22\u0e23\u0e24\u0e25\u0e26\u0e27\u0e28\u0e29\u0e2a\u0e2b\u0e2c\u0e2d\u0e2e\u0e2f\u0e30\u0e31\u0e32\u0e33\u0e34\u0e35\u0e36\u0e37\u0e38\u0e39\u0e3a\ufffd\ufffd\ufffd\ufffd\u0e3f\u0e40\u0e41\u0e42\u0e43\u0e44\u0e45\u0e46\u0e47\u0e48\u0e49\u0e4a\u0e4b\u0e4c\u0e4d\u0e4e\u0e4f\u0e50\u0e51\u0e52\u0e53\u0e54\u0e55\u0e56\u0e57\u0e58\u0e59\u0e5a\u0e5b\ufffd\ufffd\ufffd\ufffd',
  'windows-1250': '\u20ac\u0081\u201a\u0083\u201e\u2026\u2020\u2021\u0088\u2030\u0160\u2039\u015a\u0164\u017d\u0179\u0090\u2018\u2019\u201c\u201d\u2022\u2013\u2014\u0098\u2122\u0161\u203a\u015b\u0165\u017e\u017a\u00a0\u02c7\u02d8\u0141\u00a4\u0104\u00a6\u00a7\u00a8\u00a9\u015e\u00ab\u00ac\u00ad\u00ae\u017b\u00b0\u00b1\u02db\u0142\u00b4\u00b5\u00b6\u00b7\u00b8\u0105\u015f\u00bb\u013d\u02dd\u013e\u017c\u0154\u00c1\u00c2\u0102\u00c4\u0139\u0106\u00c7\u010c\u00c9\u0118\u00cb\u011a\u00cd\u00ce\u010e\u0110\u0143\u0147\u00d3\u00d4\u0150\u00d6\u00d7\u0158\u016e\u00da\u0170\u00dc\u00dd\u0162\u00df\u0155\u00e1\u00e2\u0103\u00e4\u013a\u0107\u00e7\u010d\u00e9\u0119\u00eb\u011b\u00ed\u00ee\u010f\u0111\u0144\u0148\u00f3\u00f4\u0151\u00f6\u00f7\u0159\u016f\u00fa\u0171\u00fc\u00fd\u0163\u02d9',
  'windows-1251': '\u0402\u0403\u201a\u0453\u201e\u2026\u2020\u2021\u20ac\u2030\u0409\u2039\u040a\u040c\u040b\u040f\u0452\u2018\u2019\u201c\u201d\u2022\u2013\u2014\u0098\u2122\u0459\u203a\u045a\u045c\u045b\u045f\u00a0\u040e\u045e\u0408\u00a4\u0490\u00a6\u00a7\u0401\u00a9\u0404\u00ab\u00ac\u00ad\u00ae\u0407\u00b0\u00b1\u0406\u0456\u0491\u00b5\u00b6\u00b7\u0451\u2116\u0454\u00bb\u0458\u0405\u0455\u0457\u0410\u0411\u0412\u0413\u0414\u0415\u0416\u0417\u0418\u0419\u041a\u041b\u041c\u041d\u041e\u041f\u0420\u0421\u0422\u0423\u0424\u0425\u0426\u0427\u0428\u0429\u042a\u042b\u042c\u042d\u042e\u042f\u0430\u0431\u0432\u0433\u0434\u0435\u0436\u0437\u0438\u0439\u043a\u043b\u043c\u043d\u043e\u043f\u0440\u0441\u0442\u0443\u0444\u0445\u0446\u0447\u0448\u0449\u044a\u044b\u044c\u044d\u044e\u044f',
  'windows-1252': '\u20ac\u0081\u201a\u0192\u201e\u2026\u2020\u2021\u02c6\u2030\u0160\u2039\u0152\u008d\u017d\u008f\u0090\u2018\u2019\u201c\u201d\u2022\u2013\u2014\u02dc\u2122\u0161\u203a\u0153\u009d\u017e\u0178\u00a0\u00a1\u00a2\u00a3\u00a4\u00a5\u00a6\u00a7\u00a8\u00a9\u00aa\u00ab\u00ac\u00ad\u00ae\u00af\u00b0\u00b1\u00b2\u00b3\u00b4\u00b5\u00b6\u00b7\u00b8\u00b9\u00ba\u00bb\u00bc\u00bd\u00be\u00bf\u00c0\u00c1\u00c2\u00c3\u00c4\u00c5\u00c6\u00c7\u00c8\u00c9\u00ca\u00cb\u00cc\u00cd\u00ce\u00cf\u00d0\u00d1\u00d2\u00d3\u00d4\u00d5\u00d6\u00d7\u00d8\u00d9\u00da\u00db\u00dc\u00dd\u00de\u00df\u00e0\u00e1\u00e2\u00e3\u00e4\u00e5\u00e6\u00e7\u00e8\u00e9\u00ea\u00eb\u00ec\u00ed\u00ee\u00ef\u00f0\u00f1\u00f2\u00f3\u00f4\u00f5\u00f6\u00f7\u00f8\u00f9\u00fa\u00fb\u00fc\u00fd\u00fe\u00ff',
  'windows-1253': '\u20ac\u0081\u201a\u0192\u201e\u2026\u2020\u2021\u0088\u2030\u008a\u2039\u008c\u008d\u008e\u008f\u0090\u2018\u2019\u201c\u201d\u2022\u2013\u2014\u0098\u2122\u009a\u203a\u009c\u009d\u009e\u009f\u00a0\u0385\u0386\u00a3\u00a4\u00a5\u00a6\u00a7\u00a8\u00a9\ufffd\u00ab\u00ac\u00ad\u00ae\u2015\u00b0\u00b1\u00b2\u00b3\u0384\u00b5\u00b6\u00b7\u0388\u0389\u038a\u00bb\u038c\u00bd\u038e\u038f\u0390\u0391\u0392\u0393\u0394\u0395\u0396\u0397\u0398\u0399\u039a\u039b\u039c\u039d\u039e\u039f\u03a0\u03a1\ufffd\u03a3\u03a4\u03a5\u03a6\u03a7\u03a8\u03a9\u03aa\u03ab\u03ac\u03ad\u03ae\u03af\u03b0\u03b1\u03b2\u03b3\u03b4\u03b5\u03b6\u03b7\u03b8\u03b9\u03ba\u03bb\u03bc\u03bd\u03be\u03bf\u03c0\u03c1\u03c2\u03c3\u03c4\u03c5\u03c6\u03c7\u03c8\u03c9\u03ca\u03cb\u03cc\u03cd\u03ce\ufffd',
  'windows-1254': '\u20ac\u0081\u201a\u0192\u201e\u2026\u2020\u2021\u02c6\u2030\u0160\u2039\u0152\u008d\u008e\u008f\u0090\u2018\u2019\u201c\u201d\u2022\u2013\u2014\u02dc\u2122\u0161\u203a\u0153\u009d\u009e\u0178\u00a0\u00a1\u00a2\u00a3\u00a4\u00a5\u00a6\u00a7\u00a8\u00a9\u00aa\u00ab\u00ac\u00ad\u00ae\u00af\u00b0\u00b1\u00b2\u00b3\u00b4\u00b5\u00b6\u00b7\u00b8\u00b9\u00ba\u00bb\u00bc\u00bd\u00be\u00bf\u00c0\u00c1\u00c2\u00c3\u00c4\u00c5\u00c6\u00c7\u00c8\u00c9\u00ca\u00cb\u00cc\u00cd\u00ce\u00cf\u011e\u00d1\u00d2\u00d3\u00d4\u00d5\u00d6\u00d7\u00d8\u00d9\u00da\u00db\u00dc\u0130\u015e\u00df\u00e0\u00e1\u00e2\u00e3\u00e4\u00e5\u00e6\u00e7\u00e8\u00e9\u00ea\u00eb\u00ec\u00ed\u00ee\u00ef\u011f\u00f1\u00f2\u00f3\u00f4\u00f5\u00f6\u00f7\u00f8\u00f9\u00fa\u00fb\u00fc\u0131\u015f\u00ff',
  'windows-1255': '\u20ac\u0081\u201a\u0192\u201e\u2026\u2020\u2021\u02c6\u2030\u008a\u2039\u008c\u008d\u008e\u008f\u0090\u2018\u2019\u201c\u201d\u2022\u2013\u2014\u02dc\u2122\u009a\u203a\u009c\u009d\u009e\u009f\u00a0\u00a1\u00a2\u00a3\u20aa\u00a5\u00a6\u00a7\u00a8\u00a9\u00d7\u00ab\u00ac\u00ad\u00ae\u00af\u00b0\u00b1\u00b2\u00b3\u00b4\u00b5\u00b6\u00b7\u00b8\u00b9\u00f7\u00bb\u00bc\u00bd\u00be\u00bf\u05b0\u05b1\u05b2\u05b3\u05b4\u05b5\u05b6\u05b7\u05b8\u05b9\u05ba\u05bb\u05bc\u05bd\u05be\u05bf\u05c0\u05c1\u05c2\u05c3\u05f0\u05f1\u05f2\u05f3\u05f4\ufffd\ufffd\ufffd\ufffd\ufffd\ufffd\ufffd\u05d0\u05d1\u05d2\u05d3\u05d4\u05d5\u05d6\u05d7\u05d8\u05d9\u05da\u05db\u05dc\u05dd\u05de\u05df\u05e0\u05e1\u05e2\u05e3\u05e4\u05e5\u05e6\u05e7\u05e8\u05e9\u05ea\ufffd\ufffd\u200e\u200f\ufffd',
  'windows-1256': '\u20ac\u067e\u201a\u0192\u201e\u2026\u2020\u2021\u02c6\u2030\u0679\u2039\u0152\u0686\u0698\u0688\u06af\u2018\u2019\u201c\u201d\u2022\u2013\u2014\u06a9\u2122\u0691\u203a\u0153\u200c\u200d\u06ba\u00a0\u060c\u00a2\u00a3\u00a4\u00a5\u00a6\u00a7\u00a8\u00a9\u06be\u00ab\u00ac\u00ad\u00ae\u00af\u00b0\u00b1\u00b2\u00b3\u00b4\u00b5\u00b6\u00b7\u00b8\u00b9\u061b\u00bb\u00bc\u00bd\u00be\u061f\u06c1\u0621\u0622\u0623\u0624\u0625\u0626\u0627\u0628\u0629\u062a\u062b\u062c\u062d\u062e\u062f\u0630\u0631\u0632\u0633\u0634\u0635\u0636\u00d7\u0637\u0638\u0639\u063a\u0640\u0641\u0642\u0643\u00e0\u0644\u00e2\u0645\u0646\u0647\u0648\u00e7\u00e8\u00e9\u00ea\u00eb\u0649\u064a\u00ee\u00ef\u064b\u064c\u064d\u064e\u00f4\u064f\u0650\u00f7\u0651\u00f9\u0652\u00fb\u00fc\u200e\u200f\u06d2',
  'windows-1257': '\u20ac\u0081\u201a\u0083\u201e\u2026\u2020\u2021\u0088\u2030\u008a\u2039\u008c\u00a8\u02c7\u00b8\u0090\u2018\u2019\u201c\u201d\u2022\u2013\u2014\u0098\u2122\u009a\u203a\u009c\u00af\u02db\u009f\u00a0\ufffd\u00a2\u00a3\u00a4\ufffd\u00a6\u00a7\u00d8\u00a9\u0156\u00ab\u00ac\u00ad\u00ae\u00c6\u00b0\u00b1\u00b2\u00b3\u00b4\u00b5\u00b6\u00b7\u00f8\u00b9\u0157\u00bb\u00bc\u00bd\u00be\u00e6\u0104\u012e\u0100\u0106\u00c4\u00c5\u0118\u0112\u010c\u00c9\u0179\u0116\u0122\u0136\u012a\u013b\u0160\u0143\u0145\u00d3\u014c\u00d5\u00d6\u00d7\u0172\u0141\u015a\u016a\u00dc\u017b\u017d\u00df\u0105\u012f\u0101\u0107\u00e4\u00e5\u0119\u0113\u010d\u00e9\u017a\u0117\u0123\u0137\u012b\u013c\u0161\u0144\u0146\u00f3\u014d\u00f5\u00f6\u00f7\u0173\u0142\u015b\u016b\u00fc\u017c\u017e\u02d9',
  'windows-1258': '\u20ac\u0081\u201a\u0192\u201e\u2026\u2020\u2021\u02c6\u2030\u008a\u2039\u0152\u008d\u008e\u008f\u0090\u2018\u2019\u201c\u201d\u2022\u2013\u2014\u02dc\u2122\u009a\u203a\u0153\u009d\u009e\u0178\u00a0\u00a1\u00a2\u00a3\u00a4\u00a5\u00a6\u00a7\u00a8\u00a9\u00aa\u00ab\u00ac\u00ad\u00ae\u00af\u00b0\u00b1\u00b2\u00b3\u00b4\u00b5\u00b6\u00b7\u00b8\u00b9\u00ba\u00bb\u00bc\u00bd\u00be\u00bf\u00c0\u00c1\u00c2\u0102\u00c4\u00c5\u00c6\u00c7\u00c8\u00c9\u00ca\u00cb\u0300\u00cd\u00ce\u00cf\u0110\u00d1\u0309\u00d3\u00d4\u01a0\u00d6\u00d7\u00d8\u00d9\u00da\u00db\u00dc\u01af\u0303\u00df\u00e0\u00e1\u00e2\u0103\u00e4\u00e5\u00e6\u00e7\u00e8\u00e9\u00ea\u00eb\u0301\u00ed\u00ee\u00ef\u0111\u00f1\u0323\u00f3\u00f4\u01a1\u00f6\u00f7\u00f8\u00f9\u00fa\u00fb\u00fc\u01b0\u20ab\u00ff',
  'x-mac-cyrillic': '\u0410\u0411\u0412\u0413\u0414\u0415\u0416\u0417\u0418\u0419\u041a\u041b\u041c\u041d\u041e\u041f\u0420\u0421\u0422\u0423\u0424\u0425\u0426\u0427\u0428\u0429\u042a\u042b\u042c\u042d\u042e\u042f\u2020\u00b0\u0490\u00a3\u00a7\u2022\u00b6\u0406\u00ae\u00a9\u2122\u0402\u0452\u2260\u0403\u0453\u221e\u00b1\u2264\u2265\u0456\u00b5\u0491\u0408\u0404\u0454\u0407\u0457\u0409\u0459\u040a\u045a\u0458\u0405\u00ac\u221a\u0192\u2248\u2206\u00ab\u00bb\u2026\u00a0\u040b\u045b\u040c\u045c\u0455\u2013\u2014\u201c\u201d\u2018\u2019\u00f7\u201e\u040e\u045e\u040f\u045f\u2116\u0401\u0451\u044f\u0430\u0431\u0432\u0433\u0434\u0435\u0436\u0437\u0438\u0439\u043a\u043b\u043c\u043d\u043e\u043f\u0440\u0441\u0442\u0443\u0444\u0445\u0446\u0447\u0448\u0449\u044a\u044b\u044c\u044d\u044e\u20ac',
};
// --- End of generated data. ---
