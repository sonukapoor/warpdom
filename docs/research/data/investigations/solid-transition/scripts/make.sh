#!/bin/bash
# set up temporary files in solid/packages/solid for the grouping experiment
S=${S:-/tmp/solid-transition}  # working directory: these scripts, warpdom-208ad49/, exp/out/
P=$HOME/Projects/solid/packages/solid
WD=${WARPDOM:-$HOME/Projects/warpdom}
cp $S/order-setup.mjs $P/order.dom-trace.mjs
# warpdom copy as the harness makes it
T=$P/node_modules/warpdom.dom-trace.copy; rm -rf $T; mkdir -p $T
cp -R $WD/src $T/src; cp $WD/package.json $T/; mkdir -p $T/node_modules
for d in parse5 entities; do cp -R "$(cd $WD/node_modules/$d && pwd -P)" $T/node_modules/$d; done
mk() { mkdir -p $P/node_modules/vitest-environment-$1; printf '{"name":"vitest-environment-%s","type":"module","exports":"./index.js","main":"./index.js"}' $1 > $P/node_modules/vitest-environment-$1/package.json; echo "$2" > $P/node_modules/vitest-environment-$1/index.js; }
mk dom-trace-warpdom "export { default } from '$T/src/vitest.js';"
mk dom-trace-warpdom2 "export { default } from '$T/src/vitest.js';"
mk dom-trace-jsdom2 "import { builtinEnvironments } from 'vitest/environments'; export default builtinEnvironments.jsdom;"
# config: CFG_ENV = environment for the config; PIN = name docblocks are switched to
cat > $P/vitest.config.exp.dom-trace.mjs <<'EOC'
import fs from 'node:fs';
import base from './vite.config.mjs';
const PIN = process.env.PIN, CFG_ENV = process.env.CFG_ENV;
if (PIN) {
  const readFile = fs.promises.readFile;
  fs.promises.readFile = async function (file, ...rest) {
    const c = await readFile.call(this, file, ...rest);
    return typeof c === 'string' ? c.replace(/(@vitest-environment\s+)jsdom\b/, '$1' + PIN) : c;
  };
}
const ORDER = process.env.ORDER ? process.env.ORDER.split(',') : null;
class Seq { constructor(ctx){this.ctx=ctx} async shard(f){return f} async sort(files){ if(!ORDER) return files; const key=(f)=>{const p=Array.isArray(f)?f[1]:(f.moduleId??f[1]); return ORDER.findIndex(o=>String(p).endsWith(o));}; return files.filter(f=>key(f)>=0).sort((a,b)=>key(a)-key(b)); } }
export default { ...base, test: { ...base.test, environment: CFG_ENV, setupFiles: ['./order.dom-trace.mjs'], ...(ORDER ? { sequence: { sequencer: Seq } } : {}) } };
EOC
