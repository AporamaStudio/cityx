import {civilianPoses} from './civilization-visuals.js?v=1';
import {landmarkById} from './city-landmarks.js?v=1';
import {createLandmarkModel,createRailwayModel} from './city-landmark-model.js?v=126';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {addBuildingFoundation,buildingVariation} from './city-building-style.js?v=1';
import {operatingLights} from './city-building-lights.js?v=1';
import {createWreckDressing,updateWreckDressing,styleWreckBody,styleVehicleBody,createWreckInstances} from './city-wrecks.js?v=3';
import {createUnknownCity} from './city-unknown.js?v=2';
import {createRoadModel} from './city-road-model.js?v=126';
import {createNaturalModel} from './city-natural-model.js?v=126';
import {createSurroundingModel} from './city-surrounding-model.js?v=126';
import {updateWater} from './city-water.js?v=3';
import {naturalGroundAt} from './natural-terrain.js?v=7';
import {PLANT_MODELS} from './city-vegetation.js?v=2';
import {groundGlow} from './model-preview-effects.js?v=4';
import {createCityEffects,facilityMotion,animateFacility} from './city-effects.js?v=15';
import {createCityObservation,freezeCityTransforms} from './city-observation.js?v=28';
import {createNightShaderWarmup} from './city-shader-warmup.js?v=3';
import {createShaderSamples,cloneWarmupMaterial} from './city-shader-samples.js?v=2';
import {createShotVFX,createImpactVFX} from './cannon-vfx.js?v=1';
import {createZombieCrowds} from './city-enemies.js?v=8';
import {constructionAppearance,constructionMaskTexture,bindConstructionMask,setConstructionMask} from './city-construction-preview.js?v=2';
import {createUpgradePreview} from './city-upgrade-preview.js?v=2';
import {spatialChunks} from './city-spatial-cache.js?v=1';
import {batchStaticPlots} from './city-static-batch.js?v=4';
import {cityCasterPadding,cityShadowVolume} from './city-view.js?v=8';
import {createCityPointGrid} from './city-point-grid.js?v=2';
import {ruinInstanceTemplates,createRuinInstances} from './city-ruin-instances.js?v=2';

// 城市只读取显示描述；格子命中、权限、寻路和结算继续由原游戏负责。
const files={home:'kenney/suburban/building-type-a',small:'kenney/suburban/building-type-h',wide:'kenney/suburban/building-type-u',factory:'kenney/industrial/building-a',workshop:'kenney/industrial/building-f',hospital:'generated/hospital',hospitalRuined:'generated/hospital-ruined',bank:'generated/bank',bankRuined:'generated/bank-ruined',near:'generated/cannon-near',far:'generated/cannon-long',watch:'generated/watchtower',wall:'generated/brick-wall',camp:'generated/campfire',plaza:'generated/camp-plaza',source:'generated/enemy-source',sourceRuined:'generated/enemy-source-ruined',street:'generated/streetlight',wreck:'generated/burnt-car',trash:'generated/trash',rubble:'generated/rubble',bench:'generated/street-bench',planter:'generated/street-planter',car:'generated/civil-car',damagedCar:'generated/damaged-car'};
for(const name of ['farmland','wheatfield','wheatfield-abandoned','wheatfield-burnt','barn','barn-abandoned','hay-bale'])files[name]='generated/'+name;
for(const [name,file] of Object.entries(PLANT_MODELS))files[name]='generated/'+file;
for(const name of ['home','small','wide','factory','workshop'])files[name+'Ruined']=files[name]+'-ruined';
const resource=file=>new URL('../assets/model-preview/'+file+'.glb?v=5',import.meta.url).href;

function ruinAppearance(object){
  // 几何使用固定配套GLB；运行时只灰化原贴图，保留暗内层与碎块本身的材质。
  object.traverse(node=>{if(!node.isMesh||!node.material.map)return;node.material.color.set('#a29c87');node.material.roughness=1;
    node.material.onBeforeCompile=shader=>{shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>','#include <map_fragment>\ndiffuseColor.rgb=mix(diffuseColor.rgb,vec3(dot(diffuseColor.rgb,vec3(.2126,.7152,.0722))),.82);');};
    node.material.customProgramCacheKey=()=> 'cityx-game-ruin';
  });
}

// 同一地块重复模型按材质合并，减少绘制次数；控制、修缮和炮位仍只对应原建筑对象。
function mergePlot(object,keepShadows=false){
  object.updateMatrixWorld(true);const inverse=object.matrixWorld.clone().invert(),groups=new Map(),materials=new Set();
  object.traverse(node=>{if(!node.isMesh)return;
    const material=node.material,key=[material.map?.uuid??'',material.color.getHex(),material.roughness,keepShadows?`${node.castShadow}:${node.receiveShadow}`:'',Object.keys(node.geometry.attributes).sort().join(',')].join(':');
    if(!groups.has(key))groups.set(key,{material,castShadow:keepShadows?node.castShadow:true,receiveShadow:keepShadows?node.receiveShadow:true,geometries:[]});materials.add(material);
    const geometry=node.geometry.index?node.geometry.toNonIndexed():node.geometry.clone();geometry.applyMatrix4(inverse.clone().multiply(node.matrixWorld));groups.get(key).geometries.push(geometry);
    if(node.userData.ownGeometry)node.geometry.dispose();
  });
  object.clear();const retained=new Set();
  for(const {material,castShadow,receiveShadow,geometries} of groups.values()){
    const geometry=mergeGeometries(geometries);for(const source of geometries)source.dispose();
    const mesh=new THREE.Mesh(geometry,material);mesh.castShadow=castShadow;mesh.receiveShadow=receiveShadow;mesh.userData.ownGeometry=true;object.add(mesh);retained.add(material);
  }
  for(const material of materials)if(!retained.has(material))material.dispose();
}

function connectedWall(template,item){
  const object=new THREE.Group(),bounds=new THREE.Box3().setFromObject(template),size=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3()),thickness=.6/item.cellMeters,height=2.5/item.cellMeters;
  for(const [bit,dx,dz] of [[1,0,-1],[2,1,0],[4,0,1],[8,-1,0]])if(item.connections&bit){
    const segment=new THREE.Group(),model=template.clone(true);model.scale.set((item.dead?.3:.5)/size.x,height/size.y,thickness/size.z);model.position.set(-center.x*model.scale.x,-bounds.min.y*model.scale.y,-center.z*model.scale.z);
    segment.add(model);segment.position.set(dx*(item.dead?.35:.25),0,dz*(item.dead?.35:.25));segment.rotation.y=-Math.atan2(dz,dx);object.add(segment);
  }
  if(!item.dead){const joint=new THREE.Mesh(new THREE.BoxGeometry(thickness,height,thickness),new THREE.MeshStandardMaterial({color:'#a79f89',roughness:1}));joint.position.y=height*.5;joint.userData.ownGeometry=true;object.add(joint);}
  else for(let i=0;i<6;i++){const rubble=new THREE.Mesh(new THREE.BoxGeometry(.7/item.cellMeters,.45/item.cellMeters,.5/item.cellMeters),new THREE.MeshStandardMaterial({color:'#9d9380',roughness:1}));rubble.position.set((i%3-1)*1.1/item.cellMeters,.2/item.cellMeters,(Math.floor(i/3)-.5)*1.2/item.cellMeters);rubble.rotation.y=i*.63;rubble.userData.ownGeometry=true;object.add(rubble);}
  return object;
}

export function createCity3D({onReady,onProgress,onError}){
  let renderer;
  try{renderer=new THREE.WebGLRenderer({alpha:true,antialias:true,preserveDrawingBuffer:true});}
  catch(error){queueMicrotask(()=>onError(error));return null;}
  renderer.domElement.addEventListener('webglcontextlost',event=>{event.preventDefault();ready=false;onError(new Error('WebGL上下文丢失'));});
  renderer.setPixelRatio(Math.min(devicePixelRatio,2));
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.shadowMap.autoUpdate=false;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.05;
  renderer.setClearColor('#000000',0);
  const scene=new THREE.Scene();
  const sky=new THREE.HemisphereLight('#f4f6e2','#809180',2.4),sun=new THREE.DirectionalLight('#fff1cd',3.2);
  sun.position.set(-30,60,20);sun.target.position.set(30,0,30);scene.add(sky,sun,sun.target);
  sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-64,right:64,top:64,bottom:-64,near:1,far:180});sun.shadow.bias=-.00025;sun.shadow.normalBias=.03;
  const buildings=new THREE.Group(),facilities=new THREE.Group(),enemies=new THREE.Group();scene.add(buildings,facilities,enemies);
  const vegetation=new THREE.Group(),plantEntries=new Map(),plantBatches=new Map();facilities.add(vegetation);let plantKey='';
  const streets=new THREE.Group(),streetEntries=new Map();scene.add(streets);let streetKey='',lastShadow='',streetLights=[],streetMaterials=[],streetChunks=new Map(),streetInputs=[];
  let roads=new THREE.Group(),roadKey='';scene.add(roads);
  let railway=new THREE.Group();scene.add(railway);
  let nature=new THREE.Group(),natureLayout=null,natureMeters=0,natureKey='';scene.add(nature);
  let exterior=new THREE.Group();scene.add(exterior);
  // 米制生活人物复用三组合批几何，仅渲染已接通且在镜头附近的院落活动。
  let residentCapacity=0,residentMeshes=[];const residentMatrix=new THREE.Object3D();
  function updateResidents(plots,fx,view,meters,night){
    const poses=civilianPoses(plots,{time:fx.reducedMotion?0:fx.time,night,perPlot:fx.upgradeStyle.civilianFiguresPerBuilding,cellMeters:meters,view});
    if(poses.length>residentCapacity){
      for(const m of residentMeshes){streets.remove(m);m.geometry.dispose();m.material.dispose();}
      residentCapacity=2**Math.ceil(Math.log2(Math.max(1,poses.length)));
      residentMeshes=[new THREE.InstancedMesh(new THREE.BoxGeometry(.48,.72,.3),new THREE.MeshStandardMaterial({color:'#4f7772',roughness:1}),residentCapacity),new THREE.InstancedMesh(new THREE.SphereGeometry(.14,6,5),new THREE.MeshStandardMaterial({color:'#c99d78',roughness:1}),residentCapacity),new THREE.InstancedMesh(new THREE.BoxGeometry(.14,.72,.16),new THREE.MeshStandardMaterial({color:'#4d514c',roughness:1}),residentCapacity*2)];
      for(const m of residentMeshes){m.frustumCulled=false;streets.add(m);}
    }
    residentMeshes.forEach((m,index)=>{m.count=poses.length*(index===2?2:1);});
    poses.forEach((p,i)=>{
      const put=(mesh,index,x,h,z)=>{residentMatrix.position.set(x,p.ground+h/meters,z);residentMatrix.scale.setScalar(1/meters);residentMatrix.updateMatrix();mesh.setMatrixAt(index,residentMatrix.matrix);};
      put(residentMeshes[0],i,p.x,1.13,p.y);put(residentMeshes[1],i,p.x,1.65,p.y);
      put(residentMeshes[2],i*2,p.x-.12/meters,.38+p.step*meters,p.y);put(residentMeshes[2],i*2+1,p.x+.12/meters,.38-p.step*meters,p.y);
    });
    for(const m of residentMeshes)m.instanceMatrix.needsUpdate=true;
  }
  const localLights=[];
  const effects=createCityEffects(scene);
  const pointGrid=createCityPointGrid();
  const upgradeEffects=createUpgradePreview(effects.group);
  let unknown=new THREE.Group(),unknownKey='';scene.add(unknown);
  const landmarkLoads=new Map();let visibleLandmarksPending=false;
  const models=new Map(),entries=new Map(),props=new Map(),loader=new GLTFLoader();let ready=false,lastFrame='',lastProps='',pixels='',geometryVersion=0;
  const wreckInstances=createWreckInstances(facilities,()=>models.get('wreck'));
  let plotInput=null,plantInput=null,plantPlots=new Map(),plantSignature='',unknownInput=null,roadInput=null;
  const buildingBatches=new Map();let facilityViewport=null,ruinBatchEnabled=true,gridEnabled=true;
  let constructionEntry=null,constructionBase=null,constructionKey='';
  // 模板只读；按原模型与旋转复用实际包围盒，不改变米制缩放或楼体选型。
  const modelMeasures=new Map();let streetLightOffset=null;
  const ruinTemplates=new Map();
  function ruinParts(name){if(!ruinTemplates.has(name))ruinTemplates.set(name,ruinInstanceTemplates(models.get(name),ruinAppearance));return ruinTemplates.get(name);}
  function measureModel(name,rotation=0){
    const key=name+':'+rotation;
    if(!modelMeasures.has(key)){
      const object=rotation?models.get(name).clone(true):models.get(name);if(rotation){object.rotation.y=rotation;object.updateMatrixWorld(true);}
      const bounds=new THREE.Box3().setFromObject(object);modelMeasures.set(key,{bounds,size:bounds.getSize(new THREE.Vector3()),center:bounds.getCenter(new THREE.Vector3())});
    }
    return modelMeasures.get(key);
  }
  const zombieCrowds=createZombieCrowds(enemies);
  const observation=createCityObservation(scene,renderer,pointGrid);
  let initialPrepared=false;
  const shaderSamples=createShaderSamples();
  const shaderWarmup=createNightShaderWarmup(renderer,scene,{prepare:shaderSamples.prepare,enabled:()=>ready,onReady:()=>{if(!initialPrepared){initialPrepared=true;onReady();}},onError:error=>{if(!initialPrepared)onError(error);else console.warn('夜景材质准备未完成。',error);}});
  const warmupRoot=new THREE.Group(),examples=new THREE.Group();let examplesReady=false;
  function prepareExamples(){
    if(examplesReady)return;examplesReady=true;
    // 复用真实楼体构造；只保留少量材质样本，不创建运营灯、不触发探索或建设。
    for(const type of ['housing','production','hospital','bank'])for(const status of ['building','ruin']){
      const object=build({id:-100,x:0,y:0,w:3,h:3,type,status,cellMeters:20},true).object;examples.add(object);
      const masked=object.clone(true);masked.traverse(node=>{if(node.material)node.material=cloneWarmupMaterial(node.material);});bindConstructionMask(masked,false);examples.add(masked);
    }
    const plan=build({id:-101,x:0,y:0,w:3,h:3,type:'housing',status:'building',cellMeters:20},true).object;constructionAppearance(plan);examples.add(plan);
    for(const name of ['near','far','watch','wall'])for(const transparent of [false,true]){
      const object=models.get(name).clone(true);object.traverse(node=>{if(node.material){node.material=node.material.clone();node.material.transparent=transparent;node.material.opacity=transparent?.45:1;}});examples.add(object);
    }
    createShotVFX(examples,'A');createShotVFX(examples,'B');createImpactVFX(examples);
    observation.prepareMaterials(examples);
  }
  function warmNight(camera){
    prepareExamples();
    // 当前楼体与预览共用同一组结构特征；独立副本分批准备昼夜，不改真实父节点。
    warmupRoot.children=[railway,exterior,nature,buildings,facilities,streets,roads,unknown,enemies,examples,effects.group,observation.warmupRoot()];
    const lights=[...localLights,...effects.nightLights()];
    shaderWarmup.request(`${geometryVersion}:${localLights.length}:${effects.nightLightSignature()}:${gridEnabled}`,warmupRoot,camera,lights);
  }
  let loaded=0;
  Promise.all(Object.entries(files).map(async ([name,file])=>{
    models.set(name,(await loader.loadAsync(resource(file))).scene);onProgress(++loaded,Object.keys(files).length);
  })).then(()=>{ready=true;onReady();}).catch(error=>{ready=false;onError(error);});
  function release(entry){
    geometryVersion++;entry.object.removeFromParent();shaderWarmup.release(()=>{const maps=new Set(entry.object.userData.cityBatchTextures??[]);entry.object.traverse(node=>{if(node.isMesh){if(!entry.object.userData.citySharedTextures&&node.material.map?.userData.cityOwned)maps.add(node.material.map);node.material.dispose();if(node.isInstancedMesh)node.dispose();if(node.userData.ownGeometry)node.geometry.dispose();}});for(const map of maps)map.dispose();});
  }
  function build(plot,sample=false){
    if(!sample)geometryVersion++;
    if(landmarkById(plot.type)){
      const object=createLandmarkModel(models.get(plot.type),plot);if(!sample)buildings.add(object);freezeCityTransforms(object);
      return {object,powerNodes:[],signature:`${plot.type}:${plot.status}:${plot.w}:${plot.h}:${plot.cellMeters}`,roof:new THREE.Box3().setFromObject(object).max.y};
    }
    const {id,x,y,w,h,type,status,cellMeters}=plot,landmark=['hospital','bank'].includes(type);
    const pool=type==='housing'?['small','home','wide']:['factory','workshop'];
    const object=new THREE.Group(),housing=type==='housing',columns=landmark?1:housing?Math.min(w,4):Math.ceil(w/2),rows=landmark?1:housing?Math.min(h,3):Math.ceil(h/2),slotW=w/columns,slotH=h/rows;
    const instancedRuin=status==='ruin'&&!landmark&&!sample&&ruinBatchEnabled,ruinSlots=[],foundation=instancedRuin?new THREE.Group():object;if(instancedRuin)object.add(foundation);
    const podium=landmark?0:(housing?2.5:1.5)/cellMeters;
    if(podium){addBuildingFoundation(foundation,{w,h,height:podium,cellMeters,housing,ruined:status==='ruin'});object.userData.podiumHeight=podium;}
    for(let row=0;row<rows;row++)for(let column=0;column<columns;column++){
      let name=landmark?(status==='ruin'?type+'Ruined':type):'',rotation=0,best=Infinity;
      if(!landmark)for(const candidate of pool){
        const {size}=measureModel(candidate);
        for(const turn of [0,1]){const ratio=turn?size.z/size.x:size.x/size.z,score=Math.abs(Math.log(slotW/slotH/ratio))+((id+column+row)%3===pool.indexOf(candidate)?0:.20);if(score<best){best=score;name=candidate;rotation=turn*Math.PI/2;}}
      }
      const variation=buildingVariation(id,column,row);if(!landmark)rotation+=variation.turn;
      const model=instancedRuin?new THREE.Object3D():models.get(!landmark&&status==='ruin'?name+'Ruined':name).clone(true);model.rotation.y=rotation;model.updateMatrixWorld(true);
      model.traverse(node=>{if(node.isMesh){node.material=node.material.clone();if(!landmark)node.material.color.multiply(new THREE.Color(variation.tint));node.material.roughness=.95;node.castShadow=true;node.receiveShadow=true;}});
      const {bounds,size,center}=measureModel(name,rotation);
      const scale=landmark?Math.min((w-.16)/size.x,(h-.16)/size.z):Math.min(slotW*.86/size.x,slotH*.86/size.z,(housing?12:22)/cellMeters/size.y)*variation.scale;
      model.scale.setScalar(scale);if(landmark)model.scale.y=1/cellMeters;model.position.set(-w/2+(column+.5)*slotW-center.x*scale,podium-bounds.min.y*model.scale.y,-h/2+(row+.5)*slotH-center.z*scale);
      if(instancedRuin){model.updateMatrix();ruinSlots.push({parts:ruinParts(name+'Ruined'),matrix:model.matrix.clone(),tint:variation.tint});}else object.add(model);
    }
    object.position.set(x+w/2,0,y+h/2);if(!sample)buildings.add(object);
    if(instancedRuin){mergePlot(foundation);object.add(createRuinInstances(ruinSlots));}else if(!landmark)mergePlot(object);
    if(status==='ruin'&&!landmark)ruinAppearance(object);
    if(status==='building')operatingLights(object);
    freezeCityTransforms(object);const powerNodes=[];object.traverse(node=>{if(node.material?.userData.cityPower)powerNodes.push(node);});
    return {object,powerNodes,ruinSlots,foundation:instancedRuin?foundation:null,signature:`${type}:${status}:${w}:${h}:${cellMeters}`,roof:new THREE.Box3().setFromObject(object).max.y};
  }
  return {
    // 重开/重试释放本局保留的峰值槽位；下一帧按真实设施重新分配。
    resetLighting(){shaderWarmup.reset();shaderWarmup.release(()=>shaderSamples.reset());effects.resetLights();pointGrid.reset();for(const light of localLights){light.removeFromParent();light.dispose();}localLights.length=0;},
    beginStats(){renderer.info.autoReset=false;renderer.info.reset();},
    renderStats(){const stats={...renderer.info.render,...zombieCrowds.stats(),...pointGrid.stats(),streetLights:localLights.length,...effects.lightStats(),programs:renderer.info.programs.length};renderer.info.autoReset=true;return stats;},
    // 仅诊断时采样CPU几何数组；共享视图只计底层缓冲一次，不冒充浏览器/GPU总内存。
    resourceStats(){
      const buffers=new Set(),geometries=new Set();let meshes=0;
      const add=attribute=>{const array=attribute?.array??attribute?.data?.array;if(array)buffers.add(array.buffer);};
      const visit=root=>root.traverse(node=>{if(!node.isMesh)return;meshes++;const geometry=node.geometry;if(!geometries.has(geometry)){geometries.add(geometry);Object.values(geometry.attributes).forEach(add);add(geometry.index);}add(node.instanceMatrix);add(node.instanceColor);});
      visit(scene);for(const model of models.values())visit(model);
      const gl=renderer.getContext(),debug=gl.getExtension('WEBGL_debug_renderer_info');
      return {cpuGeometryBytes:[...buffers].reduce((sum,buffer)=>sum+buffer.byteLength,0),geometryObjects:geometries.size,meshObjects:meshes,gpuGeometries:renderer.info.memory.geometries,gpuTextures:renderer.info.memory.textures,renderer:gl.getParameter(debug?.UNMASKED_RENDERER_WEBGL??gl.RENDERER),pixelRatio:renderer.getPixelRatio(),renderWidth:renderer.domElement.width,renderHeight:renderer.domElement.height,maxTextureSize:renderer.capabilities.maxTextureSize};
    },
    isReady(){return ready;},
    isPrepared(){return initialPrepared&&!visibleLandmarksPending;},
    observationPick(x,y,width,height,view){return ready?observation.pick(x,y,width,height,view):null;},
    observationFrame(options){if(!ready)return null;const image=observation.render({...options,objects:[railway,exterior,nature,unknown,buildings,facilities,streets,roads],enemies,hasEnemies:zombieCrowds.stats().figures>0,geometryVersion,effects:effects.group});warmNight(observation.warmupCamera());return image;},
    observationEnemiesFrame(){return ready?observation.enemiesFrame():null;},
    facilityTopAt(id){const entry=props.get(id);return entry?entry.object.position.y+entry.height*entry.object.scale.y:0;},
    baseAt(id){return entries.get(id)?.object.userData.podiumHeight??0;},
    roofAt(id,x,y){
      const entry=entries.get(id);if(!entry)return 0;
      // 楼体不变时屋顶采样不随镜头改变，复用射线结果以支持多个可建炮位标记。
      entry.roofSamples??=new Map();const sample=x+':'+y;if(entry.roofSamples.has(sample))return entry.roofSamples.get(sample);
      entry.object.updateMatrixWorld(true);const ray=new THREE.Raycaster(new THREE.Vector3(x,entry.roof+1,y),new THREE.Vector3(0,-1,0));
      const height=ray.intersectObject(entry.object,true)[0]?.point.y??entry.roof;entry.roofSamples.set(sample,height);return height;
    },
    render(plots,{width,height,panX,panY,cell,cellMeters,lightBudget=24,lightViewport,ruinBatch=true,pointGridEnabled=true,worldShadow=true,night,layout,lamps=[],dressing=[],plants=[],plantPreview=null,constructionPreview=null,naturalOccupied=[],roadCells=[],unknownPlots=[],fx}){
      if(!ready)return null;
      updateResidents(plots,fx,lightViewport,cellMeters,night);
      // 只在切换实验路径时重建实际楼体；跨帧不能让两套几何重叠或拾取旧对象。
      if(ruinBatchEnabled!==ruinBatch){
        for(const entry of entries.values())release(entry);entries.clear();
        for(const batch of buildingBatches.values())release(batch);buildingBatches.clear();
        if(constructionEntry){release(constructionEntry);constructionEntry.texture.dispose();constructionEntry=null;}
        constructionBase=null;constructionKey='';plotInput=null;ruinBatchEnabled=ruinBatch;
      }
      gridEnabled=pointGridEnabled;
      const geographyChanged=natureLayout!==layout||natureMeters!==cellMeters;
      facilityViewport=lightViewport;
      if(natureLayout!==layout)effects.resetLights();
      // 只读实际设施占格；道路上的墙/塔不重建林地，悬停预览不触发整片几何更新。
      const clearCells=naturalOccupied.filter(id=>layout.tiles[id]==='open'&&layout.natural?.regions.some(r=>id%layout.width>=r.x&&id%layout.width<r.x+r.w&&Math.floor(id/layout.width)>=r.y&&Math.floor(id/layout.width)<r.y+r.h)).sort((a,b)=>a-b),nextNature=clearCells.join(',');
      if(geographyChanged||natureKey!==nextNature){release({object:nature});nature=createNaturalModel(layout,cellMeters,models,new Set(clearCells));scene.add(nature);freezeCityTransforms(nature);natureKey=nextNature;}
      if(geographyChanged){release({object:railway});railway=createRailwayModel(layout,cellMeters);scene.add(railway);freezeCityTransforms(railway);release({object:exterior});exterior=createSurroundingModel(layout,models,cellMeters);scene.add(exterior);freezeCityTransforms(exterior);natureLayout=layout;natureMeters=cellMeters;}
      // 远景融合发生在输出色域转换后，雾色也用sRGB，避免地平线形成暗色矩形边缘。
      exterior.userData.haze?.value.set(fx.hazeColor).convertLinearToSRGB();
      updateWater(nature,fx.time,night,fx.reducedMotion);updateWater(exterior,fx.time,night,fx.reducedMotion);
      if(plotInput!==plots){
        const active=new Set(plots.map(p=>p.id));
        for(const [id,entry] of entries)if(!active.has(id)){release(entry);entries.delete(id);}
        plotInput=plots;
      }
      // 只构造镜头附近会贡献画面/阴影的细节；已访问楼体保留到其状态真正消失。
      const intersects=(p,padding=16)=>!lightViewport||p.x+p.w>=lightViewport.left-padding&&p.x<=lightViewport.right+padding&&p.y+p.h>=lightViewport.top-padding&&p.y<=lightViewport.bottom+padding;
      const plotPadding=p=>cityCasterPadding(fx.view,entries.get(p.id)?.roof??(['housing','production'].includes(p.type)?24/cellMeters:8));
      for(const plot of plots)if(entries.has(plot.id))entries.get(plot.id).object.visible=intersects(plot,plotPadding(plot));
      plots=plots.filter(p=>intersects(p,plotPadding(p)));
      visibleLandmarksPending=false;
      for(const plot of plots){
        const landmark=landmarkById(plot.type);
        if(landmark&&!models.has(plot.type)){
          visibleLandmarksPending=true;
          if(!landmarkLoads.has(plot.type))landmarkLoads.set(plot.type,loader.loadAsync(resource(landmark.file)).then(gltf=>{models.set(plot.type,gltf.scene);onReady();}).catch(onError));
          continue;
        }
        const signature=`${plot.type}:${plot.status}:${plot.w}:${plot.h}:${plot.cellMeters}`;
        if(entries.get(plot.id)?.signature!==signature){if(entries.has(plot.id))release(entries.get(plot.id));entries.set(plot.id,build(plot));}
        const entry=entries.get(plot.id);
        if(entry.powered!==plot.powered||entry.night!==night){
          for(const node of entry.powerNodes)node.material.userData.cityPower.value=plot.powered?night:0;
          entry.powered=plot.powered;entry.night=night;
        }
      }
      plots=plots.filter(p=>entries.has(p.id));
      const batchPlots=new Map();
      for(const plot of plots){
        const entry=entries.get(plot.id),staticRuin=ruinBatchEnabled&&plot.status==='ruin'&&['housing','production'].includes(plot.type)&&plot.id!==constructionPreview?.id;
        if(!staticRuin){entry.object.visible=true;continue;}
        entry.object.visible=false;
        const x=Math.floor(plot.x/32)*32,y=Math.floor(plot.y/32)*32,id=x+':'+y;
        if(!batchPlots.has(id))batchPlots.set(id,{x,y,w:32,h:32,plots:[]});batchPlots.get(id).plots.push(plot);
      }
      // 块成员必须来自完整描述，镜头只开关可见性；不能随旋转拆散已有合批。
      const allBatchPlots=new Map();
      for(const plot of plotInput)if(ruinBatchEnabled&&plot.status==='ruin'&&['housing','production'].includes(plot.type)&&plot.id!==constructionPreview?.id&&entries.has(plot.id)){
        const id=Math.floor(plot.x/32)*32+':'+Math.floor(plot.y/32)*32;
        if(!allBatchPlots.has(id))allBatchPlots.set(id,[]);allBatchPlots.get(id).push(plot);
      }
      for(const [id,batch] of buildingBatches){batch.object.visible=batchPlots.has(id);if(!allBatchPlots.has(id)){release(batch);buildingBatches.delete(id);}}
      for(const [id,chunk] of batchPlots){
        const members=allBatchPlots.get(id),signature=members.map(p=>p.id+':'+entries.get(p.id).signature).join('|'),previous=buildingBatches.get(id);
        if(previous?.signature===signature)continue;
        const sourceEntries=members.map(p=>entries.get(p.id)),object=batchStaticPlots(sourceEntries.map(entry=>entry.foundation));
        const slots=sourceEntries.flatMap(entry=>entry.ruinSlots.map(slot=>({...slot,matrix:entry.object.matrixWorld.clone().multiply(slot.matrix)})));object.add(createRuinInstances(slots,true));
        if(previous)release(previous);buildings.add(object);freezeCityTransforms(object);geometryVersion++;buildingBatches.set(id,{object,signature});
      }
      // 仅目标/用途/新增格变化时准备一份方案；同栋移动、缩放与云雾帧复用模型。
      const plan=constructionPreview,nextConstruction=plan?`${plan.id}:${plan.type}:${plan.w}:${plan.h}:${plan.cellMeters}:${plan.cells.join(',')}`:'';
      if(constructionBase){setConstructionMask(constructionBase.planMask,null);constructionBase=null;}
      if(plan){
        if(constructionKey!==nextConstruction){
          if(constructionEntry){release(constructionEntry);constructionEntry.texture.dispose();}
          constructionEntry={...build(plan),id:plan.id,texture:constructionMaskTexture(plan)};
          constructionEntry.planMask=constructionAppearance(constructionEntry.object);constructionKey=nextConstruction;
        }
        constructionEntry.object.visible=true;setConstructionMask(constructionEntry.planMask,plan,constructionEntry.texture);
        constructionBase=entries.get(plan.id);
        if(constructionBase){constructionBase.planMask??=bindConstructionMask(constructionBase.object,false);setConstructionMask(constructionBase.planMask,plan,constructionEntry.texture);}
      }else if(constructionEntry)constructionEntry.object.visible=false;
      if(unknown.userData.layout!==layout||unknownInput!==unknownPlots){
        const nextUnknown=JSON.stringify(unknownPlots);unknownInput=unknownPlots;
        if(unknown.userData.layout!==layout||unknownKey!==nextUnknown){
          const base=unknown.userData.layout===layout?unknown.userData.roadMesh:null;base?.removeFromParent();release({object:unknown});unknown=createUnknownCity(layout,unknownPlots,base);unknown.userData.layout=layout;scene.add(unknown);freezeCityTransforms(unknown);unknownKey=nextUnknown;
        }
      }
      if(roads.userData.layout!==layout||roadInput!==roadCells||geographyChanged){
        const nextRoads=cellMeters+':'+roadCells.join(',');roadInput=roadCells;
        if(roads.userData.layout!==layout||nextRoads!==roadKey){release({object:roads});const visibleRoads=new Set(roadCells);roads=createRoadModel(layout,cellMeters,id=>visibleRoads.has(id));roads.userData.layout=layout;scene.add(roads);freezeCityTransforms(roads);roadKey=nextRoads;}
      }
      if(plantInput!==plants){
        plantInput=plants;plantPlots=new Map();for(const plant of plants){if(!plantPlots.has(plant.plot))plantPlots.set(plant.plot,[]);plantPlots.get(plant.plot).push(plant);}
        for(const [id,list] of plantPlots)list.signature=JSON.stringify(list);
        plantSignature=JSON.stringify(plants);
        for(const [id,entry] of plantEntries)if(!plantPlots.has(id)){release(entry);plantEntries.delete(id);}
      }
      // 同一空地的静态树群按共用材质合并；悬停建设只改透明度，不重建几何。
      for(const [id,list] of plantPlots){
        const nearby=list.some(p=>intersects({...p,w:p.w??1,h:p.h??p.w??1}));
        if(!nearby){if(plantEntries.has(id))plantEntries.get(id).object.visible=false;continue;}
        const signature=list.signature;
        if(plantEntries.get(id)?.signature!==signature){
          if(plantEntries.has(id))release(plantEntries.get(id));const group=new THREE.Group();
          for(const plant of list){
            const object=models.get(plant.asset).clone(true),{bounds,size,center}=measureModel(plant.asset),scale=plant.w/Math.max(size.x,size.z);
            object.traverse(node=>{if(node.isMesh)node.material=node.material.clone();});
            object.scale.setScalar(scale);object.position.set(-center.x*scale,-bounds.min.y*scale,-center.z*scale);
            const anchor=new THREE.Group();anchor.add(object);anchor.position.set(plant.x,0,plant.y);anchor.rotation.y=plant.angle;group.add(anchor);
          }
          mergePlot(group);group.traverse(node=>{if(node.isMesh)node.userData.cityDecoration=true;});geometryVersion++;vegetation.add(group);freezeCityTransforms(group);plantEntries.set(id,{object:group,signature});
        }
        const faded=id===plantPreview,entry=plantEntries.get(id);
        entry.object.visible=id!==constructionPreview?.id;
        if(entry.faded!==faded){entry.object.traverse(node=>{if(node.isMesh){node.material.transparent=faded;node.material.opacity=faded ? .18 : 1;node.material.depthWrite=!faded;node.castShadow=!faded;}});entry.faded=faded;}
      }
      const plantChunks=new Map();
      for(const [id,list] of plantPlots){
        const entry=plantEntries.get(id);if(!entry||entry.signature!==list.signature||id===plantPreview)continue;
        const key=Math.floor(list[0].x/16)+':'+Math.floor(list[0].y/16);
        if(!plantChunks.has(key))plantChunks.set(key,{entries:[],near:false,signature:''});const chunk=plantChunks.get(key);
        chunk.entries.push(entry);chunk.near||=entry.object.visible;chunk.signature+=id+':'+entry.signature+'|';entry.object.visible=false;
      }
      for(const [id,entry] of plantBatches)if(!plantChunks.has(id)){release(entry);plantBatches.delete(id);}
      for(const [id,chunk] of plantChunks){
        let entry=plantBatches.get(id);if(entry)entry.object.visible=chunk.near;if(!chunk.near)continue;
        if(entry?.signature!==chunk.signature){
          const object=batchStaticPlots(chunk.entries.map(e=>e.object));if(entry)release(entry);object.traverse(node=>{if(node.isMesh)node.userData.cityDecoration=true;});vegetation.add(object);freezeCityTransforms(object);geometryVersion++;entry={object,signature:chunk.signature};plantBatches.set(id,entry);
        }
      }
      plantKey=plantSignature+':'+plantPreview;
      const rawStreet=models.get('street'),{bounds:streetBounds}=measureModel('street'),streetScale=7.5/cellMeters/(streetBounds.max.y-streetBounds.min.y);
      if(!streetLightOffset){streetLightOffset=new THREE.Vector3();rawStreet.traverse(node=>{if(node.isMesh&&node.material.name==='#ffe1a3')streetLightOffset=new THREE.Box3().setFromObject(node).getCenter(new THREE.Vector3());});}
      const lightOffset=streetLightOffset;
      let streetsChanged=false;
      if(geographyChanged||streetInputs[0]!==lamps||streetInputs[1]!==dressing||streetInputs[2]!==cellMeters){
        streetChunks=spatialChunks(lamps,dressing,32);streetInputs=[lamps,dressing,cellMeters];
        streetLights=[];
        for(const lamp of lamps){const offset=lightOffset.clone().multiplyScalar(streetScale).applyAxisAngle(new THREE.Vector3(0,1,0),lamp.angle);streetLights.push({x:lamp.x+offset.x,y:lamp.y+offset.z,height:offset.y+naturalGroundAt(layout,lamp.x,lamp.y,cellMeters)});}
        for(const [id,entry] of streetEntries)if(geographyChanged||entry.signature!==streetChunks.get(id)?.signature){release(entry);streetEntries.delete(id);}
        streetKey=cellMeters+JSON.stringify([lamps,dressing]);streetsChanged=true;
      }
      for(const [id,chunk] of streetChunks){
        const nearby=intersects(chunk);if(streetEntries.has(id)){streetEntries.get(id).object.visible=nearby;continue;}if(!nearby)continue;
        const group=new THREE.Group();
        for(const lamp of chunk.lamps){
          const object=new THREE.Group(),model=models.get('street').clone(true);object.add(model);model.traverse(node=>{if(node.isMesh){node.material=node.material.clone();node.castShadow=node.receiveShadow=true;}});
          model.scale.setScalar(streetScale);model.position.y=-streetBounds.min.y*streetScale;object.position.set(lamp.x,naturalGroundAt(layout,lamp.x,lamp.y,cellMeters),lamp.y);object.rotation.y=lamp.angle;
          const pool=groundGlow(18/cellMeters,28/cellMeters,'#ffca72',.32);pool.position.set(lightOffset.x*streetScale,.012,lightOffset.z*streetScale);pool.userData.ownGeometry=true;object.add(pool);group.add(object);
        }
        for(const prop of chunk.dressing){
          const object=models.get(prop.asset).clone(true),{bounds,size,center}=measureModel(prop.asset),scale=Math.min(prop.w/size.x,prop.h/size.z);
          object.traverse(node=>{if(node.isMesh){node.material=node.material.clone();node.castShadow=prop.castShadow??true;node.receiveShadow=prop.receiveShadow??true;}});
          if(prop.color)styleVehicleBody(object,prop.color,prop.asset==='damagedCar');
          const anchor=new THREE.Group();object.scale.setScalar(scale);object.position.set(-center.x*scale,-bounds.min.y*scale,-center.z*scale);anchor.add(object);anchor.position.set(prop.x,prop.ground??naturalGroundAt(layout,prop.x,prop.y,cellMeters),prop.y);anchor.rotation.y=prop.angle;group.add(anchor);
        }
        mergePlot(group,true);group.traverse(node=>{if(node.isMesh&&node.material.transparent)node.castShadow=false;});
        const batch=batchStaticPlots([group]);release({object:group});streets.add(batch);freezeCityTransforms(batch);
        streetEntries.set(id,{object:batch,signature:chunk.signature});geometryVersion++;streetsChanged=true;
      }
      if(streetsChanged)streetMaterials=[...new Set([...streetEntries.values()].flatMap(entry=>entry.object.children.map(node=>node.material)))];
      // 夜间槽位跨镜头保持稳定；白天不参与着色，布局变化后的夜景在空闲分批准备。
      const visible=lightViewport??{left:-panX/cell,right:(width-panX)/cell,top:-panY/cell,bottom:(height-panY)/cell};
      const reach=22/cellMeters,cx=(width/2-panX)/cell,cy=(height/2-panY)/cell;
      const nearby=streetLights.filter(p=>p.x>=visible.left-reach&&p.x<=visible.right+reach&&p.y>=visible.top-reach&&p.y<=visible.bottom+reach).sort((a,b)=>Math.hypot(a.x-cx,a.y-cy)-Math.hypot(b.x-cx,b.y-cy)).slice(0,lightBudget);
      // 池规模不超过实际灯具数；平移仍保持槽位，避免没有路灯时也计算24盏零强度灯。
      const wanted=new Map(nearby.map(p=>[`${p.x}:${p.y}`,p])),poolSize=Math.min(lightBudget,streetLights.length);
      while(localLights.length>poolSize){const index=localLights.findIndex(light=>!wanted.has(light.userData.id)&&light.userData.level===0);if(index<0)break;localLights.splice(index,1)[0].removeFromParent();}
      while(localLights.length<poolSize){const light=new THREE.PointLight('#ffd08a',0,reach,2);light.userData.level=0;light.userData.cityNightOnly=true;scene.add(light);localLights.push(light);}
      const claimed=new Set(localLights.map(l=>l.userData.id).filter(id=>wanted.has(id)));
      for(const light of localLights){
        let p=wanted.get(light.userData.id);const dt=Math.min(.1,Math.max(0,performance.now()/1000-(light.userData.at??performance.now()/1000)));light.userData.at=performance.now()/1000;
        light.userData.level=fx.reducedMotion?(p?1:0):Math.max(0,Math.min(1,light.userData.level+(p?1:-1)*dt*5));
        if(!p&&light.userData.level===0){const next=[...wanted].find(([id])=>!claimed.has(id));if(next){const [id,point]=next;light.userData.id=id;claimed.add(id);p=point;light.userData.level=fx.reducedMotion?1:night>0?.01:0;}}
        light.visible=night>0;light.distance=reach;light.intensity=night*1.7*(20/cellMeters)**2*light.userData.level;if(p)light.position.set(p.x,p.height,p.y);
      }
      for(const material of streetMaterials){if(material.map)material.opacity=night*.32;else if(material.name==='#ffe1a3'){material.emissive.set('#ffb75c');material.emissiveIntensity=night*1.8;}}
      const lightItems=[...fx.sweeps,...fx.fires].filter(item=>{const range=item.asset==='watch'?(item.target?24:item.w*4):item.asset==='wreck'?2.3*(item.fireScale??1):4;return !lightViewport||item.x>=lightViewport.left-range&&item.x<=lightViewport.right+range&&item.y>=lightViewport.top-range&&item.y<=lightViewport.bottom+range;}).map(item=>{const {size}=measureModel(item.asset);return {...item,height:naturalGroundAt(layout,item.x,item.y,cellMeters)+size.y*Math.min(item.w/size.x,item.h/size.z)*(item.asset==='watch'?.84:.65)};});
      effects.updateLights(lightItems,fx.time,night,visible);
      pointGrid.update(effects.nightLights().filter(light=>light.isPointLight&&!light.castShadow),pointGridEnabled);
      // 静态云纹/悬停刷新复用城市画面；扫光与火光读取同一动效时间重画承光层。
      const shapes=plots.map(p=>`${p.id}:${entries.get(p.id).signature}`).join('|');
      const signature=shapes+plantKey+'|plan:'+nextConstruction+'|nature:'+natureKey+'|'+plots.map(p=>p.powered?'1':'0').join('')+streetKey+roadKey+JSON.stringify(lightItems)+`/${width}:${height}:${panX}:${panY}:${cell}:${night}:${lightBudget}:${fx.time}:${worldShadow}:${pointGridEnabled}`;
      if(signature!==lastFrame){
        const dimensions=`${width}:${height}`;if(pixels!==dimensions){renderer.setSize(width,height,false);pixels=dimensions;}
        sky.color.set('#f4f6e2').lerp(new THREE.Color('#b9d7ed'),night);sky.groundColor.set('#809180').lerp(new THREE.Color('#4c676b'),night);sky.intensity=2.4-night*.9;
        sun.color.set('#fff1cd').lerp(new THREE.Color('#b9cfff'),night);sun.intensity=3.2-night*2.3;
        const shadowView=lightViewport??{left:0,right:layout.width,top:0,bottom:layout.height},volume=worldShadow?cityShadowVolume(shadowView,layout.width,layout.height,Math.max(48,Math.ceil(Math.max(layout.width,layout.height)*.8))):{x:(shadowView.left+shadowView.right)/2,y:(shadowView.top+shadowView.bottom)/2,extent:Math.max(64,Math.hypot(shadowView.right-shadowView.left,shadowView.bottom-shadowView.top)/2+16),resolution:2048,stable:false},targetX=volume.x,targetY=volume.y,extent=volume.extent,distance=Math.max(60,extent*1.5);
        if(sun.shadow.mapSize.x!==volume.resolution){sun.shadow.map?.dispose();sun.shadow.map=null;sun.shadow.mapSize.set(volume.resolution,volume.resolution);renderer.shadowMap.needsUpdate=true;}
        sun.target.position.set(targetX,0,targetY);sun.position.set(targetX-distance,distance,targetY-distance/6);
        Object.assign(sun.shadow.camera,{left:-extent,right:extent,top:extent,bottom:-extent,far:distance*4+100});sun.shadow.camera.updateProjectionMatrix();
        const shadowKey=geometryVersion+':'+shapes+streetKey+plantKey+'|nature:'+natureKey+':'+targetX+':'+targetY+':'+extent+':'+(volume.stable?'world':fx.cameraKey);if(shadowKey!==lastShadow){renderer.shadowMap.needsUpdate=true;lastShadow=shadowKey;}
        lastFrame=signature;
      }
    },
    renderFacilities(items,night,fx){
      if(!ready)return null;
      upgradeEffects.update(fx.upgrades??[],fx.time,fx.upgradeStyle,fx.reducedMotion);
      zombieCrowds.update(items.filter(item=>item.asset==='enemy'),fx);
      const active=new Set(items.map(p=>p.id));for(const [id,entry] of props)if(!active.has(id)){release(entry);props.delete(id);}
      for(const item of items){
        if(item.asset==='enemy')continue;
        const near=!facilityViewport||item.x+(item.w??1)>=facilityViewport.left-16&&item.x-(item.w??1)<=facilityViewport.right+16&&item.y+(item.h??1)>=facilityViewport.top-16&&item.y-(item.h??1)<=facilityViewport.bottom+16;
        if(props.has(item.id))props.get(item.id).object.visible=near;if(!near)continue;
        const instancedWreck=item.asset==='wreck'&&(item.alpha??1)===1&&(item.health??1)===1&&!item.dead;
        const shape=`${item.asset}:${item.w}:${item.h}:${item.connections??''}:${item.cellMeters??''}:${item.dead??false}:${item.color??''}:${instancedWreck}`;
        if(props.get(item.id)?.signature!==shape){
          if(props.has(item.id))release(props.get(item.id));
          const object=new THREE.Group(),model=item.asset==='wall'?connectedWall(models.get('wall'),item):models.get(item.asset).clone(true);object.add(model);model.traverse(node=>{if(node.isMesh)node.material=node.material.clone();});if(item.asset==='wreck')styleWreckBody(model,item.color);model.traverse(node=>{if(node.isMesh)node.material.userData.baseColor=node.material.color.clone();});object.updateMatrixWorld(true);
          // 灰色炮体与灰屋顶分离；材质名保留，后坐、炮口和弹迹仍读取原节点。
          if(['near','far'].includes(item.asset))model.traverse(node=>{if(node.isMesh){const color=node.material.name==='#6c7775'?'#354b4b':['#3f5057','#1e2b32'].includes(node.material.name)?'#98aaa1':item.asset==='far'?'#c3c5d0':'#a8b7a0';node.material.color.set(color);node.material.userData.baseColor=node.material.color.clone();node.material.emissive.set(color);node.material.emissiveIntensity=.10;}});
          const bounds=new THREE.Box3().setFromObject(model),size=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3());
          if(item.asset!=='wall'){const scale=Math.min(item.w/size.x,item.h/size.z);model.scale.setScalar(scale);model.position.set(-center.x*scale,-bounds.min.y*scale,-center.z*scale);}
          if(instancedWreck)model.traverse(node=>{if(node.isMesh&&!['#ff9538','#ffd36b'].includes(node.material.name))node.visible=false;});
          geometryVersion++;facilities.add(object);props.set(item.id,{object,signature:shape,height:new THREE.Box3().setFromObject(object).max.y,motion:facilityMotion(object),wreck:item.asset==='wreck'&&!instancedWreck?createWreckDressing(object,item.w,item.h):null});
        }
        const {object}=props.get(item.id);object.position.set(item.x,item.roof??0,item.y);if(item.asset==='wreck')object.rotation.y=item.angle??0;object.scale.y=item.dead&&item.asset!=='sourceRuined'?.3:1;
        object.traverse(node=>{if(node.isMesh){node.material.opacity=item.alpha??1;node.material.transparent=node.material.opacity<1;if(!node.material.userData.baseColor)node.material.userData.baseColor=node.material.color.clone();node.material.color.copy(node.material.userData.baseColor).lerp(new THREE.Color('#84867a'),item.dead?.85:(1-(item.health??1))*.5);if(['#ff9538','#ffd36b'].includes(node.material.name))node.visible=!item.dead;}});
        animateFacility(props.get(item.id),item,fx);
        if(props.get(item.id).wreck)updateWreckDressing(props.get(item.id).wreck,fx.time,night,fx.reducedMotion);
      }
      if(wreckInstances.update(items.filter(item=>item.asset==='wreck'&&(item.alpha??1)===1&&(item.health??1)===1&&!item.dead),fx.time,night,fx.reducedMotion))geometryVersion++;
      const signature=JSON.stringify(items)+JSON.stringify(fx.shots)+JSON.stringify(fx.impacts)+JSON.stringify(fx.transitions)+JSON.stringify(fx.upgrades)+JSON.stringify([fx.upgradeStyle.upgradeFlowHeightMeters,fx.upgradeStyle.upgradeFlowCycleMs,fx.upgradeStyle.upgradeFlowOpacity])+`/${lastFrame}:${night}:${fx.time}:${fx.cameraKey}`;
      if(signature!==lastProps){
        effects.updateDefense(fx.defenseHits??[],fx.time);
        effects.updateTransitions(fx.transitions??[],fx.time);effects.updateShots(fx.shots,fx.impacts??[],props,fx.time,fx.cell,fx.cellMeters,night,fx.pixelsAt);
        lastProps=signature;
      }
    },
  };
}
