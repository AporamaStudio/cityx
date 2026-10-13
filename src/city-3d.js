import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {addBuildingFoundation,buildingVariation} from './city-building-style.js?v=1';
import {createWreckDressing,updateWreckDressing,styleWreckBody,styleVehicleBody} from './city-wrecks.js?v=2';
import {createRoadModel} from './city-road-model.js?v=1';
import {PLANT_MODELS} from './city-vegetation.js?v=1';
import {groundGlow} from './model-preview-effects.js?v=4';
import {createCityEffects,facilityMotion,animateFacility} from './city-effects.js?v=8';
import {createCityObservation} from './city-observation.js?v=5';

// 俯视城市只读取显示描述；格子命中、权限、寻路和结算继续由原游戏负责。
const files={home:'kenney/suburban/building-type-a',small:'kenney/suburban/building-type-h',wide:'kenney/suburban/building-type-u',factory:'kenney/industrial/building-a',workshop:'kenney/industrial/building-f',hospital:'generated/hospital',hospitalRuined:'generated/hospital-ruined',bank:'generated/bank',bankRuined:'generated/bank-ruined',near:'generated/cannon-near',far:'generated/cannon-long',watch:'generated/watchtower',wall:'generated/brick-wall',camp:'generated/campfire',plaza:'generated/camp-plaza',enemy:'generated/enemy-squad',source:'generated/enemy-source',sourceRuined:'generated/enemy-source-ruined',street:'generated/streetlight',wreck:'generated/burnt-car',trash:'generated/trash',rubble:'generated/rubble',bench:'generated/street-bench',planter:'generated/street-planter',car:'generated/civil-car',damagedCar:'generated/damaged-car'};
for(const [name,file] of Object.entries(PLANT_MODELS))files[name]='generated/'+file;
for(const name of ['home','small','wide','factory','workshop'])files[name+'Ruined']=files[name]+'-ruined';
const resource=file=>new URL('../assets/model-preview/'+file+'.glb?v=5',import.meta.url).href;

function operatingLights(object){
  // 玻璃沿用同一色板发光，屋顶补少量暖灯，保证俯视也能辨认运营状态。
  object.traverse(node=>{if(node.isMesh){const material=node.material;material.userData.cityPower={value:0};material.onBeforeCompile=shader=>{
    shader.uniforms.cityWindowPower=material.userData.cityPower;
    shader.vertexShader='varying float cityWindowSurface;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\ncityWindowSurface=1.-smoothstep(.35,.6,abs(normal.y));');
    shader.fragmentShader='uniform float cityWindowPower;\nvarying float cityWindowSurface;\n'+shader.fragmentShader.replace('#include <emissivemap_fragment>','#include <emissivemap_fragment>\nfloat cityGlass=step(diffuseColor.r*1.8,diffuseColor.b)*step(diffuseColor.g*1.25,diffuseColor.b)*step(.1,diffuseColor.b)*cityWindowSurface;\ntotalEmissiveRadiance+=vec3(1.,.54,.18)*cityGlass*cityWindowPower*1.1;');
  };material.customProgramCacheKey=()=> 'cityx-game-windows';}});
  object.updateMatrixWorld(true);
  const bounds=new THREE.Box3().setFromObject(object),size=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3()),group=new THREE.Group();
  const ray=new THREE.Raycaster(),normal=new THREE.Vector3();
  for(const [dx,dz] of [[-.22,-.18],[.22,-.18],[-.22,.18],[.22,.18]]){
    ray.set(new THREE.Vector3(center.x+size.x*dx,bounds.max.y+1,center.z+size.z*dz),new THREE.Vector3(0,-1,0));const hit=ray.intersectObject(object,true)[0];if(!hit||hit.point.y<bounds.min.y+size.y*.38)continue;
    normal.copy(hit.face.normal).transformDirection(hit.object.matrixWorld);if(normal.y<.28)continue;
    const point=object.worldToLocal(hit.point.clone()),lamp=new THREE.Mesh(new THREE.PlaneGeometry(size.x*.11,size.z*.07),new THREE.MeshBasicMaterial({color:'#ffd28a',transparent:true,toneMapped:false}));
    lamp.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),normal);lamp.position.copy(point).addScaledVector(normal,.025);lamp.userData.ownGeometry=true;
    const halo=groundGlow(size.x*.28,size.z*.24,'#ffc174',.28);halo.quaternion.copy(lamp.quaternion);halo.position.copy(point).addScaledVector(normal,.035);halo.userData.ownGeometry=true;group.add(lamp,halo);
  }
  group.userData.cityRoofLights=true;group.visible=false;object.add(group);
}

function ruinAppearance(object){
  // 几何使用固定配套GLB；运行时只灰化原贴图，保留暗内层与碎块本身的材质。
  object.traverse(node=>{if(!node.isMesh||!node.material.map)return;node.material.color.set('#a29c87');node.material.roughness=1;
    node.material.onBeforeCompile=shader=>{shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>','#include <map_fragment>\ndiffuseColor.rgb=mix(diffuseColor.rgb,vec3(dot(diffuseColor.rgb,vec3(.2126,.7152,.0722))),.82);');};
    node.material.customProgramCacheKey=()=> 'cityx-game-ruin';
  });
}

// 同一地块重复模型按材质合并，减少绘制次数；控制、修缮和炮位仍只对应原建筑对象。
function mergePlot(object){
  object.updateMatrixWorld(true);const inverse=object.matrixWorld.clone().invert(),groups=new Map(),materials=new Set();
  object.traverse(node=>{if(!node.isMesh)return;
    const material=node.material,key=[material.map?.uuid??'',material.color.getHex(),material.roughness,Object.keys(node.geometry.attributes).sort().join(',')].join(':');
    if(!groups.has(key))groups.set(key,{material,geometries:[]});materials.add(material);
    const geometry=node.geometry.index?node.geometry.toNonIndexed():node.geometry.clone();geometry.applyMatrix4(inverse.clone().multiply(node.matrixWorld));groups.get(key).geometries.push(geometry);
    if(node.userData.ownGeometry)node.geometry.dispose();
  });
  object.clear();const retained=new Set();
  for(const {material,geometries} of groups.values()){
    const geometry=mergeGeometries(geometries);for(const source of geometries)source.dispose();
    const mesh=new THREE.Mesh(geometry,material);mesh.castShadow=mesh.receiveShadow=true;mesh.userData.ownGeometry=true;object.add(mesh);retained.add(material);
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

export function createCity3D(onReady){
  let renderer;
  try{renderer=new THREE.WebGLRenderer({alpha:true,antialias:true,preserveDrawingBuffer:true});}
  catch(error){console.warn('3D城市不可用，保留原地图显示。',error);return null;}
  renderer.setPixelRatio(Math.min(devicePixelRatio,2));
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.shadowMap.autoUpdate=false;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.05;
  renderer.setClearColor('#000000',0);
  const scene=new THREE.Scene(),camera=new THREE.OrthographicCamera(0,60,0,-60,.1,200);
  camera.position.set(0,100,0);camera.up.set(0,0,-1);camera.lookAt(0,0,0);
  const sky=new THREE.HemisphereLight('#f4f6e2','#809180',2.4),sun=new THREE.DirectionalLight('#fff1cd',3.2);
  sun.position.set(-30,60,20);sun.target.position.set(30,0,30);scene.add(sky,sun,sun.target);
  sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-64,right:64,top:64,bottom:-64,near:1,far:180});sun.shadow.bias=-.00025;sun.shadow.normalBias=.03;
  const buildings=new THREE.Group(),facilities=new THREE.Group(),enemies=new THREE.Group();scene.add(buildings,facilities,enemies);
  const vegetation=new THREE.Group(),plantEntries=new Map();facilities.add(vegetation);let plantKey='';
  const streets=new THREE.Group();scene.add(streets);let terrain=null,roadLayout=null,streetKey='',lastShadow='';
  let roads=new THREE.Group(),roadKey='';scene.add(roads);
  const localLights=[];
  const effects=createCityEffects(scene),effectCanvas=document.createElement('canvas');
  const cityCanvas=document.createElement('canvas'),facilityCanvas=document.createElement('canvas'),enemyCanvas=document.createElement('canvas');
  const models=new Map(),entries=new Map(),props=new Map(),loader=new GLTFLoader();let ready=false,lastFrame='',lastProps='',pixels='';
  const observation=createCityObservation(scene,renderer);
  function capture(canvas){if(canvas.width!==renderer.domElement.width||canvas.height!==renderer.domElement.height){canvas.width=renderer.domElement.width;canvas.height=renderer.domElement.height;}const ctx=canvas.getContext('2d');ctx.clearRect(0,0,canvas.width,canvas.height);ctx.drawImage(renderer.domElement,0,0);return canvas;}
  Promise.all(Object.entries(files).map(async ([name,file])=>{models.set(name,(await loader.loadAsync(resource(file))).scene);})).then(()=>{ready=true;onReady();}).catch(error=>console.error('城市模型装载失败，保留原地图。',error));
  function release(entry){
    entry.object.removeFromParent();const maps=new Set();entry.object.traverse(node=>{if(node.isMesh){if(node.material.map?.userData.cityOwned)maps.add(node.material.map);node.material.dispose();if(node.userData.ownGeometry)node.geometry.dispose();}});for(const map of maps)map.dispose();
  }
  function build(plot){
    const {id,x,y,w,h,type,status,cellMeters}=plot,landmark=['hospital','bank'].includes(type);
    const pool=type==='housing'?['small','home','wide']:['factory','workshop'];
    const object=new THREE.Group(),housing=type==='housing',columns=landmark?1:housing?Math.min(w,4):Math.ceil(w/2),rows=landmark?1:housing?Math.min(h,3):Math.ceil(h/2),slotW=w/columns,slotH=h/rows;
    const podium=landmark?0:(housing?2.5:1.5)/cellMeters;
    if(podium){addBuildingFoundation(object,{w,h,height:podium,cellMeters,housing,ruined:status==='ruin'});object.userData.podiumHeight=podium;}
    for(let row=0;row<rows;row++)for(let column=0;column<columns;column++){
      let name=landmark?(status==='ruin'?type+'Ruined':type):'',rotation=0,best=Infinity;
      if(!landmark)for(const candidate of pool){
        const size=new THREE.Box3().setFromObject(models.get(candidate)).getSize(new THREE.Vector3());
        for(const turn of [0,1]){const ratio=turn?size.z/size.x:size.x/size.z,score=Math.abs(Math.log(slotW/slotH/ratio))+((id+column+row)%3===pool.indexOf(candidate)?0:.20);if(score<best){best=score;name=candidate;rotation=turn*Math.PI/2;}}
      }
      const variation=buildingVariation(id,column,row);if(!landmark)rotation+=variation.turn;
      const reference=models.get(name).clone(true);reference.rotation.y=rotation;reference.updateMatrixWorld(true);
      const model=models.get(!landmark&&status==='ruin'?name+'Ruined':name).clone(true);model.rotation.y=rotation;model.updateMatrixWorld(true);
      model.traverse(node=>{if(node.isMesh){node.material=node.material.clone();if(!landmark)node.material.color.multiply(new THREE.Color(variation.tint));node.material.roughness=.95;node.castShadow=true;node.receiveShadow=true;}});
      const bounds=new THREE.Box3().setFromObject(reference),size=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3());
      const scale=landmark?Math.min((w-.16)/size.x,(h-.16)/size.z):Math.min(slotW*.86/size.x,slotH*.86/size.z,(housing?12:22)/cellMeters/size.y)*variation.scale;
      model.scale.setScalar(scale);if(landmark)model.scale.y=1/cellMeters;model.position.set(-w/2+(column+.5)*slotW-center.x*scale,podium-bounds.min.y*model.scale.y,-h/2+(row+.5)*slotH-center.z*scale);object.add(model);
    }
    object.position.set(x+w/2,0,y+h/2);buildings.add(object);
    if(!landmark)mergePlot(object);
    if(status==='ruin'&&!landmark)ruinAppearance(object);
    if(status==='building')operatingLights(object);
    return {object,signature:`${type}:${status}:${w}:${h}:${cellMeters}`,roof:new THREE.Box3().setFromObject(object).max.y};
  }
  return {
    isReady(){return ready;},
    observationPick(x,y,width,height){return ready?observation.pick(x,y,width,height):null;},
    observationFrame(options){if(!ready)return null;if(terrain)terrain.visible=false;return observation.render({...options,objects:[buildings,facilities,streets,roads],enemies,effects:effects.group});},
    has(id){return ready&&entries.has(id);},
    hasFacility(id){return ready&&props.has(id);},
    facilityTopAt(id){const entry=props.get(id);return entry?entry.object.position.y+entry.height*entry.object.scale.y:0;},
    baseAt(id){return entries.get(id)?.object.userData.podiumHeight??0;},
    effectsFrame(){return ready?effectCanvas:null;},
    enemiesFrame(){return ready?enemyCanvas:null;},
    roofAt(id,x,y){
      const entry=entries.get(id);if(!entry)return 0;
      entry.object.updateMatrixWorld(true);const ray=new THREE.Raycaster(new THREE.Vector3(x,entry.roof+1,y),new THREE.Vector3(0,-1,0));
      return ray.intersectObject(entry.object,true)[0]?.point.y??entry.roof;
    },
    render(plots,{width,height,panX,panY,cell,cellMeters,lightBudget=24,lightViewport,night,layout,lamps=[],dressing=[],plants=[],plantPreview=null,roadCells=[],fx}){
      if(!ready)return null;
      const active=new Set(plots.map(p=>p.id));
      for(const [id,entry] of entries)if(!active.has(id)){release(entry);entries.delete(id);}
      for(const plot of plots){
        const signature=`${plot.type}:${plot.status}:${plot.w}:${plot.h}:${plot.cellMeters}`;
        if(entries.get(plot.id)?.signature!==signature){if(entries.has(plot.id))release(entries.get(plot.id));entries.set(plot.id,build(plot));}
        entries.get(plot.id).object.traverse(node=>{if(node.userData.cityRoofLights)node.visible=plot.powered&&night>0;if(node.isMesh){if(node.material.userData.cityPower)node.material.userData.cityPower.value=plot.powered?night:0;if(node.parent?.userData.cityRoofLights)node.material.opacity=plot.powered?night*(node.material.map?.28:1):0;}});
      }
      if(layout&&(roadLayout!==layout||terrain.userData.cellMeters!==cellMeters)){
        if(terrain){terrain.removeFromParent();terrain.geometry.dispose();terrain.material.map.dispose();terrain.material.dispose();}
        const canvas=document.createElement('canvas');canvas.width=layout.width*32;canvas.height=layout.height*32;const ctx=canvas.getContext('2d');ctx.scale(32,32);ctx.fillStyle='#697b70';ctx.fillRect(0,0,layout.width,layout.height);
        for(let y=0;y<layout.height;y++)for(let x=0;x<layout.width;x++)if(layout.tiles[y*layout.width+x]==='road'){ctx.fillStyle='#475057';ctx.fillRect(x,y,1,1);}
        const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
        terrain=new THREE.Mesh(new THREE.PlaneGeometry(layout.width,layout.height),new THREE.MeshStandardMaterial({map:texture,roughness:.95}));terrain.rotation.x=-Math.PI/2;terrain.position.set(layout.width/2,-.015,layout.height/2);terrain.receiveShadow=true;scene.add(terrain);terrain.userData.cellMeters=cellMeters;roadLayout=layout;
      }
      const nextRoads=cellMeters+':'+roadCells.join(',');
      if(roads.userData.layout!==layout||nextRoads!==roadKey){
        release({object:roads});const visibleRoads=new Set(roadCells);roads=createRoadModel(layout,cellMeters,id=>visibleRoads.has(id));roads.userData.layout=layout;scene.add(roads);roadKey=nextRoads;
      }
      const plantPlots=new Map();for(const plant of plants){if(!plantPlots.has(plant.plot))plantPlots.set(plant.plot,[]);plantPlots.get(plant.plot).push(plant);}
      for(const [id,entry] of plantEntries)if(!plantPlots.has(id)){release(entry);plantEntries.delete(id);}
      // 同一空地的静态树群按共用材质合并；悬停建设只改透明度，不重建几何。
      for(const [id,list] of plantPlots){
        const signature=JSON.stringify(list);
        if(plantEntries.get(id)?.signature!==signature){
          if(plantEntries.has(id))release(plantEntries.get(id));const group=new THREE.Group();
          for(const plant of list){
            const object=models.get(plant.asset).clone(true),bounds=new THREE.Box3().setFromObject(object),size=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3()),scale=plant.w/Math.max(size.x,size.z);
            object.traverse(node=>{if(node.isMesh)node.material=node.material.clone();});
            object.scale.setScalar(scale);object.position.set(-center.x*scale,-bounds.min.y*scale,-center.z*scale);
            const anchor=new THREE.Group();anchor.add(object);anchor.position.set(plant.x,0,plant.y);anchor.rotation.y=plant.angle;group.add(anchor);
          }
          mergePlot(group);group.traverse(node=>{if(node.isMesh)node.userData.cityDecoration=true;});vegetation.add(group);plantEntries.set(id,{object:group,signature});
        }
        const faded=id===plantPreview;plantEntries.get(id).object.traverse(node=>{if(node.isMesh){node.material.transparent=faded;node.material.opacity=faded ? .18 : 1;node.material.depthWrite=!faded;node.castShadow=!faded;}});
      }
      plantKey=JSON.stringify(plants)+':'+plantPreview;
      const nextStreets=cellMeters+JSON.stringify([lamps,dressing]),streetLights=[];
      const rawStreet=models.get('street'),streetBounds=new THREE.Box3().setFromObject(rawStreet),streetScale=7.5/cellMeters/(streetBounds.max.y-streetBounds.min.y);
      let lightOffset=new THREE.Vector3();rawStreet.traverse(node=>{if(node.isMesh&&node.material.name==='#ffe1a3')lightOffset=new THREE.Box3().setFromObject(node).getCenter(new THREE.Vector3());});
      for(const lamp of lamps){const offset=lightOffset.clone().multiplyScalar(streetScale).applyAxisAngle(new THREE.Vector3(0,1,0),lamp.angle);streetLights.push({x:lamp.x+offset.x,y:lamp.y+offset.z,height:offset.y});}
      if(nextStreets!==streetKey){
        for(const object of [...streets.children])release({object});streets.clear();
        for(const lamp of lamps){
          const object=new THREE.Group(),model=models.get('street').clone(true);object.add(model);model.traverse(node=>{if(node.isMesh){node.material=node.material.clone();node.castShadow=true;}});
          model.scale.setScalar(streetScale);model.position.y=-streetBounds.min.y*streetScale;object.position.set(lamp.x,0,lamp.y);object.rotation.y=lamp.angle;
          const pool=groundGlow(18/cellMeters,28/cellMeters,'#ffca72',.32);pool.position.set(lightOffset.x*streetScale,.012,lightOffset.z*streetScale);pool.userData.ownGeometry=true;object.add(pool);streets.add(object);
        }
        for(const prop of dressing){
          const object=models.get(prop.asset).clone(true),bounds=new THREE.Box3().setFromObject(object),size=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3()),scale=Math.min(prop.w/size.x,prop.h/size.z);
          object.traverse(node=>{if(node.isMesh){node.material=node.material.clone();node.castShadow=true;node.receiveShadow=true;}});
          if(prop.color)styleVehicleBody(object,prop.color,prop.asset==='damagedCar');
          const anchor=new THREE.Group();object.scale.setScalar(scale);object.position.set(-center.x*scale,-bounds.min.y*scale,-center.z*scale);anchor.add(object);anchor.position.set(prop.x,0,prop.y);anchor.rotation.y=prop.angle;streets.add(anchor);
        }
        mergePlot(streets);streets.traverse(node=>{if(node.isMesh&&node.material.transparent)node.castShadow=false;});
        streetKey=nextStreets;
      }
      // 只启用镜头附近路灯的真实光源；远景保留灯具与光池，灯不投独立阴影。
      const visible=lightViewport??{left:-panX/cell,right:(width-panX)/cell,top:-panY/cell,bottom:(height-panY)/cell};
      const reach=22/cellMeters,cx=(width/2-panX)/cell,cy=(height/2-panY)/cell;
      const nearby=streetLights.filter(p=>p.x>=visible.left-reach&&p.x<=visible.right+reach&&p.y>=visible.top-reach&&p.y<=visible.bottom+reach).sort((a,b)=>Math.hypot(a.x-cx,a.y-cy)-Math.hypot(b.x-cx,b.y-cy)).slice(0,lightBudget);
      // 固定池规模，空闲灯只归零强度；平移不改变Shader灯数，跨预算边缘渐变换位。
      while(localLights.length>lightBudget)localLights.pop().removeFromParent();
      while(localLights.length<lightBudget){const light=new THREE.PointLight('#ffd08a',0,reach,2);light.userData.level=0;scene.add(light);localLights.push(light);}
      const wanted=new Map(nearby.map(p=>[`${p.x}:${p.y}`,p])),claimed=new Set(localLights.map(l=>l.userData.id).filter(id=>wanted.has(id)));
      for(const light of localLights){
        let p=wanted.get(light.userData.id);const dt=Math.min(.1,Math.max(0,performance.now()/1000-(light.userData.at??performance.now()/1000)));light.userData.at=performance.now()/1000;
        light.userData.level=fx.reducedMotion?(p?1:0):Math.max(0,Math.min(1,light.userData.level+(p?1:-1)*dt*5));
        if(!p&&light.userData.level===0){const next=[...wanted].find(([id])=>!claimed.has(id));if(next){const [id,point]=next;light.userData.id=id;claimed.add(id);p=point;light.userData.level=fx.reducedMotion?1:night>0?.01:0;}}
        light.visible=night>0;light.distance=reach;light.intensity=night*1.7*(20/cellMeters)**2*light.userData.level;if(p)light.position.set(p.x,p.height,p.y);
      }
      streets.traverse(node=>{if(node.isMesh){if(node.material.map)node.material.opacity=night*.32;else if(node.material.name==='#ffe1a3'){node.material.emissive.set('#ffb75c');node.material.emissiveIntensity=night*1.8;}}});
      const lightItems=[...fx.sweeps,...fx.fires].map(item=>{const size=new THREE.Box3().setFromObject(models.get(item.asset)).getSize(new THREE.Vector3());return {...item,height:size.y*Math.min(item.w/size.x,item.h/size.z)*(item.asset==='watch'?.84:.65)};});
      effects.updateLights(lightItems,fx.time,night,visible);
      // 静态云纹/悬停刷新复用城市画面；扫光与火光读取同一动效时间重画承光层。
      const shapes=plots.map(p=>`${p.id}:${entries.get(p.id).signature}`).join('|');
      const signature=shapes+plantKey+plots.map(p=>p.powered?'1':'0').join('')+streetKey+roadKey+JSON.stringify(lightItems)+`/${width}:${height}:${panX}:${panY}:${cell}:${night}:${lightBudget}:${fx.observer??false}:${fx.time}`;
      if(signature!==lastFrame){
        const dimensions=`${width}:${height}`;if(pixels!==dimensions){renderer.setSize(width,height,false);pixels=dimensions;}
        camera.left=-panX/cell;camera.right=(width-panX)/cell;camera.top=panY/cell;camera.bottom=-(height-panY)/cell;camera.updateProjectionMatrix();
        sky.color.set('#f4f6e2').lerp(new THREE.Color('#b9d7ed'),night);sky.groundColor.set('#809180').lerp(new THREE.Color('#4c676b'),night);sky.intensity=2.4-night*.9;
        sun.color.set('#fff1cd').lerp(new THREE.Color('#b9cfff'),night);sun.intensity=3.2-night*2.3;
        const shadowKey=shapes+streetKey+plantKey;if(shadowKey!==lastShadow){renderer.shadowMap.needsUpdate=true;lastShadow=shadowKey;}
        // 斜视只准备同一批对象，由观察相机统一画；不再拷贝四张不会显示的俯视层。
        if(!fx.observer){buildings.visible=true;facilities.visible=false;enemies.visible=false;streets.visible=true;roads.visible=true;effects.group.visible=false;if(terrain)terrain.visible=true;renderer.render(scene,camera);capture(cityCanvas);}lastFrame=signature;
      }
      return cityCanvas;
    },
    renderFacilities(items,night,fx){
      if(!ready)return null;
      const active=new Set(items.map(p=>p.id));for(const [id,entry] of props)if(!active.has(id)){release(entry);props.delete(id);}
      for(const item of items){
        const shape=`${item.asset}:${item.w}:${item.h}:${item.connections??''}:${item.cellMeters??''}:${item.dead??false}:${item.color??''}`;
        if(props.get(item.id)?.signature!==shape){
          if(props.has(item.id))release(props.get(item.id));
          const object=new THREE.Group(),model=item.asset==='wall'?connectedWall(models.get('wall'),item):models.get(item.asset).clone(true);object.add(model);model.traverse(node=>{if(node.isMesh)node.material=node.material.clone();});if(item.asset==='wreck')styleWreckBody(model,item.color);model.traverse(node=>{if(node.isMesh)node.material.userData.baseColor=node.material.color.clone();});object.updateMatrixWorld(true);
          // 灰色炮体与灰屋顶分离；材质名保留，后坐、炮口和弹迹仍读取原节点。
          if(['near','far'].includes(item.asset))model.traverse(node=>{if(node.isMesh){const color=node.material.name==='#6c7775'?'#354b4b':['#3f5057','#1e2b32'].includes(node.material.name)?'#98aaa1':item.asset==='far'?'#c3c5d0':'#a8b7a0';node.material.color.set(color);node.material.userData.baseColor=node.material.color.clone();node.material.emissive.set(color);node.material.emissiveIntensity=.10;}});
          const bounds=new THREE.Box3().setFromObject(model),size=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3());
          if(item.asset!=='wall'){const scale=Math.min(item.w/size.x,item.h/size.z);model.scale.setScalar(scale);model.position.set(-center.x*scale,-bounds.min.y*scale,-center.z*scale);}
          (item.asset==='enemy'?enemies:facilities).add(object);props.set(item.id,{object,signature:shape,height:new THREE.Box3().setFromObject(object).max.y,motion:facilityMotion(object),wreck:item.asset==='wreck'?createWreckDressing(object,item.w,item.h):null});
        }
        const {object}=props.get(item.id);object.position.set(item.x,item.roof??0,item.y);if(item.asset==='wreck')object.rotation.y=item.angle??0;if(item.asset==='enemy'){object.scale.setScalar(item.visualScale??1);if(item.angle!==undefined)object.rotation.y=item.angle;}else object.scale.y=item.dead&&item.asset!=='sourceRuined'?.3:1;
        object.traverse(node=>{if(node.isMesh){node.material.opacity=item.alpha??1;node.material.transparent=node.material.opacity<1;if(!node.material.userData.baseColor)node.material.userData.baseColor=node.material.color.clone();node.material.color.copy(node.material.userData.baseColor).lerp(new THREE.Color('#84867a'),item.dead?.85:(1-(item.health??1))*.5);if(['#ff9538','#ffd36b'].includes(node.material.name))node.visible=!item.dead;}});
        if(item.asset==='enemy')object.traverse(node=>{if(node.isMesh){node.material.color.lerp(new THREE.Color('#fff0c9'),item.hitMix??0);node.material.color.lerp(new THREE.Color(item.fogColor),(1-item.fogAlpha)*.75);node.material.emissive.copy(node.material.color);node.material.emissiveIntensity=.08;}});
        animateFacility(props.get(item.id),item,fx);
        if(props.get(item.id).wreck)updateWreckDressing(props.get(item.id).wreck,fx.time,night,fx.reducedMotion);
      }
      const signature=JSON.stringify(items)+JSON.stringify(fx.shots)+JSON.stringify(fx.impacts)+JSON.stringify(fx.transitions)+`/${lastFrame}:${night}:${fx.time}:${fx.cameraKey}`;
      if(signature!==lastProps){
        effects.updateTransitions(fx.transitions??[],fx.time);effects.updateShots(fx.shots,fx.impacts??[],props,fx.time,fx.cell,fx.cellMeters,night,fx.pixelsAt);
        if(!fx.observer){
          buildings.visible=false;facilities.visible=true;enemies.visible=false;streets.visible=false;roads.visible=false;effects.group.visible=false;if(terrain)terrain.visible=false;renderer.render(scene,camera);capture(facilityCanvas);
          facilities.visible=false;enemies.visible=true;renderer.render(scene,camera);capture(enemyCanvas);enemies.visible=false;
          effects.group.visible=true;renderer.render(scene,camera);capture(effectCanvas);
        }
        lastProps=signature;
      }
      return facilityCanvas;
    },
  };
}
