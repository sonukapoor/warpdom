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
