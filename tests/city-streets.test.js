import test from 'node:test';
import assert from 'node:assert/strict';
import {operatingStreetLamps,ruinStreetProps} from '../src/city-streets.js';

test('运营路灯靠路缘且灯臂朝道路，隐藏、未控、被占道路不生成灯',()=>{
  const layout={width:10,height:10,tiles:Array(100).fill('road')},plot={id:22,x:2,y:2,w:2,h:2,powered:true},controlled=new Set(Array.from({length:100},(_,i)=>i)),occupied=new Set();
  const input={layout,controlled,visible:()=>true,occupied,cellMeters:20},before=structuredClone({layout,plot,controlled,occupied});
  const lamps=operatingStreetLamps([plot],input);assert.ok(lamps.length>=2&&lamps.length<=4);
  for(const lamp of lamps){
    const x=Math.floor(lamp.x),y=Math.floor(lamp.y);assert.ok(x<2||x>=4||y<2||y>=4);
    const dx=Math.cos(lamp.angle),dy=-Math.sin(lamp.angle);
    if(x<2){assert.ok(dx<-.99);assert.ok(Math.abs(lamp.x-x-.9)<1e-8);}
    else if(x>=4){assert.ok(dx>.99);assert.ok(Math.abs(lamp.x-x-.1)<1e-8);}
    else if(y<2){assert.ok(dy<-.99);assert.ok(Math.abs(lamp.y-y-.9)<1e-8);}
    else{assert.ok(dy>.99);assert.ok(Math.abs(lamp.y-y-.1)<1e-8);}
  }
  assert.deepEqual(operatingStreetLamps([{...plot,powered:false}],input),[]);
  assert.deepEqual(operatingStreetLamps([plot],{...input,visible:()=>false}),[]);
  assert.deepEqual(operatingStreetLamps([plot],{...input,controlled:new Set()}),[]);
  assert.deepEqual(operatingStreetLamps([plot],{...input,occupied:controlled}),[]);
  assert.deepEqual({layout,plot,controlled,occupied},before);
});

test('废墟街景随恢复消失，隐藏道路或设施占用不生成，尺寸读取米制比例',()=>{
  const layout={width:10,height:10,tiles:Array(100).fill('road')},plot={id:22,x:2,y:2,w:2,h:2,status:'ruin'};
  const options={layout,visible:()=>true,occupied:new Set(),cellMeters:20},a=ruinStreetProps([plot],options);
  assert.equal(a.length,1);assert.equal(a[0].w,.225);assert.ok(a[0].x<2);assert.ok(a[0].x-Math.floor(a[0].x)>.7);
  assert.deepEqual(ruinStreetProps([{...plot,status:'building'}],options),[]);
  assert.deepEqual(ruinStreetProps([plot],{...options,visible:()=>false}),[]);
  assert.deepEqual(ruinStreetProps([plot],{...options,occupied:new Set(Array.from({length:100},(_,i)=>i))}),[]);
  assert.equal(ruinStreetProps([plot],{...options,cellMeters:40})[0].w,a[0].w/2);
});
