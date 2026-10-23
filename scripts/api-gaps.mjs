// Turns DOMParity's existence data (https://domparity.github.io/data/idl.json)
// into GitHub issues, for the weekly upstream watch:
// - parity gaps (labels parity, missing-api): every interface jsdom has that
//   warpdom lacks, and every member jsdom has that warpdom lacks on an
//   interface both have; one issue per interface;
// - beyond-jsdom candidates (label beyond-jsdom): interfaces and members of
//   the "Test DOM core" specs that neither jsdom nor warpdom has but
//   happy-dom does; one tracking issue with a checklist, rewritten in place
//   each run, keeping the boxes the maintainer ticked.
// What an existing API issue (open or closed, labeled parity, beyond-jsdom or
// missing-api) names in its title is skipped, so hand-written issues are not
// duplicated, and no title is opened twice. At most CAP parity issues open per
// run, the largest first; the rest are listed in the tracking issue and open
// on later runs. When the data date matches the one the tracking issue
// records and nothing is pending, the run does nothing.
//   node scripts/api-gaps.mjs [--gap-issues] [--data <idl.json>] [--groups <spec-groups.json>] [--force]
// Without --gap-issues, or without GH_TOKEN (so on a local machine), it is a
// dry run: it prints what it would open and the checklist. upstream-watch.mjs
// calls runGapIssues() with its own --gap-issues flag.
import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const SITE = 'https://domparity.github.io';
export const DATA_URL = `${SITE}/data/idl.json`;
export const GROUPS_URL = `${SITE}/data/spec-groups.json`;
export const CORE_GROUP = 'core';
export const TRACKING_TITLE = 'Beyond jsdom: core APIs other test DOMs have';
export const CAP = 15;
// Issues with these labels are about APIs; their titles count as coverage.
export const API_LABELS = new Set(['parity', 'beyond-jsdom', 'missing-api']);

const KIND = {
  a: 'attribute',
  o: 'operation',
  c: 'constant',
  sa: 'static attribute',
  so: 'static operation',
  i: 'iterable, maplike or setlike member',
};
const HAS = new Set(['P', 'N']); // interface codes that count as "has"
const PRESENT = new Set(['P', 'N', 'S']); // stubs count as present (not missing)

export const interfaceUrl = (name) => `${SITE}/coverage/interface/${name}`;
export const memberUrl = (iface, member) => `${interfaceUrl(iface)}#m-${member.replace(/[^A-Za-z0-9_-]/g, '_')}`;
export const parityTitle = (gap) =>
  gap.missing
    ? `Parity: ${gap.name} is missing (jsdom has it)`
    : `Parity: ${gap.name} (${gap.count} members jsdom has)`;

function engineIndex(idl) {
  const index = {};
  idl.engines.forEach((e, i) => {
    index[e.engine] = i;
  });
  for (const name of ['warpdom', 'jsdom', 'happy-dom', 'linkedom']) {
    if (index[name] === undefined) throw new Error(`DOMParity data: no ${name} engine`);
  }
  return index;
}

// Interface name -> its defining entry (the one with kind and status);
// partial interfaces in other specs carry only members.
function definitions(idl) {
  const defs = {};
  for (const [spec, s] of Object.entries(idl.specs)) {
    for (const [name, iface] of Object.entries(s.interfaces)) if (iface.status) defs[name] = { spec, ...iface };
  }
  return defs;
}

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const lcfirst = (s) => s[0].toLowerCase() + s.slice(1);

// What existing API issue titles already cover:
// - an interface named as a word that is not part of a dotted path
//   ("Blob and File", "HTMLDialogElement show/..."), or as window.<name>
//   ("window.crypto" covers Crypto);
// - a member named as a word, when the title also names its interface (any
//   case: "element.animate") or the member name is camelCase (distinctive
//   enough alone: "matchMedia", "getAnimations");
// - a spec whose title has two or more words ("Web Animations").
export function coverage(titles) {
  const any = (re) => titles.some((t) => re.test(t));
  const cache = new Map();
  const memo = (key, fn) => {
    if (!cache.has(key)) cache.set(key, fn());
    return cache.get(key);
  };
  return {
    iface: (name) =>
      memo(
        `i:${name}`,
        () =>
          any(new RegExp(`(^|[^\\w.])${escape(name)}(?![\\w.])`)) ||
          any(new RegExp(`\\bwindow\\.${escape(lcfirst(name))}(?!\\w)`)),
      ),
    member: (iface, member) =>
      memo(`m:${iface}.${member}`, () =>
        titles.some(
          (t) =>
            new RegExp(`(^|[^\\w])${escape(member)}(?!\\w)`).test(t) &&
            (/[A-Z]/.test(member) || new RegExp(`(^|[^\\w])${escape(iface)}(?!\\w)`, 'i').test(t)),
        ),
      ),
    spec: (title) => memo(`s:${title}`, () => /\s/.test(title.trim()) && titles.some((t) => t.includes(title))),
  };
}

// Parity gaps, one per interface, sorted by member count (largest first).
// Each: { name, missing, count, inherits, specs: [{ spec, title, url, members: [[name, kind]] }] }.
export function parityGaps(idl, titles = []) {
  const e = engineIndex(idl);
  const defs = definitions(idl);
  const covered = coverage(titles);
  const gaps = new Map();
  for (const [spec, s] of Object.entries(idl.specs)) {
    for (const [name, entry] of Object.entries(s.interfaces)) {
      const def = defs[name];
      if (!def || covered.iface(name)) continue;
      const j = def.status[e.jsdom];
      const w = def.status[e.warpdom];
      let missing;
      let members;
      if (HAS.has(j) && w === '-') {
        missing = true;
        members = (entry.members ?? []).filter((m) => m[2][e.jsdom] === '1');
        if (!members.length && spec !== def.spec) continue;
      } else if (PRESENT.has(j) && PRESENT.has(w)) {
        missing = false;
        members = (entry.members ?? []).filter(
          (m) => m[2][e.jsdom] === '1' && m[2][e.warpdom] === '0' && !covered.member(name, m[0]),
        );
        if (!members.length) continue;
      } else continue;
      if (!gaps.has(name))
        gaps.set(name, { name, missing, count: 0, inherits: def.inherits ?? null, kind: def.kind, specs: [] });
      const gap = gaps.get(name);
      gap.count += members.length;
      gap.specs.push({
        spec,
        title: s.title,
        url: s.url,
        defining: spec === def.spec,
        members: members.map(([m, k]) => [m, k]),
      });
    }
  }
  for (const gap of gaps.values()) gap.specs.sort((a, b) => b.defining - a.defining || a.spec.localeCompare(b.spec));
  return [...gaps.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

// Beyond-jsdom candidates in the core group, per spec: interfaces neither
// jsdom nor warpdom has that happy-dom has, and members neither has (on an
// interface not in that case) that happy-dom has.
// Each spec: { spec, title, url, items: [{ key, name, interface: bool, count, happy, linkedom, members? }] }.
export function beyondCandidates(idl, groups, titles = []) {
  const e = engineIndex(idl);
  const defs = definitions(idl);
  const covered = coverage(titles);
  const core = new Set(groups.groups.find((g) => g.id === CORE_GROUP)?.specs ?? []);
  const out = [];
  for (const [spec, s] of Object.entries(idl.specs)) {
    if (!core.has(spec) || covered.spec(s.title)) continue;
    const items = [];
    for (const [name, entry] of Object.entries(s.interfaces)) {
      const def = defs[name];
      if (!def || covered.iface(name)) continue;
      const st = (engine) => def.status[e[engine]];
      const all = entry.members ?? [];
      if (st('jsdom') === '-' && st('warpdom') === '-' && HAS.has(st('happy-dom'))) {
        items.push({
          key: `${spec}/${name}`,
          name,
          interface: true,
          count: all.length,
          happy: all.filter((m) => m[2][e['happy-dom']] === '1').length,
          linkedom: HAS.has(st('linkedom')),
        });
        continue;
      }
      const members = all.filter(
        (m) =>
          m[2][e.jsdom] === '0' &&
          m[2][e.warpdom] === '0' &&
          m[2][e['happy-dom']] === '1' &&
          !covered.member(name, m[0]),
      );
      if (!members.length) continue;
      items.push({
        key: `${spec}/${name}`,
        name,
        interface: false,
        count: members.length,
        linkedom: members.filter((m) => m[2][e.linkedom] === '1').length,
        members: members.map(([m, k]) => [m, k]),
      });
    }
    if (items.length)
      out.push({ spec, title: s.title, url: s.url, items: items.sort((a, b) => a.name.localeCompare(b.name)) });
  }
  return out.sort((a, b) => a.title.localeCompare(b.title));
}

const versions = (idl) => idl.engines.map((x) => `${x.engine} ${x.version}`).join(', ');
const dataLine = (idl) =>
  `Data: DOMParity [idl.json](${DATA_URL}) of ${idl.date} (@webref/idl ${idl.webref?.version ?? '?'}); engines: ${versions(idl)}. ${idl.note ?? ''}`.trim();
const member = (iface, [name, kind]) => `- [\`${name}\`](${memberUrl(iface, name)}) (${KIND[kind] ?? kind})`;

export function parityBody(gap, idl) {
  const lines = [
    gap.missing
      ? `DOMParity finds \`${gap.name}\`${gap.inherits ? ` (inherits \`${gap.inherits}\`)` : ''} in jsdom ${idl.engines.find((x) => x.engine === 'jsdom').version} but not in warpdom, so tests that use it pass on jsdom and fail on warpdom.`
      : `DOMParity finds ${gap.count} member${gap.count === 1 ? '' : 's'} of \`${gap.name}\` that jsdom ${idl.engines.find((x) => x.engine === 'jsdom').version} has and warpdom lacks, so tests that use them pass on jsdom and fail on warpdom.`,
    '',
    `DOMParity interface page: ${interfaceUrl(gap.name)}`,
    '',
  ];
  for (const s of gap.specs) {
    lines.push(`**[${s.title}](${s.url})** (\`${s.spec}\`)${gap.missing && s.defining ? ', members jsdom has:' : ':'}`);
    if (s.members.length) for (const m of s.members) lines.push(member(gap.name, m));
    else lines.push('- (no members of its own)');
    lines.push('');
  }
  lines.push(
    dataLine(idl),
    '',
    'To do: implement from the spec (black box against jsdom for behavior), with tests; close when DOMParity shows it present.',
    '',
    'Opened by scripts/api-gaps.mjs (weekly upstream watch).',
  );
  return `${lines.join('\n')}\n`;
}

// Checklist keys ticked in an earlier body of the tracking issue.
export function tickedKeys(body) {
  const keys = new Set();
  for (const m of (body ?? '').matchAll(/^\s*- \[[xX]\] .*<!-- key:(\S+) -->/gm)) keys.add(m[1]);
  return keys;
}

// The data date and pending count an earlier tracking body recorded.
export function trackingState(body) {
  const m = /<!-- api-gaps date:(\S+) pending:(\d+) -->/.exec(body ?? '');
  return m ? { date: m[1], pending: Number(m[2]) } : null;
}

// GitHub refuses issue bodies over 65536 characters; past MAX_BODY the
// checklist drops its per-item links.
const MAX_BODY = 60000;

export function trackingBody(options) {
  const body = renderTracking(options, true);
  return body.length > MAX_BODY ? renderTracking(options, false) : body;
}

function renderTracking({ idl, beyond, pending = [], previousBody = '' }, links) {
  const ticked = tickedKeys(previousBody);
  const items = beyond.reduce((n, s) => n + s.items.length, 0);
  const lines = [
    `<!-- api-gaps date:${idl.date} pending:${pending.length} -->`,
    `Web APIs in DOMParity's "Test DOM core" specs that neither jsdom nor warpdom has but happy-dom does: a sign that test authors want them. They belong behind warpdom's opt-in (#5), so default results stay jsdom's. Tick an item when it is triaged or done; the ticks survive the weekly rewrite. What another issue already names (#6-#12) is left out.`,
    '',
    `${items} item${items === 1 ? '' : 's'} in ${beyond.length} spec${beyond.length === 1 ? '' : 's'}. Coverage pages: ${SITE}/coverage#group=${CORE_GROUP}`,
    '',
  ];
  for (const s of beyond) {
    lines.push(`### [${s.title}](${s.url}) (\`${s.spec}\`)`);
    for (const it of s.items) {
      const box = ticked.has(it.key) ? 'x' : ' ';
      const what = it.interface
        ? `interface, ${it.count} member${it.count === 1 ? '' : 's'} (happy-dom: has it, ${it.happy}/${it.count} members; linkedom: ${it.linkedom ? 'has it' : 'no'})`
        : `${it.count} member${it.count === 1 ? '' : 's'}: ${it.members.map(([m]) => `\`${m}\``).join(', ')} (happy-dom: ${it.count}/${it.count}; linkedom: ${it.linkedom}/${it.count})`;
      lines.push(
        `- [${box}] ${links ? `[\`${it.name}\`](${interfaceUrl(it.name)})` : `\`${it.name}\``}: ${what} <!-- key:${it.key} -->`,
      );
    }
    lines.push('');
  }
  if (pending.length) {
    lines.push(`### Parity issues not opened yet (at most ${CAP} per run; the next runs open them)`);
    for (const g of pending) lines.push(`- ${parityTitle(g)}`);
    lines.push('');
  }
  lines.push(dataLine(idl), '', 'Rewritten by scripts/api-gaps.mjs (weekly upstream watch).');
  return `${lines.join('\n')}\n`;
}

// What a run does, from the data and the existing issues ([{number, title, labels}];
// tracking: the tracking issue's {number, body} or null). Pure.
export function plan({ idl, groups, issues, tracking = null, cap = CAP, force = false }) {
  const state = trackingState(tracking?.body);
  if (!force && state && state.date === idl.date && state.pending === 0) {
    return { skip: `DOMParity data unchanged since the last run (${idl.date}); nothing to do.` };
  }
  // Only API issues name interfaces ("Element Plus" is a library).
  const api = issues
    .filter((i) => (i.labels ?? []).some((l) => API_LABELS.has(l.name ?? l)) && i.title !== TRACKING_TITLE)
    .map((i) => i.title);
  const gaps = parityGaps(idl, api);
  const create = gaps
    .slice(0, cap)
    .map((g) => ({ title: parityTitle(g), body: parityBody(g, idl), labels: ['parity', 'missing-api'], gap: g }));
  const pending = gaps.slice(cap);
  // A parity issue covers the members jsdom has, not the rest of its interface.
  const beyond = beyondCandidates(
    idl,
    groups,
    api.filter((t) => !t.startsWith('Parity: ')),
  );
  return {
    create,
    pending,
    beyond,
    tracking: {
      number: tracking?.number ?? null,
      title: TRACKING_TITLE,
      labels: ['beyond-jsdom'],
      body: trackingBody({ idl, beyond, pending, previousBody: tracking?.body }),
    },
  };
}

function gh(args, input) {
  return execFileSync('gh', args, {
    encoding: 'utf8',
    input,
    stdio: [input === undefined ? 'ignore' : 'pipe', 'pipe', 'inherit'],
  }).trim();
}

async function load(source) {
  if (!/^https?:/.test(source)) return JSON.parse(readFileSync(source, 'utf8'));
  const response = await fetch(source);
  if (!response.ok) throw new Error(`${source}: HTTP ${response.status}`);
  return response.json();
}

// Runs the pass and returns Markdown report lines. apply: create and edit
// issues through gh (otherwise a dry run that reads issues if gh can).
export async function runGapIssues({ apply = false, data = DATA_URL, groupsSource = GROUPS_URL, force = false } = {}) {
  const lines = ['', `## DOMParity API gaps (${apply ? 'applying' : 'dry run'})`, ''];
  const [idl, groups] = await Promise.all([load(data), load(groupsSource)]);
  let issues = [];
  try {
    issues = JSON.parse(gh(['issue', 'list', '--state', 'all', '--limit', '1000', '--json', 'number,title,labels']));
  } catch (error) {
    if (apply) throw error;
    lines.push(`(could not list issues with gh, so nothing counts as covered: ${error.message.split('\n')[0]})`, '');
  }
  const found = issues.find((i) => i.title === TRACKING_TITLE);
  const tracking = found
    ? { number: found.number, body: JSON.parse(gh(['issue', 'view', String(found.number), '--json', 'body'])).body }
    : null;
  const p = plan({ idl, groups, issues, tracking, force });
  lines.push(`- DOMParity data: ${idl.date} (${versions(idl)})`);
  if (p.skip) {
    lines.push(`- ${p.skip}`);
    return lines;
  }
  const existing = new Set(issues.map((i) => i.title));
  lines.push(
    `- parity gaps not covered by an issue: ${p.create.length + p.pending.length} (opening ${p.create.length}, cap ${CAP}${p.pending.length ? `, ${p.pending.length} left for later runs` : ''})`,
  );
  for (const c of p.create) {
    if (existing.has(c.title)) {
      lines.push(`  - (issue exists: ${c.title})`);
      continue;
    }
    if (apply) {
      const url = gh(
        ['issue', 'create', '--title', c.title, '--body-file', '-', ...c.labels.flatMap((l) => ['--label', l])],
        c.body,
      );
      lines.push(`  - opened ${url}: ${c.title}`);
    } else {
      lines.push(`  - would open: ${c.title} [${c.labels.join(', ')}]`);
      for (const s of c.gap.specs)
        lines.push(
          `    - ${s.spec}: ${s.members.length ? s.members.map(([m, k]) => `${m} (${k})`).join(', ') : '(no members)'}`,
        );
    }
  }
  for (const g of p.pending) lines.push(`  - later: ${parityTitle(g)}`);
  const items = p.beyond.reduce((n, s) => n + s.items.length, 0);
  const t = p.tracking;
  if (apply) {
    if (t.number) {
      gh(['issue', 'edit', String(t.number), '--body-file', '-'], t.body);
      lines.push(`- updated #${t.number} (${TRACKING_TITLE}): ${items} items`);
    } else {
      const url = gh(
        ['issue', 'create', '--title', t.title, '--body-file', '-', ...t.labels.flatMap((l) => ['--label', l])],
        t.body,
      );
      lines.push(`- opened ${url} (${TRACKING_TITLE}): ${items} items`);
    }
  } else {
    lines.push(
      `- would ${t.number ? `rewrite #${t.number}` : 'open'} "${TRACKING_TITLE}" [${t.labels.join(', ')}], ${items} items:`,
      '',
      '<details><summary>Checklist body</summary>',
      '',
      t.body,
      '</details>',
    );
  }
  return lines;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const option = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
  const apply = args.includes('--gap-issues') && Boolean(process.env.GH_TOKEN);
  const lines = await runGapIssues({
    apply,
    data: option('--data'),
    groupsSource: option('--groups'),
    force: args.includes('--force'),
  });
  const report = `${lines.join('\n')}\n`;
  process.stdout.write(report);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, report);
}
