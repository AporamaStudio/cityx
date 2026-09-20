import { SIZE, DEFAULTS } from './config.js';
import { key, xy, inside, createState, pathFrom, coverage, fireField, funds, placementError, validateSources } from './model.js';
const $ = id => document.getElementById(id);
const canvas = $('map'), ctx = canvas.getContext('2d'), viewport = $('viewport');
let state = createState(), tool = 'build', hover = null, dragging = null;
let zoom = 1, base = 20, panX = 0, panY = 0, width = 0, height = 0;
let fire = fireField(state), paused = false, timer = 0, last = 0;
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
  for(const event of state.events){const [x,y]=xy(event.id);ctx.strokeStyle=event.type==='merge'?'#ffe0a1':'#ffbbb0';ctx.lineWidth=.075;ctx.strokeRect(x+.01,y+.01,.98,.98);}
  ctx.restore();
  $('zoom').textContent = `${Math.round(zoom * 100)}%`;
}
function update() {
  fire = fireField(state);
  $('budget').textContent = funds(state); $('tick').textContent = state.tick;
  $('campHP').textContent = `${Math.max(0,state.hp)} / ${DEFAULTS.campHP}`; $('campBar').style.width = `${Math.max(0,state.hp)/DEFAULTS.campHP*100}%`;
  $('spawned').textContent = `${state.spawned} / ${state.sources.reduce((n,s)=>n+s.count,0)}`;
  draw();
}
function sourceEditor(sources) {
  $('sources').replaceChildren();
  sources.forEach((s,i)=>{
    const card=document.createElement('div');card.className='source';
    const head=document.createElement('div');head.className='source-head';head.textContent=`源头 ${i+1}`;
    const remove=document.createElement('button');remove.textContent='删除';remove.onclick=()=>{card.remove();};head.append(remove);card.append(head);
    const fields=document.createElement('div');fields.className='fields';
    for(const [name,label,max] of [['x','X',29],['y','Y',29],['hp','生命',999],['count','批数',30],['first','首拍',200],['interval','间隔',100]]){
      const wrap=document.createElement('label');wrap.textContent=label;const input=document.createElement('input');input.type='number';input.name=name;input.value=s[name];input.min=['x','y'].includes(name)?0:1;input.max=max;input.step=1;input.setAttribute('aria-label',`源头${i+1} ${label}`);wrap.append(input);fields.append(wrap);
    }
    card.append(fields);$('sources').append(card);
  });
}
function readSources(){return [...document.querySelectorAll('.source')].map(card=>Object.fromEntries([...card.querySelectorAll('input')].map(input=>[input.name,input.value.trim()===''?NaN:Number(input.value)])));}
function reset(keep=true){state=createState(structuredClone(state.sources),keep?state.towers:new Set());paused=false;timer=0;notify(keep?'已恢复篝火与敌人，保留布局，可继续调整。':'已清空布局，预算全部返还。');update();}
$('build').onclick=()=>{tool='build';$('build').classList.add('selected');$('erase').classList.remove('selected');draw();};
$('erase').onclick=()=>{tool='erase';$('erase').classList.add('selected');$('build').classList.remove('selected');draw();};
$('retry').onclick=()=>reset();$('clear').onclick=()=>reset(false);
$('apply').onclick=()=>{if(state.phase!=='build')return;const sources=readSources(),error=validateSources(sources,state);$('configError').textContent=error;if(error)return;state=createState(sources,state.towers);sourceEditor(sources);notify('来袭配置已应用，路线已更新。');update();};
$('addSource').onclick=()=>{const sources=readSources();if(sources.length>=12){$('configError').textContent='最多 12 个源头。';return;}sources.push({x:1,y:1,hp:12,count:4,first:1,interval:6});sourceEditor(sources);};
$('fit').onclick=()=>resize(true);$('in').onclick=()=>changeZoom(1.25);$('out').onclick=()=>changeZoom(.8);$('routes').onchange=draw;$('heat').onchange=draw;
canvas.addEventListener('contextmenu',e=>e.preventDefault());
canvas.addEventListener('wheel',e=>{e.preventDefault();const r=canvas.getBoundingClientRect();changeZoom(e.deltaY<0?1.12:1/1.12,e.clientX-r.left,e.clientY-r.top);},{passive:false});
canvas.addEventListener('pointerdown',e=>{
  if(e.button===1||e.button===2||e.altKey){dragging={x:e.clientX,y:e.clientY};canvas.setPointerCapture(e.pointerId);return;}
  const id=cellAt(e);if(id===null)return;
  if(state.phase!=='build'){notify('战斗中不能修改布局；可暂停观察或返回布防。');return;}
  if(tool==='erase'){if(state.towers.delete(id))notify('武器已拆除，返还 10 预算。');else notify('这里没有武器。');}
  else{const error=placementError(state,id);if(error)notify(error);else{state.towers.add(id);notify('武器已部署，覆盖格火力 +2。');}}
  update();
});
canvas.addEventListener('pointermove',e=>{if(dragging){panX+=e.clientX-dragging.x;panY+=e.clientY-dragging.y;dragging={x:e.clientX,y:e.clientY};}hover=cellAt(e);if(hover!==null){const [x,y]=xy(hover);$('cellInfo').textContent=`格子 (${x}, ${y}) · 火力 ${fire.get(hover)||0} · ${state.walls.has(hover)?'不可通行':'可通行'}${state.towers.has(hover)?' · 武器 A':''}`;}draw();});
canvas.addEventListener('pointerup',()=>{dragging=null;});canvas.addEventListener('pointercancel',()=>{dragging=null;});canvas.addEventListener('pointerleave',()=>{hover=null;draw();});
new ResizeObserver(()=>resize()).observe(viewport);
sourceEditor(state.sources);resize(true);update();
