import test from 'node:test';
import assert from 'node:assert/strict';
import {createRenderMeter} from '../src/render-meter.js';

test('重绘帧率由实际时间计算，空闲20Hz不会被轻量绘制判成高负载',()=>{
  const meter=createRenderMeter();let result;
  for(let now=0;now<=1050;now+=50)result=meter.push(now,4.9,5.2)||result;
  assert.equal(result.fps,20);assert.ok(Math.abs(result.drawMs-4.9)<.001);assert.equal(result.load,'low');
});
test('连续交互掉帧及CPU预算不足分别进入黄色与红色',()=>{
  for(const [interval,cpu,load] of [[25,5,'medium'],[50,5,'high'],[16,12,'medium'],[16,20,'high']]){
    const meter=createRenderMeter();let result;
    for(let now=0;now<=1100;now+=interval)result=meter.push(now,4,cpu,true)||result;
    assert.equal(result.load,load);
  }
});
test('关闭或切换场景后清空旧统计，不混入旧长帧',()=>{
  const meter=createRenderMeter();meter.push(0,100,100);meter.push(1000,100,100);meter.reset();
  assert.equal(meter.push(5000,3,4),null);const result=meter.push(6000,3,4);assert.equal(result.drawMs,3);assert.equal(result.load,'low');
});
