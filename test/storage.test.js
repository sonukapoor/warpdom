import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWindow } from '../src/node.js';
import { snapshotWindow, resetWindow } from '../src/reset.js';
import { parity } from './parity.js';

parity('Web Storage: localStorage and sessionStorage', (w) => {
  const ls = w.localStorage;
  ls.setItem('b', '1');
  ls.setItem('a', 2);
  ls.c = '3';
  ls.length = 'x';
  const out = {
    read: [
      ls.length,
      ls.key(0),
      ls.key(1),
      ls.key(2),
      ls.key(9),
      ls.getItem('a'),
      typeof ls.getItem('a'),
      ls.getItem('zz'),
      ls.c,
      ls.zz,
      'a' in ls,
      'zz' in ls,
      ls.getItem('length'),
    ],
    keys: Object.keys(ls).filter((k) => k !== 'length'),
    json: JSON.stringify(ls),
    shape: [
      Object.prototype.toString.call(ls),
      ls instanceof w.Storage,
      w.sessionStorage === ls,
      w.sessionStorage.length,
      w.localStorage === ls,
    ],
  };
  delete ls.c;
  ls.removeItem('b');
  out.after = [Object.keys(ls).filter((k) => k !== 'length'), ls.length];
  const errors = [];
  for (const fn of [
    () => ls.setItem(),
    () => ls.getItem(),
    () => ls.setItem('big', 'x'.repeat(6e6)),
    () => new w.Storage(),
  ]) {
    try {
      fn();
      errors.push('ok');
    } catch (e) {
      errors.push([e.constructor.name, e.name, e.message]);
    }
  }
  out.errors = errors;
  ls.clear();
  out.cleared = ls.length;
  return out;
});

test('Web Storage: opaque origins and the per-file reset', () => {
  assert.throws(() => createWindow().localStorage, { name: 'SecurityError' });
  const w = createWindow({ url: 'http://localhost:3000/' });
  snapshotWindow(w);
  w.localStorage.setItem('k', 'v');
  w.sessionStorage.setItem('k', 'v');
  resetWindow(w);
  assert.equal(w.localStorage.length, 0);
  assert.equal(w.sessionStorage.length, 0);
});

test('QuotaExceededError instances are of their class (Node 24.6 returned a plain DOMException)', () => {
  const w = createWindow({ url: 'http://localhost/' });
  let error;
  try {
    w.localStorage.setItem('x', 'y'.repeat(5000001));
  } catch (e) {
    error = e;
  }
  assert.ok(error instanceof w.QuotaExceededError);
  assert.ok(error instanceof w.DOMException);
  assert.equal(error.constructor.name, 'QuotaExceededError');
  assert.equal(error.name, 'QuotaExceededError');
  assert.equal(error.quota, null);
  const direct = new w.QuotaExceededError('m', { quota: 5, requested: 6 });
  assert.deepEqual([direct.quota, direct.requested, direct.message], [5, 6, 'm']);
});
