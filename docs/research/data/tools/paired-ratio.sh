#!/bin/bash
# paired.sh <csv> <A> <B> [exclude-project-regex]: ratio time(A)/time(B) per suite and across suites,
# with timing-report.cjs's own bootstrap (A relabelled jsdom-default with differs 0, B relabelled warpdom-default).
csv=$1; A=$2; B=$3; ex=${4:-^$}
tmp=$(mktemp)
echo "round,project,config,seconds,differs,files_differ" > $tmp
awk -F, -v A="$A" -v B="$B" -v ex="$ex" 'NR>1 && $1!="round" && $2 !~ ex { if($3==A) print $1","$2",jsdom-default,"$4",0,0"; else if($3==B) print $1","$2",warpdom-default,"$4","$5",0" }' $csv >> $tmp
node ${DOM_API_TRACER:-$HOME/Projects/dom-api-tracer}/scripts/research/timing-report.cjs $tmp | sed -n '/^\*\*warpdom vs jsdom: speedup/,/^Median speedup/p'
rm $tmp
