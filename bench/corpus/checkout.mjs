#!/usr/bin/env node
// Prepares corpus projects for timing: clones each at its pinned commit
// (pins.json for corpus.json, <name>-pins.json for another <name>.json),
// installs its dependencies and runs its build, as the corpus file says.
//
//   node bench/corpus/checkout.mjs [--corpus <file>] [--repos-dir <dir>]
//     [--install] [--no-install] [--no-build] <project...>
//
// A project goes to its own "path" when that exists, else <repos-dir>/<name>
// (default $CORPUS_REPOS_DIR or ~/corpus-repos). An existing checkout is
// left at its commit (a warning when that is not the pin). Install: the
// project's "install" command (false: none), else the one its lockfile
// implies; only when node_modules is missing, or always with --install.
// Build: the project's "build" command, unless --no-build.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { DEFAULT_CORPUS, defaultReposDir, expandHome, readCorpus, readPins, pinsFileFor, projectDir } from './lib.mjs';

// The install command a checkout's lockfile implies.
export function installCommand(dir) {
  const has = (f) => fs.existsSync(path.join(dir, f));
  if (has('pnpm-lock.yaml')) return 'pnpm install --frozen-lockfile';
  if (has('bun.lock') || has('bun.lockb')) return 'bun install --frozen-lockfile';
  if (has('yarn.lock')) return has('.yarnrc.yml') ? 'yarn install --immutable' : 'yarn install --frozen-lockfile';
  if (has('package-lock.json') || has('npm-shrinkwrap.json')) return 'npm ci';
  return 'npm install';
}

function sh(command, cwd) {
  console.log(`  $ ${command}`);
  const res = spawnSync(command, { cwd, shell: true, stdio: 'inherit', env: { ...process.env, CI: '1' } });
  return res.status;
}

function git(cwd, ...args) {
  const res = spawnSync('git', args, { cwd, stdio: ['ignore', 'inherit', 'inherit'] });
  if (res.status !== 0) throw new Error(`git ${args.join(' ')} failed in ${cwd}`);
}

export function main(argv) {
  const opts = { corpus: DEFAULT_CORPUS, reposDir: null, install: 'auto', build: true, projects: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--corpus') opts.corpus = argv[++i];
    else if (a === '--repos-dir') opts.reposDir = argv[++i];
    else if (a === '--install') opts.install = 'always';
    else if (a === '--no-install') opts.install = 'never';
    else if (a === '--no-build') opts.build = false;
    else if (a.startsWith('-')) { console.error(`unknown option ${a}`); return 2; } else opts.projects.push(...a.split(',').filter(Boolean));
  }
  const reposDir = opts.reposDir ? path.resolve(expandHome(opts.reposDir)) : defaultReposDir();
  const corpus = readCorpus(opts.corpus);
  const pins = readPins(corpus.file);
  if (!opts.projects.length) { console.error('usage: node bench/corpus/checkout.mjs [options] <project...>'); return 2; }
  let failed = 0;
  for (const name of opts.projects) {
    const project = corpus.projects.find((p) => p.name === name);
    const pin = pins[name];
    if (!project || !pin) { console.error(`${name}: not in ${corpus.file} or ${pinsFileFor(corpus.file)}`); failed++; continue; }
    const dir = projectDir(project, corpus.file, reposDir);
    if (fs.existsSync(dir)) {
      const head = spawnSync('git', ['-C', dir, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).stdout?.trim();
      console.log(`${name}: ${dir} exists, left at ${head ? head.slice(0, 10) : 'an unknown commit'}${head && head !== pin.commit ? ` (the pin is ${pin.commit.slice(0, 10)})` : ''}`);
    } else {
      fs.mkdirSync(dir, { recursive: true });
      // A shallow fetch of exactly the pinned commit.
      git(dir, 'init', '-q');
      git(dir, 'remote', 'add', 'origin', pin.repo);
      git(dir, 'fetch', '-q', '--depth', '1', 'origin', pin.commit);
      git(dir, 'checkout', '-q', 'FETCH_HEAD');
      console.log(`${name}: ${pin.commit.slice(0, 10)} in ${dir}`);
    }
    if (project.install !== false && (opts.install === 'always' || (opts.install === 'auto' && !fs.existsSync(path.join(dir, 'node_modules'))))) {
      // Without a package.json here, npm would walk up and install into a parent.
      if (!fs.existsSync(path.join(dir, 'package.json'))) { console.error(`${name}: no package.json in ${dir}`); failed++; continue; }
      if (sh(project.install || installCommand(dir), dir) !== 0) { console.error(`${name}: install failed`); failed++; continue; }
    }
    if (project.build && opts.build && sh(project.build, dir) !== 0) { console.error(`${name}: build failed`); failed++; }
  }
  return failed ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  process.exitCode = main(process.argv.slice(2));
}
