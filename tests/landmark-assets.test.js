import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

function read(name){
  const data=readFileSync(new URL('../assets/model-preview/generated/'+name+'.glb',import.meta.url)),length=data.readUInt32LE(12);
  assert.equal(data.readUInt32LE(8),data.length);
  return {doc:JSON.parse(data.subarray(20,20+length).toString()),bin:data.subarray(28+length)};
}
function bounds(doc,part){
  const meshes=part?[doc.meshes[doc.nodes.find(node=>node.name===part).mesh]]:doc.meshes;
  const accessors=meshes.flatMap(mesh=>mesh.primitives.map(p=>doc.accessors[p.attributes.POSITION]));
  return [0,1,2].map(i=>Math.max(...accessors.map(a=>a.max[i]))-Math.min(...accessors.map(a=>a.min[i])));
}
test('医院与银行完好/破损共享米制占地，救护车和楼层没有被格子尺度放大',()=>{
  for(const [name,footprint,width,depth] of [['hospital',[10,12],200,240],['bank',[8,8],160,160]])for(const suffix of ['','-ruined']){
    const {doc,bin}=read(name+suffix),metadata=doc.nodes[0].extras,size=bounds(doc);
    assert.equal(metadata.units,'meters');assert.deepEqual(metadata.footprint,footprint);
    assert.ok(Math.abs(size[0]-width)<.01&&Math.abs(size[2]-depth)<.01);assert.ok(size[1]>20&&size[1]<35);
    if(name==='hospital'){const car=bounds(doc,'hospital-ambulance');assert.ok(Math.abs(car[0]-2.1)<.01&&Math.abs(car[2]-5.7)<.01);assert.ok(car[1]>2&&car[1]<3.2);}
    for(const mesh of doc.meshes)for(const primitive of mesh.primitives){
      const accessor=doc.accessors[primitive.attributes.NORMAL],view=doc.bufferViews[accessor.bufferView];
      for(let i=0;i<accessor.count;i++){const offset=view.byteOffset+i*12,length=Math.hypot(bin.readFloatLE(offset),bin.readFloatLE(offset+4),bin.readFloatLE(offset+8));assert.ok(length>.999&&length<1.001);}
    }
    for(const [,y,,power,range] of metadata.entryLights){assert.ok(y>0&&y<size[1]);assert.ok(power>0&&range>0&&range<=25);}
  }
});
