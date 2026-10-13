import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const files=['suburban/building-type-a','suburban/building-type-h','suburban/building-type-u','commercial/building-a','commercial/building-d','commercial/building-j','industrial/building-a','industrial/building-f'];
function read(file){const data=readFileSync(new URL('../assets/model-preview/kenney/'+file+'.glb',import.meta.url)),length=data.readUInt32LE(12);assert.equal(data.readUInt32LE(8),data.length);return {doc:JSON.parse(data.subarray(20,20+length)),bin:data.subarray(28+length)};}
function bounds(doc){const accessors=doc.meshes.flatMap(m=>m.primitives.map(p=>doc.accessors[p.attributes.POSITION]));return [0,1,2].map(i=>[Math.min(...accessors.map(a=>a.min[i])),Math.max(...accessors.map(a=>a.max[i]))]);}
function image({doc,bin}){const view=doc.bufferViews[doc.images[0].bufferView];return bin.subarray(view.byteOffset??0,(view.byteOffset??0)+view.byteLength);}
test('八组固定废墟保留原占地和贴图，局部塌损不扩到其他格，法线有效',()=>{
  for(const file of files){
    const normal=read(file),ruin=read(file+'-ruined'),a=bounds(normal.doc),b=bounds(ruin.doc),meta=ruin.doc.nodes[0].extras;
    assert.equal(meta.intactModel,file.split('/').at(-1)+'.glb');assert.equal(meta.variant,'ruined');assert.deepEqual(image(normal),image(ruin));
    for(const axis of [0,2])for(let i=0;i<2;i++)assert.ok(Math.abs(a[axis][i]-b[axis][i])<1e-6);
    assert.ok(b[1][1]<=a[1][1]+1e-6);assert.ok(b[1][1]>a[1][1]*.35);
    const originalTriangles=normal.doc.meshes[0].primitives.reduce((n,p)=>n+(p.indices===undefined?normal.doc.accessors[p.attributes.POSITION].count:normal.doc.accessors[p.indices].count),0);
    const remaining=ruin.doc.meshes[0].primitives.filter(p=>p.material<normal.doc.materials.length).reduce((n,p)=>n+ruin.doc.accessors[p.attributes.POSITION].count,0);assert.ok(remaining>0&&remaining<originalTriangles);
    for(const p of ruin.doc.meshes[0].primitives){const n=ruin.doc.accessors[p.attributes.NORMAL],v=ruin.doc.bufferViews[n.bufferView];for(let i=0;i<n.count;i++){const offset=v.byteOffset+i*12,length=Math.hypot(ruin.bin.readFloatLE(offset),ruin.bin.readFloatLE(offset+4),ruin.bin.readFloatLE(offset+8));assert.ok(length>.999&&length<1.001);}}
  }
});
