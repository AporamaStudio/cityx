import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULTS,SIZE} from '../src/config.js';
import {MAP_DEFAULTS} from '../src/map-settings.js';
import {generateCityMap,walkableDistances} from '../src/city-map.js';
import {createCampaign,key,funds,population,bankFinance,bankActive,bankError,restoreBank,canAfford,availableFunds,changeWall,repairFacility,repairQuote,buildTower,buildProduction,clearPlot,productionControlled,applyTestScenario,settleEconomy,beginBattle,restoreNight,restartCampaign,stepBattle,enterMorning,finishIdleNight,lockAttacks,validateParams,removeOutpost} from '../src/model.js';
const first=key(12,23),second=key(18,23),plot=key(18,27);
function setup(n=1,balance=100,params={}){
  const blocks=[{x:12,y:23,width:2,height:2,kind:'building',role:'bank',ruinType:'bank'},{x:18,y:23,width:2,height:2,kind:'building',role:'bank',ruinType:'bank'},{x:18,y:27,width:2,height:2,kind:'building',ruinType:'production'}];
  const layout={width:SIZE,height:SIZE,camp:{x:15,y:25},blocks,tiles:Array(SIZE*SIZE).fill('road')};
  const wave=[{x:15,y:24,hp:6,count:1,first:1,interval:1}];
  const s=createCampaign({...DEFAULTS,budget:1000,nightTicks:3,...params},[wave,wave,wave,wave],layout);s.day=3;
  for(const id of [first,second].slice(0,n))assert.equal(restoreBank(s,id),'');
  assert.equal(applyTestScenario(s,3,balance,6),'');return s;
}
function settle(s){s.phase='won';settleEconomy(s);}

test('预置银行保留8×8地标占地，不重叠且所有通行地面连通',()=>{
  const m=generateCityMap(MAP_DEFAULTS),banks=m.blocks.filter(p=>p.role==='bank');assert.equal(banks.length,2);
  const occupied=new Set();for(const b of m.blocks)for(let y=b.y;y<b.y+b.height;y++)for(let x=b.x;x<b.x+b.width;x++){const id=y*SIZE+x;assert.ok(!occupied.has(id));occupied.add(id);}
  assert.ok(banks.every(b=>b.width===8&&b.height===8&&b.ruinType==='bank'));
  const d=walkableDistances(m);for(let id=0;id<m.tiles.length;id++)assert.equal(d[id]>=0,m.tiles[id]!=='block');
  assert.throws(()=>generateCityMap({...MAP_DEFAULTS,bankCount:5}),/银行/);
});
test('无银行无利息；一座/两座按全局余额和容量计息',()=>{
  for(const [n,g,interest] of [[0,100,0],[1,100,3],[1,40,2],[1,0,0],[2,100,5],[1,-20,-2],[2,-100,-10]]){
    const s=setup(n,g);assert.equal(bankFinance(s).interest,interest);settle(s);assert.equal(funds(s),g+interest);assert.equal(s.nightInterest,interest);
  }
});
test('修复费用与用工固定；第一座不可用自己的未来额度支付，银行不能新建拆改或架炮',()=>{
  const s=setup(0,24),before=structuredClone(s);assert.match(restoreBank(s,first),/不足/);assert.deepEqual(s,before);
  assert.equal(applyTestScenario(s,3,25,6),'');assert.equal(restoreBank(s,first),'');assert.equal(funds(s),0);assert.equal(population(s).free,5);assert.equal(bankFinance(s).capacity,60);
  assert.match(restoreBank(s,key(1,1)),/已有的银行/);assert.match(clearPlot(s,first),/保留POI/);assert.match(buildProduction(s,first),/保留POI/);assert.ok(buildTower(s,first,'A'));
});
test('触碰一格即整栋控制并运营，银行不会额外传播范围',()=>{
  const s=setup(0),p=s.sites[0];p.x=23;p.y=25;p.width=4;p.height=4;
  s.plotContents.set(key(23,25),{status:'ruin',type:'bank'});assert.ok(productionControlled(s,key(23,25)));
  assert.equal(restoreBank(s,key(23,25)),'');assert.ok(bankActive(s,key(23,25)));assert.equal(bankFinance(s).capacity,60);
});
test('主动消费止于信用下限，失败无副作用；利息可以突破下限但不能继续消费',()=>{
  const s=setup(1,0);
  assert.equal(applyTestScenario(s,3,-60,6),'');const before=structuredClone(s);assert.ok(changeWall(s,key(15,23)));assert.deepEqual(s,before);
  settle(s);assert.equal(funds(s),-66);assert.equal(bankFinance(s).interest,-6);assert.equal(availableFunds(s),0);assert.equal(canAfford(s,1),false);
});
test('墙、经营、夜间加急炮塔与部分修复使用同一购买能力',()=>{
  const s=setup(1,0);assert.equal(changeWall(s,key(15,23)),'');assert.equal(funds(s),-2);assert.equal(s.debtInterestCap,60);
  assert.equal(buildProduction(s,plot),'');const before=funds(s);s.hp=10;
  const q=repairQuote(s,s.camp);assert.equal(q.restore,Math.min(20,Math.floor((before+60)/5)));assert.equal(repairFacility(s,s.camp),'');assert.equal(funds(s),before-q.cost);
  const t=setup(1,0);beginBattle(t);assert.equal(buildTower(t,plot,'A'),'');assert.equal(funds(t),-20);assert.equal(bankFinance(t).interest,-2);
});
test('已有负债时停业撤销额度不追缴，保留债务计息，复业重新授信',()=>{
  const s=setup(1,-20),g=funds(s);s.params.controlRadius=1;assert.equal(bankFinance(s).capacity,0);assert.equal(funds(s),g);assert.equal(bankFinance(s).interest,-2);assert.equal(canAfford(s,1),false);
  settle(s);assert.equal(funds(s),-22);s.params.controlRadius=9;assert.equal(bankFinance(s).capacity,60);assert.equal(bankFinance(s).credit,38);
});
test('新增银行不改变旧债计息上限，使用新额度借款才提高；还清后新一轮不沿用旧上限',()=>{
  const s=setup(1,-35);assert.equal(restoreBank(s,second),'');assert.equal(s.debtInterestCap,60);assert.equal(bankFinance(s).capacity,120);assert.equal(bankFinance(s).interest,-6);
  assert.equal(changeWall(s,key(15,23)),'');assert.equal(s.debtInterestCap,120);assert.ok(bankFinance(s).interest< -6);
  s.earned+=200;assert.equal(bankFinance(s).debtCap,0);s.params.controlRadius=1;assert.equal(bankFinance(s).interest,0);
  // 测试偏移恢复到正数后，下一轮债务只使用当前真实额度。
  s.params.controlRadius=9;assert.equal(applyTestScenario(s,3,0,6),'');s.camp=key(13,25);s.params.controlRadius=3;assert.equal(changeWall(s,key(14,27)),'');assert.equal(s.debtInterestCap,60);
});
test('经营先入账后计息；重复读取和重复结算不发钱，利息小数不会被吞掉',()=>{
  const s=setup(1,10);assert.equal(buildProduction(s,plot),'');const g=funds(s);settle(s);assert.ok(Math.abs(s.nightInterest-(g+s.nightEconomy)*.05)<1e-10);
  const after=funds(s);bankFinance(s);settleEconomy(s);assert.equal(funds(s),after);
  const tiny=setup(1,.1);settle(tiny);assert.ok(Math.abs(funds(tiny)-.105)<1e-10);
});
test('正常与空闲加速夜末均只计息一次，次日不重复；当拍失败无经营或金融结算',()=>{
  for(const idle of [false,true]){
    const s=setup(1,40);beginBattle(s);for(let i=0;i<3&&s.phase==='battle';i++)stepBattle(s,undefined,idle);if(idle&&s.phase==='battle')assert.equal(finishIdleNight(s),true);
    assert.equal(funds(s),42);assert.equal(s.bankSettledDay,3);assert.equal(enterMorning(s),true);assert.equal(funds(s),42);assert.equal(s.nightInterest,0);
  }
  const s=setup(1,40);s.phase='lost';settleEconomy(s);assert.equal(funds(s),40);assert.equal(s.bankSettledDay,0);
});
test('重试回滚债务和利息，整局重来恢复银行废墟；参数不允许非法数值',()=>{
  const s=setup(1,0),snap=beginBattle(s);assert.equal(buildTower(s,plot,'A'),'');for(let i=0;i<3;i++)stepBattle(s);
  const restored=restoreNight(snap);assert.equal(funds(restored),0);assert.equal(restored.nightInterest,0);assert.equal(restored.debtInterestCap,0);
  const fresh=restartCampaign(s);assert.equal(fresh.banks.size,0);assert.equal(fresh.bankEarned,0);assert.equal(fresh.bankSettledDay,0);
  for(const [key,value] of [['bankWorkers',-1],['bankCapacity',0],['bankRestoreCost',0],['bankDepositPercent',NaN],['bankLoanPercent',101]])assert.match(validateParams({...DEFAULTS,[key]:value},fresh),/银行/);
});

test('击杀金币先自动还清债务，剩余正余额在夜末获得存款利息',()=>{
  const s=setup(1,9);s.waves[2]=s.sources=[{x:17,y:28,hp:2,count:1,first:1,interval:1}];lockAttacks(s);
  assert.equal(buildTower(s,plot,'A'),'');assert.equal(funds(s),-1);assert.equal(s.debtInterestCap,60);
  beginBattle(s);stepBattle(s,undefined,true);assert.equal(s.nightEarned,2);assert.equal(funds(s),1);assert.equal(s.debtInterestCap,0);
  while(s.phase==='battle')stepBattle(s);assert.equal(s.nightInterest,.05);assert.ok(Math.abs(funds(s)-1.05)<1e-10);
});
