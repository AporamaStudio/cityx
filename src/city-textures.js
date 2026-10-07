// 轻量程序贴图：日/夜各生成一套并缓存，纹理只表达材质，不参与通行或受击规则。
const cache=new Map(),PX=32;
const palettes={
  day:{road:'#53656b',edge:'#a7aca0',lane:'#d7caa0',yard:'#697b70',ruin:'#877f6b',roof:'#b0a084',crack:'#454b46',factory:'#739697',factoryRoof:'#a4c2b9',home:'#af775c',homeWall:'#dfc6a0',window:'#425d64',grass:'#738b67'},
  night:{road:'#213242',edge:'#526773',lane:'#8b927c',yard:'#263e3e',ruin:'#3c464a',roof:'#646967',crack:'#202d35',factory:'#335c61',factoryRoof:'#568485',home:'#655051',homeWall:'#918679',window:'#ffdf92',grass:'#294e40'},
};
function texture(id,w,h,paint){
  if(!cache.has(id)){const c=document.createElement('canvas');c.width=w*PX;c.height=h*PX;const g=c.getContext('2d');g.scale(PX,PX);paint(g);cache.set(id,c);}
  return cache.get(id);
}
function layers(ctx,x,y,w,h,mix,get){
  ctx.drawImage(get('day'),x,y,w,h);
  if(mix>0){ctx.save();ctx.globalAlpha=mix;ctx.drawImage(get('night'),x,y,w,h);ctx.restore();}
}
// 路缘只画在道路与地块接壤处，路口不画封口线；中线不改变路线预告。
export function drawRoadTexture(ctx,layout,x,y,mix){
  const road=(dx,dy)=>x+dx>=0&&y+dy>=0&&x+dx<layout.width&&y+dy<layout.height&&layout.tiles[(y+dy)*layout.width+x+dx]==='road';
  const mask=(road(0,-1)?1:0)|(road(1,0)?2:0)|(road(0,1)?4:0)|(road(-1,0)?8:0);
  layers(ctx,x,y,1,1,mix,time=>texture(`road:${mask}:${time}`,1,1,g=>{
    const p=palettes[time];g.fillStyle=p.road;g.fillRect(0,0,1,1);
    g.fillStyle=time==='day'?'#ffffff09':'#a9ccff08';
    for(let i=0;i<10;i++)g.fillRect((i*17%29)/32,(i*11%31)/32,.025,.025);
    g.fillStyle=p.edge;
    if(!(mask&1))g.fillRect(0,0,1,.09);if(!(mask&4))g.fillRect(0,.91,1,.09);
    if(!(mask&8))g.fillRect(0,0,.09,1);if(!(mask&2))g.fillRect(.91,0,.09,1);
    g.fillStyle=p.lane;
    if(mask===5)g.fillRect(.48,.24,.04,.40);
    if(mask===10)g.fillRect(.24,.48,.40,.04);
    // 宽路靠边的车道用短线连接；十字路口中间保持干净。
    if(mask===7||mask===13)g.fillRect(mask===7?.28:.69,.25,.035,.35);
    if(mask===11||mask===14)g.fillRect(.25,mask===11?.69:.28,.35,.035);
  }));
}
export function drawBlockTexture(ctx,p,kind,mix){
  const w=p.width??p.size,h=p.height??p.size,variant=(p.x*7+p.y*13)%4;
  layers(ctx,p.x+.1,p.y+.1,w-.2,h-.2,mix,time=>texture(`block:${kind}:${w}:${h}:${variant}:${time}`,w,h,g=>{
    const c=palettes[time],night=time==='night';
    g.fillStyle=kind==='ruin'?c.ruin:c.yard;g.fillRect(0,0,w,h);
    // 院落砾石和铺装纹理固定于地块，不逐帧随机闪动。
    g.fillStyle=night?'#b1ccd00b':'#fff5d812';
    for(let i=0;i<w*h*3;i++)g.fillRect(((i*37+variant*9)%(w*31))/32,((i*19+variant*3)%(h*31))/32,.06,.035);
    const cols=Math.max(1,Math.floor(w/2)),rows=Math.max(1,Math.floor(h/2)),cw=w/cols,ch=h/rows;
    for(let row=0;row<rows;row++)for(let col=0;col<cols;col++){
      const x=col*cw+.24,y=row*ch+.24,bw=cw-.48,bh=ch-.48;
      g.fillStyle='#0c1b2366';g.fillRect(x+.12,y+.17,bw,bh);
      if(kind==='housing'){
        g.fillStyle=c.grass;g.fillRect(x-.09,y-.09,bw+.18,bh+.18);
        g.fillStyle=c.homeWall;g.fillRect(x,y+.14,bw,bh-.14);
        g.fillStyle=c.home;g.beginPath();g.moveTo(x-.04,y+.2);g.lineTo(x+bw/2,y-.05);g.lineTo(x+bw+.04,y+.2);g.lineTo(x+bw+.04,y+bh*.60);g.lineTo(x-.04,y+bh*.60);g.closePath();g.fill();
        g.strokeStyle=night?'#a27966':'#e3ad81';g.lineWidth=.04;g.beginPath();g.moveTo(x+bw/2,y);g.lineTo(x+bw/2,y+bh*.6);g.stroke();
        g.fillStyle=c.window;g.fillRect(x+.12,y+bh*.7,.19,.18);g.fillRect(x+bw-.31,y+bh*.7,.19,.18);
        g.fillStyle=night?'#1b3037':'#6f7063';g.fillRect(x+bw/2-.09,y+bh-.23,.18,.23);
        if(night){g.fillStyle='#ffdb7522';g.fillRect(x,y+bh*.6,bw,bh*.4+.12);}
      }else if(kind==='production'||kind==='outpost'){
        g.fillStyle=c.factory;g.fillRect(x,y,bw,bh);
        g.fillStyle=c.factoryRoof;g.fillRect(x+.08,y+.08,bw-.16,bh-.28);
        g.strokeStyle=night?'#31565e':'#7f9c97';g.lineWidth=.045;
        for(let sx=.25;sx<bw-.15;sx+=.28){g.beginPath();g.moveTo(x+sx,y+.12);g.lineTo(x+sx,y+bh-.26);g.stroke();}
        g.fillStyle=night?'#24414b':'#587579';g.fillRect(x+.2,y+.2,.32,.32);g.fillStyle=c.window;
        for(let sx=.15;sx<bw-.1;sx+=.4)g.fillRect(x+sx,y+bh-.16,.20,.10);
      }else{
        // 屋顶缺口、贯穿裂缝及散落砖块，让废墟不再像完好建筑。
        g.fillStyle=c.roof;g.beginPath();g.moveTo(x,y);g.lineTo(x+bw*.56,y);g.lineTo(x+bw*.48,y+bh*.27);g.lineTo(x+bw*.77,y+bh*.19);g.lineTo(x+bw,y+.12);g.lineTo(x+bw,y+bh);g.lineTo(x,y+bh);g.closePath();g.fill();
        g.strokeStyle=c.crack;g.lineWidth=.08;g.beginPath();g.moveTo(x+bw*.48,y+bh*.27);g.lineTo(x+bw*.36,y+bh*.53);g.lineTo(x+bw*.61,y+bh*.69);g.lineTo(x+bw*.52,y+bh);g.stroke();
        g.fillStyle=c.crack;g.fillRect(x+.12,y+bh-.35,.28,.19);g.fillStyle=c.roof;
        g.fillRect(x+bw-.05,y+bh+.06,.18,.12);g.fillRect(x-.14,y+bh*.4,.12,.17);
      }
    }
  }));
}
