import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {zombieFigureCount,zombieFigurePose} from './city-enemy-shape.js?v=1';

// 全场共用十一组实例几何；不为每个人物创建光源、骨骼、阴影或独立绘制调用。
export function createZombieCrowds(parent,capacity=2048){
  const group=new THREE.Group();parent.add(group);
  const parts={},headings=new Map(),dummy=new THREE.Object3D(),local=new THREE.Object3D(),world=new THREE.Object3D(),color=new THREE.Color(),fog=new THREE.Color(),hit=new THREE.Color('#fff0c9');
  const clothes=['#726b58','#7a5350','#536370','#696354'],skin=['#b3b39b','#b7a695','#a7ac99','#b8af9a'];
  const definitions={
    body:new THREE.CylinderGeometry(.19,.15,.57,5),head:new THREE.DodecahedronGeometry(.17,0),
    leftArm:new THREE.CylinderGeometry(.065,.055,.61,5),rightArm:new THREE.CylinderGeometry(.065,.055,.61,5),
    leftLeg:new THREE.CylinderGeometry(.075,.06,.76,5),rightLeg:new THREE.CylinderGeometry(.075,.06,.76,5),
    leftHand:new THREE.BoxGeometry(.09,.13,.065),rightHand:new THREE.BoxGeometry(.09,.13,.065),
    hair:new THREE.SphereGeometry(.174,5,3,0,Math.PI*2,0,Math.PI*.45),shadow:new THREE.CircleGeometry(.38,10)
  };
  const features=[new THREE.BoxGeometry(.04,.026,.02).translate(-.06,.03,-.153),new THREE.BoxGeometry(.04,.026,.02).translate(.06,.03,-.153),new THREE.BoxGeometry(.055,.024,.02).translate(0,-.045,-.153)];
  definitions.face=mergeGeometries(features);features.forEach(geometry=>geometry.dispose());
  for(const [name,geometry] of Object.entries(definitions)){
    const material=name==='shadow'?new THREE.MeshBasicMaterial({color:'#182126',transparent:true,opacity:.24,depthWrite:false}):new THREE.MeshStandardMaterial({roughness:1,flatShading:true,transparent:true,emissive:'#b0a090',emissiveIntensity:.16});
    const opacity=new THREE.InstancedBufferAttribute(new Float32Array(capacity),1);geometry.setAttribute('cityEnemyAlpha',opacity);
    material.onBeforeCompile=shader=>{
      shader.vertexShader='attribute float cityEnemyAlpha; varying float cityEnemyOpacity;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\ncityEnemyOpacity=cityEnemyAlpha;');
      shader.fragmentShader='varying float cityEnemyOpacity;\n'+shader.fragmentShader.replace('#include <opaque_fragment>','#include <opaque_fragment>\ngl_FragColor.a*=cityEnemyOpacity;');
    };material.customProgramCacheKey=()=> 'cityx-zombie-instance';
    const mesh=new THREE.InstancedMesh(geometry,material,capacity);mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);mesh.count=0;mesh.frustumCulled=false;mesh.castShadow=false;mesh.receiveShadow=false;mesh.userData.cityDecoration=true;group.add(mesh);parts[name]={mesh,opacity};
  }
  function write(name,index,x,y,z,sx,sy,sz,rx,paint,alpha){
    local.position.set(x,y,z);local.rotation.set(rx,0,0);local.scale.set(sx,sy,sz);local.updateMatrix();dummy.matrix.multiplyMatrices(world.matrix,local.matrix);
    const {mesh,opacity}=parts[name];mesh.setMatrixAt(index,dummy.matrix);if(name!=='shadow')mesh.setColorAt(index,paint);opacity.setX(index,alpha);
  }
  return {group,update(items,fx){
    let total=0;const quota=Math.min(32,Math.floor(capacity/Math.max(1,items.length)));
    const active=new Set(items.map(item=>item.id));for(const id of headings.keys())if(!active.has(id))headings.delete(id);
    for(const item of items){
      if(item.angle!==undefined)headings.set(item.id,item.angle);const angle=headings.get(item.id)??0;
      const seed=[...String(item.id)].reduce((sum,c)=>sum*31+c.charCodeAt(0),7)>>>0,count=zombieFigureCount(item,fx.enemyFiguresPerGroup??8,quota),meters=item.cellMeters??20;
      for(let i=0;i<count&&total<capacity;i++,total++){
        const pose=zombieFigurePose(i,seed,fx.reducedMotion?0:fx.time,!fx.reducedMotion&&item.moving),s=pose.height/1.8,scale=(item.visualScale??1)/meters;
        const formation=Math.min(1,Math.sqrt(count/16)),x=pose.x*formation,z=(pose.z-(Math.floor((count-1)/4)-3)*.575)*formation;
        world.position.set(item.x+Math.cos(angle)*x*scale+Math.sin(angle)*z*scale,0,item.y-Math.sin(angle)*x*scale+Math.cos(angle)*z*scale);
        world.rotation.set(0,angle,0);world.scale.setScalar(scale);world.updateMatrix();
        const alpha=item.alpha??1;fog.set(item.fogColor??'#bfc9ca');
        const tint=hex=>color.set(hex).lerp(hit,item.hitMix??0).lerp(fog,(1-(item.fogAlpha??1))*.75);
        write('shadow',total,0,.015,0,1.1,1,1,-Math.PI/2,color,alpha);
        write('body',total,pose.sway,1.12*s,-.045,1,s,1,-.18,tint(clothes[pose.variant]),alpha);
        write('head',total,pose.sway,1.56*s,-.16,1,s,1,-.12,tint(skin[pose.variant]),alpha);
        write('hair',total,pose.sway,1.57*s,-.16,1,s,1,-.12,tint('#48483f'),alpha);
        write('face',total,pose.sway,1.56*s,-.16,1,s,1,-.12,tint('#414743'),alpha);
        for(const [side,name] of [[-1,'left'],[1,'right']]){
          const bend=.55+pose.stride*side*.20;
          write(name+'Arm',total,side*.235+pose.sway,1.11*s,-.20,1,s,1,bend,tint(clothes[pose.variant]),alpha);
          write(name+'Hand',total,side*.235+pose.sway,1.11*s-Math.cos(bend)*.34*s,-.20-Math.sin(bend)*.34*s,1,s,1,bend,tint(skin[pose.variant]),alpha);
          write(name+'Leg',total,side*.105,.45*s,0,1,s,1,pose.stride*side*.32,tint('#444c4b'),alpha);
        }
      }
    }
    for(const {mesh,opacity} of Object.values(parts)){mesh.count=total;mesh.instanceMatrix.needsUpdate=true;if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;opacity.needsUpdate=true;}
  }};
}
