#!/bin/bash
# run.sh <tag> <n> <CFG_ENV> <PIN or ''> [files...]
S=${S:-/tmp/solid-transition}  # working directory: these scripts, warpdom-208ad49/, exp/out/
source ~/.nvm/nvm.sh >/dev/null; nvm use ${NODEV:-22.23.3} >/dev/null
P=$HOME/Projects/solid/packages/solid
tag=$1 n=$2; export CFG_ENV=$3 PIN=$4; shift 4
for i in $(seq 1 $n); do
  out=$S/exp/out/$tag/$i; mkdir -p $out; export ORDER_LOG=$out/order.log; rm -f $ORDER_LOG
  (cd $P && $HOME/Projects/solid/node_modules/.bin/vitest run --config vitest.config.exp.dom-trace.mjs --reporter=json --outputFile=$out/r.json --minWorkers=1 --maxWorkers=${MW:-2} "$@" > $out/log 2>&1)
  echo "$tag $i $(node $S/st.cjs $out/r.json 2>&1) :: $(bash $S/pre.sh $out)"
done
