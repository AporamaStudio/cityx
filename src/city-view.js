// 观察镜头只变换显示坐标；俯视建设继续使用原格子命中和权限。
export function viewCenter({width,height,panX,panY,cell}){return {x:(width/2-panX)/cell,y:(height/2-panY)/cell};}
export function projectView(x,y,z,{width,height,panX,panY,cell,yaw=0,elevation=Math.PI/2}){
  const center=viewCenter({width,height,panX,panY,cell}),dx=x-center.x,dy=y-center.y;
  return {x:width/2+cell*(Math.cos(yaw)*dx-Math.sin(yaw)*dy),y:height/2+cell*(Math.sin(elevation)*(Math.sin(yaw)*dx+Math.cos(yaw)*dy)-Math.cos(elevation)*z)};
}
export function groundAt(x,y,view){
  const center=viewCenter(view),u=(x-view.width/2)/view.cell,v=(y-view.height/2)/(view.cell*Math.sin(view.elevation??Math.PI/2)),yaw=view.yaw??0;
  return {x:center.x+Math.cos(yaw)*u+Math.sin(yaw)*v,y:center.y-Math.sin(yaw)*u+Math.cos(yaw)*v};
}
export function panView(dx,dy,{yaw=0,elevation=Math.PI/2}){
  const v=dy/Math.sin(elevation);return {x:Math.cos(yaw)*dx+Math.sin(yaw)*v,y:-Math.sin(yaw)*dx+Math.cos(yaw)*v};
}
// 远景为旋转后的地图留出完整空间；正常倍率保留原像素尺度，回正保持世界中心。
export function observationView(view,size=60){
  const {width,height,cell,yaw,elevation,zoom}=view,span=Math.abs(Math.cos(yaw))+Math.abs(Math.sin(yaw));
  const fit=Math.min(1,(width-48)/(size*cell/zoom*span),(height-48)/(size*cell/zoom*span*Math.sin(elevation))),t=Math.max(0,Math.min(1,2-zoom)),factor=1-(1-fit)*t*t*(3-2*t),center=viewCenter(view),scaled=cell*factor;
  return {...view,cell:scaled,panX:width/2-center.x*scaled,panY:height/2-center.y*scaled};
}
export function viewBounds(view){
  const corners=[[0,0],[view.width,0],[0,view.height],[view.width,view.height]].map(([x,y])=>groundAt(x,y,view));
  return {left:Math.min(...corners.map(p=>p.x)),right:Math.max(...corners.map(p=>p.x)),top:Math.min(...corners.map(p=>p.y)),bottom:Math.max(...corners.map(p=>p.y))};
}
