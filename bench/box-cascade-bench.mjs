// µs per element of getComputedStyle reads (marginTop, paddingLeft, color,
// padding, marginBottom) after a class change on the table, which drops
// every cell's cascaded values. The jsdom 28.1.0 to 30.1.2 profiles apply
// margin and padding declarations in document order (cascade.js
// cascadeInOrder, #158). Four pages:
// - all: 600 rules that all match the cells, margin and padding with a
//   third !important and some padding: var(--p), 8 selectors;
// - distinct: the same with half the selectors distinct (:not(.nN));
// - miss: 600 rules that mostly do not match (.cN .xM);
// - small: 40 rules of mixed properties, a few of them matching.
// Median of 15 samples. ONLY=all (miss, small) runs one page.
//
//   node bench/box-cascade-bench.mjs [warpdomDir] [jsdom version|default]
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
// The warpdom checkout to measure: argv[2], default this repository.
const dir = path.resolve(process.argv[2] ?? fileURLToPath(new URL('..', import.meta.url)));
const profile = process.argv[3] ?? '28.1.0';
const { createWindow } = await import(pathToFileURL(path.join(dir, 'src', 'node.js')).href);

const SELECTORS = ['td', '.t td', 'tr td', '.t.t td', 'table td', 'tbody > tr > td', '.r td', 'td.c'];
function allMatching(distinct) {
  const rules = [];
  for (let i = 0; i < 600; i++) {
    const important = i % 3 === 0 ? ' !important' : '';
    const decl = [
      `margin: ${i}px`,
      `padding: ${i}px ${i + 1}px`,
      `margin-top: ${i}px`,
      `padding-left: ${i}px`,
      `padding: var(--p)`,
      `margin-bottom: ${i % 7}px`,
    ][i % 6];
    rules.push(`${SELECTORS[i % SELECTORS.length]}${distinct && i % 2 ? `:not(.n${i})` : ''} { ${decl}${important} }`);
  }
  return rules.join('\n');
}
function mostlyMissing() {
  const rules = [];
  for (let i = 0; i < 600; i++)
    rules.push(`.c${i} .x${i % 50} { margin: ${i}px; padding: ${i}px; color: red${i % 3 === 0 ? ' !important' : ''} }`);
  rules.push('td { padding: 2px } .t td { margin-top: 1px }');
  return rules.join('\n');
}
function small() {
  return [
    'body { margin: 8px; color: #333 }',
    '.t { border-collapse: collapse; margin: 0 auto }',
    'td { padding: 4px 8px; color: #111 }',
    '.t td.c { padding-left: 12px }',
    'tr:nth-child(2n) td { background: #eee }',
    ...Array.from({ length: 35 }, (_, i) => `.btn-${i} { margin: ${i}px; padding: 2px ${i}px; color: blue }`),
  ].join('\n');
}

function page(css) {
  const w = profile === 'default' ? createWindow() : createWindow({ jsdom: profile });
  const d = w.document;
  d.head.appendChild(d.createElement('style')).textContent = css;
  const rows = Array.from({ length: 20 }, () => `<tr>${'<td class="c x3"></td>'.repeat(10)}</tr>`).join('');
  d.body.innerHTML = `<div class="c3 r"><table class="t"><tbody>${rows}</tbody></table></div>`;
  const table = d.querySelector('table');
  const cells = [...d.querySelectorAll('td')];
  let k = 0;
  let sink = '';
  const pass = () => {
    table.classList.toggle('z', k++ % 2 === 0);
    for (const td of cells) {
      const cs = w.getComputedStyle(td);
      sink = cs.marginTop + cs.paddingLeft + cs.color + cs.padding + cs.marginBottom;
    }
  };
  for (let i = 0; i < 30; i++) pass();
  const samples = [];
  for (let r = 0; r < 15; r++) {
    const s = performance.now();
    for (let i = 0; i < 5; i++) pass();
    samples.push(((performance.now() - s) / 5 / cells.length) * 1000);
  }
  samples.sort((a, b) => a - b);
  return { us: samples[7], sink };
}

const out = [];
for (const [name, css] of [
  ['all', allMatching(false)],
  ['distinct', allMatching(true)],
  ['miss', mostlyMissing()],
  ['small', small()],
])
  if (!process.env.ONLY || process.env.ONLY === name) out.push(`${name} ${page(css).us.toFixed(1)}`);
console.log(`${profile}: ${out.join(' | ')} µs/element`);
