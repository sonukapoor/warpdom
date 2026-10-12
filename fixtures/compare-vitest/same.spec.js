import { describe, test, expect } from 'vitest';

test('creates an element', () => {
  const div = document.createElement('div');
  div.textContent = 'hi';
  document.body.append(div);
  expect(document.body.textContent).toBe('hi');
});

describe('events', () => {
  test('dispatches a click', () => {
    let clicks = 0;
    document.body.addEventListener('click', () => clicks++);
    document.body.click();
    expect(clicks).toBe(1);
  });
});
