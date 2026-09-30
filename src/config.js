// 首轮实验参数；只用于快速试玩，不代表平衡结论。
export const SIZE = 30;
export const DEFAULTS = {
  productionCost: 10, productionIncome: 8,
  budget: 100, wallCost: 2, controlRadius: 9, campHP: 30, stepMs: 450,
  outpostCost: 25, outpostHP: 10, outpostRadius: 6, repairCost: 1, campRepairCost: 1,
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


// 三晚固定实验；每晚独立计拍，不随机刷新源头。
export const WAVES = [
  [{x:5,y:3,hp:6,count:3,first:1,interval:12}, {x:25,y:3,hp:6,count:3,first:7,interval:12}],
  [{x:5,y:3,hp:8,count:3,first:1,interval:12}, {x:25,y:3,hp:8,count:3,first:7,interval:12}, {x:15,y:1,hp:8,count:2,first:13,interval:12}],
  [{x:5,y:3,hp:8,count:3,first:1,interval:12}, {x:25,y:3,hp:8,count:3,first:1,interval:12}, {x:15,y:1,hp:12,count:3,first:9,interval:12}],
];

// 两处起步地点，西侧两处、东侧三处扩张机会；不阻挡通行。
export const PRODUCTION_SITES = [[11,24],[19,26],[3,17],[3,21],[26,16],[27,20],[27,23]];
