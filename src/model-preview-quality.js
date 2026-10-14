import * as THREE from 'three';

// 市政厅样板独立使用较细的太阳阴影和柔和反射环境，不改变主游戏照明。
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
    for(const [x,y,z,power,range] of node.userData.cityhallLights??[]){
      const light=new THREE.PointLight('#ffd098',power*scale*scale,range*scale,2);light.position.set(x,y,z);lighting.add(light);
    }
  });
  object.add(lighting);
}
