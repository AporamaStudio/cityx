import * as THREE from 'three';

// 世界格蒙版让完好方案与原楼体互补显示，保留炮位/已有经营格，不叠两栋楼。
export function bindConstructionMask(object,keepSelected){
  const uniforms={active:{value:0},cells:{value:null},bounds:{value:new THREE.Vector4()},side:{value:keepSelected?1:0}};
  const materials=new Set();object.traverse(node=>{if(node.isMesh)materials.add(node.material);});
  for(const material of materials){
    const previous=material.onBeforeCompile,cacheKey=material.customProgramCacheKey();
    material.onBeforeCompile=shader=>{
      previous.call(material,shader);
      Object.assign(shader.uniforms,{cityPlanActive:uniforms.active,cityPlanCells:uniforms.cells,cityPlanBounds:uniforms.bounds,cityPlanSide:uniforms.side});
      shader.vertexShader='varying vec2 cityPlanXZ;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\ncityPlanXZ=(modelMatrix*vec4(transformed,1.)).xz;');
      shader.fragmentShader='uniform float cityPlanActive;\nuniform sampler2D cityPlanCells;\nuniform vec4 cityPlanBounds;\nuniform float cityPlanSide;\nvarying vec2 cityPlanXZ;\n'+shader.fragmentShader.replace('#include <clipping_planes_fragment>','#include <clipping_planes_fragment>\nif(cityPlanActive>.5){vec2 planUV=(cityPlanXZ-cityPlanBounds.xy)/cityPlanBounds.zw;bool marked=all(greaterThanEqual(planUV,vec2(0.)))&&all(lessThan(planUV,vec2(1.)))&&texture2D(cityPlanCells,planUV).r>.5;if(marked!=(cityPlanSide>.5))discard;}');
    };
    material.customProgramCacheKey=()=>cacheKey+':cityx-construction-mask';material.needsUpdate=true;
  }
  return uniforms;
}

export function constructionMaskTexture(plan){
  const data=new Uint8Array(plan.w*plan.h*4);
  plan.mask.forEach((value,i)=>{data[i*4]=value?255:0;data[i*4+3]=255;});
  const texture=new THREE.DataTexture(data,plan.w,plan.h);texture.magFilter=texture.minFilter=THREE.NearestFilter;texture.needsUpdate=true;return texture;
}

// 统一浅青蓝而非原贴图褪色；不透明保留立体明暗，不创建窗灯或运营特效。
export function constructionAppearance(object){
  const material=new THREE.MeshStandardMaterial({color:'#73aabb',roughness:.9,emissive:'#315564',emissiveIntensity:.16});
  const previous=new Set();object.traverse(node=>{if(node.isMesh){previous.add(node.material);node.material=material;node.castShadow=false;node.userData.cityConstructionPreview=true;}});
  for(const old of previous)old.dispose();
  return bindConstructionMask(object,true);
}

export function setConstructionMask(uniforms,plan,texture){
  uniforms.active.value=plan?1:0;uniforms.cells.value=texture??null;
  if(plan)uniforms.bounds.value.set(plan.x,plan.y,plan.w,plan.h);
}
