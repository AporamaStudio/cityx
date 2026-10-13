import test from 'node:test';
import assert from 'node:assert/strict';
import {visibleHitImpacts,shotEnvelope,SHOT_STYLES} from '../src/shot-visuals.js';

test('一个代表弹迹仍给所有实际可见的受伤敌群反馈，不读取隐藏或未命中对象',()=>{
  const shots=[{id:10,type:'B',target:12,enemyTarget:1}],events=[{type:'hit',id:12,target:1,value:1},{type:'hit',id:14,target:1,value:2},{type:'hit',id:16,target:1,value:2},{type:'kill',id:18,target:1,value:2},{type:'hit',id:20,target:1,value:0}],before=structuredClone({events,shots});
  const impacts=visibleHitImpacts(events,shots,id=>id!==16);
  assert.deepEqual(impacts.map(hit=>hit.cell),[12,14]);assert.equal(impacts[0].type,'B');assert.deepEqual({events,shots},before);
});
test('同格不同敌群保留身份，重复事件合并；源头反馈必须有可见代表弹迹',()=>{
  const events=[{type:'hit',id:12,target:1,value:2},{type:'hit',id:12,target:2,value:1},{type:'hit',id:12,target:1,value:1},{type:'sourceHit',sourceId:'s1',value:2},{type:'sourceHit',sourceId:'hidden',value:2}];
  const shots=[{type:'B',sourceId:'s1',x:3.5,y:4.5}];
  const impacts=visibleHitImpacts(events,shots,()=>true);
  assert.equal(impacts.length,3);assert.notEqual(impacts[0].id,impacts[1].id);assert.equal(impacts[2].cell,243);
  assert.equal(visibleHitImpacts(events,shots,id=>id!==243).length,2);
});
test('弹体为小米制实体，近远炮包络收敛；倒退时间不出现闪光或后坐',()=>{
  for(const type of ['A','B']){
    const style=SHOT_STYLES[type];assert.ok(style.radius*2<.2&&style.length<1);assert.ok(style.trail<=5);
    assert.deepEqual(shotEnvelope(-1,type),{travel:0,flash:0,recoil:0,smoke:0});
    const end=shotEnvelope(1,type);assert.deepEqual(end,{travel:1,flash:0,recoil:0,smoke:0});
  }
  assert.ok(SHOT_STYLES.B.flight>SHOT_STYLES.A.flight);assert.ok(shotEnvelope(.05,'B').flash>shotEnvelope(.05,'A').flash);
});
