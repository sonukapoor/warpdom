// Runs one WPT test page in this (fresh) process and reports to the parent
// over IPC: { type: 'result' } per finished subtest, then one
// { type: 'complete' } (or the parent kills the process at its hard
// timeout). One process per test file keeps every file isolated: its own
// realm, window, timers and globals.
import { createEngine } from './engines.mjs';
import { loadPage, reporterSource, ORIGIN, HTTPS_ORIGIN } from './page.mjs';

// The host's own timers, kept before the window's replace the globals.
const hostSetTimeout = globalThis.setTimeout;
const hostSetImmediate = globalThis.setImmediate;

const SUBTEST = ['PASS', 'FAIL', 'TIMEOUT', 'NOTRUN', 'PRECONDITION_FAILED'];
const HARNESS = ['OK', 'ERROR', 'TIMEOUT', 'PRECONDITION_FAILED'];
const clip = (s, n = 2000) => (s == null ? null : String(s).length > n ? String(s).slice(0, n) + '...' : String(s));

process.once('message', async (job) => {
  const { test, engine: engineName, wptRoot, warpdomDir, timeoutMultiplier } = job;
  const notes = [];
  const note = (message) => { if (notes.length < 50) notes.push(clip(message, 500)); };
  let finished = false;
  const send = (message) => new Promise((resolve) => process.send(message, resolve));
  const finish = async (message) => {
    if (finished) return;
    finished = true;
    await send({ ...message, notes });
    process.exit(0);
  };

  // Uncaught exceptions from tasks (timers, callbacks) and unhandled
  // rejections are reported at the window, as a browser does.
  let engine = null;
  process.on('uncaughtException', (error) => {
    if (!engine) return finish({ type: 'complete', harness: 'ERROR', message: `runner: ${error?.stack ?? error}`, subtests: [] });
    try { engine.reportError(error); } catch (e) { note(`reportError failed: ${e?.message}`); }
  });
  process.on('unhandledRejection', (reason, promise) => {
    try { engine?.dispatchRejection(reason, promise); } catch (e) { note(`unhandledrejection failed: ${e?.message}`); }
  });

  try {
    const url = new URL(test.url, test.file.includes('.https.') ? HTTPS_ORIGIN : ORIGIN).href;
    engine = await createEngine(engineName, { url, warpdomDir, log: note });
    Object.defineProperty(engine.global, '__wptHost', {
      configurable: true,
      enumerable: false,
      writable: true,
      value: {
        timeoutMultiplier,
        result(name, status, message) {
          send({ type: 'result', subtest: { name: String(name), status: SUBTEST[status] ?? String(status), message: clip(message) } });
        },
        complete(tests, status, message, stack) {
          finish({
            type: 'complete',
            harness: HARNESS[status] ?? String(status),
            message: clip(message),
            stack: status === 0 ? null : clip(stack),
            subtests: tests.map(([name, s, m]) => ({ name: String(name), status: SUBTEST[s] ?? String(s), message: clip(m) })),
          });
        },
      },
    });
    // A fallback in case testharness.js never completes (it did not load, or
    // load never fired): its own harness timeout plus a margin.
    const harnessTimeout = (test.long ? 60000 : 10000) * timeoutMultiplier;
    hostSetTimeout(() => finish({ type: 'complete', harness: 'TIMEOUT', message: 'runner: no completion from testharness.js', subtests: null }), harnessTimeout + 5000);
    await loadPage(engine, test, {
      wptRoot,
      reporterSource: reporterSource(),
      yieldToTasks: () => new Promise((resolve) => hostSetImmediate(resolve)),
      note,
    });
  } catch (error) {
    finish({ type: 'complete', harness: 'ERROR', message: clip(`runner: ${error?.stack ?? error}`), subtests: [] });
  }
});
