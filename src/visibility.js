// 云雾与移动敌人共用区域场；只在控制、实时视野或雾带宽度变化时重建。
export const VISIBILITY_PX=4;
let cached=null;
const clamp=t=>Math.max(0,Math.min(1,t)),smooth=t=>t*t*(3-2*t);

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

export function createVisibility(size,controlled,sight,s12,s23){
  const cells=new Uint8Array(size*size);
  let changed=!cached||cached.size!==size||cached.s12!==s12||cached.s23!==s23;
  for(let i=0;i<cells.length;i++){
    cells[i]=controlled.has(i)?0:sight.has(i)?1:2;
    if(!changed&&cells[i]!==cached.cells[i])changed=true;
  }
  if(!changed)return cached;
  const border=Math.max(8,s12+s23+2),span=size+border*2,n=span*VISIBILITY_PX,flags=new Uint8Array(n*n);
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
      veil[i]=.30*smooth(controlDistance[i]/(controlDistance[i]+inside[i]));continue;
    }
    const d=outside[i]/VISIBILITY_PX;
    // S12到中等雾、S23到浓雾；两段都没有实时敌情，远端始终不透明。
    cloud[i]=d<=s12?.5*smooth(clamp(d/s12)):.5+.5*smooth(clamp((d-s12)/s23));
    veil[i]=.30+.70*cloud[i];
  }
  const at=(data,x,y)=>{
    const px=Math.max(0,Math.min(n-1,(x+border)*VISIBILITY_PX-.5)),py=Math.max(0,Math.min(n-1,(y+border)*VISIBILITY_PX-.5));
    const left=Math.floor(px),top=Math.floor(py),right=Math.min(n-1,left+1),bottom=Math.min(n-1,top+1),fx=px-left,fy=py-top;
    return (data[top*n+left]*(1-fx)+data[top*n+right]*fx)*(1-fy)+(data[bottom*n+left]*(1-fx)+data[bottom*n+right]*fx)*fy;
  };
  const cellAt=(x,y)=>x>=0&&y>=0&&x<size&&y<size?cells[Math.floor(y)*size+Math.floor(x)]:2;
  cached={size,s12,s23,border,span,n,cells,flags,cloud,veil,
    levelAt(x,y){const cell=cellAt(x,y);return cell<2?cell:at(outside,x,y)/VISIBILITY_PX<s12+s23?2:3;},
    // 仅在可见侧半格内淡入/淡出；用插值位置判断，数字和身体共享透明度。
    enemyAlpha(x,y){const cell=cellAt(x,y);return cell===0?1:cell===1?smooth(clamp((at(inside,x,y)-.5)/VISIBILITY_PX/.5)):0;},
  };
  return cached;
}
