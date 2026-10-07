import test from 'node:test';
import assert from 'node:assert/strict';
import {roadMarkings} from '../src/city-textures.js';

test('一至三格宽道路的每格标线共用整条路的几何中心',()=>{
  for(const width of [1,2,3])for(const axis of ['v','h']){
    const layout={width:12,height:12,tiles:Array(144).fill('block')};
    for(let y=0;y<12;y++)for(let x=0;x<12;x++)if((axis==='v'?x:y)>=4&&(axis==='v'?x:y)<4+width)layout.tiles[y*12+x]='road';
    const marks=roadMarkings(layout);
    for(let i=4;i<4+width;i++){
      const m=marks.get(axis==='v'?6*12+i:i*12+6);
      assert.equal(m.axis,axis);assert.equal(m.width,width);assert.equal(i+m.center,4+width/2);
    }
  }
});
test('十字路口不叠加两组中心线，接近路口标识斑马线',()=>{
  const layout={width:12,height:12,tiles:Array(144).fill('block')};
  for(let y=0;y<12;y++)for(let x=0;x<12;x++)if((x>=4&&x<6)||(y>=4&&y<6))layout.tiles[y*12+x]='road';
  const marks=roadMarkings(layout);
  assert.equal(marks.get(4*12+4).axis,'');
  assert.equal(marks.get(3*12+4).crossing,1);
  assert.equal(marks.get(6*12+4).crossing,-1);
});
