import { parity } from './parity.js';

parity('XMLSerializer: elements, namespaces, text and documents', (w) => {
  const d = w.document;
  const s = new w.XMLSerializer();
  const host = d.createElement('div');
  host.innerHTML =
    '<p class="a&quot;b" title="<x>">t &amp; &lt;u&gt;<br><img src="x"></p><!--c--><template><b>in</b></template>' +
    '<svg viewBox="0 0 1 1"><use xlink:href="#i"></use><g><circle r="1"></circle></g></svg><input disabled>';
  const pref = d.createElementNS('http://example.com/ns', 'ex:thing');
  pref.setAttributeNS('http://example.com/other', 'o:attr', '1');
  pref.setAttributeNS('http://www.w3.org/2000/xmlns/', 'xmlns:ex', 'http://example.com/ns');
  pref.appendChild(d.createElementNS('http://example.com/ns', 'ex:child'));
  pref.appendChild(d.createElementNS(null, 'plain'));
  const noNs = d.createElementNS(null, 'root');
  noNs.appendChild(d.createElementNS('http://www.w3.org/1999/xhtml', 'span'));
  const frag = d.createDocumentFragment();
  frag.append('x', d.createElement('i'), d.createComment('y'));
  const parsed = new w.DOMParser().parseFromString(
    '<!doctype html><html><head><title>T</title></head><body><div id=a>1</div></body></html>',
    'text/html',
  );
  return [
    s.serializeToString(host),
    ...[...host.childNodes].map((n) => s.serializeToString(n)),
    s.serializeToString(pref),
    s.serializeToString(noNs),
    s.serializeToString(frag),
    s.serializeToString(d.createTextNode('a<b>&"')),
    s.serializeToString(d.createComment('--x')),
    s.serializeToString(d.doctype),
    s.serializeToString(parsed),
  ];
});

parity('DOMParser: text/html documents', (w) => {
  const doc = new w.DOMParser().parseFromString(
    '<div class="root"><span>v</span><input class="f"><span hidden tabindex="0">h</span></div>',
    'text/html',
  );
  let error = null;
  try {
    new w.DOMParser().parseFromString('x', 'text/plain');
  } catch (e) {
    error = [e.constructor.name, e.message];
  }
  return {
    shape: [
      doc.constructor.name,
      doc.contentType,
      doc.doctype,
      doc.documentElement.outerHTML,
      doc.children.length,
      doc.body.children.length,
    ],
    query: [
      doc.querySelector('.f').tagName,
      doc.querySelector('[hidden]').tabIndex,
      doc.body.firstChild.ownerDocument === doc,
      doc === w.document,
    ],
    url: doc.URL,
    defaultView: doc.defaultView,
    error,
  };
});

parity('XMLSerializer: void elements with children, tabs and line breaks in attribute values', (w) => {
  const d = w.document;
  const s = new w.XMLSerializer();
  const img = d.createElement('img');
  img.append(d.createElement('style'), d.createElement('style'));
  const root = d.createElementNS(null, 'root');
  root.setAttribute('a', '\t\n\r<>&"x');
  const roundTrip = new w.DOMParser()
    .parseFromString(s.serializeToString(root), 'text/xml')
    .documentElement.getAttribute('a');
  return [
    s.serializeToString(img),
    s.serializeToString(d.createElement('br')),
    s.serializeToString(root),
    roundTrip,
    s.serializeToString(d.createTextNode('\t\n\r<>&"')),
  ];
});
