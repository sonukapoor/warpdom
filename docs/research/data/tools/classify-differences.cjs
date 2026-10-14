// classify.cjs <pertestDir> [config...]: per project/config, over rounds 1..: tests differing from jsdom-default split into
// common (status change, both present), onlyRun, onlyBase; and for configs vs warpdom-default: false passes split likewise.
const fs=require('fs'),path=require('path');
const [dir,...cfgs]=process.argv.slice(2);
const rd=f=>{try{const m=JSON.parse(fs.readFileSync(f));m.tests??={};return m}catch{return null}};
const out={};
for(const r of fs.readdirSync(dir).filter(x=>x!=='0').sort()){
 for(const p of fs.readdirSync(path.join(dir,r))){
  const base=rd(path.join(dir,r,p,'jsdom-default.json')); const wd=rd(path.join(dir,r,p,'warpdom-default.json'));
  for(const f of fs.readdirSync(path.join(dir,r,p))){
   const c=f.replace(/\.json$/,''); if(cfgs.length&&!cfgs.includes(c))continue; if(c==='learn')continue;
   const m=rd(path.join(dir,r,p,f)); if(!m||!base)continue;
   const o=(out[p+' '+c]??={common:[],onlyRun:[],onlyBase:[],fpCommon:[],fpMissing:[]});
   let com=0,or=0,ob=0;
   for(const k of new Set([...Object.keys(base.tests),...Object.keys(m.tests)])){
     const a=base.tests[k]?.s,b=m.tests[k]?.s; if(a===b)continue;
     if(a&&b)com++; else if(b)or++; else ob++; }
   o.common.push(com);o.onlyRun.push(or);o.onlyBase.push(ob);
   if(wd){let fc=0,fm=0;for(const k of Object.keys(m.tests)){if(m.tests[k].s==='passed'&&wd.tests[k]?.s!=='passed'){if(wd.tests[k])fc++;else fm++;}}o.fpCommon.push(fc);o.fpMissing.push(fm);}
  }}}
for(const [k,v] of Object.entries(out)) console.log(k.padEnd(45),'common',v.common.join(','),'| onlyRun',v.onlyRun.join(','),'| onlyBase',v.onlyBase.join(','),'| FP(vs wd-default) common',v.fpCommon.join(','),'missing',v.fpMissing.join(','));
