// 建设后合并最新布局，每次空闲只提交一小批；异步等待期间不占住显示循环。
export function createNightShaderWarmup(renderer,scene,{prepare=(root,camera)=>({batches:[{root,scene}]}),schedule=callback=>setTimeout(()=>{if(globalThis.requestIdleCallback)globalThis.requestIdleCallback(callback,{timeout:250});else callback();},16),enabled=()=>true,onReady=()=>{},onError=error=>console.warn('夜景材质准备未完成。',error)}={}){
  let completed=null,pending=null,running=null,scheduled=false,version=0;
  const releases=[];
  function flush(){for(const release of releases.splice(0))release();}
  function enqueue(){if(!scheduled&&!running?.waiting&&(pending||running)){scheduled=true;schedule(run);}}
  function finish(){const job=running;running=null;job.work.complete?.();completed=job.key;flush();onReady(job.key);enqueue();}
  function run(){
    scheduled=false;if(running?.waiting)return;
    if(!enabled()){enqueue();return;}
    if(pending){
      const job=pending;pending=null;
      try{running={...job,version,index:0,waiting:false,work:prepare(job.root,job.camera,job.lights,scene)};}
      catch(error){running=null;completed=job.key;flush();onError(error);enqueue();return;}
    }
    if(!running)return;
    if(running.index===running.work.batches.length){finish();return;}
    const job=running,batch=job.work.batches[job.index++];job.waiting=true;
    let compilation;
    try{
      compilation=renderer.compileAsync(batch.root,job.camera,batch.scene??scene);
    }catch(error){compilation=Promise.reject(error);}
    Promise.resolve(compilation).then(()=>batch.complete?.(),onError).finally(()=>{
      job.waiting=false;
      if(job.version!==version){if(running===job)running=null;}
      flush();enqueue();
    });
  }
  return {
    request(key,root,camera,lights){
      if(key===completed||key===running?.key&&running.version===version){pending=null;return;}
      if(key===pending?.key)return;
      pending={key,root,camera,lights:[...lights]};enqueue();
    },
    reset(){version++;completed=pending=null;if(!running?.waiting)running=null;},
    release(dispose){if(running?.waiting)releases.push(dispose);else dispose();},
  };
}
