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
  assert.match(applyExperimentParams(state,{...draft,showRenderStats:'true'},'visual'),/绘制统计/);assert.deepEqual(state,unchanged);
});

test('第7天玩法原地应用保留日期、损伤与视觉，降低上限不复活残墙',()=>{
  const state=setup(),id=key(14,25);assert.equal(changeWall(state,id),'');state.wallHealth.get(id).hp=3;state.hp=7;
  const beforeFunds=funds(state);assert.equal(applyExperimentParams(state,{...state.params,wallHP:24,campHP:60,killReward:4,freeProjection:'invalid'},'gameplay'),'');
  assert.equal(state.day,7);assert.equal(state.hp,7);assert.deepEqual(state.wallHealth.get(id),{hp:3,max:24});assert.equal(funds(state),beforeFunds);assert.equal(state.params.freeProjection,DEFAULTS.freeProjection);
  state.wallHealth.get(id).hp=0;assert.equal(applyExperimentParams(state,{...state.params,wallHP:2,campHP:5},'gameplay'),'');assert.equal(state.hp,5);assert.deepEqual(state.wallHealth.get(id),{hp:0,max:2});
});

test('斜视投影与FOV独立应用，不覆盖自由镜头或夜战状态，拒绝无效配置',()=>{
  const state=setup();state.phase='battle';state.tick=12;
  const {params,...before}=structuredClone(state);
  assert.equal(applyExperimentParams(state,{...state.params,obliqueProjection:'perspective',obliquePerspectiveFovDegrees:55},'visual'),'');
  const {params:after,...rest}=state;assert.deepEqual(rest,before);assert.equal(after.obliqueProjection,'perspective');assert.equal(after.obliquePerspectiveFovDegrees,55);
  assert.equal(after.freeProjection,params.freeProjection);assert.equal(after.freePerspectiveFovDegrees,params.freePerspectiveFovDegrees);
  const unchanged=structuredClone(state);
  for(const change of [{obliqueProjection:'invalid'},{obliquePerspectiveFovDegrees:19},{obliquePerspectiveFovDegrees:61},{obliquePerspectiveFovDegrees:40.5}]){
    assert.match(applyExperimentParams(state,{...state.params,...change},'visual'),/斜视/);assert.deepEqual(state,unchanged);
  }
});

test('玩法应用拒绝冲突与战斗中修改，失败不覆盖任何状态',()=>{
  const state=setup(),before=structuredClone(state);assert.match(applyExperimentParams(state,{...state.params,nightTicks:1},'gameplay'),/最后一批/);assert.deepEqual(state,before);
  state.phase='battle';const battle=structuredClone(state);assert.match(applyExperimentParams(state,{...state.params,killReward:4},'gameplay'),/白天/);assert.deepEqual(state,battle);
});

test('升级光流参数只影响视觉，支持关闭光幕且拒绝越界值',()=>{
  const state=setup(),{params,...before}=structuredClone(state);
  assert.equal(applyExperimentParams(state,{...params,upgradeFlowHeightMeters:0,upgradeFlowMinPx:20,upgradeFlowCycleMs:1800,upgradeFlowOpacity:60},'visual'),'');
  const {params:after,...rest}=state;assert.deepEqual(rest,before);assert.equal(after.upgradeFlowHeightMeters,0);assert.equal(after.upgradeFlowOpacity,60);assert.equal(after.upgradeFlowMinPx,20);
  const unchanged=structuredClone(state);
  for(const change of [{upgradeFlowHeightMeters:13},{upgradeFlowMinPx:-1},{upgradeFlowMinPx:41},{upgradeFlowMinPx:1.5},{upgradeFlowCycleMs:0},{upgradeFlowOpacity:101}]){assert.match(applyExperimentParams(state,{...state.params,...change},'visual'),/升级光流/);assert.deepEqual(state,unchanged);}
});

test('POI标牌尺寸、边框及淡化可独立调节，不改变玩法；非法输入保持原状态',()=>{
  const state=setup();state.phase='battle';const {params,...before}=structuredClone(state);
  assert.equal(applyExperimentParams(state,{...params,poiMarkerMinSizePx:44,poiMarkerSizePx:72,poiMarkerBorderPx:6,poiMarkerRouteOpacity:40,poiMarkerNightOpacity:70,hospitalWorkers:99},'visual'),'');
  const {params:after,...rest}=state;assert.deepEqual(rest,before);assert.equal(after.poiMarkerMinSizePx,44);assert.equal(after.poiMarkerSizePx,72);assert.equal(after.poiMarkerBorderPx,6);assert.equal(after.poiMarkerRouteOpacity,40);assert.equal(after.poiMarkerNightOpacity,70);assert.equal(after.hospitalWorkers,2);
  const unchanged=structuredClone(state);
  for(const change of [{poiMarkerSizePx:31},{poiMarkerSizePx:81},{poiMarkerSizePx:55.5},{poiMarkerMinSizePx:31},{poiMarkerMinSizePx:73},{poiMarkerMinSizePx:44.5},{poiMarkerBorderPx:1},{poiMarkerBorderPx:7},{poiMarkerRouteOpacity:-1},{poiMarkerRouteOpacity:100.5},{poiMarkerNightOpacity:101},{poiMarkerNightOpacity:NaN}]){assert.match(applyExperimentParams(state,{...state.params,...change},'visual'),/POI标牌/);assert.deepEqual(state,unchanged);}
});

test('60格大城优化默认关闭，五组开关只作为视觉设置应用，不修改进度或玩法',async()=>{
  const {LARGE_CITY_OPTIMIZATION_KEYS}=await import('../src/config.js');
  const state=createCampaign(DEFAULTS),before=structuredClone(state),draft=structuredClone(state.params);
  for(const key of LARGE_CITY_OPTIMIZATION_KEYS){assert.equal(DEFAULTS[key],false);draft[key]=true;}
  assert.equal(applyExperimentParams(state,draft,'visual'),'');for(const key of LARGE_CITY_OPTIMIZATION_KEYS)before.params[key]=true;
  assert.deepEqual(state,before);
  draft.largeCityFog='true';assert.match(applyExperimentParams(state,draft,'visual'),/大城优化/);assert.equal(state.params.largeCityFog,true);
});
