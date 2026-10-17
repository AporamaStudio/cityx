// 云雾与移动敌人共用区域场；只在控制、实时视野或雾带宽度变化时重建。
import {DEFAULTS} from './config.js?v=87';
export const VISIBILITY_PX=4;
// 包住同比增长的外围过渡及远雾；与郊野几何共用，不能让大地图的渐变被48格裁断。
export const exteriorFogExtent=size=>Math.max(48,Math.ceil(size*.8));
let cached=null,exteriorRasterCache=null;
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

// 边缘控制格的最近像素一维表，外围可直接求同一八邻域距离，不分配整片郊野距离场。
function edgeDistanceSampler(size,controlled){
  const length=size*VISIBILITY_PX,sides=[];
  for(let side=0;side<4;side++){
    const nearest=new Int32Array(length);nearest.fill(-1);let any=false;
    for(let i=0;i<size;i++){
      const x=side===0?0:side===1?size-1:i,y=side===2?0:side===3?size-1:i;
      if(controlled.has(y*size+x))for(let p=0;p<VISIBILITY_PX;p++){nearest[i*VISIBILITY_PX+p]=i*VISIBILITY_PX+p;any=true;}
    }
    if(!any)continue;
    let last=-1;for(let i=0;i<length;i++){if(nearest[i]===i)last=i;else nearest[i]=last;}
    last=-1;for(let i=length-1;i>=0;i--){if(nearest[i]===i)last=i;else if(last>=0&&(nearest[i]<0||last-i<i-nearest[i]))nearest[i]=last;}
    sides.push({side,nearest});
  }
  return {bytes:sides.length*length*4,at(x,y){
    let distance=Infinity;
    for(const {side,nearest} of sides){
      const vertical=side<2,along=vertical?y:x,normal=(side===1||side===3)?length-VISIBILITY_PX:0;
      const a=nearest[Math.max(0,Math.min(length-1,along))],b=Math.max(normal,Math.min(normal+VISIBILITY_PX-1,vertical?x:y));
      const dx=Math.abs(x-(vertical?b:a)),dy=Math.abs(y-(vertical?a:b));distance=Math.min(distance,Math.max(dx,dy)+(Math.SQRT2-1)*Math.min(dx,dy));
    }
    return distance;
  }};
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
  const rasterBorder=Math.ceil(Math.max(8,s12+s23+2)),border=Math.max(exterior?exteriorFogExtent(size):8,rasterBorder),span=size+border*2,n=(size+rasterBorder*2)*VISIBILITY_PX,flags=new Uint8Array(n*n);flags.fill(2);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++)for(let py=0;py<VISIBILITY_PX;py++){
    const start=((y+rasterBorder)*VISIBILITY_PX+py)*n+(x+rasterBorder)*VISIBILITY_PX;flags.fill(cells[y*size+x],start,start+VISIBILITY_PX);
  }
  const controlDistance=distances(flags,n,value=>value===0),outside=distances(flags,n,value=>value<2),inside=distances(flags,n,value=>value===2),cloud=new Float32Array(n*n),veil=new Float32Array(n*n);
  for(let i=0;i<flags.length;i++){
    if(flags[i]===0)continue;
    if(flags[i]===1){veil[i]=.30*gentle(controlDistance[i]/(controlDistance[i]+inside[i]));continue;}
    cloud[i]=cloudDensity(Math.max(0,(outside[i]-.5)/VISIBILITY_PX),s12,s23);veil[i]=.30+.70*cloud[i];
  }
  const at=(data,x,y)=>{
    const px=Math.max(0,Math.min(n-1,(x+rasterBorder)*VISIBILITY_PX-.5)),py=Math.max(0,Math.min(n-1,(y+rasterBorder)*VISIBILITY_PX-.5));
    const left=Math.floor(px),top=Math.floor(py),right=Math.min(n-1,left+1),bottom=Math.min(n-1,top+1),fx=px-left,fy=py-top;
    return (data[top*n+left]*(1-fx)+data[top*n+right]*fx)*(1-fy)+(data[bottom*n+left]*(1-fx)+data[bottom*n+right]*fx)*fy;
  };
  const edges=exterior?edgeDistanceSampler(size,controlled):null;
  const exteriorParams=exterior?{exteriorFogTransitionPercent:exterior.exteriorFogTransitionPercent,exteriorFogClearPercent:exterior.exteriorFogClearPercent,exteriorFogFarOpacity:exterior.exteriorFogFarOpacity}:null;
  const exteriorPixel=(px,py)=>{
    const wx=(px+.5)/VISIBILITY_PX,wy=(py+.5)/VISIBILITY_PX,d=Math.hypot(Math.max(0,-wx,wx-size),Math.max(0,-wy,wy-size));
    const bx=Math.max(.125,Math.min(size-.125,wx)),by=Math.max(.125,Math.min(size-.125,wy));
    return exteriorFogDensity(size,d,Math.max(0,edges.at(px,py)/VISIBILITY_PX-.125),at(cloud,bx,by),at(veil,bx,by),s12,s23,exteriorParams,border);
  };
  if(exterior)for(let y=0;y<n;y++)for(let x=0;x<n;x++){
    const px=x-rasterBorder*VISIBILITY_PX,py=y-rasterBorder*VISIBILITY_PX;if(px>=0&&py>=0&&px<size*VISIBILITY_PX&&py<size*VISIBILITY_PX)continue;
    const density=exteriorPixel(px,py);cloud[y*n+x]=density.cloud;veil[y*n+x]=density.veil;
  }
  const pixel=(px,py)=>{
    const x=px+rasterBorder*VISIBILITY_PX,y=py+rasterBorder*VISIBILITY_PX;
    if(x>=0&&y>=0&&x<n&&y<n){const i=y*n+x;return {cloud:cloud[i],veil:veil[i],flag:flags[i]};}
    if(exterior){const density=exteriorPixel(px,py);return {...density,flag:2};}
    return {cloud:1,veil:1,flag:2};
  };
  const fogAt=(x,y)=>{
    if(x>=-rasterBorder+.125&&y>=-rasterBorder+.125&&x<=size+rasterBorder-.125&&y<=size+rasterBorder-.125)return {cloud:at(cloud,x,y),veil:at(veil,x,y)};
    const lo=-border*VISIBILITY_PX,hi=(size+border)*VISIBILITY_PX-1,px=Math.max(lo,Math.min(hi,x*VISIBILITY_PX-.5)),py=Math.max(lo,Math.min(hi,y*VISIBILITY_PX-.5)),left=Math.floor(px),top=Math.floor(py),fx=px-left,fy=py-top;
    const a=pixel(left,top),b=pixel(Math.min(hi,left+1),top),c=pixel(left,Math.min(hi,top+1)),d=pixel(Math.min(hi,left+1),Math.min(hi,top+1));
    return Object.fromEntries(['cloud','veil'].map(key=>[key,(a[key]*(1-fx)+b[key]*fx)*(1-fy)+(c[key]*(1-fx)+d[key]*fx)*fy]));
  };
  const cellAt=(x,y)=>x>=0&&y>=0&&x<size&&y<size?cells[Math.floor(y)*size+Math.floor(x)]:2;
  const edgeSamples=[];
  if(exterior)for(let i=0;i<size*VISIBILITY_PX;i++)for(const [x,y] of [[i,0],[i,size*VISIBILITY_PX-1],[0,i],[size*VISIBILITY_PX-1,i]]){const j=(y+rasterBorder*VISIBILITY_PX)*n+x+rasterBorder*VISIBILITY_PX;edgeSamples.push(flags[j],cloud[j],veil[j]);}
  const edgeKey=JSON.stringify([size,s12,s23,border,exteriorKey,edgeSamples]);
  if(!exteriorRasterCache||exteriorRasterCache.key!==edgeKey)exteriorRasterCache={key:edgeKey,tiles:new Map()};
  const tiles=exteriorRasterCache.tiles,privateTiles=new Map(),tilePx=64;
  const tileAt=(px,py)=>{
    const x=Math.floor(px/tilePx)*tilePx,y=Math.floor(py/tilePx)*tilePx,key=x+':'+y,cache=x<size*VISIBILITY_PX&&y<size*VISIBILITY_PX&&x+tilePx>0&&y+tilePx>0?privateTiles:tiles;let tile=cache.get(key);
    if(tile){cache.delete(key);cache.set(key,tile);return tile;}
    const clouds=new Float32Array(tilePx*tilePx),veils=new Float32Array(tilePx*tilePx),levels=new Uint8Array(tilePx*tilePx);
    for(let row=0;row<tilePx;row++)for(let col=0;col<tilePx;col++){const value=pixel(x+col,y+row),i=row*tilePx+col;clouds[i]=value.cloud;veils[i]=value.veil;levels[i]=value.flag;}
    tile={x,y,clouds,veils,levels};cache.set(key,tile);return tile;
  };
  cached={size,s12,s23,fadeCells,exteriorKey,border,span,n,rasterBorder,cells,flags,cloud,veil,arrayBytes:n*n*21+cells.byteLength+(edges?.bytes??0),fogAt,
    // 按需生成同精度窗口；城内连续行直接复制，远雾按原公式求值。
    raster(bounds){
      const width=Math.round((bounds.right-bounds.left)*VISIBILITY_PX),height=Math.round((bounds.bottom-bounds.top)*VISIBILITY_PX),clouds=new Float32Array(width*height),veils=new Float32Array(width*height),levels=new Uint8Array(width*height),left=Math.round(bounds.left*VISIBILITY_PX),top=Math.round(bounds.top*VISIBILITY_PX);
      for(let y=0;y<height;y++){
        const sx=left+rasterBorder*VISIBILITY_PX,sy=top+y+rasterBorder*VISIBILITY_PX;
        if(sx>=0&&sy>=0&&sx+width<=n&&sy<n){const start=sy*n+sx;clouds.set(cloud.subarray(start,start+width),y*width);veils.set(veil.subarray(start,start+width),y*width);levels.set(flags.subarray(start,start+width),y*width);continue;}
        for(let x=0;x<width;){
          const px=left+x,py=top+y,coreX=px+rasterBorder*VISIBILITY_PX;
          if(sy>=0&&sy<n&&coreX>=0&&coreX<n){const count=Math.min(width-x,n-coreX),start=sy*n+coreX;clouds.set(cloud.subarray(start,start+count),y*width+x);veils.set(veil.subarray(start,start+count),y*width+x);levels.set(flags.subarray(start,start+count),y*width+x);x+=count;continue;}
          const tile=tileAt(px,py),count=Math.min(width-x,tilePx-(px-tile.x)),start=(py-tile.y)*tilePx+px-tile.x;clouds.set(tile.clouds.subarray(start,start+count),y*width+x);veils.set(tile.veils.subarray(start,start+count),y*width+x);levels.set(tile.levels.subarray(start,start+count),y*width+x);x+=count;
        }
      }
      if(width*height<n*n/2)while(tiles.size>128)tiles.delete(tiles.keys().next().value);
      return {width,height,cloud:clouds,veil:veils,flags:levels};
    },
    get rasterCacheBytes(){return (tiles.size+privateTiles.size)*tilePx*tilePx*9;},
    clearRasterCache(){tiles.clear();privateTiles.clear();},
    levelAt(x,y){const cell=cellAt(x,y);return cell<2?cell:at(outside,x,y)/VISIBILITY_PX<s12+s23?2:3;},
    enemyAlpha(x,y){
      const cell=cellAt(x,y);if(cell===0)return 1;if(cell!==1)return 0;if(!fadeCells)return 1;
      const depth=Math.max(0,(at(inside,x,y)-.5)/VISIBILITY_PX),clear=Math.max(0,(at(controlDistance,x,y)-.5)/VISIBILITY_PX);
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
