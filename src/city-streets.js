// 街景只读取现有运营、归属和视野；灯杆靠建筑一侧的路缘，灯臂朝向道路。
export function operatingStreetLamps(plots,{layout,controlled,visible,occupied,cellMeters}){
  const lamps=[],width=layout.width,height=layout.height;
  for(const p of plots)if(p.powered){
    const candidates=[];
    for(let x=p.x;x<p.x+p.w;x++)candidates.push({x,y:p.y-1,dx:0,dy:-1,face:'n'},{x,y:p.y+p.h,dx:0,dy:1,face:'s'});
    for(let y=p.y;y<p.y+p.h;y++)candidates.push({x:p.x-1,y,dx:-1,dy:0,face:'w'},{x:p.x+p.w,y,dx:1,dy:0,face:'e'});
    candidates.sort((a,b)=>Math.hypot(a.x+.5-p.x-p.w/2,a.y+.5-p.y-p.h/2)-Math.hypot(b.x+.5-p.x-p.w/2,b.y+.5-p.y-p.h/2));
    const faces=new Set();
    for(const c of candidates){
      const id=c.y*width+c.x;if(faces.has(c.face)||c.x<0||c.y<0||c.x>=width||c.y>=height||layout.tiles[id]!=='road'||!controlled.has(id)||!visible(id)||occupied.has(id))continue;
      const x=c.x+(c.dx?c.dx<0?.9:.1:.5),y=c.y+(c.dy?c.dy<0?.9:.1:.5);
      if(lamps.some(l=>Math.hypot(l.x-x,l.y-y)<30/cellMeters))continue;
      lamps.push({id:`${p.id}:${c.face}`,x,y,angle:-Math.atan2(c.dy,c.dx)});faces.add(c.face);
    }
  }
  return lamps;
}

// 每个已知废墟最多一处小街景，靠路缘且不占设施；恢复时随原地块状态消失。
export function ruinStreetProps(plots,{layout,visible,occupied,cellMeters}){
  const props=[];
  for(const p of plots)if(p.status==='ruin'){
    const candidates=[[p.x-1,p.y+p.h-1,-1,0],[p.x+p.w,p.y,1,0],[p.x,p.y-1,0,-1],[p.x+p.w-1,p.y+p.h,0,1]];
    const c=candidates.find(([x,y])=>x>=0&&y>=0&&x<layout.width&&y<layout.height&&layout.tiles[y*layout.width+x]==='road'&&visible(y*layout.width+x)&&!occupied.has(y*layout.width+x));
    if(!c)continue;
    const [x,y,dx,dy]=c,asset=p.id%2?'trash':'rubble',w=(asset==='trash'?2.4:4.5)/cellMeters,h=(asset==='trash'?1.8:3)/cellMeters;
    props.push({id:'debris:'+p.id,asset,x:x+(dx?dx<0?.82:.18:.5),y:y+(dy?dy<0?.82:.18:.5),w,h});
  }
  return props;
}
