// 云纹只改变外观；当前视野撤回后立即罩雾，探索记忆不维持实时可见。
const CLOUD_SPAN=48,TEXTURE_PX=512,MASK_PX=8,BORDER=8;
let textures=null,field=null;
const smooth=t=>t*t*(3-2*t);
const blend=(a,b,t)=>a.map((v,i)=>Math.round(v+(b[i]-v)*t));

// 全图、地图外远景和昼夜过渡共用底色，避免出现一圈矩形接缝。
export const fogColor=night=>`rgb(${blend([237,240,235],[52,68,93],night).join(',')})`;

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
  textures=[[166,185,207,255,252,240],[25,39,61,77,98,133]].map(colors=>{
    const canvas=surface(n),g=canvas.getContext('2d'),pixels=g.createImageData(n,n);
    for(let y=0;y<n;y++)for(let x=0;x<n;x++){
      const i=y*n+x,h=heights[i];
      // 宽亮面和柔和侧阴影暗示云团厚度，不堆细碎纹理或逐格明暗。
      const slope=heights[y*n+(x+n-1)%n]-heights[y*n+(x+1)%n]+heights[((y+n-1)%n)*n+x]-heights[((y+1)%n)*n+x];
      const light=Math.max(0,Math.min(1,.08+h*.76+slope*30));
      for(let c=0;c<3;c++)pixels.data[i*4+c]=colors[c]+(colors[c+3]-colors[c])*light;
      pixels.data[i*4+3]=255;
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
          glow.addColorStop(0,night?'rgba(109,129,164,.48)':'rgba(255,254,246,.96)');
          glow.addColorStop(.30,night?'rgba(102,123,157,.40)':'rgba(255,254,246,.90)');
          glow.addColorStop(.68,night?'rgba(93,112,141,.23)':'rgba(254,252,244,.55)');
          glow.addColorStop(1,night?'rgba(93,112,141,0)':'rgba(254,252,244,0)');
          g.fillStyle=glow;g.fillRect(x-r,y-r,r*2,r*2);
        }
      }
    }
    return canvas;
  });
  return textures;
}
function tileClouds(ctx,image,bounds,dx,dy){
  const startX=Math.floor((bounds.left-dx)/CLOUD_SPAN)*CLOUD_SPAN+dx;
  const startY=Math.floor((bounds.top-dy)/CLOUD_SPAN)*CLOUD_SPAN+dy;
  for(let y=startY;y<bounds.bottom;y+=CLOUD_SPAN)for(let x=startX;x<bounds.right;x+=CLOUD_SPAN)
    ctx.drawImage(image,x,y,CLOUD_SPAN+.20,CLOUD_SPAN+.20);
}
// 两层云以不同方向流动；起点视角几秒即可察觉位移，遮罩仍固定，不改变敌人显隐。
export function drawCloudBackdrop(ctx,night,time,bounds){
  const [day,dark]=cloudTextures();ctx.save();ctx.imageSmoothingEnabled=true;
  ctx.beginPath();ctx.rect(bounds.left,bounds.top,bounds.right-bounds.left,bounds.bottom-bounds.top);ctx.clip();
  // 连续不透明底层兜住贴图拼接的亚像素缝，不让缩放后的云纹透出未知地形。
  ctx.fillStyle=fogColor(night);ctx.fillRect(bounds.left,bounds.top,bounds.right-bounds.left,bounds.bottom-bounds.top);
  tileClouds(ctx,day,bounds,time*.34,time*.10);
  if(night>0){ctx.globalAlpha=night;tileClouds(ctx,dark,bounds,time*.34,time*.10);}
  ctx.globalAlpha=.18*(1-night);tileClouds(ctx,day,bounds,12-time*.16,19+time*.055);
  if(night>0){ctx.globalAlpha=.18*night;tileClouds(ctx,dark,bounds,12-time*.16,19+time*.055);}
  ctx.restore();
}
// 两次距离传播只在视野变化时执行，羽化只向已知一侧延伸，未知区域保持不透明。
function distances(flags,width,unknownOnly){
  const d=new Float32Array(flags.length),diagonal=Math.SQRT2;
  for(let i=0;i<d.length;i++)d[i]=(unknownOnly?flags[i]===2:flags[i]!==0)?0:width*2;
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
function updateField(size,seen,explored,time){
  const cells=new Uint8Array(size*size);
  let changed=!field||field.size!==size||field.explored!==explored;
  for(let i=0;i<cells.length;i++){
    cells[i]=seen.has(i)?0:explored.has(i)?1:2;
    if(!changed&&cells[i]!==field.cells[i])changed=true;
  }
  if(!changed)return;
  const span=size+BORDER*2,n=span*MASK_PX,flags=new Uint8Array(n*n),target=new Float32Array(n*n);
  for(let y=0;y<n;y++)for(let x=0;x<n;x++){
    const gx=x/MASK_PX-BORDER,gy=y/MASK_PX-BORDER;
    const cx=Math.max(0,Math.min(size-1,Math.floor(gx))),cy=Math.max(0,Math.min(size-1,Math.floor(gy)));
    flags[y*n+x]=cells[cy*size+cx];
  }
  const unknown=distances(flags,n,true),hidden=distances(flags,n,false);
  for(let y=0;y<n;y++)for(let x=0;x<n;x++){
    const i=y*n+x,gx=(x+.5)/MASK_PX-BORDER,gy=(y+.5)/MASK_PX-BORDER;
    const depth=Math.max(0,-gx,-gy,gx-size,gy-size);
    const bank=1.05+noise(gx/5+20,gy/5+20,32)*1.15;
    const feather=1-smooth(Math.min(1,unknown[i]/(MASK_PX*bank)));
    const memory=.60*(1-smooth(Math.min(1,hidden[i]/MASK_PX)));
    target[i]=flags[i]===2?1:Math.max(flags[i]===1?.60:0,feather,memory,smooth(Math.min(1,depth/BORDER)));
  }
  const previous=field&&field.size===size&&field.explored===explored?field:null;
  const mask=previous?.mask??surface(n),layer=previous?.layer??surface(n);
  const from=previous?new Float32Array(previous.current):new Float32Array(target);
  // 增加遮挡立即生效；仅新揭开的云短暂退散，绝不淡出撤回视野的遮罩。
  for(let i=0;i<target.length;i++)from[i]=Math.max(from[i],target[i]);
  field={size,span,n,cells,explored,target,from,current:new Float32Array(from),mask,layer,at:time,until:previous&&time?time+.36:0,painted:false};
}
export const fogTransitionActive=()=>!!field?.until;

export function drawFog(ctx,size,seen,explored,night,time){
  updateField(size,seen,explored,time);
  const f=field,t=f.until&&time?Math.min(1,(time-f.at)/.36):1;
  if(!f.painted||f.until){
    const g=f.mask.getContext('2d'),pixels=g.createImageData(f.n,f.n),ease=smooth(Math.max(0,t));
    for(let i=0;i<f.target.length;i++){
      const alpha=f.from[i]+(f.target[i]-f.from[i])*ease;f.current[i]=alpha;
      pixels.data[i*4+3]=Math.round(alpha*255);
    }
    g.putImageData(pixels,0,0);f.painted=true;if(t===1)f.until=0;
  }
  const g=f.layer.getContext('2d');g.setTransform(MASK_PX,0,0,MASK_PX,BORDER*MASK_PX,BORDER*MASK_PX);
  g.clearRect(-BORDER,-BORDER,f.span,f.span);
  drawCloudBackdrop(g,night,time,{left:-BORDER,top:-BORDER,right:size+BORDER,bottom:size+BORDER});
  g.setTransform(1,0,0,1,0,0);g.globalCompositeOperation='destination-in';g.drawImage(f.mask,0,0);g.globalCompositeOperation='source-over';
  ctx.save();ctx.imageSmoothingEnabled=true;
  // 绘制整张缓存遮罩含外围景物，云纹在地图边缘连续；镜头不参与逻辑视野。
  ctx.drawImage(f.layer,-BORDER,-BORDER,f.span,f.span);ctx.restore();
}
