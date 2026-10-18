import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULTS,SIZE} from '../src/config.js';
import {createCampaign,campUpgradeError,campUpgradeQuote,campUpgradeCandidate,upgradeCamp,buildHousing,buildProduction,restoreBank,bankFinance,revealControl,buildingStatus,housingResidents,expectedIncome,beginBattle,restoreNight,settleEconomy,key,rawControlMask,controlMask,civilizationMask,civilizationCoverage,buildingCivilized,visionField,funds,population,validateParams} from '../src/model.js';

test('起步瞭望塔提供控制；只保留篝火文明覆盖不能获得施工权限',()=>{
 const s=createCampaign(),before=funds(s);assert.ok(s.outposts.get(s.camp).starter);assert.equal(before,DEFAULTS.budget);assert.equal(population(s).free,DEFAULTS.initialPopulation);
 assert.ok(rawControlMask(s).size);s.outposts.clear();assert.equal(rawControlMask(s).size,0);assert.ok(civilizationCoverage(s,s.camp));assert.equal(civilizationMask(s).size,0);
});
test('文明地面是控制与覆盖交集，夜间只改变视野，半径调整不改变控制',()=>{
 const s=createCampaign(),ground=rawControlMask(s),controlled=controlMask(s);s.params.campCivilRadius=2;
 const civil=civilizationMask(s);assert.ok(civil.size<controlled.size);assert.ok([...civil].every(id=>controlled.has(id)));assert.deepEqual(rawControlMask(s),ground);
 s.phase='battle';assert.deepEqual(civilizationMask(s),civil);assert.ok(visionField(s).size>controlled.size);
 assert.match(validateParams({...s.params,campCivilRadius:0},s,false),/文明半径/);
});
test('完好或废墟的文明资格统一按整栋中心，远端角落接触不激活整栋',()=>{
 const s=createCampaign();s.params.campCivilRadius=1;assert.equal(buildingCivilized(s,key(11,24)),false);
 s.params.campCivilRadius=10;assert.equal(buildingCivilized(s,key(11,24)),true);
});

function district(){
 const blocks=[{x:17,y:24,width:2,height:2,kind:'building',ruinType:'housing'},{x:19,y:24,width:2,height:2,kind:'building',ruinType:'production'},{x:17,y:27,width:2,height:2,kind:'building',role:'bank'}];
 const s=createCampaign({...DEFAULTS,budget:1000,campCivilRadius:1},undefined,{width:SIZE,height:SIZE,camp:{x:15,y:25},blocks,tiles:Array(SIZE*SIZE).fill('road')});s.day=3;return s;
}
test('建筑三态、首次入住与失去文明后的保留，重连不重复增加人口',()=>{
 const s=district(),home=key(17,24),factory=key(19,24),people=population(s).total;
 assert.equal(buildingStatus(s,home),'ruin');assert.equal(buildHousing(s,home),'');assert.equal(buildProduction(s,factory),'');
 assert.equal(buildingStatus(s,home),'repaired');assert.equal(population(s).total,people);assert.equal(expectedIncome(s),0);
 s.params.campCivilRadius=10;revealControl(s);const admitted=population(s).total;assert.ok(admitted>people);assert.equal(buildingStatus(s,home),'civilized');assert.ok(expectedIncome(s)>0);
 const working=population(s).working;s.params.campCivilRadius=1;revealControl(s);assert.equal(population(s).total,admitted);assert.equal(population(s).working,working);assert.equal(buildingStatus(s,home),'repaired');assert.equal(expectedIncome(s),0);
 s.params.campCivilRadius=10;revealControl(s);assert.equal(population(s).total,admitted);assert.equal(housingResidents(s,home),2);
 const retry=restoreNight(beginBattle(s));assert.equal(population(retry).total,admitted);assert.equal(buildingStatus(retry,home),'civilized');
});
test('银行可提前修复，文明接入才授信，停业不丢投资和债务',()=>{
 const s=district(),bank=key(17,27);assert.equal(restoreBank(s,bank),'');assert.equal(bankFinance(s).capacity,0);
 s.params.campCivilRadius=10;revealControl(s);assert.equal(bankFinance(s).capacity,100);
 s.debugGold-=funds(s)+20;s.debtInterestCap=100;s.params.campCivilRadius=1;revealControl(s);
 assert.equal(bankFinance(s).capacity,0);assert.equal(bankFinance(s).interest,-2);assert.ok(s.banks.has(bank));assert.equal(buildingStatus(s,bank),'repaired');
});

test('文明边界不切开整栋建筑，生活与边界参数仅改变表现',()=>{
 const s=district();s.params.campCivilRadius=1;const absent=civilizationMask(s);assert.ok(!absent.has(key(17,24)));
 s.params.campCivilRadius=4;const mask=civilizationMask(s);for(const id of [key(17,24),key(18,24),key(17,25),key(18,25)])assert.ok(mask.has(id));
 const before=rawControlMask(s);for(const civilianFiguresPerBuilding of [0,2,6]){assert.equal(validateParams({...s.params,civilianFiguresPerBuilding},s,false),'');assert.deepEqual(rawControlMask(s),before);}
 assert.match(validateParams({...s.params,civilianFiguresPerBuilding:7},s,false),/生活人数/);
});

test('篝火升级预览只读、点击才扣款，接入住房且不扩大控制或重选进攻',()=>{
 const s=district();buildHousing(s,key(17,24));const before=structuredClone(s),q=campUpgradeQuote(s),ground=rawControlMask(s),attacks=structuredClone(s.attacks),cash=funds(s);
 assert.equal(q.cost,40);assert.equal(q.before,1);assert.equal(q.after,5);assert.equal(q.residents,2);civilizationMask(campUpgradeCandidate(s));assert.deepEqual(s,before);
 assert.equal(upgradeCamp(s),'');assert.equal(funds(s),cash-40);assert.equal(population(s).total,8);assert.deepEqual(rawControlMask(s),ground);assert.deepEqual(s.attacks,attacks);assert.equal(campUpgradeQuote(s).cost,80);
 const retry=restoreNight(beginBattle(s));assert.equal(retry.campLevel,1);assert.equal(funds(retry),funds(s));
 s.phase='build';s.debugGold=-10000;const blocked=structuredClone(s);assert.match(upgradeCamp(s),/资金不足/);assert.deepEqual(s,blocked);
});
