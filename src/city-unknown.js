import * as THREE from 'three';

// 未知城区只保留无类型、无细节的统一体量；不读取用途、敌源、修复或运营信息。
export function createUnknownCity(layout,plots,roadMesh=null){
  const root=new THREE.Group();root.userData.cityNoPick=true;
  if(plots.length){
    const boxes=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),new THREE.MeshStandardMaterial({color:'#899b9e',roughness:1}),plots.length),matrix=new THREE.Matrix4();
    plots.forEach(({x,y,w,h},i)=>{matrix.makeScale(Math.max(.1,w-.3),.22,Math.max(.1,h-.3));matrix.setPosition(x+w/2,.11,y+h/2);boxes.setMatrixAt(i,matrix);});boxes.instanceMatrix.needsUpdate=true;boxes.computeBoundingBox();boxes.computeBoundingSphere();boxes.userData.ownGeometry=true;root.add(boxes);
  }
  if(!roadMesh){
    const positions=[],normals=[],indices=[];
    for(let y=0;y<layout.height;y++)for(let x=0;x<layout.width;x++)if(layout.tiles[y*layout.width+x]==='road'){
      const n=positions.length/3;positions.push(x,-.012,y,x,-.012,y+1,x+1,-.012,y,x+1,-.012,y+1);indices.push(n,n+1,n+2,n+2,n+1,n+3);for(let i=0;i<4;i++)normals.push(0,1,0);
    }
    if(positions.length){const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));geometry.setIndex(indices);roadMesh=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({color:'#7c9198',roughness:1}));roadMesh.userData.ownGeometry=true;}
  }
  if(roadMesh)root.add(roadMesh);root.userData.roadMesh=roadMesh;
  return root;
}
