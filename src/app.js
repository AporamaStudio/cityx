import {drawFog} from './fog.js?v=3';
import {createTowerOverlay} from './tower-overlay.js?v=3';
import {drawRoadTexture,drawBlockTexture,drawCitySurroundings} from './city-textures.js?v=5';
import {cameraScale,limitZoom,limitPan} from './map-camera.js?v=1';
import {drawCampfire,drawShield,SOURCE_DESTROYED_SVG,SPAWN_BLOCKED_SVG,WATCHTOWER_SVG,POPULATION_SVG,WORKER_SVG} from './icons.js?v=6';
import {createGameAudio} from './audio.js?v=5';
import { SIZE, DEFAULTS } from './config.js?v=62';
import { configureSourceMap, configureSourceNight, finishIdleNight, enemyBatchStatus, campaignGoals, routeTimingReport, nightCleanupState, sourcePlans, sourceCells, enemySourceAt, sourceControlled, sourceAttackPlan, syncSourceHealth, outpostRemovalPreview, towerBuildCost, buildingCells, buildingRemovalError, rawControlMask, controlMask, controlBoundary, streetEdgeAccess, knownSources, firstNightReady, contentCells, economyBuildQuote, embeddingQuote, visionField, clearingError, applyTestScenario, population, productionLabor, housingQuote, housingError, buildHousing, removeHousing, housingRemovalError, initialView, isExplored, revealControl, plotContent, clearPlot, rebuildTerrain, demolitionQuote, buildTower, removeTower, battleRoutes, productionId, productionCells, productionQuote, productionControlled, productionActive, productionSite, productionError, buildProduction, removeProduction, expectedIncome, key, xy, inside, createCampaign, reservedSources, campaignComplete, campCritical, beginBattle, restoreNight, restartCampaign, coverage, fireField, funds, placementError, validateSources, stepBattle, wallPreview, changeWall, validateParams, inControl, forecastAttacks, lockAttacks, enemyAction, enemyKey, repairQuote, repairError, repairFacility, outpostError, buildOutpost, removeOutpost, enterMorning } from './model.js?v=74';
import {generateCityMap} from './city-map.js?v=8';
import {readMapSettings} from './map-settings.js';
import {SOURCE_WAVE_DEFAULTS,sourceMaxHP,resolveSourceCatalog} from './enemy-sources.js?v=4';
const mapSettings=readMapSettings(location.search);
mapSettings.width=SIZE;mapSettings.height=SIZE;
const cityLayout=generateCityMap(mapSettings);
const $ = id => document.getElementById(id);
// Canvas 报价直接复用钱包与工具 SVG，资源和炮图标不另建一套图形。
document.querySelector('#outpost .tool-name').innerHTML=WATCHTOWER_SVG+' 瞭望塔';
document.querySelector('#populationTotalMetric .population-symbol').innerHTML=POPULATION_SVG;
document.querySelector('#populationFreeMetric .population-symbol').innerHTML=WORKER_SVG;
$('outpostWorkerIcon').innerHTML=WORKER_SVG;
const resourceIcons={};
for(const [name,selector] of [['coin','.wallet .coin-icon'],['people','#populationFreeMetric svg'],['residents','#populationTotalMetric svg'],['watch','#outpost svg'],['military','#build .weapon-icon']]){
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
let sourceDrafts=[],editingNight=1,editorSourcePreview=null;
const blockedActionReasons=new Map();
let zoom = 1, base = 20, panX = 0, panY = 0, width = 0, height = 0, cameraBottom=80;
let fire = fireField(state), paused = false, timer = 0, last = 0;
let messages = [], preparation = null;
const canBuildWeapon = () => !nightOutro&&['build','battle'].includes(state.phase);
const weaponPlacementError=id=>placementError(state,id,weaponType())||(motion?.actors.some(e=>e.to===id)?'敌人正进入该格，请选择其他炮位。':'');
let motion = null, impactAge = 1000, incoming = new Map(), sourceCleanup = false, nightOutro = null;
const MOVE_MS = 160, IMPACT_MS = 220;
const moveDuration=()=>Math.min(MOVE_MS,state.params.stepMs*.36);
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
let placementFx = null, playbackSpeed = 1, recentGain = 0, gainUntil = 0, dawnAt = 0, receiptUntil = 0;
let nightMix = 0, sight=visionField(state), lastFogFrame=0;
const effectiveSpeed=()=>sourceCleanup?Math.max(playbackSpeed,state.params.nightCleanupSpeed):playbackSpeed;
// 只对环境配色插值，敌人、路线、血条等决策信息不经过压暗滤镜。
const terrainColors={groundA:[[88,99,88],[21,32,49]],groundB:[[94,105,94],[25,37,54]],grid:[[114,125,112],[43,58,77]],wall:[[130,137,124],[69,82,101]],fog:[[86,103,98],[20,32,45]]};
function terrainColor(name){
  const [day,night]=terrainColors[name];return `rgb(${day.map((v,i)=>Math.round(v+(night[i]-v)*nightMix)).join(',')})`;
}
const colors = ['#df9989', '#a6a1e9', '#d5bd79', '#78bcd3', '#bd98c8', '#b7c77d', '#dc9fb1', '#87c4af'];
const notify = message => { $('notice').textContent = message; };
let topNoticeTimer=null;
// 拒绝操作统一在顶栏短暂显示；下次点击可提前清除，不占左下说明区。
function dismissTopNotice(){
  if(topNoticeTimer===null)return;
  clearTimeout(topNoticeTimer);topNoticeTimer=null;
  $('firstNightNotice').hidden=true;
}
document.addEventListener('pointerdown',dismissTopNotice,{capture:true});
// 灰色工具仍能解释原因；禁止原因不使用容易被鼠标遮住的原生 title。
document.addEventListener('pointerdown',event=>{const button=event.target.closest('button');if(button?.disabled&&blockedActionReasons.get(button.id))showTopNotice(blockedActionReasons.get(button.id));},{capture:true});
const weaponType = () => tool === 'long' ? 'B' : 'A';
const viewedSources = () => sourcePlans(state,Number($('forecastDay').value)+1);
let populationPinned=false;
function showPopulationDetails(open){
  $('populationDetails').hidden=!open;$('populationSummary').setAttribute('aria-expanded',String(open));
}
// 鼠标悬停与键盘聚焦暂显明细；点击固定展开，触屏也能查看，外部点击或Escape关闭。
$('population').addEventListener('pointerenter',event=>{if(event.pointerType!=='touch')showPopulationDetails(true);});
$('population').addEventListener('pointerleave',()=>{if(!populationPinned)showPopulationDetails(false);});
$('populationSummary').addEventListener('focus',()=>showPopulationDetails(true));
$('populationSummary').addEventListener('blur',()=>{if(!populationPinned)showPopulationDetails(false);});
$('populationSummary').onclick=()=>{populationPinned=!populationPinned;showPopulationDetails(populationPinned);};
document.addEventListener('click',event=>{if(!$('population').contains(event.target)){populationPinned=false;showPopulationDetails(false);}});
document.addEventListener('keydown',event=>{if(event.key==='Escape'){populationPinned=false;showPopulationDetails(false);}});
const resourceChange=delta=>`(${delta>0?'+':delta<0?'−':''}${Math.abs(delta)})`;
// 金币与人口都保留当前值，括号只表达本次变化；真实分配与明细不变。
function previewPopulation(totalDelta=0,freeDelta=0){
  const people=population(state);
  for(const [name,value,delta,label] of [['Total',people.total,totalDelta,'总人口'],['Free',people.free,freeDelta,'可用工人']]){
    const preview=$(`population${name}Preview`);preview.firstElementChild.textContent=delta?resourceChange(delta):'';
    preview.classList.toggle('population-decrease',delta<0);
    $(`population${name}Metric`).setAttribute('aria-label',`${label} ${value}${delta?`，预计 ${value+delta}`:''}`);
  }
  $('populationSummary').setAttribute('aria-label',`总人口 ${people.total}${totalDelta?`，预计 ${people.total+totalDelta}`:''}；可用工人 ${people.free}${freeDelta?`，预计 ${people.free+freeDelta}`:''}`);
}
const resourceFitCache=new WeakMap();
// 预览槽始终占位；当前值与宽度不变时，不因悬停内容重新缩放或移动资源。
function fitResourceLine(row){
  const content=row.querySelector('.resource-content'),width=row.clientWidth;
  if(!width)return;
  const signature=`${width}:${[...content.querySelectorAll('strong')].map(el=>el.textContent).join(',')}`;
  if(resourceFitCache.get(row)===signature)return;
  resourceFitCache.set(row,signature);row.style.setProperty('--resource-scale','1');
  if(content.getBoundingClientRect().width<=width)return;
  let low=0,high=1;
  for(let i=0;i<9;i++){
    const scale=(low+high)/2;row.style.setProperty('--resource-scale',String(scale));
    if(content.getBoundingClientRect().width<=width)low=scale;else high=scale;
  }
  row.style.setProperty('--resource-scale',String(low));
}
// 超长增减量只缩小槽内文字，不能侵占当前数字或推动相邻人口项。
function fitResourcePreview(slot){
  const value=slot.firstElementChild,width=slot.clientWidth;
  if(!width)return;
  const signature=`${width}:${getComputedStyle(slot).fontSize}:${value.textContent}`;
  if(resourceFitCache.get(slot)===signature)return;
  resourceFitCache.set(slot,signature);value.style.setProperty('--preview-scale','1');
  const measured=value.getBoundingClientRect().width;
  if(measured>width)value.style.setProperty('--preview-scale',String(Math.max(0,width-1)/measured));
}
function fitResources(){
  for(const row of document.querySelectorAll('.resource-line'))fitResourceLine(row);
  for(const slot of document.querySelectorAll('.resource-preview'))fitResourcePreview(slot);
}
let selectedSource=null;
const sourceNumber=plan=>state.enemySources?.get(plan?.sourceId)?.index??state.sources.indexOf(plan);
const selectedWeapon = () => previewParams().weapons[weaponType()];
// 调试显示不写入探索记录，重新显示迷雾时仍保持真实探索进度。
const sourceEditing=()=>$('settings').open&&state.phase==='build';
const mapFogEnabled=()=>$('showFog').checked&&!sourceEditing();
const visibleCell=id=>!mapFogEnabled()||isExplored(state,id);
const currentlyVisible=id=>!mapFogEnabled()||sight.has(id);
function clipSight(){if(!mapFogEnabled())return;ctx.beginPath();for(const id of sight){const [x,y]=xy(id);ctx.rect(x,y,1,1);}ctx.clip();}
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
let drawPending=false,mapView=null;
// 输入与动画可以同时要求刷新，但同一浏览器帧只重画一次。
function draw(){drawPending=true;}
function mapDisplay(){
  if(!mapView){
    const params=previewParams(),controlState={...state,params},raw=rawControlMask(controlState),controlled=controlMask(controlState,params.controlRadius,raw);
    mapView={controlState,raw,controlled,boundary:controlBoundary(controlled),dirty:paramsDirty(),
      towers:createTowerOverlay(state,controlled,new Set(motion?.actors.map(e=>e.to))),
      sourceSites:new Set([...state.enemySources.values()].map(s=>s.site)),
      sourceFootprint:new Set([...state.enemySources.values()].flatMap(sourceCells))};
  }
  return mapView;
}
function paintMap() {
  ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
  ctx.clearRect(0, 0, width, height);
  const size = base * zoom;
  const palette=Object.fromEntries(Object.keys(terrainColors).map(name=>[name,terrainColor(name)]));
  // 地图外与远处雾使用同一底色，宽屏留白也不出现另一块纯色平面。
  const backdrop=`rgb(${Math.round(32-nightMix*12)},${Math.round(48-nightMix*15)},${Math.round(57-nightMix*10)})`;
  ctx.fillStyle=backdrop;ctx.fillRect(0,0,width,height);
  const view=mapDisplay(),{controlState,raw:rawControlled,controlled,dirty:draftDirty}=view;
  const hoveredPlot=productionId(hover,state);
  // 多留一格，边框、迷雾羽化和镜头边缘不会因裁剪突然消失。
  const bounds={left:Math.max(0,Math.floor(-panX/size)-1),top:Math.max(0,Math.floor(-panY/size)-1),right:Math.min(SIZE,Math.ceil((width-panX)/size)+1),bottom:Math.min(SIZE,Math.ceil((height-panY)/size)+1)};
  const inView=(x,y,w=1,h=1)=>x+w>bounds.left&&x<bounds.right&&y+h>bounds.top&&y<bounds.bottom;
  const wallEdit = hover !== null && state.phase === 'build' && (tool==='wall'||(tool==='erase'&&!productionSite(hover,state)&&!state.towers.has(hover)&&!state.outposts.has(hover)));
  const candidate = wallEdit ? wallPreview(state,hover,tool==='erase') : null;
  const postRemoval=tool==='erase'&&hover!==null&&state.phase==='build'&&state.outposts.has(hover)?outpostRemovalPreview(state,hover):null;
  const repairHover=hover!==null&&state.phase==='build'&&tool==='repair';
  const postHover=hover!==null&&state.phase==='build'&&tool==='outpost';
  const postSpacingConflict=postHover&&[...state.outposts.keys()].some(id=>{const [x,y]=xy(id),[hx,hy]=xy(hover);return Math.hypot(x-hx,y-hy)<state.params.outpostMinDistance;});
  const postError=postHover?(draftDirty?'请先应用或取消参数预览。':outpostError(state,hover)):'';
  const postGhost=postHover&&!postError;
  const previewState=postGhost?{...state,outposts:new Map([...state.outposts,[hover,{day:state.day}]])}:state;
  const previewControlled=postGhost?controlMask(previewState):controlled;
  const forecastDay=Number($('forecastDay').value)+1;
  if(view.forecastDay!==forecastDay){
    const knownIds=new Set((sourceEditing()?[...state.enemySources.values()]:knownSources(state)).map(s=>s.id??key(s.x,s.y)));
    view.forecastDay=forecastDay;view.routes=forecastAttacks(state,forecastDay).map(attack=>knownIds.has(attack.sourceId??key(attack.x,attack.y))?attack:{...attack,path:[]});
  }
  const plannedRoutes=view.routes;
  const sourcePath=source=>plannedRoutes[viewedSources().indexOf(source)]?.path||[];
  const weaponSelected=canBuildWeapon()&&['build','long'].includes(tool),weaponPlacementReady=weaponSelected&&!draftDirty;
  const weaponHover=hover!==null&&weaponSelected;
  const weapon=controlState.params.weapons[weaponType()];
  const previewError=weaponHover ? (draftDirty?'请先应用或取消实验参数预览。':weaponPlacementError(hover)) : '';
  const ghost=weaponHover&&!previewError;
  let totalDelta=0,freeDelta=0,goldDelta=null;
  if(!draftDirty&&hover!==null&&(state.phase==='build'||ghost)){
    if(postGhost){freeDelta=-state.params.outpostWorkers;goldDelta=-state.params.outpostCost;}
    else if(tool==='production'&&!productionError(state,hover)){const q=economyBuildQuote(state,hover,'production');freeDelta=-q.labor;goldDelta=-q.cost;}
    else if(tool==='housing'&&!housingError(state,hover)){const q=economyBuildQuote(state,hover,'housing');totalDelta=freeDelta=q.residents;goldDelta=-q.cost;}
    else if(ghost){const q=embeddingQuote(state,hover);totalDelta=-q.residents;freeDelta=q.released-q.residents;goldDelta=q.refund-towerBuildCost(state,weaponType());}
    else if(tool==='wall'&&candidate&&!candidate.error)goldDelta=-state.params.wallCost;
  }
  const added=new Set(ghost?coverage(hover,weapon.range,weapon.shape):[]);
  const sourceDamage=sourceAttackPlan({...previewState,params:controlState.params},motion?[...incoming.values()]:state.enemies,new Map([...state.towers,...(ghost?[[hover,weaponType()]]:[])]));
  const sourceFootprint=view.sourceFootprint;
  // 只预览本次建设的确定变化；数值由资源栏、对应按钮与地图展示，不在左下重复。

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
        goldDelta=-quote.cost;
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
    if(quote.type&&!error&&!draftDirty){
      if(quote.type==='outpost')freeDelta=state.params.outpostWorkers;
      else if(quote.type==='production')freeDelta=productionLabor(state,hover);
      else if(quote.type==='housing')totalDelta=freeDelta=-housingQuote(state,hover).residents;
      // 预览独立于已到账提示，不改真实余额，也不覆盖战斗收入动画。
      goldDelta=quote.refund;erasePreview.hidden=false;
      if(erasePreview.dataset.refund!==String(quote.refund)){
        erasePreview.dataset.refund=String(quote.refund);erasePreview.textContent=`↩${quote.refund}`;
        erasePreview.append(document.querySelector('.price-coin').cloneNode(true));
      }
    }
  }
  if(goldDelta!==null){
    refundPreview.hidden=false;refundPreview.classList.toggle('spend-preview',goldDelta<0);$('moneyGain').hidden=true;
    refundPreview.firstElementChild.textContent=resourceChange(goldDelta);refundPreview.setAttribute('aria-label',`预计${goldDelta<0?'花费':'返还'} ${Math.abs(goldDelta)} 金币，余额将为 ${funds(state)+goldDelta}`);
  }
  previewPopulation(totalDelta,freeDelta);
  fitResources();

  ctx.save(); ctx.translate(panX, panY); ctx.scale(size, size);
  drawCitySurroundings(ctx,cityLayout,nightMix,mapFogEnabled()?state.explored:null,backdrop);
  // 游玩时受探索遮罩约束；白天展开敌源编辑仅临时预览全图，不写探索记录。
  ctx.fillStyle=palette.fog;ctx.fillRect(0,0,SIZE,SIZE);
  if(!visibleCell(key(30,15))){ctx.fillStyle='#8997a8';ctx.font='600 1.5px system-ui';ctx.textAlign='center';ctx.fillText('未探索 · 向北推进',30,15);}

  const eligibleCells=weaponPlacementReady?view.towers.eligible(weaponType()):new Set();
  for (let y = bounds.top; y < bounds.bottom; y++) for (let x = bounds.left; x < bounds.right; x++) {
    const id = key(x, y), power = fire.get(id) || 0;
    ctx.fillStyle = tool!==null&&(x + y) % 2 ? palette.groundA : palette.groundB;
    ctx.fillRect(x, y, 1, 1);
    if(state.layout?.tiles[id]==='road')drawRoadTexture(ctx,state.layout,x,y,nightMix);
    if(view.towers.cellSites[id]&&!state.blocked.has(id)){ctx.fillStyle=nightMix>.5?'#2c4841':'#77967b';ctx.fillRect(x,y,1,1);}
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
      // 墙只用基础地面控制；炮位资格已在状态更新时缓存。
      if(tool==='wall'&&state.phase==='build'&&rawControlled.has(id)&&!state.walls.has(id)&&!state.towers.has(id)&&!state.outposts.has(id)&&id!==state.camp&&!reservedSources(state).some(a=>key(a.x,a.y)===id))eligibleCells.add(id);
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
    ctx.strokeStyle = colors[(sourceNumber(viewedSources()[index])>=0?sourceNumber(viewedSources()[index]):index) % colors.length]; ctx.globalAlpha = future?.35:.8; ctx.lineWidth = future?.065:.10;
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
    const [x,y]=xy(id), changed=added.has(id);if(!inView(x,y))continue;
    if(!state.walls.has(id)&&!sourceFootprint.has(id)){
      // 数值使用深色小底与描边，局部遮住装饰中线，确保火力信息优先。
      const value=(fire.get(id)||0)+(changed?weapon.power:0),font=Math.max(changed?.43:.35,9/size);
      ctx.save();ctx.font=`600 ${font}px system-ui`;const tw=ctx.measureText(String(value)).width;
      ctx.fillStyle='#102b2be6';ctx.fillRect(x+.5-tw/2-.09,y+.5-font*.6,tw+.18,font*1.2);
      label(value,x+.5,y+.5,changed?'#f0ffad':'#cbffe5',font);ctx.restore();
    }
  }
  for(const p of state.sites){
    if(!inView(p.x,p.y,p.width??p.size,p.height??p.size))continue;
    const {x,y}=p,n=p.width??p.size,m=p.height??p.size,id=key(x,y),built=state.production.has(id),active=built&&productionActive(state,id),selected=hoveredPlot===id&&(['production','housing'].includes(tool)||(tool==='erase'&&['production','housing','ruin'].includes(demolitionQuote(state,hover).type)));
    const overlay=view.towers.plots.get(id),empty=overlay.content.status==='empty';
    // 悬停时把街区作为一个操作对象，盖住内部格线，避免误认为逐格恢复。
    if(view.sourceSites.has(id)){ctx.fillStyle=nightMix>.5?'#322c36':'#67504f';ctx.fillRect(x+.08,y+.08,n-.16,m-.16);continue;}
    if(p.role==='camp'){ctx.fillStyle=nightMix>.5?'#49433a':'#ad9468';ctx.fillRect(x+.08,y+.08,n-.16,m-.16);ctx.strokeStyle='#e8c481';ctx.lineWidth=.10;ctx.strokeRect(x+.12,y+.12,n-.24,m-.24);continue;}
    if(empty){ctx.strokeStyle=selected?'#fff0ae':'#a8d5ad';ctx.lineWidth=selected?.12:.06;ctx.setLineDash([.2,.12]);ctx.strokeRect(x+.08,y+.08,n-.16,m-.16);ctx.setLineDash([]);continue;}
    // 按物理 footprint 画建筑，屋顶炮位保留建筑底色；经营面积独立计算。
    ctx.save();ctx.beginPath();
    for(const cell of overlay.footprint){if(postGhost&&cell===hover)continue;const [cx,cy]=xy(cell);ctx.rect(cx,cy,1,1);}ctx.clip();
    ctx.fillStyle=selected?(active?'#527e59':built?'#80594e':'#655f3d'):active?'#527e59':built?'#80594e':nightMix>.5?'#494b42':'#81745b';ctx.fillRect(x+.08,y+.08,n-.16,m-.16);
    ctx.strokeStyle=selected?'#fff0ae':productionControlled(previewState,id)?'#f5d789':'#a29670';ctx.lineWidth=selected?.12:.06;ctx.strokeRect(x+.08,y+.08,n-.16,m-.16);
    // 同一整块用材质区分废墟、生产和居住，日夜分别取缓存贴图。
    drawBlockTexture(ctx,p,overlay.content.status==='ruin'?`${overlay.content.type}-ruin`:overlay.content.type,nightMix);
    if(p.role==='hospital'){ctx.fillStyle='#cbd7cb';ctx.fillRect(x+3,y+3,4,6);ctx.fillStyle='#478b80';ctx.fillRect(x+4.5,y+4,1,4);ctx.fillRect(x+3.5,y+5.5,3,1);}
    if(p.special){ctx.strokeStyle='#d5b5fc';ctx.lineWidth=.12;ctx.strokeRect(x+.16,y+.16,n-.32,m-.32);}
    if(selected)for(const cell of overlay.cells)if(!inControl(previewState,cell)){const [cx,cy]=xy(cell);ctx.fillStyle='#ed665877';ctx.fillRect(cx,cy,1,1);}
    if(active&&nightMix>0){
      ctx.save();ctx.globalAlpha=nightMix;ctx.fillStyle='#ffe4a1';
      for(let i=0;i<n;i++){ctx.fillRect(x+.18+i,y+.18,.18,.18);ctx.fillRect(x+.18+i,y+m-.36,.18,.18);}ctx.restore();
    }
    ctx.restore();
    const occupied=new Set(overlay.footprint);ctx.strokeStyle=selected?'#fff0ae':'#b2a47b';ctx.lineWidth=.06;ctx.beginPath();
    for(const cell of occupied){const [cx,cy]=xy(cell);if(!occupied.has(key(cx-1,cy))){ctx.moveTo(cx,cy);ctx.lineTo(cx,cy+1);}if(!occupied.has(key(cx+1,cy))){ctx.moveTo(cx+1,cy);ctx.lineTo(cx+1,cy+1);}if(!occupied.has(key(cx,cy-1))){ctx.moveTo(cx,cy);ctx.lineTo(cx+1,cy);}if(!occupied.has(key(cx,cy+1))){ctx.moveTo(cx,cy+1);ctx.lineTo(cx+1,cy+1);}}ctx.stroke();
    // 街区标签在屏幕空间绘制，缩小棋盘时仍保持可读。
  }
  ctx.beginPath();
  for(const id of eligibleCells){const [x,y]=xy(id);if(inView(x,y))ctx.rect(x+(weaponSelected?.04:.45),y+(weaponSelected?.04:.45),weaponSelected?.92:.1,weaponSelected?.92:.1);}
  ctx.fillStyle=weaponSelected?'#75ebbe38':'#a9d4cb99';ctx.fill();
  if(weaponSelected){
    ctx.beginPath();for(const id of eligibleCells){const [x,y]=xy(id);if(inView(x,y))ctx.rect(x+.08,y+.08,.84,.84);}
    ctx.strokeStyle='#95f1cf';ctx.lineWidth=.07;ctx.stroke();
  }
  // 建筑整体归属的轮廓最后绘制，避免被屋顶贴图盖住；开放地面仍逐格走边。
  ctx.strokeStyle='#86ccea';ctx.lineWidth=.08;ctx.setLineDash([.16,.12]);ctx.beginPath();
  for(const [a,b,c,d] of view.boundary){ctx.moveTo(a,b);ctx.lineTo(c,d);}
  ctx.stroke();ctx.setLineDash([]);
  // 拆除高亮只覆盖实际对象：物理建筑或独立设施一格。
  if(tool==='erase'&&hover!==null&&state.phase==='build'){
    const q=demolitionQuote(state,hover),cells=['production','housing','ruin'].includes(q.type)?buildingCells(state,hover):q.type?[hover]:[];
    ctx.fillStyle='#ef987744';ctx.strokeStyle='#ffd0a1';ctx.lineWidth=.08;
    for(const id of cells){const [x,y]=xy(id);ctx.fillRect(x+.04,y+.04,.92,.92);ctx.strokeRect(x+.04,y+.04,.92,.92);}
  }
  for (const [id,type] of [...state.towers,...(ghost?[[hover,weaponType()]]:[])]) {
    const [x,y] = xy(id);if(!inView(x,y))continue;
    ctx.save();if(ghost&&id===hover)ctx.globalAlpha=.5;
    ctx.fillStyle='#253e3a';ctx.fillRect(x+.04,y+.04,.92,.92);ctx.strokeStyle='#92c8b8';ctx.lineWidth=.06;ctx.strokeRect(x+.04,y+.04,.92,.92);ctx.fillStyle=type==='B'?'#bab3f2':'#8bdbb9'; ctx.fillRect(x+.18,y+.22,.64,.6); ctx.fillStyle='#28483b'; ctx.fillRect(x+.37,y+.32,.26,.38); ctx.fillStyle='#ddffe7'; ctx.fillRect(x+.43,y+.08,.14,.35);if(type==='B'){ctx.fillRect(x+.22,y+.12,.12,.34);ctx.fillRect(x+.66,y+.12,.12,.34);}
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
  const [cx,cy] = xy(state.camp);
  // 火光是共同守护目标，用局部光晕定位；不暗化整个战场。
  ctx.save();
  if(!state.result&&campCritical(state))ctx.globalAlpha=reducedMotion.matches?1:.6+.4*(.5+.5*Math.cos(performance.now()*Math.PI*2/1400));
  const glow=ctx.createRadialGradient(cx+.5,cy+.5,.1,cx+.5,cy+.5,1.8);
  glow.addColorStop(0,state.hp<=0?'#ffc17c00':!state.result&&campCritical(state)?'#f5847c99':'#ffc17c44');glow.addColorStop(1,'#ffc17c00');ctx.fillStyle=glow;ctx.fillRect(cx-1.3,cy-1.3,3.6,3.6);
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
    const t=Math.min(1,motion.elapsed/moveDuration()), eased=t*t*(3-2*t);
    for(const enemy of motion.actors){const [x,y]=xy(enemy.id),[tx,ty]=xy(enemy.to);drawEnemy(enemy,x+(tx-x)*eased,y+(ty-y)*eased);}
  } else {
    for(const enemy of state.enemies){
      const [x,y]=xy(enemy.id), before=incoming.get(enemyKey(enemy))?.hp ?? enemy.hp;
      const merged=state.events.some(e=>e.type==='merge'&&e.id===enemy.id&&e.target===enemy.target);
      drawEnemy(enemy,x,y,merged?1+.16*Math.sin(impact*Math.PI):1,1,before+(enemy.hp-before)*impact);
    }
    if(impact<1)for(const event of state.events){
      if(event.type==='nightSkip')continue; // 空闲跳时不是受击，不绘制伤害反馈。
      const [x,y]=xy(event.id);
      if(['sourceHit','sourceLost'].includes(event.type)){
        const source=state.enemySources.get(event.sourceId);ctx.save();ctx.globalAlpha=1-impact;
        ctx.strokeStyle=event.type==='sourceLost'?'#b9d8c1':'#ffbbb0';ctx.lineWidth=.10;ctx.strokeRect(x+.02,y+.02,source.width-.04,source.height-.04);ctx.restore();continue;
      }
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
  if(mapFogEnabled())drawFog(ctx,SIZE,sight,state.explored,nightMix,reducedMotion.matches?0:performance.now()/1000,bounds);
  // 已知感染核心在雾上保留身份；危险状态只表达今晚计划，不预告激活日期。
  const displayedSources=sourceEditing()?[...state.enemySources.values()].map(s=>({...s,active:state.sources.some(p=>p.sourceId===s.id)})):knownSources(state);
  const sourcePreview=editorSourcePreview?{...editorSourcePreview,hp:sourceMaxHP(editorSourcePreview,state.params),active:state.sources.some(p=>p.sourceId===editorSourcePreview.id)}:null;
  for(const source of [...displayedSources.filter(s=>s.id!==sourcePreview?.id),...(sourcePreview?[sourcePreview]:[])]){
    const x=source.bx??source.x,y=source.by??source.y,w=source.width??1,h=source.height??1,alive=source.hp!==0;
    const pulse=reducedMotion.matches?1:.5+.5*Math.sin(performance.now()*Math.PI*2/1500),danger=alive&&source.active;
    ctx.save();ctx.globalAlpha=alive?(danger?.7+.3*pulse:.48):.4;
    ctx.fillStyle=alive?'#542b32':'#35433d';ctx.strokeStyle=alive?(danger?'#ff574b':'#b07e78'):'#9ac8ad';ctx.lineWidth=Math.max(.09,1.2/size);
    ctx.setLineDash(danger?[]:[.2,.14]);
    if(danger){ctx.shadowColor='#ff3c31';ctx.shadowBlur=reducedMotion.matches?9:8+8*pulse;}
    ctx.beginPath();ctx.moveTo(x+.20,y+.04);ctx.lineTo(x+w-.20,y+.04);ctx.lineTo(x+w-.04,y+.20);ctx.lineTo(x+w-.04,y+h-.20);ctx.lineTo(x+w-.20,y+h-.04);ctx.lineTo(x+.20,y+h-.04);ctx.lineTo(x+.04,y+h-.20);ctx.lineTo(x+.04,y+.20);ctx.closePath();ctx.fill();ctx.stroke();
    ctx.shadowBlur=0;ctx.setLineDash([]);
    label(alive?source.index+1:'×',x+w/2,y+h/2,alive?'#edd4ca':'#b9d8c1',Math.max(.4,8/size));
    ctx.restore();
    if($('settings').open&&Number.isInteger(source.x)&&Number.isInteger(source.y)){ctx.save();ctx.strokeStyle='#ffc17c';ctx.lineWidth=.12;ctx.strokeRect(source.x+.15,source.y+.15,.7,.7);ctx.restore();}
    if(!alive||!source.id)continue;
    // 所有核心的徽记统一放占地下沿外，与中心编号分开，放大后也不会遮挡。
    ctx.save();ctx.globalAlpha=danger?1:.72;ctx.font=`600 ${Math.max(.44,10/size)}px system-ui`;ctx.textAlign='left';ctx.textBaseline='middle';
    const shield=Math.max(.48,10/size),badgeWidth=shield+.18+ctx.measureText(String(source.hp)).width+.22;
    const cx=x+w/2,cy=y+h+shield*.65;
    ctx.fillStyle='#211d24ee';ctx.fillRect(cx-badgeWidth/2-.10,cy-shield*.62,badgeWidth+.20,shield*1.24);
    ctx.strokeStyle=danger?'#bb7865':'#6b5655';ctx.lineWidth=Math.max(.05,.7/size);ctx.strokeRect(cx-badgeWidth/2-.10,cy-shield*.62,badgeWidth+.20,shield*1.24);
    drawShield(ctx,cx-badgeWidth/2,cy-shield/2,shield);ctx.fillStyle='#ffe6cc';ctx.fillText(source.hp,cx-badgeWidth/2+shield+.18,cy);
    const value=sourceDamage.get(source.id)||0;
    if(($('heat').checked||selectedSource===source.id)&&value){
      ctx.font=`600 ${Math.max(.4,9/size)}px system-ui`;ctx.textAlign='center';ctx.lineWidth=.16;ctx.strokeStyle='#172429';
      const dy=cy+shield*1.25;ctx.strokeText(`−${value}/拍`,cx,dy);ctx.fillStyle='#f8c39f';ctx.fillText(`−${value}/拍`,cx,dy);
    }
    ctx.restore();
  }
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
    if(!inView(p.x,p.y,p.width??p.size,p.height??p.size))continue;
    const id=key(p.x,p.y),built=state.production.has(id),active=built&&productionActive(state,id);
    const overlay=view.towers.plots.get(id);
    if(weaponSelected&&p.role!=='hospital'&&!overlay.controlled)continue;
    // 敌人经过街区时优先显示敌群，避免标签盖住生命与血条。
    const cells=overlay.cells;
    if(view.sourceSites.has(id))continue;
    if(p.role==='hospital'?!visibleCell(key(p.x+Math.floor((p.width??p.size)/2),p.y+Math.floor((p.height??p.size)/2))):!cells.every(cell=>visibleCell(cell)))continue;
    // 已探索但失去视野的街区只保留暗淡地形，报价不越过迷雾。
    if(p.role!=='hospital'&&!cells.some(cell=>currentlyVisible(cell)))continue;
    if(p.role!=='hospital'&&!weaponSelected&&!['production','housing'].includes(tool))continue;
    // 第一天尚未开放经营；正常报价随地块缩放，不再因镜头缩小突然消失。
    if(p.role!=='hospital'&&!weaponSelected&&state.day===1&&hoveredPlot!==id)continue;
    if((motion?.actors||state.enemies).some(e=>cells.includes(e.id)||cells.includes(e.to)))continue;
    const x=panX+(p.x+(p.width??p.size)/2)*size;
    let y=panY+(p.y+(p.height??p.size)/2)*size;
    // 窄街区的容量标签放在未架炮的行，避免把已有炮的图标遮住。
    if(weaponSelected&&(p.width??p.size)<=2){
      const occupied=overlay.towerCells.map(cell=>xy(cell)[1]);
      if(occupied.length){
        const rows=Array.from({length:p.height??p.size},(_,i)=>p.y+i).filter(row=>!occupied.includes(row));
        rows.sort((a,b)=>Math.abs(a+.5-p.y-(p.height??p.size)/2)-Math.abs(b+.5-p.y-(p.height??p.size)/2));
        if(rows.length)y=panY+(rows[0]+.5)*size;
      }
    }
    if(p.role!=='hospital'&&!weaponSelected&&!built&&hoveredPlot!==id&&!productionControlled(state,id))continue;
    const content=overlay.content;
    if(cells.includes(state.camp))continue;
    if(p.role==='hospital'){
      ctx.save();ctx.font='700 18px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';
      ctx.lineWidth=4;ctx.strokeStyle='#142024';const taken=campaignGoals(state).hospital,label=taken?'医院 ✓':'医院';ctx.strokeText(label,x,y);ctx.fillStyle=taken?'#bff5ce':'#fff0bc';ctx.fillText(label,x,y);ctx.restore();continue;
    }
    // 空地跟随所选用途报价，已有用途只在对应工具下显示。
    if(weaponSelected?(content.status==='empty'||!['production','housing'].includes(content.type)):content.status!=='empty'&&content.type!==tool)continue;
    const home=tool==='housing',complete=home?state.housing.has(id):built;
    const quote=weaponSelected?null:home?housingQuote(state,id):productionQuote(state,id);
    const rows=[];
    if(!weaponSelected&&!complete)rows.push({text:`−${quote.cost}`,icon:'coin',suffix:'',color:funds(state)>=quote.cost?'#f5df9c':'#f3a49c'});
    if(weaponSelected){
      const capacity=overlay.capacity;
      rows.push({text:`${capacity.used}/${capacity.max}`,icon:'military',suffix:'',color:capacity.used>=capacity.max?'#f3a49c':'#c4f4df'});
    }else if(!home){
      // 建成后仅显示占用人数与收入图标；未建成仍保留费用和产出报价。
      rows.push({text:`${productionLabor(state,id)}`,icon:'people',suffix:'',color:'#f4d3a2'});
      rows.push({text:`+${complete&&!active?0:quote.income}`,icon:'coin',suffix:'',color:'#bff5ce'});
    }else rows.push({text:`+${quote.residents}`,icon:'residents',suffix:'',color:'#f4d3a2'});
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
  // 悬停只辨认地块尺寸与类型；费用、用工、火力及控制状态沿用各自直接预览。
  // 无效悬停不重复解释，点击拒绝仍由顶栏短暂提示。
  if(hover!==null){
    const p=productionSite(hover,state),content=p?view.towers.plots.get(hoveredPlot).content:null;
    const source=knownSources(state).find(s=>s.site===hoveredPlot);
    let type='',w=p?.width??p?.size,h=p?.height??p?.size;
    if(source){type=source.hp>0?'感染据点':'感染据点残骸';w=source.width??1;h=source.height??1;}
    else if(p?.role==='camp')type='火光广场';
    else if(p?.role==='hospital')type='医院';
    else if(state.outposts.has(hover)){type='瞭望塔';w=h=1;}
    else if(state.playerWalls.has(hover)){type='墙';w=h=1;}
    else if(content)type=content.status==='empty'?'空地':content.type==='housing'?(content.status==='ruin'?'住房废墟':'住房'):(content.status==='ruin'?'生产废墟':'生产建筑');
    else type=state.layout?.tiles[hover]==='road'?'道路':'自然地形';
    $('cellInfo').textContent=w&&h?`${w}×${h} 地块 · ${type}`:type;
  }else $('cellInfo').textContent='';
}
// 动画只刷新显示值，不把插值后的拍数写回战斗状态。
function updateNightProgress(){
  const elapsed=nightOutro?nightOutro.from+(state.params.nightTicks-nightOutro.from)*Math.min(1,nightOutro.elapsed/nightOutro.duration):Math.min(state.tick,state.params.nightTicks),progress=elapsed/state.params.nightTicks*100;
  $('nightProgress').hidden=state.phase==='build';
  $('nightProgressText').textContent=`${Math.floor(progress)}%`;
  $('nightProgressBar').setAttribute('aria-valuenow',String(Math.floor(progress)));
  $('nightProgressBar').setAttribute('aria-valuemax','100');
  $('nightProgressBar').setAttribute('aria-valuetext',`${Math.floor(progress)}%`);
  $('nightProgressFill').style.width=`${progress}%`;
  $('start').setAttribute('aria-label',`${$('startLabel').textContent}${state.phase==='build'?'':`，夜晚已过 ${Math.floor(progress)}%`}`);
}
function update() {
  // 所有建设、收支、参数、阶段和敌人移动更新都经此入口；镜头操作不失效缓存。
  mapView=null;
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
  $('toolHeading').textContent=state.result?'城市总览':daytime?'建设工具':'夜间补炮';
  const w=selectedWeapon();
  // 左下最多三行：当前工具、操作结果、悬停地块；完整规则由右侧手册承担。
  const toolNotes={wall:'建墙 · 仅基础控制内可建',outpost:'瞭望塔 · 扩张控制与视野',repair:'修复 · 悬停受损火光或墙',housing:'住房 · 修缮或在空地新建',production:'生产 · 修缮或在空地新建',erase:'拆除 · 悬停预览返还'};
  $('toolInfo').textContent=['build','long'].includes(tool)?`${weaponType()==='A'?'近防炮':'远防炮'} · 范围 ${w.range} · 火力 ${w.power}/拍`:toolNotes[tool]||'';

  $('morningTitle').textContent=state.result?(state.result.type==='victory'?'城市已收复':state.result.type==='deadline'?'收复期限已到':'本局已结束'):`${state.day===1?'守住第一晚':state.day===2?'恢复生产，守住防线':'向北收复，守住火光'}`;
  updateNightReport();
  $('mapConfigLink').href=`map-preview.html?${new URLSearchParams(mapSettings)}`;
  // 金币总额仍由模型结算；夜间按钮拆成白天基价 + 实际加急差额。
  const towerPrice=type=>{const base=state.params.weapons[type].cost,cost=towerBuildCost(state,type);return state.phase==='battle'?`${base}+${cost-base}`:base;};
  const prices={wall:state.params.wallCost,build:towerPrice('A'),long:towerPrice('B'),outpost:state.params.outpostCost,production:'按地块报价',housing:'按地块报价'};
  for(const [id,price] of Object.entries(prices))$('price-'+id).textContent=String(price);
  $('outpostWorkers').textContent=state.params.outpostWorkers;
  $('outpost').setAttribute('aria-label',`瞭望塔，花费 ${state.params.outpostCost} 金币，持续占用 ${state.params.outpostWorkers} 名工人`);
  $('budget').textContent = funds(state);
  const people=population(state);$('population').hidden=false;
  $('populationTotal').textContent=people.total;$('populationFree').textContent=people.free;
  $('populationFreeMetric').classList.toggle('no-workers',people.free===0);
  const watchWorkers=state.outposts.size*state.params.outpostWorkers;
  $('populationDetailTotal').textContent=`${people.total} 人`;$('populationDetailFree').textContent=`${people.free} 人`;
  $('populationDetailProduction').textContent=`${people.working-watchWorkers} 人`;$('populationDetailWatch').textContent=`${watchWorkers} 人`;
  $('campHP').textContent = `HP ${Math.max(0,state.hp)} / ${state.params.campHP}`; $('campBar').style.width = `${Math.max(0,state.hp)/state.params.campHP*100}%`;
  const critical=!state.result&&campCritical(state);
  $('campPanel').classList.toggle('camp-critical',critical);viewport.classList.toggle('camp-critical',critical);
  $('campWarning').hidden=!critical;$('showDefeat').hidden=state.phase!=='lost';$('showVictory').hidden=state.result?.type!=='victory';
  if(state.result?.type!=='victory'&&$('victory').open)$('victory').close();
  if(state.phase!=='lost'&&$('defeat').open)$('defeat').close();
  const active = state.phase === 'battle'&&!nightOutro, build = state.phase === 'build';
  document.body.dataset.phase=state.phase;
  sourceCleanup=nightCleanupState(state)==='source';
  $('speedLabel').textContent=sourceCleanup?`清源 ${effectiveSpeed()}×`:'速度';
  $('start').classList.toggle('night-failed',state.phase==='lost');
  $('start').classList.toggle('night-ended',!build&&!active);

  const dawn=build||state.economySettled&&campaignComplete(state);
  document.body.dataset.time=dawn?'day':'night';
  $('timeIcon').setAttribute('aria-label',dawn?'白天':'夜晚');
  const goals=campaignGoals(state);
  $('finalGoal').innerHTML=goals.enabled?`<span>目标：${state.waves.length} 晚内</span><span class="goal-item${goals.hospital?' goal-complete':''}">收复医院：<span class="goal-status">${goals.hospital?'已收复':'未收复'}</span></span><span class="goal-item${goals.sources?' goal-complete':''}">摧毁全部敌源：<span class="goal-status">${goals.cleared}/${goals.total}</span></span>`:'最终目标 · 完成防守实验';
  const iconContext=$('campIcon').getContext('2d');iconContext.clearRect(0,0,64,64);drawCampfire(iconContext,4,5,54,state.hp>0);
  $('phase').textContent=`第 ${state.day} 天`;
  $('start').disabled = !build && !active;
  $('retry').disabled=!preparation; $('step').disabled = !active || !paused || !!motion?.singleStep;
  $('startLabel').textContent = nightOutro?'迎来黎明':active ? (paused ? '继续夜晚' : '暂停夜晚') : state.result?.type==='victory'?'收复成功':state.result?.type==='deadline'?'收复未完成':state.result?.type==='experiment'?'实验完成':build?'开始夜晚':state.phase==='won'?'守住了':'防守结束';
  updateNightProgress();
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
    blockedActionReasons.set(id,!allowed?(state.result?'本局已结束':'防守中不能建设'):short?(!Number.isFinite(cost)?'没有可补建的同用途街区':`资金不足：需要 ${cost}，现有 ${funds(state)}`):'');
    $(id).title=allowed&&!short?`花费 ${cost} 资金`:'';
  }
  $('repair').disabled=!repairAvailable;
  blockedActionReasons.set('repair',!build?'防守中不能修复':state.day<2?'次日才能修复':!repairTargets.length?'没有受损设施':!repairAvailable?repairError(state,repairTargets[0]):'');
  $('repair').title=repairAvailable?'悬停受损目标预览费用与恢复量':'';
  for(const id of ['applyParams','cancelParams','defaults'])$(id).disabled=!build||state.day!==1;
  for(const id of ['apply','addSource','addWave','applySourceMap','cancelSourceConfig','sourceDefaults']){$(id).disabled=false;$(id).setAttribute('aria-disabled',String(!build));}
  document.querySelectorAll('#sources input, #sources select, #mapSources input, #mapSources select, #sourceNight').forEach(el=>el.disabled=!build);
  document.querySelectorAll('[data-config-action]').forEach(el=>el.setAttribute('aria-disabled',String(!build)));
  $('sourceConfigStatus').textContent=sourceConfigurationDirty()?'存在未应用修改。':'当前配置已应用。';
  document.querySelectorAll('#params input, #params select').forEach(el=>el.disabled=!build||state.day!==1);
  // 成败与收入由结算画面、收入卡承担；实时事件沿用右侧战场记录。
  if(['won','lost'].includes(state.phase))$('toolInfo').textContent='';
  updateForecast();
  draw();
}
// 收入卡只读取已结束夜晚的快照，不把白天新投资混入昨夜结果。
function updateNightReport(){
  const report=state.phase==='build'?state.lastNight:state.economySettled?{day:state.day,economy:state.nightEconomy,earned:state.nightEarned,...state.productionReport}:null;
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
// 图例与实际敌群复用同一标记，避免符号或 SVG 在两处出现差异。
function appendForecastOutcome(block,status){
  const marks={killed:'×',withdrawn:'↩',leaked:'↘'};
  if(status==='blocked'||marks[status]){
    const mark=document.createElement('b');mark.className='forecast-outcome';
    if(status==='blocked')mark.innerHTML=SPAWN_BLOCKED_SVG;else mark.textContent=marks[status];
    block.append(mark);
  }
}
document.querySelectorAll('#forecastLegend .forecast-enemy').forEach(block=>appendForecastOutcome(block,block.dataset.status));
// 手册复用玩家已经见过的图形，避免用开发术语或另一套符号解释规则。
const manualIcons={wall:$('wall').querySelector('.tool-name>span').outerHTML,cannon:$('build').querySelector('svg').outerHTML,coin:$('wall').querySelector('.price-coin').outerHTML,housing:'⌂',worker:WORKER_SVG,watch:WATCHTOWER_SVG,destroyed:SOURCE_DESTROYED_SVG};
document.querySelectorAll('[data-manual-icon]').forEach(icon=>{
  const type=icon.dataset.manualIcon;
  if(type==='camp'){
    const canvas=document.createElement('canvas');canvas.width=canvas.height=24;drawCampfire(canvas.getContext('2d'),3,3,18);icon.append(canvas);
  }else if(type==='route'||type==='futureRoute')icon.innerHTML=`<svg viewBox="0 0 24 12"><path d="M1 6h22" fill="none" stroke="currentColor" stroke-width="2"${type==='futureRoute'?' stroke-dasharray="3 2"':''}/></svg>`;
  else icon.innerHTML=manualIcons[type];
});
function updateForecast() {
  const selectable=$('allowForecastSelection').checked;
  $('forecastDay').hidden=!selectable;
  if(!selectable)$('forecastDay').value=String(sourceEditing()?editingNight-1:state.day-1);
  const night=Number($('forecastDay').value)+1, sources=viewedSources();
  $('forecastTitle').textContent=`原定 ${sources.reduce((sum,s)=>sum+s.count,0)} 个敌群`;
  $('forecastList').replaceChildren(...sources.map((s,i)=>{
    const row=document.createElement('li'),name=document.createElement('div'),blocks=document.createElement('div');
    row.style.setProperty('--source-color',colors[(s.sourceId?sourceNumber(s):i)%colors.length]);
    const cleared=s.sourceId&&state.enemySources.get(s.sourceId)?.hp===0;
    name.className='forecast-source';name.textContent=`敌源 ${s.sourceId?sourceNumber(s)+1:i+1}`;
    if(cleared){
      const icon=document.createElement('span');icon.className='source-destroyed-icon';icon.innerHTML=SOURCE_DESTROYED_SVG;name.append(icon);
      name.title='敌源已摧毁';name.setAttribute('aria-label',`${name.textContent}，已摧毁`);
    }
    blocks.className='forecast-blocks';blocks.setAttribute('aria-label',`${s.count} 个敌群，每个 ${s.hp} HP`);
    for(let n=0;n<s.count;n++){
      const block=document.createElement('span'),status=night===state.day?enemyBatchStatus(state,{...s,index:i},n):'pending';
      block.className=`forecast-enemy ${status}`;
      const hp=document.createElement('span');hp.textContent=s.hp;block.append(hp);
      appendForecastOutcome(block,status);
      const label={killed:'已消灭',blocked:'出兵已阻止，不计击杀、不发金币',leaked:'已抵达火光',withdrawn:'天亮撤退',pending:'待出场',active:'正在进攻'}[status];
      block.title=label;block.setAttribute('aria-label',`敌群 ${n+1}，${s.hp} HP，${label}`);blocks.append(block);
    }
    row.append(name,blocks);return row;
  }));
}
$('forecastDay').onchange=()=>{updateForecast();draw();};
// 关闭跨晚预览时立即回到当晚，避免地图残留其他晚的路线。
$('allowForecastSelection').onchange=()=>{updateForecast();draw();};

// 两层编辑仅引用同一据点编号；草稿不写入战场，应用时统一校验。
function sourceField(fields,name,label,value,min,max,prefix){
  const wrap=document.createElement('label');wrap.textContent=label;
  const input=document.createElement('input');input.type='number';input.name=name;input.value=value??'';input.min=min;input.max=max;input.step=1;input.setAttribute('aria-label',`${prefix} ${label}`);wrap.append(input);fields.append(wrap);return input;
}
function configEditable(){if(state.phase!=='build'){showTopNotice('仅白天可编辑敌源配置。');return false;}return true;}
function mapSourceEditor(rows){
  $('mapSources').replaceChildren();
  for(const row of rows){
    const card=document.createElement('div');card.className='source';card.dataset.sourceId=row.id;card.dataset.index=row.index;card.sourceRow={...row};
    const head=document.createElement('div');head.className='source-head';const name=document.createElement('span');name.textContent=`敌源 ${row.index+1}`;
    const actions=document.createElement('div');actions.className='source-actions';
    const focus=document.createElement('button');focus.textContent='定位';focus.onclick=()=>{
      const source=readMapSources().find(s=>s.id===row.id);
      if(!Number.isInteger(source.bx)||!Number.isInteger(source.by)||!inside(source.bx,source.by)){showTopNotice('请先填写地图内的整数坐标。');return;}
      editorSourcePreview=source;selectedSource=row.id;panX=width/2-(source.bx+source.width/2)*base*zoom;panY=(height-cameraBottom)/2-(source.by+source.height/2)*base*zoom;constrainCamera();draw();
    };
    const remove=document.createElement('button');remove.textContent='删除';remove.dataset.configAction='delete';remove.onclick=()=>{if(!configEditable())return;card.remove();if(editorSourcePreview?.id===row.id)editorSourcePreview=null;update();};
    actions.append(focus,remove);head.append(name,actions);card.append(head);
    const fields=document.createElement('div');fields.className='fields';
    sourceField(fields,'bx','X',row.bx,0,SIZE-1,name.textContent);sourceField(fields,'by','Y',row.by,0,SIZE-1,name.textContent);
    const wrap=document.createElement('label');wrap.textContent='形状';const shape=document.createElement('select');shape.name='shape';shape.setAttribute('aria-label',`${name.textContent} 形状`);
    for(const value of ['1×1','1×2','2×1','1×3','3×1','2×2']){const option=document.createElement('option');option.value=value;option.textContent=value;shape.append(option);}
    shape.value=`${row.width}×${row.height}`;wrap.append(shape);fields.append(wrap);
    const hp=sourceField(fields,'maxHP','据点HP',row.maxHP,1,9999,name.textContent);hp.placeholder=String(sourceMaxHP(row,state.params));
    card.append(fields);$('mapSources').append(card);
    const preview=()=>{if(editorSourcePreview?.id===row.id)editorSourcePreview=readMapSources().find(s=>s.id===row.id);update();};card.addEventListener('input',preview);card.addEventListener('change',preview);
  }
}
function readMapSources(){return [...document.querySelectorAll('#mapSources>.source')].map(card=>{
  const previous=card.sourceRow,shape=card.querySelector('[name=shape]').value.split('×').map(Number),hp=card.querySelector('[name=maxHP]').value;
  const row={...previous,id:card.dataset.sourceId,index:Number(card.dataset.index),bx:Number(card.querySelector('[name=bx]').value||NaN),by:Number(card.querySelector('[name=by]').value||NaN),width:shape[0],height:shape[1]};
  delete row.maxHP;if(hp.trim()!=='')row.maxHP=Number(hp);return row;
});}
function sourceEditor(sources){
  $('sources').replaceChildren();
  sources.forEach((s,i)=>{
    const card=document.createElement('div');card.className='source';
    const head=document.createElement('div');head.className='source-head';
    const select=document.createElement('select');select.name='sourceId';select.setAttribute('aria-label',`出兵安排 ${i+1} 敌源`);
    for(const source of readMapSources()){const option=document.createElement('option');option.value=source.id;option.textContent=`敌源 ${source.index+1}${state.enemySources.get(source.id)?.hp===0?' · 已摧毁':''}`;select.append(option);}
    select.value=s.sourceId;const remove=document.createElement('button');remove.textContent='删除';remove.dataset.configAction='delete';remove.onclick=()=>{if(!configEditable())return;card.remove();update();};head.append(select,remove);card.append(head);
    const fields=document.createElement('div');fields.className='fields';
    for(const [name,label,max] of [['hp','敌人HP',999],['count','批数',30],['first','首拍',200],['interval','间隔',100]])sourceField(fields,name,label,s[name],1,max,`出兵安排 ${i+1}`);
    card.append(fields);card.addEventListener('input',update);card.addEventListener('change',update);$('sources').append(card);
  });
}
function readSources(){return [...document.querySelectorAll('#sources>.source')].map(card=>{
  const sourceId=card.querySelector('[name=sourceId]').value,source=readMapSources().find(s=>s.id===sourceId);
  return {...Object.fromEntries([...card.querySelectorAll('input')].map(input=>[input.name,input.value.trim()===''?NaN:Number(input.value)])),sourceId,x:source?.x,y:source?.y,target:-2};
});}
const sourceValues=sources=>sources.map(s=>['sourceId','hp','count','first','interval','target'].map(name=>s[name]??(name==='target'?-2:null)));
const mapSourceValues=rows=>rows.map(s=>[s.id,s.index,s.bx,s.by,s.width,s.height,s.x??null,s.y??null,s.maxHP??null]);
function sourceConfigurationDirty(){
  if(!sourceDrafts.length)return false;
  const drafts=sourceDrafts.map((plans,i)=>i===editingNight-1?readSources():plans);
  return JSON.stringify(mapSourceValues(readMapSources()))!==JSON.stringify(mapSourceValues(state.sourceCatalog))||JSON.stringify(drafts.map(sourceValues))!==JSON.stringify(state.waves.map(sourceValues));
}
function resetSourceEditors(){
  editorSourcePreview=null;sourceDrafts=structuredClone(state.waves);editingNight=state.day;
  $('sourceNight').replaceChildren(...state.waves.map((_,i)=>{const option=document.createElement('option');option.value=i+1;option.textContent=`第 ${i+1} 晚`;return option;}));$('sourceNight').value=editingNight;
  mapSourceEditor(state.sourceCatalog);sourceEditor(sourceDrafts[editingNight-1]);
}
$('sourceNight').onchange=()=>{sourceDrafts[editingNight-1]=readSources();editingNight=Number($('sourceNight').value);$('forecastDay').value=String(editingNight-1);sourceEditor(sourceDrafts[editingNight-1]);update();};
$('settings').addEventListener('toggle',()=>{if(!$('settings').open)editorSourcePreview=null;else $('forecastDay').value=String(editingNight-1);mapView=null;updateForecast();draw();});
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
  fields('全局',params,'',[['budget','资金',0,10000],['stepMs','移动节拍（毫秒）',50,5000],['wallCost','墙价',1,1000],['demolitionRefundPercent','旧投入拆除返还比例%',0,100],['wallHP','墙耐久',1,10000],['enemyPower','每个敌人拆墙伤害/拍',1,99],['defenseRepairPercent','全损维修费占墙造价%',1,100],['controlRadius','控制半径',1,30],['campHP','篝火耐久',1,10000],['campWarningPercent','火光危急阈值%',0,100],['campRepairCost','火光修复单价/HP',1,1000],['nightTicks','每晚拍数',1,500],['nightCleanupSpeed','夜末清源速度倍率',1,4],['nightIdleTransitionMs','空闲夜末过渡时长（毫秒）',0,3000]]);
  fields('地图',params,'',[['cellMeters','每格距离（米）',1,1000]]);
  fields('视野',params,'',[['campSight','火光外围格数',0,30],['outpostSight','瞭望塔外围格数',0,30],['daySightMultiplier','白天倍率',0,3],['nightSightMultiplier','夜晚倍率',0,3],['eventSightMultiplier','事件倍率',0,3],['sourceRevealPadding','敌源边缘揭示格数',0,10]]);
  fields('住房与人口',params,'',[['initialPopulation','初始人口',0,10000],['productionCellsPerWorker','每名工人承担格数',1,100],['housingCellsPerResident','每名居民占用格数',1,100],['housingCostPerCell','住房新建每格费用',1,1000]]);
  fields('经营建造',params,'',[['renovationCostPercent','修缮费用占新建价%',1,100]]);
  fields('街区生产',params,'',[['productionCostPerCell','基准每格新建费用',1,1000],['productionIncomePerCell','基准每格每晚收入',0,1000],['productionBaseArea','基准面积（格）',1,3600],['productionSmallCostFloor','小地块成本最低倍率',0.01,1],['productionDensityGrowthArea','密度增长面积（格）',1,3600],['productionMaxDensity','产出密度最高倍率',1,10]]);
  fields('敌源',params,'',[['sourceCellHPMin','每格HP下限',1,10000],['sourceCellHPMax','每格HP上限',1,10000],['sourceRegenHP','每夜回复HP',0,10000]]);
  fields('击杀收益',params,'',[['killReward','每个原始敌人金币',0,1000]]);
  fields('夜间加急',params,'',[['nightTowerCostMultiplier','炮塔金币倍率',1,10]]);
  fields('瞭望塔',params,'',[['outpostCost','造价',1,1000],['outpostWorkers','每座用工',0,100],['outpostRadius','半径',1,30],['outpostMinDistance','最小间距',1,30]]);
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
  $('paramStatus').textContent=paramsDirty()?'正在预览未应用参数，建设与开战前请应用。':'当前参数已应用。';
  if(error)showTopNotice(error);
  update();
}
function clearPlayback() {
  $('campHitFlash').getAnimations().forEach(animation=>animation.cancel());
  nightOutro=null;dawnAt=0;receiptUntil=0;$('economyReceipt').hidden=true;
  selectedSource=null;paused=false;timer=0;motion=null;placementFx=null;impactAge=1000;incoming.clear();recentGain=0;gainUntil=0;$('moneyGain').textContent='';messages=[];$('log').replaceChildren();
  document.querySelectorAll('.coin-drop').forEach(el=>el.remove());
}
function reset(keep=true){
  if(keep&&!preparation)return;
  state=keep?restoreNight(preparation):restartCampaign(state);
  if(!keep)preparation=null;
  clearPlayback();$('firstNightNotice').hidden=true;$('forecastDay').value=String(state.day-1);
  resetSourceEditors();paramsEditor(state.params);refreshParams();
  notify(keep?`已恢复第 ${state.day} 晚战前状态。`:'已重开，保留实验配置。');
}
// 失败仅展示已有成果，不额外发奖；重试与整局重来复用原有回滚规则。
function showDefeat(){
  if(state.phase!=='lost')return;
  const deadline=state.result?.type==='deadline',goals=campaignGoals(state);
  $('defeatNight').textContent=`第 ${state.day} 晚 · ${deadline?'期限已到':'防线失守'}`;
  $('defeatTitle').textContent=deadline?'收复未完成':'防守失败';
  $('defeatReason').textContent=deadline?[!goals.hospital?'医院尚未收复':'',!goals.sources?`尚有 ${goals.total-goals.cleared} 处敌源`:''].filter(Boolean).join(' · '):'火光熄灭';
  $('defeatSurvived').textContent=state.survivedNights;
  $('defeatKills').textContent=state.killed;
  $('defeatKillGold').textContent=state.earned;
  $('defeatEconomyGold').textContent=state.economyEarned;
  $('defeatNightGold').textContent=`+${state.nightEarned}`;
  $('defeatNightEconomy').textContent=`+${state.nightEconomy}`;
  const icon=$('defeatIcon').getContext('2d');icon.clearRect(0,0,96,96);drawCampfire(icon,9,9,78,state.hp>0);
  $('defeatRetry').disabled=!preparation;
  if(!$('defeat').open)$('defeat').showModal();
}
// 结算仅展示冻结成果；查看城市不进入下一天，也不再次发钱。
function showVictory(){
  const result=state.result;if(result?.type!=='victory')return;
  $('victoryNight').textContent=`第 ${result.day} 晚 · 黎明已至`;
  $('victoryDay').textContent=`第 ${result.day} 天`;$('victoryPopulation').textContent=result.population;
  $('victoryBuildings').textContent=result.buildings;$('victorySources').textContent=`${result.cleared}/${result.total}`;
  $('victoryEconomy').textContent=`+${state.economyEarned}`;$('victoryKillGold').textContent=`+${state.earned}`;
  const icon=$('victoryIcon').getContext('2d');icon.clearRect(0,0,96,96);drawCampfire(icon,9,9,78,true);
  if(!$('victory').open)$('victory').showModal();
}
$('victoryInspect').onclick=()=>{$('victory').close();$('showVictory').focus();};
$('victoryRestart').onclick=()=>reset(false);
$('showVictory').onclick=showVictory;
$('defeatRetry').onclick=()=>reset(true);
$('defeatRestart').onclick=()=>reset(false);
$('defeatInspect').onclick=()=>{$('defeat').close();$('showDefeat').focus();};
$('showDefeat').onclick=showDefeat;
for(const id of ['wall','build','long','outpost','production','housing','repair','erase'])$(id).onclick=()=>{
  tool=id;notify('');for(const button of ['wall','build','long','outpost','production','housing','repair','erase'])$(button).classList.toggle('selected',button===id);update();
};
$('testDay').replaceChildren(...state.waves.map((_,i)=>{const o=document.createElement('option');o.value=i+1;o.textContent=`第 ${i+1} 天`;return o;}));
$('applyTest').onclick=()=>{
  const error=applyTestScenario(state,Number($('testDay').value),Number($('testGold').value),Number($('testPeople').value));
  if(error){showTopNotice(error);return;}
  preparation=null;clearPlayback();$('firstNightNotice').hidden=true;hover=null;tool='wall';$('forecastDay').value=String(state.day-1);
  resetSourceEditors();paramsEditor(state.params);refreshParams();
  notify(`已进入第 ${state.day} 天，保留布局。`);
};
$('retry').onclick=()=>reset();$('clear').onclick=()=>reset(false);
// 测试台读取当前已应用参数与建筑空间；打开时暂停夜晚，避免报告与战场同时变化。
$('auditRoutes').onclick=()=>{
  if(state.phase==='battle'){paused=true;timer=0;if(motion)motion.singleStep=false;update();}
  const report=routeTimingReport(state),f=report.farthest,l=report.latest;
  $('routeAuditSummary').textContent=`夜长 ${report.nightTicks} 拍（1× ${(report.nightTicks*report.stepMs/1000).toFixed(1)} 秒） · 超时 ${report.late}/${report.total} 个敌人${report.unreachable?` · 其中不可达 ${report.unreachable} 个`:''}`;
  $('routeAuditLongest').textContent=f?`最远：敌源 ${f.sourceNumber}，移动 ${f.steps} 格 / ${f.steps} 拍（路径含起终点 ${f.cells} 格）。最晚到达：第 ${l.night} 晚敌源 ${l.sourceNumber}，末批第 ${l.lastSpawn} 拍出生 → 第 ${l.lastArrival} 拍到达。`:'没有可到达火光的路线。';
  const rows=[];
  for(const night of report.nights){
    const group=document.createElement('tr'),cell=document.createElement('th');cell.colSpan=7;cell.scope='rowgroup';cell.textContent=`第 ${night.night} 晚 · 超时 ${night.late}/${night.total} 个`;group.append(cell);group.className=night.late?'audit-late':'audit-night';rows.push(group);
    for(const row of night.rows){
      const tr=document.createElement('tr');if(row.lateCount)tr.className='audit-late';
      for(const value of [row.sourceNumber,row.steps===null?'不可达':`${row.steps} / ${row.steps}`,row.cells??'—',row.lastSpawn,row.lastArrival??'不可达',row.margin===null?'—':`${row.margin>=0?'+':''}${row.margin}`,`${row.lateCount}/${row.count}`]){
        const td=document.createElement('td');td.textContent=value;tr.append(td);
      }
      rows.push(tr);
    }
  }
  $('routeAuditRows').replaceChildren(...rows);$('routeAudit').showModal();
};
$('closeRouteAudit').onclick=()=>$('routeAudit').close();
$('applyParams').onclick=()=>{
  if(state.phase!=='build'||state.day!==1)return;
  const params=readParams(),error=validateParams(params,state);if(error){showTopNotice(error);return;}
  state.params=structuredClone(params);state.hp=params.campHP;syncSourceHealth(state);
  for(const body of state.wallHealth.values())body.hp=body.max=params.wallHP;
  rebuildTerrain(state);revealControl(state);state.lastNight=null;preparation=null;clearPlayback();

  mapSourceEditor(readMapSources());paramsEditor(state.params);refreshParams();notify('参数已应用，本轮重置。');
};
$('showFog').onchange=()=>{hover=null;update();draw();};
$('cancelParams').onclick=()=>{paramsEditor(state.params);refreshParams();};
$('defaults').onclick=()=>{paramsEditor(DEFAULTS);refreshParams();notify('默认值已填入，应用后生效。');};
$('apply').onclick=()=>{
  if(!configEditable())return;
  if(paramsDirty()){showTopNotice('请先应用或取消实验参数预览。');return;}
  if(JSON.stringify(mapSourceValues(readMapSources()))!==JSON.stringify(mapSourceValues(state.sourceCatalog))){showTopNotice('请先应用或取消地图敌源修改。');return;}
  const plans=readSources(),error=configureSourceNight(state,editingNight,plans);if(error){showTopNotice(error);return;}
  sourceDrafts[editingNight-1]=structuredClone(state.waves[editingNight-1]);preparation=null;clearPlayback();sourceEditor(sourceDrafts[editingNight-1]);
  notify(`第 ${editingNight} 晚出兵计划已应用。`);update();
};
$('applySourceMap').onclick=()=>{
  if(!configEditable())return;
  if(paramsDirty()){showTopNotice('请先应用或取消实验参数预览。');return;}
  sourceDrafts[editingNight-1]=readSources();const result=configureSourceMap(state,readMapSources(),sourceDrafts);
  if(result.error){showTopNotice(result.error);return;}
  state=result.state;preparation=null;clearPlayback();hover=null;tool='wall';$('forecastDay').value='0';resetSourceEditors();paramsEditor(state.params);refreshParams();resize(true);
  notify('地图敌源与出兵计划已应用，开始新局。');
};
$('addSource').onclick=()=>{
  if(!configEditable())return;
  const rows=readMapSources();if(rows.length>=12){showTopNotice('最多 12 个地图敌源。');return;}
  const index=Math.max(-1,...state.sourceCatalog.map(s=>s.index),...rows.map(s=>s.index))+1,id=`source-${index+1}`;
  const field=createCampaign(state.params,Array.from({length:state.waves.length},()=>[]),state.layout,[]).field;
  let found;
  for(const block of state.layout.blocks){
    const row={id,index,bx:block.x,by:block.y,width:1,height:1};
    if(!resolveSourceCatalog([...rows,row],state.layout,field).error){found=row;break;}
  }
  if(!found){showTopNotice('没有可用的临街建筑，请先检查现有坐标。');return;}
  mapSourceEditor([...rows,found]);update();
};
$('addWave').onclick=()=>{
  if(!configEditable())return;
  const plans=readSources(),source=state.sourceCatalog.find(s=>!plans.some(p=>p.sourceId===s.id));
  if(!source){showTopNotice('本晚已安排所有地图敌源；每源每晚一条安排。');return;}
  plans.push({...SOURCE_WAVE_DEFAULTS,sourceId:source.id,x:source.x,y:source.y,target:-2});sourceEditor(plans);update();
};
$('cancelSourceConfig').onclick=()=>{if(!configEditable())return;resetSourceEditors();update();};
// 默认值以当前城市与实验参数重新生成，仅填草稿，应用并重开才覆盖实际战场。
$('sourceDefaults').onclick=()=>{
  if(!configEditable())return;
  const defaults=createCampaign(state.params,undefined,state.layout);
  editorSourcePreview=null;sourceDrafts=structuredClone(defaults.waves);mapSourceEditor(defaults.sourceCatalog);sourceEditor(sourceDrafts[editingNight-1]);
  notify('默认敌源与 15 晚计划已填入，应用并重开后生效。');update();
};
$('sourceAudit').onclick=()=>{if(sourceConfigurationDirty()||paramsDirty()){showTopNotice('请先应用或取消配置，再校验路线。');return;}$('auditRoutes').click();};
$('homeView').onclick=()=>resize(true);$('fit').onclick=()=>{zoom=1;constrainCamera();hover=null;draw();};$('in').onclick=()=>changeZoom(1.25);$('out').onclick=()=>changeZoom(.8);$('routes').onchange=draw;$('heat').onchange=draw;
// 右键退出当前工具，保留悬停查看与地图移动，不再执行建设或拆除。
canvas.addEventListener('contextmenu',e=>{e.preventDefault();tool=null;selectedSource=null;dragging=null;notify('');update();});
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
  if(!shouldPlace||nightOutro)return;
  const id=cellAt(e);if(id===null)return;
  const source=enemySourceAt(state,id);selectedSource=source&&knownSources(state).some(s=>s.id===source.id)?source.id:null;
  if(selectedSource){update();return;}
  if(tool===null)return;
  if(state.phase!=='build'&&!(state.phase==='battle'&&['build','long'].includes(tool))){showTopNotice('防守中只能在建筑炮位补炮，不能造墙、修复或拆除。');return;}
  if(paramsDirty()){showTopNotice('请先应用或取消实验参数预览，再修改布局。');return;}
  const beforePeople=population(state).total,beforeFunds=funds(state),beforeHP=state.hp,erasedType=tool==='erase'?demolitionQuote(state,id).type:null;let actionError='';
  if(tool==='housing'){
    const error=actionError=buildHousing(state,id);notify(error?'':`住房已完成，新增 ${population(state).total-beforePeople} 人。`);
  } else if(tool==='production'){
    const error=actionError=buildProduction(state,id);notify(error?'':`生产已完成，守夜后收入 +${productionQuote(state,id).income}。`);
  } else if(['outpost','repair'].includes(tool)){
    const error=actionError=tool==='repair'?repairFacility(state,id):buildOutpost(state,id);notify(error?'':(tool==='repair'?(id===state.camp?`火光恢复 ${state.hp-beforeHP} HP。`:'墙已修满。'):'瞭望塔已建立，控制区扩张。'));
  } else if(tool==='wall'){
    const error=actionError=changeWall(state,id);notify(error?'':'墙已建造。');
  } else if(tool==='erase'){
    const quote=demolitionQuote(state,id);
    const error=actionError=quote.type==='housing'?removeHousing(state,id):quote.type==='production'?removeProduction(state,id):quote.type==='tower'?removeTower(state,id):quote.type==='outpost'?removeOutpost(state,id):quote.type==='wall'?changeWall(state,id,true):quote.type==='ruin'?clearPlot(state,id):'这里没有可拆除的设施。';
    notify(error?'':(quote.type==='ruin'?'废墟已拆为空地。':`已拆除，返还 ${quote.refund} 金币。`));
  } else {
    const type=weaponType(),error=actionError=weaponPlacementError(id)||buildTower(state,id,type);
    if(!error){notify(`${type==='A'?'近防炮':'远防炮'}已就位。`);}
  }
  if(!actionError){
    $('firstNightNotice').hidden=true;
    const delta=funds(state)-beforeFunds,site=['production','housing'].includes(tool)||(tool==='erase'&&['production','housing','outpost','ruin'].includes(erasedType))?productionSite(id,state):null;
    sound.play(tool==='erase'?'clear':tool==='repair'?'repair':'build');
    if(delta>0)sound.play('coin',.12);
    const names={wall:'墙已建造',build:'近防炮就位',long:'远防炮就位',outpost:'控制区扩张',housing:`入住 +${population(state).total-beforePeople} 人`,production:'生产已完成',repair:id===state.camp?`HP +${state.hp-beforeHP}`:'墙已修满',erase:'已拆除'};
    placementFx={id:site?key(site.x,site.y):id,size:site?.width||site?.size||1,height:site?.height||site?.size||1,start:performance.now(),color:delta<0?'#ffe1a0':'#aef2ce',text:`${names[tool]}${delta?` ${delta>0?'+':''}${delta} 金币`:''}`};
    pulse($('budget'),delta<0?'#ffe1a0':'#bff5ce');
  }else{showTopNotice(/失去与篝火的连接/.test(actionError)?'无法拆除：会切断与篝火的连接。':actionError);}
  update();
});
canvas.addEventListener('pointercancel',()=>{dragging=null;});
canvas.addEventListener('lostpointercapture',()=>{dragging=null;});
canvas.addEventListener('pointerleave',()=>{hover=null;draw();});
new ResizeObserver(()=>resize()).observe(viewport);
new ResizeObserver(fitResources).observe(document.querySelector('.wallet'));
// 预告选项跟随实际波次，避免增加夜晚后界面仍停在前三晚。
$('forecastDay').replaceChildren(...state.waves.map((_,i)=>{const option=document.createElement('option');option.value=i;option.textContent=`第 ${i+1} 晚`;return option;}));
paramsEditor(state.params);resetSourceEditors();resize(true);refreshParams();

// 短促高亮确认发生变化，不震屏，不遮挡操作；尊重减少动态效果设置。
// 失败提示每次重播字体强调，不用背景闪烁；共用顶栏提醒位置。
function showTopNotice(text){
  dismissTopNotice();notify('');
  const notice=$('firstNightNotice');notice.textContent=text;notice.hidden=false;
  topNoticeTimer=setTimeout(dismissTopNotice,2500);
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
  $('speedLabel').textContent=sourceCleanup?`清源 ${effectiveSpeed()}×`:'速度';
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
  stepBattle(state,motion?.actions,state.params.nightIdleTransitionMs>0&&!reducedMotion.matches);
  motion=null;impactAge=0;timer=0;sight=visionField(state);
  const kills=state.events.filter(event=>event.type==='kill');
  if(kills.some(event=>currentlyVisible(event.id))||state.events.some(e=>e.type==='sourceLost'))sound.play('kill');
  if(kills.some(event=>event.value>0))sound.play('coin',.1);
  if(state.events.some(event=>event.type==='leak')){sound.play('hurt');flashCampHit();}
  for (const event of state.events) {
    const [x,y] = xy(event.id);
    const defenseText={nightSkip:'来袭已结束，迎来黎明',withdraw:`${event.value} 批敌人天亮撤退`,sourceHit:`敌源 ${state.enemySources.get(event.sourceId)?.index+1} 受到 ${event.value} 点伤害`,sourceLost:`敌源 ${state.enemySources.get(event.sourceId)?.index+1} 已肃清${event.prevented?`，阻止 ${event.prevented} 个未出场敌群`:'，后续停止出兵'}`,wallHit:`墙 (${x},${y}) 受到 ${event.value} 点伤害`,wallLost:`墙 (${x},${y}) 被攻破，敌人将沿原路线推进`};
    const text = defenseText[event.type]|| (event.type === 'merge' ? `(${x},${y}) ${event.members} 批合流 → ${event.value}` : event.type === 'leak' ? `篝火受到 ${event.value} 点伤害` : event.type === 'kill' ? `(${x},${y}) 消灭 ${event.members} 批敌人，+${event.value} 资金` : `(${x},${y}) 火力削减 ${event.value}`);
    if(event.type==='kill'){showIncome(event.value);showCoins(event.id,event.value);}
    if(event.type==='leak')pulse($('campHP'),'#ff978b');
    if(currentlyVisible(event.id))messages.unshift(`第 ${event.tick??state.tick} 拍 · ${text}`);
  }
  messages = messages.slice(0,8); $('log').replaceChildren(...messages.map(text=>{const li=document.createElement('li');li.textContent=text;return li;}));
  const skip=state.events.find(event=>event.type==='nightSkip');
  if(skip&&state.phase==='battle'){
    // 只插值显示进度，真实拍数与资源冻结；接近天亮时按剩余比例缩短。
    nightOutro={from:state.tick,elapsed:0,duration:state.params.nightIdleTransitionMs*Math.min(1,skip.value/state.params.nightTicks*4)};
    tool=null;hover=null;selectedSource=null;incoming.clear();notify('');update();return;
  }
  presentNightEnd();
}
function presentNightEnd(){
  if(state.economySettled){
    if(state.result?.type==='victory')sound.play('victory');
    else if(state.result?.type==='experiment')sound.play('dawn');
    if(state.nightEconomy>0)sound.play('coin',.38);
    // 经营单独说明来源，不与最后一次击杀的括号金额相加，也不重复发钱。
    if(state.nightEconomy>0)pulse($('budget'),'#ffe1a0');
    dawnAt=campaignComplete(state)?0:performance.now()+900;
  }
  if(['won','lost'].includes(state.phase))notify('');
  if(state.result){tool=null;hover=null;selectedSource=null;}
  if(state.phase==='lost')sound.play('lost');
  update();
  if(state.phase==='lost')showDefeat();
  if(state.result?.type==='victory')showVictory();
  if(state.phase==='won')document.querySelector('.build-sidebar').scrollTop=0;
}
// 普通守夜成功短暂停留后进入白天；整局胜负保留结算，不进入次日。
function finishDawn(){
  dawnAt=0;
  if(!enterMorning(state))return;
  sound.play('dawn');
  preparation=null;paused=false;timer=0;motion=null;impactAge=1000;incoming.clear();
  $('forecastDay').value=String(state.day-1);resetSourceEditors();
  notify('');
  update();
  // 回到钱包与报告，避免浏览器滚动锚定把新插入的收入卡藏在上方。
  document.querySelector('.build-sidebar').scrollTop=0;
}
$('start').onclick=()=>{
  if(nightOutro||campaignComplete(state))return;
  if(state.phase==='battle'){paused=!paused;timer=0;update();return;}
  if(state.phase!=='build')return;
  if(!firstNightReady(state)){
    showTopNotice('请先建造一座炮塔');
    return;
  }
  if(paramsDirty()){ $('experiments').open=true;showTopNotice('实验参数有未应用修改，请先应用或取消预览。');return; }
  if(sourceConfigurationDirty()){ $('settings').open=true;showTopNotice('来袭配置有未应用修改，请先应用或取消。');return; }
  const error=validateSources(state.sources,state);if(error){showTopNotice(error);return;}
  preparation=beginBattle(state);if(!preparation)return;
  // 开战成功后撤下白天建设的失败提醒，避免被误认为夜间状态。
  $('firstNightNotice').hidden=true;
  sound.play('sunset');
  receiptUntil=0;$('economyReceipt').hidden=true;recentGain=0;gainUntil=0;$('moneyGain').textContent='';
  $('forecastDay').value=String(state.day-1);paused=false;timer=0;last=performance.now();$('settings').open=false;notify('夜晚开始，可暂停补炮。');update();
};
// 简单的逐格滑动：动画结束才提交一步战斗，无独立动画框架。
function beginMotion(singleStep=false){
  if(nightOutro||motion||state.phase!=='battle')return;
  const actions=new Map(state.enemies.map(e=>[enemyKey(e),enemyAction(state,e)]));
  motion={elapsed:0,singleStep,actions,actors:state.enemies.map(e=>({...e,to:actions.get(enemyKey(e)).to}))};
  incoming=new Map();
  const add=(id,e)=>{const groupId=enemyKey({...e,id});const old=incoming.get(groupId);if(old){old.hp+=e.hp;old.max+=e.max;old.members+=e.members;}else incoming.set(groupId,{...e,id});};
  for(const e of motion.actors)add(e.to,e);
  for(const source of state.attacks){const age=state.tick+1-source.first;if(age>=0&&age%source.interval===0&&age/source.interval<source.count&&enemyBatchStatus(state,source,age/source.interval)!=='blocked')add(key(source.x,source.y),{hp:source.hp,max:source.hp,members:1,target:source.target});}
  update();
}
$('step').onclick=()=>{if(nightOutro||state.phase!=='battle'||!paused)return;if(motion){motion.singleStep=true;update();}else beginMotion(true);};
// 移动占一个节拍的后 160ms；加速同步缩短动画，暂停冻结自动移动。
function frame(now){
  const elapsed=Math.min(now-last,100);last=now;
  const dt=elapsed*(motion?.singleStep?playbackSpeed:effectiveSpeed());
  const targetMix=document.body.dataset.time==='day'?0:1;
  if(nightMix!==targetMix){
    const shift=reducedMotion.matches?1:elapsed/600;
    nightMix=targetMix>nightMix?Math.min(targetMix,nightMix+shift):Math.max(targetMix,nightMix-shift);draw();
  }
  if(($('showFog').checked||knownSources(state).some(s=>s.hp>0&&s.active))&&!reducedMotion.matches&&now-lastFogFrame>120){lastFogFrame=now;draw();}
  // 即使夜晚暂停或白天待修，低血量篝火仍提示；减少动态偏好改用常亮红色。
  if(!state.result&&campCritical(state)&&!reducedMotion.matches&&!document.hidden&&now-lastFogFrame>80){lastFogFrame=now;draw();}
  if(nightOutro&&!document.hidden){
    nightOutro.elapsed=Math.min(nightOutro.duration,nightOutro.elapsed+elapsed);
    if(nightOutro.elapsed>=nightOutro.duration){nightOutro=null;if(finishIdleNight(state))presentNightEnd();else update();}
    else updateNightProgress();
  }
  if(dawnAt&&now>=dawnAt)finishDawn();
  if(receiptUntil&&now>=receiptUntil){receiptUntil=0;$('economyReceipt').hidden=true;}
  if(gainUntil&&now>=gainUntil){gainUntil=0;recentGain=0;$('moneyGain').textContent='';}
  if(placementFx){if(now-placementFx.start>=750)placementFx=null;draw();}
  if(impactAge<IMPACT_MS){impactAge=Math.min(IMPACT_MS,impactAge+dt);draw();}
  if(!nightOutro&&state.phase==='battle'&&(!paused||motion?.singleStep)){
    if(motion){motion.elapsed+=dt;if(motion.elapsed>=moveDuration())advance();else draw();}
    else{timer+=dt;if(timer>=state.params.stepMs-moveDuration())beginMotion();}
  }
  if(drawPending){drawPending=false;paintMap();}
  requestAnimationFrame(frame);
}
document.addEventListener('visibilitychange',()=>{sound.setHidden(document.hidden);if(document.hidden&&state.phase==='battle'){paused=true;if(motion)motion.singleStep=false;timer=0;update();}});
requestAnimationFrame(frame);
