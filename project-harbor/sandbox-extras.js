/* Project Harbor: optional sandbox activities, using the read-only browser frame bridge. */
(()=>{'use strict';
const courses=[{"id":"harbor-loop","name":"항만 순환 코스","points":[[40,33],[40,71],[-39,71],[-39,33],[40,33]]},{"id":"civic-run","name":"도심 대로 코스","points":[[-155,-242],[-155,-345],[-70,-345],[-70,-440],[22,-440],[22,-530]]},{"id":"cinder-run","name":"사막 패스 코스","points":[[-595,-440],[-599,-381],[-591,-327],[-565,-275],[-530,-247],[-460,-242]]}];
courses.push(...[{"id":"alder-drive","name":"숲속 파크웨이","points":[[-580,174],[-562,224],[-581,278],[-581,361],[-570,413],[-541,438],[-215,438]]},{"id":"coast-drive","name":"랜턴 포인트 해안","points":[[99,170],[99,438],[385,438],[482,438],[540,420],[568,379],[568,326],[554,287]]},{"id":"station-drive","name":"기지 외곽 순환","points":[[224,-530],[224,-268],[550,-268],[550,-530]]}]);
courses.push(...[{"id":"quay","name":"부두 직선 코스","points":[[-130,33],[-85,33],[-39,33],[40,33],[99,33]]},{"id":"civic","name":"시빅 스트리트","points":[[-140,-345],[-70,-345],[22,-345],[105,-345],[170,-345]]},{"id":"rail","name":"철도 교차로 코스","points":[[-140,-119],[-85,-119],[-39,-119],[40,-119],[99,-119]]}]);
const traps=[{"id":"boulevard","name":"Union Boulevard","point":[-110,-440]},{"id":"harbor","name":"Calloway Boulevard","point":[-95,33]},{"id":"desert","name":"Cinder Main","point":[-591,-327]},{"id":"forest","name":"Alderwash Parkway","point":[-581,320]},{"id":"coast","name":"Seabank Road","point":[290,438]}];
traps.push(...[{"id":"lighthouse","name":"Lighthouse Drive","point":[99,-80]},{"id":"supply","name":"Supply Road","point":[-105,-175]},{"id":"meridian","name":"Meridian Avenue","point":[22,-470]}]);
function distance(p,q){return Math.hypot(p.x-q[0],p.z-q[1]);}
function advance(run,course,position,driving,alive,dt){
 if(run.finished||run.cancelled)return {...run};
 if(!alive||(!driving&&run.started))return {...run,cancelled:true};
 const next={...run};
 if(!driving)return next;
 if(!next.started){if(distance(position,course.points[0])<=12){next.started=true;next.index=1;}return next;}
 next.seconds+=Number.isFinite(dt)?Math.max(0,Math.min(dt,.5)):0;
 if(distance(position,course.points[next.index])<=12){next.index++;if(next.index===course.points.length)next.finished=true;}
 return next;
}
function bearing(p,q){return ["북","북동","동","남동","남","남서","서","북서"][Math.round((Math.atan2(q[0]-p.x,-(q[1]-p.z))*180/Math.PI+360)/45)%8];}
function track(previous, sample, stats){
 const next={...stats,traps:{...stats.traps}};
 if(!sample.alive)return {stats:next,peak:0};
 const moved=previous?.alive?Math.hypot(sample.x-previous.x,sample.z-previous.z):0;
 const continuous=Boolean(previous?.alive&&moved<=35&&(previous.generation==null||sample.generation==null||previous.generation===sample.generation));
 if(continuous&&previous.driving===sample.driving)next[sample.driving?"driveMeters":"walkMeters"]+=moved;
 let peak=continuous?Math.max(previous.peak||0,sample.wanted):sample.wanted;
 if(continuous&&previous.wanted>0&&sample.wanted===0&&peak>=2){next.escapes++;next.maxEscape=Math.max(next.maxEscape,peak);peak=0;}
 if(!sample.wanted)peak=0;
 if(sample.driving&&Number.isFinite(sample.speed)&&sample.speed>=15&&sample.speed<=450){
  for(const trap of traps)if(Math.hypot(sample.x-trap.point[0],sample.z-trap.point[1])<=16)next.traps[trap.id]=Math.max(next.traps[trap.id]||0,sample.speed);
 }
 return {stats:next,peak};
}
function projectPoint(p,a,b){
 const dx=b[0]-a[0],dz=b[1]-a[1],d=dx*dx+dz*dz;
 const t=d?Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dz)/d)):0;
 const q=[a[0]+dx*t,a[1]+dz*t];return {t,q,d:Math.hypot(p[0]-q[0],p[1]-q[1])};
}
function roadGraph(roads){
 const segments=[];
 for(const r of roads){
  if(r.kind==="path"||r.kind==="runway")continue;
  let a=r.from,b=r.to;
  if(!a||!b){
   if(!r.center||!r.size)continue;
   const [x,z]=r.center,[w,h]=r.size;
   a=w>=h?[x-w/2,z]:[x,z-h/2];b=w>=h?[x+w/2,z]:[x,z+h/2];
  }
  if(![...a,...b].every(Number.isFinite)||Math.hypot(b[0]-a[0],b[1]-a[1])<.1)continue;
  segments.push({a,b,cuts:[0,1]});
 }
 const cross=(ax,az,bx,bz)=>ax*bz-az*bx;
 for(let i=0;i<segments.length;i++)for(let j=i+1;j<segments.length;j++){
  const p=segments[i],q=segments[j],rx=p.b[0]-p.a[0],rz=p.b[1]-p.a[1],sx=q.b[0]-q.a[0],sz=q.b[1]-q.a[1],dx=q.a[0]-p.a[0],dz=q.a[1]-p.a[1],den=cross(rx,rz,sx,sz);
  if(Math.abs(den)>1e-8){
   const t=cross(dx,dz,sx,sz)/den,u=cross(dx,dz,rx,rz)/den;
   if(t>=-1e-7&&t<=1+1e-7&&u>=-1e-7&&u<=1+1e-7){p.cuts.push(Math.max(0,Math.min(1,t)));q.cuts.push(Math.max(0,Math.min(1,u)));}
  }else{
   for(const e of [q.a,q.b]){const hit=projectPoint(e,p.a,p.b);if(hit.d<.02)p.cuts.push(hit.t);}
   for(const e of [p.a,p.b]){const hit=projectPoint(e,q.a,q.b);if(hit.d<.02)q.cuts.push(hit.t);}
  }
 }
 const points=[],edges=[],adj=[],ids=new Map(),unique=new Set();
 const node=p=>{const key=p.map(v=>Math.round(v*100)).join(",");if(ids.has(key))return ids.get(key);const id=points.length;ids.set(key,id);points.push(p);adj.push([]);return id;};
 for(const s of segments){
  const cuts=[...new Set(s.cuts.map(t=>Math.round(t*1e8)/1e8))].sort((a,b)=>a-b);
  const list=cuts.map(t=>node([s.a[0]+(s.b[0]-s.a[0])*t,s.a[1]+(s.b[1]-s.a[1])*t]));
  for(let i=1;i<list.length;i++){
   const a=list[i-1],b=list[i],key=[Math.min(a,b),Math.max(a,b)].join(":");if(a===b||unique.has(key))continue;unique.add(key);
   const d=Math.hypot(points[a][0]-points[b][0],points[a][1]-points[b][1]);edges.push({a,b,d});adj[a].push({to:b,d});adj[b].push({to:a,d});
  }
 }
 return {points,edges,adj};
}
function roadRoute(graph,from,to){
 if(!graph?.edges.length)return null;
 const nearest=p=>{let best=null;for(const edge of graph.edges){const hit=projectPoint(p,graph.points[edge.a],graph.points[edge.b]);if(!best||hit.d<best.d)best={...hit,edge};}return best;};
 const start=nearest(from),end=nearest(to);if(!start||!end||start.d>70||end.d>70)return null;
 if(start.edge===end.edge)return {points:[start.q,end.q],meters:Math.hypot(start.q[0]-end.q[0],start.q[1]-end.q[1]),offRoad:end.d};
 const n=graph.points.length,dist=Array(n).fill(Infinity),prev=Array(n).fill(-1),used=Array(n).fill(false);
 dist[start.edge.a]=start.t*start.edge.d;dist[start.edge.b]=(1-start.t)*start.edge.d;
 for(let i=0;i<n;i++){
  let u=-1;for(let j=0;j<n;j++)if(!used[j]&&(u<0||dist[j]<dist[u]))u=j;
  if(u<0||!Number.isFinite(dist[u]))break;used[u]=true;
  for(const e of graph.adj[u])if(dist[u]+e.d<dist[e.to]){dist[e.to]=dist[u]+e.d;prev[e.to]=u;}
 }
 const ca=dist[end.edge.a]+end.t*end.edge.d,cb=dist[end.edge.b]+(1-end.t)*end.edge.d,meters=Math.min(ca,cb);
 if(!Number.isFinite(meters))return null;
 let u=ca<=cb?end.edge.a:end.edge.b,route=[];
 while(u>=0){route.push(graph.points[u]);u=prev[u];}
 return {points:[start.q,...route.reverse(),end.q],meters,offRoad:end.d};
}
function mapProjection(bounds,width,height){
 const {min,max}=bounds;
 const scale=Math.min((width-40)/(max[0]-min[0]),(height-32)/(max[1]-min[1]));
 const cx=(min[0]+max[0])/2,cz=(min[1]+max[1])/2;
 return {point:(x,z)=>[width/2+(x-cx)*scale,height/2+(z-cz)*scale],world:(x,y)=>[(x-width/2)/scale+cx,(y-height/2)/scale+cz]};
}
function canvasFit(canvas){
 const r=canvas.getBoundingClientRect(),scale=Math.min(r.width/canvas.width,r.height/canvas.height);
 return {left:r.left+(r.width-canvas.width*scale)/2,top:r.top+(r.height-canvas.height*scale)/2,width:canvas.width*scale,height:canvas.height*scale,scale};
}
function drawPins(ctx,point,selected,course,run,landmarks,visited,showAll,route){
 if(route&&!course){ctx.save();ctx.strokeStyle='#f4be72';ctx.lineWidth=3;ctx.lineJoin='round';ctx.lineCap='round';ctx.beginPath();route.points.forEach((p,i)=>{const [x,y]=point(...p);if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);});ctx.stroke();ctx.restore();}
 const draw=(p,color,r)=>{const [x,y]=point(...p);if(x<0||y<0||x>ctx.canvas.width||y>ctx.canvas.height)return;ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fillStyle=color;ctx.fill();ctx.strokeStyle="#172429";ctx.lineWidth=1.5;ctx.stroke();};
 if(showAll){
  for(const l of landmarks)draw([l.position[0],l.position[2]],visited.includes(l.id)?"#92e0d1":"#e9e6db",3.1);
  for(const t of traps){const [x,y]=point(...t.point);ctx.fillStyle="#fbc27d";ctx.fillRect(x-3,y-3,6,6);}
 }
 if(course&&run){
  ctx.save();ctx.strokeStyle="#eab774";ctx.lineWidth=2.5;ctx.setLineDash([6,5]);ctx.beginPath();
  course.points.slice(run.index).forEach((p,i)=>{const [x,y]=point(...p);if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);});ctx.stroke();ctx.restore();
  course.points.slice(run.index).forEach((p,i)=>draw(p,i===0?"#f6c574":"#d9a261",i===0?5.5:3));
 }else if(selected)draw(selected.point,"#f6c574",6);
}
const stations=[{"id":"off","name":"라디오 끄기","bpm":0,"notes":[],"wave":"sine"},{"id":"after-hours","name":"88.3 After Hours","bpm":86,"notes":[45,48,52,55,43,47,50,55,41,45,48,52,43,47,50,53],"wave":"triangle"},{"id":"coastline","name":"94.7 Coastline","bpm":112,"notes":[48,55,60,64,50,57,62,65,45,52,57,60,43,50,55,59],"wave":"sine"},{"id":"freight","name":"103.1 Freight FM","bpm":136,"notes":[36,36,43,39,38,38,45,41,41,41,48,45,43,43,50,46],"wave":"sawtooth"}];
function audioModel(frame){
 const state=frame?.state||{},driving=!!(frame?.alive&&state.isDriving);
 const speed=driving?Math.abs(Number(state.vehicle?.speed)||0):0;
 const kind=(state.vehicle?.vehicleClass||"").toLowerCase();
 const heavy=/truck|utility|military|van/.test(kind),sport=/sport|runner/.test(kind);
 const freq=(heavy?34:sport?58:43)+Math.min(65,speed)*(heavy?2.5:sport?5:3.4);
 const nearest=(state.enemies||[]).filter(e=>e.team===3&&e.health>0&&e.position).reduce((d,e)=>Math.min(d,Math.hypot(e.position.x-frame.position.x,e.position.z-frame.position.z)),Infinity);
 const siren=frame?.alive&&state.wantedLevel>=2&&Number.isFinite(nearest)?Math.max(0,1-nearest/100):0;
 return {driving,speed,freq,engine:driving?.055+Math.min(speed/65,.8)*.075:0,wind:driving?Math.min(.065,speed/65*.065):0,siren};
}
function noteFrequency(note){return 440*2**((note-69)/12);}
function musicStep(station,index){
 const seq=station.notes,base=seq[index%seq.length],step=index%4;
 if(!seq.length)return null;
 return {lead:noteFrequency(base+12),bass:step===0||step===2?noteFrequency(base-12):0,beat:step===0||step===2,accent:step===1||step===3};
}
function mountVehicleSound(){
 const hud=document.getElementById("hud"),menu=document.querySelector("#menu .menu-panel");
 if(!hud||!menu||document.getElementById("harbor-vehicle-audio"))return;
 const make=(tag,text)=>{const e=document.createElement(tag);if(text)e.textContent=text;return e;};
 const style=make("style",`#harbor-vehicle-audio{margin-top:15px;padding-top:12px;border:0;border-top:1px solid #ffffff2b;color:#e9e5dc;font-size:13px}
 #harbor-vehicle-audio legend{color:#fac27d;padding:0 5px;font-weight:650}#harbor-vehicle-audio label{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:8px 0}
 #harbor-vehicle-audio select{background:#15242b;color:#fff6e8;border:1px solid #ffffff35;padding:6px;border-radius:4px}
 #harbor-vehicle-audio input[type=range]{width:45%;accent-color:#92e0d1}
 #harbor-car-radio{position:absolute;right:var(--edge,16px);bottom:calc(var(--edge,16px) + 130px);padding:6px 10px;font-size:12px;pointer-events:none;text-align:right;max-width:45vw;color:#d4ded9}
 #harbor-car-radio strong{display:block;color:#fac27d;font-weight:650}#harbor-car-radio small{display:block;color:#bfc9c5}
 @media(max-width:600px){#harbor-car-radio{bottom:calc(var(--edge,16px) + 190px);font-size:10px}}`);
 document.head.append(style);
 const key="harbor-vehicle-audio-v1",clamp=x=>Math.max(0,Math.min(1,x));
 let settings={effects:.6,radio:.35,station:"off",muted:false};
 try{const a=JSON.parse(localStorage.getItem(key)||"null");if(a){for(const k of ["effects","radio"])if(Number.isFinite(a[k]))settings[k]=clamp(a[k]);if(stations.some(s=>s.id===a.station))settings.station=a.station;settings.muted=a.muted===true;}}catch{}
 const persist=()=>{try{localStorage.setItem(key,JSON.stringify(settings));}catch{}};
 const field=make("fieldset");field.id="harbor-vehicle-audio";field.append(make("legend","차량 · 라디오"));
 const radio=make("select");radio.setAttribute("aria-label","라디오 방송국");
 for(const station of stations){const option=make("option",station.name);option.value=station.id;radio.append(option);}
 radio.value=settings.station;
 const stationLabel=make("label","방송국");stationLabel.append(radio);field.append(stationLabel);
 for(const [k,title] of [["effects","차량·도시 효과음"],["radio","라디오 음량"]]){
  const label=make("label",title),input=make("input");input.type="range";input.min="0";input.max="1";input.step=".05";input.value=String(settings[k]);input.addEventListener("input",()=>{settings[k]=Number(input.value);persist();});label.append(input);field.append(label);
 }
 const muteLabel=make("label","추가 음향 음소거"),mute=make("input");mute.type="checkbox";mute.checked=settings.muted;mute.addEventListener("change",()=>{settings.muted=mute.checked;persist();});muteLabel.append(mute);field.append(muteLabel);
 field.append(make("p","운전 중 B: 방송국 변경 · H: 경적. 터치 화면에서도 조작할 수 있습니다. 라디오는 오리지널 합성 음악입니다."));menu.append(field);
 const display=make("div");display.id="harbor-car-radio";display.className="panel";display.hidden=true;
 const stationName=make("strong"),readout=make("small"),instruction=make("small","B 방송국 · H 경적");display.append(stationName,readout,instruction);hud.append(display);
 let context=null,master=null,fx=null,music=null,engine=null,harmonic=null,engineGain=null,windGain=null,siren=null,sirenGain=null,wind=null,windFilter=null;
 let nextNote=0,beat=0,stationId="",lastHorn=-Infinity,previous=null,lastVersion=-1,lastFrame=null,stepDistance=0;
 const transient=new Set(),musicVoices=new Set();
 const enabled=()=>globalThis.harborView?.screen?.()==="play"&&!document.hidden;
 function unlock(){
  if(!context){
   const Audio=window.AudioContext||window.webkitAudioContext;if(!Audio)return;
   try{
    context=new Audio();master=context.createGain();master.gain.value=0;master.connect(context.destination);
    fx=context.createGain();fx.gain.value=settings.effects;fx.connect(master);
    music=context.createGain();music.gain.value=settings.radio;music.connect(master);
    const pair=(type,dest)=>{const osc=context.createOscillator(),g=context.createGain();osc.type=type;g.gain.value=0;osc.connect(g);g.connect(dest);osc.start();return [osc,g];};
    [engine,engineGain]=pair("triangle",fx);
    harmonic=context.createOscillator();harmonic.type="sine";harmonic.connect(engineGain);harmonic.start();
    [siren,sirenGain]=pair("sine",fx);
    const buffer=context.createBuffer(1,context.sampleRate*2,context.sampleRate),samples=buffer.getChannelData(0);
    for(let i=0;i<samples.length;i++)samples[i]=Math.random()*2-1;
    wind=context.createBufferSource();wind.buffer=buffer;wind.loop=true;windFilter=context.createBiquadFilter();windFilter.type="lowpass";windFilter.frequency.value=450;
    windGain=context.createGain();windGain.gain.value=0;wind.connect(windFilter);windFilter.connect(windGain);windGain.connect(fx);wind.start();
   }catch{context=null;return;}
  }
  if(context.state==="suspended")context.resume().catch(()=>{});
 }
 const set=(param,value,time=.07)=>{if(context&&param)param.setTargetAtTime(value,context.currentTime,time);};
 function tone(freq,duration,volume,wave,bus,start=context.currentTime){
  if(!context||context.state!=="running"||!Number.isFinite(freq)||volume<=0)return;
  const osc=context.createOscillator(),g=context.createGain();osc.type=wave;osc.frequency.value=freq;g.gain.setValueAtTime(.0001,start);g.gain.exponentialRampToValueAtTime(Math.max(.0002,volume),start+.012);g.gain.exponentialRampToValueAtTime(.0001,start+duration);osc.connect(g);g.connect(bus);
  transient.add(osc);if(bus===music)musicVoices.add(osc);osc.onended=()=>{transient.delete(osc);musicVoices.delete(osc);osc.disconnect();g.disconnect();};osc.start(start);osc.stop(start+duration+.02);
 }
 function stopMusic(){for(const osc of musicVoices){try{osc.stop();}catch{}}musicVoices.clear();nextNote=0;beat=0;}
 function changeStation(id){settings.station=id;radio.value=id;stationId="";stopMusic();persist();}
 radio.addEventListener("change",()=>changeStation(radio.value));
 for(const el of ["start","resume"])document.getElementById(el)?.addEventListener("click",unlock);
 const canUse=()=>enabled()&&lastFrame?.alive&&lastFrame.state?.isDriving;
 function nextStation(){if(!canUse())return;unlock();changeStation(stations[(stations.findIndex(s=>s.id===settings.station)+1)%stations.length].id);}
 function horn(){if(!canUse())return;unlock();if(context&&context.currentTime-lastHorn>.3&&!settings.muted){lastHorn=context.currentTime;tone(370,.32,.13,"triangle",fx);tone(440,.32,.08,"triangle",fx);}}
 document.addEventListener("keydown",event=>{
  if(event.repeat||event.ctrlKey||event.altKey||event.metaKey||!canUse())return;
  if(event.code==="KeyB"){event.preventDefault();nextStation();}
  if(event.code==="KeyH"){event.preventDefault();horn();}
 });
 const mobile=document.querySelector("#touch .touch-actions");
 const mobileRadio=make("button","라디오"),mobileHorn=make("button","경적");
 for(const [button,handler] of [[mobileRadio,nextStation],[mobileHorn,horn]]){button.type="button";button.hidden=true;button.addEventListener("click",handler);mobile?.append(button);}
 const coarse=window.matchMedia("(pointer: coarse)");
 function tick(){
  const active=enabled(),view=globalThis.harborView;
  if(active&&view?.frameVersion?.()!==lastVersion){lastVersion=view.frameVersion();try{lastFrame=JSON.parse(view.frame());}catch{lastFrame=null;}}
  const frame=lastFrame,model=audioModel(frame),playing=active&&model.driving;
  display.hidden=!playing;
  mobileRadio.hidden=mobileHorn.hidden=!playing||!coarse.matches;
  if(playing){const s=stations.find(s=>s.id===settings.station)||stations[0];stationName.textContent=s.name;readout.textContent=(frame.state.vehicle?.displayName||"차량")+" · "+Math.round(model.speed*3.6)+" km/h";}
  if(!context)return;
  const audible=active&&frame?.alive&&!settings.muted;
  set(master.gain,audible?1:0,.04);set(fx.gain,settings.effects);set(music.gain,playing?settings.radio:0);
  set(engine.frequency,model.freq);set(harmonic.frequency,model.freq*2.03);set(engineGain.gain,audible?model.engine:0);
  set(windFilter.frequency,450+model.speed*24);set(windGain.gain,audible?model.wind:0);
  const phase=context.currentTime*2.8;set(siren.frequency,650+180*Math.sin(phase));set(sirenGain.gain,audible?model.siren*.075:0);
  if(audible&&frame?.position){
   if(previous&&!model.driving&&!previous.driving){const d=Math.hypot(frame.position.x-previous.x,frame.position.z-previous.z);if(d<4)stepDistance+=d;else stepDistance=0;if(stepDistance>(frame.sprinting?.8:.65)){stepDistance=0;tone(85,.095,.033,"triangle",fx);}}
   if(previous?.driving&&model.driving&&previous.vehicleId===frame.state.playerVehicleId&&previous.speed-model.speed>8){tone(55,.2,.065,"triangle",fx);}
   previous={x:frame.position.x,z:frame.position.z,driving:model.driving,speed:model.speed,vehicleId:frame.state.playerVehicleId};
  }else{previous=null;stepDistance=0;}
  const station=stations.find(s=>s.id===settings.station)||stations[0];
  if(!audible||!playing||!station.bpm||settings.radio===0){if(nextNote)stopMusic();return;}
  if(stationId!==station.id){stopMusic();stationId=station.id;}
  const now=context.currentTime,interval=60/station.bpm/2;
  if(!nextNote||nextNote<now-.25)nextNote=now+.025;
  while(nextNote<now+.13){
   const n=musicStep(station,beat++);if(!n)break;
   tone(n.lead,interval*.82,.035,station.wave,music,nextNote);
   if(n.bass)tone(n.bass,interval*1.5,.075,"sine",music,nextNote);
   if(n.beat)tone(58,.12,.08,"sine",music,nextNote);
   if(n.accent)tone(170,.035,.018,"triangle",music,nextNote);
   nextNote+=interval;
  }
 }
 setInterval(tick,80);
 document.addEventListener("visibilitychange",()=>{if(document.hidden){stopMusic();if(master)set(master.gain,0,.025);}});
 window.addEventListener("pagehide",event=>{stopMusic();if(event.persisted){if(master)set(master.gain,0,.025);context?.suspend().catch(()=>{});}else context?.close().catch(()=>{});});
 window.addEventListener("pageshow",event=>{if(event.persisted&&context?.state==="suspended")context.resume().catch(()=>{});});
}
function migrateLegacy(saved,stats,legacy){
 if(!legacy||typeof legacy!=="object")return;
 const valid=n=>Number.isFinite(n)&&n>=0;
 for(const id of Array.isArray(legacy.visited)?legacy.visited:[])if(typeof id==="string"&&!saved.visited.includes(id))saved.visited.push(id);
 for(const c of courses){const n=legacy.best?.[c.id];if(valid(n)&&n>0)saved.records[c.id]=Math.min(saved.records[c.id]||Infinity,n);}
 for(const t of traps){const n=legacy.speeds?.[t.id];if(valid(n)&&n<=450)stats.traps[t.id]=Math.max(stats.traps[t.id]||0,n);}
 for(const [old,k] of [["walk","walkMeters"],["drive","driveMeters"],["escapes","escapes"]])if(valid(legacy.trip?.[old]))stats[k]=Math.max(stats[k],legacy.trip[old]);
 if(valid(legacy.trip?.topSpeed)&&legacy.trip.topSpeed<=450)saved.topSpeed=Math.max(saved.topSpeed,legacy.trip.topSpeed);
}
function mount(){
 const hud=document.getElementById("hud"), map=document.getElementById("map"), atlas=document.getElementById("atlas");
 if(!hud||!map||!atlas||document.getElementById("harbor-free-roam"))return;
 mountVehicleSound();
 const key="harbor-exploration-v1";
 let saved={visited:[],records:{},topSpeed:0};
 const statsKey="harbor-free-roam-stats-v1";
 let stats={driveMeters:0,walkMeters:0,escapes:0,maxEscape:0,traps:{}};
 try{const a=JSON.parse(localStorage.getItem(statsKey)||"null");if(a){for(const k of ["driveMeters","walkMeters","escapes","maxEscape"])if(Number.isFinite(a[k])&&a[k]>=0)stats[k]=a[k];for(const t of traps)if(Number.isFinite(a.traps?.[t.id])&&a.traps[t.id]>=0&&a.traps[t.id]<=450)stats.traps[t.id]=a.traps[t.id];}}catch{}
 try{const data=JSON.parse(localStorage.getItem(key)||"null");if(data&&Array.isArray(data.visited)&&data.records&&typeof data.records==="object"){saved={visited:data.visited.filter(x=>typeof x==="string"),records:Object.fromEntries(Object.entries(data.records).filter(([k,v])=>courses.some(c=>c.id===k)&&Number.isFinite(v)&&v>0)),topSpeed:Number.isFinite(data.topSpeed)?Math.max(0,data.topSpeed):0};}}catch{}
 const save=()=>{try{localStorage.setItem(key,JSON.stringify(saved));localStorage.setItem(statsKey,JSON.stringify(stats));}catch{}};
 try{if(!localStorage.getItem("harbor-free-roam-migrated-v1")){migrateLegacy(saved,stats,JSON.parse(localStorage.getItem("harbor.freeroam.v1")||"null"));localStorage.setItem(key,JSON.stringify(saved));localStorage.setItem(statsKey,JSON.stringify(stats));localStorage.setItem("harbor-free-roam-migrated-v1","1");}}catch{}
 const element=(tag,cls,txt)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(txt)e.textContent=txt;return e;};
 const style=element("style");style.textContent=`
 #harbor-free-roam{position:absolute;top:calc(var(--edge,16px) + 150px);left:var(--edge,16px);max-width:min(245px,45vw);padding:8px 11px;font-size:12px;line-height:1.5;color:#e9e5dc;pointer-events:none}
 #harbor-free-roam strong{color:#fac27d;display:block;font-weight:650}
 #harbor-free-roam p{margin:2px 0;overflow-wrap:anywhere}
 #harbor-discovery{border-top:1px solid #ffffff2b;margin-top:12px;padding-top:10px;font-size:13px}
 #harbor-discovery summary{cursor:pointer;font-weight:650;color:#fac27d;padding:5px 0}
 #harbor-discovery .harbor-extra-row{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin:8px 0}
 #harbor-discovery select{max-width:100%;min-height:34px;background:#15242b;color:#fff6e8;border:1px solid #ffffff35;border-radius:4px;padding:5px}
 #harbor-discovery .quiet{font-size:12px;padding:6px 9px}
 #harbor-discovery p{line-height:1.5;color:#bfc9c5;margin:5px 0}
 #harbor-discovery .harbor-records{margin:8px 0;display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:5px 12px}
 #harbor-discovery .harbor-records div{padding:4px 0;border-bottom:1px solid #ffffff18}
 #harbor-discovery .harbor-records strong{color:#fff6e8;font-weight:650}
 #harbor-discovery .harbor-records small{display:block;color:#bfc9c5}
 #atlas{cursor:crosshair}
 .harbor-map-pins{position:fixed;pointer-events:none;z-index:4;display:block}
 #harbor-map-pins-radar{z-index:2}
 @media(max-width:600px){#harbor-free-roam{top:calc(var(--edge,16px) + 110px);font-size:11px;max-width:44vw;padding:5px 8px}}
 `;
 document.head.append(style);
 const panel=element("div","panel");panel.id="harbor-free-roam";panel.hidden=true;
 const heading=element("strong"), progress=element("p"), nav=element("p");panel.append(heading,progress,nav);hud.append(panel);
 const details=element("details");details.id="harbor-discovery";details.append(element("summary","","자유 탐험 · 주행 기록"));
 const description=element("p","","명소를 방문하면 탐험 기록이 남습니다. 주행 코스는 선택 사항이며 차량으로 시작점에 접근하면 기록이 시작됩니다.");
 const summary=element("p"), status=element("p");
 const records=element("div","harbor-records");
 const mapHelp=element("p","","지도 클릭으로 목적지를 지정하세요. 운전 중 금색 실선은 추정 도로 경로, 점선은 주행 코스 연결선입니다. 금색 사각형은 속도 측정 구간입니다.");
 const row=element("div","harbor-extra-row"), select=element("select");select.setAttribute("aria-label","탐험 목적지");
 const defaultOption=element("option","","목적지 없음");defaultOption.value="";select.append(defaultOption);
 const routeRow=element("div","harbor-extra-row"), routeSelect=element("select");routeSelect.setAttribute("aria-label","주행 코스");
 for(const c of courses){const o=element("option","",c.name);o.value=c.id;routeSelect.append(o);}
 const choose=element("button","quiet","코스 선택");choose.type="button";
 const cancel=element("button","quiet","코스 취소");cancel.type="button";
 const clear=element("button","quiet","목적지 해제");clear.type="button";
 row.append(select,clear);routeRow.append(routeSelect,choose,cancel);details.append(description,summary,row,routeRow,status,mapHelp,records);
 (map.querySelector(".map-panel")||map).append(details);
 let landmarks=[], target=null, course=null, run=null, lastVersion=-1,lastTime=performance.now(),lastPos=null,lastSave=0,lastNotice="",noticeUntil=0;
 let bounds=null,latest=null,previousSample=null,graph=null,route=null,routeTarget=null,routeFrom=null;
 function getRoute(){
  if(!graph||!latest?.driving||!target||course){route=null;routeTarget=null;return null;}
  if(routeTarget!==target||!routeFrom||Math.hypot(latest.x-routeFrom[0],latest.z-routeFrom[1])>10){routeTarget=target;routeFrom=[latest.x,latest.z];route=roadRoute(graph,routeFrom,target.point);}
  return route;
 }
 const radar=document.getElementById("radar");
 const makeOverlay=id=>{const e=element("canvas","harbor-map-pins");e.id=id;e.setAttribute("aria-hidden","true");e.hidden=true;document.body.append(e);return e;};
 const atlasPins=makeOverlay("harbor-map-pins-atlas"),radarPins=makeOverlay("harbor-map-pins-radar");
 function renderOverlay(){
  const view=globalThis.harborView,screen=view?.screen?.();
  for(const [canvas,pins,mode] of [[atlas,atlasPins,"map"],[radar,radarPins,"play"]]){
   if(!canvas||!bounds||screen!==mode||document.hidden||(!latest&&mode==="play")){pins.hidden=true;continue;}
   const box=canvasFit(canvas);if(box.width<1||box.height<1){pins.hidden=true;continue;}
   pins.hidden=false;
   pins.style.left=box.left+"px";pins.style.top=box.top+"px";pins.style.width=box.width+"px";pins.style.height=box.height+"px";
   if(pins.width!==canvas.width)pins.width=canvas.width;if(pins.height!==canvas.height)pins.height=canvas.height;
   const ctx=pins.getContext("2d");ctx.clearRect(0,0,pins.width,pins.height);
   const point=mode==="map"?mapProjection(bounds,pins.width,pins.height).point:(x,z)=>{const scale=pins.width/(latest.driving?134:88);return [pins.width/2+(x-latest.x)*scale,pins.height/2+(z-latest.z)*scale];};
   drawPins(ctx,point,target,course,run,landmarks,saved.visited,mode==="map",getRoute());
  }
 }
 atlas.addEventListener("click",event=>{
  if(!bounds)return;
  const box=canvasFit(atlas),x=(event.clientX-box.left)/box.scale,y=(event.clientY-box.top)/box.scale;
  if(x<0||y<0||x>atlas.width||y>atlas.height)return;
  const point=mapProjection(bounds,atlas.width,atlas.height).world(x,y);
  if(point[0]<bounds.min[0]||point[0]>bounds.max[0]||point[1]<bounds.min[1]||point[1]>bounds.max[1])return;
  target={name:"사용자 목적지",point};select.value="";renderOverlay();
 });
 window.addEventListener("resize",renderOverlay);
 map.querySelector(".map-panel")?.addEventListener("scroll",renderOverlay,{passive:true});
 const format=t=>{const tenths=Math.round(t*10);return `${Math.floor(tenths/600)}:${(tenths%600/10).toFixed(1).padStart(4,"0")}`;};
 const announce=(s)=>{lastNotice=s;noticeUntil=performance.now()+4500;};
 function refresh(){
  const visited=new Set(saved.visited);
  summary.textContent=`명소 ${landmarks.filter(l=>visited.has(l.id)).length}/${landmarks.length} · 최고 속도 ${Math.round(saved.topSpeed)} km/h`;
  status.textContent=courses.map(c=>`${c.name} ${saved.records[c.id]?format(saved.records[c.id]):"기록 없음"}`).join(" / ");
  const rows=[["운전 거리",(stats.driveMeters/1000).toFixed(2)+" km"],["도보 거리",(stats.walkMeters/1000).toFixed(2)+" km"],["수배 탈출",stats.escapes+"회 · 최고 "+stats.maxEscape+"단계"],...traps.map(t=>[t.name,stats.traps[t.id]?Math.round(stats.traps[t.id])+" km/h":"기록 없음"])];
  records.replaceChildren(...rows.map(([name,value])=>{const d=element("div");d.append(element("small","",name),element("strong","",value));return d;}));
  for(const option of select.options){if(!option.value)continue;const l=landmarks.find(x=>x.id===option.value);if(l)option.textContent=(visited.has(l.id)?"✓ ":"")+l.name;}
 }
 select.addEventListener("change",()=>{const l=landmarks.find(x=>x.id===select.value);target=l?{name:l.name,point:[l.position[0],l.position[2]]}:null;});
 clear.addEventListener("click",()=>{target=null;select.value="";});
 choose.addEventListener("click",()=>{course=courses.find(c=>c.id===routeSelect.value)||null;run=course?{started:false,index:0,seconds:0}:null;if(course)announce(course.name+" · 시작점으로 이동");});
 cancel.addEventListener("click",()=>{course=null;run=null;announce("주행 코스 취소");});
 document.getElementById("reset")?.addEventListener("click",()=>{run=null;course=null;target=null;select.value="";lastPos=null;lastVersion=-1;previousSample=null;latest=null;route=null;routeTarget=null;routeFrom=null;});
 fetch(new URL("world/harbor_front.json",document.baseURI)).then(r=>{if(!r.ok)throw Error("map");return r.json();}).then(layout=>{
  bounds=layout.bounds;graph=roadGraph(layout.roads||[]);
  landmarks=(layout.landmarks||[]).filter(l=>typeof l.id==="string"&&typeof l.name==="string"&&Array.isArray(l.position)&&Number.isFinite(l.position[0])&&Number.isFinite(l.position[2]));
  for(const l of landmarks){const o=element("option","",l.name);o.value=l.id;select.append(o);}refresh();
 }).catch(()=>{description.textContent="명소 목록을 불러오지 못했습니다. 주행 코스는 사용할 수 있습니다.";refresh();});
 refresh();
 function tick(){
  const now=performance.now(),dt=Math.min(.5,(now-lastTime)/1000);lastTime=now;
  const view=globalThis.harborView;
  if(!view||typeof view.frame!=="function"||view.screen()!=="play"||document.hidden){lastPos=null;renderOverlay();return;}
  const version=view.frameVersion();if(version===lastVersion)return;lastVersion=version;
  let f;try{f=JSON.parse(view.frame());}catch{return;}
  if(!f?.position||!f.state||!Number.isFinite(f.position.x)||!Number.isFinite(f.position.z))return;
  const p=f.position, driving=Boolean(f.state.isDriving),alive=Boolean(f.alive);
  const sample={x:p.x,z:p.z,alive,driving,generation:f.state.runGeneration,wanted:Math.max(0,Number(f.state.wantedLevel)||0),speed:driving?Math.abs(Number(f.state.vehicle?.speed))*3.6:0};
  const oldEscapes=stats.escapes,oldTraps=stats.traps;
  if(previousSample?.generation!=null&&sample.generation!=null&&previousSample.generation!==sample.generation&&run?.started){run=null;course=null;announce("세션이 다시 시작되어 주행 기록을 취소했습니다.");}
  const tracked=track(previousSample,sample,stats);stats=tracked.stats;sample.peak=tracked.peak;previousSample=sample;latest=sample;
  if(stats.escapes>oldEscapes){announce("경찰 추격 탈출 · 최고 "+stats.maxEscape+"단계");save();refresh();}
  for(const t of traps)if(Math.floor(stats.traps[t.id]||0)>Math.floor(oldTraps[t.id]||0)){announce("속도 기록 · "+t.name+" "+Math.round(stats.traps[t.id])+" km/h");break;}
  if(now-lastSave>3000){save();lastSave=now;refresh();}
  if(target&&alive&&distance(p,target.point)<10){announce("목적지 도착 · "+target.name);target=null;select.value="";}
  const moved=lastPos?Math.hypot(p.x-lastPos.x,p.z-lastPos.z):0;lastPos={x:p.x,z:p.z};
  if(moved>50&&run?.started){run=null;course=null;announce("위치가 변경되어 주행 기록을 취소했습니다.");}
  if(alive){
   for(const l of landmarks){if(!driving&&!saved.visited.includes(l.id)&&distance(p,[l.position[0],l.position[2]])<=12&&Math.abs((p.y??0)-l.position[1])<=4){saved.visited.push(l.id);announce("명소 발견 · "+l.name);save();refresh();}}
   const speed=driving?Math.abs(Number(f.state.vehicle?.speed))*3.6:0;
   if(Number.isFinite(speed)&&speed>saved.topSpeed&&speed<450){saved.topSpeed=speed;if(now-lastSave>3000){save();lastSave=now;refresh();}}
  }
  if(run&&course){
   run=advance(run,course,p,driving,alive,dt);
   if(run.cancelled){announce("주행 기록 취소 · 차량에서 내렸거나 쓰러졌습니다.");run=null;course=null;}
   else if(run.finished){const old=saved.records[course.id];if(!old||run.seconds<old){saved.records[course.id]=run.seconds;save();refresh();announce(course.name+" · 신기록 "+format(run.seconds));}else announce(course.name+" · 완주 "+format(run.seconds));run=null;course=null;}
  }
  const point=course&&run?{name:run.started?`체크포인트 ${run.index}/${course.points.length-1}`:"주행 시작점",point:course.points[run.index]}:target;
  panel.hidden=!point&&now>=noticeUntil;
  heading.textContent=course?course.name:"자유 탐험";
  progress.textContent=run?.started?"경과 "+format(run.seconds):now<noticeUntil?lastNotice:"";
  const road=getRoute();
  nav.textContent=point?`${point.name} · ${Math.round(distance(p,point.point))}m · ${bearing(p,point.point)}${road?` · 도로 약 ${Math.round(road.meters)}m`:""}`:"";
  renderOverlay();
 }
 setInterval(tick,150);
 window.addEventListener("pagehide",save);
 document.addEventListener("visibilitychange",()=>{if(document.hidden)save();});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
})();
