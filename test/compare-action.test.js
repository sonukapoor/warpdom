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
  assert.match(text, /#### Tests whose status differs \(3\)/);
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
    /10 tests compared, 9 with the same status and no status changes; 1 flaky test not counted \(below\)\./,
  );
  assert.match(flakyOnly, /Also: 1 test flaky on warpdom/);

  const installed = renderSummary(result({ warpdom: { source: 'installed', version: '0.1.7' } }));
  assert.match(installed, /warpdom 0\.1\.7 is installed in the project, so the comparison used that copy/);
  assert.doesNotMatch(renderSummary(result()), /is installed in the project/);

  const same = renderSummary(result({ differences: [] }));
  assert.match(same, /10 tests compared, all with the same status on jsdom and warpdom\./);
  assert.doesNotMatch(same, /Tests whose status differs/);

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
  const long = renderComment('x'.repeat(COMMENT_LIMIT * 2), '.');
  assert.ok(long.length < COMMENT_LIMIT + 100);
  assert.match(long, /shortened; the job summary has the rest/);
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

// A fake GitHub API: comments per page, and the calls made. `user` is the
// token's login for GET /user; null answers 403 there, as for the Actions
// token and app tokens.
function fakeGitHub(pages, { status = 200, user = null } = {}) {
  const calls = [];
  const fetch = async (url, init) => {
    calls.push({
      method: init.method,
      url,
      body: init.body ? JSON.parse(init.body).body : undefined,
      auth: init.headers.Authorization,
    });
    if (status !== 200) return { ok: false, status, json: async () => ({}) };
    if (url.endsWith('/user')) {
      if (!user) return { ok: false, status: 403, json: async () => ({}) };
      return { ok: true, status: 200, json: async () => ({ login: user }) };
    }
    if (init.method === 'GET') {
      const page = Number(new URL(url).searchParams.get('page'));
      return { ok: true, status: 200, json: async () => pages[page - 1] ?? [] };
    }
    return { ok: true, status: 201, json: async () => ({ id: 99 }) };
  };
  return { fetch, calls };
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

test('compare action: creates a comment when none has the marker', async () => {
  const { fetch, calls } = fakeGitHub([[{ id: 1, body: 'hello', user: bot }, report(2, bot, 'other')]]);
  assert.deepEqual(await upsertComment(commentArgs(fetch)), { action: 'created', id: 99 });
  assert.deepEqual(
    calls.map((c) => [c.method, c.url]),
    [
      ['GET', 'https://api.github.test/user'],
      ['GET', 'https://api.github.test/repos/o/r/issues/5/comments?per_page=100&page=1'],
      ['POST', 'https://api.github.test/repos/o/r/issues/5/comments'],
    ],
  );
  assert.equal(calls[1].auth, 'Bearer t0k');
  assert.equal(calls[2].body, `${marker('.')}\nnew`);
});

test('compare action: updates the earlier comment, found on a later page', async () => {
  const { fetch, calls } = fakeGitHub([comments(100), [report(500, bot)]]);
  assert.deepEqual(await upsertComment(commentArgs(fetch)), { action: 'updated', id: 500 });
  assert.deepEqual(
    calls.map((c) => c.method),
    ['GET', 'GET', 'GET', 'PATCH'],
  );
  assert.equal(calls[3].url, 'https://api.github.test/repos/o/r/issues/comments/500');
});

test("compare action: only a comment by the token's author is updated", async () => {
  // The Actions token (no /user): a person's comment quoting the marker is
  // not the report; the bot's is.
  const actions = fakeGitHub([[report(1, person('someone')), report(2, bot)]]);
  assert.deepEqual(await upsertComment(commentArgs(actions.fetch)), { action: 'updated', id: 2 });
  const quotedOnly = fakeGitHub([[report(1, person('someone'))]]);
  assert.deepEqual(await upsertComment(commentArgs(quotedOnly.fetch)), { action: 'created', id: 99 });
  // A personal token: its user's comment, not a bot's.
  const custom = fakeGitHub([[report(1, bot), report(2, person('me'))]], { user: 'me' });
  assert.deepEqual(await upsertComment(commentArgs(custom.fetch)), { action: 'updated', id: 2 });
  const otherUser = fakeGitHub([[report(1, person('someone'))]], { user: 'me' });
  assert.deepEqual(await upsertComment(commentArgs(otherUser.fetch)), { action: 'created', id: 99 });
});

test('compare action: the page cap without the report skips instead of posting a duplicate', async () => {
  const { fetch, calls } = fakeGitHub([comments(100), comments(100, 101), [report(500, bot)]]);
  const done = await upsertComment(commentArgs(fetch, { maxPages: 2 }));
  assert.equal(done.action, 'skipped');
  assert.match(done.reason, /more than 200 comments/);
  assert.ok(!calls.some((c) => c.method === 'POST' || c.method === 'PATCH'));
  // Exactly full pages, then an empty one: searched completely.
  const exact = fakeGitHub([comments(100), []]);
  assert.equal((await upsertComment(commentArgs(exact.fetch, { maxPages: 2 }))).action, 'created');
});

test('compare action: a read-only token (fork pull request) gives a warning, not a failure', async () => {
  const { fetch } = fakeGitHub([[]], { status: 403 });
  const err = await upsertComment(commentArgs(fetch)).then(
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
