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
