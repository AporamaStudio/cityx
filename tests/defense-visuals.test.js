import test from 'node:test';
import assert from 'node:assert/strict';
import {defenseVisualEvents} from '../src/combat-visuals.js';
test('攻破替代同格受击扬尘，不反馈隐藏伤害、不更改实际事件',()=>{
  const events=[{type:'wallHit',id:4,value:2},{type:'wallLost',id:4,value:0},{type:'wallHit',id:4,value:2},{type:'leak',id:5,value:3},{type:'wallHit',id:6,value:9},{type:'hit',id:4,value:4}],before=structuredClone(events);
  assert.deepEqual(defenseVisualEvents(events,id=>id!==6),[{cell:4,type:'wallLost',value:0},{cell:5,type:'leak',value:3}]);assert.deepEqual(events,before);
  assert.deepEqual(defenseVisualEvents([{type:'wallHit',id:1,value:0}],()=>true),[]);
});
