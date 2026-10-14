import test from 'node:test';
import assert from 'node:assert/strict';
import {generateCityMap,walkableDistances} from '../src/city-map.js';
import {MAP_DEFAULTS,mapSearch,readMapSettings} from '../src/map-settings.js';
import {DEFAULTS} from '../src/config.js';
import {createCampaign,key,validateSources,wallPreview,outpostError,rebuildTerrain} from '../src/model.js';
import {naturalGroundAt} from '../src/natural-terrain.js';

test('自然河道稳定、保护目标和起步街区，两岸经桥仍完整连通',()=>{
  for(let seed=0;seed<24;seed++)for(const mainRoadWidth of [2,3]){
    const map=generateCityMap({...MAP_DEFAULTS,seed,mainRoadWidth}),distances=walkableDistances(map);
    assert.deepEqual(map,generateCityMap({...MAP_DEFAULTS,seed,mainRoadWidth}));
    assert.ok(map.natural.river);assert.ok(map.stats.water>100);assert.equal(map.stats.banks,2);assert.equal(map.stats.hospital,1);
    for(const role of ['starter','starterLarge','starterHousing','camp','goal'])assert.ok(map.blocks.some(p=>p.role===role));
    map.tiles.forEach((t,id)=>assert.equal(distances[id]>=0,['road','open'].includes(t),`seed ${seed}, cell ${id}`));
    for(const p of map.blocks)for(let y=p.y;y<p.y+p.height;y++)for(let x=p.x;x<p.x+p.width;x++)assert.equal(map.tiles[y*map.width+x],p.kind==='open'?'open':'block');
    assert.equal(map.natural.bridges[2].w,mainRoadWidth);
  }
});
test('水域作为固定自然障碍，不能造墙或瞭望塔；桥面高差只服务视觉',()=>{
  const layout=generateCityMap(MAP_DEFAULTS),s=createCampaign({...DEFAULTS,budget:10000,initialPopulation:100,controlRadius:100},undefined,layout);s.day=3;
  s.explored=new Set(Array.from({length:3600},(_,i)=>i));const water=layout.tiles.indexOf('water');assert.ok(s.fixedWalls.has(water));assert.ok(!s.field.distance.has(water));
  assert.match(wallPreview(s,water).error,/自然障碍/);assert.match(outpostError(s,water),/可通行/);
  for(const wave of s.waves)assert.equal(validateSources(wave,s),'');
  for(const p of s.sites)if(p.role!=='camp')s.plotContents.set(key(p.x,p.y),{status:'building',type:'production'});
  rebuildTerrain(s);for(const source of s.sourceCatalog)assert.ok(s.field.distance.has(key(source.x,source.y)));
  const b=layout.natural.bridges[2];assert.equal(naturalGroundAt(layout,b.x+.5,b.y+.5),.04);assert.equal(naturalGroundAt(layout,layout.camp.x,layout.camp.y),0);
  const settings={...MAP_DEFAULTS,nature:false};assert.deepEqual(readMapSettings('?'+mapSearch(settings)),settings);assert.equal(generateCityMap(settings).stats.water,0);
});
