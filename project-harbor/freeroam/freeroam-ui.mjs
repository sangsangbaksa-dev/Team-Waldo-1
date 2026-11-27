import { createFreeRoam } from './freeroam-domain.mjs';
function installFreeRoam(createFreeRoam) {
  const key="harbor.freeroam.v1";
  const hud=document.getElementById("hud");
  if(!hud)return;
  const panel=document.createElement("aside");panel.id="harbor-freeroam";
  panel.setAttribute("aria-label","자유 탐험");
  panel.style.cssText="position:absolute;top:calc(env(safe-area-inset-top) + 7rem);right:12px;width:min(240px,44vw);padding:9px 11px;background:rgba(15,24,27,.86);border:1px solid #627578;color:#e7ece9;font:12px/1.5 system-ui,sans-serif;z-index:5;pointer-events:none;box-sizing:border-box";
  const heading=document.createElement("strong");heading.textContent="자유 탐험";heading.style.cssText="font-size:13px;display:block;margin-bottom:3px";
  const body=document.createElement("div");body.style.whiteSpace="pre-line";
  const action=document.createElement("button");action.type="button";action.textContent="K · 주행 도전";action.style.cssText="pointer-events:auto;display:block;margin-top:6px;color:inherit;background:#283d40;border:1px solid #748789;padding:5px 8px;font:inherit;cursor:pointer";
  const info=document.createElement("div");info.style.cssText="color:#e6c183;margin-top:4px;min-height:1.4em";info.setAttribute("role","status");
  panel.append(heading,body,action,info);hud.append(panel);
  let game,frame,last=performance.now(),version=null;
  const meters=n=>Math.round(n)+"m";
  const bearing=(x,z,p)=>["북","북동","동","남동","남","남서","서","북서"][(Math.round(Math.atan2(x-p.x,-(z-p.z))*4/Math.PI)+8)%8];
  const toggle=()=>{if(game&&frame&&!hud.hidden&&!document.hidden){game.toggle(frame);render();}};
  action.addEventListener("pointerdown",e=>e.stopPropagation());
  action.addEventListener("click",toggle);
  document.addEventListener("keydown",e=>{if(e.code==="KeyK"&&!e.repeat&&!e.ctrlKey&&!e.metaKey&&!e.altKey&&!hud.hidden){e.preventDefault();toggle();}});
  document.getElementById("reset")?.addEventListener("click",()=>{game?.cancel();version=null;});
  function render(){
    const v=game?.view(frame);if(!v)return;
    const p=frame.state.isDriving?frame.state.vehicle.position:frame.position;
    const lines=["명소 "+v.visited+" / "+v.total];
    if(v.landmark){const [x,,z]=v.landmark.item.position;lines.push(v.landmark.item.name+" · "+bearing(x,z,p)+" "+meters(v.landmark.distance));}
    if(v.target){const [x,z]=v.target.point;lines.push((v.active?"다음 체크포인트":v.target.item.name)+" · "+bearing(x,z,p)+" "+meters(v.target.distance));}
    if(v.active)lines.push("통과 "+v.active.index+"/"+v.active.total+" · 남은 "+Math.ceil(v.active.remaining)+"초");
    else if(v.target){const best=v.record.best[v.target.item.id];if(best)lines.push("코스 최고 "+best.toFixed(1)+"초");}
    if(v.trap){const t=v.trap.item;lines.push("속도 기록 지점 · "+bearing(t.x,t.z,p)+" "+meters(v.trap.distance));if(v.record.speeds[t.id])lines.push(t.name+" 최고 "+v.record.speeds[t.id]+" km/h");}
    const value=lines.join("\n");if(body.textContent!==value)body.textContent=value;
    if(info.textContent!==v.msg)info.textContent=v.msg;
    action.textContent=v.active?"K · 도전 종료":"K · 주행 도전";
    action.disabled=!frame.alive;
  }
  fetch(new URL("world/harbor_front.json",document.baseURI)).then(r=>{if(!r.ok)throw Error("map");return r.json();}).then(layout=>{
    let saved={};try{saved=JSON.parse(localStorage.getItem(key)||"{}")||{};}catch{}
    game=createFreeRoam(layout,saved);
    setInterval(()=>{
      const now=performance.now(),dt=(now-last)/1000;last=now;
      if(hud.hidden||document.hidden||globalThis.harborView?.screen()!=="play")return;
      try{
        const next=globalThis.harborView.frameVersion();
        if(next===version)return;
        version=next;frame=JSON.parse(globalThis.harborView.frame());
        if(game.update(frame,dt)){try{localStorage.setItem(key,JSON.stringify(game.record));}catch{}}
        render();
      }catch{}
    },100);
  }).catch(()=>{panel.hidden=true;});
}
installFreeRoam(createFreeRoam);
