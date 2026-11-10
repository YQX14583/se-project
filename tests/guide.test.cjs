'use strict';
const {test}=require('node:test');
const a=require('node:assert/strict');
const {GUIDE_PAGES}=require('../.test-build/domain/guide');
const {LEVELS}=require('../.test-build/domain/levels');
const {createRun,applyAction}=require('../.test-build/domain/board');
const {previewTool}=require('../.test-build/domain/feedback');
const {newProfile,startRun,finalize}=require('../.test-build/platform/progress');
const copy=GUIDE_PAGES.map(page=>page.body).join('\n');

test('six short readable notes cover the guide without repeating a heading',()=>{
 a.equal(GUIDE_PAGES.length,6);
 a.equal(new Set(GUIDE_PAGES.map(page=>page.title)).size,6);
 for(const page of GUIDE_PAGES){
  a.ok(page.title.length>0&&page.title.length<=16);
  a.ok(page.body.length>0&&Array.from(page.body).length<=160,`${page.title}: ${page.body.length}`);
 }
 a.match(copy,/3个或更多同色/);
 a.match(copy,/心事归零/);
 for(const goal of ['共鸣','散云','连锁'])a.ok(copy.includes(goal));
 a.match(copy,/2波及以上.*1次连锁/);
});

test('the stated help allowance and free-step rule agree with real rounds',()=>{
 const allowance=Number(copy.match(/最多使用(\d+)次/)?.[1]);
 a.equal(allowance,2);
 a.doesNotMatch(copy,/最多获得2次/);
 a.match(copy,/不扣步数/);
 const config=LEVELS[0],stock={breathe:0,hug:0,resonate:0,shuffle:5};
 let run=createRun(config,81,1);
 for(let i=0;i<allowance;i++){
  const next=applyAction(run,{type:'tool',tool:'shuffle'},config,stock);
  a.equal(next.ok,true);
  a.equal(next.state.movesLeft,run.movesLeft);
  run=next.state;
 }
 a.equal(applyAction(run,{type:'tool',tool:'shuffle'},config,stock).code,'TOOL_LIMIT');
 a.match(copy,/预览范围.*确认后才使用/s);
 a.match(copy,/换气先.*可重排/s);
});

test('all four help descriptions match their distinct preview footprints',()=>{
 const board=Array.from({length:49},(_,i)=>({kind:'tile',color:i%4}));
 board[24]={kind:'cloud',hp:3};
 a.match(copy,/深呼吸.*1个小物/);
 a.deepEqual(previewTool(board,'breathe',0),[0]);
 a.match(copy,/拥抱.*3×3.*边缘/s);
 a.equal(previewTool(board,'hug',24).length,8);
 a.equal(previewTool(board,'hug',0).length,4);
 a.match(copy,/共鸣.*整盘同色/s);
 a.equal(previewTool(board,'resonate',0).length,12);
 a.match(copy,/换气.*云朵留在原地/s);
 a.equal(previewTool(board,'shuffle').length,48);
 a.match(copy,/云朵.*上下左右.*3次/s);
});

test('notes describe inventory settlement and gentle mode without promising extra rewards',()=>{
 a.match(copy,/过关才扣除已用库存/);
 a.match(copy,/失败或放弃这一局.*还给你/s);
 a.match(copy,/同一小关连续失败3次/);
 a.match(copy,/主动放弃不算失败/);
 const config=LEVELS[0],normal=createRun(config,81,1),gentle=createRun(config,81,2,true);
 const bonus=Number(copy.match(/多给(\d+)步/)?.[1]);
 a.equal(gentle.initialMoves-normal.initialMoves,bonus);
 const limit=Number(copy.match(/最多记(\d+)颗星/)?.[1]);
 gentle.phase='won';gentle.sadness=0;
 const result=finalize(startRun(newProfile(),gentle),gentle,config,'win').result;
 a.equal(result.stars,limit);
 const abandoned=finalize(startRun(newProfile(),normal),normal,config,'abandon').profile;
 a.equal(abandoned.levels[config.id].consecutiveFailures,0);
});

test('rest and local-save notes explain their practical boundaries',()=>{
 a.match(copy,/暂停.*琴声和雨声.*继续/s);
 a.match(copy,/这台电脑.*这个浏览器/s);
 a.match(copy,/清除浏览器数据会丢失进度/);
 a.match(copy,/临时会话.*关闭页面.*不会保存/s);
});
