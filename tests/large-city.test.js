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

test('大城地标完整保留真实园区尺寸、身份和铁路连接，禁止用普通经营工具换建',async()=>{
  const {CITY_LANDMARKS}=await import('../src/city-landmarks.js');
  const {clearPlot,outpostError,productionError}=await import('../src/model.js');
  for(const seed of ['cityx-01',0,1,2,3,4]){
    const map=generateCityMap({...MAP_DEFAULTS,seed}),landmarks=map.blocks.filter(p=>p.landmark);
    assert.equal(landmarks.length,12);
    for(const spec of CITY_LANDMARKS){const p=landmarks.find(p=>p.landmark===spec.id);assert.ok(p);assert.deepEqual([p.width*20,p.height*20],spec.meters);}
    const school=landmarks.find(p=>p.landmark==='school'),athletics=landmarks.find(p=>p.landmark==='athletics');assert.equal(school.y,athletics.y);
    const station=landmarks.find(p=>p.landmark==='railway');assert.ok(station.y>=14);assert.ok(station.y<map.height*.12);
    for(let x=1;x<map.width-1;x++){
      const id=key(x,map.railBand.y);assert.ok(['rail','road','block'].includes(map.tiles[id]));
      if(map.tiles[id]==='rail')assert.ok(map.nonTraversable.includes(id));
      if(map.tiles[id]==='block')assert.ok(x>=station.x&&x<station.x+station.width);
    }
    const d=walkableDistances(map);map.tiles.forEach((t,i)=>assert.equal(d[i]>=0,['road','open'].includes(t)));
  }
  const s=createCampaign({...DEFAULTS,budget:1000},undefined,generateCityMap(MAP_DEFAULTS));s.day=3;
  for(const p of s.sites.filter(p=>p.landmark)){
    const id=key(p.x,p.y);s.camp=key(p.x-1,p.y);s.explored.add(id);assert.match(clearPlot(s,id),/地标保留/);assert.match(productionError(s,id),/地标保留/);assert.ok(outpostError(s,id));assert.ok(placementError(s,id));
  }
});
