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

test('运营暖光不增加网格或光源，保留楼体材质与变换并通过同一供电值开关',async()=>{
  const {operatingLights}=await loadBrowserModule('city-building-lights.js');
  const root=new THREE.Group(),material=new THREE.MeshStandardMaterial({color:'#789abc'}),mesh=new THREE.Mesh(new THREE.BoxGeometry(2,1,3),material);
  root.position.set(12,4,18);root.rotation.y=.4;root.scale.set(2,1,3);mesh.position.y=1;root.add(mesh);root.userData.podiumHeight=.1;
  root.updateMatrixWorld(true);const bounds=new THREE.Box3().setFromObject(root),matrix=mesh.matrixWorld.clone();let previousCalled=false;
  material.onBeforeCompile=()=>{previousCalled=true;};const geometry=mesh.geometry;
  operatingLights(root);
  assert.equal(root.children.length,1);assert.equal(mesh.geometry,geometry);assert.equal(mesh.material,material);assert.equal(material.transparent,false);
  assert.ok(mesh.matrixWorld.equals(matrix));assert.ok(new THREE.Box3().setFromObject(root).equals(bounds));
  const shader={uniforms:{},vertexShader:THREE.ShaderLib.standard.vertexShader,fragmentShader:THREE.ShaderLib.standard.fragmentShader};material.onBeforeCompile(shader);
  assert.equal(previousCalled,true);assert.equal(shader.uniforms.cityWindowPower.value,0);
  material.userData.cityPower.value=.65;assert.equal(shader.uniforms.cityWindowPower.value,.65);
  const center=bounds.getCenter(new THREE.Vector3());assert.equal(shader.uniforms.cityRoofBounds.value.x,center.x);assert.equal(shader.uniforms.cityRoofBounds.value.y,center.z);
  assert.ok(shader.uniforms.cityRoofHeight.value.x>bounds.min.y+.1);assert.match(shader.vertexShader,/inverseTransformDirection\(transformedNormal,viewMatrix\)/);
  material.userData.cityPower.value=0;assert.equal(shader.uniforms.cityWindowPower.value,0);
  geometry.dispose();material.dispose();
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

test('3D建设方案共用单色实体材质，蒙版可关闭并保留原楼材质与着色回调',async()=>{
 const {constructionAppearance,constructionMaskTexture,bindConstructionMask,setConstructionMask}=await loadBrowserModule('city-construction-preview.js');
 const root=new THREE.Group(),texture=new THREE.Texture(),old=new THREE.MeshStandardMaterial({map:texture,color:'#aabbcc'});
 root.add(new THREE.Mesh(new THREE.BoxGeometry(),old),new THREE.Mesh(new THREE.BoxGeometry(),old));
 let disposed=0;old.addEventListener('dispose',()=>disposed++);
 const mask=constructionAppearance(root),[a,b]=root.children;
 assert.equal(disposed,1);assert.equal(a.material,b.material);assert.equal(a.material.map,null);assert.equal(a.material.transparent,false);assert.equal(a.material.opacity,1);assert.equal(a.castShadow,false);assert.equal(a.userData.cityConstructionPreview,true);
 const plan={x:15,y:22,w:2,h:2,mask:new Uint8Array([1,0,0,1])},cells=constructionMaskTexture(plan);
 assert.deepEqual([...cells.image.data],[255,0,0,255,0,0,0,255,0,0,0,255,255,0,0,255]);
 setConstructionMask(mask,plan,cells);assert.equal(mask.active.value,1);assert.equal(mask.cells.value,cells);assert.deepEqual(mask.bounds.value.toArray(),[15,22,2,2]);
 const original=new THREE.Mesh(new THREE.BoxGeometry(),old);let previousCalled=false;old.onBeforeCompile=()=>{previousCalled=true;};
 const base=bindConstructionMask(original,false),shader={uniforms:{},vertexShader:'#include <begin_vertex>',fragmentShader:'#include <clipping_planes_fragment>'};
 old.onBeforeCompile(shader);assert.equal(previousCalled,true);assert.equal(old.map,texture);assert.equal(shader.uniforms.cityPlanSide.value,0);assert.equal(old.transparent,false);
 setConstructionMask(base,plan,cells);assert.equal(shader.uniforms.cityPlanActive.value,1);
 setConstructionMask(base,null);assert.equal(shader.uniforms.cityPlanActive.value,0);assert.equal(shader.uniforms.cityPlanCells.value,null);
 cells.dispose();a.material.dispose();texture.dispose();
});

test('升级光流只播放当前目标，复用几何材质，关闭/取消/减少动态均可恢复',async()=>{
 const {createUpgradePreview}=await loadBrowserModule('city-upgrade-preview.js');
 const parent=new THREE.Group(),effect=createUpgradePreview(parent),params={upgradeFlowHeightMeters:3,upgradeFlowCycleMs:2200,upgradeFlowOpacity:35};
 const a={id:1,x:12,y:23,w:8,h:8,cellMeters:20,eligible:true,focused:true,pulse:0},b={...a,id:2,x:30,focused:false};
 effect.update([a,b],1,params);const [first,second]=effect.group.children,mesh=first.children[1],ground=first.children[0];
 assert.equal(mesh.visible,true);assert.equal(second.children[1].visible,false);assert.equal(mesh.scale.y,.15);assert.equal(mesh.castShadow,false);assert.equal(mesh.material.depthWrite,false);
 assert.equal(ground.material.uniforms.flowing.value,1);assert.equal(second.children[0].material.uniforms.flowing.value,0);assert.equal(ground.material.uniforms.phase.value,1/2.2);assert.ok(ground.scale.y>.3);
 effect.update([{...a,focused:false},{...b,focused:true}],2,params);assert.equal(effect.group.children[0],first);assert.equal(first.children[1],mesh);assert.equal(mesh.visible,false);assert.equal(second.children[1].visible,true);assert.equal(ground.geometry,second.children[0].geometry);
 effect.update([a],3,{...params,upgradeFlowHeightMeters:0},true);assert.equal(mesh.visible,false);assert.equal(mesh.material.uniforms.still.value,1);assert.equal(mesh.material.uniforms.phase.value,0);assert.equal(effect.group.children.length,1);
 assert.equal(ground.material.uniforms.flowing.value,0);assert.equal(ground.material.uniforms.phase.value,0);assert.equal(ground.material.uniforms.still.value,1);
 effect.update([],4,params);assert.equal(effect.group.children.length,0);effect.dispose();assert.equal(parent.children.length,0);
});
