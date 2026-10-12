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

// Three-way GitHub Actions run (README 3.6; report-without-handsontable.md).
const threeWayMd = read('timing/ci-2026-10-12-three-way/report-without-handsontable.md');
const threeWay = table(threeWayMd, '| Suite | jsdom | warpdom | happy-dom').map((r) => {
  const [wdDiff, hdDiff] = r[7].split('/').map(num);
  return {
    suite: r[0],
    jsdom: num(r[1]),
    warpdom: num(r[2]),
    happy: num(r[3]),
    wdSpeed: num(r[4]),
    hdSpeed: num(r[5]),
    wdDiff,
    hdDiff,
  };
});

// Fast mode GitHub Actions run (README 3.6; ci-2026-10-12-fastmode/report.md).
const fastMd = read('timing/ci-2026-10-12-fastmode/report.md');
const fast = table(fastMd, '| Suite | jsdom default | warpdom fast mode').map((r) => ({
  suite: r[0],
  jsdom: num(r[1]),
  fast: num(r[2]),
  mode: r[3],
  speed: num(r[4]),
  differ: num(r[5]),
}));

// WPT, evening run (README 3.6; data/wpt/ci-2026-10-12-evening-summary.md, "Side by side").
const wptMd = read('wpt/ci-2026-10-12-evening-summary.md');
const wpt = table(wptMd, '| Directory | Files | Subtests | warpdom passed', wptMd.indexOf('## Side by side') > 0
  ? wptMd.split('\n').findIndex((l) => l.startsWith('## Side by side')) : 0).map((r) => ({
  area: r[0].replace(/\*/g, ''),
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
  ['survey.log', '10-09 a'],
  ['survey2.log', '10-09 b'],
  ['survey-jest.log', '10-10 a'],
  ['survey-ht.log', '10-10 b'],
  ['survey3.log', '10-11 1'],
  ['survey4.log', '10-11 2'],
  ['survey5.log', '10-11 3'],
  ['survey6.log', '10-11 4'],
  ['survey7.log', '10-11 5'],
  ['survey8.log', '10-11 6'],
];
const surveys = SURVEYS.map(([file, label]) => {
  const byProject = {};
  for (const l of read(`surveys/${file}`).split('\n')) {
    const m = /^SURVEY (\S+)\s+jsdom passed \d+ \| warpdom passed \d+ \| differ (\d+)/.exec(l);
    if (m) byProject[m[1]] = Number(m[2]);
  }
  return { file, label, byProject };
});

// ---------------------------------------------------------------- figure 2: speedups, three-way

{
  const rows = [...threeWay].sort((a, b) => b.wdSpeed - a.wdSpeed);
  const W = 720, left = 150, right = 30, top = 46, rowH = 30, barH = 10;
  const H = top + rows.length * rowH + 50;
  const lo = 0.5, hi = 10;
  const x = (v) => left + ((Math.log10(v) - Math.log10(lo)) / (Math.log10(hi) - Math.log10(lo))) * (W - left - right);
  let b = text(left, 18, 'Speedup over jsdom (median of per-round ratios), GitHub Actions, 3 rounds; log scale', 'font-weight="bold"');
  b += legend(left, 36, [['warpdom vs jsdom', '#333'], ['happy-dom vs jsdom', 'url(#diag)']]);
  for (const t of [0.5, 0.75, 1, 1.5, 2, 3, 5, 10]) {
    b += line(x(t), top, x(t), top + rows.length * rowH, `stroke="${t === 1 ? '#000' : '#bbb'}" stroke-width="${t === 1 ? 1.2 : 0.6}"${t === 1 ? '' : ' stroke-dasharray="2,3"'}`);
    b += text(x(t), top + rows.length * rowH + 16, `${t}x`, 'text-anchor="middle"');
  }
  rows.forEach((r, i) => {
    const y = top + i * rowH + 4;
    b += text(left - 8, y + barH + 4, r.suite, 'text-anchor="end"');
    const x1 = x(1);
    b += rect(Math.min(x1, x(r.wdSpeed)), y, Math.abs(x(r.wdSpeed) - x1), barH, '#333');
    b += text(Math.max(x1, x(r.wdSpeed)) + 4, y + barH - 1, `${r.wdSpeed.toFixed(2)}x`, 'font-size="10"');
    b += rect(Math.min(x1, x(r.hdSpeed)), y + barH + 1, Math.abs(x(r.hdSpeed) - x1), barH, 'url(#diag)');
    b += text(Math.max(x1, x(r.hdSpeed)) + 4, y + 2 * barH, `${r.hdSpeed.toFixed(2)}x`, 'font-size="10"');
  });
  b += text(left, H - 10, 'Bars start at 1x; a bar to the left of 1x is slower than jsdom. handsontable is not in this run (harness time limit).', 'font-size="10"');
  write('fig2-speedup-three-way.svg', svgDoc(W, H, b, 'Speedup over jsdom per suite, warpdom and happy-dom'));
}

// ---------------------------------------------------------------- figure 3: changed results

{
  const rows = [...threeWay].sort((a, b) => b.hdDiff - a.hdDiff);
  const W = 720, left = 150, right = 60, top = 46, rowH = 30, barH = 10;
  const H = top + rows.length * rowH + 50;
  const maxL = Math.log10(10000 + 1);
  const x = (v) => left + (Math.log10(v + 1) / maxL) * (W - left - right);
  let b = text(left, 18, 'Tests whose status differs from jsdom, per suite (three-way run); log scale of count + 1', 'font-weight="bold"');
  b += legend(left, 36, [['warpdom', '#333'], ['happy-dom', 'url(#diag)']]);
  for (const t of [0, 1, 10, 100, 1000, 10000]) {
    b += line(x(t), top, x(t), top + rows.length * rowH, `stroke="${t === 0 ? '#000' : '#bbb'}" stroke-width="0.6"${t === 0 ? '' : ' stroke-dasharray="2,3"'}`);
    b += text(x(t), top + rows.length * rowH + 16, t.toLocaleString('en-US'), 'text-anchor="middle"');
  }
  rows.forEach((r, i) => {
    const y = top + i * rowH + 4;
    b += text(left - 8, y + barH + 4, r.suite, 'text-anchor="end"');
    b += rect(x(0), y, x(r.wdDiff) - x(0), barH, '#333');
    b += text(x(r.wdDiff) + 4, y + barH - 1, String(r.wdDiff), 'font-size="10"');
    b += rect(x(0), y + barH + 1, x(r.hdDiff) - x(0), barH, 'url(#diag)');
    b += text(x(r.hdDiff) + 4, y + 2 * barH, r.hdDiff.toLocaleString('en-US'), 'font-size="10"');
  });
  b += text(left, H - 10, 'Differences in either direction (pass on jsdom and fail, or the reverse), summed over the run.', 'font-size="10"');
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
  const W = 720, left = 130, right = 30, top = 86, rowH = 46, barH = 26;
  const labelRoom = 150;
  const H = top + profiles.length * rowH + 60;
  const maxCpu = Math.max(...profiles.map((p) => p.cpu));
  const scale = (W - left - right - labelRoom) / maxCpu;
  let b = text(left, 18, 'Sampled CPU time of test processes by category (idle excluded), seconds', 'font-weight="bold"');
  // legend in two rows
  b += legend(left, 40, GROUPS.slice(0, 4).map(([l, , f]) => [l, f]));
  b += legend(left, 60, GROUPS.slice(4).map(([l, , f]) => [l, f]));
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
  b += text(left, H - 26, 'ariakit: 2026-10-12, laptop (shares usable, wall times not). MUI: four packages, 2026-10-11, warpdom only.', 'font-size="10"');
  b += text(left, H - 12, 'Idle = summed time test processes spent waiting (timers, animation frames).', 'font-size="10"');
  write('fig4-cpu-share.svg', svgDoc(W, H, b, 'CPU time by category, jsdom and warpdom'));
}

// ---------------------------------------------------------------- figure 5: WPT per area

{
  const rows = wpt.filter((r) => r.area !== 'Total');
  const total = wpt.find((r) => r.area === 'Total');
  const all = [...rows, total];
  const W = 720, left = 150, right = 60, top = 46, rowH = 30, barH = 10;
  const H = top + all.length * rowH + 44;
  const x = (v) => left + (v / 100) * (W - left - right);
  let b = text(left, 18, 'Web Platform Tests: score per file (wpt.fyi style), per area', 'font-weight="bold"');
  b += legend(left, 36, [['warpdom', '#333'], ['jsdom 30.1.2', 'url(#diag)']]);
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
  b += text(left, H - 8, 'Scored against the union of subtest names both engines report. Run 38272794602, warpdom cad3ce8, WPT 87b5d13099.', 'font-size="10"');
  write('fig5-wpt.svg', svgDoc(W, H, b, 'WPT score per area, warpdom and jsdom'));
}

// ---------------------------------------------------------------- figure 1: fast mode (learned isolation)

{
  const rows = [...fast].sort((a, b) => b.speed - a.speed);
  const W = 720, left = 150, right = 60, top = 46, rowH = 24, barH = 14;
  const H = top + rows.length * rowH + 50;
  const hi = 9;
  const x = (v) => left + (v / hi) * (W - left - right);
  let b = text(left, 18, 'Learned isolation (Vitest): speedup over jsdom default, GitHub Actions, 3 rounds', 'font-weight="bold"');
  b += legend(left, 36, [['split (shared files + learned isolated ones)', '#333'], ['isolated kept (= warpdom default)', 'url(#diag)']]);
  for (let t = 0; t <= hi; t++) {
    b += line(x(t), top, x(t), top + rows.length * rowH, `stroke="${t === 1 ? '#000' : '#bbb'}" stroke-width="${t === 1 ? 1.2 : 0.6}"${t === 1 ? '' : ' stroke-dasharray="2,3"'}`);
    b += text(x(t), top + rows.length * rowH + 16, `${t}x`, 'text-anchor="middle"');
  }
  rows.forEach((r, i) => {
    const y = top + i * rowH + (rowH - barH) / 2;
    b += text(left - 8, y + barH - 3, r.suite, 'text-anchor="end"');
    b += rect(x(0), y, x(r.speed) - x(0), barH, r.mode === 'split' ? '#333' : 'url(#diag)');
    b += text(x(r.speed) + 4, y + barH - 3, `${r.speed.toFixed(2)}x`, 'font-size="10"');
  });
  b += text(left, H - 10, 'Each ratio compares runs within one job (one machine). Run 38201346054.', 'font-size="10"');
  write('fig1-fastmode.svg', svgDoc(W, H, b, 'Fast-mode speedups'));
}

// ---------------------------------------------------------------- figure 6: survey timeline

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
  let b = text(left, 18, 'Tests whose status differs from jsdom, per survey (chronological, 2026-10-09 to 10-11)', 'font-weight="bold"');
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
  write('fig6-survey-timeline.svg', svgDoc(W, H, b, 'Differences per survey'));
}
