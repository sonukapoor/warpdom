// warpdom/compare and warpdom/migrate, programmatically.
import { compare, summary, renderMarkdown, type CompareResult } from 'warpdom/compare';
import { migrate, renderConsole, REMOVABLE, ENVIRONMENT_PACKAGE } from 'warpdom/migrate';

const result: CompareResult = await compare({
  cwd: '.',
  rounds: 3,
  workers: 2,
  baseline: 'jsdom',
  log: (message) => message,
});
const code: 0 | 1 | 2 = result.exitCode;
const regressions: number | undefined = result.correctness?.regressions;
const speedup: number | null | undefined = result.timing?.speedup;
const text: string = summary(result) + renderMarkdown(result);
// @ts-expect-error: baseline is jsdom or happy-dom
await compare({ baseline: 'linkedom' });

const plan = await migrate({ cwd: '.', apply: false, offline: true });
const changed: string[] = plan.changedFiles;
const lines: string = renderConsole(plan);
const removable: string[] = REMOVABLE;
const jestPackage: 'jest-environment-warpdom' = ENVIRONMENT_PACKAGE.jest;
void [code, regressions, speedup, text, changed, lines, removable, jestPackage];
