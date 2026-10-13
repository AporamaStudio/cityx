// 人物只是原敌群的视觉成员，不新增寻路、碰撞或逐人伤害；形成稳定的疏密队形。
export function zombieFigureCount(item,base=8,budget=32){
  const groups=Math.max(1,item.members??1),health=Math.max(0,Math.min(1,item.health??1));
  return Math.min(budget,Math.max(1,Math.ceil(base*(1+(groups-1)*.65)*(.4+.6*health))));
}
export function zombieFigurePose(index,seed,time,moving=true){
  const noise=n=>{const v=Math.sin((seed+1)*12.9898+(n+1)*78.233)*43758.5453;return v-Math.floor(v);};
  const phase=noise(index+30)*Math.PI*2,stride=moving?Math.sin(time*7.5+phase):0;
  const row=Math.floor(index/4),column=index%4;
  return {x:(column-1.5)*1.2+(noise(index*3)-.5)*.5,z:(row-1.5)*1.15+(noise(index*3+1)-.5)*.5,
    height:1.65+noise(index*3+2)*.25,phase,stride,sway:Math.sin(time*(moving?3.8:1.4)+phase)*.045,variant:Math.floor(noise(index+70)*4)};
}
