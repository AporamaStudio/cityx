import test from 'node:test';
import assert from 'node:assert/strict';
import {projectView,groundAt,panView,keyboardPanStep,viewCenter,viewDistance,viewBounds,cityCasterPadding,observationView,orbitView} from '../src/city-view.js';

test('WASD按真实时间平移，相反方向抵消，斜向不更快，慢帧有上限',()=>{
  const one=keyboardPanStep(new Set(['KeyW']),50,480),two=keyboardPanStep(new Set(['KeyW','KeyD']),50,480);
  assert.deepEqual(one,{x:0,y:24});assert.ok(Math.abs(Math.hypot(two.x,two.y)-24)<1e-9);assert.ok(two.x<0&&two.y>0);
  assert.deepEqual(keyboardPanStep(new Set(['KeyW','KeyS','KeyA','KeyD']),50,480),{x:0,y:0});
  const short=keyboardPanStep(new Set(['KeyW']),25,480);assert.equal(short.y*2,one.y);
  assert.equal(keyboardPanStep(new Set(['KeyW']),1000,480).y,48);assert.equal(keyboardPanStep(new Set(['KeyW']),50,0).y,0);
});

test('离屏余量覆盖画面边缘的高楼及斜向投影，低俯角朝天时不裁剪',()=>{
  for(const projection of ['perspective','orthographic'])for(const elevation of [25,45,80])for(const fov of [20,40,60])for(const yaw of [-2,0,1.3]){
    const view={width:702,height:580,cell:18,panX:-2000,panY:-1800,size:256,yaw,elevation:elevation*Math.PI/180,fov,projection},bounds=viewBounds(view),center=viewCenter(view),distance=viewDistance(view),camera={x:center.x+Math.sin(yaw)*Math.cos(view.elevation)*distance,y:Math.sin(view.elevation)*distance,z:center.y+Math.cos(yaw)*Math.cos(view.elevation)*distance};
    for(const height of [.6,1.2,8]){
      const padding=cityCasterPadding(view,height);
      for(const [px,py] of [[0,0],[702,0],[0,580],[702,580],[351,290]]){
        const ground=groundAt(px,py,view);if(ground.sky)continue;
        for(const receiver of [0,height*.5,height]){
          const x=projection==='perspective'?ground.x+(camera.x-ground.x)*receiver/camera.y:ground.x+Math.sin(yaw)*receiver/Math.tan(view.elevation),y=projection==='perspective'?ground.y+(camera.z-ground.y)*receiver/camera.y:ground.y+Math.cos(yaw)*receiver/Math.tan(view.elevation);
          const casterX=x-(height-receiver),casterY=y-(height-receiver)/6;
          assert.ok(casterX>=bounds.left-padding&&casterX<=bounds.right+padding&&casterY>=bounds.top-padding&&casterY<=bounds.bottom+padding);
        }
      }
    }
  }
  assert.equal(cityCasterPadding({width:702,height:580,elevation:25*Math.PI/180,fov:60,projection:'perspective'},1),Infinity);
});

test('旋转及两种投影下，WASD仍沿画面方向移动而非固定世界轴',()=>{
  for(const projection of ['orthographic','perspective'])for(const yaw of [0,Math.PI/4,-Math.PI/2]){
    const view={width:702,height:582,panX:-200,panY:-450,cell:24,yaw,elevation:Math.PI/4,projection,fov:40},center=viewCenter(view);
    const step=keyboardPanStep(new Set(['KeyD']),16,480),delta=panView(step.x,step.y,view);
    const moved=projectView(center.x,center.y,0,{...view,panX:view.panX+delta.x,panY:view.panY+delta.y});
    assert.ok(moved.x<view.width/2);assert.ok(Math.abs(moved.y-view.height/2)<1e-8);
  }
});

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

// 以实际Three.js相机独立核对叠加信息，防止模型正确但路线/HP漂移。
test('透视世界投影与Three.js一致，地面往返及近裁剪不镜像',async()=>{
  const {PerspectiveCamera,Vector3}=await import('../assets/model-preview/vendor/three/build/three.module.js');
  const {viewDistance,viewPixelScale}=await import('../src/city-view.js');
  for(const elevation of [25,45,80].map(d=>d*Math.PI/180))for(const yaw of [0,Math.PI/4,-Math.PI/2]){
    const view={width:702,height:582,panX:-200,panY:-450,cell:24,yaw,elevation,projection:'perspective',fov:40},center=viewCenter(view),distance=viewDistance(view),camera=new PerspectiveCamera(40,702/582,distance*.05,distance+300);
    camera.position.set(center.x+Math.sin(yaw)*Math.cos(elevation)*distance,Math.sin(elevation)*distance,center.y+Math.cos(yaw)*Math.cos(elevation)*distance);camera.lookAt(center.x,0,center.y);camera.updateMatrixWorld();
    for(const [dx,dy,z] of [[0,0,0],[-3,2,0],[2,-4,0],[1,2,.6]]){
      const x=center.x+dx,y=center.y+dy,p=projectView(x,y,z,view),expected=new Vector3(x,z,y).project(camera);
      assert.ok(Math.abs(p.x-(expected.x+1)*view.width/2)<1e-8);assert.ok(Math.abs(p.y-(1-expected.y)*view.height/2)<1e-8);
      if(!z){const ground=groundAt(p.x,p.y,view);assert.ok(Math.abs(ground.x-x)<1e-8&&Math.abs(ground.y-y)<1e-8);}
    }
    const behind={x:center.x+Math.sin(yaw)*distance*3/Math.cos(elevation),y:center.y+Math.cos(yaw)*distance*3/Math.cos(elevation)};assert.equal(projectView(behind.x,behind.y,0,view).hidden,true);assert.equal(viewPixelScale(behind.x,behind.y,0,view),0);
  }
});

test('透视全图容纳四角，拖动保住世界锚点',()=>{
  for(const [width,height] of [[343,600],[702,582],[1050,400]])for(const elevation of [25,45,80].map(d=>d*Math.PI/180)){
    const base=Math.min((width-48)/66,(height-48)/66),input={width,height,panX:width/2-30*base,panY:height/2-30*base,cell:base,zoom:1,yaw:Math.PI/4,elevation,projection:'perspective',fov:40},view=observationView(input);
    for(const [x,y] of [[0,0],[60,0],[60,60],[0,60]]){const p=projectView(x,y,0,view);assert.ok(p.x>=23.9&&p.x<=width-23.9&&p.y>=23.9&&p.y<=height-23.9);}
    const x=width*.6,y=height*.65,dx=17,dy=-11,anchor=groundAt(x-dx,y-dy,view),delta=panView(dx,dy,view,x,y),moved=groundAt(x,y,{...view,panX:view.panX+delta.x,panY:view.panY+delta.y});
    assert.ok(Math.abs(anchor.x-moved.x)<1e-8&&Math.abs(anchor.y-moved.y)<1e-8);
  }
});
