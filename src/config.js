// 首轮实验参数；只用于快速试玩，不代表平衡结论。
export const SIZE = 60;
export const DEFAULTS = {
  // 每格的现实边长，用于比例尺与3D实体尺度；战斗和建设仍按格计算。
  cellMeters: 20,
  // 精确火力只在路线格上显示；每格屏幕尺寸小于此值时收起数字，0关闭缩放门槛。
  fireNumbersMinCellPx: 12,
  // 两条倍率分界划分远/中/近景；报价另按实际空间保住可读字号。
  mapMidZoomPercent: 160, mapNearZoomPercent: 300,
  // 控制边缘内侧明显、外侧轻薄；宽度按格、强度按百分比，仅改变表现。
  controlBorderInnerCells:0.5, controlBorderOuterCells:0.5,
  controlBorderInnerOpacity:36, controlBorderOuterOpacity:10, controlBorderLinePx:3,
  // 敌源按完整占地边缘外扩揭雾，0只显示占地；与视野面板同步。
  campS01: 6, outpostS01: 9, daySightMultiplier: 1, nightSightMultiplier: 0.6, eventSightMultiplier: 1, sourceRevealPadding: 2,
  // 云纹流速只影响外观，0静止；保持两层云的方向与速度比例。
  cloudSpeedMultiplier: 1,
  // S01由火光/瞭望塔的有效视野决定；视野外S12/S23分别渐入中雾/浓雾。
  fogS12: 3, fogS23: 3,
  // 仅在实时视野的可见侧融入雾中，0关闭渐隐，不扩大侦测范围。
  enemyFogFadeCells: 1.5,
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
  // 源头按实际占地生成独立耐久；固定清源预算，末段仅加速播放，不能省略攻击。
  sourceCellHPMin:12, sourceCellHPMax:30, sourceRegenHP:0, nightTicks:160, nightCleanupSpeed:2,
  // 仅空闲夜末的进度过渡，0关闭动画；不增加战斗拍数或清源伤害。
  nightIdleTransitionMs:800,
  // 结束白天需连续按住确认；仅影响操作，不占用夜晚战斗拍数。
  dayEndHoldMs:1000,
  // 新一天收入明细短暂浮显，0关闭自动展示；悬停查看始终可用。
  incomeReportMs:2000,
  // 金币/人口详情的静止悬停时间，0立即显示；不延迟操作报价。
  resourceHoverMs:315,
  // 静止悬停允许的小幅位移（CSS像素），以起点为准，不累计漂移。
  resourceHoverTolerancePx:4,
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
