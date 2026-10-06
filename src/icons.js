// 地图和状态栏共用同一篝火形状，避免两处示意不一致。
export function drawCampfire(ctx,x,y,size,alive=true){
  ctx.save();ctx.translate(x,y);ctx.scale(size,size);
  ctx.fillStyle=alive?'#ffc17c':'#75615b';ctx.beginPath();ctx.moveTo(.52,-.03);ctx.bezierCurveTo(.45,.38,1.03,.44,.82,.79);ctx.bezierCurveTo(.6,1.1,.08,.9,.17,.56);ctx.lineTo(.37,.24);ctx.lineTo(.37,.51);ctx.closePath();ctx.fill();
  if(alive){ctx.fillStyle='#fff1b0';ctx.beginPath();ctx.moveTo(.51,.39);ctx.lineTo(.68,.78);ctx.lineTo(.36,.78);ctx.closePath();ctx.fill();}
  ctx.restore();
}
