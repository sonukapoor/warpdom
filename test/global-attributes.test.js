// Global attributes (HTML 3.2.6): dir and the directionality (:dir(), the
// computed direction), translate, lang (:lang()), document.dir, dataset.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWindow } from '../src/node.js';
import { parity, html } from './parity.js';

const dirOf = (el) => (el.matches(':dir(rtl)') ? 'rtl' : el.matches(':dir(ltr)') ? 'ltr' : 'none');

parity(':dir() from dir attributes, inheritance, dir=auto text, bdi and form controls', (w) => {
  const d = html(
    w,
    `
    <div id="rtl" dir="RTL"><p id="inherits"><span id="deep"></span></p><div id="back" dir="ltr"></div></div>
    <div id="auto" dir="auto"><!-- א --><script>א</script><b>12 A</b>א</div>
    <div id="autoRtl" dir="auto"><style>a{}</style>  א abc</div>
    <div id="autoEmpty" dir="auto">123</div>
    <div dir="rtl"><bdi id="bdi">abc</bdi><input id="tel" type="tel"><span id="invalid" dir="sideways"></span></div>
    <input id="input" dir="auto" value="א"><textarea id="ta" dir="auto">abc</textarea>
    <input id="num" dir="auto" type="number">`,
  );
  const ids = [
    'rtl',
    'inherits',
    'deep',
    'back',
    'auto',
    'autoRtl',
    'autoEmpty',
    'bdi',
    'tel',
    'invalid',
    'input',
    'ta',
    'num',
  ];
  const before = Object.fromEntries(ids.map((id) => [id, dirOf(d.getElementById(id))]));
  d.getElementById('input').value = 'abc';
  d.getElementById('ta').value = 'א';
  d.getElementById('auto').prepend(d.createTextNode('ב'));
  return {
    before,
    after: ['input', 'ta', 'auto'].map((id) => dirOf(d.getElementById(id))),
    root: dirOf(d.documentElement),
    detached: dirOf(d.createElement('div')),
    svg: dirOf(d.createElementNS('http://www.w3.org/2000/svg', 'svg')),
    other: d.getElementById('rtl').matches(':dir(auto)'),
  };
});

parity('dir=auto follows insertion, removal and text changes', (w) => {
  const d = html(w, '<div id="a" dir="auto"><span id="b"></span>hello</div>');
  const a = d.getElementById('a');
  const out = [dirOf(a)];
  d.getElementById('b').innerHTML = 'א';
  out.push(dirOf(a));
  d.getElementById('b').firstChild.data = 'x';
  out.push(dirOf(a));
  d.getElementById('b').dir = 'rtl';
  d.getElementById('b').firstChild.data = 'א';
  out.push(dirOf(a), dirOf(d.getElementById('b')));
  d.getElementById('b').remove();
  out.push(dirOf(a));
  return out;
});

parity('the computed direction comes from the directionality', (w) => {
  const d = html(
    w,
    `
    <div id="a" dir="auto">א</div><div id="b" dir="rtl"><p id="c">x</p></div>
    <bdi id="e">א</bdi><div id="f" dir="rtl" style="direction: ltr"></div>`,
  );
  return ['a', 'b', 'c', 'e', 'f'].map((id) => w.getComputedStyle(d.getElementById(id)).direction);
});

parity(
  'jsdom 26: no computed direction without a declaration',
  (w) => {
    const d = html(w, '<div id="a" dir="auto">א</div><div id="b" dir="rtl"><p id="c">x</p></div>');
    return ['a', 'b', 'c'].map((id) => w.getComputedStyle(d.getElementById(id)).direction);
  },
  { jsdom: 26 },
);

parity("a slot in a shadow tree gives its host's directionality to a dir=auto ancestor", (w) => {
  const d = w.document;
  const host = d.createElement('div');
  host.dir = 'rtl';
  d.body.append(host);
  const shadow = host.attachShadow({ mode: 'open' });
  shadow.innerHTML = '<div id="c" dir="auto"><slot></slot>A</div>';
  host.append('\u05D0');
  return dirOf(shadow.getElementById('c'));
});

// jsdom 30 gives elements in a shadow tree 'ltr' whatever the host's
// directionality (PLAN.md, deliberate deviations).
test("elements in a shadow tree inherit the host's directionality", () => {
  const d = createWindow().document;
  const host = d.createElement('div');
  host.dir = 'rtl';
  const shadow = host.attachShadow({ mode: 'open' });
  shadow.innerHTML = '<span><b></b></span>';
  assert.equal(dirOf(shadow.querySelector('b')), 'rtl');
  host.dir = 'ltr';
  assert.equal(dirOf(shadow.querySelector('b')), 'ltr');
});

// Where jsdom 30 does not skip assigned nodes with a dir attribute or bdi
// assigned nodes (PLAN.md, deliberate deviations).
test('a dir=auto slot uses its assigned nodes, skipping bdi and elements with dir', () => {
  const w = createWindow();
  const d = w.document;
  const host = d.createElement('div');
  d.body.append(host);
  host.innerHTML = '<span dir="ltr">א</span><bdi>א</bdi>abc';
  const shadow = host.attachShadow({ mode: 'open' });
  shadow.innerHTML = '<slot dir="auto"></slot><slot name="x" dir="auto">א</slot>';
  const [slot, empty] = shadow.querySelectorAll('slot');
  assert.equal(dirOf(slot), 'ltr');
  assert.equal(dirOf(empty), 'rtl', 'a slot without assigned nodes uses its own contents');
  host.lastChild.remove();
  assert.equal(dirOf(slot), 'ltr', 'nothing strong left: ltr');
  host.append('ג');
  assert.equal(dirOf(slot), 'rtl');
});

test('text directionality: supplementary code points and the first strong character', () => {
  const d = createWindow().document;
  const div = d.createElement('div');
  div.dir = 'auto';
  for (const [text, expected] of [
    ['\u{10900}', 'rtl'],
    ['\u{1D400}', 'ltr'],
    ['1 2 ١ א', 'rtl'],
    ['Àא', 'ltr'],
    ['ا', 'rtl'],
    ['', 'ltr'],
  ]) {
    div.textContent = text;
    assert.equal(dirOf(div), expected, JSON.stringify(text));
  }
});

parity('translate: own attribute, inheritance, non-HTML elements and the setter', (w) => {
  const d = html(
    w,
    `
    <div id="no" translate="NO"><span id="in"></span><p id="yes" translate=""></p><b id="bad" translate="maybe"></b>
    </div>`,
  );
  const get = (id) => d.getElementById(id).translate;
  const el = d.createElement('div');
  el.translate = false;
  const attr1 = el.getAttribute('translate');
  el.translate = 1;
  return [
    get('no'),
    get('in'),
    get('yes'),
    get('bad'),
    d.body.translate,
    d.createElement('a').translate,
    attr1,
    el.getAttribute('translate'),
  ];
});

// jsdom 30 returns undefined for an HTML element under an SVG element.
test('translate inherits through non-HTML elements', () => {
  const d = createWindow().document;
  d.body.innerHTML = '<div translate="no"><svg><g><foreignObject><i></i></foreignObject></g></svg></div>';
  assert.equal(d.querySelector('i').translate, false);
  d.querySelector('div').translate = true;
  assert.equal(d.querySelector('i').translate, true);
});

parity('document.dir reflects the html element, limited to known values', (w) => {
  const d = w.document;
  const out = [d.dir];
  d.dir = 'RTL';
  out.push(d.dir, d.documentElement.getAttribute('dir'));
  d.dir = 'x-garbage';
  out.push(d.dir, d.documentElement.getAttribute('dir'));
  const doc = d.implementation.createHTMLDocument('');
  doc.documentElement.remove();
  doc.dir = 'rtl';
  out.push(doc.dir);
  return out;
});

parity('dataset setter: SyntaxError and InvalidCharacterError', (w) => {
  const el = w.document.createElement('div');
  const tryName = (name) => {
    try {
      el.dataset[name] = 'v';
      return 'ok';
    } catch (e) {
      return e.name;
    }
  };
  return [tryName('-foo'), tryName('foo '), tryName('a-b'), tryName('aB'), tryName('foo-'), el.getAttributeNames()];
});

parity(':lang() from the language: lang, ancestors, shadow hosts', (w) => {
  const d = html(w, '<div id="host" lang="en-AU"><span id="s"></span></div><p id="p" lang="">x</p>');
  const shadow = d.getElementById('host').attachShadow({ mode: 'open' });
  shadow.innerHTML = '<slot></slot><b>x</b>';
  const m = (el, l) => el.matches(`:lang(${l})`);
  return [
    m(d.getElementById('s'), 'en'),
    m(d.getElementById('s'), 'en-au'),
    m(d.getElementById('s'), 'fr'),
    m(shadow.querySelector('b'), 'en-AU'),
    m(d.getElementById('p'), 'en'),
  ];
});

// jsdom applies lang in no namespace on elements of any namespace.
test(':lang() ignores lang in no namespace outside HTML and SVG, and reads xml:lang', () => {
  const d = createWindow().document;
  const container = d.createElement('div');
  container.setAttribute('lang', 'en-CA');
  const child = d.createElementNS('urn:x', 'test');
  child.setAttribute('lang', 'en-NZ');
  container.append(child);
  assert.equal(child.matches(':lang(en-CA)'), true);
  assert.equal(child.matches(':lang(en-NZ)'), false);
  child.setAttributeNS('http://www.w3.org/XML/1998/namespace', 'xml:lang', 'de');
  assert.equal(child.matches(':lang(de)'), true);
});

// jsdom reads only the control's own dir attribute (PLAN.md, deliberate deviations).
test("form submission: dirname gives the control's directionality", () => {
  const w = createWindow();
  const d = w.document;
  d.body.innerHTML = `<form><div dir="rtl"><input name="a" dirname="a.dir" value="x"></div>
    <input name="b" dirname="b.dir" dir="auto" value="\u05D0"><textarea name="c" dirname="c.dir" dir="auto">abc</textarea></form>`;
  assert.deepEqual(
    [...new w.FormData(d.querySelector('form'))],
    [
      ['a', 'x'],
      ['a.dir', 'rtl'],
      ['b', '\u05D0'],
      ['b.dir', 'rtl'],
      ['c', 'abc'],
      ['c.dir', 'ltr'],
    ],
  );
});
