// environmentOptions.warpdom.xhr: false: no XMLHttpRequest; axios takes
// Node's http client, which nock intercepts without CORS.
import { expect, test } from 'vitest';
import nock from 'nock';
import axios from 'axios';

test('no XMLHttpRequest; axios goes through Node\'s http client', async () => {
  expect([typeof XMLHttpRequest, typeof window.XMLHttpRequest, typeof XMLHttpRequestUpload, typeof ProgressEvent]).toEqual(['undefined', 'undefined', 'undefined', 'function']);
  nock('https://api.example.com').get('/plain').reply(200, { ok: true });
  const response = await axios.get('https://api.example.com/plain');
  expect(response.data).toEqual({ ok: true });
});
