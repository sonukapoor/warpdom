// warpdom/compare (src/compare/index.js): the API behind `warpdom compare`
// (docs/compare.md). Node only. The result is also written to
// <out>/results.json; its fields are typed here as far as they are stable,
// the rest as unknown.

export type CompareRunner = 'vitest' | 'jest';
export type CompareDom = 'jsdom' | 'happy-dom';

export interface CompareOptions {
  /** The directory to run in (where vitest or jest is normally run). Default `process.cwd()`. */
  cwd?: string;
  /** Report, JSON results and logs, relative to cwd. Default `'.warpdom-compare'`. */
  out?: string;
  /** Timed rounds, each running the baseline and warpdom (default 1). */
  rounds?: number;
  /** One round, results only, no timing. */
  correctness?: boolean;
  /** The runner's worker limit for every run. */
  workers?: number;
  /** What warpdom is compared with. Default: what the project uses. */
  baseline?: CompareDom;
  /** vitest or jest, when both are configured. */
  runner?: CompareRunner;
  /** Per run, in minutes (default 30). */
  timeout?: number;
  /** Arguments passed to every run (a file filter, `--project x`, `--config <file>`). */
  args?: string[];
  /** Progress messages. */
  log?: (message: string) => void;
  /** Run warpdom with its fastFrames option. */
  fastFrames?: boolean;
  /** Environment variables for every run (e.g. `{ TZ: 'UTC' }`). */
  env?: Record<string, string>;
  /** Other DOMs to run in every round as well (results in `result.also`). */
  alsoEnvironments?: CompareDom[];
  /** A node_modules directory to take DOM packages from that the project lacks. */
  domPackages?: string;
  /** Whether an untimed warm-up group runs first (default: with 2 or more rounds). */
  warmup?: boolean;
  /** false: also run packages whose projects are all on node (not compared). */
  requireDom?: boolean;
}

export type TestStatus = 'passed' | 'failed' | 'skipped' | 'todo' | 'missing' | (string & {});

export interface TestDifference {
  key: string;
  project: string;
  file: string;
  name: string;
  baseline: TestStatus;
  warpdom: TestStatus;
  /** regression: passes on the baseline, fails on warpdom; fixed: the other way round. */
  class: 'regression' | 'fixed' | 'other';
  message: string;
}

export interface DifferenceGroup {
  class: 'regression' | 'fixed' | 'other';
  /** `'passed -> failed'`. */
  change: string;
  message: string;
  tests: Array<{ project: string; file: string; name: string }>;
}

/** A test whose status varied between the runs of one side. */
export interface VaryingTest {
  key: string;
  project: string;
  file: string;
  name: string;
  baseline: TestStatus[];
  warpdom: TestStatus[];
}

export interface ProjectCounts {
  compared: number;
  same: number;
  regressions: number;
  fixed: number;
  other: number;
  flaky: number;
  notCompared: number;
}

export interface CorrectnessResult {
  compared: number;
  same: number;
  regressions: number;
  fixed: number;
  other: number;
  notCompared: number;
  notComparedFiles: number;
  notComparedChanged: VaryingTest[];
  flakyBaseline: VaryingTest[];
  flakyWarpdom: VaryingTest[];
  differences: TestDifference[];
  /** Differences grouped by status change and first error line (set by compare()). */
  groups?: DifferenceGroup[];
  /** Counts per project name ('' for a single unnamed project). */
  byProject: Record<string, ProjectCounts>;
}

export interface TimingSummary {
  rounds: number;
  baselineMs: number | null;
  warpdomMs: number | null;
  /** baselineMs / warpdomMs (above 1: warpdom is faster). */
  speedup: number | null;
  ratios: number[];
  spread: { min: number; max: number } | null;
  /** Fewer than 2 rounds. */
  indicative: boolean;
  /** The spread is wider than 10% of the speedup. */
  noisy: boolean;
}

export interface CompareTiming extends TimingSummary {
  perRound: Array<{ round: number; baselineMs: number; warpdomMs: number }>;
  /** Whether times are the runner's own durations or wall-clock times. */
  source: 'runner' | 'wall';
}

export interface CompareRun {
  index: number;
  side: 'baseline' | 'warpdom' | CompareDom;
  warmup: boolean;
  round: number;
  code: number | null;
  signal: string | null;
  wallMs: number;
  runnerMs?: number | null;
  ms?: number | null;
  /** Paths relative to `out`. */
  log: string;
  results: string;
  [key: string]: unknown;
}

export interface CompareResult {
  version: 1;
  cwd: string;
  out: string;
  mode: 'correctness' | 'timing';
  /** 0: no test changes from pass to fail; 1: some do; 2: the comparison could not run. */
  exitCode: 0 | 1 | 2;
  /** Why the comparison could not run, else null. */
  error: string | null;
  warnings: string[];
  runner: CompareRunner | null;
  runnerVersion: string | null;
  baseline: { name: CompareDom; version: string | null; provided?: boolean } | null;
  warpdom: { source: 'installed' | 'copied'; version?: string } | null;
  projects: Array<{ name: string; dom: boolean; [key: string]: unknown }>;
  external: number;
  pinned: { files: number; tests: number; switched: number; notSwitched: number; [key: string]: unknown } | null;
  warmup: boolean;
  runs: CompareRun[];
  correctness: CorrectnessResult | null;
  timing: CompareTiming | null;
  /** The machine, Node, runner and DOM versions the comparison ran with. */
  environment: Record<string, unknown> | null;
  /** Files whose git status the comparison changed (should be empty). */
  gitChanges: unknown[];
  warpdomOptions: { fastFrames: true } | null;
  /** Results of alsoEnvironments, by name. */
  also: Record<string, { environment: unknown; provided: boolean; correctness: CorrectnessResult | null; timing: unknown }> | null;
  /** Names of the environment variables given in `env`. */
  env: string[];
  [key: string]: unknown;
}

/** Runs the project's tests on its DOM and on warpdom and compares them. Never rejects for a comparison that cannot run: see `error` and `exitCode`. */
export function compare(options?: CompareOptions): Promise<CompareResult>;

/** The terminal summary for a result, with the report's path relative to dir (default `process.cwd()`). */
export function summary(result: CompareResult, dir?: string): string;

/** The terminal summary. */
export function renderConsole(result: CompareResult, options?: { reportPath?: string | null; groupLimit?: number }): string;

/** The shareable Markdown report (<out>/report.md). */
export function renderMarkdown(result: CompareResult): string;

/** A path for messages: relative to dir when inside it, else absolute. */
export function displayPath(file: string, dir: string): string;

/** A test's result in one run. */
export interface RunTest {
  file: string;
  name: string;
  status: TestStatus;
  message?: string;
  project?: string;
}

/** Compares the tests of the baseline's runs with warpdom's (maps from test key to result). */
export function compareRuns(
  baselineRuns: Array<Map<string, RunTest>>,
  warpdomRuns: Array<Map<string, RunTest>>,
  options?: { skipFiles?: Set<string>; skipProjects?: Set<string>; keepFiles?: Set<string> },
): CorrectnessResult;

/** Differences grouped by status change and first error line, largest group first. */
export function groupDifferences(differences: TestDifference[]): DifferenceGroup[];

/** The speedup (ratio of the medians) and spread of timed rounds. */
export function timingSummary(rounds: Array<{ baselineMs: number; warpdomMs: number }>): TimingSummary;

/** 2 with an error, 1 with regressions, else 0. */
export function exitCode(outcome?: { error?: string | null; regressions?: number }): 0 | 1 | 2;
