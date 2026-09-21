import { SIZE, DEFAULTS } from './config.js?v=9.1';
import { key, xy, inside, createState, pathFrom, coverage, fireField, funds, placementError, validateSources, stepBattle, wallPreview, changeWall, validateParams, inControl, rebuildFields, fieldFor, sourceTarget, liveTarget, enemyKey, repairQuote, outpostError, buildOutpost, removeOutpost, enterMorning } from './model.js?v=9.1';
const $ = id => document.getElementById(id);
const canvas = $('map'), ctx = canvas.getContext('2d'), viewport = $('viewport');
let state = createState(), tool = 'wall', hover = null, dragging = null;
let zoom = 1, base = 20, panX = 0, panY = 0, width = 0, height = 0;
let fire = fireField(state), paused = false, timer = 0, last = 0;
let messages = [], preparation = null;
const canBuildWeapon = () => ['build','battle'].includes(state.phase);
let motion = null, impactAge = 1000, incoming = new Map();
const MOVE_MS = 160, IMPACT_MS = 220;
const colors = ['#df9989', '#a6a1e9', '#d5bd79', '#78bcd3'];
const notify = message => { $('notice').textContent = message; };
const weaponType = () => tool === 'long' ? 'B' : 'A';
const selectedWeapon = () => previewParams().weapons[weaponType()];
const paramsDirty = () => JSON.stringify(readParams()) !== JSON.stringify(state.params);
function previewParams() {
  const draft = readParams();
  return state.phase === 'build' && !validateParams(draft,state,false) ? draft : state.params;
}


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
  const controlState={...state,params:previewParams()};
  const controlRadius = controlState.params.controlRadius;
  const wallEdit = hover !== null && state.phase === 'build' && (tool==='wall'||(tool==='erase'&&!state.towers.has(hover)));
  const candidate = wallEdit ? wallPreview(state,hover,tool==='erase') : null;
  const postHover=hover!==null&&state.phase==='build'&&['outpost','repair'].includes(tool);
  const postError=postHover?(paramsDirty()?'请先应用或取消参数预览。':outpostError(state,hover,tool==='repair')):'';
  const postGhost=postHover&&!postError;
  const previewState=postGhost&&hover!==state.camp?{...state,outposts:new Map([...state.outposts,[hover,{hp:state.params.outpostHP,max:state.params.outpostHP}]])}:state;
  const routeState=postGhost?{...previewState}:candidate&&!candidate.error?{...state,field:candidate.field,fields:candidate.fields}:state;
  if(postGhost)rebuildFields(routeState);
  const sourcePath=source=>pathFrom(key(source.x,source.y),fieldFor(routeState,sourceTarget(routeState,source)));
  const weaponHover=hover!==null&&canBuildWeapon()&&['build','long'].includes(tool);
  const weapon=selectedWeapon();
  const previewError=weaponHover ? (paramsDirty()?'请先应用或取消实验参数预览。':placementError(state,hover,weaponType())) : '';
  const ghost=weaponHover&&!previewError;
  const added=new Set(ghost?coverage(hover,weapon.range,weapon.shape):[]);
  // 只预览本次建设的确定变化，不模拟整波胜负。
  $('placementInfo').textContent=weaponHover ? (previewError||`建造预览 · 每格火力 +${weapon.power} · 花费 ${weapon.cost} · 建造后剩余 ${funds(state)-weapon.cost}`) : '';


  if(postHover)$('placementInfo').textContent=postError||`${tool==='repair'?'修复':'建设'}预览 · ${Array.from({length:SIZE*SIZE},(_,id)=>id).filter(id=>inControl(previewState,id)&&!inControl(state,id)).length} 格恢复或新增控制 · 花费 ${tool==='repair'?repairQuote(state,hover).cost:state.params.outpostCost}${tool==='repair'?` · 恢复 ${repairQuote(state,hover).missing} HP`:''}`;

  ctx.save(); ctx.translate(panX, panY); ctx.scale(size, size);
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
    const id = key(x, y), power = fire.get(id) || 0;
    ctx.fillStyle = (x + y) % 2 ? '#1b2a2d' : '#1e2d30';
    ctx.fillRect(x, y, 1, 1);
    if ($('heat').checked && power) { ctx.fillStyle = `rgba(99,211,166,${Math.min(.6,.17 + power * .045)})`; ctx.fillRect(x, y, 1, 1); }
    if (state.walls.has(id)) {
      ctx.fillStyle = state.playerWalls.has(id) ? '#617e72' : '#455055'; ctx.fillRect(x + .05, y + .05, .9, .9);
      ctx.strokeStyle = state.playerWalls.has(id) ? '#b3d0ac' : '#5a6569'; ctx.lineWidth = .045; ctx.beginPath(); ctx.moveTo(x + .15, y + .8); ctx.lineTo(x + .8, y + .15); ctx.stroke();
    }
    if(postGhost&&inControl(previewState,id)&&!inControl(state,id)){ctx.fillStyle='#f0d18b66';ctx.fillRect(x,y,1,1);}
    if(state.lostControl.has(id)){ctx.fillStyle='#dc686638';ctx.fillRect(x,y,1,1);}
    if (!inControl(controlState,id,controlRadius)) {ctx.fillStyle='#07121577';ctx.fillRect(x,y,1,1);}
    else {
      ctx.fillStyle='#7fc8e810';ctx.fillRect(x,y,1,1);
      // 控制范围不等于建造格：只标出当前工具符合地形条件的位置。
      const eligible = tool==='wall' ? !state.walls.has(id)&&!state.outposts.has(id)&&id!==state.camp&&!state.sources.some(a=>key(a.x,a.y)===id) : ['build','long'].includes(tool)&&state.walls.has(id)&&!state.towers.has(id);
      if((state.phase==='build'||(state.phase==='battle'&&['build','long'].includes(tool)))&&eligible){ctx.fillStyle='#a9d4cb55';ctx.fillRect(x+.46,y+.46,.08,.08);}
      ctx.strokeStyle='#86ccea';ctx.lineWidth=.08;ctx.setLineDash([.16,.12]);ctx.beginPath();
      for(const [dx,dy,a,b,c,d] of [[-1,0,x,y,x,y+1],[1,0,x+1,y,x+1,y+1],[0,-1,x,y,x+1,y],[0,1,x,y+1,x+1,y+1]]) {
        if(!inside(x+dx,y+dy)||!inControl(controlState,key(x+dx,y+dy),controlRadius)){ctx.moveTo(a,b);ctx.lineTo(c,d);}
      }
      ctx.stroke();ctx.setLineDash([]);
    }
    ctx.strokeStyle = '#324044'; ctx.lineWidth = .025; ctx.strokeRect(x, y, 1, 1);
  }
  if ($('routes').checked || wallEdit || postGhost) state.sources.forEach((source, index) => {
    const path = sourcePath(source);
    ctx.strokeStyle = colors[index % colors.length]; ctx.globalAlpha = .58; ctx.lineWidth = .075;
    ctx.beginPath(); path.forEach((id, i) => { const [x,y] = xy(id), offset = (index % 3 - 1) * .12; if (!i) ctx.moveTo(x + .5 + offset,y + .5); else ctx.lineTo(x + .5 + offset,y + .5); }); ctx.stroke();
    for (let i = 1; i < path.length; i += 4) {
      const [x,y] = xy(path[i]), [nx,ny] = xy(path[Math.min(i + 1,path.length - 1)]);
      ctx.save(); ctx.translate(x+.5,y+.5); ctx.rotate(Math.atan2(ny-y,nx-x)); ctx.beginPath(); ctx.moveTo(-.15,-.16); ctx.lineTo(.1,0); ctx.lineTo(-.15,.16); ctx.stroke(); ctx.restore();
    }
    ctx.globalAlpha = 1;
  });
  if (hover !== null && (state.phase === 'build' || weaponHover)) {
    const isWeapon = ['build','long'].includes(tool), weapon = selectedWeapon();
    const error = isWeapon ? previewError : postHover?postError:candidate?.error;
    for (const id of isWeapon ? coverage(hover,weapon.range,weapon.shape) : [hover]) {
      const [x,y] = xy(id); ctx.fillStyle = error ? '#ff776644' : '#92ffd43b'; ctx.fillRect(x,y,1,1);
    }
    if(ghost){
      ctx.strokeStyle='#d8f9a8';ctx.lineWidth=.07;ctx.setLineDash([.15,.1]);ctx.beginPath();
      for(const id of added){const [x,y]=xy(id);for(const [dx,dy,a,b,c,d] of [[-1,0,x,y,x,y+1],[1,0,x+1,y,x+1,y+1],[0,-1,x,y,x+1,y],[0,1,x,y+1,x+1,y+1]]){
        if(!inside(x+dx,y+dy)||!added.has(key(x+dx,y+dy))){ctx.moveTo(a,b);ctx.lineTo(c,d);}
      }}ctx.stroke();ctx.setLineDash([]);
      // 提亮覆盖到的路线格，不把路线总长度误当作实际伤害。
      ctx.strokeStyle='#e5ef9b';ctx.lineWidth=.055;
      for(const id of new Set(state.sources.flatMap(sourcePath)))if(added.has(id)){
        const [x,y]=xy(id);ctx.strokeRect(x+.12,y+.12,.76,.76);
      }
    }
    const [x,y] = xy(hover); ctx.strokeStyle = error ? '#ff8078' : '#d8f9e8'; ctx.lineWidth = .08; ctx.strokeRect(x+.04,y+.04,.92,.92);
  }
  const label = (text,x,y,color,font=.4) => {ctx.fillStyle=color;ctx.font=`600 ${font}px system-ui`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,x,y);};
  for (const id of new Set([...($('heat').checked?fire.keys():[]),...added])) {
    const [x,y]=xy(id), changed=added.has(id);
    if(!state.walls.has(id)) label((fire.get(id)||0)+(changed?weapon.power:0),x+.5,y+.5,changed?'#f0ffad':'#b8f1d3',changed?.43:.35);
  }
  for (const [id,type] of [...state.towers,...(ghost?[[hover,weaponType()]]:[])]) {
    ctx.save();if(ghost&&id===hover)ctx.globalAlpha=.5;
    const [x,y] = xy(id); ctx.fillStyle=type==='B'?'#bab3f2':'#8bdbb9'; ctx.fillRect(x+.18,y+.22,.64,.6); ctx.fillStyle='#28483b'; ctx.fillRect(x+.37,y+.32,.26,.38); ctx.fillStyle='#ddffe7'; ctx.fillRect(x+.43,y+.08,.14,.35);if(type==='B'){ctx.fillRect(x+.22,y+.12,.12,.34);ctx.fillRect(x+.66,y+.12,.12,.34);}
    ctx.restore();
  }
  for(const [id,p] of previewState.outposts){
    const [x,y]=xy(id);ctx.save();if(postGhost&&id===hover)ctx.globalAlpha=.5;
    ctx.fillStyle=p.hp>0?'#8ecbe5':'#85645b';ctx.fillRect(x+.16,y+.3,.68,.6);
    ctx.fillRect(x+.45,y+.05,.08,.5);ctx.fillRect(x+.53,y+.05,.32,.22);ctx.restore();
  }
  state.sources.forEach((s,i) => {ctx.fillStyle=colors[i%colors.length];ctx.fillRect(s.x+.08,s.y+.08,.84,.84);label(i+1,s.x+.5,s.y+.5,'#23262b',.52);});
  const [cx,cy] = xy(state.camp); ctx.fillStyle='#ffc17c';ctx.beginPath();ctx.moveTo(cx+.5,cy+.06);ctx.lineTo(cx+.9,cy+.7);ctx.lineTo(cx+.5,cy+.95);ctx.lineTo(cx+.1,cy+.7);ctx.closePath();ctx.fill();label('火',cx+.5,cy+.59,'#402c24',.42);
  const impact = Math.min(1,impactAge/IMPACT_MS);
  // 移动阶段仍显示出发时的生命，抵达后才展示结算结果。
  const drawEnemy = (enemy,x,y,scale=1,alpha=1,barHP=enemy.hp) => {
    const occupants=(motion?motion.actors:state.enemies).filter(e=>e.id===enemy.id);
    if(occupants.length>1){const slot=Math.max(0,occupants.findIndex(e=>e.target===enemy.target));x+=(slot%2? .23:-.23);y+=Math.floor(slot/2)*.3;scale*=.55;}
    ctx.save();ctx.globalAlpha=alpha;ctx.translate(x+.5,y+.5);ctx.scale(scale,scale);ctx.translate(-.5,-.5);
    ctx.fillStyle=enemy.members>1?'#ffb079':'#f28780';ctx.fillRect(.04,.06,.92,.83);
    label(enemy.hp,.5,.42,'#321d23',.46);ctx.fillStyle='#552b30';ctx.fillRect(.08,.73,.84,.1);ctx.fillStyle='#fff1c4';ctx.fillRect(.08,.73,.84*Math.max(0,Math.min(1,barHP/enemy.max)),.1);
    if(enemy.members>1){ctx.strokeStyle='#ffe6b9';ctx.lineWidth=.07;ctx.strokeRect(.04,.06,.92,.83);}
    ctx.restore();
  };
  if(motion){
    const t=Math.min(1,motion.elapsed/MOVE_MS), eased=t*t*(3-2*t);
    for(const enemy of motion.actors){const [x,y]=xy(enemy.id),[tx,ty]=xy(enemy.to);drawEnemy(enemy,x+(tx-x)*eased,y+(ty-y)*eased);}
  } else {
    for(const enemy of state.enemies){
      const [x,y]=xy(enemy.id), before=incoming.get(enemyKey(enemy))?.hp ?? enemy.hp;
      const merged=state.events.some(e=>e.type==='merge'&&e.id===enemy.id&&e.target===enemy.target);
      drawEnemy(enemy,x,y,merged?1+.16*Math.sin(impact*Math.PI):1,1,before+(enemy.hp-before)*impact);
    }
    if(impact<1)for(const event of state.events){
      const [x,y]=xy(event.id);
      if(event.type==='kill'){const old=incoming.get(`${event.id}:${event.target}`);if(old)drawEnemy({...old,hp:0},x,y,1-.7*impact,1-impact,0);}
      if(event.type==='leak'){ctx.fillStyle=`rgba(255,100,80,${.6*(1-impact)})`;ctx.fillRect(x-.25,y-.25,1.5,1.5);}
      ctx.strokeStyle=event.type==='merge'?'#ffe0a1':'#ffbbb0';ctx.lineWidth=.075;ctx.strokeRect(x+.01,y+.01,.98,.98);
      if(event.type==='merge'||event.type==='hit') {
        const text=event.type==='merge'?`合流 ${event.value}`:`−${event.value}`;
        ctx.font='600 .43px system-ui';ctx.textAlign='center';ctx.textBaseline='bottom';ctx.lineWidth=.12;ctx.strokeStyle='#142024';ctx.strokeText(text,x+.5,y-.05-impact*.3);ctx.fillStyle=event.type==='merge'?'#ffe0a1':'#ffb1a3';ctx.fillText(text,x+.5,y-.05-impact*.3);
      }
    }
  }
  ctx.restore();
  // 篝火血量最后绘制，固定屏幕字号，避免缩放后难以辨认或被敌群遮挡。
  const campX=panX+(cx+.5)*size, campY=panY+cy*size-25;
  ctx.fillStyle='#11191cee';ctx.fillRect(campX-31,campY,62,23);
  ctx.font='600 11px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle='#ffe0b7';
  ctx.fillText(`${Math.max(0,state.hp)} / ${state.params.campHP}`,campX,campY+8);
  ctx.fillStyle='#553a32';ctx.fillRect(campX-27,campY+17,54,4);
  ctx.fillStyle='#ffc17c';ctx.fillRect(campX-27,campY+17,54*Math.max(0,state.hp)/state.params.campHP,4);
  for(const [id,p] of state.outposts){
    const [x,y]=xy(id),sx=panX+(x+.5)*size,sy=panY+y*size-21;
    ctx.fillStyle='#11191cee';ctx.fillRect(sx-33,sy,66,20);ctx.fillStyle=p.hp>0?'#bce8fb':'#ffaca0';
    ctx.fillText(p.hp>0?`${p.hp}/${p.max}`:'废墟',sx,sy+7);
    ctx.fillStyle='#553a32';ctx.fillRect(sx-28,sy+15,56,3);ctx.fillStyle='#8ecbe5';ctx.fillRect(sx-28,sy+15,56*p.hp/p.max,3);
  }
  ctx.textBaseline='alphabetic';
  // 坐标标记帮助修改源头；屏幕字号不随棋盘缩小。
  ctx.font='10px system-ui';ctx.textAlign='center';ctx.fillStyle='#81999c';
  for(let i=0;i<SIZE;i+=5){ctx.fillText(i,panX+(i+.5)*size,panY-8);ctx.fillText(i,panX-14,panY+(i+.65)*size);}
  $('zoom').textContent = `${Math.round(zoom * 100)}%`;
  if (hover !== null) {
    const [x,y] = xy(hover), enemy = state.enemies.find(e=>e.id===hover);
    $('cellInfo').textContent = `格子 (${x}, ${y}) · ${inControl(controlState,hover,controlRadius)?'控制范围内':'控制范围外'} · 火力 ${fire.get(hover)||0} · ${state.walls.has(hover)?'不可通行':'可通行'}${state.towers.has(hover)?` · 武器 ${state.towers.get(hover)}`:''}${enemy?` · 敌群 ${enemy.hp}/${enemy.max}（${Math.round(enemy.hp/enemy.max*100)}%） · ${enemy.members} 批`:''}`;
    const post=state.outposts.get(hover);if(post)$('cellInfo').textContent+=` · 前哨 ${post.hp}/${post.max}`;
    if(state.lostControl.has(hover))$('cellInfo').textContent+=' · 今晚失控，无收益资格';
    const groups=state.enemies.filter(e=>e.id===hover);if(groups.length)$('cellInfo').textContent+=groups.map(e=>` · ${e.hp}/${e.max} → ${e.target===state.camp?'火光':`前哨(${xy(e.target)})`}`).join('');
    if(candidate) $('cellInfo').textContent += candidate.error ? ` · ${candidate.error}` : ' · 新路线预览（点击后生效）';
  } else $('cellInfo').textContent = '单击建造 · 拖动平移 · 滚轮缩放 · 悬停看生命';
}
function update() {
  fire = fireField({...state,params:previewParams()});
  const w=selectedWeapon();
  $('toolInfo').textContent = ['build','long'].includes(tool) ? `${weaponType()==='A'?'近防炮':'远防炮'} · ${w.cost} 资金 · ${w.shape==='square'?'方形':'菱形'}范围 ${w.range} · 火力 ${w.power}。仅架设在墙上。` : tool==='wall' ? `每格墙 ${state.params.wallCost} 资金。仅限控制范围内空地；悬停预览路线。` : `点击拆除并全额退款：有炮台先拆炮，再点拆自建墙。固定墙不可拆；防守中不可拆除。`;
  if(tool==='outpost')$('toolInfo').textContent=`前哨 ${state.params.outpostCost} 资金 · HP ${state.params.outpostHP} · 范围 ${state.params.outpostRadius}。建于已有控制区空地；无攻击能力，会成为目标。`;
  if(tool==='repair')$('toolInfo').textContent=`次日点击受损火光、前哨或废墟，一次修满。前哨每 HP ${state.params.repairCost} 钱，火光每 HP ${state.params.campRepairCost} 钱；悬停查看总价。失控前哨可原址修复。`;
  $('budget').textContent = funds(state); $('tick').textContent = state.tick;
  $('campHP').textContent = `HP ${Math.max(0,state.hp)} / ${state.params.campHP}`; $('campBar').style.width = `${Math.max(0,state.hp)/state.params.campHP*100}%`;
  $('spawned').textContent = `${state.spawned} / ${state.sources.reduce((n,s)=>n+s.count,0)}`;
  const active = state.phase === 'battle', build = state.phase === 'build';
  $('phase').textContent = build ? (state.day===2?'次日建设':'第一天建设') : active ? (paused ? '防守暂停' : '防守进行中') : state.phase === 'won' ? '守住了' : '篝火熄灭';
  $('start').disabled = state.day===2 || (!build && !active && state.phase!=='won'); $('step').disabled = !active || !paused || !!motion?.singleStep;
  $('start').textContent = active ? (paused ? '继续防守' : '暂停') : state.day===2?'单晚实验已完成':build?'开始防守':state.phase==='won'?'进入次日 · 修复':'防守结束';
  for (const id of ['build','long','wall','outpost','repair','erase','apply','addSource','applyParams','cancelParams','defaults']) $(id).disabled = !build;
  // 通用建造交互：不足价即禁用，退款或应用参数后立即恢复。
  for(const [id,cost] of [['wall',state.params.wallCost],['build',state.params.weapons.A.cost],['long',state.params.weapons.B.cost],['outpost',state.params.outpostCost]]){
    const short=funds(state)<cost;
    const allowed=build||(active&&['build','long'].includes(id));
    $(id).disabled=!allowed||short;
    $(id).title=!allowed?'防守中不能建设':short?`资金不足：需要 ${cost}，现有 ${funds(state)}`:`花费 ${cost} 资金`;
  }
  const repairPrices=[state.camp,...state.outposts.keys()].map(id=>repairQuote(state,id)).filter(q=>q.missing>0);
  $('repair').disabled=!build||state.day!==2||!repairPrices.some(q=>q.cost<=funds(state));
  $('repair').title=state.day!==2?'次日才能修复':!repairPrices.length?'没有受损设施':`修满最低需要 ${Math.min(...repairPrices.map(q=>q.cost))} 钱`;
  for(const id of ['apply','addSource','applyParams','cancelParams','defaults'])$(id).disabled=!build||state.day===2;
  document.querySelectorAll('#sources input, #sources select, #sources button, #params input, #params select').forEach(el=>el.disabled=!build||state.day===2);
  $('result').textContent = build ? '修改位置后再试。敌人不攻击武器与障碍。' : `${state.phase === 'won' ? '防守成功' : state.phase === 'lost' ? '防守失败' : '防守中'} · 削减 ${state.damage} · 漏过 ${state.leaked} · 合并 ${state.merges} 次 · 击杀收入 ${state.earned}`;
  if(state.day===2)$('result').textContent=`次日恢复实验 · 上一晚失控 ${state.lostControl.size} 格（不含仍有重叠覆盖的地块）。击杀收入 ${state.earned} 已入账；尚无经营收入。可修复或重试第一晚。`;
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
    const wrap=document.createElement('label');wrap.textContent='攻击目标';const select=document.createElement('select');select.name='target';select.setAttribute('aria-label',`源头${i+1} 攻击目标`);
    for(const [value,name] of [[-2,'自动：出生时最近'],[-1,'火光'],...[...state.outposts.keys()].map(id=>[id,`前哨 (${xy(id)})`])]){const option=document.createElement('option');option.value=value;option.textContent=name;select.append(option);}
    select.value=s.target??-2;wrap.append(select);fields.append(wrap);
    card.append(fields);$('sources').append(card);
  });
}
function readSources(){return [...document.querySelectorAll('.source')].map(card=>Object.fromEntries([...card.querySelectorAll('input,select')].map(input=>[input.name,input.value.trim()===''?NaN:Number(input.value)])));}
// 小型参数面板：仅编辑当前实验，默认值仍保留在 config.js。
function paramsEditor(params) {
  $('params').replaceChildren();
  function fields(title, values, prefix, specs) {
    const h=document.createElement('h3');h.textContent=title;$('params').append(h);
    const row=document.createElement('div');row.className='fields';
    for(const [name,label,min,max] of specs){
      const wrap=document.createElement('label');wrap.textContent=label;
      const input=document.createElement(name==='shape'?'select':'input');
      if(name==='shape')for(const [value,text] of [['square','方形'],['diamond','菱形']]){const option=document.createElement('option');option.value=value;option.textContent=text;input.append(option);}
      else{input.type='number';input.min=min;input.max=max;input.step=1;}
      input.value=values[name];input.dataset.param=prefix+name;input.setAttribute('aria-label',`${title} ${label}`);
      input.addEventListener('input',refreshParams);wrap.append(input);row.append(wrap);
    }
    $('params').append(row);
  }
  fields('全局',params,'',[['budget','资金',0,10000],['wallCost','墙价',1,1000],['controlRadius','控制半径',1,30],['campHP','篝火耐久',1,10000],['campRepairCost','火光修复单价/HP',1,1000]]);
  fields('前哨',params,'',[['outpostCost','造价',1,1000],['outpostHP','耐久',1,10000],['outpostRadius','半径',1,30],['repairCost','修复单价/HP',1,1000]]);
  for(const type of ['A','B'])fields(`武器 ${type}`,params.weapons[type],type+'.',[['shape','范围形状'],['range','半径',1,8],['power','火力',1,99],['cost','价格',1,1000]]);
}
function readParams() {
  const result=structuredClone(state.params);
  for(const input of document.querySelectorAll('[data-param]')){
    const parts=input.dataset.param.split('.'), name=parts.at(-1);
    const value=name==='shape'?input.value:input.value.trim()===''?NaN:Number(input.value);
    if(parts.length===1)result[name]=value;else result.weapons[parts[0]][name]=value;
  }
  return result;
}
function refreshParams(){
  const error=validateParams(readParams(),state);
  $('paramStatus').textContent=error || (paramsDirty()?'正在预览未应用参数，建设与开战前请应用。':'当前参数已应用。');
  update();
}
function reset(keep=true){
  // 重试恢复开战前快照，收入和夜间补炮一起撤销，避免刷钱或负预算。
  const baseState=keep&&preparation?preparation:state;
  state=createState(keep?baseState.sources:state.sources.map(s=>({...s,target:-2})),keep?baseState.towers:new Map(),keep?baseState.playerWalls:new Set(),baseState.params,keep?baseState.outposts:new Map());
  preparation=null;document.querySelectorAll('.coin-drop').forEach(el=>el.remove());
  paused=false;timer=0;motion=null;impactAge=1000;incoming.clear();messages=[];$('log').replaceChildren();sourceEditor(state.sources);paramsEditor(state.params);refreshParams();
  notify(keep?'已恢复战前布局与资金；撤销本晚收入及战斗中的建设。':'已清空墙、炮台和前哨，资金全部返还，目标恢复自动。');
}
for(const id of ['wall','build','long','outpost','repair','erase'])$(id).onclick=()=>{
  tool=id;for(const button of ['wall','build','long','outpost','repair','erase'])$(button).classList.toggle('selected',button===id);update();
};
$('retry').onclick=()=>reset();$('clear').onclick=()=>reset(false);
$('applyParams').onclick=()=>{
  if(state.phase!=='build'||state.day===2)return;
  const params=readParams(),error=validateParams(params,state);$('paramStatus').textContent=error;if(error)return;
  state=createState(state.sources,state.towers,state.playerWalls,params,state.outposts);paused=false;timer=0;motion=null;impactAge=1000;incoming.clear();messages=[];$('log').replaceChildren();
  paramsEditor(state.params);refreshParams();notify('参数已应用，本轮已重置，墙、炮台与前哨保留。');
};
$('cancelParams').onclick=()=>{paramsEditor(state.params);refreshParams();};
$('defaults').onclick=()=>{paramsEditor(DEFAULTS);refreshParams();notify('已填入默认值，点击应用后生效。');};
$('apply').onclick=()=>{
  if(state.phase!=='build'||state.day===2)return;
  if(paramsDirty()){notify('请先应用或取消实验参数预览。');return;}
  const sources=readSources(),error=validateSources(sources,state);$('configError').textContent=error;if(error)return;
  state=createState(sources,state.towers,state.playerWalls,state.params,state.outposts);motion=null;impactAge=1000;incoming.clear();messages=[];$('log').replaceChildren();sourceEditor(sources);notify('来袭配置已应用，路线已更新。');update();
};
$('addSource').onclick=()=>{const sources=readSources();if(sources.length>=12){$('configError').textContent='最多 12 个源头。';return;}sources.push({x:1,y:1,hp:12,count:4,first:1,interval:6,target:-2});sourceEditor(sources);};
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
  if(state.phase!=='build'&&!(state.phase==='battle'&&['build','long'].includes(tool))){notify('防守中只能在已有墙上补炮，不能造墙、修复或拆除。');return;}
  if(paramsDirty()){notify('请先应用或取消实验参数预览，再修改布局。');return;}
  if(['outpost','repair'].includes(tool)){
    const error=buildOutpost(state,id,tool==='repair');notify(error||(tool==='repair'?'设施已修满，按缺失 HP 扣费。':'前哨已建立；默认自动目标会选择出生时最近的控制站。'));
    if(!error)sourceEditor(readSources());
  } else if(tool==='wall'){
    const error=changeWall(state,id);notify(error||'墙已建造，路线已更新。');
  } else if(tool==='erase'){
    const type=state.towers.get(id);
    if(type){state.towers.delete(id);notify(`炮台已拆除，返还 ${state.params.weapons[type].cost} 资金，墙体保留。`);}
    else if(state.outposts.has(id)){const error=removeOutpost(state,id);notify(error||'前哨已撤销，资金返还。');if(!error)sourceEditor(readSources());}
    else if(state.walls.has(id)){const error=changeWall(state,id,true);notify(error||`自建墙已拆除，返还 ${state.params.wallCost} 资金，路线已更新。`);}
    else notify('这里没有可拆除的设施。');
  } else {
    const type=weaponType(),error=placementError(state,id,type);
    if(error)notify(error);else{state.towers.set(id,type);notify(`武器 ${type} 已架设，覆盖格火力 +${state.params.weapons[type].power}。`);}
  }
  update();
});
canvas.addEventListener('pointercancel',()=>{dragging=null;});
canvas.addEventListener('lostpointercapture',()=>{dragging=null;});
canvas.addEventListener('pointerleave',()=>{hover=null;draw();});
new ResizeObserver(()=>resize()).observe(viewport);
paramsEditor(state.params);sourceEditor(state.sources);resize(true);refreshParams();

// 金币立即入账；弹出并飞向资金栏只是反馈，不要求点击，也不阻挡暂停和补炮。
function showCoins(id, amount) {
  const [x,y]=xy(id), rect=canvas.getBoundingClientRect(), target=$('budget').getBoundingClientRect();
  const sx=rect.left+panX+(x+.5)*base*zoom, sy=rect.top+panY+(y+.5)*base*zoom;
  const coin=document.createElement('span');coin.className='coin-drop';coin.textContent=`● +${amount}`;coin.setAttribute('aria-hidden','true');
  coin.style.left=`${sx}px`;coin.style.top=`${sy}px`;document.body.append(coin);
  const dx=target.left+target.width/2-sx, dy=target.top+target.height/2-sy;
  const animation=coin.animate([{transform:'translate(-50%,-50%) scale(.6)',opacity:0},{transform:'translate(-50%,calc(-50% - 24px)) scale(1.15)',opacity:1,offset:.3},{transform:`translate(calc(-50% + ${dx}px),calc(-50% + ${dy}px)) scale(.7)`,opacity:0}],{duration:900,easing:'ease-in-out'});
  animation.onfinish=()=>coin.remove();
  $('budget').animate([{color:'#fff4a3',transform:'scale(1.15)'},{color:'#b8e4c8',transform:'scale(1)'}],{duration:500});
}

// 只记录当前波次的近期反馈，不建设存档或回放系统。
function advance() {
  stepBattle(state);
  motion=null;impactAge=0;timer=0;
  for (const event of state.events) {
    const [x,y] = xy(event.id);
    const text = event.type==='postLost'?`前哨 (${x},${y}) 失守，独占区域失控`:event.type==='postHit'?`前哨 (${x},${y}) 受到 ${event.value} 点伤害`:event.type === 'merge' ? `(${x},${y}) ${event.members} 批合流 → ${event.value}` : event.type === 'leak' ? `篝火受到 ${event.value} 点伤害` : event.type === 'kill' ? `(${x},${y}) 消灭 ${event.value} 批敌人，+${event.value} 资金` : `(${x},${y}) 火力削减 ${event.value}`;
    if(event.type==='kill')showCoins(event.id,event.value);
    messages.unshift(`第 ${state.tick} 拍 · ${text}`);
  }
  messages = messages.slice(0,8); $('log').replaceChildren(...messages.map(text=>{const li=document.createElement('li');li.textContent=text;return li;}));
  if (state.phase === 'won') notify('火光守住了。进入次日检查失控区域并修复前哨，或重试第一晚。');
  if (state.phase === 'lost') notify('篝火熄灭。看看合流之前是否还有更好的覆盖位置。');
  update();
}
$('start').onclick=()=>{
  if(enterMorning(state)){motion=null;update();notify('进入次日。失控前哨可原址修复；本轮不开放第二晚。');return;}
  if(state.day===2)return;
  if(state.phase==='battle'){paused=!paused;timer=0;update();return;}
  if(state.phase!=='build'||state.day===2)return;
  if(paramsDirty()){ $('experiments').open=true;notify('实验参数有未应用修改，请先应用或取消预览。');return; }
  if(JSON.stringify(readSources())!==JSON.stringify(state.sources)){ $('configError').textContent='来袭配置有未应用修改，请先应用配置。';$('settings').open=true;notify('请先应用来袭配置，确保预览与实际波次一致。');return; }
  const error=validateSources(state.sources,state);if(error){notify(error);return;}
  preparation=createState(state.sources,state.towers,state.playerWalls,state.params,state.outposts);
  state.phase='battle';paused=false;timer=0;last=performance.now();$('settings').open=false;notify('敌人正在接近。击杀自动获得资金；可暂停补炮，不能造墙或拆除。');update();
};
// 简单的逐格滑动：动画结束才提交一步战斗，无独立动画框架。
function beginMotion(singleStep=false){
  if(motion||state.phase!=='battle')return;
  motion={elapsed:0,singleStep,actors:state.enemies.map(e=>{const target=liveTarget(state,e.target);return {...e,target,to:fieldFor(state,target).next.get(e.id)??e.id};})};
  incoming=new Map();
  const add=(id,e)=>{const groupId=enemyKey({...e,id});const old=incoming.get(groupId);if(old){old.hp+=e.hp;old.max+=e.max;old.members+=e.members;}else incoming.set(groupId,{...e,id});};
  for(const e of motion.actors)add(e.to,e);
  for(const source of state.sources){const age=state.tick+1-source.first;if(age>=0&&age%source.interval===0&&age/source.interval<source.count)add(key(source.x,source.y),{hp:source.hp,max:source.hp,members:1,target:sourceTarget(state,source)});}
  update();
}
$('step').onclick=()=>{if(state.phase!=='battle'||!paused)return;if(motion){motion.singleStep=true;update();}else beginMotion(true);};
// 移动占一个节拍的后 160ms；加速同步缩短动画，暂停冻结自动移动。
function frame(now){
  const elapsed=Math.min(now-last,100);last=now;
  const dt=elapsed*Number($('speed').value);
  if(impactAge<IMPACT_MS){impactAge=Math.min(IMPACT_MS,impactAge+dt);draw();}
  if(state.phase==='battle'&&(!paused||motion?.singleStep)){
    if(motion){motion.elapsed+=dt;if(motion.elapsed>=MOVE_MS)advance();else draw();}
    else{timer+=dt;if(timer>=DEFAULTS.stepMs-MOVE_MS)beginMotion();}
  }
  requestAnimationFrame(frame);
}
document.addEventListener('visibilitychange',()=>{if(document.hidden&&state.phase==='battle'){paused=true;if(motion)motion.singleStep=false;timer=0;update();}});
requestAnimationFrame(frame);
