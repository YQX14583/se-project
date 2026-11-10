'use strict';
// Bounded equivalence audit only. This never calibrates or rewrites prior evidence.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {LEVELS}=require('../.test-build/domain/levels'),{trial,POLICY}=require('./simulate.cjs');
const root=path.join(__dirname,'..'),dir=path.join(root,'simulation');
const sha=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const relativeSha=file=>sha(path.join(root,file));
const originalFile=path.join(dir,'history-v3-v5/configs-current.json');
const original=JSON.parse(fs.readFileSync(originalFile,'utf8'));
const historicalFiles=['validation.csv','validation.json','configs-current.json'];
const before=Object.fromEntries(historicalFiles.map(name=>[name,sha(path.join(dir,name))]));
assert.equal(LEVELS.length,75);assert.equal(original.length,75);
for(let i=0;i<75;i++)assert.deepEqual(LEVELS[i],{...original[i],configVersion:7},'restored configuration differs at level '+(i+1));

const seedOffsets=[0,17,628,9041],cases=[],counts={casual:{wins:0,losses:0},reference:{wins:0,losses:0}};
let validSwaps=0;
for(const config of LEVELS)for(const offset of seedOffsets)for(const [policy,reference] of [['casual',false],['reference',true]]){
 const seed=(0x40000000+config.id*100000+offset)>>>0;
 const legacy=trial(original[config.id-1],seed,reference,true),restored=trial(config,seed,reference,true);
 assert.deepEqual(restored,legacy,'trajectory mismatch: level '+config.id+', '+policy+', seed '+seed);
 counts[policy][restored.won?'wins':'losses']++;validSwaps+=restored.steps;
 cases.push({level:config.id,policy,legacyConfigVersion:original[config.id-1].configVersion,configVersion:7,matched:true,result:restored});
}
assert.equal(cases.length,600);
assert(cases.some(c=>c.result.won)&&cases.some(c=>!c.result.won),'audit must retain both winning and failed cases');
const currentConfigPath=path.join(dir,'configs-v7.json');
fs.writeFileSync(currentConfigPath,JSON.stringify(LEVELS,null,2)+'\n');
const after=Object.fromEntries(historicalFiles.map(name=>[name,sha(path.join(dir,name))]));
assert.deepEqual(after,before,'prior v6 evidence must remain unchanged');
assert(JSON.parse(fs.readFileSync(path.join(dir,'configs-current.json'),'utf8')).every(c=>c.configVersion===6));
const report={
 schemaVersion:1,createdAt:new Date().toISOString(),configVersion:7,
 purpose:'Compare restored v7 and original v3/v5 published configurations using the same current deterministic kernel and identical policy seeds; no retuning.',
 configComparison:{count:75,allEqualExceptConfigVersion:true,budgetRange:[Math.min(...LEVELS.map(c=>c.baseMoves)),Math.max(...LEVELS.map(c=>c.baseMoves))],gentleExtraMoves:10,originalPath:'simulation/history-v3-v5/configs-current.json',originalSha256:sha(originalFile),currentPath:'simulation/configs-v7.json',currentSha256:sha(currentConfigPath)},
 sampling:{seedFormula:'(0x40000000 + levelId * 100000 + offset) >>> 0',seedOffsets,configVersionIndependent:true,policy:POLICY,reference:'Always choose the highest immediate score; same rules and seeds; no tools or future RNG access.',pairedGames:cases.length,totalTrialExecutions:cases.length*2,allPairsMatched:true,currentGamesValidSwaps:validSwaps,counts},
 comparedFields:['seed','won','steps','score','shownScore','sadness','finalBoard','clouds','matchScore','chainActions','cloudsCleared','finalRng','hash','actions'],
 trajectorySha256:crypto.createHash('sha256').update(JSON.stringify(cases)).digest('hex'),
 sourceHashes:Object.fromEntries(['assets/scripts/domain/board.ts','assets/scripts/domain/model.ts','assets/scripts/domain/levels.ts','tools/simulate.cjs','tools/audit-restored-v7.cjs'].map(file=>[file,relativeSha(file)])),
 preservedHistoricalV6:{unchanged:true,warning:'These root simulation files remain historical v6 evidence, not a new v7 difficulty validation.',files:after},
 limitations:['600 paired robot games are a bounded regression sample, not a new 150,000-game difficulty study.','Both sides use the current kernel; this compares restored configuration behavior, not archived executable binaries.','Wins and losses are preserved as observed samples, not human player or industry-standard pass-rate claims.'],
 cases
};
fs.writeFileSync(path.join(dir,'audit-restored-v7.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({configs:75,pairedGames:cases.length,totalTrialExecutions:cases.length*2,allPairsMatched:true,counts,validSwaps,historicalV6Unchanged:true,currentConfigSha256:report.configComparison.currentSha256},null,2));
