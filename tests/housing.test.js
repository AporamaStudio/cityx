import {generateCityMap} from '../src/city-map.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULTS} from '../src/config.js';
import {createState,key,population,housingQuote,buildHousing,removeHousing,buildProduction,removeProduction,productionError,funds,demolitionQuote,beginBattle,restoreNight,restartCampaign,validateParams,clearPlot,plotContent,clearingLabor,applyTestScenario,createCampaign,enterMorning,productionControlled} from '../src/model.js';
const home=key(11,24),factory=key(19,26);
function setup(initialPopulation=0){const s=createState(undefined,undefined,undefined,{...DEFAULTS,controlRadius:30,budget:1000,initialPopulation});s.plotContents.set(home,{status:'ruin',type:'housing'});s.day=2;return s;}
test('住房当天入住，人口独立于 HP；生产占用、拆除释放劳动力',()=>{
  const s=setup();assert.match(productionError(s,factory),/劳动力不足/);
  assert.equal(buildHousing(s,home),'');assert.deepEqual(housingQuote(s,home),{cost:16,residents:2});
  assert.deepEqual(population(s),{total:2,working:0,free:2});assert.equal(s.hp,30);assert.equal(funds(s),984);
  assert.equal(buildProduction(s,factory),'');assert.deepEqual(population(s),{total:2,working:1,free:1});
  const before=funds(s);assert.match(removeHousing(s,home),/依赖/);assert.equal(funds(s),before);
  assert.equal(removeProduction(s,factory),'');assert.equal(population(s).free,2);
  assert.equal(demolitionQuote(s,home).refund,8);assert.equal(removeHousing(s,home),'');assert.equal(population(s).total,0);
});
test('住房遵守阶段、预算、全块控制与单用途；不足不扣钱',()=>{
  const s=setup();s.day=1;assert.match(buildHousing(s,home),/第 2 天/);s.day=2;
  s.params.budget=15;assert.match(buildHousing(s,home),/资金不足/);assert.equal(funds(s),15);assert.equal(s.housing.size,0);
  s.params.budget=1000;s.params.controlRadius=1;assert.match(buildHousing(s,home),/控制/);s.params.controlRadius=30;
  assert.equal(buildHousing(s,home),'');assert.match(buildProduction(s,home),/其他设施/);assert.match(buildHousing(s,home),/已有/);
  s.phase='battle';assert.match(removeHousing(s,home),/防守/);s.hp=1;assert.equal(population(s).total,2);
});
test('重试保留人口投资，重开清空住房；参数调整不能产生负空闲人口',()=>{
  const s=setup();buildHousing(s,home);buildProduction(s,factory);
  const snap=beginBattle(s);assert.ok(snap);const copy=restoreNight(snap);assert.deepEqual(population(copy),population(s));
  copy.housing.clear();assert.equal(s.housing.size,1);assert.equal(restartCampaign(s).housing.size,0);
  assert.match(validateParams({...s.params,housingCellsPerResident:100,productionCellsPerWorker:1},s),/劳动力不足/);
});

test('废墟只能恢复原用途，拆为空地后可自由换建',()=>{
  const s=setup(12),before=funds(s);
  assert.match(buildHousing(s,factory),/生产废墟/);assert.match(buildProduction(s,home),/住房废墟/);
  assert.equal(funds(s),before);assert.equal(s.housing.size,0);assert.equal(s.production.size,0);
  assert.equal(clearPlot(s,factory),'');assert.equal(plotContent(s,factory).type,null);
  assert.equal(buildHousing(s,factory),'');assert.equal(clearPlot(s,home),'');assert.equal(buildProduction(s,home),'');
});

test('seed 固定两类废墟，起步保留生产；重开还原用途',()=>{
  const layout=generateCityMap({seed:'cityx-01',width:60,height:60,starterPlot:true});
  assert.ok(layout.buildings.some(b=>b.ruinType==='housing'));
  assert.equal(layout.buildings.find(b=>b.role==='starter').ruinType,'production');
  const s=createState(undefined,undefined,undefined,DEFAULTS,undefined,layout),h=layout.buildings.find(b=>b.ruinType==='housing'),id=key(h.x,h.y);
  assert.equal(plotContent(s,id).type,'housing');s.plotContents.set(id,{status:'empty',type:null});
  assert.equal(plotContent(restartCampaign(s),id).type,'housing');
});

test('清理即时生效、不改金币，占用当日人力；不足不清理，次日释放',()=>{
  const s=setup(4),before=funds(s);assert.equal(clearingLabor(s,home),4);
  assert.equal(clearPlot(s,home),'');assert.equal(funds(s),before);assert.equal(population(s).total,4);assert.equal(population(s).free,0);
  assert.match(clearPlot(s,factory),/需要 4 人/);assert.equal(plotContent(s,factory).status,'ruin');
  const snap=beginBattle(s);assert.equal(restoreNight(snap).clearingWorkers,4);
  s.waves=[[],[],[]];s.phase='won';assert.equal(enterMorning(s),true);assert.equal(population(s).free,4);
});
test('测试台设定的是当前资源，保留布局且不伪造经营收入，生产依赖不足则拒绝',()=>{
  const s=createCampaign({...DEFAULTS,controlRadius:30});s.day=2;buildProduction(s,factory);
  assert.equal(applyTestScenario(s,8,1234,20),'');assert.equal(s.day,8);assert.equal(s.phase,'build');
  assert.equal(funds(s),1234);assert.equal(population(s).total,20);assert.equal(s.production.size,1);assert.equal(s.economyEarned,0);
  assert.match(applyTestScenario(s,1,1,0),/生产需要/);assert.equal(s.day,8);assert.equal(funds(s),1234);
  assert.equal(applyTestScenario(s,2,500,10),'');assert.equal(funds(s),500);assert.equal(population(s).total,10);
});
test('开局火光居于3×3广场中心，两块2×2教学废墟完整受控且不重叠',()=>{
  for(const seed of ['cityx-01','a','b','c']){
    const layout=generateCityMap({seed,width:60,height:60,starterPlot:true,minBlock:3,maxBlock:6}),s=createCampaign(DEFAULTS,undefined,layout);
    const plaza=layout.blocks.find(b=>b.role==='camp');assert.deepEqual([plaza.width,plaza.height],[3,3]);
    assert.deepEqual(layout.camp,{x:plaza.x+1,y:plaza.y+1});
    for(const role of ['starter','starterHousing']){const b=layout.blocks.find(b=>b.role===role);assert.deepEqual([b.width,b.height],[2,2]);assert.ok(productionControlled(s,key(b.x,b.y)));}
    const occupied=new Set();for(const b of layout.blocks)for(let y=b.y;y<b.y+b.height;y++)for(let x=b.x;x<b.x+b.width;x++){assert.ok(!occupied.has(key(x,y)));occupied.add(key(x,y));}
  }
});
