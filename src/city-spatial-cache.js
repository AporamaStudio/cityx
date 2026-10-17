// 固定世界分块与镜头无关；只构造访问过的块，旋转不会拆散或重建一整片街景。
export function spatialChunks(lamps,dressing,span=16){
  const chunks=new Map();
  for(const [kind,list] of [['lamps',lamps],['dressing',dressing]])for(const item of list){
    const x=Math.floor(item.x/span)*span,y=Math.floor(item.y/span)*span,key=x+':'+y;
    if(!chunks.has(key))chunks.set(key,{x,y,w:span,h:span,lamps:[],dressing:[]});
    chunks.get(key)[kind].push(item);
  }
  for(const chunk of chunks.values())chunk.signature=JSON.stringify([chunk.lamps,chunk.dressing]);
  return chunks;
}
