// variance-across-runs.cjs <csv>...: per suite, the drop-in speedup (median of per-round jsdom/warpdom ratios)
// and the median jsdom time in each run, and their spread between runs (max/min - 1).
const fs = require('fs');
const files = process.argv.slice(2);
const med = (a) => { a = a.filter((x) => typeof x === "number" && !Number.isNaN(x)).sort((x, y) => x - y); const n = a.length; return n ? (n % 2 ? a[n >> 1] : (a[n / 2 - 1] + a[n / 2]) / 2) : NaN; };
const res = {};
files.forEach((f, i) => {
  const d = {};
  for (const [r, p, c, s] of fs.readFileSync(f, 'utf8').trim().split('\n').slice(1).map((l) => l.split(','))) ((d[p] ??= {})[r] ??= {})[c] = s === 'NA' ? NaN : +s;
  for (const [p, rs] of Object.entries(d)) {
    const v = Object.values(rs);
    (res[p] ??= [])[i] = { w: med(v.map((x) => x['jsdom-default'] / x['warpdom-default'])), h: med(v.map((x) => x['jsdom-default'] / x['happy-dom-default'])), j: med(v.map((x) => x['jsdom-default'])) };
  }
});
const spread = (a) => (a.length ? (Math.max(...a) / Math.min(...a) - 1) * 100 : NaN);
console.log(`| Suite | ${files.map((_, i) => `run ${i + 1} warpdom`).join(' | ')} | spread | ${files.map((_, i) => `run ${i + 1} jsdom`).join(' | ')} | jsdom spread |`);
console.log(`| --- | ${files.map(() => '---').join(' | ')} | --- | ${files.map(() => '---').join(' | ')} | --- |`);
const ws = [], js = [];
for (const [p, o] of Object.entries(res).sort()) {
  const w = files.map((_, i) => o[i]?.w).filter((x) => x !== undefined && !Number.isNaN(x));
  const j = files.map((_, i) => o[i]?.j).filter((x) => x !== undefined && !Number.isNaN(x));
  if (w.length === files.length) { ws.push(spread(w)); js.push(spread(j)); }
  console.log(`| ${p} | ${files.map((_, i) => (o[i] ? o[i].w.toFixed(2) + 'x' : '—')).join(' | ')} | ${spread(w).toFixed(1)}% | ${files.map((_, i) => (o[i] ? o[i].j.toFixed(1) + ' s' : '—')).join(' | ')} | ${spread(j).toFixed(1)}% |`);
}
console.log(`\nSuites in every run: ${ws.length}. Spread of the drop-in speedup between runs: median ${med(ws).toFixed(1)}%, max ${Math.max(...ws).toFixed(1)}%. Spread of the median jsdom time: median ${med(js).toFixed(1)}%, max ${Math.max(...js).toFixed(1)}%.`);
