import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULTS,SIZE} from '../src/config.js';
import {createCampaign,campaignGoals,campaignComplete,key,lockAttacks,beginBattle,stepBattle,enterMorning,settleEconomy,restoreNight,restartCampaign,applyTestScenario,buildProduction,funds,restoreBank,restoreHospital,hospitalError,hospitalDiscovered,pendingHospitals,economyConstructionPreview,productionControlled,population,applyExperimentParams,validateParams,clearPlot} from '../src/model.js';

function setup(restored=true){
  const layout={width:SIZE,height:SIZE,camp:{x:15,y:25},tiles:Array(SIZE*SIZE).fill('road'),blocks:[
    {x:16,y:21,width:3,height:3,kind:'building',role:'hospital',ruinType:'hospital'},
    {x:13,y:22,width:2,height:2,kind:'building',ruinType:'production'},
    {x:20,y:22,width:1,height:1,kind:'building'}]};
  const source={id:'source-1',index:0,bx:20,by:22,width:1,height:1,x:20,y:21,site:key(20,22),firstNight:3};
  const state=createCampaign({...DEFAULTS,campHP:1000,nightTicks:3},[[],[],[]],layout,[source]);
  if(restored){state.day=2;assert.equal(restoreHospital(state,key(16,21)),'');state.day=1;}
  return state;
}
function finish(s){assert.ok(beginBattle(s));for(let i=0;i<10&&s.phase==='battle';i++)stepBattle(s);}

test('揭示医院不算受控；碰一格整栋归属，修复后才完成目标，失联瞭望不能伪造收复',()=>{
  const s=setup(false);s.day=2;s.params.controlRadius=1;
  assert.equal(campaignGoals(s).hospital,false);
  s.outposts.set(key(16,22),{day:1});assert.equal(campaignGoals(s).hospital,false); // 孤立据点不能伪造收复。
  s.outposts=new Map([[s.camp,{day:1,starter:true}]]);s.params.controlRadius=2;
  assert.equal(campaignGoals(s).hospital,false);
  s.params.controlRadius=3;assert.equal(productionControlled(s,key(18,21)),true);assert.equal(campaignGoals(s).hospitalControlled,true);assert.equal(campaignGoals(s).hospital,false);
  assert.equal(restoreHospital(s,key(18,21)),'');assert.equal(campaignGoals(s).hospital,true);
  s.params.controlRadius=2;s.outposts.set(key(15,23),{day:1});s.params.outpostRadius=1;
  assert.equal(campaignGoals(s).hospital,true);s.outposts=new Map([[s.camp,{day:1,starter:true}]]);assert.equal(campaignGoals(s).hospital,false);
});
test('白天达成不结算；夜末胜利可提前，不能进入次日或重复结算，重试回滚源头与成果',()=>{
  const s=setup(),source=s.enemySources.get('source-1');source.hp=0;
  assert.equal(campaignGoals(s).sources,true);assert.equal(s.result,null);assert.equal(campaignComplete(s),false);
  s.day=2;assert.equal(buildProduction(s,key(13,22)),'');const before=funds(s),snapshot=beginBattle(s);
  stepBattle(s);assert.equal(s.result.type,'victory');assert.equal(s.result.day,2);assert.equal(s.result.population,6);
  assert.equal(s.result.cleared,1);assert.equal(s.result.buildings,3);assert.equal(s.economySettled,true);
  assert.equal(s.survivedNights,1);assert.equal(funds(s),before+s.nightEconomy);assert.equal(enterMorning(s),false);
  const after=funds(s);stepBattle(s);settleEconomy(s);assert.equal(funds(s),after);assert.equal(beginBattle(s),null);
  const retry=restoreNight(snapshot);assert.equal(retry.result,null);assert.equal(retry.economySettled,false);assert.equal(funds(retry),before);
  const fresh=restartCampaign(s);assert.equal(fresh.result,null);assert.ok(fresh.enemySources.get('source-1').hp>0);assert.equal(fresh.production.size,0);
  assert.equal(retry.hospitals.size,1);assert.equal(fresh.hospitals.size,0);assert.equal(campaignGoals(fresh).hospital,false);
});

test('医院40金币仅收费一次、持续2人、不改道路；失控保留修复和人员，重连不重复分配',()=>{
  const s=setup(false);s.day=2;const id=key(16,21),before=funds(s),workers=population(s),terrain=new Set(s.terrainWalls);
  assert.equal(hospitalDiscovered(s,id),true);assert.deepEqual(pendingHospitals(s),[id]);
  assert.equal(DEFAULTS.hospitalRestoreCost,40);assert.equal(DEFAULTS.hospitalWorkers,2);
  assert.equal(restoreHospital(s,key(17,22)),'');assert.equal(funds(s),before-40);assert.deepEqual(population(s),{total:workers.total,working:workers.working+2,free:workers.free-2});assert.deepEqual(s.terrainWalls,terrain);
  assert.deepEqual(pendingHospitals(s),[]);assert.equal(s.plotContents.get(id).type,'hospital');assert.equal(s.plotContents.get(id).status,'building');
  assert.match(restoreHospital(s,id),/已经修复/);assert.equal(funds(s),before-DEFAULTS.hospitalRestoreCost);
  s.params.controlRadius=1;assert.equal(campaignGoals(s).hospital,false);assert.equal(campaignGoals(s).hospitalRestored,true);assert.equal(s.hospitals.size,1);assert.equal(population(s).working,2);
  s.params.controlRadius=9;assert.equal(campaignGoals(s).hospital,true);assert.equal(s.result,null);assert.equal(population(s).working,2);assert.equal(funds(s),before-40);
});

test('未修复医院不能通关，最后一晚记录待修复；修复且受控才在夜末胜利',()=>{
  const s=setup(false);s.day=2;s.enemySources.get('source-1').hp=0;finish(s);
  assert.equal(s.result,null);assert.equal(s.economySettled,true);assert.equal(enterMorning(s),true);
  finish(s);assert.equal(s.result.type,'deadline');assert.equal(s.result.hospitalRestored,false);assert.equal(s.result.hospitalControlled,true);
  const restored=setup();restored.day=3;restored.params.controlRadius=1;restored.enemySources.get('source-1').hp=0;finish(restored);
  assert.equal(restored.result.type,'deadline');assert.equal(restored.result.hospitalRestored,true);assert.equal(restored.result.hospitalControlled,false);
});

test('医院修复缺钱可预览、灰工具仍有目标；未知、区外、夜间及已修复不可执行',()=>{
  const s=setup(false);s.day=2;s.debugGold=-100;const id=key(16,21),before=structuredClone(s);
  assert.match(hospitalError(s,id),/不足/);assert.equal(hospitalError(s,id,{ignoreResources:true}),'');assert.equal(economyConstructionPreview(s,id,'hospital').type,'hospital');
  assert.match(restoreHospital(s,id),/不足/);assert.deepEqual(s,before);
  s.explored.clear();assert.deepEqual(pendingHospitals(s),[]);assert.equal(economyConstructionPreview(s,id,'hospital'),null);
  const outside=setup(false);outside.day=2;outside.params.controlRadius=1;assert.match(hospitalError(outside,id),/控制区/);assert.equal(economyConstructionPreview(outside,id,'hospital'),null);
  outside.phase='battle';assert.match(hospitalError(outside,id),/白天/);assert.equal(economyConstructionPreview(setup(),id,'hospital'),null);
});

test('医院费用参数校验与玩法应用一致，已修复投资不因调参重收；重试保留战前修复',()=>{
  const s=setup(false);s.day=2;const id=key(16,21);
  for(const value of [0,1.5,1001])assert.match(validateParams({...s.params,hospitalRestoreCost:value},s),/医院/);
  for(const value of [0,1.5,101])assert.match(validateParams({...s.params,hospitalWorkers:value},s),/医院/);
  assert.equal(applyExperimentParams(s,{...s.params,hospitalRestoreCost:40},'gameplay'),'');const before=funds(s);
  assert.equal(restoreHospital(s,id),'');assert.equal(funds(s),before-40);const snapshot=beginBattle(s),retry=restoreNight(snapshot);
  assert.equal(retry.hospitals.get(id).cost,40);assert.equal(funds(retry),before-40);
  retry.phase='build';assert.equal(applyExperimentParams(retry,{...retry.params,hospitalRestoreCost:50},'gameplay'),'');assert.equal(funds(retry),before-40);
});

test('医院使用现有银行授信付款，保留借款计息义务；修复后仍不能拆除',()=>{
  const s=setup(false),id=key(16,21);assert.match(hospitalError(s,id),/第2天/);s.day=2;
  s.sites.push({x:11,y:25,width:1,height:1,kind:'building',role:'bank'});assert.equal(restoreBank(s,key(11,25)),'');
  s.debugGold-=funds(s)-10;assert.equal(restoreHospital(s,id),'');assert.equal(funds(s),-30);assert.equal(s.debtInterestCap,s.params.bankCapacity);
  assert.match(clearPlot(s,id),/医院/);assert.equal(s.hospitals.size,1);assert.equal(funds(s),-30);
});
test('医院缺工人或同时缺钱时修复无副作用，仍可看方案；实验不能挤掉已分配人员',()=>{
  const s=setup(false);s.day=2;s.debugPopulation=-5;const id=key(16,21),before=structuredClone(s);
  assert.match(hospitalError(s,id),/劳动力不足/);assert.match(restoreHospital(s,id),/劳动力不足/);assert.deepEqual(s,before);
  assert.equal(economyConstructionPreview(s,id,'hospital').type,'hospital');s.debugGold=-100;
  assert.match(hospitalError(s,id),/资金不足.*劳动力不足/);assert.equal(s.hospitals.size,0);
  s.debugGold=0;s.debugPopulation=0;assert.equal(restoreHospital(s,id),'');const repaired=structuredClone(s);
  assert.match(applyExperimentParams(s,{...s.params,hospitalWorkers:7},'gameplay'),/劳动力不足/);assert.deepEqual(s,repaired);
  const retry=restoreNight(beginBattle(s));assert.equal(population(retry).working,2);assert.equal(population(restartCampaign(s)).working,0);
});
test('隐藏未激活源头仍须肃清；空源头目录不能以空集判为胜利',()=>{
  const s=setup(),source=s.enemySources.get('source-1');Object.assign(source,{bx:40,by:10,x:39,y:10,site:key(40,10),discovered:false});assert.equal(source.discovered,false);assert.equal(campaignGoals(s).sources,false);
  finish(s);assert.equal(s.result,null);assert.equal(enterMorning(s),true);
  s.enemySources.clear();assert.equal(s.result,null);assert.equal(campaignGoals(s).sources,false);
});
test('最后一晚目标齐全先判胜利；目标缺失为期限失败，守夜经营照常且仅发一次',()=>{
  const win=setup();win.day=3;win.enemySources.get('source-1').hp=0;finish(win);assert.equal(win.result.type,'victory');
  const s=setup();s.day=3;assert.equal(buildProduction(s,key(13,22)),'');const before=funds(s);finish(s);
  assert.equal(s.phase,'lost');assert.equal(s.result.type,'deadline');assert.equal(s.result.hospital,true);assert.equal(s.hp,1000);
  assert.equal(s.survivedNights,1);assert.equal(s.nightEconomy,2);assert.equal(funds(s),before+2);assert.equal(enterMorning(s),false);
  settleEconomy(s);stepBattle(s);assert.equal(funds(s),before+2);
  assert.equal(applyTestScenario(s,1,100,6),'');assert.equal(s.result,null);assert.equal(campaignComplete(s),false);
  const hospitalMissing=setup();hospitalMissing.day=3;hospitalMissing.params.controlRadius=1;hospitalMissing.enemySources.get('source-1').hp=0;
  finish(hospitalMissing);assert.equal(hospitalMissing.result.type,'deadline');assert.equal(hospitalMissing.result.hospital,false);
});
test('清源不能取消其他来源批次；最后一拍火光熄灭优先失败，不发经营钱',()=>{
  const s=setup();s.sources=[{x:15,y:24,hp:1,count:1,first:3,interval:1}];lockAttacks(s);
  beginBattle(s);stepBattle(s);s.enemySources.get('source-1').hp=0;for(let i=2;i<3;i++){stepBattle(s);assert.equal(s.phase,'battle');assert.equal(s.result,null);}
  stepBattle(s);assert.equal(s.spawned,1);assert.equal(s.result.type,'victory');assert.equal(s.hp,999);
  const dead=setup();dead.sources=[{x:15,y:24,hp:1,count:1,first:3,interval:1}];dead.day=3;dead.enemySources.get('source-1').hp=1;dead.hp=1;lockAttacks(dead);
  beginBattle(dead);stepBattle(dead);stepBattle(dead);dead.towers.set(key(20,20),'B');stepBattle(dead);
  assert.equal(dead.enemySources.get('source-1').hp,0);
  assert.equal(dead.result.type,'campLost');assert.equal(dead.phase,'lost');assert.equal(dead.economySettled,false);assert.equal(dead.survivedNights,0);
});
