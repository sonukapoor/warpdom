#!/bin/bash
# Failures / runs per experiment, condition, DOM, scope and test, from runs.tsv.
M="$(cd "$(dirname "$0")/.." && pwd)"
awk -F'\t' 'NR>1 {k=$1"\t"$2"\t"$3"\t"$4"\t"$7; n[k]++; if($8!="passed")f[k]++; L[k]+=$6} END{for(k in n) printf "%s\t%d/%d\t%.1f\n", k, f[k]+0, n[k], L[k]/n[k]}' "$M/runs.tsv" | sort | (printf 'experiment\tcondition\tdom\tscope\ttest\tfailed/runs\tmean_load1\n'; cat)
