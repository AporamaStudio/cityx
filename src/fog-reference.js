// main 610d804的完整云雾遮罩与退雾流程；云纹生成与优化路径共用原算法。
import {VISIBILITY_PX} from './visibility-reference.js?v=1';
import {fogColor,cloudStrength,drawCloudBackdrop} from './fog.js?v=25';
const MASK_PX=VISIBILITY_PX,smooth=t=>t*t*(3-2*t);
let field=null;
function surface(width,height=width){const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;return canvas;}
// 共用逻辑区域场；只有区域或新局变化时更新遮罩，云纹流动不改权限。
function updateField(visibility,explored,time){
  if(field?.visibility===visibility&&field.explored===explored)return;
  const {size,span,n,border,flags,cloud:target,veil:veilTarget}=visibility;
  const previous=field&&field.size===size&&field.n===n&&field.explored===explored?field:null;
  const mask=previous?.mask??surface(n),layer=previous?.layer??surface(n),veil=previous?.veil??surface(n);
  const from=previous?new Float32Array(previous.current):new Float32Array(target);
  const veilFrom=previous?new Float32Array(previous.veilCurrent):new Float32Array(veilTarget);
  // S0/S1立即保持清晰可读；外围退雾短暂过渡，失去视野立即增强遮挡。
  for(let i=0;i<target.length;i++){
    from[i]=flags[i]<2?target[i]:Math.max(from[i],target[i]);
    veilFrom[i]=flags[i]<2?veilTarget[i]:Math.max(veilFrom[i],veilTarget[i]);
  }
  field={visibility,size,span,n,border,explored,veil,veilTarget,veilFrom,veilCurrent:new Float32Array(veilFrom),target,from,current:new Float32Array(from),mask,layer,at:time,until:previous&&time?time+.36:0,painted:false};
}
export const fogTransitionActive=()=>!!field?.until;

export function drawFog(ctx,visibility,explored,night,time,cloudTime=time,dusk=0,zoom=2){
  updateField(visibility,explored,time);
  const f=field,t=f.until&&time?Math.min(1,(time-f.at)/.36):1,strength=cloudStrength(zoom);
  if(!f.painted||f.until||f.strength!==strength){
    const g=f.mask.getContext('2d'),pixels=g.createImageData(f.n,f.n),vg=f.veil.getContext('2d'),veilPixels=vg.createImageData(f.n,f.n),ease=smooth(Math.max(0,t));
    for(let i=0;i<f.target.length;i++){
      const alpha=f.from[i]+(f.target[i]-f.from[i])*ease;f.current[i]=alpha;
      // 外围强度已由同一世界区域场计算，不能在地图边界再次衰减成一圈晴空。
      const x=(i%f.n+.5)/MASK_PX-f.border,y=(Math.floor(i/f.n)+.5)/MASK_PX-f.border,outside=x<0||y<0||x>=f.size||y>=f.size;
      pixels.data[i*4+3]=Math.round(alpha*(outside?1:strength+(1-strength)*alpha)*255);
      const density=f.veilFrom[i]+(f.veilTarget[i]-f.veilFrom[i])*ease;f.veilCurrent[i]=density;
      veilPixels.data[i*4+3]=Math.round(density*255);
    }
    g.putImageData(pixels,0,0);vg.putImageData(veilPixels,0,0);f.color=null;f.strength=strength;f.painted=true;if(t===1)f.until=0;
  }
  const color=fogColor(night);
  if(f.color!==color){const vg=f.veil.getContext('2d');vg.globalCompositeOperation='source-in';vg.fillStyle=color;vg.fillRect(0,0,f.n,f.n);vg.globalCompositeOperation='source-over';f.color=color;}
  const g=f.layer.getContext('2d');g.setTransform(MASK_PX,0,0,MASK_PX,f.border*MASK_PX,f.border*MASK_PX);
  g.clearRect(-f.border,-f.border,f.span,f.span);
  drawCloudBackdrop(g,night,cloudTime,{left:-f.border,top:-f.border,right:f.size+f.border,bottom:f.size+f.border},dusk);
  g.setTransform(1,0,0,1,0,0);g.globalCompositeOperation='destination-in';g.drawImage(f.mask,0,0);g.globalCompositeOperation='source-over';
  ctx.save();ctx.imageSmoothingEnabled=true;
  // S0清晰、S1薄雾静止、S12/S23渐入流动浓雾；全城仍保护未知地形。
  ctx.drawImage(f.veil,-f.border,-f.border,f.span,f.span);
  ctx.drawImage(f.layer,-f.border,-f.border,f.span,f.span);ctx.restore();
}

export function resetReferenceFog(){if(field)for(const canvas of [field.mask,field.layer,field.veil])canvas.width=canvas.height=1;field=null;}
