import {createShotVFX,createImpactVFX,muzzlePoint} from './cannon-vfx.js?v=1';
import {SHOT_STYLES,shotEnvelope} from './shot-visuals.js?v=1';
import {createDefenseVFX} from './defense-vfx.js?v=2';
import * as THREE from 'three';
import {groundGlow} from './model-preview-effects.js?v=3';

function mesh(geometry,color,opacity=1){
  const node=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({color,transparent:opacity<1,opacity,depthWrite:false,toneMapped:false}));node.userData.ownGeometry=true;return node;
}
function dispose(object){object.removeFromParent();object.traverse(node=>{if(node.material)node.material.dispose();if(node.userData.ownGeometry)node.geometry.dispose();});}

// 动效只消费显示描述和游戏时间；这里没有自动试射、独立计时或伤害计算。
export function createCityEffects(scene){
  const group=new THREE.Group();scene.add(group);const lights=new Map(),shots=new Map(),transitions=new Map(),impacts=new Map(),defense=new Map();
  function lightEntry(item){
    if(lights.has(item.id))return lights.get(item.id);
    const sweep=item.asset==='watch',wreck=item.asset==='wreck',object=new THREE.Group(),light=sweep?new THREE.SpotLight('#9fcaff',0,24,.10,.7,2):new THREE.PointLight(wreck?'#ff8745':'#ffb860',0,wreck?2.3:4,2),target=new THREE.Object3D();
    light.castShadow=false;scene.add(light,target);
    const pool=groundGlow(sweep?2.2:wreck?1.6:2.4,sweep?3.2:wreck?1.6:2.4,sweep?'#9bc8ff':wreck?'#ff984a':'#ffc174',.3);pool.position.y=.025;pool.userData.ownGeometry=true;object.add(pool);
    const cone=sweep?mesh(new THREE.ConeGeometry(1,1,18,1,true),'#93bdff',.17):null;if(cone){cone.material.side=THREE.DoubleSide;object.add(cone);light.target=target;}
    group.add(object);const entry={object,light,target,pool,cone};lights.set(item.id,entry);return entry;
  }
  function targetPoint(item,props,start,cellMeters){
    const target=props.get(item.targetObject),object=target?.object;
    if(!object)return new THREE.Vector3(item.x,(item.ground??0)+.95/cellMeters,item.y);
    object.updateMatrixWorld(true);const bounds=new THREE.Box3().setFromObject(object),center=bounds.getCenter(new THREE.Vector3());
    center.y=bounds.min.y+(bounds.max.y-bounds.min.y)*.55;
    // 清源弹迹落在当前源头表面，敌群则指向身体中部；位置不参与攻击判定。
    if(item.sourceId&&start){
      const h=bounds.max.y-bounds.min.y;center.y=Math.max(bounds.min.y+Math.min(.6/cellMeters,h*.25),Math.min(start.y,bounds.max.y-Math.min(.2/cellMeters,h*.25)));
      const direction=center.clone().sub(start).normalize(),ray=new THREE.Raycaster(start,direction);
      return ray.intersectObject(object,true)[0]?.point??new THREE.Ray(start.clone(),direction).intersectBox(bounds,new THREE.Vector3())??center;
    }
    return center;
  }
  return {
    group,
    updateDefense(items,time){
      const active=new Set(items.map(item=>item.token));for(const [token,entry] of defense)if(!active.has(token)){entry.dispose();defense.delete(token);}
      for(const item of items){if(!defense.has(item.token))defense.set(item.token,createDefenseVFX(group,item));defense.get(item.token).update(time-item.at,item.alpha);}
    },
    // 建筑状态立即结算；短扬尘/修缮光圈只说明刚发生的变化，暂停时共用游戏动效时间。
    updateTransitions(items,time){
      const active=new Set(items.map(item=>item.token));for(const [id,entry] of transitions)if(!active.has(id)){dispose(entry.object);transitions.delete(id);}
      for(const item of items){
        if(!transitions.has(item.token)){
          const object=new THREE.Group(),puffs=[];
          for(let i=0;i<8;i++){const puff=mesh(new THREE.SphereGeometry(1,6,4),item.kind==='restore'?'#d4d0b3':'#938d7a',.25);object.add(puff);puffs.push(puff);}
          const ring=mesh(new THREE.RingGeometry(.91,1,24),item.kind==='restore'?'#f0d893':'#bbb5a0',.7);ring.rotation.x=-Math.PI/2;ring.position.y=.025;object.add(ring);group.add(object);transitions.set(item.token,{object,puffs,ring});
        }
        const e=transitions.get(item.token),t=Math.max(0,Math.min(1,(time-item.at)/.8));e.object.position.set(item.x,0,item.y);
        e.puffs.forEach((puff,i)=>{const angle=i*Math.PI/4,r=.3+t*.45;puff.position.set(Math.cos(angle)*item.w*r,.04+t*.12,Math.sin(angle)*item.h*r);puff.scale.set(item.w*(.08+t*.06),.04+t*.10,item.h*(.08+t*.06));puff.material.opacity=Math.sin(t*Math.PI)*.22;});
        e.ring.scale.set(item.w*(.5+t*.12),item.h*(.5+t*.12),1);e.ring.material.opacity=(1-t)*.65;
      }
    },
    updateLights(items,time,night,viewport){
      const active=new Set(items.map(item=>item.id));for(const [id,entry] of lights)if(!active.has(id)){dispose(entry.object);entry.light.removeFromParent();entry.target.removeFromParent();lights.delete(id);}
      for(const item of items){
        const e=lightEntry(item),fireScale=item.fireScale??1,watch=item.asset==='watch',range=watch?(item.target?24:item.w*4):item.asset==='wreck'?2.3*fireScale:4,near=item.x>=viewport.left-range&&item.x<=viewport.right+range&&item.y>=viewport.top-range&&item.y<=viewport.bottom+range;
        e.light.position.set(item.x,item.height,item.y);e.light.visible=near&&(watch?night>0:true);e.object.visible=near&&(watch?night>0:true);
        if(e.cone)e.cone.visible=!!item.target;
        if(item.target){
          e.light.color.set('#9fcaff');e.light.angle=.10;e.light.distance=24;e.pool.material.color.set('#9bc8ff');e.pool.scale.setScalar(1);
          e.target.position.set(item.target.x,.01,item.target.y);const direction=e.target.position.clone().sub(e.light.position),length=direction.length();direction.normalize();
          e.cone.position.copy(e.light.position).addScaledVector(direction,length*.5);e.cone.quaternion.setFromUnitVectors(new THREE.Vector3(0,-1,0),direction);e.cone.scale.set(length*.10,length,length*.10);e.cone.material.opacity=night*.17;
          e.pool.position.set(item.target.x,.025,item.target.y);e.pool.material.opacity=night*.34;e.pool.rotation.z=-Math.atan2(item.target.y-item.y,item.target.x-item.x);
          e.light.intensity=night*85;
        }else if(watch){
          // 后方塔只照脚下，暖灯不闪烁、不增加信息；同一灯具切换，不累积光源。
          e.target.position.set(item.x,.01,item.y);e.light.color.set('#ffd599');e.light.angle=Math.PI/3;e.light.distance=item.w*4;e.light.intensity=night*1.1*(item.w/.26)**2;
          e.pool.position.set(item.x,.025,item.y);e.pool.scale.set(item.w*3/2.2,item.h*3/3.2,1);e.pool.material.color.set('#ffd599');e.pool.material.opacity=night*.16;e.pool.rotation.z=0;
        }else{
          const flicker=1+.12*Math.sin(time*8.7+item.x)+.05*Math.sin(time*13+item.y);
          // 距离/光池按实体缩放，平方缩放光强保持局部明暗；不把小车辆当大范围照明。
          const wreck=item.asset==='wreck';e.pool.position.set(item.x,.025,item.y);e.pool.scale.setScalar(fireScale);e.pool.material.opacity=(wreck?.12:.22)*flicker;e.light.distance=(wreck?2.3:4)*fireScale;e.light.intensity=(wreck?2+night*4:3+night*16)*flicker*fireScale**2;
        }
      }
    },
    updateShots(items,hitItems,props,time,cell,cellMeters=20,night=0,pixelsAt=null){
      const active=new Set(items.map(item=>item.id));
      for(const [id,entry] of shots)if(!props.has('tower:'+id)){dispose(entry.group);shots.delete(id);}else if(!active.has(id)){entry.group.visible=false;entry.at=null;}
      for(const item of items){
        const body=props.get('tower:'+item.id),age=time-item.at;if(!body)continue;
        if(shots.has(item.id)&&shots.get(item.id).type!==item.type){dispose(shots.get(item.id).group);shots.delete(item.id);}
        if(!shots.has(item.id))shots.set(item.id,createShotVFX(group,item.type));const entry=shots.get(item.id);body.object.updateMatrixWorld(true);
        if(entry.at!==item.at){
          entry.side=Math.round(item.at*1000)+item.id;const start=muzzlePoint(body.motion.muzzles,entry.side);if(!start){entry.group.visible=false;continue;}
          entry.at=item.at;entry.start=start;entry.end=targetPoint(item,props,start,cellMeters);
        }
        const pixels=pixelsAt?.(entry.start.x,entry.start.z,entry.start.y)??cell;
        entry.update(entry.start,entry.end,age,{unitsPerMeter:1/cellMeters,pixelsPerUnit:pixels,alpha:pixels>0?item.alpha:0,night,muzzle:muzzlePoint(body.motion.muzzles,entry.side)??entry.start});
      }
      const hitIds=new Set(hitItems.map(hit=>hit.id));for(const [id,entry] of impacts)if(!hitIds.has(id)){dispose(entry.group);impacts.delete(id);}
      for(const hit of hitItems){
        if(!impacts.has(hit.id))impacts.set(hit.id,createImpactVFX(group));const entry=impacts.get(hit.id);
        if(entry.at!==hit.at){entry.at=hit.at;const shot=items.find(item=>hit.sourceId&&item.sourceId===hit.sourceId);entry.point=shot&&shots.get(shot.id)?.end?.clone()||targetPoint(hit,props,null,cellMeters);}
        const delay=SHOT_STYLES[hit.type]?.flight??.14;
        const pixels=pixelsAt?.(entry.point.x,entry.point.z,entry.point.y)??cell;
        entry.update(entry.point,time-hit.at-delay,{unitsPerMeter:1/cellMeters,pixelsPerUnit:pixels,alpha:pixels>0?hit.alpha:0});
      }
    },
  };
}

export function facilityMotion(object){
  const flames=[],barrels=[],muzzles=[],heads=[];
  object.traverse(node=>{if(!node.isMesh)return;if(['#ff9538','#ffd36b'].includes(node.material.name))flames.push({node,scale:node.scale.clone(),position:node.position.clone()});if(['#3f5057','#1e2b32'].includes(node.material.name))barrels.push({node,z:node.position.z});if(node.material.name==='#1e2b32')muzzles.push(node);if(node.material.name==='#354047'){node.geometry=node.geometry.clone();node.geometry.computeBoundingBox();const pivot=node.geometry.boundingBox.getCenter(new THREE.Vector3());node.geometry.translate(-pivot.x,-pivot.y,-pivot.z);node.position.copy(pivot);node.userData.ownGeometry=true;heads.push(node);}});
  return {flames,barrels,muzzles,heads};
}
export function animateFacility(entry,item,frame){
  const {time,shots}=frame,shot=shots.find(shot=>'tower:'+shot.id===item.id),age=shot?time-shot.at:1;
  if(shot)entry.object.rotation.y=Math.atan2(item.x-shot.x,item.y-shot.y);
  if(item.target)for(const head of entry.motion.heads)head.rotation.y=Math.atan2(item.x-item.target.x,item.y-item.target.y);
  for(const {node,z} of entry.motion.barrels){const type=item.asset==='far'?'B':'A',scale=node.getWorldScale(new THREE.Vector3()).z;node.position.z=z+shotEnvelope(age,type).recoil*SHOT_STYLES[type].recoil/((frame.cellMeters??20)*scale);}
  entry.motion.flames.forEach(({node,scale,position},i)=>{
    node.scale.set(scale.x*(1+.06*Math.sin(time*6+i)),scale.y*(.88+.10*Math.sin(time*7.5+item.x+i)+.055*Math.sin(time*13+i*2)),scale.z*(1+.05*Math.cos(time*9+i)));
    node.position.x=position.x+.015*Math.sin(time*8+item.y+i);node.rotation.z=.035*Math.sin(time*5.7+i);node.material.emissiveIntensity=item.dead?0:.9+.17*Math.sin(time*9+item.x);
  });
}
