// Which Vitest project of a config runs a test file, for `warpdom migrate`
// (#200): a file that picks its environment with a comment takes the
// options (environmentOptions.warpdom.jsdom) of the project that runs it.
// Read from the config text the way the scanner reads it (js.js), never
// guessed: anything it cannot follow (computed include lists, projects
// named by glob, merged configs) makes the answer null, and the caller
// says so instead of assuming a project.
import { expandBraces } from '../compare/projects.js';

// Vitest's defaults (3.x): test.include and test.exclude.
export const DEFAULT_INCLUDE = ['**/*.{test,spec}.?(c|m)[jt]s?(x)'];
export const DEFAULT_EXCLUDE = ['**/node_modules/**', '**/.git/**'];

const isP = (t, v) => t?.type === 'punct' && t.value === v;
const escape = (c) => c.replace(/[.+^${}()|\\/]/g, '\\$&');

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
// parent paths, nested extglobs).
export function matchGlob(file, pattern) {
  if (typeof pattern !== 'string' || !pattern || pattern.startsWith('!') || pattern.startsWith('/')) return null;
  const clean = pattern.replace(/^(\.\/)+/, '');
  if (clean.split('/').includes('..')) return null;
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

// The elements of the array literal whose '[' is at token index open:
// each one's object literal (an object, or defineProject({ ... })), or
// null when an element is anything else (a string naming a directory or
// config file, a spread, a variable, a call).
function arrayObjects(a, open) {
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
      if (isP(t, ']')) return out;
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
function globList(a, prop, defaults) {
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
      const which = defaults === DEFAULT_INCLUDE ? 'include' : 'exclude';
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

// One project: its test options object (the frame environmentOptions
// lives in; null when it has none), its directory (relative to the
// directory the config sits in), its include / exclude globs (null when
// not literal), and whether it inherits options from elsewhere (extends).
function projectOf(a, obj, baseDir) {
  const own = (frame, key) => (frame ? a.properties.find((p) => p.frame === frame && p.key === key) : null);
  const literal = (p) => {
    const t = p && p.valueEnd - p.valueStart === 1 ? a.tokens[p.valueStart] : null;
    return t && (t.type === 'string' || t.type === 'template') && typeof t.value === 'string' ? t.value : null;
  };
  const testProp = own(obj, 'test');
  const frame = testProp ? (a.objects.find((o) => o.open === testProp.valueStart) ?? null) : null;
  if (testProp && !frame) return null; // test: someVariable
  // Options that come from elsewhere: spreads in the project or its test.
  if (a.spreads.some((s) => s.frame === obj || (frame && s.frame === frame))) return null;
  const rootProp = own(obj, 'root');
  const dirProp = own(frame, 'dir');
  if ((rootProp && literal(rootProp) === null) || (dirProp && literal(dirProp) === null)) return null;
  const root = posixJoin(baseDir, rootProp ? literal(rootProp) : '');
  const includeProp = own(frame, 'include');
  const excludeProp = own(frame, 'exclude');
  return {
    frame,
    keyToken: testProp ? testProp.keyToken : obj.open,
    dir: posixJoin(root, dirProp ? literal(dirProp) : ''),
    root,
    include: includeProp ? globList(a, includeProp, DEFAULT_INCLUDE) : DEFAULT_INCLUDE,
    exclude: excludeProp ? globList(a, excludeProp, DEFAULT_EXCLUDE) : DEFAULT_EXCLUDE,
    inherits: Boolean(own(obj, 'extends')),
  };
}

const MERGES = new Set(['mergeConfig', 'merge', 'deepmerge', 'defu', 'assign']);

// The projects of a Vitest config file (its analysis a), with directories
// relative to the config's own directory: { projects, inline } where
// inline says they come from test.projects / test.workspace (a file must
// match one), else the config is its own single project. null when the
// config cannot be read reliably: several root `test` objects, merged or
// spread options, projects that are not all inline object literals.
export function vitestProjects(a) {
  const { tokens, properties } = a;
  for (let k = 0; k < tokens.length - 1; k++)
    if (tokens[k].type === 'ident' && MERGES.has(tokens[k].value) && isP(tokens[k + 1], '(')) return null;
  const roots = properties.filter((p) => p.key === 'test' && p.path.length === 1);
  if (roots.length > 1) return null;
  // No test options at all: the config is one project without any.
  if (!roots.length)
    return { inline: false, projects: [{ frame: null, keyToken: 0, dir: '', root: '', inherits: false }] };
  // The config object itself (the one holding `test`).
  const root = projectOf(a, roots[0].frame, '');
  if (!root) return null;
  const list = properties.filter(
    (p) => (p.key === 'projects' || p.key === 'workspace') && p.frame === root.frame && root.frame,
  );
  if (!list.length) return { inline: false, projects: [root] };
  if (list.length > 1) return null;
  const objects = arrayObjects(a, list[0].valueStart);
  if (!objects) return null;
  const projects = [];
  for (const obj of objects) {
    const p = projectOf(a, obj, root.root);
    if (!p) return null;
    projects.push(p);
  }
  return { inline: true, projects };
}
