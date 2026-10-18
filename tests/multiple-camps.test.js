import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULTS,SIZE} from '../src/config.js';
import {key,createCampaign,buildCamp,campBuildError,campRecord,allCamps,livingCamps,rawControlMask,civilizationMask,buildingStatus,buildHousing,population,funds,lockAttacks,forecastAttacks,beginBattle,restoreNight,stepBattle,enterMorning,repairFacility,upgradeCamp,campUpgradeQuote,repairQuote,routeTimingReport,revealControl} from '../src/model.js';
function setup(hp=6,count=1){
 const wave=[{x:35,y:25,hp,count,first:1,interval:20}];
 const blocks=[{x:8,y:24,width:2,height:2,kind:'building',ruinType:'housing'}];
 const s=createCampaign({...DEFAULTS,budget:2000},Array.from({length:6},()=>wave),{width:SIZE,height:SIZE,camp:{x:15,y:25},blocks,tiles:Array(SIZE*SIZE).fill('road')});s.day=3;return s;
}
test('新篝火只扩文明不送控制，当晚目标不变，下一晚按可达路程选最近火光',()=>{
 const s=setup(),id=key(22,25),before=structuredClone(s.attacks),control=rawControlMask(s),cash=funds(s);
 assert.equal(buildCamp(s,id),'');assert.equal(allCamps(s).length,2);assert.equal(funds(s),cash-80);assert.deepEqual(rawControlMask(s),control);assert.deepEqual(s.attacks,before);
 assert.equal(forecastAttacks(s,4)[0].target,id);assert.equal(forecastAttacks(s,3)[0].target,s.camp);
 assert.ok(civilizationMask(s).size>=civilizationMask(setup()).size);assert.ok(routeTimingReport(s).farthest);assert.equal(s.sources[0].count,1);
 s.day=4;lockAttacks(s);const snapshot=beginBattle(s);while(s.phase==='battle')stepBattle(s);
 assert.equal(s.hp,30);assert.equal(campRecord(s,id).hp,24);assert.equal(s.leaked,6);assert.equal(s.earned,0);
 const retry=restoreNight(snapshot);assert.equal(campRecord(retry,id).hp,30);assert.equal(funds(retry),cash-80);assert.equal(retry.attacks[0].target,id);
});
test('单座熄灭只暂停本区，保留居民与升级，剩余火光仍可守夜和恢复',()=>{
 const s=setup(40,2),id=key(22,25);buildHousing(s,key(8,24));const people=population(s).total;assert.equal(upgradeCamp(s),'');assert.equal(buildCamp(s,id),'');
 s.day=4;lockAttacks(s);beginBattle(s);while(s.phase==='battle')stepBattle(s);
 assert.notEqual(s.phase,'lost');assert.equal(campRecord(s,id).hp,0);assert.equal(s.hp,30);assert.equal(s.prevented,1);assert.equal(s.earned,0);assert.equal(population(s).total,people);assert.equal(s.result,null);
 assert.equal(enterMorning(s),true);const q=repairQuote(s,id);assert.equal(q.restore,30);assert.equal(repairFacility(s,id),'');assert.equal(campRecord(s,id).hp,30);
 const cost=campUpgradeQuote(s,id).cost;assert.equal(upgradeCamp(s,id),'');assert.equal(campRecord(s,id).level,1);assert.equal(s.campLevel,1);assert.equal(cost,40);
});
test('主火光熄灭不结束全局，重叠接替保留控制与居民，全部熄灭才失败',()=>{
 const s=setup(),id=key(22,25);buildHousing(s,key(8,24));buildCamp(s,id);const people=population(s).total;
 s.hp=0;revealControl(s);assert.equal(livingCamps(s).length,1);assert.ok(rawControlMask(s).size);assert.equal(population(s).total,people);assert.equal(buildingStatus(s,key(8,24)),'repaired');assert.equal(s.result,null);
 s.day=4;lockAttacks(s);assert.ok(beginBattle(s));s.extraCamps.get(id).hp=0;stepBattle(s);assert.equal(s.phase,'lost');assert.equal(s.result.type,'campLost');
});
test('拒绝区外、障碍、重叠及资金不足，失败不花钱也不增加火光',()=>{
 const s=setup(),before=structuredClone(s);for(const id of [key(0,0),s.camp,key(8,24),key(50,50)])assert.ok(buildCamp(s,id));assert.deepEqual(s,before);
 s.debugGold-=funds(s);assert.match(campBuildError(s,key(22,25)),/资金不足/);assert.equal(allCamps(s).length,1);
});
