import {readMapSettings,mapSearch} from './map-settings.js';
import {generateCityMap,walkableDistances} from './city-map.js?v=3';
const $=id=>document.getElementById(id),canvas=$('map'),ctx=canvas.getContext('2d'),viewport=$('viewport');
let appliedSettings,map,lookup=[],scale=16,panX=0,panY=0,hover=-1,drag=null,width=0,height=0;
// 地图可视化只依赖生成数据，点击不修改地形或模拟修复。
function fit(){scale=Math.max(.5,Math.min((width-34)/map.width,(height-34)/map.height));panX=(width-map.width*scale)/2;panY=(height-map.height*scale)/2;draw();}
function resize(){width=viewport.clientWidth;height=viewport.clientHeight;canvas.width=width*devicePixelRatio;canvas.height=height*devicePixelRatio;if(map)fit();}
function zoom(factor,x=width/2,y=height/2){const next=Math.max(.5,Math.min(60,scale*factor));panX=x-(x-panX)*next/scale;panY=y-(y-panY)*next/scale;scale=next;draw();}
function draw(){
  if(!map)return;
  ctx.setTransform(devicePixelRatio,0,0,devicePixelRatio,0,0);ctx.clearRect(0,0,width,height);ctx.save();ctx.translate(panX,panY);ctx.scale(scale,scale);
  ctx.fillStyle='#45564d';ctx.fillRect(0,0,map.width,map.height);
  for(let id=0;id<map.tiles.length;id++){
    const t=map.tiles[id],x=id%map.width,y=Math.floor(id/map.width);
    if(t==='road'||t==='open'){ctx.fillStyle=t==='road'?'#697780':'#749e83';ctx.fillRect(x,y,1,1);}
    if(scale>=9){ctx.strokeStyle='#a4b9ac25';ctx.lineWidth=1/scale;ctx.strokeRect(x,y,1,1);}
  }
  for(const b of map.blocks){
    const selected=b.id===hover;
    if(b.kind==='open'){
      ctx.strokeStyle=selected?'#efffba':'#b9dec1';ctx.lineWidth=selected?2/scale:1/scale;ctx.setLineDash([.2,.15]);ctx.strokeRect(b.x+.1,b.y+.1,b.width-.2,b.height-.2);ctx.setLineDash([]);
      if(scale>=12){ctx.fillStyle='#d0efd0';ctx.font='.65px system-ui';ctx.textAlign='center';ctx.fillText('+',b.x+b.width/2,b.y+b.height/2+.2);}
      continue;
    }
    ctx.fillStyle=selected?'#c4ac7c':'#81745b';ctx.fillRect(b.x+.05,b.y+.05,b.width-.1,b.height-.1);
    ctx.fillStyle='#554f43';ctx.fillRect(b.x+.05,b.y+b.height-.25,b.width-.1,.2);
    ctx.strokeStyle=selected?'#fff0a9':b.special?'#d5b5fc':'#c5b28a';ctx.lineWidth=selected?2/scale:1/scale;ctx.strokeRect(b.x+.08,b.y+.08,b.width-.16,b.height-.16);
    // 内部屋顶只是建筑群表现，不产生额外可操作地块或通路。
    ctx.fillStyle='#a39270';
    for(let ry=0;ry<Math.max(1,b.height-1);ry+=2)for(let rx=0;rx<Math.max(1,b.width-1);rx+=2)ctx.fillRect(b.x+rx+.3,b.y+ry+.3,Math.min(1.25,b.width-rx-.6),Math.min(1.25,b.height-ry-.6));
    // 短裂纹表示废弃，保持街区占地边界干净。
    ctx.strokeStyle='#c2b38a66';ctx.lineWidth=1/scale;ctx.beginPath();ctx.moveTo(b.x+b.width*.35,b.y+.2);ctx.lineTo(b.x+b.width*.5,b.y+b.height*.5);ctx.lineTo(b.x+b.width*.4,b.y+b.height-.2);ctx.stroke();
  }
  for(const [p,color] of [[map.camp,'#ffd182'],[map.goal,'#9ee4ec']]){ctx.fillStyle=color;ctx.beginPath();ctx.moveTo(p.x+.5,p.y);ctx.lineTo(p.x+1,p.y+.5);ctx.lineTo(p.x+.5,p.y+1);ctx.lineTo(p.x,p.y+.5);ctx.closePath();ctx.fill();}
  ctx.restore();
  ctx.font='600 11px system-ui';ctx.textAlign='center';
  for(const [p,text,color] of [[map.camp,'起点','#ffe1a6'],[map.goal,'远端目标','#b9f4ff']]){const x=panX+(p.x+.5)*scale,y=panY+(p.y+.5)*scale;ctx.fillStyle='#132322ee';ctx.fillRect(x-30,y-27,60,18);ctx.fillStyle=color;ctx.fillText(text,x,y-14);}
  if(hover>=0){const b=map.blocks[hover],x=panX+(b.x+b.width/2)*scale,y=panY+b.y*scale;ctx.fillStyle='#132322ee';ctx.fillRect(x-38,y-23,76,19);ctx.fillStyle='#ffe3a1';ctx.fillText(`${b.width} × ${b.height} ${b.kind==='open'?'空地':b.special?'特殊':'街区'}`,x,y-9);}
}
function generate(){
  try{
    const settings={seed:$('seed').value};
    for(const name of ['width','height','mainRoadWidth','minBlock','maxBlock','specialMin','specialMax'])settings[name]=Number($(name).value);
    for(const name of ['special','touching'])settings[name]=$(name).checked;
    map=generateCityMap(settings);appliedSettings=settings;
    $('play').hidden=map.width!==30||map.height!==30;
    $('play').href=`index.html?${mapSearch(appliedSettings)}`;
    $('playHint').textContent=$('play').hidden?'战斗目前支持 30×30；大地图仅预览。':'链接使用最后成功生成的参数，打开后开始新的一局。';
    lookup=new Int32Array(map.width*map.height).fill(-1);
    for(const b of map.blocks)for(let y=b.y;y<b.y+b.height;y++)for(let x=b.x;x<b.x+b.width;x++)lookup[y*map.width+x]=b.id;
    const distances=walkableDistances(map),walkable=map.tiles.filter(t=>t!=='block').length,reachable=distances.filter(d=>d>=0).length;
    $('stats').textContent=`${map.buildings.length} 处建筑街区 · ${map.openSpaces.length} 处开放场地 · 特殊 ${map.stats.special} · 紧邻 ${map.stats.joined} 组 · 建筑占地 ${(map.stats.coverage*100).toFixed(1)}% · 通行区连通 ${reachable}/${walkable} 格 · 起终点最短路 ${distances[map.goal.y*map.width+map.goal.x]} 格`;
    $('mapTitle').textContent=`${map.width} × ${map.height} · ${map.seed}`;$('error').textContent=map.special&&!map.stats.special?'当前地图放不下指定尺寸的特殊区块；请扩大地图或降低特殊最小边长。':'';hover=-1;fit();
  }catch(error){$('error').textContent=error.message;}
}
$('settings').onsubmit=e=>{e.preventDefault();generate();};
$('next').onclick=()=>{$('seed').value=`cityx-${Math.floor(Math.random()*1000000)}`;generate();};
$('large').onclick=()=>{$('width').value=50;$('height').value=100;generate();};
$('fit').onclick=fit;$('in').onclick=()=>zoom(1.3);$('out').onclick=()=>zoom(1/1.3);
canvas.addEventListener('wheel',e=>{e.preventDefault();const r=canvas.getBoundingClientRect();zoom(e.deltaY<0?1.15:1/1.15,e.clientX-r.left,e.clientY-r.top);},{passive:false});
canvas.addEventListener('pointerdown',e=>{drag={x:e.clientX,y:e.clientY};canvas.setPointerCapture(e.pointerId);});
canvas.addEventListener('pointermove',e=>{
  if(drag){panX+=e.clientX-drag.x;panY+=e.clientY-drag.y;drag={x:e.clientX,y:e.clientY};}
  const r=canvas.getBoundingClientRect(),x=Math.floor((e.clientX-r.left-panX)/scale),y=Math.floor((e.clientY-r.top-panY)/scale);
  const id=x>=0&&y>=0&&x<map.width&&y<map.height?y*map.width+x:-1;hover=id>=0?lookup[id]:-1;
  const block=hover>=0?map.blocks[hover]:null;
  $('info').textContent=block?`${block.kind==='open'?'开放场地':block.special?'特殊设施':'建筑街区'} ${block.id+1} · ${block.width}×${block.height} 格 · ${block.kind==='open'?'可通行 · 规划可建前哨、墙与炮台':'废墟 · 不可通行 · 规划可整块修缮，不可清除'}`:id>=0?`(${x}, ${y}) · 道路 · 可通行 · 规划可建墙、墙上架炮，不可完全封路`:'悬停查看街区占地与通行规则';draw();
});
canvas.addEventListener('pointerup',()=>{drag=null;});canvas.addEventListener('pointercancel',()=>{drag=null;});canvas.addEventListener('lostpointercapture',()=>{drag=null;});canvas.addEventListener('pointerleave',()=>{hover=-1;draw();});
const initial=readMapSettings(location.search);
for(const [name,value] of Object.entries(initial))if($(name)){if(typeof value==='boolean')$(name).checked=value;else $(name).value=value;}
new ResizeObserver(resize).observe(viewport);resize();generate();
