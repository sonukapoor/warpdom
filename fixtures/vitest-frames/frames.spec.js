import { test, expect, vi, afterEach } from 'vitest';

// Animation frames under Vitest's fake timers (#249), black box with
// Vitest 5's jsdom environment (jsdom 30; 20 to 30 share the code). jsdom runs
// frames on the setInterval of its own realm: Node's global, which
// vi.useFakeTimers() fakes in the forks and threads pools, but not the
// VM pools' context. FRAMES_EXPECT: 'faked' (forks) or 'real' (vmThreads).
const faked = process.env.FRAMES_EXPECT === 'faked';
const TIMERS = ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'];

afterEach(() => vi.useRealTimers());

test('fake timers that leave requestAnimationFrame alone', async () => {
  vi.useFakeTimers({ toFake: TIMERS });
  const log = [];
  const start = Date.now();
  const at = (name) => () => log.push(`${name}@${faked ? Date.now() - start : 'real'}`);
  requestAnimationFrame(at('a'));
  requestAnimationFrame(() => {
    at('b')();
    requestAnimationFrame(at('in b'));
  });
  vi.advanceTimersByTime(10);
  const c = requestAnimationFrame(at('canceled'));
  cancelAnimationFrame(c);
  vi.advanceTimersByTime(40);
  if (faked) {
    expect(log).toEqual(['a@16', 'b@16', 'in b@32']);
    // Cancel the last pending callback, then request: a new beat.
    log.length = 0;
    const s = Date.now();
    const d = requestAnimationFrame(() => log.push('d'));
    vi.advanceTimersByTime(10);
    cancelAnimationFrame(d);
    requestAnimationFrame(() => log.push(`e@${Date.now() - s}`));
    vi.advanceTimersByTime(40);
    expect(log).toEqual(['e@26']);
  } else {
    expect(log).toEqual([]);
    vi.useRealTimers();
    await new Promise((r) => setTimeout(r, 60));
    expect(log).toEqual(['a@real', 'b@real', 'in b@real']);
  }
});

test('default fake timers fake requestAnimationFrame itself', () => {
  vi.useFakeTimers();
  const log = [];
  requestAnimationFrame((t) => log.push(typeof t));
  vi.advanceTimersToNextFrame();
  expect(log).toEqual(['number']);
});
