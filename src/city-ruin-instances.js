import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

// 仅合并所有属性数值完全相同的顶点；不设空间容差、不删三角面，也不跨法线/UV硬边。
export function indexExactGeometry(geometry){
  const attributes=Object.entries(geometry.attributes);if(attributes.some(([,a])=>a.isInterleavedBufferAttribute))return geometry;
  const vertices=geometry.attributes.position.count,keys=new Map(),remap=new Uint32Array(vertices),values=attributes.map(()=>[]);
  for(let i=0;i<vertices;i++){
    const key=attributes.map(([,a])=>Array.from(a.array.subarray(i*a.itemSize,(i+1)*a.itemSize)).join(',')).join('|');let index=keys.get(key);
    if(index===undefined){index=keys.size;keys.set(key,index);attributes.forEach(([,a],n)=>{for(let c=0;c<a.itemSize;c++)values[n].push(a.array[i*a.itemSize+c]);});}remap[i]=index;
  }
  const indices=geometry.index?[...geometry.index.array].map(i=>remap[i]):[...remap];
  attributes.forEach(([name,a],n)=>geometry.setAttribute(name,new THREE.BufferAttribute(new a.array.constructor(values[n]),a.itemSize,a.normalized)));geometry.setIndex(indices);return geometry;
}

// 同一废墟模板仅保留一份索引几何；贴图与纯色分组，完整保留原碎块和材质差异。
export function ruinInstanceTemplates(template,style){
  const model=template.clone(true),groups=new Map();model.traverse(node=>{if(node.isMesh){node.material=node.material.clone();node.material.roughness=.95;}});style(model);model.updateMatrixWorld(true);
  model.traverse(node=>{
    if(!node.isMesh)return;const material=node.material;
    const key=JSON.stringify([material.map?.uuid,material.normalMap?.uuid,material.side,material.roughness,material.metalness,material.opacity,material.transparent,material.emissive?.getHex(),material.customProgramCacheKey()]);
    if(!groups.has(key))groups.set(key,{material,geometries:[]});
    const geometry=node.geometry.clone();geometry.applyMatrix4(node.matrixWorld);
    // 普通模型没有顶点动画；补齐UV只为兼容同组纯色碎块，不改变原贴图UV。
    const count=geometry.attributes.position.count,original=geometry.attributes.color,colors=new Float32Array(count*3),rgb=material.map?[1,1,1]:[material.color.r,material.color.g,material.color.b];
    for(let i=0;i<count;i++)for(let c=0;c<3;c++)colors[i*3+c]=(original?original.getComponent(i,c):1)*rgb[c];
    for(const name of Object.keys(geometry.attributes))if(!['position','normal','uv'].includes(name))geometry.deleteAttribute(name);
    if(!geometry.attributes.uv)geometry.setAttribute('uv',new THREE.BufferAttribute(new Float32Array(count*2),2));
    geometry.setAttribute('color',new THREE.BufferAttribute(colors,3));if(!geometry.index)geometry.setIndex(Array.from({length:count},(_,i)=>i));
    groups.get(key).geometries.push(geometry);
  });
  const result=[];
  for(const {material,geometries} of groups.values()){
    const geometry=indexExactGeometry(mergeGeometries(geometries));geometries.forEach(g=>g.dispose());material.vertexColors=true;if(!material.map)material.color.set('#ffffff');geometry.computeBoundingBox();geometry.computeBoundingSphere();result.push({geometry,material});
  }
  return result;
}

// 地块拾取与世界渲染共用模板和同一组变换；实例色只作用于原来会受选型染色的纯色材质。
export function createRuinInstances(slots,batch=false){
  const root=new THREE.Group(),groups=new Map();
  for(const slot of slots)for(const part of slot.parts){if(!groups.has(part))groups.set(part,[]);groups.get(part).push(slot);}
  for(const [part,list] of groups){
    const material=part.material.clone();material.onBeforeCompile=part.material.onBeforeCompile;material.customProgramCacheKey=part.material.customProgramCacheKey;
    const mesh=new THREE.InstancedMesh(part.geometry,material,list.length);mesh.castShadow=mesh.receiveShadow=true;mesh.userData.cityBatchMesh=batch;
    list.forEach((slot,i)=>{mesh.setMatrixAt(i,slot.matrix);mesh.setColorAt(i,new THREE.Color(material.map?'#ffffff':slot.tint));});mesh.instanceMatrix.needsUpdate=true;mesh.instanceColor.needsUpdate=true;mesh.computeBoundingSphere();mesh.computeBoundingBox();root.add(mesh);
  }
  return root;
}
