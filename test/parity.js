// Runs a scenario on a jsdom window and on a warpdom window; the results,
// and what each printed on console.error, must be the same.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { JSDOM as JSDOM26 } from 'jsdom26';
import { JSDOM as JSDOM25 } from 'jsdom25';
import { createWindow } from '../src/node.js';

const URL_ = 'http://localhost:3000/page';

// jsdom: 30, 26 or 25 (jsdom 25.0.1 with cssstyle 4.1.0, as installed in
// its day; package.json pins that cssstyle for the jsdom25 alias).
export function parity(name, scenario, { jsdom = 30, url = URL_ } = {}) {
  const Dom = jsdom === 25 ? JSDOM25 : jsdom === 26 ? JSDOM26 : JSDOM;
  const profile = jsdom === 25 ? { jsdom: '25.0.1', cssstyle: '4.1.0' } : { jsdom };
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
    const expected = await run(new Dom('<!doctype html><html><head></head><body></body></html>', { url, runScripts: 'dangerously', pretendToBeVisual: true }).window);
    const actual = await run(createWindow({ url, ...profile }));
    assert.deepEqual(actual, expected);
  });
}

export const html = (w, markup) => { w.document.body.innerHTML = markup; return w.document; };
