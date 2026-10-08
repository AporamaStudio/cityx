import test from 'node:test';
import assert from 'node:assert/strict';
import {cameraScale,limitZoom,limitPan,CAMERA_BORDER} from '../src/map-camera.js';

test('全图尺度在桌面和窄屏容纳地图及外围，较短方向居中',()=>{
  for(const [w,h,bottom] of [[698,584,80],[375,470,116],[1200,400,80]]){
    const cell=cameraScale(w,h,60,bottom),pan=limitPan(-9999,9999,w,h,60,cell,bottom);
    assert.ok((60+CAMERA_BORDER*2)*cell<=w-48+.001);
    assert.ok((60+CAMERA_BORDER*2)*cell<=h-bottom-48+.001);
    assert.ok(Math.abs(pan.x+30*cell-w/2)<.001);
    assert.ok(Math.abs(pan.y+30*cell-(h-bottom)/2)<.001);
  }
});
test('缩放不能小于全图或把单格放大超过48像素',()=>{
  for(const base of [2,6,10,20]){
    assert.equal(limitZoom(.01,base),1);
    assert.equal(limitZoom(999,base)*base,48);
  }
});
test('放大拖动到四角仍保留城市，最外格可以完整出现在操作区',()=>{
  const w=698,h=584,cell=48,bottom=80;
  const left=limitPan(9999,9999,w,h,60,cell),right=limitPan(-9999,-9999,w,h,60,cell);
  assert.ok(left.x>=0&&left.y>=0);
  assert.ok(left.x+cell<w&&left.y+cell<h-bottom);
  assert.ok(right.x+59*cell>=0&&right.y+59*cell>=0);
  assert.ok(right.x+60*cell<=w&&right.y+60*cell<=h-bottom);
  assert.deepEqual(limitPan(left.x,left.y,w,h,60,cell),left);
});
