import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULTS,SIZE} from '../src/config.js';
import {createCampaign,key,buildTower,removeTower,buildOutpost,removeOutpost,buildProduction,buildHousing,contentCells,productionQuote,housingQuote,economyBuildQuote,embeddingQuote,population,funds,inControl,beginBattle,restoreNight,clearPlot,plotContent} from '../src/model.js';
function setup(kind='building',ruinType='production',people=20){
 const p={x:15,y:22,width:3,height:3,kind,ruinType},layout={width:SIZE,height:SIZE,camp:{x:15,y:27},blocks:[p],tiles:Array(SIZE*SIZE).fill('road')};
 const wave=[{x:10,y:10,hp:6,count:1,first:1,interval:2}];
 const s=createCampaign({...DEFAULTS,budget:1000,initialPopulation:people},[wave,wave,wave],layout);s.day=3;return s;
}
const id=key(15,22);
test('废墟嵌入一次完成清场与建炮，剩余经营绕开炮位；拆炮不自动补建',()=>{
 const s=setup(),cash=funds(s);assert.equal(buildTower(s,id,'A'),'');
 assert.equal(s.clearingWorkers,1);assert.equal(funds(s),cash-10);assert.equal(contentCells(s,id).length,8);assert.ok(!s.blocked.has(id));
 assert.equal(buildProduction(s,id),'');assert.equal(productionQuote(s,id).area,8);assert.ok(!s.blocked.has(id));
 const before=funds(s);assert.equal(removeTower(s,id),'');assert.equal(funds(s),before+5);assert.equal(productionQuote(s,id).area,8);
 const q=economyBuildQuote(s,id,'production');assert.equal(q.added,1);assert.equal(buildProduction(s,id),'');assert.equal(funds(s),before+5-q.cost);assert.equal(productionQuote(s,id).area,9);
});
test('完好住房改建人口与清场一起检查，失败不扣钱不改地图，允许恰好用尽空闲',()=>{
 const s=setup('building','housing',0);assert.equal(buildHousing(s,id),'');
 assert.equal(housingQuote(s,id).residents,5);s.clearingWorkers=4;
 const before=structuredClone(s);assert.match(buildTower(s,id,'A'),/人力不足/);assert.deepEqual(s,before);
 s.clearingWorkers=3;const q=embeddingQuote(s,id);assert.equal(q.residents,1);assert.equal(q.freeAfter,0);
 const cash=funds(s);assert.equal(buildTower(s,id,'A'),'');assert.equal(population(s).free,0);assert.equal(funds(s),cash-10+q.refund);assert.equal(housingQuote(s,id).residents,4);
});
test('街区局部受控可嵌入炮塔与前哨，经营仍需整块受控；前哨与经营共存且只占一格',()=>{
 const s=setup();s.params.controlRadius=3;s.params.outpostRadius=1;const anchor=key(15,24);
 assert.ok(inControl(s,anchor));assert.ok(!inControl(s,id));assert.match(buildProduction(s,anchor),/控制/);
 assert.equal(buildTower(s,anchor,'A'),'');removeTower(s,anchor);assert.equal(buildOutpost(s,anchor),'');assert.ok(s.blocked.has(anchor));
 assert.equal(s.outposts.size,1);assert.match(buildOutpost(s,key(15,23)),/最多/);assert.match(buildProduction(s,id),/控制/);
 s.params.controlRadius=9;assert.equal(buildProduction(s,id),'');assert.equal(productionQuote(s,id).area,8);assert.equal(removeOutpost(s,anchor),'');assert.equal(productionQuote(s,id).area,8);
});
test('单用途保留、夜间禁清场，快照保存缺口；清空经营后可换用途并保留炮位',()=>{
 const s=setup();assert.equal(buildTower(s,id,'A'),'');assert.match(buildHousing(s,id),/生产废墟|其他设施/);
 const snap=beginBattle(s);const before=funds(s);assert.match(buildTower(s,key(16,22),'A'),/夜晚/);assert.equal(funds(s),before);
 const retry=restoreNight(snap);assert.equal(contentCells(retry,id).length,8);assert.equal(clearPlot(retry,key(16,22)),'');assert.equal(plotContent(retry,id).type,null);assert.ok(retry.towers.has(id));assert.equal(buildHousing(retry,id),'');assert.equal(housingQuote(retry,id).residents,4);
});
