import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as THREE from '../assets/model-preview/vendor/three/build/three.module.js';

// Node没有网页import map；只替换模块地址，测试实际实现及实际Three对象。
async function loadBrowserModule(name){
  const mergeSource=(await readFile(new URL('../assets/model-preview/vendor/three/examples/jsm/utils/BufferGeometryUtils.js',import.meta.url),'utf8')).replace("'three'",JSON.stringify(new URL('../assets/model-preview/vendor/three/build/three.module.js',import.meta.url).href));
  const source=(await readFile(new URL('../src/'+name,import.meta.url),'utf8'))
    .replace("'three'",JSON.stringify(new URL('../assets/model-preview/vendor/three/build/three.module.js',import.meta.url).href))
    .replace("'three/addons/utils/BufferGeometryUtils.js'",JSON.stringify('data:text/javascript;base64,'+Buffer.from(mergeSource).toString('base64')))
    .replace(/'\.\/city-view\.js\?v=[^']+'/,JSON.stringify(new URL('../src/city-view.js',import.meta.url).href));
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
    const options={geometryVersion:1,mist:{},mistBounds:[0,0,60,60],view:{width:64,height:64,cell:2,panX:0,panY:0,yaw:0,elevation:Math.PI/2},background:'#000',objects:[root],enemies,hasEnemies:false,effects};
    observation.render(options);const firstVisits=visits;observation.render(options);
    assert.equal(visits,firstVisits);assert.equal(mesh.material.userData.cityObserveFog,true);assert.equal(renders,2);assert.equal(observation.enemiesFrame(),null);assert.equal(clearAlpha,0);
    const added=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshStandardMaterial());root.add(added);
    observation.render({...options,geometryVersion:2,hasEnemies:true});
    assert.equal(added.material.userData.cityObserveFog,true);assert.equal(renders,4);assert.ok(observation.enemiesFrame());
    observation.render({...options,geometryVersion:2});assert.equal(renders,5);assert.equal(observation.enemiesFrame(),null);assert.equal(enemies.visible,false);assert.equal(clearAlpha,0);
    const shader={uniforms:{},vertexShader:THREE.ShaderLib.standard.vertexShader,fragmentShader:THREE.ShaderLib.standard.fragmentShader};mesh.material.onBeforeCompile(shader);
    const texture=shader.uniforms.cityObserveFog.value,version=texture.version;
    observation.render({...options,geometryVersion:2,mist:null});assert.equal(texture.version,version);assert.equal(shader.uniforms.cityObserveActive.value,0);
    observation.render({...options,geometryVersion:2});assert.equal(texture.version,version+1);
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

test('主画面在敌人覆盖前直接合成，无敌人时不复制中转画布，敌人仍在同帧返回',async()=>{
  const previous=globalThis.document;let copies=0,renders=0;
  globalThis.document={createElement:()=>({width:64,height:64,getContext:()=>({clearRect(){},drawImage(){copies++;}})})};
  try{
    const {createCityObservation}=await loadBrowserModule('city-observation.js'),scene=new THREE.Scene(),enemies=new THREE.Group(),effects=new THREE.Group();scene.add(enemies,effects);
    const renderer={domElement:{width:64,height:64},setClearColor(){},render(){renders++;}},observation=createCityObservation(scene,renderer),seen=[];
    const options={geometryVersion:1,mist:null,mistBounds:[0,0,60,60],view:{width:64,height:64,cell:2,panX:0,panY:0,yaw:0,elevation:Math.PI/2},background:'#000',objects:[],enemies,effects,onBaseFrame:image=>{assert.equal(image,renderer.domElement);seen.push(renders);}};
    observation.render({...options,hasEnemies:false});assert.equal(copies,0);assert.equal(renders,1);assert.equal(observation.enemiesFrame(),null);
    observation.render({...options,hasEnemies:true});assert.deepEqual(seen,[1,2]);assert.equal(renders,3);assert.equal(copies,0);assert.equal(observation.enemiesFrame(),renderer.domElement);assert.equal(enemies.visible,false);
  }finally{globalThis.document=previous;}
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

// 同位置/体量的未知对象完全相同，身份与状态不流进几何或材质。
test('3D未知轮廓不透露POI、用途或敌源HP，合批且不参加拾取',async()=>{
  const {createUnknownCity}=await loadBrowserModule('city-unknown.js');
  const layout={width:6,height:6,tiles:Array.from({length:36},(_,i)=>i%6===0?'road':'block')},plot={x:2,y:3,w:3,h:2};
  const a=createUnknownCity(layout,[plot]);assert.equal(a.children.length,2);assert.equal(a.userData.cityNoPick,true);
  for(const extra of [{role:'hospital',special:true},{type:'housing',status:'building',powered:true},{role:'source',hp:999}]){
    const b=createUnknownCity(layout,[{...plot,...extra}]);
    a.children.forEach((mesh,i)=>{assert.deepEqual(mesh.geometry.attributes.position.array,b.children[i].geometry.attributes.position.array);assert.equal(mesh.material.color.getHex(),b.children[i].material.color.getHex());});
    b.traverse(node=>{if(node.isMesh){node.geometry.dispose();node.material.dispose();}});
  }
  a.traverse(node=>{if(node.isMesh){node.geometry.dispose();node.material.dispose();}});
});

test('俯视3D相机与格子信息投影一致，并能切回斜视相机',async()=>{
  const previous=globalThis.document;globalThis.document={createElement:()=>({width:800,height:600,getContext:()=>({clearRect(){},drawImage(){}})})};
  try{
    const {createCityObservation}=await loadBrowserModule('city-observation.js'),{projectView}=await import('../src/city-view.js');
    let renderedCamera;const renderer={domElement:{width:800,height:600},setClearColor(){},render(scene,camera){renderedCamera=camera;scene.updateMatrixWorld(true);}};
    const scene=new THREE.Scene(),effects=new THREE.Group(),enemies=new THREE.Group(),observation=createCityObservation(scene,renderer);
    const top={width:800,height:600,cell:20,panX:50,panY:-90,projection:'orthographic',yaw:0,elevation:Math.PI/2};
    for(const view of [top,{...top,yaw:Math.PI/4,elevation:Math.PI/4},top]){
      observation.render({geometryVersion:1,mist:{},mistBounds:[0,0,60,60],view,background:'#000',objects:[],enemies,hasEnemies:false,effects});
      for(const [x,y,z] of [[3,9,0],[17,21,2],[35,28,.3]]){
        const actual=new THREE.Vector3(x,z,y).project(renderedCamera),expected=projectView(x,y,z,view);
        assert.ok(Math.abs((actual.x+1)*400-expected.x)<1e-8);assert.ok(Math.abs((1-actual.y)*300-expected.y)<1e-8);
      }
    }
    assert.equal(observation.warmupRoot().material.map,null);
  }finally{globalThis.document=previous;}
});


test('品质地标共享原索引几何与PBR贴图，米制缩放不按地块拉伸',async()=>{
  const {createLandmarkModel}=await loadBrowserModule('city-landmark-model.js');
  const geometry=new THREE.BoxGeometry(120,30,140),normalMap=new THREE.Texture(),material=new THREE.MeshStandardMaterial({normalMap,metalness:.3});
  const template=new THREE.Group(),mesh=new THREE.Mesh(geometry,material);mesh.position.y=15;template.add(mesh);
  const object=createLandmarkModel(template,{x:117,y:114,w:6,h:7,cellMeters:20});object.updateMatrixWorld(true);
  const size=new THREE.Box3().setFromObject(object).getSize(new THREE.Vector3());assert.deepEqual(size.toArray(),[6,1.5,7]);
  const clone=object.children[0].children[0];assert.strictEqual(clone.geometry,geometry);assert.notStrictEqual(clone.material,material);assert.strictEqual(clone.material.normalMap,normalMap);assert.equal(clone.material.metalness,.3);
  assert.ok(geometry.index);assert.deepEqual(new THREE.Box3().setFromObject(object).getCenter(new THREE.Vector3()).toArray(),[120,.75,117.5]);
});

test('废墟合批保留世界几何、颜色和原地块屋顶拾取，数组共享且重复合批不重复染色',async()=>{
  const {batchStaticPlots}=await loadBrowserModule('city-static-batch.js');
  const make=(x,color)=>{const root=new THREE.Group(),material=new THREE.MeshStandardMaterial({color,roughness:.95}),mesh=new THREE.Mesh(new THREE.BoxGeometry(2,4,3).toNonIndexed(),material);mesh.castShadow=mesh.receiveShadow=true;root.position.set(x,2,10);root.add(mesh);root.updateMatrixWorld(true);return root;};
  const a=make(20,'#a5b698'),b=make(24,'#b3a784'),bounds=new THREE.Box3().setFromObject(a),color=a.children[0].material.color.clone(),ray=new THREE.Raycaster(new THREE.Vector3(20,30,10),new THREE.Vector3(0,-1,0));
  const first=batchStaticPlots([a,b]);assert.equal(first.children.length,1);assert.equal(first.children[0].geometry.attributes.position.count,72);assert.equal(first.children[0].castShadow,true);
  assert.ok(new THREE.Box3().setFromObject(a).equals(bounds));assert.equal(ray.intersectObject(a,true)[0].point.y,4);
  const source=a.children[0].geometry,merged=first.children[0].geometry;
  assert.equal(source.attributes.position.array.buffer,merged.attributes.position.array.buffer);assert.deepEqual([...merged.attributes.color.array.slice(0,3)],[...new Float32Array([color.r,color.g,color.b])]);
  const before=[...source.attributes.position.array],colors=[...source.attributes.color.array],second=batchStaticPlots([a]);
  assert.deepEqual([...source.attributes.position.array],before);assert.deepEqual([...source.attributes.color.array],colors);assert.equal(ray.intersectObject(a,true)[0].point.y,4);
  assert.equal(second.children[0].geometry.attributes.position.count,36);assert.equal(first.userData.citySharedTextures,true);
});

test('同源铺装合批保留各楼重复纹理尺度，退出合批后原网格仍保持相同UV',async()=>{
  const {batchStaticPlots}=await loadBrowserModule('city-static-batch.js'),image={width:128,height:128};
  const make=repeat=>{const root=new THREE.Group(),map=new THREE.Texture(image);map.wrapS=map.wrapT=THREE.RepeatWrapping;map.repeat.set(repeat,repeat+1);const mesh=new THREE.Mesh(new THREE.PlaneGeometry(2,2).toNonIndexed(),new THREE.MeshStandardMaterial({map}));root.add(mesh);return root;};
  const a=make(3),b=make(5),root=batchStaticPlots([a,b]);assert.equal(root.children.length,1);
  assert.equal(root.children[0].material.map.repeat.x,1);assert.equal(a.children[0].material.map.repeat.x,1);
  assert.equal(Math.max(...a.children[0].geometry.attributes.uv.array),4);assert.equal(Math.max(...b.children[0].geometry.attributes.uv.array),6);
  const uv=[...b.children[0].geometry.attributes.uv.array];batchStaticPlots([b]);assert.deepEqual([...b.children[0].geometry.attributes.uv.array],uv);
});

test('重复废墟共享索引几何，保留完整三角面、米制变换、屋顶拾取和贴图/纯色差异',async()=>{
  const {ruinInstanceTemplates,createRuinInstances}=await loadBrowserModule('city-ruin-instances.js'),template=new THREE.Group(),geometry=new THREE.BoxGeometry(2,4,3),map=new THREE.Texture({width:16,height:16});
  const colored=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({color:'#997755'})),textured=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({map,side:THREE.DoubleSide}));textured.position.x=4;template.add(colored,textured);
  const parts=ruinInstanceTemplates(template,object=>object.traverse(node=>{if(node.material?.map)node.material.color.set('#a29c87');}));assert.equal(parts.length,2);assert.ok(parts.every(p=>p.geometry.index));assert.equal(template.children[0].geometry,geometry);
  const matrix=new THREE.Matrix4().makeTranslation(20,1,30).multiply(new THREE.Matrix4().makeScale(.5,.5,.5)),slots=[{parts,matrix,tint:'#e5ece8'}],source=createRuinInstances(slots),batch=createRuinInstances([...slots,{...slots[0],matrix:new THREE.Matrix4().makeTranslation(30,1,30)}],true);source.updateMatrixWorld(true);
  assert.equal(source.children[0].geometry,batch.children[0].geometry);assert.equal(batch.children[0].count,2);assert.equal(batch.children[0].userData.cityBatchMesh,true);
  assert.deepEqual(new THREE.Box3().setFromObject(source).getSize(new THREE.Vector3()).toArray(),[3,2,1.5]);
  assert.equal(new THREE.Raycaster(new THREE.Vector3(20,10,30),new THREE.Vector3(0,-1,0)).intersectObject(source,true)[0].point.y,2);
  const mapped=source.children.find(m=>m.material.map);assert.equal(mapped.material.map,map);assert.equal(mapped.material.side,THREE.DoubleSide);assert.deepEqual([...mapped.instanceColor.array],[1,1,1]);
  assert.equal(parts.reduce((n,p)=>n+p.geometry.index.count/3,0),24);
});

test('精确索引逐三角面保留全部属性与顺序，不合并硬法线或不同UV',async()=>{
  const {indexExactGeometry}=await loadBrowserModule('city-ruin-instances.js'),geometry=new THREE.BoxGeometry(2,3,4).toNonIndexed(),before=geometry.clone();indexExactGeometry(geometry);
  assert.equal(geometry.index.count,36);assert.equal(geometry.attributes.position.count,24);
  for(const [name,attribute] of Object.entries(before.attributes))for(let i=0;i<attribute.count;i++)for(let c=0;c<attribute.itemSize;c++)assert.equal(geometry.attributes[name].getComponent(geometry.index.getX(i),c),attribute.getComponent(i,c));
});

test('燃烧车实例保持车身染色、焦痕、碎片和四层轻烟的原世界变换，增减数量不留残影',async()=>{
  const previous=globalThis.document;globalThis.document={createElement:()=>({getContext:()=>({createRadialGradient:()=>({addColorStop(){}}),fillRect(){}})})};
  try{
    const {createWreckInstances,createWreckDressing,updateWreckDressing,styleWreckBody}=await loadBrowserModule('city-wrecks.js'),template=new THREE.Group(),material=new THREE.MeshStandardMaterial({color:'#59615b'});material.name='#59615b';template.add(new THREE.Mesh(new THREE.BoxGeometry(.48,.4,.95),material));
    const root=new THREE.Group(),renderer=createWreckInstances(root,()=>template),item={id:'a',asset:'wreck',x:20,y:30,w:.12,h:.23,angle:.7,color:'#688d9b'},time=2.1;
    assert.equal(renderer.update([item],time,1,false),true);const meshes=root.children[0].children;assert.equal(meshes.length,9);assert.ok(meshes.every(m=>m.count===1));
    const old=new THREE.Group();old.position.set(item.x,0,item.y);old.rotation.y=item.angle;const dressing=createWreckDressing(old,item.w,item.h);updateWreckDressing(dressing,time,1,false);old.updateMatrixWorld(true);
    for(let k=0;k<4;k++){const actual=new THREE.Matrix4();meshes[5+k].getMatrixAt(0,actual);const expected=dressing.smoke[k].matrixWorld;actual.elements.forEach((v,i)=>assert.ok(Math.abs(v-expected.elements[i])<1e-6));assert.equal(meshes[5+k].material.opacity,dressing.smoke[k].material.opacity);}
    const styled=template.clone(true);styled.children[0].material=material.clone();styleWreckBody(styled,item.color);const paint=new THREE.Color();meshes[0].getColorAt(0,paint);for(const key of ['r','g','b'])assert.ok(Math.abs(paint[key]-styled.children[0].material.color[key])<1e-7);
    assert.equal(renderer.update([],time,1,false),false);assert.ok(meshes.every(m=>m.count===0));renderer.update([item],time,0,true);assert.ok(meshes.every(m=>m.count===1));
  }finally{globalThis.document=previous;}
});
