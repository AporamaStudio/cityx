import {SIZE} from './config.js?v=101';
import {key,productionCells,buildingCells,plotContent,streetEdgeAccess,placementError,reservedSources,availableFunds,population,towerBuildCost} from './model.js?v=125';

// 一次状态更新生成一份辅助显示；镜头与悬停变化复用它，不重新跑整图建设校验。
export function createTowerOverlay(state,controlled,movingCells=new Set()){
  const plots=new Map(),cellSites=Array(SIZE*SIZE),candidates=[],eligibleByType=new Map(),visibleByType=new Map();
  const staticState={...state,enemies:[]};let occupied=new Set(),occupancyKey='',wallet=NaN;
  for(const p of state.sites){
    const id=key(p.x,p.y),cells=productionCells(id,state),footprint=buildingCells(state,id),content=plotContent(state,id);
    const taken=footprint.length>0&&footprint.some(cell=>controlled.has(cell));
    const entry={site:p,cells,footprint,content,controlled:taken,towerCells:[],capacity:{used:0,max:Math.max(1,Math.floor(cells.length/3))}};
    plots.set(id,entry);
    for(const cell of cells)cellSites[cell]=entry;
  }
  // 容量标签与占位行共用每栋的一次统计；候选格的完整权限检查仍由模型负责。
  for(const cell of state.towers.keys())if(cellSites[cell]){cellSites[cell].capacity.used++;cellSites[cell].towerCells.push(cell);}
  // 类型图标挑顶行靠中的未架炮格；随布局更新一次，镜头重画不重新排序。
  for(const entry of plots.values()){
    const center=entry.site.x+(entry.site.width??entry.site.size)/2;
    entry.iconCell=null;let best=Infinity;
    for(const cell of entry.footprint){
      if(state.towers.has(cell))continue;
      const x=cell%SIZE,y=Math.floor(cell/SIZE),score=y*SIZE+Math.abs(x+.5-center);
      if(score<best){best=score;entry.iconCell=cell;}
    }
  }
  for(const entry of plots.values()){
    if(!entry.controlled||!['production','housing'].includes(entry.content.type)||entry.capacity.used>=entry.capacity.max)continue;
    for(const cell of entry.footprint)if(!state.towers.has(cell)&&streetEdgeAccess(state,cell))candidates.push(cell);
  }
  const view={plots,cellSites,candidates,updateOccupancy(moving=new Set()){
    const next=new Set([...moving,...(state.phase==='battle'?state.enemies.map(enemy=>enemy.id):[])]),signature=[...next].sort((a,b)=>a-b).join(',');
    const nextWallet=availableFunds(state);
    if(signature!==occupancyKey||wallet!==nextWallet){occupied=next;occupancyKey=signature;wallet=nextWallet;visibleByType.clear();}
  },eligible(type){
    // 建筑资格只算一次；金币/银行信用只比较一次整炮造价，实际点击仍执行完整校验。
    if(!eligibleByType.has(type))eligibleByType.set(type,new Set(candidates.filter(cell=>!placementError(staticState,cell,type,{ignoreFunds:true}))));
    if(!state.params.weapons[type]||wallet+1e-9<towerBuildCost(state,type)){
      if(!visibleByType.has(type))visibleByType.set(type,new Set());return visibleByType.get(type);
    }
    if(!occupied.size)return eligibleByType.get(type);
    if(!visibleByType.has(type))visibleByType.set(type,new Set([...eligibleByType.get(type)].filter(cell=>!occupied.has(cell))));
    return visibleByType.get(type);
  }};
  view.updateOccupancy(movingCells);return view;
}

// 只保留当前一份辅助层；相关状态改变才失效，战斗拍数和敌人HP/位置不重算整城资格。
export function createTowerOverlayCache(){
  let previous=null,signature='',view=null;
  return {get(state,controlled,movingCells=new Set()){
    const next=JSON.stringify([state.sites,state.fixedWalls,state.playerWalls,state.towers,state.outposts,state.plotContents,state.production,state.housing,state.banks,state.params,state.phase,state.day,state.camp,state.hp>0,controlled,state.explored,
      [...(state.enemySources?.values()??[])].map(source=>[source.id,source.site]),reservedSources(state).map(source=>[source.x,source.y]),population(state)],
      (_key,value)=>value instanceof Map||value instanceof Set?[...value]:value);
    if(previous!==state||signature!==next){view=createTowerOverlay(state,controlled,movingCells);previous=state;signature=next;}
    else view.updateOccupancy(movingCells);
    return view;
  }};
}
