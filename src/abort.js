// AbortController and AbortSignal (DOM standard, 3.1 and 3.2), the
// window's own, as jsdom has them. AbortSignal.timeout() uses the setTimeout
// of the global the window is installed on (document.defaultView), so fake
// timers control it as they control jsdom's. The Vitest environment keeps
// Node's instead, as Vitest's jsdom environment does.
import { S, state, domError } from './internal.js';
import { dispatch } from './events.js';
import { handlerMembers } from './event-handlers.js';

function createSignal(window) {
  const signal = Object.create(window[S].protos.AbortSignal);
  signal[S] = { window, aborted: false, reason: undefined, algorithms: [], dependent: false, sources: null, dependents: null };
  return signal;
}

const abortError = () => domError('The operation was aborted.', 'AbortError');

// Signal abort: sets the reason, then runs the abort steps of the signal
// and of its dependent signals (AbortSignal.any).
function signalAbort(signal, reason) {
  const s = state(signal);
  if (s.aborted) return;
  s.aborted = true;
  s.reason = reason === undefined ? abortError() : reason;
  const toAbort = [];
  for (const ref of s.dependents ?? []) {
    const dependent = ref.deref();
    if (dependent && !dependent[S].aborted) {
      dependent[S].aborted = true;
      dependent[S].reason = s.reason;
      toAbort.push(dependent);
    }
  }
  runAbortSteps(signal);
  for (const dependent of toAbort) runAbortSteps(dependent);
}

function runAbortSteps(signal) {
  const s = state(signal);
  const algorithms = s.algorithms;
  s.algorithms = [];
  for (const algorithm of algorithms) algorithm();
  dispatch(signal, new s.window.Event('abort'));
}

// The global's setTimeout, looked up when the timeout starts.
function timerHost(window) {
  const host = window.document.defaultView ?? window;
  return typeof host.setTimeout === 'function' ? host : globalThis;
}

const isSignal = (value) => value?.[S] && 'aborted' in value[S] && 'dependent' in value[S];

export const ABORT_INTERFACES = [
  {
    name: 'AbortController',
    construct: (window, self) => { self[S] = { signal: createSignal(window) }; return self; },
    members: {
      get signal() { return state(this).signal; },
      abort(reason = undefined) { signalAbort(state(this).signal, reason); },
    },
  },
  {
    name: 'AbortSignal',
    parent: 'EventTarget',
    staticMethods: (window) => ({
      abort(reason = undefined) {
        const signal = createSignal(window);
        signalAbort(signal, reason);
        return signal;
      },
      timeout(milliseconds) {
        const ms = Number(milliseconds);
        if (!Number.isFinite(ms) || ms < 0) throw new TypeError(`Failed to execute 'timeout' on 'AbortSignal': Value is outside the 'unsigned long long' value range.`);
        const signal = createSignal(window);
        timerHost(window).setTimeout(() => signalAbort(signal, domError('The operation timed out.', 'TimeoutError')), ms);
        return signal;
      },
      any(signals) {
        const list = [...signals];
        for (const source of list) {
          if (!isSignal(source)) throw new TypeError("Failed to execute 'any' on 'AbortSignal': Failed to convert value to 'AbortSignal'.");
        }
        const result = createSignal(window);
        const aborted = list.find((source) => source[S].aborted);
        if (aborted) {
          result[S].aborted = true;
          result[S].reason = aborted[S].reason;
          return result;
        }
        const rs = result[S];
        rs.dependent = true;
        rs.sources = new Set();
        const ref = new WeakRef(result);
        for (const source of list) {
          // A dependent signal's sources stand in for it.
          for (const s of source[S].dependent ? source[S].sources : [source]) {
            if (rs.sources.has(s)) continue;
            rs.sources.add(s);
            (s[S].dependents ??= []).push(ref);
          }
        }
        return result;
      },
    }),
    members: {
      get aborted() { return state(this).aborted; },
      get reason() { return state(this).reason; },
      throwIfAborted() {
        const s = state(this);
        if (s.aborted) throw s.reason;
      },
      ...handlerMembers(['onabort']),
    },
  },
];
