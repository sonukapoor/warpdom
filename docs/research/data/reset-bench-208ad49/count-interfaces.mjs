// Counts the interface objects a warpdom window exposes.
// Usage: node count-interfaces.mjs <warpdom-dir> [jsdom profile, default 30.1.2]
import { pathToFileURL } from 'node:url';
import { resolve, join } from 'node:path';

const dir = resolve(process.argv[2] ?? process.env.WARPDOM_DIR ?? '.');
const profile = process.argv[3] ?? '30.1.2';
const { createWindow } = await import(pathToFileURL(join(dir, 'src/node.js')).href);
const { INTERFACES } = await import(pathToFileURL(join(dir, 'src/interfaces.js')).href);

const names = INTERFACES.map((i) => i.name);
console.log(`src/interfaces.js INTERFACES entries: ${names.length}, distinct names: ${new Set(names).size}`);

for (const jsdom of [profile, '20', '26', '27', '29']) {
  const window = createWindow({ url: 'http://localhost:3000', jsdom });
  // Method 1: own properties whose name starts with an uppercase letter and
  // whose value (read, which materializes lazy interfaces) is a function
  // with an object prototype.
  const upper = Object.getOwnPropertyNames(window).filter((n) => /^[A-Z]/.test(n));
  const ifaces = [];
  const others = [];
  for (const n of upper) {
    let v;
    try { v = window[n]; } catch { others.push(`${n}(throws)`); continue; }
    if (typeof v === 'function' && v.prototype !== null && typeof v.prototype === 'object') ifaces.push(n);
    else others.push(n);
  }
  // Of these, the ones that are warpdom's own interfaces (from INTERFACES),
  // and the rest (legacy factory functions Image/Audio/Option, platform
  // objects such as DOMException placed on the window).
  const own = ifaces.filter((n) => names.includes(n));
  const notInList = ifaces.filter((n) => !names.includes(n));
  console.log(`jsdom profile ${jsdom}: uppercase own properties ${upper.length}; constructor functions with object prototype ${ifaces.length} (from INTERFACES ${own.length}; others: ${notInList.join(', ')}); uppercase non-constructors: ${others.join(', ') || 'none'}`);
}
