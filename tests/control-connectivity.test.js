import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULTS,SIZE} from '../src/config.js';
import {createCampaign,population,buildHousing,removeHousing,buildTower,applyTestScenario,key,buildOutpost,removeOutpost,outpostRemovalPreview,rawControlMask,controlMask,buildProduction,productionActive,validateParams,funds,beginBattle,restoreNight} from '../src/model.js';

function setup(blocks=[],params={}){
 const layout={width:SIZE,height:SIZE,camp:{x:15,y:25},blocks,tiles:Array(SIZE*SIZE).fill('road')};
 const wave=[{x:10,y:3,hp:6,count:1,first:1,interval:2}];
 const s=createCampaign({...DEFAULTS,budget:1000,...params},[wave,wave,wave],layout);s.day=3;return s;
}
function chain(s,xs,y=25){for(const x of xs)assert.equal(buildOutpost(s,key(x,y)),'');}

test('保留远端塔及生产时禁止拆断连接；预览和失败操作不改变任何状态',()=>{
 const s=setup([{x:39,y:25,width:2,height:2,kind:'building',ruinType:'production'}]);
 chain(s,[24,29,34]);assert.equal(buildProduction(s,key(39,25)),'');
 const before=structuredClone(s),preview=outpostRemovalPreview(s,key(29,25));
 assert.match(preview.error,/失去与净化塔的连接/);assert.ok(preview.disconnected.size>0);
 assert.ok(preview.disconnected.has(key(34,25)));assert.ok(!preview.disconnected.has(s.camp));assert.deepEqual(s,before);
 assert.equal(removeOutpost(s,key(29,25)),preview.error);assert.deepEqual(s,before);assert.equal(productionActive(s,key(39,25)),false);
});

test('末端缩圈允许拆除并当天退款；补上另一连接后允许拆旧连接塔',()=>{
 const s=setup();chain(s,[24,29,34]);
 const cash=funds(s),before=rawControlMask(s).size;
 assert.equal(removeOutpost(s,key(34,25)),'');assert.equal(funds(s),cash+25);assert.ok(rawControlMask(s).size<before);
 assert.equal(removeOutpost(s,key(29,25)),'');
 const alternative=setup();chain(alternative,[24,29,34]);
 assert.equal(buildOutpost(alternative,key(29,27)),'');assert.equal(outpostRemovalPreview(alternative,key(29,25)).error,'');
 assert.equal(removeOutpost(alternative,key(29,25)),'');assert.ok(alternative.outposts.has(key(34,25)));
});

test('两片独立联网范围各触同栋建筑，建筑归属不能填平基础覆盖空隙',()=>{
 const s=setup([{x:29,y:23,width:9,height:1,kind:'building'}],{controlRadius:1});s.camp=key(23,21);s.extraCamps.set(key(41,21),{hp:30,level:0,day:0});s.outposts=new Map([[key(24,22),{}],[key(42,22),{}]]);
 const raw=rawControlMask(s),final=controlMask(s);assert.ok(raw.has(key(29,23)));assert.ok(raw.has(key(37,23)));assert.ok(!raw.has(key(33,23)));assert.ok(final.has(key(33,23)));
});

test('覆盖范围相接不能代替塔落点覆盖，墙和建筑不阻断有效连接',()=>{
 const s=setup();chain(s,[24,29,34]);
 assert.match(removeOutpost(s,key(29,25)),/失去与净化塔的连接/);
 assert.match(removeOutpost(s,key(24,25)),/失去与净化塔的连接/);
 const edge=setup([{x:27,y:25,width:1,height:1,kind:'building'}]);
 chain(edge,[24,29]);edge.playerWalls.add(key(26,25));
 assert.equal(buildOutpost(edge,key(24,27)),'');
 assert.equal(removeOutpost(edge,key(24,25)),'');
});

test('建造不能借失联塔或孤立闭环继续扩张',()=>{
 const s=setup();chain(s,[24,29,34,39]);s.outposts.delete(key(24,25));
 const before=structuredClone(s);
 assert.match(buildOutpost(s,key(44,25)),/落点须被净化塔/);assert.deepEqual(s,before);
});

test('远端塔互相覆盖的闭环也必须连接篝火；重试保留拆除约束',()=>{
 const s=setup();chain(s,[24,29,34,39]);
 const retry=restoreNight(beginBattle(s));assert.match(removeOutpost(retry,key(29,25)),/失去与净化塔的连接/);
 assert.ok(retry.outposts.has(key(34,25)));assert.ok(retry.outposts.has(key(39,25)));
});

test('缩小参数导致孤岛时拒绝，即使每座瞭望塔都能覆盖自己',()=>{
 const s=setup();chain(s,[24,29]);
 assert.equal(validateParams(s.params,s),'');assert.match(validateParams({...s.params,controlRadius:1},s),/控制范围|失去与净化塔的连接/);
});

test('机械塔不占用人口，零工人也可联网建造，重试与拆除不改变用工',()=>{
 const s=setup([],{initialPopulation:0});assert.equal(buildOutpost(s,key(24,25)),'');assert.equal(buildOutpost(s,key(26,25)),'');assert.deepEqual(population(s),{total:0,working:0,free:0});
 const retry=restoreNight(beginBattle(s));assert.deepEqual(population(retry),population(s));assert.equal(removeOutpost(retry,key(26,25)),'');assert.equal(applyTestScenario(retry,3,1000,0),'');
});

test('经营用工仍约束住房拆除，机械塔不占用多余工人',()=>{
 const s=setup([{x:17,y:27,width:2,height:2,kind:'building',ruinType:'housing'},
 {x:20,y:27,width:2,height:2,kind:'building',ruinType:'production'}],{initialPopulation:0,housingCellsPerResident:1,productionCellsPerWorker:2});
 assert.equal(buildHousing(s,key(17,27)),'');assert.equal(buildProduction(s,key(20,27)),'');
 assert.equal(buildOutpost(s,key(24,25)),'');assert.equal(buildOutpost(s,key(26,25)),'');assert.equal(population(s).free,2);
 const before=structuredClone(s);assert.match(removeHousing(s,key(17,27)),/依赖/);assert.deepEqual(s,before);
 assert.equal(buildTower(s,key(17,27),'A'),'');assert.equal(population(s).free,1);
});

test('默认最小间距2格，间距不足拒建，等于2格可建',()=>{
 const s=setup();assert.equal(s.params.outpostMinDistance,2);assert.equal(buildOutpost(s,key(24,25)),'');
 assert.match(buildOutpost(s,key(25,25)),/间距/);assert.equal(buildOutpost(s,key(26,25)),'');
});
