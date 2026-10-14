// correctness-inventory.cjs <label>=<pertest dir>... [--config <c>]: every test whose status differs
// between <c> (default warpdom-default) and the same round's jsdom-default, over the timed rounds of
// every listed job. One line per suite and test: rounds in which it differs / rounds compared (per job),
// the status pairs seen (jsdom>config), and whether it is in that job's flaky set (its status changes
// between the job's jsdom-default runs, the warm-up included; statuses.cjs's rule) in each job.
// Files (fileKey entries) are not listed; tests only, as statuses.cjs counts them.
const fs = require('fs'), path = require('path');
const args = process.argv.slice(2);
const ci = args.indexOf('--config');
const config = ci >= 0 ? args.splice(ci, 2)[1] : 'warpdom-default';
const rd = (f) => { try { const m = JSON.parse(fs.readFileSync(f, 'utf8')); m.tests ??= {}; return m; } catch { return null; } };
const out = new Map(); // suite -> key -> { jobs: label -> {diff, n, pairs:Set, flaky} }
const compared = new Map(); // suite -> label -> rounds compared
const flakySets = new Map(); // suite -> label -> Set
for (const a of args) {
  const [label, dir] = a.split('=');
  const rounds = fs.readdirSync(dir).filter((r) => /^\d+$/.test(r));
  const suites = new Set(rounds.flatMap((r) => fs.readdirSync(path.join(dir, r))));
  for (const s of suites) {
    const J = rounds.map((r) => ({ r, m: rd(path.join(dir, r, s, 'jsdom-default.json')) })).filter((x) => x.m);
    const flaky = new Set();
    for (const k of new Set(J.flatMap((x) => Object.keys(x.m.tests)))) if (new Set(J.map((x) => x.m.tests[k]?.s)).size > 1) flaky.add(k);
    (flakySets.get(s) ?? flakySets.set(s, {}).get(s))[label] = flaky;
    let n = 0;
    for (const r of rounds.filter((r) => r !== '0')) {
      const base = rd(path.join(dir, r, s, 'jsdom-default.json')), run = rd(path.join(dir, r, s, `${config}.json`));
      if (!base || !run) continue;
      n++;
      for (const k of new Set([...Object.keys(base.tests), ...Object.keys(run.tests)])) {
        const b = base.tests[k]?.s ?? 'missing', w = run.tests[k]?.s ?? 'missing';
        if (b === w) continue;
        const e = ((out.has(s) ? out : out.set(s, new Map())).get(s).get(k) ?? out.get(s).set(k, {}).get(k));
        const j = (e[label] ??= { diff: 0, pairs: new Set(), flaky: flaky.has(k) });
        j.diff++; j.pairs.add(`${b}>${w}`);
      }
    }
    (compared.get(s) ?? compared.set(s, {}).get(s))[label] = n;
  }
}
console.log(['suite', 'test', 'differs in (job: rounds/compared, statuses, flaky in job)', 'flaky in any job'].join('\t'));
for (const [s, keys] of [...out].sort()) {
  for (const [k, e] of [...keys].sort()) {
    const jobs = Object.entries(e).map(([l, j]) => `${l}: ${j.diff}/${compared.get(s)[l]} ${[...j.pairs].join(',')}${j.flaky ? ' flaky' : ''}`);
    const notSeen = Object.entries(compared.get(s)).filter(([l]) => !e[l]).map(([l, n]) => `${l}: 0/${n}${flakySets.get(s)[l]?.has(k) ? ' flaky' : ''}`);
    const anyFlaky = Object.values(flakySets.get(s)).some((f) => f.has(k));
    console.log([s, k, [...jobs, ...notSeen].join('; '), anyFlaky ? 'yes' : 'no'].join('\t'));
  }
}
