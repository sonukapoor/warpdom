// Reads the timing.jsonl files written by timing-setup.mjs and prints one TSV row per
// execution of a "Toggles checked to true..." test (Context Menu and Dropdown Menu
// (forceVisible); the (Default) variant has no transition stub and is skipped).
//
// Times are ms from the start of the test (beforeEach):
//   menu_open       the first logged event at which the menu is in the document (the end of
//                   the contextmenu dispatch, or of the Enter on the trigger)
//   tick_set        the last tick of Svelte's transition loop (a 16 ms timer set from loop()
//                   or run_tasks()) set before the toggle Enter: the intro's tick
//   toggle_enter    the Enter that checks the item; it closes the menu, so the outro starts
//   assert          the test's check of check2: the last user-event setTimeout(0) after the
//                   final Enter (the test continues in it); the end of the test if none
//   pending_at_enter  Svelte's transition loop still had a tick (16 ms timer) pending at the
//                   toggle Enter, so the outro joined it and set no tick of its own (no
//                   loop timer is set after the Enter); the intro's tick when the steps
//                   since opening took less than about 16 ms
//   menu_removed    when a 16 ms timer removed the menu (- = not before the test ended)
//   removed_before_assert  that happened before the check
//   outcome         the test's status in Vitest's JSON report
// Usage: node analyze-timing.cjs <runs dir>
const fs = require('fs');
const path = require('path');

function* walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else if (e.name === 'timing.jsonl') yield p;
  }
}

function outcomes(runDir) {
  const out = {};
  const dir = path.join(runDir, 'tmp', 'melt-ui');
  if (!fs.existsSync(dir)) return out;
  for (const f of fs.readdirSync(dir).filter((f) => f.endsWith('.json'))) {
    const d = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    for (const r of d.testResults) for (const a of r.assertionResults) out[a.ancestorTitles.filter(Boolean).concat(a.title).join(' > ')] = a.status;
  }
  return out;
}

const cols = ['experiment', 'condition', 'run', 'test', 'delay_ms', 'raf_ms', 'menu_open', 'tick_set', 'toggle_enter', 'open_to_enter', 'tick_to_enter',
  'assert', 'pending_at_enter', 'menu_removed', 'removed_before_assert', 'outcome'];
console.log(cols.join('\t'));
const root = process.argv[2];
const f = (x) => (x == null ? '-' : x.toFixed(2));
for (const file of [...walk(root)].sort()) {
  const runDir = path.dirname(file);
  const rel = path.relative(root, runDir).split(path.sep);
  const status = outcomes(runDir);
  for (const line of fs.readFileSync(file, 'utf8').split('\n').filter(Boolean)) {
    const r = JSON.parse(line);
    if (/\(Default\)/.test(r.test) || !/Toggles checked to true/.test(r.test)) continue;
    const ev = r.events;
    const name = r.test.split(' > ').slice(1).join(' > ');
    const downs = ev.filter((e) => e.ev === 'keydown');
    const lastArrow = downs.filter((e) => e.key === 'ArrowDown').pop();
    const enter = downs.find((e) => e.key === 'Enter' && lastArrow && e.t > lastArrow.t);
    const end = ev.find((e) => e.ev === 'end');
    const lastUp = ev.filter((e) => e.ev === 'keyup-done' && e.key === 'Enter').pop();
    const zeros = ev.filter((e) => e.ev === 'timer0-fire' && lastUp && e.t > lastUp.t);
    const assertT = zeros.length ? zeros[zeros.length - 1].t : end.t;
    const opened = ev.find((e) => e.menu);
    const ticks = ev.filter((e) => e.ev === 'timer16-set' && enter && e.t < enter.t && /loop \(loop\.js|run_tasks/.test(e.from || ''));
    const tick = ticks[ticks.length - 1];
    const pending = !!(enter && !ev.some((e) => e.ev === 'timer16-set' && e.t > enter.t && /loop \(loop\.js/.test(e.from || '')));
    const rm = enter && ev.find((e) => e.ev === 'timer16-done' && e.t > enter.t && e.menu === false);
    const removed = !!(rm && rm.t <= assertT);
    console.log([rel[0], rel[1], rel.slice(2).join('/'), name.replace(/ > Toggles checked.*/, ''), r.delay, r.raf ?? 16,
      f(opened?.t), f(tick?.t), f(enter?.t), f(opened && enter ? enter.t - opened.t : null), f(tick && enter ? enter.t - tick.t : null), f(assertT),
      pending, f(rm?.t), removed, status[name] || '-'].join('\t'));
  }
}
