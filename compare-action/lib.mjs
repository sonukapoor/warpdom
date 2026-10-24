// The pure parts of the warpdom compare GitHub Action (action.yml, main.mjs):
// reading the inputs, the arguments for `warpdom compare`, the Markdown for
// the job summary and the pull request comment, and the step outputs.
// Node built-ins only, no dependencies; runs on the caller's Node, which may
// be older than warpdom's own minimum, so it only uses long-supported syntax.

export const MIN_NODE = [22, 12];
export const FAIL_ON = ['nothing', 'regressions', 'differences'];
export const COMMENT_LIMIT = 60_000;

const BOOLEAN = { true: true, false: false, '': false };

function bool(value, name) {
  const v = String(value ?? '')
    .trim()
    .toLowerCase();
  if (!(v in BOOLEAN)) throw new Error(`${name} must be true or false, not ${JSON.stringify(value)}`);
  return BOOLEAN[v];
}

function positive(value, name, fallback) {
  const v = String(value ?? '').trim();
  if (v === '') return fallback;
  if (!/^[1-9][0-9]*$/.test(v))
    throw new Error(`${name} must be a positive whole number, not ${JSON.stringify(value)}`);
  return Number(v);
}

function oneOf(value, name, allowed, fallback) {
  const v = String(value ?? '').trim();
  if (v === '') return fallback;
  if (!allowed.includes(v))
    throw new Error(`${name} must be one of ${allowed.join(', ')}, not ${JSON.stringify(value)}`);
  return v;
}

// The npm package spec npx installs: a version or dist-tag of warpdom from
// the registry, or a packed tarball (a path ending in .tgz, as this
// repository's own CI uses). Anything else is refused, so the input cannot
// point npx at another package.
export function packageSpec(value) {
  const v = String(value ?? '').trim();
  if (v === '') return 'warpdom@latest';
  if (/\.tgz$/.test(v)) return v;
  if (/^[0-9A-Za-z][0-9A-Za-z.+-]*$/.test(v)) return `warpdom@${v}`;
  throw new Error(
    `warpdom-version must be a version, a dist-tag or a path to a .tgz file, not ${JSON.stringify(value)}`,
  );
}

// Runner arguments: one per line, so values with spaces need no quoting.
// They are passed to `warpdom compare` after `--` as separate arguments,
// never through a shell.
export function lines(value) {
  return String(value ?? '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '');
}

// The action's inputs, from the INPUT_* variables action.yml sets.
export function readInputs(env) {
  const input = (name) => env[`INPUT_${name.toUpperCase().replace(/-/g, '_')}`] ?? '';
  const correctness = bool(input('correctness'), 'correctness');
  const rounds = positive(input('rounds'), 'rounds', 1);
  if (correctness && rounds !== 1) throw new Error('correctness runs once; leave rounds at 1');
  const baseline = String(input('baseline')).trim();
  return {
    workingDirectory: String(input('working-directory')).trim() || '.',
    spec: packageSpec(input('warpdom-version')),
    rounds,
    correctness,
    baseline: baseline === 'auto' ? '' : oneOf(baseline, 'baseline', ['jsdom', 'happy-dom'], ''),
    runner: oneOf(input('runner'), 'runner', ['vitest', 'jest'], ''),
    workers: positive(input('workers'), 'workers', null),
    timeout: positive(input('timeout'), 'timeout', 30),
    runnerArgs: lines(input('runner-args')),
    failOn: oneOf(input('fail-on'), 'fail-on', FAIL_ON, 'nothing'),
    jobSummary: bool(input('job-summary') || 'true', 'job-summary'),
    prComment: bool(input('pr-comment'), 'pr-comment'),
    maxTests: positive(input('max-tests'), 'max-tests', 50),
    artifactName: String(input('artifact-name')).trim(),
    commentAuthor: String(input('comment-author')).trim(),
  };
}

// The environment for npx and the project's tests: the action's inputs left
// out, so the comment token never reaches npm or test code.
export function childEnvironment(env) {
  const out = {};
  for (const [key, value] of Object.entries(env)) if (!key.startsWith('INPUT_')) out[key] = value;
  out.npm_config_update_notifier = 'false';
  return out;
}

// The arguments for npx: `npx --yes --package <spec> -- warpdom compare ...`.
export function compareArgs(inputs, out) {
  const args = ['--yes', '--package', inputs.spec, '--', 'warpdom', 'compare', '--out', out];
  if (inputs.correctness) args.push('--correctness');
  else args.push('--rounds', String(inputs.rounds));
  if (inputs.baseline) args.push('--baseline', inputs.baseline);
  if (inputs.runner) args.push('--runner', inputs.runner);
  if (inputs.workers) args.push('--workers', String(inputs.workers));
  args.push('--timeout', String(inputs.timeout));
  if (inputs.runnerArgs.length) args.push('--', ...inputs.runnerArgs);
  return args;
}

export function nodeSupported(version) {
  const [major, minor] = String(version).replace(/^v/, '').split('.').map(Number);
  return major > MIN_NODE[0] || (major === MIN_NODE[0] && minor >= MIN_NODE[1]);
}

// Whether the step fails: only when the caller opted in with fail-on.
// A comparison that could not run counts too once fail-on is set, so a
// gate never passes silently.
export function shouldFail(result, failOn) {
  if (failOn === 'nothing') return false;
  if (!result || result.exitCode === 2) return true;
  const c = result.correctness;
  if (!c) return true;
  if (failOn === 'regressions') return c.regressions > 0;
  return c.differences.length > 0;
}

// Text for a Markdown table cell or list item: one line, no HTML, pipes
// escaped, shortened.
export function cell(text, max = 200) {
  let s = String(text ?? '')
    .replace(/\s*\r?\n\s*/g, ' ')
    .trim();
  if (s.length > max) s = `${s.slice(0, max - 1)}…`;
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\|/g, '\\|').replace(/`/g, "'");
}

const secs = (ms) => `${(ms / 1000).toFixed(ms < 10_000 ? 2 : 1)} s`;
const count = (n, one, many = `${one}s`) => `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`;
const verb = (n, one, many) => (n === 1 ? one : many);
const CHANGE = { regression: 'pass → fail', fixed: 'fail → pass' };

export function marker(workingDirectory) {
  return `<!-- warpdom-compare-action:${cell(workingDirectory)} -->`;
}

function versionOf(dom) {
  if (!dom) return 'baseline';
  return dom.version ? `${dom.name} ${dom.version}` : dom.name;
}

function speedLines(result, baseline, warpdom) {
  const t = result.timing;
  if (!t || t.baselineMs == null || t.warpdomMs == null) {
    const why = result.mode === 'correctness' ? ' (correctness mode)' : '';
    return [`**Speed:** not measured${why}.`];
  }
  const rows = [
    `| | ${baseline} | ${warpdom} |`,
    '|---|---:|---:|',
    `| Test run (${t.rounds > 1 ? `median of ${t.rounds} rounds` : '1 round'}) | ${secs(t.baselineMs)} | ${secs(t.warpdomMs)} |`,
  ];
  const saved = t.baselineMs - t.warpdomMs;
  let speed;
  if (!t.speedup) speed = 'not measured';
  else if (t.speedup >= 1) speed = `**${t.speedup.toFixed(2)}x faster**, ${secs(saved)} saved per run`;
  else speed = `**${(1 / t.speedup).toFixed(2)}x slower**, ${secs(-saved)} more per run`;
  const notes = [];
  if (t.spread && t.rounds > 1) notes.push(`spread ${t.spread.min.toFixed(2)}x-${t.spread.max.toFixed(2)}x`);
  if (t.indicative) notes.push('indicative: one round on a shared CI machine; set `rounds: 3` for numbers to quote');
  else if (t.noisy) notes.push('noisy: the rounds vary by more than 10%');
  if (t.source === 'wall') notes.push('wall-clock times');
  return [...rows, '', `**Speed:** ${speed}${notes.length ? ` (${notes.join('; ')})` : ''}.`];
}

// compare adds a '(file)' entry when a whole test file fails to load on one
// side (results.js). It is not a test: it is left out of `compared`, so
// it is counted and labeled apart from the tests.
const isFile = (d) => d.name === '(file)';

export function splitDifferences(c) {
  const tests = c.differences.filter((d) => !isFile(d));
  const files = c.differences.filter(isFile);
  const by = (list, cls) => list.filter((d) => d.class === cls).length;
  return {
    tests,
    files,
    testRegressions: by(tests, 'regression'),
    testFixed: by(tests, 'fixed'),
    testOther: by(tests, 'other'),
    fileRegressions: by(files, 'regression'),
    fileFixed: by(files, 'fixed'),
    fileOther: by(files, 'other'),
  };
}

function testName(d) {
  const project = d.project ? ` [${cell(d.project, 60)}]` : '';
  if (isFile(d)) return `${cell(d.file, 120)} (whole file)${project}`;
  return `${cell(d.file, 120)} › ${cell(d.name)}${project}`;
}

function changeLabel(d, baseline) {
  if (isFile(d)) {
    if (d.class === 'regression') return 'fails to load on warpdom';
    if (d.class === 'fixed') return `fails to load on ${baseline}`;
    return `load: ${cell(d.baseline, 20)} → ${cell(d.warpdom, 20)}`;
  }
  return CHANGE[d.class] ?? `${cell(d.baseline, 20)} → ${cell(d.warpdom, 20)}`;
}

// The first error line, from the side that failed: compare takes it from
// warpdom's run when warpdom failed, else from the baseline's.
function errorText(d, baseline) {
  const message = cell(d.message);
  if (!message) return '-';
  return d.warpdom === 'failed' ? message : `on ${baseline}: ${message}`;
}

function differenceLines(c, baseline, maxTests, artifactName) {
  const order = { regression: 0, fixed: 1, other: 2 };
  const rank = (d) => order[d.class] * 2 + (isFile(d) ? 0 : 1);
  const diffs = [...c.differences].sort((a, b) => rank(a) - rank(b) || a.key.localeCompare(b.key));
  const shown = diffs.slice(0, maxTests);
  const out = ['', `#### Status changes (${diffs.length})`, '', '| Change | Test | Error |', '|---|---|---|'];
  for (const d of shown) out.push(`| ${changeLabel(d, baseline)} | ${testName(d)} | ${errorText(d, baseline)} |`);
  if (diffs.length > shown.length) {
    const where = artifactName ? ` in the \`${cell(artifactName, 100)}\` artifact (report.md, results.json)` : '';
    out.push('', `…and ${diffs.length - shown.length} more${where}.`);
  }
  out.push(
    '',
    `"pass → fail" means the test passes on ${baseline} and fails on warpdom. ` +
      'If a difference looks like a warpdom bug, please open an issue at https://github.com/sonukapoor/warpdom/issues ' +
      '(the Summary part of report.md has no file or test names).',
  );
  return out;
}

// Whole files that fail to load on one side, as a clause.
function fileClause(s, baseline) {
  const parts = [];
  if (s.fileRegressions)
    parts.push(
      `${count(s.fileRegressions, 'test file')} ${verb(s.fileRegressions, 'fails', 'fail')} to load on warpdom`,
    );
  if (s.fileFixed)
    parts.push(`${count(s.fileFixed, 'test file')} ${verb(s.fileFixed, 'fails', 'fail')} to load on ${baseline} only`);
  if (s.fileOther)
    parts.push(`${count(s.fileOther, 'test file')} ${verb(s.fileOther, 'changes', 'change')} load status`);
  return parts.join(', ');
}

function resultLine(c, baseline) {
  const s = splitDifferences(c);
  const differ = s.tests.length;
  const flaky = (c.flakyBaseline?.length ?? 0) + (c.flakyWarpdom?.length ?? 0);
  const files = fileClause(s, baseline);
  const filesText = files ? ` Also ${files}.` : '';
  const head = `**Results:** ${count(c.compared, 'test')} compared`;
  if (!differ && !flaky && !files) return `${head}, all with the same status on ${baseline} and warpdom.`;
  if (!differ) {
    const flakyText = flaky ? `; ${count(flaky, 'flaky test')} not counted (below)` : '';
    return `${head}, ${c.same.toLocaleString('en-US')} with the same status and no test status changes${flakyText}.${filesText}`;
  }
  const parts = [];
  const r = s.testRegressions;
  const f = s.testFixed;
  if (r) parts.push(`${r} ${verb(r, 'passes', 'pass')} on ${baseline} and ${verb(r, 'fails', 'fail')} on warpdom`);
  if (f) parts.push(`${f} ${verb(f, 'fails', 'fail')} on ${baseline} and ${verb(f, 'passes', 'pass')} on warpdom`);
  if (s.testOther) parts.push(count(s.testOther, 'other change'));
  return `${head}, ${c.same.toLocaleString('en-US')} with the same status; ${count(differ, 'test')} ${verb(differ, 'differs', 'differ')} (${parts.join(', ')}).${filesText}`;
}

// The job summary and pull request comment. `exitCode` is the CLI's own
// exit code, for when it wrote no results.json (npx could not install it,
// or Node is too old).
export function renderSummary(result, options = {}) {
  const { workingDirectory = '.', maxTests = 50, artifactName = '', exitCode = null, skipped = null } = options;
  const title = `### warpdom compare: \`${cell(workingDirectory, 120)}\``;
  const footer = [
    '',
    '<sub>By the warpdom compare action: your tests, config and dependencies are unchanged. ' +
      'See https://github.com/sonukapoor/warpdom/blob/main/docs/compare.md</sub>',
  ];
  if (skipped) return [title, '', skipped, ...footer].join('\n') + '\n';
  if (!result) {
    const code = exitCode == null ? '' : ` (exit code ${exitCode})`;
    return [title, '', `The comparison did not run${code}: see the step log.`, ...footer].join('\n') + '\n';
  }
  const baseline = versionOf(result.baseline);
  const warpdom = result.warpdom?.version ? `warpdom ${result.warpdom.version}` : 'warpdom';
  const runner = result.runner ? `${result.runner}${result.runnerVersion ? ` ${result.runnerVersion}` : ''}` : null;
  const out = [title, ''];
  if (runner) out.push(`${runner}, ${baseline} compared with ${warpdom}.`, '');
  if (result.warpdom?.source === 'installed') {
    out.push(
      `${warpdom} is installed in the project, so the comparison used that copy (\`warpdom-version\` only chooses the CLI).`,
      '',
    );
  }
  if (result.error) {
    out.push(`**The comparison could not run:** ${cell(result.error, 1000)}`);
    if (artifactName) out.push('', `The runner logs are in the \`${cell(artifactName, 100)}\` artifact.`);
    return [...out, ...footer].join('\n') + '\n';
  }
  const c = result.correctness;
  if (c) out.push(resultLine(c, result.baseline?.name ?? 'the baseline'));
  out.push('', ...speedLines(result, baseline, warpdom));
  if (c) {
    const notes = [];
    if (c.flakyBaseline?.length)
      notes.push(`${count(c.flakyBaseline.length, 'test')} flaky on ${baseline} itself (not counted)`);
    if (c.flakyWarpdom?.length) notes.push(`${count(c.flakyWarpdom.length, 'test')} flaky on warpdom`);
    if (c.nameVaries?.length)
      notes.push(
        `${count(c.nameVaries.length, 'test')} with a name that varies between runs (a timestamp or random value), matched by position and compared`,
      );
    if (c.notCompared)
      notes.push(
        `${count(c.notCompared, 'test')} not compared (node or browser projects, or files pinned to another environment)`,
      );
    if (notes.length) out.push('', `Also: ${notes.join('; ')}.`);
    if (c.differences.length)
      out.push(...differenceLines(c, result.baseline?.name ?? 'the baseline', maxTests, artifactName));
  }
  for (const w of result.warnings ?? []) out.push('', `> [!WARNING]\n> ${cell(w, 500)}`);
  if (result.gitChanges?.length)
    out.push(
      '',
      `> [!WARNING]\n> The comparison changed the git status of ${count(result.gitChanges.length, 'file')}; please report this.`,
    );
  return [...out, ...footer].join('\n') + '\n';
}

// The pull request comment: the summary with a marker, so later runs update
// the same comment (one per working directory).
export function renderComment(summaryText, workingDirectory) {
  let body = `${marker(workingDirectory)}\n${summaryText}`;
  if (body.length > COMMENT_LIMIT)
    body = `${body.slice(0, COMMENT_LIMIT)}\n\n…(shortened; the job summary has the rest)\n`;
  return body;
}

// The step outputs (GITHUB_OUTPUT). Empty strings where there is no value.
export function outputs(result, { exitCode, fail, reportDir }) {
  const c = result?.correctness;
  const t = result?.timing;
  const v = (x) => (x == null ? '' : String(x));
  return {
    'exit-code': v(result ? result.exitCode : exitCode),
    compared: v(c?.compared),
    regressions: v(c?.regressions),
    fixed: v(c?.fixed),
    differences: v(c?.differences.length),
    'baseline-ms': v(t?.baselineMs),
    'warpdom-ms': v(t?.warpdomMs),
    speedup: t?.speedup ? t.speedup.toFixed(2) : '',
    'report-dir': v(reportDir),
    fail: fail ? 'true' : 'false',
  };
}

export function formatOutputs(values) {
  return Object.entries(values)
    .map(([k, v]) => `${k}=${String(v).replace(/[\r\n]/g, ' ')}\n`)
    .join('');
}

// The pull request number of a pull_request or pull_request_target event.
export function pullRequestNumber(event) {
  const n = event?.pull_request?.number;
  return Number.isInteger(n) ? n : null;
}

// A GitHub workflow command's message: % and line breaks escaped.
export function commandText(text) {
  return String(text).replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
}

// Creates the pull request comment, or updates the one an earlier run left
// (found by its marker and author). Resolves to { action: 'created' |
// 'updated' | 'skipped' } or rejects with an Error carrying the HTTP
// status. Only GitHub's API is called, with the token the caller passed.
export async function upsertComment({
  fetch,
  api,
  repository,
  number,
  token,
  body,
  workingDirectory,
  author = '',
  maxPages = 10,
}) {
  const headers = {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token}`,
    'User-Agent': 'warpdom-compare-action',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  const call = async (method, url, payload) => {
    const res = await fetch(url, {
      method,
      headers: payload ? { ...headers, 'Content-Type': 'application/json' } : headers,
      body: payload ? JSON.stringify(payload) : undefined,
    });
    if (!res.ok) {
      const err = new Error(`${method} ${url.replace(api, '')}: HTTP ${res.status}`);
      err.status = res.status;
      err.rateLimited = res.status === 429 || res.headers?.get?.('x-ratelimit-remaining') === '0';
      err.apiMessage = await res.json().then(
        (data) => String(data?.message ?? ''),
        () => '',
      );
      throw err;
    }
    return method === 'DELETE' ? null : res.json();
  };
  const tag = marker(workingDirectory);
  const base = `${api}/repos/${repository}`;
  const ours = await commentAuthor(call, api, author);
  // Every report of ours for this working directory, oldest first, and
  // whether all comments were searched.
  const scan = async () => {
    const found = [];
    for (let page = 1; page <= maxPages; page++) {
      const list = await call('GET', `${base}/issues/${number}/comments?per_page=100&page=${page}`);
      for (const c of list) if (typeof c.body === 'string' && c.body.startsWith(tag) && ours(c.user)) found.push(c);
      if (list.length < 100) return { found, complete: true };
    }
    return { found, complete: false };
  };
  const first = await scan();
  if (first.found.length) {
    const keep = first.found[0];
    await call('PATCH', `${base}/issues/comments/${keep.id}`, { body });
    return { action: 'updated', id: keep.id };
  }
  // Not all comments were searched: an earlier report may be further on,
  // and a second one would be a duplicate.
  if (!first.complete)
    return { action: 'skipped', reason: `more than ${maxPages * 100} comments; the report was not found` };
  const created = await call('POST', `${base}/issues/${number}/comments`, { body });
  // Two runs for the same pull request can both find nothing and both
  // post: keep the oldest report, give it this body, delete the others.
  const after = await scan();
  const reports = [...after.found, ...(after.found.some((c) => c.id === created.id) ? [] : [created])];
  reports.sort((x, y) => x.id - y.id);
  const keep = reports[0];
  for (const extra of reports.slice(1)) {
    // A concurrent run may have deleted it already.
    await call('DELETE', `${base}/issues/comments/${extra.id}`).catch((err) => {
      if (err.status !== 404) throw err;
    });
  }
  if (keep.id !== created.id) {
    await call('PATCH', `${base}/issues/comments/${keep.id}`, { body });
    return { action: 'updated', id: keep.id };
  }
  return { action: 'created', id: created.id };
}

// Which comments this token wrote. `author` (the comment-author input)
// names it outright, for app tokens (`my-app[bot]`). Else a personal
// token's user from GET /user. The Actions token cannot read /user (403
// "Resource not accessible by integration") and comments as
// github-actions[bot]. Any other failure, a rate limit included, is
// rethrown: guessing the author could post a duplicate report.
async function commentAuthor(call, api, author) {
  if (author) return (user) => user?.login === author;
  try {
    const login = (await call('GET', `${api}/user`)).login;
    if (login) return (user) => user?.login === login;
  } catch (err) {
    if (err.status !== 403 || err.rateLimited || !/not accessible by integration/i.test(err.apiMessage)) throw err;
  }
  return (user) => user?.login === 'github-actions[bot]';
}

// The workflow command after a comparison: a warning when tests differ or it
// could not run, a notice otherwise. Flaky tests are in `compared` but in
// neither `same` nor `differences`, so no differences is not "all the same".
export function statusNotice(result) {
  const c = result?.correctness;
  if (result?.error) return { level: 'warning', text: `warpdom compare could not run: ${result.error}` };
  if (!c) return null;
  const baseline = result.baseline?.name ?? 'the baseline';
  const s = splitDifferences(c);
  const files = fileClause(s, baseline);
  if (c.differences.length) {
    const parts = [];
    if (s.tests.length) {
      parts.push(
        `${s.tests.length} of ${c.compared} tests differ (${s.testRegressions} pass on ${baseline} and fail on warpdom)`,
      );
    }
    if (files) parts.push(files);
    return { level: 'warning', text: `warpdom compare: ${parts.join('; ')}; see the job summary.` };
  }
  const flaky = (c.flakyBaseline?.length ?? 0) + (c.flakyWarpdom?.length ?? 0);
  if (flaky) {
    return {
      level: 'notice',
      text: `warpdom compare: no status changes in ${c.compared} tests; ${flaky} flaky, not counted (see the job summary).`,
    };
  }
  return { level: 'notice', text: `warpdom compare: all ${c.compared} tests have the same status.` };
}

// Why a comment could not be posted, for the warning.
export function commentFailure(err) {
  if (err.rateLimited)
    return `could not post the pull request comment (${err.message}, rate limited). The job summary has the same content.`;
  if (err.status === 403 || err.status === 404) {
    return (
      `could not post the pull request comment (${err.message}). Pull requests from forks get a read-only token, ` +
      'and the job needs "permissions: pull-requests: write". The job summary has the same content.'
    );
  }
  return `could not post the pull request comment (${err.message}). The job summary has the same content.`;
}
