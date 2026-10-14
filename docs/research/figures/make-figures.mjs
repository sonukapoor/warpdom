#!/usr/bin/env node
// Generates the paper's figures as SVG from the research record's data.
// Plain Node (>= 18), no dependencies. Run from anywhere:
//   node docs/research/figures/make-figures.mjs
// Every value is read from docs/research/data/; nothing is typed in by hand
// except labels. Figures are grayscale with patterns, so they print in
// black and white.

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const data = join(here, '..', 'data');
const read = (p) => readFileSync(join(data, p), 'utf8');

// ---------------------------------------------------------------- parsing

/** Rows of the first Markdown table whose header row starts with `header`. */
function table(md, header, after = 0) {
  const lines = md.split('\n');
  let i = lines.findIndex((l, n) => n >= after && l.startsWith(header));
  if (i < 0) throw new Error(`table not found: ${header}`);
  const rows = [];
  for (i += 2; i < lines.length && lines[i].startsWith('|'); i++) {
    rows.push(lines[i].split('|').slice(1, -1).map((c) => c.trim()));
  }
  return rows;
}
const num = (s) => Number(String(s).replace(/[^0-9.\-]/g, ''));

// ---------------------------------------------------------------- SVG helpers

const FONT = 'font-family="Helvetica, Arial, sans-serif"';
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');

function svgDoc(w, h, body, title) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" ${FONT} font-size="12">
<title>${esc(title)}</title>
<defs>
  <pattern id="diag" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
    <rect width="6" height="6" fill="#fff"/><line x1="0" y1="0" x2="0" y2="6" stroke="#000" stroke-width="1.6"/>
  </pattern>
  <pattern id="rdiag" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)">
    <rect width="6" height="6" fill="#fff"/><line x1="0" y1="0" x2="0" y2="6" stroke="#000" stroke-width="1"/>
  </pattern>
  <pattern id="dots" width="5" height="5" patternUnits="userSpaceOnUse">
    <rect width="5" height="5" fill="#fff"/><circle cx="2.5" cy="2.5" r="1.1" fill="#000"/>
  </pattern>
  <pattern id="cross" width="6" height="6" patternUnits="userSpaceOnUse">
    <rect width="6" height="6" fill="#fff"/><path d="M0 3H6M3 0V6" stroke="#000" stroke-width="0.8"/>
  </pattern>
  <pattern id="horiz" width="5" height="5" patternUnits="userSpaceOnUse">
    <rect width="5" height="5" fill="#fff"/><line x1="0" y1="2.5" x2="5" y2="2.5" stroke="#000" stroke-width="1"/>
  </pattern>
</defs>
<rect width="${w}" height="${h}" fill="#fff"/>
${body}
</svg>
`;
}
const text = (x, y, s, attrs = '') => `<text x="${x}" y="${y}" ${attrs}>${esc(s)}</text>`;
const rect = (x, y, w, h, fill, extra = '') =>
  `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${Math.max(0, w).toFixed(1)}" height="${h.toFixed(1)}" fill="${fill}" ${/stroke=/.test(extra) ? '' : 'stroke="#000" '}stroke-width="0.7" ${extra}/>`;
const line = (x1, y1, x2, y2, extra = 'stroke="#000"') =>
  `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" ${extra}/>`;

function legend(x, y, items) {
  let out = '';
  let cx = x;
  for (const [label, fill] of items) {
    out += rect(cx, y - 10, 14, 10, fill);
    out += text(cx + 19, y, label);
    cx += 34 + label.length * 6.8;
  }
  return out;
}

function write(name, svg) {
  writeFileSync(join(here, name), svg);
  console.log(`wrote ${name}`);
}

// ---------------------------------------------------------------- data

// Drop-in runs at the frozen commit warpdom 208ad49 (Figures 2 and 3):
// ci-2026-10-13-208ad49-threeway-tuning/run{1,2,3}-*/timing-ci.csv (three
// independent runs), -threeway-heldout/timing-ci.csv, -threeway-apps/timing-ci.csv.
// Columns: round,project,config,seconds,differs,files_differ,ref; "differs" is the
// count of tests whose status differs from the same round's jsdom-default run.
const DROPIN = 'ci-2026-10-13-208ad49';
const TUNING_RUNS = ['run1-38426985620', 'run2-38427009322', 'run3-38427031231'];
/** Per project: { wd: [ratios], hd: [ratios], wdDiff, hdDiff } from one timing CSV. */
function dropIn(csvPath) {
  const rounds = new Map();
  for (const l of read(csvPath).trim().split('\n').slice(1)) {
    const [round, project, config, secs, differs] = l.split(',');
    if (round === '0') continue; // warm-up
    const k = `${project}|${round}`;
    if (!rounds.has(k)) rounds.set(k, {});
    rounds.get(k)[config] = { secs: Number(secs), differs: Number(differs) };
  }
  const out = {};
  for (const [k, v] of rounds) {
    const project = k.split('|')[0];
    const o = (out[project] ??= { wd: [], hd: [], wdDiff: 0, hdDiff: null });
    const j = v['jsdom-default'];
    const w = v['warpdom-default'];
    const h = v['happy-dom-default'];
    if (!j || !Number.isFinite(j.secs)) continue;
    if (w && Number.isFinite(w.secs)) {
      o.wd.push(j.secs / w.secs);
      o.wdDiff = Math.max(o.wdDiff, w.differs);
    }
    if (h && Number.isFinite(h.secs)) {
      o.hd.push(j.secs / h.secs);
      o.hdDiff = Math.max(o.hdDiff ?? 0, h.differs);
    }
  }
  return out;
}
/** Median; the mean of the two middle values for an even count (timing-report.cjs). */
function median(a) {
  const s = [...a].sort((x, y) => x - y);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
const tuningRuns = TUNING_RUNS.map((r) => dropIn(`${DROPIN}-threeway-tuning/${r}/timing-ci.csv`));
const heldOut = dropIn(`${DROPIN}-threeway-heldout/timing-ci.csv`);
const apps = dropIn(`${DROPIN}-threeway-apps/timing-ci.csv`);
const LABEL = { 'wire-webapp': 'Wire web app', excalidraw: 'Excalidraw', 'material-ui': 'material-ui (MUI)' };
const label = (p) => LABEL[p] || p;

/** Rows for Figures 2 and 3: group headers and suites. */
function dropInRows() {
  const rows = [];
  const tuningNames = Object.keys(tuningRuns[0]);
  const tuning = tuningNames.map((p) => {
    const runs = tuningRuns.map((r) => r[p]);
    const wdAll = runs.flatMap((r) => r.wd);
    const hdAll = runs.flatMap((r) => r.hd);
    return {
      suite: p,
      wd: wdAll, hd: hdAll,
      wdMed: median(wdAll), hdMed: hdAll.length ? median(hdAll) : null,
      wdRunMeds: runs.map((r) => median(r.wd)),
      hdRunMeds: hdAll.length ? runs.map((r) => median(r.hd)) : [],
      wdDiff: Math.max(...runs.map((r) => r.wdDiff)),
      hdDiff: hdAll.length ? Math.max(...runs.map((r) => r.hdDiff ?? 0)) : null,
    };
  });
  const single = (src, p) => ({
    suite: p, wd: src[p].wd, hd: src[p].hd,
    wdMed: median(src[p].wd), hdMed: src[p].hd.length ? median(src[p].hd) : null,
    wdRunMeds: [], hdRunMeds: [], wdDiff: src[p].wdDiff, hdDiff: src[p].hdDiff,
  });
  rows.push({ header: 'Tuning suites (3 independent runs; 13 under the version rule)' });
  tuning.filter((r) => r.suite !== 'handsontable').sort((a, b) => b.wdMed - a.wdMed).forEach((r) => rows.push(r));
  const ht = tuning.find((r) => r.suite === 'handsontable');
  if (ht) rows.push({ ...ht, display: 'handsontable \u2020' });
  rows.push({ header: 'Held-out suites (1 run)' });
  Object.keys(heldOut).map((p) => single(heldOut, p)).sort((a, b) => b.wdMed - a.wdMed)
    .forEach((r) => rows.push(r.suite === 'solid-primitives' ? { ...r, display: 'solid-primitives *' } : r));
  rows.push({ header: 'Applications (1 run)' });
  Object.keys(apps).map((p) => single(apps, p)).sort((a, b) => b.wdMed - a.wdMed).forEach((r) => rows.push(r));
  return rows;
}
const dropRows = dropInRows();

/** Per-round ratios jsdom-default / target, per project, from a timing CSV (Figure S3). */
function roundRatios(csvPath, targetPrefix) {
  const byKey = new Map();
  for (const line of read(csvPath).trim().split('\n').slice(1)) {
    const [round, project, config, secs] = line.split(',');
    const k = `${project}|${round}`;
    if (!byKey.has(k)) byKey.set(k, {});
    const cfg = config === 'jsdom-default' ? 'jsdom' : config.startsWith(targetPrefix) ? 'target' : null;
    if (cfg) byKey.get(k)[cfg] = Number(secs);
  }
  const out = {};
  for (const [k, v] of byKey) {
    const project = k.split('|')[0];
    if (v.jsdom && v.target) (out[project] ??= []).push(v.jsdom / v.target);
  }
  return out;
}
const learnedRounds = roundRatios('timing/ci-2026-10-12-fastmode/timing-ci.csv', 'warpdom-learned');
const whisker = (x, lo, hi, yMid) =>
  line(x(lo), yMid, x(hi), yMid, 'stroke="#000" stroke-width="0.9"') +
  line(x(lo), yMid - 3, x(lo), yMid + 3, 'stroke="#000" stroke-width="0.9"') +
  line(x(hi), yMid - 3, x(hi), yMid + 3, 'stroke="#000" stroke-width="0.9"');

// First CI run of measured isolation (Figure S3; README 3.6; ci-2026-10-12-fastmode/report.md).
const fastMd = read('timing/ci-2026-10-12-fastmode/report.md');
const fast = table(fastMd, '| Suite | jsdom default | warpdom fast mode').map((r) => ({
  suite: r[0],
  jsdom: num(r[1]),
  fast: num(r[2]),
  mode: r[3],
  speed: num(r[4]),
  differ: num(r[5]),
}));

// WPT at the frozen commit (data/wpt/ci-2026-10-13-208ad49/summary.md, "Side by side"; run 38427179332, warpdom 208ad49).
const wptMd = read('wpt/ci-2026-10-13-208ad49/summary.md');
const wpt = table(wptMd, '| Directory | Files | Subtests | warpdom passed', wptMd.indexOf('## Side by side') > 0
  ? wptMd.split('\n').findIndex((l) => l.startsWith('## Side by side')) : 0).map((r) => ({
  area: r[0].replace(/\*/g, '').replace(/\/$/, ''),
  files: num(r[1]),
  wdScore: num(r[5]),
  jsScore: num(r[8]),
}));

// CPU profiles (README 3.4 and 3.5).
const CATS = ['dom', 'framework', 'testing-library', 'runner', 'node', 'transform', 'project', 'gc', 'other-deps', 'other'];
function profileJson(p) {
  const d = JSON.parse(read(p));
  const k = Object.keys(d)[0];
  return { cpu: d[k].cpuSeconds, idle: d[k].idleSeconds, share: d[k].categories };
}
function profileTxt(p) {
  const [head, row] = read(p).trim().split('\n');
  const cols = head.trim().split(/\s+/); // project cpu s dom framework testing-li runner ...
  const vals = row.trim().split(/\s+/);
  const names = ['dom', 'framework', 'testing-library', 'runner', 'transform', 'project', 'gc', 'node', 'other-deps', 'other'];
  if (cols.length !== 13) throw new Error('unexpected profile-share header');
  const share = {};
  names.forEach((n, i) => (share[n] = num(vals[i + 2]) / 100));
  return { cpu: num(vals[1]), idle: null, share };
}
const profiles = [
  { label: 'ariakit, jsdom', ...profileJson('profile/ariakit-jsdom-2026-10-12.profile-share.json') },
  { label: 'ariakit, warpdom', ...profileJson('profile/ariakit-warpdom-2026-10-12.profile-share.json') },
  { label: 'MUI, warpdom', ...profileTxt('profile/mui-warpdom-2026-10-11.profile-share.txt') },
];

// Surveys (README 3.1, "Earlier" column; data/surveys/*.log), in order.
const SURVEYS = [
  ['survey.log', 'S1 10-09'],
  ['survey2.log', 'S2 10-09'],
  ['survey-jest.log', 'S3 10-10'],
  ['survey-ht.log', 'S4 10-10'],
  ['survey3.log', 'S5 10-11'],
  ['survey4.log', 'S6 10-11'],
  ['survey5.log', 'S7 10-11'],
  ['survey6.log', 'S8 10-11'],
  ['survey7.log', 'S9 10-11'],
  ['survey8.log', 'S10 10-11'],
];
const surveys = SURVEYS.map(([file, label]) => {
  const byProject = {};
  for (const l of read(`surveys/${file}`).split('\n')) {
    const m = /^SURVEY (\S+)\s+jsdom passed \d+ \| warpdom passed \d+ \| differ (\d+)/.exec(l);
    if (m) byProject[m[1]] = Number(m[2]);
  }
  return { file, label, byProject };
});

// ---------------------------------------------------------------- figure 2: drop-in speedups at 208ad49

{
  const W = 760, left = 175, right = 70, top = 52, rowH = 30, headH = 26, barH = 10;
  const bodyH = dropRows.reduce((h, r) => h + (r.header ? headH : rowH), 0);
  const H = top + bodyH + 70;
  const lo = 0.4, hi = 15;
  const x = (v) => left + ((Math.log10(v) - Math.log10(lo)) / (Math.log10(hi) - Math.log10(lo))) * (W - left - right);
  let b = legend(left, 30, [['warpdom vs jsdom', '#333'], ['happy-dom vs jsdom', 'url(#diag)']]);
  b += `<path d="M${(left + 330).toFixed(1)} 21 l4 4 l-4 4 l-4 -4 z" fill="#fff" stroke="#000" stroke-width="0.9"/>`;
  b += text(left + 340, 30, 'median of one run (tuning)');
  const ticks = [0.5, 1, 1.5, 2, 3, 5, 10];
  for (const t of ticks) {
    b += line(x(t), top, x(t), top + bodyH, `stroke="${t === 1 ? '#000' : '#bbb'}" stroke-width="${t === 1 ? 1.2 : 0.6}"${t === 1 ? '' : ' stroke-dasharray="2,3"'}`);
    b += text(x(t), top + bodyH + 16, `${t}x`, 'text-anchor="middle"');
  }
  const diamond = (cx, cy) => `<path d="M${cx.toFixed(1)} ${(cy - 4).toFixed(1)} l4 4 l-4 4 l-4 -4 z" fill="#fff" stroke="#000" stroke-width="0.9"/>`;
  let y = top;
  for (const r of dropRows) {
    if (r.header) {
      b += `<rect x="0" y="${y + 3}" width="${W}" height="${headH - 6}" fill="#fff"/>`;
      b += text(8, y + 17, r.header, 'font-weight="bold"');
      y += headH;
      continue;
    }
    const yy = y + 4;
    b += text(left - 8, yy + barH + 4, r.display || label(r.suite), 'text-anchor="end"');
    const x1 = x(1);
    const bar = (med, all, runMeds, yb, fill) => {
      let o = rect(Math.min(x1, x(med)), yb, Math.abs(x(med) - x1), barH, fill);
      o += whisker(x, Math.min(...all), Math.max(...all), yb + barH / 2);
      for (const m of runMeds) o += diamond(x(m), yb + barH / 2);
      o += text(Math.max(x1, x(med), x(Math.max(...all))) + 6, yb + barH - 1, `${med.toFixed(2)}x`, 'font-size="10"');
      return o;
    };
    b += bar(r.wdMed, r.wd, r.wdRunMeds, yy, '#333');
    if (r.hdMed != null) b += bar(r.hdMed, r.hd, r.hdRunMeds, yy + barH + 1, 'url(#diag)');
    else b += text(x1 + 4, yy + 2 * barH, 'happy-dom: no time in any round', 'font-size="10" font-style="italic"');
    y += rowH;
  }
  b += text(8, H - 36, 'Speedup over jsdom in each runner\'s default isolation (log scale), warpdom 208ad49. Bars: median of per-round ratios (tuning: 15 rounds of', 'font-size="10"');
  b += text(8, H - 23, 'three runs pooled; diamonds: each run\'s median); whiskers: range of the per-round ratios. \u2020 core on jsdom 16.7, outside the medians.', 'font-size="10"');
  b += text(8, H - 10, '* every jsdom round flagged by the broken-round rule (21 tests reported or dropped on every DOM); raw rounds shown.', 'font-size="10"');
  write('fig2-speedup-three-way.svg', svgDoc(W, H, b, 'Drop-in speedup over jsdom per suite, warpdom and happy-dom'));
}

// ---------------------------------------------------------------- figure 3: changed results at 208ad49

{
  const rows = dropRows.filter((r) => r.header || r.suite !== 'solid-primitives');
  const W = 760, left = 175, right = 70, top = 46, rowH = 30, headH = 26, barH = 10;
  const bodyH = rows.reduce((h, r) => h + (r.header ? headH : rowH), 0);
  const H = top + bodyH + 58;
  const maxL = Math.log10(10000 + 1);
  const x = (v) => left + (Math.log10(v + 1) / maxL) * (W - left - right);
  let b = legend(left, 30, [['warpdom', '#333'], ['happy-dom', 'url(#diag)']]);
  for (const t of [0, 1, 10, 100, 1000, 10000]) {
    b += line(x(t), top, x(t), top + bodyH, `stroke="${t === 0 ? '#000' : '#bbb'}" stroke-width="0.6"${t === 0 ? '' : ' stroke-dasharray="2,3"'}`);
    b += text(x(t), top + bodyH + 16, t.toLocaleString('en-US'), 'text-anchor="middle"');
  }
  let y = top;
  for (const r of rows) {
    if (r.header) {
      b += `<rect x="0" y="${y + 3}" width="${W}" height="${headH - 6}" fill="#fff"/>`;
      b += text(8, y + 17, r.header, 'font-weight="bold"');
      y += headH;
      continue;
    }
    const yy = y + 4;
    b += text(left - 8, yy + barH + 4, r.display || label(r.suite), 'text-anchor="end"');
    b += rect(x(0), yy, x(r.wdDiff) - x(0), barH, '#333');
    b += text(x(r.wdDiff) + 4, yy + barH - 1, String(r.wdDiff), 'font-size="10"');
    if (r.hdDiff != null) {
      b += rect(x(0), yy + barH + 1, x(r.hdDiff) - x(0), barH, 'url(#diag)');
      b += text(x(r.hdDiff) + 4, yy + 2 * barH, r.hdDiff.toLocaleString('en-US'), 'font-size="10"');
    } else {
      b += text(x(0) + 4, yy + 2 * barH, 'happy-dom: no time in any round', 'font-size="10" font-style="italic"');
    }
    y += rowH;
  }
  b += text(8, H - 23, 'Tests whose status differs from the same round\'s jsdom run, either direction, most in any round (tuning: over the three runs);', 'font-size="10"');
  b += text(8, H - 10, 'log scale of count + 1; warpdom 208ad49. solid-primitives left out (21 tests reported or dropped on every DOM). \u2020 core on jsdom 16.7.', 'font-size="10"');
  write('fig3-differences.svg', svgDoc(W, H, b, 'Tests that change result, warpdom and happy-dom'));
}

// ---------------------------------------------------------------- figure 4: CPU by category

{
  const GROUPS = [
    ['DOM (incl. parse5)', ['dom'], '#000'],
    ['framework', ['framework'], 'url(#diag)'],
    ['Testing Library', ['testing-library'], 'url(#dots)'],
    ['runner', ['runner'], '#888'],
    ['Node internals', ['node'], 'url(#cross)'],
    ['transforms', ['transform'], 'url(#horiz)'],
    ['project code', ['project'], '#ccc'],
    ['GC, other deps, other', ['gc', 'other-deps', 'other'], '#fff'],
  ];
  const W = 720, left = 130, right = 30, top = 76, rowH = 46, barH = 26;
  const labelRoom = 150;
  const H = top + profiles.length * rowH + 60;
  const maxCpu = Math.max(...profiles.map((p) => p.cpu));
  const scale = (W - left - right - labelRoom) / maxCpu;
  // legend in two rows
  let b = legend(left, 30, GROUPS.slice(0, 4).map(([l, , f]) => [l, f]));
  b += legend(left, 50, GROUPS.slice(4).map(([l, , f]) => [l, f]));
  profiles.forEach((p, i) => {
    const y = top + i * rowH;
    b += text(left - 8, y + barH / 2 + 4, p.label, 'text-anchor="end"');
    let cx = left;
    for (const [label, cats, fill] of GROUPS) {
      const share = cats.reduce((s, c) => s + (p.share[c] || 0), 0);
      const w = share * p.cpu * scale;
      b += rect(cx, y, w, barH, fill);
      if (label.startsWith('DOM')) {
        b += text(cx + w + 2, y - 3, `DOM ${(share * 100).toFixed(1)}% = ${(share * p.cpu).toFixed(1)} s`, 'font-size="10"');
      }
      cx += w;
    }
    const idle = p.idle != null ? `; idle ${p.idle.toFixed(1)} s` : '';
    b += text(cx + 6, y + barH / 2 + 4, `${p.cpu.toFixed(1)} s${idle}`, 'font-size="10"');
  });
  b += text(left, H - 26, 'Sampled CPU seconds of test processes, idle excluded. ariakit 2026-10-12, MUI (four packages) 2026-10-11; laptop profiles.', 'font-size="10"');
  b += text(left, H - 12, 'Idle = summed time test processes spent waiting (timers, animation frames).', 'font-size="10"');
  write('fig4-cpu-share.svg', svgDoc(W, H, b, 'CPU time by category, jsdom and warpdom'));
}

// ---------------------------------------------------------------- figure S2 (supplement): WPT per area

{
  const rows = wpt.filter((r) => r.area !== 'Total');
  const total = wpt.find((r) => r.area === 'Total');
  const all = [...rows, total];
  const W = 720, left = 150, right = 60, top = 46, rowH = 30, barH = 10;
  const H = top + all.length * rowH + 44;
  const x = (v) => left + (v / 100) * (W - left - right);
  let b = legend(left, 30, [['warpdom', '#333'], ['jsdom 30.1.2', 'url(#diag)']]);
  for (const t of [0, 20, 40, 60, 80, 100]) {
    b += line(x(t), top, x(t), top + all.length * rowH, 'stroke="#bbb" stroke-width="0.6" stroke-dasharray="2,3"');
    b += text(x(t), top + all.length * rowH + 16, `${t}%`, 'text-anchor="middle"');
  }
  all.forEach((r, i) => {
    const y = top + i * rowH + 4;
    const label = r.area === 'Total' ? 'All 963 files' : `${r.area} (${r.files})`;
    b += text(left - 8, y + barH + 4, label, `text-anchor="end"${r.area === 'Total' ? ' font-weight="bold"' : ''}`);
    b += rect(x(0), y, x(r.wdScore) - x(0), barH, '#333');
    b += text(x(r.wdScore) + 4, y + barH - 1, `${r.wdScore.toFixed(1)}%`, 'font-size="10"');
    b += rect(x(0), y + barH + 1, x(r.jsScore) - x(0), barH, 'url(#diag)');
    b += text(x(r.jsScore) + 4, y + 2 * barH, `${r.jsScore.toFixed(1)}%`, 'font-size="10"');
  });
  b += text(left, H - 8, 'Scored against the union of subtest names both engines report. Run 38427179332, warpdom 208ad49, WPT 87b5d13099.', 'font-size="10"');
  write('figS2-wpt.svg', svgDoc(W, H, b, 'WPT score per area, warpdom and jsdom'));
}

// ---------------------------------------------------------------- figure S3 (supplement): measured isolation, first CI run (file name kept)

{
  const rows = [...fast].sort((a, b) => b.speed - a.speed);
  const W = 720, left = 150, right = 60, top = 46, rowH = 24, barH = 14;
  const H = top + rows.length * rowH + 50;
  const hi = 9;
  const x = (v) => left + (v / hi) * (W - left - right);
  let b = legend(left, 30, [['split (shared files + measured isolated ones)', '#333'], ['isolated kept (= drop-in)', 'url(#diag)']]);
  for (let t = 0; t <= hi; t++) {
    b += line(x(t), top, x(t), top + rows.length * rowH, `stroke="${t === 1 ? '#000' : '#bbb'}" stroke-width="${t === 1 ? 1.2 : 0.6}"${t === 1 ? '' : ' stroke-dasharray="2,3"'}`);
    b += text(x(t), top + rows.length * rowH + 16, `${t}x`, 'text-anchor="middle"');
  }
  rows.forEach((r, i) => {
    const y = top + i * rowH + (rowH - barH) / 2;
    b += text(left - 8, y + barH - 3, r.suite, 'text-anchor="end"');
    b += rect(x(0), y, x(r.speed) - x(0), barH, r.mode === 'split' ? '#333' : 'url(#diag)');
    const rr = learnedRounds[r.suite] || [r.speed];
    b += whisker(x, Math.min(...rr), Math.max(...rr), y + barH / 2);
    b += text(Math.max(x(r.speed), x(Math.max(...rr))) + 4, y + barH - 3, `${r.speed.toFixed(2)}x`, 'font-size="10"');
  });
  b += text(left, H - 10, 'Measured isolation (first CI run, harness implementation) over jsdom default: median of 3 per-round ratios in one job; whiskers: range.', 'font-size="10"');
  write('fig1-learned-isolation.svg', svgDoc(W, H, b, 'Measured isolation (first CI run, harness implementation): speedup over jsdom default'));
}

// ---------------------------------------------------------------- figure S1 (supplement): survey timeline

{
  const projects = [];
  for (const s of surveys) for (const p of Object.keys(s.byProject)) if (!projects.includes(p)) projects.push(p);
  const keep = projects.filter((p) => !['ag-grid', 'element-plus', 'kobalte', 'nuxt-ui'].includes(p));
  const W = 720, left = 150, top = 64, cellW = (W - left - 20) / surveys.length, cellH = 22;
  const H = top + keep.length * cellH + 54;
  const shade = (v) => {
    if (v === undefined) return null;
    if (v === 0) return '#fff';
    const t = Math.min(1, Math.log10(v + 1) / 4); // 10,000 -> black
    const g = Math.round(225 - t * 200);
    return `rgb(${g},${g},${g})`;
  };
  let b = '';
  surveys.forEach((s, j) => {
    b += text(left + j * cellW + cellW / 2, top - 22, s.label.split(' ')[0], 'text-anchor="middle" font-size="10"');
    b += text(left + j * cellW + cellW / 2, top - 8, s.label.split(' ')[1], 'text-anchor="middle" font-size="10"');
  });
  keep.forEach((p, i) => {
    const y = top + i * cellH;
    b += text(left - 8, y + cellH / 2 + 4, p + (p === 'svelte' || p === 'solid' ? ' *' : ''), 'text-anchor="end"');
    surveys.forEach((s, j) => {
      const v = s.byProject[p];
      const x0 = left + j * cellW;
      const f = shade(v);
      if (f == null) {
        b += rect(x0, y, cellW, cellH, '#fff', 'stroke-dasharray="1,2" stroke="#aaa"');
        return;
      }
      b += rect(x0, y, cellW, cellH, f);
      const dark = v > 0 && Math.log10(v + 1) / 4 > 0.55;
      b += text(x0 + cellW / 2, y + cellH / 2 + 4, v.toLocaleString('en-US'), `text-anchor="middle" font-size="10"${dark ? ' fill="#fff"' : ''}`);
    });
  });
  b += text(left, H - 30, 'Empty cells: project not in that survey. Shade: log of count + 1. Files: data/surveys/*.log.', 'font-size="10"');
  b += text(left, H - 16, '* svelte and solid kept most files on jsdom before 2026-10-12 (pinned environment comments): their rows are not valid.', 'font-size="10"');
  write('figS1-survey-timeline.svg', svgDoc(W, H, b, 'Differences per survey'));
}
