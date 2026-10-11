# Benchmarks

| Script | Measures | Output |
| --- | --- | --- |
| `load.js` (`npm run bench:load`) | cold module load in fresh processes, first window, later windows | ms |
| `hot.js` (`npm run bench:hot`) | hot members from the tracer data, against jsdom and happy-dom | ns per op |
| `create-bench.mjs` | createElement + appendChild + createTextNode + new Event | ns per node |
| `insert-bench.mjs` | appendChild, removeChild, insertBefore, remove(), append and replaceChildren of elements and text in a connected element | ns per insertion + removal |
| `style-bench.mjs` | inline style writes with repeated values (cache hits) | ns per write |
| `style-miss-bench.mjs` | inline style writes, repeated vs unique values (unique: CSS value validation and serialization run) | ns per write, both cases |
| `cascade-bench.mjs` | getComputedStyle with 300 style sheets and 500 elements, per pass and per pass after a class change; warpdom and jsdom | ms per pass |
| `dispatch-bench.mjs` | dispatchEvent through a 10-deep tree with a listener per level | ns per dispatch |
| `url-bench.mjs` | `a.href` after a tree change (base URL cache miss) and cached | ns per read |
| `window-bench.mjs` | createWindow, warm | µs per window |
| `env-bench.mjs` | Vitest environment setup + teardown per test file, touching a few globals | µs per file |

The `*-bench.mjs` scripts print one median and take the warpdom checkout to
measure as an optional argument (default: this repository):

```sh
node bench/style-miss-bench.mjs              # this checkout
node bench/style-miss-bench.mjs /tmp/wd-base # another checkout or export
```

## Rules (from the performance rules)

- Run the benchmark before changing anything, and record the baseline.
- At least 5 runs per side, before and after **alternating** (base, change,
  base, change, ...), so machine drift hits both; report the **median**,
  never the best run. Warm-up is built into each script.
- Note the Node version (`node --version`) with the numbers.
- Measure environment creation and startup (`load.js`, `window-bench.mjs`,
  `env-bench.mjs`) separately from per-operation cost.
- Check memory too (`process.memoryUsage()`), not only time.
- A gain under 3% or within noise is reverted. A slower hot path needs a
  reason recorded in PLAN.md.
- Keep the machine otherwise idle; corpus runs or other agents' benchmarks
  in parallel make numbers meaningless.

## Comparing against a git ref

Export the ref's source next to this checkout and point the script at it:

```sh
base=$(mktemp -d)
git archive <ref> src package.json | tar -x -C "$base"
ln -s "$PWD/node_modules" "$base/node_modules"   # parse5 and friends
for i in 1 2 3 4 5; do
  echo "base   $(node bench/style-miss-bench.mjs "$base")"
  echo "change $(node bench/style-miss-bench.mjs)"
done
```

Then take the median of each side. `cascade-bench.mjs` resolves jsdom from
this repository either way, so only warpdom's side changes.
