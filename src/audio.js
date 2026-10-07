// 原型原创合成声音：同一主题的昼夜编曲，不下载素材，也不参与游戏结算。
export const AUDIO_DEFAULTS={music:true,effects:true,musicVolume:.28,effectsVolume:.65};
const STORAGE_KEY='cityx-audio-v1';
const frequency=note=>440*2**((note-69)/12);
const chords=[[50,57,60,64],[46,53,57,60],[48,55,60,64],[45,52,57,60]];
const melody=[74,null,76,77,null,72,69,null,74,null,72,69,null,67,69,null];

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
    osc.connect(gain);gain.connect(bus);if(bus===day||bus===night)gain.connect(wet);
    osc.onended=()=>{osc.disconnect();gain.disconnect();};osc.start(at);osc.stop(at+duration+.02);
  }
  function rustle(bus,at,duration,volume,cutoff) {
    const source=ctx.createBufferSource(),filter=ctx.createBiquadFilter(),gain=ctx.createGain();
    source.buffer=noise;filter.type='lowpass';filter.frequency.value=cutoff;
    gain.gain.setValueAtTime(0,at);gain.gain.linearRampToValueAtTime(volume,at+.005);
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
      const tense=mode==='night',bus=tense?night:day,seconds=60/(tense?92:72),chord=chords[Math.floor(beat/8)%chords.length];
      if(beat%8===0)for(const note of chord)tone(bus,note,nextBeat,seconds*7.7,.055,'sine',.3);
      if(beat%2===0)tone(bus,chord[(beat/2)%4]+12,nextBeat,seconds*2.2,tense?.055:.09,'triangle',.018);
      const lead=melody[Math.floor(beat/2)%melody.length];
      if(beat%2===0&&lead!==null)tone(bus,lead,nextBeat,seconds*2.5,tense?.025:.055,'sine',.04);
      if(tense&&!paused){
        tone(bus,chord[0]-12,nextBeat,seconds*.65,.15,'sine',.025);
        tone(bus,chord[0],nextBeat+seconds/2,seconds*.32,.045,'triangle',.015);
        if(beat%2===0)tone(bus,38,nextBeat,.2,.075,'sine',.005,38);
        if(beat%2===1)rustle(bus,nextBeat,.11,.014,1500);
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
    const next=phase==='build'?'day':phase==='lost'?'silent':'night';
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
    }else if(name==='won'){
      [62,69,74].forEach((note,i)=>tone(effects,note,at+i*.14,.55,.095,'sine',.02));
    }else if(name==='lost'){
      [50,45,38].forEach((note,i)=>tone(effects,note,at+i*.16,.65,.11,'triangle',.025));
    }
  }
  return {get settings(){return {...settings};},unlock,configure,setScene,setHidden,play};
}
