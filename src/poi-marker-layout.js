// 三种视角按目标位置的实际格宽缩放，沿现有远/中/近门槛平滑过渡。
export function poiMarkerSize(cell,base,params){
  const min=params.poiMarkerMinSizePx,max=params.poiMarkerSizePx,mid=(min+max)/2,percent=cell/base*100,start=Math.min(100,params.mapMidZoomPercent*.625);
  const t=(value,a,b)=>Math.max(0,Math.min(1,(value-a)/Math.max(1,b-a)));
  return percent<=params.mapMidZoomPercent?min+(mid-min)*t(percent,start,params.mapMidZoomPercent):mid+(max-mid)*t(percent,params.mapMidZoomPercent,params.mapNearZoomPercent);
}
