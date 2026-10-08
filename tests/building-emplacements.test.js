import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULTS,SIZE} from '../src/config.js';
import {key,createCampaign,buildTower,removeTower,clearPlot,buildingCells,towerCapacity,enemyAction,repairQuote} from '../src/model.js';
const origin=key(15,22);
function setup(kind='building'){
 const block={x:15,y:22,width:3,height:3,kind,ruinType:'production'},layout={width:SIZE,height:SIZE,camp:{x:15,y:27},blocks:[block],tiles:Array(SIZE*SIZE).fill('road')};
 const wave=[{x:10,y:10,hp:6,count:1,first:1,interval:2}];
 const s=createCampaign({...DEFAULTS,budget:1000,initialPopulation:30},[wave,wave,wave],layout);s.day=3;return s;
}
test('建筑炮位排除道路、空地、内部格；容量与物理占地保持稳定',()=>{
 const s=setup(),footprint=buildingCells(s,origin),paths=structuredClone(s.attacks);
 assert.match(buildTower(s,key(14,22),'A'),/建筑实体/);assert.match(buildTower(setup('open'),origin,'A'),/建筑实体/);
 assert.match(buildTower(s,key(16,23),'A'),/边缘/);
 for(const id of [origin,key(16,22),key(17,22)])assert.equal(buildTower(s,id,'A'),'');
 assert.deepEqual(towerCapacity(s,origin),{used:3,max:3});assert.match(buildTower(s,key(15,23),'A'),/容量已满/);
 assert.deepEqual(buildingCells(s,origin),footprint);assert.deepEqual(s.attacks,paths);assert.match(clearPlot(s,key(16,23)),/先拆除炮塔/);
 assert.equal(removeTower(s,origin),'');assert.equal(buildTower(s,key(15,23),'A'),'');
});
test('建筑炮位不受邻接攻击且无维修报价',()=>{
 const s=setup();assert.equal(buildTower(s,origin,'A'),'');
 const enemy={id:key(14,22),path:[key(14,22),key(14,23),key(14,24)],target:s.camp};
 assert.deepEqual(enemyAction(s,enemy),{to:key(14,23)});assert.equal(repairQuote(s,origin).missing,0);
});

test('瞭望塔仅用地面控制、保持通行与路径、遵守欧氏间距',async()=>{
 const {buildOutpost,outpostError,inGroundControl,terrainTraversable,changeWall,validateSources}=await import('../src/model.js');
 const s=setup(),paths=structuredClone(s.attacks),walls=new Set(s.terrainWalls),id=key(14,25);
 assert.match(outpostError(s,origin),/可通行/);assert.ok(inGroundControl(s,id));assert.equal(buildOutpost(s,id),'');
 assert.match(changeWall(s,id),/瞭望塔/);assert.match(validateSources([{x:14,y:25,hp:6,count:1,first:1,interval:2}],s),/瞭望塔/);
 assert.ok(terrainTraversable(s,id));assert.deepEqual(s.terrainWalls,walls);assert.deepEqual(s.attacks,paths);
 assert.match(buildOutpost(s,key(15,25)),/间距/);assert.equal(buildOutpost(s,key(18,25)),'');
 const remote=key(30,30);assert.match(buildOutpost(s,remote),/控制/);
 assert.deepEqual(towerCapacity(s,origin),{used:0,max:3});
});

test('夜间架炮默认只加倍金币，拆返按白天基价，重试撤销加急支出',async()=>{
 const {beginBattle,restoreNight,funds,embeddingQuote,demolitionQuote,enterMorning}=await import('../src/model.js');
 const s=setup();s.day=1;const snapshot=beginBattle(s),before=funds(s);
 assert.equal(embeddingQuote(s,origin).labor,1);assert.equal(buildTower(s,origin,'A'),'');assert.equal(funds(s),before-20);assert.equal(s.clearingWorkers,1);
 assert.equal(demolitionQuote(s,origin).refund,10);s.phase='won';enterMorning(s);assert.equal(s.clearingWorkers,0);
 assert.equal(demolitionQuote(s,origin).refund,5);removeTower(s,origin);assert.equal(funds(s),before-15);
 const retry=restoreNight(snapshot);assert.equal(funds(retry),before);assert.equal(retry.nightBuildSpent,0);
 const poor=setup();poor.phase='battle';poor.debugPopulation=-30;const saved=structuredClone(poor);
 assert.match(buildTower(poor,origin,'A'),/人力不足/);assert.deepEqual(poor,saved);
 poor.debugPopulation=-29;assert.equal(buildTower(poor,origin,'A'),'');assert.equal(poor.clearingWorkers,1);
 assert.match(buildTower(poor,key(16,22),'A'),/人力不足/);
 poor.debugPopulation=0;poor.params.nightTowerCostMultiplier=1.5;poor.params.nightClearingLaborMultiplier=1.5;
 assert.equal(embeddingQuote(poor,key(16,22)).labor,2);const cash=funds(poor);assert.equal(buildTower(poor,key(16,22),'A'),'');assert.equal(funds(poor),cash-15);assert.equal(poor.clearingWorkers,3);
});
