// Session history traversal: history.back(), forward() and go() between the
// entries of one document (pushState, replaceState, fragment navigations),
// against jsdom as a black box.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWindow } from '../src/node.js';
import { parity } from './parity.js';

const tick = async () => {
  for (let i = 0; i < 5; i++) {
    await new Promise((resolve) => setTimeout(resolve, 2));
    await new Promise((resolve) => setImmediate(resolve));
  }
};

// Fragment navigations leave history.state undefined on jsdom and null on
// warpdom (a deliberate deviation): states are logged with ?? null.
function logger(w) {
  const log = [];
  w.addEventListener('popstate', (e) =>
    log.push([
      'popstate',
      e.state ?? null,
      w.location.href,
      w.history.state ?? null,
      w.history.length,
      e.constructor.name,
      e.bubbles,
      e.cancelable,
      e.isTrusted,
    ]),
  );
  w.addEventListener('hashchange', (e) => log.push(['hashchange', e.oldURL, e.newURL, w.location.href]));
  return log;
}

for (const jsdom of [30, 26, 25]) {
  parity(
    `history: back, forward and go between pushState entries (jsdom ${jsdom})`,
    async (w) => {
      const log = logger(w);
      w.history.pushState({ n: 1 }, '', '/b');
      w.history.pushState({ n: 2 }, '', '/c');
      w.location.hash = 'x';
      await tick();
      log.push(['before', w.history.length, w.location.href]);
      w.history.back();
      log.push(['sync after back', w.location.href, w.history.state ?? null]);
      Promise.resolve().then(() => log.push(['microtask']));
      await tick();
      w.history.back();
      w.history.back(); // the same target: one move
      await tick();
      w.history.forward();
      await tick();
      w.history.go(2); // out of range
      w.history.go(-3); // out of range
      await tick();
      w.history.go(-2);
      w.history.forward(); // relative to the index when called
      await tick();
      log.push(['end', w.location.href, w.history.state ?? null, w.history.length]);
      return log;
    },
    { jsdom },
  );

  parity(
    `history: pushState and fragment navigations cancel a pending traversal, replaceState does not (jsdom ${jsdom})`,
    async (w) => {
      const log = logger(w);
      const push = () => ['/b', '/c', '/d'].forEach((p, i) => w.history.pushState({ n: i + 1 }, '', p));
      push();
      w.history.back();
      w.history.go(-2); // both run: /c, then /b
      await tick();
      log.push(['A', w.location.href]);
      w.history.back();
      w.history.pushState({ n: 9 }, '', '/z');
      await tick();
      log.push(['B', w.location.href, w.history.length]);
      w.history.back();
      w.history.replaceState({ r: 1 }, '', '/r');
      await tick();
      log.push(['C', w.location.href, w.history.state, w.history.length]);
      w.history.back();
      w.location.hash = 'h';
      await tick();
      log.push(['D', w.location.href, w.history.length]);
      w.history.back();
      w.location.replace('#r');
      await tick();
      log.push(['E', w.location.href, w.history.length]);
      return log;
    },
    { jsdom },
  );

  parity(
    `history: traversal across fragments fires hashchange; same state object (jsdom ${jsdom})`,
    async (w) => {
      const log = logger(w);
      const state = { s: 1 };
      w.history.pushState(state, '', '#frag');
      w.history.pushState({ s: 2 }, '', '/other');
      w.history.back();
      await tick();
      log.push(['same object', w.history.state === state]);
      w.history.back();
      await tick();
      w.location.hash = 'one';
      await tick();
      w.location.hash = 'two';
      await tick();
      w.history.back();
      await tick();
      w.history.forward();
      await tick();
      // A traversal from a popstate listener.
      let first = true;
      w.addEventListener('popstate', () => {
        if (first) {
          first = false;
          w.history.go(-1);
        }
      });
      w.history.back();
      await tick();
      log.push(['end', w.location.href]);
      return log;
    },
    { jsdom },
  );

  parity(
    `history: pushState and replaceState keep the object given (jsdom ${jsdom})`,
    (w) => {
      const state = { f() {}, node: w.document.body };
      w.history.pushState(state, '', '/x');
      const pushed = w.history.state === state;
      w.history.replaceState(undefined, '');
      return [pushed, w.history.state, w.history.length];
    },
    { jsdom },
  );

  // jsdom 25 and 26 print the error's stack: compared on jsdom 30 only.
  if (jsdom === 30) {
    parity(
      `history: go(0) and go() report a reload as not implemented (jsdom ${jsdom})`,
      async (w) => {
        const log = logger(w);
        w.history.go(0);
        w.history.go();
        w.history.go('x');
        await tick();
        log.push(['end', w.location.href, w.history.length]);
        return log;
      },
      { jsdom },
    );
  }
}

test('history: a traversal uses the timers of the global the window is installed on', async () => {
  const w = createWindow({ url: 'http://localhost/a' });
  const queued = [];
  // A stand-in for a test environment's global with fake timers.
  const fakeGlobal = { setTimeout: (fn, ms) => queued.push([fn, ms]) };
  Object.defineProperty(w.document, 'defaultView', { value: fakeGlobal, configurable: true });
  const log = logger(w);
  w.history.pushState({ n: 1 }, '', '/b');
  w.history.back();
  await tick();
  assert.equal(w.location.pathname, '/b');
  assert.deepEqual(
    queued.map(([, ms]) => ms),
    [1],
  );
  queued.shift()[0]();
  assert.equal(w.location.pathname, '/a');
  assert.equal(log[0][0], 'popstate');
  w.location.hash = 'h';
  assert.deepEqual(
    queued.map(([, ms]) => ms),
    [0],
  );
});

test("history: go(0) reports a reload with the profile's message", () => {
  const messages = [];
  const original = console.error;
  console.error = (m) => messages.push(m);
  try {
    for (const jsdom of [20, 26, 27, 30]) createWindow({ jsdom }).history.go(0);
  } finally {
    console.error = original;
  }
  assert.deepEqual(messages, [
    'Not implemented: navigation (except hash changes)',
    'Not implemented: navigation (except hash changes)',
    'Not implemented: navigation to another Document',
    'Not implemented: navigation to another Document',
  ]);
});

// A javascript: URL given to location runs as a script in a later task, as
// a link's does; the URL stays (black box, jsdom 20.0.3 to 30.1.3, #264
// item 75). A string result reports that it is not implemented (it would
// replace the document), for a link too.
const JS_URL_WAYS = {
  href: (w, url) => {
    w.location.href = url;
  },
  assign: (w, url) => w.location.assign(url),
  replace: (w, url) => w.location.replace(url),
  location: (w, url) => {
    w.location = url;
  },
  'document.location': (w, url) => {
    w.document.location = url;
  },
};
for (const jsdom of [30, 29, 27, 26, 25])
  parity(
    `a javascript: URL given to location runs (jsdom ${jsdom})`,
    async (w) => {
      const out = [];
      const until = async (done) => {
        for (let t = Date.now(); !done() && Date.now() - t < 2000;) await new Promise((r) => setTimeout(r, 5));
        await new Promise((r) => setTimeout(r, 20));
      };
      for (const [way, go] of Object.entries(JS_URL_WAYS)) {
        w.ran = 0;
        go(w, 'javascript:window.ran+=1');
        go(w, 'JavaScript:%77indow.ran+=10');
        const sync = w.ran;
        await until(() => w.ran === 11);
        out.push(way, sync, w.ran, w.location.href, w.history.length);
      }
      // A string result, a link's too (printed as not implemented; jsdom 25
      // and 26 print their stack too); a thrown error (reported; its printed
      // stack is jsdom's own, so not printed).
      if (jsdom >= 27) {
        w.location.href = "javascript:'<p>replaced</p>'";
        const a = w.document.body.appendChild(w.document.createElement('a'));
        a.href = 'javascript:%22x%22';
        a.click();
      }
      const errors = [];
      w.addEventListener('error', (e) => {
        errors.push(e.message);
        e.preventDefault();
      });
      w.location.href = 'javascript:throw new TypeError(%22boom%22)';
      await until(() => errors.length > 0);
      out.push(w.document.body.innerHTML, errors);
      return out;
    },
    { jsdom },
  );

// document.location = url navigates too ([PutForwards=href]); a document
// without a window has no location to forward to (#264 item 75).
for (const jsdom of [30, 26, 25])
  parity(
    `document.location = url navigates ([PutForwards=href]) (jsdom ${jsdom})`,
    async (w) => {
      w.document.location = '#doc';
      await tick();
      const d = w.document.implementation.createHTMLDocument('');
      let error = null;
      try {
        d.location = '#x';
      } catch (e) {
        error = [e.name, e.message];
      }
      return [w.location.href, w.history.length, error, d.location];
    },
    { jsdom },
  );

parity('window.location = url navigates ([PutForwards=href])', async (w) => {
  (function () {
    'use strict';
    w.location = '#put';
  })();
  await tick();
  return [w.location.href, w.history.length];
});

// As jsdom's free setInterval: the realm global's, looked up at the
// request, not the timers of the global the window is installed on (Jest's
// fake timers on the test's global leave jsdom's frames alone).
test("animation frames run on an interval of the realm global's timers, looked up at the request", () => {
  const w = createWindow();
  Object.defineProperty(w.document, 'defaultView', {
    value: { setTimeout: () => assert.fail('the installed global'), setInterval: () => assert.fail('installed') },
    configurable: true,
  });
  const queued = [];
  const cleared = [];
  const { setInterval, clearInterval } = globalThis;
  globalThis.setInterval = (fn, ms) => queued.push([fn, ms]);
  globalThis.clearInterval = (id) => cleared.push(id);
  let ran = 0;
  try {
    w.requestAnimationFrame(() => ran++);
    w.requestAnimationFrame(() => ran++);
    assert.equal(queued.length, 1);
    assert.equal(queued[0][1], 1000 / 60);
    queued[0][0]();
  } finally {
    Object.assign(globalThis, { setInterval, clearInterval });
  }
  assert.equal(ran, 2);
  assert.deepEqual(cleared, [1]);
});

// Location's members are [LegacyUnforgeable]: own properties of the
// location, enumerable, neither writable nor configurable, and none on
// Location.prototype (black box, jsdom 20 to 30). Grafana's tests mock
// reload with { ...window.location, reload }, and msw's fetch interceptor
// then resolves a relative URL against that copy's href.
for (const jsdom of [20, 22, 30]) {
  parity(
    `location's members are its own properties, so a spread copies them (jsdom ${jsdom})`,
    (w) => {
      const l = w.location;
      const flags = Object.entries(Object.getOwnPropertyDescriptors(l)).map(
        ([key, d]) =>
          `${key}:${'value' in d ? `${typeof d.value}${d.writable ? 'W' : ''}` : `${d.get ? 'g' : ''}${d.set ? 's' : ''}`}${d.enumerable ? 'E' : ''}${d.configurable ? 'C' : ''}`,
      );
      const copy = { ...l, reload() {} };
      let redefine;
      try {
        Object.defineProperty(l, 'href', { value: 'x' });
      } catch (e) {
        redefine = e.constructor.name;
      }
      l.hash = 'next';
      return [
        flags,
        // Symbols too: no internal state key on Location.prototype.
        Reflect.ownKeys(w.Location.prototype).map(String),
        // jsdom before 30 keeps its implementation under an own
        // Symbol(impl), its internals; warpdom has none on the location.
        Reflect.ownKeys(l)
          .map(String)
          .filter((key) => key !== 'Symbol(impl)'),
        Object.keys(copy),
        copy.href,
        new w.URL('apis/a?b=1', copy.href).href,
        redefine,
        l.href,
        String(l),
        Reflect.deleteProperty(l, 'assign'),
        typeof l.assign,
        Object.getOwnPropertyDescriptor(l, 'search').get.name,
        // The members' names: not writable, not enumerable, configurable.
        Object.values(Object.getOwnPropertyDescriptors(l)).flatMap((d) =>
          [d.get, d.set, d.value]
            .filter((fn) => typeof fn === 'function')
            .map((fn) => {
              const name = Object.getOwnPropertyDescriptor(fn, 'name');
              return `${name.value}:${name.writable}${name.enumerable}${name.configurable}`;
            }),
        ),
      ];
    },
    { jsdom, url: 'http://localhost:3000/page?x=1#h' },
  );
}

// jsdom 20 to 30 let a test replace the location's prototype (it is an
// ordinary object there), and its own members keep working: they read the
// Location's state without going through Location.prototype.
for (const jsdom of [20, 22, 30]) {
  parity(
    `location's own members work after its prototype is replaced (jsdom ${jsdom})`,
    (w) => {
      const l = w.location;
      const log = [Reflect.setPrototypeOf(l, null), Object.getPrototypeOf(l)];
      log.push(l.href, l.origin, l.protocol, l.host, l.hostname, l.port, l.pathname, l.search, l.hash);
      log.push(l.toString(), String(l), `${l}`);
      l.hash = 'a';
      log.push(l.href);
      l.href = '#b';
      log.push(l.href);
      l.assign('#c');
      log.push(l.href);
      l.replace('#d');
      log.push(l.href, w.history.length, w.document.location === l);
      log.push(Reflect.setPrototypeOf(l, {}), l.pathname);
      log.push(Reflect.setPrototypeOf(l, w.Location.prototype), l.href);
      return log;
    },
    { jsdom, url: 'http://localhost:3000/page?x=1#h' },
  );
}

// A member called on anything but a Location throws warpdom's TypeError
// (jsdom words it differently); the brand check itself throws nothing.
test("location's members on another this value: Illegal invocation", () => {
  const w = createWindow({ url: 'http://localhost:3000/page' });
  const { get, set } = Object.getOwnPropertyDescriptor(w.location, 'href');
  for (const self of [undefined, null, 1, 'x', {}, w.history, Object.create(w.Location.prototype)]) {
    assert.throws(() => get.call(self), { name: 'TypeError', message: 'Illegal invocation' });
    assert.throws(() => set.call(self, '#a'), { name: 'TypeError', message: 'Illegal invocation' });
    assert.throws(() => w.location.reload.call(self), { name: 'TypeError', message: 'Illegal invocation' });
  }
  assert.equal(get.call(w.location), 'http://localhost:3000/page');
});
