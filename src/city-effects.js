import * as THREE from 'three';
import {groundGlow} from './model-preview-effects.js?v=3';

function mesh(geometry,color,opacity=1){
  const node=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({color,transparent:opacity<1,opacity,depthWrite:false,toneMapped:false}));node.userData.ownGeometry=true;return node;
}
function dispose(object){object.removeFromParent();object.traverse(node=>{if(node.material)node.material.dispose();if(node.userData.ownGeometry)node.geometry.dispose();});}

// 动效只消费显示描述和游戏时间；这里没有自动试射、独立计时或伤害计算。
export function createCityEffects(scene){
  const group=new THREE.Group();scene.add(group);const lights=new Map(),shots=new Map();
  function lightEntry(item){
    if(lights.has(item.id))return lights.get(item.id);
    const sweep=!!item.target,wreck=item.asset==='wreck',object=new THREE.Group(),light=sweep?new THREE.SpotLight('#9fcaff',0,24,.10,.7,2):new THREE.PointLight(wreck?'#ff8745':'#ffb860',0,wreck?2.3:4,2),target=new THREE.Object3D();
    light.castShadow=false;scene.add(light,target);
    const pool=groundGlow(sweep?2.2:wreck?1.6:2.4,sweep?3.2:wreck?1.6:2.4,sweep?'#9bc8ff':wreck?'#ff984a':'#ffc174',.3);pool.position.y=.025;pool.userData.ownGeometry=true;object.add(pool);
    const cone=sweep?mesh(new THREE.ConeGeometry(1,1,18,1,true),'#93bdff',.17):null;if(cone){cone.material.side=THREE.DoubleSide;object.add(cone);light.target=target;}
    group.add(object);const entry={object,light,target,pool,cone};lights.set(item.id,entry);return entry;
  }
  function shotEntry(id,long){
    if(shots.has(id))return shots.get(id);
    const object=new THREE.Group(),flash=mesh(new THREE.SphereGeometry(long?.19:.14,6,4),'#fff1ab'),smoke=mesh(new THREE.SphereGeometry(.11,7,5),'#a6b0aa',.18),bullet=mesh(new THREE.SphereGeometry(long?.16:.10,6,4),long?'#ffe3a0':'#ffd082');
    const tracer=new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(),new THREE.Vector3()]),new THREE.LineBasicMaterial({color:long?'#f8dca5':'#ffd38b',transparent:true,opacity:.7,depthTest:false}));tracer.userData.ownGeometry=true;tracer.frustumCulled=false;
    object.add(flash,smoke,bullet,tracer);group.add(object);const entry={object,flash,smoke,bullet,tracer};shots.set(id,entry);return entry;
  }
  return {
    group,
    updateLights(items,time,night,viewport){
      const active=new Set(items.map(item=>item.id));for(const [id,entry] of lights)if(!active.has(id)){dispose(entry.object);entry.light.removeFromParent();entry.target.removeFromParent();lights.delete(id);}
      for(const item of items){
        const e=lightEntry(item),range=item.target?24:4,near=item.x>=viewport.left-range&&item.x<=viewport.right+range&&item.y>=viewport.top-range&&item.y<=viewport.bottom+range;
        e.light.position.set(item.x,item.height,item.y);e.light.visible=near&&(item.target?night>0:true);e.object.visible=near&&(item.target?night>0:true);
        if(item.target){
          e.target.position.set(item.target.x,.01,item.target.y);const direction=e.target.position.clone().sub(e.light.position),length=direction.length();direction.normalize();
          e.cone.position.copy(e.light.position).addScaledVector(direction,length*.5);e.cone.quaternion.setFromUnitVectors(new THREE.Vector3(0,-1,0),direction);e.cone.scale.set(length*.10,length,length*.10);e.cone.material.opacity=night*.17;
          e.pool.position.set(item.target.x,.025,item.target.y);e.pool.material.opacity=night*.34;e.pool.rotation.z=-Math.atan2(item.target.y-item.y,item.target.x-item.x);
          e.light.intensity=night*85;
        }else{
          const flicker=1+.12*Math.sin(time*8.7+item.x)+.05*Math.sin(time*13+item.y);
          const wreck=item.asset==='wreck';e.pool.position.set(item.x,.025,item.y);e.pool.material.opacity=(wreck?.12:.22)*flicker;e.light.intensity=(wreck?2+night*4:3+night*16)*flicker;
        }
      }
    },
    updateShots(items,props,time,cell){
      const active=new Set(items.map(item=>item.id));for(const [id,entry] of shots)if(!active.has(id)){dispose(entry.object);shots.delete(id);}
      for(const item of items){
        const body=props.get('tower:'+item.id),age=time-item.at;if(!body||age<0||age>.5){if(shots.has(item.id))shots.get(item.id).object.visible=false;continue;}
        const e=shotEntry(item.id,item.type==='B');body.object.updateMatrixWorld(true);
        const bounds=new THREE.Box3();for(const node of body.motion.muzzles)bounds.expandByObject(node);if(bounds.isEmpty()){e.object.visible=false;continue;}
        const start=bounds.getCenter(new THREE.Vector3()),end=new THREE.Vector3(item.x,.35,item.y),t=Math.min(1,age/.24);
        e.object.visible=true;e.flash.position.copy(start);e.flash.visible=age<.085||(item.type!=='B'&&age>.16&&age<.22);
        for(const node of [e.flash,e.bullet]){node.material.transparent=true;node.material.opacity=item.alpha;}
        e.bullet.visible=age<.24;e.bullet.scale.setScalar(Math.max(1,3/(cell*(item.type==='B'?.16:.10)*2)));e.bullet.position.lerpVectors(start,end,t);if(item.type==='B')e.bullet.position.y+=Math.sin(t*Math.PI)*.5;
        e.tracer.visible=age<.25;e.tracer.material.opacity=.7*(1-age/.25)*item.alpha;const positions=e.tracer.geometry.attributes.position;positions.setXYZ(0,start.x,start.y,start.z);positions.setXYZ(1,e.bullet.position.x,e.bullet.position.y,e.bullet.position.z);positions.needsUpdate=true;
        e.smoke.visible=age>.06&&age<.45;e.smoke.position.copy(start).add(new THREE.Vector3(0,age*.5,0));e.smoke.scale.setScalar(1+age*3);e.smoke.material.opacity=Math.max(0,.18*(1-age/.45))*item.alpha;
      }
    },
  };
}

export function facilityMotion(object){
  const flames=[],barrels=[],muzzles=[],heads=[];
  object.traverse(node=>{if(!node.isMesh)return;if(['#ff9538','#ffd36b'].includes(node.material.name))flames.push({node,scale:node.scale.clone(),position:node.position.clone()});if(['#3f5057','#1e2b32'].includes(node.material.name))barrels.push({node,z:node.position.z});if(node.material.name==='#1e2b32')muzzles.push(node);if(node.material.name==='#354047')heads.push(node);});
  return {flames,barrels,muzzles,heads};
}
export function animateFacility(entry,item,frame){
  const {time,shots}=frame,shot=shots.find(shot=>'tower:'+shot.id===item.id),age=shot?time-shot.at:1;
  if(shot)entry.object.rotation.y=Math.atan2(item.x-shot.x,item.y-shot.y);
  if(item.target)for(const head of entry.motion.heads)head.rotation.y=Math.atan2(item.x-item.target.x,item.y-item.target.y);
  for(const {node,z} of entry.motion.barrels)node.position.z=z+Math.max(0,1-age/.38)*(item.asset==='far'?.18:.12);
  entry.motion.flames.forEach(({node,scale,position},i)=>{
    node.scale.set(scale.x*(1+.06*Math.sin(time*6+i)),scale.y*(.88+.10*Math.sin(time*7.5+item.x+i)+.055*Math.sin(time*13+i*2)),scale.z*(1+.05*Math.cos(time*9+i)));
    node.position.x=position.x+.015*Math.sin(time*8+item.y+i);node.rotation.z=.035*Math.sin(time*5.7+i);node.material.emissiveIntensity=item.dead?0:.9+.17*Math.sin(time*9+item.x);
  });
}
