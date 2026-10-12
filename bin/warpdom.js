#!/usr/bin/env node
// warpdom vitest [run] [--learn] [vitest arguments]: Vitest in fast mode
// with a safety net and learning (src/vitest-fast-cli.js).
// warpdom compare [options] [-- runner arguments]: the project's tests on
// jsdom and on warpdom, results and speed (src/compare/).
const USAGE = 'usage: warpdom vitest [run] [--learn] [vitest arguments]\n'
  + '       warpdom compare [options] [-- runner arguments]   (warpdom compare --help)\n';

const [command, ...rest] = process.argv.slice(2);
if (command === 'vitest') {
  const { main } = await import('../src/vitest-fast-cli.js');
  process.exit(main(rest));
} else if (command === 'compare') {
  const { main } = await import('../src/compare/cli.js');
  process.exit(await main(rest));
} else {
  process.stderr.write(USAGE);
  process.exit(2);
}
