import * as THREE from 'three';

// 低矮光幕与地面柔光共用单位平面；不加灯光、不改变真实楼体或拾取。
export function createUpgradePreview(parent){
  const group=new THREE.Group(),plane=new THREE.PlaneGeometry(1,1),entries=new Map();parent.add(group);
  group.userData.cityNoPick=true;
  function material(ground){
    return new THREE.ShaderMaterial({transparent:true,depthWrite:false,side:THREE.DoubleSide,toneMapped:false,
      uniforms:{ink:{value:new THREE.Color('#ffda98')},level:{value:0},phase:{value:0},ground:{value:ground?1:0},still:{value:0},flowing:{value:0}},
      vertexShader:'varying vec2 flowUV;\nvoid main(){flowUV=uv;\n#include <begin_vertex>\ngl_Position=projectionMatrix*modelViewMatrix*vec4(transformed,1.);}',
      fragmentShader:'uniform vec3 ink;uniform float level,phase,ground,still,flowing;varying vec2 flowUV;\nvoid main(){float band=pow(.5+.5*cos((flowUV.y-phase)*6.283185),8.);float alpha=ground>.5?sin(flowUV.y*3.141593)*mix(1.,.35+.65*band,flowing*(1.-still)):pow(1.-flowUV.y,1.6)*mix(.18+.82*band,.45,still);gl_FragColor=vec4(ink,alpha*level);\n#include <colorspace_fragment>\n}'
    });
  }
  function remove(entry){entry.object.removeFromParent();entry.ground.dispose();entry.flow.dispose();}
  return {
    group,
    update(items,time,params,reducedMotion=false){
      if(!items.length&&!entries.size)return;
      const active=new Set(items.map(item=>item.id));
      for(const [id,entry] of entries)if(!active.has(id)){remove(entry);entries.delete(id);}
      for(const item of items){
        if(!entries.has(item.id)){
          const object=new THREE.Group(),ground=material(true),flow=material(false),strips=[],walls=[];
          for(let i=0;i<4;i++){
            const strip=new THREE.Mesh(plane,ground),wall=new THREE.Mesh(plane,flow);strip.rotation.x=-Math.PI/2;
            strip.userData.cityDecoration=wall.userData.cityDecoration=true;object.add(strip,wall);strips.push(strip);walls.push(wall);
          }
          group.add(object);entries.set(item.id,{object,ground,flow,strips,walls});
        }
        const entry=entries.get(item.id),pad=3.6/item.cellMeters,height=params.upgradeFlowHeightMeters/item.cellMeters;
        const shape=[item.x,item.y,item.w,item.h,item.cellMeters,height].join(':');
        if(entry.shape!==shape){
          entry.object.position.set(item.x+item.w/2,.025,item.y+item.h/2);
          const edges=[[0,-item.h/2-pad,item.w+pad*2,0],[0,item.h/2+pad,item.w+pad*2,Math.PI],[-item.w/2-pad,0,item.h+pad*2,-Math.PI/2],[item.w/2+pad,0,item.h+pad*2,Math.PI/2]];
          edges.forEach(([x,z,length,angle],i)=>{
            const strip=entry.strips[i],wall=entry.walls[i];strip.position.set(x,0,z);strip.rotation.z=angle;strip.scale.set(length,pad*2,1);
            wall.position.set(x,height/2,z);wall.rotation.y=angle;wall.scale.set(length,height,1);
          });entry.shape=shape;
        }
        for(const wall of entry.walls)wall.visible=height>0&&item.eligible&&(item.focused||item.pulse>0);
        const strength=params.upgradeFlowOpacity/100,focus=item.focused?1:0,pulse=item.pulse??0;
        entry.ground.uniforms.level.value=strength*(item.eligible ? .40+.55*focus+pulse*.7 : .18);
        entry.ground.uniforms.ink.value.set(item.eligible?'#ffda98':'#a5abaa');
        entry.flow.uniforms.level.value=strength*(1+pulse*.8);entry.flow.uniforms.phase.value=reducedMotion?0:time/(params.upgradeFlowCycleMs/1000);
        entry.flow.uniforms.still.value=reducedMotion?1:0;
        entry.ground.uniforms.phase.value=entry.flow.uniforms.phase.value;entry.ground.uniforms.still.value=reducedMotion?1:0;
        entry.ground.uniforms.flowing.value=height>0&&(item.focused||item.pulse>0)?1:0;
      }
    },
    dispose(){for(const entry of entries.values())remove(entry);entries.clear();plane.dispose();group.removeFromParent();}
  };
}
