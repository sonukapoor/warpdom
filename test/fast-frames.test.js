// The fastFrames option (docs/fast-frames.md): animation frames without
// the 16.7 ms real-time wait, off by default.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWindow } from '../src/node.js';

const frame = (w) => new Promise((resolve) => w.requestAnimationFrame(resolve));

async function frames(w, n) {
  const start = performance.now();
  for (let i = 0; i < n; i++) await frame(w);
  return performance.now() - start;
}

test('fastFrames: off by default, a frame waits about 16.7 ms', async () => {
  const w = createWindow();
  assert.ok(await frames(w, 3) >= 45, 'three frames take at least 45 ms');
});

test('fastFrames: frames run without the real-time wait', async () => {
  const w = createWindow({ fastFrames: true });
  // 30 frames would take 500 ms at 60 Hz.
  assert.ok(await frames(w, 30) < 250, '30 frames well under 500 ms');
});

test('fastFrames: same frame semantics (batching, order, cancel, timestamps)', async () => {
  const w = createWindow({ fastFrames: true });
  const log = [];
  const times = [];
  w.requestAnimationFrame((t) => { log.push('a'); times.push(t); w.requestAnimationFrame((t2) => { log.push('next'); times.push(t2); }); });
  const b = w.requestAnimationFrame(() => log.push('b'));
  w.requestAnimationFrame((t) => { log.push('c'); times.push(t); w.cancelAnimationFrame(b + 2); });
  w.requestAnimationFrame(() => log.push('canceled by c'));
  w.cancelAnimationFrame(b);
  await frame(w);
  await frame(w);
  assert.deepEqual(log, ['a', 'c', 'next']);
  // Callbacks of one frame get the same time; later frames later times,
  // real times comparable with performance.now().
  assert.equal(times[0], times[1]);
  assert.ok(times[2] >= times[1] && times[2] <= performance.now());
});

test('fastFrames: a zero-delay timer queued before the frame request still runs first', async () => {
  const w = createWindow({ fastFrames: true });
  const log = [];
  w.setTimeout(() => log.push('timer 0'), 0);
  w.requestAnimationFrame(() => log.push('frame'));
  await new Promise((r) => setTimeout(r, 20));
  assert.deepEqual(log, ['timer 0', 'frame']);
});

test('fastFrames: nested browsing contexts inherit the option', async () => {
  const w = createWindow({ fastFrames: true, url: 'http://localhost/' });
  const iframe = w.document.body.appendChild(w.document.createElement('iframe'));
  const inner = iframe.contentWindow;
  assert.ok(await frames(inner, 10) < 120);
});

test('fastFrames: Vitest environmentOptions.warpdom.fastFrames', async () => {
  const { default: environment } = await import('../src/vitest.js');
  for (const [options, fast] of [[{ warpdom: { fastFrames: true } }, true], [{}, false], [{ warpdom: { fastFrames: 'yes' } }, false]]) {
    const global = {};
    const result = environment.setup(global, options);
    try {
      const ms = await frames(global, 3);
      assert.equal(ms < 40, fast, `${JSON.stringify(options)}: 3 frames in ${ms.toFixed(1)} ms`);
    } finally {
      result.teardown();
    }
  }
});
