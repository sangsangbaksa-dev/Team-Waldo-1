import * as T from 'three';
import {DISTRICTS,WIDTH,DEPTH,roadHalf,districtAt} from './domain';
import {World} from './application';
import {ThreeChunks} from './infrastructure';

function required<E extends HTMLElement>(id:string):E {
  const el=document.getElementById(id);if(!el)throw new Error('Missing '+id);return el as E;
}
function drawMap(canvas:HTMLCanvasElement,world:World,full:boolean){
  const ctx=canvas.getContext('2d');if(!ctx)return;
  const w=canvas.width,h=canvas.height;
  const scale=full?Math.min(w/WIDTH,h/DEPTH):w/360;
  const ox=full?(w-WIDTH*scale)/2:w/2-world.x*scale;
  const oz=full?(h-DEPTH*scale)/2:h/2-world.z*scale;
  ctx.fillStyle='#192322';ctx.fillRect(0,0,w,h);
  ctx.save();ctx.translate(ox,oz);ctx.scale(scale,scale);
  for(const district of DISTRICTS){
    ctx.fillStyle='#'+district.color.toString(16).padStart(6,'0');
    ctx.fillRect(district.x-512,district.z-512,1024,1024);
  }
  ctx.strokeStyle='#303537';
  for(let x=64;x<WIDTH;x+=256){ctx.lineWidth=roadHalf('x',x)*2;ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,DEPTH);ctx.stroke();}
  for(let z=64;z<DEPTH;z+=256){ctx.lineWidth=roadHalf('z',z)*2;ctx.beginPath();ctx.moveTo(0,z);ctx.lineTo(WIDTH,z);ctx.stroke();}
  ctx.restore();
  if(full){
    ctx.font='bold 15px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';
    for(const d of DISTRICTS){ctx.lineWidth=4;ctx.strokeStyle='#202521';ctx.fillStyle='#fff';ctx.strokeText(d.name,ox+d.x*scale,oz+d.z*scale);ctx.fillText(d.name,ox+d.x*scale,oz+d.z*scale);}
  }
  ctx.save();ctx.translate(ox+world.x*scale,oz+world.z*scale);ctx.rotate(world.yaw);
  ctx.beginPath();ctx.moveTo(0,-9);ctx.lineTo(6,7);ctx.lineTo(0,4);ctx.lineTo(-6,7);ctx.closePath();ctx.fillStyle='#fff';ctx.strokeStyle='#1b2424';ctx.lineWidth=2;ctx.fill();ctx.stroke();ctx.restore();
}
function start(){
  const host=required<HTMLElement>('harbor-world-stage'), mini=required<HTMLCanvasElement>('harbor-world-mini');
  const atlas=required<HTMLCanvasElement>('harbor-world-atlas'), overlay=required<HTMLElement>('harbor-world-overlay');
  const hud=required<HTMLElement>('harbor-world-status'), keys=new Set<string>();
  const scene=new T.Scene(),camera=new T.PerspectiveCamera(65,1,.2,430);
  const renderer=new T.WebGLRenderer({antialias:true,powerPreference:'high-performance'});
  renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.outputColorSpace=T.SRGBColorSpace;
  renderer.domElement.tabIndex=0;renderer.domElement.setAttribute('aria-label','Project Harbor 3D 탐험 화면');
  host.prepend(renderer.domElement);
  const sky=new T.HemisphereLight(0xc8e5ff,0x8c8067,1.9),sun=new T.DirectionalLight(0xffe2bd,2.2);
  scene.add(sky,sun);scene.fog=new T.FogExp2(0x9daebc,.004);
  const world=new World(new ThreeChunks(scene));
  const avatar=new T.Group();
  const body=new T.Mesh(new T.CapsuleGeometry(.38,.9,4,8),new T.MeshStandardMaterial({color:0x344b58}));
  body.position.y=1;avatar.add(body);
  const head=new T.Mesh(new T.SphereGeometry(.27,10,8),new T.MeshStandardMaterial({color:0xc59c78}));
  head.position.y=1.9;avatar.add(head);scene.add(avatar);
  const resize=()=>{const w=Math.max(1,host.clientWidth),h=Math.max(1,host.clientHeight);renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();};
  new ResizeObserver(resize).observe(host);resize();
  let mapOpen=false,drag=false,lastX=0,previous=performance.now(),hudAt=0;
  const toggleMap=()=>{mapOpen=!mapOpen;overlay.hidden=!mapOpen;keys.clear();if(mapOpen)drawMap(atlas,world,true);else renderer.domElement.focus();};
  required('harbor-world-map-button').addEventListener('click',toggleMap);
  required('harbor-world-close-map').addEventListener('click',toggleMap);
  window.addEventListener('keydown',e=>{
    if(!host.contains(document.activeElement)&&!mapOpen)return;
    if(['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','ShiftLeft','ShiftRight','KeyM','Escape'].includes(e.code)){
      e.preventDefault();if(e.code==='KeyM'&&!e.repeat){toggleMap();return;}if(e.code==='Escape'&&mapOpen){toggleMap();return;}
      if(!mapOpen)keys.add(e.code);
    }
  });
  window.addEventListener('keyup',e=>keys.delete(e.code));
  window.addEventListener('blur',()=>{keys.clear();drag=false;});
  renderer.domElement.addEventListener('pointerdown',e=>{renderer.domElement.focus();drag=true;lastX=e.clientX;renderer.domElement.setPointerCapture(e.pointerId);});
  renderer.domElement.addEventListener('pointermove',e=>{if(drag){world.yaw+=(e.clientX-lastX)*.007;lastX=e.clientX;}});
  renderer.domElement.addEventListener('pointerup',()=>{drag=false;});
  renderer.domElement.addEventListener('pointercancel',()=>{drag=false;});
  renderer.domElement.addEventListener('lostpointercapture',()=>{drag=false;});
  const target=new T.Vector3(),desired=new T.Vector3(),day=new T.Color(0xa6c8df),night=new T.Color(0x142039),color=new T.Color();
  const has=(a:string,b:string)=>Number(keys.has(a)||keys.has(b));
  world.stream(9);
  camera.position.set(world.x,world.y+6,world.z+10);
  function frame(now:number){
    const dt=Math.min(.05,Math.max(0,(now-previous)/1000));previous=now;
    if(!mapOpen){
      world.yaw+=(Number(keys.has('ArrowRight'))-Number(keys.has('ArrowLeft')))*dt*1.7;
      world.move(has('KeyW','ArrowUp')-has('KeyS','ArrowDown'),Number(keys.has('KeyD'))-Number(keys.has('KeyA')),dt,keys.has('ShiftLeft')||keys.has('ShiftRight'));
    }
    world.stream();
    avatar.position.set(world.x,world.y,world.z);avatar.rotation.y=-world.yaw;
    target.set(world.x,world.y+1.5,world.z);
    desired.set(world.x-Math.sin(world.yaw)*9,world.y+5.3,world.z+Math.cos(world.yaw)*9);
    camera.position.lerp(desired,1-Math.exp(-dt*13));camera.lookAt(target);
    const angle=(world.hours-6)*Math.PI/12,brightness=Math.max(.08,Math.min(1,Math.sin(angle)*1.5+.15));
    sky.intensity=.35+brightness*1.65;sun.intensity=.08+brightness*2.1;
    sun.position.set(Math.cos(angle)*150,Math.max(12,Math.sin(angle)*180),75);
    color.copy(night).lerp(day,brightness);scene.background=color; if(scene.fog)scene.fog.color.copy(color);
    if(now-hudAt>100){
      hudAt=now;drawMap(mini,world,false);
      const hours=Math.floor(world.hours),minutes=Math.floor((world.hours-hours)*60);
      hud.textContent=districtAt(world.x,world.z).name+' · '+String(hours).padStart(2,'0')+':'+String(minutes).padStart(2,'0')+' · 청크 '+world.activeChunks;
    }
    renderer.render(scene,camera);requestAnimationFrame(frame);
  }
  renderer.domElement.focus();requestAnimationFrame(frame);
}
required<HTMLButtonElement>('harbor-world-start').addEventListener('click',()=>{
  const button=required<HTMLButtonElement>('harbor-world-start');
  const stage=required<HTMLElement>('harbor-world-stage');
  button.disabled=true;stage.hidden=false;
  try{start();button.hidden=true;stage.scrollIntoView({block:'start'});}
  catch(error){stage.hidden=true;button.disabled=false;required('harbor-world-error').textContent='3D 화면을 시작하지 못했습니다. WebGL 지원 브라우저인지 확인하세요.';console.error(error);}
},{once:false});
