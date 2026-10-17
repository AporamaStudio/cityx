import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

// 品质园区严格按米缩放；共享已合批的索引几何，保留全部PBR贴图与材质差异。
export function createLandmarkModel(template,plot){
  const model=template.clone(true),materials=new Map();model.updateMatrixWorld(true);
  const bounds=new THREE.Box3().setFromObject(model),center=bounds.getCenter(new THREE.Vector3());
  // GLB已按材质离线合批，直接共享索引几何，避免运行时去索引再复制数百万面。
  model.traverse(node=>{if(node.isMesh){
    if(!materials.has(node.material))materials.set(node.material,node.material.clone());
    node.material=materials.get(node.material);node.castShadow=node.receiveShadow=true;
  }});
  const root=new THREE.Group();root.add(model);model.scale.setScalar(1/plot.cellMeters);
  model.position.set(-center.x/plot.cellMeters,-bounds.min.y/plot.cellMeters,-center.z/plot.cellMeters);
  root.position.set(plot.x+plot.w/2,0,plot.y+plot.h/2);return root;
}

// 连续废弃双轨接到两侧城外；路口保留平交通行，不模拟火车或新增运输规则。
export function createRailwayModel(layout,cellMeters){
  const root=new THREE.Group(),station=layout.blocks.find(p=>p.landmark==='railway');root.userData.cityNoPick=true;
  if(!layout.railBand||!station)return root;
  const batches=new Map(),colors={ballast:'#77776d',sleepers:'#777c72',rail:'#796b59'};
  const box=(kind,x,y,z,w,h,d)=>{
    const chunk=Math.floor(x/16),key=kind+':'+chunk;if(!batches.has(key))batches.set(key,{kind,geometries:[]});
    const geometry=new THREE.BoxGeometry(w,h,d);geometry.translate(x,y,z);batches.get(key).geometries.push(geometry);
  };
  // 模型由Blender导出，站台在园区北侧；轨心与GLB的27m/34m位置保持一致。
  for(const [left,right] of [[0,station.x],[station.x+station.width,layout.width]])for(const offset of [27,34]){
    const z=station.y+station.height/2-offset/cellMeters;
    for(let x=left;x<right;x+=16){const w=Math.min(16,right-x),center=x+w/2;
      box('ballast',center,.3/cellMeters,z,w,.5/cellMeters,4.6/cellMeters);
      for(const side of [-1,1])box('rail',center,.79/cellMeters,z+side*.72/cellMeters,w,.24/cellMeters,.15/cellMeters);
    }
    for(let x=left+.5/cellMeters;x<right;x+=1/cellMeters)box('sleepers',x,.57/cellMeters,z,.24/cellMeters,.18/cellMeters,2.5/cellMeters);
  }
  const materials=Object.fromEntries(Object.entries(colors).map(([key,color])=>[key,new THREE.MeshStandardMaterial({color,roughness:1})]));
  for(const {kind,geometries} of batches.values()){
    const geometry=mergeGeometries(geometries);geometries.forEach(g=>g.dispose());
    const mesh=new THREE.Mesh(geometry,materials[kind]);mesh.receiveShadow=true;mesh.userData.ownGeometry=true;root.add(mesh);
  }
  return root;
}
