import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULTS} from '../src/config.js';
import {createCampaign,key,rawControlMask,controlMask,civilizationMask,civilizationCoverage,buildingCivilized,visionField,funds,population,validateParams} from '../src/model.js';

test('起步瞭望塔提供控制；只保留篝火文明覆盖不能获得施工权限',()=>{
 const s=createCampaign(),before=funds(s);assert.ok(s.outposts.get(s.camp).starter);assert.equal(before,DEFAULTS.budget);assert.equal(population(s).free,DEFAULTS.initialPopulation);
 assert.ok(rawControlMask(s).size);s.outposts.clear();assert.equal(rawControlMask(s).size,0);assert.ok(civilizationCoverage(s,s.camp));assert.equal(civilizationMask(s).size,0);
});
test('文明地面是控制与覆盖交集，夜间只改变视野，半径调整不改变控制',()=>{
 const s=createCampaign(),ground=rawControlMask(s),controlled=controlMask(s);s.params.campCivilRadius=2;
 const civil=civilizationMask(s);assert.ok(civil.size<controlled.size);assert.ok([...civil].every(id=>controlled.has(id)));assert.deepEqual(rawControlMask(s),ground);
 s.phase='battle';assert.deepEqual(civilizationMask(s),civil);assert.ok(visionField(s).size>controlled.size);
 assert.match(validateParams({...s.params,campCivilRadius:0},s,false),/文明半径/);
});
test('完好或废墟的文明资格统一按整栋中心，远端角落接触不激活整栋',()=>{
 const s=createCampaign();s.params.campCivilRadius=1;assert.equal(buildingCivilized(s,key(11,24)),false);
 s.params.campCivilRadius=10;assert.equal(buildingCivilized(s,key(11,24)),true);
});
