// 首轮实验参数；只用于快速试玩，不代表平衡结论。
export const SIZE = 30;
export const DEFAULTS = {
  budget: 100, wallLimit: 20, campHP: 30, stepMs: 450,
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
