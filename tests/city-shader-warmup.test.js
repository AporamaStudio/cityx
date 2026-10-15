import test from 'node:test';
import assert from 'node:assert/strict';
import {createNightShaderWarmup} from '../src/city-shader-warmup.js';

const settle=()=>new Promise(resolve=>setImmediate(resolve));
test('夜间预热使用真实目标场景，立即恢复灯的可见性，稳定组合不重复编译',async()=>{
  const tasks=[],scene={},root={},camera={},lamps=[{visible:false,intensity:0},{visible:true,intensity:2}];let calls=0;
  const warmup=createNightShaderWarmup({compileAsync(r,c,s){calls++;assert.equal(r,root);assert.equal(c,camera);assert.equal(s,scene);assert.ok(lamps.every(l=>l.visible));return Promise.resolve();}},scene,{schedule:fn=>tasks.push(fn)});
  warmup.request('first',root,camera,lamps);warmup.request('first',root,camera,lamps);
  assert.equal(tasks.length,1);tasks.shift()();assert.deepEqual(lamps,[{visible:false,intensity:0},{visible:true,intensity:2}]);
  await settle();warmup.request('first',root,camera,lamps);assert.equal(calls,1);assert.equal(tasks.length,0);
});

test('连续建拆合并到最新组合，异步编译结束前保留被替换材质',async()=>{
  const tasks=[],keys=[];let finish,disposed=0;
  const warmup=createNightShaderWarmup({compileAsync(root){keys.push(root.id);return new Promise(resolve=>{finish=resolve;});}}, {},{schedule:fn=>tasks.push(fn)});
  warmup.request('a',{id:'a'}, {}, []);tasks.shift()();
  warmup.release(()=>disposed++);assert.equal(disposed,0);
  warmup.request('b',{id:'b'}, {}, []);warmup.request('c',{id:'c'}, {}, []);assert.equal(tasks.length,0);
  finish();await settle();assert.equal(disposed,1);assert.equal(tasks.length,1);
  tasks.shift()();assert.deepEqual(keys,['a','c']);finish();await settle();
  warmup.release(()=>disposed++);assert.equal(disposed,2);
});

test('夜间不执行待启动预热，失败恢复灯光并正常释放资源',async()=>{
  const tasks=[],errors=[],lamp={visible:false};let enabled=false,calls=0;
  const warmup=createNightShaderWarmup({compileAsync(){calls++;throw new Error('compile failed');}}, {},{schedule:fn=>tasks.push(fn),enabled:()=>enabled,onError:e=>errors.push(e.message)});
  warmup.request('a',{}, {}, [lamp]);tasks.shift()();assert.equal(calls,0);
  enabled=true;warmup.request('a',{}, {}, [lamp]);tasks.shift()();assert.equal(lamp.visible,false);
  let disposed=false;warmup.release(()=>{disposed=true;});await settle();assert.equal(disposed,true);assert.deepEqual(errors,['compile failed']);
  warmup.request('a',{}, {}, [lamp]);assert.equal(tasks.length,0);
});
