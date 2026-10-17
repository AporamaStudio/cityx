import * as THREE from 'three';

// 无阴影火光按世界4格分桶；保存全部可能贡献的灯，不截数量、不改变衰减和亮度。
export function pointLightGrid(lights,span=4){
  if(!lights.length)return {data:new Float32Array(4),width:1,height:1,x:0,y:0,nx:1,ny:1,packets:0,peak:0};
  const x=Math.floor(Math.min(...lights.map(l=>l.position.x-l.distance))/span)*span,y=Math.floor(Math.min(...lights.map(l=>l.position.z-l.distance))/span)*span;
  const nx=Math.max(1,Math.ceil((Math.max(...lights.map(l=>l.position.x+l.distance))-x)/span)),ny=Math.max(1,Math.ceil((Math.max(...lights.map(l=>l.position.z+l.distance))-y)/span)),buckets=Array.from({length:nx*ny},()=>[]);
  lights.forEach((light,index)=>{
    for(let row=Math.max(0,Math.floor((light.position.z-light.distance-y)/span));row<=Math.min(ny-1,Math.floor((light.position.z+light.distance-y)/span));row++)for(let col=Math.max(0,Math.floor((light.position.x-light.distance-x)/span));col<=Math.min(nx-1,Math.floor((light.position.x+light.distance-x)/span));col++)buckets[row*nx+col].push(index+1);
  });
  const peak=Math.max(...buckets.map(list=>list.length)),packets=Math.ceil(peak/4),width=nx*packets,data=new Float32Array(width*ny*4);
  buckets.forEach((list,index)=>{const row=Math.floor(index/nx),col=index%nx;list.forEach((id,i)=>{data[(row*width+col*packets+Math.floor(i/4))*4+i%4]=id;});});
  return {data,width,height:ny,x,y,nx,ny,packets,peak};
}

const fragment=`
#ifdef RE_Direct
vec2 cityTile=floor((cityPointWorld.xz-cityPointBounds.xy)/4.);
if(all(greaterThanEqual(cityTile,vec2(0.)))&&all(lessThan(cityTile,cityPointBounds.zw))){
  for(int packet=0;packet<int(cityPointShape.z);packet++){
    vec4 ids=texture2D(cityPointIndices,vec2((cityTile.x*cityPointShape.z+float(packet)+.5)/cityPointShape.x,(cityTile.y+.5)/cityPointShape.y));
    for(int component=0;component<4;component++){
      float id=component==0?ids.x:component==1?ids.y:component==2?ids.z:ids.w;if(id<.5)continue;
      vec4 positionRange=texture2D(cityPointData,vec2(.25,(id-.5)/cityPointShape.w)),colorDecay=texture2D(cityPointData,vec2(.75,(id-.5)/cityPointShape.w));
      vec3 vector=(viewMatrix*vec4(positionRange.xyz,1.)).xyz-geometryPosition;
      IncidentLight cityLight;cityLight.direction=normalize(vector);cityLight.color=colorDecay.rgb*getDistanceAttenuation(length(vector),positionRange.w,colorDecay.a);cityLight.visible=any(notEqual(cityLight.color,vec3(0.)));
      RE_Direct(cityLight,geometryPosition,geometryNormal,geometryViewDir,geometryClearcoatNormal,material,reflectedLight);
    }
  }
}
#endif
`;
const texture=(data,width,height)=>{const result=new THREE.DataTexture(data,width,height,THREE.RGBAFormat,THREE.FloatType);result.needsUpdate=true;return result;};

export function createCityPointGrid(){
  const uniforms={cityPointIndices:{value:texture(new Float32Array(4),1,1)},cityPointData:{value:texture(new Float32Array(8),2,1)},cityPointBounds:{value:new THREE.Vector4(0,0,1,1)},cityPointShape:{value:new THREE.Vector4(1,1,0,1)}};
  let key='',peak=0,count=0;
  return {
    bind(material){
      if(!material.isMeshStandardMaterial||material.userData.cityPointGrid)return;
      material.userData.cityPointGrid=true;const previous=material.onBeforeCompile,cacheKey=material.customProgramCacheKey();
      material.onBeforeCompile=shader=>{
        previous.call(material,shader);Object.assign(shader.uniforms,uniforms);
        shader.vertexShader='varying vec3 cityPointWorld;\n'+shader.vertexShader.replace('#include <project_vertex>','#include <project_vertex>\nvec4 cityPointLocal=vec4(transformed,1.);\n#ifdef USE_INSTANCING\ncityPointLocal=instanceMatrix*cityPointLocal;\n#endif\ncityPointWorld=(modelMatrix*cityPointLocal).xyz;');
        shader.fragmentShader='uniform sampler2D cityPointIndices;\nuniform sampler2D cityPointData;\nuniform vec4 cityPointBounds;\nuniform vec4 cityPointShape;\nvarying vec3 cityPointWorld;\n'+shader.fragmentShader.replace('#include <lights_fragment_begin>','#include <lights_fragment_begin>\n'+fragment);
      };
      material.customProgramCacheKey=()=>cacheKey+':cityx-point-grid';material.needsUpdate=true;
    },
    update(lights){
      for(const light of lights){light.userData.cityPointGrid=true;light.visible=false;}
      const active=lights.filter(light=>light.intensity>0),signature=active.map(l=>`${l.uuid}:${l.position.x}:${l.position.y}:${l.position.z}:${l.distance}`).join('|');count=active.length;
      if(signature!==key){
        const grid=pointLightGrid(active);uniforms.cityPointIndices.value.dispose();uniforms.cityPointIndices.value=texture(grid.data,grid.width,grid.height);uniforms.cityPointBounds.value.set(grid.x,grid.y,grid.nx,grid.ny);uniforms.cityPointShape.value.set(grid.width,grid.height,grid.packets,uniforms.cityPointData.value.image.height);peak=grid.peak;key=signature;
      }
      const capacity=Math.max(1,2**Math.ceil(Math.log2(Math.max(1,count))));
      if(uniforms.cityPointData.value.image.height!==capacity){uniforms.cityPointData.value.dispose();uniforms.cityPointData.value=texture(new Float32Array(capacity*8),2,capacity);}
      const data=uniforms.cityPointData.value.image.data;data.fill(0);
      active.forEach((light,i)=>data.set([light.position.x,light.position.y,light.position.z,light.distance,light.color.r*light.intensity,light.color.g*light.intensity,light.color.b*light.intensity,light.decay],i*8));
      uniforms.cityPointData.value.needsUpdate=true;uniforms.cityPointShape.value.w=capacity;
    },
    stats:()=>({clusterLights:count,clusterPeak:peak}),
    reset(){key='';peak=count=0;uniforms.cityPointShape.value.z=0;},
  };
}
