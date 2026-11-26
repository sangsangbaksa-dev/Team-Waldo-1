import { createWorld, district, footClear, interact, nearestVehicle, update } from './application.js';
import { createRenderer } from './renderer.js';
import { LIMIT } from './domain.js';
import { createMotor, driveResidents, Residents, stepMotor } from '../characters/application.ts';
import { ENTER_SECONDS, EXIT_SECONDS } from '../characters/domain.ts';
const LOCALES={숲:'forest',도시:'city',부촌:'rich',사막:'desert',빈민가:'slum',군사기지:'base'};
const STEP=1/60;
export function mountHarbor(root){
  const world=createWorld();
  root.innerHTML='<div class="drive-view"></div><div class="drive-hud"><div class="drive-place"></div><div class="drive-speed"></div><div class="drive-health"></div><div class="drive-notice" aria-live="polite"></div></div><canvas class="drive-map" width="156" height="156" aria-label="지역 지도"></canvas><div class="drive-actions"><button type="button" data-action="interact">승하차 E</button><button type="button" data-action="punch">주먹 F</button><button type="button" data-action="camera">카메라 C</button><button type="button" data-action="exit">종료 Esc</button></div><div class="drive-help">WASD 이동·운전 · Shift 달리기 · Space 점프/브레이크 · F 주먹 · E 승차 · 마우스 드래그 시점</div><div class="drive-touch"><div><button data-key="KeyA">◀</button><button data-key="KeyD">▶</button></div><div><button data-key="Space">점프</button><button data-key="KeyF">주먹</button><button data-key="KeyS">후진</button><button data-key="KeyW">가속</button></div></div>';
  const view=root.querySelector('.drive-view'),place=root.querySelector('.drive-place'),speed=root.querySelector('.drive-speed'),health=root.querySelector('.drive-health'),notice=root.querySelector('.drive-notice');
  const map=root.querySelector('.drive-map').getContext('2d');
  let renderer;
  try{renderer=createRenderer(view,world);}catch(error){root.innerHTML='<div class="drive-error">3D 화면을 시작하지 못했습니다. WebGL 지원 및 하드웨어 가속 설정을 확인하세요. <button type="button">돌아가기</button></div>';root.querySelector('button').onclick=()=>root.dispatchEvent(new Event('harbor-exit'));console.error(error);return ()=>{root.replaceChildren();};}
  const residents=new Residents('drive');
  residents.load(driveResidents({roads:[-180,-90,0,90,180],limit:LIMIT,sidewalk:10.6,localeAt:(x,z)=>LOCALES[district(x,z).name],avoid:(x,z)=>footClear(world,x,z),capPerLocale:3}));
  if(import.meta.env.DEV) globalThis.__harborDrive={residents,world};
  let motor=createMotor(),jumpEdge=false,punchEdge=false;
  const keys=new Set(),abort=new AbortController(),signal=abort.signal;
  let mode=0,orbit=0,drag=null,frame=0,last=performance.now(),acc=0,closed=false,hudTime=0;
  const exit=()=>root.dispatchEvent(new Event('harbor-exit'));
  const camera=()=>{mode=(mode+1)%3;orbit=0;};
  const controls=new Set(['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','ShiftLeft','ShiftRight','Space','KeyE','KeyF','KeyC','Escape']);
  window.addEventListener('keydown',e=>{if(!controls.has(e.code))return;e.preventDefault();keys.add(e.code);if(!e.repeat){if(e.code==='KeyE')interact(world);if(e.code==='KeyF')punchEdge=true;if(e.code==='Space')jumpEdge=true;if(e.code==='KeyC')camera();if(e.code==='Escape')exit();}},{signal});
  window.addEventListener('keyup',e=>keys.delete(e.code),{signal});
  window.addEventListener('blur',()=>{keys.clear();drag=null;},{signal});
  document.addEventListener('visibilitychange',()=>{keys.clear();last=performance.now();acc=0;},{signal});
  view.addEventListener('pointerdown',e=>{drag={id:e.pointerId,x:e.clientX};try{view.setPointerCapture(e.pointerId);}catch(error){void error;}},{signal});
  view.addEventListener('pointermove',e=>{if(drag?.id===e.pointerId){orbit-= (e.clientX-drag.x)*.008;drag.x=e.clientX;}},{signal});
  for(const event of ['pointerup','pointercancel','lostpointercapture'])view.addEventListener(event,()=>{drag=null;},{signal});
  for(const button of root.querySelectorAll('[data-key]')){
    const key=button.dataset.key;
    button.addEventListener('pointerdown',e=>{e.preventDefault();keys.add(key);if(key==='Space')jumpEdge=true;if(key==='KeyF')punchEdge=true;try{button.setPointerCapture(e.pointerId);}catch(error){void error;}},{signal});
    for(const event of ['pointerup','pointercancel','lostpointercapture'])button.addEventListener(event,()=>keys.delete(key),{signal});
  }
  root.querySelector('[data-action=interact]').addEventListener('click',()=>interact(world),{signal});
  root.querySelector('[data-action=punch]').addEventListener('click',()=>{punchEdge=true;},{signal});
  root.querySelector('[data-action=camera]').addEventListener('click',camera,{signal});
  root.querySelector('[data-action=exit]').addEventListener('click',exit,{signal});
  function axis(a,b,c,d){return Number(keys.has(a)||keys.has(b))-Number(keys.has(c)||keys.has(d));}
  function getInput(){
    const throttle=axis('KeyW','ArrowUp','KeyS','ArrowDown'),steer=axis('KeyD','ArrowRight','KeyA','ArrowLeft');
    return {throttle,steer,handbrake:keys.has('Space')&&!!world.player.vehicle,moveX:steer*Math.cos(orbit)+throttle*Math.sin(orbit),moveZ:throttle*Math.cos(orbit)-steer*Math.sin(orbit),run:keys.has('ShiftLeft')||keys.has('ShiftRight')};
  }
  function drawHud(){
    const p=world.player,v=p.vehicle,near=!v&&nearestVehicle(world,3.5);
    place.textContent='PORT CALLOWAY / '+district(p.x,p.z).name;
    const pace={idle:'도보',walk:'걷기',run:'달리기',jump:'점프',punch:'주먹',enter:'탑승',talk:'대화',phone:'통화'};
    speed.textContent=v?Math.round(Math.hypot(v.vx,v.vz)*3.6)+' km/h · '+v.spec.name:(pace[motor.clip]||'도보');
    const spaceButton=root.querySelector('[data-key=Space]');
    if(spaceButton)spaceButton.textContent=v?'브레이크':'점프';
    health.textContent=v?'차량 상태 '+Math.round(v.health)+'%'+(v.health<=0?' · 운행 불가':''):'자유 탐험';
    notice.textContent=world.time<world.noticeUntil?world.notice:near?(near.driver?'E · 운전자 끌어내리기':'E · '+near.spec.name+' 탑승'):'';
    if(!map)return;
    const size=156,scale=size/(LIMIT*2),point=n=>(n+LIMIT)*scale;
    map.fillStyle='#252e30';map.fillRect(0,0,size,size);
    const colors=['#526d45','#68736c','#708454','#b7a071','#82766c','#85856c'];
    for(let i=0;i<6;i++){map.fillStyle=colors[i];map.fillRect(i%3*52,Math.floor(i/3)*78,52,78);}
    map.strokeStyle='#45494a';map.lineWidth=4;
    for(let i=0;i<=6;i++){const n=i*26;map.beginPath();map.moveTo(n,0);map.lineTo(n,size);map.moveTo(0,n);map.lineTo(size,n);map.stroke();}
    map.fillStyle='#e2c99a';for(const car of world.vehicles)map.fillRect(point(car.x)-1,point(car.z)-1,2,2);
    map.fillStyle='#f0d48a';for(const person of residents.list)map.fillRect(point(person.x)-1,point(person.z)-1,2,2);
    map.save();map.translate(point(p.x),point(p.z));map.rotate(-p.yaw);map.fillStyle='#fff';map.beginPath();map.moveTo(0,5);map.lineTo(-3,-4);map.lineTo(3,-4);map.closePath();map.fill();map.restore();
  }
  function tick(now){
    if(closed)return;
    const dt=Math.min(.1,Math.max(0,(now-last)/1000));last=now;acc+=dt;
    const input=getInput();
    let boardT=-1,exitT=-1;
    while(acc>=STEP){
      update(world,input,STEP);
      const p=world.player,onFoot=!p.vehicle;
      boardT=p.vehicle&&p.boardedAt!=null?(world.time-p.boardedAt)/ENTER_SECONDS:-1;
      exitT=!p.vehicle&&p.exitedAt!=null?(world.time-p.exitedAt)/EXIT_SECONDS:-1;
      const enter=boardT>=0&&boardT<1?boardT:exitT>=0&&exitT<1?1-exitT:null;
      motor=stepMotor(motor,{moving:onFoot&&enter==null&&!!(input.moveX||input.moveZ),sprint:!!input.run,jump:onFoot&&enter==null&&jumpEdge,punch:onFoot&&enter==null&&punchEdge,enter},STEP);
      jumpEdge=false;punchEdge=false;
      residents.step(STEP,{x:p.x,z:p.z},(x,z)=>footClear(world,x,z));
      acc-=STEP;
    }
    if(world.player.vehicle&&drag===null)orbit*=Math.exp(-dt*.8);
    const p=world.player;
    boardT=p.vehicle&&p.boardedAt!=null?(world.time-p.boardedAt)/ENTER_SECONDS:-1;
    exitT=!p.vehicle&&p.exitedAt!=null?(world.time-p.exitedAt)/EXIT_SECONDS:-1;
    try{renderer.draw(dt,mode,orbit,{motor,residents:residents.list,boardT,exitT});}
    catch(error){console.error(error);exit();return;}
    hudTime+=dt;if(hudTime>.1){drawHud();hudTime=0;}
    frame=requestAnimationFrame(tick);
  }
  drawHud();frame=requestAnimationFrame(tick);
  const canvas=view.querySelector('canvas');
  canvas?.addEventListener('webglcontextlost',event=>{
    event.preventDefault();closed=true;cancelAnimationFrame(frame);
    root.innerHTML='<div class="drive-error">그래픽 연결이 끊어졌습니다. <button type="button">돌아가기</button></div>';
    root.querySelector('button').onclick=()=>root.dispatchEvent(new Event('harbor-exit'));
  },{signal});
  return ()=>{closed=true;cancelAnimationFrame(frame);abort.abort();keys.clear();try{renderer.dispose();}catch(error){console.error(error);}root.replaceChildren();};
}
const root=document.getElementById('harbor-drive'),start=document.getElementById('harbor-start');
let stop=null;
window.addEventListener('harbor-mode',event=>{
  if(event.detail==='drive'||!stop||!root)return;
  stop();stop=null;root.hidden=true;document.body.classList.remove('harbor-driving');
});
start?.addEventListener('click',()=>{
  if(stop||!root)return;
  window.dispatchEvent(new CustomEvent('harbor-mode',{detail:'drive'}));
  root.hidden=false;document.body.classList.add('harbor-driving');stop=mountHarbor(root);root.focus();
});
root?.addEventListener('harbor-exit',()=>{
  stop?.();stop=null;root.hidden=true;document.body.classList.remove('harbor-driving');start?.focus();
});
