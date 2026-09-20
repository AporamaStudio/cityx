import { SIZE, DEFAULTS } from './config.js';
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
export function createState(sources = DEFAULTS.sources, towers = new Map(), playerWalls = new Set(), params = DEFAULTS) {
  const fixedWalls = makeWalls(), walls = new Set([...fixedWalls, ...playerWalls]);
  const camp = key(...DEFAULTS.camp), field = routeField(camp, walls);
  return { fixedWalls, playerWalls: new Set(playerWalls), walls, camp, field, sources: structuredClone(sources),
    params: structuredClone(params), towers: new Map(towers), phase: 'build', tick: 0,
    hp: params.campHP, enemies: [], events: [], spawned: 0, removed: 0, damage: 0, leaked: 0, merges: 0 };
}

export function fireField(state) {
  const fire = new Map();
  for (const [tower, type] of state.towers) {
    const weapon = state.params.weapons[type];
    for (const id of coverage(tower, weapon.range, weapon.shape)) fire.set(id, (fire.get(id) || 0) + weapon.power);
  }
  return fire;
}
export const funds = state => state.params.budget - state.playerWalls.size * state.params.wallCost - [...state.towers.values()].reduce((sum,type)=>sum+state.params.weapons[type].cost,0);
// 控制权只限制建造权限；不限制通行、寻路或武器向外开火。
export function inControl(state, id, radius = state.params.controlRadius) {
  const [x,y] = xy(id), [cx,cy] = xy(state.camp);
  return Number.isInteger(id) && id >= 0 && id < SIZE * SIZE && (x-cx)**2 + (y-cy)**2 <= radius**2;
}
export function placementError(state, id, type = 'A') {
  if (state.phase !== 'build') return '战斗时不能修改布局，请先返回布防。';
  if (!Number.isInteger(id) || id < 0 || id >= SIZE * SIZE) return '请选择地图内的格子。';
  if (!inControl(state,id)) return '超出控制范围，不能架设炮台。';
  if (!state.walls.has(id)) return '炮台只能架设在墙上，请先建墙或选择固定墙。';
  if (state.towers.has(id)) return '该格已有武器，可用拆除工具撤销。';
  if (!state.params.weapons[type]) return '未知武器。';
  if (funds(state) < state.params.weapons[type].cost) return '预算不足，可拆除其他武器重新分配。';
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
  else if (!remove && state.walls.has(id)) error = '这里已经有墙。';
  else if (!remove && (id === state.camp || state.sources.some(s=>key(s.x,s.y)===id))) error = '不能覆盖篝火或敌人源头。';
  else if (!remove && funds(state) < state.params.wallCost) error = '资金不足，墙与炮台共用资金。';
  if (error) return { error, field: state.field };
  const walls = new Set(state.walls);
  if (remove) walls.delete(id); else walls.add(id);
  const field = routeField(state.camp, walls);
  if (state.sources.some(s=>!field.distance.has(key(s.x,s.y)))) error = '不能封死路线：每个源头都必须能到达篝火。';
  return { error, field, walls };
}
export function changeWall(state, id, remove = false) {
  const preview = wallPreview(state,id,remove);
  if (preview.error) return preview.error;
  state.walls = preview.walls; state.field = preview.field;
  if (remove) state.playerWalls.delete(id); else state.playerWalls.add(id);
  return '';
}

// 参数先验证、再一次性应用；不静默删除超预算设施或落在新控制范围外的布局。
export function validateParams(params, state, checkLayout = true) {
  const integer = (value,min,max)=>Number.isInteger(value)&&value>=min&&value<=max;
  if (!integer(params.budget,0,10000) || !integer(params.wallCost,1,1000) || !integer(params.controlRadius,1,30) || !integer(params.campHP,1,10000)) return '资金 0–10000、墙价 1–1000、控制半径 1–30、篝火耐久 1–10000，均为整数。';
  for (const type of ['A','B']) {
    const w=params.weapons[type];
    if (!w || !['square','diamond'].includes(w.shape) || !integer(w.range,1,8) || !integer(w.power,1,99) || !integer(w.cost,1,1000)) return `武器 ${type}：范围 1–8、火力 1–99、价格 1–1000，均为整数。`;
  }
  if (checkLayout && [...state.playerWalls,...state.towers.keys()].some(id=>!inControl(state,id,params.controlRadius))) return '现有设施超出新的控制范围，请先拆除外围设施或增大半径。';
  if (checkLayout && funds({...state,params}) < 0) return '按新价格计算，现有布局超出预算（墙与炮台合计）。请提高资金，或取消预览后拆除设施。';
  return '';
}
// 配置失败时保留原地图和布局，避免静默丢失试玩结果。
export function validateSources(sources, state) {
  if (!sources.length || sources.length > 12) return '源头数量应为 1–12。';
  const seen = new Set();
  for (let i = 0; i < sources.length; i++) {
    const s = sources[i], id = key(s.x, s.y), prefix = `源头 ${i + 1}：`;
    if (!Object.values(s).every(Number.isInteger)) return prefix + '请填写整数。';
    if (!inside(s.x, s.y)) return prefix + '坐标应为 0–29。';
    if (state.walls.has(id) || id === state.camp || state.towers.has(id)) return prefix + '与障碍、篝火或武器冲突。';
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
  for (const enemy of state.enemies) enemy.id = state.field.next.get(enemy.id) ?? enemy.id;
  for (const [index, source] of state.sources.entries()) {
    const age = state.tick - source.first;
    if (age >= 0 && age % source.interval === 0 && age / source.interval < source.count) {
      state.enemies.push({ id: key(source.x, source.y), hp: source.hp, max: source.hp, members: 1, sources: [index] });
      state.spawned++;
    }
  }
  const groups = new Map(), merged = new Set();
  for (const enemy of state.enemies) {
    if (!groups.has(enemy.id)) groups.set(enemy.id, { ...enemy, sources: [...enemy.sources] });
    else {
      const group = groups.get(enemy.id);
      group.hp += enemy.hp; group.max += enemy.max; group.members += enemy.members;
      group.sources = [...new Set([...group.sources, ...enemy.sources])];
      state.merges++;
      merged.add(enemy.id);
    }
  }
  for (const id of merged) { const group = groups.get(id); state.events.push({ type: 'merge', id, value: group.hp, members: group.members }); }
  const fire = fireField(state); state.enemies = [];
  for (const enemy of groups.values()) {
    const damage = Math.min(enemy.hp, fire.get(enemy.id) || 0);
    enemy.hp -= damage; state.damage += damage;
    if (damage) state.events.push({ type: 'hit', id: enemy.id, value: damage });
    if (enemy.hp <= 0) {
      state.removed += enemy.members; state.events.push({ type: 'kill', id: enemy.id, value: enemy.members });
    } else if (enemy.id === state.camp) {
      state.hp = Math.max(0, state.hp - enemy.hp); state.leaked += enemy.hp;
      state.events.push({ type: 'leak', id: enemy.id, value: enemy.hp });
    } else state.enemies.push(enemy);
  }
  if (state.hp <= 0) state.phase = 'lost';
  else if (state.spawned === state.sources.reduce((sum, s) => sum + s.count, 0) && !state.enemies.length) state.phase = 'won';
}
