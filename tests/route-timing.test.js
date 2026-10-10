import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULTS} from '../src/config.js';
import {MAP_DEFAULTS} from '../src/map-settings.js';
import {generateCityMap} from '../src/city-map.js';
import {createCampaign,routeTimingReport,key,beginBattle,stepBattle,campCells} from '../src/model.js';

const wave={x:15,y:20,hp:1,count:3,first:2,interval:2};
const setup=(nightTicks=10)=>createCampaign({...DEFAULTS,nightTicks,campHP:1000},[[wave],[wave]]);
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
 assert.equal(report.nights.length,15);assert.equal(report.farthest.sourceNumber,8);assert.equal(report.farthest.steps,68);assert.equal(report.latest.lastArrival,141);
 assert.equal(report.late,0);assert.equal(report.unreachable,0);
 for(const night of report.nights)for(const row of night.rows)assert.equal(row.cells,row.steps+1);
 s.params.nightTicks=80;assert.ok(routeTimingReport(s).late>0);
 const source=s.enemySources.get(s.sources[0].sourceId);source.hp=0;
 const after=routeTimingReport(s);assert.ok(after.nights[0].rows.some(r=>r.sourceId===source.id));
 assert.ok(after.nights.slice(1).every(n=>n.rows.every(r=>r.sourceId!==source.id)));
 assert.ok(campCells(s).length===9);
});
