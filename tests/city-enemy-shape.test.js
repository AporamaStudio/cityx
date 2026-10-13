import test from 'node:test';
import assert from 'node:assert/strict';
import {zombieFigureCount,zombieFigurePose} from '../src/city-enemy-shape.js';

test('合流增加人群密度，损伤减少人物；技术人数上限不改变敌群数据',()=>{
  const item={members:1,health:1};assert.equal(zombieFigureCount(item),8);
  assert.ok(zombieFigureCount({...item,members:3})>8);assert.ok(zombieFigureCount({...item,health:.2})<8);
  assert.equal(zombieFigureCount({...item,members:100}),32);assert.equal(zombieFigureCount(item,20,5),5);assert.deepEqual(item,{members:1,health:1});
});
test('人物真实身高与稳定站位不受动画影响，停止移动后腿不继续走',()=>{
  for(let i=0;i<32;i++){
    const a=zombieFigurePose(i,71,0),b=zombieFigurePose(i,71,2),idle=zombieFigurePose(i,71,2,false);
    assert.equal(a.x,b.x);assert.equal(a.z,b.z);assert.equal(a.height,b.height);assert.ok(a.height>=1.65&&a.height<=1.9);assert.equal(idle.stride,0);
  }
});
