// document.cookie, checked against jsdom on a local and a remote host,
// over http and https.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWindow } from '../src/node.js';
import { parity } from './parity.js';

const scenarios = {
  basics: (d) => { d.cookie = 'a=1'; d.cookie = 'b=2; path=/'; d.cookie = 'a=3'; return d.cookie; },
  order: (d) => { d.cookie = 'x=root; path=/'; d.cookie = 'x=deep; path=/app/page'; d.cookie = 'y=app; path=/app'; d.cookie = 'z=other; path=/other'; return d.cookie; },
  defaultPath: (d) => { d.cookie = 'dp=1'; d.cookie = 'dp=2; path=/app'; d.cookie = 'dp=3; path=/'; return d.cookie; },
  expire: (d) => { d.cookie = 'a=1'; d.cookie = 'b=2'; d.cookie = 'a=; max-age=0'; d.cookie = 'b=x; expires=Thu, 01 Jan 1970 00:00:00 GMT'; d.cookie = 'c=3; max-age=-5'; d.cookie = 'e=5; max-age=100; expires=Thu, 01 Jan 1970 00:00:00 GMT'; d.cookie = 'f=6; max-age=abc'; return d.cookie; },
  noName: (d) => { d.cookie = 'justvalue'; d.cookie = '=v2'; d.cookie = ''; d.cookie = '  sp  =  ce  '; d.cookie = 'q="quoted"'; d.cookie = 'eq=a=b'; return d.cookie; },
  domain: (d) => { d.cookie = 'd1=1; domain=localhost'; d.cookie = 'd2=2; domain=.localhost'; d.cookie = 'd3=3; domain=example.com'; d.cookie = 'd4=4; domain=LOCALHOST'; d.cookie = 'd5=5; domain='; return d.cookie; },
  flags: (d) => { d.cookie = 's=1; secure'; d.cookie = 'h=2; httponly'; d.cookie = 'ss=3; samesite=strict'; d.cookie = 'sn=4; samesite=none'; d.cookie = '__Secure-x=5'; d.cookie = '__Host-y=6; path=/'; return d.cookie; },
  types: (d) => { d.cookie = 42; d.cookie = null; d.cookie = undefined; return d.cookie; },
  semicolons: (d) => { d.cookie = 'a=1;b=2'; d.cookie = 'c=3 ; path = / ; Max-Age = 50'; return d.cookie; },
  controls: (d) => { d.cookie = 'tab=a\tb'; d.cookie = 'nl=a\nb'; d.cookie = 'uni=héllo'; return d.cookie; },
};

const more = {
  secureHttp: (d) => { d.cookie = 's=1; secure'; d.cookie = 'n=2'; return d.cookie; },
  overwriteSecure: (d) => { d.cookie = 'k=1; secure'; d.cookie = 'k=2'; return d.cookie; },
  psl: (d) => { d.cookie = 'p=1; domain=com'; d.cookie = 'q=2; domain=example.com'; d.cookie = 'r=3; domain=.sub.example.com'; d.cookie = 'z=4; domain=ub.example.com'; return d.cookie; },
  pathMatch: (d) => { d.cookie = 'a=1; path=/ap'; d.cookie = 'b=2; path=/app/'; d.cookie = 'c=3; path=/app/page/'; d.cookie = 'e=5; path=app'; d.cookie = 'f=6; path=/APP'; return d.cookie; },
  replaceOrder: (d) => { d.cookie = 'a=1'; d.cookie = 'b=2'; d.cookie = 'c=3'; d.cookie = 'a=9'; return d.cookie; },
  hostVsDomain: (d) => { d.cookie = 'h=host'; d.cookie = 'h=dom; domain=' + d.location.hostname; return d.cookie; },
  longExpires: (d) => { d.cookie = 'x=1; expires=Fri, 31 Dec 9999 23:59:59 GMT'; d.cookie = 'y=2; expires=garbage'; d.cookie = 'z=3; expires=Wed, 21 Oct 2015 07:28:00 GMT; max-age=10'; return d.cookie; },
  attrsCase: (d) => { d.cookie = 'a=1; PATH=/; DOMAIN=' + d.location.hostname + '; MAX-AGE=10; SECURE'; return d.cookie; },
  spaces: (d) => { d.cookie = 'a b=c d'; d.cookie = ' lead=1'; d.cookie = 'trail=1 '; d.cookie = 'x= y'; return d.cookie; },
};

const URLS = ['http://localhost:3000/app/page', 'http://sub.example.com/app/page', 'https://sub.example.com/app/page'];
for (const [name, scenario] of Object.entries({ ...scenarios, ...more })) {
  for (const url of URLS) parity(`cookie: ${name} (${url})`, (w) => scenario(w.document), { url });
}

parity('cookie: created documents are cookie-averse', (w) => {
  const created = w.document.implementation.createHTMLDocument('');
  created.cookie = 'a=1';
  return [created.cookie, w.document.cookie];
});

// Deviation: jsdom gives a DOMParser document a cookie store of its own;
// it has no browsing context, so by the standard it is cookie-averse.
test('cookie: DOMParser documents are cookie-averse', () => {
  const w = createWindow({ url: 'http://localhost:3000/' });
  const parsed = new w.DOMParser().parseFromString('<p></p>', 'text/html');
  parsed.cookie = 'b=2';
  assert.deepEqual([parsed.cookie, w.document.cookie], ['', '']);
});
for (const url of ['about:blank', 'file:///tmp/x.html']) {
  parity(`cookie: no cookies at ${url}`, (w) => { w.document.cookie = 'a=1'; return w.document.cookie; }, { url });
}

parity('cookie: across navigation within the document', (w) => {
  const d = w.document;
  d.cookie = 'here=1';
  d.cookie = 'root=1; path=/';
  w.history.pushState(null, '', '/elsewhere/x');
  const after = d.cookie;
  w.history.pushState(null, '', '/page/deeper');
  return [after, d.cookie];
});

test('cookie: frames share the top-level window\'s cookies', async () => {
  const w = createWindow({ url: 'http://localhost:3000/' });
  w.document.cookie = 'a=1';
  const iframe = w.document.createElement('iframe');
  iframe.src = 'http://localhost:3000/frame';
  w.document.body.append(iframe);
  assert.equal(iframe.contentDocument.cookie, 'a=1');
  iframe.contentDocument.cookie = 'b=2; path=/';
  assert.equal(w.document.cookie, 'a=1; b=2');
});

test('cookie: expiry follows the clock', () => {
  const w = createWindow({ url: 'http://localhost:3000/' });
  const realNow = Date.now;
  try {
    let now = realNow();
    Date.now = () => now;
    w.document.cookie = 'short=1; max-age=10';
    w.document.cookie = 'long=1; max-age=1000';
    now += 20000;
    assert.equal(w.document.cookie, 'long=1');
  } finally {
    Date.now = realNow;
  }
});
