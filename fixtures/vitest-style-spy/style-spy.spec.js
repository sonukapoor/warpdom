import { test, expect, vi } from 'vitest';

// Spying on the style accessors (#72), black box with jsdom 20.0.3 to
// 30.1.3: before jsdom 29 the accessors are CSSStyleDeclaration's and
// vi.spyOn(CSSStyleDeclaration.prototype, 'width', 'get') sees el.style
// and getComputedStyle reads; from 29 they are CSSStyleProperties' and
// that spy throws (the property is not on CSSStyleDeclaration's chain).
// STYLE_SPY_EXPECT: 'declaration' (jsdom 20 to 28) or 'properties'.
const legacy = process.env.STYLE_SPY_EXPECT === 'declaration';
const accessors = () => (legacy ? CSSStyleDeclaration.prototype : CSSStyleProperties.prototype);

test('the style objects\' interfaces', () => {
  const style = document.body.style;
  expect(typeof globalThis.CSSStyleProperties).toBe(legacy ? 'undefined' : 'function');
  expect(Object.prototype.toString.call(style)).toBe(legacy ? '[object Object]' : '[object CSSStyleProperties]');
  expect(style instanceof CSSStyleDeclaration).toBe(true);
  expect(Object.hasOwn(CSSStyleDeclaration.prototype, 'width')).toBe(legacy);
  expect(Object.getPrototypeOf(getComputedStyle(document.body))).toBe(Object.getPrototypeOf(style));
});

test('vi.spyOn(CSSStyleDeclaration.prototype, width, get)', () => {
  const spy = () => vi.spyOn(CSSStyleDeclaration.prototype, 'width', 'get');
  if (!legacy) {
    expect(spy).toThrow();
    return;
  }
  const el = document.body.appendChild(document.createElement('div'));
  el.style.width = '10px';
  const width = spy().mockReturnValue('42px');
  expect(el.style.width).toBe('42px');
  expect(getComputedStyle(el).width).toBe('42px');
  expect(width).toHaveBeenCalledTimes(2);
  width.mockRestore();
  expect(el.style.width).toBe('10px');
});

test('a spied getter and setter on the accessors\' prototype', () => {
  const el = document.body.appendChild(document.createElement('div'));
  const get = vi.spyOn(accessors(), 'height', 'get').mockReturnValue('7px');
  const set = vi.spyOn(accessors(), 'height', 'set');
  el.style.height = '5px';
  expect(set).toHaveBeenCalledWith('5px');
  expect(el.style.height).toBe('7px');
  expect(getComputedStyle(el).height).toBe('7px');
  get.mockRestore();
  set.mockRestore();
  expect(el.style.height).toBe('5px');
  expect(el.style.cssText).toBe('height: 5px;');
});
