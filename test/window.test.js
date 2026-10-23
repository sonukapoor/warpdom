import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWindow } from '../src/index.js';
import { parity } from './parity.js';

// An interface's prototype as tests can observe it: own keys in order, each
// descriptor's kind and attributes, and the prototype chain by name.
function shape(proto) {
  const members = Reflect.ownKeys(proto).map((key) => {
    const d = Object.getOwnPropertyDescriptor(proto, key);
    const kind = 'value' in d ? `value:${typeof d.value}:${d.writable}` : `accessor:${typeof d.get}:${typeof d.set}`;
    return `${String(key)} ${kind} ${d.enumerable} ${d.configurable}`;
  });
  const chain = [];
  for (let p = Object.getPrototypeOf(proto); p; p = Object.getPrototypeOf(p))
    chain.push(Object.hasOwn(p, 'constructor') ? p.constructor.name : '?');
  return { members, chain };
}

test('an interface created first in a later window has the same members, descriptors and chain', async () => {
  // In a fresh process, so no other test has built these interfaces yet.
  const { execFileSync } = await import('node:child_process');
  const script = `
    import { createWindow } from ${JSON.stringify(new URL('../src/index.js', import.meta.url).href)};
    const shape = ${shape.toString()};
    const names = ['CSSStyleProperties', 'HTMLInputElement', 'HTMLTableCellElement', 'HTMLElement', 'Element', 'Node', 'KeyboardEvent', 'Range'];
    const early = createWindow();
    const late = createWindow();
    const lateShapes = names.map((n) => shape(late[n].prototype));
    const earlyShapes = names.map((n) => shape(early[n].prototype));
    console.log(JSON.stringify({ lateShapes, earlyShapes, fresh: names.map((n) => shape(createWindow()[n].prototype)) }));
  `;
  const out = JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', script], { encoding: 'utf8' }));
  assert.deepEqual(out.earlyShapes, out.lateShapes);
  assert.deepEqual(out.fresh, out.lateShapes);
  // And as in this process.
  const w = createWindow();
  const names = [
    'CSSStyleProperties',
    'HTMLInputElement',
    'HTMLTableCellElement',
    'HTMLElement',
    'Element',
    'Node',
    'KeyboardEvent',
    'Range',
  ];
  assert.deepEqual(
    names.map((n) => shape(w[n].prototype)),
    out.lateShapes,
  );
  const [style, input, cell] = out.lateShapes;
  assert.deepEqual(style.chain, ['CSSStyleDeclaration', 'Object']);
  assert.ok(style.members.length > 1000);
  assert.ok(style.members.includes('backgroundColor accessor:function:function true true'));
  assert.ok(style.members.includes('cssFloat accessor:function:function true true'));
  assert.deepEqual(input.chain, ['HTMLElement', 'Element', 'Node', 'EventTarget', 'Object']);
  for (const member of [
    'value accessor:function:function true true',
    'required accessor:function:function true true',
    'autocomplete accessor:function:function true true',
    'select value:function:true true true',
  ]) {
    assert.ok(input.members.includes(member), member);
  }
  assert.ok(cell.members.includes('colSpan accessor:function:function true true'));
  assert.equal(input.members.at(-2), 'constructor value:function:true false true');
  assert.equal(input.members.at(-1), 'Symbol(Symbol.toStringTag) value:string:false false true');
});

test('prototypes are ordinary objects on the expected chain', () => {
  const w = createWindow();
  const style = w.document.createElement('div').style;
  assert.equal(Object.getPrototypeOf(w.CSSStyleProperties.prototype), w.CSSStyleDeclaration.prototype);
  assert.equal(Object.getPrototypeOf(w.EventTarget.prototype), Object.prototype);
  assert.equal(style instanceof w.CSSStyleDeclaration, true);
  assert.equal('color' in style, true);
  assert.equal(typeof w.HTMLElement.prototype.hasOwnProperty, 'function');
  assert.equal(String(w.HTMLElement.prototype), '[object HTMLElement]');
  assert.equal(Object.keys(w.Node.prototype).includes('appendChild'), true);
});

test('each window has its own interfaces: patches do not leak', () => {
  const a = createWindow();
  const b = createWindow();
  assert.notEqual(a.HTMLElement, b.HTMLElement);
  Object.defineProperty(a.HTMLElement.prototype, 'offsetWidth', { get: () => 42, configurable: true });
  assert.equal(a.document.createElement('div').offsetWidth, 42);
  assert.equal(b.document.createElement('div').offsetWidth, 0);
});

test('instanceof works per window and follows the inheritance chain', () => {
  const a = createWindow();
  const b = createWindow();
  const div = a.document.createElement('div');
  for (const name of ['HTMLDivElement', 'HTMLElement', 'Element', 'Node', 'EventTarget']) {
    assert.ok(div instanceof a[name], `div instanceof ${name}`);
  }
  assert.ok(!(div instanceof b.HTMLElement));
  assert.ok(a.document instanceof a.Document && a.document instanceof a.Node);
});

test('interfaces are not constructible except where the spec allows it', () => {
  const w = createWindow();
  assert.throws(() => new w.HTMLElement(), TypeError);
  assert.throws(() => new w.Node(), TypeError);
  assert.equal(new w.Event('x').type, 'x');
  assert.equal(new w.Text('hi').data, 'hi');
});

test('members live on the same prototypes as in jsdom', () => {
  const w = createWindow();
  const own = (ctor, key) => Object.prototype.hasOwnProperty.call(ctor.prototype, key);
  assert.ok(own(w.Node, 'appendChild') && own(w.Node, 'nodeType') && own(w.Node, 'textContent'));
  assert.ok(own(w.Element, 'setAttribute') && own(w.Element, 'tagName') && own(w.Element, 'querySelector'));
  assert.ok(own(w.HTMLElement, 'offsetWidth') && own(w.HTMLElement, 'hidden'));
  assert.ok(own(w.EventTarget, 'addEventListener'));
  assert.equal(typeof Object.getOwnPropertyDescriptor(w.HTMLElement.prototype, 'offsetWidth').get, 'function');
});

test('internal state is invisible to enumeration', () => {
  const w = createWindow();
  const div = w.document.createElement('div');
  div.setAttribute('id', 'x');
  w.document.body.appendChild(div);
  assert.deepEqual(Object.keys(div), []);
  assert.deepEqual(Object.getOwnPropertyNames(div), []);
});

test('document has html, head and body, and knows its window', () => {
  const window = createWindow();
  const { document } = window;
  assert.equal(document.defaultView, window);
  assert.equal(document.documentElement.tagName, 'HTML');
  assert.equal(document.head.parentNode, document.documentElement);
  assert.equal(document.body.parentNode, document.documentElement);
  assert.equal(document.body.ownerDocument, document);
});

test('tree operations', () => {
  const { document } = createWindow();
  const ul = document.createElement('ul');
  const a = ul.appendChild(document.createElement('li'));
  const c = ul.appendChild(document.createElement('li'));
  const b = ul.insertBefore(document.createElement('li'), c);
  assert.deepEqual(ul.childNodes.length, 3);
  assert.equal(ul.firstChild, a);
  assert.equal(ul.lastChild, c);
  assert.equal(a.nextSibling, b);
  assert.equal(c.previousSibling, b);
  assert.equal(b.parentElement, ul);
  ul.removeChild(b);
  assert.equal(a.nextSibling, c);
  assert.equal(b.parentNode, null);
  document.body.appendChild(a); // moving re-parents
  assert.equal(a.parentNode, document.body);
  assert.equal(ul.childNodes.length, 1);
  assert.ok(document.body.contains(a) && !ul.contains(a));
});

test('attributes', () => {
  const { document } = createWindow();
  const el = document.createElement('div');
  assert.equal(el.getAttribute('id'), null);
  el.setAttribute('id', 'main');
  el.setAttribute('data-x', 1);
  assert.equal(el.getAttribute('data-x'), '1');
  assert.equal(el.id, 'main');
  assert.ok(el.hasAttribute('id'));
  el.removeAttribute('id');
  assert.ok(!el.hasAttribute('id'));
  el.className = 'a b';
  assert.equal(el.getAttribute('class'), 'a b');
});

test('text content', () => {
  const { document } = createWindow();
  const p = document.createElement('p');
  p.appendChild(document.createTextNode('Hello, '));
  const b = p.appendChild(document.createElement('b'));
  b.textContent = 'world';
  assert.equal(p.textContent, 'Hello, world');
  p.textContent = 'reset';
  assert.equal(p.childNodes.length, 1);
  assert.equal(p.firstChild.nodeType, 3);
});

test('selectors: tag, id, class', () => {
  const { document } = createWindow();
  const list = document.body.appendChild(document.createElement('ul'));
  for (let i = 0; i < 3; i++) {
    const li = list.appendChild(document.createElement('li'));
    li.className = i % 2 ? 'odd' : 'even';
    li.textContent = `item ${i}`;
  }
  list.setAttribute('id', 'list');
  assert.equal(document.querySelectorAll('li').length, 3);
  assert.equal(document.querySelector('.odd').textContent, 'item 1');
  assert.equal(document.getElementById('list'), list);
  assert.ok(list.firstChild.matches('li') && list.firstChild.matches('.even'));
});

test('events: listeners, bubbling, stopPropagation, preventDefault', () => {
  const w = createWindow();
  const { document } = w;
  const outer = document.body.appendChild(document.createElement('div'));
  const inner = outer.appendChild(document.createElement('button'));
  const seen = [];
  const onInner = (e) => seen.push(['inner', e.target === inner, e.currentTarget === inner]);
  inner.addEventListener('click', onInner);
  inner.addEventListener('click', onInner); // duplicates are ignored
  outer.addEventListener('click', (e) => seen.push(['outer', e.currentTarget === outer]));
  inner.dispatchEvent(new w.Event('click', { bubbles: true }));
  assert.deepEqual(seen, [
    ['inner', true, true],
    ['outer', true],
  ]);

  seen.length = 0;
  inner.removeEventListener('click', onInner);
  inner.addEventListener('click', (e) => e.stopPropagation());
  inner.dispatchEvent(new w.Event('click', { bubbles: true }));
  assert.deepEqual(seen, []);

  const e = new w.Event('submit', { cancelable: true });
  outer.addEventListener('submit', (ev) => ev.preventDefault());
  assert.equal(outer.dispatchEvent(e), false);
  assert.ok(e.defaultPrevented);
});

test('installWindow puts a window on a global and restores it', async () => {
  const { installWindow } = await import('../src/vitest.js');
  const global = { existing: 1, Event: 'node-event' };
  const window = createWindow();
  const restore = installWindow(global, window);
  assert.equal(global.window, global);
  assert.equal(global.document.defaultView, global);
  assert.equal(global.Event, window.Event);
  assert.ok(global.document.createElement('div') instanceof global.HTMLElement);
  // Methods inherited from Window.prototype and EventTarget.prototype too.
  let fired = 0;
  global.addEventListener('ping', () => fired++);
  global.dispatchEvent(new global.Event('ping'));
  assert.equal(fired, 1);
  global.customGlobal = 1;
  global.Event = 'replaced by a test';
  assert.equal(window.Event, 'replaced by a test');
  restore();
  assert.equal(global.Event, 'node-event');
  assert.equal(global.window, undefined);
  assert.equal(global.document, undefined);
  assert.equal(global.existing, 1);
});

test('every HTML element interface exists and tags create the right one', async () => {
  const { HTML_ELEMENTS } = await import('../src/html-elements.js');
  const w = createWindow();
  for (const [name] of HTML_ELEMENTS) assert.equal(typeof w[name], 'function', name);
  const is = (tag, name) => assert.ok(w.document.createElement(tag) instanceof w[name], `${tag} -> ${name}`);
  is('iframe', 'HTMLIFrameElement');
  is('video', 'HTMLVideoElement');
  is('video', 'HTMLMediaElement');
  is('td', 'HTMLTableCellElement');
  is('section', 'HTMLElement');
  assert.equal(w.document.createElement('section').constructor, w.HTMLElement);
  is('my-widget', 'HTMLElement');
  is('foo', 'HTMLUnknownElement');
  is('H2', 'HTMLHeadingElement');
});

parity('class strings: Object.prototype.toString names the interface', (w) => {
  const d = w.document;
  const e = d.createElement('div');
  e.innerHTML = '<input><select><option></option></select>';
  const objects = [
    w,
    d,
    d.doctype,
    d.implementation,
    e,
    e.firstChild,
    e.style,
    e.classList,
    e.attributes,
    e.childNodes,
    e.children,
    d.createTextNode('x'),
    d.createComment('x'),
    d.createDocumentFragment(),
    d.createRange(),
    w.getSelection(),
    new w.Event('x'),
    new w.MouseEvent('click'),
    new w.CustomEvent('x'),
    w.navigator,
    w.location,
    w.history,
    w.screen,
    d.createElementNS('http://www.w3.org/2000/svg', 'svg'),
    e.querySelectorAll('*'),
    e.querySelector('select').options,
    d.createTreeWalker(d),
    new w.MutationObserver(() => {}),
  ];
  return objects.map((o) => Object.prototype.toString.call(o));
});

test('interfaces are created on first use, once per window', () => {
  const w = createWindow();
  const lazy = (name) => typeof Object.getOwnPropertyDescriptor(w, name).get === 'function';
  assert.equal(lazy('HTMLTableElement'), true);
  assert.equal('HTMLTableElement' in w, true);
  const table = w.document.createElement('table');
  assert.equal(lazy('HTMLTableElement'), false);
  assert.equal(table instanceof w.HTMLTableElement, true);
  assert.equal(w.HTMLTableElement, w.HTMLTableElement);
  assert.equal(Object.getPrototypeOf(w.HTMLTableElement), w.HTMLElement);
  // Another window has its own interfaces.
  const other = createWindow();
  assert.notEqual(other.HTMLTableElement, w.HTMLTableElement);
  assert.equal(table instanceof other.HTMLTableElement, false);
  // A mock assigned before the interface exists stays.
  const mock = function ResizeObserverMock() {};
  w.ResizeObserver = mock;
  w.MutationObserver = mock;
  new w.MutationObserver(() => {});
  assert.equal(w.MutationObserver, mock);
  // Deleted stays deleted, also when warpdom creates the interface itself.
  delete w.HTMLDialogElement;
  w.document.createElement('dialog');
  assert.equal('HTMLDialogElement' in w, false);
  // Legacy factory constructors.
  const img = new w.Image();
  assert.equal(img instanceof w.HTMLImageElement, true);
  assert.equal(w.Image.prototype, w.HTMLImageElement.prototype);
  assert.equal(new w.Option('a', 'b').value, 'b');
});
