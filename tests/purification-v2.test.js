import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULTS} from '../src/config.js';
import {createState,key,campCells,campCenter,circleCells,purificationMask,rawControlMask,controlMask,visionField,buildOutpost,population} from '../src/model.js';
test('净化塔占地2×2，圆心位于四格中间，欧氏覆盖不包含方形角落',()=>{
 const s=createState();assert.deepEqual(campCells(s),[key(15,25),key(16,25),key(15,26),key(16,26)]);assert.deepEqual(campCenter(s),[16,26]);
 const circle=new Set(circleCells([16,26],2));assert.ok(circle.has(key(17,26)));assert.ok(!circle.has(key(17,27)));assert.equal(purificationMask(s).size,rawControlMask(s).size);
});
test('机械塔无人、联网扩张控制但不净化，断联闭环不输出有效覆盖',()=>{
 const s=createState(undefined,undefined,undefined,{...DEFAULTS,controlRadius:3});s.day=3;const id=key(17,26),people=population(s).total,pure=purificationMask(s);
 assert.equal(buildOutpost(s,id),'');assert.equal(population(s).free,people);assert.ok(rawControlMask(s).size>pure.size);assert.deepEqual(purificationMask(s),pure);
 s.outposts.set(key(40,40),{});s.outposts.set(key(43,40),{});assert.ok(!rawControlMask(s).has(key(40,40)));assert.ok(!visionField(s).has(key(43,40)));
});
test('两塔实时视野在昼夜完全一致，净化半径参数不改离散武器形状',()=>{
 const s=createState();assert.deepEqual(visionField(s,'build'),visionField(s,'battle'));assert.equal(s.params.outpostS01,2);assert.ok(controlMask(s).size>=purificationMask(s).size);assert.equal(s.params.weapons.A.shape,'square');
});
