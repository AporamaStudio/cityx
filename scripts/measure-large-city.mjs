import {performance} from 'node:perf_hooks';
import {readFile} from 'node:fs/promises';
import {cpus,platform,arch} from 'node:os';
// 每次进程只测一张尺寸，保证所有模块与真实主游戏共用一致的格号。
const size=Number(process.argv[2]??256);
if(![60,128,256].includes(size))throw new Error('尺寸请选择60、128或256');
globalThis.location={search:`?width=${size}&height=${size}`};
const {DEFAULTS}=await import('../src/config.js');
const {MAP_DEFAULTS}=await import('../src/map-settings.js');
const {generateCityMap}=await import('../src/city-map.js');
const {CITY_LANDMARKS}=await import('../src/city-landmarks.js');
const {createCampaign,rawControlMask,controlMask,visionField,productionSite,routeTimingReport}=await import('../src/model.js');
const {createVisibility}=await import('../src/visibility.js');
const settings={...MAP_DEFAULTS,width:size,height:size};
const time=fn=>{const start=performance.now(),value=fn();return {ms:performance.now()-start,value};};
const sample=(fn,n=7)=>{fn();const values=Array.from({length:n},()=>time(fn).ms).sort((a,b)=>a-b);return {medianMs:values[Math.floor(n/2)],p95Ms:values[Math.ceil(n*.95)-1],samples:n};};
let map,state;
const generation=sample(()=>{map=generateCityMap(settings);});
const campaign=sample(()=>{state=createCampaign(DEFAULTS,undefined,map);});
const raw=rawControlMask(state),controlled=controlMask(state),sight=visionField(state);
const control=sample(()=>controlMask(state));
const lookup=sample(()=>{for(let i=0;i<100000;i++)productionSite(i%(size*size),state);});
const scan=sample(()=>{for(let i=0;i<100000;i++){const id=i%(size*size),x=id%size,y=Math.floor(id/size);state.sites.find(p=>x>=p.x&&x<p.x+p.width&&y>=p.y&&y<p.y+p.height);}},3);
globalThis.gc?.();const before=process.memoryUsage();
const visibility=time(()=>createVisibility(size,controlled,sight,DEFAULTS.fogS12,DEFAULTS.fogS23,DEFAULTS.enemyFogFadeCells,DEFAULTS));
globalThis.gc?.();const after=process.memoryUsage(),field=visibility.value,pixels=field.n**2;
const routes=routeTimingReport(state),assets=[];
for(const spec of CITY_LANDMARKS){
  const bytes=await readFile(new URL(`../assets/model-preview/${spec.file}.glb`,import.meta.url)),doc=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString());
  let triangles=0,primitives=0,geometryBytes=0;const buffers=new Set();
  for(const node of doc.nodes)if(node.mesh!==undefined)for(const primitive of doc.meshes[node.mesh].primitives){
    primitives++;triangles+=doc.accessors[primitive.indices??primitive.attributes.POSITION].count/3;
    for(const accessor of [...Object.values(primitive.attributes),...(primitive.indices===undefined?[]:[primitive.indices])])buffers.add(doc.accessors[accessor].bufferView);
  }
  for(const view of buffers)geometryBytes+=doc.bufferViews[view].byteLength;
  assets.push({id:spec.id,bytes:bytes.length,triangles,primitives,geometryBytes});
}
console.log(JSON.stringify({environment:{node:process.version,platform:platform(),arch:arch(),cpu:cpus()[0]?.model},size,seed:settings.seed,blocks:map.blocks.length,buildings:map.buildings.length,landmarks:map.stats.landmarks,
  timings:{generation,campaign,control,lookup100k:lookup,scan100k:scan,visibilityColdMs:visibility.ms},
  memory:{nodeRss:after.rss,nodeArrayBuffersDelta:after.arrayBuffers-before.arrayBuffers,fogRasterSize:field.n,pixels,
    // 3个距离场+2个密度场+flags；Canvas/纹理是字节量估算，不是浏览器/GPU内存采样。
    visibilityArrayBytes:field.arrayBytes,fogWorldRasterSize:field.span*4,fogWindowSteadyFloatBytesPerPixel:8,fogWindowTransitionFloatBytesPerPixel:24,fogCanvasesRGBABytesPerPixel:16},
  routes:{deadline:routes.nightTicks,totalGroups:routes.total,lateGroups:routes.late,unreachable:routes.unreachable,farthest:routes.farthest,firstNight:routes.nights[0]},assets,
  assetTotals:assets.reduce((sum,p)=>Object.fromEntries(Object.keys(sum).map(k=>[k,sum[k]+p[k]])),{bytes:0,triangles:0,primitives:0,geometryBytes:0})},null,2));
