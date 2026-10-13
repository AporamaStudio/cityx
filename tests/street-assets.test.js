import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
function read(name){const bytes=readFileSync(new URL('../assets/model-preview/generated/'+name+'.glb',import.meta.url)),length=bytes.readUInt32LE(12);assert.equal(bytes.readUInt32LE(8),bytes.length);return JSON.parse(bytes.subarray(20,20+length));}
function size(doc){const positions=doc.meshes.flatMap(m=>m.primitives.map(p=>doc.accessors[p.attributes.POSITION]));return [0,1,2].map(i=>Math.max(...positions.map(a=>a.max[i]))-Math.min(...positions.map(a=>a.min[i])));}
test('墙门三态保留20m墙段与4m入口，文明入口保持米制合理尺度',()=>{
  for(const name of ['wall-gate','wall-gate-open','wall-gate-ruined']){const doc=read(name),s=size(doc);assert.equal(doc.nodes[0].extras.units,'meters');assert.equal(doc.nodes[0].extras.openingMeters,4);assert.equal(s[0],20);assert.ok(s[1]>=2.5&&s[1]<3.1);assert.ok(s[2]<=2.5);}
  const doc=read('courtyard-entry'),s=size(doc);assert.equal(doc.nodes[0].extras.visualOnly,true);assert.ok(s[0]<6&&s[1]<3.3&&s[2]<=1);assert.equal(doc.nodes[0].extras.openingMeters,4);
});

test('长椅花池采用真实小尺寸，完好车辆与燃烧车有同一车身尺度',()=>{
  const bench=size(read('street-bench')),planter=size(read('street-planter')),car=read('civil-car'),carSize=size(car),wreck=size(read('burnt-car'));
  assert.ok(Math.abs(bench[0]-2.2)<1e-6&&bench[1]<1.3&&bench[2]<.8);
  assert.ok(planter[0]<=1.6&&planter[1]<1.6&&planter[2]<=1.6);
  assert.equal(car.nodes[0].extras.units,'meters');assert.equal(car.nodes[0].extras.pairedWith,'burnt-car');assert.ok(carSize[1]<2);
  for(const axis of [0,2])assert.ok(Math.abs(carSize[axis]-wreck[axis]*car.nodes[0].extras.partnerScaleToMeters)<1e-6);
});
