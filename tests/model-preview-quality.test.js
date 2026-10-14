import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const root=new URL('../assets/model-preview/cityhall-quality/',import.meta.url);
const glb=readFileSync(new URL('city-hall.glb',root));
const doc=JSON.parse(glb.subarray(20,20+glb.readUInt32LE(12)).toString());

test('品质样板导出真实米制园区、分件源文件和可用的夜间灯位',()=>{
  assert.equal(glb.readUInt32LE(0),0x46546c67);assert.equal(glb.readUInt32LE(4),2);assert.equal(glb.readUInt32LE(8),glb.length);
  const extras=doc.nodes.find(node=>node.extras?.qualitySample)?.extras;
  assert.ok(extras);assert.equal(extras.units,'meters');assert.equal(extras.visualOnly,true);assert.deepEqual(extras.footprintMeters,[120,140]);
  assert.ok(extras.cityhallLights.length>0);
  for(const light of extras.cityhallLights){assert.equal(light.length,5);assert.ok(light.every(Number.isFinite));assert.ok(light[3]>0&&light[4]>0);}
  // Blender5可默认压缩保存为Zstandard；源文件仍须能由Blender真实重新打开。
  const blend=readFileSync(new URL('city-hall.blend',root));
  assert.ok(blend.subarray(0,7).toString()==='BLENDER'||blend.readUInt32LE(0)===0xfd2fb528);
});

test('品质样板的PBR贴图内嵌GLB，玻璃与灯具可独立控制发光',()=>{
  assert.ok(doc.images.length>0);
  for(const image of doc.images){assert.equal(image.uri,undefined);assert.ok(Number.isInteger(image.bufferView));assert.equal(image.mimeType,'image/png');}
  assert.ok(doc.materials.some(m=>m.normalTexture));
  for(const name of ['cityhall_glass_lit','cityhall_glass_dark','cityhall_lamp'])assert.ok(doc.materials.some(m=>m.name===name));
  for(const mesh of doc.meshes)for(const primitive of mesh.primitives){assert.ok(Number.isInteger(primitive.attributes.POSITION));assert.ok(Number.isInteger(primitive.attributes.NORMAL));assert.ok(doc.accessors[primitive.attributes.POSITION].count>0);}
});
