import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULTS,SIZE} from '../src/config.js';
import {key,createCampaign,controlMask,rawControlMask,placementError,buildTower,removeTower,clearPlot,buildHousing,buildProduction,funds,embeddingQuote,beginBattle,restoreNight,towerCapacity} from '../src/model.js';
import {createTowerOverlay} from '../src/tower-overlay.js';

function setup(){
  const blocks=[{x:12,y:10,width:3,height:3,kind:'building',ruinType:'production'},{x:15,y:10,width:3,height:3,kind:'building',ruinType:'housing'},{x:9,y:12,width:3,height:3,kind:'open'}];
  const tiles=Array(SIZE*SIZE).fill('road');
  for(const p of blocks)for(let y=p.y;y<p.y+p.height;y++)for(let x=p.x;x<p.x+p.width;x++)tiles[key(x,y)]=p.kind==='open'?'open':'block';
  const wave=[{x:10,y:4,hp:100,count:1,first:1,interval:2}];
  const s=createCampaign({...DEFAULTS,budget:1000,initialPopulation:30,controlRadius:2},[wave,wave,wave],{width:SIZE,height:SIZE,camp:{x:10,y:10},blocks,tiles});s.day=3;return s;
}
const origin=key(12,10),far=key(14,12),remote=key(15,10);
const overlay=s=>createTowerOverlay(s,controlMask(s));
function assertMatches(s,view=overlay(s),moving=new Set()){
  for(const type of ['A','B']){
    const expected=new Set();for(let id=0;id<SIZE*SIZE;id++)if(!moving.has(id)&&!placementError(s,id,type))expected.add(id);
    assert.deepEqual(view.eligible(type),expected);
  }
}

test('缓存高亮与实际校验一致：整栋边界建筑、邻栋不连锁、空地不架炮',()=>{
  const s=setup(),before=structuredClone(s),view=overlay(s);
  assert.equal(rawControlMask(s).has(far),false);assert.ok(view.eligible('A').has(far));
  assert.ok(view.plots.get(origin).controlled);assert.equal(view.plots.get(remote).controlled,false);
  assert.ok(!view.eligible('A').has(remote));assert.ok(!view.eligible('A').has(key(10,12)));
  assertMatches(s,view);assert.strictEqual(view.eligible('A'),view.eligible('A'));assert.deepEqual(s,before);
});
test('建设、容量满、拆炮及拆楼后重建缓存，不留下旧高亮',()=>{
  const s=setup();
  for(const cell of [origin,key(13,10),far])assert.equal(buildTower(s,cell,'A'),'');
  let view=overlay(s);assert.deepEqual(view.plots.get(origin).capacity,towerCapacity(s,origin));
  assert.equal(view.eligible('A').size,0);assertMatches(s,view);
  assert.equal(removeTower(s,far),'');view=overlay(s);assert.ok(view.eligible('A').has(far));assertMatches(s,view);
  for(const cell of [...s.towers.keys()])assert.equal(removeTower(s,cell),'');
  assert.equal(clearPlot(s,origin),'');view=overlay(s);assert.equal(view.plots.get(origin).controlled,false);assert.equal(view.eligible('A').size,0);assertMatches(s,view);
});
test('资金、夜间加急、敌人所在及进入格、重试都反映在新缓存中',()=>{
  const s=setup();s.params.budget=10;assert.ok(overlay(s).eligible('A').has(far));assert.equal(overlay(s).eligible('B').size,0);
  const snapshot=beginBattle(s);assert.equal(overlay(s).eligible('A').size,0);assertMatches(s);
  s.debugGold=100;s.enemies=[{id:origin,hp:100,max:100,members:1}];
  const moving=new Set([far]),view=createTowerOverlay(s,controlMask(s),moving);
  assert.ok(!view.eligible('A').has(origin));assert.ok(!view.eligible('A').has(far));assertMatches(s,view,moving);
  const retry=restoreNight(snapshot);assertMatches(retry);assert.equal(retry.debugGold,0);assert.ok(overlay(retry).eligible('A').has(far));
});
test('住房嵌炮仍检查经营劳动力，而非仅凭边缘与余额放行',()=>{
  const s=setup();s.params.controlRadius=9;s.explored=new Set(Array.from({length:SIZE*SIZE},(_,i)=>i));
  assert.equal(buildHousing(s,remote),'');s.debugPopulation=-s.params.initialPopulation;
  // 9格住房提供5人；用满这5人后，移除一个住房格不能再架炮。
  s.outposts=new Map([[key(10,11),{day:3}]]);s.params.outpostWorkers=5;
  assertMatches(s);assert.equal(overlay(s).eligible('A').has(remote),false);
});

test('架炮只看完整造价，余额恢复后资格与高亮同步恢复',()=>{
  for(const [phase,type,balance,cost] of [['build','A',8,10],['build','B',18,20],['battle','A',18,20],['battle','B',38,40]]){
    const s=setup();assert.equal(buildProduction(s,origin),'');s.phase=phase;s.debugGold+=balance-funds(s);
    assert.equal(embeddingQuote(s,origin).refund,0);
    const before=structuredClone(s);assert.match(buildTower(s,origin,type),/预算不足/);assert.deepEqual(s,before);
    assert.equal(overlay(s).eligible(type).size,0);
    s.debugGold+=cost-funds(s);assert.ok(overlay(s).eligible(type).has(origin));
    assert.equal(buildTower(s,origin,type),'');assert.equal(funds(s),0);
  }
  const s=setup();s.params.weapons.A.cost=7;s.params.budget=6;
  assert.equal(overlay(s).eligible('A').size,0);s.params.budget=7;assert.ok(overlay(s).eligible('A').has(origin));
});
