import * as THREE from 'three';
import {SHOT_STYLES,shotEnvelope} from './shot-visuals.js?v=1';

let glowMap,smokeMap;
function texture(smoke=false){
  if(smoke?smokeMap:glowMap)return smoke?smokeMap:glowMap;
  const canvas=document.createElement('canvas');canvas.width=canvas.height=64;const ctx=canvas.getContext('2d');
  if(smoke){
    // 固定云团轮廓，不逐帧随机；共享小贴图减少透明叠层与纹理开销。
    for(const [x,y,r,a] of [[27,34,25,.7],[40,25,19,.6],[22,18,16,.4]]){
      const g=ctx.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,`rgba(255,255,255,${a})`);g.addColorStop(1,'rgba(255,255,255,0)');ctx.fillStyle=g;ctx.fillRect(0,0,64,64);
    }
  }else{
    const g=ctx.createRadialGradient(32,32,0,32,32,32);g.addColorStop(0,'#ffffffff');g.addColorStop(.18,'#ffffffdd');g.addColorStop(.5,'#ffffff44');g.addColorStop(1,'#ffffff00');ctx.fillStyle=g;ctx.fillRect(0,0,64,64);
  }
  const map=new THREE.CanvasTexture(canvas);if(smoke)smokeMap=map;else glowMap=map;return map;
}
function mesh(geometry,color,opacity=1){
  const m=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({color,transparent:true,opacity,depthWrite:false,toneMapped:false}));
  m.userData.ownGeometry=m.userData.previewGeometry=true;return m;
}
function sprite(color,smoke=false){return new THREE.Sprite(new THREE.SpriteMaterial({map:texture(smoke),color,transparent:true,depthWrite:false,toneMapped:false,blending:smoke?THREE.NormalBlending:THREE.AdditiveBlending}));}
const up=new THREE.Vector3(0,1,0);

// GLB双管共用一个材质网格时，也从选定半边的真实炮口前端取点。
export function muzzlePoint(muzzles,side=0){
  if(!muzzles.length)return null;const node=muzzles[side%muzzles.length],positions=node.geometry.attributes.position,bounds=new THREE.Box3();
  node.geometry.computeBoundingBox();const center=node.geometry.boundingBox.getCenter(new THREE.Vector3()),p=new THREE.Vector3();
  for(let i=0;i<positions.count;i++){p.fromBufferAttribute(positions,i);if(muzzles.length>1||(side%2?p.x>=center.x:p.x<=center.x))bounds.expandByPoint(p);}
  if(bounds.isEmpty())bounds.copy(node.geometry.boundingBox);const point=bounds.getCenter(new THREE.Vector3());point.z=bounds.min.z;return node.localToWorld(point);
}

export function createShotVFX(parent,type){
  const s=SHOT_STYLES[type],group=new THREE.Group();parent.add(group);
  const flame=mesh(new THREE.ConeGeometry(1,1,7,1,true),'#ffac4d',.5),core=mesh(new THREE.ConeGeometry(1,1,6),'#fff4c2'),flare=sprite('#ffd28a');
  // 沿锥面渐淡并打散边缘，避免暂停时像一根实心发光长矛。
  for(const node of [flame,core]){
    node.material.onBeforeCompile=shader=>{
      shader.vertexShader='varying vec2 cannonFlameUV;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\ncannonFlameUV=uv;');
      shader.fragmentShader='varying vec2 cannonFlameUV;\n'+shader.fragmentShader.replace('#include <color_fragment>','#include <color_fragment>\ndiffuseColor.a*=(.65+.35*sin(cannonFlameUV.x*25.+cannonFlameUV.y*11.))*(1.-smoothstep(.25,1.,cannonFlameUV.y));');
    };node.material.customProgramCacheKey=()=> 'cityx-cannon-flame-v1';
  }
  const body=mesh(new THREE.CylinderGeometry(.45,1,1,6),'#ffe3a5'),halo=sprite('#ffce83'),tail=mesh(new THREE.ConeGeometry(1,1,7,1,true),'#ffcc77',.22);
  const trace=new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(),new THREE.Vector3()]),new THREE.LineBasicMaterial({color:'#ffeab0',transparent:true,depthWrite:false,toneMapped:false}));trace.userData.ownGeometry=trace.userData.previewGeometry=true;trace.frustumCulled=false;
  // 小光晕作为可见侧的提示，实体/尾迹仍受真实楼体深度遮挡。
  flare.material.depthTest=halo.material.depthTest=false;
  const smoke=[0,1,2].map(()=>sprite('#a4aaa3',true));group.add(flame,core,flare,body,halo,tail,trace,...smoke);
  const direction=new THREE.Vector3(),bullet=new THREE.Vector3(),back=new THREE.Vector3();
  return {group,type,update(start,end,age,{unitsPerMeter,pixelsPerUnit,alpha=1,night=0,muzzle=start}){
    const e=shotEnvelope(age,type),u=unitsPerMeter,detail=pixelsPerUnit*u>=.7,distance=direction.subVectors(end,start).length();direction.normalize();const rotation=new THREE.Quaternion().setFromUnitVectors(up,direction);
    group.visible=age>=0&&age<.45&&alpha>0;if(!group.visible)return;
    const flameLength=s.flame*u*(.55+.45*e.flash),flameRadius=(type==='B'?.35:.23)*u;
    for(const [node,r,l] of [[flame,flameRadius,flameLength],[core,flameRadius*.45,flameLength*.75]]){node.visible=e.flash>0;node.quaternion.copy(rotation);node.position.copy(muzzle).addScaledVector(direction,l*.5);node.scale.set(r,l,r);node.material.opacity=e.flash*alpha*(node===core?1:.5);}
    flare.visible=e.flash>0;flare.position.copy(muzzle);flare.scale.setScalar(Math.max(flameRadius*4,7/pixelsPerUnit));flare.material.opacity=e.flash*alpha*(.4+night*.15);
    bullet.lerpVectors(start,end,e.travel);body.visible=halo.visible=tail.visible=trace.visible=age<s.flight;
    body.position.copy(bullet);body.quaternion.copy(rotation);body.scale.set(s.radius*u,s.length*u,s.radius*u);body.material.opacity=alpha;
    halo.position.copy(bullet);halo.scale.setScalar(Math.max(s.radius*u*5,2.6/pixelsPerUnit));halo.material.opacity=alpha*.65;
    const length=Math.min(s.trail*u,distance*.4,distance*e.travel);tail.visible=trace.visible=age<s.flight&&length>1e-5;back.copy(bullet).addScaledVector(direction,-length);
    tail.quaternion.setFromUnitVectors(up,direction.clone().negate());tail.position.copy(back).addScaledVector(direction,length*.5);const radius=Math.max(.10*u,.8/pixelsPerUnit);tail.scale.set(radius,length,radius);tail.material.opacity=alpha*.2;
    const positions=trace.geometry.attributes.position;positions.setXYZ(0,back.x,back.y,back.z);positions.setXYZ(1,bullet.x,bullet.y,bullet.z);positions.needsUpdate=true;trace.material.opacity=alpha*.8;
    smoke.forEach((node,i)=>{node.visible=detail&&e.smoke>0&&(i<2||pixelsPerUnit*u>2);node.position.copy(muzzle).addScaledVector(direction,(.4+i*.22)*u).add(new THREE.Vector3((i-1)*age*.3*u,age*(1+i*.35)*u,0));node.scale.setScalar(s.smoke*u*(1+age*3)*(1+i*.18));node.material.color.set(night?'#8da5ad':'#969b91');node.material.opacity=e.smoke*(.15-i*.025)*alpha;});
  }};
}

export function createImpactVFX(parent){
  const group=new THREE.Group();parent.add(group);const flash=sprite('#ffe4b3'),dust=sprite('#a5a397',true),sparks=[];flash.material.depthTest=false;
  for(let i=0;i<5;i++){const spark=mesh(new THREE.BoxGeometry(1,1,1),'#ffc378');group.add(spark);sparks.push(spark);}group.add(flash,dust);
  return {group,update(point,age,{unitsPerMeter,pixelsPerUnit,alpha=1}){
    group.visible=age>=0&&age<.28&&alpha>0;if(!group.visible)return;const u=unitsPerMeter,t=age/.28,detail=pixelsPerUnit*u>=.7;
    flash.position.copy(point);flash.scale.setScalar(Math.max(.8*u,4/pixelsPerUnit)*(1+t*.5));flash.material.opacity=Math.max(0,1-age/.09)*alpha*.8;
    dust.visible=detail;dust.position.copy(point).add(new THREE.Vector3(0,age*.8*u,0));dust.scale.setScalar(u*(.6+t*.8));dust.material.opacity=Math.sin(t*Math.PI)*.12*alpha;
    sparks.forEach((spark,i)=>{spark.visible=detail&&(pixelsPerUnit*u>2||i<3);const angle=i*2.4,speed=.9+i*.18;const offset=new THREE.Vector3(Math.cos(angle)*speed*t*u,(.25+.6*Math.sin(t*Math.PI))*u,Math.sin(angle)*speed*t*u);spark.position.copy(point).add(offset);spark.scale.set(.045*u,.16*u*(1-t),.045*u);spark.rotation.set(angle,t*3,angle*.3);spark.material.opacity=(1-t)*alpha;});
  }};
}
