// 美术尺寸使用米，时序只服务显示；不参与命中、伤害或攻击频率。
export const SHOT_STYLES={
  A:{flight:.14,flash:.05,barrel:.25,radius:.045,length:.35,trail:3,flame:1.2,smoke:.42,recoil:.18},
  B:{flight:.18,flash:.095,barrel:.32,radius:.075,length:.6,trail:5,flame:1.9,smoke:.65,recoil:.32}
};
export function shotEnvelope(age,type){
  const s=SHOT_STYLES[type]??SHOT_STYLES.A;
  const flashAge=type==='A'&&age>=.08?age-.08:age; // 近炮两次短闪仍只是一拍攻击的视觉节奏。
  return {travel:Math.max(0,Math.min(1,age/s.flight)),flash:age<0?0:Math.max(0,1-flashAge/s.flash)**2,
    recoil:age<0?0:age<.025?age/.025:Math.max(0,1-(age-.025)/s.barrel)**2,
    smoke:age<.035||age>.42?0:Math.sin((age-.035)/.385*Math.PI)};
}

// 逐个真实受伤对象提供反馈，隐藏格不产生特效；一条代表弹迹不限制范围伤害。
export function visibleHitImpacts(events,shots,visible,width=60){
  const hits=new Map();
  for(const event of events){
    if(!(event.value>0))continue;
    if(event.type==='hit'&&visible(event.id)){
      const shot=shots.find(s=>s.target===event.id&&s.enemyTarget===event.target);
      const id=`hit:${event.id}:${event.target}`;hits.set(id,{id,cell:event.id,target:event.target,x:event.id%width+.5,y:Math.floor(event.id/width)+.5,type:shot?.type??'A'});
    }else if(event.type==='sourceHit'){
      const shot=shots.find(s=>s.sourceId===event.sourceId);
      if(!shot||!visible(Math.floor(shot.y)*width+Math.floor(shot.x)))continue;
      const id='source:'+event.sourceId;hits.set(id,{id,cell:Math.floor(shot.y)*width+Math.floor(shot.x),sourceId:event.sourceId,x:shot.x,y:shot.y,type:shot.type});
    }
  }
  return [...hits.values()];
}
