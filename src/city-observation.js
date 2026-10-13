import * as THREE from 'three';
import {viewCenter} from './city-view.js?v=1';

// 原城市对象共用观察相机，不复制游戏状态；雾纹按世界XZ覆盖楼顶和地面。
export function createCityObservation(scene,renderer){
  const camera=new THREE.OrthographicCamera(),canvas=document.createElement('canvas');
  let pickObjects=[];
  const groundTexture=new THREE.CanvasTexture(document.createElement('canvas'));groundTexture.colorSpace=THREE.SRGBColorSpace;groundTexture.generateMipmaps=false;groundTexture.minFilter=THREE.LinearFilter;
  const fogTexture=new THREE.CanvasTexture(document.createElement('canvas'));fogTexture.flipY=false;fogTexture.generateMipmaps=false;fogTexture.minFilter=THREE.LinearFilter;
  const fog={enabled:{value:0},texture:{value:fogTexture},bounds:{value:new THREE.Vector4(-8,-8,76,76)}};
  const floor=new THREE.Mesh(new THREE.PlaneGeometry(76,76),new THREE.MeshStandardMaterial({map:groundTexture,roughness:1,transparent:true,depthWrite:false}));floor.rotation.x=-Math.PI/2;floor.position.set(30,-.014,30);floor.receiveShadow=true;floor.visible=false;scene.add(floor);
  function bind(object){object.traverse(node=>{if(!node.isMesh&&!node.isLine)return;const material=node.material;if(material.userData.cityObserveFog)return;
    material.userData.cityObserveFog=true;const previous=material.onBeforeCompile,key=material.customProgramCacheKey();
    material.onBeforeCompile=shader=>{
      previous.call(material,shader);shader.uniforms.cityObserveFog=fog.texture;shader.uniforms.cityObserveActive=fog.enabled;shader.uniforms.cityObserveBounds=fog.bounds;
      shader.vertexShader='varying vec2 cityObserveXZ;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\ncityObserveXZ=(modelMatrix*vec4(transformed,1.)).xz;');
      shader.fragmentShader='uniform sampler2D cityObserveFog;\nuniform float cityObserveActive;\nuniform vec4 cityObserveBounds;\nvarying vec2 cityObserveXZ;\n'+shader.fragmentShader.replace('#include <colorspace_fragment>','#include <colorspace_fragment>\nif(cityObserveActive>.5){vec2 uv=(cityObserveXZ-cityObserveBounds.xy)/cityObserveBounds.zw;vec4 mist=texture2D(cityObserveFog,clamp(uv,0.,1.));gl_FragColor.rgb=mix(gl_FragColor.rgb,mist.rgb,mist.a);float rim=min(min(uv.x,uv.y),min(1.-uv.x,1.-uv.y));gl_FragColor.a*=smoothstep(0.,.06,rim);}');
    };
    material.customProgramCacheKey=()=>key+':cityx-observe-fog';material.needsUpdate=true;
  });}
  return {
    pick(x,y,width,height){
      const ray=new THREE.Raycaster();ray.setFromCamera(new THREE.Vector2(x/width*2-1,1-y/height*2),camera);
      const hit=ray.intersectObjects(pickObjects,true).find(hit=>!hit.object.material.transparent);return hit?{x:hit.point.x,y:hit.point.z}:null;
    },
    render({ground,mist,view,background,objects,enemies,effects}){
      pickObjects=[...objects,floor];
      groundTexture.image=ground;groundTexture.needsUpdate=true;fogTexture.image=mist;fogTexture.needsUpdate=true;
      const {width,height,cell,yaw,elevation}=view,center=viewCenter(view),distance=100;
      camera.left=-width/(2*cell);camera.right=width/(2*cell);camera.top=height/(2*cell);camera.bottom=-height/(2*cell);camera.near=.1;camera.far=300;
      camera.position.set(center.x+Math.sin(yaw)*Math.cos(elevation)*distance,Math.sin(elevation)*distance,center.y+Math.cos(yaw)*Math.cos(elevation)*distance);camera.up.set(0,1,0);camera.lookAt(center.x,0,center.y);camera.updateProjectionMatrix();
      floor.visible=true;for(const object of [floor,...objects,effects]){object.visible=true;bind(object);}fog.enabled.value=1;
      // 敌人已按原插值中心渐隐；单独在雾上绘制，避免楼体遮住本应可见的敌群。
      enemies.visible=false;renderer.setClearColor(background,1);renderer.render(scene,camera);
      if(canvas.width!==renderer.domElement.width||canvas.height!==renderer.domElement.height){canvas.width=renderer.domElement.width;canvas.height=renderer.domElement.height;}
      const ctx=canvas.getContext('2d');ctx.clearRect(0,0,canvas.width,canvas.height);ctx.drawImage(renderer.domElement,0,0);
      floor.visible=false;objects.forEach(object=>object.visible=false);effects.visible=false;fog.enabled.value=0;enemies.visible=true;
      renderer.setClearColor('#000000',0);renderer.render(scene,camera);ctx.drawImage(renderer.domElement,0,0);enemies.visible=false;
      return canvas;
    },
  };
}
