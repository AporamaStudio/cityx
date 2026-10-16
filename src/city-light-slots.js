import * as THREE from 'three';

// 同一地图按实际已知设施保留槽位：镜头只改光强，不改参与着色的灯数。
// 槽位只增长到本图实际火点/塔数量的峰值，不预造全图灯；新地图统一释放。
export function createCityLightSlots(scene){
  const pools={fire:[],watch:[]},assigned=new Map();let all=[];
  function sync(items){
    const active=new Map(items.map(item=>[item.id,item.asset==='watch'?'watch':'fire']));
    for(const [id,slot] of assigned)if(active.get(id)!==slot.kind){slot.light.intensity=0;slot.owner=null;assigned.delete(id);}
    for(const item of items){
      if(assigned.has(item.id))continue;
      const kind=active.get(item.id),pool=pools[kind];let slot=pool.find(slot=>slot.owner===null);
      if(!slot){
        const light=kind==='watch'?new THREE.SpotLight('#9fcaff',0,24,.10,.7,2):new THREE.PointLight('#ffb860',0,4,2),target=new THREE.Object3D();
        light.castShadow=false;light.visible=true;light.target=target;scene.add(light,target);
        slot={kind,light,target,owner:null};pool.push(slot);all.push(light);
      }
      slot.owner=item.id;assigned.set(item.id,slot);
    }
    return assigned;
  }
  return {
    sync,lights:()=>all,stats:()=>({fireLights:pools.fire.length,watchLights:pools.watch.length}),
    reset(){for(const pool of Object.values(pools))for(const {light,target} of pool){light.removeFromParent();target.removeFromParent();light.dispose();}pools.fire.length=0;pools.watch.length=0;assigned.clear();all=[];},
  };
}
