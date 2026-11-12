import * as THREE from 'three';
import { createBattleWorld, FACTION_COLORS } from './graphics';
import { loadWar, saveWar, deleteWarSave } from './save';
import { worldToMinimap, minimapToWorld, pickMapTarget } from './mapCommands';
import { createWarAudio } from './audio';
import { createWar, stepWar, upgrade, train, trainSquad, repair, setPolicy, setReserve, order, cost, NAMES, OUTPOST_NAMES, OUTPOST_BONUSES, UNIT_STATS, MAX_UNITS, MAP_HALF_SIZE, captureOrder, type EconomyPolicy, type UnitKind, type Upgrade, type War } from './war';
const colors=FACTION_COLORS;
export function openWar(onExit:()=>void,forceNew=false):void {
 const overlay=document.createElement('div'); overlay.className='war-ui'; document.body.append(overlay);
 overlay.innerHTML=`<div class="war-view"></div><div class="war-top"><b>⚔ 영지 생존전</b><span id="war-clock"></span><button id="pause">일시정지</button><button id="speed">속도 1×</button><button id="quality">그래픽 높음</button><button id="home">내 영지</button><button id="audio" aria-label="소리 끄기">🔊</button><button id="exit">메뉴로</button></div><div class="war-panel"><div class="eyebrow">내 영지</div><div id="war-res"></div><div class="war-section">생산과 성장</div><div id="buildings"></div><div class="war-section">왕국 경제 정책</div><div id="policy"></div><button id="repair" class="war-action">본부 수리 <small>금 45 · 식량 25</small></button><div class="war-section">병종 훈련</div><div id="unit-train"></div><div class="war-section">부대 명령</div><div id="targets"></div><div class="war-section">본부 수비대</div><div id="reserve"></div><div class="war-section">거점 점령</div><div id="outposts"></div><div class="war-section">전투 저장</div><div id="save-actions"><button id="save">저장</button><button id="load">이어하기</button><button id="new">새 전투</button></div><div id="save-status" role="status"></div><div class="war-hint">병사는 가까운 적을 자동으로 공격합니다. 수비 병력은 출전하지 않습니다.<br>130초 후 안전지대가 줄어듭니다.</div></div><div class="war-standings" id="standings"></div><div class="war-events" id="events" aria-live="polite"></div><div class="war-minimap"><canvas id="war-map" width="200" height="200" aria-label="전장 미니맵"></canvas><button id="map-mode" aria-pressed="false">이동 모드</button><span>Shift+클릭 또는 명령 모드 선택</span></div><div class="war-help">드래그: 회전 · Shift+드래그/WASD: 이동 · 휠: 확대/축소</div><div class="war-end" hidden></div>`;
 const el=<T extends HTMLElement>(s:string)=>overlay.querySelector<T>(s)!;
 const mount=el<HTMLDivElement>('.war-view');
 let highQuality=!window.matchMedia('(max-width: 700px)').matches;
 let renderer:THREE.WebGLRenderer;
 try{
  renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:'high-performance'});
 }catch{
  overlay.innerHTML='<div class="war-fallback"><h2>3D 실행 불가</h2><p>이 기기에서는 WebGL을 시작할 수 없습니다. 브라우저 그래픽 가속 설정을 확인해 주세요.</p><button id="back-to-menu">메뉴로</button></div>';
  overlay.querySelector<HTMLButtonElement>('#back-to-menu')!.onclick=()=>{overlay.remove();onExit();};
  return;
 }
 renderer.outputColorSpace=THREE.SRGBColorSpace;
 renderer.toneMapping=THREE.ACESFilmicToneMapping;
 renderer.toneMappingExposure=1.22;
 renderer.shadowMap.enabled=highQuality;
 renderer.shadowMap.type=THREE.PCFSoftShadowMap;
 renderer.setPixelRatio(Math.min(window.devicePixelRatio,highQuality?2:1.25));
 renderer.setSize(mount.clientWidth,mount.clientHeight);
 mount.append(renderer.domElement);
 el<HTMLButtonElement>('#quality').textContent=highQuality?'그래픽 높음':'그래픽 보통';
 const scene=new THREE.Scene();
 const camera=new THREE.PerspectiveCamera(45,mount.clientWidth/mount.clientHeight,.1,1300);
 const focus=new THREE.Vector3(0,0,0);
 let angle=.8,zoom=280;
 const cameraUpdate=()=>{
  camera.position.set(focus.x+Math.sin(angle)*zoom,zoom*.75,focus.z+Math.cos(angle)*zoom);
  camera.lookAt(focus);
 };
 cameraUpdate();
 const savedWar=forceNew?null:loadWar();
 const w:War=savedWar??createWar();
 let hasSaved=savedWar!==null || loadWar()!==null;
 const world=createBattleWorld(scene,w);
 const audio=createWarAudio();
 let lastAudioEvent=w.events[0]??null;
 let dead=false,done=false,paused=false,speed=1,last=performance.now(),acc=0,uiClock=0,drag=false,prevX=0,prevY=0,frame=0;
 const heldKeys=new Set<string>();
 const pan=(dx:number,dz:number)=>{focus.x=THREE.MathUtils.clamp(focus.x+dx,-MAP_HALF_SIZE+20,MAP_HALF_SIZE-20);focus.z=THREE.MathUtils.clamp(focus.z+dz,-MAP_HALF_SIZE+20,MAP_HALF_SIZE-20);cameraUpdate();};
 const keyDown=(event:KeyboardEvent)=>{
  if(event.key==='Escape'&&!event.repeat){
    paused=!paused;el<HTMLButtonElement>('#pause').textContent=paused?'계속하기':'일시정지';
    event.preventDefault();return;
  }
  if(['1','2','3','4'].includes(event.key)&&!event.repeat){
    if(train(w,0,(['infantry','archer','guardian','cavalry'] as UnitKind[])[Number(event.key)-1]))audio.play('train');
    ui();event.preventDefault();return;
  }
  if(['w','a','s','d','arrowup','arrowleft','arrowdown','arrowright'].includes(event.key.toLowerCase())){
    heldKeys.add(event.key.toLowerCase());event.preventDefault();
  }
 };
 const keyUp=(event:KeyboardEvent)=>heldKeys.delete(event.key.toLowerCase());
 window.addEventListener('keydown',keyDown);window.addEventListener('keyup',keyUp);
 const resize=()=>{renderer.setSize(mount.clientWidth,mount.clientHeight);camera.aspect=mount.clientWidth/mount.clientHeight;camera.updateProjectionMatrix();};window.addEventListener('resize',resize);
 const down=(e:PointerEvent)=>{drag=true;prevX=e.clientX;prevY=e.clientY;};
 const move=(e:PointerEvent)=>{
  if(!drag)return;
  const dx=e.clientX-prevX,dy=e.clientY-prevY;
  prevX=e.clientX;prevY=e.clientY;
  if(e.shiftKey){
    pan(-Math.cos(angle)*dx*.65+Math.sin(angle)*dy*.65,
      Math.sin(angle)*dx*.65+Math.cos(angle)*dy*.65);
  }else{
    angle+=dx*.008;cameraUpdate();
  }
 };
 const up=()=>{drag=false;};
 const wheel=(e:WheelEvent)=>{e.preventDefault();zoom=THREE.MathUtils.clamp(zoom+e.deltaY*.15,75,525);cameraUpdate();};
 renderer.domElement.addEventListener('pointerdown',down);
 window.addEventListener('pointermove',move);window.addEventListener('pointerup',up);
 renderer.domElement.addEventListener('wheel',wheel,{passive:false});
 let commandMode=false;
 const map=el<HTMLCanvasElement>('#war-map');
 const ctx=map.getContext('2d');
 const project=worldToMinimap;
 const mapClick=(event:MouseEvent)=>{
  const rect=map.getBoundingClientRect();
  const pos=minimapToWorld(event.clientX-rect.left,event.clientY-rect.top,rect.width,rect.height);
  if(event.shiftKey||commandMode){
    const target=pickMapTarget(w,0,pos.x,pos.z);
    if(target){
      const success=target.kind==='outpost'?captureOrder(w,0,target.id):order(w,0,target.id);
      if(success){audio.play('command');ui();drawMap();}
    }
  }else pan(pos.x-focus.x,pos.z-focus.z);
 };
 map.addEventListener('click',mapClick);
 const modeButton=el<HTMLButtonElement>('#map-mode');
 modeButton.onclick=()=>{
   commandMode=!commandMode;
   modeButton.textContent=commandMode?'명령 모드':'이동 모드';
   modeButton.setAttribute('aria-pressed',String(commandMode));
 };
 const drawMap=()=>{
  if(!ctx)return;
  ctx.clearRect(0,0,200,200);
  ctx.fillStyle='#233d32';ctx.fillRect(0,0,200,200);
  ctx.strokeStyle='rgba(194,224,190,.24)';ctx.strokeRect(2,2,196,196);
  ctx.strokeStyle='#72dbee';ctx.lineWidth=2;ctx.beginPath();
  ctx.arc(100,100,w.zone/MAP_HALF_SIZE*100,0,Math.PI*2);ctx.stroke();
  for(const p of w.outposts){const pt=project(p.x,p.z);
   ctx.fillStyle=p.owner===null?'#e8cf91':'#'+colors[p.owner].toString(16).padStart(6,'0');
   ctx.fillRect(pt.x-3,pt.y-3,6,6);
  }
  for(const f of w.factions){const pt=project(f.x,f.z);
   ctx.fillStyle=f.alive?'#'+colors[f.id].toString(16).padStart(6,'0'):'#59645c';
   ctx.beginPath();ctx.arc(pt.x,pt.y,5,0,Math.PI*2);ctx.fill();
  }
  ctx.fillStyle='#f2f7e9';for(const u of w.units){const pt=project(u.x,u.z);
    ctx.fillStyle='#'+colors[u.owner].toString(16).padStart(6,'0');
    ctx.fillRect(pt.x-1,pt.y-1,2,2);
  }
  const current=w.factions[0],goal=current.target!==null?w.factions[current.target]:
    current.rally!==null?w.outposts[current.rally]:null;
  if(goal){
    const origin=project(current.x,current.z),destination=project(goal.x,goal.z);
    ctx.strokeStyle='#fff1ab';ctx.lineWidth=1;ctx.setLineDash([3,3]);
    ctx.beginPath();ctx.moveTo(origin.x,origin.y);ctx.lineTo(destination.x,destination.y);ctx.stroke();
    ctx.setLineDash([]);ctx.strokeRect(destination.x-7,destination.y-7,14,14);
  }
  const f=project(focus.x,focus.z);ctx.strokeStyle='#ffffff';ctx.lineWidth=1;
  ctx.strokeRect(f.x-7,f.y-7,14,14);
 };
 const close=(resume=true)=>{if(dead)return;dead=true;cancelAnimationFrame(frame);window.removeEventListener('resize',resize);window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',up);window.removeEventListener('keydown',keyDown);window.removeEventListener('keyup',keyUp);map.removeEventListener('click',mapClick);audio.dispose();world.dispose();renderer.dispose();renderer.forceContextLoss();overlay.remove();if(resume)onExit();};el<HTMLButtonElement>('#exit').onclick=()=>close();
 el<HTMLButtonElement>('#home').onclick=()=>{focus.set(w.factions[0].x,0,w.factions[0].z);zoom=165;cameraUpdate();};
 el<HTMLButtonElement>('#audio').onclick=()=>{
  const muted=audio.toggle();
  const control=el<HTMLButtonElement>('#audio');
  control.textContent=muted?'🔇':'🔊';
  control.setAttribute('aria-label',muted?'소리 켜기':'소리 끄기');
  if(!muted)audio.play('command');
 };
 el<HTMLButtonElement>('#save').onclick=()=>{
  hasSaved=saveWar(w);
  el('#save-status').textContent=hasSaved?'현재 전투가 저장됐습니다.':'이 브라우저에서는 저장할 수 없습니다.';
  ui();
 };
 el<HTMLButtonElement>('#load').onclick=()=>{
  if(!loadWar())return;
  close(false);openWar(onExit);
 };
 el<HTMLButtonElement>('#new').onclick=()=>{
  if(!window.confirm('현재 전투를 종료하고 새 전투를 시작할까요? 저장한 데이터도 삭제됩니다.'))return;
  deleteWarSave();close(false);openWar(onExit,true);
 };
 el<HTMLButtonElement>('#pause').onclick=()=>{paused=!paused;el<HTMLButtonElement>('#pause').textContent=paused?'계속하기':'일시정지';};
 el<HTMLButtonElement>('#speed').onclick=()=>{speed=speed===1?2:speed===2?4:1;el<HTMLButtonElement>('#speed').textContent=`속도 ${speed}×`;};
 el<HTMLButtonElement>('#quality').onclick=()=>{
  highQuality=!highQuality;
  renderer.shadowMap.enabled=highQuality;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio,highQuality?2:1.25));
  resize();
  el<HTMLButtonElement>('#quality').textContent=highQuality?'그래픽 높음':'그래픽 보통';
 };
 const names:Record<Upgrade,string>={farm:'농장',mine:'금광',barracks:'병영',fort:'본부 방어'};
 // Reuse button DOM nodes across the 250ms HUD updates to avoid lost pointer clicks.
 const stableButton=(parent:HTMLElement,key:string):HTMLButtonElement=>{
   const found=parent.querySelector<HTMLButtonElement>('button[data-control="'+key+'"]');
   if(found)return found;
   const btn=document.createElement('button');btn.dataset.control=key;parent.append(btn);
   return btn;
 };
 function ui(){const p=w.factions[0];const count=(id:number)=>w.units.filter(u=>u.owner===id).length;
  el('#war-clock').textContent=`${Math.floor(w.time/60)}:${String(Math.floor(w.time%60)).padStart(2,'0')}  ·  생존 ${w.factions.filter(f=>f.alive).length}/4`;
  const objectiveBonuses=w.outposts.filter(o=>o.owner===0).map(o=>OUTPOST_BONUSES[o.id]);
  const modifier=p.policy==='growth'?1.25:p.policy==='war'?.88:1;
  const goldIncome=(p.mine*1.5+objectiveBonuses.reduce((sum,v)=>sum+v.gold,0))*modifier;
  const foodIncome=(p.farm*1.3+objectiveBonuses.reduce((sum,v)=>sum+v.food,0))*modifier;
  el('#war-res').innerHTML=`<strong>🪙 ${Math.floor(p.gold)}</strong><strong>🌾 ${Math.floor(p.food)}</strong><span>본부 ${Math.ceil(p.hp)} / ${p.maxHp}</span><span>병력 ${count(0)} / ${MAX_UNITS}</span><span>금 +${goldIncome.toFixed(1)}/초</span><span>식량 +${foodIncome.toFixed(1)}/초</span>`;
  const b=el('#buildings');for(const k of ['farm','mine','barracks','fort'] as Upgrade[]){const c=cost(p,k),button=stableButton(b,k);button.className='war-action';button.disabled=!p.alive||w.over||p[k]>=4||p.gold<c.gold||p.food<c.food;button.innerHTML=`${names[k]} <span>Lv.${p[k]}</span><small>${p[k]>=4?'최대':`금 ${c.gold} · 식량 ${c.food}`}</small>`;button.onclick=()=>{if(upgrade(w,0,k))audio.play('upgrade');ui();};}
  el<HTMLButtonElement>('#save').disabled=!p.alive||w.over;
  el<HTMLButtonElement>('#load').disabled=!hasSaved;
  const policyNode=el('#policy');
  const policies: {key:EconomyPolicy;label:string;title:string}[]=[
    {key:'balanced',label:'균형',title:'표준 자원 생산과 전투'},
    {key:'growth',label:'성장 +25%',title:'금·식량 생산 25% 증가'},
    {key:'war',label:'전시 +18%',title:'부대 공격력 18% 증가, 자원 생산 12% 감소'},
  ];
  for(const candidate of policies){
    const btn=stableButton(policyNode,candidate.key);
    btn.className='war-target'+(p.policy===candidate.key?' selected':'');
    btn.textContent=candidate.label;btn.title=candidate.title;
    btn.disabled=!p.alive||w.over;
    btn.onclick=()=>{if(setPolicy(w,0,candidate.key))audio.play('command');ui();};
  }
  const repairButton=el<HTMLButtonElement>('#repair');
  repairButton.disabled=!p.alive||w.over||p.hp>=p.maxHp-1||p.gold<45||p.food<25;
  repairButton.onclick=()=>{if(repair(w,0))audio.play('upgrade');ui();};
  const training=el('#unit-train');
  for(const kind of ['infantry','archer','guardian','cavalry'] as UnitKind[]){
   const stat=UNIT_STATS[kind],btn=stableButton(training,kind+'-single');
   btn.className='war-action';btn.textContent=`${stat.label} · 금 ${stat.gold} / 식량 ${stat.food}`;
   btn.disabled=!p.alive||w.over||p.barracks<stat.unlock||p.gold<stat.gold||p.food<stat.food||count(0)>=MAX_UNITS;
   btn.title=p.barracks<stat.unlock?`병영 레벨 ${stat.unlock} 필요`:'';
   btn.onclick=()=>{if(train(w,0,kind))audio.play('train');ui();};
   const squad=stableButton(training,kind+'-squad');squad.className='war-action';squad.textContent=`${stat.label} 3명 일괄 훈련`;
   squad.disabled=!p.alive||w.over||p.barracks<stat.unlock||p.gold<stat.gold*3||p.food<stat.food*3||count(0)+3>MAX_UNITS;
   squad.onclick=()=>{if(trainSquad(w,0,kind,3))audio.play('train');ui();};
  }
  const targets=el('#targets');for(const t of [null,1,2,3] as (number|null)[]){const button=stableButton(targets,t===null?'defend':'attack-'+t);button.textContent=t===null?'기지 방어':`${NAMES[t]} 공격`;button.className='war-target'+(p.target===t?' selected':'');button.disabled=!p.alive||w.over||(t!==null&&!w.factions[t].alive);button.onclick=()=>{if(order(w,0,t))audio.play('command');ui();};}
  const reserveNode=el('#reserve');
  for(const amount of [0,2,4,6]){
    const btn=stableButton(reserveNode,String(amount));btn.className='war-target'+(p.reserve===amount?' selected':'');
    btn.textContent=amount===0?'전군 출전':`${amount}명 수비`;
    btn.disabled=!p.alive||w.over;btn.onclick=()=>{if(setReserve(w,0,amount))audio.play('command');ui();};
  }
  const outposts=el('#outposts');
  for(const post of w.outposts){
   const btn=stableButton(outposts,String(post.id)),owner=post.owner===null?'중립':NAMES[post.owner];
   const income=OUTPOST_BONUSES[post.id];
   btn.textContent=`${OUTPOST_NAMES[post.id]} · ${owner}${post.contender!==null?' '+Math.round(post.progress)+'%':''}`;
   btn.title=`점령 시 금 +${income.gold.toFixed(1)}/초, 식량 +${income.food.toFixed(1)}/초`;
   btn.className='war-target'+(p.rally===post.id?' selected':'');
   btn.disabled=!p.alive||w.over;btn.onclick=()=>{if(captureOrder(w,0,post.id))audio.play('command');ui();};
  }
  const eventPanel=el('#events');eventPanel.replaceChildren();
  for(const evt of w.events.slice(0,5)){
    const line=document.createElement('p'),stamp=document.createElement('span');
    stamp.textContent=`${Math.floor(evt.time/60)}:${String(evt.time%60).padStart(2,'0')}`;
    line.append(stamp,document.createTextNode(' '+evt.text));
    eventPanel.append(line);
  }
  el('#standings').innerHTML=w.factions.map(f=>`<div><i style="background:#${colors[f.id].toString(16).padStart(6,'0')}"></i><b>${NAMES[f.id]}</b><span>${f.alive?`본부 ${Math.ceil(f.hp)} · 병사 ${count(f.id)}`:'탈락'}</span></div>`).join('');
 }
 function loop(now:number){if(dead)return;const elapsed=Math.min((now-last)/1000,.1);last=now;
  const cameraStep=elapsed*100;
  const h=(k:string)=>heldKeys.has(k);
  if(h('w')||h('arrowup'))pan(-Math.sin(angle)*cameraStep,-Math.cos(angle)*cameraStep);
  if(h('s')||h('arrowdown'))pan(Math.sin(angle)*cameraStep,Math.cos(angle)*cameraStep);
  if(h('a')||h('arrowleft'))pan(-Math.cos(angle)*cameraStep,Math.sin(angle)*cameraStep);
  if(h('d')||h('arrowright'))pan(Math.cos(angle)*cameraStep,-Math.sin(angle)*cameraStep);
  if(!paused&&!done)acc+=elapsed*speed;while(acc>=.05&&!w.over&&w.factions[0].alive){stepWar(w,.05);acc-=.05;}world.update(paused?0:elapsed);
  const newest=w.events[0]??null;
  if(newest!==lastAudioEvent){
    if(newest)audio.play(newest.text.includes('함락')?'loss':'capture');
    lastAudioEvent=newest;
  }
  if(now-uiClock>250){ui();drawMap();uiClock=now;}if(!done&&(w.over||!w.factions[0].alive)){done=true;if(w.winner===0)audio.play('victory');const end=el<HTMLDivElement>('.war-end');end.hidden=false;end.innerHTML=`<div><h1>${w.winner===0?'최후의 영지 승리!':'영지가 함락됐습니다'}</h1><p>${Math.floor(w.time)}초 생존 · ${w.winner===0?'모든 경쟁자를 물리쳤습니다.':'다시 도전해 보세요.'}</p><button id="again">다시 시작</button><button id="back">메뉴로</button></div>`;el<HTMLButtonElement>('#again').onclick=()=>{close(false);openWar(onExit,true);};el<HTMLButtonElement>('#back').onclick=()=>close();}
  renderer.render(scene,camera);frame=requestAnimationFrame(loop);
 }
 ui();frame=requestAnimationFrame(loop);
}
