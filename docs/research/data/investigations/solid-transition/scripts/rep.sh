#!/bin/bash
# usage: rep.sh <env> <n> <tag> [file-filter]
S=${S:-/tmp/solid-transition}  # working directory: these scripts, warpdom-208ad49/, exp/out/
source ~/.nvm/nvm.sh >/dev/null; nvm use ${NODEV:-22.23.3} >/dev/null
cd ~/Projects/dom-api-tracer
env=$1; n=$2; tag=$3; filt=$4
WD=${WARPDOM:-$HOME/Projects/warpdom}
for i in $(seq 1 $n); do
  out=$S/rep/$tag/$i; mkdir -p $out
  export ORDER_LOG=$out/order.log
  if [ -n "$filt" ]; then ex=(--extra-args "$filt"); else ex=(); fi
  node scripts/trace-corpus.mjs --repos-dir ~/Projects --only solid --environment $env --warpdom $WD --no-baseline --no-build ${MW:+--max-workers $MW} --out $out ${FIRST:+--first-setup $FIRST} "${ex[@]}" > $out/harness.out 2>&1
  r=$(node $S/st.cjs $(ls $out/tmp/solid/*.json) 2>&1)
  echo "$tag $i $r"
done
