// Live collections as WebIDL legacy platform objects: indexed and named
// properties as own properties, read-only, undeletable.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parity, html } from './parity.js';
import { createWindow } from '../src/node.js';
import { installWindow } from '../src/vitest.js';
import { documentStyleSheets } from '../src/cssom.js';
import { S } from '../src/internal.js';

const attempt = (fn) => {
  try {
    return ['ok', fn()];
  } catch (e) {
    return ['threw', e.name];
  }
};
// Test modules are strict; these run sloppy-mode code.
const looseSet = new Function('o', 'k', 'v', 'o[k] = v;');
const looseDelete = new Function('o', 'k', 'return delete o[k];');
const id = (el) => (el == null ? el : el.id || el.getAttribute?.('name') || el.name || el.tagName);

parity('HTMLCollection own property names: indices, then names, then expandos', (w) => {
  const doc = html(
    w,
    `<span></span><span id=""></span><span id="a"></span><span id="a"></span>
    <span name="n"></span><span id="b" name="c"></span><svg><g id="g" name="svgname"></g></svg>`,
  );
  const spans = doc.getElementsByTagName('span');
  spans.expando = 1;
  const all = doc.body.getElementsByTagName('*');
  return [Object.getOwnPropertyNames(spans), Object.keys(spans), Object.getOwnPropertyNames(all)];
});

parity('HTMLCollection property descriptors and the in operator', (w) => {
  const doc = html(w, '<p id="x"></p><p name="item"></p><p id="0"></p>');
  const c = doc.getElementsByTagName('p');
  const desc = (k) => {
    const d = Object.getOwnPropertyDescriptor(c, k);
    return d && { ...d, value: id(d.value) };
  };
  return [
    desc('0'),
    desc('x'),
    desc('3'),
    desc('item'),
    desc('length'),
    '0' in c,
    'x' in c,
    '' in c,
    'y' in c,
    '3' in c,
    id(c.x),
    id(c[0]),
    typeof c.item,
    id(c.namedItem('item')),
    c.namedItem(''),
    id(c.namedItem(0)),
    c[''],
    id(c.item(4294967296)),
    c.item(-1),
  ];
});

parity('HTMLCollection indices and names are read-only and undeletable', (w) => {
  const doc = html(w, '<i id="foo"></i>');
  const c = doc.getElementsByTagName('i');
  const results = [];
  looseSet(c, 0, 5);
  results.push(id(c[0]));
  looseSet(c, 'foo', 5);
  results.push(id(c.foo));
  results.push(
    attempt(() => {
      'use strict';
      c[0] = 5;
    }),
  );
  results.push(
    attempt(() => {
      'use strict';
      c[1] = 5;
    }),
  );
  results.push(
    attempt(() => {
      'use strict';
      c.foo = 5;
    }),
  );
  results.push(
    attempt(() => {
      'use strict';
      delete c[0];
    }),
  );
  results.push(
    attempt(() => {
      'use strict';
      delete c.foo;
    }),
  );
  results.push(
    attempt(() => {
      'use strict';
      return delete c[1];
    }),
  );
  results.push(attempt(() => Object.defineProperty(c, '0', { value: 1 })));
  results.push(attempt(() => Object.defineProperty(c, 'foo', { value: 1 }) && 'defined'));
  results.push(looseDelete(c, 0), looseDelete(c, 'foo'), id(c[0]), id(c.foo), c[1]);
  c.bar = 1;
  results.push(c.bar, delete c.bar, c.bar);
  return results;
});

parity('HTMLCollection expandos hide names added later', (w) => {
  const doc = html(w, '');
  const c = doc.getElementsByTagName('b');
  c.later = 5;
  const b = doc.body.appendChild(doc.createElement('b'));
  b.id = 'later';
  const before = [c.later, id(c.namedItem('later'))];
  delete c.later;
  return [before, id(c.later), Object.getOwnPropertyNames(c)];
});

parity('HTMLCollection as a prototype', (w) => {
  const doc = html(w, '<p id="named"></p>');
  const c = doc.getElementsByTagName('p');
  const obj = Object.create(c);
  const results = [attempt(() => obj.length), id(obj.named)];
  obj.named = 'foo';
  results.push(obj.named, id(c.named));
  return results;
});

parity('HTMLCollection is live in its own properties', (w) => {
  const doc = html(w, '<div id="root"></div>');
  const root = doc.getElementById('root');
  const list = root.getElementsByTagName('div');
  const a = doc.createElement('div');
  a.id = 'div1';
  const b = doc.createElement('div');
  b.id = 'div2';
  const out = [Object.getOwnPropertyNames(list)];
  root.append(a, doc.createElement('p'), b);
  out.push(Object.getOwnPropertyNames(list), 'div1' in list);
  a.remove();
  out.push(Object.getOwnPropertyNames(list), 'div1' in list, id(list.div2), id(root.children[1]));
  return out;
});

parity('NamedNodeMap own property names and descriptors', (w) => {
  const doc = html(w, '<input id="r" type="text" value="" width="200px">');
  const input = doc.getElementById('r');
  input.setAttributeNS('urn:x', 'x:Foo', 'v');
  const attrs = input.attributes;
  const names = Object.getOwnPropertyNames(attrs);
  const d = Object.getOwnPropertyDescriptor(attrs, 'type');
  input.removeAttribute('width');
  return [
    names,
    Object.keys(attrs),
    d.enumerable,
    d.writable,
    d.value.name,
    Object.getOwnPropertyNames(attrs),
    attrs.type.value,
    attrs.tabIndex,
    attempt(() => {
      'use strict';
      attrs.type = 1;
    }),
    attempt(() => {
      'use strict';
      delete attrs[0];
    }),
  ];
});

parity('HTMLOptionsCollection indexed setter', (w) => {
  const doc = html(w, '<select id="s"><option>a</option><option>b</option></select>');
  const select = doc.getElementById('s');
  const text = () => [...select.options].map((o) => o.text || '-');
  const make = (t) => {
    const o = doc.createElement('option');
    o.text = t;
    return o;
  };
  select.options[0] = make('A');
  const r = [text()];
  select.options[4] = make('E');
  r.push(text());
  select.options[1] = null;
  r.push(text());
  r.push(
    attempt(() => {
      select.options[0] = doc.createElement('div');
    }),
  );
  r.push(Object.getOwnPropertyDescriptor(select.options, '0').writable);
  return r;
});

parity('HTMLFormControlsCollection named properties', (w) => {
  const doc = html(
    w,
    '<form id="f"><input name="a"><input name="r" type="radio"><input name="r" type="radio"><input id="b"></form>',
  );
  const elements = doc.getElementById('f').elements;
  return [
    Object.getOwnPropertyNames(elements),
    elements.a.name,
    elements.r.length,
    elements.r.constructor.name,
    id(elements.b),
  ];
});

// Named access on the Window object (HTML 7.2.2.3).
parity('window named properties: ids, names of embed/form/img/object, iframes', (w) => {
  const doc = html(
    w,
    `<div id="foo"></div><div id="foo"></div><form name="f"></form><img name="i"><a name="a"></a>
    <div name="dn"></div><iframe name="fr"></iframe><div id="addEventListener"></div><div id="document"></div>
    <embed name="e"><object name="o"></object><svg><g id="svgid"/></svg><p id="host"></p>`,
  );
  doc.getElementById('host').attachShadow({ mode: 'open' }).innerHTML = '<span id="shadowed"></span>';
  const WindowProperties = Object.getPrototypeOf(Object.getPrototypeOf(w));
  return [
    w.foo.constructor.name,
    w.foo.length,
    w.f.tagName,
    w.i.tagName,
    w.a,
    w.dn,
    w.fr === w.frames[0],
    typeof w.addEventListener,
    w.document.nodeName,
    w.e.tagName,
    w.o.tagName,
    w.svgid,
    w.shadowed,
    'foo' in w,
    'nothere' in w,
    Object.getOwnPropertyDescriptor(w, 'f'),
    Object.keys(w).includes('f'),
    String(WindowProperties),
    Object.getPrototypeOf(WindowProperties) === w.EventTarget.prototype,
  ];
});

parity('window named properties are live and yield to expandos', (w) => {
  const doc = html(w, '<span id="later"></span>');
  const out = [w.later.tagName];
  doc.getElementById('later').remove();
  out.push(w.later);
  const p = doc.body.appendChild(doc.createElement('p'));
  p.id = 'later';
  out.push(w.later.tagName);
  w.later = 5;
  out.push(w.later);
  delete w.later;
  out.push(w.later.tagName);
  p.id = 'renamed';
  out.push(w.later, w.renamed.tagName);
  return out;
});

test('test environment globals have no named access, as under Vitest with jsdom', () => {
  // Vitest's jsdom environment copies window members onto Node's global, so
  // window.foo for an id is undefined there; warpdom's environments do the
  // same. The window object itself (iframes, createWindow) has it.
  const window = createWindow();
  const global = {};
  const restore = installWindow(global, window);
  window.document.body.innerHTML = '<div id="foo"></div>';
  assert.equal(global.foo, undefined);
  assert.equal(global.window.foo, undefined);
  assert.equal(window.foo.id, 'foo');
  restore();
});

parity('iterating a live NodeList or HTMLCollection sees changes made meanwhile', (w) => {
  const d = w.document;
  const parent = d.createElement('div');
  const { childNodes, children } = parent;
  const early = children[Symbol.iterator]();
  parent.innerHTML = '<b>1</b><b>2</b>';
  const seen = [];
  for (const n of childNodes) {
    seen.push(n.textContent);
    if (seen.length < 3) parent.append(d.createElement('i'));
  }
  return [
    seen.length,
    early.next().value === parent.firstChild,
    [...childNodes.keys()],
    [...childNodes.entries()].length,
    String(childNodes.values()),
    [...d.querySelectorAll('i')].length,
  ];
});

// jsdom's are Array.prototype's own functions (black box 20.0.3 to 30.1.3);
// warpdom's have their name, length and behavior but not their identity
// (collections.js), so the identity is left out here.
const LIST_INTERFACES = [
  'NodeList',
  'HTMLCollection',
  'NamedNodeMap',
  'FileList',
  'StyleSheetList',
  'HTMLFormControlsCollection',
  'HTMLOptionsCollection',
  'RadioNodeList',
  'HTMLSelectElement',
];

parity("list interfaces' @@iterator and NodeList's iteration functions have Array.prototype's shape", (w) => {
  const shape = (proto, key) => {
    const d = Object.getOwnPropertyDescriptor(proto, key);
    return d && [typeof d.value, d.value.name, d.value.length, d.writable, d.enumerable, d.configurable];
  };
  const NL = w.NodeList.prototype;
  return [
    LIST_INTERFACES.map((name) => [name, shape(w[name].prototype, Symbol.iterator)]),
    ['forEach', 'keys', 'values', 'entries'].map((key) => [key, shape(NL, key)]),
    NL.values === NL[Symbol.iterator],
    ['HTMLCollection', 'NamedNodeMap', 'RadioNodeList'].map(
      (name) => w[name].prototype[Symbol.iterator] === NL[Symbol.iterator],
    ),
    'prototype' in NL.values,
    attempt(() => new NL.values()),
  ];
});

parity("list iteration functions borrowed for other array-like objects work as Array.prototype's", (w) => {
  const NL = w.NodeList.prototype;
  const it = NL[Symbol.iterator];
  const seen = [];
  return [
    attempt(() => [...it.call([1, 2])]),
    attempt(() => [...it.call({ length: 2, 0: 'a', 1: 'b' })]),
    attempt(() => [...it.call('ab')]),
    attempt(() => [...w.HTMLCollection.prototype[Symbol.iterator].call(['c'])]),
    attempt(() => [...NL.keys.call({ length: 2 })]),
    attempt(() => JSON.stringify([...NL.entries.call(['x'])])),
    attempt(() => [...NL.values.call(w.document.body.children)].length),
    attempt(() => NL.forEach.call(['a', 'b'], (v, i, l) => seen.push(v, i, Array.isArray(l)))),
    seen,
    attempt(() => it.call(null)),
    attempt(() => it.call(undefined)),
    attempt(() => NL.forEach.call(null, () => {})),
    attempt(() => w.document.body.childNodes.forEach()),
    attempt(() => w.document.body.childNodes.forEach({})),
    attempt(() => [...it.call(Object.create(w.document.body.childNodes))]),
  ];
});

parity("a list's iterators: Array Iterator objects with Iterator helpers, live, done for good once done", (w) => {
  const d = w.document;
  const parent = d.createElement('div');
  parent.innerHTML = '<b></b><i></i><u></u>';
  const it = parent.childNodes.values();
  const done = parent.children[Symbol.iterator]();
  [...done];
  parent.append(d.createElement('p'));
  const after = done.next();
  const entries = parent.childNodes.entries();
  const first = entries.next().value;
  parent.firstChild.remove();
  const second = entries.next().value;
  return [
    Object.prototype.toString.call(it),
    it[Symbol.iterator]() === it,
    Object.hasOwn(it, 'next'),
    typeof it.map,
    attempt(() => JSON.stringify(it.map((n) => n.nodeName).toArray())),
    after.done,
    [first[0], first[1].nodeName, second[0], second[1].nodeName],
    JSON.stringify(Object.keys(it)),
  ];
});

// Iterating a list reads its current length and item at each step, as
// Array.prototype.values does; forEach reads the length once and skips the
// indices removed meanwhile, as Array.prototype.forEach does. NamedNodeMap
// and a select's options are live too.
parity('iterating and forEach over live lists while removing and adding items', (w) => {
  const d = w.document;
  const fresh = () =>
    html(
      w,
      '<div id=d><a></a><b></b><i></i><u></u></div><select id=s><option>1<option>2<option>3<option>4</select>' +
        '<form id=f><input name=x><input name=y><input name=z></form>',
    );
  const out = [];
  fresh();
  let seen = [];
  d.getElementById('d').childNodes.forEach((n, i, l) => {
    seen.push(n.nodeName, i, l === d.getElementById('d').childNodes);
    n.remove();
  });
  out.push(seen, d.getElementById('d').childNodes.length);
  fresh();
  let calls = 0;
  d.getElementById('d').childNodes.forEach(() => {
    if (calls++ < 10) d.getElementById('d').append(d.createElement('p'));
  });
  out.push(calls);
  fresh();
  seen = [];
  d.querySelectorAll('#d > *').forEach((n) => {
    seen.push(n.nodeName);
    n.remove();
  });
  out.push(seen);
  fresh();
  seen = [];
  for (const n of d.getElementById('d').children) {
    seen.push(n.nodeName);
    n.remove();
  }
  out.push(seen);
  fresh();
  seen = [];
  for (const o of d.getElementById('s')) {
    seen.push(o.text);
    o.remove();
  }
  out.push(seen);
  fresh();
  seen = [];
  for (const o of d.getElementById('s').options) {
    seen.push(o.text);
    o.remove();
  }
  out.push(seen);
  fresh();
  seen = [];
  for (const el of d.getElementById('f').elements) {
    seen.push(el.name);
    el.remove();
  }
  out.push(seen);
  const p = d.createElement('p');
  for (const name of ['a', 'b', 'c']) p.setAttribute(name, '');
  seen = [];
  for (const a of p.attributes) {
    seen.push(a.name);
    p.removeAttribute(a.name);
  }
  out.push(seen);
  return out;
});

// MediaList is iterable from jsdom 29 (black box: no @@iterator in 20.0.3 to
// 28.1.0); the style sheet lists iterate their current items.
for (const jsdom of [20, 22, 25, 26, 27, 28, 29, 30]) {
  parity(
    `style sheet lists and MediaList iteration (jsdom ${jsdom})`,
    (w) => {
      const d = html(w, '<style>@media screen, print { a {} b {} }</style><style></style>');
      const media = d.styleSheets[0].cssRules[0].media;
      return [
        Symbol.iterator in w.MediaList.prototype,
        attempt(() => [...media]),
        [...d.styleSheets].length,
        [...d.styleSheets[0].cssRules].map((r) => r.constructor.name),
        [...d.styleSheets[0].cssRules[0].cssRules].length,
      ];
    },
    { jsdom },
  );
}

// Borrowed for a Proxy, they make only Array.prototype's accesses (a get
// trap that rejects symbol keys never sees one).
parity('list iteration functions borrowed for a Proxy read only its length and indices', (w) => {
  const NL = w.NodeList.prototype;
  const traps = [];
  const proxy = new Proxy(['a', 'b'], {
    get(t, key, receiver) {
      traps.push(typeof key === 'symbol' ? 'symbol' : key);
      if (typeof key === 'symbol') throw new TypeError('symbol key');
      return Reflect.get(t, key, receiver);
    },
  });
  const run = (fn) => {
    traps.length = 0;
    return [attempt(fn), traps.join()];
  };
  return [
    run(() => {
      const seen = [];
      NL.forEach.call(proxy, (v) => seen.push(v));
      return seen;
    }),
    run(() => [...NL.keys.call(proxy)]),
    run(() => [...NL.values.call(proxy)]),
    run(() => JSON.stringify([...NL.entries.call(proxy)])),
    run(() => [...w.HTMLCollection.prototype[Symbol.iterator].call(proxy)]),
  ];
});

// forEach calls the callback as Array.prototype.forEach does, not through
// its call property.
parity('NodeList forEach calls a callback whose call property is undefined', (w) => {
  const d = html(w, '<a></a><b></b>');
  const seen = [];
  const callback = function (node, i, list) {
    seen.push(node.nodeName, i, list === d.body.childNodes, this.tag);
  };
  callback.call = undefined;
  return [attempt(() => d.body.childNodes.forEach(callback, { tag: 't' })), seen];
});

// Called on a list with another list read in between (Array.prototype's
// functions then, as jsdom's are), they still see its changes.
parity('list iteration functions called on a list after reading another list', (w) => {
  const d = html(w, '<div id=d><a></a><b></b><i></i></div>');
  const NL = w.NodeList.prototype;
  const other = d.body.children;
  const kids = d.getElementById('d').childNodes;
  const seen = [];
  const { forEach } = kids;
  void other.length;
  forEach.call(kids, (n, i, list) => {
    seen.push(n.nodeName, i, list === kids);
    n.remove();
  });
  d.getElementById('d').innerHTML = '<a></a><b></b>';
  const it = NL.entries.call(kids);
  void other.length;
  const first = it.next().value;
  kids[0].remove();
  const second = it.next();
  return [seen, [first[0], first[1].nodeName], second.done, [...NL.keys.call(kids)]];
});

// An own length, a length redefined on the prototype or another prototype
// is what iterating and forEach read, whichever list was read last, as
// Array.prototype's functions read it.
parity('list iteration honors an overridden length', (w) => {
  const d = html(w, '<div id=d><a></a><b></b></div><p></p>');
  const other = d.body.children;
  const list = d.getElementById('d').childNodes;
  const count = (fn) => {
    let n = 0;
    fn(() => n++);
    return n;
  };
  const out = [];
  Object.defineProperty(list, 'length', { value: 0, configurable: true });
  const { values, forEach } = list;
  out.push(
    list.length,
    [...list].length,
    count((cb) => list.forEach(cb)),
  );
  void other.length;
  out.push([...values.call(list)].length);
  void other.length;
  out.push(count((cb) => forEach.call(list, cb)));
  delete list.length;
  out.push([...list].length);
  const kids = d.body.childNodes;
  const it = kids.values();
  it.next();
  Object.defineProperty(kids, 'length', { value: 1, configurable: true });
  out.push(it.next().done);
  const length = Object.getOwnPropertyDescriptor(w.HTMLCollection.prototype, 'length');
  Object.defineProperty(w.HTMLCollection.prototype, 'length', { get: () => 1, configurable: true });
  out.push(
    [...other].length,
    count((cb) => Array.prototype.forEach.call(other, cb)),
  );
  Object.defineProperty(w.HTMLCollection.prototype, 'length', length);
  const tagged = d.getElementsByTagName('*');
  Object.setPrototypeOf(tagged, Object.create(w.HTMLCollection.prototype, { length: { value: 2 } }));
  out.push([...tagged].length);
  return out;
});

test('a RadioNodeList is filtered again only after a change', () => {
  const w = createWindow();
  const d = w.document;
  d.body.innerHTML = '<form><input type=radio name=r><input type=radio name=r></form>';
  const list = d.forms[0].elements.namedItem('r')[S];
  const first = list.items();
  const same = list.items() === first;
  d.forms[0].elements[0].name = 'x';
  const renamed = list.items();
  d.forms[0].append(Object.assign(d.createElement('input'), { type: 'radio', name: 'r' }));
  assert.deepEqual([same, renamed !== first, renamed.length, list.items().length], [true, true, 1, 2]);
});

// document.styleSheets is live while it is iterated: sheets added, removed
// or replaced (new text) meanwhile show at the steps after.
for (const jsdom of [20, 29, 30]) {
  parity(
    `iterating document.styleSheets while adding, removing and changing style elements (jsdom ${jsdom})`,
    (w) => {
      const d = w.document;
      const reset = () => {
        d.head.innerHTML = '<style>.a{}</style><style>.b{}</style><style>.c{}</style>';
      };
      const pass = (change) => {
        reset();
        const seen = [];
        let step = 0;
        for (const sheet of d.styleSheets) {
          seen.push(sheet.cssRules[0].selectorText);
          change(step++);
        }
        return seen.join();
      };
      const style = (text) => {
        const el = d.createElement('style');
        el.textContent = text;
        return el;
      };
      return [
        pass((i) => i === 0 && d.head.append(style('.d{}'))),
        pass(() => d.head.firstElementChild.remove()),
        pass((i) => i === 0 && (d.head.children[2].textContent = '.z{}')),
        pass((i) => i === 0 && (d.head.children[0].textContent = '.y{}')),
        pass((i) => i === 0 && (d.head.children[1].firstChild.data = '.q{}')),
        pass((i) => i === 1 && d.head.prepend(style('.p{}'))),
      ];
    },
    { jsdom },
  );
}

// Iterating reads the items at every step, so they are not rebuilt while
// nothing changed (rebuilding made a pass over n sheets quadratic).
test("document.styleSheets' items are rebuilt only after a change", () => {
  const w = createWindow();
  const d = w.document;
  d.head.innerHTML = '<style>.a{}</style><style>.b{}</style>';
  const list = documentStyleSheets(d)[S];
  const first = list.items();
  const same = list.items() === first;
  d.head.firstElementChild.firstChild.data = '.c{}';
  const afterText = list.items();
  d.head.append(d.createElement('style'));
  const afterTree = list.items();
  assert.deepEqual(
    [same, afterText !== first, afterText[1] === first[1], afterTree !== afterText, afterTree.length],
    [true, true, true, true, 3],
  );
});

parity(
  'static NodeList from querySelectorAll: own properties, read-only, undeletable, unchanged by later changes',
  (w) => {
    const doc = html(w, '<p id="a"></p><p id="b"></p>');
    const list = doc.querySelectorAll('p');
    const again = doc.querySelectorAll('p');
    const desc = (k) => {
      const d = Object.getOwnPropertyDescriptor(list, k);
      return d && { ...d, value: id(d.value) };
    };
    const before = [
      list === again,
      list.length,
      id(list[0]),
      id(list.item(1)),
      list[2],
      Object.keys(list),
      '1' in list,
      '2' in list,
      desc('0'),
      desc('2'),
      desc('length'),
    ];
    list.expando = 1;
    const writes = [
      attempt(() => looseSet(list, '0', null)),
      attempt(() => {
        list[0] = null;
      }),
      attempt(() => looseSet(list, '5', 1)),
      attempt(() => looseDelete(list, '0')),
      attempt(() => looseDelete(list, '5')),
      attempt(() => Object.defineProperty(list, '0', { value: 1 })),
      attempt(() => Object.defineProperty(list, '7', { value: 1 })),
      attempt(() => Object.preventExtensions(list)),
      Object.getOwnPropertyNames(list),
      Object.getOwnPropertySymbols(list).length,
    ];
    doc.body.append(doc.createElement('p'));
    doc.getElementById('a').remove();
    const after = [
      list.length,
      [...list].map(id),
      [...list.entries()].map(([i, el]) => [i, id(el)]),
      [...list.keys()],
      [...list.values()].map(id),
      (() => {
        const seen = [];
        list.forEach((el, i, l) => seen.push([id(el), i, l === list]));
        return seen;
      })(),
      doc.querySelectorAll('p').length,
      list !== doc.querySelectorAll('p'),
    ];
    return [before, writes, after];
  },
);

parity('querySelector and querySelectorAll results do not share cache entries across selector strings', (w) => {
  const doc = html(w, '<div id="x"></div><div id="y"></div>');
  const first = doc.querySelector('div');
  return [
    id(first),
    doc.querySelectorAll('\0div').length,
    doc.querySelectorAll('div').length,
    id(doc.querySelector('div')),
  ];
});

parity('NodeList members on an object inheriting from a NodeList, after the NodeList was read', (w) => {
  const doc = html(w, '<p></p><p></p>');
  const list = doc.querySelectorAll('p');
  const child = Object.create(list);
  const kids = doc.body.childNodes;
  return [
    list.length,
    attempt(() => child.length),
    attempt(() => child.item(0)),
    list.length,
    attempt(() => w.NodeList.prototype.item.call(child, 0)),
    kids.length,
    list.item(0) === doc.body.firstChild,
    attempt(() => Object.getOwnPropertyDescriptor(w.NodeList.prototype, 'length').get.call(kids)),
    list.length,
  ];
});
