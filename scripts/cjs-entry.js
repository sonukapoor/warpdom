// The entry point of the CommonJS build (scripts/build-cjs.mjs): src/node.js
// with the parsers and the XPath engine required by the bundle itself, so
// esbuild bundles them (still loaded on first use). src/node.js creates its
// require with createRequire, which Jest replaces in a test file's module
// system by its own require, which cannot load parse5 (an ES module).
import { setParserLoader } from '../src/html.js';
import { setXmlParserLoader } from '../src/xml.js';
import { setXPathLoader } from '../src/dom-parsing.js';

setParserLoader(() => require('parse5'));
setXmlParserLoader(() => require('@rgrove/parse-xml'));
setXPathLoader(() => require('../src/xpath.cjs'));

export * from '../src/index.js';
