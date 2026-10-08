import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULTS,SIZE} from '../src/config.js';
import {key,createCampaign,beginBattle,stepBattle,enterMorning,lockAttacks,forecastAttacks,battleRoutes,changeWall,buildTower,buildOutpost,buildProduction,removeOutpost,repairFacility,repairQuote,fireField,funds,restoreNight,restartCampaign,validateParams} from '../src/model.js';

// 路旁保留一栋炮位建筑，敌人的纵向道路不变。
const layout=()=>({width:SIZE,height:SIZE,camp:{x:15,y:25},tiles:Array(SIZE*SIZE).fill('road'),blocks:[{x:13,y:22,width:2,height:3,kind:'building'}]});
const make=(hp=40,count=1,first=1,interval=3)=>createCampaign({...DEFAULTS,budget:1000},Array.from({length:5},()=>[{x:15,y:20,hp,count,first,interval,target:-2}]),layout());
const step=(s,n)=>{for(let i=0;i<n;i++)stepBattle(s);};

test('造墙、造塔、前哨及经营均不改变已锁定来源、目标、路线',()=>{
  const map=layout();map.tiles[key(17,24)]='open';map.blocks=[...map.blocks,{x:17,y:24,width:1,height:1,kind:'open'},{x:19,y:24,width:2,height:2,kind:'building'}];map.buildings=[{x:19,y:24,width:2,height:2,kind:'building'}];
  for(const id of [key(19,24),key(20,24),key(19,25),key(20,25)])map.tiles[id]='block';
  const s=createCampaign({...DEFAULTS,budget:1000},undefined,map),original=structuredClone(s.attacks);s.day=3;
  assert.equal(changeWall(s,key(15,22)),'');assert.equal(buildTower(s,key(14,24),'B'),'');
  assert.equal(buildOutpost(s,key(17,24)),'');assert.equal(buildProduction(s,key(20,25)),'');
  assert.deepEqual(s.attacks,original);assert.deepEqual(forecastAttacks(s),original);
  const snap=beginBattle(s);assert.ok(snap);assert.deepEqual(s.attacks,original);
});

test('墙让敌人停在原路线前，停留每拍持续受伤，击杀后不再伤墙',()=>{
  const s=make(8),wall=key(15,22);changeWall(s,wall);buildTower(s,key(14,24),'B');beginBattle(s);
  step(s,2);assert.equal(s.enemies[0].id,key(15,21));const hp=s.enemies[0].hp;
  step(s,2);assert.equal(s.enemies[0].id,key(15,21));assert.equal(s.enemies[0].hp,hp-2);assert.equal(s.wallHealth.get(wall).hp,10);
  while(s.phase==='battle')stepBattle(s);
  assert.equal(s.phase,'won');assert.equal(s.hp,30);assert.equal(s.earned,2);assert.ok(s.wallHealth.get(wall).hp>0);
  const remaining=s.wallHealth.get(wall).hp;stepBattle(s);assert.equal(s.wallHealth.get(wall).hp,remaining);
});

test('有短绕路也直接攻击路线上的墙，攻破后下一拍进入原路径',()=>{
  const s=make(),wall=key(15,22),plan=structuredClone(s.attacks);changeWall(s,wall);beginBattle(s);step(s,3);
  assert.equal(s.enemies[0].id,key(15,21));assert.equal(s.wallHealth.get(wall).hp,11);
  step(s,11);assert.equal(s.wallHealth.get(wall).hp,0);assert.equal(s.enemies[0].id,key(15,21));assert.ok(!s.walls.has(wall));
  stepBattle(s);assert.equal(s.enemies[0].id,wall);assert.deepEqual(s.attacks,plan);assert.equal(s.playerWalls.has(wall),true);
});

test('敌人经过建筑炮位持续前进，不因邻接或高火力改目标',()=>{
  const s=make(100),near=key(14,22),far=key(13,24);assert.equal(buildTower(s,near,'A'),'');assert.equal(buildTower(s,far,'B'),'');s.params.weapons.B.power=9;
  const target=s.attacks[0].target;beginBattle(s);step(s,3);
  assert.equal(s.enemies[0].id,key(15,22));assert.equal(s.enemies[0].target,target);assert.ok(!s.events.some(e=>e.type==='towerHit'));
});

test('炮塔无维修报价，受损墙仍可次日按损伤维修',()=>{
  const s=make(100),tower=key(14,24),wall=key(15,22);assert.equal(buildTower(s,tower,'A'),'');changeWall(s,wall);
  s.wallHealth.get(wall).hp=0;const money=funds(s);s.phase='won';enterMorning(s);
  assert.equal(repairQuote(s,tower).missing,0);assert.match(repairFacility(s,tower),/受损火光或墙/);assert.ok(fireField(s).size>0);
  assert.equal(repairQuote(s,wall).cost,1);assert.equal(repairFacility(s,wall),'');assert.equal(s.wallHealth.get(wall).hp,12);assert.equal(funds(s),money-1);
  assert.equal(s.towerDays.get(tower),1);
});

test('同拍多群撞墙合流、叠加近战，不因遍历顺序提前穿墙',()=>{
  const s=make(40,2,1,1),wall=key(15,22);changeWall(s,wall);s.wallHealth.get(wall).hp=2;beginBattle(s);step(s,3);
  assert.equal(s.enemies.length,1);assert.equal(s.enemies[0].members,2);assert.equal(s.enemies[0].id,key(15,21));assert.equal(s.wallHealth.get(wall).hp,0);
  stepBattle(s);assert.equal(s.enemies[0].id,wall);
});

test('重试还原锁定路线、墙 HP 与夜间加急投资，快照不污染',()=>{
  const s=make(100),wall=key(15,22),tower=key(14,24);changeWall(s,wall);assert.equal(buildTower(s,tower,'A'),'');const money=funds(s),snapshot=beginBattle(s);
  step(s,14);assert.equal(s.wallHealth.get(wall).hp,0);assert.equal(buildTower(s,key(13,24),'B'),'');assert.equal(s.nightBuildSpent,20);s.earned=7;
  const retry=restoreNight(snapshot);assert.equal(retry.wallHealth.get(wall).hp,12);assert.equal(retry.towers.size,1);assert.equal(funds(retry),money);assert.equal(retry.nightBuildSpent,0);assert.deepEqual(retry.attacks,snapshot.attacks);
  retry.wallHealth.get(wall).hp=1;assert.equal(snapshot.wallHealth.get(wall).hp,12);
  const fresh=restartCampaign(s);assert.equal(fresh.towers.size,0);assert.equal(fresh.playerWalls.size,0);assert.deepEqual(fresh.layout,s.layout);
});

test('破墙投资不会自动退款；原址维修与拆返不刷新建造日期',()=>{
  const s=make(),wall=key(15,22);changeWall(s,wall);beginBattle(s);step(s,14);
  assert.equal(funds(s),998);s.phase='won';enterMorning(s);assert.equal(repairQuote(s,wall).cost,1);
  const locked=structuredClone(s.attacks);assert.equal(repairFacility(s,wall),'');assert.equal(s.wallHealth.get(wall).hp,12);assert.ok(s.walls.has(wall));assert.deepEqual(s.attacks,locked);
  assert.equal(changeWall(s,wall,true),'');assert.equal(funds(s),998);
});

test('前哨退池后非法战略目标被拒绝，墙塔参数仍校验',()=>{
  const s=make(),params=structuredClone(s.params);params.wallHP=NaN;assert.match(validateParams(params,s),/墙耐久/);
  params.wallHP=12;params.weapons.A.power=0;assert.match(validateParams(params,s),/武器 A/);
});
