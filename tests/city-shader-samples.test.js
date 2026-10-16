import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as THREE from '../assets/model-preview/vendor/three/build/three.module.js';

const three=new URL('../assets/model-preview/vendor/three/build/three.module.js',import.meta.url).href;
const source=(await readFile(new URL('../src/city-shader-samples.js',import.meta.url),'utf8')).replace("from 'three'",`from '${three}'`);
const {createShaderSamples,shaderSampleKey,cloneWarmupMaterial}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));

function setup(){
  const scene=new THREE.Scene(),root=new THREE.Group(),camera=new THREE.PerspectiveCamera(),fire=new THREE.PointLight(),tower=new THREE.SpotLight();
  tower.visible=false;tower.userData.cityNightOnly=true;scene.add(new THREE.HemisphereLight(),fire,tower);
  const mesh=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshStandardMaterial());root.add(mesh);
  return {scene,root,camera,fire,tower,mesh,samples:createShaderSamples()};
}

test('颜色变化共享结构，施工着色、实例颜色与受影条件分别准备',()=>{
  const {mesh}=setup(),material=mesh.material.clone();material.color.set('#ff0000');
  assert.equal(shaderSampleKey(mesh,mesh.material),shaderSampleKey(mesh,material));
  material.customProgramCacheKey=()=> 'construction';assert.notEqual(shaderSampleKey(mesh,mesh.material),shaderSampleKey(mesh,material));
  const instanced=new THREE.InstancedMesh(mesh.geometry,mesh.material,2),plain=shaderSampleKey(instanced,mesh.material);
  instanced.setColorAt(0,new THREE.Color());assert.notEqual(shaderSampleKey(instanced,mesh.material),plain);
  const original=shaderSampleKey(mesh,mesh.material);mesh.receiveShadow=true;assert.notEqual(shaderSampleKey(mesh,mesh.material),original);
});

test('昼夜各有独立目标灯光和材质，真实场景不被临时开灯或重挂',()=>{
  const {scene,root,camera,fire,tower,mesh,samples}=setup(),material=mesh.material,parent=mesh.parent;
  material.onBeforeCompile=shader=>{shader.uniforms.example={value:1};};material.customProgramCacheKey=()=> 'custom';
  const work=samples.prepare(root,camera,[fire,tower],scene);
  assert.equal(work.batches.length,2);assert.equal(work.batches[0].scene.children.filter(n=>n.isSpotLight).length,0);
  assert.equal(work.batches[1].scene.children.filter(n=>n.isSpotLight).length,1);assert.equal(tower.visible,false);assert.equal(mesh.parent,parent);
  const first=work.batches[0].root.children[0].material,second=work.batches[1].root.children[0].material;
  assert.notEqual(first,material);assert.notEqual(first,second);assert.equal(first.onBeforeCompile,material.onBeforeCompile);assert.equal(first.customProgramCacheKey(),'custom');
});

test('相同结构去重，已完成的白天配置复用；新塔只补充新夜景并释放旧夜景',()=>{
  const {scene,root,camera,fire,tower,mesh,samples}=setup();root.add(new THREE.Mesh(mesh.geometry,mesh.material.clone()));
  const first=samples.prepare(root,camera,[fire,tower],scene);assert.equal(first.batches.length,2);
  let disposed=0;first.batches[1].root.children[0].material.addEventListener('dispose',()=>disposed++);
  for(const batch of first.batches)batch.complete();first.complete();assert.equal(samples.prepare(root,camera,[fire,tower],scene).batches.length,0);
  const next=new THREE.SpotLight();next.userData.cityNightOnly=true;next.visible=false;scene.add(next);
  const second=samples.prepare(root,camera,[fire,tower,next],scene);assert.equal(second.batches.length,1);assert.equal(disposed,0);
  second.batches[0].complete();second.complete();assert.equal(disposed,1);
});

test('释放代表材质不释放真实模型、纹理或几何，重开后重新准备',()=>{
  const {scene,root,camera,fire,tower,mesh,samples}=setup();let originalFreed=0,representativesFreed=0;
  mesh.geometry.addEventListener('dispose',()=>originalFreed++);mesh.material.addEventListener('dispose',()=>originalFreed++);
  const work=samples.prepare(root,camera,[fire,tower],scene);
  for(const batch of work.batches)batch.root.children[0].material.addEventListener('dispose',()=>representativesFreed++);
  samples.reset();assert.equal(representativesFreed,2);assert.equal(originalFreed,0);assert.equal(samples.prepare(root,camera,[fire,tower],scene).batches.length,2);
});

test('代表材质复制保留真实shader回调与纹理引用，不改变原材质',()=>{
  const material=new THREE.MeshStandardMaterial({map:new THREE.Texture()});let calls=0;
  material.onBeforeCompile=()=>calls++;material.customProgramCacheKey=()=> 'windows';const copy=cloneWarmupMaterial(material);
  copy.onBeforeCompile({});assert.equal(calls,1);assert.equal(copy.map,material.map);assert.equal(copy.customProgramCacheKey(),'windows');assert.notEqual(copy.uuid,material.uuid);
});
