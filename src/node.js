// The Node entry point: the core, with parse5 loaded lazily through require
// the first time HTML is parsed, and @rgrove/parse-xml the first time XML is.
// Other runtimes use src/index.js and register parser loaders with
// setParserLoader() and setXmlParserLoader().
import { createRequire } from 'node:module';
import { setParserLoader } from './html.js';
import { setXmlParserLoader } from './xml.js';

const require = createRequire(import.meta.url);
setParserLoader(() => require('parse5'));
setXmlParserLoader(() => require('@rgrove/parse-xml'));

export * from './index.js';
