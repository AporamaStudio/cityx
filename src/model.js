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

export function coverage(id, range = DEFAULTS.range) {
  const [x, y] = xy(id), cells = [];
  for (let dy = -range; dy <= range; dy++) for (let dx = -range; dx <= range; dx++) {
    if (Math.abs(dx) + Math.abs(dy) <= range && inside(x + dx, y + dy)) cells.push(key(x + dx, y + dy));
  }
  return cells;
}

export function createState(sources = structuredClone(DEFAULTS.sources), towers = new Set()) {
  const walls = makeWalls(), camp = key(...DEFAULTS.camp), field = routeField(camp, walls);
  return { walls, camp, field, sources, towers: new Set(towers), phase: 'build', tick: 0,
    hp: DEFAULTS.campHP, enemies: [], events: [], spawned: 0, removed: 0, damage: 0, leaked: 0, merges: 0 };
}

export function fireField(state) {
  const fire = new Map();
  for (const tower of state.towers) for (const id of coverage(tower)) fire.set(id, (fire.get(id) || 0) + DEFAULTS.power);
  return fire;
}
export const funds = state => DEFAULTS.budget - state.towers.size * DEFAULTS.cost;
export function placementError(state, id) {
  if (state.phase !== 'build') return '战斗时不能修改布局，请先返回布防。';
  if (id < 0 || id >= SIZE * SIZE) return '请选择地图内的格子。';
  if (state.walls.has(id)) return '建筑障碍上不能建造。';
  if (id === state.camp || state.sources.some(s => key(s.x, s.y) === id)) return '篝火和敌人源头上不能建造。';
  if (state.towers.has(id)) return '该格已有武器，可用拆除工具撤销。';
  if (funds(state) < DEFAULTS.cost) return '预算不足，可拆除其他武器重新分配。';
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
  const groups = new Map();
  for (const enemy of state.enemies) {
    if (!groups.has(enemy.id)) groups.set(enemy.id, { ...enemy, sources: [...enemy.sources] });
    else {
      const group = groups.get(enemy.id);
      group.hp += enemy.hp; group.max += enemy.max; group.members += enemy.members;
      group.sources = [...new Set([...group.sources, ...enemy.sources])];
      state.merges++;
      state.events.push({ type: 'merge', id: enemy.id, value: group.hp });
    }
  }
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
