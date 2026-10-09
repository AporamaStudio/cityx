import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULTS,SIZE} from '../src/config.js';
import {createCampaign,key,productionCells,productionQuote,housingQuote,economyBuildQuote,buildProduction,buildHousing,clearPlot,buildTower,removeTower,changeWall,funds,demolitionQuote,validateParams,beginBattle,restoreNight} from '../src/model.js';

const id=key(15,22);
function setup(width=2,height=2,type='production',kind='building'){
 const block={x:15,y:22,width,height,kind,ruinType:type};
 const layout={width:SIZE,height:SIZE,camp:{x:15,y:29},blocks:[block],tiles:Array(SIZE*SIZE).fill('road')};
 const wave=[{x:10,y:10,hp:6,count:1,first:1,interval:2}];
 const s=createCampaign({...DEFAULTS,budget:1000,initialPopulation:100},[wave,wave,wave],layout);s.day=3;return s;
}

test('新建为基准、修缮默认半价；原修缮价与绝对收益保留',()=>{
 for(const [w,h,fresh,restored,income] of [[2,2,10,5,2],[2,3,17,8,3],[3,3,28,14,5],[3,4,42,21,6],[4,4,64,32,8],[5,5,152,76,19],[6,6,256,128,33]]){
  const ruin=setup(w,h),empty=setup(w,h,'production','open');
  assert.deepEqual(productionQuote(ruin,id),{area:w*h,cost:restored,income});
  assert.deepEqual(productionQuote(empty,id),{area:w*h,cost:fresh,income});
  assert.equal(buildProduction(ruin,id),'');assert.equal(buildProduction(empty,id),'');
  assert.equal(productionQuote(ruin,id).income,productionQuote(empty,id).income);
 }
 const ruin=setup(2,2,'housing'),empty=setup(2,2,'housing','open');
 assert.deepEqual(housingQuote(ruin,id),{cost:16,residents:2});assert.deepEqual(housingQuote(empty,id),{cost:32,residents:2});
 assert.equal(buildHousing(ruin,id),'');assert.equal(buildHousing(empty,id),'');
});

test('修缮比例可调且不改变收益；无效参数拒绝应用',()=>{
 const s=setup(4,4);s.params.renovationCostPercent=25;
 assert.deepEqual(productionQuote(s,id),{area:16,cost:16,income:8});
 for(const value of [0,101,NaN])assert.match(validateParams({...s.params,renovationCostPercent:value},s,false),/修缮/);
});

test('先修缮再当天拆除不能保留折扣，换用途按新建价；原始废墟不退款',()=>{
 const s=setup(),cash=funds(s);assert.equal(demolitionQuote(s,id).refund,0);
 assert.equal(buildProduction(s,id),'');assert.equal(funds(s),cash-5);
 assert.equal(clearPlot(s,id),'');assert.equal(funds(s),cash);
 assert.equal(economyBuildQuote(s,id,'production').cost,10);
 assert.equal(buildHousing(s,id),'');assert.equal(funds(s),cash-32);
 assert.equal(clearPlot(s,id),'');assert.equal(funds(s),cash);
 assert.equal(buildProduction(s,id),'');assert.equal(funds(s),cash-10);
});

test('每个边缘格反复嵌炮再补建不会降低同一栋建筑的实付成本',()=>{
 for(const type of ['production','housing'])for(const kind of ['building','open']){
  const s=setup(2,2,type,kind),build=type==='production'?buildProduction:buildHousing,cash=funds(s),cost=economyBuildQuote(s,id,type).cost;
  assert.equal(build(s,id),'');
  for(const cell of productionCells(id,s))for(let repeat=0;repeat<3;repeat++){
   assert.equal(buildTower(s,cell,'A'),'');assert.equal(removeTower(s,cell),'');assert.equal(build(s,id),'');
   assert.equal(funds(s),cash-cost);
  }
  assert.equal(clearPlot(s,id),'');assert.equal(funds(s),cash);
 }
});

test('原废墟先嵌炮再修缮、拆炮补建，与一次修缮同价；重试保留资格',()=>{
 const s=setup(),cash=funds(s);assert.equal(buildTower(s,id,'A'),'');assert.equal(buildProduction(s,id),'');
 const retry=restoreNight(beginBattle(s));assert.equal(removeTower(retry,id),'');assert.equal(buildProduction(retry,id),'');
 assert.equal(funds(retry),cash-5);
});

test('空地留墙缺口后补建仍按新建价，不因已有建筑而变成修缮',()=>{
 const s=setup(2,2,'production','open'),cash=funds(s);
 assert.equal(changeWall(s,id),'');assert.equal(buildProduction(s,key(16,22)),'');
 assert.equal(changeWall(s,id,true),'');assert.equal(economyBuildQuote(s,id,'production').mode,'new');
 assert.equal(buildProduction(s,id),'');assert.equal(funds(s),cash-10);
});

test('新建单格被炮位全部替代后，恢复经营不能冒充原始废墟半价',()=>{
 const s=setup(1,1,'production','open'),cash=funds(s),cost=economyBuildQuote(s,id,'production').cost;
 assert.equal(buildProduction(s,id),'');assert.equal(buildTower(s,id,'A'),'');assert.equal(removeTower(s,id),'');
 assert.equal(economyBuildQuote(s,id,'production').mode,'new');assert.equal(buildProduction(s,id),'');assert.equal(funds(s),cash-cost);
});
