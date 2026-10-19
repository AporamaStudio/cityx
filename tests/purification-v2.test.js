import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULTS} from '../src/config.js';
import {createState,key,campCells,campCenter,circleCells,purificationMask,rawControlMask,controlMask,visionField,buildOutpost,population} from '../src/model.js';
test('净化塔占地2×2，圆心位于四格中间，欧氏覆盖不包含方形角落',()=>{
 const s=createState();assert.deepEqual(campCells(s),[key(15,25),key(16,25),key(15,26),key(16,26)]);assert.deepEqual(campCenter(s),[16,26]);
 const circle=new Set(circleCells([16,26],2));assert.ok(circle.has(key(17,26)));assert.ok(!circle.has(key(17,27)));assert.equal(purificationMask(s).size,rawControlMask(s).size);
});
test('机械塔无人、联网扩张控制但不净化，断联闭环不输出有效覆盖',()=>{
 const s=createState(undefined,undefined,undefined,{...DEFAULTS,controlRadius:3});s.day=3;const id=key(17,26),people=population(s).total,pure=purificationMask(s);
 assert.equal(buildOutpost(s,id),'');assert.equal(population(s).free,people);assert.ok(rawControlMask(s).size>pure.size);assert.deepEqual(purificationMask(s),pure);
 s.outposts.set(key(40,40),{});s.outposts.set(key(43,40),{});assert.ok(!rawControlMask(s).has(key(40,40)));assert.ok(!visionField(s).has(key(43,40)));
});
test('两塔实时视野在昼夜完全一致，净化半径参数不改离散武器形状',()=>{
 const s=createState();assert.deepEqual(visionField(s,'build'),visionField(s,'battle'));assert.equal(s.params.outpostS01,2);assert.ok(controlMask(s).size>=purificationMask(s).size);assert.equal(s.params.weapons.A.shape,'square');
});

test('地块必须全部净化才接通，修复和机械塔整栋控制不能代替净化',async()=>{
 const {createCampaign,buildHousing,buildProduction,restoreBank,plotPurified,buildingStatus,expectedIncome,population,revealControl,bankFinance}=await import('../src/model.js');
 const blocks=[{x:18,y:24,width:2,height:2,kind:'building',ruinType:'housing'},{x:18,y:27,width:2,height:2,kind:'building',ruinType:'production'},{x:18,y:21,width:2,height:2,kind:'building',role:'bank'}];
 const s=createCampaign({...DEFAULTS,budget:1000,controlRadius:3},undefined,{width:60,height:60,camp:{x:15,y:25},blocks,tiles:Array(3600).fill('road')});s.day=3;s.outposts.set(key(17,26),{});revealControl(s);
 assert.equal(buildHousing(s,key(18,24)),'');assert.equal(buildProduction(s,key(18,27)),'');assert.equal(restoreBank(s,key(18,21)),'');assert.equal(buildingStatus(s,key(18,24)),'repaired');assert.equal(expectedIncome(s),0);assert.equal(population(s).total,6);assert.equal(bankFinance(s).capacity,0);
 s.params.controlRadius=8;revealControl(s);const admitted=population(s).total;assert.equal(admitted,8);assert.equal(buildingStatus(s,key(18,24)),'connected');assert.ok(expectedIncome(s)>0);assert.equal(bankFinance(s).capacity,100);
 s.params.controlRadius=3;revealControl(s);assert.equal(population(s).total,admitted);assert.equal(expectedIncome(s),0);assert.equal(bankFinance(s).capacity,0);s.params.controlRadius=8;revealControl(s);assert.equal(population(s).total,admitted);
 assert.ok(plotPurified(s,key(18,24)));
});
test('净化差一个格也不接通，经营面积减少不会绕过完整地块判定',async()=>{
 const {createCampaign,plotPurified,productionCells}=await import('../src/model.js');
 const blocks=[{x:18,y:24,width:2,height:2,kind:'building',ruinType:'production'}],s=createCampaign({...DEFAULTS,controlRadius:3.6},undefined,{width:60,height:60,camp:{x:15,y:25},blocks,tiles:Array(3600).fill('road')});
 const cells=productionCells(key(18,24),s),pure=purificationMask(s);assert.equal(cells.filter(id=>!pure.has(id)).length,1);assert.equal(plotPurified(s,key(18,24)),false);
 s.plotContents.set(key(18,24),{status:'building',type:'production',cells:new Set(cells.filter(id=>pure.has(id))),footprint:new Set(cells)});assert.equal(plotPurified(s,key(18,24)),false);
});

test('在大空地内只占四格，新塔不改当晚目标、次日起可进入目标池',async()=>{
 const {createCampaign,buildCamp,campBuildError,availableCells,forecastAttacks,upgradeCamp,campRadius,repairFacility,repairQuote,funds,essenceBalance,beginBattle,restoreNight}=await import('../src/model.js');
 const blocks=[{x:18,y:25,width:4,height:4,kind:'open'}],layout={width:60,height:60,camp:{x:15,y:25},blocks,tiles:Array(3600).fill('road')};
 const waves=Array.from({length:5},()=>[{x:25,y:26,hp:3,count:1,first:1,interval:1}]);const s=createCampaign({...DEFAULTS,budget:1000,initialEssence:9},waves,layout);s.day=3;
 const attacks=structuredClone(s.attacks),id=key(19,26);assert.equal(campBuildError(s,id),'');const cash=funds(s);assert.equal(buildCamp(s,id),'');assert.equal(campCells(s,id).length,4);assert.equal(availableCells(s,id).length,12);assert.equal(funds(s),cash);assert.equal(essenceBalance(s),5);assert.deepEqual(s.attacks,attacks);assert.equal(forecastAttacks(s,4)[0].target,id);
 assert.equal(upgradeCamp(s,id),'');assert.equal(campRadius(s,id),12);assert.equal(campRadius(s),10);assert.equal(upgradeCamp(s,id),'');assert.equal(campRadius(s,id),14);assert.ok(upgradeCamp(s,id));assert.equal(essenceBalance(s),0);assert.equal(funds(s),cash);
 s.extraCamps.get(id).hp=20;assert.equal(repairQuote(s,key(20,27)).missing,10);assert.equal(repairQuote(s,key(1,1)).missing,0);assert.equal(repairFacility(s,key(20,27)),'');assert.equal(s.extraCamps.get(id).hp,30);assert.equal(s.hp,30);
 const snapshot=beginBattle(s);s.extraCamps.get(id).hp=1;assert.equal(restoreNight(snapshot).extraCamps.get(id).hp,30);
});
test('普通进攻对各净化塔独立结算，一座失守不会立即结束整局',async()=>{
 const {beginBattle,stepBattle,rebuildFields}=await import('../src/model.js');const s=createState([{x:1,y:1,hp:1,count:1,first:99,interval:1}]);s.extraCamps.set(key(35,35),{hp:30,level:0,day:0});rebuildFields(s);beginBattle(s);
 const enemy=(id,target,hp)=>({id,target,hp,members:1,sources:[0],origins:['0:0'],path:[id]});s.enemies=[enemy(s.camp,s.camp,99)];stepBattle(s);assert.equal(s.hp,0);assert.equal(s.phase,'battle');assert.equal(s.extraCamps.get(key(35,35)).hp,30);
 s.enemies=[enemy(key(36,36),key(35,35),99)];stepBattle(s);assert.equal(s.phase,'lost');
});

test('扩张预览只吸附已探索整栋建筑，雾外只读基础范围且不写探索',async()=>{
 const {createCampaign,expansionPreview,campBuildCandidate,productionCells}=await import('../src/model.js');
 const blocks=[{x:24,y:24,width:4,height:4,kind:'building'}],s=createCampaign({...DEFAULTS,controlRadius:2},[[{x:1,y:1,hp:1,count:1,first:1,interval:1}]],{width:60,height:60,camp:{x:15,y:25},blocks,tiles:Array(3600).fill('road')});
 const candidate=campBuildCandidate(s,key(20,25)),cells=productionCells(key(24,24),s),before=structuredClone(s);candidate.params={...s.params,controlRadius:4};
 const raw=rawControlMask(candidate),unknown=expansionPreview(s,candidate);assert.ok(cells.some(id=>raw.has(id)));assert.ok(cells.some(id=>!unknown.controlled.has(id)));assert.deepEqual(s,before);
 for(const id of cells)s.explored.add(id);assert.ok(cells.every(id=>expansionPreview(s,candidate).controlled.has(id)));
});
test('两座净化塔的并集完整覆盖地块即可接通，不要求单塔包住整栋',async()=>{
 const {createCampaign,plotPurified}=await import('../src/model.js');const blocks=[{x:17,y:24,width:6,height:4,kind:'building'}];
 const s=createCampaign({...DEFAULTS,controlRadius:4},undefined,{width:60,height:60,camp:{x:15,y:25},blocks,tiles:Array(3600).fill('road')});assert.equal(plotPurified(s,key(17,24)),false);
 s.extraCamps.set(key(23,25),{hp:30,level:0,day:0});assert.equal(plotPurified(s,key(17,24)),true);s.hp=0;assert.equal(plotPurified(s,key(17,24)),false);
});

test('净化精华按敌源面积只掉一次，清源无额外金币，快照重试撤回掉落',async()=>{
 const {essenceBalance,sourceEssenceReward,beginBattle,stepBattle,restoreNight,funds,rebuildFields}=await import('../src/model.js');
 const s=createState([{x:1,y:1,hp:1,count:1,first:100,interval:1}]);s.day=3;s.enemySources=new Map([['source',{id:'source',index:0,bx:18,by:24,width:2,height:2,x:18,y:24,hp:1,max:100,discovered:true,firstNight:1}]]);s.towers.set(key(17,24),'B');rebuildFields(s);
 const source=s.enemySources.get('source'),cash=funds(s),snapshot=beginBattle(s);assert.equal(sourceEssenceReward(s,source),4);stepBattle(s);assert.equal(source.hp,0);assert.equal(essenceBalance(s),4);assert.equal(funds(s),cash);assert.equal(s.events.find(e=>e.type==='sourceLost').essence,4);
 source.hp=1;stepBattle(s);assert.equal(essenceBalance(s),4);assert.equal(essenceBalance(restoreNight(snapshot)),0);assert.equal(restoreNight(snapshot).enemySources.get('source').hp,1);
});
test('金币与银行授信不能替代精华，失败建造升级不扣款、不改路线或范围',async()=>{
 const {createCampaign,campBuildError,buildCamp,upgradeCamp,essenceBalance,funds,applyTestScenario,validateParams}=await import('../src/model.js');
 const layout={width:60,height:60,camp:{x:15,y:25},blocks:[{x:18,y:25,width:4,height:4,kind:'open'}],tiles:Array(3600).fill('road')},waves=Array.from({length:5},()=>[{x:25,y:26,hp:3,count:1,first:1,interval:1}]),s=createCampaign({...DEFAULTS,budget:10000},waves,layout);s.day=3;const before=structuredClone(s);
 assert.match(campBuildError(s,key(19,26)),/精华不足/);assert.match(buildCamp(s,key(19,26)),/精华不足/);assert.match(upgradeCamp(s),/精华不足/);assert.deepEqual(s,before);
 assert.equal(applyTestScenario(s,3,10000,6,4),'');const gold=funds(s);assert.equal(buildCamp(s,key(19,26)),'');assert.equal(essenceBalance(s),0);assert.equal(funds(s),gold);
 for(const k of ['initialEssence','sourceEssencePerCell','campBuildEssence','campUpgradeEssence2','campUpgradeEssence3'])assert.match(validateParams({...s.params,[k]:1.5},s,false),/精华/);
 const unchanged=structuredClone(s);assert.match(applyTestScenario(s,3,10000,6,-1),/精华/);assert.deepEqual(s,unchanged);
});
