#!/usr/bin/env node
// Draws Figure 1 of the paper, how measured isolation runs (the `warpdom
// vitest run` command at warpdom 5942dc9, docs/fast-mode.md), as SVG.
// Plain Node (>= 18), no dependencies, no data: the figure shows the
// mechanism of Algorithm 1 (the accompanying paper, in preparation), not a result. Same style
// as make-figures.mjs: grayscale, Helvetica, prints in black and white.
//   node docs/research/figures/make-mechanism-figure.mjs

import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const FONT = 'font-family="Helvetica, Arial, sans-serif"';
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');

const W = 770;
const H = 440;
let body = '';

/** A box with a bold title line and plain text lines, left-aligned. */
function box(x, y, w, h, title, lines, { fill = '#fff', dash = false } = {}) {
  body += `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="4" fill="${fill}" stroke="#000" stroke-width="1"${dash ? ' stroke-dasharray="4 3"' : ''}/>`;
  body += `<text x="${x + 8}" y="${y + 17}" font-weight="bold">${esc(title)}</text>`;
  lines.forEach((l, i) => {
    body += `<text x="${x + 8}" y="${y + 35 + i * 15}" font-size="11">${esc(l)}</text>`;
  });
}

/** An arrow along a polyline of points, with an optional label. */
function arrow(points, label, lx, ly) {
  const d = points.map(([x, y], i) => `${i ? 'L' : 'M'}${x} ${y}`).join(' ');
  body += `<path d="${d}" fill="none" stroke="#000" stroke-width="1.2" marker-end="url(#head)"/>`;
  if (label) body += `<text x="${lx}" y="${ly}" font-size="11" font-style="italic">${esc(label)}</text>`;
}

// Row 1: learning (once) and the stored state.
box(20, 20, 400, 158, '1  Learning run (once, or with --learn)', [
  'a. run every file isolated: time t_iso; this result is reported',
  'b. run every file shared, DOM reset in place before each file',
  'c. files to isolate, L: a test whose status differs, a missing test',
  '   or file, a failure, or an unhandled error (counted against the',
  '   test file its stack names)',
  'd. split run (L isolated, rest shared); files still differing join L,',
  '   up to 4 split runs; time t_split',
  'e. split if results = isolated and t_split < t_iso - max(5%, 0.5 s)',
]);
box(470, 60, 170, 70, 'Stored state', ['mode and files L', '(.warpdom/fast-mode.json)'], { fill: '#eee' });
arrow([[420, 95], [466, 95]]);

// Row 2: a later run in split mode, one runner invocation with two projects.
body += `<rect x="20" y="215" width="560" height="135" rx="4" fill="none" stroke="#000" stroke-width="1" stroke-dasharray="4 3"/>`;
body += `<text x="28" y="232" font-weight="bold">2  Later runs in split mode: one runner invocation, two projects</text>`;
box(32, 245, 250, 92, 'Isolated project: files in L', [
  'each file: fresh window and', 'fresh module registry', '(as the runner\'s default)',
]);
box(318, 245, 250, 92, 'Shared project: all other files', [
  'modules shared within a worker;', 'DOM reset in place before each file', '(same window, document, interfaces)',
], { fill: '#f2f2f2' });
arrow([[555, 130], [555, 200], [300, 200], [300, 211]], 'mode = split, L', 563, 180);

// Row 3: the safety net and the reported result.
box(605, 215, 150, 135, '3  Safety net', [
  'a shared file that', 'fails: re-run isolated,', 'its isolated result', 'counts; it joins L.', 'Split no faster than', 't_iso: mode isolated',
]);
arrow([[580, 290], [601, 290]], 'fails', 578, 283);
arrow([[680, 215], [680, 95], [644, 95]], 'update', 688, 160);

box(20, 375, 735, 45, 'Reported result', [
  'isolated outcomes for files in L and for re-run files; shared outcomes for files that did not fail. Isolated mode = a plain runner call.',
], { fill: '#eee' });
arrow([[300, 350], [300, 371]]);
arrow([[680, 350], [680, 371]]);

const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" ${FONT} font-size="12">
<title>How measured isolation runs</title>
<defs>
  <marker id="head" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
    <path d="M0 0 L10 5 L0 10 z" fill="#000"/>
  </marker>
</defs>
<rect width="${W}" height="${H}" fill="#fff"/>
${body}
</svg>
`;
writeFileSync(join(here, 'fig-mechanism.svg'), svg);
console.log('wrote fig-mechanism.svg');
