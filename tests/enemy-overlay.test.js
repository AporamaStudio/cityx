import test from 'node:test';
import assert from 'node:assert/strict';
import {enemyBadgeLayouts} from '../src/enemy-overlay.js';
const frame=(x,y,alpha=1,members=1)=>({x,y,alpha,enemy:{hp:12,max:20,members},barHP:12});
test('相邻敌群标签避让且不画隐藏帧，合流显示实际敌群数',()=>{
  const frames=[frame(50,50),frame(50,50,1,3),frame(50,50,0)],before=structuredClone(frames);
  const labels=enemyBadgeLayouts(frames,(x,y)=>({x,y}),{width:400,height:200});assert.equal(labels.length,2);assert.equal(labels[1].count,3);
  const [a,b]=labels;assert.ok(a.x+a.w<=b.x||b.x+b.w<=a.x||a.y+a.h<=b.y||b.y+b.h<=a.y);assert.deepEqual(frames,before);
});
test('标签保留在视口内，视野外与近裁面后的实体不产生牌子',()=>{
  const labels=enemyBadgeLayouts([frame(0,0)],(x,y)=>({x,y}),{width:400,height:200});assert.ok(labels[0].x>=0&&labels[0].y>=0);
  assert.equal(enemyBadgeLayouts([frame(500,0)],(x,y)=>({x,y}),{width:400,height:200}).length,0);
  assert.equal(enemyBadgeLayouts([frame(50,50)],()=>({hidden:true,x:NaN,y:NaN}),{width:400,height:200}).length,0);
});
