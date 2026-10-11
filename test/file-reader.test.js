// FileReader and ProgressEvent, checked against jsdom. jsdom reads its own
// Blob; warpdom reads the platform's (what the test environments expose).
import { parity } from './parity.js';

const BlobOf = (w) => w.Blob ?? Blob;
const FileOf = (w) => w.File ?? File;

// Reads a blob and records the events, readyState and result.
function read(w, method, blob, ...args) {
  return new Promise((resolve) => {
    const r = new w.FileReader();
    const log = [r.readyState, r.result, r.error];
    for (const type of ['loadstart', 'progress', 'load', 'error', 'abort', 'loadend']) {
      r.addEventListener(type, (e) => {
        log.push([type, e.constructor.name, e.lengthComputable, e.loaded, e.total, r.readyState, e.bubbles, e.cancelable]);
        if (type === 'loadend') resolve([...log, r.readyState, r.result instanceof ArrayBuffer || r.result?.constructor?.name === 'ArrayBuffer' ? [...new Uint8Array(r.result)] : r.result, r.error]);
      });
    }
    r[method](blob, ...args);
    log.push(['sync', r.readyState, r.result]);
  });
}

parity('FileReader: readAsDataURL', async (w) => {
  const B = BlobOf(w);
  return [
    await read(w, 'readAsDataURL', new B(['hello'], { type: 'text/plain' })),
    await read(w, 'readAsDataURL', new B([new Uint8Array([0, 255, 128])])),
    await read(w, 'readAsDataURL', new B([])),
    await read(w, 'readAsDataURL', new (FileOf(w))(['png'], 'photo.png', { type: 'image/png' })),
  ];
});

parity('FileReader: readAsText and encodings', async (w) => {
  const B = BlobOf(w);
  return [
    await read(w, 'readAsText', new B(['héllo ✓'])),
    await read(w, 'readAsText', new B([new Uint8Array([0xe9, 0x41])]), 'latin1'),
    await read(w, 'readAsText', new B([new Uint8Array([0xe9, 0x41])], { type: 'text/plain;charset=windows-1252' })),
    await read(w, 'readAsText', new B([new Uint8Array([0xe9, 0x41])]), 'nonsense'),
    await read(w, 'readAsText', new B([new Uint8Array([0xff, 0xfe, 0x41, 0x00])])),
    await read(w, 'readAsText', new B([new Uint8Array([0xef, 0xbb, 0xbf, 0x41])]), 'latin1'),
  ];
});

parity('FileReader: readAsArrayBuffer and readAsBinaryString', async (w) => {
  const B = BlobOf(w);
  return [
    await read(w, 'readAsArrayBuffer', new B([new Uint8Array([1, 2, 3])])),
    await read(w, 'readAsBinaryString', new B([new Uint8Array([0, 200, 65])])),
  ];
});

parity('FileReader: abort, busy reader, bad arguments, handlers', async (w) => {
  const B = BlobOf(w);
  const out = [w.FileReader.EMPTY, w.FileReader.LOADING, w.FileReader.DONE, new w.FileReader().DONE];
  const r = new w.FileReader();
  const events = [];
  for (const type of ['loadstart', 'progress', 'load', 'abort', 'loadend']) r.addEventListener(type, () => events.push([type, r.readyState]));
  r.readAsText(new B(['x']));
  try { r.readAsText(new B(['y'])); } catch (e) { out.push(e.name); }
  r.abort();
  out.push(r.readyState, r.result);
  await new Promise((resolve) => setTimeout(resolve, 20));
  out.push(events);
  try { new w.FileReader().readAsText('not a blob'); } catch (e) { out.push(e.name); }
  const h = new w.FileReader();
  const order = [];
  h.onload = () => order.push('onload');
  h.addEventListener('load', () => order.push('listener'));
  h.onloadend = function () { order.push(this === h); };
  h.readAsText(new B(['z']));
  await new Promise((resolve) => setTimeout(resolve, 20));
  out.push(order, typeof h.onprogress);
  const fresh = new w.FileReader();
  fresh.abort();
  out.push(fresh.readyState);
  return out;
});

parity('ProgressEvent', (w) => {
  const e = new w.ProgressEvent('progress', { lengthComputable: true, loaded: 5, total: 10, bubbles: true });
  const d = new w.ProgressEvent('x');
  return [e.type, e.lengthComputable, e.loaded, e.total, e.bubbles, e instanceof w.Event, d.lengthComputable, d.loaded, d.total, Object.prototype.toString.call(e)];
});
