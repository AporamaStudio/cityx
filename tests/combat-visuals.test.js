import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULTS,SIZE} from '../src/config.js';
import {createCampaign,key,beginBattle,stepBattle,controlMask,visionField,enemyKey} from '../src/model.js';
import {attackVisualPlan,resolvedShots,searchTargets,searchAim,shotSoundView,outpostFrontier,enemyDisplayFrames} from '../src/combat-visuals.js';

function setup(){
  const layout={width:SIZE,height:SIZE,camp:{x:15,y:25},tiles:Array(SIZE*SIZE).fill('road'),blocks:[{x:13,y:22,width:2,height:3,kind:'building'},{x:16,y:22,width:2,height:2,kind:'building'}]};
  const source={id:'source-1',index:0,bx:16,by:22,width:2,height:2,x:16,y:21,site:key(16,22),firstNight:1};
  const state=createCampaign({...DEFAULTS,sourceCellHPMin:6,sourceCellHPMax:6},[[{sourceId:source.id,x:16,y:21,hp:10,count:1,first:20,interval:5}]],layout,[source]);state.towers.set(key(14,23),'B');return state;
}
test('开火表现只随实际受击结果，来源归零的末次攻击仍能显示',()=>{
  const state=setup();beginBattle(state);state.enemySources.get('source-1').hp=1;
  const before=structuredClone(state),plan=attackVisualPlan(state,[],()=>true);assert.deepEqual(state,before);
  assert.equal(resolvedShots(plan,[]).length,0);stepBattle(state);
  assert.equal(state.enemySources.get('source-1').hp,0);assert.equal(resolvedShots(plan,state.events)[0].sourceId,'source-1');
});
test('隐藏敌人占用原攻击优先级，但不会产生指向它或替代敌源的弹迹',()=>{
  const state=setup(),hidden=key(14,25),visible=cell=>cell!==hidden;
  const plan=attackVisualPlan(state,[{id:hidden,target:state.camp}],visible);
  assert.deepEqual(plan,[]);assert.equal(attackVisualPlan(state,[],()=>false).length,0);
});
test('同格不同目标和清源结果不能误触发；范围伤害保持原状',()=>{
  const state=setup(),enemy={id:key(14,25),target:state.camp,hp:10,max:10,members:1,sources:[],origins:[]};
  const plan=attackVisualPlan(state,[enemy],()=>true);
  assert.equal(resolvedShots(plan,[{type:'hit',id:enemy.id,target:123,value:1}]).length,0);
  assert.equal(resolvedShots(plan,[{type:'sourceHit',sourceId:'source-1',value:1}]).length,0);
  assert.equal(resolvedShots(plan,[{type:'hit',id:enemy.id,target:enemy.target,value:1}]).length,1);
  beginBattle(state);state.enemies=[{...enemy,id:key(11,23)},{...enemy,id:key(14,20)}];
  const areaPlan=attackVisualPlan(state,state.enemies,()=>true);assert.equal(areaPlan.length,1);
  stepBattle(state,new Map(state.enemies.map(e=>[enemyKey(e),{to:e.id}])));
  assert.deepEqual(state.enemies.map(e=>e.hp),[9,9]);
});
test('探照灯扫点始终在真实控制区外与现有视野内，取点不扩大探索',()=>{
  const state=setup(),id=key(15,25);state.outposts.set(id,{day:1});state.phase='battle';
  const controlled=controlMask(state),sight=visionField(state),before=structuredClone(state),sector=searchTargets(id,controlled,sight,18);
  assert.ok(sector.points.length);for(let t=0;t<40;t+=.17){const p=searchAim(sector,t,id,controlled,sight),cell=key(Math.floor(p.x),Math.floor(p.y));assert.ok(!controlled.has(cell));assert.ok(sight.has(cell));}
  assert.deepEqual(state,before);
  assert.equal(searchAim(searchTargets(id,new Set(Array.from({length:SIZE*SIZE},(_,i)=>i)),sight,18),0,id,controlled,sight),null);
});
test('炮位声音随镜头缩放衰减，屏外静音且左右声像跟随实际位置',()=>{
  const view={width:100,height:100,panX:0,panY:0,cell:10,zoom:2},id=key(4,4);
  assert.equal(shotSoundView(key(10,4),view),null);assert.equal(shotSoundView(key(4,10),view),null);
  assert.equal(shotSoundView(id,{...view,panX:-60}),null);
  assert.ok(shotSoundView(id,{...view,zoom:1}).gain<shotSoundView(id,view).gain);
  assert.ok(shotSoundView(id,{...view,zoom:3}).gain<=1);
  assert.ok(shotSoundView(key(1,4),view).pan<0);assert.ok(shotSoundView(key(8,4),view).pan>0);
});

test('后方塔不因仍能看见远处边界扫光，扩张到外沿后只扫自身贡献方向',()=>{
  const state=setup(),rear=state.camp;state.outposts.set(rear,{day:1});
  let controlled=controlMask(state),sight=visionField(state),frontier=outpostFrontier(rear,state.params.outpostRadius,controlled);
  assert.equal(frontier.size,0);assert.ok(searchTargets(rear,controlled,sight,18).points.length);
  assert.equal(searchTargets(rear,controlled,sight,18,frontier).points.length,0);
  const front=key(23,25);state.outposts.set(front,{day:1});controlled=controlMask(state);sight=visionField(state);frontier=outpostFrontier(front,state.params.outpostRadius,controlled);
  assert.ok(frontier.size);const sector=searchTargets(front,controlled,sight,18,frontier);assert.ok(sector.points.length);
  for(let t=0;t<30;t+=.2){const p=searchAim(sector,t,front,controlled,sight);assert.ok(!controlled.has(key(Math.floor(p.x),Math.floor(p.y))));assert.ok(sight.has(key(Math.floor(p.x),Math.floor(p.y))));assert.ok(p.x>23);}
  assert.equal(outpostFrontier(front,state.params.outpostRadius,new Set(Array.from({length:SIZE*SIZE},(_,i)=>i))).size,0);
});

test('敌群模型与HP共用旧插值、合流和死亡显示，不推进或修改战斗状态',()=>{
  const enemy={id:key(5,5),target:key(15,25),hp:12,max:18,members:3,origins:['0:0','1:0']},state={enemies:[enemy],events:[{type:'merge',id:enemy.id,target:enemy.target}]},incoming=new Map([[enemyKey(enemy),{...enemy,hp:18}]]),before=structuredClone({state,incoming});
  let frames=enemyDisplayFrames(state,null,incoming,.5);assert.equal(frames[0].barHP,15);assert.equal(frames[0].enemy.hp,12);assert.equal(frames[0].scale,1.16);
  assert.equal(enemyDisplayFrames(state,null,incoming,.5,true)[0].scale,1);
  const motion={actors:[{...enemy,to:key(6,5)}],elapsed:80,duration:160};frames=enemyDisplayFrames(state,motion,incoming,.5);
  assert.equal(frames[0].rawX,5.5);assert.equal(frames[0].rawY,5);assert.equal(frames[0].enemy.hp,12);assert.equal(frames[0].id,'enemy:0:0,1:0');
  assert.deepEqual({state,incoming},before);
  const dead={enemies:[],events:[{type:'kill',id:enemy.id,target:enemy.target}]};frames=enemyDisplayFrames(dead,null,incoming,.5);assert.equal(frames[0].enemy.hp,0);assert.equal(frames[0].alpha,.5);assert.equal(frames[0].scale,.65);assert.equal(enemyDisplayFrames(dead,null,incoming,1).length,0);
});
test('同格不同目标沿用错开显示，模型身份不依赖本拍所在格',()=>{
  const a={id:key(5,5),target:1,hp:6,max:6,origins:['0:0']},b={...a,target:2,origins:['1:0']},state={enemies:[a,b],events:[]},frames=enemyDisplayFrames(state,null,new Map(),1);
  assert.equal(frames[0].scale,.55);assert.equal(frames[1].scale,.55);assert.ok(frames[0].x<5&&frames[1].x>5);assert.notEqual(frames[0].id,frames[1].id);
  assert.equal(enemyDisplayFrames({enemies:[{...a,id:key(7,5)}],events:[]},null,new Map(),1)[0].id,frames[0].id);
});
