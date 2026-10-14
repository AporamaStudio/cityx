// 自然地形先占用完整非特殊街区带，再沿主路架桥；不切开医院、银行或教学街区。
const smooth=t=>t*t*(3-2*t);
export function naturalGroundAt(layout,x,y,cellMeters=20){
  return (layout.natural?.bridges??[]).some(b=>x>=b.x&&x<b.x+b.w&&y>=b.y&&y<b.y+b.h)?.8/cellMeters:0;
}
export function hillHeight(hill,x,y,cellMeters=20){
  const r=((x-hill.cx)/hill.rx)**2+((y-hill.cy)/hill.ry)**2;
  return r>=1?0:hill.height/cellMeters*(1-r)**2;
}
export function lakeOutline(lake){
  return Array.from({length:32},(_,i)=>{const angle=i/32*Math.PI*2,r=.94+.04*Math.sin(angle*3+lake.phase)+.02*Math.cos(angle*5);return {x:lake.cx+Math.cos(angle)*lake.rx*r,y:lake.cy+Math.sin(angle)*lake.ry*r};});
}
export function riverBanks(river,x){
  const points=river.points,i=Math.max(0,Math.min(points.length-2,Math.floor(x))),t=Math.max(0,Math.min(1,x-i));
  return {top:points[i].top+(points[i+1].top-points[i].top)*smooth(t),bottom:points[i].bottom+(points[i+1].bottom-points[i].bottom)*smooth(t)};
}
export function addNaturalTerrain({seed,width,height,tiles,blocks,bands,camp}){
  const natural={river:null,regions:[],bridges:[],lakes:[],hills:[]};
  const eligible=bands.filter(b=>b.height>=7&&b.y>=14&&b.y+b.height<camp.y-12&&!blocks.some(p=>(p.special||p.role)&&p.y>=b.y&&p.y<b.y+b.height));
  eligible.sort((a,b)=>Math.abs(a.y+a.height/2-height*.59)-Math.abs(b.y+b.height/2-height*.59));
  const band=eligible[0];if(!band)return {natural,nonTraversable:[]};
  let hash=0;for(const c of String(seed))hash=(Math.imul(hash,31)+c.codePointAt(0))>>>0;
  const phase=hash%628/100,points=[];
  for(let x=0;x<=width;x++){
    const center=band.y+band.height/2+Math.sin(x/11+phase)*.72+Math.sin(x/23+phase*.7)*.4;
    const half=1.25+Math.sin(x/17+phase)*.16;points.push({x,top:center-half,bottom:center+half});
  }
  const river=natural.river={y:band.y,height:band.height,points};natural.regions.push({x:0,y:band.y,w:width,h:band.height,kind:'river'});
  for(let i=blocks.length-1;i>=0;i--)if(blocks[i].y>=band.y&&blocks[i].y<band.y+band.height)blocks.splice(i,1);
  // 河岸是自然地面，不把移除街区的空间摊成宽道路。水域按覆盖格保守禁行。
  for(let x=0;x<width;x++){
    const a=riverBanks(river,x),b=riverBanks(river,x+1),top=Math.min(a.top,b.top),bottom=Math.max(a.bottom,b.bottom);
    for(let y=band.y;y<band.y+band.height;y++)tiles[y*width+x]=y+1>top&&y<bottom?'water':'open';
  }
  const crossings=[{x:0,w:1},{x:Math.max(4,Math.floor(width*.24)),w:1},{x:band.spine,w:band.roadWidth},{x:width-1,w:1}];
  // 主干桥沿当前街区带的主轴；道路宽度由带的原主路记录传入，不能写死成两条街。
  for(const crossing of crossings){
    const water=[];
    for(let x=crossing.x;x<crossing.x+crossing.w;x++)for(let y=band.y;y<band.y+band.height;y++){
      if(tiles[y*width+x]==='water')water.push(y);tiles[y*width+x]='road';
    }
    natural.bridges.push({x:crossing.x,y:Math.min(...water),w:crossing.w,h:Math.max(...water)-Math.min(...water)+1});
  }
  const parks=blocks.filter(p=>p.kind==='open'&&!p.special&&!p.role&&p.width>=3&&p.height>=3&&Math.hypot(p.x-camp.x,p.y-camp.y)>12);
  const lakes=parks.filter(p=>p.width>=4&&p.height>=4).sort((a,b)=>Math.abs(a.y-height*.4)-Math.abs(b.y-height*.4));
  const reserve=(p,kind)=>{blocks.splice(blocks.indexOf(p),1);natural.regions.push({x:p.x,y:p.y,w:p.width,h:p.height,kind});};
  const lakeSite=lakes[0];
  if(lakeSite){
    reserve(lakeSite,'lake');const p=lakeSite,lake={cx:p.x+p.width/2,cy:p.y+p.height/2,rx:p.width*.34,ry:p.height*.34,phase};natural.lakes.push(lake);
    for(let y=p.y;y<p.y+p.height;y++)for(let x=p.x;x<p.x+p.width;x++){
      const dx=Math.max(x-lake.cx,0,lake.cx-x-1),dy=Math.max(y-lake.cy,0,lake.cy-y-1);
      if((dx/lake.rx)**2+(dy/lake.ry)**2<=1)tiles[y*width+x]='water';
    }
  }
  const hills=parks.filter(p=>p!==lakeSite).sort((a,b)=>Math.abs(a.y-height*.68)-Math.abs(b.y-height*.68));
  const hillSite=hills[0];
  if(hillSite){
    reserve(hillSite,'hill');const p=hillSite;natural.hills.push({x:p.x,y:p.y,w:p.width,h:p.height,cx:p.x+p.width*.5,cy:p.y+p.height*.5,rx:p.width*.48,ry:p.height*.48,height:10+hash%6});
    for(let y=p.y;y<p.y+p.height;y++)for(let x=p.x;x<p.x+p.width;x++)tiles[y*width+x]='hill';
  }
  blocks.forEach((p,i)=>p.id=i);
  return {natural,nonTraversable:tiles.flatMap((t,id)=>['water','hill'].includes(t)?[id]:[])};
}

// 岸边树木以固定簇密度生成；保守避开水、道路和桥，不生成可采集资源。
export function naturalPlants(layout,cellMeters=20){
  const plants=[];if(!layout.natural||cellMeters<8)return plants;
  let index=0;const step=12/cellMeters;
  for(const r of layout.natural.regions)for(let y=r.y+step/2;y<r.y+r.h;y+=step)for(let x=r.x+step/2;x<r.x+r.w;x+=step){
    const hash=(Math.imul(Math.floor(x*100)+31,1664525)^Math.imul(Math.floor(y*100)+7,1013904223))>>>0;
    const cluster=Math.sin(x*.73+y*.19)+Math.cos(y*1.45-x*.13);
    if(hash%10>4||cluster<-.6)continue;
    const px=x+((hash>>>8)%101/100-.5)*step*.5,py=y+((hash>>>16)%101/100-.5)*step*.5;
    const asset=['broad','column','young','round','wild'][hash%5],w=({broad:10,column:5.4,young:4.3,round:2.7,wild:2.2}[asset])*(.8+(hash%31)/100)/cellMeters,radius=w/Math.SQRT2;
    let allowed=px-radius>=r.x&&px+radius<=r.x+r.w&&py-radius>=r.y&&py+radius<=r.y+r.h;
    for(let cy=Math.floor(py-radius);allowed&&cy<=Math.floor(py+radius);cy++)for(let cx=Math.floor(px-radius);cx<=Math.floor(px+radius);cx++)if(!['open','hill'].includes(layout.tiles[cy*layout.width+cx]))allowed=false;
    if(!allowed)continue;
    const hill=layout.natural.hills.find(h=>px>=h.x&&px<=h.x+h.w&&py>=h.y&&py<=h.y+h.h);
    plants.push({id:index++,asset,x:px,y:py,w,angle:hash%628/100,ground:hill?hillHeight(hill,px,py,cellMeters):.001});
    if(plants.length>=800)return plants;
  }
  return plants;
}

// 俯视底图与布局预览共用岸线，缺少WebGL时仍能读出水域和桥梁。
export function drawNaturalTerrain(ctx,layout,night=0){
  const n=layout.natural;if(!n?.river)return;
  const land=night>.5?'#314c45':'#7f9270',water=night>.5?'#294b60':'#588a97';
  for(const r of n.regions){ctx.fillStyle=land;ctx.fillRect(r.x,r.y,r.w,r.h);}
  const river=n.river,points=river.points;ctx.fillStyle=water;ctx.beginPath();ctx.moveTo(points[0].x,points[0].top);for(const p of points)ctx.lineTo(p.x,p.top);for(const p of [...points].reverse())ctx.lineTo(p.x,p.bottom);ctx.closePath();ctx.fill();
  ctx.strokeStyle=night>.5?'#647b78':'#b5b294';ctx.lineWidth=.14;for(const edge of ['top','bottom']){ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(p.x,p[edge]):ctx.moveTo(p.x,p[edge]));ctx.stroke();}
  for(const b of n.bridges){ctx.fillStyle=night>.5?'#3d4c55':'#616869';ctx.fillRect(b.x,river.y,b.w,river.height);ctx.strokeStyle=night>.5?'#8c9997':'#d5c9af';ctx.lineWidth=.07;ctx.strokeRect(b.x+.05,b.y,b.w-.1,b.h);}
  for(const lake of n.lakes){const points=lakeOutline(lake);ctx.fillStyle=water;ctx.strokeStyle=night>.5?'#647b78':'#b5b294';ctx.lineWidth=.16;ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.closePath();ctx.fill();ctx.stroke();}
  for(const hill of n.hills){const shade=ctx.createRadialGradient(hill.cx-.25,hill.cy-.3,0,hill.cx,hill.cy,Math.max(hill.rx,hill.ry));shade.addColorStop(0,night>.5?'#5c7462':'#b1b184');shade.addColorStop(1,land);ctx.fillStyle=shade;ctx.beginPath();ctx.ellipse(hill.cx,hill.cy,hill.rx,hill.ry,0,0,Math.PI*2);ctx.fill();}
}
