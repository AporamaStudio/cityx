// 首轮实验参数；只用于快速试玩，不代表平衡结论。
import {readMapSettings,battleMapSize} from './map-settings.js?v=4';
// 浏览器每次进入新局固定尺寸；Node历史规则检查保留60格，256格检查显式提供URL。
export const SIZE = typeof location==='undefined'?60:battleMapSize(readMapSettings(location.search));
export const DEFAULTS = {
  // 每格的现实边长，用于比例尺与3D实体尺度；战斗和建设仍按格计算。
  cellMeters: 20,
  // 近景最大格宽（CSS像素），改变镜头尺度，不提高画布像素比或模型面数。
  mapMaxCellPx: 256,
  // 固定斜视与水平面的夹角（度）；自由手调角度独立，不随缩放改变。
  obliqueElevationDegrees: 45,
  // 斜视与自由观察分别比较投影；俯视始终正交，透视FOV为垂直视野角。
  obliqueProjection: 'orthographic', obliquePerspectiveFovDegrees: 40,
  freeProjection: 'perspective', freePerspectiveFovDegrees: 40,
  // WASD按画面方向平移；按真实时间与CSS像素计速，0关闭，不随战斗倍速变化。
  keyboardPanSpeedPx: 480,
  // 自由/斜视建设默认保持镜头；开启可恢复操作回俯视的比较方式。
  returnToTopOnAction: false,
  // 真实路灯固定光源池；超出预算仍保留灯罩和地面暖光，0关闭路灯真实光源。
  streetLightBudget: 24,
  // 每个原始敌群的基础视觉人数；合流增加密度，人物不独立结算HP。
  enemyFiguresPerGroup: 16,
  // 默认显示CPU绘制耗时与实际显示帧率，可在视觉实验关闭；绘制耗时不含完整GPU时间。
  showRenderStats: true,
  // 精确火力只在路线格上显示；每格屏幕尺寸小于此值时收起数字，0关闭缩放门槛。
  fireNumbersMinCellPx: 12,
  // 两条倍率分界划分远/中/近景；报价另按实际空间保住可读字号。
  mapMidZoomPercent: 160, mapNearZoomPercent: 300,
  // 控制边缘内侧明显、外侧轻薄；宽度按格、强度按百分比，仅改变表现。
  controlBorderInnerCells:0.5, controlBorderOuterCells:0.5,
  controlBorderInnerOpacity:36, controlBorderOuterOpacity:10, controlBorderLinePx:3,
  // 升级定位保留真实建筑；光流仅当前目标播放，米制高度不随地块大小放大。
  upgradeFlowHeightMeters:6, upgradeFlowMinPx:32, upgradeFlowCycleMs:2200, upgradeFlowOpacity:60,
  // POI标牌随局部屏幕尺度在上下限间平滑变化；默认实底，关注战斗时整枚淡化。
  poiMarkerMinSizePx:40, poiMarkerSizePx:56, poiMarkerBorderPx:4, poiMarkerRouteOpacity:50, poiMarkerNightOpacity:65,
  // 敌源按完整占地边缘外扩揭雾，0只显示占地；与视野面板同步。
  campS01: 6, outpostS01: 9, daySightMultiplier: 1, nightSightMultiplier: 0.6, eventSightMultiplier: 1, sourceRevealPadding: 2,
  // 云纹流速只影响外观，0静止；保持两层云的方向与速度比例。
  cloudSpeedMultiplier: 1,
  // S01由火光/瞭望塔的有效视野决定；视野外S12/S23分别渐入中雾/浓雾。
  fogS12: 3, fogS23: 3,
  // 外围仅为景物：按地图短边延伸，清晰段占过渡距离的比例，不增加城内视野。
  exteriorFogTransitionPercent: 20, exteriorFogClearPercent: 25, exteriorFogFarOpacity: 90,
  // 仅在实时视野的可见侧融入雾中，0关闭渐隐，不扩大侦测范围。
  enemyFogFadeCells: 1.5,
  initialPopulation: 6, productionCellsPerWorker: 4, housingCellsPerResident: 2, housingCostPerCell: 8,
  // 空地新建为基准；修缮只改变投入，不改变建成后的收入或人口。
  productionCostPerCell: 4, productionIncomePerCell: 0.5, renovationCostPercent: 50, killReward: 2,
  // 面积曲线：大地块产出密度逐渐趋近上限；同组参数在实验面板可调。
  productionBaseArea: 16, productionSmallCostFloor: 0.5, productionDensityGrowthArea: 9, productionMaxDensity: 2,
  // 银行POI固定恢复/用工；当前控制区即安全区，利率按每日百分比。
  bankRestoreCost:25, bankWorkers:1, bankCapacity:100, bankDepositPercent:5, bankLoanPercent:10,
  // 医院一次修复并持续安排人员；失控保留投资与人员，重连不重付。
  hospitalRestoreCost:40, hospitalWorkers:2,
  // 每座三选一；利率加成只在运营时叠加，全局上限与贷款下限同步开放实验。
  bankUpgradeCost:25, bankUpgradeCapacityMultiplier:2, bankUpgradeRatePoints:2, bankLoanMinPercent:2, bankRateMaxPercent:100,
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


// 视觉实验独立应用的白名单；不能借此修改战斗、经济或控制参数。
export const VISUAL_PARAM_KEYS = ['cellMeters', 'mapMaxCellPx', 'obliqueElevationDegrees', 'obliqueProjection', 'obliquePerspectiveFovDegrees', 'freeProjection', 'freePerspectiveFovDegrees', 'keyboardPanSpeedPx', 'returnToTopOnAction', 'streetLightBudget', 'enemyFiguresPerGroup', 'showRenderStats', 'fireNumbersMinCellPx', 'mapMidZoomPercent', 'mapNearZoomPercent', 'controlBorderInnerCells', 'controlBorderOuterCells', 'controlBorderInnerOpacity', 'controlBorderOuterOpacity', 'controlBorderLinePx', 'upgradeFlowHeightMeters', 'upgradeFlowMinPx', 'upgradeFlowCycleMs', 'upgradeFlowOpacity', 'poiMarkerMinSizePx', 'poiMarkerSizePx', 'poiMarkerBorderPx', 'poiMarkerRouteOpacity', 'poiMarkerNightOpacity', 'cloudSpeedMultiplier', 'fogS12', 'fogS23', 'exteriorFogTransitionPercent', 'exteriorFogClearPercent', 'exteriorFogFarOpacity', 'enemyFogFadeCells', 'campWarningPercent', 'nightIdleTransitionMs', 'incomeReportMs', 'resourceHoverMs', 'resourceHoverTolerancePx'];

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
