import test from 'node:test';
import assert from 'node:assert/strict';
import {createNightShaderWarmup} from '../src/city-shader-warmup.js';

const settle=()=>new Promise(resolve=>setImmediate(resolve));
test('每次空闲只编译一个批次，完成后复用同一布局且不修改真实灯光',async()=>{
  const tasks=[],calls=[],ready=[],lamp={visible:false},scene={},target={};
  const warmup=createNightShaderWarmup({compileAsync(root,camera,s){calls.push(root.id);assert.equal(s,target);assert.equal(lamp.visible,false);return Promise.resolve();}},scene,{
    schedule:fn=>tasks.push(fn),onReady:key=>ready.push(key),prepare:()=>({batches:[{root:{id:1},scene:target},{root:{id:2},scene:target}]})
  });
  warmup.request('a',{}, {}, [lamp]);warmup.request('a',{}, {}, [lamp]);assert.equal(tasks.length,1);
  tasks.shift()();assert.deepEqual(calls,[1]);await settle();assert.deepEqual(ready,[]);
  tasks.shift()();assert.deepEqual(calls,[1,2]);await settle();tasks.shift()();assert.deepEqual(ready,['a']);
  warmup.request('a',{}, {}, [lamp]);assert.equal(tasks.length,0);
});

test('连续建拆在当前编译完成后只准备最新布局，旧资源延迟到当前批次结束释放',async()=>{
  const tasks=[],keys=[],ready=[];let finish,disposed=0;
  const warmup=createNightShaderWarmup({compileAsync(root){keys.push(root.id);return new Promise(resolve=>{finish=resolve;});}}, {},{
    schedule:fn=>tasks.push(fn),onReady:key=>ready.push(key),prepare:root=>({batches:[{root},{root:{id:root.id+'-old-tail'}}]})
  });
  warmup.request('a',{id:'a'}, {}, []);tasks.shift()();warmup.release(()=>disposed++);assert.equal(disposed,0);
  warmup.request('b',{id:'b'}, {}, []);warmup.request('c',{id:'c'}, {}, []);assert.equal(tasks.length,0);
  finish();await settle();assert.equal(disposed,1);tasks.shift()();assert.deepEqual(keys,['a','c']);assert.deepEqual(ready,[]);
  finish();await settle();tasks.shift()();assert.deepEqual(keys,['a','c','c-old-tail']);finish();await settle();tasks.shift()();assert.deepEqual(ready,['c']);
});

test('重试废弃旧局任务，即使异步完成也不通知就绪，随后可准备同名新局',async()=>{
  const tasks=[],ready=[];let finish,freed=false,calls=0;
  const warmup=createNightShaderWarmup({compileAsync(){calls++;return new Promise(resolve=>{finish=resolve;});}}, {},{schedule:fn=>tasks.push(fn),onReady:key=>ready.push(key)});
  warmup.request('a',{}, {}, []);tasks.shift()();warmup.reset();warmup.release(()=>{freed=true;});warmup.request('a',{}, {}, []);
  assert.equal(freed,false);finish();await settle();assert.equal(freed,true);assert.deepEqual(ready,[]);
  tasks.shift()();assert.equal(calls,2);finish();await settle();tasks.shift()();assert.deepEqual(ready,['a']);
});

test('编译失败报告并释放资源，不锁住队列；暂停准备后可恢复',async()=>{
  const tasks=[],errors=[],ready=[];let enabled=false,freed=false;
  const warmup=createNightShaderWarmup({compileAsync(){throw new Error('compile failed');}}, {},{schedule:fn=>tasks.push(fn),enabled:()=>enabled,onReady:key=>ready.push(key),onError:error=>errors.push(error.message)});
  warmup.request('a',{}, {}, []);tasks.shift()();assert.equal(tasks.length,1);enabled=true;tasks.shift()();warmup.release(()=>{freed=true;});
  await settle();assert.equal(freed,true);tasks.shift()();assert.deepEqual(errors,['compile failed']);assert.deepEqual(ready,['a']);
  warmup.request('a',{}, {}, []);assert.equal(tasks.length,0);
});
