// 当前视野移除后立即重新罩雾；探索记忆只保留地形，不维持实时可见。
// 雾纹缓慢流动，不让装饰动画改变敌人显隐。
export function drawFog(ctx,size,seen,explored,night,time,bounds={left:0,top:0,right:size,bottom:size}){
  const rgb=night>.5?'20,32,48':'64,81,87';
  // 未探索区域一次填充，避免缩放时逐格绘制造成接缝漏出地形。
  ctx.beginPath();
  for(let y=bounds.top;y<bounds.bottom;y++)for(let x=bounds.left;x<bounds.right;x++)if(!seen.has(y*size+x)&&!explored.has(y*size+x))ctx.rect(x,y,1,1);
  ctx.fillStyle=`rgb(${32-night*12},${48-night*15},${57-night*10})`;ctx.fill();
  // 只绘制镜头附近的雾，显隐仍读取完整视野集合，裁剪不改变探索规则。
  for(let y=bounds.top;y<bounds.bottom;y++)for(let x=bounds.left;x<bounds.right;x++){
    const id=y*size+x;if(seen.has(id))continue;
    const known=explored.has(id),wave=(Math.sin(x*.65+y*.24+time*.32)+Math.cos(y*.53-x*.21-time*.21))*.025;
    ctx.fillStyle=known?`rgba(${rgb},${.80+wave})`:`rgb(${Math.round(32+night*-12+wave*80)},${Math.round(48-night*15+wave*80)},${Math.round(57-night*10+wave*80)})`;
    ctx.fillRect(x,y,1.01,1.01);
  }
  // 只在已见一侧柔化边缘；未知格始终不透明，不能从羽化边缘偷看敌人或建筑。
  for(const id of seen){
    const x=id%size,y=Math.floor(id/size);
    if(x<bounds.left||x>=bounds.right||y<bounds.top||y>=bounds.bottom)continue;
    for(const [dx,dy] of [[-1,0],[1,0],[0,-1],[0,1]]){
      const nx=x+dx,ny=y+dy;if(nx<0||ny<0||nx>=size||ny>=size||seen.has(ny*size+nx))continue;
      const ex=x+.5+dx*.5,ey=y+.5+dy*.5,g=ctx.createLinearGradient(ex,ey,ex-dx*.55,ey-dy*.55);
      g.addColorStop(0,`rgba(${rgb},.65)`);g.addColorStop(1,`rgba(${rgb},0)`);ctx.fillStyle=g;
      ctx.fillRect(dx<0?x:dx>0?x+.45:x,dy<0?y:dy>0?y+.45:y,dx?.55:1,dy?.55:1);
    }
  }
}
