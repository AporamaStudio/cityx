// 控制线是精确界线；色带仅表达内外方向，不读取或修改建设/视野权限。
const PX=16,LAYERS=16;
let cached=null;
const color=(day,night,mix)=>`rgb(${day.map((v,i)=>Math.round(v+(night[i]-v)*mix)).join(',')})`;
const bandColor=mix=>color([82,160,197],[103,186,221],mix);

// 分层描边形成渐隐，分别裁到内/外侧；只在生成缓存或小图例时绘制。
function paintBands(ctx,boundary,inside,bounds,params,mix){
  const outside=new Path2D();outside.rect(bounds.left,bounds.top,bounds.width,bounds.height);outside.addPath(inside);
  for(const [path,rule,spread,opacity,power] of [
    [inside,'nonzero',params.controlBorderInnerCells,params.controlBorderInnerOpacity/100,1],
    [outside,'evenodd',params.controlBorderOuterCells,params.controlBorderOuterOpacity/100,2]
  ]){
    if(spread<=0||opacity<=0)continue;
    ctx.save();ctx.clip(path,rule);ctx.lineCap='round';ctx.lineJoin='round';ctx.setLineDash([]);ctx.strokeStyle=bandColor(mix);
    for(let i=LAYERS;i>=1;i--){
      const weight=(1-(i-1)/LAYERS)**power-(1-i/LAYERS)**power;
      ctx.globalAlpha=1-(1-opacity)**weight;ctx.lineWidth=2*spread*i/LAYERS;ctx.stroke(boundary);
    }
    ctx.restore();
  }
}

// 控制范围/色带参数变化才重建紧贴领地的离屏图；镜头与昼夜变化复用两套颜色。
export function controlBorderTexture(size,controlled,boundary,inside,params){
  const cells=[...controlled].sort((a,b)=>a-b);
  const signature=[size,params.controlBorderInnerCells,params.controlBorderOuterCells,params.controlBorderInnerOpacity,params.controlBorderOuterOpacity,cells.join(',')].join(':');
  if(cached?.signature===signature)return cached;
  if(!cells.length)return cached={signature,day:null,night:null};
  const xs=cells.map(id=>id%size),ys=cells.map(id=>Math.floor(id/size));
  const pad=Math.ceil(Math.max(params.controlBorderInnerCells,params.controlBorderOuterCells))+1;
  const left=Math.min(...xs)-pad,top=Math.min(...ys)-pad,width=Math.max(...xs)+1+pad-left,height=Math.max(...ys)+1+pad-top;
  const make=mix=>{
    const canvas=document.createElement('canvas');canvas.width=width*PX;canvas.height=height*PX;
    const ctx=canvas.getContext('2d');ctx.setTransform(PX,0,0,PX,-left*PX,-top*PX);
    paintBands(ctx,boundary,inside,{left,top,width,height},params,mix);return canvas;
  };
  return cached={signature,left,top,width,height,day:make(0),night:make(1)};
}

export function drawControlBorderBands(ctx,texture,mix){
  if(!texture.day)return;
  const {left,top,width,height}=texture;ctx.save();
  if(mix<1){ctx.globalAlpha=1-mix;ctx.drawImage(texture.day,left,top,width,height);}
  if(mix>0){ctx.globalAlpha=mix;ctx.drawImage(texture.night,left,top,width,height);}
  ctx.restore();
}

// 主线始终保持屏幕像素宽度，昼夜只调整色彩，不改变真实边界或外溢距离。
export function drawControlBorderLine(ctx,boundary,cellPx,params,mix){
  ctx.save();ctx.setLineDash([]);ctx.lineCap='round';ctx.lineJoin='round';
  ctx.strokeStyle='#172d3ee6';ctx.lineWidth=(params.controlBorderLinePx+2)/cellPx;ctx.stroke(boundary);
  ctx.strokeStyle=color([78,170,211],[132,210,241],mix);ctx.lineWidth=params.controlBorderLinePx/cellPx;ctx.stroke(boundary);ctx.restore();
}

// 手册/ⓘ复用同一画法；小示意图也保留“明显色带在内侧”的方向信息。
export function drawControlBorderLegend(canvas,params,mix){
  const ctx=canvas.getContext('2d');ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,canvas.width,canvas.height);
  ctx.setTransform(canvas.width/3.5,0,0,canvas.height/2.75,0,0);
  const boundary=new Path2D();boundary.moveTo(.5,2.3);boundary.lineTo(.5,.9);boundary.lineTo(1.4,.9);boundary.lineTo(1.4,.5);boundary.lineTo(3,.5);boundary.lineTo(3,2.3);
  const inside=new Path2D(boundary);inside.closePath();
  paintBands(ctx,boundary,inside,{left:0,top:0,width:3.5,height:2.75},params,mix);
  drawControlBorderLine(ctx,boundary,canvas.width/3.5,{...params,controlBorderLinePx:params.controlBorderLinePx*2},mix);
}
