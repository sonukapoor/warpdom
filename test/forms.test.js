// Form controls, checked against jsdom: every scenario runs on a jsdom
// window and a warpdom window and must give the same result.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWindow } from '../src/node.js';
import { parity, html } from './parity.js';

parity('reflected attributes of every kind', (w) => {
  const d = html(
    w,
    '<input id="i" maxlength="5" size="0"><td id="c" colspan="3"></td><img id="m" src="a.png"><ol id="o" start="-2"></ol>',
  );
  const i = d.getElementById('i');
  const out = [i.maxLength, i.size, i.name, i.required, d.getElementById('m').src, d.getElementById('o').start];
  i.name = 'q';
  i.required = true;
  i.maxLength = 3;
  let threw = null;
  try {
    i.maxLength = -1;
  } catch (e) {
    threw = e.name;
  }
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
  for (const [type, v] of [
    ['number', '1e3'],
    ['number', '1.'],
    ['range', '500'],
    ['range', 'x'],
    ['color', '#ABCDEF'],
    ['color', 'red'],
    ['date', '2024-02-30'],
    ['date', '2024-02-29'],
    ['email', ' a@b.c '],
    ['url', ' http://x '],
    ['time', '10:30:00'],
    ['datetime-local', '2024-01-01 10:00'],
    ['week', '2024-W53'],
    ['month', '2024-13'],
  ]) {
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
  const d = html(
    w,
    '<form><input type="radio" name="g" id="a" checked><input type="radio" name="g" id="b"></form><input type="radio" name="g" id="c" checked>',
  );
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
  for (const [iface, prop] of [
    ['HTMLInputElement', 'value'],
    ['HTMLInputElement', 'checked'],
    ['HTMLTextAreaElement', 'value'],
    ['HTMLSelectElement', 'value'],
    ['HTMLOptionElement', 'selected'],
  ]) {
    const desc = Object.getOwnPropertyDescriptor(w[iface].prototype, prop);
    out.push(`${iface}.${prop}`, typeof desc.get, typeof desc.set, desc.configurable, desc.enumerable);
  }
  const input = w.document.createElement('input');
  Object.getOwnPropertyDescriptor(w.HTMLInputElement.prototype, 'value').set.call(input, 'via setter');
  out.push(input.value);
  return out;
});

parity('select: options, selectedness, selectedIndex, value', (w) => {
  const d = html(
    w,
    `<select id="s"><option value="a">A</option><optgroup label="g"><option id="b" selected>  B  text </option></optgroup><option disabled>C</option></select>
    <select id="e"><option disabled>x</option><option>y</option></select><select id="m" multiple><option selected>1</option><option selected>2</option></select>`,
  );
  const s = d.getElementById('s');
  const out = [
    s.type,
    s.length,
    s.options.length,
    s.selectedIndex,
    s.value,
    s.options[1].text,
    s.options[1].value,
    s.options[1].index,
  ];
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
  out.push(
    m.type,
    m.selectedIndex,
    [...m.selectedOptions].map((o) => o.text),
  );
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
  const d = html(
    w,
    `<form id="f"><input name="a"><fieldset id="fs"><input name="b" id="b"></fieldset><input type="image" name="img"><output name="o"></output></form>
    <input form="f" name="outside"><input type="radio" form="f" name="r" value="1"><input type="radio" form="f" name="r" value="2" checked><button form="nope"></button>`,
  );
  const f = d.getElementById('f');
  const out = [
    f.length,
    [...f.elements].map((e) => e.name || e.tagName),
    f.elements.b.id,
    f.elements.namedItem('a').name,
  ];
  const radios = f.elements.namedItem('r');
  out.push(radios.length, radios.value, radios instanceof w.RadioNodeList);
  radios.value = '1';
  out.push(radios.value);
  out.push(
    d.querySelector('[name=outside]').form === f,
    d.querySelector('button').form,
    d.getElementById('fs').elements.length,
    d.getElementById('fs').type,
  );
  out.push(f.method, f.enctype, f.action);
  f.method = 'POST';
  f.action = '/submit';
  out.push(f.method, f.action);
  return out;
});

parity('labels and label.control', (w) => {
  const d = html(
    w,
    `<label id="l1" for="x">X</label><input id="x"><label id="l2">Y <select id="y"></select></label>
    <label id="l3" for="h">H</label><input type="hidden" id="h"><label id="l4">none</label><div id="d"></div>`,
  );
  const out = [
    d.getElementById('l1').control.id,
    d.getElementById('l2').control.id,
    d.getElementById('l3').control,
    d.getElementById('l4').control,
  ];
  const x = d.getElementById('x');
  out.push(
    x.labels.length,
    x.labels[0].id,
    d.getElementById('y').labels[0].id,
    d.getElementById('h').labels,
    d.getElementById('d').labels,
  );
  const labels = x.labels;
  const extra = d.createElement('label');
  extra.htmlFor = 'x';
  d.body.appendChild(extra);
  out.push(labels.length, x.labels === labels);
  return out;
});

parity('constraint validation', (w) => {
  const d = html(
    w,
    `<form id="f"><input id="r" required><input id="e" type="email" value="bad"><input id="p" pattern="[0-9]+" value="12a">
    <input id="n" type="number" min="1" max="5" step="2" value="4"><select id="s" required><option value="">Pick</option><option>A</option></select>
    <textarea id="t" required></textarea><input id="c" type="checkbox" required><input id="dis" required disabled><input id="ro" required readonly></form>`,
  );
  const out = [];
  for (const id of ['r', 'e', 'p', 'n', 's', 't', 'c', 'dis', 'ro']) {
    const el = d.getElementById(id);
    const v = el.validity;
    out.push(
      id,
      el.willValidate,
      v.valid,
      v.valueMissing,
      v.typeMismatch,
      v.patternMismatch,
      v.rangeUnderflow,
      v.rangeOverflow,
      v.stepMismatch,
      el.validationMessage,
    );
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
  const d = html(
    w,
    '<input type="checkbox" id="c"><input type="radio" name="g" id="r1" checked><input type="radio" name="g" id="r2">',
  );
  const log = [];
  for (const type of ['click', 'input', 'change'])
    d.addEventListener(type, (e) => log.push(`${type}:${e.target.id}:${e.target.checked}:${e.constructor.name}`));
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
  const d = html(
    w,
    `<label id="l">Accept <input type="checkbox" id="c"> <a href="#x" id="a">terms</a></label>
    <label for="c2" id="l2"><span id="sp">two</span></label><input type="checkbox" id="c2" disabled><button id="b" disabled>b</button>`,
  );
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
  const d = html(
    w,
    `<form id="f"><input name="q" value="start" id="q"><input type="checkbox" checked id="c"><select id="s"><option>a</option><option selected>b</option></select>
    <textarea id="t">orig</textarea><button id="go">Go</button><button type="reset" id="rs">Reset</button><button type="button" id="plain">P</button><input type="submit" id="si"></form>`,
  );
  const f = d.getElementById('f');
  const log = [];
  f.addEventListener('submit', (e) => {
    log.push(`submit:${e.submitter?.id}:${e.constructor.name}`);
  });
  f.addEventListener('reset', () => log.push('reset'));
  d.getElementById('go').click();
  d.getElementById('plain').click();
  f.addEventListener('submit', (e) => e.preventDefault());
  d.getElementById('si').click();
  f.requestSubmit();
  let threw = null;
  try {
    f.requestSubmit(d.getElementById('plain'));
  } catch (e) {
    threw = e.constructor.name;
  }
  log.push(threw);
  d.getElementById('q').value = 'changed';
  d.getElementById('c').checked = false;
  d.getElementById('s').selectedIndex = 0;
  d.getElementById('t').value = 'edited';
  d.getElementById('rs').click();
  log.push(
    d.getElementById('q').value,
    d.getElementById('c').checked,
    d.getElementById('s').value,
    d.getElementById('t').value,
  );
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
  try {
    n.setSelectionRange(0, 1);
  } catch (e) {
    threw = e.name;
  }
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
  d.body.innerHTML =
    '<input id="t" value="hello"><textarea id="ta">abc</textarea><input id="e" type="email"><input id="n" type="number" value="1"><input id="c" type="checkbox"><input id="m">';
  const log = [];
  const record = (e) =>
    log.push([
      e.target.id,
      e.type,
      e.constructor.name,
      e.bubbles,
      e.cancelable,
      e.composed,
      e.isTrusted,
      e.eventPhase,
      e.target.selectionStart,
      e.target.selectionEnd,
      e.target.selectionDirection,
    ]);
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
  try {
    t.setRangeText('q', 2, 1);
  } catch (e) {
    log.push(e.name);
  }
  try {
    t.setSelectionRange(0);
  } catch (e) {
    log.push(e.name);
  }
  ta.select();
  ta.setRangeText('z', 0, 0, 'start');
  d.getElementById('e').select();
  d.getElementById('n').select();
  d.getElementById('c').select();
  try {
    d.getElementById('c').setSelectionRange(0, 1);
  } catch (e) {
    log.push(e.name);
  }
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
    new Promise((resolve) => {
      m.addEventListener('select', resolve, { once: true });
      m.select();
    }),
    new Promise((resolve) => {
      timer = setTimeout(() => resolve(log.push('no select event')), 2000);
    }),
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
  for (const [start, end] of [
    [0, 0],
    [0, 3],
    [1, 4],
    [2, 2],
    [4, 5],
  ]) {
    for (const args of [
      ['x'],
      ['xyz'],
      ['', 0, 2],
      ['abc', 1, 2, 'select'],
      ['abc', 1, 2, 'start'],
      ['abc', 1, 2, 'end'],
      ['abc', 1, 2],
      ['', 1, 3, 'preserve'],
      ['q', 3, 3, 'end'],
    ]) {
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
test("setRangeText selection: the replaced text ends at the value's length before jsdom 21.1.2", () => {
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
    try {
      f(el);
      out.push([el.value, el.selectionStart, el.selectionEnd]);
    } catch (e) {
      out.push([e.constructor.name, e.name, e.message]);
    }
  };
  const input = (type = 'text') => {
    const i = d.createElement('input');
    i.type = type;
    i.value = 'abc';
    return i;
  };
  const textarea = () => {
    const t = d.createElement('textarea');
    t.value = 'abc';
    return t;
  };
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
  const d = html(
    w,
    '<input type="checkbox" id="c"><select><option id="o1">1</option><option id="o2">2</option></select>',
  );
  d.getElementById('c').checked = true;
  d.querySelector('select').selectedIndex = 1;
  assert.deepEqual(
    [...d.querySelectorAll(':checked')].map((e) => e.id),
    ['c', 'o2'],
  );
});

// Deliberate deviations from jsdom, following the standard.
test('a formnovalidate submit button skips validation', () => {
  const w = createWindow();
  const d = html(w, '<form id="f"><input required><button id="b" formnovalidate>Go</button></form>');
  const log = [];
  d.getElementById('f').addEventListener('submit', (e) => {
    e.preventDefault();
    log.push('submit');
  });
  d.getElementById('b').click();
  assert.deepEqual(log, ['submit']);
});

test('the input event from a checkbox click is composed', () => {
  const w = createWindow();
  const d = html(w, '<input type="checkbox" id="c">');
  let composed = null;
  d.getElementById('c').addEventListener('input', (e) => {
    composed = e.composed;
  });
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
  const d = html(
    w,
    `<form id="f"><input name="a" value="1"><input name="b" type="checkbox" checked><input name="c" type="checkbox">
    <input name="r" type="radio" value="x"><input name="r" type="radio" value="y" checked><input name="dis" value="no" disabled>
    <select name="s" multiple><option selected>one</option><option>two</option><option selected>three</option></select>
    <textarea name="t">line</textarea><button name="go" value="pressed">Go</button><input type="submit" name="sub" value="S">
    <input type="image" name="img"><input name="h" type="hidden" value="hid"><input type="file" name="up"><input value="no name">
    <datalist><input name="inlist" value="no"></datalist><fieldset disabled><input name="fs" value="no"></fieldset></form>
    <input form="f" name="outside" value="o">`,
  );
  const f = d.getElementById('f');
  const describe = (fd) =>
    [...fd].map(([k, v]) => [k, typeof v === 'string' ? v : `file:${v.name}:${v.type}:${v.size}`]);
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
  for (const f2 of [
    () => new w.FormData(d.createElement('div')),
    () => new w.FormData(f, d.querySelector('[name=a]')),
  ]) {
    try {
      f2();
      out.push('ok');
    } catch (e) {
      out.push(e.name);
    }
  }
  return out;
});

// Following the standard where jsdom differs.
test('FormData follows the standard entry list', () => {
  const w = createWindow();
  const d = html(
    w,
    `<form id="f"><select name="s"><option selected disabled>no</option></select>
    <input name="_charset_" type="hidden"></form>`,
  );
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
  const progress = (attrs) => {
    const el = d.createElement('progress');
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    return read(el, ['value', 'max', 'position']);
  };
  const meter = (attrs) => {
    const el = d.createElement('meter');
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    return read(el, ['min', 'max', 'value', 'low', 'high', 'optimum']);
  };
  const set = d.createElement('progress');
  set.value = 0.25;
  set.max = 2;
  const m = d.createElement('meter');
  m.value = 3;
  m.min = 1;
  m.max = 10;
  m.low = 2;
  m.high = 8;
  m.optimum = 5;
  const errors = [];
  for (const fn of [
    () => {
      set.value = NaN;
    },
    () => {
      m.min = Infinity;
    },
  ]) {
    try {
      fn();
      errors.push('ok');
    } catch (e) {
      errors.push(e.constructor.name);
    }
  }
  return {
    progress: [
      progress({}),
      progress({ value: '0.5' }),
      progress({ value: '148', max: '400' }),
      progress({ value: '500', max: '400' }),
      progress({ value: '-1' }),
      progress({ value: 'x' }),
      progress({ value: '3', max: '0' }),
      progress({ value: ' 2e1', max: 'abc' }),
    ],
    set: [set.getAttribute('value'), set.getAttribute('max'), ...read(set, ['value', 'position'])],
    meter: [
      meter({}),
      meter({ value: '0.4' }),
      meter({ min: '5', max: '2', value: '9' }),
      meter({ min: '0', max: '100', low: '-5', high: '200', optimum: '150', value: '50' }),
      meter({ min: '0', max: '10', low: '7', high: '3' }),
      meter({ value: 'x', min: 'y' }),
    ],
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
  try {
    new w.FileList();
  } catch (e) {
    error = [e.constructor.name, e.message];
  }
  const out = [
    typeof w.FileList,
    f.files instanceof w.FileList,
    f.files.length,
    f.files.item(0),
    f.files[0],
    t.files,
    Object.prototype.toString.call(f.files),
    f.files === f.files,
    error,
  ];
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
  for (const t of ['a', 'b', 'c']) {
    const o = d.createElement('option');
    o.textContent = t;
    s.appendChild(o);
  }
  out.push(s.selectedIndex, s.value);
  s.value = 'b';
  out.push(s.selectedIndex);
  return out;
});

parity('select is iterable over its options', (w) => {
  const d = html(w, '<select id="s"><option>a</option><optgroup><option>b</option></optgroup></select>');
  const s = d.getElementById('s');
  const [first, second] = s;
  return [
    typeof w.HTMLSelectElement.prototype[Symbol.iterator],
    [...s].map((o) => o.textContent),
    first.textContent,
    second.textContent,
  ];
});

// An image button's selected coordinate is the activating click's (clientX,
// clientY), as in jsdom 22 to 30; jsdom 20's FormData ignores the
// submitter, and its MouseEvent has no pageX, x or offsetX.
for (const jsdom of [30, 26, 20]) {
  parity(
    `image buttons: the click's coordinates in form data; MouseEvent offsets (jsdom ${jsdom})`,
    (w) => {
      const d = w.document;
      d.body.innerHTML =
        '<form id=f><input name=a value=1><input type=image name=t alt=T><input type=image alt=N></form>';
      const f = d.getElementById('f');
      const [, t, n] = d.querySelectorAll('input');
      const out = [];
      const entries = (sub) => [...new w.FormData(f, sub)].map(([k, v]) => `${k}=${v}`).join('&');
      const submits = [];
      f.addEventListener('submit', (e) => {
        e.preventDefault();
        submits.push(entries(e.submitter));
      });
      const click = (el, init) =>
        el.dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true, ...init }));
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
      out.push(
        ['pageX', 'pageY', 'x', 'y', 'offsetX', 'offsetY'].map((k) => (k in w.MouseEvent.prototype ? e[k] : '-')),
      );
      try {
        new w.FormData(d.createElement('form'), 0);
        out.push('no throw');
      } catch (err) {
        out.push(err.constructor.name);
      }
      return out;
    },
    { jsdom },
  );
}

for (const jsdom of [26, 20]) {
  parity(
    `form submission: the submit event's interface (jsdom ${jsdom})`,
    (w) => {
      w.document.body.innerHTML = '<form><input type=submit name=s><button name=b>b</button></form>';
      const f = w.document.querySelector('form');
      const seen = [];
      f.addEventListener('submit', (e) => {
        e.preventDefault();
        seen.push([e.constructor.name, e.submitter?.name ?? null, e.bubbles, e.cancelable]);
      });
      for (const el of w.document.querySelectorAll('input, button')) el.click();
      return [typeof w.SubmitEvent, seen];
    },
    { jsdom },
  );
}

test('jsdom before 16.5.2: a click on a detached checkbox or radio also fires input and change', () => {
  for (const [jsdom, expected] of [
    ['16.4.0', ['input', 'change']],
    ['16.5.1', ['input', 'change']],
    ['16.5.2', []],
    ['20.0.3', []],
    [undefined, []],
  ]) {
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
    try {
      i.value = type === 'number' ? '5' : 'foo bar';
    } catch (e) {
      out.push(e.name);
    }
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
  d.body.innerHTML =
    '<form><input name=a><input type=checkbox name=b><select><option>1<option>2</select><textarea>t</textarea></form>';
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
  assert.deepEqual(
    [cloned('29.1.1'), cloned('30.0.1'), cloned('30.1.0'), cloned('30.1.2')],
    [false, false, true, true],
  );
});

// Input type change (#42): value mode transitions, sanitization of the
// kept value, and the selection when the new type has one.
const TYPE_CHANGE_TYPES = [
  'text',
  'hidden',
  'checkbox',
  'file',
  'number',
  'color',
  'email',
  'url',
  'date',
  'button',
  'radio',
  'range',
  'search',
];
const typeChange = (w) => {
  const d = w.document;
  const out = [];
  for (const from of TYPE_CHANGE_TYPES) {
    for (const to of TYPE_CHANGE_TYPES) {
      if (from === to) continue;
      const i = d.createElement('input');
      i.type = from;
      try {
        i.value = '  foo\nbar  ';
      } catch (e) {
        out.push(e.name);
      }
      i.type = to;
      out.push([from, to, i.value, i.getAttribute('value'), i.selectionStart, i.selectionEnd]);
    }
  }
  const mk = (attrs) => {
    const i = d.createElement('input');
    for (const [k, v] of Object.entries(attrs)) i.setAttribute(k, v);
    return i;
  };
  let i = mk({});
  i.value = 'foo';
  i.type = 'file';
  i.type = 'text';
  out.push(i.value);
  i.setAttribute('value', 'bar');
  out.push(i.value);
  i = mk({ value: 'hello' });
  i.type = 'color';
  out.push(i.value);
  i.type = 'text';
  out.push(i.value);
  i.setAttribute('value', 'again');
  out.push(i.value);
  i = mk({ value: ' x ' });
  i.type = 'url';
  i.type = 'text';
  out.push(i.value);
  i = mk({ value: 'hello' });
  d.body.append(i);
  const mo = new w.MutationObserver(() => {});
  mo.observe(i, { attributes: true, attributeOldValue: true });
  i.value = 'dirty';
  i.type = 'checkbox';
  out.push(mo.takeRecords().map((r) => [r.attributeName, r.oldValue]));
  i = mk({ value: 'attr' });
  i.value = 'dirty';
  i.type = 'file';
  i.type = 'text';
  out.push(i.value);
  i = mk({ type: 'range' });
  i.type = 'number';
  out.push(i.value);
  i = mk({ type: 'range', value: '500' });
  i.type = 'text';
  out.push(i.value);
  i = mk({ multiple: '' });
  i.value = ' a , b ';
  i.type = 'email';
  i.type = 'text';
  out.push(i.value);
  i = mk({});
  i.value = '2020-01-01 10:00';
  i.type = 'datetime-local';
  i.type = 'text';
  out.push(i.value);
  for (const [via, back] of [
    ['color', 'text'],
    ['number', 'text'],
    ['password', null],
    ['TEXT', null],
    ['search', null],
    ['bogus', null],
  ]) {
    i = mk({});
    i.value = 'hello';
    i.setSelectionRange(2, 4, 'backward');
    i.setAttribute('type', via);
    if (back) i.type = back;
    out.push([i.value, i.selectionStart, i.selectionEnd, i.selectionDirection]);
  }
  i = mk({});
  i.value = 'abc';
  let events = 0;
  i.addEventListener('select', () => events++);
  i.addEventListener('input', () => events++);
  i.type = 'hidden';
  out.push(events);
  const c = mk({ value: 'v' });
  c.type = 'number';
  out.push(c.cloneNode().value);
  return out;
};
for (const jsdom of [30, 20]) parity(`input type change (jsdom ${jsdom})`, typeChange, { jsdom });

// input type=week (#49): valueAsNumber (the Monday of the week, midnight
// UTC), valueAsDate, stepUp/stepDown (one week, step base 1970-W01) and
// min, max and step validity. Year with four or five digits, as jsdom.
const weekInput = (w) => {
  const d = w.document;
  const out = [];
  const attempt = (f) => {
    try {
      return f();
    } catch (e) {
      return e.name;
    }
  };
  for (const v of [
    '2019-W50',
    '2020-W53',
    '2021-W53',
    '2026-W53',
    '1970-W01',
    '1969-W20',
    '0001-W01',
    '00001-W01',
    '99999-W52',
    '99999-W53',
    '100000-W01',
    '275760-W37',
    '2019-W1',
    '2019-w50',
    '2019-W00',
    '',
  ]) {
    const i = d.createElement('input');
    i.type = 'week';
    i.value = v;
    out.push([v, i.value, i.valueAsNumber, i.valueAsDate === null ? null : i.valueAsDate.toISOString()]);
  }
  for (const n of [
    1575849600000,
    0,
    -259200000,
    1,
    86400000 * 3.5,
    -345600000,
    -20217600000,
    Date.UTC(2019, 11, 30),
    Date.UTC(2021, 0, 3),
    Date.UTC(2027, 0, 1),
  ]) {
    const i = d.createElement('input');
    i.type = 'week';
    i.valueAsNumber = n;
    out.push(['valueAsNumber', n, i.value]);
  }
  for (const date of [new Date(Date.UTC(2019, 11, 12)), new Date(0), new Date(NaN), null]) {
    const i = d.createElement('input');
    i.type = 'week';
    i.value = '2000-W01';
    out.push([
      'valueAsDate',
      attempt(() => {
        i.valueAsDate = date;
        return i.value;
      }),
    ]);
  }
  const step = (attrs, f) => {
    const i = d.createElement('input');
    i.type = 'week';
    for (const [k, v] of Object.entries(attrs)) i.setAttribute(k, v);
    return attempt(() => {
      f(i);
      return i.value;
    });
  };
  out.push(
    step({ value: '2019-W50' }, (i) => i.stepUp()),
    step({ value: '2019-W52' }, (i) => i.stepUp()),
    step({ value: '2020-W53' }, (i) => i.stepUp()),
    step({ value: '2019-W50' }, (i) => i.stepDown(3)),
    step({ value: '2019-W50', step: '2' }, (i) => i.stepUp()),
    step({ value: '2019-W50', step: '2', min: '2019-W01' }, (i) => i.stepUp()),
    step({}, (i) => i.stepUp()),
    step({}, (i) => i.stepDown()),
    step({ value: '2019-W50', max: '2019-W51' }, (i) => i.stepUp(5)),
    step({ value: '2019-W50', step: 'any' }, (i) => i.stepUp()),
    step({ value: '2019-W50', step: '0.5' }, (i) => i.stepUp()),
    step({ value: '2019-W50', step: '1.5' }, (i) => i.stepUp()),
  );
  const validity = (attrs) => {
    const i = d.createElement('input');
    i.type = 'week';
    for (const [k, v] of Object.entries(attrs)) i.setAttribute(k, v);
    const v = i.validity;
    return [v.rangeOverflow, v.rangeUnderflow, v.stepMismatch, v.valid, i.checkValidity(), i.matches(':invalid')];
  };
  out.push(
    validity({ value: '2019-W50', max: '2019-W01' }),
    validity({ value: '2019-W50', min: '2020-W01' }),
    validity({ value: '2019-W50', step: '2', min: '2019-W01' }),
    validity({ value: '2019-W50', step: '2' }),
    validity({ value: '2019-W50', min: 'bogus', max: 'x' }),
    validity({ value: '1970-W03', step: '2' }),
  );
  return out;
};
for (const jsdom of [30, 25, 20]) parity(`input type=week (jsdom ${jsdom})`, weekInput, { jsdom });

// The pattern attribute (#43): compiled as ^(?:pattern)$ only when the
// pattern compiles on its own (no escaping the group), with the v flag
// from jsdom 27.0.0 and the u flag before.
const patterns = (w) => {
  const d = w.document;
  const out = [];
  const cases = [
    ['[(]', ['foo', '(']],
    ['a)(b', ['x', 'a)(b', 'a']],
    ['a)|(b', ['x']],
    ['[a-z]{3}', ['abc', 'ab']],
    ['\\p{L}+', ['abc', '1']],
    ['[\\p{L}--[a-z]]', ['A', 'a']],
    ['[[a-z]&&[aeiou]]', ['a', 'b']],
    ['a|b', ['a', 'ab']],
    ['.', ['\u{1F600}']],
    ['[|]', ['|']],
    ['(', ['(']],
    ['a{', ['a{']],
    ['abc|', ['x']],
  ];
  for (const [pattern, values] of cases) {
    for (const value of values) {
      for (const type of ['text', 'email']) {
        const i = d.createElement('input');
        i.type = type;
        i.multiple = type === 'email';
        i.pattern = pattern;
        i.value = value;
        out.push([pattern, value, type, i.validity.patternMismatch]);
      }
    }
  }
  return out;
};
for (const jsdom of [30, 26, 20]) parity(`pattern attribute (jsdom ${jsdom})`, patterns, { jsdom });
test('pattern attribute: the v flag from jsdom 27.0.0', () => {
  const mismatch = (jsdom, pattern, value) => {
    const i = createWindow({ jsdom }).document.createElement('input');
    i.pattern = pattern;
    i.value = value;
    return i.validity.patternMismatch;
  };
  assert.deepEqual([mismatch('26.1.0', '[(]', 'foo'), mismatch('27.0.0', '[(]', 'foo')], [true, false]);
  assert.deepEqual(
    [mismatch('26.1.0', '[\\p{L}--[a-z]]', 'a'), mismatch('27.0.0', '[\\p{L}--[a-z]]', 'a')],
    [false, true],
  );
});

// stepUp() and stepDown() (#44): nothing when min > max, when max - min
// is less than the step, or when the result moves against the method;
// clamping to a value on the step; exact decimal arithmetic for steps and
// step mismatch. valueAsNumber: out of the Date range, NaN and Infinity.
const stepping = (w) => {
  const d = w.document;
  const out = [];
  const attempt = (f) => {
    try {
      return f();
    } catch (e) {
      return [e.name, e.message];
    }
  };
  const run = (type, attrs, op, n) => {
    const i = d.createElement('input');
    i.type = type;
    for (const [k, v] of Object.entries(attrs)) i.setAttribute(k, v);
    return [
      type,
      attrs,
      op,
      n,
      attempt(() => {
        if (n === undefined) i[op]();
        else i[op](n);
        return i.value;
      }),
    ];
  };
  const N = 'number';
  const cases = [
    [N, { min: '300', value: '200' }, 'stepDown'],
    [N, { min: '300', value: '200' }, 'stepUp'],
    [N, { max: '100', value: '200' }, 'stepUp'],
    [N, { min: '10', max: '5', value: '0' }, 'stepUp'],
    [N, { min: '10', max: '5', value: '0' }, 'stepDown'],
    ['range', { min: '3', max: '14', step: '3', value: '9' }, 'stepUp', 2],
    [N, { min: '0', max: '5', step: '3', value: '0' }, 'stepUp', 5],
    [N, { max: '7', value: '1', step: '3' }, 'stepUp', 5],
    [N, { min: '1', max: '2', step: '5', value: '1' }, 'stepUp'],
    [N, { min: '1', max: '2', step: '5' }, 'stepUp'],
    [N, { min: '0', max: '4', step: '5', value: '-5' }, 'stepUp'],
    [N, { min: '0', max: '5', step: '5', value: '-5' }, 'stepUp'],
    [N, { min: '2', max: '3', step: '2', value: '0' }, 'stepUp'],
    [N, { min: '1.5', max: '2.5', step: '2', value: '7' }, 'stepDown'],
    [N, { min: '0.1', max: '0.3', step: '0.2', value: '-1' }, 'stepUp'],
    [N, { value: '1.5' }, 'stepUp'],
    [N, { value: '1.5' }, 'stepDown'],
    [N, { min: '5' }, 'stepDown'],
    [N, { max: '-5' }, 'stepUp'],
    [N, { min: '1', value: '5' }, 'stepDown', 10],
    [N, { value: '5' }, 'stepUp', -2],
    [N, { value: '5' }, 'stepUp', 1.9],
    [N, { value: '5' }, 'stepUp', 'x'],
    ['date', { min: '2020-01-10', value: '2020-01-05' }, 'stepDown'],
    ['datetime-local', { min: '2020-01-10T00:00', value: '2020-01-05T00:00' }, 'stepDown'],
    ['time', { min: '10:00', value: '09:00' }, 'stepDown'],
    ['month', { min: '2020-05', value: '2020-01' }, 'stepDown'],
    ['week', { min: '2020-W10', value: '2020-W05' }, 'stepDown'],
    ['time', { max: '10:00', value: '11:00' }, 'stepUp'],
    ['range', {}, 'stepUp', 100],
    ['range', {}, 'stepDown', 100],
    ['date', { min: '2020-01-01', max: '2020-01-02', step: '2', value: '2019-12-01' }, 'stepUp'],
    ['time', { min: '10:00', max: '10:01', step: '120', value: '09:00' }, 'stepUp'],
    [N, { step: '3e-15', value: '17' }, 'stepUp'],
    [N, { step: '3e-15', value: '17' }, 'stepDown'],
    [N, { step: '0.1', value: '0.2' }, 'stepUp'],
    [N, { step: 'any', value: '1' }, 'stepUp'],
    ['text', {}, 'stepUp'],
    ['time', { step: '0.5', value: '10:00' }, 'stepUp'],
    ['time', { step: '0.0001', value: '10:00' }, 'stepUp'],
  ];
  for (const c of cases) out.push(run(...c));
  for (const [step, value] of [
    [3e-15, '17'],
    [0.003, '3.6'],
    [1e-12, '-12345678.9'],
    [0.1, '0.3'],
    [1e-15, '1'],
    [1 / 3, '1'],
    [3, '1e20'],
    [0.5, '1e-320'],
    [0.25, '0.75'],
  ]) {
    const i = d.createElement('input');
    i.type = 'number';
    i.step = step;
    i.value = value;
    out.push([step, value, i.validity.stepMismatch]);
  }
  for (const [type, n] of [
    ['time', 1500],
    ['time', 100],
    ['time', 0.0001 * 1000 + 36000000],
    ['datetime-local', 1000],
    ['number', NaN],
    ['number', Infinity],
    ['text', NaN],
    ['text', 5],
    ['date', NaN],
  ]) {
    const i = d.createElement('input');
    i.type = type;
    out.push([
      type,
      n,
      attempt(() => {
        i.valueAsNumber = n;
        return i.value;
      }),
    ]);
  }
  for (const [type, v] of [
    ['time', '10:00:00.5'],
    ['time', '10:00:00.05'],
    ['datetime-local', '2020-01-01 10:00:00.5'],
    ['datetime-local', '2020-01-01T10:00:05'],
    ['datetime-local', '2020-01-01T10:00:00.123'],
  ]) {
    const i = d.createElement('input');
    i.type = type;
    i.value = v;
    out.push([type, v, i.value, i.valueAsNumber]);
  }
  return out;
};
for (const jsdom of [30, 25, 22, 20])
  parity(`stepUp, stepDown and valueAsNumber (jsdom ${jsdom})`, stepping, { jsdom });

test('valueAsNumber = NaN throws before jsdom 23.1.0; time strings change in 30.1.0', () => {
  const nan = (jsdom) => {
    const i = createWindow({ jsdom }).document.createElement('input');
    i.type = 'number';
    try {
      i.valueAsNumber = NaN;
      return i.value;
    } catch (e) {
      return e.constructor.name;
    }
  };
  assert.deepEqual([nan('23.0.1'), nan('23.1.0')], ['TypeError', '']);
  const time = (jsdom) => {
    const d = createWindow({ jsdom }).document;
    const i = d.createElement('input');
    i.type = 'time';
    i.valueAsNumber = 1500;
    const j = d.createElement('input');
    j.type = 'time';
    j.value = '10:00:00.5';
    return [i.value, j.valueAsNumber];
  };
  assert.deepEqual(time('30.0.1'), ['00:00:01.500', 36000005]);
  assert.deepEqual(time('30.1.0'), ['00:00:01.5', 36000500]);
  // Out of the Date range: no exception; jsdom 30.1.2 gives "" for
  // datetime-local (WPT input-valueasnumber.html).
  const i = createWindow().document.createElement('input');
  i.type = 'datetime-local';
  i.valueAsNumber = 2.734333707189448e26;
  assert.equal(i.value, '');
});

// Form owner and labels in trees not in a document (#46): the form
// attribute's id and a label's for are looked up in the element's tree,
// its root included (a form or label at the root).
parity('form owner and labels in disconnected trees', (w) => {
  const d = w.document;
  const out = [];
  for (const tag of ['input', 'button', 'fieldset', 'object', 'output', 'select', 'textarea']) {
    const f = d.createElement('form');
    f.id = 'form1';
    const el = d.createElement(tag);
    el.setAttribute('form', 'form1');
    f.append(el);
    out.push([tag, el.form === f, f.elements.length]);
    const div = d.createElement('div');
    const f2 = d.createElement('form');
    f2.id = 'other';
    const f3 = d.createElement('form');
    div.append(f2, f3);
    for (const id of ['other', '', 'nope']) {
      const c = d.createElement(tag);
      c.setAttribute('form', id);
      f3.append(c);
      out.push([tag, id, c.form === f2 ? 'by id' : c.form === f3 ? 'ancestor' : c.form]);
    }
  }
  const l1 = d.createElement('label');
  l1.innerHTML = '<input id="test16">';
  const l2 = d.createElement('label');
  l2.htmlFor = 'test16';
  l1.append(l2);
  out.push([l1.firstChild.labels.length, l2.control === l1.firstChild, l1.control === l1.firstChild]);
  const l3 = d.createElement('label');
  l3.htmlFor = 'self';
  l3.id = 'self';
  out.push(l3.control);
  const radio = d.createElement('input');
  radio.type = 'radio';
  radio.name = 'g';
  radio.checked = true;
  const r2 = d.createElement('input');
  r2.type = 'radio';
  r2.name = 'g';
  radio.append(r2);
  r2.checked = true;
  out.push([radio.checked, r2.checked]);
  const host = d.createElement('div');
  const sr = host.attachShadow({ mode: 'open' });
  sr.innerHTML = '<form id=s2></form><form id=s3><input form=s2 id=si2></form><label for=si2>x</label>';
  out.push([sr.getElementById('si2').form === sr.getElementById('s2'), sr.getElementById('si2').labels.length]);
  return out;
});

// Radio button groups (#47): a checked radio button unchecks the others
// of its group when its name changes, when it becomes a radio button and
// when its form owner changes on insertion; from jsdom 30.1.0 also when it
// becomes connected and when its form attribute changes.
const radioGroups = (w) => {
  const d = w.document;
  const out = [];
  const mk = (name = 'g', checked = true, type = 'radio') => {
    const r = d.createElement('input');
    r.type = type;
    r.name = name;
    r.checked = checked;
    return r;
  };
  let f = d.createElement('form');
  d.body.append(f);
  let a = mk();
  f.append(a);
  let b = mk();
  f.append(b);
  out.push(['form insert', a.checked, b.checked]);
  f = d.createElement('form');
  a = mk();
  f.append(a);
  b = mk();
  f.append(b);
  out.push(['detached form insert', a.checked, b.checked]);
  a = mk('h');
  d.body.append(a);
  b = mk('h');
  d.body.append(b);
  out.push(['body insert', a.checked, b.checked]);
  let div = d.createElement('div');
  a = mk('k');
  div.append(a);
  b = mk('k');
  div.append(b);
  out.push(['detached div insert', a.checked, b.checked]);
  a = mk('t');
  d.body.append(a);
  b = mk('t', true, 'checkbox');
  d.body.append(b);
  b.type = 'radio';
  out.push(['type change', a.checked, b.checked]);
  a = mk('n1');
  d.body.append(a);
  b = mk('n2');
  d.body.append(b);
  b.name = 'n1';
  out.push(['name change', a.checked, b.checked]);
  div = d.createElement('div');
  a = mk('dn');
  b = mk('dn2');
  div.append(a, b);
  b.name = 'dn';
  out.push(['name change detached', a.checked, b.checked]);
  d.body.insertAdjacentHTML('beforeend', '<form id=f1></form><form id=f2></form>');
  a = mk('fo');
  d.getElementById('f1').append(a);
  b = mk('fo');
  d.getElementById('f2').append(b);
  b.setAttribute('form', 'f1');
  out.push(['form attribute', a.checked, b.checked]);
  const frag = d.createDocumentFragment();
  a = mk('fr');
  b = mk('fr');
  frag.append(a, b);
  const c = mk('fr');
  d.body.append(c);
  d.body.append(frag);
  out.push(['fragment', a.checked, b.checked, c.checked]);
  d.body.insertAdjacentHTML(
    'beforeend',
    '<input type=radio name=p checked id=p1><input type=radio name=p checked id=p2><form><input type=radio name=pf checked id=pf1><input type=radio name=pf checked id=pf2></form>',
  );
  out.push(['parsed', ...['p1', 'p2', 'pf1', 'pf2'].map((id) => d.getElementById(id).checked)]);
  div = d.createElement('div');
  div.innerHTML = '<input type=radio name=q checked><input type=radio name=q checked>';
  out.push(['parsed detached', div.children[0].checked, div.children[1].checked]);
  d.body.append(div);
  out.push(['connected', div.children[0].checked, div.children[1].checked]);
  a = mk('anc');
  d.body.append(a);
  div = d.createElement('div');
  b = mk('anc');
  div.append(b);
  d.body.append(div);
  out.push(['ancestor', a.checked, b.checked]);
  const host = d.createElement('div');
  d.body.append(host);
  const sr = host.attachShadow({ mode: 'open' });
  a = mk('sh');
  sr.append(a);
  b = mk('sh');
  sr.append(b);
  out.push(['shadow', a.checked, b.checked]);
  f = d.createElement('form');
  d.body.append(f);
  a = mk('rm', false);
  b = mk('rm', false);
  f.append(a, b);
  a.checked = true;
  b.remove();
  b.checked = true;
  out.push(['removed', a.checked, b.checked]);
  d.body.innerHTML = '<input type=radio name=r checked>';
  const r = d.body.firstChild;
  d.body.append(r.cloneNode());
  out.push(['clone', r.checked, d.body.lastChild.checked]);
  let events = 0;
  a = mk('evt');
  d.body.append(a);
  a.addEventListener('change', () => events++);
  a.addEventListener('input', () => events++);
  d.body.append(mk('evt'));
  out.push(['events', events]);
  return out;
};
for (const jsdom of [30, 26, 20]) parity(`radio button groups (jsdom ${jsdom})`, radioGroups, { jsdom });
test('radio button groups: becoming connected unchecks the group from jsdom 30.1.0', () => {
  const run = (jsdom) => {
    const d = createWindow({ jsdom }).document;
    const out = [];
    for (const name of ['a', 'b']) {
      const r = d.createElement('input');
      r.type = 'radio';
      r.name = 'g';
      r.checked = true;
      d.body.append(r);
      out.push(r);
    }
    return out.map((r) => r.checked);
  };
  assert.deepEqual(
    [run('30.0.1'), run('30.1.0')],
    [
      [true, true],
      [false, true],
    ],
  );
});

// option.text (#48): strip and collapse ASCII whitespace only (NBSP and
// other spaces stay); leave out HTML and SVG script elements only.
parity('option text: whitespace and script elements', (w) => {
  const d = w.document;
  const out = [];
  for (const html of [' text ', ' a \t b\n', ' x ', 'a\u000bb', '　y']) {
    const o = d.createElement('option');
    o.innerHTML = html;
    out.push([html, o.text, o.label, o.value]);
  }
  for (const [ns, name] of [
    ['http://www.w3.org/1998/Math/MathML', 'script'],
    [null, 'script'],
    ['http://www.w3.org/2000/svg', 'script'],
    ['http://www.w3.org/1999/xhtml', 'script'],
    ['http://www.w3.org/1999/xhtml', 'style'],
  ]) {
    const o = d.createElement('option');
    const sc = d.createElementNS(ns, name);
    sc.textContent = 'S';
    o.append('before ', sc, ' after');
    out.push([ns, name, o.text, o.value, o.label]);
  }
  const s = d.createElement('select');
  s.innerHTML = '<option> v </option><option value=" x "> </option>';
  out.push([s.value, s.options[1].text, s.options[1].label]);
  return out;
});

// Indexed properties (#50): select[i] (with its setter) in every version;
// form[i] from jsdom 26.1.0. No named properties on forms.
const indexedProperties = (w) => {
  const d = w.document;
  const out = [];
  const attempt = (f) => {
    try {
      return f();
    } catch (e) {
      return e.name;
    }
  };
  const f = d.createElement('form');
  f.innerHTML =
    '<input name=a id=ida><input name=b><select name=s><option>1</select><img name=im><fieldset name=fs></fieldset><input name=length>';
  out.push([typeof f[0], f[0] === f.elements[0], f[10], Object.getOwnPropertyNames(f), Object.keys(f)]);
  const forIn = [];
  for (const k in f) if (/^\d/.test(k)) forIn.push(k);
  out.push(forIn, [f.a, f.ida, typeof f.length], [0 in f, '1' in f, 7 in f, 'a' in f]);
  const desc = Object.getOwnPropertyDescriptor(f, '0');
  out.push(desc && [desc.writable, desc.enumerable, desc.configurable, desc.value === f.elements[0]]);
  out.push([
    attempt(() => delete f[0]),
    attempt(() => delete f[9]),
    attempt(() => {
      f[0] = 'x';
      return f[0] === f.elements[0];
    }),
    attempt(() => {
      f[50] = 'y';
      return f[50];
    }),
  ]);
  out.push(
    attempt(() => {
      Object.defineProperty(f, '1', { value: 3 });
      return f[1] === 3;
    }),
  );
  f.zz = 1;
  f.append(d.createElement('textarea'));
  out.push(Object.getOwnPropertyNames(f));
  const s = d.createElement('select');
  s.innerHTML = '<option>a</option><option>b</option>';
  out.push([s[1].text, Object.getOwnPropertyNames(s), 1 in s, 5 in s]);
  const o = d.createElement('option');
  o.text = 'new';
  s[3] = o;
  out.push([s.length, s[2].text, s[3].text]);
  s[0] = null;
  out.push([s.length, s[0].text]);
  out.push([
    attempt(() => {
      s[0] = 'str';
      return 'set';
    }),
    attempt(() => delete s[0]),
    attempt(() => delete s[9]),
  ]);
  const sd = Object.getOwnPropertyDescriptor(s, '0');
  out.push([sd.writable, sd.enumerable, sd.configurable, Object.keys(s), [...s].length]);
  out.push([
    f instanceof w.HTMLFormElement,
    Object.getPrototypeOf(s) === w.HTMLSelectElement.prototype,
    s.cloneNode(true)[1].text,
    f.cloneNode(true)[0]?.name ?? null,
  ]);
  d.body.innerHTML = '<form id=pf><input name=p></form><select id=ps><option>x</select>';
  out.push([
    d.getElementById('pf')[0]?.name ?? null,
    d.forms[0] === d.getElementById('pf'),
    d.getElementById('ps')[0].text,
    d.querySelector('select') === d.getElementById('ps'),
  ]);
  return out;
};
for (const jsdom of [30, 26, 25, 20]) parity(`form[i] and select[i] (jsdom ${jsdom})`, indexedProperties, { jsdom });
test('form[i] from jsdom 26.1.0', () => {
  const typeOf = (jsdom) => {
    const f = createWindow({ jsdom }).document.createElement('form');
    f.innerHTML = '<input>';
    return typeof f[0];
  };
  assert.deepEqual([typeOf('26.0.0'), typeOf('26.1.0')], ['undefined', 'object']);
});

// Smaller gaps (#51): reversed time ranges, textarea hard wrapping in form
// data, menuitem and HTMLDocument, form.action against the base URL, and
// the input.files setter.
const smallerGaps = (w) => {
  const d = w.document;
  const out = [];
  const attempt = (f) => {
    try {
      return f();
    } catch (e) {
      return [e.name, e.message];
    }
  };
  const time = (attrs) => {
    const i = d.createElement('input');
    i.type = 'time';
    for (const [k, v] of Object.entries(attrs)) i.setAttribute(k, v);
    return [attrs, i.validity.rangeOverflow, i.validity.rangeUnderflow, i.validity.valid];
  };
  for (const value of ['14:00', '12:00', '13:00', '15:00', '11:00', '23:59', '00:00'])
    out.push(time({ min: '14:00', max: '12:00', value }));
  out.push(
    time({ min: '14:00', value: '13:00' }),
    time({ min: '14:00', max: '', value: '15:00' }),
    time({ max: '12:00', value: '13:00' }),
    time({ min: '23:00', max: '01:00', value: '00:30' }),
  );
  const f = d.createElement('form');
  const t = d.createElement('textarea');
  t.name = 't';
  f.append(t);
  for (const [wrap, cols, value] of [
    ['hard', null, 'A'.repeat(45)],
    ['hard', null, 'ab\nabcdefghijklmnopqrstuvwxyz'],
    ['soft', 10, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'],
    ['HARD', 10, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'],
    ['hard', 3, 'a\r\nb'],
    ['hard', 3, 'abc'],
  ]) {
    t.setAttribute('wrap', wrap);
    if (cols) t.cols = cols;
    else t.removeAttribute('cols');
    t.value = value;
    out.push([wrap, cols, new w.FormData(f).get('t'), t.value]);
  }
  out.push([
    d.createElement('menuitem').constructor.name,
    typeof w.HTMLMenuItemElement,
    w.HTMLDocument === w.Document,
    d instanceof w.HTMLDocument,
  ]);
  const base = d.createElement('base');
  base.href = '/common/blank.html';
  d.head.append(base);
  const fa = d.createElement('form');
  fa.setAttribute('action', 'a.html');
  const fb = d.createElement('form');
  const fc = d.createElement('form');
  fc.setAttribute('action', '');
  out.push([fa.action, fb.action, fc.action]);
  base.remove();
  out.push(fa.action);
  const i1 = d.createElement('input');
  i1.type = 'file';
  const i2 = d.createElement('input');
  i2.type = 'file';
  out.push([
    attempt(() => {
      i1.files = i2.files;
      return i1.files === i2.files;
    }),
    attempt(() => {
      i1.files = null;
      return i1.files === i2.files;
    }),
    attempt(() => {
      i1.files = 'x';
      return 'set';
    }),
  ]);
  const text = d.createElement('input');
  out.push([
    text.files,
    attempt(() => {
      text.files = i2.files;
      return text.files;
    }),
  ]);
  return out;
};
for (const jsdom of [30, 25, 20])
  parity(`reversed time range, hard wrap, HTMLDocument, form.action, files (jsdom ${jsdom})`, smallerGaps, { jsdom });
test('textarea hard wrap with a cols attribute: before jsdom 24 and from 30.1.0', () => {
  const wrapped = (jsdom) => {
    const d = createWindow({ jsdom }).document;
    const f = d.createElement('form');
    f.innerHTML = '<textarea name=t wrap=hard cols=10></textarea>';
    f.firstChild.value = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    return new d.defaultView.FormData(f).get('t');
  };
  assert.equal(wrapped('23.2.0'), 'ABCDEFGHIJ\nKLMNOPQRST\nUVWXYZ');
  assert.equal(wrapped('30.1.0'), 'ABCDEFGHIJ\nKLMNOPQRST\nUVWXYZ');
});

// Own @@iterator on the form collections, a form iterable from jsdom
// 26.1.0, and autofocus and inputMode on the form controls' interfaces
// (inputMode reflected as written) (#70).
for (const jsdom of [20, 26, 30]) {
  parity(
    `form collections' @@iterator, form iteration, own autofocus and inputMode (jsdom ${jsdom})`,
    (w) => {
      const d = html(
        w,
        '<form id=f><input name=a type=radio><input name=a type=radio><button></button><select id=s><option>1<option>2</select><textarea></textarea></form>',
      );
      const form = d.getElementById('f');
      const out = [];
      for (const name of ['HTMLFormControlsCollection', 'HTMLOptionsCollection', 'RadioNodeList']) {
        const desc = Object.getOwnPropertyDescriptor(w[name].prototype, Symbol.iterator);
        out.push([name, typeof desc?.value, desc?.writable, desc?.enumerable, desc?.configurable]);
      }
      out.push(
        [...form.elements].length,
        [...form.elements.namedItem('a')].length,
        [...d.getElementById('s').options].length,
      );
      out.push(Object.hasOwn(w.HTMLFormElement.prototype, Symbol.iterator));
      try {
        out.push([...form].map((el) => el.tagName));
      } catch (err) {
        out.push(err.constructor.name);
      }
      for (const name of [
        'HTMLButtonElement',
        'HTMLInputElement',
        'HTMLSelectElement',
        'HTMLTextAreaElement',
        'HTMLFieldSetElement',
      ]) {
        out.push([
          name,
          ...['autofocus', 'inputMode'].map((k) => {
            const desc = Object.getOwnPropertyDescriptor(w[name].prototype, k);
            return desc && [typeof desc.get, typeof desc.set, desc.enumerable, desc.configurable];
          }),
        ]);
      }
      const input = form.querySelector('input');
      input.autofocus = true;
      input.inputMode = 'NUMERIC';
      const textarea = form.querySelector('textarea');
      textarea.setAttribute('inputmode', 'Decimal');
      out.push(
        input.getAttribute('autofocus'),
        input.inputMode,
        input.getAttribute('inputmode'),
        textarea.inputMode,
        form.querySelector('button').autofocus,
      );
      return out;
    },
    { jsdom },
  );
}

test('a form is iterable from jsdom 26.1.0', () => {
  for (const [jsdom, iterable] of [
    ['26.0.0', false],
    ['26.1.0', true],
    ['30.1.3', true],
  ]) {
    const w = createWindow({ jsdom });
    assert.equal(Symbol.iterator in w.HTMLFormElement.prototype, iterable, `jsdom ${jsdom}`);
  }
});

// A form's iterator reads its current controls at each step, as jsdom's
// (Array.prototype.values over form[i]): controls added or removed after
// next() show (Copilot review on #116).
for (const jsdom of [26, 30]) {
  parity(
    `form iteration sees controls added and removed while iterating (jsdom ${jsdom})`,
    (w) => {
      const d = html(w, '<form id=f><input id=a><input id=b></form>');
      const form = d.getElementById('f');
      const ids = (iterator, out) => {
        for (let step = iterator.next(); !step.done; step = iterator.next()) out.push(step.value.id);
        return out;
      };
      const added = form[Symbol.iterator]();
      const out = [added.next().value.id];
      const c = d.createElement('input');
      c.id = 'c';
      form.appendChild(c);
      ids(added, out);
      const removed = form[Symbol.iterator]();
      out.push('|', removed.next().value.id);
      d.getElementById('b').remove();
      ids(removed, out);
      const before = form[Symbol.iterator]();
      const e = d.createElement('input');
      e.id = 'e';
      form.appendChild(e);
      out.push('|');
      ids(before, out);
      out.push(form[Symbol.iterator].name);
      return out;
    },
    { jsdom },
  );
}
