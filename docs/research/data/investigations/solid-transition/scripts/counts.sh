#!/bin/bash
S=${S:-/tmp/solid-transition}  # working directory: these scripts, warpdom-208ad49/, exp/out/
F=web/test/transition.spec.tsx
one() { # mode cond scope i
  local m=$1 c=$2 sc=$3 i=$4 env=jsdom wd=
  case $m in w208) env=warpdom; wd=$S/warpdom-208ad49;; wmain) env=warpdom; wd=$HOME/Projects/warpdom;; esac
  if [ $sc = full ]; then WARPDOM=$wd FIRST=$S/order-setup.mjs $S/rep.sh $env 1 h-$c-$sc-$m-$i; else WARPDOM=$wd $S/rep.sh $env 1 h-$c-$sc-$m-$i $F; fi
}
for i in $(seq 1 20); do for m in jsdom w208 wmain; do one $m idle full $i; [ $i -le 10 ] && one $m idle file $i; done; done
for k in $(seq 1 14); do (yes > /dev/null &) ; done
sleep 2; uptime
for i in $(seq 1 10); do for m in jsdom w208 wmain; do one $m load full $i; one $m load file $i; done; done
pkill yes; uptime
echo DONE
