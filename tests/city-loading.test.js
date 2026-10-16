import test from 'node:test';
import assert from 'node:assert/strict';
import {createCityLoading} from '../src/city-loading.js';

function loadingView(){
  const label={},bar={value:0,hidden:false},detail={},panel={hidden:false,role:'status',querySelector:name=>name==='progress'?bar:name==='[data-loading-label]'?label:detail,setAttribute(name,value){this[name]=value;}};
  const viewport={dataset:{cityState:'loading'},querySelector:()=>panel,setAttribute(name,value){this[name]=value;}};
  return {viewport,panel,label,bar,detail,loading:createCityLoading(viewport)};
}
test('模型进度不提前展示城市，完整首帧成功后才解除加载遮罩',()=>{
  const {loading,viewport,panel,label,bar,detail}=loadingView();
  loading.progress(5,10);assert.equal(bar.value,45);assert.equal(detail.textContent,'5 / 10');assert.equal(loading.isShown(),false);
  loading.progress(10,10);loading.prepare();assert.equal(bar.value,95);assert.equal(label.textContent,'准备3D场景');assert.equal(panel.hidden,false);
  loading.reveal();assert.equal(loading.isShown(),true);assert.equal(viewport.dataset.cityState,'ready');assert.equal(viewport['aria-busy'],'false');assert.equal(panel.hidden,true);
  loading.progress(1,10);assert.equal(bar.value,95);
});
test('模型或首帧错误保留失败提示，迟到的进度和成功回调不能恢复旧城市',()=>{
  const errorLog=console.error;console.error=()=>{};
  try{
    for(const afterFirstFrame of [false,true]){
      const {loading,viewport,panel,label,bar}=loadingView();if(afterFirstFrame)loading.reveal();
      loading.fail(new Error('asset / context failure'));loading.progress(10,10);loading.prepare();loading.reveal();
      assert.equal(loading.isShown(),false);assert.equal(loading.isFailed(),true);assert.equal(viewport.dataset.cityState,'failed');assert.equal(panel.hidden,false);assert.equal(panel.role,'alert');assert.equal(label.textContent,'3D场景加载失败');assert.equal(bar.hidden,true);
    }
  }finally{console.error=errorLog;}
});
