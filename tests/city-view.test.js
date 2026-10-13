import test from 'node:test';
import assert from 'node:assert/strict';
import {projectView,groundAt,panView,viewCenter,observationView,orbitView} from '../src/city-view.js';

test('俯视与斜视坐标往返保持原观察中心，屋顶投影只改显示高度',()=>{
  for(const yaw of [0,Math.PI/4,-Math.PI/2,Math.PI])for(const elevation of [Math.PI/2,Math.PI/3,Math.PI/6]){
    const view={width:702,height:582,panX:-200,panY:-450,cell:16,yaw,elevation},center=viewCenter(view);
    assert.deepEqual(projectView(center.x,center.y,0,view),{x:351,y:291});
    for(const [x,y] of [[1,1],[30,57],[59,59]]){const screen=projectView(x,y,0,view),point=groundAt(screen.x,screen.y,view);assert.ok(Math.abs(point.x-x)<1e-10&&Math.abs(point.y-y)<1e-10);}
    const floor=projectView(30,40,0,view),roof=projectView(30,40,1,view);assert.equal(floor.x,roof.x);assert.ok(roof.y<=floor.y);
    const delta=panView(20,-15,view),moved=projectView(center.x,center.y,0,{...view,panX:view.panX+delta.x,panY:view.panY+delta.y});assert.ok(Math.abs(moved.x-371)<1e-10&&Math.abs(moved.y-276)<1e-10);
  }
});

test('旋转全图在窄屏和横屏完整容纳，正常倍率和回正中心保留',()=>{
  for(const [width,height] of [[343,600],[702,582],[1050,400]]){
    const base=Math.min((width-48)/66,(height-48)/66),input={width,height,panX:width/2-30*base,panY:height/2-30*base,cell:base,zoom:1,yaw:Math.PI/4,elevation:55*Math.PI/180},view=observationView(input);
    assert.ok(Math.abs(viewCenter(view).x-viewCenter(input).x)<1e-10&&Math.abs(viewCenter(view).y-viewCenter(input).y)<1e-10);
    for(const [x,y] of [[0,0],[60,0],[60,60],[0,60]]){const p=projectView(x,y,0,view);assert.ok(p.x>=23.9&&p.x<=width-23.9&&p.y>=23.9&&p.y<=height-23.9);}
    assert.equal(observationView({...input,cell:base*2,zoom:2}).cell,base*2);
  }
});

test('自由旋转绕回同一方向，俯仰限位不影响地图状态或投影往返',()=>{
  const view={width:702,height:582,panX:-100,panY:-250,cell:24};
  let angle={yaw:Math.PI/4,elevation:Math.PI/3};
  for(let i=0;i<24;i++)angle=orbitView(angle.yaw,angle.elevation,Math.PI/12,0);
  assert.ok(Math.abs(angle.yaw-Math.PI/4)<1e-10);
  assert.equal(orbitView(0,Math.PI/3,0,100).elevation,80*Math.PI/180);
  assert.equal(orbitView(0,Math.PI/3,0,-100).elevation,25*Math.PI/180);
  for(const tilt of [-100,100]){const camera={...view,...orbitView(1,1,-2,tilt)},p=projectView(22,49,0,camera),world=groundAt(p.x,p.y,camera);assert.ok(Math.abs(world.x-22)<1e-10&&Math.abs(world.y-49)<1e-10);}
});
