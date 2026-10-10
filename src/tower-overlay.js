import {SIZE} from './config.js?v=62';
import {key,productionCells,buildingCells,plotContent,streetEdgeAccess,placementError} from './model.js?v=74';

// 一次状态更新生成一份辅助显示；镜头与悬停变化复用它，不重新跑整图建设校验。
export function createTowerOverlay(state,controlled,movingCells=new Set()){
  const plots=new Map(),cellSites=Array(SIZE*SIZE),candidates=[],eligibleByType=new Map();
  for(const p of state.sites){
    const id=key(p.x,p.y),cells=productionCells(id,state),footprint=buildingCells(state,id),content=plotContent(state,id);
    const taken=footprint.length>0&&footprint.some(cell=>controlled.has(cell));
    const entry={site:p,cells,footprint,content,controlled:taken,towerCells:[],capacity:{used:0,max:Math.max(1,Math.floor(cells.length/3))}};
    plots.set(id,entry);
    for(const cell of cells)cellSites[cell]=entry;
  }
  // 容量标签与占位行共用每栋的一次统计；候选格的完整权限检查仍由模型负责。
  for(const cell of state.towers.keys())if(cellSites[cell]){cellSites[cell].capacity.used++;cellSites[cell].towerCells.push(cell);}
  for(const entry of plots.values()){
    if(!entry.controlled||!['production','housing'].includes(entry.content.type)||entry.capacity.used>=entry.capacity.max)continue;
    for(const cell of entry.footprint)if(!state.towers.has(cell)&&streetEdgeAccess(state,cell))candidates.push(cell);
  }
  return {plots,cellSites,candidates,eligible(type){
    if(!eligibleByType.has(type))eligibleByType.set(type,new Set(candidates.filter(cell=>!movingCells.has(cell)&&!placementError(state,cell,type))));
    return eligibleByType.get(type);
  }};
}
