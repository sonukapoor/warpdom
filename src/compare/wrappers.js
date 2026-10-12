// Temporary wrapper configs for `warpdom compare` (Node only).
//
// A wrapper is written next to the project's own config (so relative paths
// inside it keep working), imports it, and changes only the environment of
// projects that run on jsdom or happy-dom. Node projects and Vitest browser
// projects are left alone. Every generated file name contains
// `.warpdom-compare.`, so cleanup can only ever delete files compare made.
//
// The wrapper also describes the projects it saw: with WARPDOM_COMPARE_META
// set, it writes them to that file; with WARPDOM_COMPARE_PROBE set as well,
// it then stops the runner (compare probes the config before running tests).
import path from 'node:path';

export const MARK = '.warpdom-compare.';
export const PROBE_MARKER = '[warpdom compare] config probe';

// The environment name test files pinned to jsdom or happy-dom get in the
// warpdom run: Vitest resolves a name it does not know as the package
// vitest-environment-<name>, which compare creates for the run.
export const PINNED_TARGET = 'warpdom-compare';
export const PINNED_PACKAGE = `vitest-environment-${PINNED_TARGET}`;

// The wrapper's file name for a config and a role (baseline, warpdom, probe,
// reporter): the config's own name with the mark, so wrappers of several
// configs in one directory do not collide, and Vitest still sees a
// `vitest.config.*` / `vite.config.*` name. Vitest bundles TS configs (the
// wrapper body is plain JS that is also valid TS); Jest loads a TS config
// only as TS, so a TS original gets a TS wrapper.
export function wrapperName(runner, base, role) {
  const ext = base ? path.extname(base) : '.js';
  const stem = base && path.basename(base) !== 'package.json' ? path.basename(base, ext) : `${runner}.config`;
  return runner === 'vitest'
    ? `${stem}${MARK}${role}.${/^\.[mc]?ts$/.test(ext) ? 'mts' : 'mjs'}`
    : `${stem}${MARK}${role}.${ext === '.ts' ? 'ts' : 'cjs'}`;
}

// The wrapper for a Vitest workspace file (Vitest 2 and 3), next to it.
export function workspaceWrapperName(workspace, role) {
  const ext = path.extname(workspace);
  return `${path.basename(workspace, ext)}${MARK}${role}.${/^\.[mc]?ts$/.test(ext) ? 'mts' : 'mjs'}`;
}

const importPath = (from, file) => {
  const rel = path.relative(from, file).split(path.sep).join('/');
  return rel.startsWith('.') ? rel : `./${rel}`;
};

// Shared by the Vitest wrappers: switching inline projects and replacing
// project strings (paths, globs) with the files compare resolved them to.
// LINKS.patterns: string -> [paths]; LINKS.extends: string -> path.
// warpdomOptions: merged into environmentOptions.warpdom of switched
// projects (e.g. { fastFrames: true }).
function vitestHelpers({ environment, links, warpdomOptions }) {
  return `const ENVIRONMENT = ${JSON.stringify(environment)};
const WARPDOM_OPTIONS = ${JSON.stringify(warpdomOptions ?? null)};
const LINKS = ${JSON.stringify({ patterns: links?.patterns ?? {}, extends: links?.extends ?? {} })};
const isObject = (v) => v && typeof v === 'object' && !Array.isArray(v) && typeof v.then !== 'function';
const isDom = (e) => e === 'jsdom' || e === 'happy-dom';
const usesBrowser = (t) => Boolean(t?.browser?.enabled);
const withOptions = (test) => (WARPDOM_OPTIONS
  ? { ...test, environmentOptions: { ...test.environmentOptions, warpdom: { ...test.environmentOptions?.warpdom, ...WARPDOM_OPTIONS } } } : test);
const switchDom = (test) => (ENVIRONMENT && isDom(test?.environment) && !usesBrowser(test)
  ? withOptions({ ...test, environment: ENVIRONMENT }) : test);
const relink = (p) => (typeof p.extends === 'string' && LINKS.extends[p.extends] ? { ...p, extends: LINKS.extends[p.extends] } : p);
const switchProject = (p) => {
  const q = relink(p);
  return { ...q, test: switchDom(q.test ?? {}) };
};
// Inline projects (objects, functions, promises) get their environment
// switched; strings become the wrappers compare wrote for them.
const mapProjects = (list) => list.flatMap((p) => {
  if (typeof p === 'string') return LINKS.patterns[p] ?? [p];
  if (typeof p === 'function') return [async (env) => switchProject((await p(env)) ?? {})];
  if (p && typeof p.then === 'function') return [Promise.resolve(p).then((v) => switchProject(v ?? {}))];
  return isObject(p) ? [switchProject(p)] : [p];
});`;
}

// The pinned-comment switch (see vitestWrapper), once per process.
function pinnedPatch(pinned) {
  return `// Vitest (2 to 5) takes a file's environment from a \`@vitest-environment
// <name>\` (or @jest-environment) comment, reading the file with
// fs.promises.readFile in this process. Pinned jsdom/happy-dom files are
// switched without editing them: the name is replaced in what Vitest reads
// (a comment, so the transform is unaffected). Each switched file is logged
// to WARPDOM_COMPARE_PINNED_LOG (path, original name, and "options" when
// the file also has @vitest-environment-options, which stay keyed by the
// original name).
const PINNED = ${JSON.stringify(pinned)};
if (PINNED && !fs.promises.readFile.warpdomComparePinned) {
  const readFile = fs.promises.readFile;
  const PRAGMA = /(@(?:vitest|jest)-environment\\s+)([\\w-]+)\\b/;
  const switched = new Set();
  const patched = async function (file, ...rest) {
    const content = await readFile.call(this, file, ...rest);
    if (typeof content !== 'string') return content;
    const m = content.match(PRAGMA);
    if (!m || !['jsdom', 'happy-dom'].includes(m[2]) || m[2] === PINNED) return content;
    const name = String(file);
    if (process.env.WARPDOM_COMPARE_PINNED_LOG && !switched.has(name)) {
      switched.add(name);
      const options = content.includes('@vitest-environment-options') ? '\\toptions' : '';
      fs.appendFileSync(process.env.WARPDOM_COMPARE_PINNED_LOG, name + '\\t' + m[2] + options + '\\n');
    }
    return content.replace(PRAGMA, '$1' + PINNED);
  };
  patched.warpdomComparePinned = true;
  fs.promises.readFile = patched;
}`;
}

// A Vitest config wrapper. base: the config file, or null (a workspace file
// without a config). Options:
// - environment: the Vitest environment (a name or a path) for projects on
//   jsdom or happy-dom, or null to keep theirs (the baseline run);
// - pinned: the environment name for test files that pin jsdom or happy-dom
//   with a comment, or null to leave them;
// - major: Vitest's major version (inline projects inherit the root config
//   by default from Vitest 5, only with `extends: true` before);
// - links: { patterns, extends } from compare's resolution of project
//   strings, and workspace: the workspace wrapper to use (Vitest 2 and 3);
// - probeWorkspace: a workspace file the probe imports to describe it.
export function vitestWrapper(base, { environment = null, pinned = null, major = null, links = null, probeWorkspace = null, warpdomOptions = null } = {}) {
  const dir = base ? path.dirname(base) : null;
  const importBase = base ? `import base from './${path.basename(base)}';` : 'const base = {};';
  const importWorkspace = probeWorkspace
    ? `import probeWorkspace from ${JSON.stringify(importPath(dir ?? path.dirname(probeWorkspace), probeWorkspace))};`
    : 'const probeWorkspace = null;';
  return `// Generated by warpdom compare. Safe to delete.
import fs from 'node:fs';
import path from 'node:path';
${importBase}
${importWorkspace}

${pinnedPatch(pinned)}
${vitestHelpers({ environment, links, warpdomOptions })}
const MAJOR = ${JSON.stringify(major)};
const WORKSPACE = ${JSON.stringify(links?.workspace ?? null)};
const nameOf = (t) => (typeof t?.name === 'string' ? t.name : t?.name?.label ?? null);

export default async (env) => {
  const cfg = (typeof base === 'function' ? await base(env) : await base) ?? {};
  const test = { ...(cfg.test ?? {}) };
  const list = Array.isArray(test.projects) ? test.projects
    : Array.isArray(test.workspace) ? test.workspace
      : Array.isArray(probeWorkspace) ? probeWorkspace : null;
  if (process.env.WARPDOM_COMPARE_META) {
    const root = path.resolve(process.cwd(), test.root ?? cfg.root ?? '.');
    const meta = {
      runner: 'vitest', root, projects: [], patterns: [], extends: [], unknown: 0,
      source: Array.isArray(test.projects) ? 'projects' : Array.isArray(test.workspace) ? 'workspace' : list ? 'workspace-file' : null,
      workspace: typeof test.workspace === 'string' && !Array.isArray(test.projects) ? path.resolve(root, test.workspace) : null,
    };
    if (!list) meta.projects.push({ name: nameOf(test), environment: test.environment ?? 'node', browser: usesBrowser(test) });
    for (const p of list ?? []) {
      if (typeof p === 'string') { meta.patterns.push(p); continue; }
      let v;
      try { v = typeof p === 'function' ? await p(env ?? {}) : await p; } catch { v = null; }
      if (!isObject(v)) { meta.unknown++; continue; }
      if (typeof v.extends === 'string') meta.extends.push(v.extends);
      // Vitest 5 inherits the root config unless \`extends: false\`.
      const inherits = v.extends === true || (MAJOR >= 5 && v.extends == null);
      const environment = v.test?.environment ?? (inherits ? test.environment ?? 'node' : typeof v.extends === 'string' ? null : 'node');
      if (environment == null) meta.unknown++;
      meta.projects.push({ name: nameOf(v.test), environment, browser: usesBrowser(v.test) || (inherits && usesBrowser(test)) });
    }
    fs.writeFileSync(process.env.WARPDOM_COMPARE_META, JSON.stringify(meta));
  }
  if (process.env.WARPDOM_COMPARE_PROBE) throw new Error(${JSON.stringify(PROBE_MARKER)});
  // Projects with \`extends: true\` (or, from Vitest 5, without \`extends\`)
  // inherit the root environment, switched here.
  Object.assign(test, switchDom(test));
  if (Array.isArray(test.projects)) test.projects = mapProjects(test.projects);
  else if (Array.isArray(test.workspace)) test.workspace = mapProjects(test.workspace);
  else if (WORKSPACE) test.workspace = WORKSPACE;
  return { ...cfg, test };
};
`;
}

// A Vitest workspace file's wrapper (Vitest 2 and 3 load it themselves):
// the same array, with inline projects switched and strings replaced.
export function vitestWorkspaceWrapper(workspace, { environment = null, links = null, warpdomOptions = null } = {}) {
  return `// Generated by warpdom compare. Safe to delete.
import workspace from './${path.basename(workspace)}';

${vitestHelpers({ environment, links, warpdomOptions })}

export default mapProjects(workspace);
`;
}

// A Vitest reporter that records which project ran each test file (in the
// order of the JSON reporter's testResults) and each project's environment,
// to WARPDOM_COMPARE_PROJECTS. Vitest's JSON report has no project names.
export function vitestReporter() {
  return `// Generated by warpdom compare. Safe to delete.
import fs from 'node:fs';

const nameOf = (p) => (typeof p.getName === 'function' ? p.getName() : p.name) ?? '';

export default class WarpdomCompareProjects {
  onInit(ctx) {
    this.ctx = ctx;
    this.fromFinished = false;
  }

  write(files) {
    if (!process.env.WARPDOM_COMPARE_PROJECTS) return;
    const projects = (this.ctx?.projects ?? []).map((p) => ({
      name: nameOf(p), environment: p.config?.environment ?? null, browser: Boolean(p.config?.browser?.enabled),
    }));
    fs.writeFileSync(process.env.WARPDOM_COMPARE_PROJECTS, JSON.stringify({
      files: (files ?? []).map((f) => [f.filepath, f.projectName ?? '']), projects,
    }));
  }

  // Vitest 2 and 3 (the JSON reporter uses the same list there).
  onFinished(files) {
    this.fromFinished = true;
    this.write(files ?? this.ctx?.state?.getFiles());
  }

  // Vitest 3 and later.
  onTestRunEnd(modules) {
    if (!this.fromFinished) this.write((modules ?? []).map((m) => m.task));
  }
}
`;
}

// The Jest counterpart: the project of each test file result (Jest's --json
// lists them in the same order) and each project's environment.
export function jestReporter() {
  return `// Generated by warpdom compare. Safe to delete.
const fs = require('node:fs');
const path = require('node:path');

module.exports = class WarpdomCompareProjects {
  constructor() {
    this.files = [];
    this.seen = new Set();
  }

  onTestResult(test, result) {
    if (this.seen.has(result)) return;
    this.seen.add(result);
    this.files.push([result.testFilePath, test?.context?.config ?? {}]);
  }

  onTestFileResult(test, result) {
    this.onTestResult(test, result);
  }

  onRunComplete(contexts) {
    if (!process.env.WARPDOM_COMPARE_PROJECTS) return;
    const configs = [...(contexts ?? [])].map((c) => c.config);
    const many = configs.length > 1;
    // Unnamed projects are told apart by their rootDir.
    const nameOf = (c) => (typeof c.displayName === 'string' ? c.displayName
      : c.displayName?.name ?? (many && c.rootDir ? path.relative(process.cwd(), c.rootDir) || '.' : ''));
    fs.writeFileSync(process.env.WARPDOM_COMPARE_PROJECTS, JSON.stringify({
      files: this.files.map(([file, config]) => [file, nameOf(config)]),
      projects: configs.map((c) => ({ name: nameOf(c), environment: c.testEnvironment ?? null, browser: false })),
    }));
  }
};
`;
}

// A Jest config wrapper. base: the Jest config file (a package.json means
// its "jest" key), or null when the project has none. Options:
// - environment: a Jest testEnvironment value for projects on jsdom or
//   happy-dom, or null to keep theirs;
// - links: { patterns } from compare's resolution of project strings;
// - self: this wrapper's own path, for projects that point back at the
//   root config;
// - reporter: the reporter recording each file's project.
export function jestWrapper(base, { environment = null, links = null, self = null, reporter = null, warpdomOptions = null } = {}) {
  const ext = base ? path.extname(base) : '.cjs';
  const ts = ext === '.ts';
  const name = base ? path.basename(base) : null;
  const load = !base ? '{}'
    : name === 'package.json' ? `require('./package.json').jest`
      : ext === '.mjs' ? `(await import('./${name}')).default`
        // TS: the wrapper is a module like the original, so Jest loads it the
        // same way (native type stripping, else its ts-node fallback, which
        // turns import() into require()). The computed specifier keeps
        // ts-node's type check from rejecting the '.ts' extension.
        : ts ? `await import(['./${path.basename(base, ext)}', '.ts'].join(''))`
          : `require('./${name}')`;
  const any = ts ? ': any' : '';
  return `// Generated by warpdom compare. Safe to delete.
const ENVIRONMENT = ${JSON.stringify(environment)};
const PATTERNS${any} = ${JSON.stringify(links?.patterns ?? {})};
const SELF = ${JSON.stringify(self)};
const REPORTER = ${JSON.stringify(reporter)};
const DIR = ${JSON.stringify(base ? path.dirname(base) : null)};
const SELF_REFS = ['<rootDir>', '<rootDir>/', '.', './'];
const isDom = (e${any}) => /jsdom|happy-dom/.test(String(e ?? ''));
const WARPDOM_OPTIONS${any} = ${JSON.stringify(warpdomOptions)};
const switchDom = (c${any}) => (ENVIRONMENT && isDom(c.testEnvironment)
  ? { ...c, testEnvironment: ENVIRONMENT, ...(WARPDOM_OPTIONS ? { testEnvironmentOptions: { ...c.testEnvironmentOptions, ...WARPDOM_OPTIONS } } : {}) } : c);
const isSelf = (p${any}) => typeof p === 'string' && (SELF_REFS.includes(p) || p === SELF);

${ts ? 'export default' : 'module.exports ='} async () => {
  let cfg${any} = ${load};
  // \`export default\` arrives as { default } (ts-node) or a namespace (require of ESM).
  if (cfg && typeof cfg === 'object' && 'default' in cfg) cfg = cfg.default;
  if (typeof cfg === 'function') cfg = await cfg();
  cfg = { ...(cfg ?? {}) };
  const meta${any} = { runner: 'jest', projects: [], patterns: [], external: 0, root: null };
  // A project path pointing back at this directory would make Jest load the
  // original config, bypassing this wrapper: it becomes this wrapper, or,
  // as the only project, the root config runs itself.
  if (Array.isArray(cfg.projects)) {
    for (const p of cfg.projects) if (typeof p === 'string' && !isSelf(p)) meta.patterns.push(p);
    const list = cfg.projects.flatMap((p${any}) => (typeof p === 'string' && PATTERNS[p] ? PATTERNS[p] : [p]));
    cfg.projects = list.every(isSelf) ? [] : SELF ? list.map((p${any}) => (isSelf(p) ? SELF : p)) : list.filter((p${any}) => !isSelf(p));
    if (!cfg.projects.length) delete cfg.projects;
  }
  const projects = Array.isArray(cfg.projects) ? cfg.projects : null;
  const nameOf = (c${any}) => (typeof c.displayName === 'string' ? c.displayName : c.displayName?.name ?? null);
  if (!projects) meta.projects.push({ name: nameOf(cfg), environment: cfg.testEnvironment ?? 'node', browser: false });
  else {
    for (const p of projects) {
      if (!p || typeof p !== 'object') { meta.external++; continue; }
      meta.projects.push({ name: nameOf(p), environment: p.testEnvironment ?? 'node', browser: false });
    }
  }
  if (process.env.WARPDOM_COMPARE_META) {
    const path = await import('node:path');
    meta.root = path.resolve(DIR ?? process.cwd(), cfg.rootDir ?? '.');
    (await import('node:fs')).writeFileSync(process.env.WARPDOM_COMPARE_META, JSON.stringify(meta));
  }
  if (process.env.WARPDOM_COMPARE_PROBE) throw new Error(${JSON.stringify(PROBE_MARKER)});
  cfg = switchDom(cfg);
  // Inline projects do not inherit the root testEnvironment.
  if (projects) cfg.projects = projects.map((p${any}) => (p && typeof p === 'object' ? switchDom(p) : p));
  if (REPORTER) cfg.reporters = [...(cfg.reporters ?? ['default']), REPORTER];
  return cfg;
};
`;
}
