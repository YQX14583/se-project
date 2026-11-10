'use strict';
const {test}=require('node:test'),a=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const L=require('../.test-build/domain/levels'),B=require('../.test-build/domain/board'),P=require('../.test-build/platform/progress'),S=require('../.test-build/platform/save');
const originals=JSON.parse(fs.readFileSync(path.join(__dirname,'../simulation/history-v3-v5/configs-current.json'),'utf8'));
const locks={request:async(_key,_options,fn)=>fn()};
class Storage {constructor(){this.data=new Map();}getItem(k){return this.data.get(k)||null;}setItem(k,v){this.data.set(k,v);}}
function envelope(p){const text=JSON.stringify(p);let h=2166136261;for(let i=0;i<text.length;i++)h=Math.imul(h^text.charCodeAt(i),16777619);return JSON.stringify({schemaVersion:1,revision:p.revision,payload:p,checksum:(h>>>0).toString(16)});}
function relaxedProfile(){const config={...originals[0],baseMoves:30,configVersion:6},run=B.createRun(config,77,1),profile=P.startRun(P.newProfile(),run);profile.revision=12;profile.inventory.hug=2;profile.activeRun.reserved.hug=1;profile.settings.shake=false;return profile;}

test('all 75 configs exactly restore the early release except for the new version',()=>{
 a.equal(L.LEVELS.length,75);for(let i=0;i<75;i++){a.deepEqual(L.LEVELS[i],{...originals[i],configVersion:7});for(const gentle of [false,true]){const run=B.createRun(L.LEVELS[i],55,1,gentle);a.equal(run.initialMoves,originals[i].baseMoves+(gentle?10:0));a.equal(run.movesLeft,run.initialMoves);}}
 a.equal(Math.min(...L.LEVELS.map(c=>c.baseMoves)),3);a.equal(Math.max(...L.LEVELS.map(c=>c.baseMoves)),11);
});
test('run config lookup accepts only delivered versions and their own budgets',()=>{
 for(const c of L.LEVELS){a.deepEqual(L.configForRun({levelId:c.id,configVersion:7}),c);const old=L.configForRun({levelId:c.id,configVersion:6});a.equal(old.baseMoves,c.index<=7?30:c.index<=13?25:20);a.equal(old.configVersion,6);a.deepEqual(L.configForRun({levelId:c.id,configVersion:c.id===2?5:3}),originals[c.id-1]);}
 for(const r of [{levelId:1,configVersion:99},{levelId:1,configVersion:5},{levelId:2,configVersion:3},{levelId:0,configVersion:7},{levelId:76,configVersion:7},{levelId:1.5,configVersion:7}])a.throws(()=>L.configForRun(r),/INVALID_CONFIG/);
});
test('an unfinished v6 run keeps every field and can continue after more moves than the restored budget',async()=>{
 const p=relaxedProfile(),r=p.activeRun;r.validSwaps=9;r.movesLeft=21;r.activeMs=4567;
 const storage=new Storage(),raw=envelope(p);storage.setItem(S.SAVE_KEY,raw);const store=new S.SaveStore({storage,locks}),loaded=await store.load();a.deepEqual(loaded,p);a.equal(S.validateProfile(loaded),true);a.equal(storage.getItem(S.SAVE_KEY),raw);
 const next=B.applyAction(loaded.activeRun,{type:'swap',...B.findLegalMoves(r.board)[0]},L.configForRun(r),loaded.inventory);a.ok(next.ok);a.equal(next.state.movesLeft,20);a.equal(next.state.configVersion,6);loaded.activeRun=next.state;
 a.equal((await store.commit(loaded)).ok,true);a.deepEqual(await new S.SaveStore({storage,locks}).load(),loaded);
 const finished=P.finalize(loaded,next.state,L.configForRun(next.state),'abandon').profile;
 const fresh=P.startRun(finished,B.createRun(L.LEVELS[0],77,finished.nextRunId));a.equal(fresh.activeRun.configVersion,7);a.equal(fresh.activeRun.initialMoves,4);a.equal(S.validateProfile(fresh),true);
});
test('v6 terminal runs settle using their original remaining ratio and points',async()=>{
 for(const phase of ['won','lost']){const p=relaxedProfile(),r=p.activeRun;Object.assign(r,{phase,sadness:phase==='won'?0:8,matchScore:500,score:phase==='won'?900:500,movesLeft:phase==='won'?20:0,validSwaps:phase==='won'?10:30});const expected=P.finalize(p,r,L.configForRun(r),phase==='won'?'win':'fail').profile;
 const storage=new Storage();storage.setItem(S.SAVE_KEY,envelope(p));const loaded=await new S.SaveStore({storage,locks}).load();a.deepEqual(loaded,expected);a.equal(loaded.lastResult.initialMoves,30);a.equal(loaded.lastResult.score,r.score);a.equal(loaded.lastResult.stars,phase==='won'?3:0);}
});
test('v6 corrupted budgets and checksums cannot become valid restored saves',async()=>{
 for(const mutate of [p=>{p.activeRun.initialMoves=4;p.activeRun.movesLeft=4;},p=>{p.activeRun.movesLeft++;}]){const p=relaxedProfile();mutate(p);a.equal(S.validateProfile(p),false);const storage=new Storage();storage.setItem(S.SAVE_KEY,envelope(p));a.equal((await new S.SaveStore({storage,locks}).load()).activeRun,null);}
 const p=relaxedProfile(),storage=new Storage(),bad=JSON.parse(envelope(p));bad.payload.activeRun.activeMs++;storage.setItem(S.SAVE_KEY,JSON.stringify(bad));storage.setItem(S.BACKUP_KEY,envelope(p));a.deepEqual(await new S.SaveStore({storage,locks}).load(),p);
});
test('v6 retained runs keep stale-writer protection and unknown configurations preserve original bytes',async()=>{
 const storage=new Storage();storage.setItem(S.SAVE_KEY,envelope(relaxedProfile()));const first=new S.SaveStore({storage,locks}),second=new S.SaveStore({storage,locks}),p=await first.load(),q=await second.load();p.activeRun.activeMs=300;a.equal((await first.commit(p)).ok,true);a.equal((await second.commit(q)).conflict,true);
 const unknown=relaxedProfile();unknown.activeRun.configVersion=88;const raw=envelope(unknown);storage.setItem(S.SAVE_KEY,raw);const blocked=new S.SaveStore({storage,locks});await blocked.load();a.equal(blocked.mode,'memory');a.equal((await blocked.commit(P.newProfile())).ok,false);a.equal(storage.getItem(S.SAVE_KEY),raw);
});
