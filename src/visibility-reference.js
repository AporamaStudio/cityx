// main 610d804的完整雾场对照路径；保留原采样、外围距离和敌人渐隐算法。
// 云雾与移动敌人共用区域场；只在控制、实时视野或雾带宽度变化时重建。
import {DEFAULTS} from './config.js?v=107';
export const VISIBILITY_PX=4;
// 包住同比增长的外围过渡及远雾；与郊野几何共用，不能让大地图的渐变被48格裁断。
export const exteriorFogExtent=size=>Math.max(48,Math.ceil(size*.8));
let cached=null;
const clamp=t=>Math.max(0,Math.min(1,t)),smooth=t=>t*t*(3-2*t);
const gentle=t=>t*t*t*(t*(t*6-15)+10);

// 中雾处保持同一斜率，两段接起来是一条连续曲线，不在分级点停顿。
export function cloudDensity(distance,s12,s23){
  const slope=1.5/(s12+s23);
  if(distance<=s12){const t=clamp(distance/s12);return .5*smooth(t)+slope*s12*t*t*(t-1);}
  const t=clamp((distance-s12)/s23);return .5+.5*smooth(t)+slope*s23*t*(t-1)*(t-1);
}

// 两次传播近似欧氏距离，保留真实格子权限，不把柔化边界当成额外视野。
function distances(flags,width,seed){
  const d=new Float32Array(flags.length),diagonal=Math.SQRT2;
  for(let i=0;i<d.length;i++)d[i]=seed(flags[i])?0:width*2;
  for(let y=0;y<width;y++)for(let x=0;x<width;x++){
    const i=y*width+x;
    if(x)d[i]=Math.min(d[i],d[i-1]+1);
    if(y)d[i]=Math.min(d[i],d[i-width]+1,x?d[i-width-1]+diagonal:Infinity,x+1<width?d[i-width+1]+diagonal:Infinity);
  }
  for(let y=width-1;y>=0;y--)for(let x=width-1;x>=0;x--){
    const i=y*width+x;
    if(x+1<width)d[i]=Math.min(d[i],d[i+1]+1);
    if(y+1<width)d[i]=Math.min(d[i],d[i+width]+1,x?d[i+width-1]+diagonal:Infinity,x+1<width?d[i+width+1]+diagonal:Infinity);
  }
  return d;
}

export function createVisibility(size,controlled,sight,s12,s23,fadeCells=DEFAULTS.enemyFogFadeCells,exterior=null){
  const cells=new Uint8Array(size*size);
  const exteriorKey=exterior?`${exterior.exteriorFogTransitionPercent}:${exterior.exteriorFogClearPercent}:${exterior.exteriorFogFarOpacity}`:'';
  let changed=!cached||cached.size!==size||cached.s12!==s12||cached.s23!==s23||cached.fadeCells!==fadeCells||cached.exteriorKey!==exteriorKey;
  for(let i=0;i<cells.length;i++){
    cells[i]=controlled.has(i)?0:sight.has(i)?1:2;
    if(!changed&&cells[i]!==cached.cells[i])changed=true;
  }
  if(!changed)return cached;
  const border=Math.max(exterior?exteriorFogExtent(size):8,s12+s23+2),span=size+border*2,n=span*VISIBILITY_PX,flags=new Uint8Array(n*n);
  for(let y=0;y<n;y++)for(let x=0;x<n;x++){
    const gx=Math.floor(x/VISIBILITY_PX-border),gy=Math.floor(y/VISIBILITY_PX-border);
    flags[y*n+x]=gx>=0&&gy>=0&&gx<size&&gy<size?cells[gy*size+gx]:2;
  }
  const controlDistance=distances(flags,n,value=>value===0),outside=distances(flags,n,value=>value<2),inside=distances(flags,n,value=>value===2);
  const cloud=new Float32Array(n*n),veil=new Float32Array(n*n);
  for(let i=0;i<flags.length;i++){
    if(flags[i]===0)continue;
    if(flags[i]===1){
      // S01在真实视野内由无雾渐入薄雾；远处敌源/医院的局部S1保持薄雾。
      veil[i]=.30*gentle(controlDistance[i]/(controlDistance[i]+inside[i]));continue;
    }
    const d=Math.max(0,(outside[i]-.5)/VISIBILITY_PX);
    // S12到中等雾、S23到浓雾；两段都没有实时敌情，远端始终不透明。
    cloud[i]=cloudDensity(d,s12,s23);
    veil[i]=.30+.70*cloud[i];
  }
  const at=(data,x,y)=>{
    const px=Math.max(0,Math.min(n-1,(x+border)*VISIBILITY_PX-.5)),py=Math.max(0,Math.min(n-1,(y+border)*VISIBILITY_PX-.5));
    const left=Math.floor(px),top=Math.floor(py),right=Math.min(n-1,left+1),bottom=Math.min(n-1,top+1),fx=px-left,fy=py-top;
    return (data[top*n+left]*(1-fx)+data[top*n+right]*fx)*(1-fy)+(data[bottom*n+left]*(1-fx)+data[bottom*n+right]*fx)*fy;
  };
  if(exterior){
    // 仅以已受控的边缘格延伸景物清晰度；医院/敌源的局部揭雾不能揭开外围森林。
    const edgeFlags=new Uint8Array(n*n);edgeFlags.fill(1);let edgeControlled=false;
    for(let y=0;y<size;y++)for(let x=0;x<size;x++)if((x===0||y===0||x===size-1||y===size-1)&&controlled.has(y*size+x)){
      edgeControlled=true;
      for(let py=0;py<VISIBILITY_PX;py++)for(let px=0;px<VISIBILITY_PX;px++)edgeFlags[((y+border)*VISIBILITY_PX+py)*n+(x+border)*VISIBILITY_PX+px]=0;
    }
    const edgeDistance=edgeControlled?distances(edgeFlags,n,value=>value===0):null;
    // 只采样内侧边缘、只改写外围；城内权限和浓雾数组保持原样。
    for(let y=0;y<n;y++)for(let x=0;x<n;x++){
      const wx=(x+.5)/VISIBILITY_PX-border,wy=(y+.5)/VISIBILITY_PX-border;
      const d=Math.hypot(Math.max(0,-wx,wx-size),Math.max(0,-wy,wy-size));if(!d)continue;
      const bx=Math.max(.125,Math.min(size-.125,wx)),by=Math.max(.125,Math.min(size-.125,wy)),i=y*n+x;
      const result=exteriorFogDensity(size,d,edgeDistance?Math.max(0,edgeDistance[i]/VISIBILITY_PX-.125):Infinity,at(cloud,bx,by),at(veil,bx,by),s12,s23,exterior,border);
      cloud[i]=result.cloud;veil[i]=result.veil;
    }
  }
  const cellAt=(x,y)=>x>=0&&y>=0&&x<size&&y<size?cells[Math.floor(y)*size+Math.floor(x)]:2;
  cached={size,s12,s23,fadeCells,exteriorKey,border,span,n,cells,flags,cloud,veil,
    fogAt(x,y){return {cloud:at(cloud,x,y),veil:at(veil,x,y)};},
    levelAt(x,y){const cell=cellAt(x,y);return cell<2?cell:at(outside,x,y)/VISIBILITY_PX<s12+s23?2:3;},
    // 仅在可见侧渐隐，越界立即隐藏；0关闭渐隐，数字和身体共享透明度。
    enemyAlpha(x,y){
      const cell=cellAt(x,y);if(cell===0)return 1;if(cell!==1)return 0;if(!fadeCells)return 1;
      const depth=Math.max(0,(at(inside,x,y)-.5)/VISIBILITY_PX),clear=Math.max(0,(at(controlDistance,x,y)-.5)/VISIBILITY_PX);
      // 很窄的S1也应在进入控制区前恢复清晰，避免在S0边界突然变亮。
      return smooth(clamp(depth/Math.max(.001,Math.min(fadeCells,depth+clear))));
    },
  };
  return cached;
}

// 外围过渡是视觉延伸，越界敌人仍无权限；远端云纹隐入同色背景，不形成清晰环带。
export function exteriorFogDensity(size,d,controlledDistance,edgeCloud,edgeVeil,s12,s23,params,extent=exteriorFogExtent(size)){
  const length=size*params.exteriorFogTransitionPercent/100,clear=params.exteriorFogClearPercent/100;
  const base=cloudDensity(d,s12,s23);
  let cloud=edgeCloud+(1-edgeCloud)*base,veil=edgeVeil+(1-edgeVeil)*base;
  if(Number.isFinite(controlledDistance)){
    // 沿边缘也柔和收窄，保持内外采样连续；不叠一段先变浓、再变清的接缝雾。
    const lateral=Math.sqrt(Math.max(0,controlledDistance**2-d**2)),weight=1-gentle(clamp(lateral/length));
    const reach=Math.sqrt(Math.max(.001,length**2-lateral**2)),t=clamp(d/reach),c=gentle(clamp((t-clear)/(1-clear)));
    const v=.3*gentle(clamp(t/(clear+(1-clear)*.55)))+.7*c;
    cloud+=(edgeCloud+(1-edgeCloud)*c-cloud)*weight;veil+=(edgeVeil+(1-edgeVeil)*v-veil)*weight;
  }
  // 两层叠加后达到指定总遮蔽强度；未知边缘处仍与城内的不透明浓雾无缝相接。
  const strength=1-Math.sqrt(1-params.exteriorFogFarOpacity/100),scale=1+(strength-1)*gentle(clamp(d/length));
  cloud*=scale;veil*=scale;
  const horizon=gentle(clamp((d-extent*.6)/(extent*.4))),total=cloud+veil*(1-cloud);
  cloud*=1-horizon;veil=(total+(1-total)*horizon-cloud)/(1-cloud||1);
  return {cloud,veil};
}

// 切换实验路径时释放完整距离场，避免后台保留大图峰值数组。
export function resetReferenceVisibility(){cached=null;}
