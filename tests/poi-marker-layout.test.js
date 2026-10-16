import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULTS} from '../src/config.js';
import {poiMarkerSize} from '../src/poi-marker-layout.js';

test('POI按实际屏幕格宽在最小/中间/最大尺寸平滑缩放，不越界',()=>{
  const base=10,p=DEFAULTS,at=percent=>poiMarkerSize(base*percent/100,base,p);
  assert.equal(at(30),40);assert.equal(at(100),40);assert.equal(at(p.mapMidZoomPercent),48);assert.equal(at(p.mapNearZoomPercent),56);assert.equal(at(1200),56);
  const a=at(120),b=at(130);assert.ok(a>40&&b>a&&b<48);
  assert.ok(Math.abs(at(p.mapMidZoomPercent-.001)-at(p.mapMidZoomPercent+.001))<.001);
  const lowest={...p,mapMidZoomPercent:100,mapNearZoomPercent:101};
  assert.equal(poiMarkerSize(10,base,lowest),48);assert.equal(poiMarkerSize(10.1,base,lowest),56);
});
