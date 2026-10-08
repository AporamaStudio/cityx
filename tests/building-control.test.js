import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULTS,SIZE} from '../src/config.js';
import {key,createCampaign,inGroundControl,inControl,rawControlMask,controlMask,controlBoundary,productionCells,buildingCells,contentCells,productionControlled,buildProduction,buildHousing,buildTower,removeTower,changeWall,wallPreview,outpostError,buildOutpost,removeOutpost,clearPlot,removeProduction,productionQuote,terrainTraversable,enemyAction,visionField,beginBattle,restoreNight,validateParams,repairFacility,rebuildTerrain,demolitionQuote,plotContent} from '../src/model.js';

// 火光半径 2 仅触及 3×3 建筑左上角；其余建筑格、右侧道路均在基础范围外。
function make(kind='building',extra=[],ruinType='production'){
  const p={x:12,y:10,width:3,height:3,kind,ruinType},plots=[p,...extra],tiles=Array(SIZE*SIZE).fill('road');
  for(const b of plots)for(let y=b.y;y<b.y+b.height;y++)for(let x=b.x;x<b.x+b.width;x++)tiles[key(x,y)]=b.kind==='open'?'open':'block';
  const layout={width:SIZE,height:SIZE,camp:{x:10,y:10},blocks:plots,tiles};
  const wave=[{x:10,y:4,hp:100,count:1,first:1,interval:2}];
  const s=createCampaign({...DEFAULTS,budget:1000,initialPopulation:100,controlRadius:2},[wave,wave,wave],layout);s.day=3;return s;
}
const origin=key(12,10),far=key(14,12),street=key(15,12);

test('Case A：基础范围只碰建筑一格，整栋归属且控制线不穿内部',()=>{
  const s=make(),cells=productionCells(origin,s),raw=rawControlMask(s),final=controlMask(s);
  assert.deepEqual(cells.filter(id=>raw.has(id)),[origin]);
  assert.ok(cells.every(id=>inControl(s,id)&&final.has(id)));assert.ok(productionControlled(s,far));
  for(const [x,y,nx,ny] of controlBoundary(final)){
    assert.ok(!(x===nx&&x>12&&x<15&&y>=10&&ny<=13));
    assert.ok(!(y===ny&&y>10&&y<13&&x>=12&&nx<=15));
  }
  assert.ok(controlBoundary(final).some(edge=>edge.join(',')==='15,12,15,13'));
});
test('Case B：建筑远侧街道仍未控制，建筑归属不反向改变基础 mask',()=>{
  const s=make(),raw=rawControlMask(s);assert.ok(inControl(s,far));
  assert.equal(inGroundControl(s,far),false);assert.equal(inControl(s,street),false);
  assert.equal(controlMask(s).has(street),false);assert.deepEqual(rawControlMask(s),raw);
});
test('Case C：建筑 A 碰到基础范围，紧邻建筑 B 不被链式控制',()=>{
  const b={x:15,y:10,width:3,height:3,kind:'building'},s=make('building',[b]);
  assert.ok(inControl(s,far));assert.ok(productionCells(key(15,10),s).every(id=>!inControl(s,id)&&!controlMask(s).has(id)));
});
test('Case D：远侧合法炮位可建塔和重试，物理建筑与路线保持不变',()=>{
  const s=make(),walls=new Set(s.terrainWalls),paths=structuredClone(s.attacks),before=new Map(s.field.distance);
  assert.equal(inGroundControl(s,far),false);assert.equal(buildTower(s,far,'A'),'');
  assert.deepEqual(s.terrainWalls,walls);assert.deepEqual(s.attacks,paths);assert.deepEqual(s.field.distance,before);
  assert.equal(terrainTraversable(s,far),false);assert.equal(buildingCells(s,far).length,9);assert.equal(contentCells(s,far).length,8);
  assert.match(repairFacility(s,far),/受损火光或墙/);
  const snapshot=beginBattle(s),retry=restoreNight(snapshot);assert.ok(inControl(retry,far));assert.deepEqual(retry.terrainWalls,walls);
  s.phase='build';assert.equal(removeTower(s,far),'');assert.deepEqual(s.terrainWalls,walls);assert.equal(contentCells(s,far).length,8);
});
test('Case E：墙不能借整栋建筑的远侧归属获得免费地面距离',()=>{
  const s=make(),before=structuredClone(s);
  assert.match(wallPreview(s,far).error,/基础地面控制/);assert.match(changeWall(s,street),/基础地面控制/);
  assert.deepEqual(s,before);
});
test('瞭望塔只借基础地面控制扩张，整栋归属不能用于远侧驻扎',()=>{
  const s=make(),raw=rawControlMask(s),paths=structuredClone(s.attacks),anchor=key(10,12);
  assert.equal(inGroundControl(s,far),false);assert.match(outpostError(s,far),/基础地面控制/);
  assert.equal(buildOutpost(s,anchor),'');assert.ok(inGroundControl(s,street));assert.deepEqual(s.attacks,paths);assert.equal(validateParams(s.params,s),'');
  assert.equal(changeWall(s,street),'');assert.match(removeOutpost(s,anchor),/依赖此瞭望塔/);assert.equal(changeWall(s,street,true),'');
  const retry=restoreNight(beginBattle(s));assert.ok(retry.outposts.has(anchor));assert.ok(inGroundControl(retry,street));
  s.phase='build';assert.equal(removeOutpost(s,anchor),'');assert.deepEqual(rawControlMask(s),raw);assert.equal(inControl(s,street),false);
  const open=make('open'),before=structuredClone(open);assert.match(buildOutpost(open,far),/控制/);assert.deepEqual(open,before);
});

test('Case F：半块空地仍逐格控制，不按固定地块身份整块吸附',()=>{
  const s=make('open');s.params.controlRadius=3;const raw=rawControlMask(s),cells=productionCells(origin,s);
  assert.equal(cells.filter(id=>inControl(s,id)).length,5);assert.deepEqual(controlMask(s),raw);
  assert.equal(productionControlled(s,origin),false);assert.match(buildProduction(s,origin),/空地须逐格完整受控/);
});
test('废墟恢复生产或住房不改变物理图，收入按建筑归属生效；拆成空地后恢复逐格控制',()=>{
  for(const type of ['production','housing']){
    const s=make('building',[],type),walls=new Set(s.terrainWalls),paths=structuredClone(s.attacks);
    assert.equal(type==='production'?buildProduction(s,far):buildHousing(s,far),'');
    assert.deepEqual(s.terrainWalls,walls);assert.deepEqual(s.attacks,paths);assert.ok(productionControlled(s,far));
    assert.equal(clearPlot(s,far),'');assert.equal(inControl(s,far),false);assert.equal(terrainTraversable(s,far),true);
  }
});
test('清理建筑前必须拆除炮位，防止留下悬空设施',()=>{
  const s=make();assert.equal(buildTower(s,far,'A'),'');const before=structuredClone(s);
  assert.match(clearPlot(s,origin),/先拆除炮塔/);assert.deepEqual(s,before);
  assert.equal(buildProduction(s,origin),'');assert.match(removeProduction(s,origin),/先拆除炮塔/);
  assert.equal(removeTower(s,far),'');assert.equal(removeProduction(s,origin),'');assert.equal(inControl(s,far),false);
});
test('最后一格经营面积改成炮位也保留物理建筑，拆炮后仍可清理废墟',()=>{
  const s=make(),cells=productionCells(origin,s);s.plotContents.set(origin,{status:'ruin',type:'production',cells:new Set([origin]),footprint:new Set([origin])});rebuildTerrain(s);
  assert.equal(buildTower(s,origin,'A'),'');assert.equal(contentCells(s,origin).length,0);
  assert.deepEqual(buildingCells(s,origin),[origin]);assert.equal(terrainTraversable(s,origin),false);
  assert.equal(removeTower(s,origin),'');assert.equal(plotContent(s,origin).status,'ruin');assert.equal(demolitionQuote(s,origin).type,'ruin');
  assert.equal(clearPlot(s,origin),'');assert.ok(cells.every(id=>terrainTraversable(s,id)));
});
test('已控制建筑整体可见，不把可见或归属当成地面传播；调参仍校验实际依赖',()=>{
  const s=make();s.params.campSight=0;s.params.nightSightMultiplier=0;
  for(const phase of ['build','battle']){const seen=visionField(s,phase);assert.ok(buildingCells(s,origin).every(id=>seen.has(id)));assert.equal(seen.has(street),false);}
  assert.equal(buildTower(s,far,'A'),'');assert.equal(validateParams(s.params,s),'');
  assert.match(validateParams({...s.params,controlRadius:1},s),/控制范围/);
});
test('建筑炮位不受街道敌人攻击，也不允许向通行地面放炮',()=>{
  const s=make();assert.equal(buildTower(s,far,'A'),'');
  const enemy={id:street,path:[street,key(15,13)],target:s.camp};
  assert.deepEqual(enemyAction(s,enemy),{to:key(15,13)});assert.equal(terrainTraversable(s,far),false);
  const ground=key(10,8),walls=new Set(s.terrainWalls),paths=structuredClone(s.attacks);
  assert.match(buildTower(s,ground,'A'),/建筑实体/);assert.equal(terrainTraversable(s,ground),true);
  assert.deepEqual(s.terrainWalls,walls);assert.deepEqual(s.attacks,paths);
});

test('建筑经营启停不改变物理阻挡，不可通行自然地形也不能被当成可走道路',()=>{
  const s=make(),natural=key(11,7);s.fixedWalls.add(natural);rebuildTerrain(s);
  assert.equal(s.layout.tiles[natural],'road');assert.equal(terrainTraversable(s,natural),false);
  assert.equal(terrainTraversable(s,key(11,8)),true);assert.equal(buildProduction(s,origin),'');
  const walls=new Set(s.terrainWalls);s.hp=0;assert.equal(productionControlled(s,origin),false);rebuildTerrain(s);
  assert.deepEqual(s.terrainWalls,walls);assert.equal(productionQuote(s,origin).area,9);
});
