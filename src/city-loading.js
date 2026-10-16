// 首帧门闩：资源加载完不等于画面可展示；异常始终留在加载层，不画2D替代城市。
export function createCityLoading(viewport){
  const panel=viewport.querySelector('#cityLoading'),label=panel.querySelector('[data-loading-label]'),bar=panel.querySelector('progress'),detail=panel.querySelector('[data-loading-detail]');
  let shown=false,failed=false;
  function progress(loaded,total){
    if(failed||shown)return;
    bar.value=Math.round(loaded/total*90);detail.textContent=`${loaded} / ${total}`;
  }
  function fail(error){
    if(failed)return;
    failed=true;shown=false;viewport.dataset.cityState='failed';panel.hidden=false;panel.setAttribute('role','alert');
    label.textContent='3D场景加载失败';detail.textContent='请刷新页面重试';bar.hidden=true;viewport.setAttribute('aria-busy','false');
    console.error('3D城市无法展示。',error);
  }
  return {
    progress,fail,
    prepare(){if(failed||shown)return;bar.value=95;label.textContent='准备3D场景';detail.textContent='即将进入城市';},
    reveal(){if(failed||shown)return;shown=true;viewport.dataset.cityState='ready';panel.hidden=true;viewport.setAttribute('aria-busy','false');},
    isShown:()=>shown,isFailed:()=>failed,
  };
}
