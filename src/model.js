import { SIZE, DEFAULTS, WAVES, PRODUCTION_SITES, PRODUCTION_CURVE } from './config.js?v=51';
export const key = (x, y) => y * SIZE + x;
export const xy = id => [id % SIZE, Math.floor(id / SIZE)];
export const inside = (x, y) => x >= 0 && y >= 0 && x < SIZE && y < SIZE;

// 固定街区留下中央缺口，使三个来袭方向形成可观察的合流。
export function makeWalls() {
  const walls = new Set();
  for (let x = 2; x < 28; x++) if (x !== 15) walls.add(key(x, 14));
  for (const [left, top] of [[8, 7], [19, 7], [6, 19], [22, 19]]) {
    for (let y = top; y < top + 3; y++) for (let x = left; x < left + 2; x++) walls.add(key(x, y));
  }
  return walls;
}

// 从目标向外搜索，每格首次发现时就确定唯一下一格。
export function routeField(camp, walls) {
  const next = new Map(), distance = new Map([[camp, 0]]), queue = [camp];
  for (let i = 0; i < queue.length; i++) {
    const id = queue[i], [x, y] = xy(id);
    for (const [dx, dy] of [[0, -1], [-1, 0], [1, 0], [0, 1]]) {
      const nx = x + dx, ny = y + dy, n = key(nx, ny);
      if (!inside(nx, ny) || walls.has(n) || distance.has(n)) continue;
      distance.set(n, distance.get(id) + 1); next.set(n, id); queue.push(n);
    }
  }
  return { next, distance };
}

export function pathFrom(id, field) {
  const path = [id];
  while (field.next.has(id)) { id = field.next.get(id); path.push(id); }
  return path;
}

export function coverage(id, range = 1, shape = 'diamond') {
  const [x, y] = xy(id), cells = [];
  for (let dy = -range; dy <= range; dy++) for (let dx = -range; dx <= range; dx++) {
    if ((shape === 'square' || Math.abs(dx) + Math.abs(dy) <= range) && inside(x + dx, y + dy)) cells.push(key(x + dx, y + dy));
  }
  return cells;
}

// 新一轮保留已应用参数、玩家墙和炮台；集合复制避免重试修改旧布局。
export function createState(sources = DEFAULTS.sources, towers = new Map(), playerWalls = new Set(), params = DEFAULTS, outposts = new Map(), layout = null) {
  const sites=layout?(layout.blocks??layout.buildings??[]):PRODUCTION_SITES;
  // 非建筑固定障碍独立于经营内容；道路、广场与空地都可作为通行地面。
  const fixedWalls=layout?new Set([...(layout.nonTraversable??[]),...layout.tiles.flatMap((t,id)=>t==='block'&&!productionSite(id,{sites})?[id]:[])]):makeWalls();
  const blocked=new Set(layout?layout.tiles.flatMap((t,id)=>t==='block'?[id]:[]):[]),walls=new Set([...fixedWalls,...blocked,...playerWalls]);
  const terrainWalls=new Set([...fixedWalls,...blocked]);
  const camp = layout?key(layout.camp.x,layout.camp.y):key(...DEFAULTS.camp), field = routeField(camp, terrainWalls);
  const state = { outposts: new Map([...outposts].map(([id,p])=>[id,{...p}])), production:new Map(), housing:new Map(), clearingWorkers:0, debugGold:0, debugPopulation:0, economyEarned:0, nightEconomy:0, economySettled:false, productionReport:null, wallDays:new Map([...playerWalls].map(id=>[id,1])), towerDays:new Map([...towers.keys()].map(id=>[id,1])), demolitionSpent:0, nightBuildSpent:0, repairSpent:0, earned:0, nightEarned:0, day:1,
    layout, blocked, terrainWalls, sites, fixedWalls, playerWalls: new Set(playerWalls), walls, camp, field, sources: structuredClone(sources).map(s=>({...s,target:s.target??-2})),
    wallHealth:new Map([...playerWalls].map(id=>[id,{hp:params.wallHP,max:params.wallHP}])), attacks:[],
    params: structuredClone(params), towers: new Map(towers), phase: 'build', tick: 0,
    hp: params.campHP, enemies: [], enemyOutcomes:new Map(), events: [], spawned: 0, removed: 0, damage: 0, leaked: 0, merges: 0 };
  state.plotContents=new Map(state.sites.map(p=>[key(p.x,p.y),{status:p.kind==='open'?'empty':'ruin',type:p.kind==='open'?null:(p.ruinType??'production')}]));
  initializeExploration(state);rebuildTerrain(state);lockAttacks(state);return state;
}

// 只保留一局实验和一次战前快照；无存档、回放或通用关卡框架。
export function createCampaign(params=DEFAULTS, waves=WAVES, layout=null) {
  if(layout&&(layout.width!==SIZE||layout.height!==SIZE))throw new Error('当前战斗地图须为 60×60；其他尺寸可在布局预览实验。');
  if(layout&&waves===WAVES){
    // 出怪节奏独立于地图，暂将出生位置吸附到初始可见区北缘道路；正式敌源坐标待地图确认。
    const used=new Set(),anchors=[layout.camp.x-10,layout.camp.x+10,layout.camp.x].map(x=>{
      const cells=layout.tiles.flatMap((t,id)=>t==='road'&&Math.floor(id/SIZE)>=SIZE-30&&Math.floor(id/SIZE)<SIZE-24?[id]:[]).filter(id=>!used.has(id)&&id!==key(layout.camp.x,layout.camp.y));
      cells.sort((a,b)=>Math.abs(a%SIZE-x)+Math.abs(Math.floor(a/SIZE)-(SIZE-30))-Math.abs(b%SIZE-x)-Math.abs(Math.floor(b/SIZE)-(SIZE-30)));
      used.add(cells[0]);return xy(cells[0]);
    });
    waves=waves.map(w=>w.map((source,i)=>({...source,x:anchors[i%anchors.length][0],y:anchors[i%anchors.length][1]})));
  }
  const state=createState(waves[0],new Map(),new Set(),params,new Map(),layout);
  state.waves=structuredClone(waves).map(sources=>sources.map(s=>({...s,target:s.target??-2})));
  state.sources=state.waves[0];state.lastNight=null;lockAttacks(state);revealControl(state);
  return state;
}
export const reservedSources=state=>state.waves?.slice(state.day-1).flat()??state.sources;
// 按首次出兵日公开敌源；同一坐标视为同一个源头，停兵时保留地标。
export function knownSources(state) {
  const known=new Map();
  for(const wave of state.waves?.slice(0,state.day)??[state.sources])wave.forEach((source,index)=>{
    if(source.count>0)known.set(key(source.x,source.y),{...source,index});
  });
  return [...known.values()].map(source=>({...source,active:state.sources.some(s=>s.count>0&&s.x===source.x&&s.y===source.y)}));
}
export const firstNightReady=state=>state.day!==1||state.towers.size>0;
export const campaignComplete=state=>state.phase==='won'&&state.day===(state.waves?.length??1);
function clearNight(state) {
  state.tick=0;state.enemies=[];state.enemyOutcomes=new Map();state.events=[];state.spawned=0;state.removed=0;
  state.damage=0;state.leaked=0;state.merges=0;state.nightEarned=0;state.nightEconomy=0;state.economySettled=false;state.productionReport=null;
}
export function beginBattle(state) {
  if(state.phase!=='build'||state.hp<=0||validateSources(state.sources,state))return null;
  clearNight(state);
  const snapshot=structuredClone(state);
  state.phase='battle';return snapshot;
}
export const restoreNight=snapshot=>structuredClone(snapshot);
export function restartCampaign(state) {
  // 整局重来保留地图、参数与波次，地块内容恢复生成时的状态。
  return createCampaign(state.params,state.waves??WAVES,state.layout);
}

export function fireField(state) {
  const fire = new Map();
  for (const [tower, type] of state.towers) {
    const weapon = state.params.weapons[type];
    for (const id of coverage(tower, weapon.range, weapon.shape)) fire.set(id, (fire.get(id) || 0) + weapon.power);
  }
  return fire;
}
export const funds = state => state.params.budget + (state.debugGold??0) + state.earned + state.economyEarned - [...state.production.keys()].reduce((sum,id)=>sum+(state.production.get(id).cost??productionQuote(state,id).cost),0) - [...state.housing.keys()].reduce((sum,id)=>sum+(state.housing.get(id).cost??housingQuote(state,id).cost),0) - state.outposts.size*state.params.outpostCost - (state.nightBuildSpent??0) - state.repairSpent - state.demolitionSpent - state.playerWalls.size * state.params.wallCost - [...state.towers.values()].reduce((sum,type)=>sum+state.params.weapons[type].cost,0);
// 控制范围取火光与瞭望塔覆盖的并集；地块内瞭望塔不受击、不失守。
export function inStationRange(id, center, radius) {
  const [x,y]=xy(id),[cx,cy]=xy(center),dx=Math.abs(x-cx),dy=Math.abs(y-cy),cut=Math.min(2,radius);
  return Number.isInteger(id)&&id>=0&&id<SIZE*SIZE&&Math.max(dx,dy)<=radius&&dx+dy<=2*radius-cut;
}
// 基础地面控制只取据点的逐格范围，不读取建筑归属，避免建筑链式传播。
export function inGroundControl(state,id,radius=state.params.controlRadius) {
  return (state.hp>0&&inStationRange(id,state.camp,radius)) || [...state.outposts.keys()].some(center=>inStationRange(id,center,state.params.outpostRadius));
}
export function rawControlMask(state,radius=state.params.controlRadius) {
  const mask=new Set();
  for(let id=0;id<SIZE*SIZE;id++)if(inGroundControl(state,id,radius))mask.add(id);
  return mask;
}
export function inControl(state,id,radius=state.params.controlRadius) {
  if(inGroundControl(state,id,radius))return true;
  const cells=buildingCells(state,id);
  return cells.includes(id)&&cells.some(cell=>inGroundControl(state,cell,radius));
}
// 最终控制只添加被基础范围碰到的物理建筑，不把新增格拿去碰下一栋。
export function controlMask(state,radius=state.params.controlRadius,raw=rawControlMask(state,radius)) {
  const mask=new Set(raw);
  for(const p of state.sites){const cells=buildingCells(state,key(p.x,p.y));if(cells.some(id=>raw.has(id)))for(const id of cells)mask.add(id);}
  return mask;
}
export function controlBoundary(mask) {
  const edges=[];
  for(const id of mask){const [x,y]=xy(id);
    for(const [dx,dy,a,b,c,d] of [[-1,0,x,y,x,y+1],[1,0,x+1,y,x+1,y+1],[0,-1,x,y,x+1,y],[0,1,x,y+1,x+1,y+1]])
      if(!inside(x+dx,y+dy)||!mask.has(key(x+dx,y+dy)))edges.push([a,b,c,d]);
  }
  return edges;
}
export const incomeEligible=inControl;
// 物理寻路不读取经营种类，也不读取塔的存活状态；墙另作可破坏障碍处理。
export const terrainTraversable=(state,id)=>Number.isInteger(id)&&inside(...xy(id))&&!state.terrainWalls.has(id);
// 地块内容决定物理通行；道路和固定地块身份不会因清理而消失。
export function rebuildTerrain(state) {
  state.blocked=new Set();
  for(const p of state.sites)if(plotContent(state,key(p.x,p.y)).status!=='empty')
    for(const id of buildingCells(state,key(p.x,p.y)))state.blocked.add(id);
  state.terrainWalls=new Set([...state.fixedWalls,...state.blocked]);
  state.walls=new Set([...state.terrainWalls,...[...state.playerWalls].filter(id=>state.wallHealth.get(id)?.hp>0)]);
  rebuildFields(state);
  // 每次从当天原始题目计算必要绕行，避免临时建造再退款留下免费绕行。
  for(const attack of state.attacks)attack.path=repairPath(state,attack.originalPath??attack.path);
  revealControl(state);
}
export function rebuildFields(state) {
  state.field=routeField(state.camp,state.terrainWalls);
}
// 绕过不可攻击建筑，并在最近可达的前方路线格重新接上；墙不参与搜索。
export function repairPath(state,original) {
  let path=[...original];
  for(let attempts=0;attempts<SIZE*SIZE;attempts++){
    const blockedAt=path.findIndex(id=>state.terrainWalls.has(id));
    if(blockedAt<0)return path;
    if(blockedAt===0)return [];
    const start=path[blockedAt-1],goals=new Map(path.slice(blockedAt+1).map((id,i)=>[id,blockedAt+1+i]));
    const visited=new Map(path.slice(0,blockedAt-1).map(id=>[id,null]));visited.set(start,null);
    const queue=[start];let goal;
    for(let i=0;i<queue.length&&goal===undefined;i++){
      const id=queue[i];if(goals.has(id)&&!state.terrainWalls.has(id)){goal=id;break;}
      const [x,y]=xy(id);
      for(const [nx,ny] of [[x,y-1],[x-1,y],[x+1,y],[x,y+1]]){
        const next=key(nx,ny);if(!inside(nx,ny)||state.terrainWalls.has(next)||visited.has(next))continue;
        visited.set(next,id);queue.push(next);
      }
    }
    // 狭窄出口被建筑堵住时允许退回路口；仍只按通行距离走向原目标。
    if(goal===undefined){const fallback=pathFrom(path[0],state.field);return fallback.at(-1)===state.camp?fallback:[];}
    const detour=[];for(let id=goal;id!==null;id=visited.get(id))detour.push(id);
    path=[...path.slice(0,blockedAt-1),...detour.reverse(),...path.slice(goals.get(goal)+1)];
  }
  return [];
}
export function forecastAttacks(state,night=state.day) {
  if(night===state.day)return state.attacks;
  return (state.waves?.[night-1]??[]).map((source,index)=>({...source,index,target:state.camp,path:pathFrom(key(source.x,source.y),state.field)}));
}
// 来源、目标与初始路线在白天开始锁定；瞭望塔不进入目标池。
export function lockAttacks(state) {
  state.attacks=state.sources.map((source,index)=>{const path=pathFrom(key(source.x,source.y),state.field);return {...structuredClone(source),index,target:state.camp,originalPath:[...path],path};});
}
export const enemyKey=(enemy)=>`${enemy.id}:${enemy.target}`;
// 火光、墙与塔按实际缺失 HP 报价；一次修满，瞭望塔无需维修。
export function repairQuote(state,id) {
  const camp=id===state.camp,wall=state.wallHealth.get(id),target=camp?{hp:state.hp,max:state.params.campHP}:wall;
  const missing=target?Math.max(0,target.max-target.hp):0,type=camp?'camp':wall?'wall':'';
  const cost=wall?Math.ceil(state.params.wallCost*missing/target.max*state.params.defenseRepairPercent/100):missing*state.params.campRepairCost;
  return {missing,cost,type};
}
export function repairError(state,id) {
  if(state.phase!=='build')return '防守中不能修复。';
  if(state.day<2)return '次日才能修复受损设施。';
  const quote=repairQuote(state,id);
  if(!quote.missing)return '请选择受损火光或墙。';
  if((quote.type==='wall'&&!inGroundControl(state,id)))return '这里不在控制范围内，无法维修防线。';
  return funds(state)<quote.cost?`资金不足，修满需要 ${quote.cost} 钱（${quote.missing} HP）。`:'';
}
export function repairFacility(state,id) {
  const error=repairError(state,id);if(error)return error;
  state.repairSpent+=repairQuote(state,id).cost;
  if(id===state.camp)state.hp=state.params.campHP;
  else {
    const target=state.wallHealth.get(id);target.hp=target.max;
    if(state.wallHealth.has(id))state.walls.add(id);
  }
  return '';
}
// 瞭望塔仅占锚点一格；街区经营与防御设施共用土地但独立拆除。
export const outpostAt=(state,id)=>state.outposts.has(id)?id:undefined;
export function plotBuildError(state,id) {
  const cells=productionCells(id,state);
  if(!cells.length)return '请选择地块，建筑不能建在道路上。';
  if(productionSite(id,state)?.role==='hospital')return '医院为收复目标，占领机制待实现，不能拆除或换建。';
  if(!isExplored(state,id))return '该地块尚未探索。';
  if(cells.includes(state.camp))return '火光所在地块保留，不能拆除或换建。';
  if(cells.some(cell=>reservedSources(state).some(s=>key(s.x,s.y)===cell)))return '不能覆盖敌人来源。';
  return '';
}
export function outpostError(state,id) {
  if(state.day<3)return '第 3 天开放瞭望塔。';
  if(state.phase!=='build')return '防守中不能建设瞭望塔。';
  if(!Number.isInteger(id)||!inside(...xy(id)))return '请选择地图内的格子。';
  if(!isExplored(state,id))return '该位置尚未探索。';
  if(!inGroundControl(state,id))return '瞭望塔须建在已有基础地面控制范围内。';
  if(productionSite(id,state)?.role==='hospital')return '医院为保留目标，不能建设瞭望塔。';
  if(!terrainTraversable(state,id))return '瞭望塔只能建在可通行的道路、空地或自然地面。';
  if(state.towers.has(id)||state.playerWalls.has(id)||state.outposts.has(id)||id===state.camp||reservedSources(state).some(s=>key(s.x,s.y)===id))return '该格已有设施或保留目标。';
  const [x,y]=xy(id),distance=state.params.outpostMinDistance;
  if([...state.outposts.keys()].some(anchor=>{const [ax,ay]=xy(anchor);return Math.hypot(x-ax,y-ay)<distance;}))return `瞭望塔间距至少 ${distance} 格。`;
  return funds(state)<state.params.outpostCost?'资金不足，无法建造瞭望塔。':'';
}
export function buildOutpost(state,id) {
  const error=outpostError(state,id);if(error)return error;
  // 挑高瞭望塔只提供控制和视野，地面保持通行，不参与建筑清场。
  state.outposts.set(id,{day:state.day});revealControl(state);return '';
}
export function removeOutpost(state,id) {
  if(state.phase!=='build')return '只能在建设阶段拆除瞭望塔。';
  const anchor=outpostAt(state,id);if(anchor===undefined)return '这里没有瞭望塔。';
  const posts=new Map(state.outposts),post=posts.get(anchor);posts.delete(anchor);const candidate={...state,outposts:posts};
  if([...state.playerWalls].some(cell=>inGroundControl(state,cell)&&!inGroundControl(candidate,cell))||[...state.towers.keys()].some(cell=>inControl(state,cell)&&!inControl(candidate,cell))||[...posts.keys()].some(cell=>inGroundControl(state,cell)&&!inGroundControl(candidate,cell))||[...state.production.keys(),...state.housing.keys()].some(cell=>productionControlled(state,cell)&&!productionControlled(candidate,cell)))return '其他设施依赖此瞭望塔的控制范围，请先拆除外围设施。';
  retainDemolitionCost(state,demolitionQuote(state,id));state.outposts=posts;
  rebuildTerrain(state);return '';
}
export function enterMorning(state) {
  if(state.phase!=='won'||state.day>=(state.waves?.length??2))return false;
  state.lastNight={day:state.day,earned:state.nightEarned,economy:state.nightEconomy,...state.productionReport,leaked:state.leaked};
  state.day++;state.phase='build';state.clearingWorkers=0;
  if(state.waves)state.sources=state.waves[state.day-1];
  revealControl(state);
  clearNight(state);
  lockAttacks(state);
  // 进入白天保留建筑内容、防线损伤和资金，再生成下一晚进攻。
  return true;
}
// 基价用于投资与拆返；夜间差额立即记为不可退加急费。
export const towerBuildCost=(state,type)=>Math.ceil(state.params.weapons[type].cost*(state.phase==='battle'?state.params.nightTowerCostMultiplier:1));
export function placementError(state, id, type = 'A') {
  if (!['build','battle'].includes(state.phase)) return '本晚已结束，请进入次日或重试。';
  if (!Number.isInteger(id) || id < 0 || id >= SIZE * SIZE) return '请选择地图内的格子。';
  if(!isExplored(state,id))return '该位置尚未探索。';
  if (!inControl(state,id)) return '超出控制范围，不能架设炮台。';
  if(state.fixedWalls.has(id)||state.outposts.has(id)||state.playerWalls.has(id)||id===state.camp||reservedSources(state).some(s=>key(s.x,s.y)===id))return '该格被设施或保留目标占用，不能重叠建设炮塔。';
  if(state.phase==='battle'&&state.enemies.some(e=>e.id===id))return '不能在敌人占据的格子上补炮。';
  if (state.towers.has(id)) return state.phase==='battle'?'该格已有武器，防守中不能拆除。':'该格已有武器，可用拆除工具撤销。';
  if (!state.params.weapons[type]) return '未知武器。';
  const siteError=towerSiteError(state,id);if(siteError)return siteError;
  const embed=embeddingError(state,id);if(embed)return embed;
  if (funds(state) + embeddingQuote(state,id).refund < towerBuildCost(state,type)) return '预算不足，无法架设炮台。';
  return '';
}

// 墙只改变局部物理障碍；允许封路，宏观进攻计划始终不变。
export function wallPreview(state, id, remove = false) {
  let error = '';
  if (state.phase !== 'build') error = '战斗期间不能修改墙。';
  else if (!Number.isInteger(id) || id < 0 || id >= SIZE * SIZE) error = '请选择地图内的格子。';
  else if (remove && !state.playerWalls.has(id)) error = '固定墙不能拆除。';
  else if (!remove && !isExplored(state,id)) error = '该位置尚未探索。';
  else if (!remove && !inGroundControl(state,id)) error = '超出基础地面控制范围，不能建墙。';
  else if (!remove && state.blocked.has(id)) error = '建筑或废墟占地，需先清理为空地。';

  else if (!remove && (state.towers.has(id)||state.outposts.has(id))) error = '这里已有炮塔或瞭望塔，不能叠建墙。';
  else if (!remove && (state.walls.has(id)||state.playerWalls.has(id))) error = '这里已有墙或墙的废墟，请选择修复或拆除。';
  else if (!remove && (id === state.camp || reservedSources(state).some(s=>key(s.x,s.y)===id))) error = '不能覆盖篝火或敌人源头。';
  else if (!remove && funds(state) < state.params.wallCost) error = '资金不足，墙与炮台共用资金。';
  if (error) return { error, field: state.field };
  const walls = new Set(state.walls);
  if (remove) walls.delete(id); else walls.add(id);
  return { error, field:state.field, walls };
}
export function changeWall(state, id, remove = false) {
  const preview = wallPreview(state,id,remove);
  if (preview.error) return preview.error;
  state.walls = preview.walls; state.field = preview.field;
  if (remove) {retainDemolitionCost(state,demolitionQuote(state,id));state.playerWalls.delete(id);state.wallDays.delete(id);state.wallHealth.delete(id);}
  else {state.playerWalls.add(id);state.wallDays.set(id,state.day);state.wallHealth.set(id,{hp:state.params.wallHP,max:state.params.wallHP});}
  return '';
}

// 参数先验证、再一次性应用；不静默删除超预算设施或落在新控制范围外的布局。
export function validateParams(params, state, checkLayout = true) {
  const integer = (value,min,max)=>Number.isInteger(value)&&value>=min&&value<=max;
  if(!integer(params.cellMeters,1,1000))return '每格距离须为 1–1000 米整数。';
  if (!integer(params.budget,0,10000) || !integer(params.wallCost,1,1000) || !integer(params.controlRadius,1,30) || !integer(params.campHP,1,10000)) return '资金 0–10000、墙价 1–1000、控制半径 1–30、篝火耐久 1–10000，均为整数。';
  if(!integer(params.wallHP,1,10000)||!integer(params.enemyPower,1,99)||!integer(params.defenseRepairPercent,1,100))return '墙耐久 1–10000、敌人每拍攻击 1–99、防线维修比例 1–100%，均为整数。';
  if(!integer(params.campSight,0,30)||!integer(params.outpostSight,0,30)||!integer(params.sourceRevealSize,1,5))return '外围视野须为 0–30 整数，敌源揭示边长须为 1–5 整数。';
  if(!['daySightMultiplier','nightSightMultiplier','eventSightMultiplier'].every(k=>Number.isFinite(params[k])&&params[k]>=0&&params[k]<=3))return '视野倍率须为 0–3，可使用小数。';
  if(!integer(params.clearingCellsPerWorker,1,100))return '清理每名工人承担格数须为 1–100 整数。';
  if(!integer(params.initialPopulation,0,10000)||!integer(params.productionCellsPerWorker,1,100)||!integer(params.housingCellsPerResident,1,100)||!integer(params.housingCostPerCell,1,1000))return '初始人口 0–10000；每名工人/居民对应格数 1–100；住房每格费用 1–1000，均为整数。';
  if(checkLayout&&population({...state,params}).free<0)return '新参数会导致劳动力不足，请先调整生产或增加住房。';
  if(!integer(params.demolitionRefundPercent,0,100))return '拆除返还比例须为 0–100 整数。';
  if(!integer(params.outpostCost,1,1000)||!integer(params.outpostRadius,1,30)||!integer(params.campRepairCost,1,1000))return '瞭望塔价格 1–1000、半径 1–30；火光每 HP 修复单价 1–1000。';
  if(!['nightTowerCostMultiplier','nightClearingLaborMultiplier'].every(k=>Number.isFinite(params[k])&&params[k]>=1&&params[k]<=10))return '夜间加急倍率须为1–10。';
  if(!integer(params.outpostMinDistance,1,30))return '瞭望塔最小间距须为1–30格。';
  if(checkLayout){const ids=[...state.outposts.keys()];for(let i=0;i<ids.length;i++)for(let j=i+1;j<ids.length;j++){const [x,y]=xy(ids[i]),[a,b]=xy(ids[j]);if(Math.hypot(x-a,y-b)<params.outpostMinDistance)return '现有瞭望塔不满足新间距，请先拆除或减小间距。';}}
  for (const type of ['A','B']) {
    const w=params.weapons[type];
    if (!w || !['square','diamond'].includes(w.shape) || !integer(w.range,1,8) || !integer(w.power,1,99) || !integer(w.cost,1,1000)) return `武器 ${type}：范围 1–8、火力 1–99、价格 1–1000，均为整数。`;
  }
  if (!integer(params.productionCostPerCell,1,1000)||!(Number.isFinite(params.productionIncomePerCell)&&params.productionIncomePerCell>=0&&params.productionIncomePerCell<=1000)) return '每格生产恢复费用须为 1–1000、每格每晚收入须为 0–1000，可使用小数。';
  if (!integer(params.killReward,0,1000)) return '每个敌人击杀奖励须为 0–1000 整数。';
  const candidate={...state,params};
  if(checkLayout&&([...state.playerWalls].some(id=>!inGroundControl(candidate,id))||[...state.towers.keys()].some(id=>!inControl(candidate,id))||[...state.outposts.keys()].some(id=>!inGroundControl(candidate,id))||[...state.production.keys(),...state.housing.keys()].some(id=>!productionControlled(candidate,id))))return '现有设施超出新的控制范围，请先拆除外围设施或增大半径。';
  if (checkLayout && funds({...state,params}) < 0) return '按新价格计算，现有布局超出预算（含经营与瞭望塔）。请提高资金，或取消预览后拆除设施。';
  return '';
}
// 配置失败时保留原地图和布局，避免静默丢失试玩结果。
export function validateSources(sources, state) {
  if (!sources.length || sources.length > 12) return '源头数量应为 1–12。';
  const seen = new Set();
  for (let i = 0; i < sources.length; i++) {
    const s = sources[i], id = key(s.x, s.y), prefix = `源头 ${i + 1}：`;
    if (!['x','y','hp','count','first','interval'].every(k=>Number.isInteger(s[k])) || !Number.isInteger(s.target??-2)) return prefix + '请填写整数。';
    if (!inside(s.x, s.y)) return prefix + `坐标应为 0–${SIZE-1}。`;
    if (state.walls.has(id) || id === state.camp || state.towers.has(id) || state.outposts.has(id)) return prefix + '与障碍、火光、瞭望塔或炮位冲突。';
    if(![-2,-1].includes(s.target??-2))return prefix+'当前只攻击火光，瞭望塔不可受击。';
    if (seen.has(id)) return prefix + '位置不能重复。';
    if (!state.field.distance.has(id)) return prefix + '无法到达篝火。';
    if (s.hp < 1 || s.hp > 999 || s.count < 1 || s.count > 30 || s.first < 1 || s.first > 200 || s.interval < 1 || s.interval > 100) return prefix + '生命 1–999，批数 1–30，首拍 1–200，间隔 1–100。';
    seen.add(id);
  }
  return '';
}

// 建筑炮位不受击，敌人只攻击挡住下一格的墙。
export function enemyAction(state,enemy) {
  let path=enemy.path||pathFrom(enemy.id,state.field);
  if(path.some(id=>state.terrainWalls.has(id))){path=repairPath(state,path.slice(Math.max(0,path.indexOf(enemy.id))));enemy.path=path;}
  const at=path.indexOf(enemy.id);
  const next=path[at+1]??enemy.id;
  if(state.wallHealth.get(next)?.hp>0)return {to:enemy.id,attackId:next,attackType:'wall'};
  return {to:next};
}

// 每拍移动/撞墙、合流、持续炮火、同时结算近战；破墙后下一拍再继续原路线。
export function stepBattle(state,actions=null) {
  if (state.phase !== 'battle') return;
  state.tick++; state.events = [];
  for (const enemy of state.enemies){
    enemy.target??=state.camp;
    const action=actions?.get(enemyKey(enemy))||enemyAction(state,enemy);enemy.id=action.to;enemy.attackId=action.attackId;enemy.attackType=action.attackType;
  }
  for (const attack of state.attacks) {
    const age=state.tick-attack.first;
    if(age>=0&&age%attack.interval===0&&age/attack.interval<attack.count){
      state.enemies.push({id:key(attack.x,attack.y),target:attack.target,path:[...attack.path],hp:attack.hp,max:attack.hp,members:1,sources:[attack.index],origins:[`${attack.index}:${age/attack.interval}`]});
      state.spawned++;
    }
  }
  const groups=new Map(),merged=new Set(),mergeParts=new Map();
  for(const enemy of state.enemies){
    const groupId=enemyKey(enemy);
    if(!mergeParts.has(groupId))mergeParts.set(groupId,[]);mergeParts.get(groupId).push(enemy.hp);
    if(!groups.has(groupId))groups.set(groupId,{...enemy,sources:[...enemy.sources],origins:[...(enemy.origins||[])]});
    else{
      const group=groups.get(groupId);group.hp+=enemy.hp;group.max+=enemy.max;group.members+=enemy.members;
      group.sources=[...new Set([...group.sources,...enemy.sources])];
      // 保留每个原始敌群身份，合流后整体退场才能更新各自的预告方块。
      group.origins.push(...(enemy.origins||[]));
      if(enemy.attackId!==undefined){group.attackId=enemy.attackId;group.attackType=enemy.attackType;}
      state.merges++;merged.add(groupId);
    }
  }
  for(const groupId of merged){const group=groups.get(groupId);state.events.push({type:'merge',id:group.id,target:group.target,value:group.hp,members:group.members,parts:mergeParts.get(groupId)});}
  const fire=fireField(state),melee=new Map();state.enemies=[];
  for(const enemy of groups.values()){
    const damage=Math.min(enemy.hp,fire.get(enemy.id)||0);enemy.hp-=damage;state.damage+=damage;
    if(damage)state.events.push({type:'hit',id:enemy.id,target:enemy.target,value:damage});
    if(enemy.hp<=0){
      // 仍按原始成员发击杀奖励；攻抵目标或撤离不发钱。
      const reward=enemy.members*state.params.killReward;
      state.earned+=reward;state.nightEarned+=reward;state.removed+=enemy.members;
      for(const origin of enemy.origins)state.enemyOutcomes.set(origin,'killed');
      state.events.push({type:'kill',id:enemy.id,target:enemy.target,value:reward,members:enemy.members});
    }else if(enemy.id===enemy.target){
      // 战略目标暂沿用剩余 HP 的一次性伤害；攻击完成退场，绝不换目标。
      state.hp=Math.max(0,state.hp-enemy.hp);state.leaked+=enemy.hp;
      for(const origin of enemy.origins)state.enemyOutcomes.set(origin,'leaked');
      state.events.push({type:'leak',id:enemy.id,value:enemy.hp});
    }else{
      if(enemy.attackId!==undefined){
        const old=melee.get(enemy.attackId)||{type:enemy.attackType,value:0};old.value+=enemy.members*state.params.enemyPower;melee.set(enemy.attackId,old);
      }
      state.enemies.push(enemy);
    }
  }
  // 汇总后扣设施 HP，同拍多群攻击不会因遍历顺序穿过刚被打破的墙。
  for(const [id,attack] of melee){
    const body=state.wallHealth.get(id);
    if(!body||body.hp<=0)continue;
    const hit=Math.min(body.hp,attack.value);body.hp-=hit;
    state.events.push({type:'wallHit',id,value:hit});
    if(body.hp===0){
      state.walls.delete(id);
      state.events.push({type:'wallLost',id,value:0});
    }
  }
  if(state.hp<=0)state.phase='lost';
  else if(state.spawned===state.attacks.reduce((sum,s)=>sum+s.count,0)&&!state.enemies.length){state.phase='won';settleEconomy(state);}
}

// 地块内容与几何分开；修缮与换建共用整块身份，夜末按控制资格结算。
// 任一格映射到同一街区；状态仅按左上角存一次，收益不按格重复。
export const productionSite=(id,state)=>id==null?undefined:(state?.sites??PRODUCTION_SITES).find(p=>{const [x,y]=xy(id);return x>=p.x&&x<p.x+(p.width??p.size)&&y>=p.y&&y<p.y+(p.height??p.size);});
export const productionId=(id,state)=>{const p=productionSite(id,state);return p?key(p.x,p.y):null;};
export function productionCells(id,state) {
  const p=productionSite(id,state);return p?Array.from({length:(p.width??p.size)*(p.height??p.size)},(_,i)=>key(p.x+i%(p.width??p.size),p.y+Math.floor(i/(p.width??p.size)))):[];
}
export const plotContent=(state,id)=>state.plotContents?.get(productionId(id,state))??{status:'empty',type:null};
// 街区保留一个用途；cells 是仍存在的废墟/经营部分，缺口不会自动补回。
export const contentCells=(state,id)=>{
  const c=plotContent(state,id);return c.status==='empty'?[]:[...(c.cells??productionCells(id,state))];
};
// footprint 保留真实建筑占地；cells 仅记录经营面积，屋顶炮位不挖出通路。
export const buildingCells=(state,id)=>{
  const c=plotContent(state,id);return c.status==='empty'?[]:[...(c.footprint??c.cells??productionCells(id,state))];
};
export const availableCells=(state,id)=>productionCells(id,state).filter(cell=>!state.towers?.has(cell)&&!state.playerWalls?.has(cell)&&!state.outposts?.has(cell));
const economyCells=(state,id)=>plotContent(state,id).status==='building'?contentCells(state,id):availableCells(state,id);
function areaQuote(state,id,area){
  const original=productionCells(id,state).length;
  if(!original)return {area:0,cost:0,income:0};
  const {baseArea,smallCostFloor,densityGrowthArea,maxDensity}=PRODUCTION_CURVE;
  const density=original<=baseArea?1:1+(maxDensity-1)*(1-2**(-(original-baseArea)/densityGrowthArea));
  const unitCost=original<=baseArea?state.params.productionCostPerCell*(smallCostFloor+(1-smallCostFloor)*original/baseArea):Math.round(original*density)*state.params.productionCostPerCell/original;
  return {area,cost:Math.round(area*unitCost),income:Math.ceil(area*state.params.productionIncomePerCell*density)};
}
export const productionQuote=(state,id)=>areaQuote(state,id,economyCells(state,id).length);
export const productionLabor=(state,id)=>Math.ceil(economyCells(state,id).length/state.params.productionCellsPerWorker);
export function housingQuote(state,id){
  const area=economyCells(state,id).length;
  return {cost:area*state.params.housingCostPerCell,residents:Math.ceil(area/state.params.housingCellsPerResident)};
}
// 补建只收新增面积费用；累计实付金额用于拆返，避免切割/补建凭空产生金币。
export function economyBuildQuote(state,id,type){
  const plot=productionId(id,state),map=type==='housing'?state.housing:state.production;
  const before=map.has(plot)?contentCells(state,id).length:0,after=availableCells(state,id).length,added=after-before;
  const cost=type==='housing'?added*state.params.housingCostPerCell:areaQuote(state,id,after).cost-areaQuote(state,id,before).cost;
  return {added,cost,labor:type==='production'?Math.ceil(after/state.params.productionCellsPerWorker)-Math.ceil(before/state.params.productionCellsPerWorker):0,residents:type==='housing'?Math.ceil(after/state.params.housingCellsPerResident)-Math.ceil(before/state.params.housingCellsPerResident):0,income:areaQuote(state,id,after).income};
}
// 每格保留投入日期，次日补建不会把旧建筑的投资变成当天全返。
function addEconomyInvestment(state,id,type,quote){
  const plot=productionId(id,state),map=type==='housing'?state.housing:state.production,old=map.get(plot);
  const paid=new Map(old?.paid??[]),existing=new Set(old?contentCells(state,id):[]);
  const added=availableCells(state,id).filter(cell=>!existing.has(cell));
  const base=Math.floor(quote.cost/added.length),remainder=quote.cost%added.length;
  added.forEach((cell,i)=>paid.set(cell,{cost:base+(i<remainder?1:0),day:state.day}));
  map.set(plot,{day:old?.day??state.day,cost:(old?.cost??0)+quote.cost,paid});
}
function investmentRefund(state,entries){
  let today=0,older=0;
  for(const entry of entries)if(entry.day===state.day)today+=entry.cost;else older+=entry.cost;
  return today+Math.floor(older*state.params.demolitionRefundPercent/100);
}
// 嵌入报价没有副作用：人口减少、释放工人、清场占用与退款一并预览。
export function embeddingQuote(state,id){
  const c=plotContent(state,id),cells=contentCells(state,id),occupied=cells.includes(id),plot=productionId(id,state);
  const labor=buildingCells(state,id).includes(id)?Math.ceil(Math.ceil(1/state.params.clearingCellsPerWorker)*(state.phase==='battle'?state.params.nightClearingLaborMultiplier:1)):0;
  const building=occupied&&c.status==='building',home=building&&c.type==='housing',factory=building&&c.type==='production';
  const residents=home?Math.ceil(cells.length/state.params.housingCellsPerResident)-Math.ceil((cells.length-1)/state.params.housingCellsPerResident):0;
  const released=factory?Math.ceil(cells.length/state.params.productionCellsPerWorker)-Math.ceil((cells.length-1)/state.params.productionCellsPerWorker):0;
  const record=home?state.housing.get(plot):factory?state.production.get(plot):null;
  const invested=record?.cost??(home?housingQuote(state,id).cost:factory?productionQuote(state,id).cost:0);
  const investment=record?.paid?.get(id),cost=building?(investment?.cost??Math.floor(invested/cells.length)):0,refund=investmentRefund(state,[{cost,day:investment?.day??record?.day??0}]);
  const incomeLoss=factory?areaQuote(state,id,cells.length).income-areaQuote(state,id,cells.length-1).income:0;
  return {labor,residents,released,cost,refund,incomeLoss,freeAfter:population(state).free-residents+released-labor};
}
// 边缘按原始街区边界判定，内部缺口不会制造新边缘；邻接建筑接缝不算入口。
// 炮位资格由原始街区与街道决定，临时墙、清场缺口不改变边缘资格。
export function streetEdgeAccess(state,id){
  const plot=productionId(id,state);if(plot===null)return false;
  const [x,y]=xy(id);
  return [[x-1,y],[x+1,y],[x,y-1],[x,y+1]].some(([nx,ny])=>{
    if(!inside(nx,ny))return false;
    const next=key(nx,ny),neighbor=productionSite(next,state);
    return productionId(next,state)!==plot&&!state.fixedWalls.has(next)&&(!neighbor||neighbor.kind==='open');
  });
}
export function towerCapacity(state,id){
  const plot=productionId(id,state),area=productionCells(id,state).length;
  return {used:[...state.towers.keys()].filter(cell=>productionId(cell,state)===plot).length,max:area?Math.max(1,Math.floor(area/3)):0};
}
export function towerSiteError(state,id){
  const p=productionSite(id,state),c=plotContent(state,id);
  if(!p||!['production','housing'].includes(c.type)||!buildingCells(state,id).includes(id))return '炮塔只能架在废墟、生产或住房的建筑实体上。';
  const error=plotBuildError(state,id);if(error)return error;
  if(!streetEdgeAccess(state,id))return '炮塔须位于原始街区的临路边缘。';
  const capacity=towerCapacity(state,id);
  return capacity.used>=capacity.max?`炮位容量已满 · ${capacity.used}/${capacity.max}`:'';
}
function embeddingError(state,id){
  const p=productionSite(id,state);if(!p)return '';
  const error=plotBuildError(state,id);if(error)return error;
  const q=embeddingQuote(state,id);
  if(q.labor&&!streetEdgeAccess(state,id))return '炮塔须位于原始街区的临路边缘；内部缺口不算边缘。';
  return q.freeAfter<0?`人力不足：清场占用 ${q.labor} 人，住房减少 ${q.residents} 人，生产释放 ${q.released} 人；还缺 ${-q.freeAfter} 人。`:'';
}
function applyEmbedding(state,id,preserveBuilding=false){
  const c=plotContent(state,id),cells=contentCells(state,id),footprint=new Set(buildingCells(state,id));if(!footprint.has(id))return;
  const q=embeddingQuote(state,id),plot=productionId(id,state),map=c.type==='housing'?state.housing:state.production,record=map.get(plot);
  if(c.status==='building'&&record){record.cost=(record.cost??(c.type==='housing'?housingQuote(state,id).cost:productionQuote(state,id).cost))-q.cost;record.paid?.delete(id);retainDemolitionCost(state,q);}
  state.clearingWorkers+=q.labor;
  const remaining=new Set(cells.filter(cell=>cell!==id));
  if(!preserveBuilding)footprint.delete(id);
  state.plotContents.set(plot,{...c,cells:remaining,footprint});
  if(!remaining.size){map.delete(plot);state.plotContents.set(plot,{...c,status:'ruin',cells:remaining,footprint});}
  if(!footprint.size)state.plotContents.set(plot,{status:'empty',type:null,cells:remaining});
}
export function population(state){
  const total=state.params.initialPopulation+(state.debugPopulation??0)+[...state.housing.keys()].reduce((n,id)=>n+housingQuote(state,id).residents,0);
  const working=[...state.production.keys()].reduce((n,id)=>n+productionLabor(state,id),0);
  return {total,working,free:total-working-(state.clearingWorkers??0)};
}
export function housingError(state,id){
  if(state.phase!=='build'||state.day<2)return '第 2 天起可在白天建设住房。';
  const error=plotBuildError(state,id);if(error)return error;
  if(plotContent(state,id).type&&plotContent(state,id).type!=='housing')return '该街区已有其他设施或生产废墟；请先清空原用途。';
  if(economyBuildQuote(state,id,'housing').added<=0)return '该街区已有完整住房，或没有可用空位。';
  if(plotContent(state,id).status==='ruin'&&plotContent(state,id).type!=='housing')return '生产废墟只能恢复生产；如需换建住房，请先拆成空地。';
  if(!productionControlled(state,id))return plotContent(state,id).status==='empty'?'空地须逐格完整受控，才能新建住房。':'基础控制范围须碰到建筑至少一格，才能恢复住房。';
  return funds(state)<economyBuildQuote(state,id,'housing').cost?'资金不足，无法建设住房。':'';
}
export function buildHousing(state,id){
  const error=housingError(state,id);if(error)return error;
  const plot=productionId(id,state),q=economyBuildQuote(state,id,'housing');addEconomyInvestment(state,id,'housing',q);
  state.plotContents.set(plot,{status:'building',type:'housing',cells:new Set(availableCells(state,id)),footprint:new Set([...buildingCells(state,id),...availableCells(state,id)])});rebuildTerrain(state);return '';
}
export function buildingRemovalError(state,id) {
  const cells=new Set(buildingCells(state,id));
  return [...state.towers.keys()].some(cell=>cells.has(cell))?'建筑上有炮塔，请先拆除炮塔。':'';
}
export function housingRemovalError(state,id){
  if(state.phase!=='build')return '防守中不能拆除住房。';
  if(!state.housing.has(productionId(id,state)))return '这里没有住房。';
  const support=buildingRemovalError(state,id);if(support)return support;
  return population(state).free<housingQuote(state,id).residents?'现有生产依赖这些居民，请先拆除生产设施或补建住房。':'';
}
export function removeHousing(state,id){
  const error=housingRemovalError(state,id);if(error)return error;
  id=productionId(id,state);retainDemolitionCost(state,demolitionQuote(state,contentCells(state,id)[0]));
  state.housing.delete(id);state.plotContents.set(id,{status:'empty',type:null});rebuildTerrain(state);return '';
}
export function productionControlled(state,id) {
  const cells=buildingCells(state,id);
  return cells.length?cells.some(cell=>inGroundControl(state,cell)):productionCells(id,state).length>0&&productionCells(id,state).every(cell=>inGroundControl(state,cell));
}
export const productionActive=(state,id)=>productionControlled(state,id);
export const expectedIncome=state=>[...state.production.keys()].filter(id=>productionActive(state,id)).reduce((sum,id)=>sum+productionQuote(state,id).income,0);
export function productionError(state,id) {
  if(state.phase!=='build')return '只能在建设阶段恢复生产。';
  if(state.day<2)return '第 2 天开放经营与地块拆除。';
  const error=plotBuildError(state,id);if(error)return error;
  if(plotContent(state,id).status==='ruin'&&plotContent(state,id).type==='housing')return '住房废墟只能恢复住房；如需换建生产，请先拆成空地。';
  if(['outpost','housing'].includes(plotContent(state,id).type))return '该地块已有其他设施，请先拆除。';
  if(economyBuildQuote(state,id,'production').added<=0)return '该地点已经恢复生产，或没有可用空位。';
  if(!productionControlled(state,id))return plotContent(state,id).status==='empty'?'空地须逐格完整受控，才能新建生产。':'基础控制范围须碰到建筑至少一格，才能恢复生产。';
  const required=economyBuildQuote(state,id,'production').labor,available=population(state).free;
  if(available<required)return `劳动力不足：需要 ${required} 人，空闲 ${available} 人；请先建设住房。`;
  return funds(state)<economyBuildQuote(state,id,'production').cost?'资金不足，无法恢复生产。':'';
}
export function buildProduction(state,id) {
  const error=productionError(state,id);if(error)return error;
  const plot=productionId(id,state),q=economyBuildQuote(state,id,'production');addEconomyInvestment(state,id,'production',q);
  state.plotContents.set(plot,{status:'building',type:'production',cells:new Set(availableCells(state,id)),footprint:new Set([...buildingCells(state,id),...availableCells(state,id)])});rebuildTerrain(state);return '';
}
export function removeProduction(state,id) {
  if(state.phase!=='build')return '防守中不能撤销生产设施。';
  id=productionId(id,state);const p=state.production.get(id);
  if(!p)return '这里没有已恢复的生产设施。';
  const support=buildingRemovalError(state,id);if(support)return support;
  retainDemolitionCost(state,demolitionQuote(state,contentCells(state,id)[0]));
  state.production.delete(id);state.plotContents.set(id,{status:'empty',type:null});rebuildTerrain(state);return '';
}
// 清理当天立即完成，但人员当天已参与作业；次日释放，不消耗人口。
export const clearingLabor=(state,id)=>Math.ceil(buildingCells(state,id).length/state.params.clearingCellsPerWorker);
export function clearingError(state,id){
  if(state.phase!=='build'||state.day<2)return '第 2 天起可在白天清理废墟。';
  const error=plotBuildError(state,id);if(error)return error;
  if(!inControl(state,id))return '请在已有控制范围内清理废墟。';
  if(plotContent(state,id).status!=='ruin')return '这里不是废墟。';
  const support=buildingRemovalError(state,id);if(support)return support;
  const needed=clearingLabor(state,id),free=population(state).free;
  return free<needed?`清理需要 ${needed} 人，当前空闲 ${free} 人；次日释放。`:'';
}
// 清理废墟免费且即时完成；拆除建筑按现有当天退款/旧投资保留处理。
export function clearPlot(state,id) {
  if(state.phase!=='build')return '防守中不能拆除地块。';
  if(state.day<2)return '第 2 天开放经营与地块拆除。';
  if(!inControl(state,id))return '请在已有控制范围内拆除地块。';
  const error=plotBuildError(state,id);if(error)return error;
  const content=plotContent(state,id);
  if(content.status==='empty')return '这里已经是空地。';
  if(content.type==='housing'&&content.status==='building')return removeHousing(state,id);
  if(content.type==='outpost')return removeOutpost(state,id);
  if(state.production.has(productionId(id,state)))return removeProduction(state,id);
  const laborError=clearingError(state,id);if(laborError)return laborError;
  state.clearingWorkers+=clearingLabor(state,id);
  state.plotContents.set(productionId(id,state),{status:'empty',type:null});rebuildTerrain(state);return '';
}
// 只在守住当晚时入账一次；失败不结算，重试由完整战前快照回滚。
export function settleEconomy(state) {
  if(state.phase!=='won'||state.economySettled)return;
  // 固定当晚经营结果，次日恢复控制或拆建不会改写昨夜账单。
  const productive=[...state.production.keys()].filter(id=>productionActive(state,id));
  const stopped=[...state.production.keys()].filter(id=>!productionActive(state,id));
  state.productionReport={productive:productive.length,stopped:stopped.length,missed:stopped.reduce((sum,id)=>sum+productionQuote(state,id).income,0)};
  state.nightEconomy=expectedIncome(state);state.economyEarned+=state.nightEconomy;state.economySettled=true;
}

// 预告与实战读取同一份路径；建筑绕行及时显示，破墙不重算题目。
export function battleRoutes(state) {
  const routes=state.attacks.flatMap(attack=>{
    const born=state.tick<attack.first?0:Math.min(attack.count,Math.floor((state.tick-attack.first)/attack.interval)+1);
    return born>=attack.count?[]:[{future:true,index:attack.index,target:attack.target,path:attack.path}];
  });
  for(const enemy of state.enemies){
    const path=enemy.path||pathFrom(enemy.id,state.field);
    routes.push({future:false,index:enemy.sources[0]??0,target:enemy.target,path:path.slice(Math.max(0,path.indexOf(enemy.id)))});
  }
  return routes;
}

// 当天投入全返，旧投入按配置比例返还；维修与清场人力不因拆除撤销。
export function demolitionQuote(state,id) {
  const production=state.production.get(productionId(id,state)),tower=state.towers.get(id),post=state.outposts.get(outpostAt(state,id));
  let cost=0,day=1,type='';
  if(tower){type='tower';cost=state.params.weapons[tower].cost;day=state.towerDays.get(id)??1;}
  else if(post){type='outpost';cost=state.params.outpostCost;day=post.day??1;}
  else if(state.playerWalls.has(id)){type='wall';cost=state.params.wallCost;day=state.wallDays.get(id)??1;}
  else if(contentCells(state,id).includes(id)&&production){type='production';cost=production.cost??productionQuote(state,id).cost;day=production.day??1;}
  else if(contentCells(state,id).includes(id)&&state.housing.has(productionId(id,state))){type='housing';cost=state.housing.get(productionId(id,state)).cost??housingQuote(state,id).cost;day=state.housing.get(productionId(id,state)).day;}
  else if(buildingCells(state,id).includes(id)&&plotContent(state,id).status==='ruin'){type='ruin';day=0;}
  const record=type==='production'?production:type==='housing'?state.housing.get(productionId(id,state)):null;
  const refund=investmentRefund(state,record?.paid?[...record.paid.values()]:[{cost,day}]);
  return {type,cost,day,refund};
}
function retainDemolitionCost(state,quote){state.demolitionSpent+=quote.cost-quote.refund;}
export function buildTower(state,id,type) {
  const error=placementError(state,id,type);if(error)return error;
  state.nightBuildSpent=(state.nightBuildSpent??0)+towerBuildCost(state,type)-state.params.weapons[type].cost;
  applyEmbedding(state,id,true);
  state.towers.set(id,type);state.towerDays.set(id,state.day);rebuildTerrain(state);return '';
}
export function removeTower(state,id) {
  if(state.phase!=='build')return '防守中不能拆除炮台。';
  if(!state.towers.has(id))return '这里没有炮台。';
  retainDemolitionCost(state,demolitionQuote(state,id));state.towers.delete(id);state.towerDays.delete(id);return '';
}


// 迷雾只隐藏未探索信息；探索过的格子不会因拆瞭望塔重新变黑。
export function initialView(state){
  const [cx,cy]=xy(state.camp);
  return {x:Math.max(0,Math.min(SIZE-30,cx-15)),y:state.layout?SIZE-30:Math.max(0,Math.min(SIZE-30,cy-27)),width:30,height:30};
}
// 视野与建设权限独立：外围距离乘倍率后向上取整，塔的射程和敌源揭示不受倍率影响。
export function visionField(state,phase=state.phase){
  const seen=new Set(),p=state.params,multiplier=(phase==='build'?p.daySightMultiplier:p.nightSightMultiplier)*p.eventSightMultiplier;
  const station=(center,radius,extra)=>{
    const [cx,cy]=xy(center),extent=Math.ceil(extra*multiplier),inner=Math.max(0,radius-2),outer=Math.ceil(radius+extent);
    for(let y=Math.max(0,cy-outer);y<=Math.min(SIZE-1,cy+outer);y++)for(let x=Math.max(0,cx-outer);x<=Math.min(SIZE-1,cx+outer);x++){
      const id=key(x,y),dx=Math.max(0,Math.abs(x-cx)-inner),dy=Math.max(0,Math.abs(y-cy)-inner);
      if(inStationRange(id,center,radius)||(extent>0&&Math.hypot(dx,dy)<=extent+2))seen.add(id);
    }
  };
  if(state.hp>0)station(state.camp,p.controlRadius,p.campSight);
  for(const id of state.outposts.keys())station(id,p.outpostRadius,p.outpostSight);
  for(const [id,type] of state.towers)
    for(const cell of coverage(id,p.weapons[type].range,p.weapons[type].shape))seen.add(cell);
  const size=p.sourceRevealSize,offset=Math.floor((size-1)/2);
  for(const source of knownSources(state))for(let dy=0;dy<size;dy++)for(let dx=0;dx<size;dx++){
    const x=source.x-offset+dx,y=source.y-offset+dy;if(inside(x,y))seen.add(key(x,y));
  }
  for(const id of controlMask(state))seen.add(id);
  // 医院中心固定揭示 5×5，仅提供地标信息，不代表已经控制或占领。
  for(const p of state.sites.filter(p=>p.role==='hospital')){
    const cx=p.x+Math.floor((p.width??p.size)/2),cy=p.y+Math.floor((p.height??p.size)/2);
    for(let y=cy-2;y<=cy+2;y++)for(let x=cx-2;x<=cx+2;x++)if(inside(x,y))seen.add(key(x,y));
  }
  return seen;
}
function initializeExploration(state){
  state.explored=new Set();
  // 旧的无布局规则测试保留已知地形；生成城市不再预先揭示矩形区域。
  if(!state.layout)for(let id=0;id<SIZE*SIZE;id++)state.explored.add(id);
}
export const isExplored=(state,id)=>!state.explored||state.explored.has(id);
export function revealControl(state){
  if(!state.explored)return;
  for(const id of visionField(state))state.explored.add(id);
}

// 测试台仅跳转到指定白天，不模拟略过的夜晚、不发奖励；独立偏移不污染收入账单。
export function applyTestScenario(state,day,gold,people){
  if(!Number.isInteger(day)||day<1||day>(state.waves?.length??1))return '请选择现有波次范围内的日期。';
  if(![gold,people].every(n=>Number.isInteger(n)&&n>=0&&n<=1000000))return '金币与人口须为 0–1000000 整数。';
  const workers=population(state).working;if(people<workers)return `现有生产需要 ${workers} 人，不能设为更低人口。`;
  const sources=structuredClone(state.waves[day-1]),candidate={...state,sources};
  const error=validateSources(sources,candidate);if(error)return error;
  state.debugGold+=gold-funds(state);state.debugPopulation+=people-population(state).total;
  state.day=day;state.phase='build';state.clearingWorkers=0;state.hp=Math.max(1,state.hp);
  state.sources=sources;state.lastNight=null;clearNight(state);lockAttacks(state);revealControl(state);return '';
}
