// The plan of `warpdom migrate`, for the terminal and as Markdown
// (.warpdom-migrate/plan.md).

const COMPARE = 'Before applying, run `npx warpdom compare` to see every test\'s result on warpdom next to jsdom (or happy-dom): it needs jsdom still installed, so run it before the migration removes it.';

function header(r) {
  const lines = [];
  const pm = r.packageManager;
  if (pm) lines.push(`Package manager: ${pm.name}${pm.version ? ` ${pm.version}` : ''} (${pm.source})`);
  if (r.runners.length) lines.push(`Test runner: ${r.runners.map((x) => `${x.name === 'vitest' ? 'Vitest' : 'Jest'} ${x.version ?? ''}${x.how === 'declared' ? ' (declared)' : x.how === 'inferred' ? ` (${x.note})` : ''}`.replace(/  +/, ' ')).join(', ')}`);
  if (r.monorepo) lines.push(`Monorepo: ${r.monorepo.tool}, ${r.monorepo.packages.length} package(s)`);
  return lines;
}

const CATEGORY = {
  setup: 'setup files and polyfills', config: 'configs', console: 'console filters', import: 'direct uses',
  code: 'source', test: 'tests', ci: 'CI and tool configs', docs: 'docs',
};

const loc = (x) => (x.line ? `${x.file}:${x.line}` : x.file);
const depLine = (d) => [
  ...d.remove.map((x) => `- ${x.name} ${x.spec}`),
  ...d.add.map((x) => `+ ${x.name} ${x.spec}`),
].join(', ');

export function renderConsole(r, { mentionsLimit = 15 } = {}) {
  const out = [];
  const dry = r.mode === 'dry-run';
  out.push(`warpdom migrate${dry ? ' (dry run: nothing was changed)' : ''}`);
  if (r.error) {
    out.push('', `error: ${r.error}`);
    return `${out.join('\n')}\n`;
  }
  out.push(...header(r));
  for (const w of r.warnings) out.push(`warning: ${w}`);
  for (const n of r.notes ?? []) out.push(`note: ${n}`);
  const nothing = !r.edits.length && !r.dependencies.length && !r.catalog.length;
  if (nothing) out.push('', r.manual.length ? 'No change migrate can make by itself.' : 'Nothing to change: no test environment here uses jsdom or happy-dom.');
  if (r.edits.length) {
    out.push('', `${dry ? 'Would change' : 'Changed'} the test environment (${r.edits.length}):`);
    for (const e of r.edits) out.push(e.from === null ? `  ${loc(e)}  added ${e.after}` : `  ${loc(e)}  ${e.kind}: ${e.from} -> ${e.to}`);
  }
  if (r.dependencies.length || r.catalog.length) {
    out.push('', `${dry ? 'Would change' : 'Changed'} dependencies:`);
    for (const d of r.dependencies) out.push(`  ${d.package} ${d.section}: ${depLine(d)}`);
    for (const c of r.catalog) out.push(`  ${c.file} catalog ${c.catalog}: ${[...c.remove.map((n) => `- ${n}`), ...c.add.map((a) => `+ ${a.name} ${a.spec}`)].join(', ')}`);
  }
  if (r.kept.length) {
    out.push('', 'Kept:');
    for (const k of r.kept) out.push(`  ${k.package}: ${k.name} (${k.reason})`);
  }
  if (r.manual.length) {
    out.push('', `Manual (${r.manual.length}): migrate does not change these; please check them`);
    for (const m of r.manual) out.push(`  ${loc(m)}  ${m.reason}`);
  }
  if (r.otherProjects.length) {
    out.push('', 'Other projects in this directory (not workspace packages; run migrate in each):');
    for (const o of r.otherProjects) out.push(`  ${o.dir}: ${o.uses.length} use(s), e.g. ${o.uses[0]}`);
  }
  if (r.mentions.length) {
    const files = new Set(r.mentions.map((m) => m.file)).size;
    const counts = {};
    for (const m of r.mentions) counts[m.category] = (counts[m.category] ?? 0) + 1;
    out.push('', `To review (${r.mentions.length} line(s) in ${files} file(s) mention jsdom or happy-dom; not changed):`);
    out.push(`  ${Object.entries(counts).map(([c, n]) => `${CATEGORY[c] ?? c} ${n}`).join(', ')}`);
    for (const m of r.mentions.slice(0, mentionsLimit)) out.push(`  ${loc(m)}  ${m.hint}`);
    if (r.mentions.length > mentionsLimit) out.push(`  ... and ${r.mentions.length - mentionsLimit} more in the plan`);
  }
  if (r.transitive.length) {
    out.push('', 'Installed through other packages:');
    for (const t of r.transitive) out.push(`  ${t}`);
  }
  if (r.profile.length) {
    out.push('', 'jsdom version:');
    for (const p of r.profile) out.push(`  ${p}`);
  }
  const ages = r.releaseAge.filter((a) => a.status !== 'ok' && a.status !== 'excluded');
  if (ages.length) {
    out.push('', 'Release age:');
    for (const a of ages) out.push(`  ${a.message}`);
  }
  out.push('', 'Next:');
  if (dry && !nothing) out.push(`  1. ${COMPARE}`, '  2. npx warpdom migrate', `  3. ${r.install ?? 'install'}, then run your tests`);
  else if (!dry && !nothing) out.push(`  ${r.install ?? 'install'}, then run your tests, and review the diff (git diff)`);
  else out.push(r.manual.length ? '  do the manual items above, then run migrate again' : '  nothing to do');
  out.push('', `Plan: ${r.planFileShown ?? r.planFile}`);
  return `${out.join('\n')}\n`;
}

export function renderMarkdown(r) {
  const out = [];
  const dry = r.mode === 'dry-run';
  out.push('# warpdom migrate', '');
  out.push(dry ? 'Dry run: nothing was changed. Run `npx warpdom migrate` (without --dry-run) to make these changes.' : 'Applied: the changes below were made.', '');
  if (r.error) {
    out.push(`Error: ${r.error}`, '');
    return `${out.join('\n')}\n`;
  }
  for (const l of header(r)) out.push(`- ${l}`);
  out.push('');
  if (r.warnings.length || r.notes?.length) {
    out.push('## Warnings', '');
    for (const w of r.warnings) out.push(`- ${w}`);
    for (const n of r.notes ?? []) out.push(`- note: ${n}`);
    out.push('');
  }
  out.push('## Before you apply', '', COMPARE, '');
  out.push('## Test environment', '');
  if (!r.edits.length) out.push('No change.', '');
  else {
    out.push('| Where | What | Before | After |', '|---|---|---|---|');
    for (const e of r.edits) out.push(`| ${loc(e)} | ${e.kind} | \`${e.before.replace(/\|/g, '\\|')}\` | \`${e.after.replace(/\|/g, '\\|')}\` |`);
    out.push('');
  }
  out.push('## Dependencies', '');
  if (!r.dependencies.length && !r.catalog.length) out.push('No change.', '');
  for (const d of r.dependencies) {
    out.push(`- \`${d.package}\` ${d.section}:`);
    for (const x of d.remove) out.push(`  - remove \`${x.name}\` ${x.spec}`);
    for (const x of d.add) out.push(`  - add \`${x.name}\` ${x.spec}`);
  }
  for (const c of r.catalog) {
    out.push(`- \`${c.file}\` catalog \`${c.catalog}\`:`);
    for (const n of c.remove) out.push(`  - remove \`${n}\``);
    for (const a of c.add) out.push(`  - add \`${a.name}\` ${a.spec}`);
  }
  if (r.dependencies.length || r.catalog.length) out.push('');
  if (r.install) out.push(`Install with \`${r.install}\` after applying (migrate does not run it).`, '');
  if (r.kept.length) {
    out.push('### Kept', '');
    for (const k of r.kept) out.push(`- \`${k.package}\`: \`${k.name}\` (${k.section}): ${k.reason}`);
    out.push('');
  }
  if (r.transitive.length) {
    out.push('### Installed through other packages', '');
    for (const t of r.transitive) out.push(`- ${t}`);
    out.push('');
  }
  if (r.profile.length) {
    out.push('### jsdom version', '');
    for (const p of r.profile) out.push(`- ${p}`);
    out.push('');
  }
  if (r.releaseAge.length) {
    out.push('### Release age', '');
    for (const a of r.releaseAge) out.push(`- ${a.message}`);
    out.push('');
  }
  out.push('## Manual', '');
  if (!r.manual.length) out.push('Nothing.', '');
  else {
    out.push('migrate does not change these: the environment is computed, inherited or written in a way it cannot edit exactly.', '');
    for (const m of r.manual) out.push(`- ${loc(m)}: ${m.reason}`);
    out.push('');
  }
  if (r.otherProjects.length) {
    out.push('## Other projects', '', 'These directories have their own package.json and are not workspace packages; run migrate in each.', '');
    for (const o of r.otherProjects) out.push(`- \`${o.dir}\`: ${o.uses.join(', ')}`);
    out.push('');
  }
  if (r.skippedFixtures.length) {
    out.push('## Skipped (fixtures)', '');
    for (const s of r.skippedFixtures) out.push(`- ${s}`);
    out.push('');
  }
  out.push('## To review', '');
  if (!r.mentions.length) out.push('No other line mentions jsdom or happy-dom.', '');
  else {
    out.push('Lines that mention jsdom or happy-dom, not changed: workarounds, polyfills and filters written for jsdom may be unneeded on warpdom, or still needed.', '');
    let file = null;
    let category = null;
    let shown = 0;
    for (const m of r.mentions) {
      if (shown >= 1000) { out.push(`- ... and ${r.mentions.length - shown} more`); break; }
      if (m.category !== category) {
        category = m.category;
        file = null;
        out.push('', `### ${(CATEGORY[category] ?? category).replace(/^./, (c) => c.toUpperCase())}`, '');
      }
      if (m.file !== file) { out.push(`- \`${m.file}\``); file = m.file; }
      out.push(`  - ${m.line}: ${m.hint}: \`${m.text.replace(/`/g, "'")}\``);
      shown++;
    }
    out.push('');
  }
  return `${out.join('\n')}\n`;
}
