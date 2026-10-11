// XML: CDATASection and ProcessingInstruction nodes, XML parsing
// (DOMParser, innerHTML in XML documents) and XML serialization.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWindow } from '../src/node.js';
import { parity } from './parity.js';

const describe = (n) => [n.constructor.name, n.nodeType, n.nodeName, n.nodeValue, n.textContent, n.data, n.target, n.length];
const errorOf = (fn) => { try { fn(); return null; } catch (e) { return [e.name, e.constructor.name]; } };

parity('createCDATASection and createProcessingInstruction', (w) => {
  const html = w.document;
  const xml = html.implementation.createDocument(null, 'root', null);
  const cdata = xml.createCDATASection('a <b> & c');
  const pi = xml.createProcessingInstruction('xml-stylesheet', 'href="s.css"');
  const htmlPi = html.createProcessingInstruction('t', 'd');
  return {
    nodes: [describe(cdata), describe(pi), describe(htmlPi)],
    chain: [cdata instanceof w.Text, cdata instanceof w.CharacterData, pi instanceof w.CharacterData, pi instanceof w.Text,
      Object.getPrototypeOf(w.CDATASection.prototype) === w.Text.prototype,
      Object.getPrototypeOf(w.ProcessingInstruction.prototype) === w.CharacterData.prototype],
    errors: [
      errorOf(() => html.createCDATASection('x')),
      errorOf(() => xml.createCDATASection('a]]>b')),
      errorOf(() => xml.createProcessingInstruction('1a', 'x')),
      errorOf(() => xml.createProcessingInstruction('a', 'x?>')),
      errorOf(() => xml.createProcessingInstruction('a b', 'x')),
      errorOf(() => new w.CDATASection()),
      errorOf(() => new w.ProcessingInstruction()),
    ],
    allowed: ['xml', 'a:b', 'a.b-c', '_x'].map((t) => xml.createProcessingInstruction(t, '').target),
  };
});

// jsdom stops wholeText at CDATA sections, which are Text nodes (DOM).
test('wholeText includes adjacent CDATA sections', () => {
  const w = createWindow();
  const xml = w.document.implementation.createDocument(null, 'root', null);
  const root = xml.documentElement;
  root.append(xml.createTextNode('a'), xml.createCDATASection('b'), xml.createTextNode('c'), xml.createComment('x'), xml.createTextNode('d'));
  assert.equal(root.firstChild.wholeText, 'abc');
  assert.equal(root.lastChild.wholeText, 'd');
});

parity('CDATA sections and processing instructions as character data', (w) => {
  const xml = w.document.implementation.createDocument(null, 'root', null);
  const root = xml.documentElement;
  const cdata = xml.createCDATASection('one');
  const pi = xml.createProcessingInstruction('p', 'data');
  root.append(xml.createTextNode('a'), cdata, xml.createTextNode('b'), pi, xml.createComment('c'));
  cdata.appendData('+');
  pi.data = 'changed';
  pi.nodeValue = 'again';
  const textNode = root.firstChild;
  const clones = [cdata.cloneNode(), pi.cloneNode(true)].map(describe);
  const deep = root.cloneNode(true);
  const imported = w.document.importNode(cdata);
  pi.textContent = 'via textContent';
  return {
    textContent: root.textContent,
    wholeText: cdata.wholeText,
    clones,
    deep: [...deep.childNodes].map(describe),
    imported: [describe(imported), imported.ownerDocument === w.document],
    pi: describe(pi),
    siblings: [cdata.previousSibling === textNode, cdata.nextElementSibling, pi.previousElementSibling],
    substring: cdata.substringData(1, 2),
  };
});

parity('TreeWalker and NodeIterator show CDATA sections and processing instructions by their bits', (w) => {
  const xml = new w.DOMParser().parseFromString('<?a 1?><r><![CDATA[c]]>t<?b 2?><!--k--><e/></r>', 'text/xml');
  const names = (show) => {
    const out = [];
    const it = xml.createNodeIterator(xml, show);
    for (let n = it.nextNode(); n; n = it.nextNode()) out.push(n.nodeName);
    const walker = xml.createTreeWalker(xml, show);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) out.push(`w:${n.nodeName}`);
    return out;
  };
  const F = w.NodeFilter;
  return [names(F.SHOW_CDATA_SECTION), names(F.SHOW_PROCESSING_INSTRUCTION), names(F.SHOW_TEXT), names(F.SHOW_ALL)];
});

parity('XMLSerializer and innerHTML with CDATA sections and processing instructions', (w) => {
  const xml = w.document.implementation.createDocument(null, 'root', null);
  const s = new w.XMLSerializer();
  const root = xml.documentElement;
  root.append(xml.createCDATASection('<x> & y'), xml.createProcessingInstruction('t', 'd'), xml.createTextNode('<z>'));
  const div = w.document.createElement('div');
  div.append(w.document.importNode(xml.createCDATASection('<c> & d')));
  return [s.serializeToString(root), root.innerHTML, root.outerHTML, s.serializeToString(xml), div.innerHTML, s.serializeToString(div)];
});

parity('Element prefixes from createElementNS', (w) => {
  const d = w.document;
  const xml = d.implementation.createDocument(null, 'root', null);
  const els = [
    d.createElementNS('urn:x', 'p:Thing'),
    d.createElementNS('http://www.w3.org/1999/xhtml', 'h:div'),
    d.createElementNS('http://www.w3.org/2000/svg', 's:rect'),
    xml.createElementNS('http://www.w3.org/1999/xhtml', 'h:div'),
    d.createElementNS('urn:x', 'plain'),
  ];
  return els.map((e) => [e.prefix, e.localName, e.tagName, e.nodeName, e.namespaceURI, e.cloneNode().tagName, e.namespaceURI === 'urn:x' ? e.outerHTML : null]);
});

// jsdom serializes the prefix of HTML and SVG elements too.
test('HTML serialization keeps prefixes only outside the HTML, SVG and MathML namespaces', () => {
  const w = createWindow();
  const d = w.document;
  const div = d.createElement('div');
  div.append(d.createElementNS('http://www.w3.org/1999/xhtml', 'h:b'), d.createElementNS('http://www.w3.org/2000/svg', 's:rect'),
    d.createElementNS('http://www.w3.org/1998/Math/MathML', 'm:mi'), d.createElementNS('urn:x', 'p:Thing'));
  assert.equal(div.innerHTML, '<b></b><rect></rect><mi></mi><p:Thing></p:Thing>');
});

parity('DOMParser: XML documents', (w) => {
  const p = new w.DOMParser();
  const s = new w.XMLSerializer();
  const source = '<?xml version="1.0" encoding="UTF-8"?>\n<?xml-stylesheet href="a.css"?>\n<!DOCTYPE r SYSTEM "r.dtd">\n'
    + '<r xmlns="urn:default" xmlns:p="urn:p" p:a="1" b="2" id="top">\n  <p:c xml:lang="en">t &amp; &lt;&#65;&#x42;<![CDATA[<raw> & ]]><!--k--></p:c>\n'
    + '  <d xmlns=""><e p:f="x"/></d>\n  <tableColumn name="Age"/><tablecolumn name="lower"/>\n</r>\n<!--after-->';
  const doc = p.parseFromString(source, 'application/xml');
  const r = doc.documentElement;
  const c = r.querySelector('c');
  const e = doc.getElementsByTagName('e')[0];
  return {
    doc: [doc.constructor.name, doc instanceof w.XMLDocument, doc.contentType, doc.URL, doc.location, doc.defaultView, doc.characterSet],
    children: [...doc.childNodes].map((n) => [n.nodeType, n.nodeName, n.nodeValue]),
    doctype: [doc.doctype.name, doc.doctype.publicId, doc.doctype.systemId],
    root: [r.namespaceURI, r.prefix, r.localName, r.tagName, r.constructor.name],
    attributes: [...r.attributes].map((a) => [a.name, a.namespaceURI, a.prefix, a.localName, a.value]),
    c: [c.namespaceURI, c.prefix, c.tagName, c.getAttributeNS('http://www.w3.org/XML/1998/namespace', 'lang'), [...c.childNodes].map((n) => [n.nodeName, n.nodeValue])],
    e: [e.namespaceURI, e.parentNode.namespaceURI, e.getAttributeNS('urn:p', 'f')],
    queries: [doc.getElementById('top') === r, r.querySelectorAll('tableColumn').length, r.querySelector('tableColumn').getAttribute('name')],
    text: r.textContent,
    serialized: s.serializeToString(doc),
    types: ['text/xml', 'image/svg+xml', 'application/xhtml+xml'].map((t) => {
      const x = p.parseFromString('<svg xmlns="http://www.w3.org/2000/svg"><rect width="1"/><title>T</title></svg>', t);
      return [x.contentType, x.documentElement.constructor.name, x.documentElement.firstChild.constructor.name, x.querySelector('rect').getAttribute('width')];
    }),
  };
});

parity('DOMParser: XHTML documents', (w) => {
  const doc = new w.DOMParser().parseFromString('<html xmlns="http://www.w3.org/1999/xhtml"><head><title>T</title></head><body><p id="a" class="x">P<br/></p><Div/></body></html>', 'application/xhtml+xml');
  const p = doc.getElementById('a');
  return [doc.body?.localName, doc.title, p.constructor.name, p.tagName, p.className, doc.querySelector('.x') === p,
    doc.documentElement.lastChild.lastChild.tagName, doc.createElement('Span').namespaceURI, doc.createElement('Span').tagName,
    new w.XMLSerializer().serializeToString(p)];
});

parity('DOMParser: entities from the internal subset', (w) => {
  const doc = new w.DOMParser().parseFromString('<!DOCTYPE foo [ <!ENTITY x "y"> ]><foo a="&x;">&x;</foo>', 'text/xml');
  return [doc.doctype.name, doc.doctype.publicId, doc.doctype.systemId, doc.documentElement.textContent, doc.documentElement.getAttribute('a'),
    new w.XMLSerializer().serializeToString(doc)];
});

parity('DOMParser: documents that are not well-formed give a parsererror document', (w) => {
  const p = new w.DOMParser();
  const inputs = ['<a/><b/>', '<root><x></root>', '', 'text', '<a>&nbsp;</a>', '<a b="1" b="2"/>', '<p:a/>', '<a xmlns:p="u"><p:b/></a><c/>',
    '<a p:b="1"/>', '<a>\u0001</a>', '<a><!-- -- --></a>', '<xmlns:a xmlns:xmlns="u"/>', '<a xmlns:p=""/>', '<a xmlns:xml="urn:other"/>',
    '<a xmlns:p="u" xmlns:q="u" p:x="1" q:x="2"/>', '<a:b:c xmlns:a="u"/>', '<a><?p:q x?></a>'];
  return inputs.map((text) => {
    const doc = p.parseFromString(text, 'text/xml');
    const el = doc.documentElement;
    return [text, doc.childNodes.length, el.namespaceURI, el.localName, el.tagName, el.childNodes.length, el.firstChild?.nodeType,
      doc.getElementsByTagName('parsererror').length];
  });
});

// jsdom only reads double-quoted entity values and keeps character
// references in them unexpanded (XML 1.0 4.5 expands them).
test('DOMParser: entity values with character references and single quotes', () => {
  const w = createWindow();
  const doc = new w.DOMParser().parseFromString('<!DOCTYPE foo [ <!ENTITY z \'a&#65;&#x42;\'> <!ENTITY y "&z;!"> ]><foo>&y;</foo>', 'text/xml');
  assert.equal(doc.documentElement.textContent, 'aAB!');
});

test('DOMParser: the parsererror element reports where the error is', () => {
  const w = createWindow();
  const doc = new w.DOMParser().parseFromString('<root>\n  <x></root>', 'text/xml');
  assert.match(doc.documentElement.textContent, /^2:\d+: .+/);
});

test('DOMParser: lone surrogates become U+FFFD', () => {
  const w = createWindow();
  const doc = new w.DOMParser().parseFromString('<rss>\uD800 \uDC00 😀</rss>', 'text/xml');
  assert.equal(doc.documentElement.localName, 'rss');
  assert.equal(doc.documentElement.textContent, '� � 😀');
});

parity('innerHTML and outerHTML in XML documents', (w) => {
  const xml = w.document.implementation.createDocument('urn:d', 'root', null);
  const root = xml.documentElement;
  root.setAttributeNS('http://www.w3.org/2000/xmlns/', 'xmlns:p', 'urn:p');
  root.innerHTML = '<x a="1">y<![CDATA[<z>]]><?pi d?><p:q/><!--c--></x><w xmlns="urn:w"/>';
  const x = root.firstChild;
  const read = [root.innerHTML, root.outerHTML, x.namespaceURI, x.lastChild.previousSibling.namespaceURI, root.lastChild.namespaceURI,
    [...x.childNodes].map((n) => n.nodeName)];
  const errors = [errorOf(() => { root.innerHTML = '<x>'; }), errorOf(() => { root.innerHTML = '<q:x/>'; }), errorOf(() => { root.innerHTML = '&nbsp;'; })];
  x.outerHTML = '<o>1</o><o>2</o>';
  root.lastChild.insertAdjacentHTML('afterend', '<after/>');
  const svg = new w.DOMParser().parseFromString('<svg xmlns="http://www.w3.org/2000/svg"><g/></svg>', 'image/svg+xml');
  svg.documentElement.firstChild.innerHTML = '<circle r="1"/>';
  return { read, errors, after: root.innerHTML, svg: [svg.documentElement.firstChild.firstChild.namespaceURI, svg.documentElement.outerHTML], unchanged: root.childNodes.length };
});

parity('innerHTML in XML documents requires well-formed markup', (w) => {
  const xml = w.document.implementation.createDocument(null, 'root', null);
  const root = xml.documentElement;
  const read = (setup) => { while (root.firstChild) root.firstChild.remove(); setup(); return errorOf(() => root.innerHTML) ?? root.innerHTML; };
  return [
    read(() => root.append(xml.createComment('a--b'))),
    read(() => root.append(xml.createComment('a-'))),
    read(() => root.append(xml.createTextNode('\u0001'))),
    read(() => root.append(xml.createProcessingInstruction('xml', 'x'))),
    read(() => root.append(xml.createElement('ok'))),
    new w.XMLSerializer().serializeToString(root),
  ];
});

// HTML serializes a processing instruction as <?target data>; jsdom leaves
// it out.
test('HTML serialization of processing instructions and CDATA sections', () => {
  const w = createWindow();
  const d = w.document;
  const xml = d.implementation.createDocument(null, 'r', null);
  const div = d.createElement('div');
  div.append(d.createProcessingInstruction('t', 'a b'), d.importNode(xml.createCDATASection('<c>')));
  const style = d.createElement('style');
  style.append(d.importNode(xml.createCDATASection('a > b')));
  div.append(style);
  assert.equal(div.innerHTML, '<?t a b>&lt;c&gt;<style>a > b</style>');
});

parity('getElementsByTagName matches qualified names', (w) => {
  const d = w.document;
  const xml = new w.DOMParser().parseFromString('<r xmlns:a="urn:a"><abc/><Abc/><a:abc/><a:Abc/><x xmlns="http://www.w3.org/1999/xhtml"><ABC/></x></r>', 'text/xml');
  const host = d.createElement('div');
  host.append(d.createElement('abc'), d.createElementNS('urn:a', 'a:abc'), d.createElementNS('urn:a', 'Abc'), d.createElementNS('http://www.w3.org/1999/xhtml', 'h:abc'));
  const names = (list) => [...list].map((e) => e.nodeName);
  return [
    ...['abc', 'Abc', 'ABC', 'a:abc', 'a:Abc', '*'].map((n) => names(xml.getElementsByTagName(n))),
    ...['abc', 'Abc', 'ABC', 'a:abc', 'h:abc', 'H:ABC'].map((n) => names(host.getElementsByTagName(n))),
  ];
});
