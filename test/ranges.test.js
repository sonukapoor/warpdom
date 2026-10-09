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
