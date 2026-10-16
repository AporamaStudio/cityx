import * as THREE from 'three';
import {viewCenter,viewDistance} from './city-view.js?v=3';

// 仅用于已定位完成且父层不移动的静态景物；材质/可见性仍可更新，替换模型重新登记。
export function freezeCityTransforms(object){
  object.updateMatrixWorld(true);object.traverse(node=>{node.matrixAutoUpdate=false;node.matrixWorldAutoUpdate=false;});
}

// 原城市对象共用观察相机，不复制游戏状态；雾纹按世界XZ覆盖楼顶和地面。
export function createCityObservation(scene,renderer){
  const orthographic=new THREE.OrthographicCamera(),perspective=new THREE.PerspectiveCamera();
  let camera=orthographic;
  const canvas=document.createElement('canvas'),enemyCanvas=document.createElement('canvas');
  let pickCandidates=[],lastGeometryVersion=null,hasEnemyFrame=false;
  const ray=new THREE.Raycaster(),pointer=new THREE.Vector2(),pickMeshes=[],hits=[];
  const fogTexture=new THREE.CanvasTexture(document.createElement('canvas'));fogTexture.flipY=false;fogTexture.generateMipmaps=false;fogTexture.minFilter=THREE.LinearFilter;
  const fog={enabled:{value:0},texture:{value:fogTexture},bounds:{value:new THREE.Vector4(-8,-8,76,76)}};
  const floor=new THREE.Mesh(new THREE.PlaneGeometry(76,76),new THREE.MeshStandardMaterial({color:'#697b70',roughness:1}));floor.rotation.x=-Math.PI/2;floor.position.set(30,-.014,30);floor.receiveShadow=true;floor.visible=false;scene.add(floor);freezeCityTransforms(floor);
  // 拾取和绘制共用相机配置；旋转/缩放后快速点击也使用当前矩阵。
  function setCamera(view){
    const {width,height,cell,yaw,elevation}=view,center=viewCenter(view),distance=viewDistance(view);
    camera=view.projection==='perspective'?perspective:orthographic;
    if(camera===perspective){camera.fov=view.fov;camera.aspect=width/height;camera.near=distance*.05;camera.far=distance+300;}
    else{camera.left=-width/(2*cell);camera.right=width/(2*cell);camera.top=height/(2*cell);camera.bottom=-height/(2*cell);camera.near=.1;camera.far=300;}
    camera.position.set(center.x+Math.sin(yaw)*Math.cos(elevation)*distance,Math.sin(elevation)*distance,center.y+Math.cos(yaw)*Math.cos(elevation)*distance);camera.up.set(0,Math.abs(Math.cos(elevation))<1e-6?0:1,Math.abs(Math.cos(elevation))<1e-6?-1:0);camera.lookAt(center.x,0,center.y);camera.updateProjectionMatrix();camera.updateMatrixWorld();
  }
  function bind(object){object.traverse(node=>{if(!node.isMesh&&!node.isLine)return;const material=node.material;if(material.userData.cityObserveFog)return;
    material.userData.cityObserveFog=true;const previous=material.onBeforeCompile,key=material.customProgramCacheKey();
    material.onBeforeCompile=shader=>{
      previous.call(material,shader);shader.uniforms.cityObserveFog=fog.texture;shader.uniforms.cityObserveActive=fog.enabled;shader.uniforms.cityObserveBounds=fog.bounds;
      shader.vertexShader='varying vec2 cityObserveXZ;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\ncityObserveXZ=(modelMatrix*vec4(transformed,1.)).xz;');
      const blend=material.userData.cityExterior?'gl_FragColor.rgb=mix(gl_FragColor.rgb,mist.rgb,mist.a);':'gl_FragColor.rgb=mix(gl_FragColor.rgb,mist.rgb,mist.a);float rim=min(min(uv.x,uv.y),min(1.-uv.x,1.-uv.y));gl_FragColor.a*=smoothstep(0.,.06,rim);';
      const stage=material.userData.cityExterior?'#include <dithering_fragment>':'#include <colorspace_fragment>';
      shader.fragmentShader='uniform sampler2D cityObserveFog;\nuniform float cityObserveActive;\nuniform vec4 cityObserveBounds;\nvarying vec2 cityObserveXZ;\n'+shader.fragmentShader.replace(stage,stage+'\nif(cityObserveActive>.5){vec2 uv=(cityObserveXZ-cityObserveBounds.xy)/cityObserveBounds.zw;vec4 mist=texture2D(cityObserveFog,clamp(uv,0.,1.));'+blend+'}');
    };
    material.customProgramCacheKey=()=>key+':cityx-observe-fog';material.needsUpdate=true;
  });}
  return {
    warmupRoot:()=>floor,
    warmupCamera:()=>camera,
    enemiesFrame(){return hasEnemyFrame?enemyCanvas:null;},
    pick(x,y,width,height,view){
      setCamera(view);pointer.set(x/width*2-1,1-y/height*2);ray.setFromCamera(pointer,camera);pickMeshes.length=0;hits.length=0;
      // 在检测三角面之前排除透明特效/装饰；根层为分层合成临时隐藏，不能据此排除楼体。
      for(const node of pickCandidates)if(!node.userData.cityConstructionPreview&&!node.material.transparent&&(!node.userData.cityDecoration||node.userData.cityGroundSurface))pickMeshes.push(node);
      const hit=ray.intersectObjects(pickMeshes,false,hits)[0];return hit?{x:hit.point.x,y:hit.point.z}:null;
    },
    render({geometryVersion,mist,mistBounds,view,background,objects,enemies,hasEnemies,effects}){
      // 外围纯景物不参加鼠标射线，避免每次移动鼠标检测整片郊野几何。
      // 只有网格增删/替换时重新登记材质和拾取候选；预览透明度仍在每次拾取时判断。
      if(lastGeometryVersion!==geometryVersion){
        pickCandidates=[];
        for(const object of [floor,...objects]){bind(object);if(!object.userData.cityNoPick)object.traverse(node=>{if(node.isMesh)pickCandidates.push(node);});}
        lastGeometryVersion=geometryVersion;
      }
      bind(effects);
      fogTexture.image=mist;fogTexture.needsUpdate=true;
      fog.bounds.value.set(...mistBounds);
      setCamera(view);
      floor.visible=true;for(const object of [...objects,effects])object.visible=true;fog.enabled.value=1;
      // 敌人已按原插值中心渐隐；单独在雾上绘制，避免楼体遮住本应可见的敌群。
      enemies.visible=false;renderer.setClearColor(background,1);renderer.render(scene,camera);
      if(canvas.width!==renderer.domElement.width||canvas.height!==renderer.domElement.height){canvas.width=renderer.domElement.width;canvas.height=renderer.domElement.height;}
      const ctx=canvas.getContext('2d');ctx.clearRect(0,0,canvas.width,canvas.height);ctx.drawImage(renderer.domElement,0,0);
      floor.visible=false;objects.forEach(object=>object.visible=false);effects.visible=false;fog.enabled.value=0;
      // 空敌人也恢复透明清屏，防止切回俯视后设施/特效层盖住整座城市。
      renderer.setClearColor('#000000',0);hasEnemyFrame=hasEnemies;if(!hasEnemies)return canvas;enemies.visible=true;
      // 单独交回敌人图层，让Canvas路线在实体下面、HP在实体上面。
      renderer.render(scene,camera);
      if(enemyCanvas.width!==canvas.width||enemyCanvas.height!==canvas.height){enemyCanvas.width=canvas.width;enemyCanvas.height=canvas.height;}
      const enemyContext=enemyCanvas.getContext('2d');enemyContext.clearRect(0,0,enemyCanvas.width,enemyCanvas.height);enemyContext.drawImage(renderer.domElement,0,0);enemies.visible=false;
      return canvas;
    },
  };
}
