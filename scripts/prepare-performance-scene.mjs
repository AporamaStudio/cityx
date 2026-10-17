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
observe=observe.replace('let camera=orthographic;',"let camera=orthographic;let perfGroups={};const perfProfile=new URLSearchParams(location.search).get('benchGroups')==='1';");
observe=observe.replace('for(const object of [floor,...objects]){bind(object);',`for(const [groupIndex,object] of [floor,...objects].entries()){if(perfProfile)object.traverse(node=>{if(!node.isMesh)return;const key=['floor','railway','exterior','nature','unknown','buildings','facilities','streets','roads'][groupIndex];node.onAfterRender=()=>{const row=perfGroups[key]??={draw:0,shadow:0};row.draw++;};node.onAfterShadow=()=>{const row=perfGroups[key]??={draw:0,shadow:0};row.shadow++;};});bind(object);`);
observe=observe.replace('enemies.visible=false;renderer.setClearColor(background,1);renderer.render(scene,camera);',`enemies.visible=false;renderer.setClearColor(background,1);perfGroups={};renderer.render(scene,camera);document.body.dataset.performanceGroups=JSON.stringify(perfGroups);`);
await writeFile(resolve(directory,'src/city-observation.js'),observe);
let source=await readFile(resolve(directory,'src/app.js'),'utf8');
source+=`
// 本地性能对照：计数真实paintMap帧，不使用1000/CPU耗时推算FPS。
const perfArgs=new URLSearchParams(location.search),perfOutput=document.createElement('pre'),perfButton=document.createElement('button');
perfOutput.id='performanceOutput';perfButton.id='performanceRun';perfButton.textContent='运行旋转性能对照';
Object.assign(perfOutput.style,{position:'fixed',left:'12px',bottom:'112px',zIndex:2000,background:'#fff',color:'#111',maxHeight:'300px',maxWidth:'700px',overflow:'auto',fontSize:'11px'});
Object.assign(perfButton.style,{position:'fixed',left:'12px',bottom:'80px',zIndex:2000});const perfDetails=document.createElement('details'),perfSummary=document.createElement('summary');perfSummary.textContent='性能结果';Object.assign(perfDetails.style,{position:'fixed',left:'12px',bottom:'114px',zIndex:2000});perfDetails.append(perfSummary,perfOutput);document.body.append(perfButton,perfDetails);
let perfRun=null,perfLastStats=null;const originalPaintMap=paintMap,originalRecordRenderStats=recordRenderStats;recordRenderStats=function(cpu,stats,total){perfLastStats=stats;return originalRecordRenderStats(cpu,stats,total);};
paintMap=function(){const start=performance.now(),result=originalPaintMap();if(perfRun){const frame={at:performance.now(),cpu:performance.now()-start};perfRun.allFrames.push(frame);if(perfRun.waitReady&&!perfRun.readyAt&&city3D.isPrepared()){perfRun.readyAt=performance.now();perfRun.measureAt=perfRun.readyAt+3000;}if(performance.now()>=perfRun.measureAt)perfRun.frames.push(frame);}return result;};
const timings={};
for(const key of ['render','renderFacilities','observationFrame']){const original=city3D[key];city3D[key]=function(...args){const start=performance.now(),result=original.apply(this,args);if(perfRun&&performance.now()>=perfRun.measureAt)(timings[key]??=[]).push(performance.now()-start);return result;};}
perfButton.onclick=()=>{
  if(!cityLoading.isShown())return;perfButton.disabled=true;setViewMode('free');viewYaw=Math.PI/4;viewElevation=Math.PI/4;
  const area=perfArgs.get('benchArea')??'camp',whole=area==='whole',civic=area==='civic',anchor=civic?[SIZE/2,SIZE/2+10]:whole?[SIZE/2-.5,SIZE/2+10]:xy(state.camp),cell=Number(perfArgs.get('benchCell')??18);
  zoom=whole?1:cell/base;panX=width/2-(anchor[0]+.5)*base*zoom;panY=height/2-(anchor[1]-10)*base*zoom;
  $('showFog').checked=perfArgs.get('benchFog')!=='0';update();
  for(const key of Object.keys(timings))delete timings[key];
  const started=performance.now(),waitReady=perfArgs.get('benchWaitReady')==='1';perfRun={measureAt:waitReady?Infinity:started+3000,waitReady,frames:[],allFrames:[]};let last=started;
  const tick=now=>{
    rotateView((now-last)*.6/1000,0);last=now;
    if((perfRun.waitReady?performance.now()<perfRun.measureAt+12000:now-started<15000)&&performance.now()-started<90000){requestAnimationFrame(tick);return;}
    const frames=perfRun.frames,intervals=frames.slice(1).map((f,i)=>f.at-frames[i].at).sort((a,b)=>a-b),summary=values=>({mean:values.length?values.reduce((s,n)=>s+n,0)/values.length:null,p95:[...values].sort((a,b)=>a-b)[Math.ceil(values.length*.95)-1]});
    const result={size:SIZE,area,fog:$('showFog').checked,width,height,cell:base*zoom,firstFrameMs:perfRun.allFrames[0]?.at-started,readyMs:perfRun.readyAt?perfRun.readyAt-started:null,maxDrawMs:Math.max(...perfRun.allFrames.map(f=>f.cpu)),frames:frames.length,fps:frames.length>1?(frames.length-1)*1000/(frames.at(-1).at-frames[0].at):null,intervalMs:summary(intervals),cpuMs:summary(frames.map(f=>f.cpu)),sections:Object.fromEntries(Object.entries(timings).map(([k,v])=>[k,summary(v)])),groups:JSON.parse(document.body.dataset.performanceGroups??'{}'),resources:city3D.resourceStats?.(),rawStats:perfLastStats,stats:$('renderStats').title};
    perfOutput.textContent=JSON.stringify(result,null,2);perfRun=null;perfButton.disabled=false;
  };requestAnimationFrame(tick);
};
`;
await writeFile(resolve(directory,'src/app.js'),source);
console.log(directory);
