import test from 'node:test';
import assert from 'node:assert/strict';
import {generateCityMap,walkableDistances} from '../src/city-map.js';
import {MAP_DEFAULTS,readMapSettings,mapSearch} from '../src/map-settings.js';
import {DEFAULTS} from '../src/config.js';
import {visionField,enemyAction,createCampaign,key,productionCells,productionQuote,productionControlled,buildProduction,removeProduction,wallPreview,changeWall,placementError,buildTower,outpostError,buildOutpost,validateSources,beginBattle,restoreNight,restartCampaign,stepBattle,enterMorning,rebuildTerrain,inControl,inGroundControl,isExplored,removeOutpost,clearPlot,plotContent} from '../src/model.js';

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
  assert.equal(generateCityMap({...settings,width:30,height:30}).stats.special,0);
  assert.equal(generateCityMap({...settings,width:100,height:100}).stats.special,1);
  assert.throws(()=>generateCityMap({minBlock:6,maxBlock:3}));
});
test('生成地图接入路线、矩形经营、建设限制及重试',()=>{
  const layout=generateCityMap({...MAP_DEFAULTS,seed:0}),s=createCampaign({...DEFAULTS,budget:1000},undefined,layout);
  s.day=3;
  for(const wave of s.waves)assert.equal(validateSources(wave,s),'');
  const b=s.sites.find(b=>b.kind==='building'&&b.ruinType==='production'&&b.width!==b.height&&productionControlled(s,key(b.x,b.y))&&inGroundControl(s,key(b.x,b.y))),id=key(b.x,b.y);
  assert.equal(productionCells(id,s).length,b.width*b.height);assert.ok(!s.field.distance.has(id));
  assert.equal(productionQuote(s,id).area,b.width*b.height);assert.ok(productionQuote(s,id).cost<=b.width*b.height*8);assert.equal(productionQuote(s,id).income,Math.ceil(b.width*b.height*DEFAULTS.productionIncomePerCell));
  assert.ok(wallPreview(s,id).error);assert.equal(placementError(s,id),'');assert.match(outpostError(s,id),/可通行/);
  assert.equal(buildProduction(s,id),'');assert.ok(!s.field.distance.has(id));
  const road=layout.tiles.findIndex((t,id)=>t==='road'&&!wallPreview(s,id).error);
  assert.equal(changeWall(s,road),'');assert.ok(placementError(s,road));
  const tower=layout.tiles.findIndex((t,cell)=>t==='block'&&!productionCells(id,s).includes(cell)&&!placementError(s,cell));assert.equal(buildTower(s,tower,'A'),'');
  const post=layout.tiles.findIndex((t,id)=>t==='open'&&!outpostError(s,id));
  assert.equal(buildOutpost(s,post),'');
  const snap=beginBattle(s);assert.ok(snap);
  const restored=restoreNight(snap);assert.deepEqual(restored.layout,layout);assert.ok(restored.production.has(id));
  const restarted=restartCampaign(restored);assert.deepEqual(restarted.layout,layout);assert.equal(restarted.production.size,0);assert.deepEqual(restarted.sources,s.sources);
  restored.day=2;assert.equal(removeProduction(restored,id),'');assert.ok(!restored.blocked.has(id));
});
test('新地图完成十五晚，敌人每步只进入道路或开放场地',()=>{
  const s=createCampaign({...DEFAULTS,campHP:10000},undefined,generateCityMap(MAP_DEFAULTS));
  for(let day=1;day<=15;day++){
    assert.ok(beginBattle(s));
    for(let i=0;i<250&&s.phase==='battle';i++){
      stepBattle(s);for(const enemy of s.enemies)assert.ok(['road','open'].includes(s.layout.tiles[enemy.id]));
    }
    assert.equal(s.phase,'won');assert.equal(enterMorning(s),day<15);
  }
});

test('开放地块全部建成建筑后，道路骨架仍连接所有来源与火光',()=>{
  for(let seed=0;seed<6;seed++)for(const touching of [false,true]){
    const s=createCampaign(DEFAULTS,undefined,generateCityMap({...MAP_DEFAULTS,seed,touching}));
    for(const p of s.sites){const id=key(p.x,p.y);if(!productionCells(id,s).includes(s.camp))s.plotContents.set(id,{status:'building',type:'production'});}
    rebuildTerrain(s);for(const source of s.sources)assert.ok(s.field.distance.has(key(source.x,source.y)));
  }
});


test('起点按设施视野揭示，前哨探索保留，重开恢复初始迷雾',()=>{
  const s=createCampaign({...DEFAULTS,budget:1000,initialPopulation:1000},undefined,generateCityMap(MAP_DEFAULTS));
  const initial=new Set(s.explored);assert.deepEqual(s.explored,visionField(s));assert.equal(isExplored(s,key(30,0)),false);s.day=3;
  let changed=false;
  // 连续向外建设前哨；外围视野与永久探索记录分别验证。
  for(let round=0;round<12&&!changed;round++){
    for(let i=0;i<3600;i++)if(inControl(s,i)&&plotContent(s,i)?.status==='ruin')clearPlot(s,i);
    const candidates=Array.from({length:3600},(_,i)=>i).filter(i=>!outpostError(s,i));
    candidates.sort((a,b)=>Math.floor(a/60)-Math.floor(b/60));
    assert.ok(candidates.length);const id=candidates[0],before=s.explored.size;
    assert.equal(buildOutpost(s,id),'');
    if(s.explored.size>before){const explored=new Set(s.explored);assert.equal(removeOutpost(s,id),'');assert.deepEqual(s.explored,explored);changed=true;}
  }
  assert.ok(changed);assert.deepEqual(restartCampaign(s).explored,initial);
});

test('不同 seed 起步保证受控的廉价 2×2 废墟，包括普通尺寸 3–6 的例外',()=>{
  for(let seed=0;seed<12;seed++){
    const layout=generateCityMap({...MAP_DEFAULTS,seed,minBlock:3,maxBlock:6}),s=createCampaign(DEFAULTS,undefined,layout);
    const b=s.sites.find(p=>p.role==='starter');assert.ok(b);assert.equal(b.width,2);assert.equal(b.height,2);
    const id=key(b.x,b.y);assert.ok(productionControlled(s,id));assert.equal(productionQuote(s,id).cost,5);
    const larger=s.sites.find(p=>p.role==='starterLarge');assert.deepEqual([larger.width,larger.height],[3,3]);assert.equal(larger.ruinType,'production');assert.ok(productionControlled(s,key(larger.x,larger.y)));
    s.day=2;assert.equal(buildProduction(s,id),'');
  }
});


test('医院固定左上 10×12，不重叠且路网保持连通，不能清理换建',()=>{
  for(let seed=0;seed<8;seed++){
    const map=generateCityMap({...MAP_DEFAULTS,seed,touching:true}),hospital=map.blocks.find(b=>b.role==='hospital');
    assert.deepEqual([hospital.x,hospital.y,hospital.width,hospital.height],[1,1,10,12]);
    const seen=new Set();for(const b of map.blocks)for(let y=b.y;y<b.y+b.height;y++)for(let x=b.x;x<b.x+b.width;x++){const id=key(x,y);assert.ok(!seen.has(id));seen.add(id);}
    const distances=walkableDistances(map);map.tiles.forEach((t,i)=>assert.equal(distances[i]>=0,t!=='block'));
    const s=createCampaign({...DEFAULTS,controlRadius:30},undefined,map);s.day=3;s.explored=new Set(Array.from({length:3600},(_,i)=>i));
    // 把控制锚点临时设在医院旁，验证不是因距离而碰巧禁建。
    s.camp=key(0,8);const id=key(1,1);
    assert.match(clearPlot(s,id),/医院/);assert.match(buildProduction(s,id),/医院/);assert.match(buildOutpost(s,id),/医院/);
  }
});

test('城市建筑炮位邻接敌人仍不改路线、不受攻击',()=>{
  const s=createCampaign(DEFAULTS,undefined,generateCityMap(MAP_DEFAULTS)),attack=s.attacks[1];
  let tower,position;
  for(let i=0;i<attack.path.length-1&&tower===undefined;i++)for(const delta of [-1,1,-60,60]){
    const candidate=attack.path[i]+delta;if(placementError(s,candidate))continue;tower=candidate;position=i;break;
  }
  assert.notEqual(tower,undefined);assert.equal(buildTower(s,tower,'A'),'');
  const enemy={id:attack.path[position],target:s.camp,path:[...attack.path]},path=[...attack.path];
  assert.deepEqual(enemyAction(s,enemy),{to:path[position+1]});assert.deepEqual(attack.path,path);
  beginBattle(s);s.enemies=[{...enemy,hp:100,max:100,members:1,sources:[1],origins:['1:0']}];stepBattle(s);
  assert.ok(!s.events.some(event=>event.type==='towerHit'));assert.equal(s.towers.get(tower),'A');
});

test('开局街区不产生三格以上宽道路，并满足三类受控地块保障',()=>{
 for(let seed=0;seed<12;seed++){
  const map=generateCityMap({...MAP_DEFAULTS,seed}),s=createCampaign(DEFAULTS,undefined,map);
  for(const [w,h,type] of [[2,2,'production'],[3,3,'production'],[2,2,'housing']])
   assert.ok(map.blocks.some(b=>b.width===w&&b.height===h&&b.ruinType===type&&productionControlled(s,key(b.x,b.y))));
  for(let y=map.height-9;y<map.height-2;y++)for(let x=0;x<map.width-2;x++)
   assert.ok(!Array.from({length:9},(_,i)=>map.tiles[(y+Math.floor(i/3))*map.width+x+i%3]).every(t=>t==='road'));
 }
});
