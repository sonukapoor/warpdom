// Focus, checked against jsdom (see parity.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWindow } from '../src/node.js';
import { parity, html } from './parity.js';

const id = (el) => (el ? el.id || el.nodeName : null);

function logFocusEvents(w, log) {
  for (const type of ['focus', 'blur', 'focusin', 'focusout']) {
    w.document.addEventListener(
      type,
      (e) =>
        log.push(
          `${type}:${id(e.target)}:${id(e.relatedTarget)}:${e.bubbles}:${e.constructor.name}:${id(w.document.activeElement)}`,
        ),
      true,
    );
    w.addEventListener(type, (e) => {
      if (e.target === w) log.push(`window ${type}`);
    });
  }
}

parity('focus and blur: activeElement, events, relatedTarget', (w) => {
  const d = html(w, '<input id="a"><button id="b">b</button><div id="plain">p</div>');
  const log = [id(d.activeElement), d.hasFocus()];
  logFocusEvents(w, log);
  d.getElementById('a').focus();
  log.push(id(d.activeElement), d.hasFocus());
  d.getElementById('a').focus();
  log.push('focusing again fires nothing');
  d.getElementById('b').focus();
  log.push(id(d.activeElement));
  d.getElementById('plain').focus();
  log.push(`not focusable: ${id(d.activeElement)}`);
  d.getElementById('a').blur();
  log.push(`blur of an unfocused element: ${id(d.activeElement)}`);
  d.getElementById('b').blur();
  log.push(id(d.activeElement), d.hasFocus());
  return log;
});

parity('which elements are focusable', (w) => {
  const d = html(
    w,
    `<input id="i"><input id="hid" type="hidden"><input id="dis" disabled><button id="dt" disabled tabindex="0"></button>
    <div id="t0" tabindex="0"></div><div id="tm" tabindex="-1"></div><div id="tn" tabindex="-1"></div><a id="a1" href="#">l</a><a id="a2">l</a>
    <span id="ce" contenteditable></span><details><summary id="s1">s</summary><summary id="s2">s</summary></details>
    <fieldset disabled><button id="fs"></button></fieldset><div hidden><input id="inhidden"></div><div style="display:none"><input id="innone"></div>
    <svg><a id="sa" href="#"></a><circle id="sc" tabindex="0"></circle><rect id="sr"></rect></svg><iframe id="f"></iframe>`,
  );
  const detached = d.createElement('input');
  detached.id = 'detached';
  const out = [];
  for (const el of [...d.querySelectorAll('[id]'), detached]) {
    el.focus();
    out.push(`${el.id}:${d.activeElement === el}:${el.tabIndex}`);
  }
  d.documentElement.focus();
  out.push(`documentElement: ${id(d.activeElement)}`);
  return out;
});

parity('removing the focused element focuses the document without events', (w) => {
  const d = html(w, '<div id="wrap"><input id="a"></div>');
  const log = [];
  d.getElementById('a').focus();
  logFocusEvents(w, log);
  d.getElementById('wrap').remove();
  log.push(id(d.activeElement), d.hasFocus());
  d.body.innerHTML = '<input id="b">';
  d.getElementById('b').focus();
  return log;
});

// Removal checks the focused element's ancestors through a cache; these move
// the element while it is not focused, then remove its new ancestors.
parity('the focus fixup follows elements moved while not focused', (w) => {
  const d = html(w, '<div id="one"><input id="a"></div><div id="two"></div><div id="three"><input id="b"></div>');
  const [one, two, three, a, b] = ['one', 'two', 'three', 'a', 'b'].map((x) => d.getElementById(x));
  const out = [];
  a.focus();
  two.appendChild(d.createElement('span')).remove(); // a removal while a is focused
  a.blur();
  two.appendChild(a);
  a.focus();
  one.remove();
  out.push(id(d.activeElement));
  two.remove();
  out.push(id(d.activeElement));
  d.body.append(two);
  a.focus();
  b.focus();
  two.firstChild.remove(); // a is moved while b is focused
  three.appendChild(a);
  a.focus();
  three.appendChild(d.createElement('i')).remove();
  d.body.appendChild(d.createElement('div')).appendChild(three);
  out.push(id(d.activeElement));
  three.parentNode.remove();
  out.push(id(d.activeElement));
  return out;
});

parity('focus moved by a blur or focus listener wins', (w) => {
  const d = html(w, '<input id="a"><input id="b"><input id="c">');
  const [a, b, c] = ['a', 'b', 'c'].map((x) => d.getElementById(x));
  const log = [];
  a.focus();
  logFocusEvents(w, log);
  a.addEventListener('blur', () => c.focus(), { once: true });
  b.focus();
  log.push(id(d.activeElement));
  b.addEventListener('focus', () => a.focus(), { once: true });
  b.focus();
  log.push(id(d.activeElement));
  return log;
});

parity('tabIndex reflection and focus selectors', (w) => {
  const d = html(w, '<div id="x"><input id="i"></div>');
  const x = d.getElementById('x');
  const out = [x.tabIndex];
  x.tabIndex = 3;
  out.push(x.getAttribute('tabindex'), x.tabIndex);
  x.setAttribute('tabindex', ' 7 ');
  out.push(x.tabIndex);
  d.getElementById('i').focus();
  out.push(
    d.querySelector(':focus')?.id,
    d.querySelector('div:focus-within')?.id,
    d.getElementById('i').matches(':focus'),
  );
  return out;
});

parity('window focus methods report not implemented', (w) => {
  w.focus();
  w.blur();
  w.scrollTo(0, 10);
  w.alert('x');
  return [typeof w.HTMLElement.prototype.focus, typeof w.SVGElement.prototype.blur];
});

// Deliberate deviations from jsdom, following the standard: tabindex is
// parsed with the rules for parsing integers ("abc" is no value; jsdom
// converts it to 0), and a disabled fieldset is actually disabled, so not
// focusable even with a tabindex (jsdom focuses it).
test('focus follows the standard where jsdom differs', () => {
  const w = createWindow();
  w.document.body.innerHTML = '<fieldset id="f" disabled tabindex="0"></fieldset><div id="x" tabindex="x"></div>';
  w.document.getElementById('f').focus();
  w.document.getElementById('x').focus();
  assert.equal(w.document.activeElement, w.document.body);
});

test('tabIndex follows the standard for non-integer values', () => {
  const w = createWindow();
  const div = w.document.createElement('div');
  div.setAttribute('tabindex', 'abc');
  assert.equal(div.tabIndex, -1);
  div.setAttribute('tabindex', ' 7x');
  assert.equal(div.tabIndex, 7);
});

// jsdom before 30.1.2 focused elements that display: none or the hidden
// attribute keep from being rendered (ark-ui focuses a [hidden] input).
const renderingScenario = (w) => {
  const d = html(
    w,
    `<input id="h" hidden><input id="n" style="display:none"><div hidden><input id="in"></div>
    <input id="t" type="hidden"><div id="host"></div>`,
  );
  const result = [];
  for (const el of [...d.querySelectorAll('input')]) {
    el.focus();
    result.push(id(d.activeElement));
    d.activeElement.blur();
  }
  const root = d.getElementById('host').attachShadow({ mode: 'open' });
  root.innerHTML = '<input id="s" hidden>';
  root.getElementById('s').focus();
  result.push(id(root.activeElement));
  return result;
};
parity('focus: jsdom 26 profile ignores rendering', renderingScenario, { jsdom: 26 });
parity('focus: not rendered', renderingScenario);

test('focus: the rendering check starts with jsdom 30.1.2', () => {
  const focusesHidden = (jsdom) => {
    const w = createWindow({ jsdom });
    const input = w.document.createElement('input');
    input.hidden = true;
    w.document.body.append(input);
    input.focus();
    return w.document.activeElement === input;
  };
  assert.deepEqual(['26.1.0', '30.1.1', '30.1.2', '31.0.0', 29, 30, 31].map(focusesHidden), [
    true,
    true,
    false,
    false,
    true,
    false,
    false,
  ]);
});

// jsdom before 30.1.1 focused a disabled control that has a tabindex
// (Element Plus's tryFocus sets tabindex="-1" and focuses a disabled input).
const disabledScenario = (w) => {
  const d = html(
    w,
    `<input id="i" disabled tabindex="-1"><button id="b" disabled tabindex="0">b</button>
    <select id="s" disabled tabindex="-1"></select><textarea id="t" disabled tabindex="2"></textarea>
    <fieldset disabled><input id="f" tabindex="-1"><input id="g"></fieldset>
    <input id="n" disabled><input id="x" disabled tabindex="x">`,
  );
  return [...d.querySelectorAll('[id]')].map((el) => {
    el.focus();
    const focused = d.activeElement === el;
    d.activeElement.blur();
    return `${el.id}:${focused}`;
  });
};
parity('focus: a disabled control with a tabindex, jsdom 20 profile', disabledScenario, { jsdom: 20 });
parity('focus: a disabled control with a tabindex, jsdom 29 profile', disabledScenario, { jsdom: 29 });
parity('focus: a disabled control with a tabindex', disabledScenario);

test('focus: disabled controls with a tabindex stop being focusable in jsdom 30.1.1', () => {
  const focusesDisabled = (jsdom) => {
    const w = createWindow({ jsdom });
    w.document.body.innerHTML = '<input disabled tabindex="-1">';
    const input = w.document.body.firstChild;
    input.focus();
    return w.document.activeElement === input;
  };
  assert.deepEqual(['16.4.0', '23.0.1', '30.1.0', '30.1.1', '30.1.3', 16, 29, 30].map(focusesDisabled), [
    true,
    true,
    true,
    false,
    false,
    true,
    true,
    false,
  ]);
});

test('the focus fixup sees through shadow roots and across a window reset', async () => {
  const { resetWindow, snapshotWindow } = await import('../src/reset.js');
  const w = createWindow();
  snapshotWindow(w);
  const d = w.document;
  const host = d.body.appendChild(d.createElement('div'));
  const input = host.attachShadow({ mode: 'open' }).appendChild(d.createElement('input'));
  input.focus();
  assert.equal(d.activeElement, host);
  d.body.appendChild(d.createElement('p')).remove();
  host.remove();
  assert.equal(d.activeElement, d.body, 'removing the host unfocuses the shadow tree');
  const wrap = d.body.appendChild(d.createElement('div'));
  const a = wrap.appendChild(d.createElement('input'));
  a.focus();
  d.body.appendChild(d.createElement('p')).remove();
  resetWindow(w);
  const other = d.body.appendChild(d.createElement('section'));
  other.appendChild(wrap); // wrap was detached by the reset: no removal runs
  a.focus();
  assert.equal(d.activeElement, a);
  other.remove();
  assert.equal(d.activeElement, d.body, 'the ancestors cached before the reset are not used');
});
