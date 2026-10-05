import test from 'node:test';
import assert from 'node:assert/strict';
import {generateCityMap,walkableDistances} from '../src/city-map.js';
import {MAP_DEFAULTS,readMapSettings,mapSearch} from '../src/map-settings.js';
import {DEFAULTS} from '../src/config.js';
import {createCampaign,key,productionCells,productionControlled,buildProduction,removeProduction,wallPreview,changeWall,placementError,buildTower,outpostError,buildOutpost,validateSources,beginBattle,restoreNight,restartCampaign,stepBattle,enterMorning} from '../src/model.js';

test('尺寸、特殊设施和紧邻实验保持完整分区与通路',()=>{
  let joined=0;
  for(const [width,height] of [[30,30],[50,100]])for(const [minBlock,maxBlock] of [[2,5],[3,6],[4,4]])for(let seed=0;seed<12;seed++){
    const map=generateCityMap({width,height,minBlock,maxBlock,seed,special:true,touching:true});
    const cells=new Set();
    for(const b of map.blocks){
      assert.ok(b.special?b.width>=10&&b.width<=30&&b.height>=10&&b.height<=30:b.width>=minBlock&&b.width<=maxBlock&&b.height>=minBlock&&b.height<=maxBlock);
      for(let y=b.y;y<b.y+b.height;y++)for(let x=b.x;x<b.x+b.width;x++){const id=y*width+x;assert.ok(!cells.has(id));cells.add(id);assert.equal(map.tiles[id],b.kind==='open'?'open':'block');}
    }
    const d=walkableDistances(map);for(let id=0;id<map.tiles.length;id++)assert.equal(d[id]>=0,map.tiles[id]!=='block');
    assert.equal(map.stats.special,1);joined+=map.stats.joined;
  }
  assert.ok(joined>0);
});
test('放不下的特殊区块不偷偷缩小，地图参数可通过链接复现',()=>{
  const settings={...MAP_DEFAULTS,minBlock:3,maxBlock:6,special:true,specialMin:30,specialMax:30,touching:true};
  assert.deepEqual(readMapSettings('?'+mapSearch(settings)),settings);
  assert.equal(generateCityMap(settings).stats.special,0);
  assert.equal(generateCityMap({...settings,width:100,height:100}).stats.special,1);
  assert.throws(()=>generateCityMap({minBlock:6,maxBlock:3}));
});
test('生成地图接入路线、矩形经营、建设限制及重试',()=>{
  const layout=generateCityMap(MAP_DEFAULTS),s=createCampaign({...DEFAULTS,budget:1000},undefined,layout);
  for(const wave of s.waves)assert.equal(validateSources(wave,s),'');
  const b=s.sites.find(b=>b.width!==b.height&&productionControlled(s,key(b.x,b.y))),id=key(b.x,b.y);
  assert.equal(productionCells(id,s).length,b.width*b.height);assert.ok(!s.field.distance.has(id));
  assert.ok(wallPreview(s,id).error);assert.ok(placementError(s,id));assert.ok(outpostError(s,id));
  assert.equal(buildProduction(s,id),'');assert.ok(!s.field.distance.has(id));
  const road=layout.tiles.findIndex((t,id)=>t==='road'&&!wallPreview(s,id).error);
  assert.equal(changeWall(s,road),'');assert.equal(buildTower(s,road,'A'),'');
  const post=layout.tiles.findIndex((t,id)=>t==='open'&&!outpostError(s,id));
  assert.equal(buildOutpost(s,post),'');
  const snap=beginBattle(s);assert.ok(snap);
  const restored=restoreNight(snap);assert.deepEqual(restored.layout,layout);assert.ok(restored.production.has(id));
  const restarted=restartCampaign(restored);assert.deepEqual(restarted.layout,layout);assert.equal(restarted.production.size,0);assert.deepEqual(restarted.sources,s.sources);
  restored.day=2;assert.ok(removeProduction(restored,id));
});
test('新地图完成五晚，敌人每步只进入道路或开放场地',()=>{
  const s=createCampaign({...DEFAULTS,campHP:10000},undefined,generateCityMap(MAP_DEFAULTS));
  for(let day=1;day<=5;day++){
    assert.ok(beginBattle(s));
    for(let i=0;i<250&&s.phase==='battle';i++){
      stepBattle(s);for(const enemy of s.enemies)assert.ok(['road','open'].includes(s.layout.tiles[enemy.id]));
    }
    assert.equal(s.phase,'won');assert.equal(enterMorning(s),day<5);
  }
});
