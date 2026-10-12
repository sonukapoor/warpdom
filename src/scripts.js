// Classic inline scripts (HTML standard, 4.12.1.1 "prepare the script
// element"), as Vitest's jsdom environment runs them (runScripts:
// 'dangerously'): a script element created by script (createElement,
// cloneNode, importNode) runs when it becomes connected to a document with
// a browsing context. As in jsdom: scripts the HTML parser made (innerHTML,
// insertAdjacentHTML, the page itself) never run, but their clones do;
// adding text to a connected script does not run it; scripts in shadow
// trees and module scripts do not run; nothing is fetched for src.
//
// Insertion costs nothing for documents that never had such a script: the
// tree calls this hook only when the document's scriptCount is non-zero
// (counted at creation and adoption, in window.js and internal.js).
// Element state: s.script is 'ready' (may run) or 'started' ("already
// started"); undefined for parser-made scripts.
import { S, HTML_NS, ELEMENT_NODE, TEXT_NODE, hooks, nextInTree, connected } from './internal.js';
import { reportError } from './events.js';

const JS_MIME_TYPES = new Set([
  'application/ecmascript', 'application/javascript', 'application/x-ecmascript', 'application/x-javascript',
  'text/ecmascript', 'text/javascript', 'text/javascript1.0', 'text/javascript1.1', 'text/javascript1.2',
  'text/javascript1.3', 'text/javascript1.4', 'text/javascript1.5', 'text/jscript', 'text/livescript',
  'text/x-ecmascript', 'text/x-javascript',
]);

const trimAscii = (v) => v.replace(/^[\t\n\f\r ]+|[\t\n\f\r ]+$/g, '');

// Classic script, by the type and language attributes.
function isClassic(attrs) {
  const type = attrs.get('type');
  if (type !== undefined) return type === '' || JS_MIME_TYPES.has(trimAscii(type).toLowerCase());
  const language = attrs.get('language');
  if (language === undefined || language === '') return true;
  return JS_MIME_TYPES.has(`text/${language}`.toLowerCase());
}

// The child text content: the script's own text node children.
function childText(script) {
  let text = '';
  for (let c = script[S].first; c !== null; c = c[S].next) if (c[S].type === TEXT_NODE) text += c[S].data;
  return text;
}

// Runs source as a classic script of window. The environments put the
// window's realm here (window[S].runScript); a standalone window uses a
// direct eval inside `with (window)`, so names resolve through the window,
// `this` is the window and a top-level return is a SyntaxError, though
// top-level var declarations stay local to the script.
let withWindow = null;
function runInWindow(window, source) {
  const run = window[S].runScript;
  if (run) { run(source); return; }
  if (withWindow === null) withWindow = new Function('__window', '__source', 'with (__window) { return eval(__source); }');
  withWindow.call(window, window, source);
}

// A javascript: URL followed as a hyperlink (HTML 7.4.2.5): its source,
// the URL's percent-decoded path, runs as a classic script of the window;
// the result is ignored (it would replace the document; jsdom ignores it
// too), and an exception is reported.
export function runJavascriptURL(window, url) {
  const encoded = url.href.slice('javascript:'.length);
  let source;
  try { source = decodeURIComponent(encoded); } catch { source = encoded; }
  try {
    runInWindow(window, source);
  } catch (error) {
    reportError(window, error);
  }
}

function prepare(script) {
  const s = script[S];
  if (s.script !== 'ready') return;
  const hasSrc = s.attrs.has('src');
  const source = hasSrc ? '' : childText(script);
  if (!hasSrc && source === '') return;
  if (!isClassic(s.attrs)) return;
  s.script = 'started';
  const doc = s.doc;
  const ds = doc[S];
  if (ds.noView || hasSrc) return;
  const window = ds.window;
  const previous = ds.currentScript ?? null;
  ds.currentScript = script;
  try {
    runInWindow(window, source);
  } catch (error) {
    reportError(window, error);
  } finally {
    ds.currentScript = previous;
  }
}

// jsdom 30 follows the standard more closely than earlier versions:
// scripts inserted with a fragment run after all its children are in
// (post-connection steps), text inserted into a connected script that has
// not started runs it, and scripts in connected shadow trees run. Earlier
// versions run each fragment child's scripts as it is inserted, and do
// neither of the others.
const modern = (doc) => doc[S].window[S].compat.jsdom >= 30;

// The scripts collected during a fragment insertion (jsdom 30), or null.
let pending = null;

function collect(node, deep, found) {
  for (let n = node; n !== null; n = nextInTree(n, node)) {
    const s = n[S];
    if (s.type !== ELEMENT_NODE) continue;
    if (s.script === 'ready' && s.tag === 'script' && s.ns === HTML_NS) (found ??= []).push(n);
    if (deep && s.shadowRoot) found = collect(s.shadowRoot, true, found);
  }
  return found;
}

// Prepares each script still connected when its turn comes (a script can
// change the tree).
function run(found) {
  for (let i = 0; i < found.length; i++) if (i === 0 || connected(found[i])) prepare(found[i]);
}

hooks.scripts = {
  // node was inserted into parent (root: parent's root; inDocument: root is
  // the document).
  inserted(parent, node, root, inDocument) {
    const doc = node[S].doc;
    const deep = modern(doc);
    let connectedNow = inDocument;
    if (!connectedNow && deep && root[S].shadow === true) connectedNow = connected(root);
    if (connectedNow) {
      const found = collect(node, deep, null);
      if (found !== null) {
        if (pending !== null) for (let i = 0; i < found.length; i++) pending.push(found[i]);
        else run(found);
      }
    }
    // Children changed steps of a connected script that has not started.
    if (deep && parent[S].script === 'ready' && connectedNow) prepare(parent);
  },
  // A fragment's children are inserted by insertChildren(); with jsdom 30
  // their scripts run once all are in.
  fragment(doc, insertChildren, parent, fragment, ref, root, quiet) {
    if (!modern(doc)) return insertChildren(parent, fragment, ref, root, quiet);
    const outer = pending;
    const found = pending = [];
    try {
      insertChildren(parent, fragment, ref, root, quiet);
    } finally {
      pending = outer;
    }
    if (found.length !== 0) {
      if (outer !== null) for (let i = 0; i < found.length; i++) outer.push(found[i]);
      else run(found);
    }
    return fragment;
  },
};
