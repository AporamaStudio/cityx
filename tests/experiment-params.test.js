import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULTS} from '../src/config.js';
import {createCampaign,applyTestScenario,applyExperimentParams,changeWall,key,funds} from '../src/model.js';
const setup=()=>{const state=createCampaign(DEFAULTS);assert.equal(applyTestScenario(state,7,1000,6),'');return state;};

test('第7天视觉可独立应用，忽略玩法草稿并完整保留运行状态',()=>{
  const state=setup();state.phase='battle';state.tick=12;state.hp=7;
  const {params,...before}=structuredClone(state),draft={...state.params,freeProjection:'perspective',streetLightBudget:0,wallHP:-1,budget:0};
  assert.equal(applyExperimentParams(state,draft,'visual'),'');
  const {params:after,...rest}=state;assert.deepEqual(rest,before);assert.equal(funds(state),1000);assert.equal(after.wallHP,params.wallHP);assert.equal(after.budget,params.budget);assert.equal(after.freeProjection,'perspective');
  const unchanged=structuredClone(state);assert.match(applyExperimentParams(state,{...draft,freePerspectiveFovDegrees:99},'visual'),/视野角/);assert.deepEqual(state,unchanged);
});

test('第7天玩法原地应用保留日期、损伤与视觉，降低上限不复活残墙',()=>{
  const state=setup(),id=key(14,25);assert.equal(changeWall(state,id),'');state.wallHealth.get(id).hp=3;state.hp=7;
  const beforeFunds=funds(state);assert.equal(applyExperimentParams(state,{...state.params,wallHP:24,campHP:60,killReward:4,freeProjection:'invalid'},'gameplay'),'');
  assert.equal(state.day,7);assert.equal(state.hp,7);assert.deepEqual(state.wallHealth.get(id),{hp:3,max:24});assert.equal(funds(state),beforeFunds);assert.equal(state.params.freeProjection,'orthographic');
  state.wallHealth.get(id).hp=0;assert.equal(applyExperimentParams(state,{...state.params,wallHP:2,campHP:5},'gameplay'),'');assert.equal(state.hp,5);assert.deepEqual(state.wallHealth.get(id),{hp:0,max:2});
});

test('玩法应用拒绝冲突与战斗中修改，失败不覆盖任何状态',()=>{
  const state=setup(),before=structuredClone(state);assert.match(applyExperimentParams(state,{...state.params,nightTicks:1},'gameplay'),/最后一批/);assert.deepEqual(state,before);
  state.phase='battle';const battle=structuredClone(state);assert.match(applyExperimentParams(state,{...state.params,killReward:4},'gameplay'),/白天/);assert.deepEqual(state,battle);
});
