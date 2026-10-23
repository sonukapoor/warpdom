// Entry point of the warpdom compare GitHub Action (action.yml): runs
// `npx warpdom compare` in the working directory, writes the job summary,
// optionally creates or updates one pull request comment, and sets the step
// outputs. Exits 0 unless the inputs are invalid: whether the job fails on
// differences is decided by the action's last step from the `fail` output,
// after the report has been uploaded.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  readInputs,
  compareArgs,
  nodeSupported,
  shouldFail,
  renderSummary,
  renderComment,
  outputs,
  formatOutputs,
  pullRequestNumber,
  upsertComment,
  commentFailure,
  commandText,
  childEnvironment,
  MIN_NODE,
} from './lib.mjs';

const env = process.env;
const notice = (level, text) => process.stdout.write(`::${level}::${commandText(text)}\n`);

function append(file, text) {
  if (file) fs.appendFileSync(file, text);
}

// npx without a shell: on Windows, npm's npx-cli.js next to node.exe.
function npxCommand(args) {
  if (process.platform !== 'win32') return ['npx', args];
  const cli = path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npx-cli.js');
  return [process.execPath, [cli, ...args]];
}

async function comment(inputs, text) {
  let event = null;
  try {
    event = JSON.parse(fs.readFileSync(env.GITHUB_EVENT_PATH, 'utf8'));
  } catch {
    // No event file: not running in GitHub Actions.
  }
  const number = pullRequestNumber(event);
  if (!number) {
    process.stdout.write('pr-comment: not a pull request event; no comment.\n');
    return;
  }
  if (!env.INPUT_GITHUB_TOKEN) {
    notice('warning', 'pr-comment is true but github-token is empty; no comment.');
    return;
  }
  try {
    const done = await upsertComment({
      fetch,
      api: env.GITHUB_API_URL || 'https://api.github.com',
      repository: env.GITHUB_REPOSITORY,
      number,
      token: env.INPUT_GITHUB_TOKEN,
      body: renderComment(text, inputs.workingDirectory),
      workingDirectory: inputs.workingDirectory,
    });
    process.stdout.write(`pr-comment: ${done.action} comment ${done.id} on #${number}.\n`);
  } catch (err) {
    notice('warning', commentFailure(err));
  }
}

async function main() {
  let inputs;
  try {
    inputs = readInputs(env);
  } catch (err) {
    notice('error', `warpdom compare action: ${err.message}`);
    return 1;
  }
  const workspace = env.GITHUB_WORKSPACE || process.cwd();
  const cwd = path.resolve(workspace, inputs.workingDirectory);
  const slug = inputs.workingDirectory.replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^\.+$/, 'root');
  const out = path.join(env.RUNNER_TEMP || os.tmpdir(), 'warpdom-compare', slug);
  if (/\.tgz$/.test(inputs.spec)) inputs.spec = path.resolve(workspace, inputs.spec);

  let result = null;
  let exitCode = null;
  let skipped = null;
  if (!nodeSupported(process.versions.node)) {
    skipped =
      `Skipped: warpdom needs Node ${MIN_NODE.join('.')} or newer and this job runs Node ${process.versions.node}. ` +
      'Add actions/setup-node with node-version 22 or newer before this step.';
  } else if (!fs.existsSync(cwd)) {
    skipped = `Skipped: the working directory ${inputs.workingDirectory} does not exist.`;
  }
  if (skipped) {
    notice('warning', skipped);
  } else {
    fs.rmSync(out, { recursive: true, force: true });
    fs.mkdirSync(out, { recursive: true });
    const [command, args] = npxCommand(compareArgs(inputs, out));
    process.stdout.write(`warpdom compare in ${cwd} (${inputs.spec})\n`);
    const res = spawnSync(command, args, {
      cwd,
      stdio: 'inherit',
      env: childEnvironment(env),
    });
    exitCode = res.status;
    if (res.error) notice('warning', `could not start npx: ${res.error.message}`);
    try {
      result = JSON.parse(fs.readFileSync(path.join(out, 'results.json'), 'utf8'));
    } catch {
      notice('warning', `warpdom compare wrote no results (exit code ${exitCode ?? res.signal}); see the log above.`);
    }
  }

  const text = renderSummary(result, {
    workingDirectory: inputs.workingDirectory,
    maxTests: inputs.maxTests,
    artifactName: inputs.artifactName,
    exitCode,
    skipped,
  });
  if (inputs.jobSummary) append(env.GITHUB_STEP_SUMMARY, text);
  if (inputs.prComment) await comment(inputs, text);

  const c = result?.correctness;
  if (result?.error) notice('warning', `warpdom compare could not run: ${result.error}`);
  else if (c?.differences.length) {
    notice(
      'warning',
      `warpdom compare: ${c.differences.length} of ${c.compared} tests differ (${c.regressions} pass on ${result.baseline?.name} and fail on warpdom); see the job summary.`,
    );
  } else if (c) notice('notice', `warpdom compare: all ${c.compared} tests have the same status.`);

  const fail = shouldFail(result, inputs.failOn);
  append(
    env.GITHUB_OUTPUT,
    formatOutputs(outputs(result, { exitCode, fail, reportDir: result || exitCode != null ? out : '' })),
  );
  return 0;
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (err) => {
    // A bug in this script fails the build only when the caller opted in.
    const gate = ['regressions', 'differences'].includes(String(env.INPUT_FAIL_ON).trim());
    notice(gate ? 'error' : 'warning', `warpdom compare action failed: ${err?.stack ?? err}`);
    process.exitCode = gate ? 1 : 0;
  },
);
