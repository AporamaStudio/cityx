import {SIZE} from './config.js?v=61';

const key=(x,y)=>y*SIZE+x;
// 手写八个推进节点与出兵日期；清掉一个节点绝不重新分配其兵力。
export const SOURCE_LAYOUT=[
  {level:1,width:1,height:1,x:.34,y:.72,nights:[1,2,4,6,9,12]},
  {level:1,width:1,height:1,x:.68,y:.66,nights:[1,3,5,8,11,14]},
  {level:2,width:1,height:2,x:.19,y:.52,nights:[4,5,7,10,13]},
  {level:2,width:2,height:1,x:.50,y:.48,nights:[5,7,9,12,15]},
  {level:2,width:1,height:3,x:.77,y:.38,nights:[7,8,10,13]},
  {level:3,width:3,height:1,x:.27,y:.28,nights:[8,9,11,14]},
  {level:3,width:2,height:2,x:.51,y:.19,nights:[10,11,13,15]},
  {level:4,width:2,height:2,x:.17,y:.13,nights:[12,14,15]},
];
export const sourceCells=source=>Array.from({length:source.width*source.height},(_,i)=>key(source.bx+i%source.width,source.by+Math.floor(i/source.width)));
// 同一城市的耐久抽样固定；调范围、重试和重开都不会重新掷骰。
export function sourceMaxHP(source,params){
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
    sources.push({id:`source-${index+1}`,index,level:spec.level,x:chosen.x,y:chosen.y,bx:chosen.bx,by:chosen.by,width:chosen.width,height:chosen.height,hpRoll:sourceRoll(layout.seed,index),site:key(chosen.p.x,chosen.p.y),firstNight:spec.nights[0],nights:[...spec.nights]});
  }
  const waves=Array.from({length:15},(_,i)=>sources.filter(s=>s.nights.includes(i+1)).map((source,j)=>({
    sourceId:source.id,x:source.x,y:source.y,hp:6+(source.level-1)*3+Math.floor(i/4),count:source.level+2,
    first:1+j*6,interval:12,target:-2,
  })));
  return {sources,waves};
}
