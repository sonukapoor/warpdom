import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { createWindow } from '../src/index.js';
import { parity } from './parity.js';

function tree() {
  const w = createWindow();
  const outer = w.document.body.appendChild(w.document.createElement('div'));
  const inner = outer.appendChild(w.document.createElement('button'));
  return { w, outer, inner };
}

test('capture, target and bubble phases, from the window down and back up', () => {
  const { w, outer, inner } = tree();
  const log = [];
  const on = (target, name, capture) =>
    target.addEventListener(
      'click',
      (e) => log.push(`${name}:${capture ? 'capture' : 'bubble'}:${e.eventPhase}`),
      capture,
    );
  for (const [t, n] of [
    [w, 'window'],
    [w.document, 'document'],
    [outer, 'outer'],
    [inner, 'inner'],
  ]) {
    on(t, n, true);
    on(t, n, false);
  }
  inner.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  assert.deepEqual(log, [
    'window:capture:1',
    'document:capture:1',
    'outer:capture:1',
    'inner:capture:2',
    'inner:bubble:2',
    'outer:bubble:3',
    'document:bubble:3',
    'window:bubble:3',
  ]);
});

test('non-bubbling events still run capture listeners on ancestors', () => {
  const { w, outer, inner } = tree();
  const log = [];
  outer.addEventListener('focus', () => log.push('capture'), true);
  outer.addEventListener('focus', () => log.push('bubble'));
  inner.dispatchEvent(new w.FocusEvent('focus'));
  assert.deepEqual(log, ['capture']);
});

test('listener options: once, passive, capture identity, signal', () => {
  const { w, inner } = tree();
  let count = 0;
  const fn = () => count++;
  inner.addEventListener('x', fn, { once: true });
  inner.dispatchEvent(new w.Event('x'));
  inner.dispatchEvent(new w.Event('x'));
  assert.equal(count, 1);

  inner.addEventListener('y', fn, true);
  inner.addEventListener('y', fn, false); // different capture: a second listener
  inner.removeEventListener('y', fn); // removes the non-capture one only
  inner.dispatchEvent(new w.Event('y'));
  assert.equal(count, 2);

  const passive = new w.Event('z', { cancelable: true });
  inner.addEventListener('z', (e) => e.preventDefault(), { passive: true });
  inner.dispatchEvent(passive);
  assert.equal(passive.defaultPrevented, false);

  const controller = new AbortController();
  inner.addEventListener('s', fn, { signal: controller.signal });
  controller.abort();
  inner.dispatchEvent(new w.Event('s'));
  assert.equal(count, 2);
});

test('stopPropagation and stopImmediatePropagation', () => {
  const { w, outer, inner } = tree();
  const log = [];
  inner.addEventListener('a', (e) => {
    log.push(1);
    e.stopImmediatePropagation();
  });
  inner.addEventListener('a', () => log.push(2));
  outer.addEventListener('a', () => log.push(3));
  inner.dispatchEvent(new w.Event('a', { bubbles: true }));
  assert.deepEqual(log, [1]);
  inner.addEventListener('b', (e) => {
    log.push(4);
    e.stopPropagation();
  });
  inner.addEventListener('b', () => log.push(5));
  outer.addEventListener('b', () => log.push(6));
  inner.dispatchEvent(new w.Event('b', { bubbles: true }));
  assert.deepEqual(log, [1, 4, 5]);
});

test('event state during and after dispatch', () => {
  const { w, outer, inner } = tree();
  const e = new w.Event('t', { bubbles: true, cancelable: true });
  assert.equal(e.isTrusted, false);
  assert.equal(e.eventPhase, 0);
  assert.equal(typeof e.timeStamp, 'number');
  let path;
  outer.addEventListener('t', function (ev) {
    assert.equal(this, outer);
    assert.equal(ev.target, inner);
    assert.equal(ev.currentTarget, outer);
    path = ev.composedPath();
  });
  inner.dispatchEvent(e);
  assert.deepEqual(path, [inner, outer, w.document.body, w.document.documentElement, w.document, w]);
  assert.equal(e.currentTarget, null);
  assert.equal(e.eventPhase, 0);
  assert.equal(e.target, inner);
  assert.deepEqual(e.composedPath(), []);
});

test('listener objects with handleEvent', () => {
  const { w, inner } = tree();
  const listener = {
    calls: 0,
    handleEvent(e) {
      this.calls++;
      assert.equal(e.type, 'h');
    },
  };
  inner.addEventListener('h', listener);
  inner.dispatchEvent(new w.Event('h'));
  assert.equal(listener.calls, 1);
});

test('an error in a listener is reported on the window and dispatch continues', () => {
  const { w, inner } = tree();
  const reported = [];
  w.addEventListener('error', (e) => {
    reported.push(e.error.message);
    e.preventDefault();
  });
  let after = false;
  inner.addEventListener('boom', () => {
    throw new Error('listener failed');
  });
  inner.addEventListener('boom', () => {
    after = true;
  });
  inner.dispatchEvent(new w.Event('boom'));
  assert.deepEqual(reported, ['listener failed']);
  assert.ok(after);
});

test('event subclasses and their init dictionaries', () => {
  const w = createWindow();
  const target = w.document.createElement('div');
  const mouse = new w.MouseEvent('click', {
    clientX: 5,
    clientY: 7,
    button: 1,
    buttons: 4,
    ctrlKey: true,
    relatedTarget: target,
    detail: 2,
  });
  assert.ok(mouse instanceof w.MouseEvent && mouse instanceof w.UIEvent && mouse instanceof w.Event);
  assert.deepEqual(
    [mouse.clientX, mouse.clientY, mouse.button, mouse.buttons, mouse.ctrlKey, mouse.shiftKey, mouse.detail],
    [5, 7, 1, 4, true, false, 2],
  );
  assert.equal(mouse.relatedTarget, target);
  assert.ok(mouse.getModifierState('Control'));
  const pointer = new w.PointerEvent('pointerdown', {
    pointerId: 3,
    pointerType: 'mouse',
    isPrimary: true,
    clientX: 1,
  });
  assert.ok(pointer instanceof w.MouseEvent);
  assert.deepEqual(
    [pointer.pointerId, pointer.pointerType, pointer.isPrimary, pointer.clientX, pointer.width],
    [3, 'mouse', true, 1, 1],
  );
  const key = new w.KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', shiftKey: true, repeat: true });
  assert.deepEqual([key.key, key.code, key.shiftKey, key.repeat, key.location], ['Enter', 'Enter', true, true, 0]);
  assert.equal(new w.FocusEvent('focus', { relatedTarget: target }).relatedTarget, target);
  assert.equal(new w.InputEvent('input', { data: 'a', inputType: 'insertText' }).inputType, 'insertText');
  assert.equal(new w.WheelEvent('wheel', { deltaY: 3 }).deltaY, 3);
  assert.deepEqual(new w.CustomEvent('c', { detail: { a: 1 } }).detail, { a: 1 });
});

test('legacy createEvent and initEvent', () => {
  const w = createWindow();
  const e = w.document.createEvent('Event');
  e.initEvent('legacy', true, true);
  let seen = false;
  w.document.body.addEventListener('legacy', () => {
    seen = true;
  });
  w.document.body.appendChild(w.document.createElement('p')).dispatchEvent(e);
  assert.ok(seen);
  assert.ok(w.document.createEvent('MouseEvents') instanceof w.MouseEvent);
  assert.ok(w.document.createEvent('CustomEvent') instanceof w.CustomEvent);
});

test('the window is an EventTarget', () => {
  const w = createWindow();
  assert.ok(w instanceof w.Window && w instanceof w.EventTarget);
  let fired = 0;
  w.addEventListener('resize', () => fired++);
  w.dispatchEvent(new w.Event('resize'));
  assert.equal(fired, 1);
});

test('re-dispatching an event that is being dispatched throws', () => {
  const { w, inner } = tree();
  inner.addEventListener('r', (e) => {
    assert.throws(() => inner.dispatchEvent(e), { name: 'InvalidStateError' });
  });
  inner.dispatchEvent(new w.Event('r'));
});

parity('TouchEvent: touch lists from the init dictionary', (w) => {
  const touch = { identifier: 1, clientX: 5 };
  const e = new w.TouchEvent('touchstart', { changedTouches: [touch], bubbles: true, altKey: true, detail: 2 });
  let error = null;
  try {
    new w.TouchEvent('touchstart', { changedTouches: 5 });
  } catch (err) {
    error = [err.constructor.name, err.message];
  }
  const seen = [];
  w.document.body.addEventListener('touchstart', (event) => seen.push(event.changedTouches[0].clientX));
  w.document.body.dispatchEvent(e);
  return {
    lists: [
      e.changedTouches.length,
      e.changedTouches[0] === touch,
      e.changedTouches === e.changedTouches,
      [...e.changedTouches].length,
      e.touches.length,
      e.targetTouches.length,
    ],
    fields: [e.altKey, e.ctrlKey, e.detail, e.bubbles, e instanceof w.UIEvent, Object.prototype.toString.call(e)],
    error,
    seen,
  };
});

test('TouchEvent: lists are TouchLists (jsdom uses arrays)', () => {
  const w = createWindow();
  const touch = { identifier: 1 };
  const e = new w.TouchEvent('touchend', { changedTouches: [touch] });
  assert.ok(e.changedTouches instanceof w.TouchList);
  assert.equal(e.changedTouches.item(0), touch);
  assert.equal(e.changedTouches.item(1), null);
  assert.equal(w.document.createEvent('TouchEvent') instanceof w.TouchEvent, true);
});

parity('window.event: the current event while listeners run', (w) => {
  const d = w.document;
  d.body.innerHTML = '<button id=a></button><button id=b></button>';
  const seen = [];
  d.getElementById('a').addEventListener('click', () => {
    seen.push(w.event?.type);
    d.getElementById('b').dispatchEvent(new w.MouseEvent('mousedown'));
    seen.push(w.event?.type);
  });
  d.getElementById('b').addEventListener('mousedown', () => seen.push(w.event?.type));
  const before = w.event;
  d.getElementById('a').click();
  const host = d.body.appendChild(d.createElement('div'));
  const inner = host.attachShadow({ mode: 'open' }).appendChild(d.createElement('span'));
  inner.addEventListener('click', () => seen.push(['shadow', w.event]));
  host.addEventListener('click', () => seen.push(['host', w.event?.type]));
  inner.dispatchEvent(new w.MouseEvent('click', { bubbles: true, composed: true }));
  w.addEventListener('custom', () => seen.push(['window', w.event?.type]));
  w.dispatchEvent(new w.Event('custom'));
  return { before, seen, after: w.event, own: 'event' in w };
});

parity('animation frames: a callback canceled earlier in the same frame does not run', async (w) => {
  const ran = [];
  await new Promise((resolve) => {
    let b = 0;
    w.requestAnimationFrame(() => {
      ran.push('a');
      w.cancelAnimationFrame(b);
      w.requestAnimationFrame(() => resolve());
    });
    b = w.requestAnimationFrame(() => ran.push('b'));
  });
  return ran;
});

parity('MessageEvent and window.postMessage', async (w) => {
  const e = new w.MessageEvent('message', {
    data: { a: 1 },
    origin: 'http://x',
    lastEventId: '7',
    source: w,
    ports: [],
  });
  const d = new w.MessageEvent('m');
  const out = {
    event: [e.data, e.origin, e.lastEventId, e.source === w, e.ports, e.bubbles, e instanceof w.Event],
    defaults: [d.data, d.origin, d.lastEventId, d.source, d.ports],
    stand_in_source: new w.MessageEvent('m', { source: { postMessage() {} } }).source !== null,
  };
  const log = [];
  const obj = { k: 1 };
  w.addEventListener('message', (ev) =>
    log.push([ev.data, ev.origin, ev.source, ev.constructor.name, ev.data === obj, ev.bubbles]),
  );
  w.postMessage(obj, '*');
  w.postMessage('to own origin', 'http://localhost:3000');
  w.postMessage('dropped', 'http://other.org');
  log.push('sync');
  try {
    w.postMessage('x');
  } catch (err) {
    log.push([err.constructor.name, err.message]);
  }
  await new Promise((r) => setTimeout(r, 20));
  out.log = log;
  return out;
});

// Deliberate deviation: jsdom drops a message posted with targetOrigin '/';
// the standard delivers it ('/' means the window's own origin).
test("postMessage: targetOrigin / is the window's own origin", async () => {
  const w = createWindow({ url: 'http://localhost:3000/' });
  const got = [];
  w.addEventListener('message', (e) => got.push(e.data));
  w.postMessage('self', '/');
  await new Promise((r) => setTimeout(r, 10));
  assert.deepEqual(got, ['self']);
});

test('report an exception: an error listener that throws is not re-entered', () => {
  const w = createWindow();
  const logged = [];
  const original = console.error;
  console.error = (...args) => logged.push(String(args[0]));
  let calls = 0;
  try {
    w.addEventListener('error', () => {
      calls++;
      throw new Error('in handler');
    });
    w.document.body.addEventListener('click', () => {
      throw new Error('first');
    });
    w.document.body.click();
  } finally {
    console.error = original;
  }
  assert.equal(calls, 1);
  assert.deepEqual(
    logged.map((l) => l.split('\n')[0]),
    ['Error: in handler', 'Error: first'],
  );
});

parity('CompositionEvent', (w) => {
  const e = new w.CompositionEvent('compositionend', { data: 'á', bubbles: true, detail: 1 });
  const d = new w.CompositionEvent('compositionstart');
  const legacy = w.document.createEvent('CompositionEvent');
  return [
    e.data,
    e.bubbles,
    e.detail,
    e instanceof w.UIEvent,
    Object.prototype.toString.call(e),
    d.data,
    legacy instanceof w.CompositionEvent,
  ];
});

// jsdom before 27 had no PointerEvent or pointer handlers; libraries test
// for them (react-aria picks pointer or mouse events).
parity(
  'jsdom 26 profile: no PointerEvent',
  (w) => {
    const d = w.document;
    return [
      typeof w.PointerEvent,
      'onpointerdown' in d.body,
      'onpointerenter' in d,
      'onpointermove' in w,
      'ongotpointercapture' in d.body,
      typeof w.MouseEvent,
      'onmouseenter' in d.body,
      typeof w.TouchEvent,
    ];
  },
  { jsdom: 26 },
);

// click() fires a MouseEvent there.
parity(
  'jsdom 26 profile: click() event',
  (w) => {
    const b = w.document.createElement('button');
    let seen;
    b.addEventListener('click', (e) => {
      seen = [
        Object.prototype.toString.call(e),
        e instanceof w.MouseEvent,
        e.bubbles,
        e.cancelable,
        e.composed,
        e.detail,
      ];
    });
    b.click();
    return seen;
  },
  { jsdom: 26 },
);

// Events the platform fires are trusted; dispatchEvent() and click() are not.
parity('isTrusted', async (w) => {
  const d = w.document;
  d.body.innerHTML =
    '<input type="checkbox" id="c"><input id="t"><details id="d"><summary>s</summary></details><form id="f"><input name="a" required></form>';
  const seen = [];
  const on = (target, types) => {
    for (const type of types) target.addEventListener(type, (e) => seen.push(`${type}:${e.isTrusted}`));
  };
  on(d.getElementById('c'), ['click', 'input', 'change']);
  d.getElementById('c').click();
  on(d.getElementById('t'), ['focus', 'focusin', 'blur', 'custom']);
  d.getElementById('t').focus();
  d.getElementById('t').blur();
  d.getElementById('t').dispatchEvent(new w.Event('custom'));
  on(d.getElementById('f').elements.a, ['invalid']);
  d.getElementById('f').checkValidity();
  on(w, ['hashchange', 'popstate']);
  w.location.hash = '#x';
  on(d.getElementById('d'), ['toggle']);
  d.getElementById('d').open = true;
  const c = new w.AbortController();
  on(c.signal, ['abort']);
  c.abort();
  await new Promise((resolve) => setTimeout(resolve, 20));
  return seen.sort();
});

// EventModifierInit's other modifier keys: read by getModifierState on mouse,
// pointer, wheel and keyboard events (not touch events), never exposed as
// attributes. ariakit's shims test relies on modifierCapsLock and
// modifierSuper.
for (const jsdom of [30, 26, 25]) {
  parity(
    `getModifierState: modifier* init members (jsdom ${jsdom})`,
    (w) => {
      const keys = [
        'Control',
        'Shift',
        'Alt',
        'Meta',
        'AltGraph',
        'CapsLock',
        'Fn',
        'FnLock',
        'Hyper',
        'NumLock',
        'ScrollLock',
        'Super',
        'Symbol',
        'SymbolLock',
        'Accel',
        'OS',
        'alt',
        'capslock',
        'toString',
      ];
      const all = Object.fromEntries(keys.slice(4, 14).map((k) => [`modifier${k}`, true]));
      const out = [];
      for (const name of ['KeyboardEvent', 'MouseEvent', 'WheelEvent', 'PointerEvent', 'TouchEvent']) {
        if (!w[name]) {
          out.push([name, 'absent']);
          continue;
        }
        const on = new w[name]('x', { ...all, altKey: true });
        const one = new w[name]('x', { modifierSuper: 1, modifierCapsLock: 0 });
        const none = new w[name]('x');
        out.push([
          name,
          typeof on.getModifierState,
          keys.filter((k) => on.getModifierState?.(k)),
          keys.filter((k) => one.getModifierState?.(k)),
          keys.filter((k) => none.getModifierState?.(k)),
          'modifierCapsLock' in on,
        ]);
      }
      return out;
    },
    { jsdom },
  );
}

// Inner invoke skips listeners whose target's document is not fully active:
// a removed iframe's window and document (as in jsdom).
parity("listeners on a removed iframe's window and document do not run", (w) => {
  const d = w.document;
  const frame = d.createElement('iframe');
  d.body.append(frame);
  const win = frame.contentWindow;
  const doc = frame.contentDocument;
  const seen = [];
  win.addEventListener('x', () => seen.push('window'));
  doc.addEventListener('x', () => seen.push('document'));
  win.dispatchEvent(new w.Event('x'));
  doc.dispatchEvent(new w.Event('x'));
  frame.remove();
  const results = [win.dispatchEvent(new w.Event('x', { cancelable: true })), doc.dispatchEvent(new w.Event('x'))];
  return [seen, results];
});

test("listeners on nodes of a removed iframe's document stop, also during dispatch", () => {
  const w = createWindow();
  const frame = w.document.createElement('iframe');
  w.document.body.append(frame);
  const doc = frame.contentDocument;
  const el = doc.body.appendChild(doc.createElement('div'));
  const order = [];
  doc.addEventListener(
    'x',
    () => {
      order.push('capture');
      frame.remove();
    },
    true,
  );
  el.addEventListener('x', () => order.push('target'));
  doc.addEventListener('x', () => order.push('bubble'));
  el.dispatchEvent(new w.Event('x', { bubbles: true }));
  assert.deepEqual(order, ['capture']);
  // A window elsewhere keeps dispatching.
  const other = createWindow();
  let n = 0;
  other.document.body.addEventListener('y', () => n++);
  other.document.body.dispatchEvent(new other.Event('y'));
  assert.equal(n, 1);
});

// TransitionEvent exists from jsdom 27 (React then listens for transitionend
// rather than webkitTransitionEnd); jsdom has no AnimationEvent.
for (const jsdom of [30, 26]) {
  parity(
    `TransitionEvent (jsdom ${jsdom})`,
    (w) => {
      if (!w.TransitionEvent) return ['absent', 'TransitionEvent' in w, 'AnimationEvent' in w];
      const T = w.TransitionEvent;
      const e = new T('transitionend', {
        propertyName: 5,
        elapsedTime: '1.1',
        pseudoElement: '::after',
        bubbles: true,
      });
      const d = new T('x');
      const out = [
        T.length,
        Object.getOwnPropertyNames(T.prototype).sort(),
        Object.getPrototypeOf(T.prototype) === w.Event.prototype,
        e.type,
        e.propertyName,
        e.elapsedTime,
        e.pseudoElement,
        e.bubbles,
        d.propertyName,
        d.elapsedTime,
        d.pseudoElement,
        'AnimationEvent' in w,
        String(e),
      ];
      for (const f of [
        () => new T(),
        () => new T('x', { elapsedTime: NaN }),
        () => w.document.createEvent('TransitionEvent'),
      ]) {
        try {
          f();
          out.push('ok');
        } catch (err) {
          out.push(err.name);
        }
      }
      return out;
    },
    { jsdom },
  );
}

parity('UIEventInit view: primitives are rejected, null and the window accepted', (w) => {
  const out = [];
  for (const view of [7, 'x', true, null, undefined, w]) {
    try {
      out.push(new w.MouseEvent('x', { view }).view === (view ?? null));
    } catch (e) {
      out.push(e.name);
    }
  }
  return out;
});

// javascript: URLs: following a link runs the script in a later task (this
// is the window; exceptions are reported), as jsdom does with runScripts
// 'dangerously' (Vitest's and Jest's setting); location ignores them.
for (const jsdom of [30, 26, 25]) {
  parity(
    `javascript: URLs of links run as scripts; location ignores them (jsdom ${jsdom})`,
    async (w) => {
      const d = w.document;
      d.body.innerHTML =
        '<a id="a" href="javascript:window.n=(window.n||0)+1;window.order.push(%22run%22)">a</a>' +
        '<area id="r" href="javascript:window.n+=10"><a id="t" target="_blank" href="javascript:window.n+=100">t</a>' +
        '<a id="v" href="javascript:void(0)">v</a><a id="e" href="javascript:throw new Error(%22boom%22)">e</a>';
      w.order = [];
      const errors = [];
      w.addEventListener('error', (e) => {
        errors.push(e.message);
        e.preventDefault();
      });
      d.getElementById('a').click();
      w.order.push('after click');
      Promise.resolve().then(() => w.order.push('microtask'));
      w.location.href = 'javascript:window.n+=1000';
      d.getElementById('t').click();
      d.getElementById('v').click();
      await new Promise((resolve) => setTimeout(resolve, 20));
      d.getElementById('r').click();
      d.getElementById('e').click();
      await new Promise((resolve) => setTimeout(resolve, 20));
      return [w.n, w.order, errors.length, w.location.href];
    },
    { jsdom },
  );
}

for (const jsdom of [30, 26, 25]) {
  parity(
    `CloseEvent: wasClean, code and reason (jsdom ${jsdom})`,
    (w) => {
      const e = new w.CloseEvent('close', { wasClean: 1, code: 65537, reason: 'bye', bubbles: true });
      const d = new w.CloseEvent('x');
      const out = [
        typeof w.CloseEvent,
        w.CloseEvent.length,
        Object.getOwnPropertyNames(w.CloseEvent.prototype).sort(),
        Object.prototype.toString.call(e),
        e instanceof w.Event,
        [e.wasClean, e.code, e.reason, e.bubbles, e.type],
        [d.wasClean, d.code, d.reason],
        [-1, 1.5, NaN, '12', 70000].map((code) => new w.CloseEvent('c', { code }).code),
        [
          new w.CloseEvent('c', {
            reason: {
              toString() {
                return 'o';
              },
            },
          }).reason,
          new w.CloseEvent('c', { reason: null }).reason,
        ],
      ];
      try {
        new w.CloseEvent();
      } catch (err) {
        out.push(err.constructor.name, err.message);
      }
      try {
        w.document.createEvent('CloseEvent');
      } catch (err) {
        out.push(err.name);
      }
      let seen = null;
      w.document.body.addEventListener('close', (ev) => {
        seen = [ev.code, ev.reason, ev.wasClean];
      });
      w.document.body.dispatchEvent(e);
      out.push(seen);
      return out;
    },
    { jsdom },
  );
}

// As jsdom: timeStamp is Date.now() at creation, from the realm warpdom
// runs in (fake timers that replace that Date set it: Vitest's default
// pools; a test realm's own Date does not: Jest, Vitest's VM pools).
test("Event.timeStamp is Date.now() of warpdom's realm when the event is created", () => {
  const w = createWindow();
  const before = Date.now();
  const e = new w.MouseEvent('click');
  const after = Date.now();
  assert.ok(Number.isInteger(e.timeStamp) && e.timeStamp >= before && e.timeStamp <= after);
  const realNow = Date.now;
  Date.now = () => 5000;
  try {
    assert.equal(new w.Event('x').timeStamp, 5000);
    let clicked;
    w.document.body.addEventListener('click', (ev) => {
      clicked = ev.timeStamp;
    });
    w.document.body.click();
    assert.equal(clicked, 5000);
  } finally {
    Date.now = realNow;
  }
  const context = vm.createContext({ w });
  assert.ok(vm.runInContext('Date.now = () => 7; new w.Event("x").timeStamp', context) > 1e12);
});

// PromiseRejectionEvent, BlobEvent, PageTransitionEvent and the device
// events (#52, #53, #56, #59), measured on jsdom 20.0.3 to 30.1.3.
const caught = (f) => {
  try {
    return f();
  } catch (err) {
    return `${err.constructor.name}: ${err.message}`;
  }
};
const EVENT_NAMES = [
  'PromiseRejectionEvent',
  'BlobEvent',
  'PageTransitionEvent',
  'DeviceMotionEvent',
  'DeviceOrientationEvent',
  'DeviceMotionEventAcceleration',
  'DeviceMotionEventRotationRate',
];
for (const jsdom of [20, 26, 30]) {
  parity(
    `PromiseRejectionEvent, BlobEvent, PageTransitionEvent and device events: which exist, their shape (jsdom ${jsdom})`,
    (w) =>
      EVENT_NAMES.map((name) => {
        if (!(name in w)) return [name, 'absent'];
        const C = w[name];
        return [
          name,
          C.length,
          Object.getPrototypeOf(C).name,
          Object.getOwnPropertyNames(C.prototype).sort(),
          caught(() => new C()),
          Object.prototype.toString.call(C.prototype),
        ];
      }).concat(
        [
          'PromiseRejectionEvent',
          'BlobEvent',
          'PageTransitionEvent',
          'devicemotionevent',
          'DeviceOrientationEvent',
        ].map((name) => caught(() => w.document.createEvent(name).constructor.name).replace(/invalid\.?$/, 'invalid')),
      ),
    { jsdom },
  );

  parity(
    `PageTransitionEvent: persisted (jsdom ${jsdom})`,
    (w) => {
      const T = w.PageTransitionEvent;
      const e = new T('pageshow', { persisted: 1, bubbles: true });
      return [
        e.persisted,
        e.bubbles,
        e instanceof w.Event,
        new T('x').persisted,
        new T('x', null).persisted,
        caught(() => new T('x', 5)),
        caught(() => new T()),
      ];
    },
    { jsdom },
  );
}

parity('PromiseRejectionEvent: the init dictionary and errors (jsdom 30)', (w) => {
  const P = w.PromiseRejectionEvent;
  const promise = Promise.resolve();
  const e = new P('unhandledrejection', { promise, reason: 'r', cancelable: true });
  const thenable = { then() {} };
  return [
    [e.promise === promise, e.reason, e.cancelable, e.bubbles, e.type, e instanceof w.Event],
    'reason' in new P('x', { promise }),
    new P('x', { promise }).reason,
    new P('x', { promise: thenable }).promise === thenable,
    new P(5, { promise }).type,
    ...[
      [],
      ['x'],
      ['x', {}],
      ['x', null],
      ['x', 5],
      ['x', { promise: 5 }],
      ['x', { promise: null }],
      [Symbol('s'), { promise }],
    ].map((args) => caught(() => new P(...args))),
  ];
});

parity('BlobEvent: data and timecode (jsdom 30)', (w) => {
  const B = w.BlobEvent;
  const blob = new w.Blob(['a']);
  const file = new w.File(['a'], 'f.txt');
  const e = new B('dataavailable', { data: blob, timecode: '5' });
  return [
    e.data === blob,
    e.timecode,
    String(new B('x', { data: blob }).timecode),
    new B('x', { data: file }).data === file,
    new B('x', { data: blob, timecode: null }).timecode,
    ...[
      ['x'],
      ['x', {}],
      ['x', 5],
      ['x', { data: 'a' }],
      ['x', { data: null }],
      ['x', { data: new globalThis.Blob(['a']) }],
      ['x', { data: blob, timecode: NaN }],
      ['x', { data: blob, timecode: Infinity }],
    ].map((args) => caught(() => new B(...args))),
  ];
});

parity('DeviceMotionEvent: acceleration and rotation rate objects as jsdom gives them (jsdom 30)', (w) => {
  const M = w.DeviceMotionEvent;
  const describe = (a) =>
    a === null
      ? null
      : [
          a.constructor.name,
          Object.getOwnPropertyDescriptors(a),
          a instanceof w.DeviceMotionEventAcceleration,
          JSON.stringify(a),
        ];
  const e = new M('devicemotion', {
    acceleration: { x: 1, y: '2' },
    accelerationIncludingGravity: {},
    rotationRate: { alpha: 3 },
    interval: '16',
  });
  const empty = new M('x');
  return [
    describe(e.acceleration),
    describe(e.accelerationIncludingGravity),
    describe(e.rotationRate),
    e.acceleration === e.acceleration,
    e.interval,
    [empty.acceleration, empty.rotationRate, empty.accelerationIncludingGravity, empty.interval],
    describe(new M('x', { acceleration: null }).acceleration),
    new M('x', { interval: null }).interval,
    ...[
      { acceleration: { x: NaN } },
      { acceleration: { y: 'a' } },
      { acceleration: 5 },
      { rotationRate: { gamma: Infinity } },
      { interval: NaN },
      5,
    ].map((init) => caught(() => new M('x', init))),
  ];
});

parity('DeviceOrientationEvent: nullable doubles (jsdom 30)', (w) => {
  const O = w.DeviceOrientationEvent;
  const e = new O('deviceorientation', { alpha: '3', beta: null, absolute: 1 });
  const d = new O('x');
  return [
    [e.alpha, e.beta, e.gamma, e.absolute],
    [d.alpha, d.beta, d.gamma, d.absolute],
    ...[{ alpha: NaN }, { beta: -Infinity }, { gamma: 'z' }, 5].map((init) => caught(() => new O('x', init))),
  ];
});

// Version boundaries (literals: the measured jsdom values).
test('jsdom 27.0.0 adds PromiseRejectionEvent, BlobEvent and the device events; PageTransitionEvent is in every version', () => {
  for (const [jsdom, present] of [
    ['20.0.3', false],
    ['26.1.0', false],
    ['27.0.0', true],
    ['30.1.3', true],
  ]) {
    const w = createWindow({ jsdom });
    for (const name of [
      'PromiseRejectionEvent',
      'BlobEvent',
      'DeviceMotionEvent',
      'DeviceOrientationEvent',
      'DeviceMotionEventAcceleration',
      'DeviceMotionEventRotationRate',
    ]) {
      assert.equal(name in w, present, `${name} in jsdom ${jsdom}`);
    }
    assert.equal(typeof w.PageTransitionEvent, 'function');
    assert.equal(
      caught(() => w.document.createEvent('DeviceMotionEvent').constructor.name),
      present ? 'DeviceMotionEvent' : 'DOMException: The provided event type ("DeviceMotionEvent") is invalid.',
    );
  }
});

test('BlobEvent timecode without one: 0 before jsdom 30.1.0, NaN from it', () => {
  for (const [jsdom, expected] of [
    ['27.0.0', 0],
    ['30.0.1', 0],
    ['30.1.0', NaN],
    ['30.1.3', NaN],
  ]) {
    const w = createWindow({ jsdom });
    assert.deepEqual(new w.BlobEvent('x', { data: new w.Blob([]) }).timecode, expected, `jsdom ${jsdom}`);
  }
});

// EventTarget's operations called without a this value act on the window,
// as WebIDL's operations do on the global object; another receiver that is
// not an EventTarget throws (black box, jsdom 20.0.3 to 30.1.3; #128:
// Mattermost keeps a node's removeEventListener and calls it detached).
for (const jsdom of [30, 26, 20])
  parity(
    `EventTarget: operations called without a this value act on the window (jsdom ${jsdom})`,
    (w) => {
      const out = [];
      const node = w.document.body.appendChild(w.document.createElement('div'));
      const { addEventListener: add, removeEventListener: remove, dispatchEvent: dispatch } = node;
      let hits = 0;
      const listener = (e) => {
        hits++;
        out.push(e.currentTarget === w, e.target === w);
      };
      add('x', listener);
      w.dispatchEvent(new w.Event('x'));
      out.push(dispatch(new w.Event('x')), hits);
      remove('x', listener);
      w.dispatchEvent(new w.Event('x'));
      out.push(hits);
      add.call(null, 'y', listener);
      out.push(dispatch.call(null, new w.Event('y')), hits);
      remove.call(undefined, 'y', listener);
      w.dispatchEvent(new w.Event('y'));
      out.push(hits);
      for (const receiver of [{}, 1, 'x'])
        for (const call of [() => add.call(receiver, 'z', listener), () => dispatch.call(receiver, new w.Event('z'))])
          try {
            call();
            out.push('no error');
          } catch (e) {
            out.push(e.name);
          }
      return out;
    },
    { jsdom },
  );

test('EventTarget: each window has its own operations, acting on that window without a this value', () => {
  const w = createWindow();
  const frame = w.document.body.appendChild(w.document.createElement('iframe'));
  const inner = frame.contentWindow;
  const { addEventListener } = inner.EventTarget.prototype;
  assert.notEqual(addEventListener, w.EventTarget.prototype.addEventListener);
  assert.equal(addEventListener.name, 'addEventListener');
  assert.equal(addEventListener.length, 2);
  let hits = 0;
  addEventListener('x', () => hits++);
  inner.dispatchEvent(new inner.Event('x'));
  w.dispatchEvent(new w.Event('x'));
  assert.equal(hits, 1);
});
