import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULTS} from '../src/config.js';
import {MAP_DEFAULTS as LARGE_MAP_DEFAULTS} from '../src/map-settings.js';
const MAP_DEFAULTS={...LARGE_MAP_DEFAULTS,width:60,height:60,landmarks:false};
import {generateCityMap} from '../src/city-map.js';
import {createCampaign,routeTimingReport,key,beginBattle,stepBattle,campCells,potentialSourceRoute,rebuildTerrain} from '../src/model.js';

const wave={x:15,y:20,hp:1,count:3,first:2,interval:2};
const setup=(nightTicks=10)=>createCampaign({...DEFAULTS,nightTicks,campHP:1000},[[wave],[wave]]);
test('休眠已知敌源的潜在路线只读，不读取未来计划或增加探索',()=>{
 const s=createCampaign(DEFAULTS,undefined,generateCityMap(MAP_DEFAULTS)),source=s.enemySources.get('source-3');
 assert.equal(potentialSourceRoute(s,source.id),null);source.discovered=true;
 const before=structuredClone(s),route=potentialSourceRoute(s,source.id);assert.ok(route.path.length>1);
 assert.ok(campCells(s).includes(route.path.at(-1)));assert.deepEqual(s,before);
 assert.deepEqual(Object.keys(route).sort(),['index','path','potential','sourceId']);
 s.waves=s.waves.map(()=>[]);source.firstNight=Infinity;
 assert.deepEqual(potentialSourceRoute(s,source.id),route);source.hp=0;
 assert.equal(potentialSourceRoute(s,source.id),null);assert.equal(potentialSourceRoute(s,'missing'),null);
});
test('潜在路线按当前物理地形绕建筑，玩家墙不改路，不覆盖今晚锁定路径',()=>{
 const source={id:'idle',index:0,bx:15,by:20,width:1,height:1,x:15,y:21,site:key(15,20)};
 const layout={width:60,height:60,camp:{x:15,y:25},tiles:Array(3600).fill('road'),blocks:[{x:15,y:20,width:1,height:1,kind:'building'},{x:15,y:22,width:1,height:1,kind:'open'}]};
 const s=createCampaign(DEFAULTS,[[]],layout,[source]);s.enemySources.get(source.id).discovered=true;
 const initial=potentialSourceRoute(s,source.id);assert.ok(initial.path.includes(key(15,22)));
 s.playerWalls.add(key(15,22));s.wallHealth.set(key(15,22),{hp:12,max:12});rebuildTerrain(s);
 assert.deepEqual(potentialSourceRoute(s,source.id),initial);
 s.plotContents.set(key(15,22),{status:'building',type:'production',cells:new Set([key(15,22)]),footprint:new Set([key(15,22)])});rebuildTerrain(s);
 const locked=structuredClone(s.attacks),route=potentialSourceRoute(s,source.id);
 assert.ok(!route.path.includes(key(15,22)));assert.ok(campCells(s).includes(route.path.at(-1)));assert.deepEqual(s.attacks,locked);
 s.field={next:new Map(),distance:new Map()};assert.equal(potentialSourceRoute(s,source.id),null);
});
test('无墙到达按出生后移动计拍，末拍到达有效，统计每批超时而非只看末批',()=>{
 const s=setup(),report=routeTimingReport(s),row=report.nights[0].rows[0];
 assert.equal(row.steps,4);assert.equal(row.cells,5);assert.equal(row.lastSpawn,6);assert.equal(row.lastArrival,10);
 assert.equal(row.lateCount,0);assert.equal(report.total,6);
 s.params.nightTicks=9;assert.equal(routeTimingReport(s).late,2);
 s.params.nightTicks=7;assert.equal(routeTimingReport(s).late,4);
 const arrivals=[];beginBattle(s);
 while(s.phase==='battle'){stepBattle(s);for(const event of s.events)if(event.type==='leak')arrivals.push(event.tick??s.tick);}
 assert.deepEqual(arrivals,[6]);assert.equal(s.withdrawn,2);
});
test('路线校验只读，忽略玩家墙但保留当晚锁定路线，其他晚按物理空间估计',()=>{
 const s=setup(30),initial=routeTimingReport(s);
 s.playerWalls.add(key(15,21));s.wallHealth.set(key(15,21),{hp:100,max:100});s.walls.add(key(15,21));
 assert.deepEqual(routeTimingReport(s),initial);
 // 一条更长的已锁路线；不允许工具擅自换成最短路线。
 s.attacks[0].path=[key(15,20),key(16,20),key(16,21),key(16,22),key(16,23),key(16,24)];
 const before=structuredClone(s),report=routeTimingReport(s);
 assert.equal(report.nights[0].rows[0].steps,5);assert.equal(report.nights[1].rows[0].steps,4);
 assert.deepEqual(s,before);
});
test('出生就在广场当拍到达；不可达路线明确报告所有批次无法到达',()=>{
 const s=setup();s.attacks[0]={...s.attacks[0],x:15,y:24,path:[key(15,24)]};
 let row=routeTimingReport(s).nights[0].rows[0];assert.equal(row.steps,0);assert.equal(row.lastArrival,6);
 s.attacks[0].path=[key(15,20)];row=routeTimingReport(s).nights[0].rows[0];
 assert.equal(row.lastArrival,null);assert.equal(row.steps,null);assert.equal(row.lateCount,3);assert.equal(routeTimingReport(s).unreachable,3);
});
test('默认15晚路线、末批时间及160拍/80拍超时人数；当前晚保留原定预告，已清源不生成其他晚计划',()=>{
 const s=createCampaign(DEFAULTS,undefined,generateCityMap(MAP_DEFAULTS)),report=routeTimingReport(s);
 assert.equal(report.nights.length,15);assert.equal(report.farthest.sourceNumber,8);assert.equal(report.farthest.steps,73);assert.equal(report.latest.lastArrival,146);
 assert.equal(report.late,0);assert.equal(report.unreachable,0);
 for(const night of report.nights)for(const row of night.rows)assert.equal(row.cells,row.steps+1);
 s.params.nightTicks=80;assert.ok(routeTimingReport(s).late>0);
 const source=s.enemySources.get(s.sources[0].sourceId);source.hp=0;
 const after=routeTimingReport(s);assert.ok(after.nights[0].rows.some(r=>r.sourceId===source.id));
 assert.ok(after.nights.slice(1).every(n=>n.rows.every(r=>r.sourceId!==source.id)));
 assert.ok(campCells(s).length===9);
});
