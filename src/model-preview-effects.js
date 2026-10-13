import {createShotVFX,createImpactVFX,muzzlePoint} from './cannon-vfx.js?v=1';
import {SHOT_STYLES,shotEnvelope} from './shot-visuals.js?v=1';
import * as THREE from 'three';

// 选型页的轻量动效：只改变模型与灯光，不参与探索、射程或伤害。
const down=new THREE.Vector3(0,-1,0);
let glowTexture=null;
export function groundGlow(width,depth,color,opacity){
  if(!glowTexture){
    const canvas=document.createElement('canvas');canvas.width=canvas.height=128;
    const ctx=canvas.getContext('2d'),gradient=ctx.createRadialGradient(64,64,0,64,64,64);
    gradient.addColorStop(0,'rgba(255,255,255,1)');gradient.addColorStop(.4,'rgba(255,255,255,.7)');gradient.addColorStop(1,'rgba(255,255,255,0)');
    ctx.fillStyle=gradient;ctx.fillRect(0,0,128,128);glowTexture=new THREE.CanvasTexture(canvas);
  }
  const mesh=new THREE.Mesh(new THREE.PlaneGeometry(width,depth),new THREE.MeshBasicMaterial({color,map:glowTexture,transparent:true,opacity,depthWrite:false,blending:THREE.AdditiveBlending}));
  mesh.rotation.x=-Math.PI/2;mesh.userData.previewGeometry=true;return mesh;
}
function effectMesh(geometry,color,opacity=1){
  const mesh=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({color,transparent:opacity<1,opacity,depthWrite:false}));
  mesh.userData.previewGeometry=true;return mesh;
}
function visible(object){for(let node=object;node;node=node.parent)if(!node.visible)return false;return !!object.parent;}

export function createPreviewEffects({render,isNight,view}){
  const entries=[];let enabled=false,time=0,previous=0,lastPaint=0,frame=0,forcedShot=-10;
  function fire(object){
    const flames=[];
    object.traverse(node=>{if(node.isMesh&&['#ff9538','#ffd36b'].includes(node.material.name))flames.push({node,scale:node.scale.clone(),position:node.position.clone()});});
    const phase=entries.length*.9;
    return t=>{
      flames.forEach(({node,scale,position},i)=>{
        const wave=.88+.10*Math.sin(t*7.5+phase+i)+.055*Math.sin(t*13.3+i*2);
        node.scale.set(scale.x*(1.02+.06*Math.sin(t*6+i)),scale.y*wave,scale.z*(1+.05*Math.cos(t*9+i)));
        node.position.x=position.x+.015*Math.sin(t*8+phase+i);node.rotation.z=.035*Math.sin(t*5.7+i);
        node.material.emissiveIntensity=.9+.17*Math.sin(t*9+phase);
      });
    };
  }
  function searchlight(object){
    object.updateWorldMatrix(true,true);
    const bounds=new THREE.Box3().setFromObject(object),point=object.worldToLocal(new THREE.Vector3(bounds.getCenter(new THREE.Vector3()).x,bounds.max.y-.5,bounds.getCenter(new THREE.Vector3()).z));
    const group=new THREE.Group(),lamp=new THREE.SpotLight('#9fcaff',125,17,.15,.7,2),target=new THREE.Object3D();
    lamp.position.copy(point);lamp.target=target;group.add(lamp,target);
    const head=effectMesh(new THREE.BoxGeometry(.24,.2,.35),'#718b94');head.position.copy(point);group.add(head);
    const cone=effectMesh(new THREE.ConeGeometry(1,1,20,1,true),'#93bdff',.16);cone.material.side=THREE.DoubleSide;group.add(cone);
    const pool=groundGlow(3.2,4.7,'#9bc8ff',.34);pool.position.y=.06;group.add(pool);object.add(group);
    const phase=entries.length*1.7,direction=new THREE.Vector3();
    return t=>{
      group.visible=isNight();if(!group.visible)return;
      const angle=t*.32+phase;target.position.set(Math.cos(angle)*7.7,.01,Math.sin(angle)*7.7);
      direction.subVectors(target.position,lamp.position);const length=direction.length();direction.normalize();
      head.rotation.y=-angle+Math.PI/2;
      cone.position.copy(lamp.position).addScaledVector(direction,length*.5);cone.quaternion.setFromUnitVectors(down,direction);cone.scale.set(length*.13,length,length*.13);
      pool.position.x=target.position.x;pool.position.z=target.position.z;pool.rotation.z=-angle;
    };
  }
  function cannon(object,long){
    const barrels=[],muzzles=[],type=long?'B':'A';
    object.traverse(node=>{if(node.isMesh){if(['#3f5057','#1e2b32'].includes(node.material.name))barrels.push({node,z:node.position.z});if(node.material.name==='#1e2b32')muzzles.push(node);}});
    object.updateWorldMatrix(true,true);const bounds=new THREE.Box3().setFromObject(object),size=bounds.getSize(new THREE.Vector3()),u=Math.max(size.x,size.z)/(long?6:5);
    const shot=createShotVFX(object,type),impact=createImpactVFX(object),phase=entries.length*.4,period=long?4.3:3.1;
    let lastToken,start,end,side=0;
    return t=>{
      const forced=t-forcedShot>=0&&t-forcedShot<.7,age=forced?t-forcedShot:(t+phase)%period,token=forced?'force:'+forcedShot:Math.floor((t+phase)/period),e=shotEnvelope(age,type);
      for(const {node,z} of barrels)node.position.z=z+e.recoil*SHOT_STYLES[type].recoil*u/node.getWorldScale(new THREE.Vector3()).z;
      if(token!==lastToken){
        object.updateWorldMatrix(true,true);side=Math.floor(t*10);const point=muzzlePoint(muzzles,side);if(!point)return;
        start=object.worldToLocal(point);end=start.clone().add(new THREE.Vector3(0,-Math.min(start.y,u),-(long?12:8)*u));lastToken=token;
      }
      object.updateWorldMatrix(true,true);const options={unitsPerMeter:u,pixelsPerUnit:view().pixelsPerUnit,night:isNight()?1:0,muzzle:object.worldToLocal(muzzlePoint(muzzles,side))};
      shot.update(start,end,age,options);impact.update(end,age-SHOT_STYLES[type].flight,options);
    };
  }

  function update(){for(const {object,tick} of entries)if(visible(object))tick(time);}
  function animate(now){
    frame=0;if(!enabled||document.hidden)return;
    time+=Math.min((now-previous)/1000,.08);previous=now;
    if(now-lastPaint>=1000/30){update();render(time);lastPaint=now;}
    frame=requestAnimationFrame(animate);
  }
  function start(){if(enabled&&!document.hidden&&!frame){previous=performance.now();frame=requestAnimationFrame(animate);}}
  document.addEventListener('visibilitychange',()=>{if(document.hidden){cancelAnimationFrame(frame);frame=0;}else start();});
  return {
    attach(id,object){
      const tick=id==='watchtower'?searchlight(object):id.startsWith('cannon-')?cannon(object,id==='cannon-long'):['campfire','burnt-car'].includes(id)?fire(object):null;
      if(tick)entries.push({object,tick});
    },
    remove(object){for(let i=entries.length-1;i>=0;i--)if(entries[i].object===object)entries.splice(i,1);},
    setEnabled(value){enabled=value;if(!enabled){cancelAnimationFrame(frame);frame=0;}else start();},
    fire(){forcedShot=time;update();render(time);},
    update
  };
}
