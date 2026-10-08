// 轻量程序贴图：日/夜各生成一套并缓存，纹理只表达材质，不参与通行或受击规则。
const cache=new Map(),PX=32;
const palettes={
  day:{road:'#343e47',edge:'#a3aaa4',lane:'#b3aa87',yard:'#697b70',ruin:'#877f6b',roof:'#b0a084',crack:'#454b46',factory:'#739697',factoryRoof:'#a4c2b9',home:'#af775c',homeWall:'#dfc6a0',window:'#425d64',grass:'#738b67'},
  night:{road:'#182936',edge:'#677d88',lane:'#969881',yard:'#263e3e',ruin:'#3c464a',roof:'#646967',crack:'#202d35',factory:'#335c61',factoryRoof:'#568485',home:'#655051',homeWall:'#918679',window:'#ffdf92',grass:'#294e40'},
};
function texture(id,w,h,paint){
  if(!cache.has(id)){const c=document.createElement('canvas');c.width=w*PX;c.height=h*PX;const g=c.getContext('2d');g.scale(PX,PX);paint(g);cache.set(id,c);}
  return cache.get(id);
}
function layers(ctx,x,y,w,h,mix,get){
  ctx.drawImage(get('day'),x,y,w,h);
  if(mix>0){ctx.save();ctx.globalAlpha=mix;ctx.drawImage(get('night'),x,y,w,h);ctx.restore();}
}
// 按实际横断面计算中心；宽路的中线位于整条道路中央，不按每个格子分别居中。
const roadGeometry=new WeakMap();
const surroundings=new WeakMap(),SURROUNDING_BORDER=8;

// 外围只是固定景物：接续边缘道路，楼群不带格线、灯光、收益或交互数据。
export function drawCitySurroundings(ctx,layout,mix,explored,backdrop){
  const {width:w,height:h}=layout,b=SURROUNDING_BORDER;
  if(!surroundings.has(layout)){
    const outside=(x,y)=>x<0||y<0||x>=w||y>=h;
    const projected=(x,y)=>Math.max(1,Math.min(h-2,y))*w+Math.max(1,Math.min(w-2,x));
    const road=(x,y)=>{
      if(!outside(x,y))return layout.tiles[y*w+x]==='road';
      if(x>=0&&x<w)return layout.tiles[projected(x,y)]==='road';
      if(y>=0&&y<h)return layout.tiles[projected(x,y)]==='road';
      return ((x%6+6)%6===0)||((y%6+6)%6===0);
    };
    const seed=(x,y)=>((Math.imul(x+101,73856093)^Math.imul(y+103,19349663))>>>0);
    const images=['day','night'].map(time=>{
      const c=document.createElement('canvas');c.width=(w+b*2)*16;c.height=(h+b*2)*16;
      const g=c.getContext('2d'),p=palettes[time],night=time==='night',marks=roadMarkings(layout);
      g.scale(16,16);g.translate(b,b);
      for(let y=-b;y<h+b;y++)for(let x=-b;x<w+b;x++)if(outside(x,y)){
        g.fillStyle=road(x,y)?p.road:night?'#2b3b43':'#586964';g.fillRect(x,y,1,1);
        if(road(x,y)){
          const mark=marks.get(projected(x,y)),vertical=(y<0||y>=h)&&x>=0&&x<w;
          const horizontal=(x<0||x>=w)&&y>=0&&y<h;
          const center=mark?.center??.5;
          g.fillStyle=night?'#586668':'#858577';
          if(vertical&&mark?.axis==='v'&&center>=0&&center<=1)g.fillRect(x+center-.035,y+.2,.07,.6);
          if(horizontal&&mark?.axis==='h'&&center>=0&&center<=1)g.fillRect(x+.2,y+center-.035,.6,.07);
        }else if(seed(x,y)%7===0){
          g.fillStyle=night?'#263f3b':'#49685c';g.beginPath();g.arc(x+.5,y+.5,.27,0,Math.PI*2);g.fill();
        }
      }
      for(let y=-b;y<h+b;y+=3)for(let x=-b;x<w+b;x+=3){
        const n=seed(x,y),bw=2+n%2,bh=2+(n>>>3)%2;
        if(x+bw>w+b||y+bh>h+b)continue;
        let clear=true;
        for(let dy=0;dy<bh;dy++)for(let dx=0;dx<bw;dx++)if(!outside(x+dx,y+dy)||road(x+dx,y+dy))clear=false;
        if(!clear)continue;
        g.fillStyle='#101c2466';g.fillRect(x+.28,y+.35,bw-.3,bh-.3);
        g.fillStyle=night?'#485158':'#808780';g.fillRect(x+.18,y+.18,bw-.4,bh-.4);
        g.strokeStyle=night?'#626a6a':'#a2a699';g.lineWidth=.06;g.strokeRect(x+.25,y+.25,bw-.54,bh-.54);
        g.fillStyle=night?'#303d44':'#536563';g.fillRect(x+.45,y+.45,.38,.3);
        if(n%3===0){g.beginPath();g.moveTo(x+.8,y+.25);g.lineTo(x+1.1,y+bh*.5);g.lineTo(x+.8,y+bh-.25);g.stroke();}
      }
      // 远景渐隐到雾底色；最后一圈完全融入背景，避免产生新的矩形边缘。
      const fog=night?'rgb(20,33,47)':'rgb(32,48,57)';
      for(let y=-b;y<h+b;y++)for(let x=-b;x<w+b;x++)if(outside(x,y)){
        const d=Math.max(-x-.5,x+.5-w,-y-.5,y+.5-h),t=Math.min(1,(d+.5)/b);
        g.globalAlpha=t*t*(3-2*t);g.fillStyle=fog;g.fillRect(x,y,1.01,1.01);
      }
      g.globalAlpha=1;return c;
    });
    surroundings.set(layout,images);
  }
  const [day,night]=surroundings.get(layout);
  ctx.drawImage(day,-b,-b,w+b*2,h+b*2);
  if(mix>0){ctx.save();ctx.globalAlpha=mix;ctx.drawImage(night,-b,-b,w+b*2,h+b*2);ctx.restore();}
  // 未探索边界向外续雾，已探索边缘保留景物；不透露地图内的未知建筑。
  if(explored){
    ctx.save();ctx.fillStyle=backdrop;
    for(let depth=0;depth<b;depth++){
      for(let x=0;x<w;x++){
        if(!explored.has(x))ctx.fillRect(x,-depth-1,1.01,1.01);
        if(!explored.has((h-1)*w+x))ctx.fillRect(x,h+depth,1.01,1.01);
      }
      for(let y=0;y<h;y++){
        if(!explored.has(y*w))ctx.fillRect(-depth-1,y,1.01,1.01);
        if(!explored.has(y*w+w-1))ctx.fillRect(w+depth,y,1.01,1.01);
      }
    }
    for(const [x,y,id] of [[-b,-b,0],[w,-b,w-1],[-b,h,(h-1)*w],[w,h,h*w-1]]){
      if(!explored.has(id))ctx.fillRect(x,y,b,b);
    }
    ctx.restore();
  }
  // 微弱的断续边标只表达行动范围，不描绘一圈实体墙。
  ctx.save();ctx.strokeStyle=mix>.5?'#8ba7b52b':'#b8c7bc40';ctx.lineWidth=.035;ctx.setLineDash([.25,.65]);
  ctx.strokeRect(0,0,w,h);ctx.restore();
}

export function roadMarkings(layout){
  if(roadGeometry.has(layout))return roadGeometry.get(layout);
  const {width:w,height:h,tiles}=layout,marks=new Map();
  const road=(x,y)=>x>=0&&y>=0&&x<w&&y<h&&tiles[y*w+x]==='road';
  const span=(x,y,dx,dy)=>{let lo=0,hi=0;while(road(x+(lo-1)*dx,y+(lo-1)*dy))lo--;while(road(x+(hi+1)*dx,y+(hi+1)*dy))hi++;return {lo,hi,size:hi-lo+1};};
  for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(road(x,y)){
    const across=span(x,y,1,0),along=span(x,y,0,1);
    const vertical=across.size<=3&&along.size>3,horizontal=along.size<=3&&across.size>3;
    const section=vertical?across:horizontal?along:null;
    let crossing=0;
    if(section)for(const sign of [-1,1]){
      const nx=x+(horizontal?sign:0),ny=y+(vertical?sign:0);
      if(road(nx,ny)&&span(nx,ny,vertical?1:0,vertical?0:1).size>section.size+1)crossing=sign;
    }
    marks.set(y*w+x,{mask:(road(x,y-1)?1:0)|(road(x+1,y)?2:0)|(road(x,y+1)?4:0)|(road(x-1,y)?8:0),axis:vertical?'v':horizontal?'h':'',center:section?(section.lo+section.hi+1)/2:0,width:section?.size??0,crossing});
  }
  roadGeometry.set(layout,marks);return marks;
}
// 沥青、连续浅色路缘、路口斑马线形成道路语言；交叉口内部不硬画中线。
export function drawRoadTexture(ctx,layout,x,y,mix){
  const {mask,axis,center,width,crossing}=roadMarkings(layout).get(y*layout.width+x);
  layers(ctx,x,y,1,1,mix,time=>texture(`road:${mask}:${axis}:${center}:${width}:${crossing}:${time}`,1,1,g=>{
    const p=palettes[time];g.fillStyle=p.road;g.fillRect(0,0,1,1);
    g.fillStyle=time==='day'?'#ffffff09':'#a9ccff08';
    for(let i=0;i<10;i++)g.fillRect((i*17%29)/32,(i*11%31)/32,.025,.025);
    g.fillStyle=p.edge;
    if(!(mask&1))g.fillRect(0,0,1,.08);if(!(mask&4))g.fillRect(0,.92,1,.08);
    if(!(mask&8))g.fillRect(0,0,.08,1);if(!(mask&2))g.fillRect(.92,0,.08,1);
    if(!axis)return;
    const stripe=(cross,long,cw,len)=>axis==='v'?g.fillRect(cross,long,cw,len):g.fillRect(long,cross,len,cw);
    if(crossing){
      g.fillStyle=time==='day'?'#aab5b4':'#7b929c';
      for(let i=.19;i<.85;i+=.22)stripe(i,crossing<0?.17:.58,.12,.25);
    }else{
      g.fillStyle=p.lane;
      if(width===1)stripe(center-.045,.18,.09,.64);
      else for(const offset of [-.09,.09])stripe(center+offset-.03,0,.06,1);
    }
  }));
}
export function drawBlockTexture(ctx,p,kind,mix){
  const w=p.width??p.size,h=p.height??p.size,variant=(p.x*7+p.y*13)%4;
  layers(ctx,p.x+.1,p.y+.1,w-.2,h-.2,mix,time=>texture(`block:${kind}:${w}:${h}:${variant}:${time}`,w,h,g=>{
    const c=palettes[time],night=time==='night',ruin=kind.endsWith('ruin'),homeRuin=kind==='housing-ruin';
    g.fillStyle=ruin?(homeRuin?(night?'#514948':'#927d6b'):c.ruin):c.yard;g.fillRect(0,0,w,h);
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
        g.fillStyle=homeRuin?(night?'#82706a':'#bc9076'):c.roof;g.beginPath();g.moveTo(x,y);g.lineTo(x+bw*.56,y);g.lineTo(x+bw*.48,y+bh*.27);g.lineTo(x+bw*.77,y+bh*.19);g.lineTo(x+bw,y+.12);g.lineTo(x+bw,y+bh);g.lineTo(x,y+bh);g.closePath();g.fill();
        // 原用途保留轮廓：住宅废墟有折顶和暗窗，生产废墟保留厂房屋面条纹。
        g.strokeStyle=homeRuin?(night?'#a08b78':'#e0b690'):(night?'#8a9391':'#c9c4ad');g.lineWidth=.07;
        g.beginPath();
        if(homeRuin){g.moveTo(x,y+.3);g.lineTo(x+bw*.5,y+.06);g.lineTo(x+bw,y+.3);}
        else for(let sx=.2;sx<bw-.1;sx+=.3){g.moveTo(x+sx,y+.1);g.lineTo(x+sx,y+bh-.1);}
        g.stroke();
        g.strokeStyle=c.crack;g.lineWidth=.08;g.beginPath();g.moveTo(x+bw*.48,y+bh*.27);g.lineTo(x+bw*.36,y+bh*.53);g.lineTo(x+bw*.61,y+bh*.69);g.lineTo(x+bw*.52,y+bh);g.stroke();
        g.fillStyle=c.crack;g.fillRect(x+.12,y+bh-.35,.28,.19);g.fillStyle=c.roof;
        g.fillRect(x+bw-.05,y+bh+.06,.18,.12);g.fillRect(x-.14,y+bh*.4,.12,.17);
      }
    }
  }));
}
