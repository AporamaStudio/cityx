import test from 'node:test';
import assert from 'node:assert/strict';
import {AUDIO_DEFAULTS,readAudioSettings,createGameAudio} from '../src/audio.js';

// 仅模拟音频时钟与节点入口，验证开关/生命周期；实际波形另在浏览器检查。
function setup(saved=null) {
  const calls=[],nodes=[],timers=new Set(),param=()=>({value:0,steps:[],setValueAtTime(value,at){this.value=value;this.steps.push({value,at});},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){},cancelScheduledValues(){},setTargetAtTime(value){this.value=value;}});
  const node=kind=>{const result={kind,gain:param(),pan:param(),frequency:param(),Q:param(),threshold:param(),ratio:param(),connections:[],connect(target){this.connections.push(target);},disconnect(){},start(at){this.call={kind,at};calls.push(this.call);},stop(at){this.call.end=at;}};nodes.push(result);return result;};
  const ctx={state:'suspended',currentTime:0,sampleRate:8000,destination:node('destination'),
    createGain:()=>node('gain'),createStereoPanner:()=>node('panner'),createOscillator:()=>node('tone'),createBufferSource:()=>node('noise'),createBiquadFilter:()=>node('filter'),createConvolver:()=>node('reverb'),createDynamicsCompressor:()=>node('limiter'),
    createBuffer:(channels,length)=>({getChannelData:()=>new Float32Array(length)}),
    resume:async()=>{ctx.state='running';},suspend:async()=>{ctx.state='suspended';}};
  let created=0,stored=saved;
  const storage={getItem:()=>stored,setItem:(key,value)=>{stored=value;}};
  const sound=createGameAudio({storage,createContext:()=>{created++;return ctx;},repeat:fn=>{timers.add(fn);return fn;},cancelRepeat:fn=>timers.delete(fn)});
  return {sound,ctx,calls,nodes,timers,storage,get created(){return created;}};
}

test('声音偏好校验、音量限制与存储异常不影响游戏',()=>{
  assert.deepEqual(readAudioSettings({getItem(){throw Error('blocked');}}),AUDIO_DEFAULTS);
  assert.deepEqual(readAudioSettings({getItem:()=>'{bad json'}),AUDIO_DEFAULTS);
  const prefs=readAudioSettings({getItem:()=>'{"music":false,"effects":"false","musicVolume":5,"effectsVolume":-2}'});
  assert.deepEqual(prefs,{music:false,effects:true,musicVolume:1,effectsVolume:0});
  const sound=createGameAudio({storage:{getItem(){throw Error();},setItem(){throw Error();}}});
  assert.doesNotThrow(()=>sound.configure({music:false}));assert.equal(sound.settings.music,false);
});

test('两种炮声有不同轮廓，同拍多炮不被提示音去重且保留独立空间音量',async()=>{
  const s=setup();s.sound.configure({music:false});await s.sound.unlock();
  s.sound.fireShots([{id:1,type:'A',gain:1,pan:-.6},{id:2,type:'B',gain:.4,pan:.6}]);
  assert.equal(s.calls.length,7);assert.deepEqual(s.nodes.filter(n=>n.kind==='panner').map(n=>n.pan.value),[-.6,.6]);
  const buses=s.nodes.filter(n=>n.kind==='gain'&&n.connections.some(n=>n.kind==='panner'));
  assert.ok(buses[0].gain.value>buses[1].gain.value);
  const tones=s.nodes.filter(n=>n.kind==='tone');assert.ok(tones[0].frequency.steps[0].value>tones.at(-1).frequency.steps[0].value);
  s.sound.fireShots([{id:3,type:'A',gain:1,pan:0}]);assert.equal(s.calls.length,11);
  s.sound.updateShotView(id=>id===1?{gain:.1,pan:.2}:null);assert.ok(buses[0].gain.value<.1);assert.equal(buses[1].gain.value,0);
});

test('炮声遵守静音/后台并取消暂停前的排程，暂停单步仍可发声',async()=>{
  const s=setup();s.sound.configure({music:false});await s.sound.unlock();s.sound.setScene('battle');
  const fire=()=>s.sound.fireShots([{id:1,type:'A',gain:1,pan:0}]);fire();s.ctx.currentTime=.01;s.sound.setScene('battle',true);
  assert.ok(s.calls.every(c=>c.end<=.036));
  s.sound.updateShotView(()=>({gain:1,pan:0}));assert.ok(s.nodes.filter(n=>n.kind==='gain'&&n.connections.some(n=>n.kind==='panner')).every(n=>n.gain.value===0));
  s.calls.length=0;fire();s.sound.setScene('battle',true);assert.equal(s.calls.length,4);assert.ok(s.calls.some(c=>c.end>.1));
  s.sound.configure({effects:false});s.calls.length=0;fire();assert.equal(s.calls.length,0);
  s.sound.configure({effects:true});s.sound.setHidden(true);fire();assert.equal(s.calls.length,0);
  s.sound.setHidden(false);await Promise.resolve();fire();assert.equal(s.calls.length,4);
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

test('结束白天蓄力可取消，所有声音淡出停止，重按不叠加上一轮',async()=>{
  const s=setup();s.sound.configure({music:false});await s.sound.beginDayEnd(1000);
  assert.equal(s.calls.length,4);const first=[...s.calls];
  s.ctx.currentTime=.2;s.sound.endDayEnd();assert.ok(first.every(c=>c.end<=.29));
  await s.sound.beginDayEnd(1000);assert.equal(s.calls.length,8);
  s.ctx.currentTime=.4;s.sound.setHidden(true);assert.ok(s.calls.slice(4).every(c=>c.end<=.49));
});

test('蓄力等待首次解锁时松手，不会迟到播放；关闭音效停止正在蓄力的声音',async()=>{
  const s=setup();s.sound.configure({music:false});let finish;
  s.ctx.resume=()=>new Promise(resolve=>{finish=()=>{s.ctx.state='running';resolve();};});
  const pending=s.sound.beginDayEnd(1000);s.sound.endDayEnd();finish();await pending;assert.equal(s.calls.length,0);
  await s.sound.beginDayEnd(1000);assert.equal(s.calls.length,4);
  s.ctx.currentTime=.25;s.sound.configure({effects:false});assert.ok(s.calls.every(c=>c.end<=.34));
  await s.sound.beginDayEnd(1000);assert.equal(s.calls.length,4);s.sound.endDayEnd();
});

test('开关与不能操作声音保持短促，遵守静音且能在首次点击后解锁播放',async()=>{
  const s=setup();s.sound.configure({music:false});const ready=s.sound.unlock();s.sound.play('cannotOperate');await ready;await Promise.resolve();
  assert.ok(s.calls.length>0);
  for(const name of ['switchOn','switchOff','cannotOperate']){
    s.ctx.currentTime+=1;s.calls.length=0;s.sound.play(name);
    assert.ok(s.calls.length>0);assert.ok(s.calls.every(call=>call.end-call.at<.15));
  }
  s.sound.configure({effects:false});s.calls.length=0;s.sound.play('switchOn');s.sound.play('switchOff');s.sound.play('cannotOperate');assert.equal(s.calls.length,0);
});

test('拆除声短时间不叠播，音乐关闭仍可播放，关闭音效及后台不补播',async()=>{
  const s=setup();s.sound.configure({music:false});await s.sound.unlock();
  s.sound.play('demolish');const demolition=[...s.calls];
  assert.ok(demolition.some(c=>c.kind==='tone'));assert.ok(demolition.some(c=>c.kind==='noise'));
  assert.ok(Math.max(...demolition.map(c=>c.end-c.at))<1);
  s.sound.play('demolish');assert.equal(s.calls.length,demolition.length);
  s.ctx.currentTime=2;s.sound.configure({effects:false});s.sound.play('demolish');assert.equal(s.calls.length,demolition.length);
  s.sound.configure({effects:true});s.sound.setHidden(true);s.sound.play('demolish');s.sound.play('cannotOperate');
  assert.equal(s.calls.length,demolition.length);
  s.sound.setHidden(false);await Promise.resolve();assert.equal(s.calls.length,demolition.length);
  s.sound.play('demolish');assert.ok(s.calls.length>demolition.length);
});

test('空闲夜末收起配乐时钟，恢复战斗或白天时只恢复一个时钟',async()=>{
  const s=setup();await s.sound.unlock();const queuedTick=[...s.timers][0];s.sound.setScene('battle',false,true);assert.equal(s.timers.size,0);
  const before=s.calls.length;s.ctx.currentTime=5;queuedTick();assert.equal(s.calls.length,before);
  s.sound.setScene('battle',false,false);assert.equal(s.timers.size,1);
  s.sound.setScene('build');assert.equal(s.timers.size,1);
});

test('独立进阶音约一秒收尾，短时去重且遵守音效音量、关闭和后台静音',async()=>{
  const s=setup();s.sound.configure({music:false});await s.sound.unlock();s.sound.play('upgrade');
  const first=[...s.calls];assert.ok(first.some(c=>c.kind==='noise'));assert.ok(first.some(c=>c.end-c.at>.6));
  assert.ok(Math.max(...first.map(c=>c.end))>1);assert.ok(Math.max(...first.map(c=>c.end))<1.2);
  s.sound.play('upgrade');assert.equal(s.calls.length,first.length);
  s.ctx.currentTime=2;s.sound.configure({effectsVolume:0});s.sound.play('upgrade');assert.equal(s.calls.length,first.length);
  s.sound.configure({effectsVolume:.5,effects:false});s.sound.play('upgrade');assert.equal(s.calls.length,first.length);
  s.sound.configure({effects:true});s.sound.setHidden(true);s.sound.play('upgrade');assert.equal(s.calls.length,first.length);
  s.sound.setHidden(false);await Promise.resolve();assert.equal(s.calls.length,first.length);
  s.sound.play('upgrade');assert.ok(s.calls.length>first.length);
});
