// 地图实际重绘次数与CPU绘制耗时分开统计；不把1000/绘制耗时当作实测FPS。
export function createRenderMeter(){
  let samples=[],lastReport=-Infinity;
  return {reset(){samples=[];lastReport=-Infinity;},push(now,draw,total,continuous=false){
    samples.push({now,draw,total,continuous});samples=samples.filter(sample=>now-sample.now<=2000);
    if(now-lastReport<1000||samples.length<2)return null;
    const count=samples.length,span=now-samples[0].now;if(span<1000)return null;
    lastReport=now;const fps=(count-1)*1000/span;
    const drawMs=samples.reduce((sum,sample)=>sum+sample.draw,0)/count,cpuMs=samples.reduce((sum,sample)=>sum+sample.total,0)/count;
    // 空闲20Hz云纹不判掉帧；连续交互时才把地图重绘率纳入负载估计。
    const active=samples.filter(sample=>sample.continuous),activeSpan=active.length>1?active.at(-1).now-active[0].now:0;
    const activeFps=activeSpan>500&&active.length>=count*.8?(active.length-1)*1000/activeSpan:null;
    const load=cpuMs>=1000/60||activeFps!==null&&activeFps<30?'high':cpuMs>=1000/120||activeFps!==null&&activeFps<50?'medium':'low';
    return {drawMs,cpuMs,fps,load};
  }};
}
