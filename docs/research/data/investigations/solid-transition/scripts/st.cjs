const j=require(process.argv[2]);let out=[];
for(const f of j.testResults)for(const a of f.assertionResults)if(/memo created during transition/.test(a.title))out.push(a.status+(a.failureMessages.length?' :: '+a.failureMessages[0].split('\n')[0]:''));
console.log((out.join('|')||'missing')+' total='+j.numPassedTests+'/'+j.numTotalTests);
