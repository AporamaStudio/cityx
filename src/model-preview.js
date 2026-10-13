import * as THREE from 'three';
import {createZombieCrowds} from './city-enemies.js?v=1';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {addBuildingFoundation} from './city-building-style.js?v=1';
import {createWreckDressing,updateWreckDressing,styleWreckBody,styleVehicleBody} from './city-wrecks.js?v=2';
import {VEHICLE_PALETTE} from './city-streets.js?v=5';
import {createRoadModel} from './city-road-model.js?v=1';
import {createPreviewEffects,groundGlow} from './model-preview-effects.js?v=4';

// 独立选型页：模型、灯光与状态仅用于看效果，不读取或修改原型游戏。
const root='assets/model-preview/',kenney='https://kenney.nl/assets/';
const assets=[
  ['house','双层住宅','building','suburban/building-type-a',4.6,'住房的基础轮廓。屋顶与窗户可承担恢复、亮灯和炮位反馈。'],
  ['house-small','低层住宅','building','suburban/building-type-h',4.2,'低矮、宽屋顶，适合起步城区；近距离和俯视均应清楚。'],
  ['house-wide','连排住宅','building','suburban/building-type-u',4.8,'作为较大住房的体量候选；实际占地需按游戏格子适配。'],
  ['apartment','城市公寓','building','commercial/building-a',3.7,'中等高度建筑，测试斜视时对道路和屋顶炮位的遮挡。'],
  ['shop','商住楼','building','commercial/building-d',3.9,'作为商业经营外观候选，不意味着新增一种经营机制。'],
  ['landmark','中型商业楼','building','commercial/building-j',5.1,'通用中型商业建筑，用于与医院、银行对比体量。'],
  ['hospital','医院园区','building','hospital',12,'10×12格：中央门诊、两栋病房楼、急诊与配套连廊；庭院仅作构图，仍是一个医院对象。'],
  ['bank','大型银行','building','bank',8,'8×8格选型体量：单体大楼、中央退台屋顶与银行徽记；地图位置和银行玩法尚未接入。'],
  ['factory','生产厂房','building','industrial/building-a',4.8,'平屋顶与厂房体量适合生产地块，保留清楚的临街边缘。'],
  ['workshop','工业车间','building','industrial/building-f',4.7,'经营建筑的第二种外观候选，先观察烟囱与屋顶是否过于杂乱。'],
  ['tree','街道树','nature','suburban/tree-large',.9,'少量点缀恢复后的街区，不能挡住道路和建设提示。'],
  ['tree-small','小树','nature','suburban/tree-small',.7,'用于院落、公园边缘和高度对比，暂不增加环境模拟。'],
  ['tree-broad','宽冠阔叶树','nature','tree-broad',3.5,'原生约6.6m树冠/8m高；空地边缘少量树群，纯装饰，不阻路。'],
  ['tree-column','窄冠乔木','nature','tree-column',2.8,'原生约3.6m树冠/10m高，修长轮廓与宽冠树区分。'],
  ['tree-young','幼树','nature','tree-young',2.5,'原生约2.9m树冠/4.5m高，用于树群外围和小空地。'],
  ['bush-round','圆形灌木','nature','bush-round',3.2,'原生约2.7m宽/1.3m高，低矮圆冠和少量浅绿层次。'],
  ['bush-wild','矮灌丛与草','nature','bush-wild',3,'原生约2.2m宽/0.8m高，不规则灌丛及草叶，保留开阔地面。'],
  ['tree-dead','枯树','nature','tree-dead',2.6,'原生约3.2m宽/6m高，少量灰褐枝干；控制扩张不会自动长叶。'],
  ['watchtower','瞭望塔','facility','watchtower',2.1,'自制木架样件，夜间探照灯缓慢扫过地面；扫光只演示气氛。'],
  ['cannon-near','近防炮','facility','cannon-near',1.25,'短双管、短促连发与轻后坐；点击试射查看，不进行实际战斗。'],
  ['cannon-long','远防炮','facility','cannon-long',1.65,'长双管、单次较强闪光与后坐；可暂停后点击试射检查。'],
  ['brick-wall','墙体','facility','brick-wall',2.5,'自制砖墙段，便于后续表现连续墙、破损及拆除。'],
  ['wall-gate','闭合墙门','facility','wall-gate',6,'20m墙段中央4m净口，两扇门；仅模型样件，未新增门通行或受击规则。'],
  ['wall-gate-open','敞开墙门','facility','wall-gate-open',6,'与闭合门共用墙段和立柱，两扇门向内打开；通行和开关玩法仍待确定。'],
  ['wall-gate-ruined','破损墙门','facility','wall-gate-ruined',6,'保留原墙段与门柱，门扇倒落、断梁和瓦砾；与完好门保持同一身份。'],
  ['courtyard-entry','文明入口','nature','courtyard-entry',4,'约5.8m宽/3.1m高的开放门柱，区别于防线墙门；仅装饰候选。'],
  ['campfire','篝火','facility','campfire',1.9,'木柴、石圈与缓慢跳动的火焰，夜间暖光轻微闪动。'],
  ['camp-plaza','篝火广场','nature','camp-plaza',6,'主地图3×3格营地广场，默认60×60m；铺装、长椅与花池只作装饰，火堆独立适配，不增加阻挡。'],
  ['enemy-squad','僵尸群体','facility','enemy-squad',8,'1.65–1.9m人物、四种旧衣色、松散队形与摇晃步态；模型仅表示原敌群，HP和合流规则不变。'],
  ['ruins','废墟样件','building','ruins',4.7,'自制断墙与瓦砾，只验证破损感觉；正式恢复应沿用同一栋建筑轮廓。'],
  ['enemy-source','敌源样件','facility','enemy-source',1.9,'自制暗色核心与暖红标识，先区分敌我；敌源最终造型尚未确定。'],
  ['enemy-source-ruined','敌源残骸','facility','enemy-source-ruined',1.9,'沿用同一底座与破损核心，主图读取已肃清状态；不改变源头出兵、揭雾或通行规则。'],
  ['streetlight','路灯','nature','streetlight',1.2,'同一盏灯白天不发光，恢复运营的街区夜晚亮灯。'],
  ['trash','垃圾堆','nature','trash',1.4,'废弃街区的杂物；恢复后清走，先验证清理带来的变化。'],
  ['rubble','瓦砾','nature','rubble',2,'附着原建筑的塌损位置，帮助关联废墟与完好状态。'],
  ['street-bench','路缘长椅','nature','street-bench',3.3,'约2.2m长/0.7m深/1.17m高，运营街区少量布置；仅装饰，不增加交互。'],
  ['street-planter','文明花池','nature','street-planter',2.2,'约1.6m见方/1.5m高的小花池，和垃圾/瓦砾形成恢复前后对比。'],
  ['civil-car','完好车辆','nature','civil-car',2.7,'约4.6m长/2.4m宽/1.85m高；主图已修缮且受控街区旁静态停靠，五种低饱和车色，不增加交通。'],
  ['damaged-car','损坏车辆','nature','damaged-car',2.7,'与完好车同车身和轮位，车顶塌陷、破窗、断保险杠；没有火焰或烟，混合放在已知废墟旁。'],
  ['burnt-car','燃烧车辆','nature','burnt-car',2.7,'焦黑车身与少量火焰表现灾损，作为恢复前的局部视觉样件。']
].map(([id,name,category,file,width,description])=>({id,name,category,file,width,description,local:!file.includes('/'),paired:category==='building'&&file.includes('/'),landmark:['hospital','bank'].includes(id)}));
const $=id=>document.getElementById(id),models=new Map(),district=new THREE.Group(),single=new THREE.Group(),roads=new THREE.Group();
const wreckDressing=new Map(),previewCrowds=new Map();
let vehiclePaint=VEHICLE_PALETTE[0];
let selected=assets[0],mode='district',night=false,restored=false,angle='angle',ready=false,singleState='intact',singleVariants=null,effects=null;
const motionPreference=matchMedia('(prefers-reduced-motion: reduce)');let animated=!motionPreference.matches;
const scene=new THREE.Scene(),camera=new THREE.OrthographicCamera(-25,25,20,-20,.1,250);
const renderer=new THREE.WebGLRenderer({antialias:true,alpha:false});
renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
renderer.shadowMap.autoUpdate=false;
renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.05;
$('viewer').prepend(renderer.domElement);
const controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=false;controls.minZoom=.45;controls.maxZoom=4;
controls.maxPolarAngle=Math.PI*.48;controls.addEventListener('change',render);
const sky=new THREE.HemisphereLight('#f4f6e2','#809180',2.4),sun=new THREE.DirectionalLight('#fff1cd',3.2);
sun.position.set(-16,28,12);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);
Object.assign(sun.shadow.camera,{left:-38,right:38,top:38,bottom:-38,near:1,far:100});sun.shadow.bias=-.00025;sun.shadow.normalBias=.03;
const fireLight=new THREE.PointLight('#ffb860',22,13,2);fireLight.position.set(4,2.2,0);
const wreckLight=new THREE.PointLight('#ff9a49',9,6,2);wreckLight.position.set(-8,1.1,-.8);
scene.add(sky,sun,fireLight,wreckLight,district,single,roads);
effects=createPreviewEffects({isNight:()=>night,view:()=>({pixelsPerUnit:renderer.domElement.height/renderer.getPixelRatio()/(camera.top-camera.bottom)*camera.zoom}),render:time=>{
  for(const {crowd,item} of previewCrowds.values())crowd.update([item],{time,enemyFiguresPerGroup:8,reducedMotion:!animated});
  fireLight.intensity=22*(1+.12*Math.sin(time*8.7)+.05*Math.sin(time*13));
  wreckLight.intensity=9*(1+.16*Math.sin(time*9.1+2));for(const entry of wreckDressing.values())updateWreckDressing(entry,time,night,!animated);renderer.render(scene,camera);
}});
const structures=[],streetlights=[],abandoned=[],civilDecor=[],roadLights=[],roadRuins=[],roadCivil=[];
const palette={stone:'#c5c5b0',grass:'#a7b491',road:'#68736e',brick:'#7f9180'};
function box(parent,x,y,z,w,h,d,color){
  const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),new THREE.MeshStandardMaterial({color,roughness:.95}));
  mesh.position.set(x,y,z);mesh.receiveShadow=true;parent.add(mesh);return mesh;
}
function render(){effects?.update();renderer.shadowMap.needsUpdate=true;renderer.render(scene,camera);}
function resize(){
  const {width,height}=$('viewer').getBoundingClientRect();renderer.setSize(width,height,false);
  const aspect=width/height,frame=mode==='roads'?96:mode==='district'?68:selected.landmark?selected.width*1.85:selected.id.startsWith('cannon-')?6.2:['campfire','burnt-car','streetlight'].includes(selected.id)?8:11,half=Math.max(frame*.34,frame/aspect/2);
  camera.left=-half*aspect;camera.right=half*aspect;camera.top=half;camera.bottom=-half;camera.updateProjectionMatrix();render();
}
function frame(){
  const target=new THREE.Vector3(0,mode!=='single'?1:(singleVariants?.normal.userData.previewModelHeight??3.4)/2,mode==='district'?-7:0),offset=angle==='top'?new THREE.Vector3(0,45,.01):new THREE.Vector3(32,34,40);
  controls.target.copy(target);camera.position.copy(target).add(offset);camera.zoom=1;camera.updateProjectionMatrix();controls.update();resize();
}
function cloneModel(asset,width=asset.width,roofLights=true,ruined=false){
  if(asset.id==='enemy-squad'){
    const anchor=new THREE.Group(),crowd=createZombieCrowds(anchor,32);anchor.userData.previewModelHeight=1.9;
    previewCrowds.set(anchor,{crowd,item:{id:'preview',x:0,y:0,cellMeters:8/width,members:1,health:1,moving:true,angle:0}});return anchor;
  }
  const group=models.get(asset.id+(ruined?'-ruined':'')).clone(true),bounds=new THREE.Box3().setFromObject(group),size=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3());
  const scale=width/Math.max(size.x,size.z);group.scale.setScalar(scale);
  group.position.set(-center.x*scale,-bounds.min.y*scale,-center.z*scale);
  const anchor=new THREE.Group();anchor.userData.previewModelHeight=size.y*scale;anchor.add(group);anchor.updateMatrixWorld(true);
  group.traverse(node=>{if(node.isMesh){node.castShadow=true;node.receiveShadow=true;node.material=node.material.clone();
    if(asset.landmark){
      // 专用建筑明确指定玻璃/灯具材质；同一GLB昼夜共用，墙面不参与发光。
      if(['#587a91','#ffe1a3'].includes(node.material.name)){node.material.userData.previewLamp=true;node.material.emissive.set('#ffb75c');node.material.emissiveIntensity=0;}
    }else if(isBuilding(asset)){node.geometry=node.geometry.index?node.geometry.toNonIndexed():node.geometry.clone();node.userData.previewGeometry=true;windowMaterial(node.material,node.geometry,node.matrixWorld,size.y*scale);}
  }});
  if(asset.landmark&&!ruined){
    // GLB保留灯位，局部屋顶光晕与入口真实光源随夜间运营开关一起变化。
    const lighting=new THREE.Group();lighting.userData.previewRoofLights=true;lighting.visible=false;
    group.traverse(node=>{
      for(const [x,y,z,w,d] of node.userData.roofLights??[]){const glow=groundGlow(w*2.0,d*2.8,'#ffc57d',.3);glow.position.set(x,y,z);lighting.add(glow);}
      for(const [x,y,z,power,range] of node.userData.entryLights??[]){const light=new THREE.PointLight('#ffd08a',power*scale**2,range*scale,2);light.position.set(x,y,z);lighting.add(light);const pool=groundGlow(12,18,'#ffca72',.25);pool.position.set(x,.9,z);lighting.add(pool);}
    });
    group.add(lighting);
  }
  if(roofLights&&isBuilding(asset)&&!asset.landmark)addRoofLights(anchor);
  if(['civil-car','damaged-car'].includes(asset.id))styleVehicleBody(anchor,vehiclePaint,asset.id==='damaged-car');
  if(asset.id==='burnt-car'){styleWreckBody(anchor,vehiclePaint);wreckDressing.set(anchor,createWreckDressing(anchor,size.x*scale,size.z*scale));}
  effects.attach(asset.id,anchor);
  return anchor;
}
function isBuilding(asset){return asset.category==='building'&&(!asset.local||asset.landmark);}
function addRoofLights(object){
  // 在真实屋顶表面放少量暖色天窗/檐口灯，俯视仍可辨认运营状态。
  object.updateWorldMatrix(true,true);
  const bounds=new THREE.Box3().setFromObject(object),size=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3());
  const group=new THREE.Group();group.userData.previewRoofLights=true;group.visible=false;
  const ray=new THREE.Raycaster(),down=new THREE.Vector3(0,-1,0),normal=new THREE.Vector3(),inverse=object.matrixWorld.clone().invert();
  for(const [dx,dz] of [[-.22,-.18],[.22,-.18],[-.22,.18],[.22,.18]]){
    ray.set(new THREE.Vector3(center.x+size.x*dx,bounds.max.y+1,center.z+size.z*dz),down);
    const hit=ray.intersectObject(object,true)[0];
    if(!hit||hit.point.y<bounds.min.y+size.y*.38)continue;
    normal.copy(hit.face.normal).transformDirection(hit.object.matrixWorld).transformDirection(inverse);
    if(normal.y<.28)continue;
    const point=object.worldToLocal(hit.point.clone()),lamp=new THREE.Mesh(new THREE.PlaneGeometry(size.x*.11,size.z*.07),new THREE.MeshBasicMaterial({color:'#ffd28a',toneMapped:false}));
    lamp.userData.previewGeometry=true;lamp.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),normal);lamp.position.copy(point).addScaledVector(normal,.028);
    const halo=groundGlow(size.x*.28,size.z*.24,'#ffc174',.28);halo.quaternion.copy(lamp.quaternion);halo.position.copy(point).addScaledVector(normal,.04);
    group.add(lamp,halo);
  }
  object.add(group);
}
function windowMaterial(material,geometry,matrix,height){
  // 从同一张色板识别蓝色玻璃，只增加发光，不制作一套夜间贴图。
  const positions=geometry.attributes.position,index=geometry.index,mask=new Float32Array(positions.count);
  const minHeight=height*.035,p=new THREE.Vector3();
  for(let i=0;i<(index?index.count:positions.count);i+=3){
    const ids=[0,1,2].map(j=>index?index.getX(i+j):i+j),ys=ids.map(id=>p.fromBufferAttribute(positions,id).applyMatrix4(matrix).y);
    // 排除水平屋顶与很薄的楼层装饰条，避免蓝色线脚也亮灯。
    if(Math.max(...ys)-Math.min(...ys)>minHeight)for(const id of ids)mask[id]=1;
  }
  geometry.setAttribute('previewWindowMask',new THREE.BufferAttribute(mask,1));
  material.userData.previewPower={value:0};
  material.onBeforeCompile=shader=>{
    shader.uniforms.previewWindowPower=material.userData.previewPower;
    shader.vertexShader='attribute float previewWindowMask;\nvarying float previewWindowSurface;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\npreviewWindowSurface=previewWindowMask;');
    shader.fragmentShader='uniform float previewWindowPower;\nvarying float previewWindowSurface;\n'+shader.fragmentShader.replace('#include <emissivemap_fragment>',`#include <emissivemap_fragment>
      float previewGlass=step(diffuseColor.r*1.8,diffuseColor.b)*step(diffuseColor.g*1.25,diffuseColor.b)*step(.1,diffuseColor.b)*previewWindowSurface;
      totalEmissiveRadiance+=vec3(1.0,.54,.18)*previewGlass*previewWindowPower*1.1;`);
  };
  material.customProgramCacheKey=()=> 'cityx-preview-windows';
}
function setPower(object,powered){
  object.traverse(node=>{if(node.userData.previewRoofLights)node.visible=night&&powered;if(node.isMesh){
    const uniform=node.material.userData.previewPower;if(uniform)uniform.value=night&&powered?1:0;
    if(node.material.userData.previewLamp||node.material.name==='#ffe1a3')node.material.emissiveIntensity=night&&powered?(node.material.userData.previewLamp?1.0:1.8):0;
  }});
}
function ruinedModel(asset,width=asset.width){
  // 每栋普通楼与特殊楼都有固定破损GLB，保留原占地、UV和门窗；不再运行时切楼。
  const object=cloneModel(asset,width,false,true);
  if(!asset.landmark)object.traverse(node=>{if(!node.isMesh||!node.material.map)return;node.material.color.set('#a29c87');node.material.roughness=1;
    node.material.onBeforeCompile=shader=>{shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>','#include <map_fragment>\ndiffuseColor.rgb=mix(diffuseColor.rgb,vec3(dot(diffuseColor.rgb,vec3(.2126,.7152,.0722))),.82);');};
    node.material.customProgramCacheKey=()=> 'cityx-preview-ruins';
  });
  return object;
}
function place(id,x,z,width,y=.14){
  const obj=cloneModel(assets.find(a=>a.id===id),width);obj.position.set(x,y,z);district.add(obj);return obj;
}
function buildDistrict(){
  // 一小片城市样景，仅拼已有模型；道路/灯光是预览装饰，不接入玩法。
  box(district,0,-.42,-8,35,.7,43,'#869b83');box(district,0,-.04,-8,34,.12,42,palette.grass);
  for(const x of [-8,0,8])box(district,x,.02,0,1.7,.06,26,palette.road);
  for(const z of [-4,4])box(district,0,.02,z,34,.06,1.7,palette.road);
  for(const x of [-8,0,8])for(let z=-12;z<=12;z+=1.5)box(district,x,.055,z,.09,.01,.6,'#c1c8b2');
  for(const z of [-4,4])for(let x=-16;x<=16;x+=1.5)box(district,x,.055,z,.6,.01,.09,'#c1c8b2');
  // 后排大地块与普通街区同框比较体量；不调整可玩地图的生成器。
  for(const z of [-13,-28])box(district,0,.02,z,34,.06,1.3,palette.road);
  box(district,0,.02,-20,1.7,.06,15,palette.road);
  const lots=[['house-small',-12,8],['house',-4,8],['factory',4,8],['house-wide',12,8],['apartment',-12,0],['shop',-4,0],['house',12,0],['house-wide',-12,-8],['apartment',-4,-8],['workshop',4,-8],['landmark',12,-8]];
  for(const [id,x,z] of lots){
    const base=new THREE.Group();base.position.set(x,0,z);addBuildingFoundation(base,{w:6.2,h:5.7,height:.13,cellMeters:6,housing:id.startsWith('house'),ruined:false});district.add(base);
    const ruinBase=new THREE.Group();ruinBase.position.copy(base.position);addBuildingFoundation(ruinBase,{w:6.2,h:5.7,height:.13,cellMeters:6,housing:id.startsWith('house'),ruined:true});district.add(ruinBase);
    const obj=place(id,x,z);structures.push({obj,x,z,id,base,ruinBase,front:z>=0});
    for(const [dx,dz] of [[-2.7,2.2],[2.65,2.3]])place('tree-small',x+dx,z+dz,.7);
  }
  for(const [id,x,z,width] of [['hospital',-8,-20,12],['bank',10,-21,8]]){
    const obj=place(id,x,z,width);structures.push({obj,x,z,id,front:true});
  }
  for(const [id,x,z,w] of [['tree-broad',-15,-15,1.1],['tree-column',-13.5,-16,.7],['tree-young',-15,-17,.6],['bush-round',-12.5,-16,.55],['bush-wild',-13,-14.5,.5],['tree-dead',-15.5,-19,.6]])place(id,x,z,w);
  place('campfire',4,0,2.2);place('watchtower',-1.7,5.5,1.7);place('watchtower',14,3,1.6);
  const factory=structures.find(s=>s.id==='factory'),roof=new THREE.Box3().setFromObject(factory.obj).max.y;
  place('cannon-long',3.6,7.7,1.3,roof+.04);place('cannon-near',11.8,8,1.15,new THREE.Box3().setFromObject(structures.find(s=>s.id==='house-wide'&&s.front).obj).max.y+.03);
  for(const x of [-6,-3,.1])place('brick-wall',x,3,2.3);
  place('enemy-source',12,-11,1.5);
  for(const [x,z] of [[-9,3],[1,3],[9,3],[-9,9],[9,9]]){
    const obj=place('streetlight',x,z,.95),bounds=new THREE.Box3().setFromObject(obj),light=new THREE.PointLight('#ffd08a',62,8,2);
    const pool=groundGlow(2.5,7,'#ffca72',.42);pool.position.set(Math.round(x/8)*8,.075,z);
    light.position.set(x+.3,bounds.max.y-.14,z);district.add(light,pool);streetlights.push({obj,light,pool});
  }
  for(const [id,x,z,w] of [['trash',-5,2,1.1],['trash',10,2.5,1],['burnt-car',-8,-.8,2.5],['damaged-car',-6.7,8,2.5],['rubble',11,1.8,1.6]])abandoned.push(place(id,x,z,w));
  for(const [id,x,z,w] of [['street-bench',-9.0,6,1.2],['street-planter',1,1.8,.7],['civil-car',-8,-.8,2.5],['civil-car',-6.7,8,2.5]])civilDecor.push(place(id,x,z,w));
  const rim=new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints([[-16,.16,-3],[-9,.16,-3],[-9,.16,-1],[-1,.16,-1],[-1,.16,2],[7,.16,2],[7,.16,-2],[16,.16,-2],[16,.16,11],[-16,.16,11]].map(p=>new THREE.Vector3(...p))),new THREE.LineBasicMaterial({color:'#66b6ae'}));district.add(rim);
  // 演示恢复时只改变状态，不将控制与运营视为同一个条件。
  for(const s of structures){
    s.ruins=ruinedModel(assets.find(a=>a.id===s.id));s.ruins.position.copy(s.obj.position);s.ruins.visible=false;district.add(s.ruins);
  }
  updateRestore();
}
// 道路样景与主图共用米制构件；用1:2演示尺度，车辆/灯杆同步换算。
function buildRoadPreview(){
  const layout={width:8,height:8,tiles:Array(64).fill('block')};
  for(let y=0;y<8;y++)for(let x=0;x<8;x++)if(x===1||x===5||x===6||y===3||y===4)layout.tiles[y*8+x]='road';
  const model=createRoadModel(layout,20);model.scale.setScalar(10);model.position.set(-40,0,-40);roads.add(model);
  box(roads,0,-.12,0,80,.15,80,'#788673');
  const place=(id,x,z,meters)=>{const obj=cloneModel(assets.find(a=>a.id===id),meters/2,false);obj.position.set(x,0,z);roads.add(obj);return obj;};
  roadRuins.push(place('burnt-car',-23,13,4.6),place('trash',-25,21,2.4));
  for(const [i,x,z] of [[0,-23,13],[1,13.1,18],[2,26.9,26]]){
    const normal=place('civil-car',x,z,4.6);styleVehicleBody(normal,VEHICLE_PALETTE[i]);roadCivil.push(normal);
    if(i){const damaged=place('damaged-car',x,z,4.6);styleVehicleBody(damaged,VEHICLE_PALETTE[i],true);roadRuins.push(damaged);}
  }
  roadCivil.push(place('street-bench',-28,24,2.2),place('street-planter',-27,18,1.6));
  for(const [x,z] of [[-29,-16],[-21,19],[11,-18],[29,21]]){
    const source=models.get('streetlight'),bounds=new THREE.Box3().setFromObject(source),size=bounds.getSize(new THREE.Vector3());
    const obj=place('streetlight',x,z,7.5*Math.max(size.x,size.z)/size.y);obj.rotation.y=x<0?Math.PI/2:-Math.PI/2;
    const light=new THREE.PointLight('#ffd08a',10,12,2);light.position.set(x,3.75,z);roads.add(light);
    const pool=groundGlow(9,14,'#ffca72',.32);pool.position.set(x,.13,z);roads.add(pool);roadLights.push({obj,light,pool});
  }
  updateRestore();
}
function updateRestore(){
  for(const s of structures){
    const damaged=!restored&&s.front&&['house','shop','apartment','hospital','bank'].includes(s.id);s.obj.visible=!damaged;s.ruins.visible=damaged;if(s.base){s.base.visible=!damaged;s.ruinBase.visible=damaged;}
    s.obj.traverse(node=>{if(node.isMesh&&node.material.userData.previewPower){node.material.color.set(restored||s.front?'#ffffff':'#9ba7a0');}});
    setPower(s.obj,restored&&s.front);
  }
  for(const lamp of streetlights){setPower(lamp.obj,restored);lamp.light.visible=lamp.pool.visible=night&&restored;}
  for(const prop of abandoned)prop.visible=!restored;for(const prop of civilDecor){prop.visible=restored;setPower(prop,true);}
  for(const entry of roadLights){setPower(entry.obj,restored);entry.light.visible=entry.pool.visible=night&&restored;}
  roadRuins.forEach(obj=>obj.visible=!restored);roadCivil.forEach(obj=>obj.visible=restored);
  wreckLight.visible=mode==='district'&&!restored;
  updateSingleState();
  $('restore').textContent=restored?'查看恢复前':'查看恢复后';render();
}
function updateSingleState(){
  if(!singleVariants)return;
  singleVariants.normal.visible=singleState!=='ruined'||!singleVariants.ruined;
  if(singleVariants.ruined)singleVariants.ruined.visible=singleState==='ruined';
  setPower(singleVariants.normal,isBuilding(selected)?singleState==='operating':true);
  for(const button of document.querySelectorAll('[data-state]'))button.classList.toggle('active',button.dataset.state===singleState);
  if(selected.landmark||selected.paired){$('download').href=root+(selected.local?'generated/':'kenney/')+selected.file+(singleState==='ruined'?'-ruined':'')+'.glb?v=6';$('download').textContent=singleState==='ruined'?'下载破损模型 ↓':'下载完好模型 ↓';}
  if(mode==='single')$('sceneSubtitle').textContent=isBuilding(selected)?({intact:'完好 · 尚未运营',ruined:'原建筑局部塌损 · 占地与门窗保留',operating:'恢复运营 · 窗户与屋顶亮灯'})[singleState]:(selected.local?'CityX 自制 low poly 样件':'Kenney 城市系列 · CC0');
}
function setMode(next){
  mode=next;$('modelSelection').hidden=mode==='roads';$('roadDetails').hidden=mode!=='roads';district.visible=mode==='district';single.visible=mode==='single';roads.visible=mode==='roads';$('roads').classList.toggle('active',mode==='roads');$('district').classList.toggle('active',mode==='district');$('single').classList.toggle('active',mode==='single');$('restore').hidden=mode==='single';
  $('sceneTitle').textContent=mode==='roads'?'20米街道 × 40米主路':mode==='district'?'一片恢复中的城区':selected.name;
  $('sceneSubtitle').textContent=mode==='roads'?'同一米制构件 · 路口连接 · 昼夜与运营对比':mode==='district'?'住宅 · 经营建筑 · 前线设施':selected.local?'CityX 自制 low poly 样件':'Kenney 城市系列 · CC0';
  fireLight.visible=night&&mode==='district';wreckLight.visible=mode==='district'&&!restored;updateSingleState();frame();
  $('fireShot').hidden=mode==='roads'||mode!=='district'&&!selected.id.startsWith('cannon-');
}
function selectAsset(asset,show=true){
  selected=asset;
  if(singleVariants){effects.remove(singleVariants.normal);wreckDressing.delete(singleVariants.normal);previewCrowds.delete(singleVariants.normal);}
  single.traverse(node=>{if(node.isMesh||node.isLine||node.isSprite){node.material.dispose();if(node.userData.previewGeometry)node.geometry.dispose();}});single.clear();
  const width=asset.landmark||asset.id==='enemy-squad'?asset.width:Math.min(asset.width,4.8),normal=cloneModel(asset,width),ruined=isBuilding(asset)?ruinedModel(asset,width):null;
  single.add(normal);if(ruined)single.add(ruined);singleVariants={normal,ruined};
  $('vehicleColors').hidden=!['civil-car','damaged-car','burnt-car'].includes(asset.id);
  $('buildingStates').hidden=!isBuilding(asset);updateSingleState();
  $('assetTitle').textContent=asset.name;$('assetOrigin').textContent=asset.local?'自制样件':'Kenney · CC0';$('assetDescription').textContent=asset.description;
  const path=root+(asset.local?'generated/':'kenney/')+asset.file+'.glb?v=6';$('download').href=path;$('download').textContent='下载原模型 ↓';
  $('source').href=asset.local?'assets/model-preview/ATTRIBUTION.md':kenney+({suburban:'city-kit-suburban',commercial:'city-kit-commercial',industrial:'city-kit-industrial'}[asset.file.split('/')[0]]);
  for(const btn of $('catalog').children)btn.classList.toggle('selected',btn.dataset.id===asset.id);
  if(show)setMode('single');else updateSingleState();
}
function catalog(filter='all'){
  $('catalog').replaceChildren();
  for(const a of assets.filter(a=>filter==='all'||a.category===filter)){
    const btn=document.createElement('button');btn.type='button';btn.className='asset';btn.dataset.id=a.id;
    if(!a.local){const img=document.createElement('img');img.src=root+'kenney/'+a.file+'.png';img.alt='';btn.append(img);}
    else{const icon=document.createElement('span');icon.className='symbol';icon.textContent=({'tree-broad':'♣','tree-column':'♠','tree-young':'♧','bush-round':'●','bush-wild':'♒','tree-dead':'♱','hospital':'✚','bank':'▥','watchtower':'♜','cannon-near':'Ⅱ','cannon-long':'⇈','brick-wall':'▦','wall-gate':'▥','wall-gate-open':'Ⅱ','wall-gate-ruined':'⋈','courtyard-entry':'∩','camp-plaza':'▤','enemy-squad':'♟','enemy-source-ruined':'◇','campfire':'♨','ruins':'◩','enemy-source':'◆','streetlight':'♧','trash':'▣','rubble':'▱','burnt-car':'▰','street-bench':'▰','street-planter':'♧','civil-car':'▱','damaged-car':'◩'})[a.id];btn.append(icon);}
    const label=document.createElement('span'),name=document.createElement('b'),origin=document.createElement('small');name.textContent=a.name;origin.textContent=a.local?'自制样件':'Kenney';label.append(name,origin);btn.append(label);
    btn.disabled=!ready;btn.classList.toggle('selected',a.id===selected.id);btn.addEventListener('click',()=>selectAsset(a));$('catalog').append(btn);
  }
}
function setLight(){
  document.body.classList.toggle('night',night);scene.background=new THREE.Color(night?'#233840':'#e8eddf');
  sky.color.set(night?'#b9d7ed':'#f4f6e2');sky.groundColor.set(night?'#4c676b':'#809180');sky.intensity=night?1.5:2.4;
  sun.color.set(night?'#b9cfff':'#fff1cd');sun.intensity=night?.9:3.2;fireLight.visible=night&&mode==='district';
  $('light').textContent=night?'切换白天':'切换夜晚';updateRestore();render();
}
$('roads').addEventListener('click',()=>{if(ready)setMode('roads');});
$('district').addEventListener('click',()=>{if(ready)setMode('district');});$('single').addEventListener('click',()=>{if(ready)setMode('single');});
for(const id of ['angle','top'])$(id).addEventListener('click',()=>{angle=id;for(const other of ['angle','top'])$(other).classList.toggle('active',other===id);frame();});
$('light').addEventListener('click',()=>{night=!night;setLight();});$('restore').addEventListener('click',()=>{restored=!restored;updateRestore();});$('reset').addEventListener('click',frame);
$('fireShot').addEventListener('click',()=>effects.fire());
function syncMotion(){
  $('motion').textContent=animated?'暂停动效':'开启动效';$('motion').setAttribute('aria-pressed',String(animated));
  effects.setEnabled(ready&&animated);render();
}
$('motion').addEventListener('click',()=>{animated=!animated;syncMotion();});
motionPreference.addEventListener('change',event=>{animated=!event.matches;syncMotion();});
for(const button of document.querySelectorAll('[data-state]'))button.addEventListener('click',()=>{singleState=button.dataset.state;updateSingleState();if(ready)setMode('single');});
for(const button of document.querySelectorAll('[data-filter]'))button.addEventListener('click',()=>{for(const b of document.querySelectorAll('[data-filter]'))b.classList.toggle('active',b===button);catalog(button.dataset.filter);});
for(const [index,color] of VEHICLE_PALETTE.entries()){
  const button=document.createElement('button');button.type='button';button.style.background=color;button.setAttribute('aria-label',['灰蓝车辆','米白车辆','砖红车辆','灰绿车辆','银灰车辆'][index]);button.dataset.paint=color;button.textContent='●';button.addEventListener('click',()=>{vehiclePaint=color;selectAsset(selected);});$('vehicleColors').append(button);
}
new ResizeObserver(resize).observe($('viewer'));catalog();setLight();frame();
const loader=new GLTFLoader();let loaded=0;
try{
  const files=assets.flatMap(asset=>[{asset,id:asset.id,file:asset.file},...(asset.landmark||asset.paired?[{asset,id:asset.id+'-ruined',file:asset.file+'-ruined'}]:[])]);
  await Promise.all(files.map(async ({asset,id,file})=>{
    const url=root+(asset.local?'generated/':'kenney/')+file+'.glb?v=6';const gltf=await loader.loadAsync(url);models.set(id,gltf.scene);
    loaded++;$('loading').textContent=`正在装载模型… ${loaded}/${files.length}`;
  }));
  ready=true;buildDistrict();buildRoadPreview();selectAsset(selected,false);catalog();setMode('district');syncMotion();$('loading').hidden=true;$('loadStatus').textContent=`${assets.length} 个模型已就绪`;
}catch(error){
  $('loading').textContent='模型装载失败，请刷新后重试。';$('loadStatus').textContent='装载失败';console.error(error);
}
