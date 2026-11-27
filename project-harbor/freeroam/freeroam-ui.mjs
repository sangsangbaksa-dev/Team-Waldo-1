import { createFreeRoam } from './freeroam-domain.mjs';
function installFreeRoam(createFreeRoam) {
  const key="harbor.freeroam.v1";
  const hud=document.getElementById("hud");
  if(!hud)return;
  const panel=document.createElement("aside");panel.id="harbor-freeroam";
  panel.setAttribute("aria-label","자유 탐험");
  panel.style.cssText="position:absolute;top:calc(var(--edge,16px) + 154px);left:var(--edge,16px);width:min(240px,44vw);padding:9px 11px;background:rgba(15,24,27,.86);border:1px solid #627578;color:#e7ece9;font:12px/1.5 system-ui,sans-serif;z-index:5;pointer-events:none;box-sizing:border-box";
  const heading=document.createElement("strong");heading.textContent="자유 탐험";heading.style.cssText="font-size:13px;display:block;margin-bottom:3px";
  const body=document.createElement("div");body.style.whiteSpace="pre-line";
  const action=document.createElement("button");action.type="button";action.textContent="K · 주행 도전";action.style.cssText="pointer-events:auto;display:block;margin-top:6px;color:inherit;background:#283d40;border:1px solid #748789;padding:5px 8px;font:inherit;cursor:pointer";
  const info=document.createElement("div");info.style.cssText="color:#e6c183;margin-top:4px;min-height:1.4em";info.setAttribute("role","status");
  panel.append(heading,body,action,info);hud.append(panel);
  let game,frame,last=performance.now(),version=null,lastWrite=0,pendingSave=false;
  const flush=()=>{if(!game)return;try{localStorage.setItem(key,JSON.stringify(game.record));pendingSave=false;lastWrite=performance.now();}catch{}};
  window.addEventListener("pagehide",flush);
  document.addEventListener("visibilitychange",()=>{if(document.hidden)flush();});
  const meters=n=>Math.round(n)+"m";
  const bearing=(x,z,p)=>["북","북동","동","남동","남","남서","서","북서"][(Math.round(Math.atan2(x-p.x,-(z-p.z))*4/Math.PI)+8)%8];
  const toggle=()=>{if(game&&frame&&!hud.hidden&&!document.hidden){game.toggle(frame);render();}};
  action.addEventListener("pointerdown",e=>e.stopPropagation());
  action.addEventListener("click",toggle);
  document.addEventListener("keydown",e=>{if(e.code==="KeyK"&&!e.repeat&&!e.ctrlKey&&!e.metaKey&&!e.altKey&&!hud.hidden){e.preventDefault();toggle();}});
  document.getElementById("reset")?.addEventListener("click",()=>{game?.reset();version=null;routeSelect.value="";landmarkSelect.value="";flush();});
  const mapPanel=document.querySelector("#map .map-panel");
  const details=document.createElement("details");details.style.cssText="border-top:1px solid var(--line,#ffffff2b);margin-top:10px;padding-top:10px;font-size:13px";
  const title=document.createElement("summary");title.textContent="자유 탐험 · 도시 기록";
  const routeSelect=document.createElement("select"),landmarkSelect=document.createElement("select"),stats=document.createElement("p"),records=document.createElement("p");
  const selectStyle="max-width:100%;display:block;margin:8px 0;padding:8px;background:#15242b;color:#fff6e8;border:1px solid #ffffff35;border-radius:4px";
  routeSelect.style.cssText=landmarkSelect.style.cssText=selectStyle;
  routeSelect.setAttribute("aria-label","주행 코스");landmarkSelect.setAttribute("aria-label","탐험 목적지");
  const option=(select,value,label)=>{const el=document.createElement("option");el.value=value;el.textContent=label;select.append(el);};
  option(routeSelect,"","가장 가까운 주행 코스");option(landmarkSelect,"","가장 가까운 미발견 명소");
  routeSelect.addEventListener("change",()=>{game?.selectRoute(routeSelect.value);render();});
  landmarkSelect.addEventListener("change",()=>{game?.selectLandmark(landmarkSelect.value);render();});
  const instruction=document.createElement("p");instruction.textContent="목적지 또는 코스를 고르면 HUD에서 방향을 안내합니다. 차량으로 출발점에 도착해 K를 누르세요.";
  stats.style.whiteSpace=records.style.whiteSpace="pre-line";stats.style.marginTop=records.style.marginTop="8px";
  details.append(title,instruction,routeSelect,landmarkSelect,stats,records);mapPanel?.append(details);
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
    const trip=v.record.trip;
    stats.textContent="도보 "+(trip.walk/1000).toFixed(2)+"km · 운전 "+(trip.drive/1000).toFixed(2)+"km\n최고 속도 "+trip.topSpeed+" km/h · 추격 탈출 "+trip.escapes+"회";
    records.textContent=game.routes.map(r=>r.name+" · "+(v.record.best[r.id]?v.record.best[r.id].toFixed(1)+"초":"미완주")).join("\n");
  }
  fetch(new URL("world/harbor_front.json",document.baseURI)).then(r=>{if(!r.ok)throw Error("map");return r.json();}).then(layout=>{
    let saved={};try{saved=JSON.parse(localStorage.getItem(key)||"{}")||{};}catch{}
    game=createFreeRoam(layout,saved);
    for(const r of game.routes)option(routeSelect,r.id,r.name);
    for(const p of game.points)option(landmarkSelect,p.id,p.name);
    setInterval(()=>{
      const now=performance.now(),dt=(now-last)/1000;last=now;
      if(pendingSave&&now-lastWrite>1500)flush();
      if(hud.hidden||document.hidden||globalThis.harborView?.screen()!=="play")return;
      try{
        const next=globalThis.harborView.frameVersion();
        if(next===version)return;
        version=next;frame=JSON.parse(globalThis.harborView.frame());
        if(game.update(frame,dt))pendingSave=true;
        render();
      }catch{}
    },100);
  }).catch(()=>{panel.hidden=true;});
}
installFreeRoam(createFreeRoam);
