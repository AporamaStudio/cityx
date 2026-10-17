import test from 'node:test';
import assert from 'node:assert/strict';
globalThis.location={search:'?width=128&height=128'};
const {SIZE,DEFAULTS}=await import('../src/config.js');
const {MAP_DEFAULTS,battleMapSize}=await import('../src/map-settings.js');
const {generateCityMap,walkableDistances}=await import('../src/city-map.js');
const {createCampaign,key,xy,productionSite,productionQuote,buildProduction,placementError,buildTower,beginBattle,restoreNight}=await import('../src/model.js');

test('128格对照保留全部地标、真实园区尺寸与连通道路，主游戏格号和重试一致',()=>{
  assert.equal(SIZE,128);assert.equal(battleMapSize({width:128,height:128}),128);assert.deepEqual(xy(key(127,127)),[127,127]);
  for(const seed of ['cityx-01',1,2,3]){
    const map=generateCityMap({...MAP_DEFAULTS,width:128,height:128,seed}),d=walkableDistances(map);assert.equal(map.blocks.filter(p=>p.landmark).length,12);
    map.tiles.forEach((type,id)=>assert.equal(d[id]>=0,['road','open'].includes(type)));
  }
  const layout=generateCityMap({...MAP_DEFAULTS,width:128,height:128}),state=createCampaign({...DEFAULTS,budget:1000},undefined,layout),plot=state.sites.find(p=>p.role==='starter'),id=key(plot.x,plot.y);state.day=2;
  assert.equal(productionSite(id,state),plot);assert.equal(productionQuote(state,id).cost,5);assert.equal(buildProduction(state,id),'');
  const cannon=Array.from({length:128*128},(_,i)=>i).find(i=>!placementError(state,i));assert.notEqual(cannon,undefined);assert.equal(buildTower(state,cannon,'A'),'');
  const retry=restoreNight(beginBattle(state));assert.equal(retry.layout.width,128);assert.equal(retry.production.size,1);assert.equal(retry.towers.size,1);assert.equal(productionSite(id,retry),retry.sites.find(p=>p.role==='starter'));
});
