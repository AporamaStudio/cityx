// 镜头以实际格子像素限制缩放；固定底栏在画布外，默认不占用可操作地图。
export const CAMERA_BORDER=3;
export function cameraScale(width,height,size,bottom=0){
  return Math.max(1,Math.min((width-48)/(size+CAMERA_BORDER*2),(Math.max(1,height-bottom)-48)/(size+CAMERA_BORDER*2)));
}
export function limitZoom(zoom,base,maxCellPx=128){return Math.max(1,Math.min(Math.max(1,maxCellPx/base),zoom));}
export function limitPan(x,y,width,height,size,cell,bottom=0){
  const axis=(pan,extent)=>{
    if((size+CAMERA_BORDER*2)*cell<=extent-48)return (extent-size*cell)/2;
    return Math.max(extent-24-(size+CAMERA_BORDER)*cell,Math.min(24+CAMERA_BORDER*cell,pan));
  };
  return {x:axis(x,width),y:axis(y,Math.max(1,height-bottom))};
}
