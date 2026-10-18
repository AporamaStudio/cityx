import test from 'node:test';
import assert from 'node:assert/strict';
import {drawFog,fogTransitionActive,cloudStrength,fogRasterBounds,fogResourceStats,resetFogResources} from '../src/fog.js';
import {createVisibility} from '../src/visibility.js';

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
function render(controlled,explored,time,night=0,cloudTime=time,zoom=2,s12=3,s23=3,sight=null){
  if(!sight){sight=new Set(controlled);for(const cell of controlled){const cx=cell%size,cy=Math.floor(cell/size);
    for(let y=Math.max(0,cy-4);y<=Math.min(size-1,cy+4);y++)for(let x=Math.max(0,cx-4);x<=Math.min(size-1,cx+4);x++)sight.add(id(x,y));
  }}
  const ctx=new CanvasStub().ctx;drawFog(ctx,createVisibility(size,controlled,sight,s12,s23),explored,night,time,cloudTime,0,zoom);
  const {image,rect:[left,top,width,height]}=ctx.last,mask=image.ctx.mask,veil=ctx.images[0];
  const pixel=(image,x,y)=>{
    const px=Math.floor((x-left)/width*image.width),py=Math.floor((y-top)/height*image.height);
    return image.ctx.pixels.data[(py*image.width+px)*4+3];
  };
  const alpha=(x,y)=>pixel(mask,x,y);
  alpha.veil=(x,y)=>pixel(veil,x,y);alpha.veilPixels=veil.ctx.pixels.data;
  return alpha;
}
test('S0清晰、S1静态薄雾、S12/S23外浓雾，流动与昼夜不改变权限',()=>{
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
  const opening=render(controlled,explored,101);assert.equal(opening(5.5,5.5),0);assert.equal(opening.veil(5.5,5.5),0);assert.equal(opening(11.5,5.5),0);assert.equal(opening(15.5,5.5),255);assert.ok(fogTransitionActive());
  const clear=render(controlled,explored,101.4);assert.equal(clear(5.5,5.5),0);assert.equal(clear.veil(5.5,5.5),0);assert.equal(clear(11.5,5.5),0);assert.ok(clear(15.5,5.5)<255);assert.equal(fogTransitionActive(),false);
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
  assert.equal(render(controlled,explored,301,0,0)(11.5,5.5),0);
  assert.equal(render(controlled,explored,301,0,0)(15.5,5.5),255);
  assert.ok(render(controlled,explored,301.4,0,0)(15.5,5.5)<255);
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
test('整栋受控边缘无雾，距离从控制建筑外缘计算；S12/S23调参只改视觉宽度',()=>{
  const controlled=new Set(),explored=new Set();block(controlled,3,3,8,8);block(controlled,9,4,12,7);block(explored,3,3,12,8);
  const alpha=render(controlled,explored,500);
  assert.equal(alpha(12.95,5.5),0);assert.equal(alpha.veil(12.95,5.5),0);
  assert.equal(alpha(15.5,5.5),0);assert.ok(alpha.veil(15.5,5.5)<77);
  const before=[...controlled],density=alpha.veil(19.5,5.5),wider=render(controlled,explored,0,0,0,2,8,8);
  assert.ok(wider.veil(19.5,5.5)<density);assert.deepEqual([...controlled],before);
});
test('远处实时揭示形成局部S1薄雾，撤回后立即回浓雾且保留探索',()=>{
  const controlled=new Set(),explored=new Set(),sight=new Set();block(controlled,3,3,8,8);block(sight,3,3,8,8);block(sight,24,3,28,7);block(explored,24,3,28,7);
  let alpha=render(controlled,explored,600,0,0,2,3,3,sight);
  assert.equal(alpha(26.5,5.5),0);assert.ok(alpha.veil(26.5,5.5)>0&&alpha.veil(26.5,5.5)<=77);
  sight.clear();block(sight,3,3,8,8);alpha=render(controlled,explored,601,0,0,2,3,3,sight);
  assert.equal(alpha(26.5,5.5),255);assert.equal(alpha.veil(26.5,5.5),255);assert.ok(explored.has(id(26,5)));
});

test('局部雾纹只裁剪绘制窗口，保留4像素精度和原世界遮罩；越界不会生成负尺寸',()=>{
  const visibility=createVisibility(size,new Set([id(10,10)]),new Set([id(10,10)]),3,3),explored=new Set(),ctx=new CanvasStub().ctx;
  drawFog(ctx,visibility,explored,0,800,3,0,2);const fullMask=ctx.last.image.ctx.mask;
  const area={left:8,top:9,right:20,bottom:22},cropped=new CanvasStub().ctx;drawFog(cropped,visibility,explored,0,800,3,0,2,area);
  assert.equal(cropped.last.image.width,48);assert.equal(cropped.last.image.height,52);assert.equal(cropped.last.image.ctx.mask,fullMask);
  assert.deepEqual(cropped.last.rect,[8,9,12,13]);assert.equal(cropped.images[0],ctx.images[0]);
  for(const viewport of [{left:-999,right:-900,top:-999,bottom:-900},{left:900,right:999,top:900,bottom:999},{left:4,right:12,top:6,bottom:15}]){
    const bounds=fogRasterBounds(visibility,viewport);assert.ok(bounds.right>bounds.left&&bounds.bottom>bounds.top);assert.ok(bounds.left>=-visibility.border&&bounds.right<=size+visibility.border);
  }
});

test('退雾期间平移窗口保持重叠像素和原计时，不重启动画；全城窗口不随旋转伸缩',()=>{
  const controlled=new Set(),sight=new Set(),explored=new Set(),a={left:8,top:0,right:24,bottom:20},b={left:12,top:0,right:28,bottom:20};block(controlled,3,3,8,8);block(sight,3,3,12,12);
  const paint=(area,time)=>{const ctx=new CanvasStub().ctx;drawFog(ctx,createVisibility(size,controlled,sight,3,3),explored,0,time,0,0,2,area);return ctx.last.image.ctx.mask.ctx.pixels.data;};
  paint(a,900);block(sight,13,3,15,12);paint(a,901);const first=new Uint8ClampedArray(paint(a,901.1)),second=paint(b,901.1);
  for(let y=2;y<18;y++)for(let x=13;x<23;x++){const ai=((y-a.top)*4*((a.right-a.left)*4)+(x-a.left)*4)*4+3,bi=((y-b.top)*4*((b.right-b.left)*4)+(x-b.left)*4)*4+3;assert.equal(first[ai],second[bi]);}
  paint(b,901.4);assert.equal(fogTransitionActive(),false);
  const visibility={size:256,border:205},one=fogRasterBounds(visibility,{left:-80,right:350,top:-200,bottom:400}),two=fogRasterBounds(visibility,{left:-200,right:440,top:-60,bottom:330});assert.deepEqual(one,two);
});

test('稳态雾复用目标数组，关闭雾释放画布和窗口数组，重新启用不继承旧退雾',()=>{
  const visibility=createVisibility(size,new Set([id(12,12)]),new Set([id(12,12)]),3,3),ctx=new CanvasStub().ctx,explored=new Set(),area={left:8,top:8,right:24,bottom:24};
  drawFog(ctx,visibility,explored,0,1000,0,0,2,area);const stats=fogResourceStats();assert.equal(stats.arrayBytes,64*64*8);assert.equal(stats.canvasRGBABytes,64*64*12);
  resetFogResources();assert.equal(fogResourceStats(),null);assert.equal(fogTransitionActive(),false);assert.equal(visibility.rasterCacheBytes,0);
  drawFog(ctx,visibility,explored,0,1001,0,0,2,area);assert.equal(fogTransitionActive(),false);assert.equal(fogResourceStats().arrayBytes,stats.arrayBytes);
});
