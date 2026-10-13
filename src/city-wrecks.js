import * as THREE from 'three';

let scorch;
export function styleWreckBody(object){
  const colors={'#59615b':'#617573','#4a524b':'#354a4c','#323b36':'#263638','#858e82':'#899a96','#778276':'#708783'};
  object.traverse(node=>{if(node.isMesh&&colors[node.material.name])node.material.color.set(colors[node.material.name]);});
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
