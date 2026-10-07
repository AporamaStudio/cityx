// 雾纹缓慢流动；逻辑视野仍是稳定格集合，不让装饰动画改变敌人显隐。
export function drawFog(ctx,size,seen,explored,night,time){
  const rgb=night>.5?'20,32,48':'64,81,87';
  // 未探索区域一次填充，避免缩放时逐格绘制造成接缝漏出地形。
  ctx.beginPath();
  for(let y=0;y<size;y++)for(let x=0;x<size;x++)if(!seen.has(y*size+x)&&!explored.has(y*size+x))ctx.rect(x,y,1,1);
  ctx.fillStyle=`rgb(${32-night*12},${48-night*15},${57-night*10})`;ctx.fill();
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const id=y*size+x;if(seen.has(id))continue;
    const known=explored.has(id),wave=(Math.sin(x*.65+y*.24+time*.32)+Math.cos(y*.53-x*.21-time*.21))*.025;
    ctx.fillStyle=known?`rgba(${rgb},${.60+wave})`:`rgb(${Math.round(32+night*-12+wave*80)},${Math.round(48-night*15+wave*80)},${Math.round(57-night*10+wave*80)})`;
    ctx.fillRect(x,y,1.01,1.01);
  }
  // 只在已见一侧柔化边缘；未知格始终不透明，不能从羽化边缘偷看敌人或建筑。
  for(const id of seen){
    const x=id%size,y=Math.floor(id/size);
    for(const [dx,dy] of [[-1,0],[1,0],[0,-1],[0,1]]){
      const nx=x+dx,ny=y+dy;if(nx<0||ny<0||nx>=size||ny>=size||seen.has(ny*size+nx))continue;
      const ex=x+.5+dx*.5,ey=y+.5+dy*.5,g=ctx.createLinearGradient(ex,ey,ex-dx*.55,ey-dy*.55);
      g.addColorStop(0,`rgba(${rgb},.65)`);g.addColorStop(1,`rgba(${rgb},0)`);ctx.fillStyle=g;
      ctx.fillRect(dx<0?x:dx>0?x+.45:x,dy<0?y:dy>0?y+.45:y,dx?.55:1,dy?.55:1);
    }
  }
}
