#!/bin/bash
# The experiments, in order. Conditions within a phase are interleaved round by round,
# so that changes of machine load fall on all conditions alike.
# Usage: experiments.sh <phase: repro-file|repro-full|delay|delay-fine|chain|raf> [rounds]
set -u
M="$(cd "$(dirname "$0")/.." && pwd)"
R=${2:-20}
case $1 in
  repro-file) # unchanged harness runs (no setup file), the two spec files
    for i in $(seq 1 $R); do for d in jsdom warpdom; do bash $M/scripts/run.sh repro none $d file $i; done; done ;;
  repro-full) # unchanged harness runs, the whole suite
    for i in $(seq 1 $R); do for d in jsdom warpdom; do bash $M/scripts/run.sh repro none $d full $i; done; done ;;
  delay) # instrumented; warpdom slowed by a busy-wait before each ArrowDown dispatch
    for i in $(seq 1 $R); do
      MELT_SETUP=1 bash $M/scripts/run.sh delay d0 jsdom file $i
      for ms in 0 1 2 4; do MELT_SETUP=1 MELT_DELAY_MS=$ms bash $M/scripts/run.sh delay d$ms warpdom file $i; done
    done ;;
  delay-fine) # as delay, finer steps (0 repeated as the in-phase control)
    for i in $(seq 1 $R); do for ms in 0 0.25 0.5 0.75; do
      MELT_SETUP=1 MELT_DELAY_MS=$ms bash $M/scripts/run.sh delay-fine d$ms warpdom file $i
    done; done ;;
  chain) # instrumented (version 2): every test of the two blocks logged, to follow the
         # transition loop from the preceding test into the target test; no manipulation
    for i in $(seq 1 $R); do for d in jsdom warpdom; do
      MELT_SETUP=1 MELT_LOG_ALL=1 bash $M/scripts/run.sh chain none $d file $i
    done; done ;;
  raf) # instrumented; the specs' requestAnimationFrame stub delay (16 ms) changed
    for i in $(seq 1 $R); do for ms in 8 24 32 48; do for d in jsdom warpdom; do
      MELT_SETUP=1 MELT_RAF_MS=$ms bash $M/scripts/run.sh raf r$ms $d file $i
    done; done; done ;;
esac
