import test from 'node:test';
import assert from 'node:assert/strict';
import {createVisibility,cloudDensity} from '../src/visibility.js';
import {createState,controlMask,visionField,key,revealControl} from '../src/model.js';
import {SIZE} from '../src/config.js';

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
