import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const folder=new URL('../assets/model-preview/shelter-quality/',import.meta.url);
function asset(state){
  const bytes=readFileSync(new URL(`shelter-${state}.glb`,folder));
  assert.equal(bytes.readUInt32LE(0),0x46546c67);
  assert.equal(bytes.readUInt32LE(8),bytes.length);
  const doc=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString());
  return {doc,extras:doc.nodes.find(node=>node.extras?.shelterState)?.extras};
}

test('避难所两态保留相同米制占地、入口和安置位置，均为独立可编辑样板',()=>{
  const isolated=asset('isolated'),connected=asset('connected');
  for(const [state,{doc,extras}] of [['isolated',isolated],['connected',connected]]){
    assert.equal(extras.visualOnly,true);assert.equal(extras.units,'meters');
    assert.equal(extras.shelterState,state);assert.deepEqual(extras.footprintMeters,[60,80]);
    assert.deepEqual(extras.mainBuildingMeters,[33,22]);
    assert.ok(doc.materials.some(mat=>mat.normalTexture));
    assert.ok(doc.images.length>0);
    for(const image of doc.images){assert.equal(image.uri,undefined);assert.ok(Number.isInteger(image.bufferView));}
    const blend=readFileSync(new URL(`shelter-${state}.blend`,folder));
    assert.ok(blend.subarray(0,7).toString()==='BLENDER'||blend.readUInt32LE(0)===0xfd2fb528);
  }
  assert.deepEqual(isolated.extras.landmarks,connected.extras.landmarks);
});

test('孤立避难所保留应急光，接通后增加道路照明；日间导出不强制发光',()=>{
  const isolated=asset('isolated'),connected=asset('connected');
  assert.ok(isolated.extras.shelterLights.length>0);
  assert.ok(connected.extras.shelterLights.length>isolated.extras.shelterLights.length);
  assert.ok(!isolated.extras.shelterLights.some(light=>light[2]===28));
  assert.ok(connected.extras.shelterLights.some(light=>light[2]===28));
  for(const {doc,extras} of [isolated,connected]){
    for(const light of extras.shelterLights){assert.equal(light.length,5);assert.ok(light.every(Number.isFinite));assert.ok(light[3]>0&&light[4]>0);}
    const glass=doc.materials.find(mat=>mat.name==='shelter_warm_glass');
    assert.ok(glass.extras.shelterNightStrength>0);assert.equal(glass.extras.shelterNightColor.length,3);
    for(const mat of doc.materials)assert.ok(!mat.emissiveFactor||mat.emissiveFactor.every(value=>value===0));
  }
});

test('孤立版有局部破损和火光标记，接通版保留稳定照明及完整配楼',()=>{
  const isolated=asset('isolated'),connected=asset('connected');
  assert.equal(isolated.extras.shelterLightStyle,'firelight');
  assert.equal(connected.extras.shelterLightStyle,'led');
  assert.ok(isolated.doc.materials.some(mat=>mat.name==='shelter_exposed_masonry'));
  assert.ok(!connected.doc.materials.some(mat=>mat.name==='shelter_exposed_masonry'));
  assert.ok(isolated.extras.shelterCondition.includes('chipped-wing-parapet'));
  assert.equal(connected.extras.shelterCondition,undefined);
  const warm=isolated.doc.materials.find(mat=>mat.name==='shelter_warm_glass');
  const led=connected.doc.materials.find(mat=>mat.name==='shelter_warm_glass');
  assert.equal(warm.extras.shelterLightStyle,'firelight');assert.equal(led.extras.shelterLightStyle,'led');
  assert.ok(warm.extras.shelterNightColor[1]<led.extras.shelterNightColor[1]);
  assert.ok(warm.extras.shelterNightColor[2]<led.extras.shelterNightColor[2]);
});
