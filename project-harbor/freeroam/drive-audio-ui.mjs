import {driveAudioTargets} from './drive-audio-domain.mjs';
function mountVehicleAudio(driveAudioTargets){
 const Context=window.AudioContext||window.webkitAudioContext;
 const menu=document.querySelector("#menu .menu-panel");
 if(!Context||!menu)return;
 const key="harbor.vehicle-audio.v1";let settings={volume:.45,muted:false};
 try{const v=JSON.parse(localStorage.getItem(key)||"null");if(v){settings.volume=Number.isFinite(v.volume)?Math.max(0,Math.min(1,v.volume)):.45;settings.muted=Boolean(v.muted);}}catch{}
 const section=document.createElement("div");section.style.cssText="border-top:1px solid var(--line,#fff3);padding-top:10px;margin-top:12px;display:grid;gap:6px;font-size:13px";
 const heading=document.createElement("strong");heading.textContent="차량 사운드";
 const control=document.createElement("label");control.textContent="엔진 및 노면 소리 ";
 const volume=document.createElement("input");volume.type="range";volume.min="0";volume.max="100";volume.value=String(Math.round(settings.volume*100));volume.setAttribute("aria-label","차량 사운드 크기");volume.style.verticalAlign="middle";
 const muteLabel=document.createElement("label"),mute=document.createElement("input");mute.type="checkbox";mute.checked=settings.muted;muteLabel.append(mute," 차량 사운드 끄기");
 control.append(volume);section.append(heading,control,muteLabel);menu.append(section);
 let audio=null,failed=false,lastSpeed=0,last=performance.now(),closed=false;
 const persist=()=>{try{localStorage.setItem(key,JSON.stringify(settings));}catch{}};
 volume.addEventListener("input",()=>{settings.volume=Number(volume.value)/100;persist();});
 mute.addEventListener("change",()=>{settings.muted=mute.checked;persist();});
 function start(){
   if(closed||failed)return;
   if(audio){if(audio.ctx.state==="suspended")audio.ctx.resume().catch(()=>{});return;}
   try{
    const ctx=new Context(),master=ctx.createGain();master.gain.value=.6;master.connect(ctx.destination);
    const gain=()=>{const g=ctx.createGain();g.gain.value=0;g.connect(master);return g;};
    const engineGain=gain(),roadGain=gain(),skidGain=gain();
    const filter=ctx.createBiquadFilter();filter.type="lowpass";filter.frequency.value=700;filter.Q.value=.7;filter.connect(engineGain);
    const engine=ctx.createOscillator(),harmonic=ctx.createOscillator(),harmonicGain=ctx.createGain();
    engine.type="triangle";engine.frequency.value=26;engine.connect(filter);
    harmonic.type="sawtooth";harmonic.frequency.value=52;harmonicGain.gain.value=.12;harmonic.connect(harmonicGain).connect(filter);
    const noiseBuffer=ctx.createBuffer(1,ctx.sampleRate*2,ctx.sampleRate),samples=noiseBuffer.getChannelData(0);let seed=7219,prev=0;
    for(let i=0;i<samples.length;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;const white=seed/2147483648-1;prev=prev*.55+white*.45;samples[i]=prev;}
    const noise=ctx.createBufferSource();noise.buffer=noiseBuffer;noise.loop=true;
    const roadFilter=ctx.createBiquadFilter();roadFilter.type="lowpass";roadFilter.frequency.value=700;
    const skidFilter=ctx.createBiquadFilter();skidFilter.type="bandpass";skidFilter.frequency.value=1650;skidFilter.Q.value=1.1;
    noise.connect(roadFilter).connect(roadGain);noise.connect(skidFilter).connect(skidGain);
    engine.start();harmonic.start();noise.start();audio={ctx,engine,harmonic,filter,engineGain,roadGain,skidGain};ctx.resume().catch(()=>{});
   }catch{failed=true;}
 }
 for(const id of ["start","resume","reset"])document.getElementById(id)?.addEventListener("click",start);
 document.addEventListener("keydown",e=>{if(e.code==="Escape"||e.code==="KeyF")start();});
 const update=()=>{
  if(!audio||closed)return;
  const now=performance.now(),dt=Math.min(.25,(now-last)/1000);last=now;
  const view=globalThis.harborView;let f;
  const playing=!document.hidden&&view?.screen()==="play";
  if(playing){try{f=JSON.parse(view.frame());}catch{}}
  const car=f?.state?.vehicle,driving=Boolean(f?.alive&&f?.state?.isDriving);
  const speed=driving?Number(car?.speed)||0:0;
  const v=driveAudioTargets({playing,driving,speed,steering:Number(car?.steering)||0,previousSpeed:lastSpeed,dt,...settings});lastSpeed=speed;
  const t=audio.ctx.currentTime;
  for(const [param,value] of [[audio.engine.frequency,v.frequency],[audio.harmonic.frequency,v.frequency*2],[audio.filter.frequency,v.cutoff],[audio.engineGain.gain,v.engine],[audio.roadGain.gain,v.road],[audio.skidGain.gain,v.skid]])param.setTargetAtTime(value,t,.09);
 };
 const timer=setInterval(update,100);
 document.addEventListener("visibilitychange",()=>{if(document.hidden&&audio){for(const g of [audio.engineGain,audio.roadGain,audio.skidGain])g.gain.setTargetAtTime(0,audio.ctx.currentTime,.04);}else if(audio?.ctx.state==="suspended")audio.ctx.resume().catch(()=>{});});
 window.addEventListener("pagehide",e=>{if(e.persisted)return;closed=true;clearInterval(timer);audio?.ctx.close().catch(()=>{});},{once:true});
}
mountVehicleAudio(driveAudioTargets);
