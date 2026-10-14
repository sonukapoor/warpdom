// g2-candidates.cjs <pertest dir>: tests that warpdom-learned reported passed while warpdom-default
// (warpdom isolated) of the same round did not pass, with jsdom-default's status in that round.
// These are the candidates for violations of assumption G2 (the accompanying paper, in preparation).
const fs = require('fs'), path = require('path');
const dir = process.argv[2];
const rd = (f) => { try { return JSON.parse(fs.readFileSync(f)); } catch { return null; } };
for (const r of fs.readdirSync(dir).filter((x) => x !== '0').sort()) for (const p of fs.readdirSync(path.join(dir, r)).sort()) {
  const L = rd(path.join(dir, r, p, 'warpdom-learned.json')), W = rd(path.join(dir, r, p, 'warpdom-default.json')), J = rd(path.join(dir, r, p, 'jsdom-default.json'));
  if (!L || !W) continue;
  for (const k of Object.keys(L.tests)) {
    if (L.tests[k].s !== 'passed') continue;
    const w = W.tests[k]?.s;
    if (w === 'passed') continue;
    console.log([`round ${r}`, p, `isolated: ${w ?? 'missing'}`, `jsdom: ${J?.tests[k]?.s ?? 'missing'}`, k].join('\t'));
  }
}
