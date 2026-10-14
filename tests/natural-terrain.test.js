import test from 'node:test';
import assert from 'node:assert/strict';
import {generateCityMap,walkableDistances} from '../src/city-map.js';
import {MAP_DEFAULTS,mapSearch,readMapSettings} from '../src/map-settings.js';
import {DEFAULTS} from '../src/config.js';
import {createCampaign,key,validateSources,wallPreview,outpostError,rebuildTerrain} from '../src/model.js';
import {naturalGroundAt,naturalPlants,naturalDetails,hillHeight,lakeOutline} from '../src/natural-terrain.js';

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
test('湖泊与小山使用原生空地，岸树避开道路/水域且布局不随昼夜变化',()=>{
  const map=generateCityMap(MAP_DEFAULTS);assert.equal(map.natural.lakes.length,1);assert.equal(map.natural.hills.length,1);
  const hill=map.natural.hills[0];assert.equal(hillHeight(hill,hill.cx,hill.cy)*20,hill.height);assert.equal(hillHeight(hill,hill.x-1,hill.y-1),0);
  for(const p of lakeOutline(map.natural.lakes[0]))assert.equal(map.tiles[Math.floor(p.y)*map.width+Math.floor(p.x)],'water');
  const before=structuredClone(map),plants=naturalPlants(map);assert.ok(plants.length>100);assert.ok(plants.length<=800);assert.deepEqual(plants,naturalPlants(map));assert.deepEqual(map,before);
  for(const p of plants){const radius=p.w/Math.SQRT2;for(let y=Math.floor(p.y-radius);y<=Math.floor(p.y+radius);y++)for(let x=Math.floor(p.x-radius);x<=Math.floor(p.x+radius);x++)assert.ok(['open','hill'].includes(map.tiles[y*map.width+x]));}
});
test('水域作为固定自然障碍，不能造墙或瞭望塔；桥面高差只服务视觉',()=>{
  const layout=generateCityMap(MAP_DEFAULTS),s=createCampaign({...DEFAULTS,budget:10000,initialPopulation:100,controlRadius:100},undefined,layout);s.day=3;
  s.explored=new Set(Array.from({length:3600},(_,i)=>i));const water=layout.tiles.indexOf('water');assert.ok(s.fixedWalls.has(water));assert.ok(!s.field.distance.has(water));
  assert.match(wallPreview(s,water).error,/自然障碍/);assert.match(outpostError(s,water),/可通行/);
  for(const wave of s.waves)assert.equal(validateSources(wave,s),'');
  for(const p of s.sites)if(p.role!=='camp')s.plotContents.set(key(p.x,p.y),{status:'building',type:'production'});
  rebuildTerrain(s);for(const source of s.sourceCatalog)assert.ok(s.field.distance.has(key(source.x,source.y)));
  const b=layout.natural.bridges[2];assert.equal(naturalGroundAt(layout,b.x+.5,b.y+.5),.04);assert.equal(naturalGroundAt(layout,b.x+.5,b.y-.5),.02);assert.equal(naturalGroundAt(layout,b.x+.5,b.y-1),0);assert.equal(naturalGroundAt(layout,layout.camp.x,layout.camp.y),0);
  const settings={...MAP_DEFAULTS,nature:false};assert.deepEqual(readMapSettings('?'+mapSearch(settings)),settings);assert.equal(generateCityMap(settings).stats.water,0);
});
test('岸草石块与草地色斑位置固定，不覆盖桥梁/道路或修改地形',()=>{
  const map=generateCityMap(MAP_DEFAULTS),before=structuredClone(map),details=naturalDetails(map);assert.deepEqual(details,naturalDetails(map));assert.deepEqual(map,before);
  for(const kind of ['patch','rock','reeds'])assert.ok(details.some(d=>d.kind===kind));
  for(const d of details){if(d.kind==='patch')for(const p of d.points)assert.equal(map.tiles[Math.floor(p.y)*map.width+Math.floor(p.x)],'open');
    if(d.kind==='reeds')assert.ok(!map.natural.bridges.some(b=>d.x>b.x-.6&&d.x<b.x+b.w+.6&&d.y>b.y-1&&d.y<b.y+b.h+1));}
});
