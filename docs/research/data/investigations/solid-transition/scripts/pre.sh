# prints files preceding transition.spec in same worker
for d in "$@"; do log=$d/order.log; pid=$(grep 'start .*transition.spec' $log | awk '{print $1}'); 
pre=$(awk -v p=$pid '$1==p && $2=="start"{print $3}' $log | sed 's#.*/solid/packages/solid/##' | sed '/transition.spec/q' | tr '\n' ' '); echo "$pre"; done
