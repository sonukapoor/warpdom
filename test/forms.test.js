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
  d.querySelector('summary').click();
  log.push(['sync', det.open]);
  await new Promise((r) => setTimeout(r, 20));
  det.open = false;
  det.open = true;
  det.open = false;
  d.getElementById('b').open = false;
  await new Promise((r) => setTimeout(r, 20));
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
