import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as THREE from '../assets/model-preview/vendor/three/build/three.module.js';

// Node没有网页import map；只替换模块地址，测试实际实现及实际Three对象。
async function loadBrowserModule(name){
  const source=(await readFile(new URL('../src/'+name,import.meta.url),'utf8'))
    .replace("'three'",JSON.stringify(new URL('../assets/model-preview/vendor/three/build/three.module.js',import.meta.url).href))
    .replace("'./city-view.js?v=3'",JSON.stringify(new URL('../src/city-view.js',import.meta.url).href));
  return import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
}

test('静态水域只登记一次节点，时间/昼夜仍逐次更新，替换根对象重新登记',async()=>{
  const {updateWater}=await loadBrowserModule('city-water.js');
  let visits=0;const uniforms={time:{value:0},night:{value:0}};
  const root={traverse(fn){visits++;fn({material:{userData:{cityWater:uniforms}}});}};
  updateWater(root,4,.2);updateWater(root,7,1,true);
  assert.equal(visits,1);assert.equal(uniforms.time.value,0);assert.equal(uniforms.night.value,1);
  const next={time:{value:0},night:{value:0}};
  updateWater({traverse(fn){fn({material:{userData:{cityWater:next}}});}},9,0);
  assert.equal(next.time.value,9);assert.equal(next.night.value,0);
});

test('观察层缓存静态材质并登记新网格，空敌人不绘制也不返回旧画面',async()=>{
  const previous=globalThis.document;
  globalThis.document={createElement:()=>({width:64,height:64,getContext:()=>({clearRect(){},drawImage(){}})})};
  try{
    const {createCityObservation}=await loadBrowserModule('city-observation.js');
    let renders=0,visits=0;
    const renderer={domElement:{width:64,height:64},setClearColor(){},render(){renders++;}};
    const root=new THREE.Group(),enemies=new THREE.Group(),effects=new THREE.Group(),scene=new THREE.Scene();scene.add(root,enemies,effects);
    const original=root.traverse.bind(root);root.traverse=fn=>{visits++;original(fn);};
    const mesh=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshStandardMaterial());root.add(mesh);
    const observation=createCityObservation(scene,renderer);
    const options={ground:{},groundVersion:1,geometryVersion:1,mist:{},mistBounds:[0,0,60,60],view:{width:64,height:64,cell:2,panX:0,panY:0,yaw:0,elevation:Math.PI/2},background:'#000',objects:[root],enemies,hasEnemies:false,effects};
    observation.render(options);const firstVisits=visits;observation.render(options);
    assert.equal(visits,firstVisits);assert.equal(mesh.material.userData.cityObserveFog,true);assert.equal(renders,2);assert.equal(observation.enemiesFrame(),null);
    const added=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshStandardMaterial());root.add(added);
    observation.render({...options,geometryVersion:2,hasEnemies:true});
    assert.equal(added.material.userData.cityObserveFog,true);assert.equal(renders,4);assert.ok(observation.enemiesFrame());
    observation.render({...options,geometryVersion:2});assert.equal(renders,5);assert.equal(observation.enemiesFrame(),null);assert.equal(enemies.visible,false);
  }finally{globalThis.document=previous;}
});
