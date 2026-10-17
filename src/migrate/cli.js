// `warpdom migrate [options]` (Node only).
import path from 'node:path';
import { migrate, renderConsole } from './index.js';

export const HELP = `warpdom migrate: move your tests from jsdom or happy-dom to warpdom.

Usage:
  npx warpdom migrate            dry run: print the plan, change nothing
  npx warpdom migrate --apply    make the changes

Run it at the root of your project (a monorepo: at its root). It finds every
place that picks jsdom or happy-dom: Vitest configs, projects and workspace
files, environmentMatchGlobs, Jest configs and package.json "jest", per-file
@vitest-environment / @jest-environment comments, and --environment / --env
flags in package.json scripts. It switches each to 'warpdom' with an exact
text edit, adds warpdom and vitest-environment-warpdom or
jest-environment-warpdom where jsdom was declared, and removes jsdom,
happy-dom, jest-environment-jsdom, @happy-dom/jest-environment, global-jsdom
and jsdom-global when nothing imports them any more. It does not install:
it prints the install command for your package manager.

Not changed, but listed: environments it cannot edit exactly (computed,
inherited from another package), and lines that mention jsdom (setup files,
polyfills, console filters). The plan is written to .warpdom-migrate/plan.md.

Run \`npx warpdom compare\` before --apply: it compares your tests on jsdom and
on warpdom and needs jsdom still installed.

Options:
  --apply        Make the changes (default: dry run)
  --json         Print the plan as JSON
  --keep-jsdom-version
                 warpdom behaves like the jsdom version it finds installed;
                 once jsdom is removed, like its default (the newest jsdom it
                 models for Vitest, jsdom 26 for Jest). With this option,
                 migrate writes the removed version next to the environment
                 (environmentOptions.warpdom.jsdom, testEnvironmentOptions.jsdom)
                 so the tests keep seeing that version's behavior
  --offline      Do not ask the npm registry for the latest versions and
                 their publication dates (release-age settings)
  -h, --help     Show this help

Exit code: 0 when the plan was made (or applied), 2 when it could not be.
`;

export function parseArgs(argv) {
  const opts = {};
  for (const a of argv) {
    if (a === '-h' || a === '--help') opts.help = true;
    else if (a === '--apply') opts.apply = true;
    else if (a === '--json') opts.json = true;
    else if (a === '--offline') opts.offline = true;
    else if (a === '--keep-jsdom-version') opts.keepJsdomVersion = true;
    else throw new Error(`unknown option ${a}`);
  }
  return opts;
}

export async function main(argv, { stdout = process.stdout, stderr = process.stderr, cwd = process.cwd(), fetch } = {}) {
  let opts;
  try {
    opts = parseArgs(argv);
  } catch (err) {
    stderr.write(`warpdom migrate: ${err.message}\n\n${HELP}`);
    return 2;
  }
  if (opts.help) {
    stdout.write(HELP);
    return 0;
  }
  const result = await migrate({ cwd, apply: opts.apply, keepJsdomVersion: opts.keepJsdomVersion, offline: opts.offline || process.env.WARPDOM_MIGRATE_OFFLINE === '1', fetch });
  if (opts.json) stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  else stdout.write(renderConsole({ ...result, planFileShown: path.relative(cwd, result.planFile) }));
  return result.error ? 2 : 0;
}
