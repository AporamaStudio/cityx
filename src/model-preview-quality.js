import * as THREE from 'three';

// 品质样板独立使用较细的太阳阴影和柔和反射环境，不改变主游戏照明。
export function createQualityPreview(renderer,scene,sun,sky){
  const room=new THREE.Scene(),geometry=new THREE.BoxGeometry(1,1,1),walls=[];
  for(const [x,y,z,w,h,d,color] of [[0,8,0,18,.1,18,'#ecece1'],[-8,3,0,.1,10,18,'#d7ddd5'],[8,3,0,.1,10,18,'#b8c2bd'],[0,3,-8,18,10,.1,'#b4c3c5'],[0,-2,0,18,.1,18,'#626a5b']]){
    const mesh=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({color}));mesh.position.set(x,y,z);mesh.scale.set(w,h,d);room.add(mesh);walls.push(mesh);
  }
  const pmrem=new THREE.PMREMGenerator(renderer),environment=pmrem.fromScene(room,.02);pmrem.dispose();walls.forEach(m=>m.material.dispose());geometry.dispose();
  let active=false;
  return (enabled,night)=>{
    if(active!==enabled){
      active=enabled;sun.shadow.map?.dispose();sun.shadow.map=null;
      sun.shadow.mapSize.set(enabled?4096:2048,enabled?4096:2048);
      const extent=enabled?12:38;Object.assign(sun.shadow.camera,{left:-extent,right:extent,top:extent,bottom:-extent});sun.shadow.camera.updateProjectionMatrix();
    }
    scene.environment=enabled?environment.texture:null;scene.environmentIntensity=night?.08:.45;
    if(enabled){sky.intensity=night?.6:.9;sun.intensity=night?.7:3.2;sun.shadow.normalBias=.012;sun.shadow.bias=-.00008;}
    else{sky.intensity=night?1.5:2.4;sun.intensity=night?.9:3.2;sun.shadow.normalBias=.03;sun.shadow.bias=-.00025;}
  };
}

export function attachCityhallLights(object,scale){
  const lighting=new THREE.Group();lighting.userData.previewRoofLights=true;lighting.visible=false;
  object.traverse(node=>{
    for(const [x,y,z,power,range] of node.userData.shelterLights??node.userData.cityhallLights??[]){
      const light=new THREE.PointLight(node.userData.shelterLightColor??'#ffd098',power*scale*scale,range*scale,2);light.position.set(x,y,z);
      if(node.userData.shelterLightStyle==='firelight')light.userData.previewFirelight={base:light.intensity,phase:lighting.children.length*1.7};
      lighting.add(light);
    }
  });
  object.add(lighting);
}

// 只驱动孤立避难所的局部发光与真实灯位；使用预览的可暂停时钟，不烘焙进模型动画。
export function updateShelterFirelight(object,time,enabled){
  object.traverse(node=>{
    const light=node.userData.previewFirelight,material=node.isMesh?node.material:null;
    const factor=phase=>enabled?1+.08*Math.sin(time*2.1+phase)+.035*Math.sin(time*6.7+phase*1.3):1;
    if(light)node.intensity=light.base*factor(light.phase);
    if(material?.userData.shelterLightStyle==='firelight'&&material.userData.previewLamp){
      material.emissiveIntensity=material.userData.previewEmission*factor(0);
    }
  });
}
