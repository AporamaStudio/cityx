import * as THREE from 'three';

// 运营暖光直接写进真实楼体材质；不加悬浮光片、灯具或逐帧屋面射线。
export function operatingLights(object){
  object.updateMatrixWorld(true);
  const bounds=new THREE.Box3().setFromObject(object),size=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3());
  const roofBounds={value:new THREE.Vector4(center.x,center.z,1/Math.max(.001,size.x),1/Math.max(.001,size.z))};
  const roofHeight={value:new THREE.Vector2(bounds.min.y+(object.userData.podiumHeight??0)+size.y*.03,Math.max(.001,size.y*.02))};
  const materials=new Set();object.traverse(node=>{if(node.isMesh)for(const material of Array.isArray(node.material)?node.material:[node.material])materials.add(material);});
  for(const material of materials){
    if(!material.isMeshStandardMaterial)continue;
    const previous=material.onBeforeCompile,cacheKey=material.customProgramCacheKey();
    material.userData.cityPower={value:0};
    material.onBeforeCompile=shader=>{
      previous.call(material,shader);
      Object.assign(shader.uniforms,{cityWindowPower:material.userData.cityPower,cityRoofBounds:roofBounds,cityRoofHeight:roofHeight});
      shader.vertexShader='varying vec3 cityLightPoint;\nvarying vec2 cityLightSurface;\n'+shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
vec3 cityLightNormal=inverseTransformDirection(transformedNormal,viewMatrix);
cityLightPoint=(modelMatrix*vec4(transformed,1.)).xyz;
cityLightSurface=vec2(1.-smoothstep(.35,.6,abs(cityLightNormal.y)),smoothstep(.28,.7,cityLightNormal.y));`);
      shader.fragmentShader='uniform float cityWindowPower;\nuniform vec4 cityRoofBounds;\nuniform vec2 cityRoofHeight;\nvarying vec3 cityLightPoint;\nvarying vec2 cityLightSurface;\n'+shader.fragmentShader.replace('#include <emissivemap_fragment>',`#include <emissivemap_fragment>
if(cityWindowPower>0.){
  float cityGlass=step(diffuseColor.r*1.8,diffuseColor.b)*step(diffuseColor.g*1.25,diffuseColor.b)*step(.1,diffuseColor.b)*cityLightSurface.x;
  // 四处柔和受光区由实际屋面裁切，跨屋脊时自然随几何转折；底座和立面不染暖光。
  vec2 cityRoofDelta=(abs((cityLightPoint.xz-cityRoofBounds.xy)*cityRoofBounds.zw)-vec2(.22,.18))/vec2(.17,.15);
  float cityRoofGlow=(1.-smoothstep(0.,1.,dot(cityRoofDelta,cityRoofDelta)))*cityLightSurface.y*smoothstep(cityRoofHeight.x,cityRoofHeight.x+cityRoofHeight.y,cityLightPoint.y);
  totalEmissiveRadiance+=cityWindowPower*(vec3(1.,.54,.18)*cityGlass*1.1+vec3(1.,.57,.24)*cityRoofGlow*.38*(.35+.65*diffuseColor.rgb));
}`);
    };
    material.customProgramCacheKey=()=>cacheKey+':cityx-game-windows-roof-v1';material.needsUpdate=true;
  }
}
