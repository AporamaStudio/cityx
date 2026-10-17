import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
const imageIds=new WeakMap();let nextImageId=0;
const imageKey=texture=>{if(!texture)return '';const image=texture.image;if(!imageIds.has(image))imageIds.set(image,++nextImageId);return [imageIds.get(image),texture.wrapS,texture.wrapT,texture.colorSpace,texture.flipY].join(':');};

// 静态废墟共用提交；颜色烘进顶点，保留所有三角面、法线、纹理和原地块拾取。
// 原拾取网格改用合批数组的视图，避免同时保留两份全城顶点数据。
export function batchStaticPlots(objects){
  const root=new THREE.Group(),groups=new Map(),maps=new Set();root.userData.citySharedTextures=true;root.userData.cityBatchTextures=[];
  for(const object of objects){
    object.updateMatrixWorld(true);
    object.traverse(node=>{
      if(!node.isMesh)return;
      const material=node.material,source=node.geometry;
      const key=JSON.stringify([material.type,imageKey(material.map),material.normalMap?.uuid,material.roughness,material.metalness,material.emissive?.getHex(),material.emissiveIntensity,material.opacity,material.transparent,material.side,node.castShadow,node.receiveShadow,material.customProgramCacheKey(),Object.keys(source.attributes).filter(k=>k!=='color').sort()]);
      if(!groups.has(key))groups.set(key,{material,castShadow:node.castShadow,receiveShadow:node.receiveShadow,sources:[],geometries:[]});
      const batch=groups.get(key),geometry=source.index?source.toNonIndexed():source.clone(),count=geometry.attributes.position.count;
      geometry.applyMatrix4(node.matrixWorld);
      if(material.map&&geometry.attributes.uv){material.map.updateMatrix();geometry.attributes.uv.applyMatrix3(material.map.matrix);maps.add(material.map);}
      const colors=new Float32Array(count*3),original=geometry.attributes.color,rgb=[material.color.r,material.color.g,material.color.b];
      for(let i=0;i<count;i++)for(let c=0;c<3;c++)colors[i*3+c]=(original?original.array[i*original.itemSize+c]:1)*(source.userData.cityBakedColor?1:rgb[c]);
      geometry.setAttribute('color',new THREE.BufferAttribute(colors,3));
      batch.sources.push({node,count});batch.geometries.push(geometry);
    });
  }
  for(const {material,castShadow,receiveShadow,sources,geometries} of groups.values()){
    const geometry=mergeGeometries(geometries),copy=material.clone();copy.onBeforeCompile=material.onBeforeCompile;copy.customProgramCacheKey=material.customProgramCacheKey;
    if(copy.map){copy.map=copy.map.clone();copy.map.repeat.set(1,1);copy.map.offset.set(0,0);copy.map.center.set(0,0);copy.map.rotation=0;copy.map.updateMatrix();copy.map.needsUpdate=true;root.userData.cityBatchTextures.push(copy.map);}
    copy.color.set('#ffffff');copy.vertexColors=true;
    const mesh=new THREE.Mesh(geometry,copy);mesh.castShadow=castShadow;mesh.receiveShadow=receiveShadow;mesh.userData.ownGeometry=true;mesh.userData.cityBatchMesh=true;root.add(mesh);
    let offset=0;
    for(const {node,count} of sources){
      const source=node.geometry;source.dispose();source.setIndex(null);
      for(const [name,attribute] of Object.entries(geometry.attributes))source.setAttribute(name,new THREE.BufferAttribute(attribute.array.subarray(offset*attribute.itemSize,(offset+count)*attribute.itemSize),attribute.itemSize,attribute.normalized));
      source.boundingBox=source.boundingSphere=null;source.userData.cityBakedColor=true;offset+=count;
    }
    for(const geometry of geometries)geometry.dispose();
  }
  // 合批坐标已是世界坐标；只重置原拾取网格的矩阵，不移动实际顶点。
  for(const object of objects)object.traverse(node=>{node.position.set(0,0,0);node.rotation.set(0,0,0);node.scale.setScalar(1);node.matrix.identity();node.matrixWorld.identity();});
  for(const map of maps){map.repeat.set(1,1);map.offset.set(0,0);map.center.set(0,0);map.rotation=0;map.updateMatrix();}
  return root;
}
