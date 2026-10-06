import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULTS,SIZE} from '../src/config.js';
import {key,createCampaign,plotContent,productionQuote,productionCells,buildProduction,removeProduction,clearPlot,buildOutpost,outpostAt,removeOutpost,inControl,funds,buildTower,removeTower,changeWall,beginBattle,stepBattle,enterMorning,restoreNight,restartCampaign,validateParams,repairQuote} from '../src/model.js';

// 地块正好横跨原路线，验证建设后绕行而不禁建；街道仍可放可破坏防线。
function make(kind='open') {
  const plot={x:15,y:22,width:2,height:2,kind},tiles=Array(SIZE*SIZE).fill('road');
  for(let y=22;y<24;y++)for(let x=15;x<17;x++)tiles[key(x,y)]=kind==='open'?'open':'block';
  const layout={width:SIZE,height:SIZE,camp:{x:15,y:25},blocks:[plot],buildings:kind==='open'?[]:[plot],tiles};
  const wave=[{x:15,y:20,hp:6,count:1,first:1,interval:2}];
  const s=createCampaign({...DEFAULTS,budget:1000},Array(5).fill(wave),layout);s.day=3;return s;
}
const run=s=>{for(let i=0;i<200&&s.phase==='battle';i++)stepBattle(s);assert.notEqual(s.phase,'battle');};

test('路线上的空地可建前哨，敌人绕建筑仍抵达火光，前哨无损伤或退场奖励',()=>{
  const s=make(),original=structuredClone(s.attacks[0]),id=key(15,22);
  assert.ok(original.path.includes(id));assert.equal(buildOutpost(s,id),'');
  assert.ok(inControl(s,key(15,16)));assert.equal(s.attacks[0].target,s.camp);
  assert.equal(s.attacks[0].x,original.x);assert.equal(s.attacks[0].hp,original.hp);assert.equal(s.attacks[0].first,original.first);
  assert.deepEqual(s.attacks[0].path.slice(0,2),original.path.slice(0,2));
  assert.equal(s.attacks[0].path.at(-1),s.camp);assert.ok(s.attacks[0].path.every(cell=>!s.blocked.has(cell)));
  assert.equal(new Set(s.attacks[0].path).size,s.attacks[0].path.length);
  const post=structuredClone(s.outposts.get(id));assert.ok(!('hp' in post));assert.equal(repairQuote(s,id).missing,0);
  assert.ok(beginBattle(s));run(s);assert.equal(s.hp,24);assert.equal(s.earned,0);assert.deepEqual(s.outposts.get(id),post);
  assert.equal(enterMorning(s),true);assert.equal(s.attacks[0].target,s.camp);
});

test('建筑封住狭窄出口时允许退回道路，不因保留路线前缀而卡住',()=>{
  const map=structuredClone(make().layout);
  for(const x of [14,16]){map.blocks.push({x,y:20,width:1,height:2,kind:'building'});for(const y of [20,21])map.tiles[key(x,y)]='block';}
  const wave=[{x:15,y:19,hp:6,count:1,first:1,interval:2}],s=createCampaign({...DEFAULTS,budget:1000},[wave],map);s.day=3;
  assert.ok(s.attacks[0].path.includes(key(15,21)));assert.equal(buildOutpost(s,key(15,22)),'');
  assert.equal(s.attacks[0].path[0],key(15,19));assert.equal(s.attacks[0].path.at(-1),s.camp);
  assert.ok(s.attacks[0].path.every(id=>!s.blocked.has(id)));assert.equal(new Set(s.attacks[0].path).size,s.attacks[0].path.length);
  beginBattle(s);run(s);assert.equal(s.hp,24);
});

test('建筑绕行仍经过可破坏墙，不用附近空路避开墙或炮塔火力',()=>{
  const s=make();buildOutpost(s,key(15,22));const wall=s.attacks[0].path[3],original=structuredClone(s.attacks);
  assert.equal(changeWall(s,wall),'');s.wallHealth.get(wall).hp=2;
  const [x,y]=[wall%SIZE,Math.floor(wall/SIZE)],tower=key(x-1,y);assert.equal(buildTower(s,tower,'B'),'');
  s.params.weapons.B.power=1;beginBattle(s);
  let hit=false;for(let i=0;i<30&&s.phase==='battle';i++){stepBattle(s);if(s.events.some(e=>e.type==='wallHit'))hit=true;}
  assert.ok(hit);assert.deepEqual(s.attacks,original);assert.ok(s.outposts.has(key(15,22)));
});

test('废墟免费清理后可换建，地块身份与生成布局保持不变',()=>{
  const s=make('building'),id=key(16,23),layout=structuredClone(s.layout),site=structuredClone(s.sites[0]);
  assert.equal(plotContent(s,id).status,'ruin');assert.ok(buildOutpost(s,id));assert.equal(clearPlot(s,id),'');
  assert.equal(funds(s),1000);assert.equal(plotContent(s,id).status,'empty');assert.ok(productionCells(id,s).every(cell=>!s.blocked.has(cell)));
  assert.equal(buildOutpost(s,id),'');assert.equal(outpostAt(s,key(15,22)),id);assert.ok(buildProduction(s,id));
  assert.equal(removeOutpost(s,key(15,22)),'');assert.equal(buildProduction(s,id),'');assert.equal(plotContent(s,id).type,'production');
  assert.deepEqual(s.layout,layout);assert.deepEqual(s.sites[0],site);
});

test('空地允许墙塔，建设整块建筑前须处理实际占用，清理也不能绕过权限',()=>{
  const s=make('building'),id=key(15,22);clearPlot(s,id);assert.equal(buildTower(s,id,'A'),'');assert.ok(buildOutpost(s,id));
  assert.ok(buildProduction(s,id));removeTower(s,id);assert.equal(changeWall(s,id),'');assert.ok(buildProduction(s,id));
  changeWall(s,id,true);assert.equal(buildProduction(s,id),'');assert.ok(buildTower(s,id,'A'));assert.ok(changeWall(s,id));
  s.phase='battle';assert.ok(clearPlot(s,id));s.phase='build';s.params.controlRadius=1;assert.ok(clearPlot(s,id));
});

test('前哨仅需驻扎格受控，整块未受控也可扩张；禁止道路与火光地块建设',()=>{
  const s=make();s.params.controlRadius=2;const id=key(15,23);
  assert.ok(inControl(s,id));assert.ok(!inControl(s,key(16,23)));assert.equal(buildOutpost(s,id),'');
  assert.ok(inControl(s,key(16,23)));assert.ok(buildOutpost(s,key(14,23)));
  assert.equal(buildTower(s,key(15,18),'A'),'');
  const params=structuredClone(s.params);params.controlRadius=1;params.outpostRadius=1;
  assert.match(validateParams(params,s),/控制范围/);
  const map=structuredClone(s.layout);map.blocks.push({x:15,y:25,width:2,height:2,kind:'open'});
  const home=createCampaign(DEFAULTS,undefined,map);assert.ok(buildOutpost(home,home.camp));assert.ok(buildProduction(home,home.camp));assert.ok(clearPlot(home,home.camp));
});

test('前哨拆除检查控制依赖，旧建筑也按比例退款，跨格操作不重复扣费',()=>{
  const s=make(),id=key(15,22);s.params.controlRadius=5;buildOutpost(s,id);const tower=key(15,16);assert.equal(buildTower(s,tower,'A'),'');
  assert.match(removeOutpost(s,key(16,23)),/依赖/);removeTower(s,tower);s.day=4;
  const before=funds(s);assert.equal(clearPlot(s,key(16,23)),'');assert.equal(funds(s),before+12);assert.equal(plotContent(s,id).status,'empty');
  assert.equal(buildProduction(s,key(16,23)),'');const invested=funds(s);assert.ok(buildProduction(s,id));assert.equal(funds(s),invested);
  s.day=5;const refund=Math.floor(productionQuote(s,id).cost/2);assert.equal(removeProduction(s,id),'');assert.equal(funds(s),invested+refund);
});

test('重试保留清理、换建与绕行，整局重来恢复原废墟；拆除不主动换最短路线',()=>{
  const s=make('building'),id=key(15,22);clearPlot(s,id);buildOutpost(s,id);
  const path=structuredClone(s.attacks[0].path),snapshot=beginBattle(s);run(s);
  const retry=restoreNight(snapshot);assert.equal(plotContent(retry,id).type,'outpost');assert.deepEqual(retry.attacks[0].path,path);
  assert.equal(clearPlot(retry,id),'');assert.deepEqual(retry.attacks[0].path,path);assert.ok(!retry.blocked.has(id));
  const fresh=restartCampaign(s);assert.equal(plotContent(fresh,id).status,'ruin');assert.equal(fresh.outposts.size,0);
});

test('面积经营报价支持矩形与更大地块，小地块快回款，大地块密度有上限',()=>{
  const quote=(width,height)=>productionQuote({params:{...DEFAULTS,productionCostPerCell:8,productionIncomePerCell:1},sites:[{x:0,y:0,width,height}]},0);
  assert.deepEqual(quote(2,2),{area:4,cost:20,income:4});assert.deepEqual(quote(4,4),{area:16,cost:128,income:16});
  assert.deepEqual(quote(5,5),{area:25,cost:304,income:38});assert.deepEqual(quote(6,6),{area:36,cost:512,income:65});
  assert.deepEqual(quote(2,6),quote(3,4));
  const sizes=[2,3,4,5,6,8,12,20].map(n=>quote(n,n));
  for(let i=1;i<sizes.length;i++){assert.ok(sizes[i].cost>sizes[i-1].cost);assert.ok(sizes[i].income>sizes[i-1].income);}
  assert.ok(sizes.every(q=>q.income/q.area<=2));assert.ok(quote(2,2).cost/quote(2,2).income<quote(4,4).cost/quote(4,4).income);
  assert.ok(quote(6,6).income/36>quote(4,4).income/16);assert.equal(quote(20,20).cost/quote(20,20).income,8);
});


test('当天临时建筑撤销后恢复原始路径，同时保留其他建筑造成的必要绕行',()=>{
  const layout=structuredClone(make().layout),second={x:15,y:24,width:2,height:1,kind:'open'};
  layout.blocks.push(second);
  const wave=[{x:15,y:20,hp:6,count:1,first:1,interval:2}];
  const s=createCampaign({...DEFAULTS,budget:1000},[wave],layout);s.day=3;
  const original=[...s.attacks[0].path],cash=funds(s),a=key(15,22),b=key(15,24);
  assert.equal(buildProduction(s,a),'');assert.notDeepEqual(s.attacks[0].path,original);
  assert.equal(removeProduction(s,a),'');assert.deepEqual(s.attacks[0].path,original);assert.equal(funds(s),cash-5);
  assert.equal(buildProduction(s,b),'');const onlyB=[...s.attacks[0].path];
  assert.equal(buildProduction(s,a),'');assert.equal(removeProduction(s,a),'');
  assert.deepEqual(s.attacks[0].path,onlyB);assert.ok(s.attacks[0].path.every(id=>!s.blocked.has(id)));
  assert.equal(removeProduction(s,b),'');assert.deepEqual(s.attacks[0].path,original);
});

test('第一天只防守，第二天经营与清理，第三天开放前哨',()=>{
  const s=make('building'),id=key(15,22);s.day=1;
  assert.match(buildProduction(s,id),/2/);assert.match(clearPlot(s,id),/2/);assert.match(buildOutpost(s,id),/3/);
  s.day=2;assert.equal(buildProduction(s,id),'');assert.equal(removeProduction(s,id),'');assert.match(buildOutpost(s,id),/3/);
  s.day=3;assert.equal(buildOutpost(s,id),'');
});
