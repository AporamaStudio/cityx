import { SIZE, DEFAULTS } from './config.js?v=25';
import { initialView, isExplored, revealControl, plotContent, clearPlot, outpostAt, rebuildTerrain, demolitionQuote, buildTower, removeTower, battleRoutes, productionId, productionCells, productionQuote, productionControlled, productionActive, productionSite, productionError, buildProduction, removeProduction, expectedIncome, key, xy, inside, createCampaign, reservedSources, campaignComplete, beginBattle, restoreNight, restartCampaign, coverage, fireField, funds, placementError, validateSources, stepBattle, wallPreview, changeWall, validateParams, inControl, forecastAttacks, lockAttacks, enemyAction, enemyKey, repairQuote, repairError, repairFacility, outpostError, buildOutpost, removeOutpost, enterMorning } from './model.js?v=25';
import {generateCityMap} from './city-map.js?v=4';
import {readMapSettings} from './map-settings.js';
const mapSettings=readMapSettings(location.search);
mapSettings.width=SIZE;mapSettings.height=SIZE;
const cityLayout=generateCityMap(mapSettings);
const $ = id => document.getElementById(id);
const canvas = $('map'), ctx = canvas.getContext('2d'), viewport = $('viewport');
let state = createCampaign(DEFAULTS,undefined,cityLayout), tool = 'wall', hover = null, dragging = null;
let zoom = 1, base = 20, panX = 0, panY = 0, width = 0, height = 0;
let fire = fireField(state), paused = false, timer = 0, last = 0;
let messages = [], preparation = null, explainedMerge = false;
const canBuildWeapon = () => ['build','battle'].includes(state.phase);
const weaponPlacementError=id=>placementError(state,id,weaponType())||(motion?.actors.some(e=>e.to===id)?'敌人正进入该格，请选择其他炮位。':'');
let motion = null, impactAge = 1000, incoming = new Map();
const MOVE_MS = 160, IMPACT_MS = 220;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
let placementFx = null, playbackSpeed = 1, recentGain = 0, gainUntil = 0, dawnAt = 0, receiptUntil = 0;
let nightMix = 0;
// 只对环境配色插值，敌人、路线、血条等决策信息不经过压暗滤镜。
const terrainColors={groundA:[[88,99,88],[21,32,49]],groundB:[[94,105,94],[25,37,54]],grid:[[114,125,112],[43,58,77]],wall:[[130,137,124],[69,82,101]]};
function terrainColor(name){
  const [day,night]=terrainColors[name];return `rgb(${day.map((v,i)=>Math.round(v+(night[i]-v)*nightMix)).join(',')})`;
}
const colors = ['#df9989', '#a6a1e9', '#d5bd79', '#78bcd3'];
const notify = message => { $('notice').textContent = message; };
const weaponType = () => tool === 'long' ? 'B' : 'A';
const viewedSources = () => state.waves[Number($('forecastDay').value)];
const selectedWeapon = () => previewParams().weapons[weaponType()];
// 调试显示不写入探索记录，重新显示迷雾时仍保持真实探索进度。
const visibleCell=id=>!$('showFog').checked||isExplored(state,id);
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
  if (fit || !oldW) { const view=initialView(state);zoom=SIZE/30;panX=width/2-(view.x+15)*base*zoom;panY=height/2-(view.y+15)*base*zoom-6; }
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
  return inside(x, y)&&visibleCell(key(x,y)) ? key(x, y) : null;
}

// 先绘制地形和覆盖，再叠加路线、设施、敌群，确保信息优先级清晰。
function draw() {
  ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
  ctx.clearRect(0, 0, width, height);
  const size = base * zoom;
  const palette=Object.fromEntries(Object.keys(terrainColors).map(name=>[name,terrainColor(name)]));
  const controlState={...state,params:previewParams()};
  const controlRadius = controlState.params.controlRadius;
  const wallEdit = hover !== null && state.phase === 'build' && (tool==='wall'||(tool==='erase'&&!productionSite(hover,state)&&!state.towers.has(hover)));
  const candidate = wallEdit ? wallPreview(state,hover,tool==='erase') : null;
  const repairHover=hover!==null&&state.phase==='build'&&tool==='repair';
  const postHover=hover!==null&&state.phase==='build'&&tool==='outpost';
  const postError=postHover?(paramsDirty()?'请先应用或取消参数预览。':outpostError(state,hover)):'';
  const postGhost=postHover&&!postError;
  const previewState=postGhost?{...state,outposts:new Map([...state.outposts,[hover,{plotId:productionId(hover,state),day:state.day}]])}:state;
  const plannedRoutes=forecastAttacks(state,Number($('forecastDay').value)+1);
  const sourcePath=source=>plannedRoutes[viewedSources().indexOf(source)]?.path||[];
  const weaponHover=hover!==null&&canBuildWeapon()&&['build','long'].includes(tool);
  const weapon=selectedWeapon();
  const previewError=weaponHover ? (paramsDirty()?'请先应用或取消实验参数预览。':weaponPlacementError(hover)) : '';
  const ghost=weaponHover&&!previewError;
  const added=new Set(ghost?coverage(hover,weapon.range,weapon.shape):[]);
  // 只预览本次建设的确定变化，不模拟整波胜负。
  $('placementInfo').textContent=weaponHover ? (previewError||`建造预览 · 每格火力 +${weapon.power} · 花费 ${weapon.cost} · 建造后剩余 ${funds(state)-weapon.cost}`) : '';


  if(tool==='wall'&&candidate){
    $('placementInfo').textContent=candidate.error||`建墙预览 · 花费 ${state.params.wallCost} · HP ${state.params.wallHP}。可封住道路；今晚路线不变，敌人撞墙后攻击。`;
  }
  if(postHover)$('placementInfo').textContent=postError||`建设预览 · ${Array.from({length:SIZE*SIZE},(_,id)=>id).filter(id=>inControl(previewState,id)&&!inControl(state,id)).length} 格新增控制 · 花费 ${state.params.outpostCost}`;

  if(repairHover){const quote=repairQuote(state,hover);$('placementInfo').textContent=repairError(state,hover)||`维修预览 · 恢复 ${quote.missing} HP · 花费 ${quote.cost} · 原有建造日期不变`;}

  if(postGhost){
    const sites=state.sites.map(p=>key(p.x,p.y)).filter(id=>id!==productionId(hover,state)&&plotContent(state,id).type!=='outpost'&&!state.production.has(id)&&productionControlled(previewState,id)&&!productionControlled(state,id));
    $('placementInfo').textContent+=` · 新纳入 ${sites.length} 处生产机会：另需 ${sites.reduce((n,id)=>n+productionQuote(state,id).cost,0)} 钱恢复，可增 ${sites.reduce((n,id)=>n+productionQuote(state,id).income,0)}/晚（尚未入账）`;
  }
  if(tool==='production'&&hover!==null)$('placementInfo').textContent=productionError(state,hover)||`整块恢复预览 · 每晚收入 +${productionQuote(state,hover).income} · 花费 ${productionQuote(state,hover).cost} · 剩余 ${funds(state)-productionQuote(state,hover).cost}`;

  if(tool==='erase'&&hover!==null&&state.phase==='build'){
    const quote=demolitionQuote(state,hover);
    $('placementInfo').textContent=quote.type==='ruin'?'清理整块废墟 · 免费、即时变为空地 · 可换建前哨或生产设施':!quote.type?'这里没有可拆设施；固定墙与火光不可拆。':`第 ${quote.day} 天建造 · ${quote.day===state.day?'当天撤销':'旧设施清除'} · 返还 ${quote.refund} 金币${['production','outpost'].includes(quote.type)?' · 拆后变为空地':''}${quote.type==='outpost'?'，须先解除控制依赖':''}`;
  }
  const hoveredSite=hover!==null?productionSite(hover,state):null;
  if(hoveredSite){
    const quote=productionQuote(state,hover),content=plotContent(state,hover);
    const summary=`${hoveredSite.width??hoveredSite.size}×${hoveredSite.height??hoveredSite.size} 地块 · ${quote.area} 格 · ${content.status==='empty'?'空地':content.status==='ruin'?'生产废墟':content.type==='outpost'?'前哨建筑':'生产建筑'}。`;
    if(hoveredSite.role==='hospital')$('placementInfo').textContent='医院 · 10×12 · 收复目标。占领机制待实现，不可清理或换建。';
    else if(tool==='production')$('placementInfo').textContent=summary+`生产费用 ${quote.cost} 钱 · 每天 +${quote.income}（守住当晚后结算） · 正常生产 ${Math.ceil(quote.cost/quote.income)} 晚回本。`+(productionError(state,hover)||'点击修缮或新建整块。');
    else $('placementInfo').textContent=summary+($('placementInfo').textContent||'选择生产、前哨或拆除 / 清理工具。');
  }

  ctx.save(); ctx.translate(panX, panY); ctx.scale(size, size);
  // 全部地形、路线、敌群与源头都受探索遮罩约束，不能透过雾获取信息。
  ctx.fillStyle='#14202d';ctx.fillRect(0,0,SIZE,SIZE);
  if(!visibleCell(key(30,15))){ctx.fillStyle='#8997a8';ctx.font='600 1.5px system-ui';ctx.textAlign='center';ctx.fillText('未探索 · 向北推进',30,15);}
  if($('showFog').checked){ctx.beginPath();for(const id of state.explored){const [x,y]=xy(id);ctx.rect(x,y,1,1);}ctx.clip();}
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
    const id = key(x, y), power = fire.get(id) || 0;
    ctx.fillStyle = (x + y) % 2 ? palette.groundA : palette.groundB;
    ctx.fillRect(x, y, 1, 1);
    if ($('heat').checked && power) { ctx.fillStyle = `rgba(99,211,166,${Math.min(.6,.17 + power * .045)})`; ctx.fillRect(x, y, 1, 1); }
    if(state.layout?.tiles[id]==='road'){ctx.fillStyle=nightMix>.5?'#293c4d':'#7d8888';ctx.fillRect(x,y,1,1);}
    if(productionSite(id,state)&&plotContent(state,id).status==='empty'){ctx.fillStyle=nightMix>.5?'#2c4841':'#77967b';ctx.fillRect(x,y,1,1);}
    if (state.walls.has(id)&&!state.blocked.has(id)) {
      ctx.fillStyle = palette.wall; ctx.fillRect(x + .05, y + .05, .9, .9);
      ctx.fillStyle='#0c171c77';ctx.fillRect(x+.05,y+.78,.9,.17);
      ctx.fillStyle='#93a197';ctx.fillRect(x+.05,y+.05,.9,.10);
      ctx.strokeStyle = '#81918b'; ctx.lineWidth = .045; ctx.beginPath(); ctx.moveTo(x + .15, y + .8); ctx.lineTo(x + .8, y + .15); ctx.stroke();
    }
    const wallBody=state.wallHealth.get(id);
    if(wallBody?.hp===0){ctx.fillStyle='#956b57';ctx.fillRect(x+.1,y+.6,.8,.24);ctx.strokeStyle='#dfaa81';ctx.lineWidth=.06;ctx.beginPath();ctx.moveTo(x+.2,y+.2);ctx.lineTo(x+.8,y+.8);ctx.stroke();}
    if(wallBody&&wallBody.hp>0&&wallBody.hp<wallBody.max){ctx.fillStyle='#533a32';ctx.fillRect(x+.1,y+.85,.8,.1);ctx.fillStyle='#ecc58f';ctx.fillRect(x+.1,y+.85,.8*wallBody.hp/wallBody.max,.1);}
    if(postGhost&&inControl(previewState,id)&&!inControl(state,id)){ctx.fillStyle='#f0d18b66';ctx.fillRect(x,y,1,1);}
    if (!inControl(controlState,id,controlRadius)) {ctx.fillStyle='#07121577';ctx.fillRect(x,y,1,1);}
    else {
      ctx.fillStyle='#7fc8e810';ctx.fillRect(x,y,1,1);
      // 控制范围不等于建造格：只标出当前工具符合地形条件的位置。
      const eligible = tool==='wall' ? !state.blocked.has(id)&&!state.walls.has(id)&&!state.playerWalls.has(id)&&!state.towers.has(id)&&!state.outposts.has(id)&&id!==state.camp&&!reservedSources(state).some(a=>key(a.x,a.y)===id) : ['build','long'].includes(tool)&&!state.walls.has(id)&&!state.playerWalls.has(id)&&!state.blocked.has(id)&&!state.towers.has(id)&&!state.outposts.has(id)&&id!==state.camp&&!reservedSources(state).some(a=>key(a.x,a.y)===id);
      if((state.phase==='build'||(state.phase==='battle'&&['build','long'].includes(tool)))&&eligible){ctx.fillStyle='#a9d4cb55';ctx.fillRect(x+.46,y+.46,.08,.08);}
      ctx.strokeStyle='#86ccea';ctx.lineWidth=.08;ctx.setLineDash([.16,.12]);ctx.beginPath();
      for(const [dx,dy,a,b,c,d] of [[-1,0,x,y,x,y+1],[1,0,x+1,y,x+1,y+1],[0,-1,x,y,x+1,y],[0,1,x,y+1,x+1,y+1]]) {
        if(!inside(x+dx,y+dy)||!inControl(controlState,key(x+dx,y+dy),controlRadius)){ctx.moveTo(a,b);ctx.lineTo(c,d);}
      }
      ctx.stroke();ctx.setLineDash([]);
    }
    ctx.strokeStyle = palette.grid; ctx.lineWidth = .025; ctx.strokeRect(x, y, 1, 1);
  }
  // 灯光只代表存活设施与生产状态，不表示敌人无法进入的安全区。
  const lamp=(x,y,r,color)=>{
    const light=ctx.createRadialGradient(x,y,.05,x,y,r);
    light.addColorStop(0,color);light.addColorStop(1,'#00000000');ctx.fillStyle=light;ctx.fillRect(x-r,y-r,r*2,r*2);
  };
  if(nightMix>0){
    ctx.save();ctx.globalAlpha=nightMix;
    if(state.hp>0){const [x,y]=xy(state.camp);lamp(x+.5,y+.5,3,'#ffbe6855');}
    for(const [id,p] of state.outposts){const [x,y]=xy(id);lamp(x+.5,y+.5,1.7,'#9bddf344');}
    for(const p of state.sites)if(state.production.has(key(p.x,p.y))&&productionActive(state,key(p.x,p.y)))lamp(p.x+(p.width??p.size)/2,p.y+(p.height??p.size)/2,Math.max(p.width??p.size,p.height??p.size),'#f4d68b33');
    ctx.restore();
  }
  const actualNight=state.phase==='battle'&&Number($('forecastDay').value)===state.day-1;
  const displayedRoutes=actualNight?battleRoutes(state):plannedRoutes.map(attack=>({...attack,future:false}));
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
  if (hover !== null && (state.phase === 'build' || weaponHover) && (!productionSite(hover,state)||weaponHover)) {
    const isWeapon = ['build','long'].includes(tool), weapon = selectedWeapon();
    const error = isWeapon ? previewError : tool==='production'?productionError(state,hover):repairHover?repairError(state,hover):postHover?postError:candidate?.error;
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
  for(const p of state.sites){
    const {x,y}=p,n=p.width??p.size,m=p.height??p.size,id=key(x,y),built=state.production.has(id),active=built&&productionActive(state,id),selected=productionId(hover,state)===id,empty=plotContent(state,id).status==='empty';
    // 悬停时把街区作为一个操作对象，盖住内部格线，避免误认为逐格恢复。
    if(empty){ctx.strokeStyle=selected?'#fff0ae':'#a8d5ad';ctx.lineWidth=selected?.12:.06;ctx.setLineDash([.2,.12]);ctx.strokeRect(x+.08,y+.08,n-.16,m-.16);ctx.setLineDash([]);continue;}
    ctx.fillStyle=selected?(active?'#527e59':built?'#80594e':'#655f3d'):active?'#527e59':built?'#80594e':nightMix>.5?'#494b42':'#81745b';ctx.fillRect(x+.08,y+.08,n-.16,m-.16);
    ctx.strokeStyle=selected?'#fff0ae':productionControlled(previewState,id)?'#f5d789':'#a29670';ctx.lineWidth=selected?.12:.06;ctx.strokeRect(x+.08,y+.08,n-.16,m-.16);
    // 街区内多栋建筑仅用于表现；矩形整体仍是单次修缮对象。
    ctx.fillStyle=active?'#81af85':nightMix>.5?'#666854':'#a39270';
    for(let ry=0;ry<m-1;ry+=2)for(let rx=0;rx<n-1;rx+=2)ctx.fillRect(x+rx+.3,y+ry+.3,Math.min(1.25,n-rx-.6),Math.min(1.25,m-ry-.6));
    if(p.role==='hospital'){ctx.fillStyle='#cbd7cb';ctx.fillRect(x+3,y+3,4,6);ctx.fillStyle='#478b80';ctx.fillRect(x+4.5,y+4,1,4);ctx.fillRect(x+3.5,y+5.5,3,1);}
    if(p.special){ctx.strokeStyle='#d5b5fc';ctx.lineWidth=.12;ctx.strokeRect(x+.16,y+.16,n-.32,m-.32);}
    if(selected)for(const cell of productionCells(id,state))if(!inControl(previewState,cell)){const [cx,cy]=xy(cell);ctx.fillStyle='#ed665877';ctx.fillRect(cx,cy,1,1);}
    if(active&&nightMix>0){
      ctx.save();ctx.globalAlpha=nightMix;ctx.fillStyle='#ffe4a1';
      for(let i=0;i<n;i++){ctx.fillRect(x+.18+i,y+.18,.18,.18);ctx.fillRect(x+.18+i,y+m-.36,.18,.18);}ctx.restore();
    }
    // 街区标签在屏幕空间绘制，缩小棋盘时仍保持可读。
  }
  for (const [id,type] of [...state.towers,...(ghost?[[hover,weaponType()]]:[])]) {
    ctx.save();if(ghost&&id===hover)ctx.globalAlpha=.5;
    const [x,y] = xy(id),body=state.towerHealth.get(id),broken=body?.hp===0; ctx.fillStyle=broken?'#85645b':type==='B'?'#bab3f2':'#8bdbb9'; ctx.fillRect(x+.18,y+.22,.64,.6); ctx.fillStyle='#28483b'; ctx.fillRect(x+.37,y+.32,.26,.38); ctx.fillStyle='#ddffe7'; ctx.fillRect(x+.43,y+.08,.14,.35);if(type==='B'){ctx.fillRect(x+.22,y+.12,.12,.34);ctx.fillRect(x+.66,y+.12,.12,.34);}
    if(broken){ctx.strokeStyle='#ffb39b';ctx.lineWidth=.08;ctx.beginPath();ctx.moveTo(x+.15,y+.15);ctx.lineTo(x+.85,y+.85);ctx.moveTo(x+.85,y+.15);ctx.lineTo(x+.15,y+.85);ctx.stroke();}
    if(body&&!broken){ctx.fillStyle='#533a32';ctx.fillRect(x+.1,y+.88,.8,.08);ctx.fillStyle='#bce8fb';ctx.fillRect(x+.1,y+.88,.8*body.hp/body.max,.08);}
    ctx.restore();
  }
  for(const [id,p] of previewState.outposts){
    const [x,y]=xy(id);ctx.save();if(postGhost&&id===hover)ctx.globalAlpha=.5;
    ctx.fillStyle='#8ecbe5';ctx.fillRect(x+.16,y+.3,.68,.6);
    ctx.fillRect(x+.45,y+.05,.08,.5);ctx.fillRect(x+.53,y+.05,.32,.22);
    if(nightMix>0){ctx.fillStyle=`rgba(255,233,163,${nightMix})`;ctx.fillRect(x+.3,y+.48,.14,.18);ctx.fillRect(x+.57,y+.48,.14,.18);}
    ctx.restore();
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
      if(['merge','hit','wallHit','towerHit','wallLost','towerLost'].includes(event.type)) {
        const text=event.type==='merge'?`合流 ${event.value}`:event.type==='wallLost'?'攻破':event.type==='towerLost'?'损坏停火':`−${event.value}`;
        ctx.font='600 .43px system-ui';ctx.textAlign='center';ctx.textBaseline='bottom';ctx.lineWidth=.12;ctx.strokeStyle='#142024';ctx.strokeText(text,x+.5,y-.05-impact*.3);ctx.fillStyle=event.type==='merge'?'#ffe0a1':'#ffb1a3';ctx.fillText(text,x+.5,y-.05-impact*.3);
      }
    }
  }
  ctx.restore();
  // 街区状态与收益保持屏幕字号，不因全图缩小而变成难读的小字。
  for(const p of state.sites){
    const id=key(p.x,p.y),built=state.production.has(id),active=built&&productionActive(state,id);
    // 敌人经过街区时优先显示敌群，避免标签盖住生命与血条。
    const cells=productionCells(id,state);
    if(!cells.every(cell=>visibleCell(cell)))continue;
    // 全图用于判断方向，不让固定字号标签挤满小地块；悬停仍能查看。
    if(p.role!=='hospital'&&(size<12||state.day===1)&&productionId(hover,state)!==id)continue;
    if((motion?.actors||state.enemies).some(e=>cells.includes(e.id)||cells.includes(e.to)))continue;
    const x=panX+(p.x+(p.width??p.size)/2)*size,y=panY+(p.y+(p.height??p.size)/2)*size;
    if(p.role!=='hospital'&&!built&&productionId(hover,state)!==id&&!productionControlled(state,id))continue;
    const content=plotContent(state,id),post=content.type==='outpost';
    if(cells.includes(state.camp))continue;
    if(content.status==='ruin'&&p.role!=='hospital'){
      const quote=productionQuote(state,id),cost=`−${quote.cost}`,income=`+${quote.income}`;
      ctx.save();ctx.font='600 11px system-ui';ctx.textAlign='left';ctx.textBaseline='middle';
      const w=Math.max(ctx.measureText(cost).width+33,ctx.measureText(income).width+36);let left=x-w/2;
      // 小街区紧邻火光时将报价挪到血条右侧，用短线保留地块对应关系。
      const hpX=panX+(cx+.5)*size,hpY=panY+cy*size-25;
      if(y+18>hpY&&y-18<hpY+23&&left<hpX+39&&left+w>hpX-39){
        left=hpX+43;ctx.strokeStyle='#b8afa0';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(left,y);ctx.stroke();
      }
      ctx.fillStyle='#142024f2';ctx.fillRect(left,y-18,w,36);
      // 破损屋顶、裂缝和残墙表示废墟；图标与费用同排，避免额外占一列。
      ctx.fillStyle='#b8afa0';ctx.beginPath();ctx.moveTo(left+4,y-3);ctx.lineTo(left+4,y-14);ctx.lineTo(left+8,y-14);ctx.lineTo(left+8,y-10);ctx.lineTo(left+11,y-12);ctx.lineTo(left+14,y-9);ctx.lineTo(left+14,y-3);ctx.closePath();ctx.fill();
      ctx.strokeStyle='#142024';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(left+10,y-10);ctx.lineTo(left+8,y-7);ctx.lineTo(left+11,y-5);ctx.stroke();
      const row=(text,cy,color,suffix='')=>{
        const start=left+(suffix?5:18);ctx.fillStyle=color;ctx.fillText(text,start,cy);const cx=start+ctx.measureText(text).width+7;
        ctx.fillStyle='#f3c557';ctx.beginPath();ctx.arc(cx,cy,4.5,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#fff0ac';ctx.lineWidth=1;ctx.beginPath();ctx.arc(cx,cy,3,0,Math.PI*2);ctx.stroke();
        ctx.strokeStyle='#9b671b';ctx.beginPath();ctx.moveTo(cx,cy-2);ctx.lineTo(cx,cy+2);ctx.stroke();
        if(suffix){ctx.fillStyle=color;ctx.fillText(suffix,cx+7,cy);}
      };
      row(cost,y-8,funds(state)>=quote.cost?'#f5df9c':'#f3a49c');row(income,y+8,'#bff5ce','/天');ctx.restore();continue;
    }
    const title=p.role==='hospital'?'医院 · 10×12':post?'前哨':built?(active?'生产中':'已停产'):content.status==='empty'?'空地':'生产废墟';
    ctx.font='600 10px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';
    const w=Math.max(ctx.measureText(title).width+8,48);
    ctx.fillStyle='#142024ed';ctx.fillRect(x-w/2,y-14,w,30);
    ctx.fillStyle=active?'#bff5ce':built?'#ffb7a5':'#f5df9c';ctx.fillText(title,x,y-6);
    ctx.font='10px system-ui';ctx.fillText(p.role==='hospital'?'收复目标':post?'不受击':built&&!active?'收入 0':content.status==='empty'?'可选建筑':`+${productionQuote(state,id).income}/晚`,x,y+8);
  }
  // 建设反馈跟随地图位置；短暂边框与金额提示不参与规则结算。
  if(placementFx){
    const fx=placementFx,t=Math.min(1,(performance.now()-fx.start)/750),[x,y]=xy(fx.id);
    const sx=panX+x*size,sy=panY+y*size;
    ctx.save();ctx.globalAlpha=1-t;ctx.strokeStyle=fx.color;ctx.lineWidth=2;
    const expand=reducedMotion.matches?0:t*9;
    ctx.strokeRect(sx-expand,sy-expand,fx.size*size+expand*2,(fx.height??fx.size)*size+expand*2);
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
  ctx.textBaseline='alphabetic';
  // 坐标标记帮助修改源头；屏幕字号不随棋盘缩小。
  ctx.font='10px system-ui';ctx.textAlign='center';ctx.fillStyle='#81999c';
  for(let i=0;i<SIZE;i+=5){ctx.fillText(i,panX+(i+.5)*size,panY-8);ctx.fillText(i,panX-14,panY+(i+.65)*size);}
  $('zoom').textContent = `${Math.round(zoom * 100)}%`;
  if (hover !== null) {
    const [x,y] = xy(hover), enemy = state.enemies.find(e=>e.id===hover);
    $('cellInfo').textContent = `格子 (${x}, ${y}) · ${inControl(controlState,hover,controlRadius)?'控制范围内':'控制范围外'} · 每拍火力 ${fire.get(hover)||0} · ${state.walls.has(hover)?'不可通行':'可通行'}${state.towers.has(hover)?` · 炮塔 ${state.towers.get(hover)} HP ${state.towerHealth.get(hover)?.hp}/${state.towerHealth.get(hover)?.max}${state.towerHealth.get(hover)?.hp===0?'（损坏停火）':''}`:''}${state.wallHealth.has(hover)?` · 墙 HP ${state.wallHealth.get(hover).hp}/${state.wallHealth.get(hover).max}`:''}${enemy?` · 敌群 ${enemy.hp}/${enemy.max}（${Math.round(enemy.hp/enemy.max*100)}%） · ${enemy.members} 批`:''}`;
    if(productionSite(hover,state)&&plotContent(state,hover).type!=='outpost')$('cellInfo').textContent+=state.production.has(productionId(hover,state))?` · 生产点 ${productionActive(state,hover)?'已恢复':'失控停产'} · ${productionQuote(state,hover).income} 钱/晚`:` · 待恢复生产点 · 费用 ${productionQuote(state,hover).cost} · 收入 ${productionQuote(state,hover).income}/晚`;
    if(outpostAt(state,hover)!==undefined)$('cellInfo').textContent+=' · 前哨不可受击、不失守';
    const groups=state.enemies.filter(e=>e.id===hover);if(groups.length)$('cellInfo').textContent+=groups.map(e=>` · ${e.hp}/${e.max} → ${'火光'}`).join('');
    if(candidate) $('cellInfo').textContent += candidate.error ? ` · ${candidate.error}` : ' · 今晚路线已锁定，墙只阻挡敌人';
  } else $('cellInfo').textContent = '单击建造 · 拖动平移 · 滚轮缩放 · 悬停看生命';
}
function update() {
  fire = fireField({...state,params:previewParams()});
  // 夜晚聚焦补炮；资金不足仍显示灰色炮台，区别于阶段不允许的工具。
  const daytime=state.phase==='build';
  for(const id of ['wall','outpost','production','repair','erase'])$(id).hidden=!daytime;
  $('production').hidden=!daytime||state.day<2;$('outpost').hidden=!daytime||state.day<3;
  if((tool==='production'&&state.day<2)||(tool==='outpost'&&state.day<3))tool='wall';
  if(state.phase==='battle'&&!['build','long'].includes(tool))tool='build';
  for(const id of ['wall','build','long','outpost','production','repair','erase'])$(id).classList.toggle('selected',tool===id);
  $('toolHeading').textContent=daytime?'建设工具 · 悬停棋盘预览':'夜间补炮 · 独立建于道路或空场';
  const w=selectedWeapon();
  $('toolInfo').textContent = ['build','long'].includes(tool) ? `${weaponType()==='A'?'近防炮':'远防炮'} · ${w.cost} 资金 · ${w.shape==='square'?'方形':'菱形'}范围 ${w.range} · HP ${w.hp} · 每拍火力 ${w.power}。独立建于道路或空场；敌人停留也持续受伤。损坏后停火，次日可维修。` : tool==='wall' ? `每格墙 ${state.params.wallCost} 资金 · HP ${state.params.wallHP}。允许封路，敌人沿锁定路线撞墙就攻击；墙为炮火争取时间。` : `当天新建全额退款，旧设施可清除但不退款；墙与炮塔分别拆除。固定墙不可拆；防守中不可拆除。`;
  if(tool==='outpost')$('toolInfo').textContent=`前哨 ${state.params.outpostCost} 资金 · 范围 ${state.params.outpostRadius}。在地块内受控位置建设，须整块为空地；废墟先清理。占用整块地并立即扩张控制，不受击、不失守；敌人仍攻击火光。`;
  if(tool==='repair')$('toolInfo').textContent=`次日点击受损火光、墙或损坏炮塔修满。火光按 HP 计费；墙与塔完全损坏时，维修费为造价的 ${state.params.defenseRepairPercent}%，部分受损按缺失 HP 比例计费（向上取整）。前哨不受击，无需维修。`;
  if(tool==='production')$('toolInfo').textContent=`小地块回款快，大地块持续产出高。4×4 基准费用 ${16*state.params.productionCostPerCell}、每晚 +${16*state.params.productionIncomePerCell}；悬停看实际报价与回本时间。整块受控才可修缮或新建。地块建筑不受击，挡路时敌人绕行。`;
  if(tool==='erase')$('toolInfo').textContent='点击废墟免费清理整块，变为空地后可换建。当天建筑拆除全额退款，旧建筑不退款；墙与炮塔分别拆除。前哨拆除须先解除外围控制依赖，火光地块保留。';

  $('morningCard').hidden=!daytime;
  $('morningTitle').textContent=`第 ${state.day} 天 · ${state.day===1?'守住第一晚':state.day===2?'恢复生产，守住防线':'向北收复，守住火光'}`;
  updateNightReport();
  $('mapConfigLink').href=`map-preview.html?${new URLSearchParams(mapSettings)}`;
  $('income').hidden=state.production.size===0;
  $('income').textContent=`守住后收入 +${expectedIncome(state)} 金币`;
  const prices={wall:state.params.wallCost,build:state.params.weapons.A.cost,long:state.params.weapons.B.cost,outpost:state.params.outpostCost,production:'按地块报价',repair:'按损伤报价',erase:'返还见预览'};
  for(const [id,price] of Object.entries(prices))$('price-'+id).textContent=String(price);
  $('budget').textContent = funds(state); $('tick').textContent = state.tick;
  $('campHP').textContent = `HP ${Math.max(0,state.hp)} / ${state.params.campHP}`; $('campBar').style.width = `${Math.max(0,state.hp)/state.params.campHP*100}%`;
  $('spawned').textContent = `${state.spawned} / ${state.sources.reduce((n,s)=>n+s.count,0)}`;
  const active = state.phase === 'battle', build = state.phase === 'build';
  document.body.dataset.phase=state.phase;
  document.body.dataset.time=build?'day':'night';
  $('daylightLabel').textContent=build?'☀ 白天 · 建设时间':state.phase==='won'?'☾ 守住了':state.phase==='lost'?'☾ 火光熄灭':paused?'☾ 夜晚 · 已暂停':'☾ 夜晚 · 防守时间';
  $('phaseTitle').textContent=build?'白天 · 建设':active?(paused?'夜晚 · 已暂停':'夜晚 · 防守'):state.phase==='won'?'守住了':'火光熄灭';
  $('phaseHint').textContent=build?'来源与火光目标已锁定 · 建筑挡路可绕行，墙拖时间、塔输出':active?'每拍持续炮火 · 敌人撞墙攻击，破墙后继续原路线 · 可暂停补炮':state.phase==='won'?(campaignComplete(state)?'十五晚防守测试完成；医院与敌源清除目标尚未接入。':'守住了，即将自动进入白天。经营收入已到账。'):'重试当晚可回到开战前，重新布防。';
  $('phase').textContent = `第 ${state.day} / ${state.waves.length} 天 · `+(build?'白天':active?(paused?'夜晚 · 暂停':'夜晚'):campaignComplete(state)?'十五晚防守测试完成':state.phase==='won'?'当晚守住了':'火光熄灭');
  $('start').disabled = !build && !active;
  $('retry').disabled=!preparation; $('step').disabled = !active || !paused || !!motion?.singleStep;
  $('start').textContent = active ? (paused ? '继续夜晚' : '暂停夜晚') : campaignComplete(state)?'实验完成':build?'开始夜晚':state.phase==='won'?'守住了 · 即将天亮':'防守结束';
  for (const id of ['build','long','wall','outpost','production','repair','erase','apply','addSource','applyParams','cancelParams','defaults']) $(id).disabled = !build;
  // 通用建造交互：不足价即禁用，退款或应用参数后立即恢复。
  const minProductionCost=Math.min(...state.sites.map(p=>productionQuote(state,key(p.x,p.y)).cost));
  for(const [id,cost] of [['wall',state.params.wallCost],['build',state.params.weapons.A.cost],['long',state.params.weapons.B.cost],['outpost',state.params.outpostCost],['production',minProductionCost]]){
    const short=funds(state)<cost;
    const unlocked=id==='production'?state.day>=2:id==='outpost'?state.day>=3:true;
    const allowed=unlocked&&(build||(active&&['build','long'].includes(id)));
    $(id).disabled=!allowed||short;
    $(id).title=!allowed?'防守中不能建设':short?`资金不足：需要 ${cost}，现有 ${funds(state)}`:`花费 ${cost} 资金`;
  }
  const repairPrices=[state.camp,...state.wallHealth.keys(),...state.towerHealth.keys()].map(id=>repairQuote(state,id)).filter(q=>q.missing>0);
  $('repair').disabled=!build||state.day<2||!repairPrices.some(q=>q.cost<=funds(state));
  $('repair').title=state.day<2?'次日才能修复':!repairPrices.length?'没有受损设施':`修满最低需要 ${Math.min(...repairPrices.map(q=>q.cost))} 钱`;
  for(const id of ['applyParams','cancelParams','defaults'])$(id).disabled=!build||state.day!==1;
  document.querySelectorAll('#sources input, #sources select, #sources button').forEach(el=>el.disabled=!build);
  document.querySelectorAll('#params input, #params select').forEach(el=>el.disabled=!build||state.day!==1);
  $('result').textContent = build ? '来源与火光目标已锁定。墙拖时间，塔杀敌，前哨扩张控制；建筑挡路就近绕行。' : `${state.phase === 'won' ? '防守成功' : state.phase === 'lost' ? '防守失败' : '防守中'} · 削减 ${state.damage} · 火光受伤 ${state.leaked} · 合并 ${state.merges} 次 · 本晚击杀收入 ${state.nightEarned} · 经营收入 ${state.nightEconomy}${state.economySettled?'（已入账）':'（尚未结算）'}`;
  if(build&&state.lastNight)$('result').textContent=`昨夜火光受伤 ${state.lastNight.leaked} HP。收入明细见左侧；现在可以建设与修复。`;
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
  $('forecastTitle').textContent=`第 ${night} 晚${night===state.day?' · 来源/目标已锁定，建筑挡路可绕行':' · 暂定路线预告'} · ${sources.reduce((sum,s)=>sum+s.count,0)} 块`;
  $('forecastList').replaceChildren(...sources.map((s,i)=>{
    const row=document.createElement('li'),name='火光';
    const rule='固定目标';
    row.style.setProperty('--source-color',colors[i%colors.length]);
    row.textContent=`${i+1} · ${visibleCell(key(s.x,s.y))?`(${s.x},${s.y})`:'未探索来源'} · ${s.count} 块 × ${s.hp} HP · 拆墙/塔 ${state.params.enemyPower}/块/拍 · 击杀 ${state.params.killReward} 钱/块 · 首拍 ${s.first} / 间隔 ${s.interval} · ${rule} → ${name}`;return row;
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
    for(const [name,label,max] of [['x','X',SIZE-1],['y','Y',SIZE-1],['hp','生命',999],['count','批数',30],['first','首拍',200],['interval','间隔',100]]){
      const wrap=document.createElement('label');wrap.textContent=label;const input=document.createElement('input');input.type='number';input.name=name;input.value=s[name];input.min=['x','y'].includes(name)?0:1;input.max=max;input.step=1;input.setAttribute('aria-label',`源头${i+1} ${label}`);wrap.append(input);fields.append(wrap);
    }
    const target=document.createElement('p');target.className='muted';target.textContent='攻击目标：火光（前哨不可受击）';fields.append(target);
    card.append(fields);$('sources').append(card);
  });
}
function readSources(){return [...document.querySelectorAll('.source')].map(card=>({...Object.fromEntries([...card.querySelectorAll('input')].map(input=>[input.name,input.value.trim()===''?NaN:Number(input.value)])),target:-2}));}
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
  fields('全局',params,'',[['budget','资金',0,10000],['wallCost','墙价',1,1000],['wallHP','墙耐久',1,10000],['enemyPower','每个敌人拆墙/塔伤害/拍',1,99],['defenseRepairPercent','全损维修费占墙/塔造价%',1,100],['controlRadius','控制半径',1,30],['campHP','篝火耐久',1,10000],['campRepairCost','火光修复单价/HP',1,1000]]);
  fields('街区生产（4×4 基准）',params,'',[['productionCostPerCell','基准每格恢复费用',1,1000],['productionIncomePerCell','基准每格每晚收入',1,1000]]);
  fields('击杀收益',params,'',[['killReward','每个原始敌人金币',0,1000]]);
  fields('前哨',params,'',[['outpostCost','造价',1,1000],['outpostRadius','半径',1,30]]);
  for(const type of ['A','B'])fields(`武器 ${type}`,params.weapons[type],type+'.',[['shape','范围形状'],['range','半径',1,8],['power','每拍火力',1,99],['cost','价格',1,1000],['hp','炮塔耐久',1,10000]]);
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
  state.params=structuredClone(params);state.hp=params.campHP;
  for(const body of state.wallHealth.values())body.hp=body.max=params.wallHP;
  for(const [id,type] of state.towers)state.towerHealth.set(id,{hp:params.weapons[type].hp,max:params.weapons[type].hp});
  rebuildTerrain(state);revealControl(state);state.lastNight=null;preparation=null;clearPlayback();

  paramsEditor(state.params);refreshParams();notify('参数已应用，本轮已重置，墙、炮台、前哨与生产点保留。');
};
$('showFog').onchange=()=>{hover=null;update();draw();};
$('cancelParams').onclick=()=>{paramsEditor(state.params);refreshParams();};
$('defaults').onclick=()=>{paramsEditor(DEFAULTS);refreshParams();notify('已填入默认值，点击应用后生效。');};
$('apply').onclick=()=>{
  if(state.phase!=='build')return;
  if(paramsDirty()){notify('请先应用或取消实验参数预览。');return;}
  const sources=readSources(),error=validateSources(sources,state);$('configError').textContent=error;if(error)return;
  state.sources=structuredClone(sources);state.waves[state.day-1]=state.sources;lockAttacks(state);preparation=null;clearPlayback();sourceEditor(state.sources);notify(`第 ${state.day} 晚实验配置已重新出题并锁定；资金与损伤不变。`);update();
};
$('addSource').onclick=()=>{const sources=readSources();if(sources.length>=12){$('configError').textContent='最多 12 个源头。';return;}sources.push({x:1,y:1,hp:12,count:4,first:1,interval:6,target:-2});sourceEditor(sources);};
$('homeView').onclick=()=>resize(true);$('fit').onclick=()=>{zoom=1;panX=(width-base*SIZE)/2;panY=(height-base*SIZE)/2;draw();};$('in').onclick=()=>changeZoom(1.25);$('out').onclick=()=>changeZoom(.8);$('routes').onchange=draw;$('heat').onchange=draw;
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
  if(state.phase!=='build'&&!(state.phase==='battle'&&['build','long'].includes(tool))){notify('防守中只能独立补炮，不能造墙、修复或拆除。');return;}
  if(paramsDirty()){notify('请先应用或取消实验参数预览，再修改布局。');return;}
  const beforeFunds=funds(state),erasedType=tool==='erase'?demolitionQuote(state,id).type:null;let actionError='';
  if(tool==='production'){
    const error=actionError=buildProduction(state,id);notify(error||`街区已恢复！预计每晚收入 +${productionQuote(state,id).income}，守住后自动入账。`);
  } else if(['outpost','repair'].includes(tool)){
    const error=actionError=tool==='repair'?repairFacility(state,id):buildOutpost(state,id);notify(error||(tool==='repair'?'设施已修满，按缺失 HP 扣费。':'前哨已建立；立即扩张控制，不受敌人攻击。建筑挡路时敌人就近绕行，目标仍是火光。'));
    if(!error)sourceEditor(readSources());
  } else if(tool==='wall'){
    const error=actionError=changeWall(state,id);notify(error||'墙已建造；今晚路线不变，敌人到这里会停下攻击。');
  } else if(tool==='erase'){
    const quote=demolitionQuote(state,id);
    const error=actionError=quote.type==='production'?removeProduction(state,id):quote.type==='tower'?removeTower(state,id):quote.type==='outpost'?removeOutpost(state,id):quote.type==='wall'?changeWall(state,id,true):quote.type==='ruin'?clearPlot(state,id):'这里没有可拆除的设施。';
    notify(error||(quote.type==='ruin'?'废墟已免费清理，整块变为空地，可建设前哨或生产设施。':`已${quote.day===state.day?'撤销当天建设':'清除旧设施'}，返还 ${quote.refund} 金币${['production','outpost'].includes(quote.type)?'；地块变为空地':''}。`));
    if(!error&&quote.type==='outpost')sourceEditor(readSources());
  } else {
    const type=weaponType(),error=actionError=weaponPlacementError(id)||buildTower(state,id,type);
    if(error)notify(error);else{notify(`武器 ${type} 已独立建造，每拍火力 +${state.params.weapons[type].power}。`);}
  }
  if(!actionError){
    const delta=funds(state)-beforeFunds,site=['production','outpost'].includes(tool)||(tool==='erase'&&['production','outpost','ruin'].includes(erasedType))?productionSite(id,state):null;
    const names={wall:'墙已建造',build:'近防炮就位',long:'远防炮就位',outpost:'控制区扩张',production:'生产已恢复',repair:'已修满',erase:'已拆除'};
    placementFx={id:site?key(site.x,site.y):id,size:site?.width||site?.size||1,height:site?.height||site?.size||1,start:performance.now(),color:delta<0?'#ffe1a0':'#aef2ce',text:`${names[tool]}${delta?` ${delta>0?'+':''}${delta} 金币`:''}`};
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
  stepBattle(state,motion?.actions);
  motion=null;impactAge=0;timer=0;
  for (const event of state.events) {
    const [x,y] = xy(event.id);
    const defenseText={wallHit:`墙 (${x},${y}) 受到 ${event.value} 点伤害`,towerHit:`炮塔 (${x},${y}) 受到 ${event.value} 点伤害`,wallLost:`墙 (${x},${y}) 被攻破，敌人将沿原路线推进`,towerLost:`炮塔 (${x},${y}) 损坏停火，次日可维修`};
    const text = defenseText[event.type]|| (event.type === 'merge' ? `(${x},${y}) ${event.members} 批合流 → ${event.value}` : event.type === 'leak' ? `篝火受到 ${event.value} 点伤害` : event.type === 'kill' ? `(${x},${y}) 消灭 ${event.members} 批敌人，+${event.value} 资金` : `(${x},${y}) 火力削减 ${event.value}`);
    if(event.type==='merge'&&!explainedMerge){
      explainedMerge=true;$('mergeNotice').hidden=false;
      $('mergeNotice').textContent=`合流：${event.parts.join(' + ')} = ${event.value} HP。同格、同拍、同目标才合并；停留时每拍也扣该格叠加火力，整群消灭才获得合计金币。`;
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
  if (state.phase === 'lost') notify('火光熄灭。检查破墙位置、炮塔受损与持续火力覆盖，可重试当晚。');
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
  const actions=new Map(state.enemies.map(e=>[enemyKey(e),enemyAction(state,e)]));
  motion={elapsed:0,singleStep,actions,actors:state.enemies.map(e=>({...e,to:actions.get(enemyKey(e)).to}))};
  incoming=new Map();
  const add=(id,e)=>{const groupId=enemyKey({...e,id});const old=incoming.get(groupId);if(old){old.hp+=e.hp;old.max+=e.max;old.members+=e.members;}else incoming.set(groupId,{...e,id});};
  for(const e of motion.actors)add(e.to,e);
  for(const source of state.attacks){const age=state.tick+1-source.first;if(age>=0&&age%source.interval===0&&age/source.interval<source.count)add(key(source.x,source.y),{hp:source.hp,max:source.hp,members:1,target:source.target});}
  update();
}
$('step').onclick=()=>{if(state.phase!=='battle'||!paused)return;if(motion){motion.singleStep=true;update();}else beginMotion(true);};
// 移动占一个节拍的后 160ms；加速同步缩短动画，暂停冻结自动移动。
function frame(now){
  const elapsed=Math.min(now-last,100);last=now;
  const dt=elapsed*playbackSpeed;
  const targetMix=state.phase==='build'?0:1;
  if(nightMix!==targetMix){
    const shift=reducedMotion.matches?1:elapsed/600;
    nightMix=targetMix>nightMix?Math.min(targetMix,nightMix+shift):Math.max(targetMix,nightMix-shift);draw();
  }
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
