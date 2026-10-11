#!/usr/bin/env node
// Summary tables from results files written by run.mjs.
//
//   node wpt/summary.mjs <dir-or-json>... [--depth N] [--diff]
//
// One file: its per-directory table. Several (e.g. warpdom.json and
// jsdom.json): a side-by-side table; --diff also lists subtests that pass
// in the first run and not in the second, and the reverse.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { markdownTable, compareTable, regressions } from './lib/summary.mjs';

const args = process.argv.slice(2);
let depth = 0;
let diff = false;
const files = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--depth') depth = Number(args[++i]);
  else if (args[i] === '--diff') diff = true;
  else if (statSync(args[i]).isDirectory()) {
    for (const f of readdirSync(args[i]).filter((f) => f.endsWith('.json')).sort((a, b) => (a.startsWith('warpdom') ? -1 : b.startsWith('warpdom') ? 1 : a < b ? -1 : 1))) files.push(join(args[i], f));
  } else files.push(args[i]);
}
const runs = files.map((f) => JSON.parse(readFileSync(f, 'utf8')));
for (const run of runs) console.log(`## ${run.meta.engine}\n\n${markdownTable(run, { depth })}\n`);
if (runs.length > 1) console.log(`## Side by side\n\n${compareTable(runs, { depth })}\n`);
if (diff && runs.length > 1) {
  const [a, b] = runs;
  for (const [x, y] of [[a, b], [b, a]]) {
    const list = regressions(x, y);
    console.log(`## Pass in ${x.meta.engine}, not in ${y.meta.engine} (${list.length})\n`);
    for (const r of list) console.log(`- ${r.id}: ${r.name} (${y.meta.engine}: ${r.other})`);
    console.log('');
  }
}
