import {SIZE} from './config.js?v=61';

const key=(x,y)=>y*SIZE+x;
// 手写八个推进节点与出兵日期；清掉一个节点绝不重新分配其兵力。
// 地图占地和出兵日期分开维护；运行时通过稳定编号关联。
// x/y 为默认生成锚点比例；面板使用解析后的格坐标。条目可另设 maxHP 覆盖面积抽样。
export const SOURCE_LAYOUT=[
  {width:1,height:1,x:.34,y:.72},
  {width:1,height:1,x:.68,y:.66},
  {width:1,height:2,x:.19,y:.52},
  {width:2,height:1,x:.50,y:.48},
  {width:1,height:3,x:.77,y:.38},
  {width:3,height:1,x:.27,y:.28},
  {width:2,height:2,x:.51,y:.19},
  {width:2,height:2,x:.17,y:.13},
];
// 新出兵安排的起始值；面板生成后可逐项调整。
export const SOURCE_WAVE_DEFAULTS={hp:6,count:3,first:1,interval:12};
export const SOURCE_NIGHT_PLANS=[
  {nights:[1,2,4,6,9,12],hp:6,count:3},
  {nights:[1,3,5,8,11,14],hp:6,count:3},
  {nights:[4,5,7,10,13],hp:9,count:4},
  {nights:[5,7,9,12,15],hp:9,count:4},
  {nights:[7,8,10,13],hp:9,count:4},
  {nights:[8,9,11,14],hp:12,count:5},
  {nights:[10,11,13,15],hp:12,count:5},
  {nights:[12,14,15],hp:15,count:6},
];
export const sourceCells=source=>Array.from({length:source.width*source.height},(_,i)=>key(source.bx+i%source.width,source.by+Math.floor(i/source.width)));
// 出生点固定在据点内部；临街出口只是离开据点的过渡，不开放整栋建筑。
export function sourceDeparture(source){
  let x=source.bx+Math.floor((source.width-1)/2),y=source.by+Math.floor((source.height-1)/2);
  const path=[key(x,y)],edgeX=Math.max(source.bx,Math.min(source.bx+source.width-1,source.x)),edgeY=Math.max(source.by,Math.min(source.by+source.height-1,source.y));
  while(x!==edgeX){x+=Math.sign(edgeX-x);path.push(key(x,y));}
  while(y!==edgeY){y+=Math.sign(edgeY-y);path.push(key(x,y));}
  return [...path,key(source.x,source.y)];
}
// 同一城市的耐久抽样固定；调范围、重试和重开都不会重新掷骰。
export function sourceMaxHP(source,params){
  if(source.maxHP!==undefined)return source.maxHP;
  const area=source.width*source.height,min=area*params.sourceCellHPMin,max=area*params.sourceCellHPMax;
  return min+Math.min(max-min,Math.floor((source.hpRoll??.5)*(max-min+1)));
}
function sourceRoll(seed,index){
  let hash=2166136261;for(const c of `${seed}:${index}:source-hp`){hash^=c.codePointAt(0);hash=Math.imul(hash,16777619);}
  hash^=hash>>>16;hash=Math.imul(hash,0x45d9f3b);hash^=hash>>>16;return (hash>>>0)/4294967296;
}

// 感染核心放进现有街区，出兵口选临街地面；不挖楼、不扩街、不改变道路骨架。
export function generateEnemySources(layout,params,field){
  const used=new Set(),sources=[];
  for(const [index,spec] of SOURCE_LAYOUT.entries()){
    const candidates=[];
    for(const p of layout.blocks){
      if(p.kind!=='building'||p.role||p.special||used.has(p.id))continue;
      const shapes=[[spec.width,spec.height],[spec.height,spec.width]];
      // 极小街区参数下只回退到四种合法形状，不产生额外的矩形种类。
      if(!shapes.some(([w,h])=>w<=p.width&&h<=p.height))shapes.push([1,2],[2,1],[1,1]);
      for(const [width,height] of shapes){
      if(width>p.width||height>p.height)continue;
      for(const [x,y,bx,by] of [
        [p.x-1,p.y,p.x,p.y],[p.x+p.width,p.y,p.x+p.width-width,p.y],
        [p.x,p.y-1,p.x,p.y],[p.x,p.y+p.height,p.x,p.y+p.height-height],
      ]){
        const id=key(x,y),distance=field.distance.get(id);
        if(x<0||y<0||x>=SIZE||y>=SIZE||distance===undefined||layout.tiles[id]==='block')continue;
        // 近段也须主动推进，避免起点炮阵直接拔掉源头。
        if(Math.max(Math.abs(x-layout.camp.x),Math.abs(y-layout.camp.y))<=params.controlRadius+params.weapons.B.range)continue;
        const separation=sources.reduce((penalty,s)=>penalty+Math.max(0,9-Math.hypot(x-s.x,y-s.y))*10,0);
        const score=Math.abs(bx-spec.x*SIZE)+Math.abs(by-spec.y*SIZE)+separation+(spec.width*spec.height-width*height)*100;
        candidates.push({p,x,y,bx,by,width,height,score});
      }
      }
    }
    candidates.sort((a,b)=>a.score-b.score||a.y-b.y||a.x-b.x);
    const chosen=candidates[0];if(!chosen)continue;
    used.add(chosen.p.id);
    sources.push({id:`source-${index+1}`,index,x:chosen.x,y:chosen.y,bx:chosen.bx,by:chosen.by,width:chosen.width,height:chosen.height,hpRoll:sourceRoll(layout.seed,index),...(spec.maxHP===undefined?{}:{maxHP:spec.maxHP}),site:key(chosen.p.x,chosen.p.y),firstNight:SOURCE_NIGHT_PLANS[index].nights[0],nights:[...SOURCE_NIGHT_PLANS[index].nights]});
  }
  const waves=Array.from({length:15},(_,i)=>sources.filter(s=>s.nights.includes(i+1)).map((source,j)=>({
    sourceId:source.id,x:source.x,y:source.y,hp:SOURCE_NIGHT_PLANS[source.index].hp+Math.floor(i/4),count:SOURCE_NIGHT_PLANS[source.index].count,
    first:SOURCE_WAVE_DEFAULTS.first+j*6,interval:SOURCE_WAVE_DEFAULTS.interval,target:-2,
  })));
  return {sources,waves};
}

// 编辑坐标必须是合法建筑内的原位置，不悄悄吸附；出兵口仅在占地相邻地面自动选择。
export function resolveSourceCatalog(rows,layout,field){
  if(!rows.length||rows.length>12)return {error:'地图敌源数量须为 1–12。'};
  const sources=[],ids=new Set(),sites=new Set(),indices=new Set(),usedExits=new Set();
  for(const row of rows){
    const prefix=`敌源 ${row.index+1}：`;
    if(!Number.isInteger(row.index)||row.index<0||typeof row.id!=='string'||!row.id||ids.has(row.id)||indices.has(row.index))return {error:'敌源编号不能重复。'};
    if(!['bx','by','width','height'].every(k=>Number.isInteger(row[k])))return {error:prefix+'坐标与形状须为整数。'};
    if(![[1,1],[1,2],[2,1],[1,3],[3,1],[2,2]].some(([w,h])=>row.width===w&&row.height===h))return {error:prefix+'请选择合法形状。'};
    if(row.maxHP!==undefined&&(!Number.isInteger(row.maxHP)||row.maxHP<1||row.maxHP>9999))return {error:prefix+'HP 须为 1–9999 整数，留空按面积生成。'};
    const block=layout.blocks.find(p=>p.kind==='building'&&!p.role&&!p.special&&row.bx>=p.x&&row.by>=p.y&&row.bx+row.width<=p.x+p.width&&row.by+row.height<=p.y+p.height);
    if(!block)return {error:prefix+'占地须完整位于普通建筑内。'};
    if(sites.has(block.id))return {error:prefix+'这栋建筑已有敌源。'};
    const candidates=[];
    for(let y=row.by;y<row.by+row.height;y++)candidates.push([row.bx-1,y],[row.bx+row.width,y]);
    for(let x=row.bx;x<row.bx+row.width;x++)candidates.push([x,row.by-1],[x,row.by+row.height]);
    const exits=candidates.filter(([x,y])=>x>=0&&y>=0&&x<SIZE&&y<SIZE&&field.distance.has(key(x,y))&&!usedExits.has(key(x,y)));
    exits.sort((a,b)=>field.distance.get(key(...a))-field.distance.get(key(...b))||a[1]-b[1]||a[0]-b[0]);
    const exit=exits.find(([x,y])=>x===row.x&&y===row.y)??exits[0];
    if(!exit)return {error:prefix+'须有独立的临街出兵口，且能通向火光。'};
    ids.add(row.id);indices.add(row.index);sites.add(block.id);usedExits.add(key(...exit));
    sources.push({...row,x:exit[0],y:exit[1],site:key(block.x,block.y),hpRoll:row.hpRoll??sourceRoll(layout.seed,row.index)});
  }
  return {sources,error:''};
}
// 出兵表只存编号与节奏；位置随据点关联，删除地图敌源会清掉它的全部计划。
export function bindSourceWaves(catalog,waves){
  const byId=new Map(catalog.map(s=>[s.id,s]));
  return waves.map(plans=>plans.filter(p=>byId.has(p.sourceId)).map(p=>({...p,x:byId.get(p.sourceId).x,y:byId.get(p.sourceId).y,target:-2})));
}
export function syncSourceSchedule(catalog,waves){
  for(const source of catalog){
    source.nights=waves.flatMap((plans,i)=>plans.some(p=>p.sourceId===source.id)?[i+1]:[]);
    source.firstNight=source.nights[0]??Infinity;
  }
}
