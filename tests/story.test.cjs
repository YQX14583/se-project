'use strict';
const {test}=require('node:test');
const a=require('node:assert/strict');
const {LEVELS}=require('../.test-build/domain/levels');
const {LEVEL_STORY,storyTitle}=require('../.test-build/domain/story');

test('every delivered level has one unique short diary title in its own chapter',()=>{
 a.equal(LEVEL_STORY.length,5);
 a.deepEqual(LEVEL_STORY.map(chapter=>chapter.length),[15,15,15,15,15]);
 const titles=LEVEL_STORY.flat();
 a.equal(new Set(titles).size,75);
 for(const level of LEVELS){
  const title=storyTitle(level.id);
  a.equal(title,LEVEL_STORY[level.chapter-1][level.index-1]);
  a.match(title,/^[\u4e00-\u9fff]+$/u);
  a.ok(Array.from(title).length>=6&&Array.from(title).length<=16,`${level.id}: ${title}`);
 }
});

test('chapter boundaries preserve a struggle followed by a small emotional shift',()=>{
 const boundaries=[
  [1,'今晚又睡不着了',15,'今晚先陪自己躺一会'],
  [16,'那个位置空下来了',30,'我也值得被自己惦记'],
  [31,'为什么他们不理解我',45,'这一次我听见自己了'],
  [46,'我还是会想起那件事',60,'我可以带着遗憾往前'],
  [61,'那封信我还没写完',75,'今晚先走到这里吧'],
 ];
 for(const [first,opening,last,closing] of boundaries){
  a.equal(storyTitle(first),opening);
  a.equal(storyTitle(last),closing);
 }
 a.equal(storyTitle(32),'感觉压力好大');
});

test('invalid level identifiers never leak a neighbouring chapter title',()=>{
 for(const id of [-Infinity,-1,0,0.5,1.5,15.5,75.5,76,Infinity,NaN])a.equal(storyTitle(id),'');
});
