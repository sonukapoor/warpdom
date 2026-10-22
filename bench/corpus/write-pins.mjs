#!/usr/bin/env node
// Writes the pins file of a corpus: the commit of each project's local
// checkout, so runs elsewhere (CI, other people) use exactly the code the
// published numbers were measured on. corpus.json is pinned in pins.json,
// any other <name>.json in <name>-pins.json. Projects without a checkout
// keep their existing pin.
//
//   node bench/corpus/write-pins.mjs [--corpus <file>] [--repos-dir <dir>]
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { DEFAULT_CORPUS, defaultReposDir, expandHome, readCorpus, pinsFileFor, projectDir } from './lib.mjs';

const opt = (name) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : null;
};
const reposDir = opt('--repos-dir') ? path.resolve(expandHome(opt('--repos-dir'))) : defaultReposDir();
const corpus = readCorpus(opt('--corpus') ?? DEFAULT_CORPUS);
const pinsFile = pinsFileFor(corpus.file);
let previous = {};
try {
  previous = JSON.parse(fs.readFileSync(pinsFile, 'utf8'));
} catch {
  /* none yet */
}
const git = (dir, ...args) => spawnSync('git', ['-C', dir, ...args], { encoding: 'utf8' }).stdout.trim();
const pins = {};
let written = 0;
for (const p of corpus.projects) {
  const dir = projectDir(p, corpus.file, reposDir);
  if (fs.existsSync(path.join(dir, '.git'))) {
    pins[p.name] = { repo: p.repo, commit: git(dir, 'rev-parse', 'HEAD'), date: git(dir, 'log', '-1', '--format=%cI') };
    written++;
  } else if (previous[p.name]) pins[p.name] = previous[p.name];
}
fs.writeFileSync(pinsFile, `${JSON.stringify(pins, null, 2)}\n`);
console.log(
  `${written} projects pinned from checkouts, ${Object.keys(pins).length - written} kept, in ${path.relative(process.cwd(), pinsFile)}`,
);
