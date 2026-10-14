#!/bin/bash
# One harness run of melt-ui (dom-api-tracer trace-corpus.mjs, Node 22.23.3, 2 workers),
# appending the statuses of the "Toggles checked to true..." tests to runs.tsv.
# Usage: run.sh <experiment> <condition> <dom: jsdom|warpdom> <scope: file|full> <run#> [extra harness args...]
set -u
M="$(cd "$(dirname "$0")/.." && pwd)"
exp=$1 cond=$2 dom=$3 scope=$4 run=$5; shift 5
export PATH=$HOME/.nvm/versions/node/v22.23.3/bin:$PATH
out=$M/runs/$exp/$cond/$dom-$scope-$run
rm -rf "$out"; mkdir -p "$out"
files=()
setup=()
# MELT_SETUP=1: add the timing setup file (logs to timing.jsonl; MELT_DELAY_MS, MELT_RAF_MS act)
if [ -n "${MELT_SETUP:-}" ]; then setup=(--first-setup "$M/scripts/timing-setup.mjs"); export MELT_LOG="$out/timing.jsonl"; fi
[ "$scope" = file ] && files=(--extra-args "src/tests/context-menu/ContextMenu.spec.ts src/tests/dropdown-menu/DropdownMenu.spec.ts")
cd "$HOME/Projects/dom-api-tracer"
node scripts/trace-corpus.mjs corpus/held-out.json --repos-dir "$HOME/Projects" --only melt-ui \
  --environment "$dom" --warpdom "$M/warpdom" --no-baseline --no-build --max-workers 2 \
  --out "$out" ${files[@]+"${files[@]}"} ${setup[@]+"${setup[@]}"} "$@" > "$out/harness.log" 2>&1
load=$(sysctl -n vm.loadavg | awk '{print $2}')
node "$M/scripts/extract.cjs" "$out/tmp/melt-ui/root.$dom.json" "$exp" "$cond" "$dom" "$scope" "$run" "$load" >> "$M/runs.tsv"
(cd "$HOME/Projects/melt-ui" && git checkout -q -- src/json/contributors.json 2>/dev/null)
