import * as THREE from 'three';
import {roadCellParts} from './city-roads.js?v=1';
import {naturalGroundAt} from './natural-terrain.js?v=6';

// 路面/标线用米制平面，路缘保留真实高度；分块按材质合批，近景无需放大底图。
export function createRoadModel(layout,cellMeters=20,visible=()=>true){
  const root=new THREE.Group(),batches=new Map();
  for(let y=0;y<layout.height;y++)for(let x=0;x<layout.width;x++)if(visible(y*layout.width+x)){
    for(const part of roadCellParts(layout,x,y,cellMeters)){
      const batch=[Math.floor(x/8),Math.floor(y/8),part.color].join(':'),height=part.height/cellMeters+.002;
      if(!batches.has(batch))batches.set(batch,{color:part.color,positions:[],normals:[]});
      const b=batches.get(batch),a=part.x,z=part.y,r=a+part.w,s=z+part.h;
      const level=(x,y,offset=height)=>naturalGroundAt(layout,x,y,cellMeters)+offset;
      b.positions.push(a,level(a,z),z,a,level(a,s),s,r,level(r,z),z,r,level(r,z),z,a,level(a,s),s,r,level(r,s),s);
      for(let i=0;i<6;i++)b.normals.push(0,1,0);
      // 边带垂直面很薄，仅解释15cm路缘，不能暗示新增障碍。
      if(part.height>=.10){
        for(const [u,v,t,q,nx,nz] of [[a,z,r,z,0,-1],[r,s,a,s,0,1],[a,s,a,z,-1,0],[r,z,r,s,1,0]]){
          b.positions.push(u,level(u,v,.002),v,u,level(u,v),v,t,level(t,q,.002),q,u,level(u,v),v,t,level(t,q),q,t,level(t,q,.002),q);
          for(let i=0;i<6;i++)b.normals.push(nx,0,nz);
        }
      }
    }
  }
  for(const b of batches.values()){
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(b.positions,3));geometry.setAttribute('normal',new THREE.Float32BufferAttribute(b.normals,3));geometry.computeBoundingSphere();
    const mesh=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({color:b.color,roughness:1}));mesh.receiveShadow=true;mesh.userData.ownGeometry=true;root.add(mesh);
  }
  return root;
}
