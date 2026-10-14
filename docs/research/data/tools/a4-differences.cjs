// a4-differences.cjs <pertest dir>: per round and project, tests whose status differs between
// warpdom-latest (WARPDOM_ABLATE=latest-profile) and warpdom-default (own profile), and between each and jsdom.
const fs = require('fs'), path = require('path');
const d = process.argv[2];
const diff = (a, b) => [...new Set([...Object.keys(a.tests), ...Object.keys(b.tests)])].filter((k) => a.tests[k]?.s !== b.tests[k]?.s);
for (const r of fs.readdirSync(d).filter((x) => x !== '0').sort()) for (const p of fs.readdirSync(path.join(d, r)).sort()) {
  const rd = (c) => { try { return JSON.parse(fs.readFileSync(path.join(d, r, p, c + '.json'))); } catch { return null; } };
  const J = rd('jsdom-default'), W = rd('warpdom-default'), L = rd('warpdomlatest-default');
  if (!J || !W || !L) continue;
  console.log([`round ${r}`, p, `latest vs own ${diff(L, W).length}`, `latest vs jsdom ${diff(L, J).length}`, `own vs jsdom ${diff(W, J).length}`].join('\t'));
}
