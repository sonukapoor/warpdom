// Runs a scenario on a jsdom window and on a warpdom window; the results,
// and what each printed on console.error, must be the same.
import { test } from 'node:test';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { JSDOM as JSDOM26 } from 'jsdom26';
import { JSDOM as JSDOM25 } from 'jsdom25';
import { createWindow } from '../src/node.js';

const URL_ = 'http://localhost:3000/page';

// jsdom: 30, 26, 25 (jsdom 25.0.1 with cssstyle 4.1.0, as installed in
// its day; package.json pins that cssstyle for the jsdom25 alias), 22
// (22.1.0, cssstyle 3.0.0) or 20 (20.0.3, cssstyle 2.3.0: Jest 29's
// jest-environment-jsdom); 27, 28 and 29 (27.4.0, 28.1.0, 29.1.1).
// jsdom 20 and 22 are loaded when a test asks for them: their URL parser
// requires punycode, which Node 22.12 reports as deprecated on
// console.error (after the load, so outside the scenario's capture).
// 27 to 29 too, as only a few tests use them.
const DOMS = { 25: JSDOM25, 26: JSDOM26, 30: JSDOM };
const LAZY = { 20: 'jsdom20', 22: 'jsdom22', 27: 'jsdom27', 28: 'jsdom28', 29: 'jsdom29' };
async function domFor(jsdom) {
  if (!DOMS[jsdom] && LAZY[jsdom]) {
    DOMS[jsdom] = (await import(LAZY[jsdom])).JSDOM;
    await new Promise((resolve) => setImmediate(resolve));
  }
  return DOMS[jsdom];
}
// jsdom 30: the release installed (30.1.2 and 30.1.3 differ in computed
// shorthands), so the profile is that release's.
const JSDOM30 = createRequire(import.meta.url)('jsdom/package.json').version;
const PROFILES = { 20: { jsdom: '20.0.3', cssstyle: '2.3.0' }, 22: { jsdom: '22.1.0', cssstyle: '3.0.0' }, 25: { jsdom: '25.0.1', cssstyle: '4.1.0' }, 27: { jsdom: '27.4.0' }, 28: { jsdom: '28.1.0' }, 29: { jsdom: '29.1.1' }, 30: { jsdom: JSDOM30 } };
export function parity(name, scenario, { jsdom = 30, url = URL_ } = {}) {
  const profile = PROFILES[jsdom] ?? { jsdom };
  test(name, async () => {
    const Dom = await domFor(jsdom);
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
