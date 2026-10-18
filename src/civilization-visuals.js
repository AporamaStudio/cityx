// 生活表现只读实际接通建筑；少量院落往来，不创建可指挥或可受击的人口单位。
export function civilianPoses(plots,{time=0,night=0,perPlot=2,cellMeters=20,view=null}={}){
  if(night>=.65||perPlot===0)return [];
  const poses=[];
  for(const p of plots){
    if(!p.powered||p.status!=='building'||view&&(p.x+p.w<view.left||p.x>view.right||p.y+p.h<view.top||p.y>view.bottom))continue;
    for(let i=0;i<perPlot;i++){
      const phase=(time*.8/(Math.max(1,p.w-.3)*cellMeters)+(p.id%17)/17+i*.47)%2,t=phase<=1?phase:2-phase;
      poses.push({id:p.id+':'+i,x:p.x+.15+t*Math.max(.1,p.w-.3),y:p.y+.12+i*.08,ground:(p.type==='housing'?2.5:1.5)/cellMeters,step:Math.sin(time*5+i)*.12/cellMeters});
    }
  }
  return poses;
}
