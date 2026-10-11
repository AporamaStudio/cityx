import test from 'node:test';
import assert from 'node:assert/strict';
import {drawFog,fogTransitionActive,cloudStrength} from '../src/fog.js';
import {drawCitySilhouette} from '../src/city-textures.js';

// 记录真实绘制函数生成的静态/动态遮罩，测试信息层级，不测试云纹形状。
class CanvasStub {
  constructor(){this.width=0;this.height=0;this.ctx={
    globalCompositeOperation:'source-over',save(){},restore(){},setTransform(){},translate(){},scale(){},createPattern(){return {};},clearRect(){},beginPath(){},rect(){},clip(){},fillRect(){},
    createRadialGradient(){return {addColorStop(){}};},
    createImageData(w,h){return {data:new Uint8ClampedArray(w*h*4)};},
    putImageData(pixels){this.pixels=pixels;},
    drawImage(image,...rect){if(this.globalCompositeOperation==='destination-in')this.mask=image;else{this.last={image,rect};(this.images??=[]).push(image);}},
  };}
  getContext(){return this.ctx;}
}
globalThis.document={createElement:()=>new CanvasStub()};
const size=32,id=(x,y)=>y*size+x;
function block(set,left,top,right,bottom){for(let y=top;y<=bottom;y++)for(let x=left;x<=right;x++)set.add(id(x,y));}
function render(controlled,explored,time,night=0,cloudTime=time,zoom=2,thin=4,dense=6){
  const ctx=new CanvasStub().ctx;drawFog(ctx,size,controlled,explored,night,time,cloudTime,0,zoom,thin,dense);
  const {image,rect:[left,top,width,height]}=ctx.last,mask=image.ctx.mask,veil=ctx.images[0];
  const pixel=(image,x,y)=>{
    const px=Math.floor((x-left)/width*image.width),py=Math.floor((y-top)/height*image.height);
    return image.ctx.pixels.data[(py*image.width+px)*4+3];
  };
  const alpha=(x,y)=>pixel(mask,x,y);
  alpha.veil=(x,y)=>pixel(veil,x,y);alpha.veilPixels=veil.ctx.pixels.data;
  return alpha;
}
test('控制内清晰、X格内静态薄雾、X+N外浓雾，流动与昼夜不改变密度',()=>{
  const controlled=new Set(),explored=new Set();block(controlled,3,3,8,8);block(explored,3,3,8,8);
  for(const [time,night] of [[10,0],[30,.5],[60,1]]){
    const alpha=render(controlled,explored,time,night);
    assert.equal(alpha(5.5,5.5),0);assert.equal(alpha.veil(5.5,5.5),0);
    assert.equal(alpha(10.5,5.5),0);assert.ok(alpha.veil(10.5,5.5)>0&&alpha.veil(10.5,5.5)<77);
    assert.equal(alpha(25.5,5.5),255);assert.equal(alpha.veil(25.5,5.5),255);
    assert.ok(alpha(14.5,5.5)<alpha(17.5,5.5));assert.ok(alpha.veil(14.5,5.5)<alpha.veil(17.5,5.5));
  }
});
test('控制内立即清晰、外围约0.36秒退雾，失控回雾保留探索记录',()=>{
  const controlled=new Set(),explored=new Set();render(controlled,explored,100);
  block(controlled,3,3,8,8);block(explored,3,3,8,8);
  const opening=render(controlled,explored,101);assert.equal(opening(5.5,5.5),0);assert.equal(opening.veil(5.5,5.5),0);assert.equal(opening(11.5,5.5),255);assert.ok(fogTransitionActive());
  const clear=render(controlled,explored,101.4);assert.equal(clear(5.5,5.5),0);assert.equal(clear.veil(5.5,5.5),0);assert.equal(clear(11.5,5.5),0);assert.equal(fogTransitionActive(),false);
  controlled.clear();const returned=render(controlled,explored,102);
  assert.equal(returned(5.5,5.5),255);assert.equal(returned.veil(5.5,5.5),255);assert.ok(explored.has(id(5,5)));
});
test('减少动态效果途中启用时立即完成，重开不沿用旧边界',()=>{
  const controlled=new Set(),explored=new Set();render(controlled,explored,200);
  block(controlled,3,3,8,8);block(explored,3,3,8,8);render(controlled,explored,201);
  assert.equal(render(controlled,explored,0)(11.5,5.5),0);assert.equal(fogTransitionActive(),false);
  assert.equal(render(new Set(),new Set(),202)(5.5,5.5),255);
});
test('云纹静止时退雾仍按真实时间完成，失控立即回雾',()=>{
  const controlled=new Set(),explored=new Set();render(controlled,explored,300,0,0);
  block(controlled,3,3,8,8);block(explored,3,3,8,8);
  assert.equal(render(controlled,explored,301,0,0)(11.5,5.5),255);
  assert.equal(render(controlled,explored,301.4,0,0)(11.5,5.5),0);
  controlled.clear();assert.equal(render(controlled,explored,302,0,0)(5.5,5.5),255);
});
test('全城缩放保留不透明远雾，只减弱过渡云纹，静态密度与集合不变',()=>{
  const controlled=new Set(),explored=new Set();block(controlled,3,3,8,8);block(explored,2,2,15,15);
  const before=[...explored],normal=render(controlled,explored,400,0,5,2),veil=new Uint8ClampedArray(normal.veilPixels);
  for(const zoom of [1,2,6]){
    const alpha=render(controlled,explored,410,1,100,zoom);
    assert.equal(alpha(25.5,5.5),255);assert.equal(alpha.veil(25.5,5.5),255);
    assert.equal(alpha(5.5,5.5),0);assert.deepEqual(alpha.veilPixels,veil);
  }
  assert.deepEqual([...explored],before);assert.equal(controlled.size,36);
  assert.ok(cloudStrength(1)<cloudStrength(2));assert.ok(cloudStrength(2)<cloudStrength(4));
});
test('整栋受控边缘无雾，距离从控制建筑外缘计算；X/N调参只改视觉宽度',()=>{
  const controlled=new Set(),explored=new Set();block(controlled,3,3,8,8);block(controlled,9,4,12,7);block(explored,3,3,12,8);
  const alpha=render(controlled,explored,500);
  assert.equal(alpha(12.95,5.5),0);assert.equal(alpha.veil(12.95,5.5),0);
  assert.equal(alpha(15.5,5.5),0);assert.ok(alpha.veil(15.5,5.5)<77);
  const before=[...controlled],density=alpha.veil(17.5,5.5),wider=render(controlled,explored,0,0,0,2,8,8);
  assert.ok(wider.veil(17.5,5.5)<density);assert.deepEqual([...controlled],before);
});
test('未知轮廓绘制仅使用体量，不因POI、原用途或敌源HP透露身份',()=>{
  const p={x:2,y:3,width:4,height:3},ctx=new CanvasStub().ctx;
  for(const mix of [0,.5,1]){
    drawCitySilhouette(ctx,p,mix);const image=ctx.last.image;
    for(const extra of [{role:'hospital',special:true},{type:'housing',hp:99},{role:'source',hp:999}]){
      drawCitySilhouette(ctx,{...p,...extra},mix);assert.equal(ctx.last.image,image);
    }
  }
});
