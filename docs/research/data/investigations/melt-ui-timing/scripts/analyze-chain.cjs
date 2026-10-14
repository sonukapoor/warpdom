// For the chain experiment (timing-setup.mjs version 2, MELT_LOG_ALL=1): one TSV row
// per execution of a target test, following Svelte's transition loop from the preceding
// test. Times in ms from the target test's start.
//   inherited_tick_set   set time (negative: in the preceding test) of the loop tick still
//                        pending when the target test started (- = none)
//   inherited_tick_fire  when it fired
//   menu_open            first logged event with the menu in the document
//   intro                'joined': the menu's intro joined the inherited loop (its tick
//                        fired after the menu opened), so the intro ended early and the
//                        outro later got its own tick; 'fresh': the intro set its own tick
//   fresh_tick_set, tick_to_enter  the fresh tick and the time from it to the toggle Enter
//   outcome              the test's status in Vitest's JSON report
// Usage: node analyze-chain.cjs <runs/chain dir>
const fs = require('fs');
const path = require('path');

function outcomes(runDir) {
  const out = {};
  const dir = path.join(runDir, 'tmp', 'melt-ui');
  for (const f of fs.readdirSync(dir).filter((f) => f.endsWith('.json'))) {
    const d = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    for (const r of d.testResults) for (const a of r.assertionResults) out[a.ancestorTitles.filter(Boolean).concat(a.title).join(' > ')] = a.status;
  }
  return out;
}
const isLoop = (e) => /loop \(loop\.js|run_tasks/.test(e.from || '');
const f = (x) => (x == null ? '-' : x.toFixed(2));

console.log(['dom', 'run', 'test', 'inherited_tick_set', 'inherited_tick_fire', 'menu_open', 'intro', 'fresh_tick_set',
  'toggle_enter', 'tick_to_enter', 'outcome'].join('\t'));
const root = process.argv[2];
for (const cond of fs.readdirSync(root)) {
  for (const run of fs.readdirSync(path.join(root, cond)).sort()) {
    const dir = path.join(root, cond, run);
    const file = path.join(dir, 'timing.jsonl');
    if (!fs.existsSync(file)) continue;
    const status = outcomes(dir);
    for (const line of fs.readFileSync(file, 'utf8').split('\n').filter(Boolean)) {
      const r = JSON.parse(line);
      if (!/Toggles checked to true/.test(r.test) || /\(Default\)/.test(r.test)) continue;
      const ev = r.events;
      const name = r.test.split(' > ').slice(1).join(' > ');
      const inh = ev.filter((e) => e.ev === 'timer16-pending' && isLoop(e)).pop();
      const inhFire = inh && ev.find((e) => e.ev === 'timer16-fire' && e.id === inh.id);
      const open = ev.find((e) => e.menu);
      const downs = ev.filter((e) => e.ev === 'keydown');
      const lastArrow = downs.filter((e) => e.key === 'ArrowDown').pop();
      const enter = downs.find((e) => e.key === 'Enter' && lastArrow && e.t > lastArrow.t);
      const fresh = ev.find((e) => e.ev === 'timer16-set' && isLoop(e) && open && e.t >= open.t - 0.001 && enter && e.t < enter.t);
      console.log([run.split('-')[0], run.split('-').pop(), name.replace(/ > Toggles checked.*/, ''),
        f(inh?.setAt), f(inhFire?.t), f(open?.t), fresh ? 'fresh' : 'joined', f(fresh?.t), f(enter?.t),
        f(fresh && enter ? enter.t - fresh.t : null), status[name] || '-'].join('\t'));
    }
  }
}
