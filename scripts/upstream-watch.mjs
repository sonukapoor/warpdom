// Watches the releases warpdom follows and reports what needs a look:
// - jsdom: a release newer than NEWEST_MODELED_JSDOM (a new profile may be
//   needed), and, every run, the inline style surface of a fresh
//   `npm install jsdom@latest` against the default profile
//   (scripts/gen-style-surface.mjs --check), which also catches a new
//   cssstyle release that jsdom's dependency range takes in;
// - vitest and jest: a major release newer than the ones warpdom is tested
//   with (the workflow then runs npm test with the newest Vitest).
// Every finding has a stable title; with --issues it opens one GitHub issue
// per title that has none yet (open or closed), through the gh CLI.
//   node scripts/upstream-watch.mjs [--issues] [--cache <dir>]
// Writes a Markdown report to stdout (and to $GITHUB_STEP_SUMMARY) and exits
// 0; the issues are the signal.
import { execFileSync } from 'node:child_process';
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NEWEST_MODELED_JSDOM, newerJsdomWarning } from '../src/window-features.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const option = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : null);
const cache = option('--cache') ?? join(tmpdir(), 'warpdom-upstream-watch');

// The newest majors warpdom's adapters are tested with.
const TESTED_MAJOR = { vitest: 5, jest: 30 };

async function latest(name) {
  const response = await fetch(`https://registry.npmjs.org/${name}/latest`);
  if (!response.ok) throw new Error(`npm registry: ${name}: HTTP ${response.status}`);
  return (await response.json()).version;
}

const major = (version) => Number.parseInt(version, 10);

// The inline style surface of a fresh jsdom@<version> install against the
// default profile: 'drops: same, writes: same, lacks: same' when it matches.
function styleCheck(version) {
  const dir = join(cache, `jsdom-${version}`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'package.json'), '{"private":true}');
  execFileSync('npm', ['install', '--no-audit', '--no-fund', '--silent', `jsdom@${version}`], { cwd: dir, stdio: 'inherit' });
  const out = execFileSync(process.execPath, [join(root, 'scripts/gen-style-surface.mjs'), '--check', dir, 'base', '--cache', join(cache, 'surface')], { cwd: root, encoding: 'utf8' });
  let cssstyle;
  try { cssstyle = createRequire(join(dir, 'node_modules/jsdom/package.json'))('cssstyle/package.json').version; } catch { /* not found */ }
  return { result: out.trim().split('\n').at(-1), cssstyle };
}

const findings = [];
const lines = ['# Upstream watch', ''];

const jsdom = await latest('jsdom');
lines.push(`- jsdom latest: ${jsdom} (newest modeled: ${NEWEST_MODELED_JSDOM})`);
if (newerJsdomWarning(jsdom) !== null) {
  findings.push({
    title: `Upstream: jsdom ${jsdom} is newer than the newest modeled jsdom (${NEWEST_MODELED_JSDOM})`,
    body: `jsdom ${jsdom} is on npm. warpdom models jsdom up to ${NEWEST_MODELED_JSDOM} (NEWEST_MODELED_JSDOM in src/window-features.js), so projects that install it get ${NEWEST_MODELED_JSDOM}'s behavior and a warning.\n\nTo do: measure its style surface (scripts/gen-style-surface.mjs, add it to COMBOS), check its release notes for behavior tests observe, run the version corpus (dom-api-tracer timing.yml, mode versions), then raise NEWEST_MODELED_JSDOM.`,
  });
}

const style = styleCheck(jsdom);
lines.push(`- style surface of jsdom@${jsdom} (cssstyle ${style.cssstyle ?? 'none'}) against the default profile: ${style.result}`);
if (style.result.includes('DIFFERENT')) {
  findings.push({
    title: `Upstream: inline style surface of jsdom ${jsdom} with cssstyle ${style.cssstyle ?? 'none'} differs from warpdom's default profile`,
    body: `A fresh \`npm install jsdom@${jsdom}\` (cssstyle ${style.cssstyle ?? 'none'}) measured with \`node scripts/gen-style-surface.mjs --check <dir> base\`: ${style.result}.\n\nProjects that install this combination can see element.style results that differ from warpdom. To do: add the combination to COMBOS in scripts/gen-style-surface.mjs, regenerate src/style-surface.js, and give it a profile key if needed.`,
  });
}

for (const name of ['vitest', 'jest']) {
  const version = await latest(name);
  lines.push(`- ${name} latest: ${version} (newest tested major: ${TESTED_MAJOR[name]})`);
  if (major(version) > TESTED_MAJOR[name]) {
    findings.push({
      title: `Upstream: ${name} ${major(version)} is newer than the newest tested ${name} major (${TESTED_MAJOR[name]})`,
      body: `${name} ${version} is on npm; warpdom's ${name === 'vitest' ? 'Vitest environment and fast mode' : 'Jest environment'} are tested up to ${name} ${TESTED_MAJOR[name]}.\n\nTo do: run npm test${name === 'vitest' ? ' with it installed (the upstream-watch workflow does this and reports the result in its run)' : ''}, run the corpus on a project that uses it, then raise TESTED_MAJOR in scripts/upstream-watch.mjs${name === 'vitest' ? ' and the vitest devDependency' : ''}.`,
    });
  }
}

lines.push('', findings.length ? `## Findings (${findings.length})` : 'No findings.');
for (const f of findings) lines.push(`- ${f.title}`);

if (args.includes('--issues') && findings.length) {
  const titles = new Set(JSON.parse(execFileSync('gh', ['issue', 'list', '--state', 'all', '--search', 'Upstream: in:title', '--limit', '200', '--json', 'title'], { encoding: 'utf8' })).map((i) => i.title));
  for (const f of findings) {
    if (titles.has(f.title)) { lines.push(`  (issue exists: ${f.title})`); continue; }
    const url = execFileSync('gh', ['issue', 'create', '--title', f.title, '--body', f.body], { encoding: 'utf8' }).trim();
    lines.push(`  opened ${url}`);
  }
}

const report = `${lines.join('\n')}\n`;
process.stdout.write(report);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, report);
