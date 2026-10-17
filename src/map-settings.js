// 布局参数与战斗数值分开；预览通过 URL 显式传给主游戏，不写存档。
export const MAP_DEFAULTS={seed:'cityx-01',width:256,height:256,mainRoadWidth:2,minBlock:2,maxBlock:5,special:false,specialMin:10,specialMax:30,touching:false,starterPlot:true,hospital:true,bankCount:2,nature:true};
export function readMapSettings(search=''){
  const query=new URLSearchParams(search),settings={...MAP_DEFAULTS};
  for(const name of Object.keys(settings))if(query.has(name))settings[name]=typeof settings[name]==='boolean'?query.get(name)==='true':typeof settings[name]==='number'?Number(query.get(name)):query.get(name);
  return settings;
}
export const mapSearch=settings=>new URLSearchParams(Object.entries(settings).map(([name,value])=>[name,String(value)])).toString();

// 单局仍使用统一方形坐标；保留旧60格对照，避免矩形预览被静默裁成另一张图。
export function battleMapSize(settings){
  if(settings.width!==settings.height||![60,256].includes(settings.width))throw new Error('试玩地图支持60×60或256×256；其他尺寸请用布局预览。');
  return settings.width;
}
