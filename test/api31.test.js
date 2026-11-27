// jsdom 31's new members (black box, 31.0.1; #269 part G1): reportError(),
// HTMLScriptElement's async and its "force async" flag, Element's part,
// CSSPseudoElement, and the descriptor interfaces' own @@iterator. jsdom 30
// has none of them.
import { parity } from './parity.js';

const attempt = (f) => {
  try {
    return `ok ${JSON.stringify(f())}`;
  } catch (e) {
    return e.name;
  }
};

parity(
  "jsdom 31's reportError()",
  (w) => {
    const events = [];
    w.addEventListener('error', (e) => {
      events.push([e.constructor.name, e.message, e.error?.message, e.cancelable, e.bubbles, e.target === w]);
      e.preventDefault();
    });
    const { reportError } = w;
    return [
      w.reportError.length,
      Object.keys(w).includes('reportError'),
      attempt(() => w.reportError(new Error('boom'))),
      attempt(() => reportError(new Error('detached'))),
      attempt(() => w.reportError()),
      attempt(() => w.reportError.call({}, 1)),
      events,
    ];
  },
  { jsdom: 31 },
);

parity(
  "jsdom 31's script async and its force async flag",
  (w) => {
    const d = w.document;
    const created = () => d.createElement('script');
    const parsed = (html) => {
      const div = d.createElement('div');
      div.innerHTML = html;
      return div.firstChild;
    };
    const after = (script, f) => {
      f(script);
      return [script.async, script.getAttribute('async')];
    };
    const template = d.createElement('template');
    template.innerHTML = '<script></script>';
    return [
      created().async,
      after(created(), (s) => (s.async = false)),
      after(created(), (s) => (s.async = true)),
      after(created(), (s) => {
        s.async = true;
        s.removeAttribute('async');
      }),
      after(created(), (s) => {
        s.setAttribute('async', '');
        s.removeAttribute('async');
      }),
      after(created(), (s) => {
        s.toggleAttribute('async');
        s.toggleAttribute('async');
      }),
      after(created(), (s) => {
        s.setAttributeNS('urn:x', 'async', '');
        s.removeAttributeNS('urn:x', 'async');
      }),
      parsed('<script></script>').async,
      parsed('<script async></script>').async,
      parsed('<script></script>').cloneNode().async,
      template.content.firstChild.async,
      d.createRange().createContextualFragment('<script></script>').firstChild.async,
      new w.DOMParser().parseFromString('<script></script>', 'text/html').querySelector('script').async,
      d.implementation.createHTMLDocument().createElement('script').async,
      'async' in d.createElementNS('http://www.w3.org/2000/svg', 'script'),
      Object.keys(w.HTMLScriptElement.prototype).includes('async'),
    ];
  },
  { jsdom: 31 },
);

parity(
  "jsdom 31's Element part",
  (w) => {
    const d = w.document;
    const p = d.createElement('p');
    p.setAttribute('part', 'a  b a');
    const out = [String(p.part), p.part.length, p.part === p.part, p.part.constructor.name];
    p.part.add('c');
    out.push(p.getAttribute('part'));
    p.part = 'x y';
    out.push(p.getAttribute('part'), [...p.part]);
    p.part = null;
    out.push(p.getAttribute('part'));
    out.push(d.createElementNS('http://www.w3.org/2000/svg', 'g').part.length);
    out.push(attempt(() => w.Element.prototype.part));
    return out;
  },
  { jsdom: 31 },
);

parity(
  "jsdom 31's CSSPseudoElement and the descriptors' own @@iterator",
  (w) => {
    const P = w.CSSPseudoElement.prototype;
    const iterator = (name) => Object.getOwnPropertyDescriptor(w[name].prototype, Symbol.iterator);
    return [
      Object.getPrototypeOf(Object.getPrototypeOf(P)) === null,
      Object.keys(P),
      P.pseudo.length,
      attempt(() => new w.CSSPseudoElement()),
      attempt(() => P.pseudo.call({}, 'x')),
      attempt(() => P.type),
      'pseudo' in w.Element.prototype,
      ...['CSSPageDescriptors', 'CSSPositionTryDescriptors'].map((name) => [
        iterator(name)?.value === iterator('CSSStyleDeclaration').value,
        iterator(name)?.writable,
        iterator(name)?.enumerable,
      ]),
    ];
  },
  { jsdom: 31 },
);

parity("jsdom 30 has none of jsdom 31's new members", (w) => [
  'reportError' in w,
  'async' in w.document.createElement('script'),
  'part' in w.document.createElement('p'),
  'CSSPseudoElement' in w,
]);
