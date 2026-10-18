// 信息层由探索/视野决定；云纹只改变外观，流动与缩放不能揭示新情报。
import {VISIBILITY_PX} from './visibility.js?v=10';
const CLOUD_SPAN=48,TEXTURE_PX=512,MASK_PX=VISIBILITY_PX;
let textures=null,field=null;
const smooth=t=>t*t*(3-2*t);
const blend=(a,b,t)=>a.map((v,i)=>Math.round(v+(b[i]-v)*t));

// 全图、地图外远景和昼夜过渡共用底色，避免出现一圈矩形接缝。
export const fogColor=night=>`rgb(${blend([198,210,212],[52,68,93],night).join(',')})`;
// 全城只减弱过渡带的云纹，远处浓云始终完整，不因缩放透出整座城市。
export const cloudStrength=zoom=>.68+.32*smooth(Math.max(0,Math.min(1,(zoom-1)/2)));

// 保持每格4像素，只裁掉当前镜头及高楼/阴影余量之外不会采样的雾纹。
export function fogRasterBounds(visibility,viewport,padding=16){
  const min=-visibility.border,max=visibility.size+visibility.border;
  if(viewport.left<=0&&viewport.right>=visibility.size&&viewport.top<=0&&viewport.bottom>=visibility.size)return {left:min,top:min,right:max,bottom:max};
  const left=Math.max(min,Math.min(max-1,Math.floor((viewport.left-padding)/16)*16)),top=Math.max(min,Math.min(max-1,Math.floor((viewport.top-padding)/16)*16));
  return {left,top,right:Math.max(left+1,Math.min(max,Math.ceil((viewport.right+padding)/16)*16)),bottom:Math.max(top+1,Math.min(max,Math.ceil((viewport.bottom+padding)/16)*16))};
}

function surface(width,height=width){
  const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;return canvas;
}
// 周期噪声生成一次；云团固定在城市坐标中，平移和缩放不重新随机。
function noise(x,y,period){
  const ix=Math.floor(x),iy=Math.floor(y),fx=smooth(x-ix),fy=smooth(y-iy);
  const value=(a,b)=>{
    const h=Math.imul((a+period)%period+1,374761393)^Math.imul((b+period)%period+1,668265263);
    return ((Math.imul(h^(h>>>13),1274126177)^(h>>>16))>>>0)/4294967295;
  };
  const a=value(ix,iy),b=value(ix+1,iy),c=value(ix,iy+1),d=value(ix+1,iy+1);
  return a+(b-a)*fx+(c-a+(a-b-c+d)*fx)*fy;
}
function cloudTextures(){
  if(textures)return textures;
  const n=TEXTURE_PX,heights=new Float32Array(n*n);
  for(let y=0;y<n;y++)for(let x=0;x<n;x++){
    let h=0;
    for(const [period,weight] of [[4,.62],[8,.27],[16,.09],[32,.02]])h+=noise(x/n*period,y/n*period,period)*weight;
    heights[y*n+x]=h;
  }
  textures=[[161,181,195,225,231,224],[38,54,76,89,109,138]].map(colors=>{
    const canvas=surface(n),g=canvas.getContext('2d'),pixels=g.createImageData(n,n);
    for(let y=0;y<n;y++)for(let x=0;x<n;x++){
      const i=y*n+x,h=heights[i];
      // 宽亮面和柔和侧阴影暗示云团厚度，不堆细碎纹理或逐格明暗。
      const slope=heights[y*n+(x+n-1)%n]-heights[y*n+(x+1)%n]+heights[((y+n-1)%n)*n+x]-heights[((y+1)%n)*n+x];
      const light=Math.max(0,Math.min(1,.08+h*.76+slope*30));
      for(let c=0;c<3;c++)pixels.data[i*4+c]=colors[c]+(colors[c+3]-colors[c])*light;
      pixels.data[i*4+3]=Math.round(255*(.18+.82*smooth(Math.max(0,Math.min(1,(h-.2)/.6)))));
    }
    g.putImageData(pixels,0,0);
    // 少量相互重叠的宽云瓣叠出云团轮廓，保持阴影简洁；跨边界复制保证纹理循环。
    const night=colors[0]<100;
    for(let row=0;row<3;row++)for(let col=0;col<3;col++){
      const seed=noise(col+.37,row+.61,4),cx=(col+.35+seed*.5)*n/3,cy=(row+.3+noise(row+.23,col+.73,4)*.55)*n/3;
      for(let lobe=0;lobe<3;lobe++){
        const angle=lobe*Math.PI*2/3+seed*3,r=n*(.10+noise(col+lobe*.31,row+.44,4)*.055);
        const px=cx+Math.cos(angle)*r*.45,py=cy+Math.sin(angle)*r*.35;
        for(const ox of [-n,0,n])for(const oy of [-n,0,n]){
          const x=px+ox,y=py+oy;if(x+r<0||y+r<0||x-r>n||y-r>n)continue;
          const glow=g.createRadialGradient(x-r*.2,y-r*.22,0,x,y,r);
          glow.addColorStop(0,night?'rgba(109,129,164,.32)':'rgba(230,233,224,.52)');
          glow.addColorStop(.30,night?'rgba(102,123,157,.28)':'rgba(230,233,224,.44)');
          glow.addColorStop(.68,night?'rgba(93,112,141,.16)':'rgba(225,231,226,.22)');
          glow.addColorStop(1,night?'rgba(93,112,141,0)':'rgba(225,231,226,0)');
          g.fillStyle=glow;g.fillRect(x-r,y-r,r*2,r*2);
        }
      }
    }
    return canvas;
  });
  return textures;
}
function tileClouds(ctx,image,bounds,dx,dy){
  // 连续重复填充不会在昼夜半透明混合时叠出深色拼接线。
  const scale=CLOUD_SPAN/TEXTURE_PX;
  ctx.save();ctx.translate(dx,dy);ctx.scale(scale,scale);ctx.fillStyle=ctx.createPattern(image,'repeat');
  ctx.fillRect((bounds.left-dx)/scale,(bounds.top-dy)/scale,(bounds.right-bounds.left)/scale,(bounds.bottom-bounds.top)/scale);ctx.restore();
}
// 两层云以不同方向流动；起点视角几秒即可察觉位移，遮罩仍固定，不改变敌人显隐。
export function drawCloudBackdrop(ctx,night,time,bounds,dusk=0,ambient=false){
  const [day,dark]=cloudTextures();ctx.save();ctx.imageSmoothingEnabled=true;
  ctx.beginPath();ctx.rect(bounds.left,bounds.top,bounds.right-bounds.left,bounds.bottom-bounds.top);ctx.clip();
  // 远景有底色，环境层留出透景间隙；信息保护由下方的低细节地形负责。
  if(!ambient){ctx.fillStyle=fogColor(night);ctx.fillRect(bounds.left,bounds.top,bounds.right-bounds.left,bounds.bottom-bounds.top);}
  ctx.globalAlpha=1-night;
  tileClouds(ctx,day,bounds,time*.34,time*.10);
  if(night>0){ctx.globalAlpha=night;tileClouds(ctx,dark,bounds,time*.34,time*.10);}
  ctx.globalAlpha=.18*(1-night);tileClouds(ctx,day,bounds,12-time*.16,19+time*.055);
  if(night>0){ctx.globalAlpha=.18*night;tileClouds(ctx,dark,bounds,12-time*.16,19+time*.055);}
  // 暮色只染云层，不压暗路线、敌人和数值；日出沿同一进度反向褪去。
  if(dusk>0){ctx.globalAlpha=dusk*.08;ctx.fillStyle='#d6ab78';ctx.fillRect(bounds.left,bounds.top,bounds.right-bounds.left,bounds.bottom-bounds.top);}
  ctx.restore();
}
// 共用逻辑区域场；只有区域或新局变化时更新遮罩，云纹流动不改权限。
function updateField(visibility,explored,time,area){
  const key=[area.left,area.top,area.right,area.bottom].join(':');
  if(field?.visibility===visibility&&field.explored===explored&&field.areaKey===key)return;
  const {size}=visibility,previous=field&&field.size===size&&field.explored===explored?field:null,changed=previous?.visibility!==visibility;
  const raster=visibility.raster(area),{width,height,flags,cloud:target,veil:veilTarget}=raster;
  const mask=previous?.mask??surface(width,height),layer=previous?.layer??surface(width,height),veil=previous?.veil??surface(width,height);
  for(const canvas of [mask,layer,veil]){if(canvas.width!==width)canvas.width=width;if(canvas.height!==height)canvas.height=height;}
  const until=changed?(previous&&time?time+.36:0):previous.until,from=until?new Float32Array(target):target,veilFrom=until?new Float32Array(veilTarget):veilTarget,sourceVisibility=changed?previous?.visibility:previous?.fromVisibility;
  for(let i=0;previous&&until&&i<target.length;i++){
    if(flags[i]<2)continue;
    const x=area.left+(i%width+.5)/MASK_PX,y=area.top+(Math.floor(i/width)+.5)/MASK_PX,px=Math.floor((x-previous.area.left)*MASK_PX),py=Math.floor((y-previous.area.top)*MASK_PX);
    let old;
    if(px>=0&&py>=0&&px<previous.width&&py<previous.height){const j=py*previous.width+px;old={cloud:(changed?previous.current:previous.from)[j],veil:(changed?previous.veilCurrent:previous.veilFrom)[j]};}
    else old=sourceVisibility?.fogAt(x,y)??{cloud:target[i],veil:veilTarget[i]};
    from[i]=Math.max(old.cloud,target[i]);veilFrom[i]=Math.max(old.veil,veilTarget[i]);
  }
  // 换窗口不重启退雾计时；重叠部分沿用同一世界像素，新进入画面的部分仍按旧视野插值。
  field={visibility,size,width,height,area,areaKey:key,explored,mask,layer,veil,target,veilTarget,from,veilFrom,current:until?new Float32Array(from):target,veilCurrent:until?new Float32Array(veilFrom):veilTarget,at:changed?time:previous.at,until,fromVisibility:sourceVisibility,painted:false};
}
export const fogTransitionActive=()=>!!field?.until;
export function resetFogResources(){
  if(!field)return;field.visibility.clearRasterCache?.();for(const canvas of [field.mask,field.layer,field.veil])canvas.width=canvas.height=1;field=null;
}
// 诊断只统计实际保留的数组和名义Canvas像素，不冒充浏览器/驱动总内存。
export function fogResourceStats(){
  if(!field)return null;const buffers=new Set([field.target,field.veilTarget,field.from,field.veilFrom,field.current,field.veilCurrent].map(a=>a.buffer));
  return {width:field.width,height:field.height,arrayBytes:[...buffers].reduce((sum,b)=>sum+b.byteLength,0),canvasRGBABytes:field.width*field.height*12,visibilityArrayBytes:field.visibility.arrayBytes,exteriorCacheBytes:field.visibility.rasterCacheBytes};
}

export function drawFog(ctx,visibility,explored,night,time,cloudTime=time,dusk=0,zoom=2,bounds=null){
  const area=bounds??{left:-visibility.border,top:-visibility.border,right:visibility.size+visibility.border,bottom:visibility.size+visibility.border};
  updateField(visibility,explored,time,area);
  const f=field,t=f.until&&time?Math.min(1,(time-f.at)/.36):1,strength=cloudStrength(zoom);
  if(!f.painted||f.until||f.strength!==strength){
    const g=f.mask.getContext('2d'),pixels=g.createImageData(f.width,f.height),vg=f.veil.getContext('2d'),veilPixels=vg.createImageData(f.width,f.height),ease=smooth(Math.max(0,t));
    for(let i=0;i<f.target.length;i++){
      const alpha=f.from[i]+(f.target[i]-f.from[i])*ease;f.current[i]=alpha;
      const x=area.left+(i%f.width+.5)/MASK_PX,y=area.top+(Math.floor(i/f.width)+.5)/MASK_PX,outside=x<0||y<0||x>=f.size||y>=f.size;
      pixels.data[i*4+3]=Math.round(alpha*(outside?1:strength+(1-strength)*alpha)*255);
      const density=f.veilFrom[i]+(f.veilTarget[i]-f.veilFrom[i])*ease;f.veilCurrent[i]=density;veilPixels.data[i*4+3]=Math.round(density*255);
    }
    g.putImageData(pixels,0,0);vg.putImageData(veilPixels,0,0);f.color=null;f.strength=strength;f.painted=true;if(t===1){f.until=0;f.fromVisibility=null;f.from=f.current=f.target;f.veilFrom=f.veilCurrent=f.veilTarget;}
  }
  const color=fogColor(night);
  if(f.color!==color){const vg=f.veil.getContext('2d');vg.globalCompositeOperation='source-in';vg.fillStyle=color;vg.fillRect(0,0,f.width,f.height);vg.globalCompositeOperation='source-over';f.color=color;}
  const w=area.right-area.left,h=area.bottom-area.top,g=f.layer.getContext('2d');g.setTransform(MASK_PX,0,0,MASK_PX,-area.left*MASK_PX,-area.top*MASK_PX);
  g.clearRect(area.left,area.top,w,h);drawCloudBackdrop(g,night,cloudTime,area,dusk);
  g.setTransform(1,0,0,1,0,0);g.globalCompositeOperation='destination-in';g.drawImage(f.mask,0,0);g.globalCompositeOperation='source-over';
  ctx.save();ctx.imageSmoothingEnabled=true;
  ctx.drawImage(f.veil,area.left,area.top,w,h);ctx.drawImage(f.layer,area.left,area.top,w,h);ctx.restore();
}
