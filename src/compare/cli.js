// `warpdom compare [options] [-- runner arguments]` (Node only).
import { compare, summary } from './index.js';

export const HELP = `warpdom compare: run your tests on jsdom (or happy-dom) and on warpdom,
and report every test whose status differs and how much faster warpdom is.

Usage:
  npx warpdom compare [options] [-- runner arguments]

Run it where you run vitest or jest: a package, or a monorepo root with
Vitest projects (or a workspace file) or Jest projects. Only projects on
jsdom or happy-dom switch; the others run unchanged and are not compared.
Nothing in the project is edited.

Options:
  --rounds <n>        Timed rounds, each runs the baseline and warpdom,
                      alternating (default 1, labeled indicative; use 3 or
                      more for numbers worth quoting). With 2 or more, an
                      untimed warm-up pair runs first.
  --correctness       One run each, results only, no speed claims (for CI)
  --workers <n>       The runner's worker limit for every run (default: the runner's)
  --baseline <env>    jsdom or happy-dom (default: what the project uses)
  --runner <name>     vitest or jest, when both are configured
  --out <dir>         Report, JSON results and logs (default: .warpdom-compare)
  --timeout <min>     Per run (default 30)
  -h, --help          Show this help
  -- <args>           Passed to every run (a file filter, --project x,
                      --config <file> for a config the runner would not find)

Exit code: 0 when no test changes from pass to fail, 1 when some do, 2 when
the comparison could not run.
`;

export function parseArgs(argv) {
  const opts = { args: [] };
  const value = (i, name) => {
    if (i >= argv.length || argv[i].startsWith('--')) throw new Error(`${name} needs a value`);
    return argv[i];
  };
  const number = (v, name) => {
    const n = Number(v);
    if (!Number.isInteger(n) || n < 1) throw new Error(`${name} must be a positive whole number`);
    return n;
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--') { opts.args = argv.slice(i + 1); break; }
    if (a === '-h' || a === '--help') opts.help = true;
    else if (a === '--correctness') opts.correctness = true;
    else if (a === '--rounds') opts.rounds = number(value(++i, a), a);
    else if (a === '--workers') opts.workers = number(value(++i, a), a);
    else if (a === '--timeout') opts.timeout = number(value(++i, a), a);
    else if (a === '--baseline') {
      opts.baseline = value(++i, a);
      if (!['jsdom', 'happy-dom'].includes(opts.baseline)) throw new Error('--baseline must be jsdom or happy-dom');
    } else if (a === '--runner') {
      opts.runner = value(++i, a);
      if (!['vitest', 'jest'].includes(opts.runner)) throw new Error('--runner must be vitest or jest');
    } else if (a === '--out') opts.out = value(++i, a);
    else if (a === '--explore') throw new Error('--explore is not implemented yet');
    else throw new Error(`unknown option ${a} (runner arguments go after --)`);
  }
  if (opts.correctness && opts.rounds) throw new Error('--correctness runs once; leave out --rounds');
  return opts;
}

export async function main(argv, { stdout = process.stdout, stderr = process.stderr, cwd = process.cwd() } = {}) {
  let opts;
  try {
    opts = parseArgs(argv);
  } catch (err) {
    stderr.write(`warpdom compare: ${err.message}\n\n${HELP}`);
    return 2;
  }
  if (opts.help) {
    stdout.write(HELP);
    return 0;
  }
  const result = await compare({ ...opts, cwd, log: (line) => stderr.write(`${line}\n`) });
  stdout.write(`\n${summary(result, cwd)}`);
  return result.exitCode;
}
