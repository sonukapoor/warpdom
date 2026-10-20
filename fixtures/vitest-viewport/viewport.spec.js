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
