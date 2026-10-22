import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWindow } from '../src/index.js';

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

test('childList records for appends and removals, delivered asynchronously', async () => {
  const w = createWindow();
  const { document } = w;
  const list = document.body.appendChild(document.createElement('ul'));
  const records = [];
  const observer = new w.MutationObserver((batch, obs) => {
    records.push(...batch);
    assert.equal(obs, observer);
  });
  observer.observe(list, { childList: true });
  const a = list.appendChild(document.createElement('li'));
  const b = list.appendChild(document.createElement('li'));
  list.removeChild(a);
  assert.equal(records.length, 0, 'not delivered synchronously');
  await tick();
  assert.equal(records.length, 3);
  assert.ok(records[0] instanceof w.MutationRecord);
  assert.equal(records[0].type, 'childList');
  assert.equal(records[0].target, list);
  assert.equal(records[0].addedNodes[0], a);
  assert.equal(records[1].previousSibling, a);
  assert.equal(records[2].removedNodes[0], a);
  assert.equal(records[2].nextSibling, b);
});

test('subtree, attributes with old values and filters, characterData', async () => {
  const w = createWindow();
  const { document } = w;
  const root = document.body.appendChild(document.createElement('div'));
  const child = root.appendChild(document.createElement('span'));
  const text = child.appendChild(document.createTextNode('a'));
  const records = [];
  new w.MutationObserver((batch) => records.push(...batch)).observe(root, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeOldValue: true,
    attributeFilter: ['data-x'],
    characterData: true,
    characterDataOldValue: true,
  });
  child.setAttribute('data-x', '1');
  child.setAttribute('data-x', '2');
  child.setAttribute('title', 'ignored by the filter');
  text.data = 'b';
  child.appendChild(document.createElement('i'));
  await tick();
  assert.deepEqual(
    records.map((r) => r.type),
    ['attributes', 'attributes', 'characterData', 'childList'],
  );
  assert.deepEqual([records[0].attributeName, records[0].oldValue], ['data-x', null]);
  assert.equal(records[1].oldValue, '1');
  assert.equal(records[2].oldValue, 'a');
  assert.equal(records[3].target, child);
});

test('observe without subtree ignores descendants; disconnect and takeRecords', async () => {
  const w = createWindow();
  const { document } = w;
  const root = document.body.appendChild(document.createElement('div'));
  const child = root.appendChild(document.createElement('span'));
  let calls = 0;
  const observer = new w.MutationObserver(() => calls++);
  observer.observe(root, { childList: true });
  child.appendChild(document.createElement('i')); // not a direct child of root
  await tick();
  assert.equal(calls, 0);
  root.appendChild(document.createElement('b'));
  assert.equal(observer.takeRecords().length, 1);
  await tick();
  assert.equal(calls, 0, 'taken records are not delivered');
  observer.disconnect();
  root.appendChild(document.createElement('b'));
  await tick();
  assert.equal(calls, 0);
});

test('observe requires at least one of childList, attributes, characterData', () => {
  const w = createWindow();
  const observer = new w.MutationObserver(() => {});
  assert.throws(() => observer.observe(w.document.body, {}), TypeError);
});

import { parity as styleParity } from './parity.js';

for (const jsdom of [30, 26]) {
  styleParity(
    `style writes queue attribute records and custom element reactions (jsdom ${jsdom})`,
    async (w) => {
      const d = w.document;
      const el = d.createElement('div');
      d.body.appendChild(el);
      const records = [];
      const observer = new w.MutationObserver((list) =>
        records.push(...list.map((r) => `${r.attributeName}:${r.oldValue}`)),
      );
      observer.observe(el, { attributes: true, attributeOldValue: true });
      const attributes = el.attributes;
      el.style.height = '100px';
      await Promise.resolve();
      el.style.height = '100px';
      await Promise.resolve();
      el.style.cssText = 'height:100px';
      await Promise.resolve();
      el.style.removeProperty('width');
      await Promise.resolve();
      el.style.removeProperty('height');
      await Promise.resolve();
      const calls = [];
      class X extends w.HTMLElement {
        static get observedAttributes() {
          return ['style'];
        }
        attributeChangedCallback(name, old, value) {
          calls.push(`${name}:${old}->${value}`);
        }
      }
      w.customElements.define('x-el', X);
      const x = d.createElement('x-el');
      d.body.appendChild(x);
      x.style.color = 'red';
      x.style.color = 'blue';
      return [records, calls, attributes.length];
    },
    { jsdom },
  );
}

test('a registration moves with its node to another document', async () => {
  const w = createWindow();
  const d = w.document;
  const t = d.createElement('template');
  t.innerHTML = '<select></select>';
  const frag = t.content.cloneNode(true);
  const select = frag.firstChild;
  const log = [];
  const mo = new w.MutationObserver((records) => log.push(records.map((r) => r.type).join()));
  mo.observe(select, { childList: true, subtree: true });
  d.body.appendChild(frag);
  select.appendChild(d.createElement('option'));
  await Promise.resolve();
  assert.deepEqual(log, ['childList']);
  mo.disconnect();
  const other = d.implementation.createHTMLDocument('').createElement('div');
  mo.observe(other, { attributes: true });
  d.body.appendChild(other);
  other.id = 'x';
  await Promise.resolve();
  assert.deepEqual(log, ['childList', 'attributes']);
  mo.disconnect();
  other.id = 'y';
  await Promise.resolve();
  assert.equal(log.length, 2);
});
