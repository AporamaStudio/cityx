// 仅确定墙段外观方向；实际阻挡、耐久与通行继续读取游戏的整格规则。
export function wallConnections(id,walls,width,height,axis=''){
  const x=id%width,y=Math.floor(id/width);
  let mask=0;
  for(const [dx,dy,bit] of [[0,-1,1],[1,0,2],[0,1,4],[-1,0,8]]){
    const nx=x+dx,ny=y+dy;if(nx>=0&&ny>=0&&nx<width&&ny<height&&walls.has(ny*width+nx))mask|=bit;
  }
  // 端段延伸至格边；孤立墙横跨道路，而非沿车道竖一块砖。
  if(mask===1||mask===4)return 5;
  if(mask===2||mask===8)return 10;
  return mask||(axis==='h'?5:10);
}
