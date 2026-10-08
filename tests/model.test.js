import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULTS, SIZE } from '../src/config.js';
import { key, createState as makeState, coverage, pathFrom, funds, placementError, validateSources, stepBattle, changeWall, wallPreview, validateParams, fireField, inControl, lockAttacks, buildTower, removeTower, repairFacility, repairQuote } from '../src/model.js';

// 原有战斗用例使用大控制范围，另用独立用例检查默认控制权限。
const createState=(sources,towers,walls,params={...DEFAULTS,controlRadius:30})=>makeState(sources,towers,walls,params);

test('所有可达格严格接近篝火，预览到达目标，默认三路实际合并',()=>{
  const s=createState();
  for(const [id,next] of s.field.next) assert.equal(s.field.distance.get(next),s.field.distance.get(id)-1);
  for(const source of s.sources) assert.equal(pathFrom(key(source.x,source.y),s.field).at(-1),s.camp);
  s.phase='battle';for(let i=0;i<100&&s.phase==='battle';i++)stepBattle(s);
  assert.equal(s.phase,'lost');assert.ok(s.merges>0);
});
test('曼哈顿覆盖与边界裁切，独立炮塔预算和禁建格',()=>{
  assert.equal(coverage(key(15,15),1).length,5);assert.equal(coverage(key(15,15),2).length,13);assert.equal(coverage(0,2).length,6);
  const s=createState();assert.ok(placementError(s,s.camp));assert.ok(placementError(s,key(5,3)));assert.ok(placementError(s,key(2,14)));assert.equal(placementError(s,key(20,28)),'');
  for(let x=0;x<10;x++)assert.equal(buildTower(s,key(x,28),'A'),'');
  assert.equal(funds(s),0);assert.match(placementError(s,key(20,28)),/预算/);
  assert.equal(removeTower(s,key(0,28)),'');assert.equal(funds(s),10);
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
  const s=createState();const invalid=structuredClone(DEFAULTS.sources);invalid[0].x=SIZE;assert.ok(validateSources(invalid,s));
  invalid[0].x=25;assert.match(validateSources(invalid,s),/重复/);
  s.towers.set(key(0,0),'A');s.hp=1;s.tick=50;const retry=createState(s.sources,s.towers);assert.equal(retry.hp,30);assert.equal(retry.tick,0);assert.equal(funds(retry),90);retry.towers.clear();assert.equal(s.towers.size,1);
});


test('墙与塔独立占地，共享资金且分别退款',()=>{
  const s=createState(),wall=key(14,10),tower=key(15,10);
  assert.equal(placementError(s,wall),'');assert.equal(changeWall(s,wall),'');assert.match(placementError(s,wall),/重叠/);
  assert.equal(buildTower(s,tower,'B'),'');assert.match(changeWall(s,tower),/炮塔/);assert.equal(funds(s),78);
  assert.equal(changeWall(s,wall,true),'');assert.equal(funds(s),80);assert.equal(removeTower(s,tower),'');assert.equal(funds(s),100);
  assert.match(changeWall(s,key(2,14),true),/固定墙/);s.params.budget=1;assert.match(changeWall(s,wall),/资金不足/);
});
test('允许封死火光，建设与拆除不改变锁定题目',()=>{
  const s=createState(),attacks=structuredClone(s.attacks),field=s.field;
  for(const [x,y] of [[14,25],[16,25],[15,24],[15,26]])assert.equal(changeWall(s,key(x,y)),'');
  assert.equal(s.field,field);assert.deepEqual(s.attacks,attacks);
  assert.equal(wallPreview(s,key(15,10)).error,'');assert.equal(changeWall(s,key(15,10)),'');
  assert.deepEqual(s.attacks,attacks);assert.equal(changeWall(s,key(15,10),true),'');assert.deepEqual(s.attacks,attacks);
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
  assert.equal(placementError(s,key(15,17)),'');assert.match(changeWall(s,s.camp),/篝火/);
  assert.equal(changeWall(s,key(15,16)),'');assert.equal(buildTower(s,key(15,17),'B'),'');
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

// 地块内前哨、控制并集与建筑绕行在 plot-building.test.js 检查，不做平衡推演。
const {buildOutpost,removeOutpost,enterMorning,clearPlot}=await import('../src/model.js');







test('合并群未死无收益，完全击杀按原始成员奖励且不重复发放',()=>{
  const s=createState([{x:1,y:1,hp:1,count:1,first:100,interval:1}]);s.phase='battle';
  s.field.next=new Map([[1,3],[2,3],[3,4]]);s.towers.set(3,'A');
  s.enemies=[{id:1,hp:2,max:5,members:1,sources:[0],origins:['0:0']}, {id:2,hp:2,max:10,members:2,sources:[1],origins:['1:0','1:1']}];
  stepBattle(s);assert.equal(s.earned,0);assert.equal(s.enemies[0].hp,2);assert.equal(s.enemies[0].members,3);assert.equal(s.enemyOutcomes.size,0);
  stepBattle(s);assert.equal(s.earned,6);assert.equal(s.enemies.length,0);assert.equal(funds(s),96);
  assert.deepEqual([...s.enemyOutcomes],[['0:0','killed'],['1:0','killed'],['1:1','killed']]);
  assert.equal(s.events.find(e=>e.type==='kill').members,3);assert.equal(s.removed,3);
  stepBattle(s);assert.equal(s.earned,6);
});
test('抵达火光不发击杀收入，前哨不能被配置为攻击目标',()=>{
  const s=makeState([{x:15,y:24,hp:2,count:1,first:1,interval:1}]);s.phase='battle';stepBattle(s);stepBattle(s);assert.equal(s.earned,0);
  assert.match(validateSources([{...s.sources[0],target:key(11,24)}],s),/只攻击火光/);
});
test('战斗可独立补炮，遵守资金、占用和控制限制，不可造墙或拆除',()=>{
  const s=makeState(),a=key(14,20);s.params.budget=9;s.phase='battle';
  assert.match(placementError(s,a),/预算/);s.earned=1;assert.equal(buildTower(s,a,'A'),'');assert.equal(funds(s),0);
  assert.match(placementError(s,key(14,14)),/控制/);assert.match(placementError(s,a),/武器|炮台/);
  assert.match(changeWall(s,key(13,20)),/战斗/);assert.ok(removeTower(s,a));
  s.enemies=[{id:key(15,20)}];s.params.budget=100;assert.match(placementError(s,key(15,20)),/敌人占据/);
});
test('补炮不即时扣血，从下一拍使用新火力',()=>{
  const s=createState([{x:15,y:20,hp:8,count:1,first:1,interval:1}]);s.phase='battle';stepBattle(s);
  s.towers.set(key(14,21),'A');assert.equal(s.enemies[0].hp,8);fireField(s);assert.equal(s.enemies[0].hp,8);
  stepBattle(s);assert.equal(s.enemies[0].hp,6);
});


test('火光按缺失 HP 与单价修满，前哨没有维修报价',()=>{
  const s=makeState();s.day=3;s.hp=23;
  assert.equal(repairFacility(s,s.camp),'');assert.equal(s.hp,30);assert.equal(funds(s),93);
  assert.match(repairFacility(s,s.camp),/受损/);assert.equal(funds(s),93);
  s.hp=29;s.params.campRepairCost=3;assert.equal(repairFacility(s,s.camp),'');assert.equal(funds(s),90);
  assert.equal(clearPlot(s,key(11,24)),'');assert.equal(buildOutpost(s,key(11,24)),'');assert.equal(repairQuote(s,key(11,24)).missing,0);
});
test('修复不够钱时不改变生命或资金，战斗及失败不能修复',()=>{
  const s=makeState();s.day=2;s.hp=20;s.params.budget=9;
  assert.match(repairFacility(s,s.camp),/资金不足/);assert.equal(s.hp,20);assert.equal(funds(s),9);
  s.params.budget=10;assert.equal(repairFacility(s,s.camp),'');assert.equal(funds(s),0);
  s.hp=10;s.phase='battle';assert.match(repairFacility(s,s.camp),/防守/);assert.equal(s.hp,10);
  s.phase='lost';s.hp=0;assert.ok(repairFacility(s,s.camp));assert.equal(s.hp,0);
});


const modelExports=await import('../src/model.js');
const {createCampaign,beginBattle,restoreNight,restartCampaign,campaignComplete}=await import('../src/model.js');
test('连续三晚继承受损 HP 和资金，单晚统计清零且第三晚结束',()=>{
  const wave=[{x:15,y:24,hp:2,count:1,first:1,interval:1,target:-1}];
  const s=createCampaign(DEFAULTS,[wave,wave,wave]);
  s.earned=7;s.repairSpent=2;const money=funds(s);
  for(let day=1;day<=3;day++){
    assert.ok(beginBattle(s));while(s.phase==='battle')stepBattle(s);
    assert.equal(s.hp,30-2*day);assert.equal(funds(s),money);
    assert.equal(campaignComplete(s),day===3);
    assert.equal(enterMorning(s),day<3);
    if(day<3){assert.equal(s.tick,0);assert.equal(s.spawned,0);assert.equal(s.lastNight.leaked,2);assert.equal(enterMorning(s),false);}
  }
  assert.equal(beginBattle(s),null);assert.equal(s.day,3);
});
test('第三晚重试保留之前损伤收入与修复，撤销本晚收入和补炮，快照不被污染',()=>{
  const s=createCampaign();s.day=3;s.sources=s.waves[2];s.hp=22;s.earned=6;s.repairSpent=3;
  clearPlot(s,key(11,24));buildOutpost(s,key(11,24));
  const snapshot=beginBattle(s);
  s.earned+=3;s.nightEarned=3;s.hp=11;s.towers.set(key(7,19),'A');s.phase='lost';
  const retry=restoreNight(snapshot);assert.equal(retry.day,3);assert.equal(retry.hp,22);assert.equal(retry.earned,6);
  assert.equal(retry.repairSpent,3);assert.equal(retry.nightEarned,0);assert.equal(retry.towers.size,0);assert.equal(retry.outposts.get(key(11,24)).day,3);
  retry.outposts.get(key(11,24)).day=10;assert.equal(snapshot.outposts.get(key(11,24)).day,3);
  const fresh=restartCampaign(s);assert.equal(fresh.day,1);assert.equal(fresh.hp,30);assert.equal(funds(fresh),100);assert.equal(fresh.outposts.size,0);
});
test('预留未来源头但允许封路，第三天仍可修复，失败不能进入次日',()=>{
  const s=createCampaign({...DEFAULTS,controlRadius:30});const future=key(15,1);
  assert.ok(changeWall(s,future));assert.ok(buildOutpost(s,future));
  for(const [x,y] of [[14,1],[16,1],[15,0]])assert.equal(changeWall(s,key(x,y)),'');
  assert.equal(changeWall(s,key(15,2)),'');
  s.day=3;s.hp=27;const before=funds(s);assert.equal(repairFacility(s,s.camp),'');assert.equal(funds(s),before-3);
  s.phase='lost';assert.equal(enterMorning(s),false);
});
test('跨晚击杀只累计一次，不因进入次日重复发钱',()=>{
  const wave=[{x:15,y:20,hp:2,count:1,first:1,interval:1}];const s=createCampaign(DEFAULTS,[wave,wave,wave]);
  changeWall(s,key(14,20));s.towers.set(key(14,20),'A');
  for(let day=1;day<=3;day++){beginBattle(s);stepBattle(s);assert.equal(s.earned,day*2);assert.equal(s.nightEarned,2);stepBattle(s);assert.equal(s.earned,day*2);enterMorning(s);assert.equal(s.earned,day*2);}
});

// 经营投资跨晚固定；收益必须和真实控制及重试快照一致。
test('生产建设、当天全返、跨天返还一半，资金不足不改变设施',async()=>{
  const {buildProduction,removeProduction,productionError}=await import('../src/model.js');
  const s=createCampaign({...DEFAULTS,productionCostPerCell:8,productionIncomePerCell:1}),id=key(11,24);s.day=2;
  assert.equal(buildProduction(s,id),'');assert.equal(funds(s),80);
  assert.equal(removeProduction(s,id),'');assert.equal(funds(s),100);
  assert.ok(productionError(s,key(3,17)));assert.equal(changeWall(s,id),'');assert.equal(buildProduction(s,id),'');changeWall(s,id,true);
  buildProduction(s,id);const snapshot=beginBattle(s);assert.ok(removeProduction(s,id));
  s.phase='build';s.day=3;const prior=funds(s);assert.equal(removeProduction(s,id),'');assert.equal(funds(s),prior+10);assert.equal(removeProduction(restoreNight(snapshot),id),'');
  const poor=createCampaign({...DEFAULTS,productionCostPerCell:8,productionIncomePerCell:1,budget:19});assert.ok(buildProduction(poor,id));assert.equal(poor.production.size,0);
});
test('经营胜利结算一次、跨晚继承，失败不发钱，重试不复制收益',async()=>{
  const {createCampaign,buildProduction,beginBattle,restoreNight,settleEconomy,enterMorning}=await import('../src/model.js');
  const waves=Array.from({length:3},()=>[{x:15,y:24,hp:1,count:1,first:1,interval:1,target:-1}]);
  const s=createCampaign({...DEFAULTS,productionCostPerCell:8,productionIncomePerCell:1},waves);s.day=2;buildProduction(s,key(11,24));buildProduction(s,key(19,26));
  const snap=beginBattle(s);while(s.phase==='battle')stepBattle(s);
  assert.equal(s.phase,'won');assert.equal(s.nightEconomy,8);assert.equal(funds(s),68);settleEconomy(s);assert.equal(funds(s),68);
  assert.equal(funds(restoreNight(snap)),60);enterMorning(s);assert.equal(s.lastNight.economy,8);assert.equal(s.nightEconomy,0);
  beginBattle(s);while(s.phase==='battle')stepBattle(s);assert.equal(s.economyEarned,16);
  const lost=restoreNight(snap);lost.hp=1;beginBattle(lost);while(lost.phase==='battle')stepBattle(lost);assert.equal(lost.phase,'lost');assert.equal(lost.economyEarned,0);
});


test('多格街区任意格操作同一投资，整块控制才有生产资格',async()=>{
  const {productionCells,productionError,buildProduction,removeProduction,expectedIncome}=await import('../src/model.js');
  const s=createCampaign({...DEFAULTS,productionCostPerCell:8,productionIncomePerCell:1,budget:70,controlRadius:30});s.day=2;
  assert.equal(productionCells(key(12,25)).length,4);assert.equal(buildProduction(s,key(12,25)),'');
  assert.equal(s.production.size,1);assert.equal(funds(s),50);assert.ok(buildProduction(s,key(11,24)));
  assert.ok(changeWall(s,key(12,25)));assert.ok(buildOutpost(s,key(12,25)));
  assert.equal(removeProduction(s,key(11,25)),'');assert.equal(funds(s),70);
  assert.equal(buildProduction(s,key(4,24)),'');assert.equal(funds(s),14);assert.equal(expectedIncome(s),9);
  assert.match(productionError(s,key(11,24)),/资金不足/);
  const partial=createCampaign({...DEFAULTS,productionCostPerCell:8,productionIncomePerCell:1,controlRadius:1});partial.day=2;assert.match(productionError(partial,key(11,24)),/缺.*格控制/);
});
test('街区布局不重叠、不覆盖源头，报价按基准单价和面积曲线计算',async()=>{
  const {PRODUCTION_SITES}=await import('../src/config.js');
  const {createCampaign,productionCells,buildProduction,productionQuote,validateParams}=await import('../src/model.js');
  const s=createCampaign(),seen=new Set();s.day=2;
  for(const p of PRODUCTION_SITES)for(const id of productionCells(key(p.x,p.y))){assert.ok(!seen.has(id));assert.ok(s.blocked.has(id));assert.notEqual(id,s.camp);seen.add(id);}
  for(const source of s.waves.flat())assert.ok(!seen.has(key(source.x,source.y)));
  const params={...DEFAULTS,productionCostPerCell:9,productionIncomePerCell:2};
  assert.deepEqual(productionQuote({...s,params},key(2,22)),{area:9,cost:63,income:18});
  assert.deepEqual(productionQuote({...s,params},key(11,24)),{area:4,cost:23,income:8});
  buildProduction(s,key(11,24));assert.ok(validateParams({...DEFAULTS,controlRadius:3},s));
  assert.match(validateParams({...DEFAULTS,productionCostPerCell:NaN},s),/每格/);
  assert.match(validateParams({...DEFAULTS,productionIncomePerCell:-1},s),/每格/);
});

test('自定义击杀金币按原始成员累计，奖励金额与消灭数量分开',()=>{
  const s=createState([{x:1,y:1,hp:1,count:1,first:100,interval:1}]);s.params.killReward=5;s.phase='battle';
  s.field.next=new Map([[1,3],[2,3]]);s.towers.set(3,'A');
  s.enemies=[{id:1,hp:1,max:1,members:1,sources:[0]},{id:2,hp:1,max:2,members:2,sources:[1]}];
  stepBattle(s);const killed=s.events.find(e=>e.type==='kill');
  assert.equal(s.earned,15);assert.equal(s.nightEarned,15);assert.equal(s.removed,3);assert.equal(killed.value,15);assert.equal(killed.members,3);
  stepBattle(s);assert.equal(s.earned,15);
  assert.match(validateParams({...s.params,killReward:1.5},s),/击杀奖励/);
});



test('各类设施跨天返还50%，地块换建与重试不制造资金',async()=>{
  const {demolitionQuote,buildProduction,removeProduction}=await import('../src/model.js');
  const s=createCampaign({...DEFAULTS,productionCostPerCell:8,productionIncomePerCell:1,budget:200}),wall=key(14,18),tower=key(13,18),post=key(19,26);s.day=3;
  changeWall(s,wall);buildTower(s,tower,'A');clearPlot(s,post);buildOutpost(s,post);buildProduction(s,key(11,24));
  const prior=funds(s);s.day=4;assert.equal(demolitionQuote(s,post).refund,12);
  assert.equal(removeTower(s,tower),'');assert.equal(changeWall(s,wall,true),'');assert.equal(removeOutpost(s,post),'');assert.equal(removeProduction(s,key(12,25)),'');
  assert.equal(funds(s),prior+28);assert.equal(s.demolitionSpent,29);
  changeWall(s,wall);buildTower(s,tower,'A');buildOutpost(s,post);
  assert.equal(demolitionQuote(s,post).refund,25);const snapshot=beginBattle(s);
  assert.ok(removeTower(s,tower));assert.ok(removeOutpost(s,post));assert.ok(changeWall(s,wall,true));
  const retry=restoreNight(snapshot);assert.equal(demolitionQuote(retry,tower).refund,10);
  removeTower(retry,tower);changeWall(retry,wall,true);removeOutpost(retry,post);assert.equal(funds(retry),prior+28);
  assert.equal(funds(restartCampaign(retry)),200);
});
test('夜间独立补炮建造日保留到次日，损坏维修不刷新建造日',()=>{
  const s=createCampaign(),id=key(14,18);s.day=2;
  assert.equal(buildTower(s,id,'A'),'');assert.equal(modelExports.demolitionQuote(s,id).refund,10);removeTower(s,id);
  beginBattle(s);assert.equal(buildTower(s,id,'A'),'');s.phase='won';enterMorning(s);
  assert.equal(modelExports.demolitionQuote(s,id).day,2);assert.equal(modelExports.demolitionQuote(s,id).refund,5);
  s.towerHealth.get(id).hp=0;assert.equal(repairFacility(s,id),'');assert.equal(modelExports.demolitionQuote(s,id).day,2);
});

test('默认十五晚可完整推进，最后一晚只结算一次',async()=>{
  const {buildProduction,settleEconomy}=await import('../src/model.js');
  const s=createCampaign({...DEFAULTS,productionCostPerCell:8,productionIncomePerCell:1,campHP:10000});assert.equal(s.waves.length,15);
  for(let day=1;day<=15;day++){
    if(day===2)assert.equal(buildProduction(s,key(11,24)),'');
    assert.equal(validateSources(s.sources,s),'');beginBattle(s);
    for(let tick=0;s.phase==='battle'&&tick<300;tick++)stepBattle(s);
    assert.equal(s.phase,'won');assert.equal(s.economyEarned,(day-1)*4);settleEconomy(s);assert.equal(s.economyEarned,(day-1)*4);
    assert.equal(campaignComplete(s),day===15);assert.equal(enterMorning(s),day<15);
  }
  assert.equal(s.day,15);assert.equal(beginBattle(s),null);
});

test('昨夜经营报告固定控制不足的停产数量，次日拆建不改写历史',async()=>{
  const {buildProduction,settleEconomy,removeProduction}=await import('../src/model.js');
  const s=createCampaign({...DEFAULTS,productionCostPerCell:8,productionIncomePerCell:1});s.day=2;buildProduction(s,key(11,24));buildProduction(s,key(19,26));
  const snapshot=beginBattle(s);s.params.controlRadius=4;s.camp=key(19,25);s.phase='won';s.nightEarned=3;
  settleEconomy(s);
  assert.equal(s.nightEconomy,4);assert.deepEqual(s.productionReport,{productive:1,stopped:1,missed:4});
  settleEconomy(s);assert.equal(s.economyEarned,4);
  enterMorning(s);assert.equal(s.lastNight.economy,4);assert.equal(s.lastNight.earned,3);
  s.params.controlRadius=9;removeProduction(s,key(19,26));
  assert.equal(s.lastNight.productive,1);assert.equal(s.lastNight.stopped,1);assert.equal(s.lastNight.missed,4);
  assert.equal(restoreNight(snapshot).productionReport,null);
  beginBattle(s);assert.equal(s.productionReport,null);assert.equal(s.lastNight.missed,4);
});


test('每格收入减半保留小数，整块最终收入向上取整',async()=>{
  const {productionQuote}=await import('../src/model.js');
  assert.equal(DEFAULTS.productionCostPerCell,2);assert.equal(DEFAULTS.productionIncomePerCell,0.5);
  const s=createCampaign();assert.equal(validateParams(s.params,s),'');
  const quote=(width,height)=>productionQuote({...s,sites:[{x:0,y:0,width,height}]},0);
  assert.deepEqual(quote(2,2),{area:4,cost:5,income:2});
  assert.equal(quote(3,3).income,5);
  assert.deepEqual(quote(5,5),{area:25,cost:76,income:19});
});

test('敌群预告区分出生批次和抵达结果，重试清空结果',async()=>{
  const {beginBattle,restoreNight}=await import('../src/model.js');
  const s=createState([{x:15,y:24,hp:2,count:2,first:1,interval:3}]);
  const snapshot=beginBattle(s);assert.ok(snapshot);
  stepBattle(s);assert.deepEqual(s.enemies[0].origins,['0:0']);assert.equal(s.enemyOutcomes.size,0);
  for(let i=0;i<5;i++)stepBattle(s);
  assert.deepEqual([...s.enemyOutcomes],[['0:0','leaked'],['0:1','leaked']]);
  assert.equal(restoreNight(snapshot).enemyOutcomes.size,0);
});

test('当天全返，旧投入按可配置比例向下取整',()=>{
  const s=createCampaign();s.day=3;const id=key(14,18);buildTower(s,id,'A');
  for(const day of [3,4]){s.day=day;for(const percent of [0,35,50,100]){s.params.demolitionRefundPercent=percent;assert.equal(modelExports.demolitionQuote(s,id).refund,day===3?10:Math.floor(10*percent/100));}}
  assert.match(validateParams({...s.params,demolitionRefundPercent:101},s),/拆除返还/);
});
