import {SIZE} from './config.js?v=105';
import {coverage,sourceAttackPlan,sourceCells,xy,key,inside,inStationRange,enemyKey} from './model.js?v=130';

// 只准备显示方向；范围累计伤害和清源优先级仍由原结算负责。
export function attackVisualPlan(state,enemies,visible){
  const shots=[];
  for(const [id,type] of state.towers){
    if(!visible(id))continue;
    const cells=new Set(coverage(id,state.params.weapons[type].range,state.params.weapons[type].shape));
    const covered=enemies.filter(e=>cells.has(e.id));
    if(covered.length){
      const target=covered.find(e=>visible(e.id));
      if(target){const [x,y]=xy(target.id);shots.push({id,type,target:target.id,enemyTarget:target.target,x:x+.5,y:y+.5});}
      continue; // 隐藏敌人也占用本拍攻击，不能为演示改打敌源。
    }
    const sourceId=sourceAttackPlan(state,enemies,new Map([[id,type]])).keys().next().value;
    if(!sourceId)continue;
    const cell=sourceCells(state.enemySources.get(sourceId)).find(cell=>cells.has(cell)&&visible(cell));
    if(cell!==undefined){const [x,y]=xy(cell);shots.push({id,type,sourceId,x:x+.5,y:y+.5});}
  }
  return shots;
}
// 实际有受击结果才发射，视觉上一条弹迹不代表范围内只伤害一个敌人。
export function resolvedShots(plan,events){
  return plan.filter(shot=>events.some(e=>e.value>0&&(shot.sourceId?e.type==='sourceHit'&&e.sourceId===shot.sourceId:e.type==='hit'&&e.id===shot.target&&e.target===shot.enemyTarget)));
}

// 同一墙破损与攻破只显示一次攻破反馈；隐藏位置没有扬尘或数字。
export function defenseVisualEvents(events,visible){
  const result=new Map();
  for(const event of events){
    if(!['wallHit','wallLost','leak'].includes(event.type)||!visible(event.id))continue;
    if(event.type!=='wallLost'&&!(event.value>0))continue;
    const previous=result.get(event.id);if(previous?.type==='wallLost'&&event.type==='wallHit')continue;
    result.set(event.id,{cell:event.id,type:event.type,value:event.value});
  }
  return [...result.values()];
}

// 以当前镜头作为听音位置：屏外炮位静音，拉远镜头减弱，左右方位用轻量声像表示。
export function shotSoundView(id,{panX,panY,cell,width,height,zoom}){
  const [x,y]=xy(id),sx=panX+(x+.5)*cell,sy=panY+(y+.5)*cell;
  if(sx<0||sy<0||sx>=width||sy>=height)return null;
  const dx=(sx-width/2)/(width/2),dy=(sy-height/2)/(height/2),distance=Math.min(1,Math.hypot(dx,dy)/Math.SQRT2);
  return {gain:Math.min(1,(zoom/2)**1.3)*(1-distance*.35),pan:Math.max(-.8,Math.min(.8,dx*.8))};
}

// 实体和HP共用原插值/合流表现；只返回绘制描述，不推进战斗或读取隐藏目标。
export function enemyDisplayFrames(state,motion,incoming,impact,reducedMotion=false){
  const frames=[],actors=motion?motion.actors:state.enemies;
  const add=(enemy,x,y,scale=1,alpha=1,barHP=enemy.hp)=>{
    const rawX=x,rawY=y,occupants=actors.filter(e=>e.id===enemy.id);
    if(occupants.length>1){const slot=Math.max(0,occupants.findIndex(e=>e.target===enemy.target));x+=(slot%2?.23:-.23);y+=Math.floor(slot/2)*.3;scale*=.55;}
    const identity=enemy.origins?.length?[...enemy.origins].sort().join(','):`${enemy.id}:${enemy.target}`;
    frames.push({enemy,x,y,rawX,rawY,scale,alpha,barHP,id:'enemy:'+identity});
  };
  if(motion){
    const t=Math.min(1,motion.elapsed/motion.duration),eased=t*t*(3-2*t);
    for(const enemy of actors){const [x,y]=xy(enemy.id),[tx,ty]=xy(enemy.to);add(enemy,x+(tx-x)*eased,y+(ty-y)*eased);frames.at(-1).angle=enemy.to===enemy.id?undefined:Math.atan2(x-tx,y-ty);}
  }else{
    for(const enemy of actors){const [x,y]=xy(enemy.id),before=incoming.get(enemyKey(enemy))?.hp??enemy.hp,merged=state.events.some(e=>e.type==='merge'&&e.id===enemy.id&&e.target===enemy.target);add(enemy,x,y,merged&&!reducedMotion?1+.16*Math.sin(impact*Math.PI):1,1,before+(enemy.hp-before)*impact);}
    if(impact<1)for(const event of state.events)if(event.type==='kill'){const old=incoming.get(`${event.id}:${event.target}`);if(old){const [x,y]=xy(event.id);add({...old,hp:0},x,y,1-.7*impact,1-impact,0);}}
  }
  return frames;
}

// 塔自己的基础范围接到真实控制外沿才算前线；远处仍有可见边界不能让后方塔持续扫光。
export function outpostFrontier(id,radius,controlled){
  const [cx,cy]=xy(id),frontier=new Set();
  for(let y=Math.max(0,cy-radius);y<=Math.min(SIZE-1,cy+radius);y++)for(let x=Math.max(0,cx-radius);x<=Math.min(SIZE-1,cx+radius);x++){
    const cell=key(x,y);if(!controlled.has(cell)||!inStationRange(cell,id,radius))continue;
    if([[1,0],[-1,0],[0,1],[0,-1]].some(([dx,dy])=>inside(x+dx,y+dy)&&!controlled.has(key(x+dx,y+dy))))frontier.add(cell);
  }
  return frontier;
}
export function searchTargets(id,controlled,sight,range,frontier=null){
  const [x,y]=xy(id),points=[];
  if(frontier&&!frontier.size)return {points:[],loop:false};
  const allowed=(x,y)=>inside(Math.floor(x),Math.floor(y))&&!controlled.has(key(Math.floor(x),Math.floor(y)))&&sight.has(key(Math.floor(x),Math.floor(y)));
  for(let i=0;i<48;i++){
    const angle=i*Math.PI/24;let point=null;
    // 每条外扫射线须经过该塔实际贡献的外沿，不能横跨后方城区去寻找更远的边界。
    let ownsEdge=!frontier;
    for(let d=.25;frontier&&!ownsEdge&&d<=range;d+=.25){const tx=Math.floor(x+.5+Math.cos(angle)*d),ty=Math.floor(y+.5+Math.sin(angle)*d);ownsEdge=inside(tx,ty)&&frontier.has(key(tx,ty));}
    if(!ownsEdge){points.push(null);continue;}
    for(let distance=2;distance<=range;distance+=.5){
      const tx=x+.5+Math.cos(angle)*distance,ty=y+.5+Math.sin(angle)*distance;
      if([[0,0],[-1,0],[1,0],[0,-1],[0,1]].every(([dx,dy])=>allowed(tx+dx,ty+dy))){point={x:tx,y:ty};break;}
    }
    points.push(point);
  }
  // 在最长连续外扫弧中往返，避免跨过内部城区或在不连续方向间突然跳转。
  if(points.every(Boolean))return {points,loop:true};
  let longest=[],run=[];for(let i=0;i<96;i++){const point=points[i%48];if(point){run.push(point);if(run.length>longest.length)longest=[...run];}else run=[];}
  return {points:longest.slice(0,48),loop:false};
}
export function searchAim(sector,time,id,controlled,sight){
  const {points,loop}=sector;if(!points.length)return null;
  const phase=time*.12+id*.037,t=loop?(phase%1)*points.length:(1-Math.abs((phase%2)-1))*(points.length-1),i=Math.floor(t),a=points[i],b=points[(i+1)%points.length],f=t-i;
  const point={x:a.x+(b.x-a.x)*f,y:a.y+(b.y-a.y)*f},x=Math.floor(point.x),y=Math.floor(point.y);
  return x>=0&&y>=0&&x<SIZE&&y<SIZE&&!controlled.has(key(x,y))&&sight.has(key(x,y))?point:a;
}
