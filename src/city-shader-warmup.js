// 只预编译当前场景的夜间组合，不渲染、不改变灯光强度或游戏状态。
export function createNightShaderWarmup(renderer,scene,{schedule=callback=>setTimeout(()=>{if(globalThis.requestIdleCallback)globalThis.requestIdleCallback(callback);else callback();},80),enabled=()=>true,onError=error=>console.warn('夜间材质预热未完成，沿用正常绘制。',error)}={}){
  let completed=null,pending=null,running=null,scheduled=false;
  const releases=[];
  function enqueue(){if(!scheduled&&!running&&pending){scheduled=true;schedule(run);}}
  function flush(){for(const release of releases.splice(0))release();}
  function run(){
    scheduled=false;if(!pending)return;if(!enabled()){pending=null;return;}
    const job=pending;pending=null;running=job.key;
    const visibility=job.lights.map(light=>light.visible);let compilation;
    try{
      job.lights.forEach(light=>{light.visible=true;});
      compilation=renderer.compileAsync(job.root,job.camera,scene);
    }catch(error){compilation=Promise.reject(error);}
    finally{job.lights.forEach((light,index)=>{light.visible=visibility[index];});}
    // compileAsync轮询期间材质仍须存活；建拆立即移走实体，资源释放等预热完成。
    Promise.resolve(compilation).then(()=>{completed=job.key;},error=>{completed=job.key;onError(error);}).finally(()=>{
      running=null;flush();enqueue();
    });
  }
  return {
    request(key,root,camera,lights){
      if(key===completed||key===running){pending=null;return;}
      if(key===pending?.key)return;
      pending={key,root,camera,lights:[...lights]};enqueue();
    },
    release(dispose){if(running!==null)releases.push(dispose);else dispose();},
  };
}
