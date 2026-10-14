// Statuses of melt-ui's "Toggles checked to true for default unchecked checkbox items"
// tests (Context Menu, Dropdown Menu (Default) and (forceVisible)) in every configuration
// and round of the 208ad49 CI jobs, from their per-test archives.
// Usage: extract each job's pertest.tar.xz into <dir>/<job>/ (tar -xJf ... -C <dir>/<job>),
// for the jobs threeway-heldout, baselines-heldout, ablation-a2a3 (heldout-38427115775)
// and ablation-a4 (heldout-38427158136); then: node ci-extract.cjs <dir> > ci-208ad49.tsv
// Round 0 is the job's warm-up round.
const fs = require('fs'), path = require('path');
const root = process.argv[2];
const rows = [];
for (const job of fs.readdirSync(root)) {
  const pt = path.join(root, job, 'pertest'); if (!fs.existsSync(pt)) continue;
  for (const r of fs.readdirSync(pt)) {
    const d = path.join(pt, r, 'melt-ui'); if (!fs.existsSync(d)) continue;
    for (const f of fs.readdirSync(d)) {
      if (!f.endsWith('.json')) continue;
      const t = JSON.parse(fs.readFileSync(path.join(d, f))).tests || {};
      for (const [k, v] of Object.entries(t)) if (/Toggles checked to true for default unchecked/.test(k)) rows.push([job, r, f.replace('.json', ''), k.replace(/^root::src\/tests\//, ''), v.s].join('\t'));
    }
  }
}
console.log('job\tround\tconfig\ttest\tstatus');
console.log(rows.sort().join('\n'));
