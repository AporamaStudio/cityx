// 标签只消费已经过可见度筛选的显示帧；不查询敌源或隐藏敌人。
export function enemyBadgeLayouts(frames,project,{width,height,cellMeters=20,occupied=[]}){
  // 近裁面后的炮位会给出NaN坐标，不能让一个不可投影的障碍污染整组标签。
  const boxes=occupied.filter(box=>box&&[box.x,box.y,box.w,box.h].every(Number.isFinite)),result=[];
  for(const frame of frames){
    if(!(frame.alpha>0))continue;
    const anchor=project(frame.x+.5,frame.y+.5,(frame.ground??0)+2.1/cellMeters);if(anchor.hidden||!Number.isFinite(anchor.x)||!Number.isFinite(anchor.y)||anchor.x< -20||anchor.y< -20||anchor.x>width+20||anchor.y>height+20)continue;
    const count=Math.max(1,frame.enemy.members??1),text=String(frame.enemy.hp),w=Math.max(24,text.length*7+12)+(count>1?String(count).length*5+15:0),h=20;
    const candidates=[[0,-15],[-w/2-5,-15],[w/2+5,-15],[0,-39],[-w/2-5,-39],[w/2+5,-39]];
    let best=null,score=Infinity;
    for(const [dx,dy] of candidates){
      const x=Math.max(w/2+2,Math.min(width-w/2-2,anchor.x+dx)),y=Math.max(h/2+2,Math.min(height-h/2-2,anchor.y+dy));
      const box={x:x-w/2,y:y-h/2,w,h},overlap=boxes.reduce((sum,b)=>sum+Math.max(0,Math.min(box.x+w,b.x+b.w)-Math.max(box.x,b.x))*Math.max(0,Math.min(box.y+h,b.y+b.h)-Math.max(box.y,b.y)),0);
      if(overlap<score){score=overlap;best={...box,anchor,frame,count,text};}if(overlap===0)break;
    }
    if(best){boxes.push(best);result.push(best);}
  }
  return result;
}
export function drawEnemyPressure(ctx,frames,{project,pixels,cellMeters=20,elevation=Math.PI/2,time=0,reducedMotion=false}){
  for(const frame of frames){if(!(frame.alpha>0)||frame.enemy.hp<=0)continue;
    const p=project(frame.x+.5,frame.y+.5,(frame.ground??0)+.02);if(p.hidden)continue;
    const radius=Math.max(6,Math.min(22,(2.7+Math.min(5,frame.enemy.members??1)*.35)/cellMeters*pixels(frame.x+.5,frame.y+.5,0)*frame.scale)),ry=radius*Math.max(.35,Math.sin(elevation));
    const pulse=reducedMotion?1:.88+.12*Math.sin(time*3.5+(frame.enemy.id??0)*.17);
    ctx.save();ctx.globalAlpha=frame.alpha*pulse;ctx.translate(p.x,p.y);ctx.scale(1,ry/radius);
    const glow=ctx.createRadialGradient(0,0,radius*.3,0,0,radius*1.4);glow.addColorStop(0,'#ef715500');glow.addColorStop(.55,'#ec6b5333');glow.addColorStop(1,'#ec6b5300');ctx.fillStyle=glow;ctx.beginPath();ctx.arc(0,0,radius*1.4,0,Math.PI*2);ctx.fill();
    ctx.strokeStyle='#d584705c';ctx.lineWidth=1;ctx.beginPath();ctx.arc(0,0,radius,Math.PI*.1,Math.PI*.9);ctx.stroke();ctx.restore();
  }
}
export function drawEnemyBadges(ctx,layouts){
  for(const {x,y,w,h,anchor,frame,count,text} of layouts){
    ctx.save();ctx.globalAlpha=frame.alpha;
    ctx.strokeStyle='#c58b7580';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(x+w/2,y+h);ctx.lineTo(anchor.x,anchor.y+3);ctx.stroke();
    ctx.fillStyle='#291d27ed';ctx.strokeStyle='#a46862';ctx.beginPath();ctx.roundRect(x,y,w,h,3);ctx.fill();ctx.stroke();
    ctx.font='700 12px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle='#ffb9a3';ctx.fillText(text,x+(count>1?12:w/2),y+8);
    if(count>1){ctx.font='600 9px system-ui';ctx.fillStyle='#d9ad9c';ctx.textAlign='right';ctx.fillText('×'+count,x+w-4,y+8);}
    ctx.fillStyle='#62404a';ctx.fillRect(x+3,y+h-5,w-6,2);ctx.fillStyle='#f4c899';ctx.fillRect(x+3,y+h-5,(w-6)*Math.max(0,Math.min(1,frame.barHP/frame.enemy.max)),2);ctx.restore();
  }
}

export function drawDefenseFeedback(ctx,hits,{project,time}){
  for(const hit of hits){
    const t=Math.max(0,Math.min(1,(time-hit.at)/.65)),p=project(hit.x,hit.y,(hit.ground??0)+.16);if(p.hidden||t>=1)continue;
    const text=hit.type==='wallLost'?'缺口':hit.type==='leak'?`火光 −${hit.value}`:`−${hit.value}`;
    // 破墙文字落在缺口下方，受击数字放墙右侧；给墙HP和拥堵人群的牌子留出空间。
    const x=p.x+(hit.type==='wallHit'?24:0),y=hit.type==='wallLost'?p.y+22+t*8:p.y-(hit.type==='leak'?40:16)-t*18;
    ctx.save();ctx.globalAlpha=(1-t)*hit.alpha;ctx.font='700 12px system-ui';ctx.textAlign='center';ctx.textBaseline='bottom';ctx.lineWidth=3;ctx.strokeStyle='#211d26';ctx.strokeText(text,x,y);ctx.fillStyle=hit.type==='wallLost'?'#ffd096':'#ff9b81';ctx.fillText(text,x,y);ctx.restore();
  }
}
