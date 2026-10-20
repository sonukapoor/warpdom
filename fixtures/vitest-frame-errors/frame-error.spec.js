import { test } from 'vitest';

// As with jsdom: an exception in a frame's listener is logged (jsdom's
// virtual console) and does not fail the test; only the top window's
// 'error' event is watched.
test('an error thrown in a frame\'s listener is logged', () => {
  const frame = document.body.appendChild(document.createElement('iframe'));
  const button = frame.contentDocument.body.appendChild(frame.contentDocument.createElement('button'));
  button.addEventListener('click', () => { throw new Error('thrown in a frame listener'); });
  button.dispatchEvent(new frame.contentWindow.MouseEvent('click'));
});

test('an error thrown in a frame\'s XMLHttpRequest onload is logged', async () => {
  const frame = document.body.appendChild(document.createElement('iframe'));
  const x = new frame.contentWindow.XMLHttpRequest();
  await new Promise((resolve) => {
    x.onloadend = () => setTimeout(resolve, 20);
    x.onload = () => { throw new Error('thrown in a frame xhr onload'); };
    x.open('GET', 'data:text/plain,ok');
    x.send();
  });
});
