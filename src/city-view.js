// 观察镜头只变换显示坐标；俯视建设继续使用原格子命中和权限。
export function viewCenter({width,height,panX,panY,cell}){return {x:(width/2-panX)/cell,y:(height/2-panY)/cell};}
// 透视在观察中心保留原格宽；Three.js相机与Canvas信息共用此距离。
export function viewDistance(view){return view.projection==='perspective'?view.height/(2*view.cell*Math.tan((view.fov??40)*Math.PI/360)):Math.max(100,(view.size??60)*2);}
export function viewPixelScale(x,y,z,view){
  if(view.projection!=='perspective')return view.cell;
  const center=viewCenter(view),distance=viewDistance(view),v=Math.sin(view.yaw)*(x-center.x)+Math.cos(view.yaw)*(y-center.y),depth=distance-Math.cos(view.elevation)*v-Math.sin(view.elevation)*z;
  return depth>=distance*.05?view.cell*distance/depth:0;
}
export function projectView(x,y,z,view){
  const {width,height,panX,panY,cell,yaw=0,elevation=Math.PI/2}=view;
  const center=viewCenter({width,height,panX,panY,cell}),dx=x-center.x,dy=y-center.y;
  const scale=viewPixelScale(x,y,z,{...view,yaw,elevation});
  if(!scale)return {x:NaN,y:NaN,hidden:true};
  return {x:width/2+scale*(Math.cos(yaw)*dx-Math.sin(yaw)*dy),y:height/2+scale*(Math.sin(elevation)*(Math.sin(yaw)*dx+Math.cos(yaw)*dy)-Math.cos(elevation)*z)};
}
export function groundAt(x,y,view){
  const center=viewCenter(view),yaw=view.yaw??0,elevation=view.elevation??Math.PI/2;
  let u=(x-view.width/2)/view.cell,v=(y-view.height/2)/(view.cell*Math.sin(elevation));
  if(view.projection==='perspective'){
    const distance=viewDistance(view),q=(y-view.height/2)/view.cell,denominator=Math.sin(elevation)*distance+q*Math.cos(elevation);
    // 地平线上方没有地面命中；交互以中心回退，视口边界另保守覆盖整张地图。
    if(denominator<=0)return {...center,sky:true};
    v=q*distance/denominator;u*=1-Math.cos(elevation)*v/distance;
  }
  return {x:center.x+Math.cos(yaw)*u+Math.sin(yaw)*v,y:center.y-Math.sin(yaw)*u+Math.cos(yaw)*v};
}
export function panView(dx,dy,view,x=view.width/2,y=view.height/2){
  const {yaw=0,elevation=Math.PI/2}=view;
  if(view.projection==='perspective'){
    const a=groundAt(x-dx,y-dy,view),b=groundAt(x,y,view);
    if(!a.sky&&!b.sky)return {x:(b.x-a.x)*view.cell,y:(b.y-a.y)*view.cell};
  }
  const v=dy/Math.sin(elevation);return {x:Math.cos(yaw)*dx+Math.sin(yaw)*v,y:-Math.sin(yaw)*dx+Math.cos(yaw)*v};
}
// 镜头向W/A/S/D移动，画面地物反向平移；斜向不加速，慢帧不产生大跳跃。
export function keyboardPanStep(keys,elapsed,speed){
  const x=Number(keys.has('KeyA'))-Number(keys.has('KeyD')),y=Number(keys.has('KeyW'))-Number(keys.has('KeyS'));
  const length=Math.hypot(x,y);if(!length)return {x:0,y:0};
  const travel=Math.max(0,Math.min(100,elapsed))/1000*speed;
  return {x:x/length*travel,y:y/length*travel};
}
// 远景为旋转后的地图留出完整空间；正常倍率保留原像素尺度，回正保持世界中心。
export function observationView(view,size=60){
  const {width,height,cell,yaw,elevation,zoom}=view,span=Math.abs(Math.cos(yaw))+Math.abs(Math.sin(yaw));
  const fit=Math.min(1,(width-48)/(size*cell/zoom*span),(height-48)/(size*cell/zoom*span*Math.sin(elevation))),t=Math.max(0,Math.min(1,2-zoom)),factor=1-(1-fit)*t*t*(3-2*t),center=viewCenter(view),scaled=cell*factor;
  let result={...view,cell:scaled,panX:width/2-center.x*scaled,panY:height/2-center.y*scaled};
  // 透视远景的近侧更大；全图时额外后退，常用倍率保持中心尺度。
  if(view.projection==='perspective'&&zoom<2){
    let perspectiveFit=1;
    for(const [x,y] of [[0,0],[size,0],[size,size],[0,size]]){
      const dx=x-center.x,dy=y-center.y,v=Math.sin(yaw)*dx+Math.cos(yaw)*dy,u=Math.cos(yaw)*dx-Math.sin(yaw)*dy,k=2*Math.tan((view.fov??40)*Math.PI/360)/height;
      for(const [extent,component] of [[width/2-24,Math.abs(u)],[height/2-24,Math.abs(Math.sin(elevation)*v)]]){
        const denominator=scaled*(component+extent*k*Math.cos(elevation)*v);
        if(denominator>0)perspectiveFit=Math.min(perspectiveFit,extent/denominator);
      }
    }
    const adjusted=scaled*(1-(1-Math.max(.05,perspectiveFit))*t*t*(3-2*t));
    result={...result,cell:adjusted,panX:width/2-center.x*adjusted,panY:height/2-center.y*adjusted};
  }
  return result;
}
export function viewBounds(view){
  const corners=[[0,0],[view.width,0],[0,view.height],[view.width,view.height]].map(([x,y])=>groundAt(x,y,view));
  if(corners.some(p=>p.sky))return {left:-8,right:(view.size??60)+8,top:-8,bottom:(view.size??60)+8};
  return {left:Math.min(...corners.map(p=>p.x)),right:Math.max(...corners.map(p=>p.x)),top:Math.min(...corners.map(p=>p.y)),bottom:Math.max(...corners.map(p=>p.y))};
}
// 绕城可完整旋转，俯仰保留25–80°，避免贴地穿楼或越过俯视翻转。
export function orbitView(yaw,elevation,turn,tilt){
  return {yaw:((yaw+turn+Math.PI)%(Math.PI*2)+Math.PI*2)%(Math.PI*2)-Math.PI,elevation:Math.max(25*Math.PI/180,Math.min(80*Math.PI/180,elevation+tilt))};
}
