// 先划地块与道路，再给出初始内容；战斗中的清理与换建保存在独立运行状态。
export function generateCityMap({seed='cityx',width=30,height=30,mainRoadWidth=2,minBlock=2,maxBlock=5,special=false,specialMin=10,specialMax=30,touching=false,starterPlot=false,hospital=false}={}) {
  for(const [name,value,min,max] of [['width',width,20,240],['height',height,20,240],['mainRoadWidth',mainRoadWidth,2,3],['minBlock',minBlock,2,8],['maxBlock',maxBlock,2,8],['specialMin',specialMin,10,30],['specialMax',specialMax,10,30]]) {
    if(!Number.isInteger(value)||value<min||value>max)throw new Error(`${name} 必须是 ${min}–${max} 的整数`);
  }
  if(minBlock>maxBlock||specialMin>specialMax)throw new Error('最小边长不能超过最大边长');
  if(hospital&&(width<26||height<26))throw new Error('医院地图至少需要 26×26 格');
  seed=String(seed);
  let hash=2166136261;
  for(const c of seed){hash^=c.codePointAt(0);hash=Math.imul(hash,16777619);}
  const random=()=>{hash+=0x6D2B79F5;let t=hash;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;};
  const int=(min,max)=>min+Math.floor(random()*(max-min+1));
  const tiles=Array(width*height).fill('road'),blocks=[],roads=[];
  const paint=(rect,type)=>{for(let y=rect.y;y<rect.y+rect.height;y++)for(let x=rect.x;x<rect.x+rect.width;x++)tiles[y*width+x]=type;};
  const road=(rect,kind)=>roads.push({...rect,kind});
  const addBlock=(rect,kind)=>{
    const block={id:blocks.length,...rect,kind,state:kind==='building'?'ruin':null};
    blocks.push(block);paint(rect,kind==='building'?'block':'open');return block;
  };
  // 分割线就是一格普通街道；街区占满分配的矩形，不留无定义的楼间空地。
  const parcels=rect=>{
    const horizontal=rect.width>=rect.height,length=horizontal?rect.width:rect.height;
    if(rect.width<minBlock||rect.height<minBlock)return;
    if(length<=maxBlock){addBlock(rect,random()<.16?'open':'building');return;}
    const cuts=[];
    for(let cut=minBlock;cut<=length-minBlock-1;cut++){
      const other=length-cut-1;
      // 优先留下 3–4 格的常规边长；这是布局偏好，不承诺精确尺寸比例。
      const score=n=>n===3||n===4?4:n===2||n===5?2:1;
      cuts.push({cut,weight:score(cut)*score(other)});
    }
    if(!cuts.length){
      // 放不下两个完整街区时，边缘剩余条带明确归为道路。
      parcels(horizontal?{...rect,width:maxBlock}:{...rect,height:maxBlock});return;
    }
    let pick=random()*cuts.reduce((sum,c)=>sum+c.weight,0),cut=cuts.at(-1).cut;
    for(const c of cuts){pick-=c.weight;if(pick<0){cut=c.cut;break;}}
    if(horizontal){
      road({x:rect.x+cut,y:rect.y,width:1,height:rect.height},'street');
      parcels({...rect,width:cut});parcels({...rect,x:rect.x+cut+1,width:rect.width-cut-1});
    }else{
      road({x:rect.x,y:rect.y+cut,width:rect.width,height:1},'street');
      parcels({...rect,height:cut});parcels({...rect,y:rect.y+cut+1,height:rect.height-cut-1});
    }
  };
  // 地图边缘也是明确道路；纵向主轴保留两格，实验高速路时改为三格。
  road({x:0,y:0,width,height:1},'street');road({x:0,y:height-1,width,height:1},'street');
  road({x:0,y:1,width:1,height:height-2},'street');road({x:width-1,y:1,width:1,height:height-2},'street');
  // 开局街区先划定完整带状区域，避免事后删整块建筑留下宽马路。
  const cityEnd=starterPlot?height-9:height-1;
  const bands=[];let y=1,specialPlaced=false;
  while(y<cityEnd){
    const remaining=cityEnd-y;let h=Math.min(int(7,10),remaining);
    if(remaining-h<minBlock+2)h=remaining;
    if(special&&!specialPlaced&&(!hospital||y>1)&&width>=specialMin+minBlock+mainRoadWidth+3&&remaining>=specialMin+minBlock+3)h=int(specialMin,Math.min(specialMax,remaining-minBlock-3));
    let spine=Math.floor((width-mainRoadWidth)/2)+int(-2,2);
    if(special&&!specialPlaced&&(!hospital||y>1)&&h>=specialMin)spine=Math.max(spine,specialMin+1);
    if(hospital&&y===1){h=12;spine=Math.max(spine,12);}
    bands.push({y,height:h,spine});
    road({x:spine,y,width:mainRoadWidth,height:h},mainRoadWidth===3?'highway':'main');
    if(hospital&&y===1){
      // 医院是固定目标地块，四周留路；不参与普通区块尺寸与随机特殊设施抽样。
      const b=addBlock({x:1,y:1,width:10,height:12},'building');b.special=true;b.role='hospital';b.name='医院';
      parcels({x:12,y,width:spine-12,height:h});
    }else if(special&&!specialPlaced&&h>=specialMin&&spine-1>=specialMin){
      const w=int(specialMin,Math.min(specialMax,spine-1)),b=addBlock({x:1,y,width:w,height:h},'building');b.special=true;b.name='大型设施';specialPlaced=true;
      parcels({x:w+2,y,width:spine-w-2,height:h});
    }else parcels({x:1,y,width:spine-1,height:h});
    parcels({x:spine+mainRoadWidth,y,width:width-1-spine-mainRoadWidth,height:h});
    y+=h;
    if(y<height-1){road({x:1,y,width:width-2,height:1},'street');y++;}
  }
  // 起终点放在临主路的开放街区内，保证目标可达而不挖穿建筑。
  const reserve=(band,bottom)=>{
    const candidates=blocks.filter(b=>!b.special&&(b.x+b.width===band.spine||b.x===band.spine+mainRoadWidth)&&b.y>=band.y&&b.y<band.y+band.height);
    if(!candidates.length)throw new Error('当前尺寸无法预留目标空场，请减小最小街区边长或扩大地图');
    const block=bottom?candidates.at(-1):candidates[0];
    block.kind='open';block.state=null;block.role=bottom?'camp':'goal';paint(block,'open');
    return {x:block.x+block.width-1,y:bottom?block.y+block.height-1:block.y};
  };
  const camp=reserve(bands.at(-1),true),goal=reserve(bands[0],false);
  // 仅尝试合拢并排建筑间的一格道路；保留各自身份，连通性变差则撤销。
  let joined=0;
  if(touching)for(const a of blocks){
    if(a.kind!=='building'||a.special||a.width>=maxBlock||random()>.5)continue;
    const b=blocks.find(b=>b.kind==='building'&&!b.special&&b.x===a.x+a.width+1&&b.y===a.y&&b.height===a.height);
    if(!b)continue;
    const stripe={x:a.x+a.width,y:a.y,width:1,height:a.height};
    if(Array.from({length:a.height},(_,i)=>tiles[(a.y+i)*width+stripe.x]).some(t=>t!=='road'))continue;
    paint(stripe,'block');
    const d=walkableDistances({width,height,tiles,camp});
    if(tiles.some((t,id)=>t!=='block'&&d[id]<0)){paint(stripe,'road');continue;}
    a.width++;a.joined=true;b.joined=true;joined++;
  }
  // P0 起步保障：地块直接排入两排街区，横向间隔 1 格，小地块短边处最多 2 格。
  if(starterPlot){
    const cx=Math.floor(width/2),top=height-8;
    const oldCamp=blocks.find(b=>b.role==='camp');if(oldCamp)delete oldCamp.role;
    // 填满两侧街区；这里允许教学尺寸例外，但不把剩余空间摊成道路。
    const fillStarterRow=(x,y,w)=>{
      while(w>0){
        const choices=[2,3,4,5].filter(n=>n===w||w-n-1>=2);
        const n=choices[int(0,choices.length-1)];
        addBlock({x,y,width:n,height:3},random()<.16?'open':'building');
        x+=n+1;w-=n+1;
      }
    };
    for(const y of [top,top+4]){
      fillStarterRow(1,y,cx-6);
      fillStarterRow(cx+3,y,width-cx-4);
    }
    const production=addBlock({x:cx-4,y:top+1,width:2,height:2},'building');production.role='starter';
    const largerProduction=addBlock({x:cx-1,y:top,width:3,height:3},'building');largerProduction.role='starterLarge';
    const housing=addBlock({x:cx-4,y:top+5,width:2,height:2},'building');housing.role='starterHousing';
    const plaza=addBlock({x:cx-1,y:top+4,width:3,height:3},'open');plaza.role='camp';plaza.special=true;plaza.name='火光广场';
    camp.x=cx;camp.y=top+5;
    blocks.forEach((b,i)=>b.id=i);
  }
  // 按最终地形记录道路，包含边缘余量，去掉被合拢的道路段。
  const roadKinds=new Map();
  for(const r of roads)if(r.kind!=='street')for(let cy=r.y;cy<r.y+r.height;cy++)for(let cx=r.x;cx<r.x+r.width;cx++)roadKinds.set(cy*width+cx,r.kind);
  roads.length=0;
  for(let cy=0;cy<height;cy++)for(let cx=0;cx<width;cx++)if(tiles[cy*width+cx]==='road')roads.push({x:cx,y:cy,width:1,height:1,kind:roadKinds.get(cy*width+cx)||'street'});
  // 在几何完成后分配原用途，避免改变既有 seed 的街道布局；起步生产点保留。
  for(const b of blocks)if(b.kind==='building')b.ruinType=b.role==='hospital'?'hospital':['starter','starterLarge'].includes(b.role)?'production':b.role==='starterHousing'?'housing':random()<.35?'housing':'production';
  const buildings=blocks.filter(b=>b.kind==='building'),openSpaces=blocks.filter(b=>b.kind==='open');
  const occupied=tiles.filter(t=>t==='block').length;
  return {version:5,seed,width,height,mainRoadWidth,minBlock,maxBlock,special,specialMin,specialMax,touching,starterPlot,hospital,tiles,roads,blocks,buildings,openSpaces,camp,goal,stats:{hospital:buildings.filter(b=>b.role==='hospital').length,special:buildings.filter(b=>b.special&&b.role!=='hospital').length,joined,buildings:buildings.length,openSpaces:openSpaces.length,occupied,coverage:occupied/(width*height)}};
}

// 仅检查生成时的道路和空地连通；运行时通行由 model.js 的地块内容决定。
export function walkableDistances(map,start=map.camp){
  const {width,height,tiles}=map,distances=new Int32Array(width*height).fill(-1);
  const passable=id=>tiles[id]==='road'||tiles[id]==='open';
  const id=start.y*width+start.x;if(!passable(id))return distances;
  const queue=[id];distances[id]=0;
  for(let i=0;i<queue.length;i++){
    const from=queue[i],x=from%width,y=Math.floor(from/width);
    for(const [nx,ny] of [[x-1,y],[x+1,y],[x,y-1],[x,y+1]]){
      if(nx<0||ny<0||nx>=width||ny>=height)continue;
      const next=ny*width+nx;
      if(distances[next]>=0||!passable(next))continue;
      distances[next]=distances[from]+1;queue.push(next);
    }
  }
  return distances;
}
