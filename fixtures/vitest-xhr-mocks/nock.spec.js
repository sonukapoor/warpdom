// nock with axios and plain XMLHttpRequest: the same results on warpdom
// and jsdom. nock answers XMLHttpRequest itself (@mswjs/interceptors'
// XMLHttpRequest interceptor), so no CORS check applies to its replies.
import { afterEach, expect, test, vi } from 'vitest';
import nock from 'nock';
import axios from 'axios';

afterEach(() => { nock.cleanAll(); vi.restoreAllMocks(); });

test('axios takes XMLHttpRequest, and nock answers', async () => {
  const open = vi.spyOn(XMLHttpRequest.prototype, 'open');
  const scope = nock('http://localhost:3000').get('/api/user').reply(200, { name: 'Ada' }, { 'X-Test': '1' });
  const response = await axios.get('http://localhost:3000/api/user');
  expect(response.data).toEqual({ name: 'Ada' });
  expect(response.headers['x-test']).toBe('1');
  expect(open).toHaveBeenCalledTimes(1);
  expect(scope.isDone()).toBe(true);
});

test('axios: cross-origin replies, with and without Access-Control-Allow-Origin', async () => {
  nock('https://api.example.com').post('/items', { a: 1 }).reply(201, { ok: true }, { 'Access-Control-Allow-Origin': '*' });
  const created = await axios.post('https://api.example.com/items', { a: 1 });
  expect([created.status, created.data]).toEqual([201, { ok: true }]);
  nock('https://api.example.com').get('/plain').reply(200, { ok: true });
  expect((await axios.get('https://api.example.com/plain')).data).toEqual({ ok: true });
  nock('https://api.example.com').get('/down').replyWithError('connection refused');
  await expect(axios.get('https://api.example.com/down')).rejects.toMatchObject({ code: 'ERR_NETWORK' });
});

test('XMLHttpRequest with nock: status, headers, body', async () => {
  nock('http://localhost:3000').get('/text').reply(404, 'missing', { 'Content-Type': 'text/plain' });
  const result = await new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.onloadend = () => resolve([xhr.status, xhr.responseText, xhr.getResponseHeader('content-type')]);
    xhr.open('GET', 'http://localhost:3000/text');
    xhr.send();
  });
  expect(result).toEqual([404, 'missing', 'text/plain']);
});
