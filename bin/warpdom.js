#!/usr/bin/env node
// warpdom vitest [run] [--learn] [vitest arguments]: Vitest in fast mode
// with a safety net and learning (src/vitest-fast-cli.js).
import { main } from '../src/vitest-fast-cli.js';

const [command, ...rest] = process.argv.slice(2);
if (command !== 'vitest') {
  process.stderr.write('usage: warpdom vitest [run] [--learn] [vitest arguments]\n');
  process.exit(2);
}
process.exit(main(rest));
