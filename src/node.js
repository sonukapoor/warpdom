// The Node entry point: the core, with parse5 loaded lazily through require
// the first time HTML is parsed, @rgrove/parse-xml the first time XML is,
// and the XPath engine (src/xpath.cjs) the first time XPath is used.
// Other runtimes use src/index.js and register parser loaders with
// setParserLoader() and setXmlParserLoader().
import { createRequire } from 'node:module';
import { setParserLoader } from './html.js';
import { setXmlParserLoader } from './xml.js';
import { setXPathLoader } from './dom-parsing.js';

const require = createRequire(import.meta.url);
setParserLoader(() => require('parse5'));
setXmlParserLoader(() => require('@rgrove/parse-xml'));
// CommonJS: require() of an ES module fails in Node 22.12 to 22.17 here.
setXPathLoader(() => require('./xpath.cjs'));

export * from './index.js';
