import {riverBanks} from './natural-terrain.js?v=3';
import {fogColor} from './fog.js?v=19';
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
  const {width:w,height:h}=layout,extent=48;
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
  const land={extent,hills,exits,trees:[],buildings:[]};
  for(let y=-extent+2;y<h+extent-2;y+=.9)for(let x=-extent+2;x<w+extent-2;x+=.9){
    const n=hash(x,y),distance=outsideDistance(layout,x,y);if(distance<.8||distance>32||n%10>7||distance>12&&n%3!==0||Math.sin(x*.24+y*.16)+Math.cos(y*.34-x*.12)<1.1)continue;
    const px=x+((n>>>8)%101/100-.5)*.6,py=y+((n>>>16)%101/100-.5)*.6,river=exteriorRiver(layout,px);
    if(river&&py>river.top-.8&&py<river.bottom+.8)continue;
    if(exits.some(road=>road.points.some((p,i)=>i&&segmentDistance(px,py,road.points[i-1],p)<road.w/2+.8)))continue;
    land.trees.push({x:px,y:py,asset:['broad','column','young','broad','column'][n%5],width:7+n%7,angle:n%628/100});
  }
  // 远林减密但保留固定位置；预算只约束装饰，不截断水系或道路。
  if(land.trees.length>1200)land.trees=land.trees.filter((_,i)=>i%Math.ceil(land.trees.length/1200)===0);
  for(const road of exits)for(const distance of [2,5,8])for(const side of [-1,1]){
    const point=road.points.reduce((best,p)=>Math.abs(Math.hypot(p.x-road.x,p.y-road.y)-distance)<Math.abs(Math.hypot(best.x-road.x,best.y-road.y)-distance)?p:best,road.points[0]);
    const x=point.x-road.dy*side*(road.w/2+1.25),y=point.y+road.dx*side*(road.w/2+1.25),river=exteriorRiver(layout,x);
    if(river&&y>river.top-1&&y<river.bottom+1)continue;
    land.buildings.push({x,y,asset:hash(x,y)%5?'homeRuined':'factoryRuined',width:hash(x,y)%5?14:24,angle:Math.atan2(road.dx,road.dy)});
  }
  cache.set(layout,land);return land;
}

const textures=new WeakMap();
// 俯视回退也画同一片林地/水系；日夜两张静态纹理按原主题进度混合。
export function drawSurroundingTerrain(ctx,layout,night){
  const land=surroundingLandscape(layout),b=land.extent,w=layout.width,h=layout.height;
  if(!textures.has(layout))textures.set(layout,[0,1].map(dark=>{
    const canvas=document.createElement('canvas');canvas.width=(w+b*2)*8;canvas.height=(h+b*2)*8;const g=canvas.getContext('2d');g.scale(8,8);g.translate(b,b);g.save();g.beginPath();g.rect(-b,-b,w+b*2,h+b*2);g.rect(0,0,w,h);g.clip('evenodd');
    for(let y=-b;y<h+b;y++)for(let x=-b;x<w+b;x++){
      if(x>=0&&y>=0&&x<w&&y<h)continue;const height=exteriorHeight(layout,land,x+.5,y+.5);
      g.fillStyle=dark?`rgb(${43+height*3},${65+height*4},${63+height*3})`:`rgb(${121+height*7},${142+height*6},${102+height*4})`;g.fillRect(x,y,1.01,1.01);
    }
    for(const road of land.exits){g.strokeStyle=dark?'#364b52':'#718279';g.lineWidth=road.w;g.beginPath();road.points.forEach((p,i)=>i?g.lineTo(p.x,p.y):g.moveTo(p.x,p.y));g.stroke();}
    if(layout.natural?.river)for(const side of [-1,1]){const points=[];for(let d=0;d<=b;d++){const x=side<0?-d:w+d;points.push({x,...exteriorRiver(layout,x)});}g.fillStyle=dark?'#294b60':'#588a97';g.beginPath();points.forEach((p,i)=>i?g.lineTo(p.x,p.top):g.moveTo(p.x,p.top));for(const p of [...points].reverse())g.lineTo(p.x,p.bottom);g.closePath();g.fill();}
    g.fillStyle=dark?'#2f493c':'#627a4d';for(const tree of land.trees){g.beginPath();g.arc(tree.x,tree.y,tree.width/40,0,Math.PI*2);g.fill();}
    for(const house of land.buildings){g.fillStyle=dark?'#607273':'#a1a08a';g.fillRect(house.x-.35,house.y-.4,.7,.8);}
    g.fillStyle=fogColor(dark);for(let y=-b;y<h+b;y++)for(let x=-b;x<w+b;x++){const d=outsideDistance(layout,x+.5,y+.5);if(!d)continue;g.globalAlpha=.12+.18*smooth(d/12)+.7*smooth((d-10)/38);g.fillRect(x,y,1.01,1.01);}g.restore();return canvas;
  }));
  const [day,dark]=textures.get(layout);ctx.drawImage(day,-b,-b,w+b*2,h+b*2);if(night>0){ctx.save();ctx.globalAlpha=night;ctx.drawImage(dark,-b,-b,w+b*2,h+b*2);ctx.restore();}
}
