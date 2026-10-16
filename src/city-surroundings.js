import {riverBanks} from './natural-terrain.js?v=7';
import {plantWidthMeters} from './city-vegetation.js?v=2';
import {exteriorFogExtent} from './visibility.js?v=9';
const cache=new WeakMap(),smooth=t=>{t=Math.max(0,Math.min(1,t));return t*t*(3-2*t);};
const hash=(x,y)=>(Math.imul(Math.round(x*100)+101,73856093)^Math.imul(Math.round(y*100)+103,19349663))>>>0;
export const outsideDistance=(layout,x,y)=>Math.hypot(Math.max(0,-x,x-layout.width),Math.max(0,-y,y-layout.height));
export function segmentDistance(x,y,a,b){
  const dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((x-a.x)*dx+(y-a.y)*dy)/(dx*dx+dy*dy||1)));
  return Math.hypot(x-a.x-t*dx,y-a.y-t*dy);
}
export function exteriorRiver(layout,x){
  const river=layout.natural?.river;if(!river)return null;
  if(x>=0&&x<=layout.width)return riverBanks(river,x);
  const edge=riverBanks(river,x<0?0:layout.width),d=x<0?-x:x-layout.width,center=(edge.top+edge.bottom)/2;
  const drift=Math.sin(d/12)*(1-Math.exp(-d/3))*2.1,half=(edge.bottom-edge.top)/2*(1+(x<0?.15:.8)*smooth(d/40));
  return {top:center+drift-half,bottom:center+drift+half};
}
export function exteriorHeight(layout,land,x,y,cellMeters=20){
  const distance=outsideDistance(layout,x,y);if(distance===0)return 0;
  let height=0;
  for(const hill of land.hills){const r=((x-hill.x)/hill.rx)**2+((y-hill.y)/hill.ry)**2;if(r<1)height+=hill.height/cellMeters*(1-r)**2;}
  height*=smooth((distance-3)/8);
  const river=exteriorRiver(layout,x);if(river){const away=Math.max(river.top-y,0,y-river.bottom);height*=smooth(away/4);}
  for(const road of land.exits)for(let i=1;i<road.points.length;i++)height*=smooth((segmentDistance(x,y,road.points[i-1],road.points[i])-road.w/2)/1.8);
  return height;
}

// 外围不是第二张游戏地图：只输出延伸水系、郊区出口和远丘/林地，不存格子权限。
export function surroundingLandscape(layout){
  if(cache.has(layout))return cache.get(layout);
  const {width:w,height:h}=layout,extent=exteriorFogExtent(Math.min(w,h));
  const edgeRoad=(horizontal,position)=>{
    const length=horizontal?w:h,candidates=[];
    for(let i=1;i<length-1;i++){
      const road=j=>layout.tiles[horizontal?position*w+j:j*w+position]==='road';if(!road(i)||road(i-1))continue;
      let end=i;while(end<length-1&&road(end))end++;
      if(end-i<=3)candidates.push({center:(i+end)/2,w:end-i});i=end-1;
    }
    candidates.sort((a,b)=>Math.abs(a.center-length/2)-Math.abs(b.center-length/2));return candidates[0]??{center:length/2,w:1};
  };
  const north=edgeRoad(true,1),south=edgeRoad(true,h-2);
  const crossRows=layout.roads.filter(r=>r.x===1&&Array.from({length:w-2},(_,i)=>layout.tiles[r.y*w+i+1]).filter(t=>t==='road').length>=w*.8).map(r=>r.y);
  const rowAt=t=>crossRows.reduce((best,y)=>Math.abs(y-h*t)<Math.abs(best-h*t)?y:best,crossRows[0]??Math.round(h*t));
  const anchors=[{x:north.center,y:0,w:north.w,dx:0,dy:-1},{x:south.center,y:h,w:south.w,dx:0,dy:1},{x:0,y:rowAt(.25)+.5,w:1,dx:-1,dy:0},{x:w,y:rowAt(.78)+.5,w:1,dx:1,dy:0}];
  const exits=anchors.map((a,index)=>({...a,points:[0,2,6,12,20,30,40].map(d=>{const drift=Math.sin(d/14)*(1-Math.exp(-d/5))*2*(index%2?1:-1);return {x:a.x+a.dx*d-a.dy*drift,y:a.y+a.dy*d+a.dx*drift};})}));
  const hills=[{x:-23,y:h*.18,rx:21,ry:18,height:65},{x:w+27,y:h*.72,rx:24,ry:26,height:82},{x:w*.7,y:-25,rx:28,ry:21,height:60},{x:w*.2,y:h+27,rx:25,ry:22,height:70}];
  const land={extent,hills,exits,trees:[],buildings:[],fields:[],props:[]};
  for(let y=-extent+2;y<h+extent-2;y+=.9)for(let x=-extent+2;x<w+extent-2;x+=.9){
    const n=hash(x,y),distance=outsideDistance(layout,x,y);if(distance<.8||distance>32||n%10>7||distance>12&&n%3!==0||Math.sin(x*.24+y*.16)+Math.cos(y*.34-x*.12)<1.1)continue;
    const px=x+((n>>>8)%101/100-.5)*.6,py=y+((n>>>16)%101/100-.5)*.6,river=exteriorRiver(layout,px);
    if(river&&py>river.top-.8&&py<river.bottom+.8)continue;
    if(exits.some(road=>road.points.some((p,i)=>i&&segmentDistance(px,py,road.points[i-1],p)<road.w/2+.8)))continue;
    // 郊野多一些成年宽冠树形成林冠；窄冠/幼树沿用城市尺度，不靠整体放大表现森林。
    const asset=['broad','broad','column','broad','young','broad'][n%6];
    land.trees.push({x:px,y:py,asset,width:plantWidthMeters(asset,n),angle:n%628/100});
  }
  // 远林减密但保留固定位置；预算只约束装饰，不截断水系或道路。
  if(land.trees.length>1200)land.trees=land.trees.filter((_,i)=>i%Math.ceil(land.trees.length/1200)===0);
  // 近郊只放田野与谷仓，不再放玩家可经营的住房/厂房模型；沿真实出口拼少量田块。
  const occupied=[],tryPlace=(item,target)=>{
    const radius=item.width/20*Math.SQRT1_2;
    for(const [dx,dy] of [[0,0],[-radius,-radius],[-radius,radius],[radius,-radius],[radius,radius]]){
      const x=item.x+dx,y=item.y+dy,river=exteriorRiver(layout,x);
      if(outsideDistance(layout,x,y)<.6||exteriorHeight(layout,land,x,y)*20>1||river&&y>river.top-.35&&y<river.bottom+.35)return false;
    }
    if(exits.some(road=>road.points.some((p,i)=>i&&segmentDistance(item.x,item.y,road.points[i-1],p)<road.w/2+radius+.15)))return false;
    if(occupied.some(p=>Math.hypot(item.x-p.x,item.y-p.y)<radius+p.radius+.12))return false;
    target.push(item);occupied.push({...item,radius});return true;
  };
  for(const [index,road] of exits.entries()){
    const point=road.points[1],side=index%2?1:-1,angle=Math.atan2(road.dx,road.dy),near=(along,cross)=>({x:point.x+road.dx*along-road.dy*side*cross,y:point.y+road.dy*along+road.dx*side*cross});
    for(let row=0;row<2;row++)for(let col=0;col<3;col++){
      const asset=['farmland','wheatfield','wheatfield-abandoned','wheatfield-burnt'][(index+col+row)%4];
      tryPlace({...near(row?3.6:1.8,road.w/2+.9+col*1.65),asset,width:20,angle},land.fields);
    }
    const barn={...near(.1,road.w/2+1.35),asset:index%2?'barn':'barn-abandoned',width:18,angle:angle+side*Math.PI/2};
    if(tryPlace(barn,land.buildings))for(const offset of [2.2,2.5])tryPlace({...near(.1,road.w/2+offset),asset:'hay-bale',width:2.4,angle},land.props);
  }
  // 稳定候选林地只移除占住田野/谷仓的树，不重新随机全片森林。
  land.trees=land.trees.filter(tree=>!occupied.some(p=>Math.hypot(tree.x-p.x,tree.y-p.y)<p.radius+tree.width/40+.15));
  cache.set(layout,land);return land;
}
