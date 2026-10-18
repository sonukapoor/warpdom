// Where a package (jsdom, happy-dom) stays installed through other
// packages after `warpdom migrate` (Node only): the chain from one of the
// project's own dependencies down to it (jsonml.js@0.1.0 -> jsdom@8.5.0),
// from the lockfile (lockfile.js) or, without one, from node_modules.
import fs from 'node:fs';
import path from 'node:path';

// node_modules read as an npm lockfile: one entry per installed package,
// keyed by its path (node_modules/a/node_modules/b). Hidden directories
// (.bin, .pnpm, .cache) are not entered: pnpm projects have a lockfile.
export function nodeModulesTree(dir, { maxEntries = 50000, maxDepth = 10 } = {}) {
  const out = { entries: [], importers: new Map(), kind: 'node_modules' };
  const readMeta = (abs) => {
    try { return JSON.parse(fs.readFileSync(path.join(abs, 'package.json'), 'utf8')); } catch { return null; }
  };
  const visit = (nm, prefix, depth) => {
    if (depth > maxDepth || out.entries.length >= maxEntries) return;
    let list;
    try { list = fs.readdirSync(nm, { withFileTypes: true }); } catch { return; }
    for (const e of list) {
      if (e.name.startsWith('.') || !(e.isDirectory() || e.isSymbolicLink())) continue;
      let names = [e.name];
      if (e.name.startsWith('@')) {
        try { names = fs.readdirSync(path.join(nm, e.name)).filter((n) => !n.startsWith('.')).map((n) => `${e.name}/${n}`); } catch { names = []; }
      }
      for (const name of names) {
        const abs = path.join(nm, name);
        const meta = readMeta(abs);
        if (!meta) continue;
        const key = `${prefix}node_modules/${name}`;
        out.entries.push({ name, version: meta.version ?? null, deps: { ...meta.dependencies, ...meta.optionalDependencies }, key });
        visit(path.join(abs, 'node_modules'), `${key}/`, depth + 1);
      }
    }
  };
  visit(path.join(dir, 'node_modules'), '', 0);
  return out;
}

// How each lockfile kind resolves a dependency of an entry, and a root
// dependency of a workspace package.
function resolver(lock) {
  if (lock.kind === 'npm' || lock.kind === 'node_modules') {
    const byKey = new Map(lock.entries.map((e) => [e.key, e]));
    // Node's lookup: the nearest node_modules up from the dependent.
    const lookup = (base, dep) => {
      for (let b = base; ; ) {
        const hit = byKey.get(b ? `${b}/node_modules/${dep}` : `node_modules/${dep}`);
        if (hit) return hit;
        if (!b) return null;
        const i = b.lastIndexOf('/node_modules/');
        // node_modules/a and a workspace directory: the root's next.
        b = i >= 0 ? b.slice(0, i) : '';
      }
    };
    return { dep: (e, dep) => lookup(e.key, dep), root: (dirRel, name) => lookup(dirRel, name) };
  }
  if (lock.kind === 'pnpm') {
    const byId = new Map(lock.entries.map((e) => [`${e.name}@${e.version}`, e]));
    return {
      dep: (e, dep) => byId.get(`${dep}@${e.deps[dep]}`) ?? null,
      root: (dirRel, name) => {
        const v = lock.importers.get(dirRel)?.[name];
        return v ? byId.get(`${name}@${v}`) ?? null : null;
      },
    };
  }
  if (lock.kind === 'yarn') {
    const find = (name, range) => lock.entries.find((x) => x.name === name && x.specs?.includes(range)) ?? null;
    return { dep: (e, dep) => find(dep, e.deps[dep]), root: (dirRel, name, spec) => (spec ? find(name, spec) : null) };
  }
  return null;
}

const id = (e) => `${e.name}@${e.version}`;

// Every installed copy of the targets reachable from the roots (the
// project's own dependencies: [{ dir ('' root), name, spec }]): [{ name,
// version, chain: ['a@1', ..., 'jsdom@8.5.0'] (the shortest), roots:
// [names of every root that reaches it] }].
export function chains(lock, roots, targets) {
  const r = resolver(lock);
  if (!r) return [];
  const found = new Map(); // entry -> { chain, roots: Set }
  for (const root of roots) {
    const start = r.root(root.dir, root.name, root.spec);
    if (!start) continue;
    const parent = new Map([[start, null]]);
    const queue = [start];
    while (queue.length) {
      const e = queue.shift();
      if (targets.includes(e.name)) {
        if (e === start) continue;
        const chain = [];
        for (let x = e; x; x = parent.get(x)) chain.unshift(id(x));
        const f = found.get(e);
        if (!f) found.set(e, { chain, roots: new Set([root.name]) });
        else {
          f.roots.add(root.name);
          if (chain.length < f.chain.length) f.chain = chain;
        }
        continue;
      }
      for (const dep of Object.keys(e.deps ?? {})) {
        const next = r.dep(e, dep);
        if (next && !parent.has(next)) { parent.set(next, e); queue.push(next); }
      }
    }
  }
  return [...found].map(([e, f]) => ({ name: e.name, version: e.version, chain: f.chain, roots: [...f.roots].sort() }))
    .sort((a, b) => (a.name === b.name ? String(a.version).localeCompare(String(b.version)) : a.name < b.name ? -1 : 1));
}

// Entries that depend on name (or, for a scope such as '@csstools', on a
// package of it) and are not in the given set of entries nor type
// packages.
export function dependentsOutside(lock, name, inside) {
  const out = new Set();
  const matches = (dep) => dep === name || (name.startsWith('@') && !name.includes('/') && dep.startsWith(`${name}/`));
  for (const e of lock.entries) {
    // Type packages (@types/jsdom lists parse5) load nothing.
    if (inside.has(e) || matches(e.name) || e.name.startsWith('@types/')) continue;
    if (Object.keys(e.deps ?? {}).some(matches)) out.add(id(e));
  }
  return [...out].sort();
}

// The entries a package brings with it: itself and everything it depends
// on, transitively.
export function closure(lock, names) {
  const r = resolver(lock);
  const out = new Set();
  if (!r) return out;
  const queue = lock.entries.filter((e) => names.includes(e.name));
  for (const e of queue) out.add(e);
  while (queue.length) {
    const e = queue.shift();
    for (const dep of Object.keys(e.deps ?? {})) {
      const next = r.dep(e, dep);
      if (next && !out.has(next)) { out.add(next); queue.push(next); }
    }
  }
  return out;
}
