import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULTS,SIZE} from '../src/config.js';
import {createCampaign,key,productionCells,productionQuote,housingQuote,economyBuildQuote,buildProduction,buildHousing,clearPlot,buildTower,removeTower,changeWall,embeddingQuote,funds,demolitionQuote,validateParams,beginBattle,restoreNight} from '../src/model.js';

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

test('每次嵌炮消耗原经营格投资，拆炮补建和拆楼不重复返还',()=>{
 for(const type of ['production','housing'])for(const kind of ['building','open']){
  const s=setup(2,2,type,kind),build=type==='production'?buildProduction:buildHousing,cash=funds(s),cost=economyBuildQuote(s,id,type).cost;
  assert.equal(build(s,id),'');let consumed=0;
  for(const cell of productionCells(id,s))for(let repeat=0;repeat<3;repeat++){
   const q=embeddingQuote(s,cell);assert.equal(q.refund,0);consumed+=q.cost;
   assert.equal(buildTower(s,cell,'A'),'');assert.equal(removeTower(s,cell),'');assert.equal(build(s,id),'');
   assert.equal(funds(s),cash-cost-consumed);
  }
  assert.equal(clearPlot(s,id),'');assert.equal(funds(s),cash-consumed);
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
 assert.equal(economyBuildQuote(s,id,'production').mode,'new');assert.equal(buildProduction(s,id),'');assert.equal(funds(s),cash-2*cost);
});

test('先修缮再架炮比先架炮再修缮多花原经营格投资，拆返比例不影响改建',()=>{
 for(const percent of [0,50,100]){
  const first=setup(),second=setup();first.params.demolitionRefundPercent=percent;second.params.demolitionRefundPercent=percent;
  assert.equal(buildTower(first,id,'A'),'');assert.equal(buildProduction(first,id),'');
  assert.equal(buildProduction(second,id),'');const q=embeddingQuote(second,id),cash=funds(second);second.day++;
  assert.equal(buildTower(second,id,'A'),'');assert.equal(funds(second),cash-10);
  assert.equal(funds(first)-funds(second),q.cost);assert.deepEqual(productionQuote(first,id),productionQuote(second,id));
 }
});

test('夜间改建扣完整加急造价；重试恢复投资与余额，战前消耗不丢失',()=>{
 const s=setup();assert.equal(buildProduction(s,id),'');const cash=funds(s),paid=new Map(s.production.get(id).paid);
 const replacement=embeddingQuote(s,id).cost,snap=beginBattle(s);assert.equal(buildTower(s,id,'A'),'');assert.equal(funds(s),cash-20);
 const retry=restoreNight(snap);assert.equal(funds(retry),cash);assert.deepEqual(retry.production.get(id).paid,paid);
 assert.equal(buildTower(retry,id,'A'),'');
 const next=restoreNight(beginBattle(retry));assert.equal(funds(next),cash-10);
 assert.equal(removeTower(next,id),'');assert.equal(funds(next),cash);
 assert.equal(buildProduction(next,id),'');assert.equal(funds(next),cash-replacement);
});
