// The File API: Blob and File (3 and 4), FileReader (7), and ProgressEvent
// (XMLHttpRequest standard, 4.7).
//
// Blob and File are warpdom's own interfaces, not the platform's Blob: each
// window has its own prototypes (x instanceof window.Blob, and members that
// differ by jsdom version), and FormData, FileReader and new Blob([blob])
// read a blob's bytes synchronously, which the platform's Blob does not
// offer. A blob's bytes are an immutable Uint8Array; slices share it.
//
// FileReader reads a Blob as an ArrayBuffer, text, a binary string or a
// data URL. Unlike jsdom, it also reads the platform's
// Blobs (a fetch Response's blob() in Vitest, where fetch is Node's). The
// read takes the blob's bytes in one chunk, so it fires loadstart, one
// progress (none for an empty blob), then load (or error) and loadend,
// each in its own task.
import { S, state, domError, hiddenSlot, hooks, PLATFORM_GLOBAL } from './internal.js';
import { dispatch, eventConstruct, fieldGetters } from './events.js';
import { handlerMembers } from './event-handlers.js';
import { decodeText, bufferBytes, realmOf, webidlString, utf8Encode, PlatformTextDecoder } from './encoding.js';

// --- Blob and File ------------------------------------------------------------------------------

const BLOB = Symbol('blob');
const BLOB_SLOT = hiddenSlot().descriptor; // invisible to reflection, as S (internal.js)

const NO_BYTES = new Uint8Array(0);

// A blob's data ({ window, bytes, type, name, lastModified }; name and
// lastModified for Files only), or undefined for other values. Blobs of any
// warpdom window count.
export function blobData(value) {
  return value !== null && (typeof value === 'object' || typeof value === 'function') ? value[BLOB] : undefined;
}

const data = (self) => {
  const d = blobData(self);
  if (d === undefined) throw new TypeError('Illegal invocation');
  return d;
};

// A new Blob or File of the window with these bytes (not copied).
export function makeBlob(window, bytes, type) {
  const blob = Object.create(window[S].protos.Blob);
  blob[BLOB] = { window, bytes, type, name: undefined, lastModified: 0 };
  return blob;
}

export function makeFile(window, bytes, name, type, lastModified) {
  const file = Object.create(window[S].protos.File);
  file[BLOB] = { window, bytes, type, name, lastModified };
  return file;
}

// A blob type: lowercased, or '' if it has a character outside U+0020 to
// U+007E.
const blobType = (value) => {
  const s = String(value);
  return /[^\x20-\x7e]/.test(s) ? '' : s.toLowerCase();
};

const NATIVE_NEWLINE = globalThis.process?.platform === 'win32' ? '\r\n' : '\n';

// The blob parts (a sequence of BufferSource, Blob or USVString): bytes,
// or strings, which become bytes once the options (endings) are known.
function convertParts(parts, iface) {
  const method = parts === null || (typeof parts !== 'object' && typeof parts !== 'function') ? undefined : parts[Symbol.iterator];
  if (typeof method !== 'function') throw new TypeError(`Failed to construct '${iface}': parameter 1 is not an iterable object.`);
  const out = [];
  // The iterator method is read once (WebIDL sequence conversion).
  for (const part of { [Symbol.iterator]: () => method.call(parts) }) {
    const blob = blobData(part);
    if (blob !== undefined) { out.push(blob.bytes); continue; }
    const view = bufferBytes(part);
    out.push(view !== null ? view.slice() : webidlString(part, "parameter 1's element", `Failed to construct '${iface}'`));
  }
  return out;
}

function blobOptions(options, iface) {
  if (options === undefined || options === null) return { endings: 'transparent', type: '' };
  if (typeof options !== 'object' && typeof options !== 'function') throw new TypeError(`Failed to construct '${iface}': parameter ${iface === 'File' ? 3 : 2} is not an object.`);
  const { endings: e } = options;
  const endings = e === undefined ? 'transparent' : String(e);
  if (endings !== 'transparent' && endings !== 'native') {
    throw new TypeError(`Failed to construct '${iface}': parameter ${iface === 'File' ? 3 : 2} has member 'endings' that '${endings}' is not a valid enumeration value for EndingType`);
  }
  const { type } = options;
  return { endings, type: type === undefined ? '' : blobType(type) };
}

// Process blob parts (File API 3.1.2): the bytes of all parts in order.
function processParts(parts, endings) {
  if (parts.length === 0) return NO_BYTES;
  const chunks = parts.map((part) => {
    if (typeof part !== 'string') return part;
    return utf8Encode(endings === 'native' ? part.replace(/\r\n|\r|\n/g, NATIVE_NEWLINE) : part);
  });
  if (chunks.length === 1) return chunks[0];
  let size = 0;
  for (const c of chunks) size += c.length;
  const bytes = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) { bytes.set(c, at); at += c.length; }
  return bytes;
}

// WebIDL [Clamp] long long (slice's start and end).
const MAX_SAFE = Number.MAX_SAFE_INTEGER;
function clampLongLong(value) {
  let x = Number(value);
  if (Number.isNaN(x)) return 0;
  x = Math.min(Math.max(x, -MAX_SAFE), MAX_SAFE);
  let r = Math.round(x);
  if (Math.abs(x % 1) === 0.5 && r % 2 !== 0) r -= 1; // ties to even
  return r + 0;
}

// WebIDL long long (File's lastModified): truncated; NaN and infinities are 0.
function longLong(value) {
  const x = Number(value);
  return Number.isFinite(x) ? Math.trunc(x) + 0 : 0;
}

// Blob.text(), arrayBuffer() and bytes(): a promise of the window's realm;
// a TypeError rejects it for another this, as WebIDL has it.
function read(self, package_) {
  const d = blobData(self);
  if (d === undefined) return Promise.reject(new TypeError('Illegal invocation'));
  const P = realmOf(d.window).Promise;
  return P.resolve(package_(d));
}

let utf8Decoder = null;

export const BLOB_INTERFACES = [
  {
    name: 'Blob',
    slot: [BLOB, BLOB_SLOT],
    construct: (window, self, [parts = undefined, options = undefined]) => {
      const converted = parts === undefined ? [] : convertParts(parts, 'Blob');
      const { endings, type } = blobOptions(options, 'Blob');
      self[BLOB] = { window, bytes: processParts(converted, endings), type, name: undefined, lastModified: 0 };
      return self;
    },
    members: {
      get size() { return data(this).bytes.length; },
      get type() { return data(this).type; },
      slice(start = undefined, end = undefined, contentType = undefined) {
        const d = data(this);
        const size = d.bytes.length;
        let from = start === undefined ? 0 : clampLongLong(start);
        from = from < 0 ? Math.max(size + from, 0) : Math.min(from, size);
        let to = end === undefined ? size : clampLongLong(end);
        to = to < 0 ? Math.max(size + to, 0) : Math.min(to, size);
        const type = contentType === undefined ? '' : blobType(contentType);
        return makeBlob(d.window, d.bytes.subarray(from, Math.max(to, from)), type);
      },
      // From jsdom 28.1 (Blob's compat below).
      text() {
        return read(this, (d) => {
          utf8Decoder ??= new PlatformTextDecoder();
          return utf8Decoder.decode(d.bytes);
        });
      },
      arrayBuffer() { return read(this, (d) => new (realmOf(d.window).Uint8Array)(d.bytes).buffer); },
      bytes() { return read(this, (d) => new (realmOf(d.window).Uint8Array)(d.bytes)); },
    },
    // jsdom has text(), arrayBuffer() and bytes() from 28.1 (black box: 28.0
    // has none); stream() in no version.
    compat(proto, compat) {
      if (!compat.blobReads) { delete proto.text; delete proto.arrayBuffer; delete proto.bytes; }
    },
  },
  {
    name: 'File',
    parent: 'Blob',
    length: 2,
    construct: (window, self, args) => {
      if (args.length < 2) throw new TypeError(`Failed to construct 'File': 2 arguments required, but only ${args.length} present.`);
      const [parts, name, options] = args;
      const converted = convertParts(parts, 'File');
      const fileName = webidlString(name, 'parameter 2', "Failed to construct 'File'");
      const { endings, type } = blobOptions(options, 'File');
      const lastModified = options?.lastModified === undefined ? Date.now() : longLong(options.lastModified);
      self[BLOB] = { window, bytes: processParts(converted, endings), type, name: fileName.toWellFormed?.() ?? fileName, lastModified };
      return self;
    },
    members: {
      get name() { const d = data(this); if (d.name === undefined) throw new TypeError('Illegal invocation'); return d.name; },
      get lastModified() { const d = data(this); if (d.name === undefined) throw new TypeError('Illegal invocation'); return d.lastModified; },
    },
  },
];

// Used by FileReader: the blob's bytes now, or null for a value that is not
// a warpdom Blob.
export const blobBytes = (value) => blobData(value)?.bytes ?? null;

hooks.blobs = { blobData, makeFile };

// --- FileReader ---------------------------------------------------------------------------------

const EMPTY = 0, LOADING = 1, DONE = 2;
const STATES = { EMPTY, LOADING, DONE };

const PROGRESS_FIELDS = { lengthComputable: false, loaded: 0, total: 0 };

const isBlob = (value) => blobBytes(value) !== null
  || (typeof Blob !== 'undefined' && value instanceof Blob)
  || (value !== null && typeof value === 'object' && typeof value.arrayBuffer === 'function' && typeof value.size === 'number' && typeof value.type === 'string');

// Only progress events carry the byte counts.
function fire(reader, type, progress) {
  const window = state(reader).window;
  dispatch(reader, new window.ProgressEvent(type, progress ? { lengthComputable: true, loaded: progress.loaded, total: progress.total } : {}));
}

// Runs fn in a task of its own, unless the read it belongs to was aborted
// or replaced in the meantime.
function queue(reader, read, fn) {
  const s = state(reader);
  s.window[S].setTimeout(() => { if (s.read === read) fn(); }, 0);
}

// --- packaging -----------------------------------------------------------------------------------

function binaryString(bytes) {
  let out = '';
  for (let i = 0; i < bytes.length; i += 0x8000) out += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return out;
}

const charsetOf = (type) => /;\s*charset=("?)([^";\s]+)\1/i.exec(type)?.[2];

function packageData(buffer, kind, blob, encoding) {
  switch (kind) {
    case 'ArrayBuffer': return buffer;
    case 'BinaryString': return binaryString(new Uint8Array(buffer));
    case 'Text': return decodeText(new Uint8Array(buffer), encoding, charsetOf(blob.type));
    // The platform's btoa: the CommonJS bundle may be evaluated in a
    // context without one (a Jest test file's VM context).
    default: return `data:${blob.type || 'application/octet-stream'};base64,${PLATFORM_GLOBAL.btoa(binaryString(new Uint8Array(buffer)))}`;
  }
}

// --- the read operation --------------------------------------------------------------------------

function readOperation(reader, blob, kind, encoding) {
  const s = state(reader);
  if (!isBlob(blob)) throw new TypeError(`Failed to execute 'readAs${kind}' on 'FileReader': parameter 1 is not of type 'Blob'.`);
  if (s.readyState === LOADING) throw domError('The object is already busy reading Blobs.', 'InvalidStateError');
  s.readyState = LOADING;
  s.result = null;
  s.error = null;
  const read = {};
  s.read = read;
  queue(reader, read, () => fire(reader, 'loadstart'));
  // A warpdom Blob's bytes are at hand; a platform Blob is read.
  const bytes = blobBytes(blob);
  const size = blob.size;
  (bytes !== null ? Promise.resolve(bytes.slice().buffer) : blob.arrayBuffer()).then((buffer) => {
    // One chunk, when there are bytes at all.
    if (buffer.byteLength) queue(reader, read, () => fire(reader, 'progress', { loaded: buffer.byteLength, total: size }));
    queue(reader, read, () => {
      s.read = null;
      s.readyState = DONE;
      try {
        s.result = packageData(buffer, kind, blob, encoding);
      } catch (error) {
        s.error = domError(error?.message ?? 'The file could not be read.', 'NotReadableError');
        fire(reader, 'error');
        if (s.readyState !== LOADING) fire(reader, 'loadend');
        return;
      }
      fire(reader, 'load');
      if (s.readyState !== LOADING) fire(reader, 'loadend');
    });
  }, (error) => {
    queue(reader, read, () => {
      s.read = null;
      s.readyState = DONE;
      s.error = error instanceof DOMException ? error : domError(error?.message ?? 'The file could not be read.', 'NotReadableError');
      fire(reader, 'error');
      if (s.readyState !== LOADING) fire(reader, 'loadend');
    });
  });
}

export const FILE_READER_INTERFACES = [
  {
    name: 'FileReader',
    parent: 'EventTarget',
    statics: STATES,
    construct: (window, self) => { self[S] = { window, readyState: EMPTY, result: null, error: null, read: null }; return self; },
    members: {
      ...Object.fromEntries(Object.entries(STATES).map(([k, v]) => [k, { constant: v }])),
      readAsArrayBuffer(blob) { readOperation(this, blob, 'ArrayBuffer'); },
      readAsBinaryString(blob) { readOperation(this, blob, 'BinaryString'); },
      readAsText(blob, encoding) { readOperation(this, blob, 'Text', encoding); },
      readAsDataURL(blob) { readOperation(this, blob, 'DataURL'); },
      abort() {
        const s = state(this);
        if (s.readyState === EMPTY || s.readyState === DONE) { s.result = null; return; }
        s.readyState = DONE;
        s.result = null;
        s.read = null;
        fire(this, 'abort');
        if (s.readyState !== LOADING) fire(this, 'loadend');
      },
      get readyState() { return state(this).readyState; },
      get result() { return state(this).result; },
      get error() { return state(this).error; },
      ...handlerMembers(['onloadstart', 'onprogress', 'onload', 'onabort', 'onerror', 'onloadend']),
    },
  },
  { name: 'ProgressEvent', parent: 'Event', length: 1, construct: eventConstruct('ProgressEvent', PROGRESS_FIELDS), members: fieldGetters(PROGRESS_FIELDS) },
];
