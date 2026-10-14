// Prints one TSV row per "Toggles checked to true for default unchecked checkbox items"
// test in a Vitest JSON report: test, status, duration_ms, first failure line.
// Usage: node extract.cjs <report.json> <prefix columns...>
const fs = require('fs');
const [file, ...prefix] = process.argv.slice(2);
let d;
try { d = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { console.log([...prefix, '-', 'noreport', '-', '-'].join('\t')); process.exit(0); }
let n = 0;
for (const f of d.testResults) for (const a of f.assertionResults) {
  if (!/Toggles checked to true for default unchecked/.test(a.title)) continue;
  n++;
  const msg = (a.failureMessages[0] || '').split('\n')[0].replace(/\t/g, ' ').slice(0, 160);
  console.log([...prefix, a.ancestorTitles.filter(Boolean).join(' > '), a.status, a.duration ?? '-', msg || '-'].join('\t'));
}
if (!n) console.log([...prefix, '-', 'notfound', '-', '-'].join('\t'));
