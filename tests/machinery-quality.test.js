import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Box3,Matrix4,Quaternion,Vector3} from '../assets/model-preview/vendor/three/build/three.module.js';
import {QUALITY_MACHINERY} from '../src/model-preview-machinery.js';

const documents=new Map(),buffers=new Map();
for(const asset of QUALITY_MACHINERY){
  const base=new URL(`../assets/model-preview/${asset.id}-quality/${asset.id}`,import.meta.url);
  const bytes=readFileSync(new URL(base+'.glb'));
  const doc=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString());documents.set(asset.id,doc);
  buffers.set(doc,bytes.subarray(28+bytes.readUInt32LE(12)));
  test(`${asset.name}具有米制分件源文件、内嵌PBR和昼夜俯视实渲`,()=>{
    assert.equal(bytes.readUInt32LE(0),0x46546c67);assert.equal(bytes.readUInt32LE(8),bytes.length);
    const meta=doc.nodes.find(n=>n.extras?.machineryAsset)?.extras;
    assert.equal(meta.machineryAsset,asset.id);assert.equal(meta.units,'meters');assert.equal(meta.visualOnly,true);
    assert.deepEqual(meta.siteMeters,asset.footprint);
    assert.ok(doc.materials.some(m=>m.normalTexture));assert.ok(doc.images.length>0);
    for(const image of doc.images){assert.equal(image.uri,undefined);assert.ok(Number.isInteger(image.bufferView));}
    for(const material of doc.materials){
      for(const map of [material.pbrMetallicRoughness?.baseColorTexture,material.normalTexture])if(map)assert.ok((map.texCoord??0)>=0,'纹理不能引用缺失UV');
    }
    for(const mesh of doc.meshes)for(const p of mesh.primitives){assert.ok(Number.isInteger(p.attributes.POSITION));assert.ok(Number.isInteger(p.attributes.NORMAL));assert.ok(Number.isInteger(p.attributes.TEXCOORD_0));}
    const blend=readFileSync(new URL(base+'.blend'));
    assert.ok(blend.subarray(0,7).toString()==='BLENDER'||blend.readUInt32LE(0)===0xfd2fb528);
    for(const period of ['day','night','top']){
      const png=readFileSync(new URL(`../assets/model-preview/${asset.id}-quality/renders/${asset.id}-${period}.png`,import.meta.url));
      assert.equal(png.subarray(1,4).toString(),'PNG');assert.equal(png.readUInt32BE(16),1440);assert.equal(png.readUInt32BE(20),1152);
    }
  });
}

function equipmentBounds(doc){
  const bounds=new Box3();
  function visit(index,parent,skip=false){
    const node=doc.nodes[index],local=node.matrix?new Matrix4().fromArray(node.matrix):new Matrix4().compose(new Vector3().fromArray(node.translation??[0,0,0]),new Quaternion().fromArray(node.rotation??[0,0,0,1]),new Vector3().fromArray(node.scale??[1,1,1]));
    const world=parent.clone().multiply(local);
    skip||=['DisplaySite','ScaleCar'].includes(node.extras?.visualPart);
    if(node.mesh!==undefined&&!skip)for(const p of doc.meshes[node.mesh].primitives){
      const accessor=doc.accessors[p.attributes.POSITION];
      // 旋转合批网格的局部AABB再转世界会过度扩大，直接检查真实位置顶点。
      const view=doc.bufferViews[accessor.bufferView],data=buffers.get(doc),offset=(view.byteOffset??0)+(accessor.byteOffset??0),stride=view.byteStride??12;
      assert.equal(accessor.componentType,5126);
      for(let i=0;i<accessor.count;i++){
        const pos=offset+i*stride;
        bounds.expandByPoint(new Vector3(data.readFloatLE(pos),data.readFloatLE(pos+4),data.readFloatLE(pos+8)).applyMatrix4(world));
      }
    }
    for(const child of node.children??[])visit(child,world,skip);
  }
  for(const index of doc.scenes[doc.scene??0].nodes)visit(index,new Matrix4());
  return bounds.getSize(new Vector3());
}

test('导出枢轴保留真实尺度，展示地台不计入机械实体体量',()=>{
  const purifier=equipmentBounds(documents.get('purification-tower')),relay=equipmentBounds(documents.get('mechanical-tower')),machine=equipmentBounds(documents.get('legacy-machine'));
  assert.ok(purifier.x>=19.9&&purifier.x<22,JSON.stringify({purifier,relay,machine}));assert.ok(purifier.y>=25&&purifier.y<27);
  assert.ok(relay.x>=4.9&&relay.x<5.5);assert.ok(relay.y>17&&relay.y<19);
  assert.ok(machine.x>2.4&&machine.x<2.7);assert.ok(machine.z>4.3&&machine.z<4.8);assert.ok(machine.y>2.1&&machine.y<2.5);
  const nodes=documents.get('legacy-machine').nodes,turret=nodes.findIndex(n=>n.extras?.visualPart==='Turret'),barrel=nodes.findIndex(n=>n.extras?.visualPart==='Barrel');
  assert.ok(nodes[turret].children.includes(barrel),'炮管须跟随转塔，同时保留独立俯仰枢轴');
  for(const name of ['TrackLeft','TrackRight'])assert.ok(nodes.some(n=>n.extras?.visualPart===name));
});

test('机械塔仅保留四向固定灯和向上灯，核心工作材质昼夜均可用',()=>{
  const relay=documents.get('mechanical-tower').nodes.find(n=>n.extras?.machineryAsset)?.extras;
  assert.equal(relay.sweepingSearchlights,false);assert.equal(relay.machinerySpotLights.length,4);assert.equal(relay.machineryLights.length,1);
  for(const lamp of relay.machinerySpotLights){assert.ok(lamp.position[1]>lamp.target[1]);assert.ok(lamp.angle>0&&lamp.angle<Math.PI/2);}
  const purifier=documents.get('purification-tower');
  assert.ok(purifier.nodes.some(n=>n.extras?.visualPart==='AlienCore'));
  assert.ok(purifier.materials.some(m=>m.extras?.machineryDayEmission>0&&m.extras?.machineryNightEmission>0));
});
