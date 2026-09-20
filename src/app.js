import { SIZE, DEFAULTS } from './config.js';
import { key, xy, inside, createState, pathFrom, coverage, fireField, funds, placementError, validateSources, stepBattle } from './model.js';
const $ = id => document.getElementById(id);
const canvas = $('map'), ctx = canvas.getContext('2d'), viewport = $('viewport');
let state = createState(), tool = 'build', hover = null, dragging = null;
let zoom = 1, base = 20, panX = 0, panY = 0, width = 0, height = 0;
let fire = fireField(state), paused = false, timer = 0, last = 0;
let messages = [];
const colors = ['#df9989', '#a6a1e9', '#d5bd79', '#78bcd3'];
const notify = message => { $('notice').textContent = message; };

// 画布使用设备像素比，地图输入和绘制都以 CSS 像素换算。
function resize(fit = false) {
  const oldW = width, oldH = height;
  width = viewport.clientWidth; height = viewport.clientHeight;
  canvas.width = Math.round(width * devicePixelRatio); canvas.height = Math.round(height * devicePixelRatio);
  base = Math.min((width - 54) / SIZE, (height - 62) / SIZE);
  if (fit || !oldW) { zoom = 1; panX = (width - base * SIZE) / 2; panY = (height - base * SIZE) / 2 - 6; }
  else { panX += (width - oldW) / 2; panY += (height - oldH) / 2; }
  draw();
}
function changeZoom(factor, x = width / 2, y = height / 2) {
  const old = zoom; zoom = Math.max(.65, Math.min(4, zoom * factor));
  panX = x - (x - panX) * zoom / old; panY = y - (y - panY) * zoom / old;
  draw();
}
function cellAt(event) {
  const rect = canvas.getBoundingClientRect(), x = Math.floor((event.clientX - rect.left - panX) / (base * zoom)), y = Math.floor((event.clientY - rect.top - panY) / (base * zoom));
  return inside(x, y) ? key(x, y) : null;
}

// 先绘制地形和覆盖，再叠加路线、设施、敌群，确保信息优先级清晰。
function draw() {
  ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
  ctx.clearRect(0, 0, width, height);
  const size = base * zoom;
  ctx.save(); ctx.translate(panX, panY); ctx.scale(size, size);
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
    const id = key(x, y), power = fire.get(id) || 0;
    ctx.fillStyle = (x + y) % 2 ? '#1b2a2d' : '#1e2d30';
    ctx.fillRect(x, y, 1, 1);
    if ($('heat').checked && power) { ctx.fillStyle = `rgba(99,211,166,${Math.min(.6,.17 + power * .045)})`; ctx.fillRect(x, y, 1, 1); }
    if (state.walls.has(id)) {
      ctx.fillStyle = '#455055'; ctx.fillRect(x + .05, y + .05, .9, .9);
      ctx.strokeStyle = '#5a6569'; ctx.lineWidth = .045; ctx.beginPath(); ctx.moveTo(x + .15, y + .8); ctx.lineTo(x + .8, y + .15); ctx.stroke();
    }
    ctx.strokeStyle = '#324044'; ctx.lineWidth = .025; ctx.strokeRect(x, y, 1, 1);
  }
  if ($('routes').checked) state.sources.forEach((source, index) => {
    const path = pathFrom(key(source.x, source.y), state.field);
    ctx.strokeStyle = colors[index % colors.length]; ctx.globalAlpha = .58; ctx.lineWidth = .075;
    ctx.beginPath(); path.forEach((id, i) => { const [x,y] = xy(id), offset = (index % 3 - 1) * .12; if (!i) ctx.moveTo(x + .5 + offset,y + .5); else ctx.lineTo(x + .5 + offset,y + .5); }); ctx.stroke();
    for (let i = 1; i < path.length; i += 4) {
      const [x,y] = xy(path[i]), [nx,ny] = xy(path[Math.min(i + 1,path.length - 1)]);
      ctx.save(); ctx.translate(x+.5,y+.5); ctx.rotate(Math.atan2(ny-y,nx-x)); ctx.beginPath(); ctx.moveTo(-.15,-.16); ctx.lineTo(.1,0); ctx.lineTo(-.15,.16); ctx.stroke(); ctx.restore();
    }
    ctx.globalAlpha = 1;
  });
  if (hover !== null && state.phase === 'build') {
    for (const id of tool === 'build' ? coverage(hover) : [hover]) {
      const [x,y] = xy(id); ctx.fillStyle = tool === 'build' && !placementError(state, hover) ? '#92ffd43b' : '#ff776644'; ctx.fillRect(x,y,1,1);
    }
    const [x,y] = xy(hover); ctx.strokeStyle = '#d8f9e8'; ctx.lineWidth = .08; ctx.strokeRect(x+.04,y+.04,.92,.92);
  }
  const label = (text,x,y,color,font=.4) => {ctx.fillStyle=color;ctx.font=`600 ${font}px system-ui`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,x,y);};
  if ($('heat').checked) for (const [id,power] of fire) {
    const [x,y] = xy(id); if (!state.towers.has(id)) label(power,x+.5,y+.5,'#b8f1d3',.35);
  }
  for (const id of state.towers) {
    const [x,y] = xy(id); ctx.fillStyle='#8bdbb9'; ctx.fillRect(x+.18,y+.22,.64,.6); ctx.fillStyle='#28483b'; ctx.fillRect(x+.37,y+.32,.26,.38); ctx.fillStyle='#ddffe7'; ctx.fillRect(x+.43,y+.08,.14,.35);
  }
  state.sources.forEach((s,i) => {ctx.fillStyle=colors[i%colors.length];ctx.fillRect(s.x+.08,s.y+.08,.84,.84);label(i+1,s.x+.5,s.y+.5,'#23262b',.52);});
  const [cx,cy] = xy(state.camp); ctx.fillStyle='#ffc17c';ctx.beginPath();ctx.moveTo(cx+.5,cy+.06);ctx.lineTo(cx+.9,cy+.7);ctx.lineTo(cx+.5,cy+.95);ctx.lineTo(cx+.1,cy+.7);ctx.closePath();ctx.fill();label('火',cx+.5,cy+.59,'#402c24',.42);
  for (const enemy of state.enemies) {
    const [x,y] = xy(enemy.id);ctx.fillStyle=enemy.members>1?'#ffb079':'#f28780';ctx.fillRect(x+.04,y+.06,.92,.83);
    label(enemy.hp,x+.5,y+.42,'#321d23',.46);ctx.fillStyle='#552b30';ctx.fillRect(x+.08,y+.73,.84,.1);ctx.fillStyle='#fff1c4';ctx.fillRect(x+.08,y+.73,.84*enemy.hp/enemy.max,.1);
    if(enemy.members>1){ctx.strokeStyle='#ffe6b9';ctx.lineWidth=.07;ctx.strokeRect(x+.04,y+.06,.92,.83);}
  }
  for(const event of state.events){
    const [x,y]=xy(event.id);ctx.strokeStyle=event.type==='merge'?'#ffe0a1':'#ffbbb0';ctx.lineWidth=.075;ctx.strokeRect(x+.01,y+.01,.98,.98);
    if(event.type==='merge'||event.type==='hit') {
      const text=event.type==='merge'?`合流 ${event.value}`:`−${event.value}`;
      ctx.font='600 .43px system-ui';ctx.textAlign='center';ctx.textBaseline='bottom';ctx.lineWidth=.12;ctx.strokeStyle='#142024';ctx.strokeText(text,x+.5,y-.05);ctx.fillStyle=event.type==='merge'?'#ffe0a1':'#ffb1a3';ctx.fillText(text,x+.5,y-.05);
    }
  }
  ctx.restore();
  // 坐标标记帮助修改源头；屏幕字号不随棋盘缩小。
  ctx.font='10px system-ui';ctx.textAlign='center';ctx.fillStyle='#81999c';
  for(let i=0;i<SIZE;i+=5){ctx.fillText(i,panX+(i+.5)*size,panY-8);ctx.fillText(i,panX-14,panY+(i+.65)*size);}
  $('zoom').textContent = `${Math.round(zoom * 100)}%`;
  if (hover !== null) {
    const [x,y] = xy(hover), enemy = state.enemies.find(e=>e.id===hover);
    $('cellInfo').textContent = `格子 (${x}, ${y}) · 火力 ${fire.get(hover)||0} · ${state.walls.has(hover)?'不可通行':'可通行'}${state.towers.has(hover)?' · 武器 A':''}${enemy?` · 敌群 ${enemy.hp}/${enemy.max}（${Math.round(enemy.hp/enemy.max*100)}%） · ${enemy.members} 批`:''}`;
  } else $('cellInfo').textContent = '单击建造 · 拖动平移 · 滚轮缩放 · 悬停看生命';
}
function update() {
  fire = fireField(state);
  $('budget').textContent = funds(state); $('tick').textContent = state.tick;
  $('campHP').textContent = `${Math.max(0,state.hp)} / ${DEFAULTS.campHP}`; $('campBar').style.width = `${Math.max(0,state.hp)/DEFAULTS.campHP*100}%`;
  $('spawned').textContent = `${state.spawned} / ${state.sources.reduce((n,s)=>n+s.count,0)}`;
  const active = state.phase === 'battle', build = state.phase === 'build';
  $('phase').textContent = build ? '准备布防' : active ? (paused ? '防守暂停' : '防守进行中') : state.phase === 'won' ? '守住了' : '篝火熄灭';
  $('start').disabled = !build; $('pause').disabled = !active; $('step').disabled = !active || !paused;
  $('pause').textContent = paused ? '继续' : '暂停';
  for (const id of ['build','erase','apply','addSource']) $(id).disabled = !build;
  document.querySelectorAll('#sources input, #sources button').forEach(el=>el.disabled=!build);
  $('result').textContent = build ? '修改位置后再试。敌人不攻击武器与障碍。' : `${state.phase === 'won' ? '防守成功' : state.phase === 'lost' ? '防守失败' : '防守中'} · 削减 ${state.damage} · 漏过 ${state.leaked} · 合并 ${state.merges} 次`;
  draw();
}
function sourceEditor(sources) {
  $('sources').replaceChildren();
  sources.forEach((s,i)=>{
    const card=document.createElement('div');card.className='source';
    const head=document.createElement('div');head.className='source-head';head.textContent=`源头 ${i+1}`;
    const remove=document.createElement('button');remove.textContent='删除';remove.onclick=()=>{card.remove();sourceEditor(readSources());};head.append(remove);card.append(head);
    const fields=document.createElement('div');fields.className='fields';
    for(const [name,label,max] of [['x','X',29],['y','Y',29],['hp','生命',999],['count','批数',30],['first','首拍',200],['interval','间隔',100]]){
      const wrap=document.createElement('label');wrap.textContent=label;const input=document.createElement('input');input.type='number';input.name=name;input.value=s[name];input.min=['x','y'].includes(name)?0:1;input.max=max;input.step=1;input.setAttribute('aria-label',`源头${i+1} ${label}`);wrap.append(input);fields.append(wrap);
    }
    card.append(fields);$('sources').append(card);
  });
}
function readSources(){return [...document.querySelectorAll('.source')].map(card=>Object.fromEntries([...card.querySelectorAll('input')].map(input=>[input.name,input.value.trim()===''?NaN:Number(input.value)])));}
function reset(keep=true){state=createState(structuredClone(state.sources),keep?state.towers:new Set());paused=false;timer=0;messages=[];$('log').replaceChildren();notify(keep?'已恢复篝火与敌人，保留布局，可继续调整。':'已清空布局，预算全部返还。');update();}
$('build').onclick=()=>{tool='build';$('build').classList.add('selected');$('erase').classList.remove('selected');draw();};
$('erase').onclick=()=>{tool='erase';$('erase').classList.add('selected');$('build').classList.remove('selected');draw();};
$('retry').onclick=()=>reset();$('clear').onclick=()=>reset(false);
$('apply').onclick=()=>{if(state.phase!=='build')return;const sources=readSources(),error=validateSources(sources,state);$('configError').textContent=error;if(error)return;state=createState(sources,state.towers);messages=[];$('log').replaceChildren();sourceEditor(sources);notify('来袭配置已应用，路线已更新。');update();};
$('addSource').onclick=()=>{const sources=readSources();if(sources.length>=12){$('configError').textContent='最多 12 个源头。';return;}sources.push({x:1,y:1,hp:12,count:4,first:1,interval:6});sourceEditor(sources);};
$('fit').onclick=()=>resize(true);$('in').onclick=()=>changeZoom(1.25);$('out').onclick=()=>changeZoom(.8);$('routes').onchange=draw;$('heat').onchange=draw;
canvas.addEventListener('contextmenu',e=>e.preventDefault());
canvas.addEventListener('wheel',e=>{e.preventDefault();const r=canvas.getBoundingClientRect();changeZoom(e.deltaY<0?1.12:1/1.12,e.clientX-r.left,e.clientY-r.top);},{passive:false});
// 单击放置、拖动平移；在松开时才建造，避免拖地图误花预算。
canvas.addEventListener('pointerdown',e=>{
  dragging={x:e.clientX,y:e.clientY,startX:e.clientX,startY:e.clientY,moved:false,panOnly:e.button!==0||e.altKey};
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove',e=>{
  if(dragging){
    if(Math.hypot(e.clientX-dragging.startX,e.clientY-dragging.startY)>4)dragging.moved=true;
    if(dragging.moved||dragging.panOnly){panX+=e.clientX-dragging.x;panY+=e.clientY-dragging.y;}
    dragging.x=e.clientX;dragging.y=e.clientY;
  }
  hover=cellAt(e);draw();
});
canvas.addEventListener('pointerup',e=>{
  const shouldPlace=dragging&&!dragging.moved&&!dragging.panOnly;dragging=null;
  if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);
  if(!shouldPlace)return;
  const id=cellAt(e);if(id===null)return;
  if(state.phase!=='build'){notify('战斗中不能修改布局；可暂停观察或返回布防。');return;}
  if(tool==='erase'){if(state.towers.delete(id))notify('武器已拆除，返还 10 预算。');else notify('这里没有武器。');}
  else{const error=placementError(state,id);if(error)notify(error);else{state.towers.add(id);notify('武器已部署，覆盖格火力 +2。');}}
  update();
});
canvas.addEventListener('pointercancel',()=>{dragging=null;});
canvas.addEventListener('lostpointercapture',()=>{dragging=null;});
canvas.addEventListener('pointerleave',()=>{hover=null;draw();});
new ResizeObserver(()=>resize()).observe(viewport);
sourceEditor(state.sources);resize(true);update();

// 只记录当前波次的近期反馈，不建设存档或回放系统。
function advance() {
  stepBattle(state);
  for (const event of state.events) {
    const [x,y] = xy(event.id);
    const text = event.type === 'merge' ? `(${x},${y}) ${event.members} 批合流 → ${event.value}` : event.type === 'leak' ? `篝火受到 ${event.value} 点伤害` : event.type === 'kill' ? `(${x},${y}) 消灭 ${event.value} 批敌人` : `(${x},${y}) 火力削减 ${event.value}`;
    messages.unshift(`第 ${state.tick} 拍 · ${text}`);
  }
  messages = messages.slice(0,8); $('log').replaceChildren(...messages.map(text=>{const li=document.createElement('li');li.textContent=text;return li;}));
  if (state.phase === 'won') notify('守住了！可以保留布局，调整后再比较一次。');
  if (state.phase === 'lost') notify('篝火熄灭。看看合流之前是否还有更好的覆盖位置。');
  update();
}
$('start').onclick=()=>{
  if(state.phase!=='build')return;
  if(JSON.stringify(readSources())!==JSON.stringify(state.sources)){ $('configError').textContent='来袭配置有未应用修改，请先应用配置。';$('settings').open=true;notify('请先应用来袭配置，确保预览与实际波次一致。');return; }
  const error=validateSources(state.sources,state);if(error){notify(error);return;}
  state.phase='battle';paused=false;timer=0;last=performance.now();$('settings').open=false;notify('敌人正在接近。可以暂停、逐步观察或加速。');update();
};
$('pause').onclick=()=>{if(state.phase!=='battle')return;paused=!paused;timer=0;update();};
$('step').onclick=()=>{if(state.phase==='battle'&&paused)advance();};
// 一个简单累计计时器驱动所有敌人，不随绘制次数扣血。
function frame(now){
  const elapsed=Math.min(now-last,250);last=now;
  if(state.phase==='battle'&&!paused){timer+=elapsed*Number($('speed').value);while(timer>=DEFAULTS.stepMs&&state.phase==='battle'){timer-=DEFAULTS.stepMs;advance();}}
  requestAnimationFrame(frame);
}
document.addEventListener('visibilitychange',()=>{if(document.hidden&&state.phase==='battle'){paused=true;timer=0;update();}});
requestAnimationFrame(frame);
