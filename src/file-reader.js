// FileReader (File API, 7) and ProgressEvent (XMLHttpRequest standard,
// 4.7): reads a Blob (the platform's Blob and File, which the test
// environments expose) as an ArrayBuffer, text, a binary string or a data
// URL. The read takes the blob's bytes in one chunk, so it fires
// loadstart, one progress (none for an empty blob), then load (or error)
// and loadend, each in its own task.
import { S, state, domError } from './internal.js';
import { dispatch, eventConstruct, fieldGetters } from './events.js';
import { handlerMembers } from './event-handlers.js';

const EMPTY = 0, LOADING = 1, DONE = 2;
const STATES = { EMPTY, LOADING, DONE };

const PROGRESS_FIELDS = { lengthComputable: false, loaded: 0, total: 0 };

const isBlob = (value) => (typeof Blob !== 'undefined' && value instanceof Blob)
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

function decoderFor(label) {
  if (label == null) return null;
  try { return new TextDecoder(String(label)); } catch { return null; }
}

// The Encoding standard's decode: a byte order mark decides first, then
// the given encoding, then the blob type's charset, then UTF-8.
function decodeText(bytes, label, type) {
  let encoding = null;
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) encoding = 'utf-8';
  else if (bytes[0] === 0xfe && bytes[1] === 0xff) encoding = 'utf-16be';
  else if (bytes[0] === 0xff && bytes[1] === 0xfe) encoding = 'utf-16le';
  const decoder = (encoding && new TextDecoder(encoding)) ?? decoderFor(label) ?? decoderFor(charsetOf(type)) ?? new TextDecoder('utf-8');
  return decoder.decode(bytes);
}

function packageData(buffer, kind, blob, encoding) {
  switch (kind) {
    case 'ArrayBuffer': return buffer;
    case 'BinaryString': return binaryString(new Uint8Array(buffer));
    case 'Text': return decodeText(new Uint8Array(buffer), encoding, blob.type);
    default: return `data:${blob.type || 'application/octet-stream'};base64,${btoa(binaryString(new Uint8Array(buffer)))}`;
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
  blob.arrayBuffer().then((buffer) => {
    // One chunk, when there are bytes at all.
    if (buffer.byteLength) queue(reader, read, () => fire(reader, 'progress', { loaded: buffer.byteLength, total: blob.size }));
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
