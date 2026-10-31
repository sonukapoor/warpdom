// Which Vitest project of a config runs a test file, for `warpdom migrate`
// (#200): a file that picks its environment with a comment takes the
// options (environmentOptions.warpdom.jsdom) of the project that runs it.
// Read from the config text the way the scanner reads it (js.js), never
// guessed: anything it cannot follow (computed include lists, projects
// named by glob, merged configs) makes the answer null, and the caller
// says so instead of assuming a project.
import { expandBraces } from '../compare/projects.js';

// Vitest's defaults: test.include (2.x to 5.x) and test.exclude (4.x and
// later; LEGACY_EXCLUDE for 2.x and 3.x).
export const DEFAULT_INCLUDE = ['**/*.{test,spec}.?(c|m)[jt]s?(x)'];
export const DEFAULT_EXCLUDE = ['**/node_modules/**', '**/.git/**'];
export const LEGACY_EXCLUDE = [
  '**/node_modules/**',
  '**/dist/**',
  '**/cypress/**',
  '**/.{idea,git,cache,output,temp}/**',
  '**/{karma,rollup,webpack,vite,vitest,jest,ava,babel,nyc,cypress,tsup,build,eslint,prettier}.config.*',
];
const defaultExclude = (major) => (major < 4 ? LEGACY_EXCLUDE : DEFAULT_EXCLUDE);

const isP = (t, v) => t?.type === 'punct' && t.value === v;
// Every regular expression metacharacter: an escaped glob character
// (\[, \*, \?) stays literal.
const escape = (c) => c.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');

// One path segment of a glob (no braces) as a regular expression source;
// null for what this matcher does not model (negated extglobs).
function segmentSource(segment) {
  let out = '';
  for (let i = 0; i < segment.length; i++) {
    const c = segment[i];
    // Extglobs: ?(a|b) *(a|b) +(a|b) @(a|b), one level.
    if ('?*+@!'.includes(c) && segment[i + 1] === '(') {
      const end = segment.indexOf(')', i + 2);
      const body = end < 0 ? null : segment.slice(i + 2, end);
      if (c === '!' || body === null || /[()[\]*?]/.test(body)) return null;
      const alt = `(?:${body.split('|').map(escape).join('|')})`;
      out += c === '@' ? alt : `${alt}${c}`;
      i = end;
    } else if (c === '*') out += '[^/]*';
    else if (c === '?') out += '[^/]';
    else if (c === '[') {
      const end = segment.indexOf(']', i + 2);
      if (end < 0) {
        out += '\\[';
        continue;
      }
      let body = segment.slice(i + 1, end);
      if (body[0] === '!') body = `^${body.slice(1)}`;
      out += `[${body.replace(/\\/g, '\\\\')}]`;
      i = end;
    } else if (c === '\\' && i + 1 < segment.length) out += escape(segment[++i]);
    else out += escape(c);
  }
  return out;
}

// Whether a relative POSIX path matches a glob relative to the same
// directory (dot files included, as Vitest globs its test files); null when
// the glob is outside what this matcher models (negations, absolute or
// parent paths, nested extglobs, brace ranges such as {1..3}).
export function matchGlob(file, pattern) {
  if (typeof pattern !== 'string' || !pattern || pattern.startsWith('!') || pattern.startsWith('/')) return null;
  const clean = pattern.replace(/^(\.\/)+/, '');
  if (clean.split('/').includes('..') || /\{[^{}]*\.\.[^{}]*\}/.test(clean)) return null;
  let matched = false;
  for (const p of expandBraces(clean)) {
    const segments = p.split('/').filter(Boolean);
    let source = '^';
    for (let i = 0; i < segments.length; i++) {
      const last = i === segments.length - 1;
      if (segments[i] === '**') {
        source += last ? '.*' : '(?:[^/]+/)*';
        continue;
      }
      const s = segmentSource(segments[i]);
      if (s === null) return null;
      source += s + (last ? '' : '/');
    }
    if (new RegExp(`${source}$`).test(file)) matched = true;
  }
  return matched;
}

// Whether a file (relative to the project's directory) is one of its
// tests: true, false, or null (a glob this matcher does not model).
export function selects(file, include, exclude) {
  if (file.startsWith('../') || file === '..') return false;
  const any = (globs) => {
    let unknown = false;
    for (const g of globs) {
      const m = matchGlob(file, g);
      if (m) return true;
      if (m === null) unknown = true;
    }
    return unknown ? null : false;
  };
  const inc = any(include);
  if (inc === false) return false;
  const exc = any(exclude);
  if (exc === true) return false;
  return inc === true && exc === false ? true : null;
}

// The elements of the array literal whose '[' is at token index open and
// whose ']' at close (the end of the property's value: not an array that
// a call such as .concat() adds to): each one's object literal (an
// object, or defineProject({ ... })), or null when an element is anything
// else (a string naming a directory or config file, a spread, a variable,
// a call).
function arrayObjects(a, open, close) {
  const { tokens } = a;
  if (!isP(tokens[open], '[')) return null;
  const out = [];
  let depth = 0;
  let start = open + 1;
  for (let k = open + 1; k < tokens.length; k++) {
    const t = tokens[k];
    const end = depth === 0 && (isP(t, ',') || isP(t, ']'));
    if (end) {
      if (k > start) {
        const obj = elementObject(a, start, k);
        if (!obj) return null;
        out.push(obj);
      }
      if (isP(t, ']')) return k === close ? out : null;
      start = k + 1;
      continue;
    }
    if (isP(t, '(') || isP(t, '[') || isP(t, '{')) depth++;
    else if (isP(t, ')') || isP(t, ']') || isP(t, '}')) depth--;
  }
  return null;
}
function elementObject(a, from, to) {
  const { tokens } = a;
  const whole = (k, close) => a.objects.find((o) => o.open === k && o.close === close) ?? null;
  if (isP(tokens[from], '{')) return whole(from, to - 1);
  if (
    tokens[from].type === 'ident' &&
    tokens[from].value === 'defineProject' &&
    isP(tokens[from + 1], '(') &&
    isP(tokens[to - 1], ')')
  )
    return whole(from + 2, to - 2);
  return null;
}

// The string values of an include / exclude array: Vitest's defaults
// spread in by name (configDefaults.include, defaultExclude) are read as
// those defaults; null for anything else.
function globList(a, prop, defaults, which) {
  const { tokens } = a;
  if (!isP(tokens[prop.valueStart], '[') || !isP(tokens[prop.valueEnd - 1], ']')) return null;
  const out = [];
  for (let k = prop.valueStart + 1; k < prop.valueEnd - 1; k++) {
    const t = tokens[k];
    if (isP(t, ',')) continue;
    if ((t.type === 'string' || t.type === 'template') && typeof t.value === 'string') {
      out.push(t.value);
      continue;
    }
    if (isP(t, '...')) {
      const names = [];
      let j = k + 1;
      while (tokens[j]?.type === 'ident') {
        names.push(tokens[j].value);
        if (!isP(tokens[j + 1], '.')) break;
        j += 2;
      }
      const name = names.join('.');
      if (name !== `configDefaults.${which}` && name !== `default${which[0].toUpperCase()}${which.slice(1)}`)
        return null;
      out.push(...defaults);
      k = j;
      continue;
    }
    return null;
  }
  return out;
}

const posixJoin = (...parts) => {
  const out = [];
  for (const part of parts.join('/').split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') {
      if (!out.length || out[out.length - 1] === '..') out.push('..');
      else out.pop();
    } else out.push(part);
  }
  return out.join('/');
};

const own = (a, frame, key) => (frame ? (a.properties.find((p) => p.frame === frame && p.key === key) ?? null) : null);
const literal = (a, p) => {
  const t = p && p.valueEnd - p.valueStart === 1 ? a.tokens[p.valueStart] : null;
  return t && (t.type === 'string' || t.type === 'template') && typeof t.value === 'string' ? t.value : null;
};
// A path option (root, test.root, test.dir): '' when not set, its string
// value, or null when migrate cannot follow it (not a string literal, or
// absolute: posixJoin only joins relative paths).
const pathOption = (a, p) => {
  if (!p) return '';
  const v = literal(a, p);
  return v === null || v.startsWith('/') || /^[A-Za-z]:[\\/]/.test(v) ? null : v;
};

// One project: its test options object (the frame environmentOptions
// lives in; null when it has none), its directory (relative to the
// directory the config sits in), its include / exclude globs (null when
// not literal), and whether it inherits the root config's options
// (extends: true, or no extends from Vitest 5). null when migrate cannot
// read it. Relative roots resolve the way Vitest resolves them: the root
// config's against the directory Vitest runs in (base), a project's
// `root` against the root config's root, a project's `test.root` against
// the root config's root from Vitest 5 and against base before.
function projectOf(a, obj, { base, parentRoot, major, inline }) {
  const testProp = own(a, obj, 'test');
  const frame = testProp ? (a.objects.find((o) => o.open === testProp.valueStart) ?? null) : null;
  if (testProp && !frame) return null; // test: someVariable
  // Options that come from elsewhere: spreads in the project or its test.
  if (a.spreads.some((s) => s.frame === obj || (frame && s.frame === frame))) return null;
  const viteRoot = pathOption(a, own(a, obj, 'root'));
  const testRoot = pathOption(a, own(a, frame, 'root'));
  const dir = pathOption(a, own(a, frame, 'dir'));
  if (viteRoot === null || testRoot === null || dir === null) return null;
  // test.root takes precedence over the Vite root.
  let root;
  if (!inline) root = posixJoin(base, testRoot || viteRoot);
  else if (testRoot) root = posixJoin(major >= 5 ? parentRoot : base, testRoot);
  else root = posixJoin(parentRoot, viteRoot);
  let inherits = false;
  const ext = own(a, obj, 'extends');
  if (ext) {
    const t = ext.valueEnd - ext.valueStart === 1 ? a.tokens[ext.valueStart] : null;
    if (t?.type !== 'ident' || (t.value !== 'true' && t.value !== 'false')) return null; // a config file
    inherits = t.value === 'true';
  } else inherits = inline && major >= 5;
  const includeProp = own(a, frame, 'include');
  const excludeProp = own(a, frame, 'exclude');
  const excludeDefaults = defaultExclude(major);
  return {
    frame,
    keyToken: testProp ? testProp.keyToken : obj.open,
    dir: posixJoin(root, dir),
    root,
    include: includeProp ? globList(a, includeProp, DEFAULT_INCLUDE, 'include') : DEFAULT_INCLUDE,
    exclude: excludeProp ? globList(a, excludeProp, excludeDefaults, 'exclude') : excludeDefaults,
    inherits,
  };
}

const MERGES = new Set(['mergeConfig', 'merge', 'deepmerge', 'defu', 'assign']);

// The token index of the bracket closing the one at open.
function closeOf(tokens, open) {
  let depth = 0;
  for (let k = open; k < tokens.length; k++) {
    const t = tokens[k];
    if (isP(t, '(') || isP(t, '[') || isP(t, '{')) depth++;
    else if ((isP(t, ')') || isP(t, ']') || isP(t, '}')) && --depth === 0) return k;
  }
  return -1;
}

// What a config file exports (export default ..., module.exports = ...):
// { object, within }. object: the object literal it is (export default
// { ... }, defineConfig({ ... }), or a variable declared as one), else
// null. within: the token range [open, close] of defineConfig's argument
// when that is something else (a function returning the config), else
// null. null when the file exports nothing migrate finds.
function exported(a) {
  const { tokens } = a;
  const is = (t, v) => t?.type === 'ident' && t.value === v;
  const objectAt = (v) => {
    while (is(tokens[v], 'defineConfig') && isP(tokens[v + 1], '(')) v += 2;
    return isP(tokens[v], '{') ? (a.objects.find((o) => o.open === v) ?? null) : null;
  };
  for (let k = 0; k < tokens.length; k++) {
    let v = -1;
    if (is(tokens[k], 'export') && is(tokens[k + 1], 'default')) v = k + 2;
    else if (
      is(tokens[k], 'module') &&
      isP(tokens[k + 1], '.') &&
      is(tokens[k + 2], 'exports') &&
      isP(tokens[k + 3], '=')
    )
      v = k + 4;
    if (v < 0) continue;
    let within = null;
    while (is(tokens[v], 'defineConfig') && isP(tokens[v + 1], '(')) {
      within = [v + 1, closeOf(tokens, v + 1)];
      v += 2;
    }
    let object = objectAt(v);
    // A variable: the object literal it is declared as.
    const t = tokens[v];
    if (!object && t?.type === 'ident' && !isP(tokens[v + 1], '(') && !isP(tokens[v + 1], '.')) {
      const decl = (j) => ['const', 'let', 'var'].some((d) => is(tokens[j], d)) && is(tokens[j + 1], t.value);
      const j = tokens.findIndex((_, i) => decl(i));
      if (j >= 0 && isP(tokens[j + 2], '=')) object = objectAt(j + 3);
    }
    return { object, within: object ? null : within };
  }
  return null;
}

// The projects of a Vitest config file (its analysis a), with directories
// relative to the config's own directory: { projects, inline } where
// inline says they come from test.projects / test.workspace (a file must
// match one), else the config is its own single project. Options: major
// (the Vitest major: default excludes, inheritance) and base (the
// directory Vitest runs in, relative to the config's). null when the
// config cannot be read reliably: several root `test` objects, merged or
// spread options, projects that are not all inline object literals, an
// inheriting project whose root config sets include, exclude or dir.
export function vitestProjects(a, { major = 5, base = '' } = {}) {
  const { tokens, properties } = a;
  for (let k = 0; k < tokens.length - 1; k++)
    if (tokens[k].type === 'ident' && MERGES.has(tokens[k].value) && isP(tokens[k + 1], '(')) return null;
  const roots = properties.filter((p) => p.key === 'test' && p.path.length === 1);
  if (roots.length > 1) return null;
  // No test options at all: the config is one project without any, when
  // it is an object literal that takes nothing from elsewhere (a spread).
  const out = exported(a);
  if (!roots.length) {
    const obj = out?.object;
    if (!obj || a.spreads.some((s) => s.frame === obj)) return null;
    return { inline: false, projects: [{ frame: null, keyToken: 0, dir: '', root: '', inherits: false }] };
  }
  // The `test` options of the exported config: its object literal's, or
  // inside the function defineConfig is given. Not an object the config
  // does not export (export default buildConfig()).
  const holder = roots[0].frame;
  const ok =
    out && (holder === out.object || (out.within && holder.open > out.within[0] && holder.close < out.within[1]));
  if (!ok) return null;
  // The config object itself (the one holding `test`).
  const root = projectOf(a, roots[0].frame, { base, major, inline: false });
  if (!root) return null;
  const list = properties.filter(
    (p) => (p.key === 'projects' || p.key === 'workspace') && p.frame === root.frame && root.frame,
  );
  if (!list.length) return { inline: false, projects: [root] };
  if (list.length > 1) return null;
  const objects = arrayObjects(a, list[0].valueStart, list[0].valueEnd - 1);
  if (!objects) return null;
  const selection = ['include', 'exclude', 'dir'].some((key) => own(a, root.frame, key));
  const projects = [];
  for (const obj of objects) {
    const p = projectOf(a, obj, { base, parentRoot: root.root, major, inline: true });
    if (!p) return null;
    // Inherited include / exclude / dir: merged with the project's own.
    if (p.inherits && selection) return null;
    projects.push(p.inherits ? { ...p, parent: root.frame } : p);
  }
  return { inline: true, projects };
}
