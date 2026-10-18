// Builds the CommonJS entry point, dist/warpdom.cjs: the core (src/node.js's
// exports, from scripts/cjs-entry.js) with parse5, @rgrove/parse-xml and
// the XPath engine, bundled into one CommonJS file by esbuild (a
// devDependency), for code that loads warpdom with require() where
// require() cannot load ES modules: Jest test files (Jest's module system
// runs CommonJS, and loads ES modules synchronously only on Node 24.9 and
// later), and Jest 27, which ignores package.json exports. Node itself loads
// src/node.js for both import and require() (the module-sync condition), so
// in Node there is one copy of warpdom. Also writes the CommonJS twin of the
// types, dist/warpdom.d.cts.
//
// The parsers and the XPath engine stay lazy: esbuild wraps a module that
// is require()d in a function that runs it on the first require().
//
// Run by npm pack and npm publish (prepack) and by npm test (pretest);
// dist/ is not committed.
import { build } from 'esbuild';
import { copyFileSync, mkdirSync, readFileSync, readdirSync, appendFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const { version } = JSON.parse(readFileSync(`${root}package.json`, 'utf8'));
const outfile = `${root}dist/warpdom.cjs`;

mkdirSync(`${root}dist`, { recursive: true });
const { metafile } = await build({
  entryPoints: [`${root}scripts/cjs-entry.js`],
  outfile,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  // ES modules are strict code; the bundle must be too (assignments to
  // read-only properties throw, as the specs and the tests expect).
  // __warpdomPlatformGlobal: Node's global object (src/internal.js,
  // PLATFORM_GLOBAL), also when Jest evaluates the bundle in a test file's
  // VM context: vm.runInThisContext runs in Node's main context.
  banner: {
    js: `// warpdom ${version}: CommonJS build (scripts/build-cjs.mjs); the source is src/.\n'use strict';\n`
      + "const __warpdomPlatformGlobal = require('node:vm').runInThisContext('globalThis');",
  },
  // Function and class names are observable (constructor.name, error
  // messages): keep them when the bundle renames clashing top-level names.
  keepNames: true,
  legalComments: 'none',
  metafile: true,
  logLevel: 'warning',
});

// The licenses of the bundled packages, at the end of the bundle.
const packages = new Set();
for (const input of Object.keys(metafile.inputs)) {
  const m = /node_modules\/((?:@[^/]+\/)?[^/]+)\//.exec(input);
  if (m) packages.add(m[1]);
}
let notices = '\n/*\n * Bundled packages and their licenses:\n';
for (const name of [...packages].sort()) {
  const dir = `${root}node_modules/${name}`;
  const pkg = JSON.parse(readFileSync(`${dir}/package.json`, 'utf8'));
  const file = readdirSync(dir).find((f) => /^licen[sc]e/i.test(f));
  notices += ` *\n * ${name} ${pkg.version} (${pkg.license})\n`;
  if (file) notices += readFileSync(`${dir}/${file}`, 'utf8').trim().split('\n').map((l) => ` * ${l}`.trimEnd()).join('\n').replaceAll('*/', '* /') + '\n';
}
appendFileSync(outfile, `${notices} */\n`);

copyFileSync(`${root}types/index.d.ts`, `${root}dist/warpdom.d.cts`);
