import * as THREE from 'three';

// 污染是环境状态，不替代战争迷雾；同一张真实净化遮罩用于地面与楼体。
export function createCityPollution(scene){
  const group=new THREE.Group();group.userData.cityNoPick=true;scene.add(group);
  const bytes=new Uint8Array(60*60*4),texture=new THREE.DataTexture(bytes,60,60);texture.magFilter=texture.minFilter=THREE.NearestFilter;
  const mask={value:texture},strength={value:.55},time={value:0};let lastPure=null,lastVisible=null;
  const dustGeometry=new THREE.BufferGeometry(),points=new Float32Array(240*3);
  for(let i=0;i<240;i++){points[i*3]=(i*17.319)%60;points[i*3+1]=.1+(i*.137)%1.4;points[i*3+2]=(i*23.717)%60;}
  dustGeometry.setAttribute('position',new THREE.BufferAttribute(points,3));
  const dust=new THREE.Points(dustGeometry,new THREE.ShaderMaterial({transparent:true,depthWrite:false,uniforms:{ashMask:mask,ashTime:time,opacity:{value:.24}},vertexShader:`uniform sampler2D ashMask;uniform float ashTime;varying float visibleAsh;void main(){vec3 p=position;p.x=mod(p.x+ashTime*.035,60.);p.y+=sin(ashTime*.25+p.x)*.08;visibleAsh=texture2D(ashMask,p.xz/60.).g;gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);gl_PointSize=3.;}`,fragmentShader:`uniform float opacity;varying float visibleAsh;void main(){float a=1.-smoothstep(.1,.5,length(gl_PointCoord-.5));gl_FragColor=vec4(.73,.74,.67,a*opacity*visibleAsh);}`}));group.add(dust);
  // 少量高位脏云保留通透孔隙，不能覆盖战术UI，也不能揭露未知物体。
  const canvas=document.createElement('canvas');canvas.width=canvas.height=64;const ctx=canvas.getContext('2d'),gradient=ctx.createRadialGradient(32,32,0,32,32,32);gradient.addColorStop(0,'#c0bdaa80');gradient.addColorStop(.45,'#9d9e9670');gradient.addColorStop(1,'#9d9e9600');ctx.fillStyle=gradient;ctx.fillRect(0,0,64,64);
  const cloudTexture=new THREE.CanvasTexture(canvas),clouds=[];
  for(let y=3;y<60;y+=6)for(let x=3;x<60;x+=6){const cloud=new THREE.Sprite(new THREE.SpriteMaterial({map:cloudTexture,transparent:true,depthWrite:false,opacity:.22}));cloud.position.set(x,3,y);cloud.scale.set(7,4,1);cloud.userData.anchor=[x,y];group.add(cloud);clouds.push(cloud);}
  function bind(object){object.traverse(node=>{if(!node.isMesh||node.userData.cityPreview)return;for(const material of Array.isArray(node.material)?node.material:[node.material]){
    if(!material?.isMeshStandardMaterial||material.userData.cityAsh)continue;
    const previous=material.onBeforeCompile,cache=material.customProgramCacheKey();material.userData.cityAsh=true;
    material.onBeforeCompile=shader=>{previous.call(material,shader);Object.assign(shader.uniforms,{ashMask:mask,ashStrength:strength});
      shader.vertexShader='varying vec3 ashPoint;\n'+shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
vec4 ashVertex=vec4(transformed,1.);
#ifdef USE_INSTANCING
ashVertex=instanceMatrix*ashVertex;
#endif
ashPoint=(modelMatrix*ashVertex).xyz;`);
      shader.fragmentShader='uniform sampler2D ashMask;uniform float ashStrength;varying vec3 ashPoint;\n'+shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
float ashOutside=step(0.,ashPoint.x)*step(0.,ashPoint.z)*step(ashPoint.x,60.)*step(ashPoint.z,60.);
float ashAmount=texture2D(ashMask,ashPoint.xz/60.).r*ashStrength*ashOutside;
float ashGrain=fract(sin(dot(floor(ashPoint.xz*75.),vec2(12.9898,78.233)))*43758.5453);
float ashLuma=dot(diffuseColor.rgb,vec3(.2126,.7152,.0722));
diffuseColor.rgb=mix(diffuseColor.rgb,vec3(ashLuma*.48+.22+ashGrain*.05),ashAmount);`);
    };material.customProgramCacheKey=()=>cache+':cityx-ash-v1';material.needsUpdate=true;
  }});}
  return {group,bind,update(purified,visible,params,clock,reducedMotion){
    if(purified!==lastPure||visible!==lastVisible){for(let id=0;id<3600;id++){const polluted=!purified.has(id);bytes[id*4]=polluted?255:0;bytes[id*4+1]=polluted&&visible.has(id)?255:0;bytes[id*4+3]=255;}texture.needsUpdate=true;lastPure=purified;lastVisible=visible;}
    strength.value=params.pollutionAshPercent/100;time.value=reducedMotion?0:clock;dust.material.uniforms.opacity.value=params.pollutionDustPercent/100;
    for(const cloud of clouds){const [x,y]=cloud.userData.anchor,id=Math.floor(y)*60+Math.floor(x);cloud.visible=!!bytes[id*4+1];cloud.material.opacity=params.pollutionCloudPercent/100;cloud.position.y=params.pollutionCloudHeightMeters/params.cellMeters;cloud.position.x=x+(reducedMotion?0:Math.sin(clock*.055+y)*.7);}
  }};
}
