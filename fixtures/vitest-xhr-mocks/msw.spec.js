// msw with axios and plain XMLHttpRequest: the same results on warpdom and
// jsdom. msw answers the request the XMLHttpRequest makes, so its CORS
// checks apply: a cross-origin response needs Access-Control-Allow-Origin.
import http from 'node:http';
import { afterAll, afterEach, beforeAll, expect, test, vi } from 'vitest';
import { setupServer } from 'msw/node';
import { http as rest, HttpResponse, passthrough } from 'msw';
import axios from 'axios';

let real;
let realURL;
const server = setupServer(
  rest.get('http://localhost:3000/api/user', () => HttpResponse.json({ name: 'Ada' }, { headers: { 'X-Test': '1' } })),
  rest.post('https://api.example.com/items', async ({ request }) => HttpResponse.json({ got: await request.json(), type: request.headers.get('content-type') },
    { status: 201, headers: { 'Access-Control-Allow-Origin': '*' } })),
  rest.get('https://api.example.com/no-cors', () => HttpResponse.json({ ok: true })),
  rest.get('http://localhost:3000/api/fail', () => HttpResponse.error()),
  rest.get('http://localhost:3000/api/missing', () => new HttpResponse('nope', { status: 404, statusText: 'Not Found' })),
  rest.get(/^http:\/\/127\.0\.0\.1:\d+\/real$/, () => passthrough()),
);

beforeAll(async () => {
  real = http.createServer((req, res) => { res.writeHead(200, { 'content-type': 'text/plain', 'access-control-allow-origin': '*' }); res.end('from the real server'); });
  await new Promise((resolve) => real.listen(0, '127.0.0.1', resolve));
  realURL = `http://127.0.0.1:${real.address().port}/real`;
  server.listen({ onUnhandledRequest: 'error' });
});
afterEach(() => { server.resetHandlers(); vi.restoreAllMocks(); });
afterAll(async () => { server.close(); await new Promise((resolve) => real.close(resolve)); });

test('axios takes XMLHttpRequest, and msw answers', async () => {
  const open = vi.spyOn(XMLHttpRequest.prototype, 'open');
  const response = await axios.get('http://localhost:3000/api/user');
  expect(response.data).toEqual({ name: 'Ada' });
  expect(response.headers['x-test']).toBe('1');
  expect(open).toHaveBeenCalledTimes(1);
});

test('axios: cross-origin, an HTTP error and a network error', async () => {
  const created = await axios.post('https://api.example.com/items', { a: 1 });
  expect([created.status, created.data]).toEqual([201, { got: { a: 1 }, type: 'application/json' }]);
  await expect(axios.get('https://api.example.com/no-cors')).rejects.toMatchObject({ code: 'ERR_NETWORK' });
  await expect(axios.get('http://localhost:3000/api/missing')).rejects.toMatchObject({ response: { status: 404 } });
  await expect(axios.get('http://localhost:3000/api/fail')).rejects.toMatchObject({ code: 'ERR_NETWORK' });
});

const request = (method, url, body) => new Promise((resolve) => {
  const xhr = new XMLHttpRequest();
  const events = [];
  for (const type of ['readystatechange', 'loadstart', 'load', 'error', 'loadend']) xhr.addEventListener(type, () => events.push(`${type}:${xhr.readyState}`));
  xhr.onloadend = () => resolve({ status: xhr.status, text: xhr.responseText, type: xhr.getResponseHeader('content-type'), events });
  xhr.open(method, url);
  xhr.send(body);
});

test('XMLHttpRequest: a mocked response, an error, and a request msw passes through', async () => {
  const user = await request('GET', 'http://localhost:3000/api/user');
  expect([user.status, JSON.parse(user.text), user.type]).toEqual([200, { name: 'Ada' }, 'application/json']);
  expect(user.events.at(-1)).toBe('loadend:4');
  expect(user.events).toContain('load:4');
  const failed = await request('GET', 'http://localhost:3000/api/fail');
  expect([failed.status, failed.events.includes('error:4')]).toEqual([0, true]);
  const passed = await request('GET', realURL);
  expect([passed.status, passed.text]).toEqual([200, 'from the real server']);
});
