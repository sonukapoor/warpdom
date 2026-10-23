// The environment a comparison ran in (Node only): machine, Node, runner,
// DOM and warpdom versions, so timings can be compared and reproduced.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

function git(dir) {
  const run = (...args) => {
    const res = spawnSync('git', args, { cwd: dir, encoding: 'utf8' });
    return res.status === 0 ? res.stdout.trim() : null;
  };
  const commit = run('rev-parse', 'HEAD');
  if (!commit) return null;
  return { commit, dirty: run('status', '--porcelain', '--untracked-files=no') !== '' };
}

export function environmentRecord({ cwd, runner, runnerVersion, dom, warpdomDir }) {
  const cpus = os.cpus();
  let warpdomVersion = null;
  try {
    warpdomVersion = JSON.parse(fs.readFileSync(path.join(warpdomDir, 'package.json'), 'utf8')).version;
  } catch {
    /* unknown */
  }
  return {
    recordedAt: new Date().toISOString(),
    node: process.version,
    os: { platform: os.platform(), release: os.release(), version: os.version?.() ?? null, arch: os.arch() },
    cpu: {
      model: cpus[0]?.model ?? null,
      cores: cpus.length,
      availableParallelism: os.availableParallelism?.() ?? null,
    },
    memory: { totalGiB: +(os.totalmem() / 2 ** 30).toFixed(1) },
    loadAverage: os.loadavg(),
    runner: { name: runner, version: runnerVersion },
    baseline: dom,
    warpdom: { version: warpdomVersion, dir: warpdomDir, git: git(warpdomDir) },
    project: { dir: cwd, git: git(cwd) },
  };
}
