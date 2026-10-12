// DOM methods checked against jsdom: insertion validity, replace and
// replace-all mutation records, isEqualNode, qualified names,
// getElementsByTagName(NS), document cloning, events, DOMParser details.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWindow } from '../src/index.js';
import { parity } from './parity.js';

// The DOMException name (or error class) a call throws, or 'ok'.
const throws = (fn) => {
  try { fn(); return 'ok'; } catch (e) { return e.name; }
};

parity('pre-insertion validity: parents that cannot have children, and the order of the checks', (w) => {
  const d = w.document;
  const text = d.createTextNode('t');
  const comment = d.createComment('c');
  const doctype = d.implementation.createDocumentType('html', '', '');
  const div = d.createElement('div');
  const child = d.createElement('span');
  div.appendChild(child);
  const other = d.createElement('p');
  return [
    throws(() => text.appendChild(d.createElement('b'))),
    throws(() => comment.appendChild(d.createTextNode('x'))),
    throws(() => doctype.appendChild(d.createElement('b'))),
    // The parent's type is checked before the reference child.
    throws(() => text.insertBefore(d.createElement('b'), other)),
    // The ancestor check comes before the reference child check.
    throws(() => child.insertBefore(div, other)),
    throws(() => div.insertBefore(d.createElement('b'), other)),
    throws(() => div.appendChild(doctype)),
    throws(() => div.appendChild(d)),
    throws(() => div.insertBefore(d.createElement('b'))),
    throws(() => div.insertBefore(d.createElement('b'), undefined)),
    throws(() => div.appendChild(d.createAttribute('x'))),
  ];
});

parity('pre-insertion validity: a document has one element, one doctype before it, no text', (w) => {
  const doc = w.document.implementation.createHTMLDocument('t');
  const html = doc.documentElement;
  const doctype = doc.doctype;
  const results = [
    throws(() => doc.appendChild(doc.createElement('div'))),
    throws(() => doc.appendChild(doc.createTextNode('x'))),
    throws(() => doc.insertBefore(doc.implementation.createDocumentType('x', '', ''), html)),
    throws(() => doc.appendChild(doc.createComment('ok'))),
    throws(() => doc.prepend(doc.createElement('div'))),
    throws(() => doc.replaceChild(doc.createElement('div'), doctype)),
    throws(() => doc.replaceChild(doc.implementation.createDocumentType('x', '', ''), html)),
  ];
  const frag = doc.createDocumentFragment();
  frag.append(doc.createElement('a'), doc.createElement('b'));
  results.push(throws(() => doc.replaceChild(frag, html)));
  doc.removeChild(html);
  results.push(throws(() => doc.insertBefore(doc.createElement('x'), doctype)));
  results.push(throws(() => doc.appendChild(doc.createElement('x'))));
  results.push(throws(() => doc.appendChild(doc.implementation.createDocumentType('y', '', ''))));
  doc.removeChild(doc.documentElement);
  doc.removeChild(doctype);
  doc.appendChild(doc.createElement('root'));
  results.push(throws(() => doc.appendChild(doctype)));
  results.push(throws(() => doc.prepend(doctype)));
  // replaceChildren checks the document as it will be.
  results.push(throws(() => doc.replaceChildren(doc.createElement('new'))));
  results.push(doc.documentElement.localName, doc.childNodes.length);
  return results;
});

parity('ChildNode before/after/replaceWith with this among the new nodes', (w) => {
  const d = w.document;
  const parent = d.createElement('div');
  const [a, b, c] = ['a', 'b', 'c'].map((t) => d.createElement(t));
  parent.append(a, b, c);
  b.before(b, a);
  const one = [...parent.children].map((e) => e.localName).join();
  b.after(c, b);
  const two = [...parent.children].map((e) => e.localName).join();
  b.replaceWith(a, b);
  const three = [...parent.children].map((e) => e.localName).join();
  return [one, two, three];
});

parity('replaceChild, replaceChildren and textContent queue one mutation record each', async (w) => {
  const d = w.document;
  const root = d.body.appendChild(d.createElement('div'));
  const other = d.body.appendChild(d.createElement('section'));
  root.innerHTML = '<a></a><b></b><i></i>';
  const moved = other.appendChild(d.createElement('em'));
  const records = [];
  const observer = new w.MutationObserver((list) => {
    for (const r of list) {
      records.push([r.target.localName, [...r.addedNodes].map((n) => n.nodeName).join(), [...r.removedNodes].map((n) => n.nodeName).join(),
        r.previousSibling?.nodeName ?? null, r.nextSibling?.nodeName ?? null]);
    }
  });
  observer.observe(d.body, { childList: true, subtree: true });
  root.replaceChild(d.createElement('u'), root.firstChild);
  root.replaceChild(root.lastChild, root.firstChild);
  const frag = d.createDocumentFragment();
  frag.append(d.createElement('x'), d.createElement('y'));
  root.appendChild(frag);
  root.replaceChildren(moved, 'text');
  root.textContent = 'plain';
  root.textContent = '';
  await new Promise((r) => setTimeout(r, 0));
  return records;
});

parity('isEqualNode', (w) => {
  const d = w.document;
  const make = (html) => { const t = d.createElement('div'); t.innerHTML = html; return t; };
  const a = make('<p class="x" id="1">hi<!--c--><b>bold</b></p>');
  const b = make('<p id="1" class="x">hi<!--c--><b>bold</b></p>');
  const c = make('<p id="1" class="y">hi<!--c--><b>bold</b></p>');
  const ns1 = d.createElementNS('urn:a', 'p:x');
  const ns2 = d.createElementNS('urn:a', 'q:x');
  const at1 = d.createElement('i'); at1.setAttributeNS('urn:n', 'p:k', 'v');
  const at2 = d.createElement('i'); at2.setAttributeNS('urn:n', 'q:k', 'v');
  const at3 = d.createElement('i'); at3.setAttributeNS('urn:m', 'p:k', 'v');
  const dt = d.implementation;
  return [
    a.isEqualNode(b), a.isEqualNode(c), a.isEqualNode(null), a.isEqualNode(a),
    ns1.isEqualNode(ns2), ns1.isEqualNode(d.createElementNS('urn:a', 'p:x')),
    at1.isEqualNode(at2), at1.isEqualNode(at3),
    dt.createDocumentType('a', 'b', 'c').isEqualNode(dt.createDocumentType('a', 'b', 'c')),
    dt.createDocumentType('a', 'b', 'c').isEqualNode(dt.createDocumentType('a', 'b', 'd')),
    d.createTextNode('x').isEqualNode(d.createTextNode('x')), d.createTextNode('x').isEqualNode(d.createComment('x')),
    d.createDocumentFragment().isEqualNode(d.createDocumentFragment()),
    dt.createHTMLDocument('a').isEqualNode(dt.createHTMLDocument('a')),
    dt.createHTMLDocument('a').isEqualNode(dt.createHTMLDocument('b')),
  ];
});

parity('qualified names: tagName, nodeName and prefix of namespaced elements', (w) => {
  const d = w.document;
  const x = d.createElementNS('urn:x', 'X:B');
  const svg = d.createElementNS('http://www.w3.org/2000/svg', 's:svg');
  const html = d.createElementNS('http://www.w3.org/1999/xhtml', 'h:div');
  const wrap = d.createElement('div');
  wrap.append(x.cloneNode(), html.cloneNode());
  // (jsdom serializes the HTML element as h:div; the HTML standard uses the
  // local name for HTML, SVG and MathML elements.)
  wrap.lastChild.remove();
  return [x.tagName, x.nodeName, x.prefix, x.localName, svg.tagName, svg.prefix, html.tagName, html.prefix,
    x.cloneNode().tagName, wrap.innerHTML, d.createElement('aÇ').localName];
});

parity('getElementsByTagName and getElementsByTagNameNS', (w) => {
  const d = w.document;
  const root = d.body.appendChild(d.createElement('div'));
  root.append(d.createElementNS('http://www.w3.org/1999/xhtml', 'A'), d.createElementNS('', 'A'), d.createElementNS('', 'a'),
    d.createElementNS('urn:x', 'p:a'), d.createElementNS('http://www.w3.org/2000/svg', 'foreignObject'));
  const names = (list) => [...list].map((e) => `${e.namespaceURI}|${e.nodeName}`).join();
  return [
    names(root.getElementsByTagName('A')), names(root.getElementsByTagName('a')), names(root.getElementsByTagName('p:a')),
    names(root.getElementsByTagName('foreignObject')), names(root.getElementsByTagName('foreignobject')),
    names(root.getElementsByTagNameNS('*', 'a')), names(root.getElementsByTagNameNS('urn:x', '*')),
    names(root.getElementsByTagNameNS('', 'A')), names(d.getElementsByTagNameNS(null, 'a')),
    names(d.getElementsByTagNameNS('*', '*')).length > 0,
  ];
});

parity('cloning documents and attributes', (w) => {
  const d = w.document;
  const parsed = new w.DOMParser().parseFromString('<!doctype html><title>T</title><p id=x>hi', 'text/html');
  const copy = parsed.cloneNode(true);
  const shallow = d.cloneNode();
  const xml = d.implementation.createDocument('urn:x', 'root', null);
  const xmlCopy = xml.cloneNode(true);
  const attr = d.createAttribute('data-x');
  attr.value = 'v';
  const attrCopy = attr.cloneNode();
  const svg = d.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttributeNS('http://www.w3.org/2000/xmlns/', 'xmlns:xlink', 'http://www.w3.org/1999/xlink');
  const svgAttr = svg.cloneNode().attributes[0];
  return [
    copy.URL === parsed.URL, copy.contentType, copy.title, copy.getElementById('x').textContent, copy.doctype.name,
    copy.documentElement.ownerDocument === copy, copy.defaultView, copy.isEqualNode(parsed), copy.compatMode,
    shallow.childNodes.length, shallow.URL === d.URL, Object.prototype.toString.call(shallow),
    Object.prototype.toString.call(xmlCopy), xmlCopy.contentType, xmlCopy.documentElement.namespaceURI,
    attrCopy.name, attrCopy.value, attrCopy.ownerElement,
    svgAttr.namespaceURI, svgAttr.prefix, svgAttr.localName,
  ];
});

parity('Event: initCustomEvent and initEvent do nothing while the event is dispatched', (w) => {
  const target = w.document.createElement('div');
  const event = new w.CustomEvent('first', { detail: 1 });
  const seen = [];
  target.addEventListener('first', (e) => {
    e.initCustomEvent('second', true, true, 2);
    e.initEvent('third', true, true);
    seen.push(e.type, e.bubbles, e.cancelable, e.detail);
  });
  target.dispatchEvent(event);
  return seen;
});

parity('window.event during dispatch at constructed event targets and nodes of other documents', (w) => {
  const seen = [];
  const target = new w.EventTarget();
  target.addEventListener('x', (e) => seen.push(w.event === e));
  target.dispatchEvent(new w.Event('x'));
  const parsed = new w.DOMParser().parseFromString('<p>', 'text/html');
  parsed.body.addEventListener('y', (e) => seen.push(w.event === e));
  parsed.body.dispatchEvent(new w.Event('y'));
  seen.push(w.event);
  return seen;
});

parity('body and frameset event handlers forward to the window', (w) => {
  const d = w.document;
  const body = d.createElement('body');
  const frameset = d.createElement('frameset');
  w.onblur = null;
  body.setAttribute('onblur', 'return');
  const forwarded = typeof w.onblur === 'function' && w.onblur === body.onblur;
  const nop = () => {};
  frameset.onfocus = nop;
  const result = [forwarded, w.onfocus === nop, body.onfocus === nop];
  w.onblur = null;
  w.onfocus = null;
  result.push(body.onblur, frameset.onfocus);
  return result;
});

parity(':valid and :invalid', (w) => {
  const d = w.document;
  d.body.innerHTML = `<form id=f><input id=a required><fieldset id=fs><select id=s required><option value="">x</option></select>
    <input id=b></fieldset></form><form id=g><input id=c value=x required></form><div id=d></div>`;
  const ids = (sel) => [...d.querySelectorAll(sel)].map((e) => e.id).join();
  const results = [ids(':invalid'), ids(':valid'), d.getElementById('s').closest(':invalid').id];
  d.getElementById('a').value = 'ok';
  d.getElementById('s').removeAttribute('required');
  results.push(ids(':invalid'), ids(':valid'));
  return results;
});

parity('DOMTokenList iterates through Array.prototype functions', (w) => {
  const el = w.document.createElement('p');
  el.className = 'a b c';
  const list = el.classList;
  const fe = [];
  list.forEach((t, i, l) => fe.push(t, i, l === list));
  const values = (w.Array ?? Array).prototype.values;
  return [list[Symbol.iterator] === values, list.values === values, JSON.stringify([[...list], [...list.entries()], [...list.keys()], [...list.values()], fe])];
});

parity('NodeIterator: removing nodes while the filter runs', (w) => {
  const d = w.document;
  const root = d.createElement('div');
  const [a, b, c] = ['a', 'b', 'c'].map((t) => d.createElement(t));
  root.append(a, b, c);
  const seen = [];
  const it = d.createNodeIterator(root, w.NodeFilter.SHOW_ELEMENT, {
    acceptNode(node) {
      seen.push(`${node.localName}:${it.referenceNode.localName}`);
      if (node === b) b.remove();
      return w.NodeFilter.FILTER_ACCEPT;
    },
  });
  const out = [it.nextNode(), it.nextNode(), it.nextNode()].map((n) => n.localName);
  out.push(it.referenceNode.localName, it.pointerBeforeReferenceNode, it.nextNode().localName, it.nextNode());
  // Removing the reference outside of traversal.
  const it2 = d.createNodeIterator(root);
  it2.nextNode(); it2.nextNode();
  a.remove();
  out.push(it2.referenceNode.localName, it2.pointerBeforeReferenceNode);
  return [seen, out];
});

parity('DOMParser HTML documents: quirks mode without a doctype, noscript parsed as markup, the window document URL', (w) => {
  const parser = new w.DOMParser();
  const quirks = parser.parseFromString('<p>x', 'text/html');
  const standards = parser.parseFromString('<!doctype html><p>x', 'text/html');
  const noscript = parser.parseFromString('<noscript><p id=n>hi</p></noscript>', 'text/html');
  return [quirks.compatMode, standards.compatMode, noscript.getElementById('n')?.localName ?? null,
    quirks.URL, w.document.compatMode, w.document.implementation.createHTMLDocument('').compatMode];
});

test('tagName of a prefixed element in an XML document keeps its case', () => {
  const w = createWindow();
  const doc = w.document.implementation.createDocument(null, null, null);
  const el = doc.createElementNS('http://www.w3.org/1999/xhtml', 'x:Div');
  assert.equal(el.tagName, 'x:Div');
});

parity('name validation: createElement, createElementNS, createDocument, setAttribute, toggleAttribute, createAttribute(NS)', (w) => {
  const d = w.document;
  const impl = d.implementation;
  const names = ['div', 'aÇ', '', 'a b', 'a/', '5', ':x', '_x', 'é', 'a\u0001', 'smallEmoji🆖', 'x=y', "'"];
  return names.map((n) => [
    throws(() => d.createElement(n)),
    throws(() => d.createElementNS('urn:x', `p:${n}`)),
    throws(() => impl.createDocument('urn:x', n, null)),
    throws(() => d.createElement('p').setAttribute(n, '')),
    throws(() => d.createElement('p').toggleAttribute(n)),
    throws(() => d.createAttribute(n)),
    throws(() => d.createAttributeNS('urn:x', `p:${n}`)),
    throws(() => impl.createDocumentType(n, '', '')),
  ]).concat([
    throws(() => d.createElementNS(null, 'p:x')), throws(() => d.createElementNS('urn:x', 'xmlns:x')),
    throws(() => impl.createDocument()), impl.createDocument(null, undefined).documentElement.localName,
    d.createElement('p').setAttribute('Ä', 'x') ?? d.body.appendChild(d.createElement('i')).setAttribute('Ä', '') ?? d.body.lastChild.getAttributeNames(),
  ]);
});

parity('createAttributeNS and setAttributeNode keep namespaces', (w) => {
  const d = w.document;
  const el = d.createElement('p');
  const a = d.createAttributeNS('urn:a', 'p:x');
  a.value = '1';
  const detached = [a.namespaceURI, a.prefix, a.localName, a.name, a.ownerElement];
  el.setAttributeNode(a);
  const b = d.createAttributeNS('urn:a', 'q:x');
  b.value = '2';
  const replaced = el.setAttributeNodeNS(b);
  const removed = el.removeAttributeNode(b);
  return [detached, replaced === a, el.getAttributeNS('urn:a', 'x'), removed.namespaceURI, removed.localName, removed.value,
    el.attributes.length, a.cloneNode().namespaceURI];
});

parity('template contents belong to an inert document; adopting a shadow root throws', (w) => {
  const d = w.document;
  const template = d.createElement('template');
  template.innerHTML = '<p>a</p><template><i>b</i></template>';
  const content = template.content;
  const inner = content.lastChild.content;
  const clone = content.cloneNode(true);
  const results = [
    content.ownerDocument === d, content.ownerDocument === inner.ownerDocument, content.firstChild.ownerDocument === content.ownerDocument,
    content.ownerDocument.defaultView, clone.ownerDocument === content.ownerDocument,
    d.createElement('template').content.ownerDocument === content.ownerDocument,
    d.importNode(content, true).ownerDocument === d,
  ];
  const child = content.firstChild;
  d.body.appendChild(content);
  results.push(child.ownerDocument === d, content.childNodes.length, content.ownerDocument === d);
  const t2 = d.createElement('template');
  t2.content.appendChild(d.createTextNode('x'));
  results.push(d.adoptNode(t2.content) === t2.content, t2.content.ownerDocument === d);
  const host = d.createElement('div');
  results.push(throws(() => d.adoptNode(host.attachShadow({ mode: 'open' }))));
  // The template's contents cannot take in the template's ancestors.
  const outer = d.createElement('div');
  const t3 = outer.appendChild(d.createElement('template'));
  results.push(throws(() => t3.content.appendChild(outer)));
  return results;
});

parity('lookupNamespaceURI, lookupPrefix and isDefaultNamespace', (w) => {
  const d = w.document;
  const root = d.createElementNS('urn:root', 'r:root');
  root.setAttributeNS('http://www.w3.org/2000/xmlns/', 'xmlns:x', 'urn:x');
  root.setAttributeNS('http://www.w3.org/2000/xmlns/', 'xmlns', 'urn:default');
  const child = root.appendChild(d.createElementNS('urn:child', 'child'));
  const text = child.appendChild(d.createTextNode('t'));
  const html = d.body;
  return [
    child.lookupNamespaceURI('x'), child.lookupNamespaceURI('r'), child.lookupNamespaceURI(null), text.lookupNamespaceURI('x'),
    root.lookupNamespaceURI('xml'), root.lookupNamespaceURI('xmlns'), root.lookupNamespaceURI(''), d.lookupNamespaceURI(null),
    child.lookupPrefix('urn:x'), child.lookupPrefix('urn:root'), child.lookupPrefix('urn:none'), child.lookupPrefix(null),
    child.isDefaultNamespace('urn:child'), root.isDefaultNamespace('urn:default'), html.isDefaultNamespace('http://www.w3.org/1999/xhtml'),
    d.createDocumentFragment().lookupNamespaceURI('x'), d.doctype.lookupPrefix('urn:x'),
  ];
});

parity('touch and wheel listeners on the window, document, root and body are passive by default', (w) => {
  const d = w.document;
  const div = d.body.appendChild(d.createElement('div'));
  const out = [];
  for (const target of [w, d, d.documentElement, d.body, div]) {
    for (const type of ['touchstart', 'wheel', 'touchend']) {
      for (const options of [undefined, { passive: false }, { passive: true }, true]) {
        const listener = (e) => e.preventDefault();
        target.addEventListener(type, listener, options);
        out.push(target.dispatchEvent(new w.Event(type, { cancelable: true })));
        target.removeEventListener(type, listener, options);
      }
    }
  }
  return out;
});

parity('createEvent: the standard table, uninitialized events', (w) => {
  const d = w.document;
  return ['BeforeUnloadEvent', 'devicemotionevent', 'DeviceOrientationEvent', 'hashchangeevent', 'MessageEvent', 'StorageEvent',
    'SVGEvents', 'errorevent', 'wheelevent', 'pointerevent', 'inputevent', 'textevent', 'dragevent', 'toString'].map((name) => {
    try {
      const e = d.createEvent(name);
      return [Object.prototype.toString.call(e), e.type, e.bubbles, e.cancelable, throws(() => d.body.dispatchEvent(e))];
    } catch (err) { return err.name; }
  });
});

parity('StorageEvent init', (w) => {
  const e = new w.StorageEvent('storage', { key: 'k', newValue: 'n' });
  const legacy = w.document.createEvent('StorageEvent');
  legacy.initStorageEvent('s', true, true, 'a', null, 'c', 'http://x/', null);
  return [e.key, e.oldValue, e.newValue, e.url, e.storageArea, legacy.type, legacy.bubbles, legacy.key, legacy.oldValue, legacy.url];
});

parity('innerHTML and outerHTML queue one mutation record; classList and class name whitespace', async (w) => {
  const d = w.document;
  const root = d.body.appendChild(d.createElement('div'));
  root.innerHTML = '<a></a><b></b>';
  const records = [];
  const observer = new w.MutationObserver((list) => { for (const r of list) records.push([r.addedNodes.length, r.removedNodes.length]); });
  observer.observe(root, { childList: true });
  root.innerHTML = '<i></i><u></u><s></s>';
  root.firstChild.outerHTML = '<em></em><strong></strong>';
  await new Promise((r) => setTimeout(r, 0));
  const p = d.createElement('p');
  p.classList.remove('a');
  const noAttribute = p.getAttribute('class');
  p.classList.toggle('b', false);
  const span = d.body.appendChild(d.createElement('span'));
  span.className = ' ';
  return [records, noAttribute, p.getAttribute('class'), throws(() => p.classList.replace(' ', '')),
    d.getElementsByClassName(' ').length, d.getElementsByClassName('\u000b').length];
});

parity('listener options: non-object capture values, a null signal, options read before the callback check', (w) => {
  const d = w.document;
  const div = d.body.appendChild(d.createElement('div'));
  const child = div.appendChild(d.createElement('span'));
  const phases = [];
  for (const options of [2.3, 0, 'x', '', null, undefined, { capture: 2 }]) {
    const listener = (e) => phases.push(e.eventPhase);
    div.addEventListener('t', listener, options);
    child.dispatchEvent(new w.Event('t', { bubbles: true }));
    div.removeEventListener('t', listener, options);
  }
  let read = 0;
  d.addEventListener('t', null, { get capture() { read++; return false; } });
  d.removeEventListener('t', null, { get capture() { read++; return false; }, get signal() { read += 10; return null; } });
  return [phases, read, throws(() => d.addEventListener('t', () => {}, { signal: null })), throws(() => d.addEventListener('t', null, { signal: null }))];
});

parity('CharacterData arguments, attributes adopted with setAttributeNode, prefixes from createDocument', (w) => {
  const d = w.document;
  const text = d.createTextNode('abc');
  const other = d.implementation.createHTMLDocument('');
  const attr = other.createAttribute('x');
  const el = d.createElement('p');
  el.setAttributeNode(attr);
  const xml = d.implementation.createDocument('urn:x', 'f:root', null);
  return [throws(() => text.appendData()), throws(() => text.substringData(1)), attr.ownerDocument === d,
    xml.documentElement.prefix, xml.documentElement.tagName];
});

parity('@@unscopables of Element, Document, DocumentFragment, CharacterData and DocumentType', (w) => ['Element', 'Document', 'DocumentFragment', 'CharacterData', 'DocumentType', 'Node'].map((name) => {
  const d = Object.getOwnPropertyDescriptor(w[name].prototype, Symbol.unscopables);
  return d === undefined ? null : [Object.keys(d.value).sort().join(), d.writable, d.enumerable, d.configurable, Object.getPrototypeOf(d.value)];
}));

parity('MutationObserver records carry the attribute local name and namespace', async (w) => {
  const d = w.document;
  const el = d.createElement('p');
  const out = [];
  const observer = new w.MutationObserver((list) => { for (const r of list) out.push([r.attributeName, r.attributeNamespace, r.oldValue]); });
  observer.observe(el, { attributes: true, attributeOldValue: true });
  el.setAttributeNS('urn:x', 'x:lang', 'a');
  el.setAttributeNS('urn:x', 'y:lang', 'b');
  el.removeAttributeNS('urn:x', 'lang');
  el.setAttribute('plain', '1');
  await new Promise((r) => setTimeout(r, 0));
  return out;
});

// jsdom lets a namespaced attribute through an attributeFilter.
test('MutationObserver: an attributeFilter matches attributes without a namespace only (DOM standard)', async () => {
  const w = createWindow();
  const el = w.document.createElement('p');
  const out = [];
  const observer = new w.MutationObserver((list) => { for (const r of list) out.push([r.attributeName, r.attributeNamespace]); });
  observer.observe(el, { attributeFilter: ['lang'] });
  el.setAttributeNS('urn:x', 'x:lang', 'c');
  el.setAttribute('lang', 'd');
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(out, [['lang', null]]);
});

// jsdom has no transient registered observers and notifies in another order.
test('MutationObserver: transient registered observers and notification order (DOM standard)', async () => {
  const w = createWindow();
  const d = w.document;
  const parent = d.createElement('div');
  const child = parent.appendChild(d.createElement('section'));
  const order = [];
  const records = [];
  const first = new w.MutationObserver((list) => { order.push('first'); for (const r of list) records.push(`${r.target.localName} ${r.type}`); });
  const second = new w.MutationObserver(() => order.push('second'));
  first.observe(parent, { childList: true, subtree: true, attributes: true });
  second.observe(parent, { attributes: true, subtree: true });
  child.remove();
  child.setAttribute('data-x', '');
  child.append(d.createElement('i'));
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(order, ['first', 'second']);
  assert.deepEqual(records, ['div childList', 'section attributes', 'section childList']);
  // After notification the removed subtree is no longer observed.
  child.setAttribute('data-y', '');
  assert.deepEqual(first.takeRecords(), []);
});

// The @@unscopables object's own properties are ordinary writable data
// properties (WebIDL), and each window has its own object.
parity('@@unscopables entries are writable', (w) => ['Element', 'DocumentFragment', 'CharacterData', 'DocumentType'].map((name) => {
  const u = w[name].prototype[Symbol.unscopables];
  const d = Object.getOwnPropertyDescriptor(u, 'remove') ?? Object.getOwnPropertyDescriptor(u, 'append');
  return [d.value, d.writable, d.enumerable, d.configurable, Object.isFrozen(u)];
}));

// Operation lengths count the arguments before the first optional one
// (WebIDL), as jsdom's do.
parity('operation lengths', (w) => {
  const d = w.document;
  const P = (name) => w[name].prototype;
  return [P('AbortController').abort, w.AbortSignal.abort, P('DOMTokenList').toggle, P('DOMTokenList').supports,
    P('CustomElementRegistry').define, P('CustomEvent').initCustomEvent, P('MessageEvent').initMessageEvent,
    P('HTMLInputElement').setSelectionRange, P('HTMLInputElement').setRangeText, P('HTMLTextAreaElement').setRangeText,
    P('HTMLSelectElement').add, P('Node').getRootNode, P('Document').createTreeWalker, P('Document').createNodeIterator,
    P('DOMImplementation').createHTMLDocument, P('Element').toggleAttribute, P('HTMLSlotElement').assignedNodes,
    P('HTMLSlotElement').assignedElements, P('HTMLMediaElement').canPlayType, P('History').pushState,
    P('History').replaceState, P('MutationObserver').observe, d.createElement('select').options.add].map((f) => f.length);
});
