import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULTS,SIZE} from '../src/config.js';
import {MAP_DEFAULTS} from '../src/map-settings.js';
import {generateCityMap,walkableDistances} from '../src/city-map.js';
import {createCampaign,key,funds,population,bankFinance,bankContribution,bankActive,bankDiscovered,bankCapacityFor,pendingBanks,bankUpgradeQuote,bankUpgradeError,upgradeBank,bankError,restoreBank,canAfford,availableFunds,changeWall,repairFacility,repairQuote,buildTower,buildProduction,clearPlot,productionControlled,productionCells,applyTestScenario,settleEconomy,beginBattle,restoreNight,restartCampaign,stepBattle,enterMorning,finishIdleNight,lockAttacks,validateParams,removeOutpost,controlMask,placementError} from '../src/model.js';
import {createTowerOverlayCache} from '../src/tower-overlay.js';
const first=key(12,23),second=key(18,23),plot=key(18,27);
function setup(n=1,balance=100,params={}){
  const blocks=[{x:12,y:23,width:2,height:2,kind:'building',role:'bank',ruinType:'bank'},{x:18,y:23,width:2,height:2,kind:'building',role:'bank',ruinType:'bank'},{x:18,y:27,width:2,height:2,kind:'building',ruinType:'production'}];
  const layout={width:SIZE,height:SIZE,camp:{x:15,y:25},blocks,tiles:Array(SIZE*SIZE).fill('road')};
  const wave=[{x:15,y:24,hp:6,count:1,first:1,interval:1}];
  const s=createCampaign({...DEFAULTS,budget:1000,bankCapacity:60,nightTicks:3,...params},[wave,wave,wave,wave],layout);s.day=3;
  for(const id of [first,second].slice(0,n))assert.equal(restoreBank(s,id),'');
  assert.equal(applyTestScenario(s,3,balance,6),'');return s;
}
function settle(s){s.phase='won';settleEconomy(s);}

test('炮位缓存随贷款余额更新可负担状态，昼夜加急仍与实际校验一致',()=>{
  const s=setup(1,-45),cache=createTowerOverlayCache();let view=cache.get(s,controlMask(s));
  const matches=()=>{for(const type of ['A','B'])for(const id of view.candidates)assert.equal(view.eligible(type).has(id),!placementError(s,id,type));};
  matches();assert.equal(view.eligible('B').size,0);
  s.earned+=10;assert.strictEqual(cache.get(s,controlMask(s)),view);matches();assert.ok(view.eligible('B').size>0);
  s.phase='battle';view=cache.get(s,controlMask(s));matches();assert.equal(view.eligible('B').size,0);
  s.earned+=20;assert.strictEqual(cache.get(s,controlMask(s)),view);matches();assert.ok(view.eligible('B').size>0);
});

test('预置银行保留8×8地标占地，不重叠且所有通行地面连通',()=>{
  const m=generateCityMap(MAP_DEFAULTS),banks=m.blocks.filter(p=>p.role==='bank');assert.equal(banks.length,2);
  const occupied=new Set();for(const b of m.blocks)for(let y=b.y;y<b.y+b.height;y++)for(let x=b.x;x<b.x+b.width;x++){const id=y*SIZE+x;assert.ok(!occupied.has(id));occupied.add(id);}
  assert.ok(banks.every(b=>b.width===8&&b.height===8&&b.ruinType==='bank'));
  const d=walkableDistances(m);for(let id=0;id<m.tiles.length;id++)assert.equal(d[id]>=0,['road','open'].includes(m.tiles[id]));
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
test('经营先入账后整数计息；重复读取和重复结算不发钱',()=>{
  const s=setup(1,10);assert.equal(buildProduction(s,plot),'');const g=funds(s);settle(s);assert.equal(s.nightInterest,Math.floor((g+s.nightEconomy)*.05));
  const after=funds(s);bankFinance(s);settleEconomy(s);assert.equal(funds(s),after);
  const tiny=setup(1,1);settle(tiny);assert.equal(funds(tiny),1);
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
  while(s.phase==='battle')stepBattle(s);assert.equal(s.nightInterest,0);assert.equal(funds(s),1);
});

test('存息舍尾、贷息进位；零利率不收费，小数利率的整数边界不误进位',()=>{
  for(const [balance,params,expected] of [[43,{bankDepositPercent:10},4],[-38,{},-4],[-1,{},-1],[-38,{bankLoanPercent:0,bankLoanMinPercent:0},0],[-50,{bankLoanPercent:14.000000000000002},-7]]){
    const s=setup(1,balance,params);assert.equal(bankFinance(s).interest,expected);settle(s);assert.equal(funds(s),balance+expected);assert.ok(Number.isInteger(funds(s)));
  }
});
test('金币与人口实验输入只接受整数，拒绝时保持状态',()=>{
  const s=setup(),before=structuredClone(s);
  for(const [gold,people] of [[4.3,6],[-3.8,6],[10,6.5]]){assert.match(applyTestScenario(s,3,gold,people),/整数/);assert.deepEqual(s,before);}
});
test('银行完整揭示才算发现，未控制仍可被发现；探索记忆保留但新局重置',()=>{
  const s=setup(0);s.explored=new Set();assert.equal(bankDiscovered(s,first),false);
  s.explored.add(first);assert.equal(bankDiscovered(s,first),false);
  for(const id of productionCells(first,s))s.explored.add(id);
  s.params.controlRadius=1;assert.equal(bankDiscovered(s,first),true);assert.match(bankError(s,first),/控制区/);
  assert.equal(bankDiscovered(s,key(1,1)),false);
  s.params.campS01=0;
  assert.equal(bankDiscovered(restartCampaign(s),first),false);
});

test('新默认每座100额度，存贷5/10不变；满额利息可以超出消费下限',()=>{
  assert.equal(DEFAULTS.bankCapacity,100);assert.equal(DEFAULTS.bankUpgradeCost,25);
  const s=setup(1,100,{bankCapacity:100});assert.equal(bankFinance(s).interest,5);
  assert.equal(applyTestScenario(s,3,-100,6),'');assert.equal(canAfford(s,1),false);settle(s);assert.equal(funds(s),-110);
});
test('每座独立三选一并支付25；额度只翻本座，利率加全局，升级不增用工',()=>{
  const s=setup(2,500,{bankCapacity:100}),workers=population(s).working;
  const unchanged=structuredClone(s);assert.match(upgradeBank(s,first,null),/请选择/);assert.deepEqual(s,unchanged);
  const before=structuredClone(s),q=bankUpgradeQuote(s,first,'capacity');assert.equal(q.localAfter,200);assert.equal(q.after.capacity,300);assert.deepEqual(s,before);
  assert.equal(upgradeBank(s,first,'capacity'),'');assert.equal(funds(s),475);assert.equal(bankCapacityFor(s,second),100);
  const spent=structuredClone(s);assert.match(upgradeBank(s,first,'deposit'),/完成升级/);assert.deepEqual(s,spent);
  assert.equal(upgradeBank(s,second,'deposit'),'');assert.equal(funds(s),450);assert.equal(bankFinance(s).depositPercent,7);assert.equal(bankFinance(s).interest,21);assert.equal(population(s).working,workers);
});
test('POI目标只含已知未完成实体；完成A后隐藏，发现B才重新出现',()=>{
  const s=setup(0,100,{bankCapacity:100});s.explored=new Set(productionCells(first,s));
  assert.deepEqual(pendingBanks(s),[first]);assert.deepEqual(pendingBanks(s,true),[]);
  assert.equal(restoreBank(s,first),'');assert.deepEqual(pendingBanks(s),[]);assert.deepEqual(pendingBanks(s,true),[first]);
  assert.equal(upgradeBank(s,first,'loan'),'');assert.deepEqual(pendingBanks(s,true),[]);
  for(const id of productionCells(second,s))s.explored.add(id);assert.deepEqual(pendingBanks(s),[second]);
  s.params.controlRadius=1;assert.deepEqual(pendingBanks(s),[second]);assert.match(bankError(s,second),/控制区/);
});
test('升级不能预借未来额度；实际借款保留操作前债务上限，下次借款才更新',()=>{
  const s=setup(1,-90,{bankCapacity:100}),before=structuredClone(s);
  assert.match(upgradeBank(s,first,'capacity'),/不足/);assert.deepEqual(s,before);
  assert.equal(applyTestScenario(s,3,0,6),'');assert.equal(upgradeBank(s,first,'capacity'),'');assert.equal(funds(s),-25);assert.equal(s.debtInterestCap,100);assert.equal(bankFinance(s).capacity,200);
  assert.equal(changeWall(s,key(15,23)),'');assert.equal(s.debtInterestCap,200);
});
test('已有欠款享受贷款专精；停业暂停利率加成但不免息，复业恢复专精',()=>{
  const s=setup(1,-50,{bankCapacity:100});assert.equal(upgradeBank(s,first,'loan'),'');assert.equal(bankFinance(s).loanPercent,8);assert.equal(bankFinance(s).interest,-6);
  s.params.controlRadius=1;assert.equal(bankFinance(s).capacity,0);assert.equal(bankFinance(s).loanPercent,10);assert.equal(bankFinance(s).interest,-8);
  s.params.controlRadius=9;assert.equal(bankFinance(s).loanPercent,8);assert.equal(s.banks.get(first).upgrade,'loan');
});
test('利率可交叉，仍按唯一余额单向计息；上下限无效果的升级被拒绝',()=>{
  const s=setup(2,500,{bankCapacity:100}),third=key(22,23);s.sites.push({...s.sites[0],x:22,y:23});s.plotContents.set(third,{status:'ruin',type:'bank'});
  assert.equal(restoreBank(s,third),'');assert.equal(upgradeBank(s,first,'deposit'),'');assert.equal(upgradeBank(s,second,'deposit'),'');assert.equal(upgradeBank(s,third,'loan'),'');
  assert.equal(bankFinance(s).depositPercent,9);assert.equal(bankFinance(s).loanPercent,8);assert.equal(bankFinance(s,100).interest,9);
  assert.equal(applyTestScenario(s,3,-100,6),'');assert.equal(bankFinance(s).interest,-8);
  const capped=setup(2,500,{bankCapacity:100,bankUpgradeRatePoints:8,bankRateMaxPercent:10});assert.equal(upgradeBank(capped,first,'loan'),'');assert.equal(bankFinance(capped).loanPercent,2);
  const before=structuredClone(capped);assert.match(upgradeBank(capped,second,'loan'),/下限/);assert.deepEqual(capped,before);
  assert.equal(upgradeBank(capped,second,'deposit'),'');assert.equal(bankFinance(capped).depositPercent,10);
});
test('专精与费用随重试恢复，重开清零；升级参数校验拒绝矛盾利率边界',()=>{
  const s=setup(1,100,{bankCapacity:100});assert.equal(upgradeBank(s,first,'deposit'),'');const snap=beginBattle(s);
  while(s.phase==='battle')stepBattle(s);const retry=restoreNight(snap);assert.equal(funds(retry),75);assert.equal(retry.banks.get(first).upgrade,'deposit');assert.equal(bankFinance(retry).depositPercent,7);
  const fresh=restartCampaign(s);assert.equal(fresh.banks.size,0);assert.deepEqual(pendingBanks(fresh,true),[]);
  for(const changes of [{bankUpgradeCost:0},{bankUpgradeCapacityMultiplier:1.5},{bankUpgradeRatePoints:-1},{bankLoanMinPercent:11},{bankRateMaxPercent:4}])assert.match(validateParams({...DEFAULTS,...changes},fresh),/银行升级/);
});

test('本座贡献只读取状态，反映叠加利率、实际边界和停业后的固有额度',()=>{
  const s=setup(2,500,{bankCapacity:100});assert.equal(upgradeBank(s,first,'deposit'),'');assert.equal(upgradeBank(s,second,'deposit'),'');
  const before=structuredClone(s),q=bankContribution(s,first);assert.equal(q.before,7);assert.equal(q.after,9);assert.equal(q.capacity,100);assert.deepEqual(s,before);
  s.params.controlRadius=1;const stopped=bankContribution(s,first);assert.equal(stopped.active,false);assert.equal(stopped.capacity,0);assert.equal(stopped.installed,100);assert.equal(stopped.kind,'deposit');
  const capped=setup(1,500,{bankCapacity:100,bankRateMaxPercent:10,bankDepositPercent:9});assert.equal(upgradeBank(capped,first,'deposit'),'');assert.equal(bankContribution(capped,first).before,9);assert.equal(bankContribution(capped,first).after,10);
});
