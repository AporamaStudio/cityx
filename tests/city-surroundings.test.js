import test from 'node:test';
import assert from 'node:assert/strict';
import {generateCityMap} from '../src/city-map.js';
import {MAP_DEFAULTS} from '../src/map-settings.js';
import {surroundingLandscape,exteriorRiver,exteriorHeight,outsideDistance} from '../src/city-surroundings.js';
import {riverBanks} from '../src/natural-terrain.js';
import {exteriorFogExtent} from '../src/visibility.js';

test('大地图郊野范围与雾纹范围同步增长，不截断同比扩大的外围过渡',()=>{
  const map=generateCityMap({width:120,height:100}),land=surroundingLandscape(map);
  assert.equal(land.extent,exteriorFogExtent(100));assert.equal(land.extent,80);
  assert.ok(land.trees.length<=1200);assert.equal(exteriorFogExtent(240),192);
});

test('外围水系连续接城内两端，出口接真实道路，装饰不修改地图或通行数据',()=>{
  for(let seed=0;seed<8;seed++){
    const map=generateCityMap({...MAP_DEFAULTS,seed}),before=structuredClone(map),land=surroundingLandscape(map);
    assert.ok(land.trees.length>100&&land.trees.length<=1200);assert.equal(land.exits.length,4);
    for(const edge of [0,map.width])assert.deepEqual(exteriorRiver(map,edge),riverBanks(map.natural.river,edge));
    for(const road of land.exits){const first=road.points[0],x=Math.max(0,Math.min(map.width-1,Math.floor(first.x))),y=Math.max(0,Math.min(map.height-1,Math.floor(first.y)));assert.equal(map.tiles[y*map.width+x],'road');}
    for(const tree of land.trees)assert.ok(outsideDistance(map,tree.x,tree.y)>0);
    assert.equal(exteriorHeight(map,land,0,20),0);assert.equal(exteriorHeight(map,land,map.width,map.height/2),0);
    assert.ok(land.hills.some(h=>exteriorHeight(map,land,h.x,h.y)>1));assert.deepEqual(map,before);assert.equal(surroundingLandscape(map),land);
  }
});
