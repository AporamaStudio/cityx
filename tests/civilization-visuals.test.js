import test from 'node:test';
import assert from 'node:assert/strict';
import {civilianPoses} from '../src/civilization-visuals.js';
const plot={id:1,x:10,y:10,w:3,h:3,type:'housing',status:'building',powered:true};
test('生活人物仅出现在接通且完好的白天城区，不读取或改变人口模型',()=>{
 const plots=[plot,{...plot,id:2,powered:false},{...plot,id:3,status:'ruin'}],before=structuredClone(plots);
 assert.equal(civilianPoses(plots).length,2);assert.equal(civilianPoses(plots,{night:1}).length,0);assert.equal(civilianPoses(plots,{perPlot:0}).length,0);assert.deepEqual(plots,before);
 assert.notDeepEqual(civilianPoses(plots,{time:1}),civilianPoses(plots,{time:5}));
 assert.equal(civilianPoses(plots,{view:{left:0,right:2,top:0,bottom:2}}).length,0);
 for(const p of civilianPoses(plots,{time:7}))assert.ok(p.x>=plot.x&&p.x<plot.x+plot.w&&p.y>=plot.y&&p.y<plot.y+plot.h);
});
