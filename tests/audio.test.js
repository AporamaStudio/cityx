import test from 'node:test';
import assert from 'node:assert/strict';
import {AUDIO_DEFAULTS,readAudioSettings,createGameAudio} from '../src/audio.js';

// 仅模拟音频时钟与节点入口，验证开关/生命周期；实际波形另在浏览器检查。
function setup(saved=null) {
  const calls=[],timers=new Set(),param=()=>({value:0,setValueAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){},cancelScheduledValues(){},setTargetAtTime(value){this.value=value;}});
  const node=kind=>({kind,gain:param(),frequency:param(),threshold:param(),ratio:param(),connect(){},disconnect(){},start(at){this.call={kind,at};calls.push(this.call);},stop(at){this.call.end=at;}});
  const ctx={state:'suspended',currentTime:0,sampleRate:8000,destination:node('destination'),
    createGain:()=>node('gain'),createOscillator:()=>node('tone'),createBufferSource:()=>node('noise'),createBiquadFilter:()=>node('filter'),createConvolver:()=>node('reverb'),createDynamicsCompressor:()=>node('limiter'),
    createBuffer:(channels,length)=>({getChannelData:()=>new Float32Array(length)}),
    resume:async()=>{ctx.state='running';},suspend:async()=>{ctx.state='suspended';}};
  let created=0,stored=saved;
  const storage={getItem:()=>stored,setItem:(key,value)=>{stored=value;}};
  const sound=createGameAudio({storage,createContext:()=>{created++;return ctx;},repeat:fn=>{timers.add(fn);return fn;},cancelRepeat:fn=>timers.delete(fn)});
  return {sound,ctx,calls,timers,storage,get created(){return created;}};
}

test('声音偏好校验、音量限制与存储异常不影响游戏',()=>{
  assert.deepEqual(readAudioSettings({getItem(){throw Error('blocked');}}),AUDIO_DEFAULTS);
  assert.deepEqual(readAudioSettings({getItem:()=>'{bad json'}),AUDIO_DEFAULTS);
  const prefs=readAudioSettings({getItem:()=>'{"music":false,"effects":"false","musicVolume":5,"effectsVolume":-2}'});
  assert.deepEqual(prefs,{music:false,effects:true,musicVolume:1,effectsVolume:0});
  const sound=createGameAudio({storage:{getItem(){throw Error();},setItem(){throw Error();}}});
  assert.doesNotThrow(()=>sound.configure({music:false}));assert.equal(sound.settings.music,false);
});

test('第一次交互才创建音频，重复解锁不会叠加音乐时钟',async()=>{
  const s=setup();s.sound.setScene('build');assert.equal(s.created,0);assert.equal(s.timers.size,0);
  await s.sound.unlock();await s.sound.unlock();assert.equal(s.created,1);assert.equal(s.timers.size,1);
  s.sound.configure({music:false});assert.equal(s.timers.size,0);
  s.sound.configure({music:true});assert.equal(s.timers.size,1);
});

test('密集击杀合并音效，关闭音效不影响音乐，选择刷新后保留',async()=>{
  const s=setup();s.sound.configure({music:false});await s.sound.unlock();
  s.sound.play('kill');s.sound.play('kill');assert.equal(s.calls.length,2);
  s.sound.configure({effects:false});s.ctx.currentTime=1;s.sound.play('coin');assert.equal(s.calls.length,2);
  assert.equal(readAudioSettings(s.storage).effects,false);
  s.sound.configure({music:true});assert.equal(s.timers.size,1);assert.equal(s.sound.settings.effects,false);
});

test('首次建设等待手势解锁，但等待期间关闭音效不会迟到播放',async()=>{
  for(const muted of [false,true]){
    const s=setup();s.sound.configure({music:false});let finish;
    s.ctx.resume=()=>new Promise(resolve=>{finish=()=>{s.ctx.state='running';resolve();};});
    const ready=s.sound.unlock();s.sound.play('build');assert.equal(s.calls.length,0);
    if(muted)s.sound.configure({effects:false});finish();await ready;await Promise.resolve();
    assert.equal(s.calls.length,muted?0:5);
  }
});

test('后台挂起且停止配乐，恢复后不会补播积压节拍',async()=>{
  const s=setup();await s.sound.unlock();s.sound.setHidden(true);
  assert.equal(s.ctx.state,'suspended');assert.equal(s.timers.size,0);
  const before=s.calls.length;s.sound.play('build');assert.equal(s.calls.length,before);
  s.ctx.currentTime=120;s.sound.setHidden(false);await Promise.resolve();
  assert.equal(s.ctx.state,'running');assert.equal(s.timers.size,1);
  assert.ok(s.calls.slice(before).every(call=>call.at>=120));
});

test('夜晚暂停收起脉冲，结算停止配乐，重试恢复白天主题',async()=>{
  const s=setup(),paused=setup();await s.sound.unlock();await paused.sound.unlock();
  for(const sample of [s,paused]){sample.calls.length=0;sample.ctx.currentTime=1;sample.sound.setScene('battle',sample===paused);for(const tick of sample.timers)tick();}
  assert.ok(s.calls.length>paused.calls.length);
  for(const phase of ['won','lost']){s.sound.setScene(phase);assert.equal(s.timers.size,0);}
  s.sound.setScene('build');assert.equal(s.timers.size,1);
});

test('落日与天亮是舒展的场景音效，音乐关闭仍可播放，音效关闭则静音',async()=>{
  const s=setup();s.sound.configure({music:false});await s.sound.unlock();
  for(const name of ['sunset','dawn']){
    s.calls.length=0;s.sound.play(name);
    assert.ok(s.calls.length>0);
    assert.ok(Math.max(...s.calls.map(call=>call.end-call.at))>1);
    s.ctx.currentTime+=4;
  }
  s.sound.configure({effects:false});s.calls.length=0;
  s.sound.play('sunset');s.sound.play('dawn');assert.equal(s.calls.length,0);
});


test('收复完成音效保持舒展，冻结配乐并遵守音效关闭',async()=>{
  const s=setup();await s.sound.unlock();s.sound.setScene('won');s.calls.length=0;
  assert.equal(s.timers.size,0);s.sound.play('victory');
  assert.ok(s.calls.length>=7);assert.ok(s.calls.filter(c=>c.kind==='tone').every(c=>c.end-c.at>2));
  s.calls.length=0;s.ctx.currentTime=5;s.sound.configure({effects:false});s.sound.play('victory');assert.equal(s.calls.length,0);
});
