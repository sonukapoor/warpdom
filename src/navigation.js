// Navigation (HTML standard, 7.4) for a window with one document: a
// navigation that only changes the fragment updates the URL and session
// history at once, then fires popstate and hashchange in a task; any other
// navigation would load another document, which is not implemented (it
// reports so and leaves the URL alone, as jsdom does).
import { S } from './internal.js';

const withoutFragment = (url) => {
  const i = url.href.indexOf('#');
  return i < 0 ? url.href : url.href.slice(0, i);
};

// Navigate the window to url (a URL object). `replace` replaces the current
// session history entry instead of adding one (location.replace()).
export function navigate(window, url, replace = false) {
  const ws = window[S];
  const current = ws.url;
  // As in jsdom: navigating to the current URL does nothing.
  if (url.href === current.href) return;
  if (withoutFragment(url) !== withoutFragment(current)) {
    ws.notImplemented('navigation to another Document');
    return;
  }
  // Navigate to a fragment.
  const history = ws.history[S];
  const entry = { state: null, url };
  if (replace) history.entries[history.index] = entry;
  else {
    history.entries.splice(history.index + 1, Infinity, entry);
    history.index++;
  }
  ws.url = url;
  ws.setTimeout(() => {
    window.dispatchEvent(new window.PopStateEvent('popstate', { state: null }));
    window.dispatchEvent(new window.HashChangeEvent('hashchange', { oldURL: current.href, newURL: url.href }));
  }, 0);
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
  window[S].setTimeout(() => navigate(window, url), 0);
}
