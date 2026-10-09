// Runs a scenario on a jsdom window and on a warpdom window; the results,
// and what each printed on console.error, must be the same.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createWindow } from '../src/node.js';

const URL_ = 'http://localhost:3000/page';

export function parity(name, scenario) {
  test(name, async () => {
    const run = async (window) => {
      const errors = [];
      const original = console.error;
      console.error = (...args) => errors.push(args.map(String).join(' '));
      try {
        return { result: await scenario(window), errors };
      } finally {
        console.error = original;
      }
    };
    // As Vitest's jsdom environment creates it.
    const expected = await run(new JSDOM('<!doctype html><html><head></head><body></body></html>', { url: URL_, runScripts: 'dangerously', pretendToBeVisual: true }).window);
    const actual = await run(createWindow({ url: URL_ }));
    assert.deepEqual(actual, expected);
  });
}

export const html = (w, markup) => { w.document.body.innerHTML = markup; return w.document; };
