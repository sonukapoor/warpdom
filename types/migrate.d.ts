// warpdom/migrate (src/migrate/index.js): the API behind `warpdom migrate`
// (docs/migrate.md). Node only. The result is the plan (also written to
// <out>/plan.md); its fields are typed as far as they are stable.

export interface MigrateOptions {
  /** The project root. Default `process.cwd()`. */
  cwd?: string;
  /** Make the changes (the CLI's default). Default `false`: a dry run that changes nothing. */
  apply?: boolean;
  /** Where plan.md goes, relative to cwd. Default `'.warpdom-migrate'`. */
  out?: string;
  /** Apply even when the git working tree has uncommitted changes. */
  force?: boolean;
  /** Pin the installed jsdom version next to the new environment (default `true`). */
  keepJsdomVersion?: boolean;
  /** Do not ask the npm registry for the latest versions. */
  offline?: boolean;
  /** The fetch used for the registry (default `globalThis.fetch`). */
  fetch?: typeof globalThis.fetch;
  /** Registry data to use instead of fetching: `{ version, time }` (or null) per package. */
  registry?: Record<string, { version: string | null; time: string | null } | null>;
  /** The current time in ms, for release-age settings (default `Date.now()`). */
  now?: number;
}

export type MigrateRunner = 'vitest' | 'jest';

/** One exact text edit. */
export interface MigrateEdit {
  file: string;
  start: number;
  end: number;
  text: string;
  kind: string;
  runner?: MigrateRunner;
  from: string | null;
  to: string;
  line: number;
  [key: string]: unknown;
}

/** Something migrate cannot change safely, to do by hand. */
export interface MigrateManual {
  file: string;
  line: number | null;
  reason: string;
  runner?: MigrateRunner;
}

/** A line that mentions jsdom or happy-dom, listed for review, never edited. */
export interface MigrateMention {
  file: string;
  line: number;
  text: string;
  category: string;
  hint?: string;
}

export interface MigrateDependencyChange {
  package: string;
  section: string;
  remove: Array<{ name: string; spec: string }>;
  add: Array<{ name: string; spec: string }>;
}

export interface MigrateResult {
  version: 1;
  cwd: string;
  mode: 'apply' | 'dry-run';
  /** Why nothing was changed, else null. */
  error: string | null;
  warnings: string[];
  notes: string[];
  packageManager: { name: string; lockfile?: string | null; [key: string]: unknown } | null;
  runners: Array<{ name: string; version: string | null; [key: string]: unknown }>;
  monorepo: { tool: string; packages: unknown[] } | null;
  otherProjects: Array<{ dir: string; uses: string[] }>;
  skippedFixtures: string[];
  edits: MigrateEdit[];
  dependencies: MigrateDependencyChange[];
  catalog: Array<{ file: string; catalog: string; remove: unknown[]; add: unknown[] }>;
  kept: Array<{ package: string; name: string; section: string | null; reason: string }>;
  manual: MigrateManual[];
  mentions: MigrateMention[];
  transitive: string[];
  profile: string[];
  releaseAge: Array<{ name: string; version: string; status: string; message: string; [key: string]: unknown }>;
  /** The install command to run after applying, or null when no dependency changes. */
  install: string | null;
  /** Files changed (apply) or to change (dry run), relative to cwd. */
  changedFiles: string[];
  planFile: string;
  versions: Record<string, string>;
  [key: string]: unknown;
}

/** Plans (and with `apply: true` makes) the move from jsdom or happy-dom to warpdom. */
export function migrate(options?: MigrateOptions): Promise<MigrateResult>;

/** The terminal summary of a plan. */
export function renderConsole(result: MigrateResult, options?: { mentionsLimit?: number }): string;

/** The plan as Markdown (plan.md). */
export function renderMarkdown(result: MigrateResult): string;

/** The packages migrate removes when nothing else needs them. */
export const REMOVABLE: string[];

/** The companion environment package per runner. */
export const ENVIRONMENT_PACKAGE: { vitest: 'vitest-environment-warpdom'; jest: 'jest-environment-warpdom' };

/** The companion packages' version. */
export const ENVIRONMENT_PACKAGE_VERSION: string;

/** The order of the mention categories in the plan. */
export const MENTION_ORDER: string[];
