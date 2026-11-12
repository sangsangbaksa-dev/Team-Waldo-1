import * as THREE from 'three';
import { createBattleWorld, FACTION_COLORS } from './graphics';
import { createWar, stepWar, upgrade, train, order, cost, NAMES, OUTPOST_NAMES, UNIT_STATS, MAX_UNITS, captureOrder, type UnitKind, type Upgrade, type War } from './war';
const colors=FACTION_COLORS;
export function openWar(onExit:()=>void):void {
 const overlay=document.createElement('div'); overlay.className='war-ui'; document.body.append(overlay);
 overlay.innerHTML=`<div class="war-view"></div><div class="war-top"><b>⚔ 영지 생존전</b><span id="war-clock"></span><button id="pause">일시정지</button><button id="speed">속도 1×</button><button id="quality">그래픽 높음</button><button id="exit">메뉴로</button></div><div class="war-panel"><div class="eyebrow">내 영지</div><div id="war-res"></div><div class="war-section">생산과 성장</div><div id="buildings"></div><button id="train" class="war-action">병사 훈련 <small>금 25 · 식량 20</small></button><div class="war-section">병종 훈련</div><div id="unit-train"></div><div class="war-section">부대 명령</div><div id="targets"></div><div class="war-section">거점 점령</div><div id="outposts"></div><div class="war-hint">병사는 적과 마주치면 자동으로 싸웁니다.<br>90초 후 안전지대가 줄어듭니다.</div></div><div class="war-standings" id="standings"></div><div class="war-help">드래그: 회전 · 휠: 확대/축소</div><div class="war-end" hidden></div>`;
 const el=<T extends HTMLElement>(s:string)=>overlay.querySelector<T>(s)!;
 const mount=el<HTMLDivElement>('.war-view');
 let highQuality=!window.matchMedia('(max-width: 700px)').matches;
 const renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:'high-performance'});
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
 const camera=new THREE.PerspectiveCamera(42,mount.clientWidth/mount.clientHeight,.1,500);
 let angle=.8,zoom=125;
 const cameraUpdate=()=>{
  camera.position.set(Math.sin(angle)*zoom,zoom*.8,Math.cos(angle)*zoom);
  camera.lookAt(0,0,0);
 };
 cameraUpdate();
 const w:War=createWar();
 const world=createBattleWorld(scene,w);
 let dead=false,done=false,paused=false,speed=1,last=performance.now(),acc=0,uiClock=0,drag=false,prevX=0,frame=0;
 const resize=()=>{renderer.setSize(mount.clientWidth,mount.clientHeight);camera.aspect=mount.clientWidth/mount.clientHeight;camera.updateProjectionMatrix();};window.addEventListener('resize',resize);
 const down=(e:PointerEvent)=>{drag=true;prevX=e.clientX;};const move=(e:PointerEvent)=>{if(drag){angle+=(e.clientX-prevX)*.008;prevX=e.clientX;cameraUpdate();}};const up=()=>{drag=false;};const wheel=(e:WheelEvent)=>{e.preventDefault();zoom=THREE.MathUtils.clamp(zoom+e.deltaY*.07,70,170);cameraUpdate();};renderer.domElement.addEventListener('pointerdown',down);window.addEventListener('pointermove',move);window.addEventListener('pointerup',up);renderer.domElement.addEventListener('wheel',wheel,{passive:false});
 const close=(resume=true)=>{if(dead)return;dead=true;cancelAnimationFrame(frame);window.removeEventListener('resize',resize);window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',up);world.dispose();renderer.dispose();overlay.remove();if(resume)onExit();};el<HTMLButtonElement>('#exit').onclick=()=>close();
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
 function ui(){const p=w.factions[0];const count=(id:number)=>w.units.filter(u=>u.owner===id).length;
  el('#war-clock').textContent=`${Math.floor(w.time/60)}:${String(Math.floor(w.time%60)).padStart(2,'0')}  ·  생존 ${w.factions.filter(f=>f.alive).length}/4`;
  el('#war-res').innerHTML=`<strong>🪙 ${Math.floor(p.gold)}</strong><strong>🌾 ${Math.floor(p.food)}</strong><span>본부 ${Math.ceil(p.hp)} / ${p.maxHp}</span><span>병력 ${count(0)} / ${MAX_UNITS}</span>`;
  const b=el('#buildings');b.innerHTML='';for(const k of ['farm','mine','barracks','fort'] as Upgrade[]){const c=cost(p,k),button=document.createElement('button');button.className='war-action';button.disabled=!p.alive||w.over||p[k]>=4||p.gold<c.gold||p.food<c.food;button.innerHTML=`${names[k]} <span>Lv.${p[k]}</span><small>${p[k]>=4?'최대':`금 ${c.gold} · 식량 ${c.food}`}</small>`;button.onclick=()=>{upgrade(w,0,k);ui();};b.append(button);}
  el<HTMLButtonElement>('#train').disabled=!p.alive||p.gold<25||p.food<20||count(0)>=MAX_UNITS;el<HTMLButtonElement>('#train').onclick=()=>{train(w,0);ui();};
  const training=el('#unit-train');training.innerHTML='';
  for(const kind of ['infantry','archer','guardian'] as UnitKind[]){
   const stat=UNIT_STATS[kind],btn=document.createElement('button');
   btn.className='war-action';btn.textContent=`${stat.label} · 금 ${stat.gold} / 식량 ${stat.food}`;
   btn.disabled=!p.alive||w.over||p.barracks<stat.unlock||p.gold<stat.gold||p.food<stat.food||count(0)>=MAX_UNITS;
   if(p.barracks<stat.unlock)btn.title=`병영 레벨 ${stat.unlock} 필요`;
   btn.onclick=()=>{train(w,0,kind);ui();};training.append(btn);
  }
  const targets=el('#targets');targets.innerHTML='';for(const t of [null,1,2,3] as (number|null)[]){const button=document.createElement('button');button.textContent=t===null?'기지 방어':`${NAMES[t]} 공격`;button.className='war-target'+(p.target===t?' selected':'');button.disabled=!p.alive||(t!==null&&!w.factions[t].alive);button.onclick=()=>{order(w,0,t);ui();};targets.append(button);}
  const outposts=el('#outposts');outposts.innerHTML='';
  for(const post of w.outposts){
   const btn=document.createElement('button'),owner=post.owner===null?'중립':NAMES[post.owner];
   btn.textContent=`${OUTPOST_NAMES[post.id]} · ${owner}${post.contender!==null?' '+Math.round(post.progress)+'%':''}`;
   btn.className='war-target'+(p.rally===post.id?' selected':'');
   btn.disabled=!p.alive||w.over;btn.onclick=()=>{captureOrder(w,0,post.id);ui();};outposts.append(btn);
  }
  el('#standings').innerHTML=w.factions.map(f=>`<div><i style="background:#${colors[f.id].toString(16).padStart(6,'0')}"></i><b>${NAMES[f.id]}</b><span>${f.alive?`본부 ${Math.ceil(f.hp)} · 병사 ${count(f.id)}`:'탈락'}</span></div>`).join('');
 }
 function loop(now:number){if(dead)return;const elapsed=Math.min((now-last)/1000,.1);last=now;if(!paused&&!done)acc+=elapsed*speed;while(acc>=.05&&!w.over&&w.factions[0].alive){stepWar(w,.05);acc-=.05;}world.update(paused?0:elapsed);
  if(now-uiClock>250){ui();uiClock=now;}if(!done&&(w.over||!w.factions[0].alive)){done=true;const end=el<HTMLDivElement>('.war-end');end.hidden=false;end.innerHTML=`<div><h1>${w.winner===0?'최후의 영지 승리!':'영지가 함락됐습니다'}</h1><p>${Math.floor(w.time)}초 생존 · ${w.winner===0?'모든 경쟁자를 물리쳤습니다.':'다시 도전해 보세요.'}</p><button id="again">다시 시작</button><button id="back">메뉴로</button></div>`;el<HTMLButtonElement>('#again').onclick=()=>{close(false);openWar(onExit);};el<HTMLButtonElement>('#back').onclick=()=>close();}
  renderer.render(scene,camera);frame=requestAnimationFrame(loop);
 }
 ui();frame=requestAnimationFrame(loop);
}
