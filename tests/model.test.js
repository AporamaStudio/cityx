import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULTS } from '../src/config.js';
import { key, createState as makeState, coverage, pathFrom, funds, placementError, validateSources, stepBattle, changeWall, wallPreview, validateParams, fireField, inControl } from '../src/model.js';

// 原有战斗用例使用大控制范围，另用独立用例检查默认控制权限。
const createState=(sources,towers,walls,params={...DEFAULTS,controlRadius:30})=>makeState(sources,towers,walls,params);

test('所有可达格严格接近篝火，预览到达目标，默认三路实际合并',()=>{
  const s=createState();
  for(const [id,next] of s.field.next) assert.equal(s.field.distance.get(next),s.field.distance.get(id)-1);
  for(const source of s.sources) assert.equal(pathFrom(key(source.x,source.y),s.field).at(-1),s.camp);
  s.phase='battle';for(let i=0;i<100&&s.phase==='battle';i++)stepBattle(s);
  assert.equal(s.phase,'lost');assert.ok(s.merges>0);
});
test('曼哈顿覆盖与边界裁切，预算和禁建格',()=>{
  assert.equal(coverage(key(15,15),1).length,5);assert.equal(coverage(key(15,15),2).length,13);assert.equal(coverage(0,2).length,6);
  const s=createState();assert.ok(placementError(s,s.camp));assert.ok(placementError(s,key(5,3)));assert.equal(placementError(s,key(2,14)),'');assert.ok(placementError(s,key(20,28)));
  for(let x=0;x<10;x++)s.towers.set(key(x+2,14),'A');assert.equal(funds(s),0);assert.match(placementError(s,key(20,14)),/预算/);
  s.towers.delete(key(2,14));assert.equal(funds(s),10);
});
test('同时入格先合并再扣一次火力，满值相加且不回血',()=>{
  const s=createState([{x:1,y:1,hp:1,count:1,first:100,interval:1}]);s.phase='battle';
  s.field.next=new Map([[1,3],[2,3]]);s.enemies=[{id:1,hp:3,max:10,members:1,sources:[0]},{id:2,hp:8,max:10,members:1,sources:[1]}];s.towers.set(3,'A');
  stepBattle(s);assert.deepEqual(s.enemies.map(e=>[e.hp,e.max,e.members]),[[9,20,2]]);assert.equal(s.damage,2);assert.equal(s.merges,1);
});
test('篝火格先受火力再漏剩余生命，到达者移除，不重复扣命',()=>{
  const s=createState([{x:15,y:24,hp:5,count:1,first:1,interval:1}]);s.towers.set(key(14,26),'A');s.phase='battle';
  stepBattle(s);assert.equal(s.hp,30);stepBattle(s);assert.equal(s.hp,27);assert.equal(s.leaked,3);assert.equal(s.phase,'won');stepBattle(s);assert.equal(s.hp,27);
});
test('出生入格受伤、击杀后不漏怪、结算后禁止补炮',()=>{
  const s=createState([{x:0,y:0,hp:2,count:1,first:1,interval:1}]);s.towers.set(key(1,0),'A');s.phase='battle';stepBattle(s);
  assert.equal(s.phase,'won');assert.equal(s.removed,1);assert.equal(s.leaked,0);assert.equal(s.damage,2);assert.ok(placementError(s,key(2,0)));
});
test('非法配置被拒绝，重试复制布局并恢复预算与状态',()=>{
  const s=createState();const invalid=structuredClone(DEFAULTS.sources);invalid[0].x=30;assert.ok(validateSources(invalid,s));
  invalid[0].x=25;assert.match(validateSources(invalid,s),/重复/);
  s.towers.set(key(0,0),'A');s.hp=1;s.tick=50;const retry=createState(s.sources,s.towers);assert.equal(retry.hp,30);assert.equal(retry.tick,0);assert.equal(funds(retry),90);retry.towers.clear();assert.equal(s.towers.size,1);
});


test('墙上建塔、共享资金退款和拆墙顺序',()=>{
  const s=createState(); const id=key(14,10);
  assert.match(placementError(s,id),/墙上/);assert.equal(changeWall(s,id),'');assert.equal(placementError(s,id),'');
  s.towers.set(id,'B');assert.equal(funds(s),78);assert.match(changeWall(s,id,true),/先拆除/);
  s.towers.delete(id);assert.equal(changeWall(s,id,true),'');assert.equal(s.playerWalls.size,0);
  assert.match(changeWall(s,key(2,14),true),/固定墙/);
  s.params.budget=1;assert.match(changeWall(s,id),/资金不足/);
});
test('不允许封死篝火，拒绝后实际地图与路径不变；预览与放置一致',()=>{
  const s=createState();for(const [x,y] of [[14,25],[16,25],[15,24]])assert.equal(changeWall(s,key(x,y)),'');
  const before=s.field, walls=s.walls.size, last=key(15,26);
  assert.match(wallPreview(s,last).error,/封死/);assert.match(changeWall(s,last),/封死/);
  assert.equal(s.field,before);assert.equal(s.walls.size,walls);assert.equal(s.playerWalls.has(last),false);
  const id=key(15,10),preview=wallPreview(s,id);assert.equal(preview.error,'');assert.equal(s.walls.has(id),false);
  assert.equal(changeWall(s,id),'');assert.deepEqual(s.field.next,preview.field.next);
});
test('两类火力与形状切换，参数拒绝非法、超预算和控制范围缩水',()=>{
  const s=createState();s.towers.set(key(14,14),'A');s.towers.set(key(16,14),'B');
  assert.equal(coverage(key(15,15),1,'square').length,9);assert.equal(coverage(key(15,15),2,'square').length,25);
  const p=structuredClone(s.params);p.weapons.A.cost=90;assert.match(validateParams(p,s),/超出预算/);assert.equal(s.params.weapons.A.cost,10);
  p.budget=200;assert.equal(validateParams(p,s),'');p.weapons.A.range=NaN;assert.match(validateParams(p,s),/武器 A/);
  const q=structuredClone(s.params);changeWall(s,key(14,10));q.controlRadius=1;assert.match(validateParams(q,s),/控制范围/);
  const retry=createState(s.sources,s.towers,s.playerWalls,s.params);assert.equal(retry.playerWalls.size,1);assert.equal(retry.towers.get(key(16,14)),'B');assert.equal(funds(retry),68);
  assert.equal(fireField(s).get(key(15,14)),3);
  const r=structuredClone(s.params);r.weapons.A.shape='diamond';assert.equal(fireField({...s,params:r}).get(key(15,15)),1);assert.equal(fireField(s).get(key(15,15)),3);
});


test('控制范围与建造格分开，范围外不能造墙或架炮但仍可通行和受火力',()=>{
  const s=makeState();
  assert.equal(inControl(s,key(15,16)),true);assert.equal(inControl(s,key(15,15)),false);
  assert.equal(inControl(s,key(24,25)),true);assert.equal(inControl(s,key(24,24)),true);
  assert.equal(inControl(s,key(24,16)),false);assert.equal(inControl(s,key(23,16)),false);
  assert.equal(inControl(s,key(22,16)),true);assert.equal(inControl(s,key(23,17)),true);
  assert.match(changeWall(s,key(15,15)),/控制范围/);assert.match(placementError(s,key(16,14)),/控制范围/);
  assert.match(placementError(s,key(15,17)),/墙上/);assert.match(changeWall(s,s.camp),/篝火/);
  assert.equal(changeWall(s,key(15,16)),'');s.towers.set(key(15,16),'B');
  assert.equal(funds(s),78);assert.ok(fireField(s).get(key(15,15))>0);
  assert.ok(s.field.distance.has(key(15,15)));assert.equal(inControl(s,key(15,15)),false);
});
test('墙价参与参数预算校验，取消和重试不制造资金',()=>{
  const s=makeState();assert.equal(changeWall(s,key(14,20)),'');assert.equal(funds(s),98);
  s.towers.set(key(14,20),'A');assert.equal(funds(s),88);
  const p=structuredClone(s.params);p.wallCost=100;assert.match(validateParams(p,s),/超出预算/);assert.equal(funds(s),88);
  const retry=makeState(s.sources,s.towers,s.playerWalls,s.params);assert.equal(funds(retry),88);
  retry.towers.delete(key(14,20));assert.equal(funds(retry),98);assert.equal(changeWall(retry,key(14,20),true),'');assert.equal(funds(retry),100);
});

// 前哨用例检查控制并集、目标身份、失守溢出和次日恢复，不做数值平衡推演。
const {buildOutpost,removeOutpost,outpostError,sourceTarget,fieldFor,enterMorning,incomeEligible}=await import('../src/model.js');
test('前哨扩张并集、重叠保护和失控原址修复',()=>{
  const a=key(15,16),b=key(19,16),s=makeState([{x:15,y:15,hp:16,count:1,first:1,interval:1,target:a}]);
  assert.equal(buildOutpost(s,a),'');assert.equal(buildOutpost(s,b),'');assert.equal(funds(s),50);
  const exclusive=key(10,12),overlap=key(17,12);assert.ok(inControl(s,exclusive));assert.ok(inControl(s,overlap));
  s.phase='battle';stepBattle(s);stepBattle(s);
  assert.equal(s.outposts.get(a).hp,0);assert.equal(s.outposts.get(b).hp,10);
  assert.equal(inControl(s,exclusive),false);assert.equal(incomeEligible(s,exclusive),false);
  assert.equal(incomeEligible(s,overlap),true);assert.equal(s.lostControl.has(overlap),false);
  assert.equal(s.enemies[0].hp,6);assert.equal(s.enemies[0].target,s.camp);
  assert.match(buildOutpost(s,a,true),/防守/);
  while(s.phase==='battle')stepBattle(s);assert.equal(s.phase,'won');assert.equal(s.hp,24);
  assert.equal(enterMorning(s),true);assert.equal(s.day,2);assert.equal(buildOutpost(s,a,true),'');
  assert.equal(funds(s),40);assert.equal(inControl(s,exclusive),true);assert.equal(incomeEligible(s,exclusive),false);
  assert.match(buildOutpost(s,a,true),/受损/);assert.equal(funds(s),40);
});
test('不同目标同格不合并，分别扣血后走向不同目标',()=>{
  const s=makeState([{x:15,y:3,hp:1,count:1,first:100,interval:1}]),a=key(15,16);buildOutpost(s,a);
  s.phase='battle';s.towers.set(key(14,17),'A');
  s.enemies=[{id:key(15,16),target:s.camp,hp:10,max:10,members:1,sources:[0]}, {id:key(15,18),target:a,hp:10,max:10,members:1,sources:[1]}];
  stepBattle(s);assert.equal(s.enemies.length,2);assert.ok(s.enemies.every(e=>e.id===key(15,17)&&e.hp===8));assert.equal(s.merges,0);
  stepBattle(s);assert.equal(s.outposts.get(a).hp,4);assert.equal(s.enemies.length,1);assert.equal(s.enemies[0].target,s.camp);
});
test('同目标仍合并，攻击点入格火力先结算，前哨不会吞掉溢出敌群',()=>{
  const s=makeState([{x:15,y:3,hp:1,count:1,first:100,interval:1}]),a=key(15,16);buildOutpost(s,a);s.outposts.get(a).hp=3;
  s.phase='battle';s.towers.set(key(14,16),'A');
  s.enemies=[{id:key(15,15),target:a,hp:5,max:5,members:1,sources:[0]},{id:key(16,16),target:a,hp:5,max:5,members:1,sources:[1]}];
  stepBattle(s);assert.equal(s.merges,1);assert.equal(s.damage,2);assert.equal(s.enemies[0].hp,5);assert.equal(s.enemies[0].max,10);assert.equal(s.enemies[0].target,s.camp);
});
test('源头可指定目标，自动选最近；失守后回退火光且不允许隔绝前哨',()=>{
  const s=makeState(),a=key(15,16);buildOutpost(s,a);
  assert.equal(sourceTarget(s,{...s.sources[0],target:-2}),a);assert.equal(sourceTarget(s,{...s.sources[0],target:-1}),s.camp);
  assert.equal(sourceTarget(s,{...s.sources[0],target:a}),a);assert.match(validateSources([{...s.sources[0],target:999}],s),/不存在/);
  for(const [x,y] of [[14,16],[16,16],[15,17]])assert.equal(changeWall(s,key(x,y)),'');
  assert.match(changeWall(s,key(15,15)),/封死|控制范围/);
  s.outposts.get(a).hp=0;assert.equal(sourceTarget(s,{...s.sources[0],target:a}),s.camp);
  assert.ok(fieldFor(s,s.camp).distance.has(a));
});
test('前哨资金、占用、撤销依赖及重试复制',()=>{
  const s=makeState(),a=key(15,16);s.params.budget=24;assert.match(buildOutpost(s,a),/资金不足/);s.params.budget=100;
  buildOutpost(s,a);assert.match(changeWall(s,a),/前哨/);assert.match(outpostError(s,a),/占用/);
  assert.equal(changeWall(s,key(15,12)),'');assert.match(removeOutpost(s,a),/依赖/);changeWall(s,key(15,12),true);
  const copy=makeState(s.sources,s.towers,s.playerWalls,s.params,s.outposts);copy.outposts.get(a).hp=0;assert.equal(s.outposts.get(a).hp,10);
  assert.equal(removeOutpost(s,a),'');assert.equal(funds(s),100);
});


test('合并群未死无收益，完全击杀按原始成员奖励且不重复发放',()=>{
  const s=createState([{x:1,y:1,hp:1,count:1,first:100,interval:1}]);s.phase='battle';
  s.field.next=new Map([[1,3],[2,3],[3,4]]);s.towers.set(3,'A');
  s.enemies=[{id:1,hp:2,max:5,members:1,sources:[0]}, {id:2,hp:2,max:10,members:2,sources:[1]}];
  stepBattle(s);assert.equal(s.earned,0);assert.equal(s.enemies[0].hp,2);assert.equal(s.enemies[0].members,3);
  stepBattle(s);assert.equal(s.earned,3);assert.equal(s.enemies.length,0);assert.equal(funds(s),93);
  stepBattle(s);assert.equal(s.earned,3);
});
test('漏怪及撞前哨消耗不掉钱，溢出群被炮火消灭才结算',()=>{
  const s=makeState([{x:15,y:24,hp:2,count:1,first:1,interval:1}]);s.phase='battle';stepBattle(s);stepBattle(s);assert.equal(s.earned,0);
  const a=key(15,16),t=makeState([{x:15,y:15,hp:11,count:1,first:1,interval:1,target:a}]);buildOutpost(t,a);t.phase='battle';
  stepBattle(t);stepBattle(t);assert.equal(t.earned,0);assert.equal(t.enemies[0].hp,1);
  t.towers.set(key(14,17),'A');stepBattle(t);assert.equal(t.earned,1);
});
test('战斗补炮遵守资金、已有墙和控制限制，不允许造墙或拆墙',()=>{
  const s=makeState(),a=key(14,20);changeWall(s,a);s.params.budget=11;s.phase='battle';
  assert.match(placementError(s,a),/预算/);s.earned=1;assert.equal(placementError(s,a),'');
  assert.match(placementError(s,key(14,14)),/控制/);assert.match(placementError(s,key(15,20)),/墙上/);
  assert.match(changeWall(s,a,true),/战斗/);assert.match(changeWall(s,key(13,20)),/战斗/);
  s.towers.set(a,'A');assert.equal(funds(s),0);assert.match(placementError(s,a),/武器|炮台/);
});
test('补炮不追补静止敌人伤害，下次入格使用新火力',()=>{
  const s=createState([{x:15,y:20,hp:8,count:1,first:1,interval:1}]);s.phase='battle';stepBattle(s);
  s.towers.set(key(14,21),'A');assert.equal(s.enemies[0].hp,8);fireField(s);assert.equal(s.enemies[0].hp,8);
  stepBattle(s);assert.equal(s.enemies[0].hp,6);
});


test('火光与前哨按缺失 HP 和各自单价修满，满血不扣钱',()=>{
  const s=makeState(),a=key(15,16);buildOutpost(s,a);s.day=2;s.hp=23;s.outposts.get(a).hp=6;
  assert.equal(buildOutpost(s,s.camp,true),'');assert.equal(s.hp,30);assert.equal(funds(s),68);
  s.params.repairCost=2;assert.equal(buildOutpost(s,a,true),'');assert.equal(funds(s),60);assert.equal(s.outposts.get(a).hp,10);
  assert.match(buildOutpost(s,s.camp,true),/受损/);assert.equal(funds(s),60);
  s.hp=29;s.params.campRepairCost=3;assert.equal(buildOutpost(s,s.camp,true),'');assert.equal(funds(s),57);
});
test('修复不够钱时不改变生命或资金，战斗及失败不能修复',()=>{
  const s=makeState();s.day=2;s.hp=20;s.params.budget=9;
  assert.match(buildOutpost(s,s.camp,true),/资金不足/);assert.equal(s.hp,20);assert.equal(funds(s),9);
  s.params.budget=10;assert.equal(buildOutpost(s,s.camp,true),'');assert.equal(funds(s),0);
  s.hp=10;s.phase='battle';assert.match(buildOutpost(s,s.camp,true),/防守/);assert.equal(s.hp,10);
  s.phase='lost';s.hp=0;assert.ok(buildOutpost(s,s.camp,true));assert.equal(s.hp,0);
});


const {createCampaign,beginBattle,restoreNight,restartCampaign,campaignComplete}=await import('../src/model.js');
test('连续三晚继承受损 HP 和资金，单晚统计清零且第三晚结束',()=>{
  const wave=[{x:15,y:24,hp:2,count:1,first:1,interval:1,target:-1}];
  const s=createCampaign(DEFAULTS,[wave,wave,wave]);buildOutpost(s,key(15,16));
  s.outposts.get(key(15,16)).hp=4;s.earned=7;s.repairSpent=2;const money=funds(s);
  for(let day=1;day<=3;day++){
    assert.ok(beginBattle(s));while(s.phase==='battle')stepBattle(s);
    assert.equal(s.hp,30-2*day);assert.equal(funds(s),money);assert.equal(s.outposts.get(key(15,16)).hp,4);
    assert.equal(campaignComplete(s),day===3);
    assert.equal(enterMorning(s),day<3);
    if(day<3){assert.equal(s.tick,0);assert.equal(s.spawned,0);assert.equal(s.lastNight.leaked,2);assert.equal(enterMorning(s),false);}
  }
  assert.equal(beginBattle(s),null);assert.equal(s.day,3);
});
test('第二晚重试保留之前损伤收入与修复，撤销本晚收入和补炮，快照不被污染',()=>{
  const s=createCampaign();s.day=2;s.sources=s.waves[1];s.hp=22;s.earned=6;s.repairSpent=3;
  buildOutpost(s,key(15,16));s.outposts.get(key(15,16)).hp=0;s.lostControl.add(key(15,10));
  const snapshot=beginBattle(s);assert.equal(s.lostControl.size,0);
  s.earned+=3;s.nightEarned=3;s.hp=11;s.towers.set(key(7,19),'A');s.phase='lost';
  const retry=restoreNight(snapshot);assert.equal(retry.day,2);assert.equal(retry.hp,22);assert.equal(retry.earned,6);
  assert.equal(retry.repairSpent,3);assert.equal(retry.nightEarned,0);assert.equal(retry.towers.size,0);assert.equal(retry.outposts.get(key(15,16)).hp,0);
  retry.outposts.get(key(15,16)).hp=10;assert.equal(snapshot.outposts.get(key(15,16)).hp,0);
  const fresh=restartCampaign(s);assert.equal(fresh.day,1);assert.equal(fresh.hp,30);assert.equal(funds(fresh),100);assert.equal(fresh.outposts.size,0);
});
test('预留未来源头与通路，第三天仍可修复，失败不能进入次日',()=>{
  const s=createCampaign({...DEFAULTS,controlRadius:30});const future=key(15,1);
  assert.ok(changeWall(s,future));assert.ok(buildOutpost(s,future));
  for(const [x,y] of [[14,1],[16,1],[15,0]])assert.equal(changeWall(s,key(x,y)),'');
  assert.match(changeWall(s,key(15,2)),/封死/);
  s.day=3;s.hp=27;const before=funds(s);assert.equal(buildOutpost(s,s.camp,true),'');assert.equal(funds(s),before-3);
  s.phase='lost';assert.equal(enterMorning(s),false);
});
test('跨晚击杀只累计一次，不因进入次日重复发钱',()=>{
  const wave=[{x:15,y:20,hp:2,count:1,first:1,interval:1}];const s=createCampaign(DEFAULTS,[wave,wave,wave]);
  changeWall(s,key(14,20));s.towers.set(key(14,20),'A');
  for(let day=1;day<=3;day++){beginBattle(s);stepBattle(s);assert.equal(s.earned,day);assert.equal(s.nightEarned,1);stepBattle(s);assert.equal(s.earned,day);enterMorning(s);assert.equal(s.earned,day);}
});

// 经营投资跨晚固定；收益必须和真实控制及重试快照一致。
test('生产建设限制、撤销与跨天清除，资金不足不改变设施',async()=>{
  const {createCampaign,buildProduction,removeProduction,beginBattle,restoreNight,productionError,buildOutpost,removeOutpost}=await import('../src/model.js');
  const s=createCampaign(),id=key(11,24);
  assert.equal(buildProduction(s,id),'');assert.equal(funds(s),90);
  assert.equal(removeProduction(s,id),'');assert.equal(funds(s),100);
  assert.ok(productionError(s,key(3,17)));assert.ok(changeWall(s,id));assert.ok(buildOutpost(s,id));
  buildProduction(s,id);const snapshot=beginBattle(s);assert.ok(removeProduction(s,id));
  s.phase='build';s.day=2;const prior=funds(s);assert.equal(removeProduction(s,id),'');assert.equal(funds(s),prior);assert.equal(removeProduction(restoreNight(snapshot),id),'');
  const poor=createCampaign({...DEFAULTS,budget:9});assert.ok(buildProduction(poor,id));assert.equal(poor.production.size,0);
  const outer=createCampaign();buildOutpost(outer,key(7,17));buildProduction(outer,key(3,17));assert.ok(removeOutpost(outer,key(7,17)));
});
test('经营胜利结算一次、跨晚继承，失败不发钱，重试不复制收益',async()=>{
  const {createCampaign,buildProduction,beginBattle,restoreNight,settleEconomy,enterMorning}=await import('../src/model.js');
  const waves=Array.from({length:3},()=>[{x:15,y:24,hp:1,count:1,first:1,interval:1,target:-1}]);
  const s=createCampaign(DEFAULTS,waves);buildProduction(s,key(11,24));buildProduction(s,key(19,26));
  const snap=beginBattle(s);while(s.phase==='battle')stepBattle(s);
  assert.equal(s.phase,'won');assert.equal(s.nightEconomy,16);assert.equal(funds(s),96);settleEconomy(s);assert.equal(funds(s),96);
  assert.equal(funds(restoreNight(snap)),80);enterMorning(s);assert.equal(s.lastNight.economy,16);assert.equal(s.nightEconomy,0);
  beginBattle(s);while(s.phase==='battle')stepBattle(s);assert.equal(s.economyEarned,32);
  const lost=restoreNight(snap);lost.hp=1;beginBattle(lost);while(lost.phase==='battle')stepBattle(lost);assert.equal(lost.phase,'lost');assert.equal(lost.economyEarned,0);
});
test('前哨失守仅停止真正失控的生产，重叠控制继续收益，修复恢复下晚预估',async()=>{
  const {createCampaign,buildProduction,buildOutpost,beginBattle,expectedIncome,enterMorning}=await import('../src/model.js');
  const s=createCampaign();buildOutpost(s,key(7,17));buildProduction(s,key(3,17));buildProduction(s,key(11,24));
  s.sources=[{x:7,y:16,hp:10,count:1,first:1,interval:1,target:key(7,17)}];beginBattle(s);
  while(s.phase==='battle')stepBattle(s);assert.equal(s.nightEconomy,8);assert.equal(s.production.size,2);
  enterMorning(s);assert.equal(expectedIncome(s),8);assert.equal(buildOutpost(s,key(7,17),true),'');assert.equal(expectedIncome(s),16);
  const overlap=createCampaign();buildOutpost(overlap,key(7,17));buildOutpost(overlap,key(8,18));buildProduction(overlap,key(3,17));
  overlap.sources=[{x:7,y:16,hp:10,count:1,first:1,interval:1,target:key(7,17)}];beginBattle(overlap);
  while(overlap.phase==='battle')stepBattle(overlap);assert.equal(overlap.nightEconomy,8);
});

test('多格街区任意格操作同一投资，整块控制及边缘失控停产',async()=>{
  const {createCampaign,productionCells,productionControlled,productionError,buildProduction,removeProduction,expectedIncome,buildOutpost}=await import('../src/model.js');
  const s=createCampaign();
  assert.equal(productionCells(key(12,25)).length,4);assert.equal(buildProduction(s,key(12,25)),'');
  assert.equal(s.production.size,1);assert.equal(funds(s),90);assert.ok(buildProduction(s,key(11,24)));
  assert.ok(changeWall(s,key(12,25)));assert.ok(buildOutpost(s,key(12,25)));
  assert.equal(removeProduction(s,key(11,25)),'');assert.equal(funds(s),100);
  assert.equal(buildOutpost(s,key(7,22)),'');assert.equal(productionControlled(s,key(2,22)),true);
  assert.equal(buildProduction(s,key(4,24)),'');assert.equal(funds(s),50);assert.equal(expectedIncome(s),20);
  s.phase='battle';s.lostControl.add(key(4,24));assert.equal(expectedIncome(s),0);
  s.phase='build';assert.equal(expectedIncome(s),20);
  const partial=createCampaign({...DEFAULTS,controlRadius:1});assert.match(productionError(partial,key(11,24)),/缺.*格控制/);
});
test('街区布局不重叠、不覆盖固定墙和源头，两类成本独立',async()=>{
  const {PRODUCTION_SITES}=await import('../src/config.js');
  const {createCampaign,productionCells,buildProduction,productionQuote,validateParams}=await import('../src/model.js');
  const s=createCampaign(),seen=new Set();
  for(const p of PRODUCTION_SITES)for(const id of productionCells(key(p.x,p.y))){assert.ok(!seen.has(id));assert.ok(!s.walls.has(id));assert.notEqual(id,s.camp);seen.add(id);}
  for(const source of s.waves.flat())assert.ok(!seen.has(key(source.x,source.y)));
  const params={...DEFAULTS,largeProductionCost:99};assert.equal(productionQuote({...s,params},key(2,22)).cost,99);
  assert.equal(productionQuote({...s,params},key(11,24)).cost,10);
  buildProduction(s,key(11,24));assert.ok(validateParams({...DEFAULTS,controlRadius:3},s));
});

test('前哨失守后在场路线去火光，未来路线去另一个前哨，出完后不再预告',async()=>{
  const {createCampaign,buildOutpost,beginBattle,battleRoutes}=await import('../src/model.js');
  const s=createCampaign();buildOutpost(s,key(15,16));buildOutpost(s,key(15,20));
  s.sources=[{x:15,y:15,hp:11,count:2,first:1,interval:20,target:-2}];beginBattle(s);stepBattle(s);stepBattle(s);
  const routes=battleRoutes(s),existing=routes.find(r=>!r.future),future=routes.find(r=>r.future);
  assert.equal(existing.target,s.camp);assert.equal(existing.path[0],s.enemies[0].id);assert.equal(existing.path.at(-1),s.camp);
  assert.equal(future.target,key(15,20));assert.equal(future.path.at(-1),key(15,20));
  stepBattle(s);assert.equal(s.enemies[0].id,existing.path[1]);
  s.tick=21;assert.ok(battleRoutes(s).every(r=>!r.future));
});

test('当天撤销、旧设施零退款、修复不刷新日期，拆建及重试不制造资金',async()=>{
  const {buildTower,removeTower,demolitionQuote,removeProduction}=await import('../src/model.js');
  const s=createCampaign(),wall=key(14,18),post=key(15,16);
  changeWall(s,wall);buildTower(s,wall,'A');buildOutpost(s,post);
  const {buildProduction}=await import('../src/model.js');buildProduction(s,key(11,24));
  const prior=funds(s);s.day=2;
  s.outposts.get(post).hp=4;buildOutpost(s,post,true);assert.equal(demolitionQuote(s,post).refund,0);
  assert.equal(removeTower(s,wall),'');assert.equal(changeWall(s,wall,true),'');assert.equal(removeOutpost(s,post),'');assert.equal(removeProduction(s,key(12,25)),'');
  assert.equal(funds(s),prior-6);assert.equal(s.demolitionSpent,47);
  changeWall(s,wall);buildTower(s,wall,'A');buildOutpost(s,post);
  assert.equal(demolitionQuote(s,post).refund,25);const snapshot=beginBattle(s);
  assert.ok(removeTower(s,wall));assert.ok(removeOutpost(s,post));assert.ok(changeWall(s,wall,true));
  const retry=restoreNight(snapshot);assert.equal(demolitionQuote(retry,wall).refund,10);
  removeTower(retry,wall);changeWall(retry,wall,true);removeOutpost(retry,post);assert.equal(funds(retry),prior-6);
  assert.equal(funds(restartCampaign(retry)),100);
});
test('夜间补炮建造日保留到次日，旧墙上的新炮按各自日期退款',async()=>{
  const {buildTower,removeTower,demolitionQuote}=await import('../src/model.js');
  const s=createCampaign(),id=key(14,18);changeWall(s,id);s.day=2;
  buildTower(s,id,'A');assert.equal(demolitionQuote(s,id).refund,10);removeTower(s,id);assert.equal(demolitionQuote(s,id).refund,0);
  beginBattle(s);buildTower(s,id,'A');s.phase='won';enterMorning(s);assert.equal(demolitionQuote(s,id).day,2);assert.equal(demolitionQuote(s,id).refund,0);
});
