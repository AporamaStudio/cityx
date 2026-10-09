import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULTS,SIZE} from '../src/config.js';
import {knownSources,firstNightReady,createState,key,xy,visionField,inControl,coverage,validateParams,revealControl,buildOutpost,removeOutpost,funds} from '../src/model.js';
function state(){return createState([{x:40,y:10,hp:6,count:1,first:1,interval:12}],undefined,undefined,{...DEFAULTS,controlRadius:3});}
test('瞭望塔当天拆返全部投入、收回独占视野，保留探索及重叠视野',()=>{
 const s=state();s.day=3;const id=key(15,27),before=visionField(s),cash=funds(s);s.explored=new Set(before);
 assert.equal(buildOutpost(s,id),'');const withTower=visionField(s),extra=[...withTower].filter(cell=>!before.has(cell));assert.ok(extra.length>0);
 assert.ok(extra.every(cell=>s.explored.has(cell)));assert.equal(removeOutpost(s,id),'');
 assert.equal(funds(s),cash);assert.deepEqual(visionField(s),before);
 assert.ok(extra.every(cell=>s.explored.has(cell)&&!visionField(s).has(cell)));
});
test('夜晚缩小外围视野，不缩控制区；探索记忆保留，未见地形不预开矩形',()=>{
 const s=state(),day=visionField(s),night=visionField(s,'battle'),[cx,cy]=xy(s.camp),edge=key(cx,cy-8);
 assert.ok(night.has(key(cx,cy-7)));assert.ok(!night.has(edge));
 assert.ok(day.size>night.size);assert.ok(day.has(edge));assert.ok(!night.has(edge));
 for(let id=0;id<SIZE*SIZE;id++)if(inControl(s,id))assert.ok(night.has(id));
 s.explored=new Set();revealControl(s);s.phase='battle';revealControl(s);assert.ok(s.explored.has(edge));assert.ok(!s.explored.has(key(59,59)));
});
test('炮塔视野等于射程形状且不受昼夜及事件倍率影响，拆除后失去该视野',()=>{
 const s=state(),id=key(30,30);s.towers.set(id,'B');s.params.eventSightMultiplier=0;
 for(const shape of ['square','diamond']){s.params.weapons.B.shape=shape;for(const phase of ['build','battle']){
  const seen=visionField(s,phase);for(const cell of coverage(id,3,shape))assert.ok(seen.has(cell));
  assert.equal(seen.has(key(33,33)),shape==='square');assert.ok(!seen.has(key(34,30)));
 }}
 s.towers.delete(id);assert.ok(!visionField(s).has(id));
});
test('敌源揭示尺寸可配置，独立于据点且昼夜保持；前哨外围可单独调大',()=>{
 const s=state();s.waves=[s.sources,[{x:50,y:10,count:1}]];s.day=2;
 for(const n of [2,3]){s.params.sourceRevealSize=n;const seen=visionField(s,'battle'),offset=Math.floor((n-1)/2);
 for(const x of [40,50])for(let dy=0;dy<n;dy++)for(let dx=0;dx<n;dx++)assert.ok(seen.has(key(x-offset+dx,10-offset+dy)));
 assert.ok(!seen.has(key(40+n,10+n)));
 }
 s.outposts.set(key(30,40),{});const before=visionField(s);s.params.outpostSight=10;assert.ok(visionField(s).size>before.size);
 assert.match(validateParams({...s.params,nightSightMultiplier:-1},s,false),/视野倍率/);
});

test('医院中心固定揭示5×5，昼夜相同且不获得控制权限',()=>{
 const s=state();s.sites=[{x:1,y:1,width:10,height:12,role:'hospital'}];
 for(const phase of ['build','battle']){const seen=visionField(s,phase);
  for(let y=5;y<=9;y++)for(let x=4;x<=8;x++){assert.ok(seen.has(key(x,y)));assert.ok(!inControl(s,key(x,y)));}
  assert.ok(!seen.has(key(3,7)));assert.ok(!seen.has(key(6,10)));
 }
});

test('敌源首次当日公开，停兵保留；第一晚必须有炮塔',()=>{
 const s=state(),later={x:50,y:10,count:1};s.waves=[s.sources,[later]];
 assert.equal(knownSources(s).length,1);assert.ok(!visionField(s).has(key(50,10)));
 assert.equal(firstNightReady(s),false);s.towers.set(key(30,40),'A');assert.equal(firstNightReady(s),true);
 s.towers.clear();assert.equal(firstNightReady(s),false);
 s.day=2;s.sources=[later];assert.equal(firstNightReady(s),true);
 assert.deepEqual(knownSources(s).map(s=>s.active),[false,true]);assert.ok(visionField(s).has(key(50,10)));
});
