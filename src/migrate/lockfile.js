// Enough of a lockfile for `warpdom migrate` (Node only): which version of
// a package a workspace package resolved, which version of a dependency a
// package resolved, and which packages depend on a package. Reads
// pnpm-lock.yaml (v5 to v9), package-lock.json / npm-shrinkwrap.json (v2,
// v3) and yarn.lock (classic and berry); anything else reads as empty.
import path from 'node:path';
import { readText } from './project.js';

const stripPeers = (v) => String(v).replace(/\(.*$/, '').replace(/^npm:/, '').trim();

// "name@version" / "/name/version" / "/name@version(peers)" -> [name, version]
function splitKey(key) {
  const k = key.replace(/^['"]|['"]$/g, '').replace(/^\//, '');
  const m = /^(@[^@/]+\/[^@/]+|[^@/]+)[@/](.+)$/.exec(k);
  return m ? [m[1], stripPeers(m[2])] : [k, null];
}

// { entries: [{ name, version, deps: { name: version or range } }],
//   importers: Map(dir rel ('' root) -> { name: version }), kind }
export function parseLockfile(root, lockfile) {
  const empty = { entries: [], importers: new Map(), kind: null };
  if (!lockfile) return empty;
  const text = readText(path.join(root, lockfile));
  if (text === null) return empty;
  if (lockfile === 'package-lock.json' || lockfile === 'npm-shrinkwrap.json') return npmLock(text);
  if (lockfile === 'pnpm-lock.yaml') return pnpmLock(text);
  if (lockfile === 'yarn.lock') return yarnLock(text);
  return empty;
}

function npmLock(text) {
  const out = { entries: [], importers: new Map(), kind: 'npm' };
  let doc;
  try { doc = JSON.parse(text); } catch { return out; }
  const packages = doc.packages ?? {};
  for (const [key, entry] of Object.entries(packages)) {
    if (!key.includes('node_modules/')) continue;
    const name = entry.name ?? key.slice(key.lastIndexOf('node_modules/') + 'node_modules/'.length);
    out.entries.push({ name, version: entry.version, deps: { ...entry.dependencies, ...entry.optionalDependencies }, key });
  }
  // A workspace package resolves name from its own node_modules, else the root's.
  const dirs = new Set(['', ...Object.keys(packages).filter((k) => k && !k.includes('node_modules/'))]);
  for (const dir of dirs) {
    const resolved = {};
    for (const e of out.entries) {
      const own = dir ? `${dir}/node_modules/${e.name}` : `node_modules/${e.name}`;
      if (e.key === own) resolved[e.name] = e.version;
      else if (!(e.name in resolved) && e.key === `node_modules/${e.name}`) resolved[e.name] = e.version;
    }
    out.importers.set(dir, resolved);
  }
  return out;
}

function pnpmLock(text) {
  const out = { entries: [], importers: new Map(), kind: 'pnpm' };
  const lines = text.split(/\r?\n/);
  let section = null;
  let entry = null;
  let importer = null;
  let depBlock = null;
  let pendingDep = null;
  const indentOf = (l) => l.length - l.trimStart().length;
  const byKey = new Map();
  for (const line of lines) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const indent = indentOf(line);
    if (indent === 0) {
      section = line.replace(/:.*$/, '');
      entry = null; importer = null; depBlock = null; pendingDep = null;
      // v5 single-package lockfiles list dependencies at the top level.
      if (['dependencies', 'devDependencies', 'optionalDependencies'].includes(section)) {
        importer = out.importers.get('') ?? {};
        out.importers.set('', importer);
        depBlock = section;
      }
      continue;
    }
    const trimmed = line.trim();
    if (section === 'importers') {
      if (indent === 2) {
        const dir = trimmed.slice(0, -1).replace(/^['"]|['"]$/g, '');
        importer = {};
        out.importers.set(dir === '.' ? '' : dir, importer);
        depBlock = null;
      } else if (indent === 4) depBlock = /^(dependencies|devDependencies|optionalDependencies):$/.test(trimmed) ? trimmed : null;
      else if (indent === 6 && depBlock && importer) {
        const m = /^(['"]?)(.+?)\1:\s*(.*)$/.exec(trimmed);
        if (m) {
          pendingDep = m[2];
          if (m[3]) importer[pendingDep] = stripPeers(m[3]);
        }
      } else if (indent === 8 && pendingDep && importer && trimmed.startsWith('version:')) importer[pendingDep] = stripPeers(trimmed.slice('version:'.length));
      continue;
    }
    if (['dependencies', 'devDependencies', 'optionalDependencies'].includes(section) && importer && indent === 2) {
      const m = /^(['"]?)(.+?)\1:\s*(.*)$/.exec(trimmed);
      if (m) {
        pendingDep = m[2];
        if (m[3]) importer[pendingDep] = stripPeers(m[3]);
      }
      continue;
    }
    if (['dependencies', 'devDependencies', 'optionalDependencies'].includes(section) && importer && indent === 4 && pendingDep && trimmed.startsWith('version:')) {
      importer[pendingDep] = stripPeers(trimmed.slice('version:'.length));
      continue;
    }
    if (section !== 'packages' && section !== 'snapshots') continue;
    if (indent === 2 && trimmed.endsWith(':')) {
      const [name, version] = splitKey(trimmed.slice(0, -1));
      const key = `${name}@${version}`;
      entry = byKey.get(key);
      if (!entry) {
        entry = { name, version, deps: {} };
        byKey.set(key, entry);
        out.entries.push(entry);
      }
      depBlock = null;
    } else if (indent === 4 && entry) depBlock = /^(dependencies|optionalDependencies):$/.test(trimmed) ? trimmed : null;
    else if (indent === 6 && entry && depBlock) {
      const m = /^(['"]?)(.+?)\1:\s*(.*)$/.exec(trimmed);
      if (m) entry.deps[m[2]] = stripPeers(m[3].replace(/^['"]|['"]$/g, ''));
    }
  }
  return out;
}

function yarnLock(text) {
  const out = { entries: [], importers: new Map(), kind: 'yarn' };
  let entry = null;
  let inDeps = false;
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim() || line.startsWith('#')) continue;
    const indent = line.length - line.trimStart().length;
    const trimmed = line.trim();
    if (indent === 0 && trimmed.endsWith(':')) {
      const specs = trimmed.slice(0, -1).split(/,\s*/).map((s) => s.replace(/^['"]|['"]$/g, ''));
      const m = /^(@?[^@]+)@/.exec(specs[0]);
      entry = { name: m ? m[1] : specs[0], version: null, deps: {}, specs: specs.map((s) => s.slice((m ? m[1].length : 0) + 1).replace(/^npm:/, '')) };
      out.entries.push(entry);
      inDeps = false;
      continue;
    }
    if (!entry) continue;
    if (indent === 2) {
      const v = /^version:?\s+['"]?([^'"\s]+)/.exec(trimmed);
      if (v) entry.version = v[1];
      inDeps = /^(dependencies|optionalDependencies):?$/.test(trimmed);
      continue;
    }
    if (indent === 4 && inDeps) {
      const m = /^(['"]?)(.+?)\1:?\s+['"]?([^'"]+)['"]?$/.exec(trimmed);
      if (m) entry.deps[m[2]] = m[3].replace(/^npm:/, '');
    }
  }
  return out;
}

// The version of name that the package at dir (rel, '' root) resolved, with
// its declared spec as a hint for yarn.
export function resolvedVersion(lock, dirRel, name, spec = null) {
  const own = lock.importers.get(dirRel)?.[name];
  if (own && /^\d/.test(own)) return own;
  if (lock.kind === 'yarn' && spec) {
    const e = lock.entries.find((x) => x.name === name && x.specs?.includes(spec));
    if (e?.version) return e.version;
  }
  const root = lock.importers.get('')?.[name];
  if (root && /^\d/.test(root) && dirRel === '') return root;
  const all = [...new Set(lock.entries.filter((e) => e.name === name && e.version).map((e) => e.version))];
  return all.length === 1 ? all[0] : null;
}

// The version of dep that name@version resolved.
export function dependencyVersion(lock, name, version, dep) {
  const e = lock.entries.find((x) => x.name === name && (x.version === version || version === null) && x.deps[dep]);
  if (!e) return null;
  const v = e.deps[dep];
  if (/^\d+\.\d+\.\d+/.test(v)) return v;
  // yarn: a range; the entry that resolves it.
  const r = lock.entries.find((x) => x.name === dep && x.specs?.includes(v));
  return r?.version ?? null;
}

// Packages that depend on each of names: Map(name -> Set('dependent@version')).
export function dependents(lock, names) {
  const out = new Map(names.map((n) => [n, new Set()]));
  for (const e of lock.entries) {
    for (const dep of Object.keys(e.deps)) if (out.has(dep)) out.get(dep).add(`${e.name}@${e.version}`);
  }
  return out;
}
