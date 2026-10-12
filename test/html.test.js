import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWindow } from '../src/node.js';
import { parity } from './parity.js';

test('outerHTML and innerHTML serialize the tree', () => {
  const { document } = createWindow();
  const div = document.createElement('div');
  div.setAttribute('id', 'main');
  div.setAttribute('title', 'a "quote" & more ');
  div.appendChild(document.createTextNode('1 < 2 & 3 > 2 '));
  div.appendChild(document.createElement('br'));
  div.appendChild(document.createComment(' note '));
  const span = div.appendChild(document.createElement('span'));
  span.textContent = 'x';
  assert.equal(div.outerHTML,
    '<div id="main" title="a &quot;quote&quot; &amp; more&nbsp;">1 &lt; 2 &amp; 3 &gt; 2&nbsp;<br><!-- note --><span>x</span></div>');
  assert.equal(div.innerHTML, '1 &lt; 2 &amp; 3 &gt; 2&nbsp;<br><!-- note --><span>x</span>');
  assert.ok('outerHTML' in div); // Testing Library's prettyDOM checks this
});

test('raw text elements, void elements and SVG keep their form', () => {
  const { document } = createWindow();
  const script = document.createElement('script');
  script.textContent = 'if (a < b && c) {}';
  assert.equal(script.outerHTML, '<script>if (a < b && c) {}</script>');
  const input = document.createElement('input');
  input.setAttribute('type', 'text');
  assert.equal(input.outerHTML, '<input type="text">');
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.appendChild(document.createElementNS('http://www.w3.org/2000/svg', 'linearGradient'));
  assert.equal(svg.outerHTML, '<svg><linearGradient></linearGradient></svg>');
});

test('setting innerHTML parses HTML into real nodes', () => {
  const w = createWindow();
  const { document } = w;
  const host = document.body.appendChild(document.createElement('div'));
  host.innerHTML = '<ul class="list"><li id="first">One &amp; <b>two</b></li><li>Three</li></ul><!--c-->text';
  const ul = host.firstChild;
  assert.ok(ul instanceof w.HTMLUListElement);
  assert.equal(ul.getAttribute('class'), 'list');
  assert.equal(ul.children.length, 2);
  assert.equal(document.getElementById('first').textContent, 'One & two', 'parsed ids are indexed');
  assert.equal(host.childNodes[1].nodeType, 8);
  assert.equal(host.lastChild.nodeValue, 'text');
  assert.equal(host.innerHTML, '<ul class="list"><li id="first">One &amp; <b>two</b></li><li>Three</li></ul><!--c-->text');
  host.innerHTML = '';
  assert.equal(host.childNodes.length, 0);
});

test('parsing uses the element as context (table rows, select options)', () => {
  const { document } = createWindow();
  const row = document.createElement('tr');
  row.innerHTML = '<td>a</td><td>b</td>';
  assert.equal(row.children.length, 2);
  assert.equal(row.firstChild.tagName, 'TD');
  const select = document.createElement('select');
  select.innerHTML = '<option value="1">One</option>';
  assert.equal(select.firstChild.tagName, 'OPTION');
});

test('SVG inside HTML is parsed into the SVG namespace', () => {
  const w = createWindow();
  const div = w.document.createElement('div');
  div.innerHTML = '<svg viewBox="0 0 10 10"><path d="M0 0"></path></svg>';
  const svg = div.firstChild;
  assert.equal(svg.namespaceURI, 'http://www.w3.org/2000/svg');
  assert.ok(svg instanceof w.SVGSVGElement);
  assert.equal(svg.firstChild.namespaceURI, 'http://www.w3.org/2000/svg');
  assert.equal(svg.getAttribute('viewBox'), '0 0 10 10');
});

test('outerHTML setter and insertAdjacentHTML', () => {
  const { document } = createWindow();
  const parent = document.body.appendChild(document.createElement('div'));
  const target = parent.appendChild(document.createElement('p'));
  target.insertAdjacentHTML('beforebegin', '<i>1</i>');
  target.insertAdjacentHTML('afterbegin', '<b>2</b>');
  target.insertAdjacentHTML('beforeend', '<u>3</u>');
  target.insertAdjacentHTML('afterend', '<s>4</s>');
  assert.equal(parent.innerHTML, '<i>1</i><p><b>2</b><u>3</u></p><s>4</s>');
  target.outerHTML = '<em>new</em><strong>!</strong>';
  assert.equal(parent.innerHTML, '<i>1</i><em>new</em><strong>!</strong><s>4</s>');
  assert.equal(target.parentNode, null);
});

test('template content is a separate fragment', () => {
  const w = createWindow();
  const template = w.document.createElement('template');
  template.innerHTML = '<p>inside</p>';
  assert.ok(template.content instanceof w.DocumentFragment);
  assert.equal(template.childNodes.length, 0);
  assert.equal(template.content.firstChild.tagName, 'P');
  assert.equal(template.innerHTML, '<p>inside</p>');
  assert.equal(template.outerHTML, '<template><p>inside</p></template>');
  const host = w.document.createElement('div');
  host.innerHTML = '<template><b>x</b></template>';
  assert.equal(host.firstChild.content.firstChild.tagName, 'B');
});

import { parity as htmlParity } from './parity.js';

htmlParity('cloning a template copies its contents when deep', (w) => {
  const t = w.document.createElement('template');
  t.innerHTML = '<p id="a">x</p><b>y</b>';
  const deep = t.cloneNode(true);
  const shallow = t.cloneNode(false);
  return [deep.content.childNodes.length, deep.content.firstElementChild.id, deep.content.firstChild !== t.content.firstChild, shallow.content.childNodes.length, deep.innerHTML];
});

htmlParity('hyperlinks: URL members of <a> and <area>', (w) => {
  const d = w.document;
  const read = (el) => ['href', 'origin', 'protocol', 'username', 'password', 'host', 'hostname', 'port', 'pathname', 'search', 'hash']
    .map((k) => el[k]).concat(String(el));
  const a = (href) => { const el = d.createElement('a'); if (href !== undefined) el.setAttribute('href', href); return el; };
  const out = {};
  for (const href of [undefined, '', '#', '#x', '/p?q=1#h', 'other', 'https://u:p@example.com:8080/a/b?c#d', 'mailto:me@example.com',
    'http://[bad', 'javascript:void(0)', 'file:///tmp/x']) out[String(href)] = read(a(href));
  const set = a('https://example.com/a?b#c');
  set.protocol = 'http';
  set.username = 'me';
  set.password = 'pw';
  set.host = 'other.org:81';
  set.hostname = 'third.org';
  set.port = '82';
  set.pathname = 'x/y';
  set.search = 'k=v';
  set.hash = 'top';
  out.set = [set.getAttribute('href'), ...read(set)];
  const mail = a('mailto:me@example.com');
  mail.host = 'nope';
  mail.pathname = 'nope';
  mail.username = 'nope';
  out.opaque = [mail.getAttribute('href')];
  const none = a();
  none.search = 'x';
  none.href = '/new';
  out.none = [none.getAttribute('href'), none.href];
  const area = d.createElement('area');
  area.href = '#z';
  out.area = read(area);
  return out;
});

// After tasks queued so far. Navigation events are zero-delay timer tasks
// in both DOMs, but jsdom's can take more than two timer hops to run when
// the machine is busy (seen with the compare end-to-end tests running in
// parallel), so wait on the clock: a timer due later runs after every
// zero-delay task queued before it.
const tick = () => new Promise((resolve) => setTimeout(resolve, 25));

htmlParity('hyperlinks: following links', async (w) => {
  const d = w.document;
  d.body.innerHTML = '<a id=h href="#sec">h</a><a id=o href="/other">o</a><a id=n>n</a><a id=p href="#prev">p</a>'
    + '<a id=x href="https://example.org/">x</a><a id=same href="">s</a><a id=q href="?q=1">q</a>'
    + '<a id=t href="#t" target=_blank>t</a><a id=dl href="#dl" download>d</a><map><area id=ar href="#area"></map>';
  const log = [];
  w.addEventListener('hashchange', (e) => log.push(['hashchange', e.constructor.name, e.oldURL, e.newURL, e.bubbles, e.cancelable, w.history.length]));
  w.addEventListener('popstate', (e) => log.push(['popstate', e.constructor.name, w.location.hash]));
  d.getElementById('p').addEventListener('click', (e) => e.preventDefault());
  for (const id of ['h', 'o', 'p', 'x', 'same', 'q', 't', 'dl', 'ar']) {
    d.getElementById(id).click();
    log.push([id, w.location.href]);
    await tick();
  }
  d.getElementById('dl').click();
  await tick();
  log.push(['same fragment again', w.location.href, w.history.length]);
  return log;
});

htmlParity('location: fragment navigation and other documents', async (w) => {
  const log = [];
  w.addEventListener('hashchange', (e) => log.push(['hashchange', e.oldURL, e.newURL]));
  w.addEventListener('popstate', () => log.push(['popstate', w.location.hash]));
  w.location.hash = 'one';
  log.push(['sync', w.location.href, w.history.length]);
  await tick();
  w.location.href = '#two';
  w.location.assign('/x');
  w.location.hash = 'two';
  log.push(['sync', w.location.href, w.history.length]);
  await tick();
  w.location.replace('#three');
  log.push(['replace', w.location.href, w.history.length]);
  await tick();
  w.location.pathname = '/elsewhere';
  w.location.search = '?a=1';
  log.push(['other documents', w.location.href]);
  const pop = new w.PopStateEvent('popstate', { state: { a: 1 } });
  const hash = new w.HashChangeEvent('hashchange', { oldURL: 'a', newURL: 'b' });
  log.push([pop.state, hash.oldURL, hash.newURL, new w.HashChangeEvent('x').oldURL]);
  return log;
});

// Deliberate deviation: jsdom navigates to the document's URL (dropping
// the fragment) when an <a> without href is clicked; the standard does
// nothing.
test('hyperlinks: an <a> without href is not followed', async () => {
  const w = createWindow({ url: 'http://localhost:3000/page#start' });
  const a = w.document.body.appendChild(w.document.createElement('a'));
  let changes = 0;
  w.addEventListener('hashchange', () => changes++);
  a.click();
  await tick();
  assert.equal(w.location.href, 'http://localhost:3000/page#start');
  assert.equal(changes, 0);
});

// Deliberate deviation: jsdom's fragment navigations leave history.state
// (and popstate's state) undefined; the standard's new entry has null.
test('fragment navigation: history.state is null', async () => {
  const w = createWindow({ url: 'http://localhost:3000/page' });
  const states = [];
  w.addEventListener('popstate', (e) => states.push(e.state));
  w.location.hash = 'a';
  assert.equal(w.history.state, null);
  await tick();
  assert.deepEqual(states, [null]);
});

htmlParity('document.open, write and close', (w) => {
  const d = w.document;
  const f = d.body.appendChild(d.createElement('iframe'));
  const fd = f.contentDocument;
  const html = (doc) => (doc.documentElement ? doc.documentElement.outerHTML : null);
  const out = [];
  out.push(fd.open() === fd, html(fd));
  fd.write('<div id=a>hi</div>');
  out.push(html(fd), fd.getElementById('a')?.textContent);
  fd.close();
  const g = d.body.appendChild(d.createElement('iframe')).contentDocument;
  g.write('<p>no open</p>');
  out.push(html(g));
  g.close();
  const x = d.implementation.createHTMLDocument('');
  x.open();
  x.write('<u>1</u>');
  x.close();
  out.push(x.body.innerHTML);
  return out;
});

// Deliberate deviation: jsdom replaces the document with each written
// chunk; the standard appends to the input stream.
test('document.write appends to the stream', () => {
  const w = createWindow();
  const fd = w.document.body.appendChild(w.document.createElement('iframe')).contentDocument;
  fd.open();
  fd.write('<div id=a>hi</div>');
  fd.write('<span>2</span>');
  fd.writeln('<b>3</b>');
  fd.close();
  assert.equal(fd.body.innerHTML, '<div id="a">hi</div><span>2</span><b>3</b>\n');
});

htmlParity('media elements without media', (w) => {
  const d = w.document;
  const v = d.createElement('video');
  const a = d.createElement('audio');
  const out = {
    calls: [v.play(), v.pause(), v.load(), v.canPlayType('video/mp4')],
    state: ['paused', 'ended', 'currentTime', 'duration', 'volume', 'muted', 'readyState', 'networkState', 'playbackRate',
      'defaultPlaybackRate', 'seeking', 'currentSrc', 'autoplay', 'loop', 'controls', 'src', 'poster'].map((k) => v[k]),
    ranges: [v.buffered.length, a.seekable.length],
    statics: [w.HTMLMediaElement.HAVE_NOTHING, w.HTMLMediaElement.HAVE_ENOUGH_DATA, w.HTMLMediaElement.NETWORK_NO_SOURCE, a instanceof w.HTMLMediaElement],
    video: [v.videoWidth, v.videoHeight],
  };
  v.currentTime = 5; v.volume = 0.5; v.muted = true; v.playbackRate = 2;
  out.set = [v.currentTime, v.volume, v.muted, v.playbackRate];
  const errors = [];
  for (const fn of [() => { v.volume = 2; }, () => { v.currentTime = NaN; }]) {
    try { fn(); errors.push('ok'); } catch (e) { errors.push([e.constructor.name, e.name]); }
  }
  out.errors = errors;
  return out;
});

// Deliberate deviations: buffered, played and seekable are TimeRanges whose
// start()/end() throw for an index out of range, and error is null (jsdom
// gives plain objects that return 0, and undefined).
test('media elements: TimeRanges', () => {
  const w = createWindow();
  const v = w.document.createElement('video');
  assert.ok(v.buffered instanceof w.TimeRanges);
  assert.equal(Object.prototype.toString.call(v.played), '[object TimeRanges]');
  assert.throws(() => v.seekable.end(0), { name: 'IndexSizeError' });
  assert.equal(v.error, null);
});

htmlParity('tables: sections, rows and cells', (w) => {
  const d = w.document;
  const t = d.createElement('table');
  const out = [];
  const shape = () => t.outerHTML.replace(/\s+/g, ' ');
  t.insertRow();
  out.push(shape());
  const head = t.createTHead();
  head.insertRow().insertCell().textContent = 'h';
  t.createCaption().textContent = 'c';
  t.createTFoot().insertRow(0).insertCell(0);
  const body2 = t.createTBody();
  body2.insertRow().insertCell();
  t.insertRow(1);
  out.push(shape(), t.rows.length, t.tBodies.length, t.caption?.tagName, t.tHead === head, t.createTHead() === head);
  out.push([...t.rows].map((r) => [r.rowIndex, r.sectionRowIndex, r.parentNode.tagName]));
  const row = t.rows[1];
  row.insertCell(); row.insertCell(0); row.insertCell(-1);
  out.push(row.cells.length, [...row.cells].map((c) => c.cellIndex), row.cells[0] === row.cells[0]);
  const live = t.rows;
  t.deleteRow(-1); t.deleteRow(0); row.deleteCell(0); row.deleteCell(-1);
  out.push(live.length, row.cells.length, shape());
  t.deleteCaption(); t.deleteTHead(); t.deleteTFoot();
  out.push(shape());
  const errors = [];
  for (const fn of [() => t.insertRow(99), () => t.deleteRow(99), () => row.insertCell(-2), () => head.insertRow(5), () => { t.tHead = d.createElement('div'); }]) {
    try { fn(); errors.push('ok'); } catch (e) { errors.push(e.name); }
  }
  out.push(errors);
  const td = d.createElement('td');
  td.setAttribute('scope', 'ROW');
  const th = d.createElement('th');
  th.setAttribute('scope', 'nope');
  out.push(td.scope, th.scope, d.createElement('td').cellIndex, d.createElement('tr').rowIndex);
  return out;
});

htmlParity('legacy event initializers', (w) => {
  const d = w.document;
  const m = d.createEvent('MouseEvents');
  m.initMouseEvent('click', true, true, w, 2, 1, 2, 3, 4, true, false, true, false, 1, d.body);
  const k = d.createEvent('KeyboardEvent');
  k.initKeyboardEvent('keydown', true, false, w, 'Enter', 0, false, true, false, true);
  const u = d.createEvent('UIEvent');
  u.initUIEvent('resize', false, false, w, 5);
  const c = d.createEvent('CompositionEvent');
  c.initCompositionEvent('compositionend', true, false, w, 'á');
  const msg = new w.MessageEvent('x');
  msg.initMessageEvent('message', false, false, { a: 1 }, 'http://o', '7', null, []);
  return [
    [m.type, m.bubbles, m.cancelable, m.view === w, m.detail, m.screenX, m.screenY, m.clientX, m.clientY, m.ctrlKey, m.altKey, m.shiftKey, m.metaKey, m.button, m.relatedTarget === d.body],
    [k.type, k.bubbles, k.cancelable, k.key, k.altKey, k.metaKey, k.ctrlKey],
    [u.type, u.detail, u.view === w],
    [c.type, c.data],
    [msg.type, msg.data, msg.origin, msg.lastEventId],
    'initKeyEvent' in k,
  ];
});

test('tables: setting tHead to another kind of section', () => {
  const w = createWindow();
  const t = w.document.createElement('table');
  assert.throws(() => { t.tHead = w.document.createElement('tbody'); }, { name: 'HierarchyRequestError' });
});

// Base URLs: Node.baseURI and URL attributes follow the first base element
// with an href; base.href resolves against the document's URL.
parity('base URLs', (w) => {
  const d = w.document;
  const out = [d.baseURI, d.body.baseURI, d.createTextNode('x').baseURI];
  const b = d.createElement('base');
  out.push(b.href);
  b.href = '../x/';
  out.push(b.href, d.baseURI);
  d.head.append(b);
  const a = d.createElement('a');
  a.setAttribute('href', 'y');
  const img = d.createElement('img');
  img.setAttribute('src', 'i.png');
  out.push(d.baseURI, b.href, a.href, img.src, a.pathname);
  const b2 = d.createElement('base');
  b2.href = 'https://other.test/z/';
  d.head.prepend(b2);
  out.push(d.baseURI, b2.href, b.href, a.href);
  b2.removeAttribute('href');
  out.push(d.baseURI, b2.href);
  b2.setAttribute('href', 'http://[bad');
  out.push(d.baseURI, b2.href);
  b.remove(); b2.remove();
  out.push(d.baseURI, a.href);
  w.history.pushState(null, '', '/new/path?q#h');
  out.push(d.baseURI, a.href);
  const svg = d.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.append(d.createElementNS('http://www.w3.org/2000/svg', 'base'));
  svg.firstChild.setAttribute('href', 'https://svg.test/');
  d.body.append(svg);
  out.push(d.baseURI, d.implementation.createHTMLDocument('').baseURI);
  out.push(new URL('/api/x/?s#f', d.baseURI).href);
  return out;
});

// Images without loading or layout, as in jsdom.
parity('img: width, height, natural sizes, complete', (w) => {
  const d = w.document;
  const out = [];
  for (const attrs of ['', 'width=10 height=20', 'width=abc', 'width=10.7', 'width="  7px"']) {
    d.body.innerHTML = `<img ${attrs}>`;
    out.push([d.body.firstChild.width, d.body.firstChild.height]);
  }
  const img = d.createElement('img');
  img.width = 33;
  img.height = '44';
  out.push([img.getAttribute('width'), img.getAttribute('height'), img.width, img.naturalWidth, img.naturalHeight, img.complete, img.currentSrc]);
  img.src = 'x.png';
  out.push([img.complete, img.currentSrc]);
  const legacy = new w.Image(5, 6);
  out.push([legacy.width, legacy.height]);
  return out;
});

// Element members jsdom has: title/script/anchor text, datalist options,
// map areas, meter/progress labels, track readyState, object
// contentDocument, media/keyboard/wheel constants on prototypes, navigator
// productSub/vendorSub.
for (const jsdom of [26, 30]) {
  parity(`element members: text, options, areas, labels, constants (jsdom ${jsdom})`, (w) => {
    const d = w.document;
    d.body.innerHTML = '<map><area><b><area></b></map><datalist><option>1</option><b><option>2</option></b></datalist>'
      + '<meter id=m></meter><label for=m>M</label><progress></progress><object></object><a>x<b>y</b></a>';
    const title = d.createElement('title');
    title.innerHTML = 'a<b>x</b>c';
    title.append(d.createComment('c'));
    const script = d.createElement('script');
    script.textContent = 'p';
    script.append(d.createComment('c'), d.createTextNode('q'));
    const out = [title.text, script.text];
    title.text = 'new';
    script.text = 's';
    const a = d.querySelector('a');
    out.push(title.childNodes.length, title.innerHTML, script.childNodes.length, a.text);
    a.text = 'z';
    const datalist = d.querySelector('datalist');
    const options = datalist.options;
    datalist.append(d.createElement('option'));
    const areas = d.querySelector('map').areas;
    out.push(a.innerHTML, options.length, options === datalist.options, options instanceof w.HTMLCollection,
      areas.length, areas[1] === d.querySelectorAll('area')[1],
      d.querySelector('meter').labels.length, d.querySelector('progress').labels.length,
      d.querySelector('object').contentDocument,
      d.createElement('track').readyState, w.HTMLTrackElement.LOADED, w.HTMLTrackElement.prototype.ERROR,
      w.HTMLMediaElement.prototype.HAVE_ENOUGH_DATA, d.createElement('audio').NETWORK_NO_SOURCE,
      w.KeyboardEvent.prototype.DOM_KEY_LOCATION_NUMPAD, new w.KeyboardEvent('x').DOM_KEY_LOCATION_LEFT,
      w.WheelEvent.prototype.DOM_DELTA_PAGE, w.navigator.productSub, w.navigator.vendorSub);
    return out;
  }, { jsdom });
}

parity('PointerEvent persistentDeviceId', (w) => [new w.PointerEvent('x').persistentDeviceId, new w.PointerEvent('x', { persistentDeviceId: 5 }).persistentDeviceId]);
