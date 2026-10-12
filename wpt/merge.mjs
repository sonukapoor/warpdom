#!/usr/bin/env node
// Merges results files of the same engine from several runs (e.g. one per
// WPT area, run in parallel CI jobs) into one, for summary.mjs.
//
//   node wpt/merge.mjs <out.json> <results.json>...
//
// Results, skipped and notRunnable are combined (a test id must not appear
// in two inputs); meta comes from the first input, with the paths of all
// inputs and their wall clocks summed. Inputs must share engine, engine
// version, warpdom commit and WPT commit.
import { readFileSync, writeFileSync } from 'node:fs';

const [out, ...inputs] = process.argv.slice(2);
if (!out || inputs.length === 0) {
  console.error('usage: node wpt/merge.mjs <out.json> <results.json>...');
  process.exit(2);
}
const runs = inputs.map((f) => ({ file: f, run: JSON.parse(readFileSync(f, 'utf8')) }));
const first = runs[0].run;
const merged = {
  meta: { ...first.meta, paths: [], wallClockMs: 0, mergedFrom: inputs.length },
  results: {},
  skipped: {},
  notRunnable: {},
};
for (const { file, run } of runs) {
  for (const key of ['engine', 'engineVersion', 'warpdomCommit', 'wptCommit']) {
    if (run.meta[key] !== first.meta[key]) {
      console.error(`${file}: ${key} ${run.meta[key]} differs from ${first.meta[key]}`);
      process.exit(1);
    }
  }
  merged.meta.paths.push(...[].concat(run.meta.paths ?? []));
  merged.meta.wallClockMs += run.meta.wallClockMs ?? 0;
  for (const part of ['results', 'skipped', 'notRunnable']) {
    for (const [id, value] of Object.entries(run[part] ?? {})) {
      if (id in merged[part]) {
        console.error(`${file}: ${id} appears in more than one input`);
        process.exit(1);
      }
      merged[part][id] = value;
    }
  }
}
writeFileSync(out, JSON.stringify(merged));
console.log(`${out}: ${Object.keys(merged.results).length} tests from ${inputs.length} runs`);
