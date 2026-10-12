// Projects defined in separate files, for `warpdom compare` (Node only).
//
// Vitest `test.projects` (and the older workspace files) and Jest `projects`
// may name other config files, directories or globs of them. Compare
// resolves them the way the runner does, writes a wrapper next to each
// config found, and hands the root wrapper the explicit list, so every
// project's environment can be switched without editing a file.
import fs from 'node:fs';
import path from 'node:path';
import { findConfig } from './detect.js';

// Glob characters as the runners' glob libraries see them (a negation
// prefix, `*`, `?`, character classes, braces, extglobs).
export function isDynamicPattern(pattern) {
  return /^!|[*?[\]{}]|[@!+](\()/.test(pattern);
}

// {a,b} alternatives, expanded into separate patterns (nested braces too).
export function expandBraces(pattern) {
  let depth = 0;
  let start = -1;
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (c === '\\') { i++; continue; }
    if (c === '{') { if (depth++ === 0) start = i; } else if (c === '}' && depth > 0 && --depth === 0) {
      const body = pattern.slice(start + 1, i);
      const parts = [];
      let d = 0, from = 0;
      for (let j = 0; j < body.length; j++) {
        if (body[j] === '{') d++;
        else if (body[j] === '}') d--;
        else if (body[j] === ',' && d === 0) { parts.push(body.slice(from, j)); from = j + 1; }
      }
      parts.push(body.slice(from));
      if (parts.length < 2) continue;
      const before = pattern.slice(0, start), after = pattern.slice(i + 1);
      return parts.flatMap((p) => expandBraces(before + p + after));
    }
  }
  return [pattern];
}

const escape = (c) => c.replace(/[.+^${}()|\\]/g, '\\$&');

function segmentSource(segment) {
  let out = '';
  for (let i = 0; i < segment.length; i++) {
    const c = segment[i];
    if (c === '*') out += '[^/]*';
    else if (c === '?') out += '[^/]';
    else if (c === '[') {
      const end = segment.indexOf(']', i + 2);
      if (end < 0) { out += '\\['; continue; }
      let body = segment.slice(i + 1, end);
      if (body[0] === '!') body = `^${body.slice(1)}`;
      out += `[${body.replace(/\\/g, '\\\\')}]`;
      i = end;
    } else if (c === '\\' && i + 1 < segment.length) out += escape(segment[++i]);
    else out += escape(c);
  }
  return out;
}

// A glob (no braces) as a regular expression over a relative POSIX path.
export function globRegExp(pattern) {
  const segments = pattern.split('/').filter(Boolean);
  let source = '^';
  segments.forEach((segment, i) => {
    const last = i === segments.length - 1;
    if (segment === '**') source += last ? '.*' : '(?:[^/]+/)*';
    else source += segmentSource(segment) + (last ? '' : '/');
  });
  return new RegExp(`${source}/?$`);
}

const SKIP_DIRS = new Set(['node_modules', '.git']);

// Paths matching a glob, relative to cwd unless the pattern is absolute:
// files and directories (directories end with "/"), node_modules skipped,
// dot files included, as Vitest and Jest glob their projects.
export function glob(pattern, cwd) {
  const found = new Set();
  for (const p of expandBraces(pattern)) {
    const absolute = path.isAbsolute(p);
    const segments = p.split('/').filter((s, i) => s && !(i === 0 && s === '.'));
    let fixed = 0;
    while (fixed < segments.length - 1 && !isDynamicPattern(segments[fixed])) fixed++;
    const base = path.resolve(absolute ? '/' : cwd, ...segments.slice(0, fixed));
    const rest = segments.slice(fixed);
    const re = globRegExp(rest.join('/'));
    const maxDepth = rest.includes('**') ? Infinity : rest.length;
    const walk = (dir, rel, depth) => {
      let entries;
      try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
      for (const entry of entries) {
        if (SKIP_DIRS.has(entry.name) || entry.name === '.DS_Store' || entry.name.includes('.timestamp-')) continue;
        const full = path.join(dir, entry.name);
        const relPath = rel ? `${rel}/${entry.name}` : entry.name;
        let isDir = entry.isDirectory();
        if (entry.isSymbolicLink()) {
          try { isDir = fs.statSync(full).isDirectory(); } catch { continue; }
        }
        if (re.test(relPath)) found.add(isDir ? `${full}/` : full);
        if (isDir && depth + 1 < maxDepth && !entry.isSymbolicLink()) walk(full, relPath, depth + 1);
      }
    };
    walk(base, '', 0);
  }
  return [...found].sort();
}

const statOf = (file) => { try { return fs.statSync(file); } catch { return null; } };

// Vitest: each string of test.projects (or a workspace) as the runner
// resolves it: a config file, a directory's vitest.config.* / vite.config.*,
// or a directory without one (a project with the default config).
// Returns Map(string -> [{ config } | { dir }]).
export function resolveVitestProjects(patterns, root) {
  const out = new Map();
  const negated = patterns.filter((p) => p.startsWith('!'));
  const excluded = new Set(negated.flatMap((p) => glob(p.slice(1).replace('<rootDir>', root), root)));
  const entryOf = (file) => {
    if (file.endsWith('/')) {
      const config = findConfig(file, 'vitest');
      return config ? { config } : { dir: file };
    }
    return { config: file };
  };
  for (const pattern of patterns) {
    if (pattern.startsWith('!')) { out.set(pattern, []); continue; }
    const value = pattern.replace('<rootDir>', root);
    if (!isDynamicPattern(value)) {
      const file = path.resolve(root, value);
      const stat = statOf(file);
      if (!stat) continue; // the runner reports it
      out.set(pattern, [entryOf(stat.isDirectory() ? `${file.replace(/\/$/, '')}/` : file)]);
      continue;
    }
    out.set(pattern, glob(value, root).filter((f) => !excluded.has(f)).map(entryOf));
  }
  return out;
}

const JEST_CONFIG_EXTS = ['.js', '.ts', '.mjs', '.cjs', '.mts', '.cts', '.json'];

// Jest: each string of `projects` as jest-config resolves it: <rootDir>
// replaced, globs expanded from cwd (kept as given when nothing matches),
// directories read through their jest.config.* or package.json "jest".
// Returns Map(string -> [{ config } | { dir }]); a directory without a Jest
// config stays as it is.
export function resolveJestProjects(patterns, { rootDir, configDir, cwd }) {
  const out = new Map();
  for (const pattern of patterns) {
    const value = pattern.startsWith('<rootDir>') ? path.resolve(rootDir, `.${pattern.slice('<rootDir>'.length)}`) : pattern;
    let matches = isDynamicPattern(value) ? glob(value, cwd) : [];
    if (!matches.length) matches = [path.resolve(configDir, value)];
    const entries = [];
    for (const m of matches) {
      const file = m.replace(/\/$/, '');
      const stat = statOf(file);
      if (!stat) continue;
      if (stat.isDirectory()) {
        const config = findConfig(file, 'jest');
        entries.push(config ? { config } : { dir: file });
      } else if (JEST_CONFIG_EXTS.includes(path.extname(file))) entries.push({ config: file });
    }
    out.set(pattern, entries);
  }
  return out;
}
