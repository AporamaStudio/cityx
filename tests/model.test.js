import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULTS } from '../src/config.js';
import { key, createState, coverage, pathFrom, funds, placementError, validateSources, stepBattle, changeWall, wallPreview, validateParams, fireField } from '../src/model.js';

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
test('出生入格受伤、击杀后不漏怪、无预算修改战斗',()=>{
  const s=createState([{x:0,y:0,hp:2,count:1,first:1,interval:1}]);s.towers.set(key(1,0),'A');s.phase='battle';stepBattle(s);
  assert.equal(s.phase,'won');assert.equal(s.removed,1);assert.equal(s.leaked,0);assert.equal(s.damage,2);assert.ok(placementError(s,key(2,0)));
});
test('非法配置被拒绝，重试复制布局并恢复预算与状态',()=>{
  const s=createState();const invalid=structuredClone(DEFAULTS.sources);invalid[0].x=30;assert.ok(validateSources(invalid,s));
  invalid[0].x=25;assert.match(validateSources(invalid,s),/重复/);
  s.towers.set(key(0,0),'A');s.hp=1;s.tick=50;const retry=createState(s.sources,s.towers);assert.equal(retry.hp,30);assert.equal(retry.tick,0);assert.equal(funds(retry),90);retry.towers.clear();assert.equal(s.towers.size,1);
});


test('墙上建塔、配额回收和拆墙顺序',()=>{
  const s=createState(); const id=key(14,10);
  assert.match(placementError(s,id),/墙上/);assert.equal(changeWall(s,id),'');assert.equal(placementError(s,id),'');
  s.towers.set(id,'B');assert.equal(funds(s),80);assert.match(changeWall(s,id,true),/先拆除/);
  s.towers.delete(id);assert.equal(changeWall(s,id,true),'');assert.equal(s.playerWalls.size,0);
  assert.match(changeWall(s,key(2,14),true),/固定墙/);
  s.params.wallLimit=0;assert.match(changeWall(s,id),/用完/);
});
test('不允许封死篝火，拒绝后实际地图与路径不变；预览与放置一致',()=>{
  const s=createState();for(const [x,y] of [[14,25],[16,25],[15,24]])assert.equal(changeWall(s,key(x,y)),'');
  const before=s.field, walls=s.walls.size, last=key(15,26);
  assert.match(wallPreview(s,last).error,/封死/);assert.match(changeWall(s,last),/封死/);
  assert.equal(s.field,before);assert.equal(s.walls.size,walls);assert.equal(s.playerWalls.has(last),false);
  const id=key(15,10),preview=wallPreview(s,id);assert.equal(preview.error,'');assert.equal(s.walls.has(id),false);
  assert.equal(changeWall(s,id),'');assert.deepEqual(s.field.next,preview.field.next);
});
test('两类火力与形状切换，参数拒绝非法、超预算和超墙块布局',()=>{
  const s=createState();s.towers.set(key(14,14),'A');s.towers.set(key(16,14),'B');
  assert.equal(coverage(key(15,15),1,'square').length,9);assert.equal(coverage(key(15,15),2,'square').length,25);
  const p=structuredClone(s.params);p.weapons.A.cost=90;assert.match(validateParams(p,s),/超出预算/);assert.equal(s.params.weapons.A.cost,10);
  p.budget=200;assert.equal(validateParams(p,s),'');p.weapons.A.range=NaN;assert.match(validateParams(p,s),/武器 A/);
  const q=structuredClone(s.params);changeWall(s,key(14,10));q.wallLimit=0;assert.match(validateParams(q,s),/配额/);
  const retry=createState(s.sources,s.towers,s.playerWalls,s.params);assert.equal(retry.playerWalls.size,1);assert.equal(retry.towers.get(key(16,14)),'B');assert.equal(funds(retry),70);
  assert.equal(fireField(s).get(key(15,14)),3);
  const r=structuredClone(s.params);r.weapons.A.shape='diamond';assert.equal(fireField({...s,params:r}).get(key(15,15)),1);assert.equal(fireField(s).get(key(15,15)),3);
});
