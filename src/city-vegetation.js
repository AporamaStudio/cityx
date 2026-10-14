// 植被只描述原生空地的街景，不写入阻挡、探索、经济或战斗状态。
export const PLANT_MODELS={broad:'tree-broad',column:'tree-column',young:'tree-young',round:'bush-round',wild:'bush-wild',dead:'tree-dead'};
const widths={broad:6.6,column:3.6,young:2.9,round:2.7,wild:2.2,dead:3.2};
// 城内、公园与郊野共用同树种米制树冠；整体等比缩放，避免幼树在外围被拉成巨树。
export const plantWidthMeters=(asset,variation)=>widths[asset]*(.85+(variation%16)/100);
const seed=(id,index)=>(Math.imul(id+31,1664525)^Math.imul(index+7,1013904223))>>>0;

export function emptyLandPlants(plots,{width,cellMeters,visible,occupied}){
  const plants=[];if(cellMeters<8)return plants;
  for(const p of plots){
    // 清理废墟后的空地不凭空长出成年树；原生空地建成后植被消失。
    if(p.kind!=='open'||p.role==='camp'||p.status!=='empty')continue;
    const step=12/cellMeters,inset=4.5/cellMeters;
    let index=0;
    for(let y=p.y+inset;y<p.y+p.h-inset;y+=step)for(let x=p.x+inset;x<p.x+p.w-inset;x+=step){
      const random=seed(p.id,index++),edge=Math.min(x-p.x,p.x+p.w-x,y-p.y,p.y+p.h-y)*cellMeters;
      if(random%5===0||edge>15&&random%4!==0)continue;
      const kinds=edge>15?['round','wild','wild']:['broad','column','young','round','wild','young','round','dead'];
      const asset=kinds[random%kinds.length],w=plantWidthMeters(asset,random)/cellMeters,r=w/Math.SQRT2;
      const px=x+((random>>>8)%101/100-.5)*3/cellMeters,py=y+((random>>>16)%101/100-.5)*3/cellMeters;
      if(px-r<p.x+.04||px+r>p.x+p.w-.04||py-r<p.y+.04||py+r>p.y+p.h-.04)continue;
      // 用旋转后包围盒的外接圆保守留边，枝干/偏心树冠也不跨入未知格。
      let allowed=true;
      for(let cy=Math.floor(py-r);cy<=Math.floor(py+r);cy++)for(let cx=Math.floor(px-r);cx<=Math.floor(px+r);cx++){
        const id=cy*width+cx;if(!visible(id)||occupied.has(id))allowed=false;
      }
      if(allowed)plants.push({id:`plant:${p.id}:${index}`,plot:p.id,asset,x:px,y:py,w,angle:(random%628)/100});
    }
  }
  return plants;
}
