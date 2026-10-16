import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { VERSION } from '../src/version.js';
import { createWindow } from '../src/node.js';

test('src/version.js matches package.json, and the user agent names it', () => {
  const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(VERSION, version);
  assert.match(createWindow().navigator.userAgent, new RegExp(` warpdom/${version.replaceAll('.', '\\.')}$`));
});
