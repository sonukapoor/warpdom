// The Node entry point: the core, with parse5 loaded lazily through require
// the first time HTML is parsed. Other runtimes use src/index.js and register
// a parser loader with setParserLoader().
import { createRequire } from 'node:module';
import { setParserLoader } from './html.js';

const require = createRequire(import.meta.url);
setParserLoader(() => require('parse5'));

export * from './index.js';
