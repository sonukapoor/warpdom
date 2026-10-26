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
//              &step=1: no timed gaps; each chunk after the first waits for
//              the test to call release(), and the response stays open
//              after the last one (the client sees exactly the chunks the
//              test let through, however busy the machine is)
//   /hang      never answers
//   /setcookie sets a cookie
// and, on any route, acao, acac, aceh (Access-Control-Allow-Origin,
// -Allow-Credentials, -Expose-Headers) and preflight=ok|fail with acah and
// acam for OPTIONS requests (answered after pfwait ms).
import http from 'node:http';

const CLIENT_HEADERS = /^(user-agent|sec-fetch-.*|host|connection|keep-alive)$/;

// Listens on the port (0: one the system picks) and the host (every address
// when undefined); resolves to { server } or to { error }.
function bind(port, host, handler) {
  const server = http.createServer(handler);
  return new Promise((resolve) => {
    server.once('error', (error) => resolve({ error }));
    server.listen(port, host, () => resolve({ server }));
  });
}

const close = (server) => new Promise((done) => server.close(done));

// Whether the system lets a listener on the loopback host sit beside a
// listener on every address with the same port (macOS: yes, Linux: no).
// Proven, not assumed: the bind beside our own wildcard listener succeeds,
// or fails and then succeeds once that listener is closed (a failure that
// stays means another program has host and the port: try another port).
const besideWildcard = new Map();
function loopbackBesideWildcard(host) {
  if (!besideWildcard.has(host)) besideWildcard.set(host, probeBesideWildcard(host));
  return besideWildcard.get(host);
}
async function probeBesideWildcard(host) {
  for (let attempt = 0; attempt < 20; attempt++) {
    const wildcard = await bind(0);
    if (wildcard.error) throw wildcard.error;
    const { port } = wildcard.server.address();
    const beside = await bind(port, host);
    await close(wildcard.server);
    if (beside.server) {
      await close(beside.server);
      return true;
    }
    if (beside.error.code !== 'EADDRINUSE') throw beside.error;
    const alone = await bind(port, host);
    if (alone.server) {
      await close(alone.server);
      return false;
    }
  }
  throw new Error(`cannot tell whether ${host} listeners sit beside wildcard ones`);
}

const LOOPBACK = ['127.0.0.1', '::1'];

// port: the port to try first (tests); later attempts take one the system
// picks. probe: whether loopback listeners sit beside wildcard ones (tests).
export async function startServer({ port: first = 0, probe = loopbackBesideWildcard } = {}) {
  const requests = [];
  const sockets = new Set();
  // Stepped /slow responses waiting for release() to send their next chunk.
  let held = [];
  const handle = async (req, res) => {
    const chunks = [];
    try {
      for await (const c of req) chunks.push(c);
    } catch {
      return;
    }
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
        res.writeHead(q.preflight === 'fail' ? 500 : 204, {
          ...cors,
          'access-control-allow-headers': q.acah ?? '',
          'access-control-allow-methods': q.acam ?? '',
        });
        res.end();
      };
      if (q.pfwait) setTimeout(answer, Number(q.pfwait));
      else answer();
      return;
    }
    switch (url.pathname) {
      case '/echo': {
        const headers = Object.entries(req.headers)
          .filter(([name]) => !CLIENT_HEADERS.test(name))
          .sort(([a], [b]) => (a < b ? -1 : 1));
        res.writeHead(200, { 'content-type': 'application/json', ...cors });
        res.end(
          JSON.stringify({ method: req.method, body: body.toString('latin1'), headers: Object.fromEntries(headers) }),
        );
        return;
      }
      case '/text':
        res.writeHead(200, 'OK', [
          ['Content-Type', 'text/plain; charset=utf-8'],
          ['X-B', '2'],
          ['X-A', '1'],
          ['X-Multi', 'a'],
          ['X-Multi', 'b'],
          ['Set-Cookie', 'sc=1; Path=/'],
          ['Set-Cookie2', 'x'],
          ...Object.entries(cors),
        ]);
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
            if (i++ >= n) {
              if (!q.step) res.end();
              return;
            }
            res.write('x'.repeat(Number(q.size ?? 10)));
            if (q.step) held.push(tick);
            else setTimeout(tick, Number(q.ms ?? 50));
          };
          tick();
        };
        if (q.wait) setTimeout(send, Number(q.wait));
        else send();
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
  };
  const listen = async (port, host) => {
    const result = await bind(port, host, handle);
    result.server?.on('connection', (socket) => {
      sockets.add(socket);
      socket.on('close', () => sockets.delete(socket));
    });
    return result;
  };
  // On all addresses, and on each loopback address by itself where the
  // system lets a server listen there besides (macOS): there another
  // program's server on 127.0.0.1 or ::1 and the same port would get the
  // requests for that address (Linux refuses it that port). Such a port is
  // given up for another one.
  const listenAll = async (port) => {
    const main = await listen(port);
    if (main.error) {
      if (main.error.code === 'EADDRINUSE' && port !== 0) return null;
      throw main.error;
    }
    const servers = [main.server];
    try {
      for (const host of LOOPBACK) {
        const own = await listen(main.server.address().port, host);
        if (own.server) servers.push(own.server);
        // Not EADDRINUSE: an address the system does not have (::1 without
        // IPv6). EADDRINUSE: our own wildcard listener where loopback ones
        // cannot sit beside it (it serves host), else another program.
        else if (own.error.code === 'EADDRINUSE' && (await probe(host))) {
          await Promise.all(servers.map(close));
          return null;
        }
      }
    } catch (error) {
      // The probe could not tell: no listener stays open to keep the
      // process alive.
      await Promise.all(servers.map(close));
      throw error;
    }
    return servers;
  };
  let servers = null;
  for (let attempt = 0; !servers; attempt++) {
    if (attempt === 20) throw new Error('no port free on every loopback address');
    servers = await listenAll(attempt === 0 ? first : 0);
  }
  const { port } = servers[0].address();
  return {
    port,
    requests,
    // Sends the next chunk of each stepped /slow response.
    release: () => {
      const ticks = held;
      held = [];
      for (const tick of ticks) tick();
    },
    close: () => {
      for (const s of sockets) s.destroy();
      return Promise.all(servers.map(close));
    },
  };
}

// The ports servers listening on port 0 get theirs from start here or
// higher (Linux 32768 to 60999, macOS and Windows 49152 to 65535).
export const EPHEMERAL_PORTS_FROM = 32768;

// Whether nothing listens on the port and host (a host the system does not
// have, such as ::1 without IPv6, counts as free).
async function free(port, host) {
  const { server, error } = await bind(port, host);
  if (server) await close(server);
  return error?.code !== 'EADDRINUSE';
}

// A port nothing listens on, for requests that must be refused: one below
// the ephemeral ports, free when chosen (on every address, and on each
// loopback address by itself, see startServer). Not a closed ephemeral port:
// a test server started later can get that one and answer the requests
// (#109: a refused request got that server's 404, and the parity scenario
// running on it saw the refused requests' preflights).
export async function closedPort() {
  for (let attempt = 0; attempt < 100; attempt++) {
    const port = 20000 + Math.floor(Math.random() * (EPHEMERAL_PORTS_FROM - 20000));
    if ((await free(port)) && (await free(port, '127.0.0.1')) && (await free(port, '::1'))) return port;
  }
  throw new Error('no free port below the ephemeral ports');
}
