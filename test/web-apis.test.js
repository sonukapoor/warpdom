// window.crypto, window.performance, Blob and File, TextEncoder and
// TextDecoder, URL, URLSearchParams, Headers, console, WebAssembly and
// WebSocket:
// parity with jsdom (20, 22, 25, 26, 30), and the version boundaries
// measured on jsdom releases (black box: 21.1.2 / 22.0.0 have no
// crypto.randomUUID, 22.1.0 has; 27.3.0 has no TextEncoder, 27.4.0 has;
// 28.0.0 has no Blob text(), 28.1.0 has; 22.1.0 has no URL.parse, 23.0.0
// has; 24.0.0 has no Headers getSetCookie, 24.1.0 has; 26.1.0's console is
// enumerable, 27.0.0's is not).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWindow } from '../src/node.js';
import { snapshotWindow, resetWindow } from '../src/reset.js';
import { S } from '../src/internal.js';
import { parity, html } from './parity.js';

const VERSIONS = [20, 22, 25, 26, 30];
const attempt = (fn) => {
  try {
    const value = fn();
    return ArrayBuffer.isView(value) ? `U8[${[...value]}]` : value;
  } catch (e) {
    return `${e.constructor.name}/${e.name}: ${e.message} (${e.code})`;
  }
};
const names = (proto) => Object.getOwnPropertyNames(proto).sort();
const tag = (x) => Object.prototype.toString.call(x);

// --- crypto ------------------------------------------------------------------------------------------

const cryptoScenario = (w) => {
  const c = w.crypto;
  const a = new Uint8Array(8);
  const out = {
    shape: [typeof c, c === w.crypto, tag(c), typeof c.subtle, typeof c.randomUUID, c instanceof w.Crypto, names(w.Crypto.prototype),
      Object.getOwnPropertyDescriptor(w.Crypto.prototype, 'getRandomValues').enumerable, w.Crypto.length, 'crypto' in w],
    same: c.getRandomValues(a) === a,
    sizes: [c.getRandomValues(new Uint8Array(65536)).length, c.getRandomValues(new Uint32Array(16384)).length,
      c.getRandomValues(new BigInt64Array(2)).length, c.getRandomValues(new Int8Array(0)).length, c.getRandomValues(new Uint8ClampedArray(3)).length],
    errors: [() => new w.Crypto(), () => c.getRandomValues(new Float32Array(2)), () => c.getRandomValues(new Float64Array(2)),
      () => c.getRandomValues(new DataView(new ArrayBuffer(2))), () => c.getRandomValues(new Uint8Array(65537)),
      () => c.getRandomValues(new Uint16Array(32769)), () => c.getRandomValues(), () => c.getRandomValues(null),
      () => c.getRandomValues([1, 2]), () => c.getRandomValues(new ArrayBuffer(2)), () => w.Crypto.prototype.getRandomValues.call({}, a).length]
      .map(attempt).map((r) => (typeof r === 'string' ? r.replace(/'\w+' called on an object that is not a valid instance of Crypto\./, 'Illegal invocation') : r)),
    quotaIsDOMException: (() => { try { c.getRandomValues(new Uint8Array(70000)); } catch (e) { return [e instanceof w.DOMException, e.name, e.code]; } })(),
  };
  if (c.randomUUID) {
    const ids = [c.randomUUID(), c.randomUUID()];
    out.uuid = [ids.every((id) => /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id)), ids[0] !== ids[1]];
  }
  return out;
};
for (const jsdom of VERSIONS) parity(`crypto: getRandomValues, randomUUID, errors (jsdom ${jsdom})`, cryptoScenario, { jsdom });

parity('crypto: jsdom 30 throws the QuotaExceededError interface', (w) => {
  try { w.crypto.getRandomValues(new Uint8Array(65537)); } catch (e) { return [e instanceof w.QuotaExceededError, e.quota, e.requested]; }
  return null;
});

test('crypto: randomUUID() exists from jsdom 22.1.0 (black box)', () => {
  const has = (jsdom) => typeof createWindow({ jsdom }).crypto.randomUUID;
  assert.deepEqual(['20.0.3', '21.1.2', '22.0.0', '22.1.0', 22, 21, 26, 30].map(has),
    ['undefined', 'undefined', 'undefined', 'function', 'function', 'undefined', 'function', 'function']);
});

test('crypto: fills typed arrays of another realm, and getRandomValues is random', async () => {
  const vm = await import('node:vm');
  const w = createWindow();
  const foreign = vm.runInNewContext('new Uint16Array(4)');
  assert.equal(w.crypto.getRandomValues(foreign), foreign);
  const a = w.crypto.getRandomValues(new Uint8Array(64));
  assert.ok(a.some((x) => x !== 0));
  // Each window has its own Crypto object and interface.
  const other = createWindow();
  assert.notEqual(other.crypto, w.crypto);
  assert.ok(!(other.crypto instanceof w.Crypto));
});

// --- performance -------------------------------------------------------------------------------------

const performanceScenario = async (w) => {
  const p = w.performance;
  const now = p.now();
  const frame = await new Promise((resolve) => w.requestAnimationFrame(resolve));
  return {
    shape: [typeof p, p === w.performance, tag(p), p instanceof w.Performance, p instanceof w.EventTarget, names(w.Performance.prototype),
      Object.getPrototypeOf(w.Performance) === w.EventTarget],
    now: [typeof now, now >= 0 && now < 1000, Math.abs(p.timeOrigin - Date.now()) < 2000, p.now() >= now],
    json: [Object.keys(p.toJSON()), p.toJSON().timeOrigin === p.timeOrigin],
    absent: [typeof p.mark, typeof p.measure, typeof p.getEntries, typeof p.getEntriesByName, typeof p.clearMarks, typeof p.timing, typeof p.navigation],
    // Animation frame times count from the window's time origin.
    frame: [frame >= now, frame <= p.now() + 1],
    errors: [() => new w.Performance(), () => w.Performance.prototype.now.call({})].map(attempt)
      .map((r) => r.replace(/'now' called on an object that is not a valid instance of Performance\./, 'Illegal invocation')),
    events: (() => { let n = 0; p.addEventListener('x', () => n++); p.dispatchEvent(new w.Event('x')); return n; })(),
  };
};
for (const jsdom of VERSIONS) parity(`performance: now, timeOrigin, toJSON (jsdom ${jsdom})`, performanceScenario, { jsdom });

test('performance: each window has its own time origin', async () => {
  const a = createWindow();
  await new Promise((r) => setTimeout(r, 15));
  const b = createWindow();
  assert.ok(b.performance.timeOrigin - a.performance.timeOrigin >= 10);
  assert.ok(a.performance.now() - b.performance.now() >= 10);
});

// --- Blob and File -----------------------------------------------------------------------------------

const readAs = (w, blob, kind = 'Text') => new Promise((resolve) => {
  const reader = new w.FileReader();
  reader.onload = () => resolve(kind === 'ArrayBuffer' ? [...new Uint8Array(reader.result)].join(',') : reader.result);
  reader.onerror = () => resolve(`error ${reader.error?.name}`);
  try { reader[`readAs${kind}`](blob); } catch (e) { resolve(`${e.constructor.name}: ${e.message}`); }
});

const blobScenario = async (w) => {
  const { Blob: B, File: F } = w;
  const inner = new B(['xy']);
  const b = new B(['abc', new Uint8Array([0x41, 0x42]), inner, new Uint16Array([0x4443]).buffer, new DataView(new Uint8Array([0x45]).buffer),
    12, null, undefined, {}, '\ud800é'], { type: 'Text/Plain;Charset=UTF-8' });
  const s = b.slice(1, -1, 'X/Y');
  const f = new F(['hello', inner], 'dir/a.txt', { type: 'TEXT/plain', lastModified: 42 });
  const fs = f.slice(0, 2);
  return {
    shape: [names(B.prototype), names(F.prototype), B.length, F.length, Object.getPrototypeOf(F) === B, tag(b), tag(f), String(b), tag(s)],
    empty: [new B().size, new B().type, new B([]).size, new B(undefined, undefined).size],
    parts: [b.size, b.type, await readAs(w, b), await readAs(w, b, 'ArrayBuffer'), await readAs(w, b, 'DataURL')],
    types: [new B([], { type: 'té' }).type, new B([], { type: 'a\x01' }).type, new B([], { type: ' A B ' }).type, new B([], { type: 5 }).type,
      new B([], { type: null }).type, new B([], null).type],
    endings: [await readAs(w, new B(['a\r\nb\rc\nd'], { endings: 'native' })), await readAs(w, new B(['a\r\nb'], { endings: 'transparent' })),
      await readAs(w, new B(['a\r\nb']))],
    iterables: [new B(new Set(['ab', 'c'])).size, new B((function* gen() { yield 'a'; yield new Uint8Array(2); }())).size],
    errors: [() => new B('abc'), () => new B(5), () => new B(null), () => new B([], 5), () => new B([], { endings: 'foo' }),
      () => new F(['a']), () => new F(), () => new F('ab', 'x'), () => new F([], 'x', 5), () => new F([Symbol('s')], 'x'),
      () => Object.getOwnPropertyDescriptor(B.prototype, 'size').get.call({}), () => B.prototype.slice.call({}),
      () => Object.getOwnPropertyDescriptor(F.prototype, 'name').get.call(new B())].map(attempt)
      .map((r) => (typeof r === 'string' ? r.replace(/'(get )?\w+' called on an object that is not a valid instance of (Blob|File)\./, 'Illegal invocation') : r)),
    slice: [s.size, s.type, await readAs(w, s), s instanceof B, s instanceof F],
    slices: [b.slice(-3).size, b.slice(100).size, b.slice(3, 1).size, b.slice().type, b.slice(0.5, 2.7).size, b.slice(1.5, 2.5).size,
      b.slice('1', '3').size, b.slice(undefined, 2).size, b.slice(NaN).size, b.slice(-Infinity, Infinity).size, b.slice(0, 1, 'Á').type,
      b.slice(0, 1, undefined).type, b.slice(0, 1, null).type, await readAs(w, b.slice(-4, -1))],
    file: [f.name, f.size, f.type, f.lastModified, f instanceof B, f instanceof F, await readAs(w, f), typeof f.webkitRelativePath,
      fs instanceof F, fs instanceof B, fs.name, fs.type],
    fileDefaults: (() => { const x = new F([], 'x'); return [Math.abs(x.lastModified - Date.now()) < 1000, x.type, x.size]; })(),
    lastModified: [new F([], 'x', { lastModified: '7' }).lastModified, new F([], 'x', { lastModified: 1.9 }).lastModified,
      new F([], 'x', { lastModified: -1.5 }).lastModified, new F([], 'x', { lastModified: NaN }).lastModified,
      new F([], 'x', { lastModified: Infinity }).lastModified, new F([], 'x', { lastModified: null }).lastModified],
    fileNames: [new F([], 5).name, new F([], null).name, [...new F([], 'a\ud800').name].map((c) => c.charCodeAt(0))],
    nested: [new B([f]).size, await readAs(w, new B([f, s]))],
    platformBlob: [new B([new Blob(['hi'])]).size],
  };
};
for (const jsdom of VERSIONS) parity(`Blob and File: construction, slice, File, FileReader (jsdom ${jsdom})`, blobScenario, { jsdom });

parity('Blob: text(), arrayBuffer() and bytes() (jsdom 30)', async (w) => {
  const b = new w.Blob(['hé', new Uint8Array([0xff]), '﻿x']);
  const ab = await b.arrayBuffer();
  const bytes = await b.bytes();
  return [typeof w.Blob.prototype.stream, await b.text(), ab.byteLength, [...new Uint8Array(ab)].join(','), bytes.length, [...bytes].join(','),
    await new w.Blob(['﻿a']).text(), await new w.Blob().text(), (await new w.Blob().arrayBuffer()).byteLength,
    await w.Blob.prototype.text.call({}).then(() => 'ok', (e) => e.constructor.name),
    await new w.File(['f'], 'n').text(), await b.slice(0, 1).text()];
});

parity('Blob and File: FormData entries and the file input (jsdom 30)', async (w) => {
  const d = html(w, '<form><input type=file name=f><input name=t value=x></form>');
  const fd = new w.FormData();
  const f = new w.File(['hello'], 'a.txt', { type: 'text/plain', lastModified: 42 });
  fd.append('a', new w.Blob(['x'], { type: 'text/plain' }));
  fd.append('b', f);
  fd.append('c', f, 'renamed.txt');
  fd.append('d', new w.Blob(['y']), 'given');
  fd.set('e', new w.Blob(['zz']));
  fd.append('n', new Blob(['platform']));
  const [a, b, c, dd, e] = ['a', 'b', 'c', 'd', 'e'].map((k) => fd.get(k));
  const formFile = new w.FormData(d.querySelector('form')).get('f');
  const input = d.querySelector('input[type=file]');
  return {
    a: [a instanceof w.File, a.name, a.type, a.size, Math.abs(a.lastModified - Date.now()) < 1000, await readAs(w, a)],
    b: [b === f, b.name],
    c: [c === f, c instanceof w.File, c.name, c.lastModified, c.type, await readAs(w, c)],
    d: [dd.name, dd.type], e: [e.name, e.size],
    platform: fd.get('n'),
    errors: [() => fd.append('x', 'str', 'name'), () => fd.set('x', {}, 'name')].map(attempt),
    formFile: [formFile instanceof w.File, formFile.name, formFile.type, formFile.size],
    files: [input.files instanceof w.FileList, input.files.length, input.files === input.files, tag(input.files)],
  };
});

// jsdom 30 (black box): a Blob of another window is a Blob for FormData,
// FileReader and new Blob(), and FormData makes its File in the blob's window.
test('Blob and File: blobs of another window', async () => {
  const w = createWindow({ url: 'http://localhost:3000/' });
  const other = createWindow({ url: 'http://localhost:3000/' });
  const foreign = new other.Blob(['abc'], { type: 'text/plain' });
  const fd = new w.FormData();
  fd.append('f', foreign);
  const entry = fd.get('f');
  assert.deepEqual([foreign instanceof w.Blob, new w.Blob([foreign]).size, await readAs(w, foreign), entry instanceof w.File, entry instanceof other.File, entry.name],
    [false, 3, 'abc', false, true, 'blob']);
});

test('Blob: text(), arrayBuffer() and bytes() from jsdom 28.1.0 (black box)', () => {
  const has = (jsdom) => ['text', 'arrayBuffer', 'bytes', 'stream'].map((m) => typeof createWindow({ jsdom }).Blob.prototype[m]).join(' ');
  assert.deepEqual(['20.0.3', '27.4.0', '28.0.0', '28.1.0', 28, 29, 30].map(has), [
    'undefined undefined undefined undefined', 'undefined undefined undefined undefined', 'undefined undefined undefined undefined',
    'function function function undefined', 'function function function undefined', 'function function function undefined', 'function function function undefined']);
});

test('Blob: arrayBuffer(), bytes() and text() give the realm of the window', async () => {
  const vm = await import('node:vm');
  const w = createWindow();
  const context = vm.createContext({});
  const { S } = await import('../src/internal.js');
  w[S].globalProxy = vm.runInContext('this', context);
  const realm = w[S].globalProxy;
  const b = new w.Blob(['ab']);
  assert.ok(b.text() instanceof realm.Promise);
  assert.ok((await b.arrayBuffer()) instanceof realm.ArrayBuffer);
  assert.ok((await b.bytes()) instanceof realm.Uint8Array);
  assert.ok(new w.TextEncoder().encode('a') instanceof realm.Uint8Array);
});

// --- TextEncoder and TextDecoder ---------------------------------------------------------------------

const LABELS = ['utf8', 'UTF-8', ' utf-8\n', 'unicode-1-1-utf-8', 'latin1', 'ascii', 'iso-8859-1', 'us-ascii', 'windows-1252', 'utf-16',
  'utf-16le', 'utf-16be', 'unicode', 'iso-8859-2', 'iso-8859-15', 'koi8-r', 'koi8-u', 'macintosh', 'windows-1251', 'windows-874',
  'x-mac-cyrillic', 'shift_jis', 'sjis', 'euc-jp', 'iso-2022-jp', 'gbk', 'gb2312', 'gb18030', 'big5', 'euc-kr', 'x-user-defined',
  'replacement', 'iso-2022-kr', 'hz-gb-2312', 'foo', '', 'utf-32', 'iso-8859-8-i', 'ibm866', 'windows-1258', 'x-cp1250'];
const codes = (s) => [...s].map((c) => c.codePointAt(0)).join(',');

const encodingScenario = (w) => {
  if (!w.TextEncoder) return [typeof w.TextEncoder, typeof w.TextDecoder, 'TextEncoder' in w];
  const te = new w.TextEncoder();
  const td = new w.TextDecoder();
  const d = (label, bytes, options) => attempt(() => codes(new w.TextDecoder(label, options).decode(new Uint8Array(bytes))));
  return {
    shape: [names(w.TextEncoder.prototype), names(w.TextDecoder.prototype), tag(te), tag(td), w.TextEncoder.length, w.TextDecoder.length],
    encode: [te.encoding, te.encode('a€\ud800'), te.encode().length, te.encode(undefined).length, te.encode(null).length, te.encode(5).length,
      new w.TextEncoder('utf-16').encoding].map((x) => attempt(() => x)),
    encodeInto: attempt(() => { const dest = new Uint8Array(4); const r = te.encodeInto('héllo', dest); return JSON.stringify([r, [...dest], Object.keys(r)]); }),
    encodeErrors: [() => te.encodeInto('a', new Uint16Array(2)), () => te.encodeInto('a'), () => te.encodeInto('a', [0]),
      () => w.TextEncoder.prototype.encode.call({}, 'a'), () => te.encode(Symbol('s'))].map(attempt)
      .map((r) => r.replace(/'\w+' called on an object that is not a valid instance of TextEncoder\./, 'Illegal invocation')),
    labels: LABELS.map((l) => attempt(() => new w.TextDecoder(l).encoding)).join(' '),
    options: [td.encoding, td.fatal, td.ignoreBOM, new w.TextDecoder('utf-8', { fatal: 1, ignoreBOM: 'x' }).fatal,
      new w.TextDecoder('utf-8', { fatal: 1, ignoreBOM: 'x' }).ignoreBOM, new w.TextDecoder(undefined, null).encoding],
    bom: [d('utf-8', [0xef, 0xbb, 0xbf, 0x61]), d('utf-8', [0xef, 0xbb, 0xbf, 0x61], { ignoreBOM: true }), d('utf-16le', [0xff, 0xfe, 0x61, 0]),
      d('utf-16be', [0, 0x61]), d('utf-16be', [0xfe, 0xff, 0, 0x61]), d('utf-8', [0xff, 0xfe, 0x61, 0])],
    decode: [d('utf-8', [0x61, 0xff, 0xc3]), d('utf-8', [0xff], { fatal: true }), d('utf-8', [0xe2, 0x82], { fatal: true }),
      d('windows-1252', [0x41, 0x80, 0x81, 0x9f, 0xa0, 0xe9, 0xff]), d('latin1', [0x80, 0xe9]), d('ascii', [0x80, 0x41]),
      d('x-user-defined', [0x41, 0x80, 0xff]), d('shift_jis', [0x82, 0xa0]), d('euc-kr', [0xb0, 0xa1]), d('big5', [0xa4, 0x40]),
      d('iso-8859-2', [0xa1]), d('windows-1251', [0x88]), d('koi8-r', [0xc1]), d('macintosh', [0x80]), d('iso-2022-jp', [0x1b, 0x24, 0x42, 0x24, 0x22, 0x1b, 0x28, 0x42]),
      d('gbk', [0xc4, 0xe3]), d('utf-16le', [0x00, 0xd8]), d('utf-16le', [0x61, 0, 0x62]), d('utf-16le', [0x61], { fatal: true }),
      d('utf-16le', [0x00, 0xd8], { fatal: true }), d('utf-16be', [0xd8, 0x00, 0x00, 0x61]), d('utf-16be', [0xd8, 0x3d, 0xde, 0x00, 0xd8]),
      d('utf-16be', [0xfe, 0xff, 0xfe, 0xff, 0, 0x61]), d('utf-16le', [0xff, 0xfe, 0x61, 0], { ignoreBOM: true }), d('utf-8', [0xed, 0xa0, 0x80]),
      d('windows-1253', [0xaa]), d('windows-1253', [0x41, 0xaa], { fatal: true }), d('koi8-u', [0xae]), d('windows-874', [0xdb]),
      d('iso-8859-8', [0xff]), d('ibm866', [0xff]), d('windows-1253', [0xef, 0xbb, 0xbf, 0x41]), d('shift_jis', [0xff], { fatal: true }),
      d('gb18030', [0x81, 0x30, 0x81, 0x30]), d('euc-jp', [0x8e, 0xa1]), d('iso-2022-jp', [0x1b, 0x28, 0x4a, 0x5c])],
    sources: attempt(() => [td.decode(), td.decode(undefined), td.decode(new Uint8Array([0x61]).buffer), td.decode(new DataView(new Uint8Array([0x62]).buffer)),
      td.decode(new Uint16Array([0x6463])), td.decode(new Uint8Array(new SharedArrayBuffer(1)))].map(codes).join('|')),
    decodeErrors: [() => td.decode(null), () => td.decode('abc'), () => td.decode([0x61]), () => td.decode(new Uint8Array(1), 5),
      () => new w.TextDecoder('foo'), () => new w.TextDecoder('replacement'), () => new w.TextDecoder('utf-8', 5),
      () => w.TextDecoder.prototype.decode.call({}, new Uint8Array(1)), () => Object.getOwnPropertyDescriptor(w.TextDecoder.prototype, 'encoding').get.call({}),
      () => new w.TextDecoder('foo', 5)].map(attempt)
      .map((r) => r.replace(/'(get )?\w+' called on an object that is not a valid instance of TextDecoder\./, 'Illegal invocation')),
    stream: attempt(() => {
      const s = new w.TextDecoder();
      return [s.decode(new Uint8Array([0xe2, 0x82]), { stream: true }), s.decode(new Uint8Array([0xac]), { stream: true }), s.decode(new Uint8Array([0xe2])), s.decode()].map(codes).join('|');
    }),
    stream16: attempt(() => {
      const s = new w.TextDecoder('utf-16le');
      return [s.decode(new Uint8Array([0x61]), { stream: true }), s.decode(new Uint8Array([0x00, 0x3d]), { stream: true }), s.decode(new Uint8Array([0xd8, 0x00]), { stream: true }),
        s.decode(new Uint8Array([0xde])), s.decode(new Uint8Array([0xff]), { stream: true }), s.decode(new Uint8Array([0xfe, 0x61, 0])), s.decode(new Uint8Array([0xff, 0xfe, 0x62, 0]))].map(codes).join('|');
    }),
    stream16Fatal: attempt(() => { const s = new w.TextDecoder('utf-16le', { fatal: true }); s.decode(new Uint8Array([0x00, 0xd8]), { stream: true }); return s.decode(); }),
    streamBom: attempt(() => {
      const s = new w.TextDecoder();
      return [s.decode(new Uint8Array([0xef, 0xbb]), { stream: true }), s.decode(new Uint8Array([0xbf, 0x41]), { stream: true }), s.decode(new Uint8Array([0xef, 0xbb, 0xbf, 0x42]))].map(codes).join('|');
    }),
  };
};
for (const jsdom of VERSIONS) parity(`TextEncoder and TextDecoder (jsdom ${jsdom})`, encodingScenario, { jsdom });

test('TextEncoder and TextDecoder: from jsdom 27.4.0 (black box)', () => {
  const has = (jsdom) => { const w = createWindow({ jsdom }); return [typeof w.TextEncoder, typeof w.TextDecoder, 'TextEncoder' in w].join(' '); };
  assert.deepEqual(['26.1.0', '27.0.0', '27.3.0', '27.4.0', 27, 28, 30].map(has), [
    'undefined undefined false', 'undefined undefined false', 'undefined undefined false', 'function function true', 'function function true',
    'function function true', 'function function true']);
});

// --- URL and URLSearchParams -------------------------------------------------------------------------

// jsdom's interfaces are classes and name the member in "Illegal invocation"
// errors; warpdom's interfaces throw their own words for both (as for every
// interface).
const sameWords = (r) => (typeof r === 'string'
  ? r.replace(/'(get |set )?\w+' called on an object that is not a valid instance of \w+\./, 'Illegal invocation')
    .replace(/Class constructor (\w+) cannot be invoked without 'new'/, "Failed to construct '$1': Please use the 'new' operator.")
  : r);
const tries = (fns) => fns.map(attempt).map(sameWords);
const descriptor = (o, k) => {
  const d = Object.getOwnPropertyDescriptor(o, k);
  return d ? `${'value' in d ? 'v' : `${d.get ? 'g' : ''}${d.set ? 's' : ''}`}${d.writable ? 'w' : ''}${d.enumerable ? 'e' : ''}${d.configurable ? 'c' : ''}` : '-';
};

const urlScenario = (w) => {
  const { URL: U, URLSearchParams: P } = w;
  const u = new U('HTTP://User:Pa@Example.com:80/a/../b?x=1 2#h');
  const parts = () => [u.href, u.origin, u.protocol, u.username, u.password, u.host, u.hostname, u.port, u.pathname, u.search, u.hash, String(u), u.toJSON()].join('|');
  const out = {
    shape: [names(U.prototype), names(U), U.length, tag(u), tag(U.prototype), typeof U.createObjectURL, typeof U.revokeObjectURL, 'createObjectURL' in U,
      ['href', 'origin', 'searchParams', 'toString', 'toJSON'].map((k) => descriptor(U.prototype, k)).join(), descriptor(w, 'URL'),
      w.webkitURL === U, new U('http://a/') instanceof U, Object.getPrototypeOf(U.prototype) === Object.prototype,
      ['href', 'port', 'hash'].map((k) => { const d = Object.getOwnPropertyDescriptor(U.prototype, k); return `${d.get.name}/${d.set.name}`; }).join()],
    parts: parts(),
    json: [JSON.stringify({ u }), Object.keys(u).length],
    searchParams: [u.searchParams === u.searchParams, u.searchParams instanceof P, u.searchParams.get('x'), tag(u.searchParams)],
  };
  u.searchParams.append('y', 'a b');
  out.linked = [u.href];
  u.search = '?z=3';
  out.linked.push(u.searchParams.toString());
  const sp = u.searchParams;
  u.href = 'http://b/?c=2';
  out.linked.push(sp.toString(), u.searchParams === sp);
  u.searchParams.delete('c');
  out.linked.push(u.href, u.search);
  out.setters = attempt(() => {
    const x = new U('http://a/');
    x.port = '99999'; x.protocol = 'https'; x.hostname = 'b'; x.hash = 'q'; x.username = 'u@'; x.pathname = '/p q'; x.port = 'x';
    const ports = [x.port];
    x.port = 99;
    return [x.href, ...ports, x.port];
  });
  out.parsing = [() => new U('/q', new U('http://base/')).href, () => new U('http://[::1]:8080/').host, () => new U('http://ñ.com').hostname,
    () => new U('file:///C:/a/../b').href, () => new U('blob:http://a.com/uuid').origin, () => new U('  http://a/  \n').href,
    () => new U('', 'http://a/b').href, () => new U('http://a/', undefined).href, () => new U('http://a/b c?d e#f g').href,
    () => new U('HTTPS://EXAMPLE.org:443/./x/%2e%2E/y').href, () => new U('mailto:x@y').pathname, () => new U('http://1.2.3/').host].map(attempt);
  out.errors = tries([() => new U('foo'), () => new U('/x', 'bad'), () => new U('x', null), () => new U(''), () => U('http://a'), () => new U(),
    () => { new U('http://a/').href = 'nope'; }, () => Object.getOwnPropertyDescriptor(U.prototype, 'href').get.call({}), () => new U(Symbol('s')),
    () => new U('http://a', Symbol('s')), () => { new U('http://a/').href = Symbol('s'); }, () => { new U('http://a/').pathname = Symbol('s'); }]);
  if (typeof U.parse === 'function') {
    out.parse = [U.parse('nope'), U.parse('/a', 'http://b/')?.href, U.canParse('x'), U.canParse('http://x'), U.canParse('/a', 'http://b'),
      U.parse('/a', 'bad'), U.canParse('/a', 'bad'), descriptor(U, 'parse'), descriptor(U, 'canParse'), U.parse.length, U.canParse.length];
    out.parseErrors = tries([() => U.parse(), () => U.canParse(), () => U.parse(Symbol('s'))]);
  }
  return out;
};
for (const jsdom of VERSIONS) parity(`URL: parsing, components, searchParams, errors (jsdom ${jsdom})`, urlScenario, { jsdom });

const paramsScenario = (w) => {
  const P = w.URLSearchParams;
  const p = new P('b=2&a=1&a=0&c=%20+x');
  const out = {
    shape: [names(P.prototype), P.length, tag(p), tag(p.entries()), P.prototype[Symbol.iterator] === P.prototype.entries,
      ['append', 'size', Symbol.iterator, Symbol.toStringTag].map((k) => descriptor(P.prototype, k)).join(), descriptor(w, 'URLSearchParams')],
    inits: [new P('?a=1&b=2&a=3'), new P({ a: '1', b: 2 }), new P([['a', '1'], ['b', '2']]), new P(new P('c=1')), new P(new Map([['m', 'n']])), new P(''),
      new P(undefined), new P(null), new P(5), new P(Object.create({ inherited: 1 })), new P(Object.defineProperty({ k: 'v' }, Symbol('hidden'), { value: 1 })),
      new P('a=%zz&b=%E2%82%AC&+=+&=x&y'), new P('\ud800=\udc00'), new P({ '\ud835x': '1', '\ud83dx': '2', y: '\udc00' })].map(String),
    read: [p.get('a'), p.getAll('a').join(), p.has('a'), p.get('zz'), p.get('c'), p.has('a', '0'), p.has('a', 'zzz'), p.has('a', undefined)],
    size: 'size' in p ? p.size : 'none',
    special: [...new P('=x&y&a=b=c')].join(';'),
  };
  p.delete('a', '1');
  out.deleteValue = p.toString();
  p.sort();
  out.sorted = p.toString();
  p.set('b', 'x&y=ü');
  p.append('d', 'é é');
  out.set = p.toString();
  const it = p.entries();
  out.iterate = [JSON.stringify(it.next()), [...p.keys()].join(), [...p.values()].join(), JSON.stringify([...p])];
  const seen = [];
  p.forEach(function each(v, k, o) { seen.push(`${k}=${v} ${o === p} ${this}`); }, 'T');
  out.forEach = seen;
  out.live = (() => { const q = new P('a=1&b=2&c=3'); const i = q.keys(); const first = i.next().value; q.delete('b'); q.append('d', '4'); return [first, ...i].join(); })();
  out.errors = tries([() => new P([['a']]), () => new P([1]), () => new P({ [Symbol('s')]: 1 }), () => new P({ a: Symbol('s') }), () => new P([[Symbol('s'), 'a']]),
    () => new P(Symbol('s')), () => P(), () => new P().append('a'), () => new P().get(), () => new P().getAll(), () => new P().has(),
    () => new P().delete(), () => new P().set('a'), () => P.prototype.get.call({}, 'a'), () => new P().forEach(), () => new P().forEach(1),
    () => new P([['a', 'b', 'c']]), () => new P(['ab']), () => new P({ [Symbol.iterator]: undefined, k: 'v' })]);
  return out;
};
for (const jsdom of VERSIONS) parity(`URLSearchParams: inits, reads, sort, iteration, errors (jsdom ${jsdom})`, paramsScenario, { jsdom });

test('URL and URLSearchParams: URL.parse(), canParse(), size and has()/delete() values from jsdom 23.0.0 (black box)', () => {
  const at = (jsdom) => {
    const w = createWindow({ jsdom });
    const p = new w.URLSearchParams('a=1&a=2');
    const has = p.has('a', 'z');
    p.delete('a', '1');
    return [typeof w.URL.parse, typeof w.URL.canParse, 'size' in p, has, p.toString()].join(' ');
  };
  assert.deepEqual(['20.0.0', '22.0.0', '22.1.0', '23.0.0', 23, 26, 30].map(at), [
    'undefined undefined false true ', 'undefined undefined false true ', 'undefined undefined false true ',
    'function function true false a=2', 'function function true false a=2', 'function function true false a=2', 'function function true false a=2']);
});

// jsdom's URL never has createObjectURL() (20.0.0 to 30.1.3, black box);
// tests stub it. Each window has its own URL, so a stub stays in its window.
test('URL: no createObjectURL() in any jsdom version; each window has its own URL', () => {
  for (const jsdom of ['20.0.0', '24.1.0', '27.4.0', '30.1.3']) {
    const w = createWindow({ jsdom });
    assert.deepEqual([typeof w.URL.createObjectURL, typeof w.URL.revokeObjectURL], ['undefined', 'undefined'], jsdom);
  }
  const a = createWindow();
  const b = createWindow();
  a.URL.createObjectURL = () => 'blob:stub';
  a.URL.prototype.extra = 1;
  assert.equal(b.URL.createObjectURL, undefined);
  assert.equal('extra' in new b.URL('http://x/'), false);
  assert.equal(URL.createObjectURL === a.URL.createObjectURL, false);
  assert.notEqual(a.URL, b.URL);
  assert.ok(!(new a.URL('http://x/') instanceof b.URL));
  assert.ok(!(new a.URL('http://x/') instanceof URL));
});

// jsdom before 30 takes any @@iterator property for a sequence (null too)
// and throws V8's spread error; jsdom 30 converts as WebIDL (black box,
// 29.1.1 and 30.0.0).
test('URLSearchParams and Headers: an init whose @@iterator is not callable (jsdom 29 and 30)', () => {
  const at = (jsdom) => {
    const w = createWindow({ jsdom });
    return [() => new w.URLSearchParams({ [Symbol.iterator]: 5 }), () => new w.URLSearchParams({ [Symbol.iterator]: null, a: 1 }),
      () => new w.Headers({ [Symbol.iterator]: 1 })].map(attempt);
  };
  assert.deepEqual(at('29.1.1'), ['TypeError/TypeError: tmp is not iterable (undefined)', 'TypeError/TypeError: tmp is not iterable (undefined)',
    'TypeError/TypeError: tmp is not iterable (undefined)']);
  assert.deepEqual(at('30.0.0'), ['TypeError/TypeError: Cannot convert a Symbol value to a string (undefined)',
    "TypeError/TypeError: Failed to construct 'URLSearchParams': parameter 1 record's key is a symbol, which cannot be converted to a string. (undefined)",
    'TypeError/TypeError: Cannot convert a Symbol value to a string (undefined)']);
});

// --- Headers -----------------------------------------------------------------------------------------

const headersScenario = (w) => {
  const H = w.Headers;
  const all = (h) => JSON.stringify([...h]);
  const h = new H();
  h.append('b', '1'); h.append('a', '2'); h.append('B', '3'); h.append('set-cookie', 'x'); h.append('Set-Cookie', 'y'); h.append('c', '');
  const out = {
    shape: [names(H.prototype), H.length, tag(h), tag(h.entries()), H.prototype[Symbol.iterator] === H.prototype.entries,
      ['append', 'get', Symbol.iterator, Symbol.toStringTag].map((k) => descriptor(H.prototype, k)).join(), descriptor(w, 'Headers'),
      ['append', 'entries', 'forEach', 'getSetCookie'].filter((k) => H.prototype[k]).map((k) => `${k}/${H.prototype[k].length}/${H.prototype[k].name}`).join(),
      String(new H()), JSON.stringify(new H({ a: '1' }))],
    list: [all(h), h.get('b'), h.get('set-cookie'), JSON.stringify(h.get('c')), h.get('nope'), h.has('SET-COOKIE'),
      typeof h.getSetCookie === 'function' ? JSON.stringify(h.getSetCookie()) : 'none'],
    names: ['a', 'A-b', 'a b', '', 'é', 'a:b', 'a\tb', "!#$%&'*+-.^_`|~", 'a(b', 'a"b', 'x\u0100'].map((n) => attempt(() => { const x = new H(); x.append(n, 'v'); return all(x); })),
    values: ['v', ' v ', '\tv\t', '\nv\r\n', 'a\nb', 'a\rb', 'a\0b', 'a\u0100', 'é', 'a\u0007b', '', ' ', 'a  b', 'x\u000bv'].map((v) => attempt(() => { const x = new H(); x.append('n', v); return [all(x), x.get('n')].join(' '); })),
    inits: [() => all(new H({ a: 1, B: null })), () => all(new H([])), () => all(new H(new Map([['m', 'n']])) ), () => all(new H([['a', 'x'], ['A', 'y']])),
      () => all(new H([['set-cookie', 'a'], ['set-cookie', 'b']])), () => { const a = new H([['set-cookie', 'a'], ['set-cookie', 'b'], ['x', '1']]); a.append('x', '2'); return all(new H(a)); },
      () => all(new H({ 'Content-Length': '5', Host: 'h', Connection: 'c', Cookie: 'k' })), () => all(new H(undefined))].map(attempt),
    errors: tries([() => new H(null), () => new H([['a', 1, 2]]), () => new H([[]]), () => new H(5), () => new H('str'), () => new H({ 'a b': 'x' }),
      () => new H([['x\u0100', 'v']]), () => new H({ 'x\u0100': 'v' }), () => new H({ x: 'v\u0100' }), () => new H([5]), () => new H({ a: Symbol('s') }),
      () => new H({ [Symbol('s')]: 'a' }), () => new H().get('a b'), () => new H().has('a b'), () => new H().delete('a b'), () => new H().has(),
      () => new H().set('a'), () => new H().delete(), () => new H().append(), () => new H().get(), () => H(), () => H.prototype.get.call({}, 'a'),
      () => H.prototype.entries.call({}), () => new H().forEach(), () => new H({ a: '1' }).forEach(5), () => new H().set('a', 'x\ny'),
      () => new H({ get a() { throw new Error('getter'); } })]),
  };
  h.set('b', 'z');
  h.set('X-New', ' trimmed\t');
  out.set = [all(h), JSON.stringify(h.get('x-new'))];
  h.delete('B');
  out.deleted = all(h);
  const it = h.keys();
  const first = it.next().value;
  h.append('0', 'zero');
  h.delete('c');
  out.live = [first, JSON.stringify([...it])];
  const each = [];
  new H({ a: '1', b: '2' }).forEach(function cb(v, k, o) { each.push(`${k}=${v} ${o instanceof H} ${this}`); }, 'T');
  out.forEach = each;
  out.iteratorDone = (() => { const i = new H({ a: '1' }).values(); return JSON.stringify([i.next(), i.next(), i.next()]); })();
  out.setCookie = (() => { const a = new H([['set-cookie', 'a'], ['set-cookie', 'b']]); a.set('Set-Cookie', 'c'); const s = all(a); a.delete('set-cookie'); return [s, all(a)]; })();
  return out;
};
for (const jsdom of VERSIONS) parity(`Headers: names, values, inits, sort and combine, errors (jsdom ${jsdom})`, headersScenario, { jsdom });

test('Headers: getSetCookie() and separate Set-Cookie values from jsdom 24.1.0 (black box)', () => {
  const at = (jsdom) => {
    const w = createWindow({ jsdom });
    const h = new w.Headers([['set-cookie', 'a'], ['set-cookie', 'b']]);
    return [typeof h.getSetCookie, JSON.stringify([...h])].join(' ');
  };
  assert.deepEqual(['20.0.0', '24.0.0', '24.1.0', '24.1.3', 25, 30].map(at), [
    'undefined [["set-cookie","a, b"]]', 'undefined [["set-cookie","a, b"]]', 'function [["set-cookie","a"],["set-cookie","b"]]',
    'function [["set-cookie","a"],["set-cookie","b"]]', 'function [["set-cookie","a"],["set-cookie","b"]]', 'function [["set-cookie","a"],["set-cookie","b"]]']);
});

// --- console and WebAssembly -------------------------------------------------------------------------

const CONSOLE_METHODS = ['assert', 'clear', 'count', 'countReset', 'debug', 'dir', 'dirxml', 'error', 'group', 'groupCollapsed', 'groupEnd',
  'info', 'log', 'table', 'time', 'timeLog', 'timeEnd', 'trace', 'warn'];

// jsdom's default virtual console sends each call, with its arguments, to
// Node's console (black box, 20.0.0 to 30.1.3).
const consoleScenario = (w) => {
  const c = w.console;
  const calls = [];
  const saved = {};
  for (const m of CONSOLE_METHODS) {
    saved[m] = console[m];
    console[m] = function spy(...args) { calls.push(`${m}(${args.map((a) => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(',')})${this === console ? '' : ' this?'}`); };
  }
  try {
    c.log('a', 1, { b: 2 }); c.count(); c.count('x'); c.countReset('x'); c.assert(false, 'msg'); c.assert(true, 'no'); c.time('t'); c.timeEnd('t');
    c.timeLog('nope'); c.group('g'); c.groupCollapsed(); c.groupEnd(); c.table([1]); c.dir({ d: 1 }, { depth: 0 }); c.trace('tr'); c.clear(); c.error('e');
    c.warn('w'); c.info('i'); c.debug('d');
    const { log } = c;
    log('detached');
  } finally {
    for (const m of CONSOLE_METHODS) console[m] = saved[m];
  }
  const d = Object.getOwnPropertyDescriptor(c, 'log');
  return {
    shape: [Reflect.ownKeys(c).join(), tag(c), Object.getPrototypeOf(c) === Object.prototype, c === w.console, typeof c,
      [d.writable, d.enumerable, d.configurable, c.log.name, c.log.length, 'prototype' in c.log].join()],
    calls,
    assign: (() => { const original = w.console; w.console = 1; const replaced = w.console; w.console = original; return [replaced, w.console === original]; })(),
  };
};
parity('console: the methods send their arguments to Node\'s console (jsdom 30)', consoleScenario);
parity('console: the methods send their arguments to Node\'s console (jsdom 20)', consoleScenario, { jsdom: 20 });

// Read first: warpdom makes the console on first read (an accessor until then).
const windowGlobalsScenario = (w) => ['console', 'WebAssembly'].map((k) => [k, typeof w[k], descriptor(w, k), Object.keys(w).includes(k)].join(' '));
for (const jsdom of VERSIONS) parity(`console and WebAssembly: own properties of the window (jsdom ${jsdom})`, windowGlobalsScenario, { jsdom });

test('console: enumerable before jsdom 27.0.0 (black box: 26.1.0 is, 27.0.0 is not)', () => {
  const enumerable = (jsdom) => { const w = createWindow({ jsdom }); w.console; return Object.getOwnPropertyDescriptor(w, 'console').enumerable; };
  assert.deepEqual(['20.0.0', '26.1.0', '27.0.0', 30].map(enumerable), [true, true, false, false]);
});

test('console: sends to the console the environment gives, also from frames; never to itself', () => {
  const w = createWindow({ url: 'http://localhost:3000/' });
  const calls = [];
  const target = { log: (...args) => calls.push(['log', ...args]), count(label) { calls.push(['count', label, this === target]); } };
  w[S].consoleTarget = target;
  w.console.log('a', 1);
  w.console.count('c');
  w.console.table([1]); // the target has no table(): nothing happens
  w.document.body.innerHTML = '<iframe></iframe>';
  const frame = w.document.querySelector('iframe').contentWindow;
  assert.notEqual(frame.console, w.console);
  frame.console.log('from frame');
  assert.deepEqual(calls, [['log', 'a', 1], ['count', 'c', true], ['log', 'from frame']]);
  // A console that would send to itself sends to the platform's instead.
  const other = createWindow();
  other[S].consoleTarget = other.console;
  const original = console.info;
  let got;
  console.info = (x) => { got = x; };
  try { other.console.info('platform'); } finally { console.info = original; }
  assert.equal(got, 'platform');
});

// Under Jest and Vitest's VM pools the global's own WebAssembly is the
// test file's realm's (installWindow leaves it); frames made there get it.
test('WebAssembly: the realm\'s namespace; a frame\'s is its top-level window\'s realm\'s', async () => {
  const vm = await import('node:vm');
  const w = createWindow();
  assert.equal(w.WebAssembly, WebAssembly);
  assert.deepEqual(Object.getOwnPropertyDescriptor(w, 'WebAssembly'), { value: WebAssembly, writable: true, enumerable: false, configurable: true });
  const realmWindow = createWindow();
  const context = vm.createContext({});
  realmWindow[S].globalProxy = vm.runInContext('this', context);
  const realmWebAssembly = vm.runInContext('WebAssembly', context);
  realmWindow.document.body.innerHTML = '<iframe></iframe>';
  assert.equal(realmWindow.document.querySelector('iframe').contentWindow.WebAssembly, realmWebAssembly);
  assert.equal(tag(w.WebAssembly), '[object WebAssembly]');
  assert.equal(new w.WebAssembly.Module(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0])) instanceof WebAssembly.Module, true);
});

// --- WebSocket ---------------------------------------------------------------------------------------
// jsdom's window has WebSocket in every version (black box, 20.0.0 to
// 30.1.3, with and without runScripts): an own data property, writable,
// not enumerable, configurable, that a test can replace or delete;
// CloseEvent and MessageEvent exist too. warpdom's is the platform's
// WebSocket (Node's), made on first read.
const webSocketScenario = (w) => {
  const WS = w.WebSocket;
  const out = [typeof WS, descriptor(w, 'WebSocket'), Object.keys(w).includes('WebSocket'), 'WebSocket' in w, WS.name,
    [WS.CONNECTING, WS.OPEN, WS.CLOSING, WS.CLOSED].join(), typeof WS.prototype.send, typeof WS.prototype.close,
    typeof w.CloseEvent, typeof w.MessageEvent];
  const Mock = function Mock() {};
  w.WebSocket = Mock;
  out.push(w.WebSocket === Mock, descriptor(w, 'WebSocket'));
  out.push(delete w.WebSocket, 'WebSocket' in w);
  return out;
};
for (const jsdom of VERSIONS) parity(`WebSocket: an own property of the window, replaceable (jsdom ${jsdom})`, webSocketScenario, { jsdom });

test('WebSocket: the platform\'s, also in frames; made on first read', () => {
  const w = createWindow({ url: 'http://localhost:3000/' });
  assert.equal(typeof Object.getOwnPropertyDescriptor(w, 'WebSocket').get, 'function');
  assert.equal(w.WebSocket, globalThis.WebSocket);
  assert.deepEqual(Object.getOwnPropertyDescriptor(w, 'WebSocket'), { value: globalThis.WebSocket, writable: true, enumerable: false, configurable: true });
  w.document.body.innerHTML = '<iframe></iframe>';
  assert.equal(w.document.querySelector('iframe').contentWindow.WebSocket, globalThis.WebSocket);
  // Assigned before the first read: the window keeps the assigned value.
  const other = createWindow();
  const Mock = class {};
  other.WebSocket = Mock;
  assert.deepEqual(Object.getOwnPropertyDescriptor(other, 'WebSocket'), { value: Mock, writable: true, enumerable: false, configurable: true });
  assert.equal(createWindow().WebSocket, globalThis.WebSocket);
});

// No connection: the prototype chain shows whose EventTarget sockets are
// (and so whose events they dispatch).
test('WebSocket: sockets are the platform\'s EventTargets, not the window\'s', () => {
  const w = createWindow();
  assert.equal(w.WebSocket.prototype instanceof w.EventTarget, false);
  assert.equal(w.WebSocket.prototype instanceof EventTarget, true);
});

// --- the per-file reset ------------------------------------------------------------------------------

test('reset: crypto and performance keep their objects and lose added properties', () => {
  const w = createWindow({ url: 'http://localhost:3000/' });
  const { crypto, performance } = w;
  snapshotWindow(w);
  crypto.randomUUID = () => 'mock';
  performance.now = () => 1;
  w.Crypto.prototype.extra = 1;
  resetWindow(w);
  assert.equal(w.crypto, crypto);
  assert.equal(w.performance, performance);
  assert.notEqual(w.crypto.randomUUID(), 'mock');
  assert.notEqual(w.performance.now(), 1);
  assert.equal('extra' in w.Crypto.prototype, false);
});

test('reset: a replaced WebSocket is the platform\'s again', () => {
  for (const readFirst of [false, true]) {
    const w = createWindow({ url: 'http://localhost:3000/' });
    if (readFirst) assert.equal(w.WebSocket, globalThis.WebSocket);
    snapshotWindow(w);
    w.WebSocket = class Mock {};
    resetWindow(w);
    assert.equal(w.WebSocket, globalThis.WebSocket, `read before the snapshot: ${readFirst}`);
    delete w.WebSocket;
    resetWindow(w);
    assert.equal(w.WebSocket, globalThis.WebSocket);
  }
});

test('reset: the console keeps its object and gets back its methods', () => {
  const w = createWindow({ url: 'http://localhost:3000/' });
  const { console: c } = w;
  const log = c.log;
  snapshotWindow(w);
  c.log = () => 'mock';
  c.extra = 1;
  w.console = 'replaced';
  resetWindow(w);
  assert.equal(w.console, c);
  assert.equal(w.console.log, log);
  assert.equal('extra' in c, false);
});

test('window creation does not create the new interfaces', () => {
  const w = createWindow();
  for (const name of ['Crypto', 'Performance', 'Blob', 'File', 'TextEncoder', 'TextDecoder', 'URL', 'URLSearchParams', 'Headers', 'console', 'WebSocket']) {
    assert.equal(typeof Object.getOwnPropertyDescriptor(w, name)?.get, 'function', `${name} is still lazy`);
  }
});
