// The warning for an installed jsdom newer than the newest one warpdom models.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newerJsdomWarning, NEWEST_MODELED_JSDOM } from '../src/window-features.js';

test('no warning for modeled jsdom versions and patch releases of the newest', () => {
  for (const version of ['20.0.3', '26.1.0', '29.1.1', '30.0.1', NEWEST_MODELED_JSDOM, '30.1.9', undefined, null]) {
    assert.equal(newerJsdomWarning(version), null, String(version));
  }
});

test('a warning for a newer minor or major release', () => {
  for (const version of ['30.2.0', '31.0.0', '32.4.1']) {
    const warning = newerJsdomWarning(version);
    assert.match(warning, new RegExp(`installed jsdom ${version.replaceAll('.', '\\.')} is newer than`));
    assert.match(warning, /github\.com\/sonukapoor\/warpdom\/issues/);
  }
});

test('a version without a minor part (a major alone) does not warn', () => {
  assert.equal(newerJsdomWarning('31'), null);
});

test('the Vitest adapter warns once when the project has a newer jsdom installed', async () => {
  const { mkdtempSync, mkdirSync, writeFileSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { jsdomProfile } = await import('../src/vitest.js');
  const root = mkdtempSync(join(tmpdir(), 'warpdom-newer-jsdom-'));
  try {
    writeFileSync(join(root, 'package.json'), '{"name":"fixture"}');
    mkdirSync(join(root, 'node_modules/jsdom'), { recursive: true });
    writeFileSync(
      join(root, 'node_modules/jsdom/package.json'),
      '{"name":"jsdom","version":"31.0.0","main":"index.js"}',
    );
    const warnings = [];
    const warn = console.warn;
    console.warn = (text) => warnings.push(text);
    try {
      assert.equal(jsdomProfile({}, root).jsdom, '31.0.0');
      jsdomProfile({}, root);
      jsdomProfile({ warpdom: { jsdom: '31.0.0' } }, root);
    } finally {
      console.warn = warn;
    }
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /installed jsdom 31\.0\.0 is newer than/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
