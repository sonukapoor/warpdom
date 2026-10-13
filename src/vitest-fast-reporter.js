// The report of a Vitest run that `warpdom vitest run` starts
// (./vitest-fast-cli.js), as a Vitest reporter (Vitest 3.2 or later): per
// test file, its project, its state and every test's state, plus the
// run's unhandled errors with the test file each came from (Vitest marks
// them with VITEST_TEST_PATH), and how the run ended. Written as JSON to
// WARPDOM_FAST_REPORT. withFastMode adds it after the configured
// reporters (or the CLI as a --reporter argument when the arguments name
// reporters), so the project's own reporters keep their output.
//
// Node only.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

// Test states: passed, failed, skipped, pending (did not run).
export function moduleReport(module) {
  const tests = [];
  for (const t of module.children.allTests()) tests.push([t.fullName, t.result()?.state ?? 'pending']);
  const report = { file: module.moduleId, project: module.project?.name ?? '', state: module.state(), tests };
  // Type tests (typecheck) never share a window; the CLI leaves them alone.
  if (module.task?.meta?.typecheck === true) report.typecheck = true;
  return report;
}

export function runReport(modules, errors = [], reason = null) {
  return {
    reason,
    files: modules.map(moduleReport),
    errors: errors.map((e) => ({ file: e?.VITEST_TEST_PATH ?? null, message: String(e?.message ?? e).slice(0, 500) })),
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
