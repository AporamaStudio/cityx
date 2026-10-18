import {mkdir,readFile,writeFile,symlink,cp} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {resolve} from 'node:path';

// 生成独立的本地对照页；诊断按钮只进入临时副本，不进入玩家页面。
const root=resolve(new URL('..',import.meta.url).pathname),name=process.argv[2]??'working',ref=process.argv[3];
if(!/^[a-z0-9-]+$/.test(name))throw new Error('场景名称只允许小写字母、数字和短横线');
const directory='/tmp/cityx-performance/'+name;await mkdir(directory,{recursive:true});
if(ref){
  const archive=execFileSync('git',['archive',ref,'index.html','style.css','src'],{cwd:root});
  execFileSync('tar',['-xf','-','-C',directory],{input:archive});
}else for(const file of ['index.html','style.css','src'])await cp(resolve(root,file),resolve(directory,file),{recursive:true,force:true});
try{await symlink(resolve(root,'assets'),resolve(directory,'assets'));}catch(error){if(error.code!=='EEXIST')throw error;}
let observe=await readFile(resolve(directory,'src/city-observation.js'),'utf8');
observe=observe.replace('let camera=orthographic;',"let camera=orthographic;window.addEventListener('pagehide',()=>{renderer.dispose();renderer.forceContextLoss();},{once:true});let perfGroups={};const perfProfile=new URLSearchParams(location.search).get('benchGroups')==='1';");
observe=observe.replace('for(const object of [floor,...objects]){bind(object);',`for(const [groupIndex,object] of [floor,...objects].entries()){if(perfProfile)object.traverse(node=>{if(!node.isMesh)return;const key=['floor','railway','exterior','nature','unknown','buildings','facilities','streets','roads'][groupIndex];node.onAfterRender=()=>{const row=perfGroups[key]??={draw:0,shadow:0};row.draw++;};node.onAfterShadow=()=>{const row=perfGroups[key]??={draw:0,shadow:0};row.shadow++;};});bind(object);`);
observe=observe.replace('enemies.visible=false;renderer.setClearColor(background,1);renderer.render(scene,camera);',`enemies.visible=false;renderer.setClearColor(background,1);perfGroups={};renderer.render(scene,camera);document.body.dataset.performanceGroups=JSON.stringify(perfGroups);`);
// GPU查询仅在独立诊断页显式开启；异步取结果，不用finish阻塞绘制。
observe=observe.replace('let camera=orthographic;',`let camera=orthographic;
const perfGL=renderer.getContext(),perfExt=new URLSearchParams(location.search).get('benchGpu')==='1'?perfGL.getExtension('EXT_disjoint_timer_query_webgl2'):null,perfQueries=[],perfGPU=[];let perfGPUFrame=0;
function perfGpuBegin(){
  if(!perfExt||perfGPUFrame++%15)return null;
  for(let i=perfQueries.length-1;i>=0;i--){const entry=perfQueries[i];if(!perfGL.getQueryParameter(entry.query,perfGL.QUERY_RESULT_AVAILABLE))continue;
    if(!perfGL.getParameter(perfExt.GPU_DISJOINT_EXT))perfGPU.push({at:entry.at,ms:perfGL.getQueryParameter(entry.query,perfGL.QUERY_RESULT)/1e6});
    perfGL.deleteQuery(entry.query);perfQueries.splice(i,1);document.body.dataset.performanceGpu=JSON.stringify(perfGPU);
  }
  if(perfQueries.length>=8)return null;
  const entry={query:perfGL.createQuery(),at:performance.now()};perfGL.beginQuery(perfExt.TIME_ELAPSED_EXT,entry.query);return entry;
}
function perfGpuEnd(entry){if(entry){perfGL.endQuery(perfExt.TIME_ELAPSED_EXT);perfQueries.push(entry);}}
`);
observe=observe.replace('perfGroups={};renderer.render(scene,camera);','perfGroups={};const gpuQuery=perfGpuBegin();renderer.render(scene,camera);perfGpuEnd(gpuQuery);');
await writeFile(resolve(directory,'src/city-observation.js'),observe);
const cityFile=resolve(directory,'src/city-3d.js'),citySource=await readFile(cityFile,'utf8');
let inspectCity=citySource.replace('maxTextureSize:renderer.capabilities.maxTextureSize','maxTextureSize:renderer.capabilities.maxTextureSize,gpuTimerAvailable:!!gl.getExtension("EXT_disjoint_timer_query_webgl2")');
inspectCity=inspectCity.replace('      return {cpuGeometryBytes:',`      const fogBindings={},fogProgramCache=new Map();
      if(new URLSearchParams(location.search).get('benchFogInspect')==='1')for(const [name,root] of Object.entries({buildings,streets,unknown,exterior,floor:observation.warmupRoot()})){
        const row=fogBindings[name]={compiled:0,withUniform:0,active:0,withoutUniform:0};
        root.traverse(node=>{if(!node.isMesh)return;const program=renderer.properties.get(node.material).currentProgram;if(!program?.program)return;row.compiled++;
          if(!fogProgramCache.has(program)){const location=gl.getUniformLocation(program.program,'cityObserveActive');fogProgramCache.set(program,location===null?null:gl.getUniform(program.program,location));}
          const active=fogProgramCache.get(program);if(active===null)row.withoutUniform++;else{row.withUniform++;if(active>.5)row.active++;}
        });
      }
      return {fogBindings,cpuGeometryBytes:`);
await writeFile(cityFile,inspectCity);
let source=await readFile(resolve(directory,'src/app.js'),'utf8');
source=source.replace('const mistEnabled=mapFogEnabled(),area=','const mistEnabled=mapFogEnabled()&&perfArgs.get("benchFogRender")!=="0",area=');
const hasFogStats=(await readFile(resolve(directory,'src/fog.js'),'utf8')).includes('export function fogResourceStats');
source=source.replace('    drawFog(m,view.visibility,state.explored,nightMix,fogTime,cloudTime,duskMix,zoom,area);','    const fogAt=performance.now();drawFog(m,view.visibility,state.explored,nightMix,fogTime,cloudTime,duskMix,zoom,area);if(perfRun&&performance.now()>=perfRun.measureAt)(timings.fogDraw??=[]).push(performance.now()-fogAt);');
if(hasFogStats)source=source.replace(/(import \{)([^}]+)(\} from '\.\/fog\.js[^']*';)/,'$1$2,fogResourceStats$3');
source+=`
// 本地性能对照：计数真实paintMap帧，不使用1000/CPU耗时推算FPS。
const perfArgs=new URLSearchParams(location.search),perfOutput=document.createElement('pre'),perfButton=document.createElement('button');
perfOutput.id='performanceOutput';perfButton.id='performanceRun';perfButton.textContent='运行旋转性能对照';
Object.assign(perfOutput.style,{position:'fixed',left:'12px',bottom:'112px',zIndex:2000,background:'#fff',color:'#111',maxHeight:'300px',maxWidth:'700px',overflow:'auto',fontSize:'11px'});
Object.assign(perfButton.style,{position:'fixed',left:'12px',bottom:'80px',zIndex:2000});const perfDetails=document.createElement('details'),perfSummary=document.createElement('summary');perfSummary.textContent='性能结果';Object.assign(perfDetails.style,{position:'fixed',left:'12px',bottom:'114px',zIndex:2000});perfDetails.append(perfSummary,perfOutput);document.body.append(perfButton,perfDetails);
let perfRun=null,perfLastStats=null,perfStress=0,perfPoints=[];const originalPaintMap=paintMap,originalRecordRenderStats=recordRenderStats;recordRenderStats=function(cpu,stats,total){perfLastStats=stats;if(perfRun&&performance.now()>=perfRun.measureAt)(timings.frameTotal??=[]).push(total);return originalRecordRenderStats(cpu,stats,total);};
paintMap=function(){const start=performance.now(),result=originalPaintMap();if(perfRun){const frame={at:performance.now(),cpu:performance.now()-start,calls:perfLastStats?.calls,triangles:perfLastStats?.triangles,figures:perfLastStats?.figures};perfRun.allFrames.push(frame);if(perfRun.waitReady&&!perfRun.readyAt&&city3D.isPrepared()){perfRun.readyAt=performance.now();perfRun.measureAt=perfRun.readyAt+3000;}if(performance.now()>=perfRun.measureAt)perfRun.frames.push(frame);}return result;};
const timings={};
for(const key of ['render','renderFacilities','observationFrame','observationPick']){const original=city3D[key];city3D[key]=function(...args){const start=performance.now();if(key==='renderFacilities'&&perfStress){const fx=args[2];args[0]=[...args[0],...perfPoints.map((p,i)=>({id:'perf-enemy:'+i,asset:'enemy',x:p.x+Math.sin(fx.time+i)*.02,y:p.y,ground:naturalGroundAt(state.layout,p.x,p.y,state.params.cellMeters),cellMeters:state.params.cellMeters,members:1,health:1,moving:true,alpha:1,fogAlpha:1,angle:0}))];}const result=original.apply(this,args);if(perfRun&&performance.now()>=perfRun.measureAt)(timings[key]??=[]).push(performance.now()-start);return result;};}
perfButton.onclick=()=>{
  if(!cityLoading.isShown())return;const buttonAt=performance.now();perfButton.disabled=true;setViewMode(perfArgs.get('benchView')??'free');viewYaw=Math.PI/4;viewElevation=Math.PI/4;
  const area=perfArgs.get('benchArea')??'camp',whole=area==='whole',civic=area==='civic',anchor=civic?[SIZE/2,SIZE/2+10]:whole?[SIZE/2-.5,SIZE/2+10]:xy(state.camp),cell=Number(perfArgs.get('benchCell')??18);
  zoom=whole?1:cell/base;panX=width/2-(anchor[0]+.5)*base*zoom;panY=height/2-(anchor[1]-10)*base*zoom;
  $('showFog').checked=perfArgs.get('benchFog')!=='0';
  if(perfArgs.get('benchExplored')==='1')state.explored=new Set(Array.from({length:SIZE*SIZE},(_,i)=>i));
  if(perfArgs.get('benchNight')==='1'&&state.phase==='build'){
    const tower=Array.from({length:SIZE*SIZE},(_,i)=>i).find(i=>!placementError(state,i));if(tower!==undefined)buildTower(state,tower,'A');update();startNight();paused=true;update();
  }
  if(perfArgs.has('benchPointer')){const rect=canvas.getBoundingClientRect();pointerSample=perfArgs.get('benchPointer')==='1'?{clientX:rect.left+width*.5,clientY:rect.top+height*.65}:null;pointerPending=!!pointerSample;}
  update();perfStress=Math.max(0,Math.min(128,Number(perfArgs.get('benchEnemies')??0)));
  const targetView=cameraView(),cx=(width/2-panX)/(base*zoom),cy=(height/2-panY)/(base*zoom);
  perfPoints=state.layout.tiles.flatMap((type,id)=>{if(type!=='road')return [];const p={x:id%SIZE+.5,y:Math.floor(id/SIZE)+.5},screen=projectView(p.x,p.y,0,targetView);return !screen.hidden&&screen.x>20&&screen.y>20&&screen.x<width-20&&screen.y<height-20?[p]:[];}).sort((a,b)=>Math.hypot(a.x-cx,a.y-cy)-Math.hypot(b.x-cx,b.y-cy)).slice(0,perfStress);
  for(const key of Object.keys(timings))delete timings[key];
  const panOrigin={x:panX,y:panY},started=performance.now(),setupMs=started-buttonAt,waitReady=perfArgs.get('benchWaitReady')==='1';perfRun={measureAt:waitReady?Infinity:started+3000,waitReady,frames:[],allFrames:[],ticks:[]};let last=started;
  const tick=now=>{
    if(performance.now()>=perfRun.measureAt)perfRun.ticks.push(now);
    if(perfArgs.get('benchStill')==='1'){effectTime=0;cloudTime=0;draw();}else if(viewMode==='top'){panX=panOrigin.x+Math.sin((now-started)/1000)*base*zoom;panY=panOrigin.y;draw();}else rotateView((now-last)*.6/1000,0);if(perfArgs.get('benchNight')==='1')effectTime+=(now-last)/1000;last=now;
    if((perfRun.waitReady?performance.now()<perfRun.measureAt+12000:now-started<15000)&&performance.now()-started<90000){requestAnimationFrame(tick);return;}
    const frames=perfRun.frames,intervals=frames.slice(1).map((f,i)=>f.at-frames[i].at).sort((a,b)=>a-b),summary=values=>({mean:values.length?values.reduce((s,n)=>s+n,0)/values.length:null,p95:[...values].sort((a,b)=>a-b)[Math.ceil(values.length*.95)-1]});
    const gpuSamples=JSON.parse(document.body.dataset.performanceGpu??'[]').filter(s=>s.at>=perfRun.measureAt);
    const sampleVisibility=mapDisplay().visibility,sampleBounds=typeof fogRasterBounds==='function'?fogRasterBounds(sampleVisibility,viewBounds(cameraView())):null,fogSamples=[[SIZE/2,SIZE/2],[SIZE/2,SIZE/4]].map(([x,y])=>({x,y,density:sampleVisibility.fogAt(x,y),pixel:observationMist.width>1&&sampleBounds&&x>=sampleBounds.left&&x<sampleBounds.right&&y>=sampleBounds.top&&y<sampleBounds.bottom?[...observationMist.getContext('2d').getImageData(Math.floor((x-sampleBounds.left)*4),Math.floor((y-sampleBounds.top)*4),1,1).data]:null}));
    const result={fogSamples,gpuMainMs:{samples:gpuSamples.length,...summary(gpuSamples.map(s=>s.ms))},fogRendered:$('showFog').checked&&perfArgs.get('benchFogRender')!=='0',pointerInside:!!pointerSample,rafFps:perfRun.ticks.length>1?(perfRun.ticks.length-1)*1000/(perfRun.ticks.at(-1)-perfRun.ticks[0]):null,size:SIZE,area,viewMode,phase:state.phase,explored:perfArgs.get('benchExplored')==='1',layoutBlocks:state.layout.blocks.length,landmarks:state.layout.blocks.filter(p=>p.landmark).length,renderSummary:{calls:summary(frames.map(f=>f.calls)),triangles:summary(frames.map(f=>f.triangles))},stressGroups:perfPoints.length,setupMs,fog:$('showFog').checked,width,height,cell:base*zoom,firstFrameMs:perfRun.allFrames[0]?.at-started,readyMs:perfRun.readyAt?perfRun.readyAt-started:null,maxDrawMs:Math.max(...perfRun.allFrames.map(f=>f.cpu)),frames:frames.length,fps:frames.length>1?(frames.length-1)*1000/(frames.at(-1).at-frames[0].at):null,intervalMs:summary(intervals),cpuMs:summary(frames.map(f=>f.cpu)),sections:Object.fromEntries(Object.entries(timings).map(([k,v])=>[k,summary(v)])),groups:JSON.parse(document.body.dataset.performanceGroups??'{}'),resources:city3D.resourceStats?.(),fogResources:${hasFogStats?'fogResourceStats()':'null'},mistCanvasBytes:observationMist.width*observationMist.height*4,rawStats:perfLastStats,stats:$('renderStats').title};
    perfOutput.textContent=JSON.stringify(result,null,2);perfRun=null;perfButton.disabled=false;
  };requestAnimationFrame(tick);
};
`;
if(process.argv.includes('--matrix')||process.argv.includes('--diagnosis')){
  // 在同一顶层页面逐项导航；启动按钮留在地图外，排除自动悬停射线的额外负载。
  const cases=process.argv.includes('--diagnosis')?[
    {size:256,area:'whole',fog:0,explored:0,gpu:1,pointer:0},
    {size:256,area:'whole',fog:0,explored:0,gpu:1,pointer:1},
    {size:256,area:'whole',fog:1,explored:1,gpu:1,pointer:0},
    {size:256,area:'whole',fog:1,explored:1,gpu:1,pointer:0,fogRender:0},
    {size:128,area:'whole',fog:0,explored:0,gpu:1,pointer:0},
    {size:128,area:'whole',fog:0,explored:0,gpu:1,pointer:1},
  ]:[['camp',1,0],['civic',0,0],['whole',0,0],['whole',1,0],['whole',1,1]].flatMap(([area,fog,explored])=>[60,128,256].map(size=>({size,area,fog,explored})));
  source+=`
const matrixKey='cityx-performance-matrix:'+location.pathname,matrixCases=${JSON.stringify(cases)},matrixButton=document.createElement('button'),matrixStatus=document.createElement('span'),matrixOutput=document.createElement('pre');
  matrixButton.id='matrixRun';matrixButton.textContent=${JSON.stringify(process.argv.includes('--diagnosis')?'运行GPU／拾取／雾对照':'运行60/128/256统一复测')};Object.assign(matrixButton.style,{position:'fixed',right:'12px',top:'0px',zIndex:2000});matrixStatus.id='matrixStatus';Object.assign(matrixStatus.style,{position:'fixed',left:'12px',top:'64px',zIndex:2000,background:'#fff',color:'#111'});matrixOutput.id='matrixOutput';matrixOutput.style.whiteSpace='pre-wrap';perfDetails.append(matrixOutput);document.body.append(matrixButton,matrixStatus);
  const nextCase=state=>{const c=state.cases[state.results.length];location.replace(location.pathname+'?width='+c.size+'&height='+c.size+'&benchArea='+c.area+'&benchFog='+c.fog+'&benchExplored='+c.explored+'&benchWaitReady=1&benchPointer='+(c.pointer??0)+'&benchGpu='+(c.gpu??0)+'&benchFogRender='+(c.fogRender??1)+'&benchFogInspect=1&benchSuite=1');};
  matrixButton.onclick=()=>{const state={sourceRevision:${JSON.stringify(ref??'working')},started:new Date().toISOString(),cases:matrixCases,results:[]};sessionStorage.setItem(matrixKey,JSON.stringify(state));nextCase(state);};
  if(perfArgs.get('benchSuite')==='1'){
    const state=JSON.parse(sessionStorage.getItem(matrixKey));matrixOutput.textContent=JSON.stringify(state,null,2);matrixButton.disabled=true;let clicked=false,finished=false;
    const c=state.cases[state.results.length];matrixStatus.textContent=(state.results.length+1)+' / '+state.cases.length+'：'+c.size+'格 '+c.area+' 雾'+c.fog+' 已探索'+c.explored;
    const timer=setInterval(()=>{
      if(!clicked&&document.querySelector('#viewport').dataset.cityState==='ready'){clicked=true;perfButton.click();}
      if(!finished&&clicked&&perfOutput.textContent&&perfButton.disabled===false){
        finished=true;state.results.push({case:c,...JSON.parse(perfOutput.textContent)});sessionStorage.setItem(matrixKey,JSON.stringify(state));
        if(state.results.length<state.cases.length)nextCase(state);else{clearInterval(timer);matrixStatus.textContent='完成 '+state.results.length+' 项';matrixOutput.textContent=JSON.stringify(state,null,2);matrixButton.disabled=false;}
      }
    },250);
  }
  `;
}
await writeFile(resolve(directory,'src/app.js'),source);
console.log(directory);
