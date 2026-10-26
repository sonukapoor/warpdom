// The warpdom compare GitHub Action (compare-action/): inputs, the compare
// arguments, the job summary and pull request comment, outputs, and the
// comment API calls (with a fake fetch). The action itself runs in
// .github/workflows/compare-action.yml.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  packageSpec,
  lines,
  readInputs,
  compareArgs,
  nodeSupported,
  shouldFail,
  cell,
  renderSummary,
  renderComment,
  marker,
  outputs,
  formatOutputs,
  pullRequestNumber,
  commandText,
  upsertComment,
  commentFailure,
  childEnvironment,
  statusNotice,
  COMMENT_LIMIT,
} from '../compare-action/lib.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

const diff = (name, cls, extra = {}) => ({
  key: `a.spec.js::${name}`,
  project: '',
  file: 'a.spec.js',
  name,
  baseline: cls === 'fixed' ? 'failed' : 'passed',
  warpdom: cls === 'fixed' ? 'passed' : 'failed',
  class: cls,
  message: 'AssertionError: expected 1 to be 2',
  ...extra,
});

function result(overrides = {}) {
  const differences = overrides.differences ?? [diff('b', 'regression'), diff('a', 'fixed'), diff('c', 'regression')];
  const regressions = differences.filter((d) => d.class === 'regression').length;
  const fixed = differences.filter((d) => d.class === 'fixed').length;
  return {
    version: 1,
    mode: 'timing',
    exitCode: regressions ? 1 : 0,
    error: null,
    warnings: [],
    runner: 'vitest',
    runnerVersion: '5.0.3',
    baseline: { name: 'jsdom', version: '26.1.0' },
    warpdom: { source: 'copied', version: '0.1.8' },
    gitChanges: [],
    correctness: {
      compared: 10,
      same: 10 - differences.length,
      regressions,
      fixed,
      other: differences.length - regressions - fixed,
      notCompared: 0,
      flakyBaseline: [],
      flakyWarpdom: [],
      differences,
    },
    timing: {
      rounds: 1,
      baselineMs: 12_000,
      warpdomMs: 6_000,
      speedup: 2,
      spread: { min: 2, max: 2 },
      indicative: true,
      noisy: false,
      source: 'runner',
    },
    ...overrides,
  };
}

test('compare action: the warpdom package spec', () => {
  assert.equal(packageSpec(''), 'warpdom@latest');
  assert.equal(packageSpec('0.1.8'), 'warpdom@0.1.8');
  assert.equal(packageSpec('next'), 'warpdom@next');
  assert.equal(packageSpec(' ../warpdom-0.1.8.tgz '), '../warpdom-0.1.8.tgz');
  for (const bad of ['evil@1.0.0', 'github:x/y', '1.0.0; rm -rf /', '$(id)', '-y']) {
    assert.throws(() => packageSpec(bad), /warpdom-version must be/, bad);
  }
});

test('compare action: inputs, defaults and validation', () => {
  assert.deepEqual(readInputs({}), {
    workingDirectory: '.',
    spec: 'warpdom@latest',
    rounds: 1,
    correctness: false,
    baseline: '',
    runner: '',
    workers: null,
    timeout: 30,
    runnerArgs: [],
    failOn: 'nothing',
    jobSummary: true,
    prComment: false,
    maxTests: 50,
    artifactName: '',
    commentAuthor: '',
  });
  const inputs = readInputs({
    INPUT_WORKING_DIRECTORY: 'packages/ui',
    INPUT_ROUNDS: '3',
    INPUT_BASELINE: 'happy-dom',
    INPUT_RUNNER: 'jest',
    INPUT_WORKERS: '2',
    INPUT_RUNNER_ARGS: 'src/button\r\n\n  --project web  \n',
    INPUT_FAIL_ON: 'regressions',
    INPUT_JOB_SUMMARY: 'false',
    INPUT_PR_COMMENT: 'TRUE',
    INPUT_ARTIFACT_NAME: 'report',
  });
  assert.equal(inputs.workingDirectory, 'packages/ui');
  assert.equal(inputs.rounds, 3);
  assert.equal(inputs.baseline, 'happy-dom');
  assert.deepEqual(inputs.runnerArgs, ['src/button', '--project web']);
  assert.equal(inputs.failOn, 'regressions');
  assert.equal(inputs.jobSummary, false);
  assert.equal(inputs.prComment, true);
  assert.equal(readInputs({ INPUT_BASELINE: 'auto' }).baseline, '');
  assert.throws(() => readInputs({ INPUT_ROUNDS: '0' }), /rounds must be a positive/);
  assert.throws(() => readInputs({ INPUT_ROUNDS: '2; echo' }), /rounds must be a positive/);
  assert.throws(() => readInputs({ INPUT_BASELINE: 'linkedom' }), /baseline must be one of/);
  assert.throws(() => readInputs({ INPUT_FAIL_ON: 'always' }), /fail-on must be one of/);
  assert.throws(() => readInputs({ INPUT_PR_COMMENT: 'yes' }), /pr-comment must be true or false/);
  assert.throws(() => readInputs({ INPUT_CORRECTNESS: 'true', INPUT_ROUNDS: '3' }), /correctness runs once/);
  assert.deepEqual(lines(''), []);
});

test('compare action: the npx arguments, runner arguments kept whole', () => {
  const inputs = readInputs({ INPUT_RUNNER_ARGS: 'src/a b.spec.ts\n$(touch pwned)', INPUT_WORKERS: '2' });
  assert.deepEqual(compareArgs(inputs, '/tmp/out'), [
    '--yes',
    '--package',
    'warpdom@latest',
    '--',
    'warpdom',
    'compare',
    '--out',
    '/tmp/out',
    '--rounds',
    '1',
    '--workers',
    '2',
    '--timeout',
    '30',
    '--',
    'src/a b.spec.ts',
    '$(touch pwned)',
  ]);
  const correctness = compareArgs(
    readInputs({ INPUT_CORRECTNESS: 'true', INPUT_BASELINE: 'jsdom', INPUT_RUNNER: 'jest' }),
    'o',
  );
  assert.deepEqual(correctness.slice(6), [
    '--out',
    'o',
    '--correctness',
    '--baseline',
    'jsdom',
    '--runner',
    'jest',
    '--timeout',
    '30',
  ]);
});

test('compare action: npx and the tests get no INPUT_ variables (no token)', () => {
  const env = childEnvironment({ PATH: '/bin', INPUT_GITHUB_TOKEN: 'secret', INPUT_ROUNDS: '1', CI: 'true' });
  assert.deepEqual(env, { PATH: '/bin', CI: 'true', npm_config_update_notifier: 'false' });
});

test('compare action: the status notice does not call flaky results all the same', () => {
  assert.deepEqual(statusNotice(result({ differences: [] })), {
    level: 'notice',
    text: 'warpdom compare: all 10 tests have the same status.',
  });
  const flaky = result({
    differences: [],
    correctness: { ...result({ differences: [] }).correctness, same: 9, flakyWarpdom: [{}] },
  });
  assert.deepEqual(statusNotice(flaky), {
    level: 'notice',
    text: 'warpdom compare: no status changes in 10 tests; 1 flaky, not counted (see the job summary).',
  });
  assert.equal(statusNotice(result()).level, 'warning');
  assert.match(statusNotice(result()).text, /3 of 10 tests differ \(2 pass on jsdom and fail on warpdom\)/);
  assert.match(statusNotice(result({ error: 'no runner', correctness: null })).text, /could not run: no runner/);
  assert.equal(statusNotice(null), null);
});

test('compare action: files that fail to load are counted apart from tests', () => {
  // One test passes on jsdom; its file fails to load on warpdom: compare
  // gives a '(file)' regression and the test 'passed -> missing'.
  const fileDiff = diff('(file)', 'regression', { baseline: 'missing', message: 'SyntaxError: bad import' });
  const testDiff = diff('t', 'other', { baseline: 'passed', warpdom: 'missing', message: '' });
  const r = result({ differences: [fileDiff, testDiff] });
  r.correctness = { ...r.correctness, compared: 1, same: 0, regressions: 1, fixed: 0, other: 1 };
  const text = renderSummary(r);
  assert.match(
    text,
    /1 test compared, 0 with the same status; 1 test differs \(1 other change\)\. Also 1 test file fails to load on warpdom\./,
  );
  assert.match(text, /\| fails to load on warpdom \| a\.spec\.js \(whole file\) \| SyntaxError: bad import \|/);
  assert.match(text, /\| passed → missing \| a\.spec\.js › t \| - \|/);
  assert.ok(text.indexOf('(whole file)') < text.indexOf('› t'), 'file rows first within a class');
  assert.deepEqual(statusNotice(r), {
    level: 'warning',
    text: 'warpdom compare: 1 of 1 tests differ (0 pass on jsdom and fail on warpdom); 1 test file fails to load on warpdom; see the job summary.',
  });
  // Only a file change, no test changes.
  const only = result({ differences: [fileDiff] });
  only.correctness = { ...only.correctness, compared: 0, same: 0, regressions: 1, fixed: 0, other: 0 };
  assert.match(
    renderSummary(only),
    /0 tests compared, 0 with the same status and no test status changes\. Also 1 test file fails to load on warpdom\./,
  );
  assert.equal(statusNotice(only).text, 'warpdom compare: 1 test file fails to load on warpdom; see the job summary.');
});

test('compare action: Node version check', () => {
  assert.equal(nodeSupported('22.12.0'), true);
  assert.equal(nodeSupported('v24.1.0'), true);
  assert.equal(nodeSupported('22.11.9'), false);
  assert.equal(nodeSupported('20.19.0'), false);
});

test('compare action: fail-on', () => {
  const some = result();
  const same = result({ differences: [] });
  const onlyFixed = result({ differences: [diff('a', 'fixed')] });
  const broken = result({ exitCode: 2, error: 'no runner found', correctness: null, timing: null });
  assert.equal(shouldFail(some, 'nothing'), false);
  assert.equal(shouldFail(broken, 'nothing'), false);
  assert.equal(shouldFail(null, 'nothing'), false);
  assert.equal(shouldFail(some, 'regressions'), true);
  assert.equal(shouldFail(onlyFixed, 'regressions'), false);
  assert.equal(shouldFail(onlyFixed, 'differences'), true);
  assert.equal(shouldFail(same, 'differences'), false);
  assert.equal(shouldFail(broken, 'regressions'), true, 'a gate does not pass when the comparison could not run');
  assert.equal(shouldFail(null, 'differences'), true);
});

test('compare action: table cells are one line without HTML or pipes', () => {
  assert.equal(
    cell('a | b\n  <img src=x onerror=alert(1)> `c` & d'),
    "a \\| b &lt;img src=x onerror=alert(1)&gt; 'c' &amp; d",
  );
  assert.equal(cell('x'.repeat(300)).length, 200);
  assert.equal(cell(null), '');
});

test('compare action: summary with differences, sorted and capped', () => {
  const text = renderSummary(result(), {
    workingDirectory: 'packages/ui',
    maxTests: 2,
    artifactName: 'warpdom-compare',
  });
  assert.match(text, /^### warpdom compare: `packages\/ui`\n/);
  assert.match(text, /vitest 5\.0\.3, jsdom 26\.1\.0 compared with warpdom 0\.1\.8\./);
  assert.match(
    text,
    /\*\*Results:\*\* 10 tests compared, 7 with the same status; 3 tests differ \(2 pass on jsdom and fail on warpdom, 1 fails on jsdom and passes on warpdom\)\./,
  );
  assert.match(text, /\| Test run \(1 round\) \| 12\.0 s \| 6\.00 s \|/);
  assert.match(text, /\*\*2\.00x faster\*\*, 6\.00 s saved per run \(indicative: one round/);
  assert.match(text, /#### Status changes \(3\)/);
  const rows = text.split('\n').filter((l) => l.startsWith('| pass') || l.startsWith('| fail'));
  assert.deepEqual(rows, [
    '| pass → fail | a.spec.js › b | AssertionError: expected 1 to be 2 |',
    '| pass → fail | a.spec.js › c | AssertionError: expected 1 to be 2 |',
  ]);
  assert.match(text, /…and 1 more in the `warpdom-compare` artifact/);
});

test('compare action: summary variants', () => {
  const fixedOnly = renderSummary(result({ differences: [diff('a', 'fixed')] }));
  assert.match(
    fixedOnly,
    /\| fail → pass \| a\.spec\.js › a \| on jsdom: AssertionError: expected 1 to be 2 \|/,
    "the baseline's error is labeled",
  );

  const flakyOnly = renderSummary(
    result({
      differences: [],
      correctness: { ...result({ differences: [] }).correctness, same: 9, flakyWarpdom: [{}] },
    }),
  );
  assert.match(
    flakyOnly,
    /10 tests compared, 9 with the same status and no test status changes; 1 flaky test not counted \(below\)\./,
  );
  assert.match(flakyOnly, /Also: 1 test flaky on warpdom/);

  const varies = renderSummary(
    result({
      differences: [],
      correctness: { ...result({ differences: [] }).correctness, same: 10, nameVaries: [{}, {}] },
    }),
  );
  assert.match(varies, /10 tests compared, all with the same status on jsdom and warpdom\./, 'not counted as flaky');
  assert.match(
    varies,
    /Also: 2 tests with a name that varies between runs \(a timestamp or random value\), matched by position and compared\./,
  );
  assert.doesNotMatch(renderSummary(result()), /name that varies/);

  const installed = renderSummary(result({ warpdom: { source: 'installed', version: '0.1.7' } }));
  assert.match(installed, /warpdom 0\.1\.7 is installed in the project, so the comparison used that copy/);
  assert.doesNotMatch(renderSummary(result()), /is installed in the project/);

  const same = renderSummary(result({ differences: [] }));
  assert.match(same, /10 tests compared, all with the same status on jsdom and warpdom\./);
  assert.doesNotMatch(same, /Status changes/);

  const slower = renderSummary(
    result({
      timing: {
        rounds: 3,
        baselineMs: 5000,
        warpdomMs: 10_000,
        speedup: 0.5,
        spread: { min: 0.45, max: 0.55 },
        indicative: false,
        noisy: true,
        source: 'wall',
      },
    }),
  );
  assert.match(slower, /Test run \(median of 3 rounds\) \| 5\.00 s \| 10\.0 s/);
  assert.match(
    slower,
    /\*\*2\.00x slower\*\*, 5\.00 s more per run \(spread 0\.45x-0\.55x; noisy: .*; wall-clock times\)/,
  );

  const correctness = renderSummary(result({ mode: 'correctness', timing: null }));
  assert.match(correctness, /\*\*Speed:\*\* not measured \(correctness mode\)\./);

  const project = renderSummary(
    result({
      differences: [diff('x', 'other', { project: 'web', baseline: 'passed', warpdom: 'skipped', message: '' })],
    }),
  );
  assert.match(project, /\| passed → skipped \| a\.spec\.js › x \[web\] \| - \|/);
  assert.match(project, /1 test differs \(1 other change\)/);

  const error = renderSummary(
    result({ exitCode: 2, error: 'no vitest or jest config found', correctness: null, timing: null }),
    { artifactName: 'r' },
  );
  assert.match(error, /\*\*The comparison could not run:\*\* no vitest or jest config found/);
  assert.match(error, /runner logs are in the `r` artifact/);

  assert.match(renderSummary(null, { exitCode: 1 }), /The comparison did not run \(exit code 1\): see the step log\./);
  assert.match(
    renderSummary(null, { skipped: 'Skipped: warpdom needs Node 22.12' }),
    /\n\nSkipped: warpdom needs Node 22\.12\n/,
  );

  const warned = renderSummary(
    result({ warnings: ['jsdom 19 is older than warpdom profiles'], gitChanges: ['M a.js'] }),
  );
  assert.match(warned, /> \[!WARNING\]\n> jsdom 19 is older/);
  assert.match(warned, /changed the git status of 1 file/);

  const flaky = renderSummary(
    result({ correctness: { ...result().correctness, flakyBaseline: [{}], notCompared: 4 } }),
  );
  assert.match(flaky, /Also: 1 test flaky on jsdom 26\.1\.0 itself \(not counted\); 4 tests not compared/);
});

test('compare action: the comment carries a marker per working directory and stays under the limit', () => {
  const body = renderComment('### report\n', 'packages/ui');
  assert.ok(body.startsWith(`${marker('packages/ui')}\n### report`));
  assert.notEqual(marker('a'), marker('b'));
  // Paths whose cell() decodes back to them keep the marker earlier releases wrote.
  assert.equal(marker('packages/ui'), '<!-- warpdom-compare-action:packages/ui -->');
  assert.equal(marker('.'), '<!-- warpdom-compare-action:. -->');
  for (const dir of ['a&b', 'a&amp;b', 'a|b', 'a\\|b', 'a<b>', "a'b", 'a b'])
    assert.equal(marker(dir), `<!-- warpdom-compare-action:${cell(dir)} -->`, dir);
  const long = renderComment('x'.repeat(COMMENT_LIMIT * 2), '.');
  assert.ok(long.length < COMMENT_LIMIT + 100);
  assert.match(long, /shortened; the job summary has the rest/);
});

test('compare action: distinct working directories never share a marker (#133)', () => {
  // Longer than a cell and the same for the first 199 characters.
  const prefix = `packages/${'a'.repeat(190)}`;
  const long = [`${prefix}/one`, `${prefix}/two`];
  // Different paths that cell() rewrites to the same text.
  const rewritten = ['a`b', "a'b", 'a\nb', 'a b', ' a b', 'a&b', 'a&amp;b', 'a|b', 'a\\|b'];
  const dirs = [...long, ...rewritten];
  const markers = dirs.map(marker);
  assert.equal(new Set(markers).size, dirs.length);
  for (const m of markers) {
    assert.match(m, /^<!-- warpdom-compare-action:[^\n]* -->$/);
    assert.ok(m.length < 200, m);
  }
  // The long paths keep a readable prefix and are told apart by a hash.
  assert.ok(markers[0].startsWith(`<!-- warpdom-compare-action:${prefix.slice(0, 59)}…`), markers[0]);
  assert.match(markers[0], / \| sha256:[0-9a-f]{64} -->$/);
  // No marker is a prefix of another, so upsertComment's startsWith match is exact.
  for (const a of markers) for (const b of markers) if (a !== b) assert.ok(!b.startsWith(a), `${a} / ${b}`);
});

test('compare action: step outputs', () => {
  const values = outputs(result(), { exitCode: 1, fail: false, reportDir: '/tmp/r' });
  assert.deepEqual(values, {
    'exit-code': '1',
    compared: '10',
    regressions: '2',
    fixed: '1',
    differences: '3',
    'baseline-ms': '12000',
    'warpdom-ms': '6000',
    speedup: '2.00',
    'report-dir': '/tmp/r',
    fail: 'false',
  });
  assert.equal(outputs(null, { exitCode: null, fail: true, reportDir: '' })['exit-code'], '');
  assert.equal(formatOutputs({ a: '1', b: 'x\ny' }), 'a=1\nb=x y\n');
  assert.equal(commandText('50%\nnext'), '50%25%0Anext');
  assert.equal(pullRequestNumber({ pull_request: { number: 7 } }), 7);
  assert.equal(pullRequestNumber({ push: {} }), null);
  assert.equal(pullRequestNumber(null), null);
});

// A fake GitHub API holding a pull request's comments, and the calls made.
// `user`: the token's login for GET /user, or 'integration' (the Actions
// token's 403) or 'rate-limited' (a 403 with x-ratelimit-remaining 0).
// `writeStatus`: the status of POST, PATCH and DELETE (403 for a fork's
// read-only token). `racer`: a comment another run posts while this one does.
function fakeGitHub(initial, { user = 'integration', writeStatus = 200, racer = null } = {}) {
  const calls = [];
  const state = initial.map((c) => ({ ...c }));
  let nextId = 1000;
  const self = user === 'integration' ? bot : person(user);
  const reply = (status, data, headers = {}) => ({
    ok: status < 300,
    status,
    headers: { get: (name) => headers[name.toLowerCase()] ?? null },
    json: async () => data,
  });
  const fetch = async (url, init) => {
    const body = init.body ? JSON.parse(init.body).body : undefined;
    calls.push({ method: init.method, url, body, auth: init.headers.Authorization });
    if (url.endsWith('/user')) {
      if (user === 'integration') return reply(403, { message: 'Resource not accessible by integration' });
      if (user === 'rate-limited') {
        return reply(403, { message: 'API rate limit exceeded' }, { 'x-ratelimit-remaining': '0' });
      }
      return reply(200, { login: user });
    }
    if (init.method === 'GET') {
      const page = Number(new URL(url).searchParams.get('page'));
      return reply(200, state.slice((page - 1) * 100, page * 100));
    }
    if (writeStatus !== 200) return reply(writeStatus, { message: 'Resource not accessible by integration' });
    const id = Number(url.split('/').at(-1));
    if (init.method === 'POST') {
      if (racer) state.push({ ...racer });
      const created = { id: nextId++, body, user: self };
      state.push(created);
      return reply(201, created);
    }
    const i = state.findIndex((c) => c.id === id);
    if (i < 0) return reply(404, { message: 'Not Found' });
    if (init.method === 'DELETE') {
      state.splice(i, 1);
      return reply(204, null);
    }
    state[i].body = body;
    return reply(200, state[i]);
  };
  return { fetch, calls, state };
}

const commentArgs = (fetch, extra = {}) => ({
  fetch,
  api: 'https://api.github.test',
  repository: 'o/r',
  number: 5,
  token: 't0k',
  body: `${marker('.')}\nnew`,
  workingDirectory: '.',
  ...extra,
});
const bot = { login: 'github-actions[bot]', type: 'Bot' };
const person = (login) => ({ login, type: 'User' });
const report = (id, user, dir = '.') => ({ id, body: `${marker(dir)}\nold`, user });
const comments = (n, from = 1) => Array.from({ length: n }, (_, i) => ({ id: from + i, body: 'x', user: person('a') }));
const writes = (calls) =>
  calls.filter((c) => c.method !== 'GET').map((c) => [c.method, c.url.replace(/.*\/repos\/o\/r/, '')]);

test('compare action: creates a comment when none has the marker', async () => {
  const gh = fakeGitHub([{ id: 1, body: 'hello', user: bot }, report(2, bot, 'other')]);
  assert.deepEqual(await upsertComment(commentArgs(gh.fetch)), { action: 'created', id: 1000 });
  assert.deepEqual(
    gh.calls.slice(0, 3).map((c) => [c.method, c.url]),
    [
      ['GET', 'https://api.github.test/user'],
      ['GET', 'https://api.github.test/repos/o/r/issues/5/comments?per_page=100&page=1'],
      ['POST', 'https://api.github.test/repos/o/r/issues/5/comments'],
    ],
  );
  assert.equal(gh.calls[1].auth, 'Bearer t0k');
  assert.equal(gh.calls[2].body, `${marker('.')}\nnew`);
  assert.deepEqual(writes(gh.calls), [['POST', '/issues/5/comments']]);
});

test('compare action: updates the earlier comment, found on a later page', async () => {
  const gh = fakeGitHub([...comments(100), report(500, bot)]);
  assert.deepEqual(await upsertComment(commentArgs(gh.fetch)), { action: 'updated', id: 500 });
  assert.deepEqual(writes(gh.calls), [['PATCH', '/issues/comments/500']]);
  assert.equal(gh.state.at(-1).body, `${marker('.')}\nnew`);
});

test("compare action: only a comment by the token's author is updated", async () => {
  // The Actions token: github-actions[bot]'s report, not a person's comment
  // quoting the marker, nor another app's.
  const app = { login: 'other-app[bot]', type: 'Bot' };
  const actions = fakeGitHub([report(1, person('someone')), report(2, app), report(3, bot)]);
  assert.deepEqual(await upsertComment(commentArgs(actions.fetch)), { action: 'updated', id: 3 });
  const notOurs = fakeGitHub([report(1, person('someone')), report(2, app)]);
  assert.deepEqual(await upsertComment(commentArgs(notOurs.fetch)), { action: 'created', id: 1000 });
  // A personal token: its user's comment, not a bot's.
  const custom = fakeGitHub([report(1, bot), report(2, person('me'))], { user: 'me' });
  assert.deepEqual(await upsertComment(commentArgs(custom.fetch)), { action: 'updated', id: 2 });
  // An app token, named with comment-author: /user is not asked.
  const named = fakeGitHub([report(1, bot), report(2, app)]);
  assert.deepEqual(await upsertComment(commentArgs(named.fetch, { author: 'other-app[bot]' })), {
    action: 'updated',
    id: 2,
  });
  assert.ok(!named.calls.some((c) => c.url.endsWith('/user')));
});

test('compare action: a rate-limited /user is an error, not a guess at the author', async () => {
  const gh = fakeGitHub([report(1, bot)], { user: 'rate-limited' });
  const err = await upsertComment(commentArgs(gh.fetch)).then(
    () => null,
    (e) => e,
  );
  assert.equal(err.status, 403);
  assert.equal(err.rateLimited, true);
  assert.deepEqual(writes(gh.calls), []);
  assert.match(commentFailure(err), /rate limited/);
});

test('compare action: the page cap without the report skips instead of posting a duplicate', async () => {
  const gh = fakeGitHub([...comments(200), report(500, bot)]);
  const done = await upsertComment(commentArgs(gh.fetch, { maxPages: 2 }));
  assert.equal(done.action, 'skipped');
  assert.match(done.reason, /more than 200 comments/);
  assert.deepEqual(writes(gh.calls), []);
  // Exactly full pages, then an empty one: searched completely.
  const exact = fakeGitHub(comments(100));
  assert.equal((await upsertComment(commentArgs(exact.fetch, { maxPages: 2 }))).action, 'created');
});

test('compare action: two overlapping runs leave one report', async () => {
  // Another run posted its report between this run's search and its POST:
  // the older one is kept with this body, this run's copy is deleted.
  const gh = fakeGitHub([], { racer: report(900, bot) });
  assert.deepEqual(await upsertComment(commentArgs(gh.fetch)), { action: 'updated', id: 900 });
  assert.deepEqual(writes(gh.calls), [
    ['POST', '/issues/5/comments'],
    ['DELETE', '/issues/comments/1000'],
    ['PATCH', '/issues/comments/900'],
  ]);
  assert.deepEqual(
    gh.state.map((c) => [c.id, c.body]),
    [[900, `${marker('.')}\nnew`]],
  );
});

// Reports from releases before #133 began with cell(path) as the marker.
const legacyReport = (id, user, dir) => ({ id, body: `<!-- warpdom-compare-action:${cell(dir)} -->\nold`, user });

test('compare action: a report from an earlier release is updated when its marker is unambiguous (#133)', async () => {
  // cell() escaped these reversibly, so the earlier marker was this path's alone.
  for (const dir of ['packages/ui', 'a&b', 'a|b']) {
    const gh = fakeGitHub([legacyReport(8, bot, dir)]);
    const args = { workingDirectory: dir, body: renderComment('new\n', dir) };
    assert.deepEqual(await upsertComment(commentArgs(gh.fetch, args)), { action: 'updated', id: 8 }, dir);
    assert.deepEqual(writes(gh.calls), [['PATCH', '/issues/comments/8']]);
    assert.equal(gh.state[0].body, args.body);
  }
});

test('compare action: an earlier report under a lossy marker is never touched (#133)', async () => {
  // cell('a`b') = "a'b" is also the marker of the working directory "a'b",
  // and cell() of a long path is the marker of its shortened form: either
  // working directory may own the comment and update it at any time.
  for (const dir of ['a`b', `packages/${'a'.repeat(190)}/one`]) {
    const gh = fakeGitHub([legacyReport(7, bot, dir)]);
    const args = { workingDirectory: dir, body: renderComment('new\n', dir) };
    assert.deepEqual(await upsertComment(commentArgs(gh.fetch, args)), { action: 'created', id: 1000 }, dir);
    assert.deepEqual(writes(gh.calls), [['POST', '/issues/5/comments']]);
    assert.equal(gh.state[0].body, legacyReport(7, bot, dir).body);
  }
});

test('compare action: a read-only token (fork pull request) gives a warning, not a failure', async () => {
  const gh = fakeGitHub([], { writeStatus: 403 });
  const err = await upsertComment(commentArgs(gh.fetch)).then(
    () => null,
    (e) => e,
  );
  assert.equal(err.status, 403);
  assert.match(
    commentFailure(err),
    /forks get a read-only token.*pull-requests: write.*job summary has the same content/,
  );
  assert.match(
    commentFailure(Object.assign(new Error('boom'), { status: 500 })),
    /^could not post the pull request comment \(boom\)/,
  );
});

test('compare action: action.yml passes every input through the environment, never into script text', () => {
  const yml = fs.readFileSync(path.join(root, 'compare-action', 'action.yml'), 'utf8');
  const inputs = [...yml.split(/\noutputs:\n/)[0].matchAll(/^ {2}([a-z-]+):$/gm)].map((m) => m[1]);
  assert.ok(inputs.length >= 15, inputs.join());
  for (const name of inputs) {
    const variable = `INPUT_${name.toUpperCase().replace(/-/g, '_')}`;
    assert.match(yml, new RegExp(`${variable}: \\$\\{\\{ .*inputs\\.${name}\\b`), name);
  }
  assert.match(
    yml,
    /INPUT_GITHUB_TOKEN: \$\{\{ inputs\.pr-comment == 'true' && inputs\.github-token \|\| '' \}\}/,
    'the token only with pr-comment',
  );
  const runs = [...yml.matchAll(/run: \|?\n?((?: {8}.*\n)+|.*\n)/g)].map((m) => m[1]);
  assert.ok(runs.length >= 2);
  for (const script of runs) assert.doesNotMatch(script, /\$\{\{/, script);
  for (const uses of yml.matchAll(/uses: (\S+)( # .*)?/g))
    assert.match(uses[0], /@[0-9a-f]{40} # v\d/, 'actions pinned to a commit');
});

// main.mjs end to end with a fake npx on PATH that writes a results.json
// into the --out directory it is given (POSIX only: the fake is a script).
test('compare action: each invocation gets its own report directory', { skip: process.platform === 'win32' }, () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'warpdom-action-'));
  try {
    const bin = path.join(tmp, 'bin');
    fs.mkdirSync(bin);
    const npx = path.join(bin, 'npx');
    fs.writeFileSync(
      npx,
      `#!${process.execPath}\nconst fs = require('fs');\nconst a = process.argv;\n` +
        `const out = a[a.indexOf('--out') + 1];\n` +
        `fs.writeFileSync(out + '/results.json', JSON.stringify(${JSON.stringify(result())}));\nprocess.exit(1);\n`,
    );
    fs.chmodSync(npx, 0o755);
    for (const dir of ['packages/ui', 'packages_ui']) fs.mkdirSync(path.join(tmp, dir), { recursive: true });
    const run = (dir) => {
      const output = path.join(tmp, `output-${Math.random()}`);
      const summaryFile = path.join(tmp, `summary-${Math.random()}`);
      const res = spawnSync(process.execPath, [path.join(root, 'compare-action', 'main.mjs')], {
        encoding: 'utf8',
        env: {
          PATH: `${bin}${path.delimiter}${process.env.PATH}`,
          GITHUB_WORKSPACE: tmp,
          RUNNER_TEMP: path.join(tmp, 'runner'),
          GITHUB_OUTPUT: output,
          GITHUB_STEP_SUMMARY: summaryFile,
          INPUT_WORKING_DIRECTORY: dir,
          INPUT_JOB_SUMMARY: 'true',
          INPUT_GITHUB_TOKEN: 'secret',
        },
      });
      assert.equal(res.status, 0, res.stdout + res.stderr);
      const values = Object.fromEntries(
        fs
          .readFileSync(output, 'utf8')
          .trim()
          .split('\n')
          .map((line) => line.split(/=(.*)/s).slice(0, 2)),
      );
      assert.match(fs.readFileSync(summaryFile, 'utf8'), /3 tests differ/);
      return values;
    };
    const first = run('packages/ui');
    const second = run('packages_ui');
    const again = run('packages/ui');
    const dirs = [first, second, again].map((v) => v['report-dir']);
    assert.equal(new Set(dirs).size, 3, dirs.join());
    for (const dir of dirs) assert.ok(fs.existsSync(path.join(dir, 'results.json')), dir);
    assert.deepEqual([first.regressions, first['exit-code'], first.fail], ['2', '1', 'false']);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
