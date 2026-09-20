import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULTS } from '../src/config.js';
import { key, createState, coverage, pathFrom, funds, placementError, validateSources, stepBattle } from '../src/model.js';

test('所有可达格严格接近篝火，预览到达目标，默认三路实际合并',()=>{
  const s=createState();
  for(const [id,next] of s.field.next) assert.equal(s.field.distance.get(next),s.field.distance.get(id)-1);
  for(const source of s.sources) assert.equal(pathFrom(key(source.x,source.y),s.field).at(-1),s.camp);
  s.phase='battle';for(let i=0;i<100&&s.phase==='battle';i++)stepBattle(s);
  assert.equal(s.phase,'lost');assert.ok(s.merges>0);
});
test('曼哈顿覆盖与边界裁切，预算和禁建格',()=>{
  assert.equal(coverage(key(15,15),1).length,5);assert.equal(coverage(key(15,15),2).length,13);assert.equal(coverage(0,2).length,6);
  const s=createState();assert.ok(placementError(s,s.camp));assert.ok(placementError(s,key(5,3)));assert.ok(placementError(s,key(2,14)));
  for(let x=0;x<10;x++)s.towers.add(key(x,28));assert.equal(funds(s),0);assert.match(placementError(s,key(20,28)),/预算/);
  s.towers.delete(key(0,28));assert.equal(funds(s),10);
});
test('同时入格先合并再扣一次火力，满值相加且不回血',()=>{
  const s=createState([{x:1,y:1,hp:1,count:1,first:100,interval:1}]);s.phase='battle';
  s.field.next=new Map([[1,3],[2,3]]);s.enemies=[{id:1,hp:3,max:10,members:1,sources:[0]},{id:2,hp:8,max:10,members:1,sources:[1]}];s.towers.add(3);
  stepBattle(s);assert.deepEqual(s.enemies.map(e=>[e.hp,e.max,e.members]),[[9,20,2]]);assert.equal(s.damage,2);assert.equal(s.merges,1);
});
test('篝火格先受火力再漏剩余生命，到达者移除，不重复扣命',()=>{
  const s=createState([{x:15,y:24,hp:5,count:1,first:1,interval:1}]);s.towers.add(key(14,25));s.phase='battle';
  stepBattle(s);assert.equal(s.hp,30);stepBattle(s);assert.equal(s.hp,27);assert.equal(s.leaked,3);assert.equal(s.phase,'won');stepBattle(s);assert.equal(s.hp,27);
});
test('出生入格受伤、击杀后不漏怪、无预算修改战斗',()=>{
  const s=createState([{x:0,y:0,hp:2,count:1,first:1,interval:1}]);s.towers.add(key(1,0));s.phase='battle';stepBattle(s);
  assert.equal(s.phase,'won');assert.equal(s.removed,1);assert.equal(s.leaked,0);assert.equal(s.damage,2);assert.ok(placementError(s,key(2,0)));
});
test('非法配置被拒绝，重试复制布局并恢复预算与状态',()=>{
  const s=createState();const invalid=structuredClone(DEFAULTS.sources);invalid[0].x=30;assert.ok(validateSources(invalid,s));
  invalid[0].x=25;assert.match(validateSources(invalid,s),/重复/);
  s.towers.add(key(0,0));s.hp=1;s.tick=50;const retry=createState(s.sources,s.towers);assert.equal(retry.hp,30);assert.equal(retry.tick,0);assert.equal(funds(retry),90);retry.towers.clear();assert.equal(s.towers.size,1);
});
