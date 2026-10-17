// Silence jsdom's "Not implemented" noise
const error = console.error;
console.error = (...args) => (String(args[0]).includes('Not implemented') ? undefined : error(...args));
