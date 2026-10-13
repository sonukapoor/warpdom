import { test, expect } from 'vitest';
import { shared } from './state.js';

test('a: renders, and leaves module state behind', () => {
  document.body.innerHTML = '<p id="a">a</p>';
  expect(document.getElementById('a').textContent).toBe('a');
  shared.count++;
});
