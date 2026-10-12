// Rendering a comparison for `warpdom compare`: the terminal summary and
// report.md. The report's Summary part names no files or tests, so it can
// be pasted into a public issue; the Details part lists them.

const secs = (ms) => (ms == null ? '-' : `${(ms / 1000).toFixed(ms < 10_000 ? 2 : 1)} s`);
const times = (x) => `${x.toFixed(2)}x`;
const plural = (n, one, many = `${one}s`) => `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`;
const pad = (s, n) => String(s).padEnd(n);
const INDENT = ' '.repeat(10);

// A short name for an environment: Jest gives resolved paths.
export function environmentLabel(environment) {
  const value = String(environment ?? 'unknown');
  if (!/^([a-zA-Z]:)?[\\/]/.test(value)) return value;
  const parts = value.split(/[\\/]/);
  const i = parts.lastIndexOf('node_modules');
  const pkg = i >= 0 && parts[i + 1] ? (parts[i + 1].startsWith('@') ? `${parts[i + 1]}/${parts[i + 2]}` : parts[i + 1]) : null;
  if (pkg === '.warpdom-compare' || pkg === 'warpdom' || (!pkg && parts.includes('warpdom'))) return 'warpdom';
  if (pkg === '@happy-dom/jest-environment') return 'happy-dom';
  if (pkg?.startsWith('jest-environment-')) return pkg.slice('jest-environment-'.length);
  return pkg ?? parts.at(-1);
}

export function speedPhrase(speedup) {
  if (!speedup) return '';
  return speedup >= 1 ? `${times(speedup)} faster` : `${times(1 / speedup)} slower`;
}

function baselineLabel(result) {
  return result.baseline?.name ?? 'baseline';
}

function header(result) {
  if (!result.runner) return 'warpdom compare';
  const dom = result.baseline;
  const domText = dom?.version ? `${dom.name} ${dom.version}` : dom?.name ?? 'unknown';
  const profile = dom?.name === 'jsdom' && dom.version ? ` (warpdom's jsdom-${dom.version.split('.')[0]} profile)` : '';
  const runner = `${result.runner}${result.runnerVersion ? ` ${result.runnerVersion}` : ''}`;
  const projects = (result.projects?.length ?? 0) > 1 ? `, ${plural(result.projects.length, 'project')}` : '';
  const opts = result.warpdomOptions?.fastFrames ? ', warpdom with fastFrames' : '';
  return `warpdom compare: ${runner}${projects}, baseline ${domText}${profile}${opts}`;
}

// Lines about what was not compared (no names).
function notComparedLines(result) {
  const lines = [];
  const pinned = result.pinned;
  if (pinned?.switched) {
    lines.push(`${plural(pinned.switched, 'file')} ${pinned.switched === 1 ? 'pins' : 'pin'} ${pinned.switchedEnvironments.join('/')} with a comment; switched`);
    if (pinned.withOptions) lines.push(`(${plural(pinned.withOptions, 'switched file')} also ${pinned.withOptions === 1 ? 'sets' : 'set'} @vitest-environment-options, which stay keyed by the original name and do not reach warpdom)`);
  }
  if (pinned?.notSwitched ?? pinned?.files) {
    const n = pinned.notSwitched ?? pinned.files;
    const why = result.runner === 'jest' ? ' (Jest reads the comment in its workers)' : '';
    lines.push(`Not compared: ${plural(n, 'file')} (${plural(pinned.tests, 'test')}) ${n === 1 ? 'chooses' : 'choose'} ${(pinned.notSwitchedEnvironments ?? pinned.environments).join('/')} with a comment and were not switched${why}`);
  }
  const unswitched = (result.projects ?? []).filter((p) => p.unswitched);
  if (unswitched.length) {
    const byProject = result.correctness?.byProject ?? {};
    const tests = unswitched.reduce((n, p) => n + (byProject[p.name ?? '']?.notCompared ?? 0), 0);
    lines.push(`Not compared: ${plural(unswitched.length, 'project')} on ${[...new Set(unswitched.map((p) => environmentLabel(p.environment)))].join(', ')}${tests ? ` (${plural(tests, 'test')})` : ''} that compare could not switch`);
  }
  const others = (result.projects ?? []).filter((p) => !p.dom && !p.unswitched);
  if (others.length) {
    const environments = [...new Set(others.filter((p) => !p.browser).map((p) => environmentLabel(p.environment)))];
    const where = [environments.length ? `on ${environments.join(', ')}` : null, others.some((p) => p.browser) ? 'in browser mode' : null].filter(Boolean).join(' and ');
    const byProject = result.correctness?.byProject ?? {};
    const tests = others.reduce((n, p) => n + (byProject[p.name ?? '']?.notCompared ?? 0), 0);
    lines.push(`Not compared: ${plural(others.length, 'project')} ${where}${tests ? ` (${plural(tests, 'test')})` : ''}, ran unchanged in both runs`);
  }
  const changed = result.correctness?.notComparedChanged?.length;
  if (changed) lines.push(`(${plural(changed, 'test')} not compared changed status between runs anyway: listed in the report)`);
  return lines;
}

function resultLines(result) {
  const c = result.correctness;
  const base = baselineLabel(result);
  const lines = [];
  if (!c.differences.length) {
    lines.push(`${plural(c.compared - c.flakyBaseline.length - c.flakyWarpdom.length, 'test')}, all with the same status on ${base} and warpdom`);
  } else {
    const parts = [];
    if (c.regressions) parts.push(`${c.regressions} pass on ${base} and fail on warpdom`);
    if (c.fixed) parts.push(`${c.fixed} fail on ${base} and pass on warpdom`);
    if (c.other) parts.push(`${c.other} other (skipped or missing on one side)`);
    lines.push(`${plural(c.compared, 'test')}, ${plural(c.same, 'test')} with the same status; ${parts.join(', ')}`);
  }
  if (c.flakyBaseline.length) lines.push(`(${c.flakyBaseline.length} flaky on ${base} itself: listed in the report, not counted)`);
  if (c.flakyWarpdom.length) lines.push(`(${c.flakyWarpdom.length} flaky on warpdom only: listed in the report)`);
  return lines;
}

function speedLines(result) {
  const t = result.timing;
  if (!t) return ['not measured (--correctness)'];
  if (!t.rounds) return ['not measured'];
  const base = baselineLabel(result);
  const w = Math.max(base.length, 8) + 2;
  const lines = [`${pad('round', 8)}${pad(base, w)}warpdom`];
  for (const r of t.perRound) lines.push(`${pad(r.round, 8)}${pad(secs(r.baselineMs), w)}${pad(secs(r.warpdomMs), 9)}${t.rounds > 1 ? ` ${times(r.baselineMs / r.warpdomMs)}` : ''}`);
  const spread = t.rounds > 1 && t.spread ? ` (spread ${times(t.spread.min)}-${times(t.spread.max)})` : '';
  if (t.rounds > 1) lines.push(`${pad('median', 8)}${pad(secs(t.baselineMs), w)}${pad(secs(t.warpdomMs), 9)} ${speedPhrase(t.speedup)}${spread}`);
  else lines[1] += `  ${speedPhrase(t.speedup)}`;
  if (t.indicative) lines.push('indicative, single round: use --rounds 3 for numbers worth quoting');
  if (t.noisy) lines.push('the rounds differ by more than 10%: the machine was busy; use more rounds or close other programs');
  lines.push(`times: ${t.source === 'runner' ? "the runner's reported duration" : 'wall clock of the runner process'}`);
  return lines;
}

function section(label, lines) {
  return lines.map((line, i) => (i === 0 ? pad(label, 10) : INDENT) + line).join('\n');
}

const groupTitle = (g) => `${String(g.tests.length).padStart(4)}  ${g.change}${g.message ? `  ${g.message}` : ''}`;

// The terminal summary.
export function renderConsole(result, { reportPath = null, groupLimit = 10 } = {}) {
  const out = [];
  if (result.error && !result.correctness) {
    out.push(header(result));
    out.push('');
    out.push(section('Error', [result.error]));
  } else {
    out.push(header(result), '');
    const results = resultLines(result);
    const groups = result.correctness.groups;
    for (const g of groups.slice(0, groupLimit)) results.push(groupTitle(g));
    if (groups.length > groupLimit) results.push(`... ${groups.length - groupLimit} more groups in the report`);
    results.push(...notComparedLines(result));
    out.push(section('Results', results), '');
    out.push(section('Speed', speedLines(result)), '');
    if (result.error) out.push(section('Error', [result.error]), '');
  }
  if (result.gitChanges?.length) {
    out.push(section('Warning', ['files in the project changed during the comparison:', ...result.gitChanges.slice(0, 10)]), '');
  }
  for (const w of result.warnings ?? []) out.push(section('Warning', [w]), '');
  if (reportPath) out.push(section('Report', [`${reportPath} (shareable summary: no file or test names)`]));
  return out.join('\n').trimEnd() + '\n';
}

const testLabel = (t) => `${t.project ? `[${t.project}] ` : ''}\`${t.file}\` › ${t.name}`;

// Per project (details only: project names may be private).
function projectTable(result, md) {
  const byProject = result.correctness.byProject ?? {};
  const projects = result.projects ?? [];
  const names = [...new Set([...projects.map((p) => p.name ?? ''), ...Object.keys(byProject)])];
  if (names.length < 2 && !names.some(Boolean)) return;
  const base = baselineLabel(result);
  md.push('### Projects', '');
  md.push(`| Project | Environment | Compared | Same | Pass on ${base}, fail on warpdom | Fail on ${base}, pass on warpdom | Other | Flaky | Not compared |`);
  md.push('|---|---|---:|---:|---:|---:|---:|---:|---:|');
  for (const name of names) {
    const p = projects.find((x) => (x.name ?? '') === name);
    const n = byProject[name] ?? { compared: 0, same: 0, regressions: 0, fixed: 0, other: 0, flaky: 0, notCompared: 0 };
    const environment = !p ? '-' : p.browser ? 'browser mode' : `${environmentLabel(p.environment)}${p.unswitched ? ' (not switched, not compared)' : p.dom ? '' : ' (not compared)'}`;
    md.push(`| ${name || '(unnamed)'} | ${environment} | ${n.compared} | ${n.same} | ${n.regressions} | ${n.fixed} | ${n.other} | ${n.flaky} | ${n.notCompared} |`);
  }
  md.push('');
}

function machineLine(env) {
  if (!env) return null;
  return `${env.os.platform} ${env.os.release} (${env.os.arch}), ${env.cpu.model ?? 'unknown CPU'}, ${env.cpu.cores} cores, ${env.memory.totalGiB} GiB, Node ${env.node}`;
}

// report.md.
export function renderMarkdown(result) {
  const base = baselineLabel(result);
  const md = ['# warpdom compare', '', '## Summary', ''];
  md.push('```', header(result), '```', '');
  md.push(`- Runner: ${result.runner} ${result.runnerVersion ?? ''}`.trimEnd());
  md.push(`- Baseline: ${result.baseline?.name ?? '-'} ${result.baseline?.version ?? ''}`.trimEnd());
  md.push(`- warpdom: ${result.warpdom?.version ?? '-'} (${result.warpdom?.source === 'installed' ? 'installed in the project' : 'copied into node_modules for the run'})`);
  const machine = machineLine(result.environment);
  if (machine) md.push(`- Machine: ${machine}`);
  md.push(`- Mode: ${result.mode === 'correctness' ? 'correctness (one run each, no speed claims)' : `${plural(result.timing?.rounds ?? 0, 'timed round')}${result.warmup ? ' after an untimed warm-up pair' : ''}`}`);
  if (result.error) md.push(`- Error: ${result.error}`);
  md.push('');
  if (result.correctness) {
    const c = result.correctness;
    md.push('### Results', '');
    md.push('| | Tests |', '|---|---:|');
    md.push(`| Compared | ${c.compared} |`, `| Same status | ${c.same} |`);
    md.push(`| Pass on ${base}, fail on warpdom | ${c.regressions} |`, `| Fail on ${base}, pass on warpdom | ${c.fixed} |`);
    md.push(`| Other (skipped or missing on one side) | ${c.other} |`);
    md.push(`| Flaky on ${base} itself (not counted) | ${c.flakyBaseline.length} |`, `| Flaky on warpdom only | ${c.flakyWarpdom.length} |`);
    md.push('');
    for (const line of notComparedLines(result)) md.push(`- ${line}`);
    if (notComparedLines(result).length) md.push('');
  }
  if (result.timing?.rounds) {
    const t = result.timing;
    md.push('### Speed', '');
    md.push(`| Round | ${base} | warpdom | Ratio |`, '|---|---:|---:|---:|');
    for (const r of t.perRound) md.push(`| ${r.round} | ${secs(r.baselineMs)} | ${secs(r.warpdomMs)} | ${times(r.baselineMs / r.warpdomMs)} |`);
    md.push(`| **median** | ${secs(t.baselineMs)} | ${secs(t.warpdomMs)} | **${speedPhrase(t.speedup)}** |`, '');
    if (t.spread && t.rounds > 1) md.push(`Spread of the per-round ratios: ${times(t.spread.min)}-${times(t.spread.max)}.`);
    if (t.indicative) md.push('Indicative: a single round. Use `--rounds 3` or more for numbers worth quoting.');
    if (t.noisy) md.push('The rounds differ by more than 10%: the machine was busy. Use more rounds or close other programs.');
    md.push(`Times are ${t.source === 'runner' ? "the runner's reported duration" : 'the wall clock of the runner process'}.`, '');
  }
  md.push('## Details', '');
  if (result.correctness) {
    const c = result.correctness;
    projectTable(result, md);
    const titles = { regression: `Pass on ${base}, fail on warpdom`, fixed: `Fail on ${base}, pass on warpdom`, other: 'Other' };
    for (const cls of ['regression', 'fixed', 'other']) {
      const groups = c.groups.filter((g) => g.class === cls);
      if (!groups.length) continue;
      md.push(`### ${titles[cls]}`, '');
      for (const g of groups) {
        md.push(`#### ${g.tests.length} × ${g.change}`, '');
        if (g.message) md.push('```', g.message, '```', '');
        for (const t of g.tests.slice(0, 50)) md.push(`- ${testLabel(t)}`);
        if (g.tests.length > 50) md.push(`- ... ${g.tests.length - 50} more (results.json)`);
        md.push('');
      }
    }
    const unswitched = 'Changed status in tests that were not compared (same environment in both runs)';
    for (const [title, list] of [[`Flaky on ${base} itself`, c.flakyBaseline], ['Flaky on warpdom only', c.flakyWarpdom], [unswitched, c.notComparedChanged ?? []]]) {
      if (!list.length) continue;
      md.push(`### ${title}`, '');
      for (const t of list) md.push(`- ${testLabel(t)}: ${base} ${t.baseline.join(', ')}; warpdom ${t.warpdom.join(', ')}`);
      md.push('');
    }
    if (result.pinned?.files) {
      md.push('### Files that choose their environment with a comment', '');
      for (const f of result.pinned.list) md.push(`- \`${f.file}\`: ${f.environment}${f.switched ? ', switched' : ', not switched'}${f.options ? ' (has @vitest-environment-options, not passed to warpdom)' : ''}`);
      md.push('');
    }
  }
  if (result.runs?.length) {
    md.push('### Runs', '', '| # | Environment | Round | Exit | Time | Passed | Failed | Log |', '|---:|---|---|---:|---:|---:|---:|---|');
    for (const r of result.runs) {
      md.push(`| ${r.index} | ${r.side === 'baseline' ? base : 'warpdom'} | ${r.warmup ? 'warm-up' : r.round ?? '-'} | ${r.code ?? r.signal ?? '-'} | ${secs(r.ms)} | ${r.counts?.passed ?? '-'} | ${r.counts?.failed ?? '-'} | ${r.log} |`);
    }
    md.push('');
  }
  if (result.gitChanges?.length) {
    md.push('### Files changed in the project during the comparison', '');
    for (const line of result.gitChanges) md.push(`- \`${line}\``);
    md.push('');
  }
  return md.join('\n').trimEnd() + '\n';
}
