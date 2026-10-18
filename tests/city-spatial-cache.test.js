import test from 'node:test';
import assert from 'node:assert/strict';
import {spatialChunks} from '../src/city-spatial-cache.js';

test('街景固定按世界坐标分块，邻块变化不改变原块的内容和签名',()=>{
  const lamp={x:15.8,y:16.2,angle:1},car={x:17,y:17,w:.1,h:.2,asset:'car',color:'#456789'};
  const a=spatialChunks([lamp],[car]),b=spatialChunks([lamp],[car,{...car,x:42}]);
  assert.equal(a.size,2);assert.deepEqual(a.get('0:16'),b.get('0:16'));assert.deepEqual(a.get('16:16'),b.get('16:16'));
  assert.equal(a.get('16:16').dressing[0],car);assert.equal(a.get('0:16').lamps[0],lamp);
  assert.notEqual(a.get('16:16').signature,spatialChunks([lamp],[{...car,color:'#112233'}]).get('16:16').signature);
  assert.equal(spatialChunks([{x:-.2,y:-16.1}],[]).has('-16:-32'),true);
});
