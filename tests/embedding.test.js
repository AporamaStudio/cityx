import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULTS,SIZE} from '../src/config.js';
import {createCampaign,key,buildTower,removeTower,buildOutpost,removeOutpost,buildProduction,buildHousing,contentCells,productionQuote,housingQuote,economyBuildQuote,embeddingQuote,population,funds,inControl,inGroundControl,productionControlled,beginBattle,restoreNight,clearPlot,plotContent,demolitionQuote} from '../src/model.js';
function setup(kind='building',ruinType='production',people=20){
 const p={x:15,y:22,width:3,height:3,kind,ruinType},layout={width:SIZE,height:SIZE,camp:{x:15,y:27},blocks:[p],tiles:Array(SIZE*SIZE).fill('road')};
 const wave=[{x:10,y:10,hp:6,count:1,first:1,interval:2}];
 const s=createCampaign({...DEFAULTS,budget:1000,initialPopulation:people},[wave,wave,wave],layout);s.day=3;return s;
}
const id=key(15,22);
test('废墟嵌入一次完成清场与建炮，保留物理建筑；拆炮不自动补建经营',()=>{
 const s=setup(),cash=funds(s);assert.equal(buildTower(s,id,'A'),'');
 assert.equal(s.clearingWorkers,1);assert.equal(funds(s),cash-10);assert.equal(contentCells(s,id).length,8);assert.ok(s.blocked.has(id));
 assert.equal(buildProduction(s,id),'');assert.equal(productionQuote(s,id).area,8);assert.ok(s.blocked.has(id));
 const before=funds(s);assert.equal(removeTower(s,id),'');assert.equal(funds(s),before+10);assert.equal(productionQuote(s,id).area,8);
 const q=economyBuildQuote(s,id,'production');assert.equal(q.added,1);assert.equal(buildProduction(s,id),'');assert.equal(funds(s),before+10-q.cost);assert.equal(productionQuote(s,id).area,9);
});
test('完好住房改建人口与清场一起检查，失败不扣钱不改地图，允许恰好用尽空闲',()=>{
 const s=setup('building','housing',0);assert.equal(buildHousing(s,id),'');
 assert.equal(housingQuote(s,id).residents,5);s.clearingWorkers=4;
 const before=structuredClone(s);assert.match(buildTower(s,id,'A'),/人力不足/);assert.deepEqual(s,before);
 s.clearingWorkers=3;const q=embeddingQuote(s,id);assert.equal(q.residents,1);assert.equal(q.freeAfter,0);
 const cash=funds(s);assert.equal(buildTower(s,id,'A'),'');assert.equal(population(s).free,0);assert.equal(funds(s),cash-10+q.refund);assert.equal(housingQuote(s,id).residents,4);
});
test('建筑碰一格即整体可经营和驻扎前哨；炮位与经营独立占用',()=>{
 const s=setup();s.params.controlRadius=3;s.params.outpostRadius=1;const anchor=key(15,24);
 assert.ok(inGroundControl(s,anchor));assert.ok(!inGroundControl(s,id));assert.ok(inControl(s,id));
 assert.equal(buildProduction(s,anchor),'');assert.equal(buildTower(s,anchor,'A'),'');removeTower(s,anchor);
 assert.equal(buildOutpost(s,anchor),'');assert.ok(s.blocked.has(anchor));
 assert.equal(s.outposts.size,1);assert.match(buildOutpost(s,key(15,23)),/最多/);assert.ok(productionControlled(s,id));
 assert.equal(productionQuote(s,id).area,8);assert.equal(removeOutpost(s,anchor),'');assert.equal(productionQuote(s,id).area,8);
});
test('单用途保留、夜间禁清场，快照保存缺口；清空经营后可换用途并保留炮位',()=>{
 const s=setup();assert.equal(buildTower(s,id,'A'),'');assert.match(buildHousing(s,id),/生产废墟|其他设施/);
 const snap=beginBattle(s);const before=funds(s);assert.match(buildTower(s,key(16,22),'A'),/夜晚/);assert.equal(funds(s),before);
 const retry=restoreNight(snap);assert.equal(contentCells(retry,id).length,8);assert.equal(clearPlot(retry,key(16,22)),'');assert.equal(plotContent(retry,id).type,null);assert.ok(retry.towers.has(id));assert.equal(buildHousing(retry,id),'');assert.equal(housingQuote(retry,id).residents,4);
});
test('街区中心禁止嵌入与前哨，临外部道路可建；空地中心仍可放炮',()=>{
 const s=setup(),center=key(16,23),before=structuredClone(s);
 assert.match(buildTower(s,center,'A'),/边缘/);assert.deepEqual(s,before);
 assert.match(buildOutpost(s,center),/边缘/);assert.deepEqual(s,before);
 assert.equal(buildTower(s,id,'A'),'');
 const open=setup('open');assert.equal(buildTower(open,center,'A'),'');assert.match(buildOutpost(open,key(16,23)),/设施/);
 removeTower(open,center);assert.match(buildOutpost(open,center),/边缘/);
});
test('内部缺口不产生嵌入边缘，紧邻建筑接缝与不连通外侧不算入口',()=>{
 const s=setup(),center=key(16,23),plot=plotContent(s,id);
 plot.cells=new Set(contentCells(s,id).filter(cell=>cell!==key(16,22)));
 // 模拟留下的空位；中心仍在固定街区内部。
 assert.match(buildTower(s,center,'A'),/边缘/);
 const edge=key(15,23),outside=key(14,23);
 s.terrainWalls.add(outside);assert.match(buildTower(s,edge,'A'),/边缘/);
 s.terrainWalls.delete(outside);s.field.distance.delete(outside);assert.match(buildTower(s,edge,'A'),/边缘/);
});

test('跨天补建仅新增投资全返，旧格维持半返；局部拆改使用对应格投入日期',()=>{
 const s=setup(),corner=id;assert.equal(buildTower(s,corner,'A'),'');assert.equal(buildProduction(s,id),'');
 const oldCost=s.production.get(id).cost;s.day=4;removeTower(s,corner);
 const q=economyBuildQuote(s,id,'production');assert.equal(buildProduction(s,id),'');
 assert.equal(demolitionQuote(s,id).refund,Math.floor(oldCost*.5)+q.cost);
 assert.equal(embeddingQuote(s,corner).refund,q.cost);
 const oldCell=key(17,22),entry=s.production.get(id).paid.get(oldCell);
 assert.equal(embeddingQuote(s,oldCell).refund,Math.floor(entry.cost*.5));
});
