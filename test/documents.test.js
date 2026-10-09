// Documents, DOMImplementation, screen and canvas, checked against jsdom.
import { parity, html } from './parity.js';

parity('the window document: doctype, title, character set', (w) => {
  const d = w.document;
  const out = [d.doctype.name, d.doctype.publicId, d.doctype.nodeName, d.doctype.nodeType, d.childNodes.length, d.firstChild === d.doctype,
    d.doctype.textContent, d.title, d.characterSet, d.contentType, d.URL, d.defaultView === w, d.doctype.constructor.name];
  d.title = '  My   page ';
  out.push(d.title, d.head.innerHTML);
  d.title = 'Again';
  out.push(d.head.querySelectorAll('title').length, d.title);
  const copy = d.doctype.cloneNode();
  out.push(copy.name, copy === d.doctype, d.body === d.documentElement.lastChild);
  return out;
});

parity('createHTMLDocument: a document without a window', (w) => {
  const doc = w.document.implementation.createHTMLDocument('T');
  const out = [doc.defaultView, doc.URL, doc.title, doc.doctype.name, doc.childNodes.length, doc.head.firstChild.tagName, doc.body.tagName,
    doc.location, doc.contentType, doc instanceof w.Document, doc.constructor.name, doc.documentElement.outerHTML];
  const el = doc.createElement('DIV');
  el.innerHTML = '<span id="s">x</span>';
  doc.body.appendChild(el);
  out.push(el.ownerDocument === doc, el.firstChild.ownerDocument === doc, doc.getElementById('s') !== null, w.document.getElementById('s'));
  w.document.body.appendChild(el);
  out.push('adopted on insert', el.ownerDocument === w.document, el.firstChild.ownerDocument === w.document, w.document.getElementById('s') !== null, doc.getElementById('s'));
  const noTitle = w.document.implementation.createHTMLDocument();
  out.push(noTitle.title, noTitle.head.childNodes.length);
  const log = [];
  doc.addEventListener('click', () => log.push('doc'));
  doc.body.dispatchEvent(new w.Event('click', { bubbles: true }));
  out.push(log);
  return out;
});

parity('createDocument, new Document, importNode, adoptNode', (w) => {
  const d = w.document;
  const x = d.implementation.createDocument(null, 'root', null);
  const out = [x.contentType, x.documentElement.tagName, x.createElement('Foo').tagName, x.createElement('Foo').namespaceURI, x.body, x.constructor.name];
  const svg = d.implementation.createDocument('http://www.w3.org/2000/svg', 'svg', d.implementation.createDocumentType('svg', 'pub', 'sys'));
  out.push(svg.contentType, svg.doctype.name, svg.doctype.publicId, svg.documentElement.namespaceURI);
  const nd = new w.Document();
  out.push(nd.contentType, nd.childNodes.length, nd.URL, nd.defaultView, nd.title);
  const el = html(w, '<p id="p">a<b>b</b></p>').getElementById('p');
  const imported = x.importNode(el, true);
  // (outerHTML in XML documents uses the XML serializer: not implemented yet)
  out.push(imported.ownerDocument === x, imported.firstChild.ownerDocument === x, imported.tagName, el.parentNode === d.body);
  const adopted = x.adoptNode(el);
  out.push(adopted === el, el.parentNode, el.ownerDocument === x);
  let threw = null;
  try { d.adoptNode(x); } catch (e) { threw = e.name; }
  out.push(threw, d.implementation.hasFeature());
  return out;
});

parity('screen and canvas', (w) => {
  const s = w.screen;
  const out = [s.width, s.height, s.availWidth, s.availHeight, s.colorDepth, s.pixelDepth, s.orientation, s === w.screen, s instanceof w.Screen];
  const canvas = w.document.createElement('canvas');
  out.push(canvas.width, canvas.height, canvas.getContext('2d'), canvas.toDataURL());
  return out;
});

parity('document collections and currentScript', (w) => {
  const d = html(w, '<form id="f1"></form><img id="i"><a id="l" href="#">x</a><a name="n" id="n">y</a><area href="#" id="ar"><embed id="e"><form id="f2"></form>');
  const names = (c) => [...c].map((el) => el.id);
  const out = [d.currentScript, names(d.forms), names(d.images), names(d.links), names(d.anchors), names(d.embeds), d.plugins.length, d.scripts.length, d.forms === d.forms];
  d.body.appendChild(d.createElement('form')).id = 'f3';
  out.push(names(d.forms), d.forms.f1?.id ?? null);
  return out;
});
