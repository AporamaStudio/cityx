import test from 'node:test';
import assert from 'node:assert/strict';
import {drawFog,fogTransitionActive} from '../src/fog.js';

// 只记录真实绘制函数生成的遮罩，测试信息遮挡，不测试云纹的具体形状。
class CanvasStub {
  constructor(){this.width=0;this.height=0;this.ctx={
    globalCompositeOperation:'source-over',save(){},restore(){},setTransform(){},clearRect(){},beginPath(){},rect(){},clip(){},fillRect(){},
    createRadialGradient(){return {addColorStop(){}};},
    createImageData(w,h){return {data:new Uint8ClampedArray(w*h*4)};},
    putImageData(pixels){this.pixels=pixels;},
    drawImage(image,...rect){if(this.globalCompositeOperation==='destination-in')this.mask=image;else this.last={image,rect};},
  };}
  getContext(){return this.ctx;}
}
globalThis.document={createElement:()=>new CanvasStub()};
const size=12,id=(x,y)=>y*size+x;
function block(set,left,top,right,bottom){for(let y=top;y<=bottom;y++)for(let x=left;x<=right;x++)set.add(id(x,y));}
function render(seen,explored,time,night=0){
  const ctx=new CanvasStub().ctx;drawFog(ctx,size,seen,explored,night,time);
  const {image,rect:[left,top,width,height]}=ctx.last,mask=image.ctx.mask;
  return (x,y)=>{
    const px=Math.floor((x-left)/width*mask.width),py=Math.floor((y-top)/height*mask.height);
    return mask.ctx.pixels.data[(py*mask.width+px)*4+3];
  };
}
test('厚云始终遮住未知区，云纹时间与昼夜颜色不改变遮罩',()=>{
  const seen=new Set(),explored=new Set();block(seen,3,3,8,8);block(explored,3,3,8,8);
  for(const [time,night] of [[10,0],[30,.5],[60,1]]){
    const alpha=render(seen,explored,time,night);
    assert.equal(alpha(11.5,11.5),255);assert.equal(alpha(.5,.5),255);assert.equal(alpha(5.5,5.5),0);
  }
});
test('新探索短暂退雾，撤回视野立即恢复薄雾且保留地形记忆',()=>{
  const seen=new Set(),explored=new Set();render(seen,explored,100);
  block(seen,3,3,8,8);block(explored,3,3,8,8);
  assert.equal(render(seen,explored,101)(5.5,5.5),255);assert.ok(fogTransitionActive());
  assert.equal(render(seen,explored,101.4)(5.5,5.5),0);assert.equal(fogTransitionActive(),false);
  seen.clear();const alpha=render(seen,explored,102);
  assert.equal(alpha(5.5,5.5),153);assert.equal(alpha(11.5,11.5),255);assert.ok(explored.has(id(5,5)));
});
test('减少动态效果在退雾途中启用时立即完成，重开不沿用旧探索遮罩',()=>{
  const seen=new Set(),explored=new Set();render(seen,explored,200);
  block(seen,3,3,8,8);block(explored,3,3,8,8);render(seen,explored,201);
  assert.equal(render(seen,explored,0)(5.5,5.5),0);assert.equal(fogTransitionActive(),false);
  assert.equal(render(new Set(),new Set(),202)(5.5,5.5),255);
});
