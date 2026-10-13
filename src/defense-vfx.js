import * as THREE from 'three';

// 只播放原结算已发生的墙体/火光受击；不计时攻击，不查询敌群或改变耐久。
export function createDefenseVFX(parent,item){
  const group=new THREE.Group(),pieces=[],meters=item.cellMeters??20,broken=item.type==='wallLost',camp=item.type==='leak';parent.add(group);
  const dustMaterial=new THREE.MeshBasicMaterial({color:camp?'#d19a69':'#b5aa96',transparent:true,opacity:0,depthWrite:false});
  const rubbleMaterial=new THREE.MeshStandardMaterial({color:'#a89c84',roughness:1,transparent:true,opacity:0});
  const dustGeometry=new THREE.IcosahedronGeometry(1,0),chipGeometry=new THREE.BoxGeometry(.22/meters,.18/meters,.26/meters);
  for(let i=0;i<(broken?10:camp?6:4);i++){
    const dust=new THREE.Mesh(dustGeometry,dustMaterial),chip=broken?new THREE.Mesh(chipGeometry,rubbleMaterial):null;group.add(dust);if(chip)group.add(chip);pieces.push({dust,chip});
  }
  const ring=new THREE.Mesh(new THREE.RingGeometry(.85,1,24),new THREE.MeshBasicMaterial({color:camp?'#ec7d52':'#e2bd85',transparent:true,opacity:0,depthWrite:false,side:THREE.DoubleSide}));ring.rotation.x=-Math.PI/2;ring.position.y=.04;group.add(ring);group.position.set(item.x,0,item.y);
  return {group,update(age,alpha=1){
    const t=Math.max(0,Math.min(1,age/.65));group.visible=age>=0&&age<.65;
    pieces.forEach(({dust,chip},i)=>{
      const angle=i*2.399+item.cell*.31,r=(broken?1.1:camp?1.7:.7)/meters;
      dust.position.set(Math.cos(angle)*r*t,.25/meters+t*(broken?1.1:.65)/meters,Math.sin(angle)*r*t);dust.scale.setScalar((.25+t*(broken?1.2:.65))/meters);
      if(chip){chip.position.set(Math.cos(angle)*r*t,(.15+Math.sin(t*Math.PI)*.7)/meters,Math.sin(angle)*r*t);chip.rotation.set(t*4+i,t*2+i,t*3);}
    });
    dustMaterial.opacity=Math.sin(t*Math.PI)*alpha*(broken?.3:.17);rubbleMaterial.opacity=(1-t)*alpha*.85;
    const radius=(camp?3:broken?1.7:.9)/meters*(.5+t);ring.scale.setScalar(radius);ring.material.opacity=(1-t)**2*alpha*(camp?.6:.35);
  },dispose(){group.removeFromParent();dustGeometry.dispose();chipGeometry.dispose();dustMaterial.dispose();rubbleMaterial.dispose();ring.geometry.dispose();ring.material.dispose();}};
}
