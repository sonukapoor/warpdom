// The report of a Vitest run that `warpdom vitest run` starts
// (./vitest-fast-cli.js), as a Vitest reporter (Vitest 3.2 or later): per
// test file, its project, its state and every test's state, plus the
// run's unhandled errors with the test file running when each was thrown
// (Vitest marks them with VITEST_TEST_PATH) and the run's test files its
// stack names (sources), and how the run ended. Written as JSON to
// WARPDOM_FAST_REPORT. withFastMode adds it after the configured
// reporters (or the CLI as a --reporter argument when the arguments name
// reporters), so the project's own reporters keep their output.
//
// Node only.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// Test states: passed, failed, skipped, pending (did not run).
export function moduleReport(module) {
  const tests = [];
  for (const t of module.children.allTests()) tests.push([t.fullName, t.result()?.state ?? 'pending']);
  const report = { file: module.moduleId, project: module.project?.name ?? '', state: module.state(), tests };
  // Type tests (typecheck) never share a window; the CLI leaves them alone.
  if (module.task?.meta?.typecheck === true) report.typecheck = true;
  return report;
}

// The files an error's stack names: Vitest's parsed frames (stacks), else
// the paths in the stack text (file URLs or absolute paths, with
// :line:column).
const FRAME = /(file:\/\/\/[A-Za-z]:[^\s():]+|file:\/\/[^\s():]+|[A-Za-z]:[\\/][^\s():]+|\/[^\s():]+):\d+:\d+/g;
export function stackFiles(error) {
  if (Array.isArray(error?.stacks) && error.stacks.length) return error.stacks.map((f) => f?.file).filter(Boolean);
  const out = [];
  for (const [, path] of String(error?.stack ?? '').matchAll(FRAME)) {
    try { out.push(path.startsWith('file:') ? fileURLToPath(path) : path); } catch { /* not a path */ }
  }
  return out;
}

// An unhandled error is reported with the file that was running when it
// was thrown. Without isolation that can be another file than the one
// whose code threw it: a timer or promise a test left behind (an
// un-awaited vi.waitFor, a callback after the test ended) fires while a
// later file of the same worker runs. sources: the run's test files in
// the error's stack, which name the file the code came from.
export function runReport(modules, errors = [], reason = null) {
  const ids = new Set(modules.map((m) => m.moduleId));
  return {
    reason,
    files: modules.map(moduleReport),
    errors: errors.map((e) => ({
      file: e?.VITEST_TEST_PATH ?? null,
      sources: [...new Set(stackFiles(e).filter((f) => ids.has(f)))],
      message: String(e?.message ?? e).slice(0, 500),
    })),
  };
}

export default class WarpdomFastReporter {
  onTestRunEnd(testModules, unhandledErrors, reason) {
    const file = process.env.WARPDOM_FAST_REPORT;
    if (!file) return;
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify(runReport([...testModules], [...(unhandledErrors ?? [])], reason ?? null)));
  }
}
