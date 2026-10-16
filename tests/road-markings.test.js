import test from 'node:test';
import assert from 'node:assert/strict';
import {roadMarkings} from '../src/city-roads.js';
import {roadProfile,roadCellParts} from '../src/city-roads.js';

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

test('20m和40m路幅组件填满真实宽度，主路的分隔带跨两格连续',()=>{
  for(const meters of [1,20,40,60,1000]){
    const p=roadProfile(meters);
    assert.ok(Math.abs(p.lanes*p.lane*2+p.median+2*(p.sidewalk+p.green+p.parking)-meters)<1e-8);
  }
  const layout={width:8,height:8,tiles:Array(64).fill('block')};
  for(let y=0;y<8;y++)for(let x=3;x<5;x++)layout.tiles[y*8+x]='road';
  const first=roadCellParts(layout,3,4),second=roadCellParts(layout,4,4);
  for(const [x,parts] of [[3,first],[4,second]])for(const p of parts){assert.ok(p.x>=x&&p.x+p.w<=x+1+1e-8&&p.y>=4&&p.y+p.h<=5+1e-8);}
  const median=[...first,...second].filter(p=>p.color==='#718062');
  assert.ok(Math.abs(median.reduce((sum,p)=>sum+p.w,0)-4/20)<1e-8);
  assert.equal(Math.max(...median.map(p=>p.x+p.w)),4.1);
  assert.deepEqual(roadCellParts(layout,2,4),[]);
});
