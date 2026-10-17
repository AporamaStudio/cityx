import * as THREE from 'three';

// 只按影响程序结构的特征复用，颜色/光强等uniform不重复生成代表材质。
export function shaderSampleKey(node,material){
  const flags=['side','transparent','alphaHash','flatShading','vertexColors','premultipliedAlpha','toneMapped','dithering','fog','forceSinglePass','wireframe','normalMapType','blending','depthPacking'];
  const maps=['map','alphaMap','normalMap','roughnessMap','metalnessMap','emissiveMap','aoMap','lightMap','bumpMap','displacementMap','envMap','gradientMap'];
  return JSON.stringify([material.type,material.customProgramCacheKey(),flags.map(key=>material[key]),material.alphaTest>0,material.defines,
    maps.map(key=>material[key]?[key,material[key].channel,material[key].mapping,material[key].colorSpace]:null),
    Object.entries(node.geometry?.attributes??{}).map(([key,value])=>[key,value.itemSize,value.normalized]).sort(),
    !!node.isInstancedMesh,!!node.instanceColor,!!node.isSkinnedMesh,!!node.receiveShadow,Object.keys(node.geometry?.morphAttributes??{}).sort()]);
}

export function cloneWarmupMaterial(material){
  const copy=material.clone();copy.onBeforeCompile=material.onBeforeCompile;copy.customProgramCacheKey=material.customProgramCacheKey;return copy;
}

// 准备容器不挂进真实场景；副本材质独占currentProgram，避免白天绘制干扰异步就绪检查。
export function createShaderSamples(){
  const cache=new Map();
  function clear(keep=new Set()){for(const [key,entry] of cache)if(!keep.has(key)){entry.root.traverse(node=>{if(node.material)node.material.dispose();});cache.delete(key);}}
  return {
    reset:()=>clear(),
    prepare(root,camera,nightLights,scene){
      const sources=new Set(nightLights);scene.traverseVisible(node=>{if(node.isLight&&node.layers.test(camera.layers))sources.add(node);});
      const batches=[],keep=new Set();
      for(const night of [false,true]){
        const target=new THREE.Scene();target.environment=scene.environment;target.fog=scene.fog;
        const kinds=[];
        for(const light of sources){
          if(light.userData.cityPointGrid)continue;
          if(!night&&light.userData.cityNightOnly)continue;
          const copy=light.clone();copy.visible=true;target.add(copy);kinds.push(light.type+':'+light.castShadow);
        }
        const lighting=kinds.sort().join(',');
        root.traverse(node=>{
          if(!node.material||!node.geometry&&!node.isSprite)return;
          for(const material of Array.isArray(node.material)?node.material:[node.material]){
            const key=lighting+'|'+shaderSampleKey(node,material);keep.add(key);let entry=cache.get(key);
            if(!entry){
              const proxy=node.clone(false);proxy.material=cloneWarmupMaterial(material);proxy.visible=true;
              const group=new THREE.Group();group.add(proxy);entry={root:group,ready:false};cache.set(key,entry);
            }
            if(entry.ready||batches.some(batch=>batch.entry===entry))continue;
            batches.push({entry,root:entry.root,scene:target,complete:()=>{entry.ready=true;}});
          }
        });
      }
      return {batches,complete:()=>clear(keep)};
    },
  };
}
