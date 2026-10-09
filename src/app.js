import {drawFog} from './fog.js?v=2';
import {drawRoadTexture,drawBlockTexture,drawCitySurroundings} from './city-textures.js?v=5';
import {cameraScale,limitZoom,limitPan} from './map-camera.js?v=1';
import {drawCampfire,WATCHTOWER_SVG} from './icons.js?v=2';
import {createGameAudio} from './audio.js?v=4';
import { SIZE, DEFAULTS } from './config.js?v=56';
import { outpostRemovalPreview, towerBuildCost, towerCapacity, buildingCells, buildingRemovalError, rawControlMask, controlMask, controlBoundary, streetEdgeAccess, knownSources, firstNightReady, contentCells, availableCells, economyBuildQuote, embeddingQuote, visionField, clearingError, applyTestScenario, population, productionLabor, housingQuote, housingError, buildHousing, removeHousing, housingRemovalError, initialView, isExplored, revealControl, plotContent, clearPlot, outpostAt, rebuildTerrain, demolitionQuote, buildTower, removeTower, battleRoutes, productionId, productionCells, productionQuote, productionControlled, productionActive, productionSite, productionError, buildProduction, removeProduction, expectedIncome, key, xy, inside, createCampaign, reservedSources, campaignComplete, campCritical, beginBattle, restoreNight, restartCampaign, coverage, fireField, funds, placementError, validateSources, stepBattle, wallPreview, changeWall, validateParams, inControl, forecastAttacks, lockAttacks, enemyAction, enemyKey, repairQuote, repairError, repairFacility, outpostError, buildOutpost, removeOutpost, enterMorning } from './model.js?v=63';
import {generateCityMap} from './city-map.js?v=8';
import {readMapSettings} from './map-settings.js';
const mapSettings=readMapSettings(location.search);
mapSettings.width=SIZE;mapSettings.height=SIZE;
const cityLayout=generateCityMap(mapSettings);
const $ = id => document.getElementById(id);
// Canvas 报价直接复用钱包与工具 SVG，资源和炮图标不另建一套图形。
document.querySelector('#outpost .tool-name').innerHTML=WATCHTOWER_SVG+' 瞭望塔';
const resourceIcons={};
for(const [name,selector] of [['coin','.wallet .coin-icon'],['people','.population-main svg'],['watch','#outpost svg'],['military','#build .weapon-icon']]){
  const svg=document.querySelector(selector).cloneNode(true);
  svg.setAttribute('xmlns','http://www.w3.org/2000/svg');svg.setAttribute('width','32');svg.setAttribute('height','32');svg.style.color='#f4d3a2';
  if(name==='military')svg.setAttribute('fill','currentColor');
  const image=new Image();image.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(new XMLSerializer().serializeToString(svg));resourceIcons[name]=image;
}
const sound=createGameAudio();
// 玩家声音偏好独立于实验参数和战前快照，重试不会重新打开已关闭的声音。
function updateAudioControls(){
  const prefs=sound.settings;
  $('musicEnabled').checked=prefs.music;$('effectsEnabled').checked=prefs.effects;
  $('musicVolume').value=Math.round(prefs.musicVolume*100);$('effectsVolume').value=Math.round(prefs.effectsVolume*100);
  $('musicVolume').disabled=!prefs.music;$('effectsVolume').disabled=!prefs.effects;
  $('audioSummary').textContent=prefs.music||prefs.effects?'声音':'声音 · 已静音';
}
for(const [id,name] of [['musicEnabled','music'],['effectsEnabled','effects']])$(id).onchange=()=>{
  sound.configure({[name]:$(id).checked});sound.unlock();updateAudioControls();
  if(name==='effects'&&$(id).checked)sound.play('coin');
};
for(const [id,name] of [['musicVolume','musicVolume'],['effectsVolume','effectsVolume']])$(id).oninput=()=>{
  sound.configure({[name]:Number($(id).value)/100});updateAudioControls();
};
const unlockAudio=()=>sound.unlock();
document.addEventListener('pointerdown',unlockAudio,{capture:true});
document.addEventListener('keydown',unlockAudio,{capture:true});
document.addEventListener('click',event=>{if(!$('audioSettings').contains(event.target))$('audioSettings').open=false;});
document.addEventListener('keydown',event=>{if(event.key==='Escape')$('audioSettings').open=false;});
sound.setHidden(document.hidden);updateAudioControls();
const canvas = $('map'), ctx = canvas.getContext('2d'), viewport = $('viewport');
let state = createCampaign(DEFAULTS,undefined,cityLayout), tool = 'wall', hover = null, dragging = null;
let zoom = 1, base = 20, panX = 0, panY = 0, width = 0, height = 0, cameraBottom=80;
let fire = fireField(state), paused = false, timer = 0, last = 0;
let messages = [], preparation = null, explainedMerge = false;
const canBuildWeapon = () => ['build','battle'].includes(state.phase);
const weaponPlacementError=id=>placementError(state,id,weaponType())||(motion?.actors.some(e=>e.to===id)?'敌人正进入该格，请选择其他炮位。':'');
let motion = null, impactAge = 1000, incoming = new Map();
const MOVE_MS = 160, IMPACT_MS = 220;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
let placementFx = null, playbackSpeed = 1, recentGain = 0, gainUntil = 0, dawnAt = 0, receiptUntil = 0;
let nightMix = 0, sight=visionField(state), lastFogFrame=0;
// 只对环境配色插值，敌人、路线、血条等决策信息不经过压暗滤镜。
const terrainColors={groundA:[[88,99,88],[21,32,49]],groundB:[[94,105,94],[25,37,54]],grid:[[114,125,112],[43,58,77]],wall:[[130,137,124],[69,82,101]],fog:[[86,103,98],[20,32,45]]};
function terrainColor(name){
  const [day,night]=terrainColors[name];return `rgb(${day.map((v,i)=>Math.round(v+(night[i]-v)*nightMix)).join(',')})`;
}
const colors = ['#df9989', '#a6a1e9', '#d5bd79', '#78bcd3'];
const notify = message => { $('notice').textContent = message; };
let topNoticeTimer=null;
// 操作失败的顶栏提示只短暂显示；下次点击先清除，首晚教学提示保持原规则。
function dismissTopNotice(){
  if(topNoticeTimer===null)return;
  clearTimeout(topNoticeTimer);topNoticeTimer=null;
  if($('notice').textContent===$('firstNightNotice').textContent)notify('');
  $('firstNightNotice').hidden=true;
}
document.addEventListener('pointerdown',dismissTopNotice,{capture:true});
const weaponType = () => tool === 'long' ? 'B' : 'A';
const viewedSources = () => state.waves[Number($('forecastDay').value)];
const selectedWeapon = () => previewParams().weapons[weaponType()];
const economyAction=q=>q.mode==='renovation'?'修缮':q.mode==='mixed'?'修缮/新建':'新建';
// 调试显示不写入探索记录，重新显示迷雾时仍保持真实探索进度。
const visibleCell=id=>!$('showFog').checked||isExplored(state,id);
const currentlyVisible=id=>!$('showFog').checked||sight.has(id);
function clipSight(){if(!$('showFog').checked)return;ctx.beginPath();for(const id of sight){const [x,y]=xy(id);ctx.rect(x,y,1,1);}ctx.clip();}
const paramsDirty = () => JSON.stringify(readParams()) !== JSON.stringify(state.params);
function previewParams() {
  const draft = readParams();
  return state.phase === 'build' && !validateParams(draft,state,false) ? draft : state.params;
}


// 画布使用设备像素比，地图输入和绘制都以 CSS 像素换算。
function resize(fit = false) {
  const oldW = width, oldH = height,oldCell=base*zoom,oldBottom=cameraBottom;
  width = viewport.clientWidth; height = viewport.clientHeight;
  canvas.width = Math.round(width * devicePixelRatio); canvas.height = Math.round(height * devicePixelRatio);
  cameraBottom=Math.max(80,viewport.querySelector('.map-tools').offsetHeight+24);
  base = cameraScale(width,height,SIZE,cameraBottom);
  if (fit || !oldW) { const view=initialView(state);zoom=limitZoom(SIZE/30,base);panX=width/2-(view.x+15)*base*zoom;panY=(height-cameraBottom)/2-(view.y+15)*base*zoom-6; }
  else {
    // 窗口变化时保留镜头中心与格子大小；全图状态继续适应新窗口。
    const centerX=(oldW/2-panX)/oldCell,centerY=((oldH-oldBottom)/2-panY)/oldCell;
    zoom=limitZoom(zoom===1?1:oldCell/base,base);
    panX=width/2-centerX*base*zoom;panY=(height-cameraBottom)/2-centerY*base*zoom;
  }
  constrainCamera();
  draw();
}
function constrainCamera(){
  const pan=limitPan(panX,panY,width,height,SIZE,base*zoom,cameraBottom);panX=pan.x;panY=pan.y;
}
function changeZoom(factor, x = width / 2, y = (height-cameraBottom) / 2) {
  const old = zoom; zoom = limitZoom(zoom * factor,base);
  panX = x - (x - panX) * zoom / old; panY = y - (y - panY) * zoom / old;
  constrainCamera();hover=null;
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
  // 地图外与远处雾使用同一底色，宽屏留白也不出现另一块纯色平面。
  const backdrop=`rgb(${Math.round(32-nightMix*12)},${Math.round(48-nightMix*15)},${Math.round(57-nightMix*10)})`;
  ctx.fillStyle=backdrop;ctx.fillRect(0,0,width,height);
  const controlState={...state,params:previewParams()};
  const controlRadius = controlState.params.controlRadius;
  const rawControlled=rawControlMask(controlState,controlRadius),controlled=controlMask(controlState,controlRadius,rawControlled);
  const wallEdit = hover !== null && state.phase === 'build' && (tool==='wall'||(tool==='erase'&&!productionSite(hover,state)&&!state.towers.has(hover)&&!state.outposts.has(hover)));
  const candidate = wallEdit ? wallPreview(state,hover,tool==='erase') : null;
  const postRemoval=tool==='erase'&&hover!==null&&state.phase==='build'&&state.outposts.has(hover)?outpostRemovalPreview(state,hover):null;
  const repairHover=hover!==null&&state.phase==='build'&&tool==='repair';
  const postHover=hover!==null&&state.phase==='build'&&tool==='outpost';
  const postSpacingConflict=postHover&&[...state.outposts.keys()].some(id=>{const [x,y]=xy(id),[hx,hy]=xy(hover);return Math.hypot(x-hx,y-hy)<state.params.outpostMinDistance;});
  const postError=postHover?(paramsDirty()?'请先应用或取消参数预览。':outpostError(state,hover)):'';
  const postGhost=postHover&&!postError;
  const previewState=postGhost?{...state,outposts:new Map([...state.outposts,[hover,{day:state.day}]])}:state;
  const previewControlled=postGhost?controlMask(previewState):controlled;
  const knownIds=new Set(knownSources(state).map(s=>key(s.x,s.y)));
  const plannedRoutes=forecastAttacks(state,Number($('forecastDay').value)+1).map(attack=>knownIds.has(key(attack.x,attack.y))?attack:{...attack,path:[]});
  const sourcePath=source=>plannedRoutes[viewedSources().indexOf(source)]?.path||[];
  const weaponSelected=canBuildWeapon()&&['build','long'].includes(tool),weaponPlacementReady=weaponSelected&&!paramsDirty();
  const weaponHover=hover!==null&&weaponSelected;
  const weapon=selectedWeapon();
  const previewError=weaponHover ? (paramsDirty()?'请先应用或取消实验参数预览。':weaponPlacementError(hover)) : '';
  const ghost=weaponHover&&!previewError;
  const added=new Set(ghost?coverage(hover,weapon.range,weapon.shape):[]);
  // 只预览本次建设的确定变化，不模拟整波胜负。
  $('placementInfo').textContent=weaponHover ? (previewError||`建造预览 · 每格火力 +${weapon.power} · 花费 ${towerBuildCost(state,weaponType())} · 建造后剩余 ${funds(state)-towerBuildCost(state,weaponType())+embeddingQuote(state,hover).refund}`) : '';


  if(tool==='wall'&&candidate){
    $('placementInfo').textContent=candidate.error||`建墙预览 · 花费 ${state.params.wallCost} · HP ${state.params.wallHP}。可封住道路；今晚路线不变，敌人撞墙后攻击。`;
  }
  if(postHover)$('placementInfo').textContent=postError||`建设预览 · ${[...previewControlled].filter(id=>!controlled.has(id)).length} 格新增控制 · 花费 ${state.params.outpostCost}`;

  if(repairHover){const quote=repairQuote(state,hover);$('placementInfo').textContent=repairError(state,hover)||`维修预览 · 恢复 ${quote.restore} HP · 花费 ${quote.cost} · 剩余 ${funds(state)-quote.cost}`;}

  if(postGhost){
    const sites=state.sites.map(p=>key(p.x,p.y)).filter(id=>id!==productionId(hover,state)&&!['outpost','housing'].includes(plotContent(state,id).type)&&!state.production.has(id)&&productionControlled(previewState,id)&&!productionControlled(state,id));
    $('placementInfo').textContent+=` · 新纳入 ${sites.length} 处生产机会：另需 ${sites.reduce((n,id)=>n+productionQuote(state,id).cost,0)} 钱恢复，可增 ${sites.reduce((n,id)=>n+productionQuote(state,id).income,0)}/晚（尚未入账）`;
  }
  if(tool==='housing'&&hover!==null){const q=economyBuildQuote(state,hover,'housing');$('placementInfo').textContent=housingError(state,hover)||`住房${economyAction(q)} · 新增 ${q.added} 格 · 入住 +${q.residents} 人 · 花费 ${q.cost} · 剩余 ${funds(state)-q.cost}`;}
  if(tool==='production'&&hover!==null)$('placementInfo').textContent=productionError(state,hover)||`整块恢复预览 · 需要 ${productionLabor(state,hover)} 人（空闲 ${population(state).free}） · 每晚收入 +${productionQuote(state,hover).income} · 花费 ${productionQuote(state,hover).cost} · 剩余 ${funds(state)-productionQuote(state,hover).cost}`;

  const refundPreview=$('refundPreview'),erasePreview=$('erasePreview'),repairPreview=$('repairPreview'),campHPPreview=$('campHPPreview'),campBarPreview=$('campBarPreview');
  refundPreview.hidden=true;erasePreview.hidden=true;repairPreview.hidden=true;$('moneyGain').hidden=false;
  refundPreview.classList.remove('spend-preview');campHPPreview.hidden=true;campBarPreview.hidden=true;
  // 报价与实际修复共用余额计算；篝火显示本次可购买的 HP，保留不足单价的余款。
  if(repairHover){
    const quote=repairQuote(state,hover),error=repairError(state,hover);
    if(quote.missing>0){
      repairPreview.hidden=false;repairPreview.classList.toggle('unaffordable',!!error);
      const previewKey=`${quote.type}:${quote.cost}:${quote.restore}`;
      if(repairPreview.dataset.quote!==previewKey){
        repairPreview.dataset.quote=previewKey;repairPreview.textContent=`−${quote.cost}`;
        repairPreview.append(document.querySelector('.price-coin').cloneNode(true));
        if(quote.type==='camp'){
          const gain=document.createElement('span');gain.className='repair-hp';gain.textContent=`+${quote.restore} HP`;repairPreview.append(gain);
        }
      }
      // 只把可执行修复的扣款和恢复段叠在资源上，真实余额、HP 与危急状态不变。
      if(!error&&quote.cost>0){
        refundPreview.hidden=false;refundPreview.classList.add('spend-preview');$('moneyGain').hidden=true;
        refundPreview.textContent=`−${quote.cost}`;refundPreview.setAttribute('aria-label',`预计花费 ${quote.cost} 金币，余额将为 ${funds(state)-quote.cost}`);
        if(quote.type==='camp'){
          campHPPreview.hidden=false;campHPPreview.textContent=`+${quote.restore}`;
          campHPPreview.setAttribute('aria-label',`预计恢复 ${quote.restore} HP，修复后 ${state.hp+quote.restore} / ${state.params.campHP}`);
          campBarPreview.hidden=false;campBarPreview.style.left=`${state.hp/state.params.campHP*100}%`;campBarPreview.style.width=`${quote.restore/state.params.campHP*100}%`;
        }
      }
    }
  }
  if(tool==='erase'&&hover!==null&&state.phase==='build'){
    const quote=demolitionQuote(state,hover);
    const error=quote.type==='outpost'?postRemoval?.error:quote.type==='housing'?housingRemovalError(state,hover):quote.type==='production'?buildingRemovalError(state,hover):quote.type==='ruin'?clearingError(state,hover):quote.type==='wall'?wallPreview(state,hover,true).error:'';
    $('placementInfo').textContent=error||(!quote.type?'这里没有可拆设施。':quote.type==='ruin'?'清理为空地，不占人口。':quote.type==='outpost'?'拆除瞭望塔须先解除外围控制依赖。':'');
    if(quote.type&&!error){
      // 预览独立于已到账提示，不改真实余额，也不覆盖战斗收入动画。
      refundPreview.hidden=false;erasePreview.hidden=false;$('moneyGain').hidden=true;
      refundPreview.textContent=`+${quote.refund}`;refundPreview.setAttribute('aria-label',`预计返还 ${quote.refund} 金币，余额将为 ${funds(state)+quote.refund}`);
      if(erasePreview.dataset.refund!==String(quote.refund)){
        erasePreview.dataset.refund=String(quote.refund);erasePreview.textContent=`↩${quote.refund}`;
        erasePreview.append(document.querySelector('.price-coin').cloneNode(true));
      }
    }
  }
  const hoveredSite=hover!==null?productionSite(hover,state):null;
  if(hoveredSite){
    const quote=productionQuote(state,hover),content=plotContent(state,hover);
    const summary=`${hoveredSite.width??hoveredSite.size}×${hoveredSite.height??hoveredSite.size} 地块 · ${quote.area} 格 · ${content.status==='empty'?'空地':content.status==='ruin'?(content.type==='housing'?'住房废墟':'生产废墟'):content.type==='outpost'?'瞭望塔建筑':content.type==='housing'?'住房':'生产建筑'}。`;
    if(hoveredSite.role==='camp'){
      // 修复时保留实际 HP、费用或余额不足提示。
      if(!repairHover)$('placementInfo').textContent='火光广场 · 3×3 · 敌人进入任意一格就会伤害火光。';
    }
    else if(hoveredSite.role==='hospital')$('placementInfo').textContent='医院暂不可操作。';
    else if(tool==='production'){const q=economyBuildQuote(state,hover,'production');$('placementInfo').textContent=summary+(productionError(state,hover)||`${economyAction(q)} ${q.added} 格 · 用工 +${q.labor} 人 · 花费 ${q.cost} · 完成后每天 +${q.income}${q.income>0&&q.added===availableCells(state,hover).length?` · 本次投入约 ${Math.ceil(q.cost/q.income)} 晚回本`:""}。`);}
    else if(tool!=='erase')$('placementInfo').textContent=summary+($('placementInfo').textContent||'选择生产、住房、瞭望塔或拆除工具。');
  }

  if(weaponHover&&productionSite(hover,state)){const capacity=towerCapacity(state,hover);$('placementInfo').textContent+=` · 炮位 ${capacity.used}/${capacity.max}`;}
  if(weaponHover&&!previewError){const q=embeddingQuote(state,hover);$('placementInfo').textContent+=`${q.residents||q.released?` · 空闲 ${population(state).free} → ${q.freeAfter}`:''}${q.residents?` · 人口 −${q.residents}`:''}${q.released?` · 释放用工 ${q.released} 人`:''}${q.incomeLoss?` · 每天收入 −${q.incomeLoss}`:''}${q.refund?` · 拆返 +${q.refund} 金币`:''}`;}

  ctx.save(); ctx.translate(panX, panY); ctx.scale(size, size);
  drawCitySurroundings(ctx,cityLayout,nightMix,$('showFog').checked?state.explored:null,backdrop);
  // 全部地形、路线、敌群与源头都受探索遮罩约束，不能透过雾获取信息。
  ctx.fillStyle=palette.fog;ctx.fillRect(0,0,SIZE,SIZE);
  if(!visibleCell(key(30,15))){ctx.fillStyle='#8997a8';ctx.font='600 1.5px system-ui';ctx.textAlign='center';ctx.fillText('未探索 · 向北推进',30,15);}

  const eligibleCells=new Set();
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
    const id = key(x, y), power = fire.get(id) || 0;
    ctx.fillStyle = tool!==null&&(x + y) % 2 ? palette.groundA : palette.groundB;
    ctx.fillRect(x, y, 1, 1);
    if(state.layout?.tiles[id]==='road')drawRoadTexture(ctx,state.layout,x,y,nightMix);
    if(productionSite(id,state)&&!state.blocked.has(id)){ctx.fillStyle=nightMix>.5?'#2c4841':'#77967b';ctx.fillRect(x,y,1,1);}
    if ($('heat').checked && power) { ctx.fillStyle = `rgba(99,211,166,${Math.min(.6,.17 + power * .045)})`; ctx.fillRect(x, y, 1, 1); }
    if (state.walls.has(id)&&!state.blocked.has(id)) {
      ctx.fillStyle = palette.wall; ctx.fillRect(x + .05, y + .05, .9, .9);
      ctx.fillStyle='#0c171c77';ctx.fillRect(x+.05,y+.78,.9,.17);
      ctx.fillStyle='#93a197';ctx.fillRect(x+.05,y+.05,.9,.10);
      ctx.strokeStyle = '#81918b'; ctx.lineWidth = .045; ctx.beginPath(); ctx.moveTo(x + .15, y + .8); ctx.lineTo(x + .8, y + .15); ctx.stroke();
    }
    const wallBody=state.wallHealth.get(id);
    if(wallBody?.hp===0){ctx.fillStyle='#956b57';ctx.fillRect(x+.1,y+.6,.8,.24);ctx.strokeStyle='#dfaa81';ctx.lineWidth=.06;ctx.beginPath();ctx.moveTo(x+.2,y+.2);ctx.lineTo(x+.8,y+.8);ctx.stroke();}
    if(wallBody&&wallBody.hp>0&&wallBody.hp<wallBody.max){ctx.fillStyle='#533a32';ctx.fillRect(x+.1,y+.85,.8,.1);ctx.fillStyle='#ecc58f';ctx.fillRect(x+.1,y+.85,.8*wallBody.hp/wallBody.max,.1);}
    if(postGhost&&previewControlled.has(id)&&!controlled.has(id)){ctx.fillStyle='#f0d18b66';ctx.fillRect(x,y,1,1);}
    if (!controlled.has(id)) {ctx.fillStyle=state.layout?.tiles[id]==='road'?'#07121522':'#07121577';ctx.fillRect(x,y,1,1);}
    else {
      ctx.fillStyle='#7fc8e810';ctx.fillRect(x,y,1,1);
      // 炮位高亮复用实际建设校验，容量、资金、人力和正进入的敌人均会影响可建格。
      const free=!state.playerWalls.has(id)&&!state.towers.has(id)&&!state.outposts.has(id)&&id!==state.camp&&!reservedSources(state).some(a=>key(a.x,a.y)===id);
      const eligible=free&&(tool==='wall'?rawControlled.has(id)&&!state.walls.has(id):weaponPlacementReady&&!weaponPlacementError(id));
      if((state.phase==='build'||(state.phase==='battle'&&['build','long'].includes(tool)))&&eligible)eligibleCells.add(id);
    }
    // 小格网仅服务当前工具；取消选择后保留城市地块和控制边界，不显示棋盘。
    if(tool!==null){
      ctx.save();if(state.layout?.tiles[id]==='road')ctx.globalAlpha=.18;
      ctx.strokeStyle = palette.grid; ctx.lineWidth = .025; ctx.strokeRect(x, y, 1, 1);ctx.restore();
    }
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
  ctx.save();clipSight();
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
  ctx.restore();
  if (tool !== null && hover !== null && (state.phase === 'build' || weaponHover) && (!productionSite(hover,state)||weaponHover||postHover)) {
    const isWeapon = ['build','long'].includes(tool), weapon = selectedWeapon();
    const error = isWeapon ? previewError : tool==='production'?productionError(state,hover):tool==='housing'?housingError(state,hover):repairHover?repairError(state,hover):postHover?postError:postRemoval?postRemoval.error:candidate?.error;
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
      for(const id of new Set(viewedSources().flatMap(sourcePath)))if(added.has(id)&&currentlyVisible(id)){
        const [x,y]=xy(id);ctx.strokeRect(x+.12,y+.12,.76,.76);
      }
    }
    const [x,y] = xy(hover); ctx.strokeStyle = error ? '#ff8078' : '#d8f9e8'; ctx.lineWidth = .08; ctx.strokeRect(x+.04,y+.04,.92,.92);
  }
  const label = (text,x,y,color,font=.4) => {ctx.fillStyle=color;ctx.font=`600 ${font}px system-ui`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,x,y);};
  for (const id of new Set([...($('heat').checked?fire.keys():[]),...added])) {
    const [x,y]=xy(id), changed=added.has(id);
    if(!state.walls.has(id)){
      // 数值使用深色小底与描边，局部遮住装饰中线，确保火力信息优先。
      const value=(fire.get(id)||0)+(changed?weapon.power:0),font=Math.max(changed?.43:.35,9/size);
      ctx.save();ctx.font=`600 ${font}px system-ui`;const tw=ctx.measureText(String(value)).width;
      ctx.fillStyle='#102b2be6';ctx.fillRect(x+.5-tw/2-.09,y+.5-font*.6,tw+.18,font*1.2);
      label(value,x+.5,y+.5,changed?'#f0ffad':'#cbffe5',font);ctx.restore();
    }
  }
  for(const p of state.sites){
    const {x,y}=p,n=p.width??p.size,m=p.height??p.size,id=key(x,y),built=state.production.has(id),active=built&&productionActive(state,id),selected=productionId(hover,state)===id&&(['production','housing'].includes(tool)||(tool==='erase'&&['production','housing','ruin'].includes(demolitionQuote(state,hover).type))),empty=plotContent(state,id).status==='empty';
    // 悬停时把街区作为一个操作对象，盖住内部格线，避免误认为逐格恢复。
    if(p.role==='camp'){ctx.fillStyle=nightMix>.5?'#49433a':'#ad9468';ctx.fillRect(x+.08,y+.08,n-.16,m-.16);ctx.strokeStyle='#e8c481';ctx.lineWidth=.10;ctx.strokeRect(x+.12,y+.12,n-.24,m-.24);continue;}
    if(empty){ctx.strokeStyle=selected?'#fff0ae':'#a8d5ad';ctx.lineWidth=selected?.12:.06;ctx.setLineDash([.2,.12]);ctx.strokeRect(x+.08,y+.08,n-.16,m-.16);ctx.setLineDash([]);continue;}
    // 按物理 footprint 画建筑，屋顶炮位保留建筑底色；经营面积独立计算。
    ctx.save();ctx.beginPath();
    for(const cell of buildingCells(state,id)){if(postGhost&&cell===hover)continue;const [cx,cy]=xy(cell);ctx.rect(cx,cy,1,1);}ctx.clip();
    ctx.fillStyle=selected?(active?'#527e59':built?'#80594e':'#655f3d'):active?'#527e59':built?'#80594e':nightMix>.5?'#494b42':'#81745b';ctx.fillRect(x+.08,y+.08,n-.16,m-.16);
    ctx.strokeStyle=selected?'#fff0ae':productionControlled(previewState,id)?'#f5d789':'#a29670';ctx.lineWidth=selected?.12:.06;ctx.strokeRect(x+.08,y+.08,n-.16,m-.16);
    // 同一整块用材质区分废墟、生产和居住，日夜分别取缓存贴图。
    drawBlockTexture(ctx,p,plotContent(state,id).status==='ruin'?`${plotContent(state,id).type}-ruin`:plotContent(state,id).type,nightMix);
    if(p.role==='hospital'){ctx.fillStyle='#cbd7cb';ctx.fillRect(x+3,y+3,4,6);ctx.fillStyle='#478b80';ctx.fillRect(x+4.5,y+4,1,4);ctx.fillRect(x+3.5,y+5.5,3,1);}
    if(p.special){ctx.strokeStyle='#d5b5fc';ctx.lineWidth=.12;ctx.strokeRect(x+.16,y+.16,n-.32,m-.32);}
    if(selected)for(const cell of productionCells(id,state))if(!inControl(previewState,cell)){const [cx,cy]=xy(cell);ctx.fillStyle='#ed665877';ctx.fillRect(cx,cy,1,1);}
    if(active&&nightMix>0){
      ctx.save();ctx.globalAlpha=nightMix;ctx.fillStyle='#ffe4a1';
      for(let i=0;i<n;i++){ctx.fillRect(x+.18+i,y+.18,.18,.18);ctx.fillRect(x+.18+i,y+m-.36,.18,.18);}ctx.restore();
    }
    ctx.restore();
    const occupied=new Set(buildingCells(state,id));ctx.strokeStyle=selected?'#fff0ae':'#b2a47b';ctx.lineWidth=.06;ctx.beginPath();
    for(const cell of occupied){const [cx,cy]=xy(cell);if(!occupied.has(key(cx-1,cy))){ctx.moveTo(cx,cy);ctx.lineTo(cx,cy+1);}if(!occupied.has(key(cx+1,cy))){ctx.moveTo(cx+1,cy);ctx.lineTo(cx+1,cy+1);}if(!occupied.has(key(cx,cy-1))){ctx.moveTo(cx,cy);ctx.lineTo(cx+1,cy);}if(!occupied.has(key(cx,cy+1))){ctx.moveTo(cx,cy+1);ctx.lineTo(cx+1,cy+1);}}ctx.stroke();
    // 街区标签在屏幕空间绘制，缩小棋盘时仍保持可读。
  }
  for(const id of eligibleCells){
    const [x,y]=xy(id);
    if(weaponSelected){ctx.fillStyle='#75ebbe38';ctx.fillRect(x+.04,y+.04,.92,.92);ctx.strokeStyle='#95f1cf';ctx.lineWidth=.07;ctx.strokeRect(x+.08,y+.08,.84,.84);}
    else{ctx.fillStyle='#a9d4cb99';ctx.fillRect(x+.45,y+.45,.1,.1);}
  }
  // 建筑整体归属的轮廓最后绘制，避免被屋顶贴图盖住；开放地面仍逐格走边。
  ctx.strokeStyle='#86ccea';ctx.lineWidth=.08;ctx.setLineDash([.16,.12]);ctx.beginPath();
  for(const [a,b,c,d] of controlBoundary(controlled)){ctx.moveTo(a,b);ctx.lineTo(c,d);}
  ctx.stroke();ctx.setLineDash([]);
  // 拆除高亮只覆盖实际对象：物理建筑或独立设施一格。
  if(tool==='erase'&&hover!==null&&state.phase==='build'){
    const q=demolitionQuote(state,hover),cells=['production','housing','ruin'].includes(q.type)?buildingCells(state,hover):q.type?[hover]:[];
    ctx.fillStyle='#ef987744';ctx.strokeStyle='#ffd0a1';ctx.lineWidth=.08;
    for(const id of cells){const [x,y]=xy(id);ctx.fillRect(x+.04,y+.04,.92,.92);ctx.strokeRect(x+.04,y+.04,.92,.92);}
  }
  for (const [id,type] of [...state.towers,...(ghost?[[hover,weaponType()]]:[])]) {
    ctx.save();if(ghost&&id===hover)ctx.globalAlpha=.5;
    const [x,y] = xy(id);ctx.fillStyle='#253e3a';ctx.fillRect(x+.04,y+.04,.92,.92);ctx.strokeStyle='#92c8b8';ctx.lineWidth=.06;ctx.strokeRect(x+.04,y+.04,.92,.92);ctx.fillStyle=type==='B'?'#bab3f2':'#8bdbb9'; ctx.fillRect(x+.18,y+.22,.64,.6); ctx.fillStyle='#28483b'; ctx.fillRect(x+.37,y+.32,.26,.38); ctx.fillStyle='#ddffe7'; ctx.fillRect(x+.43,y+.08,.14,.35);if(type==='B'){ctx.fillRect(x+.22,y+.12,.12,.34);ctx.fillRect(x+.66,y+.12,.12,.34);}
    // 已有炮位与可建空位使用不同颜色；预览炮不计入已用容量。
    if(weaponSelected&&state.towers.has(id)){ctx.strokeStyle='#ffdb83';ctx.lineWidth=.10;ctx.strokeRect(x+.03,y+.03,.94,.94);}
    ctx.restore();
  }
  // 间距按格心判定：只在待建点冲突时显示全部禁建格，轮廓与合法位置一致。
  if(postSpacingConflict){
    ctx.save();ctx.strokeStyle='#e9a386';ctx.fillStyle='#df79531c';ctx.lineWidth=.06;ctx.setLineDash([.18,.12]);
    for(const id of state.outposts.keys()){
      const [x,y]=xy(id),radius=state.params.outpostMinDistance;
      const cells=new Set(coverage(id,radius,'square').filter(cell=>{const [cx,cy]=xy(cell);return Math.hypot(cx-x,cy-y)<radius;}));
      ctx.beginPath();for(const cell of cells){const [cx,cy]=xy(cell);ctx.rect(cx,cy,1,1);}ctx.fill();
      ctx.beginPath();for(const [a,b,c,d] of controlBoundary(cells)){ctx.moveTo(a,b);ctx.lineTo(c,d);}ctx.stroke();
    }
    ctx.restore();
  }
  for(const [id,p] of previewState.outposts){
    const [x,y]=xy(id);ctx.save();if(postGhost&&id===hover)ctx.globalAlpha=.5;
    if(resourceIcons.watch.complete&&resourceIcons.watch.naturalWidth)ctx.drawImage(resourceIcons.watch,x,y,1,1);
    ctx.restore();
  }
  // 敌源共用红色切角轮廓；细色条仅对应路线，不暗示不同敌种。
  const drawSource=(source,index)=>{
    const {x,y}=source;ctx.save();ctx.globalAlpha=source.active?1:.35;
    ctx.fillStyle='#632f36';ctx.strokeStyle='#ff9a8b';ctx.lineWidth=.09;
    ctx.beginPath();ctx.moveTo(x+.23,y+.04);ctx.lineTo(x+.77,y+.04);ctx.lineTo(x+.96,y+.23);ctx.lineTo(x+.96,y+.77);ctx.lineTo(x+.77,y+.96);ctx.lineTo(x+.23,y+.96);ctx.lineTo(x+.04,y+.77);ctx.lineTo(x+.04,y+.23);ctx.closePath();ctx.fill();ctx.stroke();ctx.setLineDash([]);
    ctx.fillStyle=colors[index%colors.length];ctx.fillRect(x+.24,y+.79,.52,.08);
    label(index+1,x+.5,y+.43,'#fff0e9',Math.max(.5,9/size));
    ctx.restore();
  };
  knownSources(state).forEach(source=>drawSource(source,source.index));
  const [cx,cy] = xy(state.camp);
  // 火光是共同守护目标，用局部光晕定位；不暗化整个战场。
  ctx.save();
  if(campCritical(state))ctx.globalAlpha=reducedMotion.matches?1:.6+.4*(.5+.5*Math.cos(performance.now()*Math.PI*2/1400));
  const glow=ctx.createRadialGradient(cx+.5,cy+.5,.1,cx+.5,cy+.5,1.8);
  glow.addColorStop(0,state.hp<=0?'#ffc17c00':campCritical(state)?'#f5847c99':'#ffc17c44');glow.addColorStop(1,'#ffc17c00');ctx.fillStyle=glow;ctx.fillRect(cx-1.3,cy-1.3,3.6,3.6);
  drawCampfire(ctx,cx,cy,1,state.hp>0);
  ctx.restore();
  const impact = Math.min(1,impactAge/IMPACT_MS);
  ctx.save();clipSight();
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
      if(['merge','hit','wallHit','wallLost'].includes(event.type)) {
        const text=event.type==='merge'?`合流 ${event.value}`:event.type==='wallLost'?'攻破':`−${event.value}`;
        ctx.font='600 .43px system-ui';ctx.textAlign='center';ctx.textBaseline='bottom';ctx.lineWidth=.12;ctx.strokeStyle='#142024';ctx.strokeText(text,x+.5,y-.05-impact*.3);ctx.fillStyle=event.type==='merge'?'#ffe0a1':'#ffb1a3';ctx.fillText(text,x+.5,y-.05-impact*.3);
      }
    }
  }
  ctx.restore();
  if($('showFog').checked)drawFog(ctx,SIZE,sight,state.explored,nightMix,reducedMotion.matches?0:performance.now()/1000);
  if(postRemoval?.disconnected.size){
    // 红色覆盖与轮廓标出将成为孤岛的基础控制区；仅是预览，不实际撤回控制。
    ctx.save();clipSight();ctx.fillStyle='#ef675b33';
    for(const id of postRemoval.disconnected){const [x,y]=xy(id);ctx.fillRect(x,y,1,1);}
    ctx.strokeStyle='#ff9185';ctx.lineWidth=.12;ctx.setLineDash([.25,.15]);ctx.beginPath();
    for(const [x,y,nx,ny] of controlBoundary(postRemoval.disconnected)){ctx.moveTo(x,y);ctx.lineTo(nx,ny);}ctx.stroke();ctx.restore();
  }
  ctx.restore();
  // 街区报价有字号上限，并随地块缩小以保持边缘留白。
  for(const p of state.sites){
    const id=key(p.x,p.y),built=state.production.has(id),active=built&&productionActive(state,id);
    // 敌人经过街区时优先显示敌群，避免标签盖住生命与血条。
    const cells=productionCells(id,state);
    if(p.role==='hospital'?!visibleCell(key(p.x+Math.floor((p.width??p.size)/2),p.y+Math.floor((p.height??p.size)/2))):!cells.every(cell=>visibleCell(cell)))continue;
    // 已探索但失去视野的街区只保留暗淡地形，报价不越过迷雾。
    if(p.role!=='hospital'&&!cells.some(cell=>currentlyVisible(cell)))continue;
    if(p.role!=='hospital'&&!weaponSelected&&!['production','housing'].includes(tool))continue;
    // 第一天尚未开放经营；正常报价随地块缩放，不再因镜头缩小突然消失。
    if(p.role!=='hospital'&&!weaponSelected&&state.day===1&&productionId(hover,state)!==id)continue;
    if((motion?.actors||state.enemies).some(e=>cells.includes(e.id)||cells.includes(e.to)))continue;
    const x=panX+(p.x+(p.width??p.size)/2)*size;
    let y=panY+(p.y+(p.height??p.size)/2)*size;
    // 窄街区的容量标签放在未架炮的行，避免把已有炮的图标遮住。
    if(weaponSelected&&(p.width??p.size)<=2){
      const occupied=[...state.towers.keys()].filter(cell=>productionId(cell,state)===id).map(cell=>xy(cell)[1]);
      if(occupied.length){
        const rows=Array.from({length:p.height??p.size},(_,i)=>p.y+i).filter(row=>!occupied.includes(row));
        rows.sort((a,b)=>Math.abs(a+.5-p.y-(p.height??p.size)/2)-Math.abs(b+.5-p.y-(p.height??p.size)/2));
        if(rows.length)y=panY+(rows[0]+.5)*size;
      }
    }
    if(p.role!=='hospital'&&!weaponSelected&&!built&&productionId(hover,state)!==id&&!productionControlled(state,id))continue;
    const content=plotContent(state,id);
    if(cells.includes(state.camp))continue;
    if(p.role==='hospital'){
      ctx.save();ctx.font='700 18px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';
      ctx.lineWidth=4;ctx.strokeStyle='#142024';ctx.strokeText('医院',x,y);ctx.fillStyle='#fff0bc';ctx.fillText('医院',x,y);ctx.restore();continue;
    }
    // 空地跟随所选用途报价，已有用途只在对应工具下显示。
    if(weaponSelected?(content.status==='empty'||!['production','housing'].includes(content.type)):content.status!=='empty'&&content.type!==tool)continue;
    const home=tool==='housing',complete=home?state.housing.has(id):built;
    const quote=home?housingQuote(state,id):productionQuote(state,id);
    const rows=[];
    if(!weaponSelected&&!complete)rows.push({text:`−${quote.cost}`,icon:'coin',suffix:'',color:funds(state)>=quote.cost?'#f5df9c':'#f3a49c'});
    if(weaponSelected){
      const capacity=towerCapacity(state,id);
      rows.push({text:`${capacity.used}/${capacity.max}`,icon:'military',suffix:'',color:capacity.used>=capacity.max?'#f3a49c':productionControlled(state,id)?'#c4f4df':'#a5afa9'});
    }else if(!home){
      // 建成后仅显示占用人数与收入图标；未建成仍保留费用和产出报价。
      rows.push({text:`${complete?'':'−'}${productionLabor(state,id)}`,icon:'people',suffix:'',color:'#f4d3a2'});
      rows.push({text:`+${complete&&!active?0:quote.income}`,icon:'coin',suffix:complete?'':'/天',color:'#bff5ce'});
    }else rows.push({text:`+${quote.residents}`,icon:'people',suffix:'',color:'#f4d3a2'});
    ctx.save();ctx.font='600 10px system-ui';ctx.textAlign='left';ctx.textBaseline='middle';
    const iconSize=11,rowHeight=14;
    const widths=rows.map(row=>ctx.measureText(row.text).width+iconSize+3+ctx.measureText(row.suffix).width);
    const width=Math.max(...widths)+8,height=rows.length*rowHeight+4;
    // 将整个标签（底板、图标和文字）等比收进街区，四周至少留 0.15 格。
    const fit=Math.min(1,Math.max(0,(p.width??p.size)-.3)*size/width,Math.max(0,(p.height??p.size)-.3)*size/height);
    ctx.translate(x,y);ctx.scale(fit,fit);ctx.translate(-x,-y);
    ctx.fillStyle='#142024f2';ctx.fillRect(x-width/2,y-height/2,width,height);
    rows.forEach((row,i)=>{
      const left=x-widths[i]/2,cy=y+(i-(rows.length-1)/2)*rowHeight;
      ctx.fillStyle=row.color;ctx.fillText(row.text,left,cy);
      const iconX=left+ctx.measureText(row.text).width+2,image=resourceIcons[row.icon];
      if(image.complete&&image.naturalWidth)ctx.drawImage(image,iconX,cy-iconSize/2,iconSize,iconSize);
      ctx.fillText(row.suffix,iconX+iconSize+1,cy);

    });ctx.restore();
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
  // 地图只显示篝火图标；耐久统一由右侧火光卡展示。
  // 坐标标记帮助修改源头；屏幕字号不随棋盘缩小。
  ctx.font='10px system-ui';ctx.textAlign='center';ctx.fillStyle='#81999c';
  for(let i=0;i<SIZE;i+=5){ctx.fillText(i,panX+(i+.5)*size,panY-8);ctx.fillText(i,panX-14,panY+(i+.65)*size);}
  $('zoom').textContent = `${Math.round(zoom * 100)}%`;
  // 比例尺选择 1/2/5 档距离，长度不超过 60 像素，缩放时始终对应实际米数。
  const scaleMax=60*controlState.params.cellMeters/size,scaleUnit=10**Math.floor(Math.log10(scaleMax));
  const scaleMeters=[5,2,1].find(n=>n*scaleUnit<=scaleMax)*scaleUnit;
  const scaleText=scaleMeters>=1000?`${scaleMeters/1000} km`:`${scaleMeters} m`;
  $('scaleLabel').textContent=scaleText;$('scaleBar').style.width=`${scaleMeters/controlState.params.cellMeters*size}px`;
  $('mapScale').setAttribute('aria-label',`地图比例尺 ${scaleText}`);
  if (hover !== null) {
    const [x,y] = xy(hover), enemy = currentlyVisible(hover)?state.enemies.find(e=>e.id===hover):null;
    $('cellInfo').textContent = `格子 (${x}, ${y}) · ${rawControlled.has(hover)?'地面控制范围内':controlled.has(hover)?'建筑整体受控 · 地面范围外':'控制范围外'} · 每拍火力 ${fire.get(hover)||0} · ${state.walls.has(hover)?'不可通行':'可通行'}${state.towers.has(hover)?' · 建筑炮位':''}${state.wallHealth.has(hover)?` · 墙 HP ${state.wallHealth.get(hover).hp}/${state.wallHealth.get(hover).max}`:''}${enemy?` · 敌群 ${enemy.hp}/${enemy.max}（${Math.round(enemy.hp/enemy.max*100)}%） · ${enemy.members} 批`:''}`;
    if(contentCells(state,hover).includes(hover)&&plotContent(state,hover).status!=='empty'&&!['outpost','housing'].includes(plotContent(state,hover).type))$('cellInfo').textContent+=state.production.has(productionId(hover,state))?` · 生产点 ${productionActive(state,hover)?'已恢复':'失控停产'} · ${productionQuote(state,hover).income} 钱/晚`:` · 待恢复生产点 · 费用 ${productionQuote(state,hover).cost} · 收入 ${productionQuote(state,hover).income}/晚`;
    if(productionSite(hover,state)&&productionSite(hover,state).role!=='camp'&&plotContent(state,hover).status==='empty')$('cellInfo').textContent+=' · 空地 · 可选择住房、生产或瞭望塔';
    if(outpostAt(state,hover)!==undefined)$('cellInfo').textContent+=' · 瞭望塔不可受击、不失守';
    const groups=state.enemies.filter(e=>currentlyVisible(hover)&&e.id===hover);if(groups.length)$('cellInfo').textContent+=groups.map(e=>` · ${e.hp}/${e.max} → ${'火光'}`).join('');
    if(candidate) $('cellInfo').textContent += candidate.error ? ` · ${candidate.error}` : ' · 今晚路线已锁定，墙只阻挡敌人';
    if(contentCells(state,hover).includes(hover)&&plotContent(state,hover).type==='housing')$('cellInfo').textContent+=` · ${plotContent(state,hover).status==='ruin'?'住房废墟':'住房'} · ${housingQuote(state,hover).residents} 位居民 · 不受攻击`;
  } else $('cellInfo').textContent = '单击建造 · 右键取消选择 · 拖动平移 · 滚轮缩放 · 悬停看生命';
}
function update() {
  sound.setScene(state.phase,paused);
  sight=visionField(state);revealControl(state);
  fire = fireField({...state,params:previewParams()});
  // 夜晚聚焦补炮；资金不足仍显示灰色炮台，区别于阶段不允许的工具。
  const daytime=state.phase==='build';
  const repairTargets=[state.camp,...state.wallHealth.keys()].filter(id=>repairQuote(state,id).missing>0);
  const repairAvailable=repairTargets.some(id=>!repairError(state,id));
  // 修复耗尽余额或最后一个目标修满后退出工具，避免留下不可执行的预览。
  if(tool==='repair'&&!repairAvailable)tool=null;
  if($('firstNightNotice').textContent==='请先建造一座炮塔'&&(!daytime||firstNightReady(state)))$('firstNightNotice').hidden=true;
  for(const id of ['wall','outpost','production','housing','repair','erase'])$(id).hidden=!daytime;
  $('economyTools').hidden=!daytime||state.day<2;$('commonTools').hidden=!daytime;
  $('housing').hidden=!daytime||state.day<2;$('production').hidden=!daytime||state.day<2;$('outpost').hidden=!daytime||state.day<3;
  if((['production','housing'].includes(tool)&&state.day<2)||(tool==='outpost'&&state.day<3))tool='wall';
  if(state.phase==='battle'&&tool!==null&&!['build','long'].includes(tool))tool='build';
  for(const id of ['wall','build','long','outpost','production','housing','repair','erase'])$(id).classList.toggle('selected',tool===id);
  $('toolHeading').textContent=daytime?'建设工具':'夜间补炮';
  const w=selectedWeapon();
  $('toolInfo').textContent = ['build','long'].includes(tool) ? `${weaponType()==='A'?'近防炮':'远防炮'} · ${towerBuildCost(state,weaponType())} 资金 · ${w.shape==='square'?'方形':'菱形'}范围 ${w.range} · 每拍火力 ${w.power}。只能架在受控建筑的原始临街边缘，占经营面积；不受击、不改路。每街区炮位最多占原始面积三分之一。绿色格可建，金框为已有炮，地块数字为已用/总军事容量。` : tool==='wall' ? `每格墙 ${state.params.wallCost} 资金 · HP ${state.params.wallHP}。仅基础地面控制内可建。允许封路，敌人沿锁定路线撞墙就攻击；墙为炮火争取时间。` : `固定墙不可拆；防守中不可拆除。`;
  if(tool==='outpost')$('toolInfo').textContent=`瞭望塔扩张控制与视野；拆除后独占视野恢复迷雾，保留暗淡地形；建造和拆除后，塔的落点均须被篝火或已连回篝火的其他塔覆盖；仅范围相接或建筑归属不能搭桥。仅可通行且逐格受控的地面可建，不受击、不挡路。塔间距至少 ${state.params.outpostMinDistance} 格。`;
  if(tool==='repair')$('toolInfo').textContent=`次日点击受损火光或墙。火光每 HP ${state.params.campRepairCost} 金币，按现有余额尽量恢复，余款保留；墙一次修满，完全损坏时维修费为造价的 ${state.params.defenseRepairPercent}%，部分受损按比例计费（向上取整）。瞭望塔不受击，无需维修。`;
  if(tool==='housing')$('toolInfo').textContent=`住房新建每格 ${state.params.housingCostPerCell} 金币，原用途修缮按新建价 ${state.params.renovationCostPercent}%，每 ${state.params.housingCellsPerResident} 格入住 1 人（整块向上取整）。只能恢复住房废墟，空地可新建住房；生产废墟须先拆除才能换建；立即增加劳动力，不受攻击。人口与火光 HP 独立；营地先遣队提供初始 ${state.params.initialPopulation} 人。`;
  if(tool==='production')$('toolInfo').textContent=`生产每 ${state.params.productionCellsPerWorker} 格占用 1 人，拆除后释放。小地块回款快，大地块持续产出高。${state.params.productionBaseArea} 格基准新建费用 ${state.params.productionBaseArea*state.params.productionCostPerCell}、每晚 +${state.params.productionBaseArea*state.params.productionIncomePerCell}；原用途修缮按新建价 ${state.params.renovationCostPercent}%；悬停看实际报价与回本时间。建筑碰到基础控制一格即可修缮；空地新建仍须逐格完整受控。地块建筑不受击，挡路时敌人绕行。`;
  if(tool==='erase')$('toolInfo').textContent=`白天基价当天全返，旧投入返还 ${state.params.demolitionRefundPercent}%。夜间加急费和维修费不退，经营缺口不会自动恢复；整栋拆空后再建按新建价。`;
  if(tool===null)$('toolInfo').textContent='浏览地图 · 悬停查看，拖动平移。选择左侧工具后可继续建设。';

  $('morningTitle').textContent=`${state.day===1?'守住第一晚':state.day===2?'恢复生产，守住防线':'向北收复，守住火光'}`;
  updateNightReport();
  $('mapConfigLink').href=`map-preview.html?${new URLSearchParams(mapSettings)}`;
  // 金币总额仍由模型结算；夜间按钮拆成白天基价 + 实际加急差额。
  const towerPrice=type=>{const base=state.params.weapons[type].cost,cost=towerBuildCost(state,type);return state.phase==='battle'?`${base}+${cost-base}`:base;};
  const prices={wall:state.params.wallCost,build:towerPrice('A'),long:towerPrice('B'),outpost:state.params.outpostCost,production:'按地块报价',housing:'按地块报价'};
  for(const [id,price] of Object.entries(prices))$('price-'+id).textContent=String(price);
  $('budget').textContent = funds(state);
  const people=population(state);$('population').hidden=false;
  $('populationTotal').textContent=`${people.total}`;$('populationUse').textContent=`空闲 ${people.free} · 生产 ${people.working}`;
  $('campHP').textContent = `HP ${Math.max(0,state.hp)} / ${state.params.campHP}`; $('campBar').style.width = `${Math.max(0,state.hp)/state.params.campHP*100}%`;
  const critical=campCritical(state);
  $('campPanel').classList.toggle('camp-critical',critical);viewport.classList.toggle('camp-critical',critical);
  $('campWarning').hidden=!critical;$('showDefeat').hidden=state.phase!=='lost';
  if(state.phase!=='lost'&&$('defeat').open)$('defeat').close();
  const active = state.phase === 'battle', build = state.phase === 'build';
  document.body.dataset.phase=state.phase;
  // 按原始成员计数，合流不推进进度；最后一群仍在场时进度不会提前到 100%。
  const total=state.sources.reduce((sum,source)=>sum+source.count,0);
  const remaining=state.enemies.reduce((sum,enemy)=>sum+enemy.members,0);
  const resolved=Math.max(0,state.spawned-remaining),progress=total?Math.min(100,Math.floor(resolved/total*100)):0;
  $('nightProgress').hidden=build;
  $('nightProgressLabel').textContent=`第 ${state.day} 晚进度`;
  $('nightProgressText').textContent=state.phase==='lost'?`${progress}% · 防守失败`:state.phase==='won'?'100% · 守住了':`${progress}%`;
  $('nightProgressBar').setAttribute('aria-valuenow',String(progress));
  $('nightProgressFill').style.width=`${progress}%`;

  document.body.dataset.time=build?'day':'night';
  $('timeIcon').setAttribute('aria-label',build?'白天':'夜晚');
  const iconContext=$('campIcon').getContext('2d');iconContext.clearRect(0,0,64,64);drawCampfire(iconContext,4,5,54,state.hp>0);
  $('phase').textContent=`第 ${state.day} 天`;
  $('start').disabled = !build && !active;
  $('retry').disabled=!preparation; $('step').disabled = !active || !paused || !!motion?.singleStep;
  $('start').textContent = active ? (paused ? '继续夜晚' : '暂停夜晚') : campaignComplete(state)?'实验完成':build?'开始夜晚':state.phase==='won'?'守住了 · 即将天亮':'防守结束';
  for (const id of ['build','long','wall','outpost','production','housing','repair','erase','apply','addSource','applyParams','cancelParams','defaults']) $(id).disabled = !build;
  // 通用建造交互：不足价即禁用，退款或应用参数后立即恢复。
  const minimumEconomyCost=type=>Math.min(...state.sites.filter(p=>!['camp','hospital'].includes(p.role)).map(p=>{const id=key(p.x,p.y),c=plotContent(state,id),q=economyBuildQuote(state,id,type);return q.added>0&&(!c.type||c.type===type)?q.cost:Infinity;}));
  const minProductionCost=minimumEconomyCost('production');
  for(const [id,cost] of [['wall',state.params.wallCost],['build',towerBuildCost(state,'A')],['long',towerBuildCost(state,'B')],['outpost',state.params.outpostCost],['production',minProductionCost],['housing',minimumEconomyCost('housing')]]){
    const refundAffordable=funds(state)<cost&&(build||active)&&['build','long','outpost'].includes(id)&&state.sites.some(p=>contentCells(state,key(p.x,p.y)).some(cell=>id==='outpost'?!outpostError(state,cell):!placementError(state,cell,id==='long'?'B':'A')));
    const short=funds(state)<cost&&!refundAffordable;
    const unlocked=['production','housing'].includes(id)?state.day>=2:id==='outpost'?state.day>=3:true;
    const allowed=unlocked&&(build||(active&&['build','long'].includes(id)));
    $(id).disabled=!allowed||short;
    $(id).title=!allowed?'防守中不能建设':short?(!Number.isFinite(cost)?'没有可补建的同用途街区':`资金不足：需要 ${cost}，现有 ${funds(state)}`):`花费 ${cost} 资金`;
  }
  $('repair').disabled=!repairAvailable;
  $('repair').title=!build?'防守中不能修复':state.day<2?'次日才能修复':!repairTargets.length?'没有受损设施':!repairAvailable?repairError(state,repairTargets[0]):'悬停受损目标预览费用与恢复量';
  for(const id of ['applyParams','cancelParams','defaults'])$(id).disabled=!build||state.day!==1;
  document.querySelectorAll('#sources input, #sources select, #sources button').forEach(el=>el.disabled=!build);
  document.querySelectorAll('#params input, #params select').forEach(el=>el.disabled=!build||state.day!==1);
  $('result').textContent = build ? '' : `${state.phase === 'won' ? '防守成功' : state.phase === 'lost' ? '防守失败' : '防守中'} · 削减 ${state.damage} · 火光受伤 ${state.leaked} · 合并 ${state.merges} 次 · 本晚击杀收入 ${state.nightEarned} · 经营收入 ${state.nightEconomy}${state.economySettled?'（已入账）':'（尚未结算）'}`;
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
  $('reportTitle').textContent=`${state.phase==='build'?'昨天':'今天'}收入`;
  $('reportTotal').textContent=`+${report.economy+report.earned}`;
  // 第一晚尚未开放经营，次日不展示无意义的经营收入项。
  $('reportEconomy').closest('.report-economy').hidden=report.day===1;
  $('reportEconomy').textContent=`+${report.economy}`;
  $('reportKills').textContent=`+${report.earned}`;
}
// 玩家按来源查看数量与生命；节拍、伤害等诊断数据留在来袭配置。
function updateForecast() {
  const selectable=$('allowForecastSelection').checked;
  $('forecastDay').hidden=!selectable;
  if(!selectable)$('forecastDay').value=String(state.day-1);
  const night=Number($('forecastDay').value)+1, sources=viewedSources();
  $('forecastTitle').textContent=`共 ${sources.reduce((sum,s)=>sum+s.count,0)} 个敌群`;
  $('forecastList').replaceChildren(...sources.map((s,i)=>{
    const row=document.createElement('li'),name=document.createElement('div'),blocks=document.createElement('div');
    row.style.setProperty('--source-color',colors[i%colors.length]);
    name.className='forecast-source';name.textContent=`敌源 ${i+1}`;
    blocks.className='forecast-blocks';blocks.setAttribute('aria-label',`${s.count} 个敌群，每个 ${s.hp} HP`);
    for(let n=0;n<s.count;n++){
      const block=document.createElement('span'),outcome=night===state.day?state.enemyOutcomes.get(`${i}:${n}`):null;
      block.className=`forecast-enemy${outcome?' '+outcome:''}`;
      const hp=document.createElement('span');hp.textContent=s.hp;block.append(hp);
      if(outcome){const mark=document.createElement('b');mark.className='forecast-outcome';mark.textContent=outcome==='killed'?'×':'↘';block.append(mark);}
      block.setAttribute('aria-label',`敌群 ${n+1}，${s.hp} HP，${outcome==='killed'?'已消灭':outcome==='leaked'?'已抵达火光':'尚未结束进攻'}`);blocks.append(block);
    }
    row.append(name,blocks);return row;
  }));
  $('forecastDebug').textContent=`第 ${night} 晚 · ${night===state.day?'来源与火光目标已锁定':'暂定预告'}\n`+sources.map((s,i)=>`源头 ${i+1} · (${s.x},${s.y}) · ${s.count} 块 × ${s.hp} HP · 拆墙 ${state.params.enemyPower}/块/拍 · 击杀 ${state.params.killReward} 钱/块 · 首拍 ${s.first} / 间隔 ${s.interval} · 固定目标 → 火光`).join('\n');
}
$('forecastDay').onchange=()=>{updateForecast();draw();};
// 关闭跨晚预览时立即回到当晚，避免地图残留其他晚的路线。
$('allowForecastSelection').onchange=()=>{updateForecast();draw();};

function sourceEditor(sources) {
  $('sources').replaceChildren();
  sources.forEach((s,i)=>{
    const card=document.createElement('div');card.className='source';
    const head=document.createElement('div');head.className='source-head';head.textContent=`源头 ${i+1}`;
    const remove=document.createElement('button');remove.textContent='删除';remove.onclick=()=>{card.remove();sourceEditor(readSources());};head.append(remove);card.append(head);
    const fields=document.createElement('div');fields.className='fields';
    for(const [name,label,max] of [['x','X',SIZE-1],['y','Y',SIZE-1],['hp','生命',999],['count','批数',30],['first','首拍',200],['interval','间隔',100]]){
      const wrap=document.createElement('label');wrap.textContent=label;const input=document.createElement('input');input.type='number';input.name=name;input.value=s[name];input.min=['x','y'].includes(name)?0:1;input.max=max;input.step=['productionIncomePerCell','productionSmallCostFloor','productionMaxDensity'].includes(name)||name.endsWith('Multiplier')?0.1:1;input.setAttribute('aria-label',`源头${i+1} ${label}`);wrap.append(input);fields.append(wrap);
    }
    const target=document.createElement('p');target.className='muted';target.textContent='攻击目标：火光（瞭望塔不可受击）';fields.append(target);
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
      else{input.type='number';input.min=min;input.max=max;input.step=['productionIncomePerCell','productionSmallCostFloor','productionMaxDensity'].includes(name)||name.endsWith('Multiplier')?0.1:1;}
      input.value=values[name];input.dataset.param=prefix+name;input.setAttribute('aria-label',`${title} ${label}`);
      input.addEventListener('input',refreshParams);wrap.append(input);row.append(wrap);
    }
    $('params').append(row);
  }
  fields('全局',params,'',[['budget','资金',0,10000],['stepMs','移动节拍（毫秒）',50,5000],['wallCost','墙价',1,1000],['demolitionRefundPercent','旧投入拆除返还比例%',0,100],['wallHP','墙耐久',1,10000],['enemyPower','每个敌人拆墙伤害/拍',1,99],['defenseRepairPercent','全损维修费占墙造价%',1,100],['controlRadius','控制半径',1,30],['campHP','篝火耐久',1,10000],['campWarningPercent','火光危急阈值%',0,100],['campRepairCost','火光修复单价/HP',1,1000]]);
  fields('地图',params,'',[['cellMeters','每格距离（米）',1,1000]]);
  fields('视野',params,'',[['campSight','火光外围格数',0,30],['outpostSight','瞭望塔外围格数',0,30],['daySightMultiplier','白天倍率',0,3],['nightSightMultiplier','夜晚倍率',0,3],['eventSightMultiplier','事件倍率',0,3],['sourceRevealSize','敌源揭示边长',1,5]]);
  fields('住房与人口',params,'',[['initialPopulation','初始人口',0,10000],['productionCellsPerWorker','每名工人承担格数',1,100],['housingCellsPerResident','每名居民占用格数',1,100],['housingCostPerCell','住房新建每格费用',1,1000]]);
  fields('经营建造',params,'',[['renovationCostPercent','修缮费用占新建价%',1,100]]);
  fields('街区生产',params,'',[['productionCostPerCell','基准每格新建费用',1,1000],['productionIncomePerCell','基准每格每晚收入',0,1000],['productionBaseArea','基准面积（格）',1,3600],['productionSmallCostFloor','小地块成本最低倍率',0.01,1],['productionDensityGrowthArea','密度增长面积（格）',1,3600],['productionMaxDensity','产出密度最高倍率',1,10]]);
  fields('击杀收益',params,'',[['killReward','每个原始敌人金币',0,1000]]);
  fields('夜间加急',params,'',[['nightTowerCostMultiplier','炮塔金币倍率',1,10]]);
  fields('瞭望塔',params,'',[['outpostCost','造价',1,1000],['outpostRadius','半径',1,30],['outpostMinDistance','最小间距',1,30]]);
  for(const type of ['A','B'])fields(`武器 ${type}`,params.weapons[type],type+'.',[['shape','范围形状'],['range','半径',1,8],['power','每拍火力',1,99],['cost','价格',1,1000]]);
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
  $('campHitFlash').getAnimations().forEach(animation=>animation.cancel());
  dawnAt=0;receiptUntil=0;$('economyReceipt').hidden=true;
  paused=false;timer=0;motion=null;placementFx=null;impactAge=1000;incoming.clear();recentGain=0;gainUntil=0;$('moneyGain').textContent='';messages=[];explainedMerge=false;$('mergeNotice').hidden=true;$('log').replaceChildren();
  document.querySelectorAll('.coin-drop').forEach(el=>el.remove());
}
function reset(keep=true){
  if(keep&&!preparation)return;
  state=keep?restoreNight(preparation):restartCampaign(state);
  if(!keep)preparation=null;
  clearPlayback();$('firstNightNotice').hidden=true;$('forecastDay').value=String(state.day-1);
  sourceEditor(state.sources);paramsEditor(state.params);refreshParams();
  notify(keep?`已恢复第 ${state.day} 晚战前状态；保留更早的损伤与收支，撤销本晚收入和补炮。`:'已整局重来：恢复第一天初始资金与生命，保留已应用的参数和波次配置。');
}
// 失败仅展示已有成果，不额外发奖；重试与整局重来复用原有回滚规则。
function showDefeat(){
  if(state.phase!=='lost')return;
  $('defeatNight').textContent=`第 ${state.day} 晚 · 防线失守`;
  $('defeatSurvived').textContent=state.survivedNights;
  $('defeatKills').textContent=state.killed;
  $('defeatKillGold').textContent=state.earned;
  $('defeatEconomyGold').textContent=state.economyEarned;
  $('defeatNightGold').textContent=`+${state.nightEarned}`;
  const icon=$('defeatIcon').getContext('2d');icon.clearRect(0,0,96,96);drawCampfire(icon,9,9,78,false);
  $('defeatRetry').disabled=!preparation;
  if(!$('defeat').open)$('defeat').showModal();
}
$('defeatRetry').onclick=()=>reset(true);
$('defeatRestart').onclick=()=>reset(false);
$('defeatInspect').onclick=()=>{$('defeat').close();$('showDefeat').focus();};
$('showDefeat').onclick=showDefeat;
for(const id of ['wall','build','long','outpost','production','housing','repair','erase'])$(id).onclick=()=>{
  tool=id;for(const button of ['wall','build','long','outpost','production','housing','repair','erase'])$(button).classList.toggle('selected',button===id);update();
};
$('testDay').replaceChildren(...state.waves.map((_,i)=>{const o=document.createElement('option');o.value=i+1;o.textContent=`第 ${i+1} 天`;return o;}));
$('applyTest').onclick=()=>{
  const error=applyTestScenario(state,Number($('testDay').value),Number($('testGold').value),Number($('testPeople').value));
  if(error){notify(error);return;}
  preparation=null;clearPlayback();$('firstNightNotice').hidden=true;hover=null;tool='wall';$('forecastDay').value=String(state.day-1);
  sourceEditor(state.sources);paramsEditor(state.params);refreshParams();
  notify(`测试台：已进入第 ${state.day} 天白天，现有布局保留；跳过夜晚不发收入。人口填写的是总人口。`);
};
$('retry').onclick=()=>reset();$('clear').onclick=()=>reset(false);
$('applyParams').onclick=()=>{
  if(state.phase!=='build'||state.day!==1)return;
  const params=readParams(),error=validateParams(params,state);$('paramStatus').textContent=error;if(error)return;
  state.params=structuredClone(params);state.hp=params.campHP;
  for(const body of state.wallHealth.values())body.hp=body.max=params.wallHP;
  rebuildTerrain(state);revealControl(state);state.lastNight=null;preparation=null;clearPlayback();

  paramsEditor(state.params);refreshParams();notify('参数已应用，本轮已重置，墙、炮台、瞭望塔与生产点保留。');
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
$('homeView').onclick=()=>resize(true);$('fit').onclick=()=>{zoom=1;constrainCamera();hover=null;draw();};$('in').onclick=()=>changeZoom(1.25);$('out').onclick=()=>changeZoom(.8);$('routes').onchange=draw;$('heat').onchange=draw;
// 右键退出当前工具，保留悬停查看与地图移动，不再执行建设或拆除。
canvas.addEventListener('contextmenu',e=>{e.preventDefault();tool=null;dragging=null;notify('');update();});
canvas.addEventListener('wheel',e=>{e.preventDefault();const r=canvas.getBoundingClientRect();changeZoom(e.deltaY<0?1.12:1/1.12,e.clientX-r.left,e.clientY-r.top);},{passive:false});
// 单击放置、拖动平移；在松开时才建造，避免拖地图误花预算。
canvas.addEventListener('pointerdown',e=>{
  if(e.button===2)return;
  dragging={x:e.clientX,y:e.clientY,startX:e.clientX,startY:e.clientY,moved:false,panOnly:e.button!==0||e.altKey};
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove',e=>{
  if(dragging){
    if(Math.hypot(e.clientX-dragging.startX,e.clientY-dragging.startY)>4)dragging.moved=true;
    if(dragging.moved||dragging.panOnly){panX+=e.clientX-dragging.x;panY+=e.clientY-dragging.y;constrainCamera();}
    dragging.x=e.clientX;dragging.y=e.clientY;
  }
  hover=cellAt(e);draw();
});
canvas.addEventListener('pointerup',e=>{
  const shouldPlace=dragging&&!dragging.moved&&!dragging.panOnly;dragging=null;
  if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);
  if(!shouldPlace||tool===null)return;
  const id=cellAt(e);if(id===null)return;
  if(state.phase!=='build'&&!(state.phase==='battle'&&['build','long'].includes(tool))){notify('防守中只能在建筑炮位补炮，不能造墙、修复或拆除。');return;}
  if(paramsDirty()){notify('请先应用或取消实验参数预览，再修改布局。');return;}
  const beforePeople=population(state).total,beforeFunds=funds(state),beforeHP=state.hp,erasedType=tool==='erase'?demolitionQuote(state,id).type:null;let actionError='';
  if(tool==='housing'){
    const error=actionError=buildHousing(state,id);notify(error||`住房已完成，${population(state).total-beforePeople} 位居民立即入住。`);
  } else if(tool==='production'){
    const error=actionError=buildProduction(state,id);notify(error||`生产设施已完成，预计每晚收入 +${productionQuote(state,id).income}，守住后自动入账。`);
  } else if(['outpost','repair'].includes(tool)){
    const error=actionError=tool==='repair'?repairFacility(state,id):buildOutpost(state,id);notify(error||(tool==='repair'?(id===state.camp?`火光恢复 ${state.hp-beforeHP} HP，花费 ${beforeFunds-funds(state)} 金币。`:'墙已修满。'):'瞭望塔已建立，控制与视野立即扩张。'));
    if(!error)sourceEditor(readSources());
  } else if(tool==='wall'){
    const error=actionError=changeWall(state,id);notify(error||'墙已建造；今晚路线不变，敌人到这里会停下攻击。');
  } else if(tool==='erase'){
    const quote=demolitionQuote(state,id);
    const error=actionError=quote.type==='housing'?removeHousing(state,id):quote.type==='production'?removeProduction(state,id):quote.type==='tower'?removeTower(state,id):quote.type==='outpost'?removeOutpost(state,id):quote.type==='wall'?changeWall(state,id,true):quote.type==='ruin'?clearPlot(state,id):'这里没有可拆除的设施。';
    notify(error||(quote.type==='ruin'?'废墟已清理，金币不变；空地可选择经营设施。':`已拆除设施，返还 ${quote.refund} 金币${['production','housing','outpost'].includes(quote.type)?'；地块变为空地':''}。`));
    if(!error&&quote.type==='outpost')sourceEditor(readSources());
  } else {
    const type=weaponType(),error=actionError=weaponPlacementError(id)||buildTower(state,id,type);
    if(error)notify(error);else{notify(`武器 ${type} 已架设于建筑，每拍火力 +${state.params.weapons[type].power}。`);}
  }
  if(!actionError){
    $('firstNightNotice').hidden=true;
    const delta=funds(state)-beforeFunds,site=['production','housing'].includes(tool)||(tool==='erase'&&['production','housing','outpost','ruin'].includes(erasedType))?productionSite(id,state):null;
    sound.play(tool==='erase'?'clear':tool==='repair'?'repair':'build');
    if(delta>0)sound.play('coin',.12);
    const names={wall:'墙已建造',build:'近防炮就位',long:'远防炮就位',outpost:'控制区扩张',housing:`入住 +${population(state).total-beforePeople} 人`,production:'生产已完成',repair:id===state.camp?`HP +${state.hp-beforeHP}`:'墙已修满',erase:'已拆除'};
    placementFx={id:site?key(site.x,site.y):id,size:site?.width||site?.size||1,height:site?.height||site?.size||1,start:performance.now(),color:delta<0?'#ffe1a0':'#aef2ce',text:`${names[tool]}${delta?` ${delta>0?'+':''}${delta} 金币`:''}`};
    pulse($('budget'),delta<0?'#ffe1a0':'#bff5ce');
  }else{pulse($('notice'),'#ffb7a5');if(/容量|先拆除.*炮塔|瞭望塔间距|失去与篝火的连接/.test(actionError))showTopNotice(/失去与篝火的连接/.test(actionError)?'无法拆除：会切断与篝火的连接。':actionError,true);}
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
// 失败提示每次重播字体强调，不用背景闪烁；共用顶栏提醒位置。
function showTopNotice(text,transient=false){
  dismissTopNotice();
  const notice=$('firstNightNotice');notice.textContent=text;notice.hidden=false;
  if(transient)topNoticeTimer=setTimeout(dismissTopNotice,2500);
  notice.getAnimations().forEach(animation=>animation.cancel());
  notice.animate([{color:'#ffd477',filter:'brightness(1)'},{color:'#fff9dc',filter:'brightness(1.8)'},{color:'#ffd477',filter:'brightness(1)'}],{duration:reducedMotion.matches?700:450,iterations:reducedMotion.matches?1:2});
}
function pulse(element,color){
  if(reducedMotion.matches)return;
  element.animate([{color,filter:'brightness(1.5)'},{filter:'brightness(1)'}],{duration:450});
}
// 每次真实受击重播短促红色反馈，与危急状态的慢闪分开；不拦截地图操作。
function flashCampHit(){
  const flash=$('campHitFlash');flash.getAnimations().forEach(animation=>animation.cancel());
  flash.animate([{opacity:reducedMotion.matches ? .35 : 1},{opacity:0}],{duration:reducedMotion.matches?220:550,easing:'ease-out'});
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
  if(reducedMotion.matches||!currentlyVisible(id))return;
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
  motion=null;impactAge=0;timer=0;sight=visionField(state);
  const kills=state.events.filter(event=>event.type==='kill');
  if(kills.some(event=>currentlyVisible(event.id)))sound.play('kill');
  if(kills.some(event=>event.value>0))sound.play('coin',.1);
  if(state.events.some(event=>event.type==='leak')){sound.play('hurt');flashCampHit();}
  for (const event of state.events) {
    const [x,y] = xy(event.id);
    const defenseText={wallHit:`墙 (${x},${y}) 受到 ${event.value} 点伤害`,wallLost:`墙 (${x},${y}) 被攻破，敌人将沿原路线推进`};
    const text = defenseText[event.type]|| (event.type === 'merge' ? `(${x},${y}) ${event.members} 批合流 → ${event.value}` : event.type === 'leak' ? `篝火受到 ${event.value} 点伤害` : event.type === 'kill' ? `(${x},${y}) 消灭 ${event.members} 批敌人，+${event.value} 资金` : `(${x},${y}) 火力削减 ${event.value}`);
    if(event.type==='merge'&&!explainedMerge&&currentlyVisible(event.id)){
      explainedMerge=true;$('mergeNotice').hidden=false;
      $('mergeNotice').textContent=`合流：${event.parts.join(' + ')} = ${event.value} HP。同格、同拍、同目标才合并；停留时每拍也扣该格叠加火力，整群消灭才获得合计金币。`;
    }
    if(event.type==='kill'){showIncome(event.value);showCoins(event.id,event.value);}
    if(event.type==='leak')pulse($('campHP'),'#ff978b');
    if(currentlyVisible(event.id))messages.unshift(`第 ${state.tick} 拍 · ${text}`);
  }
  messages = messages.slice(0,8); $('log').replaceChildren(...messages.map(text=>{const li=document.createElement('li');li.textContent=text;return li;}));
  if(state.phase==='won'){
    if(campaignComplete(state))sound.play('dawn');
    if(state.nightEconomy>0)sound.play('coin',.38);
    // 经营单独说明来源，不与最后一次击杀的括号金额相加，也不重复发钱。
    if(state.nightEconomy>0)pulse($('budget'),'#ffe1a0');
    dawnAt=campaignComplete(state)?0:performance.now()+900;
  }
  if (state.phase === 'won') notify(campaignComplete(state)?'全部夜晚守住了！可重试最后一晚或整局重来。':`第 ${state.day} 晚守住了。进入次日建设、修复并准备下一晚。`);
  if (state.phase === 'lost') notify('火光熄灭。检查破墙位置与持续火力覆盖，可重试当晚。');
  if(state.phase==='lost')sound.play('lost');
  update();
  if(state.phase==='lost')showDefeat();
  if(state.phase==='won')document.querySelector('.build-sidebar').scrollTop=0;
}
// 仅短暂展示胜利，不增加需要玩家确认的结算阶段。
function finishDawn(){
  dawnAt=0;
  if(!enterMorning(state))return;
  sound.play('dawn');
  preparation=null;paused=false;timer=0;motion=null;impactAge=1000;incoming.clear();
  explainedMerge=false;$('mergeNotice').hidden=true;$('forecastDay').value=String(state.day-1);sourceEditor(state.sources);
  notify('');
  update();
  // 回到钱包与报告，避免浏览器滚动锚定把新插入的收入卡藏在上方。
  document.querySelector('.build-sidebar').scrollTop=0;
}
$('start').onclick=()=>{
  if(campaignComplete(state))return;
  if(state.phase==='battle'){paused=!paused;timer=0;update();return;}
  if(state.phase!=='build')return;
  if(!firstNightReady(state)){
    showTopNotice('请先建造一座炮塔');
    return;
  }
  if(paramsDirty()){ $('experiments').open=true;notify('实验参数有未应用修改，请先应用或取消预览。');return; }
  if(JSON.stringify(readSources())!==JSON.stringify(state.sources)){ $('configError').textContent='来袭配置有未应用修改，请先应用配置。';$('settings').open=true;notify('请先应用来袭配置，确保预览与实际波次一致。');return; }
  const error=validateSources(state.sources,state);if(error){notify(error);return;}
  preparation=beginBattle(state);if(!preparation)return;
  // 开战成功后撤下白天建设的失败提醒，避免被误认为夜间状态。
  $('firstNightNotice').hidden=true;
  sound.play('sunset');
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
  if($('showFog').checked&&!reducedMotion.matches&&now-lastFogFrame>120){lastFogFrame=now;draw();}
  // 即使夜晚暂停或白天待修，低血量篝火仍提示；减少动态偏好改用常亮红色。
  if(campCritical(state)&&!reducedMotion.matches&&!document.hidden&&now-lastFogFrame>80){lastFogFrame=now;draw();}
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
document.addEventListener('visibilitychange',()=>{sound.setHidden(document.hidden);if(document.hidden&&state.phase==='battle'){paused=true;if(motion)motion.singleStep=false;timer=0;update();}});
requestAnimationFrame(frame);
