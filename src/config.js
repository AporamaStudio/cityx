// 首轮实验参数；只用于快速试玩，不代表平衡结论。
export const SIZE = 60;
export const DEFAULTS = {
  campSight: 6, outpostSight: 9, daySightMultiplier: 1, nightSightMultiplier: 0.6, eventSightMultiplier: 1, sourceRevealSize: 3,
  clearingCellsPerWorker: 1,
  initialPopulation: 6, productionCellsPerWorker: 4, housingCellsPerResident: 2, housingCostPerCell: 4,
  productionCostPerCell: 4, productionIncomePerCell: 0.5, killReward: 2,
  budget: 100, wallCost: 2, wallHP: 12, enemyPower: 1, defenseRepairPercent: 50, demolitionRefundPercent: 50, controlRadius: 9, campHP: 30, stepMs: 450,
  outpostCost: 25, outpostRadius: 6, campRepairCost: 1,
  weapons: {
    A: { shape: 'square', range: 1, power: 2, cost: 10, hp: 10 },
    B: { shape: 'square', range: 3, power: 1, cost: 20, hp: 12 },
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

// 经营曲线以面积衡量；大地块产出密度逐渐趋近上限，不无限增长。
export const PRODUCTION_CURVE = {baseArea:16,smallCostFloor:.5,densityGrowthArea:9,maxDensity:2};

// 固定街区占用整片土地；外围两侧均有大小街区可比较。
export const PRODUCTION_SITES = [
  {x:11,y:24,size:2}, {x:19,y:26,size:2},
  {x:2,y:17,size:2}, {x:2,y:22,size:3},
  {x:26,y:17,size:2}, {x:26,y:22,size:3},
];
