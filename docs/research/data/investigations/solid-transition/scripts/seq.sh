A=web/test/suspense.spec.tsx; T=web/test/transition.spec.tsx; X=test/external-source.spec.ts
for p in "jsdom jsdom" "warpdom dom-trace-warpdom"; do set -- $p; n=$1; e=$2
MW=1 ORDER=$T ./run.sh sequenced-$n-T 3 $e $e
MW=1 ORDER=$A,$T ./run.sh sequenced-$n-S_T 3 $e $e
MW=1 ORDER=$A,$X,$T ./run.sh sequenced-$n-S_ES_T 3 $e $e
done
