import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWindow } from '../src/index.js';

const own = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);

test('style has jsdom\'s shape: methods on CSSStyleDeclaration, properties on CSSStyleProperties', () => {
  const w = createWindow();
  const style = w.document.createElement('div').style;
  assert.ok(style instanceof w.CSSStyleDeclaration && style instanceof w.CSSStyleProperties);
  for (const key of ['cssText', 'length', 'item', 'getPropertyValue', 'getPropertyPriority', 'setProperty', 'removeProperty']) {
    assert.ok(own(w.CSSStyleDeclaration.prototype, key), key);
  }
  for (const key of ['backgroundColor', 'background-color', 'webkitAnimation', 'WebkitAnimation', 'cssFloat']) {
    assert.ok(own(w.CSSStyleProperties.prototype, key), key);
  }
  assert.ok('WebkitAnimation' in style); // React's vendor-prefix detection
  assert.equal(style.WebkitAnimation, '');
  assert.equal(w.document.createElement('div').style === w.document.createElement('div').style, false);
});

test('setting properties serializes like jsdom', () => {
  const el = createWindow().document.createElement('div');
  el.style.backgroundColor = 'red';
  el.style.setProperty('margin-top', '4px', 'important');
  assert.equal(el.style.cssText, 'background-color: red; margin-top: 4px !important;');
  assert.equal(el.style.length, 2);
  assert.equal(el.style.item(0), 'background-color');
  assert.equal(el.style.getPropertyValue('margin-top'), '4px');
  assert.equal(el.style.getPropertyPriority('margin-top'), 'important');
  assert.equal(el.style['background-color'], 'red');
  assert.equal(el.style.cssFloat, '');
  el.style.cssFloat = 'left';
  assert.equal(el.style.getPropertyValue('float'), 'left');
  el.style.webkitTransform = 'none';
  assert.equal(el.style.getPropertyValue('-webkit-transform'), 'none');
});

test('removing properties', () => {
  const el = createWindow().document.createElement('div');
  el.style.color = 'blue';
  el.style.width = '10px';
  el.style.color = '';
  assert.equal(el.style.cssText, 'width: 10px;');
  assert.equal(el.style.removeProperty('width'), '10px');
  assert.equal(el.style.cssText, '');
  el.style.height = '1px';
  el.style.height = null;
  assert.equal(el.style.length, 0);
});

test('the style attribute and the style object stay in sync', () => {
  const el = createWindow().document.createElement('div');
  el.setAttribute('style', 'color: blue; width:10px');
  assert.equal(el.style.color, 'blue');
  assert.equal(el.style.width, '10px');
  assert.equal(el.style.length, 2);
  el.style.color = '';
  assert.equal(el.getAttribute('style'), 'width: 10px;');
  el.setAttribute('style', 'height: 2px');
  assert.equal(el.style.cssText, 'height: 2px;');
  el.removeAttribute('style');
  assert.equal(el.style.length, 0);
});

test('cssText parsing handles semicolons inside url() and quotes', () => {
  const el = createWindow().document.createElement('div');
  el.style.cssText = 'background-image: url(data:image/png;base64,AAA); content: "a;b"; color: red !important';
  assert.equal(el.style.backgroundImage, 'url(data:image/png;base64,AAA)');
  assert.equal(el.style.content, '"a;b"');
  assert.equal(el.style.getPropertyPriority('color'), 'important');
  assert.equal(el.style.length, 3);
});

import { parity as cssParity } from './parity.js';

cssParity('CSS.escape and CSS.supports', (w) => [
  w.CSS.escape('#a.b:c'), w.CSS.escape('1x'), w.CSS.escape('-'), w.CSS.escape('-1a'), w.CSS.escape('\0'), w.CSS.escape('a\x7fb'),
  w.CSS.supports('display', 'grid'), w.CSS.supports('(display: grid)'), w.CSS.supports('foo', 'bar'), w.CSS.supports('display: grid'),
  w.CSS.supports('(display: grid) and (color: red)'), w.CSS.supports('(foo: x) or (color: red)'), w.CSS.supports('--x', '1'), String(w.CSS),
]);

cssParity('removing an absent style property does not add a style attribute', (w) => {
  const div = w.document.createElement('div');
  div.style.color = '';
  div.style.removeProperty('margin');
  const out = [div.outerHTML];
  div.style.color = 'red';
  div.style.color = '';
  out.push(div.outerHTML);
  const other = w.document.createElement('div');
  other.style.cssText = '';
  out.push(other.outerHTML);
  return out;
});
