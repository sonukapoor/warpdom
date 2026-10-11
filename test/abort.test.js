// AbortController and AbortSignal, checked against jsdom.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWindow } from '../src/node.js';
import { parity } from './parity.js';

const describe = (e) => (typeof e === "object" && e !== null && "name" in e ? [e.name, e.message, e.constructor.name] : e);

const abortScenario = async (w) => {
  const out = [];
  const c = new w.AbortController();
  const s = c.signal;
  const events = [];
  s.addEventListener('abort', (e) => events.push([e.type, e.bubbles, e.cancelable, e.isTrusted, s.aborted, e.target === s]));
  s.onabort = () => events.push('onabort');
  out.push(s.aborted, s.reason, Object.prototype.toString.call(s), s instanceof w.EventTarget, c.signal === s);
  c.abort();
  c.abort('again');
  out.push(s.aborted, describe(s.reason), events);
  try { s.throwIfAborted(); } catch (e) { out.push(describe(e)); }
  const r = new w.AbortController();
  r.abort('custom');
  out.push(r.signal.reason);
  try { r.signal.throwIfAborted(); } catch (e) { out.push(e); }
  out.push(describe(w.AbortSignal.abort().reason), w.AbortSignal.abort(42).reason);
  try { new w.AbortSignal(); } catch (e) { out.push(e.name); }
  const t = w.AbortSignal.timeout(5);
  out.push(t.aborted);
  await new Promise((resolve) => setTimeout(resolve, 30));
  out.push(t.aborted, describe(t.reason));
  for (const bad of [-1, Infinity, NaN]) { try { w.AbortSignal.timeout(bad); out.push('ok'); } catch (e) { out.push(e.name); } }
  // any(): already aborted, later aborted, and nested dependent signals.
  const a = new w.AbortController(), b = new w.AbortController();
  const any = w.AbortSignal.any([a.signal, b.signal]);
  const nested = w.AbortSignal.any([any]);
  const order = [];
  any.addEventListener('abort', () => order.push('any'));
  nested.addEventListener('abort', () => order.push('nested'));
  a.signal.addEventListener('abort', () => order.push('a'));
  out.push(any.aborted);
  b.abort('b-reason');
  out.push(any.aborted, any.reason, nested.reason, order, a.signal.aborted);
  out.push(w.AbortSignal.any([w.AbortSignal.abort('pre')]).reason, w.AbortSignal.any([]).aborted);
  try { w.AbortSignal.any([{}]); } catch (e) { out.push(e.name); }
  // Event listener removal through a signal.
  const target = w.document.createElement('div');
  const lc = new w.AbortController();
  let calls = 0;
  target.addEventListener('x', () => calls++, { signal: lc.signal });
  target.dispatchEvent(new w.Event('x'));
  lc.abort();
  target.dispatchEvent(new w.Event('x'));
  out.push(calls);
  return out;
};
parity('AbortController and AbortSignal', abortScenario);
parity('AbortController and AbortSignal (jsdom 26)', abortScenario, { jsdom: 26 });

test('AbortSignal.timeout uses the setTimeout of the global the window is installed on', () => {
  const w = createWindow();
  const calls = [];
  Object.defineProperty(w.document, 'defaultView', { value: { setTimeout: (fn, ms) => calls.push([fn, ms]) }, configurable: true });
  const signal = w.AbortSignal.timeout(600);
  assert.equal(calls.length, 1);
  assert.equal(calls[0][1], 600);
  calls[0][0]();
  assert.equal(signal.aborted, true);
  assert.equal(signal.reason.name, 'TimeoutError');
});
