import {roadMarkings,roadProfile} from './city-roads.js?v=1';

export const VEHICLE_PALETTE=['#688d9b','#b5b3a0','#a5655b','#6f8772','#8a9198'];
const vehicleSeed=id=>(Math.imul(id+17,1103515245)>>>8)>>>0;

// 已修缮且当前受控的街区放完好车，废墟混合损坏/燃烧车；所有车辆仍只是静态街景。
export function streetVehicles(plots,{layout,controlled,visible,occupied,lamps=[],cellMeters}){
  const cars=[],width=2.4/cellMeters,length=4.6/cellMeters;
  if(cellMeters<8)return cars; // 极窄比例尺下不把真实尺寸的车塞进一个道路格。
  for(const p of plots){
    if(p.type==='hospital'||!['ruin','building'].includes(p.status)||p.status==='ruin'&&p.id%3!==0)continue;
    const seed=vehicleSeed(p.id),asset=p.status==='building'?'car':seed%4===0?'wreck':'damagedCar';
    const candidates=[[p.x-1,p.y+Math.floor(p.h/2)],[p.x+p.w,p.y+Math.floor(p.h/2)],[p.x+Math.floor(p.w/2),p.y-1],[p.x+Math.floor(p.w/2),p.y+p.h]];
    for(const [x,y] of candidates){
      const id=y*layout.width+x;
      if(x<0||y<0||x>=layout.width||y>=layout.height||layout.tiles[id]!=='road'||!visible(id)||occupied.has(id)||p.status==='building'&&!controlled.has(id))continue;
      if(!roadMarkings(layout).get(id)?.axis)continue;
      const pose=wreckRoadPose(layout,x,y,p,cellMeters),radius=length/2+.5/cellMeters;
      if(cars.some(c=>Math.hypot(c.x-pose.x,c.y-pose.y)<15/cellMeters)||lamps.some(l=>Math.hypot(l.x-pose.x,l.y-pose.y)<radius))continue;
      const ew=(Math.abs(Math.cos(pose.angle))*width+Math.abs(Math.sin(pose.angle))*length)/2,eh=(Math.abs(Math.sin(pose.angle))*width+Math.abs(Math.cos(pose.angle))*length)/2;
      let allowed=true;
      for(let cy=Math.floor(pose.y-eh);cy<=Math.floor(pose.y+eh);cy++)for(let cx=Math.floor(pose.x-ew);cx<=Math.floor(pose.x+ew);cx++){
        const cell=cy*layout.width+cx;if(cx<0||cy<0||cx>=layout.width||cy>=layout.height||layout.tiles[cell]!=='road'||!visible(cell)||occupied.has(cell)||p.status==='building'&&!controlled.has(cell))allowed=false;
      }
      if(!allowed)continue;
      cars.push({id:'vehicle:'+p.id,asset,...pose,w:width,h:length,color:VEHICLE_PALETTE[seed%VEHICLE_PALETTE.length],fireScale:length/.95});break;
    }
  }
  return cars;
}

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
      const inset=Math.min(.18,1.8/cellMeters)*.6;
      const x=c.x+(c.dx?c.dx<0?1-inset:inset:.5),y=c.y+(c.dy?c.dy<0?1-inset:inset:.5);
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

// 车沿临楼的外侧车道/停车带停靠，不放到新增的中央分隔带；倾斜姿态稳定。
export function wreckRoadPose(layout,x,y,plot,cellMeters=20){
  const mark=roadMarkings(layout).get(y*layout.width+x);
  if(!mark?.axis)return {x:x+.5,y:y+.5,angle:0};
  const p=roadProfile(mark.width*cellMeters),vertical=mark.axis==='v';
  const side=Math.sign((vertical?plot.x+plot.w/2:plot.y+plot.h/2)-(vertical?x+.5:y+.5))||1;
  const edge=p.median/2+p.lanes*p.lane+(p.parking?p.parking/2:-p.lane*.5),cross=Math.max(.16,Math.min(.84,mark.center+side*edge/cellMeters));
  return {x:x+(vertical?cross:.5),y:y+(vertical?.5:cross),angle:(vertical?0:Math.PI/2)+(plot.id%2?.12:-.12)};
}

// 每栋运营建筑最多一处路缘文明装饰；小尺寸、同一权限，不增加可交互对象。
export function operatingStreetProps(lamps,{layout,controlled,visible,occupied,cellMeters}){
  const props=[],used=new Set(),curb=Math.min(.18*cellMeters,1.8);
  for(const lamp of lamps){
    const plot=lamp.id.split(':')[0];if(used.has(plot))continue;
    const asset=Number(plot)%2?'bench':'planter',w=asset==='bench'?2.2:1.6,h=asset==='bench'?.7:1.6;
    if(curb<h)continue;
    const dx=Math.cos(lamp.angle),dy=-Math.sin(lamp.angle),shore=asset==='bench'?0:(curb*.6-curb/2)/cellMeters;
    const x=lamp.x-dy*3/cellMeters-dx*shore,y=lamp.y+dx*3/cellMeters-dy*shore,angle=lamp.angle-Math.PI/2;
    const ew=(Math.abs(Math.cos(angle))*w+Math.abs(Math.sin(angle))*h)/cellMeters,eh=(Math.abs(Math.sin(angle))*w+Math.abs(Math.cos(angle))*h)/cellMeters;
    let allowed=true;
    for(let cy=Math.floor(y-eh/2);cy<=Math.floor(y+eh/2);cy++)for(let cx=Math.floor(x-ew/2);cx<=Math.floor(x+ew/2);cx++){
      const id=cy*layout.width+cx;if(cx<0||cy<0||cx>=layout.width||cy>=layout.height||layout.tiles[id]!=='road'||!controlled.has(id)||!visible(id)||occupied.has(id))allowed=false;
    }
    if(!allowed)continue;props.push({id:'civil:'+lamp.id,asset,x,y,w:w/cellMeters,h:h/cellMeters,angle});used.add(plot);
  }
  return props;
}
