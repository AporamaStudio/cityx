import test from 'node:test';
import assert from 'node:assert/strict';
import {createVisibility,cloudDensity,exteriorFogDensity} from '../src/visibility.js';
import {createState,controlMask,visionField,key,revealControl} from '../src/model.js';
import {SIZE,DEFAULTS} from '../src/config.js';

test('外围比例只影响景物，城内雾场与实时敌人权限完全保留',()=>{
  const controlled=new Set(),sight=new Set();
  for(let y=20;y<27;y++)for(let x=0;x<8;x++)controlled.add(y*SIZE+x);
  for(let y=17;y<30;y++)for(let x=0;x<11;x++)sight.add(y*SIZE+x);
  const original=createVisibility(SIZE,controlled,sight,3,3),world=createVisibility(SIZE,controlled,sight,3,3,1.5,DEFAULTS);
  for(let y=.125;y<SIZE;y+=.25)for(let x=.125;x<SIZE;x+=.25){
    assert.deepEqual(world.fogAt(x,y),original.fogAt(x,y));assert.equal(world.enemyAlpha(x,y),original.enemyAlpha(x,y));
  }
  assert.ok(world.fogAt(-2,23.5).cloud<.1);assert.ok(world.fogAt(-6,23.5).cloud>world.fogAt(-2,23.5).cloud);
  assert.ok(world.fogAt(-12,23.5).cloud>world.fogAt(-6,23.5).cloud);
  assert.ok(world.fogAt(62,23.5).cloud>.8);assert.equal(world.enemyAlpha(-2,23.5),0);
  assert.equal(createVisibility(SIZE,controlled,sight,3,3,1.5,{...DEFAULTS}),world);
});

test('局部S1揭示不能产生12格清晰延伸，撤回边缘控制立即恢复外围雾',()=>{
  const controlled=new Set([30*SIZE+30]),sight=new Set([...controlled,20*SIZE]);
  const isolated=createVisibility(SIZE,controlled,sight,3,3,1.5,DEFAULTS);
  assert.ok(isolated.fogAt(-6,20.5).cloud>.8);
  controlled.add(20*SIZE);const opened=createVisibility(SIZE,controlled,sight,3,3,1.5,DEFAULTS);
  assert.ok(opened.fogAt(-6,20.5).cloud<isolated.fogAt(-6,20.5).cloud);
  controlled.delete(20*SIZE);assert.deepEqual(createVisibility(SIZE,controlled,sight,3,3,1.5,DEFAULTS).fogAt(-6,20.5),isolated.fogAt(-6,20.5));
});

test('外围距离随地图尺寸同比增长，远端融入背景且参数确实改变过渡',()=>{
  const fog=(size,d,params=DEFAULTS)=>exteriorFogDensity(size,d,d,0,0,3,3,params);
  assert.deepEqual(fog(60,6),fog(120,12));
  let previous=0;for(let d=0;d<=12;d+=.1){const f=fog(60,d),opacity=f.cloud+f.veil*(1-f.cloud);assert.ok(opacity>=previous-1e-6);previous=opacity;}
  const short=fog(60,3,{...DEFAULTS,exteriorFogTransitionPercent:5});assert.ok(Math.abs(short.cloud+short.veil*(1-short.cloud)-.9)<1e-6);
  assert.ok(fog(60,6,{...DEFAULTS,exteriorFogTransitionPercent:25}).cloud<fog(60,6).cloud);
  assert.ok(fog(60,6,{...DEFAULTS,exteriorFogClearPercent:50}).cloud<fog(60,6).cloud);
  const far=fog(60,15);assert.ok(Math.abs(far.cloud+far.veil*(1-far.cloud)-.9)<1e-6);
  const stronger=fog(60,15,{...DEFAULTS,exteriorFogFarOpacity:100});assert.equal(stronger.cloud+stronger.veil*(1-stronger.cloud),1);
  assert.deepEqual(fog(60,48),{cloud:0,veil:1});
});

test('S01与实际昼夜视野一致，敌源揭示为局部S1，发现标记不提供视野',()=>{
  const s=createState();s.params.controlRadius=3;
  const source={id:'isolated',bx:45,by:5,x:45,y:5,width:2,height:1,hp:30,firstNight:1,discovered:true};
  s.enemySources=new Map([[source.id,source]]);
  const controlled=controlMask(s),day=visionField(s),night=visionField(s,'battle');
  for(const sight of [day,night]){
    const field=createVisibility(SIZE,controlled,sight,3,3);
    for(let id=0;id<SIZE*SIZE;id++)assert.equal(field.levelAt(id%SIZE+.5,Math.floor(id/SIZE)+.5)<=1,sight.has(id));
    assert.equal(field.levelAt(45.5,5.5),1);assert.equal(field.enemyAlpha(45.5,5.5),1);
  }
  const lost=[...day].find(id=>!night.has(id));assert.ok(lost!==undefined);
  assert.equal(createVisibility(SIZE,controlled,night,3,3).enemyAlpha(lost%SIZE+.5,Math.floor(lost/SIZE)+.5),0);
  source.firstNight=5;assert.equal(createVisibility(SIZE,controlled,visionField(s),3,3).levelAt(45.5,5.5),3);
  source.firstNight=1;source.hp=0;revealControl(s);
  assert.equal(createVisibility(SIZE,controlled,visionField(s),3,3).enemyAlpha(45.5,5.5),0);
});

test('移动按插值中心显隐，仅在可见侧淡入淡出，不预告隐藏端点',()=>{
  const size=20,controlled=new Set([10*size+10]),sight=new Set();
  for(let y=6;y<=14;y++)for(let x=6;x<=14;x++)sight.add(y*size+x);
  const field=createVisibility(size,controlled,sight,3,3);
  assert.equal(field.enemyAlpha(5.9,10.5),0);
  assert.equal(field.enemyAlpha(6,10.5),0);
  const entering=field.enemyAlpha(6.2,10.5);assert.ok(entering>0&&entering<1);
  assert.ok(field.enemyAlpha(6.5,10.5)>entering&&field.enemyAlpha(6.5,10.5)<1);
  assert.equal(field.enemyAlpha(7.5,10.5),1);
  assert.equal(field.enemyAlpha(10.5,10.5),1);
  assert.ok(field.enemyAlpha(14.8,10.5)<1);assert.equal(field.enemyAlpha(15,10.5),0);
  assert.equal(field.levelAt(16.5,10.5),2);assert.equal(field.enemyAlpha(16.5,10.5),0);
});

test('重叠视野取可见并缓存，修改集合重建，S12/S23与缩放不扩张敌情权限',()=>{
  const s=createState(),controlled=controlMask(s),sight=visionField(s);
  let field=createVisibility(SIZE,controlled,sight,3,3);
  assert.equal(createVisibility(SIZE,new Set(controlled),new Set(sight),3,3),field);
  const hidden=key(59,0);assert.equal(field.enemyAlpha(59.5,.5),0);
  const wider=createVisibility(SIZE,controlled,sight,20,20);assert.equal(wider.enemyAlpha(59.5,.5),0);
  sight.add(hidden);field=createVisibility(SIZE,controlled,sight,3,3);assert.equal(field.levelAt(59.5,.5),1);
  sight.delete(hidden);assert.equal(createVisibility(SIZE,controlled,sight,3,3).levelAt(59.5,.5),3);
});

test('雾层两段衔接斜率连续且单调，远处浓雾保持不透明',()=>{
  for(const [s12,s23] of [[3,3],[1,20],[20,1],[4,2]]){
    assert.equal(cloudDensity(0,s12,s23),0);assert.equal(cloudDensity(s12,s12,s23),.5);
    assert.equal(cloudDensity(s12+s23,s12,s23),1);assert.equal(cloudDensity(100,s12,s23),1);
    let last=0;for(let d=0;d<s12+s23;d+=.01){const value=cloudDensity(d,s12,s23);assert.ok(value>=last&&value<=1);last=value;}
    const delta=.0001,left=(.5-cloudDensity(s12-delta,s12,s23))/delta,right=(cloudDensity(s12+delta,s12,s23)-.5)/delta;
    assert.ok(Math.abs(left-right)<.001);assert.ok(left>0);
  }
});
test('放宽或关闭敌人渐隐不扩大实时视野，控制区始终完整显示',()=>{
  const size=20,controlled=new Set([10*size+10]),sight=new Set();
  for(let y=6;y<=14;y++)for(let x=6;x<=14;x++)sight.add(y*size+x);
  for(const fadeCells of [0,.5,1.5,3]){
    const field=createVisibility(size,controlled,sight,3,3,fadeCells);
    assert.equal(field.enemyAlpha(5.9,10.5),0);assert.equal(field.enemyAlpha(15,10.5),0);
    assert.equal(field.enemyAlpha(10.5,10.5),1);
    if(!fadeCells)assert.equal(field.enemyAlpha(6.2,10.5),1);
  }
});
test('狭窄S1在控制边界前恢复清晰，不因宽渐隐范围突然显现',()=>{
  const size=20,controlled=new Set(),sight=new Set();
  for(let y=6;y<=14;y++)for(let x=6;x<=14;x++){sight.add(y*size+x);if(x>6)controlled.add(y*size+x);}
  const field=createVisibility(size,controlled,sight,3,3,3);
  assert.ok(field.enemyAlpha(6.1,10.5)<.1);assert.ok(field.enemyAlpha(6.9,10.5)>.9);
  assert.equal(field.enemyAlpha(7,10.5),1);assert.equal(field.enemyAlpha(5.9,10.5),0);
});

test('256格距离场仅保留城内与雾带，外围窗口仍保持4像素采样且参数快照不被后续修改',()=>{
  const size=256,controlled=new Set([253*size+128,254*size+128,255*size+128]),sight=new Set(controlled),params={...DEFAULTS},field=createVisibility(size,controlled,sight,3,3,1.5,params);
  assert.equal(field.n,1088);assert.equal(field.border,205);assert.ok(field.arrayBytes<25*1024*1024);
  const area={left:112,top:248,right:144,bottom:280},raster=field.raster(area);assert.equal(raster.width,128);assert.equal(raster.height,128);
  for(let y=0;y<raster.height;y+=7)for(let x=0;x<raster.width;x+=11){const f=field.fogAt(area.left+(x+.5)/4,area.top+(y+.5)/4),i=y*raster.width+x;assert.ok(Math.abs(raster.cloud[i]-f.cloud)<1e-7);assert.ok(Math.abs(raster.veil[i]-f.veil)<1e-7);}
  const before=field.fogAt(128,290);params.exteriorFogFarOpacity=100;assert.deepEqual(field.fogAt(128,290),before);
  const next=createVisibility(size,controlled,sight,3,3,1.5,params);assert.notDeepEqual(next.fogAt(128,290),before);
  assert.ok(Number.isInteger(createVisibility(60,new Set([30*60+30]),new Set([30*60+30]),5.6,7.1).n));
});

test('main完整雾场对照与紧凑路径保持城内视野和敌人权限，缓存彼此独立',async()=>{
  const {createVisibility:reference,resetReferenceVisibility}=await import('../src/visibility-reference.js');
  const controlled=new Set([30*60+30]),sight=new Set();for(let y=25;y<36;y++)for(let x=25;x<36;x++)sight.add(y*60+x);
  const old=reference(60,controlled,sight,3,3,1.5,DEFAULTS),optimized=createVisibility(60,controlled,sight,3,3,1.5,DEFAULTS);
  assert.equal(old.n,(60+48*2)*4);assert.equal(optimized.n,(60+8*2)*4);
  for(let y=.125;y<60;y+=.5)for(let x=.125;x<60;x+=.5){assert.deepEqual(old.fogAt(x,y),optimized.fogAt(x,y));assert.equal(old.enemyAlpha(x,y),optimized.enemyAlpha(x,y));assert.equal(old.levelAt(x,y),optimized.levelAt(x,y));}
  assert.equal(reference(60,controlled,sight,3,3,1.5,DEFAULTS),old);resetReferenceVisibility();assert.notEqual(reference(60,controlled,sight,3,3,1.5,DEFAULTS),old);
});
