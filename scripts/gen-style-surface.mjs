// Measures, black box, the inline style surface of each jsdom/cssstyle
// combination warpdom has a profile for, and writes src/style-surface.js.
// Per profile key, next to jsdom 30.1 (STYLE_ACCESSORS, which the default
// profile has):
// - lacks: accessor names on jsdom 30's style prototype chain the profile
//   does not have ('webkitUserSelect' in style is false; internal `_`
//   names, methods and the declaration members are left out);
// - writes: accessors whose writes the profile keeps under another CSS name
//   than jsdom 30 (cssstyle 2 to 4.3: style.webkitUserSelect writes
//   webkit-user-select), or under a name setProperty drops, and accessors
//   it has besides jsdom 30's, for the properties warpdom's CSS data has,
//   under the name they write;
// - drops: CSS property names in warpdom's data that setProperty drops
//   (jsdom 30 keeps them);
// - extras: the names in writes that are not in warpdom's data (their
//   values are kept as written).
// It also checks that no profile keeps a property jsdom 30 drops, and that
// setProperty serializes every kept name as jsdom 30 does. Accessors a profile has
// for properties warpdom's data lacks (azimuth, -webkit-marquee, ...) are
// counted in a comment, not reproduced.
// jsdom and cssstyle are only installed and run, never read.
//   node scripts/gen-style-surface.mjs [--cache <dir>]
//     installs each combination with npm under <dir> (default: the system
//     temp directory) and writes src/style-surface.js;
//   node scripts/gen-style-surface.mjs --check <dir with jsdom installed> <key>
//     compares an installed jsdom (a project's checkout) with the data.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(root, 'src/style-surface.js');

// Profile keys (styleSurfaceKey in src/window-features.js) and the
// combinations measured for each: every combination under a key must give
// the same data. 'base' is jsdom 30.1, the default profile.
const COMBOS = {
  cssstyle2: [['20.0.3', '2.3.0']],
  cssstyle3: [['21.1.2', '3.0.0'], ['22.1.0', '3.0.0'], ['23.2.0', '3.0.0'], ['24.1.3', '4.0.1']],
  'cssstyle4.1': [['25.0.1', '4.1.0'], ['26.1.0', '4.2.1'], ['26.1.0', '4.3.0'], ['26.1.0', '4.3.1']],
  'cssstyle4.4': [['26.1.0', '4.4.0'], ['26.1.0', '4.5.0'], ['25.0.1', '4.6.0'], ['26.1.0', '4.6.0']],
  // cssstyle 5.2.0 does not load (a module path with a backslash).
  'cssstyle5.0': [['27.4.0', '5.0.0'], ['27.4.0', '5.1.0'], ['27.0.0', '5.2.1'], ['27.4.0', '5.2.1']],
  cssstyle5: [['27.0.0', '5.3.0'], ['27.4.0', '5.3.1'], ['27.4.0', '5.3.2'], ['27.4.0', '5.3.5'], ['27.4.0', '5.3.6'], ['27.2.0', '5.3.3'], ['27.4.0', '5.3.4'], ['27.4.0', '5.3.7'], ['28.0.0', '5.3.7']],
  'cssstyle6.0': [['28.1.0', '6.0.1'], ['28.1.0', '6.0.2']],
  'cssstyle6.1': [['28.1.0', '6.1.0'], ['28.1.0', '6.2.0']],
  'jsdom29.0': [['29.0.0'], ['29.0.1'], ['29.0.2']],
  'jsdom29.1': [['29.1.0'], ['29.1.1']],
  'jsdom30.0.0': [['30.0.0']],
  'jsdom30.0.1': [['30.0.1']],
  base: [['30.1.2'], ['30.1.0'], ['30.1.1']],
};

// The names CSSStyleDeclaration itself has (not properties).
const DECLARATION_MEMBERS = new Set(['cssText', 'length', 'parentRule', 'constructor']);

// The CSS name warpdom's accessor writes (as in src/css.js).
function cssName(accessor) {
  if (accessor === 'cssFloat') return 'float';
  if (accessor.includes('-')) return accessor;
  const dashed = accessor.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
  return /^(webkit|-webkit)-/.test(dashed) ? `-${dashed.replace(/^-/, '')}` : dashed;
}

// In a child process: the surface of the jsdom installed at `dir`.
async function probe(dir) {
  const { LONGHANDS, SHORTHANDS, ALIASES } = await import(pathToFileURL(join(root, 'src/css-data.js')));
  const { JSDOM } = createRequire(join(dir, 'package.json'))('jsdom');
  const { document } = new JSDOM('<!doctype html><html><head></head><body></body></html>').window;
  const names = new Set();
  for (let o = Object.getPrototypeOf(document.documentElement.style); o && o !== Object.prototype; o = Object.getPrototypeOf(o)) {
    for (const key of Object.getOwnPropertyNames(o)) {
      if (key.startsWith('_') || DECLARATION_MEMBERS.has(key) || /^\d+$/.test(key)) continue;
      const d = Object.getOwnPropertyDescriptor(o, key);
      if ('value' in d && typeof d.value === 'function') continue;
      names.add(key);
    }
  }
  // What a write keeps: the name cssText writes it under, or null when
  // every value is dropped. Each property takes some value of these:
  // CSS-wide keywords first (a validating cssstyle takes them for every
  // property), then common ones for an older cssstyle that drops keywords
  // for some properties.
  const kept = (name, write) => {
    for (const value of ['inherit', 'initial', 'unset', ...(LONGHANDS[name]?.[0] ? [LONGHANDS[name][0]] : []), 'none', 'solid', 'auto', 'normal', '0', '1px', '1', 'red']) {
      const s = document.createElement('div').style;
      write(s, value);
      const text = s.cssText;
      if (text === '') continue;
      return text.startsWith(`${name}:`) || text.includes(`; ${name}:`) ? name : text.slice(0, text.indexOf(':'));
    }
    return null;
  };
  const known = {};
  for (const name of [...Object.keys(LONGHANDS), ...Object.keys(SHORTHANDS), ...Object.keys(ALIASES)]) known[name] = kept(name, (s, v) => s.setProperty(name, v));
  const writes = {};
  for (const accessor of names) writes[accessor] = kept(cssName(accessor), (s, v) => { s[accessor] = v; });
  return { names: [...names], known, writes };
}

const measure = (dir) => JSON.parse(execFileSync(process.execPath, [fileURLToPath(import.meta.url), '--probe', dir], { encoding: 'utf8', maxBuffer: 1 << 26 }));

function install(cache, jsdom, cssstyle) {
  const dir = join(cache, `jsdom${jsdom}${cssstyle ? `-cssstyle${cssstyle}` : ''}`);
  if (!existsSync(join(dir, 'node_modules/jsdom'))) {
    mkdirSync(dir, { recursive: true });
    const pkg = { private: true, dependencies: { jsdom, ...(cssstyle && { cssstyle }) }, ...(cssstyle && { overrides: { cssstyle } }) };
    writeFileSync(join(dir, 'package.json'), JSON.stringify(pkg));
    execFileSync('npm', ['install', '--no-audit', '--no-fund', '--ignore-scripts', '--silent'], { cwd: dir, stdio: 'inherit' });
  }
  return dir;
}

// A profile's data next to jsdom 30.1's (see the top of the file).
async function diff(m, base) {
  const { LONGHANDS, SHORTHANDS, ALIASES } = await import(pathToFileURL(join(root, 'src/css-data.js')));
  const inData = (name) => name in LONGHANDS || name in SHORTHANDS || name in ALIASES;
  const names = new Set(m.names), baseNames = new Set(base.names);
  for (const [name, as] of Object.entries(m.known)) {
    if (as !== null && base.known[name] === null) throw new Error(`a profile keeps ${name}, which jsdom 30 drops`);
    if (as !== null && as !== base.known[name]) throw new Error(`a profile serializes ${name} as ${as}`);
  }
  const writes = {}, unsupported = [];
  for (const accessor of m.names) {
    const target = m.writes[accessor];
    // An accessor jsdom 30 has, writing the same name, unless setProperty
    // drops that name (cssstyle 2: webkitTextFillColor keeps a value,
    // setProperty('-webkit-text-fill-color') drops it).
    if (baseNames.has(accessor) && target === base.writes[accessor] && !(target !== null && base.known[target] != null && m.known[target] === null)) continue;
    if (target === null && baseNames.has(accessor)) throw new Error(`${accessor} keeps no value`);
    if (target !== null && (inData(target) || inData(`-${target}`))) writes[accessor] = target;
    else unsupported.push(accessor);
  }
  return {
    lacks: base.names.filter((n) => !names.has(n)),
    writes,
    drops: Object.keys(base.known).filter((n) => base.known[n] !== null && m.known[n] === null),
    extras: [...new Set(Object.values(writes))].filter((n) => !inData(n)),
    unsupported,
  };
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

async function main(args) {
  if (args[0] === '--probe') { process.stdout.write(JSON.stringify(await probe(args[1]))); return; }
  const option = (name) => (args.includes(name) ? args.slice(args.indexOf(name) + 1) : null);
  const cache = option('--cache')?.[0] ?? join(tmpdir(), 'warpdom-style-surface');
  const check = option('--check');
  const base = measure(install(cache, ...COMBOS.base[0]));
  const { STYLE_ACCESSORS } = await import(pathToFileURL(join(root, 'src/css-properties.js')));
  if (!same([...base.names].sort(), [...STYLE_ACCESSORS].sort())) throw new Error('jsdom 30\'s accessor names are not STYLE_ACCESSORS');
  if (check) {
    const { styleSurface, missingAccessors } = await import(pathToFileURL(join(root, 'src/css.js')));
    const got = await diff(measure(check[0]), base);
    const surface = styleSurface(check[1]);
    const sorted = (list) => [...list].sort();
    const result = {
      drops: same(sorted(got.drops), sorted(surface.drops)),
      writes: same(Object.fromEntries(Object.entries(got.writes).sort()), Object.fromEntries([...surface.writes].sort())),
      lacks: same(sorted(got.lacks), sorted(missingAccessors(surface))),
    };
    console.log(Object.entries(result).map(([k, ok]) => `${k}: ${ok ? 'same' : 'DIFFERENT'}`).join(', '));
    return;
  }
  const surfaces = {};
  for (const [key, combos] of Object.entries(COMBOS)) {
    let first = null;
    for (const [jsdom, cssstyle] of combos) {
      const data = await diff(measure(install(cache, jsdom, cssstyle)), base);
      console.log(`${key} (jsdom ${jsdom}${cssstyle ? `, cssstyle ${cssstyle}` : ''}): lacks ${data.lacks.length}, writes ${Object.keys(data.writes).length}, drops ${data.drops.length}, unsupported ${data.unsupported.length}`);
      if (first === null) first = data;
      else if (!same(first, data)) throw new Error(`${key}: jsdom ${jsdom} ${cssstyle ?? ''} differs from ${combos[0].join(' ')}`);
    }
    if (key !== 'base') surfaces[key] = first;
    else if (first.lacks.length + Object.keys(first.writes).length + first.drops.length + first.unsupported.length > 0) throw new Error('jsdom 30.1 differs');
  }
  // Each profile next to the next newer one (from): the names it also
  // drops and those it keeps; the accessors it also writes to another name
  // (their target when it is not the legacy one) and those it does not.
  const keys = Object.keys(surfaces).reverse();
  const entries = keys.map((key, i) => {
    const data = surfaces[key], newer = i > 0 ? surfaces[keys[i - 1]] : { drops: [], writes: {} };
    const entry = { ...(i > 0 && { from: keys[i - 1] }) };
    const drops = data.drops.filter((n) => !newer.drops.includes(n)), keeps = newer.drops.filter((n) => !data.drops.includes(n));
    const writes = Object.keys(data.writes).filter((a) => newer.writes[a] !== data.writes[a]);
    const unwrites = Object.keys(newer.writes).filter((a) => !(a in data.writes));
    const targets = Object.fromEntries(writes.filter((a) => data.writes[a] !== legacyTarget(a)).map((a) => [a, data.writes[a]]));
    if (drops.length) entry.drops = drops.join(' ');
    if (keeps.length) entry.keeps = keeps.join(' ');
    if (writes.length) entry.writes = writes.join(' ');
    if (Object.keys(targets).length) entry.targets = targets;
    if (unwrites.length) entry.unwrites = unwrites.join(' ');
    const combos = COMBOS[key].map(([j, c]) => `jsdom ${j}${c ? ` + cssstyle ${c}` : ''}`).join(', ');
    const fields = Object.entries(entry).map(([k, v]) => `    ${k}: ${JSON.stringify(v)},`);
    return `  // ${combos}: ${data.drops.length} names dropped, ${data.lacks.length} accessors missing, ${Object.keys(data.writes).length} writing another name;\n`
      + `  // ${data.unsupported.length} more accessors, for properties warpdom's data lacks (not reproduced).\n  ${JSON.stringify(key)}: {\n${fields.join('\n')}\n  },`;
  });
  writeFileSync(OUT, `// Generated by scripts/gen-style-surface.mjs (black box: jsdom and cssstyle
// installed and run). Do not edit. The inline style surface of the jsdom
// profiles before 30.1, each next to the newer one it names (from; the
// newest next to jsdom 30.1): drops, CSS names setProperty also drops (keeps:
// those it does not); writes, accessors that write another CSS name than
// jsdom 30's (cssstyle 2 to 4.3: webkitUserSelect writes webkit-user-select,
// targets gives the name when it is not that one) or that jsdom 30 does not
// have (unwrites: those it does not have). An accessor whose name is dropped
// and that does not write another name is missing. Lists are space-separated.
export const SURFACES = {
${entries.join('\n')}
};
`);
  console.log(`wrote ${OUT}`);
  // The runtime's reading of the data (src/css.js) gives what was measured.
  const { styleSurface, missingAccessors } = await import(pathToFileURL(join(root, 'src/css.js')));
  for (const [key, data] of Object.entries(surfaces)) {
    const surface = styleSurface(key);
    if (!same([...surface.drops].sort(), [...data.drops].sort())) throw new Error(`${key}: drops`);
    if (!same(Object.fromEntries([...surface.writes].sort()), Object.fromEntries(Object.entries(data.writes).sort()))) throw new Error(`${key}: writes`);
    const lacks = missingAccessors(surface);
    if (!same([...lacks].sort(), [...data.lacks].sort())) {
      const want = new Set(data.lacks), got = new Set(lacks);
      throw new Error(`${key}: missing accessors; measured only: ${data.lacks.filter((a) => !got.has(a)).join(' ')}; derived only: ${lacks.filter((a) => !want.has(a)).join(' ')}`);
    }
    if (!same([...surface.extras].sort(), [...data.extras].sort())) throw new Error(`${key}: extras`);
  }
  console.log('checked: src/css.js reads the data as measured');
}

// The name an accessor of cssstyle 2 to 4.3 writes: webkitUserSelect and
// webkit-user-select write webkit-user-select.
const legacyTarget = (accessor) => cssName(accessor).replace(/^-webkit-/, 'webkit-');

await main(process.argv.slice(2));
