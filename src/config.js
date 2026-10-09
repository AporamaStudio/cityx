// 首轮实验参数；只用于快速试玩，不代表平衡结论。
export const SIZE = 60;
export const DEFAULTS = {
  // 每格的现实边长，仅用于地图比例尺；战斗和建设仍按格计算。
  cellMeters: 20,
  campSight: 6, outpostSight: 9, daySightMultiplier: 1, nightSightMultiplier: 0.6, eventSightMultiplier: 1, sourceRevealSize: 3,
  initialPopulation: 6, productionCellsPerWorker: 4, housingCellsPerResident: 2, housingCostPerCell: 8,
  // 空地新建为基准；修缮只改变投入，不改变建成后的收入或人口。
  productionCostPerCell: 4, productionIncomePerCell: 0.5, renovationCostPercent: 50, killReward: 2,
  // 面积曲线：大地块产出密度逐渐趋近上限；同组参数在实验面板可调。
  productionBaseArea: 16, productionSmallCostFloor: 0.5, productionDensityGrowthArea: 9, productionMaxDensity: 2,
  // 架炮不占用施工人力；夜间只加收金币，倍率仍可调节。
  nightTowerCostMultiplier: 2,
  budget: 100, wallCost: 2, wallHP: 12, enemyPower: 1, defenseRepairPercent: 50, demolitionRefundPercent: 50, controlRadius: 9, campHP: 30, stepMs: 450,
  // 火光危急提示按最大 HP 百分比判断，0 关闭持续警示；受击仍短暂泛红。
  campWarningPercent: 30,
  outpostMinDistance: 2, outpostWorkers: 1, outpostCost: 25, outpostRadius: 6, campRepairCost: 5,
  weapons: {
    A: { shape: 'square', range: 1, power: 2, cost: 10 },
    B: { shape: 'square', range: 3, power: 1, cost: 20 },
  },
  camp: [15, 25],
  sources: [
    { x: 5, y: 3, hp: 12, count: 4, first: 1, interval: 6 },
    { x: 25, y: 3, hp: 12, count: 4, first: 1, interval: 6 },
    { x: 15, y: 1, hp: 12, count: 4, first: 9, interval: 6 },
  ],
};


// 十五晚实验：前五晚保留原节奏，后十晚逐步增加强度；参数仍须真人试玩。
const OPENING_WAVES = [
  [{x:5,y:3,hp:6,count:3,first:1,interval:12}, {x:25,y:3,hp:6,count:3,first:7,interval:12}],
  [{x:5,y:3,hp:8,count:3,first:1,interval:12}, {x:25,y:3,hp:8,count:3,first:7,interval:12}, {x:15,y:1,hp:8,count:2,first:13,interval:12}],
  [{x:5,y:3,hp:8,count:3,first:1,interval:12}, {x:25,y:3,hp:8,count:3,first:1,interval:12}, {x:15,y:1,hp:12,count:3,first:9,interval:12}],
  [{x:5,y:3,hp:10,count:3,first:1,interval:12}, {x:25,y:3,hp:10,count:3,first:7,interval:12}, {x:15,y:1,hp:14,count:3,first:13,interval:12}],
  [{x:5,y:3,hp:12,count:3,first:1,interval:12}, {x:25,y:3,hp:12,count:3,first:1,interval:12}, {x:15,y:1,hp:16,count:3,first:9,interval:12}],
];

export const WAVES = [...OPENING_WAVES, ...Array.from({length:10},(_,i)=>
  OPENING_WAVES[4].map(source=>({...source,hp:source.hp+Math.floor((i+1)/2),count:source.count+Math.floor((i+1)/3)}))
)];

// 固定街区占用整片土地；外围两侧均有大小街区可比较。
export const PRODUCTION_SITES = [
  {x:11,y:24,size:2}, {x:19,y:26,size:2},
  {x:2,y:17,size:2}, {x:2,y:22,size:3},
  {x:26,y:17,size:2}, {x:26,y:22,size:3},
];
