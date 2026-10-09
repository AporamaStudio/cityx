import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULTS,SIZE} from '../src/config.js';
import {createCampaign,key,buildOutpost,removeOutpost,outpostRemovalPreview,rawControlMask,controlMask,buildProduction,productionActive,validateParams,funds,beginBattle,restoreNight} from '../src/model.js';

function setup(blocks=[],params={}){
 const layout={width:SIZE,height:SIZE,camp:{x:15,y:25},blocks,tiles:Array(SIZE*SIZE).fill('road')};
 const wave=[{x:10,y:3,hp:6,count:1,first:1,interval:2}];
 const s=createCampaign({...DEFAULTS,budget:1000,...params},[wave,wave,wave],layout);s.day=3;return s;
}
function chain(s,xs,y=25){for(const x of xs)assert.equal(buildOutpost(s,key(x,y)),'');}

test('保留远端塔及生产时禁止拆断连接；预览和失败操作不改变任何状态',()=>{
 const s=setup([{x:39,y:25,width:2,height:2,kind:'building',ruinType:'production'}]);
 chain(s,[24,30,36]);assert.equal(buildProduction(s,key(39,25)),'');
 const before=structuredClone(s),preview=outpostRemovalPreview(s,key(30,25));
 assert.match(preview.error,/失去与篝火的连接/);assert.ok(preview.disconnected.size>0);
 assert.ok(preview.disconnected.has(key(36,25)));assert.ok(!preview.disconnected.has(s.camp));assert.deepEqual(s,before);
 assert.equal(removeOutpost(s,key(30,25)),preview.error);assert.deepEqual(s,before);assert.ok(productionActive(s,key(39,25)));
});

test('末端缩圈允许拆除并当天退款；补上另一连接后允许拆旧连接塔',()=>{
 const s=setup();chain(s,[24,30,36]);
 const cash=funds(s),before=rawControlMask(s).size;
 assert.equal(removeOutpost(s,key(36,25)),'');assert.equal(funds(s),cash+25);assert.ok(rawControlMask(s).size<before);
 assert.equal(removeOutpost(s,key(30,25)),'');
 const alternative=setup();chain(alternative,[24,30,36]);
 assert.equal(buildOutpost(alternative,key(30,29)),'');assert.equal(outpostRemovalPreview(alternative,key(30,25)).error,'');
 assert.equal(removeOutpost(alternative,key(30,25)),'');assert.ok(alternative.outposts.has(key(36,25)));
});

test('两塔各触同一建筑一格，整栋归属不能跨越基础覆盖之间的空隙',()=>{
 const s=setup([{x:30,y:23,width:7,height:1,kind:'building',ruinType:'production'}]);
 chain(s,[24,30,36,42],22);
 const posts=new Map(s.outposts);posts.delete(key(30,22));posts.delete(key(36,22));const candidate={...s,outposts:posts};
 const raw=rawControlMask(candidate),final=controlMask(candidate);
 assert.ok(raw.has(key(30,23)));assert.ok(raw.has(key(36,23)));assert.ok(!raw.has(key(33,23)));assert.ok(final.has(key(33,23)));
 assert.match(removeOutpost(s,key(36,22)),/失去与篝火的连接/);
});

test('覆盖范围相接不能代替塔落点覆盖，墙和建筑不阻断有效连接',()=>{
 const s=setup();chain(s,[24,30,36]);
 assert.match(removeOutpost(s,key(30,25)),/失去与篝火的连接/);
 assert.match(removeOutpost(s,key(24,25)),/失去与篝火的连接/);
 const edge=setup([{x:27,y:25,width:1,height:1,kind:'building'}]);
 chain(edge,[24,30]);edge.playerWalls.add(key(26,25));
 assert.equal(buildOutpost(edge,key(24,29)),'');
 assert.equal(removeOutpost(edge,key(24,25)),'');
});

test('建造不能借失联塔或孤立闭环继续扩张',()=>{
 const s=setup();chain(s,[24,30,36,40]);s.outposts.delete(key(24,25));
 const before=structuredClone(s);
 assert.match(buildOutpost(s,key(44,25)),/落点须被篝火/);assert.deepEqual(s,before);
});

test('远端塔互相覆盖的闭环也必须连接篝火；重试保留拆除约束',()=>{
 const s=setup();chain(s,[24,30,36,40]);
 const retry=restoreNight(beginBattle(s));assert.match(removeOutpost(retry,key(30,25)),/失去与篝火的连接/);
 assert.ok(retry.outposts.has(key(36,25)));assert.ok(retry.outposts.has(key(40,25)));
});

test('缩小参数导致孤岛时拒绝，即使每座瞭望塔都能覆盖自己',()=>{
 const s=setup();chain(s,[24,30]);
 assert.equal(validateParams(s.params,s),'');assert.match(validateParams({...s.params,controlRadius:1},s),/失去与篝火的连接/);
});
