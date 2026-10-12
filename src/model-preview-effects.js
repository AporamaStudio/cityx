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

export function createPreviewEffects({render,isNight}){
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
    const barrels=[],muzzles=[];
    object.traverse(node=>{if(node.isMesh){if(['#3f5057','#1e2b32'].includes(node.material.name))barrels.push({node,z:node.position.z});if(node.material.name==='#1e2b32')muzzles.push(node);}});
    object.updateWorldMatrix(true,true);const bounds=new THREE.Box3();for(const node of muzzles)bounds.expandByObject(node);
    if(bounds.isEmpty())return ()=>{};
    const center=bounds.getCenter(new THREE.Vector3()),size=bounds.getSize(new THREE.Vector3()),origin=object.worldToLocal(center.clone());
    const originZ=origin.z,barrelScale=barrels[0]?.node.getWorldScale(new THREE.Vector3()).z??1;
    const flashes=[];
    for(const sign of [-1,1]){
      const flash=effectMesh(new THREE.SphereGeometry(long?.14:.1,6,4),'#fff4ba');flash.position.copy(origin);flash.position.x+=sign*size.x*.28;flash.position.z-=.07;object.add(flash);flashes.push(flash);
    }
    const shot=effectMesh(new THREE.SphereGeometry(long?.065:.045,6,4),long?'#ffe5a0':'#ffd082');object.add(shot);
    const distance=long?7.5:4.8,end=origin.clone().add(new THREE.Vector3(0,-.8,-distance));
    const tracer=new THREE.Line(new THREE.BufferGeometry().setFromPoints([origin,end]),new THREE.LineBasicMaterial({color:long?'#f8dca5':'#ffd38b',transparent:true,opacity:.65}));tracer.userData.previewGeometry=true;object.add(tracer);
    const smoke=effectMesh(new THREE.SphereGeometry(.13,7,5),'#a6b0aa',.2);smoke.position.copy(origin);object.add(smoke);
    const phase=entries.length*.4,period=long?4.3:3.1;
    return t=>{
      const age=t-forcedShot<.7?t-forcedShot:(t+phase)%period;
      const flashOn=age<.09||(!long&&age>.17&&age<.24),recoil=Math.max(0,1-age/.48);
      for(const {node,z} of barrels)node.position.z=z+recoil*(long?.18:.12);
      origin.z=originZ+recoil*(long?.18:.12)*barrelScale;
      for(const flash of flashes){flash.visible=flashOn;flash.position.z=origin.z-.07;flash.scale.setScalar(long?1.35:1);}
      tracer.visible=age>.035&&age<.25;tracer.material.opacity=.65*(1-age/.3);
      tracer.geometry.attributes.position.setXYZ(0,origin.x,origin.y,origin.z);tracer.geometry.attributes.position.needsUpdate=true;
      shot.visible=age<.3;shot.position.lerpVectors(origin,end,Math.min(1,age/.3));
      smoke.visible=age>.06&&age<.65;smoke.scale.setScalar(1+age*3);smoke.position.set(origin.x,origin.y+age*.45,origin.z);smoke.material.opacity=Math.max(0,.22*(1-age/.65));
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
