import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {surroundingLandscape,exteriorHeight,exteriorRiver} from './city-surroundings.js?v=2';

// 地图外共用同一太阳/环境光，远处向雾底色融合；无交互、真实灯或第二套游戏状态。
export function createSurroundingModel(layout,models,cellMeters=20){
  const root=new THREE.Group(),land=surroundingLandscape(layout),batches=new Map(),haze={value:new THREE.Color('#c4cfd0').convertLinearToSRGB()};root.userData.haze=haze;
  const add=(geometry,source,cast=false)=>{
    if(geometry.index){const plain=geometry.toNonIndexed();geometry.dispose();geometry=plain;}
    const material=typeof source==='string'?{color:new THREE.Color(source)}:source,key=material.color.getHexString()+':'+(material.map?.uuid??'');
    for(const name of Object.keys(geometry.attributes))if(!['position','normal',...(material.map?['uv']:[])].includes(name))geometry.deleteAttribute(name);
    if(!batches.has(key))batches.set(key,{geometries:[],color:material.color,map:material.map,cast});batches.get(key).geometries.push(geometry);
  };
  const quad=(a,b,c,d,color)=>{const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute([...a,...b,...c,...c,...b,...d],3));geometry.computeVertexNormals();add(geometry,color);};
  const ground=(x,y)=>[x,.001+exteriorHeight(layout,land,x,y,cellMeters),y],step=2;
  for(let y=-land.extent;y<layout.height+land.extent;y+=step)for(let x=-land.extent;x<layout.width+land.extent;x+=step){
    if(x>=0&&y>=0&&x+step<=layout.width&&y+step<=layout.height)continue;
    quad(ground(x,y),ground(x,y+step),ground(x+step,y),ground(x+step,y+step),'#788864');
  }
  for(const road of land.exits)for(let i=1;i<road.points.length;i++){
    const a=road.points[i-1],b=road.points[i],length=Math.hypot(b.x-a.x,b.y-a.y),nx=-(b.y-a.y)/length,ny=(b.x-a.x)/length;
    const p=(point,side)=>[point.x+nx*side,.004,point.y+ny*side];
    quad(p(a,-road.w/2),p(b,-road.w/2),p(a,road.w/2),p(b,road.w/2),'#56625d');
    for(const sign of [-1,1])quad(p(a,sign*(road.w/2-.09)),p(b,sign*(road.w/2-.09)),p(a,sign*road.w/2),p(b,sign*road.w/2),'#a5ac98');
  }
  if(layout.natural?.river)for(const side of [-1,1])for(let d=0;d<land.extent;d++){
    const x=side<0?-d:layout.width+d,nx=x+side,a=exteriorRiver(layout,x),b=exteriorRiver(layout,nx);
    quad([x,.002,a.top],[x,.002,a.bottom],[nx,.002,b.top],[nx,.002,b.bottom],'#528592');
    for(const edge of ['top','bottom']){const sign=edge==='top'?-1:1;quad([x,.002,a[edge]],[x,.006,a[edge]+sign*.08],[nx,.002,b[edge]],[nx,.006,b[edge]+sign*.08],'#b7b094');}
  }
  const place=item=>{
    const model=models.get(item.asset);if(!model)return;
    const bounds=new THREE.Box3().setFromObject(model),size=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3()),scale=item.width/cellMeters/Math.max(size.x,size.z);
    const matrix=new THREE.Matrix4().makeTranslation(item.x,.001+exteriorHeight(layout,land,item.x,item.y,cellMeters),item.y).multiply(new THREE.Matrix4().makeRotationY(item.angle)).multiply(new THREE.Matrix4().makeScale(scale,scale,scale)).multiply(new THREE.Matrix4().makeTranslation(-center.x,-bounds.min.y,-center.z));
    model.updateMatrixWorld(true);model.traverse(node=>{if(node.isMesh)add(node.geometry.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(matrix,node.matrixWorld)),node.material,true);});
  };
  if(cellMeters>=8)for(const tree of land.trees){if(land.buildings.some(b=>Math.hypot(tree.x-b.x,tree.y-b.y)<(b.width+tree.width)/cellMeters))continue;place(tree);}
  for(const building of land.buildings)place(building);
  for(const batch of batches.values()){
    const geometry=mergeGeometries(batch.geometries,false);batch.geometries.forEach(g=>g.dispose());const material=new THREE.MeshStandardMaterial({color:batch.color,map:batch.map??null,roughness:1,side:THREE.DoubleSide});
    material.userData.cityExterior=true;material.onBeforeCompile=shader=>{
      shader.uniforms.cityExteriorHaze=haze;shader.uniforms.cityExteriorSize={value:new THREE.Vector2(layout.width,layout.height)};
      shader.vertexShader='varying vec2 cityExteriorXZ;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\ncityExteriorXZ=(modelMatrix*vec4(transformed,1.)).xz;');
      shader.fragmentShader='uniform vec3 cityExteriorHaze;\nuniform vec2 cityExteriorSize;\nvarying vec2 cityExteriorXZ;\n'+shader.fragmentShader.replace('#include <colorspace_fragment>','#include <colorspace_fragment>\nvec2 p=cityExteriorXZ;if(p.x>=0.&&p.y>=0.&&p.x<=cityExteriorSize.x&&p.y<=cityExteriorSize.y)discard;vec2 away=max(max(-p,p-cityExteriorSize),vec2(0.));float d=length(away);float mist=.12+.18*smoothstep(0.,12.,d)+.70*smoothstep(10.,48.,d);gl_FragColor.rgb=mix(gl_FragColor.rgb,cityExteriorHaze,mist);');
    };material.customProgramCacheKey=()=> 'cityx-exterior-haze';
    const mesh=new THREE.Mesh(geometry,material);mesh.castShadow=batch.cast;mesh.receiveShadow=true;mesh.userData.ownGeometry=true;mesh.userData.cityDecoration=true;root.add(mesh);
  }
  return root;
}
