import test from 'node:test';
import assert from 'node:assert/strict';
import {generateCityMap} from '../src/city-map.js';
import {MAP_DEFAULTS as LARGE_MAP_DEFAULTS} from '../src/map-settings.js';
const MAP_DEFAULTS={...LARGE_MAP_DEFAULTS,width:60,height:60,landmarks:false};
import {surroundingLandscape,exteriorRiver,exteriorHeight,outsideDistance,segmentDistance} from '../src/city-surroundings.js';
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


test('近郊不使用住房/厂房模型，田野谷仓保持地图外并避让道路、水系及陡坡',()=>{
  const kinds=new Set();
  for(let seed=0;seed<8;seed++){
    const map=generateCityMap({...MAP_DEFAULTS,seed}),before=structuredClone(map),land=surroundingLandscape(map);
    assert.ok(land.fields.length>0&&land.fields.length<=24);assert.equal(land.buildings.length,4);assert.equal(land.props.length,8);
    assert.deepEqual(new Set(land.buildings.map(b=>b.asset)),new Set(['barn','barn-abandoned']));
    for(const item of [...land.fields,...land.buildings,...land.props]){
      const radius=item.width/20*Math.SQRT1_2;
      for(const [dx,dy] of [[0,0],[-radius,-radius],[-radius,radius],[radius,-radius],[radius,radius]]){
        const x=item.x+dx,y=item.y+dy,river=exteriorRiver(map,x);
        assert.ok(outsideDistance(map,x,y)>=.6);assert.ok(exteriorHeight(map,land,x,y)*20<=1);
        if(river)assert.ok(y<=river.top-.35||y>=river.bottom+.35);
      }
      for(const road of land.exits)for(let i=1;i<road.points.length;i++)assert.ok(segmentDistance(item.x,item.y,road.points[i-1],road.points[i])>=road.w/2+radius+.15);
    }
    for(const field of land.fields){assert.equal(field.width,20);kinds.add(field.asset);}
    assert.deepEqual(map,before);
  }
  assert.deepEqual(kinds,new Set(['farmland','wheatfield','wheatfield-abandoned','wheatfield-burnt']));
});
