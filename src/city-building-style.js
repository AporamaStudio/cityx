import * as THREE from 'three';

const paving=new Map();
export function buildingVariation(id,column,row){
  const seed=(Math.imul(id+1,73856093)^Math.imul(column+3,19349663)^Math.imul(row+7,83492791))>>>0;
  return {turn:seed%2*Math.PI,scale:[.94,.97,1][seed%3],tint:['#f0ede5','#e5ece8','#eee6d9','#ffffff'][(seed>>>3)%4]};
}
function pavingTexture(housing,ruined,w,h,cellMeters){
  const key=housing+':'+ruined;
  if(!paving.has(key)){
    const canvas=document.createElement('canvas');canvas.width=canvas.height=128;const ctx=canvas.getContext('2d');
    ctx.fillStyle=ruined?'#69726b':housing?'#939084':'#7a8981';ctx.fillRect(0,0,128,128);
    for(let row=0;row<4;row++)for(let column=0;column<4;column++){
      ctx.fillStyle=(column+row)%3===0?'#ffffff08':'#00000005';ctx.fillRect(column*32+1,row*32+1,30,30);
    }
    if(ruined){ctx.strokeStyle='#3f4b4244';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(0,48);ctx.lineTo(44,58);ctx.lineTo(61,91);ctx.lineTo(128,109);ctx.stroke();}
    paving.set(key,canvas);
  }
  const texture=new THREE.CanvasTexture(paving.get(key));texture.colorSpace=THREE.SRGBColorSpace;texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.repeat.set(w*cellMeters/8,h*cellMeters/8);texture.userData.cityOwned=true;return texture;
}
// 完整连接底层保持原物理实体和可落炮面；低对比铺装与暗侧面避免像亮色展台。
export function addBuildingFoundation(object,{w,h,height,cellMeters,housing,ruined}){
  const width=w-.03,depth=h-.03;
  const base=new THREE.Mesh(new THREE.BoxGeometry(width,height,depth),new THREE.MeshStandardMaterial({color:ruined?'#4e5b54':housing?'#797b6c':'#65766f',roughness:1}));base.position.y=height*.5;base.castShadow=base.receiveShadow=true;base.userData.ownGeometry=true;object.add(base);
  const surface=new THREE.Mesh(new THREE.PlaneGeometry(width,depth),new THREE.MeshStandardMaterial({map:pavingTexture(housing,ruined,width,depth,cellMeters),roughness:1}));surface.rotation.x=-Math.PI/2;surface.position.y=height+.0005;surface.receiveShadow=true;surface.userData.ownGeometry=true;object.add(surface);
}
