import { test } from 'vitest';

test('an error thrown in an event listener fails the run', () => {
  const button = document.body.appendChild(document.createElement('button'));
  button.addEventListener('click', () => { throw new Error('thrown in a listener'); });
  button.dispatchEvent(new MouseEvent('click'));
});
