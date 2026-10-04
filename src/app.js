import { SIZE, DEFAULTS, PRODUCTION_SITES } from './config.js?v=18';
import { demolitionQuote, buildTower, removeTower, battleRoutes, productionId, productionCells, productionQuote, productionControlled, productionActive, productionSite, productionError, buildProduction, removeProduction, expectedIncome, incomeEligible, key, xy, inside, createState, createCampaign, reservedSources, campaignComplete, beginBattle, restoreNight, restartCampaign, pathFrom, coverage, fireField, funds, placementError, validateSources, stepBattle, wallPreview, changeWall, validateParams, inControl, rebuildFields, fieldFor, sourceTarget, liveTarget, enemyKey, repairQuote, outpostError, buildOutpost, removeOutpost, enterMorning } from './model.js?v=18';
const $ = id => document.getElementById(id);
const canvas = $('map'), ctx = canvas.getContext('2d'), viewport = $('viewport');
let state = createCampaign(), tool = 'wall', hover = null, dragging = null;
let zoom = 1, base = 20, panX = 0, panY = 0, width = 0, height = 0;
let fire = fireField(state), paused = false, timer = 0, last = 0;
let messages = [], preparation = null, explainedMerge = false;
const canBuildWeapon = () => ['build','battle'].includes(state.phase);
let motion = null, impactAge = 1000, incoming = new Map();
const MOVE_MS = 160, IMPACT_MS = 220;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
let placementFx = null, playbackSpeed = 1, recentGain = 0, gainUntil = 0, dawnAt = 0, receiptUntil = 0;
const colors = ['#df9989', '#a6a1e9', '#d5bd79', '#78bcd3'];
const notify = message => { $('notice').textContent = message; };
const weaponType = () => tool === 'long' ? 'B' : 'A';
const viewedSources = () => state.waves[Number($('forecastDay').value)];
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
  const wallEdit = hover !== null && state.phase === 'build' && (tool==='wall'||(tool==='erase'&&!state.towers.has(hover)&&!state.production.has(productionId(hover))));
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


  if(tool==='wall'&&candidate){
    const changed=viewedSources().some(source=>JSON.stringify(sourcePath(source))!==JSON.stringify(pathFrom(key(source.x,source.y),fieldFor(state,sourceTarget(state,source)))));
    $('placementInfo').textContent=candidate.error||`建墙预览 · 花费 ${state.params.wallCost} · ${changed?'路线将改变，地图已显示新路线':'当前预览路线不变'}。墙阻挡通行，也可架炮；不能彻底封路。`;
  }
  if(postHover)$('placementInfo').textContent=postError||`${tool==='repair'?'修复':'建设'}预览 · ${Array.from({length:SIZE*SIZE},(_,id)=>id).filter(id=>inControl(previewState,id)&&!inControl(state,id)).length} 格恢复或新增控制 · 花费 ${tool==='repair'?repairQuote(state,hover).cost:state.params.outpostCost}${tool==='repair'?` · 恢复 ${repairQuote(state,hover).missing} HP`:''}`;

  if(postGhost){
    const sites=PRODUCTION_SITES.map(p=>key(p.x,p.y)).filter(id=>!state.production.has(id)&&productionControlled(previewState,id)&&!productionControlled(state,id));
    $('placementInfo').textContent+=` · 新纳入 ${sites.length} 处生产机会：另需 ${sites.reduce((n,id)=>n+productionQuote(state,id).cost,0)} 钱恢复，可增 ${sites.reduce((n,id)=>n+productionQuote(state,id).income,0)}/晚（尚未入账）`;
  }
  if(tool==='production'&&hover!==null)$('placementInfo').textContent=productionError(state,hover)||`整块恢复预览 · 每晚收入 +${productionQuote(state,hover).income} · 花费 ${productionQuote(state,hover).cost} · 剩余 ${funds(state)-productionQuote(state,hover).cost}`;

  if(tool==='erase'&&hover!==null&&state.phase==='build'){
    const quote=demolitionQuote(state,hover);
    $('placementInfo').textContent=!quote.type?'这里没有可拆设施；固定墙与火光不可拆。':`第 ${quote.day} 天建造 · ${quote.day===state.day?'当天撤销':'旧设施清除'} · 返还 ${quote.refund} 金币${quote.type==='outpost'?'，须先解除控制与目标依赖':''}`;
  }
  const hoveredSite=hover!==null?productionSite(hover):null;
  if(hoveredSite&&!state.production.has(productionId(hover))){
    const quote=productionQuote(state,hover);
    $('placementInfo').textContent=`${hoveredSite.size}×${hoveredSite.size} 街区 · 整块恢复 ${quote.cost} 钱 · 每晚 +${quote.income}。`+(tool==='production'?(productionError(state,hover)||'点击任意位置恢复整块。'):'选择「恢复生产」后点击街区。');
  }

  ctx.save(); ctx.translate(panX, panY); ctx.scale(size, size);
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
    const id = key(x, y), power = fire.get(id) || 0;
    ctx.fillStyle = (x + y) % 2 ? '#1b2a2d' : '#1e2d30';
    ctx.fillRect(x, y, 1, 1);
    if ($('heat').checked && power) { ctx.fillStyle = `rgba(99,211,166,${Math.min(.6,.17 + power * .045)})`; ctx.fillRect(x, y, 1, 1); }
    if (state.walls.has(id)) {
      ctx.fillStyle = state.playerWalls.has(id) ? '#617e72' : '#455055'; ctx.fillRect(x + .05, y + .05, .9, .9);
      ctx.fillStyle='#0c171c77';ctx.fillRect(x+.05,y+.78,.9,.17);
      ctx.fillStyle=state.playerWalls.has(id)?'#a2b9aa':'#728187';ctx.fillRect(x+.05,y+.05,.9,.10);
      ctx.strokeStyle = state.playerWalls.has(id) ? '#b3d0ac' : '#5a6569'; ctx.lineWidth = .045; ctx.beginPath(); ctx.moveTo(x + .15, y + .8); ctx.lineTo(x + .8, y + .15); ctx.stroke();
    }
    if(postGhost&&inControl(previewState,id)&&!inControl(state,id)){ctx.fillStyle='#f0d18b66';ctx.fillRect(x,y,1,1);}
    if(state.lostControl.has(id)){ctx.fillStyle='#dc686638';ctx.fillRect(x,y,1,1);}
    if (!inControl(controlState,id,controlRadius)) {ctx.fillStyle='#07121577';ctx.fillRect(x,y,1,1);}
    else {
      ctx.fillStyle='#7fc8e810';ctx.fillRect(x,y,1,1);
      // 控制范围不等于建造格：只标出当前工具符合地形条件的位置。
      const eligible = tool==='wall' ? !productionSite(id)&&!state.walls.has(id)&&!state.outposts.has(id)&&id!==state.camp&&!reservedSources(state).some(a=>key(a.x,a.y)===id) : ['build','long'].includes(tool)&&state.walls.has(id)&&!state.towers.has(id);
      if((state.phase==='build'||(state.phase==='battle'&&['build','long'].includes(tool)))&&eligible){ctx.fillStyle='#a9d4cb55';ctx.fillRect(x+.46,y+.46,.08,.08);}
      ctx.strokeStyle='#86ccea';ctx.lineWidth=.08;ctx.setLineDash([.16,.12]);ctx.beginPath();
      for(const [dx,dy,a,b,c,d] of [[-1,0,x,y,x,y+1],[1,0,x+1,y,x+1,y+1],[0,-1,x,y,x+1,y],[0,1,x,y+1,x+1,y+1]]) {
        if(!inside(x+dx,y+dy)||!inControl(controlState,key(x+dx,y+dy),controlRadius)){ctx.moveTo(a,b);ctx.lineTo(c,d);}
      }
      ctx.stroke();ctx.setLineDash([]);
    }
    ctx.strokeStyle = '#2d3e43'; ctx.lineWidth = .025; ctx.strokeRect(x, y, 1, 1);
  }
  const actualNight=state.phase==='battle'&&Number($('forecastDay').value)===state.day-1;
  const displayedRoutes=actualNight?battleRoutes(state):viewedSources().map((source,index)=>({path:sourcePath(source),index,future:false}));
  if ($('routes').checked || wallEdit || postGhost) displayedRoutes.forEach(({path,index,future}) => {
    ctx.setLineDash(future?[.25,.2]:[]);
    ctx.strokeStyle = colors[index % colors.length]; ctx.globalAlpha = future?.35:.8; ctx.lineWidth = future?.065:.10;
    ctx.beginPath(); path.forEach((id, i) => { const [x,y] = xy(id), offset = (index % 3 - 1) * .12; if (!i) ctx.moveTo(x + .5 + offset,y + .5); else ctx.lineTo(x + .5 + offset,y + .5); }); ctx.stroke();
    for (let i = 1; i < path.length; i += 4) {
      const [x,y] = xy(path[i]), [nx,ny] = xy(path[Math.min(i + 1,path.length - 1)]);
      ctx.save(); ctx.translate(x+.5,y+.5); ctx.rotate(Math.atan2(ny-y,nx-x)); ctx.beginPath(); ctx.moveTo(-.15,-.16); ctx.lineTo(.1,0); ctx.lineTo(-.15,.16); ctx.stroke(); ctx.restore();
    }
    ctx.globalAlpha = 1;ctx.setLineDash([]);
  });
  if (hover !== null && (state.phase === 'build' || weaponHover) && (!productionSite(hover)||weaponHover)) {
    const isWeapon = ['build','long'].includes(tool), weapon = selectedWeapon();
    const error = isWeapon ? previewError : tool==='production'?productionError(state,hover):postHover?postError:candidate?.error;
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
      for(const id of new Set(viewedSources().flatMap(sourcePath)))if(added.has(id)){
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
  for(const p of PRODUCTION_SITES){
    const {x,y,size:n}=p,id=key(x,y),built=state.production.has(id),active=built&&productionActive(state,id),selected=productionId(hover)===id;
    // 悬停时把街区作为一个操作对象，盖住内部格线，避免误认为逐格恢复。
    ctx.fillStyle=selected?(active?'#527e59':built?'#80594e':'#655f3d'):active?'#91c99a99':built?'#a46f6088':'#766d4a77';ctx.fillRect(x+.08,y+.08,n-.16,n-.16);
    ctx.strokeStyle=selected?'#fff0ae':productionControlled(previewState,id)?'#f5d789':'#a29670';ctx.lineWidth=selected?.12:.06;ctx.strokeRect(x+.08,y+.08,n-.16,n-.16);
    if(selected)for(const cell of productionCells(id))if(!inControl(previewState,cell)){const [cx,cy]=xy(cell);ctx.fillStyle='#ed665877';ctx.fillRect(cx,cy,1,1);}
    // 街区标签在屏幕空间绘制，缩小棋盘时仍保持可读。
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
  // 敌源共用红色切角轮廓；细色条仅对应路线，不暗示不同敌种。
  const drawSource=(source,index,futureDay=null)=>{
    const {x,y}=source;ctx.save();
    ctx.fillStyle=futureDay?'#1b2429':'#632f36';ctx.strokeStyle=futureDay?'#c48985':'#ff9a8b';ctx.lineWidth=.09;
    if(futureDay)ctx.setLineDash([.14,.10]);
    ctx.beginPath();ctx.moveTo(x+.23,y+.04);ctx.lineTo(x+.77,y+.04);ctx.lineTo(x+.96,y+.23);ctx.lineTo(x+.96,y+.77);ctx.lineTo(x+.77,y+.96);ctx.lineTo(x+.23,y+.96);ctx.lineTo(x+.04,y+.77);ctx.lineTo(x+.04,y+.23);ctx.closePath();ctx.fill();ctx.stroke();ctx.setLineDash([]);
    ctx.fillStyle=colors[index%colors.length];ctx.fillRect(x+.24,y+.79,.52,.08);
    label(index+1,x+.5,y+.43,futureDay?'#d6b2ad':'#fff0e9',Math.max(.5,9/size));
    if(futureDay){ctx.fillStyle='#142024';ctx.fillRect(x-.15,y- .65,1.3,.58);label(`D${futureDay}`,x+.5,y-.35,'#e0b3ab',Math.max(.36,9/size));}
    ctx.restore();
  };
  viewedSources().forEach((source,index)=>drawSource(source,index));
  const visibleIds=new Set(viewedSources().map(s=>key(s.x,s.y)));
  state.waves.slice(state.day).forEach((wave,index)=>wave.forEach((source,sourceIndex)=>{
    const id=key(source.x,source.y);if(visibleIds.has(id))return;visibleIds.add(id);
    drawSource(source,sourceIndex,state.day+index+1);
  }));
  const [cx,cy] = xy(state.camp);
  // 火光是共同守护目标，用局部光晕定位；不暗化整个战场。
  const glow=ctx.createRadialGradient(cx+.5,cy+.5,.1,cx+.5,cy+.5,1.8);
  glow.addColorStop(0,'#ffc17c44');glow.addColorStop(1,'#ffc17c00');ctx.fillStyle=glow;ctx.fillRect(cx-1.3,cy-1.3,3.6,3.6);
  ctx.fillStyle=state.hp>0?'#ffc17c':'#75615b';ctx.beginPath();ctx.moveTo(cx+.52,cy-.03);ctx.bezierCurveTo(cx+.45,cy+.38,cx+1.03,cy+.44,cx+.82,cy+.79);ctx.bezierCurveTo(cx+.6,cy+1.1,cx+.08,cy+.9,cx+.17,cy+.56);ctx.lineTo(cx+.37,cy+.24);ctx.lineTo(cx+.37,cy+.51);ctx.closePath();ctx.fill();
  if(state.hp>0){ctx.fillStyle='#fff1b0';ctx.beginPath();ctx.moveTo(cx+.51,cy+.39);ctx.lineTo(cx+.68,cy+.78);ctx.lineTo(cx+.36,cy+.78);ctx.closePath();ctx.fill();}
  const impact = Math.min(1,impactAge/IMPACT_MS);
  // 移动阶段仍显示出发时的生命，抵达后才展示结算结果。
  const drawEnemy = (enemy,x,y,scale=1,alpha=1,barHP=enemy.hp) => {
    const occupants=(motion?motion.actors:state.enemies).filter(e=>e.id===enemy.id);
    if(occupants.length>1){const slot=Math.max(0,occupants.findIndex(e=>e.target===enemy.target));x+=(slot%2? .23:-.23);y+=Math.floor(slot/2)*.3;scale*=.55;}
    ctx.save();ctx.globalAlpha=alpha;ctx.translate(x+.5,y+.5);ctx.scale(scale,scale);ctx.translate(-.5,-.5);
    ctx.fillStyle=enemy.members>1?'#ffb079':'#f28780';ctx.fillRect(.04,.06,.92,.83);
    label(enemy.hp,.5,.42,'#321d23',Math.max(.46,10/size));ctx.fillStyle='#552b30';ctx.fillRect(.08,.73,.84,.1);ctx.fillStyle='#fff1c4';ctx.fillRect(.08,.73,.84*Math.max(0,Math.min(1,barHP/enemy.max)),.1);
    if(enemy.members>1){ctx.strokeStyle='#ffe6b9';ctx.lineWidth=.07;ctx.strokeRect(.04,.06,.92,.83);}
    if(!reducedMotion.matches&&impact<1&&state.events.some(e=>e.type==='hit'&&e.id===enemy.id&&e.target===enemy.target)){
      ctx.fillStyle=`rgba(255,250,220,${.45*(1-impact)})`;ctx.fillRect(.04,.06,.92,.83);
    }
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
      if(!reducedMotion.matches&&event.type==='kill'){
        ctx.strokeStyle=`rgba(255,222,151,${1-impact})`;ctx.lineWidth=.08;
        for(let i=0;i<4;i++){const angle=i*Math.PI/2+.4,r=.3+impact*.6;ctx.beginPath();ctx.moveTo(x+.5+Math.cos(angle)*r,y+.5+Math.sin(angle)*r);ctx.lineTo(x+.5+Math.cos(angle)*(r+.2),y+.5+Math.sin(angle)*(r+.2));ctx.stroke();}
      }
      if(event.type==='leak'){ctx.fillStyle=`rgba(255,100,80,${.6*(1-impact)})`;ctx.fillRect(x-.25,y-.25,1.5,1.5);}
      ctx.strokeStyle=event.type==='merge'?'#ffe0a1':'#ffbbb0';ctx.lineWidth=.075;ctx.strokeRect(x+.01,y+.01,.98,.98);
      if(event.type==='merge'||event.type==='hit') {
        const text=event.type==='merge'?`合流 ${event.value}`:`−${event.value}`;
        ctx.font='600 .43px system-ui';ctx.textAlign='center';ctx.textBaseline='bottom';ctx.lineWidth=.12;ctx.strokeStyle='#142024';ctx.strokeText(text,x+.5,y-.05-impact*.3);ctx.fillStyle=event.type==='merge'?'#ffe0a1':'#ffb1a3';ctx.fillText(text,x+.5,y-.05-impact*.3);
      }
    }
  }
  ctx.restore();
  // 街区状态与收益保持屏幕字号，不因全图缩小而变成难读的小字。
  for(const p of PRODUCTION_SITES){
    const id=key(p.x,p.y),built=state.production.has(id),active=built&&productionActive(state,id);
    // 敌人经过街区时优先显示敌群，避免标签盖住生命与血条。
    const cells=productionCells(id);
    if((motion?.actors||state.enemies).some(e=>cells.includes(e.id)||cells.includes(e.to)))continue;
    const x=panX+(p.x+p.size/2)*size,y=panY+(p.y+p.size/2)*size;
    const title=built?(active?'生产中':'已停产'):'待恢复';
    ctx.font='600 10px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';
    const w=Math.max(ctx.measureText(title).width+8,42);
    ctx.fillStyle='#142024ed';ctx.fillRect(x-w/2,y-14,w,30);
    ctx.fillStyle=active?'#bff5ce':built?'#ffb7a5':'#f5df9c';ctx.fillText(title,x,y-6);
    ctx.font='10px system-ui';ctx.fillText(built&&!active?'收入 0':`+${productionQuote(state,id).income}/晚`,x,y+8);
  }
  // 建设反馈跟随地图位置；短暂边框与金额提示不参与规则结算。
  if(placementFx){
    const fx=placementFx,t=Math.min(1,(performance.now()-fx.start)/750),[x,y]=xy(fx.id);
    const sx=panX+x*size,sy=panY+y*size;
    ctx.save();ctx.globalAlpha=1-t;ctx.strokeStyle=fx.color;ctx.lineWidth=2;
    const expand=reducedMotion.matches?0:t*9;
    ctx.strokeRect(sx-expand,sy-expand,fx.size*size+expand*2,fx.size*size+expand*2);
    ctx.font='bold 12px system-ui';ctx.textAlign='center';ctx.textBaseline='bottom';ctx.lineWidth=4;ctx.strokeStyle='#142024';
    const ty=sy-7-(reducedMotion.matches?0:t*18);ctx.strokeText(fx.text,sx+fx.size*size/2,ty);ctx.fillStyle=fx.color;ctx.fillText(fx.text,sx+fx.size*size/2,ty);ctx.restore();
  }
  // 篝火血量最后绘制，固定屏幕字号，避免缩放后难以辨认或被敌群遮挡。
  const campX=panX+(cx+.5)*size, campY=panY+cy*size-25;
  ctx.fillStyle='#11191cee';ctx.fillRect(campX-39,campY,78,23);
  ctx.font='600 11px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle='#ffe0b7';
  ctx.fillText(`HP ${Math.max(0,state.hp)} / ${state.params.campHP}`,campX,campY+8);
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
    if(productionSite(hover))$('cellInfo').textContent+=state.production.has(productionId(hover))?` · 生产点 ${productionActive(state,hover)?'已恢复':'失控停产'} · ${productionQuote(state,hover).income} 钱/晚`:` · 待恢复生产点 · 费用 ${productionQuote(state,hover).cost} · 收入 ${productionQuote(state,hover).income}/晚`;
    const post=state.outposts.get(hover);if(post)$('cellInfo').textContent+=` · 前哨 ${post.hp}/${post.max}`;
    if(state.lostControl.has(hover))$('cellInfo').textContent+=state.phase==='build'?' · 上晚失控记录':' · 当晚失控，无收益资格';
    const groups=state.enemies.filter(e=>e.id===hover);if(groups.length)$('cellInfo').textContent+=groups.map(e=>` · ${e.hp}/${e.max} → ${e.target===state.camp?'火光':`前哨(${xy(e.target)})`}`).join('');
    if(candidate) $('cellInfo').textContent += candidate.error ? ` · ${candidate.error}` : ' · 新路线预览（点击后生效）';
  } else $('cellInfo').textContent = '单击建造 · 拖动平移 · 滚轮缩放 · 悬停看生命';
}
function update() {
  fire = fireField({...state,params:previewParams()});
  const w=selectedWeapon();
  $('toolInfo').textContent = ['build','long'].includes(tool) ? `${weaponType()==='A'?'近防炮':'远防炮'} · ${w.cost} 资金 · ${w.shape==='square'?'方形':'菱形'}范围 ${w.range} · 火力 ${w.power}。只能架在墙上；敌人每进入一个覆盖格受 ${w.power} 伤害，停留不持续扣血。` : tool==='wall' ? `每格墙 ${state.params.wallCost} 资金。墙阻挡敌人并改变寻路，也能架炮；悬停看新路线，不能彻底封路。` : `当天新建全额退款，旧设施可清除但不退款；有炮先拆炮。固定墙不可拆；防守中不可拆除。`;
  if(tool==='outpost')$('toolInfo').textContent=`前哨 ${state.params.outpostCost} 资金 · HP ${state.params.outpostHP} · 范围 ${state.params.outpostRadius}。建于已有控制区空地；无攻击能力，会成为目标。`;
  if(tool==='repair')$('toolInfo').textContent=`次日点击受损火光、前哨或废墟，一次修满。前哨每 HP ${state.params.repairCost} 钱，火光每 HP ${state.params.campRepairCost} 钱；悬停查看总价。失控前哨可原址修复。`;
  if(tool==='production')$('toolInfo').textContent=`2×2：${state.params.productionCost} 钱／每晚 +${state.params.productionIncome}；3×3：${state.params.largeProductionCost} 钱／每晚 +${state.params.largeProductionIncome}。整块受控才能恢复，缺一格即停产；不阻路。当天新建全额拆返；旧街区清除不退款。`;
  updateNightReport();
  $('income').textContent=`预计经营 +${expectedIncome(state)} / 晚 · 已恢复 ${state.production.size} / ${PRODUCTION_SITES.length}`;
  const prices={wall:state.params.wallCost,build:state.params.weapons.A.cost,long:state.params.weapons.B.cost,outpost:state.params.outpostCost,production:`小 ${state.params.productionCost} / 大 ${state.params.largeProductionCost}`,repair:state.params.repairCost===state.params.campRepairCost?`${state.params.repairCost}/HP`:`哨 ${state.params.repairCost} / 火 ${state.params.campRepairCost}/HP`,erase:'返还见预览'};
  for(const [id,price] of Object.entries(prices))$('price-'+id).textContent=String(price);
  $('budget').textContent = funds(state); $('tick').textContent = state.tick;
  $('campHP').textContent = `HP ${Math.max(0,state.hp)} / ${state.params.campHP}`; $('campBar').style.width = `${Math.max(0,state.hp)/state.params.campHP*100}%`;
  $('spawned').textContent = `${state.spawned} / ${state.sources.reduce((n,s)=>n+s.count,0)}`;
  const active = state.phase === 'battle', build = state.phase === 'build';
  document.body.dataset.phase=state.phase;
  $('phaseTitle').textContent=build?'白天 · 建设':active?(paused?'夜晚 · 已暂停':'夜晚 · 防守'):state.phase==='won'?'守住了':'火光熄灭';
  $('phaseHint').textContent=build?'墙改变路线 · 炮台架在墙上 · 蓝色边界内可建设':active?'每进一格结算伤害 · 可暂停补炮 · 不能造墙或拆除':state.phase==='won'?(campaignComplete(state)?'五晚实验完成，可重试当晚或整局重来。':'守住了，即将自动进入白天。经营收入已到账。'):'重试当晚可回到开战前，重新布防。';
  $('phase').textContent = `第 ${state.day} / ${state.waves.length} 天 · `+(build?'白天':active?(paused?'夜晚 · 暂停':'夜晚'):campaignComplete(state)?'全部夜晚守住了':state.phase==='won'?'当晚守住了':'火光熄灭');
  $('start').disabled = !build && !active;
  $('retry').disabled=!preparation; $('step').disabled = !active || !paused || !!motion?.singleStep;
  $('start').textContent = active ? (paused ? '继续夜晚' : '暂停夜晚') : campaignComplete(state)?'实验完成':build?'开始夜晚':state.phase==='won'?'守住了 · 即将天亮':'防守结束';
  for (const id of ['build','long','wall','outpost','production','repair','erase','apply','addSource','applyParams','cancelParams','defaults']) $(id).disabled = !build;
  // 通用建造交互：不足价即禁用，退款或应用参数后立即恢复。
  for(const [id,cost] of [['wall',state.params.wallCost],['build',state.params.weapons.A.cost],['long',state.params.weapons.B.cost],['outpost',state.params.outpostCost],['production',Math.min(state.params.productionCost,state.params.largeProductionCost)]]){
    const short=funds(state)<cost;
    const allowed=build||(active&&['build','long'].includes(id));
    $(id).disabled=!allowed||short;
    $(id).title=!allowed?'防守中不能建设':short?`资金不足：需要 ${cost}，现有 ${funds(state)}`:`花费 ${cost} 资金`;
  }
  const repairPrices=[state.camp,...state.outposts.keys()].map(id=>repairQuote(state,id)).filter(q=>q.missing>0);
  $('repair').disabled=!build||state.day<2||!repairPrices.some(q=>q.cost<=funds(state));
  $('repair').title=state.day<2?'次日才能修复':!repairPrices.length?'没有受损设施':`修满最低需要 ${Math.min(...repairPrices.map(q=>q.cost))} 钱`;
  for(const id of ['applyParams','cancelParams','defaults'])$(id).disabled=!build||state.day!==1;
  document.querySelectorAll('#sources input, #sources select, #sources button').forEach(el=>el.disabled=!build);
  document.querySelectorAll('#params input, #params select').forEach(el=>el.disabled=!build||state.day!==1);
  $('result').textContent = build ? '修改位置后再试。敌人不攻击武器与障碍。' : `${state.phase === 'won' ? '防守成功' : state.phase === 'lost' ? '防守失败' : '防守中'} · 削减 ${state.damage} · 漏过 ${state.leaked} · 合并 ${state.merges} 次 · 本晚击杀收入 ${state.nightEarned} · 经营收入 ${state.nightEconomy}${state.economySettled?'（已入账）':'（尚未结算）'}`;
  if(build&&state.lastNight)$('result').textContent=`昨夜漏过 ${state.lastNight.leaked} HP、失控 ${state.lastNight.lost} 格。收入明细见左侧；现在可以建设与修复。`;
  if(campaignComplete(state))$('result').textContent+=` · ${state.waves.length} 晚完成！累计击杀收入 ${state.earned}、经营收入 ${state.economyEarned}。可重试最后一晚或整局重来。`;
  updateForecast();
  draw();
}
// 收入卡只读取已结束夜晚的快照，不把白天新投资混入昨夜结果。
function updateNightReport(){
  const report=state.phase==='build'?state.lastNight:state.phase==='won'?{day:state.day,economy:state.nightEconomy,earned:state.nightEarned,...state.productionReport}:null;
  $('nightReport').hidden=!report;
  if(!report)return;
  $('reportTitle').textContent=`${state.phase==='build'?'昨夜':'本晚'}收入 · 第 ${report.day} 晚`;
  $('reportEconomy').textContent=`+${report.economy} · 已到账`;
  $('reportKills').textContent=`+${report.earned}（夜间已到账）`;
  $('reportProduction').textContent=report.productive||report.stopped?`${report.productive} 处街区正常生产`:'尚未恢复生产街区';
  $('reportStopped').hidden=!report.stopped;
  $('reportStopped').textContent=`${report.stopped} 处失控停产，少收入 ${report.missed} 金币`;
}
function updateForecast() {
  const night=Number($('forecastDay').value)+1, sources=viewedSources();
  $('forecastTitle').textContent=`第 ${night} 晚${night===state.day?' · 当晚':' · 预告'} · ${sources.reduce((sum,s)=>sum+s.count,0)} 块`;
  $('routeNight').textContent=state.phase==='battle'&&night===state.day?'实线：在场敌群 · 虚线：后续出怪':`预计路线：第 ${night} 晚`;
  $('forecastList').replaceChildren(...sources.map((s,i)=>{
    const row=document.createElement('li'),target=sourceTarget(state,s),name=target===state.camp?'火光':`前哨 (${xy(target)})`;
    const rule=s.target===-1?'指定火光':s.target===-2?'出生时最近':'指定前哨，失守转火光';
    row.style.setProperty('--source-color',colors[i%colors.length]);
    row.textContent=`${i+1} · (${s.x},${s.y}) · ${s.count} 块 × ${s.hp} HP · 首拍 ${s.first} / 间隔 ${s.interval} · ${rule} → ${name}`;return row;
  }));
}
$('forecastDay').onchange=()=>{updateForecast();draw();};

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
  fields('小街区 2×2',params,'',[['productionCost','恢复费用',1,1000],['productionIncome','每晚收入',1,1000]]);
  fields('大街区 3×3',params,'',[['largeProductionCost','恢复费用',1,1000],['largeProductionIncome','每晚收入',1,1000]]);
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
function clearPlayback() {
  dawnAt=0;receiptUntil=0;$('economyReceipt').hidden=true;
  paused=false;timer=0;motion=null;placementFx=null;impactAge=1000;incoming.clear();recentGain=0;gainUntil=0;$('moneyGain').textContent='';messages=[];explainedMerge=false;$('mergeNotice').hidden=true;$('log').replaceChildren();
  document.querySelectorAll('.coin-drop').forEach(el=>el.remove());
}
function reset(keep=true){
  if(keep&&!preparation)return;
  state=keep?restoreNight(preparation):restartCampaign(state);
  if(!keep)preparation=null;
  clearPlayback();$('forecastDay').value=String(state.day-1);
  sourceEditor(state.sources);paramsEditor(state.params);refreshParams();
  notify(keep?`已恢复第 ${state.day} 晚战前状态；保留更早的损伤与收支，撤销本晚收入和补炮。`:'已整局重来：恢复第一天初始资金与生命，保留已应用的参数和波次配置。');
}
for(const id of ['wall','build','long','outpost','production','repair','erase'])$(id).onclick=()=>{
  tool=id;for(const button of ['wall','build','long','outpost','production','repair','erase'])$(button).classList.toggle('selected',button===id);update();
};
$('retry').onclick=()=>reset();$('clear').onclick=()=>reset(false);
$('applyParams').onclick=()=>{
  if(state.phase!=='build'||state.day!==1)return;
  const params=readParams(),error=validateParams(params,state);$('paramStatus').textContent=error;if(error)return;
  const waves=state.waves,production=state.production;state=createState(state.sources,state.towers,state.playerWalls,params,state.outposts);state.production=production;state.waves=waves;state.waves[0]=state.sources;state.lastNight=null;preparation=null;clearPlayback();
  paramsEditor(state.params);refreshParams();notify('参数已应用，本轮已重置，墙、炮台、前哨与生产点保留。');
};
$('cancelParams').onclick=()=>{paramsEditor(state.params);refreshParams();};
$('defaults').onclick=()=>{paramsEditor(DEFAULTS);refreshParams();notify('已填入默认值，点击应用后生效。');};
$('apply').onclick=()=>{
  if(state.phase!=='build')return;
  if(paramsDirty()){notify('请先应用或取消实验参数预览。');return;}
  const sources=readSources(),error=validateSources(sources,state);$('configError').textContent=error;if(error)return;
  state.sources=structuredClone(sources);state.waves[state.day-1]=state.sources;preparation=null;clearPlayback();sourceEditor(state.sources);notify(`第 ${state.day} 晚配置已应用，资金与损伤不变。`);update();
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
  const beforeFunds=funds(state);let actionError='';
  if(tool==='production'){
    const error=actionError=buildProduction(state,id);notify(error||`街区已恢复！预计每晚收入 +${productionQuote(state,id).income}，守住后自动入账。`);
  } else if(['outpost','repair'].includes(tool)){
    const error=actionError=buildOutpost(state,id,tool==='repair');notify(error||(tool==='repair'?'设施已修满，按缺失 HP 扣费。':'前哨已建立；默认自动目标会选择出生时最近的控制站。'));
    if(!error)sourceEditor(readSources());
  } else if(tool==='wall'){
    const error=actionError=changeWall(state,id);notify(error||'墙已建造，路线已更新。');
  } else if(tool==='erase'){
    const quote=demolitionQuote(state,id);
    const error=actionError=quote.type==='production'?removeProduction(state,id):quote.type==='tower'?removeTower(state,id):quote.type==='outpost'?removeOutpost(state,id):quote.type==='wall'?changeWall(state,id,true):'这里没有可拆除的设施。';
    notify(error||`已${quote.day===state.day?'撤销当天建设':'清除旧设施'}，返还 ${quote.refund} 金币。`);
    if(!error&&quote.type==='outpost')sourceEditor(readSources());
  } else {
    const type=weaponType(),error=actionError=buildTower(state,id,type);
    if(error)notify(error);else{notify(`武器 ${type} 已架设，覆盖格火力 +${state.params.weapons[type].power}。`);}
  }
  if(!actionError){
    const delta=funds(state)-beforeFunds,site=tool==='production'||tool==='erase'?productionSite(id):null;
    const names={wall:'墙已建造',build:'近防炮就位',long:'远防炮就位',outpost:'控制区扩张',production:'生产已恢复',repair:'已修满',erase:'已拆除'};
    placementFx={id:site?key(site.x,site.y):id,size:site?.size||1,start:performance.now(),color:delta<0?'#ffe1a0':'#aef2ce',text:`${names[tool]}${delta?` ${delta>0?'+':''}${delta} 金币`:''}`};
    pulse($('budget'),delta<0?'#ffe1a0':'#bff5ce');
  }else pulse($('notice'),'#ffb7a5');
  update();
});
canvas.addEventListener('pointercancel',()=>{dragging=null;});
canvas.addEventListener('lostpointercapture',()=>{dragging=null;});
canvas.addEventListener('pointerleave',()=>{hover=null;draw();});
new ResizeObserver(()=>resize()).observe(viewport);
// 预告选项跟随实际波次，避免增加夜晚后界面仍停在前三晚。
$('forecastDay').replaceChildren(...state.waves.map((_,i)=>{const option=document.createElement('option');option.value=i;option.textContent=`第 ${i+1} 晚`;return option;}));
paramsEditor(state.params);sourceEditor(state.sources);resize(true);refreshParams();

// 短促高亮确认发生变化，不震屏，不遮挡操作；尊重减少动态效果设置。
function pulse(element,color){
  if(reducedMotion.matches)return;
  element.animate([{color,filter:'brightness(1.5)'},{filter:'brightness(1)'}],{duration:450});
}

// 括号是短暂的最近收入；余额已经包含它，不是待领取或每秒收益。
function showIncome(amount){
  if(amount<=0)return;
  recentGain=performance.now()<gainUntil?recentGain+amount:amount;
  gainUntil=performance.now()+1400;
  $('moneyGain').textContent=`（+${recentGain}）`;
  $('moneyGain').title='刚刚获得，已计入余额';
  pulse($('budget'),'#ffe1a0');
}
for(const button of document.querySelectorAll('[data-speed]'))button.onclick=()=>{
  playbackSpeed=Number(button.dataset.speed);
  for(const option of document.querySelectorAll('[data-speed]')){
    const selected=option===button;option.classList.toggle('selected',selected);option.setAttribute('aria-pressed',String(selected));
  }
};

// 金币立即入账；弹出并飞向资金栏只是反馈，不要求点击，也不阻挡暂停和补炮。
function showCoins(id, amount) {
  if(reducedMotion.matches)return;
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
    if(event.type==='merge'&&!explainedMerge){
      explainedMerge=true;$('mergeNotice').hidden=false;
      $('mergeNotice').textContent=`合流：${event.parts.join(' + ')} = ${event.value} HP。同格、同拍、同目标才合并；之后每进入一格只扣一次该格火力，整群消灭才获得合计金币。`;
    }
    if(event.type==='kill'){showIncome(event.value);showCoins(event.id,event.value);}
    if(event.type==='leak')pulse($('campHP'),'#ff978b');
    messages.unshift(`第 ${state.tick} 拍 · ${text}`);
  }
  messages = messages.slice(0,8); $('log').replaceChildren(...messages.map(text=>{const li=document.createElement('li');li.textContent=text;return li;}));
  if(state.phase==='won'){
    // 经营单独说明来源，不与最后一次击杀的括号金额相加，也不重复发钱。
    $('economyReceipt').textContent=state.nightEconomy>0?`经营收入 +${state.nightEconomy} · 已到账`:'本晚经营收入 0 · 明细见下方';
    $('economyReceipt').hidden=false;receiptUntil=performance.now()+4900;
    if(state.nightEconomy>0)pulse($('budget'),'#ffe1a0');
    dawnAt=campaignComplete(state)?0:performance.now()+900;
  }
  if (state.phase === 'won') notify(campaignComplete(state)?'全部夜晚守住了！可重试最后一晚或整局重来。':`第 ${state.day} 晚守住了。进入次日建设、修复并准备下一晚。`);
  if (state.phase === 'lost') notify('篝火熄灭。看看合流之前是否还有更好的覆盖位置。');
  if(state.phase==='lost')$('testControls').open=true;
  update();
  if(state.phase==='won')document.querySelector('.build-sidebar').scrollTop=0;
}
// 仅短暂展示胜利，不增加需要玩家确认的结算阶段。
function finishDawn(){
  dawnAt=0;
  if(!enterMorning(state))return;
  preparation=null;paused=false;timer=0;motion=null;impactAge=1000;incoming.clear();
  explainedMerge=false;$('mergeNotice').hidden=true;$('forecastDay').value=String(state.day-1);sourceEditor(state.sources);
  notify(`第 ${state.day} 天 · 白天。昨夜收入已到账，可以建设与修复。`);
  update();
  // 回到钱包与报告，避免浏览器滚动锚定把新插入的收入卡藏在上方。
  document.querySelector('.build-sidebar').scrollTop=0;
}
$('start').onclick=()=>{
  if(campaignComplete(state))return;
  if(state.phase==='battle'){paused=!paused;timer=0;update();return;}
  if(state.phase!=='build')return;
  if(paramsDirty()){ $('experiments').open=true;notify('实验参数有未应用修改，请先应用或取消预览。');return; }
  if(JSON.stringify(readSources())!==JSON.stringify(state.sources)){ $('configError').textContent='来袭配置有未应用修改，请先应用配置。';$('settings').open=true;notify('请先应用来袭配置，确保预览与实际波次一致。');return; }
  const error=validateSources(state.sources,state);if(error){notify(error);return;}
  preparation=beginBattle(state);if(!preparation)return;
  receiptUntil=0;$('economyReceipt').hidden=true;recentGain=0;gainUntil=0;$('moneyGain').textContent='';
  $('forecastDay').value=String(state.day-1);paused=false;timer=0;last=performance.now();$('settings').open=false;notify('敌人正在接近。击杀自动获得资金；可暂停补炮，不能造墙或拆除。');update();
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
  const dt=elapsed*playbackSpeed;
  if(dawnAt&&now>=dawnAt)finishDawn();
  if(receiptUntil&&now>=receiptUntil){receiptUntil=0;$('economyReceipt').hidden=true;}
  if(gainUntil&&now>=gainUntil){gainUntil=0;recentGain=0;$('moneyGain').textContent='';}
  if(placementFx){if(now-placementFx.start>=750)placementFx=null;draw();}
  if(impactAge<IMPACT_MS){impactAge=Math.min(IMPACT_MS,impactAge+dt);draw();}
  if(state.phase==='battle'&&(!paused||motion?.singleStep)){
    if(motion){motion.elapsed+=dt;if(motion.elapsed>=MOVE_MS)advance();else draw();}
    else{timer+=dt;if(timer>=DEFAULTS.stepMs-MOVE_MS)beginMotion();}
  }
  requestAnimationFrame(frame);
}
document.addEventListener('visibilitychange',()=>{if(document.hidden&&state.phase==='battle'){paused=true;if(motion)motion.singleStep=false;timer=0;update();}});
requestAnimationFrame(frame);
