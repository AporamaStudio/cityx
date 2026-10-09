import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULTS,SIZE} from '../src/config.js';
import {generateCityMap} from '../src/city-map.js';
import {MAP_DEFAULTS} from '../src/map-settings.js';
import {sourceMaxHP} from '../src/enemy-sources.js';
import {key,createCampaign,knownSources,sourceCells,sourcePlans,sourceControlled,sourceAttackPlan,beginBattle,stepBattle,restoreNight,restartCampaign,enterMorning,settleEconomy,validateParams,validateSources,visionField,revealControl,plotBuildError,syncSourceHealth} from '../src/model.js';

const definition={id:'source-1',index:0,level:1,bx:16,by:22,width:2,height:2,x:16,y:21,site:key(16,22),firstNight:1};
function setup(params={}){
 const layout={width:SIZE,height:SIZE,camp:{x:15,y:25},tiles:Array(SIZE*SIZE).fill('road'),blocks:[{x:13,y:22,width:2,height:3,kind:'building'},{x:16,y:22,width:2,height:2,kind:'building'}]};
 const short=(params.nightTicks??80)<30, wave=[{sourceId:'source-1',x:16,y:21,hp:10,count:short?1:3,first:short?1:20,interval:5}];
 return createCampaign({...DEFAULTS,sourceCellHPMin:6,sourceCellHPMax:6,campHP:1000,...params},[wave,wave,wave],layout,[definition]);
}
test('八个核心采用四种形状及旋转，按面积抽耐久，不改道路与初始教学区',()=>{
 for(const seed of ['cityx-01','a','b',3]){
  const layout=generateCityMap({...MAP_DEFAULTS,seed}),before=structuredClone(layout),s=createCampaign(DEFAULTS,undefined,layout);
  assert.equal(s.enemySources.size,8);assert.deepEqual(layout,before);
  assert.deepEqual([...s.enemySources.values()].map(s=>s.width*s.height),[1,1,2,2,3,3,4,4]);
  for(const source of s.enemySources.values()){
   assert.ok(sourceCells(source).every(cell=>layout.tiles[cell]==='block'));
   assert.ok(['1x1','1x2','2x1','1x3','3x1','2x2'].includes(`${source.width}x${source.height}`));
   assert.ok(source.hp>=source.width*source.height*12&&source.hp<=source.width*source.height*30);
   assert.ok(s.field.distance.has(key(source.x,source.y)));assert.ok(!sourceControlled(s,source));
   assert.match(plotBuildError(s,source.site),/感染据点/);
  }
  for(const wave of s.waves)assert.equal(validateSources(wave,s),'');
  assert.match(validateSources([{...s.sources[0],x:s.sources[0].x+1}],s),/不能移动/);
  assert.deepEqual([...restartCampaign(s).enemySources.values()].map(s=>s.hp),[...s.enemySources.values()].map(s=>s.hp));
  assert.deepEqual([...createCampaign(DEFAULTS,undefined,layout).enemySources.values()].map(s=>s.hp),[...s.enemySources.values()].map(s=>s.hp));
 }
});
test('一炮覆盖四格只扣一次，多炮叠加；忙于打敌人的炮不兼打源头',()=>{
 const s=setup(),source=s.enemySources.get('source-1'),tower=key(14,23);s.towers.set(tower,'B');
 assert.equal(sourceAttackPlan(s).get(source.id),1);beginBattle(s);stepBattle(s);assert.equal(source.hp,23);
 assert.deepEqual(s.events.filter(e=>e.type==='sourceHit').map(e=>e.value),[1]);
 s.towers.set(key(14,22),'B');assert.equal(sourceAttackPlan(s).get(source.id),2);stepBattle(s);assert.equal(source.hp,21);
 const enemy={id:key(11,23)};assert.equal(sourceAttackPlan(s,[enemy]).has(source.id),false);
 s.enemies=[{...enemy,hp:1,max:1,members:1,target:s.camp,sources:['0:0']}];stepBattle(s);
 assert.ok(s.events.some(e=>e.type==='kill'));assert.equal(source.hp,21);
});
test('同门炮对多个源头也只选择一个，控制接口不得借建筑整体归属',()=>{
 const s=setup();s.towers.set(key(14,23),'B');
 s.enemySources.set('source-2',{...s.enemySources.get('source-1'),id:'source-2',index:1,bx:17,by:25,x:17,y:24});
 const plan=sourceAttackPlan(s);assert.equal([...plan.values()].reduce((a,b)=>a+b,0),1);
 s.params.controlRadius=1;assert.equal(sourceControlled(s,s.enemySources.get('source-1')),false);assert.equal(sourceAttackPlan(s).size,0);
});
test('提前侦察记住源头身份，不提前激活或揭示实时周边',()=>{
 const layout={width:SIZE,height:SIZE,camp:{x:15,y:25},tiles:Array(SIZE*SIZE).fill('road'),blocks:[{x:40,y:10,width:2,height:2,kind:'building'}]};
 const source={...definition,bx:40,by:10,x:39,y:10,site:key(40,10),firstNight:5};
 const wave=[{sourceId:source.id,x:39,y:10,hp:8,count:2,first:1,interval:5}];
 const s=createCampaign(DEFAULTS,[[],[],[],[],wave],layout,[source]),plans=structuredClone(s.waves);
 assert.equal(knownSources(s).length,0);s.towers.set(key(39,9),'B');revealControl(s);
 assert.equal(knownSources(s)[0].firstNight,5);assert.equal(knownSources(s)[0].active,false);assert.deepEqual(s.sources,[]);assert.deepEqual(s.waves,plans);
 s.towers.clear();revealControl(s);assert.equal(knownSources(s).length,1);assert.ok(!visionField(s).has(key(40,10)));
 s.day=5;s.sources=wave;assert.ok(visionField(s).has(key(40,10)));
});
test('未激活也能肃清；当晚锁定批次继续，后续仅移除被消灭源头',()=>{
 const s=setup(),source=s.enemySources.get('source-1');source.firstNight=3;source.hp=1;s.towers.set(key(14,23),'B');
 const another={...source,id:'source-2',index:1,bx:40,by:10,x:39,y:10,site:key(40,10),hp:24,firstNight:2};s.enemySources.set(another.id,another);
 const otherWave={sourceId:another.id,x:39,y:10,hp:9,count:2,first:1,interval:7};s.waves[1].push(otherWave);
 const original=structuredClone(s.waves),locked=structuredClone(s.attacks),snapshot=beginBattle(s);
 stepBattle(s);assert.equal(source.hp,0);assert.deepEqual(s.attacks,locked);assert.equal(s.spawned,0);
 for(let i=0;i<200&&s.phase==='battle';i++)stepBattle(s);
 assert.equal(s.spawned,3);assert.equal(s.phase,'won');assert.deepEqual(s.waves,original);
 assert.deepEqual(sourcePlans(s,2),[otherWave]);assert.equal(enterMorning(s),true);assert.deepEqual(s.sources,[otherWave]);
 assert.equal(restoreNight(snapshot).enemySources.get(source.id).hp,1);assert.equal(restartCampaign(s).enemySources.get(source.id).hp,24);
});
test('每夜回复默认0，非零仅结算一次、封顶、不复活；与敌人HP独立',()=>{
 const s=setup({sourceRegenHP:5,nightTicks:2}),source=s.enemySources.get('source-1');source.hp=22;
 beginBattle(s);s.attacks=[];stepBattle(s);assert.equal(source.hp,22);stepBattle(s);assert.equal(s.phase,'won');assert.equal(source.hp,24);
 settleEconomy(s);assert.equal(source.hp,24);
 const dead=setup({sourceRegenHP:5,nightTicks:1});dead.enemySources.get('source-1').hp=0;beginBattle(dead);dead.attacks=[];stepBattle(dead);assert.equal(dead.enemySources.get('source-1').hp,0);
 const zero=setup({nightTicks:1});zero.enemySources.get('source-1').hp=10;beginBattle(zero);zero.attacks=[];stepBattle(zero);assert.equal(zero.enemySources.get('source-1').hp,10);
 const copy=setup();copy.enemySources.get('source-1').hp=20;copy.params.sourceCellHPMin=copy.params.sourceCellHPMax=10;syncSourceHealth(copy);assert.equal(copy.enemySources.get('source-1').hp,36);assert.equal(copy.sources[0].hp,10);
 assert.match(validateParams({...copy.params,sourceRegenHP:-1},copy,false),/源头/);
});
test('无来袭仍有有限肃清窗口，消灭所有源头后不伪造增援',()=>{
 const s=setup({nightTicks:3});s.enemySources.get('source-1').hp=0;s.waves=[[],[]];s.sources=[];s.attacks=[];
 assert.equal(validateSources([],s),'');assert.ok(beginBattle(s));stepBattle(s);assert.equal(s.phase,'battle');stepBattle(s);assert.equal(s.phase,'battle');stepBattle(s);assert.equal(s.phase,'won');assert.equal(s.spawned,0);
 assert.equal(enterMorning(s),true);assert.deepEqual(s.sources,[]);assert.equal(s.enemySources.get('source-1').hp,0);
});
test('整晚固定拍数，清空不提前结束，天亮撤退不伤火光也不发金币',()=>{
 const s=setup({nightTicks:3}),snapshot=beginBattle(s);
 for(let i=0;i<2;i++){stepBattle(s);assert.equal(s.phase,'battle');}
 assert.equal(s.enemies.length,1);stepBattle(s);
 assert.equal(s.tick,3);assert.equal(s.phase,'won');assert.equal(s.enemies.length,0);assert.equal(s.withdrawn,1);
 assert.equal(s.hp,1000);assert.equal(s.earned,0);assert.equal(s.killed,0);assert.equal(s.enemyOutcomes.get('0:0'),'withdrawn');
 assert.equal(restoreNight(snapshot).withdrawn,0);assert.equal(enterMorning(s),true);assert.equal(s.lastNight.withdrawn,1);
 const empty=setup({nightTicks:4});empty.sources=[];empty.attacks=[];empty.towers.set(key(14,23),'B');beginBattle(empty);
 for(let i=0;i<3;i++){stepBattle(empty);assert.equal(empty.phase,'battle');}
 stepBattle(empty);assert.equal(empty.phase,'won');assert.equal(empty.enemySources.get('source-1').hp,20);
 stepBattle(empty);assert.equal(empty.tick,4);assert.equal(empty.enemySources.get('source-1').hp,20);
});
test('末拍受击仍可失败，晚于天亮的出兵配置拒绝，HP范围按占地封顶',()=>{
 const s=setup({nightTicks:1});beginBattle(s);s.hp=1;
 s.attacks=[{index:0,x:15,y:24,hp:6,count:1,first:1,interval:1,target:s.camp,path:[]}];stepBattle(s);
 assert.equal(s.phase,'lost');assert.equal(s.economySettled,false);assert.equal(s.withdrawn,0);
 assert.match(validateSources([{...s.sources[0],first:2}],s),/天亮/);
 assert.match(validateParams({...s.params,sourceCellHPMin:30,sourceCellHPMax:12},s,false),/上限/);
 assert.equal(sourceMaxHP({...definition,hpRoll:0},DEFAULTS),48);assert.equal(sourceMaxHP({...definition,hpRoll:1},DEFAULTS),120);
});
