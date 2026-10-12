import {SIZE} from './config.js?v=74';
import {coverage,sourceAttackPlan,sourceCells,xy,key,inside} from './model.js?v=90';

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

export function searchTargets(id,controlled,sight,range){
  const [x,y]=xy(id),points=[];
  const allowed=(x,y)=>inside(Math.floor(x),Math.floor(y))&&!controlled.has(key(Math.floor(x),Math.floor(y)))&&sight.has(key(Math.floor(x),Math.floor(y)));
  for(let i=0;i<48;i++){
    const angle=i*Math.PI/24;let point=null;
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
