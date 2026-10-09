// Cold load time in fresh processes and window creation time.
// Budget (docs/design.md): cold load <= 30-40 ms with the milestone scope;
// jsdom 30 loads in ~176 ms, happy-dom 20 in ~85 ms on the same machine.
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const entry = fileURLToPath(new URL('../src/index.js', import.meta.url));
const probe = `const t = performance.now(); const { createWindow } = await import(${JSON.stringify(entry)});
const t2 = performance.now(); createWindow(); const t3 = performance.now(); console.log(t2 - t, t3 - t2);`;

const runs = [];
for (let i = 0; i < 7; i++) {
  const [load, first] = String(execFileSync(process.execPath, ['--input-type=module', '-e', probe])).trim().split(' ').map(Number);
  runs.push({ load, first });
}
const median = (xs) => xs.sort((a, b) => a - b)[xs.length >> 1];
console.log(`cold load      ${median(runs.map((r) => r.load)).toFixed(1)} ms (median of ${runs.length} fresh processes)`);
console.log(`first window   ${median(runs.map((r) => r.first)).toFixed(2)} ms`);

const { createWindow } = await import(entry);
for (let i = 0; i < 20; i++) createWindow();
const times = [];
for (let i = 0; i < 200; i++) { const t = performance.now(); createWindow(); times.push(performance.now() - t); }
console.log(`next windows   ${median(times).toFixed(3)} ms (median of 200)`);
