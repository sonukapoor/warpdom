import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWindow } from '../src/index.js';
import { parity } from './parity.js';

test('requestAnimationFrame runs callbacks with a timestamp; cancelAnimationFrame stops them', async () => {
  const w = createWindow();
  const stamps = [];
  w.requestAnimationFrame((t) => stamps.push(t));
  const cancelled = w.requestAnimationFrame(() => stamps.push('cancelled'));
  w.cancelAnimationFrame(cancelled);
  await new Promise((r) => setTimeout(r, 40));
  assert.equal(stamps.length, 1);
  assert.equal(typeof stamps[0], 'number');
});

test('viewport and scrolling, as in jsdom', () => {
  const w = createWindow();
  assert.deepEqual([w.innerWidth, w.innerHeight, w.outerWidth, w.outerHeight], [1024, 768, 1024, 768]);
  assert.equal(w.devicePixelRatio, 1);
  assert.deepEqual([w.scrollX, w.scrollY, w.pageXOffset, w.pageYOffset], [0, 0, 0, 0]);
  w.scrollTo(0, 100);
  w.scroll(0, 100);
  w.scrollBy(0, 10);
  w.document.createElement('div').scrollIntoView;
});

test('navigator', () => {
  const w = createWindow();
  assert.ok(w.navigator instanceof w.Navigator);
  assert.match(w.navigator.userAgent, /warpdom/);
  // Libraries detect a DOM without layout by this token, with or without
  // the slash (MUI: "jsdom"; floating-ui: "jsdom/").
  assert.match(w.navigator.userAgent, /jsdom\//);
  assert.equal(w.navigator.language, 'en-US');
  assert.deepEqual([...w.navigator.languages], ['en-US', 'en']);
  assert.equal(w.navigator.onLine, true);
  assert.equal(w.navigator.cookieEnabled, true);
});

test('location and history', () => {
  const blank = createWindow();
  assert.equal(blank.location.href, 'about:blank');
  const w = createWindow({ url: 'http://localhost:3000/app?q=1#top' });
  const { location, history } = w;
  assert.ok(location instanceof w.Location && history instanceof w.History);
  assert.deepEqual(
    [
      location.protocol,
      location.host,
      location.hostname,
      location.port,
      location.pathname,
      location.search,
      location.hash,
      location.origin,
    ],
    ['http:', 'localhost:3000', 'localhost', '3000', '/app', '?q=1', '#top', 'http://localhost:3000'],
  );
  assert.equal(w.document.location, location);
  assert.equal(w.document.URL, 'http://localhost:3000/app?q=1#top');
  history.pushState({ step: 1 }, '', '/next?x=2');
  assert.equal(location.href, 'http://localhost:3000/next?x=2');
  assert.deepEqual(history.state, { step: 1 });
  assert.equal(history.length, 2);
  history.replaceState(null, '', '#hash');
  assert.equal(location.href, 'http://localhost:3000/next?x=2#hash');
  location.hash = 'other';
  assert.equal(location.hash, '#other');
  assert.equal(String(location), location.href);
});

test('Image, Audio and Option constructors', () => {
  const w = createWindow();
  const img = new w.Image(10, 20);
  assert.ok(img instanceof w.HTMLImageElement);
  assert.deepEqual([img.getAttribute('width'), img.getAttribute('height')], ['10', '20']);
  assert.ok(new w.Audio() instanceof w.HTMLAudioElement);
  const option = new w.Option('Label', 'value');
  assert.ok(option instanceof w.HTMLOptionElement);
  assert.equal(option.textContent, 'Label');
  assert.equal(option.getAttribute('value'), 'value');
});

test('insertAdjacentElement and insertAdjacentText', () => {
  const { document } = createWindow();
  const parent = document.body.appendChild(document.createElement('div'));
  const el = parent.appendChild(document.createElement('p'));
  const make = (tag) => document.createElement(tag);
  const before = el.insertAdjacentElement('beforebegin', make('a'));
  el.insertAdjacentElement('afterbegin', make('b'));
  el.insertAdjacentElement('beforeend', make('i'));
  el.insertAdjacentElement('afterend', make('u'));
  assert.equal(before.tagName, 'A');
  assert.deepEqual(
    [...parent.children].map((c) => c.tagName),
    ['A', 'P', 'U'],
  );
  assert.deepEqual(
    [...el.children].map((c) => c.tagName),
    ['B', 'I'],
  );
  el.insertAdjacentText('beforeend', '!');
  assert.equal(el.lastChild.nodeValue, '!');
  assert.throws(() => el.insertAdjacentElement('nowhere', make('s')), { name: 'SyntaxError' });
});

// Page visibility: as jsdom with pretendToBeVisual (test environments).
parity('document visibility', (w) => {
  const d = w.document;
  const iframe = d.createElement('iframe');
  d.body.append(iframe);
  return [
    d.visibilityState,
    d.hidden,
    iframe.contentDocument.visibilityState,
    iframe.contentDocument.hidden,
    'onvisibilitychange' in d,
    'onvisibilitychange' in d.body,
  ];
});

// Deviations: jsdom gives documents without a browsing context the old
// 'prerender' state (the standard's states are 'visible' and 'hidden'),
// and does not run document.onvisibilitychange.
test('document visibility without a browsing context; onvisibilitychange', () => {
  const w = createWindow({ url: 'http://localhost:3000/' });
  const created = w.document.implementation.createHTMLDocument('');
  let calls = 0;
  w.document.onvisibilitychange = () => calls++;
  w.document.dispatchEvent(new w.Event('visibilitychange'));
  assert.deepEqual([created.visibilityState, created.hidden, calls], ['hidden', true, 1]);
});

// Small Window members jsdom has (react-aria's tests read the global close).
parity('window: close, stop, bars, name, status, origin, external, webkitURL', (w) => {
  const bars = ['locationbar', 'menubar', 'personalbar', 'scrollbars', 'statusbar', 'toolbar'].map((b) => [
    Object.prototype.toString.call(w[b]),
    w[b].visible,
    w[b] === w[b],
  ]);
  const before = [
    w.name,
    w.status,
    w.origin,
    typeof w.close,
    w.close(),
    w.stop(),
    w.captureEvents(),
    w.releaseEvents(),
    w.closed,
  ];
  w.name = 'n';
  w.status = 's';
  const external = [
    Object.prototype.toString.call(w.external),
    w.external.AddSearchProvider(),
    w.external.IsSearchProviderInstalled(),
    w.external === w.external,
  ];
  w.origin = 'replaced';
  return [
    bars,
    before,
    w.name,
    w.status,
    external,
    w.origin,
    w.webkitURL === w.URL || w.webkitURL === URL,
    w.document.body.innerHTML === '',
  ];
});

parity('legacy and document-only event handlers', (w) => {
  const d = w.document;
  const el = d.createElement('div');
  const names = [
    'onwebkitanimationend',
    'onwebkitanimationiteration',
    'onwebkitanimationstart',
    'onwebkittransitionend',
    'onanimationend',
    'ontransitionend',
  ];
  return [
    names.map((n) => [n in w, n in d, n in el]),
    'onreadystatechange' in d,
    'onreadystatechange' in el,
    typeof w.InputEvent.prototype.getTargetRanges,
  ];
});

// An exception in a queueMicrotask callback becomes an error event.
parity('queueMicrotask reports exceptions', async (w) => {
  const seen = [];
  w.addEventListener('error', (e) => {
    seen.push([e.constructor.name, e.message, e.error?.message, e.cancelable]);
    e.preventDefault();
  });
  w.queueMicrotask(() => {
    throw new Error('boom');
  });
  let typeError;
  try {
    w.queueMicrotask(42);
  } catch (e) {
    typeError = e.name;
  }
  await new Promise((resolve) => setTimeout(resolve, 10));
  return [seen, typeError];
});

// jsdom 25 and 26 print the error's stack: compared on jsdom 30, and the
// words of jsdom 20 to 26 checked below.
for (const jsdom of [30]) {
  parity(
    `"Not implemented" reports in the version's words (jsdom ${jsdom})`,
    (w) => {
      w.document.body.innerHTML = '<form></form><canvas></canvas><video></video>';
      w.alert('x');
      w.scrollTo(0, 0);
      try {
        w.document.querySelector('form').submit();
      } catch {
        /* reported */
      }
      w.document.querySelector('canvas').getContext('2d');
      w.document.querySelector('video').pause();
      return null;
    },
    { jsdom },
  );
}

test('"Not implemented" reports in jsdom 20 to 26\'s words', () => {
  const messages = [];
  const original = console.error;
  console.error = (m) => messages.push(m);
  try {
    const w = createWindow({ jsdom: 26 });
    w.document.body.innerHTML = '<form></form><canvas></canvas><video></video>';
    w.alert('x');
    w.document.querySelector('form').submit();
    w.document.querySelector('canvas').getContext('2d');
    w.document.querySelector('video').pause();
  } finally {
    console.error = original;
  }
  assert.deepEqual(messages, [
    'Not implemented: window.alert',
    'Not implemented: HTMLFormElement.prototype.submit',
    'Not implemented: HTMLCanvasElement.prototype.getContext (without installing the canvas npm package)',
    'Not implemented: HTMLMediaElement.prototype.pause',
  ]);
});

// navigator.plugins and navigator.mimeTypes, Plugin, MimeType, PluginArray
// and MimeTypeArray (#58, #31, #33, #34, #54): empty legacy collections in
// every jsdom version measured (20.0.3 to 30.1.3).
for (const jsdom of [20, 26, 30]) {
  parity(
    `navigator.plugins and mimeTypes: empty collections (jsdom ${jsdom})`,
    (w) => {
      const caught = (f) => {
        try {
          return f();
        } catch (err) {
          return err.constructor.name;
        }
      };
      const n = w.navigator;
      const shapes = ['Plugin', 'MimeType', 'PluginArray', 'MimeTypeArray'].map((name) => {
        const C = w[name];
        return [
          name,
          C.length,
          Object.getOwnPropertyNames(C.prototype).sort(),
          caught(() => new C()),
          Object.prototype.toString.call(C.prototype),
          C.prototype[Symbol.iterator]?.name,
          typeof C.prototype.item === 'function' ? C.prototype.item.length : null,
        ];
      });
      const lists = [
        ['plugins', 'PluginArray'],
        ['mimeTypes', 'MimeTypeArray'],
      ].map(([key, name]) => {
        const list = n[key];
        const strictSet = caught(() => {
          'use strict';
          list[0] = 'a';
        });
        list.expando = 1;
        return [
          list === n[key],
          list instanceof w[name],
          list.length,
          list.item(0),
          list.item(-1),
          list.namedItem('application/pdf'),
          list[0],
          0 in list,
          [...list],
          Object.keys(list),
          String(list),
          JSON.stringify(list),
          strictSet,
          caught(() => list.item()),
          caught(() => list.namedItem()),
        ];
      });
      return [
        shapes,
        lists,
        n.plugins.refresh(),
        'pdfViewerEnabled' in n,
        n.javaEnabled(),
        Object.getOwnPropertyNames(w.Navigator.prototype).includes('plugins'),
        caught(() => {
          n.plugins = 5;
        }),
        n.plugins instanceof w.PluginArray,
      ];
    },
    { jsdom },
  );
}

// Window member kinds and the prototype chain (#68; black box, every jsdom
// release from 20.0.0 to 30.1.3): document, window and self are own
// accessors (configurable in jsdom 20 only, self replaceable from 21), name
// an own data property, webkitURL an own data property that is not
// enumerable, status and the viewport members own data properties before
// 27 and own accessors from 27 (viewport setters replace them); before
// 24.1.2 Window.prototype inherits from EventTarget.prototype directly.
const VIEWPORT_KEYS = [
  'innerWidth',
  'innerHeight',
  'outerWidth',
  'outerHeight',
  'devicePixelRatio',
  'scrollX',
  'scrollY',
  'pageXOffset',
  'pageYOffset',
  'screenX',
  'screenY',
  'screenLeft',
  'screenTop',
];
const descriptorOf = (o, key) => {
  const d = Object.getOwnPropertyDescriptor(o, key);
  if (!d) return 'none';
  const flags = `${d.writable ? 'w' : ''}${d.enumerable ? 'e' : ''}${d.configurable ? 'c' : ''}`;
  if ('value' in d)
    return `data ${typeof d.value === 'object' ? 'object' : typeof d.value === 'function' ? d.value.name : JSON.stringify(d.value)} ${flags}`;
  return `accessor ${d.get?.name ?? '-'}/${d.set?.name ?? '-'} ${flags}`;
};
const windowKindsScenario = (w) => {
  void w.webkitURL; // warpdom makes it on first read, as its interface objects
  const out = ['document', 'window', 'self', 'name', 'status', 'webkitURL', ...VIEWPORT_KEYS].map(
    (key) => `${key}: ${descriptorOf(w, key)}`,
  );
  const get = (key) => Object.getOwnPropertyDescriptor(w, key).get;
  out.push(
    get('document').call({}) === w.document,
    get('window').call(undefined) === w,
    get('self').call({}) === w,
    w.webkitURL === w.URL,
  );
  if (get('innerWidth')) out.push(get('innerWidth').call({}), get('scrollY').call(undefined));
  return out;
};
const windowAssignmentScenario = (w) => {
  const attempt = (f) => {
    try {
      return f();
    } catch (e) {
      return e.constructor.name;
    }
  };
  const out = [];
  w.innerWidth = 500;
  out.push(w.innerWidth, descriptorOf(w, 'innerWidth'));
  w.scrollY = '20';
  out.push(w.scrollY);
  // A test's Object.defineProperty with a value only: writable stays as it was.
  Object.defineProperty(w, 'innerHeight', { value: 300 });
  out.push(
    descriptorOf(w, 'innerHeight'),
    attempt(() => {
      w.innerHeight = 400;
      return w.innerHeight;
    }),
  );
  // vi.spyOn(window, 'devicePixelRatio', 'get') needs an accessor.
  const ratio = Object.getOwnPropertyDescriptor(w, 'devicePixelRatio');
  out.push(typeof ratio.get);
  if (ratio.get) {
    Object.defineProperty(w, 'devicePixelRatio', { ...ratio, get: () => 2 });
    out.push(w.devicePixelRatio);
    Object.defineProperty(w, 'devicePixelRatio', ratio);
    out.push(w.devicePixelRatio);
  }
  w.name = 5;
  w.status = 6;
  out.push(typeof w.name, typeof w.status, descriptorOf(w, 'name'));
  w.webkitURL = 7;
  out.push(descriptorOf(w, 'webkitURL'));
  out.push(
    attempt(() => {
      delete w.outerWidth;
      return String(w.outerWidth);
    }),
  );
  return out;
};
const windowChainScenario = (w) => {
  const d = w.document;
  d.body.innerHTML =
    '<div id="named"></div><form name="f"></form><div id="addEventListener"></div><div id="location"></div><div id="toString"></div>';
  const parent = Object.getPrototypeOf(w.Window.prototype);
  const out = [
    parent === w.EventTarget.prototype,
    Object.prototype.toString.call(parent),
    Object.prototype.toString.call(w.Window.prototype),
    Object.getPrototypeOf(w.EventTarget.prototype) === Object.prototype ||
      Object.getPrototypeOf(w.EventTarget.prototype) === w.Object?.prototype,
    w.Window.prototype.constructor === w.Window,
    Reflect.ownKeys(w.Window.prototype).includes('constructor'),
  ];
  out.push(
    String(w.named),
    'named' in w,
    String(w.f),
    typeof w.addEventListener,
    String(w.location) === w.location.href,
    typeof w.toString,
    w.missing,
    'missing' in w,
  );
  d.getElementById('named').remove();
  out.push(String(w.named), 'named' in w);
  return out;
};
// Assignments through an object that inherits from the window (#90; black
// box with jsdom 20.0.3, 21.1.2, 22.1.0, 26.1.0, 27.4.0 and 30.1.3, windows
// made with runScripts as the test environments make them). Before 27.0.0
// the derived object gets its own property and the window keeps its
// member, also self (21+: the VM context's global does that, not self's
// setter); from 27.0.0 the window's own accessors (self, status, the
// viewport members) act on their window whatever this is: the derived
// object gets no property and the window's member is replaced (status
// keeps a string). Data properties (name; status and the viewport members
// before 27; interface objects, Image, console, webkitURL, HTMLDocument,
// WebSocket, which warpdom makes on first read) give the derived object its
// own property in every version. The setters called on another object, or
// on an object that inherits from the window, replace the window's member
// in every version, and status's getter reads its window's whatever this
// is. warpdom's window is not a VM context's global and its self setter
// cannot tell an assignment through a derived object from a call, so it
// replaces the window's self, as jsdom 21 to 26 without runScripts: self is
// compared with those (with runScripts, warpdom's global in Jest and
// Vitest's VM pools is such a global, jest-environment.test.js).
// jsdom 20's self has a getter only, and its window (a VM context's global)
// still lets the derived object have its own; warpdom's throws there (not
// covered: jsdom 20 runs without self).
const INHERITED_KEYS = ['self', 'name', 'status', 'innerWidth', 'scrollY', 'devicePixelRatio'];
const LAZY_KEYS = [
  'console',
  'Image',
  'Option',
  'Audio',
  'HTMLCanvasElement',
  'MutationObserver',
  'webkitURL',
  'HTMLDocument',
  'WebSocket',
];
// Whether an assignment of 7 replaced the window's member. Not the
// descriptor: warpdom makes a member on first read (an accessor until then)
// and before another receiver gets a value (internal.js lazyDataSetter).
const windowMember = (w, key) => {
  const d = Object.getOwnPropertyDescriptor(w, key);
  return d !== undefined && d.value !== 7 ? 'kept' : 'replaced';
};
const inheritedAssignmentScenario = (keys) => (w) => {
  const attempt = (f) => {
    try {
      return f();
    } catch (e) {
      return e.constructor.name;
    }
  };
  const out = [];
  const setters = ['self', 'outerHeight', 'status'].map((key) => [key, Object.getOwnPropertyDescriptor(w, key).set]);
  const statusGetter = Object.getOwnPropertyDescriptor(w, 'status').get;
  for (const key of keys) {
    // Nothing reads the lazy members before this loop: warpdom makes them
    // on first read (an accessor until then), and the assignment must reach
    // that accessor's setter.
    const derived = Object.create(w);
    const result = attempt(() => {
      derived[key] = 7;
      return 'ok';
    });
    const own = Object.hasOwn(derived, key) ? descriptorOf(derived, key) : 'none';
    const window = LAZY_KEYS.includes(key) ? windowMember(w, key) : descriptorOf(w, key);
    const reads = w[key] === 7 ? '7' : typeof w[key];
    out.push(`${key}: ${result}, own ${own}, window ${window} (reads ${reads}), derived reads ${String(derived[key])}`);
  }
  for (const [key, set] of setters) {
    if (!set) {
      out.push(`${key}: no setter`);
      continue;
    }
    const other = {};
    out.push(
      `${key} setter on another object: ${attempt(() => {
        set.call(other, 8);
        return 'ok';
      })} ${Object.hasOwn(other, key)} ${descriptorOf(w, key)}`,
    );
    const derived = Object.create(w);
    out.push(
      `${key} setter on a derived object: ${attempt(() => {
        set.call(derived, 9);
        return 'ok';
      })} ${Object.hasOwn(derived, key)} ${descriptorOf(w, key)}`,
    );
  }
  if (statusGetter) out.push(`status getter: ${JSON.stringify(statusGetter.call({}))}`);
  return out;
};
for (const jsdom of [20, 22, 26, 27, 30]) {
  const keys = [...INHERITED_KEYS, ...LAZY_KEYS].filter((key) => jsdom >= 27 || key !== 'self');
  parity(
    `assignments through an object inheriting from the window (jsdom ${jsdom})`,
    inheritedAssignmentScenario(keys),
    { jsdom },
  );
}
for (const jsdom of [22, 26]) {
  parity(
    `assignments through an object inheriting from the window, without runScripts (jsdom ${jsdom})`,
    inheritedAssignmentScenario([...INHERITED_KEYS, ...LAZY_KEYS]),
    { jsdom, runScripts: false },
  );
}

test('window: assignments through an object inheriting from the window, per jsdom version', () => {
  // self: getter only before 21; status and innerWidth: data properties before 27.
  const results = {};
  for (const jsdom of ['20.0.3', '21.0.0', '26.1.0', '27.0.0', '30.1.3']) {
    const w = createWindow({ jsdom });
    const out = [];
    for (const key of ['self', 'status', 'innerWidth', 'Image']) {
      const derived = Object.create(w);
      let result = 'ok';
      try {
        derived[key] = 7;
      } catch (e) {
        result = e.constructor.name;
      }
      out.push(
        `${key} ${result} ${Object.hasOwn(derived, key) ? 'own' : 'none'} ${w[key] === 7 || w[key] === '7' ? 'replaced' : 'kept'}`,
      );
    }
    results[jsdom] = out.join(', ');
  }
  assert.deepEqual(results, {
    '20.0.3': 'self TypeError none kept, status ok own kept, innerWidth ok own kept, Image ok own kept',
    '21.0.0': 'self ok none replaced, status ok own kept, innerWidth ok own kept, Image ok own kept',
    '26.1.0': 'self ok none replaced, status ok own kept, innerWidth ok own kept, Image ok own kept',
    '27.0.0': 'self ok none replaced, status ok none replaced, innerWidth ok none replaced, Image ok own kept',
    '30.1.3': 'self ok none replaced, status ok none replaced, innerWidth ok none replaced, Image ok own kept',
  });
});

// An assignment that reaches a window's data property through an object
// inheriting from the window (super.Image = 7 in a method of such an
// object, called on the receiver) is OrdinarySet's receiver step: the
// receiver's own writable data property gets the value and keeps its
// flags, a read-only or accessor own property or a new property on a
// non-extensible receiver fails (a TypeError in strict code). warpdom makes
// these members on first read: the scenario runs each case while the
// member is still an accessor (cold) and again after reading it
// (materialized), and must match jsdom's data properties both times.
const RECEIVER_CASES = {
  none: (d) => d,
  'read-only': (d) => Object.defineProperty(d, KEY, { value: 1, writable: false, configurable: true }),
  'writable, non-configurable': (d) =>
    Object.defineProperty(d, KEY, { value: 1, writable: true, enumerable: false, configurable: false }),
  accessor: (d) =>
    Object.defineProperty(d, KEY, {
      get() {
        return 1;
      },
      set() {
        throw new Error('own setter called');
      },
      configurable: true,
    }),
  'non-extensible': (d) => Object.preventExtensions(d),
};
let KEY;
const receiverScenario = (w) => {
  const out = [];
  for (const key of ['Image', 'MutationObserver', 'console', 'webkitURL']) {
    KEY = key;
    for (const phase of ['cold', 'materialized']) {
      if (phase === 'materialized') void w[key];
      for (const [name, make] of Object.entries(RECEIVER_CASES)) {
        const receiver = make(Object.create(w));
        const home = {
          __proto__: w,
          assign(v) {
            super[key] = v;
          },
        };
        let result = 'ok';
        try {
          home.assign.call(receiver, 7);
        } catch (e) {
          result = e.constructor.name;
        }
        const own = Object.getOwnPropertyDescriptor(receiver, key);
        const flags =
          own === undefined
            ? 'none'
            : 'value' in own
              ? `${own.value} ${own.writable} ${own.enumerable} ${own.configurable}`
              : 'accessor';
        const window = windowMember(w, key);
        out.push(`${key} ${phase} ${name}: ${result}, own ${flags}, window ${window}`);
      }
    }
  }
  return out;
};
for (const jsdom of [20, 26, 30])
  parity(`assignments reaching the window's data properties from a receiver (jsdom ${jsdom})`, receiverScenario, {
    jsdom,
  });

// The same with receivers that do not inherit from the window (#98): a
// plain object gets its own property and the window keeps its member; a
// primitive or frozen receiver fails (a TypeError in strict code). The
// receiver's prototypes are not looked at: a proxy's throwing
// getPrototypeOf trap is not called. A proxy over the window is an alias:
// assigning through it replaces the window's member, as on the window. Each
// case runs cold and materialized, and the window's member is put back
// after it (black box, jsdom 20.0.3 to 30.1.3).
const OTHER_RECEIVERS = {
  plain: () => ({}),
  primitive: () => 5,
  frozen: () => Object.freeze({}),
  'proxy over a derived object': (w) =>
    new Proxy(Object.create(w), {
      getPrototypeOf() {
        throw new RangeError('getPrototypeOf trap');
      },
    }),
};
// Each phase runs on its own window: on a window whose cold cases ran, an
// interface's constructor is cached and the member put back is the lazy
// accessor again, so a later read would not make the data property. The
// materialized phase records that the member is one before its cases.
const otherReceiverScenario = (phase) => (w) => {
  const out = [];
  const flags = (d) => {
    if (d === undefined) return 'none';
    return 'value' in d ? `${d.value === 7} ${d.writable} ${d.enumerable} ${d.configurable}` : 'accessor';
  };
  const attempt = (f) => {
    try {
      const r = f();
      return r === undefined ? 'ok' : String(r);
    } catch (e) {
      return e.constructor.name;
    }
  };
  for (const key of ['Image', 'MutationObserver', 'console', 'webkitURL', 'HTMLDocument', 'WebSocket']) {
    if (phase === 'materialized') {
      void w[key];
      out.push(`${key} materialized: window ${flags(Object.getOwnPropertyDescriptor(w, key))}`);
    }
    const before = Object.getOwnPropertyDescriptor(w, key);
    const report = (name, result, receiver) => {
      const after = Object.getOwnPropertyDescriptor(w, key);
      const window = windowMember(w, key) === 'kept' ? 'kept' : `replaced ${flags(after)}`;
      const own = Object(receiver) === receiver ? flags(Object.getOwnPropertyDescriptor(receiver, key)) : '-';
      out.push(`${key} ${phase} ${name}: ${result}, own ${own}, window ${window}`);
      Object.defineProperty(w, key, before);
    };
    const home = {
      __proto__: w,
      assign(v) {
        super[key] = v;
      },
    };
    for (const [name, make] of Object.entries(OTHER_RECEIVERS)) {
      const receiver = make(w);
      report(
        `super, ${name}`,
        attempt(() => home.assign.call(receiver, 7)),
        receiver,
      );
    }
    const plain = {};
    report(
      'Reflect.set, plain',
      attempt(() => Reflect.set(w, key, 7, plain)),
      plain,
    );
    const alias = new Proxy(w, {
      getPrototypeOf() {
        throw new RangeError('getPrototypeOf trap');
      },
    });
    report(
      'proxy over the window',
      attempt(() => {
        alias[key] = 7;
      }),
    );
    report(
      'Reflect.set, proxy over the window',
      attempt(() => Reflect.set(w, key, 7, alias)),
    );
    // A descriptor trap that reads the member (made on first read in
    // warpdom) after taking its descriptor: the same as the proxy above,
    // and the traps see what jsdom's see.
    const traps = [];
    const reentrant = new Proxy(w, {
      getOwnPropertyDescriptor(target, k) {
        traps.push('getOwnPropertyDescriptor');
        const d = Reflect.getOwnPropertyDescriptor(target, k);
        void target[k];
        return d;
      },
      defineProperty(target, k, d) {
        traps.push(`defineProperty ${Object.keys(d)}`);
        return Reflect.defineProperty(target, k, d);
      },
    });
    const reentrantResult = attempt(() => {
      reentrant[key] = 7;
    });
    report('proxy over the window, reentrant descriptor trap', `${reentrantResult} (${traps.join(', ')})`);
  }
  return out;
};
for (const jsdom of [20, 26, 30])
  for (const phase of ['cold', 'materialized'])
    parity(
      `assignments reaching the window's data properties from other receivers (${phase}, jsdom ${jsdom})`,
      otherReceiverScenario(phase),
      { jsdom },
    );

// A member made non-configurable before its first read (warpdom's accessor
// is locked then; jsdom's data property stays writable): assigning through
// an object that inherits from the window, or with Reflect.set and a plain
// receiver, gives the receiver its own property, cold or materialized
// (black box, jsdom 20.0.3 to 30.1.3). Each phase runs on its own window;
// the cold phase does not read the member.
const lockedReceiverScenario = (phase) => (w) => {
  const out = [];
  for (const key of ['Image', 'MutationObserver', 'console', 'webkitURL', 'HTMLDocument', 'WebSocket']) {
    if (phase === 'materialized') void w[key];
    Object.defineProperty(w, key, { configurable: false });
    const attempt = (f) => {
      try {
        f();
        return 'ok';
      } catch (e) {
        return e.constructor.name;
      }
    };
    const derived = Object.create(w);
    const plain = {};
    const results = [
      attempt(() => {
        derived[key] = 7;
      }),
      attempt(() => {
        if (!Reflect.set(w, key, 8, plain)) throw new Error('false');
      }),
    ];
    const own = (o) => JSON.stringify(Object.getOwnPropertyDescriptor(o, key));
    out.push(`${key} ${phase}: ${results.join(' ')}, own ${own(derived)} ${own(plain)}`);
  }
  return out;
};
for (const jsdom of [20, 26, 30])
  for (const phase of ['cold', 'materialized'])
    parity(
      `assignments from other receivers to a locked window member (${phase}, jsdom ${jsdom})`,
      lockedReceiverScenario(phase),
      { jsdom },
    );

// A copy of a member's descriptor taken before its first read is the
// accessor warpdom has until then (jsdom's: a data property). Once the
// window's member is made, assigning through the window (super, Reflect.set)
// (super) finds the copy's accessor and fails without calling its setter;
// the setter does the same before, and when called through the copy, so a
// copy is not mistaken for a proxy over the window (#98).
test('window: a copy of a member made on first read fails assignment, before and after the read', () => {
  const run = (phase) => {
    const out = [];
    for (const key of ['Image', 'MutationObserver', 'console', 'webkitURL', 'HTMLDocument', 'WebSocket']) {
      const w = createWindow();
      const copy = Object.defineProperty({}, key, Object.getOwnPropertyDescriptor(w, key));
      const lazy = Object.getOwnPropertyDescriptor(copy, key);
      if (phase === 'materialized') void w[key];
      const home = {
        __proto__: w,
        assign(v) {
          super[key] = v;
        },
      };
      for (const [name, f] of [
        ['super', () => home.assign.call(copy, 7)],
        ['own', () => (copy[key] = 7)],
      ]) {
        let result = 'ok';
        try {
          result = String(f());
        } catch (e) {
          result = e.constructor.name;
        }
        const own = Object.getOwnPropertyDescriptor(copy, key);
        out.push(
          `${key} ${name}: ${result}, copy ${own.get === lazy.get ? 'kept' : 'changed'}, window ${w[key] === 7 ? 'changed' : 'kept'}`,
        );
      }
    }
    return out;
  };
  const cold = run('cold');
  assert.deepEqual(cold, run('materialized'));
  for (const line of cold) assert.match(line, /^\w+ \w+: TypeError, copy kept, window kept$/);
});

test('window: inherited enumerable Object.prototype keys do not reach window creation', () => {
  Object.prototype.extra = 1;
  try {
    for (const jsdom of ['26.1.0', '30.1.3']) {
      const w = createWindow({ jsdom });
      assert.equal(w.innerWidth, 1024, jsdom);
      assert.equal(Object.hasOwn(w, 'extra'), false, jsdom);
    }
  } finally {
    delete Object.prototype.extra;
  }
});

for (const jsdom of [20, 22, 25, 26, 30]) {
  parity(`window member kinds (jsdom ${jsdom})`, windowKindsScenario, { jsdom });
  parity(`window member assignments (jsdom ${jsdom})`, windowAssignmentScenario, { jsdom });
  parity(`Window prototype chain and named access (jsdom ${jsdom})`, windowChainScenario, { jsdom });
}

test('window member kinds per jsdom version: boundaries 21.0.0, 24.1.2 and 27.0.0', () => {
  const kinds = (jsdom) => {
    const w = createWindow({ jsdom });
    const parent = Object.getPrototypeOf(w.Window.prototype);
    return [
      descriptorOf(w, 'document'),
      descriptorOf(w, 'self'),
      descriptorOf(w, 'innerWidth'),
      descriptorOf(w, 'status'),
      parent === w.EventTarget.prototype ? 'EventTarget' : Object.prototype.toString.call(parent),
    ];
  };
  const legacy = ['accessor get document/- ec', 'accessor get self/- ec', 'data 1024 wec', 'data "" wec'];
  const data = ['accessor get document/- e', 'accessor get self/set self ec', 'data 1024 wec', 'data "" wec'];
  const accessors = [
    'accessor get document/- e',
    'accessor get self/set self ec',
    'accessor get innerWidth/set innerWidth ec',
    'accessor get status/set status ec',
  ];
  assert.deepEqual(kinds('20.0.3'), [...legacy, 'EventTarget']);
  assert.deepEqual(kinds('21.0.0'), [...data, 'EventTarget']);
  assert.deepEqual(kinds('24.1.1'), [...data, 'EventTarget']);
  assert.deepEqual(kinds('24.1.2'), [...data, '[object WindowProperties]']);
  assert.deepEqual(kinds('26.1.0'), [...data, '[object WindowProperties]']);
  assert.deepEqual(kinds('27.0.0'), [...accessors, '[object WindowProperties]']);
  assert.deepEqual(kinds('30.1.3'), [...accessors, '[object WindowProperties]']);
});

test('window: self is replaceable from jsdom 21, document and window are not, in strict code', () => {
  for (const jsdom of ['21.0.0', '30.1.3']) {
    const w = createWindow({ jsdom });
    const document = w.document;
    assert.throws(() => {
      w.document = {};
    }, TypeError);
    assert.throws(() => {
      w.window = {};
    }, TypeError);
    assert.throws(() => {
      delete w.document;
    }, TypeError);
    assert.equal(w.document, document);
    w.self = 7;
    assert.equal(descriptorOf(w, 'self'), 'data 7 wec');
  }
  const w = createWindow({ jsdom: '20.0.3' });
  assert.throws(() => {
    w.self = 7;
  }, TypeError);
  delete w.document;
  assert.equal(w.document, undefined);
});

test('window: the per-file reset puts back the viewport, name and status', async () => {
  const { snapshotWindow, resetWindow } = await import('../src/reset.js');
  for (const jsdom of ['26.1.0', '30.1.3']) {
    const w = createWindow({ jsdom });
    snapshotWindow(w);
    w.innerWidth = 500;
    w.name = 'x';
    w.status = 'y';
    Object.defineProperty(w, 'innerHeight', { value: 1, configurable: true });
    resetWindow(w);
    assert.deepEqual([w.innerWidth, w.innerHeight, w.name, w.status], [1024, 768, '', ''], jsdom);
  }
});

// URLSearchParams and Headers forEach call the callback directly, as jsdom
// does (20.0.3 and 30), not through its own call property.
for (const jsdom of [20, 30]) {
  parity(
    `URLSearchParams and Headers forEach: a callback whose call property is overwritten (jsdom ${jsdom})`,
    (w) => {
      const seen = [];
      const callback = function (value, name, list) {
        seen.push(value, name, list.constructor.name, this.tag, arguments.length);
      };
      callback.call = () => seen.push('own call');
      new w.URLSearchParams('a=1&b=2').forEach(callback, { tag: 'u' });
      new w.Headers({ c: '3' }).forEach(callback, { tag: 'h' });
      return seen;
    },
    { jsdom },
  );
}
