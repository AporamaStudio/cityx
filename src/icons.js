// 地图和状态栏共用同一篝火形状，避免两处示意不一致。
export function drawCampfire(ctx,x,y,size,alive=true){
  ctx.save();ctx.translate(x,y);ctx.scale(size,size);
  ctx.fillStyle=alive?'#ffc17c':'#75615b';ctx.beginPath();ctx.moveTo(.52,-.03);ctx.bezierCurveTo(.45,.38,1.03,.44,.82,.79);ctx.bezierCurveTo(.6,1.1,.08,.9,.17,.56);ctx.lineTo(.37,.24);ctx.lineTo(.37,.51);ctx.closePath();ctx.fill();
  if(alive){ctx.fillStyle='#fff1b0';ctx.beginPath();ctx.moveTo(.51,.39);ctx.lineTo(.68,.78);ctx.lineTo(.36,.78);ctx.closePath();ctx.fill();}
  ctx.restore();
}

// 挑高支架与平台，工具栏和地图使用同一份图形。
export const WATCHTOWER_SVG='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32" aria-hidden="true"><path d="M9 29 12 13h8l3 16M11 21l11 8M21 21l-11 8" fill="none" stroke="#9bddec" stroke-width="2"/><path d="M6 12h20v4H6zM5 9 16 2 27 9z" fill="#b3e8f2"/><path d="M10 9v3m12-3v3" stroke="#9bddec" stroke-width="2"/></svg>';
