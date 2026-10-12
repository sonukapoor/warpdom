// Ranges, selection and character data, checked against jsdom (parity.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWindow } from '../src/node.js';
import { parity, html } from './parity.js';

const point = (node) => (node ? (node.id || node.nodeName) : null);
const describe = (r) => [point(r.startContainer), r.startOffset, point(r.endContainer), r.endOffset, r.collapsed];
const markup = (frag) => [...frag.childNodes].map((n) => n.outerHTML ?? `#${n.data}`).join('');

parity('character data editing', (w) => {
  const t = w.document.createTextNode('hello world');
  const out = [t.substringData(6, 5), t.substringData(6, 99)];
  t.appendData('!');
  t.insertData(0, '>');
  t.deleteData(1, 1);
  t.replaceData(0, 1, '<<');
  out.push(t.data, t.length);
  for (const f of [() => t.substringData(99, 1), () => t.insertData(99, 'x')]) {
    try { f(); out.push('ok'); } catch (e) { out.push(e.name); }
  }
  t.data = null;
  out.push(JSON.stringify(t.data));
  return out;
});

parity('splitText, wholeText, normalize', (w) => {
  const d = html(w, '<p id="p">abcdef</p>');
  const p = d.getElementById('p');
  const second = p.firstChild.splitText(2);
  const out = [p.childNodes.length, p.firstChild.data, second.data, second.wholeText];
  p.appendChild(d.createTextNode(''));
  p.appendChild(d.createTextNode('gh'));
  p.insertBefore(d.createElement('b'), null);
  p.appendChild(d.createTextNode('ij'));
  out.push(p.childNodes.length);
  p.normalize();
  out.push([...p.childNodes].map((n) => n.nodeName + (n.data ?? '')));
  return out;
});

parity('range boundaries, comparisons, toString', (w) => {
  const d = html(w, '<div id="a">one<b id="b">two</b>three</div><div id="c">four</div>');
  const r = d.createRange();
  const out = [describe(r), r.commonAncestorContainer === d];
  const a = d.getElementById('a');
  r.setStart(a.firstChild, 1);
  r.setEnd(d.getElementById('c').firstChild, 2);
  out.push(describe(r), r.toString(), point(r.commonAncestorContainer));
  r.setEndBefore(d.getElementById('b'));
  out.push(describe(r), r.toString());
  r.setStart(d.getElementById('c'), 0);
  out.push('start after end collapses', describe(r));
  r.selectNode(d.getElementById('b'));
  out.push(describe(r), r.toString());
  r.selectNodeContents(a);
  out.push(describe(r), r.toString());
  const other = d.createRange();
  other.selectNode(d.getElementById('c'));
  out.push([0, 1, 2, 3].map((how) => r.compareBoundaryPoints(how, other)));
  out.push(r.comparePoint(d.getElementById('b').firstChild, 1), r.comparePoint(d.getElementById('c'), 0), r.isPointInRange(a, 0), r.isPointInRange(d.getElementById('c'), 0));
  out.push(r.intersectsNode(d.getElementById('b')), r.intersectsNode(d.getElementById('c')), r.intersectsNode(d.body));
  for (const f of [() => r.setStart(d.doctype, 0), () => r.setStart(a, 9), () => r.compareBoundaryPoints(7, other), () => r.setStartBefore(d)]) {
    try { f(); out.push('ok'); } catch (e) { out.push(e.name); }
  }
  r.collapse(true);
  out.push(describe(r));
  const clone = r.cloneRange();
  out.push(clone !== r, describe(clone), new w.Range().startContainer === d);
  return out;
});

parity('extract, clone and delete contents', (w) => {
  const run = (op) => {
    const d = html(w, '<div id="a">one<b id="b">two</b>three</div><div id="c">four<i id="i">five</i></div>');
    const r = d.createRange();
    r.setStart(d.getElementById('b').firstChild, 1);
    r.setEnd(d.getElementById('i').firstChild, 2);
    const result = op(r);
    return [result ? markup(result) : null, d.body.innerHTML, describe(r)];
  };
  return [
    run((r) => r.cloneContents()),
    run((r) => r.extractContents()),
    run((r) => { r.deleteContents(); return null; }),
    run((r) => { r.setEnd(r.startContainer, 3); return r.extractContents(); }),
  ];
});

parity('insertNode and surroundContents', (w) => {
  const d = html(w, '<p id="p">hello world</p>');
  const p = d.getElementById('p');
  const r = d.createRange();
  r.setStart(p.firstChild, 6);
  r.insertNode(d.createElement('br'));
  const out = [p.innerHTML, describe(r)];
  r.setStart(p.lastChild, 0);
  r.setEnd(p.lastChild, 5);
  r.surroundContents(d.createElement('em'));
  out.push(p.innerHTML, describe(r));
  const r2 = d.createRange();
  r2.setStart(p.firstChild, 0);
  r2.setEnd(p.lastChild, 0);
  try { r2.surroundContents(d.createElement('u')); out.push('ok'); } catch (e) { out.push(e.name); }
  return out;
});

parity('live ranges follow mutations', (w) => {
  const d = html(w, '<ul id="u"><li id="a">a</li><li id="b">bb</li><li id="c">c</li></ul>');
  const u = d.getElementById('u');
  const r = d.createRange();
  r.setStart(u, 1);
  r.setEnd(d.getElementById('b').firstChild, 2);
  const out = [describe(r)];
  u.insertBefore(d.createElement('li'), u.firstChild);
  out.push('insert before', describe(r));
  u.appendChild(d.createElement('li'));
  out.push('append', describe(r));
  d.getElementById('b').firstChild.insertData(0, 'xx');
  out.push('text insert', describe(r));
  d.getElementById('b').firstChild.deleteData(1, 3);
  out.push('text delete', describe(r));
  d.getElementById('b').remove();
  out.push('remove container', describe(r));
  u.firstChild.remove();
  out.push('remove before', describe(r));
  u.textContent = '';
  out.push('clear', describe(r));
  return out;
});

parity('selection', (w) => {
  const d = html(w, '<p id="p">hello <b id="b">bold</b> world</p><input id="i">');
  const s = d.getSelection();
  const state = () => [point(s.anchorNode), s.anchorOffset, point(s.focusNode), s.focusOffset, s.isCollapsed, s.rangeCount, s.type, s.toString()];
  const out = [s === w.getSelection(), s === d.getSelection(), state()];
  const p = d.getElementById('p');
  s.collapse(p.firstChild, 2);
  out.push(state());
  s.extend(d.getElementById('b').firstChild, 2);
  out.push(state());
  s.extend(p.firstChild, 0);
  out.push('backward', state());
  s.setBaseAndExtent(p.lastChild, 3, p.firstChild, 1);
  out.push(state(), s.getRangeAt(0) === s.getRangeAt(0), s.containsNode(d.getElementById('b')), s.containsNode(d.getElementById('b'), true));
  s.selectAllChildren(p);
  out.push(state());
  s.collapseToEnd();
  out.push(state());
  const r = d.createRange();
  r.selectNodeContents(d.getElementById('b'));
  s.removeAllRanges();
  s.addRange(r);
  out.push(state(), s.getRangeAt(0) === r);
  r.setStart(d.getElementById('b').firstChild, 1);
  out.push('live', state());
  s.deleteFromDocument();
  out.push(p.innerHTML, state());
  for (const f of [() => s.getRangeAt(1), () => s.removeRange(d.createRange()), () => s.collapse(d.doctype, 0)]) {
    try { f(); out.push('ok'); } catch (e) { out.push(e.name); }
  }
  s.empty();
  out.push(state());
  d.getElementById('i').focus();
  out.push('after focus', state());
  out.push(d.implementation.createHTMLDocument().getSelection());
  return out;
});

parity('createContextualFragment', (w) => {
  const d = html(w, '<table id="t"><tbody id="tb"></tbody></table>');
  const r = d.createRange();
  r.selectNodeContents(d.getElementById('tb'));
  const frag = r.createContextualFragment('<tr><td>x</td></tr>');
  const r2 = d.createRange();
  const frag2 = r2.createContextualFragment('<p>a</p>text');
  return [markup(frag), markup(frag2)];
});

// Following the standards where jsdom differs or lacks the member.
test('selection direction and partial containment follow the Selection API', () => {
  const w = createWindow();
  const d = html(w, '<p id="p">hello <b>bold</b> world</p>');
  const p = d.getElementById('p');
  const s = d.getSelection();
  assert.equal(s.direction, 'none');
  s.setBaseAndExtent(p.lastChild, 3, p.firstChild, 1);
  assert.equal(s.direction, 'backward');
  assert.equal(s.containsNode(p, true), true, 'a selection inside p partially contains p');
  assert.equal(s.containsNode(p), false);
});

test('ranges have CSSOM View rect methods, empty without layout', () => {
  const w = createWindow();
  const r = w.document.createRange();
  assert.deepEqual(r.getClientRects(), []);
  assert.equal(r.getBoundingClientRect().width, 0);
});

test('documents without live ranges keep no registry; ranges register on creation', () => {
  const w = createWindow();
  const d = w.document;
  const S = Object.getOwnPropertySymbols(d)[0];
  d.body.appendChild(d.createElement('div')).remove();
  assert.equal(d[S].ranges, undefined, 'mutations alone create nothing');
  const r = d.createRange();
  assert.equal(d[S].ranges.size, 1);
  r.selectNode(d.body);
  assert.equal(d[S].ranges.size, 1, 'one entry per range');
});

// Live range updates when ranges are few, dropped or elsewhere (the cases the
// range bookkeeping's shortcuts must keep exact).
parity('live ranges: created after the nodes, collapsed, in a detached tree', (w) => {
  const d = html(w, '<ul id="u"><li id="a">a</li><li id="b">b</li><li id="c">c</li></ul>');
  const u = d.getElementById('u');
  const r = d.createRange();
  r.setStart(u, 2);
  const collapsedRange = d.createRange();
  collapsedRange.setStart(d.getElementById('c').firstChild, 1);
  const out = [describe(r), describe(collapsedRange)];
  u.insertBefore(d.createElement('li'), u.firstChild);
  out.push('insert before', describe(r), describe(collapsedRange));
  u.removeChild(u.firstChild);
  d.getElementById('a').remove();
  out.push('remove before', describe(r), describe(collapsedRange));
  const detached = d.createElement('div');
  detached.innerHTML = '<i id="x">x</i><i id="y">y</i>';
  const inDetached = d.createRange();
  inDetached.setStart(detached.lastChild.firstChild, 1);
  detached.firstChild.remove();
  out.push('detached', describe(inDetached));
  detached.lastChild.remove();
  out.push('boundary removed', describe(inDetached));
  detached.textContent = 'z';
  out.push('replaced', describe(inDetached), describe(r));
  return out;
});

parity('live ranges: the selection range across focus changes', (w) => {
  const d = html(w, '<div id="f"><input id="i1"><input id="i2"></div><p id="p">text</p>');
  const s = d.getSelection();
  const state = () => [point(s.anchorNode), s.anchorOffset, point(s.focusNode), s.focusOffset, s.rangeCount];
  d.getElementById('i1').focus();
  const first = s.getRangeAt(0);
  d.getElementById('i2').focus();
  const second = s.getRangeAt(0);
  d.getElementById('i1').focus();
  const out = [first === second, describe(first), describe(second), state()];
  d.getElementById('f').insertBefore(d.createElement('span'), d.getElementById('i1'));
  out.push('insert', describe(first), describe(second), state());
  d.getElementById('f').remove();
  out.push('remove', describe(first), describe(second), state());
  s.collapse(d.getElementById('p').firstChild, 3);
  const third = s.getRangeAt(0);
  d.getElementById('p').firstChild.splitText(2);
  out.push('splitText', describe(third), state());
  return out;
});

parity('live ranges: other documents and template contents', (w) => {
  const d = html(w, '<template id="t"><p id="tp">a<b>b</b>c</p></template><div id="host"></div>');
  const other = d.implementation.createHTMLDocument('x');
  other.body.innerHTML = '<p id="op">one<b>two</b>three</p>';
  const op = other.getElementById('op');
  const ro = other.createRange();
  ro.setStart(op, 2);
  ro.setEnd(op.lastChild, 3);
  const tp = d.getElementById('t').content.firstChild;
  const rt = d.createRange();
  rt.setStart(tp, 1);
  rt.setEnd(tp, 3);
  const main = d.createRange();
  main.setStart(d.getElementById('host'), 0);
  const out = [describe(ro), describe(rt)];
  d.getElementById('host').appendChild(d.createElement('span'));
  op.firstChild.remove();
  tp.firstChild.remove();
  out.push(describe(ro), describe(rt), describe(main));
  d.getElementById('host').appendChild(tp);
  out.push('adopted', describe(rt), rt.toString());
  d.getElementById('host').prepend(d.createElement('em'));
  out.push(describe(rt), describe(main));
  return out;
});

test('ranges the selection drops before script sees them stop being updated', () => {
  const w = createWindow();
  const d = html(w, '<input id="i1"><input id="i2"><p id="p">abc<b>d</b>ef</p>');
  const S = Object.getOwnPropertySymbols(d)[0];
  const s = d.getSelection();
  for (let i = 0; i < 50; i++) d.getElementById(i % 2 ? 'i1' : 'i2').focus();
  assert.equal(d[S].ranges.size, 1, 'only the current selection range is live');
  const seen = s.getRangeAt(0);
  d.getElementById('i1').focus();
  d.getElementById('i2').focus();
  assert.equal(d[S].ranges.size, 2, 'a range script has seen stays live');
  d.getElementById('i1').remove();
  assert.deepEqual([seen.startContainer, seen.startOffset], [d.body, 0]);
  s.removeAllRanges();
  assert.equal(d[S].ranges.size, 1);
  const r = d.createRange();
  r.setStart(d.getElementById('p').firstChild, 1);
  r.setEnd(d.getElementById('p').lastChild, 1);
  r.cloneContents();
  r.extractContents();
  assert.equal(d[S].ranges.size, 2, 'no temporary ranges left from clone and extract');
});

test('a dropped range still in the registry only costs time', () => {
  const w = createWindow();
  const d = html(w, '<div id="x"><i></i><i></i></div>');
  const S = Object.getOwnPropertySymbols(d)[0];
  let dropped = d.createRange();
  dropped.setStart(d.getElementById('x'), 2);
  dropped = null;
  const kept = d.createRange();
  kept.setStart(d.getElementById('x'), 1);
  assert.equal(d[S].ranges.size, 2, 'the dropped range is still registered');
  d.getElementById('x').firstChild.remove();
  assert.equal(kept.startOffset, 0);
});

// Removal checks ranges at the focused element through its cached ancestors.
parity('live ranges: the selection at the focused element as its ancestors go', (w) => {
  const d = html(w, '<div id="outer"><section id="mid"><p id="p"><input id="i"></p></section><b id="sib"></b></div>');
  const s = d.getSelection();
  d.getElementById('i').focus();
  const r = s.getRangeAt(0);
  const other = d.createRange();
  other.setStart(d.getElementById('i'), 0);
  const out = [describe(r)];
  d.getElementById('sib').remove();
  d.getElementById('p').appendChild(d.createElement('em')).remove();
  out.push(describe(r), describe(other), point(d.activeElement));
  d.getElementById('mid').remove();
  out.push(describe(r), describe(other), point(d.activeElement), s.rangeCount);
  return out;
});

test('a range at a focused element in a shadow tree is not moved by removing the host\'s ancestors', () => {
  const w = createWindow();
  const d = w.document;
  const wrap = d.body.appendChild(d.createElement('div'));
  const host = wrap.appendChild(d.createElement('div'));
  const root = host.attachShadow({ mode: 'open' });
  const input = root.appendChild(d.createElement('input'));
  input.focus();
  const r = d.createRange();
  r.setStart(input, 0);
  d.body.appendChild(d.createElement('p')).remove();
  d.body.appendChild(d.createElement('p')).remove();
  wrap.remove();
  assert.deepEqual([r.startContainer, r.startOffset], [input, 0], 'the shadow tree is not inside wrap');
  assert.equal(d.activeElement, d.body);
});

// Calls each case and records the error name, or 'ok'.
const outcomes = (cases) => cases.map((f) => { try { f(); return 'ok'; } catch (e) { return e.name; } });

parity('compareBoundaryPoints converts how as an unsigned short', (w) => {
  const r = w.document.createRange();
  return [NaN, Infinity, -Infinity, 65536, 65537, 65539, 65540, -1, 2.9].map((how) => {
    try { return r.compareBoundaryPoints(how, r); } catch (e) { return e.name; }
  });
});

parity('StaticRange requires all four members', (w) => {
  const div = w.document.createElement('div');
  return outcomes([
    () => new w.StaticRange({ startContainer: div, endContainer: div, endOffset: 0 }),
    () => new w.StaticRange({ startContainer: div, startOffset: 0, endContainer: div }),
    () => new w.StaticRange({ startContainer: div, startOffset: 0, endContainer: div, endOffset: 0 }),
  ]);
});

parity('a live range moves with its subtree to another document', (w) => {
  const d = w.document;
  const make = () => {
    const range = d.createRange();
    const container = d.createElement('container');
    container.appendChild(d.createElement('element'));
    range.selectNode(container.firstChild);
    return range;
  };
  const a = make();
  d.implementation.createDocument(null, null).appendChild(a.startContainer);
  a.startContainer.removeChild(a.startContainer.firstChild);
  const b = make();
  d.createElement('outer').appendChild(b.startContainer);
  d.implementation.createDocument(null, null).appendChild(b.startContainer.parentNode);
  b.startContainer.removeChild(b.startContainer.firstChild);
  return [a.startOffset, a.endOffset, b.startOffset, b.endOffset];
});
