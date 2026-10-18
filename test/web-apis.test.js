// window.crypto, window.performance, Blob and File, TextEncoder and
// TextDecoder: parity with jsdom (20, 22, 25, 26, 30), and the version
// boundaries measured on jsdom releases (black box: 21.1.2 / 22.0.0 have no
// crypto.randomUUID, 22.1.0 has; 27.3.0 has no TextEncoder, 27.4.0 has;
// 28.0.0 has no Blob text(), 28.1.0 has).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWindow } from '../src/node.js';
import { snapshotWindow, resetWindow } from '../src/reset.js';
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

test('window creation does not create the new interfaces', () => {
  const w = createWindow();
  for (const name of ['Crypto', 'Performance', 'Blob', 'File', 'TextEncoder', 'TextDecoder']) {
    assert.equal(typeof Object.getOwnPropertyDescriptor(w, name)?.get, 'function', `${name} is still lazy`);
  }
});
