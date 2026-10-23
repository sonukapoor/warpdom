// Classic inline scripts, checked against jsdom with runScripts:
// 'dangerously' (as Vitest's jsdom environment creates it).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWindow } from '../src/node.js';
import { S } from '../src/internal.js';
import { parity } from './parity.js';

const script = (w, code, attrs = {}) => {
  const s = w.document.createElement('script');
  for (const k in attrs) s.setAttribute(k, attrs[k]);
  s.textContent = code;
  return s;
};

parity('a script made by script runs when connected', (w) => {
  w.log = [];
  w.document.body.appendChild(script(w, 'log.push("ran", typeof document, this === window)'));
  w.log.push('after');
  const s = script(w, 'log.push("again")');
  w.document.body.appendChild(s);
  s.remove();
  w.document.body.appendChild(s);
  w.document.body.appendChild(s.cloneNode(true));
  return w.log;
});

// jsdom 30 runs a fragment's scripts after all its children are in;
// earlier versions as each child is inserted.
const fragmentScripts = (w) => {
  w.log = [];
  const f = w.document.createDocumentFragment();
  const div = w.document.createElement('div');
  div.appendChild(script(w, 'log.push("nested", document.querySelectorAll("script").length)'));
  f.appendChild(div);
  f.appendChild(script(w, 'log.push("second", document.querySelectorAll("script").length)'));
  w.log.push('built');
  w.document.body.appendChild(f);
  // The first removes the second: with jsdom 30 the second never runs.
  const g = w.document.createDocumentFragment();
  g.appendChild(script(w, 'log.push("a"); document.getElementById("b")?.remove()'));
  const b = script(w, 'log.push("b")');
  b.id = 'b';
  g.appendChild(b);
  w.document.body.appendChild(g);
  w.document.body.replaceChildren(
    script(w, 'log.push(document.body.childNodes.length)'),
    script(w, 'log.push(document.body.childNodes.length)'),
  );
  return w.log;
};
parity('scripts inserted with a fragment (jsdom 30)', fragmentScripts);
parity('scripts inserted with a fragment (jsdom 26)', fragmentScripts, { jsdom: 26 });

// jsdom 30: text inserted into a connected script that has not started
// runs it, and scripts in connected shadow trees run.
const laterAndShadow = (w) => {
  w.log = [];
  const d = w.document;
  const empty = script(w, '');
  d.body.appendChild(empty);
  empty.appendChild(d.createComment('log.push("comment")'));
  empty.textContent = 'log.push("text added")';
  empty.textContent = 'log.push("text again")';
  const host = d.createElement('div');
  const root = host.attachShadow({ mode: 'open' });
  root.appendChild(script(w, 'log.push("shadow")'));
  d.body.appendChild(host);
  root.appendChild(script(w, 'log.push("into connected shadow root")'));
  return w.log;
};
parity('text added to a connected script, scripts in shadow trees (jsdom 30)', laterAndShadow);
parity('text added to a connected script, scripts in shadow trees (jsdom 26)', laterAndShadow, { jsdom: 26 });

parity('parser-made scripts do not run, their clones do', (w) => {
  w.log = [];
  w.document.body.innerHTML = '<div><script>log.push("parsed")</script></div>';
  const parsed = w.document.querySelector('script');
  parsed.remove();
  w.document.body.appendChild(parsed);
  w.document.body.appendChild(parsed.cloneNode(true));
  w.document.body.insertAdjacentHTML('beforeend', '<script>log.push("adjacent")</script>');
  const t = w.document.createElement('template');
  t.innerHTML = '<p><script>log.push("template")</script></p>';
  w.document.body.appendChild(t.content.cloneNode(true));
  w.document.body.appendChild(w.document.importNode(t.content, true));
  return w.log;
});

parity('script types and language', (w) => {
  w.log = [];
  for (const type of [
    'module',
    'text/plain',
    'application/json',
    'text/javascript',
    'TEXT/JAVASCRIPT',
    '',
    'application/ecmascript',
    ' text/javascript ',
    'text/javascript; charset=utf-8',
  ]) {
    w.document.body.appendChild(script(w, `log.push(${JSON.stringify(type)})`, { type }));
  }
  w.document.body.appendChild(script(w, 'log.push("vbscript")', { language: 'vbscript' }));
  w.document.body.appendChild(script(w, 'log.push("javascript")', { language: 'javascript' }));
  // Not started while its type is not JavaScript: runs once it is.
  const later = script(w, 'log.push("later")', { type: 'text/plain' });
  w.document.body.appendChild(later);
  later.removeAttribute('type');
  later.remove();
  w.document.body.appendChild(later);
  return w.log;
});

parity('scripts that do not run: src, documents without a window, SVG', (w) => {
  w.log = [];
  const d = w.document;
  d.body.appendChild(script(w, 'log.push("src")', { src: 'http://localhost/x.js' }));
  const other = d.implementation.createHTMLDocument('');
  const s = other.createElement('script');
  s.textContent = 'log.push("other document")';
  other.body.appendChild(s);
  d.body.appendChild(s);
  const svg = d.createElementNS('http://www.w3.org/2000/svg', 'script');
  svg.textContent = 'log.push("svg")';
  d.body.appendChild(svg);
  // Only text node children are the source.
  const nested = script(w, 'log.push("own text")');
  nested.appendChild(d.createElement('b')).textContent = 'log.push("element text")';
  d.body.appendChild(nested);
  // Moved into the document from an inert template's contents: runs.
  const t = d.createElement('template');
  t.content.appendChild(script(w, 'log.push("from template contents")'));
  d.body.appendChild(t.content);
  return w.log;
});

parity('document.currentScript and errors', (w) => {
  w.log = [];
  w.addEventListener('error', (e) => {
    e.preventDefault();
    w.log.push(['error', e.message, e.error?.name]);
  });
  const s = script(w, 'log.push(document.currentScript === window.current)');
  w.current = s;
  w.document.body.appendChild(s);
  w.document.body.appendChild(script(w, 'throw new TypeError("boom")'));
  w.document.body.appendChild(script(w, 'log.push(1); return;'));
  w.document.body.appendChild(script(w, '"use strict"; log.push(typeof this)'));
  w.log.push(w.document.currentScript);
  return w.log;
});

// Without an environment the window is not the JS global: names resolve
// through the window (a with statement), but top-level declarations stay
// local to the script.
test('a standalone window runs scripts with the window as scope', () => {
  const w = createWindow({ url: 'http://localhost/page' });
  w.log = [];
  w.document.body.appendChild(script(w, 'var local = 1; log.push(location.href, this === window, typeof local)'));
  assert.deepEqual(w.log, ['http://localhost/page', true, 'number']);
  assert.equal(w.local, undefined);
});

test('an environment can run scripts in its own realm', () => {
  const w = createWindow();
  const ran = [];
  w[S].runScript = (source) => ran.push(source);
  w.document.body.appendChild(script(w, 'code()'));
  assert.deepEqual(ran, ['code()']);
});
