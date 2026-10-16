import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

// 未知城区只保留无类型、无细节的统一体量；不读取用途、敌源、修复或运营信息。
export function createUnknownCity(layout,plots){
  const root=new THREE.Group();root.userData.cityNoPick=true;
  const boxes=[];
  for(const {x,y,w,h} of plots){
    const geometry=new THREE.BoxGeometry(Math.max(.1,w-.3),.22,Math.max(.1,h-.3));geometry.translate(x+w/2,.11,y+h/2);boxes.push(geometry);
  }
  const roads=[];
  for(let y=0;y<layout.height;y++)for(let x=0;x<layout.width;x++)if(layout.tiles[y*layout.width+x]==='road'){
    const geometry=new THREE.PlaneGeometry(1,1);geometry.rotateX(-Math.PI/2);geometry.translate(x+.5,-.012,y+.5);roads.push(geometry);
  }
  for(const [geometries,color] of [[boxes,'#899b9e'],[roads,'#7c9198']])if(geometries.length){
    const mesh=new THREE.Mesh(mergeGeometries(geometries),new THREE.MeshStandardMaterial({color,roughness:1}));
    mesh.userData.ownGeometry=true;root.add(mesh);for(const geometry of geometries)geometry.dispose();
  }
  return root;
}
