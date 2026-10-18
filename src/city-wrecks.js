import * as THREE from 'three';

let scorch;
export function styleWreckBody(object,color){
  const colors={'#59615b':'#617573','#4a524b':'#354a4c','#323b36':'#263638','#858e82':'#899a96','#778276':'#708783'};
  object.traverse(node=>{if(node.isMesh&&colors[node.material.name])node.material.color.set(colors[node.material.name]);});
  if(color)object.traverse(node=>{if(node.isMesh&&['#59615b','#4a524b'].includes(node.material.name))node.material.color.set(color).multiplyScalar(.55);});
}
export function styleVehicleBody(object,color,damaged=false){
  object.traverse(node=>{
    if(!node.isMesh)return;
    if(['#758d96','#8da4a9'].includes(node.material.name))node.material.color.set(color).multiplyScalar(damaged?.62:node.material.name==='#8da4a9'?.92:1);
    // 静态停放车不自动点亮前灯，灯片与路灯发光材质分开。
    if(node.material.name==='#ffe1a3'){node.material.name='vehicle-lens';node.material.color.set('#ced3c5');node.material.emissive.set('#000000');node.material.emissiveIntensity=0;}
  });
}
function scorchTexture(){
  if(scorch)return scorch;
  const canvas=document.createElement('canvas');canvas.width=canvas.height=128;const ctx=canvas.getContext('2d'),gradient=ctx.createRadialGradient(64,64,10,64,64,63);
  gradient.addColorStop(0,'#111915bb');gradient.addColorStop(.55,'#18221b88');gradient.addColorStop(1,'#18221b00');ctx.fillStyle=gradient;ctx.fillRect(0,0,128,128);
  scorch=new THREE.CanvasTexture(canvas);scorch.colorSpace=THREE.SRGBColorSpace;return scorch;
}
// 车辆保持4.6m实体尺度，用烧焦地面、碎片和稀疏轻烟解释场景，避免放大车身。
export function createWreckDressing(parent,width,length){
  const group=new THREE.Group();parent.add(group);
  const stain=new THREE.Mesh(new THREE.PlaneGeometry(width*2.4,length*1.5),new THREE.MeshBasicMaterial({map:scorchTexture(),transparent:true,opacity:.75,depthWrite:false}));stain.rotation.x=-Math.PI/2;stain.position.y=.003;stain.userData.ownGeometry=true;group.add(stain);
  for(let i=0;i<3;i++){
    const debris=new THREE.Mesh(new THREE.BoxGeometry(width*.12,width*.045,width*.18),new THREE.MeshStandardMaterial({color:i%2?'#7f8b82':'#454d46',roughness:1}));debris.position.set((i-1)*width*.7,.004,(i%2-.5)*length*.6);debris.rotation.y=i*.71;debris.userData.ownGeometry=true;group.add(debris);
  }
  const smoke=[];
  for(let i=0;i<4;i++){
    const puff=new THREE.Mesh(new THREE.SphereGeometry(1,7,5),new THREE.MeshBasicMaterial({color:'#86928d',transparent:true,opacity:0,depthWrite:false}));puff.userData.ownGeometry=true;group.add(puff);smoke.push(puff);
  }
  return {group,stain,smoke,width,length};
}
export function updateWreckDressing(entry,time,night=0,reducedMotion=false){
  const {width,length}=entry;entry.stain.material.transparent=true;entry.stain.material.opacity=.75;
  entry.smoke.forEach((puff,i)=>{
    const t=reducedMotion?(i+.5)/4:((time*.3+i/4)%1),radius=width*(.24+t*.30);
    puff.position.set(width*(-.15+t*.7),width*(.65+t*2.4),-length*.3+width*t*.20);puff.scale.set(radius,radius*.8,radius);puff.material.transparent=true;puff.material.opacity=Math.sin(t*Math.PI)*(night?.12:.10);
  });
}

// 燃烧车的静态车身/焦痕/碎片与四层同色轻烟共用实例；原火焰节点仍逐车动画。
export function createWreckInstances(parent,getTemplate){
  const group=new THREE.Group();parent.add(group);const paints=new Map(),parts=[],smoke=[],dressing=[],matrix=new THREE.Matrix4(),local=new THREE.Matrix4(),rotation=new THREE.Quaternion(),position=new THREE.Vector3(),scale=new THREE.Vector3(),axis=new THREE.Vector3(0,1,0);
  let capacity=0,signature='',count=0,bounds=null;
  function mesh(geometry,material){const result=new THREE.InstancedMesh(geometry,material,capacity);result.frustumCulled=false;result.userData.cityDecoration=true;group.add(result);return result;}
  function initialize(wanted){
    if(capacity>=wanted)return false;
    const template=getTemplate();if(!template)return false;
    for(const node of [...group.children]){node.removeFromParent();node.dispose();}
    capacity=2**Math.ceil(Math.log2(Math.max(1,wanted)));bounds=new THREE.Box3().setFromObject(template);const size=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3());
    if(!parts.length){template.updateMatrixWorld(true);template.traverse(node=>{if(!node.isMesh||['#ff9538','#ffd36b'].includes(node.material.name))return;const geometry=node.geometry.clone().applyMatrix4(node.matrixWorld),material=node.material.clone();material.color.set('#ffffff');parts.push({geometry,material,name:node.material.name,mapped:!!node.material.map});});}
    for(const part of parts)part.mesh=mesh(part.geometry,part.material);
    if(!dressing.length){
      dressing.push({geometry:new THREE.PlaneGeometry(1,1).rotateX(-Math.PI/2),material:new THREE.MeshBasicMaterial({map:scorchTexture(),transparent:true,opacity:.75,depthWrite:false})});
      for(let i=0;i<3;i++)dressing.push({geometry:new THREE.BoxGeometry(1,1,1),material:new THREE.MeshStandardMaterial({color:i%2?'#7f8b82':'#454d46',roughness:1})});
      for(let i=0;i<4;i++)smoke.push({geometry:new THREE.SphereGeometry(1,7,5),material:new THREE.MeshBasicMaterial({color:'#86928d',transparent:true,opacity:0,depthWrite:false})});
    }
    for(const part of [...dressing,...smoke])part.mesh=mesh(part.geometry,part.material);
    bounds={bounds,size,center};return true;
  }
  function paint(color){
    if(!paints.has(color)){
      const model=getTemplate().clone(true),colors=new Map();model.traverse(node=>{if(node.isMesh)node.material=node.material.clone();});styleWreckBody(model,color);model.traverse(node=>{if(node.isMesh){colors.set(node.material.name,node.material.color.clone());node.material.dispose();}});paints.set(color,colors);
    }
    return paints.get(color);
  }
  return {update(items,time,night,reducedMotion){
    const changed=initialize(items.length);if(!capacity)return false;count=items.length;
    const next=items.map(p=>`${p.id}:${p.x}:${p.y}:${p.roof??0}:${p.w}:${p.h}:${p.angle??0}:${p.color??''}`).join('|');
    if(changed||next!==signature){
      for(const [i,item] of items.entries()){
        const bodyScale=Math.min(item.w/bounds.size.x,item.h/bounds.size.z),colors=paint(item.color);
        rotation.setFromAxisAngle(axis,item.angle??0);matrix.compose(position.set(item.x,item.roof??0,item.y),rotation,scale.setScalar(1));
        const body=matrix.clone().multiply(new THREE.Matrix4().makeScale(bodyScale,bodyScale,bodyScale)).multiply(new THREE.Matrix4().makeTranslation(-bounds.center.x,-bounds.bounds.min.y,-bounds.center.z));
        for(const part of parts){part.mesh.setMatrixAt(i,body);part.mesh.setColorAt(i,colors.get(part.name));}
        local.compose(position.set(0,.003,0),rotation.identity(),scale.set(item.w*2.4,1,item.h*1.5));dressing[0].mesh.setMatrixAt(i,local.premultiply(matrix));
        for(let k=0;k<3;k++){local.compose(position.set((k-1)*item.w*.7,.004,(k%2-.5)*item.h*.6),rotation.setFromAxisAngle(axis,k*.71),scale.set(item.w*.12,item.w*.045,item.w*.18));dressing[k+1].mesh.setMatrixAt(i,local.premultiply(matrix));}
      }
      for(const part of [...parts,...dressing]){part.mesh.count=count;part.mesh.instanceMatrix.needsUpdate=true;if(part.mesh.instanceColor)part.mesh.instanceColor.needsUpdate=true;}
      signature=next;
    }
    for(let k=0;k<4;k++){
      const t=reducedMotion?(k+.5)/4:((time*.3+k/4)%1),part=smoke[k];part.material.opacity=Math.sin(t*Math.PI)*(night?.12:.10);
      for(const [i,item] of items.entries()){
        const r=item.w*(.24+t*.30);rotation.setFromAxisAngle(axis,item.angle??0);matrix.compose(position.set(item.x,item.roof??0,item.y),rotation,scale.setScalar(1));
        local.compose(position.set(item.w*(-.15+t*.7),item.w*(.65+t*2.4),-item.h*.3+item.w*t*.20),rotation.identity(),scale.set(r,r*.8,r));part.mesh.setMatrixAt(i,local.premultiply(matrix));
      }
      part.mesh.count=count;part.mesh.instanceMatrix.needsUpdate=true;
    }
    return changed;
  }};
}
