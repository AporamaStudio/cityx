import test from 'node:test';
import assert from 'node:assert/strict';
// 独立测试进程在模块加载前选择大图，避免用旧60格编号验证256格状态。
globalThis.location={search:''};
const {SIZE,DEFAULTS}=await import('../src/config.js');
const {MAP_DEFAULTS,battleMapSize}=await import('../src/map-settings.js');
const {generateCityMap,walkableDistances}=await import('../src/city-map.js');
const {createCampaign,key,xy,productionSite,productionControlled,productionQuote,buildProduction,buildTower,placementError,beginBattle,restoreNight,stepBattle}=await import('../src/model.js');

test('256格主图生成、坐标、道路与起步建设、夜防重试使用同一尺寸',()=>{
  assert.equal(SIZE,256);assert.equal(battleMapSize(MAP_DEFAULTS),256);
  assert.equal(battleMapSize({width:60,height:60}),60);
  assert.throws(()=>battleMapSize({width:50,height:100}));
  const layout=generateCityMap(MAP_DEFAULTS),seen=new Set(),d=walkableDistances(layout);
  assert.equal(layout.tiles.length,65536);assert.deepEqual(xy(key(255,255)),[255,255]);
  for(const p of layout.blocks)for(let y=p.y;y<p.y+p.height;y++)for(let x=p.x;x<p.x+p.width;x++){
    const id=key(x,y);assert.ok(!seen.has(id));seen.add(id);assert.equal(layout.tiles[id],p.kind==='open'?'open':'block');
  }
  layout.tiles.forEach((t,i)=>assert.equal(d[i]>=0,['road','open'].includes(t)));
  const s=createCampaign({...DEFAULTS,budget:1000},undefined,layout),p=s.sites.find(p=>p.role==='starter'),id=key(p.x,p.y);
  s.day=2;assert.equal(productionSite(id,s),p);assert.ok(productionControlled(s,id));assert.equal(productionQuote(s,id).cost,5);assert.equal(buildProduction(s,id),'');
  const cannon=Array.from({length:65536},(_,i)=>i).find(i=>!placementError(s,i));assert.notEqual(cannon,undefined);assert.equal(buildTower(s,cannon,'A'),'');
  const snapshot=beginBattle(s);assert.ok(snapshot);stepBattle(s);
  const retry=restoreNight(snapshot);assert.equal(retry.layout.width,256);assert.equal(retry.production.size,1);assert.equal(retry.towers.size,1);
  assert.equal(productionSite(id,retry),retry.sites.find(p=>p.role==='starter'));
});
