import test from 'node:test';
import assert from 'node:assert/strict';
import {cameraScale,limitZoom,limitPan,limitObservationPan,CAMERA_BORDER} from '../src/map-camera.js';

test('全图尺度在桌面和窄屏容纳地图及外围，较短方向居中',()=>{
  for(const [w,h,bottom] of [[698,584,0],[375,470,0],[1200,400,0],[375,470,116]]){
    const cell=cameraScale(w,h,60,bottom),pan=limitPan(-9999,9999,w,h,60,cell,bottom);
    assert.ok((60+CAMERA_BORDER*2)*cell<=w-48+.001);
    assert.ok((60+CAMERA_BORDER*2)*cell<=h-bottom-48+.001);
    assert.ok(Math.abs(pan.x+30*cell-w/2)<.001);
    assert.ok(Math.abs(pan.y+30*cell-(h-bottom)/2)<.001);
  }
});
test('缩放不能小于全图或把单格放大超过配置格宽',()=>{
  for(const base of [2,6,10,20]){
    assert.equal(limitZoom(.01,base),1);
    assert.equal(limitZoom(999,base)*base,128);
    for(const cap of [48,96,256])assert.equal(limitZoom(999,base,cap)*base,cap);
  }
});
test('放大拖动到四角仍保留城市，最外格可以完整出现在操作区',()=>{
  const w=698,h=584,cell=128,bottom=0;
  const left=limitPan(9999,9999,w,h,60,cell),right=limitPan(-9999,-9999,w,h,60,cell);
  assert.ok(left.x>=0&&left.y>=0);
  assert.ok(left.x+cell<w&&left.y+cell<h-bottom);
  assert.ok(right.x+59*cell>=0&&right.y+59*cell>=0);
  assert.ok(right.x+60*cell<=w&&right.y+60*cell<=h-bottom);
  assert.deepEqual(limitPan(left.x,left.y,w,h,60,cell),left);
});
test('观察视角允许城边居中，同时将世界中心限定在城市及外围三格',()=>{
  for(const cell of [16,128,256]){
    const w=698,h=584,edge={x:w/2-.5*cell,y:h/2-.5*cell};
    assert.deepEqual(limitObservationPan(edge.x,edge.y,w,h,60,cell),edge);
    const outside=limitObservationPan(99999,-99999,w,h,60,cell);
    assert.equal((w/2-outside.x)/cell,-3);assert.equal((h/2-outside.y)/cell,63);
  }
});
