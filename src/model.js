import { SIZE, DEFAULTS, WAVES, PRODUCTION_SITES } from './config.js?v=13';
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
export function createState(sources = DEFAULTS.sources, towers = new Map(), playerWalls = new Set(), params = DEFAULTS, outposts = new Map()) {
  const fixedWalls = makeWalls(), walls = new Set([...fixedWalls, ...playerWalls]);
  const camp = key(...DEFAULTS.camp), field = routeField(camp, walls);
  const state = { outposts: new Map([...outposts].map(([id,p])=>[id,{...p,hp:params.outpostHP,max:params.outpostHP}])), production:new Map(), economyEarned:0, nightEconomy:0, economySettled:false, repairSpent:0, earned:0, nightEarned:0, day:1, lostControl:new Set(),
    fixedWalls, playerWalls: new Set(playerWalls), walls, camp, field, sources: structuredClone(sources).map(s=>({...s,target:s.target??-2})),
    params: structuredClone(params), towers: new Map(towers), phase: 'build', tick: 0,
    hp: params.campHP, enemies: [], events: [], spawned: 0, removed: 0, damage: 0, leaked: 0, merges: 0 };
  rebuildFields(state);return state;
}

// 只保留一局三晚和一次战前快照；无存档、回放或通用关卡框架。
export function createCampaign(params=DEFAULTS, waves=WAVES) {
  const state=createState(waves[0],new Map(),new Set(),params);
  state.waves=structuredClone(waves).map(sources=>sources.map(s=>({...s,target:s.target??-2})));
  state.sources=state.waves[0];state.lastNight=null;
  return state;
}
export const reservedSources=state=>state.waves?.slice(state.day-1).flat()??state.sources;
export const campaignComplete=state=>state.phase==='won'&&state.day===(state.waves?.length??1);
function clearNight(state) {
  state.tick=0;state.enemies=[];state.events=[];state.spawned=0;state.removed=0;
  state.damage=0;state.leaked=0;state.merges=0;state.nightEarned=0;state.nightEconomy=0;state.economySettled=false;
}
export function beginBattle(state) {
  if(state.phase!=='build'||state.hp<=0||validateSources(state.sources,state))return null;
  clearNight(state);state.lostControl.clear();
  const snapshot=structuredClone(state);
  for(const p of state.production.values())p.locked=true;
  state.phase='battle';return snapshot;
}
export const restoreNight=snapshot=>structuredClone(snapshot);
export function restartCampaign(state) {
  // 整局重来保留已应用的实验参数和波次，已拆掉的前哨目标恢复自动。
  return createCampaign(state.params,(state.waves??WAVES).map(w=>w.map(s=>({...s,target:(s.target??-2)>=0?-2:s.target}))));
}

export function fireField(state) {
  const fire = new Map();
  for (const [tower, type] of state.towers) {
    const weapon = state.params.weapons[type];
    for (const id of coverage(tower, weapon.range, weapon.shape)) fire.set(id, (fire.get(id) || 0) + weapon.power);
  }
  return fire;
}
export const funds = state => state.params.budget + state.earned + state.economyEarned - [...state.production.keys()].reduce((sum,id)=>sum+productionQuote(state,id).cost,0) - state.outposts.size*state.params.outpostCost - state.repairSpent - state.playerWalls.size * state.params.wallCost - [...state.towers.values()].reduce((sum,type)=>sum+state.params.weapons[type].cost,0);
// 控制范围为所有存活控制站的并集；重叠覆盖不会随单站失守而失去。
export function inStationRange(id, center, radius) {
  const [x,y]=xy(id),[cx,cy]=xy(center),dx=Math.abs(x-cx),dy=Math.abs(y-cy),cut=Math.min(2,radius);
  return Number.isInteger(id)&&id>=0&&id<SIZE*SIZE&&Math.max(dx,dy)<=radius&&dx+dy<=2*radius-cut;
}
export function inControl(state,id,radius=state.params.controlRadius) {
  return (state.hp>0&&inStationRange(id,state.camp,radius)) || [...state.outposts].some(([center,p])=>p.hp>0&&inStationRange(id,center,state.params.outpostRadius));
}
export const incomeEligible=(state,id)=>inControl(state,id)&&!state.lostControl.has(id);
// 每个目标共用一张方向表；同一格可因目标不同而有不同下一格。
export function rebuildFields(state) {
  state.field=routeField(state.camp,state.walls);
  state.fields=new Map([...state.outposts.keys()].map(id=>[id,routeField(id,state.walls)]));
}
export const liveTarget=(state,target)=>state.outposts.get(target)?.hp>0?target:state.camp;
export const fieldFor=(state,target)=>target===state.camp?state.field:state.fields.get(target)||state.field;
export function sourceTarget(state,source) {
  if(source.target===-1)return state.camp;
  if((source.target??-2)!==-2)return liveTarget(state,source.target);
  // 自动模式只在出生时选择最近目标；行进中目标固定，失守才改打火光。
  const start=key(source.x,source.y),targets=[state.camp,...[...state.outposts].filter(([,p])=>p.hp>0).map(([id])=>id).sort((a,b)=>a-b)];
  return targets.reduce((best,id)=>(fieldFor(state,id).distance.get(start)??Infinity)<(fieldFor(state,best).distance.get(start)??Infinity)?id:best,state.camp);
}
export const enemyKey=(enemy)=>`${enemy.id}:${enemy.target}`;
// 按实际缺失 HP 报价；一次修满，前哨废墟允许在失控区原址恢复。
export function repairQuote(state,id) {
  const camp=id===state.camp, target=camp?{hp:state.hp,max:state.params.campHP}:state.outposts.get(id);
  const missing=target?Math.max(0,target.max-target.hp):0;
  return {missing,cost:missing*(camp?state.params.campRepairCost:state.params.repairCost)};
}
export function outpostError(state,id,repair=false) {
  if(state.phase!=='build')return '防守中不能建设或修复。';
  const old=state.outposts.get(id);
  if(repair){
    if(state.day<2)return '次日才能修复火光或前哨。';
    const quote=repairQuote(state,id);
    if(!quote.missing)return '请选择受损火光、前哨或废墟。';
    return funds(state)<quote.cost?`资金不足，修复需要 ${quote.cost} 钱（${quote.missing} HP）。`:'';
  }
  if(!inControl(state,id))return '前哨必须建在已有控制范围内。';
  if(productionSite(id)||state.walls.has(id)||old||id===state.camp||reservedSources(state).some(s=>key(s.x,s.y)===id))return '前哨需要未占用的空地。';
  if(!state.field.distance.has(id))return '前哨须与火光连通，不能建在封闭区域。';
  return funds(state)<state.params.outpostCost?'资金不足，无法建造前哨。':'';
}
export function buildOutpost(state,id,repair=false) {
  const error=outpostError(state,id,repair);if(error)return error;
  if(repair){
    state.repairSpent+=repairQuote(state,id).cost;
    if(id===state.camp)state.hp=state.params.campHP;
    else state.outposts.get(id).hp=state.outposts.get(id).max;
  } else state.outposts.set(id,{hp:state.params.outpostHP,max:state.params.outpostHP});
  rebuildFields(state);return '';
}
export function removeOutpost(state,id) {
  if(state.phase!=='build'||state.day!==1)return '只能在第一天建设时撤销前哨。';
  if(!state.outposts.has(id))return '这里没有前哨。';
  const posts=new Map(state.outposts);posts.delete(id);const candidate={...state,outposts:posts};
  if([...state.playerWalls,...state.towers.keys(),...posts.keys(),...[...state.production.keys()].flatMap(productionCells)].some(cell=>!inControl(candidate,cell)))return '其他设施依赖此前哨的控制范围，请先拆除外围设施。';
  if(reservedSources(state).some(s=>s.target===id))return '敌源指定了此前哨，请先修改目标配置。';
  state.outposts=posts;rebuildFields(state);return '';
}
export function enterMorning(state) {
  if(state.phase!=='won'||state.day>=(state.waves?.length??2))return false;
  state.lastNight={day:state.day,earned:state.nightEarned,economy:state.nightEconomy,leaked:state.leaked,lost:state.lostControl.size};
  state.day++;state.phase='build';
  if(state.waves)state.sources=state.waves[state.day-1];
  clearNight(state);
  // 上晚失控标记保留供白天检查；下次开战清除，不影响永久的受损 HP 和资金。
  return true;
}
export function placementError(state, id, type = 'A') {
  if (!['build','battle'].includes(state.phase)) return '本晚已结束，请进入次日或重试。';
  if (!Number.isInteger(id) || id < 0 || id >= SIZE * SIZE) return '请选择地图内的格子。';
  if (!inControl(state,id)) return '超出控制范围，不能架设炮台。';
  if (!state.walls.has(id)) return '炮台只能架设在墙上，请先建墙或选择固定墙。';
  if (state.towers.has(id)) return state.phase==='battle'?'该格已有武器，防守中不能拆除。':'该格已有武器，可用拆除工具撤销。';
  if (!state.params.weapons[type]) return '未知武器。';
  if (funds(state) < state.params.weapons[type].cost) return '预算不足，无法架设炮台。';
  return '';
}

// 建墙和拆墙都先计算候选路线；校验成功后才允许替换实际地图。
export function wallPreview(state, id, remove = false) {
  let error = '';
  if (state.phase !== 'build') error = '战斗期间不能修改墙。';
  else if (!Number.isInteger(id) || id < 0 || id >= SIZE * SIZE) error = '请选择地图内的格子。';
  else if (remove && state.towers.has(id)) error = '请先拆除墙上的炮台。';
  else if (remove && !state.playerWalls.has(id)) error = '固定墙不能拆除。';
  else if (!remove && !inControl(state,id)) error = '超出控制范围，不能建墙。';
  else if (!remove && productionSite(id)) error = '生产地点保留用于恢复经营，不能建墙。';
  else if (!remove && state.outposts.has(id)) error = '不能覆盖前哨或废墟。';
  else if (!remove && state.walls.has(id)) error = '这里已经有墙。';
  else if (!remove && (id === state.camp || reservedSources(state).some(s=>key(s.x,s.y)===id))) error = '不能覆盖篝火或敌人源头。';
  else if (!remove && funds(state) < state.params.wallCost) error = '资金不足，墙与炮台共用资金。';
  if (error) return { error, field: state.field };
  const walls = new Set(state.walls);
  if (remove) walls.delete(id); else walls.add(id);
  const field = routeField(state.camp, walls);
  if ([...reservedSources(state).map(s=>key(s.x,s.y)),...state.outposts.keys()].some(id=>!field.distance.has(id))) error = '不能封死路线：源头、前哨都必须与火光连通。';
  return { error, field, walls, fields:new Map([...state.outposts.keys()].map(id=>[id,routeField(id,walls)])) };
}
export function changeWall(state, id, remove = false) {
  const preview = wallPreview(state,id,remove);
  if (preview.error) return preview.error;
  state.walls = preview.walls; state.field = preview.field;state.fields=preview.fields;
  if (remove) state.playerWalls.delete(id); else state.playerWalls.add(id);
  return '';
}

// 参数先验证、再一次性应用；不静默删除超预算设施或落在新控制范围外的布局。
export function validateParams(params, state, checkLayout = true) {
  const integer = (value,min,max)=>Number.isInteger(value)&&value>=min&&value<=max;
  if (!integer(params.budget,0,10000) || !integer(params.wallCost,1,1000) || !integer(params.controlRadius,1,30) || !integer(params.campHP,1,10000)) return '资金 0–10000、墙价 1–1000、控制半径 1–30、篝火耐久 1–10000，均为整数。';
  if(!integer(params.outpostCost,1,1000)||!integer(params.outpostHP,1,10000)||!integer(params.outpostRadius,1,30)||!integer(params.repairCost,1,1000)||!integer(params.campRepairCost,1,1000))return '前哨价格 1–1000、耐久 1–10000、半径 1–30；前哨及火光每 HP 修复单价 1–1000。';
  for (const type of ['A','B']) {
    const w=params.weapons[type];
    if (!w || !['square','diamond'].includes(w.shape) || !integer(w.range,1,8) || !integer(w.power,1,99) || !integer(w.cost,1,1000)) return `武器 ${type}：范围 1–8、火力 1–99、价格 1–1000，均为整数。`;
  }
  if (!integer(params.largeProductionCost,1,1000)||!integer(params.largeProductionIncome,1,1000)) return '大街区费用和收入须为 1–1000 整数。';
  if (!integer(params.productionCost,1,1000)||!integer(params.productionIncome,1,1000)) return '生产恢复费用和每晚收入须为 1–1000 整数。';
  if (checkLayout && [...state.playerWalls,...state.towers.keys(),...[...state.production.keys()].flatMap(productionCells)].some(id=>!inControl({...state,params},id,params.controlRadius))) return '现有设施超出新的控制范围，请先拆除外围设施或增大半径。';
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
    if (!inside(s.x, s.y)) return prefix + '坐标应为 0–29。';
    if (productionSite(id) || state.walls.has(id) || id === state.camp || state.towers.has(id) || state.outposts.has(id)) return prefix + '与障碍、控制站、生产地点或武器冲突。';
    if(![-2,-1].includes(s.target??-2)&&!state.outposts.has(s.target))return prefix+'指定前哨不存在。';
    if (seen.has(id)) return prefix + '位置不能重复。';
    if (!state.field.distance.has(id)) return prefix + '无法到达篝火。';
    if (s.hp < 1 || s.hp > 999 || s.count < 1 || s.count > 30 || s.first < 1 || s.first > 200 || s.interval < 1 || s.interval > 100) return prefix + '生命 1–999，批数 1–30，首拍 1–200，间隔 1–100。';
    seen.add(id);
  }
  return '';
}

// 单步只处理一次入格；先移动所有敌人，再统一合并，避免遍历顺序影响结果。
export function stepBattle(state) {
  if (state.phase !== 'battle') return;
  state.tick++; state.events = [];
  for (const enemy of state.enemies){enemy.target=liveTarget(state,enemy.target);enemy.id=fieldFor(state,enemy.target).next.get(enemy.id)??enemy.id;}
  for (const [index, source] of state.sources.entries()) {
    const age = state.tick - source.first;
    if (age >= 0 && age % source.interval === 0 && age / source.interval < source.count) {
      state.enemies.push({ id: key(source.x, source.y), target:sourceTarget(state,source), hp: source.hp, max: source.hp, members: 1, sources: [index] });
      state.spawned++;
    }
  }
  const groups = new Map(), merged = new Set();
  for (const enemy of state.enemies) {
    const groupId=enemyKey(enemy);
    if (!groups.has(groupId)) groups.set(groupId, { ...enemy, sources: [...enemy.sources] });
    else {
      const group = groups.get(groupId);
      group.hp += enemy.hp; group.max += enemy.max; group.members += enemy.members;
      group.sources = [...new Set([...group.sources, ...enemy.sources])];
      state.merges++;
      merged.add(groupId);
    }
  }
  for (const groupId of merged) { const group = groups.get(groupId); state.events.push({ type: 'merge', id:group.id,target:group.target, value: group.hp, members: group.members }); }
  const fire = fireField(state); state.enemies = [];
  for (const enemy of groups.values()) {
    const damage = Math.min(enemy.hp, fire.get(enemy.id) || 0);
    enemy.hp -= damage; state.damage += damage;
    if (damage) state.events.push({ type: 'hit', id: enemy.id,target:enemy.target, value: damage });
    if (enemy.hp <= 0) {
      // 每个原始块奖励 1 钱；合并群完全消灭才一次结算，碰撞目标不算击杀。
      state.earned += enemy.members;state.nightEarned += enemy.members;
      state.removed += enemy.members; state.events.push({ type: 'kill', id: enemy.id,target:enemy.target, value: enemy.members });
    } else if (enemy.target===state.camp&&enemy.id === state.camp) {
      state.hp = Math.max(0, state.hp - enemy.hp); state.leaked += enemy.hp;
      state.events.push({ type: 'leak', id: enemy.id, value: enemy.hp });
    } else if(enemy.id===enemy.target){
      const post=state.outposts.get(enemy.target),before=new Set();
      if(post?.hp>0){
        for(let id=0;id<SIZE*SIZE;id++)if(inControl(state,id))before.add(id);
        const hit=Math.min(post.hp,enemy.hp);post.hp-=hit;enemy.hp-=hit;
        state.events.push({type:'postHit',id:enemy.id,value:hit});
        if(post.hp===0){
          for(const id of before)if(!inControl(state,id))state.lostControl.add(id);
          state.events.push({type:'postLost',id:enemy.id,value:0});
        }
      }
      if(enemy.hp>0){enemy.target=state.camp;state.enemies.push(enemy);}
    } else state.enemies.push(enemy);
  }
  if (state.hp <= 0) state.phase = 'lost';
  else if (state.spawned === state.sources.reduce((sum, s) => sum + s.count, 0) && !state.enemies.length) {state.phase = 'won';settleEconomy(state);}
}

// 经营与控制共用地图；白天预估下一晚，防守中按当晚失控记录扣除。
// 任一格映射到同一街区；状态仅按左上角存一次，收益不按格重复。
export const productionSite=id=>PRODUCTION_SITES.find(p=>{const [x,y]=xy(id);return x>=p.x&&x<p.x+p.size&&y>=p.y&&y<p.y+p.size;});
export const productionId=id=>{const p=productionSite(id);return p?key(p.x,p.y):null;};
export function productionCells(id) {
  const p=productionSite(id);return p?Array.from({length:p.size*p.size},(_,i)=>key(p.x+i%p.size,p.y+Math.floor(i/p.size))):[];
}
export function productionQuote(state,id) {
  const p=productionSite(id),large=p?.size===3;
  return {cost:large?state.params.largeProductionCost:state.params.productionCost,income:large?state.params.largeProductionIncome:state.params.productionIncome};
}
export const productionControlled=(state,id)=>productionCells(id).length>0&&productionCells(id).every(cell=>inControl(state,cell));
export const productionActive=(state,id)=>productionControlled(state,id)&&(state.phase==='build'||productionCells(id).every(cell=>incomeEligible(state,cell)));
export const expectedIncome=state=>[...state.production.keys()].filter(id=>productionActive(state,id)).reduce((sum,id)=>sum+productionQuote(state,id).income,0);
export function productionError(state,id) {
  if(state.phase!=='build')return '只能在建设阶段恢复生产。';
  if(!productionSite(id))return '请选择地图上标有 ◇ 的固定生产地点。';
  if(state.production.has(productionId(id)))return '该地点已经恢复生产。';
  const missing=productionCells(id).filter(cell=>!inControl(state,cell)).length;
  if(missing)return `街区还缺 ${missing} 格控制；需完整覆盖才能恢复。`;
  return funds(state)<productionQuote(state,id).cost?'资金不足，无法恢复生产。':'';
}
export function buildProduction(state,id) {
  const error=productionError(state,id);if(error)return error;
  state.production.set(productionId(id),{locked:false});return '';
}
export function removeProduction(state,id) {
  if(state.phase!=='build')return '防守中不能撤销生产设施。';
  id=productionId(id);const p=state.production.get(id);
  if(!p)return '这里没有已恢复的生产设施。';
  if(p.locked)return '已经经历防守的生产投资不能出售。';
  state.production.delete(id);return '';
}
// 只在守住当晚时入账一次；失败不结算，重试由完整战前快照回滚。
export function settleEconomy(state) {
  if(state.phase!=='won'||state.economySettled)return;
  state.nightEconomy=expectedIncome(state);state.economyEarned+=state.nightEconomy;state.economySettled=true;
}

// 同一套目标/方向供移动和路线展示使用；区分场上敌群与尚未出生的批次。
export function battleRoutes(state) {
  const routes=state.sources.flatMap((source,index)=>{
    const born=state.tick<source.first?0:Math.min(source.count,Math.floor((state.tick-source.first)/source.interval)+1);
    if(born>=source.count)return [];
    const target=sourceTarget(state,source);
    return [{future:true,index,target,path:pathFrom(key(source.x,source.y),fieldFor(state,target))}];
  });
  for(const enemy of state.enemies){
    const target=liveTarget(state,enemy.target);
    routes.push({future:false,index:enemy.sources[0]??0,target,path:pathFrom(enemy.id,fieldFor(state,target))});
  }
  return routes;
}
