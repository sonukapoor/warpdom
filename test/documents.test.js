// Documents, DOMImplementation, screen and canvas, checked against jsdom.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWindow } from '../src/node.js';
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

parity('document.body setter: replace, append, errors', (w) => {
  const d = w.document;
  const out = [];
  const err = (f) => { try { f(); return 'ok'; } catch (e) { return e.name; } };
  out.push(err(() => { d.body = 'text'; }), err(() => { d.body = d.createElement('div'); }), err(() => { d.body = null; }), d.body.tagName);
  const doc = d.implementation.createHTMLDocument('');
  const fresh = doc.createElement('body');
  fresh.id = 'fresh';
  doc.body = fresh;
  out.push(doc.body === fresh, doc.documentElement.children.length);
  const frameset = doc.createElement('frameset');
  doc.body = frameset;
  out.push(doc.body === frameset, fresh.parentNode, doc.documentElement.innerHTML);
  doc.body = frameset;
  out.push(doc.documentElement.children.length);
  doc.removeChild(doc.documentElement);
  out.push(err(() => { doc.body = doc.createElement('body'); }));
  const root = doc.appendChild(doc.createElementNS('http://example.org/test', 'test'));
  const body = doc.createElement('body');
  doc.body = body;
  out.push(body.parentNode === root, doc.body);
  return out;
});

parity('document.title: ASCII whitespace only, SVG and XML documents', (w) => {
  const d = w.document;
  const out = [];
  d.title = '  a \u000b b\t\n c 　';
  out.push(JSON.stringify(d.title));
  const svg = d.implementation.createDocument('http://www.w3.org/2000/svg', 'svg', null);
  out.push(svg.title);
  svg.documentElement.appendChild(svg.createElementNS('http://www.w3.org/2000/svg', 'g'));
  svg.title = 'foo';
  out.push(svg.documentElement.firstChild.localName, svg.documentElement.firstChild.namespaceURI, svg.title);
  svg.title = '';
  out.push(svg.documentElement.firstChild.childNodes.length, svg.title);
  const xml = d.implementation.createDocument(null, 'foo', null);
  xml.documentElement.appendChild(d.createElementNS('http://www.w3.org/1999/xhtml', 'html:title'));
  xml.title = 'fail';
  out.push(xml.title, xml.documentElement.firstChild.childNodes.length);
  return out;
});

parity('document.getElementsByName: live NodeList of HTML elements', (w) => {
  const d = html(w, '<input name="a"><div name="a"></div><span name="A"></span><embed name="a">');
  const list = d.getElementsByName('a');
  const out = [Object.prototype.toString.call(list), list instanceof w.NodeList, list.length, [...list].map((e) => e.tagName)];
  const meta = d.createElement('meta');
  meta.setAttribute('name', 'a');
  d.body.prepend(meta);
  out.push(list.length, list[0].tagName, d.getElementsByName(null).length, d.getElementsByName(undefined).length);
  d.body.lastChild.remove();
  out.push(list.length);
  return out;
});

parity('document named properties: forms, images, embeds, objects, iframes', (w) => {
  const d = html(w, '<form name="f1"></form><img name="i1" id="i2"><img id="plain"><embed name="e1"><object id="o1"></object>'
    + '<form name="two"></form><img name="two"><div id="d1"></div><form name="body"></form>');
  // jsdom's document also has location as an own (unforgeable) property.
  const out = [Object.keys(d).filter((k) => k !== 'location').sort(), d.f1.tagName, d.i1 === d.i2, 'plain' in d, 'd1' in d, d.e1.tagName, d.o1.tagName];
  const two = d.two;
  out.push(Object.prototype.toString.call(two), two.length, d.two === two, d.body.tagName, typeof d.getElementById);
  // Removed, renamed, moved back: the names follow the tree.
  const form = d.querySelector('form[name=f1]');
  form.remove();
  out.push('f1' in d, d.f1);
  d.documentElement.appendChild(form);
  form.name = 'renamed';
  out.push('f1' in d, d.renamed === form);
  d.querySelector('img[name=i1]').removeAttribute('name');
  out.push('i1' in d, 'i2' in d);
  d.querySelector('form[name=body]').remove();
  out.push(d.body.tagName);
  // Expandos and assignments.
  d.expando = 1;
  const img = d.createElement('img');
  img.name = 'expando';
  d.documentElement.appendChild(img);
  out.push(d.expando);
  out.push((() => { try { d.renamed = 5; return 'ok'; } catch (e) { return e.name; } })(), d.renamed === form);
  return out;
});

parity('document named properties: iframes, shadow trees, adoption', (w) => {
  const d = html(w, '<iframe name="frame"></iframe><div id="host"></div>');
  const out = [d.frame === d.querySelector('iframe').contentWindow];
  const shadow = d.getElementById('host').attachShadow({ mode: 'open' });
  const form = d.createElement('form');
  form.name = 'inShadow';
  shadow.append(form);
  out.push('inShadow' in d);
  d.body.append(form);
  out.push(d.inShadow === form);
  const other = d.implementation.createHTMLDocument('');
  other.body.append(form);
  out.push('inShadow' in d, other.inShadow === form);
  const objects = [d.createElement('object'), d.createElement('object')];
  for (const o of objects) { o.id = 'pair'; d.body.append(o); }
  const pair = d.pair;
  d.body.prepend(objects[1]);
  out.push(d.pair === pair, [...pair].indexOf(objects[1]));
  return out;
});

// Deliberate deviation (PLAN.md): only HTML elements, as the HTML standard
// says; jsdom also returns elements in other namespaces.
test('document.getElementsByName: elements in other namespaces do not match', () => {
  const d = createWindow().document;
  d.body.innerHTML = '<div name="n"></div><svg name="n"><circle name="n"/></svg>';
  const other = d.createElementNS('http://example.org/test', 'x');
  other.setAttribute('name', 'n');
  d.body.append(other);
  assert.deepEqual([...d.getElementsByName('n')].map((e) => e.localName), ['div']);
});

parity('document named properties: none before jsdom 30', (w) => {
  const d = html(w, '<form name="f"></form><form name="title"></form><img name="i">');
  return [typeof d.f, 'i' in d, d.title, Object.keys(d).filter((k) => k !== 'location')];
}, { jsdom: 26 });
// Obsolete and resource metadata members jsdom has: applets is always
// empty, the legacy methods do nothing, no referrer, and lastModified is
// the current local time (no source file's time is known).
for (const jsdom of [26, 30]) {
  parity(`document.applets, clear, captureEvents, referrer, lastModified (jsdom ${jsdom})`, (w) => {
    const d = html(w, '<applet name=war></applet><a name=x></a>');
    const created = d.implementation.createHTMLDocument('');
    const near = (s) => {
      const m = /^(\d\d)\/(\d\d)\/(\d{4}) (\d\d):(\d\d):(\d\d)$/.exec(s);
      if (!m) return s;
      const t = new Date(+m[3], m[1] - 1, +m[2], +m[4], +m[5], +m[6]).getTime();
      return Math.abs(Date.now() - t) < 5000;
    };
    return [d.applets.length, d.applets instanceof w.HTMLCollection, d.applets === d.applets,
      d.clear(), d.captureEvents(), d.releaseEvents(), d.referrer, created.referrer,
      near(d.lastModified), near(created.lastModified)];
  }, { jsdom });
}

parity('document.dir reflects the html element\'s dir', (w) => {
  const d = w.document;
  const out = [d.dir];
  d.documentElement.setAttribute('dir', 'RTL');
  out.push(d.dir);
  d.dir = 'bogus';
  out.push(d.dir, d.documentElement.getAttribute('dir'));
  const created = d.implementation.createHTMLDocument('');
  created.documentElement.remove();
  created.dir = 'rtl';
  out.push(created.dir);
  return out;
});

// The body element's colors (obsolete; jsdom lacks them).
test('document.fgColor, linkColor, vlinkColor, alinkColor, bgColor', () => {
  const d = createWindow().document;
  d.body.setAttribute('text', 'red');
  d.linkColor = 'blue';
  d.bgColor = null;
  assert.deepEqual([d.fgColor, d.body.getAttribute('link'), d.body.getAttribute('bgcolor')], ['red', 'blue', '']);
  d.body.replaceWith(d.createElement('frameset'));
  d.vlinkColor = 'green';
  assert.deepEqual([d.fgColor, d.vlinkColor, d.body.hasAttribute('vlink')], ['', '', false]);
});
