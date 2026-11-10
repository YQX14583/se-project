// Reproducible real-kernel calibration/validation. No tools and no future RNG access.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {LEVELS}=require('../.test-build/domain/levels');
const {createRun,applyAction,findLegalMoves,findMatches}=require('../.test-build/domain/board');
const dir=path.join(__dirname,'../simulation');fs.mkdirSync(dir,{recursive:true});
const trainingCsv=['level,configVersion,colors,sadness,seed,won,steps,clouds,traceHash'];
const ZERO={breathe:0,hug:0,resonate:0,shuffle:0};
const POLICY={version:'casual-v1',bestProbability:.75,weights:{clearedTile:1,cloudHit:3,cloudKill:8},futureRefillAccess:false};
function rand(x){x=x>>>0||0x6d2b79f5;x^=x<<13;x^=x>>>17;x^=x<<5;return x>>>0;}
function choose(s,policySeed,reference){let moves=findLegalMoves(s.board);assert.ok(moves.length,'stable run must have legal move');policySeed=rand(policySeed);if(!reference&&policySeed%100>=75)return {move:moves[policySeed%moves.length],policySeed};let max=-Infinity,best=[];for(const m of moves){const b=s.board.slice();[b[m.from],b[m.to]]=[b[m.to],b[m.from]];const clear=findMatches(b);let score=clear.length;for(let i=0;i<49;i++)if(b[i].kind==='cloud'&&clear.some(j=>Math.abs(Math.floor(i/7)-Math.floor(j/7))+Math.abs(i%7-j%7)===1))score+=b[i].hp===1?8:3;if(score>max){max=score;best=[m];}else if(score===max)best.push(m);}policySeed=rand(policySeed);return {move:best[policySeed%best.length],policySeed};}
function trial(c,seed,reference=false,trace=false){let s=createRun(c,seed,seed),p=rand(seed^0x9e3779b9),actions=[],hash=2166136261;while(s.phase==='playing'){const choice=choose(s,p,reference);p=choice.policySeed;const r=applyAction(s,{type:'swap',...choice.move},c,ZERO);assert.ok(r.ok);s=r.state;hash=Math.imul(hash^s.rng,16777619)>>>0;if(trace)actions.push(choice.move.from+'-'+choice.move.to);}return {seed,won:s.phase==='won',steps:s.validSwaps,score:s.phase==='won'?s.score:0,shownScore:s.score,sadness:s.sadness,finalBoard:s.board.map(c=>c.kind==='tile'?'t'+c.color:'c'+c.hp).join(''),clouds:s.board.filter(c=>c.kind==='cloud').length,matchScore:s.matchScore,chainActions:s.chainActions,cloudsCleared:s.cloudsCleared,finalRng:s.rng,hash,actions:actions.join('|')};}
function seedFor(c,i,validation){return ((validation?(0x40000000+c.configVersion*0x08000000):0x10000000)+c.id*100000+i)>>>0;}
function range(c){return c.id===1?[.90,.95]:c.index<=7?[.85,.95]:c.index<=13?[.55,.70]:[.25,.40];}
function estimate(c,n){const runs=[];for(let i=0;i<n;i++){const r=trial({...c,baseMoves:200},seedFor(c,i,false));runs.push(r);trainingCsv.push([c.id,c.configVersion,c.colors,c.sadnessStart,r.seed,+r.won,r.steps,r.clouds,r.hash].join(','));}const wins=runs.filter(r=>r.won),mean=wins.reduce((a,r)=>a+r.steps,0)/wins.length;return {runs,mean,truncated:n-wins.length};}
function metrics(runs,budget){const wins=runs.filter(r=>r.won&&r.steps<=budget);return {winRate:wins.length/runs.length,threeStarFractionOfWins:wins.length?wins.filter(r=>r.clouds===0&&r.steps<=.55*budget).length/wins.length:0};}
function selectBudget(c,runs){const [lo,hi]=range(c);let best,loss=Infinity;for(let b=1;b<=100;b++){const m=metrics(runs,b),distance=m.winRate<lo?lo-m.winRate:m.winRate>hi?m.winRate-hi:0;const star=Math.max(0,.05-m.threeStarFractionOfWins);const cost=distance*10+star+(Math.abs(m.winRate-(lo+hi)/2))*.01;if(cost<loss){loss=cost;best={budget:b,...m};}}return best;}
function writeConfigs(configs){const file=path.join(__dirname,'../assets/scripts/domain/levels.ts'),source=fs.readFileSync(file,'utf8');fs.writeFileSync(file,source.replace(/export const LEVELS:LevelConfig\[\]=[\s\S]*?;\s*export const CHAPTERS=/,'export const LEVELS:LevelConfig[]='+JSON.stringify(configs,null,2)+';\nexport const CHAPTERS='));}
function calibrate(){const n=Number(process.env.CAL_N||300),configs=[];const stats=[];for(const original of LEVELS){let c={...original,goals:{...original.goals}},est=estimate(c,n),selected=selectBudget(c,est.runs);const attempts=[{colors:c.colors,sadness:c.sadnessStart,...selected}];
 // Discrete budgets sometimes need a broader cascade distribution; tune published config, never runtime RNG.
 if(selected.threeStarFractionOfWins<.05||selected.winRate<range(c)[0]+.02||selected.winRate>range(c)[1]-.02){for(const sadness of [c.sadnessStart+3,c.sadnessStart-3,c.sadnessStart+6,c.sadnessStart-6,40,48,60,72,88,100].filter(n=>n>=40&&n<=100)){const candidate={...c,sadnessStart:sadness};const e=estimate(candidate,n),b=selectBudget(candidate,e.runs);attempts.push({colors:c.colors,sadness,...b});const [lo,hi]=range(c);if(b.winRate>=lo+.02&&b.winRate<=hi-.02&&b.threeStarFractionOfWins>=.05){c=candidate;est=e;selected=b;break;}}}
 c.baseMoves=selected.budget;c.configVersion=original.configVersion+1;configs.push(c);const R=1.60-(c.chapter-1)*.1125;stats.push({id:c.id,mean:est.mean,truncated:est.truncated,initialEstimate:Math.ceil(est.mean*R),R,selected,attempts});console.log(c.id,c.type,'S',c.sadnessStart,'budget',c.baseMoves,'rate',selected.winRate.toFixed(3),'star',selected.threeStarFractionOfWins.toFixed(3));}
 writeConfigs(configs);fs.writeFileSync(path.join(dir,'calibration.csv'),trainingCsv.join('\n'));fs.writeFileSync(path.join(dir,'calibration.json'),JSON.stringify({policy:POLICY,n,seedRange:'0x10000000+levelId*100000+i',stats},null,2));}

const AC11_DEFINITION='Both policies: sort every trial score descending (failed trials retain score 0), take ceil(n*0.10) samples, compare abs(casualTop10Mean-referenceTop10Mean)/referenceTop10Mean < 0.15; reference top-decile mean must be positive.';
function compareScores(casual,reference){
 assert.ok(casual.length>0);assert.equal(casual.length,reference.length);
 const topSampleCount=Math.ceil(casual.length*.1);
 const topMean=runs=>runs.map(r=>r.score).sort((a,b)=>b-a).slice(0,topSampleCount).reduce((a,b)=>a+b,0)/topSampleCount;
 const casualTop10Mean=topMean(casual),referenceTop10Mean=topMean(reference),referenceMean=reference.reduce((a,r)=>a+r.score,0)/reference.length;
 const ac11RelativeGap=referenceTop10Mean>0?Math.abs(casualTop10Mean-referenceTop10Mean)/referenceTop10Mean:null;
 const legacyAc11RelativeGap=referenceMean>0?Math.abs(casualTop10Mean-referenceMean)/referenceMean:null;
 return {topSampleCount,referenceMean,casualTop10Mean,referenceTop10Mean,ac11RelativeGap,ac11Pass:ac11RelativeGap!==null&&ac11RelativeGap<.15,legacyAc11RelativeGap,legacyAc11Pass:legacyAc11RelativeGap!==null&&legacyAc11RelativeGap<.15};
}
function summarize(c,casual,reference){
 const n=casual.length,m=metrics(casual,c.baseMoves),[lo,hi]=range(c);
 return {id:c.id,configVersion:c.configVersion,n,budget:c.baseMoves,type:c.type,range:[lo,hi],...m,failed:n-casual.filter(r=>r.won).length,threeStarWins:casual.filter(r=>r.won&&r.clouds===0&&r.steps<=.55*c.baseMoves).length,referenceWinRate:reference.filter(r=>r.won).length/n,...compareScores(casual,reference),difficultyPass:m.winRate>=lo&&m.winRate<=hi,starsPass:m.threeStarFractionOfWins>=.05};
}
function sourceHashes(){return Object.fromEntries(['assets/scripts/domain/board.ts','assets/scripts/domain/model.ts','assets/scripts/domain/levels.ts','tools/simulate.cjs'].map(f=>[f,crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname,'..',f))).digest('hex')]));}
function sha(file){return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');}
function validate(){
 const versions=Array.from(new Set(LEVELS.map(c=>c.configVersion))).sort();fs.writeFileSync(path.join(dir,versions.length===1?'configs-v'+versions[0]+'.json':'configs-mixed-v'+versions.join('-v')+'.json'),JSON.stringify(LEVELS,null,2));fs.writeFileSync(path.join(dir,'configs-current.json'),JSON.stringify(LEVELS,null,2));
 const n=Number(process.env.SIM_N||1000),csv=['level,configVersion,policy,seed,budget,won,steps,score,shownScore,clouds,matchScore,chainActions,cloudsCleared,finalRng,traceHash,actions,finalSadness,finalBoard'],summary=[];
 for(const c of LEVELS){
  const casual=[],reference=[];
  for(let i=0;i<n;i++){const seed=seedFor(c,i,true);for(const [kind,ref,arr] of [['casual',false,casual],['reference',true,reference]]){const r=trial(c,seed,ref,true);arr.push(r);csv.push([c.id,c.configVersion,kind,seed,c.baseMoves,+r.won,r.steps,r.score,r.shownScore,r.clouds,r.matchScore,r.chainActions,r.cloudsCleared,r.finalRng,r.hash,r.actions,r.sadness,r.finalBoard].join(','));}}
  const result=summarize(c,casual,reference);summary.push(result);console.log('validate',c.id,result.winRate.toFixed(3),result.threeStarFractionOfWins.toFixed(3),'ac11',result.ac11RelativeGap?.toFixed(3));
 }
 const csvPath=path.join(dir,'validation.csv');fs.writeFileSync(csvPath,csv.join('\n'));
 fs.writeFileSync(path.join(dir,'validation.json'),JSON.stringify({sourceHashes:sourceHashes(),csvSha256:sha(csvPath),ac11Definition:AC11_DEFINITION,legacyAc11Definition:'Casual top 10% mean versus reference whole-sample mean; failures retain score zero.',policy:POLICY,n,seedRange:'0x40000000+configVersion*0x08000000+levelId*100000+i',reference:'same rules, seeds and budgets; always highest immediate score; failures score zero',summary,limitations:['Robot trials are not human player samples.','AC11 is an empirical comparator, not theoretical optimum.']},null,2));
}
function recomputeAc11(){
 const csvPath=path.join(dir,'validation.csv'),reportPath=path.join(dir,'validation.json'),report=JSON.parse(fs.readFileSync(reportPath,'utf8')),lines=fs.readFileSync(csvPath,'utf8').trim().split('\n'),header=lines.shift().split(','),groups=new Map();
 for(const line of lines){const values=line.split(','),r=Object.fromEntries(header.map((k,i)=>[k,values[i]])),c=LEVELS[Number(r.level)-1];assert.ok(c);assert.equal(Number(r.configVersion),c.configVersion);assert.equal(Number(r.budget),c.baseMoves);assert.ok(['casual','reference'].includes(r.policy));if(!groups.has(c.id))groups.set(c.id,{casual:[],reference:[]});const won=r.won==='1';assert.ok(won||Number(r.score)===0);groups.get(c.id)[r.policy].push({seed:Number(r.seed),won,score:Number(r.score),steps:Number(r.steps),clouds:Number(r.clouds)});}
 assert.equal(groups.size,75);const summary=[];
 for(const c of LEVELS){const group=groups.get(c.id);assert.equal(group.casual.length,report.n);assert.equal(group.reference.length,report.n);const casualSeeds=group.casual.map(r=>r.seed),referenceSeeds=group.reference.map(r=>r.seed);assert.equal(new Set(casualSeeds).size,report.n);assert.deepEqual(casualSeeds,referenceSeeds);summary.push(summarize(c,group.casual,group.reference));}
 const archive=path.join(dir,'validation-legacy-ac11.json');if(!fs.existsSync(archive))fs.copyFileSync(reportPath,archive);
 report.sourceHashes=sourceHashes();report.csvSha256=sha(csvPath);report.ac11Definition=AC11_DEFINITION;report.legacyAc11Definition='Casual top 10% mean versus reference whole-sample mean; failures retain score zero.';report.recalculation={source:'complete validation.csv',rows:lines.length,policiesUnchanged:true,configsUnchanged:true,failedScoresRetained:true};report.summary=summary;fs.writeFileSync(reportPath,JSON.stringify(report,null,2));
 const auditPath=path.join(dir,'audit.json'),audit=JSON.parse(fs.readFileSync(auditPath,'utf8'));assert.equal(audit.csvSha256,report.csvSha256);audit.ac11Passed=summary.filter(r=>r.ac11Pass).length;audit.legacyAc11Passed=summary.filter(r=>r.legacyAc11Pass).length;audit.validationJsonSha256=sha(reportPath);fs.writeFileSync(auditPath,JSON.stringify(audit,null,2));
 const evidence={definition:AC11_DEFINITION,inputCsvSha256:report.csvSha256,outputReportSha256:sha(reportPath),rows:lines.length,failedRows:lines.filter(l=>l.split(',')[5]==='0').length,perPolicySamplesPerLevel:report.n,passed:audit.ac11Passed,total:summary.length,legacyPassed:audit.legacyAc11Passed,results:summary.map(r=>({id:r.id,casualTop10Mean:r.casualTop10Mean,referenceTop10Mean:r.referenceTop10Mean,gap:r.ac11RelativeGap,pass:r.ac11Pass,legacyGap:r.legacyAc11RelativeGap,legacyPass:r.legacyAc11Pass}))};fs.writeFileSync(path.join(dir,'ac11-recalculation.json'),JSON.stringify(evidence,null,2));console.log(JSON.stringify({rows:evidence.rows,failedRows:evidence.failedRows,passed:evidence.passed,total:evidence.total,legacyPassed:evidence.legacyPassed,failures:evidence.results.filter(r=>!r.pass)},null,2));
}
if(require.main===module){if(process.argv.includes('--calibrate'))calibrate();else if(process.argv.includes('--recompute-ac11'))recomputeAc11();else validate();}
module.exports={trial,choose,estimate,metrics,selectBudget,compareScores,POLICY};




