import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULTS} from '../src/config.js';
import {generateCityMap} from '../src/city-map.js';
import {MAP_DEFAULTS} from '../src/map-settings.js';
import {sourceMaxHP} from '../src/enemy-sources.js';
import {applyTestScenario,configureSourceMap,configureSourceNight,createCampaign,restartCampaign,knownSources,beginBattle,stepBattle,key,sourceCells} from '../src/model.js';
const setup=()=>createCampaign(DEFAULTS,undefined,generateCityMap(MAP_DEFAULTS));
function extraSource(state){
  for(const b of state.layout.blocks){
    const row={id:'source-9',index:8,bx:b.x,by:b.y,width:1,height:1};
    if(!configureSourceMap(state,[...state.sourceCatalog,row]).error)return row;
  }
  assert.fail('默认地图应有新增据点空间');
}
test('地图新增据点独立于十五晚兵力，按编号引用后从指定夜晚公开',()=>{
  const s=setup(),before=structuredClone(s),result=configureSourceMap(s,[...s.sourceCatalog,extraSource(s)]);
  assert.equal(result.error,'');assert.deepEqual(s,before);
  const next=result.state,added=next.enemySources.get('source-9');assert.equal(next.enemySources.size,9);assert.equal(added.firstNight,Infinity);
  assert.deepEqual(next.waves,s.waves);assert.ok(!knownSources(next).some(p=>p.id===added.id));
  const plan={sourceId:added.id,x:added.x,y:added.y,hp:8,count:4,first:20,interval:12,target:-2};
  assert.equal(configureSourceNight(next,3,[...next.waves[2],plan]),'');assert.equal(added.firstNight,3);assert.deepEqual(next.waves[0],s.waves[0]);
  assert.deepEqual(restartCampaign(next).waves,next.waves);assert.equal(restartCampaign(next).enemySources.get(added.id).firstNight,3);
});
test('地图占地移动不自动吸附，成功应用重开并将所有夜晚引用改到新出兵口',()=>{
  const s=setup(),row=extraSource(s),source=s.sourceCatalog[0],rows=s.sourceCatalog.map(p=>p.id===source.id?{...p,bx:row.bx,by:row.by}:p);
  s.hp=7;s.debugGold=123;s.day=3;
  const result=configureSourceMap(s,rows);assert.equal(result.error,'');const next=result.state,moved=next.enemySources.get(source.id);
  assert.equal(next.day,1);assert.equal(next.hp,DEFAULTS.campHP);assert.equal(next.debugGold,0);assert.equal(moved.bx,row.bx);assert.equal(moved.by,row.by);
  assert.ok(sourceCells(moved).every(id=>next.layout.tiles[id]==='block'));
  assert.ok(next.field.distance.has(key(moved.x,moved.y)));
  for(const night of next.waves)for(const plan of night.filter(p=>p.sourceId===source.id)){assert.equal(plan.x,moved.x);assert.equal(plan.y,moved.y);}
  const before=structuredClone(s);assert.match(configureSourceMap(s,rows.map(p=>p.id===source.id?{...p,bx:0,by:0}:p)).error,/普通建筑/);assert.deepEqual(s,before);
});
test('删除地图敌源清掉该源全部计划，其他源头兵力逐项不变',()=>{
  const s=setup(),removed=s.sourceCatalog[0].id,result=configureSourceMap(s,s.sourceCatalog.slice(1));assert.equal(result.error,'');
  assert.equal(result.state.enemySources.size,7);assert.deepEqual(result.state.waves,s.waves.map(w=>w.filter(p=>p.sourceId!==removed)));
  assert.match(configureSourceMap(s,[]).error,/1–12/);
});
test('每晚配置不重置资金和损伤，未来修改不换当前题目；清源后修改计划也不能复活',()=>{
  const s=setup(),attacks=structuredClone(s.attacks);s.hp=17;s.debugGold=45;
  const plans=s.waves[2].map(p=>({...p,count:1,first:5}));assert.equal(configureSourceNight(s,3,plans),'');
  assert.equal(s.hp,17);assert.equal(s.debugGold,45);assert.deepEqual(s.attacks,attacks);
  const source=s.enemySources.get(s.sourceCatalog[0].id);source.hp=0;
  assert.equal(configureSourceNight(s,1,s.waves[0]),'');assert.ok(!s.sources.some(p=>p.sourceId===source.id));
  beginBattle(s);stepBattle(s);assert.ok(!s.enemies.some(e=>e.sources?.some(id=>id.startsWith('0:'))));
  assert.match(configureSourceNight(s,2,plans),/仅白天/);
});
test('空夜晚合法；无效编号、重复敌源、越过黎明或非法HP均不改动配置',()=>{
  const s=setup();assert.equal(configureSourceNight(s,1,[]),'');assert.deepEqual(s.sources,[]);assert.deepEqual(s.attacks,[]);
  for(const plans of [[{...s.waves[1][0],sourceId:'missing'}],[s.waves[1][0],s.waves[1][0]],[{...s.waves[1][0],first:160,count:2}],[{...s.waves[1][0],hp:0}]]){
    const before=structuredClone(s);assert.notEqual(configureSourceNight(s,2,plans),'');assert.deepEqual(s,before);
  }
  const rows=s.sourceCatalog.map((p,i)=>i? p:{...p,maxHP:77}),result=configureSourceMap(s,rows);assert.equal(result.error,'');
  const source=result.state.enemySources.get(rows[0].id);assert.equal(source.hp,77);assert.equal(sourceMaxHP(source,{...DEFAULTS,sourceCellHPMax:100}),77);
  assert.match(configureSourceMap(s,rows.map((p,i)=>i?p:{...p,maxHP:1.5})).error,/HP/);
});

test('过去计划仅重开后生效，不追溯公开当前尚未激活的据点',()=>{
  const s=setup();assert.equal(applyTestScenario(s,3,100,6),'');
  const source=s.enemySources.get('source-3');assert.equal(source.firstNight,4);
  const plan={sourceId:source.id,x:source.x,y:source.y,hp:8,count:1,first:1,interval:12,target:-2};
  assert.equal(configureSourceNight(s,2,[...s.waves[1],plan]),'');assert.equal(source.firstNight,4);
  assert.equal(configureSourceNight(s,5,s.waves[4]),'');assert.equal(source.firstNight,4);
  assert.equal(restartCampaign(s).enemySources.get(source.id).firstNight,2);
});
