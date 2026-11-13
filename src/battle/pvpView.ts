import { openBaseInterior } from './baseInterior';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { PvpSession,pvpClient } from './pvp';
import { createBattleWorld } from './graphics';
import { FACILITY_TYPES,facilitiesFor } from './facilities';
import { RESEARCH,UNIT_STATS,OUTPOST_NAMES,MAP_HALF_SIZE,getIncome,type War,type UnitKind,type Upgrade,type Research } from './war';
import { CONTRACTS } from './economy';
import { worldToMinimap,minimapToWorld,pickMapTarget } from './mapCommands';
import type { PlayerCommand } from './pvpCommands';
import { readPreferences } from './preferences';
export function openPvp(onExit:()=>void):void{
 const root=document.createElement('main');root.className='pvp-shell';
 root.innerHTML=`<header class="pvp-header"><div><small>WALDO / MULTIPLAYER OPERATIONS</small><h1>연합 전선</h1></div><span id="pvp-link" role="status">접속 준비</span><button id="pvp-exit" class="button secondary">메뉴로</button></header>
 <section class="pvp-lobby"><div class="kicker">FOUR KINGDOMS · EQUAL FORCES</div><h2>100 · 100 · 100 · 100</h2><p>방을 만들고 코드를 공유하세요. 2~4명이 참가할 수 있으며 빈자리는 AI가 맡습니다.</p><form id="pvp-auth"><label>이메일<input name="email" type="email" autocomplete="email" required></label><label>비밀번호<input name="password" type="password" minlength="8" autocomplete="current-password" required></label><div class="pvp-form-actions"><button type="submit" class="button primary">이메일 로그인</button><button type="button" id="pvp-signup" class="button secondary">회원가입</button></div><p class="panel-note">회원가입 후 받은 이메일에서 인증을 완료한 뒤 로그인하세요.</p></form><p id="pvp-identity" hidden></p><button id="pvp-signout" hidden>로그아웃</button><form id="pvp-connect" hidden><label>지휘관 이름<input name="name" maxlength="24" value="지휘관" required autocomplete="nickname"></label><label>방 코드<input name="code" maxlength="12" placeholder="참가할 때 입력" autocomplete="off" autocapitalize="characters"></label><div class="pvp-form-actions"><button type="submit" name="intent" value="create" class="button primary">새 작전실 개설</button><button type="submit" name="intent" value="join" class="button secondary">코드로 참가</button></div></form><div id="pvp-room" hidden><p>작전실 코드 <strong id="pvp-code"></strong> <button id="pvp-copy">코드 복사</button></p><ol id="pvp-players"></ol><button id="pvp-start" class="button primary" disabled>전투 개시</button></div><p class="panel-note">방장이 전투를 진행합니다. 방장이 나가면 진행이 중단되며 같은 브라우저에서 방 코드로 재접속할 수 있습니다. PvP는 개인 저장 기록과 분리됩니다.</p></section>
 <section class="pvp-battle" hidden><div class="pvp-viewport"></div><aside class="pvp-command"><h2 id="pvp-faction"></h2><p id="pvp-resources"></p><p id="pvp-situation" role="status"></p><canvas id="pvp-map" width="256" height="256" tabindex="0" aria-label="전략 지도. 거점이나 적 본부를 누르면 명령합니다."></canvas><p class="panel-note">지도에서 거점/적 본부 선택 · 드래그로 시점 이동 · 휠로 확대</p><details open><summary>병력과 작전</summary><div id="pvp-army" class="action-list"></div><label>작전 목표<select id="pvp-target"></select></label><button id="pvp-capture" class="button secondary">선택 거점 점령</button><div id="pvp-attacks" class="action-list"></div></details><details open><summary>시설 건설 · 최대 30개</summary><p id="pvp-facilities"></p><div id="pvp-build" class="action-list"></div></details><details><summary>경제와 교역</summary><div id="pvp-economy" class="action-list"></div></details><details><summary>기술 연구</summary><div id="pvp-research" class="action-list"></div></details></aside></section>`;
 document.body.append(root);
 const el=<T extends HTMLElement=HTMLElement>(selector:string)=>root.querySelector<T>(selector)!;
 let pendingBuild:string|null=null;
 let war:War|null=null,world:ReturnType<typeof createBattleWorld>|null=null,renderer:THREE.WebGLRenderer|null=null,controls:OrbitControls|null=null,camera:THREE.PerspectiveCamera|null=null,scene:THREE.Scene|null=null,frame=0,closed=false,lastUI=0;
 const colors=['#6eb8ac','#be6665','#bfaa70','#9991bc'];
 const bindings:{button:HTMLButtonElement;command:PlayerCommand}[]=[];
 const notice=(message:string)=>{el('#pvp-link').textContent=message;};
 const send=(command:PlayerCommand)=>{if(command.type==='build'&&command.x===undefined){pendingBuild=command.key!;notice('건설할 전장 위치 또는 미니맵 위치를 클릭하세요.');return;}void session.command(command).catch(e=>notice(e.message));};
 const session=new PvpSession({
  status:notice,
  lobby:(room,players)=>{
   el('#pvp-room').hidden=false;el('#pvp-code').textContent=room.code;
   el('#pvp-players').replaceChildren(...players.map(p=>{const li=document.createElement('li');li.textContent=`${p.faction+1}군 · ${p.name}${p.user_id===room.host_id?' / 방장':''}`;li.style.color=colors[p.faction];return li;}));
   el<HTMLButtonElement>('#pvp-start').disabled=!session.isHost||players.length<2||room.phase!=='waiting';
   if(room.phase==='playing')notice('전투 진행 중 · 실시간 연결됨');
   if(room.phase==='waiting')notice(players.length<2?'상대 지휘관 참가 대기':`${players.length}명 참가 · 방장 전투 개시 대기`);
  },
  state:incoming=>{
   if(closed)return;
   if(!war){war=structuredClone(incoming);try{setupBattle();}catch(error){console.error('PvP battlefield initialization failed',error);notice('WebGL 전장을 시작하지 못했습니다. 하드웨어 가속을 확인하세요.');void session.close();}}
   else if(incoming!==war)Object.assign(war,structuredClone(incoming));
  },
 });
 const authForm=el<HTMLFormElement>('#pvp-auth');
 const showIdentity=(email:string)=>{authForm.hidden=true;el('#pvp-connect').hidden=false;el('#pvp-identity').hidden=false;el('#pvp-identity').textContent=email;el('#pvp-signout').hidden=false;notice('이메일 로그인 완료 · 작전실을 개설하거나 참가하세요.');};
 void pvpClient.auth.getUser().then(({data})=>{if(data.user?.email)showIdentity(data.user.email);});
 authForm.onsubmit=async event=>{event.preventDefault();const values=new FormData(authForm);const button=authForm.querySelector<HTMLButtonElement>('button[type="submit"]')!;button.disabled=true;
  const {data,error}=await pvpClient.auth.signInWithPassword({email:String(values.get('email')),password:String(values.get('password'))});button.disabled=false;
  if(error)notice(error.message==='Invalid login credentials'?'이메일과 비밀번호를 확인하세요.':error.message);else showIdentity(data.user.email!);
 };
 el<HTMLButtonElement>('#pvp-signup').onclick=async()=>{if(!authForm.reportValidity())return;const values=new FormData(authForm);el<HTMLButtonElement>('#pvp-signup').disabled=true;
  const {data,error}=await pvpClient.auth.signUp({email:String(values.get('email')),password:String(values.get('password')),options:{emailRedirectTo:location.origin}});el<HTMLButtonElement>('#pvp-signup').disabled=false;
  if(error)notice(error.message);else if(data.session&&data.user?.email)showIdentity(data.user.email);else notice('인증 이메일을 보냈습니다. 이메일 인증 후 이 화면에서 로그인하세요.');
 };
 el('#pvp-signout').onclick=async()=>{await session.close();await pvpClient.auth.signOut();root.remove();openPvp(onExit);};
 const form=el<HTMLFormElement>('#pvp-connect');
 form.onsubmit=async event=>{
  event.preventDefault();const submitter=(event as SubmitEvent).submitter as HTMLButtonElement,values=new FormData(form),name=String(values.get('name')??'').trim(),code=String(values.get('code')??'').trim().toUpperCase();
  if(submitter.value==='join'&&!/^[A-F0-9]{12}$/.test(code)){notice('12자리 방 코드를 입력하세요.');return;}
  form.querySelectorAll('button').forEach(b=>b.disabled=true);notice('작전실 연결 중…');
  try{await session.enter(name,submitter.value==='join'?code:undefined);form.hidden=true;el('#pvp-signout').hidden=true;}catch(error){notice(error instanceof Error?error.message:'접속 실패');await session.close();form.querySelectorAll('button').forEach(b=>b.disabled=false);}
 };
 el<HTMLButtonElement>('#pvp-start').onclick=()=>{el<HTMLButtonElement>('#pvp-start').disabled=true;void session.start().catch(e=>{notice(e.message);el<HTMLButtonElement>('#pvp-start').disabled=false;});};
 el('#pvp-copy').onclick=()=>{void navigator.clipboard.writeText(session.room.code).then(()=>notice('방 코드를 복사했습니다.')).catch(()=>notice(`방 코드: ${session.room.code}`));};
 const close=()=>{closed=true;cancelAnimationFrame(frame);resizeObserver.disconnect();controls?.dispose();world?.dispose();renderer?.dispose();renderer?.forceContextLoss();void session.close();root.remove();document.querySelectorAll<HTMLDialogElement>('.base-dialog').forEach(d=>d.close());onExit();};
 el('#pvp-exit').onclick=close;
 const resize=()=>{if(!renderer||!camera)return;const mount=el('.pvp-viewport'),rect=mount.getBoundingClientRect();renderer.setSize(rect.width,rect.height);camera.aspect=rect.width/Math.max(1,rect.height);camera.updateProjectionMatrix();};
 const resizeObserver=new ResizeObserver(resize);
 function setupBattle(){
  el('.pvp-lobby').hidden=true;el('.pvp-battle').hidden=false;
  const prefs=readPreferences();scene=new THREE.Scene();renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});renderer.setPixelRatio(Math.min(devicePixelRatio,prefs.quality==='high'?2:prefs.quality==='low'?.6:1));renderer.shadowMap.enabled=prefs.quality==='high';renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.05;
  el('.pvp-viewport').append(renderer.domElement);camera=new THREE.PerspectiveCamera(43,1,.1,1800);
  const f=war!.factions[session.faction];camera.position.set(f.x+120,160,f.z+140);controls=new OrbitControls(camera,renderer.domElement);controls.target.set(f.x,0,f.z);controls.enableDamping=true;controls.maxPolarAngle=Math.PI*.46;controls.minDistance=35;controls.maxDistance=850;
  world=createBattleWorld(scene,war!);world.setQuality(prefs.quality==='high');world.setReducedMotion(prefs.reducedMotion);resizeObserver.observe(el('.pvp-viewport'));resize();
  el('#pvp-faction').textContent=`제${session.faction+1}군 지휘부`;el('#pvp-faction').style.color=colors[session.faction];
  const button=(parent:string,label:string,command:PlayerCommand)=>{const b=document.createElement('button');b.className='war-action economy-control';b.textContent=label;b.onclick=()=>send(command);el(parent).append(b);bindings.push({button:b,command});};
  for(const kind of ['infantry','archer','guardian','cavalry'] as UnitKind[]){const d=UNIT_STATS[kind];button('#pvp-army',`${d.label} 10명 모집 · 금 ${d.gold*10} / 식량 ${d.food*10}`,{type:'train',key:kind,amount:10});}
  button('#pvp-army','전 병력 본부 방어',{type:'attack',target:null});
  for(const [key,d] of Object.entries(FACILITY_TYPES).filter(([key])=>['mine','farm','city','barracks','market','tower'].includes(key)))button('#pvp-build',`${d.label} · 금 ${d.gold} / 식량 ${d.food}`,{type:'build',key});
  const inside=document.createElement('button');inside.className='war-action economy-control';inside.textContent='기지 내부 관리';inside.onclick=()=>openBaseInterior(war!,session.faction,(kind,baseId,col,row)=>send({type:'interior',key:kind,baseId,col,row}));el('#pvp-build').prepend(inside);
  for(const key of ['mine','farm','barracks','fort'] as Upgrade[])button('#pvp-economy',`${({mine:'금광',farm:'농장',barracks:'병영',fort:'본부 방어'})[key]} 강화`,{type:'upgrade',key});
  button('#pvp-economy','도시 확장',{type:'develop',key:'city'});button('#pvp-economy','시장 확장',{type:'develop',key:'market'});
  button('#pvp-economy','성장 정책 · 생산 +25%',{type:'policy',key:'growth'});button('#pvp-economy','전시 정책 · 공격 +18%',{type:'policy',key:'war'});
  for(const key of ['miners','farmers'])for(const amount of [-1,1])button('#pvp-economy',`${key==='miners'?'금광':'농장'} 일꾼 ${amount>0?'+1':'−1'}`,{type:'worker',key,amount});
  button('#pvp-economy','식량 60 수출',{type:'export'});
  for(const [key,c] of Object.entries(CONTRACTS))button('#pvp-economy',`${c.label} · 식량 ${c.food} → 금 ${c.gold}`,{type:'contract',key});
  button('#pvp-economy','활성 계약 납품',{type:'deliver'});
  for(const [key,d] of Object.entries(RESEARCH))button('#pvp-research',d.label,{type:'research',key:key as Research});
  for(const p of war!.outposts)el<HTMLSelectElement>('#pvp-target').append(new Option(OUTPOST_NAMES[p.id],String(p.id)));
  el('#pvp-capture').onclick=()=>send({type:'capture',target:Number(el<HTMLSelectElement>('#pvp-target').value)});
  for(const f of war!.factions)if(f.id!==session.faction)button('#pvp-attacks',`제${f.id+1}군 본부 공격`,{type:'attack',target:f.id});
  const raycaster=new THREE.Raycaster(),ground=new THREE.Plane(new THREE.Vector3(0,1,0),0),hit=new THREE.Vector3();
  renderer.domElement.addEventListener('click',event=>{if(!pendingBuild)return;const rect=renderer!.domElement.getBoundingClientRect();raycaster.setFromCamera(new THREE.Vector2((event.clientX-rect.left)/rect.width*2-1,1-(event.clientY-rect.top)/rect.height*2),camera!);if(raycaster.ray.intersectPlane(ground,hit)){send({type:'build',key:pendingBuild,x:Math.round(hit.x),z:Math.round(hit.z)});pendingBuild=null;notice('지정 위치에 건설 명령을 전송했습니다.');}});
  el<HTMLCanvasElement>('#pvp-map').onclick=event=>{const rect=el('#pvp-map').getBoundingClientRect(),p=minimapToWorld(event.clientX-rect.left,event.clientY-rect.top,rect.width,rect.height),target=pickMapTarget(war!,session.faction,p.x,p.z);if(pendingBuild){send({type:'build',key:pendingBuild,x:p.x,z:p.z});pendingBuild=null;}else if(target)send({type:target.kind==='outpost'?'capture':'attack',target:target.id});else{controls!.target.set(p.x,0,p.z);camera!.position.set(p.x+90,130,p.z+110);}};
  updateUI();
  const animate=(now:number)=>{if(closed)return;controls!.update();world!.update(.016);renderer!.render(scene!,camera!);if(now-lastUI>250){lastUI=now;updateUI();}frame=requestAnimationFrame(animate);};frame=requestAnimationFrame(animate);
 }
 function updateUI(){
  if(!war)return;const f=war.factions[session.faction],income=getIncome(war,session.faction),units=war.units.filter(u=>u.owner===session.faction).length;
  el('#pvp-resources').textContent=`금 ${Math.floor(f.gold)} (+${income.gold.toFixed(1)}/초) · 식량 ${Math.floor(f.food)} (+${income.food.toFixed(1)}/초) · 병력 ${units}/400 · 본부 ${Math.ceil(f.hp)}`;
  el('#pvp-facilities').textContent=`시설 ${facilitiesFor(war,session.faction).length+1}/30 · 건설 중 ${facilitiesFor(war,session.faction).filter(b=>b.remaining>0).length}`;
  el('#pvp-situation').textContent=war.over?(war.winner===session.faction?'작전 성공 · 최후의 생존 세력':`작전 종료 · ${war.winner===null?'승자 없음':`제${war.winner+1}군 승리`}`):!f.alive?'본부 함락 · 관전 중':`${Math.floor(war.time/60)}:${String(Math.floor(war.time%60)).padStart(2,'0')} · 생존 세력 ${war.factions.filter(f=>f.alive).length}/4`;
  bindings.forEach(({button})=>{button.disabled=war!.over||!f.alive;});
  const ctx=el<HTMLCanvasElement>('#pvp-map').getContext('2d')!;ctx.fillStyle='#151e23';ctx.fillRect(0,0,256,256);ctx.strokeStyle='#8c9e88';ctx.beginPath();ctx.arc(128,128,war.zone/MAP_HALF_SIZE*128,0,Math.PI*2);ctx.stroke();
  for(const p of war.outposts){const v=worldToMinimap(p.x,p.z,256);ctx.fillStyle=p.owner===null?'#808080':colors[p.owner];ctx.fillRect(v.x-3,v.y-3,6,6);}
  for(const b of war.facilities??[]){const v=worldToMinimap(b.x,b.z,256);ctx.fillStyle=colors[b.owner];ctx.fillRect(v.x-2,v.y-2,4,4);}
  for(const u of war.units){const v=worldToMinimap(u.x,u.z,256);ctx.fillStyle=colors[u.owner];ctx.fillRect(v.x,v.y,1.5,1.5);}
  for(const b of war.factions){const v=worldToMinimap(b.x,b.z,256);ctx.fillStyle=colors[b.id];ctx.fillRect(v.x-4,v.y-4,8,8);}
 }
}
