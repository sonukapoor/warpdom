// A local HTTP server for the XMLHttpRequest tests (test/xhr.test.js): jsdom
// makes real requests, so parity tests run the same requests on jsdom and
// warpdom against it. Routes take their parameters from the query string:
//   /echo      the request as JSON (method, body, headers without the ones
//              that name the client: user-agent, sec-fetch-*, host,
//              connection), sorted
//   /text      a text body with several headers, Set-Cookie included
//   /type      ?ct=<content type>&body=<body>&enc=<Buffer encoding>
//   /status    ?code=&text=&body=
//   /redirect  ?code=&to=
//   /slow      ?n=<chunks>&ms=<gap>&size=<chunk size>&len=<content-length>&wait=<ms before headers>
//   /hang      never answers
//   /setcookie sets a cookie
// and, on any route, acao, acac, aceh (Access-Control-Allow-Origin,
// -Allow-Credentials, -Expose-Headers) and preflight=ok|fail with acah and
// acam for OPTIONS requests (answered after pfwait ms).
import http from 'node:http';

const CLIENT_HEADERS = /^(user-agent|sec-fetch-.*|host|connection|keep-alive)$/;

export function startServer() {
  const requests = [];
  const sockets = new Set();
  const server = http.createServer(async (req, res) => {
    const chunks = [];
    try { for await (const c of req) chunks.push(c); } catch { return; }
    const body = Buffer.concat(chunks);
    const url = new URL(req.url, 'http://x');
    const q = Object.fromEntries(url.searchParams);
    requests.push({ method: req.method, path: req.url, headers: req.headers });
    const cors = {};
    if (q.acao !== undefined) cors['access-control-allow-origin'] = q.acao;
    if (q.acac) cors['access-control-allow-credentials'] = 'true';
    if (q.aceh) cors['access-control-expose-headers'] = q.aceh;
    if (req.method === 'OPTIONS' && q.preflight !== undefined) {
      const answer = () => {
        if (res.destroyed) return;
        res.writeHead(q.preflight === 'fail' ? 500 : 204, { ...cors, 'access-control-allow-headers': q.acah ?? '', 'access-control-allow-methods': q.acam ?? '' });
        res.end();
      };
      if (q.pfwait) setTimeout(answer, Number(q.pfwait)); else answer();
      return;
    }
    switch (url.pathname) {
      case '/echo': {
        const headers = Object.entries(req.headers).filter(([name]) => !CLIENT_HEADERS.test(name)).sort(([a], [b]) => (a < b ? -1 : 1));
        res.writeHead(200, { 'content-type': 'application/json', ...cors });
        res.end(JSON.stringify({ method: req.method, body: body.toString('latin1'), headers: Object.fromEntries(headers) }));
        return;
      }
      case '/text':
        res.writeHead(200, 'OK', [['Content-Type', 'text/plain; charset=utf-8'], ['X-B', '2'], ['X-A', '1'], ['X-Multi', 'a'], ['X-Multi', 'b'],
          ['Set-Cookie', 'sc=1; Path=/'], ['Set-Cookie2', 'x'], ...Object.entries(cors)]);
        res.end('hello é');
        return;
      case '/type':
        res.writeHead(Number(q.code ?? 200), { ...(q.ct === undefined ? {} : { 'content-type': q.ct }), ...cors });
        res.end(Buffer.from(q.body ?? '', q.enc ?? 'utf8'));
        return;
      case '/status':
        res.writeHead(Number(q.code), q.text, cors);
        res.end(q.body ?? '');
        return;
      case '/redirect':
        res.writeHead(Number(q.code ?? 302), { location: q.to ?? req.url, ...cors });
        res.end();
        return;
      case '/slow': {
        const send = () => {
          res.writeHead(200, { 'content-type': 'text/plain', ...(q.len ? { 'content-length': q.len } : {}), ...cors });
          const n = Number(q.n ?? 3);
          let i = 0;
          const tick = () => {
            if (res.destroyed) return;
            if (i++ >= n) { res.end(); return; }
            res.write('x'.repeat(Number(q.size ?? 10)));
            setTimeout(tick, Number(q.ms ?? 50));
          };
          tick();
        };
        if (q.wait) setTimeout(send, Number(q.wait)); else send();
        return;
      }
      case '/hang':
        return;
      case '/setcookie':
        res.writeHead(200, { 'set-cookie': 'fromxhr=1; Path=/', ...cors });
        res.end('ok');
        return;
      default:
        res.writeHead(404);
        res.end('not found');
    }
  });
  server.on('connection', (socket) => { sockets.add(socket); socket.on('close', () => sockets.delete(socket)); });
  return new Promise((resolve) => server.listen(0, () => resolve({
    port: server.address().port,
    requests,
    close: () => new Promise((done) => { for (const s of sockets) s.destroy(); server.close(done); }),
  })));
}

// A port nothing listens on (a server that was closed).
export async function closedPort() {
  const server = http.createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  await new Promise((resolve) => server.close(resolve));
  return port;
}
