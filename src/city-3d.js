import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {drawRoadTexture} from './city-textures.js?v=16';
import {groundGlow} from './model-preview-effects.js?v=3';
import {createCityEffects,facilityMotion,animateFacility} from './city-effects.js?v=4';

// 俯视城市只读取显示描述；格子命中、权限、寻路和结算继续由原游戏负责。
const files={home:'kenney/suburban/building-type-a',small:'kenney/suburban/building-type-h',wide:'kenney/suburban/building-type-u',factory:'kenney/industrial/building-a',workshop:'kenney/industrial/building-f',hospital:'generated/hospital',hospitalRuined:'generated/hospital-ruined',near:'generated/cannon-near',far:'generated/cannon-long',watch:'generated/watchtower',wall:'generated/brick-wall',camp:'generated/campfire',plaza:'generated/camp-plaza',source:'generated/enemy-source',street:'generated/streetlight',wreck:'generated/burnt-car'};
const resource=file=>new URL('../assets/model-preview/'+file+'.glb',import.meta.url).href;

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

function damageBuilding(object){
  // 同楼局部塌损：保留入口和轮廓，屋顶缺口从俯视可辨；只在状态切换时生成。
  object.updateMatrixWorld(true);
  const bounds=new THREE.Box3().setFromObject(object),size=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3());
  object.traverse(node=>{
    if(!node.isMesh)return;
    const geometry=node.geometry.index?node.geometry.toNonIndexed():node.geometry.clone(),positions=geometry.attributes.position;
    node.geometry=geometry;node.userData.ownGeometry=true;
    const point=new THREE.Vector3(),inverse=node.matrixWorld.clone().invert(),kept=[];
    for(let i=0;i<positions.count;i+=3){
      const middle=new THREE.Vector3();for(let j=0;j<3;j++)middle.add(point.fromBufferAttribute(positions,i+j).applyMatrix4(node.matrixWorld));middle.multiplyScalar(1/3);
      if(!(middle.x>center.x&&middle.z<center.z+size.z*.15&&middle.y>bounds.min.y+size.y*.4))kept.push(i,i+1,i+2);
    }
    geometry.setIndex(kept);
    for(let i=0;i<positions.count;i++){
      point.fromBufferAttribute(positions,i).applyMatrix4(node.matrixWorld);
      if(point.x>center.x&&point.z<center.z+size.z*.15&&point.y>bounds.min.y+size.y*.35)point.y=bounds.min.y+size.y*.35+(point.y-bounds.min.y-size.y*.35)*.1;
      point.applyMatrix4(inverse);positions.setXYZ(i,point.x,point.y,point.z);
    }
    geometry.computeVertexNormals();geometry.computeBoundingBox();geometry.computeBoundingSphere();
    node.material.color.set('#a29c87');
    node.material.onBeforeCompile=shader=>{shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>','#include <map_fragment>\ndiffuseColor.rgb=mix(diffuseColor.rgb,vec3(dot(diffuseColor.rgb,vec3(.2126,.7152,.0722))),.82);');};
    node.material.customProgramCacheKey=()=> 'cityx-game-ruin';
  });
  const floor=new THREE.Mesh(new THREE.BoxGeometry(size.x*.78,.05,size.z*.74),new THREE.MeshStandardMaterial({color:'#414a43',roughness:1}));
  floor.position.set(center.x,bounds.min.y+size.y*.12,center.z);floor.userData.ownGeometry=true;object.attach(floor);
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
  const buildings=new THREE.Group(),facilities=new THREE.Group();scene.add(buildings,facilities);
  const streets=new THREE.Group();scene.add(streets);let terrain=null,roadLayout=null,streetKey='',lastShadow='';
  const localLights=[];
  const effects=createCityEffects(scene),effectCanvas=document.createElement('canvas');
  const cityCanvas=document.createElement('canvas'),facilityCanvas=document.createElement('canvas');
  const models=new Map(),entries=new Map(),props=new Map(),loader=new GLTFLoader();let ready=false,lastFrame='',lastProps='',pixels='';
  function capture(canvas){if(canvas.width!==renderer.domElement.width||canvas.height!==renderer.domElement.height){canvas.width=renderer.domElement.width;canvas.height=renderer.domElement.height;}const ctx=canvas.getContext('2d');ctx.clearRect(0,0,canvas.width,canvas.height);ctx.drawImage(renderer.domElement,0,0);return canvas;}
  Promise.all(Object.entries(files).map(async ([name,file])=>{models.set(name,(await loader.loadAsync(resource(file))).scene);})).then(()=>{ready=true;onReady();}).catch(error=>console.error('城市模型装载失败，保留原地图。',error));
  function release(entry){
    entry.object.removeFromParent();entry.object.traverse(node=>{if(node.isMesh){node.material.dispose();if(node.userData.ownGeometry)node.geometry.dispose();}});
  }
  function build(plot){
    const {id,x,y,w,h,type,status}=plot;
    const pool=type==='housing'?['small','home','wide']:['factory','workshop'];
    let name='hospital',rotation=0,best=Infinity;
    if(type!=='hospital')for(const candidate of pool){
      const size=new THREE.Box3().setFromObject(models.get(candidate)).getSize(new THREE.Vector3());
      for(const turn of [0,1]){const ratio=turn?size.z/size.x:size.x/size.z,score=Math.abs(Math.log(w/h/ratio))+(id%3===pool.indexOf(candidate)?0:.06);if(score<best){best=score;name=candidate;rotation=turn*Math.PI/2;}}
    }
    if(type==='hospital'&&status==='ruin')name='hospitalRuined';
    const object=new THREE.Group(),model=models.get(name).clone(true);object.add(model);model.rotation.y=rotation;
    model.traverse(node=>{if(node.isMesh){node.material=node.material.clone();node.material.roughness=.95;node.castShadow=true;node.receiveShadow=true;}});
    object.updateMatrixWorld(true);
    const bounds=new THREE.Box3().setFromObject(object),size=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3());
    const scale=Math.min((w-.16)/size.x,(h-.16)/size.z);model.scale.setScalar(scale);model.position.set(-center.x*scale,-bounds.min.y*scale,-center.z*scale);
    object.position.set(x+w/2,0,y+h/2);buildings.add(object);
    if(status==='ruin'&&type!=='hospital')damageBuilding(object);
    if(status==='building')operatingLights(object);
    return {object,signature:`${type}:${status}:${w}:${h}`,roof:new THREE.Box3().setFromObject(object).max.y};
  }
  return {
    has(id){return ready&&entries.has(id);},
    hasFacility(id){return ready&&props.has(id);},
    effectsFrame(){return ready?effectCanvas:null;},
    roofAt(id,x,y){
      const entry=entries.get(id);if(!entry)return 0;
      entry.object.updateMatrixWorld(true);const ray=new THREE.Raycaster(new THREE.Vector3(x,entry.roof+1,y),new THREE.Vector3(0,-1,0));
      return ray.intersectObject(entry.object,true)[0]?.point.y??entry.roof;
    },
    render(plots,{width,height,panX,panY,cell,cellMeters,night,layout,lamps=[],fx}){
      if(!ready)return null;
      const active=new Set(plots.map(p=>p.id));
      for(const [id,entry] of entries)if(!active.has(id)){release(entry);entries.delete(id);}
      for(const plot of plots){
        const signature=`${plot.type}:${plot.status}:${plot.w}:${plot.h}`;
        if(entries.get(plot.id)?.signature!==signature){if(entries.has(plot.id))release(entries.get(plot.id));entries.set(plot.id,build(plot));}
        entries.get(plot.id).object.traverse(node=>{if(node.userData.cityRoofLights)node.visible=plot.powered&&night>0;if(node.isMesh){if(node.material.userData.cityPower)node.material.userData.cityPower.value=plot.powered?night:0;if(node.parent?.userData.cityRoofLights)node.material.opacity=plot.powered?night*(node.material.map?.28:1):0;}});
      }
      if(layout&&roadLayout!==layout){
        if(terrain){terrain.removeFromParent();terrain.geometry.dispose();terrain.material.map.dispose();terrain.material.dispose();}
        const canvas=document.createElement('canvas');canvas.width=layout.width*16;canvas.height=layout.height*16;const ctx=canvas.getContext('2d');ctx.scale(16,16);ctx.fillStyle='#697b70';ctx.fillRect(0,0,layout.width,layout.height);
        for(let y=0;y<layout.height;y++)for(let x=0;x<layout.width;x++)if(layout.tiles[y*layout.width+x]==='road')drawRoadTexture(ctx,layout,x,y,0);
        const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
        terrain=new THREE.Mesh(new THREE.PlaneGeometry(layout.width,layout.height),new THREE.MeshStandardMaterial({map:texture,roughness:.95}));terrain.rotation.x=-Math.PI/2;terrain.position.set(layout.width/2,-.015,layout.height/2);terrain.receiveShadow=true;scene.add(terrain);roadLayout=layout;
      }
      const nextStreets=cellMeters+JSON.stringify(lamps),streetLights=[];
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
        streetKey=nextStreets;
      }
      // 只启用镜头附近路灯的真实光源；远景保留灯具与光池，灯不投独立阴影。
      const reach=22/cellMeters,nearby=streetLights.filter(p=>p.x>=-panX/cell-reach&&p.x<=(width-panX)/cell+reach&&p.y>=-panY/cell-reach&&p.y<=(height-panY)/cell+reach);
      while(localLights.length<nearby.length){const light=new THREE.PointLight('#ffd08a',0,reach,2);scene.add(light);localLights.push(light);}
      localLights.forEach((light,i)=>{light.visible=i<nearby.length&&night>0;light.distance=reach;light.intensity=i<nearby.length?night*1.7*(20/cellMeters)**2:0;if(i<nearby.length)light.position.set(nearby[i].x,nearby[i].height,nearby[i].y);});
      streets.traverse(node=>{if(node.isMesh){if(node.material.map)node.material.opacity=night*.32;else if(node.material.name==='#ffe1a3'){node.material.emissive.set('#ffb75c');node.material.emissiveIntensity=night*1.8;}}});
      const lightItems=[...fx.sweeps,...fx.fires].map(item=>{const size=new THREE.Box3().setFromObject(models.get(item.asset)).getSize(new THREE.Vector3());return {...item,height:size.y*Math.min(item.w/size.x,item.h/size.z)*(item.asset==='watch'?.84:.65)};});
      effects.updateLights(lightItems,fx.time,night,{left:-panX/cell,right:(width-panX)/cell,top:-panY/cell,bottom:(height-panY)/cell});
      // 静态云纹/悬停刷新复用城市画面；扫光与火光读取同一动效时间重画承光层。
      const shapes=plots.map(p=>`${p.id}:${entries.get(p.id).signature}`).join('|');
      const signature=shapes+plots.map(p=>p.powered?'1':'0').join('')+streetKey+JSON.stringify(lightItems)+`/${width}:${height}:${panX}:${panY}:${cell}:${night}:${lightItems.length?fx.time:0}`;
      if(signature!==lastFrame){
        const dimensions=`${width}:${height}`;if(pixels!==dimensions){renderer.setSize(width,height,false);pixels=dimensions;}
        camera.left=-panX/cell;camera.right=(width-panX)/cell;camera.top=panY/cell;camera.bottom=-(height-panY)/cell;camera.updateProjectionMatrix();
        sky.color.set('#f4f6e2').lerp(new THREE.Color('#b9d7ed'),night);sky.groundColor.set('#809180').lerp(new THREE.Color('#4c676b'),night);sky.intensity=2.4-night*.9;
        sun.color.set('#fff1cd').lerp(new THREE.Color('#b9cfff'),night);sun.intensity=3.2-night*2.3;
        const shadowKey=shapes+streetKey;if(shadowKey!==lastShadow){renderer.shadowMap.needsUpdate=true;lastShadow=shadowKey;}
        buildings.visible=true;facilities.visible=false;streets.visible=true;effects.group.visible=false;if(terrain)terrain.visible=true;renderer.render(scene,camera);capture(cityCanvas);lastFrame=signature;
      }
      return cityCanvas;
    },
    renderFacilities(items,night,fx){
      if(!ready)return null;
      const active=new Set(items.map(p=>p.id));for(const [id,entry] of props)if(!active.has(id)){release(entry);props.delete(id);}
      for(const item of items){
        const shape=`${item.asset}:${item.w}:${item.h}`;
        if(props.get(item.id)?.signature!==shape){
          if(props.has(item.id))release(props.get(item.id));
          const object=new THREE.Group(),model=models.get(item.asset).clone(true);object.add(model);model.traverse(node=>{if(node.isMesh){node.material=node.material.clone();node.material.userData.baseColor=node.material.color.clone();}});object.updateMatrixWorld(true);
          // 灰色炮体与灰屋顶分离；材质名保留，后坐、炮口和弹迹仍读取原节点。
          if(['near','far'].includes(item.asset))model.traverse(node=>{if(node.isMesh){const color=node.material.name==='#6c7775'?'#354b4b':['#3f5057','#1e2b32'].includes(node.material.name)?'#98aaa1':item.asset==='far'?'#c3c5d0':'#a8b7a0';node.material.color.set(color);node.material.userData.baseColor=node.material.color.clone();node.material.emissive.set(color);node.material.emissiveIntensity=.10;}});
          const bounds=new THREE.Box3().setFromObject(model),size=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3());
          const scale=Math.min(item.w/size.x,item.h/size.z);model.scale.setScalar(scale);model.position.set(-center.x*scale,-bounds.min.y*scale,-center.z*scale);
          if(item.asset==='wall'){model.scale.z=item.h/size.z;model.position.z=-center.z*model.scale.z;}
          facilities.add(object);props.set(item.id,{object,signature:shape,motion:facilityMotion(object)});
        }
        const {object}=props.get(item.id);object.position.set(item.x,item.roof??0,item.y);object.scale.y=item.dead?.3:1;
        object.traverse(node=>{if(node.isMesh){node.material.opacity=item.alpha??1;node.material.transparent=node.material.opacity<1;node.material.color.copy(node.material.userData.baseColor).lerp(new THREE.Color('#84867a'),item.dead?.85:(1-(item.health??1))*.5);if(['#ff9538','#ffd36b'].includes(node.material.name))node.visible=!item.dead;}});
        animateFacility(props.get(item.id),item,fx);
      }
      const signature=JSON.stringify(items)+JSON.stringify(fx.shots)+`/${lastFrame}:${night}:${fx.time}`;
      if(signature!==lastProps){
        buildings.visible=false;facilities.visible=true;streets.visible=false;effects.group.visible=false;if(terrain)terrain.visible=false;renderer.render(scene,camera);capture(facilityCanvas);
        effects.updateShots(fx.shots,props,fx.time,fx.cell);facilities.visible=false;effects.group.visible=true;renderer.render(scene,camera);capture(effectCanvas);lastProps=signature;
      }
      return facilityCanvas;
    },
  };
}
