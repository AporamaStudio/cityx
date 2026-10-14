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
    let renders=0,visits=0,clearAlpha=null;
    const renderer={domElement:{width:64,height:64},setClearColor(color,alpha){clearAlpha=alpha;},render(){renders++;}};
    const root=new THREE.Group(),enemies=new THREE.Group(),effects=new THREE.Group(),scene=new THREE.Scene();scene.add(root,enemies,effects);
    const original=root.traverse.bind(root);root.traverse=fn=>{visits++;original(fn);};
    const mesh=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshStandardMaterial());root.add(mesh);
    const observation=createCityObservation(scene,renderer);
    const options={ground:{},groundVersion:1,geometryVersion:1,mist:{},mistBounds:[0,0,60,60],view:{width:64,height:64,cell:2,panX:0,panY:0,yaw:0,elevation:Math.PI/2},background:'#000',objects:[root],enemies,hasEnemies:false,effects};
    observation.render(options);const firstVisits=visits;observation.render(options);
    assert.equal(visits,firstVisits);assert.equal(mesh.material.userData.cityObserveFog,true);assert.equal(renders,2);assert.equal(observation.enemiesFrame(),null);assert.equal(clearAlpha,0);
    const added=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshStandardMaterial());root.add(added);
    observation.render({...options,geometryVersion:2,hasEnemies:true});
    assert.equal(added.material.userData.cityObserveFog,true);assert.equal(renders,4);assert.ok(observation.enemiesFrame());
    observation.render({...options,geometryVersion:2});assert.equal(renders,5);assert.equal(observation.enemiesFrame(),null);assert.equal(enemies.visible,false);assert.equal(clearAlpha,0);
  }finally{globalThis.document=previous;}
});


test('静态变换保留屋顶拾取和包围盒，镜头帧不重算矩阵，重建后使用新位置',async()=>{
  const {freezeCityTransforms}=await loadBrowserModule('city-observation.js');
  const scene=new THREE.Scene(),root=new THREE.Group(),mesh=new THREE.Mesh(new THREE.BoxGeometry(2,2,2),new THREE.MeshStandardMaterial());
  root.position.set(8,1,4);mesh.position.y=2;mesh.rotation.y=.4;root.add(mesh);scene.add(root);scene.updateMatrixWorld(true);
  const before=new THREE.Box3().setFromObject(root),matrix=mesh.matrixWorld.clone();
  const ray=new THREE.Raycaster(new THREE.Vector3(8,20,4),new THREE.Vector3(0,-1,0)),height=ray.intersectObject(root,true)[0].point.y;
  freezeCityTransforms(root);let recalculations=0;
  const multiply=mesh.matrixWorld.multiplyMatrices.bind(mesh.matrixWorld);mesh.matrixWorld.multiplyMatrices=(...args)=>{recalculations++;return multiply(...args);};
  for(let i=0;i<3;i++)scene.updateMatrixWorld(true);
  assert.equal(recalculations,0);assert.ok(mesh.matrixWorld.equals(matrix));assert.ok(new THREE.Box3().setFromObject(root).equals(before));
  assert.equal(ray.intersectObject(root,true)[0].point.y,height);
  mesh.material.opacity=.3;root.visible=false;assert.equal(mesh.material.opacity,.3);
  root.removeFromParent();const replacement=new THREE.Group();replacement.position.set(12,0,4);replacement.add(new THREE.Mesh(new THREE.BoxGeometry(2,2,2),new THREE.MeshStandardMaterial()));scene.add(replacement);freezeCityTransforms(replacement);
  assert.equal(new THREE.Box3().setFromObject(replacement).getCenter(new THREE.Vector3()).x,12);
});
