import test from 'node:test';
import assert from 'node:assert/strict';
import {projectView,groundAt,panView,viewCenter,observationView} from '../src/city-view.js';

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
