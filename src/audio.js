// 原型原创合成声音：昼夜独立编曲，不下载素材，也不参与游戏结算。
export const AUDIO_DEFAULTS={music:true,effects:true,musicVolume:.5,effectsVolume:.5};
const STORAGE_KEY='cityx-audio-v1';
const frequency=note=>440*2**((note-69)/12);
const chords=[[50,57,60,64],[46,53,57,60],[48,55,60,64],[45,52,57,60]];
const melody=[74,null,76,77,null,72,69,null,74,null,72,69,null,67,69,null];
const nightChords=[[38,45,50,51],[34,41,46,52],[36,43,48,49],[33,40,45,51]];
const nightPulse=[0,0,7,0,1,0,7,5,0,0,7,0,3,1,0,-5];

export function readAudioSettings(storage) {
  let saved={};try{saved=JSON.parse(storage?.getItem(STORAGE_KEY)||'{}')||{};}catch{}
  const result={...AUDIO_DEFAULTS};
  for(const name of ['music','effects'])if(typeof saved[name]==='boolean')result[name]=saved[name];
  for(const name of ['musicVolume','effectsVolume'])if(Number.isFinite(saved[name]))result[name]=Math.max(0,Math.min(1,saved[name]));
  return result;
}

export function createGameAudio(options={}) {
  let storage=options.storage;try{storage??=globalThis.localStorage;}catch{}
  const settings=readAudioSettings(storage),createContext=options.createContext??(()=>new (globalThis.AudioContext||globalThis.webkitAudioContext)());
  const repeat=options.repeat??setInterval,cancelRepeat=options.cancelRepeat??clearInterval;
  let ctx,music,effects,day,night,master,noise,wet,timer=null,nextBeat=0,beat=0;
  let mode='day',hidden=false,paused=false,unlocked=false,unavailable=false,waking=null;
  const lastEffect=new Map();

  // 音量平滑变化，开关与昼夜过渡不产生突兀的截断声。
  function level(node,value,seconds=.08) {
    if(!ctx||!node)return;
    node.gain.cancelScheduledValues(ctx.currentTime);
    node.gain.setTargetAtTime(value,ctx.currentTime,seconds);
  }
  function syncLevels() {
    level(music,settings.music?settings.musicVolume:0);
    level(effects,settings.effects?settings.effectsVolume:0,.015);
    level(day,mode==='day'?1:0,.5);level(night,mode==='night'?1:0,.5);
    level(master,hidden?0:1,.025);
  }
  function tone(bus,note,at,duration,volume=.08,type='sine',attack=.012,endFrequency=null) {
    const osc=ctx.createOscillator(),gain=ctx.createGain();osc.type=type;
    osc.frequency.setValueAtTime(frequency(note),at);
    if(endFrequency)osc.frequency.exponentialRampToValueAtTime(endFrequency,at+duration);
    gain.gain.setValueAtTime(0,at);gain.gain.linearRampToValueAtTime(volume,at+attack);
    gain.gain.exponentialRampToValueAtTime(.0001,at+duration);
    osc.connect(gain);gain.connect(bus);
    osc.onended=()=>{osc.disconnect();gain.disconnect();};osc.start(at);osc.stop(at+duration+.02);
  }
  function rustle(bus,at,duration,volume,cutoff,endCutoff=null,attack=.005) {
    const source=ctx.createBufferSource(),filter=ctx.createBiquadFilter(),gain=ctx.createGain();
    source.buffer=noise;source.loop=duration>.5;filter.type='lowpass';filter.frequency.setValueAtTime(cutoff,at);
    if(endCutoff)filter.frequency.exponentialRampToValueAtTime(endCutoff,at+duration);
    gain.gain.setValueAtTime(0,at);gain.gain.linearRampToValueAtTime(volume,at+attack);
    gain.gain.exponentialRampToValueAtTime(.0001,at+duration);
    source.connect(filter);filter.connect(gain);gain.connect(bus);
    source.onended=()=>{source.disconnect();filter.disconnect();gain.disconnect();};source.start(at);source.stop(at+duration+.02);
  }
  function init() {
    ctx=createContext();master=ctx.createGain();music=ctx.createGain();effects=ctx.createGain();day=ctx.createGain();night=ctx.createGain();
    const limiter=ctx.createDynamicsCompressor();limiter.threshold.value=-16;limiter.ratio.value=6;
    master.connect(limiter);limiter.connect(ctx.destination);music.connect(master);effects.connect(master);day.connect(music);night.connect(music);
    // 短混响只用于配乐，建设与到账音保留清晰的近景轮廓。
    const reverb=ctx.createConvolver(),impulse=ctx.createBuffer(2,Math.floor(ctx.sampleRate*1.6),ctx.sampleRate);
    for(let c=0;c<2;c++){const data=impulse.getChannelData(c);for(let i=0;i<data.length;i++)data[i]=(Math.random()*2-1)*(1-i/data.length)**3*.32;}
    reverb.buffer=impulse;wet=ctx.createGain();wet.gain.value=.18;wet.connect(reverb);reverb.connect(music);
    // 混响也经过昼夜总线，白天长音不会从湿声通道继续盖住夜晚。
    day.connect(wet);night.connect(wet);
    noise=ctx.createBuffer(1,Math.floor(ctx.sampleRate*.5),ctx.sampleRate);
    const data=noise.getChannelData(0);for(let i=0;i<data.length;i++)data[i]=Math.random()*2-1;
    master.gain.value=hidden?0:1;music.gain.value=settings.music?settings.musicVolume:0;effects.gain.value=settings.effects?settings.effectsVolume:0;
    day.gain.value=mode==='day'?1:0;night.gain.value=mode==='night'?1:0;
  }
  function stopClock() {if(timer!==null){cancelRepeat(timer);timer=null;}}
  function tickMusic() {
    if(!ctx||ctx.state!=='running'||hidden||!settings.music||settings.musicVolume===0||mode==='silent')return;
    if(nextBeat<ctx.currentTime-.2)nextBeat=ctx.currentTime+.05;
    while(nextBeat<ctx.currentTime+.18){
      const tense=mode==='night',bus=tense?night:day,seconds=60/(tense?108:72);
      if(tense){
        // 夜晚取消白天的舒缓旋律，低音与半音紧张和声铺底，短促动机持续推进。
        const chord=nightChords[Math.floor(beat/8)%nightChords.length];
        if(beat%8===0)for(const note of chord)tone(bus,note,nextBeat,seconds*7.7,.08,'triangle',.25);
        if(!paused){
          tone(bus,chord[0],nextBeat,seconds*.7,.25,'sine',.009);
          for(let i=0;i<4;i++)tone(bus,chord[0]+12+nightPulse[(beat*4+i)%nightPulse.length],nextBeat+i*seconds/4,seconds*.23,i===0?.13:.085,'triangle',.006);
          tone(bus,38,nextBeat,.17,.18,'sine',.003,32);
          rustle(bus,nextBeat+seconds/2,.06,.05,2800);
          if(beat%2===1)rustle(bus,nextBeat,.14,.085,1200);
        }
      }else{
        const chord=chords[Math.floor(beat/8)%chords.length];
        if(beat%8===0)for(const note of chord)tone(bus,note,nextBeat,seconds*7.7,.055,'sine',.3);
        if(beat%2===0)tone(bus,chord[(beat/2)%4]+12,nextBeat,seconds*2.2,.09,'triangle',.018);
        const lead=melody[Math.floor(beat/2)%melody.length];
        if(beat%2===0&&lead!==null)tone(bus,lead,nextBeat,seconds*2.5,.055,'sine',.04);
      }
      nextBeat+=seconds;beat++;
    }
  }
  function startClock() {
    if(!unlocked||!ctx||hidden||!settings.music||settings.musicVolume===0||mode==='silent'){stopClock();return;}
    if(timer===null){nextBeat=ctx.currentTime+.06;tickMusic();timer=repeat(tickMusic,80);}
  }
  async function unlock() {
    if(hidden||unavailable||(!settings.music&&!settings.effects))return;
    if(waking)return waking;
    try{
      if(!ctx)init();
      // 必须从玩家点击/按键进入；浏览器首次交互之前保持静音。
      if(ctx.state!=='running'){waking=ctx.resume();await waking;}
      unlocked=ctx.state==='running';syncLevels();startClock();
    }catch{if(!ctx)unavailable=true;}finally{waking=null;}
  }
  function configure(patch) {
    for(const name of ['music','effects'])if(typeof patch[name]==='boolean')settings[name]=patch[name];
    for(const name of ['musicVolume','effectsVolume'])if(Number.isFinite(patch[name]))settings[name]=Math.max(0,Math.min(1,patch[name]));
    try{storage?.setItem(STORAGE_KEY,JSON.stringify(settings));}catch{}
    syncLevels();startClock();
  }
  function setScene(phase,isPaused=false) {
    const next=phase==='build'?'day':['won','lost'].includes(phase)?'silent':'night';
    if(next!==mode){mode=next;beat=0;nextBeat=(ctx?.currentTime??0)+.06;}
    paused=isPaused;syncLevels();startClock();
  }
  function setHidden(value) {
    hidden=value;syncLevels();
    if(hidden){stopClock();if(ctx?.state==='running')ctx.suspend().catch(()=>{});}
    else if(unlocked){ctx.resume().then(()=>{syncLevels();startClock();}).catch(()=>{});}
  }
  // 同一类别短时间合并；4×防守也只播放结算发生时的一次反馈。
  function play(name,delay=0) {
    if(!ctx||hidden||!settings.effects||settings.effectsVolume===0)return;
    // 首次直接点地图建设时，等待这次手势解锁，避免漏掉第一声反馈。
    if(!unlocked||ctx.state!=='running'){if(waking)waking.then(()=>play(name,delay)).catch(()=>{});return;}
    const now=ctx.currentTime;if(now-(lastEffect.get(name)??-Infinity)<.075)return;
    lastEffect.set(name,now);const at=now+.008+delay;
    if(name==='coin'){
      tone(effects,88,at,.12,.16);tone(effects,95,at+.065,.16,.12);tone(effects,100,at+.12,.19,.06);
    }else if(name==='kill'){
      tone(effects,52,at,.14,.24,'sine',.004,55);rustle(effects,at,.10,.09,1800);
    }else if(name==='build'||name==='repair'){
      rustle(effects,at,.075,.1,1100);tone(effects,43,at,.16,.18,'sine',.005,65);
      [62,69,74].forEach((note,i)=>tone(effects,note,at+.055+i*.045,.16,.07,'triangle'));
    }else if(name==='clear'){
      rustle(effects,at,.18,.09,900);tone(effects,50,at,.12,.1,'triangle',.01,90);
    }else if(name==='hurt'){
      tone(effects,40,at,.3,.22,'sine',.006,35);rustle(effects,at,.17,.08,650);
    }else if(name==='sunset'){
      // 落日：空气下沉、低音扫落，收尾是一声远处的闷响。
      rustle(effects,at,1.3,.13,2500,180,.2);
      tone(effects,62,at,1.65,.18,'sine',.06,55);
      tone(effects,50,at+.15,1.5,.12,'triangle',.1,38);
      tone(effects,38,at+.55,.75,.2,'sine',.01,32);
    }else if(name==='dawn'){
      // 天亮：暖色大和弦缓慢展开，避开短音阶提示音的“消息通知”轮廓。
      [50,57,62,66,69].forEach((note,i)=>tone(effects,note,at+i*.025,2.7+i*.1,.085,'sine',.42));
      tone(effects,74,at+.3,2.8,.035,'triangle',.6);
      rustle(effects,at+.15,1.7,.035,600,1800,.5);
    }else if(name==='lost'){
      [50,45,38].forEach((note,i)=>tone(effects,note,at+i*.16,.65,.11,'triangle',.025));
    }
  }
  return {get settings(){return {...settings};},unlock,configure,setScene,setHidden,play};
}
