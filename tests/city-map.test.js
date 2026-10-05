import test from 'node:test';
import assert from 'node:assert/strict';
import {generateCityMap,walkableDistances} from '../src/city-map.js';

test('相同 seed 和参数完全复现，换 seed 改变布局',()=>{
  assert.deepEqual(generateCityMap({seed:'cityx-01'}),generateCityMap({seed:'cityx-01'}));
  assert.notDeepEqual(generateCityMap({seed:'cityx-01'}).buildings,generateCityMap({seed:'cityx-02'}).buildings);
});
test('矩形及大型地图：废墟不重叠、不覆盖路网，全部空地连通且可达终点',()=>{
  for(const [width,height] of [[30,30],[50,100],[100,50],[100,180],[20,20]])for(const mainRoadWidth of [2,3])for(let seed=0;seed<8;seed++){
    const map=generateCityMap({width,height,mainRoadWidth,seed}),seen=new Set();
    assert.ok(map.buildings.length>0);
    for(const b of map.buildings){
      assert.ok(b.width>=1&&b.width<=5&&b.height>=1&&b.height<=5&&b.width*b.height>=2);
      for(let y=b.y;y<b.y+b.height;y++)for(let x=b.x;x<b.x+b.width;x++){
        const id=y*width+x;assert.ok(x>=0&&y>=0&&x<width&&y<height);assert.ok(!seen.has(id));seen.add(id);assert.equal(map.tiles[id],'block');
      }
    }
    const distances=walkableDistances(map);
    for(let id=0;id<map.tiles.length;id++)assert.equal(distances[id]>=0,map.tiles[id]!=='block',`seed ${seed}, ${width}×${height}, mainRoadWidth ${mainRoadWidth}, cell ${id}`);
    assert.ok(distances[map.goal.y*width+map.goal.x]>0);
    for(const road of map.roads)for(let y=road.y;y<road.y+road.height;y++)for(let x=road.x;x<road.x+road.width;x++)assert.notEqual(map.tiles[y*width+x],'block');
    assert.equal(map.stats.occupied,seen.size);
  }
});
test('街区之间至少留一格道路，普通尺寸包含横竖形状和大地块',()=>{
  const dimensions=new Set();
  for(let seed=0;seed<12;seed++){
    const map=generateCityMap({width:50,height:100,seed});
    for(const a of map.buildings){
      dimensions.add(`${a.width}x${a.height}`);
      for(const b of map.buildings){if(a.id>=b.id)continue;
        const dx=Math.max(b.x-(a.x+a.width),a.x-(b.x+b.width)),dy=Math.max(b.y-(a.y+a.height),a.y-(b.y+b.height));
        assert.ok(dx>=1||dy>=1);
      }
    }
  }
  for(const shape of ['2x3','3x2','3x3','3x4','4x4','5x5'])assert.ok(dimensions.has(shape),shape);
});
test('拒绝非法地图尺寸和主路宽度',()=>{
  for(const options of [{width:0},{height:250},{width:30.5},{mainRoadWidth:1},{mainRoadWidth:NaN}])assert.throws(()=>generateCityMap(options));
});

// 地形决定可达性，修缮状态不改变路线；所有非道路格都属于明确街区。
test('三类空间完整分区，开放场地和目标可达，修缮不改变通行性',()=>{
  const map=generateCityMap({seed:'cityx-01'}),owners=new Set();
  assert.ok(map.openSpaces.length>=2);
  for(const b of map.blocks)for(let y=b.y;y<b.y+b.height;y++)for(let x=b.x;x<b.x+b.width;x++){
    const id=y*map.width+x;assert.ok(!owners.has(id));owners.add(id);
    assert.equal(map.tiles[id],b.kind==='building'?'block':'open');
  }
  const roadCells=new Set();
  for(const r of map.roads)for(let y=r.y;y<r.y+r.height;y++)for(let x=r.x;x<r.x+r.width;x++)roadCells.add(y*map.width+x);
  for(let id=0;id<map.tiles.length;id++){
    assert.ok(['road','block','open'].includes(map.tiles[id]));
    assert.equal(owners.has(id),map.tiles[id]!=='road');
    assert.equal(roadCells.has(id),map.tiles[id]==='road');
  }
  assert.equal(map.tiles[map.camp.y*map.width+map.camp.x],'open');
  assert.equal(map.tiles[map.goal.y*map.width+map.goal.x],'open');
  const before=walkableDistances(map);map.buildings.forEach(b=>b.state='restored');
  assert.deepEqual(walkableDistances(map),before);
});
