// XMLHttpRequest, XMLHttpRequestEventTarget and XMLHttpRequestUpload
// (#22, #30): parity with jsdom 20 to 30 (real requests to a local server,
// test/xhr-server.js), the profile boundaries (jsdom 28.0.0 moved XHR
// from Node's http module to undici; jsdom before 27 reports network
// errors on the virtual console), the xhr option, laziness, and the
// documented differences (README, "Differences from jsdom").
import { test, suite, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import http from 'node:http';
import net from 'node:net';
import { createWindow } from '../src/node.js';
import { S } from '../src/internal.js';
import { snapshotWindow, resetWindow } from '../src/reset.js';
import { startServer, closedPort, EPHEMERAL_PORTS_FROM } from './xhr-server.js';

const require = createRequire(import.meta.url);
const server = await startServer();
after(() => server.close());
const PORT = server.port;
const BASE = `http://localhost:${PORT}`;
const CROSS = `http://127.0.0.1:${PORT}`;
const DEAD = await closedPort();
const PAGE = `${BASE}/page/index.html`;

// --- helpers ------------------------------------------------------------------------------------

const attempt = (fn) => {
  try {
    const v = fn();
    return v === undefined ? 'undefined' : v;
  } catch (e) {
    return `${e?.constructor?.name}/${e?.name}: ${e?.message}`;
  }
};
const EVENTS = ['readystatechange', 'loadstart', 'progress', 'load', 'error', 'abort', 'timeout', 'loadend'];
function logEvents(x, log, upload = false) {
  for (const type of EVENTS) {
    x.addEventListener(type, (e) =>
      log.push(
        `${type} ${x.readyState} ${x.status}${'loaded' in e ? ` ${e.lengthComputable}/${e.loaded}/${e.total}` : ''}`,
      ),
    );
    if (upload && type !== 'readystatechange')
      x.upload.addEventListener(type, (e) =>
        log.push(`upload.${type} ${x.readyState} ${e.lengthComputable}/${e.loaded}/${e.total}`),
      );
  }
}
const done = (x, ms = 3000) =>
  new Promise((resolve) => {
    const t = setTimeout(() => resolve('timed out'), ms);
    x.addEventListener('loadend', () => {
      clearTimeout(t);
      setTimeout(() => resolve('done'), 20);
    });
  });
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const port = (s) => (typeof s === 'string' ? s.replace(/(localhost|127\.0\.0\.1):\d+/g, '$1:PORT') : s);
// getAllResponseHeaders() as a sorted list, repeated headers combined, without
// the date (warpdom lists headers sorted and combined, as fetch gives them).
function headerLines(all) {
  if (typeof all !== 'string') return all;
  const map = new Map();
  for (const line of all.split('\r\n').filter(Boolean)) {
    const i = line.indexOf(': ');
    const name = line.slice(0, i);
    if (name === 'date') continue;
    map.set(name, map.has(name) ? `${map.get(name)}, ${line.slice(i + 2)}` : line.slice(i + 2));
  }
  return [...map].sort(([a], [b]) => (a < b ? -1 : 1)).map(([n, v]) => `${n}: ${v}`);
}
const getters = (x) => {
  const out = {};
  for (const k of ['readyState', 'status', 'statusText', 'responseURL', 'responseType', 'timeout', 'withCredentials'])
    out[k] = port(attempt(() => x[k]));
  out.response = attempt(() => {
    const r = x.response;
    return r === null ? null : typeof r === 'object' ? Object.prototype.toString.call(r) : r;
  });
  out.responseText = attempt(() => x.responseText);
  out.responseXML = attempt(() => {
    const r = x.responseXML;
    return r === null ? null : Object.prototype.toString.call(r);
  });
  out.headers = headerLines(attempt(() => x.getAllResponseHeaders()));
  return out;
};
async function request(w, method, url, { prep, body, upload = false, ms } = {}) {
  const x = new w.XMLHttpRequest();
  const log = [];
  logEvents(x, log, upload);
  x.open(method, url);
  prep?.(x);
  x.send(body);
  await done(x, ms);
  return { x, log };
}

// --- scenarios ----------------------------------------------------------------------------------
// Each runs on a jsdom window and a warpdom window with that jsdom's
// profile, each against its own server (c: its URLs, and c.jsdom, the jsdom
// major); the results and what each window reported must be the same.

const SCENARIOS = {
  shape(w, c) {
    const X = w.XMLHttpRequest;
    const own = (o) => Object.getOwnPropertyNames(o).sort();
    const x = new X();
    const desc = (k) => {
      const d = Object.getOwnPropertyDescriptor(X.prototype, k);
      return Object.fromEntries(Object.entries(d).map(([a, b]) => [a, typeof b === 'function' ? 'fn' : b]));
    };
    return {
      kinds: [typeof X, typeof w.XMLHttpRequestEventTarget, typeof w.XMLHttpRequestUpload, X.length, X.name],
      chain: [
        Object.getPrototypeOf(X.prototype) === w.XMLHttpRequestEventTarget.prototype,
        Object.getPrototypeOf(w.XMLHttpRequestEventTarget.prototype) === w.EventTarget.prototype,
        Object.getPrototypeOf(w.XMLHttpRequestUpload.prototype) === w.XMLHttpRequestEventTarget.prototype,
        Object.getPrototypeOf(X) === w.XMLHttpRequestEventTarget,
      ],
      members: [
        own(X.prototype),
        own(w.XMLHttpRequestEventTarget.prototype),
        own(w.XMLHttpRequestUpload.prototype),
        own(X),
      ],
      constants: [X.UNSENT, X.OPENED, X.HEADERS_RECEIVED, X.LOADING, X.DONE, x.DONE],
      constructors: [attempt(() => new w.XMLHttpRequestEventTarget()), attempt(() => new w.XMLHttpRequestUpload())],
      initial: getters(x),
      upload: [
        Object.prototype.toString.call(x.upload),
        x.upload === x.upload,
        x.upload instanceof w.XMLHttpRequestUpload,
        x.upload instanceof w.EventTarget,
      ],
      tags: [Object.prototype.toString.call(x), own(x), x.onload, x.onreadystatechange, x.upload.onprogress],
      descriptors: ['readyState', 'onreadystatechange', 'open', 'DONE', 'response'].map(desc),
    };
  },
  open(w, c) {
    const x = new w.XMLHttpRequest();
    const r = [];
    for (const m of ['bad method', 'CONNECT', 'connect', 'TRACE', 'track', '', 'GéT'])
      r.push([m, attempt(() => x.open(m, `${c.BASE}/echo`))]);
    r.push(
      attempt(() => x.open('GET', 'http://[bad')),
      attempt(() => x.open()),
      attempt(() => x.open('GET')),
    );
    const log = [];
    x.onreadystatechange = () => log.push(x.readyState);
    r.push(
      attempt(() => x.open('GET', '/x')),
      attempt(() => x.open('GET', '/y')),
      log,
    );
    // A third argument decides: undefined makes the request synchronous.
    r.push(
      attempt(() => x.open('GET', '/x', undefined)),
      attempt(() => {
        x.timeout = 5;
      }),
      attempt(() => {
        x.responseType = 'json';
      }),
    );
    const y = new w.XMLHttpRequest();
    y.responseType = 'json';
    const z = new w.XMLHttpRequest();
    z.timeout = 5;
    r.push(
      attempt(() => y.open('GET', '/x', false)),
      attempt(() => z.open('GET', '/x', false)),
      attempt(() => z.open('GET', '/x', true)),
    );
    return r;
  },
  async states(w, c) {
    const x = new w.XMLHttpRequest();
    const r = {};
    r.beforeOpen = [
      attempt(() => x.setRequestHeader('a', 'b')),
      attempt(() => x.send()),
      attempt(() => x.overrideMimeType('text/plain')),
      attempt(() => x.getResponseHeader()),
    ];
    r.responseTypes = ['', 'text', 'json', 'arraybuffer', 'blob', 'document', 'bogus', 'moz-blob'].map((t) => {
      x.responseType = t;
      return x.responseType;
    });
    x.responseType = 'json';
    r.json = [attempt(() => x.responseText), attempt(() => x.responseXML), attempt(() => x.response)];
    x.responseType = 'document';
    r.document = [attempt(() => x.responseText), attempt(() => x.responseXML), attempt(() => x.response)];
    x.responseType = 'arraybuffer';
    r.arraybuffer = attempt(() => x.response);
    x.responseType = '';
    r.timeouts = ['5', -1, 1.7, 'x', 2 ** 33, null].map((v) => {
      x.timeout = v;
      return x.timeout;
    });
    x.timeout = 0;
    r.credentials = [1, 0, 'a', ''].map((v) => {
      x.withCredentials = v;
      return x.withCredentials;
    });
    x.open('GET', `${c.BASE}/slow?n=2&ms=100`);
    r.opened = getters(x);
    r.header = attempt(() => x.setRequestHeader('X-Test', 'v'));
    x.send();
    r.sent = [
      getters(x),
      attempt(() => x.send()),
      attempt(() => x.setRequestHeader('a', 'b')),
      attempt(() => {
        x.withCredentials = true;
      }),
      attempt(() => {
        x.responseType = 'text';
        return x.responseType;
      }),
      attempt(() => x.overrideMimeType('text/plain')),
      attempt(() => {
        x.timeout = 0;
        return x.timeout;
      }),
    ];
    await new Promise((resolve) => {
      x.onreadystatechange = () => {
        if (x.readyState === 3 && !r.loading)
          r.loading = [
            getters(x),
            attempt(() => {
              x.responseType = 'json';
            }),
            attempt(() => x.overrideMimeType('text/plain')),
          ];
        if (x.readyState === 2) r.headersReceived = getters(x);
      };
      x.onloadend = () => {
        r.done = [
          getters(x),
          attempt(() => {
            x.responseType = 'json';
          }),
          attempt(() => x.overrideMimeType('text/plain')),
          attempt(() => {
            x.withCredentials = true;
          }),
        ];
        resolve();
      };
    });
    return r;
  },
  async setRequestHeader(w, c) {
    const x = new w.XMLHttpRequest();
    x.open('POST', `${c.BASE}/echo`);
    const r = {};
    for (const [n, v] of [
      ['Cookie', 'a=1'],
      ['Host', 'h'],
      ['Content-Length', '3'],
      ['Referer', 'http://x/'],
      ['Origin', 'http://x'],
      ['User-Agent', 'ua'],
      ['Sec-Foo', '1'],
      ['Proxy-Foo', '1'],
      ['Accept-Charset', 'x'],
      ['Connection', 'close'],
      ['DNT', '1'],
      ['Keep-Alive', 'x'],
      ['Via', 'x'],
      ['Date', 'x'],
      ['Expect', 'x'],
      ['TE', 'x'],
      ['Trailer', 'x'],
      ['Upgrade', 'x'],
      ['Transfer-Encoding', 'x'],
      ['Access-Control-Request-Method', 'x'],
      ['Access-Control-Request-Headers', 'x'],
      ['Cookie2', 'x'],
      ['Set-Cookie', 'x'],
      ['Accept-Encoding', 'x'],
      ['X-HTTP-Method-Override', 'GET'],
      ['X-HTTP-Method', 'TRACE'],
      ['X-Method-Override', 'get, track'],
      ['Accept', 'text/x'],
      ['Accept-Language', 'fr'],
      ['X-Dup', 'a'],
      ['x-dup', 'b'],
      ['X-Empty', ''],
      ['X-Space', '  pad  '],
      ['X-Number', 5],
      ['X-Latin', 'é'],
    ]) {
      r[`${n}=${v}`] = attempt(() => x.setRequestHeader(n, v));
    }
    r.errors = [
      attempt(() => x.setRequestHeader('bad name', 'v')),
      attempt(() => x.setRequestHeader('X-Bad', 'a\nb')),
      attempt(() => x.setRequestHeader('X')),
      attempt(() => x.setRequestHeader('X-U', '€')),
      attempt(() => x.setRequestHeader('X-€', 'v')),
    ];
    x.send('abc');
    await done(x);
    const echo = JSON.parse(x.responseText);
    r.sent = [echo.method, echo.headers];
    return r;
  },
  async defaultHeaders(w, c) {
    const out = [];
    for (const [method, url] of [
      ['GET', `${c.BASE}/echo`],
      ['GET', `${c.CROSS}/echo?acao=*`],
    ]) {
      const { x } = await request(w, method, url);
      out.push(port(JSON.stringify(JSON.parse(x.responseText).headers)));
    }
    return out;
  },
  async bodies(w, c) {
    const out = {};
    const fd = new w.FormData();
    fd.append('a', '1');
    fd.append('f', new w.Blob(['xy'], { type: 'text/x' }), 'n.txt');
    fd.append('q"\n\r', new w.Blob(['z']), 'a\nb"');
    fd.append('v', 'l1\nl2\rl3');
    const cases = {
      string: ['hé'],
      charsetReplaced: ['s', 'text/plain;charset=latin1'],
      noCharset: ['s', 'application/json'],
      upperCharset: ['s', 'text/plain; CHARSET=UTF-8'],
      twoCharsets: ['s', 'text/plain;charset=a;charset=b'],
      badMime: ['s', 'nonsense;charset=latin1'],
      urlSearchParams: [new w.URLSearchParams('a=1&b=2')],
      urlSearchParamsType: [new w.URLSearchParams('a=1'), 'text/x'],
      blob: [new w.Blob(['bb'], { type: 'Text/X' })],
      blobNoType: [new w.Blob(['bb'])],
      blobTypeKept: [new w.Blob(['bb'], { type: 'a/b' }), 'c/d;charset=x'],
      file: [new w.File(['ff'], 'n', { type: 'a/b' })],
      formData: [fd],
      arrayBuffer: [new Uint8Array([65, 66]).buffer],
      view: [new Uint8Array([67, 68, 69]).subarray(1)],
      xml: [new w.DOMParser().parseFromString('<a>té</a>', 'application/xml')],
      html: [w.document.implementation.createHTMLDocument('t')],
      document: [w.document],
      documentCharset: [w.document, 'text/html;charset=latin1'],
      null: [null],
      undefined: [undefined],
      number: [42],
      object: [{ a: 1 }],
      buffer: [Buffer.from('nb')],
    };
    // XML documents are sent without the well-formed flag (Copilot review on #89).
    const xmlDoc = (change) => {
      const d = w.document.implementation.createDocument(null, 'root');
      change(d, d.documentElement);
      return d;
    };
    Object.assign(cases, {
      xmlComment: [xmlDoc((d, root) => root.append(d.createComment('a--b'), d.createComment('c-')))],
      xmlPI: [
        xmlDoc((d, root) => root.append(Object.assign(d.createProcessingInstruction('x', 'a'), { data: 'a?>b' }))),
      ],
      xmlText: [xmlDoc((d, root) => root.append('a\u0001b'))],
      xmlAttribute: [xmlDoc((d, root) => root.setAttribute('a', 'x\u0001'))],
      xmlDoctype: [xmlDoc((d, root) => d.insertBefore(d.implementation.createDocumentType('root', 'p"\'', ''), root))],
      xmlNoRoot: [xmlDoc((d, root) => root.remove())],
    });
    // jsdom 28 and later send nothing for a DataView (warpdom: its bytes).
    if (c.jsdom < 28) cases.dataView = [new DataView(new Uint8Array([70, 71]).buffer)];
    for (const [name, [body, type]] of Object.entries(cases)) {
      const x = new w.XMLHttpRequest();
      x.open('POST', `${c.BASE}/echo`);
      if (type) x.setRequestHeader('Content-Type', type);
      x.send(body);
      await done(x);
      const echo = JSON.parse(x.responseText);
      out[name] = [
        echo.headers['content-type'] ?? null,
        echo.headers['content-length'] ?? null,
        echo.body.replace(/-{26}[\da-f]{24}/g, 'BOUNDARY'),
      ].map((v) => (typeof v === 'string' ? v.replace(/boundary=-{26}[\da-f]{24}/, 'boundary=B') : v));
    }
    for (const method of ['GET', 'HEAD']) {
      const x = new w.XMLHttpRequest();
      x.open(method, `${c.BASE}/echo`);
      x.send('ignored');
      await done(x);
      out[method] = [x.status, method === 'GET' ? JSON.parse(x.responseText).body : x.responseText];
    }
    return out;
  },
  async methods(w, c) {
    const out = [];
    for (const m of ['get', 'post', 'put', 'delete', 'options', 'head', 'PATCH', 'custom', 'MKCOL']) {
      const { x } = await request(w, m, `${c.BASE}/echo`);
      out.push([m, x.status, x.status === 200 && m !== 'head' ? JSON.parse(x.responseText).method : null]);
    }
    return out;
  },
  async events(w, c) {
    const out = {};
    let { x, log } = await request(w, 'GET', `${c.BASE}/text`, { upload: true });
    out.get = [
      log,
      getters(x),
      [
        x.getResponseHeader('x-multi'),
        x.getResponseHeader('X-A'),
        x.getResponseHeader('set-cookie'),
        x.getResponseHeader('SET-COOKIE2'),
        x.getResponseHeader('nope'),
        x.getResponseHeader('content-type'),
      ],
    ];
    ({ log } = await request(w, 'POST', `${c.BASE}/type?ct=text/plain&body=done`, {
      body: 'a'.repeat(1000),
      upload: true,
    }));
    out.post = log;
    ({ log } = await request(w, 'POST', `${c.BASE}/type?ct=text/plain&body=done`, { body: 'abc' }));
    out.postWithoutUploadListeners = log;
    ({ log } = await request(w, 'POST', `${c.BASE}/type?ct=text/plain&body=done`, { body: '', upload: true }));
    out.emptyBody = log;
    ({ log } = await request(w, 'POST', `${c.BASE}/type?ct=text/plain&body=done`, { upload: true }));
    out.noBody = log;
    ({ log } = await request(w, 'GET', `${c.BASE}/slow?n=3&ms=80&size=5`));
    out.chunks = log;
    ({ log } = await request(w, 'GET', `${c.BASE}/slow?n=2&ms=80&size=5&len=10`));
    out.contentLength = log;
    ({ log } = await request(w, 'HEAD', `${c.BASE}/text`));
    out.head = log;
    return out;
  },
  async calls(w, c) {
    const log = [];
    const x = new w.XMLHttpRequest();
    x.onreadystatechange = function (e) {
      log.push([
        'readystatechange',
        this === x,
        e.target === x,
        e.currentTarget === x,
        e.bubbles,
        e.cancelable,
        e.isTrusted,
        e.constructor === w.Event,
        x.readyState,
      ]);
    };
    x.onload = function (e) {
      log.push([
        'load',
        this === x,
        e.bubbles,
        e.cancelable,
        e.isTrusted,
        e.constructor === w.ProgressEvent,
        e instanceof w.ProgressEvent,
      ]);
    };
    x.upload.onloadstart = function (e) {
      log.push(['upload', this === x.upload, e.target === x.upload]);
    };
    x.open('POST', `${c.BASE}/type?body=x`);
    x.send('abc');
    await done(x);
    // Synthetic events reach the handlers.
    x.dispatchEvent(new w.Event('load'));
    x.upload.dispatchEvent(new w.ProgressEvent('loadstart'));
    // A listener added after send() gets no upload events of that request.
    const y = new w.XMLHttpRequest();
    y.open('POST', `${c.BASE}/type?body=x`);
    y.send('abc');
    y.upload.onload = () => log.push('late upload listener');
    await done(y);
    // A listener that throws is reported; the request continues.
    const z = new w.XMLHttpRequest();
    z.onreadystatechange = () => {
      log.push(`throws ${z.readyState}`);
      if (z.readyState === 2) throw new Error('boom');
    };
    z.open('GET', `${c.BASE}/text`);
    z.send();
    await done(z);
    return log;
  },
  async statuses(w, c) {
    const out = [];
    for (const [code, text, body] of [
      [404, 'Not Found', 'nf'],
      [204, 'No Content', ''],
      [201, 'Created Custom', 'c'],
      [500, 'Server Error', 'e'],
      [299, 'X', ''],
      [599, 'Y', ''],
    ]) {
      const { x, log } = await request(
        w,
        'GET',
        `${c.BASE}/status?code=${code}&text=${encodeURIComponent(text)}&body=${body}`,
      );
      out.push([code, x.status, x.statusText, x.responseText, log]);
    }
    return out;
  },
  async redirects(w, c) {
    const out = [];
    // jsdom before 28 never completes a POST redirected by 301, 302 or 303.
    // (jsdom keeps a fragment of the Location in responseURL; fetch does not
    // say it.)
    const cases = [
      [302, '/text', 'GET'],
      [307, '/echo', 'POST'],
      [308, '/echo', 'POST'],
      [302, `${c.CROSS}/echo?acao=*`, 'GET'],
      [302, `${c.CROSS}/echo`, 'GET'],
    ];
    if (c.jsdom >= 28) cases.push([301, '/echo', 'POST'], [302, '/echo', 'POST'], [303, '/echo', 'PUT']);
    for (const [code, to, method] of cases) {
      const { x, log } = await request(w, method, `${c.BASE}/redirect?code=${code}&to=${encodeURIComponent(to)}`, {
        body: method === 'GET' ? undefined : 'body',
      });
      const echo = x.status === 200 && to.includes('echo') ? JSON.parse(x.responseText) : null;
      // The echo's length depends on the Origin and Referer of the redirected
      // request, which fetch sets (jsdom: Origin on the next hop, and before 28
      // the redirecting URL as Referer).
      out.push([
        code,
        port(to),
        method,
        x.status,
        port(x.responseURL),
        echo && [echo.method, echo.body, echo.headers['content-type'] ?? null],
        echo ? log.map((l) => l.replace(/\/\d+\/0$/, '/N/0')) : log,
      ]);
    }
    const { x, log } = await request(w, 'GET', `${c.BASE}/redirect?code=302`);
    out.push(['loop', x.status, port(x.responseURL), log]);
    return out;
  },
  async errors(w, c) {
    const out = {};
    const cases = [
      ['refused', 'POST', `http://localhost:${c.DEAD}/x`, 'abc'],
      ['refusedGet', 'GET', `http://localhost:${c.DEAD}/x`],
    ];
    // jsdom before 28 throws Node's error from send() for other schemes.
    if (c.jsdom >= 28) cases.push(['scheme', 'GET', 'ftp://localhost/x'], ['about', 'GET', 'about:blank']);
    for (const [name, method, url, body] of cases) {
      const { x, log } = await request(w, method, url, { body, upload: true });
      out[name] = [log, getters(x)];
    }
    return out;
  },
  async timeouts(w, c) {
    const out = {};
    for (const [name, method, url, ms, body, upload] of [
      ['hangPost', 'POST', `${c.BASE}/hang`, 100, 'abc', true],
      ['hangPostNoUploadListeners', 'POST', `${c.BASE}/hang`, 100, 'abc', false],
      ['hangGet', 'GET', `${c.BASE}/hang`, 100],
      ['headersLate', 'POST', `${c.BASE}/slow?wait=400&n=1`, 100, 'abc', true],
      // Three chunks, each sent once the previous one's progress event has
      // fired, then the response stays open: both windows see the same
      // chunks before the timeout, however busy the machine (timed chunks
      // raced the timeout, and on a busy CI runner one window saw one more
      // chunk than the other). What is left to time is the headers: the
      // timeout leaves them a wide margin (jsdom on a busy CI machine took
      // more than 150 ms to them).
      ['duringBody', 'GET', `${c.BASE}/slow?n=3&step=1`, 2000],
      ['duringBodyAfterUpload', 'POST', `${c.BASE}/slow?n=3&step=1`, 2000, 'abc', true],
    ]) {
      const prep = (r) => {
        r.timeout = ms;
        r.addEventListener('progress', (e) => {
          if (e.loaded > 0) c.server.release();
        });
      };
      const { x, log } = await request(w, method, url, { body, upload, prep });
      out[name] = [
        log.filter(
          (l, i) =>
            !(
              l.startsWith('readystatechange 3') &&
              log[i + 1]?.startsWith('progress 3 200 false/') &&
              !log[i + 1].endsWith('/0/0')
            ),
        ),
        getters(x),
      ];
    }
    // Changing the timeout during the request: measured from its start; 0
    // cancels it; a request started without one gets none. (The response
    // comes at 500 ms; on a busy machine the change at 20 ms can run late
    // and the response can take more than 1000 ms, hence the margins.)
    for (const [name, first, later, at] of [
      ['raised', 300, 2000, 20],
      ['lowered', 1000, 50, 20],
      ['cleared', 300, 0, 20],
      ['startedWithout', 0, 50, 120],
    ]) {
      const x = new w.XMLHttpRequest();
      const log = [];
      x.ontimeout = () => log.push('timeout');
      x.onload = () => log.push('load');
      x.open('GET', `${c.BASE}/slow?wait=500&n=1`);
      x.timeout = first;
      x.send();
      setTimeout(() => {
        x.timeout = later;
      }, at);
      await done(x);
      out[name] = log;
    }
    return out;
  },
  async aborts(w, c) {
    const out = {};
    const make = () => {
      const x = new w.XMLHttpRequest();
      const log = [];
      logEvents(x, log, true);
      return [x, log];
    };
    let [x, log] = make();
    x.abort();
    out.unsent = [log.slice(), x.readyState];
    [x, log] = make();
    x.open('GET', `${c.BASE}/text`);
    log.length = 0;
    x.abort();
    out.opened = [log.slice(), x.readyState];
    [x, log] = make();
    x.open('POST', `${c.BASE}/slow`);
    x.send('abc');
    log.push('aborting');
    x.abort();
    log.push(`aborted ${x.readyState}`);
    await wait(300);
    out.sent = [log.slice(), getters(x)];
    [x, log] = make();
    x.open('GET', `${c.BASE}/slow?n=5&ms=60`);
    x.addEventListener('progress', function once() {
      x.removeEventListener('progress', once);
      x.abort();
      log.push(`aborted ${x.readyState}`);
    });
    x.send();
    await wait(500);
    out.loading = [log.slice(), getters(x)];
    [x, log] = make();
    x.open('GET', `${c.BASE}/text`);
    x.send();
    await done(x);
    log.push('aborting');
    x.abort();
    out.done = [log.slice(), getters(x)];
    [x, log] = make();
    x.open('GET', `${c.BASE}/slow`);
    x.send();
    x.onreadystatechange = () => {
      if (x.readyState === 4) {
        x.onreadystatechange = null;
        x.open('GET', `${c.BASE}/text`);
        log.push(`reopened ${x.readyState}`);
      }
    };
    x.abort();
    log.push(`aborted ${x.readyState}`);
    await wait(200);
    out.openInAbort = log.slice();
    [x, log] = make();
    x.open('GET', `${c.BASE}/slow?n=3&ms=50`);
    x.send();
    log.push('reopening');
    x.open('GET', `${c.BASE}/text`);
    log.push(`reopened ${x.readyState}`);
    await wait(400);
    out.openWhileSending = log.slice();
    [x, log] = make();
    x.open('GET', `${c.BASE}/slow?n=3&ms=50`);
    x.send();
    x.open('GET', `${c.BASE}/text`);
    x.send();
    await done(x);
    out.sendAgain = [log.slice(), x.responseText];
    [x, log] = make();
    x.open('GET', `${c.BASE}/text`);
    x.send();
    await done(x);
    x.open('GET', `${c.BASE}/status?code=404&text=NF`);
    log.push(`reopened ${JSON.stringify(getters(x))}`);
    x.send();
    await done(x);
    out.reuse = log.slice();
    // Stopped while its preflight is pending: nothing more (#92).
    for (const how of ['abort', 'open']) {
      [x, log] = make();
      x.open('PUT', `${c.CROSS}/echo?preflight=ok&acao=*&pfwait=150`);
      x.send('abc');
      await wait(50);
      log.push(how);
      if (how === 'abort') x.abort();
      else x.open('GET', `${c.BASE}/text`);
      await wait(300);
      out[`${how}InPreflight`] = [log.slice(), x.readyState, x.status];
    }
    // jsdom before 28 goes on with the request after an abort in loadstart.
    if (c.jsdom < 28) return out;
    [x, log] = make();
    x.onloadstart = () => {
      x.abort();
      log.push(`aborted in loadstart ${x.readyState}`);
    };
    x.open('POST', `${c.BASE}/echo`);
    x.send('abc');
    log.push(`after send ${x.readyState}`);
    await wait(300);
    out.inLoadstart = log.slice();
    return out;
  },
  // What the upload's handlers see: from jsdom 28 they run before
  // HEADERS_RECEIVED, without the response (#92).
  async uploadHandlers(w, c) {
    const x = new w.XMLHttpRequest();
    const seen = [];
    for (const type of ['loadstart', 'progress', 'load', 'loadend']) {
      x.upload.addEventListener(type, () =>
        seen.push([
          type,
          getters(x),
          attempt(() => x.getResponseHeader('x-a')),
          attempt(() => x.getResponseHeader('content-type')),
        ]),
      );
    }
    x.addEventListener('readystatechange', () => seen.push(['readystatechange', x.readyState, x.status]));
    x.open('POST', `${c.BASE}/text`);
    x.send('body');
    await done(x);
    return seen;
  },
  async responseTypes(w, c) {
    const out = {};
    const get = async (type, query, prep, method = 'GET') => {
      const x = new w.XMLHttpRequest();
      x.open(method, `${c.BASE}/type?${query}`);
      x.responseType = type;
      prep?.(x);
      x.send();
      await done(x);
      let value;
      try {
        const r = x.response;
        if (r === null || typeof r !== 'object') value = r;
        else if (r instanceof w.Document)
          value = [
            'Document',
            Object.prototype.toString.call(r),
            r.contentType,
            r.documentElement?.outerHTML ?? null,
            port(r.URL),
            r.characterSet,
            r.compatMode,
            r.defaultView,
            r.title,
          ];
        else if (r instanceof w.Blob) value = ['Blob', r.size, r.type];
        else if (Object.prototype.toString.call(r) === '[object ArrayBuffer]')
          value = ['ArrayBuffer', [...new Uint8Array(r)]];
        else value = ['JSON', JSON.stringify(r), Array.isArray(r)];
      } catch (e) {
        value = e.message;
      }
      return [
        value,
        attempt(() => x.responseText),
        attempt(() => {
          const d = x.responseXML;
          return d === null ? null : [d.contentType, d.documentElement?.outerHTML];
        }),
        x.response === x.response,
      ];
    };
    out.text = await get('text', 'ct=text/plain&body=h%C3%A9');
    out.latin1 = await get('', `ct=${encodeURIComponent('text/plain;charset=iso-8859-1')}&body=6869e9&enc=hex`);
    out.utf8BOM = await get('', 'ct=text/plain&body=efbbbf6869&enc=hex');
    out.utf16BOM = await get('', 'ct=text/plain&body=fffe6800&enc=hex');
    out.noContentType = await get('', 'body=h%C3%A9');
    out.replacementEncoding = await get('', `ct=${encodeURIComponent('text/plain;charset=iso-2022-kr')}&body=abc`);
    out.replacementEncodingEmpty = await get('', `ct=${encodeURIComponent('text/plain;charset=iso-2022-kr')}&body=`);
    out.json = await get('json', `ct=application/json&body=${encodeURIComponent('{"a":[1,2]}')}`);
    out.jsonArray = await get('json', `ct=application/json&body=${encodeURIComponent('[1]')}`);
    out.badJson = await get('json', `ct=application/json&body=${encodeURIComponent('{bad')}`);
    out.emptyJson = await get('json', 'ct=application/json&body=');
    out.jsonBOM = await get('json', 'ct=application/json&body=efbbbf7b7d&enc=hex');
    out.arraybuffer = await get('arraybuffer', 'ct=text/plain&body=AB');
    out.emptyArraybuffer = await get('arraybuffer', 'ct=text/plain&body=');
    out.blob = await get('blob', `ct=${encodeURIComponent('Text/Plain; charset=utf-8')}&body=AB`);
    out.blobNoType = await get('blob', 'body=AB');
    out.html = await get('document', `ct=text/html&body=${encodeURIComponent('<title>T</title><p>x</p>')}`);
    out.xml = await get('document', `ct=text/xml&body=${encodeURIComponent('<a><b/></a>')}`);
    out.badXml = await get('document', `ct=text/xml&body=${encodeURIComponent('<a>')}`);
    out.textAsDocument = await get('document', 'ct=text/plain&body=x');
    out.svg = await get(
      'document',
      `ct=image/svg%2Bxml&body=${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg"/>')}`,
    );
    out.plusXml = await get('document', `ct=application/foo%2Bxml&body=${encodeURIComponent('<a/>')}`);
    out.documentNoContentType = await get('document', `body=${encodeURIComponent('<a/>')}`);
    out.xmlDefault = await get('', `ct=application/xml&body=${encodeURIComponent('<a>x</a>')}`);
    out.htmlDefault = await get('', `ct=text/html&body=${encodeURIComponent('<p>x</p>')}`);
    out.badXmlDefault = await get('', `ct=application/xml&body=${encodeURIComponent('<a>')}`);
    out.xmlNoContentType = await get('', `body=${encodeURIComponent('<a/>')}`);
    out.overrideXml = await get('', `ct=text/plain&body=${encodeURIComponent('<a>x</a>')}`, (x) =>
      x.overrideMimeType('text/xml'),
    );
    out.overrideCharset = await get('', 'ct=text/plain&body=6869e9&enc=hex', (x) =>
      x.overrideMimeType('text/plain; charset=latin1'),
    );
    out.overrideInvalid = await get('blob', 'ct=text/plain&body=x', (x) => x.overrideMimeType('nonsense'));
    out.overrideBlob = await get('blob', 'ct=text/plain&body=x', (x) => x.overrideMimeType('Foo/Bar;A=B'));
    out.documentCharset = await get('document', `ct=text%2Fhtml&body=${encodeURIComponent('<p>')}c3a9&enc=utf8`, (x) =>
      x.overrideMimeType('text/html;charset=latin1'),
    );
    out.overrideKeepsHeader = await get('', 'ct=text/plain&body=x', (x) => x.overrideMimeType('application/xml'));
    // An override without a charset keeps the response's (Copilot review on #89).
    const cp1252 = encodeURIComponent('text/plain;charset=windows-1252');
    out.overrideWithoutCharset = await get('', `ct=${cp1252}&body=6869e9&enc=hex`, (x) =>
      x.overrideMimeType('text/plain'),
    );
    out.overrideInvalidKeepsCharset = await get('', `ct=${cp1252}&body=6869e9&enc=hex`, (x) =>
      x.overrideMimeType('nonsense'),
    );
    out.overrideXmlWithoutCharset = await get('document', `ct=${cp1252}&body=3c613ee93c2f613e&enc=hex`, (x) =>
      x.overrideMimeType('text/xml'),
    );
    out.overrideHtmlWithoutCharset = await get(
      'document',
      `ct=${encodeURIComponent('text/html;charset=windows-1252')}&body=3c703ee9&enc=hex`,
      (x) => x.overrideMimeType('text/html'),
    );
    // An override charset that names no encoding keeps the response's
    // (UTF-8 when it has none); a known one wins (#92).
    for (const [name, label] of [
      ['Unknown', 'unknown'],
      ['Bogus', 'utf-9'],
      ['Known', 'iso-8859-2'],
    ]) {
      out[`overrideText${name}Charset`] = await get('', `ct=${cp1252}&body=6869e9&enc=hex`, (x) =>
        x.overrideMimeType(`text/plain;charset=${label}`),
      );
      out[`overrideHtml${name}Charset`] = await get(
        'document',
        `ct=${encodeURIComponent('text/html;charset=windows-1252')}&body=3c703ee9&enc=hex`,
        (x) => x.overrideMimeType(`text/html;charset=${label}`),
      );
      out[`overrideXml${name}Charset`] = await get('document', `ct=${cp1252}&body=3c613ee93c2f613e&enc=hex`, (x) =>
        x.overrideMimeType(`text/xml;charset=${label}`),
      );
    }
    out.overrideUnknownCharsetNone = await get('', 'ct=text/plain&body=6869e9&enc=hex', (x) =>
      x.overrideMimeType('text/plain;charset=unknown'),
    );
    // characterSet names the encoding as the Encoding standard writes it (#92).
    out.characterSetNames = [];
    for (const label of [
      'latin2',
      'ibm866',
      'koi8-r',
      'gbk',
      'gb18030',
      'big5',
      'euc-jp',
      'shift_jis',
      'euc-kr',
      'macintosh',
      'windows-1250',
      'utf-16be',
    ]) {
      out.characterSetNames.push(
        (await get('document', `ct=${encodeURIComponent(`text/html;charset=${label}`)}&body=3c703e78&enc=hex`))[0][5],
      );
    }
    // jsdom looks at neither an XML declaration's encoding nor an HTML meta
    // charset: UTF-8 (the XHR standard would use them).
    const latin1Xml = Buffer.concat([
      Buffer.from('<?xml version="1.0" encoding="ISO-8859-1"?><a>'),
      Buffer.from([0xe9]),
      Buffer.from('</a>'),
    ]).toString('hex');
    out.xmlDeclarationEncoding = await get('', `ct=application/xml&body=${latin1Xml}&enc=hex`);
    out.xmlDeclarationEncodingDocument = await get('document', `ct=text/xml&body=${latin1Xml}&enc=hex`);
    out.htmlMetaCharset = await get(
      'document',
      `ct=text/html&body=${Buffer.from('<meta charset="windows-1252"><p>\u00e9', 'latin1').toString('hex')}&enc=hex`,
    );
    // No document without a body: HEAD, 204, 304 and an empty body (one
    // space makes one); a well-formed document whose root is a parsererror
    // element is a document (Copilot review on #89).
    out.headHtml = await get('document', 'ct=text/html&body=x', undefined, 'HEAD');
    out.noContentHtml = await get('document', 'ct=text/html&code=204');
    out.notModifiedHtml = await get('document', 'ct=text/html&code=304');
    out.emptyHtml = await get('document', 'ct=text/html&body=');
    out.spaceHtml = await get('document', 'ct=text/html&body=%20');
    out.headXml = await get('', 'ct=text/xml&body=x', undefined, 'HEAD');
    const parsererror = encodeURIComponent(
      '<parsererror xmlns="http://www.mozilla.org/newlayout/xml/parsererror.xml">x</parsererror>',
    );
    out.parsererrorRoot = await get('document', `ct=text/xml&body=${parsererror}`);
    out.parsererrorRootDefault = await get('', `ct=application/xml&body=${parsererror}`);
    out.noRootXml = await get('document', 'ct=text/xml&body=text');
    // A clone of a response document keeps its encoding (Copilot review on #89).
    const encodings = async (type, ct, hex) => {
      const x = new w.XMLHttpRequest();
      x.open('GET', `${c.BASE}/type?ct=${encodeURIComponent(ct)}&body=${hex}&enc=hex`);
      x.responseType = 'document';
      x.send();
      await done(x);
      const d = x.response;
      return [d, d.cloneNode(false), d.cloneNode(true)].map((doc) => [
        doc.characterSet,
        doc.charset,
        doc.inputEncoding,
        doc.contentType,
      ]);
    };
    out.cloneHtml1252 = await encodings('document', 'text/html;charset=windows-1252', '3c703ee9');
    out.cloneXml1252 = await encodings('document', 'text/xml;charset=windows-1252', '3c613ee93c2f613e');
    out.cloneUtf16 = await encodings(
      'document',
      'text/html;charset=utf-16le',
      Buffer.from('<p>x', 'utf16le').toString('hex'),
    );
    out.cloneOthers = [
      w.document,
      w.document.implementation.createHTMLDocument('t'),
      new w.DOMParser().parseFromString('<a/>', 'text/xml'),
    ].map((doc) => doc.cloneNode(true).characterSet);
    return out;
  },
  // After a network error or a CORS failure (Copilot review on #89).
  async failedResponses(w, c) {
    const out = {};
    for (const type of ['', 'text', 'arraybuffer', 'blob', 'json', 'document']) {
      for (const [name, url] of [
        ['refused', `http://localhost:${c.DEAD}/x`],
        ['cors', `${c.CROSS}/type?body=AB`],
      ]) {
        const { x, log } = await request(w, 'GET', url, {
          prep: (r) => {
            r.responseType = type;
          },
        });
        out[`${name} ${type}`] = [log.at(-2), x.readyState, attempt(() => x.response)];
      }
    }
    return out;
  },
  async partialResponses(w, c) {
    const out = [];
    for (const type of ['', 'text', 'json', 'arraybuffer', 'blob', 'document']) {
      const x = new w.XMLHttpRequest();
      x.open('GET', `${c.BASE}/slow?n=3&ms=60`);
      x.responseType = type;
      const seen = [];
      const show = () => {
        const r = attempt(() => x.response);
        return r === null ? 'null' : typeof r === 'object' ? Object.prototype.toString.call(r) : JSON.stringify(r);
      };
      x.onreadystatechange = () => seen.push(`${x.readyState}:${show()}`);
      x.send();
      await done(x);
      out.push([type, seen]);
    }
    return out;
  },
  async responseHeaders(w, c) {
    const x = new w.XMLHttpRequest();
    x.open('GET', `${c.BASE}/text`);
    const before = x.getAllResponseHeaders();
    const at = [];
    x.onreadystatechange = () =>
      at.push([x.readyState, headerLines(x.getAllResponseHeaders()), x.getResponseHeader('X-A')]);
    x.send();
    await done(x);
    // Names that are not header names match nothing; a name that is not a
    // ByteString throws (Copilot review on #89).
    const names = ['', 'bad name', 'x-a\n', 'x-a\0', ' x-a', '(x)', 'x:a', 'é', '€', 'X-A'].map((n) =>
      attempt(() => x.getResponseHeader(n)),
    );
    const { x: y } = await request(w, 'GET', `${c.CROSS}/text?acao=*`);
    return {
      before,
      at,
      raw: x.getAllResponseHeaders().endsWith('\r\n'),
      names,
      cross: ['', 'bad name'].map((n) => attempt(() => y.getResponseHeader(n))),
    };
  },
  async cors(w, c) {
    const out = {};
    const one = async (name, url, { prep, method = 'GET', body, upload = true } = {}) => {
      const n = c.server.requests.length;
      const { x, log } = await request(w, method, c.CROSS + url, { prep, body, upload });
      // The Origin of a redirected request is fetch's (jsdom: null after a
      // cross-origin redirect).
      const requests = c.server.requests
        .slice(n)
        .map((r, i) => [
          r.method,
          i === 0 ? (r.headers.origin ?? null) : '',
          r.headers['access-control-request-method'] ?? null,
          r.headers['access-control-request-headers'] ?? null,
        ]);
      // (Byte counts left out: the echoed request headers of a redirected request differ, see redirects.)
      out[name] = [
        x.status,
        log.map((l) => l.replace(/\/\d+\/0$/, '/N/0')),
        port(JSON.stringify(requests)),
        headerLines(x.getAllResponseHeaders()),
        x.getResponseHeader('x-a'),
        x.getResponseHeader('content-type'),
      ];
    };
    const origin = encodeURIComponent(c.BASE);
    await one('noAllowOrigin', '/echo', { upload: false });
    await one('star', '/echo?acao=*', { upload: false });
    await one('origin', `/echo?acao=${origin}`, { upload: false });
    await one('otherOrigin', '/echo?acao=http://other', { upload: false });
    await one('trailingSlash', `/echo?acao=${origin}%2F`, { upload: false });
    await one('null', '/echo?acao=null', { upload: false });
    await one('exposed', '/text?acao=*&aceh=x-a,content-type', { upload: false });
    await one('exposedStar', '/text?acao=*&aceh=*', { upload: false });
    await one('safelisted', '/text?acao=*', { upload: false });
    await one('credentialsStar', '/echo?acao=*', {
      prep: (x) => {
        x.withCredentials = true;
      },
      upload: false,
    });
    await one('credentials', `/echo?acao=${origin}&acac=1`, {
      prep: (x) => {
        x.withCredentials = true;
      },
      upload: false,
    });
    await one('credentialsWithoutAllow', `/echo?acao=${origin}`, {
      prep: (x) => {
        x.withCredentials = true;
      },
      upload: false,
    });
    await one('simplePost', '/echo?acao=*', { method: 'POST', body: 'x', upload: false });
    await one('jsonPost', '/echo?acao=*', {
      method: 'POST',
      body: '{}',
      prep: (x) => x.setRequestHeader('Content-Type', 'application/json'),
      upload: false,
    });
    await one('accept', '/echo?acao=*', {
      prep: (x) => x.setRequestHeader('Accept', 'application/json'),
      upload: false,
    });
    await one('customHeader', '/echo?acao=*&preflight=ok&acah=x-custom', {
      prep: (x) => x.setRequestHeader('X-Custom', '1'),
      upload: false,
    });
    await one('customHeaderNotAllowed', '/echo?acao=*&preflight=ok', {
      prep: (x) => x.setRequestHeader('X-Custom', '1'),
      upload: false,
    });
    await one('customHeadersCase', '/echo?acao=*&preflight=ok&acah=X-B,x-a,authorization', {
      prep: (x) => {
        x.setRequestHeader('X-B', '1');
        x.setRequestHeader('x-a', '2');
        x.setRequestHeader('Content-Type', 'x/y');
        x.setRequestHeader('Authorization', 'z');
      },
      upload: false,
    });
    await one('allowHeadersStar', '/echo?acao=*&preflight=ok&acah=*', {
      prep: (x) => x.setRequestHeader('X-Custom', '1'),
      upload: false,
    });
    await one('preflightFails', '/echo?acao=*&preflight=fail&acah=x-custom', {
      prep: (x) => x.setRequestHeader('X-Custom', '1'),
      upload: false,
    });
    await one('preflightWithoutAllowOrigin', '/echo?preflight=ok&acah=x-custom', {
      prep: (x) => x.setRequestHeader('X-Custom', '1'),
      upload: false,
    });
    await one('preflightCredentials', `/echo?acao=${origin}&acac=1&preflight=ok&acah=*`, {
      prep: (x) => {
        x.withCredentials = true;
        x.setRequestHeader('X-Custom', '1');
      },
      upload: false,
    });
    await one('put', '/echo?acao=*&preflight=ok', { method: 'PUT', body: 'x', upload: false });
    await one('delete', '/echo?acao=*&preflight=ok', { method: 'DELETE', upload: false });
    await one('uploadListeners', '/echo?acao=*&preflight=ok', { method: 'POST', body: 'x' });
    await one('uploadListenersFail', '/echo', { method: 'POST', body: 'abc' });
    // jsdom preflights once any listener was added to upload, even removed.
    for (const [name, prep] of [
      ['touched', (x) => x.upload],
      [
        'handlerNull',
        (x) => {
          x.upload.onload = null;
        },
      ],
      [
        'addedRemoved',
        (x) => {
          const f = () => {};
          x.upload.addEventListener('load', f);
          x.upload.removeEventListener('load', f);
        },
      ],
      [
        'handlerSetUnset',
        (x) => {
          x.upload.onload = () => {};
          x.upload.onload = null;
        },
      ],
    ]) {
      await one(name, '/echo?acao=*&preflight=ok', { method: 'POST', body: 'x', prep, upload: false });
    }
    // Redirects across origins.
    await one('crossToCross', `/redirect?acao=*&to=${encodeURIComponent(`${c.CROSS}/echo?acao=*`)}`, { upload: false });
    await one('crossToSame', `/redirect?acao=*&to=${encodeURIComponent(`${c.BASE}/echo`)}`, { upload: false });
    return out;
  },
  // Redirects across origins: the CORS checks of each hop, the Origin and
  // Referer each hop sends, responseURL's fragment (Copilot review on #89).
  async redirectHops(w, c) {
    const out = {};
    const R = (from, to, query = '') => `${from}/redirect?code=302${query}&to=${encodeURIComponent(to)}`;
    const one = async (name, url, { method = 'GET', body, code } = {}) => {
      const n = c.server.requests.length;
      const { x, log } = await request(w, method, code ? url.replace('code=302', `code=${code}`) : url, { body });
      // (Ports appear encoded in the URLs too.)
      const ports = (v) => v.replaceAll(String(c.PORT), 'PORT');
      // (Without the Referer's fragment: jsdom before 28 sends a redirected
      // request's previous URL with it, warpdom without; the differences test.)
      const hops = c.server.requests
        .slice(n)
        .map((r) =>
          ports(
            `${r.method} ${r.headers.host}${r.path.split('?')[0]} origin=${r.headers.origin ?? '-'} referer=${r.headers.referer?.split('#')[0] ?? '-'}`,
          ),
        );
      // (The echoed body's length goes with the Referer.)
      out[name] = [
        x.status,
        ports(x.responseURL),
        log.filter((l) => /^(load|error) /.test(l)).map((l) => l.replace(/\/\d+\/\d+$/, '')),
        hops,
      ];
    };
    const origin = encodeURIComponent(c.BASE);
    await one('crossToSameAllowsNull', R(c.CROSS, `${c.BASE}/echo?acao=null`, '&acao=*'));
    await one('crossToSameAllowsOrigin', R(c.CROSS, `${c.BASE}/echo?acao=${origin}`, '&acao=*'));
    await one('crossToCrossAllowsOrigin', R(c.CROSS, `${c.CROSS}/echo?acao=${origin}`, '&acao=*'));
    await one('sameToCrossToSame', R(c.BASE, R(c.CROSS, `${c.BASE}/echo`, '&acao=*')));
    await one('sameToCrossToSameAllowsOrigin', R(c.BASE, R(c.CROSS, `${c.BASE}/echo?acao=${origin}`, '&acao=*')));
    await one('sameToSame', R(c.BASE, `${c.BASE}/echo#frag`));
    await one('fragmentOfTheRequest', `${R(c.BASE, `${c.BASE}/echo`)}#first`);
    // No preflight for a redirected request, in any version.
    await one('putToCross', R(c.BASE, `${c.CROSS}/echo?acao=*`), { method: 'PUT', body: 'x', code: 307 });
    // jsdom before 28 fires error and then load for these (warpdom: error, see
    // the differences test).
    if (c.jsdom >= 28) {
      await one('crossRedirectWithoutAllowOrigin', R(c.CROSS, `${c.CROSS}/echo?acao=*`));
      await one('crossRedirectWithoutAllowOriginToSame', R(c.CROSS, `${c.BASE}/echo?acao=*`));
      await one('sameToCrossRedirectWithoutAllowOrigin', R(c.BASE, R(c.CROSS, `${c.CROSS}/echo?acao=*`)));
      await one('sameToCrossRedirectWithoutAllowOriginToSame', R(c.BASE, R(c.CROSS, `${c.BASE}/echo?acao=*`)));
    }
    return out;
  },
  // An about:blank iframe has its parent's origin and base URL (taken at
  // creation from jsdom 26); removing the frame stops its requests and its
  // frames' (Copilot review on #89). (jsdom sends about:blank as Referer.)
  async aboutBlankFrames(w, c) {
    const out = {};
    const base = w.document.createElement('base');
    base.href = `${c.BASE}/sub/`;
    w.document.head.append(base);
    const frame = w.document.createElement('iframe');
    w.document.body.append(frame);
    const child = frame.contentWindow;
    base.href = `${c.BASE}/other/`;
    out.frame = [child.origin, child.location.origin, child.document.URL, port(child.document.baseURI)];
    for (const [name, url] of [
      ['same', `${c.BASE}/echo`],
      ['relative', 'echo'],
      ['cross', `${c.CROSS}/echo`],
    ]) {
      const n = c.server.requests.length;
      const { x, log } = await request(child, 'GET', url);
      const sent = c.server.requests.slice(n)[0];
      out[name] = [
        log.at(-2).split(' ').slice(0, 3),
        x.status,
        port(x.responseURL),
        sent ? port(sent.headers.origin ?? '-') : null,
      ];
    }
    // With a fragment or query, about:blank has neither its creator's origin
    // nor its base URL in any jsdom (the standard ignores the fragment): a
    // relative URL throws, and requests carry Origin: null (#92).
    for (const src of ['about:blank#sec', 'about:blank?q', 'about:blank#']) {
      const other = w.document.createElement('iframe');
      other.src = src;
      w.document.body.append(other);
      const win = other.contentWindow;
      const n = c.server.requests.length;
      const { x } = await request(win, 'GET', `${c.BASE}/echo`);
      const sent = c.server.requests.slice(n)[0];
      out[src] = [
        win.origin,
        win.location.href,
        port(win.document.baseURI),
        attempt(() => new win.XMLHttpRequest().open('GET', 'echo')),
        x.status,
        sent ? (sent.headers.origin ?? '-') : null,
      ];
    }
    base.remove();
    const nested = child.document.createElement('iframe');
    child.document.body.append(nested);
    const log = [];
    for (const [name, win] of [
      ['child', child],
      ['nested', nested.contentWindow],
    ]) {
      const x = new win.XMLHttpRequest();
      for (const type of ['readystatechange', 'load', 'error', 'abort', 'loadend'])
        x.addEventListener(type, () => log.push(`${name} ${type} ${x.readyState}`));
      x.open('GET', `${c.BASE}/slow?wait=100&n=2`);
      x.send();
    }
    await wait(20);
    frame.remove();
    log.push('removed');
    await wait(400);
    out.removed = log;
    return out;
  },
  async conversions(w, c) {
    const out = {};
    const x = new w.XMLHttpRequest();
    x.open('POST', `${c.BASE}/echo`);
    out.sharedArrayBuffer = attempt(() => x.send(new Uint8Array(new SharedArrayBuffer(4))));
    const y = new w.XMLHttpRequest();
    y.open('GET', `${c.BASE}/x`, false);
    out.syncResponseType = ['nosuchtype', 'json'].map((v) =>
      attempt(() => {
        y.responseType = v;
        return y.responseType;
      }),
    );
    const calls = [];
    const value = (name, v) => ({
      toString() {
        calls.push(name);
        return v;
      },
    });
    new w.XMLHttpRequest().open(
      value('method', 'GET'),
      value('url', '/x'),
      true,
      value('user', 'a'),
      value('password', 'b'),
    );
    new w.XMLHttpRequest().open('GET', '/x', true, null, undefined);
    out.toString = calls.slice();
    // Conversions come first, and their exceptions propagate (#92).
    const throwing = (name) => ({
      toString() {
        calls.push(name);
        throw new RangeError(`${name} toString`);
      },
    });
    calls.length = 0;
    out.conversionErrors = [
      attempt(() => new w.XMLHttpRequest().open('GET', throwing('url'))),
      attempt(() => new w.XMLHttpRequest().open('bad method', throwing('url after a bad method'))),
      attempt(() => new w.XMLHttpRequest().open(throwing('method'), throwing('url after the method'))),
      attempt(() => new w.XMLHttpRequest().open('GET', '/x', true, throwing('user'))),
      attempt(() => new w.XMLHttpRequest().open('GET', 'http://[', true, null, throwing('password after a bad URL'))),
      attempt(() => new w.XMLHttpRequest().open('GET', Symbol('url'))),
      attempt(() => new w.XMLHttpRequest().open(Symbol('method'), '/x')),
      attempt(() => new w.XMLHttpRequest().open('GET', '/x', true, Symbol('user'))),
      attempt(() => new w.XMLHttpRequest().open('GET', '/x', true, 'u', Symbol('password'))),
      attempt(() => new w.XMLHttpRequest().open('G€T', '/x')),
      calls.slice(),
    ];
    const z = new w.XMLHttpRequest();
    z.responseType = 'json';
    z.open('GET', `${c.BASE}/type?ct=application/json&body=fffe7b007d00&enc=hex`);
    z.send();
    await done(z);
    out.utf16JSON = z.response;
    return out;
  },
  async urls(w, c) {
    const out = [];
    // Non-ASCII and undecodable credentials (jsdom 20: UTF-8 in Basic
    // authorization; %FF a network error) (Copilot review on #89).
    const credentials = ['é:p', 'u:€', '%C3%A9:p%3A', '%FF:p'].map((cred) => `http://${cred}@localhost:${c.PORT}/echo`);
    for (const u of [
      'echo?q=1',
      '/echo#frag',
      '../echo',
      `//localhost:${c.PORT}/echo`,
      `${c.BASE}/ech%6F?a b`,
      `http://u:p@localhost:${c.PORT}/echo`,
      ...credentials,
    ]) {
      const { x } = await request(w, 'GET', u);
      out.push([
        port(u),
        x.status,
        port(x.responseURL),
        x.status === 200 ? (JSON.parse(x.responseText).headers.authorization ?? null) : null,
      ]);
    }
    const x = new w.XMLHttpRequest();
    x.open('GET', `${c.BASE}/echo`, true, 'user', 'pass');
    x.send();
    await done(x);
    out.push(['user and password', JSON.parse(x.responseText).headers.authorization ?? null]);
    const base = w.document.createElement('base');
    base.href = `${c.BASE}/sub/dir/`;
    w.document.head.append(base);
    const { x: y } = await request(w, 'GET', 'file');
    out.push(['base', y.status, port(y.responseURL)]);
    base.remove();
    return out;
  },
  async dataURLs(w, c) {
    const out = [];
    for (const [method, url] of [
      ['GET', 'data:text/plain;base64,aGk='],
      ['POST', 'data:,x'],
      ['GET', 'data:text/html,%3Cp%3E'],
    ]) {
      const { x, log } = await request(w, method, url, { body: method === 'POST' ? 'a' : undefined, upload: true });
      out.push([x.status, x.statusText, x.responseText, x.getAllResponseHeaders(), x.responseURL, log]);
    }
    return out;
  },
};

// --- parity -------------------------------------------------------------------------------------

const nodeVersion = process.versions.node.split('.').map(Number);
const atLeast = (version, min) => {
  for (let i = 0; i < 3; i++) if (version[i] !== min[i]) return version[i] > min[i];
  return true;
};
const satisfies = (range) =>
  range.split('||').some((alternative) =>
    alternative
      .trim()
      .split(/\s+/)
      .every((comparator) => {
        const match = /^(\^|>=)(\d+)(?:\.(\d+))?(?:\.(\d+))?$/.exec(comparator);
        const min = match.slice(2).map((part) => Number(part ?? 0));
        return atLeast(nodeVersion, min) && (match[1] === '>=' || nodeVersion[0] === min[0]);
      }),
  );

// Console output, as both print it: the first line, without "Error: ".
// jsdom before 27 words a listener's exception "Uncaught [Error: boom]".
// What a window reports (exceptions in listeners, jsdom's XHR errors before
// 27): jsdom's through its virtual console, warpdom's through the hooks the
// test environments set; per window, as the scenarios run at the same time.
// jsdom before 27 words a listener's exception "Uncaught [Error: boom]".
const message = (e) => String(e?.message ?? e).replace(/^Uncaught \[\w*Error: (.*)\]$/, '$1');

async function run(window, scenario, ctx, errors) {
  // Ports are the server's (each side has its own).
  const result = await scenario(window, ctx);
  return {
    result: result === undefined ? result : JSON.parse(port(JSON.stringify(result))),
    errors: errors.map((e) => port(message(e))),
  };
}

// Every scenario on jsdom 20, 27, 28 and 30 (each side of the two
// boundaries), a few on 22, 25 and 26.
const parityTests = [];
const VERSIONS = {
  jsdom20: 'all',
  jsdom22: ['shape', 'events', 'cors', 'timeouts'],
  jsdom25: ['bodies', 'aborts', 'aboutBlankFrames'],
  jsdom26: ['states', 'setRequestHeader', 'errors', 'aboutBlankFrames'],
  jsdom27: 'all',
  jsdom28: 'all',
  jsdom30: 'all',
};
for (const [alias, which] of Object.entries(VERSIONS)) {
  const pkg = require(`${alias}/package.json`);
  const jsdom = Number.parseInt(pkg.version, 10);
  const skip =
    pkg.engines?.node && !satisfies(pkg.engines.node) && `jsdom ${pkg.version} needs Node ${pkg.engines.node}`;
  for (const [name, scenario] of Object.entries(SCENARIOS)) {
    if (which !== 'all' && !which.includes(name)) continue;
    parityTests.push([
      `${name} (jsdom ${pkg.version})`,
      skip,
      async () => {
        const { JSDOM, VirtualConsole } = require(alias);
        // jsdom and warpdom run at the same time, each against its own server.
        const servers = await Promise.all([startServer(), startServer()]);
        const contexts = servers.map((srv) => ({
          jsdom,
          server: srv,
          PORT: srv.port,
          BASE: `http://localhost:${srv.port}`,
          CROSS: `http://127.0.0.1:${srv.port}`,
          DEAD,
        }));
        const theirErrors = [];
        const virtualConsole = new VirtualConsole();
        virtualConsole.on('jsdomError', (e) => theirErrors.push(e));
        const theirs = new JSDOM('<!doctype html><html><head></head><body></body></html>', {
          url: `${contexts[0].BASE}/page/index.html`,
          runScripts: 'dangerously',
          pretendToBeVisual: true,
          virtualConsole,
        });
        const ours = createWindow({ url: `${contexts[1].BASE}/page/index.html`, jsdom: pkg.version });
        const ourErrors = [];
        ours[S].onUnhandledError = (e) => ourErrors.push(e);
        ours[S].reportNotImplemented = (text) => ourErrors.push(text);
        let expected, actual;
        try {
          [expected, actual] = await Promise.all([
            run(theirs.window, scenario, contexts[0], theirErrors),
            run(ours, scenario, contexts[1], ourErrors),
          ]);
        } finally {
          theirs.window.close();
          await Promise.all(servers.map((srv) => srv.close()));
        }
        // Network failures are reported in other words (Node's http module vs fetch).
        if (name === 'errors' || name === 'failedResponses') {
          expected.errors = expected.errors.length;
          actual.errors = actual.errors.length;
        }
        assert.deepEqual(actual, expected);
      },
    ]);
  }
}
// Several at a time: most of the time goes to waiting for the server.
suite('XMLHttpRequest parity with jsdom', { concurrency: 6 }, () => {
  for (const [name, skip, fn] of parityTests) test(name, { skip }, fn);
});

// The refused port is never one a test server gets: scenarios run
// concurrently, each starting servers on port 0, and a closed ephemeral port
// handed to one of them made it answer another scenario's refused requests
// (#109: a refused request got a 404, and the cors scenario saw the refused
// requests' preflights).
test('XMLHttpRequest tests: the refused port is below the ports test servers get, and refuses connections', async () => {
  assert.ok(DEAD >= 1024 && DEAD < EPHEMERAL_PORTS_FROM, `refused port ${DEAD}`);
  const started = await Promise.all(Array.from({ length: 20 }, () => startServer()));
  const ports = [PORT, ...started.map((srv) => srv.port)];
  await Promise.all(started.map((srv) => srv.close()));
  for (const p of ports) assert.ok(p >= EPHEMERAL_PORTS_FROM, `test server port ${p}`);
  // Each loopback address by itself: with localhost, a failed ::1 attempt
  // (no IPv6) would give its code to the error for both attempts.
  const refusal = (host) =>
    new Promise((resolve) => {
      const socket = net.connect({ port: DEAD, host });
      socket.on('connect', () => {
        socket.destroy();
        resolve('connected');
      });
      socket.on('error', (e) => resolve(e.code));
    });
  assert.equal(await refusal('127.0.0.1'), 'ECONNREFUSED');
  const v6 = await refusal('::1');
  assert.ok(
    ['ECONNREFUSED', 'EADDRNOTAVAIL', 'EAFNOSUPPORT', 'ENETUNREACH', 'EHOSTUNREACH'].includes(v6),
    `::1: ${v6}`,
  );
});

// Another program's server on a loopback address and a test server's port
// would get the requests for that address (macOS lets both listen there):
// the test server takes another port.
test('XMLHttpRequest tests: a test server does not share its port with another program on 127.0.0.1', async () => {
  const other = http.createServer((req, res) => res.end('other program'));
  await new Promise((resolve) => other.listen(0, '127.0.0.1', resolve));
  const srv = await startServer({ port: other.address().port });
  try {
    const body = await new Promise((resolve, reject) => {
      http
        .get(`http://127.0.0.1:${srv.port}/type?body=test%20server`, (res) => {
          let text = '';
          res.setEncoding('utf8');
          res.on('data', (c) => (text += c));
          res.on('end', () => resolve(text));
        })
        .on('error', reject);
    });
    assert.equal(body, 'test server');
  } finally {
    await srv.close();
    await new Promise((resolve) => other.close(resolve));
  }
});

// --- warpdom ------------------------------------------------------------------------------------

test('XMLHttpRequest: the interfaces are created on first use', () => {
  const w = createWindow();
  for (const name of ['XMLHttpRequest', 'XMLHttpRequestEventTarget', 'XMLHttpRequestUpload']) {
    assert.equal(typeof Object.getOwnPropertyDescriptor(w, name).get, 'function', `${name} is still an accessor`);
  }
  assert.equal(typeof w.XMLHttpRequest, 'function');
  assert.equal(typeof Object.getOwnPropertyDescriptor(w, 'XMLHttpRequest').value, 'function');
  assert.equal(
    typeof Object.getOwnPropertyDescriptor(w, 'XMLHttpRequestUpload').get,
    'function',
    'the upload interface waits for its first use',
  );
});

test('XMLHttpRequest: each window has its own interfaces', () => {
  const a = createWindow();
  const b = createWindow();
  assert.notEqual(a.XMLHttpRequest, b.XMLHttpRequest);
  assert.ok(!(new a.XMLHttpRequest() instanceof b.XMLHttpRequest));
  assert.throws(() => b.XMLHttpRequest.prototype.open.call(new a.XMLHttpRequest().upload, 'GET', '/'), TypeError);
});

test('xhr: false leaves the three interfaces out, in frames too; ProgressEvent stays', () => {
  const w = createWindow({ xhr: false, url: 'http://localhost/' });
  for (const name of ['XMLHttpRequest', 'XMLHttpRequestEventTarget', 'XMLHttpRequestUpload'])
    assert.equal(name in w, false, name);
  assert.equal(typeof w.ProgressEvent, 'function');
  const iframe = w.document.createElement('iframe');
  w.document.body.append(iframe);
  assert.equal('XMLHttpRequest' in iframe.contentWindow, false);
  const on = createWindow({ xhr: true, url: 'http://localhost/' });
  const frame = on.document.createElement('iframe');
  on.document.body.append(frame);
  assert.equal(typeof frame.contentWindow.XMLHttpRequest, 'function');
  for (const option of [undefined, 0, null, 'no'])
    assert.equal(typeof createWindow({ xhr: option }).XMLHttpRequest, 'function', String(option));
});

test('xhr: Vitest environmentOptions.warpdom.xhr and Jest testEnvironmentOptions.xhr', async () => {
  const { default: vitest } = await import('../src/vitest.js');
  for (const [options, has] of [
    [{ warpdom: { xhr: false } }, false],
    [{}, true],
    [{ warpdom: { xhr: true } }, true],
  ]) {
    const env = await vitest.setupVM(options);
    try {
      const vm = await import('node:vm');
      assert.equal(
        vm.runInContext('typeof XMLHttpRequest', env.getVmContext()),
        has ? 'function' : 'undefined',
        JSON.stringify(options),
      );
    } finally {
      env.teardown();
    }
  }
  const { default: JestEnvironment } = await import('../src/jest.js');
  for (const [options, has] of [
    [{ xhr: false }, false],
    [{}, true],
  ]) {
    const env = new JestEnvironment({ projectConfig: { rootDir: process.cwd(), testEnvironmentOptions: options } });
    try {
      assert.equal(typeof env.global.XMLHttpRequest, has ? 'function' : 'undefined', JSON.stringify(options));
    } finally {
      await env.teardown();
    }
  }
});

test('XMLHttpRequest: synchronous requests throw at send(), with what to do', () => {
  const w = createWindow({ url: PAGE });
  const x = new w.XMLHttpRequest();
  const log = [];
  x.onreadystatechange = () => log.push(x.readyState);
  x.onloadstart = () => log.push('loadstart');
  x.open('GET', `${BASE}/text`, false);
  assert.throws(
    () => x.send(),
    (e) =>
      e instanceof DOMException &&
      e.name === 'NotSupportedError' &&
      /synchronous XMLHttpRequest/.test(e.message) &&
      /asynchronous/.test(e.message),
  );
  assert.deepEqual([log, x.readyState], [[1], 1]);
  // The request can still be opened again, asynchronously.
  x.open('GET', `${BASE}/text`);
  assert.equal(x.readyState, 1);
});

test('XMLHttpRequest: a window reset or an environment teardown stops its requests without events', async () => {
  const w = createWindow({ url: PAGE });
  snapshotWindow(w);
  const x = new w.XMLHttpRequest();
  const log = [];
  logEvents(x, log);
  x.open('GET', `${BASE}/slow?n=3&ms=50`);
  x.send();
  resetWindow(w);
  await wait(250);
  assert.deepEqual(log, ['readystatechange 1 0', 'loadstart 1 0 false/0/0']);
  const { default: JestEnvironment } = await import('../src/jest.js');
  const env = new JestEnvironment({ projectConfig: { rootDir: process.cwd(), testEnvironmentOptions: { url: PAGE } } });
  const y = new env.global.XMLHttpRequest();
  const events = [];
  y.onloadend = () => events.push('loadend');
  y.open('GET', `${BASE}/slow?n=3&ms=50`);
  y.send();
  await env.teardown();
  await wait(250);
  assert.deepEqual(events, []);
});

test("XMLHttpRequest: a window reset or an environment teardown stops its frames' requests too", async () => {
  // A frame's and a nested frame's request each, then the reset or teardown.
  const start = (w, events) => {
    const frame = w.document.createElement('iframe');
    w.document.body.append(frame);
    const nested = frame.contentDocument.createElement('iframe');
    frame.contentDocument.body.append(nested);
    for (const win of [frame.contentWindow, nested.contentWindow]) {
      const x = new win.XMLHttpRequest();
      x.onreadystatechange = () => events.push(x.readyState);
      x.onloadend = () => events.push('loadend');
      x.open('GET', `${BASE}/slow?n=3&ms=50`);
      x.send();
    }
  };
  const w = createWindow({ url: PAGE });
  snapshotWindow(w);
  const reset = [];
  start(w, reset);
  resetWindow(w);
  const { default: JestEnvironment } = await import('../src/jest.js');
  const env = new JestEnvironment({ projectConfig: { rootDir: process.cwd(), testEnvironmentOptions: { url: PAGE } } });
  const teardown = [];
  start(env.global, teardown);
  await env.teardown();
  const { default: vitest } = await import('../src/vitest.js');
  const vm = await vitest.setupVM({ warpdom: { url: PAGE } });
  const vmTeardown = [];
  start(vm.getVmContext(), vmTeardown);
  vm.teardown();
  await wait(300);
  assert.deepEqual(
    [reset, teardown, vmTeardown],
    [
      [1, 1],
      [1, 1],
      [1, 1],
    ],
  );
});

test('XMLHttpRequest: fake timers on the global do not stop requests or timeouts', async () => {
  const w = createWindow({ url: PAGE });
  const { setTimeout: realSetTimeout } = globalThis;
  // A fake that never fires, with the timer object's methods Node's own
  // fetch calls.
  globalThis.setTimeout = () => ({
    ref() {
      return this;
    },
    unref() {
      return this;
    },
    hasRef: () => false,
    refresh() {
      return this;
    },
  });
  try {
    const x = new w.XMLHttpRequest();
    const log = [];
    x.ontimeout = () => log.push('timeout');
    x.open('GET', `${BASE}/hang`);
    x.timeout = 50;
    x.send();
    // (The test's server, in this process, has no timers on this route.)
    const y = new w.XMLHttpRequest();
    y.onload = () => log.push(`load ${y.responseText}`);
    y.open('GET', `${BASE}/type?body=ok`);
    y.send();
    await new Promise((resolve) => realSetTimeout(resolve, 300));
    assert.deepEqual(log.sort(), ['load ok', 'timeout']);
  } finally {
    globalThis.setTimeout = realSetTimeout;
  }
});

test('XMLHttpRequest: a faked or frozen Date does not change how much of a timeout is left', async () => {
  const w = createWindow({ url: PAGE });
  const realNow = Date.now;
  // fake(): the Date.now() a test's fake timers install, at send() (frozen
  // there) or just after it (10 s ahead).
  const outcome = async (fake, afterSend) => {
    if (!afterSend) Date.now = fake();
    try {
      const x = new w.XMLHttpRequest();
      const start = realNow();
      const result = new Promise((resolve) => {
        x.ontimeout = () => resolve(['timeout', realNow() - start]);
        x.onload = () => resolve(['load', realNow() - start]);
      });
      x.open('GET', `${BASE}/slow?wait=800&n=1`);
      x.timeout = 5000;
      x.send();
      if (afterSend) Date.now = fake();
      // 200 ms in, a 400 ms timeout has 200 ms left (frozen Date: 400 ms;
      // 10 s ahead: none).
      await wait(200);
      x.timeout = 400;
      return await result;
    } finally {
      Date.now = realNow;
    }
  };
  for (const [fake, afterSend] of [
    [
      () => {
        const t = realNow();
        return () => t;
      },
      false,
    ],
    [() => () => realNow() + 10_000, true],
  ]) {
    const [type, elapsed] = await outcome(fake, afterSend);
    assert.equal(type, 'timeout');
    assert.ok(elapsed >= 340 && elapsed < 540, `timed out after ${elapsed} ms`);
  }
});

test("XMLHttpRequest: responses and documents belong to the window's realm", async () => {
  const { default: JestEnvironment } = await import('../src/jest.js');
  const env = new JestEnvironment({ projectConfig: { rootDir: process.cwd(), testEnvironmentOptions: { url: PAGE } } });
  try {
    const vm = await import('node:vm');
    const result = await vm.runInContext(
      `(async () => {
      const get = (type, url) => new Promise((resolve) => { const x = new XMLHttpRequest(); x.responseType = type; x.onload = () => resolve(x.response); x.open('GET', url); x.send(); });
      const json = await get('json', '${BASE}/type?ct=application/json&body=%7B%22a%22%3A%5B1%5D%7D');
      const buffer = await get('arraybuffer', '${BASE}/type?body=AB');
      const blob = await get('blob', '${BASE}/type?body=AB');
      const doc = await get('document', '${BASE}/type?ct=text/html&body=x');
      return [json instanceof Object, json.a instanceof Array, buffer instanceof ArrayBuffer, blob instanceof Blob, doc instanceof Document, doc.ownerDocument];
    })()`,
      env.getVmContext(),
    );
    assert.deepEqual([...result], [true, true, true, true, true, null]);
  } finally {
    await env.teardown();
  }
});

// Documented differences (README, "Differences from jsdom"), so a change in
// them is noticed.
test('XMLHttpRequest differences from jsdom: headers sorted and combined, cookies not shared, file: URLs fail', async () => {
  const w = createWindow({ url: PAGE });
  const { x } = await request(w, 'GET', `${BASE}/text`);
  assert.equal(
    x.getAllResponseHeaders().replace(/date: [^\r]+/, 'date: D'),
    'connection: keep-alive\r\ncontent-type: text/plain; charset=utf-8\r\ndate: D\r\nkeep-alive: timeout=5\r\ntransfer-encoding: chunked\r\nx-a: 1\r\nx-b: 2\r\nx-multi: a, b',
  );
  // jsdom: document.cookie gets the response's cookies, and requests send the document's.
  await request(w, 'GET', `${BASE}/setcookie`);
  assert.equal(w.document.cookie, '');
  w.document.cookie = 'a=1; path=/';
  const { x: echo } = await request(w, 'GET', `${BASE}/echo`);
  assert.equal(JSON.parse(echo.responseText).headers.cookie, undefined);
  const { x: file, log } = await request(w, 'GET', 'file:///etc/hosts');
  assert.deepEqual([file.status, log.at(-2)], [0, 'error 4 0 false/0/0']);
  // jsdom 28 and later send no body for a DataView; warpdom sends its bytes.
  const { x: view } = await request(w, 'POST', `${BASE}/echo`, { body: new DataView(new Uint8Array([70, 71]).buffer) });
  assert.equal(JSON.parse(view.responseText).body, 'FG');
  // A redirect that fails its CORS check: jsdom before 28 fires error and
  // then goes on to load the redirect; warpdom stops at the error.
  const legacy = createWindow({ url: PAGE, jsdom: '27.4.0' });
  legacy[S].reportNotImplemented = () => {};
  const n = server.requests.length;
  const { x: redirected, log: events } = await request(
    legacy,
    'GET',
    `${CROSS}/redirect?code=302&to=${encodeURIComponent(`${CROSS}/echo?acao=*`)}`,
  );
  assert.deepEqual(
    [
      redirected.status,
      events.filter((l) => /^(load|error) /.test(l)).map((l) => l.split(' ')[0]),
      server.requests.length - n,
    ],
    [0, ['error'], 1],
  );
  // An about:blank frame's requests send no Referer (jsdom: about:blank).
  const frame = w.document.createElement('iframe');
  w.document.body.append(frame);
  const { x: fromFrame } = await request(frame.contentWindow, 'GET', '/echo');
  assert.equal(JSON.parse(fromFrame.responseText).headers.referer, undefined);
  // The Referer has neither credentials nor a fragment (jsdom sends the
  // document's URL with both, and before 28 a redirected request's previous
  // URL as it was requested) (Copilot review on #89).
  const secret = createWindow({ url: `http://user:secret@localhost:${PORT}/page/index.html#frag` });
  const referers = async (win, url) => {
    const before = server.requests.length;
    await request(win, 'GET', url);
    return server.requests.slice(before).map((r) => port(`${r.method} ${r.headers.referer ?? '-'}`));
  };
  assert.deepEqual(await referers(secret, `${BASE}/echo`), ['GET http://localhost:PORT/page/index.html']);
  assert.deepEqual(await referers(secret, `${CROSS}/echo?acao=*`), ['GET http://localhost:PORT/page/index.html']);
  assert.deepEqual(await referers(legacy, `http://u:p@localhost:${PORT}/redirect?code=302&to=%2Fecho#private-token`), [
    'GET http://localhost:PORT/page/index.html',
    'GET http://localhost:PORT/redirect?code=302&to=%2Fecho',
  ]);
});

test('XMLHttpRequest: a request stopped while its response arrives fires nothing more and leaves no response (Copilot review on #89)', async () => {
  const hostFetch = globalThis.fetch;
  try {
    for (const stopWith of ['abort', 'open']) {
      const w = createWindow({ url: PAGE });
      const x = new w.XMLHttpRequest();
      const log = [];
      logEvents(x, log);
      let cancelled = false;
      let fetched;
      // The response arrives; a continuation registered on fetch's promise
      // after XHR's stops the request before XHR goes on with it.
      globalThis.fetch = () =>
        (fetched = Promise.resolve().then(
          () =>
            new Response(
              new ReadableStream({
                start(controller) {
                  controller.enqueue(new TextEncoder().encode('stale'));
                  controller.close();
                },
                cancel() {
                  cancelled = true;
                },
              }),
              { headers: { 'content-type': 'text/plain' } },
            ),
        ));
      x.open('GET', `${BASE}/text`);
      x.send();
      fetched.then(() => (stopWith === 'abort' ? x.abort() : x.open('GET', `${BASE}/echo`)));
      await wait(50);
      assert.deepEqual(
        [stopWith, log.filter((l) => !l.startsWith('loadstart'))],
        [
          stopWith,
          stopWith === 'abort'
            ? ['readystatechange 1 0', 'readystatechange 4 0', 'abort 4 0 false/0/0', 'loadend 4 0 false/0/0']
            : ['readystatechange 1 0'],
        ],
      );
      assert.deepEqual(
        [x.readyState, x.status, x.responseText, x.getAllResponseHeaders(), cancelled],
        [stopWith === 'abort' ? 0 : 1, 0, '', '', true],
      );
    }
  } finally {
    globalThis.fetch = hostFetch;
  }
});

// A response whose body stream records its cancellation and, as a fetch
// mock may, ignores the abort signal (chunks: what it sends before waiting
// forever).
function recordingResponse(record, chunks = [], init = {}) {
  return new Response(
    new ReadableStream({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(new TextEncoder().encode(chunk));
      },
      cancel() {
        record.cancelled = true;
      },
    }),
    {
      headers: {
        'content-type': 'text/plain',
        'access-control-allow-origin': '*',
        'access-control-allow-headers': '*',
      },
      ...init,
    },
  );
}

test("XMLHttpRequest: a request stopped while its preflight is pending cancels the preflight's body (#92)", async () => {
  const hostFetch = globalThis.fetch;
  try {
    for (const stopWith of ['abort', 'open', 'teardown']) {
      const record = { cancelled: false };
      let answer;
      const methods = [];
      globalThis.fetch = (url, init) => {
        methods.push(init.method);
        return new Promise((resolve) => {
          answer = () => resolve(recordingResponse(record));
        });
      };
      const w = createWindow({ url: PAGE });
      snapshotWindow(w);
      const x = new w.XMLHttpRequest();
      const log = [];
      logEvents(x, log);
      x.open('PUT', `${CROSS}/echo`);
      x.send('abc');
      if (stopWith === 'abort') x.abort();
      else if (stopWith === 'open') x.open('GET', `${BASE}/text`);
      else resetWindow(w);
      answer();
      await wait(20);
      assert.deepEqual(
        [stopWith, methods, record.cancelled, log.filter((l) => !/^(readystatechange 1|loadstart)/.test(l))],
        [
          stopWith,
          ['OPTIONS'],
          true,
          stopWith === 'abort' ? ['readystatechange 4 0', 'abort 4 0 false/0/0', 'loadend 4 0 false/0/0'] : [],
        ],
      );
    }
  } finally {
    globalThis.fetch = hostFetch;
  }
});

test('XMLHttpRequest: a request stopped while it waits for more of the body cancels the read (#92)', async () => {
  const hostFetch = globalThis.fetch;
  try {
    for (const stopWith of ['abort', 'open', 'teardown', 'timeout']) {
      const record = { cancelled: false };
      globalThis.fetch = async () => recordingResponse(record, ['part']);
      const w = createWindow({ url: PAGE });
      snapshotWindow(w);
      const x = new w.XMLHttpRequest();
      const log = [];
      logEvents(x, log);
      x.open('GET', `${BASE}/text`);
      if (stopWith === 'timeout') x.timeout = 50;
      const progressed = new Promise((resolve) => x.addEventListener('progress', resolve, { once: true }));
      x.send();
      await progressed;
      if (stopWith === 'abort') x.abort();
      else if (stopWith === 'open') x.open('GET', `${BASE}/text`);
      else if (stopWith === 'teardown') resetWindow(w);
      await wait(stopWith === 'timeout' ? 100 : 20);
      assert.deepEqual(
        [stopWith, record.cancelled, log.at(-1)],
        [
          stopWith,
          true,
          {
            abort: 'loadend 4 0 false/0/0',
            open: 'readystatechange 1 0',
            teardown: 'progress 3 200 false/4/0',
            timeout: 'loadend 4 200 false/0/0',
          }[stopWith],
        ],
      );
    }
  } finally {
    globalThis.fetch = hostFetch;
  }
});

// jsdom goes on after such a stop: the upload's load and loadend, and from
// 28 a readystatechange (readyState 2) at the stopped or reopened request.
// warpdom stops, as the standard (README).
test('XMLHttpRequest: a request stopped in an upload handler fires nothing more and cancels the body (#92)', async () => {
  const hostFetch = globalThis.fetch;
  try {
    for (const jsdom of ['27.4.0', '30.1.3']) {
      for (const stopWith of ['abort', 'open']) {
        const record = { cancelled: false };
        globalThis.fetch = async () => recordingResponse(record, ['part']);
        const w = createWindow({ url: PAGE, jsdom });
        const x = new w.XMLHttpRequest();
        const log = [];
        logEvents(x, log, true);
        x.upload.addEventListener(
          'progress',
          () => {
            if (stopWith === 'abort') x.abort();
            else x.open('GET', `${BASE}/text`);
            log.push(stopWith);
          },
          { once: true },
        );
        x.open('POST', `${BASE}/echo`);
        x.send('body');
        await wait(30);
        const after = log.slice(log.findIndex((l) => l.startsWith('upload.progress')));
        const status = jsdom === '27.4.0' ? 200 : 0;
        assert.deepEqual(
          [jsdom, stopWith, record.cancelled, after, x.status],
          [
            jsdom,
            stopWith,
            true,
            stopWith === 'abort'
              ? [
                  `upload.progress ${jsdom === '27.4.0' ? 2 : 1} true/4/4`,
                  'readystatechange 4 0',
                  'abort 4 0 false/0/0',
                  'loadend 4 0 false/0/0',
                  'abort',
                ]
              : // Reopened in OPENED (from 28): no readystatechange.
                [
                  `upload.progress ${jsdom === '27.4.0' ? 2 : 1} true/4/4`,
                  ...(jsdom === '27.4.0' ? ['readystatechange 1 200'] : []),
                  'open',
                ],
            stopWith === 'abort' ? 0 : status,
          ],
        );
      }
    }
  } finally {
    globalThis.fetch = hostFetch;
  }
});

test('XMLHttpRequest: every header name the author sets reaches fetch, __proto__ too (Copilot review on #89)', async () => {
  const hostFetch = globalThis.fetch;
  const seen = [];
  globalThis.fetch = (url, init) => {
    seen.push([...new Headers(init.headers)].filter(([name]) => /^(__proto__|constructor|x-a)$/.test(name)));
    return Promise.resolve(new Response('ok'));
  };
  try {
    const w = createWindow({ url: PAGE });
    await request(w, 'GET', `${BASE}/text`, {
      prep: (x) => {
        x.setRequestHeader('__proto__', 'p');
        x.setRequestHeader('constructor', 'c');
        x.setRequestHeader('X-A', '1');
      },
    });
    assert.deepEqual(seen, [
      [
        ['__proto__', 'p'],
        ['constructor', 'c'],
        ['x-a', '1'],
      ],
    ]);
  } finally {
    globalThis.fetch = hostFetch;
  }
});

test('XMLHttpRequest: profile boundaries (jsdom 28.0.0 undici; network errors reported before 27)', async () => {
  const errors = [];
  const sequence = async (jsdom) => {
    const w = createWindow({ url: PAGE, jsdom });
    w[S].reportNotImplemented = (text) => errors.push(port(text));
    const { log } = await request(w, 'POST', `${BASE}/type?body=x`, { body: 'ab', upload: true });
    await request(w, 'GET', `${CROSS}/echo`);
    return log.filter((l) => l.startsWith('upload.progress') || l.startsWith('readystatechange 2')).join(' | ');
  };
  assert.deepEqual(await Promise.all(['27.4.0', '28.0.0'].map(sequence)), [
    'readystatechange 2 200 | upload.progress 2 true/2/2',
    'upload.progress 1 true/2/2 | readystatechange 2 200',
  ]);
  assert.deepEqual(errors, []);
  await sequence('26.1.0');
  assert.deepEqual(errors, ['Cross origin http://localhost:PORT forbidden']);
  // send() rejects a view on a SharedArrayBuffer from 27.0.1 (27.0.0 sends it).
  const shared = (jsdom) => {
    const x = new (createWindow({ url: PAGE, jsdom }).XMLHttpRequest)();
    x.open('POST', `http://localhost:${DEAD}/`);
    return attempt(() => x.send(new Uint8Array(new SharedArrayBuffer(4))));
  };
  assert.deepEqual(['27.0.0', '27.0.1'].map(shared), [
    'undefined',
    "TypeError/TypeError: Failed to execute 'send' on 'XMLHttpRequest': parameter 1 is a view on a SharedArrayBuffer, which is not allowed.",
  ]);
  // A charset naming the replacement encoding decodes to U+FFFD from 27.4.0 (27.3.0: as UTF-8).
  const replacement = async (jsdom) => {
    const { x } = await request(
      createWindow({ url: PAGE, jsdom }),
      'GET',
      `${BASE}/type?ct=${encodeURIComponent('text/plain;charset=iso-2022-kr')}&body=abc`,
    );
    return x.responseText;
  };
  assert.deepEqual(await Promise.all(['27.3.0', '27.4.0'].map(replacement)), ['abc', '\ufffd']);
});

test("XMLHttpRequest: fetch is asked to omit the host's credentials (cookies) on requests, preflights and redirect retries (Copilot review on #89)", async () => {
  const hostFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push(`${init.method} ${init.redirect} ${init.credentials}`);
    if (init.method === 'OPTIONS')
      return new Response(null, {
        status: 204,
        headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' },
      });
    if (init.redirect === 'manual' && calls.length === 2)
      return {
        type: 'opaqueredirect',
        status: 0,
        statusText: '',
        headers: new Headers(),
        body: null,
        redirected: false,
        url: '',
      };
    return new Response('ok', { headers: { 'access-control-allow-origin': '*' } });
  };
  try {
    const w = createWindow({ url: PAGE });
    await request(w, 'PUT', `${CROSS}/echo`, { body: 'x' });
    await request(w, 'GET', `${BASE}/text`);
    await request(w, 'GET', `${BASE}/text`, {
      prep: (x) => {
        x.withCredentials = true;
      },
    });
    // A preflight, the request (an opaque redirect), its retry, then two
    // requests (one withCredentials: still no host cookies).
    assert.deepEqual(calls, [
      'OPTIONS manual omit',
      'PUT manual omit',
      'PUT follow omit',
      'GET follow omit',
      'GET follow omit',
    ]);
  } finally {
    globalThis.fetch = hostFetch;
  }
});

test('XMLHttpRequest: a host whose fetch hides redirects (opaqueredirect) follows them itself (Copilot review on #89)', async () => {
  const hostFetch = globalThis.fetch;
  try {
    for (const jsdom of ['27.4.0', '30.1.3']) {
      const calls = [];
      // A browser's fetch: redirect 'manual' gives an opaque redirect
      // (status 0, no Location); 'follow' gives the final response.
      globalThis.fetch = async (url, init) => {
        calls.push(`${init.method} ${port(url)} ${init.redirect}`);
        if (init.redirect === 'manual')
          return {
            type: 'opaqueredirect',
            status: 0,
            statusText: '',
            headers: new Headers(),
            body: null,
            redirected: false,
            url: '',
          };
        const response = new Response(`body of ${init.method}`, { headers: { 'content-type': 'text/plain' } });
        Object.defineProperties(response, { redirected: { value: true }, url: { value: `${BASE}/final` } });
        return response;
      };
      const w = createWindow({ url: PAGE, jsdom });
      const first = await request(w, 'POST', `${BASE}/redirect#frag`, { body: 'x' });
      const second = await request(w, 'GET', `${BASE}/redirect`);
      assert.deepEqual(
        [first.x.status, first.x.responseText, port(first.x.responseURL), first.log.at(-2).split(' ')[0]],
        [
          200,
          'body of POST',
          jsdom === '27.4.0' ? 'http://localhost:PORT/final' : 'http://localhost:PORT/final#frag',
          'load',
        ],
      );
      assert.deepEqual(
        [second.x.status, second.x.responseText, port(second.x.responseURL)],
        [200, 'body of GET', 'http://localhost:PORT/final'],
      );
      // The request that finds it out is sent again; later ones go straight to 'follow'.
      assert.deepEqual(calls, [
        'POST http://localhost:PORT/redirect#frag manual',
        'POST http://localhost:PORT/redirect#frag follow',
        'GET http://localhost:PORT/redirect follow',
      ]);
    }
  } finally {
    globalThis.fetch = hostFetch;
  }
});
