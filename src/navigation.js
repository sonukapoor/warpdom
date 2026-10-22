// Navigation (HTML standard, 7.4) for a window with one document: a
// navigation that only changes the fragment updates the URL and session
// history at once, then fires popstate and hashchange in a task; any other
// navigation would load another document, which is not implemented (it
// reports so and leaves the URL alone, as jsdom does). Session history
// traversal (history.back(), forward(), go()) moves between the entries
// of that one document.
import { S } from './internal.js';
import { dispatch } from './events.js';
import { runJavascriptURL } from './scripts.js';

const withoutFragment = (url) => {
  const i = url.href.indexOf('#');
  return i < 0 ? url.href : url.href.slice(0, i);
};

// Navigate the window to url (a URL object). `replace` replaces the current
// session history entry instead of adding one (location.replace()).
export function navigate(window, url, replace = false) {
  const ws = window[S];
  const current = ws.url;
  // As in jsdom: navigating to the current URL does nothing, and neither
  // does a javascript: URL given to location (hyperlinks run them).
  if (url.href === current.href || url.protocol === 'javascript:') return;
  if (withoutFragment(url) !== withoutFragment(current)) {
    notImplemented(ws);
    return;
  }
  // Navigate to a fragment.
  const history = ws.history[S];
  history.navigations++;
  const entry = { state: null, url };
  if (replace) history.entries[history.index] = entry;
  else {
    history.entries.splice(history.index + 1, Infinity, entry);
    history.index++;
  }
  ws.url = url;
  hostTimeout(
    window,
    () => {
      dispatch(window, new window.PopStateEvent('popstate', { state: null }));
      dispatch(window, new window.HashChangeEvent('hashchange', { oldURL: current.href, newURL: url.href }));
    },
    0,
  );
}

// jsdom 27 and later name the missing piece "navigation to another
// Document"; jsdom 20 to 26 "navigation (except hash changes)".
const notImplemented = (ws) =>
  ws.notImplemented(ws.compat.jsdom >= 27 ? 'navigation to another Document' : 'navigation (except hash changes)');

// Navigation tasks run on the timers of the global the window is installed
// on, looked up when queued, so a test's fake timers hold them back as they
// do jsdom's (Vitest and Jest: popstate after history.back() or a fragment
// navigation fires only when the test advances its timers).
export function hostTimeout(window, callback, ms) {
  const host = window.document.defaultView ?? window;
  if (typeof host.setTimeout === 'function') host.setTimeout(callback, ms);
  else window[S].setTimeout(callback, ms);
}

const fragmentOf = (url) => {
  const i = url.href.indexOf('#');
  return i < 0 ? null : url.href.slice(i + 1);
};

// history.go(delta) (HTML 7.4.2, traverse the history by a delta), as
// jsdom does it (black box, jsdom 20 to 30): the target entry is the
// current index plus delta when called; out of range does nothing; delta
// 0 is a reload (not implemented, reported at once). The move happens in a
// task (a 1 ms timer: fake timers run it on advancing by 1 ms, not 0),
// skipped if the target is the current entry by then, or if pushState or
// a fragment navigation (also location.replace) came in between;
// replaceState keeps it. The move sets the URL and history.state (the
// entry's state object itself), then fires popstate with that state, and
// hashchange when the fragment differs.
export function traverse(window, delta) {
  const ws = window[S];
  if (delta === 0) {
    notImplemented(ws);
    return;
  }
  const history = ws.history[S];
  const target = history.index + delta;
  if (target < 0 || target >= history.entries.length) return;
  const navigations = history.navigations;
  hostTimeout(
    window,
    () => {
      if (
        history.navigations !== navigations ||
        target === history.index ||
        target >= history.entries.length ||
        ws.discarded
      )
        return;
      const old = ws.url;
      const entry = history.entries[target];
      history.index = target;
      ws.url = entry.url;
      dispatch(window, new window.PopStateEvent('popstate', { state: entry.state }));
      if (fragmentOf(old) !== fragmentOf(entry.url)) {
        dispatch(window, new window.HashChangeEvent('hashchange', { oldURL: old.href, newURL: entry.url.href }));
      }
    },
    1,
  );
}

// Following a hyperlink (<a>, <area>): a navigation in a later task. Links
// to other named targets (target="_blank", ...) would open another
// browsing context; nothing happens.
const SAME_CONTEXT = new Set(['', '_self', '_parent', '_top']);

export function followHyperlink(element, url) {
  const target = element[S].attrs.get('target');
  if (target !== undefined && !SAME_CONTEXT.has(target.trim().toLowerCase())) return;
  const doc = element[S].doc;
  if (doc[S].noView) return;
  const window = doc[S].window;
  if (url.protocol === 'javascript:') window[S].setTimeout(() => runJavascriptURL(window, url), 0);
  else hostTimeout(window, () => navigate(window, url), 0);
}
