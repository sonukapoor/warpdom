import { test, expect, vi } from 'vitest';

// Window members tests override (#68), black box with Vitest 5's jsdom
// environment on jsdom 20.0.3, 26.1.0 and 30.1.3: VIEWPORT_EXPECT is
// 'forks' (Vitest copies the window's members to Node's global as
// accessors), 'vm' (VM pools: the global is the window; jsdom 27 and
// later) or 'vm-legacy' (VM pools, jsdom 26 and earlier: data properties).
const expected = {
  forks: { innerWidth: 'accessor c', assign: '640 accessor c', define: '300 data c', defineThenAssign: 'TypeError', self: 'data wec', status: 'number' },
  vm: { innerWidth: 'accessor ec', assign: '640 data wec', define: '300 data ec', defineThenAssign: 'TypeError', self: 'accessor ec', status: 'string' },
  'vm-legacy': { innerWidth: 'data wec', assign: '640 data wec', define: '300 data wec', defineThenAssign: 400, self: 'accessor ec', status: 'number' },
}[process.env.VIEWPORT_EXPECT];

const kind = (key) => {
  const d = Object.getOwnPropertyDescriptor(window, key);
  return `${'value' in d ? 'data' : 'accessor'} ${d.writable ? 'w' : ''}${d.enumerable ? 'e' : ''}${d.configurable ? 'c' : ''}`;
};

test('vi.spyOn(window, innerWidth, get) works and restores', () => {
  expect(kind('innerWidth')).toBe(expected.innerWidth);
  const spy = vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(500);
  expect(window.innerWidth).toBe(500);
  spy.mockRestore();
  expect(window.innerWidth).toBe(1024);
});

test('assignments and Object.defineProperty', () => {
  window.innerWidth = 640;
  expect(`${window.innerWidth} ${kind('innerWidth')}`).toBe(expected.assign);
  Object.defineProperty(window, 'innerHeight', { value: 300 });
  expect(`${window.innerHeight} ${kind('innerHeight')}`).toBe(expected.define);
  let result;
  try { window.innerHeight = 400; result = window.innerHeight; } catch (e) { result = e.constructor.name; }
  expect(result).toBe(expected.defineThenAssign);
  window.name = 5;
  expect(window.name).toBe(5);
  window.status = 5;
  expect(typeof window.status).toBe(expected.status);
  expect(kind('self')).toBe(expected.self);
  expect(Object.keys(window)).toContain('self');
});

// Where the global is the window (VM pools), an inline event handler's
// global scope is that global: it reads the initial data properties and
// what the test assigned, also after a second assignment to a
// [Replaceable] accessor (jsdom 27 and later), and its own assignments to
// window are the test's (black box: jsdom 20.0.3, 26.1.0, 30.1.3).
test.skipIf(process.env.VIEWPORT_EXPECT === 'forks')('inline event handlers read the global\'s members', () => {
  const div = document.createElement('div');
  div.setAttribute('onclick', 'document.body.dataset.r = [innerWidth, window.innerWidth, name, outerWidth, scrollY, innerHeight, status].join(); window.fromHandler = 1');
  document.body.append(div);
  window.name = '';
  window.status = '';
  // Defined by the test before (300 or 400, per version).
  const h = window.innerHeight;
  div.click();
  expect(document.body.dataset.r).toBe(`640,640,,1024,0,${h},`);
  expect(window.fromHandler).toBe(1);
  window.innerWidth = 700;
  window.outerWidth = 900;
  window.name = 'n1';
  div.click();
  expect(document.body.dataset.r).toBe(`700,700,n1,900,0,${h},`);
  window.innerWidth = 800;
  window.outerWidth = 1000;
  window.scrollY = 5;
  window.name = 'n2';
  window.status = 'st';
  div.click();
  expect(document.body.dataset.r).toBe(`800,800,n2,1000,5,${h},st`);
  div.remove();
});

// An inline event handler finds the window's named objects (a sibling's
// id, live, a form's name) in every pool, also where the global does no
// named access (VM pools), as with jsdom (black box: jsdom 20.0.3, 26.1.0,
// 30.1.3).
test('inline event handlers find named elements', () => {
  document.body.innerHTML = '<div id="result"></div><form name="fname"></form><div id="dup"></div><span id="dup"></span><div id="gone"></div>'
    + '<button id="t" onclick="result.textContent = \'ok\'; document.body.dataset.r = [fname.tagName, dup.length, typeof late, typeof gone, typeof nosuch].join()"></button>';
  const button = document.getElementById('t');
  button.click();
  expect(document.getElementById('result').textContent).toBe('ok');
  expect(document.body.dataset.r).toBe('FORM,2,undefined,object,undefined');
  document.body.insertAdjacentHTML('beforeend', '<span id="late"></span>');
  document.getElementById('gone').remove();
  button.click();
  expect(document.body.dataset.r).toBe('FORM,2,object,undefined,undefined');
  document.body.innerHTML = '';
});

// Where the global is the window (VM pools): the global's own and inherited
// members come before named objects, and an assignment to a named object's
// name goes to the global, which then hides it (black box: jsdom 20.0.3,
// 26.1.0, 30.1.3).
test.skipIf(process.env.VIEWPORT_EXPECT === 'forks')('inline event handlers: the global before named elements', () => {
  window.shadowed = 'g';
  document.body.innerHTML = '<div id="shadowed"></div><div id="setTimeout"></div><div id="an"></div>'
    + '<button id="t" onclick="document.body.dataset.r = [shadowed, typeof setTimeout, typeof an].join(); an = 5; fresh = 6"></button>';
  const button = document.getElementById('t');
  button.click();
  expect(document.body.dataset.r).toBe('g,function,object');
  expect([window.an, window.fresh]).toEqual([5, 6]);
  button.click();
  expect(document.body.dataset.r).toBe('g,function,number');
  delete window.shadowed;
  delete window.an;
  delete window.fresh;
  document.body.innerHTML = '';
});

// frames and a frame's parent and top read what the test assigns to window
// in every pool; where the global is the window (VM pools) they are the
// global, and window[0] is the frame (black box: jsdom 20.0.3, 26.1.0,
// 30.1.3).
test('frame aliases follow the window', () => {
  const iframe = document.createElement('iframe');
  document.body.append(iframe);
  const cw = iframe.contentWindow;
  expect(window.frames[0]).toBe(cw);
  if (process.env.VIEWPORT_EXPECT !== 'forks') {
    expect([window.frames === window, cw.parent === window, cw.top === window, window[0] === cw]).toEqual([true, true, true, true]);
  }
  const { name, innerWidth } = window;
  window.name = 'updated';
  window.innerWidth = 640;
  expect([window.frames.name, cw.parent.name, cw.top.name, cw.parent.innerWidth]).toEqual(['updated', 'updated', 'updated', 640]);
  window.innerWidth = 800;
  expect([window.frames.innerWidth, cw.parent.innerWidth, cw.top.innerWidth]).toEqual([800, 800, 800]);
  iframe.remove();
  expect(window[0]).toBe(undefined);
  window.name = name;
  window.innerWidth = innerWidth;
});

// Object.keys(globalThis): Node's enumerable globals the window's members
// replace stay enumerable (navigator), the window's other members are not
// in forks and threads, and window is (black box: jsdom 20.0.3, 26.1.0,
// 30.1.3).
test('enumerable globals', () => {
  const keys = Object.keys(globalThis);
  expect(['navigator', 'window'].filter((k) => !keys.includes(k))).toEqual([]);
  const windowKeys = ['document', 'location', 'innerWidth', 'addEventListener', 'getComputedStyle'].filter((k) => keys.includes(k));
  expect(windowKeys).toEqual(process.env.VIEWPORT_EXPECT === 'forks' ? [] : ['document', 'location', 'innerWidth', 'addEventListener', 'getComputedStyle']);
});

// Where the global is the window (VM pools): an inline handler's window
// scope is the global as an object, so its properties and the named
// objects come before the global let/const of classic scripts, the
// handler's assignments go to the global's properties, and the global's
// functions get the global as this (black box: jsdom 20.0.3, 26.1.0,
// 30.1.3).
test.skipIf(process.env.VIEWPORT_EXPECT === 'forks')('inline event handlers: the global before script bindings', () => {
  const s = document.createElement('script');
  s.textContent = 'let counter = 42; const kc = 7; let solo = 1;';
  document.head.append(s);
  window.whoami = function () { return this === window; };
  document.body.innerHTML = '<div id="counter"></div><div id="kc"></div><button id="b" onclick="document.body.dataset.r = [typeof counter, String(counter), String(kc), solo, whoami()].join(); counter = counter + 1; kc = 8; solo = 2"></button>';
  const b = document.getElementById('b');
  b.click();
  expect(document.body.dataset.r).toBe('object,[object HTMLDivElement],[object HTMLDivElement],1,true');
  b.click();
  expect(document.body.dataset.r).toBe('string,[object HTMLDivElement]1,8,2,true');
  const s2 = document.createElement('script');
  s2.textContent = 'document.body.dataset.c = [counter, kc, solo, "solo" in window, window.counter, window.kc].join()';
  document.head.append(s2);
  expect(document.body.dataset.c).toBe('42,7,2,false,[object HTMLDivElement]11,8');
  delete window.whoami;
  delete window.counter;
  delete window.kc;
  document.body.innerHTML = '';
});

// The view of the events warpdom fires (focus, blur, click(), a label's
// click) reads what the test assigned to window in every pool; where the
// global is the window (VM pools) it is the global (black box: jsdom
// 20.0.3, 26.1.0, 30.1.3).
test('event.view follows the window', () => {
  const { name, innerWidth } = window;
  window.name = 'updated';
  window.innerWidth = 800;
  document.body.innerHTML = '<input id="i"><label id="l">x<input id="li" type="checkbox"></label><button id="b"></button>';
  const views = [];
  const rec = (k) => (e) => { views.push(`${k}:${e.view === window},${e.view.name},${e.view.innerWidth}`); };
  const i = document.getElementById('i');
  for (const type of ['focus', 'focusin', 'blur']) i.addEventListener(type, rec(type));
  i.focus();
  i.blur();
  document.getElementById('b').addEventListener('click', rec('click'));
  document.getElementById('b').click();
  document.getElementById('li').addEventListener('click', rec('label'));
  document.getElementById('l').click();
  const same = process.env.VIEWPORT_EXPECT !== 'forks';
  expect(views).toEqual(['focus', 'focusin', 'blur', 'click', 'label'].map((k) => `${k}:${same},updated,800`));
  window.name = name;
  window.innerWidth = innerWidth;
  document.body.innerHTML = '';
});
