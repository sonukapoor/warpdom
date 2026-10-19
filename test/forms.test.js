// Form controls, checked against jsdom: every scenario runs on a jsdom
// window and a warpdom window and must give the same result.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWindow } from '../src/node.js';
import { parity, html } from './parity.js';

parity('reflected attributes of every kind', (w) => {
  const d = html(w, '<input id="i" maxlength="5" size="0"><td id="c" colspan="3"></td><img id="m" src="a.png"><ol id="o" start="-2"></ol>');
  const i = d.getElementById('i');
  const out = [i.maxLength, i.size, i.name, i.required, d.getElementById('m').src, d.getElementById('o').start];
  i.name = 'q';
  i.required = true;
  i.maxLength = 3;
  let threw = null;
  try { i.maxLength = -1; } catch (e) { threw = e.name; }
  out.push(i.getAttribute('name'), i.hasAttribute('required'), i.getAttribute('maxlength'), threw);
  const t = d.createElement('textarea');
  out.push(t.rows, t.cols, d.createElement('a').title, d.body.dir);
  d.body.dir = 'RTL';
  out.push(d.body.dir, d.createElement('div').hidden);
  return out;
});

parity('input value: default, dirty, sanitization, value modes', (w) => {
  const d = html(w, '<input id="t" value="a"><input id="c" type="checkbox"><input id="h" type="hidden" value="x">');
  const t = d.getElementById('t');
  const out = [t.type, t.value, t.defaultValue];
  t.setAttribute('value', 'b');
  out.push(t.value);
  t.value = 'typed';
  t.setAttribute('value', 'c');
  out.push(t.value, t.defaultValue, t.getAttribute('value'));
  t.value = 'line\nbreak';
  out.push(t.value);
  t.value = null;
  out.push(t.value);
  const c = d.getElementById('c');
  out.push(c.value);
  c.value = 'yes';
  out.push(c.getAttribute('value'));
  const h = d.getElementById('h');
  h.value = 'y';
  out.push(h.getAttribute('value'));
  for (const [type, v] of [['number', '1e3'], ['number', '1.'], ['range', '500'], ['range', 'x'], ['color', '#ABCDEF'], ['color', 'red'],
    ['date', '2024-02-30'], ['date', '2024-02-29'], ['email', ' a@b.c '], ['url', ' http://x '], ['time', '10:30:00'], ['datetime-local', '2024-01-01 10:00'], ['week', '2024-W53'], ['month', '2024-13']]) {
    const el = d.createElement('input');
    el.type = type;
    el.value = v;
    out.push(`${type}:${el.value}`);
  }
  const bogus = d.createElement('input');
  bogus.setAttribute('type', 'Bogus');
  out.push(bogus.type);
  return out;
});

parity('checked, defaultChecked and radio groups', (w) => {
  const d = html(w, '<form><input type="radio" name="g" id="a" checked><input type="radio" name="g" id="b"></form><input type="radio" name="g" id="c" checked>');
  const [a, b, c] = ['a', 'b', 'c'].map((id) => d.getElementById(id));
  const out = [a.checked, b.checked, c.checked, a.defaultChecked];
  b.checked = true;
  out.push(a.checked, b.checked, c.checked, a.hasAttribute('checked'));
  a.removeAttribute('checked');
  a.setAttribute('checked', '');
  out.push(a.checked, 'dirty a keeps its checkedness');
  const x = d.createElement('input');
  x.type = 'checkbox';
  x.defaultChecked = true;
  out.push(x.checked);
  x.checked = false;
  x.defaultChecked = true;
  out.push(x.checked);
  return out;
});

parity('native value and checked setters on the prototype (React, user-event)', (w) => {
  const out = [];
  for (const [iface, prop] of [['HTMLInputElement', 'value'], ['HTMLInputElement', 'checked'], ['HTMLTextAreaElement', 'value'], ['HTMLSelectElement', 'value'], ['HTMLOptionElement', 'selected']]) {
    const desc = Object.getOwnPropertyDescriptor(w[iface].prototype, prop);
    out.push(`${iface}.${prop}`, typeof desc.get, typeof desc.set, desc.configurable, desc.enumerable);
  }
  const input = w.document.createElement('input');
  Object.getOwnPropertyDescriptor(w.HTMLInputElement.prototype, 'value').set.call(input, 'via setter');
  out.push(input.value);
  return out;
});

parity('select: options, selectedness, selectedIndex, value', (w) => {
  const d = html(w, `<select id="s"><option value="a">A</option><optgroup label="g"><option id="b" selected>  B  text </option></optgroup><option disabled>C</option></select>
    <select id="e"><option disabled>x</option><option>y</option></select><select id="m" multiple><option selected>1</option><option selected>2</option></select>`);
  const s = d.getElementById('s');
  const out = [s.type, s.length, s.options.length, s.selectedIndex, s.value, s.options[1].text, s.options[1].value, s.options[1].index];
  s.selectedIndex = 0;
  out.push(s.value, s.options[0].selected, s.options[1].selected, s.selectedOptions.length);
  s.value = 'nope';
  out.push(s.selectedIndex, s.value);
  s.options[2].selected = true;
  out.push(s.selectedIndex);
  s.options[2].selected = false;
  out.push(s.selectedIndex, 'reset picks the first enabled option');
  const e = d.getElementById('e');
  out.push(e.selectedIndex, e.value);
  const m = d.getElementById('m');
  out.push(m.type, m.selectedIndex, [...m.selectedOptions].map((o) => o.text));
  const extra = new w.Option('Z', 'z', false, true);
  s.add(extra);
  out.push(s.length, s.value, extra.selected, extra.defaultSelected);
  s.remove(0);
  out.push(s.length, s.options.item(0).text, s.namedItem('b')?.id ?? null);
  s.options.length = 1;
  out.push(s.length);
  return out;
});

parity('textarea value and default value', (w) => {
  const d = html(w, '<textarea id="t">line1\r\nline2</textarea>');
  const t = d.getElementById('t');
  const out = [t.type, t.value, t.defaultValue, t.textLength];
  t.value = 'x\r\ny';
  out.push(t.value, t.defaultValue);
  t.defaultValue = 'new';
  out.push(t.value, t.textContent);
  return out;
});

parity('form owner, form.elements and named access', (w) => {
  const d = html(w, `<form id="f"><input name="a"><fieldset id="fs"><input name="b" id="b"></fieldset><input type="image" name="img"><output name="o"></output></form>
    <input form="f" name="outside"><input type="radio" form="f" name="r" value="1"><input type="radio" form="f" name="r" value="2" checked><button form="nope"></button>`);
  const f = d.getElementById('f');
  const out = [f.length, [...f.elements].map((e) => e.name || e.tagName), f.elements.b.id, f.elements.namedItem('a').name];
  const radios = f.elements.namedItem('r');
  out.push(radios.length, radios.value, radios instanceof w.RadioNodeList);
  radios.value = '1';
  out.push(radios.value);
  out.push(d.querySelector('[name=outside]').form === f, d.querySelector('button').form, d.getElementById('fs').elements.length, d.getElementById('fs').type);
  out.push(f.method, f.enctype, f.action);
  f.method = 'POST';
  f.action = '/submit';
  out.push(f.method, f.action);
  return out;
});

parity('labels and label.control', (w) => {
  const d = html(w, `<label id="l1" for="x">X</label><input id="x"><label id="l2">Y <select id="y"></select></label>
    <label id="l3" for="h">H</label><input type="hidden" id="h"><label id="l4">none</label><div id="d"></div>`);
  const out = [d.getElementById('l1').control.id, d.getElementById('l2').control.id, d.getElementById('l3').control, d.getElementById('l4').control];
  const x = d.getElementById('x');
  out.push(x.labels.length, x.labels[0].id, d.getElementById('y').labels[0].id, d.getElementById('h').labels, d.getElementById('d').labels);
  const labels = x.labels;
  const extra = d.createElement('label');
  extra.htmlFor = 'x';
  d.body.appendChild(extra);
  out.push(labels.length, x.labels === labels);
  return out;
});

parity('constraint validation', (w) => {
  const d = html(w, `<form id="f"><input id="r" required><input id="e" type="email" value="bad"><input id="p" pattern="[0-9]+" value="12a">
    <input id="n" type="number" min="1" max="5" step="2" value="4"><select id="s" required><option value="">Pick</option><option>A</option></select>
    <textarea id="t" required></textarea><input id="c" type="checkbox" required><input id="dis" required disabled><input id="ro" required readonly></form>`);
  const out = [];
  for (const id of ['r', 'e', 'p', 'n', 's', 't', 'c', 'dis', 'ro']) {
    const el = d.getElementById(id);
    const v = el.validity;
    out.push(id, el.willValidate, v.valid, v.valueMissing, v.typeMismatch, v.patternMismatch, v.rangeUnderflow, v.rangeOverflow, v.stepMismatch, el.validationMessage);
  }
  const invalid = [];
  d.addEventListener('invalid', (e) => invalid.push(e.target.id), true);
  out.push(d.getElementById('f').checkValidity(), invalid);
  const r = d.getElementById('r');
  r.value = 'ok';
  r.setCustomValidity('Nope');
  out.push(r.validity.customError, r.validity.valid, r.validationMessage, r.checkValidity());
  r.setCustomValidity('');
  out.push(r.checkValidity(), r.validity === r.validity);
  return out;
});

parity('click() activation: checkbox, radio, cancel, events in order', (w) => {
  const d = html(w, '<input type="checkbox" id="c"><input type="radio" name="g" id="r1" checked><input type="radio" name="g" id="r2">');
  const log = [];
  for (const type of ['click', 'input', 'change']) d.addEventListener(type, (e) => log.push(`${type}:${e.target.id}:${e.target.checked}:${e.constructor.name}`));
  const c = d.getElementById('c');
  c.click();
  log.push(c.checked);
  c.addEventListener('click', (e) => e.preventDefault(), { once: true });
  c.click();
  log.push(`canceled keeps ${c.checked}`);
  c.indeterminate = true;
  c.click();
  log.push(c.checked, c.indeterminate);
  d.getElementById('r2').click();
  log.push(d.getElementById('r1').checked, d.getElementById('r2').checked);
  d.getElementById('r2').click();
  log.push('clicking a checked radio fires no change');
  d.getElementById('r1').addEventListener('click', (e) => e.preventDefault(), { once: true });
  d.getElementById('r1').click();
  log.push(d.getElementById('r1').checked, d.getElementById('r2').checked);
  const dispatched = new w.MouseEvent('click', { bubbles: true, cancelable: true });
  c.dispatchEvent(dispatched);
  log.push(`dispatched click toggles: ${c.checked}`);
  c.dispatchEvent(new w.Event('click'));
  log.push(`plain Event does not: ${c.checked}`);
  return log;
});

parity('labels forward clicks; disabled controls ignore click()', (w) => {
  const d = html(w, `<label id="l">Accept <input type="checkbox" id="c"> <a href="#x" id="a">terms</a></label>
    <label for="c2" id="l2"><span id="sp">two</span></label><input type="checkbox" id="c2" disabled><button id="b" disabled>b</button>`);
  const log = [];
  d.addEventListener('click', (e) => log.push(`click:${e.target.id}`));
  d.getElementById('l').click();
  log.push(d.getElementById('c').checked);
  d.getElementById('c').click();
  log.push(d.getElementById('c').checked);
  d.getElementById('a').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  log.push(`interactive content: ${d.getElementById('c').checked}`);
  d.getElementById('sp').click();
  log.push(d.getElementById('c2').checked);
  d.getElementById('b').click();
  return log;
});

parity('submit and reset', (w) => {
  const d = html(w, `<form id="f"><input name="q" value="start" id="q"><input type="checkbox" checked id="c"><select id="s"><option>a</option><option selected>b</option></select>
    <textarea id="t">orig</textarea><button id="go">Go</button><button type="reset" id="rs">Reset</button><button type="button" id="plain">P</button><input type="submit" id="si"></form>`);
  const f = d.getElementById('f');
  const log = [];
  f.addEventListener('submit', (e) => { log.push(`submit:${e.submitter?.id}:${e.constructor.name}`); });
  f.addEventListener('reset', () => log.push('reset'));
  d.getElementById('go').click();
  d.getElementById('plain').click();
  f.addEventListener('submit', (e) => e.preventDefault());
  d.getElementById('si').click();
  f.requestSubmit();
  let threw = null;
  try { f.requestSubmit(d.getElementById('plain')); } catch (e) { threw = e.constructor.name; }
  log.push(threw);
  d.getElementById('q').value = 'changed';
  d.getElementById('c').checked = false;
  d.getElementById('s').selectedIndex = 0;
  d.getElementById('t').value = 'edited';
  d.getElementById('rs').click();
  log.push(d.getElementById('q').value, d.getElementById('c').checked, d.getElementById('s').value, d.getElementById('t').value);
  f.submit();
  const invalid = d.createElement('input');
  invalid.required = true;
  f.appendChild(invalid);
  d.getElementById('go').click();
  log.push('invalid form does not submit');
  return log;
});

parity('text selection', (w) => {
  const d = html(w, '<input id="t" value="hello"><input id="n" type="number"><textarea id="ta">abc</textarea>');
  const t = d.getElementById('t');
  const out = [t.selectionStart, t.selectionEnd, t.selectionDirection];
  t.value = 'hello world';
  out.push(t.selectionStart, t.selectionEnd);
  t.setSelectionRange(2, 4, 'backward');
  out.push(t.selectionStart, t.selectionEnd, t.selectionDirection);
  t.setRangeText('XY');
  out.push(t.value, t.selectionStart, t.selectionEnd);
  t.setRangeText('--', 0, 1, 'select');
  out.push(t.value, t.selectionStart, t.selectionEnd);
  t.select();
  out.push(t.selectionStart, t.selectionEnd);
  t.setSelectionRange(50, 60);
  out.push(t.selectionStart, t.selectionEnd);
  const n = d.getElementById('n');
  out.push(n.selectionStart);
  let threw = null;
  try { n.setSelectionRange(0, 1); } catch (e) { threw = e.name; }
  out.push(threw);
  const ta = d.getElementById('ta');
  ta.value = 'abcdef';
  out.push(ta.selectionStart, ta.selectionEnd);
  return out;
});

// The select event: one per call of select(), setSelectionRange(), the
// selection setters and setRangeText(), also when the selection does not
// change, when one is already queued and for elements not in a document;
// none for value changes or calls that throw. In a task from jsdom 21.1.2,
// synchronous and cancelable before (the jsdom 20 profile).
async function selectEvents(w) {
  const d = w.document;
  d.body.innerHTML = '<input id="t" value="hello"><textarea id="ta">abc</textarea><input id="e" type="email"><input id="n" type="number" value="1"><input id="c" type="checkbox"><input id="m">';
  const log = [];
  const record = (e) => log.push([e.target.id, e.type, e.constructor.name, e.bubbles, e.cancelable, e.composed, e.isTrusted, e.eventPhase, e.target.selectionStart, e.target.selectionEnd, e.target.selectionDirection]);
  d.addEventListener('select', record);
  const t = d.getElementById('t');
  const ta = d.getElementById('ta');
  t.onselect = () => log.push('onselect');
  t.select();
  log.push('after select()');
  t.select();
  t.setSelectionRange(1, 2);
  t.setSelectionRange(1, 2);
  t.selectionStart = 0;
  t.selectionEnd = 3;
  t.selectionDirection = 'backward';
  t.setRangeText('x');
  t.setRangeText('y', 0, 1, 'select');
  t.setRangeText('z', 1, 1, 'end');
  t.value = 'abc';
  try { t.setRangeText('q', 2, 1); } catch (e) { log.push(e.name); }
  try { t.setSelectionRange(0); } catch (e) { log.push(e.name); }
  ta.select();
  ta.setRangeText('z', 0, 0, 'start');
  d.getElementById('e').select();
  d.getElementById('n').select();
  d.getElementById('c').select();
  try { d.getElementById('c').setSelectionRange(0, 1); } catch (e) { log.push(e.name); }
  const detached = d.createElement('input');
  detached.id = 'detached';
  detached.value = 'ab';
  detached.addEventListener('select', record);
  detached.select();
  const other = d.implementation.createHTMLDocument('').createElement('textarea');
  other.id = 'other';
  other.addEventListener('select', record);
  other.setSelectionRange(0, 0);
  const removed = d.createElement('textarea');
  removed.id = 'removed';
  removed.value = 'abcd';
  d.body.append(removed);
  removed.select();
  removed.remove();
  log.push('end of task');
  // Events are dispatched in the order they were queued: waiting for the
  // last one waits for all of them (or 2 s, if it never comes).
  const m = d.getElementById('m');
  let timer;
  await Promise.race([
    new Promise((resolve) => { m.addEventListener('select', resolve, { once: true }); m.select(); }),
    new Promise((resolve) => { timer = setTimeout(() => resolve(log.push('no select event')), 2000); }),
  ]);
  clearTimeout(timer);
  return log;
}
for (const jsdom of [30, 25, 22, 20]) parity(`select event (jsdom ${jsdom})`, selectEvents, { jsdom });

// The jsdom release where the select event became a task (black box:
// 21.1.1 dispatches it synchronously, 21.1.2 in a task).
test('select event: synchronous and cancelable before jsdom 21.1.2', async () => {
  const observe = async (jsdom) => {
    const w = createWindow({ jsdom });
    const i = w.document.body.appendChild(w.document.createElement('input'));
    i.value = 'abc';
    const log = [];
    i.addEventListener('select', (e) => log.push(e.cancelable));
    i.setRangeText('x', 0, 1);
    log.push('sync');
    await new Promise((r) => setTimeout(r, 10));
    return log;
  };
  assert.deepEqual(await observe('21.1.1'), [true, 'sync']);
  assert.deepEqual(await observe('21.1.2'), ['sync', false]);
});

// setRangeText()'s new selection in every mode: the direction becomes
// none, and before jsdom 21.1.2 the end of the replaced text is the new
// value's length (the jsdom 20 profile; black box, 21.1.1 and 21.1.2).
const rangeTextSelection = (w) => {
  const out = [];
  for (const [start, end] of [[0, 0], [0, 3], [1, 4], [2, 2], [4, 5]]) {
    for (const args of [['x'], ['xyz'], ['', 0, 2], ['abc', 1, 2, 'select'], ['abc', 1, 2, 'start'], ['abc', 1, 2, 'end'], ['abc', 1, 2], ['', 1, 3, 'preserve'], ['q', 3, 3, 'end']]) {
      const i = w.document.createElement('input');
      i.value = 'hello';
      i.setSelectionRange(start, end, 'backward');
      i.setRangeText(...args);
      out.push([i.value, i.selectionStart, i.selectionEnd, i.selectionDirection]);
    }
  }
  return out;
};
for (const jsdom of [30, 20]) parity(`setRangeText selection (jsdom ${jsdom})`, rangeTextSelection, { jsdom });
test('setRangeText selection: the replaced text ends at the value\'s length before jsdom 21.1.2', () => {
  const end = (jsdom) => {
    const i = createWindow({ jsdom }).document.createElement('input');
    i.value = 'hello';
    i.setRangeText('abc', 1, 2, 'end');
    return i.selectionEnd;
  };
  assert.deepEqual([end('21.1.1'), end('21.1.2')], [7, 4]);
});

// WebIDL arguments of setRangeText() and setSelectionRange(): too few
// arguments, two for setRangeText (no overload takes two), an invalid
// SelectionMode, and undefined for optional and present arguments.
parity('setRangeText and setSelectionRange arguments', (w) => {
  const d = w.document;
  const out = [];
  const attempt = (make, f) => {
    const el = make();
    try { f(el); out.push([el.value, el.selectionStart, el.selectionEnd]); } catch (e) { out.push([e.constructor.name, e.name, e.message]); }
  };
  const input = (type = 'text') => { const i = d.createElement('input'); i.type = type; i.value = 'abc'; return i; };
  const textarea = () => { const t = d.createElement('textarea'); t.value = 'abc'; return t; };
  for (const make of [input, textarea, () => input('checkbox'), () => input('email')]) {
    attempt(make, (el) => el.setRangeText());
    attempt(make, (el) => el.setRangeText('x', 1));
    attempt(make, (el) => el.setRangeText('x', 1, 2, 'bogus'));
    attempt(make, (el) => el.setSelectionRange());
    attempt(make, (el) => el.setSelectionRange(1));
  }
  attempt(input, (el) => el.setRangeText(undefined));
  attempt(input, (el) => el.setRangeText('x', undefined, undefined));
  attempt(input, (el) => el.setRangeText('x', 1, undefined));
  attempt(input, (el) => el.setRangeText('x', 1, 2, undefined));
  attempt(input, (el) => el.setRangeText('x', 2, 1));
  attempt(input, (el) => el.setRangeText('x', 0, 9, 'end'));
  attempt(input, (el) => el.setSelectionRange(1, undefined));
  attempt(input, (el) => el.setSelectionRange(undefined, 2, undefined));
  return out;
});

parity('valueAsNumber, valueAsDate, stepUp', (w) => {
  const d = w.document;
  const n = d.createElement('input');
  n.type = 'number';
  const out = [Number.isNaN(n.valueAsNumber)];
  n.valueAsNumber = 4.5;
  out.push(n.value);
  n.step = '2';
  n.value = '3';
  n.stepUp();
  out.push(n.value);
  const date = d.createElement('input');
  date.type = 'date';
  date.value = '2024-03-15';
  out.push(date.valueAsNumber, date.valueAsDate.toISOString());
  date.valueAsDate = new Date(Date.UTC(2020, 0, 2));
  out.push(date.value);
  const text = d.createElement('input');
  out.push(text.valueAsDate, Number.isNaN(text.valueAsNumber));
  return out;
});

test('form controls in :checked and :disabled follow element state', () => {
  const w = createWindow();
  const d = html(w, '<input type="checkbox" id="c"><select><option id="o1">1</option><option id="o2">2</option></select>');
  d.getElementById('c').checked = true;
  d.querySelector('select').selectedIndex = 1;
  assert.deepEqual([...d.querySelectorAll(':checked')].map((e) => e.id), ['c', 'o2']);
});

// Deliberate deviations from jsdom, following the standard.
test('a formnovalidate submit button skips validation', () => {
  const w = createWindow();
  const d = html(w, '<form id="f"><input required><button id="b" formnovalidate>Go</button></form>');
  const log = [];
  d.getElementById('f').addEventListener('submit', (e) => { e.preventDefault(); log.push('submit'); });
  d.getElementById('b').click();
  assert.deepEqual(log, ['submit']);
});

test('the input event from a checkbox click is composed', () => {
  const w = createWindow();
  const d = html(w, '<input type="checkbox" id="c">');
  let composed = null;
  d.getElementById('c').addEventListener('input', (e) => { composed = e.composed; });
  d.getElementById('c').click();
  assert.equal(composed, true);
});

test('select options follow the standard list of options', () => {
  const w = createWindow();
  const d = html(w, '<select id="s"><optgroup><option>a</option></optgroup><option id="o">b</option></select>');
  const option = d.getElementById('o');
  assert.equal(option.index, 1);
  assert.equal(d.getElementById('s').options.length, 2);
  const detached = d.createElement('option');
  assert.equal(detached.index, 0);
  assert.equal(detached.form, null);
});

parity('FormData from a form, and its methods', (w) => {
  const d = html(w, `<form id="f"><input name="a" value="1"><input name="b" type="checkbox" checked><input name="c" type="checkbox">
    <input name="r" type="radio" value="x"><input name="r" type="radio" value="y" checked><input name="dis" value="no" disabled>
    <select name="s" multiple><option selected>one</option><option>two</option><option selected>three</option></select>
    <textarea name="t">line</textarea><button name="go" value="pressed">Go</button><input type="submit" name="sub" value="S">
    <input type="image" name="img"><input name="h" type="hidden" value="hid"><input type="file" name="up"><input value="no name">
    <datalist><input name="inlist" value="no"></datalist><fieldset disabled><input name="fs" value="no"></fieldset></form>
    <input form="f" name="outside" value="o">`);
  const f = d.getElementById('f');
  const describe = (fd) => [...fd].map(([k, v]) => [k, typeof v === 'string' ? v : `file:${v.name}:${v.type}:${v.size}`]);
  const out = [describe(new w.FormData(f))];
  out.push(describe(new w.FormData(f, d.querySelector('[name=go]'))));
  out.push(describe(new w.FormData(f, d.querySelector('[name=img]'))));
  const fd = new w.FormData();
  fd.append('k', '1');
  fd.append('k', '2');
  fd.append('j', 3);
  out.push(fd.get('k'), fd.getAll('k'), fd.has('j'), fd.get('missing'), fd.getAll('missing'));
  fd.set('k', 'only');
  out.push(describe(fd));
  fd.delete('j');
  out.push([...fd.keys()], [...fd.values()]);
  for (const f2 of [() => new w.FormData(d.createElement('div')), () => new w.FormData(f, d.querySelector('[name=a]'))]) {
    try { f2(); out.push('ok'); } catch (e) { out.push(e.name); }
  }
  return out;
});

// Following the standard where jsdom differs.
test('FormData follows the standard entry list', () => {
  const w = createWindow();
  const d = html(w, `<form id="f"><select name="s"><option selected disabled>no</option></select>
    <input name="_charset_" type="hidden"></form>`);
  const f = d.getElementById('f');
  const events = [];
  f.addEventListener('formdata', (e) => events.push([e.constructor.name, e.bubbles, e.formData instanceof w.FormData]));
  const fd = new w.FormData(f);
  assert.deepEqual([...fd], [['_charset_', 'UTF-8']], 'disabled options are skipped; _charset_ is the encoding');
  assert.deepEqual(events, [['FormDataEvent', true, true]], 'a formdata event is fired');
});

parity('details: one toggle event per task', async (w) => {
  const d = w.document;
  d.body.innerHTML = '<details><summary>s</summary><p>x</p></details><details id=b open><summary>t</summary></details>';
  const det = d.querySelector('details');
  const log = [];
  for (const el of d.querySelectorAll('details')) {
    el.addEventListener('toggle', (e) => log.push([el.id, e.type, e.bubbles, e.cancelable, el.open]));
  }
  // Waits for the toggle event itself, not a fixed delay: under load a
  // 20 ms timer could run before an engine's queued toggle task, which then
  // coalesced with the next changes and made the logs differ.
  const toggled = (el) => new Promise((r) => el.addEventListener('toggle', r, { once: true }));
  let next = toggled(det);
  d.querySelector('summary').click();
  log.push(['sync', det.open]);
  await next;
  next = toggled(d.getElementById('b'));
  det.open = false;
  det.open = true;
  det.open = false;
  d.getElementById('b').open = false;
  await next;
  await new Promise((r) => setTimeout(r, 0));
  return log;
});

// Deliberate deviation: jsdom fires a plain Event; the standard's toggle
// event is a ToggleEvent with the old and new state.
test('details: toggle is a ToggleEvent', async () => {
  const w = createWindow();
  const det = w.document.body.appendChild(w.document.createElement('details'));
  const events = [];
  det.addEventListener('toggle', (e) => events.push(e));
  det.open = true;
  await new Promise((r) => setTimeout(r, 10));
  assert.ok(events[0] instanceof w.ToggleEvent);
  assert.deepEqual([events[0].oldState, events[0].newState], ['closed', 'open']);
});

parity('progress and meter values', (w) => {
  const d = w.document;
  const read = (el, props) => props.map((p) => el[p]);
  const progress = (attrs) => { const el = d.createElement('progress'); for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v); return read(el, ['value', 'max', 'position']); };
  const meter = (attrs) => { const el = d.createElement('meter'); for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v); return read(el, ['min', 'max', 'value', 'low', 'high', 'optimum']); };
  const set = d.createElement('progress');
  set.value = 0.25;
  set.max = 2;
  const m = d.createElement('meter');
  m.value = 3; m.min = 1; m.max = 10; m.low = 2; m.high = 8; m.optimum = 5;
  const errors = [];
  for (const fn of [() => { set.value = NaN; }, () => { m.min = Infinity; }]) { try { fn(); errors.push('ok'); } catch (e) { errors.push(e.constructor.name); } }
  return {
    progress: [progress({}), progress({ value: '0.5' }), progress({ value: '148', max: '400' }), progress({ value: '500', max: '400' }), progress({ value: '-1' }),
      progress({ value: 'x' }), progress({ value: '3', max: '0' }), progress({ value: ' 2e1', max: 'abc' })],
    set: [set.getAttribute('value'), set.getAttribute('max'), ...read(set, ['value', 'position'])],
    meter: [meter({}), meter({ value: '0.4' }), meter({ min: '5', max: '2', value: '9' }), meter({ min: '0', max: '100', low: '-5', high: '200', optimum: '150', value: '50' }),
      meter({ min: '0', max: '10', low: '7', high: '3' }), meter({ value: 'x', min: 'y' })],
    meterSet: [m.getAttribute('value'), ...read(m, ['min', 'max', 'value', 'low', 'high', 'optimum'])],
    errors,
  };
});

parity('FileList and input.files', (w) => {
  const d = w.document;
  const f = d.createElement('input');
  f.type = 'file';
  const t = d.createElement('input');
  let error = null;
  try { new w.FileList(); } catch (e) { error = [e.constructor.name, e.message]; }
  const out = [typeof w.FileList, f.files instanceof w.FileList, f.files.length, f.files.item(0), f.files[0], t.files,
    Object.prototype.toString.call(f.files), f.files === f.files, error];
  f.type = 'text';
  out.push(f.files);
  return out;
});

// The selectedness setting algorithm reruns only when the select's list of
// options changes (or an option or the select asks for a reset), not after
// unrelated tree changes elsewhere in the document.
parity('select with no selected option stays that way until its options change', (w) => {
  const d = html(w, '<select id="s"><option>a</option><option>b</option></select><p id="p"></p>');
  const s = d.getElementById('s');
  const state = () => [s.selectedIndex, s.value, [...s.options].map((o) => o.selected)];
  const out = [];
  s.selectedIndex = -1;
  out.push(state());
  d.getElementById('p').appendChild(d.createElement('span'));
  d.getElementById('p').textContent = 'changed';
  out.push(state());
  s.options[1].textContent = 'x';
  out.push(state());
  s.value = 'nothing';
  d.body.appendChild(d.createElement('div'));
  out.push(state());
  s.appendChild(d.createElement('option'));
  out.push(state());
  s.selectedIndex = -1;
  s.options[2].remove();
  out.push(state());
  return out;
});

parity('select: the size and multiple attributes ask for a reset', (w) => {
  const d = html(w, '<select id="s"><option>a</option></select>');
  const s = d.getElementById('s');
  const out = [];
  s.selectedIndex = -1;
  s.setAttribute('size', '1');
  out.push(s.selectedIndex);
  s.selectedIndex = -1;
  s.setAttribute('multiple', '');
  s.removeAttribute('multiple');
  out.push(s.selectedIndex);
  s.selectedIndex = -1;
  s.setAttribute('name', 'n');
  s.options[0].setAttribute('value', 'v');
  out.push(s.selectedIndex);
  return out;
});

parity('select moved or wrapped keeps no selection', (w) => {
  const d = w.document;
  const s = d.createElement('select');
  s.appendChild(d.createElement('option'));
  s.selectedIndex = -1;
  const div = d.createElement('div');
  div.appendChild(s);
  d.body.appendChild(div);
  const out = [s.selectedIndex];
  d.body.appendChild(s);
  out.push(s.selectedIndex);
  return out;
});

parity('select options added after the value was set', (w) => {
  const d = html(w, '<select id="s"></select>');
  const s = d.getElementById('s');
  s.value = 'b';
  const out = [s.selectedIndex];
  for (const t of ['a', 'b', 'c']) { const o = d.createElement('option'); o.textContent = t; s.appendChild(o); }
  out.push(s.selectedIndex, s.value);
  s.value = 'b';
  out.push(s.selectedIndex);
  return out;
});

parity('select is iterable over its options', (w) => {
  const d = html(w, '<select id="s"><option>a</option><optgroup><option>b</option></optgroup></select>');
  const s = d.getElementById('s');
  const [first, second] = s;
  return [typeof w.HTMLSelectElement.prototype[Symbol.iterator], [...s].map((o) => o.textContent), first.textContent, second.textContent];
});

// An image button's selected coordinate is the activating click's (clientX,
// clientY), as in jsdom 22 to 30; jsdom 20's FormData ignores the
// submitter, and its MouseEvent has no pageX, x or offsetX.
for (const jsdom of [30, 26, 20]) {
  parity(`image buttons: the click's coordinates in form data; MouseEvent offsets (jsdom ${jsdom})`, (w) => {
    const d = w.document;
    d.body.innerHTML = '<form id=f><input name=a value=1><input type=image name=t alt=T><input type=image alt=N></form>';
    const f = d.getElementById('f');
    const [, t, n] = d.querySelectorAll('input');
    const out = [];
    const entries = (sub) => [...new w.FormData(f, sub)].map(([k, v]) => `${k}=${v}`).join('&');
    const submits = [];
    f.addEventListener('submit', (e) => { e.preventDefault(); submits.push(entries(e.submitter)); });
    const click = (el, init) => el.dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true, ...init }));
    out.push(entries(t));
    click(t, { clientX: 1, clientY: 2, screenX: 30, screenY: 40 });
    out.push(entries(t));
    click(t, {});
    click(n, { clientX: 5, clientY: 6 });
    click(t, { clientX: 7.6, clientY: -3.2 });
    out.push(entries(t), entries(n));
    t.click();
    out.push(entries(t), submits);
    const e = new w.MouseEvent('click', { clientX: 3, clientY: 4 });
    out.push(['pageX', 'pageY', 'x', 'y', 'offsetX', 'offsetY'].map((k) => (k in w.MouseEvent.prototype ? e[k] : '-')));
    try { new w.FormData(d.createElement('form'), 0); out.push('no throw'); } catch (err) { out.push(err.constructor.name); }
    return out;
  }, { jsdom });
}

for (const jsdom of [26, 20]) {
  parity(`form submission: the submit event's interface (jsdom ${jsdom})`, (w) => {
    w.document.body.innerHTML = '<form><input type=submit name=s><button name=b>b</button></form>';
    const f = w.document.querySelector('form');
    const seen = [];
    f.addEventListener('submit', (e) => { e.preventDefault(); seen.push([e.constructor.name, e.submitter?.name ?? null, e.bubbles, e.cancelable]); });
    for (const el of w.document.querySelectorAll('input, button')) el.click();
    return [typeof w.SubmitEvent, seen];
  }, { jsdom });
}

test('jsdom before 16.5.2: a click on a detached checkbox or radio also fires input and change', () => {
  for (const [jsdom, expected] of [['16.4.0', ['input', 'change']], ['16.5.1', ['input', 'change']], ['16.5.2', []], ['20.0.3', []], [undefined, []]]) {
    const w = createWindow(jsdom ? { jsdom } : {});
    for (const type of ['checkbox', 'radio']) {
      const div = w.document.createElement('div');
      div.innerHTML = `<label><input type=${type}></label>`;
      const input = div.querySelector('input');
      const log = [];
      for (const t of ['input', 'change']) input.addEventListener(t, () => log.push(t));
      div.querySelector('label').click();
      assert.equal(input.checked, true);
      assert.deepEqual(log, expected, `${jsdom} ${type}`);
    }
  }
});

// Cloning steps of input and textarea (#41): value, dirty value flag,
// checkedness and dirty checkedness flag; a textarea's raw value and dirty
// flag. Not the selection or an option's selectedness. From jsdom 30.1.0
// the indeterminate state too.
const cloning = (w) => {
  const d = w.document;
  const out = [];
  for (const type of ['text', 'checkbox', 'radio', 'hidden', 'file', 'number', 'range', 'color', 'date', 'submit']) {
    const i = d.createElement('input');
    i.type = type;
    try { i.value = type === 'number' ? '5' : 'foo bar'; } catch (e) { out.push(e.name); }
    i.checked = true;
    i.indeterminate = true;
    const c = i.cloneNode();
    out.push([type, c.value, c.checked, c.indeterminate, c.getAttribute('value')]);
    c.setAttribute('value', 'baz');
    c.removeAttribute('checked');
    c.setAttribute('checked', '');
    out.push([c.value, c.checked]);
    const j = d.createElement('input');
    j.type = type;
    j.setAttribute('value', '7');
    j.setAttribute('checked', '');
    const cj = j.cloneNode();
    cj.setAttribute('value', '8');
    cj.removeAttribute('checked');
    out.push([cj.value, cj.checked]);
  }
  const i = d.createElement('input');
  i.value = 'hello';
  i.setSelectionRange(1, 3, 'backward');
  const c = i.cloneNode();
  out.push([c.selectionStart, c.selectionEnd, c.selectionDirection]);
  const t = d.createElement('textarea');
  t.textContent = 'def';
  t.value = 'foo bar';
  const tc = t.cloneNode();
  out.push([tc.value, tc.textContent]);
  tc.textContent = 'zzz';
  out.push(tc.value);
  const t2 = d.createElement('textarea');
  t2.textContent = 'def';
  const t2c = t2.cloneNode(true);
  t2c.textContent = 'q';
  out.push(t2c.value);
  d.body.innerHTML = '<form><input name=a><input type=checkbox name=b><select><option>1<option>2</select><textarea>t</textarea></form>';
  const f = d.body.firstChild;
  f.elements[0].value = 'x';
  f.elements[1].checked = true;
  f.elements[2].selectedIndex = 1;
  f.elements[3].value = 'changed';
  const fc = f.cloneNode(true);
  out.push([fc.elements[0].value, fc.elements[1].checked, fc.elements[2].selectedIndex, fc.elements[3].value]);
  const o = d.createElement('option');
  o.selected = true;
  out.push(o.cloneNode().selected);
  const other = d.implementation.createHTMLDocument('');
  const ii = d.createElement('input');
  ii.value = 'imp';
  ii.checked = true;
  out.push([other.importNode(ii).value, other.importNode(ii).checked]);
  const cb = d.createElement('input');
  cb.type = 'checkbox';
  cb.checked = false;
  const cbc = cb.cloneNode();
  cbc.setAttribute('checked', '');
  out.push(cbc.checked);
  return out;
};
for (const jsdom of [30, 25, 20]) parity(`cloning input and textarea (jsdom ${jsdom})`, cloning, { jsdom });

test('cloning an input copies its indeterminate state from jsdom 30.1.0', () => {
  const cloned = (jsdom) => {
    const i = createWindow({ jsdom }).document.createElement('input');
    i.indeterminate = true;
    return i.cloneNode().indeterminate;
  };
  assert.deepEqual([cloned('29.1.1'), cloned('30.0.1'), cloned('30.1.0'), cloned('30.1.2')], [false, false, true, true]);
});
