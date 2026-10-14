// Time of the steps between opening the menu and the toggling Enter, from the timing
// logs of the unmanipulated instrumented runs (delay d0, delay-fine d0, chain), per DOM:
// Context Menu: end of the contextmenu dispatch -> keydown of the toggling Enter;
// Dropdown Menu (forceVisible): end of the Enter that opens the menu -> toggling Enter.
// Prints median, quartiles and the share below 16 ms.
const fs = require('fs');
const path = require('path');
const root = process.argv[2];
const sets = [['delay', 'd0'], ['delay-fine', 'd0'], ['chain', 'none']];
const out = {};
for (const [exp, cond] of sets) {
  const dir = path.join(root, exp, cond);
  if (!fs.existsSync(dir)) continue;
  for (const run of fs.readdirSync(dir)) {
    const file = path.join(dir, run, 'timing.jsonl');
    if (!fs.existsSync(file)) continue;
    const dom = run.split('-')[0];
    for (const line of fs.readFileSync(file, 'utf8').split('\n').filter(Boolean)) {
      const r = JSON.parse(line);
      if (!/Toggles checked to true/.test(r.test) || /\(Default\)/.test(r.test)) continue;
      const ev = r.events;
      const cm = /Context Menu/.test(r.test);
      const open = cm ? ev.find((e) => e.ev === 'contextmenu-done') : ev.find((e) => e.ev === 'keyup-done' && e.key === 'Enter');
      const downs = ev.filter((e) => e.ev === 'keydown');
      const lastArrow = downs.filter((e) => e.key === 'ArrowDown').pop();
      const enter = downs.find((e) => e.key === 'Enter' && lastArrow && e.t > lastArrow.t);
      if (!open || !enter) continue;
      const k = `${cm ? 'Context Menu' : 'Dropdown Menu (forceVisible)'}\t${dom}`;
      (out[k] ||= []).push(enter.t - open.t);
    }
  }
}
const q = (a, p) => a[Math.min(a.length - 1, Math.floor(p * a.length))];
console.log('test\tdom\tn\tmedian_ms\tq25\tq75\tshare_below_16ms');
for (const [k, v] of Object.entries(out).sort()) {
  v.sort((a, b) => a - b);
  console.log([k, v.length, q(v, 0.5).toFixed(1), q(v, 0.25).toFixed(1), q(v, 0.75).toFixed(1), (v.filter((x) => x < 16).length / v.length).toFixed(2)].join('\t'));
}
