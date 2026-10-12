import test from 'node:test';
import assert from 'node:assert/strict';
import {wallConnections} from '../src/city-facilities.js';

test('墙段横跨孤立道路，连续端段/转角/T形连接且地图边缘不绕行串行',()=>{
  assert.equal(wallConnections(21,new Set([21]),10,10,'v'),10);
  assert.equal(wallConnections(21,new Set([21]),10,10,'h'),5);
  assert.equal(wallConnections(21,new Set([21,22]),10,10),10);
  assert.equal(wallConnections(21,new Set([21,11]),10,10),5);
  const walls=new Set([21,11,22,31]),before=new Set(walls);
  assert.equal(wallConnections(21,walls,10,10),7);assert.deepEqual(walls,before);
  assert.equal(wallConnections(21,new Set([21,11,22]),10,10),3);
  assert.equal(wallConnections(20,new Set([20,19]),10,10,'h'),5);
});
