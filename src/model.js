import { SIZE, DEFAULTS, WAVES, PRODUCTION_SITES, PRODUCTION_CURVE } from './config.js?v=40';
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
  const fixedWalls = layout?new Set():makeWalls(), blocked=new Set(layout?layout.tiles.flatMap((t,id)=>t==='block'?[id]:[]):[]), walls = new Set([...fixedWalls, ...blocked, ...playerWalls]);
  const terrainWalls=new Set([...fixedWalls,...blocked]);
  const camp = layout?key(layout.camp.x,layout.camp.y):key(...DEFAULTS.camp), field = routeField(camp, terrainWalls);
  const state = { outposts: new Map([...outposts].map(([id,p])=>[id,{...p}])), production:new Map(), housing:new Map(), clearingWorkers:0, economyEarned:0, nightEconomy:0, economySettled:false, productionReport:null, wallDays:new Map([...playerWalls].map(id=>[id,1])), towerDays:new Map([...towers.keys()].map(id=>[id,1])), demolitionSpent:0, repairSpent:0, earned:0, nightEarned:0, day:1,
    layout, blocked, terrainWalls, sites:layout?(layout.blocks??layout.buildings):PRODUCTION_SITES, fixedWalls, playerWalls: new Set(playerWalls), walls, camp, field, sources: structuredClone(sources).map(s=>({...s,target:s.target??-2})),
    wallHealth:new Map([...playerWalls].map(id=>[id,{hp:params.wallHP,max:params.wallHP}])), towerHealth:new Map([...towers].map(([id,type])=>[id,{hp:params.weapons[type].hp,max:params.weapons[type].hp}])), attacks:[],
    params: structuredClone(params), towers: new Map(towers), phase: 'build', tick: 0,
    hp: params.campHP, enemies: [], enemyOutcomes:new Map(), events: [], spawned: 0, removed: 0, damage: 0, leaked: 0, merges: 0 };
  state.plotContents=new Map(state.sites.map(p=>[key(p.x,p.y),{status:p.kind==='open'?'empty':'ruin',type:p.kind==='open'?null:(p.ruinType??'production')}]));
  for(const [id,p] of state.outposts){p.plotId??=productionId(id,state);state.plotContents.set(p.plotId,{status:'building',type:'outpost'});}
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
  state.sources=state.waves[0];state.lastNight=null;lockAttacks(state);
  return state;
}
export const reservedSources=state=>state.waves?.slice(state.day-1).flat()??state.sources;
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
    if(state.towerHealth.get(tower)?.hp===0)continue;
    const weapon = state.params.weapons[type];
    for (const id of coverage(tower, weapon.range, weapon.shape)) fire.set(id, (fire.get(id) || 0) + weapon.power);
  }
  return fire;
}
export const funds = state => state.params.budget + state.earned + state.economyEarned - [...state.production.keys()].reduce((sum,id)=>sum+productionQuote(state,id).cost,0) - [...state.housing.keys()].reduce((sum,id)=>sum+housingQuote(state,id).cost,0) - state.outposts.size*state.params.outpostCost - state.repairSpent - state.demolitionSpent - state.playerWalls.size * state.params.wallCost - [...state.towers.values()].reduce((sum,type)=>sum+state.params.weapons[type].cost,0);
// 控制范围取火光与前哨覆盖的并集；地块内前哨不受击、不失守。
export function inStationRange(id, center, radius) {
  const [x,y]=xy(id),[cx,cy]=xy(center),dx=Math.abs(x-cx),dy=Math.abs(y-cy),cut=Math.min(2,radius);
  return Number.isInteger(id)&&id>=0&&id<SIZE*SIZE&&Math.max(dx,dy)<=radius&&dx+dy<=2*radius-cut;
}
export function inControl(state,id,radius=state.params.controlRadius) {
  return (state.hp>0&&inStationRange(id,state.camp,radius)) || [...state.outposts.keys()].some(center=>inStationRange(id,center,state.params.outpostRadius));
}
export const incomeEligible=inControl;
// 地块内容决定物理通行；道路和固定地块身份不会因清理而消失。
export function rebuildTerrain(state) {
  state.blocked=new Set();
  for(const p of state.sites)if(plotContent(state,key(p.x,p.y)).status!=='empty')
    for(const id of productionCells(key(p.x,p.y),state))state.blocked.add(id);
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
// 来源、目标与初始路线在白天开始锁定；前哨不进入目标池。
export function lockAttacks(state) {
  state.attacks=state.sources.map((source,index)=>{const path=pathFrom(key(source.x,source.y),state.field);return {...structuredClone(source),index,target:state.camp,originalPath:[...path],path};});
}
export const enemyKey=(enemy)=>`${enemy.id}:${enemy.target}`;
// 火光、墙与塔按实际缺失 HP 报价；一次修满，前哨无需维修。
export function repairQuote(state,id) {
  const camp=id===state.camp,tower=state.towers.get(id),wall=state.wallHealth.get(id);
  const target=camp?{hp:state.hp,max:state.params.campHP}:state.towerHealth.get(id)||wall;
  const missing=target?Math.max(0,target.max-target.hp):0;
  const defense=!!tower||!!wall,type=camp?'camp':tower?'tower':wall?'wall':'';
  const cost=defense?Math.ceil((tower?state.params.weapons[tower].cost:state.params.wallCost)*missing/(target?.max||1)*state.params.defenseRepairPercent/100):missing*state.params.campRepairCost;
  return {missing,cost,type};
}
export function repairError(state,id) {
  if(state.phase!=='build')return '防守中不能修复。';
  if(state.day<2)return '次日才能修复受损设施。';
  const quote=repairQuote(state,id);
  if(!quote.missing)return '请选择受损火光、墙或损坏炮塔。';
  if(['wall','tower'].includes(quote.type)&&!inControl(state,id))return '这里不在控制范围内，无法维修防线。';
  return funds(state)<quote.cost?`资金不足，修满需要 ${quote.cost} 钱（${quote.missing} HP）。`:'';
}
export function repairFacility(state,id) {
  const error=repairError(state,id);if(error)return error;
  state.repairSpent+=repairQuote(state,id).cost;
  if(id===state.camp)state.hp=state.params.campHP;
  else {
    const target=state.towerHealth.get(id)||state.wallHealth.get(id);target.hp=target.max;
    if(state.wallHealth.has(id))state.walls.add(id);
  }
  return '';
}
// 前哨占一整块空地；点击的受控格是控制锚点，不要求整块已受控。
export function outpostAt(state,id) {
  const plot=productionId(id,state);return [...state.outposts.keys()].find(anchor=>state.outposts.get(anchor).plotId===plot);
}
export function plotBuildError(state,id) {
  const cells=productionCells(id,state);
  if(!cells.length)return '请选择地块，建筑不能建在道路上。';
  if(productionSite(id,state)?.role==='hospital')return '医院为收复目标，占领机制待实现，不能拆除或换建。';
  if(!isExplored(state,id))return '该地块尚未探索。';
  if(cells.includes(state.camp))return '火光所在地块保留，不能拆除或换建。';
  if(cells.some(cell=>reservedSources(state).some(s=>key(s.x,s.y)===cell)))return '不能覆盖敌人来源。';
  if(cells.some(cell=>state.playerWalls.has(cell)||state.towers.has(cell)))return '请先拆除地块上的墙或炮塔，再建设整块建筑。';
  return '';
}
export function outpostError(state,id) {
  if(state.day<3)return '第 3 天开放前哨与探索扩张。';
  if(state.phase!=='build')return '防守中不能建设前哨。';
  if(!inControl(state,id))return '前哨驻扎位置必须在已有控制范围内。';
  const error=plotBuildError(state,id);if(error)return error;
  if(plotContent(state,id).status!=='empty')return '前哨需要整块空地，请先拆除废墟或旧建筑。';
  const cells=new Set(productionCells(id,state));
  if(![...cells].some(cell=>{const [x,y]=xy(cell);return [[x-1,y],[x+1,y],[x,y-1],[x,y+1]].some(([nx,ny])=>inside(nx,ny)&&!cells.has(key(nx,ny))&&state.field.distance.has(key(nx,ny)));}))return '地块须临接可达道路或空地。';
  return funds(state)<state.params.outpostCost?'资金不足，无法建造前哨。':'';
}
export function buildOutpost(state,id) {
  const error=outpostError(state,id);if(error)return error;
  const plotId=productionId(id,state);state.outposts.set(id,{day:state.day,plotId});
  state.plotContents.set(plotId,{status:'building',type:'outpost'});rebuildTerrain(state);return '';
}
export function removeOutpost(state,id) {
  if(state.phase!=='build')return '只能在建设阶段拆除前哨。';
  const anchor=outpostAt(state,id);if(anchor===undefined)return '这里没有前哨。';
  const posts=new Map(state.outposts),post=posts.get(anchor);posts.delete(anchor);const candidate={...state,outposts:posts};
  if([...state.playerWalls,...state.towers.keys(),...posts.keys(),...[...state.production.keys(),...state.housing.keys()].flatMap(id=>productionCells(id,state))].some(cell=>inControl(state,cell)&&!inControl(candidate,cell)))return '其他设施依赖此前哨的控制范围，请先拆除外围设施。';
  retainDemolitionCost(state,demolitionQuote(state,id));state.outposts=posts;
  state.plotContents.set(post.plotId,{status:'empty',type:null});rebuildTerrain(state);return '';
}
export function enterMorning(state) {
  if(state.phase!=='won'||state.day>=(state.waves?.length??2))return false;
  state.lastNight={day:state.day,earned:state.nightEarned,economy:state.nightEconomy,...state.productionReport,leaked:state.leaked};
  state.day++;state.phase='build';state.clearingWorkers=0;
  if(state.waves)state.sources=state.waves[state.day-1];
  clearNight(state);
  lockAttacks(state);
  // 进入白天保留建筑内容、防线损伤和资金，再生成下一晚进攻。
  return true;
}
export function placementError(state, id, type = 'A') {
  if (!['build','battle'].includes(state.phase)) return '本晚已结束，请进入次日或重试。';
  if (!Number.isInteger(id) || id < 0 || id >= SIZE * SIZE) return '请选择地图内的格子。';
  if(!isExplored(state,id))return '该位置尚未探索。';
  if (!inControl(state,id)) return '超出控制范围，不能架设炮台。';
  if(state.walls.has(id)||state.playerWalls.has(id)||id===state.camp||reservedSources(state).some(s=>key(s.x,s.y)===id))return '炮塔独立建于未占用道路或开放场地，不能与墙、建筑或目标重叠。';
  if(state.phase==='battle'&&state.enemies.some(e=>e.id===id))return '不能在敌人占据的格子上补炮。';
  if (state.towers.has(id)) return state.phase==='battle'?'该格已有武器，防守中不能拆除。':'该格已有武器，可用拆除工具撤销。';
  if (!state.params.weapons[type]) return '未知武器。';
  if (funds(state) < state.params.weapons[type].cost) return '预算不足，无法架设炮台。';
  return '';
}

// 墙只改变局部物理障碍；允许封路，宏观进攻计划始终不变。
export function wallPreview(state, id, remove = false) {
  let error = '';
  if (state.phase !== 'build') error = '战斗期间不能修改墙。';
  else if (!Number.isInteger(id) || id < 0 || id >= SIZE * SIZE) error = '请选择地图内的格子。';
  else if (remove && !state.playerWalls.has(id)) error = '固定墙不能拆除。';
  else if (!remove && !isExplored(state,id)) error = '该位置尚未探索。';
  else if (!remove && !inControl(state,id)) error = '超出控制范围，不能建墙。';
  else if (!remove && state.blocked.has(id)) error = '建筑或废墟占地，需先清理为空地。';

  else if (!remove && state.towers.has(id)) error = '这里已有独立炮塔，不能叠建墙。';
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
  if (!integer(params.budget,0,10000) || !integer(params.wallCost,1,1000) || !integer(params.controlRadius,1,30) || !integer(params.campHP,1,10000)) return '资金 0–10000、墙价 1–1000、控制半径 1–30、篝火耐久 1–10000，均为整数。';
  if(!integer(params.wallHP,1,10000)||!integer(params.enemyPower,1,99)||!integer(params.defenseRepairPercent,1,100))return '墙耐久 1–10000、敌人每拍攻击 1–99、防线维修比例 1–100%，均为整数。';
  if(!integer(params.clearingCellsPerWorker,1,100))return '清理每名工人承担格数须为 1–100 整数。';
  if(!integer(params.initialPopulation,0,10000)||!integer(params.productionCellsPerWorker,1,100)||!integer(params.housingCellsPerResident,1,100)||!integer(params.housingCostPerCell,1,1000))return '初始人口 0–10000；每名工人/居民对应格数 1–100；住房每格费用 1–1000，均为整数。';
  if(checkLayout&&population({...state,params}).free<0)return '新参数会导致劳动力不足，请先调整生产或增加住房。';
  if(!integer(params.demolitionRefundPercent,0,100))return '拆除返还比例须为 0–100 整数。';
  if(!integer(params.outpostCost,1,1000)||!integer(params.outpostRadius,1,30)||!integer(params.campRepairCost,1,1000))return '前哨价格 1–1000、半径 1–30；火光每 HP 修复单价 1–1000。';
  for (const type of ['A','B']) {
    const w=params.weapons[type];
    if (!w || !['square','diamond'].includes(w.shape) || !integer(w.range,1,8) || !integer(w.power,1,99) || !integer(w.cost,1,1000)||!integer(w.hp,1,10000)) return `武器 ${type}：范围 1–8、火力 1–99、价格 1–1000、耐久 1–10000，均为整数。`;
  }
  if (!integer(params.productionCostPerCell,1,1000)||!(Number.isFinite(params.productionIncomePerCell)&&params.productionIncomePerCell>=0&&params.productionIncomePerCell<=1000)) return '每格生产恢复费用须为 1–1000、每格每晚收入须为 0–1000，可使用小数。';
  if (!integer(params.killReward,0,1000)) return '每个敌人击杀奖励须为 0–1000 整数。';
  if (checkLayout && [...state.playerWalls,...state.towers.keys(),...state.outposts.keys(),...[...state.production.keys(),...state.housing.keys()].flatMap(id=>productionCells(id,state))].some(id=>!inControl({...state,params},id,params.controlRadius))) return '现有设施超出新的控制范围，请先拆除外围设施或增大半径。';
  if (checkLayout && funds({...state,params}) < 0) return '按新价格计算，现有布局超出预算（含经营与前哨）。请提高资金，或取消预览后拆除设施。';
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
    if (state.walls.has(id) || id === state.camp || state.towers.has(id)) return prefix + '与障碍、控制站、生产地点或武器冲突。';
    if(![-2,-1].includes(s.target??-2))return prefix+'当前只攻击火光，前哨不可受击。';
    if (seen.has(id)) return prefix + '位置不能重复。';
    if (!state.field.distance.has(id)) return prefix + '无法到达篝火。';
    if (s.hp < 1 || s.hp > 999 || s.count < 1 || s.count > 30 || s.first < 1 || s.first > 200 || s.interval < 1 || s.interval > 100) return prefix + '生命 1–999，批数 1–30，首拍 1–200，间隔 1–100。';
    seen.add(id);
  }
  return '';
}

// 局部接敌只处理下一格挡路的墙或炮塔，不比较 DPS，也不改变战略目标。
export function enemyAction(state,enemy) {
  let path=enemy.path||pathFrom(enemy.id,state.field);
  if(path.some(id=>state.terrainWalls.has(id))){path=repairPath(state,path.slice(Math.max(0,path.indexOf(enemy.id))));enemy.path=path;}
  const at=path.indexOf(enemy.id);
  const next=path[at+1]??enemy.id;
  if(state.wallHealth.get(next)?.hp>0)return {to:enemy.id,attackId:next,attackType:'wall'};
  if(state.towerHealth.get(next)?.hp>0)return {to:enemy.id,attackId:next,attackType:'tower'};
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
    const body=(attack.type==='wall'?state.wallHealth:state.towerHealth).get(id);
    if(!body||body.hp<=0)continue;
    const hit=Math.min(body.hp,attack.value);body.hp-=hit;
    state.events.push({type:attack.type==='wall'?'wallHit':'towerHit',id,value:hit});
    if(body.hp===0){
      if(attack.type==='wall')state.walls.delete(id);
      state.events.push({type:attack.type==='wall'?'wallLost':'towerLost',id,value:0});
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
export const plotContent=(state,id)=>state.plotContents.get(productionId(id,state))??{status:'empty',type:null};
export function productionQuote(state,id) {
  const p=productionSite(id,state),area=p?(p.width??p.size)*(p.height??p.size):0;
  if(!area)return {area:0,cost:0,income:0};
  const {baseArea,smallCostFloor,densityGrowthArea,maxDensity}=PRODUCTION_CURVE;
  const density=area<=baseArea?1:1+(maxDensity-1)*(1-2**(-(area-baseArea)/densityGrowthArea));
  // 每格可用小数，整块含产出密度的最终收入统一向上取整。
  const income=Math.ceil(area*state.params.productionIncomePerCell*density);
  const cost=area<=baseArea?Math.round(area*state.params.productionCostPerCell*(smallCostFloor+(1-smallCostFloor)*area/baseArea)):
    Math.round(Math.round(area*density)*state.params.productionCostPerCell);
  return {area,cost,income};
}
// 人口独立于火光耐久；工人占用而不消耗，住房完工当天立即入住。
export const productionLabor=(state,id)=>Math.ceil(productionCells(id,state).length/state.params.productionCellsPerWorker);
export function housingQuote(state,id){
  const area=productionCells(id,state).length;
  return {cost:area*state.params.housingCostPerCell,residents:Math.ceil(area/state.params.housingCellsPerResident)};
}
export function population(state){
  const total=state.params.initialPopulation+[...state.housing.keys()].reduce((n,id)=>n+housingQuote(state,id).residents,0);
  const working=[...state.production.keys()].reduce((n,id)=>n+productionLabor(state,id),0);
  return {total,working,free:total-working-(state.clearingWorkers??0)};
}
export function housingError(state,id){
  if(state.phase!=='build'||state.day<2)return '第 2 天起可在白天建设住房。';
  const error=plotBuildError(state,id);if(error)return error;
  if(plotContent(state,id).status==='building')return '该街区已有设施，请先拆除。';
  if(plotContent(state,id).status==='ruin'&&plotContent(state,id).type!=='housing')return '生产废墟只能恢复生产；如需换建住房，请先拆成空地。';
  if(!productionControlled(state,id))return '住房整块都需要在控制范围内。';
  return funds(state)<housingQuote(state,id).cost?'资金不足，无法建设住房。':'';
}
export function buildHousing(state,id){
  const error=housingError(state,id);if(error)return error;
  const plot=productionId(id,state);state.housing.set(plot,{day:state.day});
  state.plotContents.set(plot,{status:'building',type:'housing'});rebuildTerrain(state);return '';
}
export function housingRemovalError(state,id){
  if(state.phase!=='build')return '防守中不能拆除住房。';
  if(!state.housing.has(productionId(id,state)))return '这里没有住房。';
  return population(state).free<housingQuote(state,id).residents?'现有生产依赖这些居民，请先拆除生产设施或补建住房。':'';
}
export function removeHousing(state,id){
  const error=housingRemovalError(state,id);if(error)return error;
  id=productionId(id,state);retainDemolitionCost(state,demolitionQuote(state,id));
  state.housing.delete(id);state.plotContents.set(id,{status:'empty',type:null});rebuildTerrain(state);return '';
}
export const productionControlled=(state,id)=>productionCells(id,state).length>0&&productionCells(id,state).every(cell=>inControl(state,cell));
export const productionActive=(state,id)=>productionControlled(state,id);
export const expectedIncome=state=>[...state.production.keys()].filter(id=>productionActive(state,id)).reduce((sum,id)=>sum+productionQuote(state,id).income,0);
export function productionError(state,id) {
  if(state.phase!=='build')return '只能在建设阶段恢复生产。';
  if(state.day<2)return '第 2 天开放经营与地块拆除。';
  const error=plotBuildError(state,id);if(error)return error;
  if(plotContent(state,id).status==='ruin'&&plotContent(state,id).type==='housing')return '住房废墟只能恢复住房；如需换建生产，请先拆成空地。';
  if(['outpost','housing'].includes(plotContent(state,id).type))return '该地块已有其他设施，请先拆除。';
  if(state.production.has(productionId(id,state)))return '该地点已经恢复生产。';
  const missing=productionCells(id,state).filter(cell=>!inControl(state,cell)).length;
  if(missing)return `街区还缺 ${missing} 格控制；需完整覆盖才能恢复。`;
  const required=productionLabor(state,id),available=population(state).free;
  if(available<required)return `劳动力不足：需要 ${required} 人，空闲 ${available} 人；请先建设住房。`;
  return funds(state)<productionQuote(state,id).cost?'资金不足，无法恢复生产。':'';
}
export function buildProduction(state,id) {
  const error=productionError(state,id);if(error)return error;
  const plot=productionId(id,state);state.production.set(plot,{day:state.day});
  state.plotContents.set(plot,{status:'building',type:'production'});rebuildTerrain(state);return '';
}
export function removeProduction(state,id) {
  if(state.phase!=='build')return '防守中不能撤销生产设施。';
  id=productionId(id,state);const p=state.production.get(id);
  if(!p)return '这里没有已恢复的生产设施。';
  retainDemolitionCost(state,demolitionQuote(state,id));
  state.production.delete(id);state.plotContents.set(id,{status:'empty',type:null});rebuildTerrain(state);return '';
}
// 清理当天立即完成，但人员当天已参与作业；次日释放，不消耗人口。
export const clearingLabor=(state,id)=>Math.ceil(productionCells(id,state).length/state.params.clearingCellsPerWorker);
export function clearingError(state,id){
  if(state.phase!=='build'||state.day<2)return '第 2 天起可在白天清理废墟。';
  const error=plotBuildError(state,id);if(error)return error;
  if(!inControl(state,id))return '请在已有控制范围内清理废墟。';
  if(plotContent(state,id).status!=='ruin')return '这里不是废墟。';
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

// 拆除统一按配置比例返还，零头向下取整；未返还部分保留为沉没支出。
export function demolitionQuote(state,id) {
  const production=state.production.get(productionId(id,state)),tower=state.towers.get(id),post=state.outposts.get(outpostAt(state,id));
  let cost=0,day=1,type='';
  if(production){type='production';cost=productionQuote(state,id).cost;day=production.day??1;}
  else if(state.housing.has(productionId(id,state))){type='housing';cost=housingQuote(state,id).cost;day=state.housing.get(productionId(id,state)).day;}
  else if(tower){type='tower';cost=state.params.weapons[tower].cost;day=state.towerDays.get(id)??1;}
  else if(post){type='outpost';cost=state.params.outpostCost;day=post.day??1;}
  else if(state.playerWalls.has(id)){type='wall';cost=state.params.wallCost;day=state.wallDays.get(id)??1;}
  else if(plotContent(state,id).status==='ruin'){type='ruin';day=0;}
  return {type,cost,day,refund:Math.floor(cost*state.params.demolitionRefundPercent/100)};
}
function retainDemolitionCost(state,quote){state.demolitionSpent+=quote.cost-quote.refund;}
export function buildTower(state,id,type) {
  const error=placementError(state,id,type);if(error)return error;
  state.towers.set(id,type);state.towerDays.set(id,state.day);state.towerHealth.set(id,{hp:state.params.weapons[type].hp,max:state.params.weapons[type].hp});return '';
}
export function removeTower(state,id) {
  if(state.phase!=='build')return '防守中不能拆除炮台。';
  if(!state.towers.has(id))return '这里没有炮台。';
  retainDemolitionCost(state,demolitionQuote(state,id));state.towers.delete(id);state.towerDays.delete(id);state.towerHealth.delete(id);return '';
}


// 迷雾只隐藏未探索信息；探索过的格子不会因拆前哨重新变黑。
export function initialView(state){
  const [cx,cy]=xy(state.camp);
  return {x:Math.max(0,Math.min(SIZE-30,cx-15)),y:Math.max(0,Math.min(SIZE-30,cy-27)),width:30,height:30};
}
function initializeExploration(state){
  const view=initialView(state);state.explored=new Set();
  if(!state.layout){for(let id=0;id<SIZE*SIZE;id++)state.explored.add(id);return;}
  for(let y=view.y;y<view.y+30;y++)for(let x=view.x;x<view.x+30;x++)state.explored.add(key(x,y));
}
export const isExplored=(state,id)=>!state.explored||state.explored.has(id);
export function revealControl(state){
  if(!state.explored)return;
  for(let id=0;id<SIZE*SIZE;id++)if(inControl(state,id))state.explored.add(id);
}
