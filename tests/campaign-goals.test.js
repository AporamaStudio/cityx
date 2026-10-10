import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULTS,SIZE} from '../src/config.js';
import {createCampaign,campaignGoals,campaignComplete,key,lockAttacks,beginBattle,stepBattle,enterMorning,settleEconomy,restoreNight,restartCampaign,applyTestScenario,buildProduction,funds} from '../src/model.js';

function setup(){
  const layout={width:SIZE,height:SIZE,camp:{x:15,y:25},tiles:Array(SIZE*SIZE).fill('road'),blocks:[
    {x:16,y:21,width:3,height:3,kind:'building',role:'hospital',ruinType:'hospital'},
    {x:13,y:22,width:2,height:2,kind:'building',ruinType:'production'},
    {x:20,y:22,width:1,height:1,kind:'building'}]};
  const source={id:'source-1',index:0,bx:20,by:22,width:1,height:1,x:20,y:21,site:key(20,22),firstNight:3};
  return createCampaign({...DEFAULTS,campHP:1000,nightTicks:3},[[],[],[]],layout,[source]);
}
function finish(s){assert.ok(beginBattle(s));for(let i=0;i<10&&s.phase==='battle';i++)stepBattle(s);}

test('揭示医院不算收复；基础范围碰一格整栋收复，失联瞭望或建筑吸附不能传播',()=>{
  const s=setup();s.params.controlRadius=1;
  assert.equal(campaignGoals(s).hospital,false);
  s.outposts.set(key(16,22),{day:1});assert.equal(campaignGoals(s).hospital,false); // 孤立据点不能伪造收复。
  s.outposts.clear();s.params.controlRadius=2;
  assert.equal(campaignGoals(s).hospital,false);
  s.params.controlRadius=3;assert.equal(campaignGoals(s).hospital,true);
  s.params.controlRadius=2;s.outposts.set(key(15,23),{day:1});s.params.outpostRadius=1;
  assert.equal(campaignGoals(s).hospital,true);s.outposts.clear();assert.equal(campaignGoals(s).hospital,false);
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
