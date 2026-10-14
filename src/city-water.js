import * as THREE from 'three';

// 世界坐标波纹只改变材质，不挪岸线或水域权限；昼夜、暂停与减少动态共用原时钟。
export function createWaterMaterial(){
  const material=new THREE.MeshStandardMaterial({color:'#ffffff',roughness:.38,metalness:.02,side:THREE.DoubleSide});
  const uniforms={time:{value:0},night:{value:0},shallow:{value:new THREE.Color('#739e97')},deep:{value:new THREE.Color('#426e81')}};material.userData.cityWater=uniforms;
  material.onBeforeCompile=shader=>{
    shader.uniforms.cityWaterTime=uniforms.time;shader.uniforms.cityWaterNight=uniforms.night;shader.uniforms.cityWaterShallow=uniforms.shallow;shader.uniforms.cityWaterDeep=uniforms.deep;
    shader.vertexShader='attribute float cityWaterDepth;\nvarying float cityWaterD;\nvarying vec2 cityWaterXZ;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\ncityWaterD=cityWaterDepth;cityWaterXZ=(modelMatrix*vec4(transformed,1.)).xz;');
    shader.fragmentShader='uniform float cityWaterTime;\nuniform float cityWaterNight;\nuniform vec3 cityWaterShallow;\nuniform vec3 cityWaterDeep;\nvarying float cityWaterD;\nvarying vec2 cityWaterXZ;\n'+shader.fragmentShader.replace('#include <color_fragment>','#include <color_fragment>\nvec2 cityWaterPoint=cityWaterXZ+.08*vec2(sin(cityWaterXZ.y*.61+cityWaterXZ.x*.13),sin(cityWaterXZ.x*.4));float wave=sin(cityWaterPoint.x*6.+cityWaterPoint.y*18.-cityWaterTime*.3)+.4*sin(cityWaterPoint.x*8.3+cityWaterPoint.y*24.4-cityWaterTime*.2);float glint=pow(.5+.5*sin(cityWaterPoint.x*8.3+cityWaterPoint.y*24.4-cityWaterTime*.2),20.)*smoothstep(.6,.95,.5+.5*sin(cityWaterPoint.x*1.3-cityWaterPoint.y*.5));diffuseColor.rgb=mix(cityWaterShallow,cityWaterDeep,smoothstep(0.,.75,cityWaterD))*(1.+wave*.012)+vec3(glint*.015*(1.-cityWaterNight*.6));');
    shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_maps>','#include <normal_fragment_maps>\nnormal=normalize(normal+mat3(viewMatrix)*vec3(cos(cityWaterPoint.x*6.+cityWaterPoint.y*18.-cityWaterTime*.3)*.008,0.,cos(cityWaterPoint.x*8.3+cityWaterPoint.y*24.4-cityWaterTime*.2)*.008));');
  };
  material.customProgramCacheKey=()=> 'cityx-water-depth-ripple';return material;
}
export function updateWater(root,time,night,reducedMotion=false){
  root.traverse(node=>{const uniforms=node.material?.userData.cityWater;if(uniforms){uniforms.time.value=reducedMotion?0:time;uniforms.night.value=night;}});
}
