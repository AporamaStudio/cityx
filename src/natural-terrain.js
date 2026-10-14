// 自然地形先占用完整非特殊街区带，再沿主路架桥；不切开医院、银行或教学街区。
const smooth=t=>t*t*(3-2*t);
export function naturalGroundAt(layout,x,y,cellMeters=20){
  return (layout.natural?.bridges??[]).some(b=>x>=b.x&&x<b.x+b.w&&y>=b.y&&y<b.y+b.h)?.8/cellMeters:0;
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
  blocks.forEach((p,i)=>p.id=i);
  return {natural,nonTraversable:tiles.flatMap((t,id)=>t==='water'?[id]:[])};
}

// 俯视底图与布局预览共用岸线，缺少WebGL时仍能读出水域和桥梁。
export function drawNaturalTerrain(ctx,layout,night=0){
  const n=layout.natural;if(!n?.river)return;
  const land=night>.5?'#314c45':'#7f9270',water=night>.5?'#294b60':'#588a97';
  for(const r of n.regions){ctx.fillStyle=land;ctx.fillRect(r.x,r.y,r.w,r.h);}
  const river=n.river,points=river.points;ctx.fillStyle=water;ctx.beginPath();ctx.moveTo(points[0].x,points[0].top);for(const p of points)ctx.lineTo(p.x,p.top);for(const p of [...points].reverse())ctx.lineTo(p.x,p.bottom);ctx.closePath();ctx.fill();
  ctx.strokeStyle=night>.5?'#647b78':'#b5b294';ctx.lineWidth=.14;for(const edge of ['top','bottom']){ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(p.x,p[edge]):ctx.moveTo(p.x,p[edge]));ctx.stroke();}
  for(const b of n.bridges){ctx.fillStyle=night>.5?'#3d4c55':'#616869';ctx.fillRect(b.x,river.y,b.w,river.height);ctx.strokeStyle=night>.5?'#8c9997':'#d5c9af';ctx.lineWidth=.07;ctx.strokeRect(b.x+.05,b.y,b.w-.1,b.h);}
}
